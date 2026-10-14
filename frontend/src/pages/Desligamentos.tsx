import { useQuery } from "@tanstack/react-query";
import FiltersBar from "@/components/FiltersBar";
import MilitaresTable from "@/components/MilitaresTable";
import { apiGet } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { useFilters } from "@/lib/filters";
import type { SituacaoPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { baseParams } from "@/pages/Dashboard";

export default function Desligamentos() {
  const { filters } = useFilters();
  const ini = filters.data_inicio || (filters.ano ? `${filters.ano}-01-01` : undefined);
  const fim = filters.data_fim || (filters.ano ? `${filters.ano}-12-31` : undefined);
  const ev = useQuery({ queryKey: ["situacao"], queryFn: () => apiGet<SituacaoPage>("/militares/situacao?limit=50") });
  const eventos = (ev.isError ? [] : ev.data?.items ?? []).filter((e) => e.tipo !== "INCLUSAO");
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">Movimentações</p>
        <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="page-title">Desligamentos e Histórico</h2>
        <p className="text-sm text-slate-400">Registros desligados permanecem na base para consulta, relatórios e auditoria. O período filtra pela data efetiva do desligamento.</p>
      </div>
      <FiltersBar hideStatus />
      <MilitaresTable variant="desligados" params={{ ...baseParams(filters), status: "DESLIGADO", deslig_ini: ini, deslig_fim: fim }} testId="desligados-table" />
      <section className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5" data-testid="eventos-recentes">
        <h3 className="mb-3 font-heading font-bold text-white">Últimos desligamentos e reativações registrados</h3>
        <div className="divide-y divide-[#162234]">
          {eventos.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", e.tipo === "DESLIGAMENTO" ? "bg-red-500/15 text-red-300" : "bg-blue-500/15 text-blue-300")}>{e.tipo}</span>
              <Link to={`/temporarios/${e.militar_id}`} className="font-medium text-slate-100 hover:text-blue-300">{e.nome_completo}</Link>
              <span className="num text-xs text-slate-400">{e.matricula}</span>
              <span className="text-xs text-slate-400">Data efetiva {fmtDate(e.data_efetiva)} · {e.motivo_nome ?? e.justificativa ?? ""}</span>
              <span className="ml-auto text-[11px] text-slate-500">{e.usuario_nome} · {fmtDateTime(e.timestamp)}</span>
            </div>
          ))}
          {eventos.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhum desligamento ou reativação registrado até o momento.</p>}
        </div>
      </section>
    </div>
  );
}
