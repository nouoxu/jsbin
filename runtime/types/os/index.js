// JSBin OS 运行时
// 提供 os 模块操作的运行时实现

import { VReg } from "../../../vm/registers.js";

export class OSGenerator {
    constructor(vm, ctx) {
        this.vm = vm;
        this.ctx = ctx;
    }

    generate() {
        this.generateOsTmpdir();
    }

    /**
     * os.tmpdir()
     * 返回临时目录路径
     * 优先使用 TMPDIR 环境变量，否则返回 "/tmp"
     */
    generateOsTmpdir() {
        const vm = this.vm;

        vm.label("_os_tmpdir");
        vm.prologue(16, [VReg.S0]);

        // 尝试获取 TMPDIR 环境变量
        vm.lea(VReg.A0, "_tmpdir_env_name");
        vm.call("_get_env");
        // RET = C string 指针 (或 NULL)

        // 检查是否找到
        vm.cmpImm(VReg.RET, 0);
        vm.jeq("_os_tmpdir_default");

        // 使用 TMPDIR 环境变量的值
        vm.mov(VReg.A0, VReg.RET);
        vm.call("_createStrFromCStr");
        vm.mov(VReg.S0, VReg.RET);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_box_string");
        vm.jmp("_os_tmpdir_done");

        vm.label("_os_tmpdir_default");
        // 返回默认值 "/tmp"
        vm.lea(VReg.A0, "_str_tmp");
        vm.call("_createStrFromCStr");
        vm.mov(VReg.S0, VReg.RET);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_box_string");

        vm.label("_os_tmpdir_done");
        vm.epilogue([VReg.S0], 16);
    }

    /**
     * 添加 OS 模块需要的数据段
     */
    generateDataSection(asm) {
        // TMPDIR 环境变量名
        asm.addDataLabel("_tmpdir_env_name");
        asm.addDataByte(84); // 'T'
        asm.addDataByte(77); // 'M'
        asm.addDataByte(80); // 'P'
        asm.addDataByte(68); // 'D'
        asm.addDataByte(73); // 'I'
        asm.addDataByte(82); // 'R'
        asm.addDataByte(0); // null terminator

        // 默认临时目录 "/tmp"
        asm.addDataLabel("_str_tmp");
        asm.addDataByte(47); // '/'
        asm.addDataByte(116); // 't'
        asm.addDataByte(109); // 'm'
        asm.addDataByte(112); // 'p'
        asm.addDataByte(0); // null terminator
    }
}
