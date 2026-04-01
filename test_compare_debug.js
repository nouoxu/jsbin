// Debug test for _abstract_eq types
// We can't directly check types, but we can compare behavior

// Case 3: String == Number (works)
// '1' == 1
console.log("Case 3 - String == Number:");
console.log("  '1' == 1:", '1' == 1);

// Case 4: Number == String (broken)
// 1 == '1'
console.log("Case 4 - Number == String:");
console.log("  1 == '1':", 1 == '1');

// Let's see if the issue is with the Number being on left
console.log("--- Testing with variable swap ---");
var a = 1;
var b = "1";
console.log("a == b (var Number == var String):", a == b);
console.log("b == a (var String == var Number):", b == a);

// Let's check if Int32 vs Float matters
console.log("--- Int32 vs Float ---");
var x = 1;
var y = "1";
console.log("x == y:", x == y);  // x is Int32, should work
console.log("y == x:", y == x);  // x is Int32, should work

// Now with explicit float
var f = 1.0;
console.log("f == y (float == string):", f == y);
console.log("y == f (string == float):", y == f);