// JSBin 编译器 - 运算符编译
// 编译二元运算、一元运算、逻辑运算等

import { VReg } from "../../vm/index.js";
import { Type, inferType, isIntType } from "../core/types.js";

const TYPE_FLOAT64 = 29;
const TYPE_NUMBER = 13;

// 将 JavaScript number 转换为 IEEE 754 double 的 64 位整数表示
function floatToInt64Bits(value) {
    const buffer = new ArrayBuffer(8);
    const floatView = new Float64Array(buffer);
    const intView = new BigInt64Array(buffer);
    floatView[0] = value;
    return intView[0];
}

// 正确的 float64 取反：通过翻转符号位
function negateFloat64Bits(bits) {
    return bits ^ 0x8000000000000000n;
}

// 运算符编译方法混入
export const OperatorCompiler = {
    // 从 Number 对象中解包数值到寄存器
    // 输入: reg 包含 Number 对象指针
    // 输出: reg 包含 float64 位模式
    // 注：TYPE_NUMBER 和 TYPE_FLOAT64 的 offset 8 都是 float64 位模式
    // 注意：reg 可能是 block 指针或 user_ptr (block + 16)
    //     - 如果是 block 指针：从 reg + 8 加载
    //     - 如果是 user_ptr：从 reg - 8 加载
    unboxNumber(reg) {
        // 数字对象既可能以 block_ptr 形式出现，也可能以 user_ptr
        // (block + 16) 形式出现。旧逻辑通过 heap_base+0x1000 猜测
        // user_ptr，会把早期分配的 Number 对象误判成 block_ptr。
        // 这里改成直接检查对象头 type。
        const checkBlockLabel = this.ctx.newLabel("unbox_check_block");
        const isBlockLabel = this.ctx.newLabel("unbox_block");
        const isUserPtrLabel = this.ctx.newLabel("unbox_userptr");
        const notNumberLabel = this.ctx.newLabel("unbox_not_number");
        const doneLabel = this.ctx.newLabel("unbox_done");

        // 保存原始值
        this.vm.mov(VReg.V1, reg);

        // 检查是否在堆范围内：heap_base <= reg < heap_ptr
        this.vm.lea(VReg.V2, "_heap_base");
        this.vm.load(VReg.V2, VReg.V2, 0);
        this.vm.cmp(reg, VReg.V2);
        this.vm.jlt(doneLabel); // < heap_base，raw value，不需要 unbox

        this.vm.lea(VReg.V2, "_heap_ptr");
        this.vm.load(VReg.V2, VReg.V2, 0);
        this.vm.cmp(reg, VReg.V2);
        this.vm.jge(doneLabel); // >= heap_ptr，不是 user_ptr，raw value

        // 优先按 user_ptr 尝试：如果 reg - 16 位置的 type 是 Number，
        // 那它就是 user_ptr，value 位于 reg - 8。
        this.vm.lea(VReg.V2, "_heap_base");
        this.vm.load(VReg.V2, VReg.V2, 0);
        this.vm.addImm(VReg.V0, VReg.V2, 16);
        this.vm.cmp(VReg.V1, VReg.V0);
        this.vm.jlt(checkBlockLabel);
        this.vm.subImm(VReg.V0, VReg.V1, 16);
        this.vm.load(VReg.V3, VReg.V0, 0);
        this.vm.cmpImm(VReg.V3, TYPE_NUMBER);
        this.vm.jeq(isUserPtrLabel);
        this.vm.cmpImm(VReg.V3, TYPE_FLOAT64);
        this.vm.jeq(isUserPtrLabel);

        // 再按 block_ptr 检查：如果 reg + 0 的 type 是 Number，
        // value 位于 reg + 8。
        this.vm.label(checkBlockLabel);
        this.vm.load(VReg.V3, VReg.V1, 0);
        this.vm.cmpImm(VReg.V3, TYPE_NUMBER);
        this.vm.jeq(isBlockLabel);
        this.vm.cmpImm(VReg.V3, TYPE_FLOAT64);
        this.vm.jeq(isBlockLabel);
        this.vm.jmp(notNumberLabel);

        this.vm.label(isBlockLabel);
        this.vm.load(reg, VReg.V1, 8);
        this.vm.jmp(doneLabel);

        this.vm.label(isUserPtrLabel);
        this.vm.subImm(VReg.V0, VReg.V1, 8);
        this.vm.load(reg, VReg.V0, 0);
        this.vm.jmp(doneLabel);

        // 堆对象但不是 Number：按 JS ToNumber 的简化语义回退成 NaN，
        // 避免把裸指针当成 float 位模式继续传播。
        this.vm.label(notNumberLabel);
        this.vm.movImm64(reg, 0x7ff8000000000000n);

        this.vm.label(doneLabel);
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
        // RET 现在是用户数据指针 (block + 16)

        // 获取 block 指针：RET = user_ptr - 16 = block
        this.vm.subImm(VReg.RET, VReg.RET, 16);

        // 写入类型标记和值到 block 指针
        this.vm.movImm(VReg.V1, TYPE_FLOAT64);
        this.vm.store(VReg.RET, 0, VReg.V1);   // type at block+0
        this.vm.store(VReg.RET, 8, VReg.S0);   // value at block+8

        // 恢复 RET 为用户数据指针 (block + 16)
        this.vm.addImm(VReg.RET, VReg.RET, 16);
    },

    // 将 int64（寄存器中的整数值）按 JS Number 语义装箱成 Number 对象
    // 输入: intReg 包含 int64 整数值
    // 输出: RET 包含 Number 对象指针（user_ptr = block + 16，用于 _print_value 等）
    // 说明：内部会覆盖 intReg 的值
    boxIntAsNumber(intReg) {
        // 保存整数到 S0
        this.vm.mov(VReg.S0, intReg);

        // 分配 16 字节
        this.vm.movImm(VReg.A0, 16);
        this.vm.call("_alloc");
        // RET 现在是用户数据指针 (user_ptr = block + 16)

        // 保存 user_ptr 到 S2（用于最后返回）
        this.vm.mov(VReg.S2, VReg.RET);

        // 获取 block 指针用于存储
        this.vm.subImm(VReg.RET, VReg.RET, 16);  // RET = block

        // 写入类型标记 (TYPE_NUMBER = 13)
        this.vm.movImm(VReg.V1, 13);
        this.vm.store(VReg.RET, 0, VReg.V1);   // type at block+0
        // 写入整数值的原始位模式
        this.vm.store(VReg.RET, 8, VReg.S0);   // value at block+8 (raw int64 bits)

        // 返回 user_ptr（block + 16），_print_value 需要 user_ptr
        this.vm.mov(VReg.RET, VReg.S2);
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
    // 使用 fmovToInt 复制 float 位模式（不转换），然后用 boxNumber 存储
    boxFPAsNumber(fpIndex = 0) {
        // fmovToInt 将 FP 寄存器的位模式复制到整数寄存器（不转换）
        // 例如: fmovToInt x0, d0 将 d0 的 IEEE 754 位模式原样复制到 x0
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
        // 对于整数字面量，直接使用整数值
        if ((expr.type === "Literal" || expr.type === "NumericLiteral") && typeof expr.value === "number") {
            this.compileIntLiteral(expr.value);
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
        // 其他情况正常编译
        this.compileExpression(expr);
    },

    // 编译二元表达式
    compileBinaryExpression(expr) {
        const op = expr.operator;

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
                case "**":
                    result = a ** b;
                    break;
                default:
                    result = null;
            }
            if (result !== null) {
                if (typeof result === "boolean") {
                    // 返回 JS 布尔值 _js_true 或 _js_false
                    const boolLabel = result ? "_js_true" : "_js_false";
                    this.vm.lea(VReg.RET, boolLabel);
                    this.vm.load(VReg.RET, VReg.RET, 0);
                } else {
                    this.compileNumericLiteral(result);
                }
                return;
            }
        }

        // 字符串连接处理
        // 注意: JavaScript 的 + 运算符在以下情况进行字符串连接:
        // 1. 任一操作数是字符串
        // 2. 任一操作数是对象 (包括函数/闭包),需要 ToPrimitive 转换为字符串
        // 3. 任一操作数是复杂表达式 (CallExpression, MemberExpression) 返回 UNKNOWN
        // 注意: 简单变量 (Identifier) 即使类型是 UNKNOWN 也使用数值运算,
        // 因为局部变量通常是数值类型
        if (op === "+") {
            const leftType = inferType(expr.left, this.ctx);
            const rightType = inferType(expr.right, this.ctx);
            // 检查字符串、数组、对象类型都需要 string concat
            // JavaScript: [] + 0 → "" + "0" → "0", {} + 0 → "[object Object]" + "0" → "[object Object]0"
            if (leftType === Type.STRING || rightType === Type.STRING ||
                leftType === Type.ARRAY || rightType === Type.ARRAY ||
                leftType === Type.OBJECT || rightType === Type.OBJECT) {
                this.compileStringConcat(expr);
                return;
            }
            // UNKNOWN 类型的复杂表达式可能返回函数/对象,需要 string concat
            // 但简单变量 (Identifier) 通常是数值类型,使用数值运算
            // CallExpression 更常见的是数值结果，这里优先走数值路径，避免
            // `fn() + 1` 被过早降级为字符串拼接。
            const leftIsComplexUnknown = leftType === Type.UNKNOWN &&
                expr.left.type !== "Identifier" &&
                expr.left.type !== "CallExpression";
            const rightIsComplexUnknown = rightType === Type.UNKNOWN &&
                expr.right.type !== "Identifier" &&
                expr.right.type !== "CallExpression";
            if (leftIsComplexUnknown || rightIsComplexUnknown) {
                this.compileStringConcat(expr);
                return;
            }
        }

        // 检测是否为 int 类型运算
        const isIntOp = this.isIntExpression(expr.left) && this.isIntExpression(expr.right);

        // 对于 +, -, *, / 运算，根据类型选择浮点或整数运算
        // 注意: / 和 % 必须使用浮点运算，因为 JS 总是返回浮点数
        const isArithOp = ["+", "-", "*", "/"].includes(op);
        // 判断是否为需要浮点运算的操作（即使操作数是整数）
        const needsFloatDiv = ["/", "%"].includes(op);

        if (isIntOp && !needsFloatDiv) {
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
                // 比较运算也用整数比较
                case "<":
                    this.compileComparison("jlt");
                    return;
                case "<=":
                    this.compileComparison("jle");
                    return;
                case ">":
                    this.compileComparison("jgt");
                    return;
                case ">=":
                    this.compileComparison("jge");
                    return;
                case "==":
                    // 抽象相等：调用运行时函数
                    this.vm.mov(VReg.A0, VReg.RET); // 左操作数
                    this.vm.mov(VReg.A1, VReg.V1); // 右操作数
                    this.vm.call("_abstract_eq");
                    return;
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
                if (isIntType(opType)) {
                    // 整数字面量：直接转换为 float64 位模式
                    this.compileExpressionAsInt(operand);
                    this.intToFloat64Bits(VReg.RET);
                    return;
                } else if (opType === Type.BOOLEAN) {
                    // 布尔字面量：先转为整数，再转 float
                    // compileExpression 返回 JSValue boolean，转为整数后转 float
                    this.compileExpression(operand);
                    // 提取布尔值的实际位 (0 或 1)
                    // JSValue boolean: true = 0x7FF9000000000001, false = 0x7FF9000000000002
                    // 提取最低位: and V1, RET, #1
                    this.vm.andImm(VReg.V1, VReg.RET, 1);
                    // V1 现在是 0 或 1，转为 float64
                    this.intToFloat64Bits(VReg.V1);
                    this.vm.mov(VReg.RET, VReg.V1);
                    return;
                } else if (opType === Type.NULL) {
                    // null 字面量：ToNumber(null) = 0
                    // 返回 float64 0.0
                    this.vm.movImm(VReg.RET, 0);  // RET = 0
                    this.intToFloat64Bits(VReg.RET);  // 转为 0.0 的 float64 位模式
                    return;
                } else if (opType === Type.UNDEFINED) {
                    // undefined 字面量：ToNumber(undefined) = NaN
                    // 返回 NaN (all 1s in exponent, fraction != 0)
                    // NaN 的 float64 表示: 0x7FF8000000000000
                    const nanBits = floatToInt64Bits(NaN);
                    this.vm.movImm64(VReg.RET, BigInt(nanBits));
                    return;
                } else if (opType === Type.STRING) {
                    // 字符串字面量：需要转换为数字
                    // compileExpression 返回字符串指针
                    this.compileExpression(operand);
                    // 调用 _number_coerce 将字符串转换为数字
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_number_coerce");
                    return;
                } else {
                    // 非整数字面量（如 1.0）：compileExpression 已经返回原始 float 位模式
                    // 不要调用 unboxNumber，因为 raw bits 不是 Number 对象指针！
                    this.compileExpression(operand);
                    return;
                }
            }

            // 对于标识符，检查是否是未装箱的变量
            // 无论标识符最终落成 raw float、int32 JSValue 还是 heap Number，
            // 统一交给 _number_coerce 归一化，避免这里继续猜表示形态。
            if (operand.type === "Identifier") {
                this.compileExpression(operand);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_number_coerce");
                return;
            }

            // 对于一元表达式，检查是否是返回 raw bits 的情况
            // 统一走 _number_coerce，兼容 raw float、布尔、Number 对象等输入。
            if (operand.type === "UnaryExpression") {
                this.compileExpression(operand);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_number_coerce");
                return;
            }

            // 对于二元表达式，当前实现可能返回 raw float bits，也可能返回 heap Number。
            // 统一归一化成 float64 位模式。
            if (operand.type === "BinaryExpression") {
                this.compileExpression(operand);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_number_coerce");
                return;
            }

            // 函数调用返回值的表示也不稳定，统一交给运行时转换。
            if (operand.type === "CallExpression") {
                this.compileExpression(operand);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_number_coerce");
                return;
            }

            // 对于成员表达式（数组元素、对象属性），返回值是原始值
            // 需要调用 _number_coerce 正确转换为数字
            if (operand.type === "MemberExpression") {
                this.compileExpression(operand);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_number_coerce");
                return;
            }

            // 对于其他表达式，假设可能是 Number 对象
            // 编译后 unbox（unbox 假设值是 Number 对象指针）
            this.compileExpression(operand);
            this.unboxNumber(VReg.RET);
        };

        // 辅助函数：编译操作数为 JSValue（用于抽象相等比较）
        // 需要返回proper JSValue: int32 (tag 0), string (0x7FFC | ptr), float (raw bits), etc.
        const compileOperandAsJSValue = (operand) => {
            const opType = inferType(operand, this.ctx);

            // 对于 NumericLiteral，始终编译为 int32 JSValue
            // 这确保 == 比较时类型一致
            if (operand.type === "NumericLiteral") {
                // 整数字面量：编译为 int32 JSValue (tag 0)
                // int32 JSValue = 0x7FF8000000000000 | value
                this.compileExpressionAsInt(operand); // RET = value (raw int)
                // Box as int32 JSValue
                this.vm.movImm64(VReg.V0, 0x7FF8000000000000n);
                this.vm.or(VReg.RET, VReg.V0, VReg.RET);
                return;
            }

            // 对于其他字面量，根据类型处理
            if (operand.type === "Literal") {
                if (isIntType(opType) || opType === Type.FLOAT32 || opType === Type.FLOAT64) {
                    // 整数字面量：编译为 int32 JSValue (tag 0)
                    // int32 JSValue = 0x7FF8000000000000 | value
                    this.compileExpressionAsInt(operand); // RET = value (raw int)
                    // Box as int32 JSValue
                    this.vm.movImm64(VReg.V0, 0x7FF8000000000000n);
                    this.vm.or(VReg.RET, VReg.V0, VReg.RET);
                    return;
                } else {
                    // 浮点字面量：返回 raw float bits
                    this.compileExpression(operand);
                    return;
                }
            }

            // 对于标识符
            if (operand.type === "Identifier") {
                // 变量直接编译为 JSValue
                // 注意：不要在这里调用 _number_coerce！
                // _abstract_eq 会自动处理类型转换（如 Number == String）
                // 如果在这里调用 _number_coerce，会把字符串转换为 NaN，
                // 导致 _abstract_eq 无法正确处理 String == String 等情况
                this.compileExpression(operand);
                return;
            }

            // 对于一元表达式
            if (operand.type === "UnaryExpression") {
                this.compileExpression(operand);
                return;
            }

            // 对于二元表达式
            if (operand.type === "BinaryExpression") {
                this.compileExpression(operand);
                return;
            }

            // 对于其他表达式
            this.compileExpression(operand);
        };

        // 非整数类型的 == 和 != 需要使用 JSValue 抽象相等比较
        if (op === "==" || op === "!=") {
            // 编译右操作数为 JSValue
            compileOperandAsJSValue(expr.right);
            this.vm.push(VReg.RET);
            // 编译左操作数为 JSValue
            compileOperandAsJSValue(expr.left);
            this.vm.pop(VReg.V1);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.mov(VReg.A1, VReg.V1);
            this.vm.call("_abstract_eq");
            return;
        }

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

        // 位运算等使用整数运算
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
                case "&":
                case "|":
                case "^":
                case "<<":
                case ">>":
                case ">>>":
                    {
                        // 位运算：需要 ToInt32/ToUint32 强制转换
                        const isUnsigned = expr.operator === ">>>";
                        const coerceFunc = isUnsigned ? "_to_uint32" : "_to_int32";

                        // Coerce both operands to Int32/Uint32
                        // left is in RET, right is in V1 (both are JSValues)
                        this.vm.mov(VReg.S2, VReg.RET); // S2 = left JSValue
                        this.vm.mov(VReg.S3, VReg.V1);  // S3 = right JSValue

                        // Coerce left
                        this.vm.mov(VReg.A0, VReg.S2);
                        this.vm.call(coerceFunc);
                        this.vm.mov(VReg.S2, VReg.RET); // S2 = left int32/uint32

                        // Coerce right
                        this.vm.mov(VReg.A0, VReg.S3);
                        this.vm.call(coerceFunc);
                        this.vm.mov(VReg.V1, VReg.RET); // V1 = right int32/uint32
                        this.vm.mov(VReg.V0, VReg.S2);  // V0 = left int32/uint32

                        switch (expr.operator) {
                            case "&": this.vm.and(VReg.RET, VReg.V0, VReg.V1); break;
                            case "|": this.vm.or(VReg.RET, VReg.V0, VReg.V1); break;
                            case "^": this.vm.xor(VReg.RET, VReg.V0, VReg.V1); break;
                            case "<<": this.vm.shl(VReg.RET, VReg.V0, VReg.V1); break;
                            case ">>": this.vm.sar(VReg.RET, VReg.V0, VReg.V1); break; // 算术右移
                            case ">>>": this.vm.shr(VReg.RET, VReg.V0, VReg.V1); break; // 逻辑右移
                        }

                        // 将结果装箱为 int32 JSValue (tag 0)
                        this.vm.movImm64(VReg.V1, 0xFFFFFFFFn);
                        this.vm.and(VReg.RET, VReg.RET, VReg.V1); // 确保只有低 32 位
                        this.vm.movImm64(VReg.V1, 0x7FF8000000000000n); // JS_TAG_INT32_BASE
                        this.vm.or(VReg.RET, VReg.RET, VReg.V1);
                    }
                    break;
            case "<":
                this.compileComparison("jlt");
                break;
            case "<=":
                this.compileComparison("jle");
                break;
            case ">":
                this.compileComparison("jgt");
                break;
            case ">=":
                this.compileComparison("jge");
                break;
            case "==":
                // 抽象相等：需要 JSValue 类型的操作数
                // 编译右操作数为 JSValue
                compileOperandAsJSValue(expr.right);
                this.vm.push(VReg.RET);
                // 编译左操作数为 JSValue
                compileOperandAsJSValue(expr.left);
                this.vm.pop(VReg.V1);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.mov(VReg.A1, VReg.V1);
                this.vm.call("_abstract_eq");
                return;
            case "===":
                // 严格相等：需要 JSValue 类型的操作数
                // 编译右操作数为 JSValue
                compileOperandAsJSValue(expr.right);
                this.vm.push(VReg.RET);
                // 编译左操作数为 JSValue
                compileOperandAsJSValue(expr.left);
                this.vm.pop(VReg.V1);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.mov(VReg.A1, VReg.V1);
                this.vm.call("_strict_eq");
                return;
            case "!=":
                // 抽象不等：调用 _abstract_eq 然后取反
                {
                    // 重新编译操作数为 JSValue
                    this.compileExpression(expr.right);
                    this.vm.push(VReg.RET);
                    this.compileExpression(expr.left);
                    this.vm.pop(VReg.V1);
                    const isTrueLabel = this.ctx.newLabel("abs_neq_true");
                    const endLabel = this.ctx.newLabel("abs_neq_end");
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.mov(VReg.A1, VReg.V1);
                    this.vm.call("_abstract_eq");
                    // RET = JS_TRUE 或 JS_FALSE
                    // 如果是 JS_TRUE (payload=1)，!= 应该返回 false
                    // 否则返回 true
                    this.vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
                    this.vm.and(VReg.V0, VReg.RET, VReg.V0); // V0 = payload
                    this.vm.cmpImm(VReg.V0, 1); // payload == 1 means true
                    this.vm.jeq(isTrueLabel); // 如果是 true，!= 应该返回 false
                    // 否则返回 true
                    this.vm.lea(VReg.RET, "_js_true");
                    this.vm.load(VReg.RET, VReg.RET, 0);
                    this.vm.jmp(endLabel);
                    this.vm.label(isTrueLabel);
                    this.vm.lea(VReg.RET, "_js_false");
                    this.vm.load(VReg.RET, VReg.RET, 0);
                    this.vm.label(endLabel);
                }
                return;
            case "!==":
                // 严格不等：调用 _strict_eq 然后取反
                // 编译右操作数为 JSValue
                compileOperandAsJSValue(expr.right);
                this.vm.push(VReg.RET);
                // 编译左操作数为 JSValue
                compileOperandAsJSValue(expr.left);
                this.vm.pop(VReg.V1);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.mov(VReg.A1, VReg.V1);
                this.vm.call("_strict_eq");
                // RET = JS_TRUE 或 JS_FALSE
                // 如果是 JS_TRUE (payload=1)，!== 应该返回 false
                // 否则返回 true
                // JS_PAYLOAD_MASK = 0x0000ffffffffffff
                this.vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
                this.vm.and(VReg.V0, VReg.RET, VReg.V0); // V0 = payload
                this.vm.cmpImm(VReg.V0, 1); // payload == 1 means true
                const strictNeqFalseLabel = this.ctx.newLabel("strict_neq_false");
                this.vm.jeq(strictNeqFalseLabel);
                // 否则返回 true
                this.vm.lea(VReg.RET, "_js_true");
                this.vm.load(VReg.RET, VReg.RET, 0);
                const strictNeqEndLabel = this.ctx.newLabel("strict_neq_end");
                this.vm.jmp(strictNeqEndLabel);
                this.vm.label(strictNeqFalseLabel);
                this.vm.lea(VReg.RET, "_js_false");
                this.vm.load(VReg.RET, VReg.RET, 0);
                this.vm.label(strictNeqEndLabel);
                return;
            case "instanceof":
                // 左操作数在 RET，右操作数在 V1
                // 调用 _instanceof 运行时函数
                this.vm.mov(VReg.A0, VReg.RET); // 左操作数（实例）
                this.vm.mov(VReg.A1, VReg.V1); // 右操作数（构造函数）
                this.vm.call("_instanceof");
                break;
            case "in":
                // 检查属性是否在对象中: "prop" in obj
                // 左操作数在 RET（属性名，JSValue），右操作数在 V1（对象）
                // _prop_in 参数顺序: (obj, key) 并检查原型链
                // obj 需要是 unboxed 指针，key 需要是内容指针
                this.vm.mov(VReg.A0, VReg.RET); // A0 = key JSValue
                this.vm.call("_getStrContent"); // RET = content pointer
                this.vm.mov(VReg.A1, VReg.RET); // A1 = key content pointer
                this.vm.mov(VReg.A0, VReg.V1); // A0 = object JSValue
                this.vm.call("_js_unbox"); // RET = object pointer
                this.vm.mov(VReg.A0, VReg.RET); // A0 = object pointer
                this.vm.call("_prop_in");
                break;
            case "**":
                // 幂运算: left ** right
                // 确保依赖标准 C 库函数 pow 解决精度问题
                this.vm.asm.registerExternalSymbol && this.vm.asm.registerExternalSymbol("pow");
                this.vm.fmovToFloat(0, VReg.RET); // FP0 = base (left)
                this.vm.fmovToFloat(1, VReg.V1); // FP1 = exponent (right)
                
                // 调用外部的 _math_pow (由 runtime/core/math.js 提供)
                this.vm.call("_math_pow");
                // 将浮点数 D0 结果移动并转换为数值装箱
                this.vm.fmovToInt(VReg.RET, 0); 
                this.boxNumber(VReg.RET);
                break;
            default:
                console.warn("Unhandled binary operator:", expr.operator);
        }
    },

    // 编译比较运算
    compileComparison(jumpOp) {
        const trueLabel = this.ctx.newLabel("cmp_true");
        const endLabel = this.ctx.newLabel("cmp_end");

        this.vm.cmp(VReg.RET, VReg.V1);
        this.vm[jumpOp](trueLabel);
        // 比较结果为 false，返回 _js_false
        this.vm.lea(VReg.RET, "_js_false");
        this.vm.load(VReg.RET, VReg.RET, 0);
        this.vm.jmp(endLabel);
        this.vm.label(trueLabel);
        // 比较结果为 true，返回 _js_true
        this.vm.lea(VReg.RET, "_js_true");
        this.vm.load(VReg.RET, VReg.RET, 0);
        this.vm.label(endLabel);
    },

    // 编译逻辑表达式 (&&, ||)
    compileLogicalExpression(expr) {
        const endLabel = this.ctx.newLabel("logical_end");
        const rightLabel = this.ctx.newLabel("logical_right");

        // 编译左操作数
        this.compileExpression(expr.left);

        if (expr.operator === "&&") {
            // 对于 &&：如果左值为 _js_false（假），跳到结束（返回左值）
            // 否则继续执行右操作数
            // 注意：必须与 _js_false 值比较，而不是与整数 0 比较
            this.vm.lea(VReg.V1, "_js_false");
            this.vm.load(VReg.V1, VReg.V1, 0);  // V1 = _js_false
            this.vm.cmp(VReg.RET, VReg.V1);     // RET == _js_false?
            this.vm.jeq(endLabel);              // 如果是 false，跳到结束
            // 否则编译右操作数
            this.compileExpression(expr.right);
        } else if (expr.operator === "||") {
            // 对于 ||：如果左值不是 _js_false（真），跳到结束（返回左值）
            // 否则继续执行右操作数
            // 注意：必须与 _js_false 值比较，而不是与整数 0 比较
            this.vm.lea(VReg.V1, "_js_false");
            this.vm.load(VReg.V1, VReg.V1, 0);  // V1 = _js_false
            this.vm.cmp(VReg.RET, VReg.V1);     // RET == _js_false?
            this.vm.jne(endLabel);              // 如果不是 false（是真），跳到结束
            // 否则编译右操作数
            this.compileExpression(expr.right);
        }

        this.vm.label(endLabel);
    },

    // 编译一元表达式
    compileUnaryExpression(expr) {
        // 负数字面量的常量折叠：直接使用预计算的否定 bits
        // 这样可以避免运行时 FNEG 指令的问题
        if (expr.operator === "-" && (expr.argument.type === "Literal" || expr.argument.type === "NumericLiteral") && typeof expr.argument.value === "number") {
            const posValue = expr.argument.value;
            const posBits = floatToInt64Bits(posValue);
            const negBits = negateFloat64Bits(posBits);
            // 直接调用 addFloat64 使用预计算的 bits
            const label = this.asm.addFloat64(-posValue, negBits);
            this.vm.lea(VReg.RET, label);
            this.vm.load(VReg.RET, VReg.RET, 0);
            return;
        }

        // 常量折叠：typeof 数字字面量 = "number"
        if (expr.operator === "typeof" && (expr.argument.type === "Literal" || expr.argument.type === "NumericLiteral") && typeof expr.argument.value === "number") {
            const label = this.asm.addString("number");
            this.vm.lea(VReg.A0, label);
            this.vm.call("_js_box_string");
            return;
        }

        // 常量折叠：typeof 负数字面量 = "number" (typeof -17)
        if (expr.operator === "typeof" && expr.argument.type === "UnaryExpression" &&
            expr.argument.operator === "-" && (expr.argument.argument.type === "Literal" || expr.argument.argument.type === "NumericLiteral") &&
            typeof expr.argument.argument.value === "number") {
            const label = this.asm.addString("number");
            this.vm.lea(VReg.A0, label);
            this.vm.call("_js_box_string");
            return;
        }
        // 常量折叠：!字面量 - 在编译时计算
        if (expr.operator === "!" && (expr.argument.type === "Literal" || expr.argument.type === "NumericLiteral")) {
            const val = expr.argument.value;
            const isTruthy = Boolean(val);
            // !truthy = false, !falsy = true
            if (isTruthy) {
                this.vm.lea(VReg.RET, "_js_false");
                this.vm.load(VReg.RET, VReg.RET, 0);
            } else {
                this.vm.lea(VReg.RET, "_js_true");
                this.vm.load(VReg.RET, VReg.RET, 0);
            }
            return;
        }

        // 常量折叠：!标识符字面量 (undefined, NaN, Infinity)
        if (expr.operator === "!" && expr.argument.type === "Identifier") {
            if (expr.argument.name === "undefined" || expr.argument.name === "NaN") {
                // !undefined = true, !NaN = true
                this.vm.lea(VReg.RET, "_js_true");
                this.vm.load(VReg.RET, VReg.RET, 0);
                return;
            }
            if (expr.argument.name === "Infinity") {
                // !Infinity = false
                this.vm.lea(VReg.RET, "_js_false");
                this.vm.load(VReg.RET, VReg.RET, 0);
                return;
            }
        }

        this.compileExpression(expr.argument);

        switch (expr.operator) {
            case "-":
                // 检查是否是整数类型
                if (this.isIntExpression(expr)) {
                    // 整数类型：使用整数运算
                    this.vm.mov(VReg.V1, VReg.RET);
                    this.vm.movImm(VReg.RET, 0);
                    this.vm.sub(VReg.RET, VReg.RET, VReg.V1);
                } else {
                    // 浮点类型：使用浮点运算
                    // 将位模式移到浮点寄存器
                    this.vm.fmovToFloat(0, VReg.RET);
                    // 浮点取负
                    this.vm.fneg(0, 0);
                    // 移回整数寄存器
                    this.vm.fmovToInt(VReg.RET, 0);
                }
                break;
            case "!": {
                // NOT 操作符：返回 JS 布尔值 _js_false 或 _js_true
                // 需要正确处理所有 falsy 值: false, 0, -0, "", null, undefined, NaN
                // 使用 _to_boolean 运行时函数进行转换
                const notTruthyLabel = this.ctx.newLabel("not_truthy");
                const notEndLabel = this.ctx.newLabel("not_end");
                // 调用 _to_boolean: A0 = value, returns 0 (falsy) or 1 (truthy)
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_to_boolean");
                // RET = 0 (falsy) or 1 (truthy)
                this.vm.cmpImm(VReg.RET, 0);
                this.vm.jne(notTruthyLabel);
                // Value is falsy (RET==0), !falsy = true
                this.vm.lea(VReg.RET, "_js_true");
                this.vm.load(VReg.RET, VReg.RET, 0);
                this.vm.jmp(notEndLabel);
                // Value is truthy (RET==1), !truthy = false
                this.vm.label(notTruthyLabel);
                this.vm.lea(VReg.RET, "_js_false");
                this.vm.load(VReg.RET, VReg.RET, 0);
                this.vm.label(notEndLabel);
                break;
            }
            case "~":
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_to_int32");
                // RET = ToInt32(x)
                this.vm.not(VReg.RET, VReg.RET);
                // 将结果装箱为 int32 JSValue (tag 0)
                this.vm.movImm64(VReg.V1, 0xFFFFFFFFn);
                this.vm.and(VReg.RET, VReg.RET, VReg.V1); // 确保只有低 32 位
                this.vm.movImm64(VReg.V1, 0x7FF8000000000000n); // JS_TAG_INT32_BASE
                this.vm.or(VReg.RET, VReg.RET, VReg.V1);
                break;
            case "+":
                // 一元加号：将值转换为数字（调用 _number_coerce 正确处理所有类型）
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_number_coerce");
                break;
            case "typeof":
                // 注意：参数表达式已在 switch 之前的 compileExpression 中编译，结果在 RET 中
                // 直接调用 _typeof 即可（RET 已经是我们要检查的值）
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_typeof");
                break;
            case "void":
                // void 运算符：计算表达式但返回 undefined
                // 先计算表达式（已经在 RET 中）
                // 然后返回 undefined
                // 加载 undefined 值到 RET
                this.vm.lea(VReg.RET, "_js_undefined");
                this.vm.load(VReg.RET, VReg.RET, 0);
                break;
        }
    },

    // 编译条件表达式 a ? b : c
    compileConditionalExpression(expr) {
        const elseLabel = this.ctx.newLabel("cond_else");
        const endLabel = this.ctx.newLabel("cond_end");

        this.compileExpression(expr.test);
        // 提取布尔值的实际位（0 或 1）进行比较
        this.vm.andImm(VReg.RET, VReg.RET, 1);
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
        this.vm.push(VReg.RET);

        // 弹出左侧到 A0，右侧到 A1 (_strconcat expects A0=left, A1=right)
        this.vm.pop(VReg.A0);
        this.vm.pop(VReg.A1);
        this.vm.call("_strconcat");
    },

    // 编译表达式并转换为字符串
    compileExpressionToString(expr) {
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
            // 注意：compileExpression 对于 NumericLiteral 返回 raw float64 bits，
            // 对于变量/其他表达式返回 Number 对象指针（需要从 offset 8 加载）
            // 对于 BinaryExpression，算术运算返回 raw 数值（int 或 float），不是指针
            this.compileExpression(expr);
            // 检查是否是 NumericLiteral - 直接返回 float64 bits，不需要 load
            if (expr.type === "NumericLiteral" || expr.type === "Literal") {
                // NumericLiteral: RET 已经是 float64 bits
                // 检查是否是整数（没有小数部分）
                if (typeof expr.value === "number" && !Number.isInteger(expr.value)) {
                    // 浮点数：调用 _floatToString
                    // _floatToString 期望 float bits in A0
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_floatToString");
                } else {
                    // 整数：调用 _intToStr
                    // 先将 float bits 转为整数
                    this.vm.fmovToFloat(0, VReg.RET);
                    this.vm.fcvtzs(VReg.A0, 0);
                    this.vm.call("_intToStr");
                }
            } else if (expr.type === "BinaryExpression") {
                // BinaryExpression 算术结果：RET 是 raw 数值（int 或 float），直接使用
                // INT64 结果需要先转 float
                if (isIntType(type)) {
                    // INT64: 先转为 float64 位
                    this.intToFloat64Bits(VReg.RET);
                    this.vm.fmovToFloat(0, VReg.RET);
                } else {
                    // FLOAT64/NUMBER: 已经是 float bits
                    this.vm.fmovToFloat(0, VReg.RET);
                }
                this.vm.fcvtzs(VReg.A0, 0);
                this.vm.call("_intToStr");
            } else {
                // Number 对象：需要从 offset 8 加载 float64 位
                // Number 对象布局: [type:8][float64_bits:8]
                this.vm.load(VReg.V0, VReg.RET, 8);
                this.vm.fmovToFloat(0, VReg.V0);
                this.vm.fcvtzs(VReg.A0, 0);
                this.vm.call("_intToStr");
            }
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
