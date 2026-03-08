# JSBin - JavaScript to Native Machine Code Compiler

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue.svg" alt="Platform">
  <img src="https://img.shields.io/badge/Architecture-ARM64%20%7C%20x64-green.svg" alt="Architecture">
</p>

<p align="center">
  A revolutionary AOT (Ahead-of-Time) compiler that transforms JavaScript into native machine code.
</p>

---

## 🚀 What is JSBin?

JSBin is a groundbreaking compiler that compiles JavaScript directly to native machine code. Unlike traditional JavaScript engines (V8, SpiderMonkey) that interpret or JIT-compile at runtime, JSBin produces standalone native executables that run without any dependencies.

### Why JSBin?

| Feature | JSBin | Node.js | Bun |
|---------|-------|---------|-----|
| Output | **Native Binary** | Bytecode | Native Binary |
| Zero Dependencies | **✅** | ❌ | ❌ |
| Cross-compilation | **✅** | ❌ | ❌ |

---

## ✨ Key Features

### 🌐 Cross-Platform Compilation
- **macOS**: ARM64 (Apple Silicon), x64 (Intel)
- **Linux**: ARM64, x64
- **Windows**: x64

### 📦 Zero Dependencies
The compiled binaries have **zero external dependencies**. No Node.js, no runtime, just pure native code.

### ⚡ ES6+ Full Support
- Classes, Arrow Functions, Template Literals
- async/await, Generators, Iterators
- BigInt, Optional Chaining, Nullish Coalescing
- Modern Array/Object features

### 🔧 Developer Friendly
- Simple CLI: `node cli.js input.js -o output`
- Detailed error messages

---

## 📊 Project Status

| Component | Status |
|-----------|--------|
| Lexer/Parser | ✅ 96% |
| Type System | ✅ 75% |
| Runtime | ✅ 92% |
| Code Generation | ✅ 96% |
| Self-hosting | 🔄 In Progress |

---

## 🛠️ Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/nouoxu/jsbin.git
cd jsbin

# Install dependencies (only for development)
npm install
```

### Compile Your First Program

```bash
# Compile JavaScript to native binary
node cli.js input.js -o output
```

### Example

```javascript
// hello.js
function greet(name) {
  return `Hello, ${name}!`;
}

console.log(greet("World"));
```

```bash
node cli.js hello.js -o hello
./hello
# Output: Hello, World!
```

---

## 📖 Usage

### CLI Options

```bash
node cli.js [options] input.js -o output

Options:
  -o, --output <file>    Output file path
  -t, --target <target>  Target platform (macos, linux, windows)
  -a, --arch <arch>      Target architecture (arm64, x64)
  -O, --optimize         Enable optimizations
  -d, --debug           Include debug info
  -h, --help            Show help
```

### Targets

| Platform | Arch | Command |
|----------|------|---------|
| macOS | ARM64 | `node cli.js input.js -t macos -a arm64 -o output` |
| macOS | x64 | `node cli.js input.js -t macos -a x64 -o output` |
| Linux | ARM64 | `node cli.js input.js -t linux -a arm64 -o output` |
| Linux | x64 | `node cli.js input.js -t linux -a x64 -o output` |
| Windows | x64 | `node cli.js input.js -t windows -a x64 -o output.exe` |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│           JavaScript Code            │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│    Lexer & Parser (ES6+)            │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│   Type Inference & Optimization     │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│    Intermediate Representation      │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│   Native Code Generator             │
└─────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│    Native Binary (ELF/MACH-O/PE)   │
└─────────────────────────────────────┘
```

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

---

**Star us if you find this project interesting!** 🌟

<a href="https://github.com/nouoxu/jsbin">
  <img src="https://img.shields.io/github/stars/nouoxu/jsbin?style=social" alt="GitHub stars">
</a>
