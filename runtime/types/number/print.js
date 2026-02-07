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
    // 输入: A0 = 整数值 (已解包)
    generatePrintInt() {
        const vm = this.vm;

        vm.label("_print_int");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0);
        vm.lea(VReg.S1, "_print_buf");
        vm.addImm(VReg.S1, VReg.S1, 20);
        vm.movImm(VReg.V1, 10);
        vm.storeByte(VReg.S1, 0, VReg.V1); // 换行符

        // S2 用于记录是否为负数
        vm.movImm(VReg.S2, 0);

        // 检查是否为负数
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

        // 如果是负数，添加负号
        const noMinusLabel = this.ctx.newLabel("print_no_minus");
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(noMinusLabel);
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.movImm(VReg.V0, 45); // '-'
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

    // 生成无换行的整数打印函数
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

    // 生成浮点数打印函数 (float64)
    // 输入: A0 = IEEE 754 位模式 (已解包)
    generatePrintFloat() {
        const vm = this.vm;
        const arch = this.arch;

        vm.label("_print_float");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // S0 = 原始值（位表示）
        vm.mov(VReg.S0, VReg.A0);

        // ===== 检查 Infinity 和 NaN (exponent = 0x7FF) =====
        // 提取高 12 位来检查 exponent
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 52); // 右移 52 位得到 sign + exponent (12 位)
        vm.andImm(VReg.V0, VReg.V0, 0x7ff); // 屏蔽 sign 位，得到纯 exponent
        vm.movImm(VReg.V1, 0x7ff);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne("_print_float_normal");

        // exponent = 0x7FF，是 Infinity 或 NaN
        // 检查 mantissa 是否为 0 (Infinity) 还是非 0 (NaN)
        vm.mov(VReg.V0, VReg.S0);
        vm.movImm64(VReg.V1, "0x000fffffffffffff"); // 52-bit mantissa mask
        vm.and(VReg.V0, VReg.V0, VReg.V1);
        vm.cmpImm(VReg.V0, 0);
        vm.jne("_print_float_nan");

        // mantissa = 0，是 Infinity
        // 检查 sign bit
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 63);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_print_float_pos_inf");

        // 负无穷
        vm.lea(VReg.A0, "_str_neg_infinity");
        vm.call("_print_str");
        vm.jmp("_print_float_done");

        vm.label("_print_float_pos_inf");
        vm.lea(VReg.A0, "_str_infinity");
        vm.call("_print_str");
        vm.jmp("_print_float_done");

        vm.label("_print_float_nan");
        vm.lea(VReg.A0, "_str_nan");
        vm.call("_print_str");
        vm.jmp("_print_float_done");

        // ===== 正常浮点数处理 =====
        vm.label("_print_float_normal");

        // 将位表示移动到浮点寄存器
        vm.fmovToFloat(0, VReg.S0);

        // 检查是否为负数
        vm.movImm(VReg.S1, 0);
        vm.fcmpZero(0);
        const notNegLabel = "_print_float_not_neg";
        vm.jge(notNegLabel);

        vm.movImm(VReg.S1, 1);
        vm.fabs(0, 0);

        vm.label(notNegLabel);

        // 检查是否为整数
        vm.ftrunc(1, 0);
        vm.fcmp(0, 1);

        const hasDecimalLabel = "_print_float_has_decimal";
        vm.jne(hasDecimalLabel);

        // 是整数路径
        // 注意: fcvtzs 结果存到 S2（避免 V0/A0 寄存器别名问题）
        vm.fcvtzs(VReg.S2, 0);

        vm.cmpImm(VReg.S1, 0);
        const printIntNoMinusLabel = "_print_float_int_no_minus";
        vm.jeq(printIntNoMinusLabel);

        vm.movImm(VReg.V1, 45);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        vm.label(printIntNoMinusLabel);
        vm.mov(VReg.A0, VReg.S2); // 从 S2 加载整数值到 A0
        vm.call("_print_int");
        vm.jmp("_print_float_done");

        // 有小数部分
        vm.label(hasDecimalLabel);

        vm.cmpImm(VReg.S1, 0);
        const noMinusLabel = "_print_float_no_minus";
        vm.jeq(noMinusLabel);
        vm.movImm(VReg.V1, 45);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        vm.label(noMinusLabel);

        // 计算小数部分
        vm.fmov(2, 0);
        vm.fsub(2, 2, 1);

        // 四舍五入
        vm.movImm(VReg.V0, 0x3ea0c6f7);
        vm.shl(VReg.V0, VReg.V0, 32);
        vm.movImm(VReg.V1, 0xa0b5ed8d);
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        vm.fmovToFloat(5, VReg.V0);
        vm.fadd(2, 2, 5);

        // 保存小数部分
        vm.fmovToInt(VReg.V0, 2);
        vm.push(VReg.V0);

        // 保存并打印整数部分
        vm.fcvtzs(VReg.S3, 1);
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_print_int_no_nl");

        // 打印小数点
        vm.movImm(VReg.V1, 46);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        // 恢复小数部分
        vm.pop(VReg.V0);
        vm.fmovToFloat(2, VReg.V0);

        // 分配缓冲区
        vm.subImm(VReg.SP, VReg.SP, 48);
        vm.mov(VReg.S0, VReg.SP);

        vm.movImm(VReg.S4, 0);
        vm.movImm(VReg.S5, 0);
        vm.movImm(VReg.S2, 6);
        vm.movImm(VReg.S3, 10);

        vm.scvtf(3, VReg.S3);

        const decimalLoopLabel = "_print_float_decimal_loop";
        const decimalBufferDoneLabel = "_print_float_buffer_done";

        vm.label(decimalLoopLabel);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(decimalBufferDoneLabel);
        vm.subImm(VReg.S2, VReg.S2, 1);

        vm.fmul(2, 2, 3);
        vm.ftrunc(4, 2);
        vm.fcvtzs(VReg.V0, 4);

        vm.addImm(VReg.V0, VReg.V0, 48);
        vm.shl(VReg.V1, VReg.S4, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.store(VReg.V1, 0, VReg.V0);

        vm.cmpImm(VReg.V0, 48);
        const skipUpdateLabel = "_print_float_skip_update";
        vm.jeq(skipUpdateLabel);
        vm.addImm(VReg.S5, VReg.S4, 1);
        vm.label(skipUpdateLabel);

        vm.addImm(VReg.S4, VReg.S4, 1);

        vm.fsub(2, 2, 4);

        vm.jmp(decimalLoopLabel);

        vm.label(decimalBufferDoneLabel);

        vm.movImm(VReg.S2, 0);
        const printDigitLoopLabel = "_print_float_digit_loop";
        const decimalDoneLabel = "_print_float_decimal_done";

        vm.label(printDigitLoopLabel);
        vm.cmp(VReg.S2, VReg.S5);
        vm.jge(decimalDoneLabel);

        vm.shl(VReg.V0, VReg.S2, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V0);
        vm.load(VReg.V0, VReg.V1, 0);
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(printDigitLoopLabel);

        vm.label(decimalDoneLabel);
        vm.addImm(VReg.SP, VReg.SP, 48);
        vm.call("_print_nl");

        vm.label("_print_float_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 128);
    }

    // 生成无换行浮点打印
    generatePrintFloatNoNL() {
        const vm = this.vm;
        const arch = this.arch;

        vm.label("_print_float_no_nl");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0);

        // ===== 检查 Infinity 和 NaN (exponent = 0x7FF) =====
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 52);
        vm.andImm(VReg.V0, VReg.V0, 0x7ff);
        vm.movImm(VReg.V1, 0x7ff);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne("_print_float_nonl_normal");

        // 是 Infinity 或 NaN
        vm.mov(VReg.V0, VReg.S0);
        vm.movImm64(VReg.V1, "0x000fffffffffffff");
        vm.and(VReg.V0, VReg.V0, VReg.V1);
        vm.cmpImm(VReg.V0, 0);
        vm.jne("_print_float_nonl_nan");

        // mantissa = 0，是 Infinity，检查 sign
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 63);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_print_float_nonl_pos_inf");

        // 负无穷
        vm.lea(VReg.A0, "_str_neg_infinity");
        vm.call("_print_str_no_nl");
        vm.jmp("_print_float_nonl_done");

        vm.label("_print_float_nonl_pos_inf");
        vm.lea(VReg.A0, "_str_infinity");
        vm.call("_print_str_no_nl");
        vm.jmp("_print_float_nonl_done");

        vm.label("_print_float_nonl_nan");
        vm.lea(VReg.A0, "_str_nan");
        vm.call("_print_str_no_nl");
        vm.jmp("_print_float_nonl_done");

        // ===== 正常浮点数处理 =====
        vm.label("_print_float_nonl_normal");

        vm.fmovToFloat(0, VReg.S0);

        vm.movImm(VReg.S1, 0);
        vm.fcmpZero(0);
        const notNegLabel = "_print_float_nonl_not_neg";
        vm.jge(notNegLabel);

        vm.movImm(VReg.S1, 1);
        vm.fabs(0, 0);

        vm.label(notNegLabel);

        vm.ftrunc(1, 0);
        vm.fcmp(0, 1);

        const hasDecimalLabel = "_print_float_nonl_has_decimal";
        vm.jne(hasDecimalLabel);

        vm.fcvtzs(VReg.V0, 0);

        // 保存 V0 到 S2（打印负号可能会破坏 caller-saved 寄存器）
        vm.mov(VReg.S2, VReg.V0);

        vm.cmpImm(VReg.S1, 0);
        const printIntNoMinusLabel = "_print_float_nonl_int_no_minus";
        vm.jeq(printIntNoMinusLabel);

        vm.movImm(VReg.V1, 45);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        vm.label(printIntNoMinusLabel);
        vm.mov(VReg.A0, VReg.S2); // 使用保存的 S2
        vm.call("_print_int_no_nl");
        vm.jmp("_print_float_nonl_done");

        vm.label(hasDecimalLabel);

        vm.cmpImm(VReg.S1, 0);
        const noMinusLabel = "_print_float_nonl_no_minus";
        vm.jeq(noMinusLabel);
        vm.movImm(VReg.V1, 45);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        vm.label(noMinusLabel);

        vm.fmov(2, 0);
        vm.fsub(2, 2, 1);

        // 打印整数部分
        vm.fcvtzs(VReg.V0, 1);
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_print_int_no_nl");

        // 打印小数点
        vm.movImm(VReg.V1, 46);
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V1);

        // 打印小数部分（去掉尾部的零）
        vm.movImm(VReg.S3, 10);
        vm.scvtf(3, VReg.S3);

        // 分配缓冲区来存储数字
        vm.subImm(VReg.SP, VReg.SP, 48);
        vm.mov(VReg.S0, VReg.SP);

        vm.movImm(VReg.S4, 0); // 当前索引
        vm.movImm(VReg.S5, 0); // 最后一个非零数字的位置 + 1
        const decimalLoopLabel = "_print_float_nonl_decimal_loop";
        const decimalBufferDoneLabel = "_print_float_nonl_buffer_done";

        vm.label(decimalLoopLabel);
        vm.cmpImm(VReg.S4, 6);
        vm.jge(decimalBufferDoneLabel);

        vm.fmul(2, 2, 3);
        vm.ftrunc(4, 2);
        vm.fcvtzs(VReg.V0, 4);
        vm.fsub(2, 2, 4);

        // 将数字存入缓冲区
        vm.addImm(VReg.V0, VReg.V0, 48);
        vm.shl(VReg.V1, VReg.S4, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.store(VReg.V1, 0, VReg.V0);

        // 如果不是 '0'，更新最后非零位置
        vm.cmpImm(VReg.V0, 48); // '0'
        const skipUpdateLabel = "_print_float_nonl_skip_update";
        vm.jeq(skipUpdateLabel);
        vm.addImm(VReg.S5, VReg.S4, 1);
        vm.label(skipUpdateLabel);

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp(decimalLoopLabel);

        vm.label(decimalBufferDoneLabel);

        // 打印缓冲区中的数字，直到最后一个非零位置
        vm.movImm(VReg.S4, 0);
        const printDigitLoopLabel = "_print_float_nonl_digit_loop";
        const decimalDoneLabel = "_print_float_nonl_decimal_done";

        vm.label(printDigitLoopLabel);
        vm.cmp(VReg.S4, VReg.S5);
        vm.jge(decimalDoneLabel);

        vm.shl(VReg.V0, VReg.S4, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V0);
        vm.load(VReg.V0, VReg.V1, 0);
        vm.push(VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.mov(VReg.A1, VReg.SP);
        vm.movImm(VReg.A2, 1);
        this.emitWriteCall();
        vm.pop(VReg.V0);

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp(printDigitLoopLabel);

        vm.label(decimalDoneLabel);
        vm.addImm(VReg.SP, VReg.SP, 48);

        vm.label("_print_float_nonl_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 128);
    }

    // 生成 Float32 打印（输入: A0 = 32位浮点位模式，需要转换为 float64 再打印）
    generatePrintFloat32NoNL() {
        const vm = this.vm;

        vm.label("_print_float32_no_nl");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 将 32 位整数移到单精度浮点寄存器
        vm.fmovToFloatSingle(0, VReg.S0);
        // 转换为双精度: single to double
        vm.fcvts2d(0, 0);
        // 从双精度浮点寄存器移回通用寄存器
        vm.fmovToInt(VReg.A0, 0);

        vm.call("_print_float_no_nl");

        vm.epilogue([VReg.S0], 16);
    }

    // 生成 Number 对象打印函数
    // 输入: A0 = Number 对象指针 或 原始 float64 位模式（如 Infinity/-Infinity/NaN）
    // 根据类型标记自动选择正确的打印方式
    generatePrintNumber() {
        const vm = this.vm;

        vm.label("_print_number");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0);

        const isRawFloatLabel = "_print_number_raw_float";
        const isHeapFloatLabel = "_print_number_heap_float";
        const isIntLabel = "_print_number_int";
        const doneLabel = "_print_number_done";

        // 首先检测输入是否是有效的堆指针
        // 如果 A0 在堆范围内 [_heap_base, _heap_ptr)，则是堆对象
        // 否则可能是原始 float64 值（如 Infinity/-Infinity/NaN）
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt(isRawFloatLabel); // < heap_base，不是堆指针，按 float64 打印

        vm.lea(VReg.V0, "_heap_ptr");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jge(isRawFloatLabel); // >= heap_ptr，不是堆指针，按 float64 打印

        // 是有效的堆指针，加载类型和值
        // 加载类型标记到 S1
        vm.load(VReg.S1, VReg.S0, 0);
        // 加载数值到 S2
        vm.load(VReg.S2, VReg.S0, 8);

        // 类型判断逻辑:
        // - TYPE_NUMBER = 13 → 浮点路径（内部存储为 float64）
        // - TYPE_INT8-INT64, UINT8-UINT64 (20-27) → 整数路径
        // - TYPE_FLOAT32-FLOAT64 (28-29) → 浮点路径

        // 检查是否为 TYPE_NUMBER = 13（通用数字类型，存储 float64）
        vm.cmpImm(VReg.S1, 13);
        vm.jeq(isHeapFloatLabel);

        // 检查是否为整数类型 (20-27)
        vm.cmpImm(VReg.S1, TYPE_INT8); // 20
        vm.jlt(isHeapFloatLabel); // < 20 未知，当作浮点
        vm.cmpImm(VReg.S1, TYPE_FLOAT32); // 28
        vm.jlt(isIntLabel); // 20-27 是整数

        // >= 28 是浮点类型，走 heap float 路径
        vm.label(isHeapFloatLabel);
        vm.mov(VReg.A0, VReg.S2); // 堆对象的值在 S2
        vm.call("_print_float");
        vm.jmp(doneLabel);

        // 原始 float64 值（如 Infinity/-Infinity/NaN）
        vm.label(isRawFloatLabel);
        vm.mov(VReg.A0, VReg.S0); // 原始值在 S0
        vm.call("_print_float");
        vm.jmp(doneLabel);

        vm.label(isIntLabel);
        // 整数类型：直接打印（值在 S2）
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_print_int");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // 生成无换行版本
    generatePrintNumberNoNL() {
        const vm = this.vm;

        vm.label("_print_number_no_nl");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0);

        // 类型判断逻辑（同 generatePrintNumber）
        const isRawFloatLabel = "_print_number_nonl_raw_float";
        const isHeapFloatLabel = "_print_number_nonl_heap_float";
        const isIntLabel = "_print_number_nonl_int";
        const doneLabel = "_print_number_nonl_done";

        // 首先检测输入是否是有效的堆指针
        // 如果 A0 在堆范围内 [_heap_base, _heap_ptr)，则是堆对象
        // 否则可能是原始 float64 值（如 Infinity/-Infinity/NaN）
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt(isRawFloatLabel); // < heap_base，不是堆指针，按 float64 打印

        vm.lea(VReg.V0, "_heap_ptr");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jge(isRawFloatLabel); // >= heap_ptr，不是堆指针，按 float64 打印

        // 是有效的堆指针，加载类型和值
        // 加载类型到 S1，值到 S2（避免被函数调用覆盖）
        vm.load(VReg.S1, VReg.S0, 0);
        vm.load(VReg.S2, VReg.S0, 8);

        // 检查是否为 TYPE_NUMBER = 13（通用数字类型，存储 float64）
        vm.cmpImm(VReg.S1, 13);
        vm.jeq(isHeapFloatLabel);

        // 检查是否为整数类型 (20-27)
        vm.cmpImm(VReg.S1, TYPE_INT8); // 20
        vm.jlt(isHeapFloatLabel); // < 20 未知，当作浮点
        vm.cmpImm(VReg.S1, TYPE_FLOAT32); // 28
        vm.jlt(isIntLabel); // 20-27 是整数

        // >= 28 是浮点类型，走 heap float 路径
        vm.label(isHeapFloatLabel);
        vm.mov(VReg.A0, VReg.S2); // 堆对象的值在 S2
        vm.call("_print_float_no_nl");
        vm.jmp(doneLabel);

        // 原始 float64 值（如 Infinity/-Infinity/NaN）
        vm.label(isRawFloatLabel);
        vm.mov(VReg.A0, VReg.S0); // 原始值在 S0
        vm.call("_print_float_no_nl");
        vm.jmp(doneLabel);

        vm.label(isIntLabel);
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_print_int_no_nl");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // 生成所有打印函数
    generate() {
        this.generatePrintInt();
        this.generatePrintIntNoNL();
        this.generatePrintFloat();
        this.generatePrintFloatNoNL();
        this.generatePrintFloat32NoNL();
        this.generatePrintNumber();
        this.generatePrintNumberNoNL();
    }

    // 生成数据段
    generateDataSection(asm) {
        const strGen = new StringConstantsGenerator(asm);
        strGen.generatePrintBuffer();
        strGen.generateAll();
    }
}
