// JSBin Runtime - Node.js util
// Provides utility functions for JSBin compiled binaries

export const util = {
    format(...args) {
        if (!args.length) return "";
        const fmt = args[0];
        if (typeof fmt !== "string") return String(fmt);
        let i = 1;
        return fmt.replace(/%[sdifjoOcs]/g, (match) => {
            if (i >= args.length) return match;
            const arg = args[i++];
            switch (match) {
                case "%s": return String(arg);
                case "%d": return Number(arg);
                case "%i": return parseInt(arg);
                case "%f": return parseFloat(arg);
                case "%j": try { return JSON.stringify(arg); } catch { return "[Circular]"; }
                case "%o": case "%O": return String(arg);
                case "%c": return "";
                default: return match;
            }
        });
    },

    inspect(obj, showHidden, depth, colors) {
        if (depth === undefined) depth = 2;
        try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
    },

    types: {
        isArray: Array.isArray,
        isBoolean: (obj) => typeof obj === "boolean",
        isBuffer: (obj) => obj instanceof Buffer,
        isDate: (obj) => obj instanceof Date,
        isError: (obj) => obj instanceof Error,
        isFunction: (obj) => typeof obj === "function",
        isNull: (obj) => obj === null,
        isNullOrUndefined: (obj) => obj === null || obj === undefined,
        isNumber: (obj) => typeof obj === "number",
        isObject: (obj) => typeof obj === "object",
        isPrimitive: (obj) => obj === null || (typeof obj !== "object" && typeof obj !== "function"),
        isString: (obj) => typeof obj === "string",
        isSymbol: (obj) => typeof obj === "symbol",
        isUndefined: (obj) => obj === undefined,
        isRegExp: (obj) => obj instanceof RegExp
    },

    _extend: (target, source) => Object.assign(target, source),

    inherits: (ctor, superCtor) => {
        ctor.super_ = superCtor;
        Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
    },

    debuglog: () => () => {},
    debug: () => {},
    deprecate: (fn, msg) => fn,
    getSystemErrorMap: () => new Map(),
    getSystemErrorName: () => "",
    isArrayBuffer: () => false,
    isAsyncFunction: () => false,
    isBigInt64Array: () => false,
    isBigUint64Array: () => false,
    isBoxedPrimitive: () => false,
    isDataView: () => false,
    isExternal: () => false,
    isFloat32Array: () => false,
    isFloat64Array: () => false,
    isGeneratorFunction: () => false,
    isInt32Array: () => false,
    isInt8Array: () => false,
    isInt16Array: () => false,
    isMap: () => false,
    isMapIterator: () => false,
    isNativeError: () => false,
    isPromise: (obj) => obj instanceof Promise,
    isProxy: () => false,
    isSet: () => false,
    isSetIterator: () => false,
    isSharedArrayBuffer: () => false,
    isTypedArray: () => false,
    isUint32Array: () => false,
    isUint8Array: () => false,
    isUint8ClampedArray: () => false,
    isWeakMap: () => false,
    isWeakSet: () => false,
    toUSVInteger: (val) => Math.floor(val) >>> 0
};

export const sys = util; // deprecated alias

export default util;
