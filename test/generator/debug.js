function* gen() { console.log("inside gen"); return 42; } let g = gen(); console.log("before next"); let r = g.next(); console.log("after next"); console.log("r.value =", r.value);
