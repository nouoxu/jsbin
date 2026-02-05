// JSBin 编译器 - 模块管理器
// 处理 ES6 模块的解析、编译和符号链接

import * as fs from "fs";
import * as path from "path";
import { Lexer, Parser } from "../../lang/index.js";

/**
 * 模块导出信息
 */
export class ModuleExports {
    constructor(modulePath) {
        this.modulePath = modulePath;
        this.default = null; // 默认导出的标签名
        this.named = new Map(); // 命名导出: 导出名 -> 标签名
        this.functions = new Map(); // 函数导出: 函数名 -> 函数标签
        this.variables = new Map(); // 变量导出: 变量名 -> 全局标签
        this.classes = new Map(); // 类导出: 类名 -> 构造函数标签
        this.initLabel = null; // 模块初始化函数标签
    }

    setDefault(label) {
        this.default = label;
    }

    addNamed(exportName, label) {
        this.named.set(exportName, label);
    }

    addFunction(name, label) {
        this.functions.set(name, label);
        this.named.set(name, label);
    }

    addVariable(name, label) {
        this.variables.set(name, label);
        this.named.set(name, label);
    }

    addClass(name, classInfo) {
        // classInfo: { constructorLabel, classInfoLabel, labelId }
        this.classes.set(name, classInfo);
        this.named.set(name, classInfo.constructorLabel);
    }

    getClass(name) {
        return this.classes.get(name);
    }

    getExport(name) {
        if (name === "default") {
            return this.default;
        }
        return this.named.get(name);
    }

    getAllExports() {
        const exports = {};
        if (this.default) {
            exports.default = this.default;
        }
        for (const [name, label] of this.named) {
            exports[name] = label;
        }
        return exports;
    }
}

/**
 * 模块管理器
 * 负责模块解析、缓存和符号管理
 */
export class ModuleManager {
    constructor() {
        // 已编译模块的导出信息: 绝对路径 -> ModuleExports
        this.modules = new Map();

        // 模块编译状态: 绝对路径 -> 'pending' | 'compiling' | 'compiled'
        this.moduleStatus = new Map();

        // 当前编译的模块栈（用于检测循环依赖）
        this.compilingStack = [];

        // 模块前缀计数器（用于生成唯一标签）
        this.moduleCounter = 0;

        // 模块搜索路径
        this.searchPaths = [];
    }

    /**
     * 添加模块搜索路径
     */
    addSearchPath(p) {
        if (!this.searchPaths.includes(p)) {
            this.searchPaths.push(p);
        }
    }

    /**
     * 解析模块路径
     * @param {string} specifier - 导入说明符 (如 "./module.js" 或 "lodash")
     * @param {string} fromPath - 导入语句所在文件的路径
     * @returns {string|null} 解析后的绝对路径，或内置模块的虚拟路径
     */
    resolveModulePath(specifier, fromPath) {
        // 内置模块 - 返回虚拟路径
        const builtinModules = ["path", "fs", "process", "os", "child_process", "buffer", "url", "util"];
        if (builtinModules.includes(specifier)) {
            return `builtin:${specifier}`;
        }

        // 相对路径
        if (specifier.startsWith("./") || specifier.startsWith("../")) {
            const dir = path.dirname(fromPath);
            let resolved = path.resolve(dir, specifier);

            // 尝试添加 .js 扩展名
            if (!fs.existsSync(resolved)) {
                if (fs.existsSync(resolved + ".js")) {
                    resolved = resolved + ".js";
                } else if (fs.existsSync(path.join(resolved, "index.js"))) {
                    resolved = path.join(resolved, "index.js");
                }
            }

            return resolved;
        }

        // 搜索路径
        for (const searchPath of this.searchPaths) {
            let resolved = path.resolve(searchPath, specifier);
            if (!fs.existsSync(resolved)) {
                if (fs.existsSync(resolved + ".js")) {
                    resolved = resolved + ".js";
                } else if (fs.existsSync(path.join(resolved, "index.js"))) {
                    resolved = path.join(resolved, "index.js");
                }
            }
            if (fs.existsSync(resolved)) {
                return resolved;
            }
        }

        console.warn(`Cannot resolve module: ${specifier} from ${fromPath}`);
        return null;
    }

