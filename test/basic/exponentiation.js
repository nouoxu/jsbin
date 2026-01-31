// 测试指数运算符 **
// 注意: Number 对象与字面量的严格比较暂时有问题

console.log("Testing ** operator:");

// 基本测试 (常量折叠)
const a = 2 ** 3;
console.log("2 ** 3 =", a);

// 变量测试
let base = 3;
let exp = 4;
const b = base ** exp;
console.log("3 ** 4 =", b);

// 浮点测试
const c = 2.5 ** 2;
console.log("2.5 ** 2 =", c);

// 负指数
const d = 2 ** -1;
console.log("2 ** -1 =", d);

console.log("Done");
