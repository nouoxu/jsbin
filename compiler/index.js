// JSBin 统一编译器 - 重构版
// 将 JavaScript 源码编译为各平台可执行文件
//
// 模块化结构:
// - core/: 上下文、平台、类型、代码生成、模块管理
// - expressions/: 表达式编译
// - functions/: 函数和语句编译
// - output/: 库文件、包装器、二进制生成

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

// 语言前端
import { Lexer, Parser } from "../lang/index.js";
import { analyzeCapturedVariables, analyzeSharedVariables, analyzeTopLevelSharedVariables, usesArgumentsObject } from "../lang/analysis/closure.js";

// 虚拟机和汇编器
import { VirtualMachine, VReg } from "../vm/index.js";
import { ARM64Assembler } from "../asm/arm64.js";
import { X64Assembler } from "../asm/x64.js";

// 运行时
import { AllocatorGenerator, RuntimeGenerator, NumberGenerator, MathGenerator, SymbolGenerator, WellKnownSymbolsGenerator, StringConstantsGenerator, AsyncGenerator, IteratorGenerator, ErrorGenerator, FSGenerator, PathGenerator, ProcessGenerator, OSGenerator, ChildProcessGenerator, CoercionGenerator, NetGenerator, CompilerFSGenerator } from "../runtime/index.js";

// 编译上下文和平台
import { CompileContext, CompileOptions, CompileResult } from "./core/context.js";
import { detectPlatform, getTargetInfo, resolveTarget, listTargets, TARGETS } from "./core/platform.js";
import { ModuleManager, ModuleExports, getModuleManager, resetModuleManager } from "./core/modules.js";

// 编译器模块
import { StatementCompiler } from "./functions/statements.js";
import { ExpressionCompiler } from "./expressions/expressions.js";
import { FunctionCompiler } from "./functions/functions.js";
import { isAsyncFunction } from "./async/index.js";

// 输出模块
import { parseJslibFile, LibraryManager } from "./output/library.js";
import { WrapperGenerator } from "./output/wrapper.js";
import { BinaryOutputGenerator } from "./output/generator.js";
import { SourceMapGenerator } from "./output/sourcemap.js";

// 优化器
import { InlineAnalyzer, InlineCodeGenerator, createInlineGenerator } from "./optimize/inline.js";
import { InlineCacheManager, ICRuntimeGenerator, createInlineCacheManager } from "./optimize/ic.js";
import { GenerationalGCManager, GenerationalGCRuntimeGenerator, createGenerationalGCManager } from "./optimize/generational_gc.js";

// 静态链接器
import { StaticLinker } from "../binary/static_linker.js";

// 重新导出
export { detectPlatform, getTargetInfo, resolveTarget, listTargets, TARGETS } from "./core/platform.js";
export { CompileContext, CompileOptions, CompileResult } from "./core/context.js";
export { BinaryGenerator, OutputType, pageAlign, align16, align } from "../binary/binary_format.js";
export { parseJslibFile, LibraryManager } from "./output/library.js";
export { SourceMapGenerator } from "./output/sourcemap.js";
export { ModuleManager, getModuleManager } from "./core/modules.js";

// 目标平台配置 - 使用函数来避免模块初始化问题
function getTargets() {
    return {
        "linux-arm64": { arch: "arm64", os: "linux", ext: "" },
        "linux-x64": { arch: "x64", os: "linux", ext: "" },
        "macos-arm64": { arch: "arm64", os: "macos", ext: "" },
        "macos-x64": { arch: "x64", os: "macos", ext: "" },
        "windows-x64": { arch: "x64", os: "windows", ext: ".exe" },
    };
}

