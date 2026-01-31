// 测试 5: flat 和 flatMap
console.log("=== 测试5: flat/flatMap ===");

let nested = [
    [1, 2],
    [3, 4],
];
let flattened = nested.flat();
console.log("flat length:", flattened.length);
console.log("flat:", flattened[0], flattened[1], flattened[2], flattened[3]);

let flatMapped = [1, 2].flatMap((x) => [x, x * 2]);
console.log("flatMap:", flatMapped[0], flatMapped[1], flatMapped[2], flatMapped[3]);

console.log("测试5 完成");
