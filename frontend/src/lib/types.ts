// Interfaces espelhando backend/models/schemas.py — manter sincronizadas manualmente.
export type Perfil = "ADMIN" | "GESTOR" | "CONSULTA";
export type Status = "ATIVO" | "DESLIGADO";

export interface UserOut { id: string; nome: string; email: string; perfil: Perfil; ativo: boolean }
export interface UsuarioIn { nome: string; email: string; perfil: Perfil; ativo: boolean; senha?: string | null }

export interface Categoria { id: string; codigo: string; nome: string; ordem: number; ativo: boolean }
export interface Cargo { id: string; nome: string; categoria: string; ativo: boolean }
export interface Lotacao { id: string; nome: string; tipo: string; ativo: boolean }
export interface Edital { id: string; nome: string; ano: number | null; descricao: string | null; ativo: boolean }
export interface Motivo { id: string; nome: string; ativo: boolean }
export interface Config { alerta_dias: number }
export interface Catalogos {
  categorias: Categoria[]; cargos: Cargo[]; lotacoes: Lotacao[]; editais: Edital[]; motivos: Motivo[]; config: Config;
}
export interface Meta { data_hoje: string; ultima_atualizacao: string | null; total_registros: number }

export interface MilitarIn {
  matricula: string; nome_completo: string; cargo_id: string; lotacao_id: string; edital_id: string;
  data_inclusao: string; data_vencimento_contrato: string; status: Status;
  observacoes?: string | null; doe_incorporacao?: string | null;
  data_desligamento?: string | null; motivo_desligamento_id?: string | null; documento_desligamento?: string | null;
}
export interface MilitarRapidoIn { lotacao_id?: string | null; edital_id?: string | null; data_vencimento_contrato?: string | null; observacoes?: string | null }
export interface DesligamentoIn { data_desligamento: string; motivo_id: string; documento?: string | null; observacoes?: string | null }
export interface ReativacaoIn { justificativa: string; data_vencimento_contrato?: string | null; documento?: string | null }

export interface Militar {
  id: string; matricula: string; nome_completo: string;
  cargo_id: string; cargo_nome: string; categoria: string; categoria_nome: string;
  lotacao_id: string; lotacao_nome: string; edital_id: string; edital_nome: string;
  data_inclusao: string; data_vencimento_contrato: string; status: Status;
  data_desligamento: string | null; motivo_desligamento_id: string | null; motivo_desligamento_nome: string | null;
  documento_desligamento: string | null; observacoes: string | null; doe_incorporacao: string | null;
  dias_para_vencer: number; alerta: "VENCIDO" | "A_VENCER" | null;
  criado_em: string | null; atualizado_em: string | null; criado_por_nome: string | null; atualizado_por_nome: string | null;
}
export interface MilitarPage { items: Militar[]; total: number; page: number; page_size: number }
export interface MatriculaCheck { existe: boolean; militar_id: string | null; nome_completo: string | null }

export interface HistoricoAlteracao {
  id: string; entidade: string; entidade_id: string | null; matricula: string | null; operacao: string;
  usuario_nome: string; timestamp: string; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null;
}
export interface HistoricoSituacao {
  id: string; militar_id: string; matricula: string; nome_completo: string;
  tipo: "INCLUSAO" | "DESLIGAMENTO" | "REATIVACAO"; data_efetiva: string; motivo_nome: string | null;
  documento: string | null; justificativa: string | null; observacoes: string | null; usuario_nome: string; timestamp: string;
}
export interface MilitarHistorico { alteracoes: HistoricoAlteracao[]; situacao: HistoricoSituacao[] }
export interface AuditoriaPage { items: HistoricoAlteracao[]; total: number }
export interface SituacaoPage { items: HistoricoSituacao[]; total: number }

export interface CountItem { chave: string; nome: string; total: number }
export interface FaixaItem { faixa: string; min: number | null; max: number | null; total: number }
export interface KPIs {
  ativos: number; desligamentos_periodo: number; inclusoes_periodo: number;
  top_ubm_id: string | null; top_ubm_nome: string | null; top_ubm_total: number;
  por_categoria: Record<string, number>; a_vencer: number; vencidos: number;
}
export type ChartRow = Record<string, string | number>;
export interface Dashboard {
  data_hoje: string; data_referencia: string; periodo_inicio: string | null; periodo_fim: string | null; alerta_dias: number;
  kpis: KPIs; categorias: CountItem[]; motivos: CountItem[];
  efetivo_cargo_ano: ChartRow[]; deslig_por_ano: ChartRow[]; deslig_por_cargo: ChartRow[]; deslig_motivos: CountItem[];
  por_ubm: CountItem[]; evolucao_mensal: ChartRow[]; evolucao_anual: ChartRow[];
  dist_categoria: CountItem[]; dist_edital: CountItem[]; faixas_vencimento: FaixaItem[];
}

export interface CampoDef { key: string; label: string; obrigatorio: boolean }
export interface ImportAnalise {
  delimitador: string; linha_cabecalho: number | null; cabecalho: string[];
  mapeamento: Record<string, number | null>; amostra: string[][]; total_linhas: number; campos: CampoDef[];
}
export interface ImportValidarIn {
  content: string; filename: string; linha_cabecalho: number; mapeamento: Record<string, number | null>; aprovar_atualizacoes: string[];
}
export interface Diferenca { campo: string; atual: string | null; novo: string | null }
export interface ImportLinha {
  linha: number; matricula: string; nome_completo: string; acao: "INSERIR" | "ATUALIZAR" | "IGNORAR" | "REJEITAR";
  erros: string[]; avisos: string[]; diferencas: Diferenca[]; dados: Record<string, string>;
}
export interface ImportResumo { inserir: number; atualizar: number; ignorar: number; rejeitar: number }
export interface ImportValidacao { linhas: ImportLinha[]; resumo: ImportResumo; novos_cargos: string[]; novas_lotacoes: string[]; novos_editais: string[] }
export interface ImportResultado { inseridos: number; atualizados: number; ignorados: number; rejeitados: number; atualizacoes_nao_aprovadas: number }

export interface Coluna { key: string; label: string }
export interface Relatorio {
  tipo: string; titulo: string; descricao: string; colunas: Coluna[];
  linhas: Record<string, string | number | null>[]; gerado_em: string; filtros: string;
}
