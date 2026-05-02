# JSBin 统一工程规划

> 更新时间: 2026-04-19
> 本文档整合自:
> - `docs/CYCLIC_BOOTSTRAP_ANALYSIS.md`
> - `docs/ES_SUPPORT.md`
> - `docs/NODEJS_SUPPORT_ANALYSIS.md`

## 1. 目标

这份规划的目标，不是把三个方向并排罗列，而是把它们收束成一条真正可执行的主线。

当前项目有三条看似独立、实际上强耦合的工作流：

1. 循环自举和模块系统
2. ECMAScript 标准能力
3. Node.js 兼容与包生态

它们之间的真实关系是：

- 循环自举不是单独的 feature，而是整个模块运行时的基础设施层。
- ES 标准支持不是锦上添花，而是 Node shim 和 loader 的运行时前置条件。
- Node.js 兼容不是“继续堆 shim 文件”，而是建立在模块系统、全局对象和包解析之上的上层能力。

因此，工程目标应该被重新定义为：

> 先做稳模块运行时和 ES 基座，再做 Node resolver/loader，最后再扩大 Node 模块和更完整的 ES 覆盖。

## 1.1 自动化实施规划（2026-04-22 滚动版）

以下规划用于自动化线程按“执行任务 -> 验收任务 -> 反馈 -> 下一任务”持续推进，直到达到“ES 语法支持完整 + 可循环自举 + Node.js 兼容完整”。

### 阶段 A：稳基线（必须始终保持）

- 执行任务 `E-A1`：保持 `test:fixtures` 全绿。
- 执行任务 `E-A2`：保持 `test:selfhost-smoke` required case 全绿。
- 执行任务 `E-A3`：保持 `test:selfhost-smoke --strict` 全绿。
- 验收任务 `V-A1`：`npm run -s formal:check` 通过（`PASS=116 FAIL=0`）。
- 验收任务 `V-A2`：`node --no-warnings scripts/run-selfhost-smoke.mjs --strict` 通过。
- 失败处理：任一验收失败时，停止新功能扩展，优先回到最近“fixtures+required smoke”稳定点再重试。

### 阶段 B：去探针化（把临时保护替换为通用语义）

- 执行任务 `E-B1`：定位并替换 selfhost probe 专用分支（`member-read/via-identifier/object-method-call`）为通用对象属性读取/方法调用路径。
- 执行任务 `E-B2`：为 `FunctionExpression`、对象方法 shorthand、`this` 绑定补齐 selfhost 可编译链路。
- 验收任务 `V-B1`：在移除对应 probe 保护后，`selfhost --strict` 仍保持全绿。
- 验收任务 `V-B2`：新增等价 fixture（不依赖 probe 文件名）并通过。
- 失败处理：若通用实现不可行，允许临时回退到保护分支，但必须记录根因与下一轮替代方案。

### 阶段 C：循环自举增强

- 执行任务 `E-C1`：加入 Gen2/Gen3 自举链验证（`host -> gen1 -> gen2 -> gen3`）。
- 执行任务 `E-C2`：比较不同代编译器在关键 fixture 上的行为一致性（stdout/exit code）。
- 验收任务 `V-C1`：Gen2、Gen3 在 required fixture 与 selfhost strict 上结果一致。
- 验收任务 `V-C2`：无新增 probe 专用分支。
- 2026-04-23 当前反馈：`--chain` 验收入口已接入，但 `gen1 -> gen2` 在模块图编译路径稳定 `SIGSEGV`（`cli.js`、`compiler/index.js`、`runtime/index.js`、含 `import/export` 的模块 fixture 都会触发）。
- 阶段 C 下一执行任务 `E-C1a`：先把 `gen1 compile tests/fixtures/modules/simple-local-import/main.js` 从 `SIGSEGV` 修复到“可编译并产物可执行”，再继续推进 `cli.js` 的 `gen1 -> gen2` 闭环。
- 2026-04-23 本轮反馈：`E-C1a` 已从“编译期 `SIGSEGV`”推进到“`simple-local-import` 可编译（`compile=0`）但运行期 `exit=139`”；`gen1 --debug cli.js` 崩溃点继续后移到更深 parser 语句路径。
- 阶段 C 下一执行任务 `E-C1b`：优先继续替换 parser 热路径中的 `new AST.*`（控制流与赋值/成员链路），把 `simple-local-import` 修到 `stdout=42`，再回放 `--chain --strict`。
- 2026-04-23 本轮反馈（续）：在不回退主线基线的前提下，`parseInfix assignment`、`Try/Catch/Switch`、`NewExpression`、`ObjectPattern/ArrayPattern`、`ClassParser` 均已去 `new AST.*` 热路径；最小样例 `const compiler = new Compiler(target)` 已从 `compile=139` 推进到 `compile=0`。
- 2026-04-23 当前链路状态（更新）：`--chain --strict` 仍在 `gen1 -> gen2` 失败，但失败输出已从“仅 `Compiling: cli.js` 后崩溃”推进到“进入 `Recursively compiling: runtime/node/fs.js` 后崩溃”；`gen1 --debug cli.js` 崩溃点已后移到 `runtime/node/fs.js` 的 `class Stats` 构造链路。
- 阶段 C 下一执行任务 `E-C1c`：继续替换 class 成员体与方法体中的 parser 热路径（尤其构造器与成员初始化），并并行收敛 `compileCallExpression` 的 `functionSymbol=0` 污染（最小样例 `const x = Compiler(target)`），随后回放 `--chain --strict`。
- 2026-04-23 当前链路状态（更新 2）：`--chain --strict` 与非 strict fallback `--chain` 均仍在 `gen1 -> gen2` `SIGSEGV`。fresh gen1 下 `simple-local-import` 已是 `compile=0, run=139`，但 `runtime/node/fs.js` / `compiler/index.js` 仍 `compile=139`。
- 阶段 C 根因收敛（更新 2）：`gen1 --debug runtime/node/fs.js` 崩溃前稳定停在 `m0_byteToChar` 的 `IfStatement -> LogicalExpression` 编译链；并且最小探针显示 `min-logical` 编译崩溃、`min-inc` 编译崩溃、`min-binary` 语义错误（`1` 而非 `2`）。
- 阶段 C 下一执行任务 `E-C2l-1/E-C2d-4/E-C2e-4`：
  - 先修 `LogicalExpression` selfhost 编译稳定性（验收 `min-logical`）
  - 再修 `UpdateExpression(i++)` 编译稳定性（验收 `min-inc`）
  - 再收敛 `BinaryExpression(a+1)` 左右值读取（验收 `min-binary`）
  - 三项通过后回放 `gen1 compile runtime/node/fs.js` 与 `--chain --strict`
