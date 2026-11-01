import { DataProvider, useDataState } from "../lib/app-data";
import { useRoute, type Route } from "../lib/router";
import { AboutPage } from "./pages/AboutPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { CompanyPage } from "./pages/CompanyPage";
import { GamePage } from "./pages/GamePage";
import { GamesPage } from "./pages/GamesPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { TechnologiesPage } from "./pages/TechnologiesPage";
import { TechnologyPage } from "./pages/TechnologyPage";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

function Routes({ route }: { route: Route }) {
  switch (route.name) {
    case "home":
      return <HomePage />;
    case "games":
      return <GamesPage />;
    case "game":
      return <GamePage id={route.id} />;
    case "studios":
    case "publishers":
      return <CompaniesPage section={route.name} />;
    case "company":
      return <CompanyPage id={route.id} section={route.section} />;
    case "technologies":
      return <TechnologiesPage />;
    case "technology":
      return <TechnologyPage id={route.id} />;
    case "about":
      return <AboutPage />;
    default:
      return <NotFoundPage />;
  }
}

function Boot() {
  return (
    <div className="container-wide flex min-h-[55vh] flex-col items-center justify-center gap-3 py-16">
      <p className="mono m-0 text-accent">Independent Game DB</p>
      <p className="m-0 text-muted">Loading the dataset…</p>
      <div className="mt-2 h-px w-40 animate-pulse bg-accent/60" />
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="container-site py-20 text-center">
      <p className="mono m-0 text-accent">Dataset unavailable</p>
      <h1 className="m-0 mt-3 text-[clamp(1.6rem,4vw,2.4rem)]">The data could not be loaded</h1>
      <p className="m-0 mx-auto mt-3 max-w-md text-muted">{message ?? "Check your connection and try again."}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded border border-accent bg-accent px-4 py-2 mono text-xs text-bg transition hover:border-text hover:bg-text"
      >
        Try again
      </button>
    </div>
  );
}

function Frame() {
  const { status, error, source, reload } = useDataState();
  const route = useRoute();

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:border focus:border-accent focus:bg-bg-elevated focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 overflow-x-clip focus:outline-none">
        {source === "stale" ? (
          <div className="border-b border-line bg-bg-elevated/60">
            <div className="container-wide flex flex-wrap items-center justify-between gap-2 py-2">
              <p className="mono m-0 text-[0.6rem] text-muted">
                Showing a cached copy · the latest dataset could not be checked
              </p>
              <button type="button" onClick={reload} className="mono text-[0.6rem] text-accent hover:text-text">
                Retry
              </button>
            </div>
          </div>
        ) : null}

        {status === "loading" ? <Boot /> : null}
        {status === "error" ? <LoadError message={error} onRetry={reload} /> : null}
        {status === "ready" ? route ? <Routes route={route} /> : <Boot /> : null}
      </main>
      <SiteFooter />
    </div>
  );
}

export default function App() {
  return (
    <DataProvider>
      <Frame />
    </DataProvider>
  );
}
