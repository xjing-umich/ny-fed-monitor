"use server";

import { revalidateTag, revalidatePath } from "next/cache";

const PROFILE = "max" as const;

export async function refreshData(lang: string): Promise<void> {
  // Invalidate all NY Fed and Treasury cache tags used in sources
  revalidateTag("nyfed", PROFILE);
  revalidateTag("nyfed-pd", PROFILE);
  revalidateTag("treasury", PROFILE);
  revalidateTag("soma-summary", PROFILE);
  revalidateTag("facility-usage", PROFILE);
  // pd-* tags (individual keyids)
  for (const keyid of [
    "PDPOSGST-TOT",
    "PDGSWOEXTTOT",
    "PDSORA-UTSETTOT",
    "PDFTD-USTET",
    "PDFTR-USTET",
  ]) {
    revalidateTag(`pd-${keyid}`, PROFILE);
  }
  // Reference rate tags
  for (const rate of ["SOFR", "EFFR", "OBFR", "TGCR", "BGCR"]) {
    revalidateTag(`ref-rate-${rate}`, PROFILE);
  }
  // Revalidate the current lang path
  revalidatePath(`/${lang}`, "page");
}
