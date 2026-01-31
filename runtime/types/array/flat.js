// JSBin 数组运行时 - flat 和 flatMap 方法
// Array.prototype.flat(depth)
// Array.prototype.flatMap(callback)

import { VReg } from "../../../vm/registers.js";
import { JS_TAG_ARRAY_BASE } from "../../core/jsvalue.js";

// 数组布局 (24 bytes header + elements):
//   offset 0:  type (8 bytes) - TYPE_ARRAY = 1
//   offset 8:  length (8 bytes) - 当前元素数量
//   offset 16: capacity (8 bytes) - 最大容量
//   offset 24: elements[0]
//   ...
const ARRAY_HEADER_SIZE = 24;

// Array flat/flatMap 方法 Mixin
export const ArrayFlatMixin = {
    // _array_is_array(value) -> 1 if array, 0 otherwise
    // 检查值是否为数组（检查 NaN-boxing tag）
    generateArrayIsArray() {
        const vm = this.vm;

        vm.label("_array_is_array");
        vm.prologue(0, []);

        // 检查是否是 NaN-boxed 数组 (tag 6)
        // JS_TAG_ARRAY_BASE = 0x7FFE000000000000
        vm.mov(VReg.V0, VReg.A0);
        vm.shrImm(VReg.V0, VReg.V0, 48);
        vm.movImm(VReg.V1, 0x7ffe);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_array_is_array_true");

        vm.movImm(VReg.RET, 0);
        vm.epilogue([], 0);

        vm.label("_array_is_array_true");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([], 0);
    },

    // _array_flat_internal(arr, depth, result) -> void
    // 内部递归展平函数
    // arr: 源数组 (unboxed 指针)
    // depth: 剩余展平深度
    // result: 结果数组 (unboxed 指针)
    generateArrayFlatInternal() {
        const vm = this.vm;

        vm.label("_array_flat_internal");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // src array (unboxed)
        vm.mov(VReg.S1, VReg.A1); // depth
        vm.mov(VReg.S2, VReg.A2); // result array (unboxed)

        // 获取源数组长度 (offset 8, layout: [type:8][length:8][capacity:8][elements...])
        vm.load(VReg.S3, VReg.S0, 8); // length
        vm.movImm(VReg.S4, 0); // index i = 0

        vm.label("_array_flat_loop");
        vm.cmp(VReg.S4, VReg.S3);
        vm.jge("_array_flat_done");

        // 获取元素 arr[i]
        vm.shlImm(VReg.V0, VReg.S4, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0); // element (JSValue)

        // 检查是否是数组且 depth > 0
        vm.cmpImm(VReg.S1, 0);
        vm.jle("_array_flat_push_element");

        // 检查元素是否是数组
        vm.mov(VReg.A0, VReg.V1);
        vm.push(VReg.V1);
        vm.call("_array_is_array");
        vm.pop(VReg.V1);
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_array_flat_push_element");

        // 是数组，递归展平
        // unbox 子数组
        vm.mov(VReg.A0, VReg.V1);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET); // 子数组 unboxed
        vm.subImm(VReg.A1, VReg.S1, 1); // depth - 1
        vm.mov(VReg.A2, VReg.S2); // result
        vm.call("_array_flat_internal");
        // 更新 result 指针（递归可能扩容）
        vm.mov(VReg.S2, VReg.RET);
        vm.jmp("_array_flat_next");

        vm.label("_array_flat_push_element");
        // 不是数组或 depth <= 0，直接添加到结果
        // 调用 _array_push_raw (不需要 box/unbox)
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.V1);
        vm.call("_array_push_raw");
        // 更新 result 指针（可能扩容）
        vm.mov(VReg.S2, VReg.RET);

        vm.label("_array_flat_next");
        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp("_array_flat_loop");

        vm.label("_array_flat_done");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    },

    // _array_push_raw(arr_unboxed, value) -> arr_unboxed (可能扩容)
    // 直接操作 unboxed 数组指针的 push
    generateArrayPushRaw() {
        const vm = this.vm;

        vm.label("_array_push_raw");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // arr (unboxed)
        vm.mov(VReg.S1, VReg.A1); // value

        // 获取长度和容量 (layout: [type:8][length:8][capacity:8][elements...])
        vm.load(VReg.S2, VReg.S0, 8); // length (offset 8)
        vm.load(VReg.S3, VReg.S0, 16); // capacity (offset 16)

        // 检查是否需要扩容
        vm.cmp(VReg.S2, VReg.S3);
        vm.jlt("_array_push_raw_no_grow");

        // 扩容
        vm.shlImm(VReg.S4, VReg.S3, 1); // newCap = cap * 2
        vm.shlImm(VReg.A0, VReg.S4, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        vm.mov(VReg.V0, VReg.RET);
        // 设置新数组头: [type:8][length:8][capacity:8]
        vm.movImm(VReg.V1, 1); // TYPE_ARRAY = 1
        vm.store(VReg.V0, 0, VReg.V1); // type (offset 0)
        vm.store(VReg.V0, 8, VReg.S2); // length (offset 8)
        vm.store(VReg.V0, 16, VReg.S4); // newCapacity (offset 16)

        // 复制元素
        vm.movImm(VReg.V2, 0);
        vm.label("_array_push_raw_copy");
        vm.cmp(VReg.V2, VReg.S2);
        vm.jge("_array_push_raw_copy_done");

        vm.shlImm(VReg.V3, VReg.V2, 3);
        vm.addImm(VReg.V3, VReg.V3, ARRAY_HEADER_SIZE);
        vm.add(VReg.V4, VReg.S0, VReg.V3);
        vm.load(VReg.V5, VReg.V4, 0);
        vm.add(VReg.V4, VReg.V0, VReg.V3);
        vm.store(VReg.V4, 0, VReg.V5);

        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_array_push_raw_copy");

        vm.label("_array_push_raw_copy_done");
        vm.mov(VReg.S0, VReg.V0);

        vm.label("_array_push_raw_no_grow");
        // 添加新元素
        vm.shlImm(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.store(VReg.V0, 0, VReg.S1);

        // 更新长度 (offset 8)
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.store(VReg.S0, 8, VReg.S2);

        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    },

    // _array_flat(arr_jsvalue, depth) -> new_arr_jsvalue
    // Array.prototype.flat(depth = 1)
    generateArrayFlat() {
        const vm = this.vm;

        vm.label("_array_flat");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S1, VReg.A1); // depth

        // unbox 源数组 (A0 已包含 arr_jsvalue)
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET);

        // 创建结果数组 - 用 0 作为初始长度，容量为 MIN_CAPACITY (8)
        vm.movImm(VReg.A0, 0);
        vm.call("_array_new_with_size");
        // _array_new_with_size 返回 boxed JSValue, 需要 unbox
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_js_unbox");
        vm.mov(VReg.S2, VReg.RET); // result (unboxed)

        // 递归展平
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_array_flat_internal");
        vm.mov(VReg.S2, VReg.RET);

        // box 结果数组
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_js_box_array");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    },

    // _array_flatmap(arr_jsvalue, callback) -> new_arr_jsvalue
    // Array.prototype.flatMap(callback)
    // 等价于 arr.map(callback).flat(1)
    generateArrayFlatMap() {
        const vm = this.vm;

        vm.label("_array_flatmap");
        // 使用更多栈空间来保存 callback
        vm.prologue(80, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // 定义栈上的 callback 存储位置
        const CALLBACK_OFFSET = -72; // prologue 分配 80 字节，使用 offset -72 存储 callback

        // A1 是 NaN-boxed 的回调函数，需要先 unbox
        // 保存 A0 (源数组 boxed)，因为 _js_unbox 会修改它
        vm.push(VReg.A0);
        vm.mov(VReg.A0, VReg.A1); // 准备 unbox callback
        vm.call("_js_unbox");
        // 将 callback 保存到栈上而不是 S1
        vm.store(VReg.FP, CALLBACK_OFFSET, VReg.RET);
        vm.pop(VReg.A0); // 恢复源数组 boxed

        // unbox 源数组
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET);

        // 获取源数组长度 (offset 8)
        vm.load(VReg.S3, VReg.S0, 8);

        // 创建结果数组 - 用 0 作为初始长度
        vm.movImm(VReg.A0, 0);
        vm.call("_array_new_with_size");
        // _array_new_with_size 返回 boxed JSValue, 需要 unbox
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_js_unbox");
        vm.mov(VReg.S2, VReg.RET); // result (unboxed)

        vm.movImm(VReg.S4, 0); // index i = 0

        vm.label("_array_flatmap_loop");
        vm.cmp(VReg.S4, VReg.S3);
        vm.jge("_array_flatmap_done");

        // 获取元素 arr[i]
        vm.shlImm(VReg.V0, VReg.S4, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0); // element

        // 准备调用 callback(element, index, array)
        // 先 box array 到 S5
        vm.push(VReg.V1);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_box_array");
        vm.mov(VReg.S5, VReg.RET); // S5 = boxed array
        vm.pop(VReg.V1);

        // 从栈上加载 callback
        vm.load(VReg.S1, VReg.FP, CALLBACK_OFFSET);

        // S1 是闭包对象指针（未 boxed）
        // 闭包结构: [magic:8][func_ptr:8][captured...]
        // 检查 magic 判断是否是闭包
        vm.load(VReg.V2, VReg.S1, 0); // 加载 magic
        vm.movImm(VReg.V3, 0xc105); // CLOSURE_MAGIC
        vm.cmp(VReg.V2, VReg.V3);
        vm.jne("_array_flatmap_direct_call");

        // 是闭包：从 offset 8 加载函数指针
        vm.load(VReg.V3, VReg.S1, 8); // V3 = 函数指针

        // 保存源数组指针到栈（因为 S0 将被闭包调用覆盖）
        vm.push(VReg.S0);

        // 设置参数并调用
        // 重要：闭包函数体期望 S0 包含闭包对象指针
        vm.mov(VReg.S0, VReg.S1); // 闭包对象指针传入 S0
        vm.mov(VReg.A0, VReg.V1); // element
        vm.mov(VReg.A1, VReg.S4); // index
        vm.mov(VReg.A2, VReg.S5); // array (boxed)
        vm.callIndirect(VReg.V3);

        // 恢复源数组指针
        vm.pop(VReg.S0);
        vm.jmp("_array_flatmap_handle_result");

        vm.label("_array_flatmap_direct_call");
        // 直接是函数指针（不是闭包）
        // 保存源数组指针
        vm.push(VReg.S0);
        vm.movImm(VReg.S0, 0); // 无闭包对象
        vm.mov(VReg.A0, VReg.V1); // element
        vm.mov(VReg.A1, VReg.S4); // index
        vm.mov(VReg.A2, VReg.S5); // array (boxed)
        vm.mov(VReg.V3, VReg.S1);
        vm.callIndirect(VReg.V3);
        // 恢复源数组指针
        vm.pop(VReg.S0);

        vm.label("_array_flatmap_handle_result");
        vm.mov(VReg.V4, VReg.RET); // callback 返回值

        // 检查返回值是否是数组
        vm.mov(VReg.A0, VReg.V4);
        vm.push(VReg.V4);
        vm.call("_array_is_array");
        vm.pop(VReg.V4);
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_array_flatmap_push_single");

        // 是数组，展平一层
        vm.mov(VReg.A0, VReg.V4);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        vm.movImm(VReg.A1, 0); // depth = 0 (不递归，只展开一层)
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_array_flat_internal");
        vm.mov(VReg.S2, VReg.RET);
        vm.jmp("_array_flatmap_next");

        vm.label("_array_flatmap_push_single");
        // 不是数组，直接添加
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.V4);
        vm.call("_array_push_raw");
        vm.mov(VReg.S2, VReg.RET);

        vm.label("_array_flatmap_next");
        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp("_array_flatmap_loop");

        vm.label("_array_flatmap_done");
        // box 结果
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_js_box_array");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 80);
    },

    // 生成所有 flat 相关方法
    generateFlatMethods() {
        this.generateArrayIsArray();
        this.generateArrayPushRaw();
        this.generateArrayFlatInternal();
        this.generateArrayFlat();
        this.generateArrayFlatMap();
    },
};
