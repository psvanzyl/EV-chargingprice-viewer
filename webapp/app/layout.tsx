import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EV Charging Price Viewer - Laad- en brandstofprijzen in Nederland",
  description:
    "Interactieve kaart van actuele laadprijzen (€/kWh, NDW OCPI) en brandstofprijzen (€/L, Brandstofprijzen.nl) in Nederland, per gemeente, met gemeente- en provinciegrenzen van PDOK/CBS.",
  openGraph: {
    title: "EV Charging Price Viewer",
    description:
      "Laadprijzen (€/kWh) en brandstofprijzen (€/L) in Nederland op een interactieve kaart per gemeente.",
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
