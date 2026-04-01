// JSBin 编译器 - 赋值表达式编译
// 编译各类赋值：简单赋值、复合赋值、成员赋值、更新表达式

import { VReg } from "../../vm/index.js";
import { Type } from "../core/types.js";
// 赋值编译方法混入
export const AssignmentCompiler = {
    // 编译赋值表达式
    compileAssignmentExpression(expr) {
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

                // 二元表达式（算术运算和字符串连接）返回 raw bits 或 NaN-boxed，
                // 不是 boxed Number，不需要 unbox
                // 注意：compileExpression 对 +,-,*,/ 已经返回 raw bits

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
                this.syncModuleExportBinding(name, VReg.RET);
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
                    this.emitUninitializedBindingGuard(name, VReg.RET);
                } else if (isBoxed) {
                    this.vm.load(VReg.V2, VReg.FP, offset); // box 指针
                    this.vm.load(VReg.RET, VReg.V2, 0); // 值
                    this.emitUninitializedBindingGuard(name, VReg.RET);
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
                    // 简化：检查 x !== 0 (null/undefined = 0)
                    this.vm.cmpImm(VReg.RET, 0);
                    this.vm.jne(endLabel);
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
                this.syncModuleExportBinding(name, VReg.RET);

                this.vm.label(endLabel);
                return;
            }

            // 复合赋值运算符
            // 对于算术运算符 (+=, -=, *=, /=)，需要区分整数运算和浮点运算
            const isArithOp = (op === "+=" || op === "-=" || op === "*=" || op === "/=");
            const isUnboxedArith = !isBoxed && !globalLabel && isArithOp;

            if (globalLabel && offset === undefined) {
                // 主程序被捕获变量
                this.vm.lea(VReg.V3, globalLabel);
                this.vm.load(VReg.V3, VReg.V3, 0); // 加载 box 指针
                this.vm.push(VReg.V3); // 保存 box 指针
                this.vm.load(VReg.RET, VReg.V3, 0); // 当前值
                this.emitUninitializedBindingGuard(name, VReg.RET);
            } else if (isBoxed) {
                this.vm.load(VReg.V3, VReg.FP, offset); // box 指针
                this.vm.push(VReg.V3); // 保存 box 指针
                this.vm.load(VReg.RET, VReg.V3, 0); // 当前值
                this.emitUninitializedBindingGuard(name, VReg.RET);
            } else if (isUnboxedArith) {
                // 无装箱的变量且是算术运算符：使用浮点运算
                this.vm.load(VReg.V1, VReg.FP, offset); // V1 = 左操作数 raw bits
            } else {
                this.vm.load(VReg.RET, VReg.FP, offset);
            }

            if (isUnboxedArith) {
                // 浮点运算路径
                this.vm.fmovToFloat(0, VReg.V1); // FP0 = 左操作数
                this.compileExpression(expr.right); // RET = 右操作数 raw bits
                this.vm.fmovToFloat(1, VReg.RET); // FP1 = 右操作数

                switch (op) {
                    case "+=":
                        this.vm.fadd(0, 0, 1);
                        break;
                    case "-=":
                        this.vm.fsub(0, 0, 1);
                        break;
                    case "*=":
                        this.vm.fmul(0, 0, 1);
                        break;
                    case "/=":
                        this.vm.fdiv(0, 0, 1);
                        break;
                }
                // 将结果移回整数寄存器
                this.vm.fmovToInt(VReg.RET, 0);
                // 存储回 slot
                this.vm.store(VReg.FP, offset, VReg.RET);
            } else {
                this.vm.push(VReg.RET);
                this.compileExpression(expr.right);
                this.vm.pop(VReg.V1);

                switch (op) {
                    case "+=":
                        this.vm.add(VReg.RET, VReg.V1, VReg.RET);
                        break;
                    case "-=":
                        this.vm.sub(VReg.RET, VReg.V1, VReg.RET);
                        break;
                    case "*=":
                        this.vm.mul(VReg.RET, VReg.V1, VReg.RET);
                        break;
                    case "/=":
                        this.vm.div(VReg.RET, VReg.V1, VReg.RET);
                        break;
                    case "%=":
                        this.vm.mod(VReg.RET, VReg.V1, VReg.RET);
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
                this.syncModuleExportBinding(name, VReg.RET);
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
            // 复合赋值暂不支持，可以后续添加
            console.warn("Compound assignment to member not yet supported:", op);
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
            } else {
                // 动态索引：arr[i] = value
                // 先编译索引
                this.compileExpression(member.property);
                const idxTempName = `__idx_assign_${this.nextLabelId()}`;
                const idxOffset = this.ctx.allocLocal(idxTempName);
                this.numberToIntInPlace(VReg.RET); // 转换为整数
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

                // 调用 _subscript_set(arr, idx, value)
                this.vm.load(VReg.A0, VReg.FP, arrOffset); // arr
                this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
                this.vm.load(VReg.A2, VReg.FP, valOffset); // value
                this.vm.call("_subscript_set");
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

            // 调用 _object_set(obj, key, value)
            // 注意：RET 和 A0 都是 X0，所以要先 mov A2 再 load A0
            this.vm.mov(VReg.A2, VReg.RET); // value (先移动，因为 load A0 会覆盖 X0)
            this.vm.load(VReg.A0, VReg.FP, objOffset); // obj
            // Box the property key label as a JSValue string (TAG_STRING_BASE = 0x7FFC...)
            this.vm.lea(VReg.A1, propLabel);
            this.vm.movImm64(VReg.V1, 0x7ffc000000000000n);
            this.vm.or(VReg.A1, VReg.A1, VReg.V1);
            this.vm.call("_object_set");


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
                    this.emitUninitializedBindingGuard(name, VReg.RET);

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
                        this.syncModuleExportBinding(name, VReg.RET);
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
                        this.syncModuleExportBinding(name, VReg.V1);
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
                            // float 类型：使用浮点运算 (unboxed 直接操作 raw bits)
                            this.vm.fmovToFloat(0, VReg.RET); // FP0 = float bits
                            // 加载 1.0 到 FP1
                            this.vm.movImm(VReg.V1, 0x3ff00000);
                            this.vm.shl(VReg.V1, VReg.V1, 32);
                            this.vm.fmovToFloat(1, VReg.V1);
                            // 执行加法或减法
                            if (expr.operator === "++") {
                                this.vm.fadd(0, 0, 1);
                            } else {
                                this.vm.fsub(0, 0, 1);
                            }
                            // 移回整数寄存器
                            this.vm.fmovToInt(VReg.RET, 0);
                        }
                        this.vm.store(VReg.FP, offset, VReg.RET);
                        this.syncModuleExportBinding(name, VReg.RET);
                    } else {
                        // 后置：先保存原值
                        this.vm.mov(VReg.V1, VReg.RET);
                        if (isInt) {
                            if (expr.operator === "++") {
                                this.vm.addImm(VReg.V1, VReg.V1, 1);
                            } else {
                                this.vm.subImm(VReg.V1, VReg.V1, 1);
                            }
                        } else {
                            // float 类型：使用浮点运算 (unboxed 直接操作 raw bits)
                            this.vm.fmovToFloat(0, VReg.V1); // FP0 = original value bits
                            // 加载 1.0 到 FP1
                            this.vm.movImm(VReg.V2, 0x3ff00000);
                            this.vm.shl(VReg.V2, VReg.V2, 32);
                            this.vm.fmovToFloat(1, VReg.V2);
                            // 执行加法或减法
                            if (expr.operator === "++") {
                                this.vm.fadd(0, 0, 1);
                            } else {
                                this.vm.fsub(0, 0, 1);
                            }
                            // 移回整数寄存器到 V1 (V1 会被存回)
                            this.vm.fmovToInt(VReg.V1, 0);
                            // RET 已经保存原值，无需额外操作
                        }
                        this.vm.store(VReg.FP, offset, VReg.V1);
                        this.syncModuleExportBinding(name, VReg.V1);
                        // RET 保持原值（后置表达式的值）
                    }
                }
            }
        }
    },

    // 编译浮点自增/自减 (Number 对象版本)
    // RET 包含当前 Number 对象指针，结果是新的 Number 对象指针存回 RET
    compileFloatIncDec(isIncrement) {
        // 使用 VM 的统一浮点接口
        // 1. 从 Number 对象加载 float64 位
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
