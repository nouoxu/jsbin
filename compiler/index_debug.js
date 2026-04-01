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

        console.log("DEBUG compileImportBinding: sourcePath=" + this.sourcePath + ", currentDir=" + currentDir + ", importSource=" + importSource);

        const nodeModules = new Set(["fs", "path", "url", "process", "child_process", "os", "constants"]);
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
            // Handle namespace import: type=ImportNamespaceSpecifier with namespace=true
            const isNamespace = spec.type === "ImportNamespaceSpecifier" || spec.namespace === true;
            if (isNamespace) {
                // import * as x from "module" (namespace import)
                const localName = spec.local && spec.local.name;
                if (!localName) continue;

                // Allocate local slot if not exists (for namespace imports at top level)
                const offset = this.ctx.getLocal(localName);
                const needsBox = this.ctx.boxedVars && this.ctx.boxedVars.has(localName);
                let actualOffset = offset;
                if (actualOffset === undefined && !needsBox) {
                    actualOffset = this.ctx.allocLocal(localName);
                }

                const globalLabel = this.ctx.getMainCapturedVar(localName);
                if (needsBox) {
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0);
                } else if (actualOffset === undefined) {
                    continue;
                }

                // Use resolvedPath to find the actual source module index
                const sourceModuleIndex = this.findModuleIndexByPath(resolvedPath);
                console.log("DEBUG compileImport: namespace import " + localName + " from " + resolvedPath + " -> sourceModuleIndex=" + sourceModuleIndex);

                this.vm.movImm(VReg.A0, sourceModuleIndex);
                const nameLabel = this.asm.addString("*");
                this.vm.lea(VReg.A1, nameLabel);
                this.vm.call("_get_module_export");

                if (needsBox) {
                    this.vm.store(VReg.V2, BOX_VALUE_OFFSET, VReg.RET);
                } else {
                    this.vm.store(VReg.FP, actualOffset, VReg.RET);
                }
            } else if (spec.type === "ImportSpecifier") {
                // import { localName } from "module" (named import)
                const localName = spec.local && spec.local.name;
                const importedName = spec.imported && (spec.imported.name || spec.imported.value);

                if (!localName || !importedName) continue;

                const globalLabel = this.ctx.getMainCapturedVar(localName);
                const offset = this.ctx.getLocal(localName);
                const needsBox = this.ctx.boxedVars && this.ctx.boxedVars.has(localName);
                console.log("DEBUG: named import " + localName + " offset=" + offset + " needsBox=" + needsBox + " globalLabel=" + globalLabel);
                let actualOffset = offset;

                // Allocate local slot if not exists (for named imports at top level)
                if (actualOffset === undefined && !needsBox) {
                    actualOffset = this.ctx.allocLocal(localName);
                    console.log("DEBUG: allocLocal(" + localName + ") = " + actualOffset);
                }

                if (needsBox) {
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0);
                } else if (actualOffset === undefined) {
                    continue;
                }

                // Use resolvedPath to find the actual source module index
                const sourceModuleIndex = this.findModuleIndexByPath(resolvedPath);

                this.vm.movImm(VReg.A0, sourceModuleIndex);
                const nameLabel = this.asm.addString(importedName);
                this.vm.lea(VReg.A1, nameLabel);
                this.vm.call("_get_module_export");

                if (needsBox) {
                    this.vm.store(VReg.V2, BOX_VALUE_OFFSET, VReg.RET);
                } else {
                    this.vm.store(VReg.FP, actualOffset, VReg.RET);
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

                // Use resolvedPath to find the actual source module index
                const sourceModuleIndex = this.findModuleIndexByPath(resolvedPath);

                this.vm.movImm(VReg.A0, sourceModuleIndex);
                const nameLabel = this.asm.addString("default");
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

    // 根据文件路径查找模块在 moduleOrder 中的索引
    findModuleIndexByPath(resolvedPath) {
        if (!this._moduleOrder) return 0;
        for (let i = 0; i < this._moduleOrder.length; i++) {
            if (this._moduleOrder[i].filename === resolvedPath) return i;
        }
        return 0;
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

        this.ctx.boxedVars = mainBoxedVars;

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

        // Storage for each module's local variables (saved before being overwritten by next module)
        this._moduleLocalsList = [];
        // Storage for each module's exports (used for export * resolution)
        this._moduleExportsList = [];

        // First pass: compile statements and collect exports (but don't resolve star exports yet)
        console.log("DEBUG: Starting module compilation (pass 1), _moduleOrder.length=" + this._moduleOrder.length);
        for (let moduleIdx = 0; moduleIdx < this._moduleOrder.length; moduleIdx++) {
            const moduleAst = this._moduleOrder[moduleIdx];
            console.log("DEBUG: Processing module " + moduleIdx + ": " + (moduleAst.filename || "unknown"));
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
            // Save locals for this module
            this._moduleLocalsList.push(Object.assign({}, this.ctx.locals));
            // Collect exports for this module (star exports will be resolved in pass 2)
            const moduleExports = collectModuleExports(moduleAst, this._moduleOrder, this.nodeShimPath, this._moduleExportsList, path, fs);
            this._moduleExportsList.push(moduleExports);
        }

        // Second pass: resolve star exports and generate namespace objects
        console.log("DEBUG: Starting module compilation (pass 2), resolving star exports");
        for (let moduleIdx = 0; moduleIdx < this._moduleOrder.length; moduleIdx++) {
            const moduleAst = this._moduleOrder[moduleIdx];
            // Resolve star exports using the now-complete _moduleExportsList
            const moduleExports = this.resolveStarExports(moduleAst, moduleIdx, this._moduleExportsList);
            console.log("DEBUG generateNS: module=" + moduleIdx + " " + moduleAst.filename + ", exports=" + JSON.stringify(moduleExports));
            if (moduleExports.length === 0) continue;

            const vm = this.vm;
            const moduleLocals = this._moduleLocalsList[moduleIdx];
            console.log("DEBUG: moduleLocals=" + JSON.stringify(moduleLocals));

            // Build a map of import specifiers for this module
            // This helps us find the source module for re-exports
            const importSpecMap = new Map(); // localName -> { sourceModuleIndex, isNamespace }
            console.log("DEBUG: Building importSpecMap for " + moduleAst.filename);
            if (this.imports) {
                for (const imp of this.imports) {
                    if (imp.importInfo) {
                        const matches = imp.importInfo.moduleAst === moduleAst;
                        const resolvedPath = imp.importInfo.resolvedPath;
                        if (matches) {
                            // Use resolvedPath to find the actual source module index
                            const sourceModuleIndex = this.findModuleIndexByPath(resolvedPath);
                            console.log("DEBUG: import from " + resolvedPath + " -> sourceModuleIndex=" + sourceModuleIndex);
                            for (const spec of imp.importInfo.specifiers || []) {
                                const localName = spec.local && spec.local.name;
                                if (localName) {
                                    const isNamespace = spec.type === "ImportNamespaceSpecifier" || spec.namespace === true;
                                    importSpecMap.set(localName, { sourceModuleIndex, isNamespace });
                                    console.log("DEBUG: importSpecMap.set('" + localName + "', srcIdx=" + sourceModuleIndex + ", ns=" + isNamespace + ")");
                                }
                            }
                        }
                    }
                }
            }
            console.log("DEBUG: final importSpecMap for " + moduleAst.filename + " = " + JSON.stringify([...importSpecMap.keys()]));

            // Create object
            vm.call("_object_new");
            const objPtr = VReg.V2;
            vm.mov(objPtr, VReg.RET);

            // Set each export property
            for (const exp of moduleExports) {
                const mainLabel = this.ctx.getMainCapturedVar(exp.name);
                const moduleLocals = this._moduleLocalsList[moduleIdx];
                let valueLoaded = false;

                // For function exports, directly use the function label (don't use mainLabel!)
                // mainLabel might point to a captured variable in another module's context
                if (exp.kind === "function") {
                    console.log("DEBUG: " + exp.name + " is function, using function label");
                    // Get function label address and tag as function (0x7FFF)
                    const funcLabel = "_user_" + exp.name;
                    vm.lea(VReg.V0, funcLabel);
                    vm.movImm64(VReg.V1, 0x7fff000000000000n);
                    vm.or(VReg.V0, VReg.V0, VReg.V1);  // V0 = tagged function address
                    valueLoaded = true;
                } else if (exp.kind === "reexport" && exp.sourceModuleIndex !== undefined) {
                    // Re-export from another module: get specific property from that module's namespace
                    console.log("DEBUG: reexport " + exp.name + " from module " + exp.sourceModuleIndex);
                    // Load from _module_registry[sourceModuleIndex]
                    vm.movImm(VReg.V0, exp.sourceModuleIndex);
                    vm.shl(VReg.V0, VReg.V0, 3);
                    vm.lea(VReg.V1, "_module_registry");
                    vm.add(VReg.V0, VReg.V1, VReg.V0);
                    vm.load(VReg.A0, VReg.V0, 0);  // A0 = namespace object pointer (raw)
                    // Tag as object (0x7FFD)
                    vm.movImm64(VReg.V1, 0x7ffd000000000000n);
                    vm.or(VReg.A0, VReg.A0, VReg.V1);  // A0 = tagged namespace object
                    // Get the property name
                    const keyLabel = this.asm.addString(exp.name);
                    vm.lea(VReg.A1, keyLabel);  // A1 = key string address
                    // Tag key as string (0x7FFC)
                    vm.movImm64(VReg.V1, 0x7ffc000000000000n);
                    vm.or(VReg.A1, VReg.A1, VReg.V1);  // A1 = tagged key
                    vm.call("_object_get");  // RET = property value
                    vm.mov(VReg.V0, VReg.RET);  // Copy result to V0 for _object_set
                    valueLoaded = true;
                } else if (exp.kind === "reexport") {
                    // For re-exports, check if it's a namespace import
                    const impSpec = importSpecMap.get(exp.name);
                    console.log("DEBUG: reexport " + exp.name + ", impSpec=" + JSON.stringify(impSpec) + ", moduleIndex=" + moduleIdx);
                    if (impSpec && impSpec.isNamespace) {
                        if (impSpec.sourceModuleIndex === moduleIdx) {
                            // Self-import: use the current namespace object pointer
                            console.log("DEBUG: " + exp.name + " SELF-namespace re-export, moduleIndex=" + moduleIdx + ", objPtr");
                            vm.mov(VReg.V0, objPtr);
                            vm.movImm64(VReg.V1, 0x7ffd000000000000n);
                            vm.or(VReg.V0, VReg.V0, VReg.V1);
                            valueLoaded = true;
                        } else {
                            // For namespace re-exports from OTHER modules
                            console.log("DEBUG: " + exp.name + " namespace re-export from module " + impSpec.sourceModuleIndex + " (current moduleIndex=" + moduleIdx + ")");
                            vm.movImm(VReg.V0, impSpec.sourceModuleIndex);
                            vm.shl(VReg.V0, VReg.V0, 3);
                            vm.lea(VReg.V1, "_module_registry");
                            vm.add(VReg.V0, VReg.V1, VReg.V0);
                            vm.load(VReg.V0, VReg.V0, 0);
                            vm.movImm64(VReg.V1, 0x7ffd000000000000n);
                            vm.or(VReg.V0, VReg.V0, VReg.V1);
                            valueLoaded = true;
                        }
                    } else if (mainLabel) {
                        console.log("DEBUG: " + exp.name + " from captured var " + mainLabel);
                        vm.lea(VReg.V0, mainLabel);
                        vm.load(VReg.V0, VReg.V0, 0);
                        valueLoaded = true;
                    } else if (moduleLocals) {
                        const localOffset = moduleLocals[exp.name];
                        console.log("DEBUG: " + exp.name + " localOffset=" + localOffset);
                        if (localOffset !== undefined) {
                            vm.load(VReg.V0, VReg.FP, localOffset);
                            valueLoaded = true;
                        }
                    }
                } else if (mainLabel) {
                    console.log("DEBUG: " + exp.name + " from captured var " + mainLabel);
                    vm.lea(VReg.V0, mainLabel);
                    vm.load(VReg.V0, VReg.V0, 0);
                    valueLoaded = true;
                } else if (moduleLocals) {
                    const localOffset = moduleLocals[exp.name];
                    console.log("DEBUG: " + exp.name + " localOffset=" + localOffset);
                    if (localOffset !== undefined) {
                        vm.load(VReg.V0, VReg.FP, localOffset);
                        valueLoaded = true;
                    }
                }

                if (!valueLoaded) {
                    console.log("DEBUG: FAILED to load " + exp.name);
                    continue;
                }

                // Set property on object
                const keyLabel = this.asm.addString(exp.name);
                vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
                vm.and(VReg.A0, objPtr, VReg.V1);
                vm.movImm64(VReg.V1, 0x7ffd000000000000n);
                vm.or(VReg.A0, VReg.A0, VReg.V1);
                vm.lea(VReg.V1, keyLabel);
                vm.mov(VReg.A2, VReg.V0);  // A2 = value
                vm.movImm64(VReg.V0, 0x7ffc000000000000n);
                vm.or(VReg.A1, VReg.V1, VReg.V0);  // A1 = tagged key
                vm.call("_object_set");
                console.log("DEBUG: SUCCESS set " + exp.name);
            }

            // Store to _module_registry[moduleIndex]
            vm.movImm(VReg.V0, moduleIdx);
            vm.shl(VReg.V0, VReg.V0, 3);
            vm.lea(VReg.V1, "_module_registry");
            vm.add(VReg.V1, VReg.V1, VReg.V0);
            vm.store(VReg.V1, 0, objPtr);
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


    // Resolve star exports for a module using the complete _moduleExportsList
    // This is called in pass 2 after all modules' exports have been collected
    resolveStarExports(moduleAst, moduleIndex, moduleExportsList) {
        const resolvedExports = [];

        for (const exp of moduleExportsList[moduleIndex]) {
            if (exp.kind === "star") {
                // Star export: resolve by getting all exports from source module
                const sourceModuleIndex = exp.sourceModuleIndex;
                console.log("DEBUG: Resolving star export from module " + sourceModuleIndex + " for " + moduleAst.filename);
                if (moduleExportsList[sourceModuleIndex]) {
                    const sourceExports = moduleExportsList[sourceModuleIndex];
                    for (const srcExp of sourceExports) {
                        // Skip default export and duplicates
                        if (srcExp.name === 'default') continue;
                        if (resolvedExports.find(e => e.name === srcExp.name)) {
                            console.log("DEBUG: Skipping duplicate export " + srcExp.name);
                            continue;
                        }
                        // Add as re-export from source module
                        resolvedExports.push({
                            name: srcExp.name,
                            kind: "reexport",
                            sourceModuleIndex: sourceModuleIndex
                        });
                    }
                } else {
                    console.log("DEBUG: Source module " + sourceModuleIndex + " exports not found!");
                }
            } else {
                resolvedExports.push(exp);
            }
        }

        return resolvedExports;
    }

    resolveImports(ast, moduleOrder = []) {
        const absSourcePath = path.resolve(this.sourcePath || ".");
        const currentDir = fs.statSync(absSourcePath).isDirectory() ? absSourcePath : path.dirname(absSourcePath);

        const nodeModules = new Set(["fs", "path", "url", "process", "child_process", "os", "constants"]);

        for (const stmt of ast.body) {
            // Handle ImportDeclaration, ExportDeclaration with source (export { x } from "m"),
            // and ExportAllDeclaration (export * from "m")
            const isImportLike = stmt.type === "ImportDeclaration" ||
                stmt.type === "ExportAllDeclaration" ||
                (stmt.type === "ExportDeclaration" && stmt.source);
            if (!isImportLike) continue;

            if (stmt.type === "ExportAllDeclaration") {
                // export * from "module" - handle like an import
                const importSource = stmt.source.value;
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
                    continue;
                }

                if (!this.compiledFiles.has(resolvedPath)) {
                    this.compiledFiles.add(resolvedPath);
                    console.log("Recursively compiling: " + resolvedPath);
                    const source = fs.readFileSync(resolvedPath, "utf-8");
                    const moduleAst = this.parse(source);
                    moduleAst.filename = resolvedPath;

                    const oldPath = this.sourcePath;
                    this.sourcePath = resolvedPath;
                    this.resolveImports(moduleAst, moduleOrder);
                    this.sourcePath = oldPath;

                    this.collectFunctions(moduleAst);
                    moduleOrder.push(moduleAst);
                }
                continue;
            }

            // ImportDeclaration or ExportDeclaration with source
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
            } else {
                continue; // 暂不支持其他类型的导入
            }

            // 记录此导入的元信息，用于后续编译时绑定
            const importInfo = {
                specifiers: stmt.specifiers || [],
                source: importSource,
                resolvedPath: resolvedPath,
                isNodeShim: importSource.startsWith("node:") || nodeModules.has(importSource),
                moduleAst: ast  // 'ast' is the AST of the module doing the importing - set immediately
            };
            this.imports = this.imports || [];
            this.imports.push({ importInfo, fromAst: ast });

            if (!this.compiledFiles.has(resolvedPath)) {
                this.compiledFiles.add(resolvedPath);
                console.log("Recursively compiling: " + resolvedPath);
                const source = fs.readFileSync(resolvedPath, "utf-8");
                const moduleAst = this.parse(source);
                moduleAst.filename = resolvedPath;

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

        // If this function is exported, store its address into the captured var box
        if (this.exports && this.exports.includes(name)) {
            console.log("DEBUG: Storing exported function " + name + " into captured var");
            const capturedLabel = this.ctx.getMainCapturedVar(name);
            console.log("DEBUG: capturedLabel=" + capturedLabel);
            if (capturedLabel) {
                // Load box pointer from captured var label
                vm.lea(VReg.V0, capturedLabel);
                vm.load(VReg.V0, VReg.V0, 0);  // V0 = box pointer
                // Get function address and tag as function (0x7FFF)
                vm.lea(VReg.V1, funcLabel);
                vm.movImm64(VReg.V2, 0x7fff000000000000n);
                vm.or(VReg.V1, VReg.V1, VReg.V2);  // V1 = tagged function address
                vm.store(VReg.V0, 0, VReg.V1);  // Store into box
            }
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

// Collect all export names from a module AST
// If _moduleOrder and _moduleExportsList are provided, resolve export * from other modules
function collectModuleExports(moduleAst, _moduleOrder = null, _nodeShimPath = null, _moduleExportsList = null, _path = null, _fs = null) {
    const exports = [];

    for (const stmt of moduleAst.body) {
        // Debug: log all statement types for index.js
        if (moduleAst.filename && moduleAst.filename.includes('index.js') && moduleAst.filename.includes('runtime/node')) {
            console.log("DEBUG collectModuleExports: index.js stmt type=" + stmt.type + ", decl=" + (stmt.declaration ? 'yes' : 'no') + ", spec=" + (stmt.specifiers ? stmt.specifiers.length : 'none'));
        }
        if (stmt.type === "ExportDeclaration" && stmt.declaration) {
            const decl = stmt.declaration;
            if (decl.type === "VariableDeclaration") {
                for (const decl2 of decl.declarations) {
                    if (decl2.id && decl2.id.type === "Identifier") {
                        exports.push({ name: decl2.id.name, kind: "const" });
                    }
                }
            } else if (decl.type === "FunctionDeclaration") {
                exports.push({ name: decl.id.name, kind: "function" });
            } else if (decl.type === "ClassDeclaration") {
                exports.push({ name: decl.id.name, kind: "class" });
            } else if (decl.type === "Identifier") {
                exports.push({ name: decl.name, kind: "reexport" });
            }
        } else if (stmt.type === "ExportDeclaration" && !stmt.declaration && stmt.specifiers) {
            if (Array.isArray(stmt.specifiers)) {
                // Check for export * from "module" (empty specifiers array in JSBin's parser)
                if (stmt.specifiers.length === 0 && stmt.source) {
                    // This is export * from "module"
                    const sourcePath = stmt.source.value;
                    console.log("DEBUG collectModuleExports: Found export * from " + sourcePath + ", _moduleOrder=" + (_moduleOrder ? "yes" : "no") + ", _nodeShimPath=" + (_nodeShimPath ? "yes" : "no"));
                    if (sourcePath && _moduleOrder && _nodeShimPath) {
                        // Resolve the source module index
                        let resolvedPath = sourcePath;
                        console.log("DEBUG: export * before resolve, sourcePath=" + sourcePath + ", filename=" + moduleAst.filename);
                        if (sourcePath.startsWith(".") || sourcePath.startsWith("/")) {
                            const currentDir = moduleAst.filename ? _path.dirname(moduleAst.filename) : '.';
                            resolvedPath = _path.resolve(currentDir, sourcePath);
                            console.log("DEBUG: export * after resolve, resolvedPath=" + resolvedPath);
                            if (!resolvedPath.endsWith(".js") && !_fs.existsSync(resolvedPath)) {
                                if (_fs.existsSync(resolvedPath + ".js")) {
                                    resolvedPath += ".js";
                                } else if (_fs.existsSync(_path.join(resolvedPath, "index.js"))) {
                                    resolvedPath = _path.join(resolvedPath, "index.js");
                                }
                            }
                        } else if (!sourcePath.startsWith("node:") && !sourcePath.includes("/")) {
                            // Node module - redirect to shim
                            resolvedPath = _nodeShimPath;
                        }

                        // Find the module index
                        let sourceModuleIndex = -1;
                        for (let i = 0; i < _moduleOrder.length; i++) {
                            if (_moduleOrder[i].filename === resolvedPath) {
                                sourceModuleIndex = i;
                                break;
                            }
                        }

                        console.log("DEBUG: export * check: sourceModuleIndex=" + sourceModuleIndex + ", _moduleExportsList len=" + (_moduleExportsList ? _moduleExportsList.length : "null"));
                        if (sourceModuleIndex >= 0 && _moduleExportsList && _moduleExportsList[sourceModuleIndex]) {
                            // Resolve star export by getting exports from source module
                            const sourceExports = _moduleExportsList[sourceModuleIndex];
                            console.log("DEBUG: Resolving export * from " + sourcePath + " (module " + sourceModuleIndex + "), sourceExports=" + JSON.stringify(sourceExports));
                            for (const exp of sourceExports) {
                                // Skip default export and duplicates
                                if (exp.name === 'default') continue;
                                if (exports.find(e => e.name === exp.name)) {
                                    console.log("DEBUG: Skipping duplicate export " + exp.name);
                                    continue;
                                }
                                exports.push({
                                    name: exp.name,
                                    kind: "reexport",
                                    sourceModuleIndex: sourceModuleIndex
                                });
                            }
                        } else if (sourceModuleIndex >= 0) {
                            // Source module not yet processed - defer
                            console.log("DEBUG: Source module " + sourceModuleIndex + " not yet processed, deferring export *");
                            exports.push({
                                name: "*",
                                source: sourcePath,
                                resolvedPath: resolvedPath,
                                sourceModuleIndex: sourceModuleIndex,
                                kind: "star"
                            });
                        } else {
                            console.log("DEBUG: export * from " + sourcePath + " - sourceModuleIndex is " + sourceModuleIndex);
                        }
                    }
                } else {
                    // Regular export with specifiers
                    for (const spec of stmt.specifiers) {
                        if (spec.exported) {
                            // spec.imported is set when re-exporting from another module
                            // e.g., export { os } from "./os.js" - imported.name = "os"
                            // For local export { os }, imported is undefined
                            const isReexportFromModule = spec.imported !== undefined;
                            exports.push({
                                name: spec.exported.name || spec.exported.value,
                                kind: isReexportFromModule ? "reexport" : "local"
                            });
                        }
                    }
                }
            }
        } else if (stmt.type === "ExportAllDeclaration") {
            // export * from "./os.js"
            const sourcePath = stmt.source ? stmt.source.value : null;
            console.log("DEBUG collectModuleExports: Found ExportAllDeclaration, source=" + sourcePath);
            if (sourcePath && _moduleOrder && _nodeShimPath) {
                // Resolve the source module index
                let resolvedPath = sourcePath;
                if (sourcePath.startsWith(".") || sourcePath.startsWith("/")) {
                    const currentDir = moduleAst.filename ? require('path').dirname(moduleAst.filename) : '.';
                    resolvedPath = require('path').resolve(currentDir, sourcePath);
                    if (!resolvedPath.endsWith(".js") && !require('fs').existsSync(resolvedPath)) {
                        if (require('fs').existsSync(resolvedPath + ".js")) {
                            resolvedPath += ".js";
                        } else if (require('fs').existsSync(require('path').join(resolvedPath, "index.js"))) {
                            resolvedPath = require('path').join(resolvedPath, "index.js");
                        }
                    }
                } else if (!sourcePath.startsWith("node:") && !sourcePath.includes("/")) {
                    // Node module - redirect to shim
                    resolvedPath = _nodeShimPath;
                }

                // Find the module index
                let sourceModuleIndex = -1;
                for (let i = 0; i < _moduleOrder.length; i++) {
                    if (_moduleOrder[i].filename === resolvedPath) {
                        sourceModuleIndex = i;
                        break;
                    }
                }

                if (sourceModuleIndex >= 0 && _moduleExportsList && _moduleExportsList[sourceModuleIndex]) {
                    // Resolve star export by getting exports from source module
                    // _moduleExportsList[sourceModuleIndex] is available if source module was already processed
                    const sourceExports = _moduleExportsList[sourceModuleIndex];
                    console.log("DEBUG: Resolving export * from " + sourcePath + " (module " + sourceModuleIndex + "), _moduleExportsList has " + (_moduleExportsList ? _moduleExportsList.length : "null") + " entries, sourceExports=" + JSON.stringify(sourceExports));
                    for (const exp of sourceExports) {
                        // Skip default export and duplicates
                        if (exp.name === 'default') continue;
                        if (exports.find(e => e.name === exp.name)) {
                            console.log("DEBUG: Skipping duplicate export " + exp.name);
                            continue;
                        }
                        exports.push({
                            name: exp.name,
                            kind: "reexport",
                            sourceModuleIndex: sourceModuleIndex
                        });
                    }
                } else if (sourceModuleIndex >= 0) {
                    // Source module not yet processed - this shouldn't happen in normal flow
                    console.log("DEBUG: Source module " + sourceModuleIndex + " not yet processed, deferring export *");
                    exports.push({
                        name: "*",
                        source: sourcePath,
                        resolvedPath: resolvedPath,
                        sourceModuleIndex: sourceModuleIndex,
                        kind: "star"
                    });
                } else {
                    console.log("DEBUG: export * from " + sourcePath + " - sourceModuleIndex is " + sourceModuleIndex);
                }
            }
        }
    }
    return exports;
}
