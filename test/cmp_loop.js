// 简化到极致
let cmp = 0 < 3;
console.log("cmp =", cmp);

if (cmp) {
    console.log("cmp is truthy in if");
} else {
    console.log("cmp is falsy in if");
}

let cnt = 0;
while (cmp) {
    console.log("in loop cnt =", cnt);
    cnt++;
    if (cnt >= 3) {
        cmp = false;
        console.log("setting cmp = false");
    }
}
console.log("done");
