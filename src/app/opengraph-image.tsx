import { ImageResponse } from "next/og";

export const alt = "Find Beskyttelsesrum";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          backgroundColor: "#0a0a0a",
          padding: 72,
        }}
      >
        <div
          style={{
            fontSize: 58,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.02em",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            lineHeight: 1.1,
          }}
        >
          Find Beskyttelsesrum
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#a3a3a3",
            maxWidth: 960,
            lineHeight: 1.35,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}
        >
          Oversigt over registrerede beskyttelsesrum i Danmark
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 22,
            color: "#F97316",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          findbeskyttelsesrum.dk
        </div>
      </div>
    ),
    { ...size },
  );
}