    /**
     * 生成模块的唯一前缀
     */
    generateModulePrefix(modulePath) {
        const baseName = path.basename(modulePath, ".js");
        const sanitized = baseName.replace(/[^a-zA-Z0-9_]/g, "_");
        this.moduleCounter++;
        return `_mod_${sanitized}_${this.moduleCounter}_`;
    }

    /**
     * 检查模块是否已编译
     */
    isModuleCompiled(modulePath) {
        return this.moduleStatus.get(modulePath) === "compiled";
    }

    /**
     * 检查模块是否正在编译中（循环依赖检测）
     */
    isModuleCompiling(modulePath) {
        return this.compilingStack.includes(modulePath);
    }

    /**
     * 开始编译模块
     */
    beginCompileModule(modulePath) {
        this.moduleStatus.set(modulePath, "compiling");
        this.compilingStack.push(modulePath);
    }

    /**
     * 完成编译模块
     */
    endCompileModule(modulePath, exports) {
        this.modules.set(modulePath, exports);
        this.moduleStatus.set(modulePath, "compiled");
        const index = this.compilingStack.indexOf(modulePath);
        if (index !== -1) {
            this.compilingStack.splice(index, 1);
        }
    }

    /**
     * 获取模块的导出信息
     */
    getModuleExports(modulePath) {
        return this.modules.get(modulePath);
    }

    /**
     * 检查是否是内置模块
     */
    isBuiltinModule(modulePath) {
        return modulePath && modulePath.startsWith("builtin:");
    }

    /**
     * 读取并解析模块文件
     */
    parseModuleFile(modulePath) {
        // 内置模块不需要解析
        if (this.isBuiltinModule(modulePath)) {
            return null;
        }

        if (!fs.existsSync(modulePath)) {
            throw new Error(`Module not found: ${modulePath}`);
        }

        const source = fs.readFileSync(modulePath, "utf-8");
        const lexer = new Lexer(source);
        const parser = new Parser(lexer);
        return parser.parseProgram();
    }

    /**
     * 收集模块的导出声明
     * 用于提前知道模块导出了哪些符号
     */
    collectExportDeclarations(ast) {
        const exports = {
            default: null,
            named: [],
            functions: [],
            variables: [],
        };

        for (const stmt of ast.body) {
            if (stmt.type === "ExportDeclaration") {
                if (stmt.default) {
                    // export default ...
                    if (stmt.declaration) {
                        if (stmt.declaration.type === "FunctionDeclaration" && stmt.declaration.id) {
                            exports.default = stmt.declaration.id.name;
                        } else if (stmt.declaration.type === "Identifier") {
                            exports.default = stmt.declaration.name;
                        }
                    }
                } else if (stmt.declaration) {
                    // export function/const/let/var/class
                    if (stmt.declaration.type === "FunctionDeclaration" && stmt.declaration.id) {
                        exports.functions.push(stmt.declaration.id.name);
                    } else if (stmt.declaration.type === "VariableDeclaration") {
                        for (const decl of stmt.declaration.declarations) {
                            if (decl.id && decl.id.type === "Identifier") {
                                exports.variables.push(decl.id.name);
                            }
                        }
                    } else if (stmt.declaration.type === "ClassDeclaration" && stmt.declaration.id) {
                        exports.named.push(stmt.declaration.id.name);
                    }
                } else if (stmt.specifiers && stmt.specifiers.length > 0) {
                    // export { a, b as c }
                    for (const spec of stmt.specifiers) {
                        if (spec.exported) {
                            exports.named.push(spec.exported.name);
                        }
                    }
                }
            }
        }

        return exports;
    }

    /**
     * 获取模块的所有依赖（import 的模块）
     */
    getModuleDependencies(ast, modulePath) {
        const deps = [];

        for (const stmt of ast.body) {
            if (stmt.type === "ImportDeclaration" && stmt.source) {
                const specifier = stmt.source.value;
                const resolved = this.resolveModulePath(specifier, modulePath);
                if (resolved) {
                    deps.push({
                        specifier,
                        resolved,
                        specifiers: stmt.specifiers || [],
                    });
                }
            }
        }

        return deps;
    }
}

// 单例实例
let moduleManagerInstance = null;

export function getModuleManager() {
    if (!moduleManagerInstance) {
        moduleManagerInstance = new ModuleManager();
    }
    return moduleManagerInstance;
}

export function resetModuleManager() {
    moduleManagerInstance = new ModuleManager();
    return moduleManagerInstance;
}
