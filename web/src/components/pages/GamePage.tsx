import { useMemo } from "react";

import { useAppData } from "../../lib/app-data";
import {
  CONFIDENCE_LABELS,
  formatCompact,
  formatDate,
  formatInteger,
  formatPercent,
  labelize,
  platformLabel,
  statusLabel,
  typeLabel,
} from "../../lib/format";
import { useDocumentTitle } from "../../lib/router";
import type { Game } from "../../lib/types";
import { DescriptionBlock } from "../DescriptionBlock";
import { BackLink, Chip, EmptyState, ExternalLink, Link, SectionHead } from "../ui";

const TECH_GROUPS: { key: keyof Game["technology"]; label: string; note: string }[] = [
  { key: "engines", label: "Engines", note: "The runtime the game ships on." },
  { key: "middleware", label: "Middleware", note: "Audio, physics, networking, and other licensed systems." },
  { key: "languages", label: "Languages", note: "Languages the game is written in." },
  { key: "tools", label: "Tools", note: "Authoring and production tools credited to the game." },
  { key: "techniques", label: "Systems & techniques", note: "Methods and concepts the game is built around." },
];

function hostedLink(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function GamePage({ id }: { id: string }) {
  const data = useAppData();
  const game: Game | undefined = data.index.games.get(id);

  useDocumentTitle(game ? `${game.title} · Independent Game DB` : "Not found · Independent Game DB");

  const credits = useMemo(() => {
    if (!game) return [];

    const roles = new Map<string, Set<string>>();
    const add = (id: string, role: string) => {
      const entry = roles.get(id) ?? new Set<string>();
      entry.add(role);
      roles.set(id, entry);
    };

    for (const companyId of game.developers) add(companyId, "developer");
    for (const companyId of game.publishers) add(companyId, "publisher");

    return [...roles.entries()].flatMap(([companyId, roleSet]) => {
      const company = data.index.companies.get(companyId);
      return company ? [{ company, roles: [...roleSet] }] : [];
    });
  }, [data.index.companies, game]);

  const related = useMemo(() => {
    if (!game?.relations) return [];
    const ids = [
      ...(game.relations.dlc ?? []),
      ...(game.relations.parentGame ? [game.relations.parentGame] : []),
      ...(game.relations.remasterOf ? [game.relations.remasterOf] : []),
      ...(game.relations.portOf ? [game.relations.portOf] : []),
    ];
    return [...new Set(ids)]
      .map((gameId) => data.index.games.get(gameId))
      .filter((item): item is Game => item !== undefined && item.id !== game.id);
  }, [data.index.games, game]);

  if (!game) {
    return (
      <div className="container-wide py-8">
        <BackLink to="/games">All games</BackLink>
        <div className="mt-6">
          <EmptyState title="That game is not in the dataset">
            It may have been renamed or merged. Try the games list or the search box.
          </EmptyState>
        </div>
      </div>
    );
  }

  const steam = game.statistics?.steam;
  const velocity = game.statistics?.reviewVelocity;
  const header = game.media?.header?.url;
  const meta = [
    { label: "Released", value: formatDate(game.releaseDate, game.releaseDatePrecision) ?? "Unknown" },
    { label: "Status", value: statusLabel(game.releaseStatus) },
    { label: "Type", value: typeLabel(game.type) },
  ];

  return (
    <article className="container-wide py-8 sm:py-10">
      <BackLink to="/games">All games</BackLink>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1.65fr_1fr] lg:items-start lg:gap-12">
        <div className="min-w-0">
          {header ? (
            <ExternalLink
              href={game.links?.steam ?? header}
              className="block overflow-hidden rounded border border-line"
              title="Artwork referenced from Steam"
            >
              <img
                src={header}
                alt={`${game.title} artwork`}
                width={920}
                height={430}
                className="aspect-[460/215] w-full object-cover transition duration-300 hover:opacity-90"
              />
            </ExternalLink>
          ) : null}

          <header className={header ? "mt-6" : ""}>
            <p className="mono m-0 text-accent">
              {game.franchise?.name ?? game.series?.name ?? typeLabel(game.type)}
            </p>
            <h1 className="m-0 mt-2 text-[clamp(2rem,5vw,3.2rem)]">{game.title}</h1>
            {game.alternateTitles && game.alternateTitles.length > 0 ? (
              <p className="m-0 mt-2 text-sm text-muted">Also known as {game.alternateTitles.join(", ")}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Chip>{statusLabel(game.releaseStatus)}</Chip>
              {game.releaseDate ? <Chip muted>{meta[0]?.value}</Chip> : null}
              {game.type !== "game" ? <Chip muted>{typeLabel(game.type)}</Chip> : null}
              {game.platforms.length > 0 ? <Chip muted>{game.platforms.length} platforms</Chip> : null}
            </div>
          </header>

          <section className="mt-6">
            <DescriptionBlock description={game.descriptions} />
          </section>

          <section className="mt-8 space-y-6">
            {TECH_GROUPS.map((group) => {
              const entries = game.technology[group.key] ?? [];
              if (entries.length === 0) return null;

              return (
                <div key={group.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                    <h2 className="m-0 text-lg">{group.label}</h2>
                    <p className="m-0 text-xs text-muted">{group.note}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entries.map((entry) => {
                      const technology = data.index.technologies.get(entry.id);
                      if (!technology) return null;

                      return (
                        <Link
                          key={`${group.key}-${entry.id}`}
                          to={`/technologies/${entry.id}`}
                          title={entry.confidence ? CONFIDENCE_LABELS[entry.confidence] ?? entry.confidence : undefined}
                          className="rounded border border-line px-2.5 py-1 text-sm text-text no-underline transition hover:border-accent hover:text-accent"
                        >
                          {technology.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="mt-8">
            <SectionHead index="Detail" title="Platforms, genres, and features" />
            <div className="mt-4 rounded border border-line bg-bg-elevated/50">
              {[
                {
                  label: "Platforms",
                  values: game.platforms.map((platform) => platformLabel(platform)),
                },
                {
                  label: "Genres",
                  values: game.genres.map((genre) => labelize(genre)),
                },
                {
                  label: "Features",
                  values: game.features.map((feature) => labelize(feature)),
                },
                {
                  label: "Languages",
                  values: game.supportedLanguages,
                },
              ]
                .filter((row) => row.values.length > 0)
                .map((row) => (
                  <div
                    key={row.label}
                    className="grid gap-1 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[8rem_1fr] sm:items-baseline sm:gap-4"
                  >
                    <p className="mono m-0 text-[0.62rem] text-accent">{row.label}</p>
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted">
                      {row.values.map((value) => (
                        <span key={value} className="after:content-[','] last:after:content-none">
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>

          {related.length > 0 ? (
            <section className="mt-8">
              <SectionHead index="Related" title="Editions and add-ons" />
              <div className="mt-4 flex flex-wrap gap-2">
                {related.map((item) => (
                  <Link
                    key={item.id}
                    to={`/games/${item.id}`}
                    className="rounded border border-line px-2.5 py-1 text-sm text-muted no-underline transition hover:border-accent hover:text-accent"
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          {steam ? (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line">
              {[
                { label: "Reviews", value: steam.reviewCount ? formatInteger(steam.reviewCount) : "—" },
                { label: "Positive", value: formatPercent(steam.positivePercentage) ?? "—" },
                {
                  label: "Current players",
                  value: steam.currentPlayers !== null && steam.currentPlayers !== undefined ? formatCompact(steam.currentPlayers) : "—",
                },
                {
                  label: "Reviews / day",
                  value: velocity?.reviewsPerDay ? velocity.reviewsPerDay.toFixed(1) : "—",
                },
              ].map((stat) => (
                <div key={stat.label} className="bg-bg-elevated px-4 py-4">
                  <p className="mono m-0 text-[0.6rem] text-accent">{stat.label}</p>
                  <p className="m-0 mt-1 text-xl leading-tight">{stat.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {steam?.reviewScoreDescription ? (
            <p className="mono m-0 text-[0.62rem] text-muted">
              Steam rating · {steam.reviewScoreDescription}
            </p>
          ) : null}

          {credits.length > 0 ? (
            <div className="rounded border border-line bg-bg-elevated/50 p-4">
              <p className="mono m-0 text-[0.62rem] text-accent">Credits</p>
              <ul className="m-0 mt-2 list-none space-y-1.5 p-0 text-sm">
                {credits.map(({ company, roles }) => (
                  <li key={company.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      to={`/${roles.includes("developer") ? "studios" : "publishers"}/${company.id}`}
                      className="text-text no-underline hover:text-accent"
                    >
                      {company.name}
                    </Link>
                    <span className="text-xs text-muted">{roles.join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {game.links && Object.keys(game.links).length > 0 ? (
            <div className="rounded border border-line bg-bg-elevated/50 p-4">
              <p className="mono m-0 text-[0.62rem] text-accent">Links</p>
              <ul className="m-0 mt-2 list-none space-y-1.5 p-0 text-sm">
                {Object.entries(game.links)
                  .filter(([, url]) => typeof url === "string" && url.startsWith("http"))
                  .map(([key, url]) => (
                    <li key={key} className="flex items-baseline justify-between gap-3">
                      <ExternalLink href={url} className="text-accent no-underline hover:text-text">
                        {labelize(key)}
                      </ExternalLink>
                      <span className="truncate text-xs text-muted">{hostedLink(url)}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <p className="mono m-0 text-[0.6rem] leading-relaxed text-muted/80">
            {header ? "Artwork referenced from Steam · not rehosted. " : ""}
            Record updated {formatDate(game.lastUpdated?.slice(0, 10)) ?? "—"}
          </p>
        </aside>
      </div>
    </article>
  );
}
