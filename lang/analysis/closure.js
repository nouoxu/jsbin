// JSBin - 闭包分析模块
// 分析函数表达式中捕获的外部变量

// 检查是否是内置函数或全局对象
export function isBuiltinOrGlobal(name) {
    const builtins = ["print", "console", "Promise", "Uint8Array", "Buffer", "Math", "sleep", "Array", "Object", "String", "Number", "Boolean", "Date", "RegExp", "JSON", "Error", "undefined", "null", "NaN", "Infinity"];
    return builtins.includes(name);
}

// Node keys constants to avoid allocation
const KEYS_BODY = ["body"];
const KEYS_EXPRESSION = ["expression"];
const KEYS_IF = ["test", "consequent", "alternate"];
const KEYS_CALL = ["callee", "arguments"];
const KEYS_MEMBER = ["object", "property"];
const KEYS_BINARY = ["left", "right"];
const KEYS_ARGUMENT = ["argument"];
const KEYS_DECLARATIONS = ["declarations"];
const KEYS_VAR_DECL = ["id", "init"];
const KEYS_EMPTY = [];
const KEYS_W_TEST_BODY = ["test", "body"];
const KEYS_W_LEFT_RIGHT_BODY = ["left", "right", "body"];

// Helper to safely iterate children without generic for..in
function getChildKeys(node) {
    if (!node) return KEYS_EMPTY;
    switch (node.type) {
        case "Program":
        case "BlockStatement":
            return KEYS_BODY;
        case "ExpressionStatement":
            return KEYS_EXPRESSION;
        case "IfStatement":
            return KEYS_IF;
        case "CallExpression":
            return KEYS_CALL;
        case "MemberExpression":
            return KEYS_MEMBER;
        case "AssignmentExpression":
        case "BinaryExpression":
        case "LogicalExpression":
            return KEYS_BINARY;
        case "UnaryExpression":
        case "UpdateExpression":
            return KEYS_ARGUMENT;
        case "FunctionDeclaration":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
            return KEYS_BODY; // params are handled specially
        case "VariableDeclaration":
            return KEYS_DECLARATIONS;
        case "VariableDeclarator":
            return KEYS_VAR_DECL;
        case "ReturnStatement":
            return KEYS_ARGUMENT;
        case "Identifier":
            return KEYS_EMPTY;
        case "Literal":
            return KEYS_EMPTY;
        case "ArrayExpression":
            return ["elements"];
        case "ObjectExpression":
            return ["properties"];
        case "Property":
            return ["key", "value"];
        case "NewExpression":
            return KEYS_CALL;
        case "ThisExpression":
            return KEYS_EMPTY;
        case "SequenceExpression":
            return ["expressions"];
        case "ConditionalExpression":
            return KEYS_IF;
        case "SwitchStatement":
            return ["discriminant", "cases"];
        case "SwitchCase":
            return ["test", "consequent"];
        case "BreakStatement":
        case "ContinueStatement":
            return ["label"];
        case "TryStatement":
            return ["block", "handler", "finalizer"];
        case "CatchClause":
            return ["param", "body"];
        case "ThrowStatement":
            return KEYS_ARGUMENT;
        case "WhileStatement":
        case "DoWhileStatement":
            return KEYS_W_TEST_BODY;
        case "ForStatement":
            return ["init", "test", "update", "body"];
        case "ForInStatement":
        case "ForOfStatement":
            return KEYS_W_LEFT_RIGHT_BODY;
        case "TemplateLiteral":
            return ["quasis", "expressions"];
        case "TemplateElement":
            return KEYS_EMPTY;
        default:
            return KEYS_EMPTY; // Unknown node type, skip safe iteration or add as needed
    }
}

