// 基础类型测试
console.log("=== 数字类型 ===");

// 进制表示
console.log("0xFF =", 0xff);
console.log("0o77 =", 0o77);
console.log("0b1010 =", 0b1010);

// 科学计数法
console.log("1e3 =", 1e3);

// 基本运算
console.log("10 + 20 =", 10 + 20);
console.log("6 * 7 =", 6 * 7);
console.log("17 % 5 =", 17 % 5);

console.log("\n=== 字符串 ===");
let str = "Hello";
console.log("length:", str.length);
console.log("toUpperCase:", "abc".toUpperCase());
console.log("indexOf:", "hello world".indexOf("world"));

console.log("\n=== 数组 ===");
let arr = [1, 2, 3, 4, 5];
console.log("length:", arr.length);
console.log("arr[2]:", arr[2]);

let doubled = arr.map((x) => x * 2);
console.log("mapped:", doubled[0], doubled[1], doubled[2]);

let sum = arr.reduce((a, b) => a + b, 0);
console.log("reduce sum:", sum);

console.log("\n=== 完成 ===");
