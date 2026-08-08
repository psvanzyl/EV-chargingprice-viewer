import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Laadpalenviewer - Laadpunten voor personenauto's en logistiek in Nederland",
  description:
    "Interactieve kaart van laadpunten in Nederland: personenauto-laadpunten (NDW OCPI) en logistieke/vracht-laadpunten (Milence, WattHub, megawatt charging) per gemeente, met gemeente- en provinciegrenzen van PDOK/CBS.",
  openGraph: {
    title: "Laadpalenviewer",
    description:
      "Laadpunten voor personenauto's en logistiek/vracht in Nederland op een interactieve kaart per gemeente.",
    type: "website",
    locale: "nl_NL",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
