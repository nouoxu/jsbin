// 测试空值合并赋值运算符 ??=
// @expected: PASS x4

console.log("Testing ??= operator:");

let a = null;
a ??= 10;
console.log("a (null ??= 10) =", a);
if (a === 10) console.log("PASS");
else console.log("FAIL");

let b = undefined;
b ??= 20;
console.log("b (undefined ??= 20) =", b);
if (b === 20) console.log("PASS");
else console.log("FAIL");

let c = 5;
c ??= 30;
console.log("c (5 ??= 30) =", c);
if (c === 5) console.log("PASS");
else console.log("FAIL");

let d = 0;
d ??= 40;
console.log("d (0 ??= 40) =", d);
if (d === 0) console.log("PASS");
else console.log("FAIL");
