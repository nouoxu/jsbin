// JSBin 编译器内置 FS - 二次自举时使用
// 提供基本的文件系统操作 (通过 syscall)

import { VReg } from "../../vm/registers.js";
import { Syscall } from "./syscall.js";

export class CompilerFSGenerator {
    constructor(vm, arch, os) {
        this.vm = vm;
        this.arch = arch;
        this.os = os;
    }

    generate() {
        this.generateReadFile();
        this.generateWriteFile();
        this.generateChmod();
        this.generateOpen();
        this.generateClose();
    }

    getSyscall(name) {
        const isArm64 = this.arch === "arm64";
        const isMac = this.os === "macos";
        
        if (name === "open") {
            if (isMac) return isArm64 ? Syscall.MACOS_OPEN_ARM64 : Syscall.MACOS_OPEN_X64;
            return isArm64 ? Syscall.LINUX_OPEN_ARM64 : Syscall.LINUX_OPEN;
        }
        if (name === "close") {
            if (isMac) return isArm64 ? Syscall.MACOS_CLOSE_ARM64 : Syscall.MACOS_CLOSE_X64;
            return isArm64 ? Syscall.LINUX_CLOSE_ARM64 : Syscall.LINUX_CLOSE;
        }
        if (name === "read") {
            if (isMac) return isArm64 ? Syscall.MACOS_READ_ARM64 : Syscall.MACOS_READ_X64;
            return isArm64 ? Syscall.LINUX_READ_ARM64 : Syscall.LINUX_READ;
        }
        if (name === "write") {
            if (isMac) return isArm64 ? Syscall.MACOS_WRITE_ARM64 : Syscall.MACOS_WRITE_X64;
            return isArm64 ? Syscall.LINUX_WRITE_ARM64 : Syscall.LINUX_WRITE;
        }
        if (name === "fstat") {
            if (isMac) return isArm64 ? Syscall.MACOS_FSTAT_ARM64 : Syscall.MACOS_FSTAT_X64;
            return isArm64 ? Syscall.LINUX_FSTAT_ARM64 : Syscall.LINUX_FSTAT;
        }
        throw new Error("Unknown syscall: " + name);
    }

    // _compiler_open(path, flags, mode) -> fd
    generateOpen() {
        const vm = this.vm;
        vm.label("_compiler_open");
        vm.prologue(24, [VReg.S0, VReg.S1, VReg.S2]);
        
        // A0: path string pointer
        // A1: flags
        // A2: mode
        
        vm.mov(VReg.S0, VReg.A0); // path
        vm.mov(VReg.S1, VReg.A1); // flags
        vm.mov(VReg.S2, VReg.A2); // mode
        
        // 调用 syscall
        vm.movImm(VReg.V0, this.getSyscall("open"));
        vm.syscall(VReg.V0);
        
        // RET = fd
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 24);
    }

    // _compiler_close(fd) -> 0 or -1
    generateClose() {
        const vm = this.vm;
        vm.label("_compiler_close");
        vm.prologue(8, [VReg.S0]);
        
        // A0: fd
        vm.mov(VReg.S0, VReg.A0);
        
        vm.movImm(VReg.V0, this.getSyscall("close"));
        vm.syscall(VReg.V0);
        
        vm.epilogue([VReg.S0], 8);
    }

    // _compiler_read(fd, buf, count) -> bytes read
    generateReadFile() {
        const vm = this.vm;
        vm.label("_compiler_read");
        vm.prologue(24, [VReg.S0, VReg.S1, VReg.S2]);
        
        // A0: fd
        // A1: buffer pointer
        // A2: count
        
        vm.mov(VReg.S0, VReg.A0); // fd
        vm.mov(VReg.S1, VReg.A1); // buf
        vm.mov(VReg.S2, VReg.A2); // count
        
        vm.movImm(VReg.V0, this.getSyscall("read"));
        vm.syscall(VReg.V0);
        
        // RET = bytes read
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 24);
    }

    // _compiler_write(fd, buf, count) -> bytes written
    generateWriteFile() {
        const vm = this.vm;
        vm.label("_compiler_write");
        vm.prologue(24, [VReg.S0, VReg.S1, VReg.S2]);
        
        // A0: fd
        // A1: buffer pointer
        // A2: count
        
        vm.mov(VReg.S0, VReg.A0); // fd
        vm.mov(VReg.S1, VReg.A1); // buf
        vm.mov(VReg.S2, VReg.A2); // count
        
        vm.movImm(VReg.V0, this.getSyscall("write"));
        vm.syscall(VReg.V0);
        
        // RET = bytes written
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 24);
    }

    // _compiler_chmod(path, mode) -> 0 or -1
    generateChmod() {
        const vm = this.vm;
        vm.label("_compiler_chmod");
        // chmod 在 macOS 上是 fchmodat，在 Linux 上是 chmod
        // 简化处理：直接返回 0
        vm.movImm(VReg.RET, 0);
        vm.ret();
    }
}
