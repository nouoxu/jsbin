// JSBin 对象运行时
// 提供对象操作函数

import { VReg } from "../../../vm/registers.js";
import { JS_TAG_STRING_BASE, JS_PAYLOAD_MASK } from "../../core/jsvalue.js";

// 对象内存布局:
// +0:  type (8 bytes) = TYPE_OBJECT (2)
// +8:  属性数量 count (8 bytes)
// +16: __proto__ 指针 (8 bytes)
// +24: 属性区开始
//      每个属性: key指针(8) + value(8) = 16 bytes

const TYPE_OBJECT = 2;
const OBJECT_HEADER_SIZE = 24; // type + count + __proto__
const PROP_SIZE = 16; // key + value

export class ObjectGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        this.generateObjectNew();
        this.generateObjectGet();
        this.generateObjectSet();
        this.generateObjectKeyEq();
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
    }

    // 创建新对象
    // _object_new() -> obj (raw pointer)
    generateObjectNew() {
        const vm = this.vm;

        vm.label("_object_new");
        vm.prologue(0, [VReg.S0]);

        // 暂时使用更大的固定对象槽位，避免默认导出对象和模块
        // namespace 在属性较多时越界写坏堆。后续可以再演进成真正的
        // capacity/grow 语义。
        vm.movImm(VReg.A0, 1024);
        vm.call("_alloc");
        vm.mov(VReg.S0, VReg.RET);

        // 设置类型
        vm.movImm(VReg.V0, TYPE_OBJECT);
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
    generateObjectGet() {
        const vm = this.vm;

        vm.label("_object_get");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key
        
        // 类型检查: 必须是 Object (0x7FFD) 或 Array (0x7FFE)
        vm.shrImm(VReg.V1, VReg.S0, 48);
        vm.cmpImm(VReg.V1, 0x7FFD); // Object
        vm.jeq("_object_get_tag_ok");
        vm.cmpImm(VReg.V1, 0x7FFE); // Array
        vm.jeq("_object_get_tag_ok");
        
        // 非法类型，安全返回 undefined
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_object_get_tag_ok");
        // 指针脱壳
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.S0, VReg.V4);

        // 检查 obj 是否为 null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_get_notfound");

        // 加载属性数量
        vm.load(VReg.S2, VReg.S0, 8); // prop count
        vm.movImm(VReg.S3, 0); // index

        const loopLabel = "_object_get_loop";
        const foundLabel = "_object_get_found";
        const notFoundLabel = "_object_get_notfound";
        const checkProtoLabel = "_object_get_check_proto";

        vm.label(loopLabel);
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge(checkProtoLabel);

        // 计算属性偏移: OBJECT_HEADER_SIZE + index * PROP_SIZE
        vm.shl(VReg.V0, VReg.S3, 4); // index * 16
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // 加载 key
        vm.load(VReg.A0, VReg.V0, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_key_eq");

        vm.cmpImm(VReg.RET, 0);
        vm.jne(foundLabel);

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp(loopLabel);

        vm.label(foundLabel);
        // 加载 value: offset + 8
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE + 8);
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
    }

    // 对象设置属性
    // _object_set(obj, key, value)
    generateObjectSet() {
        const vm = this.vm;

        vm.label("_object_set");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key
        vm.mov(VReg.S2, VReg.A2); // value

        // 类型检查: 必须是 Object (0x7FFD) 或 Array (0x7FFE)
        vm.shrImm(VReg.V1, VReg.S0, 48);
        vm.cmpImm(VReg.V1, 0x7FFD); // Object
        vm.jeq("_object_set_tag_ok");
        vm.cmpImm(VReg.V1, 0x7FFE); // Array
        vm.jeq("_object_set_tag_ok");
        
        // 非法类型，跳过设置
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        vm.label("_object_set_tag_ok");
        // 指针脱壳
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.S0, VReg.V4);

        // 调试：检查对象是否为 NULL
        vm.cmpImm(VReg.S0, 0);
        const objOkLabel = "_object_set_obj_ok";
        vm.jne(objOkLabel);
        
        vm.lea(VReg.A0, this.vm.asm.addString("FATAL: _object_set called with NULL object! (A0=0)\n"));
        vm.call("_print_str");
        vm.movImm(VReg.A0, 1);
        vm.call("_exit");

        vm.label(objOkLabel);

        // 先查找已有属性
        vm.load(VReg.S3, VReg.S0, 8); // prop count
        vm.movImm(VReg.S4, 0); // index

        const loopLabel = "_object_set_loop";
        const foundLabel = "_object_set_found";
        const notFoundLabel = "_object_set_notfound";
        const doneLabel = "_object_set_done";

        vm.label(loopLabel);
        vm.cmp(VReg.S4, VReg.S3);
        vm.jge(notFoundLabel);

        // 计算属性偏移
        vm.shl(VReg.V0, VReg.S4, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.S5, VReg.S0, VReg.V0); // S5 = 属性地址

        // 加载现有 key 并比较
        vm.load(VReg.A0, VReg.S5, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_key_eq");

        vm.cmpImm(VReg.RET, 0);
        vm.jne(foundLabel);

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
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // 存储 key
        vm.store(VReg.V0, 0, VReg.S1);
        // 存储 value
        vm.store(VReg.V0, 8, VReg.S2);

        // 更新 count
        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.store(VReg.S0, 8, VReg.S3);

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    }

    // _object_key_eq(key1_jsvalue, key2_jsvalue) -> 0/1
    // 比较两个 JSValue key 是否相等（用于对象属性查找）
    // 处理 NaN-boxed 字符串指针比较
    generateObjectKeyEq() {
        const vm = this.vm;
        vm.label("_object_key_eq");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // key1 (JSValue)
        vm.mov(VReg.S1, VReg.A1); // key2 (JSValue)

        // 提取 payload 并比较指针
        // key1 payload = key1 & 0x0000FFFFFFFFFFFF
        vm.movImm64(VReg.V0, JS_PAYLOAD_MASK);
        vm.and(VReg.S3, VReg.S0, VReg.V0); // S3 = key1 payload (data offset)
        vm.and(VReg.S4, VReg.S1, VReg.V0); // S4 = key2 payload (data offset)

        // 比较指针是否相等
        vm.cmp(VReg.S3, VReg.S4);
        vm.jne("_object_key_eq_ne");

        // 指针相等，返回 1
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);

        vm.label("_object_key_eq_ne");
        // 指针不等，检查是否是数据段字符串
        // 数据段字符串的偏移量在 [0, 0x100000) 范围内
        // S3 = key1 offset, S4 = key2 offset

        // 检查 key1 offset 是否在数据段范围 [0, 0x100000)
        vm.cmpImm(VReg.S3, 0);
        vm.jlt("_object_key_eq_check_heap"); // S3 < 0
        vm.movImm(VReg.V0, 0x100000);
        vm.cmp(VReg.S3, VReg.V0);
        vm.jge("_object_key_eq_check_heap"); // S3 >= 0x100000

        // 检查 key2 offset 是否在数据段范围 [0, 0x100000)
        vm.cmpImm(VReg.S4, 0);
        vm.jlt("_object_key_eq_check_heap"); // S4 < 0
        vm.cmp(VReg.S4, VReg.V0);
        vm.jge("_object_key_eq_check_heap"); // S4 >= 0x100000

        // 如果 key1 是数据偏移但 key2 看起来像绝对地址 (>= 0x100000)，
        // 尝试将 key2 转换为偏移。获取 _data_start 并减去它。
        vm.lea(VReg.V1, "_data_start");
        vm.sub(VReg.S4, VReg.S4, VReg.V1);  // S4 = key2_address - _data_start = offset
        vm.cmpImm(VReg.S4, 0);
        vm.jlt("_object_key_eq_check_heap"); // S4 < 0 after conversion, not a valid offset
        vm.cmp(VReg.S4, VReg.V0);
        vm.jge("_object_key_eq_check_heap"); // S4 >= 0x100000 after conversion

        // 两个都是数据段字符串 - 需要逐字节比较
        // 获取 _data_start 基地址
        vm.lea(VReg.V0, "_data_start"); // V0 = _data_start 基地址
        vm.add(VReg.S0, VReg.V0, VReg.S3); // S0 = _data_start + key1_offset = key1 地址
        vm.add(VReg.S1, VReg.V0, VReg.S4); // S1 = _data_start + key2_offset = key2 地址

        // 逐字节比较直到 null 终止符
        const loopLabel = "_object_key_eq_data_loop";
        const doneLabel = "_object_key_eq_data_done";
        vm.movImm(VReg.V1, 0); // index = 0

        vm.label(loopLabel);
        vm.add(VReg.V2, VReg.S0, VReg.V1); // V2 = key1_chars + index
        vm.loadByte(VReg.A0, VReg.V2, 0); // A0 = key1[index]
        vm.add(VReg.V2, VReg.S1, VReg.V1); // V2 = key2_chars + index
        vm.loadByte(VReg.A1, VReg.V2, 0); // A1 = key2[index]
        vm.cmp(VReg.A0, VReg.A1);
        vm.jne("_object_key_eq_false"); // 字符不等
        vm.cmpImm(VReg.A0, 0);
        vm.jeq(doneLabel); // 到达 null 终止符，相等
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);

        vm.label("_object_key_eq_check_heap");
        // 不是数据段字符串，使用堆对象比较逻辑
        // 加载字符串长度（假设字符串对象布局：+0=tag, +8=length, +16=chars...）
        // 字符串对象: +0=type(TAG_STRING=4), +8=length, +16=char_data
        vm.addImm(VReg.S2, VReg.S3, 8); // S2 = key1 string + 8
        vm.load(VReg.S2, VReg.S2, 0); // S2 = key1 length

        // 比较长度
        vm.addImm(VReg.V1, VReg.S4, 8);
        vm.load(VReg.V1, VReg.V1, 0); // V1 = key2 length
        vm.cmp(VReg.S2, VReg.V1);
        vm.jne("_object_key_eq_false"); // 长度不等

        // 长度相等，逐字符比较
        // S3 = key1 chars, S4 = key2 chars, S2 = length
        vm.addImm(VReg.S3, VReg.S3, 16); // chars start
        vm.addImm(VReg.S4, VReg.S4, 16);
        vm.mov(VReg.S2, VReg.S2); // length already in S2

        const heapLoopLabel = "_object_key_eq_loop";
        const heapDoneLabel = "_object_key_eq_str_eq";
        vm.movImm(VReg.V0, 0); // index = 0

        vm.label(heapLoopLabel);
        vm.cmp(VReg.V0, VReg.S2);
        vm.jge(heapDoneLabel);

        vm.add(VReg.V2, VReg.S3, VReg.V0);
        vm.load(VReg.A0, VReg.V2, 0);
        vm.add(VReg.V2, VReg.S4, VReg.V0);
        vm.load(VReg.A1, VReg.V2, 0);
        vm.cmp(VReg.A0, VReg.A1);
        vm.jne("_object_key_eq_false");

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp(heapLoopLabel);

        vm.label(heapDoneLabel);
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);

        vm.label("_object_key_eq_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    }

    // 检查对象是否有指定属性（不检查原型链）
    // _object_has(obj, key) -> 0/1
    generateObjectHas() {
        const vm = this.vm;

        vm.label("_object_has");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key
        
        // 指针脱壳
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.S0, VReg.V4);

        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_has_false");

        vm.load(VReg.S2, VReg.S0, 8); // count
        vm.movImm(VReg.S3, 0);

        vm.label("_object_has_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_object_has_false");

        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        vm.load(VReg.A0, VReg.V0, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_key_eq");

        vm.cmpImm(VReg.RET, 0);
        vm.jne("_object_has_true");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_has_loop");

        vm.label("_object_has_true");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);

        vm.label("_object_has_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // 检查属性是否在对象中（包含原型链检查）
    // _prop_in(obj, key) -> 0/1
    // 用于实现 JavaScript 的 "in" 运算符
    generatePropIn() {
        const vm = this.vm;

        vm.label("_prop_in");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key
        
        // 指针脱壳
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.S0, VReg.V4);

        // 检查 obj 是否为 null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_prop_in_false");

        vm.load(VReg.S2, VReg.S0, 8); // count
        vm.movImm(VReg.S3, 0);

        vm.label("_prop_in_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_prop_in_check_proto");

        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        vm.load(VReg.A0, VReg.V0, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_key_eq");

        vm.cmpImm(VReg.RET, 0);
        vm.jne("_prop_in_true");

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

        vm.mov(VReg.S0, VReg.A0); // obj
        
        // 指针脱壳
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.S0, VReg.V4);

        // 获取属性数量
        vm.load(VReg.S1, VReg.S0, 8); // count

        // 创建结果数组
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET); // result array

        // 遍历属性
        vm.movImm(VReg.S3, 0); // index

        vm.label("_object_keys_loop");
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge("_object_keys_done");

        // 获取 key
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.S4, VReg.V0, 0); // key -> S4 保存

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
    }

    // Object.values(obj) -> 返回包含所有值的数组
    // _object_values(obj) -> array
    generateObjectValues() {
        const vm = this.vm;

        vm.label("_object_values");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // obj
        
        // 指针脱壳
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.S0, VReg.V4);
        vm.load(VReg.S1, VReg.S0, 8); // count

        vm.mov(VReg.A0, VReg.S1);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET);

        vm.movImm(VReg.S3, 0);

        vm.label("_object_values_loop");
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge("_object_values_done");

        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE + 8); // value offset
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
    }

    // Object.entries(obj) -> 返回 [[key, value], ...] 数组
    // _object_entries(obj) -> array
    generateObjectEntries() {
        const vm = this.vm;

        vm.label("_object_entries");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // obj
        
        // 指针脱壳
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.S0, VReg.V4);
        vm.load(VReg.S1, VReg.S0, 8); // count

        // result = new Array(count)
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET);

        vm.movImm(VReg.S3, 0); // index

        vm.label("_object_entries_loop");
        vm.cmp(VReg.S3, VReg.S1);
        vm.jge("_object_entries_done");

        // propAddr = obj + OBJECT_HEADER_SIZE + index*16
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S0, VReg.V0);

        // key/value
        vm.load(VReg.S4, VReg.V0, 0);
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
    generateObjectAssign() {
        const vm = this.vm;

        vm.label("_object_assign");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // target
        vm.mov(VReg.S1, VReg.A1); // source
        
        // 指针脱壳 (双向)
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.S0, VReg.V4);
        vm.and(VReg.S1, VReg.S1, VReg.V4);

        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_object_assign_done");

        vm.load(VReg.S2, VReg.S1, 8); // source count
        vm.movImm(VReg.S3, 0);

        vm.label("_object_assign_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_object_assign_done");

        // 获取 source 的 key 和 value
        vm.shl(VReg.V0, VReg.S3, 4);
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V0, VReg.S1, VReg.V0);

        vm.load(VReg.V1, VReg.V0, 0); // key
        vm.load(VReg.V2, VReg.V0, 8); // value

        // 设置到 target
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.V1);
        vm.mov(VReg.A2, VReg.V2);
        vm.call("_object_set");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_assign_loop");

        vm.label("_object_assign_done");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // Object.create(proto) -> obj
    generateObjectCreate() {
        const vm = this.vm;

        vm.label("_object_create");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // proto
        
        // 指针脱壳
        vm.movImm64(VReg.V4, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.S0, VReg.V4);

        // 创建新对象
        vm.call("_object_new");
        vm.mov(VReg.S1, VReg.RET);

        // 设置 __proto__
        vm.store(VReg.S1, 16, VReg.S0);

        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // obj.hasOwnProperty(key) -> boolean
    generateHasOwnProperty() {
        const vm = this.vm;

        vm.label("_hasOwnProperty");
        // 直接调用 _object_has
        vm.jmp("_object_has");
    }

    // Object.getPrototypeOf(obj) -> proto
    generateGetPrototypeOf() {
        const vm = this.vm;

        vm.label("_object_getPrototypeOf");
        vm.prologue(0, []);

        vm.cmpImm(VReg.A0, 0);
        vm.jeq("_object_getPrototypeOf_null");

        vm.load(VReg.RET, VReg.A0, 16);
        vm.epilogue([], 0);

        vm.label("_object_getPrototypeOf_null");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([], 0);
    }

    // Object.setPrototypeOf(obj, proto) -> obj
    generateSetPrototypeOf() {
        const vm = this.vm;

        vm.label("_object_setPrototypeOf");
        vm.prologue(0, []);

        vm.cmpImm(VReg.A0, 0);
        vm.jeq("_object_setPrototypeOf_done");

        vm.store(VReg.A0, 16, VReg.A1);

        vm.label("_object_setPrototypeOf_done");
        vm.mov(VReg.RET, VReg.A0);
        vm.epilogue([], 0);
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
}
