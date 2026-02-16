// JSBin 数组运行时
// 提供数组操作函数
//
// 数组布局 (24 bytes header + elements):
//   offset 0:  type (8 bytes) - TYPE_ARRAY = 1
//   offset 8:  length (8 bytes) - 当前元素数量
//   offset 16: capacity (8 bytes) - 最大容量
//   offset 24: elements[0]
//   offset 32: elements[1]
//   ...
//
// 最小容量: MIN_CAPACITY = 8
// 扩容策略: newCap = oldCap * 2

import { VReg } from "../../../vm/registers.js";
import { ArrayFlatMixin } from "./flat.js";
import { ArrayMutateMixin } from "./mutate.js";
import { JS_UNDEFINED } from "../../core/jsvalue.js";

const ARRAY_HEADER_SIZE = 32;
const ARRAY_MIN_CAPACITY = 8;

export class ArrayGenerator {
    constructor(vm) {
        this.vm = vm;
        // 混入 flat 相关方法
        Object.assign(this, ArrayFlatMixin);
        // 混入原地修改方法 (sort, reverse, etc.)
        Object.assign(this, ArrayMutateMixin);
    }

    // 数组 splice
    // _array_splice(arr, start, deleteCount) -> removedArray
    // 目前只实现删除语义（不支持插入参数），满足测试：arr.splice(2, 1)
    // deleteCount == -1 表示删除到末尾
    generateArraySplice() {
        const vm = this.vm;

        vm.label("_array_splice");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // 保存参数
        vm.mov(VReg.S1, VReg.A1); // start
        vm.mov(VReg.S2, VReg.A2); // deleteCount

        // unbox 数组
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed)

        // length
        vm.load(VReg.S3, VReg.S0, 8);

        // 规范化 start: 支持负索引
        vm.cmpImm(VReg.S1, 0);
        vm.jge("_array_splice_start_nonneg");
        vm.add(VReg.S1, VReg.S3, VReg.S1);
        vm.label("_array_splice_start_nonneg");
        // clamp start to [0, length]
        vm.cmpImm(VReg.S1, 0);
        vm.jge("_array_splice_start_ge0");
        vm.movImm(VReg.S1, 0);
        vm.label("_array_splice_start_ge0");
        vm.cmp(VReg.S1, VReg.S3);
        vm.jle("_array_splice_start_ok");
        vm.mov(VReg.S1, VReg.S3);
        vm.label("_array_splice_start_ok");

        // 规范化 deleteCount
        // deleteCount == -1 -> length - start
        vm.cmpImm(VReg.S2, -1);
        vm.jne("_array_splice_del_not_all");
        vm.sub(VReg.S2, VReg.S3, VReg.S1);
        vm.label("_array_splice_del_not_all");
        // deleteCount < 0 -> 0
        vm.cmpImm(VReg.S2, 0);
        vm.jge("_array_splice_del_ge0");
        vm.movImm(VReg.S2, 0);
        vm.label("_array_splice_del_ge0");
        // clamp: if start + deleteCount > length => deleteCount = length - start
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.cmp(VReg.V0, VReg.S3);
        vm.jle("_array_splice_del_ok");
        vm.sub(VReg.S2, VReg.S3, VReg.S1);
        vm.label("_array_splice_del_ok");

