// JSBin 运行时类型强制转换
// JavaScript 值转换函数
// NaN-boxing 方案

import { VReg } from "../../vm/index.js";
import { JS_NULL, JS_UNDEFINED, JS_FALSE, JS_TRUE, JS_TAG_BOOL_BASE, JS_TAG_INT32_BASE, JS_TAG_STRING_BASE, JS_TAG_OBJECT_BASE, JS_TAG_ARRAY_BASE, JS_TAG_FUNCTION_BASE, JS_PAYLOAD_MASK } from "./jsvalue.js";

const TYPE_NUMBER = 13;
const TYPE_FLOAT64 = 29;

export class CoercionGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        this.generateToBoolean();
        this.generateStrToNum();  // Must be before generateAbstractEq which calls _str_to_num
        this.generateNumberCoerce();  // Must be before abstractEq as it may call _str_to_num
        this.generateAbstractEq();
        this.generateStrictEq();
        this.generateToInt32();
        this.generateToUint32();
    }

    /**
     * _abstract_eq: 抽象相等比较 (==)
     * 输入: A0 = JSValue x, A1 = JSValue y
     * 输出: RET = JS_TRUE (0x7FF9000000000001) 或 JS_FALSE (0x7FF9000000000002)
     *
     * ECMAScript 抽象相等比较规则:
     * 1. 如果 Type(x) == Type(y)，同类型比较
     *    - Number: 浮点比较
     *    - String: 指针比较
     *    - Boolean: 比较原始布尔值
     *    - Null/Undefined: 返回 true
     *    - Object: 引用比较
     * 2. Number == String: 转换 String 为 Number
     * 3. Boolean == 任何: Boolean 转 Number (true=1, false=0)
     * 4. String/Number == Object: Object 转原始值
     */
    generateAbstractEq() {
        const vm = this.vm;

        vm.label("_abstract_eq");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // 保存参数
        vm.mov(VReg.S0, VReg.A0); // x
        vm.mov(VReg.S1, VReg.A1); // y

        // 1. 如果位模式一致，除了 Float 之外都相等
        // 注意：NaN != NaN 在 JS 中成立
        vm.cmp(VReg.S0, VReg.S1);
        vm.jne("_ae_not_same_bits");

        // 位模式一致，检查是否是 float
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.cmpImm(VReg.V0, 0x7ff8);
        vm.jge("_ae_same_bits_not_float");

        // 是 float 且位模式一致：检查是否是 NaN
        vm.fmovToFloat(0, VReg.S0);
        vm.fcmp(0, 0); // NaN 检测 (NaN != NaN)
        vm.jeq("_abstract_eq_true");
        vm.jmp("_abstract_eq_false");

        vm.label("_ae_same_bits_not_float");
        vm.jmp("_abstract_eq_true");

        vm.label("_ae_not_same_bits");

        // 2. 识别 x 和 y 的类型
        // S2 = x's type, S3 = y's type
        
        // --- Get X Type ---
        vm.shrImm(VReg.V0, VReg.S0, 48);
        // Check for String tag FIRST (0x7FFC) before tagged check
        vm.cmpImm(VReg.V0, 0x7FFC);
        vm.jeq("_ae_x_is_string");
        vm.cmpImm(VReg.V0, 0x7ff8);
        vm.jge("_ae_x_tagged");
        vm.cmpImm(VReg.V0, 0x1000);
        vm.jge("_ae_x_data_ptr");
        vm.movImm(VReg.S2, 0); // Float
        vm.jmp("_ae_x_done");
        vm.label("_ae_x_data_ptr");
        vm.cmpImm(VReg.V0, 0x1002);
        vm.jge("_ae_x_float_2");
        vm.movImm(VReg.S2, 5); // String
        vm.jmp("_ae_x_done");
        vm.label("_ae_x_float_2");
        vm.movImm(VReg.S2, 0); // Float
        vm.jmp("_ae_x_done");
        vm.label("_ae_x_is_string");
        vm.movImm(VReg.S2, 5); // String
        vm.jmp("_ae_x_done");
        vm.label("_ae_x_tagged");
        vm.subImm(VReg.V0, VReg.V0, 0x7ff8);
        vm.addImm(VReg.S2, VReg.V0, 1);
        vm.label("_ae_x_done");

        // --- Get Y Type ---
        vm.shrImm(VReg.V1, VReg.S1, 48);
        // Check for String tag FIRST (0x7FFC) before tagged check
        vm.cmpImm(VReg.V1, 0x7FFC);
        vm.jeq("_ae_y_is_string");
        vm.cmpImm(VReg.V1, 0x7ff8);
        vm.jge("_ae_y_tagged");
        vm.cmpImm(VReg.V1, 0x1000);
        vm.jge("_ae_y_data_ptr");
        vm.movImm(VReg.S3, 0); // Float
        vm.jmp("_ae_y_done");
        vm.label("_ae_y_data_ptr");
        vm.cmpImm(VReg.V1, 0x1002);
        vm.jge("_ae_y_float_2");
        vm.movImm(VReg.S3, 5); // String
        vm.jmp("_ae_y_done");
        vm.label("_ae_y_float_2");
        vm.movImm(VReg.S3, 0); // Float
        vm.jmp("_ae_y_done");
        vm.label("_ae_y_is_string");
        vm.movImm(VReg.S3, 5); // String
        vm.jmp("_ae_y_done");
        vm.label("_ae_y_tagged");
        vm.subImm(VReg.V1, VReg.V1, 0x7ff8);
        vm.addImm(VReg.S3, VReg.V1, 1);
        vm.label("_ae_y_done");

        // Types map: 0:Float, 1:Int32, 2:Bool, 3:Null, 4:Undef, 5:String, 6:Obj, 7:Arr, 8:Func

        // 2. null == undefined
        vm.cmpImm(VReg.S2, 3); // null
        vm.jne("_ae_x_not_null");
        vm.cmpImm(VReg.S3, 4); // y is undef?
        vm.jeq("_abstract_eq_true");
        vm.label("_ae_x_not_null");
        vm.cmpImm(VReg.S2, 4); // x is undef?
        vm.jne("_ae_x_not_undef");
        vm.cmpImm(VReg.S3, 3); // y is null?
        vm.jeq("_abstract_eq_true");
        vm.label("_ae_x_not_undef");

        // 3. String == Number -> Number(String) == Number
        vm.cmpImm(VReg.S2, 5); // x is String
        vm.jne("_ae_x_not_str");
        vm.cmpImm(VReg.S3, 2); // y < 2 is Number (Float=0, Int32=1)
        vm.jge("_ae_x_not_str");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_str_to_num");
        vm.mov(VReg.S0, VReg.RET);
        vm.movImm(VReg.S2, 0); // x becomes Float
        vm.jmp("_ae_recurse");
        vm.label("_ae_x_not_str");

        // 4. Number == String -> Number == Number(String)
        vm.cmpImm(VReg.S3, 5); // y is String
        vm.jne("_ae_y_not_str");
        vm.cmpImm(VReg.S2, 2); // x < 2 is Number
        vm.jge("_ae_y_not_str");
        // y is String: convert to float using _str_to_num (like case 3)
        vm.mov(VReg.S4, VReg.S0);  // S4 = x JSValue (save x)
        vm.mov(VReg.A0, VReg.S1);  // A0 = y (String JSValue)
        vm.call("_str_to_num");  // RET = float bits
        vm.mov(VReg.S1, VReg.RET); // S1 = float bits of y
        // Convert x: if Int32, extract and convert; if Float, use directly
        vm.cmpImm(VReg.S2, 1);  // check if x is Int32
        vm.jne("_ae_case4_x_is_float");
        // x is Int32: extract low 32 bits
        vm.mov(VReg.S0, VReg.S4);  // S0 = x JSValue
        vm.movImm64(VReg.V0, 0xFFFFFFFFn);
        vm.and(VReg.V0, VReg.S0, VReg.V0);  // V0 = low 32 bits
        vm.shlImm(VReg.V0, VReg.V0, 32);
        vm.sarImm(VReg.V0, VReg.V0, 32);  // sign-extend
        vm.scvtf(0, VReg.V0);  // FP0 = float(x)
        vm.fmovToInt(VReg.S0, 0);  // S0 = float bits of x
        vm.jmp("_ae_case4_done");
        vm.label("_ae_case4_x_is_float");
        // x is already Float: S0 already contains float bits
        vm.label("_ae_case4_done");
        vm.movImm(VReg.S2, 0);  // x is Float
        vm.movImm(VReg.S3, 0);  // y is Float
        vm.jmp("_ae_recurse");
        vm.label("_ae_y_not_str");

        // 5. Boolean == Any -> Number(Boolean) == Any
        vm.cmpImm(VReg.S2, 2); // x is Boolean
        vm.jne("_ae_x_not_bool");
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.V0, VReg.S0, VReg.V0); // payload 0 or 1
        vm.movImm64(VReg.V1, 0x7ff8000000000000n);
        vm.or(VReg.S0, VReg.V0, VReg.V1); // Box as Int32
        vm.movImm(VReg.S2, 1);
        vm.jmp("_ae_recurse");
        vm.label("_ae_x_not_bool");

        // 6. Any == Boolean -> Any == Number(Boolean)
        vm.cmpImm(VReg.S3, 2); // y is Boolean
        vm.jne("_ae_y_not_bool");
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.V0, VReg.S1, VReg.V0);
        vm.movImm64(VReg.V1, 0x7ff8000000000000n);
        vm.or(VReg.S1, VReg.V0, VReg.V1); // Box as Int32
        vm.movImm(VReg.S3, 1);
        vm.jmp("_ae_recurse");
        vm.label("_ae_y_not_bool");

        vm.label("_ae_recurse");
        // 如果类型一致，则进行最终比较
        vm.cmp(VReg.S2, VReg.S3);
        vm.jne("_ae_diff_types_after");

        // 同类型比较
        vm.cmpImm(VReg.S2, 5); // String
        vm.jeq("_ae_cmp_str");
        vm.cmpImm(VReg.S2, 0); // Float
        vm.jeq("_ae_both_float");
        // 其他同类型（位模式比较）
        vm.cmp(VReg.S0, VReg.S1);
        vm.jeq("_abstract_eq_true");
        vm.jmp("_abstract_eq_false");

        vm.label("_ae_diff_types_after");
        // 混合类型: Float vs Int32
        vm.cmpImm(VReg.S2, 0); // x is Float
        vm.jne("_ae_x_not_float_after");
        vm.cmpImm(VReg.S3, 1); // y is Int32
        vm.jeq("_ae_x_float_y_int");
        vm.jmp("_abstract_eq_false");

        vm.label("_ae_x_not_float_after");
        vm.cmpImm(VReg.S2, 1); // x is Int32
        vm.jne("_abstract_eq_false");
        vm.cmpImm(VReg.S3, 0); // y is Float
        vm.jeq("_ae_x_int_y_float");
        vm.jmp("_abstract_eq_false");


        // --- Actual Comparison Workers ---

        vm.label("_ae_both_float");
        vm.fmovToFloat(0, VReg.S0);
        vm.fmovToFloat(1, VReg.S1);
        vm.fcmp(0, 1);
        vm.jeq("_abstract_eq_true");
        vm.jmp("_abstract_eq_false");

        vm.label("_ae_x_float_y_int");
        vm.movImm64(VReg.V0, 0xFFFFFFFFn);
        vm.and(VReg.V0, VReg.S1, VReg.V0);
        vm.shlImm(VReg.V0, VReg.V0, 32);
        vm.sarImm(VReg.V0, VReg.V0, 32); // Sign-extend int32
        vm.scvtf(1, VReg.V0); // D1 = float(y)
        vm.fmovToFloat(0, VReg.S0);
        vm.fcmp(0, 1);
        vm.jeq("_abstract_eq_true");
        vm.jmp("_abstract_eq_false");

        vm.label("_ae_x_int_y_float");
        vm.movImm64(VReg.V0, 0xFFFFFFFFn);
        vm.and(VReg.V0, VReg.S0, VReg.V0);
        vm.shlImm(VReg.V0, VReg.V0, 32);
        vm.sarImm(VReg.V0, VReg.V0, 32);
        vm.scvtf(0, VReg.V0); // D0 = float(x)
        vm.fmovToFloat(1, VReg.S1);
        vm.fcmp(0, 1);
        vm.jeq("_abstract_eq_true");
        vm.jmp("_abstract_eq_false");

        vm.label("_ae_cmp_str");
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.S4, VReg.RET);
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_js_unbox");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S4);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_abstract_eq_true");
        vm.jmp("_abstract_eq_false");

        // ========== 返回结果 ==========
        vm.label("_abstract_eq_true");
        vm.movImm64(VReg.RET, JS_TRUE);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 128);

        vm.label("_abstract_eq_false");
        vm.movImm64(VReg.RET, JS_FALSE);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 128);
    }

    /**
     * _str_to_num: 将字符串转换为浮点数
     * 输入: A0 = JSValue (string)
     * 输出: RET = float64 位模式
     *
     * 支持格式:
     *   - 整数 ("123", "-456")
     *   - 浮点数 ("3.14")
     *   - 科学计数法 (暂不支持)
     */
    generateStrToNum() {
        const vm = this.vm;

        vm.label("_str_to_num");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 输入值

        // 检查是否是 string type (0x7FFC 高位)
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.movImm(VReg.V1, 0x7ffc);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_str_to_num_is_string");

        // 不是 0x7FFC tag，检查是否是 raw data segment pointer
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.cmpImm(VReg.V0, 0x1000);
        vm.jeq("_str_to_num_is_data_ptr");
        vm.cmpImm(VReg.V0, 0x1001);
        vm.jeq("_str_to_num_is_data_ptr");
        vm.jmp("_str_to_num_not_string");

        vm.label("_str_to_num_is_string");
        // 提取字符串指针 (低 48 位)
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.S0, VReg.S0, VReg.V0);

        vm.label("_str_to_num_is_data_ptr");
        // S0 保持不变，直接使用

        // 检查 S0 是否为 0 (空指针安全检查)
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_str_to_num_invalid");

        // 跳过空白字符
        vm.label("_str_to_num_skip_ws");
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 32); // 空格
        vm.jeq("_str_to_num_skip_char");
        vm.cmpImm(VReg.V0, 9);  // Tab
        vm.jeq("_str_to_num_skip_char");
        vm.cmpImm(VReg.V0, 10); // 换行
        vm.jeq("_str_to_num_skip_char");
        vm.cmpImm(VReg.V0, 13); // 回车
        vm.jeq("_str_to_num_skip_char");
        vm.jmp("_str_to_num_parse_start");

        vm.label("_str_to_num_skip_char");
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_str_to_num_skip_ws");

        // 检查符号
        // 寄存器分配：
        // S0 = 字符串指针 (char*)
        // S1 = 符号 (1 = 正, -1 = 负)
        // S2 = 整数部分 (拼接)
        // S3 = 小数部分 (拼接)
        // S4 = 小数位数
        vm.label("_str_to_num_parse_start");
        vm.movImm(VReg.S1, 1); // S1 = 符号 (1 = 正, -1 = 负)
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 45); // '-'
        vm.jne("_str_to_num_check_digit");
        vm.movImm(VReg.S1, -1);
        vm.addImm(VReg.S0, VReg.S0, 1);

        // 解析整数部分
        vm.label("_str_to_num_check_digit");
        vm.movImm(VReg.S2, 0); // S2 = 整数部分
        vm.movImm(VReg.S3, 0); // S3 = 小数部分 (初始化为0)
        vm.movImm(VReg.S4, 0); // S4 = 小数位数 (初始化为0)
        vm.movImm(VReg.V2, 0); // V2 = digit found flag (0 = no, 1 = yes)
        vm.label("_str_to_num_int_loop");
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 48); // '0'
        vm.jlt("_str_to_num_check_dot");
        vm.cmpImm(VReg.V0, 57); // '9'
        vm.jgt("_str_to_num_check_dot");
        // 是数字
        vm.subImm(VReg.V0, VReg.V0, 48); // V0 = digit
        // S2 = S2 * 10 + V0
        vm.movImm(VReg.V1, 10);
        vm.mul(VReg.S2, VReg.S2, VReg.V1);
        vm.add(VReg.S2, VReg.S2, VReg.V0);
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.movImm(VReg.V2, 1); // Mark: found at least one digit
        vm.jmp("_str_to_num_int_loop");

        // 检查小数点
        vm.label("_str_to_num_check_dot");
        // 如果还没有找到任何数字，检查是否是有效输入
        vm.cmpImm(VReg.V2, 0); // V2 = digit found flag
        vm.jeq("_str_to_num_no_digits"); // 如果没有找到数字，跳转到无数字处理
        vm.cmpImm(VReg.V0, 46); // '.'
        vm.jne("_str_to_num_check_trailing");
        // 有小数点，解析小数部分
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.movImm(VReg.S3, 0); // S3 = 小数部分
        vm.movImm(VReg.S4, 0); // S4 = 小数位数
        vm.label("_str_to_num_frac_loop");
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 48); // '0'
        vm.jlt("_str_to_num_finish");
        vm.cmpImm(VReg.V0, 57); // '9'
        vm.jgt("_str_to_num_finish");
        // 是数字
        vm.subImm(VReg.V0, VReg.V0, 48); // V0 = digit
        // S3 = S3 * 10 + V0
        vm.movImm(VReg.V1, 10);
        vm.mul(VReg.S3, VReg.S3, VReg.V1);
        vm.add(VReg.S3, VReg.S3, VReg.V0);
        vm.addImm(VReg.S4, VReg.S4, 1); // S4 = 小数位数
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.jmp("_str_to_num_frac_loop");

        // 检查尾部字符（无效输入检测）
        // V0 包含第一个非数字字符
        vm.label("_str_to_num_check_trailing");
        // 跳过尾部空白字符
        vm.label("_str_to_num_skip_trailing_ws");
        vm.cmpImm(VReg.V0, 32); // 空格
        vm.jeq("_str_to_num_skip_trail_char");
        vm.cmpImm(VReg.V0, 9);  // Tab
        vm.jeq("_str_to_num_skip_trail_char");
        vm.cmpImm(VReg.V0, 10); // 换行
        vm.jeq("_str_to_num_skip_trail_char");
        vm.cmpImm(VReg.V0, 13); // 回车
        vm.jeq("_str_to_num_skip_trail_char");
        // 不是空白，检查是否是结束符
        vm.cmpImm(VReg.V0, 0); // 结束符
        vm.jne("_str_to_num_invalid"); // 非空白非结束符 = 无效输入
        vm.jmp("_str_to_num_finish"); // 是结束符，有效

        vm.label("_str_to_num_skip_trail_char");
        vm.addImm(VReg.S0, VReg.S0, 1);
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.jmp("_str_to_num_skip_trailing_ws");

        // 无数字输入处理（空字符串或纯空白）
        vm.label("_str_to_num_no_digits");
        // 检查是否是结束符（空字符串的情况）
        vm.cmpImm(VReg.V0, 0); // 结束符
        vm.jeq("_str_to_num_finish"); // 是结束符，返回 0
        // 检查是否是空白字符（跳过空白后重新检查）
        vm.cmpImm(VReg.V0, 32); // 空格
        vm.jeq("_str_to_num_skip_ws");
        vm.cmpImm(VReg.V0, 9);  // Tab
        vm.jeq("_str_to_num_skip_ws");
        vm.cmpImm(VReg.V0, 10); // 换行
        vm.jeq("_str_to_num_skip_ws");
        vm.cmpImm(VReg.V0, 13); // 回车
        vm.jeq("_str_to_num_skip_ws");
        // 非空白非结束符 = 无效输入
        vm.jmp("_str_to_num_invalid");

        vm.label("_str_to_num_finish");
        // S1 = 符号
        // S2 = 整数部分
        // S3 = 小数部分
        // S4 = 小数位数
        //
        // 结果 = S2 + S3 / (10^S4)
        //
        // 例如 "42.5": S1=1, S2=42, S3=5, S4=1
        //   42 + 5/10 = 42.5
        //
        // 例如 "3.14": S1=1, S2=3, S3=14, S4=2
        //   3 + 14/100 = 3.14
        //
        // 例如 "123": S1=1, S2=123, S3=0, S4=0
        //   123 + 0 = 123

        // 先将整数部分转换为浮点数放到FP0
        vm.scvtf(0, VReg.S2); // FP0 = float(S2 = 整数部分)

        // 检查是否有小数部分 (S4 > 0)
        vm.cmpImm(VReg.S4, 0);
        vm.jeq("_str_to_num_apply_sign");

        // 有小数部分，计算 S3 / (10^S4)
        // 先计算 10^S4 (使用V0作为结果寄存器)
        // V0 = 10^S4
        vm.mov(VReg.V0, VReg.S4); // V0 = 小数位数
        vm.movImm(VReg.V1, 1); // V1 = 1 (10^0 = 1)
        vm.label("_str_to_num_pow10_loop");
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_str_to_num_pow10_done");
        vm.movImm(VReg.V2, 10);
        vm.mul(VReg.V1, VReg.V1, VReg.V2);
        vm.subImm(VReg.V0, VReg.V0, 1);
        vm.jmp("_str_to_num_pow10_loop");
        vm.label("_str_to_num_pow10_done");
        // V1 = 10^S4

        // 计算 S3 / V1
        vm.scvtf(1, VReg.S3); // FP1 = float(S3 = 小数部分)
        vm.scvtf(2, VReg.V1); // FP2 = float(V1 = 10^S4)
        vm.fdiv(1, 1, 2); // FP1 = FP1 / FP2 = 小数
        // FP0 = 整数部分, FP1 = 小数部分
        vm.fadd(0, 0, 1); // FP0 = FP0 + FP1 = 整数 + 小数

        vm.label("_str_to_num_apply_sign");
        // 应用符号 (S1 = 1 或 -1)
        vm.cmpImm(VReg.S1, -1);
        vm.jne("_str_to_num_convert");
        // 负数，取反
        vm.fneg(0, 0);

        vm.label("_str_to_num_convert");
        vm.fmovToInt(VReg.RET, 0); // RET = float64 bits
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);

        vm.label("_str_to_num_invalid");
        // 无效的数字字符串，返回 NaN
        vm.movImm64(VReg.RET, 0x7ff8000000000000n);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);

        vm.label("_str_to_num_not_string");
        // 不是字符串，返回 NaN
        vm.movImm64(VReg.RET, 0x7ff8000000000000n);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    /**
     * _to_boolean: 将任意 JavaScript 值转换为布尔值
     * 输入: A0 = JSValue
     * 输出: RET = 0 (falsy) 或 1 (truthy)
     *
     * NaN-boxing falsy 值:
     * - 0 (float64 +0.0 = 0x0000000000000000)
     * - -0 (float64 -0.0 = 0x8000000000000000)
     * - false (0x7FF9000000000002)
     * - null (0x7FFA000000000000)
     * - undefined (0x7FFB000000000000)
     * - NaN (0x7FF8000000000000 需要特殊处理)
     * - 空字符串 (0x7FFC000000000000 | ptr，长度为 0)
     *
     * 简化实现：检查常见 falsy 值
     */
    generateToBoolean() {
        const vm = this.vm;

        vm.label("_to_boolean");
        vm.prologue(0, [VReg.S0]); // 保存 S0 以便使用

        const falsyLabel = "_to_bool_falsy";

        // 把参数保存到 S0，因为后面会用到 V0-V7 (都是 X0-X7，会覆盖 A0)
        vm.mov(VReg.S0, VReg.A0);

        // 检查 +0.0 (float64 的 0)
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(falsyLabel);

        // 检查 -0.0 (0x8000000000000000)
        vm.movImm64(VReg.V0, 0x8000000000000000n);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 false (0x7FF9000000000002)
        vm.movImm64(VReg.V0, JS_FALSE);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 null (0x7FFA000000000000)
        vm.movImm64(VReg.V0, JS_NULL);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 undefined (0x7FFB000000000000)
        vm.movImm64(VReg.V0, JS_UNDEFINED);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 检查 INT32 类型的 0 (0x7FF8000000000000)
        vm.movImm64(VReg.V0, JS_TAG_INT32_BASE);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq(falsyLabel);

        // 注意: NaN (0x7FF8000000000000) 已经被上面的 INT32_BASE 捕获
        // 其他 NaN-boxed 值 (0x7FF9, 0x7FFA, 0x7FFB, 0x7FFC) 也已在上面处理
        // 所以这里不需要额外的 NaN 检查

        // 检查数据段字符串指针（非 NaN-boxed 的原始字符串指针）
        // 数据段字符串指针的高16位通常是 0x1000 或 0x1001
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.cmpImm(VReg.V0, 0x1000);
        vm.jeq("_to_bool_check_data_str");
        vm.cmpImm(VReg.V0, 0x1001);
        vm.jeq("_to_bool_check_data_str");
        // 也检查值是否看起来像一个合理的地址（小于 0x7FF0）
        // data 段地址在 macOS 上通常是 0x100008xxx
        vm.movImm64(VReg.V0, 0x100000000n);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_to_bool_skip_data_str");
        vm.movImm64(VReg.V0, 0x200000000n);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_to_bool_check_data_str");
        vm.label("_to_bool_skip_data_str");

        // 检查 NaN-boxed 空字符串：高 16 位是 0x7FFC
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.movImm(VReg.V1, 0x7ffc);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne("_to_bool_truthy"); // 不是字符串，是 truthy

        // 是 NaN-boxed 字符串，检查是否为空
        // 提取低 48 位作为字符串指针并符号扩展
        vm.movImm64(VReg.V0, 0x0000ffffffffffffn);
        vm.and(VReg.V0, VReg.S0, VReg.V0);
        vm.shlImm(VReg.V0, VReg.V0, 16);
        vm.sarImm(VReg.V0, VReg.V0, 16);
        vm.jmp("_to_bool_check_str_empty");

        // 数据段字符串检查入口
        vm.label("_to_bool_check_data_str");
        vm.mov(VReg.V0, VReg.S0); // V0 = data segment pointer

        // 检查字符串是否为空
        vm.label("_to_bool_check_str_empty");
        // 加载第一个字节
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 0);
        vm.jeq(falsyLabel); // 空字符串是 falsy
        // 非空字符串，继续到 truthy

        vm.label("_to_bool_truthy");
        vm.movImm(VReg.RET, 1);
        vm.epilogue([VReg.S0], 0);

        vm.label(falsyLabel);
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0], 0);
    }

    /**
     * _number_coerce: 将任意 JavaScript 值转换为数字
     * 输入: A0 = JSValue
     * 输出: RET = float64 位模式的数字
     *
     * ECMAScript ToNumber 转换规则:
     * - undefined → NaN
     * - null → +0
     * - boolean: true → 1, false → 0
     * - number → itself
     * - string → 调用 _str_to_num 转换
     * - symbol → TypeError (简化: 返回 NaN)
     * - bigint → the bigint value (简化: 返回 NaN)
     * - object → ToNumber(ToPrimitive(obj)) (简化: 返回 NaN)
     */
    generateNumberCoerce() {
        const vm = this.vm;

        vm.label("_number_coerce");
        vm.prologue(64, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);


        // 检查是否是 undefined (0x7FFB000000000000)
        vm.movImm64(VReg.V0, JS_UNDEFINED);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq("_num_coerce_undefined");

        // 检查是否是 null (0x7FFA000000000000)
        vm.movImm64(VReg.V0, JS_NULL);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq("_num_coerce_null");

        // 检查是否是 boolean (0x7FF9000000000000 + offset)
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.movImm(VReg.V1, 0x7FF9);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_num_coerce_bool");

        // 检查是否是 int32 (tag 0, bits 48-63 == 0x7FF8)
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.movImm(VReg.V1, 0x7FF8);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jeq("_num_coerce_int32");

        // 检查是否是堆上的 Number 对象（block_ptr 或 user_ptr）
        vm.lea(VReg.V0, "_heap_base");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_num_coerce_check_string_or_float");

        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_num_coerce_check_string_or_float");

        // 优先按 user_ptr 识别：reg - 16 处是 type，reg - 8 处是 value
        vm.addImm(VReg.V1, VReg.V0, 16);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jlt("_num_coerce_heap_check_block");
        vm.subImm(VReg.V1, VReg.S0, 16);
        vm.load(VReg.V2, VReg.V1, 0);
        vm.cmpImm(VReg.V2, TYPE_NUMBER);
        vm.jeq("_num_coerce_heap_number_int_user");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jeq("_num_coerce_heap_number_float_user");

        vm.label("_num_coerce_heap_check_block");
        vm.load(VReg.V2, VReg.S0, 0);
        vm.cmpImm(VReg.V2, TYPE_NUMBER);
        vm.jeq("_num_coerce_heap_number_int_block");
        vm.cmpImm(VReg.V2, TYPE_FLOAT64);
        vm.jeq("_num_coerce_heap_number_float_block");

        vm.label("_num_coerce_check_string_or_float");
        // 检查是否是 data segment pointer (字符串) - 必须在 float64 检查之前！
        // 因为 data pointer 的高 16 位是 0x1000 或 0x1001，小于 0x7FF8
        // 如果先检查 float64，会错误地将 data pointer 当作 float 处理
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.cmpImm(VReg.V0, 0x1000);
        vm.jeq("_num_coerce_string");
        vm.cmpImm(VReg.V0, 0x1001);
        vm.jeq("_num_coerce_string");
        vm.cmpImm(VReg.V0, 0x7FFC);
        vm.jeq("_num_coerce_string");

        // raw float64 的高 16 位不在 [0x7FF8, 0x7FFF] 这个 tagged 区间内。
        // 直接用区间判断，避免依赖带符号/无符号语义不稳定的技巧。
        vm.shrImm(VReg.V1, VReg.S0, 48);
        vm.cmpImm(VReg.V1, 0x7FF8);
        vm.jlt("_num_coerce_float");
        vm.cmpImm(VReg.V1, 0x7FFF);
        vm.jgt("_num_coerce_float");
        vm.jmp("_num_coerce_nan");

        vm.label("_num_coerce_undefined");
        // undefined → NaN
        vm.movImm64(VReg.RET, 0x7ff8000000000000n);
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_null");
        // null → +0
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_bool");
        // boolean → 1 or 0
        // JS_FALSE = 0x7FF9000000000002 (payload 2) → 应该返回 0
        // JS_TRUE = 0x7FF9000000000001 (payload 1) → 应该返回 1
        // 检查是否是 JS_FALSE (payload = 2)
        vm.movImm64(VReg.V0, JS_FALSE);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jeq("_num_coerce_false");
        // 否则是 JS_TRUE → 返回 1
        vm.movImm(VReg.RET, 1); // int 1, will be returned as float
        vm.scvtf(0, VReg.RET); // FP0 = float(1)
        vm.fmovToInt(VReg.RET, 0); // RET = float64 bits (1.0)
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_false");
        // false → 0
        vm.movImm(VReg.RET, 0); // int 0
        vm.scvtf(0, VReg.RET); // FP0 = float(0)
        vm.fmovToInt(VReg.RET, 0); // RET = float64 bits (0.0)
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_int32");
        // int32 → 转换为 float
        vm.movImm64(VReg.V1, 0xFFFFFFFFn);
        vm.and(VReg.V0, VReg.S0, VReg.V1); // V0 = low 32 bits
        // 符号扩展: (V0 << 32) >> 32
        vm.shlImm(VReg.V0, VReg.V0, 32);
        vm.sarImm(VReg.V0, VReg.V0, 32);
        vm.scvtf(0, VReg.V0); // FP0 = float(V0)
        vm.fmovToInt(VReg.RET, 0); // RET = float64 bits
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_heap_number_int_user");
        vm.subImm(VReg.V1, VReg.S0, 8);
        vm.load(VReg.V0, VReg.V1, 0);
        vm.scvtf(0, VReg.V0);
        vm.fmovToInt(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_heap_number_float_user");
        vm.subImm(VReg.V1, VReg.S0, 8);
        vm.load(VReg.RET, VReg.V1, 0);
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_heap_number_int_block");
        vm.load(VReg.V0, VReg.S0, 8);
        vm.scvtf(0, VReg.V0);
        vm.fmovToInt(VReg.RET, 0);
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_heap_number_float_block");
        vm.load(VReg.RET, VReg.S0, 8);
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_float");
        // float64 已经是我们需要的格式
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_string");
        // 字符串 → 调用 _str_to_num
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_str_to_num");
        vm.epilogue([VReg.S0, VReg.S1], 64);

        vm.label("_num_coerce_nan");
        // NaN
        vm.movImm64(VReg.RET, 0x7ff8000000000000n);
        vm.epilogue([VReg.S0, VReg.S1], 64);
    }

    /**
     * _strict_eq: 严格相等比较 (===)
     * 输入: A0 = JSValue x, A1 = JSValue y
     * 输出: RET = JS_TRUE 或 JS_FALSE
     *
     * 规则:
     * 1. 如果类型不同，返回 false
     * 2. 如果类型相同，比较值/引用
     */
    generateStrictEq() {
        const vm = this.vm;

        vm.label("_strict_eq");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // 保存参数
        vm.mov(VReg.S0, VReg.A0); // x
        vm.mov(VReg.S1, VReg.A1); // y

        // ========== 检查类型是否相同 ==========
        // 提取高 16 位检查是否为 float (high16 < 0x7FF8)
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.shrImm(VReg.V1, VReg.S1, 48);
        
        // 如果两个高 16 位都小于 0x7FF8，都是 float
        vm.movImm(VReg.V2, 0x7ff8);
        vm.cmp(VReg.V0, VReg.V2);
        vm.jlt("_strict_eq_x_float");
        
        // x 不是 float，检查 y 是否为 float
        vm.cmp(VReg.V1, VReg.V2);
        vm.jlt("_strict_eq_false"); // x tagged, y float -> 不同类型
        
        // 两个都是 tagged，比较 tag (high16 & 7)
        vm.andImm(VReg.V0, VReg.V0, 7);
        vm.andImm(VReg.V1, VReg.V1, 7);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne("_strict_eq_false");

        // Tag 相同，继续比较
        // Tag 0: int32 - 比较 payload
        vm.cmpImm(VReg.V0, 0);
        vm.jne("_strict_eq_check_tag1");
        // int32: 提取 payload 并比较
        vm.movImm64(VReg.V2, JS_PAYLOAD_MASK);
        vm.and(VReg.V2, VReg.S0, VReg.V2);
        vm.movImm64(VReg.V3, JS_PAYLOAD_MASK); // 重新加载掩码，或者复用 V2
        vm.and(VReg.V3, VReg.S1, VReg.V3);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq("_strict_eq_true");
        vm.jmp("_strict_eq_false");

        vm.label("_strict_eq_check_tag1");
        // Tag 1: boolean - 比较 payload
        vm.cmpImm(VReg.V0, 1);
        vm.jne("_strict_eq_check_tag4");
        vm.movImm64(VReg.V2, JS_PAYLOAD_MASK);
        vm.and(VReg.V2, VReg.S0, VReg.V2);
        vm.movImm64(VReg.V3, JS_PAYLOAD_MASK);
        vm.and(VReg.V3, VReg.S1, VReg.V3);
        // 布尔值比较: 提取最低位比较
        vm.andImm(VReg.V2, VReg.V2, 1);
        vm.andImm(VReg.V3, VReg.V3, 1);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq("_strict_eq_true");
        vm.jmp("_strict_eq_false");

        vm.label("_strict_eq_check_tag4");
        // Tag 4: string - 比较指针
        vm.cmpImm(VReg.V0, 4);
        vm.jne("_strict_eq_check_tag5");
        vm.movImm64(VReg.V2, JS_PAYLOAD_MASK);
        vm.and(VReg.V2, VReg.S0, VReg.V2);
        vm.movImm64(VReg.V3, JS_PAYLOAD_MASK);
        vm.and(VReg.V3, VReg.S1, VReg.V3);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq("_strict_eq_true");
        vm.jmp("_strict_eq_false");

        vm.label("_strict_eq_check_tag5");
        // Tag 5: object - 比较指针
        vm.cmpImm(VReg.V0, 5);
        vm.jne("_strict_eq_check_tag6");
        vm.movImm64(VReg.V2, JS_PAYLOAD_MASK);
        vm.and(VReg.V2, VReg.S0, VReg.V2);
        vm.movImm64(VReg.V3, JS_PAYLOAD_MASK);
        vm.and(VReg.V3, VReg.S1, VReg.V3);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq("_strict_eq_true");
        vm.jmp("_strict_eq_false");

        vm.label("_strict_eq_check_tag6");
        // Tag 6: array - 比较指针
        vm.cmpImm(VReg.V0, 6);
        vm.jne("_strict_eq_check_tag7");
        vm.movImm64(VReg.V2, JS_PAYLOAD_MASK);
        vm.and(VReg.V2, VReg.S0, VReg.V2);
        vm.movImm64(VReg.V3, JS_PAYLOAD_MASK);
        vm.and(VReg.V3, VReg.S1, VReg.V3);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq("_strict_eq_true");
        vm.jmp("_strict_eq_false");

        vm.label("_strict_eq_check_tag7");
        // Tag 7: function - 比较指针
        vm.cmpImm(VReg.V0, 7);
        vm.jne("_strict_eq_check_tag2");
        vm.movImm64(VReg.V2, JS_PAYLOAD_MASK);
        vm.and(VReg.V2, VReg.S0, VReg.V2);
        vm.movImm64(VReg.V3, JS_PAYLOAD_MASK);
        vm.and(VReg.V3, VReg.S1, VReg.V3);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jeq("_strict_eq_true");
        vm.jmp("_strict_eq_false");

        vm.label("_strict_eq_check_tag2");
        // Tag 2: null - 恒相等
        vm.cmpImm(VReg.V0, 2);
        vm.jne("_strict_eq_check_tag3");
        vm.jmp("_strict_eq_true");

        vm.label("_strict_eq_check_tag3");
        // Tag 3: undefined - 恒相等
        vm.jmp("_strict_eq_true");

        // ========== Float 比较 (无 tag) ==========
        vm.label("_strict_eq_x_float");
        // x 是 float，检查 y 是否也是 float
        vm.cmp(VReg.V1, VReg.V2);
        vm.jge("_strict_eq_false"); // x float, y tagged -> 不同类型
        
        // 两个都是 float，直接位比较 (IEEE 754)
        vm.cmp(VReg.S0, VReg.S1);
        vm.jeq("_strict_eq_true");
        vm.jmp("_strict_eq_false");

        vm.label("_strict_eq_false");
        vm.movImm64(VReg.RET, JS_FALSE);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);

        vm.label("_strict_eq_true");
        vm.movImm64(VReg.RET, JS_TRUE);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 64);
    }

    /**
     * _to_int32: 将 JSValue 转换为 32 位有符号整数 (ToInt32)
     * 输入: A0 = JSValue
     * 输出: RET = 32 位有符号整数 (符号扩展到 64 位)
     */
    generateToInt32() {
        const vm = this.vm;
        vm.label("_to_int32");
        vm.prologue(32, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);


        // 1. 检查是否已经是 NaN-boxed Int32 (tag 0x7FF8)
        vm.shrImm(VReg.V0, VReg.S0, 48);
        vm.movImm(VReg.V1, 0x7FF8);
        vm.cmp(VReg.V0, VReg.V1);
        vm.jne("_to_int32_not_int32");

        // 是 Int32: 提取低 32 位并符号扩展
        vm.movImm64(VReg.V2, 0xFFFFFFFFn);
        vm.and(VReg.RET, VReg.S0, VReg.V2);
        vm.shlImm(VReg.RET, VReg.RET, 32);
        vm.sarImm(VReg.RET, VReg.RET, 32);
        vm.epilogue([VReg.S0], 32);

        vm.label("_to_int32_not_int32");
        // 2. 调用 _number_coerce 获取 float 模式
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_number_coerce"); // RET = float bits


        // 将 float64 位模式移动到 FP 寄存器
        vm.fmovToFloat(0, VReg.RET);

        // 检查 NaN/Infinity: 指数部分全 1 (0x7FF)
        vm.shrImm(VReg.V1, VReg.RET, 52);
        vm.andImm(VReg.V1, VReg.V1, 0x7FF);
        vm.cmpImm(VReg.V1, 0x7FF);
        vm.jeq("_to_int32_zero");

        // FCVTZS: 浮点转有符号整数 (截断)
        vm.fcvtzs(VReg.RET, 0); // RET = (int64)FP0


        // 仅保留低 32 位并符号扩展 (ECMAScript ToInt32 语义)
        vm.movImm64(VReg.V1, 0xFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);
        vm.shlImm(VReg.RET, VReg.RET, 32);
        vm.sarImm(VReg.RET, VReg.RET, 32);

        vm.epilogue([VReg.S0], 32);

        vm.label("_to_int32_zero");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0], 32);
    }

    /**
     * _to_uint32: 将 JSValue 转换为 32 位无符号整数 (ToUint32)
     * 输入: A0 = JSValue
     * 输出: RET = 32 位无符号整数 (零扩展到 64 位)
     */
    generateToUint32() {
        const vm = this.vm;
        vm.label("_to_uint32");
        vm.prologue(32, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);
        vm.call("_number_coerce"); // RET = raw float bits

        vm.fmovToFloat(0, VReg.RET);

        // 检查 NaN/Infinity
        vm.shrImm(VReg.V1, VReg.RET, 52);
        vm.andImm(VReg.V1, VReg.V1, 0x7FF);
        vm.cmpImm(VReg.V1, 0x7FF);
        vm.jeq("_to_uint32_zero");

        // 转为 64 位整数
        vm.fcvtzs(VReg.RET, 0);

        // 取低 32 位 (零扩展)
        vm.movImm64(VReg.V1, 0xFFFFFFFFn);
        vm.and(VReg.RET, VReg.RET, VReg.V1);

        vm.epilogue([VReg.S0], 32);

        vm.label("_to_uint32_zero");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0], 32);
    }
}
