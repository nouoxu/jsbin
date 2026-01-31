// 类测试

console.log("=== 类测试 ===");

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    toString() {
        return "Point(" + this.x + ", " + this.y + ")";
    }
}

const p = new Point(3, 4);
console.log("创建 Point");
console.log("x:", p.x);
console.log("y:", p.y);

console.log("=== 测试完成 ===");
