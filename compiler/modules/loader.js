// JSBin 模块系统
// ES6 静态模块加载和链接
//
// 模块处理流程:
// 1. 解析 - 收集所有 import/export 声明
// 2. 解析依赖 - 递归加载依赖模块
// 3. 链接 - 解析模块间的绑定
// 4. 编译 - 生成模块代码
// 5. 初始化 - 按拓扑顺序执行模块

import * as fs from "fs";
import * as path from "path";
import { Lexer } from "../lang/lexer/index.js";
import { Parser } from "../lang/parser/index.js";

// 模块记录
class ModuleRecord {
    constructor(specifier, resolvedPath) {
        this.specifier = specifier; // 原始模块说明符
        this.resolvedPath = resolvedPath; // 解析后的绝对路径
        this.ast = null; // AST
        this.exports = new Map(); // 导出绑定: name -> { type, local, source }
        this.imports = new Map(); // 导入绑定: local -> { source, imported }
        this.dependencies = []; // 依赖模块路径列表
        this.namespace = null; // 模块命名空间对象
        this.status = "unlinked"; // "unlinked" | "linking" | "linked" | "evaluated"
        this.evaluationError = null; // 评估时的错误
    }
}

// 模块加载器
export class ModuleLoader {
    constructor(basePath = process.cwd()) {
        this.basePath = basePath;
        this.modules = new Map(); // resolvedPath -> ModuleRecord
        this.moduleOrder = []; // 拓扑排序后的模块列表
    }

    // 解析模块说明符为绝对路径
    resolveModulePath(specifier, referrer) {
        // 相对路径
        if (specifier.startsWith("./") || specifier.startsWith("../")) {
            const referrerDir = path.dirname(referrer);
            let resolved = path.resolve(referrerDir, specifier);

            // 添加 .js 扩展名（如果没有）
            if (!resolved.endsWith(".js") && !resolved.endsWith(".mjs")) {
                if (fs.existsSync(resolved + ".js")) {
                    resolved += ".js";
                } else if (fs.existsSync(resolved + ".mjs")) {
                    resolved += ".mjs";
                } else if (fs.existsSync(resolved + "/index.js")) {
                    resolved = resolved + "/index.js";
                }
            }
            return resolved;
        }

        // 裸模块说明符 (node_modules 或内置模块)
        // 这里简化处理，只支持相对路径
        throw new Error(`Bare module specifiers not supported: ${specifier}`);
    }

    // 加载模块
    async loadModule(specifier, referrer = this.basePath + "/index.js") {
        const resolvedPath = this.resolveModulePath(specifier, referrer);

        // 检查是否已加载
        if (this.modules.has(resolvedPath)) {
            return this.modules.get(resolvedPath);
        }

        // 创建模块记录
        const moduleRecord = new ModuleRecord(specifier, resolvedPath);
        this.modules.set(resolvedPath, moduleRecord);

        // 读取并解析源文件
        const source = fs.readFileSync(resolvedPath, "utf-8");
        const lexer = new Lexer(source);
        const parser = new Parser(lexer);
        moduleRecord.ast = parser.parseProgram();

        // 收集导入和导出
        this.collectModuleBindings(moduleRecord);

        // 递归加载依赖
        for (const dep of moduleRecord.dependencies) {
            await this.loadModule(dep, resolvedPath);
        }

        return moduleRecord;
    }

    // 收集模块的导入和导出绑定
    collectModuleBindings(moduleRecord) {
        const ast = moduleRecord.ast;

        for (const stmt of ast.body) {
            if (stmt.type === "ImportDeclaration") {
                const source = stmt.source.value;
                moduleRecord.dependencies.push(source);

                for (const specifier of stmt.specifiers) {
                    if (specifier.isDefault) {
                        // import default
                        moduleRecord.imports.set(specifier.local.name, {
                            source,
                            imported: "default",
                        });
                    } else if (specifier.isNamespace) {
                        // import * as ns
                        moduleRecord.imports.set(specifier.local.name, {
                            source,
                            imported: "*",
                        });
                    } else {
                        // import { a as b }
                        moduleRecord.imports.set(specifier.local.name, {
                            source,
                            imported: specifier.imported?.name || specifier.local.name,
                        });
                    }
                }
            } else if (stmt.type === "ExportDeclaration") {
                if (stmt.isDefault) {
                    // export default
                    moduleRecord.exports.set("default", {
                        type: "local",
                        declaration: stmt.declaration,
                    });
                } else if (stmt.declaration) {
                    // export function/class/const
                    const names = this.getDeclarationNames(stmt.declaration);
                    for (const name of names) {
                        moduleRecord.exports.set(name, {
                            type: "local",
                            local: name,
                            declaration: stmt.declaration,
                        });
                    }
                } else if (stmt.specifiers.length > 0) {
                    // export { a, b as c }
                    for (const specifier of stmt.specifiers) {
                        if (stmt.source) {
                            // re-export: export { a } from "module"
                            moduleRecord.exports.set(specifier.exported.name, {
                                type: "reexport",
                                source: stmt.source.value,
                                imported: specifier.local?.name || "*",
                            });
                            if (!moduleRecord.dependencies.includes(stmt.source.value)) {
                                moduleRecord.dependencies.push(stmt.source.value);
                            }
                        } else {
                            // local export: export { a as b }
                            moduleRecord.exports.set(specifier.exported.name, {
                                type: "local",
                                local: specifier.local.name,
                            });
                        }
                    }
                }
            }
        }
    }

