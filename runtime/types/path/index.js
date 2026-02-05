// JSBin Path 运行时
// 提供 Path 模块操作的运行时实现

import { VReg } from "../../../vm/registers.js";

export class PathGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateGetStringContent();
        this.generatePathResolve();
        this.generatePathJoin();
        this.generatePathDirname();
        this.generatePathBasename();
        this.generatePathIsAbsolute();
    }

    /**
     * _get_string_content(ptr) -> 返回字符串内容指针
     * 如果是堆字符串（有16字节头），返回 ptr + 16
     * 如果是数据段字符串，直接返回 ptr
     */
    generateGetStringContent() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_get_string_content");
        // A0 = 字符串指针（可能是堆字符串或数据段字符串）

        // 检查是否在堆范围内
        vm.lea(VReg.V1, "_heap_base");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.A0, VReg.V1);
        vm.jlt("_get_string_content_data"); // < heap_base，是数据段字符串

        vm.lea(VReg.V1, "_heap_ptr");
        vm.load(VReg.V1, VReg.V1, 0);
        vm.cmp(VReg.A0, VReg.V1);
        vm.jge("_get_string_content_data"); // >= heap_ptr，不在堆范围内

        // 在堆范围内，检查类型标记
        vm.load(VReg.V2, VReg.A0, 0);
        vm.andImm(VReg.V2, VReg.V2, 0xff);
        vm.movImm(VReg.V3, TYPE_STRING);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jne("_get_string_content_data");

        // 是堆字符串，返回 ptr + 16
        vm.addImm(VReg.RET, VReg.A0, 16);
        vm.ret();

        vm.label("_get_string_content_data");
        // 数据段字符串，直接返回
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    /**
     * path.resolve([...paths])
     * 将路径解析为绝对路径
     * 如果第一个参数是相对路径，则基于 cwd() 解析
     * 支持两个参数: path.resolve(base, relative)
     * A0 = base 或 path, A1 = relative (可选，如果 A1 非 0 则拼接)
     */
    generatePathResolve() {
        const vm = this.vm;
        vm.label("_path_resolve");

        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // 保存参数
        vm.mov(VReg.S0, VReg.A0); // base/path
        vm.mov(VReg.S3, VReg.A1); // relative (可选)

        // 先处理第一个参数
        // 解箱获取字符串指针
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_get_string_content");
        vm.mov(VReg.S1, VReg.RET); // S1 = base/path 内容指针

        // 检查是否是绝对路径（以 '/' 开头）
        vm.loadByte(VReg.V0, VReg.S1, 0);
        vm.cmpImm(VReg.V0, 47); // '/'
        vm.jeq("_path_resolve_base_absolute");

        // 相对路径：需要拼接 cwd + "/" + path
        vm.call("_process_cwd");
        vm.mov(VReg.S2, VReg.RET); // S2 = cwd (boxed)

        // 解箱 cwd
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);

        // 拼接 cwd + "/"
        vm.lea(VReg.A1, "_str_slash");
        vm.call("_strconcat");
        vm.mov(VReg.A0, VReg.RET);

        // 解箱原始 path
        vm.push(VReg.A0);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.A1, VReg.RET);
        vm.pop(VReg.A0);

        // 拼接 (cwd + "/") + path
        vm.call("_strconcat");
        vm.mov(VReg.S2, VReg.RET); // S2 = 解析后的 base（未 boxed）
        vm.jmp("_path_resolve_check_second");

        vm.label("_path_resolve_base_absolute");
        // 绝对路径：解箱保存
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.S2, VReg.RET); // S2 = 解析后的 base（未 boxed）

        vm.label("_path_resolve_check_second");
        // 检查第二个参数是否存在
        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_path_resolve_done_box");

        // 第二个参数存在，检查是否是 undefined (0x7FFB000000000000)
        vm.movImm64(VReg.V1, "0x7ffb000000000000");
        vm.cmp(VReg.S3, VReg.V1);
        vm.jeq("_path_resolve_done_box");

        // 解箱第二个参数
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_get_string_content");
        vm.mov(VReg.S1, VReg.RET); // S1 = relative 内容指针

        // 检查第二个参数是否是绝对路径
        vm.loadByte(VReg.V0, VReg.S1, 0);
        vm.cmpImm(VReg.V0, 47); // '/'
        vm.jeq("_path_resolve_second_absolute");

        // 第二个参数是相对路径，拼接 base + "/" + relative
        vm.mov(VReg.A0, VReg.S2);
        vm.lea(VReg.A1, "_str_slash");
        vm.call("_strconcat");
        vm.push(VReg.RET);
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_js_unbox");
        vm.mov(VReg.A1, VReg.RET);
        vm.pop(VReg.A0);
        vm.call("_strconcat");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_js_box_string");
        vm.jmp("_path_resolve_done");

        vm.label("_path_resolve_second_absolute");
        // 第二个参数是绝对路径，直接返回第二个参数
        vm.mov(VReg.RET, VReg.S3);
        vm.jmp("_path_resolve_done");

        vm.label("_path_resolve_done_box");
        // 只有第一个参数，box 并返回
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_js_box_string");

        vm.label("_path_resolve_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    generatePathJoin() {
        const vm = this.vm;
        vm.label("_path_join");
        // path.join(a, b)
        // A0 = a, A1 = b
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        // Concat a + "/" + b
        vm.mov(VReg.A0, VReg.S0);
        vm.lea(VReg.A1, "_str_slash");
        vm.call("_strconcat");
        vm.mov(VReg.A0, VReg.RET);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strconcat");

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    generatePathDirname() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_path_dirname");
        // path.dirname(path) - 返回目录名
        // 查找最后一个 '/' 的位置，返回其之前的部分
        // 例如："/a/b/c.js" -> "/a/b"
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // A0 可能是 NaN-boxed 字符串，先 unbox
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        // 获取字符串内容指针（处理堆字符串有16字节头的情况）
        vm.call("_get_string_content");
        vm.mov(VReg.S0, VReg.RET); // S0 = path 字符串内容指针

        // 先获取字符串长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // S1 = length

        // 从后向前查找 '/'
        vm.mov(VReg.S2, VReg.S1); // S2 = i = length
        vm.label("_path_dirname_loop");
        vm.cmpImm(VReg.S2, 0);
        vm.jle("_path_dirname_not_found"); // 没找到，返回 "."

        vm.subImm(VReg.S2, VReg.S2, 1); // i--
        vm.add(VReg.V0, VReg.S0, VReg.S2);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 47); // '/'
        vm.jne("_path_dirname_loop");

        // 找到了 '/' at position S2
        // 如果是开头的 /，返回 "/"
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_path_dirname_root");

        // 分配新字符串（16 字节头 + S2 字节内容 + 1 null）
        vm.addImm(VReg.A0, VReg.S2, 17); // 16 (header) + S2 (length) + 1 (null)
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET); // S3 = 新字符串指针

        // 写入类型标记和长度
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S3, 0, VReg.V0);
        vm.store(VReg.S3, 8, VReg.S2); // 长度

        // 复制内容到 +16 位置
        vm.addImm(VReg.A0, VReg.S3, 16); // dest = result + 16
        vm.mov(VReg.A1, VReg.S0); // src
        vm.mov(VReg.A2, VReg.S2); // length
        vm.call("_memcpy");

        // 添加 null terminator
        vm.addImm(VReg.V0, VReg.S3, 16);
        vm.add(VReg.V0, VReg.V0, VReg.S2);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        // Box 成 NaN-boxed 字符串（指向带头的堆对象）
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_js_box_string");
        vm.jmp("_path_dirname_done");

        vm.label("_path_dirname_root");
        // 返回 "/" - 使用数据段字符串
        vm.lea(VReg.A0, "_str_slash");
        vm.call("_js_box_string");
        vm.jmp("_path_dirname_done");

        vm.label("_path_dirname_not_found");
        // 没找到，返回 "." - 使用数据段字符串
        vm.lea(VReg.A0, "_str_dot");
        vm.call("_js_box_string");

        vm.label("_path_dirname_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);
    }

    generatePathBasename() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_path_basename");
        // path.basename(path) - 返回文件名
        // 查找最后一个 '/' 的位置，返回其之后的部分
        // 例如："/a/b/c.js" -> "c.js"
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5]);

        // A0 可能是 NaN-boxed 字符串，先 unbox
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        // 获取字符串内容指针（处理堆字符串有16字节头的情况）
        vm.call("_get_string_content");
        vm.mov(VReg.S0, VReg.RET); // S0 = path 字符串内容指针

        // 先获取字符串长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S1, VReg.RET); // S1 = length

        // 从后向前查找 '/'
        vm.mov(VReg.S2, VReg.S1); // S2 = i = length
        vm.label("_path_basename_loop");
        vm.cmpImm(VReg.S2, 0);
        vm.jle("_path_basename_not_found"); // 没找到，返回整个路径

        vm.subImm(VReg.S2, VReg.S2, 1); // i--
        vm.add(VReg.V0, VReg.S0, VReg.S2);
        vm.loadByte(VReg.V1, VReg.V0, 0);
        vm.cmpImm(VReg.V1, 47); // '/'
        vm.jne("_path_basename_loop");

        // 找到了 '/' at position S2
        // 返回 S2+1 开始的部分
        vm.addImm(VReg.S2, VReg.S2, 1);
        vm.sub(VReg.S3, VReg.S1, VReg.S2); // S3 = 剩余长度

        // 分配新字符串（16 字节头 + S3 字节内容 + 1 null）
        vm.addImm(VReg.A0, VReg.S3, 17); // 16 (header) + S3 (length) + 1 (null)
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET); // S4 = 新字符串指针

        // 写入类型标记和长度
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S4, 0, VReg.V0);
        vm.store(VReg.S4, 8, VReg.S3); // 长度

        // 复制内容到 +16 位置
        vm.addImm(VReg.A0, VReg.S4, 16); // dest = result + 16
        vm.add(VReg.A1, VReg.S0, VReg.S2); // src = path + pos + 1
        vm.mov(VReg.A2, VReg.S3); // length
        vm.call("_memcpy");

        // 添加 null terminator
        vm.addImm(VReg.V0, VReg.S4, 16);
        vm.add(VReg.V0, VReg.V0, VReg.S3);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        // Box 成 NaN-boxed 字符串
        vm.mov(VReg.A0, VReg.S4);
        vm.call("_js_box_string");
        vm.jmp("_path_basename_done");

        vm.label("_path_basename_not_found");
        // 没有 /，返回整个路径
        // 需要创建一个新的堆字符串来返回
        vm.addImm(VReg.A0, VReg.S1, 17); // 16 (header) + length + 1 (null)
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET);

        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.S4, 0, VReg.V0);
        vm.store(VReg.S4, 8, VReg.S1);

        vm.addImm(VReg.A0, VReg.S4, 16);
        vm.mov(VReg.A1, VReg.S0);
        vm.mov(VReg.A2, VReg.S1);
        vm.call("_memcpy");

        vm.addImm(VReg.V0, VReg.S4, 16);
        vm.add(VReg.V0, VReg.V0, VReg.S1);
        vm.movImm(VReg.V1, 0);
        vm.storeByte(VReg.V0, 0, VReg.V1);

        vm.mov(VReg.A0, VReg.S4);
        vm.call("_js_box_string");

        vm.label("_path_basename_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4, VReg.S5], 48);
    }

    generatePathIsAbsolute() {
        const vm = this.vm;
        vm.label("_path_isAbsolute");
        // path.isAbsolute(path) - 检查是否是绝对路径
        // Unix: 以 '/' 开头
        vm.prologue(16, [VReg.S0]);

        // A0 可能是 NaN-boxed 字符串，先 unbox
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        // 获取字符串内容指针
        vm.call("_get_string_content");
        vm.mov(VReg.S0, VReg.RET);

        // 加载第一个字符
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.cmpImm(VReg.V0, 47); // '/'
        vm.jne("_path_isAbsolute_false");

        // 返回 true (NaN-boxed boolean)
        vm.movImm64(VReg.RET, "0x7ff9000000000001");
        vm.jmp("_path_isAbsolute_done");

        vm.label("_path_isAbsolute_false");
        vm.movImm64(VReg.RET, "0x7ff9000000000000");

        vm.label("_path_isAbsolute_done");
        vm.epilogue([VReg.S0], 16);
    }

    generateDataSection(asm) {
        // _str_slash 是一个普通 C 字符串（与字符串字面量格式相同）
        asm.addDataLabel("_str_slash");
        asm.addDataByte(47); // '/'
        asm.addDataByte(0); // null terminator

        asm.addDataLabel("_str_dot");
        asm.addDataByte(46); // '.'
        asm.addDataByte(0); // null terminator
    }
}
