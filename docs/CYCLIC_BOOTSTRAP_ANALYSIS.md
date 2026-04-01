# JSBin Module System Cyclic Bootstrap Analysis

## 目标

这里的“循环自举”指的是：

1. 入口文件本身也是一个完整模块，而不只是“主程序特例”。
2. 模块之间允许出现 `A -> B -> A` 这类循环依赖。
3. `runtime/node/*.js` 之间可以像普通模块一样互相导入，不依赖特殊的聚合 shim 才能工作。
4. `import/export` 在运行时具有稳定语义，至少要满足：
   - 导入绑定在模块执行前可用；
   - 循环依赖不会把根模块重复编译；
   - 模块作用域彼此隔离；
   - 不同模块的同名函数/变量不会互相覆盖。

这份文档只分析当前项目距离这个目标还差什么，不讨论外部生态兼容（如 npm 包解析）。

## 当前状态

### 2026-04-01 进展更新

这份文档最初写成时，下面这些点还是阻塞项；到当前代码状态，它们已经基本打通：

1. 入口文件已经进入 `_moduleOrder`，`a -> b -> a` 不会再把根模块重复编译成副本。
2. 所有模块都会在顶层执行前统一做 `import` 绑定初始化，不再只有主入口有这条路径。
3. 模块级导出变量已经进入 box/live binding 路径，导入方可以直接绑定到源 box。
4. 模块编译上下文和函数标签已经按模块隔离，不再共用一套顶层名字表。
5. `export { foo as bar } from "./m.js"` 与 `export * as ns from "./m.js"` 已经能正确收集并生成 namespace。
6. 导出变量写回时，除了更新本模块 namespace，也会把所有解析到同一 live binding 的中间 re-export 模块 namespace 一起刷新。
7. `_module_registry` 不再固定死成 32 槽，生成时会按实际模块图大小分配，长模块链不会再越界踩坏数据段。
8. 数值导出/导入链上的 raw float 与 heap Number 已经统一通过运行时 coercion 归一化，多跳 `const x = y + 1` 不再随机变成 `NaN`。
9. 被顶层函数捕获的模块级函数/类绑定，已经会在模块执行前预填到对应 box 中，不再因为 sentinel 留在 box 里而把 `JStoCstring`、`syscallWrite` 这类函数误报成 “before initialization”。

我本地补回并验证过的运行场景包括：

- `test_local_import.js` 输出 `42`
- `test_cons.js` 输出 `loaded`
- `test_import8.js` 输出 `object` / `[object Object]`
- `test_import9.js` 输出 `function` / `macos`
- `a -> b(re-export) -> main(import * as ns)` 从 `0` 正确变成 `1`
- `a -> b(re-export) -> c(re-export) -> main(import * as ns)` 从 `0` 正确变成 `1`
- `export *` 多跳转发场景从 `0` 正确变成 `1`
- 40 模块链式导入 `m0 -> m1 -> ... -> m39` 输出 `78`
- `/tmp/jsbin-cycle-check/a_nocall.js` 输出 `2` / `1`
- `/tmp/jsbin-cycle-tdz/a.js` 正确报 `ReferenceError: Cannot access 'a' before initialization`

所以从“循环自举主路径”这个目标看，最初文档里的 P0/P1 大部分已经不是现状问题了。

当前还没有彻底演进完成的，主要是更偏“完整模块运行时模型”的部分：

1. `_module_registry` 仍然是 namespace 指针表，不是真正带 `INITIALIZING/INITIALIZED` 状态的模块记录。
2. live binding 现在是通过 box 和 namespace 回写维持的，还不是完整 ESM module record / binding cell 语义。
3. 仓库里的回归样例仍然偏零散，缺少系统化自动测试入口。

当前分支已经有两点重要进展：

1. bare import 如果能映射到 `runtime/node/<name>.js`，现在会优先直达该文件，不再默认全部绕回 `runtime/node/index.js`。
2. `import default from "m"`、`export default ...`、部分本地模块导入/导出路径已经能编译通过。

我本地抽样确认过这些场景可以完成编译：

- `test_import8.js`
- `test_import9.js`
- `test_local_import.js`
- `test_cons.js`
- `test_str2.js`
- `test_c.js`

但这还不等于已经达到“循环自举”。当前实现里仍然存在一组结构性问题，其中有几项会直接阻断循环依赖或让它表现出“看起来能编译、运行时却是空绑定”的假成功。

## P0 阻塞项

### 1. 入口文件不是一等模块，循环依赖时会把根模块重复编译

相关位置：

- `compiler/index.js` 中 `compileProgram()`
- `compiler/index.js` 中 `resolveImports()`

