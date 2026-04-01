var n = Number("1");
var a = 1.0;
console.log("n = Number('1') =", n);
console.log("a = 1.0 =", a);
console.log("n == a:", n == a);  // Should be true if both are 1.0
console.log("a == n:", a == n);  // Should be true

// What about directly?
console.log();
console.log("Number('1') == 1.0:", Number("1") == 1.0);
console.log("1.0 == Number('1'):", 1.0 == Number("1"));
console.log("Number('1') == 1:", Number("1") == 1);
console.log("1 == Number('1'):", 1 == Number("1"));
