import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme/theme-provider";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Applies the saved theme to <html> before first paint to avoid a flash.
// Defaults to light when nothing is stored.
const themeScript = `(function(){try{var t=localStorage.getItem('arjo-theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Arjo — Save Together, Powered by Stablecoins",
  description:
    "Arjo brings the trusted Yoruba Ajo savings circle on-chain. Pool funds with people you trust, earn yield, and get your payout in stablecoins — transparent, automated, and borderless.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
