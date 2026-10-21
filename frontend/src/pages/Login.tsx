import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { errMsg } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { beginSession } from "@/lib/session";
import type { UserOut } from "@/lib/types";

const schema = z.object({
  email: z.string().trim().min(3, "Informe o e-mail"),
  senha: z.string().min(1, "Informe a senha"),
});
type F = z.infer<typeof schema>;

export default function Login() {
  const me = useMe();
  const nav = useNavigate();
  const [erro, setErro] = useState("");
  const form = useForm<F>({ resolver: zodResolver(schema), defaultValues: { email: "", senha: "" } });
  const mut = useMutation({
    mutationFn: (b: F) => apiPost<UserOut>("/auth/login", b),
    onSuccess: () => { beginSession(); nav("/", { replace: true }); },
    onError: (e) => setErro(errMsg(e, "Falha ao entrar")),
  });
  if (me.data) return <Navigate to="/" replace />;
  return (
    <div className="grid min-h-screen bg-[#0B111A] lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-[#162234] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(37,99,235,0.25),transparent_55%),radial-gradient(ellipse_at_80%_90%,rgba(225,29,72,0.18),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#94A3B8_1px,transparent_1px),linear-gradient(90deg,#94A3B8_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <img src="/cbmmt-logo.png" alt="Emblema do CBMMT" className="size-16 drop-shadow-[0_6px_16px_rgba(220,38,38,0.35)]" data-testid="login-logo" />
            <div>
              <p className="font-heading text-lg font-extrabold tracking-wide text-white">CBMMT</p>
              <p className="text-xs text-slate-400">Corpo de Bombeiros Militar de Mato Grosso</p>
            </div>
          </div>
          <div className="max-w-lg animate-rise">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400">Diretoria de Gestão de Pessoas</p>
            <h2 className="font-heading text-4xl font-extrabold leading-tight text-white">Gerenciamento de Bombeiros Militares Temporários</h2>
            <p className="mt-4 text-slate-400">Efetivo, contratos, desligamentos e relatórios em um único sistema, com indicadores calculados a partir dos registros oficiais.</p>
          </div>
          <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="size-4" /> Acesso restrito a usuários autorizados. Operações registradas em auditoria.</p>
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={form.handleSubmit((v) => { setErro(""); mut.mutate(v); })} className="w-full max-w-sm animate-rise space-y-5 rounded-2xl border border-[#1E2C42] bg-[#121B28] p-8 shadow-2xl shadow-black/50" data-testid="login-form">
          <div>
            <h1 className="font-heading text-2xl font-bold text-white">Entrar</h1>
            <p className="mt-1 text-sm text-slate-400">Use suas credenciais institucionais.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" autoComplete="username" data-testid="login-email-input" {...form.register("email")} />
            {form.formState.errors.email && <p className="text-xs text-red-400">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" autoComplete="current-password" data-testid="login-password-input" {...form.register("senha")} />
            {form.formState.errors.senha && <p className="text-xs text-red-400">{form.formState.errors.senha.message}</p>}
          </div>
          {erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300" data-testid="login-error">{erro}</p>}
          <Button type="submit" className="h-10 w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-transform" disabled={mut.isPending} data-testid="login-submit-button">
            <Lock className="size-4" /> {mut.isPending ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </section>
    </div>
  );
}
