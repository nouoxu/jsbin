function* gen() { 
    print("gen body");
    return 1; 
}
print("creating g");
let g = gen();
print("g created");
print("calling next");
let r = g.next();
print("next returned");
