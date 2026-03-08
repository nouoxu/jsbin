// JSBin 打印运行时
// 提供输出函数

import { VReg } from "../../vm/registers.js";
import { TYPE_STRING, TYPE_ARRAY, TYPE_OBJECT, TYPE_CLOSURE, TYPE_DATE, TYPE_PROMISE, TYPE_INT8, TYPE_FLOAT64, HEADER_SIZE, TYPE_REGEXP } from "./allocator.js";
import { TYPE_INT8_ARRAY, TYPE_FLOAT64_ARRAY, TYPE_ARRAY_BUFFER, TYPE_NUMBER } from "./types.js";

export class PrintGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // 辅助：调用 write 系统调用或 Windows API
    // A0=fd/unused, A1=buf, A2=len
    emitWriteCall() {
        const vm = this.vm;
        const platform = vm.platform;
        const arch = vm.arch;

        if (platform === "windows") {
            // Windows: 使用 WriteConsoleA
            // 需要先 GetStdHandle(-11) 获取 stdout
            // 参数已在 A1=buf, A2=len
            vm.callWindowsWriteConsole();
        } else if (arch === "arm64") {
            vm.syscall(platform === "linux" ? 64 : 4);
        } else {
            vm.syscall(platform === "linux" ? 1 : 0x2000004);
        }
    }

    // 打印字符串（无换行版本，供内部使用）
    generatePrintStringNoNL() {
        const vm = this.vm;

        vm.label("_print_str_no_nl");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // str pointer

        // 先计算长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // length

        // write(1, str, len)
        vm.movImm(VReg.A0, 1); // stdout
        vm.mov(VReg.A1, VReg.S0); // str
        vm.mov(VReg.A2, VReg.S1); // len

        this.emitWriteCall();

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // 打印字符串（带换行）
    generatePrintString() {
        const vm = this.vm;

        vm.label("_print_str");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // str pointer

        // 先计算长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // length

        // write(1, str, len)
        vm.movImm(VReg.A0, 1); // stdout
        vm.mov(VReg.A1, VReg.S0); // str
        vm.mov(VReg.A2, VReg.S1); // len

        this.emitWriteCall();

        // 打印换行
        vm.movImm(VReg.V0, 10); // '\n'
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);

        this.emitWriteCall();

        vm.pop(VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // 智能打印字符串（可以处理数据段字符串和堆字符串）
    // 输入：A0 = 字符串指针（可能是数据段或堆）
    generatePrintStringSmart() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_print_string_smart");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // S0 = str pointer

        // 检查是否在堆范围内
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_print_string_smart_data"); // < heap_base，是数据段字符串

        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_print_string_smart_data"); // >= heap_ptr，不在堆范围内

        // 在堆范围内，检查类型标记
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        vm.movImm(VReg.V3, TYPE_STRING);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jne("_print_string_smart_data");

        // 是堆字符串，跳过 16 字节头部
        vm.addImm(VReg.A0, VReg.S0, 16);
        vm.call("_print_str");
        vm.jmp("_print_string_smart_done");

        vm.label("_print_string_smart_data");
        // 数据段字符串，直接打印
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_str");

        vm.label("_print_string_smart_done");
        vm.epilogue([VReg.S0], 16);
    }

    // 智能打印字符串（无换行版本）
    generatePrintStringSmartNoNL() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_print_string_smart_no_nl");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // S0 = str pointer

        // 检查是否在堆范围内
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_print_string_smart_no_nl_data");

        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_print_string_smart_no_nl_data");

        // 在堆范围内，检查类型标记
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        vm.movImm(VReg.V3, TYPE_STRING);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jne("_print_string_smart_no_nl_data");

        // 是堆字符串，跳过 16 字节头部
        vm.addImm(VReg.A0, VReg.S0, 16);
        vm.call("_print_str_no_nl");
        vm.jmp("_print_string_smart_no_nl_done");

        vm.label("_print_string_smart_no_nl_data");
        // 数据段字符串，直接打印
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_str_no_nl");

        vm.label("_print_string_smart_no_nl_done");
        vm.epilogue([VReg.S0], 16);
    }

    // 打印换行
    generatePrintNewline() {
        const vm = this.vm;

        vm.label("_print_nl");
        vm.prologue(16, []);

        vm.movImm(VReg.V0, 10); // '\n'
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);

        this.emitWriteCall();

        vm.pop(VReg.V0);
        vm.epilogue([], 16);
    }

    // 打印布尔值 (true/false)
    generatePrintBool() {
        const vm = this.vm;

        vm.label("_print_bool");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        // 提取最低位来判断 true/false
        // NaN-boxed: JS_TRUE = ...001, JS_FALSE = ...000
        vm.andImm(VReg.S0, VReg.S0, 1);
        vm.cmpImm(VReg.S0, 0);
        const falseLabel = "_print_bool_false";
        vm.jeq(falseLabel);

        // 打印 "true"
        vm.lea(VReg.A0, "_str_true");
        vm.call("_print_str");
        vm.epilogue([VReg.S0], 16);

        vm.label(falseLabel);
        // 打印 "false"
        vm.lea(VReg.A0, "_str_false");
        vm.call("_print_str");
        vm.epilogue([VReg.S0], 16);
    }

    // 打印布尔值（无换行版本）
    generatePrintBoolNoNL() {
        const vm = this.vm;

        vm.label("_print_bool_no_nl");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        // 提取最低位来判断 true/false
        // NaN-boxed: JS_TRUE = ...001, JS_FALSE = ...000
        vm.andImm(VReg.S0, VReg.S0, 1);
        vm.cmpImm(VReg.S0, 0);
        const falseLabel = "_print_bool_no_nl_false";
        vm.jeq(falseLabel);

        // 打印 "true"
        vm.lea(VReg.A0, "_str_true");
        vm.call("_print_str_no_nl");
        vm.epilogue([VReg.S0], 16);

        vm.label(falseLabel);
        // 打印 "false"
        vm.lea(VReg.A0, "_str_false");
        vm.call("_print_str_no_nl");
        vm.epilogue([VReg.S0], 16);
    }

    // 打印空格
    generatePrintSpace() {
        const vm = this.vm;

        vm.label("_print_space");
        vm.prologue(16, []);

        // 打印空格字符
        vm.movImm(VReg.V0, 32); // ' '
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);

        vm.epilogue([], 16);
    }

    // print 函数的包装器（可作为一等公民传递）
    generatePrintWrapper() {
        const vm = this.vm;

        vm.label("_print_wrapper");
        vm.prologue(16, [VReg.S0]);
        // A0 已经是要打印的值
        vm.call("_print_value");
        vm.movImm(VReg.RET, 0); // 返回 undefined
        vm.epilogue([VReg.S0], 16);
    }

    // 打印 BigInt（无换行）
    // BigInt 存储为 raw int64，直接转换为十进制字符串打印
    generatePrintBigIntNoNL() {
        const vm = this.vm;

        vm.label("_print_bigint_no_nl");
        vm.prologue(16, [VReg.S0]);

        // 保存 A0（BigInt 值）到 S0
        vm.mov(VReg.S0, VReg.A0);

        // 调用 _intToStr 将 int64 转换为十进制字符串
        // A0 已经是 BigInt 值，不需要再移动
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_intToStr");

        // _intToStr 返回带类型头的字符串对象，内容在 offset 16
        // 跳过头部，获取实际字符串内容的指针
        vm.addImm(VReg.A0, VReg.RET, 16);
        vm.call("_print_str_no_nl");

        // 打印 "n" 后缀
        vm.movImm(VReg.A0, 110); // 'n'
        vm.call("_print_char");

        vm.epilogue([VReg.S0], 16);
    }

    // 打印 BigInt（带换行）
    generatePrintBigInt() {
        const vm = this.vm;

        vm.label("_print_bigint");
        vm.prologue(16, [VReg.S0]);

        vm.call("_print_bigint_no_nl");

        // 打印换行
        vm.movImm(VReg.A0, 10); // '\n'
        vm.call("_print_char");

        vm.epilogue([VReg.S0], 16);
    }

    // 统一的值打印函数
    // 支持 NaN-boxing 格式的值打印
    //
    // NaN-boxing 编码:
    //   - 纯 double: 直接是 IEEE 754 浮点数（不是特殊 NaN 模式）
    //   - Tagged value: 高 16 位是 0x7FF8-0x7FFF (tag 0-7)
    //   - Tag 0: int32, Tag 1: bool, Tag 2: null, Tag 3: undefined
    //   - Tag 4: string, Tag 5: object, Tag 6: array, Tag 7: function
    generatePrintValue() {
        const vm = this.vm;

        vm.label("_print_value");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0); // 保存值

        const doneLabel = "_print_value_done";
        const notNanBoxedLabel = "_print_value_not_nanboxed";

        // ============ 检查是否是 NaN-boxed 值 ============
        // NaN-boxed: 高 16 位在 0x7FF8 到 0x7FFF 范围内
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 48); // 右移 48 位得到高 16 位
        vm.movImm(VReg.V1, 0x7ff8);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jlt(notNanBoxedLabel); // < 0x7FF8，不是 NaN-boxed
        vm.movImm(VReg.V1, 0x7fff);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jgt(notNanBoxedLabel); // > 0x7FFF，不是 NaN-boxed

        // ============ 是 NaN-boxed 值 ============
        // 先检查是否是 TypedArray (高 16 位 = 0x7FFE)
        // V0 当前仍然是 >> 48 后的高 16 位
        vm.movImm(VReg.V1, 0x7ffe);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_print_value_typedarray_ptr");

        // 提取 tag: 低 3 位 of 高 16 位
        vm.andImm(VReg.V0, VReg.V0, 0x7); // 取低 3 位 = tag
        vm.mov(VReg.S1, VReg.V0); // S1 = tag

        // 根据 tag 分发
        // tag 0: int32
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_print_value_int32");

        // tag 1: boolean
        vm.cmpImm(VReg.S1, 1);
        vm.jeq("_print_value_bool");

        // tag 2: null
        vm.cmpImm(VReg.S1, 2);
        vm.jeq("_print_value_null");

        // tag 3: undefined
        vm.cmpImm(VReg.S1, 3);
        vm.jeq("_print_value_undefined");

        // tag 4: string (pointer)
        vm.cmpImm(VReg.S1, 4);
        vm.jeq("_print_value_string_ptr");

        // tag 5: object (pointer)
        vm.cmpImm(VReg.S1, 5);
        vm.jeq("_print_value_object_ptr");

        // tag 6: array (pointer)
        vm.cmpImm(VReg.S1, 6);
        vm.jeq("_print_value_array_ptr");

        // tag 7: function (pointer)
        vm.cmpImm(VReg.S1, 7);
        vm.jeq("_print_value_function_ptr");

        // 未知 tag，打印 [unknown]
        vm.lea(VReg.A0, "_str_unknown");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // ============ Tag 处理分支 ============

        // int32: payload 是 32 位整数
        vm.label("_print_value_int32");
        // 首先检查是否是 IEEE 754 NaN（exponent=0x7FF 且 mantissa≠0）
        // 高 16 位是 0x7FF8 意味着这可能是 quiet NaN
        // 如果低 48 位（mantissa）非零，这是 NaN 而不是 int32
        vm.mov(VReg.V0, VReg.S0);
        vm.movImm64(VReg.V1, "0x0000ffffffffffff"); // 低 48 位掩码
        vm.and(VReg.V0, VReg.V0, VReg.V1);
        vm.cmpImm(VReg.V0, 0);
        vm.jne("_print_value_ieee_nan");
        // 低 48 位是 0，这是真正的 int32(0)
        // 提取低 32 位作为有符号整数
        vm.mov(VReg.A0, VReg.S0);
        // 对于 32 位整数，符号扩展低 32 位
        vm.shl(VReg.A0, VReg.A0, 32);
        vm.sarImm(VReg.A0, VReg.A0, 32); // 算术右移恢复符号
        vm.call("_print_int");
        vm.jmp(doneLabel);

        // IEEE 754 NaN
        vm.label("_print_value_ieee_nan");
        vm.lea(VReg.A0, "_str_nan");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // boolean: payload 0=false, 1=true
        vm.label("_print_value_bool");
        vm.andImm(VReg.V0, VReg.S0, 1); // 取最低位
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_print_value_false");
        vm.lea(VReg.A0, "_str_true");
        vm.call("_print_str");
        vm.jmp(doneLabel);
        vm.label("_print_value_false");
        vm.lea(VReg.A0, "_str_false");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // null
        vm.label("_print_value_null");
        vm.lea(VReg.A0, "_str_null");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // undefined
        vm.label("_print_value_undefined");
        vm.lea(VReg.A0, "_str_undefined");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // string pointer: 提取 48 位指针
        vm.label("_print_value_string_ptr");
        // payload 是 48 位指针
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        vm.and(VReg.A0, VReg.A0, VReg.V1); // 提取低 48 位
        // 检查是否是堆字符串（有 16 字节头部）还是数据段字符串
        // 堆字符串: heap_base <= ptr < heap_ptr
        // 数据段字符串: 其他所有地址
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.A0, VReg.V1);
        vm.jlt("_print_value_str_data"); // < heap_base，是数据段字符串
        // ptr >= heap_base, 再检查是否 < heap_ptr
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.A0, VReg.V1);
        vm.jge("_print_value_str_data"); // >= heap_ptr，不在堆范围内，是数据段字符串
        // 是堆字符串，跳过 16 字节头部
        vm.addImm(VReg.A0, VReg.A0, 16);
        vm.call("_print_str");
        vm.jmp(doneLabel);
        vm.label("_print_value_str_data");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // object pointer
        vm.label("_print_value_object_ptr");
        // 提取 48 位指针
        vm.mov(VReg.S0, VReg.S0); // S0 已经是原始值
        vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        vm.and(VReg.S0, VReg.S0, VReg.V1); // S0 = 堆指针
        // 检查堆对象的具体类型
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        // 检查是否是 RegExp
        vm.cmpImm(VReg.V2, TYPE_REGEXP);
        vm.jeq("_print_value_heap_regexp");
        // 检查是否是 Date
        vm.cmpImm(VReg.V2, TYPE_DATE);
        vm.jeq("_print_value_heap_date");
        // 默认打印 "[object Object]"
        vm.lea(VReg.A0, "_str_object");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // array pointer
        vm.label("_print_value_array_ptr");
        vm.mov(VReg.A0, VReg.S0);
        // 直接传递 boxed 值给 _print_array，它会调用 _js_unbox
        vm.call("_print_array");
        vm.jmp(doneLabel);

        // TypedArray pointer (0x7FFE tag)
        vm.label("_print_value_typedarray_ptr");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_typedarray");
        vm.jmp(doneLabel);

        // function pointer
        vm.label("_print_value_function_ptr");
        vm.lea(VReg.A0, "_str_function");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // ============ 非 NaN-boxed 值 ============
        vm.label(notNanBoxedLabel);
        // 可能是:
        // 1. 纯浮点数 (IEEE 754 double)
        // 2. 原始指针（向后兼容旧代码）
        // 3. 小整数

        // ===== 首先检查 IEEE 754 特殊值 (Infinity/NaN) =====
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 52);
        vm.andImm(VReg.V0, VReg.V0, 0x7ff);
        vm.movImm(VReg.V1, 0x7ff);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_print_value_as_float"); // 是特殊浮点值

        // 检查是否为 0
        vm.cmpImm(VReg.S0, 0);
        vm.jne("_print_value_not_zero");
        vm.movImm(VReg.A0, 0);
        vm.call("_print_int");
        vm.jmp(doneLabel);

        vm.label("_print_value_not_zero");

        // 首先检查是否在堆范围内（优先检查堆对象）
        // 这样可以正确处理存储在全局变量中的堆对象指针
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_print_value_check_data_segment");
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_print_value_check_data_segment");

        // 在堆范围内，检查对象类型
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        vm.jmp("_print_value_dispatch_heap_type");

        vm.label("_print_value_check_data_segment");
        // 检查是否在数据段范围内（静态字符串向后兼容）
        // 数据段在 [_data_start, _heap_base) 之间
        vm.lea(VReg.V1, "_data_start");
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_print_value_not_heap");
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_print_value_not_heap");
        // 是数据段字符串
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label("_print_value_check_heap");
        // 检查是否在堆范围内（向后兼容原始指针）
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_print_value_not_heap");
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_print_value_as_float");

        // 是堆对象，检查类型
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);

        vm.label("_print_value_dispatch_heap_type");
        vm.cmpImm(VReg.V2, TYPE_ARRAY);
        vm.jeq("_print_value_heap_array");
        vm.cmpImm(VReg.V2, TYPE_OBJECT);
        vm.jeq("_print_value_heap_object");
        vm.cmpImm(VReg.V2, TYPE_CLOSURE);
        vm.jeq("_print_value_heap_function");
        vm.cmpImm(VReg.V2, TYPE_STRING);
        vm.jeq("_print_value_heap_string");
        vm.cmpImm(VReg.V2, TYPE_DATE);
        vm.jeq("_print_value_heap_date");
        vm.cmpImm(VReg.V2, TYPE_REGEXP);
        vm.jeq("_print_value_heap_regexp");
        // 检查 Number 对象 (TYPE_NUMBER = 13 或 TYPE_FLOAT64 = 29)
        vm.cmpImm(VReg.V2, TYPE_NUMBER);
        vm.jeq("_print_value_heap_number");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jeq("_print_value_heap_number");
        // 默认当作对象
        vm.jmp("_print_value_heap_object");

        // Number 对象: 类型在 +0, 值在 +8
        vm.label("_print_value_heap_number");
        vm.load(VReg.A0, VReg.S0, 8); // 加载 IEEE 754 值
        vm.call("_print_float");
        vm.jmp(doneLabel);

        vm.label("_print_value_heap_array");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_array");
        vm.jmp(doneLabel);

        vm.label("_print_value_heap_object");
        vm.lea(VReg.A0, "_str_object");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label("_print_value_heap_function");
        vm.lea(VReg.A0, "_str_function");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label("_print_value_heap_string");
        vm.addImm(VReg.A0, VReg.S0, 16);
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label("_print_value_heap_date");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_date_toISOString");
        vm.addImm(VReg.A0, VReg.RET, 16);
        vm.call("_print_str");
        vm.jmp(doneLabel);

        // RegExp: 打印 /pattern/flags
        vm.label("_print_value_heap_regexp");
        // 先打印 '/'
        vm.movImm(VReg.V0, 0x2f); // '/'
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);
        // 打印 pattern (offset +8 是 pattern 指针)
        vm.load(VReg.A0, VReg.S0, 8);
        vm.call("_print_str_no_nl");
        // 打印 '/'
        vm.movImm(VReg.V0, 0x2f);
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);
        // 打印 flags (offset +16 是整数 flags)
        vm.load(VReg.S1, VReg.S0, 16);
        // g=1, i=2, m=4, s=8, u=16, y=32
        vm.andImm(VReg.V0, VReg.S1, 1);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_print_value_regexp_no_g");
        vm.movImm(VReg.V0, 0x67); // 'g'
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);
        vm.label("_print_value_regexp_no_g");
        vm.andImm(VReg.V0, VReg.S1, 2);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_print_value_regexp_no_i");
        vm.movImm(VReg.V0, 0x69); // 'i'
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);
        vm.label("_print_value_regexp_no_i");
        vm.andImm(VReg.V0, VReg.S1, 4);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_print_value_regexp_no_m");
        vm.movImm(VReg.V0, 0x6d); // 'm'
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);
        vm.label("_print_value_regexp_no_m");
        // 打印换行
        vm.call("_print_nl");
        vm.jmp(doneLabel);

        vm.label("_print_value_not_heap");
        // 不在堆范围内，可能是整数或浮点数
        // 检查是否是小整数（-1MB 到 1MB）
        vm.cmpImm(VReg.S0, 0);
        vm.jlt("_print_value_check_neg");
        vm.movImm(VReg.V1, 0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_print_value_as_int");
        vm.jmp("_print_value_as_float");

        vm.label("_print_value_check_neg");
        vm.movImm(VReg.V1, -0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_print_value_as_int");
        // 大负数，当作浮点数
        vm.jmp("_print_value_as_float");

        vm.label("_print_value_as_int");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_int");
        vm.jmp(doneLabel);

        vm.label("_print_value_as_float");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_float");
        vm.jmp(doneLabel);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // 打印数组 [1, 2, 3]
    generatePrintArray() {
        const vm = this.vm;

        vm.label("_print_array");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // 保存原始输入到 S3 供调试用
        vm.mov(VReg.S3, VReg.A0);

        // A0 包含输入参数（可能是 boxed 数组 JSValue 或原始指针）
        // 调用 _js_unbox 获取原始指针
        vm.mov(VReg.S0, VReg.RET); // 原始数组指针

        // 打印 "["
        vm.lea(VReg.A0, "_str_lbracket");
        vm.call("_print_str_no_nl");

        // 获取数组长度 (在偏移 8 处，布局: [type:8][length:8][capacity:8][elements...])
        vm.load(VReg.S1, VReg.S0, 8); // length

        // 索引从 0 开始
        vm.movImm(VReg.S2, 0); // index

        const loopLabel = "_print_array_loop";
        const endLabel = "_print_array_end";
        const notFirstLabel = "_print_array_not_first";

        vm.label(loopLabel);
        vm.cmp(VReg.S2, VReg.S1);
        vm.jge(endLabel);

        // 如果不是第一个元素，先打印 ", "
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(notFirstLabel);
        vm.lea(VReg.A0, "_str_comma");
        vm.call("_print_str_no_nl");

        vm.label(notFirstLabel);
        // 获取元素值: array[index] = *(array + 24 + index * 8)
        // 数组布局: [type:8][length:8][capacity:8][elements...], header = 24 bytes
        vm.mov(VReg.V0, VReg.S2);
        vm.shlImm(VReg.V0, VReg.V0, 3); // index * 8
        vm.addImm(VReg.V0, VReg.V0, 24); // + header size (type + length + capacity)
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.A0, VReg.V0, 0); // 加载元素（JSValue）
        vm.call("_print_value_no_nl"); // 使用通用打印支持各种类型

        // 索引加 1
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(loopLabel);

        vm.label(endLabel);
        // 打印 "]" 和换行
        vm.lea(VReg.A0, "_str_rbracket");
        vm.call("_print_str");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // 数组打印（无换行版本，用于嵌套数组）
    generatePrintArrayNoNL() {
        const vm = this.vm;

        vm.label("_print_array_no_nl");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // 保存原始输入到 S3 供调试用
        vm.mov(VReg.S3, VReg.A0);

        // 调用 _js_unbox 获取原始指针
        vm.mov(VReg.S0, VReg.RET);

        // 打印 "["
        vm.lea(VReg.A0, "_str_lbracket");
        vm.call("_print_str_no_nl");

        // 获取数组长度 (在偏移 8 处)
        vm.load(VReg.S1, VReg.S0, 8);
        vm.movImm(VReg.S2, 0);

        const loopLabel = "_print_array_no_nl_loop";
        const endLabel = "_print_array_no_nl_end";
        const notFirstLabel = "_print_array_no_nl_not_first";

        vm.label(loopLabel);
        vm.cmp(VReg.S2, VReg.S1);
        vm.jge(endLabel);

        vm.cmpImm(VReg.S2, 0);
        vm.jeq(notFirstLabel);
        vm.lea(VReg.A0, "_str_comma");
        vm.call("_print_str_no_nl");

        vm.label(notFirstLabel);
        vm.mov(VReg.V0, VReg.S2);
        vm.shlImm(VReg.V0, VReg.V0, 3);
        vm.addImm(VReg.V0, VReg.V0, 24); // header = 24 bytes
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.A0, VReg.V0, 0);
        vm.call("_print_value_no_nl");

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(loopLabel);

        vm.label(endLabel);
        // 只打印 "]"，不换行
        vm.lea(VReg.A0, "_str_rbracket");
        vm.call("_print_str_no_nl");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // 数组元素打印（无换行）
    // - 字符串元素：打印带双引号的内容
    // - 其他：复用 _print_value_no_nl
    generatePrintArrayElemNoNL() {
        const vm = this.vm;

        vm.label("_print_array_elem_no_nl");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        const doneLabel = "_print_array_elem_done";
        const checkDataLabel = "_print_array_elem_check_data";
        const isHeapObjLabel = "_print_array_elem_is_heap";
        const isStringLabel = "_print_array_elem_is_string";
        const isDataStringLabel = "_print_array_elem_is_data_string";

        // 0 直接走通用逻辑
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(checkDataLabel);

        // heap_base <= ptr < heap_ptr 才认为是堆对象
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt(checkDataLabel);

        vm.lea(VReg.V2, "_heap_ptr");
        vm.load(VReg.V2, VReg.V2, 0);
        vm.cmp(VReg.S0, VReg.V2);
        vm.jge(checkDataLabel);

        vm.jmp(isHeapObjLabel);

        vm.label(isHeapObjLabel);
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        vm.movImm(VReg.V3, TYPE_STRING);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq(isStringLabel);

        // 非字符串，走通用打印
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_value_no_nl");
        vm.jmp(doneLabel);

        vm.label(isStringLabel);
        // 打印 " + content + " (堆字符串内容在 +16)
        vm.lea(VReg.A0, "_str_quote");
        vm.call("_print_str_no_nl");
        vm.addImm(VReg.A0, VReg.S0, 16);
        vm.call("_print_str_no_nl");
        vm.lea(VReg.A0, "_str_quote");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(checkDataLabel);
        // 数据段字符串：如果首字节在可打印 ASCII 范围内，则按字符串加引号输出
        // 否则退回通用打印
        vm.movImm(VReg.V1, 0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt(isDataStringLabel); // < 1MB 肯定不是数据段字符串，走通用打印

        vm.loadByte(VReg.V1, VReg.S0, 0);
        vm.cmpImm(VReg.V1, 32);
        vm.jlt(isDataStringLabel);
        vm.cmpImm(VReg.V1, 127);
        vm.jge(isDataStringLabel);

        // 看起来像 C 字符串
        vm.lea(VReg.A0, "_str_quote");
        vm.call("_print_str_no_nl");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_str_no_nl");
        vm.lea(VReg.A0, "_str_quote");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(isDataStringLabel);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_value_no_nl");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 打印 Promise（带换行）
    // A0 = promise 指针
    generatePrintPromise() {
        const vm = this.vm;

        vm.label("_print_promise");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        // status: +8
        vm.load(VReg.S1, VReg.S0, 8);

        const pendingLabel = "_print_promise_pending";
        const fulfilledLabel = "_print_promise_fulfilled";
        const rejectedLabel = "_print_promise_rejected";
        const doneLabel = "_print_promise_done";

        // pending = 0
        vm.cmpImm(VReg.S1, 0);
        vm.jeq(pendingLabel);

        // fulfilled = 1
        vm.cmpImm(VReg.S1, 1);
        vm.jeq(fulfilledLabel);

        // rejected = 2
        vm.cmpImm(VReg.S1, 2);
        vm.jeq(rejectedLabel);

        // unknown -> 当作 pending
        vm.jmp(pendingLabel);

        vm.label(pendingLabel);
        vm.lea(VReg.A0, "_str_promise_pending");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label(fulfilledLabel);
        vm.lea(VReg.A0, "_str_promise_fulfilled_full");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label(rejectedLabel);
        vm.lea(VReg.A0, "_str_promise_rejected_full");
        vm.call("_print_str");
        vm.jmp(doneLabel);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 打印 Promise（无换行）
    // A0 = promise 指针
    generatePrintPromiseNoNL() {
        const vm = this.vm;

        vm.label("_print_promise_no_nl");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        vm.load(VReg.S1, VReg.S0, 8); // status

        const pendingLabel = "_print_promise_nl_pending";
        const fulfilledLabel = "_print_promise_nl_fulfilled";
        const rejectedLabel = "_print_promise_nl_rejected";
        const doneLabel = "_print_promise_nl_done";

        vm.cmpImm(VReg.S1, 0);
        vm.jeq(pendingLabel);
        vm.cmpImm(VReg.S1, 1);
        vm.jeq(fulfilledLabel);
        vm.cmpImm(VReg.S1, 2);
        vm.jeq(rejectedLabel);
        vm.jmp(pendingLabel);

        vm.label(pendingLabel);
        vm.lea(VReg.A0, "_str_promise_pending");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(fulfilledLabel);
        vm.lea(VReg.A0, "_str_promise_fulfilled_full");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(rejectedLabel);
        vm.lea(VReg.A0, "_str_promise_rejected_full");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 打印值（无换行版本，用于数组元素）
    // 支持 NaN-boxed JSValue 和堆对象
    generatePrintValueNoNL() {
        const vm = this.vm;

        vm.label("_print_value_no_nl");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        const doneLabel = "_print_vnl_done";
        const notNanBoxedLabel = "_print_vnl_not_nanboxed";
        const checkHeapLabel = "_print_vnl_check_heap";

        // ============ 首先检查是否是 NaN-boxed 值 ============
        // NaN-boxed: 高 16 位在 0x7FF8 到 0x7FFF 范围内
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 48); // 右移 48 位得到高 16 位
        vm.movImm(VReg.V1, 0x7ff8);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jlt(notNanBoxedLabel); // < 0x7FF8，不是 NaN-boxed
        vm.movImm(VReg.V1, 0x7fff);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jgt(notNanBoxedLabel); // > 0x7FFF，不是 NaN-boxed

        // ============ 是 NaN-boxed 值，提取 tag ============
        // tag 在 bits 48-50 (低 3 位 of 高 16 位)
        vm.andImm(VReg.V0, VReg.V0, 0x7); // 取低 3 位 = tag
        vm.mov(VReg.S1, VReg.V0);

        // tag 0: int32
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_print_vnl_int32");

        // tag 1: boolean
        vm.cmpImm(VReg.S1, 1);
        vm.jeq("_print_vnl_bool");

        // tag 2: null
        vm.cmpImm(VReg.S1, 2);
        vm.jeq("_print_vnl_null");

        // tag 3: undefined
        vm.cmpImm(VReg.S1, 3);
        vm.jeq("_print_vnl_undefined");

        // tag 4: string pointer
        vm.cmpImm(VReg.S1, 4);
        vm.jeq("_print_vnl_string_ptr");

        // tag 5: object pointer
        vm.cmpImm(VReg.S1, 5);
        vm.jeq("_print_vnl_object_ptr");

        // tag 6: array pointer
        vm.cmpImm(VReg.S1, 6);
        vm.jeq("_print_vnl_array_ptr");

        // tag 7: function pointer
        vm.cmpImm(VReg.S1, 7);
        vm.jeq("_print_vnl_function_ptr");

        // 未知 tag
        vm.lea(VReg.A0, "_str_unknown");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        // ============ NaN-boxed tag 处理 ============

        // int32
        vm.label("_print_vnl_int32");
        vm.mov(VReg.A0, VReg.S0);
        vm.shl(VReg.A0, VReg.A0, 32);
        vm.sarImm(VReg.A0, VReg.A0, 32);
        vm.call("_print_int_no_nl");
        vm.jmp(doneLabel);

        // boolean
        vm.label("_print_vnl_bool");
        vm.andImm(VReg.V0, VReg.S0, 1);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_print_vnl_false");
        vm.lea(VReg.A0, "_str_true");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);
        vm.label("_print_vnl_false");
        vm.lea(VReg.A0, "_str_false");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        // null
        vm.label("_print_vnl_null");
        vm.lea(VReg.A0, "_str_null");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        // undefined
        vm.label("_print_vnl_undefined");
        vm.lea(VReg.A0, "_str_undefined");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        // string pointer (tag 4)
        vm.label("_print_vnl_string_ptr");
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        vm.and(VReg.A0, VReg.A0, VReg.V1);
        // 检查是否是堆字符串
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.A0, VReg.V1);
        vm.jlt("_print_vnl_str_data");
        // 堆字符串，跳过头部
        vm.addImm(VReg.A0, VReg.A0, 16);
        vm.label("_print_vnl_str_data");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        // object pointer (tag 5)
        vm.label("_print_vnl_object_ptr");
        vm.lea(VReg.A0, "_str_object");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        // array pointer (tag 6)
        vm.label("_print_vnl_array_ptr");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_array_no_nl");
        vm.jmp(doneLabel);

        // function pointer (tag 7)
        vm.label("_print_vnl_function_ptr");
        vm.lea(VReg.A0, "_str_function");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        // ============ 不是 NaN-boxed ============
        vm.label(notNanBoxedLabel);

        // ===== 首先检查 IEEE 754 特殊值 (Infinity/NaN) =====
        // 检查高 12 位是否是 0x7FF 或 0xFFF (正/负无穷或 NaN)
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 52);
        vm.andImm(VReg.V0, VReg.V0, 0x7ff); // 屏蔽符号位
        vm.movImm(VReg.V1, 0x7ff);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_print_vnl_maybe_float"); // 是特殊浮点值，直接跳到浮点打印

        // 检查是否是 0
        vm.cmpImm(VReg.S0, 0);
        vm.jne(checkHeapLabel);
        vm.movImm(VReg.A0, 0);
        vm.call("_print_int_no_nl");
        vm.jmp(doneLabel);

        // 检查是否是堆指针 (使用无符号比较，因为地址是大的正数)
        vm.label(checkHeapLabel);
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);

        vm.cmp(VReg.S0, VReg.V1);
        vm.jb("_print_vnl_maybe_float"); // 无符号小于

        vm.lea(VReg.V4, "_heap_ptr");
        vm.load(VReg.V4, VReg.V4, 0);

        vm.cmp(VReg.S0, VReg.V4);
        vm.jae("_print_vnl_maybe_float"); // 无符号大于等于

        // 是堆对象，检查类型
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);

        vm.movImm(VReg.V3, TYPE_ARRAY);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq("_print_vnl_heap_array");

        vm.movImm(VReg.V3, TYPE_STRING);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq("_print_vnl_heap_string");

        // 检查是否是 Number 对象 (TYPE_FLOAT64 = 29)
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jeq("_print_vnl_heap_number");

        // 检查是否是其他数字类型 (TYPE_INT8=20 到 TYPE_FLOAT64=29)
        vm.movImm(VReg.V3, TYPE_INT8);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jge("_print_vnl_check_number_range");

        // 其他堆对象
        vm.lea(VReg.A0, "_str_object");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        // 检查是否在数字类型范围内
        vm.label("_print_vnl_check_number_range");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jgt("_print_vnl_heap_object");
        // 是数字类型
        vm.jmp("_print_vnl_heap_number");

        vm.label("_print_vnl_heap_object");
        vm.lea(VReg.A0, "_str_object");
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        vm.label("_print_vnl_heap_number");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_number_no_nl");
        vm.jmp(doneLabel);

        vm.label("_print_vnl_heap_array");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_array_no_nl");
        vm.jmp(doneLabel);

        vm.label("_print_vnl_heap_string");
        vm.addImm(VReg.A0, VReg.S0, 16);
        vm.call("_print_str_no_nl");
        vm.jmp(doneLabel);

        // 可能是浮点数或数据段字符串指针
        vm.label("_print_vnl_maybe_float");
        // 检查是否可能是数据段字符串指针
        // 在 macOS ARM64 上，程序通常加载在 0x100000000 附近
        // 如果高 32 位是 0x1（即地址在 0x100000000 到 0x1FFFFFFFF 范围内），可能是代码/数据段地址
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 32);
        vm.cmpImm(VReg.V0, 1);
        vm.jne("_print_vnl_really_float"); // 不是 0x1xxxxxxxx，当作浮点数

        // 可能是数据段字符串，使用智能字符串打印
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_string_smart_no_nl");
        vm.jmp(doneLabel);

        vm.label("_print_vnl_really_float");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_float_no_nl");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 打印 TypedArray: "Float64Array(3) [1, 2.5, 3.14]"
    generatePrintTypedArray() {
        const vm = this.vm;

        vm.label("_print_typedarray");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // A0 可能是 boxed TypedArray，先 unbox
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed pointer)

        // 加载 type 和 length
        vm.load(VReg.S1, VReg.S0, 0); // type
        vm.load(VReg.S2, VReg.S0, 8); // length

        // 根据 type 确定元素大小，存入 S4
        // 1字节: Int8Array(0x40), Uint8Array(0x50), Uint8ClampedArray(0x54)
        // 2字节: Int16Array(0x41), Uint16Array(0x51)
        // 4字节: Int32Array(0x42), Uint32Array(0x52), Float32Array(0x60)
        // 8字节: BigInt64Array(0x43), BigUint64Array(0x53), Float64Array(0x61)
        vm.movImm(VReg.S4, 8); // 默认 8 字节

        // 检查 1 字节类型
        vm.cmpImm(VReg.S1, 0x40); // Int8Array
        vm.jeq("_print_ta_1byte");
        vm.cmpImm(VReg.S1, 0x50); // Uint8Array
        vm.jeq("_print_ta_1byte");
        vm.cmpImm(VReg.S1, 0x54); // Uint8ClampedArray
        vm.jeq("_print_ta_1byte");

        // 检查 2 字节类型
        vm.cmpImm(VReg.S1, 0x41); // Int16Array
        vm.jeq("_print_ta_2byte");
        vm.cmpImm(VReg.S1, 0x51); // Uint16Array
        vm.jeq("_print_ta_2byte");

        // 检查 4 字节类型
        vm.cmpImm(VReg.S1, 0x42); // Int32Array
        vm.jeq("_print_ta_4byte");
        vm.cmpImm(VReg.S1, 0x52); // Uint32Array
        vm.jeq("_print_ta_4byte");
        vm.cmpImm(VReg.S1, 0x60); // Float32Array
        vm.jeq("_print_ta_4byte");

        // 默认 8 字节类型
        vm.jmp("_print_ta_header");

        vm.label("_print_ta_1byte");
        vm.movImm(VReg.S4, 1);
        vm.jmp("_print_ta_header");

        vm.label("_print_ta_2byte");
        vm.movImm(VReg.S4, 2);
        vm.jmp("_print_ta_header");

        vm.label("_print_ta_4byte");
        vm.movImm(VReg.S4, 4);
        vm.jmp("_print_ta_header");

        // 打印类型名称
        vm.label("_print_ta_header");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_typeof");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_print_str_no_nl");

        // 打印 "(length) ["
        vm.movImm(VReg.A0, 40); // '('
        vm.call("_print_char");
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_print_int_no_nl");
        vm.movImm(VReg.A0, 41); // ')'
        vm.call("_print_char");
        vm.movImm(VReg.A0, 32); // ' '
        vm.call("_print_char");
        vm.movImm(VReg.A0, 91); // '['
        vm.call("_print_char");

        // 打印元素，使用 S3 作为循环计数器，S5 作为当前偏移
        vm.movImm(VReg.S3, 0); // i = 0
        vm.movImm(VReg.S5, 16); // offset = 16 (header size)

        vm.label("_print_ta_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_print_ta_done");

        // 打印逗号分隔符 (除了第一个元素)
        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_print_ta_elem");
        vm.lea(VReg.A0, "_str_comma");
        vm.call("_print_str_no_nl");

        vm.label("_print_ta_elem");
        // 计算元素地址: arr + offset
        vm.add(VReg.V0, VReg.S0, VReg.S5);

        // 根据类型选择加载方式并打印
        // Float64Array (0x61): 加载 8 字节，打印浮点
        vm.cmpImm(VReg.S1, 0x61);
        vm.jeq("_print_ta_float64");

        // Float32Array (0x60): 加载 4 字节，打印浮点
        vm.cmpImm(VReg.S1, 0x60);
        vm.jeq("_print_ta_float32");

        // 整数类型：加载字节并组装
        // 1 字节有符号: Int8Array (0x40)
        vm.cmpImm(VReg.S1, 0x40);
        vm.jeq("_print_ta_int8");

        // 1 字节无符号: Uint8Array (0x50), Uint8ClampedArray (0x54)
        vm.cmpImm(VReg.S1, 0x50);
        vm.jeq("_print_ta_uint8");
        vm.cmpImm(VReg.S1, 0x54);
        vm.jeq("_print_ta_uint8");

        // 2 字节有符号: Int16Array (0x41)
        vm.cmpImm(VReg.S1, 0x41);
        vm.jeq("_print_ta_int16");

        // 2 字节无符号: Uint16Array (0x51)
        vm.cmpImm(VReg.S1, 0x51);
        vm.jeq("_print_ta_uint16");

        // 4 字节有符号: Int32Array (0x42)
        vm.cmpImm(VReg.S1, 0x42);
        vm.jeq("_print_ta_int32");

        // 4 字节无符号: Uint32Array (0x52)
        vm.cmpImm(VReg.S1, 0x52);
        vm.jeq("_print_ta_uint32");

        // 8 字节有符号: BigInt64Array (0x43)
        vm.cmpImm(VReg.S1, 0x43);
        vm.jeq("_print_ta_int64");

        // 8 字节无符号: BigUint64Array (0x53) - 默认
        vm.load(VReg.A0, VReg.V0, 0);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Float64Array
        vm.label("_print_ta_float64");
        vm.load(VReg.A0, VReg.V0, 0);
        vm.call("_print_float_no_nl");
        vm.jmp("_print_ta_next");

        // Float32Array - 加载 4 字节，转换为 double 打印
        vm.label("_print_ta_float32");
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.loadByte(VReg.V2, VReg.V0, 1);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 2);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 3);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.A0, VReg.V1, VReg.V2);
        vm.call("_print_float32_no_nl");
        vm.jmp("_print_ta_next");

        // Int8Array - 有符号 1 字节
        vm.label("_print_ta_int8");
        vm.loadByte(VReg.A0, VReg.V0, 0);
        // 符号扩展: 如果 bit 7 = 1, 则扩展为负数
        vm.andImm(VReg.V1, VReg.A0, 0x80);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_print_ta_int8_pos");
        // 负数：扩展为 64 位
        vm.orImm(VReg.A0, VReg.A0, -256); // 0xFFFFFFFFFFFFFF00
        vm.label("_print_ta_int8_pos");
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Uint8Array - 无符号 1 字节
        vm.label("_print_ta_uint8");
        vm.loadByte(VReg.A0, VReg.V0, 0);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Int16Array - 有符号 2 字节
        vm.label("_print_ta_int16");
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.loadByte(VReg.V2, VReg.V0, 1);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.A0, VReg.V1, VReg.V2);
        // 符号扩展
        vm.andImm(VReg.V1, VReg.A0, 0x8000);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_print_ta_int16_pos");
        vm.orImm(VReg.A0, VReg.A0, -65536); // 0xFFFFFFFFFFFF0000
        vm.label("_print_ta_int16_pos");
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Uint16Array - 无符号 2 字节
        vm.label("_print_ta_uint16");
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.loadByte(VReg.V2, VReg.V0, 1);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.A0, VReg.V1, VReg.V2);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Int32Array - 有符号 4 字节
        vm.label("_print_ta_int32");
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.loadByte(VReg.V2, VReg.V0, 1);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 2);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 3);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.A0, VReg.V1, VReg.V2);
        // 符号扩展 32->64 位
        vm.shl(VReg.A0, VReg.A0, 32);
        vm.sar(VReg.A0, VReg.A0, 32);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // Uint32Array - 无符号 4 字节
        vm.label("_print_ta_uint32");
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.loadByte(VReg.V2, VReg.V0, 1);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 2);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V0, 3);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.A0, VReg.V1, VReg.V2);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // BigInt64Array - 8 字节有符号
        vm.label("_print_ta_int64");
        vm.load(VReg.A0, VReg.V0, 0);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_ta_next");

        // 下一个元素
        vm.label("_print_ta_next");
        vm.addImm(VReg.S3, VReg.S3, 1); // i++
        vm.add(VReg.S5, VReg.S5, VReg.S4); // offset += elemSize
        vm.jmp("_print_ta_loop");

        vm.label("_print_ta_done");
        // 打印 "]" 和换行
        vm.movImm(VReg.A0, 93); // ']'
        vm.call("_print_char");
        vm.call("_print_nl");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);
    }

    // 打印 TypedArray（无换行版本，简化为 "[TypedArray]"）
    generatePrintTypedArrayNoNL() {
        const vm = this.vm;

        vm.label("_print_typedarray_no_nl");
        vm.prologue(16, [VReg.S0]);

        // A0 可能是 boxed TypedArray，先 unbox
        vm.mov(VReg.S0, VReg.RET);

        // 打印类型名和基本信息
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_typeof");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_print_str_no_nl");

        // 打印 "(length) [...]"
        vm.load(VReg.V0, VReg.S0, 8); // length
        vm.movImm(VReg.A0, 40); // '('
        vm.call("_print_char");
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_print_int_no_nl");
        vm.lea(VReg.A0, "_str_typedarray_abbrev"); // ") [...]"
        vm.call("_print_str_no_nl");

        vm.epilogue([VReg.S0], 16);
    }

    // 打印 ArrayBuffer: "ArrayBuffer { byteLength: N }"
    generatePrintArrayBuffer() {
        const vm = this.vm;

        vm.label("_print_arraybuffer");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // buf

        // 打印 "ArrayBuffer { byteLength: "
        vm.lea(VReg.A0, "_str_ArrayBuffer");
        vm.call("_print_str_no_nl");
        vm.lea(VReg.A0, "_str_arraybuffer_open");
        vm.call("_print_str_no_nl");

        // 打印长度
        vm.load(VReg.A0, VReg.S0, 8);
        vm.call("_print_int_no_nl");

        // 打印 " }" 和换行
        vm.lea(VReg.A0, "_str_arraybuffer_close");
        vm.call("_print_str_no_nl");
        vm.call("_print_nl");

        vm.epilogue([VReg.S0], 16);
    }

    // 打印单个字符
    generatePrintChar() {
        const vm = this.vm;

        vm.label("_print_char");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // char code

        // 写入到临时缓冲区
        vm.lea(VReg.V0, "_print_buf");
        vm.storeByte(VReg.V0, 0, VReg.S0);

        // 调用 write(1, buf, 1)
        vm.movImm(VReg.A0, 1); // fd = stdout
        vm.lea(VReg.A1, "_print_buf");
        vm.movImm(VReg.A2, 1); // len = 1
        this.emitWriteCall();

        vm.epilogue([VReg.S0], 16);
    }

    generate() {
        this.generatePrintStringNoNL();
        this.generatePrintString();
        this.generatePrintStringSmart();
        this.generatePrintStringSmartNoNL();
        this.generatePrintNewline();
        this.generatePrintBool();
        this.generatePrintBoolNoNL();
        this.generatePrintBigIntNoNL();
        this.generatePrintBigInt();
        this.generatePrintSpace();
        this.generatePrintWrapper();
        this.generatePrintValue();
        this.generatePrintArray();
        this.generatePrintArrayNoNL();
        this.generatePrintArrayElemNoNL();
        this.generatePrintPromise();
        this.generatePrintPromiseNoNL();
        this.generatePrintValueNoNL();
        this.generatePrintTypedArray();
        this.generatePrintTypedArrayNoNL();
        this.generatePrintArrayBuffer();
        this.generatePrintChar();
    }
}
