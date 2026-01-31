// JSON.parse 基础测试

// 测试布尔值
console.log("=== Boolean ===");
console.log(JSON.parse("true"));
console.log(JSON.parse("false"));

// 测试 null
console.log("=== Null ===");
console.log(JSON.parse("null"));

// 测试数字
console.log("=== Number ===");
console.log(JSON.parse("42"));
console.log(JSON.parse("-123"));
console.log(JSON.parse("0"));

// 测试字符串
console.log("=== String ===");
console.log(JSON.parse('"hello"'));
console.log(JSON.parse('"world"'));

// 测试数组
console.log("=== Array ===");
let arr = JSON.parse("[1, 2, 3]");
console.log(arr[0]);
console.log(arr[1]);
console.log(arr[2]);

// 测试对象
console.log("=== Object ===");
let obj = JSON.parse('{"a": 1, "b": 2}');
console.log(obj.a);
console.log(obj.b);
