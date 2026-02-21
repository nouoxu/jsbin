// JSBin Require 运行时
// CommonJS 模块加载实现

import { VReg } from "../../../vm/registers.js";

export class RequireGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateUserRequire();
    }

    // _user_require(modulePath) -> module.exports
    generateUserRequire() {
        const vm = this.vm;
        vm.label("_user_require");
        
        // 返回 undefined
        vm.movImm64(VReg.RET, "0x7ffb000000000000");
        vm.ret();
    }

    generateDataSection(asm) {}
}
