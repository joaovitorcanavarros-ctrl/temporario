import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { Catalogos, Meta, UserOut } from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => apiGet<UserOut>("/auth/me"), retry: false, staleTime: 60_000 });
}

export function useCatalogos() {
  return useQuery({ queryKey: ["catalogos"], queryFn: () => apiGet<Catalogos>("/catalogos"), staleTime: 60_000 });
}

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => apiGet<Meta>("/meta") });
}

export function podeEditar(u: UserOut | undefined): boolean {
  return u?.perfil === "ADMIN" || u?.perfil === "GESTOR";
}

export function isAdmin(u: UserOut | undefined): boolean {
  return u?.perfil === "ADMIN";
}

export const PERFIL_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor de Pessoal",
  CONSULTA: "Consulta",
};

// keys whose data changes after any write to militares
export const MILITAR_KEYS = [["militares"], ["dashboard"], ["meta"], ["relatorio"], ["militar"], ["situacao"]];
