// Minimal bootstrap CLI - 只包含编译所需的最少代码

const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

if (!input || !output) {
    console.log("Usage: bootstrap_min.js <input.js> -o <output>");
    process.exit(1);
}

console.log("Bootstrap CLI");
console.log("Input:", input);
console.log("Output:", output);

// 读取源文件
const source = fs.readFileSync(input, "utf-8");
console.log("Source length:", source.length);

// 直接调用 node cli.js 进行编译
const { spawnSync } = require("child_process");
const result = spawnSync("node", ["cli.js", input, "-o", output], {
    cwd: __dirname,
    encoding: "utf-8"
});

console.log(result.stdout);
if (result.stderr) {
    console.error(result.stderr);
}

console.log("Done");
