import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const failures: string[] = [];
let count = 0;
function scan(path: string) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    if (!/\.(ts|tsx)$/.test(file) || file.includes(".check.")) continue;
    count++;
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const report = (node: ts.Node, message: string) => failures.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${message}`);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const fn = node.expression;
        if (ts.isIdentifier(fn) && ["formatUSD", "quarterLabel"].includes(fn.text) && node.arguments.length < 2) report(node, `${fn.text} 必须显式传语言`);
        if (ts.isPropertyAccessExpression(fn) && fn.name.text === "toLocaleString" && node.arguments.length === 0) report(node, "toLocaleString 必须显式指定 locale");
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
scan("src/app");
scan("src/components");
assert.equal(failures.length, 0, failures.join("\n"));
console.log(`i18n-format.check OK (${count} UI files)`);
