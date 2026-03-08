// JSBin 运行时 - instanceof 运算符

import { VReg } from "../../vm/registers.js";

export class InstanceofGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        this.generateInstanceof();
        this.generatePropIn();
    }

    // a instanceof b -> boolean
    // 检查 a 的原型链中是否有 b.prototype
    generateInstanceof() {
        const vm = this.vm;
        
        vm.label("_instanceof");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);
        
        // A0 = 实例对象
        // A1 = 构造函数
        
        vm.mov(VReg.S0, VReg.A0); // 实例
        vm.mov(VReg.S1, VReg.A1); // 构造函数
        
        // 检查构造函数是否为对象
        vm.cmpImm(VReg.S1, 0);
        vm.jeq("_instanceof_false");
        
        // 获取构造函数的 prototype 属性
        // prototype 在对象偏移 +16 (跳过 type + length)
        vm.addImm(VReg.A0, VReg.S1, 16);
        vm.load(VReg.A0, VReg.A0, 0);
        
        // 检查 prototype 是否为对象
        vm.cmpImm(VReg.A0, 0);
        vm.jeq("_instanceof_false");
        
        // 遍历实例的原型链
        vm.mov(VReg.S2, VReg.S0); // 当前检查对象
        
        vm.label("_instanceof_loop");
        // 获取当前对象的原型 (偏移 +16)
        vm.addImm(VReg.A0, VReg.S2, 16);
        vm.load(VReg.S3, VReg.A0, 0); // S3 = 原型
        
        // 检查原型是否为 null
        vm.cmpImm(VReg.S3, 0);
        vm.jeq("_instanceof_false");
        
        // 检查原型是否等于构造函数的 prototype
        vm.cmp(VReg.S3, VReg.A0);
        vm.jeq("_instanceof_true");
        
        // 继续向上查找
        vm.mov(VReg.S2, VReg.S3);
        vm.jmp("_instanceof_loop");
        
        vm.label("_instanceof_true");
        vm.movImm(VReg.RET, 1); // true
        vm.jmp("_instanceof_done");
        
        vm.label("_instanceof_false");
        vm.movImm(VReg.RET, 0); // false
        
        vm.label("_instanceof_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // "prop" in obj -> boolean
    generatePropIn() {
        const vm = this.vm;
        
        vm.label("_prop_in");
        vm.prologue(24, [VReg.S0, VReg.S1, VReg.S2]);
        
        // A0 = 对象
        // A1 = 属性名
        
        vm.mov(VReg.S0, VReg.A0); // 对象
        vm.mov(VReg.S1, VReg.A1); // 属性名
        
        // 检查对象是否为有效
        vm.cmpImm(VReg.S0, 0);
        vm.jeq("_prop_in_false");
        
        // TODO: 实现属性查找
        // 简化: 返回 false
        vm.label("_prop_in_false");
        vm.movImm(VReg.RET, 0);
        
        vm.label("_prop_in_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2], 24);
    }
}
