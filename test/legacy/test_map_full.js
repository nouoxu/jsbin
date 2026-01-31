// 逐步测试 - Map
console.log("=== Map test ===");
let map = new Map();
map.set("a", 1);
map.set("b", 2);
// console.log("Map size:", map.size);  // 这个会段错误
console.log("Map get a:", map.get("a"));
console.log("Map has b:", map.has("b"));
console.log("Map test done");
