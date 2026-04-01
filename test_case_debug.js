// Test specific cases
console.log("Test 1: Direct comparison");
console.log("1 == 1:", 1 == 1);

console.log("\nTest 2: Float vs Int32");
console.log("1.0 == 1:", 1.0 == 1);

console.log("\nTest 3: String vs Number (case 3 - working)");
console.log("'1' == 1:", '1' == 1);

console.log("\nTest 4: Number vs String (case 4 - broken)");
console.log("1 == '1':", 1 == '1');

console.log("\nTest 5: Float vs String");
console.log("1.0 == '1':", 1.0 == '1');
