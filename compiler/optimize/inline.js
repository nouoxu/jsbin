// JSBin 编译器 - 函数内联优化器
// 将小函数的调用替换为函数体，减少调用开销

import { VReg } from "../../vm/index.js";

/**
 * 内联候选条件:
 * 1. 函数体只有一个 return 语句
 * 2. 函数没有闭包捕获变量
 * 3. 函数不是递归的
 * 4. 函数参数数量 <= 4
 * 5. 函数体语句数量 <= 5
 */

const MAX_INLINE_PARAMS = 4;
const MAX_INLINE_STATEMENTS = 5;

/**
 * 检查函数是否可以内联
 * @param {object} func - 函数 AST 节点
 * @param {string} funcName - 函数名
 * @param {Set} calledFunctions - 调用图中被调用的函数集合
 * @returns {object} { canInline: boolean, reason: string }
 */
export function canInlineFunction(func, funcName, calledFunctions = new Set()) {
    // 1. 检查参数数量
    const params = func.params || [];
    if (params.length > MAX_INLINE_PARAMS) {
        return { canInline: false, reason: `too many parameters (${params.length} > ${MAX_INLINE_PARAMS})` };
    }

    // 2. 检查是否是 async 或 generator 函数
    if (func.async || func.generator) {
        return { canInline: false, reason: "async/generator functions cannot be inlined" };
    }

    // 3. 检查函数体
    const body = func.body;
    if (!body || body.type !== "BlockStatement") {
        return { canInline: false, reason: "no function body" };
    }

    const statements = body.body || [];

    // 4. 检查语句数量
    if (statements.length > MAX_INLINE_STATEMENTS) {
        return { canInline: false, reason: `too many statements (${statements.length} > ${MAX_INLINE_STATEMENTS})` };
    }

    // 5. 检查是否有不支持内联的语句
    for (const stmt of statements) {
        const check = canInlineStatement(stmt, funcName, calledFunctions);
        if (!check.canInline) {
            return check;
        }
    }

    // 6. 特殊情况：只有一个 return 语句的函数优先内联
    if (statements.length === 1 && statements[0].type === "ReturnStatement") {
        return { canInline: true, reason: "single return statement", priority: "high" };
    }

    return { canInline: true, reason: "eligible for inlining", priority: "normal" };
}

/**
 * 检查语句是否可以内联
 */
function canInlineStatement(stmt, funcName, calledFunctions) {
    switch (stmt.type) {
        case "ReturnStatement":
            if (stmt.argument) {
                return canInlineExpression(stmt.argument, funcName, calledFunctions);
            }
            return { canInline: true };

        case "VariableDeclaration":
            for (const decl of stmt.declarations) {
                if (decl.init) {
                    const check = canInlineExpression(decl.init, funcName, calledFunctions);
                    if (!check.canInline) return check;
                }
            }
            return { canInline: true };

        case "ExpressionStatement":
            return canInlineExpression(stmt.expression, funcName, calledFunctions);

        case "IfStatement":
            // 简单的 if 语句可以内联
            const testCheck = canInlineExpression(stmt.test, funcName, calledFunctions);
            if (!testCheck.canInline) return testCheck;

            const consCheck = canInlineStatement(stmt.consequent, funcName, calledFunctions);
            if (!consCheck.canInline) return consCheck;

            if (stmt.alternate) {
                const altCheck = canInlineStatement(stmt.alternate, funcName, calledFunctions);
                if (!altCheck.canInline) return altCheck;
            }
            return { canInline: true };

        case "BlockStatement":
            for (const s of stmt.body) {
                const check = canInlineStatement(s, funcName, calledFunctions);
                if (!check.canInline) return check;
            }
            return { canInline: true };

        // 不支持内联的语句
        case "ForStatement":
        case "WhileStatement":
        case "DoWhileStatement":
        case "ForOfStatement":
        case "ForInStatement":
        case "TryStatement":
        case "SwitchStatement":
            return { canInline: false, reason: `${stmt.type} not supported in inlined functions` };

        default:
            return { canInline: true };
    }
}

