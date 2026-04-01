# JSBin Node.js 兼容性与包管理审计

> 审计时间: 2026-04-01
> 审计范围: `runtime/node/`、`compiler/index.js`、`cli.js`
> 结论先行: 当前项目并不完整兼容 Node.js，也还不兼容 Node 包生态。

## 1. 总结结论

如果把“Node.js 兼容”拆成三层来看：

1. 能否提供部分 Node 风格全局对象和内建模块；
2. 能否正确模拟 Node 的模块解析与 CommonJS/ESM 行为；
3. 能否消费 `node_modules` 和 `package.json` 所代表的包生态；

那么 JSBin 当前的状态是：

- 第 1 层: 做到了一部分，有一批 `runtime/node/*.js` shim；
- 第 2 层: 还不完整；
- 第 3 层: 基本还没有实现。

因此，更准确的描述不是“Node.js 兼容运行时”，而是：

> “提供了一个 Node 风格 API 子集和若干内建模块 shim 的原生编译器运行时”。

## 2. 审计方法

本次判断结合了两类证据：

1. 源码静态审计
   - `compiler/index.js`
   - `runtime/node/*.js`
   - `runtime/core/process.js`
   - `cli.js`

2. 最小复现
   - `import x from "leftpad"` 编译通过，但运行输出 `0`；
   - `const fs = require("fs")` 编译通过，但 `typeof fs` 运行输出 `number`。

这些结果说明，当前很多“不兼容路径”不是明确失败，而是会静默退化成错误绑定。

## 3. 当前已经具备的 Node 风格能力

### 3.1 已经存在的 runtime/node shim

当前仓库里确实已经有这些 shim 模块：

- `_string`
- `buffer`
- `child_process`
- `console`
- `constants`
- `crypto`
- `dns`
- `events`
- `fs`
- `net`
- `os`
- `path`
- `process`
- `stream`
- `string_decoder`
- `timers`
- `tty`
- `url`
- `util`
- `vm`
- `zlib`

### 3.2 已经接入的全局注入

`runtime/node/index.js` 会尝试注入：

- `process`
- `console`
- `Buffer`

`runtime/core/process.js` 也提供了 `_process_init`、`_get_module_export` 等运行时支持。

这说明项目并不是完全不碰 Node 兼容层，而是已经有一套自建 shim 体系。

## 4. 为什么说“还不完整兼容 Node.js”

## 4.1 P0: 包解析基本不支持

`compiler/index.js` 的 `resolveModulePath()` 目前只支持两类路径：

1. 本地相对/绝对路径；
2. 能映射到 `runtime/node/<name>.js` 的 bare import。

对其他 bare import，它会直接返回空字符串：

- 不查找 `node_modules`
- 不读取依赖包自己的 `package.json`
- 不处理 `exports`
- 不处理 `main`
- 不处理 `module`
- 不处理 `type`
- 不处理 conditional exports
- 不处理 workspace / symlink / monorepo 解析

这意味着：

```js
import x from "leftpad";
```

在当前系统里并不会进入真正的包解析算法。

最小复现结果更说明问题：

- `import x from "leftpad"` 可以编译；
- 运行时打印的是 `0`；
- 也就是说当前不是“支持第三方包”，而是“第三方 bare import 会静默退化成错误值”。

因此，就“Node 包生态兼容”而言，当前结论应当是：

> 基本不支持。

## 4.2 P0: CommonJS 语义没有真正实现

项目里没有看到完整的 CommonJS 编译/执行模型：

- 没有 `module.exports` / `exports` 的编译路径；
- 没有标准 `require()` 加载器；
- 没有 CommonJS module cache；
- 没有 CommonJS 与 ESM 互操作桥接。

`runtime/node/index.js` 虽然挂了一个：

```js
require(moduleName) {
    if (this._cache[moduleName]) return this._cache[moduleName];
    return {};
}
```

但这只是 shim 对象上的一个占位方法，不是用户代码里的 CommonJS 运行时。

最小复现：

```js
const fs = require("fs");
console.log(typeof fs);
```

当前结果是：

```text
number
number
```

这说明 `require("fs")` 不是被正确解析成 Node 内建模块，而是走到了错误绑定路径。

结论很明确：

> 当前并不兼容 CommonJS。

## 4.3 P0: 现有 Node shim 体系本身还不稳定

Node 兼容层本身还存在几类系统性问题：

- 模块系统还没有完整循环依赖/ESM 语义；
- 一些 runtime/node 模块之间会相互导入；
- import/export 初始化路径仍有缺口；
- module registry 还不是完整 module record。
- 一些 shim 自己还依赖当前语言层未完整实现的能力，例如 `[Symbol.iterator]` 和 `JSON.stringify`。

这部分已经在 [docs/CYCLIC_BOOTSTRAP_ANALYSIS.md](./CYCLIC_BOOTSTRAP_ANALYSIS.md) 中详细分析过。

也就是说，即使只讨论“自带 shim 模块”，当前模块执行语义本身也还没有彻底站稳。

