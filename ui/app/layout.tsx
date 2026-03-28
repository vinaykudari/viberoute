import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono, Pacifico } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

const pacifico = Pacifico({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-pacifico",
});

export const metadata: Metadata = {
  title: "VibeRoute",
  description: "Map-first day planning from inspiration photos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${plexMono.variable} ${pacifico.variable}`}
    >
      <body className="font-[family-name:var(--font-display)]">{children}</body>
    </html>
  );
}
