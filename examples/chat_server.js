// 简单的 TCP Echo 服务器
// 使用 net 模块

import { createServer } from "net";

// 创建服务器
const server = createServer((socket) => {
    console.log("Client connected");

    // 接收数据
    socket.on("data", (data) => {
        console.log("Received:", data.toString());
        // 回显
        socket.write("Echo: " + data.toString());
    });

    socket.on("end", () => {
        console.log("Client disconnected");
    });
});

server.listen(8080, () => {
    console.log("Server listening on port 8080");
});
