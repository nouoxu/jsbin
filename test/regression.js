// JSBin 回归测试套件
// 用于验证各项功能是否正常工作

let passed = 0;
let failed = 0;

function test(name, condition) {
    if (condition) {
        console.log("[PASS]", name);
        passed = passed + 1;
    } else {
        console.log("[FAIL]", name);
        failed = failed + 1;
    }
}

// ========== 基础类型 ==========
console.log("\n=== 基础类型 ===");
test("number literal", 42 === 42);
test("string literal", "hello" === "hello");
test("boolean true", true === true);
test("boolean false", false === false);
test("null", null === null);
test("undefined", undefined === undefined);

// ========== typeof 运算符 ==========
console.log("\n=== typeof ===");
test("typeof number", typeof 42 === "number");
test("typeof string", typeof "hello" === "string");
test("typeof boolean", typeof true === "boolean");
test("typeof undefined", typeof undefined === "undefined");
test("typeof null", typeof null === "object");
test("typeof function", typeof function () {} === "function");
test("typeof object", typeof {} === "object");
test("typeof array", typeof [] === "object");

// ========== 数字进制 ==========
console.log("\n=== 数字进制 ===");
test("hex 0xFF", 0xff === 255);
test("octal 0o77", 0o77 === 63);
test("binary 0b1010", 0b1010 === 10);
test("number separator", 1_000_000 === 1000000);

// ========== 字符串方法 ==========
console.log("\n=== 字符串方法 ===");
test("string.length", "hello".length === 5);
test("string.charAt", "hello".charAt(1) === "e");
test("string.indexOf", "hello".indexOf("l") === 2);
test("string.includes", "hello".includes("ell") === true);
test("string.startsWith", "hello".startsWith("hel") === true);
test("string.endsWith", "hello".endsWith("lo") === true);
test("string.slice", "hello".slice(1, 4) === "ell");
test("string.toUpperCase", "hello".toUpperCase() === "HELLO");
test("string.toLowerCase", "HELLO".toLowerCase() === "hello");
test("string.trim", "  hi  ".trim() === "hi");

// ========== 数组方法 ==========
console.log("\n=== 数组方法 ===");
let arr = [1, 2, 3];
test("array.length", arr.length === 3);
test("array[0]", arr[0] === 1);
test("array.push", (arr.push(4), arr.length === 4));
test("array.pop", arr.pop() === 4);
test("array.indexOf", arr.indexOf(2) === 1);
test("array.includes", arr.includes(3) === true);

let arr2 = [3, 1, 2];
arr2.sort();
test("array.sort", arr2[0] === 1);

let mapped = [1, 2, 3].map(function (x) {
    return x * 2;
});
test("array.map", mapped[1] === 4);

let filtered = [1, 2, 3, 4].filter(function (x) {
    return x > 2;
});
test("array.filter", filtered.length === 2);

let sum = [1, 2, 3].reduce(function (a, b) {
    return a + b;
}, 0);
test("array.reduce", sum === 6);

// ========== 对象 ==========
console.log("\n=== 对象 ===");
let obj = { a: 1, b: 2 };
test("object property", obj.a === 1);
test("object bracket", obj["b"] === 2);
obj.c = 3;
test("object assign", obj.c === 3);

// ========== 运算符 ==========
console.log("\n=== 运算符 ===");
test("optional chain ?.", null?.foo === undefined);
test("nullish coalesce ??", (null ?? 5) === 5);
test("nullish default", (0 ?? 5) === 0);
test("spread array", [...[1, 2, 3]].length === 3);

// ========== 解构赋值 ==========
console.log("\n=== 解构赋值 ===");
let [x, y] = [10, 20];
test("array destructure", x === 10);
let { p, q } = { p: 100, q: 200 };
test("object destructure", p === 100);

// ========== 函数 ==========
console.log("\n=== 函数 ===");
function add(a, b) {
    return a + b;
}
test("function call", add(2, 3) === 5);

