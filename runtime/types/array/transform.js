// JSBin 数组运行时 - 转换方法
// slice, concat, join

import { VReg } from "../../../vm/registers.js";
import { ARRAY_HEADER_SIZE } from "./base.js";

// 数组转换方法 Mixin
export const ArrayTransformMixin = {
    // 数组 slice
    generateArraySlice() {
        const vm = this.vm;

        vm.label("_array_slice");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // arr
        vm.mov(VReg.S1, VReg.A1); // start
        vm.mov(VReg.S2, VReg.A2); // end

        vm.load(VReg.V0, VReg.S0, 8); // length

        vm.cmpImm(VReg.S2, -1);
        vm.jne("_array_slice_calc");
        vm.mov(VReg.S2, VReg.V0);

        vm.label("_array_slice_calc");
        vm.sub(VReg.S3, VReg.S2, VReg.S1);

        vm.cmpImm(VReg.S3, 0);
        vm.jle("_array_slice_empty");

        // Alloc Header
        vm.movImm(VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET);

        // Init Header
        vm.movImm(VReg.V0, 1); // Type
        vm.store(VReg.S4, 0, VReg.V0);
        vm.store(VReg.S4, 8, VReg.S3); // Length
        vm.store(VReg.S4, 16, VReg.S3); // Capacity

        // Alloc Body
        vm.shl(VReg.A0, VReg.S3, 3);
        vm.call("_alloc");
        vm.mov(VReg.V1, VReg.RET); // Body Ptr

        // Link Body
        vm.store(VReg.S4, 24, VReg.V1);

        // Load Src Body
        vm.load(VReg.S2, VReg.S0, 24); 

        vm.movImm(VReg.V2, 0); // i
        vm.label("_array_slice_copy");
        vm.cmp(VReg.V2, VReg.S3);
        vm.jge("_array_slice_done");

        // Load Src[start + i]
        vm.add(VReg.V3, VReg.S1, VReg.V2);
        vm.shl(VReg.V3, VReg.V3, 3);
        vm.add(VReg.V4, VReg.S2, VReg.V3);
        vm.load(VReg.V0, VReg.V4, 0);

        // Store Dest[i]
        vm.shl(VReg.V3, VReg.V2, 3);
        vm.add(VReg.V4, VReg.V1, VReg.V3); // V1 is Dest Body Ptr
        vm.store(VReg.V4, 0, VReg.V0);

        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_array_slice_copy");

        vm.label("_array_slice_done");
        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);

        vm.label("_array_slice_empty");
        vm.movImm(VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET);
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S4, 0, VReg.V0);
        vm.movImm(VReg.V0, 0); // Length
        vm.store(VReg.S4, 8, VReg.V0);
        vm.store(VReg.S4, 16, VReg.V0); // Capacity
        vm.store(VReg.S4, 24, VReg.V0); // Body
        
        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    },

    // 数组 concat - 连接两个数组
    generateArrayConcat() {
        const vm = this.vm;

        vm.label("_array_concat");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.load(VReg.S2, VReg.S0, 8); // Len1
        vm.load(VReg.S3, VReg.S1, 8); // Len2

        vm.add(VReg.S4, VReg.S2, VReg.S3); // Total Len

        // Alloc Header
        vm.movImm(VReg.A0, ARRAY_HEADER_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S5, VReg.RET);

        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S5, 0, VReg.V0); // Type
        vm.store(VReg.S5, 8, VReg.S4); // Length
        vm.store(VReg.S5, 16, VReg.S4); // Capacity

        // Alloc Body
        vm.shl(VReg.A0, VReg.S4, 3);
        vm.call("_alloc");
        vm.mov(VReg.V4, VReg.RET); // New Body

        vm.store(VReg.S5, 24, VReg.V4);

        // Copy 1
        vm.load(VReg.V1, VReg.S0, 24); // Body1
        vm.movImm(VReg.V0, 0); // i
        vm.label("_array_concat_copy1");
        vm.cmp(VReg.V0, VReg.S2);
        vm.jge("_array_concat_copy2_start");

        vm.shl(VReg.V2, VReg.V0, 3);
        vm.add(VReg.V3, VReg.V1, VReg.V2);
        vm.load(VReg.V5, VReg.V3, 0);

        vm.add(VReg.V3, VReg.V4, VReg.V2);
        vm.store(VReg.V3, 0, VReg.V5);

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_array_concat_copy1");

        vm.label("_array_concat_copy2_start");
        // Copy 2
        vm.load(VReg.V1, VReg.S1, 24); // Body2
        vm.movImm(VReg.V0, 0);
        vm.label("_array_concat_copy2");
        vm.cmp(VReg.V0, VReg.S3);
        vm.jge("_array_concat_done");

        vm.shl(VReg.V2, VReg.V0, 3);
        vm.add(VReg.V3, VReg.V1, VReg.V2);
        vm.load(VReg.V5, VReg.V3, 0);

        vm.add(VReg.V2, VReg.S2, VReg.V0);
        vm.shl(VReg.V2, VReg.V2, 3);
        vm.add(VReg.V3, VReg.V4, VReg.V2);
        vm.store(VReg.V3, 0, VReg.V5);

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_array_concat_copy2");

        vm.label("_array_concat_done");
        vm.mov(VReg.RET, VReg.S5);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 32);
    },

    // 数组展开追加 - 将源数组的所有元素追加到目标数组
    // _array_concat_into(dest, src) -> void
    // dest 和 src 都是 boxed JSValue（带 NaN-boxing tag）
    generateArrayConcatInto() {
        const vm = this.vm;

        vm.label("_array_concat_into");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // S0 = dest boxed, S1 = src boxed
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        // 提取 src 的 raw 指针（去掉 NaN-boxing tag）
        vm.movImm64(VReg.V0, "0x0000ffffffffffff");
        vm.and(VReg.S2, VReg.S1, VReg.V0); // S2 = src raw pointer

        // 获取 src 数组长度
        vm.load(VReg.S3, VReg.S2, 8); // S3 = src.length

        // Load Src Body Ptr
        vm.load(VReg.V4, VReg.S2, 24); // V4 = Src Body Ptr

        // 循环：逐个元素 push 到 dest
        vm.movImm(VReg.V0, 0); // V0 = index
        vm.label("_array_concat_into_loop");
        vm.cmp(VReg.V0, VReg.S3);
        vm.jge("_array_concat_into_done");

        // 保存 index
        vm.push(VReg.V0);
        vm.push(VReg.V4);

        // 获取 src[index]
        vm.shl(VReg.V1, VReg.V0, 3);
        vm.add(VReg.V2, VReg.V4, VReg.V1);
        vm.load(VReg.A1, VReg.V2, 0); // A1 = src[index]

        // dest.push(value)
        vm.mov(VReg.A0, VReg.S0); // A0 = dest boxed
        vm.call("_array_push");
        // _array_push 可能返回新的数组指针（扩容后），更新 S0
        vm.mov(VReg.S0, VReg.RET);

        // 恢复 index 并递增
        vm.pop(VReg.V4);
        vm.pop(VReg.V0);
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_array_concat_into_loop");

        vm.label("_array_concat_into_done");
        vm.mov(VReg.RET, VReg.S0); // 返回可能更新的 dest
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    },

    // 数组 join - 连接为字符串
    generateArrayJoin() {
        const vm = this.vm;

        vm.label("_array_join");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        vm.load(VReg.S2, VReg.S0, 8);

        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_array_join_empty");

        vm.load(VReg.S5, VReg.S0, 24); // Body Ptr

        // 预估结果大小
        vm.shl(VReg.A0, VReg.S2, 6);
        vm.addImm(VReg.A0, VReg.A0, 8);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);

        vm.movImm(VReg.V0, 16);
        vm.store(VReg.S3, 0, VReg.V0);

        vm.movImm(VReg.S4, 0);
        vm.movImm(VReg.V0, 0);

        vm.label("_array_join_loop");
        vm.push(VReg.V0);
        vm.cmp(VReg.V0, VReg.S2);
        vm.jge("_array_join_finish");

        // 添加分隔符
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_array_join_add_elem");

        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_array_join_add_elem");
        vm.load(VReg.V1, VReg.S1, 0);
        vm.shrImm(VReg.V1, VReg.V1, 32);
        vm.movImm(VReg.V2, 0);
        vm.label("_array_join_sep_copy");
        vm.cmp(VReg.V2, VReg.V1);
        vm.jge("_array_join_add_elem");
        vm.add(VReg.V3, VReg.S1, VReg.V2);
        vm.loadByte(VReg.V4, VReg.V3, 8);
        vm.add(VReg.V3, VReg.S3, VReg.S4);
        vm.storeByte(VReg.V3, 8, VReg.V4);
        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_array_join_sep_copy");

        vm.label("_array_join_add_elem");
        vm.load(VReg.V0, VReg.SP, 0);
        
        vm.shl(VReg.V1, VReg.V0, 3);
        vm.add(VReg.V1, VReg.S5, VReg.V1); // Indirect
        vm.load(VReg.V1, VReg.V1, 0);

        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_array_join_next");
        vm.loadByte(VReg.V2, VReg.V1, 0);
        vm.cmpImm(VReg.V2, 16);
        vm.jne("_array_join_next");

        // 复制字符串内容
        vm.load(VReg.V2, VReg.V1, 0);
        vm.shrImm(VReg.V2, VReg.V2, 32);
        vm.movImm(VReg.V3, 0);
        vm.label("_array_join_str_copy");
        vm.cmp(VReg.V3, VReg.V2);
        vm.jge("_array_join_next");
        vm.add(VReg.V4, VReg.V1, VReg.V3);
        vm.loadByte(VReg.V4, VReg.V4, 8);
        vm.add(VReg.A0, VReg.S3, VReg.S4);
        vm.storeByte(VReg.A0, 8, VReg.V4);
        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.addImm(VReg.V3, VReg.V3, 1);
        vm.jmp("_array_join_str_copy");

        vm.label("_array_join_next");
        vm.pop(VReg.V0);
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_array_join_loop");

        vm.label("_array_join_finish");
        vm.pop(VReg.V0);
        vm.load(VReg.V0, VReg.S3, 0);
        vm.shl(VReg.V1, VReg.S4, 32);
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        vm.store(VReg.S3, 0, VReg.V0);
        vm.add(VReg.V0, VReg.S3, VReg.S4);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 8, VReg.V1);

        vm.mov(VReg.RET, VReg.S3);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        vm.label("_array_join_empty");
        vm.lea(VReg.RET, "_str_empty");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    },
};
