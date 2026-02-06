import MobileBottomNav from "@/components/MobileBottomNav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b brand-border brand-header backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="font-semibold brand-text">Budget App</div>

          <nav className="hidden flex-wrap gap-2 text-sm md:flex">
            <a
              href="/budget"
              className="brand-link rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Budget
            </a>
            <a
              href="/transactions"
              className="brand-link rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Transactions
            </a>
            <a
              href="/debt-accounts"
              className="brand-link rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Debt accounts
            </a>
          </nav>
        </div>
      </header>
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
      <MobileBottomNav />
    </>
  );
}