## 4.4 P1: 覆盖的核心模块数量有限，而且明显不是完整 Node core

仓库里当前只有 21 个 `runtime/node/*.js` shim。

即使不追求完全对齐某个 Node 版本，也能明确看出还缺很多常见核心模块，例如：

- `assert`
- `http`
- `https`
- `module`
- `tls`
- `dgram`
- `readline`
- `readline/promises`
- `worker_threads`
- `perf_hooks`
- `async_hooks`
- `inspector`
- `querystring`
- `repl`
- `cluster`
- `fs/promises`

这说明当前更像“精选子集”，不是“完整 Node 内建模块集合”。

## 4.5 P1: 已有模块里也有大量占位或硬编码实现

### `timers`

`runtime/node/timers.js` 里的实现只是把回调塞到 `globalThis.__setTimeoutCallback` / `__setImmediateCallback`，并返回 `-1`：

- `setTimeout()` 不是真定时器；
- `setInterval()` 直接返回 `-1`；
- `clearTimeout()` / `clearInterval()` / `clearImmediate()` 是空函数。

这离 Node 的事件循环和 timer 语义还有很远距离。

### `util`

`runtime/node/util.js` 里有大量类型检测直接写成恒定 `false`，例如：

- `isArrayBuffer`
- `isAsyncFunction`
- `isBigInt64Array`
- `isDataView`
- `isGeneratorFunction`
- `isMap`
- `isSet`
- `isTypedArray`
- `isWeakMap`
- `isWeakSet`

这意味着即使模块名存在，语义也只是近似/占位。

### `process`

`runtime/node/process.js` 里有大量硬编码或占位返回值，例如：

- `version` 写死为 `"v18.0.0"`
- `versions` 是硬编码对象
- `ppid` 恒为 `0`
- `memoryUsage()` 返回全零
- `cpuUsage()` 返回全零
- 事件相关 API 几乎都是占位

而 `runtime/node/index.js` 里 `versions.node` 又写成 `"20.0.0"`，两处版本号本身就不一致。

这说明当前的 `process` 更像“兼容形状”，不是完整 Node `process` 语义。

### `require`

`runtime/node/index.js` 的 `require()` 只是：

- 看 `_cache`
- 否则返回空对象

这连一个最小可用加载器都还算不上。

## 4.6 P1: 项目自身的 Node 打包元信息也还不完整

这次最小复现里，直接运行 `node cli.js ...` 会触发 Node 警告：

- 当前仓库根目录 `package.json` 没有声明 `"type": "module"`；
- Node 会把 `cli.js` 重新按 ESM 解析。

这不是“Node 兼容层”的核心阻塞，但说明项目自己作为 Node 工具链项目，包元信息也还没完全整理干净。

## 5. 包管理兼容性的结论

如果把“包含包管理”拆开来看，当前有两层都不成立。

### 5.1 依赖安装侧

项目本身没有实现这些能力：

- `npm` / `pnpm` / `yarn` 集成
- lockfile 解析
- workspace 解析
- 包下载/安装流程

当然，严格说“自己实现 npm”不是编译器的必选项，但如果用户期待的是“像 Node 一样拿来就能用包生态”，当前项目显然还没到那个阶段。

### 5.2 依赖消费侧

这才是更关键的部分，而当前同样还没有：

- `node_modules` 解析算法
- 包入口解析
- `package.json` 的 `main` / `exports` / `type`
- 子路径导出
- dual package / CJS-ESM 分流

所以即使外部已经 `npm install` 好依赖，JSBin 现在也不会像 Node 那样把它们正确接进来。

## 6. 可以如何描述当前的 Node 能力

比较准确的表述应该是：

- 支持一组自带的 Node 风格 shim 模块；
- 支持少量常见全局对象注入；
- 支持把部分 bare import 映射到 `runtime/node/*.js`；
- 但还不具备完整 Node 模块系统；
- 也还不具备第三方包生态兼容能力。

不建议把当前状态表述成：

- “完整兼容 Node.js”
- “支持 npm 包”
- “可直接运行 Node 生态项目”

## 7. 建议修复顺序

建议按下面顺序推进：

1. 先做真正的包解析
   - `node_modules` 向上查找
   - `package.json` 读取
   - `main` / `exports` / `type`
   - 子路径导出
2. 再做 CommonJS 运行时
   - `require`
   - `module.exports`
   - module cache
   - CJS/ESM 互操作
3. 再补 Node core module 覆盖面
   - 先优先 `assert`、`http/https`、`fs/promises`、`module`
4. 最后把现有 shim 从“占位版”升级成“语义版”
   - `timers`
   - `util.types`
   - `process`
   - 其他当前硬编码返回值模块

## 8. 一句话结论

JSBin 当前有一层“Node 风格运行时外观”，但还没有形成完整 Node.js 兼容；尤其在第三方包解析、CommonJS、`node_modules` 和 `package.json` 语义上，离真正可用的 Node 生态兼容还有明显距离。
