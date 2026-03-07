// JSBin 命令行编译工具

import * as fs from "fs";
import * as path from "path";
import * as compilerModule from "./compiler/index.js";

// 内联 platform 检测函数，避免 ES module export 问题
const TARGETS = {
    "macos-arm64": { os: "macos", arch: "arm64", ext: "", dylibExt: ".dylib", desc: "macOS ARM64" },
    "macos-x64": { os: "macos", arch: "x64", ext: "", dylibExt: ".dylib", desc: "macOS x86_64" },
    "linux-arm64": { os: "linux", arch: "arm64", ext: "", dylibExt: ".so", desc: "Linux ARM64" },
    "linux-x64": { os: "linux", arch: "x64", ext: "", dylibExt: ".so", desc: "Linux x86_64" },
    "windows-x64": { os: "windows", arch: "x64", ext: ".exe", dylibExt: ".dll", desc: "Windows x86_64" },
};

function detectPlatform() {
    const platform = process.platform;
    const arch = process.arch;
    if (platform === "darwin" || platform === "macos") {
        return arch === "arm64" ? "macos-arm64" : "macos-x64";
    } else if (platform === "linux") {
        return arch === "arm64" ? "linux-arm64" : "linux-x64";
    } else if (platform === "win32") {
        return "windows-x64";
    }
    return "linux-x64";
}

function listTargets() {
    return Object.keys(TARGETS);
}

function resolveTarget(os, arch) {
    const key = `${os}-${arch}`;
    return TARGETS[key] ? key : null;
}

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
  --compiler            Generate compiler binary (don't run embedded JS)
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
        compiler: false, // NEW: Generate compiler binary (don't run embedded JS)
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
        } else if (arg === "--compiler") {
            result.compiler = true;
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

const args = process.argv.slice(2);
const opts = parseArgs(args);

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

if (!opts.input) {
    console.error("Error: No input file specified");
    printUsage();
    process.exit(1);
}

// 解析输入文件路径（支持相对路径）
const inputFile = path.resolve(process.cwd(), opts.input);

if (!fs.existsSync(inputFile)) {
    console.error("Error: Input file not found");
    process.exit(1);
}

// 确定目标平台
let target;
if (opts.target) {
    target = opts.target;
} else if (opts.os && opts.arch) {
    target = opts.os + "-" + opts.arch;
} else if (opts.os || opts.arch) {
    const detected = detectPlatform();
    const parts = detected.split("-");
    const detectedOs = parts[0];
    const detectedArch = parts[1];
    target = (opts.os || detectedOs) + "-" + (opts.arch || detectedArch);
} else {
    target = detectPlatform();
}

// 验证目标
let validTargets = ["macos-arm64", "macos-x64", "linux-arm64", "linux-x64", "windows-arm64", "windows-x64"];
let isValid = false;
for (let i = 0; i < validTargets.length; i++) {
    if (validTargets[i] === target) {
        isValid = true;
        break;
    }
}
if (!isValid) {
    console.error("Error: invalid target");
    console.log("Use --list-targets to see supported targets");
    process.exit(1);
}

// 确定输出文件名
let output = opts.output;
if (!output) {
    const inputDir = path.dirname(inputFile);
    const inputBase = path.basename(inputFile, ".js");

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
    output = path.resolve(process.cwd(), output);
}

// 添加 Windows 的 .exe 后缀
if (!opts.shared && !opts.static && target.includes("windows") && !output.endsWith(".exe")) {
    output += ".exe";
}

// 确定输出类型描述
let outputTypeDesc = "executable";
if (opts.shared) outputTypeDesc = "shared library";
if (opts.static) outputTypeDesc = "static library";

console.log("Compiling...");
console.log("  input:", inputFile);
console.log("  output:", output);
console.log("  target:", target);
console.log("  type:", outputTypeDesc);

try {
    const compiler = compilerModule.createCompiler(target);

    // 设置源文件路径
    compiler.setSourcePath(inputFile);

    // 设置编译选项
    if (opts.shared) {
        compiler.setOutputType("shared");
    } else if (opts.static) {
        compiler.setOutputType("static");
    }

    if (opts.noJslib) {
        compiler.setOption("noJslib", true);
    }

    if (opts.dumpAsm) {
        compiler.setOption("dumpAsm", true);
    }

    if (opts.sourceMap) {
        compiler.setOption("sourceMap", true);
    }

    if (opts.gc) {
        compiler.setOption("gc", true);
    }

    if (opts.compiler) {
        compiler.setOption("compiler", true);
    }

    for (const exp of opts.exports) {
        compiler.addExport(exp);
    }

    for (const lib of opts.libs) {
        compiler.addLibrary(lib);
    }

    for (const libPath of opts.libPaths) {
        compiler.addLibraryPath(libPath);
    }

    compiler.compileFile(inputFile, output);
    console.log(`Successfully compiled: ${output}`);
} catch (e) {
    console.error(`Compilation error: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
}
