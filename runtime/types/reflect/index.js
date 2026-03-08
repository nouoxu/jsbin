// JSBin Reflect 运行时
// ES6 Reflect 对象实现
//
// Reflect 提供了拦截 JavaScript 操作的方法
// 这些方法与 Proxy handler 方法相同

import { VReg } from "../../../vm/registers.js";
import { JS_UNDEFINED, JS_TRUE, JS_FALSE } from "../../core/jsvalue.js";

export class ReflectGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // Reflect.get(target, propertyKey[, receiver])
    generateReflectGet() {
        const vm = this.vm;

        vm.label("_reflect_get");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // target
        vm.mov(VReg.S1, VReg.A1); // propertyKey

        // 直接调用 object_get
        vm.call("_object_get");
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // Reflect.set(target, propertyKey, value[, receiver])
    generateReflectSet() {
        const vm = this.vm;

        vm.label("_reflect_set");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // target
        vm.mov(VReg.S1, VReg.A1); // propertyKey
        vm.mov(VReg.S2, VReg.A2); // value

        vm.call("_object_set");

        // 返回 true
        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 16);
    }

    // Reflect.has(target, propertyKey)
    generateReflectHas() {
        const vm = this.vm;

        vm.label("_reflect_has");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.call("_object_has");
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // Reflect.deleteProperty(target, propertyKey)
    generateReflectDeleteProperty() {
        const vm = this.vm;

        vm.label("_reflect_deleteProperty");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.call("_object_delete");
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // Reflect.apply(target, thisArgument, argumentsList)
    generateReflectApply() {
        const vm = this.vm;

        vm.label("_reflect_apply");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // target function
        vm.mov(VReg.S1, VReg.A1); // thisArg
        vm.mov(VReg.S2, VReg.A2); // argumentsList

        // unbox 函数
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.V0, VReg.RET);

        // 获取参数数组长度
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.V1, VReg.RET);
        vm.load(VReg.V2, VReg.V1, 0); // length

        // 根据参数数量调用（简化版，最多支持 6 个参数）
        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_reflect_apply_0");
        vm.cmpImm(VReg.V2, 1);
        vm.jeq("_reflect_apply_1");
        vm.cmpImm(VReg.V2, 2);
        vm.jeq("_reflect_apply_2");
        // 更多参数...

        vm.label("_reflect_apply_0");
        vm.load(VReg.V3, VReg.V0, 8); // 函数指针
        vm.callr(VReg.V3);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_reflect_apply_1");
        vm.load(VReg.A0, VReg.V1, 16); // args[0]
        vm.load(VReg.V3, VReg.V0, 8);
        vm.callr(VReg.V3);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_reflect_apply_2");
        vm.load(VReg.A0, VReg.V1, 16);
        vm.load(VReg.A1, VReg.V1, 24);
        vm.load(VReg.V3, VReg.V0, 8);
        vm.callr(VReg.V3);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // Reflect.construct(target, argumentsList[, newTarget])
    generateReflectConstruct() {
        const vm = this.vm;

        vm.label("_reflect_construct");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // constructor
        vm.mov(VReg.S1, VReg.A1); // argumentsList

        // 创建新对象
        vm.call("_object_new");
        vm.mov(VReg.V0, VReg.RET);

        // 调用构造函数
        // TODO: 传递 this 和参数

        vm.mov(VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // Reflect.getPrototypeOf(target)
    generateReflectGetPrototypeOf() {
        const vm = this.vm;

        vm.label("_reflect_getPrototypeOf");
        vm.prologue(0, []);

        // 简化实现：返回 null（没有原型链支持）
        vm.movImm64(VReg.RET, "0x7ffb000000000000");
        vm.epilogue([], 0);
    }

    // Reflect.setPrototypeOf(target, prototype)
    generateReflectSetPrototypeOf() {
        const vm = this.vm;

        vm.label("_reflect_setPrototypeOf");
        vm.prologue(0, []);

        // 简化实现：总是返回 false
        vm.lea(VReg.RET, "_js_false");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([], 0);
    }

    // Reflect.isExtensible(target)
    generateReflectIsExtensible() {
        const vm = this.vm;

        vm.label("_reflect_isExtensible");
        vm.prologue(0, []);

        // 简化实现：总是返回 true
        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([], 0);
    }

    // Reflect.preventExtensions(target)
    generateReflectPreventExtensions() {
        const vm = this.vm;

        vm.label("_reflect_preventExtensions");
        vm.prologue(0, []);

        // 简化实现：总是返回 true
        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([], 0);
    }

    // Reflect.ownKeys(target)
    generateReflectOwnKeys() {
        const vm = this.vm;

        vm.label("_reflect_ownKeys");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 调用 _object_keys
        vm.call("_object_keys");
        vm.epilogue([VReg.S0], 16);
    }

    generate() {
        this.generateReflectGet();
        this.generateReflectSet();
        this.generateReflectHas();
        this.generateReflectDeleteProperty();
        this.generateReflectApply();
        this.generateReflectConstruct();
        this.generateReflectGetPrototypeOf();
        this.generateReflectSetPrototypeOf();
        this.generateReflectIsExtensible();
        this.generateReflectPreventExtensions();
        this.generateReflectOwnKeys();
    }
}
