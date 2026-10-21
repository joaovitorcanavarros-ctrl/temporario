import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, History, Pencil, RotateCcw, SquarePen, UserMinus } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import { DesligamentoDialog, QuickEditDialog, ReativarDialog } from "@/components/MilitarDialogs";
import { AlertaBadge, StatusBadge } from "@/components/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { fmtDate, fmtNum, qs } from "@/lib/format";
import { isAdmin, podeEditar, useMe } from "@/lib/hooks";
import type { Militar, MilitarPage } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Params = Record<string, string | number | null | undefined>;

interface Col { key: string; label: string; className?: string; render: (m: Militar) => ReactNode }

const COLS_BASE: Col[] = [
  { key: "matricula", label: "Matrícula", render: (m) => <span className="num text-[13px] text-slate-300">{m.matricula}</span> },
  { key: "nome_completo", label: "Nome completo", render: (m) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link to={`/temporarios/${m.id}`} className="font-medium text-slate-100 hover:text-blue-300" data-testid={`row-name-link-${m.matricula}`}>{m.nome_completo}</Link>
      {m.sub_judice && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300" data-testid="sub-judice-badge">Sub judice</span>}
    </div>
  ) },
  { key: "cargo_nome", label: "Cargo/Função", render: (m) => <span className="text-slate-300">{m.cargo_nome}</span> },
  { key: "lotacao_nome", label: "Lotação/UBM", render: (m) => <span className="text-slate-300">{m.lotacao_nome}</span> },
  { key: "edital_nome", label: "Edital", className: "hidden xl:table-cell", render: (m) => <span className="text-xs text-slate-400">{m.edital_nome}</span> },
  { key: "data_inclusao", label: "Inclusão", render: (m) => <span className="num text-[13px]">{fmtDate(m.data_inclusao)}</span> },
  { key: "data_vencimento_contrato", label: "Vencimento", render: (m) => (
    <div className="flex flex-col items-start gap-1">
      <span className="num text-[13px]">{fmtDate(m.data_vencimento_contrato)}</span>
      <AlertaBadge m={m} />
    </div>
  ) },
];
const COL_STATUS: Col = { key: "status", label: "Situação", render: (m) => <StatusBadge status={m.status} /> };
const COLS_DESLIG: Col[] = [
  { key: "data_desligamento", label: "Desligamento", render: (m) => <span className="num text-[13px] text-red-300">{fmtDate(m.data_desligamento)}</span> },
  { key: "motivo_desligamento_nome", label: "Motivo", render: (m) => <span className="text-slate-300">{m.motivo_desligamento_nome ?? "—"}</span> },
];

interface Props { params: Params; variant?: "geral" | "desligados"; compact?: boolean; testId?: string }

