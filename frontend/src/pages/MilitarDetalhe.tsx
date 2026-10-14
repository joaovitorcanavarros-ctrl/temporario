import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, RotateCcw, UserMinus } from "lucide-react";
import { DesligamentoDialog, ReativarDialog } from "@/components/MilitarDialogs";
import { AlertaBadge, StatusBadge } from "@/components/StatusBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { isAdmin, podeEditar, useMe } from "@/lib/hooks";
import type { Militar, MilitarHistorico } from "@/lib/types";
import { cn } from "@/lib/utils";

const TIPO_STYLE: Record<string, string> = {
  INCLUSAO: "bg-emerald-500/15 text-emerald-300",
  DESLIGAMENTO: "bg-red-500/15 text-red-300",
  REATIVACAO: "bg-blue-500/15 text-blue-300",
};

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-100">{children}</dd>
    </div>
  );
}

const fmtVal = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? fmtDate(String(v)) : String(v));

export default function MilitarDetalhe() {
  const { id } = useParams();
  const me = useMe();
  const [desl, setDesl] = useState<Militar | null>(null);
  const [reat, setReat] = useState<Militar | null>(null);
  const q = useQuery({ queryKey: ["militar", id], queryFn: () => apiGet<Militar>(`/militares/${id}`) });
  const h = useQuery({ queryKey: ["militar", id, "historico"], queryFn: () => apiGet<MilitarHistorico>(`/militares/${id}/historico`) });
  const m = q.isError ? undefined : q.data;

  return (
    <div className="space-y-5">
      <Link to="/temporarios" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white" data-testid="detail-back-link"><ArrowLeft className="size-4" /> Temporários</Link>
      {q.isError && <p className="text-slate-400" data-testid="detail-error">Registro não encontrado ou indisponível.</p>}
      {m && (
        <section className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5" data-testid="militar-detail">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="num text-sm text-blue-300" data-testid="detail-matricula">{m.matricula}</p>
              <h2 className="font-heading text-2xl font-extrabold text-white" data-testid="detail-nome">{m.nome_completo}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge status={m.status} /><AlertaBadge m={m} /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {podeEditar(me.data) && (
                <Link to={`/temporarios/${m.id}/editar`} className={buttonVariants({ variant: "outline" })} data-testid="detail-edit-button"><Pencil className="size-4" /> Editar</Link>
              )}
              {podeEditar(me.data) && m.status === "ATIVO" && (
                <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => setDesl(m)} data-testid="detail-desligar-button"><UserMinus className="size-4" /> Registrar Desligamento</Button>
              )}
              {isAdmin(me.data) && m.status === "DESLIGADO" && (
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setReat(m)} data-testid="detail-reativar-button"><RotateCcw className="size-4" /> Reativar Cadastro</Button>
              )}
            </div>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Cargo / função">{m.cargo_nome}</Info>
            <Info label="Categoria">{m.categoria_nome}</Info>
            <Info label="Lotação / UBM">{m.lotacao_nome}</Info>
            <Info label="Edital">{m.edital_nome}</Info>
            <Info label="Inclusão"><span className="num">{fmtDate(m.data_inclusao)}</span></Info>
            <Info label="Vencimento do contrato"><span className="num">{fmtDate(m.data_vencimento_contrato)}</span></Info>
            <Info label="DOE — incorporação">{m.doe_incorporacao ?? "—"}</Info>
            <Info label="Última atualização">{fmtDateTime(m.atualizado_em)} · {m.atualizado_por_nome ?? "—"}</Info>
            {m.status === "DESLIGADO" && (
              <>
                <Info label="Data do desligamento"><span className="num text-red-300">{fmtDate(m.data_desligamento)}</span></Info>
                <Info label="Motivo">{m.motivo_desligamento_nome ?? "—"}</Info>
                <Info label="Documento / processo">{m.documento_desligamento ?? "—"}</Info>
              </>
            )}
            <div className="sm:col-span-2 lg:col-span-4"><Info label="Observações"><span className="whitespace-pre-line">{m.observacoes || "—"}</span></Info></div>
          </dl>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5" data-testid="historico-situacao">
          <h3 className="mb-4 font-heading font-bold text-white">Histórico de situação</h3>
          <ol className="space-y-3 border-l border-[#24344D] pl-4">
            {(h.data?.situacao ?? []).map((s) => (
              <li key={s.id} className="relative" data-testid={`situacao-${s.tipo.toLowerCase()}`}>
                <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-blue-500 ring-4 ring-[#121B28]" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", TIPO_STYLE[s.tipo])}>{s.tipo}</span>
                  <span className="num text-sm text-white">{fmtDate(s.data_efetiva)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {[s.motivo_nome, s.documento, s.justificativa, s.observacoes].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-[11px] text-slate-500">{s.usuario_nome} · {fmtDateTime(s.timestamp)}</p>
              </li>
            ))}
            {h.data?.situacao.length === 0 && <li className="text-sm text-slate-500">Sem eventos.</li>}
          </ol>
        </section>
        <section className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5" data-testid="historico-alteracoes">
          <h3 className="mb-4 font-heading font-bold text-white">Registro de alterações</h3>
          <div className="space-y-3">
            {(h.data?.alteracoes ?? []).map((a) => (
              <div key={a.id} className="rounded-lg border border-[#1E2C42] bg-[#0F1724] p-3" data-testid="alteracao-item">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-blue-300">{a.operacao.replace(/_/g, " ")}</span>
                  <span className="text-slate-500">{a.usuario_nome} · {fmtDateTime(a.timestamp)}</span>
                </div>
                <table className="mt-2 w-full text-xs">
                  <tbody>
                    {Object.entries(a.depois ?? {}).filter(([, v]) => a.antes !== null || (v !== null && v !== "")).map(([k, v]) => (
                      <tr key={k} className="border-t border-[#162234]">
                        <td className="py-1 pr-2 text-slate-400">{k}</td>
                        {a.antes !== null && <td className="py-1 pr-2 text-red-300/80 line-through decoration-red-500/40">{fmtVal(a.antes?.[k])}</td>}
                        <td className="py-1 text-emerald-300">{fmtVal(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      </div>
      <DesligamentoDialog militar={desl} onClose={() => setDesl(null)} />
      <ReativarDialog militar={reat} onClose={() => setReat(null)} />
    </div>
  );
}
