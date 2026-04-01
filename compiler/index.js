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
const NODE_RUNTIME_IMPORT_RE = /^[a-z_][a-z0-9_]*$/;
const UNINITIALIZED_BINDING_SENTINEL = 0x7ff70000deadbeefn;

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
        this.imports = [];
        this._moduleOrder = [];
        this._moduleMetaByAst = new Map();
        this._moduleMetaByPath = new Map();
        this._functionOwners = {};
        this.moduleRegistrySize = 32;

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

    resetModuleCompilationState() {
        this.compiledFiles = new Set();
        this.imports = [];
        this._moduleOrder = [];
        this._moduleMetaByAst = new Map();
        this._moduleMetaByPath = new Map();
        this._functionOwners = {};
        this.moduleRegistrySize = 32;
    }

    getModuleMeta(moduleAst) {
        return this._moduleMetaByAst.get(moduleAst);
    }

    getModuleMetaByPath(filename) {
        return this._moduleMetaByPath.get(filename);
    }

    createModuleMeta(moduleAst, index) {
        const boxedVars = analyzeTopLevelSharedVariables(moduleAst);
        const moduleBodyFunc = {
            params: [],
            body: {
                type: "BlockStatement",
                body: moduleAst.body.filter((stmt) => stmt.type !== "FunctionDeclaration"),
            },
        };
        const nestedBoxedVars = analyzeSharedVariables(moduleBodyFunc);
        for (const name of nestedBoxedVars) {
            boxedVars.add(name);
        }

        const meta = {
            ast: moduleAst,
            index,
            symbolPrefix: "m" + index,
            functionAliases: {},
            boxedVars,
            mainCapturedVars: {},
            exports: [],
        };
        this._moduleMetaByAst.set(moduleAst, meta);
        if (moduleAst.filename) {
            this._moduleMetaByPath.set(moduleAst.filename, meta);
        }
        return meta;
    }

    getFunctionSymbolForModule(moduleMeta, localName) {
        if (!moduleMeta) return localName;
        if (!moduleMeta.functionAliases[localName]) {
            moduleMeta.functionAliases[localName] = `${moduleMeta.symbolPrefix}_${localName}`;
        }
        return moduleMeta.functionAliases[localName];
    }

    getFunctionLabel(name) {
        const symbol = this.ctx.getFunctionSymbol(name) || name;
        return "_user_" + symbol;
    }

    withModuleCompileContext(moduleMeta, callback) {
        const savedCtx = this.ctx;
        const savedSourcePath = this.sourcePath;
        const savedModuleAst = this._currentModuleAst;

        const moduleCtx = savedCtx.clone("module_" + moduleMeta.index);
        moduleCtx.locals = {};
        moduleCtx.varTypes = {};
        moduleCtx.varInitExprs = {};
        moduleCtx.stackOffset = 0;
        moduleCtx.scopeDepth = 0;
        moduleCtx.breakLabel = null;
        moduleCtx.continueLabel = null;
        moduleCtx.returnLabel = savedCtx.returnLabel;
        moduleCtx.boxedVars = moduleMeta.boxedVars;
        moduleCtx.mainCapturedVars = Object.assign({}, moduleMeta.mainCapturedVars);
        moduleCtx.functionAliases = Object.assign({}, moduleMeta.functionAliases);

        this.ctx = moduleCtx;
        this.sourcePath = moduleMeta.ast.filename;
        this._currentModuleAst = moduleMeta.ast;

        try {
            return callback(moduleCtx);
        } finally {
            this.ctx = savedCtx;
            this.sourcePath = savedSourcePath;
            this._currentModuleAst = savedModuleAst;
        }
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

        const resolvedPath = resolveModulePath(importSource, this.sourcePath, this.nodeShimPath, path, fs);
        if (!resolvedPath) {
            return; // 暂不支持其他类型的导入
        }

        // 找到对应的模块记录
        const currentModuleAst = this._currentModuleAst;
        const importRecord = this.getImportRecordForStatement(currentModuleAst, stmt, resolvedPath);
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
                if (needsBox && !globalLabel) {
                    continue;
                } else if (!needsBox && actualOffset === undefined) {
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
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0);
                    this.vm.store(VReg.V2, BOX_VALUE_OFFSET, VReg.RET);
                } else {
                    this.vm.store(VReg.FP, actualOffset, VReg.RET);
                }
            } else if (spec.type === "ImportDefaultSpecifier" || spec.default === true) {
                const localName = spec.local && spec.local.name;
                if (!localName) continue;

                const globalLabel = this.ctx.getMainCapturedVar(localName);
                const offset = this.ctx.getLocal(localName);
                const needsBox = this.ctx.boxedVars && this.ctx.boxedVars.has(localName);
                let actualOffset = offset;

                if (actualOffset === undefined && !needsBox) {
                    actualOffset = this.ctx.allocLocal(localName);
                }

                if (needsBox && !globalLabel) {
                    continue;
                } else if (!needsBox && actualOffset === undefined) {
                    continue;
                }

                // Use resolvedPath to find the actual source module index
                const sourceModuleIndex = this.findModuleIndexByPath(resolvedPath);
                const resolvedRef = this.resolveModuleExportReferenceByPath(resolvedPath, "default");

                if (resolvedRef && resolvedRef.kind === "cell") {
                    const sourceLabel = resolvedRef.moduleMeta.mainCapturedVars[resolvedRef.localName];
                    if (sourceLabel) {
                        this.vm.lea(VReg.V2, sourceLabel);
                        this.vm.load(VReg.V2, VReg.V2, 0);
                        if (needsBox) {
                            if (globalLabel) {
                                this.vm.lea(VReg.V1, globalLabel);
                                this.vm.store(VReg.V1, 0, VReg.V2);
                            } else {
                                if (actualOffset === undefined) {
                                    actualOffset = this.ctx.allocLocal(localName);
                                }
                                this.vm.store(VReg.FP, actualOffset, VReg.V2);
                            }
                        } else {
                            this.vm.store(VReg.FP, actualOffset, VReg.V2);
                        }
                        continue;
                    }
                } else if (resolvedRef && resolvedRef.kind === "namespace") {
                    this.loadModuleNamespacePointer(resolvedRef.sourceModuleIndex, VReg.V0);
                    this.vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
                    this.vm.and(VReg.V0, VReg.V0, VReg.V1);
                    this.vm.movImm64(VReg.V1, 0x7ffd000000000000n);
                    this.vm.or(VReg.RET, VReg.V0, VReg.V1);

                    if (needsBox) {
                        this.vm.lea(VReg.V2, globalLabel);
                        this.vm.load(VReg.V2, VReg.V2, 0);
                        this.vm.store(VReg.V2, BOX_VALUE_OFFSET, VReg.RET);
                    } else {
                        this.vm.store(VReg.FP, actualOffset, VReg.RET);
                    }
                    continue;
                }

                this.vm.movImm(VReg.A0, sourceModuleIndex);
                const nameLabel = this.asm.addString("default");
                this.vm.lea(VReg.A1, nameLabel);
                this.vm.call("_get_module_export");

                if (needsBox) {
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0);
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

                if (needsBox && !globalLabel) {
                    continue;
                } else if (!needsBox && actualOffset === undefined) {
                    continue;
                }

                // Use resolvedPath to find the actual source module index
                const sourceModuleIndex = this.findModuleIndexByPath(resolvedPath);
                const resolvedRef = this.resolveModuleExportReferenceByPath(resolvedPath, importedName);

                if (resolvedRef && resolvedRef.kind === "cell") {
                    const sourceLabel = resolvedRef.moduleMeta.mainCapturedVars[resolvedRef.localName];
                    if (sourceLabel) {
                        this.vm.lea(VReg.V2, sourceLabel);
                        this.vm.load(VReg.V2, VReg.V2, 0);
                        if (needsBox) {
                            if (globalLabel) {
                                this.vm.lea(VReg.V1, globalLabel);
                                this.vm.store(VReg.V1, 0, VReg.V2);
                            } else {
                                if (actualOffset === undefined) {
                                    actualOffset = this.ctx.allocLocal(localName);
                                }
                                this.vm.store(VReg.FP, actualOffset, VReg.V2);
                            }
                        } else {
                            this.vm.store(VReg.FP, actualOffset, VReg.V2);
                        }
                        continue;
                    }
                } else if (resolvedRef && resolvedRef.kind === "namespace") {
                    this.loadModuleNamespacePointer(resolvedRef.sourceModuleIndex, VReg.V0);
                    this.vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
                    this.vm.and(VReg.V0, VReg.V0, VReg.V1);
                    this.vm.movImm64(VReg.V1, 0x7ffd000000000000n);
                    this.vm.or(VReg.RET, VReg.V0, VReg.V1);

                    if (needsBox) {
                        this.vm.lea(VReg.V2, globalLabel);
                        this.vm.load(VReg.V2, VReg.V2, 0);
                        this.vm.store(VReg.V2, BOX_VALUE_OFFSET, VReg.RET);
                    } else {
                        this.vm.store(VReg.FP, actualOffset, VReg.RET);
                    }
                    continue;
                }

                this.vm.movImm(VReg.A0, sourceModuleIndex);
                const nameLabel = this.asm.addString(importedName);
                this.vm.lea(VReg.A1, nameLabel);
                this.vm.call("_get_module_export");

                if (needsBox) {
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0);
                    this.vm.store(VReg.V2, BOX_VALUE_OFFSET, VReg.RET);
                } else {
                    this.vm.store(VReg.FP, actualOffset, VReg.RET);
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

    getImportRecordForStatement(moduleAst, stmt, resolvedPath = null) {
        if (!this.imports) return null;
        return this.imports.find(
            (rec) => rec.importInfo &&
                rec.importInfo.stmt === stmt &&
                rec.importInfo.moduleAst === moduleAst &&
                (resolvedPath === null || rec.importInfo.resolvedPath === resolvedPath)
        ) || null;
    }

    getImportBindingForLocal(moduleAst, localName) {
        if (!this.imports || !moduleAst || !localName) return null;

        for (const rec of this.imports) {
            if (!rec.importInfo || rec.importInfo.moduleAst !== moduleAst) continue;

            const sourceModuleIndex = this.findModuleIndexByPath(rec.importInfo.resolvedPath);
            for (const spec of rec.importInfo.specifiers || []) {
                const specLocalName = spec.local && spec.local.name;
                if (specLocalName !== localName) continue;

                const isNamespace = spec.type === "ImportNamespaceSpecifier" || spec.namespace === true;
                const isDefault = spec.type === "ImportDefaultSpecifier" || spec.default === true;
                const importedName = isNamespace
                    ? "*"
                    : (isDefault
                        ? "default"
                        : spec.imported && (spec.imported.name || spec.imported.value));

                return {
                    sourceModuleIndex,
                    resolvedPath: rec.importInfo.resolvedPath,
                    isNamespace,
                    importedName
                };
            }
        }

        return null;
    }

    getModuleBindingKind(moduleAst, name) {
        if (!moduleAst || !name) return null;

        for (const stmt of moduleAst.body || []) {
            if (stmt.type === "ImportDeclaration") {
                for (const spec of stmt.specifiers || []) {
                    if (spec.local && spec.local.name === name) {
                        return "import";
                    }
                }
                continue;
            }

            const decl = stmt.type === "ExportDeclaration" && stmt.declaration
                ? stmt.declaration
                : stmt;

            if (!decl) continue;

            if (decl.type === "VariableDeclaration") {
                for (const item of decl.declarations || []) {
                    if (item.id && item.id.type === "Identifier" && item.id.name === name) {
                        return "variable";
                    }
                }
            } else if (decl.type === "FunctionDeclaration" && decl.id && decl.id.name === name) {
                return "function";
            } else if (decl.type === "ClassDeclaration" && decl.id && decl.id.name === name) {
                return "class";
            }
        }

        return null;
    }

    isLiveLocalExportBinding(moduleMeta, localName) {
        return this.getModuleBindingKind(moduleMeta && moduleMeta.ast, localName) === "variable";
    }

    resolveModuleExportReference(moduleMeta, exportName, seen = new Set()) {
        if (!moduleMeta || !exportName) return null;

        const key = `${moduleMeta.index}:${exportName}`;
        if (seen.has(key)) {
            return null;
        }
        seen.add(key);

        const exp = (moduleMeta.exports || []).find((candidate) => candidate.name === exportName);
        if (!exp) {
            return null;
        }

        if (exp.namespace === true && exp.sourceModuleIndex !== undefined) {
            return {
                kind: "namespace",
                sourceModuleIndex: exp.sourceModuleIndex,
                moduleMeta
            };
        }

        if (exp.kind === "reexport" && exp.sourceModuleIndex !== undefined) {
            const sourceAst = this._moduleOrder[exp.sourceModuleIndex];
            const sourceMeta = this.getModuleMeta(sourceAst);
            return this.resolveModuleExportReference(sourceMeta, exp.importedName || exp.name, seen);
        }

        const localName = exp.localName || ((exp.kind === "const" || exp.kind === "local") ? exp.name : null);
        if (localName) {
            const importBinding = this.getImportBindingForLocal(moduleMeta.ast, localName);
            if (importBinding) {
                if (importBinding.isNamespace) {
                    return {
                        kind: "namespace",
                        sourceModuleIndex: importBinding.sourceModuleIndex,
                        moduleMeta
                    };
                }
                const sourceMeta = this.getModuleMetaByPath(importBinding.resolvedPath);
                return this.resolveModuleExportReference(sourceMeta, importBinding.importedName, seen);
            }

            if (this.isLiveLocalExportBinding(moduleMeta, localName)) {
                return {
                    kind: "cell",
                    moduleMeta,
                    localName
                };
            }
        }

        return {
            kind: exp.kind || "value",
            moduleMeta,
            localName
        };
    }

    resolveModuleExportReferenceByPath(resolvedPath, exportName) {
        const moduleMeta = this.getModuleMetaByPath(resolvedPath);
        return this.resolveModuleExportReference(moduleMeta, exportName);
    }

    markLiveModuleBindings() {
        for (const moduleAst of this._moduleOrder) {
            const moduleMeta = this.getModuleMeta(moduleAst);

            for (const exp of moduleMeta.exports || []) {
                const localName = exp.localName || ((exp.kind === "const" || exp.kind === "local") ? exp.name : null);
                if (localName && this.isLiveLocalExportBinding(moduleMeta, localName)) {
                    moduleMeta.boxedVars.add(localName);
                }
            }

            for (const stmt of moduleAst.body || []) {
                if (stmt.type !== "ImportDeclaration") continue;

                const importRecord = this.getImportRecordForStatement(moduleAst, stmt);
                if (!importRecord) continue;

                for (const spec of importRecord.importInfo.specifiers || []) {
                    const isNamespace = spec.type === "ImportNamespaceSpecifier" || spec.namespace === true;
                    if (isNamespace) continue;

                    const localName = spec.local && spec.local.name;
                    if (!localName) continue;

                    const importedName = (spec.type === "ImportDefaultSpecifier" || spec.default === true)
                        ? "default"
                        : spec.imported && (spec.imported.name || spec.imported.value);

                    if (!importedName) continue;

                    const resolvedRef = this.resolveModuleExportReferenceByPath(importRecord.importInfo.resolvedPath, importedName);
                    if (resolvedRef && resolvedRef.kind === "cell") {
                        moduleMeta.boxedVars.add(localName);
                    }
                }
            }
        }
    }

    getResolvedExportPropagationTargets(sourceModuleMeta, sourceLocalName) {
        const targets = [];
        if (!sourceModuleMeta || !sourceLocalName || !this._moduleOrder) return targets;

        const seen = new Set();
        for (const moduleAst of this._moduleOrder) {
            const moduleMeta = this.getModuleMeta(moduleAst);
            if (!moduleMeta || moduleMeta.index === sourceModuleMeta.index) continue;

            for (const exp of moduleMeta.exports || []) {
                if (!exp || exp.kind === "star" || exp.namespace === true) continue;

                const resolvedRef = this.resolveModuleExportReference(moduleMeta, exp.name);
                if (!resolvedRef || resolvedRef.kind !== "cell") continue;
                if (resolvedRef.moduleMeta !== sourceModuleMeta || resolvedRef.localName !== sourceLocalName) continue;

                const key = `${moduleMeta.index}:${exp.name}`;
                if (seen.has(key)) continue;
                seen.add(key);
                targets.push({
                    moduleIndex: moduleMeta.index,
                    exportName: exp.name
                });
            }
        }

        return targets;
    }

    writeModuleNamespaceExportValueFromStack(moduleIndex, exportName) {
        const vm = this.vm;

        this.loadModuleNamespacePointer(moduleIndex, VReg.V2);
        const keyLabel = this.asm.addString(exportName);
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.A0, VReg.V2, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffd000000000000n);
        vm.or(VReg.A0, VReg.A0, VReg.V1);
        vm.lea(VReg.V1, keyLabel);
        vm.movImm64(VReg.V0, 0x7ffc000000000000n);
        vm.or(VReg.A1, VReg.V1, VReg.V0);
        vm.load(VReg.A2, VReg.SP, 0);
        vm.call("_object_set");
    }

    emitUninitializedBindingGuard(name, valueReg = VReg.RET) {
        if (!name) return;

        const vm = this.vm;
        const okLabel = this.ctx.newLabel("binding_ready");
        const tmpReg = valueReg === VReg.V1 ? VReg.V0 : VReg.V1;

        vm.movImm64(tmpReg, UNINITIALIZED_BINDING_SENTINEL);
        vm.cmp(valueReg, tmpReg);
        vm.jne(okLabel);

        const msgLabel = this.asm.addString(`ReferenceError: Cannot access '${name}' before initialization`);
        vm.lea(VReg.A0, msgLabel);
        vm.call("_print_str");
        vm.movImm(VReg.A0, 1);
        if (this.arch === "arm64") {
            vm.syscall(this.os === "linux" ? 93 : 1);
        } else {
            vm.syscall(this.os === "linux" ? 60 : 0x2000001);
        }

        vm.label(okLabel);
    }

    syncModuleExportBinding(localName, valueReg = VReg.RET) {
        const moduleMeta = this.getModuleMeta(this._currentModuleAst);
        if (!moduleMeta || !localName) return;

        const namespaceTargets = [];
        const seenTargets = new Set();
        const addNamespaceTarget = (moduleIndex, exportName) => {
            const key = `${moduleIndex}:${exportName}`;
            if (seenTargets.has(key)) return;
            seenTargets.add(key);
            namespaceTargets.push({ moduleIndex, exportName });
        };

        for (const exp of moduleMeta.exports || []) {
            if (exp.kind === "reexport" || exp.kind === "star") continue;
            const exportLocalName = exp.localName || ((exp.kind === "const" || exp.kind === "local") ? exp.name : null);
            if (exportLocalName === localName) {
                addNamespaceTarget(moduleMeta.index, exp.name);
            }
        }

        for (const target of this.getResolvedExportPropagationTargets(moduleMeta, localName)) {
            addNamespaceTarget(target.moduleIndex, target.exportName);
        }

        if (namespaceTargets.length === 0) return;

        const vm = this.vm;
        vm.push(valueReg);
        for (const target of namespaceTargets) {
            this.writeModuleNamespaceExportValueFromStack(target.moduleIndex, target.exportName);
        }
        vm.pop(valueReg);
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

    emitFunctionBindingValue(name, targetReg = VReg.RET) {
        if (!name) return;

        const vm = this.vm;
        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");
        vm.mov(VReg.S0, VReg.RET);

        vm.movImm(VReg.V1, 0xc105);
        vm.store(VReg.S0, 0, VReg.V1);
        vm.lea(VReg.V1, this.getFunctionLabel(name));
        vm.store(VReg.S0, 8, VReg.V1);

        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_box_function");
        if (targetReg !== VReg.RET) {
            vm.mov(targetReg, VReg.RET);
        }
    }

    preinitializeModuleFunctionBindings(moduleMeta) {
        if (!moduleMeta) return;

        for (const name of moduleMeta.boxedVars || []) {
            const bindingKind = this.getModuleBindingKind(moduleMeta.ast, name);
            if (bindingKind !== "function" && bindingKind !== "class") {
                continue;
            }

            const label = moduleMeta.mainCapturedVars[name];
            if (!label) continue;

            this.emitFunctionBindingValue(name, VReg.V0);
            this.vm.lea(VReg.V1, label);
            this.vm.load(VReg.V1, VReg.V1, 0);
            this.vm.store(VReg.V1, BOX_VALUE_OFFSET, VReg.V0);
        }
    }

    compileProgram(ast) {
        const vm = this.vm;

        ast.filename = this.sourcePath;
        this.resetModuleCompilationState();
        this.compiledFiles.add(ast.filename);
        this.resolveImports(ast, this._moduleOrder);
        this.moduleRegistrySize = Math.max(1, this._moduleOrder.length);

        this._moduleExportsList = [];

        for (let moduleIdx = 0; moduleIdx < this._moduleOrder.length; moduleIdx++) {
            this.createModuleMeta(this._moduleOrder[moduleIdx], moduleIdx);
        }

        for (const moduleAst of this._moduleOrder) {
            this.collectFunctions(moduleAst, this.getModuleMeta(moduleAst));
        }

        for (const moduleAst of this._moduleOrder) {
            const moduleExports = collectModuleExports(moduleAst, this._moduleOrder, this.nodeShimPath, this._moduleExportsList, path, fs);
            this._moduleExportsList.push(moduleExports);
        }
        for (let moduleIdx = 0; moduleIdx < this._moduleOrder.length; moduleIdx++) {
            const moduleAst = this._moduleOrder[moduleIdx];
            const moduleMeta = this.getModuleMeta(moduleAst);
            moduleMeta.exports = this.resolveStarExports(moduleAst, moduleIdx, this._moduleExportsList);
            this._moduleExportsList[moduleIdx] = moduleMeta.exports;
        }

        this.markLiveModuleBindings();

        for (const moduleAst of this._moduleOrder) {
            const moduleMeta = this.getModuleMeta(moduleAst);
            for (const name of moduleMeta.boxedVars) {
                const label = `_main_captured_${moduleMeta.symbolPrefix}_${name}`;
                moduleMeta.mainCapturedVars[name] = label;
                this.asm.addDataLabel(label);
                this.asm.addDataQword(0);
            }
        }

        vm.label("_main");
        vm.prologue(1024, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);
        this.ctx.returnLabel = "_main_return";

        for (const moduleAst of this._moduleOrder) {
            const moduleMeta = this.getModuleMeta(moduleAst);
            for (const name of moduleMeta.boxedVars) {
                const label = moduleMeta.mainCapturedVars[name];
                vm.movImm(VReg.A0, 8);
                vm.call("_alloc");
                vm.movImm64(VReg.V0, UNINITIALIZED_BINDING_SENTINEL);
                vm.store(VReg.RET, 0, VReg.V0);
                vm.lea(VReg.V1, label);
                vm.store(VReg.V1, 0, VReg.RET);
            }
        }

        for (let moduleIdx = 0; moduleIdx < this._moduleOrder.length; moduleIdx++) {
            vm.call("_object_new");
            vm.mov(VReg.V0, VReg.RET);
            vm.movImm(VReg.V2, moduleIdx);
            vm.shl(VReg.V2, VReg.V2, 3);
            vm.lea(VReg.V1, "_module_registry");
            vm.add(VReg.V1, VReg.V1, VReg.V2);
            vm.store(VReg.V1, 0, VReg.V0);
        }

        for (const moduleAst of this._moduleOrder) {
            const moduleMeta = this.getModuleMeta(moduleAst);
            this.withModuleCompileContext(moduleMeta, () => {
                this.preinitializeModuleFunctionBindings(moduleMeta);
                this.populateModuleNamespace(moduleMeta, { functionsOnly: true });
            });
        }

        // Link all static imports before any module top-level code runs.
        // This gives cyclic function imports a stable value even when an
        // earlier module's top-level side effects call into a later module
        // before that later module reaches its own evaluation pass.
        for (const moduleAst of this._moduleOrder) {
            const moduleMeta = this.getModuleMeta(moduleAst);
            this.withModuleCompileContext(moduleMeta, () => {
                for (const stmt of moduleAst.body) {
                    if (stmt.type === "ImportDeclaration") {
                        this.compileImportBindingInitialization(stmt);
                    }
                }
            });
        }

        for (const moduleAst of this._moduleOrder) {
            const moduleMeta = this.getModuleMeta(moduleAst);
            this.withModuleCompileContext(moduleMeta, () => {
                // Refresh imports immediately before evaluation so modules that
                // were already fully initialized can provide their latest
                // namespace values to this module.
                for (const stmt of moduleAst.body) {
                    if (stmt.type === "ImportDeclaration") {
                        this.compileImportBindingInitialization(stmt);
                    }
                }

                for (const stmt of moduleAst.body) {
                    if (stmt.type === "ImportDeclaration") {
                        continue;
                    }
                    if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                        if (stmt.declaration.type !== "FunctionDeclaration" &&
                            stmt.declaration.type !== "ClassDeclaration") {
                            this.compileStatement(stmt.declaration);
                        }
                        continue;
                    }
                    if (stmt.type === "ExportDeclaration") {
                        continue;
                    }
                    if (stmt.type !== "FunctionDeclaration" && stmt.type !== "ClassDeclaration") {
                        this.compileStatement(stmt);
                    }
                }

                this.populateModuleNamespace(moduleMeta);
            });
        }

        vm.movImm(VReg.RET, 0);
        vm.label("_main_return");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 1024);

        this.compileUserFunctions();
        this.generatePendingFunctions();
    }

    loadModuleNamespacePointer(moduleIndex, targetReg) {
        const vm = this.vm;
        vm.movImm(targetReg, moduleIndex);
        vm.shl(targetReg, targetReg, 3);
        vm.lea(VReg.V1, "_module_registry");
        vm.add(targetReg, VReg.V1, targetReg);
        vm.load(targetReg, targetReg, 0);
    }

    buildImportSpecMap(moduleAst) {
        const importSpecMap = new Map();
        for (const imp of this.imports || []) {
            if (!imp.importInfo || imp.importInfo.moduleAst !== moduleAst) continue;
            const sourceModuleIndex = this.findModuleIndexByPath(imp.importInfo.resolvedPath);
            for (const spec of imp.importInfo.specifiers || []) {
                const localName = spec.local && spec.local.name;
                if (!localName) continue;
                const isNamespace = spec.type === "ImportNamespaceSpecifier" || spec.namespace === true;
                importSpecMap.set(localName, { sourceModuleIndex, isNamespace });
            }
        }
        return importSpecMap;
    }

    populateModuleNamespace(moduleMeta, options = {}) {
        const vm = this.vm;
        const moduleExports = moduleMeta.exports || [];
        if (moduleExports.length === 0) return;

        const functionsOnly = options.functionsOnly === true;
        const importSpecMap = this.buildImportSpecMap(moduleMeta.ast);

        for (const exp of moduleExports) {
            const exportLocalName = exp.localName || exp.name;
            const isFunctionLike = exp.kind === "function" || exp.kind === "class";
            if (functionsOnly && !isFunctionLike) {
                continue;
            }

            let valueLoaded = false;

            if (isFunctionLike) {
                const funcLabel = this.getFunctionLabel(exportLocalName);
                vm.lea(VReg.V0, funcLabel);
                vm.movImm64(VReg.V1, 0x7fff000000000000n);
                vm.or(VReg.V0, VReg.V0, VReg.V1);
                valueLoaded = true;
            } else if (!functionsOnly && exp.namespace === true && exp.sourceModuleIndex !== undefined) {
                this.loadModuleNamespacePointer(exp.sourceModuleIndex, VReg.V0);
                vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
                vm.and(VReg.V0, VReg.V0, VReg.V1);
                vm.movImm64(VReg.V1, 0x7ffd000000000000n);
                vm.or(VReg.V0, VReg.V0, VReg.V1);
                valueLoaded = true;
            } else if (!functionsOnly && exp.kind === "expression" && exp.expression) {
                this.compileExpression(exp.expression);
                vm.mov(VReg.V0, VReg.RET);
                valueLoaded = true;
            } else if (!functionsOnly && exp.kind === "reexport" && exp.sourceModuleIndex !== undefined) {
                vm.movImm(VReg.A0, exp.sourceModuleIndex);
                const reexportedName = exp.importedName || exp.name;
                const keyLabel = this.asm.addString(reexportedName);
                vm.lea(VReg.A1, keyLabel);
                vm.call("_get_module_export");
                vm.mov(VReg.V0, VReg.RET);
                valueLoaded = true;
            } else if (!functionsOnly && exp.kind === "reexport") {
                const impSpec = importSpecMap.get(exportLocalName);
                if (impSpec && impSpec.isNamespace) {
                    this.loadModuleNamespacePointer(impSpec.sourceModuleIndex, VReg.V0);
                    vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
                    vm.and(VReg.V0, VReg.V0, VReg.V1);
                    vm.movImm64(VReg.V1, 0x7ffd000000000000n);
                    vm.or(VReg.V0, VReg.V0, VReg.V1);
                    valueLoaded = true;
                }
            }

            if (!valueLoaded) {
                const globalLabel = this.ctx.getMainCapturedVar(exportLocalName);
                if (globalLabel) {
                    vm.lea(VReg.V0, globalLabel);
                    vm.load(VReg.V0, VReg.V0, 0);
                    vm.load(VReg.V0, VReg.V0, 0);
                    valueLoaded = true;
                } else {
                    const localOffset = this.ctx.getLocal(exportLocalName);
                    if (localOffset !== undefined) {
                        vm.load(VReg.V0, VReg.FP, localOffset);
                        valueLoaded = true;
                    }
                }
            }

            if (!valueLoaded) {
                continue;
            }

            this.loadModuleNamespacePointer(moduleMeta.index, VReg.V2);
            const keyLabel = this.asm.addString(exp.name);
            vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
            vm.and(VReg.A0, VReg.V2, VReg.V1);
            vm.movImm64(VReg.V1, 0x7ffd000000000000n);
            vm.or(VReg.A0, VReg.A0, VReg.V1);
            vm.lea(VReg.V1, keyLabel);
            vm.mov(VReg.A2, VReg.V0);
            vm.movImm64(VReg.V0, 0x7ffc000000000000n);
            vm.or(VReg.A1, VReg.V1, VReg.V0);
            vm.call("_object_set");
        }
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
        const modulePath = ast.filename || path.resolve(this.sourcePath || ".");
        const currentDir = fs.statSync(modulePath).isDirectory() ? modulePath : path.dirname(modulePath);

        if (modulePath && !this.compiledFiles.has(modulePath)) {
            this.compiledFiles.add(modulePath);
        }

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
                const resolvedPath = resolveModulePath(importSource, currentDir, this.nodeShimPath, path, fs);
                if (!resolvedPath) {
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
                }
                continue;
            }

            // ImportDeclaration or ExportDeclaration with source
            let importSource = stmt.source.value;
            const resolvedPath = resolveModulePath(importSource, currentDir, this.nodeShimPath, path, fs);
            if (!resolvedPath) {
                continue; // 暂不支持其他类型的导入
            }

            // 记录此导入的元信息，用于后续编译时绑定
            const importInfo = {
                specifiers: stmt.specifiers || [],
                source: importSource,
                resolvedPath: resolvedPath,
                isNodeShim: resolvedPath === this.nodeShimPath,
                moduleAst: ast,  // 'ast' is the AST of the module doing the importing - set immediately
                stmt
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
            }
        }

        if (!moduleOrder.find((mod) => mod.filename === ast.filename)) {
            moduleOrder.push(ast);
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

    collectFunctions(ast, moduleMeta = null) {
        for (const stmt of ast.body) {
            if (stmt.type === "FunctionDeclaration" && stmt.id) {
                const symbol = moduleMeta ? this.getFunctionSymbolForModule(moduleMeta, stmt.id.name) : stmt.id.name;
                this.ctx.registerFunction(symbol, stmt);
                if (moduleMeta) {
                    this._functionOwners[symbol] = moduleMeta;
                }
            } else if (stmt.type === "ClassDeclaration" && stmt.id) {
                const symbol = moduleMeta ? this.getFunctionSymbolForModule(moduleMeta, stmt.id.name) : stmt.id.name;
                this.ctx.registerFunction(symbol, stmt);
                if (moduleMeta) {
                    this._functionOwners[symbol] = moduleMeta;
                }
            } else if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                const decl = stmt.declaration;
                if ((decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") && decl.id) {
                    const symbol = moduleMeta ? this.getFunctionSymbolForModule(moduleMeta, decl.id.name) : decl.id.name;
                    this.ctx.registerFunction(symbol, decl);
                    if (moduleMeta) {
                        this._functionOwners[symbol] = moduleMeta;
                    }
                    if (!moduleMeta && !this.exports.includes(decl.id.name)) {
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
        const ownerMeta = this._functionOwners[name];

        const savedCtx = this.ctx;
        const savedSourcePath = this.sourcePath;
        const savedModuleAst = this._currentModuleAst;
        this.ctx = savedCtx.clone(name);
        this.ctx.returnLabel = returnLabel;
        this.ctx.inAsyncFunction = isAsync;
        if (ownerMeta) {
            this.ctx.functionAliases = Object.assign({}, ownerMeta.functionAliases);
            this.ctx.mainCapturedVars = Object.assign({}, ownerMeta.mainCapturedVars);
            this.sourcePath = ownerMeta.ast.filename;
            this._currentModuleAst = ownerMeta.ast;
        }

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
        this.sourcePath = savedSourcePath;
        this._currentModuleAst = savedModuleAst;
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
        const allocGen = new AllocatorGenerator(this.vm, {
            moduleRegistrySize: this.moduleRegistrySize
        });
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

function normalizeNodeModuleName(importSource) {
    if (!importSource) return "";
    return importSource.startsWith("node:") ? importSource.slice(5) : importSource;
}

function resolveModulePath(importSource, sourcePath, nodeShimPath, pathMod, fsMod) {
    if (!importSource) return "";

    const normalizedSource = normalizeNodeModuleName(importSource);
    if (NODE_RUNTIME_IMPORT_RE.test(normalizedSource)) {
        const builtinPath = pathMod.resolve(process.cwd(), "runtime/node", normalizedSource + ".js");
        if (fsMod.existsSync(builtinPath)) {
            return builtinPath;
        }
        if (importSource.startsWith("node:")) {
            return nodeShimPath;
        }
    }

    if (!importSource.startsWith(".") && !importSource.startsWith("/")) {
        return "";
    }

    const absSourcePath = pathMod.resolve(sourcePath || ".");
    let currentDir = absSourcePath;
    if (!importSource.startsWith("/")) {
        if (!fsMod.existsSync(absSourcePath) || !fsMod.statSync(absSourcePath).isDirectory()) {
            currentDir = pathMod.dirname(absSourcePath);
        }
    } else if (fsMod.existsSync(absSourcePath) && !fsMod.statSync(absSourcePath).isDirectory()) {
        currentDir = pathMod.dirname(absSourcePath);
    }

    let resolvedPath = importSource.startsWith("/")
        ? importSource
        : pathMod.resolve(currentDir, importSource);

    if (!resolvedPath.endsWith(".js") && !fsMod.existsSync(resolvedPath)) {
        if (fsMod.existsSync(resolvedPath + ".js")) {
            resolvedPath += ".js";
        } else if (fsMod.existsSync(pathMod.join(resolvedPath, "index.js"))) {
            resolvedPath = pathMod.join(resolvedPath, "index.js");
        }
    }

    return resolvedPath;
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
            if (stmt.default) {
                if (decl.type === "FunctionDeclaration") {
                    exports.push({ name: "default", kind: "function", localName: decl.id && decl.id.name });
                } else if (decl.type === "ClassDeclaration") {
                    exports.push({ name: "default", kind: "class", localName: decl.id && decl.id.name });
                } else if (decl.type === "Identifier") {
                    exports.push({ name: "default", kind: "local", localName: decl.name });
                } else {
                    exports.push({ name: "default", kind: "expression", expression: decl });
                }
            } else if (decl.type === "VariableDeclaration") {
                for (const decl2 of decl.declarations) {
                    if (decl2.id && decl2.id.type === "Identifier") {
                        exports.push({ name: decl2.id.name, kind: "const", localName: decl2.id.name });
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
                        let resolvedPath = resolveModulePath(sourcePath, moduleAst.filename, _nodeShimPath, _path, _fs);
                        console.log("DEBUG: export * after resolve, resolvedPath=" + resolvedPath);

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
                    let sourceModuleIndex = undefined;
                    if (stmt.source && _moduleOrder && _nodeShimPath) {
                        const resolvedPath = resolveModulePath(stmt.source.value, moduleAst.filename, _nodeShimPath, _path, _fs);
                        const sourceAst = _moduleOrder.find((mod) => mod.filename === resolvedPath);
                        if (sourceAst) {
                            sourceModuleIndex = _moduleOrder.indexOf(sourceAst);
                        }
                    }

                    for (const spec of stmt.specifiers) {
                        if (spec.exported) {
                            const isReexportFromModule = !!stmt.source;
                            const localName = spec.local && (spec.local.name || spec.local.value);
                            exports.push({
                                name: spec.exported.name || spec.exported.value,
                                kind: isReexportFromModule ? "reexport" : "local",
                                localName,
                                importedName: localName,
                                sourceModuleIndex,
                                namespace: spec.namespace === true
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
                const resolvedPath = resolveModulePath(sourcePath, moduleAst.filename, _nodeShimPath, _path, _fs);

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