export class Compiler {
    constructor(target) {
        console.log("[COMPILER] Constructor called, target:", target);
        this.target = target || "linux-arm64";
        console.log("[COMPILER] this.target =", this.target);

        // 使用直接字符串比较来避免计算属性访问问题 (selfhost bug workaround)
        // 因为 selfhost 中 Targets[this.target] 返回 undefined，即使 this.target === "macos-arm64"
        let targetInfo = null;
        if (this.target === "linux-arm64") {
            targetInfo = { arch: "arm64", os: "linux", ext: "" };
        } else if (this.target === "linux-x64") {
            targetInfo = { arch: "x64", os: "linux", ext: "" };
        } else if (this.target === "macos-arm64") {
            targetInfo = { arch: "arm64", os: "macos", ext: "" };
        } else if (this.target === "macos-x64") {
            targetInfo = { arch: "x64", os: "macos", ext: "" };
        } else if (this.target === "windows-x64") {
            targetInfo = { arch: "x64", os: "windows", ext: ".exe" };
        }

        console.log("[COMPILER] targetInfo =", targetInfo);

        if (!targetInfo) {
            throw new Error("Unknown target: " + target);
        }

        console.log("[COMPILER] Getting arch/os");
        this.arch = targetInfo.arch;
        this.os = targetInfo.os;
        console.log("[COMPILER] arch =", this.arch, ", os =", this.os);

        // 创建汇编器
        console.log("[COMPILER] Calling _initAssembler");
        this._initAssembler();
        console.log("[COMPILER] Assembler initialized");

        // 创建虚拟机 (VM 内部创建 backend)
        // 在 selfhost 中直接传递 this.arch/this.os (避免 const var = this.prop 的 bug)
        console.log("[COMPILER] Creating VirtualMachine");
        console.log("[COMPILER] Passing to VM: arch =", this.arch, ", os =", this.os);
        this.vm = new VirtualMachine(this.arch, this.os, this.asm);
        console.log("[COMPILER] VirtualMachine created");

        console.log("[COMPILER] Creating CompileContext");
        this.ctx = new CompileContext("main");
        console.log("[COMPILER] CompileContext created");

        // 库管理器
        console.log("[COMPILER] Creating LibraryManager");
        this.libManager = new LibraryManager();
        console.log("[COMPILER] LibraryManager created");

        // 模块管理器
        console.log("[COMPILER] Resetting ModuleManager");
        this.moduleManager = resetModuleManager();
        console.log("[COMPILER] ModuleManager reset");

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
        
        // 一次自举/二次自举模式
        this.bootstrapMode = false; // true = 二次自举，不加载外部库

        // Source Map 支持
        this.sourceMapGenerator = null;
        this.sourceContent = null;
        this.sourceIndex = 0;

        // 函数内联优化器
        this.inlineGenerator = null;
        this.inlineEnabled = false;

        // 内联缓存 (IC) 优化器
        this.icManager = null;
        this.icEnabled = false;

        // 分代 GC 优化器
        this.gcManager = null;
        this.gcEnabled = false;

        // 当前编译的模块路径
        this.currentModulePath = "";
        // 当前模块的导出信息
        this.currentModuleExports = null;
        // 导入的符号映射: 本地名 -> { modulePath, exportName, label }
        this.importedSymbols = new Map();

        // 兼容旧 API
        this.externalLibs = this.libManager.externalLibs;
        this.staticLibs = [];
        this.registeredDylibs = this.libManager.registeredDylibs;
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

    // 设置 bootstrap 模式 (二次自举)
    setBootstrapMode(enabled) {
        this.bootstrapMode = enabled;
        if (enabled) {
            console.log("[Bootstrap] 二次自举模式：不加载外部库");
        }
    }

    isBootstrapMode() {
        return this.bootstrapMode;
    }

    getOption(key) {
        return this.options[key];
    }

    /**
     * 记录 AST 节点到机器码的映射 (用于 Source Map)
     * @param {object} node - AST 节点 (需要有 loc 信息)
     */
    recordSourceMapping(node) {
        if (this.sourceMapGenerator && node && node.loc) {
            const codeOffset = this.asm.code.length;
            this.sourceMapGenerator.addMapping(codeOffset, node.loc.start.line, node.loc.start.column, this.sourceIndex);
        }
    }

    /**
     * 记录指定位置到机器码的映射
     * @param {number} line - 源代码行号 (1-based)
     * @param {number} column - 源代码列号 (0-based)
     */
    recordSourceMappingAt(line, column) {
        if (this.sourceMapGenerator) {
            const codeOffset = this.asm.code.length;
            this.sourceMapGenerator.addMapping(codeOffset, line, column, this.sourceIndex);
        }
    }

    addExternalLib(libInfo) {
        this.libManager.addExternalLib(libInfo);
    }

    addStaticLib(libInfo) {
        this.staticLibs.push(libInfo);
    }

    // ========== 库处理 ==========

    compileImportLibDeclaration(stmt) {
        // jslib 是内置库，一直加载
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

    // ========== 模块系统 ==========

    /**
     * 编译导入的模块
     * @param {string} modulePath - 模块的绝对路径
     * @returns {ModuleExports} 模块的导出信息
     */
    compileModule(modulePath) {
        // 内置模块不需要编译
        if (this.moduleManager.isBuiltinModule(modulePath)) {
            return null;
        }

        // 检查是否已编译
        if (this.moduleManager.isModuleCompiled(modulePath)) {
            return this.moduleManager.getModuleExports(modulePath);
        }

        // 检测循环依赖
        if (this.moduleManager.isModuleCompiling(modulePath)) {
            console.warn(`Circular dependency detected: ${modulePath}`);
            // 返回已有的部分导出信息（如果有的话）
            return this.moduleManager.getModuleExports(modulePath) || new ModuleExports(modulePath);
        }

        // 开始编译
        this.moduleManager.beginCompileModule(modulePath);
        const modulePrefix = this.moduleManager.generateModulePrefix(modulePath);
        const moduleExports = new ModuleExports(modulePath);

        // 解析模块
        const ast = this.moduleManager.parseModuleFile(modulePath);

        // 先递归编译依赖的模块
        const deps = this.moduleManager.getModuleDependencies(ast, modulePath);
        for (const dep of deps) {
            this.compileModule(dep.resolved);
        }

        // 保存当前编译状态
        const savedModulePath = this.currentModulePath;
        const savedModuleExports = this.currentModuleExports;
        const savedImportedSymbols = this.importedSymbols;
        const savedCtx = this.ctx;

        // 设置新的编译状态
        this.currentModulePath = modulePath;
        this.currentModuleExports = moduleExports;
        this.importedSymbols = new Map();
        this.ctx = new CompileContext(modulePrefix + "module");

        // 处理导入声明
        this.processModuleImports(ast, modulePath);

        // 收集模块级常量（用于常量折叠）
        this.collectModuleConstants(ast);

        // 预注册导出变量到 importedSymbols，这样模块内的函数可以访问它们
        this.registerExportVariables(ast, modulePrefix, moduleExports);

        // 收集并编译模块中的函数
        this.collectModuleFunctions(ast, modulePrefix);
        this.compileModuleFunctions(modulePrefix);

        // 处理导出声明和模块初始化
        this.compileModuleBody(ast, modulePrefix, moduleExports);

        console.log("[COMPILE_MODULE] Ending compile for", modulePath, "initLabel:", moduleExports.initLabel);

        // 完成编译
        this.moduleManager.endCompileModule(modulePath, moduleExports);

        // 恢复编译状态
        this.currentModulePath = savedModulePath;
        this.currentModuleExports = savedModuleExports;
        this.importedSymbols = savedImportedSymbols;
        this.ctx = savedCtx;

        return moduleExports;
    }

    /**
     * 处理模块的导入声明
     */
    processModuleImports(ast, modulePath) {
        for (const stmt of ast.body) {
            if (stmt.type === "ImportDeclaration" && stmt.source) {
                const specifier = stmt.source.value;
                const resolvedPath = this.moduleManager.resolveModulePath(specifier, modulePath);

                if (!resolvedPath) {
                    console.warn(`Cannot resolve import: ${specifier}`);
                    continue;
                }

                // 处理内置模块
                if (resolvedPath.startsWith("builtin:")) {
                    const builtinName = resolvedPath.substring(8); // 移除 "builtin:" 前缀
                    for (const spec of stmt.specifiers || []) {
                        const localName = spec.local.name;
                        // 标记为内置模块，编译时会被特殊处理
                        this.importedSymbols.set(localName, {
                            modulePath: resolvedPath,
                            exportName: spec.default ? "default" : "*",
                            builtinName: builtinName,
                            type: "builtin",
                        });
                    }
                    continue;
                }

                const moduleExports = this.moduleManager.getModuleExports(resolvedPath);
                if (!moduleExports) {
                    console.warn(`Module not compiled: ${resolvedPath}`);
                    continue;
                }
                // Debug: 检查 types.js 的 exports
                if (resolvedPath.includes("types.js") && resolvedPath.includes("compiler/core")) {
                    console.log(`[DEBUG IMPORT] From ${modulePath} importing from ${resolvedPath}`);
                    console.log(`[DEBUG IMPORT] moduleExports object:`, moduleExports);
                    console.log(`[DEBUG IMPORT] moduleExports.functions:`, moduleExports.functions);
                    console.log(`[DEBUG IMPORT] moduleExports.named:`, moduleExports.named);
                    console.log(`[DEBUG IMPORT] Same as this.currentModuleExports?`, moduleExports === this.currentModuleExports);
                }

                // 处理导入说明符
                for (const spec of stmt.specifiers || []) {
                    if (spec.default) {
                        // import defaultExport from "module"
                        const localName = spec.local.name;
                        const label = moduleExports.default;
                        if (label) {
                            this.importedSymbols.set(localName, {
                                modulePath: resolvedPath,
                                exportName: "default",
                                label: label,
                                type: "default",
                            });
                        }
                    } else if (spec.namespace) {
                        // import * as name from "module"
                        const localName = spec.local.name;
                        this.importedSymbols.set(localName, {
                            modulePath: resolvedPath,
                            exportName: "*",
                            exports: moduleExports,
                            type: "namespace",
                        });
                    } else {
                        // import { a, b as c } from "module"
                        const localName = spec.local.name;
                        const importedName = spec.imported ? spec.imported.name : localName;
                        const label = moduleExports.getExport(importedName);
                        // Debug for types.js imports
                        if (resolvedPath.includes("compiler/core/types.js")) {
                            console.log(`[DEBUG IMPORT SPEC] ${modulePath}: Importing '${importedName}' as '${localName}', label:`, label);
                        }
                        if (label) {
                            // 检查是函数还是变量
                            const isFunc = moduleExports.functions.has(importedName);
                            const isClass = moduleExports.classes.has(importedName);
                            if (isClass) {
                                // 导入的是类
                                const classInfo = moduleExports.getClass(importedName);
                                this.importedSymbols.set(localName, {
                                    modulePath: resolvedPath,
                                    exportName: importedName,
                                    constructorLabel: classInfo.constructorLabel,
                                    classInfoLabel: classInfo.classInfoLabel,
                                    labelId: classInfo.labelId,
                                    type: "class",
                                });
                            } else {
                                this.importedSymbols.set(localName, {
                                    modulePath: resolvedPath,
                                    exportName: importedName,
                                    label: label,
                                    type: isFunc ? "function" : "variable",
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * 收集模块中的函数声明
     */
    collectModuleFunctions(ast, modulePrefix) {
        for (const stmt of ast.body) {
            if (stmt.type === "FunctionDeclaration" && stmt.id) {
                const originalName = stmt.id.name;
                const funcName = modulePrefix + originalName;
                const funcLabel = "_user_" + funcName;
                this.ctx.registerFunction(funcName, stmt);
                // 注册到 importedSymbols，使模块内部可以用原始名称调用
                this.importedSymbols.set(originalName, {
                    modulePath: this.currentModulePath,
                    exportName: originalName,
                    label: funcLabel,
                    type: "function",
                });
            } else if (stmt.type === "ClassDeclaration" && stmt.id) {
                // 收集类声明
                const originalName = stmt.id.name;
                const labelId = this.nextLabelId();
                const constructorLabel = `_class_${modulePrefix}${originalName}_${labelId}`;
                const classInfoLabel = `_class_info_${modulePrefix}${originalName}`;
                // 注册到 importedSymbols，使模块内部可以用原始名称实例化
                this.importedSymbols.set(originalName, {
                    modulePath: this.currentModulePath,
                    exportName: originalName,
                    constructorLabel: constructorLabel,
                    classInfoLabel: classInfoLabel,
                    labelId: labelId,
                    type: "class",
                });
                // 同时注册到上下文的类表
                this.ctx.classes[originalName] = {
                    constructorLabel: constructorLabel,
                    classInfoLabel: classInfoLabel,
                    labelId: labelId,
                    modulePrefix: modulePrefix,
                };
            } else if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                const decl = stmt.declaration;
                if (decl.type === "FunctionDeclaration" && decl.id) {
                    const originalName = decl.id.name;
                    const funcName = modulePrefix + originalName;
                    const funcLabel = "_user_" + funcName;
                    this.ctx.registerFunction(funcName, decl);
                    // 注册到 importedSymbols，使模块内部可以用原始名称调用
                    this.importedSymbols.set(originalName, {
                        modulePath: this.currentModulePath,
                        exportName: originalName,
                        label: funcLabel,
                        type: "function",
                    });
                } else if (decl.type === "ClassDeclaration" && decl.id) {
                    // 收集导出的类声明
                    const originalName = decl.id.name;
                    const labelId = this.nextLabelId();
                    const constructorLabel = `_class_${modulePrefix}${originalName}_${labelId}`;
                    const classInfoLabel = `_class_info_${modulePrefix}${originalName}`;
                    this.importedSymbols.set(originalName, {
                        modulePath: this.currentModulePath,
                        exportName: originalName,
                        constructorLabel: constructorLabel,
                        classInfoLabel: classInfoLabel,
                        labelId: labelId,
                        type: "class",
                    });
                    this.ctx.classes[originalName] = {
                        constructorLabel: constructorLabel,
                        classInfoLabel: classInfoLabel,
                        labelId: labelId,
                        modulePrefix: modulePrefix,
                    };
                }
            }
        }
    }

    /**
     * 编译模块中的函数
     */
    compileModuleFunctions(modulePrefix) {
        for (const name in this.ctx.functions) {
            if (name.startsWith(modulePrefix)) {
                this.compileFunction(name, this.ctx.functions[name]);
            }
        }
    }

    /**
     * 估算模块初始化函数所需的栈空间
     */
    estimateModuleStackSize(ast) {
        let count = 0;

        const countInNode = (node) => {
            if (!node) return;

            switch (node.type) {
                case "VariableDeclaration":
                    for (const decl of node.declarations || []) {
                        count += this.countBindingPattern(decl.id);
                    }
                    break;

                case "FunctionDeclaration":
                case "FunctionExpression":
                case "ArrowFunctionExpression":
                    // 不递归进入嵌套函数
                    break;

                case "ExpressionStatement":
                    count += 2; // 临时变量
                    break;

                case "BlockStatement":
                    for (const stmt of node.body || []) {
                        countInNode(stmt);
                    }
                    break;

                default:
                    // 遍历子节点
                    for (const key in node) {
                        const value = node[key];
                        if (value && typeof value === "object") {
                            if (Array.isArray(value)) {
                                for (const item of value) {
                                    if (item && typeof item === "object" && item.type) {
                                        countInNode(item);
                                    }
                                }
                            } else if (value.type) {
                                countInNode(value);
                            }
                        }
                    }
            }
        };

        // 统计模块顶层语句
        for (const stmt of ast.body || []) {
            if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                countInNode(stmt.declaration);
            } else if (stmt.type !== "FunctionDeclaration" && stmt.type !== "ImportDeclaration") {
                countInNode(stmt);
            }
        }

        // 添加余量
        return count + 16;
    }

    /**
     * 编译模块主体（处理导出和顶层代码）
     */
    compileModuleBody(ast, modulePrefix, moduleExports) {
        const vm = this.vm;
        const initLabel = modulePrefix + "init";

        // 保存 initLabel 到 moduleExports，供入口点调用
        moduleExports.initLabel = initLabel;

        // 估算模块初始化函数所需的栈空间
        // 对于大型模块（如 cli.js 自举），需要更大的栈空间
        // 基于 AST 大小和复杂度的估算往往不够准确
        // 使用更保守的估算：每个局部变量 8 字节 + 基础 256 字节 + 每个表达式语句额外 16 字节
        const estimatedLocals = this.estimateModuleStackSize(ast);
        // 增加安全余量：至少 2048 字节，或者估算值的 4 倍
        const stackSize = Math.max(2048, Math.ceil((estimatedLocals * 32 + 512) / 16) * 16);
        this.ctx.allocatedStackSize = stackSize;

        // 生成模块初始化函数
        vm.label(initLabel);
        vm.prologue(stackSize, [VReg.S0, VReg.S1]);

        // 处理导出声明
        for (const stmt of ast.body) {
            if (stmt.type === "ExportDeclaration") {
                this.processExportDeclaration(stmt, modulePrefix, moduleExports);
            }
        }

        // 编译顶层语句（非函数声明和导入/导出）
        for (const stmt of ast.body) {
            if (stmt.type !== "FunctionDeclaration" && stmt.type !== "ImportDeclaration" && stmt.type !== "ExportDeclaration") {
                this.compileStatement(stmt);
            } else if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                // 对于导出声明中的变量，需要编译变量初始化并存储到全局位置
                if (stmt.declaration.type === "VariableDeclaration") {
                    this.compileExportVariableInit(stmt.declaration, modulePrefix, moduleExports);
                }
                // 注意：类声明已在 processExportDeclaration 中通过 compileStatement 编译
            }
        }

        vm.epilogue([VReg.S0, VReg.S1], stackSize);
    }

    /**
     * 处理导出声明
     */
    processExportDeclaration(stmt, modulePrefix, moduleExports) {
        if (stmt.default) {
            // export default ...
            if (stmt.declaration) {
                if (stmt.declaration.type === "FunctionDeclaration" && stmt.declaration.id) {
                    const funcLabel = "_user_" + modulePrefix + stmt.declaration.id.name;
                    moduleExports.setDefault(funcLabel);
                    moduleExports.addFunction(stmt.declaration.id.name, funcLabel);
                } else if (stmt.declaration.type === "Identifier") {
                    // export default someVar
                    const varName = stmt.declaration.name;
                    const globalLabel = this.ctx.allocGlobal(modulePrefix + varName);
                    moduleExports.setDefault(globalLabel);
                }
            }
        } else if (stmt.declaration) {
            // export function/const/let/var/class
            if (stmt.declaration.type === "FunctionDeclaration" && stmt.declaration.id) {
                const funcName = stmt.declaration.id.name;
                const funcLabel = "_user_" + modulePrefix + funcName;
                // Debug
                if (this.currentModulePath && this.currentModulePath.includes("compiler/core/types.js")) {
                    console.log(`[DEBUG EXPORT] types.js exporting function: ${funcName} -> ${funcLabel}`);
                }
                moduleExports.addFunction(funcName, funcLabel);
            } else if (stmt.declaration.type === "ClassDeclaration" && stmt.declaration.id) {
                // 导出类 - 先编译类声明以注册类信息
                const className = stmt.declaration.id.name;

                // 先编译类声明，这会在 ctx.classes 中注册类信息
                this.compileStatement(stmt.declaration);

                // 然后从已注册的类信息中获取并导出
                const classInfo = this.ctx.classes[className];
                if (classInfo) {
                    moduleExports.addClass(className, {
                        constructorLabel: classInfo.constructorLabel,
                        classInfoLabel: classInfo.classInfoLabel,
                        labelId: classInfo.labelId,
                    });
                } else {
                    console.warn(`Warning: Class '${className}' not found after compilation in module ${this.currentModulePath}`);
                }
            } else if (stmt.declaration.type === "VariableDeclaration") {
                // 变量已在 registerExportVariables 中预注册，这里跳过
                // 变量初始化在 compileModuleBody 中的 compileExportVariableInit 处理
            }
        } else if (stmt.specifiers && stmt.specifiers.length > 0) {
            // export { a, b as c } 或 export { a, b as c } from "module"
            if (stmt.source) {
                // 重导出: export { ... } from "module"
                const sourceModule = stmt.source.value;
                const resolvedPath = this.moduleManager.resolveModulePath(sourceModule, this.currentModulePath);
                if (resolvedPath && !this.moduleManager.isBuiltinModule(resolvedPath)) {
                    // 先编译源模块
                    const sourceExports = this.compileModule(resolvedPath);
                    for (const spec of stmt.specifiers) {
                        const localName = spec.local ? spec.local.name : null;
                        const exportedName = spec.exported ? spec.exported.name : localName;
                        if (localName) {
                            // 检查是否是类的重导出
                            if (sourceExports.classes.has(localName)) {
                                const classInfo = sourceExports.getClass(localName);
                                moduleExports.addClass(exportedName, classInfo);
                            } else if (sourceExports.functions.has(localName)) {
                                // 函数重导出
                                const funcLabel = sourceExports.functions.get(localName);
                                moduleExports.addFunction(exportedName, funcLabel);
                            } else {
                                const label = sourceExports.getExport(localName);
                                if (label) {
                                    moduleExports.addNamed(exportedName, label);
                                }
                            }
                        }
                    }
                }
            } else {
                // 普通导出: export { a, b as c }
                for (const spec of stmt.specifiers) {
                    const localName = spec.local ? spec.local.name : null;
                    const exportedName = spec.exported ? spec.exported.name : localName;

                    if (localName) {
                        // 首先检查是否是导入的符号
                        if (this.importedSymbols.has(localName)) {
                            const importInfo = this.importedSymbols.get(localName);
                            moduleExports.addNamed(exportedName, importInfo.label);
                        } else {
                            // 查找本地符号
                            const funcLabel = "_user_" + modulePrefix + localName;
                            if (this.ctx.hasFunction(modulePrefix + localName)) {
                                moduleExports.addFunction(exportedName, funcLabel);
                            } else {
                                // 可能是变量
                                const globalLabel = this.ctx.getGlobal(modulePrefix + localName);
                                if (globalLabel) {
                                    moduleExports.addNamed(exportedName, globalLabel);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * 编译导出变量的初始化
     */
    compileExportVariableInit(varDecl, modulePrefix, moduleExports) {
        const vm = this.vm;
        for (const decl of varDecl.declarations) {
            if (decl.id && decl.id.type === "Identifier" && decl.init) {
                const varName = decl.id.name;
                const globalLabel = moduleExports.getExport(varName);
                if (globalLabel) {
                    // 编译初始化表达式
                    this.compileExpression(decl.init);
                    // 先保存表达式结果到 V1（因为 RET 和 V0 是同一个寄存器 X0）
                    vm.mov(VReg.V1, VReg.RET);
                    // 存储到全局位置
                    vm.lea(VReg.V0, globalLabel);
                    vm.store(VReg.V0, 0, VReg.V1);
                }
            }
        }
    }

    /**
     * 收集模块级常量（用于常量折叠）
     * 只收集初始值为字面量的 const 声明
     */
    collectModuleConstants(ast) {
        for (const stmt of ast.body) {
            // 直接的 const 声明
            if (stmt.type === "VariableDeclaration" && stmt.kind === "const") {
                this._collectConstDeclarations(stmt.declarations);
            }
            // export const 声明
            if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                if (stmt.declaration.type === "VariableDeclaration" && stmt.declaration.kind === "const") {
                    this._collectConstDeclarations(stmt.declaration.declarations);
                }
            }
        }
    }

    /**
     * 从声明列表中收集常量
     */
    _collectConstDeclarations(declarations) {
        for (const decl of declarations) {
            if (decl.id && decl.id.type === "Identifier" && decl.init) {
                const name = decl.id.name;
                const init = decl.init;

                // 只收集字面量初始值
                if (init.type === "Literal" || init.type === "NumericLiteral") {
                    const value = init.value;
                    let type;
                    if (typeof value === "number") {
                        type = "number";
                    } else if (typeof value === "string") {
                        type = "string";
                    } else if (typeof value === "boolean") {
                        type = "boolean";
                    } else {
                        continue; // 不支持的类型
                    }
                    this.ctx.registerModuleConstant(name, value, type);
                }
                // 支持负数: -42
                else if (init.type === "UnaryExpression" && init.operator === "-" && (init.argument.type === "Literal" || init.argument.type === "NumericLiteral")) {
                    const value = -init.argument.value;
                    this.ctx.registerModuleConstant(name, value, "number");
                }
            }
        }
    }

    /**
     * 预注册导出变量到 importedSymbols
     * 这需要在编译函数之前调用，以便模块内的函数可以访问这些变量
     */
    registerExportVariables(ast, modulePrefix, moduleExports) {
        for (const stmt of ast.body) {
            if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                if (stmt.declaration.type === "VariableDeclaration") {
                    for (const decl of stmt.declaration.declarations) {
                        if (decl.id && decl.id.type === "Identifier") {
                            const varName = decl.id.name;
                            const globalLabel = this.ctx.allocGlobal(modulePrefix + varName);
                            moduleExports.addVariable(varName, globalLabel);
                            // 为导出变量分配数据段空间
                            this.asm.addDataLabel(globalLabel);
                            // Manual Qword(0) emission to avoid BigInt issues
                            {
                                const misalign = this.asm.data.length & 7;
                                if (misalign !== 0) {
                                    const pad = 8 - misalign;
                                    for (let k = 0; k < pad; k++) this.asm.data.push(0);
                                }
                                for (let k = 0; k < 8; k++) this.asm.addDataByte(0);
                            }
                            // 注册到 importedSymbols，让模块内部可以通过变量名访问
                            this.importedSymbols.set(varName, {
                                modulePath: this.currentModulePath,
                                exportName: varName,
                                label: globalLabel,
                                type: "variable",
                            });
                        }
                    }
                }
            }
        }
    }

    /**
     * 检查符号是否是导入的
     */
    isImportedSymbol(name) {
        return this.importedSymbols.has(name);
    }

    /**
     * 获取导入符号的信息
     */
    getImportedSymbol(name) {
        return this.importedSymbols.get(name);
    }

    /**
     * 处理主模块的导入声明
     */
    processMainModuleImports(ast) {
        for (const stmt of ast.body) {
            if (stmt.type === "ImportDeclaration" && stmt.source) {
                const specifier = stmt.source.value;
                const resolvedPath = this.moduleManager.resolveModulePath(specifier, this.currentModulePath);

                if (!resolvedPath) {
                    console.warn(`Cannot resolve import: ${specifier}`);
                    continue;
                }

                // 处理内置模块
                if (this.moduleManager.isBuiltinModule(resolvedPath)) {
                    const builtinName = resolvedPath.substring(8); // 移除 "builtin:" 前缀
                    for (const spec of stmt.specifiers || []) {
                        const localName = spec.local.name;
                        // 标记为内置模块，编译时会被特殊处理
                        this.importedSymbols.set(localName, {
                            modulePath: resolvedPath,
                            exportName: spec.default ? "default" : "*",
                            builtinName: builtinName,
                            type: "builtin",
                        });
                    }
                    continue;
                }

                // 编译导入的模块
                const moduleExports = this.compileModule(resolvedPath);

                // 处理导入说明符
                for (const spec of stmt.specifiers || []) {
                    if (spec.default) {
                        // import defaultExport from "module"
                        const localName = spec.local.name;
                        const label = moduleExports.default;
                        if (label) {
                            this.importedSymbols.set(localName, {
                                modulePath: resolvedPath,
                                exportName: "default",
                                label: label,
                                type: "function",
                            });
                        }
                    } else if (spec.namespace) {
                        // import * as name from "module"
                        const localName = spec.local.name;
                        this.importedSymbols.set(localName, {
                            modulePath: resolvedPath,
                            exportName: "*",
                            exports: moduleExports,
                            type: "namespace",
                        });
                    } else {
                        // import { a, b as c } from "module"
                        const localName = spec.local.name;
                        const importedName = spec.imported ? spec.imported.name : localName;
                        const label = moduleExports.getExport(importedName);
                        if (label) {
                            // 检查是函数、变量还是类
                            const isFunc = moduleExports.functions.has(importedName);
                            const isClass = moduleExports.classes.has(importedName);
                            if (isClass) {
                                const classInfo = moduleExports.getClass(importedName);
                                this.importedSymbols.set(localName, {
                                    modulePath: resolvedPath,
                                    exportName: importedName,
                                    constructorLabel: classInfo.constructorLabel,
                                    classInfoLabel: classInfo.classInfoLabel,
                                    labelId: classInfo.labelId,
                                    type: "class",
                                });
                            } else {
                                this.importedSymbols.set(localName, {
                                    modulePath: resolvedPath,
                                    exportName: importedName,
                                    label: label,
                                    type: isFunc ? "function" : "variable",
                                });
                            }
                        } else {
                            console.warn(`Export '${importedName}' not found in ${resolvedPath}`);
                        }
                    }
                }
            }
        }
    }

    // ========== 编译流程 ==========

    nextLabelId() {
        return this.labelCounter++;
    }

    parse(source) {
        console.log("[parse] Creating Lexer");
        console.log("[parse] Source length:", source.length, "First 100 chars:", source.substring(0, 100));
        const lexer = new Lexer(source);
        console.log("[parse] Lexer created");
        console.log("[parse] Creating Parser");
        const parser = new Parser(lexer);
        console.log("[parse] Parser created");
        console.log("[parse] Parsing program");
        const ast = parser.parseProgram();
        console.log("[parse] Parse complete");
        return ast;
    }

    compile(source) {
        console.log("[compile] Starting");
        const ast = this.parse(source);
        console.log("[compile] Parse done");

        if (this.outputType === "shared" || this.outputType === "static") {
            console.log("[compile] Generating shared library runtime");
            this.generateSharedLibraryRuntime();
            this.compileProgramForLibrary(ast);
        } else {
            // 在生成运行时之前初始化 GC（如果启用），这样 generateRuntime 才能生成 _gc_init
            console.log("[compile] Checking GC option");
            if (this.options.gc === true) {
                this.gcManager = new GenerationalGCManager(this);
                this.gcEnabled = true;
                if (this.options.debug) {
                    console.log("Generational GC enabled");
                }
            }

            // 先生成运行时
            console.log("[compile] Generating runtime");
            this.generateRuntime();
            console.log("[compile] Runtime generated");

            // 编译程序（包括所有导入的模块）
            console.log("[compile] Compiling program");
            this.compileProgram(ast);
            console.log("[compile] Program compiled");

            // 然后生成入口点（此时模块已经编译完成，可以正确调用初始化函数）
            console.log("[compile] Generating entry");
            this.generateEntry();
            console.log("[compile] Entry generated");

            // 在编译程序后生成 IC 槽位（因为 IC 槽位是在编译过程中动态创建的）
            console.log("[compile] Generating IC slots");
            this.generateICSlots();
            console.log("[compile] IC slots generated");

            if (this.staticLibs && this.staticLibs.length > 0) {
                this.embedStaticLibraries();
            }
        }

        // 输出生成的指令序列（调试用）
        if (this.options.dumpAsm) {
            this.dumpAssembly();
        }

        console.log("[compile] Generating executable");
        return this.generateExecutable();
    }

    // 输出生成的指令/汇编序列（调试用）
    dumpAssembly() {
        console.log("\n=== Generated Instructions ===");
        console.log(`Target: ${this.target} (${this.arch})`);
        console.log(`Total VM instructions: ${this.vm.instructions.length}`);
        console.log("");

        // 分组显示指令
        let currentLabel = null;
        for (const inst of this.vm.instructions) {
            if (inst.op === "label") {
                currentLabel = inst.operands[0];
                console.log(`\n${currentLabel}:`);
            } else {
                console.log(`    ${inst.toString()}`);
            }
        }

        console.log("\n=== Labels ===");
        const labels = Array.from(this.asm.labels.keys());
        console.log(`Total labels: ${labels.length}`);
        // 只显示用户定义的标签（以 _user_ 开头的）
        const userLabels = labels.filter((l) => l.startsWith("_user_"));
        if (userLabels.length > 0) {
            console.log("User functions:");
            for (const label of userLabels) {
                console.log(`    ${label}: offset ${this.asm.labels.get(label)}`);
            }
        }

        console.log("\n=== Data Section ===");
        console.log(`Data size: ${this.asm.data.length} bytes`);

        console.log("\n=== Code Section ===");
        console.log(`Code size: ${this.asm.code.length} bytes`);
        console.log("==============================\n");
    }

    compileFile(inputFile, outputFile) {
        console.log("[compileFile] Starting, inputFile =", inputFile);
        
        // 根据 bootstrap 模式选择文件 API
        let source;
        if (this.bootstrapMode) {
            // 二次自举：使用内置 API
            source = this._readFileNative(inputFile);
        } else {
            // 一次自举：使用 Node.js API
            source = fs.readFileSync(inputFile, "utf-8");
        }
        console.log("[compileFile] Read source, length =", source.length);

        // 设置当前模块路径
        console.log("[compileFile] Setting currentModulePath");
        let currentPath;
        if (this.bootstrapMode) {
            currentPath = this._pathResolveNative(inputFile);
        } else {
            currentPath = path.resolve(inputFile);
        }
        this.currentModulePath = currentPath;
        console.log("[compileFile] currentModulePath =", this.currentModulePath);

        console.log("[compileFile] Adding search path");
        let dirPath;
        if (this.bootstrapMode) {
            dirPath = this._pathDirnameNative(this.currentModulePath);
        } else {
            dirPath = path.dirname(this.currentModulePath);
        }
        this.moduleManager.addSearchPath(dirPath);
        console.log("[compileFile] Search path added");

        if (!outputFile) {
            console.log("[compileFile] No outputFile, generating from baseName");
            let baseName;
            if (this.bootstrapMode) {
                baseName = this._pathBasenameNative(inputFile);
                // 去掉 .js 后缀
                baseName = baseName.replace(/\.js$/, "");
            } else {
                baseName = path.basename(inputFile, ".js");
            }
            // 使用 getTargets() 和已知的 ext 值来避免 selfhost 计算属性访问 bug
            let ext = "";
            if (this.target === "windows-x64") {
                ext = ".exe";
            }
            outputFile = baseName + ext;
            console.log("[compileFile] Generated outputFile =", outputFile);
        }

        this.outputFileName = outputFile;
        console.log("[compileFile] outputFileName set");

        // 初始化 Source Map (如果启用)
        console.log("[compileFile] Checking sourceMap option");
        if (this.options.sourceMap) {
            console.log("[compileFile] Initializing SourceMap");
            let baseName;
            if (this.bootstrapMode) {
                baseName = this._pathBasenameNative(outputFile);
            } else {
                baseName = path.basename(outputFile);
            }
            this.sourceMapGenerator = new SourceMapGenerator({
                file: baseName,
            });
            this.sourceContent = source;
            let srcBaseName;
            if (this.bootstrapMode) {
                srcBaseName = this._pathBasenameNative(inputFile);
            } else {
                srcBaseName = path.basename(inputFile);
            }
            this.sourceIndex = this.sourceMapGenerator.addSource(srcBaseName, source);
        }

        console.log("[compileFile] Calling compile");
        const result = this.compile(source);
        console.log("[compileFile] Compile done");

        if (result && result.type === "static") {
            const writeResult = this.writeStaticLibrary(result.objectData, outputFile);
            // 生成 jslib 声明文件 (除非禁用)
            if (!this.options.noJslib) {
                this.generateJslibFile(outputFile, "static");
            }
            return writeResult;
        }

        const binary = result;
        
        // 写入输出文件
        if (this.bootstrapMode) {
            this._writeFileNative(outputFile, Buffer.from(binary));
            this._chmodNative(outputFile, 0o755);
        } else {
            fs.writeFileSync(outputFile, Buffer.from(binary));
            fs.chmodSync(outputFile, 0o755);
        }

        // 生成 Source Map 文件
        if (this.options.sourceMap && this.sourceMapGenerator) {
            const mapFile = outputFile + ".map";
            if (this.bootstrapMode) {
                this._writeFileNative(mapFile, this.sourceMapGenerator.toFormattedString());
            } else {
                fs.writeFileSync(mapFile, this.sourceMapGenerator.toFormattedString());
            }
            console.log(`Generated source map: ${mapFile}`);
        }

        // 生成 jslib 声明文件 (仅共享库，除非禁用)
        if (this.outputType === "shared" && !this.options.noJslib) {
            this.generateJslibFile(outputFile, "shared");
        }

        return { output: outputFile, size: binary.length };
    }

    // ========== 二次自举内置 API ==========
    // 这些方法会被编译进二次自举的编译器二进制
    // 在运行时，这些调用编译好的 syscall 函数
    
    _readFileNative(path) {
        // 实际实现在运行时 - 调用 _compiler_open/read/close
        // 这里只是一个桥接，会被编译进二进制
        // 运行时通过嵌入的 CompilerFS 生成这些调用
        return this._readFileRuntime(path);
    }
    
    _readFileRuntime(path) {
        // 这个方法会被编译进二进制
        // 在运行时调用编译好的 _compiler_open, _compiler_read, _compiler_close
        // 注意：这是编译后的代码路径，不是解释执行
        throw new Error("Native file read not implemented - use bootstrap compiler");
    }
    
    _writeFileNative(path, data) {
        // 类似上面
        return this._writeFileRuntime(path, data);
    }
    
    _writeFileRuntime(path, data) {
        throw new Error("Native file write not implemented - use bootstrap compiler");
    }
    
    _chmodNative(path, mode) {
        // chmod 简化处理，直接返回成功
        return 0;
    }
    
    _pathResolveNative(...paths) {
        // 简单的路径解析
        let result = "";
        for (const p of paths) {
            if (p.startsWith("/")) {
                result = p;
            } else if (p.startsWith("./")) {
                result = result + p.slice(1);
            } else {
                if (result && !result.endsWith("/")) result += "/";
                result += p;
            }
        }
        return result || ".";
    }
    
    _pathDirnameNative(path) {
        const lastSlash = path.lastIndexOf("/");
        if (lastSlash === -1) return ".";
        if (lastSlash === 0) return "/";
        return path.substring(0, lastSlash);
    }
    
    _pathBasenameNative(path) {
        const lastSlash = path.lastIndexOf("/");
        if (lastSlash === -1) return path;
        return path.substring(lastSlash + 1);
    }

    // 生成 .jslib 声明文件
    generateJslibFile(outputFile, libType) {
        const baseName = path.basename(outputFile);
        const dirName = path.dirname(outputFile);
        // 去掉 lib 前缀和扩展名得到基础名
        let libName = baseName.replace(/^lib/, "").replace(/\.(dylib|so|dll|a|lib)$/, "");
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
        console.log("[generateRuntime] Creating AllocatorGenerator");
        const allocGen = new AllocatorGenerator(this.vm);
        console.log("[generateRuntime] AllocatorGenerator created");
        allocGen.generate();
        console.log("[generateRuntime] AllocatorGenerator.generate() done");
        const runtimeGen = new RuntimeGenerator(this.vm, this.ctx);
        console.log("[generateRuntime] RuntimeGenerator created");
        runtimeGen.generate();
        console.log("[generateRuntime] RuntimeGenerator.generate() done");
        
        // 编译器内置 FS (二次自举时使用)
        if (this.bootstrapMode) {
            console.log("[generateRuntime] Creating CompilerFSGenerator");
            const compilerFsGen = new CompilerFSGenerator(this.vm, this.arch, this.os);
            console.log("[generateRuntime] CompilerFSGenerator created");
            compilerFsGen.generate();
            console.log("[generateRuntime] CompilerFSGenerator.generate() done");
        }
        
        // 分代 GC 运行时
        if (this.gcEnabled && this.gcManager) {
            console.log("[generateRuntime] Generating GC runtime");
            const gcRuntimeGen = new GenerationalGCRuntimeGenerator(this.vm, this.ctx);
            gcRuntimeGen.generate();
        }
        console.log("[generateRuntime] Generating Data Section");
        this.generateDataSection();
        console.log("[generateRuntime] Data Section generated");
        // 注意：IC 槽位在 compileProgram 后通过 generateICSlots() 单独生成;
    }

    generateDataSection() {
        console.log("[DataSection] Starting");
        const numberGen = new NumberGenerator(this.vm, this.ctx);
        console.log("[DataSection] NumberGenerator");
        numberGen.generateDataSection(this.asm);
        // Math 数据段（常量和随机数状态）
        const mathGen = new MathGenerator(this.vm, this.ctx);
        console.log("[DataSection] MathGenerator");
        mathGen.generateDataSection(this.asm);
        // Symbol 数据段
        const symbolGen = new SymbolGenerator(this.vm, this.ctx);
        console.log("[DataSection] SymbolGenerator");
        symbolGen.generateDataSection(this.asm);
        const wellKnownSymbolsGen = new WellKnownSymbolsGenerator(this.vm, this.ctx);
        console.log("[DataSection] WellKnownSymbolsGenerator");
        wellKnownSymbolsGen.generateDataSection(this.asm);
        // Iterator 数据段
        const iteratorGen = new IteratorGenerator(this.vm, this.ctx);
        console.log("[DataSection] IteratorGenerator");
        iteratorGen.generateDataSection(this.asm);
        console.log("[DataSection] Done");
        // Error 数据段
        const errorGen = new ErrorGenerator(this.vm, this.ctx);
        errorGen.generateDataSection(this.asm);
        // FS/Path 数据段
        const fsGen = new FSGenerator(this.vm, this.ctx);
        fsGen.generateDataSection(this.asm);
        const pathGen = new PathGenerator(this.vm, this.ctx);
        pathGen.generateDataSection(this.asm);
        // Process 数据段
        const processGen = new ProcessGenerator(this.vm, this.ctx);
        processGen.generateDataSection(this.asm);
        // OS 数据段
        const osGen = new OSGenerator(this.vm, this.ctx);
        osGen.generateDataSection(this.asm);
        // Child Process 数据段
        const childProcessGen = new ChildProcessGenerator(this.vm, this.ctx);
        childProcessGen.generateDataSection(this.asm);
        // Coercion 数据段
        const coercionGen = new CoercionGenerator(this.vm);
        if (coercionGen.generateDataSection) {
            coercionGen.generateDataSection(this.asm);
        }
        // 私有字段字符串常量
        this.generatePrivateFieldStrings();
        // 分代 GC 数据段
        if (this.gcEnabled && this.gcManager) {
            this.gcManager.generateDataSection(this.asm);
        }
        // 注意：IC 槽位在 compile() 中 compileProgram 之后单独生成
    }

    generateICSlots() {
        // 为内联缓存生成数据段
        if (!this.icManager || !this.icEnabled) return;

        const slots = this.icManager.icSlots;
        if (slots.length === 0) return;

        // 生成 IC 槽位（每个槽位 24 字节：state + cached_count + offset）
        for (const slot of slots) {
            this.asm.addDataLabel(slot.label);
            // Manual Qword(0) emission for state, cached_count, offset
            for (let i = 0; i < 3; i++) {
                const misalign = this.asm.data.length & 7;
                if (misalign !== 0) {
                    const pad = 8 - misalign;
                    for (let k = 0; k < pad; k++) this.asm.data.push(0);
                }
                for (let k = 0; k < 8; k++) this.asm.addDataByte(0);
            }
        }
    }

    generatePrivateFieldStrings() {
        // 私有字段相关的字符串常量
        this._addPrivateString("_str_private_prefix", "__private_");
        this._addPrivateString("_str_brand_prefix", "__brand_");
        this._addPrivateString("_str_underscore", "_");
        this._addPrivateString("_str_private_error", "TypeError: Cannot access private field");
    }

    _addPrivateString(label, str) {
        this.asm.addDataLabel(label);
        for (let i = 0; i < str.length; i++) {
            this.asm.addDataByte(str.charCodeAt(i));
        }
        this.asm.addDataByte(0); // null 终止
    }

    generateSharedLibraryRuntime() {
        // 共享库不需要完整运行时
    }

    // ========== 入口点和程序编译 ==========

    generateEntry() {
        const vm = this.vm;
        vm.label("_start");

        // macOS 使用 LC_MAIN 入口点，参数通过寄存器传递：
        // x64: argc 在 A0 (RDI), argv 在 A1 (RSI)
        // arm64: argc 在 A0 (X0), argv 在 A1 (X1)
        //
        // Linux 使用传统的 _start 入口点，参数在栈上：
        // [SP] = argc, [SP+8] = argv[0], [SP+16] = argv[1], ...

        // 保存 argc 和 argv 到 callee-saved 寄存器
        if (this.os === "macos") {
            // macOS: 从寄存器获取
            vm.mov(VReg.S0, VReg.A0); // S0 = argc
            vm.mov(VReg.S1, VReg.A1); // S1 = argv
        } else if (this.os !== "windows") {
            // Linux: 从栈获取
            vm.load(VReg.S0, VReg.SP, 0); // S0 = argc
            vm.mov(VReg.S1, VReg.SP);
            vm.addImm(VReg.S1, VReg.S1, 8); // S1 = &argv[0]
        }

        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.call("_heap_init");

        // 初始化内置类的类信息对象（供继承使用）
        vm.call("_init_error_class_info");

        // 初始化 process.argv
        // S0 = argc, S1 = argv (指向 char* 数组的指针)
        
        if (this.os !== "windows") {
            vm.mov(VReg.A0, VReg.S0); // argc
            vm.mov(VReg.A1, VReg.S1); // argv
            vm.call("_process_argv_init");

            // 计算并保存 envp: envp = argv + (argc + 1) * 8
            // S0 = argc, S1 = argv
            vm.mov(VReg.V0, VReg.S0); // V0 = argc
            vm.addImm(VReg.V0, VReg.V0, 1); // V0 = argc + 1
            vm.shlImm(VReg.V0, VReg.V0, 3); // V0 = (argc + 1) * 8
            vm.add(VReg.V0, VReg.S1, VReg.V0); // V0 = argv + (argc + 1) * 8 = envp
            vm.lea(VReg.V1, "_process_envp_ptr");
            vm.store(VReg.V1, 0, VReg.V0); // 保存 envp
        }
        
        if (this.gcEnabled) {
            vm.call("_gc_init");
        }
        
        vm.call("_scheduler_init");

        // 调用所有已编译模块的初始化函数（按编译顺序）
        console.log("[ENTRY] Compiled modules count:", this.moduleManager.modules.size);
        for (const [modulePath, moduleExports] of this.moduleManager.modules) {
            console.log("[ENTRY] Module:", modulePath, "initLabel:", moduleExports.initLabel);
            if (moduleExports.initLabel) {
                vm.call(moduleExports.initLabel);
            }
        }

        // 如果是 compiler 模式，生成编译器后直接退出，不运行嵌入的 JS
        if (this.options.compiler) {
            vm.movImm(VReg.A0, 0);
            if (this.os === "windows") {
                vm.callWindowsExitProcess();
            } else if (this.arch === "arm64") {
                vm.syscall(this.os === "linux" ? 93 : 1);
            } else {
                vm.syscall(this.os === "linux" ? 60 : 0x2000001);
            }
            return;
        }

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
        console.log("DEBUG: compileProgram entry");

        // 先处理模块导入
        this.processMainModuleImports(ast);
        console.log("DEBUG: processMainModuleImports done");

        // 收集模块级常量（用于常量折叠）
        this.collectModuleConstants(ast);
        console.log("DEBUG: collectModuleConstants done");

        this.collectFunctions(ast);
        console.log("DEBUG: collectFunctions done");

        // 初始化函数内联优化器
        if (false && this.options.inline !== false) {
            this.inlineGenerator = createInlineGenerator(this);
            this.inlineGenerator.initialize();
            this.inlineEnabled = true;

            // 输出内联分析结果（调试用）
            if (this.options.debug) {
                const candidates = this.inlineGenerator.analyzer.getInlineCandidates();
                if (candidates.length > 0) {
                    console.log(`Inline candidates: ${candidates.join(", ")}`);
                }
            }
        }
        console.log("DEBUG: inlineGenerator init done");

        // 初始化内联缓存 (IC) 优化器
        if (false && this.options.ic !== false) {
            this.icManager = createInlineCacheManager(this);
            this.icEnabled = true;
        }
        console.log("DEBUG: icManager init done");

        // 初始化分代 GC（通过 --gc 选项启用）
        // 注意：可能已在 compile() 中初始化，检查避免重复
        if (this.options.gc === true && !this.gcManager) {
            this.gcManager = new GenerationalGCManager(this);
            this.gcEnabled = true;
            if (this.options.debug) {
                console.log("Generational GC enabled");
            }
        }
        console.log("DEBUG: gcManager init done");

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

        this.ctx.boxedVars = mainBoxedVars;
        console.log("DEBUG: boxedVars analysis done");

        const topLevelCapturedVars = analyzeTopLevelSharedVariables(ast);
        console.log("DEBUG: topLevelCapturedVars count: " + topLevelCapturedVars.size);
        for (const name of topLevelCapturedVars) {
            console.log("DEBUG: processing captured var " + name);
            const label = this.ctx.allocMainCapturedVar(name);
            this.asm.addDataLabel(label);
            // Manual Qword(0) emission
            {
                const misalign = this.asm.data.length & 7;
                if (misalign !== 0) {
                    const pad = 8 - misalign;
                    for (let k = 0; k < pad; k++) this.asm.data.push(0);
                }
                for (let k = 0; k < 8; k++) this.asm.addDataByte(0);
            }
        }

        vm.label("_main");
        // 分配较大的栈空间以容纳动态分配的局部变量（如数组方法的临时变量）
        // 使用 1024 字节以支持更多局部变量（之前 512 字节对于复杂程序不够）
        vm.prologue(1024, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);
        // 保留 callee-saved 寄存器占用的栈空间
        this.ctx.reserveCalleeSavedSpace(4); // S0, S1, S2, S3 = 4 个寄存器
        this.ctx.returnLabel = "_main_return";

        console.log("DEBUG: Starting main body loop");
        for (const stmt of ast.body) {
            console.log("DEBUG: Compiling stmt type: " + stmt.type);
            if (stmt.type !== "FunctionDeclaration") {
                this.compileStatement(stmt);
            }
        }
        console.log("DEBUG: Finished main body loop");

        vm.movImm(VReg.RET, 0);
        vm.label("_main_return");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 1024);

        console.log("DEBUG: Calling compileUserFunctions");
        this.compileUserFunctions();
        console.log("DEBUG: Calling generatePendingFunctions");
        this.generatePendingFunctions();
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
            } else if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                const decl = stmt.declaration;
                if (decl.type === "FunctionDeclaration" && decl.id) {
                    this.ctx.registerFunction(decl.id.name, decl);
                    if (!this.exports.includes(decl.id.name)) {
                        this.exports.push(decl.id.name);
                    }
                }
            }
        }
    }

    compileUserFunctions() {
        console.log("DEBUG: compileUserFunctions start. Functions count: " + Object.keys(this.ctx.functions).length);
        let count = 0;
        for (const name in this.ctx.functions) {
            count++;
            console.log("DEBUG: Loop name=" + name);
            try {
                const func = this.ctx.functions[name];
                console.log("DEBUG: Checking function " + name + ", func type=" + typeof func);

                if (!func) {
                    console.log("DEBUG: Function " + name + " is null/undefined");
                    continue;
                }

                // Skip numeric keys that might be artifacts (workaround for ghost "0" key issue)
                if (name === "0" || (name.match(/^\d+$/) && !func.type)) {
                    console.log("DEBUG: Skipping artifact function '" + name + "'");
                    continue;
                }

                if (!func.type) {
                    console.log("DEBUG: Function " + name + " has no type property. func=" + JSON.stringify(func));
                    continue;
                }

                this.compileFunction(name, func);
            } catch (e) {
                console.log("ERROR in compileUserFunctions for " + name + ": " + e);
                // Print stack if available, but in this limited env maybe not
            }
        }
        console.log("DEBUG: compileUserFunctions done, iterated " + count + " items");
    }

    compileFunction(name, func) {
        const vm = this.vm;
        const funcLabel = "_user_" + name;
        const returnLabel = funcLabel + "_return";

        const isAsync = isAsyncFunction(func);
        const isGenerator = func.generator === true;

        // Generator 函数需要特殊处理
        if (isGenerator) {
            this.compileGeneratorFunction(name, func);
            return;
        }

        const savedCtx = this.ctx;
        const savedImportedSymbols = this.importedSymbols; // 也保存 importedSymbols
        this.ctx = savedCtx.clone(name);
        this.ctx.returnLabel = returnLabel;
        this.ctx.inAsyncFunction = isAsync;

        const boxedVars = analyzeSharedVariables(func);
        this.ctx.boxedVars = boxedVars;

        // 估算所需栈空间
        const estimatedLocals = this.estimateStackSize(func);
        // 每个变量 8 字节，加上参数、callee-saved 寄存器和临时变量的余量
        // 对于复杂函数，增加更多余量以避免栈溢出
        // 对齐到 16 字节
        const stackSize = Math.max(128, Math.ceil((estimatedLocals * 16 + 128) / 16) * 16);
        this.ctx.allocatedStackSize = stackSize;

        vm.label(funcLabel);

        vm.prologue(stackSize, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);
        // 保留 callee-saved 寄存器占用的栈空间
        this.ctx.reserveCalleeSavedSpace(4); // S0, S1, S2, S3 = 4 个寄存器

        // 保存 V7（参数个数）到 S2 供 rest 参数使用
        // 注意：V7 可能在函数调用后被破坏，所以立即保存
        vm.mov(VReg.S2, VReg.V7);

        const params = func.params || [];
        const paramOffsets = [];
        const defaultParams = []; // 记录有默认值的参数
        let restParamInfo = null; // Rest 参数信息

        // 检查是否有 rest 参数（只能在最后一个）
        // 注意：解析器可能生成 RestElement 或 SpreadElement
        const lastParam = params.length > 0 ? params[params.length - 1] : null;
        const isRestParam = lastParam && (lastParam.type === "RestElement" || lastParam.type === "SpreadElement");
        if (isRestParam) {
            const restParam = lastParam;
            restParamInfo = {
                name: restParam.argument.name,
                startIndex: params.length - 1,
            };
        }

        // 正常参数的数量（不包括 rest）
        const normalParamCount = restParamInfo ? params.length - 1 : params.length;

        // 如果有 rest 参数或使用 arguments 对象，需要保存所有 6 个参数寄存器到栈上
        const needsSaveAllArgs = restParamInfo || usesArgumentsObject(func);
        const argsSaveOffsets = [];
        if (needsSaveAllArgs) {
            for (let i = 0; i < 6; i++) {
                const offset = this.ctx.allocLocal(`__arg_${i}`);
                argsSaveOffsets.push(offset);
                vm.store(VReg.FP, offset, vm.getArgReg(i));
            }
        }

        // 处理寄存器传递的参数（前 6 个）
        for (let i = 0; i < normalParamCount && i < 6; i++) {
            const param = params[i];
            let paramName = null;
            let hasDefault = false;
            let defaultValue = null;

            if (param.type === "Identifier") {
                paramName = param.name;
            } else if (param.type === "AssignmentPattern") {
                // 默认参数: b = 10
                paramName = param.left.name;
                hasDefault = true;
                defaultValue = param.right;
            }

            if (paramName) {
                const offset = this.ctx.allocLocal(paramName);
                paramOffsets.push({ name: paramName, offset: offset });
                // 如果需要保存所有参数（rest 或 arguments），从 argsSaveOffsets 复制
                // 否则直接从寄存器保存
                if (needsSaveAllArgs) {
                    vm.load(VReg.V0, VReg.FP, argsSaveOffsets[i]);
                    vm.store(VReg.FP, offset, VReg.V0);
                } else {
                    vm.store(VReg.FP, offset, vm.getArgReg(i));
                }

                if (hasDefault) {
                    defaultParams.push({ offset: offset, defaultValue: defaultValue });
                }
            }
        }

        // 处理栈传递的参数（第 7 个及之后）
        // 栈布局（调用后）：
        //   FP+16+... : 调用者 push 的栈参数
        //   FP+8      : 保存的 LR
        //   FP        : 保存的旧 FP
        //   FP-16     : 保存的 S0, S1
        //   FP-32     : 保存的 S2, S3
        //   FP-32-stackSize : SP (局部变量空间)
        //
        // 注意：callee-saved 寄存器保存在 FP **下方**（负偏移）
        // 栈参数在 FP **上方**（正偏移），从 FP + 16 开始
        const stackArgsBaseOffset = 16; // 跳过保存的 FP(8) + LR(8)

        for (let i = 6; i < normalParamCount; i++) {
            const param = params[i];
            let paramName = null;
            let hasDefault = false;
            let defaultValue = null;

            if (param.type === "Identifier") {
                paramName = param.name;
            } else if (param.type === "AssignmentPattern") {
                paramName = param.left.name;
                hasDefault = true;
                defaultValue = param.right;
            }

            if (paramName) {
                const offset = this.ctx.allocLocal(paramName);
                paramOffsets.push({ name: paramName, offset: offset });
                // 从栈上加载参数（相对于调用时的栈位置）
                const stackArgOffset = stackArgsBaseOffset + (i - 6) * 8;
                vm.load(VReg.V0, VReg.FP, stackArgOffset);
                vm.store(VReg.FP, offset, VReg.V0);

                if (hasDefault) {
                    defaultParams.push({ offset: offset, defaultValue: defaultValue });
                }
            }
        }

        // 处理默认参数：检查参数是否为 undefined，如果是则使用默认值
        for (const dp of defaultParams) {
            const skipDefaultLabel = `_skip_default_${this.ctx.labelId++}`;
            // 加载参数值
            vm.load(VReg.V0, VReg.FP, dp.offset);
            // 检查是否为 undefined (0x7FFB000000000000)
            vm.shrImm(VReg.V1, VReg.V0, 48);
            vm.movImm(VReg.V2, 0x7ffb);
            vm.cmp(VReg.V1, VReg.V2);
            vm.jne(skipDefaultLabel);
            // 是 undefined，编译并存储默认值
            this.compileExpression(dp.defaultValue);
            vm.store(VReg.FP, dp.offset, VReg.RET);
            vm.label(skipDefaultLabel);
        }

        // 处理 Rest 参数：收集剩余参数到数组
        if (restParamInfo) {
            const restOffset = this.ctx.allocLocal(restParamInfo.name);
            paramOffsets.push({ name: restParamInfo.name, offset: restOffset });

            // S2 已经在函数入口时保存了 V7（实际参数个数）
            const restStartIdx = restParamInfo.startIndex;

            // 创建空数组
            vm.movImm(VReg.A0, 0);
            vm.call("_array_new_with_size");
            vm.store(VReg.FP, restOffset, VReg.RET);

            // 循环添加剩余参数
            // S2 = 实际参数个数
            // S3 = 当前索引 (从 restStartIdx 开始)
            const loopLabel = `_rest_loop_${this.ctx.labelId++}`;
            const endLabel = `_rest_end_${this.ctx.labelId++}`;

            vm.movImm(VReg.S3, restStartIdx);

            vm.label(loopLabel);
            // if S3 >= S2, 跳出循环
            vm.cmp(VReg.S3, VReg.S2);
            vm.jge(endLabel);

            // 根据 S3 位置获取参数值
            // 如果 S3 < 6，从寄存器保存位置获取
            // 否则从栈获取
            const fromStackLabel = `_rest_from_stack_${this.ctx.labelId++}`;
            const gotArgLabel = `_rest_got_arg_${this.ctx.labelId++}`;

            vm.movImm(VReg.V0, 6);
            vm.cmp(VReg.S3, VReg.V0);
            vm.jge(fromStackLabel);

            // 从寄存器参数保存位置获取（根据索引计算偏移）
            // 参数 0-5 保存在 paramOffsets 数组的对应偏移
            // 这里需要动态计算，比较复杂，先简化处理：
            // 对于寄存器参数，我们在上面已经保存过了，可以通过 paramOffsets 找到
            // 但这里运行时不知道偏移，需要用一个 switch-like 结构
            // 简化：直接从已保存的参数位置加载
            // 实际上，由于我们知道 rest 开始的位置，可以:
            // - 如果 restStartIdx <= 5，需要从保存的参数寄存器位置获取前几个
            // - 如果 restStartIdx >= 6，所有 rest 参数都在栈上

            // 使用 argsSaveOffsets 来索引寄存器参数
            // 我们已经在函数入口保存了所有 6 个参数寄存器
            // 现在生成条件分支链来根据运行时索引 S3 加载对应参数

            for (let i = restStartIdx; i < 6; i++) {
                const nextCondLabel = `_rest_cond_${i}_next_${this.ctx.labelId++}`;
                vm.movImm(VReg.V0, i);
                vm.cmp(VReg.S3, VReg.V0);
                vm.jne(nextCondLabel);
                // 找到匹配的索引，从 argsSaveOffsets 加载参数值
                vm.load(VReg.V1, VReg.FP, argsSaveOffsets[i]);
                vm.jmp(gotArgLabel);
                vm.label(nextCondLabel);
            }

            // 如果没有匹配，说明索引 >= 6，但这里不应该执行到（上面 jge 会跳转）
            // 加载 undefined 作为默认值
            vm.movImm64(VReg.V1, "0x7ffb000000000000");
            vm.jmp(gotArgLabel);

            vm.label(fromStackLabel);
            // 从栈获取参数（索引 >= 6）
            // 栈参数偏移: FP + stackArgsBaseOffset + (S3 - 6) * 8
            vm.movImm(VReg.V0, 6);
            vm.sub(VReg.V2, VReg.S3, VReg.V0);
            vm.movImm(VReg.V0, 8);
            vm.mul(VReg.V2, VReg.V2, VReg.V0);
            vm.movImm(VReg.V0, stackArgsBaseOffset);
            vm.add(VReg.V2, VReg.V2, VReg.V0);
            // V2 = 偏移, FP + V2 = 地址
            vm.add(VReg.V0, VReg.FP, VReg.V2);
            vm.load(VReg.V1, VReg.V0, 0);

            vm.label(gotArgLabel);
            // V1 = 参数值，push 到 rest 数组
            vm.load(VReg.A0, VReg.FP, restOffset);
            vm.mov(VReg.A1, VReg.V1);
            vm.call("_array_push");
            vm.store(VReg.FP, restOffset, VReg.RET);

            // S3++
            vm.addImm(VReg.S3, VReg.S3, 1);
            vm.jmp(loopLabel);

            vm.label(endLabel);
        }

        // 创建 arguments 对象（如果函数中使用了 arguments）
        if (usesArgumentsObject(func)) {
            const argumentsOffset = this.ctx.allocLocal("arguments");

            // S2 已经在函数入口时保存了 V7（实际参数个数）

            // 创建空数组
            vm.movImm(VReg.A0, 0);
            vm.call("_array_new_with_size");
            vm.store(VReg.FP, argumentsOffset, VReg.RET);

            // 循环添加所有参数
            // S2 = 实际参数个数
            // S3 = 当前索引 (从 0 开始)
            const argsLoopLabel = `_args_loop_${this.ctx.labelId++}`;
            const argsEndLabel = `_args_end_${this.ctx.labelId++}`;

            vm.movImm(VReg.S3, 0);

            vm.label(argsLoopLabel);
            // if S3 >= S2, 跳出循环
            vm.cmp(VReg.S3, VReg.S2);
            vm.jge(argsEndLabel);

            // 根据 S3 位置获取参数值
            const argsFromStackLabel = `_args_from_stack_${this.ctx.labelId++}`;
            const argsGotArgLabel = `_args_got_arg_${this.ctx.labelId++}`;

            vm.movImm(VReg.V0, 6);
            vm.cmp(VReg.S3, VReg.V0);
            vm.jge(argsFromStackLabel);

            // 从保存的参数寄存器加载（使用 argsSaveOffsets）
            for (let i = 0; i < 6; i++) {
                const nextCondLabel = `_args_cond_${i}_next_${this.ctx.labelId++}`;
                vm.movImm(VReg.V0, i);
                vm.cmp(VReg.S3, VReg.V0);
                vm.jne(nextCondLabel);
                // 找到匹配的索引，从 argsSaveOffsets 加载参数值
                vm.load(VReg.V1, VReg.FP, argsSaveOffsets[i]);
                vm.jmp(argsGotArgLabel);
                vm.label(nextCondLabel);
            }

            // 没有匹配（不应该到达这里）
            vm.movImm64(VReg.V1, "0x7ffb000000000000");
            vm.jmp(argsGotArgLabel);

            vm.label(argsFromStackLabel);
            // 从栈获取参数（索引 >= 6）
            vm.movImm(VReg.V0, 6);
            vm.sub(VReg.V2, VReg.S3, VReg.V0);
            vm.movImm(VReg.V0, 8);
            vm.mul(VReg.V2, VReg.V2, VReg.V0);
            vm.movImm(VReg.V0, stackArgsBaseOffset);
            vm.add(VReg.V2, VReg.V2, VReg.V0);
            vm.add(VReg.V0, VReg.FP, VReg.V2);
            vm.load(VReg.V1, VReg.V0, 0);

            vm.label(argsGotArgLabel);
            // V1 = 参数值，push 到 arguments 数组
            vm.load(VReg.A0, VReg.FP, argumentsOffset);
            vm.mov(VReg.A1, VReg.V1);
            vm.call("_array_push");
            vm.store(VReg.FP, argumentsOffset, VReg.RET);

            // S3++
            vm.addImm(VReg.S3, VReg.S3, 1);
            vm.jmp(argsLoopLabel);

            vm.label(argsEndLabel);
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
            vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], this.ctx.allocatedStackSize);
        }

        this.generatePendingFunctions();
        this.ctx = savedCtx;
        this.importedSymbols = savedImportedSymbols; // 恢复 importedSymbols
    }

    /**
     * 估算函数所需的栈空间（局部变量数量）
     * 遍历 AST 统计变量声明
     */
    estimateStackSize(func) {
        let count = 0;

        const countInNode = (node) => {
            if (!node) return;

            switch (node.type) {
                case "VariableDeclaration":
                    // 每个声明器可能声明多个变量
                    for (const decl of node.declarations || []) {
                        count += this.countBindingPattern(decl.id);
                    }
                    break;

                case "FunctionDeclaration":
                case "FunctionExpression":
                case "ArrowFunctionExpression":
                    // 不递归进入嵌套函数
                    break;

                case "BlockStatement":
                    for (const stmt of node.body || []) {
                        countInNode(stmt);
                    }
                    break;

                case "IfStatement":
                    countInNode(node.consequent);
                    countInNode(node.alternate);
                    break;

                case "ForStatement":
                    countInNode(node.init);
                    countInNode(node.body);
                    count += 2; // 循环变量和临时变量
                    break;

                case "ForInStatement":
                case "ForOfStatement":
                    countInNode(node.left);
                    countInNode(node.body);
                    count += 3; // 迭代器、键/值、临时变量
                    break;

                case "WhileStatement":
                case "DoWhileStatement":
                    countInNode(node.body);
                    count += 1;
                    break;

                case "SwitchStatement":
                    for (const c of node.cases || []) {
                        for (const stmt of c.consequent || []) {
                            countInNode(stmt);
                        }
                    }
                    break;

                case "TryStatement":
                    countInNode(node.block);
                    if (node.handler) {
                        countInNode(node.handler.body);
                        count += 1; // catch 参数
                    }
                    if (node.finalizer) {
                        countInNode(node.finalizer);
                    }
                    count += 2; // 异常处理临时变量
                    break;

                case "ExpressionStatement":
                    // 某些表达式可能需要临时变量
                    count += 1;
                    // 递归检查表达式内部
                    countInNode(node.expression);
                    break;

                case "AssignmentExpression":
                    // 成员赋值表达式需要额外的临时变量
                    if (node.left && node.left.type === "MemberExpression") {
                        if (node.left.computed) {
                            // obj[key] = value 需要 3 个临时变量: idx, arr, val
                            count += 3;
                        } else {
                            // obj.prop = value 需要 1 个临时变量: obj
                            count += 1;
                        }
                    }
                    // 递归检查右侧表达式
                    countInNode(node.right);
                    break;

                case "CallExpression":
                    // 调用表达式可能需要临时变量存储参数
                    count += (node.arguments || []).length;
                    for (const arg of node.arguments || []) {
                        countInNode(arg);
                    }
                    break;

                default:
                    // 遍历所有子节点
                    for (const key in node) {
                        const value = node[key];
                        if (value && typeof value === "object") {
                            if (Array.isArray(value)) {
                                for (const item of value) {
                                    if (item && typeof item === "object" && item.type) {
                                        countInNode(item);
                                    }
                                }
                            } else if (value.type) {
                                countInNode(value);
                            }
                        }
                    }
            }
        };

        // 统计参数
        count += (func.params || []).length;

        // 统计函数体
        if (func.body) {
            countInNode(func.body);
        }

        // 添加额外余量用于临时变量和溢出
        // 每个函数调用可能需要额外临时变量，特别是大量赋值的场景
        return count + 32;
    }

    /**
     * 统计绑定模式中的变量数量
     */
    countBindingPattern(pattern) {
        if (!pattern) return 0;

        switch (pattern.type) {
            case "Identifier":
                return 1;

            case "ObjectPattern":
                let objCount = 0;
                for (const prop of pattern.properties || []) {
                    objCount += this.countBindingPattern(prop.value || prop.key);
                }
                return objCount;

            case "ArrayPattern":
                let arrCount = 0;
                for (const elem of pattern.elements || []) {
                    if (elem) {
                        arrCount += this.countBindingPattern(elem);
                    }
                }
                return arrCount;

            case "RestElement":
                return this.countBindingPattern(pattern.argument);

            case "AssignmentPattern":
                return this.countBindingPattern(pattern.left);

            default:
                return 1;
        }
    }

    // 编译顶层 Generator 函数声明
    compileGeneratorFunction(name, func) {
        const vm = this.vm;
        const funcLabel = "_user_" + name;
        const bodyLabel = "_gen_body_" + name;

        // 创建 Generator 工厂函数
        vm.label(funcLabel);
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        const params = func.params || [];

        // 计算局部变量数量
        const localsCount = this.countGeneratorLocals(func);

        // 创建 Generator 对象
        vm.lea(VReg.A0, bodyLabel); // func_ptr = body 函数
        vm.movImm(VReg.A1, 0); // 没有闭包
        vm.movImm(VReg.A2, localsCount + params.length); // locals_count
        vm.call("_generator_create");
        vm.mov(VReg.S1, VReg.RET); // S1 = Generator 对象

        // 将参数存储到 Generator 的 locals 区域
        for (let i = 0; i < params.length && i < 6; i++) {
            if (params[i].type === "Identifier") {
                vm.movImm(VReg.V0, 112 + i * 8);
                vm.add(VReg.V1, VReg.S1, VReg.V0);
                vm.store(VReg.V1, 0, vm.getArgReg(i));
            }
        }

        // 返回 Generator 对象
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        // 生成 Generator body 函数
        this.compileTopLevelGeneratorBody(func, bodyLabel, params.length);
    }

    // 计算 Generator 函数需要的局部变量数量
    countGeneratorLocals(func) {
        let count = 0;
        const countInBlock = (body) => {
            if (!body) return;
            const stmts = body.body || [body];
            for (const stmt of stmts) {
                if (stmt.type === "VariableDeclaration") {
                    count += stmt.declarations.length;
                } else if (stmt.type === "ForStatement" && stmt.init && stmt.init.type === "VariableDeclaration") {
                    count += stmt.init.declarations.length;
                }
            }
        };
        if (func.body && func.body.type === "BlockStatement") {
            countInBlock(func.body);
        }
        return count;
    }

    // 编译 Generator body 函数 (状态机方法)
    compileTopLevelGeneratorBody(func, bodyLabel, paramCount) {
        const vm = this.vm;
        const returnLabel = bodyLabel + "_return";
        const yieldReturnLabel = bodyLabel + "_yield_return";
        const startLabel = bodyLabel + "_start";

        // 保存和设置上下文
        const savedCtx = this.ctx;
        this.ctx = savedCtx.clone("gen_" + bodyLabel);

        vm.label(bodyLabel);
        vm.prologue(80, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // A0 = Generator 对象
        // A1 = resume_point (从 _generator_resume 传入)
        vm.mov(VReg.S5, VReg.A0); // generator pointer
        vm.mov(VReg.S4, VReg.A1); // resume_point

        // 同时保存到栈上的固定位置作为备份
        const genStackOffset = -72;
        vm.store(VReg.FP, genStackOffset, VReg.A0);

        // 设置上下文
        this.ctx.locals = {};
        this.ctx.stackOffset = 0;
        this.ctx.reserveCalleeSavedSpace(6);
        this.ctx.boxedVars = new Set();
        this.ctx.inGenerator = true;
        this.ctx.generatorReg = VReg.S5;
        this.ctx.generatorStackOffset = genStackOffset;
        this.ctx.returnLabel = returnLabel;
        this.ctx.yieldReturnLabel = yieldReturnLabel; // yield 专用返回标签
        this.ctx.generatorBodyLabel = bodyLabel;
        this.ctx.yieldCount = 0;
        this.ctx.resumeLabels = [];

        // 为参数创建局部变量引用
        const params = func.params || [];
        for (let i = 0; i < params.length; i++) {
            if (params[i].type === "Identifier") {
                vm.movImm(VReg.V0, 112 + i * 8);
                vm.add(VReg.V1, VReg.S5, VReg.V0);
                vm.load(VReg.V2, VReg.V1, 0);
                const offset = this.ctx.allocLocal(params[i].name);
                vm.store(VReg.FP, offset, VReg.V2);
            }
        }

        // 检查 resume_point，如果是 0 则从头开始，否则跳转到对应位置
        // 先生成一个临时的跳转检查（resume_point == 0 -> startLabel）
        vm.cmpImm(VReg.S4, 0);
        vm.jeq(startLabel);

        // 占位：跳转表将在函数体编译后生成
        const jumpTableLabel = bodyLabel + "_jumptable";
        vm.jmp(jumpTableLabel);

        // 函数开始标签
        vm.label(startLabel);

        // 编译函数体
        if (func.body && func.body.type === "BlockStatement") {
            for (const stmt of func.body.body) {
                this.compileStatement(stmt);
            }
        }

        // 如果函数自然结束（没有 return），返回 undefined
        vm.lea(VReg.RET, "_js_undefined");
        vm.load(VReg.RET, VReg.RET, 0);

        // 返回标签 - return 语句会跳转到这里
        vm.label(returnLabel);

        // 从栈上恢复 generator 指针
        vm.load(VReg.S5, VReg.FP, genStackOffset);

        // 设置状态为完成
        vm.movImm(VReg.V1, 3); // COMPLETED
        vm.store(VReg.S5, 8, VReg.V1);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 80);

        // yield 返回标签 - yield 会跳转到这里
        // 注意：yield 已经设置好了 state 和 yield_value
        vm.label(yieldReturnLabel);
        vm.movImm(VReg.RET, 0xdead); // 特殊标记
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 80);

        // 生成跳转表
        vm.label(jumpTableLabel);
        const resumeLabels = this.ctx.resumeLabels || [];
        for (const item of resumeLabels) {
            vm.cmpImm(VReg.S4, item.id);
            vm.jeq(item.label);
        }
        // 如果没有匹配的 resume_point，跳转到开始
        vm.jmp(startLabel);

        // 恢复上下文
        this.ctx = savedCtx;
    }

    // ========== 静态库支持 ==========

    embedStaticLibraries() {
        // 二次自举模式下跳过静态库
        if (this.bootstrapMode) {
            console.log("[Bootstrap] 跳过静态库链接");
            return;
        }
        
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
            this.asm.labels.set(name, finalOffset);
            if (!name.startsWith("_")) {
                this.asm.labels.set("_" + name, finalOffset);
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
        console.log("DEBUG: generateExecutable start");
        const allocGen = new AllocatorGenerator(this.vm);
        console.log("DEBUG: AllocatorGenerator created");
        allocGen.generateDataSection(this.asm);
        console.log("DEBUG: AllocatorGenerator.generateDataSection done");

        // 生成异步运行时数据段（调度器全局变量）
        const asyncGen = new AsyncGenerator(this.vm);
        console.log("DEBUG: AsyncGenerator created");
        asyncGen.generateDataSection(this.asm);
        console.log("DEBUG: AsyncGenerator.generateDataSection done");

        this.asm.finalize();
        console.log("DEBUG: asm.finalize done. asm.id=" + this.asm.id + ", data len=" + this.asm.data.length);

        const generator = new BinaryOutputGenerator(this);
        console.log("DEBUG: BinaryOutputGenerator created");

        if (this.outputType === "shared") {
            return generator.generateSharedLibrary();
        } else if (this.outputType === "object") {
            return generator.generateObjectFile();
        } else if (this.outputType === "static") {
            return generator.generateStaticLibrary();
        }

        console.log("DEBUG: calling generator.generateExecutable");
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
