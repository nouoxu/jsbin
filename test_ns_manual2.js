// Create an object structure similar to namespace
// Object layout: header (24 bytes) + properties
const OBJ_HEADER = 24
const PROP_SIZE = 16

// Create namespace with 2 properties
const ns = _alloc(OBJ_HEADER + 2 * PROP_SIZE)

// Set type = OBJECT (0x7FFD)
const type_tag = 0x7FFD000000000000
_store(ns, 0, type_tag)

// Set property count
_store(ns, 8, 2)

// Set __proto__ = null
_store(ns, 16, 0)

// Property 0: key="platform", value=the function
// Key is a string JSValue (tag 0x7FFC | data_address)
// Value is a boxed closure (tag 0x7FFF | closure_address)

// For the key, we need the address of "platform" string in data section
// Let's use a known working approach: use the string's data label address
const key_addr = __str_platform  // This would be the address of the string data
const key_jsvalue = key_addr | 0x7FFC000000000000
_store(ns, OBJ_HEADER + 0, key_jsvalue)

// For the value, let's create a closure for the platform function
const closure = _alloc(16)
_store(closure, 0, 0xc105)  // CLOSURE_MAGIC
_store(closure, 8, _user_platform)  // function pointer
const boxed = closure | 0x7FFF000000000000
_store(ns, OBJ_HEADER + 8, boxed)

// Property 1: key="arch", value=the arch function
const arch_key = __str_arch | 0x7FFC000000000000
_store(ns, OBJ_HEADER + PROP_SIZE + 0, arch_key)

const arch_closure = _alloc(16)
_store(arch_closure, 0, 0xc105)
_store(arch_closure, 8, _user_arch)
const arch_boxed = arch_closure | 0x7FFF000000000000
_store(ns, OBJ_HEADER + PROP_SIZE + 8, arch_boxed)

// Now try to access ns.platform
// We need to create the key JSValue
const platform_key = __str_platform | 0x7FFC000000000000
const result = _object_get(ns, platform_key)
console.log(result)  // Should print the closure or 0
