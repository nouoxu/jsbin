// 测试 yield
function* gen() {
    yield 1;
    yield 2;
    return 3;
}

let g = gen();
let r1 = g.next();
console.log("r1.value =", r1.value);
console.log("r1.done =", r1.done);

let r2 = g.next();
console.log("r2.value =", r2.value);
console.log("r2.done =", r2.done);

let r3 = g.next();
console.log("r3.value =", r3.value);
console.log("r3.done =", r3.done);

let r4 = g.next();
console.log("r4.value =", r4.value);
console.log("r4.done =", r4.done);