/**
 * 检查表达式是否可以内联
 */
function canInlineExpression(expr, funcName, calledFunctions) {
    if (!expr) return { canInline: true };

    switch (expr.type) {
        case "CallExpression":
            // 检查是否是递归调用
            if (expr.callee.type === "Identifier" && expr.callee.name === funcName) {
                return { canInline: false, reason: "recursive call detected" };
            }
            // 检查调用的函数是否可以级联内联
            if (expr.callee.type === "Identifier") {
                calledFunctions.add(expr.callee.name);
            }
            // 检查参数
            for (const arg of expr.arguments || []) {
                const check = canInlineExpression(arg, funcName, calledFunctions);
                if (!check.canInline) return check;
            }
            return { canInline: true };

        case "BinaryExpression":
        case "LogicalExpression":
            const leftCheck = canInlineExpression(expr.left, funcName, calledFunctions);
            if (!leftCheck.canInline) return leftCheck;
            return canInlineExpression(expr.right, funcName, calledFunctions);

        case "UnaryExpression":
        case "UpdateExpression":
            return canInlineExpression(expr.argument, funcName, calledFunctions);

        case "ConditionalExpression":
            const testCheck = canInlineExpression(expr.test, funcName, calledFunctions);
            if (!testCheck.canInline) return testCheck;
            const consCheck = canInlineExpression(expr.consequent, funcName, calledFunctions);
            if (!consCheck.canInline) return consCheck;
            return canInlineExpression(expr.alternate, funcName, calledFunctions);

        case "MemberExpression":
            return canInlineExpression(expr.object, funcName, calledFunctions);

        case "ArrayExpression":
            for (const elem of expr.elements || []) {
                if (elem) {
                    const check = canInlineExpression(elem, funcName, calledFunctions);
                    if (!check.canInline) return check;
                }
            }
            return { canInline: true };

        case "ObjectExpression":
            for (const prop of expr.properties || []) {
                if (prop.value) {
                    const check = canInlineExpression(prop.value, funcName, calledFunctions);
                    if (!check.canInline) return check;
                }
            }
            return { canInline: true };

        case "AssignmentExpression":
            return canInlineExpression(expr.right, funcName, calledFunctions);

        case "AwaitExpression":
            return { canInline: false, reason: "await expression not supported in inlined functions" };

        case "YieldExpression":
            return { canInline: false, reason: "yield expression not supported in inlined functions" };

        default:
            return { canInline: true };
    }
}

/**
 * 内联函数分析器
 */
export class InlineAnalyzer {
    constructor() {
        this.inlineCandidates = new Map(); // funcName -> { func, check }
        this.callGraph = new Map(); // caller -> Set(callees)
    }

    /**
     * 分析所有函数，确定哪些可以内联
     * @param {object} ctx - 编译上下文
     */
    analyze(ctx) {
        const functions = ctx.functions || {};

        // 第一遍：收集所有可内联的候选
        for (const name in functions) {
            const func = functions[name];
            const calledFunctions = new Set();
            const check = canInlineFunction(func, name, calledFunctions);

            if (check.canInline) {
                this.inlineCandidates.set(name, { func, check, calledFunctions });
            }

            this.callGraph.set(name, calledFunctions);
        }

        // 第二遍：排除调用了不可内联函数的候选（可选，保守策略）
        // 这里我们保持简单，不做级联内联分析

        return this.inlineCandidates;
    }

    /**
     * 获取可内联的函数列表
     */
    getInlineCandidates() {
        return Array.from(this.inlineCandidates.keys());
    }

    /**
     * 检查函数是否可以内联
     */
    canInline(funcName) {
        return this.inlineCandidates.has(funcName);
    }

    /**
     * 获取函数的内联信息
     */
    getInlineInfo(funcName) {
        return this.inlineCandidates.get(funcName);
    }
}

