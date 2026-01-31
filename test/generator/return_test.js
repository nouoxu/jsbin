function* gen() {
    return 42;
}
let g = gen();
let r = g.next();
console.log("r.value =", r.value);
console.log("r.done =", r.done);
