// Test class with method
class Foo {
    constructor() {
        this.x = 42;
    }

    getX() {
        return this.x;
    }
}

let f = new Foo();
console.log("f.x direct:", f.x);
console.log("f.getX():", f.getX());
