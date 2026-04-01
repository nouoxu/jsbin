// Test direct values
console.log("Direct 1.0 == 1:", 1.0 == 1);
console.log("Direct 1 == 1.0:", 1 == 1.0);

// Test with variable
var a = 1.0;
var b = 1;
console.log("a = 1.0, b = 1");
console.log("a == b:", a == b);
console.log("b == a:", b == a);

// Test what Number returns
var n = Number("1");
console.log("n = Number('1')");
console.log("n == 1:", n == 1);
console.log("1 == n:", 1 == n);

// Test: is n actually 1?
console.log("n > 0:", n > 0);
console.log("n < 2:", n < 2);
console.log("1 - n:", 1 - n);