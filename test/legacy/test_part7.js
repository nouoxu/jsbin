// 测试 7: 类
console.log("=== 测试7: 类 ===");

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    getX() {
        return this.x;
    }

    sum() {
        return this.x + this.y;
    }
}

let p = new Point(3, 4);
console.log("p.x:", p.x);
console.log("p.y:", p.y);
console.log("p.getX():", p.getX());
console.log("p.sum():", p.sum());

console.log("测试7 完成");
