// JSBin 值系统 - 简化版：直接使用堆指针
// 移除 NaN-boxing，所有值直接存堆指针

import { VReg } from "../../vm/index.js";

// ==================== 类型常量 ====================

export const JS_TAG_INT32 = 0;
export const JS_TAG_BOOL = 1;
export const JS_TAG_NULL = 2;
export const JS_TAG_UNDEFINED = 3;
export const JS_TAG_STRING = 4;
export const JS_TAG_OBJECT = 5;
export const JS_TAG_ARRAY = 6;
export const JS_TAG_FUNCTION = 7;

// NaN-boxing 基础 (保留兼容)
export const JS_NAN_BOXING_BASE = 0x7ff8000000000000n;
export const JS_TAG_MASK = 0x0007000000000000n;
export const JS_PAYLOAD_MASK = 0x0000ffffffffffffn;

// Tag 基础值 (保留兼容)
export const JS_TAG_INT32_BASE = 0x7ff8000000000000n;
export const JS_TAG_BOOL_BASE = 0x7ff9000000000000n;
export const JS_TAG_NULL_BASE = 0x7ffa000000000000n;
export const JS_TAG_UNDEFINED_BASE = 0x7ffb000000000000n;
export const JS_TAG_STRING_BASE = 0x7ffc000000000000n;
export const JS_TAG_OBJECT_BASE = 0x7ffd000000000000n;
export const JS_TAG_ARRAY_BASE = 0x7ffe000000000000n;
export const JS_TAG_FUNCTION_BASE = 0x7fff000000000000n;

// 预定义的特殊值 (作为指针，指向全局对象)
export const JS_NULL = 0n;
export const JS_UNDEFINED = 0n;
export const JS_TRUE = 1n;
export const JS_FALSE = 0n;

// ==================== 类型检测 ====================

// 所有值都是指针，无需检测
export function JS_IS_FLOAT64(v) { return 0; }
export function JS_GET_TAG(v) { return JS_TAG_OBJECT; }
export function JS_GET_PAYLOAD(v) { return v; }

// ==================== 堆对象布局 ==============

// 数组布局: [length:8 | capacity:8 | elements...]
export const ARRAY_LENGTH_OFFSET = 0;
export const ARRAY_CAPACITY_OFFSET = 8;
export const ARRAY_DATA_OFFSET = 16;

// 对象布局: [length:8 | capacity:8 | properties...]
export const OBJECT_LENGTH_OFFSET = 0;
export const OBJECT_CAPACITY_OFFSET = 8;
export const OBJECT_DATA_OFFSET = 16;
export const OBJECT_PROPERTY_SIZE = 16;

// 字符串布局: [length:8 | chars...]
export const STRING_LENGTH_OFFSET = 0;
export const STRING_DATA_OFFSET = 8;

// 闭包布局: [funcPtr:8 | captureCount:8 | captures...]
export const CLOSURE_FUNC_OFFSET = 0;
export const CLOSURE_CAPTURE_COUNT_OFFSET = 8;
export const CLOSURE_CAPTURES_OFFSET = 16;

// TypedArray 子类型
export const JS_ARRAY_SUBTYPE_SHIFT = 44n;
export const JS_ARRAY_SUBTYPE_MASK = 0x0000f00000000000n;
export const JS_ARRAY_PTR_MASK = 0x00000fffffffffffn;

export function JS_GET_ARRAY_SUBTYPE(v) { return 0; }
export function JS_GET_ARRAY_PTR(v) { return v; }
export function JS_MKTYPEDARRAY(subtype, ptr) { return ptr; }

// ==================== 生成器 ====================

export class JSValueGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        this.generateBox();
        this.generateBoxString();
        this.generateBoxArray();
        this.generateBoxObject();
        this.generateBoxFunction();
        this.generateUnbox();
        this.generateTypeof();
        this.generateGetLength();
        this.generateIsFloat64();
        this.generateGetTag();
    }

    // _js_box(ptr, type) -> ptr (空操作)
    generateBox() {
        const vm = this.vm;
        vm.label("_js_box");
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    // _js_box_string(ptr) -> ptr (空操作)
    generateBoxString() {
        const vm = this.vm;
        vm.label("_js_box_string");
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    // _js_box_array(ptr) -> ptr (空操作)
    generateBoxArray() {
        const vm = this.vm;
        vm.label("_js_box_array");
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    // _js_box_object(ptr) -> ptr (空操作)
    generateBoxObject() {
        const vm = this.vm;
        vm.label("_js_box_object");
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    // _js_box_function(ptr) -> ptr (空操作)
    generateBoxFunction() {
        const vm = this.vm;
        vm.label("_js_box_function");
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    // _js_unbox(v) -> v (空操作)
    generateUnbox() {
        const vm = this.vm;
        vm.label("_js_unbox");
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    // _js_typeof(v) -> 类型字符串指针
    generateTypeof() {
        const vm = this.vm;
        vm.label("_js_typeof");
        vm.movImm(VReg.RET, 0);
        vm.ret();
    }

    // _get_length(v) -> length
    generateGetLength() {
        const vm = this.vm;
        vm.label("_get_length");
        vm.movImm(VReg.RET, 0);
        vm.ret();
    }

    // _js_is_float64(v) -> 0 (总是返回 0)
    generateIsFloat64() {
        const vm = this.vm;
        vm.label("_js_is_float64");
        vm.movImm(VReg.RET, 0);
        vm.ret();
    }

    // _js_get_tag(v) -> JS_TAG_OBJECT (总是返回对象)
    generateGetTag() {
        const vm = this.vm;
        vm.label("_js_get_tag");
        vm.movImm(VReg.RET, JS_TAG_OBJECT);
        vm.ret();
    }
}