    // 获取声明的名称
    getDeclarationNames(declaration) {
        const names = [];
        switch (declaration.type) {
            case "FunctionDeclaration":
            case "ClassDeclaration":
                if (declaration.id) {
                    names.push(declaration.id.name);
                }
                break;
            case "VariableDeclaration":
                for (const decl of declaration.declarations) {
                    if (decl.id.type === "Identifier") {
                        names.push(decl.id.name);
                    }
                    // TODO: 处理解构
                }
                break;
        }
        return names;
    }

    // 链接模块（解析所有绑定）
    linkModules() {
        // 拓扑排序
        this.moduleOrder = this.topologicalSort();

        // 链接每个模块
        for (const modulePath of this.moduleOrder) {
            const moduleRecord = this.modules.get(modulePath);
            if (moduleRecord.status !== "unlinked") continue;

            moduleRecord.status = "linking";
            this.linkModule(moduleRecord);
            moduleRecord.status = "linked";
        }
    }

    // 链接单个模块
    linkModule(moduleRecord) {
        // 解析导入绑定
        for (const [local, binding] of moduleRecord.imports) {
            const sourcePath = this.resolveModulePath(binding.source, moduleRecord.resolvedPath);
            const sourceModule = this.modules.get(sourcePath);

            if (!sourceModule) {
                throw new Error(`Module not found: ${binding.source}`);
            }

            if (binding.imported === "*") {
                // 命名空间导入
                binding.resolvedModule = sourceModule;
            } else {
                // 命名导入
                const exportBinding = sourceModule.exports.get(binding.imported);
                if (!exportBinding) {
                    throw new Error(`Export '${binding.imported}' not found in '${binding.source}'`);
                }
                binding.resolvedBinding = exportBinding;
                binding.resolvedModule = sourceModule;
            }
        }
    }

    // 拓扑排序（依赖优先）
    topologicalSort() {
        const visited = new Set();
        const result = [];

        const visit = (modulePath) => {
            if (visited.has(modulePath)) return;
            visited.add(modulePath);

            const moduleRecord = this.modules.get(modulePath);
            for (const dep of moduleRecord.dependencies) {
                const depPath = this.resolveModulePath(dep, modulePath);
                visit(depPath);
            }
            result.push(modulePath);
        };

        for (const modulePath of this.modules.keys()) {
            visit(modulePath);
        }

        return result;
    }

    // 获取编译顺序（依赖优先的模块列表）
    getCompilationOrder() {
        if (this.moduleOrder.length === 0) {
            this.linkModules();
        }
        return this.moduleOrder.map((path) => this.modules.get(path));
    }
}

// 模块编译器
export class ModuleCompiler {
    constructor(compiler, loader) {
        this.compiler = compiler;
        this.loader = loader;
        this.moduleLabels = new Map(); // modulePath -> { init, namespace }
    }

    // 为每个模块生成初始化标签
    generateModuleLabels() {
        let idx = 0;
        for (const [path, record] of this.loader.modules) {
            this.moduleLabels.set(path, {
                init: `_module_init_${idx}`,
                namespace: `_module_ns_${idx}`,
                exports: `_module_exports_${idx}`,
            });
            idx++;
        }
    }

    // 编译所有模块
    compileModules() {
        this.generateModuleLabels();
        const modules = this.loader.getCompilationOrder();

        // 生成每个模块的代码
        for (const moduleRecord of modules) {
            this.compileModule(moduleRecord);
        }

        // 生成模块初始化入口
        this.generateModuleEntryPoint(modules);
    }

    // 编译单个模块
    compileModule(moduleRecord) {
        const labels = this.moduleLabels.get(moduleRecord.resolvedPath);
        const vm = this.compiler.vm;

        // 模块初始化函数
        vm.label(labels.init);
        vm.prologue(16, []);

        // 检查是否已初始化（避免重复执行）
        vm.lea(VReg.V0, labels.namespace);
        vm.load(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 0);
        vm.jne(`${labels.init}_done`);

        // 创建模块命名空间对象
        vm.call("_object_new");
        vm.lea(VReg.V0, labels.namespace);
        vm.store(VReg.V0, 0, VReg.RET);

        // 编译模块体（跳过 import/export 声明）
        for (const stmt of moduleRecord.ast.body) {
            if (stmt.type !== "ImportDeclaration" && stmt.type !== "ExportDeclaration") {
                this.compiler.compileStatement(stmt);
            } else if (stmt.type === "ExportDeclaration" && stmt.declaration) {
                // 编译导出的声明
                this.compiler.compileStatement(stmt.declaration);
            }
        }

        // 将导出添加到命名空间对象
        for (const [name, binding] of moduleRecord.exports) {
            if (binding.type === "local" && binding.local) {
                // 获取本地变量值
                const offset = this.compiler.ctx.getLocal(binding.local);
                if (offset !== undefined) {
                    vm.lea(VReg.A0, labels.namespace);
                    vm.load(VReg.A0, VReg.A0, 0);
                    // 设置属性
                    // ... (需要实现 _object_set_property)
                }
            }
        }

        vm.label(`${labels.init}_done`);
        vm.epilogue([], 16);
    }

    // 生成主入口点
    generateModuleEntryPoint(modules) {
        const vm = this.compiler.vm;

        vm.label("_modules_init");
        vm.prologue(16, []);

        // 按顺序初始化所有模块
        for (const moduleRecord of modules) {
            const labels = this.moduleLabels.get(moduleRecord.resolvedPath);
            vm.call(labels.init);
        }

        vm.epilogue([], 16);
    }
}

// 导出
export { ModuleRecord };
