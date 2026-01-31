// Test various array methods
let arr = [1, 2, 3, 4, 5];

// forEach
let sum = 0;
arr.forEach((x) => {
    sum = sum + x;
});
console.log("forEach sum:", sum);

// map
console.log(
    "map:",
    arr.map((x) => x * 2),
);

// filter
console.log(
    "filter:",
    arr.filter((x) => x > 2),
);

// reduce
console.log(
    "reduce:",
    arr.reduce((acc, x) => acc + x, 0),
);

// flat
console.log(
    "flat:",
    [
        [1, 2],
        [3, 4],
    ].flat(),
);

// flatMap
console.log(
    "flatMap:",
    [1, 2, 3].flatMap((x) => [x, x * 2]),
);
