import { managerLabel, managerTitleName, managerSubtitle, managerIsOrganization } from "./displayName";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

// 中文站显示中文名,英文站不变;没有中文名的保持英文。
assert(managerLabel("zh", "hh-international", "Duan Yongping") === "段永平", "段永平");
assert(managerLabel("en", "hh-international", "Duan Yongping") === "Duan Yongping", "en 不变");
assert(managerLabel("zh", "pershing-square", "Bill Ackman") === "比尔·阿克曼", "名家清单全名优先");
assert(managerLabel("zh", "adw-capital", "Adam Wyden") === "Adam Wyden", "无中文名 → 英文");
assert(managerLabel("zh", "ruane-cunniff", "Ruane, Cunniff (Sequoia)") === "红杉基金", "红杉改写");
assert(managerTitleName("zh", "hh-international", "Duan Yongping") === "段永平（Duan Yongping）持仓组合", "zh 标题带英文名");

// 名单按"、"或逗号分隔,单个名字里不能再带分隔符,否则一位持有人被读成两位。
const RAW: [string, string][] = [["berkshire-hathaway", "Warren Buffett"], ["ruane-cunniff", "Ruane, Cunniff (Sequoia)"], ["tweedy-browne", "Tweedy, Browne"]];
for (const [slug, person] of RAW) {
  assert(!managerLabel("zh", slug, person).includes("、"), `${slug} zh 名不含顿号`);
  assert(!managerLabel("en", slug, person).includes(","), `${slug} en 名不含逗号`);
}
assert(managerTitleName("zh", "ruane-cunniff", "Ruane, Cunniff (Sequoia)") === "红杉基金（Ruane Cunniff）持仓组合", "红杉 zh 标题不套括号");

// 掌管人已变:伯克希尔不再写"由巴菲特掌管";Daily Journal 不再挂芒格的名字。
assert(managerLabel("en", "berkshire-hathaway", "Warren Buffett") === "Warren Buffett & Greg Abel", "伯克希尔 en");
assert(!/managed by Warren Buffett/.test(managerSubtitle("en", "berkshire-hathaway", "Warren Buffett", "Berkshire Hathaway Inc")), "伯克希尔副标题");
assert(/Greg Abel/.test(managerSubtitle("en", "berkshire-hathaway", "Warren Buffett", "Berkshire Hathaway Inc")), "伯克希尔副标题提到 Abel");
assert(managerLabel("en", "daily-journal", "Charlie Munger") === "Daily Journal", "Daily Journal en");
assert(/died in November 2023/.test(managerSubtitle("en", "daily-journal", "Charlie Munger", "Daily Journal Corp")), "芒格去世");
assert(/2023 年 11 月去世/.test(managerSubtitle("zh", "daily-journal", "Charlie Munger", "Daily Journal Corp")), "芒格去世 zh");

// 结构化数据:机构名的申报主体与掌管人已变的,用 Organization。
for (const slug of ["dodge-and-cox", "polen-capital", "ruane-cunniff", "tweedy-browne", "berkshire-hathaway", "daily-journal"])
  assert(managerIsOrganization(slug), `${slug} → Organization`);
assert(!managerIsOrganization("hh-international"), "段永平是 Person");

console.log("displayName.check OK");
