// JSBin Symbol 运行时
// 提供 Symbol 类型的基础实现

import { VReg } from "../../../vm/registers.js";

// Symbol 类型常量
const TYPE_SYMBOL = 14; // 新的类型标签

// 内置 Symbol ID
export const WellKnownSymbols = {
    ITERATOR: 1,
    TO_STRING_TAG: 2,
    TO_PRIMITIVE: 3,
    HAS_INSTANCE: 4,
    IS_CONCAT_SPREADABLE: 5,
    SPECIES: 6,
    MATCH: 7,
    REPLACE: 8,
    SEARCH: 9,
    SPLIT: 10,
    UNSCOPABLES: 11,
    ASYNC_ITERATOR: 12,
};

export class SymbolGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateSymbolNew();
        this.generateSymbolFor();
        this.generateSymbolKeyFor();
        this.generateSymbolDescription();
        this.generateSymbolToString();
    }

    generateDataSection(asm) {
        // Symbol 全局计数器
        asm.addDataLabel("_symbol_counter");
        asm.addDataQword(100); // 从 100 开始，避免与内置 Symbol 冲突

        // Symbol 注册表（简化实现：固定大小数组）
        asm.addDataLabel("_symbol_registry_size");
        asm.addDataQword(0);

        // Symbol 描述字符串
        asm.addDataLabel("_str_Symbol");
        this._addString(asm, "Symbol(");

        asm.addDataLabel("_str_Symbol_iterator");
        this._addString(asm, "Symbol.iterator");

        asm.addDataLabel("_str_Symbol_toStringTag");
        this._addString(asm, "Symbol.toStringTag");

        asm.addDataLabel("_str_Symbol_toPrimitive");
        this._addString(asm, "Symbol.toPrimitive");

        asm.addDataLabel("_str_Symbol_hasInstance");
        this._addString(asm, "Symbol.hasInstance");

        asm.addDataLabel("_str_Symbol_asyncIterator");
        this._addString(asm, "Symbol.asyncIterator");
    }

    _addString(asm, str) {
        for (let i = 0; i < str.length; i++) {
            asm.addDataByte(str.charCodeAt(i));
        }
        asm.addDataByte(0);
    }

    // Symbol([description]) -> Symbol
    // 创建新的唯一 Symbol
    generateSymbolNew() {
        const vm = this.vm;

        vm.label("_symbol_new");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // description (可能是 undefined)

        // 分配 Symbol 对象：[type: 8B][id: 8B][description: 8B]
        vm.movImm(VReg.A0, 24);
        vm.call("_alloc");
        vm.mov(VReg.V0, VReg.RET);

        // 写入类型
        vm.movImm(VReg.V1, TYPE_SYMBOL);
        vm.store(VReg.V0, 0, VReg.V1);

        // 生成唯一 ID（原子递增计数器）
        vm.lea(VReg.V1, "_symbol_counter");
        vm.load(VReg.V2, VReg.V1, 0);
        vm.addImm(VReg.V3, VReg.V2, 1);
        vm.store(VReg.V1, 0, VReg.V3);

        // 写入 ID
        vm.store(VReg.V0, 8, VReg.V2);

        // 写入 description
        vm.store(VReg.V0, 16, VReg.S0);

        vm.mov(VReg.RET, VReg.V0);
        vm.epilogue([VReg.S0], 16);
    }

    // Symbol.for(key) -> Symbol
    // 在全局注册表中查找或创建 Symbol
    generateSymbolFor() {
        const vm = this.vm;

        vm.label("_Symbol_for");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // key (字符串)

        // 简化实现：每次都创建新 Symbol
        // 完整实现需要维护 key -> Symbol 的映射表
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_symbol_new");

        vm.epilogue([VReg.S0, VReg.S1], 32);
    }

    // Symbol.keyFor(sym) -> string | undefined
    // 返回注册表中 Symbol 的 key
    generateSymbolKeyFor() {
        const vm = this.vm;

        vm.label("_Symbol_keyFor");
        vm.prologue(16, [VReg.S0]);

        // 简化实现：总是返回 undefined
        // 完整实现需要查找 Symbol -> key 的映射
        vm.lea(VReg.RET, "_js_undefined");
        vm.epilogue([VReg.S0], 16);
    }

    // symbol.description -> string | undefined
    // 返回 Symbol 的描述字符串
    generateSymbolDescription() {
        const vm = this.vm;

        vm.label("_symbol_description");
        vm.prologue(0, []);

        // A0 = Symbol 对象
        // 返回 +16 位置的 description
        vm.load(VReg.RET, VReg.A0, 16);
        vm.epilogue([], 0);
    }

    // symbol.toString() -> string
    // 返回 "Symbol(description)"
    generateSymbolToString() {
        const vm = this.vm;
        const TYPE_STRING = 6;

        vm.label("_symbol_toString");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // Symbol 对象

        // 获取 description
        vm.load(VReg.S1, VReg.S0, 16);

        // 检查 description 是否为 undefined
        vm.lea(VReg.V0, "_js_undefined");
        vm.cmp(VReg.S1, VReg.V0);
        vm.jeq("_symToStr_no_desc");

        // 有 description：构造 "Symbol(description)"
        // 计算 description 长度
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_getStrContent");
        vm.mov(VReg.S1, VReg.RET);

        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strlen");
        vm.mov(VReg.S2, VReg.RET);

        // 总长度 = 7 ("Symbol(") + desc_len + 1 (")")
        vm.addImm(VReg.V0, VReg.S2, 8);

        // 分配字符串：16 字节头部 + 内容 + 1
        vm.addImm(VReg.A0, VReg.V0, 17);
        vm.call("_alloc");
        vm.mov(VReg.V1, VReg.RET);

        // 写入头部
        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.V1, 0, VReg.V0);
        vm.addImm(VReg.V0, VReg.S2, 8);
        vm.store(VReg.V1, 8, VReg.V0);

        // 复制 "Symbol("
        vm.addImm(VReg.V2, VReg.V1, 16);
        vm.lea(VReg.A1, "_str_Symbol");
        vm.mov(VReg.A0, VReg.V2);
        vm.movImm(VReg.A2, 7);
        vm.call("_memcpy");

        // 复制 description
        vm.addImm(VReg.V2, VReg.V1, 23); // 16 + 7
        vm.mov(VReg.A0, VReg.V2);
        vm.mov(VReg.A1, VReg.S1);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_memcpy");

        // 添加 ")"
        vm.addImm(VReg.V2, VReg.S2, 23);
        vm.add(VReg.V2, VReg.V1, VReg.V2);
        vm.movImm(VReg.V0, 41); // ')'
        vm.storeByte(VReg.V2, 0, VReg.V0);

        // 添加 null 终止符
        vm.addImm(VReg.V2, VReg.V2, 1);
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.V2, 0, VReg.V0);

        vm.mov(VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // 无 description：返回 "Symbol()"
        vm.label("_symToStr_no_desc");
        // 分配固定字符串
        vm.movImm(VReg.A0, 25); // 16 + 8 + 1
        vm.call("_alloc");
        vm.mov(VReg.V1, VReg.RET);

        vm.movImm(VReg.V0, TYPE_STRING);
        vm.store(VReg.V1, 0, VReg.V0);
        vm.movImm(VReg.V0, 8);
        vm.store(VReg.V1, 8, VReg.V0);

        // 复制 "Symbol()"
        vm.addImm(VReg.V2, VReg.V1, 16);
        vm.lea(VReg.A1, "_str_Symbol");
        vm.mov(VReg.A0, VReg.V2);
        vm.movImm(VReg.A2, 7);
        vm.call("_memcpy");

        vm.addImm(VReg.V2, VReg.V1, 23);
        vm.movImm(VReg.V0, 41); // ')'
        vm.storeByte(VReg.V2, 0, VReg.V0);
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.V2, 1, VReg.V0);

        vm.mov(VReg.RET, VReg.V1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }
}

