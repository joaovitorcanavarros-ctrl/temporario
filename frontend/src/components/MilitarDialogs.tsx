import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, RotateCcw } from "lucide-react";
import FieldSelect from "@/components/FieldSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPatch, apiPost } from "@/lib/api";
import { errMsg, fmtDate } from "@/lib/format";
import { MILITAR_KEYS, useCatalogos, useMeta } from "@/lib/hooks";
import type { DesligamentoIn, Militar, MilitarRapidoIn, ReativacaoIn } from "@/lib/types";

export function useInvalidateMilitares() {
  const qc = useQueryClient();
  return () => MILITAR_KEYS.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
}

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-red-400">{msg}</p> : null;
}

function Resumo({ m }: { m: Militar }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-[#1E2C42] bg-[#0F1724] p-3 text-sm" data-testid="dialog-militar-resumo">
      <div className="col-span-2"><dt className="text-[10px] uppercase tracking-wider text-slate-500">Nome</dt><dd className="font-semibold text-white">{m.nome_completo}</dd></div>
      <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Matrícula</dt><dd className="num text-slate-200">{m.matricula}</dd></div>
      <div><dt className="text-[10px] uppercase tracking-wider text-slate-500">Cargo</dt><dd className="text-slate-200">{m.cargo_nome}</dd></div>
      <div className="col-span-2"><dt className="text-[10px] uppercase tracking-wider text-slate-500">Lotação</dt><dd className="text-slate-200">{m.lotacao_nome}</dd></div>
    </dl>
  );
}

const desligSchema = z.object({
  data_desligamento: z.string().min(1, "Informe a data efetiva"),
  motivo_id: z.string().min(1, "Selecione o motivo"),
  documento: z.string().max(120).optional(),
  observacoes: z.string().max(2000).optional(),
});
type DesligForm = z.infer<typeof desligSchema>;

