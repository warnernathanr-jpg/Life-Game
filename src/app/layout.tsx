import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from "@/lib/themes";
import "./globals.css";

// Fonts with some character: Figtree for text, Bricolage Grotesque for headings and big numbers.
const bodyFont = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const displayFont = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const monoFont = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LifeCity",
  description: "Track your tasks and goals, earn coins, and build a city as you grow.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "LifeCity", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#070d20", viewportFit: "cover" }; // cover: the bottom menu sits on the screen edge as the browser bar hides

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script may switch data-theme before React loads, hence suppressHydrationWarning.
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg font-sans text-ink">{children}</body>
    </html>
  );
}
