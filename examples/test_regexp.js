// 基础功能测试 - 正则表达式

console.log("=== 正则表达式测试 ===");

// 基本字符串匹配
const re1 = /hello/;
console.log("test hello:", re1.test("hello world"));
console.log("test hi:", re1.test("hi world"));

// 点号匹配
const re2 = /h.llo/;
console.log("h.llo test hello:", re2.test("hello"));
console.log("h.llo test hallo:", re2.test("hallo"));

console.log("=== 测试完成 ===");
