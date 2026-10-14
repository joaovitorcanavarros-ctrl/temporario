import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import FiltersBar from "@/components/FiltersBar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { fmtDate, qs } from "@/lib/format";
import { useFilters } from "@/lib/filters";
import type { Relatorio } from "@/lib/types";
import { cn } from "@/lib/utils";
import { filterParams } from "@/pages/Dashboard";

const TIPOS = [
  { id: "efetivo-cargo", label: "Efetivo ativo por cargo" },
  { id: "efetivo-ubm", label: "Efetivo ativo por UBM" },
  { id: "por-edital", label: "Temporários por edital" },
  { id: "inclusoes", label: "Inclusões por período" },
  { id: "a-vencer", label: "Contratos a vencer" },
  { id: "vencidos", label: "Contratos vencidos pendentes" },
  { id: "desligamentos", label: "Desligamentos por período e motivo" },
  { id: "historico", label: "Histórico individual por matrícula" },
];

const fmtCell = (v: string | number | null) => (v === null || v === undefined ? "—" : typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v) : String(v));

export default function Relatorios() {
  const { filters } = useFilters();
  const [tipo, setTipo] = useState("efetivo-cargo");
  const [matricula, setMatricula] = useState("");
  const params = { ...filterParams(filters), matricula: tipo === "historico" ? matricula.trim() : undefined };
  const enabled = tipo !== "historico" || matricula.trim().length >= 3;
  const q = useQuery({ queryKey: ["relatorio", tipo, params], queryFn: () => apiGet<Relatorio>(`/relatorios/${tipo}${qs(params)}`), enabled, retry: false });
  const r = q.isError ? undefined : q.data;
  const exp = (formato: string) => `/api/relatorios/${tipo}/exportar${qs({ ...params, formato })}`;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Consultas oficiais</p>
        <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="page-title">Relatórios</h2>
        <p className="text-sm text-slate-400">Os relatórios aplicam os mesmos filtros do painel. Exportação em CSV e Excel.</p>
      </div>
      <FiltersBar />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <nav className="space-y-1 rounded-xl border border-[#1E2C42] bg-[#121B28] p-2" data-testid="report-types">
          {TIPOS.map((t) => (
            <button key={t.id} onClick={() => setTipo(t.id)} data-testid={`report-type-${t.id}`}
              className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                tipo === t.id ? "bg-blue-600/15 text-white" : "text-slate-400 hover:bg-[#182335] hover:text-slate-100")}>
              <FileText className="size-4 shrink-0" /> {t.label}
            </button>
          ))}
        </nav>
        <section className="min-w-0 rounded-xl border border-[#1E2C42] bg-[#121B28]" data-testid="report-view">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E2C42] p-4">
            <div className="min-w-0">
              <h3 className="font-heading text-lg font-bold text-white" data-testid="report-title">{r?.titulo ?? TIPOS.find((t) => t.id === tipo)?.label}</h3>
              <p className="text-xs text-slate-400">{r?.descricao}</p>
              {r && <p className="mt-1 text-[11px] text-slate-500">Filtros: {r.filtros} · Gerado em {r.gerado_em} · {r.linhas.length} linha(s)</p>}
            </div>
            <div className="flex gap-2">
              <a href={exp("csv")} className={cn(buttonVariants({ variant: "outline", size: "sm" }), !r && "pointer-events-none opacity-50")} data-testid="report-export-csv"><Download className="size-4" /> CSV</a>
              <a href={exp("xlsx")} className={cn(buttonVariants({ variant: "outline", size: "sm" }), !r && "pointer-events-none opacity-50")} data-testid="report-export-xlsx"><Download className="size-4" /> Excel</a>
            </div>
          </div>
          {tipo === "historico" && (
            <div className="border-b border-[#1E2C42] p-4">
              <Input placeholder="Digite a matrícula (ex.: 352112/02)" value={matricula} onChange={(e) => setMatricula(e.target.value)} className="num max-w-xs" data-testid="report-matricula-input" />
              {q.isError && <p className="mt-2 text-xs text-red-300">Matrícula não encontrada.</p>}
            </div>
          )}
          <div className="max-h-[620px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[#1E2C42] hover:bg-transparent">
                  {(r?.colunas ?? []).map((c) => <TableHead key={c.key} className="sticky top-0 bg-[#0F1724] text-[11px] uppercase tracking-wider text-slate-400">{c.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(r?.linhas ?? []).map((li, i) => (
                  <TableRow key={i} className={cn("border-[#162234]", li[r?.colunas[0]?.key ?? ""] === "TOTAL" && "bg-blue-600/10 font-bold")} data-testid="report-row">
                    {(r?.colunas ?? []).map((c) => <TableCell key={c.key} className={cn("py-2 text-slate-200", typeof li[c.key] === "number" && "num")}>{fmtCell(li[c.key])}</TableCell>)}
                  </TableRow>
                ))}
                {r && r.linhas.length === 0 && <TableRow><TableCell className="py-10 text-center text-slate-500" colSpan={r.colunas.length}>Nenhum registro para os filtros selecionados.</TableCell></TableRow>}
                {!r && <TableRow><TableCell className="py-10 text-center text-slate-500">{q.isLoading ? "Gerando relatório..." : tipo === "historico" ? "Informe a matrícula." : "Relatório indisponível."}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
