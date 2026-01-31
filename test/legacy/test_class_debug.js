// Debug class prototype chain
class Foo {
    constructor() {
        this.x = 42;
    }

    getX() {
        return this.x;
    }
}

let f = new Foo();
console.log("f.x:", f.x);
// Try to access method directly as property first
// console.log("f.getX as func:", f.getX);  // This might help debug
console.log("Calling f.getX()...");
let result = f.getX();
console.log("result:", result);
