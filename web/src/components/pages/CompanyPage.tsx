import { useMemo } from "react";

import { useAppData } from "../../lib/app-data";
import { sortBy } from "../../lib/collections";
import {
  categoryLabel,
  formatCompact,
  formatDate,
  formatInteger,
  formatPercent,
  labelize,
  roleLabel,
  socialLabel,
} from "../../lib/format";
import { useDocumentTitle } from "../../lib/router";
import type { Company, Game } from "../../lib/types";
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

function companyGames(ids: string[] | undefined, games: Map<string, Game>): Game[] {
  return sortBy(
    (ids ?? []).map((id) => games.get(id)).filter((game): game is Game => game !== undefined),
    (game) => game.statistics?.steam?.reviewCount ?? null,
    "desc",
  );
}

function technologiesOf(games: Game[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const game of games) {
    const tech = game.technology;
    const ids = [
      ...(tech.engines ?? []),
      ...(tech.middleware ?? []),
      ...(tech.languages ?? []),
      ...(tech.tools ?? []),
      ...(tech.techniques ?? []),
    ].map((item) => item.id);

    for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function CompanyPage({ id, section }: { id: string; section: "studios" | "publishers" | "company" }) {
  const data = useAppData();
  const company: Company | undefined = data.index.companies.get(id);

  useDocumentTitle(company ? `${company.name} · Independent Game DB` : "Not found · Independent Game DB");

  const developed = useMemo(
    () => (company ? companyGames(company.games?.developed, data.index.games) : []),
    [company, data.index.games],
  );
  const published = useMemo(
    () => (company ? companyGames(company.games?.published, data.index.games) : []),
    [company, data.index.games],
  );
  const technologies = useMemo(() => technologiesOf([...developed, ...published]), [developed, published]);

  const backTo = section === "publishers" ? "/publishers" : "/studios";
  const backLabel = section === "publishers" ? "All publishers" : "All studios";

  if (!company) {
    return (
      <div className="container-wide py-8">
        <BackLink to={backTo}>{backLabel}</BackLink>
        <div className="mt-6">
          <EmptyState title="That company is not in the dataset">
            It may have been renamed or merged. Try the studios list or the search box.
          </EmptyState>
        </div>
      </div>
    );
  }

  const location = [company.location?.headquarters, company.location?.countryName].filter(Boolean).join(", ");
  const stats = company.statistics;
  const socials = Object.entries(company.socialLinks ?? {});
  const emails = company.emails ?? [];
  const jobs = company.jobs ?? [];
  const parent =
    (company.ownership?.parentCompany && data.index.companies.get(company.ownership.parentCompany)) || null;

  return (
    <article className="container-wide py-8 sm:py-10">
      <BackLink to={backTo}>{backLabel}</BackLink>

      <header className="mt-4">
        <p className="mono m-0 text-accent">
          {company.classification?.category ? categoryLabel(company.classification.category) : "Company"}
          {location ? ` · ${location}` : ""}
        </p>
        <h1 className="m-0 mt-2 text-[clamp(2rem,5vw,3.2rem)]">{company.name}</h1>
        {company.aliases && company.aliases.length > 0 ? (
          <p className="m-0 mt-2 text-sm text-muted">Also known as {company.aliases.join(", ")}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {company.roles.map((role) => (
            <Chip key={role}>{roleLabel(role)}</Chip>
          ))}
          {company.founded ? <Chip muted>Founded {company.founded}</Chip> : null}
          {company.ownership?.status && company.ownership.status !== "unknown" ? (
            <Chip muted>{labelize(company.ownership.status)}</Chip>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {company.website ? (
            <ExternalLink
              href={company.website}
              className="inline-flex items-center rounded border border-accent bg-accent px-4 py-2 mono text-xs text-bg no-underline transition hover:border-text hover:bg-text"
            >
              {hostname(company.website)}
            </ExternalLink>
          ) : null}
          {socials.map(([key, url]) => (
            <ExternalLink
              key={key}
              href={url}
              className="inline-flex items-center rounded border border-line px-4 py-2 mono text-xs text-text no-underline transition hover:border-accent hover:text-accent"
            >
              {socialLabel(key)}
            </ExternalLink>
          ))}
          {company.externalIds?.wikidata ? (
            <ExternalLink
              href={`https://www.wikidata.org/wiki/${company.externalIds.wikidata}`}
              className="inline-flex items-center rounded border border-line px-4 py-2 mono text-xs text-muted no-underline transition hover:border-accent hover:text-accent"
            >
              Wikidata
            </ExternalLink>
          ) : null}
        </div>

        {emails.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="mono text-[0.62rem] text-muted">Email</span>
            {emails.map((email) => (
              <a key={email} href={`mailto:${email}`} className="text-accent no-underline hover:text-text">
                {email}
              </a>
            ))}
          </div>
        ) : null}
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.65fr_1fr] lg:items-start">
        <div className="min-w-0 space-y-10">
          <section>
            <DescriptionBlock description={company.description} />
            {company.classification?.notes ? (
              <p className="m-0 mt-4 border-l border-line pl-4 text-sm leading-relaxed text-muted">
                {company.classification.notes}
              </p>
            ) : null}
          </section>

          {jobs.length > 0 ? (
            <section>
              <SectionHead index="Careers" title="Open roles" />
              <ul className="m-0 mt-5 list-none divide-y divide-line rounded border border-line p-0">
                {jobs.map((job) => (
                  <li key={`${job.title}-${job.url ?? ""}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="m-0 text-text">{job.title}</p>
                      <p className="m-0 mt-1 text-xs text-muted">
                        {[job.location, job.postedAt ? formatDate(job.postedAt) : null].filter(Boolean).join(" · ") ||
                          "Location not listed"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {job.type ? <Chip muted>{labelize(job.type)}</Chip> : null}
                      {job.url ? (
                        <ExternalLink href={job.url} className="mono text-xs text-accent no-underline hover:text-text">
                          View role →
                        </ExternalLink>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {developed.length > 0 ? (
            <section>
              <SectionHead
                index="01 / Developed"
                title="Games developed"
                action={
                  <span className="mono text-[0.66rem] text-muted">
                    {developed.length} {developed.length === 1 ? "title" : "titles"}
                  </span>
                }
              />
              <div className="mt-5">
                <GameTable games={developed} showStudio={false} />
              </div>
            </section>
          ) : null}

          {published.length > 0 ? (
            <section>
              <SectionHead
                index={developed.length > 0 ? "02 / Published" : "01 / Published"}
                title="Games published"
                action={
                  <span className="mono text-[0.66rem] text-muted">
                    {published.length} {published.length === 1 ? "title" : "titles"}
                  </span>
                }
              />
              <div className="mt-5">
                <GameTable games={published} showStudio={false} />
              </div>
            </section>
          ) : null}

          {technologies.size > 0 ? (
            <section>
              <SectionHead index="Technologies" title="Tools and engines in use" />
              <div className="mt-4 flex flex-wrap gap-2">
                {sortBy([...technologies.entries()], ([, count]) => count, "desc").map(([techId, count]) => {
                  const technology = data.index.technologies.get(techId);
                  return (
                    <Link
                      key={techId}
                      to={`/technologies/${techId}`}
                      className="rounded border border-line px-2.5 py-1 text-sm text-muted no-underline transition hover:border-accent hover:text-accent"
                    >
                      {technology?.name ?? labelize(techId)}
                      <span className="ml-1.5 text-xs text-muted/70">{count}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <StatGrid>
            <Stat label="Games" value={formatInteger(stats?.gameCount ?? developed.length + published.length)} />
            <Stat label="Steam reviews" value={stats?.totalSteamReviews ? formatCompact(stats.totalSteamReviews) : "—"} />
            <Stat
              label="Avg. positive"
              value={stats?.averagePositivePercentage ? formatPercent(stats.averagePositivePercentage) : "—"}
            />
            <Stat label="Technologies" value={formatInteger(technologies.size)} />
          </StatGrid>

          <div className="rounded border border-line bg-bg-elevated/50">
            {[
              { label: "Location", value: location },
              {
                label: "Founded",
                value: company.founded ? String(company.founded) : (formatDate(company.foundedDate) ?? null),
              },
              {
                label: "Ownership",
                value: parent ? (
                  <Link to={`/company/${parent.id}`} className="text-accent no-underline hover:text-text">
                    {parent.name}
                  </Link>
                ) : (
                  company.ownership?.parentCompanyName ??
                  (company.ownership?.status && company.ownership.status !== "unknown"
                    ? labelize(company.ownership.status)
                    : null)
                ),
              },
              { label: "Roles", value: company.roles.map(roleLabel).join(", ") || null },
            ]
              .filter((row) => row.value)
              .map((row) => (
                <div
                  key={row.label}
                  className="grid gap-0.5 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[7.5rem_1fr] sm:items-baseline sm:gap-3"
                >
                  <p className="mono m-0 text-[0.62rem] text-accent">{row.label}</p>
                  <p className="m-0 text-sm leading-relaxed text-muted">{row.value}</p>
                </div>
              ))}
          </div>

          {stats?.engines && stats.engines.length > 0 ? (
            <div className="rounded border border-line bg-bg-elevated/50 p-4">
              <p className="mono m-0 text-[0.62rem] text-accent">Primary engines</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {stats.engines.map((engineId) => (
                  <Link
                    key={engineId}
                    to={`/technologies/${engineId}`}
                    className="text-sm text-muted no-underline hover:text-accent"
                  >
                    {data.index.technologies.get(engineId)?.name ?? labelize(engineId)}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <p className="mono m-0 text-[0.6rem] text-muted/80">
            Record updated {formatDate(company.lastUpdated?.slice(0, 10)) ?? "—"}
          </p>
        </aside>
      </div>
    </article>
  );
}
