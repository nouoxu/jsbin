// JSBin 运行时 - 加法运算符
// 提供 + 运算符的实现，支持字符串连接和数值加法

import { VReg } from "../../vm/registers.js";

export class AddGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // _js_add(a, b) -> NaN-boxed result
    // 加法运算，根据操作数类型动态选择字符串连接或数值加法
    //
    // 类型检测逻辑：
    // 1. 检查 a 和 b 的高16位
    // 2. 如果任一操作数是字符串 (0x7FFC 或数据段字符串)，执行字符串连接
    // 3. 否则，执行浮点数加法
    //
    // NaN-boxing 编码：
    // - 0x7FFC: string
    // - 其他 >= 0x7FF8: 其他 NaN-boxed 类型
    // - < 0x7FF8: 浮点数或指针
    generateJsAdd() {
        const vm = this.vm;
        const NANBOX_STRING_TAG = 0x7ffc;

        vm.label("_js_add");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // S0 = a
        vm.mov(VReg.S1, VReg.A1); // S1 = b

        // 提取 a 的高 16 位
        vm.shrImm(VReg.S2, VReg.S0, 48); // S2 = a 的 tag

        // 提取 b 的高 16 位
        vm.shrImm(VReg.S3, VReg.S1, 48); // S3 = b 的 tag

        // 检查 a 是否是 NaN-boxed 字符串 (0x7FFC)
        vm.movImm(VReg.V0, NANBOX_STRING_TAG);
        vm.cmp(VReg.S2, VReg.V0);
        vm.jeq("_js_add_strconcat");

        // 检查 b 是否是 NaN-boxed 字符串 (0x7FFC)
        vm.cmp(VReg.S3, VReg.V0);
        vm.jeq("_js_add_strconcat");

        // 检查 a 是否是数据段字符串（低地址指针，非 NaN-boxed）
        // 检查 a 的高16位是否 < 0x7FF8（可能是指针）
        vm.movImm(VReg.V0, 0x7ff8);
        vm.cmp(VReg.S2, VReg.V0);
        vm.jge("_js_add_check_b_raw"); // a 是 NaN-boxed，继续检查 b

        // a 是原始值（指针或浮点数）
        // 检查 a 是否是数据段地址（高32位是 0x00000001，即 0x1xxxxxxxx）
        vm.shrImm(VReg.V1, VReg.S0, 32);
        vm.cmpImm(VReg.V1, 1);
        vm.jeq("_js_add_strconcat"); // a 是 macOS 数据段字符串指针

        vm.label("_js_add_check_b_raw");
        // 检查 b 是否是数据段字符串
        vm.movImm(VReg.V0, 0x7ff8);
        vm.cmp(VReg.S3, VReg.V0);
        vm.jge("_js_add_float"); // b 是 NaN-boxed（但不是字符串），执行浮点加法

        // b 是原始值，检查是否是数据段字符串
        vm.shrImm(VReg.V1, VReg.S1, 32);
        vm.cmpImm(VReg.V1, 1);
        vm.jeq("_js_add_strconcat"); // b 是 macOS 数据段字符串指针

        // 都不是字符串，执行浮点加法
        vm.jmp("_js_add_float");

        // 字符串连接分支
        vm.label("_js_add_strconcat");
        // 需要将两个操作数都转换为字符串再连接
        // 先转换 a 为字符串，保存结果
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_valueToStr");
        vm.mov(VReg.S2, VReg.RET); // S2 = a 的字符串形式

        // 转换 b 为字符串
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_valueToStr");
        vm.mov(VReg.S3, VReg.RET); // S3 = b 的字符串形式

        // 调用 _strconcat 连接两个字符串
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S3);
        vm.call("_strconcat");
        // _strconcat 返回的是 NaN-boxed 字符串
        vm.jmp("_js_add_done");

        // 浮点加法分支
        vm.label("_js_add_float");
        // 重新解释为浮点数并相加
        vm.fmov(VReg.F0, VReg.S0); // F0 = a 作为 double
        vm.fmov(VReg.F1, VReg.S1); // F1 = b 作为 double
        vm.fadd(VReg.F0, VReg.F0, VReg.F1); // F0 = a + b
        vm.fmov(VReg.RET, VReg.F0); // 返回结果

        vm.label("_js_add_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    generate() {
        this.generateJsAdd();
    }
}
