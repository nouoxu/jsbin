// JSBin 编译器 - 闭包编译
// 编译函数表达式、闭包、函数体、Generator

import { VReg } from "../../vm/index.js";
import { analyzeCapturedVariables, analyzeSharedVariables } from "../../lang/analysis/closure.js";
import { ASYNC_CLOSURE_MAGIC, isAsyncFunction } from "../async/index.js";

// 闭包魔数 - 用于区分普通函数指针和闭包对象
const CLOSURE_MAGIC = 0xc105;
// Generator 魔数
const GENERATOR_MAGIC = 0x6e47; // "Gn" in little endian

// 判断是否是 Generator 函数
function isGeneratorFunction(expr) {
    return expr.generator === true;
}

// 闭包编译方法混入
export const ClosureCompiler = {
    // 编译函数表达式
    compileFunctionExpression(expr) {
        const outerLocals = this.ctx.locals || {};
        const outerBoxedVars = this.ctx.boxedVars || new Set();
        const captured = analyzeCapturedVariables(expr, outerLocals, this.ctx.functions);

        const funcLabel = this.ctx.newLabel("fn");
        const isAsync = isAsyncFunction(expr);
        const isGenerator = isGeneratorFunction(expr);

        // 对于 Generator 函数，编译为返回 Generator 对象的工厂函数
        if (isGenerator) {
            this.compileGeneratorFunctionExpression(expr, funcLabel, captured, outerLocals, outerBoxedVars);
            return;
        }

        // 总是创建闭包对象，即使没有捕获变量
        // 这样可以统一闭包调用机制，避免区分普通函数指针和闭包对象
        // 闭包对象结构:
        // +0:  magic (0xC105 或 0xA51C for async)
        // +8:  func_ptr
        // +16: captured_var_0 (box 指针)
        // +24: captured_var_1 (box 指针)
        // ...
        const closureSize = 16 + captured.length * 8;

        this.vm.movImm(VReg.A0, closureSize);
        this.vm.call("_alloc");
        this.vm.push(VReg.RET);

        // 写入 magic 标记（区分普通函数和 async 函数）
        this.vm.movImm(VReg.V1, isAsync ? ASYNC_CLOSURE_MAGIC : CLOSURE_MAGIC);
        this.vm.store(VReg.RET, 0, VReg.V1);

        // 写入函数指针
        this.vm.lea(VReg.V1, funcLabel);
        this.vm.store(VReg.RET, 8, VReg.V1);

        // 写入捕获的变量（box 指针）
        for (let i = 0; i < captured.length; i++) {
            const varName = captured[i];
            const offset = outerLocals[varName];
            if (offset !== undefined) {
                // 加载变量 - 如果外部变量是装箱的，则加载 box 指针
                if (outerBoxedVars.has(varName)) {
                    // 外部变量是装箱的：直接复制 box 指针（引用捕获）
                    this.vm.load(VReg.V1, VReg.FP, offset);
                } else {
                    // 外部变量不是装箱的：直接复制值
                    this.vm.load(VReg.V1, VReg.FP, offset);
                }
                this.vm.pop(VReg.V2);
                this.vm.push(VReg.V2);
                this.vm.store(VReg.V2, 16 + i * 8, VReg.V1);
            }
        }

        this.vm.pop(VReg.RET);

        if (!this.pendingFunctions) {
            this.pendingFunctions = [];
        }
        this.pendingFunctions.push({
            label: funcLabel,
            expr: expr,
            captured: captured,
            savedImportedSymbols: this.importedSymbols, // 保存当前的 importedSymbols 引用
        });
    },

    // 编译 Generator 函数表达式
    compileGeneratorFunctionExpression(expr, funcLabel, captured, outerLocals, outerBoxedVars) {
        const vm = this.vm;
        const genBodyLabel = this.ctx.newLabel("gen_body");

        // 创建 Generator 工厂函数的闭包
        // 闭包结构: [magic, factory_ptr, captured...]
        const closureSize = 16 + captured.length * 8;

        vm.movImm(VReg.A0, closureSize);
        vm.call("_alloc");
        vm.push(VReg.RET);

        // 写入 Generator 魔数
        vm.movImm(VReg.V1, GENERATOR_MAGIC);
        vm.store(VReg.RET, 0, VReg.V1);

        // 写入工厂函数指针
        vm.lea(VReg.V1, funcLabel);
        vm.store(VReg.RET, 8, VReg.V1);

        // 写入捕获变量
        for (let i = 0; i < captured.length; i++) {
            const varName = captured[i];
            const offset = outerLocals[varName];
            if (offset !== undefined) {
                if (outerBoxedVars.has(varName)) {
                    vm.load(VReg.V1, VReg.FP, offset);
                } else {
                    vm.load(VReg.V1, VReg.FP, offset);
                }
                vm.pop(VReg.V2);
                vm.push(VReg.V2);
                vm.store(VReg.V2, 16 + i * 8, VReg.V1);
            }
        }

        vm.pop(VReg.RET);

        // 添加到待处理函数列表
        if (!this.pendingFunctions) {
            this.pendingFunctions = [];
        }
        this.pendingFunctions.push({
            label: funcLabel,
            expr: expr,
            captured: captured,
            isGenerator: true,
            bodyLabel: genBodyLabel,
            savedImportedSymbols: this.importedSymbols, // 保存当前的 importedSymbols 引用
        });
    },

    // 生成待处理的函数体
    generatePendingFunctions() {
        if (!this.pendingFunctions || this.pendingFunctions.length === 0) {
            return;
        }

        for (const func of this.pendingFunctions) {
            // 保存当前 importedSymbols，恢复函数创建时的 context
            const savedImportedSymbols = this.importedSymbols;
            if (func.savedImportedSymbols) {
                this.importedSymbols = func.savedImportedSymbols;
            }

            this.vm.label(func.label);
            if (func.isGenerator) {
                this.compileGeneratorFunctionBody(func.expr, func.captured, func.bodyLabel);
            } else {
                this.compileFunctionBody(func.expr, func.captured);
            }

            // 恢复 importedSymbols
            this.importedSymbols = savedImportedSymbols;
        }

        this.pendingFunctions = [];
    },

    // 编译 Generator 函数体 - 工厂函数
    // 调用时创建并返回 Generator 对象
    compileGeneratorFunctionBody(expr, captured, bodyLabel) {
        const vm = this.vm;
        const params = expr.params || [];

        // 工厂函数入口
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // 计算局部变量数量
        const localsCount = this.countGeneratorLocals(expr);

        // S0 = 闭包指针（由调用者传入）
        // 创建 Generator 对象
        vm.lea(VReg.A0, bodyLabel); // func_ptr = body 函数
        vm.mov(VReg.A1, VReg.S0); // closure_ptr
        vm.movImm(VReg.A2, localsCount + params.length); // locals_count
        vm.call("_generator_create");
        vm.mov(VReg.S1, VReg.RET); // S1 = Generator 对象

        // 将参数存储到 Generator 的 locals 区域
        for (let i = 0; i < params.length && i < 6; i++) {
            if (params[i].type === "Identifier") {
                // Generator.locals[i] = arg[i]
                vm.movImm(VReg.V0, 112 + i * 8); // locals 起始偏移
                vm.add(VReg.V1, VReg.S1, VReg.V0);
                vm.store(VReg.V1, 0, vm.getArgReg(i));
            }
        }

        // 返回 Generator 对象
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        // 生成 Generator body 函数
        this.compileGeneratorBodyFunction(expr, captured, bodyLabel, params.length);
    },

    // 计算 Generator 函数需要的局部变量数量
    countGeneratorLocals(expr) {
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
        if (expr.body && expr.body.type === "BlockStatement") {
            countInBlock(expr.body);
        }
        return count;
    },

    // 编译 Generator body 函数
    // 这是状态机驱动的函数，根据 resume_point 跳转到正确的位置
    compileGeneratorBodyFunction(expr, captured, bodyLabel, paramCount) {
        const vm = this.vm;

        // 估算 generator body 需要的栈空间（包含局部变量、临时变量与余量）
        // 注意：这里会在后续通过 ctx.allocLocal 动态分配局部变量，所以必须给足栈。
        const estimatedLocals = this.estimateStackSize(expr);
        const stackSize = Math.max(512, Math.ceil((estimatedLocals * 16 + 256) / 16) * 16);

        vm.label(bodyLabel);
        vm.prologue(stackSize, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // A0 = Generator 对象
        vm.mov(VReg.S0, VReg.A0);

        // 保存上下文
        const prevLocals = this.ctx.locals;
        const prevStackOffset = this.ctx.stackOffset;
        const prevReturnLabel = this.ctx.returnLabel;
        const prevBoxedVars = this.ctx.boxedVars;
        const prevInGenerator = this.ctx.inGenerator;
        const prevGeneratorReg = this.ctx.generatorReg;

        this.ctx.locals = {};
        this.ctx.stackOffset = 0;
        // 保留 callee-saved 寄存器占用的栈空间
        this.ctx.reserveCalleeSavedSpace(5); // S0, S1, S2, S3, S4 = 5 个寄存器
        this.ctx.allocatedStackSize = stackSize;
        this.ctx.boxedVars = new Set();
        this.ctx.inGenerator = true;
        this.ctx.generatorReg = VReg.S0; // Generator 对象在 S0

        // 为参数创建局部变量引用 (指向 Generator.locals)
        const params = expr.params || [];
        for (let i = 0; i < params.length; i++) {
            if (params[i].type === "Identifier") {
                // 从 Generator.locals[i] 加载到栈
                vm.movImm(VReg.V0, 112 + i * 8);
                vm.add(VReg.V1, VReg.S0, VReg.V0);
                vm.load(VReg.V2, VReg.V1, 0);
                const offset = this.ctx.allocLocal(params[i].name);
                vm.store(VReg.FP, offset, VReg.V2);
            }
        }

        const returnLabel = this.ctx.newLabel("gen_return");
        this.ctx.returnLabel = returnLabel;

        // 编译函数体
        if (expr.body.type === "BlockStatement") {
            for (const stmt of expr.body.body) {
                this.compileStatement(stmt);
            }
        }

        // 设置状态为完成
        vm.movImm(VReg.V0, 3); // COMPLETED
        vm.store(VReg.S0, 8, VReg.V0);

        // 返回 undefined
        vm.label(returnLabel);
        vm.lea(VReg.RET, "_js_undefined");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], stackSize);

        // 恢复上下文
        this.ctx.locals = prevLocals;
        this.ctx.stackOffset = prevStackOffset;
        this.ctx.returnLabel = prevReturnLabel;
        this.ctx.boxedVars = prevBoxedVars;
        this.ctx.inGenerator = prevInGenerator;
        this.ctx.generatorReg = prevGeneratorReg;
    },

    // 编译函数体
    compileFunctionBody(expr, captured) {
        const params = expr.params || [];
        const vm = this.vm;

        const isAsync = isAsyncFunction(expr);

        // 估算所需栈空间（闭包/箭头函数体同样可能非常复杂，不能固定 64 字节）
        const estimatedLocals = this.estimateStackSize(expr);
        const stackSize = Math.max(256, Math.ceil((estimatedLocals * 16 + 256) / 16) * 16);

        // 函数入口 - 简化版本
        vm.prologue(stackSize, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        const prevLocals = this.ctx.locals;
        const prevStackOffset = this.ctx.stackOffset;
        const prevReturnLabel = this.ctx.returnLabel;
        const prevBoxedVars = this.ctx.boxedVars;
        const prevInAsyncFunction = this.ctx.inAsyncFunction;

        this.ctx.locals = {};
        this.ctx.stackOffset = 0;
        // 保留 callee-saved 寄存器占用的栈空间
        this.ctx.reserveCalleeSavedSpace(4); // S0, S1, S2, S3 = 4 个寄存器
        this.ctx.allocatedStackSize = stackSize;
        this.ctx.inAsyncFunction = isAsync;

        // 分析函数体中哪些变量会被内部闭包捕获
        const innerBoxedVars = analyzeSharedVariables(expr);
        this.ctx.boxedVars = innerBoxedVars;

        const returnLabel = this.ctx.newLabel("fn_return");
        this.ctx.returnLabel = returnLabel;

        // 处理参数 - 先保存所有参数到栈（因为后续操作可能破坏参数寄存器）
        // 注意：先保存参数，再处理闭包捕获变量，避免寄存器冲突
        // 调用约定: A0-A5=参数 (最多6个寄存器参数)
        const paramOffsets = [];
        for (let i = 0; i < params.length && i < 6; i++) {
            if (params[i].type === "Identifier") {
                const paramName = params[i].name;
                const offset = this.ctx.allocLocal(paramName);
                paramOffsets.push({ name: paramName, offset: offset, argReg: vm.getArgReg(i) });
                vm.store(VReg.FP, offset, vm.getArgReg(i));
            }
        }

        // 保存 this 指针（通过 V5 传入的隐藏参数）到 __this 局部变量
        // 方法调用时 compileMethodCall 会设置 V5 = this
        const thisOffset = this.ctx.allocLocal("__this");
        vm.store(VReg.FP, thisOffset, VReg.V5);

        // 处理闭包捕获变量 - 从闭包对象中加载 box 指针
        // S0 寄存器包含闭包对象指针（由 compileClosureCall 传入）
        // 闭包对象布局: [magic(8), func_ptr(8), box_ptr_0, box_ptr_1, ...]
        if (captured && captured.length > 0) {
            // 将闭包指针保存到 S1，因为 S0 可能在函数体中被覆盖
            vm.mov(VReg.S1, VReg.S0);

            for (let i = 0; i < captured.length; i++) {
                const varName = captured[i];
                // 从闭包对象加载 box 指针到新的局部变量
                const offset = this.ctx.allocLocal(varName);
                const closureOffset = 16 + i * 8; // 跳过 magic 和 func_ptr
                vm.load(VReg.V1, VReg.S1, closureOffset); // 加载 box 指针
                vm.store(VReg.FP, offset, VReg.V1); // 存储 box 指针

                // 标记这个变量为装箱变量（因为它存储的是 box 指针）
                this.ctx.boxedVars.add(varName);
            }
        }

        // 为需要装箱的参数创建 box
        for (let i = 0; i < paramOffsets.length; i++) {
            const param = paramOffsets[i];
            if (innerBoxedVars.has(param.name)) {
                // 从栈中加载参数值
                vm.load(VReg.V1, VReg.FP, param.offset);
                vm.push(VReg.V1); // 保存参数值

                // 创建 box
                vm.movImm(VReg.A0, 8);
                vm.call("_alloc");
                vm.store(VReg.FP, param.offset, VReg.RET); // 存储 box 指针

                vm.pop(VReg.V1); // 恢复参数值
                vm.store(VReg.RET, 0, VReg.V1); // 存入 box
            }
        }

        // 编译函数体
        let hasImplicitReturn = false;
        if (expr.body.type === "BlockStatement") {
            for (const stmt of expr.body.body) {
                this.compileStatement(stmt);
            }
        } else {
            // 箭头函数表达式体 - 隐式返回
            this.compileExpression(expr.body);
            hasImplicitReturn = true;
        }

        // 默认返回 0（只有没有隐式返回时）
        if (!hasImplicitReturn) {
            vm.movImm(VReg.RET, 0);
        }
        vm.label(returnLabel);
        if (isAsync) {
            this.emitAsyncResolveAndReturnFromRet();
        } else {
            vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], stackSize);
        }

        this.ctx.locals = prevLocals;
        this.ctx.stackOffset = prevStackOffset;
        this.ctx.returnLabel = prevReturnLabel;
        this.ctx.boxedVars = prevBoxedVars;
        this.ctx.inAsyncFunction = prevInAsyncFunction;
    },
};
