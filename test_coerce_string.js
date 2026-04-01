// Test _number_coerce directly
var result = Number("1");
console.log("Number('1'):", result);

// Test both directions
console.log("1 == Number('1'):", 1 == Number("1"));
console.log("Number('1') == 1:", Number("1") == 1);

// Direct comparison
var s = "1";
console.log("1 == s:", 1 == s);
console.log("s == 1:", s == 1);