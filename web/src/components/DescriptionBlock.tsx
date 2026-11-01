import type { Description } from "../lib/types";
import { ExternalLink } from "./ui";

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function DescriptionBlock({ description }: { description?: Description | null }) {
  const custom = description?.custom?.trim();
  const source = description?.source;

  if (custom) {
    return <p className="m-0 text-[1.02rem] leading-relaxed text-muted">{custom}</p>;
  }

  if (!source?.text) return null;

  return (
    <div>
      <p className="m-0 text-[1.02rem] leading-relaxed text-muted">{source.text}</p>
      <p className="mono m-0 mt-2 text-[0.6rem] text-muted/80">
        {source.source?.type ? `Source · ${source.source.type}` : "Sourced description"}
        {source.source?.url ? (
          <>
            {" · "}
            <ExternalLink href={source.source.url} className="text-accent no-underline hover:text-text">
              {hostname(source.source.url)}
            </ExternalLink>
          </>
        ) : null}
      </p>
    </div>
  );
}
