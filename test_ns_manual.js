// Manually create what the module system does

// Create the platform function closure
function platform() { return "macos" }

// Create a namespace-like object using the same structure
// Object layout: type(8) + count(8) + proto(8) + props...
const obj = _alloc(24 + 16)  // header + 1 property
const type_tag = 0x7FFD000000000000
_store(obj, 0, type_tag)     // type = object
_store(obj, 8, 1)             // count = 1
_store(obj, 16, 0)            // proto = null

// Store property key "platform" (as JSValue string)
const key_str = _str_platform  // This is the data label address
const key_jsvalue = key_str | 0x7FFC000000000000
_store(obj, 24, key_jsvalue)

// Store property value (boxed closure)
const boxed_closure = platform | 0x7FFF000000000000
_store(obj, 32, boxed_closure)

// Now access it
const result = _object_get(obj, key_jsvalue)
console.log(result)
