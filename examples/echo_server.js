// 使用底层 socket 的简单 echo 服务器
// 使用 eval 避免编译器添加前缀

// 创建 Server 对象
const server = eval("_net_create_server_object")();
console.log("Server object created");

// 监听端口
const result = eval("_net_server_listen")(server, 8080, "0.0.0.0");
console.log("Listen result:", result);

if (result === 0) {
    console.log("Server listening on port 8080");

    // 接受连接（单线程，只处理一个连接）
    console.log("Waiting for connection...");
    const clientFd = eval("_net_server_accept")(server);
    console.log("Client connected, fd:", clientFd);

    if (clientFd >= 0) {
        // 分配缓冲区
        const buffer = new ArrayBuffer(1024);

        // 读取数据
        const bytesRead = eval("_net_socket_read")(clientFd, buffer, 1024);
        console.log("Read", bytesRead, "bytes");

        // 回显
        const bytesWritten = eval("_net_socket_write")(clientFd, buffer, bytesRead);
        console.log("Wrote", bytesWritten, "bytes");

        // 关闭连接
        eval("_net_close")(clientFd);
    }

    // 关闭服务器
    const serverFd = 0;
    eval("_net_close")(serverFd);
}

console.log("Server closed");
