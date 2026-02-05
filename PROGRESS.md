# JSBin JavaScript 编译器

## 项目概述

JSBin 是一个将 JavaScript 编译为原生机器码的 AOT (Ahead-of-Time) 编译器，支持多平台输出。

| 类别 | 完成度 | 说明 |
|------|--------|------|
| 语法分析 | 96% | ES6+ 语法解析，支持类、箭头函数、模板字符串、解构、Generator、装饰器、BigInt；上下文关键字 (get/set/from) 作为变量名支持 |
| 类型系统 | 75% | NaN-boxing、静态类型推断、typeof/instanceof、TypedArray 子类型 |
| 运行时 | 92% | Array/String/Math/Date/Map/Set/JSON/RegExp/Generator 基本完整，部分 API 待修复 |
| 代码生成 | 96% | macOS/Linux/Windows，ARM64/x64，模块链接，类继承原型链；ARM64 SP 对齐修复；栈大小恢复修复 |
| 异步支持 | 90% | async/await 正常；Generator 正常 |
| 迭代器 | 95% | Iterator Protocol，for-of，for await...of |
| 优化器 | 30% | 常量折叠(数字/字符串/位运算)、死代码消除、闭包变量分析 |
| **自举** | **96%** | **测试 236/242 通过 (97.5%)；6 个测试待修复** |

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
- [x] Source Map - 生成调试映射文件，支持源码定位 (复杂度: ★☆☆☆☆)
- [x] 函数内联 - 小函数调用替换为函数体，减少调用开销 (复杂度: ★★☆☆☆)
- [x] 内联缓存 (IC) - 缓存属性访问偏移量，加速对象属性查找 (复杂度: ★★★☆☆)
- [~] 隐藏类 (hidden class) - 已创建框架代码，完整实现需深度重构对象系统 (复杂度: ★★★★☆)
- [x] 分代 GC - 年轻代复制收集 + 老年代标记清除，写屏障，对象晋升 (复杂度: ★★★★★)

---

## 自举 (Self-Hosting) 所需功能

> 目标: 用 JSBin 编译器编译自身源代码 (~42,000 行 JS)

### 已具备
- [x] ES6 模块 (import/export)
- [x] 类声明和继承 (class extends)
- [x] 箭头函数
- [x] 模板字符串
- [x] 解构赋值
- [x] 展开语法 (...)
- [x] for...of 循环
- [x] Map / Set
- [x] throw / try-catch
- [x] typeof / instanceof
- [x] switch 语句
- [x] 数组方法: push, pop, splice, slice, map, filter, some, every, find, findIndex, includes, indexOf, lastIndexOf, join, fill, flat, flatMap
- [x] 字符串方法: startsWith, endsWith, includes, indexOf, lastIndexOf, slice, substring, split, replace, replaceAll, charAt, charCodeAt, padStart, padEnd, trim, trimStart, trimEnd
- [x] Object.keys, Object.values, Object.entries, Object.assign, Object.create, Object.hasOwn, hasOwnProperty
- [x] Math.min, Math.max, Math.ceil, Math.floor, Math.trunc, Math.abs, Math.pow, Math.sqrt, Math.random
- [x] JSON.stringify, JSON.parse
- [x] RegExp (new RegExp, test, exec, match, matchAll, replace, search)
- [x] Error 构造
- [x] console.log
- [x] **console.warn** - 与 console.log 相同输出（无着色），编译器警告打印已可用
- [x] **console.error** - 与 console.log 相同输出（无着色），编译器错误打印已可用
- [x] parseInt, parseFloat, isNaN, isFinite
- [x] Array.isArray
- [x] Buffer.alloc, Buffer.from, Buffer.concat, Buffer.isBuffer, buf.toString
- [x] path.join, path.dirname, path.basename
- [x] fs.readFileSync
- [x] process.platform, process.arch, process.argv, process.exit

