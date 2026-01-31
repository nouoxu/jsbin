// JSBin 运行时 - 相等性比较运算符
// 提供 === 和 !== 的实现

import { VReg } from "../../vm/registers.js";
import { TYPE_STRING, TYPE_FLOAT64 } from "../core/allocator.js";
import { TYPE_NUMBER } from "../core/types.js";

export class EqualityGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // _js_strict_eq(a, b) -> NaN-boxed boolean
    // 严格相等比较，处理各种类型
    //
    // 值编码方式：
    // 1. NaN-boxed (高16位 >= 0x7FF8):
    //    - 0x7FF8: int32
    //    - 0x7FF9: boolean
    //    - 0x7FFA: null
    //    - 0x7FFB: undefined
    //    - 0x7FFC: string (NaN-boxed 指针)
    //    - 0x7FFD: object
    //    - 0x7FFE: array
    //    - 0x7FFF: function
    // 2. 堆指针 (高16位 = 0)
    // 3. 数据段指针 (高16位 = 0，但指向较低地址)
    generateStrictEquals() {
        const vm = this.vm;

        vm.label("_js_strict_eq");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // a
        vm.mov(VReg.S1, VReg.A1); // b

        const trueLabel = "_strict_eq_true";
        const falseLabel = "_strict_eq_false";
        const checkNanBoxedStringLabel = "_strict_eq_check_nanbox_string";
        const checkRawPointerLabel = "_strict_eq_check_raw_ptr";
        const checkHeapObjectLabel = "_strict_eq_check_heap_obj";
        const doneLabel = "_strict_eq_done";

        // 首先检查是否完全相同（同一引用或相同值）
        vm.cmp(VReg.S0, VReg.S1);
        vm.jeq(trueLabel);

        // 提取两个值的高 16 位
        vm.shrImm(VReg.S2, VReg.S0, 48); // a 的 tag
        vm.shrImm(VReg.S3, VReg.S1, 48); // b 的 tag

        // 检查 a 是否是 NaN-boxed 值 (高16位 >= 0x7FF8)
        vm.movImm(VReg.V0, 0x7ff8);
        vm.cmp(VReg.S2, VReg.V0);
        vm.jlt(checkRawPointerLabel); // a 不是 NaN-boxed，是原始指针

        // a 是 NaN-boxed
        // 检查 b 是否也是 NaN-boxed
        vm.cmp(VReg.S3, VReg.V0);
        vm.jlt(falseLabel); // b 不是 NaN-boxed，类型不同

        // 两个都是 NaN-boxed，检查 tag 是否相同
        vm.cmp(VReg.S2, VReg.S3);
        vm.jne(falseLabel); // tag 不同

        // Tag 相同，检查具体类型
        // Tag 4 (0x7FFC) = NaN-boxed string
        vm.movImm(VReg.V0, 0x7ffc);
        vm.cmp(VReg.S2, VReg.V0);
        vm.jeq(checkNanBoxedStringLabel);

        // 其他 NaN-boxed 类型（int32, boolean, null, undefined, object, array, function）
        // 值不同（已经比较过），返回 false
        vm.jmp(falseLabel);

        // ========== NaN-boxed 字符串比较 ==========
        vm.label(checkNanBoxedStringLabel);
        // 提取字符串指针 (低 48 位)
        vm.mov(VReg.A0, VReg.S0);
        vm.shlImm(VReg.A0, VReg.A0, 16);
        vm.shrImm(VReg.A0, VReg.A0, 16);

        vm.mov(VReg.A1, VReg.S1);
        vm.shlImm(VReg.A1, VReg.A1, 16);
        vm.shrImm(VReg.A1, VReg.A1, 16);

        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq(trueLabel);
        vm.jmp(falseLabel);

        // ========== 检查原始指针（数据段字符串或堆对象）==========
        vm.label(checkRawPointerLabel);
        // a 不是 NaN-boxed (高 16 位 < 0x7FF8)
        // 检查 b 是否也不是 NaN-boxed
        vm.movImm(VReg.V0, 0x7ff8);
        vm.cmp(VReg.S3, VReg.V0);
        vm.jge(falseLabel); // b 是 NaN-boxed，类型不同

        // 两个都是原始指针
        // 区分数据段字符串和堆对象：
        // - 堆对象第一个字节是类型 ID (1-255)
        // - 数据段字符串第一个字节是 ASCII 字符 (32-126 或 0)

        // 检查是否在堆范围内
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jge(checkHeapObjectLabel); // a >= heap_base，是堆对象

        // a 是数据段指针（字符串）
        // 检查 b 是否也是数据段指针
        vm.cmp(VReg.S1, VReg.V0);
        vm.jge(falseLabel); // b 是堆对象，类型不同

        // 两个都是数据段字符串，使用 strcmp 比较
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq(trueLabel);
        vm.jmp(falseLabel);

        // ========== 检查堆对象 ==========
        vm.label(checkHeapObjectLabel);
        // a 是堆对象，检查 b 是否也是堆对象
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S1, VReg.V0);
        vm.jlt(falseLabel); // b 不是堆对象，类型不同

        // 两个都是堆对象，加载类型
        vm.load(VReg.V0, VReg.S0, 0); // a.type
        vm.load(VReg.V1, VReg.S1, 0); // b.type
        vm.andImm(VReg.V0, VReg.V0, 0xff);
        vm.andImm(VReg.V1, VReg.V1, 0xff);

        // 类型必须相同
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne(falseLabel);

        // 检查是否是 Number (TYPE_NUMBER=13) 或 Float64 (TYPE_FLOAT64=29)
        vm.cmpImm(VReg.V0, TYPE_NUMBER);
        vm.jeq("_strict_eq_cmp_number_value");
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jeq("_strict_eq_cmp_number_value");

        // 检查是否是字符串 (TYPE_STRING=6)
        vm.cmpImm(VReg.V0, TYPE_STRING);
        vm.jeq("_strict_eq_cmp_heap_string");

        // 其他类型，比较引用（已经比较过，不相等）
        vm.jmp(falseLabel);

        // 比较 Number 对象的值
        vm.label("_strict_eq_cmp_number_value");
        vm.load(VReg.V0, VReg.S0, 8); // a.value
        vm.load(VReg.V1, VReg.S1, 8); // b.value
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq(trueLabel);
        vm.jmp(falseLabel);

        // 比较堆字符串
        vm.label("_strict_eq_cmp_heap_string");
        // 堆字符串: [type:8][length:8][content...]
        // 使用 strcmp 比较内容
        vm.addImm(VReg.A0, VReg.S0, 16); // a 的内容起始
        vm.addImm(VReg.A1, VReg.S1, 16); // b 的内容起始
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq(trueLabel);
        vm.jmp(falseLabel);

        // ========== 返回结果 ==========
        vm.label(trueLabel);
        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.jmp(doneLabel);

        vm.label(falseLabel);
        vm.lea(VReg.RET, "_js_false");
        vm.load(VReg.RET, VReg.RET, 0);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _js_strict_ne(a, b) -> NaN-boxed boolean
    // 严格不等于，直接调用 strict_eq 然后取反
    generateStrictNotEquals() {
        const vm = this.vm;

        vm.label("_js_strict_ne");
        vm.prologue(16, [VReg.S0]);

        vm.call("_js_strict_eq");
        // 结果在 RET，是 NaN-boxed boolean
        // 取反：如果是 true (0x7FF9000000000001)，变成 false (0x7FF9000000000000)
        // 如果是 false，变成 true
        // 简单方法：xor 最低位
        vm.movImm(VReg.S0, 1);
        vm.xor(VReg.RET, VReg.RET, VReg.S0);

        vm.epilogue([VReg.S0], 16);
    }

    // 生成所有相等性比较函数
    generate() {
        this.generateStrictEquals();
        this.generateStrictNotEquals();
    }
}
