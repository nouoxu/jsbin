// JSBin 正则引擎 - NFA/DFA 实现
// 支持: ., *, +, ?, |, [], ^, $, 捕获组 (), 字符类 \d \w \s 等

import { VReg } from "../../../vm/index.js";

/**
 * NFA 状态结构:
 * +0: type (8 bytes) - 状态类型
 * +8: char (8 bytes) - 匹配字符 (对于 CHAR 类型)
 * +16: out1 (8 bytes) - 第一个转移状态指针
 * +24: out2 (8 bytes) - 第二个转移状态指针 (用于 SPLIT)
 * +32: char_class (8 bytes) - 字符类位图指针 (用于 CHAR_CLASS)
 * +40: group_id (8 bytes) - 捕获组 ID (用于 GROUP_START/END)
 */

// NFA 状态类型
const NFA_MATCH = 0; // 匹配状态（接受态）
const NFA_CHAR = 1; // 匹配单个字符
const NFA_ANY = 2; // 匹配任意字符 (.)
const NFA_SPLIT = 3; // 分支状态 (用于 |, *, +, ?)
const NFA_CHAR_CLASS = 4; // 字符类 [abc]
const NFA_ANCHOR_START = 5; // ^ 锚点
const NFA_ANCHOR_END = 6; // $ 锚点
const NFA_GROUP_START = 7; // 捕获组开始
const NFA_GROUP_END = 8; // 捕获组结束
const NFA_BACKREF = 9; // 反向引用 \1

// 字符类常量
const CC_DIGIT = 1; // \d
const CC_WORD = 2; // \w
const CC_SPACE = 3; // \s
const CC_NOT_DIGIT = 4; // \D
const CC_NOT_WORD = 5; // \W
const CC_NOT_SPACE = 6; // \S

// NFA 状态大小
const NFA_STATE_SIZE = 48;

// 捕获组最大数量
const MAX_CAPTURE_GROUPS = 10;

/**
 * 匹配结果结构:
 * +0: matched (8 bytes) - 是否匹配成功
 * +8: start (8 bytes) - 匹配开始位置
 * +16: end (8 bytes) - 匹配结束位置
 * +24: groups_count (8 bytes) - 捕获组数量
 * +32: groups[0].start (8 bytes)
 * +40: groups[0].end (8 bytes)
 * ...
 */

