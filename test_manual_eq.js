// Simple test: manual equality
var a = 1;
var b = 1.0;
var c = '1';

console.log("Testing manual comparisons:");
console.log("a == b:", a == b);  // Int32 1 == Float 1.0
console.log("a == c:", a == c);  // Int32 1 == String '1'
console.log("b == c:", b == c);  // Float 1.0 == String '1'

console.log("\nTesting direct values:");
console.log("1 == 1:", 1 == 1);
console.log("1 == 1.0:", 1 == 1.0);
console.log("1 == '1':", 1 == '1');
console.log("1.0 == '1':", 1.0 == '1');
