// 测试 JSON.parse (已知问题: 运行时崩溃)
const obj = JSON.parse('{"a": 1}');
console.log(obj.a);
