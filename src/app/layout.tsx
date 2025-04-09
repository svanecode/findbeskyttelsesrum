import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ 
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: "Beskyttelsesrum",
  description: "Find beskyttelsesrum i dit område",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="da" className="dark">
      <body className={`${manrope.variable} font-sans bg-[#111111] text-white`}>
        {children}
      </body>
    </html>
  );
}
