// JSBin 统一编译器 - 重构版
// 将 JavaScript 源码编译为各平台可执行文件
//
// 模块化结构:
// - core/: 上下文、平台、类型、代码生成
// - expressions/: 表达式编译
// - functions/: 函数和语句编译
// - output/: 库文件、包装器、二进制生成

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

// 语言前端
import { Lexer, Parser } from "../lang/index.js";
import { analyzeCapturedVariables, analyzeSharedVariables, analyzeTopLevelSharedVariables } from "../lang/analysis/closure.js";

console.log("DEBUG: compiler/index.js loaded");

// 虚拟机和汇编器
import { VirtualMachine, VReg } from "../vm/index.js";
import { ARM64Assembler } from "../asm/arm64.js";
import { X64Assembler } from "../asm/x64.js";

// 运行时
import { AllocatorGenerator, RuntimeGenerator, NumberGenerator, StringConstantsGenerator, AsyncGenerator } from "../runtime/index.js";

// 编译上下文和平台
import { CompileContext, CompileOptions, CompileResult } from "./core/context.js";
import { detectPlatform, getTargetInfo, resolveTarget, listTargets, TARGETS } from "./core/platform.js";

// 编译器模块
import { StatementCompiler } from "./functions/statements.js";
import { ExpressionCompiler } from "./expressions/expressions.js";
import { FunctionCompiler } from "./functions/functions.js";
import { isAsyncFunction } from "./async/index.js";

// 输出模块
import { parseJslibFile, LibraryManager } from "./output/library.js";
import { WrapperGenerator } from "./output/wrapper.js";
import { BinaryOutputGenerator } from "./output/generator.js";

// 静态链接器
import { StaticLinker } from "../binary/static_linker.js";

// 重新导出
export { detectPlatform, getTargetInfo, resolveTarget, listTargets, TARGETS } from "./core/platform.js";
export { CompileContext, CompileOptions, CompileResult } from "./core/context.js";
export { BinaryGenerator, OutputType, pageAlign, align16, align } from "../binary/binary_format.js";
export { parseJslibFile, LibraryManager } from "./output/library.js";

// Box 对象布局：存储被捕获变量的包装对象
const BOX_VALUE_OFFSET = 0;

// 目标平台配置
const Targets = {
    "linux-arm64": { arch: "arm64", os: "linux", ext: "" },
    "linux-x64": { arch: "x64", os: "linux", ext: "" },
    "macos-arm64": { arch: "arm64", os: "macos", ext: "" },
    "macos-x64": { arch: "x64", os: "macos", ext: "" },
    "windows-x64": { arch: "x64", os: "windows", ext: ".exe" },
};

export class Compiler {
    constructor(target) {
        this.target = target || "linux-arm64";
        const targetInfo = Targets[this.target];
        if (!targetInfo) {
            throw new Error("Unknown target: " + target);
        }

        this.arch = targetInfo.arch;
        this.os = targetInfo.os;

        // 创建汇编器
        this._initAssembler();

        // 创建虚拟机 (VM 内部创建 backend)
        this.vm = new VirtualMachine(this.arch, this.os, this.asm);
        this.ctx = new CompileContext("main");

        // 库管理器
        this.libManager = new LibraryManager();
        this.staticLibs = [];

        this.compiledFiles = new Set();
        // Node.js compatibility module path
        this.nodeShimPath = path.resolve(process.cwd(), "runtime/node/index.js");

        // 待处理的函数表达式
        this.pendingFunctions = [];
        this.labelCounter = 0;

        // 输出配置
        this.outputType = "executable";
        this.exports = [];
        this.libraries = [];
        this.libraryPaths = [];
        this.sourcePath = "";
        this.options = {}; // 编译选项

        // 兼容旧 API
        this.externalLibs = this.libManager.externalLibs;
        this.staticLibs = [];
        this.registeredDylibs = this.libManager.registeredDylibs;
        
        // 确保 C 标准库被链接以支持依赖环境的 pow/sprintf
        if (this.os === "macos") {
             this.libManager.registerDylib("/usr/lib/libSystem.B.dylib");
        } else if (this.os === "linux") {
             this.libManager.registerDylib("libc.so.6");
             this.libManager.registerDylib("libm.so.6");
        }
    }

    _initAssembler() {
        if (this.arch === "arm64") {
            this.asm = new ARM64Assembler();
        } else {
            this.asm = new X64Assembler();
        }
    }

    // ========== 配置方法 ==========

