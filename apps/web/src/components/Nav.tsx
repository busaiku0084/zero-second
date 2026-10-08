"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "ダッシュボード" },
  { href: "/reservations", label: "予約" },
  { href: "/accounts", label: "アカウント" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="メイン">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
