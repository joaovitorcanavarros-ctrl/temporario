import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Activity, AlertTriangle, Briefcase, Building2, Clock, HeartPulse, Shield, Stethoscope, Truck, UserCheck, UserMinus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import DrillSheet, { type Drill } from "@/components/DrillSheet";
import FiltersBar from "@/components/FiltersBar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet } from "@/lib/api";
import { fmtDate, fmtNum, qs } from "@/lib/format";
import { useFilters, type GlobalFilters } from "@/lib/filters";
import type { ChartRow, Dashboard as D } from "@/lib/types";
import { cn } from "@/lib/utils";

export const CAT_COLOR: Record<string, string> = {
  AUXILIAR: "#3B82F6", CONDUTOR: "#818CF8", TEC_ENFERMAGEM: "#14B8A6", ENFERMEIRO: "#22D3EE", MEDICO: "#A78BFA", OUTROS: "#94A3B8",
};
const PALETTE = ["#EF4444", "#F59E0B", "#3B82F6", "#10B981", "#A78BFA", "#22D3EE", "#F472B6", "#94A3B8"];
const catColor = (c: string, i: number) => CAT_COLOR[c] ?? PALETTE[i % PALETTE.length];

const tooltipStyle = {
  contentStyle: { background: "#182335", border: "1px solid #24344D", borderRadius: 8, fontSize: 12, color: "#F1F5F9" },
  labelStyle: { color: "#F1F5F9", fontWeight: 600 },
  itemStyle: { color: "#CBD5E1" },
  cursor: { fill: "rgba(59,130,246,0.08)" },
};
const axis = { stroke: "#64748B", fontSize: 11, tickLine: false, axisLine: false } as const;

export function baseParams(f: GlobalFilters) {
  return { cargo_id: f.cargo_id, lotacao_id: f.lotacao_id, edital_id: f.edital_id, status: f.status };
}
export function filterParams(f: GlobalFilters) {
  return { ...baseParams(f), ano: f.ano, data_inicio: f.data_inicio, data_fim: f.data_fim };
}

function Kpi({ id, label, value, sub, icon: Icon, tone, onClick }: {
  id: string; label: string; value: ReactNode; sub?: ReactNode; icon: LucideIcon; tone: "green" | "red" | "blue" | "amber" | "sky"; onClick?: () => void;
}) {
  const tones = {
    green: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
    red: "text-red-400 bg-red-500/10 ring-red-500/20",
    blue: "text-blue-400 bg-blue-500/10 ring-blue-500/20",
    amber: "text-amber-400 bg-amber-500/10 ring-amber-500/20",
    sky: "text-sky-300 bg-sky-500/10 ring-sky-500/20",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`kpi-${id}`}
      className="group animate-rise rounded-xl border border-[#1E2C42] bg-[#121B28] p-4 text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-[#2E4262] hover:shadow-lg hover:shadow-black/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <span className={cn("grid size-8 place-items-center rounded-lg ring-1", tones[tone])}><Icon className="size-4" /></span>
      </div>
      <p className="num mt-2 text-3xl font-bold text-white" data-testid={`kpi-${id}-value`}>{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-slate-400">{sub}</p>}
    </button>
  );
}

