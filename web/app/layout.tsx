import type { Metadata } from "next";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { Providers } from "./providers";
import ThemeShell from "@/components/ThemeShell";

export const metadata: Metadata = {
  title: "Vayu AI — Air Intelligence",
  description:
    "Forecast, attribute and act on urban air quality across Chhattisgarh — including cities with no ground sensors.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Fonts from the design. Every stack falls back to system fonts, so the
            app still renders correctly with no network (demo-wifi safety). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          <ThemeShell>{children}</ThemeShell>
        </Providers>
      </body>
    </html>
  );
}
