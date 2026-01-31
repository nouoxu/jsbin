// JSBin 编译器 - 字面量编译
// 编译各类字面量：数字、字符串、布尔值等

import { VReg } from "../../vm/index.js";

// 将 JavaScript number 转换为 IEEE 754 double 的 64 位整数表示
function floatToInt64Bits(value) {
    const buffer = new ArrayBuffer(8);
    const floatView = new Float64Array(buffer);
    const intView = new BigInt64Array(buffer);
    floatView[0] = value;
    return intView[0];
}

// 字面量编译方法混入
export const LiteralCompiler = {
    // 编译字面量
    compileLiteral(expr) {
        let value = expr.value;
        if (typeof value === "number") {
            // JavaScript 所有数字都是 IEEE 754 double
            // 统一使用浮点表示，以确保 _print_float 等函数能正确工作
            this.compileNumericLiteral(value);
        } else if (typeof value === "string") {
            this.compileStringValue(value);
        } else if (typeof value === "boolean") {
            // 使用 NaN-boxing 格式的布尔值
            const label = value ? "_js_true" : "_js_false";
            this.vm.lea(VReg.RET, label);
            this.vm.load(VReg.RET, VReg.RET, 0);
        } else if (value === null) {
            // 使用 NaN-boxing 格式的 null
            this.vm.lea(VReg.RET, "_js_null");
            this.vm.load(VReg.RET, VReg.RET, 0);
        } else if (value === undefined || expr.raw === "undefined") {
            // 使用 NaN-boxing 格式的 undefined
            this.vm.lea(VReg.RET, "_js_undefined");
            this.vm.load(VReg.RET, VReg.RET, 0);
        } else if (value instanceof RegExp || expr.regex) {
            // 正则表达式字面量
            this.compileRegExpLiteral(expr);
        } else {
            this.vm.movImm(VReg.RET, 0);
        }
    },

    // 编译正则表达式字面量
    compileRegExpLiteral(expr) {
        const regex = expr.regex || { pattern: expr.value.source, flags: expr.value.flags };
        const pattern = regex.pattern;
        const flags = regex.flags || "";

        // 将 flags 字符串转换为整数
        // g=1, i=2, m=4, s=8, u=16, y=32
        let flagsInt = 0;
        if (flags.includes("g")) flagsInt |= 1;
        if (flags.includes("i")) flagsInt |= 2;
        if (flags.includes("m")) flagsInt |= 4;
        if (flags.includes("s")) flagsInt |= 8;
        if (flags.includes("u")) flagsInt |= 16;
        if (flags.includes("y")) flagsInt |= 32;

        // 分配 pattern 字符串
        const patternLabel = this.asm.addString(pattern);

        // 调用 _regexp_new(pattern, flags) 创建 RegExp 对象
        this.vm.lea(VReg.A0, patternLabel);
        this.vm.movImm(VReg.A1, flagsInt);
        this.vm.call("_regexp_new");
        // RET (X0) = RegExp 对象原始指针

        // 将原始指针转换为 NaN-boxed object
        // object tag = 0x7ffd000000000000
        // 注意：V0 映射到 X0，与 RET 冲突，所以用 V1 (X1)
        this.vm.movImm64(VReg.V1, 0x7ffd000000000000n);
        this.vm.or(VReg.RET, VReg.RET, VReg.V1);
    },

    // 编译数字字面量为 Number 对象
    // 所有数字字面量统一生成为 Number 对象 [type: 8B][value: 8B]
    // 这样变量赋值后存储的是对象指针，与运算时的 unboxNumber 一致
    compileNumericLiteral(value) {
        const bits = floatToInt64Bits(value);
        const label = this.asm.addFloat64(value, bits);
        this.vm.lea(VReg.RET, label);
        this.vm.load(VReg.RET, VReg.RET, 0);
        // 将 raw float64 位模式包装为 Number 对象
        this.boxNumber(VReg.RET);
    },

    // 编译整数字面量（用于 int 类型上下文，无头部）
    compileIntLiteral(value) {
        this.vm.movImm(VReg.RET, Math.trunc(value));
    },

    // 编译原始数字值（不带头部，用于内部优化）
    compileRawNumericLiteral(value) {
        const bits = floatToInt64Bits(value);
        const label = this.asm.addFloat64(value, bits);
        this.vm.lea(VReg.RET, label);
        this.vm.load(VReg.RET, VReg.RET, 0);
    },

    // 编译字符串字面量
    compileStringLiteral(expr) {
        this.compileStringValue(expr.value);
    },

    // 编译字符串值
    compileStringValue(str) {
        const label = this.asm.addString(str);
        this.vm.lea(VReg.RET, label);
    },

    // 编译模板字符串
    compileTemplateLiteral(expr) {
        const quasis = expr.quasis || [];
        const expressions = expr.expressions || [];

        // 简单情况：没有表达式，只有静态字符串
        if (quasis.length === 1 && expressions.length === 0) {
            this.compileStringValue(quasis[0].value.cooked || quasis[0].value.raw);
            return;
        }

        // 复杂情况：有表达式需要插值
        // 从第一个 quasi 开始构建结果字符串
        if (quasis.length > 0) {
            this.compileStringValue(quasis[0].value.cooked || quasis[0].value.raw);
        } else {
            // 空字符串
            this.compileStringValue("");
        }

        // 交替连接表达式和后续的 quasi
        for (let i = 0; i < expressions.length; i++) {
            // 保存当前结果
            this.vm.push(VReg.RET);

            // 编译表达式并转换为字符串
            this.compileExpressionToString(expressions[i]);
            this.vm.mov(VReg.A1, VReg.RET);

            // 恢复之前的结果
            this.vm.pop(VReg.A0);

            // 连接
            this.vm.call("_strconcat");

            // 如果有下一个 quasi 且不为空，继续连接
            if (i + 1 < quasis.length) {
                const nextQuasi = quasis[i + 1].value.cooked || quasis[i + 1].value.raw;
                if (nextQuasi.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileStringValue(nextQuasi);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_strconcat");
                }
            }
        }
    },
};
