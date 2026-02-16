// JSBin 运行时 - Error 类型
// 提供 JavaScript Error 对象支持

import { VReg } from "../../../vm/index.js";

// Error 对象布局:
// +0:  type (TYPE_ERROR = 31)
// +8:  message (字符串指针)
// +16: name (字符串指针，如 "Error", "TypeError" 等)
// +24: stack (字符串指针)
// +32: cause (可选，异常原因)

export class ErrorGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;

        // 常量 (移到实例属性以避免自举编译问题)
        this.TYPE_ERROR = 31;
        this.ERROR_SIZE = 40;

        // Error 子类型常量 (存储在 subtype 字段)
        this.ERROR_TYPE_ERROR = 0; // Error
        this.ERROR_TYPE_TYPEERROR = 1; // TypeError
        this.ERROR_TYPE_REFERENCEERROR = 2; // ReferenceError
        this.ERROR_TYPE_SYNTAXERROR = 3; // SyntaxError
        this.ERROR_TYPE_RANGEERROR = 4; // RangeError
        this.ERROR_TYPE_EVALERROR = 5; // EvalError
        this.ERROR_TYPE_URIERROR = 6; // URIError
    }

    generate() {
        const debug = typeof globalThis !== "undefined" && globalThis.DEBUG_RUNTIME;
        const envDebug = typeof process !== "undefined" && process.env && process.env.DEBUG_RUNTIME;
        const isDebug = debug || envDebug;

        // 类信息初始化（必须在程序启动时调用）
        if (isDebug) console.log("[Runtime:Error] generateInitErrorClassInfo");
        this.generateInitErrorClassInfo();

        // 类构造函数入口（供 new Error(...) 调用）
        if (isDebug) console.log("[Runtime:Error] generateClassError");
        this.generateClassError();
        if (isDebug) console.log("[Runtime:Error] generateClassTypeError");
        this.generateClassTypeError();
        if (isDebug) console.log("[Runtime:Error] generateClassReferenceError");
        this.generateClassReferenceError();
        if (isDebug) console.log("[Runtime:Error] generateClassSyntaxError");
        this.generateClassSyntaxError();
        if (isDebug) console.log("[Runtime:Error] generateClassRangeError");
        this.generateClassRangeError();

        if (isDebug) console.log("[Runtime:Error] generateErrorNew");
        this.generateErrorNew();
        if (isDebug) console.log("[Runtime:Error] generateErrorNewWithType");
        this.generateErrorNewWithType();
        if (isDebug) console.log("[Runtime:Error] generateErrorGetMessage");
        this.generateErrorGetMessage();
        if (isDebug) console.log("[Runtime:Error] generateErrorGetName");
        this.generateErrorGetName();
        if (isDebug) console.log("[Runtime:Error] generateErrorGetCause");
        this.generateErrorGetCause();
        if (isDebug) console.log("[Runtime:Error] generateErrorSetCause");
        this.generateErrorSetCause();
        if (isDebug) console.log("[Runtime:Error] generateErrorToString");
        this.generateErrorToString();
        if (isDebug) console.log("[Runtime:Error] generateErrorNewWithCause");
        this.generateErrorNewWithCause();

        // 生成各种 Error 类型的工厂函数
        if (isDebug) console.log("[Runtime:Error] generateTypeErrorNew");
        this.generateTypeErrorNew();
        if (isDebug) console.log("[Runtime:Error] generateReferenceErrorNew");
        this.generateReferenceErrorNew();
        if (isDebug) console.log("[Runtime:Error] generateSyntaxErrorNew");
        this.generateSyntaxErrorNew();
        if (isDebug) console.log("[Runtime:Error] generateRangeErrorNew");
        this.generateRangeErrorNew();
        if (isDebug) console.log("[Runtime:Error] generateEvalErrorNew");
        this.generateEvalErrorNew();
        if (isDebug) console.log("[Runtime:Error] generateURIErrorNew");
        this.generateURIErrorNew();

        // 调用栈管理
        if (isDebug) console.log("[Runtime:Error] generateStackPush");
        this.generateStackPush();
        if (isDebug) console.log("[Runtime:Error] generateStackPop");
        this.generateStackPop();
        if (isDebug) console.log("[Runtime:Error] generateStackCapture");
        this.generateStackCapture();

        // 异常处理
        if (isDebug) console.log("[Runtime:Error] generateExceptionPush");
        this.generateExceptionPush();
        if (isDebug) console.log("[Runtime:Error] generateExceptionPop");
        this.generateExceptionPop();
        if (isDebug) console.log("[Runtime:Error] generateExceptionThrow");
        this.generateExceptionThrow();
    }

    // _init_error_class_info() - 初始化 Error 类信息对象
    // 必须在程序启动时调用，供继承 Error 的类使用
    generateInitErrorClassInfo() {
        const vm = this.vm;

        vm.label("_init_error_class_info");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        // 分配类信息对象 (24 bytes: type + constructor + prototype)
        vm.movImm(VReg.A0, 24);
        vm.call("_alloc");
        vm.mov(VReg.S0, VReg.RET); // S0 = 类信息对象

        // 设置 type = TYPE_CLOSURE (3)
        vm.movImm(VReg.V0, 3);
        vm.store(VReg.S0, 0, VReg.V0);

        // 设置 constructor = _class_Error 函数地址
        vm.lea(VReg.V0, "_class_Error");
        vm.store(VReg.S0, 8, VReg.V0);

        // 分配 prototype 对象 (24 bytes: type + length + __proto__)
        vm.movImm(VReg.A0, 24);
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET); // S1 = prototype

        // 设置 prototype type = TYPE_OBJECT (2)
        vm.movImm(VReg.V0, 2);
        vm.store(VReg.S1, 0, VReg.V0);
        // length = 0
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S1, 8, VReg.V0);
        // __proto__ = 0 (null/Object.prototype)
        vm.store(VReg.S1, 16, VReg.V0);

        // 设置 prototype 地址到类信息
        vm.store(VReg.S0, 16, VReg.S1);

        // 将类信息对象地址存储到全局槽
        vm.lea(VReg.V0, "_class_info_Error");
        vm.store(VReg.V0, 0, VReg.S0);

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    // _class_Error(this, message) -> Error 对象
    // new Error(message) 的构造函数入口
    // 注意：this (A0) 是编译器预分配的对象，但我们忽略它，自己创建 Error 对象
    generateClassError() {
        const vm = this.vm;

        vm.label("_class_Error");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0); // S0 = this（保存但不使用）
        vm.mov(VReg.A0, VReg.A1); // A0 = message 参数
        vm.call("_error_new");
        // RET = 新创建的 Error 对象

        vm.epilogue([VReg.S0], 0);
    }

    // _class_TypeError(this, message) -> TypeError 对象
    generateClassTypeError() {
        const vm = this.vm;

        vm.label("_class_TypeError");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.A1);
        vm.call("_typeerror_new");

        vm.epilogue([VReg.S0], 0);
    }

    // _class_ReferenceError(this, message) -> ReferenceError 对象
    generateClassReferenceError() {
        const vm = this.vm;

        vm.label("_class_ReferenceError");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.A1);
        vm.call("_referenceerror_new");

        vm.epilogue([VReg.S0], 0);
    }

    // _class_SyntaxError(this, message) -> SyntaxError 对象
    generateClassSyntaxError() {
        const vm = this.vm;

        vm.label("_class_SyntaxError");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.A1);
        vm.call("_syntaxerror_new");

        vm.epilogue([VReg.S0], 0);
    }

    // _class_RangeError(this, message) -> RangeError 对象
    generateClassRangeError() {
        const vm = this.vm;

        vm.label("_class_RangeError");
        vm.prologue(0, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.A1);
        vm.call("_rangeerror_new");

        vm.epilogue([VReg.S0], 0);
    }

    // _stack_push(name_ptr) -> void
    // 将函数名压入调用栈
    generateStackPush() {
        const vm = this.vm;

        vm.label("_stack_push");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // S0 = name_ptr

        // 获取当前栈顶索引
        vm.lea(VReg.S1, "_call_stack_top");
        vm.load(VReg.V0, VReg.S1, 0);

        // 检查是否超出最大深度 (64)
        vm.cmpImm(VReg.V0, 64);
        vm.jge("_stack_push_done");

        // 计算栈槽位置: _call_stack + index * 8
        vm.shlImm(VReg.V1, VReg.V0, 3); // V1 = index * 8
        vm.lea(VReg.V2, "_call_stack");
        vm.add(VReg.V2, VReg.V2, VReg.V1); // V2 = &_call_stack[index]

        // 存储函数名指针
        vm.store(VReg.V2, 0, VReg.S0);

        // 增加栈顶索引
        vm.addImm(VReg.V0, VReg.V0, 1);
        vm.store(VReg.S1, 0, VReg.V0);

        vm.label("_stack_push_done");
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // _stack_pop() -> void
    // 弹出调用栈顶
    generateStackPop() {
        const vm = this.vm;

        vm.label("_stack_pop");
        vm.prologue(0, [VReg.S0]);

        // 获取当前栈顶索引
        vm.lea(VReg.S0, "_call_stack_top");
        vm.load(VReg.V0, VReg.S0, 0);

        // 检查是否已空
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_stack_pop_done");

        // 减少栈顶索引
        vm.subImm(VReg.V0, VReg.V0, 1);
        vm.store(VReg.S0, 0, VReg.V0);

        vm.label("_stack_pop_done");
        vm.epilogue([VReg.S0], 0);
    }

    // _stack_capture() -> 字符串 (stack trace)
    // 捕获当前调用栈并格式化为字符串（纯 char* 格式）
    generateStackCapture() {
        const vm = this.vm;

        vm.label("_stack_capture");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        // 分配结果字符串缓冲区（纯 char*，无头部）
        vm.movImm(VReg.A0, 1024);
        vm.call("_alloc");
        vm.mov(VReg.S0, VReg.RET); // S0 = 结果字符串

        // S1 = 写入位置（直接从开始）
        vm.mov(VReg.S1, VReg.S0);

        // 获取栈顶索引
        vm.lea(VReg.S2, "_call_stack_top");
        vm.load(VReg.S2, VReg.S2, 0); // S2 = 栈深度

        // 从栈顶开始遍历 (逆序)
        vm.subImm(VReg.S3, VReg.S2, 1); // S3 = 当前索引

        vm.label("_stack_capture_loop");
        vm.cmpImm(VReg.S3, 0);
        vm.jlt("_stack_capture_done");

        // 写入 "    at "
        vm.lea(VReg.A0, "_str_at");
        vm.call("_getStrContent");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strcpy");
        // 更新写入位置
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_raw_strlen");
        vm.add(VReg.S1, VReg.S1, VReg.RET);

        // 获取函数名
        vm.shlImm(VReg.V0, VReg.S3, 3);
        vm.lea(VReg.V1, "_call_stack");
        vm.add(VReg.V0, VReg.V1, VReg.V0);
        vm.load(VReg.V0, VReg.V0, 0); // V0 = 函数名指针

        // 复制函数名
        vm.mov(VReg.A0, VReg.V0);
        vm.call("_getStrContent");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_strcpy");
        // 更新写入位置
        vm.mov(VReg.A0, VReg.S1);
        vm.call("_raw_strlen");
        vm.add(VReg.S1, VReg.S1, VReg.RET);

        // 写入换行符
        vm.movImm(VReg.V0, 10); // '\n'
        vm.storeByte(VReg.S1, 0, VReg.V0);
        vm.addImm(VReg.S1, VReg.S1, 1);

        // 下一个
        vm.subImm(VReg.S3, VReg.S3, 1);
        vm.jmp("_stack_capture_loop");

        vm.label("_stack_capture_done");
        // 写入 null 终止符
        vm.movImm(VReg.V0, 0);
        vm.storeByte(VReg.S1, 0, VReg.V0);

        // 纯 char* 格式，直接返回
        vm.mov(VReg.RET, VReg.S0);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // _error_new(message) -> Error 对象
    // message 可以是字符串或 undefined
    generateErrorNew() {
        const vm = this.vm;

        vm.label("_error_new");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = message

        // 分配 Error 对象
        vm.movImm(VReg.A0, this.ERROR_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET); // S1 = Error 对象

        // 设置类型
        vm.movImm(VReg.V0, this.TYPE_ERROR);
        vm.store(VReg.S1, 0, VReg.V0);

        // 设置 message
        vm.store(VReg.S1, 8, VReg.S0);

        // 设置 name 为 "Error"
        vm.lea(VReg.V0, "_str_Error");
        vm.store(VReg.S1, 16, VReg.V0);

        // 捕获调用栈
        vm.call("_stack_capture");
        vm.store(VReg.S1, 24, VReg.RET);

        // cause 设为 undefined
        vm.lea(VReg.V0, "_js_undefined");
        vm.store(VReg.S1, 32, VReg.V0);

        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 16);
    }

    // _error_get_message(err) -> message 字符串
    generateErrorGetMessage() {
        const vm = this.vm;

        vm.label("_error_get_message");
        vm.prologue(0, []);
        vm.load(VReg.RET, VReg.A0, 8);
        vm.epilogue([], 0);
    }

    // _error_get_name(err) -> name 字符串
    generateErrorGetName() {
        const vm = this.vm;

        vm.label("_error_get_name");
        vm.prologue(0, []);
        vm.load(VReg.RET, VReg.A0, 16);
        vm.epilogue([], 0);
    }

    // _error_get_cause(err) -> cause 值
    generateErrorGetCause() {
        const vm = this.vm;

        vm.label("_error_get_cause");
        vm.prologue(0, []);
        vm.load(VReg.RET, VReg.A0, 32);
        vm.epilogue([], 0);
    }

    // _error_set_cause(err, cause) -> void
    generateErrorSetCause() {
        const vm = this.vm;

        vm.label("_error_set_cause");
        vm.prologue(0, []);
        vm.store(VReg.A0, 32, VReg.A1);
        vm.epilogue([], 0);
    }

    // _error_new_with_type(message, name_ptr) -> Error 对象
    // 通用的带类型名的 Error 创建函数
    generateErrorNewWithType() {
        const vm = this.vm;

        vm.label("_error_new_with_type");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = message
        vm.mov(VReg.S2, VReg.A1); // S2 = name_ptr

        // 分配 Error 对象
        vm.movImm(VReg.A0, this.ERROR_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET); // S1 = Error 对象

        // 设置类型
        vm.movImm(VReg.V0, this.TYPE_ERROR);
        vm.store(VReg.S1, 0, VReg.V0);

        // 设置 message
        vm.store(VReg.S1, 8, VReg.S0);

        // 设置 name
        vm.store(VReg.S1, 16, VReg.S2);

        // 捕获调用栈
        vm.call("_stack_capture");
        vm.store(VReg.S1, 24, VReg.RET);

        // cause 设为 undefined
        vm.lea(VReg.V0, "_js_undefined");
        vm.store(VReg.S1, 32, VReg.V0);

        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 16);
    }

    // _error_new_with_cause(message, cause) -> Error 对象
    // 创建带 cause 的 Error 对象
    generateErrorNewWithCause() {
        const vm = this.vm;

        vm.label("_error_new_with_cause");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = message
        vm.mov(VReg.S2, VReg.A1); // S2 = cause

        // 分配 Error 对象
        vm.movImm(VReg.A0, this.ERROR_SIZE);
        vm.call("_alloc");
        vm.mov(VReg.S1, VReg.RET); // S1 = Error 对象

        // 设置类型
        vm.movImm(VReg.V0, this.TYPE_ERROR);
        vm.store(VReg.S1, 0, VReg.V0);

        // 设置 message
        vm.store(VReg.S1, 8, VReg.S0);

        // 设置 name 为 "Error"
        vm.lea(VReg.V0, "_str_Error");
        vm.store(VReg.S1, 16, VReg.V0);

        // stack 设为 undefined
        vm.lea(VReg.V0, "_js_undefined");
        vm.store(VReg.S1, 24, VReg.V0);

        // 设置 cause
        vm.store(VReg.S1, 32, VReg.S2);

        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 16);
    }

    // TypeError 工厂函数
    generateTypeErrorNew() {
        const vm = this.vm;
        vm.label("_typeerror_new");
        vm.prologue(0, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.S0);
        vm.lea(VReg.A1, "_str_TypeError");
        vm.call("_error_new_with_type");
        vm.epilogue([VReg.S0], 0);
    }

    // ReferenceError 工厂函数
    generateReferenceErrorNew() {
        const vm = this.vm;
        vm.label("_referenceerror_new");
        vm.prologue(0, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.S0);
        vm.lea(VReg.A1, "_str_ReferenceError");
        vm.call("_error_new_with_type");
        vm.epilogue([VReg.S0], 0);
    }

    // SyntaxError 工厂函数
    generateSyntaxErrorNew() {
        const vm = this.vm;
        vm.label("_syntaxerror_new");
        vm.prologue(0, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.S0);
        vm.lea(VReg.A1, "_str_SyntaxError");
        vm.call("_error_new_with_type");
        vm.epilogue([VReg.S0], 0);
    }

    // RangeError 工厂函数
    generateRangeErrorNew() {
        const vm = this.vm;
        vm.label("_rangeerror_new");
        vm.prologue(0, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.S0);
        vm.lea(VReg.A1, "_str_RangeError");
        vm.call("_error_new_with_type");
        vm.epilogue([VReg.S0], 0);
    }

    // EvalError 工厂函数
    generateEvalErrorNew() {
        const vm = this.vm;
        vm.label("_evalerror_new");
        vm.prologue(0, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.S0);
        vm.lea(VReg.A1, "_str_EvalError");
        vm.call("_error_new_with_type");
        vm.epilogue([VReg.S0], 0);
    }

    // URIError 工厂函数
    generateURIErrorNew() {
        const vm = this.vm;
        vm.label("_urierror_new");
        vm.prologue(0, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.A0, VReg.S0);
        vm.lea(VReg.A1, "_str_URIError");
        vm.call("_error_new_with_type");
        vm.epilogue([VReg.S0], 0);
    }

    // _error_to_string(err) -> "Error: message" 字符串
    generateErrorToString() {
        const vm = this.vm;
        const debug = typeof globalThis !== "undefined" && globalThis.DEBUG_RUNTIME;
        const envDebug = typeof process !== "undefined" && process.env && process.env.DEBUG_RUNTIME;
        const isDebug = debug || envDebug;

        if (isDebug) console.log("[Runtime:Error] _error_to_string start");
        vm.label("_error_to_string");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // S0 = Error 对象

        // 获取 name 和 message
        vm.load(VReg.S1, VReg.S0, 16); // name
        vm.load(VReg.S2, VReg.S0, 8); // message

        // 检查 message 是否为 undefined
        if (isDebug) console.log("[Runtime:Error] _error_to_string check message");
        vm.lea(VReg.V0, "_js_undefined");
        vm.cmp(VReg.S2, VReg.V0);
        vm.jeq("_error_to_string_no_msg");

        // 有 message: 返回 "name: message"
        vm.mov(VReg.A0, VReg.S1); // name

        // 连接 name + ": "
        if (isDebug) console.log("[Runtime:Error] _error_to_string concat name");
        vm.lea(VReg.A1, "_str_colon_space");
        vm.call("_strconcat");

        // 连接结果 + message
        if (isDebug) console.log("[Runtime:Error] _error_to_string concat message");
        vm.mov(VReg.A0, VReg.RET);
        vm.mov(VReg.A1, VReg.S2);
        vm.call("_strconcat");
        vm.jmp("_error_to_string_done");

        vm.label("_error_to_string_no_msg");
        // 无 message: 只返回 name
        vm.mov(VReg.RET, VReg.S1);

        vm.label("_error_to_string_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 16);
    }

    // _exception_push(catch_addr, sp, fp) -> void
    // 将异常处理器压入栈
    // 异常处理器栈布局: [catch_addr:8][sp:8][fp:8] = 24 字节/条目
    generateExceptionPush() {
        const vm = this.vm;

        vm.label("_exception_push");
        vm.prologue(0, [VReg.S0, VReg.S1]);

        // 获取当前栈顶索引
        vm.lea(VReg.S0, "_exception_stack_top");
        vm.load(VReg.S1, VReg.S0, 0);

        // 检查是否超出最大深度 (32)
        vm.cmpImm(VReg.S1, 32);
        vm.jge("_exception_push_done");

        // 计算槽位位置: _exception_stack + index * 24
        vm.movImm(VReg.V0, 24);
        vm.mul(VReg.V1, VReg.S1, VReg.V0); // V1 = index * 24
        vm.lea(VReg.V2, "_exception_stack");
        vm.add(VReg.V2, VReg.V2, VReg.V1); // V2 = &_exception_stack[index]

        // 存储 catch 地址
        vm.store(VReg.V2, 0, VReg.A0);
        // 存储 SP
        vm.store(VReg.V2, 8, VReg.A1);
        // 存储 FP
        vm.store(VReg.V2, 16, VReg.A2);

        // 增加栈顶索引
        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.store(VReg.S0, 0, VReg.S1);

        vm.label("_exception_push_done");
        vm.epilogue([VReg.S0, VReg.S1], 0);
    }

    // _exception_pop() -> void
    // 弹出异常处理器（正常退出 try 块时调用）
    generateExceptionPop() {
        const vm = this.vm;

        vm.label("_exception_pop");
        vm.prologue(0, [VReg.S0]);

        vm.lea(VReg.S0, "_exception_stack_top");
        vm.load(VReg.V0, VReg.S0, 0);

        // 检查是否已空
        vm.cmpImm(VReg.V0, 0);
        vm.jeq("_exception_pop_done");

        // 减少栈顶索引
        vm.subImm(VReg.V0, VReg.V0, 1);
        vm.store(VReg.S0, 0, VReg.V0);

        vm.label("_exception_pop_done");
        vm.epilogue([VReg.S0], 0);
    }

    // _exception_throw(error) -> noreturn
    // 抛出异常：恢复上下文并跳转到 catch
    // 如果没有处理器，则退出程序
    generateExceptionThrow() {
        const vm = this.vm;

        vm.label("_exception_throw");
        // 不需要 prologue，因为我们会恢复栈

        // 保存异常对象到全局变量
        vm.lea(VReg.V0, "_current_exception");
        vm.store(VReg.V0, 0, VReg.A0);

        // 获取栈顶索引
        vm.lea(VReg.V0, "_exception_stack_top");
        vm.load(VReg.V1, VReg.V0, 0);

        // 检查是否有处理器
        vm.cmpImm(VReg.V1, 0);
        vm.jeq("_exception_throw_unhandled");

        // 减少索引
        vm.subImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.V0, 0, VReg.V1);

        // 计算槽位位置
        vm.movImm(VReg.V0, 24);
        vm.mul(VReg.V2, VReg.V1, VReg.V0);
        vm.lea(VReg.V3, "_exception_stack");
        vm.add(VReg.V2, VReg.V3, VReg.V2);

        // 加载 catch 地址、SP、FP
        vm.load(VReg.V0, VReg.V2, 0); // catch_addr
        vm.load(VReg.V1, VReg.V2, 8); // sp
        vm.load(VReg.V3, VReg.V2, 16); // fp

        // 恢复 SP 和 FP
        vm.mov(VReg.SP, VReg.V1);
        vm.mov(VReg.FP, VReg.V3);

        // 跳转到 catch 块（间接跳转）
        vm.jmpIndirect(VReg.V0);

        // 未处理异常处理函数（可由编译器直接调用）
        vm.label("_exception_throw_unhandled");
        // 打印 "Uncaught " + error
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0); // 保存异常对象

        vm.lea(VReg.A0, "_str_uncaught");
        vm.call("_print_value");

        vm.mov(VReg.A0, VReg.S0);
        vm.call("_print_value"); // 直接打印异常对象

        // 打印换行
        vm.lea(VReg.A0, "_str_newline");
        vm.call("_print_value");

        // 退出
        vm.movImm(VReg.A0, 1);
        vm.syscall(1); // exit(1) - macOS
    }

    // 生成数据段
    generateDataSection(asm) {
        // 辅助函数：添加静态字符串（纯 char* 格式，无头部）
        // REFACTOR: Use loop to avoid closure capture issues in self-hosted compiler
        const errorStrings = [
            ["_str_Error", "Error"],
            ["_str_TypeError", "TypeError"],
            ["_str_ReferenceError", "ReferenceError"],
            ["_str_SyntaxError", "SyntaxError"],
            ["_str_RangeError", "RangeError"],
            ["_str_EvalError", "EvalError"],
            ["_str_URIError", "URIError"],
            ["_str_colon_space", ": "],
            ["_str_at", "    at "],
            ["_str_newline", "\n"],
            ["_str_anonymous", "<anonymous>"],
            ["_str_message", "message"],
            ["_str_name", "name"],
            ["_str_stack", "stack"],
            ["_str_cause", "cause"],
            ["_str_uncaught", "Uncaught "],
        ];

        for (let i = 0; i < errorStrings.length; i++) {
            const entry = errorStrings[i];
            const label = entry[0];
            const str = entry[1];
            asm.addDataLabel(label);
            for (let j = 0; j < str.length; j++) {
                asm.addDataByte(str.charCodeAt(j));
            }
            asm.addDataByte(0);
        }

        // Error 类型名称字符串
        // (Moved to errorStrings array)

        // ": " 分隔符
        // (Moved to errorStrings array)

        // 堆栈相关字符串
        // (Moved to errorStrings array)

        // Error 属性名字符串 (用于 _object_get 访问 Error 属性)
        // (Moved to errorStrings array)

        // 调用栈数据结构
        // _call_stack_top: 当前栈顶索引 (8 字节)
        asm.addDataLabel("_call_stack_top");
        for (let i = 0; i < 8; i++) {
            asm.addDataByte(0);
        }

        // _call_stack: 函数名指针数组 (64 个槽位 * 8 字节 = 512 字节)
        asm.addDataLabel("_call_stack");
        for (let i = 0; i < 64 * 8; i++) {
            asm.addDataByte(0);
        }

        // 异常处理器栈
        // _exception_stack_top: 当前栈顶索引 (8 字节)
        asm.addDataLabel("_exception_stack_top");
        for (let i = 0; i < 8; i++) {
            asm.addDataByte(0);
        }

        // _exception_stack: 异常处理器数组 (32 条目 * 24 字节 = 768 字节)
        // 每条目: [catch_addr:8][sp:8][fp:8]
        asm.addDataLabel("_exception_stack");
        for (let i = 0; i < 32 * 24; i++) {
            asm.addDataByte(0);
        }

        // _current_exception: 当前异常对象指针 (8 字节)
        asm.addDataLabel("_current_exception");
        for (let i = 0; i < 8; i++) {
            asm.addDataByte(0);
        }

        // "Uncaught " 字符串
        // (Moved to errorStrings array)

        // Error 类信息对象的全局槽位
        // 在 _init_error_class_info 中初始化
        asm.addDataLabel("_class_info_Error");
        // aligned 8
        {
            const misalign = asm.data.length & 7;
            if (misalign !== 0) {
                const pad = 8 - misalign;
                for (let i = 0; i < pad; i++) asm.addDataByte(0);
            }
        }
        for (let i = 0; i < 8; i++) asm.addDataByte(0);
    }
}
