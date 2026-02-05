const { parse } = require("./lang/parser");
const fs = require("fs");
const code = fs.readFileSync("./binary/elf_object.js", "utf-8");
const ast = parse(code);

// 找到类声明并列出其成员
for (let i = 0; i < ast.body.length; i++) {
    const stmt = ast.body[i];
    if (stmt.type === "ExportDeclaration" && stmt.declaration && stmt.declaration.type === "ClassDeclaration") {
        console.log(`Found class ${stmt.declaration.id.name} at index ${i}`);
        console.log(`Class has ${stmt.declaration.body.length} members:`);
        for (let j = 0; j < stmt.declaration.body.length; j++) {
            const member = stmt.declaration.body[j];
            if (member.type === "MethodDefinition") {
                console.log(`  [${j}] Method: ${member.key.name}`);
            } else if (member.type === "PropertyDefinition") {
                console.log(`  [${j}] PropertyDefinition key:`, member.key ? member.key.name || member.key : "null", "value:", member.value);
            } else {
                console.log(`  [${j}] ${member.type}`);
            }
        }
    }
}

// 输出类之后的几个语句的详细信息
console.log("\nStatements after class:");
for (let i = 35; i < Math.min(ast.body.length, 41); i++) {
    const stmt = ast.body[i];
    if (stmt) {
        console.log(`[${i}] ${stmt.type}:`, JSON.stringify(stmt, null, 2).slice(0, 200));
    }
}