### P0 - 自举必需 (Node.js API 替代)
| 功能 | 复杂度 | 说明 |
|------|--------|------|
| fs.readFileSync | ✅ 完成 | 文件读取 - syscall open/read/close |
| fs.writeFileSync | ✅ 完成 | 文件写入 - syscall open/write/close |
| fs.existsSync | ✅ 完成 | 文件存在检测 - access 系统调用 |
| fs.statSync | ✅ 完成 | 获取文件状态 - NaN-boxing 解包修复，运行时通过 |
| fs.unlinkSync | ✅ 完成 | 删除文件 - unlink 系统调用 |
| path.resolve | ✅ 完成 | 路径解析 - 支持相对/绝对路径 |
| path.join | ✅ 完成 | 路径连接 - 纯字符串处理 |
| path.dirname | ✅ 完成 | 目录名提取 - 纯字符串处理 |
| path.basename | ✅ 完成 | 文件名提取 - 纯字符串处理 |
| path.isAbsolute | ✅ 完成 | 绝对路径检测 - 字符串检测 |
| process.platform | ✅ 完成 | 平台检测 - 编译时常量 |
| process.arch | ✅ 完成 | 架构检测 - 编译时常量 |
| process.argv | ✅ 完成 | 命令行参数 - _start 入口获取，包括 length 和元素访问 |
| process.cwd() | ✅ 完成 | 当前目录 - 通过 PWD 环境变量获取 |
| process.exit() | ✅ 完成 | 进程退出 - exit 系统调用，支持自定义退出码 |
| Buffer | ✅ 完成 | 二进制缓冲区 - alloc/allocUnsafe/from/concat/isBuffer/toString/length/下标访问 |
| execSync | ⚠️ 部分 | 子进程执行 - fork/exec 已实现，暂不捕获 stdout |
| os.tmpdir | ✅ 完成 | 临时目录 - TMPDIR 环境变量或 /tmp |
| console.warn | ✅ 完成 | 与 console.log 相同输出（无着色），覆盖编译器的所有 warn 调用 |
| console.error | ✅ 完成 | 与 console.log 相同输出（无着色），覆盖编译器的所有 error 调用 |
| JSON.stringify space | ⚠️ 部分 | space 参数被忽略，不影响自举但影响调试输出格式 |

### P0 - 自举必需 (语言特性)
| 功能 | 复杂度 | 说明 |
|------|--------|------|
| Array.from | ✅ 完成 | 从可迭代对象创建数组 - 类型推断已修复 |
| Array.isArray | ✅ 完成 | 数组类型检测 - 编译器已实现 |
| parseInt / parseFloat | ✅ 完成 | 字符串转数字 - 编译器已实现 |
| isNaN / isFinite | ✅ 完成 | 数值检测 - 编译器已实现 |
| String.prototype.match | ✅ 完成 | 已实现 |
| String.fromCharCode | ✅ 完成 | 从字符码创建字符串 - 编译器+运行时已实现 |
| Object.prototype.hasOwnProperty | ✅ 完成 | 属性检测 - 运行时已实现 |
| getter/setter | ✅ 完成 | get/set 访问器属性 - 运行时 _object_get_prop/_object_set_prop 支持 |
| 静态方法 (static) | ✅ 完成 | 类的静态成员 - 编译器已实现 |
| new.target | ★★☆☆☆ | 构造函数元属性 - 编译器未使用 |
| Infinity / NaN 字面量 | ✅ 完成 | 全局常量 - IEEE 754 表示，print/console.log 正常打印 |
| path.join 多参数 | ✅ 完成 | 支持任意数量参数的路径拼接 |
| path.resolve | ✅ 完成 | 路径解析 - 支持相对/绝对路径，依赖 process.cwd() |
| print 多参数 | ⚠️ Bug | 多参数输出空白，console.log 正常 |

### 自举里程碑
1. **M1**: ✅ 实现 fs/path 模块替代 - 可读取源文件 (fs.readFileSync, path.join, path.dirname, path.basename)
2. **M2**: ✅ 实现 process 模块替代 - process.argv/platform/arch/exit() 完成, cwd() 部分实现
3. **M3**: ✅ 实现 Buffer - 可生成二进制输出 (alloc/from/concat/isBuffer/toString)
4. **M4**: ✅ 实现 fs.writeFileSync/existsSync/unlinkSync - 可写出编译结果、检测文件存在、删除文件
5. **M5**: ✅ 实现 getter/setter - 编译器 VirtualMachine 类使用 get arch/platform/os
6. **M6**: ✅ 实现 getter/setter - 编译器 VirtualMachine 类使用 get arch/platform/os
7. **M7**: ✅ 修复关键 Bug - ~~Infinity/NaN~~ ✅、~~String.fromCharCode~~ ✅、~~Array.from~~ ✅、~~path.join 多参数~~ ✅、~~path.resolve~~ ✅、~~process.cwd()~~ ✅
8. **M8**: ✅ 通过基础回归测试 (86/86 ✅)
9. **M9**: 成功编译自身并生成可执行文件

