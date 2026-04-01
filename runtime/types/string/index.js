// JSBin 字符串运行时
// 提供字符串操作函数

import { VReg } from "../../../vm/registers.js";
import { TYPE_ARRAY, TYPE_OBJECT, TYPE_STRING, HEADER_SIZE } from "../../core/allocator.js";
import { JS_ARRAY_PTR_MASK, JS_GET_ARRAY_PTR } from "../../core/jsvalue.js";

export class StringGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    // 辅助函数: 安全地写入对象头中的类型标记和长度，不破坏 allocator 的 size 和 sizeClass
    // ptrReg: 字符串内容区指针 (block + 16)
    // lenReg: 字符串长度
    writeStringHeader(ptrReg, lenReg) {
        const vm = this.vm;
        const TYPE_STRING = 6;
        
        vm.subImm(VReg.V0, ptrReg, 16); // V0 = block pointer
        
        // 1. 保留高 56 位的 metadata (size, class), 覆盖低 8 位为 TYPE_STRING
        vm.load(VReg.V1, VReg.V0, 0); // V1 = old flags_and_size
        vm.movImm64(VReg.V2, 0xffffffffffffff00n);
        vm.and(VReg.V1, VReg.V1, VReg.V2); // 清除低 8 位
        vm.movImm(VReg.V2, TYPE_STRING); // JSBin 中类型保存在最低 byte
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.store(VReg.V0, 0, VReg.V1); // 写回
        
        // 2. 写入对象长度
        vm.store(VReg.V0, 8, lenReg);
    }

    // 生成字符串长度函数
    // _strlen(str) -> length
    generateStrlen() {
        const vm = this.vm;

        vm.label("_strlen");
        // IMPORTANT: Register order must be [S0, S1] for identity restore
        // stpPre stores r1 to lower address, r2 to higher
        // ldpPost loads r1 from lower, r2 from higher
        // So prologue [S0,S1] + epilogue [S0,S1] = identity
        vm.prologue(0, [VReg.S0, VReg.S1]);

        // S0 = str pointer
        // S1 = counter
        vm.call("_getStrContent");
        vm.mov(VReg.S0, VReg.RET);
        vm.movImm(VReg.S1, 0);

        const loopLabel = "_strlen_loop";
        const doneLabel = "_strlen_done";

        vm.label(loopLabel);
        // 加载当前字符（单字节）
        vm.loadByte(VReg.V0, VReg.S0, 0);
        // 检查是否为 0
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(doneLabel);
        // 计数器 +1
        vm.addImm(VReg.S1, VReg.S1, 1);
        // 指针 +1
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // 生成字符串比较函数
    // _strcmp(s1, s2) -> 0 if equal, non-zero otherwise
    generateStrcmp() {
        const vm = this.vm;

        vm.label("_strcmp");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        const loopLabel = "_strcmp_loop";
        const notEqualLabel = "_strcmp_ne";
        const doneLabel = "_strcmp_done";

        vm.label(loopLabel);
        // 加载两个字符（使用 loadByte 加载单字节）
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.loadByte(VReg.V1, VReg.S1, 0);

        // 比较
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne(notEqualLabel);

        // 如果都是 0，相等
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(doneLabel);

        // 继续
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp(loopLabel);

        vm.label(notEqualLabel);
        vm.sub(VReg.RET, VReg.V0, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1], 0);

        vm.label(doneLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // 生成字符串复制函数
    // _strcpy(dest, src) -> dest
    generateStrcpy() {
        const vm = this.vm;

        vm.label("_strcpy");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // dest
        vm.mov(VReg.S1, VReg.A1); // src
        vm.mov(VReg.S2, VReg.A0); // 保存原始 dest

        const loopLabel = "_strcpy_loop";
        const doneLabel = "_strcpy_done";

        vm.label(loopLabel);
        vm.loadByte(VReg.V0, VReg.S1, 0);
        vm.storeByte(VReg.S0, 0, VReg.V0);

        vm.cmpImm(VReg.V0, 0);
        vm.jeq(doneLabel);

        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 0);
    }

    // 生成字符串连接函数
    // _strcat(dest, src) -> dest
    generateStrcat() {
        const vm = this.vm;

        vm.label("_strcat");
        vm.prologue(0, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // dest
        vm.mov(VReg.S1, VReg.A1); // src
        vm.mov(VReg.S2, VReg.A0); // 保存原始 dest

        // 找到 dest 的末尾
        const findEndLabel = "_strcat_find_end";
        const copyLabel = "_strcat_copy";
        const doneLabel = "_strcat_done";

        vm.label(findEndLabel);
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(copyLabel);
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp(findEndLabel);

        // 复制 src 到末尾
        vm.label(copyLabel);
        vm.loadByte(VReg.V0, VReg.S1, 0);
        vm.storeByte(VReg.S0, 0, VReg.V0);

        vm.cmpImm(VReg.V0, 0);
        vm.jeq(doneLabel);

        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp(copyLabel);

        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 0);
    }

    // 获取字符串内容指针
    // 如果是堆字符串（有TYPE_STRING标记），返回 +16 偏移（跳过 type + length）
    // 如果是数据段字符串，直接返回原指针
    // _getStrContent(str) -> content_ptr
    generateGetStrContent() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_getStrContent");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);

        // 0. 增加 null 处理
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_getStrContent_invalid");

        // 1. 检查是否是我们的 NaN-boxed 字符串 (tag 4, 高 16 位 0x7FFC)
        vm.shrImm(VReg.V0, VReg.S0, 48); // V0 = high 16 bits
        vm.movImm(VReg.V1, 0x7FFC);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_getStrContent_unbox");

        // 2. 如果高 16 位 >= 0x7FF0，说明是其他 NaN-boxed 值或负浮点数
        // 这些都不可能是有效的字符串指针
        vm.movImm(VReg.V1, 0x7FF0);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jge("_getStrContent_invalid");

        // 3. 否则，它可能是原始指针 (data segment 或已经 unbox 的 heap ptr)
        // 进一步检查是否在堆范围内
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_getStrContent_done_direct"); // 小于堆基址，认为是数据段指针

        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_getStrContent_done_direct"); // 大于堆当前边界，可能是外部指针或非法

        // 在堆范围内，检查类型标记是否为 STRING
        vm.subImm(VReg.V0, VReg.S0, 16); // V0 = block pointer
        vm.load(VReg.V1, VReg.V0, 0);
        vm.andImm(VReg.V1, VReg.V1, 0xff);
        vm.movImm(VReg.V2, TYPE_STRING);
        vm.cmp(VReg.V1, VReg.V2);
        vm.jne("_getStrContent_invalid");

        // 是堆字符串，返回 content 指针 (S0 已经是 block+16)
        vm.jmp("_getStrContent_done_direct");

        vm.label("_getStrContent_unbox");
        // 是 NaN-boxed 字符串，取出低48位
        vm.movImm64(VReg.V1, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.S0, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1], 32);

        vm.label("_getStrContent_invalid");
        // 非法字符串，返回空字符串指针
        vm.lea(VReg.RET, "_str_empty");
        vm.epilogue([VReg.S0, VReg.S1], 32);

        vm.label("_getStrContent_done_direct");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // 生成字符串连接函数（分配新内存）
    // _strconcat(s1, s2) -> 新字符串（带TYPE_STRING标记）
    generateStrconcat() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_strconcat");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // S0 = s1
        vm.mov(VReg.S1, VReg.A1); // S1 = s2

        // 获取 s1 的实际内容指针
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_getStrContent");
        vm.mov(VReg.S0, VReg.RET);

        // 获取 s2 的实际内容指针
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_getStrContent");
        vm.mov(VReg.S1, VReg.RET);

        // DEBUG: Print pointers
        // vm.mov(VReg.A0, VReg.S0);
        // vm.call("_print_int");
        // vm.mov(VReg.A0, VReg.S1);
        // vm.call("_print_int");

        // 分配 1024 字节（足够绝大多数情况）
        vm.movImm(VReg.A0, 1024);
        vm.call("_alloc");
        vm.subImm(VReg.S2, VReg.RET, 16); // S2 = block 指针
        // 写入类型标记和长度（保留 Allocator 头部）
        // length 字段在后面计算好后再调用一次或者直接在最后写入

        // S3 = 内容起始位置（block + 16）
        vm.addImm(VReg.S3, VReg.S2, 16);

        // 复制 s1 到内容区域
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcpy");

        // 追加 s2
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcat");

        // 计算并存储 length
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_strlen");
        this.writeStringHeader(VReg.S3, VReg.RET);

        // 转换为 NaN-boxed JS 字符串
        vm.mov(VReg.RET, VReg.S3); // RET = content 指针 (block + 16)
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn); // V1 = PAYLOAD_MASK
        vm.and(VReg.RET, VReg.RET, VReg.V1); // RET = RET & MASK
        vm.movImm64(VReg.V1, 0x7ffc000000000000n); // V1 = TAG_STRING_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V1); // RET = RET | TAG
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
    }

    // 整数转字符串
    // _intToStr(n) -> str（带TYPE_STRING标记）
    generateIntToStr() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_intToStr");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 输入数字

        // 分配 40 字节缓冲区（16字节头部 + 24字节内容）
        // _alloc 返回用户数据指针 (block + 16)，需要减回头部
        vm.movImm(VReg.A0, 40);
        vm.call("_alloc");
        vm.subImm(VReg.S4, VReg.RET, 16); // S4 = block 指针

        // 写入类型标记
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S4, 0, VReg.V0);
        // length 字段稍后填充

        // S1 = 内容写入位置（跳过16字节头部）
        vm.addImm(VReg.S1, VReg.S4, 16);
        vm.mov(VReg.S3, VReg.S1); // S3 = 保存内容起始位置

        // 处理负数
        const positiveLabel = "_intToStr_positive";
        vm.cmpImm(VReg.S0, 0);
        vm.jge(positiveLabel);

        // 写 '-'
        vm.movImm(VReg.V0, 45); // '-'
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);
        // 取反
        vm.movImm(VReg.V0, 0);
        vm.sub(VReg.S0, VReg.V0, VReg.S0);

        vm.label(positiveLabel);

        // 处理 0 的特殊情况
        const notZeroLabel = "_intToStr_notZero";
        const endLabel = "_intToStr_end";
        vm.cmpImm(VReg.S0, 0);
        vm.jne(notZeroLabel);
        vm.movImm(VReg.V0, 48); // '0'
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S1, 1, VReg.V0);
        vm.jmp(endLabel);

        vm.label(notZeroLabel);

        // 使用临时栈存储数字（逆序）
        vm.movImm(VReg.S2, 0); // S2 = 位数计数

        // 循环取每位数字（从低到高）
        const pushLoop = "_intToStr_pushLoop";
        const pushDone = "_intToStr_pushDone";
        vm.label(pushLoop);
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(pushDone);

        vm.movImm(VReg.V1, 10);
        vm.mod(VReg.V0, VReg.S0, VReg.V1); // V0 = 当前位
        vm.div(VReg.S0, VReg.S0, VReg.V1); // S0 = 剩余数字
        vm.addImm(VReg.V0, VReg.V0, 48); // + '0'
        vm.push(VReg.V0);
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(pushLoop);

        vm.label(pushDone);

        // 从栈中弹出并写入 buffer（正序）
        const popLoop = "_intToStr_popLoop";
        const popDone = "_intToStr_popDone";
        vm.label(popLoop);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq(popDone);

        vm.pop(VReg.V0);
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.subImm(VReg.S2, VReg.S2, 1);
        vm.jmp(popLoop);

        vm.label(popDone);

        // 写入结束符
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S1, 0, VReg.V0);

        vm.label(endLabel);
        // 计算并存储 length
        vm.addImm(VReg.A0, VReg.S4, 16); // 内容起始
        vm.call("_strlen");
        vm.store(VReg.S4, 8, VReg.RET); // 存储 length

        // 转换为 NaN-boxed JS 字符串
        vm.mov(VReg.RET, VReg.S4); // RET = block 指针
        vm.addImm(VReg.RET, VReg.RET, 16); // RET = content 指针 = block + 16
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn); // V1 = PAYLOAD_MASK
        vm.and(VReg.RET, VReg.RET, VReg.V1); // RET = RET & MASK
        vm.movImm64(VReg.V1, 0x7ffc000000000000n); // V1 = TAG_STRING_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V1); // RET = RET | TAG
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    // 布尔值转字符串
    // _boolToStr(b) -> str
    generateBoolToStr() {
        const vm = this.vm;

        vm.label("_boolToStr");

        const falseLabel = "_boolToStr_false";
        const endLabel = "_boolToStr_end";

        vm.cmpImm(VReg.A0, 0);
        vm.jeq(falseLabel);

        // true
        vm.lea(VReg.RET, "_str_true");
        vm.jmp(endLabel);

        vm.label(falseLabel);
        // false
        vm.lea(VReg.RET, "_str_false");

        vm.label(endLabel);
        vm.ret();
    }

    // 通用 toString（简化版）
    // _toString(v) -> str
    generateToString() {
        const vm = this.vm;

        vm.label("_toString");
        // 简单实现：返回 "[object Object]"
        vm.lea(VReg.RET, "_str_object");
        vm.ret();
    }

    // 智能值转字符串
    // _valueToStr(v) -> str (returns heap string as NaN-boxed JS string)
    // ECMAScript ToString: undefined→"undefined", null→"null",
    // true→"true", false→"false", numbers use float conversion
    generateValueToStr() {
        const vm = this.vm;
        const TYPE_STRING = 6;
        const TYPE_NUMBER = 13;
        const TYPE_FLOAT64 = 29;
        const TYPE_CLOSURE = 3;

        vm.label("_valueToStr");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = original value

        // ========== Check for JSValue (high 16 bits >= 0x7FF8) ==========
        vm.shrImm(VReg.V1, VReg.S0, 48); // V1 = high 16 bits
        vm.movImm(VReg.V0, 0x7FF8);
        vm.cmp(VReg.V1, VReg.V0);
        vm.jlt("_valueToStr_check_non_js"); // < 0x7FF8, not JSValue

        // High bits >= 0x7FF8: JSValue, calculate tag
        vm.subImm(VReg.V1, VReg.V1, 0x7FF8); // V1 = tag (0-7)

        // Tag 4 = string: unbox
        vm.cmpImm(VReg.V1, 4);
        vm.jeq("_valueToStr_js_string");

        // Tag 7 = function: return "[Function]"
        vm.cmpImm(VReg.V1, 7);
        vm.jeq("_valueToStr_js_function");

        // Tag 6 = array: unbox and call _array_to_string
        vm.cmpImm(VReg.V1, 6);
        vm.jeq("_valueToStr_js_array");

        // Tag 1 = boolean
        vm.cmpImm(VReg.V1, 1);
        vm.jeq("_valueToStr_js_boolean");

        // Tag 2 = null
        vm.cmpImm(VReg.V1, 2);
        vm.jeq("_valueToStr_js_null");

        // Tag 3 = undefined
        vm.cmpImm(VReg.V1, 3);
        vm.jeq("_valueToStr_js_undefined");

        // Tag 5 = object
        vm.cmpImm(VReg.V1, 5);
        vm.jeq("_valueToStr_js_object");

        // Tag 0 = integer, but ONLY if tag is actually 0
        // If tag is not in 0-7, it's not a valid JSValue (could be a raw float
        // with high bits >= 0x7FF8, like negative floats: -3.0 = 0xC008...)
        vm.cmpImm(VReg.V1, 0);
        vm.jne("_valueToStr_check_non_js"); // tag != 0, not a valid JSValue
        vm.jmp("_valueToStr_js_number");

        // ========== JSValue handlers ==========
        vm.label("_valueToStr_js_boolean");
        // Boolean: extract bit 0, return "true" or "false"
        vm.andImm(VReg.V0, VReg.S0, 1);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_valueToStr_js_boolean_false");
        // true
        vm.lea(VReg.A0, "_str_true");
        vm.jmp("_valueToStr_data_str_create_heap");
        vm.label("_valueToStr_js_boolean_false");
        vm.lea(VReg.A0, "_str_false");
        vm.jmp("_valueToStr_data_str_create_heap");

        vm.label("_valueToStr_js_null");
        vm.lea(VReg.A0, "_str_null");
        vm.jmp("_valueToStr_data_str_create_heap");

        vm.label("_valueToStr_js_undefined");
        vm.lea(VReg.A0, "_str_undefined");
        vm.jmp("_valueToStr_data_str_create_heap");

        vm.label("_valueToStr_js_function");
        vm.lea(VReg.A0, "_str_function");
        vm.jmp("_valueToStr_data_str_create_heap");

        vm.label("_valueToStr_js_object");
        vm.lea(VReg.A0, "_str_object");
        vm.jmp("_valueToStr_data_str_create_heap");

        vm.label("_valueToStr_js_array");
        // Array: extract low 48 bits as array pointer
        vm.movImm64(VReg.V0, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.S0, VReg.S0, VReg.V0);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_array_to_string");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_valueToStr_js_string");
        // String: extract low 48 bits
        vm.movImm64(VReg.V0, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.S0, VReg.S0, VReg.V0);
        // Check if it's a data segment string or heap string
        vm.lea(VReg.V1, "_data_start");
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_valueToStr_as_heap_string"); // < _data_start, not data segment
        vm.lea(VReg.V1, "_data_start");
        vm.addImm(VReg.V1, VReg.V1, 0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_valueToStr_as_heap_string"); // >= _data_start + 0x100000, not data segment
        // It's a data segment string
        vm.jmp("_valueToStr_as_data_str");

        vm.label("_valueToStr_js_number");
        // JSValue number: convert to string, then wrap in heap string
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_numberToString");
        // RET = data string pointer (NaN-boxed), wrap in heap string
        vm.mov(VReg.S1, VReg.RET); // S1 = data string pointer (NaN-boxed)
        // Unbox S1 to get raw string pointer for strlen
        vm.mov(VReg.A0, VReg.S1);
        vm.movImm64(VReg.V0, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.A0, VReg.A0, VReg.V0); // A0 = raw string pointer
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = string length
        vm.addImm(VReg.A0, VReg.S2, 17);
        vm.call("_alloc");
        vm.mov(VReg.A0, VReg.RET); // A0 = user pointer = block + 16
        vm.subImm(VReg.V0, VReg.A0, 16); // V0 = block pointer
        this.writeStringHeader(VReg.V0, VReg.S2);
        vm.mov(VReg.A0, VReg.RET); // dest = content pointer (block+16)
        // Unbox S1 for source pointer
        vm.mov(VReg.A1, VReg.S1);
        vm.movImm64(VReg.V0, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.A1, VReg.A1, VReg.V0); // A1 = raw source string pointer
        vm.call("_strcpy");
        // Return NaN-boxed heap string
        vm.mov(VReg.RET, VReg.RET); // RET = content pointer
        vm.movImm64(VReg.V1, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.movImm64(VReg.V1, 0x7FFC000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // ========== Non-JSValue path ==========
        vm.label("_valueToStr_check_non_js");
        // Not a JSValue. Could be: raw float, data segment pointer, or integer
        // Check if it's a data segment string pointer using _data_start label
        // This is the same approach used in print.js for reliable data segment detection
        vm.lea(VReg.V1, "_data_start");
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_valueToStr_check_raw_number"); // < _data_start, not data segment string

        // Check if in data segment range (_data_start + 0x100000)
        vm.lea(VReg.V1, "_data_start");
        vm.addImm(VReg.V1, VReg.V1, 0x100000);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_valueToStr_check_heap_or_number"); // >= _data_start + 0x100000

        // S0 is in data segment range [_data_start, _data_start + 0x100000)
        // Also verify it's not in the heap range (check against heap_ptr)
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0); // V1 = heap_ptr
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_valueToStr_check_heap_or_number"); // S0 >= heap_ptr, might be heap object

        // Also check against heap_base to be safe
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0); // V1 = heap_base
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_valueToStr_check_heap_or_number"); // S0 >= heap_base, might be heap object

        // Verify first byte is printable ASCII (32-127) or null (0) to confirm it's a string
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_valueToStr_as_data_str"); // null byte = empty string
        vm.cmpImm(VReg.V0, 32);
        vm.jlt("_valueToStr_check_raw_number"); // < 32, not printable ASCII
        vm.cmpImm(VReg.V0, 127);
        vm.jge("_valueToStr_check_raw_number"); // >= 127, not printable ASCII
        vm.jmp("_valueToStr_as_data_str");

        vm.label("_valueToStr_check_data_ptr_range");
        // Legacy check - keep for backward compatibility but use _data_start based check above
        // Check if in low data segment range [0x100000, 0x100108000)
        vm.movImm(VReg.V0, 0x100000);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_valueToStr_check_raw_number"); // < 0x100000
        vm.movImm(VReg.V0, 0x100108000);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jge("_valueToStr_check_raw_number"); // >= 0x100108000
        // Also check against heap_ptr to avoid misclassifying heap objects
        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0); // V1 = heap_ptr
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_valueToStr_check_raw_number"); // S0 >= heap_ptr, not data string
        // In low data segment range, verify first byte is printable ASCII or null
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_valueToStr_as_data_str"); // null byte = empty string
        vm.cmpImm(VReg.V0, 32);
        vm.jlt("_valueToStr_check_raw_number"); // < 32, not printable ASCII
        vm.cmpImm(VReg.V0, 127);
        vm.jge("_valueToStr_check_raw_number"); // >= 127, not printable ASCII
        vm.jmp("_valueToStr_as_data_str");

        vm.label("_valueToStr_check_heap_or_number");
        // Not in data segment, could be heap object or raw number
        // Check heap base first - if S0 < heap_base, it's likely a data segment address
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0); // V0 = heap_base
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_valueToStr_check_data_ptr_range"); // S0 < heap_base, might be data segment

        // S0 >= heap_base, check heap pointer
        vm.lea(VReg.V0, "_heap_ptr");
        vm.load(VReg.V0, VReg.V0, 0); // V0 = heap_ptr
        vm.cmp(VReg.S0, VReg.V0);
        vm.jge("_valueToStr_check_raw_number"); // >= heap_ptr, not heap object

        // S0 < heap_ptr, could be heap object
        // Check if it's a heap string (has valid type at offset 0)
        vm.load(VReg.V1, VReg.S0, 0);
        vm.andImm(VReg.V1, VReg.V1, 0xff);
        vm.cmpImm(VReg.V1, TYPE_STRING);
        vm.jeq("_valueToStr_as_heap_string");
        vm.cmpImm(VReg.V1, TYPE_NUMBER);
        vm.jeq("_valueToStr_as_number_obj");
        vm.cmpImm(VReg.V1, TYPE_FLOAT64);
        vm.jeq("_valueToStr_as_number_obj");
        vm.cmpImm(VReg.V1, TYPE_ARRAY);
        vm.jeq("_valueToStr_as_array");
        vm.cmpImm(VReg.V1, TYPE_OBJECT);
        vm.jeq("_valueToStr_as_object");
        // Unknown heap type, treat as raw number
        vm.jmp("_valueToStr_check_raw_number");

        vm.label("_valueToStr_check_raw_number");
        // Could be raw float or raw integer - convert to string
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_numberToString");
        // Return data segment string pointer directly
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // ========== Create heap string from data segment string ==========
        vm.label("_valueToStr_data_str_create_heap");
        // A0 = data segment string pointer
        // Create heap string from it
        vm.mov(VReg.S1, VReg.A0); // S1 = data string pointer
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = string length
        // Allocate: header(16) + length + 1
        vm.addImm(VReg.A0, VReg.S2, 17);
        vm.call("_alloc");
        vm.mov(VReg.A0, VReg.RET); // A0 = user pointer = block + 16
        // Write header
        vm.subImm(VReg.V0, VReg.A0, 16); // V0 = block pointer
        this.writeStringHeader(VReg.V0, VReg.S2);
        // Copy content
        vm.mov(VReg.A0, VReg.A0); // dest = content pointer
        vm.mov(VReg.A1, VReg.S1); // src = data string
        vm.call("_strcpy");
        // Return NaN-boxed heap string
        vm.mov(VReg.RET, VReg.A0); // RET = content pointer
        vm.movImm64(VReg.V1, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // ========== Heap object handlers ==========
        vm.label("_valueToStr_as_heap_string");
        // Heap string: S0 is block pointer, add 16 to get content
        vm.addImm(VReg.RET, VReg.S0, 16);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_valueToStr_as_array");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_array_to_string");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_valueToStr_as_object");
        vm.lea(VReg.A0, "_str_object");
        vm.call("_valueToStr_data_str_create_heap");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_valueToStr_as_number_obj");
        vm.load(VReg.A0, VReg.S0, 8); // Load float bits
        vm.call("_numberToString");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_valueToStr_as_data_str");
        // Data segment string: create heap string
        // S0 = data segment pointer
        vm.mov(VReg.S1, VReg.S0); // S1 = original pointer
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = length
        vm.addImm(VReg.A0, VReg.S2, 17);
        vm.call("_alloc");
        vm.mov(VReg.A0, VReg.RET); // A0 = user pointer
        vm.subImm(VReg.V0, VReg.A0, 16); // V0 = block
        this.writeStringHeader(VReg.V0, VReg.S2);
        // Copy content
        vm.mov(VReg.A0, VReg.A0); // dest content ptr
        vm.mov(VReg.A1, VReg.S1); // src
        vm.call("_strcpy");
        // Return NaN-boxed
        vm.mov(VReg.RET, VReg.A0);
        vm.movImm64(VReg.V1, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _numberToString(v) -> str
    // Converts a number (JSValue or raw bits) to string
    generateNumberToString() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_numberToString");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // S0 = number value (could be JSValue or raw bits)

        // Check if JSValue (high 16 bits >= 0x7FF8)
        vm.shrImm(VReg.V1, VReg.S0, 48);
        vm.movImm(VReg.V0, 0x7FF8);
        vm.cmp(VReg.V1, VReg.V0);
        vm.jlt("_numberToString_raw"); // Not JSValue

        // JSValue - extract tag
        vm.subImm(VReg.V1, VReg.V1, 0x7FF8); // V1 = tag
        vm.cmpImm(VReg.V1, 0);
        vm.jne("_numberToString_js_number_obj"); // Not int32

        // Int32: extract low 32 bits
        vm.movImm64(VReg.V0, 0xFFFFFFFFn);
        vm.and(VReg.A0, VReg.S0, VReg.V0);
        vm.call("_intToStr");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        vm.label("_numberToString_js_number_obj");
        // Could be Number object or other - treat as float
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_floatToString");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        vm.label("_numberToString_raw");
        // Raw number (could be float bits or integer)
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_floatToString");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    // _floatToString(v) -> str
    // Converts float to string with proper decimal handling
    generateFloatToString() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_floatToString");
        vm.prologue(192, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // S0 = float value (as IEEE 754 bits)
        vm.fmovToFloat(0, VReg.S0); // D0 = float

        // Check for NaN: exponent = 0x7FF, mantissa != 0
        vm.mov(VReg.S1, VReg.S0);
        vm.shrImm(VReg.S1, VReg.S1, 52);
        vm.andImm(VReg.S1, VReg.S1, 0x7ff);
        vm.cmpImm(VReg.S1, 0x7ff);
        const notNaNLabel = "_floatToString_not_nan";
        vm.jne(notNaNLabel);

        // NaN path - return "NaN"
        vm.lea(VReg.A0, "_str_nan");
        vm.call("_getStrContent");
        vm.movImm64(VReg.V1, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 192);

        vm.label(notNaNLabel);

        // Check for Infinity: exponent = 0x7FF AND mantissa = 0
        // First check exponent (must be 0x7FF)
        vm.mov(VReg.S1, VReg.S0);
        vm.shrImm(VReg.S1, VReg.S1, 52);
        vm.andImm(VReg.S1, VReg.S1, 0x7ff);
        vm.cmpImm(VReg.S1, 0x7ff);
        const notInfLabel = "_floatToString_not_inf";
        vm.jne(notInfLabel);

        // Exponent is 0x7FF, now check mantissa is 0
        vm.movImm64(VReg.V0, 0x000FFFFFFFFFFFFFn);
        vm.and(VReg.S1, VReg.S0, VReg.V0);
        vm.cmpImm(VReg.S1, 0);
        vm.jne(notInfLabel);

        // Infinity path - check sign
        vm.shrImm(VReg.S1, VReg.S0, 63);
        vm.cmpImm(VReg.S1, 1);
        const negInfLabel = "_floatToString_neg_inf";
        const posInfLabel = "_floatToString_pos_inf";
        vm.jeq(negInfLabel);

        // Positive Infinity
        vm.lea(VReg.A0, "_str_infinity");
        vm.call("_getStrContent");
        vm.movImm64(VReg.V1, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 192);

        // Negative Infinity
        vm.label(negInfLabel);
        vm.movImm(VReg.A0, 10);
        vm.call("_alloc");
        vm.subImm(VReg.S3, VReg.RET, 16);
        this.writeStringHeader(VReg.S3, VReg.S1);
        vm.movImm(VReg.V0, 9);
        vm.store(VReg.S3, 8, VReg.V0);
        vm.addImm(VReg.S4, VReg.S3, 16);
        vm.movImm(VReg.V0, 45);
        vm.storeByte(VReg.S4, 0, VReg.V0);
        vm.lea(VReg.V1, "_str_infinity");
        vm.mov(VReg.A0, VReg.S4);
        vm.addImm(VReg.A1, VReg.S4, 1);
        vm.call("_strcpy");
        vm.mov(VReg.RET, VReg.S4);
        vm.movImm64(VReg.V1, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 192);

        vm.label(notInfLabel);

        // Handle negative numbers - check sign bit directly
        vm.movImm(VReg.S1, 0); // S1 = isNegative flag
        // Sign bit is bit 63 of the original bits in S0
        vm.shrImm(VReg.S1, VReg.S0, 63); // S1 = sign bit (0 = positive, 1 = negative)
        const notNegLabel = "_floatToString_not_neg";
        vm.cmpImm(VReg.S1, 0);
        vm.jeq(notNegLabel);

        // Negative number
        vm.movImm(VReg.S1, 1);
        vm.fabs(0, 0);

        vm.label(notNegLabel);

        // Check if integer: compare D0 with trunc(D0)
        vm.ftrunc(1, 0);
        vm.fcmp(0, 1);
        const isIntLabel = "_floatToString_is_int";
        const isDecLabel = "_floatToString_is_decimal";
        vm.jeq(isIntLabel);

        // ========== Decimal number ==========
        vm.label(isDecLabel);

        // Handle negative sign FIRST
        // S1 = 1 if negative (set earlier)
        vm.cmpImm(VReg.S1, 0);
        const decimalNegLabel = "_floatToString_neg_decimal";
        const decimalAfterSignLabel = "_floatToString_decimal_after_sign";
        vm.jne(decimalNegLabel);

        vm.label(decimalAfterSignLabel);

        // Allocate result buffer (80 bytes)
        vm.movImm(VReg.A0, 80);
        vm.call("_alloc");
        vm.subImm(VReg.S3, VReg.RET, 16); // S3 = block pointer
        this.writeStringHeader(VReg.S3, VReg.S4);
        vm.addImm(VReg.S4, VReg.S3, 16); // S4 = content position
        vm.mov(VReg.S2, VReg.S4); // S2 = start of content
        vm.mov(VReg.S5, VReg.S4); // S5 = working write position

        // Integer part: D0 is positive at this point (fabs was applied)
        vm.fcvtzs(VReg.A0, 0); // A0 = integer part
        // Write integer digits - handle up to 3 digits for simplicity
        // Save A0 to V0 for reuse
        vm.mov(VReg.V0, VReg.A0);

        // Check if >= 100 (3 digits)
        vm.movImm(VReg.V1, 100);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jlt("_floatToString_int_2digits"); // if < 100, jump to 2 digits

        // 3 digits: 100-999
        // hundreds = V0 / 100
        vm.div(VReg.V1, VReg.V0, VReg.V1); // V1 = hundreds digit
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // tens = (V0 % 100) / 10
        vm.movImm(VReg.V1, 100);
        vm.mod(VReg.V1, VReg.V0, VReg.V1); // V1 = V0 % 100
        vm.movImm(VReg.V2, 10);
        vm.div(VReg.V1, VReg.V1, VReg.V2); // V1 = tens digit
        vm.addImm(VReg.V1, VReg.V1, 48);
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // units = V0 % 10
        vm.mod(VReg.V1, VReg.V0, VReg.V2); // V1 = units
        vm.addImm(VReg.V1, VReg.V1, 48);
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp("_floatToString_int_done");

        vm.label("_floatToString_int_2digits");
        // Check if >= 10 (2 digits)
        vm.cmpImm(VReg.V0, 10);
        vm.jlt("_floatToString_int_1digit"); // if < 10, jump to 1 digit

        // 2 digits: 10-99
        // tens = V0 / 10
        vm.movImm(VReg.V2, 10); // V2 = 10
        vm.div(VReg.V1, VReg.V0, VReg.V2); // V1 = tens digit
        vm.addImm(VReg.V1, VReg.V1, 48);
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // units = V0 % 10
        vm.mod(VReg.V1, VReg.V0, VReg.V2); // V1 = V0 % 10
        vm.addImm(VReg.V1, VReg.V1, 48); // V1 = V0 % 10
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp("_floatToString_int_done");

        vm.label("_floatToString_int_1digit");
        // 1 digit: 0-9
        vm.addImm(VReg.V1, VReg.V0, 48);
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        vm.label("_floatToString_int_done");

        // Write '.'
        vm.movImm(VReg.A0, 46);
        vm.storeByte(VReg.S5, 0, VReg.A0);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Save position after '.' as start of fractional digits
        vm.mov(VReg.V2, VReg.S5); // V2 = position after '.'

        // Fractional part: multiply by 1000000 and extract digits
        vm.fsub(0, 0, 1); // D0 = fractional part (e.g., 0.5)
        vm.movImm(VReg.A0, 1000000);
        vm.scvtf(1, VReg.A0);
        vm.fmul(0, 0, 1); // D0 = 0.5 * 1000000 = 500000
        vm.fcvtzs(VReg.A0, 0); // A0 = 500000 as integer

        // Save A0 for computing fractional digits
        vm.mov(VReg.V2, VReg.A0); // V2 = original fractional value

        // Pre-load divisor 10 for modulo
        vm.movImm(VReg.V0, 10); // V0 = 10

        // Write 6 fractional digits (500000 -> "500000")
        // Digit 1: 500000 / 100000 = 5
        vm.movImm(VReg.V1, 100000);
        vm.div(VReg.V1, VReg.V2, VReg.V1); // V1 = 5
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '5'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Digit 2: (500000 / 10000) % 10 = 0
        vm.movImm(VReg.V1, 10000);
        vm.div(VReg.V1, VReg.V2, VReg.V1); // V1 = 50
        vm.mod(VReg.V1, VReg.V1, VReg.V0); // V1 = 0
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '0'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Digit 3: (500000 / 1000) % 10 = 0
        vm.movImm(VReg.V1, 1000);
        vm.div(VReg.V1, VReg.V2, VReg.V1); // V1 = 500
        vm.mod(VReg.V1, VReg.V1, VReg.V0); // V1 = 0
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '0'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Digit 4: (500000 / 100) % 10 = 0
        vm.movImm(VReg.V1, 100);
        vm.div(VReg.V1, VReg.V2, VReg.V1); // V1 = 5000
        vm.mod(VReg.V1, VReg.V1, VReg.V0); // V1 = 0
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '0'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Digit 5: (500000 / 10) % 10 = 0
        vm.mov(VReg.V1, VReg.V2);
        vm.div(VReg.V1, VReg.V1, VReg.V0); // V1 = 50000
        vm.mod(VReg.V1, VReg.V1, VReg.V0); // V1 = 0
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '0'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Digit 6: 500000 % 10 = 0
        vm.mod(VReg.V1, VReg.V2, VReg.V0); // V1 = 0
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '0'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Trim trailing zeros: back up from S5 until we find non-zero digit
        // S5 now points past digit 6, so start checking from digit 6
        vm.mov(VReg.S4, VReg.S5); // S4 = current check position

        const trimLoop = "_floatToString_trim_loop";
        const trimDone = "_floatToString_trim_done";
        vm.label(trimLoop);
        vm.subImm(VReg.S4, VReg.S4, 1); // Move back one position
        vm.loadByte(VReg.V1, VReg.S4, 0); // Load byte at S4
        vm.cmpImm(VReg.V1, 48); // Compare with '0'
        vm.jeq(trimLoop); // If '0', keep backing up
        // Found non-zero or reached '.'
        vm.addImm(VReg.S5, VReg.S4, 1); // S5 = position after last non-zero digit

        vm.label(trimDone);

        // Null terminate
        vm.movImm(VReg.A0, 0);
        vm.storeByte(VReg.S5, 0, VReg.A0);

        // Store length
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_strlen");
        vm.store(VReg.S3, 8, VReg.RET);

        // Return NaN-boxed string
        vm.mov(VReg.RET, VReg.S2);
        vm.movImm64(VReg.V1, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 192);

        // Negative decimal: write '-' first, then use positive path for rest
        vm.label("_floatToString_neg_decimal");

        // Allocate buffer first (same as positive path)
        vm.movImm(VReg.A0, 80);
        vm.call("_alloc");
        vm.subImm(VReg.S3, VReg.RET, 16); // S3 = block pointer
        this.writeStringHeader(VReg.S3, VReg.S4);
        vm.addImm(VReg.S4, VReg.S3, 16); // S4 = content position
        vm.mov(VReg.S2, VReg.S4); // S2 = start of content
        vm.mov(VReg.S5, VReg.S4); // S5 = working write position

        // Write '-' first
        vm.movImm(VReg.A0, 45);
        vm.storeByte(VReg.S5, 0, VReg.A0);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // D0 has absolute value (e.g., 1.5)
        // Extract integer part: fcvtzs reads D0, writes to A0
        vm.fcvtzs(VReg.A0, 0); // A0 = trunc(D0) = integer part (e.g., 1)
        // Save A0 (integer) to S0 before any GP register reuse
        vm.mov(VReg.S0, VReg.A0); // S0 = integer value

        // Write integer digits
        vm.mov(VReg.V0, VReg.S0); // V0 = integer value (saved in S0)

        // Check if >= 100 (3 digits)
        vm.movImm(VReg.V1, 100);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jlt("_floatToString_neg_int_2digits"); // if < 100, jump to 2 digits

        // 3 digits: 100-999
        vm.movImm(VReg.V1, 100);
        vm.div(VReg.V1, VReg.V0, VReg.V1); // V1 = hundreds digit
        vm.addImm(VReg.V1, VReg.V1, 48);
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // tens = (V0 % 100) / 10
        vm.movImm(VReg.V1, 100);
        vm.mod(VReg.V1, VReg.V0, VReg.V1); // V1 = V0 % 100
        vm.movImm(VReg.V2, 10);
        vm.div(VReg.V1, VReg.V1, VReg.V2); // V1 = tens digit
        vm.addImm(VReg.V1, VReg.V1, 48);
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // units = V0 % 10
        vm.mod(VReg.V1, VReg.V0, VReg.V2); // V1 = units
        vm.addImm(VReg.V1, VReg.V1, 48);
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp("_floatToString_neg_int_done");

        vm.label("_floatToString_neg_int_2digits");
        // Check if >= 10 (2 digits)
        vm.cmpImm(VReg.V0, 10);
        vm.jlt("_floatToString_neg_int_1digit"); // if < 10, jump to 1 digit

        // 2 digits: 10-99
        vm.movImm(VReg.V2, 10);
        vm.div(VReg.V1, VReg.V0, VReg.V2); // V1 = tens digit
        vm.addImm(VReg.V1, VReg.V1, 48);
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // units = V0 % 10
        vm.mod(VReg.V1, VReg.V0, VReg.V2); // V1 = units
        vm.addImm(VReg.V1, VReg.V1, 48);
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp("_floatToString_neg_int_done");

        vm.label("_floatToString_neg_int_1digit");
        // 1 digit: 0-9
        vm.addImm(VReg.V1, VReg.V0, 48);
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        vm.label("_floatToString_neg_int_done");

        // D0 still has absolute value after fcvtzs - jump to fractional code
        vm.jmp("_floatToString_neg_fractional_do");

        // ========== Negative fractional path ==========
        vm.label("_floatToString_neg_fractional_do");

        // Write '.' (EXACTLY same as positive path)
        vm.movImm(VReg.A0, 46);
        vm.storeByte(VReg.S5, 0, VReg.A0);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Save position after '.' as start of fractional digits
        vm.mov(VReg.V2, VReg.S5); // V2 = position after '.'

        // Fractional part: multiply by 1000000 and extract digits (SAME as positive)
        vm.fsub(0, 0, 1); // D0 = fractional part (e.g., 0.5)
        vm.movImm(VReg.A0, 1000000);
        vm.scvtf(1, VReg.A0);
        vm.fmul(0, 0, 1); // D0 = 0.5 * 1000000 = 500000
        vm.fcvtzs(VReg.A0, 0); // A0 = 500000 as integer

        // Save A0 for computing fractional digits
        vm.mov(VReg.V2, VReg.A0); // V2 = fractional value (like positive path)

        // Pre-load divisor 10 for modulo
        vm.movImm(VReg.V0, 10); // V0 = 10

        // Write 6 fractional digits (500000 -> "500000") (SAME as positive)
        // Digit 1: 500000 / 100000 = 5
        vm.movImm(VReg.V1, 100000);
        vm.div(VReg.V1, VReg.V2, VReg.V1); // V1 = 5
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '5'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Digit 2: (500000 / 10000) % 10 = 0
        vm.movImm(VReg.V1, 10000);
        vm.div(VReg.V1, VReg.V2, VReg.V1); // V1 = 50
        vm.mod(VReg.V1, VReg.V1, VReg.V0); // V1 = 0
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '0'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Digit 3: (500000 / 1000) % 10 = 0
        vm.movImm(VReg.V1, 1000);
        vm.div(VReg.V1, VReg.V2, VReg.V1); // V1 = 500
        vm.mod(VReg.V1, VReg.V1, VReg.V0); // V1 = 0
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '0'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Digit 4: (500000 / 100) % 10 = 0
        vm.movImm(VReg.V1, 100);
        vm.div(VReg.V1, VReg.V2, VReg.V1); // V1 = 5000
        vm.mod(VReg.V1, VReg.V1, VReg.V0); // V1 = 0
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '0'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Digit 5: (500000 / 10) % 10 = 0
        vm.mov(VReg.V1, VReg.V2);
        vm.div(VReg.V1, VReg.V1, VReg.V0); // V1 = 50000
        vm.mod(VReg.V1, VReg.V1, VReg.V0); // V1 = 0
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '0'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Digit 6: 500000 % 10 = 0
        vm.mod(VReg.V1, VReg.V2, VReg.V0); // V1 = 0
        vm.addImm(VReg.V1, VReg.V1, 48); // ASCII '0'
        vm.storeByte(VReg.S5, 0, VReg.V1);
        vm.addImm(VReg.S5, VReg.S5, 1);

        // Trim trailing zeros: back up from S5 until we find non-zero digit (SAME as positive)
        vm.mov(VReg.S4, VReg.S5); // S4 = current check position

        const trimLoopNeg = "_floatToString_trim_loop_neg";
        const trimDoneNeg = "_floatToString_trim_done_neg";
        vm.label(trimLoopNeg);
        vm.subImm(VReg.S4, VReg.S4, 1); // Move back one position
        vm.loadByte(VReg.V1, VReg.S4, 0); // Load byte at S4
        vm.cmpImm(VReg.V1, 48); // Compare with '0'
        vm.jeq(trimLoopNeg); // If '0', keep backing up
        // Found non-zero or reached '.'
        vm.addImm(VReg.S5, VReg.S4, 1); // S5 = position after last non-zero digit

        vm.label(trimDoneNeg);

        // Null terminate
        vm.movImm(VReg.A0, 0);
        vm.storeByte(VReg.S5, 0, VReg.A0);

        // Store length
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_strlen");
        vm.store(VReg.S3, 8, VReg.RET);

        // Return NaN-boxed string
        vm.mov(VReg.RET, VReg.S2);
        vm.movImm64(VReg.V1, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 192);

        // ========== Integer number ==========
        vm.label(isIntLabel);
        vm.fcvtzs(VReg.A0, 0);
        vm.cmpImm(VReg.S1, 0);
        const noMinusIntLabel = "_floatToString_no_minus_int";
        vm.jeq(noMinusIntLabel);
        vm.neg(VReg.A0, VReg.A0);
        vm.label(noMinusIntLabel);
        vm.call("_intToStr");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 192);
    }

    // 字符串转大写
    // _str_toUpperCase(str) -> 新字符串（带类型标记）
    generateToUpperCase() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_toUpperCase");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 源字符串（可能是 NaN-boxed）

        // 尝试 unbox：如果是 NaN-boxed 字符串，取出低位作为原始指针
        // TAG_STRING_BASE = 0x7FFC000000000000
        // 如果 (S0 & 0xFFFF000000000000) == 0x7FFC000000000000，说明是 NaN-boxed
        vm.movImm64(VReg.V0, 0x7FFC000000000000n);
        vm.and(VReg.V1, VReg.S0, VReg.V0);
        vm.cmp(VReg.V1, VReg.V0);
        vm.jne("_toUpperCase_no_unbox");
        // 是 NaN-boxed，unbox
        vm.movImm64(VReg.V0, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.S0, VReg.S0, VReg.V0);
        vm.label("_toUpperCase_no_unbox");

        // S0 现在是原始字符串指针
        // 计算长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // S1 = 长度

        // 分配新字符串（16 字节头 + len + 1）
        // _alloc 返回用户数据指针 (block + 16)，需要减回头部
        vm.addImm(VReg.A0, VReg.S1, 17);
        vm.call("_alloc");
        vm.subImm(VReg.S2, VReg.RET, 16); // S2 = block 指针

        // 写 header
        this.writeStringHeader(VReg.S2, VReg.S1);

        // S3 = 字符串内容起始位置（block + 16）
        vm.addImm(VReg.S3, VReg.S2, 16);

        // 简单复制：先复制原字符串到新位置
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_strcpy");

        // 然后就地转换为大写
        const loopLabel = "_toUpperCase_loop2";
        const doneLabel = "_toUpperCase_done2";
        const notLowerLabel = "_toUpperCase_not_lower2";

        vm.movImm(VReg.V1, 0); // V1 = index

        vm.label(loopLabel);
        vm.cmp(VReg.V1, VReg.S1);
        vm.jge(doneLabel);

        // 计算当前位置
        vm.add(VReg.V2, VReg.S3, VReg.V1);

        // 加载字符
        vm.loadByte(VReg.V3, VReg.V2, 0);

        // 检查是否是小写字母 (a-z: 97-122)
        vm.cmpImm(VReg.V3, 97);
        vm.jlt(notLowerLabel);
        vm.cmpImm(VReg.V3, 122);
        vm.jgt(notLowerLabel);

        // 转大写: -32
        vm.subImm(VReg.V3, VReg.V3, 32);
        // 写回
        vm.storeByte(VReg.V2, 0, VReg.V3);

        vm.label(notLowerLabel);
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        // 转换为 NaN-boxed JS 字符串
        // 注意：需要返回 content 指针 (block + 16)
        vm.addImm(VReg.RET, VReg.S2, 16); // RET = content 指针 = block + 16
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn); // V1 = PAYLOAD_MASK
        vm.and(VReg.RET, VReg.RET, VReg.V1); // RET = RET & MASK
        vm.movImm64(VReg.V1, 0x7ffc000000000000n); // V1 = TAG_STRING_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V1); // RET = RET | TAG
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
    }

    // 字符串转小写
    // _str_toLowerCase(str) -> 新字符串（带类型标记）
    generateToLowerCase() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_toLowerCase");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 源字符串（可能是 NaN-boxed）

        // 尝试 unbox：如果是 NaN-boxed 字符串，取出低位作为原始指针
        vm.movImm64(VReg.V0, 0x7FFC000000000000n);
        vm.and(VReg.V1, VReg.S0, VReg.V0);
        vm.cmp(VReg.V1, VReg.V0);
        vm.jne("_toLowerCase_no_unbox");
        // 是 NaN-boxed，unbox
        vm.movImm64(VReg.V0, 0x0000FFFFFFFFFFFFn);
        vm.and(VReg.S0, VReg.S0, VReg.V0);
        vm.label("_toLowerCase_no_unbox");

        // S0 现在是原始字符串指针
        // 计算长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // S1 = 长度

        // 分配 len + 16 + 1 字节
        // _alloc 返回用户数据指针 (block + 16)，需要减回头部
        vm.addImm(VReg.A0, VReg.S1, 17);
        vm.call("_alloc");
        vm.subImm(VReg.S2, VReg.RET, 16); // S2 = block 指针

        // 写入类型标记和 length
        this.writeStringHeader(VReg.S2, VReg.S1);

        // S3 = 内容起始（block + 16）
        vm.addImm(VReg.S3, VReg.S2, 16);

        // 循环转换每个字符
        const loopLabel = "_toLowerCase_loop";
        const doneLabel = "_toLowerCase_done";
        const notUpperLabel = "_toLowerCase_not_upper";

        vm.movImm(VReg.V1, 0); // V1 = index

        vm.label(loopLabel);
        vm.cmp(VReg.V1, VReg.S1);
        vm.jge(doneLabel);

        // 加载字符
        vm.add(VReg.V2, VReg.S0, VReg.V1);
        vm.loadByte(VReg.V3, VReg.V2, 0);

        // 检查是否是大写字母 (A-Z: 65-90)
        vm.cmpImm(VReg.V3, 65);
        vm.jlt(notUpperLabel);
        vm.cmpImm(VReg.V3, 90);
        vm.jgt(notUpperLabel);

        // 转小写: +32
        vm.addImm(VReg.V3, VReg.V3, 32);

        vm.label(notUpperLabel);
        // 存储到目标位置
        vm.add(VReg.V2, VReg.S3, VReg.V1);
        vm.storeByte(VReg.V2, 0, VReg.V3);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp(loopLabel);

        vm.label(doneLabel);
        // 写入结尾 null
        vm.add(VReg.V2, VReg.S3, VReg.S1);
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.V2, 0, VReg.V0);

        // 转换为 NaN-boxed JS 字符串
        // 注意：需要返回 content 指针 (block + 16)
        vm.addImm(VReg.RET, VReg.S2, 16); // RET = content 指针 = block + 16
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn); // V1 = PAYLOAD_MASK
        vm.and(VReg.RET, VReg.RET, VReg.V1); // RET = RET & MASK
        vm.movImm64(VReg.V1, 0x7ffc000000000000n); // V1 = TAG_STRING_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V1); // RET = RET | TAG
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 128);
    }

    // 获取指定位置的字符
    // _str_charAt(str, index) -> 单字符字符串
    generateCharAt() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_charAt");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 原始字符串指针
        vm.mov(VReg.S1, VReg.A1); // S1 = index

        // 获取字符串内容指针
        vm.call("_getStrContent");
        vm.mov(VReg.S2, VReg.RET); // S2 = 内容指针

        // 分配 32 字节（16 字节头部 + 1 字符 + 1 null + 14 padding）
        // _alloc 返回用户数据指针 (block + 16)，需要减回头部
        vm.movImm(VReg.A0, 32);
        vm.call("_alloc");
        vm.subImm(VReg.V0, VReg.RET, 16); // V0 = block 指针

        // 写入类型标记: offset 0
        vm.movImm(VReg.V1, TYPE_STRING);
        vm.store(VReg.V0, 0, VReg.V1);
        // 写入长度: offset 8
        vm.movImm(VReg.V1, 1);
        vm.store(VReg.V0, 8, VReg.V1);

        // 获取字符 (内容指针 + index)
        vm.add(VReg.V2, VReg.S2, VReg.S1);
        vm.loadByte(VReg.V3, VReg.V2, 0);

        // 写入字符到 block+16 位置（内容区域开始）
        vm.storeByte(VReg.V0, 16, VReg.V3);
        // 写入 null 终止符
        vm.movImm(VReg.V3, 0);
        vm.storeByte(VReg.V0, 17, VReg.V3);

        // 转换为 NaN-boxed JS 字符串
        // 注意：content pointer = block + 16 = V0 + 16
        // _print_value_string_ptr 会直接使用这个指针
        vm.addImm(VReg.RET, VReg.V0, 16); // RET = content pointer (block + 16)
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn); // V1 = PAYLOAD_MASK
        vm.and(VReg.RET, VReg.RET, VReg.V1); // RET = RET & MASK (clear upper bits)
        vm.movImm64(VReg.V1, 0x7ffc000000000000n); // V1 = TAG_STRING_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V1); // RET = RET | TAG (NaN-boxed)
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 64);
    }

    // 获取指定位置的字符编码
    // _str_charCodeAt(str, index) -> 整数 (0-255)
    generateCharCodeAt() {
        const vm = this.vm;

        vm.label("_str_charCodeAt");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A1); // S0 = index

        // A0 已经是字符串指针，获取内容指针
        vm.call("_getStrContent");
        // RET = 内容指针

        // 计算字符位置
        vm.add(VReg.V0, VReg.RET, VReg.S0);
        vm.loadByte(VReg.RET, VReg.V0, 0);
        // RET = 字符编码 (0-255)
        // 转换为 NaN-boxed JS Integer (TAG_INT32 = 0xfff9)
        vm.movImm64(VReg.V1, 0xfff9000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);

        vm.epilogue([VReg.S0], 0);
    }

    // 去除首尾空白
    // _str_trim(str) -> 新字符串
    generateTrim() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_trim");
        // 使用 6 个保存寄存器: S0=str, S1=len, S2=start, S3=end/newLen后为result, S4=newLen, S5=index
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 源字符串

        // 计算长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // S1 = 原始长度

        // 获取内容指针
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_getStrContent");
        vm.mov(VReg.S0, VReg.RET); // S0 = content

        // 找到开始位置（跳过前导空白）
        vm.movImm(VReg.S2, 0); // S2 = start
        const skipStartLabel = "_trim_skip_start";
        const startDoneLabel = "_trim_start_done";
        vm.label(skipStartLabel);
        vm.cmp(VReg.S2, VReg.S1);
        vm.jge(startDoneLabel);
        vm.add(VReg.V0, VReg.S0, VReg.S2);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        // 检查是否是空白字符（空格、制表符、换行）
        vm.cmpImm(VReg.V1, 32); // space
        vm.jeq("_trim_skip_inc_start");
        vm.cmpImm(VReg.V1, 9); // tab
        vm.jeq("_trim_skip_inc_start");
        vm.cmpImm(VReg.V1, 10); // newline
        vm.jeq("_trim_skip_inc_start");
        vm.cmpImm(VReg.V1, 13); // carriage return
        vm.jeq("_trim_skip_inc_start");
        vm.jmp(startDoneLabel);
        vm.label("_trim_skip_inc_start");
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(skipStartLabel);
        vm.label(startDoneLabel);

        // 找到结束位置（跳过尾部空白）
        vm.mov(VReg.S3, VReg.S1); // S3 = end (临时用)
        const skipEndLabel = "_trim_skip_end";
        const endDoneLabel = "_trim_end_done";
        vm.label(skipEndLabel);
        vm.cmp(VReg.S3, VReg.S2);
        vm.jle(endDoneLabel);
        vm.subImm(VReg.V0, VReg.S3, 1);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 32);
        vm.jeq("_trim_skip_dec_end");
        vm.cmpImm(VReg.V1, 9);
        vm.jeq("_trim_skip_dec_end");
        vm.cmpImm(VReg.V1, 10);
        vm.jeq("_trim_skip_dec_end");
        vm.cmpImm(VReg.V1, 13);
        vm.jeq("_trim_skip_dec_end");
        vm.jmp(endDoneLabel);
        vm.label("_trim_skip_dec_end");
        vm.subImm(VReg.S3, VReg.S3, 1);
        vm.jmp(skipEndLabel);
        vm.label(endDoneLabel);

        // 计算新长度，保存到 S4
        vm.sub(VReg.S4, VReg.S3, VReg.S2); // S4 = newLen

        // 分配新字符串 (16 字节头 + len + 1)
        vm.addImm(VReg.A0, VReg.S4, 17);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET); // S3 = user_ptr (alloc returns block+16)

        // 写入类型标记和 length 到 block header (user_ptr - 16)
        vm.subImm(VReg.V0, VReg.S3, 16); // V0 = block pointer
        this.writeStringHeader(VReg.V0, VReg.S4);

        // 手动复制指定长度的字符 (直接写到 user_ptr)
        const copyLoop = "_trim_copy";
        const copyDone = "_trim_copy_done";
        vm.movImm(VReg.S5, 0); // S5 = index
        vm.label(copyLoop);
        vm.cmp(VReg.S5, VReg.S4);
        vm.jge(copyDone);

        // 源位置 = str + start + index
        vm.add(VReg.V0, VReg.S0, VReg.S2);
        vm.add(VReg.V0, VReg.V0, VReg.S5);
        vm.loadByte(VReg.V1, VReg.V0, 0);

        // 目标位置 = user_ptr + index
        vm.add(VReg.V0, VReg.S3, VReg.S5);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp(copyLoop);

        vm.label(copyDone);
        // 写入 null 终止符
        vm.add(VReg.V0, VReg.S3, VReg.S4);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        // 返回 NaN-boxed JSValue
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn); // PAYLOAD_MASK
        vm.and(VReg.RET, VReg.S3, VReg.V0);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n); // TAG_STRING_BASE
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    }

    // 字符串切片
    // _str_slice(str, start, end) -> 新字符串
    generateSlice() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_slice");
        // S0=str, S1=start, S2=end/result, S3=len, S4=newLen, S5=index
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // S0 = str (Original JSValue)
        vm.mov(VReg.S1, VReg.A1); // S1 = start (JSValue)
        vm.mov(VReg.S2, VReg.A2); // S2 = end (JSValue)

        // 1. 获取解箱后的内容指针和长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_getStrContent");
        vm.mov(VReg.S0, VReg.RET); // S0 = raw string pointer

        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET); // S3 = len

        // 2. 规范化索引 (S1=start, S2=end)
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_to_int32");
        vm.mov(VReg.S1, VReg.RET);

        // end = (end === undefined) ? len : ToInt32(end)
        vm.movImm64(VReg.V0, 0x7ffb000000000000n); // JS_UNDEFINED
        vm.cmp(VReg.S2, VReg.V0);
        const endIsLen = "_slice_end_is_len_final";
        const calcStart = "_slice_calc_start_final";
        vm.jeq(endIsLen);
        
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_to_int32");
        vm.mov(VReg.S2, VReg.RET);

        vm.jmp(calcStart);

        vm.label(endIsLen);
        vm.mov(VReg.S2, VReg.S3);

        vm.label(calcStart);
        // 处理 start < 0: start = max(len + start, 0)
        vm.cmpImm(VReg.S1, 0);
        const startPos = "_slice_start_pos_final";
        const startOk = "_slice_start_ok_final";
        vm.jge(startPos);
        vm.add(VReg.S1, VReg.S1, VReg.S3);
        vm.cmpImm(VReg.S1, 0);
        vm.jge(startOk);
        vm.movImm(VReg.S1, 0);
        vm.jmp(startOk);
        vm.label(startPos);
        // start = min(start, len)
        vm.cmp(VReg.S1, VReg.S3);
        vm.jle(startOk);
        vm.mov(VReg.S1, VReg.S3);
        vm.label(startOk);

        // 处理 end < 0: end = max(len + end, 0)
        vm.cmpImm(VReg.S2, 0);
        const endPos = "_slice_end_pos_final";
        const endOk = "_slice_end_ok_final";
        vm.jge(endPos);
        vm.add(VReg.S2, VReg.S2, VReg.S3);
        vm.cmpImm(VReg.S2, 0);
        vm.jge(endOk);
        vm.movImm(VReg.S2, 0);
        vm.jmp(endOk);
        vm.label(endPos);
        // end = min(end, len)
        vm.cmp(VReg.S2, VReg.S3);
        vm.jle(endOk);
        vm.mov(VReg.S2, VReg.S3);
        vm.label(endOk);

        // 3. 计算 slice 长度
        const doSlice = "_slice_do_final";
        vm.cmp(VReg.S1, VReg.S2);
        vm.jlt(doSlice);
        
        // 返回空字符串
        vm.lea(VReg.RET, "_str_empty");
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V0);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        vm.label(doSlice);
        vm.sub(VReg.S4, VReg.S2, VReg.S1); // S4 = newLen

        // 4. 分配并复制
        vm.addImm(VReg.A0, VReg.S4, 1);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);

        // 写入堆对象头
        this.writeStringHeader(VReg.S3, VReg.S4);

        // 复制循环
        vm.movImm(VReg.S5, 0); // i = 0
        const loop = "_slice_copy_loop_final";
        const done = "_slice_copy_done_final";
        vm.label(loop);
        vm.cmp(VReg.S5, VReg.S4);
        vm.jge(done);
        
        // load src: S0 + S1 + i
        vm.add(VReg.V0, VReg.S0, VReg.S1);
        vm.add(VReg.V0, VReg.V0, VReg.S5);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        
        // store dst: S3 + i
        vm.add(VReg.V0, VReg.S3, VReg.S5);
        vm.storeByte(VReg.V0, 0, VReg.V1);
        
        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp(loop);

        vm.label(done);
        // Null terminator
        vm.add(VReg.V0, VReg.S3, VReg.S4);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        // 返回装箱后的字符串
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.S3, VReg.V0);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    }

    // _str_substring(str, start, end) -> 新字符串
    generateSubstring() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_str_substring");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // str

        // 获取内容指针
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_getStrContent");
        vm.mov(VReg.S0, VReg.RET); // S0 = raw content

        // 获取字符串长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET); // S3 = len

        // 规范化参数
        vm.mov(VReg.A0, VReg.A1);
        vm.call("_to_int32");
        vm.mov(VReg.S1, VReg.RET); // S1 = start

        vm.movImm64(VReg.V0, 0x7ffb000000000000n); // JS_UNDEFINED
        vm.cmp(VReg.A2, VReg.V0);
        vm.jeq("_substring_end_is_len");
        
        vm.mov(VReg.A0, VReg.A2);
        vm.call("_to_int32");
        vm.mov(VReg.S2, VReg.RET); // S2 = end
        vm.jmp("_substring_calc_start");

        vm.label("_substring_end_is_len");
        vm.mov(VReg.S2, VReg.S3);

        vm.label("_substring_calc_start");
        // 规范化 start: max(0, min(start, len))
        vm.cmpImm(VReg.S1, 0);
        vm.jge("_substring_start_ge0");
        vm.movImm(VReg.S1, 0);
        vm.label("_substring_start_ge0");
        vm.cmp(VReg.S1, VReg.S3);
        vm.jle("_substring_start_ok");
        vm.mov(VReg.S1, VReg.S3);
        vm.label("_substring_start_ok");

        // 规范化 end: max(0, min(end, len))
        vm.cmpImm(VReg.S2, 0);
        vm.jge("_substring_end_ge0");
        vm.movImm(VReg.S2, 0);
        vm.label("_substring_end_ge0");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jle("_substring_end_ok");
        vm.mov(VReg.S2, VReg.S3);
        vm.label("_substring_end_ok");

        // 如果 start > end, 交换它们
        vm.cmp(VReg.S1, VReg.S2);
        vm.jle("_substring_no_swap");
        vm.mov(VReg.V0, VReg.S1);
        vm.mov(VReg.S1, VReg.S2);
        vm.mov(VReg.S2, VReg.V0);
        vm.label("_substring_no_swap");

        // 计算新长度
        vm.sub(VReg.S4, VReg.S2, VReg.S1); // S4 = newLen

        // 如果 newLen == 0, 返回空字符串
        vm.cmpImm(VReg.S4, 0);
        vm.jg("_substring_do");
        vm.lea(VReg.RET, "_str_empty");
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V0);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);

        vm.label("_substring_do");
        // 分配新字符串
        vm.addImm(VReg.A0, VReg.S4, 17);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET); // S3 = user_ptr

        // 设置头
        this.writeStringHeader(VReg.RET, VReg.S2);

        // 复制字符
        vm.movImm(VReg.S5, 0);
        vm.label("_substring_copy");
        vm.cmp(VReg.S5, VReg.S4);
        vm.jge("_substring_done");

        vm.add(VReg.V0, VReg.S0, VReg.S1);
        vm.add(VReg.V0, VReg.V0, VReg.S5);
        vm.loadByte(VReg.V1, VReg.V0, 0);

        vm.add(VReg.V0, VReg.S3, VReg.S5);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp("_substring_copy");

        vm.label("_substring_done");
        vm.add(VReg.V0, VReg.S3, VReg.S4);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        // 返回 JSValue
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.S3, VReg.V0);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);
    }

    // 分割字符串
    // _str_split(str, separator) -> 数组
    generateSplit() {
        const vm = this.vm;
        const TYPE_ARRAY = 4;

        vm.label("_str_split");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // str
        vm.mov(VReg.S1, VReg.A1); // separator

        // 获取长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = len

        // 检查 separator 是否是空字符串
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_split_full");

        // 情况 1: 空字符串分割 -> 每个字符一个元素
        vm.shlImm(VReg.A0, VReg.S2, 3);
        vm.addImm(VReg.A0, VReg.A0, 16);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET); // S3 = array user_ptr

        // 写入数组头
        vm.subImm(VReg.S4, VReg.S3, 16);
        vm.load(VReg.V0, VReg.S4, 0); // V0 = old flags_and_size
        vm.movImm64(VReg.V1, 0xffffffffffffff00n);
        vm.and(VReg.V0, VReg.V0, VReg.V1); // 清除低8位
        vm.movImm(VReg.V1, TYPE_ARRAY);
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        vm.store(VReg.S4, 0, VReg.V0);
        vm.store(VReg.S4, 8, VReg.S2); // length = S2

        // 循环提取每个字符
        vm.movImm(VReg.S5, 0); // index
        vm.label("_split_char_loop");
        vm.cmp(VReg.S5, VReg.S2);
        vm.jge("_split_char_done");

        // charAt(S5)
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S5);
        vm.call("_str_charAt");
        
        // 存储到数组
        vm.shlImm(VReg.V0, VReg.S5, 3);
        vm.add(VReg.V0, VReg.S3, VReg.V0);
        vm.store(VReg.V0, 0, VReg.RET);

        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp("_split_char_loop");

        vm.label("_split_char_done");
        vm.mov(VReg.RET, VReg.S3);
        // Box as Array
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V0);
        vm.movImm64(VReg.V1, 0x7ffd000000000000n); // TAG_ARRAY
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        vm.label("_split_full");
        // 情况 2: 返回包含原字符串的单元素数组
        vm.movImm(VReg.A0, 24); // 16 + 8
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);
        vm.subImm(VReg.S4, VReg.S3, 16);
        vm.load(VReg.V0, VReg.S4, 0); // V0 = old flags_and_size
        vm.movImm64(VReg.V1, 0xffffffffffffff00n);
        vm.and(VReg.V0, VReg.V0, VReg.V1); // 清除低8位
        vm.movImm(VReg.V1, TYPE_ARRAY);
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        vm.store(VReg.S4, 0, VReg.V0);
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S4, 8, VReg.V0); // length = 1
        
        vm.store(VReg.S3, 0, VReg.S0); // element 0 = str
        
        vm.mov(VReg.RET, VReg.S3);
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V0);
        vm.movImm64(VReg.V1, 0x7ffd000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    }

    // _str_indexOf(str, search) -> index
    generateIndexOf() {
        const vm = this.vm;
        vm.label("_str_indexOf");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);
        vm.mov(VReg.S0, VReg.A0); 
        vm.mov(VReg.S1, VReg.A1);

        vm.mov(VReg.A0, VReg.S0);
        vm.call("_getStrContent");
        vm.mov(VReg.S0, VReg.RET);
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_getStrContent");
        vm.mov(VReg.S1, VReg.RET);

        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = len
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.mov(VReg.S3, VReg.RET); // S3 = searchLen

        vm.movImm(VReg.S4, 0); // S4 = index
        const outerLoop = "_indexOf_outer";
        const innerLoop = "_indexOf_inner";
        const found = "_indexOf_found";
        const next = "_indexOf_next";
        const notFound = "_indexOf_notFound";

        vm.label(outerLoop);
        vm.sub(VReg.V0, VReg.S2, VReg.S3);
        vm.cmp(VReg.S4, VReg.V0);
        vm.ja(notFound);

        vm.movImm(VReg.S5, 0); // S5 = matchIndex
        vm.label(innerLoop);
        vm.cmp(VReg.S5, VReg.S3);
        vm.jeq(found);

        vm.add(VReg.V0, VReg.S0, VReg.S4);
        vm.add(VReg.V0, VReg.V0, VReg.S5);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.add(VReg.V0, VReg.S1, VReg.S5);
        vm.loadByte(VReg.V2, VReg.V0, 0);
        vm.cmp(VReg.V1, VReg.V2);
        vm.jne(next);

        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp(innerLoop);

        vm.label(next);
        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp(outerLoop);

        vm.label(found);
        vm.mov(VReg.RET, VReg.S4);
        vm.movImm64(VReg.V0, 0xfff9000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);

        vm.label(notFound);
        vm.movImm(VReg.RET, -1);
        vm.movImm64(VReg.V0, 0xfff9ffffffffffffn);
        vm.and(VReg.RET, VReg.RET, VReg.V0);
        vm.movImm64(VReg.V0, 0xfff9000000000000n);
        vm.or(VReg.RET, VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);
    }

    // _str_includes(str, search) -> boolean
    generateIncludes() {
        const vm = this.vm;
        vm.label("_str_includes");
        vm.prologue(16, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.call("_str_indexOf");
        vm.movImm(VReg.V0, -1);
        vm.movImm64(VReg.V1, 0xfff9000000000000n);
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        vm.cmp(VReg.RET, VReg.V0);
        vm.jeq("_includes_false");
        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 16);
        vm.label("_includes_false");
        vm.lea(VReg.RET, "_js_false");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // _str_startsWith(str, search) -> boolean
    generateStartsWith() {
        const vm = this.vm;
        vm.label("_str_startsWith");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.call("_getStrContent"); vm.mov(VReg.S0, VReg.RET);
        vm.mov(VReg.A0, VReg.S1); vm.call("_getStrContent"); vm.mov(VReg.S1, VReg.RET);
        vm.mov(VReg.A0, VReg.S1); vm.call("_strlen"); vm.mov(VReg.S2, VReg.RET);
        vm.movImm(VReg.V0, 0);
        const loop = "_startsWith_loop";
        vm.label(loop);
        vm.cmp(VReg.V0, VReg.S2);
        vm.jeq("_startsWith_true");
        vm.add(VReg.V1, VReg.S0, VReg.V0); vm.loadByte(VReg.V1, VReg.V1, 0);
        vm.add(VReg.V2, VReg.S1, VReg.V0); vm.loadByte(VReg.V2, VReg.V2, 0);
        vm.cmp(VReg.V1, VReg.V2);
        vm.jne("_startsWith_false");
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp(loop);
        vm.label("_startsWith_true");
        vm.lea(VReg.RET, "_js_true"); vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
        vm.label("_startsWith_false");
        vm.lea(VReg.RET, "_js_false"); vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _str_endsWith(str, search) -> boolean
    generateEndsWith() {
        const vm = this.vm;
        vm.label("_str_endsWith");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);
        vm.mov(VReg.S0, VReg.A0); vm.mov(VReg.S1, VReg.A1);
        vm.call("_getStrContent"); vm.mov(VReg.S0, VReg.RET);
        vm.mov(VReg.A0, VReg.S1); vm.call("_getStrContent"); vm.mov(VReg.S1, VReg.RET);
        vm.mov(VReg.A0, VReg.S0); vm.call("_strlen"); vm.mov(VReg.S2, VReg.RET);
        vm.mov(VReg.A0, VReg.S1); vm.call("_strlen"); vm.mov(VReg.S3, VReg.RET);
        vm.cmp(VReg.S3, VReg.S2); vm.ja("_endsWith_false");
        vm.sub(VReg.S2, VReg.S2, VReg.S3); // Start offset
        vm.movImm(VReg.V0, 0);
        const loop = "_endsWith_loop";
        vm.label(loop);
        vm.cmp(VReg.V0, VReg.S3);
        vm.jeq("_endsWith_true");
        vm.add(VReg.V1, VReg.S0, VReg.S2); vm.add(VReg.V1, VReg.V1, VReg.V0); vm.loadByte(VReg.V1, VReg.V1, 0);
        vm.add(VReg.V2, VReg.S1, VReg.V0); vm.loadByte(VReg.V2, VReg.V2, 0);
        vm.cmp(VReg.V1, VReg.V2);
        vm.jne("_endsWith_false");
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp(loop);
        vm.label("_endsWith_true");
        vm.lea(VReg.RET, "_js_true"); vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
        vm.label("_endsWith_false");
        vm.lea(VReg.RET, "_js_false"); vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _str_lastIndexOf(str, search) -> index
    generateLastIndexOf() {
        const vm = this.vm;
        vm.label("_str_lastIndexOf");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);
        vm.mov(VReg.S0, VReg.A0); vm.mov(VReg.S1, VReg.A1);
        vm.call("_getStrContent"); vm.mov(VReg.S0, VReg.RET);
        vm.mov(VReg.A0, VReg.S1); vm.call("_getStrContent"); vm.mov(VReg.S1, VReg.RET);
        vm.mov(VReg.A0, VReg.S0); vm.call("_strlen"); vm.mov(VReg.S2, VReg.RET);
        vm.mov(VReg.A0, VReg.S1); vm.call("_strlen"); vm.mov(VReg.S3, VReg.RET);
        vm.cmp(VReg.S3, VReg.S2); vm.ja("_lastIndexOf_notFound");
        vm.sub(VReg.S4, VReg.S2, VReg.S3); // Start index (S4)
        const outer = "_lastIndexOf_outer";
        const inner = "_lastIndexOf_inner";
        vm.label(outer);
        vm.cmpImm(VReg.S4, 0); vm.jlt("_lastIndexOf_notFound");
        vm.movImm(VReg.V0, 0); // inner index
        vm.label(inner);
        vm.cmp(VReg.V0, VReg.S3); vm.jeq("_lastIndexOf_found");
        vm.add(VReg.V1, VReg.S0, VReg.S4); vm.add(VReg.V1, VReg.V1, VReg.V0); vm.loadByte(VReg.V1, VReg.V1, 0);
        vm.add(VReg.V2, VReg.S1, VReg.V0); vm.loadByte(VReg.V2, VReg.V2, 0);
        vm.cmp(VReg.V1, VReg.V2); vm.jne("_lastIndexOf_next");
        vm.addImm(VReg.V0, VReg.V0, 1); vm.jmp(inner);
        vm.label("_lastIndexOf_next");
        vm.subImm(VReg.S4, VReg.S4, 1); vm.jmp(outer);
        vm.label("_lastIndexOf_found");
        vm.mov(VReg.RET, VReg.S4);
        vm.movImm64(VReg.V0, 0xfff9000000000000n); vm.or(VReg.RET, VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
        vm.label("_lastIndexOf_notFound");
        vm.movImm(VReg.RET, -1);
        vm.movImm64(VReg.V0, 0xfff9000000000000n); vm.or(VReg.RET, VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    // _str_repeat(str, count) -> str
    generateRepeat() {
        const vm = this.vm;
        vm.label("_str_repeat");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);
        vm.mov(VReg.S0, VReg.A0); vm.mov(VReg.S1, VReg.A1);
        vm.mov(VReg.A0, VReg.S1); vm.call("_to_int32"); vm.mov(VReg.S1, VReg.RET);
        vm.cmpImm(VReg.S1, 0); vm.jle("_repeat_empty");
        vm.mov(VReg.A0, VReg.S0); vm.call("_getStrContent"); vm.mov(VReg.S0, VReg.RET);
        vm.mov(VReg.A0, VReg.S0); vm.call("_strlen"); vm.mov(VReg.S2, VReg.RET);
        vm.mul(VReg.S3, VReg.S2, VReg.S1); // Total len
        vm.addImm(VReg.A0, VReg.S3, 17); vm.call("_alloc"); vm.mov(VReg.S4, VReg.RET);
        vm.subImm(VReg.V0, VReg.S4, 16); vm.movImm(VReg.V1, 6); vm.store(VReg.V0, 0, VReg.V1);
        vm.store(VReg.V0, 8, VReg.S3);
        vm.movImm(VReg.V0, 0); // repeat count
        vm.label("_repeat_outer");
        vm.cmp(VReg.V0, VReg.S1); vm.jeq("_repeat_done");
        vm.movImm(VReg.V1, 0); // char index
        vm.label("_repeat_inner");
        vm.cmp(VReg.V1, VReg.S2); vm.jeq("_repeat_next");
        vm.add(VReg.V2, VReg.S0, VReg.V1); vm.loadByte(VReg.V2, VReg.V2, 0);
        vm.mul(VReg.V3, VReg.V0, VReg.S2); vm.add(VReg.V3, VReg.V3, VReg.V1);
        vm.add(VReg.V3, VReg.S4, VReg.V3); vm.storeByte(VReg.V3, 0, VReg.V2);
        vm.addImm(VReg.V1, VReg.V1, 1); vm.jmp("_repeat_inner");
        vm.label("_repeat_next");
        vm.addImm(VReg.V0, VReg.V0, 1); vm.jmp("_repeat_outer");
        vm.label("_repeat_done");
        vm.add(VReg.V0, VReg.S4, VReg.S3); vm.movImm(VReg.V1, 0); vm.storeByte(VReg.V0, 0, VReg.V1);
        vm.mov(VReg.RET, VReg.S4); vm.movImm64(VReg.V0, 0x0000ffffffffffffn); vm.and(VReg.RET, VReg.RET, VReg.V0);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n); vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
        vm.label("_repeat_empty");
        vm.lea(VReg.RET, "_str_empty"); vm.movImm64(VReg.V0, 0x0000ffffffffffffn); vm.and(VReg.RET, VReg.RET, VReg.V0);
        vm.movImm64(VReg.V1, 0x7ffc000000000000n); vm.or(VReg.RET, VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    // _str_at(str, index) -> str/undefined
    generateAt() {
        const vm = this.vm;
        vm.label("_str_at");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0); vm.mov(VReg.S1, VReg.A1);
        vm.mov(VReg.A0, VReg.S1); vm.call("_to_int32"); vm.mov(VReg.S1, VReg.RET);
        vm.mov(VReg.A0, VReg.S0); vm.call("_strlen"); vm.mov(VReg.S2, VReg.RET);
        vm.cmpImm(VReg.S1, 0); vm.jge("_at_check"); vm.add(VReg.S1, VReg.S1, VReg.S2);
        vm.label("_at_check");
        vm.cmpImm(VReg.S1, 0); vm.jlt("_at_undef"); vm.cmp(VReg.S1, VReg.S2); vm.jge("_at_undef");
        vm.mov(VReg.A0, VReg.S0); vm.mov(VReg.A1, VReg.S1); vm.call("_str_charAt");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
        vm.label("_at_undef");
        vm.movImm64(VReg.RET, 0x7ffb000000000000n);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _str_concat(str1, str2) -> str
    generateConcat() {
        const vm = this.vm;
        vm.label("_str_concat");
        vm.jmp("_strconcat");
    }

    // 生成所有字符串函数
    generate() {
        this.generateStrlen();
        this.generateStrLength(); // 统一 length 访问
        this.generateStrcmp();
        this.generateStrcpy();
        this.generateStrcat();
        this.generateGetStrContent();
        this.generateStrconcat();
        this.generateIntToStr();
        this.generateBoolToStr();
        this.generateToString();
        this.generateValueToStr(); // 智能值转字符串
        this.generateNumberToString(); // 数字转字符串
        this.generateFloatToString(); // 浮点数转字符串
        // 字符串方法
        this.generateToUpperCase();
        this.generateToLowerCase();
        this.generateCharAt();
        this.generateCharCodeAt();
        this.generateTrim();
        this.generateSlice();
        this.generateIndexOf();
        // StringMethodsGenerator methods (includes, startsWith, endsWith, etc.)
        this.generateIncludes();
        this.generateStartsWith();
        this.generateEndsWith();
        this.generateLastIndexOf();
        this.generateRepeat();
        this.generateAt();
        this.generateConcat();
        this.generateSplit();
        // 基础操作 (Moved from base.js)
        this.generateRawStrlen();
        this.generateStrLength();
    }

    // ========== 基础操作 (Moved from base.js) ==========

    // 生成原始字符串长度函数（遍历计算，用于裸字符串指针）
    // _raw_strlen(str) -> length
    generateRawStrlen() {
        const vm = this.vm;
        vm.label("_raw_strlen");
        vm.prologue(0, [VReg.S0, VReg.S1]);
        vm.call("_getStrContent");
        vm.mov(VReg.S0, VReg.RET);
        vm.movImm(VReg.S1, 0);
        const loopLabel = "_raw_strlen_loop";
        const doneLabel = "_raw_strlen_done";
        vm.label(loopLabel);
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq(doneLabel);
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp(loopLabel);
        vm.label(doneLabel);
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // 获取字符串长度 (alias)
    generateStrLength() {
        const vm = this.vm;
        vm.label("_str_length");
        vm.jmp("_strlen");
    }
}
