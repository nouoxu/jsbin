// JSBin 运行时 - 下标访问
// 统一处理 Array 和 TypedArray 的下标访问

import { VReg } from "../../vm/registers.js";
import { TYPE_INT8_ARRAY, TYPE_INT16_ARRAY, TYPE_INT32_ARRAY, TYPE_INT64_ARRAY, TYPE_UINT8_ARRAY, TYPE_UINT16_ARRAY, TYPE_UINT32_ARRAY, TYPE_UINT64_ARRAY, TYPE_UINT8_CLAMPED_ARRAY, TYPE_FLOAT32_ARRAY, TYPE_FLOAT64_ARRAY, NUM_INT8, NUM_INT16, NUM_INT32, NUM_INT64, NUM_UINT8, NUM_UINT16, NUM_UINT32, NUM_UINT64, NUM_UINT8_CLAMPED, NUM_FLOAT32, NUM_FLOAT64 } from "./types.js";

export class SubscriptGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    // _subscript_get(arr, index) -> value
    // 根据数组类型（Array 或 TypedArray）选择正确的访问方式
    // TypedArray 返回 boxed Number（类型与元素类型匹配）
    generateGet() {
        const vm = this.vm;

        vm.label("_subscript_get");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S1, VReg.A1); // 先保存 index
        vm.mov(VReg.S4, VReg.A0); // 先保存原始 JSValue（用于提取 subtype/标签）

        // 先检查高 16 位标签，确保是数组/TypedArray。否则返回 undefined，避免非法指针。
        vm.shrImm(VReg.V0, VReg.S4, 48); // V0 = high16
        vm.movImm(VReg.V1, 0x7ffe); // 数组/TypedArray tag
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_subscript_get_tagged_array");

        // 字符串下标访问（当类型未知而走到 subscript_get 时）
        vm.movImm(VReg.V1, 0x7ffc);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_subscript_get_string");

        // 其他类型：返回 undefined
        vm.lea(VReg.RET, "_js_undefined");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.jmp("_subscript_get_done");

        // ========== Tagged Array/TypedArray 路径 ==========
        vm.label("_subscript_get_tagged_array");

        // 从 boxed JSValue 提取 subtype (bits 44-47)
        vm.shrImm(VReg.V0, VReg.S4, 44);
        vm.andImm(VReg.V0, VReg.V0, 0xf); // V0 = subtype (0=Array, 1-11=TypedArray)
        vm.mov(VReg.S3, VReg.V0); // S3 = subtype

        // Unbox 数组 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.S4, VReg.V1); // S0 = 原始数组指针

        // 检查是否是普通 Array (subtype 0)
        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_subscript_get_array");

        // ========== TypedArray 路径 ==========
        // subtype 对应关系:
        // 1=Int8, 2=Uint8, 3=Uint8Clamped, 4=Int16, 5=Uint16,
        // 6=Int32, 7=Uint32, 8=Float32, 9=Float64, 10=BigInt64, 11=BigUint64

        // Int8Array (subtype 1)
        vm.cmpImm(VReg.S3, 1);
        vm.jne("_subscript_get_check_uint8");
        vm.add(VReg.V1, VReg.S0, VReg.S1); // arr + index (1 byte per elem)
        vm.loadByte(VReg.S2, VReg.V1, 16);
        // 符号扩展: 如果 bit7 为 1，则高位填 1
        vm.andImm(VReg.V2, VReg.S2, 0x80);
        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_subscript_get_int8_pos");
        vm.movImm(VReg.V2, -256);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.label("_subscript_get_int8_pos");
        vm.movImm(VReg.S4, NUM_INT8);
        vm.jmp("_subscript_get_box_int");

        // Uint8Array (subtype 2)
        vm.label("_subscript_get_check_uint8");
        vm.cmpImm(VReg.S3, 2);
        vm.jne("_subscript_get_check_uint8c");
        vm.add(VReg.V1, VReg.S0, VReg.S1);
        vm.loadByte(VReg.S2, VReg.V1, 16);
        // loadByte 已经是零扩展
        vm.movImm(VReg.S4, NUM_UINT8);
        vm.jmp("_subscript_get_box_int");

        // Uint8ClampedArray (subtype 3)
        vm.label("_subscript_get_check_uint8c");
        vm.cmpImm(VReg.S3, 3);
        vm.jne("_subscript_get_check_int16");
        vm.add(VReg.V1, VReg.S0, VReg.S1);
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.movImm(VReg.S4, NUM_UINT8_CLAMPED);
        vm.jmp("_subscript_get_box_int");

        // Int16Array (subtype 4)
        vm.label("_subscript_get_check_int16");
        vm.cmpImm(VReg.S3, 4);
        vm.jne("_subscript_get_check_uint16");
        vm.shl(VReg.V1, VReg.S1, 1); // index * 2
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        // 加载 2 字节 (低字节 + 高字节)
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.loadByte(VReg.V2, VReg.V1, 17);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        // 符号扩展
        vm.andImm(VReg.V2, VReg.S2, 0x8000);
        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_subscript_get_int16_pos");
        vm.movImm(VReg.V2, -65536);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.label("_subscript_get_int16_pos");
        vm.movImm(VReg.S4, NUM_INT16);
        vm.jmp("_subscript_get_box_int");

        // Uint16Array (subtype 5)
        vm.label("_subscript_get_check_uint16");
        vm.cmpImm(VReg.S3, 5);
        vm.jne("_subscript_get_check_int32");
        vm.shl(VReg.V1, VReg.S1, 1);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.loadByte(VReg.V2, VReg.V1, 17);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.movImm(VReg.S4, NUM_UINT16);
        vm.jmp("_subscript_get_box_int");

        // Int32Array (subtype 6)
        vm.label("_subscript_get_check_int32");
        vm.cmpImm(VReg.S3, 6);
        vm.jne("_subscript_get_check_uint32");
        vm.shl(VReg.V1, VReg.S1, 2); // index * 4
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        // 加载 4 字节 (little-endian)
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.loadByte(VReg.V2, VReg.V1, 17);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 18);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 19);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        // 32 位符号扩展到 64 位
        vm.andImm(VReg.V2, VReg.S2, 0x80000000);
        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_subscript_get_int32_pos");
        vm.movImm(VReg.V2, 0xffffffff);
        vm.shl(VReg.V2, VReg.V2, 32);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.label("_subscript_get_int32_pos");
        vm.movImm(VReg.S4, NUM_INT32);
        vm.jmp("_subscript_get_box_int");

        // Uint32Array (subtype 7)
        vm.label("_subscript_get_check_uint32");
        vm.cmpImm(VReg.S3, 7);
        vm.jne("_subscript_get_check_float32");
        vm.shl(VReg.V1, VReg.S1, 2);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.loadByte(VReg.V2, VReg.V1, 17);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 18);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 19);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        // Uint32 自动零扩展到 64 位
        vm.movImm(VReg.S4, NUM_UINT32);
        vm.jmp("_subscript_get_box_int");

        // Float32Array (subtype 8) - 加载 4 字节并转换
        vm.label("_subscript_get_check_float32");
        vm.cmpImm(VReg.S3, 8);
        vm.jne("_subscript_get_check_float64");
        vm.shl(VReg.V1, VReg.S1, 2);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        // 加载 4 字节 float32 位模式
        vm.loadByte(VReg.S2, VReg.V1, 16);
        vm.loadByte(VReg.V2, VReg.V1, 17);
        vm.shl(VReg.V2, VReg.V2, 8);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 18);
        vm.shl(VReg.V2, VReg.V2, 16);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        vm.loadByte(VReg.V2, VReg.V1, 19);
        vm.shl(VReg.V2, VReg.V2, 24);
        vm.or(VReg.S2, VReg.S2, VReg.V2);
        // 使用浮点指令转换 float32 -> float64
        // 将 32 位值移到浮点寄存器，转换，再移回
        vm.fmovToFloatSingle(0, VReg.S2);
        vm.fcvts2d(0, 0); // single to double
        vm.fmovToInt(VReg.S2, 0);
        vm.movImm(VReg.S4, NUM_FLOAT32);
        vm.jmp("_subscript_get_box_float");

        // Float64Array (subtype 9)
        vm.label("_subscript_get_check_float64");
        vm.cmpImm(VReg.S3, 9);
        vm.jne("_subscript_get_check_int64");
        vm.shl(VReg.V1, VReg.S1, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.S2, VReg.V1, 16);
        vm.movImm(VReg.S4, NUM_FLOAT64);
        vm.jmp("_subscript_get_box_float");

        // BigInt64Array (subtype 10)
        vm.label("_subscript_get_check_int64");
        vm.cmpImm(VReg.S3, 10);
        vm.jne("_subscript_get_check_uint64");
        vm.shl(VReg.V1, VReg.S1, 3); // index * 8
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.S2, VReg.V1, 16);
        vm.movImm(VReg.S4, NUM_INT64);
        vm.jmp("_subscript_get_box_int");

        // BigUint64Array (subtype 11) - 默认
        vm.label("_subscript_get_check_uint64");
        vm.shl(VReg.V1, VReg.S1, 3);
        vm.add(VReg.V1, VReg.S0, VReg.V1);
        vm.load(VReg.S2, VReg.V1, 16);
        vm.movImm(VReg.S4, NUM_UINT64);
        vm.jmp("_subscript_get_box_int");

        // Box 整数类型 - 将 raw int 转为 float64 位模式再存储
        vm.label("_subscript_get_box_int");
        // 先将 raw int (S2) 转为 float64 位模式
        // SCVTF: 有符号整数转浮点
        vm.scvtf(0, VReg.S2);
        // FMOV: 浮点位模式移到整数寄存器
        vm.fmovToInt(VReg.S2, 0);

        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");
        // type = 13 (TYPE_NUMBER) | (subtype << 8)
        vm.shl(VReg.V1, VReg.S4, 8);
        vm.orImm(VReg.V1, VReg.V1, 13); // TYPE_NUMBER = 13
        vm.store(VReg.RET, 0, VReg.V1);
        vm.store(VReg.RET, 8, VReg.S2); // 现在 S2 是 float64 位模式
        vm.jmp("_subscript_get_done");

        // Box 浮点类型
        vm.label("_subscript_get_box_float");
        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");
        // 对于浮点数，使用 TYPE_FLOAT64 (29) 作为主类型保持兼容
        vm.movImm(VReg.V1, 29); // TYPE_FLOAT64
        vm.store(VReg.RET, 0, VReg.V1);
        vm.store(VReg.RET, 8, VReg.S2);
        vm.jmp("_subscript_get_done");

        // ========== Array 路径 ==========
        // Array 结构: [type:8, length:8, capacity:8, elem0, elem1, ...]
        // 偏移 = load(header[24]) + index * 8
        vm.label("_subscript_get_array");
        vm.load(VReg.V0, VReg.S0, 24); // Load Body Ptr
        vm.shl(VReg.V1, VReg.S1, 3);
        vm.add(VReg.V1, VReg.V0, VReg.V1);
        vm.load(VReg.RET, VReg.V1, 0);
        vm.jmp("_subscript_get_done"); // 必须跳转到结束，否则会落入 String 路径

        // ========== String 路径 ==========
        // 当静态类型未知时，字符串索引访问会落到这里；委托给 _str_charAt
        vm.label("_subscript_get_string");
        vm.mov(VReg.A0, VReg.S4); // 原始 JSValue（可能是 NaN-boxed 或数据段指针）
        vm.mov(VReg.A1, VReg.S1); // index 已经是整数
        vm.call("_str_charAt");

        vm.label("_subscript_get_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    // _subscript_set(arr, index, value)
    // 根据数组类型选择正确的赋值方式
    generateSet() {
        const vm = this.vm;

        vm.label("_subscript_set");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S1, VReg.A1); // index
        vm.mov(VReg.S2, VReg.A2); // value

        // 解包数组 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff");
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始数组指针

        // 加载类型标签
        vm.load(VReg.V0, VReg.S0, 0);
        vm.andImm(VReg.V0, VReg.V0, 0xff); // 取低 8 位

        // 检查是否是 TypedArray (类型 0x40-0x70)
        vm.cmpImm(VReg.V0, 0x40);
        vm.jlt("_subscript_set_array"); // 小于 0x40，是普通 Array

        // TypedArray 路径 - 调用 _typed_array_set 来处理 unboxing
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_typed_array_set");
        vm.jmp("_subscript_set_done");

        // Array 路径
        vm.label("_subscript_set_array");
        // Array 结构: [type:8, length:8, capacity:8, ptr:8] -> [elem0, elem1, ...]
        vm.load(VReg.V1, VReg.S0, 24); // Load Body Ptr
        vm.shl(VReg.V0, VReg.S1, 3); // index * 8
        vm.add(VReg.V0, VReg.V1, VReg.V0);
        vm.store(VReg.V0, 0, VReg.S2);

        vm.label("_subscript_set_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _dynamic_subscript_get(obj, key_jsvalue) -> value
    // key_jsvalue 是 JSValue，可能是 Number 或 String
    // 如果是 Number -> 提取整数索引，调用 _subscript_get
    // 如果是 String -> 转换为 C 字符串，调用 _object_get
    generateDynamicGet() {
        const vm = this.vm;

        vm.label("_dynamic_subscript_get");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key (JSValue)

        // 检查 key 的高 16 位标签
        vm.shrImm(VReg.V0, VReg.S1, 48);

        // 检查是否是 Number 对象 (0x7FFD = boxed object, 需要检查内部类型)
        // 或者直接检查是否是 boxed string (0x7FFC)
        vm.movImm(VReg.V1, 0x7ffc); // String tag
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_dynamic_subscript_get_string");

        // 检查是否是 Number/Object (0x7FFD)
        vm.movImm(VReg.V1, 0x7ffd);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_dynamic_subscript_get_check_number");

        // 其他类型：假设是数字，尝试转换为整数
        // 这包括 NaN-boxed 的浮点数 (0x0000-0x7FF0)
        vm.jmp("_dynamic_subscript_get_as_number");

        // String 路径：key 是字符串
        vm.label("_dynamic_subscript_get_string");
        // 获取字符串内容指针（支持数据段/堆字符串）
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_getStrContent");
        vm.mov(VReg.A1, VReg.RET); // A1 = C string pointer
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_object_get");
        vm.jmp("_dynamic_subscript_get_done");

        // 检查是否是 Number 对象
        vm.label("_dynamic_subscript_get_check_number");
        // 提取对象指针
        vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        vm.and(VReg.V0, VReg.S1, VReg.V1);
        // 加载类型
        vm.load(VReg.V1, VReg.V0, 0);
        vm.andImm(VReg.V1, VReg.V1, 0xff);
        // 检查是否是 TYPE_NUMBER (0x1D = 29)
        vm.cmpImm(VReg.V1, 0x1d);
        vm.jeq("_dynamic_subscript_get_as_number");
        // 检查是否是 TYPE_STRING (0x11 = 17)
        vm.cmpImm(VReg.V1, 0x11);
        vm.jeq("_dynamic_subscript_get_boxed_string");
        // 其他对象类型：尝试作为数字处理
        vm.jmp("_dynamic_subscript_get_as_number");

        // 处理 boxed string (TYPE_STRING 对象)
        vm.label("_dynamic_subscript_get_boxed_string");
        vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        vm.and(VReg.V0, VReg.S1, VReg.V1);
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_getStrContent");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_object_get");
        vm.jmp("_dynamic_subscript_get_done");

        // Number 路径：提取浮点数并转换为整数索引
        vm.label("_dynamic_subscript_get_as_number");
        // 如果是 boxed number (0x7FFD)，需要 unbox
        vm.shrImm(VReg.V0, VReg.S1, 48);
        vm.movImm(VReg.V1, 0x7ffd);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_dynamic_subscript_get_boxed_number");

        // 检查是否是裸堆指针（没有 NaN-boxing 标签的 Number 对象）
        // 如果 key 在堆范围内且 type 是 TYPE_FLOAT64 (29)，则是 Number 对象
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S1, VReg.V1);
        vm.jlt("_dynamic_subscript_get_raw_float");
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S1, VReg.V1);
        vm.jge("_dynamic_subscript_get_raw_float");
        // 在堆范围内，检查类型
        vm.load(VReg.V0, VReg.S1, 0); // 加载类型
        vm.andImm(VReg.V0, VReg.V0, 0xff);
        vm.cmpImm(VReg.V0, 29); // TYPE_FLOAT64
        vm.jne("_dynamic_subscript_get_raw_float");
        // 是裸 Number 对象，从 offset 8 提取 float64
        vm.load(VReg.V0, VReg.S1, 8);
        vm.fmovToFloat(0, VReg.V0);
        vm.jmp("_dynamic_subscript_get_convert_to_int");

        // Boxed number (0x7FFD tag): 从对象中提取 float64
        vm.label("_dynamic_subscript_get_boxed_number");
        vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        vm.and(VReg.V0, VReg.S1, VReg.V1);
        vm.load(VReg.V0, VReg.V0, 8); // offset 8 = float64 bits
        vm.fmovToFloat(0, VReg.V0);
        vm.jmp("_dynamic_subscript_get_convert_to_int");

        // Raw float (NaN-boxed)
        vm.label("_dynamic_subscript_get_raw_float");
        vm.fmovToFloat(0, VReg.S1); // 直接将 bits 移到 D0

        vm.label("_dynamic_subscript_get_convert_to_int");
        vm.fcvtzs(VReg.A1, 0); // 转换为整数索引
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_subscript_get");

        vm.label("_dynamic_subscript_get_done");
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // _dynamic_subscript_set(obj, key_jsvalue, value) -> void
    // key_jsvalue 是 JSValue，可能是 Number 或 String
    generateDynamicSet() {
        const vm = this.vm;

        vm.label("_dynamic_subscript_set");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key (JSValue)
        vm.mov(VReg.S2, VReg.A2); // value

        // 检查 key 的高 16 位标签
        vm.shrImm(VReg.V0, VReg.S1, 48);

        // 检查是否是 String (0x7FFC)
        vm.movImm(VReg.V1, 0x7ffc);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_dynamic_subscript_set_string");

        // 检查是否是 Object (0x7FFD)
        vm.movImm(VReg.V1, 0x7ffd);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_dynamic_subscript_set_check_object");

        // 其他类型：假设是数字
        vm.jmp("_dynamic_subscript_set_as_number");

        // String 路径
        vm.label("_dynamic_subscript_set_string");
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_getStrContent");
        vm.mov(VReg.A1, VReg.RET); // C string
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_object_set");
        vm.jmp("_dynamic_subscript_set_done");

        // 检查对象类型
        vm.label("_dynamic_subscript_set_check_object");
        vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        vm.and(VReg.V0, VReg.S1, VReg.V1);
        vm.load(VReg.V1, VReg.V0, 0);
        vm.andImm(VReg.V1, VReg.V1, 0xff);
        // TYPE_STRING = 0x11
        vm.cmpImm(VReg.V1, 0x11);
        vm.jeq("_dynamic_subscript_set_boxed_string");
        // 其他：作为数字
        vm.jmp("_dynamic_subscript_set_as_number");

        // Boxed string
        vm.label("_dynamic_subscript_set_boxed_string");
        vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        vm.and(VReg.V0, VReg.S1, VReg.V1);
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_getStrContent");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_object_set");
        vm.jmp("_dynamic_subscript_set_done");

        // Number 路径
        vm.label("_dynamic_subscript_set_as_number");
        vm.shrImm(VReg.V0, VReg.S1, 48);
        vm.movImm(VReg.V1, 0x7ffd);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne("_dynamic_subscript_set_raw_float");

        // Boxed number
        vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        vm.and(VReg.V0, VReg.S1, VReg.V1);
        vm.load(VReg.V0, VReg.V0, 8);
        vm.fmovToFloat(0, VReg.V0);
        vm.jmp("_dynamic_subscript_set_convert");

        vm.label("_dynamic_subscript_set_raw_float");
        vm.fmovToFloat(0, VReg.S1);

        vm.label("_dynamic_subscript_set_convert");
        vm.fcvtzs(VReg.A1, 0);
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_subscript_set");

        vm.label("_dynamic_subscript_set_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    generate() {
        this.generateGet();
        this.generateSet();
        this.generateDynamicGet();
        this.generateDynamicSet();
    }
}