- 2026-04-23 当前反馈（更新 3）：
  - 基线门禁保持稳定：`formal:check` 与 `selfhost --strict` 继续全绿。
  - 链路门禁仍失败：`--chain --strict` 持续在 `gen1 -> gen2` `SIGSEGV`，失败位置仍在 `runtime/node/fs.js` / `compiler/index.js` 邻域。
  - 表达式修复组（`E-C2l-1/E-C2d-4/E-C2e-4`）当前未达标：
    - `min-binary` 当前 `compile=139`（出现回退信号）；
    - `min-inc` 当前可编译，但运行期仍失败；
    - `min-logical` 仍编译期失败。
- 阶段 C 下一执行任务（更新 3）：
  - 先回退/隔离本轮 `BinaryExpression` selfhost 实验路径，恢复 `min-binary compile=0`；
  - 再将 `parseBinary` 的右值镜像收敛为 token-only 标量通道（避免读不稳定 AST 子节点）；
  - 两项达标后重跑 `min-logical/min-inc`，最后再回放 `--chain --strict`。

### 阶段 D：Node 兼容收口

- 执行任务 `E-D1`：补齐 `node:` builtin 与 CJS/ESM 互操作边角语义（缓存、错误传播、时序）。
- 执行任务 `E-D2`：将当前 subset shim 逐步替换为 near-node 语义实现。
- 验收任务 `V-D1`：`tests/fixtures/node` 持续全绿且无新增 `XFAIL`。
- 验收任务 `V-D2`：跨模块、跨包、跨格式（ESM/CJS）回归稳定。

## 2. 当前状态摘要

## 2.1 已经基本打通的部分

最近一轮修复后，循环自举主路径已经明显改善：

- 入口文件已进入 `_moduleOrder`
- 模块级 `import` 绑定在顶层执行前统一初始化
- 模块上下文和函数标签已按模块隔离
- re-export 链的 namespace 同步已补齐
- `_module_registry` 已按模块图动态分配，模块状态则通过每模块独立的 `stateLabel` 维护
- ESM/CJS 模块顶层体已经统一拆成 `_init_module_<id>` / `_init_cjs_module_<id>` 初始化函数，`_main` 只负责建表并确保入口模块
- 静态 import、side-effect import、re-export 和 `require(esm)` 都已经统一收敛到编译器侧的 `emitEnsureModuleInitialized(...)` 路径
- 被顶层函数捕获的模块级函数/类绑定已能在循环场景下预初始化
- `tests/fixtures/` 下已经有统一 fixture runner，可同时跟踪通过用例和 known failure
- 类声明已经从“假函数标签”路径移回模块顶层执行路径，匿名默认导出类、静态方法访问、以及“顶层函数读取类绑定”都已有 fixture 回归

这意味着项目已经脱离“模块几乎不可用”的阶段，进入“有可工作的 ESM 子集，但还没有完整 ESM 运行时模型”的阶段。

## 2.2 当前真正的结构性缺口

把三份文档合起来看，现在最关键的缺口不是几十个分散 bug，而是下面五类基础设施还没有同时成立：

1. 完整 runtime module record / errored state machine
2. 更标准化的 live binding / binding cell 语义
3. `JSON.parse` / iterator / Error / Promise 组合方法这类 ES 基础能力
4. 更复杂的 CommonJS / ESM 互操作与 Node loader 错误语义
5. 更贴近规范与生态包的系统化回归测试

只要这五类不收敛，后面的 Node 兼容和更完整 ES 支持都会继续出现“能编译、值不对、静默退化”的问题。

## 2.3 当前回归基线

统一 fixture runner 已经覆盖 modules / es / node 三组回归面。以 `2026-04-19` 在当前仓库上直接运行 `node --no-warnings scripts/run-fixtures.mjs` 的结果为准，当前状态是：

- `PASS=93`
- `XFAIL=1`
- `FAIL=0`

已经转绿的 Phase 0/ES 基线项包括：

- `JSON` 全局对象存在
- `JSON.stringify(1)` 输出正确
- `Symbol()` 已返回真实 runtime type，`typeof Symbol("x") === "symbol"`
- class static block 已形成 parser/compiler/runtime 闭环
- 顶层函数读取 class 绑定、匿名默认导出 class、静态方法访问已进入 fixture 并转绿
- 运行时生成字符串的打印、`charAt`、索引访问、`charCodeAt` 已进入 fixture
- 引用类型的 `===` / `!==` 已对 object/array/function 走稳定 identity 比较，`obj === alias` 这类场景已进入 fixture
- 数组 `for...of` 与 custom `Symbol.iterator` 已进入 fixture 并转绿
- `JSON.parse` 的 scalar / object / array / nested structure 路径已进入 fixture 并转绿
- `Promise.all` / `Promise.race` 已进入 fixture 并转绿，`Promise.allSettled` 主路径已转绿，mixed-order `length` 边界已固化为 `XFAIL`
- `new Promise((resolve, reject) => { ... })` 的同步 inline executor 子集，以及 `new Promise(executor)` 的函数声明 / 本地 function-valued binding / 本地 alias-chain / 先声明后赋值 binding / 静态 conditional / 静态 logical-expression / 静态 factory-call / factory-arg / factory-binding / nested factory-param executor 子集已进入 fixture 并转绿
- `Error` / `TypeError` / `ReferenceError` 的构造、属性访问、字符串化与控制台输出已进入 fixture 并转绿
- 严格相等基础语义已补一轮修正，`undefined === undefined` 这类路径已恢复正确
- `async` 的 `try/catch/finally`、`await Promise.reject(...)` 捕获路径，以及 nested `finally` 路径已进入 fixture 并转绿
- `queueMicrotask(...)` 已接到 runtime next-tick 队列，并进入 fixture 转绿
- `queueMicrotask` 与 `node:timers` 的基础交织顺序已进入 fixture 并转绿
- object method 对顶层 helper 的调用/参数转发也已进入 fixture 并转绿
- 长链模块共享依赖初始化一次的路径已进入 fixture 并转绿