    setSourcePath(sourcePath) {
        this.sourcePath = path.dirname(sourcePath);
    }

    setOutputType(type) {
        this.outputType = type;
    }

    addExport(name) {
        console.log("DEBUG: addExport: " + name);
        this.exports.push(name);
    }

    addLibrary(name) {
        this.libraries.push(name);
    }

    addLibraryPath(p) {
        this.libraryPaths.push(p);
    }

    setOption(key, value) {
        this.options[key] = value;
    }

    getOption(key) {
        return this.options[key];
    }

    addExternalLib(libInfo) {
        this.libManager.addExternalLib(libInfo);
    }

    addStaticLib(libInfo) {
        this.staticLibs.push(libInfo);
    }

    // ========== 导入处理 ==========

    compileImportLibDeclaration(stmt) {
        let jslibPath = stmt.libPath;
        let libInfo = parseJslibFile(jslibPath, this.sourcePath, this.target);
        if (libInfo) {
            if (!this.libManager.isLibraryLoaded(libInfo.fullPath, libInfo.type)) {
                if (libInfo.type === "static") {
                    this.addStaticLib(libInfo);
                    console.log("Loaded static library: " + libInfo.name);
                } else {
                    this.addExternalLib(libInfo);
                    console.log("Loaded shared library: " + libInfo.name);
                }
                console.log("  Path: " + libInfo.fullPath);
                console.log("  Symbols: " + libInfo.symbols.join(", "));
            }
        }
    }

    // 初始化导入绑定：将导入的标识符绑定到从模块注册表获取的值
    // 这解决了 ImportDeclaration 被跳过时导入绑定未初始化的问题
    compileImportBindingInitialization(stmt) {
        const importSource = stmt.source && stmt.source.value;
        if (!importSource) return;

        // 获取导入的模块路径
        const absSourcePath = path.resolve(this.sourcePath || ".");
        const currentDir = fs.statSync(absSourcePath).isDirectory() ? absSourcePath : path.dirname(absSourcePath);

        const nodeModules = new Set(["fs", "path", "url", "process", "child_process", "os"]);
        let resolvedPath = "";

        if (importSource.startsWith("node:") || nodeModules.has(importSource)) {
            resolvedPath = this.nodeShimPath;
        } else if (importSource.startsWith(".")) {
            resolvedPath = path.resolve(currentDir, importSource);
            if (!resolvedPath.endsWith(".js") && !fs.existsSync(resolvedPath)) {
                if (fs.existsSync(resolvedPath + ".js")) {
                    resolvedPath += ".js";
                } else if (fs.existsSync(path.join(resolvedPath, "index.js"))) {
                    resolvedPath = path.join(resolvedPath, "index.js");
                }
            }
        } else {
            return; // 暂不支持其他类型的导入
        }

        // 找到对应的模块记录
        const importRecord = this.imports && this.imports.find(
            rec => rec.importInfo && rec.importInfo.resolvedPath === resolvedPath
        );
        if (!importRecord) return;

        const { specifiers } = importRecord.importInfo;

        for (const spec of specifiers) {
            if (spec.type === "ImportSpecifier") {
                // import { localName } from "module"
                const localName = spec.local && spec.local.name;
                const importedName = spec.imported && (spec.imported.name || spec.imported.value);

                if (!localName || !importedName) continue;

                const globalLabel = this.ctx.getMainCapturedVar(localName);
                const offset = this.ctx.getLocal(localName);
                const needsBox = this.ctx.boxedVars && this.ctx.boxedVars.has(localName);

                if (needsBox) {
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0);
                } else if (offset === undefined) {
                    continue;
                }

                const moduleAst = importRecord.importInfo.moduleAst;
                const moduleIndex = this.findModuleIndex(moduleAst);
                console.log("DEBUG: moduleIndex for " + importedName + " = " + moduleIndex + " (moduleAst=" + (moduleAst && moduleAst.filename) + ")");

                this.vm.movImm(VReg.A0, moduleIndex);
                const nameLabel = this.asm.addString(importedName);
                this.vm.lea(VReg.A1, nameLabel);
                console.log("DEBUG: calling _get_module_export for " + importedName); this.vm.call("_get_module_export");

                if (needsBox) {
                    this.vm.store(VReg.V2, BOX_VALUE_OFFSET, VReg.RET);
                } else {
                    this.vm.store(VReg.FP, offset, VReg.RET);
                }
            } else if (spec.type === "ImportDefaultSpecifier") {
                const localName = spec.local && spec.local.name;
                if (!localName) continue;

                const globalLabel = this.ctx.getMainCapturedVar(localName);
                const offset = this.ctx.getLocal(localName);
                const needsBox = this.ctx.boxedVars && this.ctx.boxedVars.has(localName);

                if (needsBox) {
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0);
                } else if (offset === undefined) {
                    continue;
                }

                const moduleAst = importRecord.importInfo.moduleAst;
                const moduleIndex = this.findModuleIndex(moduleAst);

                this.vm.movImm(VReg.A0, moduleIndex);
                const nameLabel = this.asm.addString("default");
                this.vm.lea(VReg.A1, nameLabel);
                this.vm.call("_get_module_export");

                if (needsBox) {
                    this.vm.store(VReg.V2, BOX_VALUE_OFFSET, VReg.RET);
                } else {
                    this.vm.store(VReg.FP, offset, VReg.RET);
                }
            } else if (spec.type === "ImportNamespaceSpecifier") {
                const localName = spec.local && spec.local.name;
                if (!localName) continue;

                const globalLabel = this.ctx.getMainCapturedVar(localName);
                const offset = this.ctx.getLocal(localName);
                const needsBox = this.ctx.boxedVars && this.ctx.boxedVars.has(localName);

                if (needsBox) {
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0);
                } else if (offset === undefined) {
                    continue;
                }

