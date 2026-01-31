// 正则表达式测试

console.log("=== RegExp 测试 ===");

// 使用 new RegExp 构造
const re1 = new RegExp("hello");
console.log("创建 RegExp: hello");

// test 方法
const testStr = "hello world";
console.log("test hello world:", re1.test(testStr));

const testStr2 = "hi world";
console.log("test hi world:", re1.test(testStr2));

console.log("=== 测试完成 ===");