最近刚转绿的 Node / runtime 关键路径包括：

- 本地 `node_modules` 下的简单 ESM 包已可解析并运行
- `package.json main/module` 已按 `import` / `require` 分流选择入口
- `package.json exports` 已支持根入口、子路径、`*` 模式以及 `import/require` 条件分发，并进入 fixture 回归
- unknown string 值的 `String(...)`、模板/拼接路径已收敛到统一字符串归一化 helper
- dynamic `+` 在 `unknown + unknown` 场景下会按运行时值分派为字符串拼接或数值加法
- `require("fs")` 这类静态字符串 builtin require 已可编译并返回模块 namespace，对应基线 fixture 已转绿
- 本地 CommonJS 文件已改成按 `require()` 首次初始化，而不是继续依赖 `_main` 的预执行顺序
- 重复 `require("./mod.js")` 会返回同一个 cached exports 值
- CommonJS `A -> B -> A` 循环依赖已能暴露 partial exports，且不会无限递归
- ESM 对 CommonJS 的 `default` / `named` / `namespace` 导入桥接已在本地文件和 `node_modules` 包上进入 fixture
- CommonJS 对 ESM 的 `require()` namespace bridge 已在本地文件和 `node_modules` 包上进入 fixture
- ESM/CJS 顶层求值已经统一改成按模块 `state + init` 路径递归初始化，不再依赖 `_main` 的预执行顺序
- `require(esm)` 发生在 CommonJS 初始化中的混合循环场景已经进入 fixture，并且会在读取 namespace 前先完成 ESM 顶层求值
- `node:os` 这类 builtin scheme 已进入 fixture，未知 `node:` builtin 会在解析阶段直接失败，而不是静默退化成错误值
- `node:timers` 已进入 fixture，`node:process` 的对象形状、基础入口和 `nextTick` 也已进入 fixture
- `node:timers` 的 `setImmediate`、`setTimeout(0)`、命名导入/默认导入、handle 返回形状以及 `clearTimeout` / `clearImmediate` 的基础取消语义都已进入 fixture 并转绿
- `node:util` 的 `util.types` 对象和稳定 predicate 暴露面已进入 fixture 并转绿
- `package.json type=commonjs` 的 `.js` 文件不再会把 `import/export` 静默当成 ESM 编过去，相关负例已进入 fixture
- `.cjs` 入口现在会正确覆盖 `package.json type=module`，对应包级 ESM bridge 已进入 fixture

当前 fixture 基线已经没有显式红灯，但开始用 `XFAIL` 固化仍未收口的语义边界。这说明当前最直接的短板，已经不再是 import/export 主路径、`for...of`、`JSON.parse`、Promise/async 主路径，或 `node:process.nextTick` / object-method helper 这类近期缺口，而是更深一层的 async runtime、模块状态机完整性，以及更贴近 Node 的 runtime 语义。

按发布口径看，当前状态更适合被描述为：

> ES/Node 核心子集已有稳定回归面的 preview 阶段。

而不适合被描述为：

> 完整 ECMAScript 支持，或 near-node 级 Node.js 兼容。

需要单独说明的是：

- “绝大多数模块与 Node 基线已转绿”不等于“完整 CommonJS / Node 互操作已完成”
- `Promise.allSettled` 的 mixed-order 结果数组 `length` 还没有完全收口，当前已通过 `XFAIL` fixture 固化
- `new Promise(executor)` 也还不是完整规范级支持；当前转绿的是“inline function/arrow executor 同步 resolve/reject”子集，以及函数声明 / 本地 function-valued binding / 本地 alias-chain / 先声明后赋值 binding / 静态 conditional / 静态 logical-expression / 静态 factory-call / factory-arg / factory-binding / nested factory-param executor 子集，不包含 executor 作为一般动态值传入的完整路径
- 当前已经转绿的是：builtin require、本地 CJS 文件求值、`module.exports` / `exports.*`、重复 require cache、CJS 循环 partial exports、`import cjs`、`require(esm)` 本地/包桥接，以及 `require(esm)` 发生在混合循环初始化中的求值顺序
- 还没完成的主要是：真正的 runtime module record、`ERRORED` 状态传播、更复杂的 CJS/ESM 循环边角、以及更贴近 Node 的 runtime 错误与 namespace 细节

## 3. 关联性排序

下面是三条工作线的真实依赖顺序。

### P0: 最强前置依赖

1. 回归测试基线
2. 模块运行时模型
3. ES 核心对象与基础协议

### P1: 依赖 P0 的上层工程

4. 包解析与 `node_modules` 消费
5. CommonJS loader 与 CJS/ESM 互操作

### P2: 建立在前两层之上的能力扩展

6. Node core module 分层补完
7. 更广的 ES 语法与标准库覆盖
8. 包管理、workspace、可重复构建等工程化增强

换句话说，真正的优先级不是：