// 分析函数表达式中捕获的外部变量
// 返回需要捕获的变量名数组
export function analyzeCapturedVariables(funcExpr, outerLocals, functions) {
    const params = funcExpr.params || [];
    const paramNames = {};
    for (let i = 0; i < params.length; i++) {
        if (params[i].type === "Identifier") {
            paramNames[params[i].name] = true;
        }
    }

    // 收集函数体中声明的局部变量
    const localVars = {};
    collectLocalDeclarations(funcExpr.body, localVars);

    // 收集所有引用的变量
    const referenced = {};
    collectReferencedVariables(funcExpr.body, referenced);

    // 递归收集嵌套函数需要的外部变量
    collectNestedFunctionReferences(funcExpr.body, referenced, { ...paramNames, ...localVars });

    // 对于箭头函数，检查是否引用了 this
    // 箭头函数的 this 是词法绑定的，需要从外层捕获 __this
    if (funcExpr.type === "ArrowFunctionExpression") {
        const usesThis = containsThisExpression(funcExpr.body);
        if (usesThis && outerLocals && outerLocals["__this"] !== undefined) {
            referenced["__this"] = true;
        }
    }

    // 找出需要捕获的变量
    const captured = [];
    for (const name in referenced) {
        // 跳过参数和局部变量
        if (paramNames[name]) continue;
        if (localVars[name]) continue;
        // 跳过全局函数和内置函数
        if (functions && functions[name]) continue;
        if (isBuiltinOrGlobal(name)) continue;

        // 检查是否在外部作用域中
        if (outerLocals && outerLocals[name] !== undefined) {
            captured.push(name);
        }
    }

    return captured;
}

// 检查节点中是否包含 ThisExpression
function containsThisExpression(node) {
    if (!node) return false;

    if (node.type === "ThisExpression") {
        return true;
    }

    // 不进入嵌套的非箭头函数（它们有自己的 this）
    if (node.type === "FunctionExpression" || node.type === "FunctionDeclaration") {
        return false;
    }

    // 对于箭头函数，需要继续检查（箭头函数继承外层 this）
    // 不过这里主要检查当前层级的 this 使用即可
    if (node.type === "ArrowFunctionExpression") {
        // 嵌套箭头函数中的 this 也需要从外层捕获
        return containsThisExpression(node.body);
    }

    // 递归检查子节点
    const keys = getChildKeys(node);
    for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
            for (let i = 0; i < child.length; i++) {
                if (containsThisExpression(child[i])) return true;
            }
        } else if (child) {
            if (containsThisExpression(child)) return true;
        }
    }

    return false;
}

// 收集函数体中声明的局部变量
export function collectLocalDeclarations(node, vars) {
    if (!node) return;

    if (node.type === "VariableDeclaration") {
        const decls = node.declarations || [];
        for (let i = 0; i < decls.length; i++) {
            if (decls[i].id && decls[i].id.type === "Identifier") {
                vars[decls[i].id.name] = true;
            }
        }
    } else if (node.type === "BlockStatement") {
        const body = node.body || [];
        for (let i = 0; i < body.length; i++) {
            collectLocalDeclarations(body[i], vars);
        }
    } else if (node.type === "IfStatement") {
        collectLocalDeclarations(node.consequent, vars);
        if (node.alternate) {
            collectLocalDeclarations(node.alternate, vars);
        }
    } else if (node.type === "WhileStatement" || node.type === "DoWhileStatement") {
        collectLocalDeclarations(node.body, vars);
    } else if (node.type === "ForStatement") {
        if (node.init) {
            collectLocalDeclarations(node.init, vars);
        }
        collectLocalDeclarations(node.body, vars);
    } else if (node.type === "ForInStatement" || node.type === "ForOfStatement") {
        if (node.left && node.left.type === "VariableDeclaration") {
            collectLocalDeclarations(node.left, vars);
        }
        collectLocalDeclarations(node.body, vars);
    } else if (node.type === "TryStatement") {
        collectLocalDeclarations(node.block, vars);
        if (node.handler) {
            if (node.handler.param && node.handler.param.type === "Identifier") {
                vars[node.handler.param.name] = true;
            }
            collectLocalDeclarations(node.handler.body, vars);
        }
        if (node.finalizer) {
            collectLocalDeclarations(node.finalizer, vars);
        }
    } else if (node.type === "SwitchStatement") {
        const cases = node.cases || [];
        for (let i = 0; i < cases.length; i++) {
            const c = cases[i];
            for (let j = 0; j < c.consequent.length; j++) {
                collectLocalDeclarations(c.consequent[j], vars);
            }
        }
    }
}

