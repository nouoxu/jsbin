// Test: Array.splice
const arr = [1, 2, 3, 4, 5];
arr.splice(2, 1);
for (let i = 0; i < 4; i = i + 1) {
  console.log(arr[i]);
}
