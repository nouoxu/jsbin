// JSBin 编译器 - 函数和复合类型编译（聚合模块）
// 导入并组合所有函数相关的编译器

import { VReg } from "../../vm/index.js";
import { Type, inferType } from "../core/types.js";

// 导入拆分的模块
import { BuiltinMethodCompiler } from "./builtin_methods.js";
import { DataStructureCompiler } from "./data_structures.js";
import { ClosureCompiler } from "./closures.js";
import { ASYNC_CLOSURE_MAGIC, isAsyncFunction } from "../async/index.js";

// 闭包魔数 - 用于区分普通函数指针和闭包对象
const CLOSURE_MAGIC = 0xc105;

// 函数和复合类型编译方法混入 - 聚合所有函数相关的编译器
export const FunctionCompiler = {
    // 从各模块混入方法
    ...BuiltinMethodCompiler,
    ...DataStructureCompiler,
    ...ClosureCompiler,

    // 推断对象类型（用于方法调用分派）
    inferObjectType(obj) {
        const type = inferType(obj, this.ctx);
        switch (type) {
            case Type.MAP:
                return "Map";
            case Type.SET:
                return "Set";
            case Type.DATE:
                return "Date";
            case Type.REGEXP:
                return "RegExp";
            case Type.ARRAY:
                return "Array";
            case Type.TYPED_ARRAY:
                return "TypedArray";
            case Type.BUFFER:
                return "Buffer";
            case Type.OBJECT:
                return "Object";
            case Type.STRING:
                return "String";
            case Type.GENERATOR:
                return "Generator";
            case Type.BIGINT:
                return "BigInt";
            case Type.NUMBER:
            case Type.FLOAT64:
            case Type.INT64:
            case Type.INT:
                return "Number";
            default:
                return "unknown";
        }
    },

    // 判断表达式是否返回布尔值
    isBooleanExpression(expr) {
        // 比较表达式
        if (expr.type === "BinaryExpression") {
            const op = expr.operator;
            if (["<", ">", "<=", ">=", "==", "===", "!=", "!==", "instanceof", "in"].includes(op)) {
                return true;
            }
        }
        // 逻辑非
        if (expr.type === "UnaryExpression" && expr.operator === "!") {
            return true;
        }
        // 方法调用返回布尔值的情况
        if (expr.type === "CallExpression" && expr.callee.type === "MemberExpression") {
            const methodName = expr.callee.property.name;
            // Map 和 Set 的 has() 和 delete() 返回布尔值
            // Array 的 includes() 返回布尔值
            // RegExp 的 test() 返回布尔值
            if (["has", "delete", "includes", "test"].includes(methodName)) {
                return true;
            }
        }
        return false;
    },

    // 判断标识符是否是内置模块的命名空间导入
    // 例如 `import * as fs from "fs"` 中的 `fs`
    isBuiltinModuleNamespace(name, moduleName) {
        // 检查是否是导入的符号
        if (this.isImportedSymbol && this.isImportedSymbol(name)) {
            const importInfo = this.getImportedSymbol(name);
            if (importInfo && importInfo.type === "namespace" && importInfo.source === moduleName) {
                return true;
            }
        }
        // 直接匹配名称（用于简单情况）
        if (name === moduleName) {
            return true;
        }
        return false;
    },

    // 编译 console.log/warn/error 的打印输出
    // 这个方法抽取了 console.log 的打印逻辑，便于 warn 和 error 复用
    compileConsolePrint(args) {
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            const isLast = i === args.length - 1;

            // 根据参数类型选择打印方法
            if (arg.type === "Literal") {
                if (typeof arg.value === "string") {
                    // 字符串字面量 - 使用 _print_value 来处理 NaN-boxed 字符串
                    this.compileExpression(arg);
                    this.vm.mov(VReg.A0, VReg.RET);
                    if (isLast) {
                        this.vm.call("_print_value");
                    } else {
                        this.vm.call("_print_value_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (typeof arg.value === "number") {
                    // 数字字面量 - 现在是 boxed Number 对象
                    this.compileExpression(arg);
                    this.vm.mov(VReg.A0, VReg.RET);
                    if (isLast) {
                        this.vm.call("_print_number");
                    } else {
                        this.vm.call("_print_number_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (typeof arg.value === "boolean") {
                    // 布尔字面量 - 打印 "true" 或 "false"
                    if (arg.value) {
                        this.vm.lea(VReg.A0, "_str_true");
                    } else {
                        this.vm.lea(VReg.A0, "_str_false");
                    }
                    if (isLast) {
                        this.vm.call("_print_str");
                    } else {
                        this.vm.call("_print_str_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (typeof arg.value === "bigint" || arg.bigint) {
                    // BigInt 字面量 - 使用 _print_bigint
                    this.compileExpression(arg);
                    this.vm.mov(VReg.A0, VReg.RET);
                    if (isLast) {
                        this.vm.call("_print_bigint");
                    } else {
                        this.vm.call("_print_bigint_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (arg.value === null) {
                    // null
                    this.vm.lea(VReg.A0, "_str_null");
                    if (isLast) {
                        this.vm.call("_print_str");
                    } else {
                        this.vm.call("_print_str_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (arg.value === undefined) {
                    // undefined
                    this.vm.lea(VReg.A0, "_str_undefined");
                    if (isLast) {
                        this.vm.call("_print_str");
                    } else {
                        this.vm.call("_print_str_no_nl");
                        this.vm.call("_print_space");
                    }
                } else {
                    // 其他未知字面量
                    this.compileExpression(arg);
                    this.vm.mov(VReg.A0, VReg.RET);
                    if (isLast) {
                        this.vm.call("_print_value");
                    } else {
                        this.vm.call("_print_value_no_nl");
                        this.vm.call("_print_space");
                    }
                }
            } else if (arg.type === "Identifier" && arg.name === "undefined") {
                // undefined 标识符
                this.vm.lea(VReg.A0, "_str_undefined");
                if (isLast) {
                    this.vm.call("_print_str");
                } else {
                    this.vm.call("_print_str_no_nl");
                    this.vm.call("_print_space");
                }
            } else if (arg.type === "Identifier" && (arg.name === "true" || arg.name === "false")) {
                // true/false 标识符
                if (arg.name === "true") {
                    this.vm.lea(VReg.A0, "_str_true");
                } else {
                    this.vm.lea(VReg.A0, "_str_false");
                }
                if (isLast) {
                    this.vm.call("_print_str");
                } else {
                    this.vm.call("_print_str_no_nl");
                    this.vm.call("_print_space");
                }
            } else if (arg.type === "Identifier") {
                console.log(`[ID_DEBUG] Processing identifier: ${arg.name}`);
                // 标识符 - 检查是否是导入/导出的变量
                if (this.isImportedSymbol && this.isImportedSymbol(arg.name)) {
                    const importInfo = this.getImportedSymbol(arg.name);
                    this.compileExpression(arg);
                    this.vm.mov(VReg.A0, VReg.RET);
                    if (importInfo && importInfo.type === "variable") {
                        // 导入的变量假定为数字类型
                        if (isLast) {
                            this.vm.call("_print_number");
                        } else {
                            this.vm.call("_print_number_no_nl");
                            this.vm.call("_print_space");
                        }
                    } else {
                        // 其他导入类型
                        if (isLast) {
                            this.vm.call("_print_value");
                        } else {
                            this.vm.call("_print_value_no_nl");
                            this.vm.call("_print_space");
                        }
                    }
                } else {
                    // 普通标识符 - 使用类型推断
                    const argType = inferType(arg, this.ctx);
                    console.log(`[BIGINT_DEBUG] Identifier ${arg.name} type = ${argType}`);
                    this.compileExpression(arg);
                    this.vm.mov(VReg.A0, VReg.RET);
                    const isNumberType = argType === Type.NUMBER || argType === Type.INT8 || argType === Type.INT16 || argType === Type.INT32 || argType === Type.INT64 || argType === Type.UINT8 || argType === Type.UINT16 || argType === Type.UINT32 || argType === Type.UINT64 || argType === Type.FLOAT32 || argType === Type.FLOAT64;
                    if (isNumberType) {
                        if (isLast) {
                            this.vm.call("_print_number");
                        } else {
                            this.vm.call("_print_number_no_nl");
                            this.vm.call("_print_space");
                        }
                    } else if (argType === Type.BIGINT) {
                        // BigInt 类型使用 _print_bigint
                        if (isLast) {
                            this.vm.call("_print_bigint");
                        } else {
                            this.vm.call("_print_bigint_no_nl");
                            this.vm.call("_print_space");
                        }
                    } else {
                        if (isLast) {
                            this.vm.call("_print_value");
                        } else {
                            this.vm.call("_print_value_no_nl");
                            this.vm.call("_print_space");
                        }
                    }
                }
            } else if (arg.type === "UnaryExpression" && arg.operator === "-") {
                // 负数表达式（如 -2.5）- boxed Number
                this.compileExpression(arg);
                this.vm.mov(VReg.A0, VReg.RET);
                if (isLast) {
                    this.vm.call("_print_number");
                } else {
                    this.vm.call("_print_number_no_nl");
                    this.vm.call("_print_space");
                }
            } else if (this.isBooleanExpression(arg)) {
                // 返回布尔值的表达式 (如 s.has(), m.has(), 比较表达式等)
                this.compileExpression(arg);
                this.vm.mov(VReg.A0, VReg.RET);
                if (isLast) {
                    this.vm.call("_print_bool");
                } else {
                    this.vm.call("_print_bool_no_nl");
                    this.vm.call("_print_space");
                }
            } else {
                // 其他表达式（变量、函数调用等）
                // 使用静态类型推断来选择打印函数
                const argType = inferType(arg, this.ctx);
                this.compileExpression(arg);
                this.vm.mov(VReg.A0, VReg.RET);

                // 检查是否是数字类型
                const isNumberType = argType === Type.NUMBER || argType === Type.INT8 || argType === Type.INT16 || argType === Type.INT32 || argType === Type.INT64 || argType === Type.UINT8 || argType === Type.UINT16 || argType === Type.UINT32 || argType === Type.UINT64 || argType === Type.FLOAT32 || argType === Type.FLOAT64;

                // 对于用户定义函数（不包括导入的函数），假设返回数字类型
                const isUserFunctionCall = arg.type === "CallExpression" && arg.callee && arg.callee.type === "Identifier" && this.ctx.hasFunction(arg.callee.name);

                // 对于导入的函数调用，使用 _print_value 进行运行时类型检测
                const isImportedFunctionCall = arg.type === "CallExpression" && arg.callee && arg.callee.type === "Identifier" && this.isImportedSymbol && this.isImportedSymbol(arg.callee.name);

                // 检查是否是导入的数字变量
                const isImportedVariable = arg.type === "Identifier" && this.isImportedSymbol && this.isImportedSymbol(arg.name);
                const importedVarInfo = isImportedVariable ? this.getImportedSymbol(arg.name) : null;
                const isImportedNumberVariable = importedVarInfo && importedVarInfo.type === "variable";

                // 调试：打印变量信息
                if (arg.type === "Identifier") {
                    console.log(`[PRINT_DEBUG] arg=${arg.name}, isImportedVariable=${isImportedVariable}, importedVarInfo=${JSON.stringify(importedVarInfo)}, isImportedNumberVariable=${isImportedNumberVariable}`);
                }

                if (isImportedFunctionCall) {
                    // 导入的函数，使用运行时类型检测
                    if (isLast) {
                        this.vm.call("_print_value");
                    } else {
                        this.vm.call("_print_value_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (isNumberType || isUserFunctionCall || isImportedNumberVariable) {
                    // 数字类型使用 _print_number（包括导入的数字变量）
                    if (isLast) {
                        this.vm.call("_print_number");
                    } else {
                        this.vm.call("_print_number_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (argType === Type.BOOLEAN) {
                    // 布尔类型使用 _print_bool
                    if (isLast) {
                        this.vm.call("_print_bool");
                    } else {
                        this.vm.call("_print_bool_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (argType === Type.BIGINT) {
                    // BigInt 类型使用 _print_bigint
                    if (isLast) {
                        this.vm.call("_print_bigint");
                    } else {
                        this.vm.call("_print_bigint_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (argType === Type.STRING) {
                    // 字符串类型 - 现在字符串是 NaN-boxed 的，使用 _print_value
                    if (isLast) {
                        this.vm.call("_print_value");
                    } else {
                        this.vm.call("_print_value_no_nl");
                        this.vm.call("_print_space");
                    }
                } else if (argType === Type.ARRAY) {
                    // 数组类型
                    if (isLast) {
                        this.vm.call("_print_array");
                    } else {
                        this.vm.call("_print_array_no_nl");
                        this.vm.call("_print_space");
                    }
                } else {
                    // 其他类型使用运行时类型检测
                    if (isLast) {
                        this.vm.call("_print_value");
                    } else {
                        this.vm.call("_print_value_no_nl");
                        this.vm.call("_print_space");
                    }
                }
            }
        }
    },

    // 编译 Generator 方法调用
    compileGeneratorMethod(obj, methodName, args) {
        const vm = this.vm;

        // 编译 Generator 对象
        this.compileExpression(obj);
        vm.mov(VReg.A0, VReg.RET);

        if (methodName === "next") {
            // g.next(value) -> { value, done }
            if (args && args.length > 0) {
                vm.push(VReg.A0); // 保存 generator
                this.compileExpression(args[0]);
                vm.mov(VReg.A1, VReg.RET);
                vm.pop(VReg.A0);
            } else {
                // 没有参数时传 undefined
                vm.lea(VReg.A1, "_js_undefined");
                vm.load(VReg.A1, VReg.A1, 0);
            }
            vm.call("_generator_next");
            return true;
        } else if (methodName === "return") {
            // g.return(value) -> { value, done: true }
            if (args && args.length > 0) {
                vm.push(VReg.A0);
                this.compileExpression(args[0]);
                vm.mov(VReg.A1, VReg.RET);
                vm.pop(VReg.A0);
            } else {
                vm.lea(VReg.A1, "_js_undefined");
                vm.load(VReg.A1, VReg.A1, 0);
            }
            vm.call("_generator_return");
            return true;
        } else if (methodName === "throw") {
            // g.throw(error)
            if (args && args.length > 0) {
                vm.push(VReg.A0);
                this.compileExpression(args[0]);
                vm.mov(VReg.A1, VReg.RET);
                vm.pop(VReg.A0);
            } else {
                vm.lea(VReg.A1, "_js_undefined");
                vm.load(VReg.A1, VReg.A1, 0);
            }
            vm.call("_generator_throw");
            return true;
        }

        return false;
    },

    // 编译函数参数 - 先全部压栈，再统一弹出到参数寄存器
    // 前 6 个参数通过寄存器 A0-A5 传递
    // 超过 6 个的参数通过栈传递（在调用指令前压栈）
    // 返回栈传递的参数数量，调用者需要在调用后清理栈
    compileCallArguments(args) {
        const regArgCount = Math.min(args.length, 6); // 寄存器传递的参数数量
        const stackArgCount = Math.max(0, args.length - 6); // 栈传递的参数数量

        // 先处理栈传递的参数（倒序压栈，这样在被调用函数中正序访问）
        // 参数 6, 7, 8... 需要按这个顺序在栈上
        for (let i = args.length - 1; i >= 6; i--) {
            if (args[i] === null) {
                console.log("[compileCallArguments] Warning: null argument at index", i, "total args:", args.length);
                // 使用 undefined 替代 null 参数
                this.vm.movImm64(VReg.RET, "0x7ffb000000000000");
            } else {
                this.compileExpression(args[i]);
            }
            this.vm.push(VReg.RET);
        }

        // 再编译寄存器传递的参数并压栈（逆序，因为栈是LIFO）
        for (let i = regArgCount - 1; i >= 0; i--) {
            if (args[i] === null) {
                console.log("[compileCallArguments] Warning: null argument at index", i, "total args:", args.length);
                // 使用 undefined 替代 null 参数
                this.vm.movImm64(VReg.RET, "0x7ffb000000000000");
            } else {
                this.compileExpression(args[i]);
            }
            this.vm.push(VReg.RET);
        }

        // 按顺序弹出到参数寄存器
        for (let i = 0; i < regArgCount; i++) {
            this.vm.pop(this.vm.getArgReg(i));
        }

        // 栈上的参数保持在栈上，被调用函数会通过 FP 偏移访问
        // 返回栈参数数量，调用者负责在调用后清理
        return stackArgCount;
    },

    // 清理调用后的栈参数
    cleanupStackArgs(stackArgCount) {
        if (stackArgCount > 0) {
            // 每个栈参数占 16 字节（因为 push 使用 stpPre 对齐到 16）
            this.vm.addImm(VReg.SP, VReg.SP, stackArgCount * 16);
        }
    },

    // 编译 async 顶层函数调用
    // 创建协程并返回 Promise
    // 简化版：直接执行函数，将结果包装成 Promise
    compileAsyncFunctionCall(funcName, args) {
        const vm = this.vm;

        // 真正的 async：创建协程并返回 Promise
        vm.lea(VReg.V1, "_user_" + funcName);
        this.compileAsyncCall(VReg.V1, args);
    },

    // 编译闭包调用 - 处理可能是闭包对象或普通函数指针的情况
    // funcReg: 存放函数指针或闭包对象的寄存器 (可能是 NaN-boxed)
    // 调用约定: A0-A5=参数, S0=闭包指针
    compileClosureCall(funcReg, args) {
        const vm = this.vm;

        // 保存函数指针/闭包对象到栈
        vm.push(funcReg);

        // 编译参数到 A0-A5
        this.compileCallArguments(args);

        // 恢复函数指针/闭包对象并 unbox
        vm.pop(VReg.A0); // 可能是 NaN-boxed
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // S0 = 原始堆指针

        // 检查是否是 async 闭包（magic == 0xA51C）
        const notAsyncLabel = this.ctx.newLabel("not_async");
        const asyncCallLabel = this.ctx.newLabel("async_call");
        const notClosureLabel = this.ctx.newLabel("not_closure");
        const callLabel = this.ctx.newLabel("do_call");

        // 检查是否为 null/0，防止从地址 0 读取
        const nullFuncLabel = this.ctx.newLabel("null_func");
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(nullFuncLabel);

        // 加载第一个 8 字节（magic）到 S1
        vm.load(VReg.S1, VReg.S0, 0);

        // 先检查是否是 async 闘包
        vm.movImm(VReg.S2, ASYNC_CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jeq(asyncCallLabel);

        // 检查是否是普通闭包（magic == 0xC105）
        vm.movImm(VReg.S2, CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jne(notClosureLabel);

        // 是普通闭包对象：加载真正的函数指针到 S1，S0 保持闭包对象指针
        vm.load(VReg.S1, VReg.S0, 8); // func_ptr
        // S0 作为闭包指针传给函数（通过 S0 寄存器）
        vm.jmp(callLabel);

        // async 闭包调用：创建协程 + 返回 Promise
        vm.label(asyncCallLabel);
        this.compileAsyncClosureCall(args);
        // 返回，RET = Promise
        const asyncDoneLabel = this.ctx.newLabel("async_done");
        vm.jmp(asyncDoneLabel);

        vm.label(notClosureLabel);
        // 不是闭包对象：S0 就是函数指针，复制到 S1
        vm.mov(VReg.S1, VReg.S0);
        vm.movImm(VReg.S0, 0); // 清空闭包指针

        vm.label(callLabel);
        // 通过 S1 间接调用（不能用 V6 因为它映射到 X6 = A5+1）
        vm.callIndirect(VReg.S1);
        vm.jmp(asyncDoneLabel);

        vm.label(nullFuncLabel);
        // 函数指针为 null，返回 undefined (NaN-boxed)
        vm.movImm64(VReg.RET, "0x7ffb000000000000");

        vm.label(asyncDoneLabel);
    },

    // 编译方法调用 - 类似闭包调用但传递 this
    // funcReg: 存放函数指针或闭包对象的寄存器
    // thisReg: 存放 this 对象 (NaN-boxed) 的寄存器
    // 调用约定: A0-A4=参数, V5=this (解包后的指针), S0=闭包指针
    compileMethodCall(funcReg, thisReg, args) {
        const vm = this.vm;

        // 保存 this 和函数指针到栈
        vm.push(thisReg);
        vm.push(funcReg);

        // 编译参数并压栈（逆序，因为栈是 LIFO）
        // 参数将从 A0 开始，所以最多 5 个参数 (A0-A4)
        const argCount = Math.min(args.length, 5);
        for (let i = argCount - 1; i >= 0; i--) {
            this.compileExpression(args[i]);
            vm.push(VReg.RET);
        }

        // 恢复函数指针和 this
        // 方案：用临时寄存器保存参数值
        if (argCount > 0) vm.pop(VReg.S4); // arg0
        if (argCount > 1) vm.pop(VReg.S5); // arg1
        if (argCount > 2) vm.pop(VReg.V6); // arg2
        if (argCount > 3) vm.pop(VReg.V7); // arg3
        // argCount > 4 暂不处理

        vm.pop(VReg.A0); // 函数指针/闭包 (可能是 NaN-boxed)
        vm.pop(VReg.S3); // this 对象 (NaN-boxed)
        vm.push(VReg.S3); // 暂存 this
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // S0 = 原始函数指针/闭包
        vm.pop(VReg.S3); // 恢复 this (NaN-boxed)

        // 解包 this 到 S2
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_js_unbox");
        vm.mov(VReg.S2, VReg.RET); // S2 = 解包后的 this 指针

        // 检查是否是闭包
        const notClosureLabel = this.ctx.newLabel("method_not_closure");
        const callLabel = this.ctx.newLabel("method_do_call");
        const nullFuncLabel = this.ctx.newLabel("method_null_func");

        // 检查是否为 null/0
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(nullFuncLabel);

        // 加载 magic
        vm.load(VReg.S1, VReg.S0, 0);
        vm.movImm(VReg.V0, CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.V0);
        vm.jne(notClosureLabel);

        // 是闭包：加载函数指针，保持 S0 作为闭包指针
        vm.load(VReg.S1, VReg.S0, 8);
        vm.jmp(callLabel);

        vm.label(notClosureLabel);
        // 不是闭包：S0 就是函数指针
        vm.mov(VReg.S1, VReg.S0);
        vm.movImm(VReg.S0, 0);

        vm.label(callLabel);
        // 设置参数寄存器：A0-A4=参数, V5=this
        if (argCount > 0) vm.mov(VReg.A0, VReg.S4); // arg0
        if (argCount > 1) vm.mov(VReg.A1, VReg.S5); // arg1
        if (argCount > 2) vm.mov(VReg.A2, VReg.V6); // arg2
        if (argCount > 3) vm.mov(VReg.A3, VReg.V7); // arg3
        // this 通过 V5 传递（compileFunctionBody 会从 V5 读取）
        vm.mov(VReg.V5, VReg.S2);

        vm.callIndirect(VReg.S1);

        const methodDoneLabel = this.ctx.newLabel("method_done");
        vm.jmp(methodDoneLabel);

        vm.label(nullFuncLabel);
        // 函数指针为 null，返回 undefined (NaN-boxed)
        vm.movImm64(VReg.RET, "0x7ffb000000000000");

        vm.label(methodDoneLabel);
    },

    // 编译 async 闭包调用
    // S0 = async 闭包对象
    // 参数已在 A0-A5 寄存器中
    compileAsyncClosureCall(args) {
        const vm = this.vm;

        // S0 = async 闭包对象
        // 保存第一个参数（如果有）
        if (args && args.length > 0) {
            vm.push(VReg.A0);
        }

        // 加载函数指针
        vm.load(VReg.S1, VReg.S0, 8); // func_ptr
        vm.push(VReg.S0); // 保存闭包指针
        vm.push(VReg.S1); // 保存函数指针

        // 创建协程
        vm.pop(VReg.A0); // func_ptr
        if (args && args.length > 0) {
            // 恢复第一个参数
            vm.load(VReg.A1, VReg.SP, 8); // arg 在栈上
        } else {
            vm.movImm(VReg.A1, 0);
        }
        // closure_ptr = S0 (async 闭包对象)
        vm.mov(VReg.A2, VReg.S0);
        vm.call("_coroutine_create");
        vm.mov(VReg.S2, VReg.RET); // S2 = 协程

        // 将闭包指针存入协程（可选：用于访问捕获变量）
        vm.pop(VReg.S0); // 恢复闭包指针
        // 可在协程中通过 S0 访问闭包

        // 创建 Promise
        vm.movImm(VReg.A0, 0);
        vm.call("_promise_new");
        vm.mov(VReg.S3, VReg.RET); // S3 = Promise

        // 关联协程和 Promise
        vm.store(VReg.S2, 88, VReg.S3); // coro.promise = Promise

        // 将协程加入调度队列
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_scheduler_spawn");

        // 清理栈（如果有参数）
        if (args && args.length > 0) {
            vm.addImm(VReg.SP, VReg.SP, 8);
        }

        // 返回 Promise
        vm.mov(VReg.RET, VReg.S3);
    },

    // 编译 super() 调用
    compileSuperCall(args) {
        const superClass = this.ctx.superClass;
        if (!superClass) {
            console.warn("super() called outside of a subclass constructor");
            this.vm.movImm(VReg.RET, 0);
            return;
        }

        // 获取父类构造函数标签
        let parentClassInfo = this.ctx.classes[superClass];

        // 如果不在本地类注册表中，检查是否是导入的类
        if (!parentClassInfo && this.isImportedSymbol && this.isImportedSymbol(superClass)) {
            const importInfo = this.getImportedSymbol(superClass);
            if (importInfo && importInfo.type === "class") {
                parentClassInfo = {
                    constructorLabel: importInfo.constructorLabel,
                    classInfoLabel: importInfo.classInfoLabel,
                };
            }
        }

        // 处理内置类 (Error, TypeError 等)
        if (!parentClassInfo) {
            const builtinClasses = ["Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError"];
            if (builtinClasses.includes(superClass)) {
                parentClassInfo = {
                    constructorLabel: `_class_${superClass}`,
                    classInfoLabel: `_class_info_${superClass}`,
                };
            }
        }

        if (!parentClassInfo) {
            console.warn("Parent class not found:", superClass);
            this.vm.movImm(VReg.RET, 0);
            return;
        }

        const parentConstructorLabel = parentClassInfo.constructorLabel;

        // 加载 this (从 __this)
        const thisOffset = this.ctx.getLocal("__this");
        if (thisOffset === undefined) {
            console.warn("__this not found in super() call");
            this.vm.movImm(VReg.RET, 0);
            return;
        }
        this.vm.load(VReg.A0, VReg.FP, thisOffset); // A0 = this

        // 编译参数（从 A1 开始）
        for (let i = 0; i < (args || []).length; i++) {
            this.vm.push(VReg.A0); // 保存 this
            this.compileExpression(args[i]);
            this.vm.mov(this.vm.getArgReg(i + 1), VReg.RET);
            this.vm.pop(VReg.A0); // 恢复 this
        }

        // 调用父类构造函数
        this.vm.call(parentConstructorLabel);

        // super() 的返回值是 this（已经初始化）
        this.vm.load(VReg.RET, VReg.FP, thisOffset);
    },

    // 编译函数调用
    compileCallExpression(expr) {
        const callee = expr.callee;

        // 处理 super() 调用
        if (callee.type === "SuperExpression") {
            this.compileSuperCall(expr.arguments);
            return;
        }

        // 内置函数处理
        if (callee.type === "Identifier") {
            if (callee.name === "print") {
                // print 支持多参数，类似 console.log
                if (expr.arguments.length > 0) {
                    for (let i = 0; i < expr.arguments.length; i++) {
                        const arg = expr.arguments[i];
                        const isLast = i === expr.arguments.length - 1;
                        this.compileExpression(arg);
                        this.vm.mov(VReg.A0, VReg.RET);
                        if (isLast) {
                            this.vm.call("_print_value");
                        } else {
                            this.vm.call("_print_value_no_nl");
                            this.vm.call("_print_space");
                        }
                    }
                }
                return;
            }

            // 内置类型转换函数: Number(), String(), Boolean(), BigInt()
            if (callee.name === "Number") {
                // Number(value) - 转换为数字
                if (expr.arguments.length > 0) {
                    this.compileExpression(expr.arguments[0]);
                    // 已经是 NaN-boxed 值，调用运行时转换函数
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_to_number");
                } else {
                    // Number() 无参数返回 0
                    this.compileNumericLiteral(0);
                }
                return;
            }

            if (callee.name === "String") {
                // String(value) - 转换为字符串
                if (expr.arguments.length > 0) {
                    this.compileExpression(expr.arguments[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_to_string");
                } else {
                    // String() 无参数返回空字符串
                    this.compileStringValue("");
                }
                return;
            }

            // 内置全局函数: parseInt, parseFloat, isNaN, isFinite
            if (callee.name === "parseInt") {
                // parseInt(str, radix) -> Number
                this.compileCallArguments(expr.arguments);
                this.vm.call("_parseInt");
                return;
            }

            if (callee.name === "parseFloat") {
                // parseFloat(str) -> Number
                this.compileCallArguments(expr.arguments);
                this.vm.call("_parseFloat");
                return;
            }

            if (callee.name === "isNaN") {
                // isNaN(value) -> Boolean
                this.compileCallArguments(expr.arguments);
                this.vm.call("_isNaN");
                return;
            }

            if (callee.name === "isFinite") {
                // isFinite(value) -> Boolean
                this.compileCallArguments(expr.arguments);
                this.vm.call("_isFinite");
                return;
            }

            if (callee.name === "Boolean") {
                // Boolean(value) - 转换为布尔值
                if (expr.arguments.length > 0) {
                    this.compileExpression(expr.arguments[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_to_boolean");
                } else {
                    // Boolean() 无参数返回 false
                    this.vm.lea(VReg.RET, "_js_false");
                    this.vm.load(VReg.RET, VReg.RET, 0);
                }
                return;
            }

            if (callee.name === "BigInt") {
                // BigInt(value) - 转换为 BigInt（编译时计算）
                if (expr.arguments.length > 0) {
                    const arg = expr.arguments[0];
                    // 如果参数是字面量，编译时计算
                    if (arg.type === "Literal" && typeof arg.value === "number") {
                        const bigintVal = BigInt(Math.trunc(arg.value));
                        // 转换为字符串格式以避免 BigInt 混合错误
                        this.vm.movImm64(VReg.RET, "0x" + bigintVal.toString(16));
                    } else if (arg.type === "Literal" && typeof arg.value === "bigint") {
                        // 转换为字符串格式
                        this.vm.movImm64(VReg.RET, "0x" + arg.value.toString(16));
                    } else {
                        // 运行时转换 - 简单处理：编译参数并截断为整数
                        this.compileExpression(arg);
                        // 对于复杂情况，需要运行时支持
                    }
                } else {
                    this.vm.movImm64(VReg.RET, "0x0");
                }
                return;
            }

            // sizeof(Type) 或 sizeof(variable) - 获取类型的字节大小
            if (callee.name === "sizeof") {
                if (expr.arguments.length > 0) {
                    const arg = expr.arguments[0];
                    let size = 8; // 默认 8 字节
                    if (arg.type === "Identifier") {
                        // 类型名到字节数的映射
                        const typeSizes = {
                            Int8: 1,
                            Uint8: 1,
                            Int16: 2,
                            Uint16: 2,
                            Float16: 2,
                            Int32: 4,
                            Uint32: 4,
                            Float32: 4,
                            Int64: 8,
                            Uint64: 8,
                            Float64: 8,
                            Int: 8,
                            Float: 8,
                            Number: 8,
                            Boolean: 1,
                            String: 8,
                            Array: 8,
                            Object: 8,
                            Date: 8,
                            Map: 8,
                            Set: 8,
                            RegExp: 8,
                        };

                        // 首先检查是否是类型名
                        if (typeSizes[arg.name] !== undefined) {
                            size = typeSizes[arg.name];
                        } else {
                            // 否则检查变量的类型
                            const varType = this.ctx.getVarType ? this.ctx.getVarType(arg.name) : null;
                            if (varType) {
                                // 从类型字符串获取字节数
                                const typeToSize = {
                                    int8: 1,
                                    uint8: 1,
                                    int16: 2,
                                    uint16: 2,
                                    float16: 2,
                                    int32: 4,
                                    uint32: 4,
                                    float32: 4,
                                    int64: 8,
                                    uint64: 8,
                                    float64: 8,
                                    int: 8,
                                    float: 8,
                                    number: 8,
                                    boolean: 1,
                                    string: 8,
                                    array: 8,
                                    object: 8,
                                    Date: 8,
                                    Map: 8,
                                    Set: 8,
                                    RegExp: 8,
                                };
                                size = typeToSize[varType] || 8;
                            }
                        }
                    }
                    this.vm.movImm(VReg.RET, size);
                }
                return;
            }

            // 检查是否是用户声明的顶层函数 (function foo() {})
            // 但不能是局部变量（嵌套函数声明会存储到局部变量）
            const localOffset = this.ctx.getLocal(callee.name);
            if (this.ctx.hasFunction(callee.name) && localOffset === undefined) {
                const funcDef = this.ctx.functions[callee.name];

                // 检查是否是 async 函数
                if (isAsyncFunction(funcDef)) {
                    // async 函数调用：创建协程并返回 Promise
                    this.compileAsyncFunctionCall(callee.name, expr.arguments);
                    return;
                }

                const stackArgCount = this.compileCallArguments(expr.arguments);

                // 为缺失的参数填充 undefined（支持默认参数）
                const declaredParamCount = (funcDef.params || []).length;
                const providedArgCount = expr.arguments.length;
                if (providedArgCount < declaredParamCount) {
                    // undefinedValue = 0x7FFB000000000000
                    for (let i = providedArgCount; i < Math.min(declaredParamCount, 6); i++) {
                        this.vm.movImm64(this.vm.getArgReg(i), "0x7ffb000000000000");
                    }
                }

                this.vm.call("_user_" + callee.name);
                this.cleanupStackArgs(stackArgCount);
                return;
            }

            // 检查是否是导入的函数
            if (this.isImportedSymbol && this.isImportedSymbol(callee.name)) {
                const importInfo = this.getImportedSymbol(callee.name);
                if (importInfo && importInfo.type === "function") {
                    // 编译参数并调用导入的函数
                    this.compileCallArguments(expr.arguments);
                    this.vm.call(importInfo.label);
                    return;
                }
                if (importInfo && importInfo.type === "builtin") {
                    // 内置模块函数 - 调用运行时实现
                    // 例如: execSync from "child_process"
                    const builtinName = importInfo.builtinName; // 例如 "child_process"
                    const funcName = callee.name; // 例如 "execSync"

                    // 尝试调用内置方法编译器
                    if (this.compileBuiltinModuleCall) {
                        if (this.compileBuiltinModuleCall(builtinName, funcName, expr.arguments)) {
                            return;
                        }
                    }

                    // 回退：调用运行时函数
                    this.compileCallArguments(expr.arguments);
                    this.vm.call("_" + builtinName + "_" + funcName);
                    return;
                }
            }

            // 检查是否是局部变量（函数表达式或嵌套函数声明）
            // 必须在警告之前检查！
            if (localOffset !== undefined) {
                // 检查是否是装箱变量
                const isBoxed = this.ctx.boxedVars && this.ctx.boxedVars.has(callee.name);
                if (isBoxed) {
                    // 装箱变量：先加载 box 指针，再解引用
                    this.vm.load(VReg.V6, VReg.FP, localOffset);
                    this.vm.load(VReg.V6, VReg.V6, 0);
                } else {
                    // 普通变量：直接加载函数指针/闭包对象
                    this.vm.load(VReg.V6, VReg.FP, localOffset);
                }
                // 使用闭包调用机制
                this.compileClosureCall(VReg.V6, expr.arguments);
                return;
            }

            // 未知函数 - 回退到 _user_ 前缀
            // 这种情况下可能是编译器内部的函数引用问题
            if (callee.name === "inferType" || callee.name === "isCompatible" || callee.name === "typeName") {
                console.warn(`[DEBUG] Unknown function call: ${callee.name}`);
                console.warn(`[DEBUG]   currentModulePath:`, this.currentModulePath);
                console.warn(`[DEBUG]   ctx.name:`, this.ctx ? this.ctx.name : "no ctx");
                console.warn(`[DEBUG]   isImportedSymbol:`, this.isImportedSymbol ? this.isImportedSymbol(callee.name) : "no method");
                console.warn(`[DEBUG]   importedSymbols has:`, this.importedSymbols ? this.importedSymbols.has(callee.name) : "no map");
                if (this.importedSymbols) {
                    console.warn(`[DEBUG]   importedSymbols keys:`, [...this.importedSymbols.keys()]);
                }
            }
            console.warn(`Unknown function call: ${callee.name}, importedSymbols.size=${this.importedSymbols ? this.importedSymbols.size : "N/A"}`);
            if (callee.name === "stringToBytes" || callee.name === "alignValue") {
                console.warn(`[DEBUG] Unknown call ${callee.name} stack:`, new Error().stack);
                console.warn(`[DEBUG] callee:`, JSON.stringify(callee, null, 2));
                console.warn(`[DEBUG] full expr:`, JSON.stringify(expr, null, 2));
                console.warn(`[DEBUG] ctx.name:`, this.ctx ? this.ctx.name : "none");
                console.warn(`[DEBUG] currentModulePath:`, this.currentModulePath);
            }

            // 检查是否是外部库函数
            if (this.isExternalSymbol && this.isExternalSymbol(callee.name)) {
                // 获取库信息
                const libInfo = this.getExternalLibInfo(callee.name);
                if (libInfo) {
                    if (libInfo.type === "static") {
                        // 静态库：代码已嵌入
                        // JSBin 编译的静态库使用整数寄存器传递参数，直接调用内部函数
                        this.compileCallArguments(expr.arguments);
                        this.vm.call("_user_" + callee.name);
                    } else {
                        // 动态库：需要遵循 C 调用约定
                        this.compileCallArgumentsForCConvention(expr.arguments);

                        // 确保库已添加到外部动态库列表
                        this.registerExternalLib(libInfo);

                        if (this.os === "windows") {
                            // Windows: 使用 IAT 间接调用
                            // 计算此符号在 IAT 中的槽位
                            // kernel32.dll 占用 slots 0-3，然后有一个 null 终止符在 slot 4
                            // 所以外部 DLL 的第一个符号从 slot 5 开始
                            const baseSlot = 5; // 跳过 kernel32 的 4 个函数 + 1 个 null 终止符
                            let slotOffset = 0;

                            // 计算此符号在外部库中的位置
                            for (const lib of this.externalLibs || []) {
                                for (const sym of lib.symbols || []) {
                                    if (sym === callee.name) {
                                        // 找到了，slotOffset 是相对于 baseSlot 的偏移
                                        this.asm.callIAT(baseSlot + slotOffset);
                                        break;
                                    }
                                    slotOffset++;
                                }
                            }
                        } else {
                            // macOS/Linux: 注册外部符号（dylib ordinal 从 2 开始，1 是 libSystem）
                            const dylibIndex = this.getDylibIndex(libInfo.fullPath);
                            this.asm.registerExternalSymbol(callee.name, dylibIndex);
                            this.vm.call("_" + callee.name);
                        }

                        // 外部函数返回值在 D0/XMM0 中（浮点），需要转换到 X0/RAX
                        this.vm.fmovToInt(VReg.RET, 0);
                    }
                    return;
                }
            }
        }

        // 处理成员调用 (obj.method())
        if (callee.type === "MemberExpression") {
            const obj = callee.object;
            const prop = callee.property;

            // console.log
            if (obj.type === "Identifier" && obj.name === "console") {
                if (prop.name === "log") {
                    // 处理多个参数
                    for (let i = 0; i < expr.arguments.length; i++) {
                        const arg = expr.arguments[i];
                        const isLast = i === expr.arguments.length - 1;

                        // 根据参数类型选择打印方法
                        if (arg.type === "Literal") {
                            if (typeof arg.value === "string") {
                                // 字符串字面量 - 使用 _print_value 来处理 NaN-boxed 字符串
                                this.compileExpression(arg);
                                this.vm.mov(VReg.A0, VReg.RET);
                                if (isLast) {
                                    this.vm.call("_print_value");
                                } else {
                                    this.vm.call("_print_value_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (typeof arg.value === "number") {
                                // 数字字面量 - 现在是 boxed Number 对象
                                this.compileExpression(arg);
                                this.vm.mov(VReg.A0, VReg.RET);
                                if (isLast) {
                                    this.vm.call("_print_number");
                                } else {
                                    this.vm.call("_print_number_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (typeof arg.value === "boolean") {
                                // 布尔字面量 - 打印 "true" 或 "false"
                                if (arg.value) {
                                    this.vm.lea(VReg.A0, "_str_true");
                                } else {
                                    this.vm.lea(VReg.A0, "_str_false");
                                }
                                if (isLast) {
                                    this.vm.call("_print_str");
                                } else {
                                    this.vm.call("_print_str_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (typeof arg.value === "bigint" || arg.bigint) {
                                // BigInt 字面量 - 使用 _print_bigint
                                this.compileExpression(arg);
                                this.vm.mov(VReg.A0, VReg.RET);
                                if (isLast) {
                                    this.vm.call("_print_bigint");
                                } else {
                                    this.vm.call("_print_bigint_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (arg.value === null) {
                                // null
                                this.vm.lea(VReg.A0, "_str_null");
                                if (isLast) {
                                    this.vm.call("_print_str");
                                } else {
                                    this.vm.call("_print_str_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (arg.value === undefined) {
                                // undefined
                                this.vm.lea(VReg.A0, "_str_undefined");
                                if (isLast) {
                                    this.vm.call("_print_str");
                                } else {
                                    this.vm.call("_print_str_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else {
                                // 其他未知字面量
                                this.compileExpression(arg);
                                this.vm.mov(VReg.A0, VReg.RET);
                                if (isLast) {
                                    this.vm.call("_print_value");
                                } else {
                                    this.vm.call("_print_value_no_nl");
                                    this.vm.call("_print_space");
                                }
                            }
                        } else if (arg.type === "Identifier" && arg.name === "undefined") {
                            // undefined 标识符（以防某些解析器这样处理）
                            this.vm.lea(VReg.A0, "_str_undefined");
                            if (isLast) {
                                this.vm.call("_print_str");
                            } else {
                                this.vm.call("_print_str_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else if (arg.type === "Identifier" && (arg.name === "true" || arg.name === "false")) {
                            // true/false 标识符
                            if (arg.name === "true") {
                                this.vm.lea(VReg.A0, "_str_true");
                            } else {
                                this.vm.lea(VReg.A0, "_str_false");
                            }
                            if (isLast) {
                                this.vm.call("_print_str");
                            } else {
                                this.vm.call("_print_str_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else if (arg.type === "Identifier" && this.isImportedSymbol && this.isImportedSymbol(arg.name)) {
                            // 导入/导出的变量 - 使用 _print_number
                            const importInfo = this.getImportedSymbol(arg.name);
                            this.compileExpression(arg);
                            this.vm.mov(VReg.A0, VReg.RET);
                            if (importInfo && importInfo.type === "variable") {
                                // 导入的变量使用 _print_number
                                if (isLast) {
                                    this.vm.call("_print_number");
                                } else {
                                    this.vm.call("_print_number_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else {
                                if (isLast) {
                                    this.vm.call("_print_value");
                                } else {
                                    this.vm.call("_print_value_no_nl");
                                    this.vm.call("_print_space");
                                }
                            }
                        } else if (arg.type === "UnaryExpression" && arg.operator === "-") {
                            // 负数表达式（如 -2.5）- boxed Number
                            this.compileExpression(arg);
                            this.vm.mov(VReg.A0, VReg.RET);
                            if (isLast) {
                                this.vm.call("_print_number");
                            } else {
                                this.vm.call("_print_number_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else if (this.isBooleanExpression(arg)) {
                            // 返回布尔值的表达式 (如 s.has(), m.has(), 比较表达式等)
                            this.compileExpression(arg);
                            this.vm.mov(VReg.A0, VReg.RET);
                            if (isLast) {
                                this.vm.call("_print_bool");
                            } else {
                                this.vm.call("_print_bool_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else {
                            // 其他表达式（变量、函数调用等）
                            // 使用静态类型推断来选择打印函数
                            const argType = inferType(arg, this.ctx);
                            this.compileExpression(arg);
                            this.vm.mov(VReg.A0, VReg.RET);

                            // 检查是否是数字类型（包括 NUMBER 和所有 INT/FLOAT 子类型）
                            // 同时也检查用户函数调用（通常返回数字）
                            const isNumberType = argType === Type.NUMBER || argType === Type.INT8 || argType === Type.INT16 || argType === Type.INT32 || argType === Type.INT64 || argType === Type.UINT8 || argType === Type.UINT16 || argType === Type.UINT32 || argType === Type.UINT64 || argType === Type.FLOAT32 || argType === Type.FLOAT64;

                            // 对于用户定义函数（不包括导入的函数），假设返回数字类型
                            const isUserFunctionCall = arg.type === "CallExpression" && arg.callee && arg.callee.type === "Identifier" && this.ctx.hasFunction(arg.callee.name);

                            // 对于导入的函数调用，使用 _print_value 进行运行时类型检测
                            const isImportedFunctionCall = arg.type === "CallExpression" && arg.callee && arg.callee.type === "Identifier" && this.isImportedSymbol && this.isImportedSymbol(arg.callee.name);

                            if (isImportedFunctionCall) {
                                // 导入的函数，使用运行时类型检测
                                if (isLast) {
                                    this.vm.call("_print_value");
                                } else {
                                    this.vm.call("_print_value_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (isNumberType || isUserFunctionCall) {
                                // 数字类型使用 _print_number
                                if (isLast) {
                                    this.vm.call("_print_number");
                                } else {
                                    this.vm.call("_print_number_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (argType === Type.BOOLEAN) {
                                // 布尔类型使用 _print_bool
                                if (isLast) {
                                    this.vm.call("_print_bool");
                                } else {
                                    this.vm.call("_print_bool_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (argType === Type.BIGINT) {
                                // BigInt 类型使用 _print_bigint
                                if (isLast) {
                                    this.vm.call("_print_bigint");
                                } else {
                                    this.vm.call("_print_bigint_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (argType === Type.STRING) {
                                // 字符串类型 - 现在字符串是 NaN-boxed 的，使用 _print_value
                                if (isLast) {
                                    this.vm.call("_print_value");
                                } else {
                                    this.vm.call("_print_value_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (argType === Type.ARRAY) {
                                // 数组类型
                                if (isLast) {
                                    this.vm.call("_print_array");
                                } else {
                                    this.vm.call("_print_array_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else {
                                // 其他类型使用运行时类型检测
                                if (isLast) {
                                    this.vm.call("_print_value");
                                } else {
                                    this.vm.call("_print_value_no_nl");
                                    this.vm.call("_print_space");
                                }
                            }
                        }
                    }
                    return;
                }
                // console.warn - 与 console.log 行为相同，输出警告信息
                if (prop.name === "warn") {
                    this.compileConsolePrint(expr.arguments);
                    return;
                }
                // console.error - 与 console.log 行为相同，输出错误信息
                if (prop.name === "error") {
                    this.compileConsolePrint(expr.arguments);
                    return;
                }
            }

            // fs 模块方法 (import * as fs from "fs")
            if (obj.type === "Identifier" && this.isBuiltinModuleNamespace(obj.name, "fs")) {
                if (this.compileFSMethod(prop.name, expr.arguments)) {
                    return;
                }
            }

            // path 模块方法 (import * as path from "path")
            if (obj.type === "Identifier" && this.isBuiltinModuleNamespace(obj.name, "path")) {
                if (this.compilePathMethod(prop.name, expr.arguments)) {
                    return;
                }
            }

            // os 模块方法 (import * as os from "os")
            if (obj.type === "Identifier" && this.isBuiltinModuleNamespace(obj.name, "os")) {
                if (this.compileOSMethod(prop.name, expr.arguments)) {
                    return;
                }
            }

            // Array 静态方法 (Array.from, Array.isArray)
            if (obj.type === "Identifier" && obj.name === "Array") {
                if (prop.name === "from") {
                    // Array.from(iterable) -> 新数组
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_array_from");
                    } else {
                        // 无参数返回空数组
                        this.vm.movImm(VReg.A0, 0);
                        this.vm.call("_array_new_with_size");
                    }
                    return;
                }
                if (prop.name === "isArray") {
                    // Array.isArray(value) -> boolean
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_array_is_array");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
            }

            // String 静态方法 (String.fromCharCode)
            if (obj.type === "Identifier" && obj.name === "String") {
                if (prop.name === "fromCharCode") {
                    // String.fromCharCode(code1, code2, ...) -> 字符串
                    if (expr.arguments.length > 0) {
                        // 单个参数的情况
                        if (expr.arguments.length === 1) {
                            this.compileExpression(expr.arguments[0]);
                            // 将 Number 对象转换为整数
                            this.vm.f2i(VReg.A0, VReg.RET);
                            this.vm.call("_string_from_char_code");
                        } else {
                            // 多参数：创建数组然后转换
                            // 暂时只支持单参数
                            this.compileExpression(expr.arguments[0]);
                            this.vm.f2i(VReg.A0, VReg.RET);
                            this.vm.call("_string_from_char_code");
                        }
                    } else {
                        // 无参数返回空字符串
                        this.compileStringValue("");
                    }
                    return;
                }
            }

            // Buffer 静态方法 (Buffer.alloc, Buffer.allocUnsafe, Buffer.from, Buffer.concat, Buffer.isBuffer)
            if (obj.type === "Identifier" && obj.name === "Buffer") {
                if (prop.name === "alloc") {
                    // Buffer.alloc(size) -> Buffer
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_buffer_alloc");
                    } else {
                        this.vm.movImm(VReg.A0, 0);
                        this.vm.call("_buffer_alloc");
                    }
                    return;
                }
                if (prop.name === "allocUnsafe") {
                    // Buffer.allocUnsafe(size) -> Buffer
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_buffer_alloc_unsafe");
                    } else {
                        this.vm.movImm(VReg.A0, 0);
                        this.vm.call("_buffer_alloc_unsafe");
                    }
                    return;
                }
                if (prop.name === "from") {
                    // Buffer.from(data, encoding?) -> Buffer
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        if (expr.arguments.length > 1) {
                            this.compileExpression(expr.arguments[1]);
                            this.vm.mov(VReg.A1, VReg.RET);
                        } else {
                            this.vm.movImm(VReg.A1, 0); // 默认 encoding
                        }
                        this.vm.call("_buffer_from");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "concat") {
                    // Buffer.concat(arr) -> Buffer
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_buffer_concat");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "isBuffer") {
                    // Buffer.isBuffer(obj) -> boolean
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_buffer_is_buffer");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
            }

            // Math 对象方法
            if (obj.type === "Identifier" && obj.name === "Math") {
                if (this.compileMathMethod(prop.name, expr.arguments)) {
                    return;
                }
            }

            // JSON 对象方法
            if (obj.type === "Identifier" && obj.name === "JSON") {
                if (this.compileJSONMethod(prop.name, expr.arguments)) {
                    return;
                }
            }

            // process 对象方法
            if (obj.type === "Identifier" && obj.name === "process") {
                if (this.compileProcessMethod(prop.name, expr.arguments)) {
                    return;
                }
            }

            // Symbol 静态方法
            if (obj.type === "Identifier" && obj.name === "Symbol") {
                // Symbol.iterator, Symbol.toStringTag 等
                if (prop.name === "iterator") {
                    this.vm.call("_get_Symbol_iterator");
                    return;
                }
                if (prop.name === "toStringTag") {
                    this.vm.call("_get_Symbol_toStringTag");
                    return;
                }
                if (prop.name === "asyncIterator") {
                    this.vm.call("_get_Symbol_asyncIterator");
                    return;
                }
                if (this.compileSymbolMethod(prop.name, expr.arguments)) {
                    return;
                }
            }

            // Object 静态方法
            if (obj.type === "Identifier" && obj.name === "Object") {
                if (prop.name === "keys") {
                    // Object.keys(obj) -> array
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_keys");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "values") {
                    // Object.values(obj) -> array
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_values");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "entries") {
                    // Object.entries(obj) -> [[key, value], ...]
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_entries");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "assign") {
                    // Object.assign(target, source)
                    if (expr.arguments.length >= 2) {
                        this.compileExpression(expr.arguments[1]);
                        this.vm.push(VReg.RET);
                        this.compileExpression(expr.arguments[0]);
                        this.vm.pop(VReg.A1);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_assign");
                    } else if (expr.arguments.length === 1) {
                        this.compileExpression(expr.arguments[0]);
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "create") {
                    // Object.create(proto)
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                    } else {
                        this.vm.movImm(VReg.A0, 0);
                    }
                    this.vm.call("_object_create");
                    return;
                }
                if (prop.name === "hasOwn") {
                    // Object.hasOwn(obj, key)
                    if (expr.arguments.length >= 2) {
                        this.compileExpression(expr.arguments[1]);
                        this.vm.push(VReg.RET);
                        this.compileExpression(expr.arguments[0]);
                        this.vm.pop(VReg.A1);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_has");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "getPrototypeOf") {
                    // Object.getPrototypeOf(obj)
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_getPrototypeOf");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
                if (prop.name === "setPrototypeOf") {
                    // Object.setPrototypeOf(obj, proto)
                    if (expr.arguments.length >= 2) {
                        this.compileExpression(expr.arguments[1]);
                        this.vm.push(VReg.RET);
                        this.compileExpression(expr.arguments[0]);
                        this.vm.pop(VReg.A1);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_object_setPrototypeOf");
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    return;
                }
            }

            // Date 静态方法 (Date.now())
            if (obj.type === "Identifier" && obj.name === "Date") {
                if (prop.name === "now") {
                    this.vm.call("_date_now");
                    return;
                }
            }

            // Promise 静态方法 (Promise.resolve(), Promise.reject())
            if (obj.type === "Identifier" && obj.name === "Promise") {
                if (prop.name === "resolve") {
                    // Promise.resolve(value) - 创建已 resolved 的 Promise
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_Promise_resolve");
                    return;
                }
                if (prop.name === "reject") {
                    // Promise.reject(reason) - 创建已 rejected 的 Promise
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_Promise_reject");
                    return;
                }
            }

            // Promise 实例方法
            // p.then(cb) / p.catch(cb)
            if (prop && prop.type === "Identifier" && (prop.name === "then" || prop.name === "catch")) {
                // 只支持单个回调参数
                if (expr.arguments.length > 0) {
                    // 先编译 promise 对象
                    this.compileExpression(obj);
                    this.vm.push(VReg.RET);

                    // 再编译回调（闭包对象或函数指针）
                    this.compileExpression(expr.arguments[0]);
                    this.vm.mov(VReg.A1, VReg.RET);

                    // 调用运行时
                    this.vm.pop(VReg.A0);
                    if (prop.name === "then") {
                        this.vm.call("_promise_then");
                    } else {
                        this.vm.call("_promise_catch");
                    }
                } else {
                    // 没有回调参数：退化为返回原 promise
                    this.compileExpression(obj);
                }
                return;
            }

            // 根据对象类型推断，调用正确的方法
            const objType = this.inferObjectType(obj);
            console.log("[DEBUG] objType =", objType, "prop.name =", prop.name);

            // Generator 方法
            if (objType === "Generator" || objType === "unknown") {
                const generatorMethods = ["next", "return", "throw"];
                if (generatorMethods.includes(prop.name)) {
                    if (this.compileGeneratorMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // String 方法 - 优先检查，因为 slice/indexOf 在字符串和数组中都有
            // 对于 unknown 类型，也检查这些共享方法（通过运行时类型检测处理）
            if (objType === "String" || objType === "unknown") {
                const stringMethods = ["toUpperCase", "toLowerCase", "charAt", "charCodeAt", "trim", "slice", "substring", "indexOf", "lastIndexOf", "includes", "startsWith", "endsWith", "concat", "split", "replace", "replaceAll", "repeat", "at", "match", "matchAll", "search"];
                if (stringMethods.includes(prop.name)) {
                    if (this.compileStringMethodWithTypeCheck(obj, prop.name, expr.arguments, objType === "unknown")) {
                        return;
                    }
                }
            }

            // 数组方法 - Array 和 TypedArray 共享
            if (objType === "Array" || objType === "TypedArray" || objType === "unknown") {
                const arrayMethods = ["push", "pop", "shift", "unshift", "length", "at", "slice", "indexOf", "includes", "forEach", "map", "filter", "reduce", "flat", "flatMap", "sort", "reverse", "find", "findIndex", "some", "every", "join", "concat", "splice", "fill"];
                if (arrayMethods.includes(prop.name)) {
                    this.compileArrayMethod(obj, prop.name, expr.arguments);
                    return;
                }
            }

            // Map 方法
            if (objType === "Map") {
                const mapMethods = ["set", "get", "has", "delete", "size", "clear", "keys", "values", "entries"];
                if (mapMethods.includes(prop.name)) {
                    if (this.compileMapMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // Set 方法
            if (objType === "Set") {
                const setMethods = ["add", "has", "delete", "size", "clear", "keys", "values", "entries"];
                if (setMethods.includes(prop.name)) {
                    if (this.compileSetMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // Date 方法
            if (objType === "Date") {
                const dateMethods = ["getTime", "toString", "valueOf", "toISOString"];
                if (dateMethods.includes(prop.name)) {
                    if (this.compileDateMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // Buffer 方法
            if (objType === "Buffer") {
                const bufferMethods = ["toString", "length", "slice", "write"];
                if (bufferMethods.includes(prop.name)) {
                    if (this.compileBufferMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // BigInt 方法
            if (objType === "BigInt") {
                const bigintMethods = ["toString"];
                if (bigintMethods.includes(prop.name)) {
                    console.log("[DEBUG] Calling compileBigIntMethod for", prop.name);
                    if (this.compileBigIntMethod(obj, prop.name, expr.arguments)) {
                        console.log("[DEBUG] compileBigIntMethod returned true");
                        return;
                    }
                    console.log("[DEBUG] compileBigIntMethod returned false");
                }
            }

            // RegExp 方法
            if (objType === "RegExp") {
                const regexpMethods = ["test", "exec"];
                if (regexpMethods.includes(prop.name)) {
                    if (this.compileRegExpMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // 如果无法确定类型，尝试一些比较安全的方法（不容易与用户方法冲突）
            // 对于 "add", "get", "set", "has", "delete" 等常见名称，太容易与用户方法冲突，不进行回退
            if (objType === "unknown") {
                // String 方法 - 这些方法名比较独特，不容易冲突
                const safeStringMethods = ["toUpperCase", "toLowerCase", "charAt", "charCodeAt", "trim", "substring", "lastIndexOf", "startsWith", "endsWith", "repeat", "matchAll", "search"];
                if (safeStringMethods.includes(prop.name)) {
                    if (this.compileStringMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }

                // 注意：对于 "add", "get", "set", "has", "delete", "includes", "indexOf", "slice", "concat", "split", "replace" 等
                // 这些方法名太常见，在多种类型上都有，不应该在 unknown 类型时回退
                // 让它们走通用对象方法调用路径

                // Date 方法 - 这些方法名相对独特
                const dateMethods = ["getTime", "toString", "valueOf"];
                if (dateMethods.includes(prop.name)) {
                    if (this.compileDateMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // 通用对象方法调用 - obj.method(args)
            // 获取方法（闭包或函数指针）并传递 this
            this.compileExpression(obj); // obj -> RET
            this.vm.push(VReg.RET); // 保存 obj 作为 this (NaN-boxed)

            // 获取方法属性 - 需要先解包对象
            const propLabel = this.asm.addString(prop.name || prop.value);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_js_unbox"); // 解包对象指针
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.lea(VReg.A1, propLabel);
            this.vm.call("_object_get"); // 获取方法 -> RET

            this.vm.mov(VReg.V6, VReg.RET); // 方法指针/闭包
            this.vm.pop(VReg.V5); // 恢复 obj (this)

            // 使用带 this 的闭包调用
            this.compileMethodCall(VReg.V6, VReg.V5, expr.arguments);
            return;
        }

        // 通用函数调用
        if (callee.type === "Identifier") {
            this.compileCallArguments(expr.arguments);
            this.vm.call("_user_" + callee.name);
        } else {
            // 对于间接调用，先计算 callee，然后使用闭包调用机制
            this.compileExpression(callee);
            this.vm.mov(VReg.V6, VReg.RET);
            this.compileClosureCall(VReg.V6, expr.arguments);
        }
    },
};
