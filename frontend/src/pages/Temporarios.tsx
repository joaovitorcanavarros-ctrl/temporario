import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Search, UserPlus } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import FiltersBar from "@/components/FiltersBar";
import MilitaresTable from "@/components/MilitaresTable";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFilters } from "@/lib/filters";
import { podeEditar, useCatalogos, useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { filterParams } from "@/pages/Dashboard";

export default function Temporarios() {
  const { categoria } = useParams();
  const { filters, setFilter } = useFilters();
  const me = useMe();
  const cat = useCatalogos();
  const [q, setQ] = useState("");
  const [venc, setVenc] = useState("");
  const catNome = cat.data?.categorias.find((c) => c.codigo === categoria)?.nome ?? categoria;
  const situacao = filters.status || "TODOS";
  const params = { ...filterParams(filters), categoria, q: q.trim() || undefined, venc };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">{categoria ? "Quadro de efetivo" : "Cadastro geral"}</p>
          <h2 className="font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="page-title">{categoria ? catNome : "Temporários Geral"}</h2>
        </div>
        {podeEditar(me.data) && (
          <Link to="/temporarios/novo" className={cn(buttonVariants(), "bg-blue-600 hover:bg-blue-700")} data-testid="new-militar-button">
            <UserPlus className="size-4" /> Cadastrar temporário
          </Link>
        )}
      </div>
      <FiltersBar hideStatus hideCargo={!!categoria} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por nome ou matrícula" className="bg-[#121B28] pl-9" data-testid="search-input" />
        </div>
        <FieldSelect testId="filter-vencimento" className="lg:w-56" value={venc} onChange={setVenc} allLabel="Todos os vencimentos"
          options={[{ value: "a_vencer", label: `A vencer (${cat.data?.config.alerta_dias ?? 30} dias)` }, { value: "vencidos", label: "Vencidos (pendentes)" }]} />
        <Tabs value={situacao} onValueChange={(v) => setFilter("status", v === "TODOS" ? "" : String(v))}>
          <TabsList>
            <TabsTrigger value="ATIVO" data-testid="view-ativos">Somente ativos</TabsTrigger>
            <TabsTrigger value="DESLIGADO" data-testid="view-desligados">Somente desligados</TabsTrigger>
            <TabsTrigger value="TODOS" data-testid="view-todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <MilitaresTable params={params} variant={situacao === "DESLIGADO" ? "desligados" : "geral"} />
    </div>
  );
}
