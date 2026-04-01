// Simple debug to understand the issue
var result;

result = 1 == "1";
console.log("1 == '1':", result);

result = "1" == 1;
console.log("'1' == 1:", result);

// Now with explicit conversion
var n = 1;
var s = "1";
result = n == s;
console.log("n == s:", result);

// Test with forced types
result = Number(1) == Number("1");
console.log("Number(1) == Number('1'):", result);