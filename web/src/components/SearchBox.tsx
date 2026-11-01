import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useDataState } from "../lib/app-data";
import { navigate } from "../lib/router";
import { searchEntries, type SearchEntry } from "../lib/search";

const KIND_LABELS: Record<SearchEntry["kind"], string> = {
  game: "Game",
  company: "Company",
  technology: "Tech",
};

export function SearchBox({
  size = "sm",
  autoFocus = false,
  placeholder = "Search games, studios, tech",
}: {
  size?: "sm" | "lg";
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const { searchIndex } = useDataState();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const listId = useId();

  const results = useMemo(() => searchEntries(searchIndex, query, 8), [searchIndex, query]);
  const expanded = open && results.length > 0;
  const current = results[Math.min(active, results.length - 1)];

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function select(entry: SearchEntry) {
    setQuery("");
    setOpen(false);
    navigate(entry.href);
  }

  return (
    <div ref={container} className="relative">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-muted stroke-[1.5]"
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M12.8 12.8 17 17" />
      </svg>
      <input
        type="search"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && current ? `${listId}-${active}` : undefined}
        aria-label="Search the database"
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.currentTarget.blur();
            return;
          }
          if (!expanded) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => (index + 1) % results.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => (index - 1 + results.length) % results.length);
          } else if (event.key === "Enter" && current) {
            event.preventDefault();
            select(current);
          }
        }}
        className={`w-full rounded border border-line bg-bg-elevated pl-9 pr-3 text-text placeholder:text-muted/80 focus:border-accent focus:outline-none ${
          size === "lg" ? "py-3 text-base" : "py-2 text-sm"
        }`}
      />
      {expanded ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-96 overflow-auto rounded border border-line bg-bg-elevated p-1 shadow-lg"
        >
          {results.map((entry, index) => (
            <li
              key={`${entry.kind}:${entry.id}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => select(entry)}
              className={`cursor-pointer rounded px-3 py-2 ${
                index === active ? "bg-surface text-text" : "text-muted"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-text">{entry.label}</span>
                <span className="mono shrink-0 text-[0.62rem] text-accent">{KIND_LABELS[entry.kind]}</span>
              </div>
              <p className="m-0 mt-0.5 truncate text-xs text-muted">{entry.meta}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
