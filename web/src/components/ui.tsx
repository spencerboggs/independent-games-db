import type { ReactNode } from "react";

import { href as resolveHref, navigate } from "../lib/router";

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  title?: string;
  "aria-current"?: "page";
}

export function Link({ to, children, className, title, "aria-current": ariaCurrent }: LinkProps) {
  return (
    <a
      href={resolveHref(to)}
      title={title}
      aria-current={ariaCurrent}
      className={className}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function ExternalLink({ href, children, className, title }: ExternalLinkProps) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} title={title}>
      {children}
    </a>
  );
}

export function Chip({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={
        muted
          ? "inline-flex items-center rounded border border-line px-2.5 py-1 text-[0.8rem] text-muted"
          : "inline-flex items-center rounded border border-accent/40 bg-surface/50 px-2.5 py-1 mono text-[0.7rem] text-accent"
      }
    >
      {children}
    </span>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line sm:grid-cols-4">
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="bg-bg-elevated px-4 py-4 sm:px-5">
      <p className="mono m-0 text-[0.66rem] text-accent">{label}</p>
      <p className="m-0 mt-1.5 text-2xl leading-tight">{value}</p>
      {hint ? <p className="m-0 mt-1 text-xs leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}

export function SectionHead({
  index,
  title,
  children,
  action,
}: {
  index?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {index ? <p className="mono m-0 text-accent">{index}</p> : null}
        <h2 className={`m-0 text-[clamp(1.5rem,3vw,2rem)] ${index ? "mt-2" : ""}`}>{title}</h2>
        {children ? <p className="m-0 mt-2 max-w-2xl text-muted">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHead({
  section,
  title,
  children,
  aside,
}: {
  section: string;
  title: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        <p className="mono m-0 text-accent">/{section}</p>
        <h1 className="m-0 mt-2 text-[clamp(1.9rem,5vw,3rem)]">{title}</h1>
        {children ? <p className="m-0 mt-3 max-w-2xl leading-relaxed text-muted">{children}</p> : null}
      </div>
      {aside}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded border border-line bg-bg-elevated/60 ${className}`}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line px-5 py-10 text-center">
      <p className="m-0 text-lg">{title}</p>
      {children ? <p className="m-0 mx-auto mt-2 max-w-md text-muted">{children}</p> : null}
    </div>
  );
}

export function Arrow() {
  return (
    <span aria-hidden="true" className="ml-1 inline-block">
      →
    </span>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mono text-xs text-muted no-underline hover:text-accent">
      ← {children}
    </Link>
  );
}
