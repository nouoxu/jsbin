// Test: Array destructuring comprehensive
const [a, b, c] = [1, 2, 3];
console.log(a); // 1
console.log(b); // 2
console.log(c); // 3

// Skip holes
const [x, , z] = [10, 20, 30];
console.log(x); // 10
console.log(z); // 30

// String values
const [s1, s2] = ["hello", "world"];
console.log(s1); // hello
console.log(s2); // world
