// JSBin 运行时类型强制转换
// JavaScript 值转换函数
// NaN-boxing 方案

import { VReg } from "../../vm/index.js";
import { JS_NULL, JS_UNDEFINED, JS_FALSE, JS_TAG_BOOL_BASE, JS_TAG_INT32_BASE, JS_TAG_STRING_BASE } from "./jsvalue.js";
import { TYPE_NUMBER } from "./types.js";
import { TYPE_FLOAT64, TYPE_INT64 } from "./allocator.js";

export class CoercionGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        this.generateToBoolean();
        this.generateToNumber();
        this.generateToString();
    }

    /**
     * _to_boolean: 将任意 JavaScript 值转换为布尔值
     * 输入: A0 = JSValue
     * 输出: RET = 0 (falsy) 或 1 (truthy)
     *
     * NaN-boxing falsy 值:
     * - 0 (float64 +0.0 = 0x0000000000000000)
     * - -0 (float64 -0.0 = 0x8000000000000000)
     * - false (0x7FF9000000000000)
     * - null (0x7FFA000000000000)
     * - undefined (0x7FFB000000000000)
     * - NaN (0x7FF8000000000000 需要特殊处理)
     * - 空字符串 (0x7FFC000000000000 | ptr，长度为 0)
     *
     * 简化实现：检查常见 falsy 值
     */
    generateToBoolean() {
        const vm = this.vm;

        vm.label("_to_boolean");
        vm.prologue(0, [VReg.S0]); // 保存 S0 以便使用

        const falsyLabel = "_to_bool_falsy";

        // 把参数保存到 S0，因为后面会用到 V0-V7 (都是 X0-X7，会覆盖 A0)
        vm.mov(VReg.S0, VReg.A0);

        // 检查 +0.0 (float64 的 0)
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(falsyLabel);

        // 检查 -0.0 (0x8000000000000000)
        vm.movImm64(VReg.V0, "0x8000000000000000");
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 false (0x7FF9000000000000)
        vm.movImm64(VReg.V0, "0x7ff9000000000000"); // JS_FALSE
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 null (0x7FFA000000000000)
        vm.movImm64(VReg.V0, "0x7ffa000000000000"); // JS_NULL
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 undefined (0x7FFB000000000000)
        vm.movImm64(VReg.V0, "0x7ffb000000000000"); // JS_UNDEFINED
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 INT32 类型的 0 (0x7FF8000000000000)
        vm.movImm64(VReg.V0, "0x7ff8000000000000"); // JS_TAG_INT32_BASE
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查堆上的 Number/Float64 对象是否为 0 / -0
        // 堆范围: [_heap_base, _heap_ptr)
        vm.lea(VReg.V2, "_heap_base");
        vm.load(VReg.V2, VReg.V2, 0);
        vm.cmp(VReg.S0, VReg.V2);
        const notHeapLabel = "_to_bool_not_heap";
        vm.jlt(notHeapLabel);

        vm.lea(VReg.V3, "_heap_ptr");
        vm.load(VReg.V3, VReg.V3, 0);
        vm.cmp(VReg.S0, VReg.V3);
        vm.jge(notHeapLabel);

        // 读取对象 type
        vm.load(VReg.V4, VReg.S0, 0);
        vm.andImm(VReg.V4, VReg.V4, 0xff);
        vm.movImm(VReg.V5, TYPE_NUMBER);
        vm.cmp(VReg.V4, VReg.V5);
        const notNumberLabel = "_to_bool_not_number";
        vm.jeq("_to_bool_check_number_value");
        vm.movImm(VReg.V5, TYPE_FLOAT64);
        vm.cmp(VReg.V4, VReg.V5);
        vm.jne(notNumberLabel);

        vm.label("_to_bool_check_number_value");
        vm.load(VReg.V5, VReg.S0, 8); // value
        vm.cmpImm(VReg.V5, 0);
        vm.jeq(falsyLabel);
        vm.movImm64(VReg.V6, "0x8000000000000000");
        vm.cmp(VReg.V5, VReg.V6);
        vm.jeq(falsyLabel);
        // 非零数字为 truthy
        vm.jmp("_to_bool_truthy");

        vm.label(notNumberLabel);
        // 其他堆对象 => truthy
        vm.jmp("_to_bool_truthy");

        vm.label(notHeapLabel);

        // 检查空字符串：高 16 位是 0x7FFC
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.movImm(VReg.V1, 0x7ffc);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne("_to_bool_truthy"); // 不是字符串，是 truthy

        // 是字符串，检查是否为空
        // 提取低 48 位作为字符串指针并符号扩展
        vm.movImm64(VReg.V0, "0x0000ffffffffffff");
        vm.and(VReg.V0, VReg.S0, VReg.V0);
        vm.shlImm(VReg.V0, VReg.V0, 16);
        vm.sarImm(VReg.V0, VReg.V0, 16);
        // 加载第一个字节
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq(falsyLabel); // 空字符串是 falsy
        // 非空字符串，继续到 truthy

        vm.label("_to_bool_truthy");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0], 0);

        vm.label(falsyLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0], 0);
    }

    /**
     * _to_number: 将任意 JavaScript 值转换为数字
     * 输入: A0 = JSValue
     * 输出: RET = Number (NaN-boxed float64 或 Int32)
     *
     * 转换规则:
     * - Number -> 返回原值
     * - String -> 解析为数字 (简化: 返回 NaN)
     * - Boolean -> true=1, false=0
     * - null -> 0
     * - undefined -> NaN
     * - Object -> NaN (简化)
     */
    generateToNumber() {
        const vm = this.vm;

        vm.label("_to_number");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 检查是否已经是数字 (纯 float64 或 Int32 tagged)
        // 纯 float64: 高位不是 0x7FF8-0x7FFF
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.movImm(VReg.V1, 0x7ff8);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jlt("_to_number_check_heap"); // 小于 0x7FF8，可能是 float64 或堆对象

        // 检查 Int32 (0x7FF8)
        vm.movImm(VReg.V1, 0x7ff8);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_to_number_is_int32");

        // 检查 boolean true (0x7FF9 | 1)
        vm.movImm(VReg.V1, 0x7ff9);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_to_number_from_bool");

        // 检查 null (0x7FFA) -> 0
        vm.movImm(VReg.V1, 0x7ffa);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_to_number_zero");

        // 检查 undefined (0x7FFB) -> NaN
        vm.movImm(VReg.V1, 0x7ffb);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_to_number_nan");

        // 检查 string (0x7FFC) -> 暂时返回 NaN
        vm.movImm(VReg.V1, 0x7ffc);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_to_number_nan");

        // 其他情况 (对象等) -> NaN
        vm.jmp("_to_number_nan");

        // 高位 < 0x7FF8，可能是纯 float64 或 Number 对象指针
        vm.label("_to_number_check_heap");
        // 检查高 16 位是否很小（指示堆指针）
        // 堆指针：高 16 位通常是 0x0000 到 0x000F 之间（用户空间地址）
        // 纯 float64：高 16 位对于大多数正常数来说 >= 0x3FF0 (1.0) 或更大
        // 使用阈值 0x0010 来区分
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.movImm(VReg.V1, 0x0010);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jlt("_to_number_likely_heap"); // 高 16 位 < 0x10，可能是堆指针

        // 高 16 位 >= 0x10，当作纯 float64
        vm.jmp("_to_number_is_float");

        // 可能是堆指针，检查类型字段
        vm.label("_to_number_likely_heap");
        // 检查是否为 null (0)
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_to_number_zero");

        // 检查是否为小整数（可能是 raw int64 BigInt）
        // 注意：这个检查有问题，会错误地将小浮点数当作 BigInt
        // 暂时移除，改用更保守的方法
        // vm.cmpImm(VReg.S0, 0x1000);
        // vm.jlt("_to_number_small_int");

        // 非 null，检查类型字段
        vm.load(VReg.V0, VReg.S0, 0); // 加载类型字段

        // 检查是否是 BigInt (TYPE_INT64 = 23)
        vm.movImm(VReg.V1, TYPE_INT64);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_to_number_from_bigint");
        
        vm.movImm(VReg.V1, 0x1d); // TYPE_FLOAT64 = 29
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_to_number_from_number_obj");
        // 类型不匹配，可能是其他对象，返回 NaN
        vm.jmp("_to_number_nan");

        // 从 BigInt (TYPE_INT64) 转换为 Number
        vm.label("_to_number_from_bigint");
        // 加载 int64 值（偏移 8）
        vm.load(VReg.V0, VReg.S0, 8);
        // 转换为 float64
        vm.scvtf(0, VReg.V0); // D0 = (double)value
        vm.fmovToInt(VReg.RET, 0); // RET = float64 位模式
        vm.epilogue([VReg.S0], 0);

        // 从 Number 对象读取 float64 值
        vm.label("_to_number_from_number_obj");
        vm.load(VReg.RET, VReg.S0, 8); // 读取偏移 8 的 float64 值
        vm.epilogue([VReg.S0], 0);

        // 已经是 float64
        vm.label("_to_number_is_float");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0], 0);

        // Int32 -> 转换为 float64
        vm.label("_to_number_is_int32");
        // 提取低 32 位并符号扩展
        vm.shlImm(VReg.V0, VReg.S0, 32);
        vm.sarImm(VReg.V0, VReg.V0, 32);
        // 转换为 float64 位模式
        vm.scvtf(0, VReg.V0); // D0 = (double)V0
        vm.fmovToInt(VReg.RET, 0); // RET = float64 位模式
        vm.epilogue([VReg.S0], 0);

        // boolean -> 0 或 1
        vm.label("_to_number_from_bool");
        vm.andImm(VReg.V0, VReg.S0, 1); // 提取最低位
        vm.scvtf(0, VReg.V0); // D0 = (double)V0
        vm.fmovToInt(VReg.RET, 0); // RET = float64 位模式
        vm.epilogue([VReg.S0], 0);

        // 返回 0
        vm.label("_to_number_zero");
        vm.movImm(VReg.RET, 0); // float64 的 +0.0
        vm.epilogue([VReg.S0], 0);

        // 返回 NaN
        vm.label("_to_number_nan");
        vm.movImm64(VReg.RET, "0x7ff8000000000000"); // canonical NaN
        vm.epilogue([VReg.S0], 0);
    }

    /**
     * _to_string: 将任意 JavaScript 值转换为字符串
     * 输入: A0 = JSValue
     * 输出: RET = String pointer (NaN-boxed)
     *
     * 简化实现: 如果是字符串返回原值，否则返回 "[value]"
     */
    generateToString() {
        const vm = this.vm;

        vm.label("_to_string");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 检查是否已经是字符串 (高 16 位是 0x7FFC)
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.movImm(VReg.V1, 0x7ffc);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_to_string_is_string");

        // 不是字符串，返回 "[value]" 占位符
        vm.lea(VReg.A0, "_to_string_placeholder");
        vm.call("_createStrFromCStr");
        vm.mov(VReg.A0, VReg.RET);
        vm.epilogue([VReg.S0], 0);

        vm.label("_to_string_is_string");
        // 已经是字符串，直接返回
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0], 0);
    }

    /**
     * 生成数据段
     */
    generateDataSection(asm) {
        // "[value]" placeholder string
        asm.addDataLabel("_to_string_placeholder");
        asm.addDataByte(91); // '['
        asm.addDataByte(118); // 'v'
        asm.addDataByte(97); // 'a'
        asm.addDataByte(108); // 'l'
        asm.addDataByte(117); // 'u'
        asm.addDataByte(101); // 'e'
        asm.addDataByte(93); // ']'
        asm.addDataByte(0); // null
    }
}
