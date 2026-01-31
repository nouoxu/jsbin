// Test Error object access
try {
    throw new Error("test error message");
} catch (e) {
    print("Caught error");
    print(e);
}

print("Done");
