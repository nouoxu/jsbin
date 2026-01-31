// Test: Simple class extends
class Base {
    constructor() {
        this.x = 10;
    }
}

class Child extends Base {
    constructor() {
        super();
        this.y = 20;
    }
}

const c = new Child();
console.log(c.x); // 10
console.log(c.y); // 20
