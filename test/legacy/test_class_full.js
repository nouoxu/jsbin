class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    
    getX() {
        return this.x;
    }
    
    getY() {
        return this.y;
    }
    
    add(other) {
        let nx = this.x + other.getX();
        let ny = this.y + other.getY();
        return new Point(nx, ny);
    }
}

let p1 = new Point(1, 2);
let p2 = new Point(3, 4);

console.log("p1:", p1.x, p1.y);
console.log("p2:", p2.x, p2.y);

let p3 = p1.add(p2);
console.log("p3 = p1.add(p2):", p3.x, p3.y);
