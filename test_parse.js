// Check what AST types are produced
console.log("Test 1: 1 as NumericLiteral vs Literal");
var a = 1;
console.log("a =", a);

console.log("\nTest 2: Direct comparisons");
var f = 1.0;
console.log("f =", f);
console.log("f == 1:", f == 1);
console.log("1 == f:", 1 == f);

console.log("\nTest 3: Check type inference");
var x = 1;  // This might be NumericLiteral
console.log("x == 1:", x == 1);
console.log("1 == x:", 1 == x);