function ChartCard({ id, title, desc, children, action, className }: { id: string; title: string; desc?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn("animate-rise rounded-xl border border-[#1E2C42] bg-[#121B28] p-4 sm:p-5", className)} data-testid={`chart-${id}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-heading text-[15px] font-bold text-white">{title}</h3>
          {desc && <p className="mt-0.5 text-xs text-slate-400">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text = "Sem registros para os filtros selecionados" }: { text?: string }) {
  return <div className="grid h-[260px] place-items-center text-sm text-slate-500">{text}</div>;
}

export default function Dashboard() {
  const { filters } = useFilters();
  const [drill, setDrill] = useState<Drill | null>(null);
  const [desligView, setDesligView] = useState("ano");
  const [evoView, setEvoView] = useState("mensal");
  const [distView, setDistView] = useState("cargo");
  const [ubmAll, setUbmAll] = useState(false);
  const fp = filterParams(filters);
  const q = useQuery({ queryKey: ["dashboard", fp], queryFn: () => apiGet<D>(`/dashboard${qs(fp)}`) });
  const d = q.isError ? undefined : q.data;
  const base = baseParams(filters);
  const ref = d?.data_referencia;
  const periodoTxt = d?.periodo_inicio || d?.periodo_fim ? `${fmtDate(d?.periodo_inicio)} a ${fmtDate(d?.periodo_fim)}` : "todo o período";
  const deslParams = { ...base, deslig_ini: d?.periodo_inicio, deslig_fim: d?.periodo_fim, status: "DESLIGADO" };
  const cats = d?.categorias ?? [];
  const motivoNome = (k: string) => d?.motivos.find((m) => m.chave === k)?.nome ?? "Não informado";
  const motivoKeys = Array.from(new Set((d?.deslig_por_ano ?? []).flatMap((r) => Object.keys(r).filter((k) => !["ano", "total"].includes(k)))));
  const v = (n: number | undefined) => (d ? fmtNum(n ?? 0) : "—");
  const ubm = (d?.por_ubm ?? []).slice(0, ubmAll ? undefined : 12);

  const CAT_ICON: Record<string, LucideIcon> = { AUXILIAR: Shield, CONDUTOR: Truck, TEC_ENFERMAGEM: Activity, ENFERMEIRO: HeartPulse, MEDICO: Stethoscope };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Visão geral</p>
          <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl">Painel do efetivo temporário</h2>
          <p className="mt-1 text-sm text-slate-400" data-testid="dashboard-criteria">
            Efetivo em <span className="num text-slate-200">{fmtDate(ref)}</span> · Movimentações: {periodoTxt} · Alerta de vencimento: {d?.alerta_dias ?? "—"} dias (fuso America/Cuiabá)
          </p>
        </div>
      </div>
      <FiltersBar />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi id="ativos" label="Temporários ativos" value={v(d?.kpis.ativos)} icon={UserCheck} tone="green" sub={`Efetivo em ${fmtDate(ref)}`}
          onClick={() => setDrill({ title: "Temporários ativos", params: { ...base, ativo_em: ref } })} />
        <Kpi id="desligamentos" label="Distratos / desligamentos" value={v(d?.kpis.desligamentos_periodo)} icon={UserMinus} tone="red" sub={periodoTxt}
          onClick={() => setDrill({ title: "Desligamentos no período", params: deslParams, variant: "desligados" })} />
        <Kpi id="top-ubm" label="Efetivo por UBM (maior)" value={d ? fmtNum(d.kpis.top_ubm_total) : "—"} icon={Building2} tone="blue" sub={d?.kpis.top_ubm_nome ?? "—"}
          onClick={() => d?.kpis.top_ubm_id && setDrill({ title: d.kpis.top_ubm_nome ?? "UBM", params: { ...base, lotacao_id: d.kpis.top_ubm_id, ativo_em: ref } })} />
        <Kpi id="contratos-a-vencer" label="Contratos a vencer" value={v(d?.kpis.a_vencer)} icon={Clock} tone="amber" sub={`Próximos ${d?.alerta_dias ?? "—"} dias`}
          onClick={() => setDrill({ title: "Contratos a vencer", params: { ...base, venc: "a_vencer" } })} />
        <Kpi id="contratos-vencidos" label="Contratos vencidos" value={v(d?.kpis.vencidos)} icon={AlertTriangle} tone="red" sub="Ativos com vínculo vencido — conferir"
          onClick={() => setDrill({ title: "Contratos vencidos pendentes de conferência", params: { ...base, venc: "vencidos" } })} />
        {(cats.length ? cats.filter((c) => c.chave !== "OUTROS" || c.total > 0) : []).map((c) => (
          <Kpi key={c.chave} id={c.chave.toLowerCase().replace(/_/g, "-")} label={c.nome} value={fmtNum(c.total)} icon={CAT_ICON[c.chave] ?? Briefcase} tone="sky" sub="Ativos no cargo"
            onClick={() => setDrill({ title: `${c.nome} — ativos`, params: { ...base, categoria: c.chave, ativo_em: ref } })} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard id="efetivo-cargo-ano" title="Efetivo por cargo/função" desc="Estoque ao fim de cada ano (ano corrente: data de referência). Clique para listar.">
          {d && d.efetivo_cargo_ano.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.efetivo_cargo_ano}>
                <CartesianGrid stroke="#1E2C42" vertical={false} />
                <XAxis dataKey="ano" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {cats.map((c, i) => (
                  <Bar key={c.chave} dataKey={c.chave} name={c.nome} fill={catColor(c.chave, i)} radius={[3, 3, 0, 0]} className="cursor-pointer"
                    onClick={(e: { payload?: ChartRow }) => {
                      const row = e.payload;
                      if (row) setDrill({ title: `${c.nome} — efetivo em ${fmtDate(String(row.data))}`, params: { ...base, categoria: c.chave, ativo_em: String(row.data) } });
                    }} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>

        <ChartCard id="desligamentos" title="Desligamentos por cargo, ano e motivo" desc={`Data efetiva do desligamento · ${periodoTxt}`}
          action={
            <Tabs value={desligView} onValueChange={(x) => setDesligView(String(x))}>
              <TabsList><TabsTrigger value="ano" data-testid="desligamentos-tab-ano">Por ano</TabsTrigger><TabsTrigger value="cargo" data-testid="desligamentos-tab-cargo">Por cargo</TabsTrigger></TabsList>
            </Tabs>
          }>
          {d && d.deslig_por_ano.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={desligView === "ano" ? d.deslig_por_ano : d.deslig_por_cargo}>
                <CartesianGrid stroke="#1E2C42" vertical={false} />
                <XAxis dataKey={desligView === "ano" ? "ano" : "nome"} {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {motivoKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} stackId="m" name={motivoNome(k)} fill={PALETTE[i % PALETTE.length]} className="cursor-pointer"
                    onClick={(e: { payload?: ChartRow }) => {
                      const row = e.payload;
                      if (!row) return;
                      const extra = desligView === "ano"
                        ? { deslig_ini: `${row.ano}-01-01`, deslig_fim: `${row.ano}-12-31` }
                        : { categoria: String(row.categoria), deslig_ini: d.periodo_inicio, deslig_fim: d.periodo_fim };
                      setDrill({ title: `Desligamentos — ${motivoNome(k)} — ${row.ano ?? row.nome}`, params: { ...base, status: "DESLIGADO", motivo_id: k, ...extra }, variant: "desligados" });
                    }} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty text="Nenhum desligamento registrado no período" />}
        </ChartCard>

        <ChartCard id="efetivo-ubm" title="Efetivo de temporários por UBM" desc={`Ativos em ${fmtDate(ref)} · ${d?.por_ubm.length ?? 0} lotações`}
          action={d && d.por_ubm.length > 12 ? (
            <button className="text-xs font-semibold text-blue-400 hover:text-blue-300" onClick={() => setUbmAll(!ubmAll)} data-testid="ubm-toggle-all">
              {ubmAll ? "Mostrar 12 maiores" : "Mostrar todas"}
            </button>
          ) : undefined}>
          {ubm.length ? (
            <div className={cn(ubmAll && "max-h-[560px] overflow-y-auto pr-1")}>
              <ResponsiveContainer width="100%" height={Math.max(280, ubm.length * 26)}>
                <BarChart data={ubm} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid stroke="#1E2C42" horizontal={false} />
                  <XAxis type="number" {...axis} allowDecimals={false} />
                  <YAxis type="category" dataKey="nome" width={190} {...axis} tick={{ fill: "#CBD5E1", fontSize: 10 }} interval={0} />
                  <Tooltip {...tooltipStyle} formatter={(x: number) => [fmtNum(x), "Ativos"]} />
                  <Bar dataKey="total" fill="#3B82F6" radius={[0, 4, 4, 0]} className="cursor-pointer"
                    onClick={(e: { payload?: { chave: string; nome: string } }) => {
                      const p = e.payload;
                      if (p) setDrill({ title: `${p.nome} — ativos`, params: { ...base, lotacao_id: p.chave, ativo_em: ref } });
                    }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty />}
        </ChartCard>

        <ChartCard id="evolucao" title="Evolução do efetivo" desc="Inclusões e desligamentos por data do evento; efetivo ao fim de cada mês/ano."
          action={
            <Tabs value={evoView} onValueChange={(x) => setEvoView(String(x))}>
              <TabsList><TabsTrigger value="mensal" data-testid="evolucao-tab-mensal">Mensal</TabsTrigger><TabsTrigger value="anual" data-testid="evolucao-tab-anual">Anual</TabsTrigger></TabsList>
            </Tabs>
          }>
          {d && d.evolucao_mensal.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={evoView === "mensal" ? d.evolucao_mensal : d.evolucao_anual}>
                <CartesianGrid stroke="#1E2C42" vertical={false} />
                <XAxis dataKey={evoView === "mensal" ? "rotulo" : "ano"} {...axis} />
                <YAxis yAxisId="l" {...axis} allowDecimals={false} />
                <YAxis yAxisId="r" orientation="right" {...axis} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="inclusoes" name="Inclusões" fill="#10B981" radius={[3, 3, 0, 0]} className="cursor-pointer"
                  onClick={(e: { payload?: ChartRow }) => {
                    const r = e.payload;
                    if (!r) return;
                    const [ini, fim] = evoView === "mensal" ? [`${r.mes}-01`, `${r.mes}-31`] : [`${r.ano}-01-01`, `${r.ano}-12-31`];
                    setDrill({ title: `Inclusões — ${r.rotulo ?? r.ano}`, params: { ...base, inclusao_ini: ini, inclusao_fim: fim } });
                  }} />
                <Bar yAxisId="l" dataKey="desligamentos" name="Desligamentos" fill="#EF4444" radius={[3, 3, 0, 0]} className="cursor-pointer"
                  onClick={(e: { payload?: ChartRow }) => {
                    const r = e.payload;
                    if (!r) return;
                    const [ini, fim] = evoView === "mensal" ? [`${r.mes}-01`, `${r.mes}-31`] : [`${r.ano}-01-01`, `${r.ano}-12-31`];
                    setDrill({ title: `Desligamentos — ${r.rotulo ?? r.ano}`, params: { ...base, deslig_ini: ini, deslig_fim: fim }, variant: "desligados" });
                  }} />
                <Line yAxisId="r" type="monotone" dataKey="efetivo" name="Efetivo" stroke="#60A5FA" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>

        <ChartCard id="distribuicao" title="Distribuição dos quadros e cargos" desc={`Efetivo em ${fmtDate(ref)} — use os filtros de período para consultar datas anteriores`}
          action={
            <Tabs value={distView} onValueChange={(x) => setDistView(String(x))}>
              <TabsList><TabsTrigger value="cargo" data-testid="distribuicao-tab-cargo">Por cargo</TabsTrigger><TabsTrigger value="edital" data-testid="distribuicao-tab-edital">Por edital</TabsTrigger></TabsList>
            </Tabs>
          }>
          {d && (distView === "cargo" ? d.dist_categoria : d.dist_edital).length ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={distView === "cargo" ? d.dist_categoria : d.dist_edital} dataKey="total" nameKey="nome" innerRadius={60} outerRadius={100} paddingAngle={2} stroke="#121B28" className="cursor-pointer"
                  onClick={(e: { payload?: { chave: string; nome: string } }) => {
                    const p = e.payload;
                    if (!p) return;
                    setDrill({ title: `${p.nome} — ativos`, params: { ...base, ...(distView === "cargo" ? { categoria: p.chave } : { edital_id: p.chave }), ativo_em: ref } });
                  }}>
                  {(distView === "cargo" ? d.dist_categoria : d.dist_edital).map((x, i) => (
                    <Cell key={x.chave} fill={distView === "cargo" ? catColor(x.chave, i) : PALETTE[(i + 2) % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(x: number) => [fmtNum(x), "Ativos"]} />
                <Legend wrapperStyle={{ fontSize: 11 }} layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>

        <ChartCard id="faixas-vencimento" title="Contratos a vencer por intervalo de dias" desc={`Somente cadastros ativos, relativo a ${fmtDate(d?.data_hoje)}. A data final não desliga automaticamente.`}>
          {d ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={d.faixas_vencimento} margin={{ top: 8 }}>
                <defs>
                  <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4} /><stop offset="100%" stopColor="#F59E0B" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="#1E2C42" vertical={false} />
                <XAxis dataKey="faixa" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip {...tooltipStyle} formatter={(x: number) => [fmtNum(x), "Contratos"]} />
                <Area type="monotone" dataKey="total" stroke="#F59E0B" fill="url(#gv)" strokeWidth={2}
                  activeDot={{ r: 6, className: "cursor-pointer", onClick: (_: unknown, ev: unknown) => {
                    const idx = (ev as { index?: number }).index;
                    const f = idx !== undefined ? d.faixas_vencimento[idx] : undefined;
                    if (f) setDrill({ title: `Contratos — ${f.faixa}`, params: { ...base, status: "ATIVO", venc_min_dias: f.min, venc_max_dias: f.max } });
                  } }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty />}
          {d && (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {d.faixas_vencimento.map((f, i) => (
                <button key={f.faixa} data-testid={`faixa-${i}`}
                  onClick={() => setDrill({ title: `Contratos — ${f.faixa}`, params: { ...base, status: "ATIVO", venc_min_dias: f.min, venc_max_dias: f.max } })}
                  className={cn("rounded-lg border px-2 py-1.5 text-left transition-colors hover:bg-[#182335]", i === 0 ? "border-red-500/30" : i === 1 ? "border-amber-500/30" : "border-[#1E2C42]")}>
                  <p className="text-[10px] text-slate-400">{f.faixa}</p>
                  <p className={cn("num text-lg font-bold", i === 0 ? "text-red-300" : i === 1 ? "text-amber-300" : "text-white")}>{fmtNum(f.total)}</p>
                </button>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
      <DrillSheet drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}
