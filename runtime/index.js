// JSBin 运行时导出
// 统一导出所有运行时组件

// 核心组件
export { AllocatorGenerator } from "./core/allocator.js";
export * from "./core/allocator.js";
export { PrintGenerator } from "./core/print.js";
export { RUNTIME_STRINGS, StringConstantsGenerator } from "./core/strings.js";
export { CoercionGenerator } from "./core/coercion.js";
export { FunctionMethodsGenerator } from "./core/function.js";
export { CompilerFSGenerator } from "./core/compiler_fs.js";

// 类型运行时 - Number (包含所有数值子类型)
export { NumberGenerator } from "./types/number/index.js";
export * from "./types/number/types.js"; // 导出所有 Number 类型常量
// 类型运行时 - Math
export { MathGenerator } from "./types/math/index.js";
// 类型运行时 - JSON
export { JSONGenerator } from "./types/json/index.js";
// 类型运行时 - 其他类型
export { StringGenerator } from "./types/string/index.js";
export { ArrayGenerator } from "./types/array/index.js";
export { TypedArrayGenerator, ArrayBufferGenerator, DataViewGenerator } from "./types/typedarray/index.js";
export * from "./types/typedarray/index.js"; // 导出 TypedArray 类型常量
export { ObjectGenerator } from "./types/object/index.js";
export { MapGenerator } from "./types/map/index.js";
export { SetGenerator } from "./types/set/index.js";
export { DateGenerator } from "./types/date/index.js";
export { RegExpGenerator } from "./types/regexp/index.js";
// 类型运行时 - Symbol
export { SymbolGenerator, WellKnownSymbolsGenerator } from "./types/symbol/index.js";
// 类型运行时 - Iterator
export { IteratorGenerator, ArrayIteratorMethodsGenerator, MapSetIteratorMethodsGenerator } from "./types/iterator/index.js";
// 类型运行时 - Generator
export { GeneratorGenerator } from "./types/generator/index.js";
export { AsyncGeneratorGenerator } from "./types/generator/async.js";
// 类型运行时 - 私有字段
export { PrivateFieldGenerator, generatePrivateFieldStrings } from "./types/private/index.js";
// 类型运行时 - Error
export { ErrorGenerator } from "./types/error/index.js";

// FS/Path
export { FSGenerator } from "./types/fs/index.js";
export { PathGenerator } from "./types/path/index.js";

// Process
export { ProcessGenerator } from "./types/process/index.js";

// OS
export { OSGenerator } from "./types/os/index.js";

// Child Process
export { ChildProcessGenerator } from "./types/child_process/index.js";

// Net
export { NetGenerator } from "./types/net/index.js";

// Buffer
export { BufferGenerator } from "./types/buffer/index.js";

// 运算符
export { TypeofGenerator } from "./operators/typeof.js";
export { InstanceofGenerator } from "./operators/instanceof.js";
export { EqualityGenerator } from "./operators/equality.js";
export { AddGenerator } from "./operators/add.js";

// 下标访问
export { SubscriptGenerator } from "./core/subscript.js";

// 异步运行时
export { AsyncGenerator, CoroutineGenerator, PromiseGenerator } from "./async/index.js";

