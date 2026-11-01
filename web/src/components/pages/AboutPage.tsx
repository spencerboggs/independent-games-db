import { useDataState } from "../../lib/app-data";
import { nextScheduledRefresh } from "../../lib/dataset";
import { formatDateTime, formatInteger } from "../../lib/format";
import { useDocumentTitle } from "../../lib/router";
import { ExternalLink, Link, PageHead, SectionHead, Stat, StatGrid } from "../ui";

const SOURCE_LABELS: Record<string, string> = {
  cache: "Loaded from this browser's cache",
  network: "Downloaded from the published dataset",
  stale: "Using a cached copy",
};

export function AboutPage() {
  useDocumentTitle("About the data · Independent Game DB");

  const { data, source, refreshing, reload } = useDataState();
  const manifest = data?.manifest;

  return (
    <div className="container-wide py-8 sm:py-10">
      <PageHead section="about" title="About the data">
        A public dataset of independent and non-AAA games. Everything on this site is generated from the JSON files
        published in the repository, so the pages stay in step with the data.
      </PageHead>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <div className="space-y-10">
          <section>
            <SectionHead index="01 / Contents" title="What is in the database">
              Each game record carries its studios, publishers, release information, platforms, genres, Steam
              reception, and the engines and tools credited to it. Company records carry roles, location, ownership,
              website and social links, and their game lists.
            </SectionHead>

            {manifest ? (
              <div className="mt-5">
                <StatGrid>
                  <Stat label="Games" value={formatInteger(manifest.counts.games)} />
                  <Stat label="Companies" value={formatInteger(manifest.counts.companies)} />
                  <Stat label="Technologies" value={formatInteger(manifest.counts.technologies)} />
                  <Stat label="Relationships" value={formatInteger(manifest.counts.relationships)} />
                </StatGrid>
              </div>
            ) : null}
          </section>

          <section>
            <SectionHead index="02 / Freshness" title="How updates work">
              The data pipeline runs every day at 1 AM PST and publishes a new data/latest build. This site keeps a
              copy of the dataset in your browser and only revalidates it after the daily run, so a visit costs one
              small manifest request instead of a full download.
            </SectionHead>

            <div className="mt-5 rounded border border-line bg-bg-elevated/50">
              {[
                {
                  label: "Last generated",
                  value: manifest ? `${formatDateTime(manifest.generatedAt)} UTC` : "—",
                },
                {
                  label: "Last checked",
                  value: data ? `${formatDateTime(data.checkedAt)} UTC` : "—",
                },
                {
                  label: "Next refresh",
                  value: `${formatDateTime(nextScheduledRefresh().getTime())} UTC`,
                },
                {
                  label: "Source",
                  value: source ? SOURCE_LABELS[source] : "—",
                },
                {
                  label: "Content hash",
                  value: manifest ? `${manifest.contentHash.slice(0, 16)}…` : "—",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="grid gap-0.5 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:items-baseline sm:gap-3"
                >
                  <p className="mono m-0 text-[0.62rem] text-accent">{row.label}</p>
                  <p className="m-0 break-all text-sm leading-relaxed text-muted">{row.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={reload}
                disabled={refreshing}
                className="inline-flex items-center rounded border border-line px-4 py-2 mono text-xs text-text transition hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60"
              >
                {refreshing ? "Checking…" : "Check for updates"}
              </button>
              <p className="m-0 text-xs text-muted">
                Revalidates against the published manifest. The full dataset is downloaded only when the content hash
                changes.
              </p>
            </div>
          </section>

          <section>
            <SectionHead index="03 / Licensing" title="Attribution">
              The database compilation is published under the Open Database License 1.0 and the site code under the
              MIT license. Artwork is linked from its source and never rehosted. Steam, Valve, and their trademarks
              remain the property of their respective owners.
            </SectionHead>
            <div className="mt-4 flex flex-wrap gap-2">
              <ExternalLink
                href="https://opendatacommons.org/licenses/odbl/1-0/"
                className="rounded border border-line px-4 py-2 mono text-xs text-text no-underline transition hover:border-accent hover:text-accent"
              >
                ODbL 1.0
              </ExternalLink>
              <ExternalLink
                href="https://github.com/spencerboggs/independent-games-db/blob/main/LICENSE-CODE"
                className="rounded border border-line px-4 py-2 mono text-xs text-text no-underline transition hover:border-accent hover:text-accent"
              >
                MIT
              </ExternalLink>
              <ExternalLink
                href="https://github.com/spencerboggs/independent-games-db/blob/main/DATA-SOURCES.md"
                className="rounded border border-line px-4 py-2 mono text-xs text-text no-underline transition hover:border-accent hover:text-accent"
              >
                Data sources
              </ExternalLink>
            </div>
          </section>

          <section>
            <SectionHead index="04 / Contribute" title="Corrections and additions">
              Anyone can open an issue or a pull request. Games and companies are discovered from Wikidata and Steam,
              then curated by hand; technology claims need a source.
            </SectionHead>
            <div className="mt-4 flex flex-wrap gap-2">
              <ExternalLink
                href="https://github.com/spencerboggs/independent-games-db/issues/new?template=add-company.yml"
                className="rounded border border-line px-4 py-2 mono text-xs text-text no-underline transition hover:border-accent hover:text-accent"
              >
                Suggest a studio
              </ExternalLink>
              <ExternalLink
                href="https://github.com/spencerboggs/independent-games-db/issues/new?template=data-correction.yml"
                className="rounded border border-line px-4 py-2 mono text-xs text-text no-underline transition hover:border-accent hover:text-accent"
              >
                Report a correction
              </ExternalLink>
              <ExternalLink
                href="https://github.com/spencerboggs/independent-games-db/issues/new?template=technology-claim.yml"
                className="rounded border border-line px-4 py-2 mono text-xs text-text no-underline transition hover:border-accent hover:text-accent"
              >
                Add a technology
              </ExternalLink>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded border border-line bg-bg-elevated/50 p-5">
            <p className="mono m-0 text-[0.62rem] text-accent">Dataset</p>
            <p className="m-0 mt-2 font-display text-lg">{manifest?.name ?? "Independent Game Database"}</p>
            <p className="m-0 mt-2 text-sm leading-relaxed text-muted">
              {manifest?.description ?? "Public dataset of independent and non-AAA games, companies, and technologies."}
            </p>
            <dl className="m-0 mt-4 space-y-1.5 text-sm text-muted">
              <div className="flex justify-between gap-3">
                <dt className="mono text-[0.6rem]">Version</dt>
                <dd className="m-0">{manifest?.datasetVersion ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="mono text-[0.6rem]">Schema</dt>
                <dd className="m-0">{manifest?.schemaVersion ?? "—"}</dd>
              </div>
            </dl>
            <ExternalLink
              href="https://github.com/spencerboggs/independent-games-db"
              className="mono mt-4 inline-flex text-xs text-accent no-underline hover:text-text"
            >
              Repository →
            </ExternalLink>
          </div>

          <div className="rounded border border-line bg-bg-elevated/50 p-5">
            <p className="mono m-0 text-[0.62rem] text-accent">Shortcuts</p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link to="/games" className="text-muted no-underline hover:text-accent">
                All games
              </Link>
              <Link to="/studios" className="text-muted no-underline hover:text-accent">
                All studios
              </Link>
              <Link to="/publishers" className="text-muted no-underline hover:text-accent">
                All publishers
              </Link>
              <Link to="/technologies" className="text-muted no-underline hover:text-accent">
                All technologies
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
