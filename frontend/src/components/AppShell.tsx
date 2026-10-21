import { useState } from "react";
import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import {
  Activity, Briefcase, ChevronsLeft, ChevronsRight, FileSpreadsheet, FileText, HeartPulse,
  LayoutDashboard, LogOut, Menu, Settings, Shield, Stethoscope, Truck, UserPlus, Users, UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { FiltersProvider } from "@/lib/filters";
import { PERFIL_LABEL, podeEditar, useCatalogos, useMe, useMeta } from "@/lib/hooks";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const CAT_ICON: Record<string, LucideIcon> = {
  AUXILIAR: Shield, CONDUTOR: Truck, TEC_ENFERMAGEM: Activity, ENFERMEIRO: HeartPulse, MEDICO: Stethoscope, OUTROS: Briefcase,
};
const FALLBACK_CATS = [
  { codigo: "AUXILIAR", nome: "Auxiliares" }, { codigo: "CONDUTOR", nome: "Condutores" },
  { codigo: "TEC_ENFERMAGEM", nome: "Técnicos de Enfermagem" }, { codigo: "ENFERMEIRO", nome: "Enfermeiros" },
  { codigo: "MEDICO", nome: "Médicos" }, { codigo: "OUTROS", nome: "Outros Cargos" },
];

interface NavItem { to: string; label: string; icon: LucideIcon; id: string; end?: boolean }

function NavGroup({ title, items, collapsed, onNavigate }: { title: string; items: NavItem[]; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <div className="space-y-1">
      {!collapsed && <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>}
      {collapsed && <div className="mx-3 my-3 h-px bg-[#162234]" />}
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          onClick={onNavigate}
          title={collapsed ? it.label : undefined}
          data-testid={`nav-${it.id}`}
          className={({ isActive }) =>
            cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color] duration-150",
              isActive ? "bg-blue-600/15 text-white" : "text-slate-400 hover:bg-[#15213A] hover:text-slate-100",
              collapsed && "justify-center px-0",
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-blue-500" />}
              <it.icon className={cn("size-[18px] shrink-0", isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300")} />
              {!collapsed && <span className="truncate">{it.label}</span>}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const cat = useCatalogos();
  const cats = (cat.data?.categorias.filter((c) => c.ativo) ?? FALLBACK_CATS) as { codigo: string; nome: string }[];
  const principal: NavItem[] = [
    { to: "/", label: "Visão Geral", icon: LayoutDashboard, id: "visao-geral", end: true },
    { to: "/temporarios", label: "Temporários Geral", icon: Users, id: "temporarios-geral", end: true },
  ];
  const quadros: NavItem[] = cats.map((c) => ({
    to: `/quadro/${c.codigo}`, label: c.nome, icon: CAT_ICON[c.codigo] ?? Briefcase, id: `quadro-${c.codigo.toLowerCase()}`,
  }));
  const gestao: NavItem[] = [
    { to: "/desligamentos", label: "Desligamentos e Histórico", icon: UserX, id: "desligamentos" },
    { to: "/importacao", label: "Importação de Dados", icon: FileSpreadsheet, id: "importacao" },
    { to: "/relatorios", label: "Relatórios", icon: FileText, id: "relatorios" },
    { to: "/configuracoes", label: "Configurações e Usuários", icon: Settings, id: "configuracoes" },
  ];
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-6">
      <NavGroup title="Principal" items={principal} collapsed={collapsed} onNavigate={onNavigate} />
      <NavGroup title="Quadros de efetivo" items={quadros} collapsed={collapsed} onNavigate={onNavigate} />
      <NavGroup title="Gestão" items={gestao} collapsed={collapsed} onNavigate={onNavigate} />
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link to="/" className={cn("flex items-center gap-3 px-5 py-5", collapsed && "justify-center px-0")} data-testid="brand-link">
      <img src="/cbmmt-logo.png" alt="Emblema do Corpo de Bombeiros Militar de Mato Grosso" className="size-11 shrink-0 drop-shadow-[0_4px_10px_rgba(220,38,38,0.35)]" data-testid="brand-logo" />
      {!collapsed && (
        <span className="leading-tight">
          <span className="block font-heading text-[15px] font-extrabold tracking-wide text-white">CBMMT</span>
          <span className="block text-[11px] text-slate-400">Temporários</span>
        </span>
      )}
    </Link>
  );
}

export default function AppShell() {
  const me = useMe();
  const meta = useMeta();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("cbmmt.sidebar") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);

  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />;

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem("cbmmt.sidebar", c ? "0" : "1");
      return !c;
    });
  };
  const user = me.data;

  return (
    <FiltersProvider>
      <div className="min-h-screen bg-[#0B111A]">
        <aside
          data-testid="sidebar"
          className={cn(
            "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[#162234] bg-[#0D1522] lg:flex",
            "transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            collapsed ? "w-20" : "w-64",
          )}
        >
          <Brand collapsed={collapsed} />
          <SidebarBody collapsed={collapsed} />
          <button
            onClick={toggle}
            data-testid="sidebar-toggle"
            className="flex items-center justify-center gap-2 border-t border-[#162234] py-3 text-xs text-slate-500 transition-colors hover:text-slate-200"
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Recolher menu</>}
          </button>
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 border-[#162234] bg-[#0D1522] p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-full flex-col">
              <Brand collapsed={false} />
              <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        <div className={cn("transition-[padding] duration-300", collapsed ? "lg:pl-20" : "lg:pl-64")}>
          <header className="sticky top-0 z-20 border-b border-[#162234] bg-[#101928]/85 backdrop-blur-md">
            <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} data-testid="mobile-menu-button">
                <Menu className="size-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-heading text-sm font-bold text-white sm:text-base" data-testid="system-title">
                  Gerenciamento de Bombeiros Militares Temporários
                </h1>
                <p className="truncate text-[11px] text-slate-400" data-testid="last-update">
                  Corpo de Bombeiros Militar de Mato Grosso · Hoje {fmtDate(meta.data?.data_hoje)} · Última atualização:{" "}
                  <span className="num text-slate-300">{fmtDateTime(meta.data?.ultima_atualizacao)}</span>
                </p>
              </div>
              {podeEditar(user) && (
                <Link to="/temporarios/novo" className={cn(buttonVariants({ size: "sm" }), "hidden bg-blue-600 hover:bg-blue-700 sm:inline-flex")} data-testid="header-new-button">
                  <UserPlus className="size-4" /> Novo cadastro
                </Link>
              )}
              <div className="hidden text-right md:block" data-testid="user-identification">
                <p className="text-sm font-semibold text-slate-100">{user?.nome ?? "—"}</p>
                <p className="text-[11px] text-blue-300">{user ? PERFIL_LABEL[user.perfil] : ""}</p>
              </div>
              <Button variant="ghost" size="icon" title="Sair" onClick={() => void endSession()} data-testid="logout-button">
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>
          <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
            <Outlet context={{ nav }} />
          </main>
        </div>
        <Toaster richColors theme="dark" />
      </div>
    </FiltersProvider>
  );
}
