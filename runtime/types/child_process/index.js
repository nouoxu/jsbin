// JSBin Child Process 运行时
// 提供 child_process 模块操作的运行时实现

import { VReg } from "../../../vm/registers.js";
import { Syscall } from "../../core/syscall.js";

export class ChildProcessGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateExecSync();
        this.generateAliases();
    }

    /**
     * 生成函数别名
     */
    generateAliases() {
        const vm = this.vm;
        // 别名：_child_process_execSync -> _exec_sync
        vm.label("_child_process_execSync");
        vm.jmp("_exec_sync");
    }

    getSyscallNum(name) {
        const platform = this.vm.platform;
        const arch = this.vm.arch;

        if (platform === "windows") return -1;

        const isArm64 = arch === "arm64";
        const isMac = platform === "macos";

        switch (name) {
            case "fork":
                if (isMac) return isArm64 ? Syscall.MACOS_FORK_ARM64 : Syscall.MACOS_FORK_X64;
                return isArm64 ? Syscall.LINUX_FORK_ARM64 : Syscall.LINUX_FORK;
            case "execve":
                if (isMac) return isArm64 ? Syscall.MACOS_EXECVE_ARM64 : Syscall.MACOS_EXECVE_X64;
                return isArm64 ? Syscall.LINUX_EXECVE_ARM64 : Syscall.LINUX_EXECVE;
            case "wait4":
                if (isMac) return isArm64 ? Syscall.MACOS_WAITPID_ARM64 : Syscall.MACOS_WAITPID_X64;
                return isArm64 ? Syscall.LINUX_WAIT4_ARM64 : Syscall.LINUX_WAIT4;
            case "pipe":
                if (isMac) return isArm64 ? Syscall.MACOS_PIPE_ARM64 : Syscall.MACOS_PIPE_X64;
                return isArm64 ? Syscall.LINUX_PIPE_ARM64 : Syscall.LINUX_PIPE;
            case "dup2":
                if (isMac) return isArm64 ? Syscall.MACOS_DUP2_ARM64 : Syscall.MACOS_DUP2_X64;
                return isArm64 ? Syscall.LINUX_DUP2_ARM64 : Syscall.LINUX_DUP2;
            case "read":
                if (isMac) return isArm64 ? Syscall.MACOS_READ_ARM64 : Syscall.MACOS_READ_X64;
                return isArm64 ? Syscall.LINUX_READ_ARM64 : Syscall.LINUX_READ;
            case "close":
                if (isMac) return isArm64 ? Syscall.MACOS_CLOSE_ARM64 : Syscall.MACOS_CLOSE_X64;
                return isArm64 ? Syscall.LINUX_CLOSE_ARM64 : Syscall.LINUX_CLOSE;
            case "exit":
                if (isMac) return isArm64 ? Syscall.MACOS_EXIT_ARM64 : Syscall.MACOS_EXIT_X64;
                return isArm64 ? Syscall.LINUX_EXIT_ARM64 : Syscall.LINUX_EXIT;
            default:
                throw new Error("Unknown syscall: " + name);
        }
    }

    /**
     * execSync(command)
     * 执行命令并等待完成，返回空字符串（简化版本）
     * A0 = command (NaN-boxed string)
     * 返回: 空字符串（暂时不捕获输出）
     *
     * 实现:
     * 1. fork() 创建子进程
     * 2. 子进程: execve("/bin/sh", ["/bin/sh", "-c", command], NULL)
     * 3. 父进程: wait4() 等待子进程完成
     */
    generateExecSync() {
        const vm = this.vm;

        vm.label("_exec_sync");
        vm.prologue(128, [VReg.S0, VReg.S1, VReg.S2]);

        // S0 = command (NaN-boxed string)
        vm.mov(VReg.S0, VReg.A0);

        // 解箱获取字符串指针
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_getStrContent");
        vm.mov(VReg.S0, VReg.RET); // S0 = command C string

        // fork()
        vm.syscall(this.getSyscallNum("fork"));
        vm.mov(VReg.S1, VReg.RET); // S1 = fork result (0 = child, >0 = parent pid)

        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_exec_sync_child");

        // ============ 父进程 ============
        // 等待子进程完成: wait4(pid, &status, 0, NULL)
        vm.mov(VReg.A0, VReg.S1); // pid
        vm.subImm(VReg.A1, VReg.FP, 32); // &status
        vm.movImm(VReg.A2, 0); // options
        vm.movImm(VReg.A3, 0); // rusage
        vm.syscall(this.getSyscallNum("wait4"));

        // 返回空字符串
        vm.lea(VReg.A0, "_empty_cstr");
        vm.call("_createStrFromCStr");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_js_box_string");
        vm.jmp("_exec_sync_done");

        // ============ 子进程 ============
        vm.label("_exec_sync_child");

        // 构建 execve 参数: execve("/bin/sh", ["/bin/sh", "-c", cmd], NULL)
        // argv 数组放在栈上: [ptr to "/bin/sh", ptr to "-c", ptr to cmd, NULL]
        // FP-64: argv[0] = "/bin/sh"
        // FP-56: argv[1] = "-c"
        // FP-48: argv[2] = cmd
        // FP-40: argv[3] = NULL
        vm.lea(VReg.V0, "_str_bin_sh");
        vm.store(VReg.FP, -64, VReg.V0);
        vm.lea(VReg.V0, "_str_dash_c");
        vm.store(VReg.FP, -56, VReg.V0);
        vm.store(VReg.FP, -48, VReg.S0); // command
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.FP, -40, VReg.V0);

        // execve("/bin/sh", argv, NULL)
        vm.lea(VReg.A0, "_str_bin_sh"); // path
        vm.subImm(VReg.A1, VReg.FP, 64); // argv
        vm.movImm(VReg.A2, 0); // envp = NULL (inherit)
        vm.syscall(this.getSyscallNum("execve"));

        // 如果 execve 返回，说明失败了，退出子进程
        vm.movImm(VReg.A0, 127);
        vm.syscall(this.getSyscallNum("exit"));

        vm.label("_exec_sync_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 128);
    }

    /**
     * 添加数据段
     */
    generateDataSection(asm) {
        // "/bin/sh"
        asm.addDataLabel("_str_bin_sh");
        asm.addDataByte(47); // '/'
        asm.addDataByte(98); // 'b'
        asm.addDataByte(105); // 'i'
        asm.addDataByte(110); // 'n'
        asm.addDataByte(47); // '/'
        asm.addDataByte(115); // 's'
        asm.addDataByte(104); // 'h'
        asm.addDataByte(0); // null

        // "-c"
        asm.addDataLabel("_str_dash_c");
        asm.addDataByte(45); // '-'
        asm.addDataByte(99); // 'c'
        asm.addDataByte(0); // null
    }
}
