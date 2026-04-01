// JSBin 运行时 - Number 打印功能
// 统一的数值打印函数，支持所有 Number 子类型

import { VReg } from "../../../vm/registers.js";
import { StringConstantsGenerator } from "../../core/strings.js";
import { TYPE_INT8, TYPE_INT16, TYPE_INT32, TYPE_INT64, TYPE_UINT8, TYPE_UINT16, TYPE_UINT32, TYPE_UINT64, TYPE_FLOAT32, TYPE_FLOAT64, isIntegerType, isFloatType } from "./types.js";

export class NumberPrintGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
        this.arch = vm.arch;
        this.os = vm.platform;
    }

    // 生成 write 系统调用
    emitWriteCall() {
        if (this.os === "windows") {
            this.vm.callWindowsWriteConsole();
        } else if (this.arch === "arm64") {
            this.vm.syscall(this.os === "linux" ? 64 : 4);
        } else {
            this.vm.syscall(this.os === "linux" ? 1 : 0x2000004);
        }
    }

    // 生成带换行的整数打印函数
    generatePrintInt() {
        const vm = this.vm;

        vm.label("_print_int");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0);
        vm.lea(VReg.S1, "_print_buf");
        vm.addImm(VReg.S1, VReg.S1, 20);
        vm.movImm(VReg.V1, 10);
        vm.storeByte(VReg.S1, 0, VReg.V1);

        vm.movImm(VReg.S2, 0);

        const notNegLabel = this.ctx.newLabel("print_not_neg");
        vm.cmpImm(VReg.S0, 0);
        vm.jge(notNegLabel);
        vm.movImm(VReg.S2, 1);
        vm.movImm(VReg.V0, 0);
        vm.sub(VReg.S0, VReg.V0, VReg.S0);
        vm.label(notNegLabel);

        const loopLabel = this.ctx.newLabel("print_loop");
        vm.label(loopLabel);
        vm.movImm(VReg.V1, 10);
        vm.div(VReg.V2, VReg.S0, VReg.V1);
        vm.mul(VReg.V3, VReg.V2, VReg.V1);
        vm.sub(VReg.V4, VReg.S0, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.storeByte(VReg.S1, 0, VReg.V4);
        vm.mov(VReg.S0, VReg.V2);
        vm.cmpImm(VReg.S0, 0);
        vm.jne(loopLabel);

        const noMinusLabel = this.ctx.newLabel("print_no_minus");
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(noMinusLabel);
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.movImm(VReg.V0, 45);
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.label(noMinusLabel);

        vm.movImm(VReg.A0, 1);
        vm.lea(VReg.V2, "_print_buf");
        vm.addImm(VReg.V2, VReg.V2, 21);
        vm.sub(VReg.A2, VReg.V2, VReg.S1);
        vm.mov(VReg.A1, VReg.S1);

        this.emitWriteCall();
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 64);
    }

    generatePrintIntNoNL() {
        const vm = this.vm;

        vm.label("_print_int_no_nl");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0);
        vm.lea(VReg.S1, "_print_buf");
        vm.addImm(VReg.S1, VReg.S1, 20);

        vm.movImm(VReg.S2, 0);

        const notNegLabel = this.ctx.newLabel("print_nonl_not_neg");
        vm.cmpImm(VReg.S0, 0);
        vm.jge(notNegLabel);
        vm.movImm(VReg.S2, 1);
        vm.movImm(VReg.V0, 0);
        vm.sub(VReg.S0, VReg.V0, VReg.S0);
        vm.label(notNegLabel);

        const loopLabel = this.ctx.newLabel("print_nonl_loop");
        vm.label(loopLabel);
        vm.movImm(VReg.V1, 10);
        vm.div(VReg.V2, VReg.S0, VReg.V1);
        vm.mul(VReg.V3, VReg.V2, VReg.V1);
        vm.sub(VReg.V4, VReg.S0, VReg.V3);
        vm.addImm(VReg.V4, VReg.V4, 48);
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.storeByte(VReg.S1, 0, VReg.V4);
        vm.mov(VReg.S0, VReg.V2);
        vm.cmpImm(VReg.S0, 0);
        vm.jne(loopLabel);

        const noMinusLabel = this.ctx.newLabel("print_nonl_no_minus");
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(noMinusLabel);
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.movImm(VReg.V0, 45);
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.label(noMinusLabel);

        vm.movImm(VReg.A0, 1);
        vm.lea(VReg.V2, "_print_buf");
        vm.addImm(VReg.V2, VReg.V2, 20);
        vm.sub(VReg.A2, VReg.V2, VReg.S1);
        vm.mov(VReg.A1, VReg.S1);

        this.emitWriteCall();
        
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 64);
    }

    // 浮点数打印函数
    generatePrintFloat() {
        const vm = this.vm;

        vm.label("_print_float");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // A0 包含 IEEE 754 位，保存到 S5 用于 NaN 检测
        vm.mov(VReg.S5, VReg.A0);
        // A0 包含 IEEE 754 位，直接移动到 D0
        vm.fmovToFloat(0, VReg.A0);

        // NaN 检测：NaN 与自身比较会失败（返回 unordered）
        vm.fcmp(0, 0);
        const notNaNLabel = "_print_float_not_nan_pf";
        vm.jeq(notNaNLabel);  // 如果 Z=1 则相等，不是 NaN

        // NaN 路径：检查符号位 (bit 63 of S5)
        // 负 NaN 的符号位为 1
        const isNegNaNLabel = "_print_float_nan_neg_pf";
        vm.shrImm(VReg.V0, VReg.S5, 63);
        vm.cmpImm(VReg.V0, 1);
        vm.jeq(isNegNaNLabel);  // 如果符号位为1，则是负 NaN

        // 正 NaN：打印 "NaN"
        vm.lea(VReg.A0, "_str_nan");
        vm.call("_print_str");
        vm.jmp("_print_float_done");

        vm.label(isNegNaNLabel);
        // 负 NaN：打印 "-NaN"
        vm.movImm(VReg.A0, 45);
        vm.call("_print_char");
        vm.lea(VReg.A0, "_str_nan");
        vm.call("_print_str");
        vm.jmp("_print_float_done");

        vm.label(notNaNLabel);

        // Infinity 检测：直接检查位模式
        const negInfinityLabel = "_print_float_neg_infinity_pf";
        const notInfinityLabel = "_print_float_not_infinity_pf";

        // 提取 exponent (bits 52-62)
        vm.shrImm(VReg.V1, VReg.S5, 52);
        vm.movImm(VReg.V2, 0x7FF);
        vm.and(VReg.V1, VReg.V1, VReg.V2);
        
        // 检查 exponent 是否全 1
        vm.cmp(VReg.V1, VReg.V2);
        vm.jne(notInfinityLabel);

        // 是 Infinity 或 NaN，检查 payload 是否为 0
        vm.movImm64(VReg.V2, 0x000FFFFFFFFFFFFFn);
        vm.and(VReg.V2, VReg.S5, VReg.V2);
        vm.cmpImm(VReg.V2, 0);
        vm.jne(notInfinityLabel); // 是 NaN

        // 是真正的 Infinity，现在通过符号位区分
        vm.shrImm(VReg.V0, VReg.S5, 63);
        
        vm.cmpImm(VReg.V0, 1);
        vm.jeq(negInfinityLabel);
        // 正 Infinity：打印 "Infinity"
        vm.lea(VReg.A0, "_str_infinity");
        vm.call("_print_str");
        vm.jmp("_print_float_done");

        vm.label(negInfinityLabel);
        // 负 Infinity：打印 "-Infinity"
        vm.movImm(VReg.A0, 45); // '-'
        vm.call("_print_char");

        // 2. 打印 "Infinity"
        vm.lea(VReg.A0, "_str_infinity");
        vm.call("_print_str");
        vm.jmp("_print_float_done");

        vm.label(notInfinityLabel);

        // 检查符号位来确定是否为负数 (包括 -0.0)
        vm.movImm(VReg.S1, 0); // 默认不为负
        vm.shrImm(VReg.V0, VReg.S5, 63); // 提取最高位(符号位)
        vm.cmpImm(VReg.V0, 1);
        const notNegLabel = "_print_float_not_neg_pf";
        vm.jne(notNegLabel);

        vm.movImm(VReg.S1, 1);
        vm.fabs(0, 0);

        vm.label(notNegLabel);

        // 检查是否为整数：直接使用 fcvtzs + scvtf 检测
        // 注意：D0 已经被 abs 处理过（如果是负数）
        vm.fcvtzs(VReg.S2, 0);  // S2 = trunc(D0)
        vm.scvtf(1, VReg.S2);   // D1 = float(S2)
        vm.fcmp(0, 1);          // 比较 D0 和 D1
        const hasDecimalLabel = "_print_float_has_decimal_pf";
        vm.jne(hasDecimalLabel);

        // 是整数路径
        vm.label("_print_float_skip_decimal");
        // S2 已经包含整数转换结果
        vm.cmpImm(VReg.S1, 1);
        const reallyNoMinus = "_print_float_int_really_no_minus";
        vm.jne(reallyNoMinus);
        vm.movImm(VReg.A0, 45); // '-'
        vm.call("_print_char");
        vm.label(reallyNoMinus);

        vm.mov(VReg.A0, VReg.S2);
        vm.call("_print_int");
        vm.jmp("_print_float_done");

        // 有小数部分
        vm.label(hasDecimalLabel);

        vm.cmpImm(VReg.S1, 0);
        const noMinusLabel = "_print_float_no_minus_pf";
        vm.jeq(noMinusLabel);
        vm.movImm(VReg.A0, 45);
        vm.call("_print_char");

        vm.label(noMinusLabel);

        // 计算小数部分: D2 = D0 - trunc(D0)
        vm.fmov(2, 0);
        vm.fsub(2, 2, 1);

        // 舍入补偿: 添加 0.5 * 10^-16 (即 5e-17)
        // 这样在打印 16 位时，如果第 17 位 >= 5，会进位
        vm.movImm64(VReg.V0, 0x3c8cd2b297d889bcn);
        vm.fmovToFloat(4, VReg.V0);
        vm.fadd(2, 2, 4);

        // 保存并打印整数部分
        vm.fcvtzs(VReg.S3, 1);
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_print_int_no_nl");

        // 打印小数点
        vm.movImm(VReg.A0, 46);
        vm.call("_print_char");

        // 打印小数部分 (16位精度，以匹配 Node.js)
        vm.movImm(VReg.S4, 16);
        vm.movImm(VReg.S3, 10);
        vm.scvtf(3, VReg.S3); // D3 = 10.0
        
        // 用于与 0 比较
        vm.movImm(VReg.V0, 0);
        vm.scvtf(5, VReg.V0); // D5 = 0.0

        const fracLoopLabel = "_print_float_frac_loop_pf";
        vm.label(fracLoopLabel);
        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_print_float_frac_done_pf");
        
        vm.fcmp(2, 5);
        vm.jeq("_print_float_frac_done_pf");

        vm.fmul(2, 2, 3); // D2 = D2 * 10
        vm.ftrunc(1, 2); // D1 = trunc(D2)
        vm.fcvtzs(VReg.V0, 1); // V0 = int(D1)
        vm.fsub(2, 2, 1); // D2 = D2 - D1

        vm.addImm(VReg.A0, VReg.V0, 48);
        vm.call("_print_char");

        vm.subImm(VReg.S4, VReg.S4, 1);
        vm.jmp(fracLoopLabel);

        vm.label("_print_float_frac_done_pf");

        // 打印换行
        vm.movImm(VReg.A0, 10);
        vm.call("_print_char");

        vm.label("_print_float_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 128);
    }

    generatePrintFloatNoNL() {
        const vm = this.vm;

        vm.label("_print_float_no_nl");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0);
        vm.fmovToFloat(0, VReg.S0);

        // NaN 检测：NaN 与自身比较会失败（返回 unordered）
        vm.fcmp(0, 0);
        const notNaNNoNLLabel = "_print_float_no_nl_not_nan_pf";
        vm.jeq(notNaNNoNLLabel);  // 如果 Z=1 则相等，不是 NaN

        // NaN 路径：检查符号位 (bit 63 of S0)
        const isNegNaNNoNLLabel = "_print_float_no_nl_nan_neg_pf";
        vm.shrImm(VReg.V0, VReg.S0, 63);
        vm.cmpImm(VReg.V0, 1);
        vm.jeq(isNegNaNNoNLLabel);  // 如果符号位为1，则是负 NaN

        // 正 NaN：打印 "NaN"
        vm.lea(VReg.A0, "_str_nan");
        vm.call("_print_str");
        vm.jmp("_print_float_nonl_done");

        vm.label(isNegNaNNoNLLabel);
        // 负 NaN：打印 "-NaN"
        vm.movImm(VReg.A0, 45);
        vm.call("_print_char");
        vm.lea(VReg.A0, "_str_nan");
        vm.call("_print_str");
        vm.jmp("_print_float_nonl_done");

        vm.label(notNaNNoNLLabel);

        // Infinity 检测：检查 exponent 是否为 0x7FF 且 mantissa 为 0
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 52);
        vm.andImm(VReg.V0, VReg.V0, 0x7ff);
        vm.cmpImm(VReg.V0, 0x7ff);
        const notInfNoNLLabel = "_print_float_no_nl_not_infinity_pf";
        vm.jne(notInfNoNLLabel);

        // 是 Infinity，检查符号
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 63); // 提取符号位 (bit 63 of original bits)
        vm.cmpImm(VReg.V0, 1);
        const negInfNoNLLabel = "_print_float_no_nl_neg_infinity_pf";
        vm.jeq(negInfNoNLLabel);

        // 正 Infinity：打印 "Infinity"
        vm.lea(VReg.A0, "_str_infinity");
        vm.call("_print_str");
        vm.jmp("_print_float_nonl_done");

        vm.label(negInfNoNLLabel);
        // 负 Infinity：打印 "-Infinity"
        vm.movImm(VReg.A0, 45);
        vm.call("_print_char");
        vm.lea(VReg.A0, "_str_infinity");
        vm.call("_print_str");
        vm.jmp("_print_float_nonl_done");

        vm.label(notInfNoNLLabel);

        vm.movImm(VReg.S1, 0); // 默认不为负
        vm.shrImm(VReg.V0, VReg.S0, 63); // 提取最高位(符号位)
        vm.cmpImm(VReg.V0, 1);
        const notNegLabel = "_print_float_no_nl_not_neg";
        vm.jne(notNegLabel);

        vm.movImm(VReg.S1, 1);
        vm.fabs(0, 0);

        vm.label(notNegLabel);

        vm.ftrunc(1, 0);
        vm.fcmp(0, 1);

        const hasDecimalLabel = "_print_float_no_nl_has_decimal";
        vm.jne(hasDecimalLabel);

        vm.fcvtzs(VReg.S2, 0);

        vm.cmpImm(VReg.S1, 0);
        const printIntNoMinusLabel = "_print_float_no_nl_int_no_minus";
        vm.jeq(printIntNoMinusLabel);

        vm.movImm(VReg.A0, 45);
        vm.call("_print_char");

        vm.label(printIntNoMinusLabel);
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_print_int_no_nl");
        vm.jmp("_print_float_nonl_done");

        vm.label(hasDecimalLabel);

        vm.cmpImm(VReg.S1, 0);
        const noMinusLabel = "_print_float_no_nl_no_minus";
        vm.jeq(noMinusLabel);
        vm.movImm(VReg.A0, 45);
        vm.call("_print_char");

        vm.label(noMinusLabel);

        vm.fmov(2, 0);
        vm.fsub(2, 2, 1);

        // 舍入补偿: 5e-17
        vm.movImm64(VReg.V0, 0x3c8cd2b297d889bcn);
        vm.fmovToFloat(4, VReg.V0);
        vm.fadd(2, 2, 4);

        vm.fcvtzs(VReg.S3, 1);
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_print_int_no_nl");

        vm.movImm(VReg.A0, 46);
        vm.call("_print_char");

        vm.subImm(VReg.SP, VReg.SP, 48);
        vm.mov(VReg.S0, VReg.SP);

        vm.movImm(VReg.S4, 0);
        vm.movImm(VReg.S5, 0);
        vm.movImm(VReg.S2, 17); // 提高精度到 17 位
        vm.movImm(VReg.S3, 10);

        vm.scvtf(3, VReg.S3);

        const decimalLoopLabel = "_print_float_no_nl_decimal_loop";

        vm.label(decimalLoopLabel);
        vm.cmpImm(VReg.S2, 0);
        const decimalDoneLabel = "_print_float_no_nl_decimal_done";
        vm.jeq(decimalDoneLabel);
        vm.subImm(VReg.S2, VReg.S2, 1);

        vm.fmul(2, 2, 3);
        vm.ftrunc(4, 2);
        vm.fcvtzs(VReg.V0, 4);

        vm.addImm(VReg.V0, VReg.V0, 48);
        vm.shl(VReg.V1, VReg.S4, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.store(VReg.V1, 0, VReg.V0);

        vm.addImm(VReg.S4, VReg.S4, 1);

        vm.fsub(2, 2, 4);

        vm.jmp(decimalLoopLabel);

        vm.label(decimalDoneLabel);

        vm.mov(VReg.S5, VReg.S4);
        vm.movImm(VReg.S4, 0);

        const printDigitLoopLabel = "_print_float_no_nl_digit_loop";
        const digitDoneLabel = "_print_float_no_nl_digit_done";

        vm.label(printDigitLoopLabel);
        vm.cmp(VReg.S4, VReg.S5);
        vm.jge(digitDoneLabel);

        vm.shl(VReg.V0, VReg.S4, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V0);
        vm.load(VReg.V0, VReg.V1, 0);
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_print_char");

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp(printDigitLoopLabel);

        vm.label(digitDoneLabel);
        vm.addImm(VReg.SP, VReg.SP, 48);

        vm.label("_print_float_nonl_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 128);
    }

    generatePrintFloat32NoNL() {
        const vm = this.vm;

        vm.label("_print_float32_no_nl");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        vm.fmovToFloatSingle(0, VReg.S0);
        vm.fcvts2d(0, 0);
        vm.fmovToInt(VReg.A0, 0);

        vm.call("_print_float_no_nl");

        vm.epilogue([VReg.S0], 16);
    }

    generatePrintNumber() {
        const vm = this.vm;

        vm.label("_print_number");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        vm.load(VReg.S1, VReg.S0, 0);
        vm.load(VReg.A0, VReg.S0, 8);

        const isFloatLabel = "_print_number_float";
        const isIntLabel = "_print_number_int";
        const doneLabel = "_print_number_done";

        vm.cmpImm(VReg.S1, 13);
        vm.jeq(isFloatLabel);

        vm.cmpImm(VReg.S1, TYPE_INT8);
        vm.jlt(isFloatLabel);
        vm.cmpImm(VReg.S1, TYPE_FLOAT32);
        vm.jlt(isIntLabel);

        vm.label(isFloatLabel);
        vm.call("_print_float");
        vm.jmp(doneLabel);

        vm.label(isIntLabel);
        vm.call("_print_int");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    generatePrintNumberNoNL() {
        const vm = this.vm;

        vm.label("_print_number_no_nl");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        vm.load(VReg.S1, VReg.S0, 0);
        vm.load(VReg.A0, VReg.S0, 8);

        const isFloatLabel = "_print_number_nonl_float";
        const isIntLabel = "_print_number_nonl_int";
        const doneLabel = "_print_number_nonl_done";

        vm.cmpImm(VReg.S1, 13);
        vm.jeq(isFloatLabel);

        vm.cmpImm(VReg.S1, TYPE_INT8);
        vm.jlt(isFloatLabel);
        vm.cmpImm(VReg.S1, TYPE_FLOAT32);
        vm.jlt(isIntLabel);

        vm.label(isFloatLabel);
        vm.call("_print_float_no_nl");
        vm.jmp(doneLabel);

        vm.label(isIntLabel);
        vm.call("_print_int_no_nl");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 打印 16 进制数 (64位)
    generatePrintHex() {
        const vm = this.vm;

        vm.label("_print_hex");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);
        vm.mov(VReg.S0, VReg.A0); // 待打印的值

        // 打印 "0x"
        vm.movImm(VReg.A0, 48); // '0'
        vm.call("_print_char");
        vm.movImm(VReg.A0, 120); // 'x'
        vm.call("_print_char");

        // 使用 _print_buf (偏移 20 处开始)
        vm.lea(VReg.S1, "_print_buf");
        vm.addImm(VReg.S1, VReg.S1, 16); // 16 位 16 进制

        vm.movImm(VReg.S2, 16); // 计数器
        const loopLabel = this.ctx.newLabel("print_hex_loop");
        vm.label(loopLabel);
        
        vm.andImm(VReg.V0, VReg.S0, 0xF); // 取最后 4 位
        vm.cmpImm(VReg.V0, 10);
        const letterLabel = this.ctx.newLabel("print_hex_letter");
        vm.jge(letterLabel);
        vm.addImm(VReg.V0, VReg.V0, 48); // '0'-'9'
        vm.jmp("_print_hex_store");
        
        vm.label(letterLabel);
        vm.addImm(VReg.V0, VReg.V0, 87); // 'a'-'f' (97 - 10)
        
        vm.label("_print_hex_store");
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.storeByte(VReg.S1, 0, VReg.V0);
        
        vm.shrImm(VReg.S0, VReg.S0, 4); // 右移 4 位
        vm.subImm(VReg.S2, VReg.S2, 1);
        vm.cmpImm(VReg.S2, 0);
        vm.jne(loopLabel);

        // 打印生成的 16 位字符串
        vm.movImm(VReg.A0, 1); // stdout
        vm.mov(VReg.A1, VReg.S1); // buf
        vm.movImm(VReg.A2, 16); // len
        this.emitWriteCall();

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
    }

    generate() {
        this.generatePrintInt();
        this.generatePrintIntNoNL();
        this.generatePrintHex();
        this.generatePrintFloat();
        this.generatePrintFloatNoNL();
        this.generatePrintFloat32NoNL();
        this.generatePrintNumber();
        this.generatePrintNumberNoNL();
    }

    generateDataSection(asm) {
        const strGen = new StringConstantsGenerator(asm);
        strGen.generatePrintBuffer();
        strGen.generateAll();
    }
}
