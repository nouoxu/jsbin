// 导出的数学函数模块

// 命名导出 - 加法
export function add(a, b) {
    return a + b;
}

// 命名导出 - 减法
export function subtract(a, b) {
    return a - b;
}

// 命名导出 - 乘法
export function multiply(a, b) {
    return a * b;
}

// 导出的常量
export const PI = 3.14159;

// 默认导出
export default function calculator(a, b, op) {
    if (op === 0) return add(a, b);
    if (op === 1) return subtract(a, b);
    if (op === 2) return multiply(a, b);
    return 0;
}
