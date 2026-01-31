// 测试 8: 闭包
console.log("=== 测试8: 闭包 ===");

function makeCounter() {
    let count = 0;
    return function () {
        count = count + 1;
        return count;
    };
}

let counter = makeCounter();
console.log("counter():", counter());
console.log("counter():", counter());
console.log("counter():", counter());

console.log("测试8 完成");
