// 只测试布尔变量在 if 中
let flag = false;
console.log("flag =", flag);

if (flag) {
    console.log("flag is truthy");
} else {
    console.log("flag is falsy");
}

flag = true;
console.log("flag =", flag);

if (flag) {
    console.log("flag is truthy");
} else {
    console.log("flag is falsy");
}
