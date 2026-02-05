// JSBin 编译器 - 内置类型方法编译
// 编译 Math、Array、Map、Set、Date、RegExp 等内置类型的方法

import { VReg } from "../../vm/index.js";

// 内置方法编译方法混入
export const BuiltinMethodCompiler = {
    // 编译 Math 方法
    compileMathMethod(methodName, args) {
        // 简单方法：直接通过 Number 对象或不需要参数
        const simpleMethods = ["sqrt", "log", "exp", "sin", "cos", "tan", "asin", "acos", "atan", "random", "sign", "trunc", "fround"];

        if (simpleMethods.includes(methodName)) {
            if (methodName === "random") {
                // random 不需要参数
                this.vm.call("_math_random");
            } else if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_math_" + methodName);
            }
            return true;
        }

        // floor, ceil, round 使用运行时函数
        if (methodName === "floor" || methodName === "ceil" || methodName === "round") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_math_" + methodName);
            }
            return true;
        }

        if (methodName === "abs") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                // 从 Number 对象中提取值并取绝对值
                this.vm.load(VReg.V0, VReg.RET, 8);
                this.vm.fmovToFloat(0, VReg.V0);
                this.vm.fabs(0, 0);
                this.vm.fmovToInt(VReg.V0, 0);
                // 装箱 - 使用 TYPE_FLOAT64=29 保持一致性
                this.vm.push(VReg.V0);
                this.vm.movImm(VReg.A0, 16);
                this.vm.call("_alloc");
                this.vm.movImm(VReg.V1, 29); // TYPE_FLOAT64
                this.vm.store(VReg.RET, 0, VReg.V1);
                this.vm.pop(VReg.V1);
                this.vm.store(VReg.RET, 8, VReg.V1);
            }
            return true;
        }

        if (methodName === "pow") {
            if (args.length >= 2) {
                this.compileExpression(args[1]);
                this.vm.push(VReg.RET);
                this.compileExpression(args[0]);
                this.vm.pop(VReg.A1);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_math_pow");
            }
            return true;
        }

        if (methodName === "min" || methodName === "max") {
            if (args.length === 0) {
                return false; // 未覆盖的调用方式，保持原行为
            }

            // 初始化：best = args[0]
            this.compileExpression(args[0]);
            this.vm.push(VReg.RET); // stack: best

            // 逐个比较后续参数，保持相同 boxed 对象返回
            for (let i = 1; i < args.length; i++) {
                this.compileExpression(args[i]); // RET = current
                this.vm.pop(VReg.V1); // V1 = best

                // 比较两个 Number 对象的值
                this.vm.load(VReg.V2, VReg.V1, 8); // best.value
                this.vm.load(VReg.V3, VReg.RET, 8); // cur.value
                this.vm.fmovToFloat(0, VReg.V2);
                this.vm.fmovToFloat(1, VReg.V3);
                this.vm.fcmp(0, 1);

                const keepBest = this.ctx.newLabel("minmax_keep_best");
                const endLabel = this.ctx.newLabel("minmax_step_end");

                if (methodName === "min") {
                    // 如果 best < cur，保留 best，否则使用 cur（ucomisd 后需使用无符号比较）
                    this.vm.jb(keepBest);
                } else {
                    // max: 如果 best > cur，保留 best，否则使用 cur
                    this.vm.ja(keepBest);
                }

                // 使用当前值作为新的 best
                this.vm.mov(VReg.V1, VReg.RET);
                this.vm.jmp(endLabel);

                // 保留原 best
                this.vm.label(keepBest);
                // V1 已是 best

                this.vm.label(endLabel);
                // 将 best 压栈供下一轮使用
                this.vm.push(VReg.V1);
            }

            // 最终 best 在栈顶
            this.vm.pop(VReg.RET);
            return true;
        }

        if (methodName === "atan2" || methodName === "hypot" || methodName === "imul") {
            if (args.length >= 2) {
                this.compileExpression(args[1]);
                this.vm.push(VReg.RET);
                this.compileExpression(args[0]);
                this.vm.pop(VReg.A1);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_math_" + methodName);
            }
            return true;
        }

        if (methodName === "clz32") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_math_clz32");
            }
            return true;
        }

        return false;
    },

    // 编译 FS 方法
    compileFSMethod(methodName, args) {
        if (methodName === "readFileSync") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                // Argument 1 (options) ignored for now
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_fs_read_file_sync");
                // NaN-box the returned string pointer
                this.vm.movImm(VReg.V1, 0x7ffc000000000000);
                this.vm.or(VReg.RET, VReg.RET, VReg.V1);
            }
            return true;
        }
        if (methodName === "writeFileSync") {
            if (args.length >= 2) {
                // 先编译第二个参数（data），再编译第一个参数（path）
                this.compileExpression(args[1]);
                this.vm.push(VReg.RET);
                this.compileExpression(args[0]);
                this.vm.pop(VReg.A1);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_fs_write_file_sync");
            }
            return true;
        }
        if (methodName === "existsSync") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_fs_exists_sync");
            }
            return true;
        }
        if (methodName === "unlinkSync") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_fs_unlink_sync");
            }
            return true;
        }
        if (methodName === "statSync") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_fs_stat_sync");
            }
            return true;
        }
        return false;
    },

    // 编译 Path 方法
    compilePathMethod(methodName, args) {
        if (methodName === "resolve") {
            if (args.length >= 2) {
                // 两个参数：path.resolve(base, relative)
                this.compileExpression(args[1]);
                this.vm.push(VReg.RET);
                this.compileExpression(args[0]);
                this.vm.pop(VReg.A1);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_path_resolve");
            } else if (args.length === 1) {
                // 一个参数：path.resolve(path)
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.movImm(VReg.A1, 0); // 无第二参数
                this.vm.call("_path_resolve");
            }
            return true;
        }
        if (methodName === "join") {
            if (args.length >= 2) {
                // 多参数支持：两两合并
                // 先合并前两个参数
                this.compileExpression(args[1]);
                this.vm.push(VReg.RET);
                this.compileExpression(args[0]);
                this.vm.pop(VReg.A1);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_path_join");

                // 继续合并后续参数
                for (let i = 2; i < args.length; i++) {
                    this.vm.push(VReg.RET); // 保存当前结果
                    this.compileExpression(args[i]);
                    this.vm.mov(VReg.A1, VReg.RET); // 新参数作为第二个
                    this.vm.pop(VReg.A0); // 之前的结果作为第一个
                    this.vm.call("_path_join");
                }
            } else if (args.length === 1) {
                // 只有一个参数，直接返回
                this.compileExpression(args[0]);
            }
            return true;
        }
        if (methodName === "dirname") {
            // 调用运行时函数 _path_dirname
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_path_dirname");
            }
            return true;
        }
        if (methodName === "basename") {
            // 调用运行时函数 _path_basename
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_path_basename");
            }
            return true;
        }
        if (methodName === "isAbsolute") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_path_isAbsolute");
            }
            return true;
        }
        return false;
    },

    // 编译 OS 方法
    compileOSMethod(methodName, args) {
        if (methodName === "tmpdir") {
            this.vm.call("_os_tmpdir");
            return true;
        }
        return false;
    },

    // 编译 Child Process 方法
    compileChildProcessMethod(methodName, args) {
        if (methodName === "execSync") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_exec_sync");
            }
            return true;
        }
        return false;
    },

    // 编译 execSync (作为全局函数)
    compileExecSync(args) {
        if (args.length > 0) {
            this.compileExpression(args[0]);
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_exec_sync");
        }
        return true;
    },

    // 编译 Process 方法/属性
    compileProcessMethod(methodName, args) {
        if (methodName === "exit") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                // RET 可能是一个 Number 对象指针，需要提取原始整数值
                // Number 对象布局: [type:8][value:8]
                // 从 offset 8 读取 double 值 (作为整数位模式)
                this.vm.load(VReg.V1, VReg.RET, 8);
                // 使用 fmovToFloat 将整数寄存器的位模式移到浮点寄存器 D0
                this.vm.fmovToFloat(0, VReg.V1); // D0 = bits of V1 as double
                // 将 double 转换为 int (截断)
                this.vm.fcvtzs(VReg.A0, 0); // A0 = trunc(D0)
            } else {
                this.vm.movImm(VReg.A0, 0);
            }
            this.vm.call("_process_exit");
            return true;
        }
        if (methodName === "cwd") {
            this.vm.call("_process_cwd");
            return true;
        }
        return false;
    },

    // 编译 Process 属性访问
    compileProcessProperty(propName) {
        if (propName === "argv") {
            this.vm.call("_process_argv_get");
            return true;
        }
        if (propName === "platform") {
            // 返回编译时的平台字符串
            this.vm.lea(VReg.A0, "_process_platform_str");
            this.vm.call("_createStrFromCStr");
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_js_box_string");
            return true;
        }
        if (propName === "arch") {
            // 返回编译时的架构字符串
            this.vm.lea(VReg.A0, "_process_arch_str");
            this.vm.call("_createStrFromCStr");
            this.vm.mov(VReg.A0, VReg.RET);
            this.vm.call("_js_box_string");
            return true;
        }
        if (propName === "env") {
            // process.env 返回一个环境变量代理对象
            // 调用运行时函数创建环境对象
            this.vm.call("_process_env_create");
            return true;
        }
        return false;
    },

    // 编译数组方法
    compileArrayMethod(arrayExpr, method, args) {
        // push 方法特殊处理：需要更新数组引用（因为扩容可能重新分配）
        if (method === "push") {
            if (args.length > 0) {
                // 编译数组表达式
                this.compileExpression(arrayExpr);
                this.vm.push(VReg.RET);
                // 检查参数是否为 null
                if (args[0] === null || args[0] === undefined) {
                    console.error(`[PUSH_DEBUG] args[0] is null! arrayExpr:`, JSON.stringify(arrayExpr, null, 2));
                    console.error(`[PUSH_DEBUG] args:`, args.length, args);
                    console.error(`[PUSH_DEBUG] Current module:`, this.currentModulePath);
                    throw new Error(`push() argument is null`);
                }
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A1, VReg.RET);
                this.vm.pop(VReg.A0);
                this.vm.call("_array_push");

                // 如果数组是标识符，更新该变量（因为扩容可能返回新指针）
                if (arrayExpr.type === "Identifier") {
                    const offset = this.ctx.getLocal(arrayExpr.name);
                    if (offset !== undefined) {
                        // 检查是否是装箱变量
                        const isBoxed = this.ctx.boxedVars && this.ctx.boxedVars.has(arrayExpr.name);
                        if (isBoxed) {
                            // 装箱变量：更新 box 的内容
                            this.vm.load(VReg.V0, VReg.FP, offset); // 加载 box 指针
                            this.vm.store(VReg.V0, 0, VReg.RET); // 写入新值
                        } else {
                            // 普通变量：直接更新栈上的值
                            this.vm.store(VReg.FP, offset, VReg.RET);
                        }
                    }
                }
            }
            return;
        }

        this.compileExpression(arrayExpr);

        switch (method) {
            case "pop":
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_array_pop");
                break;
            case "length":
                this.vm.load(VReg.RET, VReg.RET, 8);
                break;
            case "at":
                // arr.at(index) - 支持负索引
                // 注意：index 应该是整数
                if (args.length > 0) {
                    this.vm.push(VReg.RET); // 保存数组指针
                    this.compileExpressionAsInt(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // index (int)
                    this.vm.pop(VReg.A0); // arr
                    this.vm.call("_array_at");
                }
                break;
            case "slice":
                // arr.slice(start, end?)
                // 注意：start 和 end 应该是整数索引
                this.vm.push(VReg.RET);
                if (args.length >= 1) {
                    this.compileExpressionAsInt(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // start (int)
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                if (args.length >= 2) {
                    this.vm.push(VReg.A1);
                    this.compileExpressionAsInt(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET); // end (int)
                    this.vm.pop(VReg.A1);
                } else {
                    this.vm.movImm(VReg.A2, -1); // -1 表示到末尾
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_array_slice");
                break;
            case "splice":
                // arr.splice(start, deleteCount?)
                // 返回被删除元素数组，并原地修改 arr
                this.vm.push(VReg.RET);
                if (args.length >= 1) {
                    this.compileExpressionAsInt(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // start (int)
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                if (args.length >= 2) {
                    this.vm.push(VReg.A1);
                    this.compileExpressionAsInt(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET); // deleteCount (int)
                    this.vm.pop(VReg.A1);
                } else {
                    this.vm.movImm(VReg.A2, -1); // -1 表示删除到末尾
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_array_splice");
                break;
            case "indexOf":
                // arr.indexOf(value)
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_indexOf");
                    // 装箱返回值为 Number 对象
                    this.boxIntAsNumber(VReg.RET);
                }
                break;
            case "includes":
                // arr.includes(value)
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_includes");
                    // 转换返回值为 NaN-boxed boolean
                    const trueLabel = this.ctx.newLabel("arr_includes_true");
                    const endLabel = this.ctx.newLabel("arr_includes_end");
                    this.vm.cmpImm(VReg.RET, 0);
                    this.vm.jne(trueLabel);
                    this.vm.movImm64(VReg.RET, "0x7ff9000000000000"); // false
                    this.vm.jmp(endLabel);
                    this.vm.label(trueLabel);
                    this.vm.movImm64(VReg.RET, "0x7ff9000000000001"); // true
                    this.vm.label(endLabel);
                }
                break;
            case "forEach":
                // arr.forEach(callback) - 编译时展开循环
                if (args.length > 0) {
                    this.compileArrayForEach(arrayExpr, args[0]);
                }
                break;
            case "map":
                // arr.map(callback) -> new array
                if (args.length > 0) {
                    this.compileArrayMap(arrayExpr, args[0]);
                }
                break;
            case "filter":
                // arr.filter(callback) -> new array
                if (args.length > 0) {
                    this.compileArrayFilter(arrayExpr, args[0]);
                }
                break;
            case "reduce":
                // arr.reduce(callback, initialValue?)
                if (args.length > 0) {
                    this.compileArrayReduce(arrayExpr, args[0], args[1]);
                }
                break;
            case "flat":
                // arr.flat(depth?) - 扁平化数组
                this.vm.push(VReg.RET);
                if (args.length > 0) {
                    this.compileExpressionAsInt(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // depth (int)
                } else {
                    this.vm.movImm(VReg.A1, 1); // 默认 depth = 1
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_array_flat");
                break;
            case "flatMap":
                // arr.flatMap(callback) - map + flat(1)
                if (args.length > 0) {
                    this.vm.push(VReg.RET);
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // callback
                    this.vm.pop(VReg.A0);
                    this.vm.call("_array_flatmap");
                }
                break;
            case "sort":
                // arr.sort() - 原地排序（数字升序）
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_array_sort");
                break;
            case "reverse":
                // arr.reverse() - 原地反转
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_array_reverse");
                break;
            case "find":
                // arr.find(callback) -> element or undefined
                if (args.length > 0) {
                    this.compileArrayFind(arrayExpr, args[0]);
                }
                break;
            case "findIndex":
                // arr.findIndex(callback) -> index or -1
                if (args.length > 0) {
                    this.compileArrayFindIndex(arrayExpr, args[0]);
                }
                break;
            case "some":
                // arr.some(callback) -> boolean
                if (args.length > 0) {
                    this.compileArraySome(arrayExpr, args[0]);
                }
                break;
            case "every":
                // arr.every(callback) -> boolean
                if (args.length > 0) {
                    this.compileArrayEvery(arrayExpr, args[0]);
                }
                break;
            default:
                break;
        }
    },

    // 编译 arr.forEach(callback) - 支持 Array 和 TypedArray
    compileArrayForEach(arrayExpr, callbackExpr) {
        // 先编译数组和回调
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__forEach_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET); // 存储 boxed array

        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__forEach_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 获取数组长度 - 调用 _array_length 来统一处理
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_array_length");
        const lenOffset = this.ctx.allocLocal(`__forEach_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__forEach_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__forEach_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("forEach_loop");
        const endLabel = this.ctx.newLabel("forEach_end");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素 - 使用 _array_get（暂时只支持普通数组）
        this.vm.load(VReg.A0, VReg.FP, arrOffset); // arr
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.call("_array_get");

        // 保存元素值
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 加载闭包并 push
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数
        this.vm.load(VReg.A0, VReg.FP, elemOffset); // element
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A2, VReg.FP, arrOffset); // array

        // 弹出闭包到 S0
        this.vm.pop(VReg.S0);

        // 调用闭包
        this.emitClosureCallAfterSetup();

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);
        this.vm.label(endLabel);

        this.vm.movImm(VReg.RET, 0); // forEach 返回 undefined
    },

    // 闭包调用的核心逻辑（S0 = 闭包对象，参数已在 A0-A5 中）
    emitClosureCallAfterSetup() {
        const vm = this.vm;
        const CLOSURE_MAGIC = 0xc105;
        const ASYNC_CLOSURE_MAGIC = 0xa51c;
        const JS_TAG_FUNCTION = 0x7fff;

        const notNanBoxedLabel = this.ctx.newLabel("cb_not_nanboxed");
        const notClosureLabel = this.ctx.newLabel("cb_not_closure");
        const callLabel = this.ctx.newLabel("cb_do_call");
        const asyncLabel = this.ctx.newLabel("cb_async");
        const doneLabel = this.ctx.newLabel("cb_done");

        // 兼容两种表示：
        // 1) NaN-boxed function JSValue (tag = 0x7FFF)
        // 2) 传统闭包对象指针（magic = 0xC105 / 0xA51C）或直接函数指针
        //
        // 如果是 NaN-boxed function，则先 _js_unbox 得到 payload 指针到 S0。
        // 注意：_js_unbox 会破坏 A0-A2，所以这里保护这三个参数（数组回调经常依赖它们）。
        vm.shrImm(VReg.S1, VReg.S0, 48);
        vm.movImm(VReg.S2, JS_TAG_FUNCTION);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jne(notNanBoxedLabel);

        vm.push(VReg.A0);
        vm.push(VReg.A1);
        vm.push(VReg.A2);
        vm.mov(VReg.A0, VReg.S0);
        vm.call("_js_unbox");
        vm.mov(VReg.S0, VReg.RET);
        vm.pop(VReg.A2);
        vm.pop(VReg.A1);
        vm.pop(VReg.A0);

        vm.label(notNanBoxedLabel);

        // 检查是否为 null/0，防止从地址 0 读取
        const nullFuncLabel = this.ctx.newLabel("method_null_func");
        vm.cmpImm(VReg.S0, 0);
        vm.jeq(nullFuncLabel);

        // 加载 magic
        vm.load(VReg.S1, VReg.S0, 0);

        // 检查是否是 async 闭包
        vm.movImm(VReg.S2, ASYNC_CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jeq(asyncLabel);

        // 检查是否是普通闭包
        vm.movImm(VReg.S2, CLOSURE_MAGIC);
        vm.cmp(VReg.S1, VReg.S2);
        vm.jne(notClosureLabel);

        // 是闭包：加载函数指针
        vm.load(VReg.S1, VReg.S0, 8);
        vm.jmp(callLabel);

        vm.label(asyncLabel);
        // async 闭包暂不支持在 forEach 回调中使用
        vm.jmp(doneLabel);

        vm.label(notClosureLabel);
        // 直接是函数指针
        vm.mov(VReg.S1, VReg.S0);
        vm.movImm(VReg.S0, 0);

        vm.label(callLabel);
        vm.callIndirect(VReg.S1);
        vm.jmp(doneLabel);

        vm.label(nullFuncLabel);
        // 函数指针为 null，返回 undefined (NaN-boxed)
        vm.movImm64(VReg.RET, "0x7ffb000000000000");

        vm.label(doneLabel);
    },

    // 编译 arr.map(callback) - 支持 Array 和 TypedArray
    compileArrayMap(arrayExpr, callbackExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__map_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 保存数组类型（用于创建同类型的结果数组）
        // TODO: 这里需要 unbox 后才能读取类型，暂时假设是普通数组
        const typeOffset = this.ctx.allocLocal(`__map_type_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0); // 普通数组类型 = 0
        this.vm.store(VReg.FP, typeOffset, VReg.V0);

        // 获取数组长度 - 使用 _array_length 函数正确处理
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_array_length");
        const lenOffset = this.ctx.allocLocal(`__map_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.RET);

        // 根据类型创建新数组
        // 检查是否是 TypedArray (类型 >= 0x40)
        this.vm.load(VReg.V1, VReg.FP, typeOffset);
        this.vm.cmpImm(VReg.V1, 0x40);
        const createTypedArray = this.ctx.newLabel("map_create_ta");
        const createDone = this.ctx.newLabel("map_create_done");
        this.vm.jge(createTypedArray);

        // 创建普通 Array - 使用运行时函数
        this.vm.load(VReg.A0, VReg.FP, lenOffset);
        this.vm.call("_array_new_with_size");
        this.vm.jmp(createDone);

        // 创建 TypedArray
        this.vm.label(createTypedArray);
        this.vm.load(VReg.A0, VReg.FP, typeOffset); // type
        this.vm.load(VReg.A1, VReg.FP, lenOffset); // length
        this.vm.call("_typed_array_new");

        this.vm.label(createDone);
        const newArrOffset = this.ctx.allocLocal(`__map_newarr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, newArrOffset, VReg.RET);

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__map_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__map_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__map_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("map_loop");
        const endLabel = this.ctx.newLabel("map_end");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素 - 使用 _array_get（暂时只支持普通数组）
        this.vm.load(VReg.A0, VReg.FP, arrOffset); // arr
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.call("_array_get");

        // 保存元素值
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 准备闭包调用
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数
        this.vm.load(VReg.A0, VReg.FP, elemOffset); // element
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A2, VReg.FP, arrOffset); // array

        // 弹出闭包并调用
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 存储结果到新数组 - 使用 _array_set（暂时只支持普通数组）
        this.vm.mov(VReg.A2, VReg.RET); // value (返回值)
        this.vm.load(VReg.A0, VReg.FP, newArrOffset); // arr
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.call("_array_set");

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);
        this.vm.label(endLabel);

        // 返回新数组
        this.vm.load(VReg.RET, VReg.FP, newArrOffset);
    },

    // 编译 arr.filter(callback) - 支持 Array 和 TypedArray
    compileArrayFilter(arrayExpr, callbackExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__filter_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 保存数组类型
        // TODO: 这里需要 unbox 后才能读取类型，暂时假设是普通数组
        const typeOffset = this.ctx.allocLocal(`__filter_type_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, typeOffset, VReg.V0);

        // 获取数组长度 - 使用 _array_length 函数
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_array_length");
        const lenOffset = this.ctx.allocLocal(`__filter_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.RET);

        // 根据类型创建新数组（最大可能大小）
        this.vm.load(VReg.V1, VReg.FP, typeOffset);
        this.vm.cmpImm(VReg.V1, 0x40);
        const createTypedArray = this.ctx.newLabel("filter_create_ta");
        const createDone = this.ctx.newLabel("filter_create_done");
        this.vm.jge(createTypedArray);

        // 创建普通 Array - 使用运行时函数（初始长度 0，用 push 添加元素）
        this.vm.movImm(VReg.A0, 0);
        this.vm.call("_array_new_with_size");
        this.vm.jmp(createDone);

        // 创建 TypedArray
        this.vm.label(createTypedArray);
        this.vm.load(VReg.A0, VReg.FP, typeOffset);
        this.vm.load(VReg.A1, VReg.FP, lenOffset);
        this.vm.call("_typed_array_new");
        // TODO: TypedArray 需要不同的处理方式

        this.vm.label(createDone);
        const newArrOffset = this.ctx.allocLocal(`__filter_newarr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, newArrOffset, VReg.RET);

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__filter_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__filter_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__filter_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("filter_loop");
        const addLabel = this.ctx.newLabel("filter_add");
        const skipLabel = this.ctx.newLabel("filter_skip");
        const endLabel = this.ctx.newLabel("filter_end");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素 - 使用 _array_get
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_array_get");

        // 保存当前元素
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 准备闭包调用
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数
        this.vm.load(VReg.A0, VReg.FP, elemOffset); // element
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A2, VReg.FP, arrOffset); // array

        // 弹出闭包并调用
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 检查返回值是否为 truthy（使用通用布尔转换）
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jeq(skipLabel);

        // 添加元素到新数组 - 使用 _array_push
        this.vm.label(addLabel);
        this.vm.load(VReg.A0, VReg.FP, newArrOffset); // arr
        this.vm.load(VReg.A1, VReg.FP, elemOffset); // value
        this.vm.call("_array_push");
        // _array_push 可能返回新的数组指针（如果扩容了）
        this.vm.store(VReg.FP, newArrOffset, VReg.RET);

        this.vm.label(skipLabel);
        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);
        this.vm.label(endLabel);

        // 返回新数组
        this.vm.load(VReg.RET, VReg.FP, newArrOffset);
    },

    // 编译 arr.reduce(callback, initialValue?)
    compileArrayReduce(arrayExpr, callbackExpr, initialValueExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__reduce_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 获取数组长度 - 使用 _array_length
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_array_length");
        const lenOffset = this.ctx.allocLocal(`__reduce_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.RET);

        // 初始化累加器
        const accOffset = this.ctx.allocLocal(`__reduce_acc_${this.nextLabelId()}`);
        if (initialValueExpr) {
            this.compileExpression(initialValueExpr);
            this.vm.store(VReg.FP, accOffset, VReg.RET);
        } else {
            // 无初始值时，使用第一个元素作为初始值
            // 使用 _array_get
            this.vm.load(VReg.A0, VReg.FP, arrOffset);
            this.vm.movImm(VReg.A1, 0);
            this.vm.call("_array_get");
            this.vm.store(VReg.FP, accOffset, VReg.RET);
        }

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__reduce_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引（如果有初始值从 0 开始，否则从 1 开始）
        const idxOffset = this.ctx.allocLocal(`__reduce_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, initialValueExpr ? 0 : 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储（在循环外分配）
        const elemOffset = this.ctx.allocLocal(`__reduce_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("reduce_loop");
        const endLabel = this.ctx.newLabel("reduce_end");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素 - 使用 _array_get
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_array_get");

        // 保存当前元素
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 准备闭包调用
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数: callback(accumulator, currentValue, index, array)
        this.vm.load(VReg.A0, VReg.FP, accOffset); // accumulator
        this.vm.load(VReg.A1, VReg.FP, elemOffset); // currentValue
        this.vm.load(VReg.A2, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A3, VReg.FP, arrOffset); // array

        // 弹出闭包并调用
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 更新累加器
        this.vm.store(VReg.FP, accOffset, VReg.RET);

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);
        this.vm.label(endLabel);

        // 返回累加器
        this.vm.load(VReg.RET, VReg.FP, accOffset);
    },

    // 编译 arr.find(callback)
    compileArrayFind(arrayExpr, callbackExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__find_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 获取数组长度
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_array_length");
        const lenOffset = this.ctx.allocLocal(`__find_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.RET);

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__find_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__find_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__find_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("find_loop");
        const foundLabel = this.ctx.newLabel("find_found");
        const endLabel = this.ctx.newLabel("find_end");
        const exitLabel = this.ctx.newLabel("find_exit");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_array_get");

        // 保存当前元素
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 准备闭包调用
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数
        this.vm.load(VReg.A0, VReg.FP, elemOffset); // element
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A2, VReg.FP, arrOffset); // array

        // 弹出闭包并调用
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 检查返回值是否为 truthy
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jne(foundLabel);

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);

        // 找到了，返回元素
        this.vm.label(foundLabel);
        this.vm.load(VReg.RET, VReg.FP, elemOffset);
        this.vm.jmp(exitLabel);

        this.vm.label(endLabel);
        // 没找到，返回 undefined
        this.vm.lea(VReg.RET, "_js_undefined");

        this.vm.label(exitLabel);
    },

    // 编译 arr.findIndex(callback)
    compileArrayFindIndex(arrayExpr, callbackExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__findidx_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 获取数组长度
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_array_length");
        const lenOffset = this.ctx.allocLocal(`__findidx_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.RET);

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__findidx_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__findidx_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__findidx_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("findidx_loop");
        const foundLabel = this.ctx.newLabel("findidx_found");
        const endLabel = this.ctx.newLabel("findidx_end");
        const exitLabel = this.ctx.newLabel("findidx_exit");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_array_get");

        // 保存当前元素
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 准备闭包调用
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数
        this.vm.load(VReg.A0, VReg.FP, elemOffset); // element
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A2, VReg.FP, arrOffset); // array

        // 弹出闭包并调用
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 检查返回值是否为 truthy
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jne(foundLabel);

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);

        // 找到了，返回索引（装箱为 Number）
        this.vm.label(foundLabel);
        this.vm.load(VReg.A0, VReg.FP, idxOffset);
        this.vm.call("_box_int32");
        this.vm.jmp(exitLabel);

        this.vm.label(endLabel);
        // 没找到，返回 -1（装箱为 Number）
        this.vm.movImm(VReg.A0, -1);
        this.vm.call("_box_int32");

        this.vm.label(exitLabel);
    },

    // 编译 arr.some(callback)
    compileArraySome(arrayExpr, callbackExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__some_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 获取数组长度
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_array_length");
        const lenOffset = this.ctx.allocLocal(`__some_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.RET);

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__some_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__some_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__some_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("some_loop");
        const foundLabel = this.ctx.newLabel("some_found");
        const endLabel = this.ctx.newLabel("some_end");
        const exitLabel = this.ctx.newLabel("some_exit");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_array_get");

        // 保存当前元素
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 准备闭包调用
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数
        this.vm.load(VReg.A0, VReg.FP, elemOffset); // element
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A2, VReg.FP, arrOffset); // array

        // 弹出闭包并调用
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 检查返回值是否为 truthy
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jne(foundLabel);

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);

        // 找到了，返回 true
        this.vm.label(foundLabel);
        this.vm.lea(VReg.RET, "_js_true");
        this.vm.jmp(exitLabel);

        this.vm.label(endLabel);
        // 没找到，返回 false
        this.vm.lea(VReg.RET, "_js_false");

        this.vm.label(exitLabel);
    },

    // 编译 arr.every(callback)
    compileArrayEvery(arrayExpr, callbackExpr) {
        // 编译数组
        this.compileExpression(arrayExpr);
        const arrOffset = this.ctx.allocLocal(`__every_arr_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, arrOffset, VReg.RET);

        // 获取数组长度
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.call("_array_length");
        const lenOffset = this.ctx.allocLocal(`__every_len_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, lenOffset, VReg.RET);

        // 编译回调
        this.compileExpression(callbackExpr);
        const cbOffset = this.ctx.allocLocal(`__every_cb_${this.nextLabelId()}`);
        this.vm.store(VReg.FP, cbOffset, VReg.RET);

        // 初始化索引
        const idxOffset = this.ctx.allocLocal(`__every_idx_${this.nextLabelId()}`);
        this.vm.movImm(VReg.V0, 0);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        // 元素临时存储
        const elemOffset = this.ctx.allocLocal(`__every_elem_${this.nextLabelId()}`);

        const loopLabel = this.ctx.newLabel("every_loop");
        const failLabel = this.ctx.newLabel("every_fail");
        const endLabel = this.ctx.newLabel("every_end");
        const exitLabel = this.ctx.newLabel("every_exit");

        this.vm.label(loopLabel);

        // 比较索引和长度
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.load(VReg.V1, VReg.FP, lenOffset);
        this.vm.cmp(VReg.V0, VReg.V1);
        this.vm.jge(endLabel);

        // 获取当前元素
        this.vm.load(VReg.A0, VReg.FP, arrOffset);
        this.vm.load(VReg.A1, VReg.FP, idxOffset);
        this.vm.call("_array_get");

        // 保存当前元素
        this.vm.store(VReg.FP, elemOffset, VReg.RET);

        // 准备闭包调用
        this.vm.load(VReg.V6, VReg.FP, cbOffset);
        this.vm.push(VReg.V6);

        // 设置参数
        this.vm.load(VReg.A0, VReg.FP, elemOffset); // element
        this.vm.load(VReg.A1, VReg.FP, idxOffset); // index
        this.vm.load(VReg.A2, VReg.FP, arrOffset); // array

        // 弹出闭包并调用
        this.vm.pop(VReg.S0);
        this.emitClosureCallAfterSetup();

        // 检查返回值是否为 falsy
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_to_boolean");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jeq(failLabel);

        // 索引++
        this.vm.load(VReg.V0, VReg.FP, idxOffset);
        this.vm.addImm(VReg.V0, VReg.V0, 1);
        this.vm.store(VReg.FP, idxOffset, VReg.V0);

        this.vm.jmp(loopLabel);

        // 有一个失败，返回 false
        this.vm.label(failLabel);
        this.vm.lea(VReg.RET, "_js_false");
        this.vm.jmp(exitLabel);

        this.vm.label(endLabel);
        // 全部通过，返回 true
        this.vm.lea(VReg.RET, "_js_true");

        this.vm.label(exitLabel);
    },

    // 编译 Map 方法调用
    // obj.set(key, value), obj.get(key), obj.has(key), obj.delete(key), obj.size
    compileMapMethod(obj, method, args) {
        // 先编译 Map 对象
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存 Map 指针

        switch (method) {
            case "set":
                // map.set(key, value)
                if (args.length >= 2) {
                    this.compileExpression(args[1]);
                    this.vm.push(VReg.RET); // 保存 value
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A2); // value
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_set");
                    return true;
                }
                break;

            case "get":
                // map.get(key)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_get");
                    return true;
                }
                break;

            case "has":
                // map.has(key)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_has");
                    // 转换 0/1 为 boxed boolean
                    const hasTrue = this.ctx.newLabel("map_has_true");
                    const hasDone = this.ctx.newLabel("map_has_done");
                    this.vm.cmpImm(VReg.RET, 0);
                    this.vm.jne(hasTrue);
                    this.vm.lea(VReg.RET, "_js_false");
                    this.vm.load(VReg.RET, VReg.RET, 0);
                    this.vm.jmp(hasDone);
                    this.vm.label(hasTrue);
                    this.vm.lea(VReg.RET, "_js_true");
                    this.vm.load(VReg.RET, VReg.RET, 0);
                    this.vm.label(hasDone);
                    return true;
                }
                break;

            case "delete":
                // map.delete(key)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // key
                    this.vm.pop(VReg.A0); // map
                    this.vm.call("_map_delete");
                    return true;
                }
                break;

            case "size":
                // map.size - 直接从头部读取 length 字段 (统一头部结构 +8)
                this.vm.pop(VReg.RET);
                this.vm.load(VReg.RET, VReg.RET, 8);
                return true;

            case "clear":
                // map.clear()
                this.vm.pop(VReg.A0);
                // 清空 Map：size = 0, head = null
                this.vm.movImm(VReg.V1, 0);
                this.vm.store(VReg.A0, 8, VReg.V1); // size = 0
                this.vm.store(VReg.A0, 16, VReg.V1); // head = null
                this.vm.mov(VReg.RET, VReg.A0);
                return true;

            case "keys":
                // map.keys() -> Iterator
                this.vm.pop(VReg.A0);
                this.vm.call("_map_keys");
                return true;

            case "values":
                // map.values() -> Iterator
                this.vm.pop(VReg.A0);
                this.vm.call("_map_values");
                return true;

            case "entries":
                // map.entries() -> Iterator (也是 @@iterator)
                this.vm.pop(VReg.A0);
                this.vm.call("_map_entries");
                return true;
        }

        this.vm.pop(VReg.RET); // 恢复栈
        return false;
    },

    // 编译 Set 方法调用
    // obj.add(value), obj.has(value), obj.delete(value), obj.size
    compileSetMethod(obj, method, args) {
        // 先编译 Set 对象
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存 Set 指针

        switch (method) {
            case "add":
                // set.add(value)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // value
                    this.vm.pop(VReg.A0); // set
                    this.vm.call("_set_add");
                    return true;
                }
                break;

            case "has":
                // set.has(value)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // value
                    this.vm.pop(VReg.A0); // set
                    this.vm.call("_set_has");
                    // 转换 0/1 为 boxed boolean
                    const setHasTrue = this.ctx.newLabel("set_has_true");
                    const setHasDone = this.ctx.newLabel("set_has_done");
                    this.vm.cmpImm(VReg.RET, 0);
                    this.vm.jne(setHasTrue);
                    this.vm.lea(VReg.RET, "_js_false");
                    this.vm.load(VReg.RET, VReg.RET, 0);
                    this.vm.jmp(setHasDone);
                    this.vm.label(setHasTrue);
                    this.vm.lea(VReg.RET, "_js_true");
                    this.vm.load(VReg.RET, VReg.RET, 0);
                    this.vm.label(setHasDone);
                    return true;
                }
                break;

            case "delete":
                // set.delete(value)
                if (args.length >= 1) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET); // value
                    this.vm.pop(VReg.A0); // set
                    this.vm.call("_set_delete");
                    return true;
                }
                break;

            case "size":
                // set.size - 直接从头部读取 length 字段 (统一头部结构 +8)
                this.vm.pop(VReg.RET);
                this.vm.load(VReg.RET, VReg.RET, 8);
                return true;

            case "clear":
                // set.clear()
                this.vm.pop(VReg.A0);
                this.vm.call("_set_clear");
                return true;

            case "values":
                this.vm.pop(VReg.A0);
                this.vm.call("_set_values");
                return true;

            case "keys":
                // Set.keys() is an alias for Set.values()
                this.vm.pop(VReg.A0);
                this.vm.call("_set_keys");
                return true;

            case "entries":
                this.vm.pop(VReg.A0);
                this.vm.call("_set_entries");
                return true;
        }

        this.vm.pop(VReg.RET); // 恢复栈
        return false;
    },

    // 编译 Date 方法调用
    // obj.getTime(), obj.toString(), obj.valueOf(), obj.toISOString()
    compileDateMethod(obj, method, args) {
        // 先编译 Date 对象
        this.compileExpression(obj);
        this.vm.mov(VReg.A0, VReg.RET);

        switch (method) {
            case "getTime":
            case "valueOf":
                // date.getTime() / date.valueOf()
                this.vm.call("_date_getTime");
                return true;

            case "toString":
                // date.toString()
                this.vm.call("_date_toString");
                return true;

            case "toISOString":
                // date.toISOString() - 输出 ISO 8601 格式
                this.vm.call("_date_toISOString");
                return true;
        }

        return false;
    },

    // 编译 RegExp 方法调用
    // obj.test(str), obj.exec(str)
    compileRegExpMethod(obj, method, args) {
        // 先编译 RegExp 对象
        this.compileExpression(obj);
        // 从 NaN-boxed 值中提取指针（低 48 位）
        this.vm.movImm64(VReg.V1, "0x0000ffffffffffff");
        this.vm.and(VReg.RET, VReg.RET, VReg.V1);
        this.vm.push(VReg.RET); // 保存 regexp 对象指针

        // 编译参数（输入字符串）
        if (args.length > 0) {
            this.compileExpression(args[0]);
            // 从 NaN-boxed 值中提取字符串指针
            this.vm.movImm64(VReg.V1, "0x0000ffffffffffff");
            this.vm.and(VReg.RET, VReg.RET, VReg.V1);
            // 如果是堆字符串，跳过 16 字节头部
            this.vm.lea(VReg.V2, "_heap_base");
            this.vm.load(VReg.V2, VReg.V2, 0);
            this.vm.cmp(VReg.RET, VReg.V2);
            const doneLabel = this.ctx.newLabel("regexp_str_done");
            this.vm.jlt(doneLabel);
            this.vm.addImm(VReg.RET, VReg.RET, 16);
            this.vm.label(doneLabel);
            this.vm.mov(VReg.A1, VReg.RET);
        } else {
            // 默认空字符串
            this.vm.lea(VReg.A1, "_str_empty");
        }

        // 恢复 regexp 对象到 A0
        this.vm.pop(VReg.A0);

        switch (method) {
            case "test":
                // regexp.test(str) - 返回布尔值
                this.vm.call("_regexp_test");
                return true;

            case "exec":
                // regexp.exec(str) - 返回结果数组或 null
                this.vm.call("_regexp_exec");
                return true;
        }

        return false;
    },

    // 编译 Buffer 实例方法调用
    // buf.toString(encoding?), buf.length
    compileBufferMethod(obj, method, args) {
        // 先编译 Buffer 对象
        this.compileExpression(obj);
        this.vm.push(VReg.RET);

        switch (method) {
            case "toString":
                // buf.toString(encoding?) -> string
                // 暂时忽略 encoding 参数，使用默认的 utf8
                this.vm.pop(VReg.A0);
                this.vm.movImm(VReg.A1, 0); // encoding = 0 (default)
                this.vm.call("_buffer_toString");
                return true;

            case "length":
                // buf.length - 从头部读取长度
                this.vm.pop(VReg.RET);
                // 解包获取指针
                this.vm.movImm64(VReg.V1, "0x0000ffffffffffff");
                this.vm.and(VReg.RET, VReg.RET, VReg.V1);
                // 读取长度 (offset 8)
                this.vm.load(VReg.RET, VReg.RET, 8);
                return true;

            case "slice":
                // buf.slice(start, end?) -> Buffer
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                if (args.length > 1) {
                    this.compileExpression(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A2, -1); // -1 表示到末尾
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_buffer_slice");
                return true;

            case "write":
                // buf.write(string, offset?, length?, encoding?)
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                    if (args.length > 1) {
                        this.compileExpression(args[1]);
                        this.vm.mov(VReg.A2, VReg.RET);
                    } else {
                        this.vm.movImm(VReg.A2, 0);
                    }
                    this.vm.pop(VReg.A0);
                    this.vm.call("_buffer_write");
                    return true;
                }
                break;
        }

        this.vm.pop(VReg.RET);
        return false;
    },

    // 编译 String 方法调用
    // str.toUpperCase(), str.toLowerCase(), str.charAt(i), str.trim() 等
    compileStringMethod(obj, method, args) {
        // 先编译字符串表达式
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存原始字符串

        switch (method) {
            case "toUpperCase":
                // str.toUpperCase() - 返回新字符串
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_str_toUpperCase");
                return true;

            case "toLowerCase":
                // str.toLowerCase() - 返回新字符串
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_str_toLowerCase");
                return true;

            case "charAt":
                // str.charAt(index) - 返回单字符字符串
                if (args.length > 0) {
                    // 数字字面量直接使用整数值
                    if (args[0].type === "Literal" && typeof args[0].value === "number") {
                        this.vm.movImm(VReg.A1, Math.trunc(args[0].value));
                    } else {
                        // 其他表达式返回 Number 对象，需要 unbox
                        this.compileExpression(args[0]);
                        this.unboxNumber(VReg.RET);
                        this.vm.fmovToFloat(0, VReg.RET);
                        this.vm.fcvtzs(VReg.A1, 0);
                    }
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_charAt");
                return true;

            case "charCodeAt":
                // str.charCodeAt(index) - 返回字符编码
                if (args.length > 0) {
                    // 数字字面量直接使用整数值
                    if (args[0].type === "Literal" && typeof args[0].value === "number") {
                        this.vm.movImm(VReg.A1, Math.trunc(args[0].value));
                    } else {
                        // 其他表达式返回 Number 对象，需要 unbox
                        this.compileExpression(args[0]);
                        this.unboxNumber(VReg.RET);
                        this.vm.fmovToFloat(0, VReg.RET);
                        this.vm.fcvtzs(VReg.A1, 0);
                    }
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_str_charCodeAt");
                // 装箱返回值为 Number 对象
                this.boxIntAsNumber(VReg.RET);
                return true;

            case "trim":
                // str.trim() - 去除首尾空白
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_str_trim");
                return true;

            case "slice":
            case "substring":
                // str.slice(start, end) / str.substring(start, end)
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存内容指针

                // 编译 start 参数
                if (args.length > 0) {
                    // 数字字面量直接使用整数值
                    if (args[0].type === "Literal" && typeof args[0].value === "number") {
                        this.vm.movImm(VReg.V0, Math.trunc(args[0].value));
                    } else {
                        // 其他表达式返回 Number 对象，需要 unbox
                        this.compileExpression(args[0]);
                        this.unboxNumber(VReg.RET);
                        this.vm.fmovToFloat(0, VReg.RET);
                        this.vm.fcvtzs(VReg.V0, 0);
                    }
                    this.vm.push(VReg.V0); // 保存 start
                } else {
                    this.vm.movImm(VReg.V0, 0);
                    this.vm.push(VReg.V0);
                }

                // 编译 end 参数
                if (args.length > 1) {
                    // 数字字面量直接使用整数值
                    if (args[1].type === "Literal" && typeof args[1].value === "number") {
                        this.vm.movImm(VReg.A2, Math.trunc(args[1].value));
                    } else {
                        // 其他表达式返回 Number 对象，需要 unbox
                        this.compileExpression(args[1]);
                        this.unboxNumber(VReg.RET);
                        this.vm.fmovToFloat(0, VReg.RET);
                        this.vm.fcvtzs(VReg.A2, 0);
                    }
                } else {
                    this.vm.movImm(VReg.A2, -1); // -1 表示到末尾
                }

                this.vm.pop(VReg.A1); // start
                this.vm.pop(VReg.A0); // str content
                this.vm.call("_str_slice");
                return true;

            case "indexOf":
                // str.indexOf(search) - 返回索引或 -1
                // 先获取原字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容指针

                // 获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET); // A1 = search 内容
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 调用 _str_indexOf(str, search)
                this.vm.pop(VReg.A0); // A0 = str 内容
                this.vm.call("_str_indexOf");
                // 装箱返回值为 Number 对象
                this.boxIntAsNumber(VReg.RET);
                return true;

            case "lastIndexOf":
                // str.lastIndexOf(search) - 返回最后出现的索引或 -1
                // 先获取原字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容指针

                // 获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET); // A1 = search 内容
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 调用 _str_lastIndexOf(str, search)
                this.vm.pop(VReg.A0); // A0 = str 内容
                this.vm.call("_str_lastIndexOf");
                // 装箱返回值为 Number 对象
                this.boxIntAsNumber(VReg.RET);
                return true;

            case "includes":
                // str.includes(search) - 返回布尔值
                // 1. 获取原字符串内容指针
                this.vm.pop(VReg.A0); // 原字符串
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容

                // 2. 编译并获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET); // A1 = search 内容
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 3. 调用 _str_includes(str, search)
                this.vm.pop(VReg.A0); // A0 = str 内容
                this.vm.call("_str_includes");
                // 返回值已经是 NaN-boxed 布尔值
                return true;

            case "startsWith":
                // str.startsWith(search) - 返回布尔值
                // 1. 获取原字符串内容指针
                this.vm.pop(VReg.A0); // 原字符串
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容

                // 2. 编译并获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 3. 调用 _str_startsWith(str, search)
                this.vm.pop(VReg.A0);
                this.vm.call("_str_startsWith");
                // 返回值已经是 NaN-boxed 布尔值
                return true;

            case "endsWith":
                // str.endsWith(search) - 返回布尔值
                // 1. 获取原字符串内容指针
                this.vm.pop(VReg.A0); // 原字符串
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容

                // 2. 编译并获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 3. 调用 _str_endsWith(str, search)
                this.vm.pop(VReg.A0);
                this.vm.call("_str_endsWith");
                // 返回值已经是 NaN-boxed 布尔值
                return true;

            case "split":
                // str.split(separator) - 返回数组
                // 先处理原字符串
                this.vm.pop(VReg.A0); // 弹出原始字符串
                this.vm.call("_getStrContent"); // 获取内容指针
                this.vm.push(VReg.RET); // 保存内容指针

                // 处理分隔符
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent"); // 分隔符也需要获取内容指针
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 恢复字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_str_split");
                return true;

            case "concat":
                // str.concat(other) - 字符串连接
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_strconcat");
                return true;

            case "match":
                // str.match(regexp) - 正则匹配
                // A0 = 字符串指针, A1 = RegExp 指针
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存字符串指针

                if (args.length > 0) {
                    this.compileExpression(args[0]); // RegExp (NaN-boxed)
                    // 从 NaN-boxed 值中提取指针（低 48 位）
                    this.vm.movImm64(VReg.V1, "0x0000ffffffffffff");
                    this.vm.and(VReg.A1, VReg.RET, VReg.V1);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0); // 恢复字符串指针
                this.vm.call("_string_regexp_match");
                return true;

            case "matchAll":
                // str.matchAll(regexp) - 返回迭代器
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存字符串指针

                if (args.length > 0) {
                    this.compileExpression(args[0]); // RegExp (NaN-boxed)
                    // 从 NaN-boxed 值中提取指针（低 48 位）
                    this.vm.movImm64(VReg.V1, "0x0000ffffffffffff");
                    this.vm.and(VReg.A1, VReg.RET, VReg.V1);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0); // 恢复字符串指针
                this.vm.call("_string_regexp_matchAll");
                return true;

            case "search":
                // str.search(regexp) - 返回匹配位置索引
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存字符串指针

                if (args.length > 0) {
                    this.compileExpression(args[0]); // RegExp (NaN-boxed)
                    // 从 NaN-boxed 值中提取指针（低 48 位）
                    this.vm.movImm64(VReg.V1, "0x0000ffffffffffff");
                    this.vm.and(VReg.A1, VReg.RET, VReg.V1);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                this.vm.pop(VReg.A0); // 恢复字符串指针
                this.vm.call("_string_regexp_search");
                // 返回整数，需要装箱为 Number
                this.boxIntAsNumber(VReg.RET);
                return true;
        }

        // 未处理的方法，弹出栈
        this.vm.pop(VReg.V0);
        return false;
    },

    // 编译 JSON 方法
    compileJSONMethod(methodName, args) {
        if (methodName === "stringify") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_JSON_stringify");
            } else {
                // 无参数返回 "undefined"
                this.vm.lea(VReg.RET, "_str_undefined");
            }
            return true;
        }

        if (methodName === "parse") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_JSON_parse");
            } else {
                // 无参数返回 undefined
                this.vm.lea(VReg.RET, "_js_undefined");
            }
            return true;
        }

        return false;
    },

    // 编译 Symbol 方法
    compileSymbolMethod(methodName, args) {
        if (methodName === "for") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_Symbol_for");
            }
            return true;
        }

        if (methodName === "keyFor") {
            if (args.length > 0) {
                this.compileExpression(args[0]);
                this.vm.mov(VReg.A0, VReg.RET);
                this.vm.call("_Symbol_keyFor");
            }
            return true;
        }

        return false;
    },

    // 带运行时类型检测的字符串方法调用
    // 当编译时无法确定类型时，需要运行时检测是否是字符串
    compileStringMethodWithTypeCheck(obj, method, args, needTypeCheck) {
        if (!needTypeCheck) {
            // 编译时已知是字符串，直接调用字符串方法
            return this.compileStringMethod(obj, method, args);
        }

        // 首先检查方法是否被支持
        const supportedMethods = ["slice", "substring", "indexOf", "lastIndexOf", "includes"];
        if (!supportedMethods.includes(method)) {
            // 方法不在支持列表中，回退到默认行为
            return false;
        }

        // 需要运行时类型检测
        // 编译对象表达式
        this.compileExpression(obj);
        this.vm.push(VReg.RET); // 保存对象

        const notStringLabel = this.ctx.newLabel("not_string");
        const endLabel = this.ctx.newLabel("method_end");

        // 调用 _typeof 获取类型
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.call("_typeof");
        // 返回值是类型字符串指针，检查是否是 "string"
        // _typeof 返回 NaN-boxed 字符串指针
        // 提取指针，比较内容
        this.vm.mov(VReg.A0, VReg.RET);
        this.vm.lea(VReg.A1, "_str_string"); // "string" 常量字符串
        this.vm.call("_strcmp");
        this.vm.cmpImm(VReg.RET, 0);
        this.vm.jne(notStringLabel);

        // 是字符串，调用字符串方法
        this.vm.pop(VReg.RET);
        this.vm.push(VReg.RET);
        // 调用字符串方法核心实现
        this.compileStringMethodCore(method, args);
        this.vm.jmp(endLabel);

        // 不是字符串，尝试数组方法
        this.vm.label(notStringLabel);
        this.vm.pop(VReg.RET);
        this.vm.push(VReg.RET); // 再次保存对象
        // 尝试调用数组方法
        this.compileArrayMethodCore(method, args);

        this.vm.label(endLabel);
        return true;
    },

    // 字符串方法核心实现（假设对象已在栈上）
    // 与 compileStringMethod 类似，但从栈获取对象
    compileStringMethodCore(method, args) {
        switch (method) {
            case "slice":
            case "substring":
                // str.slice(start, end) / str.substring(start, end)
                // 先获取字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存内容指针

                // 编译 start 参数
                if (args.length >= 1) {
                    if (args[0].type === "Literal" && typeof args[0].value === "number") {
                        this.vm.movImm(VReg.V0, Math.trunc(args[0].value));
                    } else {
                        this.compileExpression(args[0]);
                        this.unboxNumber(VReg.RET);
                        this.vm.fmovToFloat(0, VReg.RET);
                        this.vm.fcvtzs(VReg.V0, 0);
                    }
                    this.vm.push(VReg.V0); // 保存 start
                } else {
                    this.vm.movImm(VReg.V0, 0);
                    this.vm.push(VReg.V0);
                }

                // 编译 end 参数
                if (args.length >= 2) {
                    if (args[1].type === "Literal" && typeof args[1].value === "number") {
                        this.vm.movImm(VReg.A2, Math.trunc(args[1].value));
                    } else {
                        this.compileExpression(args[1]);
                        this.unboxNumber(VReg.RET);
                        this.vm.fmovToFloat(0, VReg.RET);
                        this.vm.fcvtzs(VReg.A2, 0);
                    }
                } else {
                    this.vm.movImm(VReg.A2, -1);
                }
                this.vm.pop(VReg.A1); // start
                this.vm.pop(VReg.A0); // str content
                this.vm.call("_str_slice");
                return true;

            case "indexOf":
                // str.indexOf(search) - 返回索引或 -1
                // 先获取原字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容指针

                // 获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET); // A1 = search 内容
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 调用 _str_indexOf(str, search)
                this.vm.pop(VReg.A0); // A0 = str 内容
                this.vm.call("_str_indexOf");
                // 装箱返回值为 Number 对象
                this.boxIntAsNumber(VReg.RET);
                return true;

            case "lastIndexOf":
                // str.lastIndexOf(search) - 返回最后出现的索引或 -1
                // 先获取原字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容指针

                // 获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET); // A1 = search 内容
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 调用 _str_lastIndexOf(str, search)
                this.vm.pop(VReg.A0); // A0 = str 内容
                this.vm.call("_str_lastIndexOf");
                this.boxIntAsNumber(VReg.RET);
                return true;

            case "includes":
                // str.includes(search) - 返回 boolean
                // 先获取原字符串内容指针
                this.vm.pop(VReg.A0);
                this.vm.call("_getStrContent");
                this.vm.push(VReg.RET); // 保存 str 内容指针

                // 获取 search 内容指针
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A0, VReg.RET);
                    this.vm.call("_getStrContent");
                    this.vm.mov(VReg.A1, VReg.RET); // A1 = search 内容
                } else {
                    this.vm.lea(VReg.A1, "_str_empty");
                }

                // 调用 _str_includes(str, search)
                this.vm.pop(VReg.A0); // A0 = str 内容
                this.vm.call("_str_includes");
                return true;

            default:
                return false;
        }
    },

    // 数组方法核心实现（假设对象已在栈上）
    compileArrayMethodCore(method, args) {
        switch (method) {
            case "slice":
                if (args.length >= 1) {
                    this.compileExpressionAsInt(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                } else {
                    this.vm.movImm(VReg.A1, 0);
                }
                if (args.length >= 2) {
                    this.vm.push(VReg.A1);
                    this.compileExpressionAsInt(args[1]);
                    this.vm.mov(VReg.A2, VReg.RET);
                    this.vm.pop(VReg.A1);
                } else {
                    this.vm.movImm(VReg.A2, -1);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_array_slice");
                break;

            case "indexOf":
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_array_indexOf");
                this.boxIntAsNumber(VReg.RET);
                break;

            case "includes":
                if (args.length > 0) {
                    this.compileExpression(args[0]);
                    this.vm.mov(VReg.A1, VReg.RET);
                }
                this.vm.pop(VReg.A0);
                this.vm.call("_array_includes");
                break;

            default:
                // 默认返回 undefined
                this.vm.pop(VReg.RET);
                this.vm.lea(VReg.RET, "_js_undefined");
                break;
        }
    },
};
