// JSBin Math 运行时
// 实现 Math 对象的运行时函数

import { VReg } from "../../vm/registers.js";

// Math 运行时生成器
export class MathGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // 生成所有 Math 函数
    generate() {
        this.generateFloor();
        this.generateCeil();
        this.generateRound();
        this.generateAbs();
        this.generatePow();
    }

    // Math.floor(x) - 返回小于或等于 x 的最大整数
    generateFloor() {
        const vm = this.vm;

        vm.label("_math_floor");
        // A0 = x (IEEE 754 位模式在 X0 中)
        // 需要先转换成浮点值
        vm.fmovToFloat(VReg.V0, VReg.A0);  // V0 = (double)A0
        vm.ffloor(VReg.V0, VReg.V0);  // V0 = floor(V0)
        vm.fmovToInt(VReg.RET, VReg.V0);  // RET = V0 (as integer bits)
        vm.ret();
    }

    // Math.ceil(x) - 返回大于或等于 x 的最小整数
    generateCeil() {
        const vm = this.vm;

        vm.label("_math_ceil");
        // A0 = x (IEEE 754 位模式在 X0 中)
        vm.fmovToFloat(VReg.V0, VReg.A0);  // V0 = (double)A0
        vm.fceil(VReg.V0, VReg.V0);  // V0 = ceil(V0)
        vm.fmovToInt(VReg.RET, VReg.V0);  // RET = V0 (as integer bits)
        vm.ret();
    }

    // Math.round(x) - 返回四舍五入后的整数
    generateRound() {
        const vm = this.vm;

        vm.label("_math_round");
        // A0 = x (IEEE 754 位模式在 X0 中)
        vm.fmovToFloat(VReg.V0, VReg.A0);  // V0 = (double)A0
        vm.fround(VReg.V0, VReg.V0);  // V0 = round(V0)
        vm.fmovToInt(VReg.RET, VReg.V0);  // RET = V0 (as integer bits)
        vm.ret();
    }

    // Math.abs(x) - 返回绝对值
    generateAbs() {
        const vm = this.vm;

        vm.label("_math_abs");
        // A0 = x (IEEE 754 位模式在 X0 中)
        vm.fmovToFloat(VReg.V0, VReg.A0);  // V0 = (double)A0
        vm.fabs(VReg.V0, VReg.V0);  // V0 = abs(V0)
        vm.fmovToInt(VReg.RET, VReg.V0);  // RET = V0 (as integer bits)
        vm.ret();
    }

    // Math.pow(base, exp) - 幂运算
    generatePow() {
        const vm = this.vm;

        vm.label("_math_pow");
        // A0 = base (float64 bits), A1 = exponent (float64 bits)
        // 注册外部符号 pow (在 macOS 上会自动加下划线 _pow)
        // 直接设置 undefinedSymbols 以避开 registerUndefinedSymbol 的强制前缀
        vm.getAsm().undefinedSymbols["pow"] = true;
        
        vm.fmovToFloat(0, VReg.A0); // FP0 = base
        vm.fmovToFloat(1, VReg.A1); // FP1 = exponent
        vm.call("pow");             // 调用 C pow(FP0, FP1) -> FP0
        vm.fmovToInt(VReg.RET, 0);  // RET = FP0 (as bits)
        vm.ret();
    }
}
