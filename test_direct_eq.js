// Direct test - which path through _abstract_eq is taken?
// Force different type combinations
var f = 1.0;
var i = 1;
var n = Number("1");

// Force different paths
console.log("Float vs Int32 (f vs i):", f == i);  // Should convert Int32 to Float
console.log("Int32 vs Float (i vs f):", i == f);  // Should convert Int32 to Float

// String vs Number (string literal)
console.log("'1' == 1:", '1' == 1);  // String vs Number
console.log("1 == '1':", 1 == '1');  // Number vs String

// Number() result vs literal
console.log("n == 1:", n == 1);  // Float vs Int32
console.log("1 == n:", 1 == n);  // Int32 vs Float
