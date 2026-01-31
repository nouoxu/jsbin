// JSBin AsyncGenerator 实现
// 支持 ES2018 async function* 和 for await...of

import { VReg } from "../../../vm/index.js";
import { TYPE_GENERATOR } from "../../core/types.js";

/**
 * AsyncGenerator 对象布局 (扩展自 Generator):
 * +0:  type (8 bytes) = TYPE_ASYNC_GENERATOR (15)
 * +8:  state (8 bytes) - 状态
 * +16: func_ptr (8 bytes) - Generator 函数指针
 * +24: context (8 bytes) - 保存的执行上下文
 * +32: stack_base (8 bytes) - 私有栈基址
 * +40: stack_size (8 bytes) - 栈大小
 * +48: saved_sp (8 bytes) - 保存的栈指针
 * +56: saved_fp (8 bytes) - 保存的帧指针
 * +64: saved_lr (8 bytes) - 保存的返回地址
 * +72: yield_value (8 bytes) - 当前 yield 的值
 * +80: next_value (8 bytes) - next() 传入的值
 * +88: closure_ptr (8 bytes) - 闭包指针
 * +96: resume_point (8 bytes) - 恢复执行点索引
 * +104: locals_count (8 bytes) - 局部变量数量
 * +112: promise_queue (8 bytes) - 待处理的 Promise 队列
 * +120: locals[] - 局部变量存储区
 *
 * AsyncGenerator 状态:
 * - 0 (SUSPENDED_START): 刚创建
 * - 1 (SUSPENDED_YIELD): yield 暂停
 * - 2 (EXECUTING): 正在执行
 * - 3 (COMPLETED): 已完成
 * - 4 (AWAITING_RETURN): 等待 return
 */

// AsyncGenerator 类型常量
const TYPE_ASYNC_GENERATOR = 15;

// 状态常量
const ASYNC_GEN_STATE_SUSPENDED_START = 0;
const ASYNC_GEN_STATE_SUSPENDED_YIELD = 1;
const ASYNC_GEN_STATE_EXECUTING = 2;
const ASYNC_GEN_STATE_COMPLETED = 3;
const ASYNC_GEN_STATE_AWAITING_RETURN = 4;

// AsyncGenerator 对象大小（不含 locals）
const ASYNC_GENERATOR_BASE_SIZE = 128;

// 私有栈大小
const ASYNC_GENERATOR_STACK_SIZE = 32768;

