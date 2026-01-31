// Advanced flatMap tests
console.log(
    "Empty callback result:",
    [1, 2, 3].flatMap((x) => []),
);
console.log(
    "Single value:",
    [1, 2, 3].flatMap((x) => x),
);
console.log(
    "Array of two:",
    [1, 2].flatMap((x) => [x, x + 10]),
);
console.log(
    "Nested flat:",
    [[1], [2], [3]].flatMap((x) => x),
);
console.log(
    "Mixed:",
    [1, [2, 3], 4].flatMap((x) => x),
);
