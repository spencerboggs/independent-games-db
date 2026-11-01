import { useMemo } from "react";

import { useAppData } from "../../lib/app-data";
import { sortBy } from "../../lib/collections";
import {
  formatCompact,
  formatDate,
  formatInteger,
  formatPercent,
  typeLabel,
} from "../../lib/format";
import { useDocumentTitle } from "../../lib/router";
import type { Game, Technology } from "../../lib/types";
import { SearchBox } from "../SearchBox";
import { Arrow, Chip, Link, SectionHead } from "../ui";

const RANKED_TYPES = new Set(["game", "expansion", "remaster", "remake", "port"]);

function topGames(games: Game[], limit: number): Game[] {
  return sortBy(
    games.filter((game) => RANKED_TYPES.has(game.type) && game.statistics?.steam?.reviewCount),
    (game) => game.statistics?.steam?.reviewCount ?? null,
    "desc",
  ).slice(0, limit);
}

export function HomePage() {
  useDocumentTitle("Independent Game DB");

  const data = useAppData();

  const mostReviewed = useMemo(() => topGames(data.games, 8), [data.games]);
  const highestRated = useMemo(
    () =>
      sortBy(
        data.games.filter((game) => {
          const steam = game.statistics?.steam;
          return (
            RANKED_TYPES.has(game.type) &&
            (steam?.reviewCount ?? 0) >= 500 &&
            steam?.positivePercentage !== null &&
            steam?.positivePercentage !== undefined
          );
        }),
        (game) => game.statistics?.steam?.positivePercentage ?? null,
        "desc",
      ).slice(0, 6),
    [data.games],
  );
  const recent = useMemo(
    () =>
      sortBy(
        data.games.filter(
          (game) => RANKED_TYPES.has(game.type) && game.releaseDate && game.releaseStatus !== "upcoming",
        ),
        (game) => game.releaseDate,
        "desc",
      ).slice(0, 6),
    [data.games],
  );
  const engines = useMemo(
    () =>
      sortBy(
        data.technologies.filter((technology) => technology.category === "engine" && (technology.games?.length ?? 0) > 0),
        (technology) => technology.statistics?.gameCount ?? 0,
        "desc",
      ).slice(0, 6),
    [data.technologies],
  );
  const studios = useMemo(
    () =>
      sortBy(
        data.companies.filter(
          (company) => company.classification?.include && company.roles.includes("developer"),
        ),
        (company) => company.statistics?.totalSteamReviews ?? 0,
        "desc",
      ).slice(0, 6),
    [data.companies],
  );

  const totals = data.manifest.counts;

  return (
    <div>
      <section className="container-wide pt-10 pb-8 sm:pt-14 sm:pb-10">
        <p className="mono m-0 text-accent">Independent &amp; non-AAA game database</p>
        <h1 className="mt-3 mb-4 max-w-4xl text-[clamp(2.2rem,6vw,4rem)]">
          Every studio, publisher, and engine behind the games you play.
        </h1>
        <p className="m-0 max-w-2xl text-[1.02rem] leading-relaxed text-muted sm:text-lg">
          A public dataset of independent games and the teams that make them, compiled from Steam, Wikidata, and
          manual review. Browse the catalogue, follow a studio, or start with an engine.
        </p>

        <div className="mt-8 max-w-xl">
          <SearchBox size="lg" placeholder="Search 527 games, studios, and technologies" />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-4">
          {[
            { label: "Games", value: formatInteger(totals.games) },
            { label: "Companies", value: formatInteger(totals.companies) },
            { label: "Technologies", value: formatInteger(totals.technologies) },
            { label: "Steam reviews", value: formatCompact(data.games.reduce((total, game) => total + (game.statistics?.steam?.reviewCount ?? 0), 0)) },
          ].map((stat) => (
            <div key={stat.label} className="bg-bg-elevated px-4 py-4">
              <p className="mono m-0 text-[0.62rem] text-accent">{stat.label}</p>
              <p className="m-0 mt-1 text-2xl leading-tight">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-wide section-block">
        <SectionHead index="01 / Browse" title="Start with a section">
          Four ways into the database. Lists sort and filter in place; every row opens a detail page.
        </SectionHead>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Games",
              count: `${totals.games} titles`,
              copy: "Sort by release, reviews, rating, or studio.",
              to: "/games",
            },
            {
              title: "Studios",
              count: `${data.companies.filter((company) => company.roles.includes("developer")).length} developers`,
              copy: "Independent teams and their full catalogue.",
              to: "/studios",
            },
            {
              title: "Publishers",
              count: `${data.companies.filter((company) => company.roles.includes("publisher")).length} publishers`,
              copy: "Who brought each game to market.",
              to: "/publishers",
            },
            {
              title: "Technologies",
              count: `${totals.technologies} entries`,
              copy: "Engines, frameworks, languages, and tools.",
              to: "/technologies",
            },
          ].map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="group flex flex-col gap-2 rounded border border-line bg-bg-elevated/60 p-5 text-inherit no-underline transition hover:-translate-y-0.5 hover:border-accent-dim"
            >
              <div className="mono text-[0.62rem] text-accent">{card.count}</div>
              <h3 className="m-0 text-xl">{card.title}</h3>
              <p className="m-0 flex-1 text-sm leading-relaxed text-muted">{card.copy}</p>
              <span className="mono mt-2 text-[0.64rem] text-accent group-hover:text-text">
                Open <Arrow />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-wide section-block">
        <SectionHead index="02 / Reception" title="What people are playing">
          Ranked by Steam review counts and positive percentages in the current dataset.
        </SectionHead>

        <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <h3 className="m-0 border-b border-line pb-2 text-sm text-muted">Most reviewed</h3>
            <ol className="m-0 list-none p-0">
              {mostReviewed.map((game, index) => {
                const steam = game.statistics?.steam;
                return (
                  <li key={game.id} className="border-b border-line/70">
                    <Link
                      to={`/games/${game.id}`}
                      className="flex items-baseline gap-3 py-2.5 text-inherit no-underline hover:text-accent"
                    >
                      <span className="mono w-6 shrink-0 text-[0.62rem] text-muted">{String(index + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1 truncate">{game.title}</span>
                      <span className="mono shrink-0 text-[0.62rem] text-muted">
                        {steam?.reviewCount ? `${formatCompact(steam.reviewCount)} reviews` : "—"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>

          <div>
            <h3 className="m-0 border-b border-line pb-2 text-sm text-muted">Highest rated (500+ reviews)</h3>
            <ol className="m-0 list-none p-0">
              {highestRated.map((game, index) => {
                const steam = game.statistics?.steam;
                return (
                  <li key={game.id} className="border-b border-line/70">
                    <Link
                      to={`/games/${game.id}`}
                      className="flex items-baseline gap-3 py-2.5 text-inherit no-underline hover:text-accent"
                    >
                      <span className="mono w-6 shrink-0 text-[0.62rem] text-muted">{String(index + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1 truncate">{game.title}</span>
                      <span className="mono shrink-0 text-[0.62rem] text-muted">
                        {formatPercent(steam?.positivePercentage)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      <section className="container-wide section-block">
        <SectionHead
          index="03 / Newest"
          title="Recently released"
          action={
            <Link to="/games" className="mono text-xs text-accent no-underline hover:text-text">
              All games <Arrow />
            </Link>
          }
        >
          The latest releases in the catalogue, with the studio and engine credited.
        </SectionHead>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((game) => {
            const studio = game.developers[0] ? data.index.companies.get(game.developers[0])?.name : null;
            const engine = game.technology.engines?.[0]
              ? data.index.technologies.get(game.technology.engines[0].id)?.name
              : null;

            return (
              <Link
                key={game.id}
                to={`/games/${game.id}`}
                className="group flex flex-col gap-1.5 rounded border border-line bg-bg-elevated/60 p-5 text-inherit no-underline transition hover:-translate-y-0.5 hover:border-accent-dim"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="mono text-[0.62rem] text-accent">
                    {formatDate(game.releaseDate, game.releaseDatePrecision) ?? "—"}
                  </span>
                  <span className="mono text-[0.6rem] text-muted">{typeLabel(game.type)}</span>
                </div>
                <h3 className="m-0 mt-1 text-xl leading-snug">{game.title}</h3>
                <p className="m-0 text-sm text-muted">{studio ?? "Studio unknown"}</p>
                {engine ? <p className="m-0 mt-auto pt-2 text-xs text-muted">Built with {engine}</p> : null}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="container-wide section-block">
        <SectionHead
          index="04 / Technology"
          title="Engines in use"
          action={
            <Link to="/technologies" className="mono text-xs text-accent no-underline hover:text-text">
              All technologies <Arrow />
            </Link>
          }
        >
          The engines credited most often across the dataset.
        </SectionHead>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {engines.map((engine: Technology) => (
            <Link
              key={engine.id}
              to={`/technologies/${engine.id}`}
              className="flex items-baseline justify-between gap-3 rounded border border-line bg-bg-elevated/60 px-5 py-4 text-inherit no-underline transition hover:border-accent-dim"
            >
              <span className="font-display text-lg">{engine.name}</span>
              <span className="mono shrink-0 text-[0.62rem] text-muted">
                {engine.statistics?.gameCount ?? engine.games?.length ?? 0} games
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-wide section-block">
        <SectionHead
          index="05 / Studios"
          title="Curated studios"
          action={
            <Link to="/studios" className="mono text-xs text-accent no-underline hover:text-text">
              All studios <Arrow />
            </Link>
          }
        >
          Studios added by hand to the curated set, ordered by the reach of their catalogue.
        </SectionHead>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {studios.map((studio) => {
            const location = [studio.location?.headquarters, studio.location?.countryName].filter(Boolean).join(", ");

            return (
              <Link
                key={studio.id}
                to={`/studios/${studio.id}`}
                className="flex flex-col gap-1 rounded border border-line bg-bg-elevated/60 p-5 text-inherit no-underline transition hover:-translate-y-0.5 hover:border-accent-dim"
              >
                <h3 className="m-0 text-xl">{studio.name}</h3>
                <p className="m-0 text-sm text-muted">{location || "Location unknown"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Chip muted>
                    {studio.statistics?.gameCount ?? 0} {(studio.statistics?.gameCount ?? 0) === 1 ? "game" : "games"}
                  </Chip>
                  {studio.statistics?.totalSteamReviews ? (
                    <Chip muted>{formatCompact(studio.statistics.totalSteamReviews)} reviews</Chip>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="container-wide pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-bg-elevated/40 px-5 py-4">
          <p className="m-0 text-sm text-muted">
            Dataset {data.manifest.datasetVersion} · generated {formatDate(data.manifest.generatedAt.slice(0, 10))} ·
            refreshed daily at 1 AM PST
          </p>
          <Link to="/about" className="mono text-xs text-accent no-underline hover:text-text">
            About the data <Arrow />
          </Link>
        </div>
      </section>
    </div>
  );
}
