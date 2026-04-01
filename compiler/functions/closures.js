// JSBin 编译器 - 闭包编译
// 编译函数表达式、闭包、函数体

import { VReg } from "../../vm/index.js";
import { analyzeCapturedVariables, analyzeSharedVariables } from "../../lang/analysis/closure.js";
import { ASYNC_CLOSURE_MAGIC, isAsyncFunction } from "../async/index.js";

// 闭包魔数 - 用于区分普通函数指针和闭包对象
const CLOSURE_MAGIC = 0xc105;

// 闭包编译方法混入
export const ClosureCompiler = {
    // 编译函数表达式
    compileFunctionExpression(expr) {
        const outerLocals = this.ctx.locals || {};
        const outerBoxedVars = this.ctx.boxedVars || new Set();
        const captured = analyzeCapturedVariables(expr, outerLocals, this.ctx.functions);

        const funcLabel = this.ctx.newLabel("fn");
        const isAsync = isAsyncFunction(expr);

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
        // 注意：闭包总是存储 box 指针，无论外部变量是否装箱
        // 因为 compileFunctionBody 总是期望 box 指针并解引用
        for (let i = 0; i < captured.length; i++) {
            const varName = captured[i];
            const offset = outerLocals[varName];
            if (offset !== undefined) {
                // 闭包指针在栈顶，弹出保存到 V3（因为 _alloc 会 clobber V1, V2）
                this.vm.pop(VReg.V3);  // V3 = closure pointer

                // 加载外部变量的值到 V1
                if (outerBoxedVars.has(varName)) {
                    // 外部变量是装箱的：加载 box 指针，解引用得到值
                    this.vm.load(VReg.V1, VReg.FP, offset);  // V1 = box pointer
                    this.vm.load(VReg.V1, VReg.V1, 0);  // V1 = dereferenced value
                } else {
                    // 外部变量不是装箱的：直接加载值
                    this.vm.load(VReg.V1, VReg.FP, offset);  // V1 = raw value
                }

                // 保存值和闭包指针到栈上（_alloc 会 clobber V0, V1, V2）
                this.vm.push(VReg.V1);  // 保存值
                this.vm.push(VReg.V3);  // 保存闭包指针

                // 创建新 box
                this.vm.movImm(VReg.A0, 8);  // box size = 8
                this.vm.call("_alloc");  // RET = new box pointer

                // 恢复闭包指针和值（逆序弹出）
                this.vm.pop(VReg.V2);  // V2 = 闭包指针
                this.vm.pop(VReg.V1);  // V1 = 值

                // 将值存入新 box (V1 = value, RET = box pointer)
                this.vm.store(VReg.RET, 0, VReg.V1);  // [RET] = value

                // 将 box 指针存入闭包 (V2 = closure, RET = box)
                this.vm.store(VReg.V2, 16 + i * 8, VReg.RET);  // [V2 + offset] = box

                // 如果外部变量是装箱的，更新外部变量的槽指向新的 box
                // 这样直接调用和闭包调用都能访问同一个 box
                if (outerBoxedVars.has(varName)) {
                    // 外部变量是装箱的，更新其槽指向新 box
                    this.vm.store(VReg.FP, offset, VReg.RET);  // [FP + offset] = new box
                }

                // 将闭包指针重新压栈（供下次迭代或后续使用）
                this.vm.push(VReg.V2);
            }
        }

        this.vm.pop(VReg.RET);

        // 将原始指针装箱为 JSValue 函数
        // JSValue = (ptr & 0x0000ffffffffffff) | 0x7fff000000000000
        this.vm.mov(VReg.V2, VReg.RET);  // V2 = 原始指针副本
        this.vm.movImm64(VReg.V1, 0x0000ffffffffffffn);  // V1 = MASK
        this.vm.and(VReg.V2, VReg.V2, VReg.V1);  // V2 = V2 & V1 = ptr & MASK
        this.vm.movImm64(VReg.V1, 0x7fff000000000000n);  // V1 = TAG (function)
        this.vm.or(VReg.RET, VReg.V2, VReg.V1);  // RET = (ptr & MASK) | TAG

        if (!this.pendingFunctions) {
            this.pendingFunctions = [];
        }
        this.pendingFunctions.push({
            label: funcLabel,
            expr: expr,
            captured: captured,
        });
    },

    // 生成待处理的函数体
    generatePendingFunctions() {
        if (!this.pendingFunctions || this.pendingFunctions.length === 0) {
            return;
        }

        for (const func of this.pendingFunctions) {
            this.vm.label(func.label);
            this.compileFunctionBody(func.expr, func.captured);
        }

        this.pendingFunctions = [];
    },

    // 编译函数体
    compileFunctionBody(expr, captured) {
        const params = expr.params || [];
        const vm = this.vm;

        const isAsync = isAsyncFunction(expr);

        // 函数入口 - 简化版本
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        const prevLocals = this.ctx.locals;
        const prevStackOffset = this.ctx.stackOffset;
        const prevReturnLabel = this.ctx.returnLabel;
        const prevBoxedVars = this.ctx.boxedVars;
        const prevInAsyncFunction = this.ctx.inAsyncFunction;

        this.ctx.locals = {};
        this.ctx.stackOffset = 0;
        this.ctx.inAsyncFunction = isAsync;

        // 分析函数体中哪些变量会被内部闭包捕获
        const innerBoxedVars = analyzeSharedVariables(expr);
        this.ctx.boxedVars = innerBoxedVars;

        const returnLabel = this.ctx.newLabel("fn_return");
        this.ctx.returnLabel = returnLabel;

        // 处理参数 - 先保存所有参数到栈（因为后续操作可能破坏参数寄存器）
        // 注意：先保存参数，再处理闭包捕获变量，避免寄存器冲突
        const paramOffsets = [];
        for (let i = 0; i < params.length && i < 6; i++) {
            if (params[i].type === "Identifier") {
                const paramName = params[i].name;
                const offset = this.ctx.allocLocal(paramName);
                paramOffsets.push({ name: paramName, offset: offset, argReg: vm.getArgReg(i) });
                vm.store(VReg.FP, offset, vm.getArgReg(i));
            }
        }

        // 保存 this 指针（通过 A5 传入的隐藏参数）到 __this 局部变量
        const thisOffset = this.ctx.allocLocal("__this");
        vm.store(VReg.FP, thisOffset, VReg.A5);

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
            vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
        }

        this.ctx.locals = prevLocals;
        this.ctx.stackOffset = prevStackOffset;
        this.ctx.returnLabel = prevReturnLabel;
        this.ctx.boxedVars = prevBoxedVars;
        this.ctx.inAsyncFunction = prevInAsyncFunction;
    },
};
