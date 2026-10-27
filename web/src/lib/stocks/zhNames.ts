import type { Lang } from "@/lib/nav";

// 个股的通行中文名(中文用户搜"苹果 持仓""台积电 机构"用的那个名字)。
// 只收中文财经媒体里有固定译名的公司;没有公认译名的(Meta、Visa、PayPal、Adobe、Salesforce 等常直接用英文)不收,
// 宁缺毋滥。按 ticker 索引,同一公司的不同股份类别共用一个中文名。
const STOCK_ZH: Record<string, string> = {
  MSFT: "微软", GOOGL: "谷歌", GOOG: "谷歌", AMZN: "亚马逊", AAPL: "苹果", NVDA: "英伟达", TSLA: "特斯拉",
  TSM: "台积电", AVGO: "博通", ORCL: "甲骨文", ASML: "阿斯麦", TXN: "德州仪器", AMAT: "应用材料",
  LRCX: "泛林集团", ADI: "亚德诺", QCOM: "高通", INTC: "英特尔", MU: "美光科技", CSCO: "思科", TEL: "泰科电子",
  SAP: "思爱普", NFLX: "奈飞", DIS: "迪士尼", CMCSA: "康卡斯特", CHTR: "特许通讯", VZ: "威瑞森", UBER: "优步",
  ABNB: "爱彼迎", "BRK.B": "伯克希尔·哈撒韦", "BRK.A": "伯克希尔·哈撒韦",
  MA: "万事达", AXP: "美国运通", JPM: "摩根大通", BAC: "美国银行", WFC: "富国银行",
  C: "花旗集团", GS: "高盛", MS: "摩根士丹利", SCHW: "嘉信理财", BLK: "贝莱德", STT: "道富", BNY: "纽约梅隆银行",
  COF: "第一资本", MCO: "穆迪", SPGI: "标普全球", ICE: "洲际交易所", AON: "怡安", CB: "安达保险", PGR: "前进保险",
  BN: "布鲁克菲尔德",
  UNH: "联合健康", JNJ: "强生", PFE: "辉瑞", MRK: "默沙东", LLY: "礼来", ABBV: "艾伯维", BMY: "百时美施贵宝",
  ABT: "雅培", TMO: "赛默飞世尔", DHR: "丹纳赫", MDT: "美敦力", BAX: "百特", ZBH: "捷迈邦美", ZTS: "硕腾",
  CI: "信诺", NVS: "诺华", SNY: "赛诺菲", GSK: "葛兰素史克", AZN: "阿斯利康", NVO: "诺和诺德", AMGN: "安进",
  GILD: "吉利德科学",
  KO: "可口可乐", PEP: "百事", PG: "宝洁", KHC: "卡夫亨氏", PM: "菲利普莫里斯国际", MO: "奥驰亚", MDLZ: "亿滋",
  DEO: "帝亚吉欧", WMT: "沃尔玛", COST: "开市客", MCD: "麦当劳", SBUX: "星巴克", NKE: "耐克", HSY: "好时",
  CL: "高露洁", EL: "雅诗兰黛", UL: "联合利华", BUD: "百威英博", TGT: "塔吉特", HD: "家得宝", YUM: "百胜餐饮",
  XOM: "埃克森美孚", CVX: "雪佛龙", COP: "康菲石油", SHEL: "壳牌", BP: "英国石油", TTE: "道达尔能源",
  OXY: "西方石油", RIO: "力拓", BHP: "必和必拓", VALE: "淡水河谷", LIN: "林德",
  UNP: "联合太平洋", CNI: "加拿大国家铁路", CP: "加拿大太平洋堪萨斯城铁路", FDX: "联邦快递", UPS: "联合包裹",
  DAL: "达美航空", BA: "波音", CAT: "卡特彼勒", DE: "迪尔", GM: "通用汽车", F: "福特汽车", TM: "丰田汽车",
  HMC: "本田汽车", SONY: "索尼", HON: "霍尼韦尔", LMT: "洛克希德·马丁", ACN: "埃森哲",
  BABA: "阿里巴巴", PDD: "拼多多", JD: "京东", BIDU: "百度", NTES: "网易", TCOM: "携程", TME: "腾讯音乐",
  BEKE: "贝壳", HTHT: "华住", MELI: "美客多", SE: "冬海集团", HSBC: "汇丰", NOK: "诺基亚", ERIC: "爱立信",
};

export function stockZhName(ticker: string): string | null {
  return STOCK_ZH[ticker.toUpperCase()] ?? null;
}

/** 中文页上的个股名:有通行中文名时写成「苹果 Apple Inc」,否则就是清洗后的英文名。 */
export function stockDisplayName(lang: Lang, ticker: string, issuer: string): string {
  const zh = lang === "zh" ? stockZhName(ticker) : null;
  return zh ? `${zh} ${issuer}` : issuer;
}