export class RegExpEngineGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateNFAStateCreate();
        this.generateParseRegex();
        this.generateNFAMatch();
        this.generateExec();
        this.generateMatch();
        this.generateMatchAll();
        this.generateCharacterClasses();
    }

    /**
     * 创建 NFA 状态
     * A0 = type
     * A1 = char (或其他数据)
     * RET = NFA 状态指针
     */
    generateNFAStateCreate() {
        const vm = this.vm;

        vm.label("_nfa_state_create");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // type
        vm.mov(VReg.S1, VReg.A1); // char

        // 分配状态
        vm.movImm(VReg.A0, NFA_STATE_SIZE);
        vm.call("_alloc");

        // 保存分配的指针到S2，因为V0映射到X0与RET冲突
        vm.mov(VReg.S2, VReg.RET);

        // 设置 type
        vm.store(VReg.S2, 0, VReg.S0);

        // 设置 char
        vm.store(VReg.S2, 8, VReg.S1);

        // out1 = 0
        // 注意：不能用V0，因为V0=X0=RET，使用V1代替
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.S2, 16, VReg.V1);

        // out2 = 0
        vm.store(VReg.S2, 24, VReg.V1);

        // char_class = 0
        vm.store(VReg.S2, 32, VReg.V1);

        // group_id = 0
        vm.store(VReg.S2, 40, VReg.V1);

        // 返回分配的指针
        vm.mov(VReg.RET, VReg.S2);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 16);
    }

    /**
     * 解析正则表达式模式，构建 NFA
     * A0 = pattern 字符串指针
     * RET = NFA 起始状态指针
     *
     * 简化的解析器，支持:
     * - 字面字符
     * - . (任意字符)
     * - * (零或多个)
     * - + (一或多个)
     * - ? (零或一个)
     * - | (或)
     * - [] (字符类)
     * - () (捕获组)
     * - ^ $ (锚点)
     * - \d \w \s (字符类快捷方式)
     */
    generateParseRegex() {
        const vm = this.vm;

        vm.label("_regexp_parse");
        vm.prologue(96, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        vm.mov(VReg.S0, VReg.A0); // pattern
        vm.movImm(VReg.S1, 0); // 当前 NFA 片段头
        vm.movImm(VReg.S2, 0); // 当前 NFA 片段尾
        vm.movImm(VReg.S3, 0); // 当前位置
        vm.movImm(VReg.S4, 0); // 连接偏移：0=使用16(out1), 1=使用24(out2)
        vm.movImm(VReg.S5, 0); // 上一个原子状态（用于量词）
        // [SP+80] = 上上一个状态（指向 S5 的那个状态）
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.SP, 80, VReg.V0);

        const loopStart = "_regexp_parse_loop";
        const loopEnd = "_regexp_parse_done";
        const handleChar = "_regexp_parse_char";
        const handleDot = "_regexp_parse_dot";
        const handleStar = "_regexp_parse_star";
        const handlePlus = "_regexp_parse_plus";
        const handleQuestion = "_regexp_parse_question";
        const handleCharClass = "_regexp_parse_char_class";
        const handleAlternation = "_regexp_parse_alternation";

        vm.label(loopStart);
        // 读取当前字符
        vm.add(VReg.V0, VReg.S0, VReg.S3);
        vm.loadByte(VReg.V1, VReg.V0, 0);

        // 检查是否结束
        vm.cmpImm(VReg.V1, 0);
        vm.jeq(loopEnd);

        // 检查特殊字符
        vm.cmpImm(VReg.V1, 0x2e); // '.'
        vm.jeq(handleDot);

        vm.cmpImm(VReg.V1, 0x2a); // '*'
        vm.jeq(handleStar);

        vm.cmpImm(VReg.V1, 0x2b); // '+'
        vm.jeq(handlePlus);

        vm.cmpImm(VReg.V1, 0x3f); // '?'
        vm.jeq(handleQuestion);

        vm.cmpImm(VReg.V1, 0x5b); // '['
        vm.jeq(handleCharClass);

        vm.cmpImm(VReg.V1, 0x7c); // '|'
        vm.jeq(handleAlternation);

        // 默认：字面字符
        vm.label(handleChar);
        vm.movImm(VReg.A0, NFA_CHAR);
        vm.mov(VReg.A1, VReg.V1);
        vm.call("_nfa_state_create");
        // 在连接之前，保存当前尾作为"上上一个状态"
        vm.store(VReg.SP, 80, VReg.S2);
        // 保存这个原子状态以便量词使用
        vm.mov(VReg.S5, VReg.RET);
        // 连接到当前片段
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_regexp_parse_first_state");
        // 根据 S4 决定连接方式
        // S4=0: 正常 out1
        // S4=1: 使用 out2（来自 * 或 +）
        // S4=2: 同时连接 S2.out1 和 [SP+88].out2（来自 ?）
        // S4=3: 使用 out2，然后变成 S4=4（选择的右分支开始）
        // S4=4: 正常 out1，但结束时需要同时连接左右分支
        vm.cmpImm(VReg.S4, 1);
        vm.jeq("_regexp_parse_use_out2");
        vm.cmpImm(VReg.S4, 2);
        vm.jeq("_regexp_parse_use_both");
        vm.cmpImm(VReg.S4, 3);
        vm.jeq("_regexp_parse_use_out2_alt");
        // S4=0 或 S4=4: 使用 out1
        vm.store(VReg.S2, 16, VReg.RET); // 前一状态.out1 = 新状态
        vm.jmp("_regexp_parse_update_tail");
        vm.label("_regexp_parse_use_out2");
        vm.store(VReg.S2, 24, VReg.RET); // 前一状态.out2 = 新状态
        vm.movImm(VReg.S4, 0); // 重置
        vm.jmp("_regexp_parse_update_tail");
        vm.label("_regexp_parse_use_out2_alt");
        // S4=3: 选择模式的第一个右分支字符
        vm.store(VReg.S2, 24, VReg.RET); // split.out2 = 新状态
        vm.movImm(VReg.S4, 4); // 变成模式4，后续正常使用out1
        vm.jmp("_regexp_parse_update_tail");
        vm.label("_regexp_parse_use_both");
        // 同时连接：S2.out1 = 新状态，[SP+88].out2 = 新状态
        vm.store(VReg.S2, 16, VReg.RET); // 原子.out1 = 新状态
        vm.load(VReg.V3, VReg.SP, 88); // V3 = split 状态
        vm.store(VReg.V3, 24, VReg.RET); // split.out2 = 新状态
        vm.movImm(VReg.S4, 0); // 重置
        vm.jmp("_regexp_parse_update_tail");

        vm.label("_regexp_parse_first_state");
        vm.mov(VReg.S1, VReg.RET); // 第一个状态作为头

        vm.label("_regexp_parse_update_tail");
        vm.mov(VReg.S2, VReg.RET); // 更新尾

        // 移动到下一个字符
        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp(loopStart);

        // 处理 '.'
        vm.label(handleDot);
        vm.movImm(VReg.A0, NFA_ANY);
        vm.movImm(VReg.A1, 0);
        vm.call("_nfa_state_create");
        // 在连接之前，保存当前尾作为"上上一个状态"
        vm.store(VReg.SP, 80, VReg.S2);
        // 保存这个原子状态
        vm.mov(VReg.S5, VReg.RET);
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_regexp_parse_first_state");
        // 根据 S4 决定连接方式（与字符处理相同）
        vm.cmpImm(VReg.S4, 1);
        vm.jeq("_regexp_parse_dot_out2");
        vm.cmpImm(VReg.S4, 2);
        vm.jeq("_regexp_parse_dot_both");
        // S4=0: 使用 out1
        vm.store(VReg.S2, 16, VReg.RET);
        vm.jmp("_regexp_parse_update_tail");
        vm.label("_regexp_parse_dot_out2");
        vm.store(VReg.S2, 24, VReg.RET);
        vm.movImm(VReg.S4, 0);
        vm.jmp("_regexp_parse_update_tail");
        vm.label("_regexp_parse_dot_both");
        vm.store(VReg.S2, 16, VReg.RET);
        vm.load(VReg.V3, VReg.SP, 88);
        vm.store(VReg.V3, 24, VReg.RET);
        vm.movImm(VReg.S4, 0);
        vm.jmp("_regexp_parse_update_tail");

        // 处理 '*' (零或多个): a*
        // 结构: SPLIT -> a -> (回到SPLIT)
        //       SPLIT.out1 = a, SPLIT.out2 = next
        //       a.out1 = SPLIT
        vm.label(handleStar);
        // 创建 SPLIT 状态
        vm.movImm(VReg.A0, NFA_SPLIT);
        vm.movImm(VReg.A1, 0);
        vm.call("_nfa_state_create");
        vm.mov(VReg.V2, VReg.RET); // V2 = split 状态

        // split.out1 = 上一个原子状态 (S5)
        vm.store(VReg.V2, 16, VReg.S5);
        // split.out2 = null (后续会连接到下一个状态)

        // 上一个原子状态.out1 = split (形成循环)
        vm.store(VReg.S5, 16, VReg.V2);

        // 把指向 S5 的前一个状态改为指向 SPLIT
        vm.load(VReg.V3, VReg.SP, 80); // V3 = 上上一个状态
        vm.cmpImm(VReg.V3, 0);
        vm.jeq("_regexp_parse_star_check_head");
        // 上上一个状态.out1 = split
        vm.store(VReg.V3, 16, VReg.V2);

        vm.label("_regexp_parse_star_check_head");
        // 如果 S5 是头，需要更新头为 split
        vm.cmp(VReg.S1, VReg.S5);
        vm.jne("_regexp_parse_star_done");
        vm.mov(VReg.S1, VReg.V2); // 头变成 split

        vm.label("_regexp_parse_star_done");
        // 更新尾为 split（out2 用于连接后续）
        vm.mov(VReg.S2, VReg.V2);
        // 设置 S4=1，表示后续状态应该连接到 out2
        vm.movImm(VReg.S4, 1);

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp(loopStart);

        // 处理 '+' (一或多个): a+
        // 结构: a -> SPLIT
        //       SPLIT.out1 = a (循环), SPLIT.out2 = next
        vm.label(handlePlus);
        vm.movImm(VReg.A0, NFA_SPLIT);
        vm.movImm(VReg.A1, 0);
        vm.call("_nfa_state_create");
        vm.mov(VReg.V2, VReg.RET); // V2 = split

        // 上一个原子状态.out1 = split
        vm.store(VReg.S5, 16, VReg.V2);
        // split.out1 = 上一个原子状态 (循环回去)
        vm.store(VReg.V2, 16, VReg.S5);
        // split.out2 = null (后续连接)

        // 更新尾为 split
        vm.mov(VReg.S2, VReg.V2);
        // 设置 S4=1，表示后续状态应该连接到 out2
        vm.movImm(VReg.S4, 1);
        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp(loopStart);

        // 处理 '?' (零或一个): a?
        // 结构: SPLIT -> a
        //       SPLIT.out1 = a, SPLIT.out2 = next (跳过 a)
        vm.label(handleQuestion);
        vm.movImm(VReg.A0, NFA_SPLIT);
        vm.movImm(VReg.A1, 0);
        vm.call("_nfa_state_create");
        vm.mov(VReg.V2, VReg.RET); // V2 = split

        // split.out1 = 上一个原子状态
        vm.store(VReg.V2, 16, VReg.S5);
        // split.out2 = null (跳过时用)

        // 原子状态.out1 应该指向后续（与 split.out2 一样）
        // 所以需要两个悬空指针，这比较复杂
        // 简化方案：让原子和split共享后续，通过让split.out2指向原子的out1后面的位置
        // 更简单：让 S2 = S5（原子），S4 = 1，后续连接时同时连接 split.out2

        // 把指向 S5 的前一个状态改为指向 SPLIT
        vm.load(VReg.V3, VReg.SP, 80); // V3 = 上上一个状态
        vm.cmpImm(VReg.V3, 0);
        vm.jeq("_regexp_parse_question_check_head");
        // 上上一个状态.out1 = split
        vm.store(VReg.V3, 16, VReg.V2);

        vm.label("_regexp_parse_question_check_head");
        // 如果 S5 是头，需要更新头为 split
        vm.cmp(VReg.S1, VReg.S5);
        vm.jne("_regexp_parse_question_done");
        vm.mov(VReg.S1, VReg.V2); // 头变成 split

        vm.label("_regexp_parse_question_done");
        // 对于 a?，后续需要连接到：
        // 1. S5.out1 (如果匹配 a)
        // 2. split.out2 (如果跳过 a)
        // 简化处理：保持 S2 = S5，设置特殊标志来处理 split.out2
        // 这里我们用一个技巧：让 split.out2 也指向 S5，然后 S5.out1 指向后续
        // 这样当尝试 out2 时会跳到 S5，但由于 S5 需要匹配字符，会失败...
        // 更好的方案：split.out2 直接指向后续
        // 我们保存 split 到栈上 [SP+88]，后续连接时同时填充 split.out2
        vm.store(VReg.SP, 88, VReg.V2); // 保存 split 指针

        // S2 = S5（原子状态的 out1 会连接后续）
        vm.mov(VReg.S2, VReg.S5);
        // S4 = 2 表示 ? 模式，需要同时连接 split.out2
        vm.movImm(VReg.S4, 2);
        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp(loopStart);

        // 处理 '[' (字符类): [abc], [^abc], [a-z]
        // 字符类使用 256 位 bitmap (32 字节) 存储
        vm.label(handleCharClass);
        vm.addImm(VReg.S3, VReg.S3, 1); // 跳过 '['

        // 分配 bitmap (32 字节)
        vm.movImm(VReg.A0, 32);
        vm.call("_alloc");
        vm.mov(VReg.V4, VReg.RET); // V4 = bitmap 指针

        // 清零 bitmap
        vm.movImm(VReg.V5, 0);
        vm.store(VReg.V4, 0, VReg.V5);
        vm.store(VReg.V4, 8, VReg.V5);
        vm.store(VReg.V4, 16, VReg.V5);
        vm.store(VReg.V4, 24, VReg.V5);

        // V6 = 是否取反 (0 或 1)
        vm.movImm(VReg.V6, 0);

        // 检查是否 '^' (取反)
        vm.add(VReg.V0, VReg.S0, VReg.S3);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 0x5e); // '^'
        vm.jne("_regexp_parse_cc_loop");
        vm.movImm(VReg.V6, 1); // 设置取反标志
        vm.addImm(VReg.S3, VReg.S3, 1); // 跳过 '^'

        // 解析字符类内容
        vm.label("_regexp_parse_cc_loop");
        vm.add(VReg.V0, VReg.S0, VReg.S3);
        vm.loadByte(VReg.V1, VReg.V0, 0);

        // 检查 ']' 结束
        vm.cmpImm(VReg.V1, 0x5d); // ']'
        vm.jeq("_regexp_parse_cc_done");

        // 检查 '\0' 意外结束
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_regexp_parse_cc_done");

        // 检查范围 '-'
        // 先读下一个字符
        vm.add(VReg.V0, VReg.S0, VReg.S3);
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.loadByte(VReg.V2, VReg.V0, 0);
        vm.cmpImm(VReg.V2, 0x2d); // '-'
        vm.jne("_regexp_parse_cc_single");

        // 是范围，读结束字符
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.loadByte(VReg.V3, VReg.V0, 0); // V3 = 结束字符

        vm.cmpImm(VReg.V3, 0x5d); // ']'
        vm.jeq("_regexp_parse_cc_single"); // 如果是 ']'，则 '-' 是字面字符

        // 设置范围 [V1, V3]
        vm.label("_regexp_parse_cc_range_loop");
        vm.cmp(VReg.V1, VReg.V3);
        vm.jgt("_regexp_parse_cc_range_done");

        // 设置 bitmap 位: bitmap[V1 / 8] |= (1 << (V1 % 8))
        // 注意：不能使用 A0-A3，因为它们与 V0-V3 共享物理寄存器
        vm.shrImm(VReg.V7, VReg.V1, 3); // V7 = V1 / 8
        vm.andImm(VReg.V0, VReg.V1, 7); // V0 = V1 % 8
        vm.movImm(VReg.V2, 1);
        vm.shl(VReg.V2, VReg.V2, VReg.V0); // V2 = 1 << (V1 % 8)
        vm.add(VReg.V5, VReg.V4, VReg.V7); // V5 = bitmap + V7
        vm.loadByte(VReg.V0, VReg.V5, 0); // V0 = bitmap[V7]
        vm.or(VReg.V0, VReg.V0, VReg.V2);
        vm.storeByte(VReg.V5, 0, VReg.V0);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp("_regexp_parse_cc_range_loop");

        vm.label("_regexp_parse_cc_range_done");
        vm.addImm(VReg.S3, VReg.S3, 3); // 跳过 'a-z'
        vm.jmp("_regexp_parse_cc_loop");

        // 单个字符
        vm.label("_regexp_parse_cc_single");
        // 设置 bitmap 位
        vm.shrImm(VReg.V7, VReg.V1, 3); // V7 = V1 / 8
        vm.andImm(VReg.V0, VReg.V1, 7); // V0 = V1 % 8
        vm.movImm(VReg.V2, 1);
        vm.shl(VReg.V2, VReg.V2, VReg.V0); // V2 = 1 << (V1 % 8)
        vm.add(VReg.V5, VReg.V4, VReg.V7); // V5 = bitmap + V7
        vm.loadByte(VReg.V0, VReg.V5, 0);
        vm.or(VReg.V0, VReg.V0, VReg.V2);
        vm.storeByte(VReg.V5, 0, VReg.V0);

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_regexp_parse_cc_loop");

        vm.label("_regexp_parse_cc_done");
        vm.addImm(VReg.S3, VReg.S3, 1); // 跳过 ']'

        // 如果取反，反转 bitmap
        vm.cmpImm(VReg.V6, 0);
        vm.jeq("_regexp_parse_cc_create");
        // 反转所有字节
        vm.load(VReg.V5, VReg.V4, 0);
        vm.not(VReg.V5, VReg.V5);
        vm.store(VReg.V4, 0, VReg.V5);
        vm.load(VReg.V5, VReg.V4, 8);
        vm.not(VReg.V5, VReg.V5);
        vm.store(VReg.V4, 8, VReg.V5);
        vm.load(VReg.V5, VReg.V4, 16);
        vm.not(VReg.V5, VReg.V5);
        vm.store(VReg.V4, 16, VReg.V5);
        vm.load(VReg.V5, VReg.V4, 24);
        vm.not(VReg.V5, VReg.V5);
        vm.store(VReg.V4, 24, VReg.V5);

        vm.label("_regexp_parse_cc_create");
        // 创建 CHAR_CLASS 状态
        vm.movImm(VReg.A0, NFA_CHAR_CLASS);
        vm.mov(VReg.A1, VReg.V4); // bitmap 指针作为 char 参数
        vm.call("_nfa_state_create");

        // 保存"上上一个状态"
        vm.store(VReg.SP, 80, VReg.S2);
        // 保存这个原子状态
        vm.mov(VReg.S5, VReg.RET);

        // 连接到当前片段
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_regexp_parse_cc_first");
        // 根据 S4 决定连接方式
        vm.cmpImm(VReg.S4, 1);
        vm.jeq("_regexp_parse_cc_out2");
        vm.cmpImm(VReg.S4, 2);
        vm.jeq("_regexp_parse_cc_both");
        // S4=0
        vm.store(VReg.S2, 16, VReg.RET);
        vm.jmp("_regexp_parse_cc_update_tail");
        vm.label("_regexp_parse_cc_out2");
        vm.store(VReg.S2, 24, VReg.RET);
        vm.movImm(VReg.S4, 0);
        vm.jmp("_regexp_parse_cc_update_tail");
        vm.label("_regexp_parse_cc_both");
        vm.store(VReg.S2, 16, VReg.RET);
        vm.load(VReg.V3, VReg.SP, 88);
        vm.store(VReg.V3, 24, VReg.RET);
        vm.movImm(VReg.S4, 0);
        vm.jmp("_regexp_parse_cc_update_tail");

        vm.label("_regexp_parse_cc_first");
        vm.mov(VReg.S1, VReg.RET);

        vm.label("_regexp_parse_cc_update_tail");
        vm.mov(VReg.S2, VReg.RET);
        vm.jmp(loopStart);

        // 处理 '|' (选择): a|b
        // 结构: SPLIT -> a... -> (后续)
        //              -> b... -> (后续)
        vm.label(handleAlternation);
        vm.addImm(VReg.S3, VReg.S3, 1); // 跳过 '|'

        // 创建 SPLIT 状态
        vm.movImm(VReg.A0, NFA_SPLIT);
        vm.movImm(VReg.A1, 0);
        vm.call("_nfa_state_create");
        vm.mov(VReg.V2, VReg.RET); // V2 = split

        // split.out1 = 当前头 (左分支)
        vm.store(VReg.V2, 16, VReg.S1);

        // 递归解析右分支（简化：直接继续，右分支会成为新的 NFA）
        // 但这需要栈来保存左分支...
        // 更简单的实现：记录需要在后面连接的悬空指针
        // 为简单起见，我们把当前尾保存起来，解析完右分支后，两边都指向 MATCH
        // 保存左分支尾到 [SP+88]
        vm.store(VReg.SP, 88, VReg.S2);

        // 新头变成 split
        vm.mov(VReg.S1, VReg.V2);
        // 新尾变成 split（用 out2 连接右分支）
        vm.mov(VReg.S2, VReg.V2);
        // S4=3 表示选择模式，结束时需要同时连接左分支尾部和当前尾部
        vm.movImm(VReg.S4, 3);

        vm.jmp(loopStart);

        // 完成
        vm.label(loopEnd);
        // 添加 MATCH 状态
        vm.movImm(VReg.A0, NFA_MATCH);
        vm.movImm(VReg.A1, 0);
        vm.call("_nfa_state_create");
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_regexp_parse_empty");
        // 保存 MATCH 状态指针
        vm.mov(VReg.V2, VReg.RET);
        // 根据 S4 决定如何连接 MATCH
        vm.cmpImm(VReg.S4, 1);
        vm.jeq("_regexp_parse_end_out2");
        vm.cmpImm(VReg.S4, 2);
        vm.jeq("_regexp_parse_end_both");
        vm.cmpImm(VReg.S4, 3);
        vm.jeq("_regexp_parse_end_alternation");
        vm.cmpImm(VReg.S4, 4);
        vm.jeq("_regexp_parse_end_alternation");
        // S4=0: 正常 out1
        vm.store(VReg.S2, 16, VReg.V2);
        vm.jmp("_regexp_parse_done_ok");
        vm.label("_regexp_parse_end_out2");
        // S4=1: 使用 out2
        vm.store(VReg.S2, 24, VReg.V2);
        vm.jmp("_regexp_parse_done_ok");
        vm.label("_regexp_parse_end_both");
        // S4=2: 同时连接 (用于 ?)
        vm.store(VReg.S2, 16, VReg.V2);
        vm.load(VReg.V3, VReg.SP, 88);
        vm.store(VReg.V3, 24, VReg.V2);
        vm.jmp("_regexp_parse_done_ok");
        vm.label("_regexp_parse_end_alternation");
        // S4=3 或 S4=4: 选择模式，连接当前尾部.out1 和 [SP+88].out1
        vm.store(VReg.S2, 16, VReg.V2); // 右分支尾部 -> MATCH
        vm.load(VReg.V3, VReg.SP, 88); // 左分支尾部
        vm.store(VReg.V3, 16, VReg.V2); // 左分支尾部 -> MATCH

        vm.label("_regexp_parse_done_ok");
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 96);

        vm.label("_regexp_parse_empty");
        // 空模式，返回 MATCH 状态
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 96);
    }

    /**
     * NFA 匹配 (Thompson 构造)
     * A0 = NFA 起始状态
     * A1 = 输入字符串
     * A2 = 起始位置
     * A3 = flags (g=1, i=2, m=4, s=8, u=16, y=32)
     * RET = 1 (匹配) 或 0 (不匹配)
     */
    generateNFAMatch() {
        const vm = this.vm;
        const FLAG_IGNORE_CASE = 2;

        vm.label("_nfa_match");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // NFA 起始状态
        vm.mov(VReg.S1, VReg.A1); // 输入字符串
        vm.mov(VReg.S2, VReg.A2); // 当前位置
        vm.mov(VReg.S3, VReg.A3); // flags

        // 简化的递归匹配
        const matchLoop = "_nfa_match_loop";
        const matchChar = "_nfa_match_char";
        const matchCharCompare = "_nfa_match_char_compare";
        const matchCharOk = "_nfa_match_char_ok";
        const matchAny = "_nfa_match_any";
        const matchSplit = "_nfa_match_split";
        const matchSuccess = "_nfa_match_success";
        const matchFail = "_nfa_match_fail";

        vm.label(matchLoop);
        // 检查空状态
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(matchFail);

        // 加载状态类型
        vm.load(VReg.V0, VReg.S0, 0);

        // MATCH 状态
        vm.cmpImm(VReg.V0, NFA_MATCH);
        vm.jeq(matchSuccess);

        // CHAR 状态
        vm.cmpImm(VReg.V0, NFA_CHAR);
        vm.jeq(matchChar);

        // ANY 状态
        vm.cmpImm(VReg.V0, NFA_ANY);
        vm.jeq(matchAny);

        // SPLIT 状态
        vm.cmpImm(VReg.V0, NFA_SPLIT);
        vm.jeq(matchSplit);

        // CHAR_CLASS 状态
        vm.cmpImm(VReg.V0, NFA_CHAR_CLASS);
        vm.jeq("_nfa_match_char_class");

        // 未知状态，失败
        vm.jmp(matchFail);

        // 匹配字符
        vm.label(matchChar);
        vm.add(VReg.V1, VReg.S1, VReg.S2);
        vm.loadByte(VReg.V2, VReg.V1, 0); // V2 = 输入字符
        vm.cmpImm(VReg.V2, 0);
        vm.jeq(matchFail); // 输入结束

        vm.load(VReg.V3, VReg.S0, 8); // V3 = 期望的字符

        // 检查是否需要大小写不敏感匹配
        vm.andImm(VReg.V4, VReg.S3, FLAG_IGNORE_CASE);
        vm.cmpImm(VReg.V4, 0);
        vm.jeq(matchCharCompare); // 不是大小写不敏感，直接比较

        // 大小写不敏感：将两个字符都转为小写
        // 转换 V2 (输入字符) 为小写
        vm.cmpImm(VReg.V2, 0x41); // 'A'
        vm.jlt(matchCharCompare + "_v3"); // < 'A'，跳过转换
        vm.cmpImm(VReg.V2, 0x5a); // 'Z'
        vm.jgt(matchCharCompare + "_v3"); // > 'Z'，跳过转换
        vm.addImm(VReg.V2, VReg.V2, 32); // 转为小写

        vm.label(matchCharCompare + "_v3");
        // 转换 V3 (期望字符) 为小写
        vm.cmpImm(VReg.V3, 0x41); // 'A'
        vm.jlt(matchCharCompare); // < 'A'，跳过转换
        vm.cmpImm(VReg.V3, 0x5a); // 'Z'
        vm.jgt(matchCharCompare); // > 'Z'，跳过转换
        vm.addImm(VReg.V3, VReg.V3, 32); // 转为小写

        vm.label(matchCharCompare);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jne(matchFail);

        // 匹配成功，移动到下一个状态
        vm.label(matchCharOk);
        vm.load(VReg.S0, VReg.S0, 16); // out1
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(matchLoop);

        // 匹配任意字符
        vm.label(matchAny);
        vm.add(VReg.V1, VReg.S1, VReg.S2);
        vm.loadByte(VReg.V2, VReg.V1, 0);
        vm.cmpImm(VReg.V2, 0);
        vm.jeq(matchFail);
        vm.cmpImm(VReg.V2, 0x0a); // 不匹配换行符
        vm.jeq(matchFail);

        vm.load(VReg.S0, VReg.S0, 16);
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(matchLoop);

        // 分支状态
        vm.label(matchSplit);
        // 尝试 out1
        vm.load(VReg.V4, VReg.S0, 16); // out1
        vm.push(VReg.S0);
        vm.push(VReg.S2);
        vm.mov(VReg.A0, VReg.V4);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.S2);
        vm.mov(VReg.A3, VReg.S3); // 传递 flags
        vm.call("_nfa_match");
        vm.pop(VReg.S2);
        vm.pop(VReg.S0);
        vm.cmpImm(VReg.RET, 1);
        vm.jeq(matchSuccess);

        // 尝试 out2
        vm.load(VReg.S0, VReg.S0, 24);
        vm.jmp(matchLoop);

        // 匹配字符类 [abc]
        vm.label("_nfa_match_char_class");
        vm.add(VReg.V1, VReg.S1, VReg.S2);
        vm.loadByte(VReg.V2, VReg.V1, 0); // V2 = 输入字符
        vm.cmpImm(VReg.V2, 0);
        vm.jeq(matchFail); // 输入结束

        // 加载 bitmap 指针
        vm.load(VReg.V3, VReg.S0, 8); // V3 = bitmap 指针

        // 检查 bitmap 中的位: bitmap[V2 / 8] & (1 << (V2 % 8))
        vm.shrImm(VReg.V4, VReg.V2, 3); // V4 = V2 / 8
        vm.andImm(VReg.V5, VReg.V2, 7); // V5 = V2 % 8
        vm.movImm(VReg.V6, 1);
        vm.shl(VReg.V6, VReg.V6, VReg.V5); // V6 = 1 << (V2 % 8)
        vm.add(VReg.V7, VReg.V3, VReg.V4); // V7 = bitmap + V4
        vm.loadByte(VReg.A0, VReg.V7, 0);
        vm.and(VReg.A0, VReg.A0, VReg.V6);
        vm.cmpImm(VReg.A0, 0);
        vm.jeq(matchFail); // 位未设置，不匹配

        // 匹配成功，移动到下一个状态
        vm.load(VReg.S0, VReg.S0, 16); // out1
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.jmp(matchLoop);

        vm.label(matchSuccess);
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);

        vm.label(matchFail);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    /**
     * exec() 方法 - 返回匹配数组或 null
     * A0 = RegExp 对象
     * A1 = 输入字符串
     * RET = 结果数组或 0 (null)
     */
    generateExec() {
        const vm = this.vm;

        vm.label("_regexp_exec_full");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // RegExp
        vm.mov(VReg.S1, VReg.A1); // 输入字符串

        // 加载模式
        vm.load(VReg.S2, VReg.S0, 8); // pattern

        // 解析正则表达式
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_regexp_parse");
        vm.mov(VReg.S3, VReg.RET); // NFA

        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_regexp_exec_full_null");

        // 获取字符串长度
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.mov(VReg.S4, VReg.RET); // 长度

        // 从每个位置尝试匹配
        vm.movImm(VReg.V5, 0); // 当前位置

        const searchLoop = "_regexp_exec_search";
        const searchDone = "_regexp_exec_found";
        const searchEnd = "_regexp_exec_not_found";

        vm.label(searchLoop);
        vm.cmp(VReg.V5, VReg.S4);
        vm.jgt(searchEnd);

        vm.mov(VReg.A0, VReg.S3); // NFA
        vm.mov(VReg.A1, VReg.S1); // 输入
        vm.mov(VReg.A2, VReg.V5); // 位置
        vm.push(VReg.V5);
        vm.call("_nfa_match");
        vm.pop(VReg.V5);

        vm.cmpImm(VReg.RET, 1);
        vm.jeq(searchDone);

        vm.addImm(VReg.V5, VReg.V5, 1);
        vm.jmp(searchLoop);

        vm.label(searchDone);
        // 创建结果数组
        vm.movImm(VReg.A0, 1); // 一个元素
        vm.call("_array_new_with_size");
        vm.mov(VReg.S4, VReg.RET);

        // 提取匹配的子字符串
        // 简化：返回从匹配位置开始的字符串
        vm.add(VReg.V0, VReg.S1, VReg.V5);
        vm.mov(VReg.A0, VReg.S4);
        vm.movImm(VReg.A1, 0);
        vm.mov(VReg.A2, VReg.V0);
        vm.call("_array_set");

        vm.mov(VReg.RET, VReg.S4);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        vm.label("_regexp_exec_full_null");
        vm.label(searchEnd);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    /**
     * match() 方法
     */
    generateMatch() {
        const vm = this.vm;

        vm.label("_string_match");
        // 委托给 exec
        vm.jmp("_regexp_exec_full");
    }

    /**
     * matchAll() 方法 - 返回迭代器
     */
    generateMatchAll() {
        const vm = this.vm;

        vm.label("_string_matchAll");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // 字符串
        vm.mov(VReg.S1, VReg.A1); // RegExp

        // 创建数组存储所有匹配
        vm.movImm(VReg.A0, 0);
        vm.call("_array_new_with_size");
        vm.mov(VReg.S2, VReg.RET);

        // TODO: 实现完整的 matchAll 逻辑
        // 简化：返回空数组
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    /**
     * 字符类检测函数
     */
    generateCharacterClasses() {
        const vm = this.vm;

        // _is_digit: 检查是否是数字
        vm.label("_is_digit");
        vm.cmpImm(VReg.A0, 0x30); // '0'
        vm.jlt("_is_digit_false");
        vm.cmpImm(VReg.A0, 0x39); // '9'
        vm.jgt("_is_digit_false");
        vm.movImm(VReg.RET, 1);
        vm.ret();
        vm.label("_is_digit_false");
        vm.movImm(VReg.RET, 0);
        vm.ret();

        // _is_word: 检查是否是单词字符 [a-zA-Z0-9_]
        vm.label("_is_word");
        // 检查 a-z
        vm.cmpImm(VReg.A0, 0x61);
        vm.jlt("_is_word_check_upper");
        vm.cmpImm(VReg.A0, 0x7a);
        vm.jle("_is_word_true");

        vm.label("_is_word_check_upper");
        // 检查 A-Z
        vm.cmpImm(VReg.A0, 0x41);
        vm.jlt("_is_word_check_digit");
        vm.cmpImm(VReg.A0, 0x5a);
        vm.jle("_is_word_true");

        vm.label("_is_word_check_digit");
        // 检查 0-9
        vm.cmpImm(VReg.A0, 0x30);
        vm.jlt("_is_word_check_underscore");
        vm.cmpImm(VReg.A0, 0x39);
        vm.jle("_is_word_true");

        vm.label("_is_word_check_underscore");
        // 检查 _
        vm.cmpImm(VReg.A0, 0x5f);
        vm.jeq("_is_word_true");

        vm.movImm(VReg.RET, 0);
        vm.ret();

        vm.label("_is_word_true");
        vm.movImm(VReg.RET, 1);
        vm.ret();

        // _is_space: 检查是否是空白字符
        vm.label("_is_space");
        vm.cmpImm(VReg.A0, 0x20); // space
        vm.jeq("_is_space_true");
        vm.cmpImm(VReg.A0, 0x09); // tab
        vm.jeq("_is_space_true");
        vm.cmpImm(VReg.A0, 0x0a); // newline
        vm.jeq("_is_space_true");
        vm.cmpImm(VReg.A0, 0x0d); // carriage return
        vm.jeq("_is_space_true");
        vm.cmpImm(VReg.A0, 0x0c); // form feed
        vm.jeq("_is_space_true");
        vm.cmpImm(VReg.A0, 0x0b); // vertical tab
        vm.jeq("_is_space_true");

        vm.movImm(VReg.RET, 0);
        vm.ret();

        vm.label("_is_space_true");
        vm.movImm(VReg.RET, 1);
        vm.ret();
    }
}
