// 迭代器协议测试

// 测试数组 for...of
let arr = [1, 2, 3, 4, 5];
console.log("Array for...of:");
for (let x of arr) {
    console.log(x);
}

// 测试字符串 for...of
console.log("String for...of:");
let str = "hello";
for (let ch of str) {
    console.log(ch);
}

// 测试数组 keys(), values(), entries()
console.log("Array keys():");
for (let k of arr.keys()) {
    console.log(k);
}

console.log("Array entries():");
for (let e of arr.entries()) {
    console.log(e);
}

// 测试 Map
let map = new Map();
map.set("a", 1);
map.set("b", 2);

console.log("Map entries():");
for (let e of map) {
    console.log(e);
}

// 测试 Set
let set = new Set();
set.add(10);
set.add(20);
set.add(30);

console.log("Set values():");
for (let v of set) {
    console.log(v);
}