- 先补更多 Node shim
- 先追更多 ES 新语法
- 先做 npm 生态

而是：

- 先把底座做成

## 4. 统一主路线

推荐把整个工程拆成 6 个阶段。

## Phase 0: 建立统一回归面

### 目标

把当前依赖零散手工样例的状态，升级成持续可回归的测试体系。

### 范围

新增统一测试目录，例如：

- `tests/modules/`
- `tests/es/`
- `tests/node/`

每个 fixture 记录：

- parser 是否通过
- compiler 是否通过
- 运行 stdout/stderr
- exit code

### 这一阶段为什么排第一

因为后面所有工作都涉及“语义修正”，没有统一回归面，就会出现：

- 修好循环导入，打坏 Promise
- 修好 Node shim，打坏本地模块
- 修好一个 import/export 路径，另一个 re-export 路径悄悄回归

### 验收标准

- 模块循环、ES 全局对象、Promise、Node builtin、`node_modules` fixture 都进入自动回归
- 允许有 `known failures`，但必须显式列出

## Phase 1: 完成模块运行时模型

这是全工程的核心阶段，也是最高优先级。

### 目标

把当前“可工作的 ESM 子集”推进成“结构完整的模块运行时”。

### 重点任务

1. 把 `_module_registry` 从 namespace 指针数组升级为真正的 module record 数组
2. 每个记录至少包含：
   - `state`
   - `namespace`
   - `environment` 或 binding cell 集合
   - `error`
3. 定义统一状态流转：
   - `UNINITIALIZED`
   - `INITIALIZING`
   - `INITIALIZED`
   - `ERRORED`
4. 把 live binding 从当前的 box + namespace 回写，收敛到统一 binding cell 语义
5. 补齐导出列表中的函数/类绑定路径
6. 补齐匿名默认导出路径
7. 统一 side-effect import、default import、named import、namespace import、re-export 的求值语义

### 当前阶段已完成的补充点

- 模块顶层求值已经统一改成 per-module init 函数，`_main` 不再顺序内联执行所有 ESM 顶层体。
- side-effect import、default/named/namespace import、re-export 现在都会在读取源模块前先走统一的 `emitEnsureModuleInitialized(...)`。
- `_init_module_<id>` 里现在会真正执行顶层 `ClassDeclaration`，而不是继续把它们当成可预编译的函数占位。
- 匿名 `export default class {}` 现在会生成可导入、可做 `typeof`、可访问静态方法的真实类值。
- 被顶层函数捕获的类绑定现在会写回 box，因此 `export class A {}; export function f() { return A; }` 这类路径不再是假成功。
- 新增模块回归：
  - `modules/default-export-anonymous-class`
  - `modules/class-binding-captured-by-top-level-function`

### 为什么它是第一位

因为这一步同时阻塞：

- 循环自举
- 动态 import
- CommonJS/ESM loader
- Node shim 之间的稳定导入
- 包缓存语义

### 验收标准

- `a -> b -> a` 根模块循环稳定
- default/named/namespace/re-export 循环矩阵通过
- 模块不会因初始化时机不同而随机出现空绑定

## Phase 2: 补齐 ES 基座

这是第二优先级，但它和 Phase 1 一起构成 Node 兼容的前置条件。

### 目标

把当前最影响 shim 和 loader 的 ES 基础对象、协议和异步组合能力补齐。

### 重点任务

1. `JSON`
   - `JSON.stringify`
   - `JSON.parse`
2. `Symbol`
   - `Symbol.iterator`
   - symbol 属性键的基础支持
3. iterator protocol
4. `Error` 体系
   - `Error`
   - `TypeError`
   - `ReferenceError`
5. Promise 组合方法
   - `Promise.all`
   - `Promise.race`
   - `Promise.allSettled`
6. 明确并实现 `_js_import` 的运行时语义

### 为什么它排在 resolver 之前

因为当前很多 Node shim 已经直接依赖：

- `JSON.stringify`
- `[Symbol.iterator]`
- Promise runtime

如果这些对象还没补齐，Node 层会继续出现“模块路径看起来对了，但运行值还是错的”的假成功。

### 验收标准

- `typeof JSON === "object"`
- `typeof Symbol === "function"`
- `[Symbol.iterator]` 路径可用
- Promise 组合方法不再是占位返回值

### 当前阶段已完成的补充点

- `JSON` 全局对象和 `JSON.stringify(number)` 已进入 fixture 并转绿
- `Symbol()` 已具备真实 runtime type，`typeof Symbol("x") === "symbol"`
- 对象 symbol-key 的 getter / setter 已补进 runtime 与 compiler 路径
- 数组 `for...of` 与 custom `Symbol.iterator` fixture 都已转绿，当前已具备基础 iterator protocol 执行面
- `JSON.parse` 的 scalar / object / array / nested structure 路径已进入 fixture 并转绿
- `Promise.all` / `Promise.race` / `Promise.allSettled` 已进入 fixture 并转绿，不再是占位返回值
- `Error` / `TypeError` / `ReferenceError` 已进入 fixture 并转绿，包含 `name/message/cause`、`String(err)`、`console.log(err)` 路径
- `===` 的基础 runtime 语义已补一轮修正，`undefined === undefined` 等恒等场景已恢复正确

### Phase 2 剩余重点

- 真正工程化的 async runtime：event loop / wall-clock / cancellation
- `_js_import` 与更完整的动态导入语义
- 更深的 iterator / generator / async iteration 语义
- `new Promise(executor)` 的 constructor/runtime 闭环
- 函数对象属性语义（例如 `fn.extra = ...`，Node 中会直接影响 `process.hrtime.bigint` 这类 API 形态）

## Phase 3: 包解析与依赖消费

这是 Node 工程真正开始的一步。

### 目标

让 JSBin 能消费已经安装好的 `node_modules`，而不是继续停留在 builtin bare import。

