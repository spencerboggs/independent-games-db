import { useEffect, useMemo, useState } from "react";

import { useAppData } from "../../lib/app-data";
import { sortBy } from "../../lib/collections";
import { categoryLabel, formatCompact, formatInteger, roleLabel } from "../../lib/format";
import { normalizeText } from "../../lib/search";
import { useDocumentTitle } from "../../lib/router";
import type { Company } from "../../lib/types";
import { Link, PageHead } from "../ui";

type CompanySortKey = "name" | "games" | "reviews" | "founded";

interface CompaniesView {
  query: string;
  country: string;
  category: string;
  curated: boolean;
  sort: CompanySortKey;
  direction: "asc" | "desc";
}

const DEFAULTS: CompaniesView = {
  query: "",
  country: "all",
  category: "all",
  curated: true,
  sort: "reviews",
  direction: "desc",
};

const saved: Record<"studios" | "publishers", CompaniesView> = {
  studios: DEFAULTS,
  publishers: DEFAULTS,
};

const SORTS: { key: CompanySortKey; label: string }[] = [
  { key: "reviews", label: "Steam reviews" },
  { key: "games", label: "Game count" },
  { key: "name", label: "Name" },
  { key: "founded", label: "Founded" },
];

function companyValue(company: Company, key: CompanySortKey): string | number | null {
  switch (key) {
    case "name":
      return company.name;
    case "games":
      return company.statistics?.gameCount ?? company.games?.developed?.length ?? 0;
    case "reviews":
      return company.statistics?.totalSteamReviews ?? null;
    case "founded":
      return company.founded ?? null;
    default:
      return company.name;
  }
}