// 收集引用的变量
export function collectReferencedVariables(node, referenced) {
    if (!node) return;

    if (node.type === "Identifier") {
        referenced[node.name] = true;
        return;
    }

    // 不进入嵌套函数
    if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression" || node.type === "FunctionDeclaration") {
        return;
    }

    // 对象属性的 key 不算引用
    if (node.type === "MemberExpression" && !node.computed) {
        collectReferencedVariables(node.object, referenced);
        return;
    }

    if (node.type === "Property" && !node.computed) {
        collectReferencedVariables(node.value, referenced);
        return;
    }

    // 递归遍历子节点
    const keys = getChildKeys(node);
    for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
            for (let i = 0; i < child.length; i++) {
                collectReferencedVariables(child[i], referenced);
            }
        } else if (child) {
            collectReferencedVariables(child, referenced);
        }
    }
}

// 递归收集嵌套函数中引用的外部变量
export function collectNestedFunctionReferences(node, referenced, localScope) {
    if (!node) return;

    if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression" || node.type === "FunctionDeclaration") {
        // 对于嵌套函数，收集它引用但不在它自己局部作用域中的变量
        const nestedParams = {};
        if (node.params) {
            for (let i = 0; i < node.params.length; i++) {
                if (node.params[i].type === "Identifier") {
                    nestedParams[node.params[i].name] = true;
                }
            }
        }

        const nestedLocals = {};
        collectLocalDeclarations(node.body, nestedLocals);

        const nestedReferenced = {};
        collectReferencedVariables(node.body, nestedReferenced);

        // 递归处理更深层的嵌套
        const nestedLocalScope = { ...nestedParams, ...nestedLocals };
        collectNestedFunctionReferences(node.body, nestedReferenced, nestedLocalScope);

        // 找出嵌套函数引用但不在它自己作用域中的变量
        for (const name in nestedReferenced) {
            if (nestedParams[name]) continue;
            if (nestedLocals[name]) continue;
            // 如果这个变量也不在当前函数的局部作用域中，说明它需要从更外层捕获
            if (!localScope[name]) {
                referenced[name] = true;
            }
        }
        return; // 不继续遍历函数体
    }

    // 递归遍历子节点
    const keys = getChildKeys(node);
    for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
            for (let i = 0; i < child.length; i++) {
                collectNestedFunctionReferences(child[i], referenced, localScope);
            }
        } else if (child) {
            collectNestedFunctionReferences(child, referenced, localScope);
        }
    }
}

// Helper function to avoid closure allocation and recursion depth issues
function visitSharedVariables(root, localVars, sharedVars) {
    if (!root) return;
    const stack = [root];

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;

        if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression" || node.type === "FunctionDeclaration") {
            // 分析这个嵌套函数捕获了哪些变量
            const captured = analyzeCapturedVariables(node, localVars, null);
            for (const name of captured) {
                sharedVars.add(name);
            }
            continue; // 不继续深入嵌套函数
        }

        const keys = getChildKeys(node);
        // Push in reverse order to traverse left-to-right (stack is LIFO)
        for (let i = keys.length - 1; i >= 0; i--) {
            const key = keys[i];
            const child = node[key];
            if (Array.isArray(child)) {
                for (let j = child.length - 1; j >= 0; j--) {
                    if (child[j]) stack.push(child[j]);
                }
            } else if (child) {
                stack.push(child);
            }
        }
    }
}

let funcIdCounter = 0;

