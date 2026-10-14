import { ApiError } from "./api";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Cuiaba", dateStyle: "short", timeStyle: "short" });
}

export function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function errMsg(e: unknown, fallback = "Não foi possível concluir a operação"): string {
  if (e instanceof ApiError) {
    const b = e.body as { detail?: unknown } | null;
    const d = b?.detail;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && "message" in d) return String((d as { message: string }).message);
    if (Array.isArray(d)) {
      return d
        .map((x: { msg?: string; loc?: unknown[] }) => (x.msg ?? "").replace(/^Value error, /, ""))
        .filter(Boolean)
        .join("; ");
    }
    if (e.status === 403) return "Seu perfil não tem permissão para esta operação";
  }
  return fallback;
}

export function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}
