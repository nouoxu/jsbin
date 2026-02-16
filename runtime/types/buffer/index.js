// JSBin 运行时 - Buffer 类型
// Buffer 是 Node.js 中用于处理二进制数据的类
// 内部实现为 Uint8Array，使用 TYPE_UINT8_ARRAY 类型

import { VReg } from "../../../vm/registers.js";
import { TYPE_UINT8_ARRAY, TYPE_STRING } from "../../core/types.js";

// Buffer 头部大小 (与 TypedArray 相同: 16 字节)
const BUFFER_HEADER = 16;

export class BufferGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateBufferAlloc();
        this.generateBufferAllocUnsafe();
        this.generateBufferFrom();
        this.generateBufferConcat();
        this.generateBufferIsBuffer();
        this.generateBufferLength();
        this.generateBufferToString();
    }

    /**
     * 辅助函数：从 Number 对象提取整数值
     * Number 对象布局: [type:8][value:8] (value 是 float64 位模式)
     * 使用 load + fmovToFloat + fcvtzs
     */
    extractInt(destReg, srcReg) {
        const vm = this.vm;
        // srcReg 是 Number 对象指针
        // 从偏移 8 读取 float64 位模式
        vm.load(destReg, srcReg, 8);
        // 将整数位模式移到浮点寄存器
        vm.fmovToFloat(0, destReg);
        // 转换为整数
        vm.fcvtzs(destReg, 0);
    }

    /**
     * _buffer_alloc(size) -> Buffer
     * 分配指定大小的 Buffer，内容初始化为 0
     * 参数 A0: 大小（boxed number）
     * 返回: boxed Uint8Array
     */
    generateBufferAlloc() {
        const vm = this.vm;

        vm.label("_buffer_alloc");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        // 从 boxed number 提取整数大小
        this.extractInt(VReg.S0, VReg.A0); // S0 = size

        // 检查 size >= 0
        vm.cmpImm(VReg.S0, 0);
        const validSize = this.ctx.newLabel("buffer_alloc_valid");
        vm.jge(validSize);
        // 负数返回空 buffer
        vm.movImm(VReg.S0, 0);
        vm.label(validSize);

        // 分配: header(16) + size
        vm.addImm(VReg.A0, VReg.S0, BUFFER_HEADER);
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET); // S1 = buffer ptr

        // 设置类型头
        vm.movImm(VReg.V0, TYPE_UINT8_ARRAY);
        vm.store(VReg.S1, 0, VReg.V0);
        // 设置长度
        vm.store(VReg.S1, 8, VReg.S0);

        // 初始化为 0 (循环)
        vm.movImm(VReg.V0, 0); // i = 0
        vm.movImm(VReg.V2, 0); // zero byte
        const initLoop = this.ctx.newLabel("buffer_alloc_init");
        const initEnd = this.ctx.newLabel("buffer_alloc_init_end");

        vm.label(initLoop);
        vm.cmp(VReg.V0, VReg.S0);
        vm.jge(initEnd);

        vm.addImm(VReg.V1, VReg.S1, BUFFER_HEADER);
        vm.add(VReg.V1, VReg.V1, VReg.V0);
        vm.storeByte(VReg.V1, 0, VReg.V2);

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp(initLoop);

        vm.label(initEnd);

        // 内联 NaN-boxing
        // Buffer 是 TYPE_UINT8_ARRAY (0x50) -> subtype 2
        // 格式: [0x7FFE (16b) | subtype (4b) | ptr (44b)]
        // subtype 2 << 44 = 0x200000000000
        vm.movImm64(VReg.V0, "0x7ffe200000000000");
        vm.or(VReg.RET, VReg.V0, VReg.S1);

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    /**
     * _buffer_alloc_unsafe(size) -> Buffer
     * 分配指定大小的 Buffer，内容不初始化（更快但不安全）
     */
    generateBufferAllocUnsafe() {
        const vm = this.vm;

        vm.label("_buffer_alloc_unsafe");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        // 从 boxed number 提取整数大小
        this.extractInt(VReg.S0, VReg.A0);

        // 检查 size >= 0
        vm.cmpImm(VReg.S0, 0);
        const validSize = this.ctx.newLabel("buffer_alloc_unsafe_valid");
        vm.jge(validSize);
        vm.movImm(VReg.S0, 0);
        vm.label(validSize);

        // 分配: header(16) + size
        vm.addImm(VReg.A0, VReg.S0, BUFFER_HEADER);
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET);

        // 设置类型头
        vm.movImm(VReg.V0, TYPE_UINT8_ARRAY);
        vm.store(VReg.S1, 0, VReg.V0);
        // 设置长度
        vm.store(VReg.S1, 8, VReg.S0);

        // 不初始化内容

        // 内联 NaN-boxing
        // Buffer 是 TYPE_UINT8_ARRAY (0x50) -> subtype 2
        // 格式: [0x7FFE (16b) | subtype (4b) | ptr (44b)]
        vm.movImm64(VReg.V0, "0x7ffe200000000000");
        vm.or(VReg.RET, VReg.V0, VReg.S1);

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    /**
     * _buffer_from(data, encoding) -> Buffer
     * 从字符串或数组创建 Buffer
     * A0: 数据（字符串指针[char*] 或 boxed 数组）
     * A1: 编码（可选，0 = utf8）
     *
     * 注意：字符串在 jsbin 中是原始 C 字符串（char*，无头部）
     * 数组是 boxed 值（高 16 位 = 0x7FFE）
     */
    generateBufferFrom() {
        const vm = this.vm;

        vm.label("_buffer_from");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = data (保存)
        // A1 = encoding (unused for now, assume utf8)

        // 检查是否是 boxed 数组（高 16 位 == 0x7FFE）
        vm.shrImm(VReg.V1, VReg.S0, 48);
        vm.movImm(VReg.V2, 0x7ffe);
        vm.cmp(VReg.V1, VReg.V2);
        const isArray = this.ctx.newLabel("buffer_from_array");
        vm.jeq(isArray);

        // 不是数组 - 假定是字符串（原始 char*）
        vm.jmp("buffer_from_string");

        // 从字符串创建
        vm.label("buffer_from_string");
        // S0 是原始 char* 指针
        // 使用 _strlen 获取长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // S1 = string length

        // 分配 buffer
        vm.addImm(VReg.A0, VReg.S1, BUFFER_HEADER);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = buffer ptr

        // 设置头部
        vm.movImm(VReg.V0, TYPE_UINT8_ARRAY);
        vm.store(VReg.S2, 0, VReg.V0);
        vm.store(VReg.S2, 8, VReg.S1);

        // 复制字符串内容（字符串是原始 char*，直接从起始位置复制）
        vm.addImm(VReg.A0, VReg.S2, BUFFER_HEADER); // dest
        vm.mov(VReg.A1, VReg.S0); // src (直接是 char*)
        vm.mov(VReg.A2, VReg.S1); // length
        vm.call("_memcpy");

        // 内联 NaN-boxing
        vm.movImm64(VReg.V0, "0x7ffe200000000000");
        vm.or(VReg.RET, VReg.V0, VReg.S2);
        vm.jmp("_buffer_from_done");

        // 从数组创建
        vm.label(isArray);
        // 解包数组指针
        vm.movImm64(VReg.V2, "0x0000ffffffffffff");
        vm.and(VReg.S0, VReg.S0, VReg.V2);

        // 数组布局: [type:8][length:8][capacity:8][elements...]
        vm.load(VReg.S1, VReg.S0, 8); // S1 = array length

        // 分配 buffer
        vm.addImm(VReg.A0, VReg.S1, BUFFER_HEADER);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = buffer ptr

        // 设置头部
        vm.movImm(VReg.V0, TYPE_UINT8_ARRAY);
        vm.store(VReg.S2, 0, VReg.V0);
        vm.store(VReg.S2, 8, VReg.S1);

        // 复制数组元素（需要逐个转换为字节）
        vm.movImm(VReg.V0, 0); // i = 0
        const loopStart = this.ctx.newLabel("buffer_from_array_loop");
        const loopEnd = this.ctx.newLabel("buffer_from_array_end");

        vm.label(loopStart);
        vm.cmp(VReg.V0, VReg.S1);
        vm.jge(loopEnd);

        // 读取数组元素: arr + 24 + i*8
        vm.shlImm(VReg.V1, VReg.V0, 3); // i * 8
        vm.addImm(VReg.V2, VReg.S0, 24);
        vm.add(VReg.V2, VReg.V2, VReg.V1);
        vm.load(VReg.A0, VReg.V2, 0); // A0 = arr[i]

        // 使用 _to_number 转换为数字（处理 NaN-boxed 值和 Number 对象）
        vm.call("_to_number");
        vm.mov(VReg.V1, VReg.RET); // V1 = number

        // 转换为整数并存储
        vm.push(VReg.V0);
        vm.push(VReg.S0);
        vm.push(VReg.S1);
        vm.push(VReg.S2);
        vm.fmovToFloat(0, VReg.V1);
        vm.fcvtzs(VReg.V1, 0); // V1 = integer value
        vm.pop(VReg.S2);
        vm.pop(VReg.S1);
        vm.pop(VReg.S0);
        vm.pop(VReg.V0);

        // 存储字节: buffer + 16 + i
        vm.addImm(VReg.V2, VReg.S2, BUFFER_HEADER);
        vm.add(VReg.V2, VReg.V2, VReg.V0);
        vm.storeByte(VReg.V2, 0, VReg.V1);

        // i++
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp(loopStart);

        vm.label(loopEnd);

        // 内联 NaN-boxing
        vm.movImm64(VReg.V0, "0x7ffe200000000000");
        vm.or(VReg.RET, VReg.V0, VReg.S2);

        vm.label("_buffer_from_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * _buffer_concat(list) -> Buffer
     * 连接多个 Buffer
     */
    generateBufferConcat() {
        const vm = this.vm;

        vm.label("_buffer_concat");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // S0 = list (boxed array)

        // 解包数组
        vm.movImm64(VReg.V0, "0x0000ffffffffffff");
        vm.and(VReg.S0, VReg.S0, VReg.V0);

        // 获取数组长度
        vm.load(VReg.S1, VReg.S0, 8); // S1 = list length

        // 计算总长度
        vm.movImm(VReg.S2, 0); // S2 = total length
        vm.movImm(VReg.V0, 0); // i = 0

        const calcLoop = this.ctx.newLabel("buffer_concat_calc");
        const calcEnd = this.ctx.newLabel("buffer_concat_calc_end");

        vm.label(calcLoop);
        vm.cmp(VReg.V0, VReg.S1);
        vm.jge(calcEnd);

        // 获取 list[i]
        vm.shlImm(VReg.V1, VReg.V0, 3);
        vm.addImm(VReg.V2, VReg.S0, 24);
        vm.add(VReg.V2, VReg.V2, VReg.V1);
        vm.load(VReg.V1, VReg.V2, 0); // V1 = list[i] (boxed buffer)

        // 解包并获取长度（Buffer 用 44 位指针）
        vm.movImm64(VReg.V2, "0x00000fffffffffff");
        vm.and(VReg.V1, VReg.V1, VReg.V2);
        vm.load(VReg.V1, VReg.V1, 8); // length

        // 累加
        vm.add(VReg.S2, VReg.S2, VReg.V1);

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp(calcLoop);

        vm.label(calcEnd);

        // 分配结果 buffer
        vm.addImm(VReg.A0, VReg.S2, BUFFER_HEADER);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET); // S3 = result buffer

        // 设置头部
        vm.movImm(VReg.V0, TYPE_UINT8_ARRAY);
        vm.store(VReg.S3, 0, VReg.V0);
        vm.store(VReg.S3, 8, VReg.S2);

        // 复制各个 buffer 内容
        vm.movImm(VReg.S4, 0); // S4 = offset
        vm.movImm(VReg.V0, 0); // i = 0

        const copyLoop = this.ctx.newLabel("buffer_concat_copy");
        const copyEnd = this.ctx.newLabel("buffer_concat_copy_end");

        vm.label(copyLoop);
        vm.cmp(VReg.V0, VReg.S1);
        vm.jge(copyEnd);

        // 获取 list[i]
        vm.push(VReg.V0);
        vm.shlImm(VReg.V1, VReg.V0, 3);
        vm.addImm(VReg.V2, VReg.S0, 24);
        vm.add(VReg.V2, VReg.V2, VReg.V1);
        vm.load(VReg.V1, VReg.V2, 0); // V1 = list[i] (boxed)

        // 解包（Buffer 用 44 位指针）
        vm.movImm64(VReg.V2, "0x00000fffffffffff");
        vm.and(VReg.V1, VReg.V1, VReg.V2);

        // 获取长度
        vm.load(VReg.V2, VReg.V1, 8); // V2 = length

        // memcpy(dest + offset, src + 16, length)
        vm.addImm(VReg.A0, VReg.S3, BUFFER_HEADER);
        vm.add(VReg.A0, VReg.A0, VReg.S4);
        vm.addImm(VReg.A1, VReg.V1, BUFFER_HEADER);
        vm.mov(VReg.A2, VReg.V2);
        vm.push(VReg.V2);
        vm.call("_memcpy");
        vm.pop(VReg.V2);

        // offset += length
        vm.add(VReg.S4, VReg.S4, VReg.V2);

        vm.pop(VReg.V0);
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp(copyLoop);

        vm.label(copyEnd);

        // 内联 NaN-boxing
        vm.movImm64(VReg.V0, "0x7ffe200000000000");
        vm.or(VReg.RET, VReg.V0, VReg.S3);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    /**
     * _buffer_is_buffer(obj) -> 0/1
     * 检查是否是 Buffer (Uint8Array)
     */
    generateBufferIsBuffer() {
        const vm = this.vm;

        vm.label("_buffer_is_buffer");

        // A0 和 V0 都是 X0！需要先保存 A0
        vm.mov(VReg.V1, VReg.A0); // V1 = input value (保存)

        // 使用与 typeof 类似的方法检查数组标签
        // 提取高 16 位
        vm.shrImm(VReg.V2, VReg.V1, 48); // V2 = high 16 bits

        // 检查是否是 0x7FFE (数组标签)
        vm.movImm(VReg.V0, 0x7ffe);
        vm.cmp(VReg.V2, VReg.V0);
        const checkType = this.ctx.newLabel("buffer_is_buffer_check");
        const notBuffer = this.ctx.newLabel("buffer_is_buffer_false");
        vm.jeq(checkType);
        vm.jmp(notBuffer);

        vm.label(checkType);
        // 解包指针 (低 44 位，因为 bits 44-47 用于 subtype)
        vm.movImm64(VReg.V0, "0x00000fffffffffff");
        vm.and(VReg.V2, VReg.V1, VReg.V0); // V2 = unboxed ptr

        // 读取类型
        vm.load(VReg.V0, VReg.V2, 0);
        vm.movImm(VReg.V3, TYPE_UINT8_ARRAY);
        vm.cmp(VReg.V0, VReg.V3);
        const isBuffer = this.ctx.newLabel("buffer_is_buffer_true");
        vm.jeq(isBuffer);

        vm.label(notBuffer);
        vm.movImm(VReg.RET, 0);
        vm.ret();

        vm.label(isBuffer);
        vm.movImm(VReg.RET, 1);
        vm.ret();
    }

    /**
     * _buffer_length(buf) -> length
     * 获取 Buffer 长度
     */
    generateBufferLength() {
        const vm = this.vm;

        vm.label("_buffer_length");

        // 解包指针（低 44 位，因为 bits 44-47 用于 subtype）
        vm.movImm64(VReg.V0, "0x00000fffffffffff");
        vm.and(VReg.V1, VReg.A0, VReg.V0);

        // 读取长度
        vm.load(VReg.RET, VReg.V1, 8);
        vm.ret();
    }

    /**
     * _buffer_toString(buf, encoding) -> string
     * 将 Buffer 转换为字符串
     *
     * 注意：堆字符串有 16 字节头部 [type:8][length:8][data...]
     */
    generateBufferToString() {
        const vm = this.vm;
        const TYPE_STRING = 0x30;

        vm.label("_buffer_toString");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // buf
        // encoding 暂时忽略，默认 utf8

        // 解包（Buffer 用 44 位指针）
        vm.movImm64(VReg.V1, "0x00000fffffffffff");
        vm.and(VReg.S0, VReg.S0, VReg.V1);

        // 获取长度
        vm.load(VReg.S1, VReg.S0, 8); // S1 = length

        // 分配堆字符串: 16 (header) + length + 1 (null terminator)
        vm.addImm(VReg.A0, VReg.S1, 17);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = string ptr (包含头部)

        // 写入头部
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S2, 0, VReg.V0);
        vm.store(VReg.S2, 8, VReg.S1);

        // 复制内容到 header + 16
        vm.addImm(VReg.A0, VReg.S2, 16); // dest = S2 + 16
        vm.addImm(VReg.A1, VReg.S0, BUFFER_HEADER); // src (buffer data)
        vm.mov(VReg.A2, VReg.S1); // length
        vm.call("_memcpy");

        // 添加 null terminator
        vm.addImm(VReg.V0, VReg.S2, 16);
        vm.add(VReg.V0, VReg.V0, VReg.S1);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        // 装箱返回（返回头部指针，打印时会加 16）
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_js_box_string");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }
}
