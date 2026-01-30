// JSBin JSON 运行时
// 提供 JSON.parse 和 JSON.stringify 的运行时实现

import { VReg } from "../../../vm/registers.js";

// 类型常量
const TYPE_NULL = 1;
const TYPE_BOOLEAN = 2;
const TYPE_STRING = 6;
const TYPE_ARRAY = 5;
const TYPE_OBJECT = 7;
const TYPE_NUMBER = 13;

export class JSONGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateJSONStringify();
        this.generateJSONParse();
        this.generateStringifyValue();
        this.generateParseValue();
        this.generateSkipWhitespace();
        this.generateParseString();
        this.generateParseNumber();
        this.generateParseArray();
        this.generateParseObject();
    }

    // JSON.stringify(value) -> 字符串
    generateJSONStringify() {
        const vm = this.vm;

        vm.label("_JSON_stringify");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // value

        // 分配初始缓冲区 (256 字节)
        vm.movImm(VReg.A0, 256);
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET); // buffer

        // 调用递归序列化
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.movImm(VReg.A2, 0); // offset
        vm.call("_json_stringify_value");

        // 添加 null 终止符
        vm.add(VReg.V0, VReg.S1, VReg.RET);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // _json_stringify_value(value, buffer, offset) -> 新 offset
    generateStringifyValue() {
        const vm = this.vm;

        vm.label("_json_stringify_value");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // value
        vm.mov(VReg.S1, VReg.A1); // buffer
        vm.mov(VReg.S2, VReg.A2); // offset

        // 检查 null
        vm.cmpImm(VReg.S0, 0);
        vm.jne("_jsv_not_null");
        // 写入 "null"
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x6c6c756e); // "null" (little endian)
        vm.store(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.RET, VReg.S2, 4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_jsv_not_null");
        // 获取类型
        vm.load(VReg.S3, VReg.S0, 0);
        vm.andImm(VReg.S3, VReg.S3, 0xff);

        // 检查 undefined
        vm.lea(VReg.V0, "_js_undefined");
        vm.cmp(VReg.S0, VReg.V0);
        vm.jne("_jsv_not_undefined");
        // undefined 序列化为 null
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x6c6c756e);
        vm.store(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.RET, VReg.S2, 4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_jsv_not_undefined");
        // 检查 boolean
        vm.lea(VReg.V0, "_js_true");
        vm.cmp(VReg.S0, VReg.V0);
        vm.jne("_jsv_not_true");
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x65757274); // "true"
        vm.store(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.RET, VReg.S2, 4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_jsv_not_true");
        vm.lea(VReg.V0, "_js_false");
        vm.cmp(VReg.S0, VReg.V0);
        vm.jne("_jsv_not_false");
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x736c6166); // "fals"
        vm.store(VReg.V0, 0, VReg.V1);
        vm.movImm(VReg.V1, 0x65); // "e"
        vm.storeByte(VReg.V0, 4, VReg.V1);
        vm.addImm(VReg.RET, VReg.S2, 5);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_jsv_not_false");
        // 检查 Number
        vm.cmpImm(VReg.S3, TYPE_NUMBER);
        vm.jne("_jsv_not_number");
        // 序列化数字
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_valueToStr");
        vm.mov(VReg.S4, VReg.RET); // 数字字符串
        // 复制到 buffer
        vm.add(VReg.A0, VReg.S1, VReg.S2);
        vm.mov(VReg.A1, VReg.S4);
        vm.call("_strcpy");
        // 计算新 offset
        vm.mov(VReg.A0, VReg.S4);
        vm.call("_strlen");
        vm.add(VReg.RET, VReg.S2, VReg.RET);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_jsv_not_number");
        // 检查 String
        vm.cmpImm(VReg.S3, TYPE_STRING);
        vm.jne("_jsv_not_string");
        // 写入引号和字符串内容
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x22); // '"'
        vm.storeByte(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.S2, VReg.S2, 1);
        // 获取字符串内容
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_getStrContent");
        vm.mov(VReg.S4, VReg.RET);
        // 复制
        vm.add(VReg.A0, VReg.S1, VReg.S2);
        vm.mov(VReg.A1, VReg.S4);
        vm.call("_strcpy");
        // 计算长度
        vm.mov(VReg.A0, VReg.S4);
        vm.call("_strlen");
        vm.add(VReg.S2, VReg.S2, VReg.RET);
        // 写入结束引号
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x22);
        vm.storeByte(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.RET, VReg.S2, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_jsv_not_string");
        // 检查 Array
        vm.cmpImm(VReg.S3, TYPE_ARRAY);
        vm.jne("_jsv_not_array");
        // 写入 '['
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x5b); // '['
        vm.storeByte(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.S2, VReg.S2, 1);

        // 获取数组长度
        vm.load(VReg.S3, VReg.S0, 8);
        vm.movImm(VReg.S4, 0); // i

        vm.label("_jsv_array_loop");
        vm.cmp(VReg.S4, VReg.S3);
        vm.jge("_jsv_array_done");

        // 如果不是第一个，写入逗号
        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_jsv_array_no_comma");
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x2c); // ','
        vm.storeByte(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.S2, VReg.S2, 1);

        vm.label("_jsv_array_no_comma");
        // 获取元素
        vm.shlImm(VReg.V0, VReg.S4, 3);
        vm.addImm(VReg.V0, VReg.V0, 24);
        vm.add(VReg.V0, VReg.S0, VReg.V0);
        vm.load(VReg.A0, VReg.V0, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_json_stringify_value");
        vm.mov(VReg.S2, VReg.RET);

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp("_jsv_array_loop");

        vm.label("_jsv_array_done");
        // 写入 ']'
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x5d); // ']'
        vm.storeByte(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.RET, VReg.S2, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_jsv_not_array");
        // 检查 Object
        vm.cmpImm(VReg.S3, TYPE_OBJECT);
        vm.jne("_jsv_default");
        // 写入 '{'
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x7b); // '{'
        vm.storeByte(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.S2, VReg.S2, 1);

        // 简化实现：遍历对象属性
        // TODO: 完整的对象遍历
        // 写入 '}'
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x7d); // '}'
        vm.storeByte(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.RET, VReg.S2, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_jsv_default");
        // 默认：返回 null
        vm.add(VReg.V0, VReg.S1, VReg.S2);
        vm.movImm(VReg.V1, 0x6c6c756e);
        vm.store(VReg.V0, 0, VReg.V1);
        vm.addImm(VReg.RET, VReg.S2, 4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    // JSON.parse(text) -> value
    generateJSONParse() {
        const vm = this.vm;

        vm.label("_JSON_parse");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // text

        // 获取字符串内容
        vm.call("_getStrContent");
        vm.mov(VReg.S1, VReg.RET);

        // 跳过前导空白
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_json_skip_whitespace");
        vm.mov(VReg.S1, VReg.RET);

        // 解析值
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_json_parse_value");

        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // _json_parse_value(text) -> value
    generateParseValue() {
        const vm = this.vm;

        vm.label("_json_parse_value");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 跳过空白
        vm.call("_json_skip_whitespace");
        vm.mov(VReg.S0, VReg.RET);

        // 检查第一个字符
        vm.loadByte(VReg.V0, VReg.S0, 0);

        // null
        vm.cmpImm(VReg.V0, 0x6e); // 'n'
        vm.jne("_jpv_not_null");
        vm.lea(VReg.RET, "_js_null");
        vm.epilogue([VReg.S0], 16);

        vm.label("_jpv_not_null");
        // true
        vm.cmpImm(VReg.V0, 0x74); // 't'
        vm.jne("_jpv_not_true");
        vm.lea(VReg.RET, "_js_true");
        vm.epilogue([VReg.S0], 16);

        vm.label("_jpv_not_true");
        // false
        vm.cmpImm(VReg.V0, 0x66); // 'f'
        vm.jne("_jpv_not_false");
        vm.lea(VReg.RET, "_js_false");
        vm.epilogue([VReg.S0], 16);

        vm.label("_jpv_not_false");
        // string
        vm.cmpImm(VReg.V0, 0x22); // '"'
        vm.jne("_jpv_not_string");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_json_parse_string");
        vm.epilogue([VReg.S0], 16);

        vm.label("_jpv_not_string");
        // array
        vm.cmpImm(VReg.V0, 0x5b); // '['
        vm.jne("_jpv_not_array");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_json_parse_array");
        vm.epilogue([VReg.S0], 16);

        vm.label("_jpv_not_array");
        // object
        vm.cmpImm(VReg.V0, 0x7b); // '{'
        vm.jne("_jpv_not_object");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_json_parse_object");
        vm.epilogue([VReg.S0], 16);

        vm.label("_jpv_not_object");
        // number (数字或负号)
        vm.cmpImm(VReg.V0, 0x2d); // '-'
        vm.jeq("_jpv_number");
        vm.cmpImm(VReg.V0, 0x30); // '0'
        vm.jlt("_jpv_default");
        vm.cmpImm(VReg.V0, 0x39); // '9'
        vm.jgt("_jpv_default");

        vm.label("_jpv_number");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_json_parse_number");
        vm.epilogue([VReg.S0], 16);

        vm.label("_jpv_default");
        // 无法解析，返回 undefined
        vm.lea(VReg.RET, "_js_undefined");
        vm.epilogue([VReg.S0], 16);
    }

    // _json_skip_whitespace(text) -> 跳过空白后的指针
    generateSkipWhitespace() {
        const vm = this.vm;

        vm.label("_json_skip_whitespace");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        vm.label("_jsw_loop");
        vm.loadByte(VReg.V0, VReg.S0, 0);
        // 检查空格、制表符、换行符、回车符
        vm.cmpImm(VReg.V0, 0x20); // ' '
        vm.jeq("_jsw_skip");
        vm.cmpImm(VReg.V0, 0x09); // '\t'
        vm.jeq("_jsw_skip");
        vm.cmpImm(VReg.V0, 0x0a); // '\n'
        vm.jeq("_jsw_skip");
        vm.cmpImm(VReg.V0, 0x0d); // '\r'
        vm.jeq("_jsw_skip");
        vm.jmp("_jsw_done");

        vm.label("_jsw_skip");
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_jsw_loop");

        vm.label("_jsw_done");
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0], 0);
    }

    // _json_parse_string(text) -> 字符串对象
    generateParseString() {
        const vm = this.vm;

        vm.label("_json_parse_string");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0);
        vm.addImm(VReg.S0, VReg.S0, 1); // 跳过开始引号

        // 找到结束引号
        vm.mov(VReg.S1, VReg.S0);
        vm.label("_jps_find_end");
        vm.loadByte(VReg.V0, VReg.S1, 0);
        vm.cmpImm(VReg.V0, 0x22);
        vm.jeq("_jps_found_end");
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_jps_found_end");
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp("_jps_find_end");

        vm.label("_jps_found_end");
        // 计算长度
        vm.sub(VReg.S2, VReg.S1, VReg.S0);

        // 分配字符串
        vm.addImm(VReg.A0, VReg.S2, 17);
        vm.call("_alloc");
        vm.mov(VReg.V1, VReg.RET);

        // 写入头部
        vm.movImm(VReg.V2, TYPE_STRING);
        vm.store(VReg.V1, 0, VReg.V2);
        vm.store(VReg.V1, 8, VReg.S2);

        // 复制内容
        vm.addImm(VReg.A0, VReg.V1, 16);
        vm.mov(VReg.A1, VReg.S0);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_memcpy");

        // null 终止符
        vm.add(VReg.V2, VReg.V1, VReg.S2);
        vm.addImm(VReg.V2, VReg.V2, 16);
        vm.movImm(VReg.V3, 0);
        vm.storeByte(VReg.V2, 0, VReg.V3);

        vm.mov(VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _json_parse_number(text) -> Number 对象
    generateParseNumber() {
        const vm = this.vm;

        vm.label("_json_parse_number");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0);
        vm.movImm(VReg.S1, 0); // 结果
        vm.movImm(VReg.S2, 1); // 符号

        // 检查负号
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 0x2d);
        vm.jne("_jpn_parse");
        vm.movImm(VReg.S2, -1);
        vm.addImm(VReg.S0, VReg.S0, 1);

        vm.label("_jpn_parse");
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 0x30);
        vm.jlt("_jpn_done");
        vm.cmpImm(VReg.V0, 0x39);
        vm.jgt("_jpn_done");

        // result = result * 10 + digit
        vm.movImm(VReg.V1, 10);
        vm.mul(VReg.S1, VReg.S1, VReg.V1);
        vm.subImm(VReg.V0, VReg.V0, 0x30);
        vm.add(VReg.S1, VReg.S1, VReg.V0);
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_jpn_parse");

        vm.label("_jpn_done");
        // 应用符号
        vm.mul(VReg.S1, VReg.S1, VReg.S2);

        // 装箱为 Number
        vm.emit("scvtf", 0, VReg.S1);
        vm.emit("fmov_to_int", VReg.V0, 0);

        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");
        vm.movImm(VReg.V1, TYPE_NUMBER);
        vm.store(VReg.RET, 0, VReg.V1);
        vm.store(VReg.RET, 8, VReg.V0);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _json_parse_array(text) -> Array 对象
    generateParseArray() {
        const vm = this.vm;

        vm.label("_json_parse_array");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0);
        vm.addImm(VReg.S0, VReg.S0, 1); // 跳过 '['

        // 分配初始数组（容量 8）
        vm.movImm(VReg.A0, 88); // 24 + 8*8
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET);

        vm.movImm(VReg.V1, TYPE_ARRAY);
        vm.store(VReg.S1, 0, VReg.V1);
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.S1, 8, VReg.V1); // length = 0
        vm.movImm(VReg.V1, 8);
        vm.store(VReg.S1, 16, VReg.V1); // capacity = 8

        vm.label("_jpa_loop");
        // 跳过空白
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_json_skip_whitespace");
        vm.mov(VReg.S0, VReg.RET);

        // 检查是否结束
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 0x5d); // ']'
        vm.jeq("_jpa_done");
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_jpa_done");

        // 跳过逗号
        vm.cmpImm(VReg.V0, 0x2c);
        vm.jne("_jpa_parse");
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_json_skip_whitespace");
        vm.mov(VReg.S0, VReg.RET);

        vm.label("_jpa_parse");
        // 解析元素
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_json_parse_value");
        vm.mov(VReg.S2, VReg.RET); // 元素值

        // 添加到数组
        vm.load(VReg.S3, VReg.S1, 8); // 当前 length
        vm.shlImm(VReg.V0, VReg.S3, 3);
        vm.addImm(VReg.V0, VReg.V0, 24);
        vm.add(VReg.V0, VReg.S1, VReg.V0);
        vm.store(VReg.V0, 0, VReg.S2);
        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.store(VReg.S1, 8, VReg.S3);

        // 简化：跳过已解析的部分（需要知道解析了多少字符）
        // 暂时按固定步长前进
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_jpa_loop");

        vm.label("_jpa_done");
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    // _json_parse_object(text) -> Object
    generateParseObject() {
        const vm = this.vm;

        vm.label("_json_parse_object");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);

        // 创建空对象
        vm.call("_object_new");
        vm.mov(VReg.S1, VReg.RET);

        // 简化实现：返回空对象
        // TODO: 完整解析对象属性

        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }
}
