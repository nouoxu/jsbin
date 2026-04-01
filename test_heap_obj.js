// Create an object on the heap with a closure property
const obj = {}
obj.platform = function() { return "macos" }
console.log(typeof obj.platform)
console.log(obj.platform())
