import { useEffect, useState } from "react";

import { useRoute, type Route } from "../lib/router";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";
import { Link } from "./ui";

interface NavItem {
  label: string;
  to: string;
  matches: Route["name"][];
}

const NAV: NavItem[] = [
  { label: "Games", to: "/games", matches: ["games", "game"] },
  { label: "Studios", to: "/studios", matches: ["studios"] },
  { label: "Publishers", to: "/publishers", matches: ["publishers"] },
  { label: "Technologies", to: "/technologies", matches: ["technologies", "technology"] },
  { label: "About", to: "/about", matches: ["about"] },
];

function isActive(item: NavItem, route: Route | null): boolean {
  if (!route) return false;
  if (item.label === "Studios" && route.name === "company" && route.section === "studios") return true;
  if (item.label === "Publishers" && route.name === "company" && route.section === "publishers") return true;
  return item.matches.includes(route.name);
}

export function SiteHeader() {
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="container-wide flex h-14 items-center justify-between gap-3 sm:h-16">
        <Link
          to="/"
          className="min-w-0 truncate font-display text-base text-text no-underline hover:text-accent sm:text-lg"
        >
          Independent Game DB
        </Link>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <nav className="hidden items-center gap-5 md:flex" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item, route) ? "page" : undefined}
                className={`mono border-b py-1 no-underline ${
                  isActive(item, route)
                    ? "border-accent text-text"
                    : "border-transparent text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden w-40 lg:block lg:w-64">
            <SearchBox />
          </div>

          <ThemeToggle />

          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-line bg-bg-elevated text-muted transition hover:border-accent hover:text-accent md:hidden"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.5]">
              {menuOpen ? <path d="M5 5l10 10M15 5 5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="border-t border-line bg-bg-elevated/95 md:hidden">
          <div className="container-wide space-y-4 py-4">
            <SearchBox />
            <nav className="grid gap-1" aria-label="Mobile" onClick={() => setMenuOpen(false)}>
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive(item, route) ? "page" : undefined}
                  className={`rounded px-3 py-2.5 mono no-underline ${
                    isActive(item, route) ? "bg-surface text-text" : "text-muted hover:bg-surface hover:text-accent"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
