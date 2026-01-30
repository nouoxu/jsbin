# JSBin JavaScript 编译器

## 项目概述

JSBin 是一个将 JavaScript 编译为原生机器码的 AOT (Ahead-of-Time) 编译器，支持多平台输出。

| 类别 | 完成度 | 说明 |
|------|--------|------|
| 语法分析 | 85% | ES6+ 语法解析，支持类、箭头函数、模板字符串、解构等 |
| 类型系统 | 55% | 静态类型推断，内置类型识别与跟踪，Symbol 类型支持 |
| 运行时 | 90% | Array/Map/Set/Date/RegExp/Promise/TypedArray/Math/JSON/Symbol，GC 完成 |
| 代码生成 | 80% | macOS/Linux/Windows，ARM64/x64 |
| 异步支持 | 95% | async/await，协程调度器，Promise.all/race/allSettled/any |
| 优化器 | 15% | 基础常量折叠，闭包变量分析 |

---

## 项目架构

```
jsbin/
├── lang/                       # 语言前端
│   ├── lexer/                  # 词法分析 (80+ Token 类型)
│   ├── parser/                 # Pratt Parser (50+ AST 节点)
│   └── analysis/               # 语义分析 (闭包变量分析)
│
├── vm/                         # 虚拟机层
│   ├── index.js                # VirtualMachine 主类
│   ├── registers.js            # 虚拟寄存器 (V0-V7, S0-S3, A0-A5)
│   └── instructions.js         # 虚拟指令集
│
├── backend/                    # 后端代码生成
│   ├── arm64.js                # ARM64 后端
│   └── x64.js                  # x64 后端 (System V / Windows ABI)
│
├── asm/                        # 汇编器
│   ├── arm64.js                # ARM64 指令编码
│   └── x64.js                  # x64 指令编码 (REX, ModRM/SIB)
│
├── binary/                     # 二进制格式生成
│   ├── macho_*.js              # Mach-O (macOS)
│   ├── elf*.js                 # ELF (Linux)
│   ├── pe*.js                  # PE (Windows)
│   └── static_linker.js        # 静态链接器
│
├── compiler/                   # 编译器核心
│   ├── index.js                # 编译入口
│   ├── core/                   # 核心模块
│   │   ├── context.js          # 编译上下文
│   │   ├── platform.js         # 平台配置
│   │   └── types.js            # 类型系统
│   ├── expressions/            # 表达式编译
│   │   ├── literals.js         # 字面量
│   │   ├── operators.js        # 运算符
│   │   ├── assignments.js      # 赋值
│   │   └── members.js          # 成员访问
│   ├── functions/              # 函数编译
│   │   ├── builtin_methods.js  # 内置方法
│   │   ├── data_structures.js  # 数据结构
│   │   └── closures.js         # 闭包
│   ├── async/                  # 异步编译
│   │   ├── index.js            # async 语句编译
│   │   └── async.js            # async 函数/调用编译
│   └── output/                 # 输出生成
│       ├── library.js          # 库管理
│       ├── wrapper.js          # C ABI 包装
│       └── generator.js        # 二进制生成
│
├── runtime/                    # 运行时库
│   ├── index.js                # RuntimeGenerator 入口
│   ├── core/                   # 核心运行时
│   │   ├── allocator.js        # 内存分配 (bump allocator)
│   │   ├── print.js            # PrintGenerator
│   │   └── strings.js          # 字符串常量
│   ├── types/                  # 类型实现 (每类型独立目录)
│   │   ├── number/             # NumberGenerator (Int + Float)
│   │   ├── string/             # StringGenerator
│   │   ├── array/              # ArrayGenerator
│   │   ├── object/             # ObjectGenerator
│   │   ├── map/                # MapGenerator
│   │   ├── set/                # SetGenerator
│   │   ├── date/               # DateGenerator
│   │   ├── regexp/             # RegExpGenerator
│   │   ├── typedarray/         # TypedArrayGenerator (8种类型)
│   │   ├── math/               # MathGenerator (sqrt, sin, cos, etc.)
│   │   ├── json/               # JSONGenerator (parse, stringify)
│   │   ├── symbol/             # SymbolGenerator + WellKnownSymbols
│   │   └── error/              # ErrorGenerator
│   ├── async/                  # 异步运行时
│   │   ├── coroutine.js        # 协程调度器
│   │   └── promise.js          # Promise 实现
│   └── operators/              # 运算符
│       └── typeof.js           # TypeofGenerator
│
└── cli.js                      # 命令行接口
```

