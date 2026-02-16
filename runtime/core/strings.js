// JSBin 运行时 - 内置字符串常量
// 统一管理所有运行时需要的字符串常量

// 字符串常量定义
export const RUNTIME_STRINGS = {
    // 类型字符串
    object: { label: "_str_object", value: "[object Object]" },
    undefined: { label: "_str_undefined", value: "undefined" },
    null: { label: "_str_null", value: "null" },
    true: { label: "_str_true", value: "true" },
    false: { label: "_str_false", value: "false" },
    function: { label: "_str_function", value: "[Function]" },
    array: { label: "_str_array", value: "[Array]" },
    unknown: { label: "_str_unknown", value: "[unknown]" },
    empty: { label: "_str_empty", value: "" },

    // 特殊数值
    infinity: { label: "_str_infinity", value: "Infinity" },
    negInfinity: { label: "_str_neg_infinity", value: "-Infinity" },
    nan: { label: "_str_nan", value: "NaN" },

    // Promise 相关
    promisePending: { label: "_str_promise_pending", value: "Promise { <pending> }" },
    promiseFulfilledFull: { label: "_str_promise_fulfilled_full", value: "Promise { <fulfilled> }" },
    promiseRejectedFull: { label: "_str_promise_rejected_full", value: "Promise { <rejected> }" },

    // 数组/对象格式化
    lbracket: { label: "_str_lbracket", value: "[" },
    rbracket: { label: "_str_rbracket", value: "]" },
    comma: { label: "_str_comma", value: ", " },
    quote: { label: "_str_quote", value: '"' },

    // typeof 运算符返回值
    number: { label: "_str_number", value: "number" },
    string: { label: "_str_string", value: "string" },
    boolean: { label: "_str_boolean", value: "boolean" },
    functionType: { label: "_str_function_type", value: "function" },
    objectType: { label: "_str_object_type", value: "object" },

    // 详细类型名称 (用于 _get_type_name)
    Number: { label: "_str_Number", value: "Number" },
    String: { label: "_str_String", value: "String" },
    Array: { label: "_str_Array", value: "Array" },
    Object: { label: "_str_Object", value: "Object" },
    Function: { label: "_str_Function", value: "Function" },
    ArrayBuffer: { label: "_str_ArrayBuffer", value: "ArrayBuffer" },

    // TypedArray 类型名称
    Int8Array: { label: "_str_Int8Array", value: "Int8Array" },
    Int16Array: { label: "_str_Int16Array", value: "Int16Array" },
    Int32Array: { label: "_str_Int32Array", value: "Int32Array" },
    BigInt64Array: { label: "_str_BigInt64Array", value: "BigInt64Array" },
    Uint8Array: { label: "_str_Uint8Array", value: "Uint8Array" },
    Uint16Array: { label: "_str_Uint16Array", value: "Uint16Array" },
    Uint32Array: { label: "_str_Uint32Array", value: "Uint32Array" },
    BigUint64Array: { label: "_str_BigUint64Array", value: "BigUint64Array" },
    Uint8ClampedArray: { label: "_str_Uint8ClampedArray", value: "Uint8ClampedArray" },
    Float32Array: { label: "_str_Float32Array", value: "Float32Array" },
    Float64Array: { label: "_str_Float64Array", value: "Float64Array" },

    // ArrayBuffer 格式化
    arraybufferOpen: { label: "_str_arraybuffer_open", value: " { byteLength: " },
    arraybufferClose: { label: "_str_arraybuffer_close", value: " }" },

    // TypedArray 缩略格式（用于多参数 console.log）
    typedarrayAbbrev: { label: "_str_typedarray_abbrev", value: ") [...]" },

    // 调试字符串
    debugInput: { label: "_str_debug_input", value: "input: " },
    debugUnboxed: { label: "_str_debug_unboxed", value: ", unboxed: " },
    debugLen: { label: "_str_debug_len", value: ", len: " },
    debugElem: { label: "_str_debug_elem", value: ", elem: " },
    debugBox: { label: "_str_debug_box", value: "BOX: " },
    debugBoxed2: { label: "_str_debug_boxed2", value: " -> " },
    debugIdx: { label: "_str_debug_idx", value: "idx=" },
    debugColon: { label: "_str_debug_colon", value: ":" },
    debugNumObj: { label: "_str_debug_numobj", value: "NUM:" },
    debugFlt: { label: "_str_debug_flt", value: "FLT:" },
    debugVnl: { label: "_str_debug_vnl", value: "VNL value=" },
    debugHeapBase: { label: "_str_debug_heap_base", value: "heap_base=" },
    debugHeapPtr: { label: "_str_debug_heap_ptr", value: "heap_ptr=" },
    debugType: { label: "_str_debug_type", value: "type=" },
    newline: { label: "_str_newline", value: "\n" },
    debugResume: { label: "_str_debug_resume", value: "[DEBUG] _generator_resume_start\n" },
    debugResumeYield: { label: "_str_debug_resume_yield", value: "[DEBUG] _generator_resume_yield\n" },
    debugGenNext: { label: "_str_debug_gen_next", value: "[DEBUG] _generator_next state=" },
    debugGenResume: { label: "_str_debug_gen_resume", value: "[DEBUG] _generator_resume\n" },
    debugGenResumeState: { label: "_str_debug_gen_resume_state", value: "[DEBUG] _generator_resume state=" },
    debugFuncPtr: { label: "_str_debug_func_ptr", value: "[DEBUG] func_ptr=" },
    debugAfterCall: { label: "_str_debug_after_call", value: "[DEBUG] after call to generator body\n" },
    debugCalling: { label: "_str_debug_calling", value: "[DEBUG] calling generator body...\n" },
    debugGenReturn: { label: "_str_debug_gen_return", value: "[DEBUG] generator body return label\n" },
    debugGenS0: { label: "_str_debug_gen_s0", value: "[DEBUG] S0 (generator ptr)=" },
    debugRetval: { label: "_str_debug_retval", value: "[DEBUG] return value ptr=" },
    debugRetval2: { label: "_str_debug_retval2", value: ", type=" },

    // Getter/Setter 前缀
    getterPrefix: { label: "_str_getter_prefix", value: "__get__" },
    setterPrefix: { label: "_str_setter_prefix", value: "__set__" },

    // 属性名称
    lengthProp: { label: "_str_length_prop", value: "length" },
};

