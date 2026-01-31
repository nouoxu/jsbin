// Test try/catch
try {
    print("In try block");
    throw new Error("test error");
    print("After throw (should not reach)");
} catch (e) {
    print("In catch block");
    print(e.message);
}

print("After try/catch");
