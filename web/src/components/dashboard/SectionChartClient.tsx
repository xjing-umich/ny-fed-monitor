"use client";

import React from "react";
import type { ChartSpec } from "@/lib/charts";
import SectionChart from "./SectionChart";

export default function SectionChartClient({ spec }: { spec: ChartSpec }) {
  return <SectionChart spec={spec} />;
}
