import { ImageResponse } from "next/og";

// Shared 1200×630 social card used by the site-wide and per-page opengraph-image
// routes. Dark, on-brand (warm near-black ground, lifted compounding green, paper
// text) with a consistent layout: eyebrow → headline → subtitle → footer. The
// dark ground matches the site's signature look and stands out in light social
// feeds. next/og runs Satori with no embedded font here, so it falls back to its
// default face — consistent across cards.

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

// Dark theme (matches the site's dark palette in globals.css).
const BG = "#0E1411"; // dark green-black ground
const FG = "#EDE7DA"; // paper text
const GREEN = "#4FBF8A"; // lifted money-green for dark surfaces
const MUTED = "#A89C8A"; // secondary text

export function ogCard({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          color: FG,
          padding: "72px 80px",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        {/* Mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="64" height="64" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="96" fill={GREEN} />
            <g transform="translate(96,96) scale(13.333)">
              <path
                d="M2.5 19.5 C 8.5 19.5, 12 16.5, 14 10.5 C 15.6 5.8, 18 3.6, 21 3.2"
                stroke={BG}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="21" cy="3.3" r="2.1" fill={BG} />
            </g>
          </svg>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 600, letterSpacing: -1 }}>
            Compounder
          </div>
        </div>

        {/* Eyebrow + headline + subtitle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {eyebrow ? (
            <div
              style={{
                display: "flex",
                fontSize: 24,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: GREEN,
                fontFamily: "monospace",
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 600,
              lineHeight: 1.08,
              maxWidth: 1040,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div style={{ display: "flex", fontSize: 30, color: MUTED, maxWidth: 1000 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        {/* Footer / sources */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 22,
            color: MUTED,
            borderTop: `2px solid ${GREEN}`,
            paddingTop: 20,
          }}
        >
          <div style={{ display: "flex" }}>thecompounder.fyi</div>
          <div style={{ display: "flex" }}>Sources: SEC EDGAR · NY Fed</div>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
