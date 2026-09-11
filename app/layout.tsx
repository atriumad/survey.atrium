import type { Metadata } from "next";
import { Inter_Tight, Instrument_Serif, Nothing_You_Could_Do } from "next/font/google";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  preload: false,
});

const nothingYouCouldDo = Nothing_You_Could_Do({
  variable: "--font-nothing-you-could-do",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Atrium",
  description: "Review & survey platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${instrumentSerif.variable} ${nothingYouCouldDo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
