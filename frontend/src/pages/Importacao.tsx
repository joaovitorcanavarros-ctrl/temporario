import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Download, FileUp, ListChecks, Table2, Upload } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import { useInvalidateMilitares } from "@/components/MilitarDialogs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiPost } from "@/lib/api";
import { downloadText, errMsg, fmtNum, toCsv } from "@/lib/format";
import { podeEditar, useMe } from "@/lib/hooks";
import type { ImportAnalise, ImportLinha, ImportResultado, ImportValidacao, ImportValidarIn } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, label: "Selecionar arquivo", icon: FileUp },
  { n: 2, label: "Visualizar e mapear", icon: Table2 },
  { n: 3, label: "Validar", icon: ListChecks },
  { n: 4, label: "Confirmar", icon: CheckCircle2 },
];
const ACAO_STYLE: Record<ImportLinha["acao"], string> = {
  INSERIR: "bg-emerald-500/15 text-emerald-300",
  ATUALIZAR: "bg-blue-500/15 text-blue-300",
  IGNORAR: "bg-slate-500/15 text-slate-300",
  REJEITAR: "bg-red-500/15 text-red-300",
};

export default function Importacao() {
  const me = useMe();
  const invalidate = useInvalidateMilitares();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [analise, setAnalise] = useState<ImportAnalise | null>(null);
  const [headerRow, setHeaderRow] = useState("");
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [val, setVal] = useState<ImportValidacao | null>(null);
  const [aprovar, setAprovar] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("TODOS");
  const [res, setRes] = useState<ImportResultado | null>(null);

  const analisar = useMutation({
    mutationFn: (f: { name: string; content: string }) => apiPost<ImportAnalise>("/importacao/analisar", { content: f.content, filename: f.name }),
    onSuccess: (a) => {
      setAnalise(a);
      setMapping(a.mapeamento);
      setHeaderRow(a.linha_cabecalho ? String(a.linha_cabecalho) : "");
      setStep(2);
      if (!a.linha_cabecalho) toast.warning("Cabeçalho não identificado automaticamente. Informe a linha e mapeie as colunas.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const body = (): ImportValidarIn => ({
    content: file?.content ?? "", filename: file?.name ?? "arquivo.csv", linha_cabecalho: Number(headerRow) || 1,
    mapeamento: mapping, aprovar_atualizacoes: Array.from(aprovar),
  });
  const validar = useMutation({
    mutationFn: () => apiPost<ImportValidacao>("/importacao/validar", body()),
    onSuccess: (v) => { setVal(v); setAprovar(new Set()); setStep(3); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const confirmar = useMutation({
    mutationFn: () => apiPost<ImportResultado>("/importacao/confirmar", body()),
    onSuccess: (r) => { setRes(r); setStep(4); invalidate(); toast.success("Importação concluída"); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 8_000_000) { toast.error("Arquivo muito grande (máx. 8 MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      setFile({ name: f.name, content });
      analisar.mutate({ name: f.name, content });
    };
    reader.readAsText(f, "utf-8");
  };

  const baixarRejeitados = () => {
    if (!val) return;
    const rej = val.linhas.filter((l) => l.acao === "REJEITAR");
    const campos = analise?.campos.map((c) => c.key) ?? [];
    const rows = [["Linha", ...(analise?.campos.map((c) => c.label) ?? []), "Erros"], ...rej.map((l) => [l.linha, ...campos.map((c) => l.dados[c] ?? ""), l.erros.join(" | ")])];
    downloadText(`rejeitados_${file?.name ?? "importacao"}.csv`, toCsv(rows));
  };
  const baixarRelatorio = () => {
    if (!val) return;
    const rows = [["Linha", "Matrícula", "Nome", "Ação", "Erros", "Avisos", "Diferenças"],
      ...val.linhas.map((l) => [l.linha, l.matricula, l.nome_completo, l.acao, l.erros.join(" | "), l.avisos.join(" | "), l.diferencas.map((d) => `${d.campo}: ${d.atual ?? "—"} → ${d.novo ?? "—"}`).join(" | ")])];
    downloadText(`relatorio_validacao_${file?.name ?? "importacao"}.csv`, toCsv(rows));
  };

  if (me.data && !podeEditar(me.data))
    return <p className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-8 text-slate-400" data-testid="no-permission">Seu perfil (Consulta) não permite importar dados.</p>;

  const cols = analise ? Math.max(analise.cabecalho.length, ...analise.amostra.map((r) => r.length)) : 0;
  const colOpts = Array.from({ length: cols }, (_, i) => ({ value: String(i), label: `Col. ${i + 1}${analise?.cabecalho[i] ? ` — ${analise.cabecalho[i]}` : ""}` }));
  const linhas = (val?.linhas ?? []).filter((l) => filtro === "TODOS" || l.acao === filtro);
  const nAtualizar = val?.linhas.filter((l) => l.acao === "ATUALIZAR").length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Migração e atualização</p>
        <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="page-title">Importação de Dados</h2>
        <p className="text-sm text-slate-400">CSV em UTF-8 com separador vírgula, ponto e vírgula ou tabulação. Linhas de título antes do cabeçalho são ignoradas. Novos registros entram como ATIVO.</p>
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="import-steps">
        {STEPS.map((s) => (
          <li key={s.n} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
            step === s.n ? "border-blue-500/60 bg-blue-500/10 text-white" : step > s.n ? "border-emerald-500/30 text-emerald-300" : "border-[#1E2C42] text-slate-500")}
            data-testid={`import-step-${s.n}`}>
            <s.icon className="size-4" /> <span className="num text-xs">{s.n}.</span> {s.label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#24344D] bg-[#121B28] p-12 text-center transition-colors hover:border-blue-500/60" data-testid="import-dropzone">
          <Upload className="size-10 text-blue-400" />
          <p className="font-semibold text-white">{analisar.isPending ? "Analisando arquivo..." : "Clique para selecionar o arquivo CSV"}</p>
          <p className="text-xs text-slate-400">Ex.: PLANILHA DE BM TEMPORÁRIOS — AUXILIARES.csv</p>
          <input type="file" accept=".csv,text/csv" className="hidden" data-testid="import-file-input" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}

      {step === 2 && analise && (
        <div className="space-y-4">
          <section className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5">
            <div className="mb-4 flex flex-wrap items-end gap-4 text-sm text-slate-300">
              <p><span className="text-slate-500">Arquivo:</span> {file?.name}</p>
              <p><span className="text-slate-500">Separador:</span> <span className="num">{analise.delimitador === "\t" ? "TAB" : analise.delimitador}</span></p>
              <p><span className="text-slate-500">Linhas no arquivo:</span> <span className="num">{analise.total_linhas}</span></p>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Linha do cabeçalho:</span>
                <Input className="num h-8 w-20" type="number" min={1} value={headerRow} onChange={(e) => setHeaderRow(e.target.value)} data-testid="import-header-row-input" />
              </div>
            </div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Mapeamento de colunas</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {analise.campos.map((c) => (
                <div key={c.key} className="space-y-1">
                  <p className="text-xs text-slate-300">{c.label}{c.obrigatorio && <span className="text-red-400"> *</span>}</p>
                  <FieldSelect testId={`map-${c.key}`} value={mapping[c.key] === null || mapping[c.key] === undefined ? "" : String(mapping[c.key])}
                    onChange={(v) => setMapping({ ...mapping, [c.key]: v === "" ? null : Number(v) })} allLabel="— não importar —" options={colOpts} />
                </div>
              ))}
            </div>
          </section>
          <section className="overflow-x-auto rounded-xl border border-[#1E2C42] bg-[#121B28]" data-testid="import-preview">
            <p className="border-b border-[#1E2C42] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Pré-visualização (primeiras linhas após o cabeçalho)</p>
            <table className="w-full text-xs">
              <thead><tr>{analise.campos.filter((c) => mapping[c.key] !== null && mapping[c.key] !== undefined).map((c) => <th key={c.key} className="whitespace-nowrap bg-[#0F1724] px-3 py-2 text-left text-slate-400">{c.label}</th>)}</tr></thead>
              <tbody>
                {analise.amostra.map((r, i) => (
                  <tr key={i} className="border-t border-[#162234]">
                    {analise.campos.filter((c) => mapping[c.key] !== null && mapping[c.key] !== undefined).map((c) => (
                      <td key={c.key} className="whitespace-nowrap px-3 py-1.5 text-slate-300">{r[mapping[c.key] as number] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} data-testid="import-back-1">Voltar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" disabled={validar.isPending || !headerRow} onClick={() => validar.mutate()} data-testid="import-validate-button">
              {validar.isPending ? "Validando..." : "Validar dados"}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && val && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="import-summary">
            {([["inserir", "Serão inseridos", "text-emerald-300"], ["atualizar", "Possíveis atualizações", "text-blue-300"], ["ignorar", "Ignorados", "text-slate-300"], ["rejeitar", "Rejeitados", "text-red-300"]] as const).map(([k, l, c]) => (
              <div key={k} className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-4" data-testid={`import-count-${k}`}>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">{l}</p>
                <p className={cn("num mt-1 text-3xl font-bold", c)}>{fmtNum(val.resumo[k])}</p>
              </div>
            ))}
          </div>
          {(val.novos_cargos.length > 0 || val.novas_lotacoes.length > 0 || val.novos_editais.length > 0) && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200" data-testid="import-new-catalogs">
              <p className="font-semibold">Itens ainda não cadastrados que serão criados automaticamente:</p>
              {val.novos_cargos.length > 0 && <p className="mt-1 text-xs">Cargos: {val.novos_cargos.join("; ")}</p>}
              {val.novas_lotacoes.length > 0 && <p className="mt-1 text-xs">Lotações: {val.novas_lotacoes.join("; ")}</p>}
              {val.novos_editais.length > 0 && <p className="mt-1 text-xs">Editais: {val.novos_editais.join("; ")}</p>}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs value={filtro} onValueChange={(v) => setFiltro(String(v))}>
              <TabsList>
                {["TODOS", "INSERIR", "ATUALIZAR", "IGNORAR", "REJEITAR"].map((t) => <TabsTrigger key={t} value={t} data-testid={`import-filter-${t.toLowerCase()}`}>{t === "TODOS" ? "Todos" : t.charAt(0) + t.slice(1).toLowerCase()}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={baixarRelatorio} data-testid="import-download-report"><Download className="size-4" /> Relatório de validação</Button>
              <Button variant="outline" size="sm" onClick={baixarRejeitados} disabled={!val.resumo.rejeitar} data-testid="import-download-rejected"><Download className="size-4" /> Baixar rejeitados</Button>
            </div>
          </div>
          {nAtualizar > 0 && (
            <p className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-2 text-sm text-blue-200" data-testid="import-update-hint">
              {nAtualizar} matrícula(s) já cadastrada(s) com dados diferentes. Marque as atualizações aprovadas — as não marcadas serão ignoradas.
              <button className="ml-2 font-semibold underline" onClick={() => setAprovar(new Set(val.linhas.filter((l) => l.acao === "ATUALIZAR").map((l) => l.matricula)))} data-testid="import-approve-all">Aprovar todas</button>
            </p>
          )}
          <div className="max-h-[520px] overflow-auto rounded-xl border border-[#1E2C42] bg-[#121B28]" data-testid="import-lines">
            <table className="w-full text-xs">
              <thead className="sticky top-0"><tr className="bg-[#0F1724] text-left text-slate-400">
                <th className="px-3 py-2">Linha</th><th className="px-3 py-2">Matrícula</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Ação</th><th className="px-3 py-2">Detalhes</th>
              </tr></thead>
              <tbody>
                {linhas.slice(0, 500).map((l) => (
                  <tr key={l.linha} className="border-t border-[#162234] align-top" data-testid={`import-line-${l.linha}`}>
                    <td className="num px-3 py-2 text-slate-500">{l.linha}</td>
                    <td className="num px-3 py-2 text-slate-300">{l.matricula || "—"}</td>
                    <td className="px-3 py-2 text-slate-200">{l.nome_completo || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {l.acao === "ATUALIZAR" && (
                          <Checkbox checked={aprovar.has(l.matricula)} data-testid={`import-approve-${l.linha}`}
                            onCheckedChange={(c) => { const n = new Set(aprovar); if (c) n.add(l.matricula); else n.delete(l.matricula); setAprovar(n); }} />
                        )}
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", ACAO_STYLE[l.acao])}>{l.acao}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {l.erros.map((e) => <p key={e} className="text-red-300">• {e}</p>)}
                      {l.diferencas.map((d) => <p key={d.campo} className="text-blue-200">{d.campo}: <span className="text-slate-400 line-through">{d.atual ?? "—"}</span> → {d.novo}</p>)}
                      {l.avisos.map((a) => <p key={a} className="text-amber-300/80">{a}</p>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)} data-testid="import-back-2">Voltar ao mapeamento</Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={confirmar.isPending || val.resumo.inserir + aprovar.size === 0} onClick={() => confirmar.mutate()} data-testid="import-confirm-button">
              {confirmar.isPending ? "Importando..." : `Confirmar importação (${val.resumo.inserir} inclusões, ${aprovar.size} atualizações)`}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && res && (
        <section className="space-y-4 rounded-xl border border-emerald-500/30 bg-[#121B28] p-6" data-testid="import-result">
          <h3 className="flex items-center gap-2 font-heading text-lg font-bold text-white"><CheckCircle2 className="size-5 text-emerald-400" /> Importação concluída</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([["inseridos", "Inseridos"], ["atualizados", "Atualizados"], ["ignorados", "Ignorados"], ["rejeitados", "Rejeitados"]] as const).map(([k, l]) => (
              <div key={k} className="rounded-lg border border-[#1E2C42] p-3" data-testid={`import-result-${k}`}>
                <p className="text-[11px] uppercase text-slate-400">{l}</p><p className="num text-2xl font-bold text-white">{res[k]}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setStep(1); setFile(null); setVal(null); setRes(null); }} data-testid="import-new-button">Nova importação</Button>
            {val && val.resumo.rejeitar > 0 && <Button variant="outline" onClick={baixarRejeitados}><Download className="size-4" /> Baixar rejeitados</Button>}
            <Link to="/temporarios" className="inline-flex items-center rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700" data-testid="import-go-table">Ver temporários</Link>
          </div>
        </section>
      )}
    </div>
  );
}
