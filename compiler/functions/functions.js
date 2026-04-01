// JSBin 编译器 - 函数和复合类型编译（聚合模块）
// 导入并组合所有函数相关的编译器

import { VReg } from "../../vm/index.js";
import { Type, inferType } from "../core/types.js";

// 导入拆分的模块
import { BuiltinMethodCompiler } from "./builtin_methods.js";
import { DataStructureCompiler } from "./data_structures.js";
import { ClosureCompiler } from "./closures.js";
import { ASYNC_CLOSURE_MAGIC, isAsyncFunction } from "../async/index.js";
import { OperatorCompiler } from "../expressions/operators.js";

// 闭包魔数 - 用于区分普通函数指针和闭包对象
const CLOSURE_MAGIC = 0xc105;

// 函数和复合类型编译方法混入 - 聚合所有函数相关的编译器
export const FunctionCompiler = {
    // 从各模块混入方法
    ...BuiltinMethodCompiler,
    ...DataStructureCompiler,
    ...ClosureCompiler,
    ...OperatorCompiler,

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
            case Type.OBJECT:
                return "Object";
            case Type.STRING:
                return "String";
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
            if (["has", "delete", "includes", "startsWith", "endsWith", "test"].includes(methodName)) {
                return true;
            }
        }
        return false;
    },

    // 编译函数参数 - 先全部压栈，再统一弹出到参数寄存器
    // 这是因为 VReg.RET 和 VReg.A0 都映射到同一个物理寄存器 (X0/RAX)
    compileCallArguments(args) {
        const argCount = Math.min(args.length, 6);

        // 先编译所有参数并压栈（逆序，因为栈是LIFO）
        for (let i = argCount - 1; i >= 0; i--) {
            this.compileExpression(args[i]);
            this.vm.push(VReg.RET);
        }

        // 再按顺序弹出到参数寄存器
        for (let i = 0; i < argCount; i++) {
            this.vm.pop(this.vm.getArgReg(i));
        }
    },

    // 编译 async 顶层函数调用
    // 创建协程并返回 Promise
    // 简化版：直接执行函数，将结果包装成 Promise
    compileAsyncFunctionCall(funcName, args) {
        const vm = this.vm;

        // 真正的 async：创建协程并返回 Promise
        vm.lea(VReg.V1, this.getFunctionLabel(funcName));
        this.compileAsyncCall(VReg.V1, args);
    },

    // 编译闭包调用 - 处理可能是闭包对象或普通函数指针的情况
    // funcReg: 存放函数指针或闭包对象的寄存器
    compileClosureCall(funcReg, args) {
        const vm = this.vm;

        // 保存函数指针/闭包对象到栈
        vm.push(funcReg);

        // 编译参数
        this.compileCallArguments(args);

        // 恢复函数指针/闭包对象到 S0 (callee-saved)
        vm.pop(VReg.S0);

        // ========== JSValue unboxing: 提取真正的闭包/函数指针 ==========
        // 如果 S0 是 JSValue（高 16 位 >= 0x7FF8），需要解 Boxing
        // 检查高 16 位
        vm.mov(VReg.V1, VReg.S0);        // V1 = S0
        vm.shrImm(VReg.V1, VReg.V1, 48); // V1 = 高 16 位
        vm.andImm(VReg.V1, VReg.V1, 0x7); // V1 = tag (0-7)

        // tag 7 = function (JSValue 装箱的函数)
        // tag 5 = object, tag 6 = string (可能是闭包对象指针)
        // 只有当 tag >= 4 时才需要解 Boxing
        const isBoxedLabel = this.ctx.newLabel("is_jsvalue_boxed");
        const unboxDoneLabel = this.ctx.newLabel("unbox_done");

        vm.cmpImm(VReg.V1, 4);
        vm.jlt(unboxDoneLabel); // tag < 4，直接使用（可能是普通函数指针）

        vm.label(isBoxedLabel);
        // 解 Boxing：取低 48 位作为指针
        vm.movImm64(VReg.V2, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.S0, VReg.S0, VReg.V2); // S0 = 提取的指针

        vm.label(unboxDoneLabel);
        // ========== 解 Boxing 完成 ==========

        // 检查是否是 async 闭包（magic == 0xA51C）
        const notAsyncLabel = this.ctx.newLabel("not_async");
        const asyncCallLabel = this.ctx.newLabel("async_call");
        const notClosureLabel = this.ctx.newLabel("not_closure");
        const callLabel = this.ctx.newLabel("do_call");

        // 加载第一个 8 字节（magic）到 S1
        vm.load(VReg.S1, VReg.S0, 0);

        // 先检查是否是 async 闭包
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

        vm.label(asyncDoneLabel);
    },

    // 编译方法调用 - 类似闭包调用但传递 this
    // funcReg: 存放函数指针或闭包对象的寄存器
    // thisReg: 存放 this 对象的寄存器
    compileMethodCall(funcReg, thisReg, args) {
        const vm = this.vm;

        // 保存 this 和函数指针到栈
        vm.push(thisReg);
        vm.push(funcReg);

        // 编译参数
        this.compileCallArguments(args);

        // 恢复函数指针和 this
        vm.pop(VReg.S0); // 函数指针/闭包
        vm.pop(VReg.S3); // this 对象

        // ========== JSValue unboxing: 提取真正的闭包/函数指针 ==========
        // 如果 S0 是 JSValue（高 16 位 >= 0x7FF8），需要解 Boxing
        vm.mov(VReg.V1, VReg.S0);        // V1 = S0
        vm.shrImm(VReg.V1, VReg.V1, 48); // V1 = 高 16 位
        vm.andImm(VReg.V1, VReg.V1, 0x7); // V1 = tag (0-7)

        const methodUnboxDoneLabel = this.ctx.newLabel("method_unbox_done");
        vm.cmpImm(VReg.V1, 4);
        vm.jlt(methodUnboxDoneLabel); // tag < 4，直接使用

        // 解 Boxing：取低 48 位作为指针
        vm.movImm64(VReg.V2, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.S0, VReg.S0, VReg.V2); // S0 = 提取的指针

        vm.label(methodUnboxDoneLabel);
        // ========== 解 Boxing 完成 ==========

        // 通过 A5 寄存器传递 this（这是额外的隐藏参数）
        vm.mov(VReg.A5, VReg.S3);

        // 检查是否是闭包
        const notClosureLabel = this.ctx.newLabel("method_not_closure");
        const callLabel = this.ctx.newLabel("method_do_call");

        // 加载 magic
        vm.load(VReg.S1, VReg.S0, 0);
        vm.movImm(VReg.S2, CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jne(notClosureLabel);

        // 是闭包：加载函数指针
        vm.load(VReg.S1, VReg.S0, 8);
        vm.jmp(callLabel);

        vm.label(notClosureLabel);
        // 不是闭包：S0 就是函数指针
        vm.mov(VReg.S1, VReg.S0);
        vm.movImm(VReg.S0, 0);

        vm.label(callLabel);
        vm.callIndirect(VReg.S1);
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

    // 编译函数调用
    compileCallExpression(expr) {
        const callee = expr.callee;

        // 内置函数处理
        if (callee.type === "Identifier") {
            // 动态 import(source)
            if (callee.name === "import") {
                if (expr.arguments.length > 0) {
                    this.compileExpression(expr.arguments[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_js_import");
                } else {
                    this.vm.movImm(VReg.RET, 0);
                }
                return;
            }

            if (callee.name === "print") {
                if (expr.arguments.length > 0) {
                    this.compileExpression(expr.arguments[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_print_value");
                }
                return;
            }

            if (callee.name === "__syscall") {
                const args = expr.arguments;
                // A0 = num, A1 = arg0, A2 = arg1, A3 = arg2, A4 = arg3
                for (let i = 0; i < args.length && i < 5; i++) {
                    this.compileExpression(args[i]);
                    this.vm.mov(this.vm.getArgReg(i), VReg.RET);
                }
                // 如果第一个参数是常量，直接使用
                if (args.length > 0 && args[0].type === "Literal") {
                    this.vm.syscall(args[0].value);
                } else {
                    // 动态系统调用号
                    this.vm.mov(VReg.A0, this.vm.getArgReg(0));
                    this.vm.syscall();
                }
                return;
            }

            if (callee.name === "__get_process") {
                // Returns _process_global. If NULL, returns undefined to prevent crashes.
                // Modules should use: const _proc = __get_process(); if (!_proc) return default;
                this.vm.lea(VReg.V0, "_process_global");
                this.vm.load(VReg.RET, VReg.V0, 0);
                // Check if _process_global is NULL (0)
                const isNull = "proc_null";
                this.vm.cmpImm(VReg.RET, 0);
                this.vm.jne(isNull);
                // _process_global is NULL — return _js_undefined
                this.vm.lea(VReg.A0, "_js_undefined");
                this.vm.load(VReg.RET, VReg.A0, 0);
                this.vm.label(isNull);
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

            // Number(x), Boolean(x), String(x) 转换函数
            if (callee.name === "Number" || callee.name === "Boolean" || callee.name === "String") {
                const arg = expr.arguments.length > 0 ? expr.arguments[0] : null;

                // 对于 Boolean()，可以在编译时求值字面量
                if (callee.name === "Boolean" && arg) {
                    if (arg.type === "Literal") {
                        // 编译时求值
                        const val = arg.value;
                        const isTruthy = Boolean(val); // JS truthiness
                        // JS_TRUE = 0x7FF9000000000001, JS_FALSE = 0x7FF9000000000002
                        if (isTruthy) {
                            this.vm.movImm64(VReg.RET, 0x7FF9000000000001n);
                        } else {
                            this.vm.movImm64(VReg.RET, 0x7FF9000000000002n);
                        }
                        return;
                    }
                }

                // 对于 Number()，如果是数字字面量，直接返回
                if (callee.name === "Number" && arg) {
                    if (arg.type === "Literal" && typeof arg.value === "number") {
                        this.compileExpression(arg);
                        return;
                    }
                    // 对于字符串字面量，调用 _str_to_num 转换
                    if (arg.type === "Literal" && typeof arg.value === "string") {
                        this.compileExpression(arg);
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_str_to_num");
                        return;
                    }
                }

                // 对于 String()，如果是字符串字面量，直接返回
                if (callee.name === "String" && arg) {
                    if (arg.type === "Literal" && typeof arg.value === "string") {
                        this.compileExpression(arg);
                        return;
                    }
                }

                // 非字面量参数：编译参数并返回
                if (arg) {
                    this.compileExpression(arg);
                    // 对于 Number()，调用 _number_coerce 进行转换
                    // _number_coerce 正确处理 boolean, null, undefined, string, number
                    if (callee.name === "Number") {
                        this.vm.mov(VReg.A0, VReg.RET);
                        this.vm.call("_number_coerce");
                    }
                    // 对于 String()，调用 _valueToStr 进行转换
                    // _valueToStr 智能检测类型并转换为字符串
                    if (callee.name === "String") {
                        // 检查参数类型，数组需要特殊处理
                        const argType = inferType(arg, this.ctx);
                        // console.log("DEBUG String() argType:", argType, "arg.type:", arg.type, "arg.operator:", arg.operator);
                        if (argType === Type.ARRAY) {
                            // 数组: 直接调用 _valueToStr，它会调用 _array_to_string
                            this.vm.mov(VReg.A0, VReg.RET);
                            this.vm.call("_valueToStr");
                        } else if (argType === Type.OBJECT) {
                            // 对象: 调用 _js_unbox 获取指针，然后调用 _valueToStr
                            // _valueToStr 会将其转换为 "[object Object]"
                            this.vm.mov(VReg.A0, VReg.RET);
                            this.vm.call("_js_unbox");
                            this.vm.mov(VReg.A0, VReg.RET);
                            this.vm.call("_valueToStr");
                        } else if (argType === Type.STRING) {
                            // 字符串类型: 直接返回，字符串变量已经是数据段指针
                            // 不需要调用 _valueToStr
                            // 注意: 如果需要返回 JS 字符串对象(NaN-boxed)，应该调用 _valueToStr
                            // 但当前 String() 的语义是返回原始字符串值
                        } else if (argType === Type.NUMBER && (arg.type === "Literal" || arg.type === "NumericLiteral") && typeof arg.value === "number" && !Number.isInteger(arg.value)) {
                            // 浮点数字面量: 调用 _floatToString 直接转换
                            // _valueToStr 无法正确处理 raw float bits (会误判为 JSValue)
                            this.vm.mov(VReg.A0, VReg.RET);
                            this.vm.call("_floatToString");
                        } else if (argType === Type.NUMBER && (arg.type === "Literal" || arg.type === "NumericLiteral") && typeof arg.value === "number" && Number.isInteger(arg.value)) {
                            // 整数字面量: 调用 _intToStr
                            // 先从 float bits 提取整数
                            this.vm.fmovToFloat(0, VReg.RET);
                            this.vm.fcvtzs(VReg.A0, 0);
                            this.vm.call("_intToStr");
                        } else if (argType === Type.NUMBER && arg.type === "UnaryExpression" && arg.operator === "-" && arg.argument && typeof arg.argument.value === "number" && !Number.isInteger(arg.argument.value)) {
                            // 负浮点数 UnaryExpression: -x.x
                            // 调用 _floatToString 直接转换
                            this.vm.mov(VReg.A0, VReg.RET);
                            this.vm.call("_floatToString");
                        } else if (argType === Type.NUMBER && arg.type === "UnaryExpression" && arg.operator === "-" && arg.argument && typeof arg.argument.value === "number" && Number.isInteger(arg.argument.value)) {
                            // 负整数 UnaryExpression: -nnn
                            // 调用 _intToStr
                            this.vm.fmovToFloat(0, VReg.RET);
                            this.vm.fcvtzs(VReg.A0, 0);
                            this.vm.call("_intToStr");
                        } else if (argType === Type.NUMBER && arg.type === "Identifier") {
                            // 数字类型变量: 直接调用 _floatToString
                            // _floatToString 正确处理负数和浮点数
                            this.vm.mov(VReg.A0, VReg.RET);
                            this.vm.call("_floatToString");
                        } else {
                            // 其他类型（UNKNOWN等）直接调用 _valueToStr
                            this.vm.mov(VReg.A0, VReg.RET);
                            this.vm.call("_valueToStr");
                        }
                    }
                } else {
                    // 无参数时
                    if (callee.name === "Number") {
                        this.vm.movImm(VReg.RET, 0); // Number() 返回 0
                    } else if (callee.name === "Boolean") {
                        this.vm.movImm64(VReg.RET, 0x7FF9000000000002n); // Boolean() 返回 false
                    } else {
                        // String()
                        this.vm.lea(VReg.RET, "_str_empty");
                    }
                }
                return;
            }

            // 检查是否是用户声明的顶层函数 (function foo() {})
            // 但不能是局部变量（嵌套函数声明会存储到局部变量）
            const localOffset = this.ctx.getLocal(callee.name);
            const globalLabel = this.ctx.getMainCapturedVar(callee.name);
            if (this.ctx.hasFunction(callee.name) && localOffset === undefined && globalLabel === undefined) {
                const funcDef = this.ctx.getFunction(callee.name);

                // 检查是否是 async 函数
                if (isAsyncFunction(funcDef)) {
                    // async 函数调用：创建协程并返回 Promise
                    this.compileAsyncFunctionCall(callee.name, expr.arguments);
                    return;
                }

                this.compileCallArguments(expr.arguments);
                this.vm.call(this.getFunctionLabel(callee.name));
                return;
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
                        this.vm.call(this.getFunctionLabel(callee.name));
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

            // 检查是否是局部变量（函数表达式或嵌套函数声明）
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
                                // 字符串字面量 - compileExpression 返回 NaN-boxed string
                                // 需要先 unbox 得到 char* 指针再传给 _print_str
                                this.compileExpression(arg);
                                this.vm.mov(VReg.A0, VReg.RET);
                                this.vm.call("_js_unbox"); // 提取 char* 指针
                                this.vm.mov(VReg.A0, VReg.RET); // _js_unbox 结果在 RET 中，需要移到 A0
                                if (isLast) {
                                    this.vm.call("_print_str");
                                } else {
                                    this.vm.call("_print_str_no_nl");
                                    this.vm.call("_print_space");
                                }
                            } else if (typeof arg.value === "number") {
                                // 数字字面量 - compileExpression 返回 IEEE 754 位模式
                                // 使用 _print_value 处理，因为它能正确处理原始值
                                this.compileExpression(arg);
                                this.vm.mov(VReg.A0, VReg.RET);
                                if (isLast) {
                                    this.vm.call("_print_value");
                                } else {
                                    this.vm.call("_print_value_no_nl");
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
                        } else if (arg.type === "Identifier" && arg.name === "NaN") {
                            // NaN - 直接使用字符串方式打印
                            const label = this.asm.addString("NaN");
                            this.vm.lea(VReg.A0, label);
                            if (isLast) {
                                this.vm.call("_print_str");
                            } else {
                                this.vm.call("_print_str_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else if (arg.type === "Identifier" && arg.name === "Infinity") {
                            // Infinity - 直接使用字符串方式打印
                            const label = this.asm.addString("Infinity");
                            this.vm.lea(VReg.A0, label);
                            if (isLast) {
                                this.vm.call("_print_str");
                            } else {
                                this.vm.call("_print_str_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else if (arg.type === "UnaryExpression" && arg.operator === "-" && arg.argument.type === "Identifier" && arg.argument.name === "Infinity") {
                            // -Infinity - 直接使用字符串方式打印
                            const label = this.asm.addString("-Infinity");
                            this.vm.lea(VReg.A0, label);
                            if (isLast) {
                                this.vm.call("_print_str");
                            } else {
                                this.vm.call("_print_str_no_nl");
                                this.vm.call("_print_space");
                            }
                        } else if (arg.type === "UnaryExpression" && arg.operator === "-") {
                            // 负数表达式（如 -2.5）- compileExpression 返回 IEEE 754 位模式
                            // 使用 _print_value 处理，因为它能正确处理原始值
                            this.compileExpression(arg);
                            this.vm.mov(VReg.A0, VReg.RET);
                            if (isLast) {
                                this.vm.call("_print_value");
                            } else {
                                this.vm.call("_print_value_no_nl");
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
                            // 使用运行时类型检测的 _print_value
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
            }

            // Math 对象方法
            if (obj.type === "Identifier" && obj.name === "Math") {
                if (this.compileMathMethod(prop.name, expr.arguments)) {
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

            // Promise 静态方法 (Promise.resolve(), Promise.reject(), Promise.all(), Promise.race(), Promise.allSettled())
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
                if (prop.name === "all") {
                    // Promise.all(iterable) - 等待所有 Promise 完成
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_Promise_all");
                    return;
                }
                if (prop.name === "race") {
                    // Promise.race(iterable) - 任意一个 Promise 完成
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_Promise_race");
                    return;
                }
                if (prop.name === "allSettled") {
                    // Promise.allSettled(iterable) - 等待所有 Promise settled
                    if (expr.arguments.length > 0) {
                        this.compileExpression(expr.arguments[0]);
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_Promise_allSettled");
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

            // String 方法 - 优先检查，因为 slice/indexOf 在字符串和数组中都有
            if (objType === "String") {
                const stringMethods = ["toUpperCase", "toLowerCase", "charAt", "charCodeAt", "trim", "slice", "substring", "indexOf", "concat", "includes", "startsWith", "endsWith", "lastIndexOf", "at", "repeat", "padStart", "padEnd", "split", "trimStart", "trimEnd", "trimLeft", "trimRight"];
                if (stringMethods.includes(prop.name)) {
                    if (this.compileStringMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // 数组方法 - Array 和 TypedArray 共享
            // 注意：对于 unknown 类型，includes/indexOf/slice/at 应该由字符串方法处理
            // 因为 "str".includes() 比 [].includes() 更常见
            if (objType === "Array" || objType === "TypedArray") {
                const arrayMethods = ["push", "pop", "shift", "unshift", "length", "at", "slice", "indexOf", "includes", "forEach", "map", "filter", "reduce"];
                if (arrayMethods.includes(prop.name)) {
                    this.compileArrayMethod(obj, prop.name, expr.arguments);
                    return;
                }
            }

            // Map 方法
            if (objType === "Map") {
                const mapMethods = ["set", "get", "has", "delete", "size", "clear"];
                if (mapMethods.includes(prop.name)) {
                    if (this.compileMapMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // Set 方法
            if (objType === "Set") {
                const setMethods = ["add", "has", "delete", "size", "clear"];
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

            // RegExp 方法
            if (objType === "RegExp") {
                const regexpMethods = ["test", "exec"];
                if (regexpMethods.includes(prop.name)) {
                    if (this.compileRegExpMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }
            }

            // 如果无法确定类型，尝试所有可能的方法（旧的回退逻辑）
            if (objType === "unknown") {
                // String 方法 - 对于未知类型，也尝试字符串方法
                const stringMethods = ["toUpperCase", "toLowerCase", "charAt", "charCodeAt", "trim", "slice", "substring", "indexOf", "concat", "includes", "startsWith", "endsWith", "lastIndexOf", "at", "repeat", "padStart", "padEnd", "split", "trimStart", "trimEnd", "trimLeft", "trimRight"];
                if (stringMethods.includes(prop.name)) {
                    if (this.compileStringMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }

                // Map 方法
                const mapMethods = ["set", "get"]; // 只有 Map 独有的方法
                if (mapMethods.includes(prop.name)) {
                    if (this.compileMapMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }

                // Set 方法
                const setOnlyMethods = ["add"]; // 只有 Set 独有的方法
                if (setOnlyMethods.includes(prop.name)) {
                    if (this.compileSetMethod(obj, prop.name, expr.arguments)) {
                        return;
                    }
                }

                // Date 方法
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
            this.vm.push(VReg.RET); // 保存 obj 作为 this

            // 获取方法属性
            const propLabel = this.asm.addString(prop.name || prop.value);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.lea(VReg.A1, propLabel);
            // Box the property key label as a JSValue string (TAG_STRING_BASE = 0x7FFC...)
            this.vm.movImm64(VReg.V0, 0x7ffc000000000000n);
            this.vm.or(VReg.A1, VReg.A1, VReg.V0);
            this.vm.call("_object_get"); // 获取方法 -> RET

            this.vm.mov(VReg.V6, VReg.RET); // 方法指针/闭包
            this.vm.pop(VReg.V5); // 恢复 obj (this)

            // 使用带 this 的闭包调用
            this.compileMethodCall(VReg.V6, VReg.V5, expr.arguments);
            return;
        }

        // 通用函数调用
        if (callee.type === "Identifier") {
            const globalLabel = this.ctx.getMainCapturedVar(callee.name);
            if (globalLabel) {
                // 如果是主程序中被捕获的变量，使用动态闭包调用
                this.compileExpression(callee);
                this.vm.mov(VReg.V6, VReg.RET);
                this.compileClosureCall(VReg.V6, expr.arguments);
                return;
            }
            // 只有已注册的用户函数才能通过 _user_ 标签调用
            if (this.ctx.hasFunction(callee.name)) {
                this.compileCallArguments(expr.arguments);
                this.vm.call(this.getFunctionLabel(callee.name));
            }
            // 否则：局部变量通过闭包机制，外部符号通过 IAT，其他标识符被忽略
        } else {
            // 对于间接调用，先计算 callee，然后使用闭包调用机制
            this.compileExpression(callee);
            this.vm.mov(VReg.V6, VReg.RET);
            this.compileClosureCall(VReg.V6, expr.arguments);
        }
    },
};
