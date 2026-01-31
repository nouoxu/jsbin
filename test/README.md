# JSBin 测试套件

## 目录结构

```
test/
├── run.sh              # 测试运行脚本
├── basic/              # 基础功能测试
│   ├── array.js        # 数组基础
│   ├── string.js       # 字符串方法
│   ├── math.js         # Math 方法
│   ├── loop.js         # 循环语句
│   ├── condition.js    # 条件语句
│   └── object.js       # 对象操作
├── array/              # 数组高级功能
│   ├── methods.js      # map/filter/reduce
│   └── forof.js        # for-of 循环
├── class/              # 类相关
│   ├── basic.js        # 基础类
│   └── extends.js      # 继承 (已知问题)
├── async/              # 异步功能
│   └── basic.js        # async/await
├── regexp/             # 正则表达式
│   ├── basic.js        # 基础匹配
│   ├── quantifiers.js  # 量词 * + ?
│   ├── charclass.js    # 字符类 []
│   └── alternation.js  # 交替 |
├── closure/            # 闭包
│   └── basic.js        # 闭包计数器 (已知问题)
├── destructure/        # 解构赋值
│   ├── array.js        # 数组解构 (已知问题)
│   └── object.js       # 对象解构 (已知问题)
├── collection/         # 集合类型
│   ├── map.js          # Map (已知问题)
│   └── set.js          # Set (已知问题)
├── error/              # 错误处理
│   └── trycatch.js     # try/catch (已知问题)
├── generator/          # 生成器
│   └── basic.js        # Generator (已知问题)
└── json/               # JSON
    └── parse.js        # JSON.parse (已知问题)
```

## 使用方法

```bash
# 运行所有测试
./test/run.sh

# 运行单个测试文件
./test/run.sh test/basic/array.js

# 运行某个目录下的测试
./test/run.sh test/regexp/
```

## 测试状态

标记为 "已知问题" 的测试会被自动跳过。

| 分类 | 状态 |
|------|------|
| basic | ✅ 全部通过 |
| array | ✅ 全部通过 |
| class/basic | ✅ 通过 |
| class/extends | ⚠️ 跳过 (super 未实现) |
| async | ✅ 全部通过 |
| regexp | ✅ 全部通过 |
| closure | ⚠️ 跳过 (计数器不持久) |
| destructure | ⚠️ 跳过 (值未赋值) |
| collection | ⚠️ 跳过 (返回错误值) |
| error | ⚠️ 跳过 (Error 类未定义) |
| generator | ⚠️ 跳过 (运行时崩溃) |
| json | ⚠️ 跳过 (运行时崩溃) |
