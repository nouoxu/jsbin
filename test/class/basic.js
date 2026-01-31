// 测试类基础
class Animal {
    constructor(name) {
        this.name = name;
    }
    speak() {
        console.log(this.name + " speaks");
    }
}
const a = new Animal("Cat");
a.speak();
