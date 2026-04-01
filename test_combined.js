// This tests namespace import combined with other features
import * as os from "os"
import { platform } from "os"

console.log("=== Named import ===")
console.log(typeof platform)
console.log(platform())

console.log("=== Namespace import ===")
console.log(typeof os)
console.log(os.platform)

console.log("=== Simple function test ===")
function testfn() { return "test" }
console.log(testfn())
