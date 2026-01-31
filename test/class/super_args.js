// Test: Class extends with super args
class Base {
    constructor(name) {
        this.name = name;
    }
}

class Child extends Base {
    constructor(name, age) {
        super(name);
        this.age = age;
    }
}

const c = new Child("Alice", 25);
console.log(c.name); // Alice
console.log(c.age); // 25
