// JSBin Math 运行时
// 提供 Math 对象方法的运行时实现

import { VReg } from "../../../vm/registers.js";

// Math 常量值
const MATH_PI = 3.141592653589793;
const MATH_E = 2.718281828459045;
const MATH_LN2 = 0.6931471805599453;
const MATH_LN10 = 2.302585092994046;
const MATH_LOG2E = 1.4426950408889634;
const MATH_LOG10E = 0.4342944819032518;
const MATH_SQRT2 = 1.4142135623730951;
const MATH_SQRT1_2 = 0.7071067811865476;

export class MathGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateMathSqrt();
        this.generateMathPow();
        this.generateMathPowInt();
        this.generateMathLog();
        this.generateMathExp();
        this.generateMathSin();
        this.generateMathCos();
        this.generateMathTan();
        this.generateMathAsin();
        this.generateMathAcos();
        this.generateMathAtan();
        this.generateMathAtan2();
        this.generateMathRandom();
        this.generateMathSign();
        this.generateMathTrunc();
        this.generateMathFloor();
        this.generateMathCeil();
        this.generateMathRound();
        this.generateMathFround();
        this.generateMathClz32();
        this.generateMathImul();
        this.generateMathHypot();
    }

    generateDataSection(asm) {
        // Math 常量
        asm.addDataLabel("_math_pi");
        this._addFloat64(asm, MATH_PI);

        asm.addDataLabel("_math_e");
        this._addFloat64(asm, MATH_E);

        asm.addDataLabel("_math_ln2");
        this._addFloat64(asm, MATH_LN2);

        asm.addDataLabel("_math_ln10");
        this._addFloat64(asm, MATH_LN10);

        asm.addDataLabel("_math_log2e");
        this._addFloat64(asm, MATH_LOG2E);

        asm.addDataLabel("_math_log10e");
        this._addFloat64(asm, MATH_LOG10E);

        asm.addDataLabel("_math_sqrt2");
        this._addFloat64(asm, MATH_SQRT2);

        asm.addDataLabel("_math_sqrt1_2");
        this._addFloat64(asm, MATH_SQRT1_2);

        // 随机数生成器种子（简单的 xorshift128+ 状态）
        asm.addDataLabel("_random_state0");
        asm.addDataQword(0x853c49e6748fea9b);
        asm.addDataLabel("_random_state1");
        asm.addDataQword(0xda3e39cb94b95bdb);
    }

    _addFloat64(asm, value) {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        view.setFloat64(0, value, true); // little-endian
        // 使用 addDataQword 直接写入 64 位
        const qword = view.getBigUint64(0, true);
        asm.addDataQword(qword);
    }

    // Math.sqrt(x) - 平方根
    generateMathSqrt() {
        const vm = this.vm;

        vm.label("_math_sqrt");
        vm.prologue(16, [VReg.S0]);

        // A0 = Number 对象指针
        // 读取 float64 值到 D0
        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        // 执行 fsqrt
        vm.emit("fsqrt", 0, 0);
        // 转回整数寄存器
        vm.emit("fmov_to_int", VReg.V0, 0);

        // 创建新的 Number 对象
        this._boxNumber(vm, VReg.V0);

        vm.epilogue([VReg.S0], 16);
    }

    // Math.pow(base, exp) - 幂运算
    // 使用迭代算法：exp(exp * ln(base))
    generateMathPow() {
        const vm = this.vm;

        vm.label("_math_pow");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // base
        vm.mov(VReg.S1, VReg.A1); // exp

        // 检查 exp 是否为整数
        vm.load(VReg.V0, VReg.S1, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.emit("fcvtzs", VReg.V1, 0); // 转整数
        vm.emit("scvtf", 1, VReg.V1); // 转回浮点
        vm.emit("fcmp", 0, 1);
        vm.jne("_pow_float_exp");

        // 整数指数：使用快速幂
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.V1);
        vm.call("_math_pow_int");
        vm.jmp("_pow_done");

        vm.label("_pow_float_exp");
        // 非整数指数：使用 exp(exp * ln(base))
        // result = exp(exp * log(base))
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_math_log");
        vm.push(VReg.RET);

        vm.load(VReg.V0, VReg.S1, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.pop(VReg.V1);
        vm.load(VReg.V1, VReg.V1, 8);
        vm.emit("fmov_to_float", 1, VReg.V1);
        vm.emit("fmul", 0, 0, 1);
        vm.emit("fmov_to_int", VReg.V0, 0);

        // 装箱并调用 exp
        this._boxNumber(vm, VReg.V0);
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_math_exp");

        vm.label("_pow_done");
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 整数幂运算辅助函数
    // A0 = base (Number), A1 = exp (整数)
    generateMathPowInt() {
        const vm = this.vm;

        vm.label("_math_pow_int");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        // 加载 base 的浮点值到 D0
        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.mov(VReg.S0, VReg.A1); // exp

        // result = 1.0 (D1)
        vm.movImm(VReg.V0, 0x3ff0000000000000); // 1.0 in IEEE 754
        vm.emit("fmov_to_float", 1, VReg.V0);

        // 处理负指数
        vm.cmpImm(VReg.S0, 0);
        vm.jge("_pow_int_loop");
        vm.neg(VReg.S0, VReg.S0);
        vm.movImm(VReg.S2, 1); // 标记需要取倒数
        vm.jmp("_pow_int_loop_start");

        vm.label("_pow_int_loop");
        vm.movImm(VReg.S2, 0);

        vm.label("_pow_int_loop_start");
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_pow_int_done");

        // if (exp & 1) result *= base
        vm.andImm(VReg.V1, VReg.S0, 1);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_pow_int_skip_mul");
        vm.emit("fmul", 1, 1, 0);

        vm.label("_pow_int_skip_mul");
        // base *= base
        vm.emit("fmul", 0, 0, 0);
        // exp >>= 1
        vm.shrImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_pow_int_loop_start");

        vm.label("_pow_int_done");
        // 如果是负指数，取倒数
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_pow_int_box");
        vm.movImm(VReg.V0, 0x3ff0000000000000);
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.emit("fdiv", 1, 0, 1);

        vm.label("_pow_int_box");
        vm.emit("fmov_to_int", VReg.V0, 1);
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // Math.log(x) - 自然对数
    // 使用泰勒级数近似
    generateMathLog() {
        const vm = this.vm;

        vm.label("_math_log");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // 加载输入值
        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);

        // 检查 x <= 0
        vm.emit("fcmp_zero", 0);
        vm.jle("_log_nan");

        // 使用恒等式: ln(x) = ln(m * 2^e) = ln(m) + e * ln(2)
        // 这里简化为泰勒级数：ln(1+x) ≈ x - x²/2 + x³/3 - ...
        // 对于 0.5 <= x <= 2，使用 ln((1+y)/(1-y)) = 2(y + y³/3 + y⁵/5 + ...)
        // 其中 y = (x-1)/(x+1)

        // 计算 y = (x-1)/(x+1)
        vm.movImm(VReg.V0, 0x3ff0000000000000); // 1.0
        vm.emit("fmov_to_float", 1, VReg.V0);
        vm.emit("fsub", 2, 0, 1); // x - 1
        vm.emit("fadd", 3, 0, 1); // x + 1
        vm.emit("fdiv", 4, 2, 3); // y = (x-1)/(x+1)

        // result = 0
        vm.movImm(VReg.V0, 0);
        vm.emit("fmov_to_float", 5, VReg.V0);

        // y² in D6
        vm.emit("fmul", 6, 4, 4);

        // term = y in D7
        vm.emit("fmov", 7, 4);

        // 迭代: result += term/n, term *= y², n += 2
        vm.movImm(VReg.S0, 1); // n = 1

        vm.label("_log_loop");
        vm.cmpImm(VReg.S0, 21); // 10 次迭代
        vm.jgt("_log_loop_done");

        // result += term / n
        vm.emit("scvtf", 0, VReg.S0);
        vm.emit("fdiv", 0, 7, 0);
        vm.emit("fadd", 5, 5, 0);

        // term *= y²
        vm.emit("fmul", 7, 7, 6);

        vm.addImm(VReg.S0, VReg.S0, 2);
        vm.jmp("_log_loop");

        vm.label("_log_loop_done");
        // result *= 2
        vm.movImm(VReg.V0, 0x4000000000000000); // 2.0
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.emit("fmul", 5, 5, 0);

        vm.emit("fmov_to_int", VReg.V0, 5);
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        vm.label("_log_nan");
        // 返回 NaN
        vm.movImm(VReg.V0, 0x7ff8000000000000); // NaN
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    // Math.exp(x) - e^x
    // 使用泰勒级数: e^x = 1 + x + x²/2! + x³/3! + ...
    generateMathExp() {
        const vm = this.vm;

        vm.label("_math_exp");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0); // x in D0

        // result = 1.0 (D1)
        vm.movImm(VReg.V0, 0x3ff0000000000000);
        vm.emit("fmov_to_float", 1, VReg.V0);

        // term = 1.0 (D2)
        vm.emit("fmov", 2, 1);

        // n = 1
        vm.movImm(VReg.S0, 1);

        vm.label("_exp_loop");
        vm.cmpImm(VReg.S0, 20);
        vm.jgt("_exp_done");

        // term *= x / n
        vm.emit("fmul", 2, 2, 0);
        vm.emit("scvtf", 3, VReg.S0);
        vm.emit("fdiv", 2, 2, 3);

        // result += term
        vm.emit("fadd", 1, 1, 2);

        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_exp_loop");

        vm.label("_exp_done");
        vm.emit("fmov_to_int", VReg.V0, 1);
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // Math.sin(x) - 正弦
    // 泰勒级数: sin(x) = x - x³/3! + x⁵/5! - ...
    generateMathSin() {
        const vm = this.vm;

        vm.label("_math_sin");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0); // x in D0

        // 规范化 x 到 [-π, π]
        // 简化：直接使用泰勒级数

        // result = x (D1)
        vm.emit("fmov", 1, 0);

        // term = x (D2)
        vm.emit("fmov", 2, 0);

        // x² in D3
        vm.emit("fmul", 3, 0, 0);

        // n = 3, sign = -1
        vm.movImm(VReg.S0, 3);
        vm.movImm(VReg.S1, -1);

        vm.label("_sin_loop");
        vm.cmpImm(VReg.S0, 21);
        vm.jgt("_sin_done");

        // term *= x² / (n * (n-1))
        vm.emit("fmul", 2, 2, 3);
        vm.subImm(VReg.V1, VReg.S0, 1);
        vm.mul(VReg.V2, VReg.S0, VReg.V1);
        vm.emit("scvtf", 4, VReg.V2);
        vm.emit("fdiv", 2, 2, 4);

        // result += sign * term
        vm.cmpImm(VReg.S1, 0);
        vm.jlt("_sin_sub");
        vm.emit("fadd", 1, 1, 2);
        vm.jmp("_sin_next");
        vm.label("_sin_sub");
        vm.emit("fsub", 1, 1, 2);

        vm.label("_sin_next");
        vm.neg(VReg.S1, VReg.S1);
        vm.addImm(VReg.S0, VReg.S0, 2);
        vm.jmp("_sin_loop");

        vm.label("_sin_done");
        vm.emit("fmov_to_int", VReg.V0, 1);
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // Math.cos(x) - 余弦
    // 泰勒级数: cos(x) = 1 - x²/2! + x⁴/4! - ...
    generateMathCos() {
        const vm = this.vm;

        vm.label("_math_cos");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0); // x in D0

        // result = 1.0 (D1)
        vm.movImm(VReg.V0, 0x3ff0000000000000);
        vm.emit("fmov_to_float", 1, VReg.V0);

        // term = 1.0 (D2)
        vm.emit("fmov", 2, 1);

        // x² in D3
        vm.emit("fmul", 3, 0, 0);

        // n = 2, sign = -1
        vm.movImm(VReg.S0, 2);
        vm.movImm(VReg.S1, -1);

        vm.label("_cos_loop");
        vm.cmpImm(VReg.S0, 20);
        vm.jgt("_cos_done");

        // term *= x² / (n * (n-1))
        vm.emit("fmul", 2, 2, 3);
        vm.subImm(VReg.V1, VReg.S0, 1);
        vm.mul(VReg.V2, VReg.S0, VReg.V1);
        vm.emit("scvtf", 4, VReg.V2);
        vm.emit("fdiv", 2, 2, 4);

        // result += sign * term
        vm.cmpImm(VReg.S1, 0);
        vm.jlt("_cos_sub");
        vm.emit("fadd", 1, 1, 2);
        vm.jmp("_cos_next");
        vm.label("_cos_sub");
        vm.emit("fsub", 1, 1, 2);

        vm.label("_cos_next");
        vm.neg(VReg.S1, VReg.S1);
        vm.addImm(VReg.S0, VReg.S0, 2);
        vm.jmp("_cos_loop");

        vm.label("_cos_done");
        vm.emit("fmov_to_int", VReg.V0, 1);
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // Math.tan(x) = sin(x) / cos(x)
    generateMathTan() {
        const vm = this.vm;

        vm.label("_math_tan");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 计算 sin(x)
        vm.call("_math_sin");
        vm.push(VReg.RET);

        // 计算 cos(x)
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_math_cos");
        vm.mov(VReg.V1, VReg.RET);
        vm.pop(VReg.V0);

        // sin/cos
        vm.load(VReg.V2, VReg.V0, 8);
        vm.load(VReg.V3, VReg.V1, 8);
        vm.emit("fmov_to_float", 0, VReg.V2);
        vm.emit("fmov_to_float", 1, VReg.V3);
        vm.emit("fdiv", 0, 0, 1);
        vm.emit("fmov_to_int", VReg.V0, 0);

        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0], 16);
    }

    // Math.asin, acos, atan - 使用数值近似
    generateMathAsin() {
        const vm = this.vm;
        vm.label("_math_asin");
        vm.prologue(32, [VReg.S0]);

        // asin(x) ≈ x + x³/6 + 3x⁵/40 + ... (简化实现)
        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);

        // result = x
        vm.emit("fmov", 1, 0);
        // x² in D2
        vm.emit("fmul", 2, 0, 0);
        // x³ in D3
        vm.emit("fmul", 3, 2, 0);

        // + x³/6
        vm.movImm(VReg.V0, 0x4018000000000000); // 6.0
        vm.emit("fmov_to_float", 4, VReg.V0);
        vm.emit("fdiv", 5, 3, 4);
        vm.emit("fadd", 1, 1, 5);

        vm.emit("fmov_to_int", VReg.V0, 1);
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0], 32);
    }

    generateMathAcos() {
        const vm = this.vm;
        vm.label("_math_acos");
        vm.prologue(16, [VReg.S0]);

        // acos(x) = π/2 - asin(x)
        vm.mov(VReg.S0, VReg.A0);
        vm.call("_math_asin");

        vm.load(VReg.V0, VReg.RET, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);

        // π/2
        vm.movImm(VReg.V0, 0x3ff921fb54442d18); // π/2
        vm.emit("fmov_to_float", 1, VReg.V0);
        vm.emit("fsub", 0, 1, 0);

        vm.emit("fmov_to_int", VReg.V0, 0);
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0], 16);
    }

    generateMathAtan() {
        const vm = this.vm;
        vm.label("_math_atan");
        vm.prologue(32, [VReg.S0]);

        // atan(x) ≈ x - x³/3 + x⁵/5 - ... (for |x| <= 1)
        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);

        vm.emit("fmov", 1, 0); // result = x
        vm.emit("fmul", 2, 0, 0); // x²
        vm.emit("fmul", 3, 2, 0); // x³

        // - x³/3
        vm.movImm(VReg.V0, 0x4008000000000000); // 3.0
        vm.emit("fmov_to_float", 4, VReg.V0);
        vm.emit("fdiv", 5, 3, 4);
        vm.emit("fsub", 1, 1, 5);

        vm.emit("fmov_to_int", VReg.V0, 1);
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0], 32);
    }

    generateMathAtan2() {
        const vm = this.vm;
        vm.label("_math_atan2");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        // atan2(y, x) - 简化实现
        vm.mov(VReg.S0, VReg.A0); // y
        vm.mov(VReg.S1, VReg.A1); // x

        // 计算 y/x 并调用 atan
        vm.load(VReg.V0, VReg.S0, 8);
        vm.load(VReg.V1, VReg.S1, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.emit("fmov_to_float", 1, VReg.V1);
        vm.emit("fdiv", 0, 0, 1);
        vm.emit("fmov_to_int", VReg.V0, 0);

        this._boxNumber(vm, VReg.V0);
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_math_atan");
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // Math.random() - 伪随机数生成器 (xorshift128+)
    generateMathRandom() {
        const vm = this.vm;

        vm.label("_math_random");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        // 加载状态
        vm.lea(VReg.V0, "_random_state0");
        vm.load(VReg.S0, VReg.V0, 0);
        vm.lea(VReg.V0, "_random_state1");
        vm.load(VReg.S1, VReg.V0, 0);

        // xorshift128+
        vm.mov(VReg.V0, VReg.S0);
        vm.mov(VReg.V1, VReg.S1);

        // s0 ^= s0 << 23
        vm.shlImm(VReg.V2, VReg.S0, 23);
        vm.xor(VReg.S0, VReg.S0, VReg.V2);
        // s0 ^= s0 >> 17
        vm.shrImm(VReg.V2, VReg.S0, 17);
        vm.xor(VReg.S0, VReg.S0, VReg.V2);
        // s0 ^= s1
        vm.xor(VReg.S0, VReg.S0, VReg.S1);
        // s0 ^= s1 >> 26
        vm.shrImm(VReg.V2, VReg.S1, 26);
        vm.xor(VReg.S0, VReg.S0, VReg.V2);

        // 保存新状态
        vm.lea(VReg.V2, "_random_state0");
        vm.store(VReg.V2, 0, VReg.V1);
        vm.lea(VReg.V2, "_random_state1");
        vm.store(VReg.V2, 0, VReg.S0);

        // 结果 = (s0 + s1) 转换为 [0, 1) 的浮点数
        vm.add(VReg.V0, VReg.S0, VReg.V1);
        // 取高 52 位作为尾数，组装成 [1, 2) 范围的浮点数
        vm.shrImm(VReg.V0, VReg.V0, 12);
        vm.movImm(VReg.V1, 0x3ff0000000000000); // 1.0 的指数
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        // 减去 1.0 得到 [0, 1)
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.emit("fmov_to_float", 1, VReg.V1);
        vm.emit("fsub", 0, 0, 1);
        vm.emit("fmov_to_int", VReg.V0, 0);

        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // Math.sign(x)
    generateMathSign() {
        const vm = this.vm;

        vm.label("_math_sign");
        vm.prologue(0, []);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.emit("fcmp_zero", 0);

        vm.jgt("_sign_pos");
        vm.jlt("_sign_neg");

        // x == 0
        vm.movImm(VReg.V0, 0);
        vm.jmp("_sign_done");

        vm.label("_sign_pos");
        vm.movImm(VReg.V0, 0x3ff0000000000000); // 1.0
        vm.jmp("_sign_done");

        vm.label("_sign_neg");
        vm.movImm(VReg.V0, 0xbff0000000000000); // -1.0

        vm.label("_sign_done");
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([], 0);
    }

    // Math.trunc(x)
    generateMathTrunc() {
        const vm = this.vm;

        vm.label("_math_trunc");
        vm.prologue(0, []);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.emit("frintz", 0, 0); // 向零取整
        vm.emit("fmov_to_int", VReg.V0, 0);

        this._boxNumber(vm, VReg.V0);
        vm.epilogue([], 0);
    }

    // Math.floor(x)
    generateMathFloor() {
        const vm = this.vm;

        vm.label("_math_floor");
        vm.prologue(0, []);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        // frintm - 向负无穷取整
        vm.emit("frintm", 0, 0);
        vm.emit("fmov_to_int", VReg.V0, 0);

        this._boxNumber(vm, VReg.V0);
        vm.epilogue([], 0);
    }

    // Math.ceil(x)
    generateMathCeil() {
        const vm = this.vm;

        vm.label("_math_ceil");
        vm.prologue(0, []);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        // frintp - 向正无穷取整
        vm.emit("frintp", 0, 0);
        vm.emit("fmov_to_int", VReg.V0, 0);

        this._boxNumber(vm, VReg.V0);
        vm.epilogue([], 0);
    }

    // Math.round(x)
    generateMathRound() {
        const vm = this.vm;

        vm.label("_math_round");
        vm.prologue(0, []);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        // frinta - 四舍五入
        vm.emit("frinta", 0, 0);
        vm.emit("fmov_to_int", VReg.V0, 0);

        this._boxNumber(vm, VReg.V0);
        vm.epilogue([], 0);
    }

    // Math.fround(x) - 转换为单精度
    generateMathFround() {
        const vm = this.vm;

        vm.label("_math_fround");
        vm.prologue(0, []);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.fmovToFloat(0, VReg.V0);
        vm.fcvtd2s(0, 0); // 双精度转单精度
        vm.fcvts2d(0, 0); // 单精度转回双精度
        vm.fmovToInt(VReg.V0, 0);

        this._boxNumber(vm, VReg.V0);
        vm.epilogue([], 0);
    }

    // Math.clz32(x) - 前导零计数
    generateMathClz32() {
        const vm = this.vm;

        vm.label("_math_clz32");
        vm.prologue(0, []);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.emit("fcvtzs", VReg.V0, 0); // 转为整数
        vm.emit("clz", VReg.V0, VReg.V0); // 计数前导零
        vm.subImm(VReg.V0, VReg.V0, 32); // 调整为 32 位结果

        vm.emit("scvtf", 0, VReg.V0);
        vm.emit("fmov_to_int", VReg.V0, 0);
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([], 0);
    }

    // Math.imul(a, b) - 32 位整数乘法
    generateMathImul() {
        const vm = this.vm;

        vm.label("_math_imul");
        vm.prologue(0, []);

        vm.load(VReg.V0, VReg.A0, 8);
        vm.load(VReg.V1, VReg.A1, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.emit("fmov_to_float", 1, VReg.V1);
        vm.emit("fcvtzs", VReg.V0, 0);
        vm.emit("fcvtzs", VReg.V1, 1);

        // 32 位乘法
        vm.mul(VReg.V0, VReg.V0, VReg.V1);
        // 截断为 32 位
        vm.andImm(VReg.V0, VReg.V0, 0xffffffff);

        vm.emit("scvtf", 0, VReg.V0);
        vm.emit("fmov_to_int", VReg.V0, 0);
        this._boxNumber(vm, VReg.V0);
        vm.epilogue([], 0);
    }

    // Math.hypot(a, b) - 斜边长度
    generateMathHypot() {
        const vm = this.vm;

        vm.label("_math_hypot");
        vm.prologue(16, [VReg.S0]);

        // sqrt(a² + b²)
        vm.load(VReg.V0, VReg.A0, 8);
        vm.load(VReg.V1, VReg.A1, 8);
        vm.emit("fmov_to_float", 0, VReg.V0);
        vm.emit("fmov_to_float", 1, VReg.V1);
        vm.emit("fmul", 0, 0, 0); // a²
        vm.emit("fmul", 1, 1, 1); // b²
        vm.emit("fadd", 0, 0, 1); // a² + b²
        vm.emit("fsqrt", 0, 0);
        vm.emit("fmov_to_int", VReg.V0, 0);

        this._boxNumber(vm, VReg.V0);
        vm.epilogue([VReg.S0], 16);
    }

    // 辅助函数：将浮点位模式装箱为 Number 对象
    _boxNumber(vm, srcReg) {
        const TYPE_NUMBER = 13;
        vm.push(srcReg);
        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");
        vm.movImm(VReg.V1, TYPE_NUMBER);
        vm.store(VReg.RET, 0, VReg.V1);
        vm.pop(VReg.V1);
        vm.store(VReg.RET, 8, VReg.V1);
    }
}
