import { cn } from "@/lib/utils";
import type { Militar } from "@/lib/types";

export function StatusBadge({ status }: { status: Militar["status"] }) {
  const ativo = status === "ATIVO";
  return (
    <span
      data-testid="status-badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset",
        ativo ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30" : "bg-red-500/10 text-red-300 ring-red-500/30",
      )}
    >
      <span className={cn("size-1.5 rounded-full", ativo ? "bg-emerald-400" : "bg-red-400")} />
      {ativo ? "Ativo" : "Desligado"}
    </span>
  );
}

export function AlertaBadge({ m }: { m: Pick<Militar, "alerta" | "dias_para_vencer"> }) {
  if (!m.alerta) return null;
  const venc = m.alerta === "VENCIDO";
  return (
    <span
      data-testid="alerta-badge"
      title={venc ? "Contrato vencido com cadastro ativo — conferência administrativa" : "Contrato próximo do vencimento"}
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        venc ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300",
      )}
    >
      {venc ? `Vencido há ${Math.abs(m.dias_para_vencer)}d` : `Vence em ${m.dias_para_vencer}d`}
    </span>
  );
}
