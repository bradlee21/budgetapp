"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

function navItemClass(active: boolean) {
  return [
    "flex flex-col items-center justify-center gap-1 text-xs",
    active
      ? "text-blue-600 dark:text-blue-400"
      : "text-zinc-600 dark:text-zinc-300",
  ].join(" ");
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const items: NavItem[] = [
    {
      href: "/budget",
      label: "Budget",
      icon: (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      ),
    },
    {
      href: "/transactions",
      label: "Transactions",
      icon: (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 7h18M3 12h12M3 17h18" />
        </svg>
      ),
    },
    {
      href: "/debt-accounts",
      label: "Debt",
      icon: (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4 7h16v10H4z" />
          <path d="M4 11h16" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 md:hidden">
      <div className="mx-auto grid h-16 max-w-3xl grid-cols-3">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={navItemClass(active)}
              aria-current={active ? "page" : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
