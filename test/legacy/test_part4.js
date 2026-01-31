// 测试 4: 数组高阶函数
console.log("=== 测试4: 数组高阶函数 ===");
let arr = [1, 2, 3, 4, 5];

// forEach
let forEachSum = 0;
arr.forEach((x) => {
    forEachSum = forEachSum + x;
});
console.log("forEach sum:", forEachSum);

// map
let doubled = arr.map((x) => x * 2);
console.log("map:", doubled[0], doubled[1], doubled[2]);

// filter
let evens = arr.filter((x) => x % 2 === 0);
console.log("filter evens:", evens.length);

// reduce
let sum = arr.reduce((a, b) => a + b, 0);
console.log("reduce sum:", sum);

console.log("测试4 完成");