export function DesligamentoDialog({ militar, onClose }: { militar: Militar | null; onClose: () => void }) {
  const cat = useCatalogos();
  const meta = useMeta();
  const invalidate = useInvalidateMilitares();
  const hoje = meta.data?.data_hoje ?? "";
  const form = useForm<DesligForm>({ resolver: zodResolver(desligSchema), defaultValues: { data_desligamento: "", motivo_id: "", documento: "", observacoes: "" } });
  useEffect(() => {
    if (militar) form.reset({ data_desligamento: hoje, motivo_id: "", documento: "", observacoes: "" });
  }, [militar, hoje, form]);
  const mut = useMutation({
    mutationFn: (b: DesligamentoIn) => apiPost<Militar>(`/militares/${militar?.id}/desligar`, b),
    onSuccess: (m) => {
      toast.success(`Desligamento registrado: ${m.nome_completo}`);
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const submit = form.handleSubmit((v) => {
    if (militar && v.data_desligamento < militar.data_inclusao) {
      form.setError("data_desligamento", { message: "Anterior à data de inclusão" });
      return;
    }
    if (hoje && v.data_desligamento > hoje) {
      form.setError("data_desligamento", { message: "A data não pode ser futura" });
      return;
    }
    mut.mutate({ ...v, documento: v.documento || null, observacoes: v.observacoes || null });
  });
  const e = form.formState.errors;
  return (
    <Dialog open={!!militar} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-[#1E2C42] bg-[#121B28] sm:max-w-lg" data-testid="desligamento-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white"><AlertTriangle className="size-5 text-red-400" /> Registrar Desligamento</DialogTitle>
          <DialogDescription>O cadastro não será excluído: a situação passa a Desligado e o histórico é preservado.</DialogDescription>
        </DialogHeader>
        {militar && <Resumo m={militar} />}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dt-deslig">Data efetiva do desligamento *</Label>
              <Input id="dt-deslig" type="date" max={hoje} className="[color-scheme:dark]" data-testid="desligamento-data-input" {...form.register("data_desligamento")} />
              <Err msg={e.data_desligamento?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Motivo *</Label>
              <Controller control={form.control} name="motivo_id" render={({ field }) => (
                <FieldSelect testId="desligamento-motivo-select" value={field.value} onChange={field.onChange} placeholder="Selecione o motivo"
                  options={(cat.data?.motivos ?? []).filter((m) => m.ativo).map((m) => ({ value: m.id, label: m.nome }))} />
              )} />
              <Err msg={e.motivo_id?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-deslig">Nº do documento / processo administrativo</Label>
            <Input id="doc-deslig" placeholder="Ex.: SEI 00000/2026" data-testid="desligamento-documento-input" {...form.register("documento")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs-deslig">Observações complementares</Label>
            <Textarea id="obs-deslig" rows={3} data-testid="desligamento-observacoes-input" {...form.register("observacoes")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="desligamento-cancel-button">Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={mut.isPending} data-testid="desligamento-confirm-button" className="bg-red-600 text-white hover:bg-red-700">
              {mut.isPending ? "Registrando..." : "Confirmar desligamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const reatSchema = z.object({
  justificativa: z.string().trim().min(10, "Descreva a justificativa (mínimo 10 caracteres)"),
  data_vencimento_contrato: z.string().optional(),
  documento: z.string().max(120).optional(),
});
type ReatForm = z.infer<typeof reatSchema>;

export function ReativarDialog({ militar, onClose }: { militar: Militar | null; onClose: () => void }) {
  const invalidate = useInvalidateMilitares();
  const form = useForm<ReatForm>({ resolver: zodResolver(reatSchema), defaultValues: { justificativa: "", data_vencimento_contrato: "", documento: "" } });
  useEffect(() => {
    if (militar) form.reset({ justificativa: "", data_vencimento_contrato: militar.data_vencimento_contrato, documento: "" });
  }, [militar, form]);
  const mut = useMutation({
    mutationFn: (b: ReativacaoIn) => apiPost<Militar>(`/militares/${militar?.id}/reativar`, b),
    onSuccess: (m) => { toast.success(`Cadastro reativado: ${m.nome_completo}`); invalidate(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const submit = form.handleSubmit((v) =>
    mut.mutate({ justificativa: v.justificativa, data_vencimento_contrato: v.data_vencimento_contrato || null, documento: v.documento || null }),
  );
  return (
    <Dialog open={!!militar} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-[#1E2C42] bg-[#121B28] sm:max-w-lg" data-testid="reativar-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white"><RotateCcw className="size-5 text-emerald-400" /> Reativar Cadastro</DialogTitle>
          <DialogDescription>
            Desligado em {fmtDate(militar?.data_desligamento)} ({militar?.motivo_desligamento_nome ?? "—"}). A reativação fica registrada no histórico.
          </DialogDescription>
        </DialogHeader>
        {militar && <Resumo m={militar} />}
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="just">Justificativa *</Label>
            <Textarea id="just" rows={3} data-testid="reativar-justificativa-input" {...form.register("justificativa")} />
            <Err msg={form.formState.errors.justificativa?.message} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nv">Vencimento do contrato</Label>
              <Input id="nv" type="date" className="[color-scheme:dark]" data-testid="reativar-vencimento-input" {...form.register("data_vencimento_contrato")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docr">Documento / processo</Label>
              <Input id="docr" data-testid="reativar-documento-input" {...form.register("documento")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="reativar-cancel-button">Cancelar</Button>
            <Button type="submit" disabled={mut.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700" data-testid="reativar-confirm-button">
              {mut.isPending ? "Reativando..." : "Confirmar reativação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const rapidoSchema = z.object({
  lotacao_id: z.string().min(1, "Selecione a lotação"),
  edital_id: z.string().min(1, "Selecione o edital"),
  data_vencimento_contrato: z.string().min(1, "Informe o vencimento"),
  observacoes: z.string().max(2000).optional(),
});
type RapidoForm = z.infer<typeof rapidoSchema>;

export function QuickEditDialog({ militar, onClose }: { militar: Militar | null; onClose: () => void }) {
  const cat = useCatalogos();
  const invalidate = useInvalidateMilitares();
  const form = useForm<RapidoForm>({ resolver: zodResolver(rapidoSchema) });
  useEffect(() => {
    if (militar)
      form.reset({
        lotacao_id: militar.lotacao_id, edital_id: militar.edital_id,
        data_vencimento_contrato: militar.data_vencimento_contrato, observacoes: militar.observacoes ?? "",
      });
  }, [militar, form]);
  const mut = useMutation({
    mutationFn: (b: MilitarRapidoIn) => apiPatch<Militar>(`/militares/${militar?.id}/rapido`, b),
    onSuccess: () => { toast.success("Alterações salvas e registradas no histórico"); invalidate(); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const submit = form.handleSubmit((v) => {
    if (militar && v.data_vencimento_contrato < militar.data_inclusao) {
      form.setError("data_vencimento_contrato", { message: "Anterior à data de inclusão" });
      return;
    }
    mut.mutate({ ...v, observacoes: v.observacoes ?? null });
  });
  const e = form.formState.errors;
  return (
    <Dialog open={!!militar} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="border-[#1E2C42] bg-[#121B28] sm:max-w-lg" data-testid="quick-edit-dialog">
        <DialogHeader>
          <DialogTitle className="text-white">Edição rápida</DialogTitle>
          <DialogDescription>{militar?.nome_completo} · <span className="num">{militar?.matricula}</span></DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Lotação / UBM</Label>
            <Controller control={form.control} name="lotacao_id" render={({ field }) => (
              <FieldSelect testId="quick-edit-lotacao-select" value={field.value} onChange={field.onChange}
                options={(cat.data?.lotacoes ?? []).filter((l) => l.ativo || l.id === field.value).map((l) => ({ value: l.id, label: l.nome }))} />
            )} />
            <Err msg={e.lotacao_id?.message} />
          </div>
          <div className="space-y-1.5">
            <Label>Edital</Label>
            <Controller control={form.control} name="edital_id" render={({ field }) => (
              <FieldSelect testId="quick-edit-edital-select" value={field.value} onChange={field.onChange}
                options={(cat.data?.editais ?? []).filter((l) => l.ativo || l.id === field.value).map((l) => ({ value: l.id, label: l.nome }))} />
            )} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qv">Vencimento do contrato</Label>
            <Input id="qv" type="date" className="[color-scheme:dark]" data-testid="quick-edit-vencimento-input" {...form.register("data_vencimento_contrato")} />
            <Err msg={e.data_vencimento_contrato?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qo">Observações</Label>
            <Textarea id="qo" rows={3} data-testid="quick-edit-observacoes-input" {...form.register("observacoes")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="quick-edit-cancel-button">Cancelar</Button>
            <Button type="submit" disabled={mut.isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="quick-edit-save-button">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
