import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { Providers } from "./providers";
import ThemeShell from "@/components/ThemeShell";

/**
 * Fonts from the design, self-hosted via next/font.
 *
 * These used to be a <link> to fonts.googleapis.com: two extra DNS+TLS
 * handshakes to a third party, and a render-blocking stylesheet before any text
 * could paint. next/font inlines the @font-face rules and serves the files from
 * our own origin, so text paints in one round trip. `display: swap` means a slow
 * font never holds the page hostage, and every stack still falls back to system
 * fonts, so the app renders with no network at all (demo-wifi safety).
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-space-grotesk",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Vayu AI — Air Intelligence",
  description:
    "Forecast, attribute and act on urban air quality across Chhattisgarh — including cities with no ground sensors.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <ThemeShell>{children}</ThemeShell>
        </Providers>
      </body>
    </html>
  );
}