/**
 * 内联代码生成器
 * 负责在调用点展开函数体
 */
export class InlineCodeGenerator {
    constructor(compiler) {
        this.compiler = compiler;
        this.analyzer = new InlineAnalyzer();
    }

    /**
     * 初始化内联分析
     */
    initialize() {
        this.analyzer.analyze(this.compiler.ctx);
    }

    /**
     * 检查调用是否应该内联
     * @param {string} funcName - 被调用的函数名
     * @param {array} args - 调用参数
     * @returns {boolean}
     */
    shouldInline(funcName, args) {
        if (!this.analyzer.canInline(funcName)) {
            return false;
        }

        const info = this.analyzer.getInlineInfo(funcName);
        const func = info.func;
        const params = func.params || [];

        // 参数数量必须匹配（简化处理，不考虑默认参数）
        if (args.length !== params.length) {
            return false;
        }

        return true;
    }

    /**
     * 内联函数调用
     * @param {string} funcName - 函数名
     * @param {array} args - 调用参数的 AST 节点
     * @returns {boolean} 是否成功内联
     */
    inlineCall(funcName, args) {
        const info = this.analyzer.getInlineInfo(funcName);
        if (!info) return false;

        const func = info.func;
        const params = func.params || [];
        const body = func.body.body || [];
        const compiler = this.compiler;
        const vm = compiler.vm;
        const ctx = compiler.ctx;

        // 保存原来的变量映射
        const savedLocals = { ...ctx.locals };
        const savedStackOffset = ctx.stackOffset;

        // 为参数创建临时变量并赋值
        const paramMappings = new Map();
        for (let i = 0; i < params.length; i++) {
            const param = params[i];
            if (param.type === "Identifier") {
                const paramName = param.name;
                // 创建内联专用的参数名，避免冲突
                const inlineParamName = `__inline_${funcName}_${paramName}_${ctx.labelCounter++}`;
                const offset = ctx.allocLocal(inlineParamName);
                paramMappings.set(paramName, inlineParamName);

                // 编译参数表达式
                compiler.compileExpression(args[i]);
                // 存储到临时变量
                vm.store(VReg.FP, offset, VReg.RET);
            }
        }

        // 创建参数名称重写器
        const rewriteIdentifier = (name) => {
            return paramMappings.get(name) || name;
        };

        // 内联函数体
        // 对于简单的单 return 语句，直接编译 return 表达式
        if (body.length === 1 && body[0].type === "ReturnStatement") {
            const returnExpr = body[0].argument;
            if (returnExpr) {
                // 编译 return 表达式，需要替换参数引用
                this.compileExpressionWithParamMapping(returnExpr, paramMappings);
            } else {
                // return undefined
                vm.lea(VReg.RET, "_js_undefined");
                vm.load(VReg.RET, VReg.RET, 0);
            }
        } else {
            // 对于多语句函数，需要更复杂的处理
            // 目前简化处理：编译整个函数体
            for (const stmt of body) {
                this.compileStatementWithParamMapping(stmt, paramMappings);
            }
        }

        // 恢复变量映射
        ctx.locals = savedLocals;
        ctx.stackOffset = savedStackOffset;

        return true;
    }

    /**
     * 编译表达式，并替换参数引用
     * 这是一个简化实现，只处理最常见的情况
     */
    compileExpressionWithParamMapping(expr, paramMappings) {
        const compiler = this.compiler;

        // 如果没有参数映射，直接编译
        if (!paramMappings || paramMappings.size === 0) {
            compiler.compileExpression(expr);
            return;
        }

        // 克隆并重写表达式中的标识符
        const rewrittenExpr = this.rewriteExpression(expr, paramMappings);
        compiler.compileExpression(rewrittenExpr);
    }

