// 模拟 for 循环
let i = 0;
console.log("i =", i);

// 第一次测试条件
let test1 = i < 3;
console.log("i < 3 =", test1);

// 增量
i = i + 1;
console.log("after i++ i =", i);

// 第二次测试条件
let test2 = i < 3;
console.log("i < 3 =", test2);

// 再次增量
i = i + 1;
console.log("after i++ i =", i);

// 第三次测试条件
let test3 = i < 3;
console.log("i < 3 =", test3);

// 再次增量
i = i + 1;
console.log("after i++ i =", i);

// 第四次测试条件 - 应该 false
let test4 = i < 3;
console.log("i < 3 =", test4);
