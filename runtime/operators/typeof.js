// JSBin 运行时 - typeof 运算符

import { VReg } from "../../vm/registers.js";

export class TypeofGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        this.generateTypeof();
    }

    generateTypeof() {
        const vm = this.vm;

        const TYPE_ARRAY = 1;
        const TYPE_OBJECT = 2;
        const TYPE_CLOSURE = 3;
        const TYPE_STRING = 6;
        const TYPE_NUMBER = 13;
        const TYPE_FLOAT64 = 29;
        
        const CLOSURE_MAGIC = 0xc105;
        const ASYNC_CLOSURE_MAGIC = 0xa51c;
        const GENERATOR_MAGIC = 0x9e4e;

        vm.label("_typeof");
        vm.prologue(24, [VReg.S0, VReg.S1, VReg.S2]);
        vm.mov(VReg.S0, VReg.A0);

        const isNullLabel = "_typeof_null";
        const isFunctionLabel = "_typeof_function";
        const isArrayLabel = "_typeof_array";
        const isObjectLabel = "_typeof_object";
        const isStringLabel = "_typeof_string";
        const isNumberLabel = "_typeof_number";
        const isBooleanLabel = "_typeof_boolean";
        const isUndefinedLabel = "_typeof_undefined";
        const doneLabel = "_typeof_done";

        // 1. 指针为 0 -> null
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(isNullLabel);

        // 2. NaN-boxing 格式 (0x7FFx...)
        vm.shrImm(VReg.S1, VReg.S0, 48);
        vm.cmpImm(VReg.S1, 0x7FF8);
        vm.jge("_typeof_special");

        // 3. 检查堆范围
        vm.lea(VReg.S1, "_heap_base");
        vm.load(VReg.S1, VReg.S1, 0);
        vm.cmp(VReg.S0, VReg.S1);
        vm.jlt("_typeof_data_or_object");

        vm.lea(VReg.S1, "_heap_ptr");
        vm.load(VReg.S1, VReg.S1, 0);
        vm.cmp(VReg.S0, VReg.S1);
        vm.jlt("_typeof_heap_object");
        vm.jmp(isObjectLabel);

        // ========== 特殊值检测 ==========
        vm.label("_typeof_special");
        vm.subImm(VReg.S1, VReg.S1, 0x7FF8);
        vm.cmpImm(VReg.S1, 1);
        vm.jeq(isBooleanLabel);
        vm.cmpImm(VReg.S1, 2);
        vm.jeq(isObjectLabel);
        vm.cmpImm(VReg.S1, 3);
        vm.jeq(isUndefinedLabel);
        vm.jmp(isObjectLabel);

        // ========== 数据段或非堆对象 ==========
        vm.label("_typeof_data_or_object");
        vm.jmp(isStringLabel);

        // ========== 堆对象类型检测 ==========
        vm.label("_typeof_heap_object");
        vm.load(VReg.S1, VReg.S0, 0);
        
        // 检查 closure magic
        vm.andImm(VReg.S2, VReg.S1, 0xFFFF);
        vm.cmpImm(VReg.S2, CLOSURE_MAGIC & 0xFFFF);
        vm.jeq(isFunctionLabel);
        vm.cmpImm(VReg.S2, ASYNC_CLOSURE_MAGIC & 0xFFFF);
        vm.jeq(isFunctionLabel);
        vm.cmpImm(VReg.S2, GENERATOR_MAGIC & 0xFFFF);
        vm.jeq(isFunctionLabel);
        
        vm.andImm(VReg.S1, VReg.S1, 0xff);

        vm.cmpImm(VReg.S1, TYPE_CLOSURE);
        vm.jeq(isFunctionLabel);
        vm.cmpImm(VReg.S1, TYPE_STRING);
        vm.jeq(isStringLabel);
        vm.cmpImm(VReg.S1, TYPE_ARRAY);
        vm.jeq(isArrayLabel);
        vm.cmpImm(VReg.S1, TYPE_NUMBER);
        vm.jeq(isNumberLabel);
        vm.cmpImm(VReg.S1, TYPE_FLOAT64);
        vm.jeq(isNumberLabel);
        
        vm.jmp(isObjectLabel);

        // ========== 返回结果 ==========
        vm.label(isUndefinedLabel);
        vm.lea(VReg.RET, "_str_undefined");
        vm.jmp(doneLabel);

        vm.label(isNullLabel);
        vm.lea(VReg.RET, "_str_object_type");
        vm.jmp(doneLabel);

        vm.label(isFunctionLabel);
        vm.lea(VReg.RET, "_str_function_type");
        vm.jmp(doneLabel);

        vm.label(isArrayLabel);
        vm.lea(VReg.RET, "_str_object_type");
        vm.jmp(doneLabel);

        vm.label(isObjectLabel);
        vm.lea(VReg.RET, "_str_object_type");
        vm.jmp(doneLabel);

        vm.label(isStringLabel);
        vm.lea(VReg.RET, "_str_string");
        vm.jmp(doneLabel);

        vm.label(isNumberLabel);
        vm.lea(VReg.RET, "_str_number");
        vm.jmp(doneLabel);

        vm.label(isBooleanLabel);
        vm.lea(VReg.RET, "_str_boolean");

        vm.label(doneLabel);
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 24);
    }
}
