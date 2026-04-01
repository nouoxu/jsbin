// Test specific cases with explicit comparisons
console.log("Test 1: Direct comparison");
console.log("1 == 1:", 1 == 1);

console.log("\nTest 2: Float vs Int32");
console.log("1.0 == 1:", 1.0 == 1);

console.log("\nTest 3: String vs Number (case 3)");
console.log("'1' == 1:", '1' == 1);
console.log("'2' == 2:", '2' == 2);

console.log("\nTest 4: Number vs String (case 4)");
console.log("1 == '1':", 1 == '1');
console.log("1 == '2':", 1 == '2');

console.log("\nTest 5: Float vs String");
console.log("1.0 == '1':", 1.0 == '1');
console.log("2.0 == '2':", 2.0 == '2');

console.log("\nTest 6: Multi-digit");
console.log("42 == '42':", 42 == '42');
console.log("123 == '123':", 123 == '123');
