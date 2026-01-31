function* gen() { print("inside gen"); return 42; } let g = gen(); print("before next"); let r = g.next(); print("after next");
