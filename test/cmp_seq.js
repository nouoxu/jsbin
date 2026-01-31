// 在比较结果检查后打印
let i = 0;
console.log("i =", i);

// 测试 1
let cmp1 = i < 3;
console.log("i < 3 =", cmp1);

i = 1;
console.log("i =", i);

// 测试 2
let cmp2 = i < 3;
console.log("i < 3 =", cmp2);

i = 2;
console.log("i =", i);

// 测试 3
let cmp3 = i < 3;
console.log("i < 3 =", cmp3);

i = 3;
console.log("i =", i);

// 测试 4 - should be false
let cmp4 = i < 3;
console.log("i < 3 =", cmp4);
