# JSBin JavaScript 编译器

## 项目概述

JSBin 是一个将 JavaScript 编译为原生机器码的 AOT (Ahead-of-Time) 编译器，支持多平台输出。

| 类别 | 完成度 | 说明 |
|------|--------|------|
| 语法分析 | 95% | ES6+ 语法解析，支持类、箭头函数、模板字符串、解构、Generator、装饰器 |
| 类型系统 | 75% | NaN-boxing、静态类型推断、typeof/instanceof、TypedArray 子类型 |
| 运行时 | 90% | Array/String/Math/Date/Map/Set 完整；JSON/Generator 有 bug |
| 代码生成 | 90% | macOS/Linux/Windows，ARM64/x64，模块链接，类继承原型链 |
| 异步支持 | 90% | async/await 正常；Generator 崩溃 |
| 迭代器 | 95% | Iterator Protocol，for-of，for await...of |
| 优化器 | 30% | 常量折叠(数字/字符串/位运算)、死代码消除、闭包变量分析 |

---

## 平台支持

| 平台 | 架构 | 可执行 | 动态库 | 静态库 |
|------|------|--------|--------|--------|
| macOS | ARM64 | ✅ Mach-O | ✅ .dylib | ✅ .a |
| macOS | x64 | ✅ Mach-O | ✅ .dylib | ✅ .a |
| Linux | ARM64 | ✅ ELF64 | ✅ .so | ✅ .a |
| Linux | x64 | ✅ ELF64 | ✅ .so | ✅ .a |
| Windows | x64 | ✅ PE64 | ✅ .dll | ✅ .a |

---

## ECMAScript 支持

| 版本 | 特性 | 状态 |
|------|------|------|
| ES5 | 基础语法、函数、数组、对象、异常处理 | ✅ 完整 |
| ES6 | 箭头函数、类、模板字符串、let/const、解构、展开、for-of、Iterator、Generator | ✅ 完整 |
| ES7 | Array.includes、指数运算符 | ✅ 完整 |
| ES8 | async/await、Object.entries/values | ✅ async/await |
| ES9 | 异步迭代 (for await...of)、对象展开、Promise.finally | ✅ 完整 |
| ES10 | Array.flat/flatMap、Object.fromEntries、String.trim | ✅ flat |
| ES11 | 可选链 ?.、空值合并 ??、BigInt | ✅ ?./?? |
| ES12 | 逻辑赋值、数字分隔符、Promise.any | ✅ 完整 |
| ES13 | at() 方法、私有字段 #field | ✅ 完整 |

---

## 已实现功能

### 类型系统
- [x] **NaN-boxing 值编码**: 64 位统一表示所有 JS 值
  - double: 直接存储 IEEE 754
  - tagged: `[0x7FF8-0x7FFF:16][tag:3][payload:48]`
  - tags: int32(0), bool(1), null(2), undefined(3), string(4), object(5), array(6), function(7)
- [x] **静态类型推断**: 编译时追踪变量类型 (`compiler/core/types.js`)
  - 字面量推断: number/string/boolean/null/undefined/RegExp
  - 表达式推断: new、成员访问、函数调用、二元/一元运算
  - 类型兼容性检查与错误收集
- [x] **运行时类型检测**: typeof/instanceof 运算符
  - NaN-boxing tag 检测
  - 堆对象类型头部检测
  - 数据段字符串识别
- [x] **Number 子类型**: Int8/16/32/64, Uint8/16/32/64, Float16/32/64
- [x] **TypedArray 子类型编码**: payload bits 44-47 编码子类型
- [x] **堆对象类型标记**: 统一头部 `[type:8][length:8][...]`
  - TYPE_ARRAY(1), OBJECT(2), CLOSURE(3), MAP(4), SET(5), STRING(6)
  - TYPE_DATE(7), REGEXP(8), PROMISE(11), NUMBER(13), ITERATOR(14)
  - TypedArray: 0x40-0x61 (Int8Array ~ Float64Array)

### 值类型
- [x] 类型标签: INT, FLOAT, STRING, BOOLEAN, NULL, UNDEFINED, ARRAY, OBJECT, FUNCTION, DATE, MAP, SET, REGEXP, NUMBER, SYMBOL, ITERATOR
- [x] IEEE 754 double 统一表示 (NaN, ±0, ±Infinity)
- [x] 统一对象头部结构 `[type: 8B][...]`

### 数字
- [x] 数字分隔符 `1_000_000`
- [x] 进制表示: 0x (hex), 0o (oct), 0b (bin)
- [x] 科学计数法 (e/E)
- [x] Number 对象 (TYPE_NUMBER=13, boxed float64)

