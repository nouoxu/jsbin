// Test class functionality
class Counter {
    constructor(start) {
        this.value = start;
    }

    increment() {
        this.value = this.value + 1;
        return this.value;
    }

    getValue() {
        return this.value;
    }
}

let c = new Counter(5);
console.log("Initial:", c.getValue());
console.log("After increment:", c.increment());
console.log("After increment:", c.increment());
console.log("Final:", c.getValue());
