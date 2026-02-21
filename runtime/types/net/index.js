// JSBin Net 运行时
// 提供网络操作的运行时实现 (TCP/UDP)

import { VReg } from "../../../vm/registers.js";
import { Syscall } from "../../core/syscall.js";
import { JS_NULL, JS_UNDEFINED } from "../../core/jsvalue.js";

// Socket 类型
const SOCK_STREAM = 1; // TCP
const SOCK_DGRAM = 2;  // UDP

// 地址族
const AF_INET = 2;    // IPv4
const AF_INET6 = 10;  // IPv6

// Socket 选项
const SOL_SOCKET = 1;
const SO_REUSEADDR = 2;

export class NetGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        // 生成所有网络函数
        this.generateSocket();
        this.generateBind();
        this.generateListen();
        this.generateAccept();
        this.generateConnect();
        this.generateSendTo();
        this.generateRecvFrom();
        this.generateShutdown();
        this.generateClose();
        this.generateNetIsIP();
        this.generateNetCreateServer();
        this.generateNetCreateConnection();
    }

    getSyscallNum(name) {
        const platform = this.vm.platform;
        const arch = this.vm.arch;

        if (platform === "windows") return -1;

        const isArm64 = arch === "arm64";
        const isMac = platform === "macos";

        const key = platform.toUpperCase() + "_" + name.toUpperCase() + (isArm64 ? "_ARM64" : "_X64");
        return Syscall[key] || -1;
    }

    // socket(domain, type, protocol) -> fd
    generateSocket() {
        const vm = this.vm;
        vm.label("_net_socket");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2]);

        // A0: domain (int)
        // A1: type (int)
        // A2: protocol (int)

        vm.mov(VReg.A0, VReg.A0); // domain
        vm.mov(VReg.A1, VReg.A1); // type
        vm.mov(VReg.A2, VReg.A2); // protocol

        vm.syscall(this.getSyscallNum("socket"));

        // RET = fd (或 -1 错误)
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 0);
    }

    // bind(fd, port, ip) -> 0 成功，-1 失败
    generateBind() {
        const vm = this.vm;
        vm.label("_net_bind");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // A0: fd
        // A1: port (int)
        // A2: ip (string)

        vm.mov(VReg.S0, VReg.A0); // fd
        vm.mov(VReg.S1, VReg.A1); // port

        // 构建 sockaddr_in 结构
        // sin_family(2) + sin_port(2) + sin_addr(4) + sin_zero(8) = 16 bytes
        vm.movImm(VReg.A0, 16); // 分配 16 字节
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET); // S2 = sockaddr 结构

        // sin_family = AF_INET (2)
        vm.movImm(VReg.V0, AF_INET);
        vm.store(VReg.S2, 0, VReg.V0);

        // sin_port = port (网络字节序)
        // 简单处理：假设 port 是小端序
        vm.mov(VReg.V0, VReg.S1);
        vm.store(VReg.S2, 2, VReg.V0);

        // sin_addr = 0 (INADDR_ANY)
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S2, 4, VReg.V0);

        // 调用 bind(fd, addr, addrlen)
        vm.mov(VReg.A0, VReg.S0); // fd
        vm.mov(VReg.A1, VReg.S2); // addr
        vm.movImm(VReg.A2, 16);    // addrlen

        vm.syscall(this.getSyscallNum("bind"));

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    }

    // listen(fd, backlog) -> 0 成功，-1 失败
    generateListen() {
        const vm = this.vm;
        vm.label("_net_listen");
        vm.prologue(0, []);

        vm.syscall(this.getSyscallNum("listen"));
    }

    // accept(fd) -> new_fd
    generateAccept() {
        const vm = this.vm;
        vm.label("_net_accept");
        vm.prologue(0, []);

        // sockaddr_in 结构用于接收客户端地址
        vm.movImm(VReg.A1, 0); // addr (NULL)
        vm.movImm(VReg.A2, 0); // addrlen (NULL)

        vm.syscall(this.getSyscallNum("accept"));
    }

    // connect(fd, port, ip) -> 0 成功，-1 失败
    generateConnect() {
        const vm = this.vm;
        vm.label("_net_connect");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // fd
        vm.mov(VReg.S1, VReg.A1); // port

        // 构建 sockaddr_in
        vm.movImm(VReg.A0, 16);
        vm.call("_alloc");
        vm.mov(VReg.S2, VReg.RET);

        vm.movImm(VReg.V0, AF_INET);
        vm.store(VReg.S2, 0, VReg.V0);

        vm.mov(VReg.V0, VReg.S1);
        vm.store(VReg.S2, 2, VReg.V0);

        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S2, 4, VReg.V0);

        // connect(fd, addr, addrlen)
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S2);
        vm.movImm(VReg.A2, 16);

        vm.syscall(this.getSyscallNum("connect"));

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 0);
    }

    // sendto(fd, data, length, flags, addr, addrlen) -> bytes sent
    generateSendTo() {
        const vm = this.vm;
        vm.label("_net_sendto");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // fd

        // 获取字符串内容
        vm.mov(VReg.A0, VReg.A1);
        vm.call("_js_unbox");
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_get_string_content");

        vm.mov(VReg.A1, VReg.RET); // buffer
        vm.mov(VReg.A2, VReg.A2); // length

        vm.movImm(VReg.A3, 0); // flags
        vm.movImm(VReg.A4, 0); // addr (NULL for connected socket)
        vm.movImm(VReg.A5, 0); // addrlen

        vm.syscall(this.getSyscallNum("sendto"));

        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // recvfrom(fd, buffer, length, flags, addr, addrlen) -> bytes received
    generateRecvFrom() {
        const vm = this.vm;
        vm.label("_net_recvfrom");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // fd

        // 分配接收缓冲区
        vm.mov(VReg.A0, VReg.A2); // length
        vm.call("_alloc");
        vm.mov(VReg.A1, VReg.RET); // buffer

        vm.movImm(VReg.A2, VReg.A2); // length
        vm.movImm(VReg.A3, 0); // flags
        vm.movImm(VReg.A4, 0); // addr
        vm.movImm(VReg.A5, 0); // addrlen

        vm.syscall(this.getSyscallNum("recvfrom"));

        // RET = bytes received

        vm.epilogue([VReg.S0], 0);
    }

    // shutdown(fd, how) -> 0 成功，-1 失败
    generateShutdown() {
        const vm = this.vm;
        vm.label("_net_shutdown");
        vm.prologue(0, []);

        vm.syscall(this.getSyscallNum("shutdown"));
    }

    // close(fd) -> 0 成功，-1 失败
    generateClose() {
        const vm = this.vm;
        vm.label("_net_close");
        vm.prologue(0, []);

        vm.syscall(this.getSyscallNum("close"));
    }

    // net.isIP(str) -> 0 不是 IP，4 是 IPv4，6 是 IPv6
    generateNetIsIP() {
        const vm = this.vm;
        vm.label("_net_isIP");

        // 简化实现：直接返回 0
        vm.movImm(VReg.RET, 0);
        vm.ret();
    }

    // net.createServer() - 创建服务器
    generateNetCreateServer() {
        const vm = this.vm;
        vm.label("_net_create_server");
        vm.label("_net_createServer");
        vm.prologue(0, []);

        // TODO: 完整实现
        // 返回一个包含 listen 方法的对象

        // 暂时返回 undefined
        vm.movImm64(VReg.RET, "0x7ffb000000000000"); // undefined

        vm.epilogue([], 0);
    }

    // net.createConnection() - 创建连接
    generateNetCreateConnection() {
        const vm = this.vm;
        vm.label("_net_create_connection");
        vm.prologue(0, []);

        // TODO: 完整实现

        vm.movImm64(VReg.RET, "0x7ffb000000000000"); // undefined

        vm.epilogue([], 0);
    }

    generateDataSection(asm) {
        // 网络模块目前没有需要的数据段
    }
}
