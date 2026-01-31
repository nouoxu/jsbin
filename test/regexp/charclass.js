// 测试正则字符类
console.log(/[abc]/.test("a"));
console.log(/[abc]/.test("d"));
console.log(/[^abc]/.test("d"));
console.log(/[a-z]/.test("m"));
