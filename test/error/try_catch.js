// Test: try/catch
try {
  console.log(1);
  throw "error";
  console.log(2);
} catch (e) {
  console.log(3);
}
console.log(4);
