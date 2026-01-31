// Test flat() method
console.log(
    "Basic flat:",
    [
        [1, 2],
        [3, 4],
    ].flat(),
);
console.log("Nested flat:", [1, [2, [3, 4]]].flat());
console.log("Empty arrays:", [1, [], 2, [], 3].flat());
