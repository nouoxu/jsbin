export function greeting() { return "hello" }
const ns = { greeting: greeting }
console.log(typeof ns.greeting)
console.log(ns.greeting())
