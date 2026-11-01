import { useEffect, useMemo, useState } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

export type Route =
  | { name: "home" }
  | { name: "games" }
  | { name: "game"; id: string }
  | { name: "studios" }
  | { name: "publishers" }
  | { name: "company"; id: string; section: "studios" | "publishers" | "company" }
  | { name: "technologies" }
  | { name: "technology"; id: string }
  | { name: "about" }
  | { name: "not-found" };

export function href(path: string): string {
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}` || "/";
}

export function pathFromLocation(pathname: string): string {
  if (BASE && pathname.startsWith(BASE)) {
    return pathname.slice(BASE.length) || "/";
  }
  return pathname;
}

export function parseRoute(pathname: string): Route {
  const segments = pathFromLocation(pathname).split("/").filter(Boolean);
  const [section, id] = segments;

  if (segments.length === 0) return { name: "home" };

  switch (section) {
    case "games":
      return id ? { name: "game", id: decodeURIComponent(id) } : { name: "games" };
    case "studios":
    case "developers":
      return id ? { name: "company", id: decodeURIComponent(id), section: "studios" } : { name: "studios" };
    case "publishers":
      return id ? { name: "company", id: decodeURIComponent(id), section: "publishers" } : { name: "publishers" };
    case "company":
      return id ? { name: "company", id: decodeURIComponent(id), section: "company" } : { name: "not-found" };
    case "technologies":
      return id ? { name: "technology", id: decodeURIComponent(id) } : { name: "technologies" };
    case "about":
      return { name: "about" };
    default:
      return { name: "not-found" };
  }
}

const listeners = new Set<() => void>();

export function navigate(path: string): void {
  const target = href(path);

  if (target === window.location.pathname + window.location.search) {
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }

  window.history.pushState({}, "", target);
  for (const listener of listeners) listener();
  window.scrollTo({ top: 0, behavior: "instant" });
  document.getElementById("main")?.focus({ preventScroll: true });
}

export function useRoute(): Route | null {
  const [pathname, setPathname] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    update();
    window.addEventListener("popstate", update);
    listeners.add(update);

    return () => {
      window.removeEventListener("popstate", update);
      listeners.delete(update);
    };
  }, []);

  return useMemo(() => (pathname === null ? null : parseRoute(pathname)), [pathname]);
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
