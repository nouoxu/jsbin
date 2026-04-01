// Create a "module" scope simulation
const module = {}
module.platform = function() { return "macos" }
module.arch = function() { return "arm64" }

// Create namespace object like the module system does
const namespace = {}
namespace.platform = module.platform
namespace.arch = module.arch

// Now access via namespace
console.log(typeof namespace.platform)
console.log(namespace.platform())
console.log(namespace.arch())
