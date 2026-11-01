import { useMemo } from "react";

import { useAppData } from "../../lib/app-data";
import { sortBy } from "../../lib/collections";
import { categoryLabel, formatCompact, formatInteger, labelize } from "../../lib/format";
import { useDocumentTitle } from "../../lib/router";
import type { Game, Technology } from "../../lib/types";
import { DescriptionBlock } from "../DescriptionBlock";
import { GameTable } from "../GameTable";
import { BackLink, Chip, EmptyState, ExternalLink, Link, SectionHead, Stat, StatGrid } from "../ui";

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function TechnologyPage({ id }: { id: string }) {
  const data = useAppData();
  const technology: Technology | undefined = data.index.technologies.get(id);

  useDocumentTitle(technology ? `${technology.name} · Independent Game DB` : "Not found · Independent Game DB");

  const games = useMemo(
    () =>
      technology
        ? sortBy(
            (technology.games ?? [])
              .map((gameId) => data.index.games.get(gameId))
              .filter((game): game is Game => game !== undefined),
            (game) => game.statistics?.steam?.reviewCount ?? null,
            "desc",
          )
        : [],
    [data.index.games, technology],
  );

  const related = useMemo(
    () =>
      technology
        ? sortBy(
            data.technologies.filter((item) => item.category === technology.category && item.id !== technology.id),
            (item) => item.statistics?.gameCount ?? 0,
            "desc",
          ).slice(0, 8)
        : [],
    [data.technologies, technology],
  );

  if (!technology) {
    return (
      <div className="container-wide py-8">
        <BackLink to="/technologies">All technologies</BackLink>
        <div className="mt-6">
          <EmptyState title="That technology is not in the dataset">
            Try the technologies index or the search box.
          </EmptyState>
        </div>
      </div>
    );
  }

  const stats = technology.statistics;

  return (
    <article className="container-wide py-8 sm:py-10">
      <BackLink to="/technologies">All technologies</BackLink>

      <header className="mt-4">
        <p className="mono m-0 text-accent">
          {categoryLabel(technology.category)}
          {technology.subcategory ? ` · ${labelize(technology.subcategory)}` : ""}
        </p>
        <h1 className="m-0 mt-2 text-[clamp(2rem,5vw,3.2rem)]">{technology.name}</h1>
        {technology.aliases && technology.aliases.length > 0 ? (
          <p className="m-0 mt-2 text-sm text-muted">Also known as {technology.aliases.join(", ")}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {technology.license ? <Chip>{labelize(technology.license)}</Chip> : null}
          {technology.developer ? <Chip muted>{technology.developer}</Chip> : null}
          {stats?.gameCount ? <Chip muted>{stats.gameCount} games</Chip> : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {technology.website ? (
            <ExternalLink
              href={technology.website}
              className="inline-flex items-center rounded border border-accent bg-accent px-4 py-2 mono text-xs text-bg no-underline transition hover:border-text hover:bg-text"
            >
              {hostname(technology.website)}
            </ExternalLink>
          ) : null}
          {technology.externalIds?.wikidata ? (
            <ExternalLink
              href={`https://www.wikidata.org/wiki/${technology.externalIds.wikidata}`}
              className="inline-flex items-center rounded border border-line px-4 py-2 mono text-xs text-muted no-underline transition hover:border-accent hover:text-accent"
            >
              Wikidata
            </ExternalLink>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.65fr_1fr] lg:items-start">
        <div className="min-w-0 space-y-10">
          <DescriptionBlock description={technology.description} />

          <section>
            <SectionHead
              index="01 / Catalogue"
              title={`Games using ${technology.name}`}
              action={
                <span className="mono text-[0.66rem] text-muted">
                  {games.length} {games.length === 1 ? "title" : "titles"}
                </span>
              }
            />
            <div className="mt-5">
              {games.length > 0 ? (
                <GameTable games={games} />
              ) : (
                <EmptyState title="No credited games yet">
                  This entry is catalogued, but no game in the dataset names it as part of its stack.
                </EmptyState>
              )}
            </div>
          </section>

          {related.length > 0 ? (
            <section>
              <SectionHead index="Related" title={`Other ${categoryLabel(technology.category).toLowerCase()}`} />
              <div className="mt-4 flex flex-wrap gap-2">
                {related.map((item) => (
                  <Link
                    key={item.id}
                    to={`/technologies/${item.id}`}
                    className="rounded border border-line px-2.5 py-1 text-sm text-muted no-underline transition hover:border-accent hover:text-accent"
                  >
                    {item.name}
                    <span className="ml-1.5 text-xs text-muted/70">{item.statistics?.gameCount ?? 0}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside>
          <StatGrid>
            <Stat label="Games" value={formatInteger(stats?.gameCount ?? games.length)} />
            <Stat label="Companies" value={formatInteger(stats?.companyCount ?? 0)} />
            <Stat
              label="Steam reviews"
              value={stats?.totalSteamReviews ? formatCompact(stats.totalSteamReviews) : "—"}
            />
            <Stat label="Category" value={categoryLabel(technology.category)} />
          </StatGrid>
        </aside>
      </div>
    </article>
  );
}
