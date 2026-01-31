// 测试 3: 数组基础
console.log("=== 测试3: 数组 ===");
let arr = [1, 2, 3, 4, 5];
console.log("length:", arr.length);
console.log("arr[0]:", arr[0]);
console.log("arr[2]:", arr[2]);

arr.push(6);
console.log("after push, length:", arr.length);

let popped = arr.pop();
console.log("popped:", popped);

console.log("测试3 完成");
