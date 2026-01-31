// 测试 10: JSON
console.log("=== 测试10: JSON ===");

let obj = { name: "test", value: 42 };
let jsonStr = JSON.stringify(obj);
console.log("stringify:", jsonStr);

let parsed = JSON.parse('{"x":10,"y":20}');
console.log("parsed.x:", parsed.x);
console.log("parsed.y:", parsed.y);

let arrJson = JSON.stringify([1, 2, 3]);
console.log("array json:", arrJson);

console.log("测试10 完成");
