// JSBin Proxy 运行时
// ES6 Proxy 对象实现
//
// Proxy 是一个对象，可以拦截并自定义对目标对象的操作
// 支持的 trap:
// - get(target, property, receiver)
// - set(target, property, value, receiver)
// - has(target, property)
// - deleteProperty(target, property)
// - apply(target, thisArg, argumentsList)
// - construct(target, argumentsList, newTarget)
// - getPrototypeOf(target)
// - setPrototypeOf(target, prototype)
// - isExtensible(target)
// - preventExtensions(target)
// - getOwnPropertyDescriptor(target, property)
// - defineProperty(target, property, descriptor)
// - ownKeys(target)
//
// Proxy 布局:
//   offset 0:  type (8 bytes) = TYPE_PROXY = 22
//   offset 8:  target (8 bytes) - 目标对象
//   offset 16: handler (8 bytes) - 处理器对象
//   offset 24: revoked (8 bytes) - 是否已撤销 (0 or 1)

import { VReg } from "../../../vm/registers.js";
import { JS_UNDEFINED, JS_NULL } from "../../core/jsvalue.js";

const TYPE_PROXY = 22;
const PROXY_SIZE = 32;

export class ProxyGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // _proxy_new(target, handler) -> Proxy 指针
    generateProxyNew() {
        const vm = this.vm;

        vm.label("_proxy_new");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // target
        vm.mov(VReg.S1, VReg.A1); // handler

        // 分配 Proxy 对象
        vm.movImm(VReg.A0, PROXY_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.V0, VReg.RET);

        // 设置类型
        vm.movImm(VReg.V1, TYPE_PROXY);
        vm.store(VReg.V0, 0, VReg.V1);

        // 设置 target
        vm.store(VReg.V0, 8, VReg.S0);

        // 设置 handler
        vm.store(VReg.V0, 16, VReg.S1);

        // 设置 revoked = 0
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.V0, 24, VReg.V1);

        vm.mov(VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // _proxy_get(proxy, property) -> value
    // 调用 handler.get(target, property, proxy) 或直接访问 target
    generateProxyGet() {
        const vm = this.vm;

        vm.label("_proxy_get");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // proxy
        vm.mov(VReg.S1, VReg.A1); // property

        // 检查是否已撤销
        vm.load(VReg.V0, VReg.S0, 24);
        vm.cmpImm(VReg.V0, 0);
        vm.jne("_proxy_get_revoked");

        // 获取 target 和 handler
        vm.load(VReg.S2, VReg.S0, 8); // target
        vm.load(VReg.S3, VReg.S0, 16); // handler

        // 检查 handler.get 是否存在
        vm.mov(VReg.A0, VReg.S3);
        vm.lea(VReg.A1, "_str_get");
        vm.call("_js_box_string");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_object_get");

        // 如果 get trap 不存在或为 undefined，直接访问 target
        vm.movImm64(VReg.V1, "0x7ffb000000000000"); // JS_UNDEFINED
        vm.cmp(VReg.RET, VReg.V1);
        vm.jeq("_proxy_get_direct");

        // 调用 handler.get(target, property, proxy)
        vm.mov(VReg.V0, VReg.RET); // get function
        vm.mov(VReg.A0, VReg.S2); // target
        vm.mov(VReg.A1, VReg.S1); // property
        vm.mov(VReg.A2, VReg.S0); // receiver (proxy)

        // 调用 trap
        vm.call("_js_unbox");
        vm.load(VReg.V1, VReg.RET, 8); // 函数指针
        vm.callr(VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_proxy_get_direct");
        // 直接从 target 获取属性
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_get");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_proxy_get_revoked");
        // 抛出 TypeError: proxy is revoked
        vm.movImm64(VReg.RET, "0x7ffb000000000000");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _proxy_set(proxy, property, value) -> boolean
    generateProxySet() {
        const vm = this.vm;

        vm.label("_proxy_set");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // proxy
        vm.mov(VReg.S1, VReg.A1); // property
        vm.mov(VReg.S2, VReg.A2); // value

        // 检查是否已撤销
        vm.load(VReg.V0, VReg.S0, 24);
        vm.cmpImm(VReg.V0, 0);
        vm.jne("_proxy_set_revoked");

        // 获取 target 和 handler
        vm.load(VReg.S3, VReg.S0, 8); // target
        vm.load(VReg.S4, VReg.S0, 16); // handler

        // 检查 handler.set
        vm.mov(VReg.A0, VReg.S4);
        vm.lea(VReg.A1, "_str_set");
        vm.call("_js_box_string");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S4);
        vm.call("_object_get");

        vm.movImm64(VReg.V1, "0x7ffb000000000000"); // JS_UNDEFINED
        vm.cmp(VReg.RET, VReg.V1);
        vm.jeq("_proxy_set_direct");

        // 调用 handler.set(target, property, value, proxy)
        vm.mov(VReg.V0, VReg.RET);
        vm.mov(VReg.A0, VReg.S3); // target
        vm.mov(VReg.A1, VReg.S1); // property
        vm.mov(VReg.A2, VReg.S2); // value
        vm.mov(VReg.A3, VReg.S0); // receiver

        vm.call("_js_unbox");
        vm.load(VReg.V1, VReg.RET, 8);
        vm.callr(VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_proxy_set_direct");
        // 直接设置 target 属性
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_object_set");
        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_proxy_set_revoked");
        vm.lea(VReg.RET, "_js_false");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    // _proxy_has(proxy, property) -> boolean
    generateProxyHas() {
        const vm = this.vm;

        vm.label("_proxy_has");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.load(VReg.V0, VReg.S0, 24);
        vm.cmpImm(VReg.V0, 0);
        vm.jne("_proxy_has_revoked");

        vm.load(VReg.S2, VReg.S0, 8);
        vm.load(VReg.S3, VReg.S0, 16);

        // 检查 handler.has
        vm.mov(VReg.A0, VReg.S3);
        vm.lea(VReg.A1, "_str_has");
        vm.call("_js_box_string");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_object_get");

        vm.movImm64(VReg.V1, "0x7ffb000000000000"); // JS_UNDEFINED
        vm.cmp(VReg.RET, VReg.V1);
        vm.jeq("_proxy_has_direct");

        // 调用 handler.has(target, property)
        vm.mov(VReg.V0, VReg.RET);
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_js_unbox");
        vm.load(VReg.V1, VReg.RET, 8);
        vm.callr(VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_proxy_has_direct");
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_has");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_proxy_has_revoked");
        vm.lea(VReg.RET, "_js_false");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _proxy_revocable(target, handler) -> { proxy, revoke }
    generateProxyRevocable() {
        const vm = this.vm;

        vm.label("_proxy_revocable");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // target
        vm.mov(VReg.S1, VReg.A1); // handler

        // 创建 proxy
        vm.call("_proxy_new");
        vm.mov(VReg.S2, VReg.RET); // proxy

        // 创建结果对象 { proxy, revoke }
        vm.call("_object_new");
        vm.mov(VReg.V0, VReg.RET);

        // 设置 proxy 属性
        vm.mov(VReg.A0, VReg.V0);
        vm.lea(VReg.A1, "_str_proxy");
        vm.call("_js_box_string");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A2, VReg.S2);
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_object_set");

        // 创建 revoke 函数（这需要闭包支持）
        // TODO: 创建一个闭包来捕获 proxy

        vm.mov(VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _proxy_revoke(proxy) -> void
    // 撤销代理
    generateProxyRevoke() {
        const vm = this.vm;

        vm.label("_proxy_revoke");
        vm.prologue(0, []);

        // 设置 revoked = 1
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.A0, 24, VReg.V0);

        vm.epilogue([], 0);
    }

    generate() {
        this.generateProxyNew();
        this.generateProxyGet();
        this.generateProxySet();
        this.generateProxyHas();
        this.generateProxyRevocable();
        this.generateProxyRevoke();
    }
}
