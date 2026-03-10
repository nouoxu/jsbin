// JSBin 对象运行时
// 提供对象操作函数

import { VReg } from "../../../vm/registers.js";

// 对象内存布局:
// +0:  type (8 bytes) = this.TYPE_OBJECT (2)
// +8:  属性数量 count (8 bytes)
// +16: __proto__ 指针 (8 bytes)
// +24: 属性区开始
//      每个属性: key指针(8) + value(8) = 16 bytes

export class ObjectGenerator {
    constructor(vm) {
        this.vm = vm;

        // 常量 (移到实例属性以避免自举编译问题)
        this.TYPE_OBJECT = 2;
        this.OBJECT_HEADER_SIZE = 24; // type + count + __proto__
        this.PROP_SIZE = 16; // key + value
        // 4096 bytes total per object -> (4096 - 24) / 16 ≈ 254 usable slots
        this.MAX_PROP_COUNT = 254;
    }

    generate() {
        this.generateObjectNew();
        this.generateObjectGet();
        this.generateObjectGetIC();
        this.generateObjectGetWithOffset();
        this.generateObjectSet();
        this.generateObjectHas();
        this.generatePropIn();
        this.generateObjectKeys();
        this.generateObjectValues();
        this.generateObjectEntries();
        this.generateObjectAssign();
        this.generateObjectCreate();
        this.generateHasOwnProperty();
        this.generateObjectToString();
        this.generateObjectValueOf();
        this.generateGetPrototypeOf();
        this.generateSetPrototypeOf();
        // Getter/Setter 支持
        this.generateObjectDefineGetter();
        this.generateObjectDefineSetter();
        this.generateObjectGetProp();
        this.generateObjectSetProp();
    }

    // 创建新对象
    // _object_new() -> obj
    generateObjectNew() {
        const vm = this.vm;

        vm.label("_object_new");
        vm.prologue(0, [VReg.S0]);

        // 分配 4096 字节空间（足够存储约 254 个属性）
        // 对象布局：24 字节头部 + N * 16 字节属性
        // (4096 - 24) / 16 = 254.5 个属性
        vm.movImm(VReg.A0, 4096);
        vm.call("_alloc");
        vm.mov(VReg.S0, VReg.RET);

        // 设置类型
        vm.movImm(VReg.V0, this.TYPE_OBJECT);
        vm.store(VReg.S0, 0, VReg.V0);

        // 初始化属性数量为 0
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S0, 8, VReg.V0);

