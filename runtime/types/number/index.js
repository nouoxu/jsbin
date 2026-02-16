// JSBin 运行时 - Number 类型
// 完整的数值类型支持
//
// 有符号整数:
//   - int8, int16, int32, int64
//
// 无符号整数:
//   - uint8, uint16, uint32, uint64
//
// 浮点数:
//   - float32 (IEEE 754 单精度)
//   - float64 (IEEE 754 双精度) - JavaScript 默认

// 导出类型常量和工具函数
export * from "./types.js";

// 导出各个生成器
export { NumberPrintGenerator } from "./print.js";
export { SignedIntegerGenerator } from "./integers.js";
export { UnsignedIntegerGenerator } from "./uintegers.js";
export { FloatsGenerator } from "./floats.js";
export { NumberParseGenerator } from "./parse.js";

// 导入生成器
import { NumberPrintGenerator } from "./print.js";
import { SignedIntegerGenerator } from "./integers.js";
import { UnsignedIntegerGenerator } from "./uintegers.js";
import { FloatsGenerator } from "./floats.js";
import { NumberParseGenerator } from "./parse.js";

// Number 类型聚合生成器
export class NumberGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;

        // 子生成器
        this.printGen = new NumberPrintGenerator(vm, ctx);
        this.signedIntGen = new SignedIntegerGenerator(vm, ctx);
        this.unsignedIntGen = new UnsignedIntegerGenerator(vm, ctx);
        this.floatGen = new FloatsGenerator(vm, ctx);
        this.parseGen = new NumberParseGenerator(vm, ctx);
    }

    // 生成所有数字类型相关函数
    generate() {
        console.log("[NumberGen] printGen");
        this.printGen.generate();
        console.log("[NumberGen] signedIntGen");
        this.signedIntGen.generate();
        console.log("[NumberGen] unsignedIntGen");
        this.unsignedIntGen.generate();
        console.log("[NumberGen] floatGen");
        this.floatGen.generate();
        console.log("[NumberGen] parseGen");
        this.parseGen.generate();
        console.log("[NumberGen] done");
    }

    // 生成数据段（打印缓冲区等）
    generateDataSection(asm) {
        this.printGen.generateDataSection(asm);
    }
}