### 命名规范

所有运行时生成器统一为 `{Type}Generator` 类格式：

```javascript
class {Type}Generator {
    constructor(vm, backend = null) {
        this.vm = vm;
        this.backend = backend;
    }
    generate() { /* 生成运行时函数 */ }
}
```

### 运行时 Generator 列表

| Generator | 位置 | 功能 |
|-----------|------|------|
| RuntimeGenerator | runtime/index.js | 入口，聚合所有生成器 |
| AllocatorGenerator | runtime/core/allocator.js | 内存分配 (bump allocator) |
| PrintGenerator | runtime/core/print.js | 值打印 (_print_value) |
| CoercionGenerator | runtime/core/coercion.js | 类型强制转换 |
| SubscriptGenerator | runtime/core/subscript.js | 下标访问 (_subscript_get/set) |
| JSValueGenerator | runtime/core/jsvalue.js | JSValue 操作 |
| StringConstantsGenerator | runtime/core/strings.js | 字符串常量 |
| ProcessGenerator | runtime/core/process.js | 进程控制 (exit) |
| NumberGenerator | runtime/types/number/ | Number 对象，含打印/转换 |
| StringGenerator | runtime/types/string/ | 字符串操作 (18+ 方法) |
| ArrayGenerator | runtime/types/array/ | 数组操作 (16+ 方法) |
| ObjectGenerator | runtime/types/object/ | Object 基础操作 |
| MapGenerator | runtime/types/map/ | Map 集合操作 |
| SetGenerator | runtime/types/set/ | Set 集合操作 |
| DateGenerator | runtime/types/date/ | Date 对象 |
| RegExpGenerator | runtime/types/regexp/ | 正则表达式 (test) |
| TypedArrayGenerator | runtime/types/typedarray/ | 8 种 TypedArray |
| MathGenerator | runtime/types/math/ | 25 个 Math 方法 |
| JSONGenerator | runtime/types/json/ | JSON.parse/stringify |
| SymbolGenerator | runtime/types/symbol/ | Symbol + Well-known |
| ErrorGenerator | runtime/types/error/ | Error 对象 |
| AsyncGenerator | runtime/async/ | 协程调度器 |
| PromiseGenerator | runtime/async/promise.js | Promise (含组合器) |
| TypeofGenerator | runtime/operators/typeof.js | typeof 运算符 |

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

## ECMAScript 版本支持

| 版本 | 特性 | 状态 |
|------|------|------|
| ES5 | 基础语法、函数、数组、对象、异常处理 | ✅ 完整 |
| ES6 | 箭头函数、类、模板字符串、let/const、解构、展开、for-of | ✅ 大部分 |
| ES7 | Array.includes、指数运算符 | ✅ 完整 |
| ES8 | async/await、Object.entries/values | ✅ async/await |
| ES9 | 异步迭代、对象展开、Promise.finally | 🔶 部分 |
| ES10 | Array.flat、Object.fromEntries、String.trim | ❌ 未实现 |
| ES11 | 可选链 ?.、空值合并 ??、BigInt | ✅ ?./?? |
| ES12 | 逻辑赋值、数字分隔符、Promise.any | ✅ 逻辑赋值 |
| ES13 | at() 方法、私有字段 | 🔶 at() |
| ES14+ | 装饰器、迭代器助手 | ❌ 未实现 |

---

## 已实现功能

### 值类型系统
- [x] 类型标签系统 (INT, FLOAT, STRING, BOOLEAN, NULL, UNDEFINED, ARRAY, OBJECT, FUNCTION, DATE, MAP, SET, REGEXP, NUMBER, SYMBOL)
- [x] IEEE 754 double 统一表示 (支持 NaN, ±0, ±Infinity)
- [x] typeof/instanceof 运算符
- [x] 统一对象头部结构
- [x] Symbol 原始类型 (TYPE_SYMBOL=14)
- [ ] 隐藏类 (hidden class)

### 数字处理
- [x] 数字分隔符 `1_000_000`
- [x] 十六进制/八进制/二进制 (0x/0o/0b)
- [x] 科学计数法 (e/E)

