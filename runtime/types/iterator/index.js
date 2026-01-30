// JSBin 迭代器协议实现
// 支持 ES6 Iterator Protocol

import { VReg } from "../../../vm/index.js";
import { TYPE_ITERATOR, TYPE_ARRAY, TYPE_STRING, TYPE_MAP, TYPE_SET, TYPE_OBJECT } from "../../core/types.js";

/**
 * 迭代器对象布局:
 * +0:  type (8 bytes) = TYPE_ITERATOR
 * +8:  source (8 bytes) - 被迭代的对象指针
 * +16: index (8 bytes) - 当前索引位置
 * +24: kind (8 bytes) - 迭代类型: 0=values, 1=keys, 2=entries
 * +32: done (8 bytes) - 是否已完成: 0=false, 1=true
 * +40: source_type (8 bytes) - 源类型: 0=array, 1=string, 2=map, 3=set
 *
 * IteratorResult 对象布局（普通对象）:
 * { value: any, done: boolean }
 */

// 迭代器类型常量
const ITER_KIND_VALUES = 0;
const ITER_KIND_KEYS = 1;
const ITER_KIND_ENTRIES = 2;

// 源对象类型常量
const ITER_SOURCE_ARRAY = 0;
const ITER_SOURCE_STRING = 1;
const ITER_SOURCE_MAP = 2;
const ITER_SOURCE_SET = 3;

