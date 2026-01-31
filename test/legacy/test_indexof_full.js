// String.indexOf 综合测试
let str = "hello world";

// 基础测试
console.log(str.indexOf("o")); // 应该是 4
console.log(str.indexOf("world")); // 应该是 6
console.log(str.indexOf("xyz")); // 应该是 -1
console.log(str.indexOf("")); // 应该是 0

// 单字符测试
console.log("test".indexOf("e")); // 应该是 1
console.log("test".indexOf("t")); // 应该是 0
console.log("test".indexOf("x")); // 应该是 -1
