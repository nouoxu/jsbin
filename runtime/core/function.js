// JSBin 运行时 - Function 方法
// 实现 Function.prototype.apply, call, bind

import { VReg } from "../../vm/index.js";

export class FunctionMethodsGenerator {
    constructor(vm, os) {
        this.vm = vm;
        this.os = os;
    }

    generate() {
        this.generateFunctionApply();
        this.generateFunctionBind();
        this.generateBoundFunctionCall();
    }

    // _function_apply(func, thisArg, argsArray)
    // A0 = 函数指针/闭包 (NaN-boxed)
    // A1 = thisArg (NaN-boxed)
    // A2 = 参数数组 (NaN-boxed array 或 null)
    // 返回: 函数调用结果
    generateFunctionApply() {
        const vm = this.vm;

        vm.label("_function_apply");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // S0 = func, S1 = thisArg, S2 = argsArray
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.mov(VReg.S2, VReg.A2);

        // 先解包函数
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // S0 = 原始函数指针/闭包堆指针

        // 检查 argsArray 是否为 null/undefined
        const noArgsLabel = "_function_apply_no_args";
        const callFuncLabel = "_function_apply_call";
        const doneLabel = "_function_apply_done";

        // 检查 argsArray 是否是 null (0x7FFA) 或 undefined (0x7FFB)
        vm.shrImm(VReg.V0, VReg.S2, 48);
        vm.movImm(VReg.V1, 0x7ffa);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq(noArgsLabel);
        vm.movImm(VReg.V1, 0x7ffb);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq(noArgsLabel);

        // 有参数数组，获取其长度
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_js_unbox");
        vm.mov(VReg.V0, VReg.RET); // V0 = 数组堆指针
        vm.load(VReg.S3, VReg.V0, 8); // S3 = 数组长度

        // 简化实现：最多支持 6 个参数，使用展开的条件分支而不是循环
        // 这样避免了循环计数器被函数调用破坏的问题

        // 定义参数存储偏移
        const argOffsets = [-48, -56, -64, -72, -80, -88];

        // 先初始化所有6个栈槽位为 undefined，这样未填充的位置有正确的默认值
        vm.movImm64(VReg.V0, "0x7ffb000000000000"); // undefined in NaN-boxing
        vm.store(VReg.FP, argOffsets[0], VReg.V0);
        vm.store(VReg.FP, argOffsets[1], VReg.V0);
        vm.store(VReg.FP, argOffsets[2], VReg.V0);
        vm.store(VReg.FP, argOffsets[3], VReg.V0);
        vm.store(VReg.FP, argOffsets[4], VReg.V0);
        vm.store(VReg.FP, argOffsets[5], VReg.V0);

        const argsDoneLabel = "_apply_args_done";

        // 检查是否有参数 0
        vm.cmpImm(VReg.S3, 1);
        vm.jlt(argsDoneLabel); // 没有参数，直接跳到调用

        // 获取参数 0
        vm.mov(VReg.A0, VReg.S2);
        vm.movImm(VReg.A1, 0);
        vm.call("_array_get");
        vm.store(VReg.FP, argOffsets[0], VReg.RET);

        // 检查是否有参数 1
        vm.cmpImm(VReg.S3, 2);
        vm.jlt(argsDoneLabel);

        // 获取参数 1
        vm.mov(VReg.A0, VReg.S2);
        vm.movImm(VReg.A1, 1);
        vm.call("_array_get");
        vm.store(VReg.FP, argOffsets[1], VReg.RET);

        // 检查是否有参数 2
        vm.cmpImm(VReg.S3, 3);
        vm.jlt(argsDoneLabel);

        // 获取参数 2
        vm.mov(VReg.A0, VReg.S2);
        vm.movImm(VReg.A1, 2);
        vm.call("_array_get");
        vm.store(VReg.FP, argOffsets[2], VReg.RET);

        // 检查是否有参数 3
        vm.cmpImm(VReg.S3, 4);
        vm.jlt(argsDoneLabel);

        // 获取参数 3
        vm.mov(VReg.A0, VReg.S2);
        vm.movImm(VReg.A1, 3);
        vm.call("_array_get");
        vm.store(VReg.FP, argOffsets[3], VReg.RET);

        // 检查是否有参数 4
        vm.cmpImm(VReg.S3, 5);
        vm.jlt(argsDoneLabel);

        // 获取参数 4
        vm.mov(VReg.A0, VReg.S2);
        vm.movImm(VReg.A1, 4);
        vm.call("_array_get");
        vm.store(VReg.FP, argOffsets[4], VReg.RET);

        // 检查是否有参数 5
        vm.cmpImm(VReg.S3, 6);
        vm.jlt(argsDoneLabel);

        // 获取参数 5
        vm.mov(VReg.A0, VReg.S2);
        vm.movImm(VReg.A1, 5);
        vm.call("_array_get");
        vm.store(VReg.FP, argOffsets[5], VReg.RET);

        vm.label(argsDoneLabel);
        // 所有参数已经存储到栈上（或保持为初始化的 undefined）
        // 直接跳转到调用
        vm.jmp(callFuncLabel);

        vm.label(noArgsLabel);
        // 无参数数组，S3 = 0，栈槽位保持 undefined（还未初始化）
        // 需要初始化栈槽位
        vm.movImm(VReg.S3, 0);
        vm.movImm64(VReg.V0, "0x7ffb000000000000");
        vm.store(VReg.FP, -48, VReg.V0);
        vm.store(VReg.FP, -56, VReg.V0);
        vm.store(VReg.FP, -64, VReg.V0);
        vm.store(VReg.FP, -72, VReg.V0);
        vm.store(VReg.FP, -80, VReg.V0);
        vm.store(VReg.FP, -88, VReg.V0);

        vm.label(callFuncLabel);
        // S0 = 函数指针/闘包指针
        // 设置 V7 = 参数个数
        vm.mov(VReg.V7, VReg.S3);

        // 检查是否是闭包（offset 0 有 magic）
        // 注意：必须在这里做闭包检查，因为下面要加载 A0-A5
        // V0/V1 与 A0/A1 是同一个物理寄存器，所以先检查闭包
        vm.load(VReg.V0, VReg.S0, 0);
        vm.movImm(VReg.V1, 0xc105);
        vm.cmp(VReg.V0, VReg.V1);
        const isClosureLabel = "_apply_is_closure";
        const notClosureLabel = "_apply_not_closure";
        const callDoneLabel = "_apply_call_done";
        vm.jeq(isClosureLabel);

        // 普通函数指针，直接调用
        vm.label(notClosureLabel);
        // 从栈加载参数到 A0-A5（覆盖之前用于闭包检查的 V0/V1）
        vm.load(VReg.A0, VReg.FP, -48);
        vm.load(VReg.A1, VReg.FP, -56);
        vm.load(VReg.A2, VReg.FP, -64);
        vm.load(VReg.A3, VReg.FP, -72);
        vm.load(VReg.A4, VReg.FP, -80);
        vm.load(VReg.A5, VReg.FP, -88);
        vm.callIndirect(VReg.S0);
        vm.jmp(callDoneLabel);

        vm.label(isClosureLabel);
        // 闭包调用：先加载函数指针到 S4（不影响 A0-A5）
        vm.load(VReg.S4, VReg.S0, 8); // 闭包的函数指针保存到 S4
        // 然后加载参数到 A0-A5
        vm.load(VReg.A0, VReg.FP, -48);
        vm.load(VReg.A1, VReg.FP, -56);
        vm.load(VReg.A2, VReg.FP, -64);
        vm.load(VReg.A3, VReg.FP, -72);
        vm.load(VReg.A4, VReg.FP, -80);
        vm.load(VReg.A5, VReg.FP, -88);
        // 闭包调用（S0 保持指向闭包对象，运行时代码可能需要）
        vm.callIndirect(VReg.S4);

        vm.label(callDoneLabel);
        // 结果已在 RET 中

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 128);
    }

    // _function_bind(func, thisArg, boundArgs)
    // 创建一个绑定函数对象
    // 绑定函数结构:
    //   offset 0: magic = 0xB1ND (0x4231_4E44)
    //   offset 8: 原始函数指针/闭包
    //   offset 16: thisArg
    //   offset 24: boundArgs 数组 (NaN-boxed)
    generateFunctionBind() {
        const vm = this.vm;

        vm.label("_function_bind");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2]);

        // 保存参数
        vm.mov(VReg.S0, VReg.A0); // func
        vm.mov(VReg.S1, VReg.A1); // thisArg
        vm.mov(VReg.S2, VReg.A2); // boundArgs

        // 分配绑定函数对象 (32 bytes)
        vm.movImm(VReg.A0, 32);
        vm.call("_alloc");
        vm.mov(VReg.V0, VReg.RET);

        // 设置 magic
        vm.movImm(VReg.V1, 0x4231); // 'B' '1'
        vm.shlImm(VReg.V1, VReg.V1, 16);
        vm.movImm(VReg.V2, 0x4e44); // 'N' 'D'
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.store(VReg.V0, 0, VReg.V1);

        // 存储原始函数
        vm.store(VReg.V0, 8, VReg.S0);

        // 存储 thisArg
        vm.store(VReg.V0, 16, VReg.S1);

        // 存储 boundArgs
        vm.store(VReg.V0, 24, VReg.S2);

        // 创建闭包包装，让它看起来像一个可调用对象
        // 使用闭包 magic (0xC105) 和绑定函数调用器
        vm.push(VReg.V0); // 保存绑定对象指针

        vm.movImm(VReg.A0, 24); // 闭包大小
        vm.call("_alloc");
        vm.pop(VReg.V1); // 恢复绑定对象指针

        // 闭包结构:
        //   offset 0: magic = 0xC105
        //   offset 8: 函数指针 = _bound_function_call
        //   offset 16: 闭包数据 = 绑定对象指针
        vm.movImm(VReg.V2, 0xc105);
        vm.store(VReg.RET, 0, VReg.V2);
        vm.lea(VReg.V2, "_bound_function_call");
        vm.store(VReg.RET, 8, VReg.V2);
        vm.store(VReg.RET, 16, VReg.V1);

        // NaN-box 闭包指针
        vm.mov(VReg.A0, VReg.RET);
        vm.movImm(VReg.A1, 10); // TYPE_CLOSURE
        vm.call("_js_box");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 64);
    }

    // _bound_function_call
    // 调用绑定函数，合并绑定参数和调用参数
    // S0 指向闭包对象，闭包数据指向绑定对象
    generateBoundFunctionCall() {
        const vm = this.vm;

        vm.label("_bound_function_call");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // S0 = 闭包对象指针
        // 从闭包数据获取绑定对象
        vm.load(VReg.V0, VReg.S0, 16); // 绑定对象指针
        vm.mov(VReg.S1, VReg.V0);

        // 从绑定对象获取信息
        vm.load(VReg.S0, VReg.S1, 8); // 原始函数
        vm.load(VReg.S2, VReg.S1, 16); // thisArg
        vm.load(VReg.S3, VReg.S1, 24); // boundArgs

        // 目前简化实现：直接用绑定参数调用原始函数
        // TODO: 合并调用参数
        vm.mov(VReg.A2, VReg.S3);
        vm.mov(VReg.A1, VReg.S2);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_function_apply");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 128);
    }
}
