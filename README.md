# JSBin - JavaScript to Native Machine Code Compiler

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue.svg" alt="Platform">
  <img src="https://img.shields.io/badge/Architecture-ARM64%20%7C%20x64-green.svg" alt="Architecture">
  <img src="https://img.shields.io/badge/Bootstrap-97.5%25-success.svg" alt="Bootstrap">
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
| Bootstrap | **97.5%** | - | - |

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
- Simple CLI: `jsbin input.js -o output`
- Source maps support
- Detailed error messages
- Multiple output formats (executable, static library, dynamic library)

---

## 📊 Project Status

| Component | Status |
|-----------|--------|
| Lexer/Parser | ✅ 96% |
| Type System | ✅ 75% |
| Runtime | ✅ 92% |
| Code Generation | ✅ 96% |
| Bootstrap | ✅ 97.5% (236/242 tests) |

---

## 🛠️ Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/nouoxu/jsbin.git
cd jsbin

# Install dependencies
npm install
```

### Compile Your First Program

```bash
# Compile JavaScript to native binary
./cli input.js -o output

# Or use the standalone version
./cli-standalone input.js -o output
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
./cli hello.js -o hello
./hello
# Output: Hello, World!
```

---

## 📖 Usage

### CLI Options

```bash
jsbin [options] input.js -o output

Options:
  -o, --output <file>    Output file path
  -t, --target <target>  Target platform (macos, linux, windows)
  -a, --arch <arch>      Target architecture (arm64, x64)
  -O, --optimize         Enable optimizations
  -d, --debug            Include debug info
  -h, --help             Show help
```

### Targets

| Platform | Arch | Command |
|----------|------|---------|
| macOS | ARM64 | `./cli input.js -t macos -a arm64 -o output` |
| macOS | x64 | `./cli input.js -t macos -a x64 -o output` |
| Linux | ARM64 | `./cli input.js -t linux -a arm64 -o output` |
| Linux | x64 | `./cli input.js -t linux -a x64 -o output` |
| Windows | x64 | `./cli input.js -t windows -a x64 -o output.exe` |

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

## 🔬 Technical Highlights

### NaN-boxing Value Representation
64-bit unified representation for all JavaScript values:
- **Doubles**: Direct IEEE 754 storage
- **Tagged**: `[tag:16][payload:48]`
- **Tags**: int(0), bool(1), null(2), undefined(3), string(4), object(5), array(6), function(7)

### Self-Hosting
JSBin compiles itself! The compiler is written in JavaScript and compiles to native code, achieving **97.5% bootstrap completion**.

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

---

## 🙏 Acknowledgments

Inspired by:
- [QuickJS](https://github.com/bellard/quickjs) - Fabrice Bellard's amazing JS engine
- [C compilers](https://github.com/rui314/chibicc) - Compilers for learning
- [The Super Tiny Compiler](https://github.com/jamiebuilds/the-super-tiny-compiler)

---

**Star us if you find this project interesting!** 🌟

<a href="https://github.com/nouoxu/jsbin">
  <img src="https://img.shields.io/github/stars/nouoxu/jsbin?style=social" alt="GitHub stars">
</a>