// 统一运行时生成器
import { NumberGenerator } from "./types/number/index.js";
import { MathGenerator } from "./types/math/index.js";
import { JSONGenerator } from "./types/json/index.js";
import { StringGenerator } from "./types/string/index.js";
import { ArrayGenerator } from "./types/array/index.js";
import { TypedArrayGenerator, ArrayBufferGenerator, DataViewGenerator } from "./types/typedarray/index.js";
import { ObjectGenerator } from "./types/object/index.js";
import { MapGenerator } from "./types/map/index.js";
import { SetGenerator } from "./types/set/index.js";
import { DateGenerator } from "./types/date/index.js";
import { RegExpGenerator } from "./types/regexp/index.js";
import { SymbolGenerator, WellKnownSymbolsGenerator } from "./types/symbol/index.js";
import { IteratorGenerator, ArrayIteratorMethodsGenerator, MapSetIteratorMethodsGenerator } from "./types/iterator/index.js";
import { GeneratorGenerator } from "./types/generator/index.js";
import { AsyncGeneratorGenerator } from "./types/generator/async.js";
import { PrivateFieldGenerator } from "./types/private/index.js";
import { ErrorGenerator } from "./types/error/index.js";
import { PrintGenerator } from "./core/print.js";
import { SubscriptGenerator } from "./core/subscript.js";
import { TypeofGenerator } from "./operators/typeof.js";
import { InstanceofGenerator } from "./operators/instanceof.js";
import { EqualityGenerator } from "./operators/equality.js";
import { AddGenerator } from "./operators/add.js";
import { AsyncGenerator } from "./async/index.js";
import { JSValueGenerator } from "./core/jsvalue.js";
import { CoercionGenerator } from "./core/coercion.js";
import { FSGenerator } from "./types/fs/index.js";
import { PathGenerator } from "./types/path/index.js";
import { ProcessGenerator } from "./types/process/index.js";
import { OSGenerator } from "./types/os/index.js";
import { ChildProcessGenerator } from "./types/child_process/index.js";
import { BufferGenerator } from "./types/buffer/index.js";
import { NetGenerator } from "./types/net/index.js";
import { FunctionMethodsGenerator } from "./core/function.js";

function isRuntimeDebug() {
    if (typeof globalThis !== "undefined" && globalThis.DEBUG_RUNTIME) {
        return true;
    }
    return typeof process !== "undefined" && process.env && process.env.DEBUG_RUNTIME;
}

