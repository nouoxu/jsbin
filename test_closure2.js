function createPlatform() {
    function platform() { return "macos" }
    return platform
}
const fn = createPlatform()
console.log(typeof fn)
console.log(fn())
