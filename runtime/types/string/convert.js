// JSBin 字符串运行时 - 类型转换
// 提供字符串与其他类型的转换函数

import { VReg } from "../../../vm/registers.js";

// 类型转换生成器 Mixin
export const StringConvertGenerator = {
    // 整数转字符串
    // _intToStr(n) -> str（带TYPE_STRING标记）
    generateIntToStr() {
        const vm = this.vm;

        vm.label("_intToStr");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 输入数字

        // 分配 24 字节缓冲区（纯内容，无头部）
        vm.movImm(VReg.A0, 24);
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET); // S4 = 分配的内存起始

        // S1 = 写入位置（直接从开始）
        vm.mov(VReg.S1, VReg.S4);
        vm.mov(VReg.S3, VReg.S1); // S3 = 保存起始位置

        // 处理负数
        const positiveLabel = "_intToStr_positive";
        vm.cmpImm(VReg.S0, 0);
        vm.jge(positiveLabel);

        // 写 '-'
        vm.movImm(VReg.V0, 45); // '-'
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);
        // 取反
        vm.movImm(VReg.V0, 0);
        vm.sub(VReg.S0, VReg.V0, VReg.S0);

        vm.label(positiveLabel);

        // 处理 0 的特殊情况
        const notZeroLabel = "_intToStr_notZero";
        const endLabel = "_intToStr_end";
        vm.cmpImm(VReg.S0, 0);
        vm.jne(notZeroLabel);
        vm.movImm(VReg.V0, 48); // '0'
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S1, 1, VReg.V0);
        vm.jmp(endLabel);

        vm.label(notZeroLabel);

        // 使用临时栈存储数字（逆序）
        vm.movImm(VReg.S2, 0); // S2 = 位数计数

        // 循环取每位数字（从低到高）
        const pushLoop = "_intToStr_pushLoop";
        const pushDone = "_intToStr_pushDone";
        vm.label(pushLoop);
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(pushDone);

        vm.movImm(VReg.V1, 10);
        vm.mod(VReg.V0, VReg.S0, VReg.V1); // V0 = 当前位
        // 重要：在 div 之前先处理 V0，因为 x64 的 div 会覆盖 RAX (V0)
        vm.addImm(VReg.V0, VReg.V0, 48); // + '0'
        vm.push(VReg.V0);
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.div(VReg.S0, VReg.S0, VReg.V1); // S0 = 剩余数字
        vm.jmp(pushLoop);

        vm.label(pushDone);

        // 从栈中弹出并写入 buffer（正序）
        const popLoop = "_intToStr_popLoop";
        const popDone = "_intToStr_popDone";
        vm.label(popLoop);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(popDone);

        vm.pop(VReg.V0);
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.subImm(VReg.S2, VReg.S2, 1);
        vm.jmp(popLoop);

        vm.label(popDone);

        // 写入结束符
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S1, 0, VReg.V0);

        vm.label(endLabel);
        // 直接返回 char* 指针
        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    },

    // 浮点数转字符串
    // _floatToStr(bits) -> str (C风格字符串指针)
    // 输入: A0 = IEEE 754 float64 位模式
    // 支持整数和带小数的浮点数
    generateFloatToStr() {
        const vm = this.vm;

        vm.label("_floatToStr");
        vm.prologue(96, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 位模式

        // 分配 32 字节缓冲区
        vm.movImm(VReg.A0, 32);
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET); // S4 = 缓冲区
        vm.mov(VReg.S1, VReg.S4); // S1 = 写入位置

        // 将位模式移动到浮点寄存器
        vm.fmovToFloat(0, VReg.S0);

        // 检查是否为负数
        vm.movImm(VReg.S5, 0); // S5 = 是否负数标志
        vm.fcmpZero(0);
        vm.jge("_floatToStr_not_neg");

        vm.movImm(VReg.S5, 1);
        vm.fabs(0, 0);
        // 写 '-'
        vm.movImm(VReg.V0, 45);
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);

        vm.label("_floatToStr_not_neg");

        // 检查是否为整数（没有小数部分）
        vm.ftrunc(1, 0); // D1 = trunc(D0)
        vm.fcmp(0, 1);
        vm.jne("_floatToStr_has_decimal");

        // 是整数，直接转为整数字符串
        vm.fcvtzs(VReg.A0, 0);
        vm.call("_intToStr");
        // 复制整数字符串到缓冲区
        vm.mov(VReg.A0, VReg.S1);
        vm.mov(VReg.A1, VReg.RET);
        vm.call("_strcpy");
        vm.jmp("_floatToStr_done");

        vm.label("_floatToStr_has_decimal");
        // 有小数部分

        // 先处理整数部分
        vm.ftrunc(1, 0); // D1 = 整数部分
        vm.fcvtzs(VReg.S2, 1); // S2 = 整数部分

        // 处理整数部分为 0 的情况
        vm.cmpImm(VReg.S2, 0);
        vm.jne("_floatToStr_int_nonzero");
        vm.movImm(VReg.V0, 48); // '0'
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp("_floatToStr_write_decimal");

        vm.label("_floatToStr_int_nonzero");
        // 写入整数部分
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_intToStr");
        vm.mov(VReg.A0, VReg.S1);
        vm.mov(VReg.A1, VReg.RET);
        vm.call("_strcpy");
        // 更新写入位置
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.add(VReg.S1, VReg.S1, VReg.RET);

        vm.label("_floatToStr_write_decimal");
        // 写小数点
        vm.movImm(VReg.V0, 46); // '.'
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);

        // 计算小数部分: frac = abs(value) - trunc(abs(value))
        vm.fsub(0, 0, 1); // D0 = 小数部分

        // 写入小数位（最多 6 位）
        vm.movImm(VReg.S3, 0); // 计数器

        vm.label("_floatToStr_decimal_loop");
        vm.cmpImm(VReg.S3, 6);
        vm.jge("_floatToStr_decimal_done");

        // frac = frac * 10
        // 使用 movImm + scvtf 将 10 转换为浮点数
        vm.movImm(VReg.V1, 10);
        vm.scvtf(1, VReg.V1);
        vm.fmul(0, 0, 1);

        // digit = trunc(frac)
        vm.ftrunc(1, 0);
        vm.fcvtzs(VReg.V0, 1);

        // 写入数字
        vm.addImm(VReg.V0, VReg.V0, 48);
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);

        // frac = frac - digit
        vm.fsub(0, 0, 1);

        // 检查是否已经没有小数了
        vm.fcmpZero(0);
        vm.jeq("_floatToStr_decimal_done");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_floatToStr_decimal_loop");

        vm.label("_floatToStr_decimal_done");
        // 写入结束符
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S1, 0, VReg.V0);

        vm.label("_floatToStr_done");
        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 96);
    },

    // 布尔值转字符串
    // _boolToStr(b) -> str
    generateBoolToStr() {
        const vm = this.vm;

        vm.label("_boolToStr");

        const falseLabel = "_boolToStr_false";
        const endLabel = "_boolToStr_end";

        vm.cmpImm(VReg.A0, 0);
        vm.jeq(falseLabel);

        // true
        vm.lea(VReg.RET, "_str_true");
        vm.jmp(endLabel);

        vm.label(falseLabel);
        // false
        vm.lea(VReg.RET, "_str_false");

        vm.label(endLabel);
        vm.ret();
    },

    // 通用 toString（简化版）
    // _toString(v) -> str
    generateToString() {
        const vm = this.vm;

        vm.label("_toString");
        // 简单实现：返回 "[object Object]"
        vm.lea(VReg.RET, "_str_object");
        vm.ret();
    },

    // 智能值转字符串
    // _valueToStr(v) -> str
    // 检测值类型并转换为字符串
    generateValueToStr() {
        const vm = this.vm;
        const TYPE_STRING = 6;
        const TYPE_NUMBER = 13;
        const TYPE_FLOAT64 = 29;
        const TYPE_ERROR = 31;

        vm.label("_valueToStr");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 值

        // 检查是否在代码/数据段范围内（字符串指针）
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jge("_valueToStr_check_heap");

        // 地址 < heap_base，检查是否可能是数据段字符串指针
        // 在 macOS ARM64 上，程序通常加载在 0x100000000 附近
        // 检查高 32 位是否是 1（即地址在 0x100000000 到 0x1FFFFFFFF 范围内）
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 32);
        vm.cmpImm(VReg.V0, 1);
        vm.jeq("_valueToStr_as_string"); // 是 0x1xxxxxxxx，可能是数据段字符串

        // 不是 macOS 数据段地址，当作数字
        vm.jmp("_valueToStr_as_raw_number");

        vm.label("_valueToStr_check_heap");
        // 检查是否在堆范围内
        vm.lea(VReg.V0, "_heap_ptr");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jge("_valueToStr_as_raw_number");

        // 在堆范围内，检查对象类型
        vm.load(VReg.V1, VReg.S0, 0);
        vm.andImm(VReg.V1, VReg.V1, 0xff);

        // 检查是否是字符串 (type=6)
        vm.cmpImm(VReg.V1, TYPE_STRING);
        vm.jeq("_valueToStr_as_string");

        // 检查是否是 Number 对象 (type=13)
        vm.cmpImm(VReg.V1, TYPE_NUMBER);
        vm.jeq("_valueToStr_as_number_obj");

        // 检查是否是 FLOAT64 对象 (type=29)
        vm.cmpImm(VReg.V1, TYPE_FLOAT64);
        vm.jeq("_valueToStr_as_number_obj");

        // 检查是否是 Error 对象 (type=31)
        vm.cmpImm(VReg.V1, TYPE_ERROR);
        vm.jeq("_valueToStr_as_error_obj");

        // 其他堆对象，当作原始数字处理（不太可能）
        vm.jmp("_valueToStr_as_raw_number");

        // Error 对象: [type:8][message:8][name:8][stack:8][cause:8]
        vm.label("_valueToStr_as_error_obj");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_error_to_string");
        vm.epilogue([VReg.S0], 16);

        // Number 对象: [type:8][float64_bits:8]
        vm.label("_valueToStr_as_number_obj");
        // 加载 offset 8 处的 float64 位表示
        vm.load(VReg.S0, VReg.S0, 8);
        // 继续到浮点转字符串逻辑
        vm.label("_valueToStr_as_raw_number");
        // 调用 _floatToStr 转换浮点数为 C 字符串
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_floatToStr");
        // 包装成 JSString 对象
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_createStrFromCStr");
        vm.epilogue([VReg.S0], 16);

        vm.label("_valueToStr_as_string");
        // 直接返回字符串指针
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0], 16);
    },
};
