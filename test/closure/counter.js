// Test: Closure counter
function makeCounter() {
    let count = 0;
    return function () {
        count = count + 1;
        return count;
    };
}

const counter = makeCounter();
console.log(counter()); // Should be 1
console.log(counter()); // Should be 2
console.log(counter()); // Should be 3
