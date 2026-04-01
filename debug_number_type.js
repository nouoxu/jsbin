// Test if Number returns primitive or object
var n = Number("1");
console.log("n =", n, "typeof:", typeof n);

// Direct property access would fail if it's a primitive
// But we can't easily test this without causing errors

// Let's try to see if n behaves like a primitive
console.log("n + 1:", n + 1);
console.log("n - 0:", n - 0);
console.log("typeof (n + 1):", typeof (n + 1));

// And compare to direct float
var f = 1.0;
console.log("f =", f, "typeof:", typeof f);
console.log("f + 1:", f + 1);

// Direct comparison
console.log("n == f:", n == f);
console.log("f == n:", f == n);