export class AsyncGeneratorGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateAsyncGeneratorCreate();
        this.generateAsyncGeneratorNext();
        this.generateAsyncGeneratorReturn();
        this.generateAsyncGeneratorThrow();
        this.generateAsyncYieldImpl();
        this.generateForAwaitOf();
    }

    /**
     * 创建 AsyncGenerator 对象
     * A0 = func_ptr
     * A1 = closure_ptr
     * A2 = locals_count
     * RET = AsyncGenerator 对象指针
     */
    generateAsyncGeneratorCreate() {
        const vm = this.vm;

        vm.label("_async_generator_create");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // func_ptr
        vm.mov(VReg.S1, VReg.A1); // closure_ptr
        vm.mov(VReg.S2, VReg.A2); // locals_count

        // 计算总大小
        vm.movImm(VReg.V0, ASYNC_GENERATOR_BASE_SIZE);
        vm.shlImm(VReg.V1, VReg.S2, 3);
        vm.add(VReg.A0, VReg.V0, VReg.V1);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET);

        // 设置 type
        vm.movImm(VReg.V0, TYPE_ASYNC_GENERATOR);
        vm.store(VReg.S3, 0, VReg.V0);

        // 设置 state = SUSPENDED_START
        vm.movImm(VReg.V0, ASYNC_GEN_STATE_SUSPENDED_START);
        vm.store(VReg.S3, 8, VReg.V0);

        // 设置 func_ptr
        vm.store(VReg.S3, 16, VReg.S0);

        // context = 0
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S3, 24, VReg.V0);

        // 分配私有栈
        vm.movImm(VReg.A0, ASYNC_GENERATOR_STACK_SIZE);
        vm.call("_alloc");
        vm.store(VReg.S3, 32, VReg.RET);

        // stack_size
        vm.movImm(VReg.V0, ASYNC_GENERATOR_STACK_SIZE);
        vm.store(VReg.S3, 40, VReg.V0);

        // saved_sp
        vm.load(VReg.V0, VReg.S3, 32);
        vm.addImm(VReg.V0, VReg.V0, ASYNC_GENERATOR_STACK_SIZE - 16);
        vm.store(VReg.S3, 48, VReg.V0);

        // saved_fp
        vm.store(VReg.S3, 56, VReg.V0);

        // saved_lr = 0
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S3, 64, VReg.V0);

        // yield_value = undefined
        vm.lea(VReg.V0, "_js_undefined");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.store(VReg.S3, 72, VReg.V0);

        // next_value = undefined
        vm.store(VReg.S3, 80, VReg.V0);

        // closure_ptr
        vm.store(VReg.S3, 88, VReg.S1);

        // resume_point = 0
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S3, 96, VReg.V0);

        // locals_count
        vm.store(VReg.S3, 104, VReg.S2);

        // promise_queue = null
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S3, 112, VReg.V0);

        // 初始化 locals
        vm.movImm(VReg.S4, 0);
        const loopStart = "_async_gen_create_init_loop";
        const loopEnd = "_async_gen_create_init_done";

        vm.label(loopStart);
        vm.cmp(VReg.S4, VReg.S2);
        vm.jge(loopEnd);

        vm.shlImm(VReg.V0, VReg.S4, 3);
        vm.addImm(VReg.V0, VReg.V0, ASYNC_GENERATOR_BASE_SIZE);
        vm.add(VReg.V1, VReg.S3, VReg.V0);
        vm.lea(VReg.V2, "_js_undefined");
        vm.load(VReg.V2, VReg.V2, 0);
        vm.store(VReg.V1, 0, VReg.V2);

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp(loopStart);

        vm.label(loopEnd);

        vm.mov(VReg.RET, VReg.S3);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    /**
     * AsyncGenerator.prototype.next(value)
     * A0 = async_generator 对象
     * A1 = value
     * RET = Promise<{ value, done }>
     */
    generateAsyncGeneratorNext() {
        const vm = this.vm;

        vm.label("_async_generator_next");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // async_generator
        vm.mov(VReg.S1, VReg.A1); // value

        // 创建返回的 Promise
        vm.movImm(VReg.A0, 0);
        vm.call("_promise_new");
        vm.mov(VReg.S2, VReg.RET); // S2 = Promise

        // 检查状态
        vm.load(VReg.V0, VReg.S0, 8);

        // 如果已完成
        vm.cmpImm(VReg.V0, ASYNC_GEN_STATE_COMPLETED);
        vm.jeq("_async_generator_next_completed");

        // 保存 next_value
        vm.store(VReg.S0, 80, VReg.S1);

        // 设置状态为 EXECUTING
        vm.movImm(VReg.V0, ASYNC_GEN_STATE_EXECUTING);
        vm.store(VReg.S0, 8, VReg.V0);

        // 调用 generator body
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_generator_resume");

        // 检查结果状态
        vm.load(VReg.V0, VReg.S0, 8);
        vm.cmpImm(VReg.V0, ASYNC_GEN_STATE_COMPLETED);
        vm.jeq("_async_generator_next_resolve_done");

        // yield 结果: 创建 { value, done: false }
        vm.load(VReg.A0, VReg.S0, 72); // yield_value
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_promise_resolve");
        vm.jmp("_async_generator_next_return");

        // 完成分支
        vm.label("_async_generator_next_completed");
        vm.lea(VReg.A0, "_js_undefined");
        vm.load(VReg.A0, VReg.A0, 0);
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_promise_resolve");
        vm.jmp("_async_generator_next_return");

        // return 完成
        vm.label("_async_generator_next_resolve_done");
        vm.mov(VReg.A0, VReg.RET); // 返回值
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_promise_resolve");

        vm.label("_async_generator_next_return");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * AsyncGenerator.prototype.return(value)
     * A0 = async_generator
     * A1 = value
     * RET = Promise<{ value, done: true }>
     */
    generateAsyncGeneratorReturn() {
        const vm = this.vm;

        vm.label("_async_generator_return");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        // 创建 Promise
        vm.movImm(VReg.A0, 0);
        vm.call("_promise_new");
        vm.mov(VReg.S2, VReg.RET);

        // 设置状态为 COMPLETED
        vm.movImm(VReg.V0, ASYNC_GEN_STATE_COMPLETED);
        vm.store(VReg.S0, 8, VReg.V0);

        // resolve Promise with { value, done: true }
        vm.mov(VReg.A0, VReg.S1);
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");
        vm.mov(VReg.A1, VReg.RET);
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_promise_resolve");

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * AsyncGenerator.prototype.throw(exception)
     */
    generateAsyncGeneratorThrow() {
        const vm = this.vm;

        vm.label("_async_generator_throw");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        // 创建 Promise
        vm.movImm(VReg.A0, 0);
        vm.call("_promise_new");
        vm.mov(VReg.S2, VReg.RET);

        // 设置状态为 COMPLETED
        vm.movImm(VReg.V0, ASYNC_GEN_STATE_COMPLETED);
        vm.store(VReg.S0, 8, VReg.V0);

        // reject Promise
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S1);
        vm.call("_promise_reject");

        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * async yield 实现
     * A0 = async_generator
     * A1 = value (可能是 Promise)
     * RET = next() 传入的值
     */
    generateAsyncYieldImpl() {
        const vm = this.vm;

        vm.label("_async_yield");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // async_generator
        vm.mov(VReg.S1, VReg.A1); // value

        // 如果 value 是 Promise，等待它
        // 简化实现：直接存储值
        vm.store(VReg.S0, 72, VReg.S1);

        // 设置状态为 SUSPENDED_YIELD
        vm.movImm(VReg.V0, ASYNC_GEN_STATE_SUSPENDED_YIELD);
        vm.store(VReg.S0, 8, VReg.V0);

        // 返回 next_value
        vm.load(VReg.RET, VReg.S0, 80);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * for await...of 迭代器辅助函数
     * _for_await_of_init: 获取异步迭代器
     * _for_await_of_next: 获取下一个值
     */
    generateForAwaitOf() {
        const vm = this.vm;

        // 获取异步迭代器
        vm.label("_for_await_of_init");
        vm.prologue(16, [VReg.S0]);
        vm.mov(VReg.S0, VReg.A0);

        // 检查是否有 Symbol.asyncIterator
        // 简化：直接返回对象本身（假设它实现了 async 迭代器协议）
        vm.mov(VReg.RET, VReg.S0);

        vm.epilogue([VReg.S0], 16);

        // 获取下一个值并等待
        vm.label("_for_await_of_next");
        vm.prologue(32, [VReg.S0, VReg.S1]);
        vm.mov(VReg.S0, VReg.A0); // 迭代器

        // 调用 next()
        vm.mov(VReg.A0, VReg.S0);
        vm.lea(VReg.A1, "_js_undefined");
        vm.load(VReg.A1, VReg.A1, 0);
        vm.call("_async_generator_next");
        // RET = Promise

        // 返回 Promise
        vm.epilogue([VReg.S0, VReg.S1], 32);
    }
}