### 自举阻塞问题分析

编译器源代码 (~42,000 行) 使用的特性分析：

#### 已完全支持 ✅ (2026-02-03 已验证)
- ES6 模块 (import/export)
- 类继承 (class extends super)
- 箭头函数
- 模板字符串
- 解构赋值
- 展开语法 (...) - 对象展开 `{...obj}` 编译器高频使用
- for...of / for...in
- Map / Set (包括 .set/.get/.has/.delete/.keys/.values)
- throw / try-catch (throw new Error 高频使用)
- typeof / instanceof
- switch 语句
- 正则表达式 (new RegExp, match, replace, exec)
- parseInt / parseFloat / isNaN / isFinite
- Array.isArray
- Object.keys / Object.values / Object.entries / Object.assign
- console.log (多参数正常)
- **console.warn / console.error - ❌ 未实现，自举阻塞**
- JSON.stringify
- 字符串方法 (startsWith, endsWith, includes, indexOf, slice, split, replace, padStart, padEnd 等)
- 数组方法 (push, pop, splice, slice, map, filter, some, every, find, includes, indexOf, join, fill 等)
- Buffer (alloc, from, concat, isBuffer, toString)
- process.platform / process.arch / process.argv / process.exit()
- path.dirname / path.basename
- fs.readFileSync / fs.writeFileSync / fs.existsSync / fs.unlinkSync
- getter/setter (get name() {})
- 可选链 ?. / 空值合并 ?? - 编译器低频使用
- 默认参数 function(a = 1)

