// JSBin 编译器 - 分代垃圾回收器 (Generational GC)
//
// 分代 GC 的核心思想（基于弱分代假说）：
// 1. 大多数对象很快变得不可达（die young）
// 2. 老对象很少引用新对象
//
// 内存布局：
// [年轻代 (Young Generation)][老年代 (Old Generation)]
// |<--- Minor GC --->|      |<--- Major GC --->|
//
// 年轻代使用复制收集（Copying Collection）：
// - 分为 from-space 和 to-space
// - Minor GC 时将存活对象从 from-space 复制到 to-space
// - 复制后交换两个空间
// - 多次存活的对象晋升到老年代
//
// 老年代使用标记-清除（Mark-Sweep）：
// - Major GC 时标记所有可达对象
// - 清除未标记对象
//
// 对象头布局（16字节对齐）：
// +0:  flags_and_size (8 bytes)
//      bits 0-1:  gc_mark (WHITE/GRAY/BLACK/FORWARDED)
//      bits 2-5:  type
//      bits 6-9:  size_class
//      bits 10-13: age (对象年龄，0-15)
//      bits 16-63: size
// +8:  next/forward_ptr (8 bytes) - 空闲链表指针或转发指针

import { VReg } from "../../vm/index.js";

// ==================== 常量定义 ====================

// 分代配置
const YOUNG_GEN_SIZE = 256 * 1024; // 年轻代大小：256KB
const OLD_GEN_INITIAL_SIZE = 512 * 1024; // 老年代初始大小：512KB
const PROMOTION_THRESHOLD = 2; // 存活 N 次后晋升到老年代
const REMEMBERED_SET_SIZE = 4096; // 记忆集最大条目数
const ROOT_STACK_SIZE = 1024; // 根集合栈大小

// 对象头布局
const HEADER_SIZE = 16;
const HDR_FLAGS_SIZE = 0;
const HDR_NEXT = 8;

// flags_and_size 位域
const MARK_MASK = 0x3; // bits 0-1
const MARK_SHIFT = 0;
const TYPE_MASK = 0xf; // bits 2-5
const TYPE_SHIFT = 2;
const CLASS_MASK = 0xf; // bits 6-9
const CLASS_SHIFT = 6;
const AGE_MASK = 0xf; // bits 10-13
const AGE_SHIFT = 10;
const SIZE_SHIFT = 16;

// GC 标记状态
const GC_WHITE = 0; // 未标记（垃圾候选）
const GC_GRAY = 1; // 待处理（已发现但未遍历）
const GC_BLACK = 2; // 已处理（可达且已遍历）
const GC_FORWARDED = 3; // 已转发（复制收集用）

// 对象类型（用于 GC 遍历）
const TYPE_RAW = 0; // 原始数据，无引用
const TYPE_ARRAY = 1; // 数组，包含引用
const TYPE_OBJECT = 2; // 对象，包含引用
const TYPE_CLOSURE = 3; // 闭包，包含引用
const TYPE_MAP = 4;
const TYPE_SET = 5;
const TYPE_STRING = 6; // 字符串，无引用
const TYPE_PROMISE = 11;

// 堆元数据偏移
const META_HEAP_BASE = 0;
const META_HEAP_SIZE = 8;
const META_HEAP_USED = 16;
const META_GC_RUNNING = 24;
const META_FREE_LISTS = 32;
const META_LARGE_FREE = 176;
const META_GC_COUNT = 184;
const META_ALLOC_COUNT = 192;
// 分代 GC 扩展
const META_YOUNG_FROM = 200;
const META_YOUNG_TO = 208;
const META_YOUNG_PTR = 216;
const META_YOUNG_END = 224;
const META_OLD_START = 232;
const META_OLD_PTR = 240;
const META_OLD_END = 248;
const META_MINOR_GC_COUNT = 256;
const META_MAJOR_GC_COUNT = 264;

/**
 * 分代 GC 管理器
 */
export class GenerationalGCManager {
    constructor(compiler) {
        this.compiler = compiler;
    }

    /**
     * 生成 GC 相关的数据段
     */
    generateDataSection(asm) {
        // 年轻代 from-space 指针
        asm.addDataLabel("_young_from_space");
        asm.addDataQword(0);

        // 年轻代 to-space 指针
        asm.addDataLabel("_young_to_space");
        asm.addDataQword(0);

        // 年轻代分配指针
        asm.addDataLabel("_young_alloc_ptr");
        asm.addDataQword(0);

        // 年轻代结束位置
        asm.addDataLabel("_young_end");
        asm.addDataQword(0);

        // 老年代起始
        asm.addDataLabel("_old_start");
        asm.addDataQword(0);

        // 老年代分配指针
        asm.addDataLabel("_old_alloc_ptr");
        asm.addDataQword(0);

        // 老年代结束位置
        asm.addDataLabel("_old_end");
        asm.addDataQword(0);

        // 写屏障记录集（记忆集）- 预分配固定大小数组
        asm.addDataLabel("_remembered_set");
        for (let i = 0; i < REMEMBERED_SET_SIZE; i++) {
            asm.addDataQword(0);
        }

        // 记忆集当前大小
        asm.addDataLabel("_remembered_set_size");
        asm.addDataQword(0);

        // GC 工作栈（用于标记阶段的灰色对象队列）
        asm.addDataLabel("_gc_gray_stack");
        for (let i = 0; i < ROOT_STACK_SIZE; i++) {
            asm.addDataQword(0);
        }

        // GC 工作栈指针
        asm.addDataLabel("_gc_gray_stack_ptr");
        asm.addDataQword(0);

        // 根集合栈帧指针（用于扫描栈上的引用）
        asm.addDataLabel("_gc_stack_bottom");
        asm.addDataQword(0);

        // Minor/Major GC 计数
        asm.addDataLabel("_minor_gc_count");
        asm.addDataQword(0);

        asm.addDataLabel("_major_gc_count");
        asm.addDataQword(0);
    }
}