export class IteratorGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateIteratorCreate();
        this.generateIteratorNext();
        this.generateIteratorResult();
        this.generateArrayIterator();
        this.generateStringIterator();
        this.generateMapIterator();
        this.generateSetIterator();
        this.generateGetIterator();
    }

    /**
     * 创建迭代器对象
     * A0 = source 对象指针
     * A1 = kind (0=values, 1=keys, 2=entries)
     * A2 = source_type (0=array, 1=string, 2=map, 3=set)
     * RET = 迭代器对象指针
     */
    generateIteratorCreate() {
        const vm = this.vm;

        vm.label("_iterator_create");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // source
        vm.mov(VReg.S1, VReg.A1); // kind
        vm.mov(VReg.S2, VReg.A2); // source_type

        // 分配 48 字节 (type + source + index + kind + done + source_type)
        vm.movImm(VReg.A0, 48);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET); // S3 = 迭代器指针

        // 设置 type (使用 V1 避免与 S3/RET 冲突)
        vm.movImm(VReg.V1, TYPE_ITERATOR);
        vm.store(VReg.S3, 0, VReg.V1);

        // 设置 source
        vm.store(VReg.S3, 8, VReg.S0);

        // 设置 index = 0
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.S3, 16, VReg.V1);

        // 设置 kind
        vm.store(VReg.S3, 24, VReg.S1);

        // 设置 done = 0 (false)
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.S3, 32, VReg.V1);

        // 设置 source_type
        vm.store(VReg.S3, 40, VReg.S2);

        // 返回迭代器指针
        vm.mov(VReg.RET, VReg.S3);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    /**
     * 创建 IteratorResult 对象 { value, done }
     * A0 = value
     * A1 = done (0 or 1)
     * RET = IteratorResult 对象指针
     */
    generateIteratorResult() {
        const vm = this.vm;

        vm.label("_iterator_result");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // value
        vm.mov(VReg.S1, VReg.A1); // done

        // 创建对象（简化版：使用固定布局）
        // 布局: [type:8 | count:8 | "value":8 | value:8 | "done":8 | done:8]
        vm.movImm(VReg.A0, 48);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = 对象指针

        // type = TYPE_OBJECT (2)
        vm.movImm(VReg.V1, TYPE_OBJECT);
        vm.store(VReg.S2, 0, VReg.V1);

        // count = 2
        vm.movImm(VReg.V1, 2);
        vm.store(VReg.S2, 8, VReg.V1);

        // "value" 键
        vm.lea(VReg.V1, "_str_value");
        vm.store(VReg.S2, 16, VReg.V1);

        // value 值
        vm.store(VReg.S2, 24, VReg.S0);

        // "done" 键
        vm.lea(VReg.V1, "_str_done");
        vm.store(VReg.S2, 32, VReg.V1);

        // done 值 (boxed boolean: 使用 NaN-boxing)
        // Tag 1 = boolean, JS_TAG_BOOL_BASE = 0x7FF9000000000000
        // true = 0x7FF9000000000001, false = 0x7FF9000000000000
        vm.movImm64(VReg.V1, 0x7ff9000000000000n);
        vm.or(VReg.V1, VReg.V1, VReg.S1);
        vm.store(VReg.S2, 40, VReg.V1);

        // 返回对象指针
        vm.mov(VReg.RET, VReg.S2);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * 迭代器 next() 方法 - 通用调度
     * A0 = 迭代器对象
     * RET = IteratorResult
     */
    generateIteratorNext() {
        const vm = this.vm;

        vm.label("_iterator_next");
        vm.prologue(32, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // 保存迭代器

        // 检查是否已完成
        vm.load(VReg.V0, VReg.S0, 32); // done
        vm.cmpImm(VReg.V0, 0);
        vm.jne("_iterator_next_done");

        // 获取 source_type (在偏移 40)
        vm.load(VReg.V0, VReg.S0, 40);

        // 根据 source_type 分发
        vm.cmpImm(VReg.V0, ITER_SOURCE_ARRAY);
        vm.jeq("_iterator_next_array");
        vm.cmpImm(VReg.V0, ITER_SOURCE_STRING);
        vm.jeq("_iterator_next_string");
        vm.cmpImm(VReg.V0, ITER_SOURCE_MAP);
        vm.jeq("_iterator_next_map");
        vm.cmpImm(VReg.V0, ITER_SOURCE_SET);
        vm.jeq("_iterator_next_set");

        // 未知类型，返回 done
        vm.label("_iterator_next_done");
        vm.movImm(VReg.A0, 0); // undefined
        vm.movImm(VReg.A1, 1); // done = true
        vm.call("_iterator_result");
        vm.jmp("_iterator_next_return");

        // 数组迭代
        vm.label("_iterator_next_array");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_array_iterator_next");
        vm.jmp("_iterator_next_return");

        // 字符串迭代
        vm.label("_iterator_next_string");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_string_iterator_next");
        vm.jmp("_iterator_next_return");

        // Map 迭代
        vm.label("_iterator_next_map");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_map_iterator_next");
        vm.jmp("_iterator_next_return");

        // Set 迭代
        vm.label("_iterator_next_set");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_set_iterator_next");
        vm.jmp("_iterator_next_return");

        vm.label("_iterator_next_return");
        vm.epilogue([VReg.S0], 32);
    }

    /**
     * 数组迭代器 next()
     * A0 = 迭代器对象
     * RET = IteratorResult
     *
     * 数组布局: [type:8 | length:8 | capacity:8 | elements...]
     * 元素偏移 = 24 + index * 8
     */
    generateArrayIterator() {
        const vm = this.vm;

        vm.label("_array_iterator_next");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // iterator

        // 获取 source, index, kind
        vm.load(VReg.S1, VReg.S0, 8); // source (数组指针)
        vm.load(VReg.S2, VReg.S0, 16); // index
        vm.load(VReg.S3, VReg.S0, 24); // kind

        // 获取数组长度 (offset 8)
        vm.load(VReg.V0, VReg.S1, 8);

        // 检查 index < length
        vm.cmp(VReg.S2, VReg.V0);
        vm.jge("_array_iter_done");

        // 计算值地址: array + 24 + index * 8
        vm.mov(VReg.V1, VReg.S2);
        vm.shlImm(VReg.V1, VReg.V1, 3);
        vm.addImm(VReg.V1, VReg.V1, 24);
        vm.add(VReg.V1, VReg.S1, VReg.V1);
        vm.load(VReg.V2, VReg.V1, 0); // value

        // 递增索引
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.store(VReg.S0, 16, VReg.S2);

        // 根据 kind 决定返回什么
        vm.cmpImm(VReg.S3, ITER_KIND_KEYS);
        vm.jeq("_array_iter_keys");
        vm.cmpImm(VReg.S3, ITER_KIND_ENTRIES);
        vm.jeq("_array_iter_entries");

        // values: 返回 { value, done: false }
        vm.mov(VReg.A0, VReg.V2);
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.jmp("_array_iter_return");

        // keys: 返回 { value: index-1, done: false }
        vm.label("_array_iter_keys");
        vm.subImm(VReg.A0, VReg.S2, 1);
        // 需要 box 整数
        vm.call("_box_int64");
        vm.mov(VReg.A0, VReg.RET);
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.jmp("_array_iter_return");

        // entries: 返回 { value: [index-1, elem], done: false }
        vm.label("_array_iter_entries");
        vm.push(VReg.V2); // 保存 value
        // 创建 [key, value] 数组
        vm.movImm(VReg.A0, 2);
        vm.call("_array_new_with_size");
        vm.mov(VReg.V3, VReg.RET); // entry array
        // 设置 entry[0] = index-1
        vm.subImm(VReg.V0, VReg.S2, 1);
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_box_int64");
        vm.store(VReg.V3, 16, VReg.RET);
        // 设置 entry[1] = value
        vm.pop(VReg.V2);
        vm.store(VReg.V3, 24, VReg.V2);
        // 返回 result
        vm.mov(VReg.A0, VReg.V3);
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.jmp("_array_iter_return");

        // done: 返回 { value: undefined, done: true }
        vm.label("_array_iter_done");
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S0, 32, VReg.V0); // 标记完成
        vm.movImm(VReg.A0, 0);
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");

        vm.label("_array_iter_return");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    /**
     * 字符串迭代器 next()
     * A0 = 迭代器对象
     * RET = IteratorResult
     */
    generateStringIterator() {
        const vm = this.vm;

        vm.label("_string_iterator_next");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // iterator

        // 获取 source, index
        vm.load(VReg.S1, VReg.S0, 8); // source (字符串)
        vm.load(VReg.S2, VReg.S0, 16); // index

        // 获取字符串长度
        vm.load(VReg.V0, VReg.S1, 8);

        // 检查 index < length
        vm.cmp(VReg.S2, VReg.V0);
        vm.jge("_string_iter_done");

        // 获取字符: str + 16 + index
        vm.addImm(VReg.V1, VReg.S1, 16);
        vm.add(VReg.V1, VReg.V1, VReg.S2);
        vm.loadByte(VReg.V2, VReg.V1, 0); // char code

        // 递增索引
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.store(VReg.S0, 16, VReg.S2);

        // 创建单字符字符串
        vm.movImm(VReg.A0, 24); // 16 header + 1 char + padding
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);
        // type = TYPE_STRING
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S3, 0, VReg.V0);
        // length = 1
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S3, 8, VReg.V0);
        // char
        vm.storeByte(VReg.S3, 16, VReg.V2);
        // null terminator
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S3, 17, VReg.V0);

        // 返回 { value: char, done: false }
        vm.mov(VReg.A0, VReg.S3);
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.jmp("_string_iter_return");

        // done
        vm.label("_string_iter_done");
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S0, 32, VReg.V0);
        vm.movImm(VReg.A0, 0);
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");

        vm.label("_string_iter_return");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 48);
    }

    /**
     * Map 迭代器 next()
     * A0 = 迭代器对象
     * RET = IteratorResult
     */
    generateMapIterator() {
        const vm = this.vm;

        vm.label("_map_iterator_next");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // iterator

        // 获取 source (Map), index (当前节点指针), kind
        vm.load(VReg.S1, VReg.S0, 8); // source
        vm.load(VReg.S2, VReg.S0, 16); // current node (or 0 for first)
        vm.load(VReg.S3, VReg.S0, 24); // kind

        // 如果 index == 0，从 Map 的头节点开始
        vm.cmpImm(VReg.S2, 0);
        vm.jne("_map_iter_continue");
        // 获取 Map 的链表头
        vm.load(VReg.S2, VReg.S1, 16); // head pointer
        vm.jmp("_map_iter_check");

        vm.label("_map_iter_continue");
        // 获取下一个节点
        vm.load(VReg.S2, VReg.S2, 16); // node.next

        vm.label("_map_iter_check");
        // 检查是否到达末尾
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_map_iter_done");

        // 保存当前节点到迭代器
        vm.store(VReg.S0, 16, VReg.S2);

        // 获取 key 和 value
        vm.load(VReg.V1, VReg.S2, 0); // key
        vm.load(VReg.V2, VReg.S2, 8); // value

        // 根据 kind 决定返回值
        vm.cmpImm(VReg.S3, ITER_KIND_KEYS);
        vm.jeq("_map_iter_keys");
        vm.cmpImm(VReg.S3, ITER_KIND_VALUES);
        vm.jeq("_map_iter_values");

        // entries: 返回 [key, value]
        vm.push(VReg.V1);
        vm.push(VReg.V2);
        vm.movImm(VReg.A0, 2);
        vm.call("_array_new_with_size");
        vm.mov(VReg.V3, VReg.RET);
        vm.pop(VReg.V2);
        vm.pop(VReg.V1);
        vm.store(VReg.V3, 16, VReg.V1); // entry[0] = key
        vm.store(VReg.V3, 24, VReg.V2); // entry[1] = value
        vm.mov(VReg.A0, VReg.V3);
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.jmp("_map_iter_return");

        vm.label("_map_iter_keys");
        vm.mov(VReg.A0, VReg.V1);
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.jmp("_map_iter_return");

        vm.label("_map_iter_values");
        vm.mov(VReg.A0, VReg.V2);
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.jmp("_map_iter_return");

        vm.label("_map_iter_done");
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S0, 32, VReg.V0);
        vm.movImm(VReg.A0, 0);
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");

        vm.label("_map_iter_return");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
    }

    /**
     * Set 迭代器 next()
     * A0 = 迭代器对象
     * RET = IteratorResult
     */
    generateSetIterator() {
        const vm = this.vm;

        vm.label("_set_iterator_next");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // iterator

        // 获取 source (Set), index (当前节点指针), kind
        vm.load(VReg.S1, VReg.S0, 8); // source
        vm.load(VReg.S2, VReg.S0, 16); // current node (or 0 for first)
        vm.load(VReg.S3, VReg.S0, 24); // kind

        // 如果 index == 0，从 Set 的头节点开始
        vm.cmpImm(VReg.S2, 0);
        vm.jne("_set_iter_continue");
        vm.load(VReg.S2, VReg.S1, 16); // head pointer
        vm.jmp("_set_iter_check");

        vm.label("_set_iter_continue");
        vm.load(VReg.S2, VReg.S2, 8); // node.next

        vm.label("_set_iter_check");
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_set_iter_done");

        // 保存当前节点
        vm.store(VReg.S0, 16, VReg.S2);

        // 获取 value
        vm.load(VReg.V1, VReg.S2, 0); // value

        // Set 的 keys(), values(), entries() 都返回值（entries 返回 [v, v]）
        vm.cmpImm(VReg.S3, ITER_KIND_ENTRIES);
        vm.jeq("_set_iter_entries");

        // values/keys: 返回 value
        vm.mov(VReg.A0, VReg.V1);
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.jmp("_set_iter_return");

        // entries: 返回 [value, value]
        vm.label("_set_iter_entries");
        vm.push(VReg.V1);
        vm.movImm(VReg.A0, 2);
        vm.call("_array_new_with_size");
        vm.mov(VReg.V2, VReg.RET);
        vm.pop(VReg.V1);
        vm.store(VReg.V2, 16, VReg.V1);
        vm.store(VReg.V2, 24, VReg.V1);
        vm.mov(VReg.A0, VReg.V2);
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.jmp("_set_iter_return");

        vm.label("_set_iter_done");
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S0, 32, VReg.V0);
        vm.movImm(VReg.A0, 0);
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");

        vm.label("_set_iter_return");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    /**
     * 获取对象的迭代器 (实现 @@iterator 协议)
     * A0 = JSValue (可能是 NaN-boxed 或原始堆指针)
     * RET = 迭代器对象
     *
     * 由于 NaN-boxing 格式检查可能不一致，统一使用 unbox + 堆类型检查
     */
    generateGetIterator() {
        const vm = this.vm;

        vm.label("_get_iterator");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 输入值

        // ============ 先 unbox 获取指针 ============
        // _js_unbox 提取低 48 位，无论是 NaN-boxed 还是原始指针都可以处理
        // A0 已经包含输入值，直接调用
        vm.call("_js_unbox");
        vm.mov(VReg.S2, VReg.RET); // S2 = 指针

        // ============ 检查是否为空 ============
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_get_iter_not_iterable");

        // ============ 读取堆对象类型 ============
        vm.load(VReg.V0, VReg.S2, 0);
        vm.andImm(VReg.V0, VReg.V0, 0xff);

        // 检查堆对象类型
        vm.cmpImm(VReg.V0, TYPE_ARRAY);
        vm.jeq("_get_iter_array");
        vm.cmpImm(VReg.V0, TYPE_STRING);
        vm.jeq("_get_iter_string");
        vm.cmpImm(VReg.V0, TYPE_MAP);
        vm.jeq("_get_iter_map");
        vm.cmpImm(VReg.V0, TYPE_SET);
        vm.jeq("_get_iter_set");

        // 未知类型，不可迭代
        vm.jmp("_get_iter_not_iterable");

        // ============ 数组迭代器 ============
        vm.label("_get_iter_array");
        vm.mov(VReg.A0, VReg.S2);
        vm.movImm(VReg.A1, ITER_KIND_VALUES);
        vm.movImm(VReg.A2, ITER_SOURCE_ARRAY);
        vm.call("_iterator_create");
        vm.jmp("_get_iter_return");

        // ============ 字符串迭代器 ============
        vm.label("_get_iter_string");
        vm.mov(VReg.A0, VReg.S2);
        vm.movImm(VReg.A1, ITER_KIND_VALUES);
        vm.movImm(VReg.A2, ITER_SOURCE_STRING);
        vm.call("_iterator_create");
        vm.jmp("_get_iter_return");

        // ============ Map 迭代器 ============
        vm.label("_get_iter_map");
        vm.mov(VReg.A0, VReg.S2);
        vm.movImm(VReg.A1, ITER_KIND_ENTRIES); // Map 默认返回 entries
        vm.movImm(VReg.A2, ITER_SOURCE_MAP);
        vm.call("_iterator_create");
        vm.jmp("_get_iter_return");

        // ============ Set 迭代器 ============
        vm.label("_get_iter_set");
        vm.mov(VReg.A0, VReg.S2);
        vm.movImm(VReg.A1, ITER_KIND_VALUES);
        vm.movImm(VReg.A2, ITER_SOURCE_SET);
        vm.call("_iterator_create");
        vm.jmp("_get_iter_return");

        // ============ 不可迭代 ============
        vm.label("_get_iter_not_iterable");
        vm.movImm(VReg.RET, 0);
        vm.jmp("_get_iter_return");

        vm.label("_get_iter_return");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 48);
    }

    /**
     * 数据段字符串
     */
    generateDataSection(asm) {
        asm.addDataLabel("_str_value");
        this._addString(asm, "value");

        asm.addDataLabel("_str_done");
        this._addString(asm, "done");
    }

    _addString(asm, str) {
        for (let i = 0; i < str.length; i++) {
            asm.addDataByte(str.charCodeAt(i));
        }
        asm.addDataByte(0);
        // 确保 8 字节对齐
        while (asm.data.length % 8 !== 0) {
            asm.addDataByte(0);
        }
    }
}