        // 初始化 __proto__ 为 0 (null)
        vm.store(VReg.S0, 16, VReg.V0);

        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0], 0);
    }

    // 对象获取属性
    // _object_get(obj, key) -> value
    // obj 是 NaN-boxed object
    // key 是 C 字符串指针
    generateObjectGet() {
        const vm = this.vm;

        vm.label("_object_get");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S1, VReg.A1); // key (先保存)

        // Unbox 对象 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始对象指针

        // 检查 obj 是否为 null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_get_notfound");

        // 堆范围检查，非法指针直接视为未找到
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_object_get_notfound");
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_object_get_notfound");

        // 检查是否是 Error 对象 (TYPE_ERROR = 31)
        // Error 布局: +0=type, +8=message, +16=name, +24=stack, +32=cause
        vm.load(VReg.V0, VReg.S0, 0);
        vm.andImm(VReg.V0, VReg.V0, 0xff);
        vm.cmpImm(VReg.V0, 31); // TYPE_ERROR
        vm.jeq("_object_get_error");

        // Map/Set support (TYPE_MAP=4, TYPE_SET=5)
        vm.cmpImm(VReg.V0, 4);
        vm.jeq("_object_get_map");
        vm.cmpImm(VReg.V0, 5);
        vm.jeq("_object_get_map");

        // 加载属性数量并进行上限裁剪，避免越界读取未初始化槽位
        vm.load(VReg.S2, VReg.S0, 8); // prop count
        vm.movImm(VReg.V0, this.MAX_PROP_COUNT);
        vm.cmp(VReg.S2, VReg.V0);
        vm.jle("_object_get_count_ok");
        vm.mov(VReg.S2, VReg.V0);
        vm.label("_object_get_count_ok");
        vm.movImm(VReg.S3, 0); // index

        const loopLabel = "_object_get_loop";
        const foundLabel = "_object_get_found";
        const notFoundLabel = "_object_get_notfound";
        const checkProtoLabel = "_object_get_check_proto";

        vm.label(loopLabel);
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge(checkProtoLabel);

        // 计算属性偏移: this.OBJECT_HEADER_SIZE + index * this.PROP_SIZE
        vm.shl(VReg.V0, VReg.S3, 4); // index * 16
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // 加载 key；若 key 指针太小（疑似未初始化），跳过该槽位
        vm.load(VReg.A0, VReg.V0, 0);
        vm.cmpImm(VReg.A0, 4096);
        vm.jlt("_object_get_skip_invalid_key");

        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq(foundLabel);

        vm.label("_object_get_skip_invalid_key");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp(loopLabel);

        vm.label(foundLabel);
        // 加载 value: offset + 8
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE + 8);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.RET, VReg.V0, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        // 在原型链上查找
        vm.label(checkProtoLabel);
        vm.load(VReg.V0, VReg.S0, 16); // __proto__
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(notFoundLabel);
        // 递归查找原型
        vm.mov(VReg.A0, VReg.V0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_get");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label(notFoundLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        // Map/Set .size handler
        vm.label("_object_get_map");

        vm.mov(VReg.A0, VReg.S1); // key
        vm.lea(VReg.A1, "_str_size");
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_object_get_notfound"); // Only support .size for now

        // Found size (offset 8)
        vm.load(VReg.V0, VReg.S0, 8);

        vm.scvtf(VReg.D0, VReg.V0);
        vm.fmov(VReg.RET, VReg.D0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        // Error 对象属性处理
        // 布局: +0=type, +8=message, +16=name, +24=stack, +32=cause
        vm.label("_object_get_error");
        // 比较 key 与 "message"
        vm.mov(VReg.A0, VReg.S1);
        vm.lea(VReg.A1, "_str_message");
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_object_get_error_name");
        vm.load(VReg.RET, VReg.S0, 8); // message 在 +8
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_object_get_error_name");
        vm.mov(VReg.A0, VReg.S1);
        vm.lea(VReg.A1, "_str_name");
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_object_get_error_stack");
        vm.load(VReg.RET, VReg.S0, 16); // name 在 +16
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_object_get_error_stack");
        vm.mov(VReg.A0, VReg.S1);
        vm.lea(VReg.A1, "_str_stack");
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_object_get_error_cause");
        vm.load(VReg.RET, VReg.S0, 24); // stack 在 +24
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_object_get_error_cause");
        vm.mov(VReg.A0, VReg.S1);
        vm.lea(VReg.A1, "_str_cause");
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_object_get_error_notfound");
        vm.load(VReg.RET, VReg.S0, 32); // cause 在 +32
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_object_get_error_notfound");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // 对象设置属性
    // _object_set(obj, key, value)
    // obj 是 NaN-boxed object
    // key 是 C 字符串指针
    generateObjectSet() {
        const vm = this.vm;

        vm.label("_object_set");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S1, VReg.A1); // key
        vm.mov(VReg.S2, VReg.A2); // value

        // Unbox 对象 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始对象指针
        const loopLabel = "_object_set_loop";
        const foundLabel = "_object_set_found";
        const notFoundLabel = "_object_set_notfound";
        const doneLabel = "_object_set_done";

        // 对无效指针做早退，避免在空指针或越界地址上读写
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(doneLabel);
        // 堆范围检查，非法指针直接视为无操作
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt(doneLabel);
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge(doneLabel);

        // 先查找已有属性；对 prop count 做上限裁剪，避免越界写未初始化槽位
        vm.load(VReg.S3, VReg.S0, 8); // prop count
        vm.movImm(VReg.V0, this.MAX_PROP_COUNT);
        vm.cmp(VReg.S3, VReg.V0);
        vm.jle("_object_set_count_ok");
        vm.mov(VReg.S3, VReg.V0);
        vm.label("_object_set_count_ok");
        vm.movImm(VReg.S4, 0); // index

        vm.label(loopLabel);
        vm.cmp(VReg.S4, VReg.S3);
        vm.jge(notFoundLabel);

        // 计算属性偏移
        vm.shl(VReg.V0, VReg.S4, 4);
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE);
        vm.add(VReg.S5, VReg.S0, VReg.V0); // S5 = 属性地址

        // 加载现有 key 并比较；若 key 太小（疑似未初始化），跳过该槽位
        vm.load(VReg.A0, VReg.S5, 0);
        vm.cmpImm(VReg.A0, 4096);
        vm.jlt("_object_set_skip_invalid_key");

        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq(foundLabel);

        vm.label("_object_set_skip_invalid_key");

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp(loopLabel);

        // 找到已有属性，更新 value
        vm.label(foundLabel);
        vm.store(VReg.S5, 8, VReg.S2);
        vm.jmp(doneLabel);

        // 未找到，添加新属性
        vm.label(notFoundLabel);
        // 新属性偏移
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // 存储 key
        vm.store(VReg.V0, 0, VReg.S1);
        // 存储 value
        vm.store(VReg.V0, 8, VReg.S2);

        // 更新 count
        // Workaround: addImm might be buggy?
        vm.movImm(VReg.A0, 1);
        vm.add(VReg.S3, VReg.S3, VReg.A0);
        vm.store(VReg.S0, 8, VReg.S3);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 32);
    }

    // 检查对象是否有指定属性（不检查原型链）
    // _object_has(obj, key) -> 0/1
    // obj 是 NaN-boxed object
    generateObjectHas() {
        const vm = this.vm;

        vm.label("_object_has");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S1, VReg.A1); // key (先保存)

        // Unbox 对象 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始对象指针

        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_has_false");

        vm.load(VReg.S2, VReg.S0, 8); // count
        vm.movImm(VReg.S3, 0);

        vm.label("_object_has_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_object_has_false");

        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        vm.load(VReg.A0, VReg.V0, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_object_has_true");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_has_loop");

        vm.label("_object_has_true");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);

        vm.label("_object_has_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    }

    // 检查属性是否在对象中（包含原型链检查）
    // _prop_in(obj, key) -> 0/1
    // 用于实现 JavaScript 的 "in" 运算符
    generatePropIn() {
        const vm = this.vm;

        vm.label("_prop_in");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S1, VReg.A1); // key (先保存)

        // Unbox 对象 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始对象指针

        // 检查 obj 是否为 null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_prop_in_false");

        vm.load(VReg.S2, VReg.S0, 8); // count
        vm.movImm(VReg.S3, 0);

        vm.label("_prop_in_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_prop_in_check_proto");

        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        vm.load(VReg.A0, VReg.V0, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_prop_in_true");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_prop_in_loop");

        // 在原型链上查找
        vm.label("_prop_in_check_proto");
        vm.load(VReg.V0, VReg.S0, 16); // __proto__
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_prop_in_false");
        // 递归查找原型
        vm.mov(VReg.A0, VReg.V0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_prop_in");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);

        vm.label("_prop_in_true");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);

        vm.label("_prop_in_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    }

    // Object.keys(obj) -> 返回包含所有键的数组
    // _object_keys(obj) -> array
    generateObjectKeys() {
        const vm = this.vm;

        vm.label("_object_keys");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // Unbox 对象 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始对象指针

        // null/非法对象返回空数组，避免后续越界
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_keys_return_empty");

        // 获取属性数量
        vm.load(VReg.S1, VReg.S0, 8); // count
        // 上限裁剪，避免越界访问
        vm.movImm(VReg.V0, this.MAX_PROP_COUNT);
        vm.cmp(VReg.S1, VReg.V0);
        vm.jle("_object_keys_count_ok");
        vm.mov(VReg.S1, VReg.V0);
        vm.label("_object_keys_count_ok");

        // 创建结果数组
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET); // result array

        // 遍历属性
        vm.movImm(VReg.S3, 0); // index

        vm.label("_object_keys_loop");
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge("_object_keys_done");

        // 获取 key (C 字符串指针)
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.S4, VReg.V0, 0); // key -> S4 保存

        // 将 C 字符串指针转换为 JSValue (tag 4 = 字符串指针)
        // JSValue 格式: (ptr & 0xffffffffffff) | (4 << 44)
        vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        vm.and(VReg.S4, VReg.S4, VReg.V1); // 提取低 48 位
        vm.movImm64(VReg.V1, "0x400000000000"); // tag 4 左移 44 位
        vm.or(VReg.S4, VReg.S4, VReg.V1); // 组合 tag 和指针

        // 设置到数组
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S3);
        vm.mov(VReg.A2, VReg.S4);
        vm.call("_array_set");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_keys_loop");

        vm.label("_object_keys_done");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);

        // 返回空数组的分支
        vm.label("_object_keys_return_empty");
        vm.movImm(VReg.A0, 0);
        vm.call("_array_new_with_size");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    }

    // Object.values(obj) -> 返回包含所有值的数组
    // _object_values(obj) -> array
    generateObjectValues() {
        const vm = this.vm;

        vm.label("_object_values");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // Unbox 对象 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始对象指针
        // null/非法对象返回空数组，避免越界
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_values_return_empty");

        vm.load(VReg.S1, VReg.S0, 8); // count
        vm.movImm(VReg.V0, this.MAX_PROP_COUNT);
        vm.cmp(VReg.S1, VReg.V0);
        vm.jle("_object_values_count_ok");
        vm.mov(VReg.S1, VReg.V0);
        vm.label("_object_values_count_ok");

        vm.mov(VReg.A0, VReg.S1);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET);

        vm.movImm(VReg.S3, 0);

        vm.label("_object_values_loop");
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge("_object_values_done");

        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE + 8); // value offset
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.S4, VReg.V0, 0); // value -> S4

        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S3);
        vm.mov(VReg.A2, VReg.S4);
        vm.call("_array_set");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_values_loop");

        vm.label("_object_values_done");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);

        // 返回空数组的分支
        vm.label("_object_values_return_empty");
        vm.movImm(VReg.A0, 0);
        vm.call("_array_new_with_size");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    }

    // Object.entries(obj) -> 返回 [[key, value], ...] 数组
    // _object_entries(obj) -> array
    generateObjectEntries() {
        const vm = this.vm;

        vm.label("_object_entries");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // Unbox 对象 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始对象指针
        // null/非法对象返回空数组，避免越界
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_entries_return_empty");

        vm.load(VReg.S1, VReg.S0, 8); // count
        vm.movImm(VReg.V0, this.MAX_PROP_COUNT);
        vm.cmp(VReg.S1, VReg.V0);
        vm.jle("_object_entries_count_ok");
        vm.mov(VReg.S1, VReg.V0);
        vm.label("_object_entries_count_ok");

        // result = new Array(count)
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET);

        vm.movImm(VReg.S3, 0); // index

        vm.label("_object_entries_loop");
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge("_object_entries_done");

        // propAddr = obj + this.OBJECT_HEADER_SIZE + index*16
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // key/value；key 过小视为无效
        vm.load(VReg.S4, VReg.V0, 0);
        vm.cmpImm(VReg.S4, 4096);
        vm.jge("_object_entries_key_ok");
        vm.movImm(VReg.S4, 0);
        vm.label("_object_entries_key_ok");
        vm.load(VReg.S5, VReg.V0, 8);

        // pair = new Array(2)
        vm.movImm(VReg.A0, 2);
        vm.call("_array_new_with_size");
        vm.store(VReg.SP, 0, VReg.RET);

        // pair[0] = key
        vm.load(VReg.A0, VReg.SP, 0);
        vm.movImm(VReg.A1, 0);
        vm.mov(VReg.A2, VReg.S4);
        vm.call("_array_set");

        // pair[1] = value
        vm.load(VReg.A0, VReg.SP, 0);
        vm.movImm(VReg.A1, 1);
        vm.mov(VReg.A2, VReg.S5);
        vm.call("_array_set");

        // result[index] = pair
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S3);
        vm.load(VReg.A2, VReg.SP, 0);
        vm.call("_array_set");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_entries_loop");

        vm.label("_object_entries_done");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 16);
    }

    // Object.assign(target, ...sources) -> target
    // 简化版：_object_assign(target, source) -> target
    // target 和 source 都是 NaN-boxed object
    generateObjectAssign() {
        const vm = this.vm;

        vm.label("_object_assign");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // 保存 NaN-boxed target 用于返回
        vm.mov(VReg.S4, VReg.A0);

        // 重要：VReg.V1 在 arm64 上映射到 X1，会覆盖 A1。
        // 先把 A1(source) 保存到 callee-saved，再做掩码/解包。
        vm.mov(VReg.S1, VReg.A1);

        // Unbox target
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = target 原始指针

        // Unbox source
        vm.and(VReg.S1, VReg.S1, VReg.V1); // S1 = source 原始指针

        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_object_assign_done");

        vm.load(VReg.S2, VReg.S1, 8); // source count
        vm.movImm(VReg.S3, 0);

        vm.label("_object_assign_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_object_assign_done");

        // 获取 source 的 key 和 value
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S1, VReg.V0);

        vm.load(VReg.V1, VReg.V0, 0); // key
        vm.load(VReg.V2, VReg.V0, 8); // value

        // 设置到 target (使用 NaN-boxed target)
        vm.mov(VReg.A0, VReg.S4);
        vm.mov(VReg.A1, VReg.V1);
        vm.mov(VReg.A2, VReg.V2);
        vm.call("_object_set");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_assign_loop");

        vm.label("_object_assign_done");
        vm.mov(VReg.RET, VReg.S4); // 返回 NaN-boxed target
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    }

    // Object.create(proto) -> obj
    generateObjectCreate() {
        const vm = this.vm;

        vm.label("_object_create");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // proto

        // 创建新对象
        vm.call("_object_new");
        vm.mov(VReg.S1, VReg.RET);

        // 设置 __proto__
        vm.store(VReg.S1, 16, VReg.S0);

        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 16);

        // 返回空数组的分支
        vm.label("_object_entries_return_empty");
        vm.movImm(VReg.A0, 0);
        vm.call("_array_new_with_size");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 0);
    }

    // obj.hasOwnProperty(key) -> boolean
    generateHasOwnProperty() {
        const vm = this.vm;

        vm.label("_hasOwnProperty");
        // 直接调用 _object_has
        vm.jmp("_object_has");
    }

    // Object.getPrototypeOf(obj) -> proto
    // obj 是 NaN-boxed object
    generateGetPrototypeOf() {
        const vm = this.vm;

        vm.label("_object_getPrototypeOf");
        vm.prologue(0, [VReg.S0]);

        // Unbox 对象 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始对象指针

        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_getPrototypeOf_null");

        vm.load(VReg.RET, VReg.S0, 16);
        vm.epilogue([VReg.S0], 0);

        vm.label("_object_getPrototypeOf_null");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0], 0);
    }

    // Object.setPrototypeOf(obj, proto) -> obj
    // obj 是 NaN-boxed object
    generateSetPrototypeOf() {
        const vm = this.vm;

        vm.label("_object_setPrototypeOf");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        // 保存 NaN-boxed obj 用于返回
        vm.mov(VReg.S1, VReg.A0);

        // Unbox 对象 JSValue -> 原始指针 (提取低 44 位)
        vm.movImm64(VReg.V1, "0x00000fffffffffff"); // 44 位掩码
        vm.and(VReg.S0, VReg.A0, VReg.V1); // S0 = 原始对象指针

        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_setPrototypeOf_done");

        vm.store(VReg.S0, 16, VReg.A1);

        vm.label("_object_setPrototypeOf_done");
        vm.mov(VReg.RET, VReg.S1); // 返回 NaN-boxed obj
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // obj.toString() -> "[object Object]"
    generateObjectToString() {
        const vm = this.vm;

        vm.label("_object_toString");
        vm.prologue(0, []);
        vm.lea(VReg.RET, "_str_object");
        vm.epilogue([], 0);
    }

    // obj.valueOf() -> obj
    generateObjectValueOf() {
        const vm = this.vm;

        vm.label("_object_valueOf");
        vm.prologue(0, []);
        vm.mov(VReg.RET, VReg.A0);
        vm.epilogue([], 0);
    }

    // ========== 内联缓存 (IC) 相关函数 ==========

    // IC 状态常量
    static IC_STATE = {
        UNINITIALIZED: 0,
        MONOMORPHIC: 1,
        MEGAMORPHIC: 2,
    };

    /**
     * 带内联缓存的对象属性获取
     * _object_get_ic(obj, key, icSlot) -> value
     *
     * IC 槽位布局：
     *   +0: state (8 bytes)
     *   +8: cached_count (8 bytes) - 缓存时对象的属性数量
     *   +16: offset (8 bytes) - 属性在对象中的偏移量
     */
    generateObjectGetIC() {
        const vm = this.vm;
        const IC_STATE = ObjectGenerator.IC_STATE;

        vm.label("_object_get_ic");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // 保存参数
        vm.mov(VReg.S0, VReg.A0); // object
        vm.mov(VReg.S1, VReg.A1); // propName
        vm.mov(VReg.S2, VReg.A2); // icSlot

        // 检查 obj 是否为 null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_get_ic_slow");

        // 检查 IC 状态
        vm.load(VReg.V0, VReg.S2, 0); // state

        // 如果是未初始化状态，跳转到慢速路径
        vm.cmpImm(VReg.V0, IC_STATE.UNINITIALIZED);
        vm.jeq("_object_get_ic_slow");

        // 如果是超多态状态，也跳转到慢速路径
        vm.cmpImm(VReg.V0, IC_STATE.MEGAMORPHIC);
        vm.jeq("_object_get_ic_fallback");

        // 快速路径：检查属性数量是否与缓存时相同
        vm.load(VReg.V1, VReg.S0, 8); // object prop count
        vm.load(VReg.V2, VReg.S2, 8); // cached count
        vm.cmp(VReg.V1, VReg.V2);
        vm.jne("_object_get_ic_slow");

        // 属性数量匹配，使用缓存的偏移量直接获取值
        vm.load(VReg.S3, VReg.S2, 16); // cached offset
        vm.add(VReg.V0, VReg.S0, VReg.S3);

        // 验证：检查该位置的 key 是否匹配
        vm.load(VReg.A0, VReg.V0, 0); // key at offset
        vm.mov(VReg.A1, VReg.S1); // expected key
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_object_get_ic_miss");

        // Key 匹配，加载 value
        vm.add(VReg.V0, VReg.S0, VReg.S3);
        vm.load(VReg.RET, VReg.V0, 8); // value at offset + 8
        vm.jmp("_object_get_ic_done");

        // IC 未命中，标记为超多态
        vm.label("_object_get_ic_miss");
        vm.movImm(VReg.V0, IC_STATE.MEGAMORPHIC);
        vm.store(VReg.S2, 0, VReg.V0);
        // fall through to slow path

        // 慢速路径：调用带偏移量返回的属性获取
        vm.label("_object_get_ic_slow");
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_get_with_offset");
        vm.mov(VReg.S3, VReg.RET); // value
        vm.mov(VReg.S4, VReg.A2); // offset (返回在 A2 中)

        // 更新 IC 缓存（如果找到了属性且不是超多态状态）
        vm.load(VReg.V0, VReg.S2, 0); // current state
        vm.cmpImm(VReg.V0, IC_STATE.MEGAMORPHIC);
        vm.jeq("_object_get_ic_return");

        // 检查是否找到属性（offset >= 0）
        vm.cmpImm(VReg.S4, 0);
        vm.jlt("_object_get_ic_return");

        // 更新缓存
        vm.movImm(VReg.V0, IC_STATE.MONOMORPHIC);
        vm.store(VReg.S2, 0, VReg.V0); // state = MONOMORPHIC
        vm.load(VReg.V0, VReg.S0, 8); // prop count
        vm.store(VReg.S2, 8, VReg.V0); // cached_count
        vm.store(VReg.S2, 16, VReg.S4); // cached offset

        vm.label("_object_get_ic_return");
        vm.mov(VReg.RET, VReg.S3);
        vm.jmp("_object_get_ic_done");

        // 超多态回退：直接调用普通版本
        vm.label("_object_get_ic_fallback");
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_get");

        vm.label("_object_get_ic_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    /**
     * 获取对象属性，同时返回偏移量
     * _object_get_with_offset(obj, key) -> value, offset in A2
     *
     * 返回：
     *   RET: property value (或 0 如果未找到)
     *   A2: offset (或 -1 如果未找到)
     */
    generateObjectGetWithOffset() {
        const vm = this.vm;

        vm.label("_object_get_with_offset");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key

        // 检查 obj 是否为 null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_get_wo_notfound");

        // 加载属性数量并进行上限裁剪，避免越界读取未初始化槽位
        vm.load(VReg.S2, VReg.S0, 8); // prop count
        vm.movImm(VReg.V0, this.MAX_PROP_COUNT);
        vm.cmp(VReg.S2, VReg.V0);
        vm.jle("_object_get_wo_count_ok");
        vm.mov(VReg.S2, VReg.V0);
        vm.label("_object_get_wo_count_ok");
        vm.movImm(VReg.S3, 0); // index

        vm.label("_object_get_wo_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_object_get_wo_check_proto");

        // 计算属性偏移: this.OBJECT_HEADER_SIZE + index * this.PROP_SIZE
        vm.shl(VReg.V0, VReg.S3, 4); // index * 16
        vm.addImm(VReg.V0, VReg.V0, this.OBJECT_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V0); // V1 = property address

        // 加载 key；若 key 指针太小（疑似未初始化），跳过该槽位
        vm.load(VReg.A0, VReg.V1, 0);
        vm.cmpImm(VReg.A0, 4096);
        vm.jlt("_object_get_wo_skip_invalid_key");

        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_object_get_wo_found");

        vm.label("_object_get_wo_skip_invalid_key");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_get_wo_loop");

        vm.label("_object_get_wo_found");
        // 计算偏移量
        vm.shl(VReg.A2, VReg.S3, 4);
        vm.addImm(VReg.A2, VReg.A2, this.OBJECT_HEADER_SIZE);
        // 加载 value
        vm.add(VReg.V1, VReg.S0, VReg.A2);
        vm.load(VReg.RET, VReg.V1, 8);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        // 在原型链上查找
        vm.label("_object_get_wo_check_proto");
        vm.load(VReg.V0, VReg.S0, 16); // __proto__
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_object_get_wo_notfound");
        // 递归查找原型，但不返回偏移量（原型链上的属性不缓存）
        vm.mov(VReg.A0, VReg.V0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_get");
        vm.movImm(VReg.A2, -1); // 原型链上的属性，offset = -1
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_object_get_wo_notfound");
        vm.movImm(VReg.RET, 0);
        vm.movImm(VReg.A2, -1); // offset = -1 表示未找到
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    /**
     * _object_define_getter(obj, name, getterFn)
     * 存储 getter 函数，key 为 "__get__" + name
     */
    generateObjectDefineGetter() {
        const vm = this.vm;

        vm.label("_object_define_getter");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // name (char*)
        vm.mov(VReg.S2, VReg.A2); // getterFn

        // 创建 getter key: "__get__" + name
        // 分配缓冲区
        vm.movImm(VReg.A0, 256);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET); // S3 = buffer

        // 复制 "__get__" 前缀
        vm.mov(VReg.A0, VReg.S3);
        vm.lea(VReg.A1, "_str_getter_prefix");
        vm.call("_strcpy");

        // 追加属性名
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcat");

        // 设置属性 obj[getterKey] = getterFn
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S3);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_object_set");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    /**
     * _object_define_setter(obj, name, setterFn)
     * 存储 setter 函数，key 为 "__set__" + name
     */
    generateObjectDefineSetter() {
        const vm = this.vm;

        vm.label("_object_define_setter");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // name (char*)
        vm.mov(VReg.S2, VReg.A2); // setterFn

        // 创建 setter key: "__set__" + name
        vm.movImm(VReg.A0, 256);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);

        vm.mov(VReg.A0, VReg.S3);
        vm.lea(VReg.A1, "_str_setter_prefix");
        vm.call("_strcpy");

        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcat");

        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S3);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_object_set");

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    /**
     * _object_get_prop(obj, name, thisArg) -> value
     * 获取属性值，如果是 getter 则调用 getter(thisArg)
     * 如果 obj 不是有效对象，直接调用 _object_get
     * 特殊处理 TYPE_ENV_PROXY (20) - 从环境变量中获取值
     */
    generateObjectGetProp() {
        const vm = this.vm;
        const TYPE_ENV_PROXY = 20;

        vm.label("_object_get_prop");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // obj (可能是装箱的或裸指针)
        vm.mov(VReg.S1, VReg.A1); // name (char*)
        vm.mov(VReg.S2, VReg.A2); // thisArg

        // 检查 obj 是否是 0
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_get_prop_normal");

        // 检查高 16 位以确定是否是装箱值
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 48); // 取高 16 位

        // 检查是否是装箱的对象指针 (0x7ffd)
        vm.cmpImm(VReg.V0, 0x7ffd);
        vm.jeq("_object_get_prop_unbox");

        // 检查是否是其他 NaN-boxed 值 (>= 0x7ff0 但不是 0x7ffd)
        vm.cmpImm(VReg.V0, 0x7ff0);
        vm.jge("_object_get_prop_normal");

        // 高位 < 0x7ff0，可能是裸指针，直接检查类型
        vm.jmp("_object_get_prop_check_type");

        // 解包装箱的对象指针
        vm.label("_object_get_prop_unbox");
        vm.movImm64(VReg.V1, "0x0000ffffffffffff"); // 44-bit 掩码
        vm.and(VReg.S0, VReg.S0, VReg.V1); // 提取裸指针

        // 检查对象类型
        vm.label("_object_get_prop_check_type");
        // 非对象指针或越界地址直接走普通属性读取，避免对无效地址解引用
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_get_prop_normal");
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_object_get_prop_normal");
        vm.lea(VReg.V2, "_heap_ptr");
        vm.load(VReg.V2, VReg.V2, 0);
        vm.cmp(VReg.S0, VReg.V2);
        vm.jge("_object_get_prop_normal");
        // 检查是否是 TYPE_ENV_PROXY
        vm.load(VReg.V0, VReg.S0, 0); // 加载类型
        vm.cmpImm(VReg.V0, TYPE_ENV_PROXY);
        vm.jeq("_object_get_prop_env");

        // 1. 先检查是否有 getter: "__get__" + name
        vm.movImm(VReg.A0, 256);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);

        vm.mov(VReg.A0, VReg.S3);
        vm.lea(VReg.A1, "_str_getter_prefix");
        vm.call("_strcpy");

        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcat");

        // 查找 getter
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S3);
        vm.call("_object_get");
        vm.mov(VReg.S4, VReg.RET); // S4 = getter 函数指针（或 0）

        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_object_get_prop_normal");

        // 有 getter，调用它
        // 调用约定: V5 = this, A0-A4 = 参数
        vm.mov(VReg.V5, VReg.S2); // V5 = thisArg
        vm.callIndirect(VReg.S4);
        vm.jmp("_object_get_prop_done");

        // 处理 TYPE_ENV_PROXY：从环境变量中获取值
        vm.label("_object_get_prop_env");
        // S1 = property name (C string)
        // 调用 _get_env 来获取环境变量值
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_get_env");
        // RET = C string value 指针，或 0 (未找到)

        // 如果未找到，返回 undefined
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_object_get_prop_env_notfound");

        // 找到了，将 C string 转换为 JS string
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_createStrFromCStr");
        vm.mov(VReg.A0, VReg.RET);
        vm.jmp("_object_get_prop_done");

        vm.label("_object_get_prop_env_notfound");
        // 返回 undefined
        vm.lea(VReg.RET, "_js_undefined");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.jmp("_object_get_prop_done");

        // 没有 getter，正常获取属性
        vm.label("_object_get_prop_normal");
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_get");

        vm.label("_object_get_prop_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    /**
     * _object_set_prop(obj, name, value, thisArg)
     * 设置属性值，如果是 setter 则调用 setter(thisArg, value)
     * 如果 obj 不是有效对象，直接调用 _object_set
     */
    generateObjectSetProp() {
        const vm = this.vm;

        vm.label("_object_set_prop");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // name (char*)
        vm.mov(VReg.S2, VReg.A2); // value
        vm.mov(VReg.S3, VReg.A3); // thisArg

        // 检查 obj 是否是有效的堆对象
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_set_prop_normal");

        // 检查是否是 NaN-boxed 非对象值
        vm.mov(VReg.V0, VReg.S0);
        vm.shrImm(VReg.V0, VReg.V0, 48);
        vm.cmpImm(VReg.V0, 0x7ff0);
        vm.jge("_object_set_prop_normal");

        // 检查是否有 setter
        vm.movImm(VReg.A0, 256);
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET);

        vm.mov(VReg.A0, VReg.S4);
        vm.lea(VReg.A1, "_str_setter_prefix");
        vm.call("_strcpy");

        vm.mov(VReg.A0, VReg.S4);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcat");

        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S4);
        vm.call("_object_get");
        vm.mov(VReg.S4, VReg.RET);

        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_object_set_prop_normal");

        // 有 setter，调用它 (V5=thisArg, A0=value)
        vm.mov(VReg.V5, VReg.S3); // V5 = thisArg
        vm.mov(VReg.A0, VReg.S2); // A0 = value
        vm.callIndirect(VReg.S4);
        vm.jmp("_object_set_prop_done");

        // 没有 setter，正常设置属性
        vm.label("_object_set_prop_normal");
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_object_set");

        vm.label("_object_set_prop_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }
}
