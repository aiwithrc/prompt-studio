import type { Metadata, Viewport } from "next";
import { Archivo, Manrope } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-archivo", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Prompt Studio · Rishab Chaturvedi",
  description: "Write high-quality prompts for video, image, text and LinkedIn, grounded in your own library and notes.",
  openGraph: {
    title: "Prompt Studio · Rishab Chaturvedi",
    description: "Prompts that remember what worked.",
    type: "website",
  },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#120a2a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${manrope.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