// 内置 well-known Symbols 生成器
export class WellKnownSymbolsGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateWellKnownSymbols();
    }

    generateDataSection(asm) {
        // 预分配 well-known Symbols（静态对象）
        // Symbol.iterator
        asm.addDataLabel("_Symbol_iterator");
        asm.addDataQword(TYPE_SYMBOL); // type
        asm.addDataQword(WellKnownSymbols.ITERATOR); // id
        asm.addDataQword(0); // description (懒初始化)

        // Symbol.toStringTag
        asm.addDataLabel("_Symbol_toStringTag");
        asm.addDataQword(TYPE_SYMBOL);
        asm.addDataQword(WellKnownSymbols.TO_STRING_TAG);
        asm.addDataQword(0);

        // Symbol.toPrimitive
        asm.addDataLabel("_Symbol_toPrimitive");
        asm.addDataQword(TYPE_SYMBOL);
        asm.addDataQword(WellKnownSymbols.TO_PRIMITIVE);
        asm.addDataQword(0);

        // Symbol.hasInstance
        asm.addDataLabel("_Symbol_hasInstance");
        asm.addDataQword(TYPE_SYMBOL);
        asm.addDataQword(WellKnownSymbols.HAS_INSTANCE);
        asm.addDataQword(0);

        // Symbol.asyncIterator
        asm.addDataLabel("_Symbol_asyncIterator");
        asm.addDataQword(TYPE_SYMBOL);
        asm.addDataQword(WellKnownSymbols.ASYNC_ITERATOR);
        asm.addDataQword(0);
    }

    // 获取 well-known Symbol 的访问函数
    generateWellKnownSymbols() {
        const vm = this.vm;

        // Symbol.iterator
        vm.label("_get_Symbol_iterator");
        vm.prologue(0, []);
        vm.lea(VReg.RET, "_Symbol_iterator");
        vm.epilogue([], 0);

        // Symbol.toStringTag
        vm.label("_get_Symbol_toStringTag");
        vm.prologue(0, []);
        vm.lea(VReg.RET, "_Symbol_toStringTag");
        vm.epilogue([], 0);

        // Symbol.toPrimitive
        vm.label("_get_Symbol_toPrimitive");
        vm.prologue(0, []);
        vm.lea(VReg.RET, "_Symbol_toPrimitive");
        vm.epilogue([], 0);

        // Symbol.asyncIterator
        vm.label("_get_Symbol_asyncIterator");
        vm.prologue(0, []);
        vm.lea(VReg.RET, "_Symbol_asyncIterator");
        vm.epilogue([], 0);
    }
}