### 字符串与数组
- [x] 字符串: strlen, strcmp, strcpy, strstr, strcat, strconcat, memcpy
- [x] 字符串连接运算符 `+` (自动类型转换)
- [x] 字符串方法: toUpperCase, toLowerCase, charAt, charCodeAt, trim, slice, substring, indexOf, lastIndexOf, concat, at
- [x] 堆字符串类型头 (TYPE_STRING=6, 16字节头部 + 内容)
- [x] `_getStrContent` 自动识别堆/数据段字符串
- [x] `_str_length` 统一获取字符串长度 (堆: 读 +8, 数据段: strlen)
- [x] 字符串方法: startsWith, endsWith, includes, repeat, split, replace, replaceAll
- [x] 字符串方法: padStart, padEnd, trimStart, trimEnd
- [x] 数组: push, pop, get, set, at, includes, indexOf, lastIndexOf, slice, length
- [x] 数组高阶方法: forEach, map, filter, reduce, find, findIndex, some, every
- [x] 数组变换: concat, join, reverse, fill, shift, unshift
- [x] 数组动态扩容 (push 超过容量时自动 2x 扩容)
- [x] 数组 indexOf/includes 支持 Number 对象值比较
- [x] 数组布局: [type(8), length(8), capacity(8), elements...]
- [x] TypedArray: Int8/Uint8/Int16/Uint16/Int32/Uint32/Float32/Float64Array
  - new TypedArray(length)
  - 元素读写 arr[i], arr[i] = value
  - console.log 打印支持
  - forEach, map, filter, reduce 继承
- [ ] Unicode 感知操作
- [ ] 排序算法 (TimSort)

### 集合类型
- [x] Map: new, set, get, has, delete, clear, size
- [x] Set: add, has, delete, clear, size
- [ ] 哈希表优化 (O(1) 访问)
- [ ] WeakMap/WeakSet

### 日期与正则
- [x] Date.now(), new Date(), getTime()
- [x] Date.toString(), toISOString() (ISO 8601 格式)
- [x] RegExp: new, test() (子字符串匹配)
- [x] getTimezoneOffset() (基础实现)
- [ ] 完整时区处理 (本地时间方法 getHours/getMinutes 等)
- [ ] 正则引擎 (NFA/DFA)

### ES6+ 语法
- [x] 箭头函数
- [x] 无括号单参数箭头函数 `x => x * 2`
- [x] 模板字符串 `` `Hello, ${name}!` `` (多插值、表达式、多行)
- [x] 模板字符串中对象属性多插值 `${obj.prop}`
- [x] 展开语法 `...`
- [x] 可选链 `?.`
- [x] 空值合并 `??`
- [x] 逻辑赋值 `&&=` `||=` `??=`
- [x] 默认参数
- [x] 计算属性名 `{ [expr]: value }`
- [x] for...of / for...in
- [x] 类声明 (class, extends, constructor)
- [ ] 私有字段 `#field`

### 闭包
- [x] 捕获变量分析
- [x] 闭包对象生成 (魔数 0xC105)
- [x] Box 包装共享变量
- [x] 嵌套闭包

### 异步编程 (async/await)
- [x] async 函数声明
- [x] async 箭头函数
- [x] await 表达式
- [x] Promise 基础 (new, then, catch, resolve, reject, finally)
- [x] 协程调度器 (多协程并发)
- [x] try/catch 异步异常处理
- [x] Promise.all (并行执行，全部成功返回结果数组)
- [x] Promise.race (返回第一个完成的结果)
- [x] Promise.allSettled (返回所有结果，包含状态)
- [x] Promise.any (返回第一个成功的结果)

### Math 对象
- [x] Math.sqrt, Math.pow (含整数优化版本)
- [x] Math.abs, Math.min, Math.max (编译期优化)
- [x] Math.log, Math.exp (Taylor 级数实现)
- [x] Math.sin, Math.cos, Math.tan (Taylor 级数实现)
- [x] Math.asin, Math.acos, Math.atan, Math.atan2
- [x] Math.random (Xorshift128+ 算法)
- [x] Math.floor, Math.ceil, Math.round, Math.trunc
- [x] Math.sign, Math.fround, Math.clz32, Math.imul
- [x] Math.hypot
- [x] Math 常量: PI, E, LN2, LN10, LOG2E, LOG10E, SQRT2, SQRT1_2

### JSON 对象
- [x] JSON.stringify (基础实现: 支持 null, boolean, number, string, array, object)
- [x] JSON.parse (基础实现: 递归下降解析器)
- [ ] JSON reviver/replacer 函数
- [ ] 循环引用检测

