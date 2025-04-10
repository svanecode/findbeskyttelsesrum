import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Find Beskyttelsesrum",
  description: "Find det nærmeste beskyttelsesrum i dit område",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="da">
      <body className={`${inter.className} ${spaceGrotesk.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