### 重点任务

1. 重写 `resolveModulePath()` 成真正的 resolver
2. 支持：
   - `node:` builtin
   - relative/absolute path
   - `node_modules` 向上查找
   - `package.json`
   - `main`
   - `exports`
   - `type`
   - 子路径导出
3. 明确错误行为：
   - module not found
   - unsupported export target
   - unsupported condition

### 为什么它先于 CommonJS

因为无论是 ESM 包还是 CJS 包，第一步都得先解析到“正确的文件和正确的包入口”。

### 验收标准

- 预先安装到本地 `node_modules` 的简单 ESM 包可被正确解析
- `package.json exports` 的根入口、子路径和条件分发不再静默退化成空字符串或错误值

## Phase 4: CommonJS loader 与互操作

这是 Node 兼容的第二个核心阶段。

### 目标

支持 CommonJS 文件、CJS 包，以及 CJS/ESM 之间的最小可用桥接。

### 重点任务

1. 实现真正的 `require()`
2. 注入 CommonJS 运行时上下文：
   - `module`
   - `exports`
   - `require`
   - `__filename`
   - `__dirname`
3. 实现 CommonJS module cache
4. 统一 module record：
   - `esm`
   - `cjs`
   - `builtin`
5. 明确桥接规则：
   - `import x from "cjs"`
   - `import * as ns from "cjs"`
   - `require("esm")`

### 当前阶段已完成的补充点

- 本地 CJS 文件已经改成真正的按需初始化，并有 cache identity fixture 约束重复 `require()`
- CJS 循环依赖现在会暴露 partial exports，而不是无限递归
- ESM 到 CJS 的 `default` / `named` / `namespace` 导入桥接已对本地文件和 `node_modules` 包转绿
- CJS 到 ESM 的 `require()` namespace bridge 已对本地文件和 `node_modules` 包转绿
- `require(esm)` 在 CommonJS 初始化过程中的混合循环求值顺序已经进入 fixture，并转绿
- `package.json type` 现在已经参与格式判定，`.js/.cjs` 在包级互操作路径上不再静默走错模式

### 为什么它依赖前两阶段

因为 CommonJS loader 不是简单加一个 `require()` 函数，它依赖：

- 稳定的模块记录
- 稳定的模块缓存
- 正确的包入口解析

### 验收标准

- 本地 CJS 文件可被 `require()`
- `module.exports` / `exports.foo` 可用
- CommonJS 循环依赖不会无限递归
- `import cjs` 与 `require(esm)` 至少在本地文件和简单包入口上可用

## Phase 5: Node core module 分层补完

这一步不再按“有多少 shim 文件”衡量，而按“有多少语义可用”衡量。

### 建议分层

Tier A:

- `process`
- `console`
- `buffer`
- `events`
- `path`
- `url`
- `fs`
- `stream`
- `util`
- `timers`

Tier B:

- `os`
- `crypto`
- `dns`
- `net`
- `tty`
- `vm`
- `string_decoder`
- `zlib`

Tier C:

- `http`
- `https`
- `assert`
- `module`
- `readline`
- `worker_threads`
- `fs/promises`

### 每个模块必须定义兼容等级

不要只写“支持”，建议统一成：

- `shape-only`
- `subset-semantic`
- `near-node`

### 验收标准

- Tier A 模块有清晰 compatibility matrix
- 高价值模块不再只是占位返回值

## Phase 6: 扩大 ES 与工程化能力

这是后续扩展阶段，不应阻塞前面的主线。

### ES 侧

- `for await (... of ...)`
- import attributes / assertions
- 更完整的 `BigInt`
- `WeakMap` / `WeakSet`
- `DataView`
- 更大的标准库一致性

### 工程化侧

- lockfile 感知
- workspace 感知
- 可重复构建元数据
- 更真实的生态包 fixture

## 5. 统一优先级表

| 优先级 | 工作流 | 原因 | 直接阻塞 |
| --- | --- | --- | --- |
| P0 | 测试基线 | 没有回归面，后续改造风险不可控 | 所有后续阶段 |
| P0 | 模块运行时模型 | 这是循环自举、loader、cache 的基础 | Phase 2-5 |
| P0 | ES 基座 | `JSON` / `Symbol` / Promise 直接影响 shim 与 loader | Phase 3-5 |
| P1 | 包解析 | 没有 resolver 就谈不上包兼容 | Phase 4-5 |
| P1 | CommonJS loader / interop | Node 生态大量依赖 CJS | Phase 5 |
| P2 | Node core module 补完 | 建立在 resolver/loader 之上 | 生态可用度 |
| P2 | 更广 ES 覆盖 | 重要，但不应抢占主线 | 长期一致性 |
| P3 | 包管理与可重复构建 | 价值高，但不是当前最短阻塞路径 | 工程成熟度 |

## 6. 建议近期直接开工的 backlog

如果现在只选一组“最能推动整体局面”的任务，我建议按下面顺序开工：

1. 把当前 sideband `stateLabel` 升级为真正的 runtime module record / `ERRORED` 状态
2. 收敛 live binding / binding cell 语义
3. 继续向更完整 iterator / generator / async iteration 语义推进
4. 收紧 `new Promise(executor)` 的 constructor/runtime 闭环
5. 完善 `_js_import` 与动态导入语义
6. 完善 Node loader 错误语义与更复杂 CJS/ESM 循环互操作
7. 给 Tier A Node 模块建立 compatibility matrix
8. 继续推进包管理与 workspace 感知

已经完成、无需再作为 backlog 重复列出的项包括：

- 统一 fixture runner
- `JSON.parse` 基线路径
- `Promise.all` / `Promise.race` / `Promise.allSettled` 基线路径
- `Error` / `TypeError` / `ReferenceError` 基线路径

这是当前关联性最强、收益最高的一条线。

## 7. 当前不建议做的事

