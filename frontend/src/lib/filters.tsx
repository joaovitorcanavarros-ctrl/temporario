/* oxlint-disable react/only-export-components -- context + hook live together */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface GlobalFilters {
  ano: string;
  cargo_id: string;
  lotacao_id: string;
  edital_id: string;
  status: string;
  data_inicio: string;
  data_fim: string;
}

export const EMPTY_FILTERS: GlobalFilters = {
  ano: "", cargo_id: "", lotacao_id: "", edital_id: "", status: "", data_inicio: "", data_fim: "",
};

interface Ctx {
  filters: GlobalFilters;
  setFilter: (k: keyof GlobalFilters, v: string) => void;
  reset: () => void;
}

const FiltersCtx = createContext<Ctx | null>(null);
const KEY = "cbmmt.filtros";

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? { ...EMPTY_FILTERS, ...(JSON.parse(raw) as Partial<GlobalFilters>) } : EMPTY_FILTERS;
    } catch {
      return EMPTY_FILTERS;
    }
  });
  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify(filters));
  }, [filters]);
  const setFilter = (k: keyof GlobalFilters, v: string) =>
    setFilters((f) => {
      const n = { ...f, [k]: v };
      if (k === "ano" && v) { n.data_inicio = ""; n.data_fim = ""; }
      if ((k === "data_inicio" || k === "data_fim") && v) n.ano = "";
      return n;
    });
  return (
    <FiltersCtx.Provider value={{ filters, setFilter, reset: () => setFilters(EMPTY_FILTERS) }}>
      {children}
    </FiltersCtx.Provider>
  );
}

export function useFilters(): Ctx {
  const c = useContext(FiltersCtx);
  if (!c) throw new Error("useFilters fora do FiltersProvider");
  return c;
}
