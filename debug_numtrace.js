// Let's trace what Number returns
var n = Number("1");
console.log("After Number: n =", n);

// Direct operations to check n's value
console.log("n + 0:", n + 0);
console.log("n * 1:", n * 1);
console.log("n / 1:", n / 1);

// Check identity
console.log("n === n:", n === n);

// And compare
console.log("n == 1:", n == 1);
console.log("1 == n:", 1 == n);

// Let's also test what the raw number value is
console.log("n - 0:", n - 0);
console.log("0 + n:", 0 + n);