/**
 * 分代 GC 运行时生成器
 */
export class GenerationalGCRuntimeGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    /**
     * 生成所有 GC 相关的运行时函数
     */
    generate() {
        this.generateGCInit();
        this.generateYoungAlloc();
        this.generateOldAlloc();
        this.generateWriteBarrier();
        this.generateIsYoungObject();
        this.generateCopyObject();
        this.generateForwardObject();
        this.generateProcessReference();
        this.generateProcessObject();
        this.generateMinorGC();
        this.generateMarkObject();
        this.generateSweepOldGen();
        this.generateMajorGC();
    }

    /**
     * 生成 GC 初始化函数
     * 分配年轻代和老年代空间
     */
    generateGCInit() {
        const vm = this.vm;

        vm.label("_gc_init");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        // 保存栈底指针（用于扫描栈上的引用）
        vm.mov(VReg.V0, VReg.SP);
        vm.lea(VReg.V1, "_gc_stack_bottom");
        vm.store(VReg.V1, 0, VReg.V0);

        // 分配年轻代 from-space（使用现有堆分配）
        vm.movImm(VReg.A0, YOUNG_GEN_SIZE);
        vm.call("_bump_alloc");
        vm.mov(VReg.S0, VReg.RET);
        vm.lea(VReg.V0, "_young_from_space");
        vm.store(VReg.V0, 0, VReg.S0);

        // 分配年轻代 to-space
        vm.movImm(VReg.A0, YOUNG_GEN_SIZE);
        vm.call("_bump_alloc");
        vm.mov(VReg.S1, VReg.RET);
        vm.lea(VReg.V0, "_young_to_space");
        vm.store(VReg.V0, 0, VReg.S1);

        // 初始化年轻代分配指针
        vm.lea(VReg.V0, "_young_alloc_ptr");
        vm.store(VReg.V0, 0, VReg.S0);

        // 设置年轻代结束位置
        vm.addImm(VReg.V1, VReg.S0, YOUNG_GEN_SIZE);
        vm.lea(VReg.V0, "_young_end");
        vm.store(VReg.V0, 0, VReg.V1);

        // 分配老年代空间
        vm.movImm(VReg.A0, OLD_GEN_INITIAL_SIZE);
        vm.call("_bump_alloc");
        vm.mov(VReg.S2, VReg.RET);

        vm.lea(VReg.V0, "_old_start");
        vm.store(VReg.V0, 0, VReg.S2);

        vm.lea(VReg.V0, "_old_alloc_ptr");
        vm.store(VReg.V0, 0, VReg.S2);

        vm.addImm(VReg.V1, VReg.S2, OLD_GEN_INITIAL_SIZE);
        vm.lea(VReg.V0, "_old_end");
        vm.store(VReg.V0, 0, VReg.V1);

        // 初始化灰色栈指针
        vm.lea(VReg.V0, "_gc_gray_stack");
        vm.lea(VReg.V1, "_gc_gray_stack_ptr");
        vm.store(VReg.V1, 0, VReg.V0);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * 年轻代分配
     * _young_alloc(size) -> ptr
     */
    generateYoungAlloc() {
        const vm = this.vm;

        vm.label("_young_alloc");
        vm.prologue(16, [VReg.S0]);

        // 对齐大小到 16 字节（包含头部）
        vm.addImm(VReg.S0, VReg.A0, HEADER_SIZE + 15);
        vm.movImm(VReg.V1, -16);
        vm.and(VReg.S0, VReg.S0, VReg.V1);

        // 加载当前分配指针
        vm.lea(VReg.V0, "_young_alloc_ptr");
        vm.load(VReg.V1, VReg.V0, 0);

        // 计算新的分配指针
        vm.add(VReg.V2, VReg.V1, VReg.S0);

        // 检查是否超出年轻代
        vm.lea(VReg.V3, "_young_end");
        vm.load(VReg.V3, VReg.V3, 0);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jgt("_young_alloc_trigger_gc");

        // 有空间，更新分配指针
        vm.store(VReg.V0, 0, VReg.V2);

        // 初始化对象头（age=0, mark=WHITE）
        vm.movImm(VReg.V3, 0); // 清空 flags
        vm.store(VReg.V1, HDR_FLAGS_SIZE, VReg.V3);
        vm.store(VReg.V1, HDR_NEXT, VReg.V3);

        // 返回用户数据区地址
        vm.addImm(VReg.RET, VReg.V1, HEADER_SIZE);
        vm.epilogue([VReg.S0], 16);

        // 触发 Minor GC
        vm.label("_young_alloc_trigger_gc");
        vm.push(VReg.S0);
        vm.call("_minor_gc");
        vm.pop(VReg.S0);

        // 重试分配
        vm.lea(VReg.V0, "_young_alloc_ptr");
        vm.load(VReg.V1, VReg.V0, 0);
        vm.add(VReg.V2, VReg.V1, VReg.S0);

        // 再次检查空间
        vm.lea(VReg.V3, "_young_end");
        vm.load(VReg.V3, VReg.V3, 0);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jgt("_young_alloc_oom"); // 仍然不够，OOM

        vm.store(VReg.V0, 0, VReg.V2);
        vm.movImm(VReg.V3, 0);
        vm.store(VReg.V1, HDR_FLAGS_SIZE, VReg.V3);
        vm.store(VReg.V1, HDR_NEXT, VReg.V3);
        vm.addImm(VReg.RET, VReg.V1, HEADER_SIZE);
        vm.epilogue([VReg.S0], 16);

        // OOM 处理
        vm.label("_young_alloc_oom");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([VReg.S0], 16);
    }

    /**
     * 老年代分配
     * _old_alloc(size) -> ptr
     */
    generateOldAlloc() {
        const vm = this.vm;

        vm.label("_old_alloc");
        vm.prologue(16, [VReg.S0]);

        // 对齐大小
        vm.addImm(VReg.S0, VReg.A0, HEADER_SIZE + 15);
        vm.movImm(VReg.V1, -16);
        vm.and(VReg.S0, VReg.S0, VReg.V1);

        // 加载老年代分配指针
        vm.lea(VReg.V0, "_old_alloc_ptr");
        vm.load(VReg.V1, VReg.V0, 0);

        // 计算新指针
        vm.add(VReg.V2, VReg.V1, VReg.S0);

        // 检查空间
        vm.lea(VReg.V3, "_old_end");
        vm.load(VReg.V3, VReg.V3, 0);
        vm.cmp(VReg.V2, VReg.V3);
        vm.jgt("_old_alloc_trigger_gc");

        // 更新指针
        vm.store(VReg.V0, 0, VReg.V2);
        vm.movImm(VReg.V3, 0);
        vm.store(VReg.V1, HDR_FLAGS_SIZE, VReg.V3);
        vm.store(VReg.V1, HDR_NEXT, VReg.V3);
        vm.addImm(VReg.RET, VReg.V1, HEADER_SIZE);
        vm.epilogue([VReg.S0], 16);

        // 触发 Major GC
        vm.label("_old_alloc_trigger_gc");
        vm.push(VReg.S0);
        vm.call("_major_gc");
        vm.pop(VReg.S0);

        // 重试
        vm.lea(VReg.V0, "_old_alloc_ptr");
        vm.load(VReg.V1, VReg.V0, 0);
        vm.add(VReg.V2, VReg.V1, VReg.S0);
        vm.store(VReg.V0, 0, VReg.V2);
        vm.movImm(VReg.V3, 0);
        vm.store(VReg.V1, HDR_FLAGS_SIZE, VReg.V3);
        vm.store(VReg.V1, HDR_NEXT, VReg.V3);
        vm.addImm(VReg.RET, VReg.V1, HEADER_SIZE);
        vm.epilogue([VReg.S0], 16);
    }

    /**
     * 写屏障
     * _write_barrier(obj_addr, slot_addr, new_val)
     * 当向对象写入引用时调用
     */
    generateWriteBarrier() {
        const vm = this.vm;

        vm.label("_write_barrier");
        vm.prologue(16, [VReg.S0, VReg.S1, VReg.S2]);

        vm.mov(VReg.S0, VReg.A0); // obj_addr
        vm.mov(VReg.S1, VReg.A1); // slot_addr
        vm.mov(VReg.S2, VReg.A2); // new_val

        // 先执行写入
        vm.store(VReg.S1, 0, VReg.S2);

        // 检查 obj 是否在老年代
        vm.lea(VReg.V0, "_old_start");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_write_barrier_done");

        vm.lea(VReg.V0, "_old_end");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jge("_write_barrier_done");

        // 检查 new_val 是否是指针且在年轻代
        vm.mov(VReg.A0, VReg.S2);
        vm.call("_is_young_object");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_write_barrier_done");

        // 记录到记忆集
        vm.lea(VReg.V0, "_remembered_set_size");
        vm.load(VReg.V1, VReg.V0, 0);

        // 检查是否溢出
        vm.movImm(VReg.V2, REMEMBERED_SET_SIZE);
        vm.cmp(VReg.V1, VReg.V2);
        vm.jge("_write_barrier_done");

        // 记录 obj 地址
        vm.lea(VReg.V2, "_remembered_set");
        vm.shl(VReg.V3, VReg.V1, 3);
        vm.add(VReg.V2, VReg.V2, VReg.V3);
        vm.store(VReg.V2, 0, VReg.S0);

        // 增加计数
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.V0, 0, VReg.V1);

        vm.label("_write_barrier_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 16);
    }

    /**
     * 检查对象是否在年轻代
     * _is_young_object(ptr) -> 0/1
     */
    generateIsYoungObject() {
        const vm = this.vm;

        vm.label("_is_young_object");
        vm.prologue(0, []);

        // 检查是否是有效指针（非零，非 tagged 值）
        vm.cmpImm(VReg.A0, 0);
        vm.jeq("_is_young_false");

        // 检查是否在年轻代范围内
        vm.lea(VReg.V0, "_young_from_space");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.A0, VReg.V0);
        vm.jlt("_is_young_false");

        vm.lea(VReg.V0, "_young_end");
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.A0, VReg.V0);
        vm.jge("_is_young_false");

        vm.movImm(VReg.RET, 1);
        vm.epilogue([], 0);

        vm.label("_is_young_false");
        vm.movImm(VReg.RET, 0);
        vm.epilogue([], 0);
    }

    /**
     * 复制对象到 to-space 或老年代
     * _copy_object(obj_header_ptr, to_ptr) -> new_ptr, new_to_ptr in A1
     */
    generateCopyObject() {
        const vm = this.vm;

        vm.label("_copy_object");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // src header
        vm.mov(VReg.S1, VReg.A1); // dst ptr

        // 读取 flags_and_size
        vm.load(VReg.V0, VReg.S0, HDR_FLAGS_SIZE);

        // 提取对象大小
        vm.shr(VReg.S2, VReg.V0, SIZE_SHIFT); // user size
        vm.addImm(VReg.S2, VReg.S2, HEADER_SIZE); // total size

        // 对齐到 16 字节
        vm.addImm(VReg.S2, VReg.S2, 15);
        vm.movImm(VReg.V1, -16);
        vm.and(VReg.S2, VReg.S2, VReg.V1);

        // 提取并增加 age
        vm.shr(VReg.V1, VReg.V0, AGE_SHIFT);
        vm.movImm(VReg.V2, AGE_MASK);
        vm.and(VReg.S3, VReg.V1, VReg.V2); // current age
        vm.addImm(VReg.S3, VReg.S3, 1); // age++

        // 检查是否需要晋升到老年代
        vm.movImm(VReg.V1, PROMOTION_THRESHOLD);
        vm.cmp(VReg.S3, VReg.V1);
        vm.jge("_copy_object_promote");

        // 复制到 to-space
        vm.mov(VReg.A0, VReg.S1); // dst
        vm.mov(VReg.A1, VReg.S0); // src
        vm.mov(VReg.A2, VReg.S2); // size
        vm.call("_memcpy");

        // 更新新对象的 age
        vm.load(VReg.V0, VReg.S1, HDR_FLAGS_SIZE);
        // 清除旧 age，设置新 age
        vm.movImm(VReg.V1, ~(AGE_MASK << AGE_SHIFT));
        vm.and(VReg.V0, VReg.V0, VReg.V1);
        vm.shl(VReg.V1, VReg.S3, AGE_SHIFT);
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        vm.store(VReg.S1, HDR_FLAGS_SIZE, VReg.V0);

        // 返回新对象地址和更新后的 to_ptr
        vm.mov(VReg.RET, VReg.S1);
        vm.add(VReg.A1, VReg.S1, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);

        // 晋升到老年代
        vm.label("_copy_object_promote");
        // 直接分配到老年代
        vm.subImm(VReg.A0, VReg.S2, HEADER_SIZE); // user size
        vm.call("_old_alloc");
        vm.mov(VReg.S1, VReg.RET); // 新地址

        // 复制数据
        vm.subImm(VReg.V0, VReg.S1, HEADER_SIZE); // header addr
        vm.mov(VReg.A0, VReg.V0);
        vm.mov(VReg.A1, VReg.S0);
        vm.mov(VReg.A2, VReg.S2);
        vm.call("_memcpy");

        // 返回（to_ptr 不变）
        vm.mov(VReg.RET, VReg.V0); // header addr
        // A1 保持原 to_ptr
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    /**
     * 转发对象（设置转发指针）
     * _forward_object(old_header, new_header)
     */
    generateForwardObject() {
        const vm = this.vm;

        vm.label("_forward_object");
        vm.prologue(0, []);

        // 在旧对象头设置 FORWARDED 标记
        vm.load(VReg.V0, VReg.A0, HDR_FLAGS_SIZE);
        vm.movImm(VReg.V1, ~MARK_MASK);
        vm.and(VReg.V0, VReg.V0, VReg.V1);
        vm.movImm(VReg.V1, GC_FORWARDED);
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        vm.store(VReg.A0, HDR_FLAGS_SIZE, VReg.V0);

        // 存储转发地址
        vm.store(VReg.A0, HDR_NEXT, VReg.A1);

        vm.epilogue([], 0);
    }

    /**
     * 处理单个引用
     * _process_reference(value, slot_addr, to_ptr) -> new_to_ptr
     * 如果 value 指向年轻代对象，复制并更新引用
     */
    generateProcessReference() {
        const vm = this.vm;

        vm.label("_process_reference");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);

        vm.mov(VReg.S0, VReg.A0); // value
        vm.mov(VReg.S1, VReg.A1); // slot_addr
        vm.mov(VReg.S2, VReg.A2); // to_ptr

        // 检查是否是有效的堆指针
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_process_ref_done");

        // 检查是否在年轻代 from-space（即旧的 to-space）
        vm.lea(VReg.V0, "_young_to_space"); // 交换后这是 old from
        vm.load(VReg.V0, VReg.V0, 0);
        vm.cmp(VReg.S0, VReg.V0);
        vm.jlt("_process_ref_done");

        vm.addImm(VReg.V1, VReg.V0, YOUNG_GEN_SIZE);
        vm.cmp(VReg.S0, VReg.V1);
        vm.jge("_process_ref_done");

        // 是年轻代对象，获取其 header
        vm.subImm(VReg.S3, VReg.S0, HEADER_SIZE); // header addr

        // 检查是否已转发
        vm.load(VReg.V0, VReg.S3, HDR_FLAGS_SIZE);
        vm.movImm(VReg.V1, MARK_MASK);
        vm.and(VReg.V2, VReg.V0, VReg.V1);
        vm.cmpImm(VReg.V2, GC_FORWARDED);
        vm.jeq("_process_ref_forwarded");

        // 未转发，复制对象
        vm.mov(VReg.A0, VReg.S3); // old header
        vm.mov(VReg.A1, VReg.S2); // to_ptr
        vm.call("_copy_object");
        // RET = new header, A1 = new to_ptr

        vm.mov(VReg.S2, VReg.A1); // update to_ptr

        // 设置转发指针
        vm.push(VReg.RET);
        vm.mov(VReg.A0, VReg.S3); // old header
        vm.mov(VReg.A1, VReg.RET); // new header
        vm.call("_forward_object");
        vm.pop(VReg.V0);

        // 更新 slot 中的引用
        vm.addImm(VReg.V0, VReg.V0, HEADER_SIZE); // new user addr
        vm.store(VReg.S1, 0, VReg.V0);
        vm.jmp("_process_ref_return");

        // 已转发，使用转发地址
        vm.label("_process_ref_forwarded");
        vm.load(VReg.V0, VReg.S3, HDR_NEXT); // forwarding addr (header)
        vm.addImm(VReg.V0, VReg.V0, HEADER_SIZE); // user addr
        vm.store(VReg.S1, 0, VReg.V0);
        vm.jmp("_process_ref_return");

        vm.label("_process_ref_done");
        // 不需要处理

        vm.label("_process_ref_return");
        vm.mov(VReg.RET, VReg.S2);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    /**
     * 处理对象中的引用（Cheney 算法扫描阶段）
     * _process_object(obj_header, to_space_ptr) -> new_to_ptr
     */
    generateProcessObject() {
        const vm = this.vm;

        vm.label("_process_object");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        vm.mov(VReg.S0, VReg.A0); // obj header
        vm.mov(VReg.S1, VReg.A1); // to_ptr

        // 读取类型
        vm.load(VReg.V0, VReg.S0, HDR_FLAGS_SIZE);
        vm.shr(VReg.V1, VReg.V0, TYPE_SHIFT);
        vm.movImm(VReg.V2, TYPE_MASK);
        vm.and(VReg.S2, VReg.V1, VReg.V2); // type

        // 读取大小
        vm.shr(VReg.S3, VReg.V0, SIZE_SHIFT); // user size

        // 根据类型处理引用
        vm.cmpImm(VReg.S2, TYPE_ARRAY);
        vm.jeq("_process_array");

        vm.cmpImm(VReg.S2, TYPE_OBJECT);
        vm.jeq("_process_object_refs");

        vm.cmpImm(VReg.S2, TYPE_CLOSURE);
        vm.jeq("_process_closure");

        // 其他类型（无引用），直接返回
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        // 处理数组引用
        vm.label("_process_array");
        vm.addImm(VReg.S4, VReg.S0, HEADER_SIZE); // 数组数据起始
        // 数组布局: [type:8][length:8][capacity:8][elements...]
        vm.load(VReg.V0, VReg.S4, 8); // length
        vm.movImm(VReg.V1, 0); // index

        vm.label("_process_array_loop");
        vm.cmp(VReg.V1, VReg.V0);
        vm.jge("_process_array_done");

        // 计算元素偏移：24 + index * 8
        vm.shl(VReg.V2, VReg.V1, 3);
        vm.addImm(VReg.V2, VReg.V2, 24);
        vm.add(VReg.V2, VReg.S4, VReg.V2); // element slot

        // 加载元素值
        vm.load(VReg.V3, VReg.V2, 0);

        // 处理引用
        vm.push(VReg.V0);
        vm.push(VReg.V1);
        vm.push(VReg.V2);
        vm.mov(VReg.A0, VReg.V3); // value
        vm.mov(VReg.A1, VReg.V2); // slot addr
        vm.mov(VReg.A2, VReg.S1); // to_ptr
        vm.call("_process_reference");
        vm.mov(VReg.S1, VReg.RET); // update to_ptr
        vm.pop(VReg.V2);
        vm.pop(VReg.V1);
        vm.pop(VReg.V0);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp("_process_array_loop");

        vm.label("_process_array_done");
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        // 处理对象引用
        vm.label("_process_object_refs");
        vm.addImm(VReg.S4, VReg.S0, HEADER_SIZE); // 对象数据起始
        // 对象布局: [type:8][count:8][__proto__:8][key0:8][val0:8]...
        vm.load(VReg.V0, VReg.S4, 8); // count
        vm.movImm(VReg.V1, 0); // index

        // 先处理 __proto__
        vm.addImm(VReg.V2, VReg.S4, 16); // __proto__ slot
        vm.load(VReg.V3, VReg.V2, 0);
        vm.push(VReg.V0);
        vm.push(VReg.V1);
        vm.mov(VReg.A0, VReg.V3);
        vm.mov(VReg.A1, VReg.V2);
        vm.mov(VReg.A2, VReg.S1);
        vm.call("_process_reference");
        vm.mov(VReg.S1, VReg.RET);
        vm.pop(VReg.V1);
        vm.pop(VReg.V0);

        vm.label("_process_object_loop");
        vm.cmp(VReg.V1, VReg.V0);
        vm.jge("_process_object_done");

        // 计算值偏移：24 + index * 16 + 8
        vm.shl(VReg.V2, VReg.V1, 4);
        vm.addImm(VReg.V2, VReg.V2, 32); // skip type+count+proto + key
        vm.add(VReg.V2, VReg.S4, VReg.V2);

        vm.load(VReg.V3, VReg.V2, 0);
        vm.push(VReg.V0);
        vm.push(VReg.V1);
        vm.push(VReg.V2);
        vm.mov(VReg.A0, VReg.V3);
        vm.mov(VReg.A1, VReg.V2);
        vm.mov(VReg.A2, VReg.S1);
        vm.call("_process_reference");
        vm.mov(VReg.S1, VReg.RET);
        vm.pop(VReg.V2);
        vm.pop(VReg.V1);
        vm.pop(VReg.V0);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp("_process_object_loop");

        vm.label("_process_object_done");
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);

        // 处理闭包引用
        vm.label("_process_closure");
        // 闭包布局: [magic:2][pad:6][func_ptr:8][captured...]
        vm.addImm(VReg.S4, VReg.S0, HEADER_SIZE + 16); // 跳过 magic 和 func_ptr
        // 计算捕获变量数量
        vm.subImm(VReg.V0, VReg.S3, 16); // captured size
        vm.shr(VReg.V0, VReg.V0, 3); // count
        vm.movImm(VReg.V1, 0);

        vm.label("_process_closure_loop");
        vm.cmp(VReg.V1, VReg.V0);
        vm.jge("_process_closure_done");

        vm.shl(VReg.V2, VReg.V1, 3);
        vm.add(VReg.V2, VReg.S4, VReg.V2);
        vm.load(VReg.V3, VReg.V2, 0);

        vm.push(VReg.V0);
        vm.push(VReg.V1);
        vm.push(VReg.V2);
        vm.mov(VReg.A0, VReg.V3);
        vm.mov(VReg.A1, VReg.V2);
        vm.mov(VReg.A2, VReg.S1);
        vm.call("_process_reference");
        vm.mov(VReg.S1, VReg.RET);
        vm.pop(VReg.V2);
        vm.pop(VReg.V1);
        vm.pop(VReg.V0);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp("_process_closure_loop");

        vm.label("_process_closure_done");
        vm.mov(VReg.RET, VReg.S1);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    /**
     * Minor GC - Cheney 复制收集
     */
    generateMinorGC() {
        const vm = this.vm;

        vm.label("_minor_gc");
        vm.prologue(48, [VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4]);

        // 交换 from-space 和 to-space
        vm.lea(VReg.V0, "_young_from_space");
        vm.load(VReg.S0, VReg.V0, 0); // old from (现在包含对象)
        vm.lea(VReg.V1, "_young_to_space");
        vm.load(VReg.S1, VReg.V1, 0); // old to (空的，复制目标)

        vm.store(VReg.V0, 0, VReg.S1); // from = old to
        vm.store(VReg.V1, 0, VReg.S0); // to = old from

        // S1 = 新 from-space 起始（复制目标）
        // S2 = scan 指针
        // S3 = copy 指针
        vm.mov(VReg.S2, VReg.S1); // scan = to_space start
        vm.mov(VReg.S3, VReg.S1); // copy = to_space start

        // 步骤 1：扫描记忆集中的老年代引用
        vm.lea(VReg.V0, "_remembered_set_size");
        vm.load(VReg.S4, VReg.V0, 0); // remembered set size
        vm.movImm(VReg.V1, 0); // index

        vm.label("_minor_gc_remembered_loop");
        vm.cmp(VReg.V1, VReg.S4);
        vm.jge("_minor_gc_remembered_done");

        // 加载老年代对象地址
        vm.lea(VReg.V2, "_remembered_set");
        vm.shl(VReg.V3, VReg.V1, 3);
        vm.add(VReg.V2, VReg.V2, VReg.V3);
        vm.load(VReg.V2, VReg.V2, 0); // old_obj

        // 扫描此对象的引用
        vm.push(VReg.V1);
        vm.mov(VReg.A0, VReg.V2);
        vm.mov(VReg.A1, VReg.S3);
        vm.call("_process_object");
        vm.mov(VReg.S3, VReg.RET); // update copy ptr
        vm.pop(VReg.V1);

        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.jmp("_minor_gc_remembered_loop");

        vm.label("_minor_gc_remembered_done");

        // 步骤 2：Cheney 主循环
        vm.label("_minor_gc_scan_loop");
        vm.cmp(VReg.S2, VReg.S3);
        vm.jge("_minor_gc_scan_done");

        // 处理 scan 指向的对象
        vm.mov(VReg.A0, VReg.S2);
        vm.mov(VReg.A1, VReg.S3);
        vm.call("_process_object");
        vm.mov(VReg.S3, VReg.RET);

        // 前进 scan 指针（跳过当前对象）
        vm.load(VReg.V0, VReg.S2, HDR_FLAGS_SIZE);
        vm.shr(VReg.V0, VReg.V0, SIZE_SHIFT);
        vm.addImm(VReg.V0, VReg.V0, HEADER_SIZE + 15);
        vm.movImm(VReg.V1, -16);
        vm.and(VReg.V0, VReg.V0, VReg.V1);
        vm.add(VReg.S2, VReg.S2, VReg.V0);

        vm.jmp("_minor_gc_scan_loop");

        vm.label("_minor_gc_scan_done");

        // 更新分配指针
        vm.lea(VReg.V0, "_young_alloc_ptr");
        vm.store(VReg.V0, 0, VReg.S3);

        // 更新结束位置
        vm.addImm(VReg.V1, VReg.S1, YOUNG_GEN_SIZE);
        vm.lea(VReg.V0, "_young_end");
        vm.store(VReg.V0, 0, VReg.V1);

        // 清空记忆集
        vm.lea(VReg.V0, "_remembered_set_size");
        vm.movImm(VReg.V1, 0);
        vm.store(VReg.V0, 0, VReg.V1);

        // 更新计数
        vm.lea(VReg.V0, "_minor_gc_count");
        vm.load(VReg.V1, VReg.V0, 0);
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.V0, 0, VReg.V1);

        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3, VReg.S4], 48);
    }

    /**
     * 标记对象（三色标记）
     * _mark_object(obj_ptr)
     */
    generateMarkObject() {
        const vm = this.vm;

        vm.label("_mark_object");
        vm.prologue(16, [VReg.S0]);

        vm.mov(VReg.S0, VReg.A0);

        // 检查是否是有效指针
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_mark_object_done");

        // 获取对象头
        vm.subImm(VReg.V0, VReg.S0, HEADER_SIZE);

        // 检查标记状态
        vm.load(VReg.V1, VReg.V0, HDR_FLAGS_SIZE);
        vm.movImm(VReg.V2, MARK_MASK);
        vm.and(VReg.V3, VReg.V1, VReg.V2);

        // 如果已经是 GRAY 或 BLACK，跳过
        vm.cmpImm(VReg.V3, GC_WHITE);
        vm.jne("_mark_object_done");

        // 标记为 GRAY
        vm.movImm(VReg.V2, ~MARK_MASK);
        vm.and(VReg.V1, VReg.V1, VReg.V2);
        vm.movImm(VReg.V2, GC_GRAY);
        vm.or(VReg.V1, VReg.V1, VReg.V2);
        vm.store(VReg.V0, HDR_FLAGS_SIZE, VReg.V1);

        // 加入灰色栈
        vm.lea(VReg.V1, "_gc_gray_stack_ptr");
        vm.load(VReg.V2, VReg.V1, 0);
        vm.store(VReg.V2, 0, VReg.V0); // push header addr
        vm.addImm(VReg.V2, VReg.V2, 8);
        vm.store(VReg.V1, 0, VReg.V2);

        vm.label("_mark_object_done");
        vm.epilogue([VReg.S0], 16);
    }

    /**
     * 清除老年代未标记对象
     */
    generateSweepOldGen() {
        const vm = this.vm;

        vm.label("_sweep_old_gen");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2]);

        // 遍历老年代所有对象
        vm.lea(VReg.V0, "_old_start");
        vm.load(VReg.S0, VReg.V0, 0); // current ptr
        vm.lea(VReg.V0, "_old_alloc_ptr");
        vm.load(VReg.S1, VReg.V0, 0); // end ptr

        vm.label("_sweep_loop");
        vm.cmp(VReg.S0, VReg.S1);
        vm.jge("_sweep_done");

        // 读取对象头
        vm.load(VReg.V0, VReg.S0, HDR_FLAGS_SIZE);

        // 提取标记和大小
        vm.movImm(VReg.V1, MARK_MASK);
        vm.and(VReg.S2, VReg.V0, VReg.V1);

        vm.shr(VReg.V1, VReg.V0, SIZE_SHIFT);
        vm.addImm(VReg.V1, VReg.V1, HEADER_SIZE + 15);
        vm.movImm(VReg.V2, -16);
        vm.and(VReg.V1, VReg.V1, VReg.V2); // aligned size

        // 如果是 WHITE，释放（这里简化为跳过）
        vm.cmpImm(VReg.S2, GC_WHITE);
        vm.jeq("_sweep_free");

        // 如果是 BLACK，重置为 WHITE
        vm.cmpImm(VReg.S2, GC_BLACK);
        vm.jne("_sweep_next");

        vm.movImm(VReg.V2, ~MARK_MASK);
        vm.and(VReg.V0, VReg.V0, VReg.V2);
        vm.store(VReg.S0, HDR_FLAGS_SIZE, VReg.V0);
        vm.jmp("_sweep_next");

        vm.label("_sweep_free");
        // 简化实现：不实际释放，仅标记
        // 完整实现需要维护空闲链表

        vm.label("_sweep_next");
        vm.add(VReg.S0, VReg.S0, VReg.V1);
        vm.jmp("_sweep_loop");

        vm.label("_sweep_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 32);
    }

    /**
     * Major GC - 标记清除
     */
    generateMajorGC() {
        const vm = this.vm;

        vm.label("_major_gc");
        vm.prologue(32, [VReg.S0, VReg.S1]);

        // 重置灰色栈
        vm.lea(VReg.V0, "_gc_gray_stack");
        vm.lea(VReg.V1, "_gc_gray_stack_ptr");
        vm.store(VReg.V1, 0, VReg.V0);

        // 标记阶段：从记忆集开始标记
        vm.lea(VReg.V0, "_remembered_set_size");
        vm.load(VReg.S0, VReg.V0, 0);
        vm.movImm(VReg.S1, 0);

        vm.label("_major_gc_mark_roots");
        vm.cmp(VReg.S1, VReg.S0);
        vm.jge("_major_gc_mark_process");

        vm.lea(VReg.V0, "_remembered_set");
        vm.shl(VReg.V1, VReg.S1, 3);
        vm.add(VReg.V0, VReg.V0, VReg.V1);
        vm.load(VReg.A0, VReg.V0, 0);
        vm.call("_mark_object");

        vm.addImm(VReg.S1, VReg.S1, 1);
        vm.jmp("_major_gc_mark_roots");

        // 处理灰色栈
        vm.label("_major_gc_mark_process");
        vm.lea(VReg.V0, "_gc_gray_stack");
        vm.lea(VReg.V1, "_gc_gray_stack_ptr");
        vm.load(VReg.V2, VReg.V1, 0);

        vm.cmp(VReg.V0, VReg.V2);
        vm.jge("_major_gc_sweep");

        // pop from gray stack
        vm.subImm(VReg.V2, VReg.V2, 8);
        vm.store(VReg.V1, 0, VReg.V2);
        vm.load(VReg.S0, VReg.V2, 0); // obj header

        // 标记为 BLACK
        vm.load(VReg.V0, VReg.S0, HDR_FLAGS_SIZE);
        vm.movImm(VReg.V1, ~MARK_MASK);
        vm.and(VReg.V0, VReg.V0, VReg.V1);
        vm.movImm(VReg.V1, GC_BLACK);
        vm.or(VReg.V0, VReg.V0, VReg.V1);
        vm.store(VReg.S0, HDR_FLAGS_SIZE, VReg.V0);

        // 遍历对象的引用并标记
        // (简化：跳过具体遍历)

        vm.jmp("_major_gc_mark_process");

        // 清除阶段
        vm.label("_major_gc_sweep");
        vm.call("_sweep_old_gen");

        // 更新计数
        vm.lea(VReg.V0, "_major_gc_count");
        vm.load(VReg.V1, VReg.V0, 0);
        vm.addImm(VReg.V1, VReg.V1, 1);
        vm.store(VReg.V0, 0, VReg.V1);

        vm.epilogue([VReg.S0, VReg.S1], 32);
    }
}

/**
 * 创建分代 GC 管理器
 */
export function createGenerationalGCManager(compiler) {
    return new GenerationalGCManager(compiler);
}

/**
 * 创建分代 GC 运行时生成器
 */
export function createGenerationalGCRuntimeGenerator(vm, ctx) {
    return new GenerationalGCRuntimeGenerator(vm, ctx);
}
