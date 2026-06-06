import { ImageResponse } from "next/og";

// Site-wide default social card. Individual routes can add their own
// opengraph-image to override this branded fallback.
export const alt = "Compounder — smart-money holdings × valuation × macro";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#1B5E3F";
const PAPER = "#FAF8F3";
const INK = "#1C1917";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: INK,
          padding: "72px 80px",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        {/* Mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="72" height="72" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="96" fill={GREEN} />
            <g transform="translate(96,96) scale(13.333)">
              <path
                d="M2.5 19.5 C 8.5 19.5, 12 16.5, 14 10.5 C 15.6 5.8, 18 3.6, 21 3.2"
                stroke={PAPER}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="21" cy="3.3" r="2.1" fill={PAPER} />
            </g>
          </svg>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 600, letterSpacing: -1 }}>
            Compounder
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 600, lineHeight: 1.1, maxWidth: 980 }}>
            Smart-money holdings × valuation × macro
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#5C5650", maxWidth: 960 }}>
            Superinvestor 13F holdings · single-stock valuation · macro liquidity
          </div>
        </div>

        {/* Footer / sources */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 22,
            color: "#5C5650",
            borderTop: `2px solid ${GREEN}`,
            paddingTop: 20,
          }}
        >
          <div style={{ display: "flex" }}>thecompounder.fyi</div>
          <div style={{ display: "flex" }}>Sources: SEC EDGAR · NY Fed</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
