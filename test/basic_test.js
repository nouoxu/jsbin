// 简化测试 - 测试基础功能
console.log("=== Basic Tests ===");

// 数字
console.log("1. number:", 42);

// 字符串
console.log("2. string:", "hello");

// 布尔
console.log("3. boolean:", true);

// 数组
let arr = [1, 2, 3];
console.log("4. array length:", arr.length);

// 对象
let obj = { a: 1, b: 2 };
console.log("5. object.a:", obj.a);
console.log("6. object[b]:", obj["b"]);

// 函数
function add(a, b) {
    return a + b;
}
console.log("7. function:", add(2, 3));

// 箭头函数
let arrow = (x) => x * 2;
console.log("8. arrow:", arrow(5));

// 解构
let [x, y] = [10, 20];
console.log("9. destructure x:", x);
console.log("10. destructure y:", y);

console.log("=== Tests Complete ===");
