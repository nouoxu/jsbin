// 直接测试带布尔的 while 循环
let i = 0;
let keepGoing = true;

while (keepGoing) {
    console.log("i =", i);
    i++;
    if (i >= 3) {
        keepGoing = false;
    }
}
console.log("done");
