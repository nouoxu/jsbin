// JSBin 命令行编译工具
console.log("[TOP] cli.js starting");

import * as fs from "fs";
import * as path from "path";
// import { fileURLToPath } from "url";

console.log("[TOP] After fs/path imports");

import { Compiler } from "./compiler/index.js";
import { detectPlatform, resolveTarget, listTargets } from "./compiler/core/platform.js";

console.log("[TOP] After all imports");

if (process.env && process.env.DEBUG_ARGV) {
    // 打印 argv 并提前退出，便于自举二进制调试
    try {
        console.log("[DEBUG_ARGV] len=", process.argv.length);
        for (let i = 0; i < process.argv.length; i++) {
            console.log(`[argv ${i}]`, String(process.argv[i]));
        }
    } catch (e) {
        console.log("[DEBUG_ARGV] error", e && e.message);
    }
    process.exit(0);
}

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

function printUsage() {
    console.log(`
JSBin Compiler - JavaScript to Native

Usage:
  jsbin <input.js> [options]

Options:
  -o, --output <file>   Output file path (default: input basename + target)
  --os <os>             Target OS: linux, macos, windows
  --arch <arch>         Target architecture: arm64, x64
  --target <target>     Target platform (e.g., macos-arm64, linux-x64)
  --shared              Build shared library (.dylib/.so/.dll)
  --static              Build static library (.a/.lib)
  --no-jslib            Don't generate .jslib declaration file
  --source-map          Generate source map file (.map)
  --gc                  Enable Generational GC (experimental)
  --export <name>       Export symbol (can be used multiple times)
  --lib <name>          Link with library
  --lib-path <path>     Add library search path
  --list-targets        List all supported targets
  --debug               Enable debug output
  --dump-asm            Dump generated assembly/instructions
  -h, --help            Show this help

Examples:
  jsbin hello.js                              # Compile for current platform
  jsbin hello.js -o hello                     # Custom output name
  jsbin hello.js --os linux --arch x64        # Cross-compile to Linux x64
  jsbin hello.js --target macos-arm64         # Cross-compile to macOS ARM64
  jsbin hello.js --shared -o libmy.dylib      # Build shared library
  jsbin hello.js --static -o libmy.a          # Build static library
  jsbin hello.js --source-map                 # Generate source map
  jsbin app.js --lib mylib --lib-path ./libs  # Link with library
`);
}

function parseArgs(args) {
    const result = {
        input: null,
        output: null,
        os: null,
        arch: null,
        target: null,
        help: false,
        listTargets: false,
        debug: false,
        dumpAsm: false,
        shared: false,
        static: false,
        noJslib: false,
        sourceMap: false,
        gc: true,
        exports: [],
        libs: [],
        libPaths: [],
    };

    let i = 0;
    while (i < args.length) {
        const arg = args[i];

        if (arg === "-h" || arg === "--help") {
            result.help = true;
        } else if (arg === "--list-targets") {
            result.listTargets = true;
        } else if (arg === "--debug") {
            result.debug = true;
        } else if (arg === "--dump-asm") {
            result.dumpAsm = true;
        } else if (arg === "--shared") {
            result.shared = true;
        } else if (arg === "--static") {
            result.static = true;
        } else if (arg === "--no-jslib") {
            result.noJslib = true;
        } else if (arg === "--source-map") {
            result.sourceMap = true;
        } else if (arg === "--gc") {
            result.gc = true;
        } else if (arg === "-o" || arg === "--output") {
            i++;
            result.output = args[i];
        } else if (arg === "--os") {
            i++;
            result.os = args[i];
        } else if (arg === "--arch") {
            i++;
            result.arch = args[i];
        } else if (arg === "-t" || arg === "--target") {
            i++;
            result.target = args[i];
        } else if (arg === "--export") {
            i++;
            result.exports.push(args[i]);
        } else if (arg === "--lib" || arg === "-l") {
            i++;
            result.libs.push(args[i]);
        } else if (arg === "--lib-path" || arg === "-L") {
            i++;
            result.libPaths.push(args[i]);
        } else if (!arg.startsWith("-")) {
            result.input = arg;
        } else {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
        }
        i++;
    }

    return result;
}

console.log("[M1] start");
const args = process.argv.slice(2);
console.log("[M2] after slice");
const opts = parseArgs(args);
console.log("[M3] after parseArgs");
console.log("[M4] opts.input =", opts.input);

if (opts.help) {
    printUsage();
    process.exit(0);
}

if (opts.listTargets) {
    console.log("Supported targets:");
    for (const target of listTargets()) {
        console.log(`  ${target}`);
    }
    process.exit(0);
}

console.log("[M5] before input check");
if (!opts.input) {
    console.error("Error: No input file specified");
    printUsage();
    process.exit(1);
}
console.log("[M6] after input check");

// 解析输入文件路径（支持相对路径）
console.log("[DEBUG] Before path.resolve");
const inputFile = path.resolve(process.cwd(), opts.input);
console.log("[DEBUG] After path.resolve, before log");
console.log("[DEBUG] inputFile =", inputFile);
console.log("[DEBUG] After log 1");
console.log("[A1]");

if (!fs.existsSync(inputFile)) {
    console.error("Error: Input file not found");
    process.exit(1);
}
console.log("[A2]");

