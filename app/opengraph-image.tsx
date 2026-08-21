import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";
export const alt = "Arjo — Save Together, on Arc";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PINK = "#E01A98";

/** Embed the user's real icon (public/brand/arjo-icon.png) as a data URL. */
async function iconDataUrl(): Promise<string | null> {
  for (const p of ["public/brand/arjo-icon.png", "public/brand/arjo-icon.jpg"]) {
    try {
      const buf = await readFile(join(process.cwd(), p));
      const mime = p.endsWith(".jpg") ? "image/jpeg" : "image/png";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      /* try next */
    }
  }
  return null;
}

export default async function OpengraphImage() {
  const icon = await iconDataUrl();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 64,
          background: "#0b0713",
          position: "relative",
        }}
      >
        {/* Soft pink glow behind the icon */}
        <div
          style={{
            position: "absolute",
            left: 120,
            width: 620,
            height: 620,
            borderRadius: 620,
            background:
              "radial-gradient(closest-side, rgba(224,26,152,0.55), rgba(224,26,152,0))",
          }}
        />

        {/* The icon (real file, or an on-brand fallback) */}
        {icon ? (
          <img
            src={icon}
            width={300}
            height={300}
            style={{ borderRadius: 68, boxShadow: "0 30px 80px rgba(224,26,152,0.45)" }}
          />
        ) : (
          <div
            style={{
              width: 300,
              height: 300,
              borderRadius: 68,
              background: PINK,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 30px 80px rgba(224,26,152,0.45)",
            }}
          >
            <div style={{ display: "flex" }}>
              <div
                style={{
                  width: 118,
                  height: 118,
                  borderRadius: 118,
                  border: "22px solid #fff",
                  marginRight: -44,
                }}
              />
              <div
                style={{
                  width: 118,
                  height: 118,
                  borderRadius: 118,
                  border: "22px solid #fff",
                }}
              />
            </div>
          </div>
        )}

        {/* Wordmark + tagline */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 560 }}>
          <div style={{ display: "flex", fontSize: 108, fontWeight: 800, letterSpacing: -3 }}>
            <span style={{ color: "#ffffff" }}>Ar</span>
            <span style={{ color: PINK }}>jo</span>
          </div>
          <div style={{ marginTop: 12, color: "#d7cfe0", fontSize: 36, lineHeight: 1.25 }}>
            Group savings, onchain. Pool USDC, earn yield, get paid in turn.
          </div>
          <div
            style={{
              marginTop: 28,
              display: "flex",
              alignItems: "center",
              gap: 12,
              color: "#9a8fab",
              fontSize: 26,
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 12, background: PINK }} />
            Built on Arc · Powered by USDC
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
