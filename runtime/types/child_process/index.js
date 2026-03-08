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
        const debug = typeof globalThis !== "undefined" && globalThis.DEBUG_RUNTIME;
        const envDebug = typeof process !== "undefined" && process.env && process.env.DEBUG_RUNTIME;
        const isDebug = debug || envDebug;

        if (isDebug) console.log("[Runtime:ChildProcess] generateExecSync");
        this.generateExecSync();
        if (isDebug) console.log("[Runtime:ChildProcess] generateAliases");
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
        const debug = typeof globalThis !== "undefined" && globalThis.DEBUG_RUNTIME;
        const envDebug = typeof process !== "undefined" && process.env && process.env.DEBUG_RUNTIME;
        if (debug || envDebug) {
            console.log("[Runtime:ChildProcess] syscall", name, "platform", platform, "arch", arch);
        }

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
        vm.prologue(0, []);

        // 简化实现：直接返回空字符串（不执行子进程）
        vm.lea(VReg.A0, "_empty_cstr");
        vm.call("_createStrFromCStr");
        vm.mov(VReg.A0, VReg.RET);
        vm.epilogue([], 0);
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