// 生成数组的 keys(), values(), entries() 方法
export class ArrayIteratorMethodsGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateArrayValues();
        this.generateArrayKeys();
        this.generateArrayEntries();
    }

    // Array.prototype.values() / Array.prototype[@@iterator]()
    generateArrayValues() {
        const vm = this.vm;

        vm.label("_array_values");
        vm.label("_array_@@iterator"); // 别名
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // array
        vm.movImm(VReg.A1, 0); // ITER_KIND_VALUES
        vm.call("_iterator_create");

        vm.epilogue([VReg.S0], 16);
    }

    // Array.prototype.keys()
    generateArrayKeys() {
        const vm = this.vm;

        vm.label("_array_keys");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);
        vm.movImm(VReg.A1, 1); // ITER_KIND_KEYS
        vm.call("_iterator_create");

        vm.epilogue([VReg.S0], 16);
    }

    // Array.prototype.entries()
    generateArrayEntries() {
        const vm = this.vm;

        vm.label("_array_entries");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);
        vm.movImm(VReg.A1, 2); // ITER_KIND_ENTRIES
        vm.call("_iterator_create");

        vm.epilogue([VReg.S0], 16);
    }
}

// Map/Set 迭代器方法生成器
export class MapSetIteratorMethodsGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateMapKeys();
        this.generateMapValues();
        this.generateMapEntries();
        this.generateSetValues();
        this.generateSetKeys();
        this.generateSetEntries();
    }

    generateMapKeys() {
        const vm = this.vm;
        vm.label("_map_keys");
        vm.prologue(16, []);
        vm.movImm(VReg.A1, 1); // ITER_KIND_KEYS
        vm.call("_iterator_create");
        vm.epilogue([], 16);
    }

    generateMapValues() {
        const vm = this.vm;
        vm.label("_map_values");
        vm.prologue(16, []);
        vm.movImm(VReg.A1, 0); // ITER_KIND_VALUES
        vm.call("_iterator_create");
        vm.epilogue([], 16);
    }

    generateMapEntries() {
        const vm = this.vm;
        vm.label("_map_entries");
        vm.prologue(16, []);
        vm.movImm(VReg.A1, 2); // ITER_KIND_ENTRIES
        vm.call("_iterator_create");
        vm.epilogue([], 16);
    }

    generateSetValues() {
        const vm = this.vm;
        vm.label("_set_values");
        vm.label("_set_@@iterator"); // Set 默认迭代器
        vm.prologue(16, []);
        vm.movImm(VReg.A1, 0); // ITER_KIND_VALUES
        vm.call("_iterator_create");
        vm.epilogue([], 16);
    }

    generateSetKeys() {
        const vm = this.vm;
        vm.label("_set_keys");
        vm.prologue(16, []);
        vm.movImm(VReg.A1, 0); // Set.keys() 返回 values (same as values)
        vm.call("_iterator_create");
        vm.epilogue([], 16);
    }

    generateSetEntries() {
        const vm = this.vm;
        vm.label("_set_entries");
        vm.prologue(16, []);
        vm.movImm(VReg.A1, 2); // ITER_KIND_ENTRIES
        vm.call("_iterator_create");
        vm.epilogue([], 16);
    }
}
