// 测试 try/catch (已知问题: Error 类未定义)
try {
    throw new Error("test");
} catch (e) {
    console.log("caught");
}
