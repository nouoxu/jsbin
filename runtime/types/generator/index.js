// JSBin Generator 实现
// 支持 ES6 Generator Protocol (function*, yield, yield*)

import { VReg } from "../../../vm/index.js";
import { TYPE_ITERATOR } from "../../core/types.js";

/**
 * Generator 对象布局:
 * +0:  type (8 bytes) = TYPE_GENERATOR (9)
 * +8:  state (8 bytes) - 状态: 0=suspended_start, 1=suspended_yield, 2=executing, 3=completed
 * +16: func_ptr (8 bytes) - Generator 函数指针
 * +24: context (8 bytes) - 保存的执行上下文（栈帧）
 * +32: stack_base (8 bytes) - 私有栈基址
 * +40: stack_size (8 bytes) - 栈大小
 * +48: saved_sp (8 bytes) - 保存的栈指针
 * +56: saved_fp (8 bytes) - 保存的帧指针
 * +64: saved_lr (8 bytes) - 保存的返回地址 (yield 后的恢复点)
 * +72: yield_value (8 bytes) - 当前 yield 的值
 * +80: next_value (8 bytes) - next() 传入的值
 * +88: closure_ptr (8 bytes) - 闭包指针（如有）
 * +96: resume_point (8 bytes) - 恢复执行点索引（用于状态机）
 * +104: locals_count (8 bytes) - 局部变量数量
 * +112: locals[] - 局部变量存储区
 *
 * Generator 状态:
 * - 0 (SUSPENDED_START): 刚创建，未执行
 * - 1 (SUSPENDED_YIELD): yield 暂停
 * - 2 (EXECUTING): 正在执行
 * - 3 (COMPLETED): 已完成（return 或抛出异常）
 */

// Generator 状态常量
const GEN_STATE_SUSPENDED_START = 0;
const GEN_STATE_SUSPENDED_YIELD = 1;
const GEN_STATE_EXECUTING = 2;
const GEN_STATE_COMPLETED = 3;

// Generator 类型常量
const TYPE_GENERATOR = 9;

// Generator 对象大小（不含 locals）
const GENERATOR_BASE_SIZE = 112;

// Generator 私有栈大小
const GENERATOR_STACK_SIZE = 32768; // 32KB

