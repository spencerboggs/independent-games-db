import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { loadDataset, type LoadSource } from "./dataset";
import { buildSearchIndex, type SearchEntry } from "./search";
import type { AppData, Company, Dataset, Game, Technology } from "./types";

interface DataState {
  status: "loading" | "ready" | "error";
  data: AppData | null;
  source: LoadSource | null;
  error: string | null;
  refreshing: boolean;
}

interface DataValue extends DataState {
  searchIndex: SearchEntry[];
  reload: () => void;
}

const DataContext = createContext<DataValue | null>(null);

function buildIndex(dataset: Dataset): AppData {
  const games = new Map<string, Game>();
  const companies = new Map<string, Company>();
  const technologies = new Map<string, Technology>();

  for (const game of dataset.games) games.set(game.id, game);
  for (const company of dataset.companies) companies.set(company.id, company);
  for (const technology of dataset.technologies) technologies.set(technology.id, technology);

  return {
    ...dataset,
    index: {
      games,
      companies,
      technologies,
    },
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({
    status: "loading",
    data: null,
    source: null,
    error: null,
    refreshing: false,
  });

  const load = useCallback(async (force: boolean) => {
    setState((current) => ({
      ...current,
      status: current.data ? current.status : "loading",
      refreshing: Boolean(current.data),
      error: null,
    }));

    try {
      const result = await loadDataset({ force });
      setState({
        status: "ready",
        data: buildIndex(result.dataset),
        source: result.source,
        error: null,
        refreshing: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The dataset could not be loaded.";
      setState((current) => ({
        status: current.data ? current.status : "error",
        data: current.data,
        source: current.source,
        error: message,
        refreshing: false,
      }));
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const reload = useCallback(() => {
    void load(true);
  }, [load]);

  const searchIndex = useMemo(() => (state.data ? buildSearchIndex(state.data) : []), [state.data]);

  const value = useMemo<DataValue>(() => ({ ...state, searchIndex, reload }), [state, searchIndex, reload]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataState(): DataValue {
  const value = useContext(DataContext);
  if (!value) throw new Error("DataProvider is missing");
  return value;
}

export function useAppData(): AppData {
  const { data } = useDataState();
  if (!data) throw new Error("Dataset is not loaded");
  return data;
}
