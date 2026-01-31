let a = [1, 2, 3];
console.log("simple array flat:");
let b = a.flat();
console.log(b);

let nested = [[1, 2], [3, 4]];
console.log("nested array flat:");
let c = nested.flat();
console.log(c);

let deep = [[1, [2, 3]], [4]];
console.log("deep nested:");
console.log(deep);
let d = deep.flat();
console.log("flat(1):");
console.log(d);
let e = deep.flat(2);
console.log("flat(2):");
console.log(e);
