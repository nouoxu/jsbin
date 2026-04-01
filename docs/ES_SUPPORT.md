# JSBin ES 标准支持审计

> 审计时间: 2026-04-01
> 审计范围: `lang/`、`compiler/`、`runtime/`
> 结论先行: JSBin 目前支持的是“较大的 ES 子集”，不是完整的 ECMAScript 实现。

## 1. 总结结论

从源码和最小复现看，JSBin 已经覆盖了不少现代 JavaScript 语法和运行时对象：

- 词法/语法层已经支持 `let/const`、解构、箭头函数、`async/await`、生成器、类、私有字段、可选链、模板字符串、ESM 语法等。
- 编译器和运行时已经实现了 Array、String、Map、Set、Date、RegExp、Promise、TypedArray、ArrayBuffer 等一批核心对象。
- 但离“完整 ES 标准支持”还有明显距离，尤其是：
  - 模块语义还不完整，距离标准 ESM 仍有结构性差距；
  - 若干全局对象和内建能力根本没有真正落地；
  - 一部分能力只有“能解析/能编译”，但运行时语义并不正确；
  - 一些较新的语法还没有 parser/compiler 路径。

因此，这个项目当前更适合被描述为：

> “支持较大 ES 子集的原生编译器”，而不是“完整 ECMAScript 标准实现”。

## 2. 审计方法

本次判断基于两类证据：

1. 源码静态审计
   - `lang/lexer/token.js`
   - `lang/parser/*.js`
   - `compiler/index.js`
   - `compiler/functions/*.js`
   - `compiler/expressions/*.js`
   - `runtime/types/*`
   - `runtime/async/*`

2. 少量最小复现
   - `class A { static { ... } }` 编译失败；
   - `console.log(typeof JSON)` 编译通过，但运行输出 `number`；
   - `console.log(typeof Symbol)` 编译通过，但运行输出 `number`。

这里的重点不是“某几个 demo 能不能跑”，而是项目整体是否已经具备完整 ES 语义闭环。

## 3. 当前已经具备的能力

### 3.1 语法层覆盖面

从 `lang/lexer/token.js` 和 `lang/parser/` 看，当前已经明确接入了这些能力：

- 变量声明与模式:
  - `var` / `let` / `const`
  - 对象/数组解构
  - 默认值
  - rest/spread
- 函数:
  - 函数声明 / 函数表达式
  - 箭头函数
  - 默认参数
  - rest 参数
  - `async function`
  - 生成器 `function*`
  - `yield` / `yield*`
- 表达式:
  - 可选链 `?.`
  - 空值合并 `??`
  - 逻辑赋值 `&&=` / `||=` / `??=`
  - 模板字符串
  - 正则字面量
  - `import.meta`
  - 动态 `import(...)` 的 parser 入口
- 类:
  - `class`
  - `extends`
  - getter/setter
  - 类字段
  - 私有字段/私有方法
  - 计算属性名
- 模块:
  - `import`
  - `export`
  - `export default`
  - `export *`
  - `export { ... } from ...`

### 3.2 运行时对象与编译器内建

从 `runtime/index.js`、`runtime/types/`、`compiler/functions/*.js` 看，当前已经有比较明确的运行时实现或编译期分派：

- `Array`
- `String`
- `Object`
- `Map`
- `Set`
- `Date`
- `RegExp`
- `Promise`
- `ArrayBuffer`
- 多种 `TypedArray`
- `Math`
- `typeof`
- `async/await` 所需的 coroutine / Promise runtime

这说明项目并不是“只能跑 ES5”，而是已经深入到一部分 ES2015+ 能力。

## 4. 为什么说“还不是完整 ES 支持”

## 4.1 P0: 标准模块语义还不完整

这是当前离完整 ES 支持最远的一块。

`compiler/index.js` 中的模块系统已经能覆盖一部分 `import/export` 语法，但还没有达到标准 ESM 语义，主要问题包括：

- 入口文件还不是真正的一等模块；
- 循环依赖时根模块会被再次当作依赖编译；
- 没有完整的 live binding 语义；
- `_module_registry` 只是简单槽位数组，没有 `INITIALIZING/INITIALIZED` 状态机；
- `export { ... } from ...`、`export * as ns from ...`、默认导出/重导出仍有缺口；
- 模块之间的作用域与符号隔离还不完整。

这部分已经在 [docs/CYCLIC_BOOTSTRAP_ANALYSIS.md](./CYCLIC_BOOTSTRAP_ANALYSIS.md) 里详细展开。结论很直接：

> 当前是“部分可用的模块编译路径”，不是完整的标准 ESM 实现。

## 4.2 P0: 动态 import 只有 parser/compiler 入口，没有完整运行时

`lang/parser/expressions.js` 会把 `import("x")` 解析成 `CallExpression`，而 `compiler/functions/functions.js` 会把它编译成对 `_js_import` 的调用。

但在项目中搜索 `_js_import`，只有编译侧调用，没有对应的运行时实现。

这意味着：

- `import("x")` 语法并不等于“动态 import 已经可用”；
- 当前更接近“预留了编译入口”，而不是完成了运行时语义。

## 4.3 P0: 一些标准全局对象实际上没有实现

这次审计里最明显的两个例子是 `JSON` 和 `Symbol`。

虽然 `lang/analysis/closure.js` 把 `JSON` 视为 builtin/global 名字之一，但编译器里没有对应的全局对象实现路径。最小复现：