### 字符串
- [x] 基础: strlen, strcmp, strcpy, strstr, strcat, memcpy
- [x] 方法: toUpperCase, toLowerCase, charAt, charCodeAt, trim, trimStart, trimEnd
- [x] 方法: slice, substring, indexOf, lastIndexOf, includes, startsWith, endsWith
- [x] 方法: concat, at, repeat, split, replace, replaceAll, padStart, padEnd
- [x] 模板字符串 `` `Hello, ${name}!` `` (多插值、表达式、多行)
- [x] 字符串连接 `+` (自动类型转换)
- [x] 堆字符串: `[type: 8B][length: 8B][content...]` (TYPE_STRING=6)

### 数组
- [x] 基础: push, pop, get, set, length, at
- [x] 搜索: indexOf, lastIndexOf, includes, find, findIndex
- [x] 变换: slice, concat, join, reverse, fill, shift, unshift, sort
- [x] 高阶: forEach, map, filter, reduce, some, every
- [x] 动态扩容 (2x 策略)
- [x] 布局: `[type: 8B][length: 8B][capacity: 8B][elements...]`

### TypedArray
- [x] 8 种类型: Int8/Uint8/Int16/Uint16/Int32/Uint32/Float32/Float64Array
- [x] 构造: `new TypedArray(length)`
- [x] 元素读写: `arr[i]`, `arr[i] = value`
- [x] 继承方法: forEach, map, filter, reduce

### 集合
- [x] Map: new, set, get, has, delete, clear, size
- [x] Set: add, has, delete, clear, size

### 日期与正则
- [x] Date: now(), new Date(), getTime(), toString(), toISOString()
- [x] RegExp: new, test(), exec(), match(), matchAll()
- [x] 正则引擎: NFA/DFA 状态机，Thompson 构造
- [x] 正则语法: `.` `*` `+` `?` `[]` `[^]` `[a-z]` `|` 字符类 `\d` `\w` `\s`
- [x] 正则标志: g (global), i (ignore case), m (multiline), y (sticky)
- [x] String 方法: match(), replace(), split(), search()
- [x] 正则零匹配: `*`, `+`, `?` 正确处理空字符串匹配

### 迭代器
- [x] Iterator Protocol (@@iterator)
- [x] for...of / for...in
- [x] Array 迭代: values(), keys(), entries()
- [x] String 迭代: 字符级遍历
- [x] Map/Set 迭代: keys(), values(), entries()

### Generator (生成器)
- [x] function* 声明和表达式
- [x] yield / yield* 表达式
- [x] Generator.prototype.next(value)
- [x] Generator.prototype.return(value)
- [x] Generator.prototype.throw(error)
- [x] 状态机恢复点 (resume point)
- [x] 局部变量保存/恢复

### AsyncGenerator (异步生成器)
- [x] async function* 声明
- [x] for await...of 循环
- [x] AsyncGenerator.prototype.next()
- [x] AsyncGenerator.prototype.return()
- [x] AsyncGenerator.prototype.throw()
- [x] Promise 包装的迭代结果

### 私有字段
- [x] #field 语法支持
- [x] 私有字段访问 (get/set)
- [x] 品牌检查 (brand check)
- [x] 私有方法 #method()
- [x] 静态私有成员

### ES6+ 语法
- [x] 箭头函数 (含单参数无括号)
- [x] 展开语法 `...`
- [x] 可选链 `?.`
- [x] 空值合并 `??`
- [x] 逻辑赋值 `&&=` `||=` `??=`
- [x] 默认参数
- [x] 计算属性名 `{ [expr]: value }`
- [x] 解构赋值
- [x] 类声明 (class, extends, constructor)

### 闭包
- [x] 捕获变量分析
- [x] 闭包对象生成 (魔数 0xC105)
- [x] Box 包装共享变量
- [x] 嵌套闭包支持

### 异步编程
- [x] async 函数声明 / 箭头函数
- [x] await 表达式
- [x] Promise: new, then, catch, finally, resolve, reject
- [x] Promise.all / race / allSettled / any
- [x] 协程调度器 (多协程并发)
- [x] try/catch 异步异常处理

### Math (25 方法)
- [x] 基础: abs, min, max, sign
- [x] 幂/根: sqrt, pow, hypot
- [x] 舍入: floor, ceil, round, trunc
- [x] 三角: sin, cos, tan, asin, acos, atan, atan2
- [x] 对数: log, exp
- [x] 位操作: clz32, imul, fround
- [x] 随机: random (Xorshift128+)
- [x] 常量: PI, E, LN2, LN10, LOG2E, LOG10E, SQRT2, SQRT1_2

