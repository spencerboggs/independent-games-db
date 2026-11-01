import { useDataState } from "../lib/app-data";
import { formatDateTime } from "../lib/format";
import { ExternalLink, Link } from "./ui";

export function SiteFooter() {
  const { data } = useDataState();
  const manifest = data?.manifest;

  return (
    <footer className="mt-16 border-t border-line bg-bg-elevated/40">
      <div className="container-wide grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="m-0 font-display text-lg">Independent Game DB</p>
          <p className="m-0 mt-2 max-w-sm text-sm leading-relaxed text-muted">
            A public dataset of independent games, the studios and publishers behind them, and the tools they build
            with.
          </p>
          <p className="mono m-0 mt-4 text-[0.68rem] text-muted">
            {manifest ? `dataset ${manifest.datasetVersion} · ${manifest.counts.games} games` : "dataset loading"}
          </p>
        </div>

        <div>
          <p className="mono m-0 text-[0.68rem] text-accent">Browse</p>
          <ul className="m-0 mt-3 list-none space-y-2 p-0 text-sm">
            {[
              { label: "Games", to: "/games" },
              { label: "Studios", to: "/studios" },
              { label: "Publishers", to: "/publishers" },
              { label: "Technologies", to: "/technologies" },
            ].map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="text-muted no-underline hover:text-accent">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mono m-0 text-[0.68rem] text-accent">Dataset</p>
          <ul className="m-0 mt-3 list-none space-y-2 p-0 text-sm text-muted">
            <li>
              <ExternalLink href="https://github.com/spencerboggs/independent-games-db" className="text-muted no-underline hover:text-accent">
                GitHub repository
              </ExternalLink>
            </li>
            <li>
              <Link to="/about" className="text-muted no-underline hover:text-accent">
                About the data
              </Link>
            </li>
            <li>
              <ExternalLink
                href="https://opendatacommons.org/licenses/odbl/1-0/"
                className="text-muted no-underline hover:text-accent"
              >
                ODbL 1.0
              </ExternalLink>
            </li>
            <li>{manifest ? `Generated ${formatDateTime(manifest.generatedAt)} UTC` : "—"}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="container-wide flex flex-wrap items-center justify-between gap-2 py-4">
          <p className="mono m-0 text-[0.62rem] text-muted">Data updates daily at 1 AM PST · Cached once per day</p>
          <p className="mono m-0 text-[0.62rem] text-muted">Artwork is referenced from source, never rehosted</p>
        </div>
      </div>
    </footer>
  );
}
