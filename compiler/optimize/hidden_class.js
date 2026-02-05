// JSBin 编译器 - 隐藏类 (Hidden Class) 优化器
//
// 隐藏类的核心思想：
// 1. 具有相同属性添加顺序的对象共享同一个"形状"（hidden class）
// 2. 形状记录属性名到偏移量的映射
// 3. 对象只存储形状 ID，不存储属性名
// 4. 属性访问可以通过形状直接获取偏移量，避免线性查找
//
// 内存布局变化：
// 原布局：[type:8][count:8][__proto__:8][prop0_key:8][prop0_val:8]...
// 新布局：[type:8][shape_id:8][__proto__:8][prop0_val:8][prop1_val:8]...
//
// Shape 结构：
// [parent_shape:8][prop_count:8][prop_name_ptr:8][prop_offset:8]
//
// Shape 转换链：
// {} -> {x} -> {x,y} -> {x,y,z}
// 每个形状知道从父形状添加了哪个属性

import { VReg } from "../../vm/index.js";

// 最大形状数量（限制内存使用）
const MAX_SHAPES = 1024;
// 形状转换缓存大小
const TRANSITION_CACHE_SIZE = 8;

/**
 * 隐藏类/形状 管理器
 */
export class HiddenClassManager {
    constructor(compiler) {
        this.compiler = compiler;
        this.shapes = []; // 所有形状
        this.shapeCounter = 0; // 形状 ID 计数器
        this.rootShape = null; // 根形状（空对象）
        this.shapeLabels = []; // 形状数据标签
    }

    /**
     * 初始化隐藏类系统
     */
    initialize() {
        // 创建根形状（空对象 {}）
        this.rootShape = this.createShape(null, null, 0);
    }

    /**
     * 创建新形状
     * @param {object|null} parent - 父形状
     * @param {string|null} propName - 新添加的属性名
     * @param {number} propOffset - 属性偏移量
     * @returns {object} 新形状
     */
    createShape(parent, propName, propOffset) {
        const shapeId = this.shapeCounter++;
        const shape = {
            id: shapeId,
            parent: parent,
            propName: propName,
            propOffset: propOffset,
            propCount: parent ? parent.propCount + 1 : 0,
            transitions: new Map(), // propName -> childShape
            label: `_shape_${shapeId}`,
        };
        this.shapes.push(shape);
        return shape;
    }

    /**
     * 获取添加属性后的形状
     * @param {object} shape - 当前形状
     * @param {string} propName - 要添加的属性名
     * @returns {object} 新形状
     */
    getTransition(shape, propName) {
        // 检查是否已有转换
        if (shape.transitions.has(propName)) {
            return shape.transitions.get(propName);
        }

        // 创建新形状
        const newOffset = 24 + shape.propCount * 8; // __proto__ 之后开始
        const newShape = this.createShape(shape, propName, newOffset);
        shape.transitions.set(propName, newShape);
        return newShape;
    }

    /**
     * 查找形状中的属性偏移量
     * @param {object} shape - 形状
     * @param {string} propName - 属性名
     * @returns {number|null} 偏移量，未找到返回 null
     */
    findPropertyOffset(shape, propName) {
        let current = shape;
        while (current) {
            if (current.propName === propName) {
                return current.propOffset;
            }
            current = current.parent;
        }
        return null;
    }

    /**
     * 获取根形状 ID
     */
    getRootShapeId() {
        return this.rootShape ? this.rootShape.id : 0;
    }

    /**
     * 生成形状数据段
     * @param {object} asm - 汇编器
     */
    generateDataSection(asm) {
        if (this.shapes.length === 0) return;

        // 形状表标签
        asm.addDataLabel("_shape_table");
        asm.addDataQword(this.shapes.length);

        // 每个形状的数据
        for (const shape of this.shapes) {
            asm.addDataLabel(shape.label);
            // parent shape id (或 -1 表示无父形状)
            asm.addDataQword(shape.parent ? shape.parent.id : -1);
            // prop count
            asm.addDataQword(shape.propCount);
            // prop offset (这个形状新增的属性偏移量)
            asm.addDataQword(shape.propOffset);
            // prop name (字符串指针占位，运行时填充)
            if (shape.propName) {
                const propLabel = this.compiler.addStringConstant(shape.propName);
                // 存储字符串标签引用
                asm.addDataLabelRef(propLabel);
            } else {
                asm.addDataQword(0);
            }
        }
    }
}