        // removed = new Array(deleteCount)
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S4, VReg.RET); // removed (boxed)

        // removed_unboxed
        vm.mov(VReg.A0, VReg.S4);
        vm.call("_js_unbox");
        vm.mov(VReg.S5, VReg.RET);

        // 拷贝被删除的元素到 removed
        vm.movImm(VReg.V1, 0); // i
        vm.label("_array_splice_copy_removed");
        vm.cmp(VReg.V1, VReg.S2);
        vm.jge("_array_splice_copy_removed_done");

        // Preload Body Ptrs
        vm.load(VReg.V5, VReg.S0, 24); // Arr Body
        vm.load(VReg.V6, VReg.S5, 24); // Removed Arr Body

        // srcIndex = start + i
        vm.add(VReg.V2, VReg.S1, VReg.V1);
        vm.shl(VReg.V3, VReg.V2, 3);
        vm.add(VReg.V3, VReg.V5, VReg.V3);
        vm.load(VReg.V4, VReg.V3, 0);

        // removed[i] = value
        vm.shl(VReg.V3, VReg.V1, 3);
        vm.add(VReg.V3, VReg.V6, VReg.V3);
        vm.store(VReg.V3, 0, VReg.V4);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp("_array_splice_copy_removed");

        vm.label("_array_splice_copy_removed_done");

        // 如果 deleteCount == 0，直接返回空数组
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_array_splice_done");

        // 将后续元素左移覆盖删除区间
        // i = start; i < length - deleteCount; i++
        vm.sub(VReg.V0, VReg.S3, VReg.S2); // newLen
        vm.mov(VReg.V1, VReg.S1); // i
        vm.label("_array_splice_shift_loop");
        vm.cmp(VReg.V1, VReg.V0);
        vm.jge("_array_splice_shift_done");

        // Preload Arr Body Ptr
        vm.load(VReg.V5, VReg.S0, 24);

        // srcIndex = i + deleteCount
        vm.add(VReg.V2, VReg.V1, VReg.S2);
        // load arr[srcIndex]
        vm.shl(VReg.V3, VReg.V2, 3);
        vm.add(VReg.V3, VReg.V5, VReg.V3);
        vm.load(VReg.V4, VReg.V3, 0);

        // store to arr[i]
        vm.shl(VReg.V3, VReg.V1, 3);
        vm.add(VReg.V3, VReg.V5, VReg.V3);
        vm.store(VReg.V3, 0, VReg.V4);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp("_array_splice_shift_loop");

        vm.label("_array_splice_shift_done");

        // 清空尾部元素为 undefined (0)
        vm.mov(VReg.V1, VReg.V0); // i = newLen
        vm.label("_array_splice_clear_tail");
        vm.cmp(VReg.V1, VReg.S3);
        vm.jge("_array_splice_clear_tail_done");

        vm.load(VReg.V5, VReg.S0, 24); // Load Body Ptr
        vm.shl(VReg.V3, VReg.V1, 3);
        vm.add(VReg.V3, VReg.V5, VReg.V3);
        vm.movImm(VReg.V4, 0);
        vm.store(VReg.V3, 0, VReg.V4);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp("_array_splice_clear_tail");

        vm.label("_array_splice_clear_tail_done");
        // 更新长度
        vm.store(VReg.S0, 8, VReg.V0);

        vm.label("_array_splice_done");
        vm.mov(VReg.RET, VReg.S4); // return removed (boxed)
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    }

    // 数组 push（带容量检查和自动扩容）
    // _array_push(arr_jsvalue, value) -> 数组 JSValue（扩容后可能变化）
    generateArrayPush() {
        const vm = this.vm;

        vm.label("_array_push");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S1, VReg.A1); // 保存 value

        // unbox 数组
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // arr (Header Ptr)

        // 获取当前长度和容量
        vm.load(VReg.S2, VReg.S0, 8); // length
        vm.load(VReg.S3, VReg.S0, 16); // capacity

        // 检查是否需要扩容: if (length >= capacity)
        vm.cmp(VReg.S2, VReg.S3);
        vm.jlt("_array_push_no_grow");

        // === 需要扩容 ===
        vm.shl(VReg.S4, VReg.S3, 1); // newCap = cap * 2

        // Handle cap=0 -> newCap=8
        vm.cmpImm(VReg.S4, 0);
        vm.jne("_array_push_alloc");
        vm.movImm(VReg.S4, 8); // MIN_CAPACITY

        vm.label("_array_push_alloc");
        // Alloc Body (newCap * 8)
        vm.shl(VReg.A0, VReg.S4, 3);

        // Save registers safe across alloc
        vm.store(VReg.SP, 0, VReg.S0);
        vm.store(VReg.SP, 8, VReg.S1);
        vm.store(VReg.SP, 16, VReg.S2);

        vm.call("_alloc");
        vm.mov(VReg.V0, VReg.RET); // V0 = New Body Ptr

        // Restore
        vm.load(VReg.S0, VReg.SP, 0);
        vm.load(VReg.S1, VReg.SP, 8);
        vm.load(VReg.S2, VReg.SP, 16);

        // Load Old Body Ptr
        vm.load(VReg.V1, VReg.S0, 24);

        // 复制元素 (i = 0 to length)
        vm.movImm(VReg.V2, 0);

        vm.label("_array_push_copy_loop");
        vm.cmp(VReg.V2, VReg.S2);
        vm.jge("_array_push_copy_done");

        // offset
        vm.shl(VReg.V3, VReg.V2, 3);

        // src = old[offset]
        vm.add(VReg.V4, VReg.V1, VReg.V3);
        vm.load(VReg.V5, VReg.V4, 0);

        // dst = new[offset]
        vm.add(VReg.V4, VReg.V0, VReg.V3);
        vm.store(VReg.V4, 0, VReg.V5);

        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_array_push_copy_loop");

        vm.label("_array_push_copy_done");

        // Update Header with New Body
        vm.store(VReg.S0, 24, VReg.V0);
        vm.store(VReg.S0, 16, VReg.S4); // capacity

        vm.label("_array_push_no_grow");
        // Load Body Ptr
        vm.load(VReg.V1, VReg.S0, 24);

        // Store value at Body + Length*8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.add(VReg.V0, VReg.V1, VReg.V0);
        vm.store(VReg.V0, 0, VReg.S1);

        // 更新长度
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.store(VReg.S0, 8, VReg.S2);

        // 返回 boxed 数组
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_box_array");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    }

    // 数组 pop
    // _array_pop(arr) -> value
    generateArrayPop() {
        const vm = this.vm;

        vm.label("_array_pop");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        // unbox 数组
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed)

        // 获取当前长度
        vm.load(VReg.S1, VReg.S0, 8);

        // 检查是否为空
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_pop_empty");

        // 减少长度
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.store(VReg.S0, 8, VReg.S1);

        // 获取最后一个元素: Body + (length-1) * 8
        vm.load(VReg.V1, VReg.S0, 24); // Load Body Ptr
        vm.shl(VReg.V0, VReg.S1, 3);
        vm.add(VReg.V0, VReg.V1, VReg.V0);
        vm.load(VReg.RET, VReg.V0, 0);
        vm.epilogue([VReg.S0, VReg.S1], 16);

        vm.label("_array_pop_empty");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // 数组 get
    // _array_get(arr, index) -> value
    generateArrayGet() {
        const vm = this.vm;

        vm.label("_array_get");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S1, VReg.A1); // 保存 index

        // unbox 数组
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed)

        // 计算偏移: 24 + index * 8
        vm.load(VReg.V1, VReg.S0, 24); // Load Body Ptr
        vm.shl(VReg.V0, VReg.S1, 3);
        vm.add(VReg.V0, VReg.V1, VReg.V0);
        vm.load(VReg.RET, VReg.V0, 0);

        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // 数组 set
    // _array_set(arr, index, value)
    generateArraySet() {
        const vm = this.vm;

        vm.label("_array_set");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S1, VReg.A1); // 保存 index
        vm.mov(VReg.S2, VReg.A2); // 保存 value

        // unbox 数组
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed)

        // 计算偏移: 24 + index * 8
        vm.load(VReg.V1, VReg.S0, 24); // Load Body Ptr
        vm.shl(VReg.V0, VReg.S1, 3);
        vm.add(VReg.V0, VReg.V1, VReg.V0);
        vm.store(VReg.V0, 0, VReg.S2);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 0);
    }

    // 数组长度
    // _array_length(arr) -> length
    generateArrayLength() {
        const vm = this.vm;

        vm.label("_array_length");
        vm.prologue(0, []);

        // unbox 数组
        vm.call("_js_unbox");
        vm.load(VReg.RET, VReg.RET, 8); // length at offset 8

        vm.epilogue([], 0);
    }

    // 数组 at (支持负索引)
    // _array_at(arr, index) -> value
    generateArrayAt() {
        const vm = this.vm;

        vm.label("_array_at");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S1, VReg.A1); // 保存 index

        // unbox 数组
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed)

        // 获取长度
        vm.load(VReg.V0, VReg.S0, 8);

        // 检查索引是否为负
        vm.cmpImm(VReg.S1, 0);
        vm.jge("_array_at_positive");

        // 负索引: index = length + index
        vm.add(VReg.S1, VReg.V0, VReg.S1);

        vm.label("_array_at_positive");
        // 检查边界: index < 0 || index >= length
        vm.cmpImm(VReg.S1, 0);
        vm.jlt("_array_at_undefined");
        vm.cmp(VReg.S1, VReg.V0);
        vm.jge("_array_at_undefined");

        // 计算偏移: 24 + index * 8
        vm.shl(VReg.V1, VReg.S1, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.RET, VReg.V1, 0);
        vm.epilogue([VReg.S0, VReg.S1], 0);

        vm.label("_array_at_undefined");
        vm.movImm(VReg.RET, 0); // undefined
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // 数组 indexOf
    // _array_indexOf(arr, value) -> index or -1
    // 支持 Number 对象的值比较
    generateArrayIndexOf() {
        const vm = this.vm;
        const TYPE_INT8 = 20;
        const TYPE_FLOAT64 = 29;

        vm.label("_array_indexOf");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S1, VReg.A1); // 保存 value to find

        // unbox 数组
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed)

        // 堆范围检查，非法数组直接返回未找到
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_array_indexOf_notfound");
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_array_indexOf_notfound");
        vm.movImm(VReg.S2, 0); // i = 0

        // 获取长度
        vm.load(VReg.S3, VReg.S0, 8);

        // 预先检查 value 是否是 Number 对象
        // S4 = value 的数值（如果是 Number），否则为 0
        vm.movImm(VReg.S4, 0);
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_indexOf_loop"); // null，跳过
        vm.load(VReg.V0, VReg.S1, 0); // 加载 value 的类型
        vm.cmpImm(VReg.V0, TYPE_INT8);
        vm.jlt("_array_indexOf_loop"); // 不是 Number
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jgt("_array_indexOf_loop"); // 不是 Number
        // 是 Number，加载其数值
        vm.load(VReg.S4, VReg.S1, 8);

        // Preload Body Ptr
        vm.load(VReg.V5, VReg.S0, 24);

        vm.label("_array_indexOf_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_indexOf_notfound");

        // 计算偏移: 24 + i * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.add(VReg.V0, VReg.V5, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0); // V1 = arr[i]

        // 第一步：直接指针比较
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq("_array_indexOf_found");

        // 第二步：如果 value 是 Number 且 arr[i] 也是 Number，比较数值
        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_array_indexOf_next"); // value 不是 Number，跳过值比较

        // 检查 arr[i] 是否是 Number
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_array_indexOf_next"); // null
        vm.load(VReg.V2, VReg.V1, 0); // V2 = arr[i] 的类型
        vm.cmpImm(VReg.V2, TYPE_INT8);
        vm.jlt("_array_indexOf_next");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jgt("_array_indexOf_next");
        // arr[i] 也是 Number，比较数值
        vm.load(VReg.V3, VReg.V1, 8); // V3 = arr[i] 的数值
        vm.cmp(VReg.V3, VReg.S4);
        vm.jeq("_array_indexOf_found");

        vm.label("_array_indexOf_next");
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_indexOf_loop");

        vm.label("_array_indexOf_found");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);

        vm.label("_array_indexOf_notfound");
        vm.movImm(VReg.RET, -1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    }

    // 数组 includes
    // _array_includes(arr, value) -> 0 or 1
    // 支持 Number 对象的值比较
    generateArrayIncludes() {
        const vm = this.vm;
        const TYPE_INT8 = 20;
        const TYPE_FLOAT64 = 29;

        vm.label("_array_includes");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S1, VReg.A1); // 保存 value to find

        // unbox 数组
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed)

        // 堆范围检查，非法数组直接返回 false
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_array_includes_false");
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_array_includes_false");
        vm.movImm(VReg.S2, 0); // i = 0

        // 获取长度
        vm.load(VReg.S3, VReg.S0, 8);

        // 预先检查 value 是否是 Number 对象
        vm.movImm(VReg.S4, 0);
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_includes_loop");
        vm.load(VReg.V0, VReg.S1, 0);
        vm.cmpImm(VReg.V0, TYPE_INT8);
        vm.jlt("_array_includes_loop");
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jgt("_array_includes_loop");
        vm.load(VReg.S4, VReg.S1, 8);
        vm.load(VReg.V5, VReg.S0, 24); // Body Ptr

        vm.label("_array_includes_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_includes_false");

        // 计算偏移: 24 + i * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.add(VReg.V0, VReg.V5, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0);

        // 直接指针比较
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq("_array_includes_true");

        // Number 值比较
        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_array_includes_next");
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_array_includes_next");
        vm.load(VReg.V2, VReg.V1, 0);
        vm.cmpImm(VReg.V2, TYPE_INT8);
        vm.jlt("_array_includes_next");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jgt("_array_includes_next");
        vm.load(VReg.V3, VReg.V1, 8);
        vm.cmp(VReg.V3, VReg.S4);
        vm.jeq("_array_includes_true");

        vm.label("_array_includes_next");
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_includes_loop");

        vm.label("_array_includes_true");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);

        vm.label("_array_includes_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    }

    // 数组展开追加 - 将源数组的所有元素追加到目标数组
    // _array_concat_into(dest_boxed, src_boxed) -> dest_boxed (可能更新)
    generateArrayConcatInto() {
        const vm = this.vm;

        vm.label("_array_concat_into");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // S0 = dest boxed, S1 = src boxed
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        // unbox src 获取 raw 指针
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_js_unbox");
        vm.mov(VReg.S2, VReg.RET); // S2 = src raw pointer

        // 获取 src 数组长度
        vm.load(VReg.S3, VReg.S2, 8); // S3 = src.length (offset 8)

        // 循环：逐个元素 push 到 dest
        vm.movImm(VReg.V0, 0); // V0 = index
        vm.label("_array_concat_into_loop");
        vm.cmp(VReg.V0, VReg.S3);
        vm.jge("_array_concat_into_done");

        // 保存 index
        vm.push(VReg.V0);

        // 获取 src[index] (Load Body Ptr first)
        vm.load(VReg.V3, VReg.S2, 24);
        vm.shl(VReg.V1, VReg.V0, 3);
        vm.add(VReg.V2, VReg.V3, VReg.V1);
        vm.load(VReg.A1, VReg.V2, 0); // A1 = src[index]

        // dest.push(value)
        vm.mov(VReg.A0, VReg.S0); // A0 = dest boxed
        vm.call("_array_push");
        // _array_push 可能返回新的数组指针（扩容后），更新 S0
        vm.mov(VReg.S0, VReg.RET);

        // 恢复 index 并递增
        vm.pop(VReg.V0);
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_array_concat_into_loop");

        vm.label("_array_concat_into_done");
        vm.mov(VReg.RET, VReg.S0); // 返回可能更新的 dest
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // 数组 slice (简化版，需要 _alloc)
    // _array_slice(arr, start, end) -> new array
    // end = -1 表示到末尾
    // 只用 S0-S4 五个 callee-saved 寄存器以兼容 x64
    generateArraySlice() {
        const vm = this.vm;

        vm.label("_array_slice");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S1, VReg.A1); // 保存 start
        vm.mov(VReg.S2, VReg.A2); // 保存 end

        // unbox 数组
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed)

        // 获取原数组长度
        vm.load(VReg.V0, VReg.S0, 8);

        // 处理 end = -1 (到末尾)
        vm.cmpImm(VReg.S2, -1);
        vm.jne("_array_slice_calc");
        vm.mov(VReg.S2, VReg.V0);

        vm.label("_array_slice_calc");
        // 计算新数组长度: newLen = end - start
        vm.sub(VReg.S3, VReg.S2, VReg.S1); // S3 = newLen

        // 边界检查
        vm.cmpImm(VReg.S3, 0);
        vm.jle("_array_slice_empty");

        // 1. 分配 Header (32)
        vm.movImm(VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET); // S4 = Header

        // 2. 分配 Body (newLen * 8)
        vm.store(VReg.SP, 0, VReg.S4);
        vm.shl(VReg.A0, VReg.S3, 3);
        vm.call("_alloc");
        vm.mov(VReg.V1, VReg.RET); // V1 = Body
        vm.load(VReg.S4, VReg.SP, 0);

        // 设置新数组头
        vm.movImm(VReg.V0, 1); // TYPE_ARRAY
        vm.store(VReg.S4, 0, VReg.V0);
        vm.store(VReg.S4, 8, VReg.S3); // length
        vm.store(VReg.S4, 16, VReg.S3); // capacity = length
        vm.store(VReg.S4, 24, VReg.V1); // body ptr

        // Preload Bodies
        vm.load(VReg.V5, VReg.S0, 24); // Src
        vm.load(VReg.V6, VReg.S4, 24); // Dst

        // 复制元素，用 S2 作为循环变量 (原 end 不再需要)
        vm.movImm(VReg.S2, 0); // i = 0
        vm.label("_array_slice_copy");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_slice_done");

        // src offset: Body + (start + i) * 8
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.shl(VReg.V0, VReg.V0, 3);
        vm.add(VReg.V0, VReg.V5, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0); // V1 = src element

        // dst offset: Body + i * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.add(VReg.V0, VReg.V6, VReg.V0);
        vm.store(VReg.V0, 0, VReg.V1);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_slice_copy");

        vm.label("_array_slice_done");
        // 装箱返回数组
        vm.mov(VReg.A0, VReg.S4);
        vm.call("_js_box_array");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);

        // 空数组
        vm.label("_array_slice_empty");
        // Header
        vm.movImm(VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET);

        // Body (Cap 8)
        vm.store(VReg.SP, 0, VReg.S4);
        vm.movImm(VReg.A0, 64);
        vm.call("_alloc");
        vm.mov(VReg.V1, VReg.RET);
        vm.load(VReg.S4, VReg.SP, 0);

        // Link
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S4, 0, VReg.V0);
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S4, 8, VReg.V0);
        vm.movImm(VReg.V0, 8);
        vm.store(VReg.S4, 16, VReg.V0); // Cap 8
        vm.store(VReg.S4, 24, VReg.V1); // Body Ptr

        vm.mov(VReg.A0, VReg.S4);
        vm.call("_js_box_array");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    }

    // 创建指定大小的数组
    // _array_new_with_size(size) -> array
    // 数组布局: [type(8), length(8), capacity(8), elements...]
    generateArrayNewWithSize() {
        const vm = this.vm;

        vm.label("_array_new_with_size");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // size (初始长度)

        // 计算实际容量: max(size, MIN_CAPACITY)
        vm.movImm(VReg.S3, ARRAY_MIN_CAPACITY);
        vm.cmp(VReg.S0, VReg.S3);
        vm.jge("_array_new_use_size");
        // capacity = MIN_CAPACITY
        vm.jmp("_array_new_alloc");

        vm.label("_array_new_use_size");
        vm.mov(VReg.S3, VReg.S0); // capacity = size

        vm.label("_array_new_alloc");
        // 1. 分配 Header (32 bytes)
        vm.movImm(VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET); // S1 = Header

        // 保存 Header 到栈 (防止 Body Alloc GC 导致寄存器过时)
        vm.store(VReg.SP, 0, VReg.S1);

        // 2. 分配 Body (capacity * 8)
        vm.shl(VReg.A0, VReg.S3, 3);
        vm.call("_alloc");
        vm.mov(VReg.V1, VReg.RET); // V1 = Body Ptr

        // 恢复 Header
        vm.load(VReg.S1, VReg.SP, 0);

        // 3. 设置 Header
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S1, 0, VReg.V0); // type
        vm.store(VReg.S1, 8, VReg.S0); // length
        vm.store(VReg.S1, 16, VReg.S3); // capacity
        vm.store(VReg.S1, 24, VReg.V1); // body ptr

        // 初始化所有元素为 JS_UNDEFINED
        vm.movImm(VReg.S2, 0); // counter
        vm.lea(VReg.V2, "_js_undefined");
        vm.load(VReg.V2, VReg.V2, 0); // 使用 V2 存储 undefined 值

        vm.label("_array_new_init_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_new_init_done");

        // 计算元素偏移: counter * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.add(VReg.V3, VReg.V1, VReg.V0); // V1 is Body Ptr
        vm.store(VReg.V3, 0, VReg.V2); // 存储 JS_UNDEFINED

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_new_init_loop");

        vm.label("_array_new_init_done");
        // 返回 boxed 数组 JSValue
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_js_box_array");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    }

    generate() {
        const debug = typeof globalThis !== "undefined" && globalThis.DEBUG_RUNTIME;
        const envDebug = typeof process !== "undefined" && process.env && process.env.DEBUG_RUNTIME;
        const isDebug = debug || envDebug;

        if (isDebug) console.log("[Runtime:Array] generateArrayPush");
        this.generateArrayPush();
        if (isDebug) console.log("[Runtime:Array] generateArrayPop");
        this.generateArrayPop();
        if (isDebug) console.log("[Runtime:Array] generateArrayGet");
        this.generateArrayGet();
        if (isDebug) console.log("[Runtime:Array] generateArraySet");
        this.generateArraySet();
        if (isDebug) console.log("[Runtime:Array] generateArrayLength");
        this.generateArrayLength();
        if (isDebug) console.log("[Runtime:Array] generateArrayAt");
        this.generateArrayAt();
        if (isDebug) console.log("[Runtime:Array] generateArrayIndexOf");
        this.generateArrayIndexOf();
        if (isDebug) console.log("[Runtime:Array] generateArrayIncludes");
        this.generateArrayIncludes();
        if (isDebug) console.log("[Runtime:Array] generateArrayConcatInto");
        this.generateArrayConcatInto();
        if (isDebug) console.log("[Runtime:Array] generateArraySlice");
        this.generateArraySlice();
        if (isDebug) console.log("[Runtime:Array] generateArraySplice");
        this.generateArraySplice();
        if (isDebug) console.log("[Runtime:Array] generateArrayNewWithSize");
        this.generateArrayNewWithSize();
        // flat 相关方法
        if (isDebug) console.log("[Runtime:Array] generateFlatMethods");
        this.generateFlatMethods();
        // 原地修改方法
        if (isDebug) console.log("[Runtime:Array] generateArraySort");
        this.generateArraySort();
        if (isDebug) console.log("[Runtime:Array] generateArrayReverse");
        this.generateArrayReverse();
    }
}
