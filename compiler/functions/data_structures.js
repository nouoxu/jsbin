// JSBin 编译器 - 数据结构编译
// 编译数组表达式、对象表达式

import { VReg } from "../../vm/index.js";

// 数据结构编译方法混入
export const DataStructureCompiler = {
    // 编译数组表达式 [a, b, c]
    compileArrayExpression(expr) {
        const elements = expr.elements || [];
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

        // 将原始指针装箱为 JSValue 数组
        // JSValue = (ptr & 0x0000ffffffffffff) | 0x7ffe000000000000
        this.vm.load(VReg.V2, VReg.FP, arrOffset);  // V2 = 原始指针
        this.vm.movImm64(VReg.V1, 0x0000ffffffffffffn);  // V1 = MASK
        this.vm.and(VReg.V2, VReg.V2, VReg.V1);  // V2 = V2 & V1 = ptr & MASK
        this.vm.movImm64(VReg.V1, 0x7ffe000000000000n);  // V1 = TAG (array)
        this.vm.or(VReg.RET, VReg.V2, VReg.V1);  // RET = (ptr & MASK) | TAG
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
            // Box the object pointer before calling _object_set (expects JSValue with tag 0x7FFD)
            this.vm.load(VReg.V0, VReg.FP, objOffset);  // V0 = raw object pointer
            this.vm.movImm64(VReg.V1, 0x0000ffffffffffffn);  // V1 = MASK
            this.vm.and(VReg.V0, VReg.V0, VReg.V1);  // V0 = V0 & MASK
            this.vm.movImm64(VReg.V1, 0x7ffd000000000000n);  // V1 = TAG (object)
            this.vm.or(VReg.A0, VReg.V0, VReg.V1);  // A0 = boxed object JSValue
            this.vm.lea(VReg.A1, keyLabel);
            // Box the property key label as a JSValue string (TAG_STRING_BASE = 0x7FFC...)
            this.vm.movImm64(VReg.V0, 0x7ffc000000000000n);
            this.vm.or(VReg.A1, VReg.A1, VReg.V0);
            this.vm.call("_object_set");
        }

        // 将原始指针装箱为 JSValue 对象
        // JSValue = (ptr & 0x0000ffffffffffff) | 0x7ffd000000000000
        this.vm.load(VReg.V2, VReg.FP, objOffset);  // V2 = 原始指针
        this.vm.movImm64(VReg.V1, 0x0000ffffffffffffn);  // V1 = MASK
        this.vm.and(VReg.V2, VReg.V2, VReg.V1);  // V2 = V2 & V1 = ptr & MASK
        this.vm.movImm64(VReg.V1, 0x7ffd000000000000n);  // V1 = TAG (object)
        this.vm.or(VReg.RET, VReg.V2, VReg.V1);  // RET = (ptr & MASK) | TAG
    },
};
