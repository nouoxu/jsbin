// JSBin 编译器 - 赋值表达式编译
// 编译各类赋值：简单赋值、复合赋值、成员赋值、更新表达式

import { VReg } from "../../vm/index.js";
import { Type } from "../core/types.js";
// 赋值编译方法混入
export const AssignmentCompiler = {
    // 编译赋值表达式
    compileAssignmentExpression(expr) {
        // 检查 expr.right 是否存在
        if (!expr.right) {
            console.log("[ERROR] Assignment expression has null right side");
            console.log("  operator:", expr.operator);
            console.log("  left:", JSON.stringify(expr.left, null, 2).slice(0, 200));
            throw new Error("Assignment expression has null right side");
        }
        if (expr.left.type === "Identifier") {
            const name = expr.left.name;
            const offset = this.ctx.getLocal(name);

            // 检查是否是主程序被捕获的变量（从全局位置访问）
            const globalLabel = this.ctx.getMainCapturedVar(name);

            if (offset === undefined && !globalLabel) return;

            const op = expr.operator;
            const isBoxed = this.ctx.boxedVars && this.ctx.boxedVars.has(name);

            // 简单赋值
            if (op === "=") {
                this.compileExpression(expr.right);

                if (globalLabel && offset === undefined) {
                    // 主程序被捕获变量的赋值（在顶层函数中）
                    this.vm.mov(VReg.V1, VReg.RET); // 保存要存的值
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0); // 加载 box 指针
                    this.vm.store(VReg.V2, 0, VReg.V1); // 存入 box
                    this.vm.mov(VReg.RET, VReg.V1); // 返回值
                } else if (isBoxed) {
                    // 装箱变量：先加载 box 指针，然后存值到 box
                    this.vm.mov(VReg.V1, VReg.RET); // 保存要存的值
                    this.vm.load(VReg.V2, VReg.FP, offset); // 加载 box 指针
                    this.vm.store(VReg.V2, 0, VReg.V1); // 存入 box
                    this.vm.mov(VReg.RET, VReg.V1); // 返回值
                } else {
                    this.vm.store(VReg.FP, offset, VReg.RET);
                }
                return;
            }

            // 逻辑赋值运算符 (ES2021)
            if (op === "&&=" || op === "||=" || op === "??=") {
                const endLabel = this.ctx.newLabel("assign_end");

                // 读取当前值
                if (globalLabel && offset === undefined) {
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0); // 加载 box 指针
                    this.vm.load(VReg.RET, VReg.V2, 0); // 读取值
                } else if (isBoxed) {
                    this.vm.load(VReg.V2, VReg.FP, offset); // box 指针
                    this.vm.load(VReg.RET, VReg.V2, 0); // 值
                } else {
                    this.vm.load(VReg.RET, VReg.FP, offset);
                }

                if (op === "&&=") {
                    // x &&= y => x && (x = y)
                    // 如果 x 为假，不赋值，返回 x
                    this.vm.cmpImm(VReg.RET, 0);
                    this.vm.jeq(endLabel);
                } else if (op === "||=") {
                    // x ||= y => x || (x = y)
                    // 如果 x 为真，不赋值，返回 x
                    this.vm.cmpImm(VReg.RET, 0);
                    this.vm.jne(endLabel);
                } else {
                    // x ??= y => x ?? (x = y)
                    // 如果 x 不是 null/undefined，不赋值，返回 x

                    const doAssignLabel = this.ctx.newLabel("assign_do");
                    const notNullLabel = this.ctx.newLabel("assign_not_null");

                    // 检查是否为 null (0x7FFA000000000000)
                    this.vm.movImm64(VReg.V1, "0x7ffa000000000000");
                    this.vm.cmp(VReg.RET, VReg.V1);
                    this.vm.jeq(doAssignLabel); // 是 null，执行赋值

                    // 检查是否为 undefined (0x7FFB000000000000)
                    this.vm.movImm64(VReg.V1, "0x7ffb000000000000");
                    this.vm.cmp(VReg.RET, VReg.V1);
                    this.vm.jne(endLabel); // 既不是 null 也不是 undefined，跳过赋值

                    this.vm.label(doAssignLabel);
                    // 执行赋值...
                }

                // 执行赋值
                this.compileExpression(expr.right);
                if (globalLabel && offset === undefined) {
                    this.vm.lea(VReg.V2, globalLabel);
                    this.vm.load(VReg.V2, VReg.V2, 0); // 加载 box 指针
                    this.vm.store(VReg.V2, 0, VReg.RET);
                } else if (isBoxed) {
                    this.vm.load(VReg.V2, VReg.FP, offset);
                    this.vm.store(VReg.V2, 0, VReg.RET);
                } else {
                    this.vm.store(VReg.FP, offset, VReg.RET);
                }

                this.vm.label(endLabel);
                return;
            }

            // 复合赋值运算符
            if (globalLabel && offset === undefined) {
                // 主程序被捕获变量
                this.vm.lea(VReg.V3, globalLabel);
                this.vm.load(VReg.V3, VReg.V3, 0); // 加载 box 指针
                this.vm.push(VReg.V3); // 保存 box 指针
                this.vm.load(VReg.RET, VReg.V3, 0); // 当前值
            } else if (isBoxed) {
                this.vm.load(VReg.V3, VReg.FP, offset); // box 指针
                this.vm.push(VReg.V3); // 保存 box 指针
                this.vm.load(VReg.RET, VReg.V3, 0); // 当前值
            } else {
                this.vm.load(VReg.RET, VReg.FP, offset);
            }
            this.vm.push(VReg.RET);
            this.compileExpression(expr.right);
            this.vm.pop(VReg.V1);

            switch (op) {
                case "+=":
                case "-=":
                case "*=":
                case "/=":
                case "%=":
                    // 算术复合赋值：需要处理 NaN-boxed Number 对象
                    // V1 = 左操作数（当前值 NaN-boxed），RET = 右操作数（NaN-boxed）
                    // 使用 callee-saved 寄存器保存中间值（因为函数调用会破坏 V0-V7）

                    // 先解包右操作数并保存到 S0
                    this.vm.push(VReg.V1); // 保存左操作数到栈
                    this.unboxNumber(VReg.RET); // RET = 右操作数 float64 bits
                    this.vm.mov(VReg.S0, VReg.RET); // S0 = 右操作数 float bits (callee-saved)

                    // 恢复并解包左操作数
                    this.vm.pop(VReg.RET); // RET = 左操作数（NaN-boxed）
                    this.unboxNumber(VReg.RET); // RET = 左操作数 float64 bits
                    // S0 仍然保持不变（callee-saved）

                    // 执行浮点运算
                    this.vm.fmovToFloat(0, VReg.RET); // FP0 = left
                    this.vm.fmovToFloat(1, VReg.S0); // FP1 = right
                    if (op === "+=") {
                        this.vm.fadd(0, 0, 1);
                    } else if (op === "-=") {
                        this.vm.fsub(0, 0, 1);
                    } else if (op === "*=") {
                        this.vm.fmul(0, 0, 1);
                    } else if (op === "/=") {
                        this.vm.fdiv(0, 0, 1);
                    } else if (op === "%=") {
                        // 取模需要特殊处理，使用浮点除法和截断
                        this.vm.fdiv(2, 0, 1); // FP2 = a / b
                        this.vm.fmovToInt(VReg.V2, 2);
                        this.vm.fcvtzs(VReg.V2, 2); // V2 = trunc(a/b)
                        this.vm.scvtf(2, VReg.V2); // FP2 = trunc(a/b) as float
                        this.vm.fmul(2, 2, 1); // FP2 = trunc(a/b) * b
                        this.vm.fsub(0, 0, 2); // FP0 = a - trunc(a/b) * b
                    }

                    // 结果打包为 Number 对象
                    this.vm.fmovToInt(VReg.RET, 0); // RET = result float64 bits
                    this.boxNumber(VReg.RET);
                    break;
                case "&=":
                    this.vm.and(VReg.RET, VReg.V1, VReg.RET);
                    break;
                case "|=":
                    this.vm.or(VReg.RET, VReg.V1, VReg.RET);
                    break;
                case "^=":
                    this.vm.xor(VReg.RET, VReg.V1, VReg.RET);
                    break;
                case "<<=":
                    this.vm.shl(VReg.RET, VReg.V1, VReg.RET);
                    break;
                case ">>=":
                    this.vm.shr(VReg.RET, VReg.V1, VReg.RET);
                    break;
                case ">>>=":
                    // 无符号右移赋值（暂时使用有符号右移，因为 JS 的 >>> 在 NaN-boxing 环境下需要特殊处理）
                    this.vm.shr(VReg.RET, VReg.V1, VReg.RET);
                    break;
                default:
                    console.warn("Unhandled assignment operator:", op);
                    return;
            }

            if (globalLabel && offset === undefined) {
                // 主程序被捕获变量
                this.vm.pop(VReg.V2); // 恢复 box 指针
                this.vm.store(VReg.V2, 0, VReg.RET);
            } else if (isBoxed) {
                this.vm.pop(VReg.V2); // 恢复 box 指针
                this.vm.store(VReg.V2, 0, VReg.RET);
            } else {
                this.vm.store(VReg.FP, offset, VReg.RET);
            }
        } else if (expr.left.type === "MemberExpression") {
            // 成员表达式赋值：arr[idx] = value 或 obj.prop = value
            this.compileMemberAssignment(expr);
        }
    },

    // 编译成员赋值表达式 arr[idx] = value 或 obj.prop = value
    compileMemberAssignment(expr) {
        const member = expr.left;
        const op = expr.operator;

        if (op !== "=") {
            // 复合赋值：obj.prop += value
            this.compileMemberCompoundAssignment(expr);
            return;
        }

        if (member.computed) {
            // 数组元素赋值：arr[idx] = value
            // 使用 _subscript_set 统一处理 Array 和 TypedArray
            if (member.property.type === "Literal" && typeof member.property.value === "number") {
                // 静态索引：arr[0] = value
                const idx = Math.trunc(member.property.value);

                // 先编译数组对象
                this.compileExpression(member.object);
                const arrTempName = `__arr_assign_${this.nextLabelId()}`;
                const arrOffset = this.ctx.allocLocal(arrTempName);
                this.vm.store(VReg.FP, arrOffset, VReg.RET);

                // 编译要赋的值
                this.compileExpression(expr.right);
                // 注意：RET = A0 = X0，所以要先保存 value 再加载 arr
                const valTempName = `__val_assign_${this.nextLabelId()}`;
                const valOffset = this.ctx.allocLocal(valTempName);
                this.vm.store(VReg.FP, valOffset, VReg.RET);

                // 调用 _subscript_set(arr, idx, value)
                this.vm.load(VReg.A0, VReg.FP, arrOffset); // arr
                this.vm.movImm(VReg.A1, idx); // index
                this.vm.load(VReg.A2, VReg.FP, valOffset); // value
                this.vm.call("_subscript_set");
            } else if (member.property.type === "Literal" && typeof member.property.value === "string") {
                // 静态字符串键：obj["key"] = value
                const propLabel = this.asm.addString(member.property.value);

                // 先编译对象
                this.compileExpression(member.object);
                const objTempName = `__obj_assign_${this.nextLabelId()}`;
                const objOffset = this.ctx.allocLocal(objTempName);
                this.vm.store(VReg.FP, objOffset, VReg.RET);

                // 编译要赋的值
                this.compileExpression(expr.right);
                const valTempName = `__val_assign_${this.nextLabelId()}`;
                const valOffset = this.ctx.allocLocal(valTempName);
                this.vm.store(VReg.FP, valOffset, VReg.RET);

                // 调用 _object_set(obj, key, value)
                this.vm.load(VReg.A0, VReg.FP, objOffset); // obj
                this.vm.lea(VReg.A1, propLabel); // key (C string)
                this.vm.load(VReg.A2, VReg.FP, valOffset); // value
                this.vm.call("_object_set");
            } else {
                // 动态索引：arr[i] = value 或 obj[key] = value
                // 使用 _dynamic_subscript_set，它能在运行时检查 key 类型
                // 先编译索引 (保持为 JSValue，不做类型转换)
                this.compileExpression(member.property);
                const idxTempName = `__idx_assign_${this.nextLabelId()}`;
                const idxOffset = this.ctx.allocLocal(idxTempName);
                this.vm.store(VReg.FP, idxOffset, VReg.RET);

                // 编译数组对象
                this.compileExpression(member.object);
                const arrTempName = `__arr_assign_${this.nextLabelId()}`;
                const arrOffset = this.ctx.allocLocal(arrTempName);
                this.vm.store(VReg.FP, arrOffset, VReg.RET);

                // 编译要赋的值
                this.compileExpression(expr.right);
                // 注意：RET = A0 = X0，所以要先保存 value 再加载 arr
                const valTempName = `__val_assign_${this.nextLabelId()}`;
                const valOffset = this.ctx.allocLocal(valTempName);
                this.vm.store(VReg.FP, valOffset, VReg.RET);

                // 调用 _dynamic_subscript_set(arr, key, value)
                this.vm.load(VReg.A0, VReg.FP, arrOffset); // arr
                this.vm.load(VReg.A1, VReg.FP, idxOffset); // key (JSValue)
                this.vm.load(VReg.A2, VReg.FP, valOffset); // value
                this.vm.call("_dynamic_subscript_set");
            }
        } else {
            // 对象属性赋值：obj.prop = value
            const propName = member.property.name || member.property.value;
            const propLabel = this.asm.addString(propName);

            // 先编译对象
            this.compileExpression(member.object);
            const objTempName = `__obj_assign_${this.nextLabelId()}`;
            const objOffset = this.ctx.allocLocal(objTempName);
            this.vm.store(VReg.FP, objOffset, VReg.RET);

            // 编译要赋的值
            this.compileExpression(expr.right);

            // 调用 _object_set_prop(obj, key, value, thisArg)
            // 这个函数会检查 setter，如果存在就调用 setter
            // 注意：RET 和 A0 都是 X0，所以要先 mov A2 再 load A0
            this.vm.mov(VReg.A2, VReg.RET); // value (先移动，因为 load A0 会覆盖 X0)
            this.vm.load(VReg.A0, VReg.FP, objOffset); // obj
            this.vm.lea(VReg.A1, propLabel); // key
            this.vm.load(VReg.A3, VReg.FP, objOffset); // thisArg = obj 本身
            this.vm.call("_object_set_prop");
        }
    },

    // 编译成员复合赋值表达式 obj.prop += value
    compileMemberCompoundAssignment(expr) {
        const member = expr.left;
        const op = expr.operator;

        if (member.computed) {
            // 数组元素复合赋值：arr[idx] += value
            // 先获取当前值，进行运算，再设置
            if (member.property.type === "Literal" && typeof member.property.value === "number") {
                // 静态索引：arr[0] += value
                const idx = Math.trunc(member.property.value);

                // 编译数组对象
                this.compileExpression(member.object);
                const arrTempName = `__arr_cmp_${this.nextLabelId()}`;
                const arrOffset = this.ctx.allocLocal(arrTempName);
                this.vm.store(VReg.FP, arrOffset, VReg.RET);

                // 获取当前值：_subscript_get(arr, idx)
                this.vm.mov(VReg.A0, VReg.RET); // arr
                this.vm.movImm(VReg.A1, idx); // index
                this.vm.call("_subscript_get");
                // 保存当前值
                this.vm.push(VReg.RET);

                // 编译右值
                this.compileExpression(expr.right);
                this.vm.pop(VReg.V1); // V1 = 当前值，RET = 右值

                // 进行复合运算
                this.compileCompoundOp(op, VReg.V1, VReg.RET);

                // 设置新值：_subscript_set(arr, idx, value)
                const valTempName = `__val_cmp_${this.nextLabelId()}`;
                const valOffset = this.ctx.allocLocal(valTempName);
                this.vm.store(VReg.FP, valOffset, VReg.RET);

                this.vm.load(VReg.A0, VReg.FP, arrOffset); // arr
                this.vm.movImm(VReg.A1, idx); // index
                this.vm.load(VReg.A2, VReg.FP, valOffset); // value
                this.vm.call("_subscript_set");
            } else {
                // 动态索引：arr[i] += value
                // 编译索引
                this.compileExpression(member.property);
                const idxTempName = `__idx_cmp_${this.nextLabelId()}`;
                const idxOffset = this.ctx.allocLocal(idxTempName);
                this.numberToIntInPlace(VReg.RET);
                this.vm.store(VReg.FP, idxOffset, VReg.RET);

                // 编译数组对象
                this.compileExpression(member.object);
                const arrTempName = `__arr_cmp_${this.nextLabelId()}`;
                const arrOffset = this.ctx.allocLocal(arrTempName);
                this.vm.store(VReg.FP, arrOffset, VReg.RET);

                // 获取当前值：_subscript_get(arr, idx)
                this.vm.mov(VReg.A0, VReg.RET); // arr
                this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
                this.vm.call("_subscript_get");
                // 保存当前值
                this.vm.push(VReg.RET);

                // 编译右值
                this.compileExpression(expr.right);
                this.vm.pop(VReg.V1); // V1 = 当前值，RET = 右值

                // 进行复合运算
                this.compileCompoundOp(op, VReg.V1, VReg.RET);

                // 设置新值
                const valTempName = `__val_cmp_${this.nextLabelId()}`;
                const valOffset = this.ctx.allocLocal(valTempName);
                this.vm.store(VReg.FP, valOffset, VReg.RET);

                this.vm.load(VReg.A0, VReg.FP, arrOffset); // arr
                this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
                this.vm.load(VReg.A2, VReg.FP, valOffset); // value
                this.vm.call("_subscript_set");
            }
        } else {
            // 对象属性复合赋值：obj.prop += value
            const propName = member.property.name || member.property.value;
            const propLabel = this.asm.addString(propName);

            // 编译对象
            this.compileExpression(member.object);
            const objTempName = `__obj_cmp_${this.nextLabelId()}`;
            const objOffset = this.ctx.allocLocal(objTempName);
            this.vm.store(VReg.FP, objOffset, VReg.RET);

            // 获取当前值：_object_get_prop(obj, key)
            this.vm.mov(VReg.A0, VReg.RET); // obj
            this.vm.lea(VReg.A1, propLabel); // key
            this.vm.call("_object_get_prop");
            // 保存当前值
            this.vm.push(VReg.RET);

            // 编译右值
            this.compileExpression(expr.right);
            this.vm.pop(VReg.V1); // V1 = 当前值，RET = 右值

            // 进行复合运算
            this.compileCompoundOp(op, VReg.V1, VReg.RET);

            // 设置新值：_object_set_prop(obj, key, value, thisArg)
            this.vm.mov(VReg.A2, VReg.RET); // value
            this.vm.load(VReg.A0, VReg.FP, objOffset); // obj
            this.vm.lea(VReg.A1, propLabel); // key
            this.vm.load(VReg.A3, VReg.FP, objOffset); // thisArg = obj
            this.vm.call("_object_set_prop");
        }
    },

    // 编译复合赋值操作：result = left op right
    compileCompoundOp(op, leftReg, rightReg) {
        switch (op) {
            case "+=":
                this.vm.add(VReg.RET, leftReg, rightReg);
                break;
            case "-=":
                this.vm.sub(VReg.RET, leftReg, rightReg);
                break;
            case "*=":
                this.vm.mul(VReg.RET, leftReg, rightReg);
                break;
            case "/=":
                this.vm.div(VReg.RET, leftReg, rightReg);
                break;
            case "%=":
                this.vm.mod(VReg.RET, leftReg, rightReg);
                break;
            case "&=":
                this.vm.and(VReg.RET, leftReg, rightReg);
                break;
            case "|=":
                this.vm.or(VReg.RET, leftReg, rightReg);
                break;
            case "^=":
                this.vm.xor(VReg.RET, leftReg, rightReg);
                break;
            case "<<=":
                this.vm.shl(VReg.RET, leftReg, rightReg);
                break;
            case ">>=":
                this.vm.shr(VReg.RET, leftReg, rightReg);
                break;
            case ">>>=":
                this.vm.shr(VReg.RET, leftReg, rightReg);
                break;
            default:
                console.warn("Unhandled compound assignment operator:", op);
                this.vm.mov(VReg.RET, leftReg);
        }
    },

    // 编译更新表达式 (++, --)
    compileUpdateExpression(expr) {
        if (expr.argument.type === "Identifier") {
            const name = expr.argument.name;
            const offset = this.ctx.getLocal(name);
            if (offset !== undefined) {
                const isBoxed = this.ctx.boxedVars && this.ctx.boxedVars.has(name);
                const isInt = this.ctx.isIntVar(name);

                if (isBoxed) {
                    // 装箱变量
                    this.vm.load(VReg.V2, VReg.FP, offset); // box 指针
                    this.vm.load(VReg.RET, VReg.V2, 0); // 当前值

                    if (expr.prefix) {
                        if (isInt) {
                            // int 类型：使用整数运算
                            if (expr.operator === "++") {
                                this.vm.addImm(VReg.RET, VReg.RET, 1);
                            } else {
                                this.vm.subImm(VReg.RET, VReg.RET, 1);
                            }
                        } else {
                            // float 类型：使用浮点运算
                            this.compileFloatIncDec(expr.operator === "++");
                        }
                        this.vm.store(VReg.V2, 0, VReg.RET);
                    } else {
                        this.vm.mov(VReg.V1, VReg.RET); // 保存原值
                        if (isInt) {
                            if (expr.operator === "++") {
                                this.vm.addImm(VReg.V1, VReg.V1, 1);
                            } else {
                                this.vm.subImm(VReg.V1, VReg.V1, 1);
                            }
                        } else {
                            this.vm.mov(VReg.RET, VReg.V1);
                            this.compileFloatIncDec(expr.operator === "++");
                            this.vm.mov(VReg.V1, VReg.RET);
                            this.vm.load(VReg.RET, VReg.V2, 0); // 恢复原值到 RET
                        }
                        this.vm.store(VReg.V2, 0, VReg.V1);
                        // RET 保持原值
                    }
                } else {
                    // 普通变量
                    this.vm.load(VReg.RET, VReg.FP, offset);
                    if (expr.prefix) {
                        if (isInt) {
                            if (expr.operator === "++") {
                                this.vm.addImm(VReg.RET, VReg.RET, 1);
                            } else {
                                this.vm.subImm(VReg.RET, VReg.RET, 1);
                            }
                        } else {
                            this.compileFloatIncDec(expr.operator === "++");
                        }
                        this.vm.store(VReg.FP, offset, VReg.RET);
                    } else {
                        this.vm.mov(VReg.V1, VReg.RET);
                        if (isInt) {
                            if (expr.operator === "++") {
                                this.vm.addImm(VReg.V1, VReg.V1, 1);
                            } else {
                                this.vm.subImm(VReg.V1, VReg.V1, 1);
                            }
                        } else {
                            this.vm.mov(VReg.RET, VReg.V1);
                            this.compileFloatIncDec(expr.operator === "++");
                            this.vm.mov(VReg.V1, VReg.RET);
                            this.vm.load(VReg.RET, VReg.FP, offset); // 恢复原值
                        }
                        this.vm.store(VReg.FP, offset, VReg.V1);
                    }
                }
            }
        } else if (expr.argument.type === "MemberExpression") {
            // 处理成员表达式的自增/自减，如 this.count++ 或 obj.prop--
            const member = expr.argument;

            // 先读取当前值
            this.compileExpression(member);

            // 保存对象引用到临时槽位（用于后续写回）
            const objTempName = `__update_obj_${this.nextLabelId()}`;
            const objOffset = this.ctx.allocLocal(objTempName);
            const valTempName = `__update_val_${this.nextLabelId()}`;
            const valOffset = this.ctx.allocLocal(valTempName);

            // 保存原始值
            this.vm.store(VReg.FP, valOffset, VReg.RET);

            // 重新计算对象引用并保存
            this.compileExpression(member.object);
            this.vm.store(VReg.FP, objOffset, VReg.RET);

            // 加载原始值，执行自增/自减
            this.vm.load(VReg.RET, VReg.FP, valOffset);

            if (expr.prefix) {
                // 前缀 ++x：先增，返回新值
                this.compileFloatIncDec(expr.operator === "++");
                this.vm.mov(VReg.S0, VReg.RET); // 保存新值（用于写回和返回）
            } else {
                // 后缀 x++：先返回原值，再增
                this.vm.mov(VReg.S0, VReg.RET); // 保存原值作为返回值
                this.compileFloatIncDec(expr.operator === "++");
                // RET 现在是新值，需要写回
                this.vm.mov(VReg.S1, VReg.RET); // S1 = 新值
            }

            // 写回新值到对象属性
            // _object_set(obj, key, value)
            this.vm.load(VReg.A0, VReg.FP, objOffset); // obj
            if (member.computed) {
                // obj[key]
                this.vm.push(VReg.S0);
                this.vm.push(VReg.S1);
                this.compileExpression(member.property);
                this.vm.mov(VReg.A1, VReg.RET);
                this.vm.pop(VReg.S1);
                this.vm.pop(VReg.S0);
            } else {
                // obj.prop
                const propName = member.property.name;
                this.vm.lea(VReg.A1, this.addStringConstant(propName));
            }
            if (expr.prefix) {
                this.vm.mov(VReg.A2, VReg.S0); // 前缀：新值
            } else {
                this.vm.mov(VReg.A2, VReg.S1); // 后缀：新值
            }
            this.vm.call("_object_set");

            // 返回正确的值
            this.vm.mov(VReg.RET, VReg.S0);
        }
    },

    // 编译浮点自增/自减 (Number 对象版本)
    // RET 包含当前 Number 对象指针（可能是 NaN-boxed），结果是新的 Number 对象指针存回 RET
    compileFloatIncDec(isIncrement) {
        // 使用 VM 的统一浮点接口
        // 1. 先 unbox 获取原始堆指针
        this.vm.mov(VReg.A0, VReg.RET);
        // 2. 从 Number 对象加载 float64 位
        this.vm.load(VReg.V0, VReg.RET, 8); // V0 = float64 位
        this.vm.fmovToFloat(0, VReg.V0); // FP0 = float

        // 2. 加载 1.0 到 FP1 (IEEE 754: 0x3ff0_0000_0000_0000)
        this.vm.movImm(VReg.V1, 0x3ff00000);
        this.vm.shl(VReg.V1, VReg.V1, 32);
        this.vm.fmovToFloat(1, VReg.V1);

        // 3. 执行加法或减法
        if (isIncrement) {
            this.vm.fadd(0, 0, 1);
        } else {
            this.vm.fsub(0, 0, 1);
        }

        // 4. 移回整数寄存器，保存到 S0
        this.vm.fmovToInt(VReg.S0, 0);

        // 5. 统一走 boxNumber，避免在各处重复手写装箱逻辑
        this.boxNumber(VReg.S0);
    },
};
