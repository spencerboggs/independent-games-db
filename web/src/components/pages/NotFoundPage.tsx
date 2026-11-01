import { useDocumentTitle } from "../../lib/router";
import { SearchBox } from "../SearchBox";
import { Arrow, Link } from "../ui";

export function NotFoundPage() {
  useDocumentTitle("Not found · Independent Game DB");

  return (
    <div className="container-site py-16 text-center sm:py-24">
      <p className="mono m-0 text-accent">404</p>
      <h1 className="m-0 mt-3 text-[clamp(2rem,5vw,3rem)]">That page is not in the catalogue</h1>
      <p className="m-0 mx-auto mt-3 max-w-md text-muted">
        The link may be stale, or the record may have been renamed. Search the database instead.
      </p>
      <div className="mx-auto mt-8 max-w-md text-left">
        <SearchBox />
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {[
          { label: "Games", to: "/games" },
          { label: "Studios", to: "/studios" },
          { label: "Publishers", to: "/publishers" },
          { label: "Technologies", to: "/technologies" },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded border border-line px-4 py-2 mono text-xs text-text no-underline transition hover:border-accent hover:text-accent"
          >
            {item.label} <Arrow />
          </Link>
        ))}
      </div>
    </div>
  );
}