    /**
     * 编译语句，并替换参数引用
     */
    compileStatementWithParamMapping(stmt, paramMappings) {
        const compiler = this.compiler;

        if (!paramMappings || paramMappings.size === 0) {
            compiler.compileStatement(stmt);
            return;
        }

        const rewrittenStmt = this.rewriteStatement(stmt, paramMappings);
        compiler.compileStatement(rewrittenStmt);
    }

    /**
     * 重写表达式中的标识符
     */
    rewriteExpression(expr, paramMappings) {
        if (!expr) return expr;

        switch (expr.type) {
            case "Identifier":
                if (paramMappings.has(expr.name)) {
                    return { ...expr, name: paramMappings.get(expr.name) };
                }
                return expr;

            case "BinaryExpression":
            case "LogicalExpression":
                return {
                    ...expr,
                    left: this.rewriteExpression(expr.left, paramMappings),
                    right: this.rewriteExpression(expr.right, paramMappings),
                };

            case "UnaryExpression":
            case "UpdateExpression":
                return {
                    ...expr,
                    argument: this.rewriteExpression(expr.argument, paramMappings),
                };

            case "CallExpression":
                return {
                    ...expr,
                    callee: this.rewriteExpression(expr.callee, paramMappings),
                    arguments: (expr.arguments || []).map((arg) => this.rewriteExpression(arg, paramMappings)),
                };

            case "MemberExpression":
                return {
                    ...expr,
                    object: this.rewriteExpression(expr.object, paramMappings),
                    property: expr.computed ? this.rewriteExpression(expr.property, paramMappings) : expr.property,
                };

            case "ConditionalExpression":
                return {
                    ...expr,
                    test: this.rewriteExpression(expr.test, paramMappings),
                    consequent: this.rewriteExpression(expr.consequent, paramMappings),
                    alternate: this.rewriteExpression(expr.alternate, paramMappings),
                };

            case "AssignmentExpression":
                return {
                    ...expr,
                    left: this.rewriteExpression(expr.left, paramMappings),
                    right: this.rewriteExpression(expr.right, paramMappings),
                };

            case "ArrayExpression":
                return {
                    ...expr,
                    elements: (expr.elements || []).map((elem) => (elem ? this.rewriteExpression(elem, paramMappings) : elem)),
                };

            case "ObjectExpression":
                return {
                    ...expr,
                    properties: (expr.properties || []).map((prop) => ({
                        ...prop,
                        value: this.rewriteExpression(prop.value, paramMappings),
                    })),
                };

            default:
                return expr;
        }
    }

    /**
     * 重写语句中的标识符
     */
    rewriteStatement(stmt, paramMappings) {
        if (!stmt) return stmt;

        switch (stmt.type) {
            case "ReturnStatement":
                return {
                    ...stmt,
                    argument: this.rewriteExpression(stmt.argument, paramMappings),
                };

            case "ExpressionStatement":
                return {
                    ...stmt,
                    expression: this.rewriteExpression(stmt.expression, paramMappings),
                };

            case "VariableDeclaration":
                return {
                    ...stmt,
                    declarations: stmt.declarations.map((decl) => ({
                        ...decl,
                        init: this.rewriteExpression(decl.init, paramMappings),
                    })),
                };

            case "IfStatement":
                return {
                    ...stmt,
                    test: this.rewriteExpression(stmt.test, paramMappings),
                    consequent: this.rewriteStatement(stmt.consequent, paramMappings),
                    alternate: stmt.alternate ? this.rewriteStatement(stmt.alternate, paramMappings) : null,
                };

            case "BlockStatement":
                return {
                    ...stmt,
                    body: stmt.body.map((s) => this.rewriteStatement(s, paramMappings)),
                };

            default:
                return stmt;
        }
    }
}

/**
 * 创建内联分析器
 */
export function createInlineAnalyzer() {
    return new InlineAnalyzer();
}

/**
 * 创建内联代码生成器
 */
export function createInlineGenerator(compiler) {
    return new InlineCodeGenerator(compiler);
}
