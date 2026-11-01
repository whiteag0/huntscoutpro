import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuthProvider } from "@/components/AuthProvider";
import { OnboardingGate } from "@/components/OnboardingGate";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  "Draw results and harvest by unit for western draw states, taken straight from state wildlife agency reports, with every number cited to its source.";

export const metadata: Metadata = {
  title: "HuntScout Pro \u2014 Know Before You Draw",
  description: SITE_DESCRIPTION,
  openGraph: {
    title: "HuntScout Pro \u2014 Know Before You Draw",
    description: SITE_DESCRIPTION,
    siteName: "HuntScout Pro",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "HuntScout Pro \u2014 Know Before You Draw",
    description: SITE_DESCRIPTION,
  },
};

// Phones: render at device width (pinch-zoom stays enabled) and tint the
// browser chrome to match the page background.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf7f4",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${jakarta.variable} ${geistMono.variable} antialiased`}
        style={{ "--font-heading": "var(--font-sans)" } as React.CSSProperties}
      >
        <AuthProvider>
          <OnboardingGate />
          <Header />
          <main className="pt-16">{children}</main>
          <Footer />
          <AnalyticsProvider />
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
