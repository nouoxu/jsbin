// 简单的 chat 服务器示例
import { createServer, isIP } from "net";

console.log("=== JSBin Net Module Demo ===");

// 测试 isIP
console.log("\n[IP Detection Test]");
console.log("  192.168.1.1:", isIP("192.168.1.1"), "(should be 4)");
console.log("  ::1:", isIP("::1"), "(should be 6)");
console.log("  localhost:", isIP("localhost"), "(should be 0)");

// 测试 createServer
console.log("\n[Server Creation Test]");
const server = createServer();
console.log("  Server created:", server !== undefined);

// 提示信息
console.log("\n[Note]");
console.log("  Full async server requires more runtime support.");
console.log("  Current status: basic functions work, async callbacks pending.");

console.log("\n=== Demo Complete ===");