当前行为是：

1. `compileProgram()` 调用 `resolveImports(ast)` 只收集“被导入模块”。
2. 入口 AST 本身不会进入 `_moduleOrder`。
3. `compiledFiles` 里也不会先登记入口文件。

这会导致一个直接问题：

- 如果入口 `a.js` 导入 `b.js`，而 `b.js` 又导入 `a.js`，那么 `a.js` 会被当成“普通依赖模块”再次解析并加入 `_moduleOrder`。

这不是 ESM 的循环依赖处理，而是“根模块重复编译”。

后果：

- 根模块可能被执行两次；
- 根模块的导出语义与普通模块不一致；
- 模块 ID 和执行顺序会变得不稳定；
- 所有后续的循环处理都建立在错误图结构上。

这是当前最关键的架构问题之一。

### 2. 导入模块本身没有统一执行“导入绑定初始化”

相关位置：

- `compiler/index.js` 中 `compileImportBindingInitialization()`
- `compiler/index.js` 中 `compileProgram()` 的模块第一遍编译

当前行为是：

1. 模块第一遍编译时，`ImportDeclaration` 被跳过；
2. `compileImportBindingInitialization()` 只在主入口 `ast.body` 上执行；
3. 被导入模块自己的 `import` 绑定不会在其顶层代码运行前完成初始化。

这意味着：

- 模块 A 中 `import { x } from "./b.js"` 得到的 `x`，对模块 A 自己的顶层代码和顶层函数来说，并没有一条稳定的初始化路径。

对循环依赖来说，这基本是致命的，因为循环依赖的核心就是“模块在尚未完全执行完毕时，也必须能以受控方式暴露绑定”。

### 3. 模块捕获变量的 boxing 流程曾经不完整，现在还剩变量类绑定的细化问题

相关位置：

- `compiler/index.js` 中 `compileProgram()`
- `lang/analysis/closure.js` 中 `analyzeTopLevelSharedVariables()`
- `compiler/functions/statements.js` 中 `compileVariableDeclaration()`

这个问题最初的症状是：

1. `compileProgram()` 会把各模块的 `moduleCaptured` 合并进 `topLevelCapturedVars`；
2. 这些名字会分配 `_main_captured_*` 标签并预分配 box；
3. 但 `this.ctx.boxedVars` 却只被设置成 `mainBoxedVars`，没有切换到包含模块捕获变量的集合。

当时的结果是：

- 某些模块级变量“看起来”有捕获标签；
- 但模块顶层变量声明并不会按 boxed variable 路径写入这些标签；
- 顶层函数里再去引用这些变量时，只能读到未初始化 box，或者直接退化成 `undefined/0`。

其中 `runtime/node/fs.js` 一度最明显：

- `JStoCstring` / `cstringToJS` 这种被顶层函数捕获的函数绑定，会因为 box 没初始化而出现假成功或运行时异常；
- `O_RDONLY`、`O_WRONLY`、`O_CREAT` 这类模块级常量在函数体里没有局部 offset，也不是函数名，最后会退回到错误路径。

当前状态下，这一类问题已经分成两半：

- 函数/类绑定已经在模块执行前预填进 box，`JStoCstring`、`syscallWrite` 这类路径不再误报。
- 变量类绑定则继续走 sentinel + TDZ guard，这部分现在是有意保留的行为，而不是旧的漏初始化。

### 4. 所有模块共用同一个顶层 `CompileContext.locals`

相关位置：

- `compiler/index.js` 中模块第一遍编译逻辑
- `compiler/core/context.js`

当前模块编译是把所有导入模块的顶层代码顺序拼进同一个 `_main` 帧中完成的，而且中间没有为每个模块重置 `ctx.locals`。

这会产生几个严重问题：

1. 模块 A 的局部变量会泄漏到模块 B 的编译上下文；
2. 主入口编译时也能“看到”前面模块留下的局部名；
3. 一个未解析成功的标识符，有机会错误地命中另一个模块留下的 offset；
4. 模块作用域根本不是独立的。

这和 ESM/模块系统的基本模型完全不兼容，也是循环自举必须先解决的前置条件。

### 5. 函数注册表和函数标签是全局共享的，模块间会发生命名冲突

相关位置：

- `compiler/core/context.js` 中 `functions`
- `compiler/index.js` 中 `collectFunctions()`
- `compiler/index.js` 中 `compileFunction()`

当前行为是：

1. 所有模块的函数声明都注册进同一个 `ctx.functions`；
2. 函数标签统一使用 `_user_${name}`；
3. 没有模块前缀，也没有文件作用域隔离。

后果：

