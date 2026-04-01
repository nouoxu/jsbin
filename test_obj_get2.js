function createOs() {
    const os = {}
    os.platform = function() { return "macos" }
    return os
}
const ns = createOs()
console.log(typeof ns.platform)
console.log(ns.platform())
