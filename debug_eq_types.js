// Test to understand what f is
var n = Number("1");
var f = 1.0;
console.log("n =", n, "typeof n:", typeof n);
console.log("f =", f, "typeof f:", typeof f);

// n equals f (both are 1.0 according to ==)
console.log("n == f:", n == f);

// But what about f vs 1 directly?
console.log("f == 1:", f == 1);
console.log("1 == f:", 1 == f);

// And n vs 1
console.log("n == 1:", n == 1);
console.log("1 == n:", 1 == n);

// Let's see if there's something different about how 1 is stored
var x = 1;  // No .0
console.log("x = 1, typeof x:", typeof x);
console.log("x == 1:", x == 1);
console.log("1 == x:", 1 == x);
console.log("n == x:", n == x);