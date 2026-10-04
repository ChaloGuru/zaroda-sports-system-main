import { ImageResponse } from "next/og";
import { registrationEdition } from "./edition";

// The link-preview card for a KSEF registration link - small enough for
// WhatsApp (the site-wide preview image is too large for it to show).
export const alt = "Zaroda KSEF school registration";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const edition = await registrationEdition(token);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(120deg, #0A1633 0%, #1A2E5A 100%)",
          color: "#FFFFFF",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "#C99A2E",
              color: "#0A1633",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 48,
              fontWeight: 800,
            }}
          >
            Z
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 1 }}>Zaroda KSEF</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 34, color: "#C99A2E", fontWeight: 700 }}>{edition?.name ?? "Kenya Science and Engineering Fair"}</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>School Registration</div>
          <div style={{ fontSize: 32, color: "rgba(255,255,255,0.8)" }}>Register your school and enter its projects</div>
        </div>
        <div style={{ display: "flex", height: 8, width: 240, background: "#C99A2E", borderRadius: 4 }} />
      </div>
    ),
    size,
  );
}