- 两个模块只要有同名函数，后注册的就会覆盖前注册的；
- 编译输出里只会存在一个 `_user_same` 之类的符号；
- 模块 namespace 虽然是分开的，但背后绑定到的函数实现已经串了。

这会让“模块图可循环”失去意义，因为模块边界在符号层已经塌掉了。

## P1 功能缺口

### 6. `export { foo as bar } from "./m.js"` 这类 re-export 路径不完整

相关位置：

- `lang/parser/modules.js`
- `compiler/index.js` 中 `collectModuleExports()`
- `compiler/index.js` 中模块 namespace 生成逻辑

当前实现中，`export { foo as bar } from "./m.js"` 会被识别成带 `source` 的导出，但 `collectModuleExports()` 对这类 specifier re-export 只记录了：

- `name`
- `kind: "reexport"`
- `localName`
- `importedName`

它没有像 `export * from "./m.js"` 那样记录 `sourceModuleIndex`。

而在 namespace 生成阶段：

- 只有 `exp.kind === "reexport" && exp.sourceModuleIndex !== undefined` 才会真的去 `_module_registry` 取值；
- 普通 `reexport` 分支主要依赖 `importSpecMap`，这更像是在处理“先 import，再 export”的场景；
- 对 `export ... from ...` 这种直连转发，路径是不完整的。

结论：

- 这类 re-export 目前没有形成可靠的模块转发表达能力。

### 7. `export * as ns from "./m.js"` 的 AST 表达能力不够

相关位置：

- `lang/parser/modules.js`
- `lang/parser/ast.js`

当前 parser 在 `export * as ns from "./m.js"` 时，会构造：

- `new AST.ExportSpecifier(null, exported, true)`

但 `ExportSpecifier` 构造函数只接受两个参数：

- `local`
- `exported`

第三个“namespace”语义没有被 AST 保存下来。

这意味着：

- parser 虽然尝试支持 `export * as ns`；
- 但 AST 层无法区分它和普通的 `export { ... }` 变体；
- compiler 后面也就拿不到“这是 namespace re-export”的关键信息。

因此文档里写“支持 `export * as ns`”目前是过于乐观的。

### 8. 入口文件上的 `export` 语句在可执行程序模式下基本被忽略

相关位置：

- `compiler/index.js` 中 `compileProgram()`

当前主入口顶层在最后一段处理中：

- `ExportDeclaration` 会直接 `continue`
- `ImportDeclaration` 才会调用 `compileImportBindingInitialization()`

这意味着：

- 入口文件如果写 `export { foo } from "./m.js"`、`export default ...` 等导出，在 executable 模式下并不会像普通模块那样形成 namespace；
- 入口文件只有在“错误地被循环依赖重新编译成模块”时，才会以模块身份出现。

这和“入口文件是一等模块”的目标相冲突。

### 9. `_module_registry` 只是固定长度指针数组，没有模块状态机

相关位置：

- `runtime/core/allocator.js`
- `runtime/core/process.js`

当前实现是：

- `_module_registry` 固定 32 个槽位；
- 每个槽位只是一个模块 namespace object 指针；
- 没有 `uninitialized / initializing / initialized / error` 状态；
- 没有 binding cell；
- 没有 live binding 更新机制；
- `_get_module_export()` 只是去 object 上做一次属性读取。

这对循环自举来说不够，因为循环依赖至少需要：

1. 区分“模块还没开始初始化”与“模块正在初始化”；
2. 能在部分初始化状态下返回绑定 cell，而不是只看最终快照对象；
3. 能表达重新赋值后的 live binding。

目前的 `_module_registry` 更像“模块最终快照表”，不是“模块运行时记录表”。

### 10. namespace object 是在模块顶层代码执行完后统一构建的

相关位置：

- `compiler/index.js` 中模块第一遍/第二遍编译逻辑

当前流程是：

1. 第一遍：先把所有模块顶层代码都编进 `_main`
2. 第二遍：再构建每个模块的 namespace object 并写入 `_module_registry`
3. 最后：主入口再做自己的 import 绑定初始化

这带来的语义是：

- import 看到的是模块执行完后的“快照结果”；
- 模块之间不存在初始化中的可观测状态；
- 更不可能出现符合 ESM 语义的 live binding。

如果目标只是“静态单向依赖”，这个简化还能勉强工作；如果目标是循环自举，它不够。

## P2 工程缺口

### 11. `compileImportDeclaration()` 在语句编译器里被引用，但实际上没有实现

相关位置：

- `compiler/functions/statements.js`

`compileStatement()` 里有：

```js
case "ImportDeclaration":
    this.compileImportDeclaration(stmt);
    break;
```

但当前代码里没有对应实现。

