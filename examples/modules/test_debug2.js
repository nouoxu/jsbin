import { getNumber } from "./returns.js";

// 尝试在函数调用后打印固定值
let n = getNumber();
print(999); // 这应该输出 999
print(n); // 这应该输出 42
