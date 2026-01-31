// Map 完整测试
const m = new Map();

// 数字键
m.set(1, 100);
m.set(2, 200);
console.log("m.get(1):", m.get(1));
console.log("m.get(2):", m.get(2));
console.log("m.has(1):", m.has(1));
console.log("m.has(3):", m.has(3));
console.log("m.size:", m.size);

// 字符串键
m.set("hello", "world");
console.log("m.get('hello'):", m.get("hello"));
console.log("m.has('hello'):", m.has("hello"));
console.log("m.size after string:", m.size);

// 删除
m.delete(1);
console.log("after delete(1), m.has(1):", m.has(1));
console.log("m.size after delete:", m.size);