export function CompaniesPage({ section }: { section: "studios" | "publishers" }) {
  const role = section === "studios" ? "developer" : "publisher";
  useDocumentTitle(`${section === "studios" ? "Studios" : "Publishers"} · Independent Game DB`);

  const data = useAppData();
  const [view, setView] = useState<CompaniesView>(saved[section]);

  useEffect(() => {
    saved[section] = view;
  }, [section, view]);

  const all = useMemo(
    () => data.companies.filter((company) => company.roles.includes(role)),
    [data.companies, role],
  );
  const curatedCount = all.filter((company) => company.classification?.include).length;

  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const company of all) {
      const country = company.location?.countryName;
      if (country) counts.set(country, (counts.get(country) ?? 0) + 1);
    }
    return sortBy([...counts.entries()], ([, count]) => count, "desc").slice(0, 40);
  }, [all]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const company of all) {
      const category = company.classification?.category;
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return sortBy([...counts.entries()], ([, count]) => count, "desc");
  }, [all]);

  const companies = useMemo(() => {
    const query = normalizeText(view.query);

    const filtered = all.filter((company) => {
      if (view.curated && !company.classification?.include) return false;
      if (view.country !== "all" && company.location?.countryName !== view.country) return false;
      if (view.category !== "all" && company.classification?.category !== view.category) return false;
      if (!query) return true;

      const haystack = normalizeText([company.name, ...(company.aliases ?? [])].join(" "));
      return haystack.includes(query);
    });

    return sortBy(filtered, (company) => companyValue(company, view.sort), view.direction);
  }, [all, view]);

  function update<K extends keyof CompaniesView>(key: K, value: CompaniesView[K]) {
    setView((current) => ({ ...current, [key]: value }));
  }

  function toggleSort(key: CompanySortKey) {
    setView((current) =>
      current.sort === key
        ? { ...current, direction: current.direction === "asc" ? "desc" : "asc" }
        : { ...current, sort: key, direction: key === "name" ? "asc" : "desc" },
    );
  }

  const header = (key: CompanySortKey, label: string, align = "left") => (
    <th scope="col" className={`px-3 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`mono text-[0.66rem] ${view.sort === key ? "text-text" : "text-muted hover:text-accent"}`}
      >
        {label}
        <span aria-hidden="true" className={`ml-1 text-[0.7em] ${view.sort === key ? "text-accent" : "text-muted/60"}`}>
          {view.sort === key ? (view.direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );

  const selectClass =
    "w-full rounded border border-line bg-bg-elevated px-2.5 py-2 text-sm text-text focus:border-accent focus:outline-none";

  return (
    <div className="container-wide py-8 sm:py-10">
      <PageHead
        section={section}
        title={section === "studios" ? "Studios" : "Publishers"}
      >
        {section === "studios"
          ? "Independent developers and the games they build. Open a studio to see its full catalogue, technology, and links."
          : "Publishers that bring independent games to market, with the titles they have released."}
      </PageHead>

      <div className="mt-8 rounded border border-line bg-bg-elevated/50 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="sm:col-span-2">
            <span className="mono mb-1 block text-[0.62rem] text-muted">Search</span>
            <input
              type="search"
              value={view.query}
              onChange={(event) => update("query", event.target.value)}
              placeholder="Studio or publisher name"
              className="w-full rounded border border-line bg-bg-elevated px-3 py-2 text-sm text-text placeholder:text-muted/80 focus:border-accent focus:outline-none"
            />
          </label>

          <label>
            <span className="mono mb-1 block text-[0.62rem] text-muted">Country</span>
            <select value={view.country} onChange={(event) => update("country", event.target.value)} className={selectClass}>
              <option value="all">All countries</option>
              {countries.map(([country]) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mono mb-1 block text-[0.62rem] text-muted">Classification</span>
            <select
              value={view.category}
              onChange={(event) => update("category", event.target.value)}
              className={selectClass}
            >
              <option value="all">Any classification</option>
              {categories.map(([category, count]) => (
                <option key={category} value={category}>
                  {categoryLabel(category)} ({count})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="mono mb-1 block text-[0.62rem] text-muted">Sort by</span>
            <select
              value={view.sort}
              onChange={(event) => update("sort", event.target.value as CompanySortKey)}
              className={selectClass}
            >
              {SORTS.map((sort) => (
                <option key={sort.key} value={sort.key}>
                  {sort.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => update("direction", view.direction === "asc" ? "desc" : "asc")}
              className="w-full rounded border border-line px-3 py-2 mono text-[0.66rem] text-text transition hover:border-accent hover:text-accent"
            >
              {view.direction === "asc" ? "Ascending ↑" : "Descending ↓"}
            </button>
          </div>

          <div className="flex items-end sm:col-span-2">
            <label className="flex h-[38px] w-full cursor-pointer items-center gap-2 rounded border border-line px-3 text-sm text-muted transition hover:border-accent hover:text-accent">
              <input
                type="checkbox"
                checked={view.curated}
                onChange={(event) => update("curated", event.target.checked)}
                className="h-3.5 w-3.5 accent-current"
              />
              Curated only
            </label>
          </div>
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <p className="m-0 text-sm text-muted">
            <span className="text-text">{formatInteger(companies.length)}</span>{" "}
            {companies.length === 1 ? "company" : "companies"} · {curatedCount} curated of {all.length} with the{" "}
            {roleLabel(role).toLowerCase()} role
          </p>
        </div>
      </div>

      <div className="mt-6 hidden overflow-x-auto rounded border border-line md:block">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead className="bg-bg-elevated">
            <tr className="border-b border-line">
              {header("name", "Name")}
              <th scope="col" className="px-3 py-2.5">
                <span className="mono text-[0.66rem] text-muted">Location</span>
              </th>
              {header("founded", "Founded", "right")}
              {header("games", "Games", "right")}
              {header("reviews", "Steam reviews", "right")}
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const games = company.statistics?.gameCount ?? 0;
              const reviews = company.statistics?.totalSteamReviews ?? 0;
              const location = [company.location?.headquarters, company.location?.countryName]
                .filter(Boolean)
                .join(", ");

              return (
                <tr key={company.id} className="border-b border-line/70 transition last:border-0 hover:bg-bg-elevated/70">
                  <td className="px-3 py-2.5">
                    <Link to={`/${section}/${company.id}`} className="text-text no-underline hover:text-accent">
                      {company.name}
                    </Link>
                    {company.classification?.category && company.classification.category !== "unclassified" ? (
                      <span className="ml-2 text-xs text-muted">{categoryLabel(company.classification.category)}</span>
                    ) : null}
                  </td>
                  <td className="max-w-[16rem] truncate px-3 py-2.5 text-muted">{location || "—"}</td>
                  <td className="px-3 py-2.5 text-right text-muted">{company.founded ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right text-muted">{games || "—"}</td>
                  <td className="px-3 py-2.5 text-right text-muted">{reviews ? formatCompact(reviews) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-2 md:hidden">
        {companies.map((company) => {
          const games = company.statistics?.gameCount ?? 0;
          const location = [company.location?.headquarters, company.location?.countryName].filter(Boolean).join(", ");

          return (
            <Link
              key={company.id}
              to={`/${section}/${company.id}`}
              className="block rounded border border-line bg-bg-elevated/60 p-4 text-text no-underline transition hover:border-accent-dim"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-display text-lg leading-tight">{company.name}</span>
                <span className="mono shrink-0 text-[0.62rem] text-muted">{company.founded ?? "—"}</span>
              </div>
              <p className="m-0 mt-1 text-sm text-muted">{location || roleLabel(role)}</p>
              <p className="m-0 mt-2 text-xs text-muted">
                {games} {games === 1 ? "game" : "games"}
                {company.statistics?.totalSteamReviews
                  ? ` · ${formatCompact(company.statistics.totalSteamReviews)} reviews`
                  : ""}
              </p>
            </Link>
          );
        })}
      </div>

      {companies.length === 0 ? (
        <div className="mt-6 rounded border border-dashed border-line px-5 py-12 text-center">
          <p className="m-0 text-lg">No companies match those filters.</p>
          <button
            type="button"
            onClick={() => setView(DEFAULTS)}
            className="mono mt-3 text-xs text-accent hover:text-text"
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}
