// Debug case 4 (Number == String)
// Case 4 is entered when y is String and x is Number

// Test case 3 (String == Number) which works
console.log("=== Case 3 (String == Number) - should be true ===");
console.log("'1' == 1:", '1' == 1);

// Test case 4 (Number == String) which fails
console.log("=== Case 4 (Number == String) - should be true ===");
console.log("1 == '1':", 1 == '1');

// Test with variables
var a = 1;
var b = "1";
console.log("=== Variables ===");
console.log("a == b:", a == b);
console.log("b == a:", b == a);

// Test Number() to verify _str_to_num works for data ptr strings
console.log("=== Number() function ===");
console.log("Number('1'):", Number('1'));
console.log("Number('42'):", Number('42'));

// Test with only literals
console.log("=== All literal ===");
console.log("1 == 1:", 1 == 1);
console.log("'1' == '1':", '1' == '1');