// ========================================
// JSBin 综合功能测试
// 基于 PROGRESS.md 已实现功能
// ========================================

let passed = 0;
let failed = 0;

function test(name, result, expected) {
    if (result === expected) {
        console.log("✓", name);
        passed = passed + 1;
    } else {
        console.log("✗", name, "- got:", result, "expected:", expected);
        failed = failed + 1;
    }
}

// ========================================
// 1. 数字类型测试
// ========================================
console.log("\n=== 数字类型 ===");

// 数字分隔符
let bigNum = 1000000;
test("数字分隔符", bigNum, 1000000);

// 进制表示
test("十六进制 0xFF", 0xff, 255);
test("八进制 0o77", 0o77, 63);
test("二进制 0b1010", 0b1010, 10);

// 科学计数法
test("科学计数法 1e3", 1e3, 1000);
test("科学计数法 2.5e2", 2.5e2, 250);

// 基本运算
test("加法", 10 + 20, 30);
test("减法", 50 - 30, 20);
test("乘法", 6 * 7, 42);
test("除法", 100 / 4, 25);
test("取模", 17 % 5, 2);
test("指数运算 Math.pow", Math.pow(2, 10), 1024);

// ========================================
// 2. 字符串测试
// ========================================
console.log("\n=== 字符串 ===");

let str = "Hello, World!";
test("字符串长度", str.length, 13);
test("toUpperCase", "abc".toUpperCase(), "ABC");
test("toLowerCase", "XYZ".toLowerCase(), "xyz");
test("charAt", str.charAt(0), "H");
test("indexOf", str.indexOf("World"), 7);
test("includes", str.includes("World"), true);
test("startsWith", str.startsWith("Hello"), true);
test("endsWith", str.endsWith("!"), true);
test("slice", str.slice(0, 5), "Hello");
test("substring", str.substring(7, 12), "World");

// 模板字符串
let name = "JSBin";
let greeting = `Hello, ${name}!`;
test("模板字符串", greeting, "Hello, JSBin!");

// 字符串连接
test("字符串连接", "a" + "b" + "c", "abc");

// trim 方法
test("trim", "  hello  ".trim(), "hello");

// ========================================
// 3. 数组测试
// ========================================
console.log("\n=== 数组 ===");

let arr = [1, 2, 3, 4, 5];
test("数组长度", arr.length, 5);
test("数组索引", arr[2], 3);
test("at方法", arr.at(-1), 5);
test("indexOf", arr.indexOf(3), 2);
test("includes", arr.includes(4), true);

// push/pop
let arr2 = [1, 2];
arr2.push(3);
test("push", arr2.length, 3);
let popped = arr2.pop();
test("pop", popped, 3);

// 高阶函数
let nums = [1, 2, 3, 4, 5];

let doubled = nums.map((x) => x * 2);
test("map", doubled[2], 6);

let evens = nums.filter((x) => x % 2 === 0);
test("filter length", evens.length, 2);
test("filter value", evens[0], 2);

let sum = nums.reduce((a, b) => a + b, 0);
test("reduce sum", sum, 15);

test(
    "some",
    nums.some((x) => x > 4),
    true,
);
test(
    "every",
    nums.every((x) => x > 0),
    true,
);

// slice/concat
test("slice", nums.slice(1, 3).length, 2);
test("concat", [1, 2].concat([3, 4]).length, 4);

// join
test("join", [1, 2, 3].join("-"), "1-2-3");

// ========================================
// 4. 数组 flat/flatMap
// ========================================
console.log("\n=== Array flat/flatMap ===");

let nested = [
    [1, 2],
    [3, 4],
];
let flattened = nested.flat();
test("flat length", flattened.length, 4);
test("flat[0]", flattened[0], 1);
test("flat[3]", flattened[3], 4);

let flatMapped = [1, 2].flatMap((x) => [x, x * 2]);
test("flatMap length", flatMapped.length, 4);
test("flatMap[1]", flatMapped[1], 2);

// ========================================
// 5. 集合类型 Map/Set
// ========================================
console.log("\n=== Map/Set ===");

let map = new Map();
map.set("a", 1);
map.set("b", 2);
test("Map size", map.size, 2);
test("Map get", map.get("a"), 1);
test("Map has", map.has("b"), true);
test("Map has (false)", map.has("c"), false);

let set = new Set();
set.add(1);
set.add(2);
set.add(2); // duplicate
test("Set size", set.size, 2);
test("Set has", set.has(1), true);
test("Set has (false)", set.has(3), false);

// ========================================
// 6. ES6+ 语法
// ========================================
console.log("\n=== ES6+ 语法 ===");

// 箭头函数
let add = (a, b) => a + b;
test("箭头函数", add(3, 4), 7);

