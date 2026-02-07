// JSBin 编译器 - 成员访问编译
// 编译对象属性、数组索引访问

import { VReg } from "../../vm/index.js";

// 成员访问编译方法混入
export const MemberCompiler = {
    // 编译 this 表达式
    compileThisExpression(expr) {
        // this 存储在 __this 局部变量中
        const offset = this.ctx.getLocal("__this");
        if (offset !== undefined) {
            this.vm.load(VReg.RET, VReg.FP, offset);
        } else {
            // 如果没有 __this，返回 undefined (0)
            this.vm.movImm(VReg.RET, 0);
        }
    },

    // 编译标识符
    compileIdentifier(expr) {
        const name = expr.name;

        // 特殊值：undefined
        if (name === "undefined") {
            // 加载预定义的 undefined 常量值
            this.vm.lea(VReg.RET, "_js_undefined");
            this.vm.load(VReg.RET, VReg.RET, 0);
            return;
        }

        // 特殊值：null
        if (name === "null") {
            this.vm.movImm(VReg.RET, 0);
            return;
        }

        // 特殊值：Infinity
        if (name === "Infinity") {
            // IEEE 754 正无穷: 0x7FF0000000000000
            this.vm.movImm64(VReg.RET, "0x7ff0000000000000");
            return;
        }

        // 特殊值：NaN
        if (name === "NaN") {
            // IEEE 754 标准 NaN: 0x7FF8000000000001
            // 注意：使用低位有 1 的 NaN，以避免与 NaN-boxed int32(0) 冲突
            this.vm.movImm64(VReg.RET, "0x7ff8000000000001");
            return;
        }

        // 检查是否是内置构造函数（用于 instanceof）
        if (name === "Array") {
            this.vm.movImm(VReg.RET, 1); // Array 构造函数标识 = 1
            return;
        }
        if (name === "Object") {
            this.vm.movImm(VReg.RET, 2); // Object 构造函数标识 = 2
            return;
        }

        // 检查是否是模块级常量（常量折叠）
        if (this.ctx.hasModuleConstant && this.ctx.hasModuleConstant(name)) {
            const constant = this.ctx.getModuleConstant(name);
            if (constant.type === "number") {
                // 数字常量 - 使用 compileNumericLiteral 来正确 box 数字
                this.compileNumericLiteral(constant.value);
            } else if (constant.type === "boolean") {
                // 布尔常量
                if (constant.value) {
                    this.vm.lea(VReg.RET, "_js_true");
                    this.vm.load(VReg.RET, VReg.RET, 0);
                } else {
                    this.vm.lea(VReg.RET, "_js_false");
                    this.vm.load(VReg.RET, VReg.RET, 0);
                }
            } else if (constant.type === "string") {
                // 字符串常量 - 创建字符串
                this.compileStringLiteral({ value: constant.value });
            }
            return;
        }

        // 检查是否是导入的符号
        if (this.isImportedSymbol && this.isImportedSymbol(name)) {
            const importInfo = this.getImportedSymbol(name);
            if (importInfo) {
                if (importInfo.type === "function") {
                    // 导入的函数 - 创建函数引用/闭包
                    this.vm.movImm(VReg.A0, 16);
                    this.vm.call("_alloc");
                    this.vm.movImm(VReg.V1, 0xc105); // CLOSURE_MAGIC
                    this.vm.store(VReg.RET, 0, VReg.V1);
                    this.vm.lea(VReg.V1, importInfo.label);
                    this.vm.store(VReg.RET, 8, VReg.V1);
                } else if (importInfo.type === "class") {
                    // 导入的类 - 从全局标签加载类信息对象
                    // 类信息对象结构: [+0: type(3)][+8: constructor][+16: prototype]
                    const classInfoLabel = importInfo.classInfoLabel;
                    if (classInfoLabel) {
                        this.vm.lea(VReg.RET, classInfoLabel);
                        this.vm.load(VReg.RET, VReg.RET, 0);
                    } else {
                        this.vm.movImm(VReg.RET, 0);
                    }
                } else if (importInfo.type === "variable") {
                    // 导入的变量 - 从全局标签加载
                    this.vm.lea(VReg.RET, importInfo.label);
                    this.vm.load(VReg.RET, VReg.RET, 0);
                } else if (importInfo.type === "namespace") {
                    // 命名空间导入 - 创建对象来保存所有导出
                    // TODO: 完整实现命名空间对象
                    this.vm.movImm(VReg.RET, 0);
                }
                return;
            }
        }

        const offset = this.ctx.getLocal(name);
        if (offset !== undefined) {
            // 检查是否是装箱变量
            const isBoxed = this.ctx.boxedVars && this.ctx.boxedVars.has(name);
            if (isBoxed) {
                // 装箱变量：先加载 box 指针，再解引用获取值
                this.vm.load(VReg.RET, VReg.FP, offset); // 加载 box 指针
                this.vm.load(VReg.RET, VReg.RET, 0); // 解引用获取值
            } else {
                this.vm.load(VReg.RET, VReg.FP, offset);
            }
        } else {
            // 检查是否是主程序被捕获的变量（从全局位置访问）
            const globalLabel = this.ctx.getMainCapturedVar(name);
            if (globalLabel) {
                // 从全局位置加载 box 指针
                this.vm.lea(VReg.RET, globalLabel);
                this.vm.load(VReg.RET, VReg.RET, 0); // 加载 box 指针
                this.vm.load(VReg.RET, VReg.RET, 0); // 解引用获取值
            } else if (name === "print") {
                // 内置函数 print - 生成一个包装闘包
                // 创建一个简单闭包对象 { magic, func_ptr }
                this.vm.movImm(VReg.A0, 16);
                this.vm.call("_alloc");
                this.vm.movImm(VReg.V1, 0xc105); // CLOSURE_MAGIC
                this.vm.store(VReg.RET, 0, VReg.V1);
                this.vm.lea(VReg.V1, "_print_wrapper");
                this.vm.store(VReg.RET, 8, VReg.V1);
            } else if (this.ctx.functions && this.ctx.functions[name]) {
                // 顶层函数 - 创建闭包对象引用
                const funcLabel = "_user_" + name;
                this.vm.movImm(VReg.A0, 16);
                this.vm.call("_alloc");
                this.vm.movImm(VReg.V1, 0xc105); // CLOSURE_MAGIC
                this.vm.store(VReg.RET, 0, VReg.V1);
                this.vm.lea(VReg.V1, funcLabel);
                this.vm.store(VReg.RET, 8, VReg.V1);
            } else if (this.ctx.classes && this.ctx.classes[name]) {
                // 顶层类 - 加载类信息对象
                // 类信息对象结构: [+0: type(3)][+8: constructor][+16: prototype]
                const classInfo = this.ctx.classes[name];
                const classInfoLabel = classInfo.classInfoLabel || `_class_info_${name}`;
                this.vm.lea(VReg.RET, classInfoLabel);
                this.vm.load(VReg.RET, VReg.RET, 0);
            } else {
                this.vm.movImm(VReg.RET, 0);
            }
        }
    },

    // 编译成员表达式 (obj.prop 或 arr[idx])
    compileMemberExpression(expr) {
        // 处理可选链 ?.
        if (expr.optional) {
            const labelId = this.nextLabelId();
            const optionalEndLabel = `_optional_end_${labelId}`;
            const notNullishLabel = `_not_nullish_${labelId}`;
            const checkUndefinedLabel = `_check_undef_${labelId}`;

            // 编译对象表达式
            this.compileExpression(expr.object);
            // 检查对象是否为 null 或 undefined
            // null = 0x7FFA000000000000 (高16位 = 0x7FFA)
            // undefined = 0x7FFB000000000000 (高16位 = 0x7FFB)
            this.vm.shrImm(VReg.V0, VReg.RET, 48);
            // 检查是否是 null (0x7FFA)
            this.vm.movImm(VReg.V1, 0x7ffa);
            this.vm.cmp(VReg.V0, VReg.V1);
            this.vm.jne(checkUndefinedLabel);
            // 是 null，返回 undefined
            this.vm.lea(VReg.RET, "_js_undefined");
            this.vm.load(VReg.RET, VReg.RET, 0);
            this.vm.jmp(optionalEndLabel);

            this.vm.label(checkUndefinedLabel);
            // 检查是否是 undefined (0x7FFB)
            this.vm.movImm(VReg.V1, 0x7ffb);
            this.vm.cmp(VReg.V0, VReg.V1);
            this.vm.jne(notNullishLabel);
            // 是 undefined，返回 undefined
            this.vm.lea(VReg.RET, "_js_undefined");
            this.vm.load(VReg.RET, VReg.RET, 0);
            this.vm.jmp(optionalEndLabel);

            this.vm.label(notNullishLabel);
            // 对象不是 null/undefined，进行属性访问
            // RET 中已有对象值，直接使用
            const propName = expr.property.name || expr.property.value;
            const propLabel = this.asm.addString(propName);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.lea(VReg.A1, propLabel);
            this.vm.call("_object_get");

            this.vm.label(optionalEndLabel);
            return;
        }

        // 特殊处理 Class.prototype 访问
        // 当访问一个类的 prototype 属性时，返回类的 prototype 对象
        if (!expr.computed && expr.object.type === "Identifier" && expr.property.name === "prototype") {
            const className = expr.object.name;
            // 检查是否是已知的类
            if (this.ctx.classes && this.ctx.classes[className]) {
                const classInfo = this.ctx.classes[className];
                const classInfoLabel = classInfo.classInfoLabel || `_class_info_${className}`;
                // 加载类信息对象
                this.vm.lea(VReg.RET, classInfoLabel);
                this.vm.load(VReg.RET, VReg.RET, 0);
                // 从类信息对象中加载 prototype（偏移 16）
                this.vm.load(VReg.RET, VReg.RET, 16);
                return;
            }
            // 如果不是已知类，继续走通用路径
        }

        // 特殊处理 Math 常量
        if (expr.object.type === "Identifier" && expr.object.name === "Math" && !expr.computed) {
            const propName = expr.property.name || expr.property.value;
            const mathConstants = {
                PI: 3.141592653589793,
                E: 2.718281828459045,
                LN2: 0.6931471805599453,
                LN10: 2.302585092994046,
                LOG2E: 1.4426950408889634,
                LOG10E: 0.4342944819032518,
                SQRT2: 1.4142135623730951,
                SQRT1_2: 0.7071067811865476,
            };
            if (mathConstants.hasOwnProperty(propName)) {
                // 直接编译为数字字面量
                this.compileNumericLiteral(mathConstants[propName]);
                return;
            }
        }

        // 特殊处理 process 属性
        if (expr.object.type === "Identifier" && expr.object.name === "process" && !expr.computed) {
            const propName = expr.property.name || expr.property.value;
            if (this.compileProcessProperty(propName)) {
                return;
            }
        }

        if (expr.computed) {
            // 计算属性访问：arr[idx] 或 str[idx]
            const objType = this.inferObjectType ? this.inferObjectType(expr.object) : "unknown";

            if (objType === "String") {
                // 字符串下标访问：str[idx] -> 单字符字符串
                if (expr.property.type === "Literal" && typeof expr.property.value === "number") {
                    // 静态索引
                    const idx = Math.trunc(expr.property.value);
                    this.compileExpression(expr.object);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.movImm(VReg.A1, idx);
                    this.vm.call("_str_charAt");
                } else {
                    // 动态索引
                    this.compileExpression(expr.property);
                    this.vm.push(VReg.RET);
                    this.compileExpression(expr.object);
                    this.vm.pop(VReg.V1);
                    this.numberToIntInPlace(VReg.V1);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.mov(VReg.A1, VReg.V1);
                    this.vm.call("_str_charAt");
                }
            } else if (objType === "TypedArray" || objType === "Buffer") {
                // TypedArray 或 Buffer 元素访问
                // 使用 _subscript_get 来统一处理
                if (expr.property.type === "Literal" && typeof expr.property.value === "number") {
                    // 静态数字索引：arr[0]
                    const idx = Math.trunc(expr.property.value);
                    this.compileExpression(expr.object);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.movImm(VReg.A1, idx);
                    this.vm.call("_subscript_get");
                } else {
                    // 动态索引：arr[i]
                    this.compileExpression(expr.property);
                    this.vm.push(VReg.RET);
                    this.compileExpression(expr.object);
                    this.vm.pop(VReg.V1);
                    this.numberToIntInPlace(VReg.V1);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.mov(VReg.A1, VReg.V1);
                    this.vm.call("_subscript_get");
                }
            } else if (objType === "Array" || objType === "unknown") {
                // 普通数组元素访问：arr[idx]
                // 对于 unknown 类型，检查属性是否是数字
                if (expr.property.type === "Literal" && typeof expr.property.value === "number") {
                    // 静态数字索引：arr[0]
                    const idx = Math.trunc(expr.property.value);
                    this.compileExpression(expr.object);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.movImm(VReg.A1, idx);
                    this.vm.call("_subscript_get");
                } else if (expr.property.type === "Literal" && typeof expr.property.value === "string") {
                    // 静态字符串键：obj["key"]
                    this.compileExpression(expr.object);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.lea(VReg.A1, this.addStringConstant(expr.property.value));
                    this.vm.call("_object_get");
                } else {
                    // 动态索引：arr[i] 或 obj[key]
                    // 使用 _dynamic_subscript_get 处理，它能在运行时检查 key 类型
                    this.compileExpression(expr.property);
                    this.vm.push(VReg.RET);
                    this.compileExpression(expr.object);
                    this.vm.pop(VReg.A1); // A1 = key (JSValue)
                    this.vm.mov(VReg.A0, VReg.RET); // A0 = obj
                    this.vm.call("_dynamic_subscript_get");
                }
            } else {
                // 对象字符串键访问：obj["key"]
                if (expr.property.type === "Literal" && typeof expr.property.value === "string") {
                    this.compileExpression(expr.object);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.lea(VReg.A1, this.addStringConstant(expr.property.value));
                    this.vm.call("_object_get");
                } else {
                    // 动态字符串键
                    this.compileExpression(expr.property);
                    this.vm.push(VReg.RET);
                    this.compileExpression(expr.object);
                    this.vm.pop(VReg.A1);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_object_get");
                }
            }
        } else {
            const propName = expr.property.name || expr.property.value;

            // 特殊处理 .length 属性 - 可能是数组或字符串
            if (propName === "length") {
                const objType = this.inferObjectType ? this.inferObjectType(expr.object) : "unknown";
                // DEBUG: 打印类型推断结果
                if (process.env.DEBUG_LENGTH) {
                    console.log(`[DEBUG] .length access: objType=${objType}, object=${expr.object.type}${expr.object.name ? ":" + expr.object.name : ""}`);
                }
                this.compileExpression(expr.object);

                if (objType === "Array" || objType === "TypedArray" || objType === "Buffer") {
                    // 数组和 TypedArray：调用对应的封装方法获取长度
                    this.vm.mov(VReg.A0, VReg.RET);
                    if (objType === "TypedArray" || objType === "Buffer") {
                        this.vm.call("_typed_array_length");
                    } else {
                        this.vm.call("_array_length");
                    }
                    // 将原始整数按 JS number 语义封装
                    this.boxIntAsNumber(VReg.RET);
                } else if (objType === "String") {
                    // 明确是字符串：调用 _str_length
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_str_length");
                    // _str_length 返回原始整数，按 JS number 语义封装
                    this.boxIntAsNumber(VReg.RET);
                } else if (objType === "Object") {
                    // 明确是对象：使用通用属性访问
                    const propLabel = this.asm.addString("length");
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.lea(VReg.A1, propLabel);
                    this.vm.call("_object_get");
                } else {
                    // 未知类型：运行时检查是数组还是字符串
                    // 调用 _get_length 智能处理数组/字符串/TypedArray/Object
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_get_length");
                    // _get_length 返回已装箱的 number
                }
            } else if (propName === "size") {
                // 特殊处理 Map/Set 的 .size 属性
                const objType = this.inferObjectType ? this.inferObjectType(expr.object) : "unknown";
                if (objType === "Map" || objType === "Set") {
                    this.compileExpression(expr.object);
                    // 先 unbox 获取原始堆指针
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_js_unbox");
                    // Map/Set 内存布局: [type:8][size:8][...]
                    this.vm.load(VReg.RET, VReg.RET, 8);
                    this.boxIntAsNumber(VReg.RET);
                } else {
                    // 未知类型，回退到通用属性访问
                    const propLabel = this.asm.addString(propName);
                    this.compileExpression(expr.object);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.lea(VReg.A1, propLabel);
                    this.vm.call("_object_get");
                }
            } else {
                const propLabel = this.asm.addString(propName);

                this.compileExpression(expr.object);
                // 保存对象引用，稍后作为 thisArg
                const objTempName = `__member_obj_${this.nextLabelId()}`;
                const objOffset = this.ctx.allocLocal(objTempName);
                this.vm.store(VReg.FP, objOffset, VReg.RET);

                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.lea(VReg.A1, propLabel);
                this.vm.load(VReg.A2, VReg.FP, objOffset); // thisArg = obj
                this.vm.call("_object_get_prop");
            }
        }
    },

    // 将 JavaScript double 转换为 16 进制字符串（用于常量折叠）
    _doubleToHex(value) {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        view.setFloat64(0, value, false); // big-endian
        let hex = "";
        for (let i = 0; i < 8; i++) {
            hex += view.getUint8(i).toString(16).padStart(2, "0");
        }
        return hex;
    },
};
