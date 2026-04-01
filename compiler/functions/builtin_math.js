// JSBin 编译器 - Math 方法编译
// 编译 Math.floor, Math.ceil, Math.abs, Math.min, Math.max 等方法

import { VReg } from "../../vm/index.js";

// Math 方法编译 Mixin
export const MathMethodCompiler = {
    // 编译 Math 方法
    compileMathMethod(methodName, args) {
        if (methodName === "floor") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_math_floor");
            }
            return true;
        }

        if (methodName === "ceil") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_math_ceil");
            }
            return true;
        }

        if (methodName === "round") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_math_round");
            }
            return true;
        }

        if (methodName === "abs") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_math_abs");
            }
            return true;
        }

        if (methodName === "min" || methodName === "max") {
            if (args.length >= 2) {
                this.compileExpression(args[0]);
                this.vm.push(VReg.RET);
                this.compileExpression(args[1]);
                this.vm.pop(VReg.V1);

                const useFirstLabel = this.ctx.newLabel("minmax_first");
                const endLabel = this.ctx.newLabel("minmax_end");

                this.vm.cmp(VReg.V1, VReg.RET);
                if (methodName === "min") {
                    this.vm.jlt(useFirstLabel);
                } else {
                    this.vm.jgt(useFirstLabel);
                }
                this.vm.jmp(endLabel);
                this.vm.label(useFirstLabel);
                this.vm.mov(VReg.RET, VReg.V1);
                this.vm.label(endLabel);
            }
            return true;
        }

        return false;
    },
};