/**
 * 隐藏类运行时生成器
 */
export class HiddenClassRuntimeGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    /**
     * 生成形状相关的运行时函数
     */
    generate() {
        this.generateShapeTransition();
        this.generateShapeLookup();
    }

    /**
     * 生成形状转换函数
     * _shape_transition(obj, shape_id, prop_name) -> new_shape_id
     */
    generateShapeTransition() {
        const vm = this.vm;

        vm.label("_shape_transition");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // obj
        vm.mov(VReg.S1, VReg.A1); // current shape_id
        vm.mov(VReg.S2, VReg.A2); // prop_name

        // 加载形状表
        vm.lea(VReg.V0, "_shape_table");
        vm.load(VReg.V1, VReg.V0, 0); // shape count

        // 检查 shape_id 有效性
        vm.cmp(VReg.S1, VReg.V1);
        vm.jge("_shape_transition_fallback");

        // 计算当前形状地址：_shape_table + 8 + shape_id * 32
        vm.shl(VReg.V2, VReg.S1, 5); // shape_id * 32
        vm.addImm(VReg.V2, VReg.V2, 8);
        vm.add(VReg.V2, VReg.V0, VReg.V2);

        // 简化实现：直接返回下一个形状 ID
        // 完整实现需要在转换表中查找
        vm.addImm(VReg.RET, VReg.S1, 1);
        vm.cmp(VReg.RET, VReg.V1);
        vm.jge("_shape_transition_fallback");
        vm.jmp("_shape_transition_done");

        vm.label("_shape_transition_fallback");
        // 回退：返回 -1 表示需要动态处理
        vm.movImm(VReg.RET, -1);

        vm.label("_shape_transition_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * 生成形状属性查找函数
     * _shape_lookup(shape_id, prop_name) -> offset (或 -1 未找到)
     */
    generateShapeLookup() {
        const vm = this.vm;

        vm.label("_shape_lookup");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // shape_id
        vm.mov(VReg.S1, VReg.A1); // prop_name

        // 加载形状表
        vm.lea(VReg.V0, "_shape_table");
        vm.load(VReg.V1, VReg.V0, 0); // shape count

        vm.label("_shape_lookup_loop");
        // 检查 shape_id 有效性
        vm.cmpImm(VReg.S0, 0);
        vm.jlt("_shape_lookup_not_found");
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_shape_lookup_not_found");

        // 计算形状地址：_shape_table + 8 + shape_id * 32
        vm.shl(VReg.V2, VReg.S0, 5); // shape_id * 32
        vm.addImm(VReg.V2, VReg.V2, 8);
        vm.add(VReg.V2, VReg.V0, VReg.V2);

        // 加载形状的属性名
        vm.load(VReg.V3, VReg.V2, 24); // prop_name ptr
        vm.cmpImm(VReg.V3, 0);
        vm.jeq("_shape_lookup_parent");

        // 比较属性名
        vm.mov(VReg.A0, VReg.V3);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jne("_shape_lookup_parent");

        // 找到了，返回偏移量
        vm.load(VReg.RET, VReg.V2, 16); // prop_offset
        vm.jmp("_shape_lookup_done");

        // 检查父形状
        vm.label("_shape_lookup_parent");
        vm.load(VReg.S0, VReg.V2, 0); // parent shape_id
        vm.jmp("_shape_lookup_loop");

        vm.label("_shape_lookup_not_found");
        vm.movImm(VReg.RET, -1);

        vm.label("_shape_lookup_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }
}

/**
 * 创建隐藏类管理器
 */
export function createHiddenClassManager(compiler) {
    return new HiddenClassManager(compiler);
}

/**
 * 创建隐藏类运行时生成器
 */
export function createHiddenClassRuntimeGenerator(vm, ctx) {
    return new HiddenClassRuntimeGenerator(vm, ctx);
}
