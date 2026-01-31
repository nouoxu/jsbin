// Test constant folding and dead code elimination

// 1. 常量折叠 - 数字运算
let a = 2 + 3; // 应编译为 5
let b = 10 * 4 - 5; // 应编译为 35
let c = 2 ** 10; // 应编译为 1024

print("Constant folding:");
print(a); // 5
print(b); // 35
print(c); // 1024

// 2. 常量折叠 - 位运算
let d = 0xff & 0x0f; // 应编译为 15
let e = 1 << 4; // 应编译为 16
let f = 0xff >> 4; // 应编译为 15

print("Bitwise folding:");
print(d); // 15
print(e); // 16
print(f); // 15

// 3. 常量折叠 - 字符串
let s = "Hello" + " " + "World"; // 应编译为 "Hello World"
print("String folding:");
print(s); // Hello World

// 4. 死代码消除 - if (true)
if (true) {
    print("if(true): executed");
} else {
    print("if(true): should NOT appear");
}

// 5. 死代码消除 - if (false)
if (false) {
    print("if(false): should NOT appear");
} else {
    print("if(false): else executed");
}

// 6. 死代码消除 - if (1 > 2)
if (1 > 2) {
    print("1>2: should NOT appear");
}
print("1>2: skipped correctly");

// 7. 死代码消除 - while (false)
while (false) {
    print("while(false): should NOT appear");
}
print("while(false): skipped correctly");

print("All optimization tests passed!");
