// Test to understand the asymmetry bug
// 1. Number() returns float bits (not boxed)
// 2. When Number() is on LEFT side of ==, the comparison fails

var n = Number("1");
var f = 1.0;
var i = 1;

console.log("n =", n, "typeof:", typeof n);
console.log("f =", f, "typeof:", typeof f);
console.log("i =", i, "typeof:", typeof i);

// Test 1: Number() on left (fails?)
console.log("\nTest: Number() on left:");
console.log("n == 1:", n == 1);
console.log("n == f:", n == f);

// Test 2: Number() on right (works?)
console.log("\nTest: Number() on right:");
console.log("1 == n:", 1 == n);
console.log("f == n:", f == n);

// Test 3: Direct comparisons
console.log("\nTest: Direct:");
console.log("1.0 == 1:", 1.0 == 1);
console.log("1 == 1.0:", 1 == 1.0);
console.log("f == i:", f == i);
console.log("i == f:", i == f);

// Test 4: String on either side
console.log("\nTest: String:");
console.log("'1' == 1:", '1' == 1);
console.log("1 == '1':", 1 == '1');
