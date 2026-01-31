// 测试异常处理
console.log("=== 测试: try/catch ===");

let result = 0;

try {
    result = 1;
    throw "error";
    result = 2;
} catch (e) {
    result = 3;
}

console.log("result after try/catch:", result);

// try/finally
let result2 = 0;
try {
    result2 = 10;
} finally {
    result2 = result2 + 5;
}
console.log("result after try/finally:", result2);

console.log("测试 完成");