export class GeneratorGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateGeneratorCreate();
        this.generateGeneratorNext();
        this.generateGeneratorReturn();
        this.generateGeneratorThrow();
        this.generateGeneratorIterator();
        this.generateYieldImpl();
        this.generateGeneratorResume();
    }

    /**
     * 创建 Generator 对象
     * A0 = func_ptr (generator 函数指针)
     * A1 = closure_ptr (闭包指针，可为 0)
     * A2 = locals_count (局部变量数量)
     * RET = Generator 对象指针
     */
    generateGeneratorCreate() {
        const vm = this.vm;

        vm.label("_generator_create");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // func_ptr
        vm.mov(VReg.S1, VReg.A1); // closure_ptr
        vm.mov(VReg.S2, VReg.A2); // locals_count

        // 计算总大小: base + locals_count * 8
        vm.movImm(VReg.V0, GENERATOR_BASE_SIZE);
        vm.shlImm(VReg.V1, VReg.S2, 3); // locals_count * 8
        vm.add(VReg.A0, VReg.V0, VReg.V1);
        vm.call("_alloc");
        vm.mov(VReg.S3, VReg.RET); // S3 = generator 对象

        // 设置 type = TYPE_GENERATOR
        vm.movImm(VReg.V0, TYPE_GENERATOR);
        vm.store(VReg.S3, 0, VReg.V0);

        // 设置 state = SUSPENDED_START
        vm.movImm(VReg.V0, GEN_STATE_SUSPENDED_START);
        vm.store(VReg.S3, 8, VReg.V0);

        // 设置 func_ptr
        vm.store(VReg.S3, 16, VReg.S0);

        // context = 0 (初始无上下文)
        vm.movImm(VReg.V0, 0);
        vm.store(VReg.S3, 24, VReg.V0);

        // 分配私有栈
        vm.movImm(VReg.A0, GENERATOR_STACK_SIZE);
        vm.call("_alloc");
        vm.store(VReg.S3, 32, VReg.RET); // stack_base

        // 设置 stack_size
        vm.movImm(VReg.V0, GENERATOR_STACK_SIZE);
        vm.store(VReg.S3, 40, VReg.V0);

        // 初始化 saved_sp = stack_base + stack_size - 16 (对齐)
        vm.load(VReg.V0, VReg.S3, 32); // stack_base
        vm.addImm(VReg.V0, VReg.V0, GENERATOR_STACK_SIZE - 16);
        vm.store(VReg.S3, 48, VReg.V0);

        // saved_fp = saved_sp
        vm.store(VReg.S3, 56, VReg.V0);

        // saved_lr = 0 (初始无返回地址)
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

        // 初始化 locals 为 undefined
        vm.movImm(VReg.S4, 0); // 计数器
        const loopStart = "_gen_create_init_loop";
        const loopEnd = "_gen_create_init_done";

        vm.label(loopStart);
        vm.cmp(VReg.S4, VReg.S2);
        vm.jge(loopEnd);

        // locals[i] = undefined
        vm.shlImm(VReg.V0, VReg.S4, 3); // i * 8
        vm.addImm(VReg.V0, VReg.V0, GENERATOR_BASE_SIZE);
        vm.add(VReg.V1, VReg.S3, VReg.V0);
        vm.lea(VReg.V2, "_js_undefined");
        vm.load(VReg.V2, VReg.V2, 0);
        vm.store(VReg.V1, 0, VReg.V2);

        vm.addImm(VReg.S4, VReg.S4, 1);
        vm.jmp(loopStart);

        vm.label(loopEnd);

        // 返回 generator 对象
        vm.mov(VReg.RET, VReg.S3);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    /**
     * Generator.prototype.next(value)
     * A0 = generator 对象
     * A1 = value (传给 yield 的值)
     * RET = { value, done }
     */
    generateGeneratorNext() {
        const vm = this.vm;

        vm.label("_generator_next");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // generator
        vm.mov(VReg.S1, VReg.A1); // value

        // 检查状态 - 首先加载到 S2 (callee-saved) 以保留原始状态
        vm.load(VReg.S2, VReg.S0, 8); // state

        // 如果已完成，返回 { value: undefined, done: true }
        vm.cmpImm(VReg.S2, GEN_STATE_COMPLETED);
        vm.jeq("_generator_next_completed");

        // 如果正在执行，抛出错误
        vm.cmpImm(VReg.S2, GEN_STATE_EXECUTING);
        vm.jeq("_generator_next_executing_error");

        // 保存 next_value
        vm.store(VReg.S0, 80, VReg.S1);

        // 设置状态为 EXECUTING
        vm.movImm(VReg.V0, GEN_STATE_EXECUTING);
        vm.store(VReg.S0, 8, VReg.V0);

        // 调用 resume，传递原始状态作为第二个参数
        vm.mov(VReg.A0, VReg.S0); // generator
        vm.mov(VReg.A1, VReg.S2); // original state
        vm.call("_generator_resume");
        // RET = { value, done }

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // 已完成分支
        vm.label("_generator_next_completed");
        vm.lea(VReg.A0, "_js_undefined");
        vm.load(VReg.A0, VReg.A0, 0);
        vm.movImm(VReg.A1, 1); // done = true
        vm.call("_iterator_result");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);

        // 正在执行错误
        vm.label("_generator_next_executing_error");
        // 简单处理：返回 undefined
        vm.lea(VReg.A0, "_js_undefined");
        vm.load(VReg.A0, VReg.A0, 0);
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * Generator.prototype.return(value)
     * A0 = generator 对象
     * A1 = value
     * RET = { value, done: true }
     */
    generateGeneratorReturn() {
        const vm = this.vm;

        vm.label("_generator_return");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0); // generator
        vm.mov(VReg.S1, VReg.A1); // value

        // 设置状态为 COMPLETED
        vm.movImm(VReg.V0, GEN_STATE_COMPLETED);
        vm.store(VReg.S0, 8, VReg.V0);

        // 返回 { value, done: true }
        vm.mov(VReg.A0, VReg.S1);
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    /**
     * Generator.prototype.throw(exception)
     * A0 = generator 对象
     * A1 = exception
     * 抛出异常或返回 { value, done: true }
     */
    generateGeneratorThrow() {
        const vm = this.vm;

        vm.label("_generator_throw");
        vm.prologue(16, [VReg.S0, VReg.S1]);

        vm.mov(VReg.S0, VReg.A0);
        vm.mov(VReg.S1, VReg.A1);

        // 简化实现：设置为完成状态
        vm.movImm(VReg.V0, GEN_STATE_COMPLETED);
        vm.store(VReg.S0, 8, VReg.V0);

        // 返回 { value: undefined, done: true }
        vm.lea(VReg.A0, "_js_undefined");
        vm.load(VReg.A0, VReg.A0, 0);
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");

        vm.epilogue([VReg.S0, VReg.S1], 16);
    }

    /**
     * Generator[Symbol.iterator]() - 返回自身
     * A0 = generator 对象
     * RET = generator 对象
     */
    generateGeneratorIterator() {
        const vm = this.vm;

        vm.label("_generator_iterator");
        vm.mov(VReg.RET, VReg.A0);
        vm.ret();
    }

    /**
     * yield 实现 - 状态机方法中不再需要
     * 保留为空函数以防有其他代码调用
     */
    generateYieldImpl() {
        const vm = this.vm;
        vm.label("_yield");
        // 状态机方法中 yield 由编译器内联处理
        // 这个函数保留为后备
        vm.mov(VReg.RET, VReg.A1);
        vm.ret();
    }

    /**
     * 恢复 Generator 执行 - 状态机方法
     * A0 = generator 对象
     * A1 = original state
     * RET = { value, done } 或 yield 返回的特殊值
     */
    generateGeneratorResume() {
        const vm = this.vm;

        vm.label("_generator_resume");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // generator
        vm.mov(VReg.S1, VReg.A1); // original state

        // 加载 resume_point
        vm.load(VReg.S2, VReg.S0, 96);

        // 如果是 SUSPENDED_START，resume_point 应该是 0
        // 如果是 SUSPENDED_YIELD，resume_point 是 yield 设置的值

        // 加载函数指针
        vm.load(VReg.S3, VReg.S0, 16);

        // 调用 generator body: A0 = generator, A1 = resume_point
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.S2);
        vm.callIndirect(VReg.S3);
        vm.mov(VReg.S4, VReg.RET); // 保存返回值

        // 检查返回值是否是特殊标记 (0xDEAD = yield)
        vm.movImm(VReg.V0, 0xdead);
        vm.cmp(VReg.S4, VReg.V0);
        vm.jeq("_generator_resume_yield_path");

        // 正常完成 (return) - 返回 { value: returnValue, done: true }
        // 状态已经在 generator body 中设置为 COMPLETED
        vm.mov(VReg.A0, VReg.S4);
        vm.movImm(VReg.A1, 1);
        vm.call("_iterator_result");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        // yield 路径 - 返回 { value: yield_value, done: false }
        vm.label("_generator_resume_yield_path");
        vm.load(VReg.A0, VReg.S0, 72); // yield_value
        vm.movImm(VReg.A1, 0);
        vm.call("_iterator_result");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }
}
