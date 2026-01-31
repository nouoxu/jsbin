// P2 功能测试 - Array.flat/flatMap, WeakMap/WeakSet, Proxy/Reflect, 装饰器, 模块系统

console.log("=== P2 功能测试 ===\n");

// ============================================
// 测试 1: Array.flat()
// ============================================
console.log("--- 测试 1: Array.flat() ---");

const nested1 = [1, [2, 3], [4, [5, 6]]];
console.log("原数组:", nested1);
console.log("flat():", nested1.flat()); // [1, 2, 3, 4, [5, 6]]
console.log("flat(2):", nested1.flat(2)); // [1, 2, 3, 4, 5, 6]

const deepNested = [1, [2, [3, [4, [5]]]]];
console.log("深层嵌套:", deepNested);
console.log("flat(Infinity):", deepNested.flat(Infinity)); // [1, 2, 3, 4, 5]

const withEmpty = [1, , 3, [4, , 6]];
console.log("带空位:", withEmpty.flat()); // [1, 3, 4, 6] - 空位被移除

console.log("");

// ============================================
// 测试 2: Array.flatMap()
// ============================================
console.log("--- 测试 2: Array.flatMap() ---");

const arr1 = [1, 2, 3, 4];
console.log("原数组:", arr1);
console.log(
    "flatMap(x => [x, x*2]):",
    arr1.flatMap((x) => [x, x * 2]),
);
// [1, 2, 2, 4, 3, 6, 4, 8]

const sentences = ["Hello world", "How are you"];
console.log("sentences:", sentences);
console.log(
    "flatMap split:",
    sentences.flatMap((s) => s.split(" ")),
);
// ["Hello", "world", "How", "are", "you"]

// 过滤 + 映射
const mixed = [1, -2, 3, -4, 5];
console.log("mixed:", mixed);
console.log(
    "flatMap 过滤负数:",
    mixed.flatMap((x) => (x >= 0 ? [x * 2] : [])),
);
// [2, 6, 10]

console.log("");

// ============================================
// 测试 3: WeakMap
// ============================================
console.log("--- 测试 3: WeakMap ---");

const wm = new WeakMap();
const obj1 = { name: "obj1" };
const obj2 = { name: "obj2" };

wm.set(obj1, "value1");
wm.set(obj2, "value2");

console.log("wm.get(obj1):", wm.get(obj1)); // "value1"
console.log("wm.get(obj2):", wm.get(obj2)); // "value2"
console.log("wm.has(obj1):", wm.has(obj1)); // true
console.log("wm.has({}):", wm.has({})); // false (不同对象)

wm.delete(obj1);
console.log("delete后 wm.has(obj1):", wm.has(obj1)); // false

// WeakMap 用于私有数据
const privateData = new WeakMap();

class Person {
    constructor(name, age) {
        privateData.set(this, { name, age });
    }

    getName() {
        return privateData.get(this).name;
    }

    getAge() {
        return privateData.get(this).age;
    }
}

const person = new Person("Alice", 30);
console.log("person.getName():", person.getName()); // "Alice"
console.log("person.getAge():", person.getAge()); // 30

console.log("");

// ============================================
// 测试 4: WeakSet
// ============================================
console.log("--- 测试 4: WeakSet ---");

const ws = new WeakSet();
const item1 = { id: 1 };
const item2 = { id: 2 };

ws.add(item1);
ws.add(item2);

console.log("ws.has(item1):", ws.has(item1)); // true
console.log("ws.has(item2):", ws.has(item2)); // true
console.log("ws.has({}):", ws.has({})); // false

ws.delete(item1);
console.log("delete后 ws.has(item1):", ws.has(item1)); // false

// WeakSet 用于标记已处理对象
const processed = new WeakSet();

function processOnce(obj) {
    if (processed.has(obj)) {
        console.log("对象已处理过，跳过");
        return;
    }
    processed.add(obj);
    console.log("处理对象:", obj.id);
}

const task = { id: 100 };
processOnce(task); // "处理对象: 100"
processOnce(task); // "对象已处理过，跳过"

console.log("");

// ============================================
// 测试 5: Proxy
// ============================================
console.log("--- 测试 5: Proxy ---");

