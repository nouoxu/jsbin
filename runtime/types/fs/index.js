// JSBin FS 运行时
// 提供文件系统操作的运行时实现

import { VReg } from "../../../vm/registers.js";
import { Syscall } from "../../core/syscall.js";
import { JS_NULL, JS_UNDEFINED } from "../../core/jsvalue.js";

export class FSGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateFSOpen();
        this.generateFSClose();
        this.generateFSRead();
        this.generateFSWrite();
        this.generateFSReadFileSync();
        this.generateFSWriteFileSync();
        this.generateFSExistsSync();
        this.generateFSUnlinkSync();
        this.generateFSStatSync();
    }

    getSyscallNum(name) {
        const platform = this.vm.platform;
        const arch = this.vm.arch;

        if (platform === "windows") return -1; // TODO: Windows support

        const isArm64 = arch === "arm64";
        const isMac = platform === "macos";

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
        if (name === "stat") {
            if (isMac) return isArm64 ? Syscall.MACOS_STAT_ARM64 : Syscall.MACOS_STAT_X64;
            return isArm64 ? Syscall.LINUX_NEWFSTATAT_ARM64 : Syscall.LINUX_STAT;
        }
        if (name === "unlink") {
            if (isMac) return isArm64 ? Syscall.MACOS_UNLINK_ARM64 : Syscall.MACOS_UNLINK_X64;
            return isArm64 ? Syscall.LINUX_UNLINKAT_ARM64 : Syscall.LINUX_UNLINK;
        }

        throw new Error("Unknown syscall: " + name);
    }

    generateFSOpen() {
        const vm = this.vm;
        vm.label("_fs_open");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        // A0: path (NaN-boxed string)
        // A1: flags (int)

        // 保存参数
        vm.mov(VReg.S0, VReg.A0); // 保存 path (NaN-boxed)
        vm.mov(VReg.S1, VReg.A1); // 保存 flags

        // 获取字符串内容指针 (处理 NaN-boxed 字符串)
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_get_string_content");
        vm.mov(VReg.A0, VReg.RET); // A0 = content pointer

        // Linux AArch64 use openat(dirfd, path, flags, mode)
        if (vm.platform === "linux" && vm.arch === "arm64") {
            // openat(AT_FDCWD=-100, path, flags, mode=0644)
            vm.movImm(VReg.A3, 0o644); // mode
            vm.mov(VReg.A2, VReg.S1); // flags
            vm.mov(VReg.A1, VReg.A0); // path
            vm.movImm(VReg.A0, -100); // AT_FDCWD
        } else {
            // open(path, flags, mode)
            vm.mov(VReg.A1, VReg.S1); // flags
            vm.movImm(VReg.A2, 0o644); // mode
            // A0 already has path
        }

        vm.syscall(this.getSyscallNum("open"));
        // RET = fd

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    generateFSClose() {
        const vm = this.vm;
        vm.label("_fs_close");
        vm.prologue(0, []);

        // A0: fd
        vm.syscall(this.getSyscallNum("close"));

        vm.epilogue([], 0);
    }

    generateFSRead() {
        const vm = this.vm;
        vm.label("_fs_read");
        vm.prologue(0, []);

        // A0: fd
        // A1: buffer
        // A2: length
        vm.syscall(this.getSyscallNum("read"));
        // RET = bytes read

        vm.epilogue([], 0);
    }

    generateFSWrite() {
        const vm = this.vm;
        vm.label("_fs_write");
        vm.prologue(0, []);

        // A0: fd
        // A1: buffer
        // A2: length
        vm.syscall(this.getSyscallNum("write"));
        // RET = bytes written

        vm.epilogue([], 0);
    }

    /**
     * fs.readFileSync(path, options)
     * A0 = path (string)
     * A1 = options (ignored for now, assume utf8)
     */
    generateFSReadFileSync() {
        const vm = this.vm;

        vm.label("_fs_read_file_sync");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // S0 = path (save first!)

        // 1. Open file
        // flags = O_RDONLY (0)
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm(VReg.A1, 0);
        vm.call("_fs_open");

        vm.mov(VReg.S1, VReg.RET); // S1 = fd

        // Check if open failed (fd < 0)
        vm.cmpImm(VReg.S1, 0);
        vm.jlt("_fs_read_fail");

        // 2. Allocate buffer (start with 4KB)
        vm.movImm(VReg.S2, 4096); // S2 = capacity
        vm.movImm(VReg.S3, 0); // S3 = length used

        // Alloc initial buffer (byte array)
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_alloc");
        vm.mov(VReg.S4, VReg.RET); // S4 = buffer ptr

        // 3. Read loop
        vm.label("_fs_read_loop");

        // Calculate remaining space
        vm.sub(VReg.V0, VReg.S2, VReg.S3); // V0 = capacity - length

        // If remaining < 1024, grow buffer
        vm.cmpImm(VReg.V0, 1024);
        vm.jge("_fs_read_do_read");

        // Double capacity
        vm.add(VReg.S2, VReg.S2, VReg.S2);

        // Allocate new buffer
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_alloc");
        vm.mov(VReg.V5, VReg.RET); // New buffer

        // memcpy(dest=V5, src=S4, len=S3)
        vm.mov(VReg.A0, VReg.V5);
        vm.mov(VReg.A1, VReg.S4);
        vm.mov(VReg.A2, VReg.S3);
        vm.call("_memcpy");

        vm.mov(VReg.S4, VReg.V5); // Update S4

        vm.label("_fs_read_do_read");

        // Read(fd, buffer + length, capacity - length)
        vm.mov(VReg.A0, VReg.S1); // fd
        vm.add(VReg.A1, VReg.S4, VReg.S3); // buffer + length
        vm.sub(VReg.A2, VReg.S2, VReg.S3); // size
        vm.call("_fs_read");

        vm.mov(VReg.V0, VReg.RET); // bytes read

        // Check error or EOF
        vm.cmpImm(VReg.V0, 0);
        vm.jle("_fs_read_done"); // 0 = EOF, < 0 = Error

        vm.add(VReg.S3, VReg.S3, VReg.V0); // length += bytes read
        vm.jmp("_fs_read_loop");

        vm.label("_fs_read_done");

        // 4. Close
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_fs_close");

        // 5. Create String object
        // String layout: [type:8] [length:8] [content...]
        // Allocate String Object: 16 + length + 1 (null terminator)
        vm.mov(VReg.A0, VReg.S3);
        vm.addImm(VReg.A0, VReg.A0, 17); // 16 header + 1 null
        vm.call("_alloc");
        vm.mov(VReg.V5, VReg.RET); // String object

        // Set Header
        vm.movImm(VReg.V1, 6); // TYPE_STRING
        vm.storeByte(VReg.V5, 0, VReg.V1);
        vm.store(VReg.V5, 8, VReg.S3); // length

        // Copy content: memcpy(str+16, buffer, length)
        vm.addImm(VReg.A0, VReg.V5, 16);
        vm.mov(VReg.A1, VReg.S4);
        vm.mov(VReg.A2, VReg.S3);
        vm.call("_memcpy");

        // Null terminate
        vm.movImm(VReg.V1, 0);
        vm.addImm(VReg.V2, VReg.V5, 16);
        vm.add(VReg.V2, VReg.V2, VReg.S3);
        vm.storeByte(VReg.V2, 0, VReg.V1);

        vm.mov(VReg.RET, VReg.V5);
        vm.jmp("_fs_read_exit");

        vm.label("_fs_read_fail");
        vm.movImm(VReg.RET, 0); // Return null?

        vm.label("_fs_read_exit");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    /**
     * fs.writeFileSync(path, data)
     * A0 = path (string)
     * A1 = data (string or Buffer)
     */
    generateFSWriteFileSync() {
        const vm = this.vm;

        vm.label("_fs_write_file_sync");
        vm.prologue(64, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // S0 = path (NaN-boxed)
        vm.mov(VReg.S1, VReg.A1); // S1 = data (NaN-boxed)

        // 1. Open file for writing
        // flags = O_WRONLY | O_CREAT | O_TRUNC = 0x41 | 0x200 = 0x241 (macOS)
        // Linux: O_WRONLY=1, O_CREAT=0x40, O_TRUNC=0x200 => 0x241
        vm.mov(VReg.A0, VReg.S0);
        vm.movImm(VReg.A1, 0x241); // O_WRONLY | O_CREAT | O_TRUNC
        vm.call("_fs_open");
        vm.mov(VReg.S2, VReg.RET); // S2 = fd

        // Check if open failed
        vm.cmpImm(VReg.S2, 0);
        vm.jlt("_fs_write_fail");

        // 2. Get data content pointer using _get_string_content
        // This handles both data segment strings (no header) and heap strings (16-byte header)
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_get_string_content");
        vm.mov(VReg.S3, VReg.RET); // S3 = content pointer

        // 3. Get string length using strlen
        vm.mov(VReg.A0, VReg.S3);
        vm.call("_strlen");
        vm.mov(VReg.S4, VReg.RET); // S4 = length

        // 4. Write data
        vm.mov(VReg.A0, VReg.S2); // fd
        vm.mov(VReg.A1, VReg.S3); // buffer
        vm.mov(VReg.A2, VReg.S4); // length
        vm.call("_fs_write");

        // 5. Close file
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_fs_close");

        // Return undefined
        vm.movImm64(VReg.RET, "0x7ffb000000000000");
        vm.jmp("_fs_write_exit");

        vm.label("_fs_write_fail");
        // TODO: throw error
        vm.movImm64(VReg.RET, "0x7ffb000000000000");

        vm.label("_fs_write_exit");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 64);
    }

    /**
     * fs.existsSync(path) -> boolean
     * A0 = path (string)
     * Returns: true if file exists, false otherwise
     *
     * 使用 access(path, F_OK) 系统调用检查文件是否存在
     * F_OK = 0 表示只检查存在性
     */
    generateFSExistsSync() {
        const vm = this.vm;
        const platform = vm.platform;
        const arch = vm.arch;

        vm.label("_fs_exists_sync");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // S0 = path

        // Get string content pointer
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_get_string_content");
        vm.mov(VReg.S0, VReg.RET); // S0 = path C string

        // Use access(path, F_OK) to check file existence
        // F_OK = 0 means check existence only
        if (platform === "linux" && arch === "arm64") {
            // Linux ARM64: faccessat(AT_FDCWD, path, mode, flags)
            // faccessat = syscall 48
            vm.movImm(VReg.A0, -100); // AT_FDCWD
            vm.mov(VReg.A1, VReg.S0); // path
            vm.movImm(VReg.A2, 0); // F_OK
            vm.movImm(VReg.A3, 0); // flags
            vm.syscall(48); // faccessat
        } else if (platform === "macos") {
            // macOS: access(path, mode)
            vm.mov(VReg.A0, VReg.S0); // path
            vm.movImm(VReg.A1, 0); // F_OK
            vm.syscall(this.getAccessSyscall());
        } else {
            // Linux x64: access(path, mode)
            vm.mov(VReg.A0, VReg.S0); // path
            vm.movImm(VReg.A1, 0); // F_OK
            vm.syscall(Syscall.LINUX_ACCESS);
        }

        // If return == 0, file exists
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_fs_exists_false");

        // Return true (NaN-boxed)
        vm.movImm64(VReg.RET, "0x7ff9000000000001"); // JS_TRUE
        vm.jmp("_fs_exists_done");

        vm.label("_fs_exists_false");
        vm.movImm64(VReg.RET, "0x7ff9000000000000"); // JS_FALSE

        vm.label("_fs_exists_done");
        vm.epilogue([VReg.S0], 16);
    }

    getAccessSyscall() {
        const platform = this.vm.platform;
        const arch = this.vm.arch;
        if (platform === "macos") {
            return arch === "arm64" ? Syscall.MACOS_ACCESS_ARM64 : Syscall.MACOS_ACCESS_X64;
        }
        return Syscall.LINUX_ACCESS;
    }

    /**
     * fs.unlinkSync(path)
     * A0 = path (string)
     */
    generateFSUnlinkSync() {
        const vm = this.vm;
        const platform = vm.platform;
        const arch = vm.arch;

        vm.label("_fs_unlink_sync");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // S0 = path

        // Get string content pointer
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_get_string_content");
        vm.mov(VReg.S0, VReg.RET);

        if (platform === "linux" && arch === "arm64") {
            // Linux ARM64: unlinkat(AT_FDCWD, path, 0)
            vm.movImm(VReg.A0, -100); // AT_FDCWD
            vm.mov(VReg.A1, VReg.S0); // path
            vm.movImm(VReg.A2, 0); // flags
        } else {
            // macOS / Linux x64: unlink(path)
            vm.mov(VReg.A0, VReg.S0); // path
        }

        vm.syscall(this.getSyscallNum("unlink"));

        vm.movImm64(VReg.RET, "0x7ffb000000000000");
        vm.epilogue([VReg.S0], 16);
    }

    /**
     * fs.statSync(path)
     * A0 = path (NaN-boxed string)
     * 返回: Stats 对象 (包含 size 属性)
     *
     * Stats 对象布局: [type:8][size:8]
     * type = TYPE_OBJECT (2)
     */
    generateFSStatSync() {
        const vm = this.vm;
        const platform = vm.platform;
        const arch = vm.arch;
        const TYPE_OBJECT = 2;

        // macOS stat64 结构体中 st_size 的偏移量
        // struct stat64 在 macOS 上: st_size 在偏移 96
        // Linux x64 struct stat: st_size 在偏移 48
        // Linux ARM64 struct stat: st_size 在偏移 48
        let sizeOffset = 96; // macOS default
        if (platform === "linux") {
            sizeOffset = 48;
        }

        // stat 结构体大小
        // macOS: 144 bytes, Linux: 144 bytes
        const statBufSize = 144;

        vm.label("_fs_stat_sync");
        vm.prologue(statBufSize + 32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = path (NaN-boxed)

        // 获取字符串内容指针
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_get_string_content");
        vm.mov(VReg.S1, VReg.RET); // S1 = path C string

        // 在栈上分配 stat 结构体缓冲区
        vm.subImm(VReg.S2, VReg.FP, statBufSize); // S2 = &statbuf

        if (platform === "linux" && arch === "arm64") {
            // Linux ARM64: fstatat(AT_FDCWD, path, statbuf, 0)
            vm.movImm(VReg.A0, -100); // AT_FDCWD
            vm.mov(VReg.A1, VReg.S1); // path
            vm.mov(VReg.A2, VReg.S2); // statbuf
            vm.movImm(VReg.A3, 0); // flags
        } else {
            // macOS / Linux x64: stat64(path, statbuf)
            vm.mov(VReg.A0, VReg.S1); // path
            vm.mov(VReg.A1, VReg.S2); // statbuf
        }

        vm.syscall(this.getSyscallNum("stat"));

        // 检查是否成功
        vm.cmpImm(VReg.RET, 0);
        vm.jlt("_fs_stat_sync_fail");

        // 读取 st_size
        vm.load(VReg.S0, VReg.S2, sizeOffset); // S0 = st_size

        // 分配 Stats 对象:
        // 对象结构: [type:8][count:8][__proto__:8] + [key:8][value:8] per property
        // OBJECT_HEADER_SIZE = 24, 每个属性 16 bytes
        vm.movImm(VReg.A0, 48); // 24 + 16 = 40, 但分配 48 对齐
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET); // S1 = Stats 对象

        // 写入类型标记 (offset 0)
        vm.movImm(VReg.V0, TYPE_OBJECT);
        vm.store(VReg.S1, 0, VReg.V0);

        // 写入属性数量 = 1 (offset 8)
        vm.movImm(VReg.V0, 1);
        vm.store(VReg.S1, 8, VReg.V0);

        // 写入 __proto__ = null (offset 16)
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S1, 16, VReg.V0);

        // 写入属性: key = "size" (offset 24)
        vm.lea(VReg.V0, "_str_size");
        vm.store(VReg.S1, 24, VReg.V0);

        // value = st_size (offset 32) (NaN-boxed number)
        // 将 size 转换为 double 并存储
        vm.scvtf(0, VReg.S0); // D0 = (double)st_size
        vm.fmovToInt(VReg.V0, 0);
        vm.store(VReg.S1, 32, VReg.V0);

        // 装箱对象
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_js_box_object");
        vm.jmp("_fs_stat_sync_done");

        vm.label("_fs_stat_sync_fail");
        // 返回 null
        vm.movImm64(VReg.RET, "0x7ffa000000000000"); // JS_NULL

        vm.label("_fs_stat_sync_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], statBufSize + 32);
    }

    generateDataSection(asm) {
        // "size" 字符串用于 Stats 对象
        asm.addDataLabel("_str_size");
        asm.addDataByte(115); // 's'
        asm.addDataByte(105); // 'i'
        asm.addDataByte(122); // 'z'
        asm.addDataByte(101); // 'e'
        asm.addDataByte(0); // null
    }
}
