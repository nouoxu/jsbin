// Test case 4 with variables and literals
var s = "1";
var n = 1;

console.log("=== Variable cases ===");
console.log("n == s:", n == s);  // Should be true
console.log("s == n:", s == n);  // Should be true

console.log("=== Literal cases ===");
console.log("1 == '1':", 1 == '1');  // Should be true
console.log("'1' == 1:", '1' == 1);  // Should be true

console.log("=== Mixed cases ===");
console.log("n == '1':", n == '1');  // Should be true
console.log("1 == s:", 1 == s);  // Should be true