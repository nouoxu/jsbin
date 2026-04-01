// Test if function call result on left side of == has issues
var n = Number("1");
console.log("n == 1:", n == 1);
console.log("1 == n:", 1 == n);

// Direct calls
console.log("Number('1') == 1:", Number("1") == 1);
console.log("1 == Number('1'):", 1 == Number("1"));

// What about parseInt?
console.log("parseInt('1') == 1:", parseInt("1") == 1);
console.log("1 == parseInt('1'):", 1 == parseInt("1"));
