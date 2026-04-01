// JSBin 运行时 - process 全局对象
// 提供 Node.js 兼容的 process 对象

import { VReg } from "../../vm/index.js";

export class ProcessGenerator {
    constructor(vm, ctx, os, arch = "arm64") {
        this.vm = vm;
        this.ctx = ctx;
        this.os = os;
        this.arch = arch;
    }

    generate() {
        this.generateProcessInit();
        this.generateArgvInit();
        this.generatePrintCstr(); // 辅助调试函数
        this.generateGetProcess();
        // Register "*" string for namespace import detection
        this.vm.asm.registerRuntimeString("_str_star", "*");
        this.generateGetModuleExport();
        this.generateCreateBuiltinObject();
    }

    // __get_process: 获取 process 全局对象
    generateGetProcess() {
        const vm = this.vm;
        vm.label("_user___get_process");
        vm.prologue(0, []);
        vm.lea(VReg.V1, "_process_global");
        vm.load(VReg.RET, VReg.V1, 0);
        vm.epilogue([], 0);
    }

    // _get_module_export: 从模块注册表获取导出值
    // A0 = moduleIndex, A1 = exportName (C string)
    // Returns: JSValue of the exported value
    generateGetModuleExport() {
        const vm = this.vm;
        vm.label("_get_module_export");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        // S0 = moduleIndex
        vm.mov(VReg.S0, VReg.A0);
        // S1 = exportName
        vm.mov(VReg.S1, VReg.A1);

        // 计算模块指针偏移: _module_registry + moduleIndex * 8
        vm.shl(VReg.S2, VReg.S0, 3); // S2 = moduleIndex * 8
        vm.lea(VReg.V0, "_module_registry");
        vm.add(VReg.V0, VReg.V0, VReg.S2);

        // 加载模块指针
        vm.load(VReg.S2, VReg.V0, 0);
        // S2 = module object pointer

        // 检查模块指针是否为 0
        vm.cmpImm(VReg.S2, 0);
        vm.jeq("_get_module_export_null");

        // 检查是否为 namespace import (exportName == "*")
        // Compare S1 (exportName) with "_str_star"
        vm.lea(VReg.V1, "_str_star");
        vm.mov(VReg.A0, VReg.S1);
        vm.mov(VReg.A1, VReg.V1);
        vm.call("_strcmp");
        // RET = 0 if equal, non-zero otherwise
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_get_module_export_namespace");

        // Named export: call _object_get(module, exportName)
        vm.label("_get_module_export_object_get");
        // _module_registry stores raw object pointers, but _object_get expects a
        // tagged JS object value.
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.A0, VReg.S2, VReg.V1);
        vm.movImm64(VReg.V1, 0x7ffd000000000000n);
        vm.or(VReg.A0, VReg.A0, VReg.V1);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_get");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // Namespace import: return the module object directly (tagged as JS object)
        vm.label("_get_module_export_namespace");
        // Tag V0 as JS object: 0x7FFD000000000000 | pointer
        vm.movImm64(VReg.V1, 0x0000ffffffffffffn);
        vm.and(VReg.V0, VReg.S2, VReg.V1);  // V0 = pointer
        vm.movImm64(VReg.V1, 0x7ffd000000000000n);
        vm.or(VReg.RET, VReg.V0, VReg.V1);  // RET = tagged object
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        vm.label("_get_module_export_null");
        vm.movImm(VReg.RET, 0); // Return JS_UNDEFINED
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    // _create_builtin_object: Create a heap-allocated object for shim module builtins
    // A0 = C string pointer (object name), A1 = number of methods
    // Returns: pointer to heap-allocated object
    generateCreateBuiltinObject() {
        const vm = this.vm;
        vm.label("_create_builtin_object");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // S0 = name (unused for now)
        vm.mov(VReg.S1, VReg.A1); // S1 = method count

        // Allocate object: OBJECT_HEADER_SIZE + (methodCount + 4) * PROP_SIZE
        // PROP_SIZE = 16 (key + value), OBJECT_HEADER_SIZE = 24 (type + count + proto)
        vm.addImm(VReg.A0, VReg.S1, 4); // extra slots for type tag
        vm.shl(VReg.A0, VReg.A0, 4); // * 16 (PROP_SIZE)
        vm.addImm(VReg.A0, VReg.A0, 24); // + OBJECT_HEADER_SIZE
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET); // S1 = object pointer

        // Set type to TYPE_OBJECT (2)
        vm.movImm(VReg.A0, 2);
        vm.store(VReg.S1, 0, VReg.A0);

