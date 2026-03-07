// Simplified CLI - 使用 require 避免 ES6 import 问题

const fs = require("fs");
const path = require("path");

let Compiler;
try {
    Compiler = require("./compiler/index.js");
} catch (e) {
    console.error("Failed to load compiler:", e.message);
    process.exit(1);
}

function detectPlatform() {
    const p = process.platform;
    const a = process.arch;
    if (p === "darwin" || p === "macos") return a === "arm64" ? "macos-arm64" : "macos-x64";
    if (p === "linux") return a === "arm64" ? "linux-arm64" : "linux-x64";
    return "linux-x64";
}

const args = process.argv.slice(2);
let input = null;
let output = null;

for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" && i + 1 < args.length) {
        output = args[i + 1];
        i++;
    } else if (!args[i].startsWith("-")) {
        input = args[i];
    }
}

if (!input) {
    console.log("Usage: cli_simple.cjs <input.js> [-o output]");
    process.exit(1);
}

if (!output) {
    const base = path.basename(input, ".js");
    output = base + "-" + detectPlatform();
}

console.log("Compiling", input, "to", output);

try {
    const compiler = Compiler.createCompiler(detectPlatform());
    compiler.compileFile(input, output);
    console.log("Successfully compiled:", output);
} catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
}
