import "./globals.css";

export const metadata = {
  title: "Budget App",
  description: "Simple budgeting app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
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

              <a
                href="/login"
                className="rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                Login
              </a>
            </nav>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
