// Test to check what values are actually being compared
var n = Number("1");
var f = 1.0;

// Print hex values to see what we're dealing with
console.log("n in hex:", n);
console.log("f in hex:", f);
console.log("1 in hex:", 1);

// Direct comparisons
console.log("n == 1:", n == 1);
console.log("n == f:", n == f);
console.log("f == 1:", f == 1);

// Now test with explicit Int32
var i = 1;
console.log("i == n:", i == n);
console.log("n == i:", n == i);
