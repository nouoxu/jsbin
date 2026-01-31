// P1 功能测试 - Generator, AsyncGenerator, 私有字段, 正则引擎

console.log("=== P1 功能测试 ===\n");

// ============================================
// 测试 1: Generator (生成器)
// ============================================
console.log("--- 测试 1: Generator ---");

function* simpleGenerator() {
    yield 1;
    yield 2;
    yield 3;
}

const gen = simpleGenerator();
console.log("gen.next():", gen.next().value); // 1
console.log("gen.next():", gen.next().value); // 2
console.log("gen.next():", gen.next().value); // 3
console.log("gen.next().done:", gen.next().done); // true

// 带参数的 Generator
function* countUp(start) {
    let n = start;
    while (true) {
        const reset = yield n;
        if (reset) {
            n = start;
        } else {
            n++;
        }
    }
}

const counter = countUp(10);
console.log("counter:", counter.next().value); // 10
console.log("counter:", counter.next().value); // 11
console.log("counter (reset):", counter.next(true).value); // 10

// 斐波那契数列 Generator
function* fibonacci() {
    let a = 0,
        b = 1;
    while (true) {
        yield a;
        [a, b] = [b, a + b];
    }
}

const fib = fibonacci();
console.log("Fibonacci:");
for (let i = 0; i < 10; i++) {
    console.log("  fib:", fib.next().value);
}

// ============================================
// 测试 2: 正则表达式
// ============================================
console.log("\n--- 测试 2: RegExp ---");

// 基本匹配
const re1 = /hello/;
console.log("test 'hello world':", re1.test("hello world")); // true
console.log("test 'hi world':", re1.test("hi world")); // false

// 点号匹配任意字符
const re2 = /h.llo/;
console.log("h.llo matches 'hello':", re2.test("hello")); // true
console.log("h.llo matches 'hallo':", re2.test("hallo")); // true

// 量词测试
const re3 = /ab*c/;
console.log("ab*c matches 'ac':", re3.test("ac")); // true
console.log("ab*c matches 'abc':", re3.test("abc")); // true
console.log("ab*c matches 'abbbc':", re3.test("abbbc")); // true

const re4 = /ab+c/;
console.log("ab+c matches 'ac':", re4.test("ac")); // false
console.log("ab+c matches 'abc':", re4.test("abc")); // true

const re5 = /ab?c/;
console.log("ab?c matches 'ac':", re5.test("ac")); // true
console.log("ab?c matches 'abc':", re5.test("abc")); // true
console.log("ab?c matches 'abbc':", re5.test("abbc")); // false

// exec 测试
const re6 = /world/;
const result = re6.exec("hello world");
console.log("exec result:", result);

// String.match
const str = "hello world";
const matches = str.match(/world/);
console.log("match result:", matches);

// String.search
const pos = "hello world".search(/world/);
console.log("search position:", pos); // 6

// String.replace
const replaced = "hello world".replace(/world/, "JavaScript");
console.log("replace result:", replaced); // "hello JavaScript"

// String.split
const parts = "a,b,c,d".split(/,/);
console.log("split result:", parts);

// ============================================
// 测试 3: 私有字段
// ============================================
console.log("\n--- 测试 3: 私有字段 ---");

class Counter {
    #count = 0;

    increment() {
        this.#count++;
    }

    decrement() {
        this.#count--;
    }

    get value() {
        return this.#count;
    }
}

const c = new Counter();
console.log("初始值:", c.value); // 0
c.increment();
c.increment();
console.log("increment 2次:", c.value); // 2
c.decrement();
console.log("decrement 1次:", c.value); // 1

// 测试私有字段隔离
class BankAccount {
    #balance;

    constructor(initial) {
        this.#balance = initial;
    }

    deposit(amount) {
        if (amount > 0) {
            this.#balance += amount;
        }
    }

    withdraw(amount) {
        if (amount > 0 && amount <= this.#balance) {
            this.#balance -= amount;
            return true;
        }
        return false;
    }

    getBalance() {
        return this.#balance;
    }
}

const account = new BankAccount(100);
console.log("初始余额:", account.getBalance()); // 100
account.deposit(50);
console.log("存款50后:", account.getBalance()); // 150
account.withdraw(30);
console.log("取款30后:", account.getBalance()); // 120

// 尝试直接访问私有字段（应该失败）
console.log("直接访问 #balance:", account["#balance"]); // undefined

// ============================================
// 测试 4: AsyncGenerator (异步生成器)
// ============================================
console.log("\n--- 测试 4: AsyncGenerator ---");

async function* asyncNumbers() {
    for (let i = 1; i <= 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        yield i;
    }
}

async function testAsyncGen() {
    console.log("开始异步迭代:");
    const asyncGen = asyncNumbers();

    let result = await asyncGen.next();
    console.log("  异步值 1:", result.value);

    result = await asyncGen.next();
    console.log("  异步值 2:", result.value);

    result = await asyncGen.next();
    console.log("  异步值 3:", result.value);

    result = await asyncGen.next();
    console.log("  完成:", result.done);
}

// for await...of 测试
async function testForAwaitOf() {
    console.log("for await...of 测试:");
    for await (const num of asyncNumbers()) {
        console.log("  迭代值:", num);
    }
}

// 运行异步测试
testAsyncGen()
    .then(() => {
        return testForAwaitOf();
    })
    .then(() => {
        console.log("\n=== 所有测试完成 ===");
    });
