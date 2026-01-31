// 测试 12: 循环
console.log("=== 测试12: 循环 ===");

// for 循环
let sum1 = 0;
for (let i = 1; i <= 5; i = i + 1) {
    sum1 = sum1 + i;
}
console.log("for loop sum:", sum1);

// while 循环
let sum2 = 0;
let j = 1;
while (j <= 5) {
    sum2 = sum2 + j;
    j = j + 1;
}
console.log("while loop sum:", sum2);

// for-of 循环
let sum3 = 0;
for (let n of [1, 2, 3, 4, 5]) {
    sum3 = sum3 + n;
}
console.log("for-of loop sum:", sum3);

console.log("测试12 完成");