在进入 Phase 5 之前，不建议把下面这些作为主攻方向：

1. 继续堆更多 `runtime/node/*.js` 文件数量
2. 提前承诺“支持 npm 包”
3. 在没有 resolver/loader 的情况下追 `http/https`
4. 在没有统一回归面时做大面积语义重构
5. 在模块系统还没完整前，同时大范围扩展 ES 新语法

## 8. 文档关系

这份文档是总规划，三份原始文档继续保留为详细分析：

- `docs/CYCLIC_BOOTSTRAP_ANALYSIS.md`
  - 负责模块系统和循环自举细节
- `docs/ES_SUPPORT.md`
  - 负责 ES 标准支持与 ES 侧工程规划细节
- `docs/NODEJS_SUPPORT_ANALYSIS.md`
  - 负责 Node 兼容与包生态工程规划细节

推荐后续使用方式：

- 先看本文件决定主优先级
- 再去对应子文档看某一条线的具体技术细节和证据

## 9. 最终结论

这三个方向不应该再被当成三份平级任务，而应该被收敛成一条单主线：

1. 先做测试基线
2. 再完成模块运行时
3. 再补 ES 基座
4. 再做 Node resolver/loader
5. 最后扩展 Node 模块和更完整 ES 能力

如果按这条线推进，项目会从“很多子系统都碰到了，但都不够完整”，逐步转向“每一层都能稳定托住下一层”的状态。

## 10. 2026-04-23 Stage C-5 更新

- 稳基线门禁继续通过：`formal:check` 与 `selfhost --strict` 均保持全绿。
- 阶段 C 新前进：`min-binary/min-inc/min-logical/min-rel` 全部从“编译期崩溃”推进到“可编译（compile=0）”。
- 当前新阻塞：上述最小探针仍在运行期崩溃（138/139），说明主阻塞已从“表达式编译崩溃”转为“selfhost 运行期值表示/控制流执行稳定性”。
- 链路门禁未过：`--chain --strict` 仍在 `gen1 -> gen2` `SIGSEGV`，失败输出继续停在 `runtime/node/fs.js` / `compiler/index.js` 邻域。
- 下一优先级：
  1. 先把 selfhost `BinaryExpression` 返回值从保守占位收敛到稳定 JSValue 子集（`Identifier <op> Literal`）；
  2. 再收敛 `UpdateExpression` 槽写回值表示；
  3. 达标后再回放 `--chain --strict`。

## 11. 2026-04-23 Stage C-6 更新

- 稳基线门禁保持通过：`formal:check` 继续 `PASS=116 FAIL=0`，`selfhost --strict` 继续 `total=6 pass=6 fail=0`。
- 阶段 C 执行反馈（E-C2r-2）：
  - 尝试让 selfhost `BinaryExpression` 直接走 `compileBinaryExpression`，fresh gen1 在 `min-binary` 编译阶段回退为 `compile=139`（崩溃前停在 `DEBUG expression binary compiler typeof function`），说明该通用路径当前无法在 Gen1 进程内稳定执行。
  - 尝试把 Binary 保守返回从 raw `0` 改为 `_js_undefined` 并联动调整 console 打印路径，未带来 `min-*` 运行态净改善，且引入额外噪声；已回退到稳定基线实现。
- 当前最小探针状态（fresh gen1）：
  - `min-binary`: `compile=0, run=138`
  - `min-logical`: `compile=0, run=139`
  - `min-inc`: `compile=0, run=139`
  - `min-rel`: `compile=0, run=138`
- 链路门禁仍未通过：`--chain --strict` 继续在 `gen1 -> gen2` `SIGSEGV`，输出仍停在 `runtime/node/fs.js` / `compiler/index.js` 邻域。
- 下一优先级（Stage C-7）：
  1. 在 `compileExpression` 内实现 ultra-minimal selfhost Binary 子集发射器（仅 `Identifier <op> Literal`），避免执行 `compileBinaryExpression` 大路径；
  2. 用 `min-rel/min-logical/min-binary` 先验收“运行不崩”（`run=0`），再二阶段收敛 stdout 语义；
  3. 并行推进 `UpdateExpression` 自举槽写回稳定性；
  4. 三项完成后回放 `--chain --strict` 观察失败点是否后移。

## 12. 2026-04-23 Stage C-7 更新

- 稳基线门禁继续通过：
  - `formal:check` 维持 `PASS=116 FAIL=0`
  - `selfhost --strict` 维持 `total=6 pass=6 fail=0`
- 阶段 C 净前进（E-C2r-3）：
  - 在 `runtime/core/print.js` 的 `_print_console_value*` 增加 `undefined/null` fast-path 与 boxed 指针堆范围校验，减少 selfhost console 打印崩溃面。
- 最小探针状态（fresh gen1）：
  - `console-undef-id` / `let-assign-console` / `min-binary` 已从运行崩溃推进到 `run=0`（当前 stdout 为保守值 `undefined`）
  - `min-inc` 仍 `run=139`（唯一剩余表达式探针阻塞）
  - `min-logical` / `min-rel` / `nolog` 探针继续 `run=0`
- 链路门禁仍未通过：
  - `--chain --strict` 继续 `gen1 -> gen2` `SIGSEGV`，失败输出仍停在 `runtime/node/fs.js` / `compiler/index.js` 邻域。
- 当前优先级调整：
  1. Stage C-8 先专攻 `UpdateExpression(i++)` 写回形态（以 `min-inc run=0` 为硬门槛）；
  2. 通过后立即回放 `--chain --strict` 评估失败点后移。

## 13. 2026-04-23 Stage C-8 更新

- 稳基线继续通过：
  - `formal:check` 维持 `PASS=116 FAIL=0 XFAIL=0 XPASS=0`
  - `selfhost --strict` 维持 `total=6 pass=6 fail=0 strict=true`
