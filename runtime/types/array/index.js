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
import { TYPE_STRING, HEADER_SIZE } from "../../core/allocator.js";

const ARRAY_HEADER_SIZE = 24;
const ARRAY_MIN_CAPACITY = 8;

export class ArrayGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // 数组 push（带容量检查和自动扩容）
    // _array_push(arr, value) -> 数组指针（扩容后可能变化）
    generateArrayPush() {
        const vm = this.vm;

        vm.label("_array_push");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S5, VReg.A0); // 保存原始 JSValue 到 S5
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.A0, VReg.V4); // S0 = 原始数组指针
        vm.mov(VReg.S1, VReg.A1); // value

        // 获取当前长度和容量
        vm.load(VReg.S2, VReg.S0, 8); // length
        vm.load(VReg.S3, VReg.S0, 16); // capacity

        // 检查是否需要扩容: if (length >= capacity)
        vm.cmp(VReg.S2, VReg.S3);
        vm.jlt("_array_push_no_grow");

        // === 需要扩容 ===
        // 新容量 = 旧容量 * 2
        vm.shl(VReg.S4, VReg.S3, 1); // newCap = cap * 2

        // 分配新数组: 24 (header) + newCap * 8
        vm.shl(VReg.A0, VReg.S4, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        // V0 = 新数组指针
        vm.mov(VReg.V0, VReg.RET);

        // 设置新数组头
        vm.movImm(VReg.V1, 1); // TYPE_ARRAY
        vm.store(VReg.V0, 0, VReg.V1);
        vm.store(VReg.V0, 8, VReg.S2); // length (保持不变)
        vm.store(VReg.V0, 16, VReg.S4); // newCapacity

        // 复制元素 (i = 0 to length)
        vm.movImm(VReg.V2, 0); // i = 0

        vm.label("_array_push_copy_loop");
        vm.cmp(VReg.V2, VReg.S2);
        vm.jge("_array_push_copy_done");

        // src = old[24 + i * 8]
        vm.shl(VReg.V3, VReg.V2, 3);
        vm.addImm(VReg.V3, VReg.V3, ARRAY_HEADER_SIZE);
        vm.add(VReg.V3, VReg.S0, VReg.V3);
        vm.load(VReg.V4, VReg.V3, 0);

        // dst = new[24 + i * 8]
        vm.shl(VReg.V3, VReg.V2, 3);
        vm.addImm(VReg.V3, VReg.V3, ARRAY_HEADER_SIZE);
        vm.add(VReg.V3, VReg.V0, VReg.V3);
        vm.store(VReg.V3, 0, VReg.V4);

        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_array_push_copy_loop");

        vm.label("_array_push_copy_done");
        // 使用新数组
        vm.mov(VReg.S0, VReg.V0);

        vm.label("_array_push_no_grow");
        // 计算元素偏移: 24 + length * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // 存储值
        vm.store(VReg.V0, 0, VReg.S1);

        // 更新长度
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.store(VReg.S0, 8, VReg.S2);

        // 返回数组指针（带类型标签。在返回前需要装箱，Array 的 tag 是 0x7FFB000000000000 或类似）
        // 获取原对象的高 16 位以保留相同的标签
        vm.movImm64(VReg.V4, 0xffff000000000000n);
        vm.and(VReg.V4, VReg.S5, VReg.V4); // V4 = original JSValue tag
        
        vm.movImm64(VReg.V5, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.S0, VReg.V5);
        vm.or(VReg.RET, VReg.RET, VReg.V4); // combined with original JSValue tag
        
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 32);
    }

    // 数组 pop
    // _array_pop(arr) -> value
    generateArrayPop() {
        const vm = this.vm;

        vm.label("_array_pop");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.A0, VReg.V4); // S0 = arr

        // 获取当前长度
        vm.load(VReg.S1, VReg.S0, 8);

        // 检查是否为空
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_pop_empty");

        // 减少长度
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.store(VReg.S0, 8, VReg.S1);

        // 获取最后一个元素: 24 + (length-1) * 8
        vm.shl(VReg.V0, VReg.S1, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
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
        vm.prologue(0, [VReg.S0]);

        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.A0, VReg.V4); // S0 = arr

        // 计算偏移: 24 + index * 8
        vm.shl(VReg.V0, VReg.A1, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.RET, VReg.V0, 0);

        vm.epilogue([VReg.S0], 0);
    }

    // 数组 set
    // _array_set(arr, index, value)
    generateArraySet() {
        const vm = this.vm;

        vm.label("_array_set");
        vm.prologue(0, [VReg.S0]);

        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.A0, VReg.V4); // S0 = arr

        // 计算偏移: 24 + index * 8
        vm.shl(VReg.V0, VReg.A1, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.store(VReg.V0, 0, VReg.A2);

        vm.epilogue([VReg.S0], 0);
    }

    // 数组长度
    // _array_length(arr) -> length
    generateArrayLength() {
        const vm = this.vm;

        vm.label("_array_length");
        vm.prologue(0, []);

        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.V4, VReg.A0, VReg.V4); // V4 = arr unboxed
        vm.load(VReg.RET, VReg.V4, 8);

        vm.epilogue([], 0);
    }

    // 数组 at (支持负索引)
    // _array_at(arr, index) -> value
    generateArrayAt() {
        const vm = this.vm;

        vm.label("_array_at");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.A0, VReg.V4); // S0 = arr
        vm.mov(VReg.S1, VReg.A1); // index

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
    // 支持 Number 对象的值比较和原始 float64 直接比较
    generateArrayIndexOf() {
        const vm = this.vm;
        const TYPE_INT8 = 20;
        const TYPE_FLOAT64 = 29;

        vm.label("_array_indexOf");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.A0, VReg.V4); // S0 = arr
        vm.mov(VReg.S1, VReg.A1); // value to find
        vm.movImm(VReg.S2, 0); // i = 0

        // 获取长度
        vm.load(VReg.S3, VReg.S0, 8);

        // 预先检查 value 是否是 Number 对象
        // S4 = value 的数值（如果是 Number），否则为 0
        vm.movImm(VReg.S4, 0);
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_indexOf_loop"); // null，跳过
        // 检查是否是原始 float64（非 NaN-boxing）
        // 如果高 16 位 < 0x7FF8，则是原始 float，不是指针
        vm.shrImm(VReg.V0, VReg.S1, 48); // V0 = 高 16 位
        vm.cmpImm(VReg.V0, 0x7FF8);
        vm.jlt("_array_indexOf_loop"); // 原始 float，使用直接比较
        // 否则尝试作为 Number 对象处理
        vm.load(VReg.V0, VReg.S1, 0); // 加载 value 的类型
        vm.cmpImm(VReg.V0, TYPE_INT8);
        vm.jlt("_array_indexOf_loop"); // 不是 Number
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jgt("_array_indexOf_loop"); // 不是 Number
        // 是 Number，加载其数值
        vm.load(VReg.S4, VReg.S1, 8);

        vm.label("_array_indexOf_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_indexOf_notfound");

        // 计算偏移: 24 + i * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
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
    // 支持 Number 对象的值比较和原始 float64 直接比较
    generateArrayIncludes() {
        const vm = this.vm;
        const TYPE_INT8 = 20;
        const TYPE_FLOAT64 = 29;

        vm.label("_array_includes");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.A0, VReg.V4); // S0 = arr
        vm.mov(VReg.S1, VReg.A1); // value to find
        vm.movImm(VReg.S2, 0); // i = 0

        // 获取长度
        vm.load(VReg.S3, VReg.S0, 8);

        // 预先检查 value 是否是 Number 对象
        vm.movImm(VReg.S4, 0); // S4 = 0 表示未知/原始值类型
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_includes_loop");
        // 检查是否是原始 float64（非 NaN-boxing）
        // 如果高 16 位 < 0x7FF8，则是原始 float，不是指针
        vm.shrImm(VReg.V0, VReg.S1, 48); // V0 = 高 16 位
        vm.cmpImm(VReg.V0, 0x7FF8);
        vm.jlt("_array_includes_loop"); // 原始 float，使用直接比较
        // 否则尝试作为 Number 对象处理
        vm.load(VReg.V0, VReg.S1, 0);
        vm.cmpImm(VReg.V0, TYPE_INT8);
        vm.jlt("_array_includes_loop");
        vm.cmpImm(VReg.V0, TYPE_FLOAT64);
        vm.jgt("_array_includes_loop");
        vm.load(VReg.S4, VReg.S1, 8); // S4 = Number 对象的值

        vm.label("_array_includes_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_includes_false");

        // 计算偏移: 24 + i * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0);

        // 直接指针比较
        vm.cmp(VReg.V1, VReg.S1);
        vm.jeq("_array_includes_true");

        // Number 值比较（S4 != 0 表示 search value 是 Number 对象）
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

    // 数组 slice (简化版，需要 _alloc)
    // _array_slice(arr, start, end) -> new array
    // end = -1 表示到末尾
    // 只用 S0-S4 五个 callee-saved 寄存器以兼容 x64
    generateArraySlice() {
        const vm = this.vm;

        vm.label("_array_slice");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.A0, VReg.V4); // S0 = arr (unbox)
        vm.mov(VReg.S1, VReg.A1); // start
        vm.mov(VReg.S2, VReg.A2); // end

        // 核心修复: 对 start 和 end 进行 unbox (如果是 JSValue)
        const checkEnd = "_array_slice_unbox_end";
        vm.shrImm(VReg.V0, VReg.S1, 48);
        vm.movImm(VReg.V1, 0x7ff8);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne(checkEnd);
        vm.and(VReg.S1, VReg.S1, VReg.V4); // unbox start

        vm.label(checkEnd);
        vm.shrImm(VReg.V0, VReg.S2, 48);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne("_array_slice_check_default");
        vm.and(VReg.S2, VReg.S2, VReg.V4); // unbox end

        vm.label("_array_slice_check_default");
        // 获取原数组长度 (在 S0+8)
        vm.load(VReg.V0, VReg.S0, 8);

        // 处理 end = -1 (到末尾)
        vm.cmpImm(VReg.S2, -1);
        vm.jne("_array_slice_calc");
        vm.mov(VReg.S2, VReg.V0);

        vm.label("_array_slice_calc");
        // 计算新数组长度: newLen = end - start
        vm.sub(VReg.S3, VReg.S2, VReg.S1); // S3 = newLen

        // 边界保护: 确保 newLen 在合理范围内 [0, 1M]
        vm.cmpImm(VReg.S3, 0);
        vm.jle("_array_slice_empty");

        vm.movImm(VReg.V0, 1024 * 1024);
        vm.cmp(VReg.S3, VReg.V0);
        vm.jgt("_array_slice_empty"); // 防护异常计算

        // 分配新数组: 24 + newLen * 8
        vm.shl(VReg.A0, VReg.S3, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        // 保存新数组指针到 S4 (S2 不再需要，但重用可能有问题)
        vm.mov(VReg.S4, VReg.RET);

        // 设置新数组头
        vm.movImm(VReg.V0, 1); // TYPE_ARRAY
        vm.store(VReg.S4, 0, VReg.V0);
        vm.store(VReg.S4, 8, VReg.S3); // length
        vm.store(VReg.S4, 16, VReg.S3); // capacity = length

        // 复制元素，用 S2 作为循环变量 (原 end 不再需要)
        vm.movImm(VReg.S2, 0); // i = 0
        vm.label("_array_slice_copy");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_slice_done");

        // src offset: 24 + (start + i) * 8
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.shl(VReg.V0, VReg.V0, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V1, VReg.V0, 0); // V1 = src element

        // dst offset: 24 + i * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S4, VReg.V0);
        vm.store(VReg.V0, 0, VReg.V1);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_slice_copy");

        vm.label("_array_slice_done");
        // 返回 NaN-boxed 指针
        vm.mov(VReg.RET, VReg.S4);
        vm.movImm64(VReg.V4, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V4);
        vm.movImm64(VReg.V4, 0x7FFE000000000000n); // TAG_ARRAY_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);

        // 空数组
        vm.label("_array_slice_empty");
        vm.movImm(VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");
        vm.movImm(VReg.V1, 1); // TYPE_ARRAY (用 V1 避免与 RET 冲突)
        vm.store(VReg.RET, 0, VReg.V1);
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.RET, 8, VReg.V1); // length = 0
        vm.store(VReg.RET, 16, VReg.V1); // capacity = 0
        // 返回 NaN-boxed 指针
        vm.movImm64(VReg.V4, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V4);
        vm.movImm64(VReg.V4, 0x7FFE000000000000n); // TAG_ARRAY_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V4);
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
        // 计算需要分配的大小: 24 (header) + capacity * 8
        vm.shl(VReg.A0, VReg.S3, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        vm.mov(VReg.S1, VReg.RET); // 保存数组指针

        // 设置类型为 ARRAY (1)
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S1, 0, VReg.V0);

        // 设置长度
        vm.store(VReg.S1, 8, VReg.S0);

        // 设置容量
        vm.store(VReg.S1, 16, VReg.S3);

        // 初始化所有元素为 0 (undefined)，遍历到 capacity
        vm.movImm(VReg.S2, 0); // counter

        vm.label("_array_new_init_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_new_init_done");

        // 计算元素偏移: 24 + counter * 8
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S1, VReg.V0);
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.V1, 0, VReg.V0);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_new_init_loop");

        vm.label("_array_new_init_done");
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    }

    // 数组 toString - 将数组转换为字符串（元素用 "," 连接）
    // _array_to_string(arr) -> str
    // 注意：返回的是堆上的新字符串，不是数据段指针
    generateArrayToString() {
        const vm = this.vm;

        vm.label("_array_to_string");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // A0 是 JSValue (boxed array pointer)，需要解包
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始数组指针

        // 获取数组长度
        vm.load(VReg.S1, VReg.S0, 8); // S1 = length

        // 处理空数组的情况 - 直接返回空字符串
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_to_string_empty");

        // 分配结果字符串的临时缓冲区
        vm.mov(VReg.A0, VReg.S1);
        vm.movImm(VReg.V0, 12);
        vm.mul(VReg.A0, VReg.A0, VReg.V0);
        vm.addImm(VReg.A0, VReg.A0, 32); // 16(header) + estimated content
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET); // S4 = 结果缓冲区起始 (block + 16)

        // S2 = 当前写入位置 (从内容区开始, S4 = block + 16)
        vm.mov(VReg.S2, VReg.S4);
        // S3 = 元素索引
        vm.movImm(VReg.S3, 0);

        // 跳到循环开始处理元素
        vm.jmp("_array_to_string_loop");

        const loopLabel = "_array_to_string_loop";
        const endLabel = "_array_to_string_end";
        const skipCommaLabel = "_array_to_string_skip_comma";

        vm.label(loopLabel);
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge(endLabel);

        // 如果不是第一个元素，先写 ","
        vm.cmpImm(VReg.S3, 0);
        vm.jeq(skipCommaLabel);
        vm.movImm(VReg.V0, 44); // ','
        vm.storeByte(VReg.S2, 0, VReg.V0);
        vm.addImm(VReg.S2, VReg.S2, 1);

        vm.label(skipCommaLabel);
        // 获取元素: arr[index] = *(arr + 24 + index * 8)
        vm.mov(VReg.V0, VReg.S3);
        vm.shl(VReg.V0, VReg.V0, 3); // index * 8
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.A0, VReg.V0, 24); // A0 = 元素值

        // 检查是否是JSValue（高16位 >= 0x7FF8）
        // JSValue需要特殊处理：调用 _valueToStr 转换
        vm.shrImm(VReg.V1, VReg.A0, 48); // V1 = 高16位
        vm.cmpImm(VReg.V1, 0x7FF8);
        vm.jge("_array_to_string_jsvalue");

        // 高16位 < 0x7FF8：不是JSValue，可能是原始float或数据段指针
        // 先检查是否是数据段字符串指针 (地址在 0x100008000 - 0x100108000 范围内)
        vm.movImm(VReg.V1, 0x100008000);
        vm.cmp(VReg.A0, VReg.V1);
        vm.jlt("_array_to_string_float");  // < 0x100008000，不是数据段字符串
        vm.addImm(VReg.V1, VReg.V1, 0x100000); // V1 = 0x100108000
        vm.cmp(VReg.A0, VReg.V1);
        vm.jge("_array_to_string_float");  // >= 0x100108000，不是数据段字符串
        // 是数据段字符串指针：调用 _valueToStr 进行转换
        vm.call("_valueToStr");
        // RET = 元素字符串指针（NaN-boxed JS字符串）
        // 跳转到公共处理逻辑进行解包
        vm.jmp("_array_to_string_jsvalue_unbox");

        // 原始float处理：直接调用 _intToStr
        vm.label("_array_to_string_float");
        vm.fmovToFloat(0, VReg.A0);  // A0 作为浮点值
        vm.fcvtzs(VReg.A0, 0);       // A0 = 整数
        vm.call("_intToStr");
        // RET = NaN-boxed JS string pointer
        // 需要解包并加16得到content指针
        vm.shrImm(VReg.V1, VReg.RET, 48);  // V1 = 高16位
        vm.cmpImm(VReg.V1, 0x7FFC);
        vm.jne("_array_to_string_int_check_other");
        // 是堆字符串：解包并加16得到content指针
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.addImm(VReg.RET, VReg.RET, 16);
        vm.jmp("_array_to_string_str_ready");
        // 其他类型（不应发生）
        vm.label("_array_to_string_int_check_other");
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.addImm(VReg.RET, VReg.RET, 16);
        vm.jmp("_array_to_string_str_ready");

        // JSValue 或堆对象处理：调用 _valueToStr
        vm.label("_array_to_string_jsvalue");
        vm.call("_valueToStr");
        // RET = 元素字符串指针（可能是 NaN-boxed JS字符串）
        vm.label("_array_to_string_jsvalue_unbox");
        // 解包：检查 boxed 值的高 16 位来确定类型
        vm.shrImm(VReg.V1, VReg.RET, 48);  // V1 = 高16位
        // 0x7FFC = 堆字符串 tag
        vm.cmpImm(VReg.V1, 0x7FFC);
        vm.jne("_array_to_string_jsvalue_check_data");
        // 是堆字符串：_valueToStr已经返回content指针（unboxed user_ptr），不需要偏移
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.jmp("_array_to_string_str_ready");
        // 0x7FFD = 数据段字符串 tag（已经是content指针，不需要加偏移）
        vm.label("_array_to_string_jsvalue_check_data");
        vm.cmpImm(VReg.V1, 0x7FFD);
        vm.jne("_array_to_string_jsvalue_check_other");
        // 是数据段字符串：解包
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.jmp("_array_to_string_str_ready");
        // 其他类型：直接解包
        vm.label("_array_to_string_jsvalue_check_other");
        vm.cmpImm(VReg.V1, 0x7FF8);
        vm.jlt("_array_to_string_str_ready");
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);

        vm.label("_array_to_string_str_ready");

        // 将元素字符串复制到结果缓冲区
        // 先保存字符串指针，因为 _strlen 会覆盖 RET
        vm.mov(VReg.V1, VReg.RET); // V1 = 源指针（保存）
        // 调用 _strlen 获取元素字符串长度
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_strlen");
        // V0 = 元素字符串长度

        // 复制元素字符串到结果缓冲区
        const copyLoopLabel = "_array_to_string_copy_loop";
        const copyDoneLabel = "_array_to_string_copy_done";
        vm.mov(VReg.V2, VReg.S2);   // V2 = 目标指针
        vm.movImm(VReg.V3, 0);       // V3 = 计数器

        vm.label(copyLoopLabel);
        vm.cmp(VReg.V3, VReg.V0);
        vm.jge(copyDoneLabel);
        vm.loadByte(VReg.V4, VReg.V1, 0);
        vm.storeByte(VReg.V2, 0, VReg.V4);
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.addImm(VReg.V3, VReg.V3, 1);
        vm.jmp(copyLoopLabel);

        vm.label(copyDoneLabel);
        // 更新写入位置
        vm.add(VReg.S2, VReg.S2, VReg.V0);

        // 索引加 1
        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp(loopLabel);

        vm.label(endLabel);
        // 写入字符串结束符
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S2, 0, VReg.V0);

        // 保存 S4 到 S0（因为 _strlen 会覆盖某些寄存器）
        vm.mov(VReg.S0, VReg.S4);  // S0 = S4 = 内容起始位置
        // 调用 _strlen
        vm.mov(VReg.A0, VReg.S4); // A0 = 内容起始位置
        vm.call("_strlen");       // RET = 实际长度

        // 设置 string 对象头: block = S0 - 16
        vm.subImm(VReg.V1, VReg.S0, 16);  // V1 = block
        vm.movImm(VReg.V0, TYPE_STRING);  // V0 = type
        vm.store(VReg.V1, 0, VReg.V0);     // *(block + 0) = type

        // 返回 NaN-boxed 指针到 block
        vm.mov(VReg.RET, VReg.V1);  // RET = block
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);  // RET = block & mask
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);   // RET = (block & mask) | tag
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
        // epilogue 生成 ret，所以永远不会执行到这里

        // 空数组返回空字符串（返回正确的字符串对象）
        vm.label("_array_to_string_empty");
        // 分配字符串对象: HEADER_SIZE(16) + 1(内容) = 17, 对齐到8字节 = 24
        vm.movImm(VReg.A0, HEADER_SIZE + 1);
        vm.call("_alloc");
        // 检查分配是否成功
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_array_to_string_empty_fail");
        // RET = user_ptr = block + 16
        // 需要在 block + 0 存储 type, block + 8 存储 length, block + 16 存储内容
        // 保存 user_ptr 到 S0（因为后续操作会用到 V0/V1）
        vm.mov(VReg.S0, VReg.RET);  // S0 = user_ptr
        vm.subImm(VReg.V1, VReg.RET, HEADER_SIZE);  // V1 = block = user_ptr - 16
        vm.movImm(VReg.V0, TYPE_STRING);  // V0 = 6 (string type)
        vm.store(VReg.V1, 0, VReg.V0);     // *(block + 0) = type
        vm.movImm(VReg.V0, 0);             // V0 = 0 (length) - 注意：会覆盖RET，但S0已保存
        vm.store(VReg.V1, 8, VReg.V0);     // *(block + 8) = length
        vm.storeByte(VReg.S0, 0, VReg.V0); // *(user_ptr + 0) = null terminator
        // 返回 NaN-boxed block 指针
        vm.mov(VReg.RET, VReg.V1);  // RET = block
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);  // RET = block & mask
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);   // RET = (block & mask) | tag
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);

        vm.label("_array_to_string_empty_fail");
        // 分配失败，返回空指针
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
        // 注意：epilogue 生成 ret，所以永远不会执行到这里
    }

    // 数组连接（用于实现 spread [...arr]）
    // _array_concat(target, source) -> target
    generateArrayConcat() {
        const vm = this.vm;

        vm.label("_array_concat");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // target (JSValue)
        vm.mov(VReg.S1, VReg.A1); // source (JSValue)

        // 解包 source 获取长度
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S2, VReg.S1, VReg.V4); // S2 = source ptr
        vm.load(VReg.S3, VReg.S2, 8); // S3 = source length

        // 遍历并 push
        vm.movImm(VReg.S2, 0); // index = 0
        const loopLabel = "_array_concat_loop";
        const doneLabel = "_array_concat_done";

        vm.label(loopLabel);
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge(doneLabel);

        // 获取元素: _array_get(source, index)
        vm.mov(VReg.A0, VReg.S1);
        vm.mov(VReg.A1, VReg.S2);
        vm.call("_array_get");
        
        // push 到目标: _array_push(target, value)
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.RET);
        vm.call("_array_push");
        vm.mov(VReg.S0, VReg.RET); // 更新 target (可能已扩容)

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    generate() {
        this.generateArrayPush();
        this.generateArrayPop();
        this.generateArrayGet();
        this.generateArraySet();
        this.generateArrayLength();
        this.generateArrayAt();
        this.generateArrayIndexOf();
        this.generateArrayIncludes();
        this.generateArraySlice();
        this.generateArrayNewWithSize();
        this.generateArrayToString();
        this.generateArrayConcat();
    }
}
