// 二次自举的兼容层 - 提供 Node.js 兼容 API
// 通过 syscall 实现

import { VReg } from "../../vm/registers.js";

export class CompilerCompatGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        // fs
        this.generateFsReadFileSync();
        this.generateFsWriteFileSync();
        
        // path
        this.generatePathJoin();
        this.generatePathDirname();
        this.generatePathBasename();
        
        // process
        this.generateProcessArgv();
        this.generateProcessCwd();
        
        // string
        this.generateStrcmp();
        this.generateStrlen();
    }

    // fs.readFileSync(path, encoding) -> string
    generateFsReadFileSync() {
        const vm = this.vm;
        vm.label("_fs_read_file_sync");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);
        
        // A0: path (string pointer)
        vm.mov(VReg.S0, VReg.A0); // path
        
        // 打开文件: open(path, O_RDONLY, 0)
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm(VReg.A1, 0); // O_RDONLY
        vm.movImm(VReg.A2, 0);
        vm.call("_compiler_open");
        vm.mov(VReg.S1, VReg.RET); // fd
        
        // 检查 fd >= 0
        vm.cmpImm(VReg.S1, 0);
        vm.jlt("_fs_read_fail");
        
        // 分配缓冲区
        vm.movImm(VReg.A0, 8192);
        vm.call("_compiler_malloc");
        vm.mov(VReg.S2, VReg.RET); // buffer
        
        // 循环读取
        vm.label("_fs_read_loop");
        vm.mov(VReg.A0, VReg.S1); // fd
        vm.mov(VReg.A1, VReg.S2); // buffer
        vm.movImm(VReg.A2, 8192); // count
        vm.call("_compiler_read");
        vm.mov(VReg.S3, VReg.RET); // bytes read
        
        vm.cmpImm(VReg.S3, 0);
        vm.jle("_fs_read_done");
        
        // TODO: 累积读取内容
        vm.jmp("_fs_read_loop");
        
        vm.label("_fs_read_done");
        // 关闭文件
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_compiler_close");
        
        // 返回内容 (简化: 返回 buffer)
        vm.mov(VReg.RET, VReg.S2);
        
        vm.label("_fs_read_fail");
        vm.movImm(VReg.RET, 0);
        
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // fs.writeFileSync(path, data, encoding) -> void
    generateFsWriteFileSync() {
        const vm = this.vm;
        vm.label("_fs_write_file_sync");
        vm.prologue(24, [VReg.S0, VReg.S1, VReg.S2]);
        
        vm.mov(VReg.S0, VReg.A0); // path
        vm.mov(VReg.S1, VReg.A1); // data
        
        // 打开文件: open(path, O_WRONLY|O_CREAT|O_TRUNC, 0644)
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm(VReg.A1, 0x201); // O_WRONLY|O_CREAT|O_TRUNC
        vm.movImm(VReg.A2, 0o644);
        vm.call("_compiler_open");
        vm.mov(VReg.S2, VReg.RET); // fd
        
        vm.cmpImm(VReg.S2, 0);
        vm.jlt("_fs_write_fail");
        
        // 写入
        vm.mov(VReg.A0, VReg.S2); // fd
        vm.mov(VReg.A1, VReg.S1); // data
        vm.movImm(VReg.A2, 8192); // 简化
        vm.call("_compiler_write");
        
        // 关闭
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_compiler_close");
        
        vm.label("_fs_write_fail");
        vm.movImm(VReg.RET, 0);
        
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 24);
    }

    // path.join(...paths) -> string
    generatePathJoin() {
        const vm = this.vm;
        vm.label("_path_join");
        // 简化: 直接返回第一个参数
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    // path.dirname(path) -> string
    generatePathDirname() {
        const vm = this.vm;
        vm.label("_path_dirname");
        // 简化: 找到最后一个 / 之前的部分
        // TODO: 实现完整逻辑
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    // path.basename(path) -> string
    generatePathBasename() {
        const vm = this.vm;
        vm.label("_path_basename");
        // 简化: 找到最后一个 / 之后的部分
        // TODO: 实现完整逻辑
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    // process.argv -> array
    generateProcessArgv() {
        const vm = this.vm;
        vm.label("_process_argv");
        // 返回内置的 argv 数组指针
        vm.lea(VReg.RET, "_process_argv_data");
        vm.ret();
    }

    // process.cwd() -> string
    generateProcessCwd() {
        const vm = this.vm;
        vm.label("_process_cwd");
        // 返回当前目录
        vm.lea(VReg.RET, "_process_cwd_data");
        vm.ret();
    }

    // strcmp(s1, s2) -> int
    generateStrcmp() {
        const vm = this.vm;
        vm.label("_strcmp");
        // 简化: 返回 0
        vm.movImm(VReg.RET, 0);
        vm.ret();
    }

    // strlen(s) -> int
    generateStrlen() {
        const vm = this.vm;
        vm.label("_strlen");
        // 简化: 返回 0
        vm.movImm(VReg.RET, 0);
        vm.ret();
    }
}
