// P2 功能测试 - 简化版本，逐步测试

console.log("=== P2 功能测试 (简化版) ===");
console.log("");

// ============================================
// 测试 1: Array.flat()
// ============================================
console.log("--- 测试 1: Array.flat() ---");

var nested1 = [1, [2, 3], [4, [5, 6]]];
console.log("flat():", nested1.flat());
console.log("flat(2):", nested1.flat(2));

var deepNested = [1, [2, [3, [4, [5]]]]];
console.log("flat(Infinity):", deepNested.flat(Infinity));

console.log("");

// ============================================
// 测试 2: Array.flatMap()
// ============================================
console.log("--- 测试 2: Array.flatMap() ---");

var arr1 = [1, 2, 3, 4];
console.log(
    "flatMap(x => [x, x*2]):",
    arr1.flatMap(function (x) {
        return [x, x * 2];
    }),
);

console.log("");

// ============================================
// 测试 3: WeakMap
// ============================================
console.log("--- 测试 3: WeakMap ---");

var wm = new WeakMap();
var obj1 = { name: "obj1" };
var obj2 = { name: "obj2" };

wm.set(obj1, "value1");
wm.set(obj2, "value2");

console.log("wm.get(obj1):", wm.get(obj1));
console.log("wm.has(obj1):", wm.has(obj1));

wm.delete(obj1);
console.log("delete后 wm.has(obj1):", wm.has(obj1));

console.log("");

// ============================================
// 测试 4: WeakSet
// ============================================
console.log("--- 测试 4: WeakSet ---");

var ws = new WeakSet();
var item1 = { id: 1 };
var item2 = { id: 2 };

ws.add(item1);
ws.add(item2);

console.log("ws.has(item1):", ws.has(item1));
ws.delete(item1);
console.log("delete后 ws.has(item1):", ws.has(item1));

console.log("");

// ============================================
// 测试 5: Proxy
// ============================================
console.log("--- 测试 5: Proxy ---");

var target = { name: "target", value: 42 };
var handler = {
    get: function (obj, prop) {
        console.log("读取属性:", prop);
        return obj[prop];
    },
    set: function (obj, prop, value) {
        console.log("设置属性:", prop, "=", value);
        obj[prop] = value;
        return true;
    },
};

var proxy = new Proxy(target, handler);
console.log("proxy.name:", proxy.name);
proxy.value = 100;
console.log("proxy.value:", proxy.value);

console.log("");

// ============================================
// 测试 6: Reflect
// ============================================
console.log("--- 测试 6: Reflect ---");

var reflectObj = { x: 1, y: 2 };

console.log("Reflect.get(obj, 'x'):", Reflect.get(reflectObj, "x"));
console.log("Reflect.set(obj, 'z', 3):", Reflect.set(reflectObj, "z", 3));
console.log("Reflect.has(obj, 'z'):", Reflect.has(reflectObj, "z"));

console.log("");

// ============================================
// 测试 7: Date
// ============================================
console.log("--- 测试 7: Date ---");

var now = new Date();
console.log("当前时间:", now.toString());
console.log("时区偏移(分钟):", now.getTimezoneOffset());

console.log("");
console.log("=== P2 功能测试完成 ===");
