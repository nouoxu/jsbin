# jsbin

A preview-stage JavaScript-to-native compiler that translates JavaScript code into standalone native executables.

## Current Status

`jsbin` is a **preview** compiler for a substantial ES subset with partial ESM support and a limited Node core shim subset. It is not yet fully self-bootstrapping.

## What Works Today

- Modern JavaScript syntax: arrow functions, async/await, promises, classes, modules
- ESM import/export flows (validated via in-repo fixtures)
- Node-style builtins: `console`, `process`, `fs` (partial), `path`, `timers`, `os`
- Native executable output for supported programs

## What Doesn't Work (Known Gaps)

- Full ECMAScript support
- Full Node.js compatibility
- Self-bootstrapping (cannot compile itself yet)

## Quick Start

```bash
# Compile a JavaScript file
node cli.js examples/helloworld.js

# Run test fixtures
npm run test:fixtures
```

## Project Structure

```
jsbin/
├── cli.js           # Compiler CLI entry point
├── compiler/        # JavaScript → IR → assembly compiler
├── runtime/         # Runtime shims (console, fs, process, etc.)
│   └── node/        # Node-style API implementations
├── asm/             # ARM64 and x64 instruction encoding
├── backend/         # Binary emission (ELF/Mach-O/PE)
├── lang/            # Lexer, parser, AST
└── tests/
    └── fixtures/    # Test cases for ES, modules, Node subsets
```

## Allowed Release Messaging

- "preview" / "experimental"
- "supports a substantial ES subset"
- "includes a limited Node core shim subset"
- "validated primarily through repository fixtures"

## Not Allowed

- "full ES support"
- "full Node support"
- "drop-in Node replacement"
- "production-ready"
- "self-hosting" or "fully self-bootstrapping"

## Before Any Release

```bash
npm install
npm run release:check
```

See [`docs/RELEASE_READINESS.md`](docs/RELEASE_READINESS.md) for full release criteria.
