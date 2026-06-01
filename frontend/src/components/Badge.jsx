import React from "react";
import { badgeTone } from "../lib/dashboard";

export default function Badge({ children, value, icon = null }) {
  const tone = badgeTone(value ?? children);
  return (
    <span className={`badge badge-${tone}`}>
      {icon}
      <span>{children}</span>
    </span>
  );
}
