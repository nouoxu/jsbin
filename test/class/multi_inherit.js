// Test: Multi-level inheritance
class A {
  methodA() { console.log("A"); }
}

class B extends A {
  methodB() { console.log("B"); }
}

class C extends B {
  methodC() { console.log("C"); }
}

const c = new C();
c.methodC();
c.methodB();
c.methodA();
