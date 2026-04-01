// Minimal test - check different types of equality
var n = 1;
var f = 1.0;
var s = "1";

// Variable vs literal (should work)
console.log("n == 1:", n == 1);  // Int32 var vs Int32 literal
console.log("1 == n:", 1 == n);  // Int32 literal vs Int32 var

// Float vs string (case 4 with Float)
console.log("f == '1':", f == '1');  // Float literal vs String literal
console.log("'1' == f:", '1' == f);  // String literal vs Float literal

// String vs string
console.log("s == '1':", s == '1');  // String var vs String literal
console.log("'1' == s:", '1' == s);  // String literal vs String var
