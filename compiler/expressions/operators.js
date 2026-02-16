// JSBin 编译器 - 运算符编译
// 编译二元运算、一元运算、逻辑运算等

import { VReg } from "../../vm/index.js";
import { Type, inferType, isIntType } from "../core/types.js";

const TYPE_FLOAT64 = 29;

// 运算符编译方法混入
export const OperatorCompiler = {
    // 从 Number 对象中解包数值到寄存器
    // 输入: reg 包含 Number 对象指针（raw heap pointer，不是 NaN-boxed）
    // 输出: reg 包含 float64 位模式
    // 注：TYPE_NUMBER 和 TYPE_FLOAT64 的 offset 8 都是 float64 位模式
    // 重要：Number 对象总是以 raw heap pointer 形式存储，不是 NaN-boxed，
    //       因此不需要调用 _js_unbox，直接从 +8 偏移读取即可
    unboxNumber(reg) {
        // Number 对象是 raw heap pointer，直接从 +8 偏移加载 float64 位模式
        this.vm.load(reg, reg, 8);
    },

    // 将 float64 位模式包装成 Number 对象
    // 输入: valueReg 包含 float64 位模式
    // 输出: RET 包含 Number 对象指针
    boxNumber(valueReg) {
        // 保存值到 S0（因为 _alloc 会改变 caller-saved 寄存器）
        this.vm.mov(VReg.S0, valueReg);

        // 分配 16 字节
        this.vm.movImm(VReg.A0, 16);
        this.vm.call("_alloc");
        // RET (X0) 现在是分配的地址，保存到 S1
        this.vm.mov(VReg.S1, VReg.RET);

        // 写入类型标记（使用 V1 避免覆盖 RET/X0）
        this.vm.movImm(VReg.V1, TYPE_FLOAT64);
        this.vm.store(VReg.S1, 0, VReg.V1);

        // 写入值
        this.vm.store(VReg.S1, 8, VReg.S0);

        // 将结果移回 RET
        this.vm.mov(VReg.RET, VReg.S1);
    },

    // 将 int64（寄存器中的整数值）按 JS Number 语义装箱成 Number 对象
    // 输入: intReg 包含 int64 整数值
    // 输出: RET 包含 Number 对象指针
    // 说明：内部会覆盖 intReg 的值
    boxIntAsNumber(intReg) {
        this.vm.scvtf(0, intReg);
        this.vm.fmovToInt(intReg, 0);
        this.boxNumber(intReg);
    },

    // 将 int64（寄存器中的整数值）转换为 float64 位模式（不装箱）
    // 输入: intReg 包含 int64 整数值
    // 输出: intReg 变为 float64 位模式（仍在整数寄存器里）
    // 用途：算术运算前把整数字面量转换成浮点位模式
    intToFloat64Bits(intReg) {
        this.vm.scvtf(0, intReg);
        this.vm.fmovToInt(intReg, 0);
    },

    // 将浮点寄存器 fpIndex 中的结果按 JS Number 语义装箱成 Number 对象
    // 输入: fpIndex (0/1/...) 指定 FP 寄存器
    // 输出: RET 为 Number 对象指针
    boxFPAsNumber(fpIndex = 0) {
        this.vm.fmovToInt(VReg.RET, fpIndex);
        this.boxNumber(VReg.RET);
    },

    // 将 Number 对象转换为整数（用于数组下标等）
    // 输入: srcReg 为 Number 对象指针
    // 输出: destReg 为 int64 整数值
    numberToInt(destReg, srcReg) {
        this.vm.f2i(destReg, srcReg);
    },

    // in-place 版本：直接把 reg 的 Number 对象转换为 int64
    numberToIntInPlace(reg) {
        this.vm.f2i(reg, reg);
    },

    // 检测表达式是否为整数类型
    isIntExpression(expr) {
        const type = inferType(expr, this.ctx);
        return isIntType(type);
    },

    // 编译表达式作为整数（用于 int 类型上下文）
    compileExpressionAsInt(expr) {
        // 对于 BigInt 字面量，直接编译（已经是 int64）
        if ((expr.type === "Literal" || expr.type === "BigIntLiteral") && (typeof expr.value === "bigint" || expr.bigint)) {
            this.compileBigIntLiteral(expr);
            return;
        }
        // 对于整数字面量，直接使用整数值
        if ((expr.type === "Literal" || expr.type === "NumericLiteral") && typeof expr.value === "number") {
            this.compileIntLiteral(expr.value);
            return;
        }
        // 检查表达式类型是否为 BigInt
        const exprType = inferType(expr, this.ctx);
        if (exprType === Type.BIGINT) {
            // BigInt 变量存储的就是原始 int64，不需要 unbox
            this.compileExpression(expr);
            return;
        }
        // 对于一元表达式 -num，直接编译为负整数
        if (expr.type === "UnaryExpression" && expr.operator === "-") {
            if ((expr.argument.type === "Literal" || expr.argument.type === "NumericLiteral") && typeof expr.argument.value === "number") {
                this.compileIntLiteral(-expr.argument.value);
                return;
            }
            // 其他一元负号表达式：编译参数作为整数，然后取反
            this.compileExpressionAsInt(expr.argument);
            this.vm.neg(VReg.RET, VReg.RET);
            return;
        }
        // 对于二元表达式，递归处理
        if (expr.type === "BinaryExpression") {
            const op = expr.operator;
            if (["+", "-", "*", "/", "%"].includes(op)) {
                this.compileExpressionAsInt(expr.right);
                this.vm.push(VReg.RET);
                this.compileExpressionAsInt(expr.left);
                this.vm.pop(VReg.V1);

                switch (op) {
                    case "+":
                        this.vm.add(VReg.RET, VReg.RET, VReg.V1);
                        break;
                    case "-":
                        this.vm.sub(VReg.RET, VReg.RET, VReg.V1);
                        break;
                    case "*":
                        this.vm.mul(VReg.RET, VReg.RET, VReg.V1);
                        break;
                    case "/":
                        this.vm.div(VReg.RET, VReg.RET, VReg.V1);
                        break;
                    case "%":
                        this.vm.mod(VReg.RET, VReg.RET, VReg.V1);
                        break;
                }
                return;
            }
        }
        // 其他情况：编译表达式得到 Number 对象指针，然后解包成整数
        this.compileExpression(expr);
        // Number 对象的 offset 8 是 float64 位模式
        this.unboxNumber(VReg.RET);
        // 将 float64 位模式转换为整数
        this.vm.f2i(VReg.RET, VReg.RET);
    },

    // 编译二元表达式
    compileBinaryExpression(expr) {
        const op = expr.operator;

        // 保护性检查：确保左右操作数存在
        if (!expr.left || !expr.right) {
            console.error("BinaryExpression missing operand:", "left:", expr.left, "right:", expr.right, "op:", op);
            if (expr.loc) {
                console.error("Location:", expr.loc);
            }
            // 尝试继续而非抛出错误
            if (!expr.left && !expr.right) {
                this.vm.movImm64(VReg.RET, "0x7ffb000000000000"); // undefined
                return;
            } else if (!expr.left) {
                this.compileExpression(expr.right);
                return;
            } else {
                this.compileExpression(expr.left);
                return;
            }
        }

        // 常量折叠：两个字面量运算在编译时计算
        const leftLit = expr.left.type === "Literal" || expr.left.type === "NumericLiteral";
        const rightLit = expr.right.type === "Literal" || expr.right.type === "NumericLiteral";
        if (leftLit && rightLit && typeof expr.left.value === "number" && typeof expr.right.value === "number") {
            let result;
            const a = expr.left.value;
            const b = expr.right.value;
            switch (op) {
                case "+":
                    result = a + b;
                    break;
                case "-":
                    result = a - b;
                    break;
                case "*":
                    result = a * b;
                    break;
                case "/":
                    result = a / b;
                    break;
                case "%":
                    result = a % b;
                    break;
                case "**":
                    result = a ** b;
                    break;
                case "<":
                    result = a < b;
                    break;
                case "<=":
                    result = a <= b;
                    break;
                case ">":
                    result = a > b;
                    break;
                case ">=":
                    result = a >= b;
                    break;
                case "==":
                    result = a == b;
                    break;
                case "===":
                    result = a === b;
                    break;
                case "!=":
                    result = a != b;
                    break;
                case "!==":
                    result = a !== b;
                    break;
                // 位运算常量折叠
                case "&":
                    result = (a | 0) & (b | 0);
                    break;
                case "|":
                    result = a | 0 | (b | 0);
                    break;
                case "^":
                    result = (a | 0) ^ (b | 0);
                    break;
                case "<<":
                    result = (a | 0) << (b | 0);
                    break;
                case ">>":
                    result = (a | 0) >> (b | 0);
                    break;
                case ">>>":
                    result = (a | 0) >>> (b | 0);
                    break;
                default:
                    result = null;
            }
            if (result !== null) {
                if (typeof result === "boolean") {
                    const label = result ? "_js_true" : "_js_false";
                    this.vm.lea(VReg.RET, label);
                    this.vm.load(VReg.RET, VReg.RET, 0);
                } else {
                    this.compileNumericLiteral(result);
                }
                return;
            }
        }

        // 字符串常量折叠
        if (op === "+" && leftLit && rightLit && typeof expr.left.value === "string" && typeof expr.right.value === "string") {
            const result = expr.left.value + expr.right.value;
            this.compileStringValue(result);
            return;
        }

        // 字符串连接处理
        if (op === "+") {
            const leftType = inferType(expr.left, this.ctx);
            const rightType = inferType(expr.right, this.ctx);
            if (leftType === Type.STRING || rightType === Type.STRING) {
                this.compileStringConcat(expr);
                return;
            }
            // UNKNOWN 类型的 + 运算需要运行时类型检测
            // 因为参数可能是字符串或数字，无法在编译时确定
            if (leftType === Type.UNKNOWN || rightType === Type.UNKNOWN) {
                this.compileExpression(expr.right);
                this.vm.push(VReg.RET);
                this.compileExpression(expr.left);
                this.vm.pop(VReg.A1);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_js_add");
                return;
            }
        }

        // 相等性比较运算符（===, !==, ==, !=）可以用于任何类型
        // 需要调用运行时函数来处理不同类型的比较
        const isEqualityOp = ["===", "!==", "==", "!="].includes(op);
        if (isEqualityOp) {
            // 编译两个操作数
            this.compileExpression(expr.right);
            this.vm.push(VReg.RET);
            this.compileExpression(expr.left);
            this.vm.pop(VReg.A1); // 右操作数 -> A1
            this.vm.mov(VReg.A0, VReg.RET); // 左操作数 -> A0

            // 调用运行时严格相等比较函数
            if (op === "===" || op === "==") {
                this.vm.call("_js_strict_eq");
            } else {
                this.vm.call("_js_strict_ne");
            }
            // 结果已在 RET，是 NaN-boxed boolean
            return;
        }

        // 检测是否为 int 类型运算
        const isIntOp = this.isIntExpression(expr.left) && this.isIntExpression(expr.right);

        // 对于 +, -, *, / 运算，根据类型选择浮点或整数运算
        const isArithOp = ["+", "-", "*", "/"].includes(op);

        // 位运算：操作数需要转换为整数
        const isBitOp = ["&", "|", "^", "<<", ">>", ">>>"].includes(op);
        if (isBitOp) {
            // 编译右操作数为整数
            this.compileExpressionAsInt(expr.right);
            this.vm.push(VReg.RET);
            // 编译左操作数为整数
            this.compileExpressionAsInt(expr.left);
            this.vm.pop(VReg.V1);

            switch (op) {
                case "&":
                    this.vm.and(VReg.RET, VReg.RET, VReg.V1);
                    break;
                case "|":
                    this.vm.or(VReg.RET, VReg.RET, VReg.V1);
                    break;
                case "^":
                    this.vm.xor(VReg.RET, VReg.RET, VReg.V1);
                    break;
                case "<<":
                    this.vm.shl(VReg.RET, VReg.RET, VReg.V1);
                    break;
                case ">>":
                    this.vm.shr(VReg.RET, VReg.RET, VReg.V1);
                    break;
                case ">>>":
                    this.vm.shr(VReg.RET, VReg.RET, VReg.V1);
                    break;
            }
            // 检查操作数是否为 BigInt
            const leftType = inferType(expr.left, this.ctx);
            const rightType = inferType(expr.right, this.ctx);
            const isBigIntOp = leftType === Type.BIGINT || rightType === Type.BIGINT;

            if (!isBigIntOp) {
                // 非 BigInt：位运算结果是整数，需要装箱为 Number 对象
                this.boxIntAsNumber(VReg.RET);
            }
            // BigInt 结果保持为原始 int64，不装箱
            return;
        }

        if (isIntOp) {
            // int 类型：使用整数运算
            this.compileExpressionAsInt(expr.right);
            this.vm.push(VReg.RET);
            this.compileExpressionAsInt(expr.left);
            this.vm.pop(VReg.V1);

            switch (op) {
                case "+":
                    this.vm.add(VReg.RET, VReg.RET, VReg.V1);
                    return;
                case "-":
                    this.vm.sub(VReg.RET, VReg.RET, VReg.V1);
                    return;
                case "*":
                    this.vm.mul(VReg.RET, VReg.RET, VReg.V1);
                    return;
                case "/":
                    this.vm.div(VReg.RET, VReg.RET, VReg.V1);
                    return;
                case "%":
                    this.vm.mod(VReg.RET, VReg.RET, VReg.V1);
                    return;
                // 比较运算用浮点比较（因为变量类型不确定）
                case "<":
                    this.compileFloatComparison("jlt");
                    return;
                case "<=":
                    this.compileFloatComparison("jle");
                    return;
                case ">":
                    this.compileFloatComparison("jgt");
                    return;
                case ">=":
                    this.compileFloatComparison("jge");
                    return;
                case "==":
                case "===":
                    this.compileComparison("jeq");
                    return;
                case "!=":
                case "!==":
                    this.compileComparison("jne");
                    return;
            }
        }

        // 辅助函数：编译操作数为 float64 位模式
        // 由于变量类型可能在运行时改变（如整数变量被赋值为 Number 对象），
        // 我们需要更保守的策略
        const compileOperandAsFloat = (operand) => {
            const opType = inferType(operand, this.ctx);

            // 对于字面量，可以安全地使用静态类型
            if (operand.type === "Literal" || operand.type === "NumericLiteral") {
                // BigInt 字面量：直接编译，不需要 unbox
                if (typeof operand.value === "bigint" || operand.bigint) {
                    this.compileExpression(operand);
                    return;
                }
                if (isIntType(opType)) {
                    // 整数字面量：直接转换为 float64 位模式
                    this.compileExpressionAsInt(operand);
                    this.intToFloat64Bits(VReg.RET);
                    return;
                }
            }

            // 对于变量和其他表达式，调用 _to_number 转换为 float64 位模式
            // _to_number 可以正确处理 raw float64、Number 对象、int32 等
            this.compileExpression(operand);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_to_number");
            this.vm.mov(VReg.RET, VReg.A0);
        };

        // 先计算右操作数，保存到栈
        compileOperandAsFloat(expr.right);
        this.vm.push(VReg.RET);

        // 计算左操作数
        compileOperandAsFloat(expr.left);
        this.vm.pop(VReg.V1);

        // 对于算术运算，使用浮点指令
        if (isArithOp) {
            // 使用 VM 的统一浮点接口，不再区分 arm64/x64
            this.vm.fmovToFloat(0, VReg.RET); // FP0 = left
            this.vm.fmovToFloat(1, VReg.V1); // FP1 = right

            switch (op) {
                case "+":
                    this.vm.fadd(0, 0, 1);
                    break;
                case "-":
                    this.vm.fsub(0, 0, 1);
                    break;
                case "*":
                    this.vm.fmul(0, 0, 1);
                    break;
                case "/":
                    this.vm.fdiv(0, 0, 1);
                    break;
            }

            // 将结果包装为 Number 对象
            this.boxFPAsNumber(0);
            return;
        }

        // 其他运算使用整数运算
        switch (expr.operator) {
            case "+":
                this.vm.add(VReg.RET, VReg.RET, VReg.V1);
                this.boxNumber(VReg.RET);
                break;
            case "-":
                this.vm.sub(VReg.RET, VReg.RET, VReg.V1);
                this.boxNumber(VReg.RET);
                break;
            case "*":
                this.vm.mul(VReg.RET, VReg.RET, VReg.V1);
                this.boxNumber(VReg.RET);
                break;
            case "/":
                this.vm.div(VReg.RET, VReg.RET, VReg.V1);
                this.boxNumber(VReg.RET);
                break;
            case "%":
                // 浮点取模: a % b = a - trunc(a / b) * b
                if (!isIntOp) {
                    // 使用 VM 的统一接口
                    this.vm.fmovToFloat(0, VReg.RET); // FP0 = left
                    this.vm.fmovToFloat(1, VReg.V1); // FP1 = right
                    this.vm.fmod(0, 0, 1); // FP0 = FP0 % FP1
                    this.boxFPAsNumber(0);
                    break;
                }
                this.vm.mod(VReg.RET, VReg.RET, VReg.V1);
                this.boxNumber(VReg.RET);
                break;
            // 注意：位运算 &, |, ^, <<, >>, >>> 已在上面的 isBitOp 分支处理
            case "**":
                // 指数运算：调用 Math.pow(base, exp)
                // 此时 RET = left (base) 的 float64 位模式, V1 = right (exp) 的 float64 位模式
                // _math_pow 期望 Number 对象指针，所以需要先装箱
                // 注意: boxNumber 会使用 S0 和 S1，所以用 S2, S3 保存中间值

                // 先装箱 exp (V1)，保存到 S2
                this.vm.mov(VReg.S2, VReg.RET); // 临时保存 base 到 S2
                this.boxNumber(VReg.V1); // exp -> Number
                this.vm.mov(VReg.S3, VReg.RET); // 保存 exp Number 到 S3

                // 装箱 base (原来在 S2)
                this.boxNumber(VReg.S2); // base -> Number
                this.vm.mov(VReg.A0, VReg.RET); // base Number -> A0
                this.vm.mov(VReg.A1, VReg.S3); // exp Number -> A1

                this.vm.call("_math_pow");
                // 结果已是 Number 对象
                break;
            case "<":
                this.compileFloatComparison("jlt");
                break;
            case "<=":
                this.compileFloatComparison("jle");
                break;
            case ">":
                this.compileFloatComparison("jgt");
                break;
            case ">=":
                this.compileFloatComparison("jge");
                break;
            case "==":
            case "===":
                // 严格相等需要调用运行时函数来正确处理字符串比较
                this.vm.mov(VReg.A0, VReg.RET); // 左操作数
                this.vm.mov(VReg.A1, VReg.V1); // 右操作数
                this.vm.call("_js_strict_eq");
                break;
            case "!=":
            case "!==":
                // 严格不等：调用 _js_strict_ne
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.mov(VReg.A1, VReg.V1);
                this.vm.call("_js_strict_ne");
                break;
            case "instanceof":
                // 左操作数在 RET，右操作数在 V1
                // 调用 _instanceof 运行时函数
                this.vm.mov(VReg.A0, VReg.RET); // 左操作数（实例）
                this.vm.mov(VReg.A1, VReg.V1); // 右操作数（构造函数）
                this.vm.call("_instanceof");
                break;
            case "in":
                // 检查属性是否在对象中: "prop" in obj
                // 左操作数在 RET（属性名），右操作数在 V1（对象）
                // _prop_in 参数顺序: (obj, key) 并检查原型链
                this.vm.mov(VReg.A0, VReg.V1); // 对象
                this.vm.mov(VReg.A1, VReg.RET); // 属性名
                this.vm.call("_prop_in");
                break;
            default:
                console.warn("Unhandled binary operator:", expr.operator);
        }
    },

    // 编译比较运算
    // 返回 NaN-boxed 布尔值: JS_TRUE (0x7FF9000000000001) 或 JS_FALSE (0x7FF9000000000000)
    compileComparison(jumpOp) {
        const trueLabel = this.ctx.newLabel("cmp_true");
        const endLabel = this.ctx.newLabel("cmp_end");

        this.vm.cmp(VReg.RET, VReg.V1);
        this.vm[jumpOp](trueLabel);
        // false: 加载 NaN-boxed false (0x7FF9000000000000)
        this.vm.lea(VReg.RET, "_js_false");
        this.vm.load(VReg.RET, VReg.RET, 0);
        this.vm.jmp(endLabel);
        this.vm.label(trueLabel);
        // true: 加载 NaN-boxed true (0x7FF9000000000001)
        this.vm.lea(VReg.RET, "_js_true");
        this.vm.load(VReg.RET, VReg.RET, 0);
        this.vm.label(endLabel);
    },

    // 编译浮点比较运算
    // RET 和 V1 已包含 float64 位模式（由 compileOperandAsFloat 设置）
    // 直接移到浮点寄存器进行比较
    // 返回 NaN-boxed 布尔值
    compileFloatComparison(jumpOp) {
        const trueLabel = this.ctx.newLabel("fcmp_true");
        const endLabel = this.ctx.newLabel("fcmp_end");

        // 将位模式移到浮点寄存器
        this.vm.fmovToFloat(0, VReg.RET); // D0 = left
        this.vm.fmovToFloat(1, VReg.V1); // D1 = right

        // 浮点比较
        this.vm.fcmp(0, 1);
        this.vm[jumpOp](trueLabel);
        // false: 加载 NaN-boxed false
        this.vm.lea(VReg.RET, "_js_false");
        this.vm.load(VReg.RET, VReg.RET, 0);
        this.vm.jmp(endLabel);
        this.vm.label(trueLabel);
        // true: 加载 NaN-boxed true
        this.vm.lea(VReg.RET, "_js_true");
        this.vm.load(VReg.RET, VReg.RET, 0);
        this.vm.label(endLabel);
    },

    // 编译逻辑表达式 (&&, ||, ??)
    compileLogicalExpression(expr) {
        const endLabel = this.ctx.newLabel("logical_end");

        this.compileExpression(expr.left);

        if (expr.operator === "&&") {
            // 需要正确处理所有 JavaScript 值的 truthy/falsy
            this.vm.push(VReg.RET); // 保存左侧原始值
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_to_boolean");
            this.vm.cmpImm(VReg.RET, 0);
            this.vm.pop(VReg.RET); // 恢复左侧原始值
            this.vm.jeq(endLabel); // 如果 falsy，返回左侧值
            this.compileExpression(expr.right);
        } else if (expr.operator === "||") {
            // 需要正确处理所有 JavaScript 值的 truthy/falsy
            this.vm.push(VReg.RET); // 保存左侧原始值
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_to_boolean");
            this.vm.cmpImm(VReg.RET, 0);
            this.vm.pop(VReg.RET); // 恢复左侧原始值
            this.vm.jne(endLabel); // 如果 truthy，返回左侧值
            this.compileExpression(expr.right);
        } else if (expr.operator === "??") {
            // 空值合并: 只有当左侧是 null 或 undefined 时才使用右侧
            // NaN-boxing: null = 0x7FFA000000000000, undefined = 0x7FFB000000000000
            const notNullLabel = this.ctx.newLabel("not_null");
            const notUndefLabel = this.ctx.newLabel("not_undef");

            // 检查是否为 null (0x7FFA000000000000)
            this.vm.movImm64(VReg.V1, "0x7ffa000000000000");
            this.vm.cmp(VReg.RET, VReg.V1);
            this.vm.jne(notNullLabel);
            // 是 null，使用右侧值
            this.compileExpression(expr.right);
            this.vm.jmp(endLabel);

            this.vm.label(notNullLabel);
            // 检查是否为 undefined (0x7FFB000000000000)
            this.vm.movImm64(VReg.V1, "0x7ffb000000000000");
            this.vm.cmp(VReg.RET, VReg.V1);
            this.vm.jne(notUndefLabel);
            // 是 undefined，使用右侧值
            this.compileExpression(expr.right);
            this.vm.jmp(endLabel);

            this.vm.label(notUndefLabel);
            // 不是 null 也不是 undefined，保持左侧值 (RET 已经是左侧值)
        }

        this.vm.label(endLabel);
    },

    // 编译一元表达式
    compileUnaryExpression(expr) {
        // 常量折叠：如果是负号操作符且参数是数字字面量，直接编译负值
        if (expr.operator === "-" && expr.argument.type === "Literal" && typeof expr.argument.value === "number") {
            const negValue = -expr.argument.value;
            this.compileNumericLiteral(negValue);
            return;
        }

        // 特殊处理：-Infinity
        if (expr.operator === "-" && expr.argument.type === "Identifier" && expr.argument.name === "Infinity") {
            // IEEE 754 负无穷: 0xFFF0000000000000
            this.vm.movImm64(VReg.RET, "0xfff0000000000000");
            return;
        }

        this.compileExpression(expr.argument);

        switch (expr.operator) {
            case "-":
                // 对于浮点数 (IEEE 754 double)，翻转符号位 (bit 63)
                // 这同时适用于正常数值、Infinity、NaN 等
                this.vm.movImm64(VReg.V0, "0x8000000000000000"); // 符号位掩码
                this.vm.xor(VReg.RET, VReg.RET, VReg.V0);
                break;
            case "!":
                // 需要正确处理所有 JavaScript 值的 truthy/falsy
                // 调用 _to_boolean 转换为 0 或 1，然后取反
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_to_boolean");
                const trueLabel = this.ctx.newLabel("not_true");
                const endLabel = this.ctx.newLabel("not_end");
                this.vm.cmpImm(VReg.RET, 0);
                this.vm.jeq(trueLabel);
                // NaN-boxing: false = 0x7FF9000000000000
                this.vm.movImm64(VReg.RET, "0x7ff9000000000000"); // truthy -> false
                this.vm.jmp(endLabel);
                this.vm.label(trueLabel);
                // NaN-boxing: true = 0x7FF9000000000001
                this.vm.movImm64(VReg.RET, "0x7ff9000000000001"); // falsy -> true
                this.vm.label(endLabel);
                break;
            case "~":
                this.vm.movImm(VReg.V1, -1);
                this.vm.xor(VReg.RET, VReg.RET, VReg.V1);
                break;
            case "+":
                break;
            case "typeof":
                // 调用运行时函数获取类型字符串
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_typeof");
                break;
        }
    },

    // 编译条件表达式 a ? b : c
    compileConditionalExpression(expr) {
        const elseLabel = this.ctx.newLabel("cond_else");
        const endLabel = this.ctx.newLabel("cond_end");

        this.compileExpression(expr.test);
        // 需要正确处理所有 JavaScript 值的 truthy/falsy
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jeq(elseLabel);

        this.compileExpression(expr.consequent);
        this.vm.jmp(endLabel);

        this.vm.label(elseLabel);
        this.compileExpression(expr.alternate);

        this.vm.label(endLabel);
    },

    // 编译字符串连接
    compileStringConcat(expr) {
        // 编译右侧，转换为字符串
        this.compileExpressionToString(expr.right);
        this.vm.push(VReg.RET);

        // 编译左侧，转换为字符串
        this.compileExpressionToString(expr.left);

        // 调用 _strconcat(left, right)
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.pop(VReg.A1);
        this.vm.call("_strconcat");
    },

    // 编译表达式并转换为字符串
    compileExpressionToString(expr) {
        // 处理 null/undefined 表达式
        if (!expr) {
            this.compileStringValue("undefined");
            return;
        }

        let type = inferType(expr, this.ctx);

        // 对于 MemberExpression，尝试从对象字面量推断属性类型
        if (type === Type.UNKNOWN && expr.type === "MemberExpression") {
            const propType = this.inferMemberPropertyType(expr);
            if (propType !== Type.UNKNOWN) {
                type = propType;
            }
        }

        if (type === Type.STRING) {
            // 已经是字符串
            this.compileExpression(expr);
        } else if (type === Type.INT64 || type === Type.INT32 || isIntType(type) || type === Type.FLOAT64 || type === Type.NUMBER) {
            // 数字转字符串
            // 注意：compileExpression 返回 Number 对象指针（可能是 NaN-boxed），需要从 offset 8 加载 float64 位
            this.compileExpression(expr);
            // 先 unbox 获取原始堆指针
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_js_unbox");
            // Number 对象布局: [type:8][float64_bits:8]
            // 从 offset 8 加载 float64 位表示
            this.vm.load(VReg.V0, VReg.RET, 8);
            // 使用 VM 的统一接口: 将 float64 位表示转换为整数
            this.vm.fmovToFloat(0, VReg.V0);
            this.vm.fcvtzs(VReg.A0, 0);
            this.vm.call("_intToStr");
        } else if (type === Type.BOOLEAN) {
            // 布尔值转字符串
            this.compileExpression(expr);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_boolToStr");
        } else {
            // 默认/UNKNOWN：对象属性访问可能返回 UNKNOWN
            // 调用运行时 _valueToStr 智能检测类型
            this.compileExpression(expr);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_valueToStr");
        }
    },

    // 推断 MemberExpression 属性类型
    inferMemberPropertyType(expr) {
        // 检查对象是否是标识符（变量）
        if (expr.object.type !== "Identifier") {
            return Type.UNKNOWN;
        }

        const objName = expr.object.name;
        const propName = expr.property.name || expr.property.value;

        // 检查变量的初始化表达式
        if (this.ctx.varInitExprs && this.ctx.varInitExprs[objName]) {
            const initExpr = this.ctx.varInitExprs[objName];
            if (initExpr.type === "ObjectExpression") {
                // 在对象字面量中查找属性
                for (const prop of initExpr.properties) {
                    const key = prop.key.name || prop.key.value;
                    if (key === propName) {
                        return inferType(prop.value, this.ctx);
                    }
                }
            }
        }

        return Type.UNKNOWN;
    },
};
