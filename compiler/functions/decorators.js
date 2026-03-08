// JSBin 编译器 - 装饰器支持
// TC39 Stage 3 装饰器实现
//
// 装饰器是一个函数，接收被装饰的值和上下文，返回新值或 undefined
//
// 类装饰器: (value, context) => newClass | undefined
// 方法装饰器: (value, context) => newMethod | undefined
// 字段装饰器: (value, context) => initializer | undefined
// getter/setter 装饰器: (value, context) => newAccessor | undefined
//
// context 对象结构:
// {
//   kind: "class" | "method" | "getter" | "setter" | "field" | "accessor",
//   name: string | symbol,
//   static: boolean,
//   private: boolean,
//   access: { get(), set(v) },  // 仅用于 field/accessor
//   addInitializer(fn): void    // 添加初始化函数
// }

import { VReg } from "../../vm/index.js";

export const DecoratorCompiler = {
    // 编译类装饰器
    // @decorator class Foo {}
    // 转换为: Foo = decorator(Foo, { kind: "class", name: "Foo" }) ?? Foo
    compileClassDecorators(classDecl, className) {
        if (!classDecl.decorators || classDecl.decorators.length === 0) {
            return;
        }

        // 从最后一个装饰器开始应用（内到外）
        for (let i = classDecl.decorators.length - 1; i >= 0; i--) {
            const decorator = classDecl.decorators[i];

            // 创建 context 对象
            // { kind: "class", name: className }
            this.vm.call("_object_new");
            this.vm.mov(VReg.S0, VReg.RET); // context

            // 设置 kind = "class"
            this.vm.lea(VReg.A0, "_str_kind");
            this.vm.mov(VReg.A1, VReg.RET);
            this.vm.lea(VReg.A0, "_str_class");
            this.vm.mov(VReg.A2, VReg.RET);
            this.vm.mov(VReg.A0, VReg.S0);
            this.vm.call("_object_set");

            // 设置 name = className
            this.vm.lea(VReg.A0, "_str_name");
            this.vm.mov(VReg.A1, VReg.RET);
            // className 需要动态生成或使用预定义字符串

            // 加载类构造函数
            const classOffset = this.ctx.getLocal(className);
            this.vm.load(VReg.A0, VReg.FP, classOffset);

            // context 作为第二个参数
            this.vm.mov(VReg.A1, VReg.S0);

            // 调用装饰器
            this.compileExpression(decorator.expression);
            this.vm.mov(VReg.V0, VReg.RET);

            // 如果装饰器是调用表达式，RET 已经是函数指针
            // 否则需要调用装饰器函数
            if (decorator.expression.type !== "CallExpression") {
                this.vm.load(VReg.V1, VReg.RET, 8); // 函数指针
                this.vm.callr(VReg.V1);
            }

            // 如果返回值不是 undefined，替换类
            this.vm.movImm64(VReg.V0, "0x7ffb000000000000"); // JS_UNDEFINED
            this.vm.cmp(VReg.RET, VReg.V0);
            const skipLabel = this.ctx.newLabel("_dec_skip");
            this.vm.jeq(skipLabel);

            // 更新类变量
            this.vm.store(VReg.FP, classOffset, VReg.RET);

            this.vm.label(skipLabel);
        }
    },

    // 编译方法装饰器
    // @decorator method() {}
    // 转换为: method = decorator(method, context) ?? method
    compileMethodDecorators(method, classRef, isStatic) {
        if (!method.decorators || method.decorators.length === 0) {
            return;
        }

        const methodName = method.key.name || method.key.value;
        const isPrivate = method.key.type === "PrivateIdentifier";
        const kind = method.kind; // "method", "get", "set"

        for (let i = method.decorators.length - 1; i >= 0; i--) {
            const decorator = method.decorators[i];

            // 创建 context 对象
            this.vm.call("_object_new");
            this.vm.mov(VReg.S0, VReg.RET);

            // kind
            let kindStr = kind === "get" ? "_str_getter" : kind === "set" ? "_str_setter" : "_str_method";
            this.vm.lea(VReg.A0, "_str_kind");
            this.vm.mov(VReg.A1, VReg.RET);
            this.vm.lea(VReg.A0, kindStr);
            this.vm.mov(VReg.A2, VReg.RET);
            this.vm.mov(VReg.A0, VReg.S0);
            this.vm.call("_object_set");

            // static
            this.vm.lea(VReg.A0, "_str_static");
            this.vm.mov(VReg.A1, VReg.RET);
            if (isStatic) {
                this.vm.lea(VReg.A2, "_js_true");
            } else {
                this.vm.lea(VReg.A2, "_js_false");
            }
            this.vm.load(VReg.A2, VReg.A2, 0);
            this.vm.mov(VReg.A0, VReg.S0);
            this.vm.call("_object_set");

            // private
            this.vm.lea(VReg.A0, "_str_private");
            this.vm.mov(VReg.A1, VReg.RET);
            if (isPrivate) {
                this.vm.lea(VReg.A2, "_js_true");
            } else {
                this.vm.lea(VReg.A2, "_js_false");
            }
            this.vm.load(VReg.A2, VReg.A2, 0);
            this.vm.mov(VReg.A0, VReg.S0);
            this.vm.call("_object_set");

            // TODO: 获取方法函数引用并调用装饰器
            // 这需要更复杂的代码生成来处理原型链上的方法
        }
    },

    // 编译字段装饰器
    // @decorator field = value
    // 转换为: 初始化时调用装饰器返回的 initializer
    compileFieldDecorators(field, classRef, isStatic) {
        if (!field.decorators || field.decorators.length === 0) {
            return null; // 返回 null 表示没有装饰器
        }

        // 字段装饰器返回一个 initializer 函数
        // 在字段初始化时调用
        const fieldName = field.key.name || field.key.value;
        const isPrivate = field.key.type === "PrivateIdentifier";

        // 收集所有装饰器的 initializers
        // 返回一个包装函数，依次调用所有 initializers

        return {
            name: fieldName,
            isPrivate,
            isStatic,
            decorators: field.decorators,
        };
    },

    // 生成装饰器所需的字符串常量
    generateDecoratorStrings(asm) {
        // 装饰器 context 需要的字符串
        const strings = {
            _str_kind: "kind",
            _str_name: "name",
            _str_static: "static",
            _str_private: "private",
            _str_access: "access",
            _str_class: "class",
            _str_method: "method",
            _str_field: "field",
            _str_getter: "getter",
            _str_setter: "setter",
            _str_accessor: "accessor",
            _str_addInitializer: "addInitializer",
        };

        for (const [label, str] of Object.entries(strings)) {
            // 检查是否已存在
            if (!asm.hasLabel(label)) {
                asm.addDataLabel(label);
                // 字符串格式: [type:4][length:4][content...]
                const len = str.length;
                // header = (len << 32) | 16, 其中 TYPE_STRING = 16
                // 使用字符串格式传递，让 addDataQword 处理
                const headerLow = 16; // type
                const headerHigh = len; // length
                // 用两个 32-bit dword 代替一个 64-bit qword
                asm.addDataDword(headerLow);
                asm.addDataDword(headerHigh);
                for (let i = 0; i < str.length; i++) {
                    asm.addDataByte(str.charCodeAt(i));
                }
                asm.addDataByte(0); // null terminator
                // 对齐到 8 字节
                const padding = (8 - ((str.length + 1) % 8)) % 8;
                for (let i = 0; i < padding; i++) {
                    asm.addDataByte(0);
                }
            }
        }
    },
};