这说明当前模块系统其实是“绕过 StatementCompiler，靠 `compileProgram()` 特判来跑”的。

这会造成两个后果：

1. import 逻辑分散在多个位置，后续修复容易漏；
2. 一旦 import 出现在新的编译路径里，这个分支会直接变成死雷。

### 12. 现有测试集没有覆盖真正的循环模块语义

当前仓库里有大量 import/export 测试，但主要集中在：

- named import
- namespace import
- default import
- runtime/node builtin import

缺少下面这些真正决定“循环自举是否可用”的场景：

1. 根模块参与循环：`a -> b -> a`
2. 两边都在顶层读取对方导出
3. 模块函数读取模块级常量/导入绑定
4. `export { foo as bar } from "./m.js"`
5. `export * as ns from "./m.js"`
6. 两个模块定义同名函数
7. 模块数超过 32
8. `let` / `const` 导出的 live binding 更新

没有这些测试时，模块系统很容易停留在“单向 happy path 可编译”的阶段。

## 为什么当前实现还没有到“循环自举”

用一句话概括：

当前模块系统更像“把若干文件按依赖顺序拼到一个 `_main` 里执行，然后事后补建 namespace 对象”，而不是“每个模块有独立记录、独立作用域、独立初始化状态的运行时模块系统”。

循环自举需要的是后者。

## 建议修复顺序

### Phase 1: 先把模块图做对

1. 入口文件也要分配 module id，并先登记到 `compiledFiles`
2. `resolveImports()` 需要返回完整模块图，而不是“除入口外的依赖列表”
3. 根模块不能在循环里被再次 parse/compile 成副本

### Phase 2: 引入真正的模块记录

建议把 `_module_registry` 从“指针数组”升级为“模块记录数组”，每条记录至少包含：

- `state`
- `namespace`
- `init_fn`
- `binding_cells`

最少需要的状态：

- `UNINITIALIZED`
- `INITIALIZING`
- `INITIALIZED`
- `ERRORED`

### Phase 3: 把 import/export 变成 binding，而不是快照复制

1. export 侧为每个导出创建 cell
2. import 侧绑定到 cell，而不是在初始化时复制一份值
3. `_get_module_export()` 返回 cell/value 的受控视图
4. re-export 直接转发源模块 cell

这一步做完，循环依赖和 live binding 才有基础。

### Phase 4: 模块级编译上下文隔离

1. 每个模块单独维护 locals / varTypes / varInitExprs
2. 顶层函数符号要带模块前缀或模块 ID
3. 不再使用全局 `_user_${name}` 这种无命名空间标签

推荐形态：

- `_mod3_user_same`
- `_mod7_local_foo`

### Phase 5: 修 parser/AST 形状漂移

至少要补齐：

1. `ExportSpecifier` 的 namespace 信息
2. `export { foo as bar } from` 的直连 re-export 数据
3. import/export 在 AST 层的统一判别字段，减少 compiler 中的“旧类型名 + 新 flag”混用

### Phase 6: 补回测试矩阵

建议新增最小回归样例：

1. `cycle_root_a.js <-> cycle_root_b.js`
2. `cycle_const_a.js <-> cycle_const_b.js`
3. `reexport_named_from.js`
4. `reexport_namespace_from.js`
5. `duplicate_function_names_across_modules.js`
6. `module_count_33.js`
7. `runtime_fs_import_binding.js`

## 一个可落地的架构方向

如果目标是先“能用”，再逐步逼近 ESM 语义，建议采用下面的折中路线：

1. 预扫描所有模块，生成稳定 module id
2. 先为每个模块生成一个 `init_module_<id>` 函数
3. 运行时通过 `ensure_module_initialized(id)` 递归初始化依赖
4. 初始化开始前先把该模块 state 设成 `INITIALIZING`
5. 导出使用 cell，初始化过程中就把 cell 地址暴露出去
6. 模块执行结束后再置为 `INITIALIZED`

这样即使一开始不完整实现 TDZ，也能先获得：

- 根模块不重复编译
- 模块作用域隔离
- 循环依赖可控
- re-export 有统一实现位置

## 结论

当前项目距离“基础 import/export 可编译”已经不远，但距离“循环自举可稳定工作”还差一整层模块运行时模型。

真正阻塞循环自举的不是某一个语法点，而是下面四件事还没有同时成立：

1. 入口模块是模块图中的一等成员
2. 模块有独立上下文与唯一命名空间
3. import/export 基于 binding/cell，而不是事后快照
4. 运行时有模块状态机，能表达 initializing 状态

只要这四点没有落地，项目就仍然停留在“模块语法支持中”，还没有进入“模块系统完成可自举”的阶段。