// 确定目标平台
let target;
console.log("[A2.1] opts.target =", opts.target);
console.log("[A2.2] opts.os =", opts.os);
console.log("[A2.3] opts.arch =", opts.arch);
if (opts.target) {
    target = opts.target;
    console.log("[A3a] using opts.target");
} else if (opts.os && opts.arch) {
    // target = `${opts.os}-${opts.arch}`;
    target = opts.os + "-" + opts.arch;
    console.log("[A3b] using os-arch concat");
} else if (opts.os || opts.arch) {
    console.log("[A3c-1] calling detectPlatform");
    const detected = detectPlatform();
    console.log("[A3c-2] detected =", detected);
    console.log("[A3c-3] before split");
    const parts = detected.split("-");
    console.log("[A3c-4] after split");
    const detectedOs = parts[0];
    const detectedArch = parts[1];
    console.log("[A3c-5] detectedOs =", detectedOs);
    console.log("[A3c-6] detectedArch =", detectedArch);
    // target = `${opts.os || detectedOs}-${opts.arch || detectedArch}`;
    target = (opts.os || detectedOs) + "-" + (opts.arch || detectedArch);
    console.log("[A3c] using partial detect");
} else {
    target = detectPlatform();
    console.log("[A3d] using full detect");
}
console.log("[A4] target =", target);

// 验证目标
try {
    resolveTarget(target);
} catch (e) {
    console.error("Error: invalid target");
    console.log("Use --list-targets to see supported targets");
    process.exit(1);
}
console.log("[A5]");

// 确定输出文件名
let output = opts.output;
if (!output) {
    // 默认输出文件名：去掉 .js 后缀，使用输入文件的目录
    const inputDir = path.dirname(inputFile);
    const inputBase = path.basename(inputFile, ".js");

    // 根据输出类型添加适当的后缀
    if (opts.shared) {
        const ext = target.startsWith("macos") ? ".dylib" : target.startsWith("windows") ? ".dll" : ".so";
        output = path.join(inputDir, `lib${inputBase}${ext}`);
    } else if (opts.static) {
        const ext = target.startsWith("windows") ? ".lib" : ".a";
        output = path.join(inputDir, `lib${inputBase}${ext}`);
    } else {
        output = path.join(inputDir, `${inputBase}-${target}`);
    }
} else {
    // 解析输出路径
    output = path.resolve(process.cwd(), output);
}

// 添加 Windows 的 .exe 后缀（仅可执行文件）
if (!opts.shared && !opts.static && target.includes("windows") && !output.endsWith(".exe")) {
    output += ".exe";
}

// 确定输出类型描述
let outputTypeDesc = "executable";
if (opts.shared) outputTypeDesc = "shared library";
if (opts.static) outputTypeDesc = "static library";

console.log("[DEBUG] Before template inputFile");
console.log("[DEBUG] inputFile =", inputFile);
console.log("[DEBUG] 1");
console.log("[DEBUG] Before template, output =", output);
console.log("[DEBUG] 2");
console.log("[DEBUG] target =", target);
console.log("[DEBUG] 3");
console.log("[DEBUG] outputTypeDesc =", outputTypeDesc);
console.log("[DEBUG] 4");
// 临时禁用字符串连接
console.log("Compiling...");
console.log("[DEBUG] 5");
console.log("  input:", inputFile);
console.log("[DEBUG] 6");
console.log("  output:", output);
console.log("[DEBUG] 7");
console.log("  target:", target);
console.log("[DEBUG] 8");
console.log("  type:", outputTypeDesc);
console.log("[DEBUG] 9");

try {
    console.log("[DEBUG] 9.1] Creating compiler");
    const compiler = new Compiler(target);
    console.log("[DEBUG] 9.2] Compiler created");

    // 设置源文件路径（用于解析相对路径的 jslib）
    compiler.setSourcePath(inputFile);
    console.log("[DEBUG] 9.3] Source path set");

    // 设置编译选项
    if (opts.shared) {
        compiler.setOutputType("shared");
    } else if (opts.static) {
        compiler.setOutputType("static");
    }

    // 设置 jslib 生成选项
    if (opts.noJslib) {
        compiler.setOption("noJslib", true);
    }

    // 设置 dump-asm 选项
    if (opts.dumpAsm) {
        compiler.setOption("dumpAsm", true);
    }

    // 设置 source-map 选项
    if (opts.sourceMap) {
        compiler.setOption("sourceMap", true);
    }

    // 设置分代 GC 选项
    if (opts.gc) {
        compiler.setOption("gc", true);
    }

    // 添加导出符号
    for (const exp of opts.exports) {
        compiler.addExport(exp);
    }

    // 添加库链接
    for (const lib of opts.libs) {
        compiler.addLibrary(lib);
    }

    // 添加库搜索路径
    for (const libPath of opts.libPaths) {
        compiler.addLibraryPath(libPath);
    }

    console.log("[DEBUG] 9.4] Calling compileFile");
    console.log("[DEBUG] inputFile =", inputFile);
    console.log("[DEBUG] output =", output);
    compiler.compileFile(inputFile, output);
    console.log(`Successfully compiled: ${output}`);
} catch (e) {
    console.error(`Compilation error: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
}
