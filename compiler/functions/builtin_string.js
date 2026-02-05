// JSBin 编译器 - String 方法编译
// 编译 toUpperCase, toLowerCase, charAt, trim, slice 等字符串方法

import { VReg } from "../../vm/index.js";

// String 方法编译 Mixin
export const StringMethodCompiler = {
    // 编译 String 方法调用
    // str.toUpperCase(), str.toLowerCase(), str.charAt(i), str.trim() 等
    compileStringMethod(obj, method, args) {
        // 先编译字符串表达式
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存原始字符串

        switch (method) {
            case "toUpperCase":
                // str.toUpperCase() - 返回新字符串
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_str_toUpperCase");
                return true;

            case "toLowerCase":
                // str.toLowerCase() - 返回新字符串
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_str_toLowerCase");
                return true;

            case "charAt":
                // str.charAt(index) - 返回单字符字符串
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    // 索引是 Number 对象，转为整数
                    this.vm.f2i(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_charAt");
                return true;

            case "charCodeAt":
                // str.charCodeAt(index) - 返回字符编码
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    // 索引是 Number 对象，转为整数
                    this.vm.f2i(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_charCodeAt");
                return true;

            case "trim":
                // str.trim() - 去除首尾空白
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_str_trim");
                return true;

            case "slice":
            case "substring":
                // str.slice(start, end) / str.substring(start, end)
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存内容指针

                // 编译 start 参数（需要转换浮点数到整数）
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    // 使用 VM 统一接口
                    this.vm.fmovToFloat(0, VReg.RET);
                    this.vm.fcvtzs(VReg.RET, 0);
                    this.vm.push(VReg.RET); // 保存 start
                } else {
                    this.vm.movImm(VReg.V0, 0);
                    this.vm.push(VReg.V0);
                }

                // 编译 end 参数（需要转换浮点数到整数）
                if (args.length > 1) {
                    this.compileExpression(args[1]);
                    // 使用 VM 统一接口
                    this.vm.fmovToFloat(0, VReg.RET);
                    this.vm.fcvtzs(VReg.RET, 0);
                    this.vm.mov(VReg.A2, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A2, -1); // -1 表示到末尾
                }

                this.vm.pop(VReg.A1); // start
                this.vm.pop(VReg.A0); // str content
                this.vm.call("_str_slice");
                return true;

            case "indexOf":
                // str.indexOf(search) - 返回索引或 -1
                // 栈上有原字符串 [str]
                // 1. 获取原字符串内容指针
                this.vm.pop(VReg.A0); // 原字符串
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容 [strContent]

                // 2. 编译并获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET); // A1 = search 内容
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 3. 调用 _str_indexOf(str, search)
                this.vm.pop(VReg.A0); // A0 = str 内容
                this.vm.call("_str_indexOf");
                // 返回值是整数，需要装箱为 Number 对象
                this.boxIntAsNumber(VReg.RET);
                return true;

            case "lastIndexOf":
                // str.lastIndexOf(search) - 返回最后出现的索引或 -1
                // 栈上有原字符串 [str]
                // 1. 获取原字符串内容指针
                this.vm.pop(VReg.A0); // 原字符串
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容 [strContent]

                // 2. 编译并获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET); // A1 = search 内容
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 3. 调用 _str_lastIndexOf(str, search)
                this.vm.pop(VReg.A0); // A0 = str 内容
                this.vm.call("_str_lastIndexOf");
                // 装箱返回值为 Number 对象
                this.boxIntAsNumber(VReg.RET);
                return true;

            case "includes":
                // str.includes(search) - 返回布尔值
                // 1. 获取原字符串内容指针
                this.vm.pop(VReg.A0); // 原字符串
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容

                // 2. 编译并获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET); // A1 = search 内容
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 3. 调用 _str_includes(str, search)
                this.vm.pop(VReg.A0); // A0 = str 内容
                this.vm.call("_str_includes");
                // 返回值已经是 NaN-boxed 布尔值
                return true;

            case "startsWith":
                // str.startsWith(search) - 返回布尔值
                // 栈上有原字符串 [str]
                // 1. 获取原字符串内容指针
                this.vm.pop(VReg.A0); // 原字符串
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容

                // 2. 编译并获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_startsWith");
                return true;

            case "endsWith":
                // str.endsWith(search) - 返回布尔值
                // 栈上有原字符串 [str]
                // 1. 获取原字符串内容指针
                this.vm.pop(VReg.A0); // 原字符串
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容

                // 2. 编译并获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_endsWith");
                return true;

            case "repeat":
                // str.repeat(count) - 重复字符串
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_repeat");
                return true;

            case "padStart":
                // str.padStart(targetLen, padString)
                if (args.length >= 2) {
                    this.compileExpression(args[0]);
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET);
                    this.vm.pop(VReg.A1);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_str_padStart");
                } else if (args.length === 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.lea(VReg.A2, "_str_space");
                    this.vm.pop(VReg.A0);
                    this.vm.call("_str_padStart");
                } else {
                    this.vm.pop(VReg.RET);
                }
                return true;

            case "padEnd":
                // str.padEnd(targetLen, padString)
                if (args.length >= 2) {
                    this.compileExpression(args[0]);
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET);
                    this.vm.pop(VReg.A1);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_str_padEnd");
                } else if (args.length === 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.lea(VReg.A2, "_str_space");
                    this.vm.pop(VReg.A0);
                    this.vm.call("_str_padEnd");
                } else {
                    this.vm.pop(VReg.RET);
                }
                return true;

            case "trimStart":
            case "trimLeft":
                // str.trimStart()
                this.vm.pop(VReg.A0);
                this.vm.call("_str_trimStart");
                return true;

            case "trimEnd":
            case "trimRight":
                // str.trimEnd()
                this.vm.pop(VReg.A0);
                this.vm.call("_str_trimEnd");
                return true;

            case "at":
                // str.at(index) - 支持负数索引
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_at");
                return true;

            case "split":
                // str.split(separator) - 返回数组
                // 先处理原字符串
                this.vm.pop(VReg.A0); // 弹出原始字符串
                this.vm.call("_getStrContent"); // 获取内容指针
                this.vm.push(VReg.RET); // 保存内容指针

                // 处理分隔符
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent"); // 分隔符也需要获取内容指针
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 恢复字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_str_split");
                return true;

            case "concat":
                // str.concat(other) - 字符串连接
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_strconcat");
                return true;

            case "match":
                // str.match(regexp) - 正则匹配
                // A0 = 字符串, A1 = RegExp
                this.vm.pop(VReg.A0); // 字符串
                if (args.length > 0) {
                    this.compileExpression(args[0]); // RegExp
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.call("_string_regexp_match");
                return true;

            case "matchAll":
                // str.matchAll(regexp) - 返回迭代器
                this.vm.pop(VReg.A0); // 字符串
                if (args.length > 0) {
                    this.compileExpression(args[0]); // RegExp
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.call("_string_regexp_matchAll");
                return true;

            case "search":
                // str.search(regexp) - 返回匹配位置索引
                this.vm.pop(VReg.A0); // 字符串
                if (args.length > 0) {
                    this.compileExpression(args[0]); // RegExp
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.call("_string_regexp_search");
                // 返回整数，需要装箱为 Number
                this.boxIntAsNumber(VReg.RET);
                return true;
        }

        // 未处理的方法，弹出栈
        this.vm.pop(VReg.V0);
        return false;
    },
};
