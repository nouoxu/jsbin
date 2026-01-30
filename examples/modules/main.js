// 测试模块导入

import { add, subtract, multiply } from "./math.js";

// 测试导入的函数
let sum = add(10, 5);
console.log(sum); // 应该输出 15

let diff = subtract(10, 5);
console.log(diff); // 应该输出 5

let product = multiply(10, 5);
console.log(product); // 应该输出 50

// 测试组合使用
let result = add(multiply(3, 4), subtract(10, 2));
console.log(result); // 应该输出 12 + 8 = 20
