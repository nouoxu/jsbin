// 更详细的调试
let x = 5;
let y = 3;

// 先测试表达式值
let r1 = x > y; // 5 > 3 = true
console.log("5 > 3 =", r1);

let r2 = x < y; // 5 < 3 = false
console.log("5 < 3 =", r2);

// 测试 if
if (r1) {
    console.log("r1 (true) -> if branch");
} else {
    console.log("r1 (true) -> else branch");
}

if (r2) {
    console.log("r2 (false) -> if branch");
} else {
    console.log("r2 (false) -> else branch");
}

// 直接在 if 中比较
if (x > y) {
    console.log("x > y direct -> if branch (expect this)");
} else {
    console.log("x > y direct -> else branch");
}

if (x < y) {
    console.log("x < y direct -> if branch");
} else {
    console.log("x < y direct -> else branch (expect this)");
}
