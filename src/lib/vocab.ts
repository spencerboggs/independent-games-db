/**
 * Controlled vocabularies. Providers report platforms and genres under many
 * spellings; everything is normalized to these stable IDs so consumers can
 * filter reliably. Unknown values are slugified rather than dropped.
 */
import { slugify } from "./ids.ts";

export const PLATFORMS: Record<string, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  "steam-deck": "Steam Deck",
  "nintendo-switch": "Nintendo Switch",
  "nintendo-switch-2": "Nintendo Switch 2",
  "wii-u": "Wii U",
  "nintendo-3ds": "Nintendo 3DS",
  "playstation-3": "PlayStation 3",
  "playstation-4": "PlayStation 4",
  "playstation-5": "PlayStation 5",
  "playstation-vita": "PlayStation Vita",
  "xbox-360": "Xbox 360",
  "xbox-one": "Xbox One",
  "xbox-series": "Xbox Series X|S",
  ios: "iOS",
  android: "Android",
  web: "Web browser",
  stadia: "Stadia",
  "meta-quest": "Meta Quest",
};

const PLATFORM_ALIASES: Record<string, string> = {
  "microsoft windows": "windows",
  pc: "windows",
  "pc microsoft windows": "windows",
  win: "windows",
  mac: "macos",
  "mac os": "macos",
  "mac os x": "macos",
  "os x": "macos",
  "classic mac os": "macos",
  "linux": "linux",
  "switch": "nintendo-switch",
  "nintendo switch": "nintendo-switch",
  "nintendo switch 2": "nintendo-switch-2",
  "wii u": "wii-u",
  "nintendo 3ds": "nintendo-3ds",
  "new nintendo 3ds": "nintendo-3ds",
  "playstation 3": "playstation-3",
  "playstation 4": "playstation-4",
  "playstation 5": "playstation-5",
  "playstation vita": "playstation-vita",
  ps3: "playstation-3",
  ps4: "playstation-4",
  ps5: "playstation-5",
  "xbox 360": "xbox-360",
  "xbox one": "xbox-one",
  "xbox series x s": "xbox-series",
  "xbox series x and series s": "xbox-series",
  "xbox series x": "xbox-series",
  "xbox series": "xbox-series",
  ios: "ios",
  "apple ios": "ios",
  ipados: "ios",
  android: "android",
  "web browser": "web",
  browser: "web",
  html5: "web",
  "google stadia": "stadia",
  stadia: "stadia",
  "meta quest": "meta-quest",
  "oculus quest": "meta-quest",
  "meta quest 2": "meta-quest",
  "meta quest 3": "meta-quest",
  "steamos": "linux",
};

export function normalizePlatform(name: string): string {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return PLATFORM_ALIASES[key] ?? slugify(name);
}

const GENRE_ALIASES: Record<string, string> = {
  "role playing rpg": "rpg",
  "role playing game": "rpg",
  "role playing video game": "rpg",
  "role playing": "rpg",
  rpg: "rpg",
  "action role playing game": "action-rpg",
  "action rpg": "action-rpg",
  "hack and slash beat em up": "hack-and-slash",
  "platform game": "platformer",
  platform: "platformer",
  platformer: "platformer",
  "metroidvania": "metroidvania",
  "roguelike": "roguelike",
  "roguelike video game": "roguelike",
  "roguelite": "roguelite",
  "real time strategy rts": "real-time-strategy",
  "real time strategy": "real-time-strategy",
  "turn based strategy tbs": "turn-based-strategy",
  "turn based strategy": "turn-based-strategy",
  "shooter": "shooter",
  "first person shooter": "first-person-shooter",
  "point and click": "point-and-click",
  "adventure game": "adventure",
  "action game": "action",
  "action adventure game": "action-adventure",
  "puzzle video game": "puzzle",
  "simulation video game": "simulation",
  "strategy video game": "strategy",
  "survival game": "survival",
  "sandbox game": "sandbox",
  "massively multiplayer": "mmo",
  "free to play": "free-to-play",
  "early access": "early-access",
  "indie game": "indie",
  "indie": "indie",
  "deck building game": "deckbuilder",
  "deck building": "deckbuilder",
  "card battle": "card-game",
  "card and board game": "card-game",
};

export function normalizeGenre(name: string): string {
  const key = name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return GENRE_ALIASES[key] ?? slugify(name);
}

/** Steam's store genres that describe business/distribution status, not gameplay. */
export const NON_GAMEPLAY_GENRES = new Set(["early-access", "free-to-play", "indie", "massively-multiplayer"]);

export function normalizeFeature(name: string): string {
  return slugify(name);
}