let arrow = (a, b) => a + b;
test("arrow function", arrow(2, 3) === 5);

function defaultParam(a, b = 10) {
    return a + b;
}
test("default param", defaultParam(5) === 15);

// ========== 闭包 ==========
console.log("\n=== 闭包 ===");
function makeCounter() {
    let count = 0;
    return function () {
        count = count + 1;
        return count;
    };
}
let counter = makeCounter();
test("closure call 1", counter() === 1);
test("closure call 2", counter() === 2);
test("closure call 3", counter() === 3);

// ========== 类 ==========
console.log("\n=== 类 ===");
class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    getX() {
        return this.x;
    }
}
let pt = new Point(3, 4);
test("class constructor", pt.x === 3);
test("class method", pt.getX() === 3);

// ========== Map/Set ==========
console.log("\n=== Map/Set ===");
let m = new Map();
m.set("a", 1);
m.set("b", 2);
test("map.get", m.get("a") === 1);
test("map.has", m.has("b") === true);
test("map.size", m.size === 2);

let s = new Set();
s.add(1);
s.add(2);
s.add(1);
test("set.has", s.has(1) === true);
test("set.size", s.size === 2);

// ========== JSON ==========
console.log("\n=== JSON ===");
test("JSON.stringify null", JSON.stringify(null) === "null");
test("JSON.stringify number", JSON.stringify(42) === "42");
test("JSON.stringify string", JSON.stringify("hi") === '"hi"');
test("JSON.stringify array", JSON.stringify([1, 2]) === "[1,2]");

let parsed = JSON.parse('{"a":1}');
test("JSON.parse object", parsed.a === 1);
let parsedArr = JSON.parse("[1,2,3]");
test("JSON.parse array", parsedArr[1] === 2);

// ========== Math ==========
console.log("\n=== Math ===");
test("Math.abs", Math.abs(-5) === 5);
test("Math.max", Math.max(1, 2, 3) === 3);
test("Math.min", Math.min(1, 2, 3) === 1);
test("Math.floor", Math.floor(3.7) === 3);
test("Math.ceil", Math.ceil(3.2) === 4);
test("Math.round", Math.round(3.5) === 4);
test("Math.sqrt", Math.sqrt(4) === 2);
test("Math.pow", Math.pow(2, 3) === 8);

// ========== RegExp ==========
console.log("\n=== RegExp ===");
let re = /hello/;
test("regexp.test true", re.test("hello world") === true);
test("regexp.test false", re.test("hi world") === false);

let re2 = /\d+/;
test("regexp digit", re2.test("abc123") === true);

// ========== 循环 ==========
console.log("\n=== 循环 ===");
let forSum = 0;
for (let i = 0; i < 5; i++) {
    forSum = forSum + i;
}
test("for loop", forSum === 10);

let whileSum = 0;
let wi = 0;
while (wi < 5) {
    whileSum = whileSum + wi;
    wi = wi + 1;
}
test("while loop", whileSum === 10);

let forOfSum = 0;
for (let v of [1, 2, 3, 4]) {
    forOfSum = forOfSum + v;
}
test("for-of loop", forOfSum === 10);

// ========== Generator ==========
console.log("\n=== Generator ===");
function* gen() {
    yield 1;
    yield 2;
    return 3;
}
let g = gen();
let r1 = g.next();
test("generator yield 1", r1.value === 1);
test("generator done false", r1.done === false);
let r2 = g.next();
test("generator yield 2", r2.value === 2);
let r3 = g.next();
test("generator return", r3.value === 3);
test("generator done true", r3.done === true);

// ========== 模板字符串 ==========
console.log("\n=== 模板字符串 ===");
let name = "World";
let tmpl = `Hello, ${name}!`;
test("template string", tmpl === "Hello, World!");

// ========== 结果汇总 ==========
console.log("\n=== 测试结果 ===");
console.log("Passed:", passed);
console.log("Failed:", failed);
console.log("Total:", passed + failed);