- 本轮结构化前进（执行 + 验收）：
  1. `E-C4a`（switch 解析稳定性）
     - `lang/parser/statements.js`：
       - `parseStatement` 改为 `String(type)` 分发；
       - `parseSwitchStatement` 改为 token type/literal 双通道解析 + 冒号恢复扫描。
     - 验收：fresh `gen1` 最小 `switch` 探针从 `EXIT=139` 提升到 `EXIT=0`。
  2. `E-C4b`（自举崩溃簇后移）
     - `runtime/types/number/types.js`：
       - `getTypeBitWidth` 的 `switch` 改为 if 链；
       - `int64/uint64` 元信息改为 selfhost-safe 常量，避免 `BigInt(...)` 初始化调用。
     - `compiler/functions/functions.js`：
       - `compileCallExpression` 用户函数 fastpath 改为仅在明确 Node host 启用，避免 selfhost 触发不稳定 map 访问。
     - `runtime/core/allocator.js`：
       - `getSizeClass` 的 `for` 改为无循环分支；
       - `totalSize` 内联 `alignUp`，去掉 helper call。
- 阶段验收结果（fresh `gen1-from-cli`）：
  - 已打通：`runtime/core/jsvalue.js`、`runtime/types/number/types.js`、`runtime/types/string/index.js`（均 `139 -> 0`）
  - 未打通：`runtime/node/_string.js` 仍 `139`
- 链路门禁状态：
  - `node --no-warnings scripts/run-selfhost-smoke.mjs --chain --strict` 仍失败（`gen1 -> gen2` `SIGSEGV`）；
  - 失败前递归编译已稳定跨过 `runtime/types/string/index.js`，主阻塞进一步收敛到 `runtime/node/_string.js` 邻域。
- 下一优先级（Stage C-9）：
  1. 对 `runtime/node/_string.js` 做函数级切片定位，命中首个 `139` 构造；
  2. 对命中构造做 selfhost-only 降级（优先去 `for/update` 路径）；
  3. 以 `gen1-from-cli compile runtime/node/_string.js = 0` 作为下一硬门槛；
  4. 达标后回放 `--chain --strict`。

## 14. 2026-04-23 Stage C-9（持续中）

- 稳基线：
  - `formal:check` 继续全绿（`PASS=116 FAIL=0`）
  - `selfhost --strict` 继续全绿（`pass=6 fail=0`）
- 本轮新增执行：
  1. `compiler/functions/functions.js`
     - 标识符调用 user-fastpath 暂时关闭（保守稳定优先）；
     - selfhost member-call 的字符串路径增加 `methodName` 归一化与 `slice/substring` 分离分支。
  2. `compiler/functions/builtin_string.js`
     - selfhost 判定改为 host Node 环境识别。
  3. `runtime/node/_string.js`
     - `byteToChar/cstringToJS/JStoCstring` 收敛为与 `fs.js` 一致的保守实现。
- 验收结果：
  - `runtime/types/string/index.js` 继续 `compile=0`（保持前移成果）
  - `runtime/node/_string.js` 仍 `compile=139`（当前第一阻塞）
  - `--chain --strict` 仍 `gen1 -> gen2 SIGSEGV`，尾部仍在 `runtime/core/allocator.js` 邻域。
- 当前判断：
  - 阶段门禁未回退；
  - 主阻塞进一步聚焦到 `_string.js` 相关调用链（`syscallWrite`/`JStoCstring` 邻域）。
- 下一步（Stage C-9 后续）：
  1. 对 `_string.js` 做函数级最小切片，定位首个不可替换调用点；
  2. 以 `gen1-from-cli compile runtime/node/_string.js = 0` 为硬门槛；
  3. 达标后立即回放 `--chain --strict`。

### Stage C-9 Addendum（回归处置）

- C-9 试验期出现 `json-global` 回归（selfhost required case 失效），已完成修复并恢复门禁：
  - `selfhost` required case: pass
  - `selfhost --strict`: pass (6/6)
  - `formal:check`: pass (116/116)
- `--chain --strict` 仍未通过，后续继续以 `_string.js` 编译链为优先阻塞处理对象。

## 15. 2026-04-23 Stage C-10 更新

- 稳基线门禁继续通过：
  - `formal:check`：`PASS=116 FAIL=0 XFAIL=0 XPASS=0`
  - `selfhost --strict`：`total=6 pass=6 fail=0`
- 本轮执行与前进：
  1. `compiler/index.js` 与 `compiler/functions/functions.js` 去 `for...of/Object.values/Object.entries` 热路径（改为索引循环），降低 selfhost 迭代器不稳定面。
  2. `compiler/expressions/expressions.js` 为 `SelfhostBinaryExpression` 增加 selfhost-fast fallback，绕开 synthetic binary 调度崩溃链。
- fresh gen1 最小探针状态：
  - 已前进：
    - `const a = 1 + 1; console.log(a);`：`compile=0`
    - `function f(a){ return 1; } console.log("ok");`：`compile=0`
  - 仍阻塞：
    - `const y = f(1);`：`compile=139`
    - `switch` 最小样例：`compile=139`
    - object literal 计算属性 key 最小样例：`compile=139`
- 链路门禁：
  - `--chain --strict` 仍 `gen1 -> gen2 SIGSEGV`，当前日志尾部停在 `runtime/types/array/index.js` 邻域。
- Stage C-11 派发建议：
  1. 先攻 `Identifier CallExpression` 最小链路（`f(1)`），目标 `compile=0`；
  2. 再攻 `switch` 最小链路，目标先 `compile=0` 后收口语义；
3. 再攻 object literal 计算属性 key；
4. 三项达标后回放 `--chain --strict` 观察失败点后移。

## 16. 2026-04-23 Stage A 回归止血（自动化本轮）

- 执行任务 `E-A-REC-1`（for-of 回归）：
  - 恢复 `obj[Symbol.iterator] = fn` 的 computed 赋值专用路径；
  - 保留其余 computed member assignment 的保守降级，避免放大 selfhost 不稳定面。
