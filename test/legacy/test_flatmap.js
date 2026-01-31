let a = [1, 2, 3];
console.log("flatMap test:");
let b = a.flatMap(x => [x, x * 2]);
console.log(b);
