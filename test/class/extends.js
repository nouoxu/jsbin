// 测试类继承 (已知问题: super 未实现)
class Parent {
    constructor(name) {
        this.name = name;
    }
    greet() {
        return "Hello " + this.name;
    }
}
class Child extends Parent {
    constructor(name, age) {
        super(name);
        this.age = age;
    }
    info() {
        return this.greet() + " age " + this.age;
    }
}
const c = new Child("Bob", 10);
console.log(c.info());
