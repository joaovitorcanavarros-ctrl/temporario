import { FilterX } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFilters } from "@/lib/filters";
import { useCatalogos, useMeta } from "@/lib/hooks";

interface Props { hideStatus?: boolean; hideCargo?: boolean }

export default function FiltersBar({ hideStatus, hideCargo }: Props) {
  const { filters, setFilter, reset } = useFilters();
  const cat = useCatalogos();
  const meta = useMeta();
  const anoAtual = Number((meta.data?.data_hoje ?? new Date().toISOString()).slice(0, 4));
  const anos = Array.from({ length: 6 }, (_, i) => String(anoAtual - i));
  const c = cat.data;
  return (
    <div data-testid="filters-bar" className="grid grid-cols-2 gap-2 rounded-xl border border-[#1E2C42] bg-[#121B28] p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
      <FieldSelect testId="filter-ano" value={filters.ano} onChange={(v) => setFilter("ano", v)} allLabel="Todos os anos"
        options={anos.map((a) => ({ value: a, label: a }))} />
      {!hideCargo && (
        <FieldSelect testId="filter-cargo" value={filters.cargo_id} onChange={(v) => setFilter("cargo_id", v)} allLabel="Todos os cargos"
          options={(c?.cargos ?? []).map((x) => ({ value: x.id, label: x.nome }))} />
      )}
      <FieldSelect testId="filter-lotacao" value={filters.lotacao_id} onChange={(v) => setFilter("lotacao_id", v)} allLabel="Todas as lotações"
        options={(c?.lotacoes ?? []).map((x) => ({ value: x.id, label: x.nome }))} />
      <FieldSelect testId="filter-edital" value={filters.edital_id} onChange={(v) => setFilter("edital_id", v)} allLabel="Todos os editais"
        options={(c?.editais ?? []).map((x) => ({ value: x.id, label: x.nome }))} />
      {!hideStatus && (
        <FieldSelect testId="filter-status" value={filters.status} onChange={(v) => setFilter("status", v)} allLabel="Todas as situações"
          options={[{ value: "ATIVO", label: "Ativos" }, { value: "DESLIGADO", label: "Desligados" }]} />
      )}
      <Input type="date" aria-label="Data inicial" data-testid="filter-data-inicio" value={filters.data_inicio}
        onChange={(e) => setFilter("data_inicio", e.target.value)} className="bg-[#0F1724] border-[#24344D] [color-scheme:dark]" />
      <Input type="date" aria-label="Data final" data-testid="filter-data-fim" value={filters.data_fim}
        onChange={(e) => setFilter("data_fim", e.target.value)} className="bg-[#0F1724] border-[#24344D] [color-scheme:dark]" />
      <Button variant="ghost" onClick={reset} data-testid="filter-reset" className="text-slate-400 hover:text-white">
        <FilterX className="size-4" /> Limpar filtros
      </Button>
    </div>
  );
}
