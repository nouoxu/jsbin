// JSBin 功能演示

console.log("====================================");
console.log("     JSBin 编译器功能演示");
console.log("====================================");

// 1. 基本类型
console.log("\n--- 1. 基本类型 ---");
const num = 42;
const str = "Hello, JSBin!";
const bool = true;
console.log("数字:", num);
console.log("字符串:", str);
console.log("布尔值:", bool);

// 2. 运算符
console.log("\n--- 2. 运算符 ---");
console.log("加法: 10 + 5 =", 10 + 5);
console.log("减法: 10 - 5 =", 10 - 5);
console.log("乘法: 10 * 5 =", 10 * 5);
console.log("除法: 10 / 5 =", 10 / 5);
console.log("取模: 10 % 3 =", 10 % 3);

// 3. 控制流
console.log("\n--- 3. 控制流 ---");
const x = 15;
if (x > 10) {
    console.log("x > 10");
} else {
    console.log("x <= 10");
}

// 4. 循环
console.log("\n--- 4. 循环 ---");
for (let i = 1; i <= 5; i++) {
    console.log("  计数:", i);
}

// 5. 函数
console.log("\n--- 5. 函数 ---");
function add(a, b) {
    return a + b;
}
console.log("add(3, 4) =", add(3, 4));

// 6. 箭头函数
console.log("\n--- 6. 箭头函数 ---");
const multiply = (a, b) => a * b;
console.log("multiply(3, 4) =", multiply(3, 4));

// 7. 闭包
console.log("\n--- 7. 闭包 ---");
function createCounter() {
    let count = 0;
    return () => {
        count++;
        return count;
    };
}
const counter = createCounter();
console.log("counter():", counter());
console.log("counter():", counter());
console.log("counter():", counter());

// 8. async/await
console.log("\n--- 8. Async/Await ---");
async function asyncTest() {
    const value = await Promise.resolve(100);
    console.log("await Promise.resolve(100):", value);
    return value * 2;
}
asyncTest().then((result) => {
    console.log("async 返回值:", result);
});

// 9. Promise
console.log("\n--- 9. Promise ---");
Promise.resolve(42)
    .then((v) => {
        console.log("Promise then:", v);
        return v + 8;
    })
    .then((v) => {
        console.log("链式 then:", v);
    });

// 10. Math
console.log("\n--- 10. Math ---");
console.log("Math.PI:", Math.PI);
console.log("Math.sqrt(16):", Math.sqrt(16));
console.log("Math.abs(-5):", Math.abs(-5));
console.log("Math.max(1, 5, 3):", Math.max(1, 5, 3));

console.log("\n====================================");
console.log("     测试完成!");
console.log("====================================");
