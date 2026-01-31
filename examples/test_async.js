// async/await 测试

console.log("=== Async/Await 测试 ===");

async function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(ms), ms);
    });
}

async function main() {
    console.log("开始");

    const result = await Promise.resolve(42);
    console.log("Promise.resolve:", result);

    console.log("完成");
}

main();
