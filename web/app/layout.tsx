import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./theme.css";
import "./dashboard.css";
import "./site.css";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { Providers } from "./providers";
import ThemeShell from "@/components/ThemeShell";

/**
 * Dashboard-forward type stack (next/font, self-hosted).
 * Outfit — geometric display; Plus Jakarta Sans — UI body; JetBrains Mono — data.
 */
const display = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-outfit",
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-jakarta",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains",
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
    <html
      lang="en"
      data-vayu
      data-theme="dark"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <Providers>
          <ThemeShell>{children}</ThemeShell>
        </Providers>
      </body>
    </html>
  );
}