// 分析哪些变量需要被共享（被嵌套函数捕获）
export function analyzeSharedVariables(func) {
    if (func && typeof func === "object" && !func.__debug_uid) {
        func.__debug_uid = ++funcIdCounter;
    }
    const uid = func && func.__debug_uid ? func.__debug_uid : "fail";

    const funcName = func && func.id ? func.id.name : "(anonymous)";
    const funcInfo = func && func.type ? func.type + (func.loc ? " line:" + func.loc.start.line : "") : "unknown-type";

    // console.log("DEBUG: analyzeSharedVariables entry for " + funcName + " " + funcInfo + " UID:" + uid);

    // Check if we are stuck
    if (uid === "fail") {
        console.log("DEBUG: FAIL logging func: " + JSON.stringify(func));
        throw new Error("analyzeSharedVariables called with invalid object");
    }

    console.log("DEBUG: analyzeSharedVariables entry for " + funcName + " " + funcInfo + " UID:" + uid);
    const sharedVars = new Set();

    // 收集当前函数的局部变量和参数
    const params = func.params || [];
    const localVars = {};

    for (let i = 0; i < params.length; i++) {
        if (params[i].type === "Identifier") {
            localVars[params[i].name] = true;
        }
    }
    // collectLocalDeclarations(func.body, localVars);

    if (func.body) {
        visitSharedVariables(func.body, localVars, sharedVars);
    }

    return sharedVars;
}

// 分析程序顶层：哪些变量会被顶层函数声明捕获
// 这与 analyzeSharedVariables 不同，因为顶层函数声明是在主程序作用域外定义的
// 但它们可以访问主程序中的变量
export function analyzeTopLevelSharedVariables(ast) {
    console.log("DEBUG: analyzeTopLevelSharedVariables start. ast.type=" + (ast ? ast.type : "null"));
    const sharedVars = new Set();

    // 收集主程序中的局部变量（非函数声明语句）
    const mainLocalVars = {};
    if (ast && ast.body && Array.isArray(ast.body)) {
        console.log("DEBUG: ast.body length=" + ast.body.length);
        for (let i = 0; i < ast.body.length; i++) {
            const stmt = ast.body[i];
            if (stmt.type !== "FunctionDeclaration") {
                collectLocalDeclarations(stmt, mainLocalVars);
            }
        }
    } else {
        console.log("DEBUG: ast.body is invalid");
    }
    console.log("DEBUG: mainLocalVars collected");

    // 分析每个顶层函数声明捕获了哪些主程序变量
    let funcCount = 0;
    if (ast && ast.body && Array.isArray(ast.body)) {
        for (let i = 0; i < ast.body.length; i++) {
            const stmt = ast.body[i];
            if (stmt.type === "FunctionDeclaration") {
                funcCount++;
                const captured = analyzeCapturedVariables(stmt, mainLocalVars, null);
                for (const name of captured) {
                    sharedVars.add(name);
                }
            }
        }
    }
    console.log("DEBUG: analyzeTopLevelSharedVariables done");

    return sharedVars;
}

// 检测函数体中是否使用了 arguments 对象
// 返回 true 如果函数使用了 arguments
export function usesArgumentsObject(func) {
    if (!func || !func.body) {
        return false;
    }

    // 箭头函数没有自己的 arguments
    if (func.type === "ArrowFunctionExpression") {
        return false;
    }

    let found = false;

    function traverse(node) {
        if (!node || found) return;

        // 如果进入内部函数，不继续搜索（内部函数有自己的 arguments）
        if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
            return;
        }

        if (node.type === "Identifier" && node.name === "arguments") {
            found = true;
            return;
        }

        // 递归遍历子节点
        const keys = getChildKeys(node);
        for (const key of keys) {
            const child = node[key];
            if (Array.isArray(child)) {
                for (const item of child) {
                    traverse(item);
                }
            } else if (child && typeof child === "object") {
                traverse(child);
            }
        }
    }

    traverse(func.body);
    return found;
}
