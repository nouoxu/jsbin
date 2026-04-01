// Debug test for abstract equality
var s = "1";
var n = 1;

// These should all be true
console.log("Testing loose equality:");
console.log("1 == '1':", 1 == '1');
console.log("'1' == 1:", '1' == 1);
console.log("1.0 == '1':", 1.0 == '1');
console.log("'1' == 1.0:", '1' == 1.0);
console.log("");
console.log("n == 1:", n == 1);
console.log("1 == n:", 1 == n);
console.log("s == '1':", s == '1');
console.log("'1' == s:", '1' == s);
console.log("n == s:", n == s);
console.log("s == n:", s == n);
console.log("");
console.log("'1' == '1':", '1' == '1');
console.log("1 == 1:", 1 == 1);
