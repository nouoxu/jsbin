// Test closures
function makeCounter() {
    let count = 0;
    return function () {
        count = count + 1;
        return count;
    };
}

let counter = makeCounter();
console.log("counter:", counter(), counter(), counter());

// Test closure with captured variable in array callback
let multiplier = 10;
let arr = [1, 2, 3];
console.log(
    "map with closure:",
    arr.map((x) => x * multiplier),
);
