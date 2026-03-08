// 完整的编译器 syscall 实现
// 二次自举时使用，通过 syscall 调用操作系统

import { VReg } from "../../vm/registers.js";
import { Syscall } from "./syscall.js";

export class CompilerSyscallGenerator {
    constructor(vm, arch, os) {
        this.vm = vm;
        this.arch = arch;
        this.arch = arch || "arm64";
        this.os = os || "macos";
    }

    generate() {
        // 文件操作
        this.generateOpen();
        this.generateClose();
        this.generateRead();
        this.generateWrite();
        
        // 路径操作
        this.generateGetcwd();
        this.generateChdir();
        
        // 进程操作
        this.generateExit();
        this.generateGetuid();
        this.generateGettid();
        
        // 内存操作
        this.generateMalloc();
        this.generateFree();
    }

    getSyscall(name) {
        const isArm64 = this.arch === "arm64";
        const isMac = this.os === "macos";
        
        const syscalls = {
            // 文件
            "open": isMac ? (isArm64 ? 5 : 5) : (isArm64 ? 56 : 2),
            "close": isMac ? (isArm64 ? 6 : 6) : (isArm64 ? 57 : 3),
            "read": isMac ? (isArm64 ? 4 : 4) : (isArm64 ? 63 : 0),
            "write": isMac ? (isArm64 ? 4 : 4) : (isArm64 ? 64 : 1),
            
            // 目录
            "getcwd": isMac ? (isArm64 ? 327 : 327) : (isArm64 ? 17 : 79),
            "chdir": isMac ? (isArm64 ? 12 : 12) : (isArm64 ? 49 : 80),
            
            // 进程
            "exit": isMac ? (isArm64 ? 1 : 1) : (isArm64 ? 93 : 60),
            "getuid": isMac ? (isArm64 ? 23 : 23) : (isArm64 ? 99 : 102),
            
            // 内存
            "mmap": isMac ? (isArm64 ? 197 : 197) : (isArm64 ? 222 : 9),
            "munmap": isMac ? (isArm64 ? 73 : 73) : (isArm64 ? 215 : 11),
        };
        
        return syscalls[name] || 0;
    }

    // void *malloc(size_t size)
    generateMalloc() {
        const vm = this.vm;
        vm.label("_compiler_malloc");
        vm.prologue(16, [VReg.S0]);
        
        // A0 = size
        vm.mov(VReg.S0, VReg.A0);
        
        // mmap(NULL, size, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0)
        vm.movImm(VReg.A0, 0); // NULL
        vm.mov(VReg.A1, VReg.S0); // size
        vm.movImm(VReg.A2, 7); // PROT_READ | PROT_WRITE
        vm.movImm(VReg.A3, 0x1002); // MAP_PRIVATE | MAP_ANONYMOUS
        vm.movImm(VReg.V0, -1); // fd = -1
        vm.movImm(VReg.V1, 0); // offset = 0
        
        vm.movImm(VReg.X16, this.getSyscall("mmap"));
        vm.syscall(VReg.X16);
        
        vm.epilogue([VReg.S0], 16);
    }

    // void free(void *ptr)
    generateFree() {
        const vm = this.vm;
        vm.label("_compiler_free");
        // munmap(ptr, 0) - 简化处理
        vm.ret();
    }

    // int open(const char *path, int flags, int mode)
    generateOpen() {
        const vm = this.vm;
        vm.label("_compiler_open");
        vm.prologue(24, [VReg.S0, VReg.S1, VReg.S2]);
        
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.mov(VReg.S2, VReg.A2);
        
        vm.movImm(VReg.X16, this.getSyscall("open"));
        vm.syscall(VReg.X16);
        
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 24);
    }

    // int close(int fd)
    generateClose() {
        const vm = this.vm;
        vm.label("_compiler_close");
        vm.prologue(8, [VReg.S0]);
        
        vm.movImm(VReg.X16, this.getSyscall("close"));
        vm.syscall(VReg.X16);
        
        vm.epilogue([VReg.S0], 8);
    }

    // ssize_t read(int fd, void *buf, size_t count)
    generateRead() {
        const vm = this.vm;
        vm.label("_compiler_read");
        vm.prologue(24, [VReg.S0, VReg.S1, VReg.S2]);
        
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.mov(VReg.S2, VReg.A2);
        
        vm.movImm(VReg.X16, this.getSyscall("read"));
        vm.syscall(VReg.X16);
        
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 24);
    }

    // ssize_t write(int fd, const void *buf, size_t count)
    generateWrite() {
        const vm = this.vm;
        vm.label("_compiler_write");
        vm.prologue(24, [VReg.S0, VReg.S1, VReg.S2]);
        
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);
        vm.mov(VReg.S2, VReg.A2);
        
        vm.movImm(VReg.X16, this.getSyscall("write"));
        vm.syscall(VReg.X16);
        
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 24);
    }

    // char *getcwd(char *buf, size_t size)
    generateGetcwd() {
        const vm = this.vm;
        vm.label("_compiler_getcwd");
        vm.prologue(16, [VReg.S0]);
        
        vm.mov(VReg.S0, VReg.A0);
        
        vm.movImm(VReg.X16, this.getSyscall("getcwd"));
        vm.syscall(VReg.X16);
        
        vm.epilogue([VReg.S0], 16);
    }

    // int chdir(const char *path)
    generateChdir() {
        const vm = this.vm;
        vm.label("_compiler_chdir");
        vm.prologue(8, [VReg.S0]);
        
        vm.movImm(VReg.X16, this.getSyscall("chdir"));
        vm.syscall(VReg.X16);
        
        vm.epilogue([VReg.S0], 8);
    }

    // void exit(int status)
    generateExit() {
        const vm = this.vm;
        vm.label("_compiler_exit");
        
        vm.movImm(VReg.X16, this.getSyscall("exit"));
        vm.syscall(VReg.X16);
        
        // 如果返回，继续执行
        vm.ret();
    }

    // uid_t getuid(void)
    generateGetuid() {
        const vm = this.vm;
        vm.label("_compiler_getuid");
        
        vm.movImm(VReg.X16, this.getSyscall("getuid"));
        vm.syscall(VReg.X16);
        
        vm.ret();
    }

    // pid_t gettid(void)
    generateGettid() {
        const vm = this.vm;
        vm.label("_compiler_gettid");
        
        // macOS 没有 gettid，用 getpid 代替
        vm.movImm(VReg.RET, 1);
        vm.ret();
    }
}
