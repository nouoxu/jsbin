// JSBin 编译器 - 内联缓存 (IC) 优化器
// 缓存属性访问的偏移量，加速对象属性查找
//
// 对于 AOT 编译器，我们使用一种简化的 IC 策略：
// 1. 在数据段预留 IC 槽位
// 2. 第一次访问时填充缓存（记录属性名的指针和偏移量）
// 3. 后续访问先检查缓存，命中则直接使用偏移量
//
// 对象内存布局（来自 runtime/types/object/index.js）:
// +0:  type (8 bytes) = TYPE_OBJECT (2)
// +8:  属性数量 count (8 bytes)
// +16: __proto__ 指针 (8 bytes)
// +24: 属性区开始
//      每个属性: key指针(8) + value(8) = 16 bytes

import { VReg } from "../../vm/index.js";

// IC 状态
const IC_STATE = {
    UNINITIALIZED: 0, // 未初始化
    MONOMORPHIC: 1, // 单态（只见过一种类型）
    MEGAMORPHIC: 2, // 超多态（见过太多类型，放弃优化）
};

// 对象布局常量
const OBJECT_HEADER_SIZE = 24; // type + count + __proto__
const PROP_SIZE = 16; // key + value

// IC 槽位布局：
// [state:8][cached_obj:8][offset:8]
// - state: IC 状态 (0=未初始化, 1=单态缓存, 2=超多态)
// - cached_obj: 上次访问的对象指针（用于简单检查）
// - offset: 属性在对象中的偏移量（从对象起始位置）
const IC_SLOT_SIZE = 24;

/**
 * 内联缓存管理器
 */
export class InlineCacheManager {
    constructor(compiler) {
        this.compiler = compiler;
        this.icSlots = []; // IC 槽位列表
        this.icCounter = 0; // IC 计数器
    }

    /**
     * 为属性访问分配 IC 槽位
     * @param {string} propertyName - 属性名
     * @returns {object} { slotLabel, slotIndex }
     */
    allocateSlot(propertyName) {
        const slotIndex = this.icCounter++;
        const slotLabel = `_ic_slot_${slotIndex}`;

        this.icSlots.push({
            index: slotIndex,
            label: slotLabel,
            propertyName: propertyName,
            state: IC_STATE.UNINITIALIZED,
        });

        return { slotLabel, slotIndex };
    }

    /**
     * 生成所有 IC 槽位的数据段
     * @param {object} asm - 汇编器
     */
    generateDataSection(asm) {
        if (this.icSlots.length === 0) return;

        // 生成 IC 数据段
        asm.addDataLabel("_ic_slots");

        for (const slot of this.icSlots) {
            asm.addDataLabel(slot.label);
            // state (8 bytes)
            asm.addDataQword(IC_STATE.UNINITIALIZED);
            // shape_id (8 bytes)
            asm.addDataQword(0);
            // offset (8 bytes)
            asm.addDataQword(0);
        }
    }

    /**
     * 生成带 IC 的属性访问代码
     * 这是一个简化版本，主要用于静态属性名访问
     * @param {object} compiler - 编译器
     * @param {object} expr - 成员表达式 AST
     */
    compilePropertyAccessWithIC(compiler, expr) {
        const vm = compiler.vm;

        // 只对简单的点访问使用 IC (obj.prop)
        if (expr.computed || !expr.property || expr.property.type !== "Identifier") {
            return false;
        }

        const propertyName = expr.property.name;
        const { slotLabel, slotIndex } = this.allocateSlot(propertyName);

        // 编译对象表达式
        compiler.compileExpression(expr.object);
        vm.mov(VReg.A0, VReg.RET); // A0 = object

        // 加载 IC 槽位地址
        vm.lea(VReg.V0, slotLabel);

        // 加载属性名常量
        const propNameLabel = compiler.addStringConstant(propertyName);
        vm.lea(VReg.A1, propNameLabel); // A1 = property name

        // 调用带 IC 的属性访问函数
        // 原型: _object_get_ic(object, propName, icSlot)
        vm.mov(VReg.A2, VReg.V0); // A2 = IC slot
        vm.call("_object_get_ic");

        return true;
    }

    /**
     * 获取 IC 槽位数量
     */
    getSlotCount() {
        return this.icSlots.length;
    }

    /**
     * 清空所有 IC 槽位
     */
    clear() {
        this.icSlots = [];
        this.icCounter = 0;
    }
}

/**
 * 生成 IC 运行时支持代码
 * 这些函数在运行时被调用来处理属性访问
 */
