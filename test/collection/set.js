// 测试 Set (已知问题: has 返回错误值)
const s = new Set();
s.add(1);
s.add(2);
console.log(s.has(1));
console.log(s.size);
