// Test to check if we can manually call _abstract_eq
var n = Number("1");
var i = 1;
var f = 1.0;

// These should all call _abstract_eq with same types on each side
// But the results are different based on order!

console.log("Test 1: f == i (both variables)");
console.log("f == i:", f == i);  // What happens here?

console.log("\nTest 2: f == 1 (literal on right)");
console.log("f == 1:", f == 1);  // false!

console.log("\nTest 3: 1 == f (literal on left)");
console.log("1 == f:", 1 == f);  // true

console.log("\nTest 4: n == i (Number() result vs variable)");
console.log("n == i:", n == i);  // true?

console.log("\nTest 5: n == 1 (Number() result vs literal)");
console.log("n == 1:", n == 1);  // false!

console.log("\nTest 6: 1 == n (literal vs Number() result)");
console.log("1 == n:", 1 == n);  // true