```js
console.log(typeof JSON);
console.log(typeof Symbol);
```

两者都能编译，但运行输出是：

```text
number
number
```

这说明当前行为不是“正确支持”，而是未解析标识符退化到了错误值。

也就是说，至少这些 ES 关键全局对象还没有真正落地：

- `JSON`
- `Symbol`

类似地，项目里也没有看到这些对象的完整实现：

- `Proxy`
- `Reflect`
- `Intl`
- `WeakMap`
- `WeakSet`
- `DataView`
- `SharedArrayBuffer`
- `Atomics`

`runtime/node/util.js` 里甚至直接把不少 `util.types.*` 检测写成恒定 `false`，也从侧面说明这些对象并没有形成完整运行时。

更麻烦的是，Node shim 自己也已经开始依赖这些能力：

- `runtime/node/fs.js`、`runtime/node/buffer.js` 使用了 `[Symbol.iterator]`
- `runtime/node/console.js`、`runtime/node/util.js` 使用了 `JSON.stringify`

这意味着这些缺口不只是“用户代码少了某个全局对象”，还会反过来影响兼容层本身的稳定性。

## 4.4 P1: Promise 静态方法有接口，但语义还是简化版

`compiler/functions/functions.js` 已经支持：

- `Promise.resolve`
- `Promise.reject`
- `Promise.all`
- `Promise.race`
- `Promise.allSettled`

但 `runtime/async/promise.js` 里的实现仍然是明显的占位/简化语义：

- `_Promise_all` 直接返回空数组；
- `_Promise_race` 直接返回 `undefined`；
- `_Promise_allSettled` 直接返回空数组。

所以这里不能算“完整 ES Promise 兼容”，更准确的表述应该是：

> Promise 体系已经搭了框架，但静态组合方法还不是标准语义。

## 4.5 P1: 某些语法还没有 parser/compiler 支持

从 parser 代码和最小复现看，至少这些语法仍未完整接入：

- class static block
- decorators
- `for await (... of ...)`
- import attributes / assertions
- `with`

其中 `class static block` 可以直接复现：

```js
class A {
  static {
    this.x = 1;
  }
}
```

编译报错：

```text
expected (, got THIS
expected (, got .
expected (, got IDENT
no prefix parse function for } (}) at line 5:1
```

这说明类静态初始化块还没有进入 parser/class compiler 主路径。

## 4.6 P1: 一些“支持”更接近语法支持，而不是完整语义支持

几个比较典型的例子：

- `BigInt`
  - 词法层支持 `BIGINT`
  - 运行时里也有一些 `BigInt`/`BigInt64Array` 相关路径
  - 但全局 `BigInt` 构造、运算一致性、与普通数值互操作还没有证据表明已完整打通
- `import/export`
  - 语法基本能过
  - 但模块执行顺序、循环依赖、live binding 还不符合标准 ESM
- `async/await`
  - 基础 coroutine/Promise 已有
  - 但周边静态方法与模块级异步语义仍不完整

所以看这个项目时，最好区分三层：

1. 能不能被 lexer/parser 接受；
2. 能不能被 compiler 发射代码；
3. 运行时语义是不是接近 ECMAScript 标准。

当前项目在第 1 层和第 2 层已经走得不短，但第 3 层还有明显缺口。

## 5. 当前可以认为“相对成熟”的部分

如果只从项目现状出发，下面这些能力可以认为已经进入“可继续打磨”的阶段，而不是完全空白：

- 常规控制流与表达式
- 基础函数/闭包
- Array/String/Object 常见操作
- Map/Set/Date/RegExp 的基础运行时
- async/await 的基础执行模型
- TypedArray / ArrayBuffer 的基础对象模型
- 一部分现代 class 语法

换句话说，项目最需要补的不是“从零开始加 ES2015”，而是：

- 修标准语义；
- 补全关键全局对象；
- 把占位实现替换成真实实现；
- 为已支持语法补齐运行时闭环。

## 6. 对“ES 标准完整支持”的最终判断

结论是：**否，当前项目还没有完整支持 ES 标准。**

更准确地说：

- 语法覆盖: 已经超过传统玩具编译器，属于“较大的 ES 子集”；
- 运行时对象: 已有不少核心对象，但仍不完整；
- 模块语义: 仍然是当前最大的标准兼容缺口；
- 新语法边角: 还有多项未接入；
- 错误处理: 某些未实现路径不会明确报错，而是退化成错误值，这比“直接不支持”更危险。

## 7. 建议修复顺序

建议按下面顺序推进：

1. 先补模块系统语义
   - 入口模块一等化
   - 循环依赖
   - live binding
   - module record 状态机
2. 再补关键全局对象
   - `JSON`
   - `Symbol`
   - `WeakMap` / `WeakSet`
   - `Reflect` / `Proxy`
3. 再清理“占位实现”
   - `Promise.all`
   - `Promise.race`
   - `Promise.allSettled`
   - 动态 import
4. 最后补 parser/compiler 新语法缺口
   - class static block
   - `for await`
   - decorators
   - import attributes

## 8. 一句话结论

JSBin 现在已经有“现代 JavaScript 编译器雏形”，但还没有达到“完整 ECMAScript 标准实现”；距离完整支持，最大的差距在模块语义、关键全局对象和若干仍是占位的运行时能力。