export default function MilitaresTable({ params, variant = "geral", compact, testId = "militares-table" }: Props) {
  const me = useMe();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(compact ? 10 : 25);
  const [sort, setSort] = useState(variant === "desligados" ? "data_desligamento" : "nome_completo");
  const [direction, setDirection] = useState<"asc" | "desc">(variant === "desligados" ? "desc" : "asc");
  const [desligar, setDesligar] = useState<Militar | null>(null);
  const [reativar, setReativar] = useState<Militar | null>(null);
  const [rapido, setRapido] = useState<Militar | null>(null);
  const paramsKey = JSON.stringify(params);
  const [lastKey, setLastKey] = useState(paramsKey);
  if (lastKey !== paramsKey) { setLastKey(paramsKey); setPage(1); }

  const q = useQuery({
    queryKey: ["militares", params, page, pageSize, sort, direction],
    queryFn: () => apiGet<MilitarPage>(`/militares${qs({ ...params, page, page_size: pageSize, sort, direction })}`),
    placeholderData: keepPreviousData,
  });
  const cols = variant === "desligados" ? [...COLS_BASE.slice(0, 4), ...COLS_DESLIG, COL_STATUS] : [...COLS_BASE, COL_STATUS];
  const items = q.isError ? [] : q.data?.items ?? [];
  const total = q.isError ? 0 : q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const editar = podeEditar(me.data);
  const admin = isAdmin(me.data);
  const exportQs = qs({ ...params, sort, direction });

  const toggleSort = (k: string) => {
    if (sort === k) setDirection(direction === "asc" ? "desc" : "asc");
    else { setSort(k); setDirection("asc"); }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[#1E2C42] bg-[#121B28]" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2C42] px-4 py-3">
        <p className="text-sm text-slate-400" data-testid="table-total">
          <span className="num font-semibold text-white">{fmtNum(total)}</span> registro(s) encontrados
        </p>
        <div className="flex gap-2">
          <a href={`/api/militares/exportar${exportQs}${exportQs ? "&" : "?"}formato=csv`} className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="export-csv-button">
            <Download className="size-4" /> CSV
          </a>
          <a href={`/api/militares/exportar${exportQs}${exportQs ? "&" : "?"}formato=xlsx`} className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="export-xlsx-button">
            <Download className="size-4" /> Excel
          </a>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-[#1E2C42] hover:bg-transparent">
            {cols.map((c) => (
              <TableHead key={c.key} className={cn("bg-[#0F1724] text-[11px] uppercase tracking-wider text-slate-400", c.className)}>
                <button className="inline-flex items-center gap-1 hover:text-white" onClick={() => toggleSort(c.key)} data-testid={`sort-${c.key}`}>
                  {c.label}
                  {sort === c.key ? (direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
                </button>
              </TableHead>
            ))}
            <TableHead className="bg-[#0F1724] text-right text-[11px] uppercase tracking-wider text-slate-400">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((m) => (
            <TableRow
              key={m.id}
              data-testid={`militar-row-${m.matricula}`}
              className={cn(
                "border-[#162234] transition-colors hover:bg-[#182335]",
                m.alerta === "A_VENCER" && "bg-amber-500/[0.06] shadow-[inset_3px_0_0_#F59E0B]",
                m.alerta === "VENCIDO" && "bg-red-500/[0.05] shadow-[inset_3px_0_0_#EF4444]",
              )}
            >
              {cols.map((c) => <TableCell key={c.key} className={cn("py-2.5", c.className)}>{c.render(m)}</TableCell>)}
              <TableCell className="py-2.5">
                <div className="flex items-center justify-end gap-1">
                  <Link to={`/temporarios/${m.id}`} title="Histórico" className={buttonVariants({ variant: "ghost", size: "icon-sm" })} data-testid={`action-historico-${m.matricula}`}>
                    <History className="size-4" />
                  </Link>
                  {editar && (
                    <>
                      <Button variant="ghost" size="icon-sm" title="Edição rápida" onClick={() => setRapido(m)} data-testid={`action-quick-edit-${m.matricula}`}>
                        <SquarePen className="size-4" />
                      </Button>
                      <Link to={`/temporarios/${m.id}/editar`} title="Editar cadastro" className={buttonVariants({ variant: "ghost", size: "icon-sm" })} data-testid={`action-edit-${m.matricula}`}>
                        <Pencil className="size-4" />
                      </Link>
                    </>
                  )}
                  {editar && m.status === "ATIVO" && (
                    <Button size="sm" variant="ghost" className="text-red-300 hover:bg-red-500/10 hover:text-red-200" onClick={() => setDesligar(m)} data-testid={`action-desligar-${m.matricula}`}>
                      <UserMinus className="size-4" /> <span className="hidden 2xl:inline">Registrar Desligamento</span>
                    </Button>
                  )}
                  {admin && m.status === "DESLIGADO" && (
                    <Button size="sm" variant="ghost" className="text-emerald-300 hover:bg-emerald-500/10" onClick={() => setReativar(m)} data-testid={`action-reativar-${m.matricula}`}>
                      <RotateCcw className="size-4" /> <span className="hidden 2xl:inline">Reativar</span>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!q.isLoading && items.length === 0 && (
            <TableRow><TableCell colSpan={cols.length + 1} className="py-12 text-center text-slate-500" data-testid="table-empty">
              {q.isError ? "Não foi possível carregar os registros." : "Nenhum registro encontrado com os filtros atuais."}
            </TableCell></TableRow>
          )}
          {q.isLoading && (
            <TableRow><TableCell colSpan={cols.length + 1} className="py-12 text-center text-slate-500">Carregando...</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1E2C42] px-4 py-3 text-sm text-slate-400">
        <div className="flex items-center gap-2">
          <span>Itens por página</span>
          <FieldSelect testId="page-size-select" className="w-20" value={String(pageSize)} onChange={(v) => { setPageSize(Number(v)); setPage(1); }}
            options={["10", "25", "50", "100"].map((v) => ({ value: v, label: v }))} />
        </div>
        <div className="flex items-center gap-2">
          <span data-testid="pagination-info">Página <span className="num text-white">{page}</span> de <span className="num">{pages}</span></span>
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="pagination-prev"><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="pagination-next"><ChevronRight className="size-4" /></Button>
        </div>
      </div>
      <DesligamentoDialog militar={desligar} onClose={() => setDesligar(null)} />
      <ReativarDialog militar={reativar} onClose={() => setReativar(null)} />
      <QuickEditDialog militar={rapido} onClose={() => setRapido(null)} />
    </div>
  );
}
