// JSBin 编译器 - 数据结构编译
// 编译数组表达式、对象表达式

import { VReg } from "../../vm/index.js";

// 数据结构编译方法混入
export const DataStructureCompiler = {
    // 编译数组表达式 [a, b, c]
    compileArrayExpression(expr) {
        const elements = expr.elements || [];

        // 检查是否有展开元素
        const hasSpread = elements.some((el) => el && el.type === "SpreadElement");

        if (hasSpread) {
            // 有展开元素，使用动态方式构建数组
            this.compileArrayExpressionWithSpread(expr);
            return;
        }

        const count = elements.length;

        // 统一走数组运行时封装，避免手写数组头/布局导致的不一致
        this.vm.movImm(VReg.A0, count);
        this.vm.call("_array_new_with_size");

        // 将数组指针保存到局部变量槽位，避免被 compileExpression 破坏
        const arrTempName = `__arr_temp_${this.nextLabelId()}`;
        const arrOffset = this.ctx.allocLocal(arrTempName);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 填充元素：_array_set(arr, index, value)
        for (let i = 0; i < count; i++) {
            if (!elements[i]) continue;
            this.compileExpression(elements[i]);
            this.vm.mov(VReg.A2, VReg.RET);
            this.vm.load(VReg.A0, VReg.FP, arrOffset);
            this.vm.movImm(VReg.A1, i);
            this.vm.call("_array_set");
        }

        // 返回 boxed 数组 - _array_new_with_size 已经返回 boxed 值，直接加载即可
        this.vm.load(VReg.RET, VReg.FP, arrOffset);
    },

    // 编译包含展开元素的数组表达式 [...arr1, x, ...arr2]
    compileArrayExpressionWithSpread(expr) {
        const elements = expr.elements || [];

        // 创建空数组
        this.vm.movImm(VReg.A0, 0);
        this.vm.call("_array_new_with_size");

        // 保存数组指针
        const arrTempName = `__arr_spread_${this.nextLabelId()}`;
        const arrOffset = this.ctx.allocLocal(arrTempName);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (!el) continue;

            if (el.type === "SpreadElement") {
                // 展开元素：将源数组的所有元素 push 到目标数组
                this.compileExpression(el.argument);
                this.vm.mov(VReg.A1, VReg.RET); // A1 = 源数组
                this.vm.load(VReg.A0, VReg.FP, arrOffset); // A0 = 目标数组
                this.vm.call("_array_concat_into"); // 将源数组元素追加到目标数组
            } else {
                // 普通元素：push 到数组
                this.compileExpression(el);
                this.vm.mov(VReg.A1, VReg.RET); // A1 = 值
                this.vm.load(VReg.A0, VReg.FP, arrOffset); // A0 = 数组
                this.vm.call("_array_push");
            }
        }

        this.vm.load(VReg.RET, VReg.FP, arrOffset);
    },

    // 编译对象表达式 { a: 1, b: 2 }
    compileObjectExpression(expr) {
        const props = expr.properties || [];
        const count = props.length;

        // 统一走对象运行时封装，避免手写对象头/布局导致的不一致
        this.vm.call("_object_new");

        // 将对象指针保存到局部变量槽位，避免被 compileExpression 破坏
        const objTempName = `__obj_temp_${this.nextLabelId()}`;
        const objOffset = this.ctx.allocLocal(objTempName);
        this.vm.store(VReg.FP, objOffset, VReg.RET);

        // 填充属性：_object_set(obj, key, value)
        for (let i = 0; i < count; i++) {
            const prop = props[i];
            if (!prop || !prop.key) continue;

            // 计算属性名：{ [expr]: value } - 运行时计算 key
            if (prop.computed) {
                // 先计算 key 表达式
                this.compileExpression(prop.key);
                const keyTempName = `__prop_key_${this.nextLabelId()}`;
                const keyOffset = this.ctx.allocLocal(keyTempName);
                this.vm.store(VReg.FP, keyOffset, VReg.RET);

                // 再计算 value 表达式
                if (!prop.value) continue;
                this.compileExpression(prop.value);
                this.vm.mov(VReg.A2, VReg.RET);

                // 加载 key（需要转为字符串指针）
                this.vm.load(VReg.A1, VReg.FP, keyOffset);
                // 加载 obj
                this.vm.load(VReg.A0, VReg.FP, objOffset);
                this.vm.call("_object_set");
                continue;
            }

            // 静态属性名
            let keyName;
            if (prop.key.type === "Identifier") {
                keyName = prop.key.name;
            } else if (prop.key.type === "Literal" || prop.key.type === "StringLiteral") {
                keyName = String(prop.key.value);
            } else {
                continue;
            }

            if (!prop.value) continue;

            const keyLabel = this.asm.addString(keyName);
            this.compileExpression(prop.value);
            this.vm.mov(VReg.A2, VReg.RET);
            this.vm.load(VReg.A0, VReg.FP, objOffset);
            this.vm.lea(VReg.A1, keyLabel);
            this.vm.call("_object_set");
        }

        this.vm.load(VReg.RET, VReg.FP, objOffset);
    },
};
