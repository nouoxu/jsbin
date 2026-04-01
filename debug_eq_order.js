// Test if the issue is with order of evaluation
var n = Number("1");
console.log("After assignment, n =", n);

// What if we compare in the opposite order?
var result1 = n == 1;
var result2 = 1 == n;
console.log("n == 1:", result1);
console.log("1 == n:", result2);

// What about using a function to delay the comparison?
function test1() { return n == 1; }
function test2() { return 1 == n; }
console.log("n == 1 (via function):", test1());
console.log("1 == n (via function):", test2());