### JSON
- [x] stringify: null, boolean, number, string, array, object
- [x] parse: 递归下降解析器

### Symbol
- [x] Symbol() 构造
- [x] Symbol.for(key) / Symbol.keyFor(sym)
- [x] symbol.description / symbol.toString()
- [x] Well-known: iterator, asyncIterator, toStringTag, toPrimitive, hasInstance 等

### 异常处理
- [x] try/catch/finally
- [x] 可选 catch 绑定

---

## 待实现功能

### P1 - 高优先级 ✅ 已完成
- [x] Generator (yield) - NFA 状态机、yield/yield*、next/return/throw
- [x] 异步生成器 - async function*、for await...of、Promise 迭代
- [x] 私有字段 #field - 品牌检查、WeakMap 存储模式
- [x] 完整正则引擎 (NFA/DFA) - Thompson 构造、exec/match/matchAll

### P2 - 中优先级 ✅ 已完成
- [x] Proxy / Reflect - 对象代理和反射 API
- [x] 装饰器 - TC39 Stage 3 装饰器语法
- [x] 模块系统 (import/export) - ES6 静态模块加载
- [x] WeakMap / WeakSet - 弱引用集合
- [x] Array.flat - 数组展平方法
- [x] 完整时区处理 - 时区转换和格式化

### P3 - 优化
- [x] 常量折叠和传播 - 数字/字符串/位运算常量在编译时计算
- [x] 无用代码消除 (DCE) - if/while 常量条件分支消除
- [ ] 函数内联
- [ ] 内联缓存 (IC)
- [ ] 分代 GC
- [ ] Source Map
- [ ] 隐藏类 (hidden class)

---

## 已知问题

| 优先级 | 问题 | 说明 |
|--------|------|------|
| ~~P2~~ | ~~类方法调用~~ | ~~getValue() 崩溃~~ ✅ 已修复 |
| ~~P2~~ | ~~空值合并 ??~~ | ~~运算符未实现~~ ✅ 已修复 |
| ~~P2~~ | ~~展开语法 [...arr]~~ | ~~数组展开未实现~~ ✅ 已修复 |
| ~~P2~~ | ~~八进制/二进制字面量~~ | ~~0o77, 0b1010 返回 0~~ ✅ 已修复 |
| ~~P2~~ | ~~String.indexOf~~ | ~~段错误~~ ✅ 已修复 |
| ~~P2~~ | ~~String.charAt~~ | ~~返回空字符串~~ ✅ 已修复 |
| ~~P2~~ | ~~typeof undefined~~ | ~~返回 "number"~~ ✅ 已修复 |
| ~~P1~~ | ~~RegExp 字面量~~ | ~~/pattern/ 编译错误~~ ✅ 已修复 |
| ~~P1~~ | ~~解构赋值运行时~~ | ~~`const [a,b] = [1,2]` 输出 `0 0`~~ ✅ 已修复 |
| ~~P1~~ | ~~闭包计数器~~ | ~~闭包内变量修改不持久~~ ✅ 已工作正常 |
| ~~P1~~ | ~~class extends/super~~ | ~~`super(...)` 已修复，方法继承需原型链~~ ✅ 已修复 |
| ~~P1~~ | ~~Generator 运行时~~ | ~~编译成功，return 正常，yield 状态机未完成~~ ✅ 已修复 |
| ~~P2~~ | ~~new Map().get()~~ | ~~`m.set("a",1); m.get("a")` 返回 0 而非 1~~ ✅ 已修复 |
| ~~P2~~ | ~~Set.has()~~ | ~~`s.add(1); s.has(1)` 返回 false 然后崩溃~~ ✅ 已修复 |
| ~~P2~~ | ~~JSON.parse~~ | ~~布尔/null 可工作；数字/字符串/对象 SIGSEGV~~ ✅ 已修复 |
| ~~P2~~ | ~~Object 字符串键访问~~ | ~~`obj["b"]` 返回属性名~~ ✅ 已修复 |
| ~~P2~~ | ~~Array.sort~~ | ~~未实现~~ ✅ 已修复 (选择排序) |
| ~~P1~~ | ~~Generator yield~~ | ~~return 已修复；yield 状态机转换未完成~~ ✅ 已修复 |
| ~~P1~~ | ~~相等性比较 ===~~ | ~~字符串/布尔值比较返回 false 或崩溃~~ ✅ 已修复 |
| ~~P2~~ | ~~_to_boolean 缺失~~ | ~~if 条件判断卡住~~ ✅ 已修复 (添加 CoercionGenerator) |
| ~~P2~~ | ~~??= 空值合并赋值~~ | ~~null/undefined 判断逻辑错误~~ ✅ 已修复 |
| ~~P2~~ | ~~** 指数运算符~~ | ~~未实现~~ ✅ 已修复 (调用 _math_pow) |
| - | Number 对象比较 | 设计限制：`new Number(42) === 42` 返回 true (JS 标准为 false)。所有数字统一为 Number 对象以简化实现。 |
| ~~P3~~ | ~~try/catch~~ | ~~Error 类未定义，执行卡住~~ ✅ 已修复 (基础 try/catch/throw 可用) |