export class RuntimeGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
        // 类型生成器
        this.numberGen = new NumberGenerator(vm, ctx);
        this.mathGen = new MathGenerator(vm, ctx);
        this.jsonGen = new JSONGenerator(vm, ctx);
        this.stringGen = new StringGenerator(vm);
        this.arrayGen = new ArrayGenerator(vm);
        this.typedArrayGen = new TypedArrayGenerator(vm, ctx);
        this.arrayBufferGen = new ArrayBufferGenerator(vm, ctx);
        this.dataViewGen = new DataViewGenerator(vm, ctx);
        this.objectGen = new ObjectGenerator(vm);
        this.mapGen = new MapGenerator(vm);
        this.setGen = new SetGenerator(vm);
        this.dateGen = new DateGenerator(vm);
        this.regexpGen = new RegExpGenerator(vm, ctx);
        this.symbolGen = new SymbolGenerator(vm, ctx);
        this.wellKnownSymbolsGen = new WellKnownSymbolsGenerator(vm, ctx);
        // 迭代器生成器
        this.iteratorGen = new IteratorGenerator(vm, ctx);
        this.arrayIteratorMethodsGen = new ArrayIteratorMethodsGenerator(vm, ctx);
        this.mapSetIteratorMethodsGen = new MapSetIteratorMethodsGenerator(vm, ctx);
        // Generator 生成器
        this.generatorGen = new GeneratorGenerator(vm, ctx);
        this.asyncGeneratorGen = new AsyncGeneratorGenerator(vm, ctx);
        // 私有字段生成器
        this.privateFieldGen = new PrivateFieldGenerator(vm, ctx);
        // Error 生成器
        this.errorGen = new ErrorGenerator(vm, ctx);
        // 核心生成器
        this.jsValueGen = new JSValueGenerator(vm, ctx);
        this.printGen = new PrintGenerator(vm);
        this.subscriptGen = new SubscriptGenerator(vm, ctx);
        this.typeofGen = new TypeofGenerator(vm);
        this.instanceofGen = new InstanceofGenerator(vm);
        this.equalityGen = new EqualityGenerator(vm);
        this.addGen = new AddGenerator(vm);
        this.coercionGen = new CoercionGenerator(vm);
        // 异步运行时
        this.asyncGen = new AsyncGenerator(vm);

        // FS & Path
        this.fsGen = new FSGenerator(vm, ctx);
        this.pathGen = new PathGenerator(vm, ctx);

        // Process
        this.processGen = new ProcessGenerator(vm, ctx);

        // OS
        this.osGen = new OSGenerator(vm, ctx);

        // Child Process
        this.childProcessGen = new ChildProcessGenerator(vm, ctx);

        // Buffer
        this.bufferGen = new BufferGenerator(vm, ctx);

        // Net
        this.netGen = new NetGenerator(vm, ctx);

        // Function methods
        this.functionMethodsGen = new FunctionMethodsGenerator(vm, ctx);
    }

    // 生成所有运行时函数
    generate() {
        // ============================================
        // 1. 基础类型 (无依赖)
        // ============================================
        this.numberGen.generate();      // 数值类型
        this.mathGen.generate();       // Math 对象
        this.jsonGen.generate();       // JSON 对象

        // ============================================
        // 2. 字符串相关 (依赖基础类型)
        // ============================================
        this.stringGen.generate();      // 字符串类型

        // ============================================
        // 3. 容器类型 (依赖字符串)
        // ============================================
        this.arrayGen.generate();       // 数组
        this.typedArrayGen.generate();  // 类型化数组
        this.arrayBufferGen.generate(); // ArrayBuffer
        this.dataViewGen.generate();    // DataView

        // ============================================
        // 4. 对象类型
        // ============================================
        this.objectGen.generate();      // 普通对象
        this.mapGen.generate();        // Map
        this.setGen.generate();        // Set

        // ============================================
        // 5. 日期/正则
        // ============================================
        this.dateGen.generate();        // Date
        this.regexpGen.generate();     // 正则

        // ============================================
        // 6. Symbol
        // ============================================
        this.symbolGen.generate();      // Symbol
        this.wellKnownSymbolsGen.generate();

        // ============================================
        // 7. 迭代器 (依赖容器)
        // ============================================
        this.iteratorGen.generate();
        this.arrayIteratorMethodsGen.generate();
        this.mapSetIteratorMethodsGen.generate();

        // ============================================
        // 8. 生成器 (依赖迭代器)
        // ============================================
        this.generatorGen.generate();
        this.asyncGeneratorGen.generate();

        // ============================================
        // 9. 私有字段
        // ============================================
        this.privateFieldGen.generate();

        // ============================================
        // 10. 错误
        // ============================================
        this.errorGen.generate();

        // ============================================
        // 11. 核心值系统 (依赖基础类型)
        // ============================================
        this.jsValueGen.generate();    // box/unbox (空操作)
        this.printGen.generate();       // console.log
        this.subscriptGen.generate();   // []
        this.typeofGen.generate();      // typeof
        this.instanceofGen.generate();  // instanceof
        this.equalityGen.generate();    // ==, ===
        this.addGen.generate();         // +
        this.coercionGen.generate();    // 类型转换

        // ============================================
        // 12. 异步 (依赖生成器/迭代器)
        // ============================================
        this.asyncGen.generate();

        // ============================================
        // 13. 系统功能 (依赖字符串)
        // ============================================
        // Path 必须在 FS 之前 (FS 使用 path 的函数)
        this.pathGen.generate();
        this.fsGen.generate();
        this.processGen.generate();
        this.osGen.generate();

        // ============================================
        // 14. 网络 (依赖异步)
        // ============================================
        this.childProcessGen.generate();
        this.bufferGen.generate();
        this.netGen.generate();

        // ============================================
        // 15. 函数方法
        // ============================================
        this.functionMethodsGen.generate(); // apply, call, bind
    }

    // 生成异步运行时数据段
    generateAsyncDataSection(asm) {
        this.asyncGen.generateDataSection(asm);
        // Coercion 数据段
        if (this.coercionGen.generateDataSection) {
            this.coercionGen.generateDataSection(asm);
        }
        // Child Process 数据段
        if (this.childProcessGen.generateDataSection) {
            this.childProcessGen.generateDataSection(asm);
        }
    }
}

// 运行时配置
let heapSize = 4194304; // 默认 4MB
let maxHeapSize = 0; // 0 = 无限制
let numWorkers = 0; // 0 = 单线程

export function getHeapSize() {
    return heapSize;
}

export function setHeapSize(size) {
    heapSize = size;
}

export function getMaxHeapSize() {
    return maxHeapSize;
}

export function setMaxHeapSize(size) {
    maxHeapSize = size;
}

export function getNumWorkers() {
    return numWorkers;
}

export function setNumWorkers(n) {
    numWorkers = n;
}
