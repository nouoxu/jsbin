// JSBin 私有字段实现
// 支持 ES2022 类私有字段和方法 (#field, #method)

import { VReg } from "../../../vm/index.js";

/**
 * 私有字段实现策略:
 *
 * 1. 使用 WeakMap 存储私有字段（符合规范）
 *    - 每个类有一个 WeakMap 用于存储所有实例的私有字段
 *    - key = 实例对象, value = 私有字段对象
 *
 * 2. 简化实现（当前采用）
 *    - 私有字段存储在对象的隐藏属性中
 *    - 使用特殊前缀 "__private_" + className + "_" + fieldName
 *    - 访问检查通过 brand check 实现
 *
 * 私有字段布局:
 *   对象属性: `__private_ClassName_#fieldName` = value
 *
 * Brand Check:
 *   检查对象是否有特定类的私有字段品牌标记
 *   `__brand_ClassName` = true
 */

// 私有字段错误类型
const PRIVATE_FIELD_ERRORS = {
    NOT_DEFINED: "Cannot access private field on object without it being defined",
    WRONG_CLASS: "Cannot access private field from different class",
    NOT_INSTANCE: "Cannot access private field on non-instance object",
};

export class PrivateFieldGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generatePrivateFieldGet();
        this.generatePrivateFieldSet();
        this.generatePrivateFieldHas();
        this.generateBrandCheck();
        this.generatePrivateMethodGet();
    }

    /**
     * 获取私有字段值
     * A0 = 对象指针
     * A1 = 类名指针 (字符串)
     * A2 = 字段名指针 (字符串，包含 #)
     * RET = 字段值
     */
    generatePrivateFieldGet() {
        const vm = this.vm;

        vm.label("_private_field_get");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // 对象
        vm.mov(VReg.S1, VReg.A1); // 类名
        vm.mov(VReg.S2, VReg.A2); // 字段名

        // 先进行 brand check
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_private_brand_check");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_private_field_get_error");

        // 构造属性键: "__private_" + className + "_" + fieldName
        vm.movImm(VReg.A0, 64); // 分配临时缓冲区
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);

        // 复制前缀 "__private_"
        vm.lea(VReg.A0, "_str_private_prefix");
        vm.mov(VReg.A1, VReg.S3);
        vm.call("_strcpy");

        // 追加类名
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcat");

        // 追加 "_"
        vm.lea(VReg.A0, "_str_underscore");
        vm.mov(VReg.A1, VReg.S3);
        vm.call("_strcat");

        // 追加字段名
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S2);
        vm.call("_strcat");

        // 获取属性值
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S3);
        vm.call("_object_get");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        // 错误处理：返回 undefined（简化版本，不抛异常）
        vm.label("_private_field_get_error");
        vm.lea(VReg.RET, "_js_undefined");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    /**
     * 设置私有字段值
     * A0 = 对象指针
     * A1 = 类名指针
     * A2 = 字段名指针
     * A3 = 值
     */
    generatePrivateFieldSet() {
        const vm = this.vm;

        vm.label("_private_field_set");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // 对象
        vm.mov(VReg.S1, VReg.A1); // 类名
        vm.mov(VReg.S2, VReg.A2); // 字段名
        vm.mov(VReg.S4, VReg.A3); // 值

        // Brand check
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_private_brand_check");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_private_field_set_error");

        // 构造属性键
        vm.movImm(VReg.A0, 64);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);

        vm.lea(VReg.A0, "_str_private_prefix");
        vm.mov(VReg.A1, VReg.S3);
        vm.call("_strcpy");

        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcat");

        vm.lea(VReg.A0, "_str_underscore");
        vm.mov(VReg.A1, VReg.S3);
        vm.call("_strcat");

        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S2);
        vm.call("_strcat");

        // 设置属性值
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S3);
        vm.mov(VReg.A2, VReg.S4);
        vm.call("_object_set");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);

        // 错误处理：静默失败
        vm.label("_private_field_set_error");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    /**
     * 检查对象是否有私有字段 (#field in obj)
     * A0 = 对象
     * A1 = 类名
     * RET = 1 (有) 或 0 (没有)
     */
    generatePrivateFieldHas() {
        const vm = this.vm;

        vm.label("_private_field_has");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        // 检查 brand
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_private_brand_check");
        // RET 已经是 0 或 1

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    /**
     * Brand Check - 检查对象是否有特定类的品牌标记
     * A0 = 对象
     * A1 = 类名
     * RET = 1 (有品牌) 或 0 (无品牌)
     */
    generateBrandCheck() {
        const vm = this.vm;

        vm.label("_private_brand_check");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // 对象
        vm.mov(VReg.S1, VReg.A1); // 类名

        // 检查对象是否为 null/undefined
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_brand_check_false");

        // 构造 brand key: "__brand_" + className
        vm.movImm(VReg.A0, 32);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET);

        vm.lea(VReg.A0, "_str_brand_prefix");
        vm.mov(VReg.A1, VReg.S2);
        vm.call("_strcpy");

        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcat");

        // 检查对象是否有该属性
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S2);
        vm.call("_object_has");
        // RET = 1 或 0

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_brand_check_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * 获取私有方法
     * A0 = 对象
     * A1 = 类名
     * A2 = 方法名
     * RET = 方法函数指针
     */
    generatePrivateMethodGet() {
        const vm = this.vm;

        vm.label("_private_method_get");
        // 私有方法类似私有字段，但存储的是函数指针
        // 简化：委托给 _private_field_get
        vm.jmp("_private_field_get");
    }
}

/**
 * 生成私有字段相关的字符串常量
 */
export function generatePrivateFieldStrings(asm) {
    asm.dataString("_str_private_prefix", "__private_");
    asm.dataString("_str_brand_prefix", "__brand_");
    asm.dataString("_str_underscore", "_");
    asm.dataString("_str_private_error", "TypeError: Cannot access private field");
}