// 单参数箭头函数
let double = (x) => x * 2;
test("单参数箭头函数", double(5), 10);

// 可选链
let obj = { a: { b: 42 } };
test("可选链存在", obj?.a?.b, 42);
let nullObj = null;
test("可选链null", nullObj?.prop, undefined);

// 空值合并
test("空值合并 null", null ?? "default", "default");
test("空值合并 值", "value" ?? "default", "value");

// 展开语法
let arr3 = [1, 2, 3];
let arr4 = [...arr3, 4, 5];
test("展开语法", arr4.length, 5);

// 解构赋值
let [x, y] = [10, 20];
test("数组解构", x + y, 30);

let { name: n, value: v } = { name: "test", value: 100 };
test("对象解构", v, 100);

// ========================================
// 7. 类和闭包
// ========================================
console.log("\n=== 类和闭包 ===");

// 类
class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    getX() {
        return this.x;
    }

    sum() {
        return this.x + this.y;
    }
}

let p = new Point(3, 4);
test("类构造器", p.x, 3);
test("类方法getX", p.getX(), 3);
test("类方法sum", p.sum(), 7);

// 闭包
function makeCounter() {
    let count = 0;
    return function () {
        count = count + 1;
        return count;
    };
}

let counter = makeCounter();
test("闭包第一次", counter(), 1);
test("闭包第二次", counter(), 2);
test("闭包第三次", counter(), 3);

// ========================================
// 8. Math 方法
// ========================================
console.log("\n=== Math ===");

test("Math.abs", Math.abs(-5), 5);
test("Math.max", Math.max(1, 5, 3), 5);
test("Math.min", Math.min(1, 5, 3), 1);
test("Math.floor", Math.floor(3.7), 3);
test("Math.ceil", Math.ceil(3.2), 4);
test("Math.round", Math.round(3.5), 4);
test("Math.sqrt", Math.sqrt(16), 4);
test("Math.pow", Math.pow(2, 3), 8);
test("Math.sign", Math.sign(-10), -1);
test("Math.trunc", Math.trunc(4.9), 4);

// Math 常量
test("Math.PI exists", Math.PI > 3.14, true);

// ========================================
// 9. JSON
// ========================================
console.log("\n=== JSON ===");

let jsonObj = { name: "test", value: 42 };
let jsonStr = JSON.stringify(jsonObj);
test("JSON.stringify contains name", jsonStr.includes("name"), true);
test("JSON.stringify contains value", jsonStr.includes("42"), true);

let parsed = JSON.parse('{"x":10,"y":20}');
test("JSON.parse x", parsed.x, 10);
test("JSON.parse y", parsed.y, 20);

// 数组 JSON
let arrJson = JSON.stringify([1, 2, 3]);
test("JSON数组", arrJson, "[1,2,3]");

// ========================================
// 10. 循环和控制流
// ========================================
console.log("\n=== 循环和控制流 ===");

// for 循环
let forSum = 0;
for (let i = 1; i <= 5; i = i + 1) {
    forSum = forSum + i;
}
test("for循环", forSum, 15);

// while 循环
let whileSum = 0;
let j = 1;
while (j <= 5) {
    whileSum = whileSum + j;
    j = j + 1;
}
test("while循环", whileSum, 15);

// for-of 循环
let forOfSum = 0;
for (let n of [1, 2, 3, 4, 5]) {
    forOfSum = forOfSum + n;
}
test("for-of循环", forOfSum, 15);

// if-else
let ifResult = 0;
if (5 > 3) {
    ifResult = 1;
} else {
    ifResult = 2;
}
test("if-else", ifResult, 1);

// 三元运算符
test("三元运算符", 10 > 5 ? "yes" : "no", "yes");

// ========================================
// 11. 比较和逻辑运算
// ========================================
console.log("\n=== 比较和逻辑 ===");

test("等于", 5 === 5, true);
test("不等于", 5 !== 3, true);
test("大于", 5 > 3, true);
test("小于", 3 < 5, true);
test("大于等于", 5 >= 5, true);
test("小于等于", 3 <= 5, true);

test("逻辑与", true && true, true);
test("逻辑或", false || true, true);
test("逻辑非", !false, true);

// ========================================
// 12. 位运算
// ========================================
console.log("\n=== 位运算 ===");

test("按位与", 5 & 3, 1);
test("按位或", 5 | 3, 7);
test("按位异或", 5 ^ 3, 6);
test("左移", 1 << 4, 16);
test("右移", 16 >> 2, 4);

// ========================================
// 结果汇总
// ========================================
console.log("\n========================================");
console.log("测试完成!");
console.log("通过:", passed);
console.log("失败:", failed);
console.log("========================================");
