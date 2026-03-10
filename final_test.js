import * as fs from "fs";
import * as path from "path";

// Test path module
console.log("=== Path Module Tests ===");
console.log("isAbsolute /test:", path.isAbsolute("/test"));
console.log("isAbsolute test:", path.isAbsolute("test"));
console.log("dirname /a/b/c.js:", path.dirname("/a/b/c.js"));
console.log("basename /a/b/c.js:", path.basename("/a/b/c.js"));
console.log("join a b:", path.join("a", "b"));

// Test fs module  
console.log("\n=== FS Module Tests ===");
fs.writeFileSync("final_test_out.txt", "Test content");
const content = fs.readFileSync("final_test_out.txt", "utf8");
console.log("readFileSync result:", content);
console.log("existsSync final_test_out.txt:", fs.existsSync("final_test_out.txt"));

// Test process module
console.log("\n=== Process Module Tests ===");
console.log("argv length:", process.argv.length);
console.log("platform:", process.platform);

console.log("\n=== All tests completed ===");
