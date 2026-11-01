export interface Source {
  type: string;
  url?: string | null;
  retrievedAt?: string | null;
  note?: string | null;
}

export interface SourcedText {
  text: string;
  license?: string | null;
  source?: Source | null;
}

export interface Description {
  source: SourcedText | null;
  custom: string | null;
}

export interface MediaReference {
  url: string;
  type: string;
  source?: string;
  retrievedAt?: string;
  rights?: string;
}

export interface TechnologyReference {
  id: string;
  confidence?: string;
  source?: Source;
}

export interface GameTechnology {
  engines?: TechnologyReference[];
  middleware?: TechnologyReference[];
  languages?: TechnologyReference[];
  tools?: TechnologyReference[];
  techniques?: TechnologyReference[];
}

export interface SteamStatistics {
  reviewCount?: number | null;
  positiveCount?: number | null;
  negativeCount?: number | null;
  positivePercentage?: number | null;
  reviewScoreDescription?: string | null;
  currentPlayers?: number | null;
  retrievedAt?: string | null;
}

export interface ReviewVelocity {
  method?: string;
  reviewsPerDay?: number | null;
  reviewsPerMonth?: number | null;
  windowDays?: number | null;
  recentReviewGrowth?: {
    reviews?: number;
    percent?: number;
    windowDays?: number;
  } | null;
  observations?: number;
}

export interface GameStatistics {
  steam?: SteamStatistics | null;
  reviewVelocity?: ReviewVelocity | null;
}

export interface Game {
  id: string;
  title: string;
  alternateTitles?: string[];
  type: string;
  releaseDate: string | null;
  releaseDatePrecision?: string | null;
  releaseStatus: string;
  developers: string[];
  publishers: string[];
  descriptions: Description;
  genres: string[];
  tags: string[];
  features: string[];
  platforms: string[];
  supportedLanguages: string[];
  externalIds?: Record<string, string>;
  links?: Record<string, string>;
  media?: {
    header?: MediaReference | null;
    capsule?: MediaReference | null;
    background?: MediaReference | null;
    screenshots?: MediaReference[];
  } | null;
  technology: GameTechnology;
  franchise?: { id: string; name: string } | null;
  series?: { id: string; name: string } | null;
  relations?: {
    parentGame?: string | null;
    dlc?: string[];
    remasterOf?: string | null;
    portOf?: string | null;
  } | null;
  statistics?: GameStatistics | null;
  sources?: Source[];
  lastUpdated?: string;
}

export interface CompanyStatistics {
  gameCount?: number;
  developedCount?: number;
  publishedCount?: number;
  totalSteamReviews?: number;
  averagePositivePercentage?: number | null;
  weightedPositivePercentage?: number | null;
  mostReviewedGame?: string | null;
  technologyCount?: number;
  engineCount?: number;
  engines?: string[];
}

export interface JobListing {
  title: string;
  type?: string | null;
  location?: string | null;
  url?: string | null;
  postedAt?: string | null;
}

export interface Company {
  id: string;
  name: string;
  aliases?: string[];
  roles: string[];
  description: Description;
  website: string | null;
  socialLinks?: Record<string, string>;
  emails?: string[];
  jobs?: JobListing[];
  location?: {
    headquarters?: string | null;
    country?: string | null;
    countryName?: string | null;
  } | null;
  founded?: number | null;
  foundedDate?: string | null;
  ownership?: {
    status?: string | null;
    parentCompany?: string | null;
    parentCompanyName?: string | null;
    notes?: string | null;
  } | null;
  externalIds?: Record<string, string>;
  logo?: MediaReference | null;
  classification?: {
    include?: boolean;
    category?: string;
    notes?: string;
  } | null;
  games?: {
    developed?: string[];
    published?: string[];
  } | null;
  statistics?: CompanyStatistics | null;
  sources?: Source[];
  lastUpdated?: string;
}

export interface TechnologyStatistics {
  gameCount?: number;
  companyCount?: number;
  totalSteamReviews?: number;
  mostReviewedGames?: { id: string; title: string; value: number }[];
  mostPlayedGames?: { id: string; title: string; value: number }[];
  gamesByReleaseYear?: Record<string, number>;
}

export interface Technology {
  id: string;
  name: string;
  aliases?: string[];
  category: string;
  subcategory?: string | null;
  developer?: string | null;
  website?: string | null;
  license?: string | null;
  description?: Description | null;
  externalIds?: Record<string, string>;
  games?: string[];
  statistics?: TechnologyStatistics | null;
  sources?: Source[];
  lastUpdated?: string;
}

export interface Manifest {
  name: string;
  description: string;
  datasetVersion: string;
  schemaVersion: string;
  generatedAt: string;
  contentHash: string;
  repository: string;
  license?: {
    code?: string;
    data?: string;
    notes?: string;
  };
  counts: {
    games: number;
    companies: number;
    people: number;
    engines: number;
    technologies: number;
    relationships: number;
  };
}

export interface Dataset {
  manifest: Manifest;
  games: Game[];
  companies: Company[];
  technologies: Technology[];
  checkedAt: number;
}

export interface DataIndex {
  games: Map<string, Game>;
  companies: Map<string, Company>;
  technologies: Map<string, Technology>;
}

export interface AppData extends Dataset {
  index: DataIndex;
}