export class ICRuntimeGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    /**
     * 生成 _object_get_ic 函数
     * 带内联缓存的对象属性获取
     *
     * 参数：
     *   A0: object pointer
     *   A1: property name (string pointer)
     *   A2: IC slot pointer
     *
     * 返回：
     *   RET: property value
     *
     * IC 槽位布局：
     *   +0: state (8 bytes) - IC_STATE
     *   +8: cached_count (8 bytes) - 缓存时对象的属性数量
     *   +16: offset (8 bytes) - 缓存的属性偏移量
     */
    generate() {
        const vm = this.vm;

        vm.label("_object_get_ic");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // 保存参数
        vm.mov(VReg.S0, VReg.A0); // object
        vm.mov(VReg.S1, VReg.A1); // propName
        vm.mov(VReg.S2, VReg.A2); // icSlot

        // 检查 obj 是否为 null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_get_ic_slow");

        // 检查 IC 状态
        vm.load(VReg.V0, VReg.S2, 0); // state

        // 如果是未初始化状态，跳转到慢速路径
        vm.cmpImm(VReg.V0, IC_STATE.UNINITIALIZED);
        vm.jeq("_object_get_ic_slow");

        // 如果是超多态状态，也跳转到慢速路径
        vm.cmpImm(VReg.V0, IC_STATE.MEGAMORPHIC);
        vm.jeq("_object_get_ic_slow");

        // 快速路径：检查属性数量是否与缓存时相同
        // 如果相同，假设属性顺序没变，直接使用缓存的偏移量
        vm.load(VReg.V1, VReg.S0, 8); // object prop count
        vm.load(VReg.V2, VReg.S2, 8); // cached count
        vm.cmp(VReg.V1, VReg.V2);
        vm.jne("_object_get_ic_slow");

        // 属性数量匹配，使用缓存的偏移量直接获取值
        vm.load(VReg.S3, VReg.S2, 16); // cached offset
        vm.add(VReg.V0, VReg.S0, VReg.S3);

        // 验证：检查该位置的 key 是否匹配（防止误命中）
        vm.load(VReg.A0, VReg.V0, 0); // key at offset
        vm.mov(VReg.A1, VReg.S1); // expected key
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_object_get_ic_miss");

        // Key 匹配，加载 value
        vm.add(VReg.V0, VReg.S0, VReg.S3);
        vm.load(VReg.RET, VReg.V0, 8); // value at offset + 8
        vm.jmp("_object_get_ic_done");

        // IC 未命中，降级为慢速路径并更新缓存
        vm.label("_object_get_ic_miss");
        // 增加未命中计数，如果太多次则标记为超多态
        // (简化实现：直接标记为超多态)
        vm.movImm(VReg.V0, IC_STATE.MEGAMORPHIC);
        vm.store(VReg.S2, 0, VReg.V0);
        vm.jmp("_object_get_ic_call_slow");

        // 慢速路径：调用普通的对象属性获取
        vm.label("_object_get_ic_slow");
        vm.label("_object_get_ic_call_slow");
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_object_get_with_offset");
        vm.mov(VReg.S3, VReg.RET); // value
        vm.mov(VReg.S4, VReg.A2); // offset (返回在 A2 中)

        // 更新 IC 缓存（如果找到了属性）
        vm.load(VReg.V0, VReg.S2, 0); // current state
        vm.cmpImm(VReg.V0, IC_STATE.MEGAMORPHIC);
        vm.jeq("_object_get_ic_return");

        // 检查是否找到属性（offset != -1）
        vm.cmpImm(VReg.S4, -1);
        vm.jeq("_object_get_ic_return");

        // 更新缓存
        vm.movImm(VReg.V0, IC_STATE.MONOMORPHIC);
        vm.store(VReg.S2, 0, VReg.V0); // state = MONOMORPHIC
        vm.load(VReg.V0, VReg.S0, 8); // prop count
        vm.store(VReg.S2, 8, VReg.V0); // cached_count
        vm.store(VReg.S2, 16, VReg.S4); // cached offset

        vm.label("_object_get_ic_return");
        vm.mov(VReg.RET, VReg.S3);

        vm.label("_object_get_ic_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    /**
     * 生成 _object_get_with_offset 函数
     * 获取对象属性，同时返回偏移量
     *
     * 参数：
     *   A0: object pointer
     *   A1: property name
     *
     * 返回：
     *   RET: property value (或 0 如果未找到)
     *   A2: offset (或 -1 如果未找到)
     */
    generateGetWithOffset() {
        const vm = this.vm;

        vm.label("_object_get_with_offset");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // key

        // 检查 obj 是否为 null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_object_get_wo_notfound");

        // 加载属性数量
        vm.load(VReg.S2, VReg.S0, 8); // prop count
        vm.movImm(VReg.S3, 0); // index

        vm.label("_object_get_wo_loop");
        vm.cmp(VReg.S3, VReg.S2);
        vm.jge("_object_get_wo_notfound");

        // 计算属性偏移: OBJECT_HEADER_SIZE + index * PROP_SIZE
        vm.shl(VReg.V0, VReg.S3, 4); // index * 16
        vm.addImm(VReg.V0, VReg.V0, OBJECT_HEADER_SIZE);
        vm.add(VReg.V1, VReg.S0, VReg.V0); // V1 = property address

        // 加载 key
        vm.load(VReg.A0, VReg.V1, 0);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");

        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_object_get_wo_found");

        vm.addImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_object_get_wo_loop");

        vm.label("_object_get_wo_found");
        // 计算偏移量
        vm.shl(VReg.A2, VReg.S3, 4);
        vm.addImm(VReg.A2, VReg.A2, OBJECT_HEADER_SIZE);
        // 加载 value
        vm.add(VReg.V1, VReg.S0, VReg.A2);
        vm.load(VReg.RET, VReg.V1, 8);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        vm.label("_object_get_wo_notfound");
        vm.movImm(VReg.RET, 0);
        vm.movImm(VReg.A2, -1); // offset = -1 表示未找到
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }
}

/**
 * 创建 IC 管理器
 */
export function createInlineCacheManager(compiler) {
    return new InlineCacheManager(compiler);
}

/**
 * 创建 IC 运行时生成器
 */
export function createICRuntimeGenerator(vm, ctx) {
    return new ICRuntimeGenerator(vm, ctx);
}
