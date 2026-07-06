import { companyShortName } from "@/lib/aliases/resolve";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}

assert(companyShortName("Apple Inc") === "Apple", "APPLE INC → Apple");
assert(companyShortName("Blackstone Group") === "Blackstone Group", "GROUP 不剥");
assert(companyShortName("Alexandria Real Estate Equities") !== "", "多词名保留");

console.log("resolve.check OK");
