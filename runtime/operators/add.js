// JSBin 运行时 - 加法运算符
// 提供 + 运算符的实现，支持字符串连接和数值加法

import { VReg } from "../../vm/registers.js";
import { TYPE_STRING } from "../core/allocator.js";

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

        // 检查 a 是否是原始值（指针或浮点数）
        vm.movImm(VReg.V0, 0x7ff8);
        vm.cmp(VReg.S2, VReg.V0);
        vm.jge("_js_add_check_b_raw"); // a 是 NaN-boxed，继续检查 b

        // a 是原始值：先检查是否在堆内（堆字符串）
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_js_add_check_a_data");
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_js_add_check_a_data");

        // 在堆内，检查类型是否为字符串
        vm.load(VReg.V2, VReg.S0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        vm.cmpImm(VReg.V2, TYPE_STRING);
        vm.jeq("_js_add_strconcat");
        vm.jmp("_js_add_check_b_raw");

        vm.label("_js_add_check_a_data");
        // 检查是否在数据段范围内（静态字符串）
        vm.lea(VReg.V0, "_data_start");
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_js_add_check_b_raw");
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_js_add_check_b_raw");
        vm.jmp("_js_add_strconcat");

        vm.label("_js_add_check_b_raw");
        // 检查 b 是否为原始值（指针或浮点数）
        vm.movImm(VReg.V0, 0x7ff8);
        vm.cmp(VReg.S3, VReg.V0);
        vm.jge("_js_add_float"); // b 是 NaN-boxed（但不是字符串），执行浮点加法

        // b 是原始值：先检查是否在堆内（堆字符串）
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S1, VReg.V0);
        vm.jlt("_js_add_check_b_data");
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S1, VReg.V1);
        vm.jge("_js_add_check_b_data");

        // 在堆内，检查类型是否为字符串
        vm.load(VReg.V2, VReg.S1, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        vm.cmpImm(VReg.V2, TYPE_STRING);
        vm.jeq("_js_add_strconcat");
        vm.jmp("_js_add_float");

        vm.label("_js_add_check_b_data");
        // 检查是否在数据段范围内（静态字符串）
        vm.lea(VReg.V0, "_data_start");
        vm.cmp(VReg.S1, VReg.V0);
        vm.jlt("_js_add_float");
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S1, VReg.V1);
        vm.jge("_js_add_float");
        vm.jmp("_js_add_strconcat");

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
        // 将操作数转换为 float64 位模式（支持 Number 对象等）
        // 注意: _to_number 不保证保留 S1，因此先保存 b
        vm.mov(VReg.S2, VReg.S1);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_to_number");
        vm.mov(VReg.S0, VReg.RET);
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_to_number");
        vm.mov(VReg.S1, VReg.RET);
        // 重新解释为浮点数并相加
        vm.fmovToFloat(0, VReg.S0); // FP0 = a (float64 bits)
        vm.fmovToFloat(1, VReg.S1); // FP1 = b (float64 bits)
        vm.fadd(0, 0, 1); // FP0 = a + b
        vm.fmovToInt(VReg.RET, 0); // 返回 float64 位模式

        vm.label("_js_add_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    generate() {
        this.generateJsAdd();
    }
}
