// JSBin WeakSet 运行时
// WeakSet 使用对象地址作为键的哈希集合
//
// WeakSet 布局:
//   offset 0:  type (8 bytes) = TYPE_WEAKSET = 21
//   offset 8:  capacity (8 bytes)
//   offset 16: size (8 bytes)
//   offset 24: buckets[0] -> entry list
//   ...
//
// Entry 布局:
//   offset 0: value (8 bytes) - 对象指针
//   offset 8: next (8 bytes)

import { VReg } from "../../../vm/registers.js";

const TYPE_WEAKSET = 21;
const WEAKSET_HEADER_SIZE = 24;
const WEAKSET_DEFAULT_CAPACITY = 16;
const ENTRY_SIZE = 16;

export class WeakSetGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // _weakset_new() -> WeakSet 指针
    generateWeakSetNew() {
        const vm = this.vm;

        vm.label("_weakset_new");
        vm.prologue(16, [VReg.S0]);

        vm.movImm(VReg.A0, WEAKSET_HEADER_SIZE + WEAKSET_DEFAULT_CAPACITY * 8);
        vm.call("_alloc");
        vm.mov(VReg.S0, VReg.RET);

        vm.movImm(VReg.V0, TYPE_WEAKSET);
        vm.store(VReg.S0, 0, VReg.V0);

        vm.movImm(VReg.V0, WEAKSET_DEFAULT_CAPACITY);
        vm.store(VReg.S0, 8, VReg.V0);

        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S0, 16, VReg.V0);

        // 初始化桶
        vm.movImm(VReg.V1, 0);
        vm.label("_weakset_new_init");
        vm.cmpImm(VReg.V1, WEAKSET_DEFAULT_CAPACITY);
        vm.jge("_weakset_new_done");

        vm.shlImm(VReg.V2, VReg.V1, 3);
        vm.addImm(VReg.V2, VReg.V2, WEAKSET_HEADER_SIZE);
        vm.add(VReg.V2, VReg.S0, VReg.V2);
        vm.movImm(VReg.V3, 0);
        vm.store(VReg.V2, 0, VReg.V3);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp("_weakset_new_init");

        vm.label("_weakset_new_done");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0], 16);
    }

    // _weakset_hash(value, capacity) -> index
    generateWeakSetHash() {
        const vm = this.vm;

        vm.label("_weakset_hash");
        vm.prologue(0, []);

        vm.mov(VReg.V0, VReg.A0);
        vm.shrImm(VReg.V0, VReg.V0, 3);
        vm.mod(VReg.RET, VReg.V0, VReg.A1);
        vm.epilogue([], 0);
    }

    // _weakset_add(set, value) -> set
    generateWeakSetAdd() {
        const vm = this.vm;

        vm.label("_weakset_add");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        // 计算桶索引
        vm.mov(VReg.A0, VReg.S1);
        vm.load(VReg.A1, VReg.S0, 8);
        vm.call("_weakset_hash");
        vm.mov(VReg.S2, VReg.RET);

        // 获取桶
        vm.shlImm(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, WEAKSET_HEADER_SIZE);
        vm.add(VReg.S3, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.S3, 0);

        // 检查是否已存在
        vm.label("_weakset_add_search");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_weakset_add_new");

        vm.load(VReg.V2, VReg.V1, 0);
        vm.cmp(VReg.V2, VReg.S1);
        vm.jeq("_weakset_add_done"); // 已存在

        vm.load(VReg.V1, VReg.V1, 8);
        vm.jmp("_weakset_add_search");

        vm.label("_weakset_add_new");
        // 分配新条目
        vm.movImm(VReg.A0, ENTRY_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.V0, VReg.RET);

        vm.store(VReg.V0, 0, VReg.S1);
        vm.load(VReg.V1, VReg.S3, 0);
        vm.store(VReg.V0, 8, VReg.V1);
        vm.store(VReg.S3, 0, VReg.V0);

        // 增加大小
        vm.load(VReg.V1, VReg.S0, 16);
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.S0, 16, VReg.V1);

        vm.label("_weakset_add_done");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _weakset_has(set, value) -> boolean
    generateWeakSetHas() {
        const vm = this.vm;

        vm.label("_weakset_has");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.mov(VReg.A0, VReg.S1);
        vm.load(VReg.A1, VReg.S0, 8);
        vm.call("_weakset_hash");
        vm.mov(VReg.S2, VReg.RET);

        vm.shlImm(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, WEAKSET_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0);

        vm.label("_weakset_has_search");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_weakset_has_false");

        vm.load(VReg.V2, VReg.V1, 0);
        vm.cmp(VReg.V2, VReg.S1);
        vm.jeq("_weakset_has_true");

        vm.load(VReg.V1, VReg.V1, 8);
        vm.jmp("_weakset_has_search");

        vm.label("_weakset_has_true");
        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_weakset_has_false");
        vm.lea(VReg.RET, "_js_false");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _weakset_delete(set, value) -> boolean
    generateWeakSetDelete() {
        const vm = this.vm;

        vm.label("_weakset_delete");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.mov(VReg.A0, VReg.S1);
        vm.load(VReg.A1, VReg.S0, 8);
        vm.call("_weakset_hash");
        vm.mov(VReg.S2, VReg.RET);

        vm.shlImm(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, WEAKSET_HEADER_SIZE);
        vm.add(VReg.S3, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.S3, 0);
        vm.movImm(VReg.V2, 0); // prev

        vm.label("_weakset_delete_search");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_weakset_delete_false");

        vm.load(VReg.V3, VReg.V1, 0);
        vm.cmp(VReg.V3, VReg.S1);
        vm.jeq("_weakset_delete_found");

        vm.mov(VReg.V2, VReg.V1);
        vm.load(VReg.V1, VReg.V1, 8);
        vm.jmp("_weakset_delete_search");

        vm.label("_weakset_delete_found");
        vm.load(VReg.V3, VReg.V1, 8); // next

        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_weakset_delete_head");

        vm.store(VReg.V2, 8, VReg.V3);
        vm.jmp("_weakset_delete_done");

        vm.label("_weakset_delete_head");
        vm.store(VReg.S3, 0, VReg.V3);

        vm.label("_weakset_delete_done");
        vm.load(VReg.V0, VReg.S0, 16);
        vm.subImm(VReg.V0, VReg.V0, 1);
        vm.store(VReg.S0, 16, VReg.V0);

        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        vm.label("_weakset_delete_false");
        vm.lea(VReg.RET, "_js_false");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    generate() {
        this.generateWeakSetNew();
        this.generateWeakSetHash();
        this.generateWeakSetAdd();
        this.generateWeakSetHas();
        this.generateWeakSetDelete();
    }
}
