// JSBin 运行时 - Map 支持
// 实现 JavaScript Map 对象的基本功能

import { VReg } from "../../../vm/index.js";

// Map 对象内存布局（简化版 - 使用链表）:
// +0:  type (8 bytes) = TYPE_MAP (4)
// +8:  size (8 bytes) - 元素数量
// +16: head (8 bytes) - 链表头指针
//
// 链表节点:
// +0:  key (8 bytes)
// +8:  value (8 bytes)
// +16: next (8 bytes)

const TYPE_MAP = 4;
const MAP_SIZE = 24;
const MAP_NODE_SIZE = 24;

export class MapGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        const vm = this.vm;

        // 生成键比较辅助函数
        this.generateKeyCompare();

        // _map_new - 创建空 Map
        vm.label("_map_new");
        vm.prologue(16, []);

        vm.movImm(VReg.A0, MAP_SIZE);
        vm.call("_alloc");

        vm.movImm(VReg.V1, TYPE_MAP);
        vm.store(VReg.RET, 0, VReg.V1); // type
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.RET, 8, VReg.V1); // size = 0
        vm.store(VReg.RET, 16, VReg.V1); // head = null

        vm.epilogue([], 16);

        // _map_set - 设置键值对
        // A0 = Map 指针, A1 = key, A2 = value
        vm.label("_map_set");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // map
        vm.mov(VReg.S1, VReg.A1); // key
        vm.mov(VReg.S2, VReg.A2); // value

        // 查找是否已存在该 key
        vm.load(VReg.S3, VReg.S0, 16); // current = head

        const searchLoopLabel = "_map_set_search";
        const foundLabel = "_map_set_found";
        const notFoundLabel = "_map_set_not_found";
        const doneLabel = "_map_set_done";

        vm.label(searchLoopLabel);
        vm.cmpImm(VReg.S3, 0);
        vm.jeq(notFoundLabel); // 到达链表末尾

        // 比较 key (使用 _map_key_compare)
        vm.load(VReg.A0, VReg.S3, 0); // node.key
        vm.mov(VReg.A1, VReg.S1); // search key
        vm.call("_map_key_compare");
        vm.cmpImm(VReg.RET, 1);
        vm.jeq(foundLabel);

        // 下一个节点
        vm.load(VReg.S3, VReg.S3, 16);
        vm.jmp(searchLoopLabel);

        vm.label(foundLabel);
        // 更新现有节点的值
        vm.store(VReg.S3, 8, VReg.S2);
        vm.jmp(doneLabel);

        vm.label(notFoundLabel);

        // Save S0, S1, S2 to local stack frame before alloc
        // We have 48 bytes of local stack (from prologue), unused by other logic.
        vm.store(VReg.SP, 0, VReg.S0);
        vm.store(VReg.SP, 8, VReg.S1);
        vm.store(VReg.SP, 16, VReg.S2);

        // 创建新节点
        vm.movImm(VReg.A0, MAP_NODE_SIZE);
        vm.call("_alloc");

        // Reload S0, S1, S2 from local stack frame
        // _alloc (GC) might have moved objects, so registers are stale.
        // Stack slots are updated by GC.
        vm.load(VReg.S0, VReg.SP, 0);
        vm.load(VReg.S1, VReg.SP, 8);
        vm.load(VReg.S2, VReg.SP, 16);

        vm.store(VReg.RET, 0, VReg.S1); // node.key
        vm.store(VReg.RET, 8, VReg.S2); // node.value

        // 插入到链表头部
        vm.load(VReg.V1, VReg.S0, 16); // old head
        vm.store(VReg.RET, 16, VReg.V1); // node.next = old head
        vm.store(VReg.S0, 16, VReg.RET); // head = node

        // 增加 size
        vm.load(VReg.V1, VReg.S0, 8);
        // Workaround: addImm might be buggy? Use register add
        vm.movImm(VReg.A0, 1);
        vm.add(VReg.V1, VReg.V1, VReg.A0);
        vm.store(VReg.S0, 8, VReg.V1);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S0); // 返回 map
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        // _map_get - 获取值
        // A0 = Map 指针, A1 = key
        // 返回 value，如果不存在返回 undefined (0)
        vm.label("_map_get");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // map
        vm.mov(VReg.S1, VReg.A1); // key

        vm.load(VReg.S2, VReg.S0, 16); // current = head

        const getLoopLabel = "_map_get_loop";
        const getFoundLabel = "_map_get_found";
        const getNotFoundLabel = "_map_get_not_found";

        vm.label(getLoopLabel);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(getNotFoundLabel);

        // 比较 key (使用 _map_key_compare)
        vm.load(VReg.A0, VReg.S2, 0); // node.key
        vm.mov(VReg.A1, VReg.S1); // search key
        vm.call("_map_key_compare");
        vm.cmpImm(VReg.RET, 1);
        vm.jeq(getFoundLabel);

        vm.load(VReg.S2, VReg.S2, 16);
        vm.jmp(getLoopLabel);

        vm.label(getFoundLabel);
        vm.load(VReg.RET, VReg.S2, 8);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label(getNotFoundLabel);
        vm.movImm(VReg.RET, 0); // undefined
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // _map_has - 检查 key 是否存在
        // A0 = Map 指针, A1 = key
        // 返回 1 (true) 或 0 (false)
        vm.label("_map_has");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.load(VReg.S2, VReg.S0, 16);

        const hasLoopLabel = "_map_has_loop";
        const hasFoundLabel = "_map_has_found";
        const hasNotFoundLabel = "_map_has_not_found";

        vm.label(hasLoopLabel);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(hasNotFoundLabel);

        // 比较 key (使用 _map_key_compare)
        vm.load(VReg.A0, VReg.S2, 0); // node.key
        vm.mov(VReg.A1, VReg.S1); // search key
        vm.call("_map_key_compare");
        vm.cmpImm(VReg.RET, 1);
        vm.jeq(hasFoundLabel);

        vm.load(VReg.S2, VReg.S2, 16);
        vm.jmp(hasLoopLabel);

        vm.label(hasFoundLabel);
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label(hasNotFoundLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // _map_delete - 删除键值对
        // A0 = Map 指针, A1 = key
        // 返回 1 如果删除成功，0 如果 key 不存在
        vm.label("_map_delete");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // map
        vm.mov(VReg.S1, VReg.A1); // key

        vm.movImm(VReg.S2, 0); // prev = null
        vm.load(VReg.S3, VReg.S0, 16); // current = head

        const delLoopLabel = "_map_del_loop";
        const delFoundLabel = "_map_del_found";
        const delNotFoundLabel = "_map_del_not_found";

        vm.label(delLoopLabel);
        vm.cmpImm(VReg.S3, 0);
        vm.jeq(delNotFoundLabel);

        // 比较 key (使用 _map_key_compare)
        vm.load(VReg.A0, VReg.S3, 0); // node.key
        vm.mov(VReg.A1, VReg.S1); // search key
        vm.call("_map_key_compare");
        vm.cmpImm(VReg.RET, 1);
        vm.jeq(delFoundLabel);

        vm.mov(VReg.S2, VReg.S3);
        vm.load(VReg.S3, VReg.S3, 16);
        vm.jmp(delLoopLabel);

        vm.label(delFoundLabel);
        // 从链表中移除
        vm.load(VReg.V1, VReg.S3, 16); // next
        vm.cmpImm(VReg.S2, 0);
        const delFromHeadLabel = "_map_del_from_head";
        vm.jeq(delFromHeadLabel);
        // 从中间删除
        vm.store(VReg.S2, 16, VReg.V1); // prev.next = current.next
        vm.jmp("_map_del_dec_size");

        vm.label(delFromHeadLabel);
        vm.store(VReg.S0, 16, VReg.V1); // head = current.next

        vm.label("_map_del_dec_size");
        // 减少 size
        vm.load(VReg.V1, VReg.S0, 8);
        vm.subImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.S0, 8, VReg.V1);

        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        vm.label(delNotFoundLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        // _map_size - 获取 Map 大小
        // A0 = Map 指针
        vm.label("_map_size");
        vm.load(VReg.RET, VReg.A0, 8);
        vm.ret();
    }

    // 生成键比较函数：比较两个 JS 值是否相等
    // A0 = key1, A1 = key2
    // 返回: 1 相等, 0 不等
    generateKeyCompare() {
        const vm = this.vm;

        vm.label("_map_key_compare");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // key1
        vm.mov(VReg.S1, VReg.A1); // key2

        // 首先直接比较（处理 null, undefined, 相同引用等）
        vm.cmp(VReg.S0, VReg.S1);
        const equalLabel = "_map_cmp_equal";
        const notEqualLabel = "_map_cmp_not_equal";
        const checkStringLabel = "_map_cmp_check_string";
        const checkRawStringLabel = "_map_cmp_check_raw_string";
        vm.jeq(equalLabel);

        // 检查是否都是 Number 对象
        // Number 对象布局: [type: 8B][value: 8B]
        // TYPE_FLOAT64 = 29
        // 首先检查 key1 是否是有效的堆指针（高 16 位为 0）
        vm.mov(VReg.S2, VReg.S0);
        vm.shrImm(VReg.S2, VReg.S2, 48);
        vm.cmpImm(VReg.S2, 0);
        vm.jne(checkStringLabel); // 不是堆指针，检查是否是 NaN-boxed 字符串

        // key1 是堆指针，检查是否是 Number 对象
        vm.load(VReg.S2, VReg.S0, 0); // key1.type
        vm.cmpImm(VReg.S2, 29); // TYPE_FLOAT64
        vm.jne("_map_cmp_try_str_obj"); // 不是 Number，尝试 String Object

        // key2 也必须是 Number 对象
        vm.mov(VReg.S2, VReg.S1);
        vm.shrImm(VReg.S2, VReg.S2, 48);
        vm.cmpImm(VReg.S2, 0);
        vm.jne(notEqualLabel);

        vm.load(VReg.S3, VReg.S1, 0); // key2.type
        vm.cmpImm(VReg.S3, 29); // TYPE_FLOAT64
        vm.jne(notEqualLabel);

        // 两个都是 Number，比较值
        vm.load(VReg.S2, VReg.S0, 8); // key1.value
        vm.load(VReg.S3, VReg.S1, 8); // key2.value
        vm.cmp(VReg.S2, VReg.S3);
        vm.jeq(equalLabel);
        vm.jmp(notEqualLabel);

        // 检查是否是 String Object (TYPE_STRING = 6)
        vm.label("_map_cmp_try_str_obj");
        vm.cmpImm(VReg.S2, 6); // TYPE_STRING
        vm.jne(checkRawStringLabel); // 也不 String Object -> 尝试 Raw String

        // key1 是 String Object，key2 也必须是
        vm.mov(VReg.S3, VReg.S1); // S3 = key2
        vm.shrImm(VReg.S3, VReg.S3, 48);
        vm.cmpImm(VReg.S3, 0);
        vm.jne(notEqualLabel); // key2 不是堆指针

        vm.load(VReg.S3, VReg.S1, 0); // key2.type
        vm.cmpImm(VReg.S3, 6); // TYPE_STRING
        vm.jne(notEqualLabel); // key2 不是 String Object

        // 比较长度 (offset 8)
        vm.load(VReg.S2, VReg.S0, 8);
        vm.load(VReg.S3, VReg.S1, 8);
        vm.cmp(VReg.S2, VReg.S3);
        vm.jne(notEqualLabel);

        // 比较内容 (offset 16)
        vm.mov(VReg.A0, VReg.S0);
        vm.addImm(VReg.A0, VReg.A0, 16);
        vm.mov(VReg.A1, VReg.S1);
        vm.addImm(VReg.A1, VReg.A1, 16);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq(equalLabel);
        vm.jmp(notEqualLabel);

        // 检查是否都是 NaN-boxed 字符串
        // 字符串 tag = 0x7ffc (高 16 位)
        vm.label(checkStringLabel);
        vm.movImm(VReg.S3, 0x7ffc); // String tag
        vm.cmp(VReg.S2, VReg.S3);
        vm.jne(notEqualLabel);

        vm.mov(VReg.S2, VReg.S1);
        vm.shrImm(VReg.S2, VReg.S2, 48);
        vm.cmp(VReg.S2, VReg.S3);
        vm.jne(notEqualLabel);

        // 两个都是 NaN-boxed 字符串，提取指针并比较内容
        vm.mov(VReg.A0, VReg.S0);
        vm.shlImm(VReg.A0, VReg.A0, 16);
        vm.shrImm(VReg.A0, VReg.A0, 16);

        vm.mov(VReg.A1, VReg.S1);
        vm.shlImm(VReg.A1, VReg.A1, 16);
        vm.shrImm(VReg.A1, VReg.A1, 16);

        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq(equalLabel);
        vm.jmp(notEqualLabel);

        // 尝试作为原始字符串指针比较
        // 数据段字符串不是 NaN-boxed，而是直接的 char* 指针
        vm.label(checkRawStringLabel);
        // 直接使用 strcmp 比较两个指针指向的内容
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq(equalLabel);
        vm.jmp(notEqualLabel);

        vm.label(equalLabel);
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label(notEqualLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }
}
