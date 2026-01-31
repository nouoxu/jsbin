// Simple try/catch test without Error object
try {
    print("In try block");
    throw "error string";
} catch (e) {
    print("In catch block");
    print(e);
}

print("After try/catch");
