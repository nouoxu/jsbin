// 测试数组元素直接 vs 数组打印
var a = [42];

// 这个应该工作
var elem = a[0];
console.log("Direct elem:", elem);

// 手动打印数组
console.log("[");
console.log(a[0]);
console.log("]");

// 这个不工作
console.log("Array:", a);
