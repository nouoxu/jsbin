// 网络 API 导出模块
// 提供底层 socket 函数

import { createServer } from "net";

// 导出底层函数
export const netAPI = {
    createServerObject: () => createServer(), // 使用高层 API
    // 下面这些需要运行时支持
};

// 由于当前运行时不支持完整功能，这里做一个简单的包装
export function startEchoServer(port) {
    console.log("Starting echo server on port", port);
    console.log("Note: Full async server requires more runtime support");

    const server = createServer((socket) => {
        console.log("Client connected");

        socket.on("data", (data) => {
            console.log("Received:", data.toString());
            socket.write("Echo: " + data.toString());
        });

        socket.on("end", () => {
            console.log("Client disconnected");
        });
    });

    server.listen(port, () => {
        console.log("Server listening on port", port);
    });

    return server;
}
