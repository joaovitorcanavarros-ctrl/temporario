import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Eraser, Save, SaveAll } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import { useInvalidateMilitares } from "@/components/MilitarDialogs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg, qs } from "@/lib/format";
import { podeEditar, useCatalogos, useMe, useMeta } from "@/lib/hooks";
import type { MatriculaCheck, Militar, MilitarIn } from "@/lib/types";

const schema = z
  .object({
    matricula: z.string().trim().min(3, "Informe a matrícula/vínculo").max(30).regex(/^[0-9A-Za-z./\- ]+$/, "Use apenas números, letras, ponto, barra ou hífen"),
    nome_completo: z.string().trim().min(3, "Informe o nome completo").max(160),
    cargo_id: z.string().min(1, "Selecione o cargo/função"),
    lotacao_id: z.string().min(1, "Selecione a lotação/UBM"),
    edital_id: z.string().min(1, "Selecione o edital/processo seletivo"),
    data_inclusao: z.string().min(1, "Informe a data de inclusão"),
    data_vencimento_contrato: z.string().min(1, "Informe a data de vencimento"),
    status: z.enum(["ATIVO", "DESLIGADO"]),
    doe_incorporacao: z.string().max(300).optional(),
    sub_judice: z.enum(["SIM", "NAO"]),
    observacoes: z.string().max(2000).optional(),
    data_desligamento: z.string().optional(),
    motivo_desligamento_id: z.string().optional(),
    documento_desligamento: z.string().max(120).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.data_inclusao && v.data_vencimento_contrato && v.data_vencimento_contrato < v.data_inclusao)
      ctx.addIssue({ code: "custom", path: ["data_vencimento_contrato"], message: "Vencimento anterior à data de inclusão" });
    if (v.status === "DESLIGADO") {
      if (!v.data_desligamento) ctx.addIssue({ code: "custom", path: ["data_desligamento"], message: "Informe a data do desligamento" });
      if (!v.motivo_desligamento_id) ctx.addIssue({ code: "custom", path: ["motivo_desligamento_id"], message: "Selecione o motivo" });
      if (v.data_desligamento && v.data_inclusao && v.data_desligamento < v.data_inclusao)
        ctx.addIssue({ code: "custom", path: ["data_desligamento"], message: "Anterior à data de inclusão" });
    }
  });
type F = z.infer<typeof schema>;

const EMPTY: F = {
  matricula: "", nome_completo: "", cargo_id: "", lotacao_id: "", edital_id: "", data_inclusao: "", data_vencimento_contrato: "",
  status: "ATIVO", doe_incorporacao: "", sub_judice: "NAO", observacoes: "", data_desligamento: "", motivo_desligamento_id: "", documento_desligamento: "",
};

function Field({ label, error, children, req, className }: { label: string; error?: string; children: ReactNode; req?: boolean; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-slate-300">{label}{req && <span className="text-red-400"> *</span>}</Label>
      {children}
      {error && <p className="text-xs text-red-400" data-testid="field-error">{error}</p>}
    </div>
  );
}

