// Test the original issue: 1 == "1"
console.log("Testing original issue:");
console.log("1 == '1':", 1 == "1");
console.log("'1' == 1:", "1" == 1);
console.log("'1' == '1':", "1" == "1");

// Also test other string == number cases
console.log();
console.log("1 == '2':", 1 == "2");
console.log("'2' == 1:", "2" == 1);
