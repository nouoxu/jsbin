// 空数组
let empty = [];
console.log("empty.flat():", empty.flat());

// 已经是平的数组
let flat = [1, 2, 3];
console.log("flat.flat():", flat.flat());

// 深度为0
let nested = [[1], [2]];
console.log("nested.flat(0):", nested.flat(0));

// 非常深的嵌套
let deep = [[[1]]];
console.log("deep:", deep);
console.log("deep.flat(1):", deep.flat(1));
console.log("deep.flat(2):", deep.flat(2));
console.log("deep.flat(3):", deep.flat(3));
