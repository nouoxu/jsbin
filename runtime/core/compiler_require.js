// 二次自举的内置模块加载器
// 实现类似 Node.js 的 require

import { VReg } from "../../vm/registers.js";

export class CompilerRequireGenerator {
    constructor(vm) {
        this.vm = vm;
    }

    generate() {
        this.generateRequire();
        this.generateModuleCache();
    }

    // require(name) -> module exports
    generateRequire() {
        const vm = this.vm;
        vm.label("_compiler_require");
        vm.prologue(32, [VReg.S0, VReg.S1, VReg.S2, VReg.S3]);
        
        // A0: module name (string pointer)
        vm.mov(VReg.S0, VReg.A0); // module name
        
        // 检查缓存
        vm.lea(VReg.A0, "_module_cache");
        vm.load(VReg.A0, VReg.A0, 0);
        vm.cmpImm(VReg.A0, 0);
        vm.jne("_require_check_cache");
        
        // 初始化缓存
        vm.lea(VReg.A0, "_module_cache");
        vm.call("_compiler_malloc");
        vm.store(VReg.A0, VReg.A0, 0);
        
        vm.label("_require_check_cache");
        // TODO: 实现模块缓存查找
        
        // 加载内置模块
        vm.lea(VReg.A1, "_builtin_modules");
        vm.load(VReg.A1, VReg.A1, 0);
        vm.cmpImm(VReg.A1, 0);
        vm.jeq("_require_not_found");
        
        // 查找内置模块
        vm.label("_require_loop");
        vm.load(VReg.A2, VReg.A1, 0);
        vm.cmpImm(VReg.A2, 0);
        vm.jeq("_require_not_found");
        
        // 比较模块名
        vm.mov(VReg.A0, VReg.S0);
        vm.mov(VReg.A1, VReg.A2);
        vm.call("_strcmp");
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_require_found");
        
        vm.addImm(VReg.A1, VReg.A1, 8);
        vm.jmp("_require_loop");
        
        vm.label("_require_found");
        // 返回模块
        vm.mov(VReg.RET, VReg.A2);
        vm.jmp("_require_done");
        
        vm.label("_require_not_found");
        // 返回 undefined
        vm.movImm(VReg.RET, 0);
        
        vm.label("_require_done");
        vm.epilogue([VReg.S0, VReg.S1, VReg.S2, VReg.S3], 32);
    }

    // 模块缓存
    generateModuleCache() {
        const vm = this.vm;
        vm.addDataLabel("_module_cache");
        vm.addDataQword(0); // 初始化为 NULL
    }
}
