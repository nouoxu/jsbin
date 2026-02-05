// JSBin Process 运行时
// 提供 process 模块操作的运行时实现

import { VReg } from "../../../vm/registers.js";
import { Syscall } from "../../core/syscall.js";

export class ProcessGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateProcessExit();
        this.generateProcessCwd();
        this.generateGetEnv();
        this.generateProcessArgvInit();
        this.generateProcessArgvGet();
        this.generateProcessArgvLength();
        this.generateProcessEnvCreate();
    }

    getSyscallNum(name) {
        const platform = this.vm.platform;
        const arch = this.vm.arch;

        if (platform === "windows") return -1; // TODO: Windows support

        const isArm64 = arch === "arm64";
        const isMac = platform === "macos";

        if (name === "exit") {
            if (isMac) return isArm64 ? Syscall.MACOS_EXIT_ARM64 : Syscall.MACOS_EXIT_X64;
            return isArm64 ? Syscall.LINUX_EXIT_ARM64 : Syscall.LINUX_EXIT;
        }
        if (name === "getcwd") {
            if (isMac) return isArm64 ? Syscall.MACOS_GETCWD_ARM64 : Syscall.MACOS_GETCWD_X64;
            return isArm64 ? Syscall.LINUX_GETCWD_ARM64 : Syscall.LINUX_GETCWD;
        }

        throw new Error("Unknown syscall: " + name);
    }

    /**
     * process.exit(code)
     * A0 = exit code
     */
    generateProcessExit() {
        const vm = this.vm;
        vm.label("_process_exit");
        // A0 已包含 exit code
        vm.syscall(this.getSyscallNum("exit"));
        // 不会返回
    }

    /**
     * process.cwd()
     * 返回当前工作目录字符串 (从 PWD 环境变量获取)
     */
    generateProcessCwd() {
        const vm = this.vm;

        vm.label("_process_cwd");
        vm.prologue(16, [VReg.S0]);

        // 调用 _get_env("PWD") 获取当前工作目录
        vm.lea(VReg.A0, "_pwd_env_name");
        vm.call("_get_env");
        // RET = C string 指针 (或 NULL)

        // 检查是否找到
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_process_cwd_empty");

        // 创建 JS 字符串
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_createStrFromCStr");
        vm.mov(VReg.S0, VReg.RET);

        // 装箱字符串
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_box_string");
        vm.jmp("_process_cwd_done");

        vm.label("_process_cwd_empty");
        // 返回空字符串
        vm.lea(VReg.A0, "_empty_cstr");
        vm.call("_createStrFromCStr");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_js_box_string");

        vm.label("_process_cwd_done");
        vm.epilogue([VReg.S0], 16);
    }

    /**
     * _get_env(name)
     * 从环境变量中查找指定名称
     * A0 = name (C string, 不含 '=')
     * 返回: 值的 C string 指针 (跳过 'NAME=')，或 NULL
     */
    generateGetEnv() {
        const vm = this.vm;

        vm.label("_get_env");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // S0 = name to find

        // 加载 envp
        vm.lea(VReg.V0, "_process_envp_ptr");
        vm.load(VReg.S1, VReg.V0, 0); // S1 = envp (char**)

        // 检查 envp 是否为 NULL
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_get_env_not_found");

        // 计算 name 长度
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET); // S2 = name length

        vm.label("_get_env_loop");
        // 加载 envp[i]
        vm.load(VReg.S3, VReg.S1, 0); // S3 = envp[i] (char*)

        // 检查是否到达 envp 结尾 (NULL)
        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_get_env_not_found");

        // 比较前 name_len 字节
        vm.mov(VReg.A0, VReg.S3); // envp[i]
        vm.mov(VReg.A1, VReg.S0); // name
        vm.mov(VReg.A2, VReg.S2); // length
        vm.call("_memcmp");

        // 如果不相等，继续下一个
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_get_env_next");

        // 检查 envp[i][name_len] == '='
        vm.add(VReg.V0, VReg.S3, VReg.S2); // V0 = envp[i] + name_len
        vm.loadByte(VReg.V1, VReg.V0, 0); // V1 = envp[i][name_len]
        vm.cmpImm(VReg.V1, 61); // 61 = '='
        vm.jne("_get_env_next");

        // 找到了！返回值指针 (跳过 'NAME=')
        vm.addImm(VReg.RET, VReg.V0, 1); // RET = envp[i] + name_len + 1
        vm.jmp("_get_env_done");

        vm.label("_get_env_next");
        vm.addImm(VReg.S1, VReg.S1, 8); // envp++
        vm.jmp("_get_env_loop");

        vm.label("_get_env_not_found");
        vm.movImm(VReg.RET, 0);

        vm.label("_get_env_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 16);
    }

    /**
     * _process_argv_init(argc, argv)
     * 在程序启动时调用，保存 argc 和 argv 到全局变量
     * A0 = argc (from stack)
     * A1 = argv (pointer to char*[])
     *
     * 为了兼容 Node.js，我们会在 argv[0] 后插入一个 dummy 元素
     * 这样 slice(2) 就能正确跳过 "node" 和 "script.js"
     * Native: [prog, arg1, arg2] -> [prog, prog, arg1, arg2]
     */
    generateProcessArgvInit() {
        const vm = this.vm;
        const TYPE_ARRAY = 1;
        const TYPE_STRING = 6;

        vm.label("_process_argv_init");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // S0 = argc
        vm.mov(VReg.S1, VReg.A1); // S1 = argv (char**)

        // 如果 argc == 0，直接创建空数组
        vm.cmpImm(VReg.S0, 0);
        vm.jle("_argv_init_empty");

        // 创建 JS 数组: 24 header + (argc + 1) * 8
        // 需要 argc + 1 个元素（多一个 dummy 作为 script path）
        // [type:8][length:8][capacity:8][elements...]
        vm.mov(VReg.A0, VReg.S0);
        vm.addImm(VReg.A0, VReg.A0, 1); // argc + 1
        vm.shlImm(VReg.A0, VReg.A0, 3); // (argc + 1) * 8
        vm.addImm(VReg.A0, VReg.A0, 24); // + header
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = array object

        // 设置数组头部: length = argc + 1, capacity = argc + 1
        vm.movImm(VReg.V0, TYPE_ARRAY);
        vm.store(VReg.S2, 0, VReg.V0); // type
        vm.mov(VReg.V0, VReg.S0);
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.store(VReg.S2, 8, VReg.V0); // length = argc + 1
        vm.store(VReg.S2, 16, VReg.V0); // capacity = argc + 1

        // === 首先处理 argv[0]（程序名），放入 JS argv[0] 和 argv[1] ===
        // 获取 argv[0] 指针
        vm.load(VReg.S4, VReg.S1, 0); // S4 = argv[0] (C string pointer)

        // 创建 JS 字符串
        vm.mov(VReg.A0, VReg.S4);
        vm.call("_createStrFromCStr");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_js_box_string");
        vm.mov(VReg.V2, VReg.RET); // V2 = boxed argv[0]

        // 存入 JS array[0]: array[24 + 0*8] = boxed string
        vm.store(VReg.S2, 24, VReg.V2);

        // 存入 JS array[1]: array[24 + 1*8] = boxed string (同样的 argv[0] 作为 dummy)
        vm.store(VReg.S2, 32, VReg.V2);

        // === 遍历剩余的 argv[1..n]，存入 JS array[2..n+1] ===
        vm.movImm(VReg.S3, 1); // S3 = i = 1 (从 C argv[1] 开始)

        vm.label("_argv_init_loop");
        vm.cmp(VReg.S3, VReg.S0);
        vm.jge("_argv_init_save");

        // 获取 argv[i] 指针
        vm.mov(VReg.V1, VReg.S3);
        vm.shlImm(VReg.V1, VReg.V1, 3); // i * 8
        vm.add(VReg.V1, VReg.S1, VReg.V1); // argv + i*8
        vm.load(VReg.S4, VReg.V1, 0); // S4 = argv[i] (C string pointer)

        // 创建 JS 字符串
        vm.mov(VReg.A0, VReg.S4);
        vm.call("_createStrFromCStr");
        // RET = JS string 指针

        // 装箱字符串为 JSValue
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_js_box_string");
        // RET = boxed string JSValue

        // 保存 boxed string 到 V2（避免与 V0/RET 冲突）
        vm.mov(VReg.V2, VReg.RET);

        // 存入数组: array[24 + (i+1)*8] = boxed string
        // 因为我们在索引 1 插入了 dummy，所以 C argv[i] 对应 JS array[i+1]
        vm.mov(VReg.V1, VReg.S3);
        vm.addImm(VReg.V1, VReg.V1, 1); // i + 1
        vm.shlImm(VReg.V1, VReg.V1, 3); // (i + 1) * 8
        vm.addImm(VReg.V1, VReg.V1, 24); // + header offset
        vm.add(VReg.V1, VReg.S2, VReg.V1);
        vm.store(VReg.V1, 0, VReg.V2);

        // i++
        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_argv_init_loop");

        vm.label("_argv_init_empty");
        // 创建空数组
        vm.movImm(VReg.A0, 24);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET);
        vm.movImm(VReg.V0, TYPE_ARRAY);
        vm.store(VReg.S2, 0, VReg.V0);
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S2, 8, VReg.V0); // length = 0
        vm.store(VReg.S2, 16, VReg.V0); // capacity = 0

        vm.label("_argv_init_save");
        // 装箱数组并保存到全局变量
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_js_box_array");
        vm.mov(VReg.V1, VReg.RET); // 保存 boxed array
        vm.lea(VReg.V0, "_process_argv_array");
        vm.store(VReg.V0, 0, VReg.V1);

        vm.label("_argv_init_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    /**
     * process.argv getter
     * 返回全局 argv 数组
     */
    generateProcessArgvGet() {
        const vm = this.vm;

        vm.label("_process_argv_get");
        vm.prologue(0, []);
        vm.lea(VReg.V0, "_process_argv_array");
        vm.load(VReg.RET, VReg.V0, 0);
        vm.epilogue([], 0);
    }

    /**
     * process.argv.length
     */
    generateProcessArgvLength() {
        const vm = this.vm;

        vm.label("_process_argv_length");
        vm.prologue(0, []);
        vm.lea(VReg.V0, "_process_argv_array");
        vm.load(VReg.V0, VReg.V0, 0); // 获取 boxed array JSValue
        // 解箱获取裸指针
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_js_unbox");
        vm.load(VReg.RET, VReg.RET, 8); // offset 8 = length
        vm.epilogue([], 0);
    }

    /**
     * _process_env_create() -> JSValue (env proxy object)
     * 创建 process.env 代理对象
     * 这个对象使用特殊类型 TYPE_ENV_PROXY (20)
     * 在 _object_get_prop 中需要特殊处理这种类型
     */
    generateProcessEnvCreate() {
        const vm = this.vm;
        const TYPE_ENV_PROXY = 20; // 特殊类型标识 env 代理对象

        vm.label("_process_env_create");
        vm.prologue(0, [VReg.S0]);

        // 分配一个简单对象结构
        // [type:8][count:8]
        vm.movImm(VReg.A0, 32);
        vm.call("_alloc");
        vm.mov(VReg.S0, VReg.RET);

        // 设置类型为 TYPE_ENV_PROXY
        vm.movImm(VReg.V0, TYPE_ENV_PROXY);
        vm.store(VReg.S0, 0, VReg.V0);

        // count = 0 (不重要，env 代理动态访问)
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S0, 8, VReg.V0);

        // 将裸指针装箱为 JSValue
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_box_object");

        vm.epilogue([VReg.S0], 0);
    }

    generateDataSection(asm) {
        // 全局变量存储 argv 数组指针
        asm.addDataLabel("_process_argv_array");
        asm.addDataQword(0);

        // 全局变量存储 envp 指针
        asm.addDataLabel("_process_envp_ptr");
        asm.addDataQword(0);

        // PWD 环境变量名
        asm.addDataLabel("_pwd_env_name");
        asm.addDataByte(80); // 'P'
        asm.addDataByte(87); // 'W'
        asm.addDataByte(68); // 'D'
        asm.addDataByte(0); // null terminator

        // 空字符串
        asm.addDataLabel("_empty_cstr");
        asm.addDataByte(0);

        // 平台和架构字符串 (C string 格式)
        asm.addDataLabel("_process_platform_str");
        const platform = this.vm.platform;
        for (let i = 0; i < platform.length; i++) {
            asm.addDataByte(platform.charCodeAt(i));
        }
        asm.addDataByte(0);

        asm.addDataLabel("_process_arch_str");
        const arch = this.vm.arch;
        for (let i = 0; i < arch.length; i++) {
            asm.addDataByte(arch.charCodeAt(i));
        }
        asm.addDataByte(0);
    }
}
