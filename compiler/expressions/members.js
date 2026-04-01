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

        // 特殊值：NaN (Not-a-Number)
        // 注意: 不能使用原始 IEEE 754 NaN 位模式 (0x7FF8000000000000)，
        // 因为那与 NaN-boxing 的 tag 0 冲突。改用抛出异常方式让调用者处理。
        if (name === "NaN") {
            // 对于 NaN 标识符，返回一个不可打印的值，让 console.log 等特殊处理
            // 由于 NaN 无法通过值传递（与 NaN-boxing 冲突），需要通过字符串方式处理
            // 但这里我们返回 0，让调用者（如 console.log）通过检查标识符来处理
            this.vm.movImm(VReg.RET, 0);
            return;
        }

        // 特殊值：Infinity
        if (name === "Infinity") {
            this.vm.movImm(VReg.RET, 0);
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

        const offset = this.ctx.getLocal(name);
        console.log(`DEBUG compileIdentifier: ${name}, offset=${offset}, boxed=${this.ctx.boxedVars && this.ctx.boxedVars.has(name)}, hasFunction=${this.ctx.hasFunction(name)}`);
        if (offset !== undefined) {
            // 检查是否是装箱变量
            const isBoxed = this.ctx.boxedVars && this.ctx.boxedVars.has(name);
            if (isBoxed) {
                // 装箱变量：先加载 box 指针，再解引用获取值
                this.vm.load(VReg.RET, VReg.FP, offset); // 加载 box 指针
                this.vm.load(VReg.RET, VReg.RET, 0); // 解引用获取值
                this.emitUninitializedBindingGuard(name, VReg.RET);
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
                this.emitUninitializedBindingGuard(name, VReg.RET);
            } else if (this.ctx.hasFunction(name)) {
                // 检查是否是全局函数/类
                // 创建一个闭包对象，以便可以作为对象访问（如 path.dirname）
                this.vm.movImm(VReg.A0, 16);
                this.vm.call("_alloc");
                this.vm.mov(VReg.S0, VReg.RET);
                
                this.vm.movImm(VReg.V1, 0xc105); // CLOSURE_MAGIC
                this.vm.store(VReg.S0, 0, VReg.V1);
                this.vm.lea(VReg.V1, this.getFunctionLabel(name));
                this.vm.store(VReg.S0, 8, VReg.V1);
                
                // 包装为 JSValue function
                this.vm.mov(VReg.A0, VReg.S0);
                this.vm.call("_js_box_function");
            } else if (name === "print") {
                // 内置函数 print - 生成一个包装闭包
                // 创建一个简单闭包对象 { magic, func_ptr }
                this.vm.movImm(VReg.A0, 16);
                this.vm.call("_alloc");
                this.vm.movImm(VReg.V1, 0xc105); // CLOSURE_MAGIC
                this.vm.store(VReg.RET, 0, VReg.V1);
                this.vm.lea(VReg.V1, "_print_wrapper");
                this.vm.store(VReg.RET, 8, VReg.V1);
            } else {
                this.vm.movImm(VReg.RET, 0);
            }
        }
    },

    // 编译成员表达式 (obj.prop 或 arr[idx])
    compileMemberExpression(expr) {
        if (expr.computed) {
            // 数组元素访问：arr[idx]
            // 检查对象类型以选择正确的处理方式
            const objType = this.inferObjectType ? this.inferObjectType(expr.object) : "unknown";

            // 字符串索引：使用 _str_charAt
            if (objType === "String") {
                if (expr.property.type === "Literal" && typeof expr.property.value === "number") {
                    // 静态索引："str"[0]
                    const idx = Math.trunc(expr.property.value);
                    this.compileExpression(expr.object);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.movImm(VReg.A1, idx);
                    this.vm.call("_str_charAt");
                } else {
                    // 动态索引："str"[i]
                    this.compileExpression(expr.property);
                    this.vm.push(VReg.RET);
                    this.compileExpression(expr.object);
                    this.vm.pop(VReg.V1);

                    // 索引可能是浮点数，需要转换为整数
                    this.numberToIntInPlace(VReg.V1);

                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.mov(VReg.A1, VReg.V1);
                    this.vm.call("_str_charAt");
                }
            } else if (expr.property.type === "Literal" && typeof expr.property.value === "number") {
                // 静态索引：arr[0]
                const idx = Math.trunc(expr.property.value);
                this.compileExpression(expr.object);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_js_unbox"); // unbox JSValue 得到裸指针
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.movImm(VReg.A1, idx);
                this.vm.call("_subscript_get");
            } else if (expr.property.type === "Literal" && typeof expr.property.value === "string") {
                // 对象静态字符串属性：({a:1})["a"]
                const propName = expr.property.value;
                const propLabel = this.asm.addString(propName);
                this.compileExpression(expr.object);
                this.vm.mov(VReg.A0, VReg.RET); // A0 = boxed JSValue object
                // Box the property key label as a JSValue string
                this.vm.lea(VReg.A1, propLabel);
                this.vm.movImm64(VReg.V1, 0x7ffc000000000000n);
                this.vm.or(VReg.A1, VReg.A1, VReg.V1);
                this.vm.call("_object_get");
            } else {
                // 动态索引：arr[i]
                this.compileExpression(expr.property);
                this.vm.push(VReg.RET);
                this.compileExpression(expr.object);
                this.vm.pop(VReg.V1);

                // 索引可能是浮点数，需要转换为整数
                this.numberToIntInPlace(VReg.V1);

                // unbox JSValue 得到裸指针
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_js_unbox");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.mov(VReg.A1, VReg.V1);
                this.vm.call("_subscript_get");
            }
        } else {
            const propName = expr.property.name || expr.property.value;

            // 特殊处理 .length 属性 - 可能是数组或字符串
            if (propName === "length") {
                const objType = this.inferObjectType ? this.inferObjectType(expr.object) : "unknown";
                this.compileExpression(expr.object);

                if (objType === "Array" || objType === "TypedArray") {
                    // 数组和 TypedArray：调用对应的封装方法获取长度
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_js_unbox"); // unbox JSValue 得到裸指针
                    if (objType === "TypedArray") {
                        this.vm.call("_typed_array_length");
                    } else {
                        this.vm.call("_array_length");
                    }
                    // 将原始整数按 JS number 语义封装
                    this.boxIntAsNumber(VReg.RET);
                } else {
                    // 字符串或未知类型：调用 _str_length（智能处理堆/数据段字符串）
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_str_length");
                    // _str_length 返回原始整数，按 JS number 语义封装
                    this.boxIntAsNumber(VReg.RET);
                }
            } else {
                // 特殊处理 import.meta.url
                if (expr.object.type === "MetaProperty" && propName === "url") {
                    const url = "file://" + (this.sourcePath || ".") + "/module.js";
                    const label = this.asm.addString(url);
                    this.vm.lea(VReg.A0, label);
                    this.vm.call("_js_box_string");
                    return;
                }

                const propLabel = this.asm.addString(propName);

                this.compileExpression(expr.object);
                this.vm.mov(VReg.A0, VReg.RET); // A0 = boxed JSValue object
                // Box the property key label as a JSValue string (TAG_STRING_BASE = 0x7FFC...)
                this.vm.lea(VReg.A1, propLabel);
                this.vm.movImm64(VReg.V1, 0x7ffc000000000000n);
                this.vm.or(VReg.A1, VReg.A1, VReg.V1);
                this.vm.call("_object_get");
            }
        }
    },
    // 编译元属性 (如 import.meta)
    compileMetaProperty(expr) {
        const meta = expr.meta.name;
        const prop = expr.property.name;

        if (meta === "import" && prop === "meta") {
            // 返回一个标记为 MetaProperty 的特殊值或对象
            // 在 JSBin 中，我们可以分配一个空对象，等 MemberExpression 来读取
            this.vm.movImm(VReg.A0, 16);
            this.vm.call("_alloc");
            this.vm.mov(VReg.S0, VReg.RET);
            this.vm.movImm(VReg.V1, 2); // TYPE_OBJECT
            this.vm.store(VReg.S0, 0, VReg.V1);
            this.vm.mov(VReg.RET, VReg.S0);
            return;
        }
        this.vm.movImm(VReg.RET, 0);
    },
};