### Symbol 类型
- [x] Symbol() 构造 (基于全局计数器)
- [x] Symbol.for(key) (全局注册表)
- [x] Symbol.keyFor(sym) (反向查找)
- [x] symbol.description 属性
- [x] symbol.toString() 方法
- [x] 内置 Well-known Symbols:
  - Symbol.iterator, Symbol.asyncIterator
  - Symbol.toStringTag, Symbol.toPrimitive
  - Symbol.hasInstance, Symbol.isConcatSpreadable
  - Symbol.species, Symbol.match, Symbol.replace
  - Symbol.search, Symbol.split, Symbol.unscopables

### 异常处理
- [x] try/catch/finally 语法解析
- [x] 可选 catch 绑定
- [ ] 错误堆栈追踪
- [ ] Error.cause

---

## 待实现功能

### P0 - 近期优化
- [x] Date ISO 格式打印 (2026-01-14T05:00:42.588Z)
- [x] Float 打印优化 (14.00000 → 14, 14.13000 → 14.13)
- [x] Number 子类型系统设计 (types.js):
  - NUM_INT8/16/32/64 (有符号整数)
  - NUM_UINT8/16/32/64 (无符号整数)
  - NUM_FLOAT16/32/64 (浮点数, Float64 = 默认)
- [x] TypedArray 完整实现 (8 种类型全部支持)
  - Int8Array, Uint8Array, Int16Array, Uint16Array
  - Int32Array, Uint32Array, Float32Array, Float64Array
- [x] jslib 生成控制 (--no-jslib 参数)
- [x] async/await 支持 (协程调度器 + CPS 变换)

### P1 - 高优先级
- [x] Symbol 类型 (完整实现: new, for, keyFor, description, toString, well-known symbols)
- [ ] 迭代器协议 (@@iterator) - Symbol.iterator 已定义，需实现协议
- [x] Promise 高级组合 (all, race, allSettled, any)
- [x] JSON.parse/stringify (基础实现，支持基本类型)
- [x] Math 对象方法 (25个方法: sqrt, pow, abs, min, max, log, exp, sin, cos, tan, asin, acos, atan, atan2, random, floor, ceil, round, trunc, sign, fround, clz32, imul, hypot)

