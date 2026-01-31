// Comprehensive equality test
let passed = 0;
let failed = 0;

function test(name, result, expected) {
    if (result === expected) {
        console.log("PASS:", name);
        passed = passed + 1;
    } else {
        console.log("FAIL:", name, "expected", expected, "got", result);
        failed = failed + 1;
    }
}

// Boolean tests
test("true === true", true === true, true);
test("false === false", false === false, true);
test("true === false", true === false, false);
test("true !== false", true !== false, true);

// Number tests
test("42 === 42", 42 === 42, true);
test("42 === 43", 42 === 43, false);
test("3.14 === 3.14", 3.14 === 3.14, true);
test("3.14 === 3.15", 3.14 === 3.15, false);
test("0 === 0", 0 === 0, true);
test("-1 === -1", -1 === -1, true);

// String tests
test("hello === hello", "hello" === "hello", true);
test("hello === world", "hello" === "world", false);
test("empty === empty", "" === "", true);

// Variable comparison
let n = 42;
let s = "test";
let b = true;
test("n === 42", n === 42, true);
test("s === test", s === "test", true);
test("b === true", b === true, true);
test("n !== 43", n !== 43, true);
test("s !== other", s !== "other", true);

// Cross-type should be false (strict equality)
// Note: In JSBin, cross-type comparison needs runtime type check
// For now, we test same-type comparisons

console.log("");
console.log("Results:", passed, "passed,", failed, "failed");
