export const PLATFORM_LABELS: Record<string, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  "steam-deck": "Steam Deck",
  "nintendo-switch": "Nintendo Switch",
  "nintendo-switch-2": "Nintendo Switch 2",
  "playstation-4": "PlayStation 4",
  "playstation-5": "PlayStation 5",
  "xbox-one": "Xbox One",
  "xbox-series": "Xbox Series",
  ios: "iOS",
  android: "Android",
  web: "Web",
  "java-virtual-machine": "Java",
};

export const TYPE_LABELS: Record<string, string> = {
  game: "Game",
  dlc: "DLC",
  expansion: "Expansion",
  remaster: "Remaster",
  remake: "Remake",
  port: "Port",
  bundle: "Bundle",
  demo: "Demo",
  other: "Other",
};

export const STATUS_LABELS: Record<string, string> = {
  released: "Released",
  "early-access": "Early access",
  upcoming: "Upcoming",
  cancelled: "Cancelled",
  unknown: "Unreleased",
};

export const ROLE_LABELS: Record<string, string> = {
  developer: "Developer",
  publisher: "Publisher",
  studio: "Studio",
  porting: "Porting",
  support: "Support",
  holding: "Holding company",
  investor: "Investor",
};

export const CATEGORY_LABELS: Record<string, string> = {
  independent: "Independent",
  "independent-large": "Independent, large",
  "independent-publisher": "Independent publisher",
  "acquired-independent": "Acquired independent",
  subsidiary: "Subsidiary",
  "AAA-adjacent": "AAA-adjacent",
  other: "Other",
  excluded: "Excluded",
  unclassified: "Unclassified",

  engine: "Engines",
  middleware: "Middleware",
  language: "Languages",
  tool: "Tools",
  framework: "Frameworks",
  service: "Services",
  technique: "Techniques",
  system: "Systems",
  math: "Mathematics",
  concept: "Concepts",
};

export const SOCIAL_LABELS: Record<string, string> = {
  x: "X",
  twitter: "X",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  discord: "Discord",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  twitch: "Twitch",
  github: "GitHub",
  itch: "itch.io",
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  verified: "Verified",
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  inferred: "Inferred",
};

const SMALL_WORDS = new Set(["a", "an", "and", "of", "the", "for", "in", "on", "to"]);

export function labelize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && SMALL_WORDS.has(word)) return word;
      if (word === "2d") return "2D";
      if (word === "3d") return "3D";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function platformLabel(id: string): string {
  return PLATFORM_LABELS[id] ?? labelize(id);
}

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? labelize(type);
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? labelize(status);
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? labelize(role);
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? labelize(category);
}

export function socialLabel(key: string): string {
  return SOCIAL_LABELS[key] ?? labelize(key);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return `${value.toFixed(1).replace(/\.0$/, "")}%`;
}

export function formatDate(value: string | null | undefined, precision?: string | null): string | null {
  if (!value) return null;

  const [year, month, day] = value.split("-");
  if (!year) return value;

  if (precision === "year" || !month) return year;

  const date = new Date(`${year}-${month}-${day ?? "1"}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    ...(day ? { day: "numeric" } : {}),
    timeZone: "UTC",
  }).format(date);

  return formatted;
}

export function releaseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

export function formatDateTime(value: string | number | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}
