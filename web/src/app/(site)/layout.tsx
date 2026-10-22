import type { Metadata, Viewport } from "next";
import { Cairo, Lato } from "next/font/google";
import { IconSprite } from "@/components/site/IconSprite";
import "@/styles/site.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700", "800", "900"],
  variable: "--font-cairo",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-lato",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: "Coffeella Café | قائمة كوفيلا",
  description: "قائمة كوفيلا كافيه — مشروبات ساخنة وباردة، فرابيه، سموذي، ميلك شيك، حلويات ومخبوزات. بغداد، حي الجامعة.",
  openGraph: {
    title: "Coffeella Café — The Real Experience",
    description: "قائمة كوفيلا كافيه بالأسعار — بغداد، حي الجامعة.",
    images: ["/assets/hero.jpg"],
  },
  icons: { apple: "/brand.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${lato.variable}`}>
      <body>
        <IconSprite />
        {children}
      </body>
    </html>
  );
}