#### 已验证支持 ✅ (2026-02-03)
- getter/setter (get name() {}) - vm/index.js, backend/*.js 使用
- fs.readFileSync - 文件读取正常
- fs.existsSync - 文件存在检测正常
- fs.writeFileSync - 文件写入正常
- fs.unlinkSync - 文件删除正常
- path.dirname / path.basename - 正常
- process.platform / process.arch / process.argv / process.exit() - 正常
- Buffer.alloc / Buffer.from / Buffer.concat / Buffer.isBuffer - 正常
- console.log - 多参数正常
- **console.warn / console.error - ❌ 未实现，自举阻塞**

#### 需要修复 🔨 (自举阻塞)
| 功能 | 使用位置 | 优先级 | 状态 |
|------|----------|--------|------|
| Infinity / NaN | 编译器多处使用 | P0 | ✅ 已修复 |
| String.fromCharCode | binary/static_linker.js (9 处) | P0 | ✅ 已修复 |
| Array.from | compiler/optimize/inline.js | P0 | ✅ 已修复 |
| path.join 多参数 | compiler/index.js | P0 | ✅ 已修复 |
| path.resolve | compiler/modules/loader.js (4 处) | P0 | ✅ 已修复 |
| process.cwd() | compiler/modules/loader.js | P1 | ✅ 已修复 (PWD 环境变量) |
| os.tmpdir() | compiler/index.js | P1 | ✅ 已修复 |
| Math 结果装箱一致性 | regression Math.* | P1 | ✅ 已修复 (TYPE_NUMBER/TYPE_FLOAT64 === 比较) |
| Array.filter | regression array.filter | P1 | ✅ 已修复 (_to_boolean 调用) |
| JSON.parse 对象/数组 | regression JSON.parse object/array | P1 | ✅ 已修复 |
| RegExp.test 返回类型 | regression regexp.test | P0 | ✅ 已修复 (返回 NaN-boxing 布尔值) |
| _main 栈帧大小 | 复杂程序崩溃 | P0 | ✅ 已修复 (512 → 1024 字节) |
| fs.statSync | compiler/index.js | P1 | ✅ 已修复（NaN-boxing 解包修正） |
| execSync stdout | compiler/index.js (静态库生成) | P2 | ⚠️ 部分实现 (无 stdout 捕获) |
| selfhost_new SIGSEGV | run `./selfhost_new examples/helloworld.js -o ...` | P0 | ❌ 运行时崩溃：PC≈0x100002b3c，_strlen 读取 0x7ffb000000000000（疑似 undefined 传入），需定位调用栈 |

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

## 自举 (Self-Hosting) 分析

### 自举进度评估

| 类别 | 覆盖率 | 说明 |
|------|--------|------|
| ES6+ 语法特性 | 98% | class/extends/super, import/export, 箭头函数, 模板字符串, 解构, 展开, for-of, ?., ?? 全部支持 |
| 内置对象方法 | 95% | Map, Set, Array 高阶方法, Object 静态方法, JSON, RegExp 完整 |
| Node.js API | 88% | fs, path, process, Buffer, os 主要方法已实现，缺 console.warn/error, fs.statSync 有 bug |
| 回归测试 | 100% | 85/85 测试通过 |

### 自举阻塞项 (必须修复)

| 优先级 | 功能 | 使用位置 | 说明 |
|--------|------|----------|------|
| ~~P0~~ | ~~`console.warn`~~ | ~~编译器 20+ 处~~ | ✅ **已修复** - 与 console.log 使用相同的 _print_str |
| ~~P0~~ | ~~`console.error`~~ | ~~编译器 8 处~~ | ✅ **已修复** - 与 console.log 使用相同的 _print_str |
| ~~P1~~ | ~~`fs.statSync`~~ | ~~compiler/index.js~~ | ✅ **已修复** - 修复了 _object_get 的 NaN-boxing unbox 问题 |
| P1 | 运行时段错误 | 自举编译产物 | 编译成功但执行时 SIGSEGV，待调试 |

### 修复日志

**2024-XX-XX - _object_get NaN-boxing 修复**
- 问题：`_object_get` 及相关函数没有 unbox NaN-boxed 对象参数
- 修复：为以下函数添加了 NaN-boxing unbox 逻辑：
  - `_object_get` - 对象属性读取
  - `_object_set` - 对象属性设置  
  - `_object_has` - 属性存在检查
  - `_prop_in` - in 运算符
  - `_object_keys` - Object.keys()
  - `_object_values` - Object.values()
  - `_object_entries` - Object.entries()
  - `_object_assign` - Object.assign()
  - `_object_getPrototypeOf` - Object.getPrototypeOf()
  - `_object_setPrototypeOf` - Object.setPrototypeOf()
- 影响：修复了 fs.statSync 返回对象的属性访问崩溃

**2024-XX-XX - console.warn/error 实现**
- 问题：console.warn 和 console.error 被编译为动态方法调用，导致 SIGSEGV
- 修复：在 compiler/functions/functions.js 中添加专门处理，复用 console.log 的 _print_str 逻辑

**2024-XX-XX - fs.statSync 启用**
- 问题：generateFSStatSync() 被注释掉
- 修复：在 runtime/types/fs/index.js 中启用 generateFSStatSync()

### 自举可选项 (可绕过)

| 优先级 | 功能 | 使用位置 | 说明 |
|--------|------|----------|------|
| P2 | `execSync` stdout 捕获 | compiler/index.js | 静态库生成使用 ar 命令，当前只执行不捕获输出 |
| P2 | `JSON.stringify` space 参数 | compiler 2 处 | 格式化 JSON 输出，不影响核心功能 |
| P3 | `\d` 正则字符类 | 暂无使用 | 目前编译器未使用 \d\w\s 等字符类 |

### 编译器使用的核心特性 (已全部实现)

**ES6+ 语法**
- `class` / `extends` / `super` / `static` - vm/index.js, compiler/*.js
- `import` / `export` - 所有源文件模块化
- 箭头函数 `() => {}` - 广泛使用
- 模板字符串 `` `${expr}` `` - 错误消息、字符串构建
- 解构赋值 `const { a, b } = obj` - 模块导入、函数返回
- 展开语法 `...arr` - 数组构建
- `for...of` 循环 - AST 遍历、Map/Set 迭代
- 可选链 `?.` / 空值合并 `??` - 安全访问
- 默认参数 `function f(x = 0)` - 可选参数

**内置对象**
- `Map`: new, set, get, has, delete, keys, values, entries
- `Set`: new, add, has, delete, clear
- `Array`: push, pop, indexOf, includes, map, filter, reduce, some, every, find, slice, join
- `Object`: keys, values, entries, assign
- `JSON`: stringify, parse
- `RegExp`: test, exec

**Node.js API**
- `fs`: readFileSync, writeFileSync, existsSync, unlinkSync
- `path`: join, dirname, basename, resolve, isAbsolute
- `process`: argv, platform, arch, exit, cwd
- `Buffer`: alloc, from, concat, isBuffer, readUInt8/16/32, writeUInt8/16/32
- `os`: tmpdir
- `child_process`: execSync (基础)

**字符串方法**
- length, charAt, charCodeAt, indexOf, includes, startsWith, endsWith
- slice, substring, split, replace, replaceAll, trim, padStart, padEnd
- toUpperCase, toLowerCase, repeat

### 自举路线图

1. **阶段一** (P0 当前阻塞): 实现 `console.warn` 和 `console.error`
2. **阶段二** (P1): 修复 `fs.statSync` 运行时崩溃
3. **阶段三**: 调试自举编译产物的运行时段错误
4. **阶段四**: 尝试编译简化版编译器 (只保留核心功能)
5. **阶段五**: 完整自举测试
6. **阶段六**: 性能优化与 bug 修复

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

*最后更新: 2026-02-03*

## 最近更新 (2026-02-03)

### 自举分析结果

通过对编译器源代码 (~58,000 行) 的全面分析，发现以下自举阻塞问题：

**P0 - 阻塞自举 (必须修复)**

| 功能 | 使用频率 | 状态 | 说明 |
|------|----------|------|------|
| `console.warn` | 20+ 处 | ❌ 未实现 | 编译器警告输出，如 "Unhandled statement type" |
| `console.error` | 8 处 | ❌ 未实现 | 编译器错误输出，如编译错误信息 |
| `fs.statSync` | 1 处 | ⚠️ Bug | 运行时调用 `_fs_stat_sync` 时崩溃 |
| 运行时段错误 | - | ⚠️ Bug | 自举编译产物执行时 SIGSEGV |

**P1 - 建议修复**

| 功能 | 使用频率 | 状态 | 说明 |
|------|----------|------|------|
| `JSON.stringify(obj, null, 2)` | 2 处 | ⚠️ 部分 | space 参数被忽略，不影响核心功能 |
| `Array.from` | 1 处 | ✅ 已实现 | 用于 Map keys 转数组 |
| `Object.create(null)` | 1 处 | ✅ 已实现 | 创建无原型对象 |

### 编译器核心依赖统计

| 类别 | 使用频率 | 覆盖率 |
|------|----------|--------|
| ES6 模块 (import/export) | 极高 | ✅ 100% |
| Map / Set | 非常高 | ✅ 100% |
| 箭头函数 | 非常高 | ✅ 100% |
| 模板字符串 | 非常高 | ✅ 100% |
| for...of 循环 | 非常高 | ✅ 100% |
| 类 (class/extends) | 非常高 | ✅ 100% |
| 数组方法 (push, map, filter, some, find 等) | 非常高 | ✅ 100% |
| 字符串方法 (startsWith, split, replace 等) | 高 | ✅ 100% |
| Object 方法 (keys, values, entries, assign) | 高 | ✅ 100% |
| console.log | 高 | ✅ 已实现 |
| console.warn | 高 | ❌ 未实现 |
| console.error | 中 | ❌ 未实现 |
| try/catch/throw | 中 | ✅ 已实现 |
| 正则表达式 | 中 | ✅ 已实现 |
| Math 方法 | 中 | ✅ 已实现 |
| Buffer | 低 | ✅ 已实现 |
| async/await | 低 (1处) | ✅ 已实现 |

### 回归测试修复
- **栈帧大小不足**: `_main` 函数的栈帧从 512 字节增加到 1024 字节，修复了复杂程序中的栈溢出崩溃
- **TYPE_NUMBER/TYPE_FLOAT64 严格相等**: 修复 `===` 运算符，允许 TYPE_NUMBER (13) 和 TYPE_FLOAT64 (29) 两种数字类型之间的值比较
- **RegExp.test 返回类型**: 修复返回值从原始整数 (0/1) 改为 NaN-boxing 布尔值 (`_js_true`/`_js_false`)
- **数组回调方法**: 添加 find/findIndex/some/every 到内置方法注册表

### 回归测试状态
- 测试套件: 85 项测试
- 通过率: 100% (85/85)
- 覆盖: 基础类型、typeof、字符串方法、数组方法、对象、运算符、解构、函数、闭包、类、Map/Set、JSON、Math、RegExp、循环、Generator、模板字符串

### 自举分析
- **自举编译**: ✅ 可以编译 cli.js 生成 selfhost (3.7MB ARM64 Mach-O)
- **编译错误**: ✅ 全部解决，无 `ERROR: Unknown label` 错误
- **运行时状态**: ⚠️ 段错误（SIGSEGV, 需进一步调试）
- **语言特性覆盖率**: 98% - 绝大部分 ES6+ 特性已实现
- **Node.js API 覆盖率**: 88% - 缺少 `console.warn`, `console.error`, `fs.statSync` 有 bug
- **阻塞项**: console.warn/error 未实现；fs.statSync 运行时崩溃；自举产物运行时段错误

#### 本次修复的自举阻塞项 (2026-02-03):


**编译时问题:**
1. ✅ **`new AST.Identifier()` 解析错误**: `parseNewExpression` 使用 `Precedence.MEMBER` 导致成员访问无法被正确解析。修改为使用 `Precedence.CALL`，使 `new X.Y()` 正确解析为 `new (X.Y)()`
2. ✅ **命名空间导入类支持**: 添加对 `import * as AST` 形式导入的类 (`new AST.Identifier()`) 的编译支持，从命名空间 exports 中查找类信息
3. ✅ **`_dataview_new` 运行时**: 添加 `TYPE_DATAVIEW = 16` 和 `DataViewGenerator` 类，实现 `new DataView(buffer, offset, length)`
4. ✅ **`_class_info_Error` 标签**: 添加 Error 类信息初始化函数 `_init_error_class_info`，供 `extends Error` 的用户类使用
5. ✅ **`_init_error_class_info` 调用**: 在 `_start` 入口点调用，初始化 Error 类的 classInfo 对象

**之前修复的阻塞项:**
1. ✅ **BigInt 字面量**: 添加 lexer/parser 支持 `48n`, `0x7ff8000000000000n` 等
2. ✅ **`from` 关键字**: 现在可作为普通标识符使用（上下文关键字）
3. ✅ **`>>>=` 运算符**: 无符号右移赋值运算符
4. ✅ **模块解析**: 添加 os, child_process, buffer, url, util 到内置模块列表
5. ✅ **模块导入类型**: 修复 processModuleImports 参 type 属性（named → function/variable）
6. ✅ **栈动态扩展**: 预分析函数体估算局部变量数量，动态计算栈大小
7. ✅ **无限参数支持**: 前6个参数通过寄存器(A0-A5)传递，超出部分通过栈传递
8. ✅ **类跨模块引用**: 添加 `classInfoLabel` 与 `constructorLabel` 分离，正确处理模块前缀
9. ✅ **导出类编译**: 在 `processExportDeclaration` 中实际编译类声明
10. ✅ **函数重导出**: 支持 `export { func } from "module"` 语法
11. ✅ **`_to_number`/`_to_string`**: 添加类型转换运行时函数
12. ✅ **全局内置函数**: 添加 `parseInt`/`parseFloat`/`isNaN`/`isFinite` 支持
#### Bootstrap 测试修复 (2024-02-04):

**Array 静态方法编译:**
1. ✅ **Array.from**: 添加编译支持，调用 `_array_from` 运行时函数
2. ✅ **Array.isArray**: 添加编译支持，调用 `_array_is_array` 运行时函数

**String 静态方法编译:**
3. ✅ **String.fromCharCode**: 添加编译支持，调用 `_string_from_char_code` 运行时函数

**print() 函数修复:**
4. ✅ **多参数支持**: 修复 `print()` 函数只打印第一个参数的问题，现在支持多参数（类似 console.log）

**Map/Set 迭代器编译:**
5. ✅ **Map.keys()/values()/entries()**: 添加到 mapMethods 列表并添加 compileMapMethod 编译 case
6. ✅ **Set.keys()/values()/entries()**: 添加到 setMethods 列表并添加 compileSetMethod 编译 case
7. ✅ **迭代器 source_type 参数**: 修复 Map/Set 迭代器函数缺少 A2 参数的问题：
   - `_map_keys`/`_map_values`/`_map_entries`: A2 = 2 (SOURCE_TYPE_MAP)
   - `_set_values`/`_set_keys`/`_set_entries`: A2 = 3 (SOURCE_TYPE_SET)

**测试结果:**
- Bootstrap 测试: **11/11 通过** (从 9/11 提升)
- 完整测试套件: **226 通过, 8 失败, 8 跳过** (大幅提升！)

#### ARM64 栈对齐修复 (2024-02-04):

**问题分析:**
1. **Array.flat() Segfault**: ARM64 ABI 要求 SP 始终 16 字节对齐
2. **类测试 Segfault**: 嵌套函数编译时 `_lastAlignedStackSize` 状态污染

**修复:**
1. ✅ **ARM64 prologue/epilogue SP 对齐**: 在 `backend/arm64.js` 中：
   - `prologue()`: 使用 `((stackSize + 15) & ~15)` 对齐栈大小
   - `epilogue()`: 使用传入的 `stackSize` 参数手动对齐，不再依赖 `_lastAlignedStackSize`
   
**修复前:** 嵌套函数的 prologue 会覆盖 `_lastAlignedStackSize`，导致外层函数 epilogue 恢复错误的栈大小

**修复后:** 
- Array.flat() 测试全部通过
- 类测试 8/8 全部通过 (之前 7 个 segfault)
- Buffer 测试 5/5 全部通过

**剩余失败测试 (8个):**
- async/basic.js: 异步功能 segfault
- debug/test_cli_imports.js: CLI 导入 segfault
- error/try_catch_basic.js: 异常处理 segfault
- legacy/test_comprehensive.js: 综合测试 segfault
- legacy/test_date_basic.js: Date 测试 segfault
- legacy/test_part6.js: 运行失败
- legacy/test_regexp_basic.js: RegExp 测试 segfault
- legacy/test_set_full.js: Set 测试运行失败

#### 自举调试 (2025-02-05):

**问题1: Export Variable Init 寄存器冲突** ✅ 已修复
- 现象: SIGBUS 写入代码段 (str x0, [x0])
- 原因: VReg.V0 和 VReg.RET 都映射到 X0，lea(V0) 覆盖了 RET 的值
- 修复: 在 compileExportVariableInit 中先 mov(V1, RET) 保存结果

**问题2: 对象缓冲区溢出** ✅ 已修复
- 现象: _strcmp 崩溃，x19 = "UNCTION" (字符串内容而非指针)
- 原因: _object_new 只分配 256 字节，最多存 14 个属性，TokenType 有 80+ 个属性
- 修复: 将 _object_new 的分配大小从 256 改为 4096 (可存 254 个属性)
- 验证: 259 个测试全部通过

**问题3: 自举编译器新崩溃** 🔄 调试中
- 现象: Segfault 写入代码段地址 (EXC_BAD_ACCESS code=2)
- 位置: TypedArray 写入操作 (_typed_array_set_by_index)
- 原因: x0 传入的对象指针实际是代码地址 (0x1000201f8)
- 分析中...

#### 自举调试 (2026-02-05 最新)
- 现象: 自举产物在编译 `examples/helloworld.js` 时依旧 SEGFAULT。
- 采集: 最新 LLDB 日志显示多处空指针/非法指针：
  - `_object_set` 在 obj=0 情况下解引用 count；已为 `_object_set` 增加空指针与堆范围早退。
  - `_object_get_prop` 在传入小整数/非对象时直接按裸指针读 type；已添加堆范围检查，非法指针回退到 `_object_get`。
- 状态: 修复编译后，崩溃转移到新位置 `0x10000db1c: ldr x20,[x19]` (`x19=0`)，疑似在调用函数指针前未判空。需要继续定位调用方并补齐判空/类型检查。

#### 自举调试 (2026-02-06)
1. **修复闘包空指针崩溃**: 在多处添加了对 null 闘包指针的检查 (functions.js, builtin_array_callbacks.js, builtin_methods.js)
2. **修复布尔/undefined NaN-boxing**:
   - BooleanLiteral 返回 NaN-boxed 值 (0x7ff9000000000001n/0x7ff9000000000000n)
   - `!` 运算符返回 NaN-boxed true/false
   - 多处 undefined 返回修复为 NaN-boxed (0x7ffb000000000000n)
3. **修复 BigInt 位运算崩溃**:
   - 问题: 位运算 (`|`, `&` 等) 的 `compileOperandAsFloat` 对非字面量调用 `unboxNumber`，但 BigInt 不是 Number 对象
   - 解决: 为位运算添加专门的处理分支，直接使用 `compileExpression` 不 unbox

4. **当前问题**: selfhost 二进制中对象属性访问返回 `0`
   - 现象: `Targets["macos-arm64"]` 返回 `0` 而不是对象
   - 原因分析中: 可能是字符串比较或 `_object_get` 运行时函数有问题