function* gen() { console.log("entered"); yield 1; } let g = gen(); console.log("calling next"); let r = g.next(); console.log("result:", r);
