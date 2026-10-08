import type { Metadata } from "next";
import { DM_Mono, IBM_Plex_Sans_JP, Zen_Kaku_Gothic_New } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import "./globals.css";

const zenKaku = Zen_Kaku_Gothic_New({
  weight: ["700"],
  subsets: ["latin"],
  variable: "--font-zen-kaku",
  display: "swap",
  preload: false,
});

const plexJp = IBM_Plex_Sans_JP({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-jp",
  display: "swap",
  preload: false,
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "zero-second", template: "%s | zero-second" },
  description: "チケット発売の予約と、購入にかかった時間の記録",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${zenKaku.variable} ${plexJp.variable} ${dmMono.variable}`}>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="wordmark" aria-label="zero-second ダッシュボード">
              <span>zero</span>
              <span className="wordmark-tick">+00:00.000</span>
            </Link>
            <Nav />
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