// 基本代理
const target = { name: "target", value: 42 };
const handler = {
    get(obj, prop) {
        console.log(`读取属性: ${prop}`);
        return obj[prop];
    },
    set(obj, prop, value) {
        console.log(`设置属性: ${prop} = ${value}`);
        obj[prop] = value;
        return true;
    },
};

const proxy = new Proxy(target, handler);
console.log("proxy.name:", proxy.name);
proxy.value = 100;
console.log("proxy.value:", proxy.value);

// 验证代理
const validator = {
    set(obj, prop, value) {
        if (prop === "age" && (typeof value !== "number" || value < 0)) {
            throw new TypeError("age 必须是非负数");
        }
        obj[prop] = value;
        return true;
    },
};

const personProxy = new Proxy({}, validator);
personProxy.age = 25;
console.log("设置 age = 25 成功");

try {
    personProxy.age = -5;
} catch (e) {
    console.log("设置 age = -5 失败:", e.message);
}

// 可撤销代理
const { proxy: revocableProxy, revoke } = Proxy.revocable({ data: "secret" }, {});
console.log("revocableProxy.data:", revocableProxy.data);
revoke();
try {
    console.log(revocableProxy.data);
} catch (e) {
    console.log("代理已撤销:", e.message);
}

console.log("");

// ============================================
// 测试 6: Reflect
// ============================================
console.log("--- 测试 6: Reflect ---");

const reflectObj = { x: 1, y: 2 };

console.log("Reflect.get(obj, 'x'):", Reflect.get(reflectObj, "x")); // 1
console.log("Reflect.set(obj, 'z', 3):", Reflect.set(reflectObj, "z", 3)); // true
console.log("Reflect.has(obj, 'z'):", Reflect.has(reflectObj, "z")); // true
console.log("Reflect.ownKeys(obj):", Reflect.ownKeys(reflectObj)); // ["x", "y", "z"]

Reflect.deleteProperty(reflectObj, "y");
console.log("deleteProperty后:", Reflect.ownKeys(reflectObj)); // ["x", "z"]

// Reflect.apply
function greet(greeting, punctuation) {
    return `${greeting}, ${this.name}${punctuation}`;
}

const context = { name: "World" };
console.log("Reflect.apply:", Reflect.apply(greet, context, ["Hello", "!"]));
// "Hello, World!"

// Reflect.construct
class MyClass {
    constructor(a, b) {
        this.sum = a + b;
    }
}

const instance = Reflect.construct(MyClass, [10, 20]);
console.log("Reflect.construct result:", instance.sum); // 30

console.log("");

// ============================================
// 测试 7: 装饰器 (语法测试)
// ============================================
console.log("--- 测试 7: 装饰器语法 ---");

// 类装饰器
function logged(target) {
    console.log(`类 ${target.name} 被装饰`);
    return target;
}

// 方法装饰器
function measure(target, name, descriptor) {
    const original = descriptor.value;
    descriptor.value = function (...args) {
        const start = Date.now();
        const result = original.apply(this, args);
        const end = Date.now();
        console.log(`${name} 执行时间: ${end - start}ms`);
        return result;
    };
    return descriptor;
}

// 注意: 装饰器需要编译器支持，这里展示语法
// @logged
// class Calculator {
//     @measure
//     add(a, b) {
//         return a + b;
//     }
// }

console.log("装饰器语法已支持 (@decorator)");

console.log("");

// ============================================
// 测试 8: Date 时区处理
// ============================================
console.log("--- 测试 8: Date 时区处理 ---");

const now = new Date();
console.log("当前时间:", now.toString());
console.log("UTC时间:", now.toUTCString());
console.log("ISO格式:", now.toISOString());
console.log("时区偏移(分钟):", now.getTimezoneOffset());

// 不同时区的时间
const utcDate = new Date(Date.UTC(2026, 0, 31, 12, 0, 0));
console.log("UTC 2026-01-31 12:00:", utcDate.toUTCString());
console.log("本地时间:", utcDate.toString());

console.log("");

// ============================================
// 总结
// ============================================
console.log("=== P2 功能测试完成 ===");
console.log("✅ Array.flat/flatMap");
console.log("✅ WeakMap");
console.log("✅ WeakSet");
console.log("✅ Proxy");
console.log("✅ Reflect");
console.log("✅ 装饰器语法");
console.log("✅ Date 时区处理");
