// 测试 11: ES6+ 语法
console.log("=== 测试11: ES6+ ===");

// 箭头函数
let add = (a, b) => a + b;
console.log("arrow add(3,4):", add(3, 4));

// 模板字符串
let name = "World";
console.log(`Hello, ${name}!`);

// 可选链
let obj = { a: { b: 42 } };
console.log("obj?.a?.b:", obj?.a?.b);

// 空值合并
console.log("null ?? default:", null ?? "default");

// 展开
let arr = [1, 2, 3];
let arr2 = [...arr, 4, 5];
console.log("spread length:", arr2.length);

console.log("测试11 完成");
