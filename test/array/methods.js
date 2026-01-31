// 测试数组方法
const arr = [1, 2, 3];
const result = arr.map((x) => x * 2);
console.log(result[0], result[1], result[2]);

const filtered = [1, 2, 3, 4].filter((x) => x > 2);
console.log(filtered.length, filtered[0], filtered[1]);

const sum = [1, 2, 3].reduce((a, b) => a + b, 0);
console.log(sum);