// 字符串常量生成器
export class StringConstantsGenerator {
    constructor(asm) {
        this.asm = asm;
        this.generated = new Set();
    }

    // 生成单个字符串常量
    generateString(label, value) {
        if (this.generated.has(label)) {
            return;
        }

        this.asm.addDataLabel(label);
        for (let i = 0; i < value.length; i++) {
            this.asm.addDataByte(value.charCodeAt(i));
        }
        this.asm.addDataByte(0); // null terminator
        this.generated.add(label);
    }

    // 生成所有运行时字符串常量
    generateAll() {
        const debug = typeof process !== "undefined" && process.env && process.env.DEBUG_RUNTIME;
        const keys = [
            "object",
            "undefined",
            "null",
            "true",
            "false",
            "function",
            "array",
            "unknown",
            "empty",
            "infinity",
            "negInfinity",
            "nan",
            "promisePending",
            "promiseFulfilledFull",
            "promiseRejectedFull",
            "lbracket",
            "rbracket",
            "comma",
            "quote",
            "number",
            "string",
            "boolean",
            "functionType",
            "objectType",
            "Number",
            "String",
            "Array",
            "Object",
            "Function",
            "ArrayBuffer",
            "Int8Array",
            "Int16Array",
            "Int32Array",
            "BigInt64Array",
            "Uint8Array",
            "Uint16Array",
            "Uint32Array",
            "BigUint64Array",
            "Uint8ClampedArray",
            "Float32Array",
            "Float64Array",
            "arraybufferOpen",
            "arraybufferClose",
            "typedarrayAbbrev",
            "debugInput",
            "debugUnboxed",
            "debugLen",
            "debugElem",
            "debugBox",
            "debugBoxed2",
            "debugIdx",
            "debugColon",
            "debugNumObj",
            "debugFlt",
            "debugVnl",
            "debugHeapBase",
            "debugHeapPtr",
            "debugType",
            "newline",
            "debugResume",
            "debugResumeYield",
            "debugGenNext",
            "debugGenResume",
            "debugGenResumeState",
            "debugFuncPtr",
            "debugAfterCall",
            "debugCalling",
            "debugGenReturn",
            "debugGenS0",
            "debugRetval",
            "debugRetval2",
            "getterPrefix",
            "setterPrefix",
            "lengthProp",
        ];

        let count = 0;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const str = RUNTIME_STRINGS[key];
            if (str && str.label) {
                this.generateString(str.label, str.value);
                count++;
            }
        }
        if (debug) console.log("[Strings] generateAll done, count=" + count);
    }

    // 生成打印缓冲区
    generatePrintBuffer(size) {
        if (size === undefined) size = 24;
        const debug = typeof process !== "undefined" && process.env && process.env.DEBUG_RUNTIME;
        if (debug) console.log("[Strings] generatePrintBuffer start, size=" + size);
        this.asm.addDataLabel("_print_buf");
        if (debug) console.log("[Strings] generatePrintBuffer label added");
        for (let i = 0; i < size; i++) {
            if (debug && i === 0) console.log("[Strings] Loop start");
            this.asm.addDataByte(0);
        }
        if (debug) console.log("[Strings] generatePrintBuffer done");
    }
}
