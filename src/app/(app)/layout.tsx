export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-zinc-200 bg-white/70 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="font-semibold">Budget App</div>

          <nav className="flex flex-wrap gap-2 text-sm">
            <a
              href="/budget"
              className="rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Budget
            </a>
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