        // Set property count to 0 (methods will be added via os.xxx = function() {})
        vm.movImm(VReg.A0, 0);
        vm.store(VReg.S1, 8, VReg.A0);

        // Set __proto__ to null
        vm.movImm(VReg.A0, 0);
        vm.store(VReg.S1, 16, VReg.A0);

        // Return object pointer in RET (S1)
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // _print_cstr: 打印 C 字符串（以 null 结尾）
    // A0 = C 字符串指针
    generatePrintCstr() {
        const vm = this.vm;

        vm.label("_print_cstr");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // S0 = 字符串指针

        // 计算长度
        vm.movImm(VReg.S1, 0); // S1 = 长度
        vm.label("_print_cstr_len_loop");
        vm.loadByte(VReg.V0, VReg.S0, 0);
        vm.add(VReg.V0, VReg.S0, VReg.S1);
        vm.loadByte(VReg.V0, VReg.V0, 0);
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_print_cstr_len_done");
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp("_print_cstr_len_loop");

        vm.label("_print_cstr_len_done");
        // 调用 write 系统调用
        vm.movImm(VReg.A0, 1); // fd = 1 (stdout)
        vm.mov(VReg.A1, VReg.S0); // buf = 字符串指针
        vm.mov(VReg.A2, VReg.S1); // count = 长度

        // 系统调用号：
        // macOS ARM64/x64: 4
        // Linux ARM64: 64
        // Linux x64: 1
        if (this.os === "macos") {
            vm.syscall(4);
        } else if (this.os === "linux") {
            vm.syscall(this.arch === "arm64" ? 64 : 1);
        }

        // 打印换行符
        vm.movImm(VReg.V0, 10); // '\n'
        vm.store(VReg.SP, -16, VReg.V0);
        vm.movImm(VReg.A0, 1);
        vm.subImm(VReg.A1, VReg.SP, 16);
        vm.movImm(VReg.A2, 1);
        if (this.os === "macos") {
            vm.syscall(4);
        } else if (this.os === "linux") {
            vm.syscall(this.arch === "arm64" ? 64 : 1);
        }

        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // _process_init: 初始化 process 对象
    // 在程序启动时调用，传入 argc 和 argv
    // A0 = argc, A1 = argv (指向 char* 数组的指针)
    generateProcessInit() {
        const vm = this.vm;

        vm.label("_process_init");
        // [SP+0]=FP, [SP+8]=LR
        vm.prologue(48, []);

        // 确保 argc 是 32 位的（dyld 传入 X0，高 32 位可能有垃圾）
        vm.movImm64(VReg.V4, 0xffffffffn);
        vm.and(VReg.A0, VReg.A0, VReg.V4);

        // 保存 argc 和 argv
        vm.store(VReg.SP, 16, VReg.A0); // [SP+16] = argc
        vm.store(VReg.SP, 24, VReg.A1); // [SP+24] = argv

        // 创建 process 对象
        vm.movImm(VReg.A0, 64);
        vm.call("_alloc");
        vm.store(VReg.SP, 32, VReg.RET); // [SP+32] = process 对象

        // 设置对象类型标记
        vm.load(VReg.V0, VReg.SP, 32); // V0 = process
        vm.movImm(VReg.V1, 2); // TYPE_OBJECT = 2
        vm.store(VReg.V0, 0, VReg.V1);

        // 保存 process 对象到全局变量
        vm.lea(VReg.V1, "_process_global");
        vm.load(VReg.V0, VReg.SP, 32);
        vm.store(VReg.V1, 0, VReg.V0);

        // 创建 argv 数组
        vm.load(VReg.A0, VReg.SP, 16); // argc
        vm.load(VReg.A1, VReg.SP, 24); // argv
        vm.call("_process_create_argv");
        // RET = argv 数组

        // 保存 argv 数组到栈上临时位置
        vm.store(VReg.SP, 40, VReg.RET);

        // 1. 设置 argv
        vm.load(VReg.A0, VReg.SP, 32); // obj (raw ptr)
        vm.lea(VReg.A1, this.vm.asm.addString("argv"));
        vm.load(VReg.A2, VReg.SP, 40); // value (boxed array)
        vm.call("_object_set");

        // 2. 设置 platform
        vm.load(VReg.A0, VReg.SP, 32); // obj (raw ptr)
        vm.lea(VReg.A1, this.vm.asm.addString("platform"));
        vm.lea(VReg.V1, "_str_macos");
        vm.mov(VReg.A0, VReg.V1);
        vm.call("_js_box_string");
        vm.mov(VReg.A2, VReg.RET);
        vm.load(VReg.A0, VReg.SP, 32); // reload obj
        vm.lea(VReg.A1, this.vm.asm.addString("platform"));
        vm.call("_object_set");

        // 3. 设置 arch
        vm.load(VReg.A0, VReg.SP, 32); // obj (raw ptr)
        vm.lea(VReg.A1, this.vm.asm.addString("arch"));
        vm.lea(VReg.V1, "_str_arm64");
        vm.mov(VReg.A0, VReg.V1);
        vm.call("_js_box_string");
        vm.mov(VReg.A2, VReg.RET);
        vm.load(VReg.A0, VReg.SP, 32); // reload obj
        vm.lea(VReg.A1, this.vm.asm.addString("arch"));
        vm.call("_object_set");

        // 返回 process 对象 (从全局加载，确保是正确的装箱值或指针)
        vm.lea(VReg.V1, "_process_global");
        vm.load(VReg.RET, VReg.V1, 0);
        vm.epilogue([], 48);
    }

    // _process_create_argv: 创建 argv 数组
    // A0 = argc, A1 = argv (char**)
    // 返回 JS Array 对象
    generateArgvInit() {
        const vm = this.vm;

        vm.label("_process_create_argv");
        // 栈布局:
        // ARM64 frame: [SP+0]=FP, [SP+8]=LR
        // [SP+16] = argc
        // [SP+24] = argv (char**)
        // [SP+32] = JS 数组
        // [SP+40] = 当前索引 i
        // [SP+48] = 临时保存字符串
        vm.prologue(64, []);

        // 保存参数 (偏移 16)
        vm.store(VReg.SP, 16, VReg.A0); // [SP+16] = argc
        vm.store(VReg.SP, 24, VReg.A1); // [SP+24] = argv

        // 创建空数组
        vm.movImm(VReg.A0, 0);
        vm.call("_array_new_with_size");
        vm.store(VReg.SP, 32, VReg.RET); // [SP+32] = 数组

        // 初始化索引 i = 0
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.SP, 40, VReg.V0); // [SP+40] = i = 0

        // 循环: for (i = 0; i < argc; i++)
        vm.label("_argv_loop");
        vm.load(VReg.V0, VReg.SP, 40); // V0 = i
        vm.load(VReg.V1, VReg.SP, 16); // V1 = argc
        vm.cmp(VReg.V0, VReg.V1);
        vm.jge("_argv_done");

        // 获取 argv[i]: char* ptr = argv[i]
        vm.load(VReg.V0, VReg.SP, 40); // V0 = i
        vm.shl(VReg.V0, VReg.V0, 3); // V0 = i * 8
        vm.load(VReg.V1, VReg.SP, 24); // V1 = argv
        vm.add(VReg.V1, VReg.V1, VReg.V0); // V1 = &argv[i]
        vm.load(VReg.V0, VReg.V1, 0); // V0 = argv[i]

        // 转换字符串
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_js_box_string");
        vm.store(VReg.SP, 48, VReg.RET); // [SP+48] = boxed str

        // 加载数组到 V0，再设置参数
        vm.load(VReg.V0, VReg.SP, 32); // V0 = 数组
        vm.load(VReg.V1, VReg.SP, 48); // V1 = boxed str
        vm.mov(VReg.A1, VReg.V1);
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_array_push");
        vm.store(VReg.SP, 32, VReg.RET); // 保存新数组 (可能扩容)

        // i++
        vm.load(VReg.V0, VReg.SP, 40);
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.store(VReg.SP, 40, VReg.V0);

        vm.jmp("_argv_loop");

        vm.label("_argv_done");
        // 返回数组
        vm.load(VReg.RET, VReg.SP, 32);
        vm.epilogue([], 64);
    }

    // 生成数据段
    generateDataSection(asm) {
        // process 全局变量存储 (已由 allocator.js 统一添加)
        // 异常值存储
        asm.addDataLabel("_exception_value");
        asm.addDataQword(0);

        // 异常待处理标志 (用于跨函数异常传播)
        // 0 = 无异常, 1 = 有待处理异常
        asm.addDataLabel("_exception_pending");
        asm.addDataQword(0);

        // Default platform/arch strings for __get_process() fallback
        // These are used by the __get_process() compiler fallback when
        // runtime modules call it at import time (before _process_init).
        const addCString = (label, str) => {
            asm.addDataLabel(label);
            for (let i = 0; i < str.length; i++) asm.addDataByte(str.charCodeAt(i));
            asm.addDataByte(0);
        };
        addCString("_str_macos", "macos");
        addCString("_str_arm64", "arm64");
    }
}
