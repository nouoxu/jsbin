// JSBin 运行时 - parseInt / parseFloat / isNaN / isFinite
// 字符串转数字的全局函数

import { VReg } from "../../../vm/registers.js";
import { TYPE_FLOAT64 } from "../../core/allocator.js";

// NaN-boxing 常量 (使用字符串避免 BigInt 问题)
const JS_TAG_BOOL_TRUE = "0x7ff9000000000001";
const JS_TAG_BOOL_FALSE = "0x7ff9000000000000";
const JS_NAN = "0x7ff8000000000000";

export class NumberParseGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateParseInt();
        this.generateParseFloat();
        this.generateIsNaN();
        this.generateIsFinite();
    }

    // _parseInt(str, radix) -> Number 对象
    // A0 = 字符串 (NaN-boxed)
    // A1 = 基数 (整数，默认 10)
    generateParseInt() {
        const vm = this.vm;

        vm.label("_parseInt");
        // Stack alignment: 5 regs (40 bytes) + 72 bytes locals = 112 bytes (16-byte aligned)
        vm.prologue(72, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // S0 = 字符串指针 (解包后)
        // S1 = 基数
        // S2 = 结果
        // S3 = 符号 (0=正, 1=负)
        // S4 = 当前字符指针

        vm.mov(VReg.S1, VReg.A1); // 基数

        // Check/Default Radix
        vm.cmpImm(VReg.S1, 37);
        vm.jge("_parseInt_radix_default");
        vm.cmpImm(VReg.S1, 2);
        vm.jlt("_parseInt_radix_default");
        vm.jmp("_parseInt_radix_ok");

        vm.label("_parseInt_radix_default");
        vm.movImm(VReg.S1, 10);

        vm.label("_parseInt_radix_ok");

        // 获取字符串指针：支持 raw 指针（数据段/堆 C-string）以及 NaN-boxed string (tag=0x7FFC)
        // 注意：不能用 0x0000ffffffffffff 这种 48-bit immediate 做 mask（x64 movImm 可能截断到 32-bit）
        // 参考 runtime/operators/equality.js 的解包方式：shl+shr 清掉高 16 位 tag
        vm.mov(VReg.S0, VReg.A0);
        vm.shrImm(VReg.V0, VReg.S0, 48); // tag/high16
        vm.movImm(VReg.V1, 0x7ff8);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jlt("_parseInt_strptr_ready_raw"); // 不是 NaN-boxed，视为 raw 指针

        // NaN-boxed：只接受 string tag (0x7FFC)
        vm.movImm(VReg.V1, 0x7ffc);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne("_parseInt_nan");

        // 提取低 48 位指针
        // 注意：S0 已经在上面保存过 A0 了，不能再用 A0（因为 V0=X0=A0 被覆盖了）
        vm.shlImm(VReg.S0, VReg.S0, 16);
        vm.shrImm(VReg.S0, VReg.S0, 16);
        vm.jmp("_parseInt_strptr_ready");

        vm.label("_parseInt_strptr_ready_raw");
        // S0 已经在上面保存过 A0 了，直接使用

        vm.label("_parseInt_strptr_ready");

        // 检查是否为空指针
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_parseInt_nan");

        // 使用 _getStrContent 获取字符串内容指针（处理堆/数据段字符串）
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_getStrContent");
        vm.mov(VReg.S4, VReg.RET);

        // 跳过空白字符
        vm.label("_parseInt_skip_space");
        vm.loadByte(VReg.V0, VReg.S4, 0);
        vm.cmpImm(VReg.V0, 32); // 空格
        vm.jeq("_parseInt_skip_space_next");
        vm.cmpImm(VReg.V0, 9); // tab
        vm.jeq("_parseInt_skip_space_next");
        vm.cmpImm(VReg.V0, 10); // 换行
        vm.jeq("_parseInt_skip_space_next");
        vm.jmp("_parseInt_check_sign");

        vm.label("_parseInt_skip_space_next");
        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp("_parseInt_skip_space");

        // 检查符号
        vm.label("_parseInt_check_sign");
        vm.movImm(VReg.S3, 0); // 默认正数
        vm.loadByte(VReg.V0, VReg.S4, 0);
        vm.cmpImm(VReg.V0, 45); // '-'
        vm.jne("_parseInt_check_plus");
        vm.movImm(VReg.S3, 1); // 负数
        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp("_parseInt_parse");

        vm.label("_parseInt_check_plus");
        vm.cmpImm(VReg.V0, 43); // '+'
        vm.jne("_parseInt_parse");
        vm.addImm(VReg.S4, VReg.S4, 1);

        // 解析数字
        vm.label("_parseInt_parse");
        vm.movImm(VReg.S2, 0); // 结果 = 0

        vm.label("_parseInt_loop");
        vm.loadByte(VReg.V0, VReg.S4, 0);

        // 检查是否是数字 0-9
        vm.cmpImm(VReg.V0, 48); // '0'
        vm.jlt("_parseInt_check_alpha");
        vm.cmpImm(VReg.V0, 57); // '9'
        vm.jgt("_parseInt_check_alpha");
        vm.subImm(VReg.V0, VReg.V0, 48);
        vm.jmp("_parseInt_add_digit");

        // 检查是否是字母 a-z/A-Z (用于基数 > 10)
        vm.label("_parseInt_check_alpha");
        vm.cmpImm(VReg.V0, 65); // 'A'
        vm.jlt("_parseInt_done_loop");
        vm.cmpImm(VReg.V0, 90); // 'Z'
        vm.jle("_parseInt_upper");
        vm.cmpImm(VReg.V0, 97); // 'a'
        vm.jlt("_parseInt_done_loop");
        vm.cmpImm(VReg.V0, 122); // 'z'
        vm.jgt("_parseInt_done_loop");
        vm.subImm(VReg.V0, VReg.V0, 87); // 'a' - 10
        vm.jmp("_parseInt_check_radix");

        vm.label("_parseInt_upper");
        vm.subImm(VReg.V0, VReg.V0, 55); // 'A' - 10

        // 检查数字是否在基数范围内
        vm.label("_parseInt_check_radix");
        vm.cmp(VReg.V0, VReg.S1);
        vm.jge("_parseInt_done_loop");

        vm.label("_parseInt_add_digit");
        // result = result * radix + digit
        vm.mul(VReg.S2, VReg.S2, VReg.S1);
        vm.add(VReg.S2, VReg.S2, VReg.V0);
        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp("_parseInt_loop");

        vm.label("_parseInt_done_loop");
        // 应用符号
        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_parseInt_box");
        vm.movImm(VReg.V0, 0);
        vm.sub(VReg.S2, VReg.V0, VReg.S2);

        // 装箱为 Number 对象
        vm.label("_parseInt_box");
        // 转换为 float64
        vm.scvtf(0, VReg.S2);

        // 直接返回 primitive double (NaN-boxing)
        // 只要不是 NaN (0x7FF8...)，就是合法 double
        vm.fmovToInt(VReg.RET, 0);

        /*
        // 原先的堆分配代码（疑似错误地返回了 Number 对象而非 primitive）
        /*
        // 分配 Number 对象 (16 字节)
        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");
        vm.movImm(VReg.V0, TYPE_FLOAT64); // TYPE_FLOAT64
        vm.store(VReg.RET, 0, VReg.V0);
        vm.store(VReg.RET, 8, VReg.S2);

        // NaN-boxing
        vm.mov(VReg.V0, VReg.RET);
        vm.movImm(VReg.V1, 0x7ffd);
        vm.shlImm(VReg.V1, VReg.V1, 48);
        vm.or(VReg.RET, VReg.V0, VReg.V1);
        */

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 72);

        // 返回 NaN
        vm.label("_parseInt_nan");
        vm.movImm64(VReg.RET, "0x7ff8000000000000");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 72);
    }

    // _parseFloat(str) -> Number 对象
    // A0 = 字符串 (NaN-boxed)
    generateParseFloat() {
        const vm = this.vm;

        vm.label("_parseFloat");
        // Stack alignment: 5 regs (40 bytes) + 88 bytes locals = 128 bytes (16-byte aligned)
        vm.prologue(88, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // S0 = 字符串指针
        // S1 = 整数部分
        // S2 = 小数部分 (作为整数)
        // S3 = 小数位数
        // S4 = 符号

        // 解包字符串
        vm.mov(VReg.V0, VReg.A0);
        vm.movImm(VReg.V1, 0x0000ffffffffffff);
        vm.and(VReg.S0, VReg.V0, VReg.V1);

        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_parseFloat_nan");

        // 跳过字符串头部
        vm.addImm(VReg.S0, VReg.S0, 16);

        // 跳过空白
        vm.label("_parseFloat_skip_space");
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 32);
        vm.jeq("_parseFloat_skip_next");
        vm.cmpImm(VReg.V0, 9);
        vm.jeq("_parseFloat_skip_next");
        vm.jmp("_parseFloat_check_sign");

        vm.label("_parseFloat_skip_next");
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_parseFloat_skip_space");

        // 检查符号
        vm.label("_parseFloat_check_sign");
        vm.movImm(VReg.S4, 0);
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 45);
        vm.jne("_parseFloat_check_plus");
        vm.movImm(VReg.S4, 1);
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_parseFloat_int_part");

        vm.label("_parseFloat_check_plus");
        vm.cmpImm(VReg.V0, 43);
        vm.jne("_parseFloat_int_part");
        vm.addImm(VReg.S0, VReg.S0, 1);

        // 解析整数部分
        vm.label("_parseFloat_int_part");
        vm.movImm(VReg.S1, 0);

        vm.label("_parseFloat_int_loop");
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 48);
        vm.jlt("_parseFloat_check_dot");
        vm.cmpImm(VReg.V0, 57);
        vm.jgt("_parseFloat_check_dot");
        vm.subImm(VReg.V0, VReg.V0, 48);
        vm.movImm(VReg.V1, 10);
        vm.mul(VReg.S1, VReg.S1, VReg.V1);
        vm.add(VReg.S1, VReg.S1, VReg.V0);
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_parseFloat_int_loop");

        // 检查小数点
        vm.label("_parseFloat_check_dot");
        vm.movImm(VReg.S2, 0);
        vm.movImm(VReg.S3, 0);
        vm.cmpImm(VReg.V0, 46); // '.'
        vm.jne("_parseFloat_combine");
        vm.addImm(VReg.S0, VReg.S0, 1);

        // 解析小数部分
        vm.label("_parseFloat_frac_loop");
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 48);
        vm.jlt("_parseFloat_combine");
        vm.cmpImm(VReg.V0, 57);
        vm.jgt("_parseFloat_combine");
        vm.subImm(VReg.V0, VReg.V0, 48);
        vm.movImm(VReg.V1, 10);
        vm.mul(VReg.S2, VReg.S2, VReg.V1);
        vm.add(VReg.S2, VReg.S2, VReg.V0);
        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_parseFloat_frac_loop");

        // 组合整数和小数部分
        vm.label("_parseFloat_combine");
        // 整数部分转 float
        vm.scvtf(0, VReg.S1);

        // 小数部分转 float 并除以 10^digits
        vm.scvtf(1, VReg.S2);

        // 计算 10^digits
        vm.movImm(VReg.V0, 1);
        vm.label("_parseFloat_pow_loop");
        vm.cmpImm(VReg.S3, 0);
        vm.jle("_parseFloat_pow_done");
        vm.movImm(VReg.V1, 10);
        vm.mul(VReg.V0, VReg.V0, VReg.V1);
        vm.subImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_parseFloat_pow_loop");

        vm.label("_parseFloat_pow_done");
        vm.scvtf(2, VReg.V0);
        vm.fdiv(1, 1, 2);
        vm.fadd(0, 0, 1);

        // 应用符号 (如果 S4 != 0，则取反)
        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_parseFloat_box");
        // 取反: 通过 XOR 符号位实现
        vm.fmovToInt(VReg.V0, 0);
        vm.movImm64(VReg.V1, "0x8000000000000000");
        vm.xor(VReg.V0, VReg.V0, VReg.V1);
        vm.fmovToFloat(0, VReg.V0);

        // 装箱
        vm.label("_parseFloat_box");
        vm.fmovToInt(VReg.S1, 0);
        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");
        vm.movImm(VReg.V0, 13);
        vm.store(VReg.RET, 0, VReg.V0);
        vm.store(VReg.RET, 8, VReg.S1);

        vm.mov(VReg.V0, VReg.RET);
        vm.movImm(VReg.V1, 0x7ffd);
        vm.shlImm(VReg.V1, VReg.V1, 48);
        vm.or(VReg.RET, VReg.V0, VReg.V1);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 80);

        vm.label("_parseFloat_nan");
        vm.movImm64(VReg.RET, "0x7ff8000000000000");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 80);
    }

    // _isNaN(value) -> boolean (NaN-boxed)
    // A0 = 值 (NaN-boxed)
    generateIsNaN() {
        const vm = this.vm;

        vm.label("_isNaN");
        vm.prologue(0, []);

        // 检查是否是 Number 对象 (tag = 0x7ffd)
        vm.mov(VReg.V0, VReg.A0);
        vm.shrImm(VReg.V1, VReg.V0, 48);
        vm.movImm(VReg.V2, 0x7ffd);
        vm.cmp(VReg.V1, VReg.V2);
        vm.jne("_isNaN_false");

        // 解包获取指针
        vm.movImm(VReg.V1, 0x0000ffffffffffff);
        vm.and(VReg.V0, VReg.V0, VReg.V1);

        // 读取 float64 值
        vm.load(VReg.V0, VReg.V0, 8);

        // 检查是否是 NaN: (v != v) 对于 NaN 为 true
        vm.fmovToFloat(0, VReg.V0);
        vm.fcmp(0, 0);
        // 如果是 NaN，比较结果是 unordered
        vm.jne("_isNaN_true"); // fcmp 对于 NaN 会设置 NE

        vm.label("_isNaN_false");
        vm.movImm64(VReg.RET, "0x7ff9000000000000");
        vm.epilogue([], 0);

        vm.label("_isNaN_true");
        vm.movImm64(VReg.RET, "0x7ff9000000000001");
        vm.epilogue([], 0);
    }

    // _isFinite(value) -> boolean (NaN-boxed)
    // A0 = 值 (NaN-boxed)
    generateIsFinite() {
        const vm = this.vm;

        vm.label("_isFinite");
        vm.prologue(0, []);

        // 检查是否是 Number 对象
        vm.mov(VReg.V0, VReg.A0);
        vm.shrImm(VReg.V1, VReg.V0, 48);
        vm.movImm(VReg.V2, 0x7ffd);
        vm.cmp(VReg.V1, VReg.V2);
        vm.jne("_isFinite_false");

        // 解包获取指针
        vm.movImm(VReg.V1, 0x0000ffffffffffff);
        vm.and(VReg.V0, VReg.V0, VReg.V1);

        // 读取 float64 值
        vm.load(VReg.V0, VReg.V0, 8);

        // 检查 exponent 是否全为 1 (Infinity 或 NaN)
        // IEEE 754: exponent bits 52-62
        vm.shrImm(VReg.V1, VReg.V0, 52);
        vm.andImm(VReg.V1, VReg.V1, 0x7ff);
        vm.movImm(VReg.V2, 0x7ff);
        vm.cmp(VReg.V1, VReg.V2);
        vm.jeq("_isFinite_false");

        vm.movImm64(VReg.RET, "0x7ff9000000000001");
        vm.epilogue([], 0);

        vm.label("_isFinite_false");
        vm.movImm64(VReg.RET, "0x7ff9000000000000");
        vm.epilogue([], 0);
    }
}