                const moduleAst = importRecord.importInfo.moduleAst;
                const moduleIndex = this.findModuleIndex(moduleAst);

                this.vm.movImm(VReg.A0, moduleIndex);
                const nameLabel = this.asm.addString("*");
                this.vm.lea(VReg.A1, nameLabel);
                this.vm.call("_get_module_export");

                if (needsBox) {
                    this.vm.store(VReg.V2, BOX_VALUE_OFFSET, VReg.RET);
                } else {
                    this.vm.store(VReg.FP, offset, VReg.RET);
                }
            }
        }
    }

    // 查找模块在 moduleOrder 中的索引
    findModuleIndex(moduleAst) {
        if (!this._moduleOrder) return 0;
        for (let i = 0; i < this._moduleOrder.length; i++) {
            if (this._moduleOrder[i] === moduleAst) return i;
        }
        return 0;
    }

    // 将模块的导出变量复制到 captured var box
    // 注意：对于 boxed vars，赋值时已经直接存到 box 里了，不需要复制
    copyModuleExportsToCapturedVars(moduleAst) {
        for (const stmt of moduleAst.body) {
            if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                const decl = stmt.declaration;
                if (decl.type === "VariableDeclaration") {
                    for (const decl2 of decl.declarations) {
                        if (decl2.id && decl2.id.type === "Identifier") {
                            const name = decl2.id.name;
                            // 对于 boxed vars，赋值时已经存到 box 里了，跳过
                            if (this.ctx.boxedVars && this.ctx.boxedVars.has(name)) {
                                console.log(`DEBUG copyModule: ${name} is boxed (already in box), skipping`);
                                continue;
                            }
                            const offset = this.ctx.getLocal(name);
                            console.log(`DEBUG copyModule: ${name} from ${moduleAst.filename}, offset=${offset}, label=${this.ctx.getMainCapturedVar(name)}`);
                            if (offset !== undefined) {
                                const label = this.ctx.getMainCapturedVar(name);
                                if (label) {
                                    const vm = this.vm;
                                    vm.load(VReg.V0, VReg.FP, offset);
                                    vm.lea(VReg.V1, label);
                                    vm.store(VReg.V1, 0, VReg.V0); // *label = V0
                                }
                            }
                        }
                    }
                } else if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") {
                    const name = decl.id.name;
                    if (this.ctx.boxedVars && this.ctx.boxedVars.has(name)) {
                        console.log(`DEBUG copyModule: ${name} is boxed (fn/class), skipping`);
                        continue;
                    }
                    const offset = this.ctx.getLocal(name);
                    console.log(`DEBUG copyModule: ${name} from ${moduleAst.filename}, offset=${offset}`);
                    if (offset !== undefined) {
                        const label = this.ctx.getMainCapturedVar(name);
                        if (label) {
                            const vm = this.vm;
                            vm.load(VReg.V0, VReg.FP, offset);
                            vm.lea(VReg.V1, label);
                            vm.store(VReg.V1, 0, VReg.V0);
                        }
                    }
                } else if (decl.type === "Identifier") {
                    // export default os; - os is a reference to an existing variable
                    // This IS a boxed var (os was added to topLevelCapturedVars), skip copy
                    const name = decl.name;
                    console.log(`DEBUG copyModule default: ${name} is boxed=${this.ctx.boxedVars && this.ctx.boxedVars.has(name)}, skipping`);
                }
            }
        }
    }

    isExternalSymbol(name) {
        // 检查动态库
        if (this.libManager.isExternalSymbol(name)) return true;
        // 检查静态库
        for (const lib of this.staticLibs) {
            if (lib.symbols && lib.symbols.includes(name)) {
                return true;
            }
        }
        return false;
    }

    getExternalLibInfo(name) {
        const lib = this.libManager.getLibraryForSymbol(name);
        if (lib) return lib;
        // 检查静态库
        for (const lib of this.staticLibs) {
            if (lib.symbols && lib.symbols.includes(name)) {
                return lib;
            }
        }
        return null;
    }

    registerExternalLib(libInfo) {
        this.libManager.registerDylib(libInfo.fullPath);
    }

    getDylibIndex(dylibPath) {
        return this.libManager.getDylibIndex(dylibPath);
    }

    // ========== 编译流程 ==========

    nextLabelId() {
        return this.labelCounter++;
    }

    parse(source) {
        const lexer = new Lexer(source);
        const parser = new Parser(lexer);
        const ast = parser.parseProgram();
        if (parser.errors && parser.errors.length > 0) {
            throw new Error("Syntax errors:\n  " + parser.errors.join("\n  "));
        }
        return ast;
    }

    compile(source) {
        const ast = this.parse(source);

        if (this.outputType === "shared" || this.outputType === "static") {
            this.generateSharedLibraryRuntime();
            this.compileProgramForLibrary(ast);
        } else {
            this.generateEntry();
            this.generateRuntime();
            this.compileProgram(ast);

            if (this.staticLibs && this.staticLibs.length > 0) {
                this.embedStaticLibraries();
            }
        }

        return this.generateExecutable();
    }

    compileFile(inputFile, outputFile) {
        const source = fs.readFileSync(inputFile, "utf-8");
        this.sourcePath = path.resolve(inputFile);
        console.log("Compiling: " + this.sourcePath);

        if (!outputFile) {
            const baseName = path.basename(inputFile, ".js");
            outputFile = baseName + Targets[this.target].ext;
        }

        this.outputFileName = outputFile;
        const result = this.compile(source);

        if (result && result.type === "static") {
            const writeResult = this.writeStaticLibrary(result.objectData, outputFile);
            // 生成 jslib 声明文件 (除非禁用)
            if (!this.options.noJslib) {
                this.generateJslibFile(outputFile, "static");
            }
            return writeResult;
        }

        const binary = result;
        fs.writeFileSync(outputFile, Buffer.from(binary));
        fs.chmodSync(outputFile, 0o755);

        // 生成 jslib 声明文件 (仅共享库，除非禁用)
        if (this.outputType === "shared" && !this.options.noJslib) {
            this.generateJslibFile(outputFile, "shared");
        }

        return { output: outputFile, size: binary.length };
    }

    // 生成 .jslib 声明文件
    generateJslibFile(outputFile, libType) {
        const baseName = path.basename(outputFile);
        const dirName = path.dirname(outputFile);
        // 去掉 lib 前缀和扩展名得到基础名
        let libName = baseName;
        if (libName.startsWith("lib")) {
            libName = libName.substring(3);
        }
        let dotIdx = libName.lastIndexOf(".");
        if (dotIdx !== -1) {
            libName = libName.substring(0, dotIdx);
        }
        const jslibPath = path.join(dirName, libName + ".jslib");

        // 获取导出的函数列表
        const exportFuncs = this.exports.length > 0 ? this.exports : Object.keys(this.ctx.functions);

        const lines = [];
        lines.push(`// ${libName}.jslib - 库声明文件`);
        lines.push(`// 由 jsbin 自动生成`);
        lines.push(`// 用法: import * from "./${libName}.jslib"`);
        lines.push("");
        lines.push("// 库配置");
        lines.push(`export const __lib__ = {`);
        lines.push(`    path: "./${libName}",`);
        if (libType === "static") {
            lines.push(`    type: "static",`);
        }
        lines.push(`};`);
        lines.push("");
        lines.push("// 导出函数声明");
        for (const name of exportFuncs) {
            lines.push(`export function ${name}();`);
        }
        lines.push("");

        fs.writeFileSync(jslibPath, lines.join("\n"));
        console.log(`Generated: ${jslibPath}`);
    }

    // ========== 运行时生成 ==========

    generateRuntime() {
        const allocGen = new AllocatorGenerator(this.vm);
        allocGen.generate();
        const runtimeGen = new RuntimeGenerator(this.vm, this.ctx);
        runtimeGen.generate();
        this.generateDataSection();
    }

    generateDataSection() {
        const numberGen = new NumberGenerator(this.vm, this.ctx);
        numberGen.generateDataSection(this.asm);
    }

    generateSharedLibraryRuntime() {
        // 共享库不需要完整运行时
    }

    // ========== 入口点和程序编译 ==========

    generateEntry() {
        const vm = this.vm;
        vm.label("_start");
        
        // 保存 OS 传入的 argc 和 argv
        // macOS ARM64 (LC_MAIN): argc = A0, argv = A1
        vm.prologue(16, []);
        vm.store(VReg.SP, 0, VReg.A0); // 保存 argc
        vm.store(VReg.SP, 8, VReg.A1); // 保存 argv

        // 调试打印 argc
        // vm.call("_print_int");

        vm.call("_heap_init");
        vm.call("_scheduler_init");
        
        // 初始化 process 对象
        vm.load(VReg.A0, VReg.SP, 0); // argc
        vm.load(VReg.A1, VReg.SP, 8); // argv
        vm.call("_process_init");
        
        vm.call("_main");
        vm.call("_scheduler_run");
        
        vm.movImm(VReg.A0, 0);
        if (this.os === "windows") {
            vm.callWindowsExitProcess();
        } else if (this.arch === "arm64") {
            vm.syscall(this.os === "linux" ? 93 : 1);
        } else {
            vm.syscall(this.os === "linux" ? 60 : 0x2000001);
        }
    }

    compileProgram(ast) {
        const vm = this.vm;
        
        // 递归处理导入，获取按依赖顺序排列的 AST 列表
        this._moduleOrder = this.resolveImports(ast);

        this.collectFunctions(ast);

        const mainBoxedVars = analyzeTopLevelSharedVariables(ast);
        const mainFunc = {
            params: [],
            body: {
                type: "BlockStatement",
                body: ast.body.filter((stmt) => stmt.type !== "FunctionDeclaration"),
            },
        };
        const innerBoxedVars = analyzeSharedVariables(mainFunc);

        for (const v of innerBoxedVars) {
            mainBoxedVars.add(v);
        }

        const topLevelCapturedVars = analyzeTopLevelSharedVariables(ast);
        console.log(`DEBUG: Main script captures: ${Array.from(topLevelCapturedVars).join(", ")}`);
        for (const moduleAst of this._moduleOrder) {
            console.log(`DEBUG: Processing module: ${moduleAst.filename || "unknown"}`);
            const moduleCaptured = analyzeTopLevelSharedVariables(moduleAst);
            console.log(`DEBUG: Module captures: ${Array.from(moduleCaptured).join(", ")}`);
            for (const name of moduleCaptured) {
                topLevelCapturedVars.add(name);
            }
        }

        // 将所有模块的导出变量也加入 captured vars
        // 必须在 allocMainCapturedVar 之前做，这样变量会被分配 box
        for (const moduleAst of this._moduleOrder) {
            for (const stmt of moduleAst.body) {
                if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                    const decl = stmt.declaration;
                    if (decl.type === "VariableDeclaration") {
                        for (const decl2 of decl.declarations) {
                            if (decl2.id && decl2.id.type === "Identifier") {
                                const name = decl2.id.name;
                                if (!topLevelCapturedVars.has(name)) {
                                    topLevelCapturedVars.add(name);
                                    console.log(`DEBUG: Adding exported var to captures: ${name} from ${moduleAst.filename}`);
                                }
                            }
                        }
                    } else if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") {
                        const name = decl.id.name;
                        if (!topLevelCapturedVars.has(name)) {
                            topLevelCapturedVars.add(name);
                            console.log(`DEBUG: Adding exported fn/class to captures: ${name}`);
                        }
                    } else if (decl.type === "Identifier") {
                        // export default os; - the identifier is the actual exported value
                        const name = decl.name;
                        if (!topLevelCapturedVars.has(name)) {
                            topLevelCapturedVars.add(name);
                            console.log(`DEBUG: Adding exported default (Identifier) to captures: ${name} from ${moduleAst.filename}`);
                        }
                    }
                }
            }
        }

        this.ctx.boxedVars = topLevelCapturedVars;

        for (const name of topLevelCapturedVars) {
            const label = this.ctx.allocMainCapturedVar(name);
            this.asm.addDataLabel(label);
            this.asm.addDataQword(0);
        }

        vm.label("_main");
        // 分配较大的栈空间以容纳动态分配的局部变量
        vm.prologue(1024, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]); 

        // 0. 在 _main 起始位置预分配所有全局 captured 变量的 box
        // 这确保了即使模块顶层代码提前访问外部函数，也能获取到一个有效的 box 指针而非 0
        for (const name of topLevelCapturedVars) {
            const label = this.ctx.getMainCapturedVar(name);
            console.log(`DEBUG: Pre-allocating box for ${name} (${label})`);
            vm.movImm(VReg.A0, 8); // BOX_SIZE
            vm.call("_alloc");
            vm.lea(VReg.V1, label);
            vm.store(VReg.V1, 0, VReg.RET);
        }
        this.ctx.returnLabel = "_main_return";

        // 1. 先编译所有导入模块的顶层语句（按依赖顺序）
        for (const moduleAst of this._moduleOrder) {
            for (const stmt of moduleAst.body) {
                // 跳过函数声明（已通过 collectFunctions 处理）和导入语句本身
                if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                    // 对于 export 语句，编译其内部的声明（如 VariableDeclaration）
                    if (stmt.declaration.type !== "FunctionDeclaration" && 
                        stmt.declaration.type !== "ClassDeclaration") {
                        this.compileStatement(stmt.declaration);
                    }
                } else if (stmt.type !== "FunctionDeclaration" && 
                    stmt.type !== "ClassDeclaration" &&
                    stmt.type !== "ImportDeclaration" && 
                    stmt.type !== "ExportDeclaration") {
                    this.compileStatement(stmt);
                }
            }

            // 模块编译完成后，将导出的变量值复制到 captured var box
            this.copyModuleExportsToCapturedVars(moduleAst);
        }

        // 2. 最后编译主程序的顶层语句
        for (const stmt of ast.body) {
            if (stmt.type === "ExportDeclaration") {
                // ExportDeclaration 在运行时处理，跳过
                continue;
            }
            if (stmt.type === "ImportDeclaration") {
                // 初始化导入绑定：从模块注册表获取导出值
                this.compileImportBindingInitialization(stmt);
                continue;
            }
            if (stmt.type !== "FunctionDeclaration" && stmt.type !== "ClassDeclaration") {
                this.compileStatement(stmt);
            }
        }

        vm.movImm(VReg.RET, 0);
        vm.label("_main_return");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 1024);

        this.compileUserFunctions();
        this.generatePendingFunctions();
    }

    resolveImports(ast, moduleOrder = []) {
        console.log(`DEBUG resolveImports: sourcePath=${this.sourcePath}, body.length=${ast.body.length}`);
        const absSourcePath = path.resolve(this.sourcePath || ".");
        const currentDir = fs.statSync(absSourcePath).isDirectory() ? absSourcePath : path.dirname(absSourcePath);

        const nodeModules = new Set(["fs", "path", "url", "process", "child_process", "os"]);

        for (const stmt of ast.body) {
            if (stmt.type === "ImportDeclaration" || (stmt.type === "ExportDeclaration" && stmt.source)) {
                let importSource = stmt.source.value;
                let resolvedPath = "";

                if (importSource.startsWith("node:") || nodeModules.has(importSource)) {
                    // 重定向到 shim
                    resolvedPath = this.nodeShimPath;
                } else if (importSource.startsWith(".")) {
                    // 本地文件
                    resolvedPath = path.resolve(currentDir, importSource);
                    if (!resolvedPath.endsWith(".js") && !fs.existsSync(resolvedPath)) {
                        if (fs.existsSync(resolvedPath + ".js")) {
                            resolvedPath += ".js";
                        } else if (fs.existsSync(path.join(resolvedPath, "index.js"))) {
                            resolvedPath = path.join(resolvedPath, "index.js");
                        }
                    }
                } else if (importSource.startsWith("/Users/nouo/github/jsbin/runtime/") || importSource.startsWith("/Users/nouo/github/jsbin/vm/")) {
                    // 绝对路径引用 runtime 文件，重定向到 shim
                    resolvedPath = this.nodeShimPath;
                } else {
                    continue; // 暂不支持其他类型的导入
                }

                // 记录此导入的元信息，用于后续编译时绑定
                const importInfo = {
                    specifiers: stmt.specifiers || [],
                    source: importSource,
                    resolvedPath: resolvedPath,
                    isNodeShim: importSource.startsWith("node:") || nodeModules.has(importSource)
                };
                this.imports = this.imports || [];
                this.imports.push({ importInfo, moduleAst: null, fromAst: ast });

                if (!this.compiledFiles.has(resolvedPath)) {
                    this.compiledFiles.add(resolvedPath);
                    console.log("Recursively compiling: " + resolvedPath);
                    const source = fs.readFileSync(resolvedPath, "utf-8");
                    const moduleAst = this.parse(source);
                    moduleAst.filename = resolvedPath;
                    
                    // 更新导入记录的 moduleAst
                    importInfo.moduleAst = moduleAst;
                    
                    // 保存当前的 sourcePath 并切换到模块路径，以便递归解析更深层导入
                    const oldPath = this.sourcePath;
                    this.sourcePath = resolvedPath;
                    this.resolveImports(moduleAst, moduleOrder);
                    this.sourcePath = oldPath;

                    // 收集模块中的函数和类
                    this.collectFunctions(moduleAst);
                    
                    // 将模块 AST 加入顺序列表（后序遍历，确保依赖先编译）
                    moduleOrder.push(moduleAst);
                }
            }
        }
        return moduleOrder;
    }

    compileProgramForLibrary(ast) {
        this.collectFunctions(ast);
        this.compileUserFunctions();
        this.generatePendingFunctions();

        // 生成 C 调用约定包装器
        const wrapperGen = new WrapperGenerator(this);
        wrapperGen.generate(this.exports);
    }

    collectFunctions(ast) {
        for (const stmt of ast.body) {
            if (stmt.type === "FunctionDeclaration" && stmt.id) {
                this.ctx.registerFunction(stmt.id.name, stmt);
            } else if (stmt.type === "ClassDeclaration" && stmt.id) {
                // 注册类，以便 compileUserFunctions 编译它
                this.ctx.registerFunction(stmt.id.name, stmt);
            } else if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                const decl = stmt.declaration;
                if ((decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") && decl.id) {
                    this.ctx.registerFunction(decl.id.name, decl);
                    if (!this.exports.includes(decl.id.name)) {
                        console.log("DEBUG: collectFunctions addExport: " + decl.id.name);
                        this.exports.push(decl.id.name);
                    }
                }
            }
        }
    }

    compileUserFunctions() {
        for (const name in this.ctx.functions) {
            this.compileFunction(name, this.ctx.functions[name]);
        }
    }

    compileFunction(name, func) {
        const vm = this.vm;
        const funcLabel = "_user_" + name;
        const returnLabel = funcLabel + "_return";

        const isAsync = isAsyncFunction(func);

        const savedCtx = this.ctx;
        this.ctx = savedCtx.clone(name);
        this.ctx.returnLabel = returnLabel;
        this.ctx.inAsyncFunction = isAsync;

        const boxedVars = analyzeSharedVariables(func);
        this.ctx.boxedVars = boxedVars;

        vm.label(funcLabel);
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        const params = func.params || [];
        const paramOffsets = [];
        for (let i = 0; i < params.length && i < 6; i++) {
            const param = params[i];
            if (param.type === "Identifier") {
                const paramName = param.name;
                const offset = this.ctx.allocLocal(paramName);
                paramOffsets.push({ name: paramName, offset: offset });
                vm.store(VReg.FP, offset, vm.getArgReg(i));
            }
        }

        for (let i = 0; i < paramOffsets.length; i++) {
            const param = paramOffsets[i];
            if (boxedVars.has(param.name)) {
                vm.load(VReg.V1, VReg.FP, param.offset);
                vm.push(VReg.V1);
                vm.movImm(VReg.A0, 8);
                vm.call("_alloc");
                vm.store(VReg.FP, param.offset, VReg.RET);
                vm.pop(VReg.V1);
                vm.store(VReg.RET, 0, VReg.V1);
            }
        }

        if (func.body) {
            if (func.body.type === "BlockStatement") {
                for (const stmt of func.body.body) {
                    this.compileStatement(stmt);
                }
            } else {
                this.compileExpression(func.body);
            }
        }

        vm.movImm(VReg.RET, 0);
        vm.label(returnLabel);
        if (isAsync) {
            this.emitAsyncResolveAndReturnFromRet();
        } else {
            vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
        }

        this.generatePendingFunctions();
        this.ctx = savedCtx;
    }

    // ========== 静态库支持 ==========

    embedStaticLibraries() {
        const linker = new StaticLinker();

        for (const lib of this.staticLibs) {
            linker.loadLibrary(lib.fullPath);
        }

        const linked = linker.getLinkedCode();
        const staticCodeBase = this.asm.code.length;

        for (let i = 0; i < linked.code.length; i++) {
            this.asm.code.push(linked.code[i]);
        }

        const dataArray = this.asm.data || this.asm.dataSection;
        if (dataArray && linked.data.length > 0) {
            for (let i = 0; i < linked.data.length; i++) {
                dataArray.push(linked.data[i]);
            }
        }

        for (const [name, offset] of Object.entries(linked.symbols)) {
            const finalOffset = staticCodeBase + offset;
            this.asm.labels[name] = finalOffset;
            if (!name.startsWith("_")) {
                this.asm.labels["_" + name] = finalOffset;
            }
        }
    }

    writeStaticLibrary(objectData, outputFile) {
        const tempDir = os.tmpdir();
        const baseName = path.basename(outputFile, ".a");
        const tempObjFile = path.join(tempDir, baseName + ".o");

        try {
            fs.writeFileSync(tempObjFile, Buffer.from(objectData));
            execSync(`ar rcs "${outputFile}" "${tempObjFile}"`, { stdio: "pipe" });
            const stats = fs.statSync(outputFile);
            return { output: outputFile, size: stats.size };
        } finally {
            try {
                fs.unlinkSync(tempObjFile);
            } catch (e) {}
        }
    }

    // ========== 二进制生成 ==========

    generateExecutable() {
        const allocGen = new AllocatorGenerator(this.vm);
        allocGen.generateDataSection(this.asm);

        // 生成运行时数据段
        const runtimeGen = new RuntimeGenerator(this.vm, this.ctx);
        runtimeGen.generateAsyncDataSection(this.asm);

        this.asm.finalize();

        const generator = new BinaryOutputGenerator(this);

        if (this.outputType === "shared") {
            return generator.generateSharedLibrary();
        } else if (this.outputType === "object") {
            return generator.generateObjectFile();
        } else if (this.outputType === "static") {
            return generator.generateStaticLibrary();
        }

        return generator.generateExecutable();
    }

    // ========== C 调用约定参数编译 ==========

    compileCallArgumentsForCConvention(args) {
        const vm = this.vm;
        const paramCount = Math.min(args.length, 8);
        const tempOffsets = [];

        for (let i = 0; i < paramCount; i++) {
            this.compileExpression(args[i]);
            const tempName = `__temp_arg_${i}_${this.nextLabelId()}`;
            const offset = this.ctx.allocLocal(tempName);
            tempOffsets.push(offset);
            vm.store(VReg.FP, offset, VReg.RET);
        }

        if (this.arch === "arm64") {
            for (let i = 0; i < paramCount; i++) {
                vm.load(VReg.RET, VReg.FP, tempOffsets[i]);
                this.asm.fmovToFloat(i, 0);
            }
        } else {
            for (let i = 0; i < paramCount; i++) {
                vm.load(VReg.RET, VReg.FP, tempOffsets[i]);
                this.asm.movqToXmm(i, 0);
            }
        }
    }

    // 兼容旧 API
    generateCCallingWrappers() {
        const wrapperGen = new WrapperGenerator(this);
        wrapperGen.generateARM64Wrappers(this.exports);
    }

    generateCCallingWrappersX64() {
        const wrapperGen = new WrapperGenerator(this);
        wrapperGen.generateX64Wrappers(this.exports);
    }

    // 添加字符串常量到数据段，返回标签名
    addStringConstant(str) {
        return this.asm.addString(str);
    }
}

// 混入编译器模块的方法
Object.assign(Compiler.prototype, StatementCompiler);
Object.assign(Compiler.prototype, ExpressionCompiler);
Object.assign(Compiler.prototype, FunctionCompiler);

// ========== 简化接口 ==========

export function compileFile(inputFile, outputFile, target) {
    target = target || detectPlatform();
    const compiler = new Compiler(target);
    return compiler.compileFile(inputFile, outputFile);
}

export function parseSource(source) {
    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    return parser.parseProgram();
}

export function parseFile(inputFile) {
    const source = fs.readFileSync(inputFile, "utf-8");
    return parseSource(source);
}

export function createCompiler(target, options) {
    return new Compiler(target, options);
}
