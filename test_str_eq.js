// Test String == Number specifically
var s = "1";
var n = Number("1");

console.log("s =", s, "typeof:", typeof s);
console.log("n =", n, "typeof:", typeof n);

console.log("\nDirect string vs number:");
console.log("'1' == 1:", '1' == 1);
console.log("1 == '1':", 1 == '1');

console.log("\nVariable vs literal:");
console.log("s == 1:", s == 1);
console.log("1 == s:", 1 == s);

console.log("\nVariable vs variable:");
console.log("s == n:", s == n);
console.log("n == s:", n == s);