---

## 项目架构

```
jsbin/
├── lang/                   # 语言前端
│   ├── lexer/              # 词法分析 (80+ Token)
│   ├── parser/             # Pratt Parser (50+ AST)
│   └── analysis/           # 闭包变量分析
│
├── vm/                     # 虚拟机层
│   ├── index.js            # VirtualMachine
│   ├── registers.js        # 虚拟寄存器
│   └── instructions.js     # 虚拟指令集
│
├── backend/                # 后端代码生成
│   ├── arm64.js            # ARM64 后端
│   └── x64.js              # x64 后端
│
├── asm/                    # 汇编器
│   ├── arm64.js            # ARM64 指令编码
│   └── x64.js              # x64 指令编码
│
├── binary/                 # 二进制格式
│   ├── macho_*.js          # Mach-O (macOS)
│   ├── elf*.js             # ELF (Linux)
│   ├── pe*.js              # PE (Windows)
│   └── static_linker.js    # 静态链接器
│
├── compiler/               # 编译器核心
│   ├── core/               # 上下文、平台、类型
│   ├── expressions/        # 表达式编译
│   ├── functions/          # 函数、内置方法、闭包
│   ├── async/              # 异步编译
│   └── output/             # 输出生成
│
├── runtime/                # 运行时库
│   ├── core/               # 分配器、打印、强制转换
│   ├── types/              # number/string/array/object/map/set/date/regexp/typedarray/math/json/symbol/iterator/error
│   ├── async/              # 协程、Promise
│   └── operators/          # typeof, equality
│
└── cli.js                  # 命令行接口
```

---

## 技术细节

### 虚拟指令集
```
数据移动: MOV, MOV_IMM, LOAD, STORE, LOAD_BYTE, STORE_BYTE
算术运算: ADD, SUB, MUL, DIV, MOD, NEG
位运算:   AND, OR, XOR, SHL, SHR, SAR, NOT, CLZ
比较跳转: CMP, JEQ, JNE, JLT, JLE, JGT, JGE, JMP
函数调用: CALL, RET, PROLOGUE, EPILOGUE
浮点运算: FADD, FSUB, FMUL, FDIV, F2I, I2F, FSQRT
浮点舍入: FRINTM, FRINTP, FRINTZ, FRINTA
```

### 虚拟寄存器
```
通用:   V0-V7
保存:   S0-S4
参数:   A0-A5
特殊:   RET, FP, SP
```

### 内存布局
```
Array:      [type:8][length:8][capacity:8][elements...]
TypedArray: [type:8][length:8][data...]
String:     [type:8][length:8][content...]
Object:     [type:8][count:8][key0:8][val0:8]...
Closure:    [magic:2][pad:6][func_ptr:8][captured...]
Date:       [type:8][timestamp:8]
RegExp:     [type:8][pattern:8][flags:8][lastIndex:8]
Promise:    [type:8][status:8][value:8][then:8][catch:8][coroutine:8]
Symbol:     [type:8][id:8][description:8]
Iterator:   [type:8][source:8][index:8][kind:8][done:8][source_type:8]
Number:     [type:8][value:8]
```

### 系统调用
| 功能 | macOS | Linux | Windows |
|------|-------|-------|---------|
| 写入 | write (0x2000004) | write (1) | WriteConsoleA |
| 退出 | exit (0x2000001) | exit (60) | ExitProcess |
| 内存 | mmap (0x20000C5) | mmap (9) | VirtualAlloc |
| 时间 | gettimeofday | clock_gettime | GetSystemTimeAsFileTime |

---

## 使用方法

```bash
# 编译并运行
node cli.js input.js -o output && ./output

# 指定平台
node cli.js input.js -o output --target linux-x64

# 生成动态库
node cli.js input.js -o libout.dylib --shared --export myFunc

# 生成静态库
node cli.js input.js -o libout.a --static
```

---

*最后更新: 2026-02-01*
