// JSBin 运行时 - RegExp 支持
// 实现 JavaScript 正则表达式功能
// 包含完整的 NFA/DFA 引擎支持

import { VReg } from "../../../vm/index.js";
import { RegExpEngineGenerator } from "./engine.js";

// RegExp 对象内存布局:
// +0:  type (8 bytes) = TYPE_REGEXP (8)
// +8:  pattern (8 bytes) - 指向模式字符串的指针
// +16: flags (8 bytes) - 标志位 (g=1, i=2, m=4, s=8, u=16, y=32)
// +24: lastIndex (8 bytes) - 上次匹配位置（用于 g 标志）
// +32: nfa (8 bytes) - 编译后的 NFA 状态机指针 (缓存)
// +40: source (8 bytes) - 原始正则表达式源码 (for toString)

const TYPE_REGEXP = 8;
const REGEXP_SIZE = 48;

// 标志位常量
const FLAG_GLOBAL = 1; // g
const FLAG_IGNORE_CASE = 2; // i
const FLAG_MULTILINE = 4; // m
const FLAG_DOT_ALL = 8; // s
const FLAG_UNICODE = 16; // u
const FLAG_STICKY = 32; // y

export class RegExpGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        const vm = this.vm;
        const ctx = this.ctx;

        // 生成 NFA 引擎
        const engine = new RegExpEngineGenerator(vm, ctx);
        engine.generate();

        this.generateRegExpNew();
        this.generateRegExpTest();
        this.generateRegExpExec();
        this.generateRegExpMatch();
        this.generateRegExpReplace();
        this.generateRegExpSplit();
        this.generateRegExpSearch();
        this.generateHelpers();
    }

    /**
     * _regexp_new - 创建新的 RegExp 对象
     * A0 = 模式字符串指针
     * A1 = 标志 (整数: g=1, i=2, m=4, s=8, u=16, y=32)
     */
    generateRegExpNew() {
        const vm = this.vm;

        vm.label("_regexp_new");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // 保存模式
        vm.mov(VReg.S1, VReg.A1); // 保存标志

        // 分配 RegExp 对象
        vm.movImm(VReg.A0, REGEXP_SIZE);
        vm.call("_alloc");

        // 设置类型
        vm.movImm(VReg.V1, TYPE_REGEXP);
        vm.store(VReg.RET, 0, VReg.V1);

        // 设置模式
        vm.store(VReg.RET, 8, VReg.S0);

        // 设置标志
        vm.store(VReg.RET, 16, VReg.S1);

        // 初始化 lastIndex 为 0
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.RET, 24, VReg.V1);

        // nfa = null (延迟编译)
        vm.store(VReg.RET, 32, VReg.V1);

        // source = pattern
        vm.store(VReg.RET, 40, VReg.S0);

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    /**
     * _regexp_compile - 编译正则表达式为 NFA (如果尚未编译)
     * A0 = RegExp 对象指针
     * 返回: NFA 状态机指针
     */
    generateRegExpCompile() {
        const vm = this.vm;

        vm.label("_regexp_compile");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 检查是否已编译
        vm.load(VReg.V0, VReg.S0, 32); // nfa
        vm.cmpImm(VReg.V0, 0);
        vm.jne("_regexp_compile_cached");

        // 需要编译
        vm.load(VReg.A0, VReg.S0, 8); // pattern
        vm.call("_regexp_parse");

        // 缓存 NFA
        vm.store(VReg.S0, 32, VReg.RET);
        vm.epilogue([VReg.S0], 16);

        vm.label("_regexp_compile_cached");
        vm.mov(VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0], 16);
    }

    /**
     * _regexp_test - 测试字符串是否匹配
     * A0 = RegExp 对象指针
     * A1 = 输入字符串指针
     * 返回: 1 = 匹配, 0 = 不匹配
     */
    generateRegExpTest() {
        const vm = this.vm;

        vm.label("_regexp_test");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // regexp 对象
        vm.mov(VReg.S1, VReg.A1); // 输入字符串

        // 加载模式字符串
        vm.load(VReg.S2, VReg.S0, 8); // pattern
        // 加载标志
        vm.load(VReg.S3, VReg.S0, 16); // flags

        // 保存 flags 到 S4 供后面使用
        vm.mov(VReg.S4, VReg.S3);

        // 检查是否有 sticky 标志
        vm.movImm(VReg.V0, FLAG_STICKY);
        vm.and(VReg.V1, VReg.S3, VReg.V0);
        vm.cmpImm(VReg.V1, 0);
        vm.jne("_regexp_test_sticky");

        // 普通搜索：使用 NFA 引擎
        vm.mov(VReg.A0, VReg.S2); // pattern
        vm.call("_regexp_parse");
        vm.mov(VReg.S3, VReg.RET); // NFA

        // 从每个位置尝试匹配
        vm.movImm(VReg.V2, 0); // 当前位置

        vm.label("_regexp_test_loop");
        vm.mov(VReg.A0, VReg.S3); // NFA
        vm.mov(VReg.A1, VReg.S1); // 输入
        vm.mov(VReg.A2, VReg.V2); // 位置
        vm.mov(VReg.A3, VReg.S4); // flags
        vm.push(VReg.V2);
        vm.call("_nfa_match");
        vm.pop(VReg.V2);

        vm.cmpImm(VReg.RET, 1);
        vm.jeq("_regexp_test_found");

        // 检查是否到达字符串末尾
        vm.add(VReg.V0, VReg.S1, VReg.V2);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_regexp_test_not_found");

        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.jmp("_regexp_test_loop");

        vm.label("_regexp_test_sticky");
        // Sticky: 只从 lastIndex 位置匹配
        vm.load(VReg.V2, VReg.S0, 24); // lastIndex
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_regexp_parse");
        vm.mov(VReg.A0, VReg.RET);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.V2);
        vm.mov(VReg.A3, VReg.S4); // flags
        vm.call("_nfa_match");
        vm.cmpImm(VReg.RET, 1);
        vm.jne("_regexp_test_not_found");
        // 更新 lastIndex
        // TODO: 计算匹配长度
        vm.jmp("_regexp_test_found");

        vm.label("_regexp_test_found");
        vm.lea(VReg.RET, "_js_true");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);

        vm.label("_regexp_test_not_found");
        vm.lea(VReg.RET, "_js_false");
        vm.load(VReg.RET, VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 32);
    }

    /**
     * _regexp_exec - 执行正则匹配并返回结果数组
     * A0 = RegExp 对象指针
     * A1 = 输入字符串指针
     * 返回: 结果数组指针，null (0) 表示不匹配
     */
    generateRegExpExec() {
        const vm = this.vm;

        vm.label("_regexp_exec");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // regexp 对象
        vm.mov(VReg.S1, VReg.A1); // 输入字符串

        // 加载模式字符串
        vm.load(VReg.S2, VReg.S0, 8); // pattern
        // 加载标志
        vm.load(VReg.S3, VReg.S0, 16); // flags

        // 编译 NFA
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_regexp_parse");
        vm.mov(VReg.S4, VReg.RET); // NFA

        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_regexp_exec_null");

        // 确定起始位置
        vm.movImm(VReg.S5, 0); // 起始位置

        // 检查 global 或 sticky 标志
        vm.movImm(VReg.V0, FLAG_GLOBAL);
        vm.or(VReg.V0, VReg.V0, VReg.V0);
        vm.movImm(VReg.V1, FLAG_STICKY);
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        vm.and(VReg.V1, VReg.S3, VReg.V0);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_regexp_exec_search");

        // 从 lastIndex 开始
        vm.load(VReg.S5, VReg.S0, 24);

        vm.label("_regexp_exec_search");
        // 获取字符串长度
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.mov(VReg.V3, VReg.RET); // 长度

        // 检查 sticky 标志
        vm.movImm(VReg.V0, FLAG_STICKY);
        vm.and(VReg.V1, VReg.S3, VReg.V0);
        vm.cmpImm(VReg.V1, 0);
        vm.jne("_regexp_exec_sticky_match");

        // 普通搜索：从每个位置尝试
        vm.label("_regexp_exec_loop");
        vm.cmp(VReg.S5, VReg.V3);
        vm.jgt("_regexp_exec_null");

        vm.mov(VReg.A0, VReg.S4);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.S5);
        vm.push(VReg.V3);
        vm.call("_nfa_match");
        vm.pop(VReg.V3);

        vm.cmpImm(VReg.RET, 1);
        vm.jeq("_regexp_exec_found");

        vm.addImm(VReg.S5, VReg.S5, 1);
        vm.jmp("_regexp_exec_loop");

        vm.label("_regexp_exec_sticky_match");
        // Sticky: 只从 lastIndex 匹配
        vm.mov(VReg.A0, VReg.S4);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.S5);
        vm.call("_nfa_match");
        vm.cmpImm(VReg.RET, 1);
        vm.jne("_regexp_exec_sticky_fail");
        vm.jmp("_regexp_exec_found");

        vm.label("_regexp_exec_sticky_fail");
        // Sticky 模式失败，重置 lastIndex
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S0, 24, VReg.V0);
        vm.jmp("_regexp_exec_null");

        vm.label("_regexp_exec_found");
        // 创建结果数组
        vm.movImm(VReg.A0, 1);
        vm.call("_array_new_with_size");
        vm.mov(VReg.V4, VReg.RET); // 结果数组

        // 计算匹配长度 (简化：使用模式长度)
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_strlen");
        vm.mov(VReg.V5, VReg.RET); // 匹配长度

        // 提取匹配的子字符串
        vm.mov(VReg.A0, VReg.S1); // 源字符串
        vm.mov(VReg.A1, VReg.S5); // 起始位置
        vm.mov(VReg.A2, VReg.V5); // 长度
        vm.call("_string_substring_internal");

        // 存储到数组
        vm.mov(VReg.A0, VReg.V4);
        vm.movImm(VReg.A1, 0);
        vm.mov(VReg.A2, VReg.RET);
        vm.push(VReg.V4);
        vm.call("_array_set");
        vm.pop(VReg.V4);

        // 更新 lastIndex (如果是 global 模式)
        vm.movImm(VReg.V0, FLAG_GLOBAL);
        vm.and(VReg.V1, VReg.S3, VReg.V0);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_regexp_exec_return");

        vm.add(VReg.V0, VReg.S5, VReg.V5);
        vm.store(VReg.S0, 24, VReg.V0);

        vm.label("_regexp_exec_return");
        vm.mov(VReg.RET, VReg.V4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);

        vm.label("_regexp_exec_null");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 64);
    }

    /**
     * String.prototype.match() 实现
     * A0 = 字符串
     * A1 = RegExp
     */
    generateRegExpMatch() {
        const vm = this.vm;

        vm.label("_string_regexp_match");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // 字符串
        vm.mov(VReg.S1, VReg.A1); // RegExp

        // 检查是否是 global 模式
        vm.load(VReg.V0, VReg.S1, 16); // flags
        vm.movImm(VReg.V1, FLAG_GLOBAL);
        vm.and(VReg.V2, VReg.V0, VReg.V1);
        vm.cmpImm(VReg.V2, 0);
        vm.jne("_string_match_global");

        // 非 global：等同于 exec
        vm.mov(VReg.A0, VReg.S1);
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_regexp_exec");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        vm.label("_string_match_global");
        // Global 模式：返回所有匹配
        vm.movImm(VReg.A0, 0);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET); // 结果数组
        vm.movImm(VReg.S3, 0); // 匹配计数

        // 重置 lastIndex
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S1, 24, VReg.V0);

        vm.label("_string_match_loop");
        vm.mov(VReg.A0, VReg.S1);
        vm.mov(VReg.A1, VReg.S0);
        vm.call("_regexp_exec");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_string_match_done");

        // 获取匹配字符串
        vm.mov(VReg.V3, VReg.RET);
        vm.movImm(VReg.A1, 0);
        vm.mov(VReg.A0, VReg.V3);
        vm.call("_array_get");

        // 添加到结果数组
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S3);
        vm.mov(VReg.A2, VReg.RET);
        vm.push(VReg.V3);
        vm.call("_array_set");
        vm.pop(VReg.V3);

        vm.addImm(VReg.S3, VReg.S3, 1);

        // 防止无限循环
        vm.cmpImm(VReg.S3, 1000);
        vm.jge("_string_match_done");

        vm.jmp("_string_match_loop");

        vm.label("_string_match_done");
        // 如果没有匹配，返回 null
        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_string_match_null");

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);

        vm.label("_string_match_null");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 48);
    }

    /**
     * String.prototype.replace() 实现
     * A0 = 字符串
     * A1 = RegExp/搜索字符串
     * A2 = 替换字符串
     */
    generateRegExpReplace() {
        const vm = this.vm;

        vm.label("_string_regexp_replace");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // 源字符串
        vm.mov(VReg.S1, VReg.A1); // 模式
        vm.mov(VReg.S2, VReg.A2); // 替换字符串

        // 简化版本：查找第一个匹配并替换
        // 搜索匹配位置
        vm.mov(VReg.A0, VReg.S0);
        vm.load(VReg.A1, VReg.S1, 8); // 模式字符串
        vm.call("_strstr");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_string_replace_no_match");

        vm.mov(VReg.S3, VReg.RET); // 匹配位置

        // 计算各部分长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.V0, VReg.RET); // 源字符串长度

        vm.load(VReg.A0, VReg.S1, 8);
        vm.call("_strlen");
        vm.mov(VReg.V1, VReg.RET); // 模式长度

        vm.mov(VReg.A0, VReg.S2);
        vm.call("_strlen");
        vm.mov(VReg.V2, VReg.RET); // 替换长度

        // 计算匹配前的长度
        vm.sub(VReg.S4, VReg.S3, VReg.S0); // prefix 长度

        // 分配新字符串
        vm.sub(VReg.V3, VReg.V0, VReg.V1); // 源长度 - 模式长度
        vm.add(VReg.V3, VReg.V3, VReg.V2); // + 替换长度
        vm.addImm(VReg.A0, VReg.V3, 1); // +1 for null
        vm.call("_alloc");
        vm.mov(VReg.V4, VReg.RET); // 新字符串

        // 复制前缀
        vm.mov(VReg.A0, VReg.V4);
        vm.mov(VReg.A1, VReg.S0);
        vm.mov(VReg.A2, VReg.S4);
        vm.push(VReg.V4);
        vm.call("_memcpy");
        vm.pop(VReg.V4);

        // 复制替换字符串
        vm.add(VReg.A0, VReg.V4, VReg.S4);
        vm.mov(VReg.A1, VReg.S2);
        vm.mov(VReg.A2, VReg.V2);
        vm.push(VReg.V4);
        vm.call("_memcpy");
        vm.pop(VReg.V4);

        // 复制后缀
        vm.add(VReg.V5, VReg.S4, VReg.V2); // 新位置
        vm.add(VReg.A0, VReg.V4, VReg.V5);
        vm.add(VReg.A1, VReg.S3, VReg.V1); // 匹配后的位置
        vm.sub(VReg.V6, VReg.V0, VReg.S4);
        vm.sub(VReg.A2, VReg.V6, VReg.V1); // 后缀长度
        vm.push(VReg.V4);
        vm.call("_memcpy");
        vm.pop(VReg.V4);

        // 添加 null 终止符
        vm.add(VReg.V5, VReg.V4, VReg.V3);
        vm.movImm(VReg.V6, 0);
        vm.storeByte(VReg.V5, 0, VReg.V6);

        vm.mov(VReg.RET, VReg.V4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);

        vm.label("_string_replace_no_match");
        // 没有匹配，返回原字符串
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    /**
     * String.prototype.split() 实现
     * A0 = 字符串
     * A1 = 分隔符 (RegExp 或字符串)
     */
    generateRegExpSplit() {
        const vm = this.vm;

        vm.label("_string_regexp_split");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // 源字符串
        vm.mov(VReg.S1, VReg.A1); // 分隔符

        // 创建结果数组
        vm.movImm(VReg.A0, 0);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET); // 结果数组

        vm.mov(VReg.S3, VReg.S0); // 当前位置
        vm.movImm(VReg.S4, 0); // 元素计数

        // 获取分隔符字符串 (如果是 RegExp，获取其 pattern)
        vm.load(VReg.V0, VReg.S1, 0); // type
        vm.cmpImm(VReg.V0, TYPE_REGEXP);
        vm.jne("_string_split_str_sep");
        vm.load(VReg.S1, VReg.S1, 8); // pattern

        vm.label("_string_split_str_sep");

        vm.label("_string_split_loop");
        // 搜索分隔符
        vm.mov(VReg.A0, VReg.S3);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strstr");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_string_split_last");

        vm.mov(VReg.V1, VReg.RET); // 分隔符位置

        // 提取子字符串
        vm.sub(VReg.V2, VReg.V1, VReg.S3); // 长度
        vm.mov(VReg.A0, VReg.S3);
        vm.movImm(VReg.A1, 0);
        vm.mov(VReg.A2, VReg.V2);
        vm.push(VReg.V1);
        vm.call("_string_substring_internal");
        vm.pop(VReg.V1);

        // 添加到数组
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S4);
        vm.mov(VReg.A2, VReg.RET);
        vm.push(VReg.V1);
        vm.call("_array_set");
        vm.pop(VReg.V1);

        vm.addImm(VReg.S4, VReg.S4, 1);

        // 移动到分隔符之后
        vm.mov(VReg.A0, VReg.S1);
        vm.push(VReg.V1);
        vm.call("_strlen");
        vm.pop(VReg.V1);
        vm.add(VReg.S3, VReg.V1, VReg.RET);

        // 防止无限循环
        vm.cmpImm(VReg.S4, 1000);
        vm.jge("_string_split_done");

        vm.jmp("_string_split_loop");

        vm.label("_string_split_last");
        // 添加最后一个元素
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_strlen");
        vm.mov(VReg.V2, VReg.RET);

        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_string_split_done");

        vm.mov(VReg.A0, VReg.S3);
        vm.movImm(VReg.A1, 0);
        vm.mov(VReg.A2, VReg.V2);
        vm.call("_string_substring_internal");

        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S4);
        vm.mov(VReg.A2, VReg.RET);
        vm.call("_array_set");

        vm.label("_string_split_done");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    /**
     * String.prototype.search() 实现
     * A0 = 字符串
     * A1 = RegExp
     * 返回: 匹配位置或 -1
     */
    generateRegExpSearch() {
        const vm = this.vm;

        vm.label("_string_regexp_search");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // 字符串
        vm.mov(VReg.S1, VReg.A1); // RegExp

        // 加载模式
        vm.load(VReg.S2, VReg.S1, 8); // pattern

        // 编译 NFA
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_regexp_parse");
        vm.mov(VReg.S2, VReg.RET);

        // 从每个位置搜索
        vm.movImm(VReg.V0, 0); // 位置

        vm.label("_string_search_loop");
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S0);
        vm.mov(VReg.A2, VReg.V0);
        vm.push(VReg.V0);
        vm.call("_nfa_match");
        vm.pop(VReg.V0);

        vm.cmpImm(VReg.RET, 1);
        vm.jeq("_string_search_found");

        // 检查字符串结束
        vm.add(VReg.V1, VReg.S0, VReg.V0);
        vm.loadByte(VReg.V2, VReg.V1, 0);
        vm.cmpImm(VReg.V2, 0);
        vm.jeq("_string_search_not_found");

        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_string_search_loop");

        vm.label("_string_search_found");
        vm.mov(VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_string_search_not_found");
        vm.movImm(VReg.RET, -1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * 辅助函数
     * 注意: _strstr 和 _memcpy 已经在 string/index.js 和 allocator.js 中定义
     * 这里只定义 regexp 特有的辅助函数
     */
    generateHelpers() {
        const vm = this.vm;

        // _string_substring_internal - 简化版 substring
        // A0 = 源字符串
        // A1 = 起始位置
        // A2 = 长度
        vm.label("_string_substring_internal");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.mov(VReg.S2, VReg.A2);

        // 分配新字符串
        vm.addImm(VReg.A0, VReg.S2, 1);
        vm.call("_alloc");
        vm.mov(VReg.V3, VReg.RET);

        // 复制
        vm.mov(VReg.A0, VReg.V3);
        vm.add(VReg.A1, VReg.S0, VReg.S1);
        vm.mov(VReg.A2, VReg.S2);
        vm.push(VReg.V3);
        vm.call("_memcpy");
        vm.pop(VReg.V3);

        // null 终止
        vm.add(VReg.V0, VReg.V3, VReg.S2);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        vm.mov(VReg.RET, VReg.V3);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }
}
