// JSBin WeakMap 运行时
// WeakMap 使用对象地址作为键的哈希表
// 由于没有真正的 GC，这里实现的是简化版本
//
// WeakMap 布局:
//   offset 0:  type (8 bytes) = TYPE_WEAKMAP = 20
//   offset 8:  capacity (8 bytes) - 桶数量
//   offset 16: size (8 bytes) - 当前元素数量
//   offset 24: buckets[0] -> entry list
//   ...
//
// Entry 布局:
//   offset 0: key (8 bytes) - 对象指针
//   offset 8: value (8 bytes) - JSValue
//   offset 16: next (8 bytes) - 下一个 entry 指针

import { VReg } from "../../../vm/registers.js";
import { JS_UNDEFINED } from "../../core/jsvalue.js";

const TYPE_WEAKMAP = 20;
const WEAKMAP_HEADER_SIZE = 24;
const WEAKMAP_DEFAULT_CAPACITY = 16;
const ENTRY_SIZE = 24;

export class WeakMapGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // _weakmap_new() -> WeakMap 指针
    generateWeakMapNew() {
        const vm = this.vm;

        vm.label("_weakmap_new");
        vm.prologue(16, [VReg.S0]);

        // 分配 header + buckets
        vm.movImm(VReg.A0, WEAKMAP_HEADER_SIZE + WEAKMAP_DEFAULT_CAPACITY * 8);
        vm.call("_alloc");
        vm.mov(VReg.S0, VReg.RET);

        // 设置类型
        vm.movImm(VReg.V0, TYPE_WEAKMAP);
        vm.store(VReg.S0, 0, VReg.V0);

        // 设置容量
        vm.movImm(VReg.V0, WEAKMAP_DEFAULT_CAPACITY);
        vm.store(VReg.S0, 8, VReg.V0);

        // 设置大小
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S0, 16, VReg.V0);

        // 初始化所有桶为 null (0)
        vm.movImm(VReg.V1, 0);
        vm.label("_weakmap_new_init_loop");
        vm.cmpImm(VReg.V1, WEAKMAP_DEFAULT_CAPACITY);
        vm.jge("_weakmap_new_done");

        vm.shlImm(VReg.V2, VReg.V1, 3);
        vm.addImm(VReg.V2, VReg.V2, WEAKMAP_HEADER_SIZE);
        vm.add(VReg.V2, VReg.S0, VReg.V2);
        vm.movImm(VReg.V3, 0);
        vm.store(VReg.V2, 0, VReg.V3);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp("_weakmap_new_init_loop");

        vm.label("_weakmap_new_done");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0], 16);
    }

    // _weakmap_hash(key, capacity) -> bucket index
    // 使用对象地址作为哈希
    generateWeakMapHash() {
        const vm = this.vm;

        vm.label("_weakmap_hash");
        vm.prologue(0, []);

        // hash = key % capacity
        // 简单的取模哈希
        vm.mov(VReg.V0, VReg.A0);
        vm.shrImm(VReg.V0, VReg.V0, 3); // 去掉低位（对齐）
        vm.mod(VReg.RET, VReg.V0, VReg.A1);
        vm.epilogue([], 0);
    }

    // _weakmap_set(map, key, value) -> void
    generateWeakMapSet() {
        const vm = this.vm;

        vm.label("_weakmap_set");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // map
        vm.mov(VReg.S1, VReg.A1); // key
        vm.mov(VReg.S2, VReg.A2); // value

        // 计算桶索引
        vm.mov(VReg.A0, VReg.S1);
        vm.load(VReg.A1, VReg.S0, 8); // capacity
        vm.call("_weakmap_hash");
        vm.mov(VReg.S3, VReg.RET); // bucket index

        // 获取桶头
        vm.shlImm(VReg.V0, VReg.S3, 3);
        vm.addImm(VReg.V0, VReg.V0, WEAKMAP_HEADER_SIZE);
        vm.add(VReg.S4, VReg.S0, VReg.V0); // bucket ptr
        vm.load(VReg.V1, VReg.S4, 0); // entry list head

        // 查找是否已存在
        vm.label("_weakmap_set_search");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_weakmap_set_new_entry");

        vm.load(VReg.V2, VReg.V1, 0); // entry.key
        vm.cmp(VReg.V2, VReg.S1);
        vm.jeq("_weakmap_set_update");

        vm.load(VReg.V1, VReg.V1, 16); // entry.next
        vm.jmp("_weakmap_set_search");

        vm.label("_weakmap_set_update");
        // 更新现有条目
        vm.store(VReg.V1, 8, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_weakmap_set_new_entry");
        // 分配新条目
        vm.movImm(VReg.A0, ENTRY_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.V0, VReg.RET);

        // 设置条目
        vm.store(VReg.V0, 0, VReg.S1); // key
        vm.store(VReg.V0, 8, VReg.S2); // value
        vm.load(VReg.V1, VReg.S4, 0); // old head
        vm.store(VReg.V0, 16, VReg.V1); // next = old head
        vm.store(VReg.S4, 0, VReg.V0); // bucket head = new entry

        // 增加大小
        vm.load(VReg.V1, VReg.S0, 16);
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.S0, 16, VReg.V1);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    // _weakmap_get(map, key) -> value or undefined
    generateWeakMapGet() {
        const vm = this.vm;

        vm.label("_weakmap_get");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // map
        vm.mov(VReg.S1, VReg.A1); // key

        // 计算桶索引
        vm.mov(VReg.A0, VReg.S1);
        vm.load(VReg.A1, VReg.S0, 8);
        vm.call("_weakmap_hash");
        vm.mov(VReg.S2, VReg.RET);

        // 获取桶头
        vm.shlImm(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, WEAKMAP_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0);

        // 查找
        vm.label("_weakmap_get_search");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_weakmap_get_not_found");

        vm.load(VReg.V2, VReg.V1, 0);
        vm.cmp(VReg.V2, VReg.S1);
        vm.jeq("_weakmap_get_found");

        vm.load(VReg.V1, VReg.V1, 16);
        vm.jmp("_weakmap_get_search");

        vm.label("_weakmap_get_found");
        vm.load(VReg.RET, VReg.V1, 8);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_weakmap_get_not_found");
        vm.movImm64(VReg.RET, JS_UNDEFINED);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _weakmap_has(map, key) -> boolean (JSValue)
    generateWeakMapHas() {
        const vm = this.vm;

        vm.label("_weakmap_has");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.mov(VReg.A0, VReg.S1);
        vm.load(VReg.A1, VReg.S0, 8);
        vm.call("_weakmap_hash");
        vm.mov(VReg.S2, VReg.RET);

        vm.shlImm(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, WEAKMAP_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0);

        vm.label("_weakmap_has_search");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_weakmap_has_false");

        vm.load(VReg.V2, VReg.V1, 0);
        vm.cmp(VReg.V2, VReg.S1);
        vm.jeq("_weakmap_has_true");

        vm.load(VReg.V1, VReg.V1, 16);
        vm.jmp("_weakmap_has_search");

        vm.label("_weakmap_has_true");
        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_weakmap_has_false");
        vm.lea(VReg.RET, "_js_false");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _weakmap_delete(map, key) -> boolean (JSValue)
    generateWeakMapDelete() {
        const vm = this.vm;

        vm.label("_weakmap_delete");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.mov(VReg.A0, VReg.S1);
        vm.load(VReg.A1, VReg.S0, 8);
        vm.call("_weakmap_hash");
        vm.mov(VReg.S2, VReg.RET);

        vm.shlImm(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, WEAKMAP_HEADER_SIZE);
        vm.add(VReg.S3, VReg.S0, VReg.V0); // bucket ptr
        vm.load(VReg.V1, VReg.S3, 0); // current
        vm.movImm(VReg.V2, 0); // prev = null

        vm.label("_weakmap_delete_search");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_weakmap_delete_false");

        vm.load(VReg.V3, VReg.V1, 0);
        vm.cmp(VReg.V3, VReg.S1);
        vm.jeq("_weakmap_delete_found");

        vm.mov(VReg.V2, VReg.V1);
        vm.load(VReg.V1, VReg.V1, 16);
        vm.jmp("_weakmap_delete_search");

        vm.label("_weakmap_delete_found");
        // 从链表移除
        vm.load(VReg.V3, VReg.V1, 16); // next

        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_weakmap_delete_head");

        // prev.next = next
        vm.store(VReg.V2, 16, VReg.V3);
        vm.jmp("_weakmap_delete_done");

        vm.label("_weakmap_delete_head");
        // bucket = next
        vm.store(VReg.S3, 0, VReg.V3);

        vm.label("_weakmap_delete_done");
        // 减少大小
        vm.load(VReg.V0, VReg.S0, 16);
        vm.subImm(VReg.V0, VReg.V0, 1);
        vm.store(VReg.S0, 16, VReg.V0);

        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        vm.label("_weakmap_delete_false");
        vm.lea(VReg.RET, "_js_false");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    generate() {
        this.generateWeakMapNew();
        this.generateWeakMapHash();
        this.generateWeakMapSet();
        this.generateWeakMapGet();
        this.generateWeakMapHas();
        this.generateWeakMapDelete();
    }
}
