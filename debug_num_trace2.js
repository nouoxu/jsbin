// Let's see what values we're comparing
var n = Number("1");

// Test comparison with explicit types
console.log("Testing n:");
console.log("n =", n);
console.log("typeof n =", typeof n);
console.log("n == n:", n == n);

// Test what happens when we use Number directly in comparison
console.log();
console.log("Direct Number comparison:");
console.log("Number('1') == Number('1'):", Number("1") == Number("1"));
console.log("Number('1') == 1:", Number("1") == 1);
console.log("1 == Number('1'):", 1 == Number("1"));

// Test what the right operand is
console.log();
var right = 1;
console.log("right = 1, typeof right =", typeof right);
console.log("n == right:", n == right);