- 执行任务 `E-A-REC-2`（Promise 退出崩溃）：
  - 在 `runtime/async/promise.js` 的 `emitInvokeCallback1` 增加回调调用前后 `S0-S3` 保存/恢复，修复多语句 then 回调后 `SIGSEGV`。
- 执行任务 `E-A-REC-3`（噪声清理）：
  - 移除 `compiler/index.js` 构造器阶段 `DBG_CTOR_*` 调试输出。

- 验收任务 `V-A-REC-1`：
  - `node --no-warnings scripts/run-fixtures.mjs` => `PASS=116 FAIL=0 XFAIL=0 XPASS=0`（通过）。
- 验收任务 `V-A-REC-2`：
  - `node --no-warnings scripts/run-selfhost-smoke.mjs`（required）仍失败：`gen1/json-global` 运行期 `SIGSEGV`（未通过）。
  - `node --no-warnings scripts/run-selfhost-smoke.mjs --strict` 仍失败：`total=6 pass=0 fail=6`（未通过）。
- 验收任务 `V-C1`：
  - `node --no-warnings scripts/run-selfhost-smoke.mjs --chain --strict` 仍在 `gen1 -> gen2` `SIGSEGV`，尾部停在 `compiler/functions/statements.js` 邻域（未通过）。

- 本轮关键反馈（根因收敛）：
  - 当前 `gen1` 产物已退化为“可编译但运行即崩”：`gen1` 编译空脚本产物也 `EXIT=139`。
  - 该现象说明阻塞点已前移到“gen1 代码生成/运行时初始化稳定性”，优先级高于继续推进链路深处模块。

- 下一轮派发（执行 + 验收）：
 1. `E-A-REC-4`：对 `gen1` 编译空脚本产物加最小启动探针（入口/堆初始化/调度器初始化）定位首个崩溃阶段。
 2. `V-A-REC-4`：`gen1 compile empty.js` 产物 `exit=0`（硬门槛）。
 3. `E-A-REC-5`：在不回退 fixtures 的前提下修复首个崩溃阶段，再回放 required smoke。
 4. `V-A2`：required smoke 恢复后，再重跑 `--strict` 与 `--chain --strict`。

## 17. 2026-04-24 Stage A 连续推进（自动化本轮）

- 执行任务 `E-A11-1`（门禁回放）：
  - `node --no-warnings scripts/run-fixtures.mjs` => `PASS=117 FAIL=0 XFAIL=0 XPASS=0`（通过）。
  - `node --no-warnings scripts/run-selfhost-smoke.mjs`（required）=> `PASS`（通过）。
  - `node --no-warnings scripts/run-selfhost-smoke.mjs --strict` => `total=6 pass=1 fail=5`（未通过）。
  - `node --no-warnings scripts/run-selfhost-smoke.mjs --chain --strict` => `gen1 -> gen2 SIGSEGV`（尾部仍在 `binary/static_linker.js` 邻域，未通过）。

- 执行任务 `E-A11-2`（尝试方法 A：字符串 intern 归一化）：
  - 修改 `asm/arm64.js` 与 `asm/x64.js` 的 `addString/registerRuntimeString` 输入归一化，目标修复 selfhost 下字符串对象化导致的数据段丢字。
  - 验收任务 `V-A11-2`：
    - 无回归：fixtures 与 required smoke 继续通过。
    - 未达标：strict 5 个 case 行为无变化（方法失败）。

- 执行任务 `E-A11-3`（尝试方法 B：selfhost console 静态降级）：
  - 在 `compiler/functions/functions.js` 增加 console 参数静态字符串解析分支，试图绕开不稳定运行时打印链。
  - 验收任务 `V-A11-3`：
    - 失败：gen1 编译 probe 直接 `SIGSEGV`（compile stage）。
    - 处置：已回退该方案，恢复到“可编译 + strict 语义失败”的稳定基线。

- 执行任务 `E-A11-4`（新增诊断能力）：
  - 新增脚本 `scripts/run-selfhost-literal-diagnostics.mjs`，自动化采集：
    - gen1 编译/运行结果；
    - stdout 十六进制；
    - 产物二进制是否包含期望字符串（`strings -a`）。
  - 验收任务 `V-A11-4`：
    - 脚本可运行，输出稳定复现以下关键事实：
      - `console.log(0/1)` 输出仅换行（`stdoutHex=0a`）；
      - `console.log(null/true)` 输出 `undefined`；
      - 所有 `method-ok` case 的产物二进制均不含 `method-ok` 字符串（`binaryHasExpectedString=false`）。

- 本轮根因收敛（新的优先阻塞）：
  - 阻塞已从“仅 object-method helper 漂移”收敛为“gen1 下字面量/console 相关值表示与数据段落地异常”：
    1. 字面量值与期望输出不一致（number/null/boolean/string 均异常）；
    2. 目标字符串未写入产物数据段（`method-ok` 缺失）；
    3. 该问题直接解释 strict 5 case 的系统性失败。

- 下一轮派发（执行 + 验收）：
  1. `E-A12-1`：围绕 `compileLiteral -> asm.addString -> finalize data` 加 host-only 诊断点，比较 host 编译器与 gen1 编译器的字符串入表计数与样本。
  2. `V-A12-1`：`run-selfhost-literal-diagnostics.mjs` 中 `console-string/member-read` 的 `binaryHasExpectedString` 从 `false` 提升到 `true`。
  3. `E-A12-2`：修复 `null/boolean/number` 在 gen1 下的 console 路径值退化（优先 number 与 null）。
  4. `V-A12-2`：`console-number-0/1` 与 `console-null/true` 输出与期望一致。
  5. `E-A12-3`：在前两项通过后回放 `selfhost --strict`，再决定是否重启 `--chain --strict` 主链推进。
