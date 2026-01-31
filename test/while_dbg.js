// 调试 while 循环
let i = 0;
let count = 0;

while (i < 3) {
    console.log("loop: i =", i, ", count =", count);
    count++;
    if (count > 5) {
        console.log("breaking out!");
        break;
    }
    i++;
}
console.log("done i =", i);
