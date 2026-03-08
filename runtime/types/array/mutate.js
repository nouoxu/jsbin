// JSBin 数组运行时 - 原地修改方法
// shift, unshift, reverse, fill, sort

import { VReg } from "../../../vm/registers.js";

const ARRAY_HEADER_SIZE = 32;

// 数组原地修改方法 Mixin
export const ArrayMutateMixin = {
    // 数组 shift - 移除第一个元素
    generateArrayShift() {
        const vm = this.vm;

        vm.label("_array_shift");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.load(VReg.S1, VReg.S0, 0);

        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_shift_empty");

        vm.load(VReg.S2, VReg.S0, ARRAY_HEADER_SIZE);

        vm.movImm(VReg.S3, 0);
        vm.subImm(VReg.V0, VReg.S1, 1);

        vm.label("_array_shift_loop");
        vm.cmp(VReg.S3, VReg.V0);
        vm.jge("_array_shift_done");

        vm.addImm(VReg.V1, VReg.S3, 1);
        vm.shl(VReg.V1, VReg.V1, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.V2, VReg.V1, 0);

        vm.shl(VReg.V1, VReg.S3, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.store(VReg.V1, 0, VReg.V2);

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_array_shift_loop");

        vm.label("_array_shift_done");
        vm.subImm(VReg.S1, VReg.S1, 1);
        vm.store(VReg.S0, 0, VReg.S1);

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);

        vm.label("_array_shift_empty");
        vm.lea(VReg.RET, "_js_undefined");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    },

    // 数组 unshift - 在开头添加元素
    generateArrayUnshift() {
        const vm = this.vm;

        vm.label("_array_unshift");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.load(VReg.S2, VReg.S0, 0);
        vm.load(VReg.S3, VReg.S0, 8);

        vm.cmp(VReg.S2, VReg.S3);
        vm.jlt("_array_unshift_no_grow");

        // 需要扩容
        vm.shl(VReg.S4, VReg.S3, 1);
        vm.shl(VReg.A0, VReg.S4, 3);
        vm.addImm(VReg.A0, VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");

        vm.mov(VReg.V0, VReg.RET);
        vm.movImm(VReg.V1, 1);
        vm.store(VReg.V0, 0, VReg.V1);
        vm.store(VReg.V0, 8, VReg.S4);

        // 复制元素（偏移1位）
        vm.movImm(VReg.V2, 0);
        vm.label("_array_unshift_copy");
        vm.cmp(VReg.V2, VReg.S2);
        vm.jge("_array_unshift_copy_done");

        vm.shl(VReg.V3, VReg.V2, 3);
        vm.addImm(VReg.V3, VReg.V3, ARRAY_HEADER_SIZE);
        vm.add(VReg.V3, VReg.S0, VReg.V3);
        vm.load(VReg.V4, VReg.V3, 0);

        vm.addImm(VReg.V3, VReg.V2, 1);
        vm.shl(VReg.V3, VReg.V3, 3);
        vm.addImm(VReg.V3, VReg.V3, ARRAY_HEADER_SIZE);
        vm.add(VReg.V3, VReg.V0, VReg.V3);
        vm.store(VReg.V3, 0, VReg.V4);

        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_array_unshift_copy");

        vm.label("_array_unshift_copy_done");
        vm.mov(VReg.S0, VReg.V0);
        vm.jmp("_array_unshift_insert");

        vm.label("_array_unshift_no_grow");
        // 移动元素向后一位
        vm.mov(VReg.S3, VReg.S2);
        vm.label("_array_unshift_shift");
        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_array_unshift_insert");

        vm.subImm(VReg.V1, VReg.S3, 1);
        vm.shl(VReg.V1, VReg.V1, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.V2, VReg.V1, 0);

        vm.shl(VReg.V1, VReg.S3, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.store(VReg.V1, 0, VReg.V2);

        vm.subImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_array_unshift_shift");

        vm.label("_array_unshift_insert");
        vm.store(VReg.S0, ARRAY_HEADER_SIZE, VReg.S1);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.store(VReg.S0, 0, VReg.S2);

        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    },

    // 数组 reverse - 原地反转
    generateArrayReverse() {
        const vm = this.vm;

        vm.label("_array_reverse");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // 保存原始 boxed array
        vm.mov(VReg.S4, VReg.A0);

        // unbox 数组
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed)

        // 获取长度
        vm.load(VReg.S1, VReg.S0, 8); // length at offset 8

        // 检查长度是否 <= 1
        vm.cmpImm(VReg.S1, 1);
        vm.jle("_array_reverse_done");

        vm.movImm(VReg.S2, 0); // i = 0
        vm.subImm(VReg.S3, VReg.S1, 1); // j = length - 1

        vm.label("_array_reverse_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_reverse_done");

        // 计算 &arr[i]
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // 计算 &arr[j]
        vm.shl(VReg.V1, VReg.S3, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1);

        // 交换
        vm.load(VReg.V2, VReg.V0, 0);
        vm.load(VReg.V3, VReg.V1, 0);
        vm.store(VReg.V0, 0, VReg.V3);
        vm.store(VReg.V1, 0, VReg.V2);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.subImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_array_reverse_loop");

        vm.label("_array_reverse_done");
        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 16);
    },

    // 数组 fill - 填充
    generateArrayFill() {
        const vm = this.vm;

        vm.label("_array_fill");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.mov(VReg.S2, VReg.A2);
        vm.mov(VReg.S3, VReg.A3);

        vm.cmpImm(VReg.S3, -1);
        vm.jne("_array_fill_loop");
        vm.load(VReg.S3, VReg.S0, 0);

        vm.label("_array_fill_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_array_fill_done");

        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.store(VReg.V0, 0, VReg.S1);

        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_fill_loop");

        vm.label("_array_fill_done");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    },

    // 数组 sort - 原地排序（数字升序）
    // _array_sort(arr) -> arr
    // 使用简单选择排序（避免复杂的栈操作）
    generateArraySort() {
        const vm = this.vm;
        const TYPE_FLOAT64 = 29;

        vm.label("_array_sort");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // 保存原始 boxed array
        vm.mov(VReg.S5, VReg.A0);

        // unbox 数组
        vm.mov(VReg.S0, VReg.RET); // arr (unboxed)

        // 获取长度
        vm.load(VReg.S1, VReg.S0, 8); // length

        // 检查长度是否 <= 1
        vm.cmpImm(VReg.S1, 1);
        vm.jle("_array_sort_done");

        // 选择排序: for i = 0 to n-1
        vm.movImm(VReg.S2, 0); // i = 0

        vm.label("_array_sort_outer");
        vm.subImm(VReg.V0, VReg.S1, 1);
        vm.cmp(VReg.S2, VReg.V0);
        vm.jge("_array_sort_done");

        // minIdx = i
        vm.mov(VReg.S3, VReg.S2);

        // 获取 arr[minIdx] 的值用于比较
        vm.shl(VReg.V0, VReg.S3, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.V0, VReg.V0, 0); // arr[minIdx]
        // 提取数值
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_array_sort_min_zero");
        vm.load(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, TYPE_FLOAT64);
        vm.jne("_array_sort_min_raw");
        vm.load(VReg.S4, VReg.V0, 8); // minValue = Number 的值
        vm.jmp("_array_sort_got_min");
        vm.label("_array_sort_min_raw");
        vm.mov(VReg.S4, VReg.V0);
        vm.jmp("_array_sort_got_min");
        vm.label("_array_sort_min_zero");
        vm.movImm(VReg.S4, 0);
        vm.label("_array_sort_got_min");

        // for j = i+1 to n
        vm.addImm(VReg.V2, VReg.S2, 1); // j = i + 1

        vm.label("_array_sort_inner");
        vm.cmp(VReg.V2, VReg.S1);
        vm.jge("_array_sort_inner_done");

        // 获取 arr[j]
        vm.shl(VReg.V3, VReg.V2, 3);
        vm.addImm(VReg.V3, VReg.V3, ARRAY_HEADER_SIZE);
        vm.add(VReg.V3, VReg.S0, VReg.V3);
        vm.load(VReg.V3, VReg.V3, 0); // arr[j]

        // 提取 arr[j] 的数值到 V4
        vm.cmpImm(VReg.V3, 0);
        vm.jeq("_array_sort_j_zero");
        vm.load(VReg.V4, VReg.V3, 0);
        vm.cmpImm(VReg.V4, TYPE_FLOAT64);
        vm.jne("_array_sort_j_raw");
        vm.load(VReg.V4, VReg.V3, 8); // jValue
        vm.jmp("_array_sort_got_j");
        vm.label("_array_sort_j_raw");
        vm.mov(VReg.V4, VReg.V3);
        vm.jmp("_array_sort_got_j");
        vm.label("_array_sort_j_zero");
        vm.movImm(VReg.V4, 0);
        vm.label("_array_sort_got_j");

        // if arr[j] < arr[minIdx], update minIdx
        vm.cmp(VReg.V4, VReg.S4);
        vm.jge("_array_sort_no_update");
        vm.mov(VReg.S3, VReg.V2); // minIdx = j
        vm.mov(VReg.S4, VReg.V4); // minValue = jValue

        vm.label("_array_sort_no_update");
        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_array_sort_inner");

        vm.label("_array_sort_inner_done");
        // 交换 arr[i] 和 arr[minIdx]
        vm.cmp(VReg.S3, VReg.S2);
        vm.jeq("_array_sort_no_swap");

        // 计算地址
        vm.shl(VReg.V0, VReg.S2, 3);
        vm.addImm(VReg.V0, VReg.V0, ARRAY_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0); // &arr[i]

        vm.shl(VReg.V1, VReg.S3, 3);
        vm.addImm(VReg.V1, VReg.V1, ARRAY_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V1); // &arr[minIdx]

        // 交换
        vm.load(VReg.V2, VReg.V0, 0);
        vm.load(VReg.V3, VReg.V1, 0);
        vm.store(VReg.V0, 0, VReg.V3);
        vm.store(VReg.V1, 0, VReg.V2);

        vm.label("_array_sort_no_swap");
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp("_array_sort_outer");

        vm.label("_array_sort_done");
        vm.mov(VReg.RET, VReg.S5);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    },
};
