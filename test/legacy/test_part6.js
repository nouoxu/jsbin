// 测试 6: Map 和 Set
console.log("=== 测试6: Map/Set ===");

let map = new Map();
map.set("a", 1);
map.set("b", 2);
console.log("Map size:", map.size);
console.log("Map get a:", map.get("a"));
console.log("Map has b:", map.has("b"));

let set = new Set();
set.add(1);
set.add(2);
set.add(2);
console.log("Set size:", set.size);
console.log("Set has 1:", set.has(1));

console.log("测试6 完成");
