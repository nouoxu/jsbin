// debug: check inner array is boxed
let inner = [1];
let outer = [inner];
console.log("inner:");
console.log(inner);
console.log("outer:");
console.log(outer);
console.log("outer[0]:");
console.log(outer[0]);
console.log("flat:");
let b = outer.flat();
console.log(b);
