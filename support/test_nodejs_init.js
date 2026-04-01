import os from "os";
import fs from "fs";
import path from "path";
import process from "process";
import buffer from "buffer";
import crypto from "crypto";

console.log("Testing Node.js modules initialization...");

try {
    console.log("os.platform():", os.platform());
    console.log("path.sep:", path.sep);
    console.log("process.version:", process.version);
    console.log("Buffer exists:", typeof buffer.Buffer || typeof Buffer);
    console.log("fs.existsSync exists:", typeof fs.existsSync);
    console.log("crypto.randomUUID():", crypto.randomUUID());
    
    // 测试 fs.existsSync（会调用 getSyscall）
    const exists = fs.existsSync(".");
    console.log("fs.existsSync('.'):", exists);

    console.log("\nSUCCESS: All modules initialized and accessible without SIGSEGV!");
} catch (e) {
    console.log("\nFAILURE: Caught exception:", e);
}