### P2 - 中优先级
- [ ] 生成器 (Generator) - 需要迭代器协议
- [ ] 异步生成器 (async generator)
- [ ] 私有字段和方法 (#field)
- [ ] 完整正则引擎 (NFA/DFA)
- [ ] Proxy/Reflect
- [ ] 装饰器
- [ ] 模块系统 (import/export)

### P3 - 优化
- [ ] 常量折叠和传播
- [ ] 无用代码消除 (DCE)
- [ ] 函数内联
- [ ] 内联缓存 (IC)
- [ ] 分代 GC
- [ ] Source Map

---

## 技术实现细节

### 虚拟指令集
```
数据移动: MOV, MOV_IMM, LOAD, STORE, LOAD_BYTE, STORE_BYTE
算术运算: ADD, SUB, MUL, DIV, MOD, NEG
位运算:   AND, OR, XOR, SHL, SHR, SAR, NOT, CLZ
比较跳转: CMP, JEQ, JNE, JLT, JLE, JGT, JGE, JMP
函数调用: CALL, RET, PROLOGUE, EPILOGUE
浮点运算: FADD, FSUB, FMUL, FDIV, F2I, I2F, FSQRT
浮点舍入: FRINTM (floor), FRINTP (ceil), FRINTZ (trunc), FRINTA (round)
```

### 虚拟寄存器
```
通用: V0-V7
保存: S0-S3
参数: A0-A5
特殊: RET, FP, SP
```

### 内存布局
```
数组:       [type: 8B][length: 8B][capacity: 8B][elem0: 8B][elem1: 8B]...
TypedArray: [type: 8B][length: 8B][data...]  (元素大小按类型: 1/2/4/8B)
字符串:     [type: 8B][length: 8B][content...]  (TYPE_STRING=6)
闭包:       [magic: 2B][padding: 6B][func_ptr: 8B][captured...]
Date:       [type: 8B][timestamp: 8B]
RegExp:     [type: 8B][pattern_ptr: 8B][flags: 8B][lastIndex: 8B]
Promise:    [type: 8B][status: 8B][value: 8B][then_handlers: 8B][catch_handlers: 8B][coroutine: 8B]
Coroutine:  [type: 8B][status: 8B][stack_base: 8B][stack_size: 8B][saved_sp: 8B][saved_fp: 8B][saved_lr: 8B][func_ptr: 8B][arg: 8B][result: 8B][next: 8B][promise: 8B][closure_ptr: 8B]
Symbol:     [type: 8B][id: 8B][description_ptr: 8B]  (TYPE_SYMBOL=14)
Number:     [type: 8B][value: 8B (float64)]  (TYPE_NUMBER=13)
```

### 系统调用
| 功能 | macOS | Linux | Windows |
|------|-------|-------|---------|
| 写入 | write (0x2000004) | write (1) | WriteConsoleA |
| 退出 | exit (0x2000001) | exit (60) | ExitProcess |
| 内存 | mmap (0x20000C5) | mmap (9) | VirtualAlloc |
| 时间 | gettimeofday | clock_gettime | GetSystemTimeAsFileTime |

---

## 开发命令

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

## 更新日志

### 2026-01-15
- **TypedArray 完整实现**
  - 8 种 TypedArray 类型: Int8/Uint8/Int16/Uint16/Int32/Uint32/Float32/Float64Array
  - `new TypedArray(length)` 构造函数
  - 元素读取 `arr[i]` 和写入 `arr[i] = value`
  - console.log 多参数支持 `console.log("label:", typedArray)`
  - 统一的 `_subscript_get/_subscript_set` 处理 Array 和 TypedArray
  - Boxed Number 自动 unbox 到 TypedArray 元素

- **ARM64 后端偏移修复**
  - 修复 STUR/LDUR 指令 9 位有符号偏移限制 (-256 到 +255)
  - 超出范围的偏移使用 ADD/SUB + STR/LDR 组合
  - 修复临时变量累积导致的栈偏移超限 bug

- **console.log 多参数支持**
  - 支持任意数量参数 `console.log(a, b, c, ...)`
  - 参数间自动添加空格分隔
  - `_print_value_no_nl` 处理 Boxed Number (TYPE_NUMBER=13) 和 TypedArray

- **字符串方法修复与完善**
  - `charAt(index)`: 修复浮点索引转整数顺序错误
  - `charCodeAt(index)`: 添加浮点转整数、调用 `_getStrContent`
  - `slice(start, end)`: 修复 `cmpImm` 不支持负数比较问题，使用寄存器比较
  - `_str_charAt` / `_str_charCodeAt`: 调用 `_getStrContent` 获取内容指针

- **字符串连接与模板字符串**
  - 字符串 `+` 运算符: 支持字符串与变量连接、链式连接
  - `_strconcat`: 带类型标记的堆字符串分配
  - `_getStrContent`: 统一处理数据段字符串和堆字符串
  - 模板字符串词法分析: TEMPLATE_HEAD/MIDDLE/TAIL 三种 Token
  - 模板字符串解析: `templateDepth` 跟踪嵌套 `${}`
  - 模板字符串编译: quasis + expressions 交替连接
  - 类型转换: `_intToStr`, `_boolToStr` 用于插值

- **字符串综合测试通过**
  - length 属性 (字符串/数组/字面量)
  - charAt/charCodeAt (数据段和堆字符串)
  - 字符串连接 (+多重连接)
  - toUpperCase/toLowerCase
  - trim (空格/制表符)
  - slice (单参数/双参数)

### 2026-01-15 (晚)

- **TypedArray 继承 Array 方法**
  - `forEach`: 支持 TypedArray 遍历
  - `map`: 支持 TypedArray，返回同类型 TypedArray
  - `filter`: 支持 TypedArray，动态调整结果数组大小
  - `reduce`: 支持 TypedArray，含/不含初始值两种形式

- **Number 打印系统修复**
  - **寄存器别名 Bug**: `VReg.V0/A0/RET` 都映射到 X0
    - `_print_number`: 使用 S1 保存类型，避免被 A0 覆盖
    - `_print_float`: 使用 S2 保存 fcvtzs 结果，避免打印负号时被覆盖
  - **TYPE_NUMBER 类型路由**: TYPE_NUMBER=13 内部存储 float64，需走浮点路径
    - 修正逻辑: type==13 或 type>=28 走浮点，type∈[20,27] 走整数

- **统一类型推断**
  - `inferType()` 对所有数字字面量返回 `Type.NUMBER`
  - 避免 INT64/FLOAT64 与 NUMBER 对象混用导致比较失败

- **TypedArray.length 修复**
  - 返回 Number 对象而非原始整数
  - 添加 SCVTF 指令将整数转换为浮点后装箱

- **f2i 指令添加**
  - VM: `f2i(dest, src)` 从 Number 对象提取整数
  - ARM64: 加载 float64 位 → FMOV → FCVTZS

### 2026-01-16
- **Math 对象完整实现** (runtime/types/math/index.js)
  - 25 个数学方法: sqrt, pow, abs, min, max, log, exp, sin, cos, tan, asin, acos, atan, atan2, random, floor, ceil, round, trunc, sign, fround, clz32, imul, hypot
  - Taylor 级数实现超越函数 (sin, cos, exp, log)
  - Xorshift128+ 随机数生成器
  - VM 新增浮点指令: fsqrt, frintm, frintp, frintz, frinta, clz

- **JSON 对象实现** (runtime/types/json/index.js)
  - JSON.stringify: 支持 null, boolean, number, string, array, object
  - JSON.parse: 递归下降解析器
  - 字符串转义处理 (\", \\, \n, \t, \r)

- **Symbol 类型完整实现** (runtime/types/symbol/index.js)
  - Symbol() 构造函数 (全局计数器)
  - Symbol.for(key) 全局注册表
  - Symbol.keyFor(sym) 反向查找
  - symbol.description 属性
  - symbol.toString() 方法
  - 12 个 Well-known Symbols (iterator, toStringTag, toPrimitive 等)

- **Promise 组合器扩展** (runtime/async/promise.js)
  - Promise.all: 并行执行，全部成功返回结果数组
  - Promise.race: 返回第一个完成的结果
  - Promise.allSettled: 返回所有结果 (含状态)
  - Promise.any: 返回第一个成功的结果

- **字符串方法扩展** (runtime/types/string/methods.js)
  - split(separator): 按分隔符拆分
  - replace(search, replacement): 替换第一个匹配
  - replaceAll(search, replacement): 替换所有匹配
  - 底层: strstr, memcpy 辅助函数

- **编译器集成**
  - compiler/functions/builtin_methods.js: compileJSONMethod, compileSymbolMethod
  - compiler/functions/functions.js: JSON.*, Symbol.* 调用支持
  - compiler/index.js: Math/Symbol data section 生成

- **VM 改进**
  - emit() 方法支持 snake_case 到 camelCase 转换
  - 新增浮点舍入指令族

### 2026-01-14 (下午)
- **async/await 完整实现**
  - 协程调度器 (coroutine.js): 创建、恢复、挂起、返回
  - Promise 运行时 (promise.js): new, then, resolve, reject, _promise_await
  - CPS 变换: async 函数编译为协程，await 编译为 yield + promise 等待
  - async 箭头函数支持
- **Bug 修复**
  - ARM64 addImm/subImm: 修复大立即数 (>4095) 被截断问题
  - 协程栈指针 16 字节对齐: 修复多协程 bus error
  - async 箭头函数解析: 修复 `async () =>` 语法
  - print 作为一等公民: 支持 `promise.then(print)`

### 2026-01-14
- 运行时生成器命名统一为 `{Type}Generator` 类格式
- 目录重组: runtime/types/ 下每个类型独立目录
- Number 类型包含 IntGenerator 和 FloatGenerator
- 编译器模块拆分 (index.js 1490→552 行)
- 修复: 数组索引浮点转整数、成员赋值、栈破坏

### 2026-01-31 (测试修复)
- **console.log 类型推断增强**
  - 支持所有数字子类型 (INT8-FLOAT64)
  - Math 方法返回值识别为 NUMBER 类型
  - 字符串方法返回值识别 (toUpperCase, slice 等)
  - 用户函数调用返回值正确打印

- **Math 模块修复**
  - Math 常量 (PI, E, SQRT2 等) 正确编译为数字字面量
  - Math.sqrt 栈帧分配修复 (prologue(16, [VReg.S0]))
  - Math 方法返回类型推断

- **字符串方法修复**
  - slice/substring 参数处理：直接使用整数字面量值
  - 字符串方法返回值打印时跳过 16 字节头部

- **类型推断扩展** (compiler/core/types.js)
  - MemberExpression: Math 常量返回 NUMBER
  - CallExpression: Math 方法返回 NUMBER
  - 字符串方法返回类型 (STRING/NUMBER)

---

*最后更新: 2026-01-31*
