// 测试多个展开
let a = [1, 2];
let b = [3, 4];
let c = [...a, ...b];
console.log("multiple spread:", c);

// 展开在中间
let d = [0, ...a, 5];
console.log("spread in middle:", d);

// 只有展开
let e = [...b];
console.log("only spread:", e);
