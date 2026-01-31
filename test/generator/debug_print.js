function* gen() { print("inside gen"); return 42; } let g = gen(); print("calling next"); let r = g.next(); print("done");
