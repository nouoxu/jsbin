// 测试正则表达式
console.log("=== 测试: RegExp ===");

let re = /hello/;
let str = "hello world";

// exec
let result = re.exec(str);
console.log("exec result:", result);

// match
let matched = str.match(/world/);
console.log("match result:", matched);

console.log("测试 完成");