export default function MilitarForm() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const me = useMe();
  const cat = useCatalogos();
  const meta = useMeta();
  const invalidate = useInvalidateMilitares();
  const [dup, setDup] = useState<{ id: string; msg: string } | null>(null);
  const atual = useQuery({ queryKey: ["militar", id], queryFn: () => apiGet<Militar>(`/militares/${id}`), enabled: editing });
  const form = useForm<F>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const status = useWatch({ control: form.control, name: "status" });
  const hoje = meta.data?.data_hoje ?? "";

  useEffect(() => {
    const m = atual.data;
    if (m)
      form.reset({
        matricula: m.matricula, nome_completo: m.nome_completo, cargo_id: m.cargo_id, lotacao_id: m.lotacao_id, edital_id: m.edital_id,
        data_inclusao: m.data_inclusao, data_vencimento_contrato: m.data_vencimento_contrato, status: m.status,
        doe_incorporacao: m.doe_incorporacao ?? "", sub_judice: m.sub_judice ? "SIM" : "NAO", observacoes: m.observacoes ?? "", data_desligamento: m.data_desligamento ?? "",
        motivo_desligamento_id: m.motivo_desligamento_id ?? "", documento_desligamento: m.documento_desligamento ?? "",
      });
  }, [atual.data, form]);

  const checkMatricula = async () => {
    const mat = form.getValues("matricula").trim();
    if (mat.length < 3) return;
    try {
      const r = await apiGet<MatriculaCheck>(`/militares/verificar-matricula${qs({ matricula: mat, excluir_id: id })}`);
      setDup(r.existe && r.militar_id ? { id: r.militar_id, msg: `A matrícula ${mat.toUpperCase()} já está cadastrada para ${r.nome_completo}.` } : null);
    } catch {
      setDup(null);
    }
  };

  const mut = useMutation({
    mutationFn: ({ body }: { body: MilitarIn; outro: boolean }) =>
      editing ? apiPut<Militar>(`/militares/${id}`, body) : apiPost<Militar>("/militares", body),
    onSuccess: (m, { outro }) => {
      invalidate();
      toast.success(editing ? "Alterações salvas e registradas no histórico" : `Cadastro salvo: ${m.nome_completo}`);
      if (outro) { form.reset(EMPTY); setDup(null); window.scrollTo({ top: 0 }); }
      else nav(`/temporarios/${m.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        const d = (e.body as { detail?: { message?: string; militar_id?: string } })?.detail;
        if (d?.militar_id) setDup({ id: d.militar_id, msg: d.message ?? "Matrícula já cadastrada" });
      }
      toast.error(errMsg(e));
    },
  });

  const submit = (outro: boolean) =>
    form.handleSubmit((v) => {
      if (v.status === "DESLIGADO" && hoje && v.data_desligamento && v.data_desligamento > hoje) {
        form.setError("data_desligamento", { message: "A data não pode ser futura" });
        return;
      }
      const body: MilitarIn = {
        ...v,
        doe_incorporacao: v.doe_incorporacao || null, observacoes: v.observacoes || null, sub_judice: v.sub_judice === "SIM",
        data_desligamento: v.status === "DESLIGADO" ? v.data_desligamento || null : null,
        motivo_desligamento_id: v.status === "DESLIGADO" ? v.motivo_desligamento_id || null : null,
        documento_desligamento: v.status === "DESLIGADO" ? v.documento_desligamento || null : null,
      };
      mut.mutate({ body, outro });
    });

  if (me.data && !podeEditar(me.data)) {
    return <p className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-8 text-slate-400" data-testid="no-permission">Seu perfil (Consulta) não permite cadastrar ou editar registros.</p>;
  }
  const e = form.formState.errors;
  const c = cat.data;
  const statusOpts = editing && atual.data?.status === "DESLIGADO"
    ? [{ value: "DESLIGADO", label: "Desligado" }]
    : [{ value: "ATIVO", label: "Ativo" }, { value: "DESLIGADO", label: "Desligado" }];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link to={editing ? `/temporarios/${id}` : "/temporarios"} className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white" data-testid="form-back-link">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
        <h2 className="mt-2 font-heading text-2xl font-extrabold text-white sm:text-3xl" data-testid="page-title">
          {editing ? "Editar cadastro" : "Cadastro de militar temporário"}
        </h2>
        <p className="text-sm text-slate-400">Campos marcados com * são obrigatórios. Todas as alterações ficam registradas no histórico.</p>
      </div>

      {dup && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200" data-testid="duplicate-alert">
          <AlertCircle className="size-5 shrink-0" />
          <p className="flex-1">{dup.msg} Não é permitido duplicar matrículas.</p>
          <Link to={`/temporarios/${dup.id}`} className={buttonVariants({ size: "sm", variant: "outline" })} data-testid="open-existing-button">Abrir cadastro existente</Link>
        </div>
      )}

      <form onSubmit={submit(false)} className="space-y-5" data-testid="militar-form">
        <section className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Identificação</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Matrícula / vínculo" req error={e.matricula?.message}>
              <Input className="num" data-testid="input-matricula" placeholder="000000/01" {...form.register("matricula", { onBlur: checkMatricula })} />
            </Field>
            <Field label="Nome completo" req error={e.nome_completo?.message} className="sm:col-span-2">
              <Input data-testid="input-nome" {...form.register("nome_completo")} />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Dados funcionais e contratuais</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cargo / função" req error={e.cargo_id?.message}>
              <Controller control={form.control} name="cargo_id" render={({ field }) => (
                <FieldSelect testId="select-cargo" value={field.value} onChange={field.onChange} placeholder="Selecione o cargo"
                  options={(c?.cargos ?? []).filter((x) => x.ativo || x.id === field.value).map((x) => ({ value: x.id, label: x.nome }))} />
              )} />
            </Field>
            <Field label="Lotação / UBM" req error={e.lotacao_id?.message}>
              <Controller control={form.control} name="lotacao_id" render={({ field }) => (
                <FieldSelect testId="select-lotacao" value={field.value} onChange={field.onChange} placeholder="Selecione a lotação"
                  options={(c?.lotacoes ?? []).filter((x) => x.ativo || x.id === field.value).map((x) => ({ value: x.id, label: x.nome }))} />
              )} />
            </Field>
            <Field label="Edital / processo seletivo" req error={e.edital_id?.message}>
              <Controller control={form.control} name="edital_id" render={({ field }) => (
                <FieldSelect testId="select-edital" value={field.value} onChange={field.onChange} placeholder="Selecione o edital"
                  options={(c?.editais ?? []).filter((x) => x.ativo || x.id === field.value).map((x) => ({ value: x.id, label: x.nome }))} />
              )} />
            </Field>
            <Field label="DOE — incorporação">
              <Input data-testid="input-doe" placeholder="Ex.: DOE Nº 29.266, pág. 12" {...form.register("doe_incorporacao")} />
            </Field>
            <Field label="Militar sub judice?" req>
              <Controller control={form.control} name="sub_judice" render={({ field }) => (
                <FieldSelect testId="select-sub-judice" value={field.value} onChange={(v) => field.onChange(v as F["sub_judice"])}
                  options={[{ value: "NAO", label: "Não" }, { value: "SIM", label: "Sim — vínculo por decisão judicial" }]} />
              )} />
            </Field>
            <Field label="Data de inclusão no efetivo" req error={e.data_inclusao?.message}>
              <Input type="date" className="[color-scheme:dark]" data-testid="input-data-inclusao" {...form.register("data_inclusao")} />
            </Field>
            <Field label="Data de vencimento do contrato" req error={e.data_vencimento_contrato?.message}>
              <Input type="date" className="[color-scheme:dark]" data-testid="input-data-vencimento" {...form.register("data_vencimento_contrato")} />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-[#1E2C42] bg-[#121B28] p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Situação funcional</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Situação" req>
              <Controller control={form.control} name="status" render={({ field }) => (
                <FieldSelect testId="select-status" value={field.value} onChange={(v) => field.onChange(v as F["status"])} options={statusOpts} />
              )} />
            </Field>
            {status === "DESLIGADO" && (
              <>
                <Field label="Data do desligamento" req error={e.data_desligamento?.message}>
                  <Input type="date" max={hoje} className="[color-scheme:dark]" data-testid="input-data-desligamento" {...form.register("data_desligamento")} />
                </Field>
                <Field label="Motivo do desligamento" req error={e.motivo_desligamento_id?.message}>
                  <Controller control={form.control} name="motivo_desligamento_id" render={({ field }) => (
                    <FieldSelect testId="select-motivo" value={field.value ?? ""} onChange={field.onChange} placeholder="Selecione o motivo"
                      options={(c?.motivos ?? []).filter((x) => x.ativo).map((x) => ({ value: x.id, label: x.nome }))} />
                  )} />
                </Field>
                <Field label="Documento / processo">
                  <Input data-testid="input-documento" {...form.register("documento_desligamento")} />
                </Field>
              </>
            )}
            <Field label="Observações" className="sm:col-span-2">
              <Textarea rows={3} data-testid="input-observacoes" {...form.register("observacoes")} />
            </Field>
          </div>
        </section>

        <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-[#1E2C42] bg-[#0B111A]/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <Button type="submit" disabled={mut.isPending} className="bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-transform" data-testid="save-button">
            <Save className="size-4" /> Salvar Cadastro
          </Button>
          {!editing && (
            <Button type="button" variant="secondary" disabled={mut.isPending} onClick={() => void submit(true)()} data-testid="save-and-new-button">
              <SaveAll className="size-4" /> Salvar e Cadastrar Outro
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => nav(-1)} data-testid="cancel-button">Cancelar</Button>
          <Button type="button" variant="ghost" onClick={() => { form.reset(editing ? undefined : EMPTY); setDup(null); }} data-testid="clear-button">
            <Eraser className="size-4" /> Limpar Formulário
          </Button>
        </div>
      </form>
    </div>
  );
}
