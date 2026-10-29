/** 展示词表门禁:只扫描 TS/TSX 字符串和 JSX 文本,不扫描注释或代码标识符。
 * 默认扫描 src;可传入夹具目录验证门禁。数据库里的历史报告快照不在此脚本范围内。
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(process.argv[2] ?? path.join(__dirname, "../src"));
const retired = /价值带|合理价值|\b(?:value|valuation) bands?\b|\b(?:within|above) band\b|\bthe band(?:'s)?\b|\bfair[- ]value\b(?! gains\/losses)|\bCentral IV\b|\bbuy line\b|\bgrowth-anchored\b|中枢 IV/i;
const failures: string[] = [];
function scan(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { scan(file); continue; }
    if (!/\.tsx?$/.test(file) || /\.check\.tsx?$/.test(file) || /\.d\.ts$/.test(file)) continue;
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isStringLiteralLike(node) || ts.isJsxText(node) ||
          node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle || node.kind === ts.SyntaxKind.TemplateTail) {
        const text = (node as ts.StringLiteralLike).text;
        const match = retired.exec(text)?.[0] ?? (text.trim() === "Band" ? "Band" : null);
        if (match) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          failures.push(`${path.relative(root, file)}:${line + 1}: ${match}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
scan(root);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL lexicon: ${failure}`));
  process.exitCode = 1;
} else console.log("lexicon.check OK");
