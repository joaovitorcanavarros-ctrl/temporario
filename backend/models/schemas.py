"""Modelos Pydantic v2 — espelhados manualmente em frontend/src/lib/types.ts."""

import re
import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Perfil = Literal["ADMIN", "GESTOR", "CONSULTA"]
Status = Literal["ATIVO", "DESLIGADO"]


def new_id() -> str:
    return str(uuid.uuid4())


# ---------- usuários / auth ----------
class UserOut(BaseModel):
    id: str
    nome: str
    email: str
    perfil: Perfil
    ativo: bool = True


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    senha: str = Field(min_length=1, max_length=200)


class UsuarioIn(BaseModel):
    nome: str = Field(min_length=3, max_length=120)
    email: str = Field(min_length=5, max_length=120)
    perfil: Perfil
    ativo: bool = True
    senha: str | None = Field(default=None, max_length=200)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("e-mail inválido")
        return v


# ---------- catálogos ----------
class Categoria(BaseModel):
    id: str
    codigo: str
    nome: str
    ordem: int = 50
    ativo: bool = True


class CategoriaIn(BaseModel):
    codigo: str = Field(min_length=2, max_length=30, pattern=r"^[A-Z0-9_]+$")
    nome: str = Field(min_length=2, max_length=80)
    ordem: int = 50
    ativo: bool = True


class Cargo(BaseModel):
    id: str
    nome: str
    categoria: str
    ativo: bool = True


class CargoIn(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    categoria: str
    ativo: bool = True


class Lotacao(BaseModel):
    id: str
    nome: str
    tipo: str = "UBM"
    ativo: bool = True


class LotacaoIn(BaseModel):
    nome: str = Field(min_length=2, max_length=160)
    tipo: str = Field(default="UBM", max_length=40)
    ativo: bool = True


class Edital(BaseModel):
    id: str
    nome: str
    ano: int | None = None
    descricao: str | None = None
    ativo: bool = True


class EditalIn(BaseModel):
    nome: str = Field(min_length=2, max_length=160)
    ano: int | None = Field(default=None, ge=1990, le=2100)
    descricao: str | None = Field(default=None, max_length=500)
    ativo: bool = True


class Motivo(BaseModel):
    id: str
    nome: str
    ativo: bool = True


class MotivoIn(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    ativo: bool = True


class Config(BaseModel):
    alerta_dias: int = Field(default=30, ge=1, le=365)


class Catalogos(BaseModel):
    categorias: list[Categoria]
    cargos: list[Cargo]
    lotacoes: list[Lotacao]
    editais: list[Edital]
    motivos: list[Motivo]
    config: Config


class Meta(BaseModel):
    data_hoje: str
    ultima_atualizacao: datetime | None
    total_registros: int


# ---------- militares ----------
class MilitarIn(BaseModel):
    matricula: str = Field(min_length=3, max_length=30)
    nome_completo: str = Field(min_length=3, max_length=160)
    cargo_id: str
    lotacao_id: str
    edital_id: str
    data_inclusao: date
    data_vencimento_contrato: date
    status: Status = "ATIVO"
    observacoes: str | None = Field(default=None, max_length=2000)
    doe_incorporacao: str | None = Field(default=None, max_length=300)
    sub_judice: bool = False
    data_desligamento: date | None = None
    motivo_desligamento_id: str | None = None
    documento_desligamento: str | None = Field(default=None, max_length=120)

    @field_validator("matricula")
    @classmethod
    def _mat(cls, v: str) -> str:
        v = re.sub(r"\s+", "", v).upper()
        if not re.match(r"^[0-9A-Z./-]+$", v):
            raise ValueError("matrícula deve conter apenas números, letras, ponto, barra ou hífen")
        return v

    @field_validator("nome_completo")
    @classmethod
    def _nome(cls, v: str) -> str:
        return re.sub(r"\s+", " ", v).strip().upper()

    @model_validator(mode="after")
    def _datas(self) -> "MilitarIn":
        if self.data_vencimento_contrato < self.data_inclusao:
            raise ValueError("a data de vencimento do contrato não pode ser anterior à data de inclusão")
        if self.status == "DESLIGADO":
            if not self.data_desligamento or not self.motivo_desligamento_id:
                raise ValueError("para situação Desligado, informe a data e o motivo do desligamento")
            if self.data_desligamento < self.data_inclusao:
                raise ValueError("a data de desligamento não pode ser anterior à data de inclusão")
        else:
            self.data_desligamento = None
            self.motivo_desligamento_id = None
            self.documento_desligamento = None
        return self


class MilitarRapidoIn(BaseModel):
    lotacao_id: str | None = None
    edital_id: str | None = None
    data_vencimento_contrato: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class DesligamentoIn(BaseModel):
    data_desligamento: date
    motivo_id: str
    documento: str | None = Field(default=None, max_length=120)
    observacoes: str | None = Field(default=None, max_length=2000)


class ReativacaoIn(BaseModel):
    justificativa: str = Field(min_length=10, max_length=2000)
    data_vencimento_contrato: date | None = None
    documento: str | None = Field(default=None, max_length=120)


class Militar(BaseModel):
    id: str
    matricula: str
    nome_completo: str
    cargo_id: str
    cargo_nome: str
    categoria: str
    categoria_nome: str
    lotacao_id: str
    lotacao_nome: str
    edital_id: str
    edital_nome: str
    data_inclusao: str
    data_vencimento_contrato: str
    status: Status
    data_desligamento: str | None = None
    motivo_desligamento_id: str | None = None
    motivo_desligamento_nome: str | None = None
    documento_desligamento: str | None = None
    observacoes: str | None = None
    doe_incorporacao: str | None = None
    sub_judice: bool = False
    dias_para_vencer: int
    alerta: Literal["VENCIDO", "A_VENCER"] | None = None
    criado_em: datetime | None = None
    atualizado_em: datetime | None = None
    criado_por_nome: str | None = None
    atualizado_por_nome: str | None = None


class MilitarPage(BaseModel):
    items: list[Militar]
    total: int
    page: int
    page_size: int


class MatriculaCheck(BaseModel):
    existe: bool
    militar_id: str | None = None
    nome_completo: str | None = None


class HistoricoAlteracao(BaseModel):
    id: str
    entidade: str
    entidade_id: str | None = None
    matricula: str | None = None
    operacao: str
    usuario_nome: str
    timestamp: datetime
    antes: dict[str, Any] | None = None
    depois: dict[str, Any] | None = None


class HistoricoSituacao(BaseModel):
    id: str
    militar_id: str
    matricula: str
    nome_completo: str
    tipo: Literal["INCLUSAO", "DESLIGAMENTO", "REATIVACAO"]
    data_efetiva: str
    motivo_nome: str | None = None
    documento: str | None = None
    justificativa: str | None = None
    observacoes: str | None = None
    usuario_nome: str
    timestamp: datetime


class MilitarHistorico(BaseModel):
    alteracoes: list[HistoricoAlteracao]
    situacao: list[HistoricoSituacao]


class AuditoriaPage(BaseModel):
    items: list[HistoricoAlteracao]
    total: int


class SituacaoPage(BaseModel):
    items: list[HistoricoSituacao]
    total: int


# ---------- dashboard ----------
class CountItem(BaseModel):
    chave: str
    nome: str
    total: int


class FaixaItem(BaseModel):
    faixa: str
    min: int | None
    max: int | None
    total: int


class KPIs(BaseModel):
    ativos: int
    desligamentos_periodo: int
    inclusoes_periodo: int
    top_ubm_id: str | None
    top_ubm_nome: str | None
    top_ubm_total: int
    por_categoria: dict[str, int]
    a_vencer: int
    vencidos: int
    sub_judice: int


class Dashboard(BaseModel):
    data_hoje: str
    data_referencia: str
    periodo_inicio: str | None
    periodo_fim: str | None
    alerta_dias: int
    kpis: KPIs
    categorias: list[CountItem]
    motivos: list[CountItem]
    efetivo_cargo_ano: list[dict[str, Any]]
    deslig_por_ano: list[dict[str, Any]]
    deslig_por_cargo: list[dict[str, Any]]
    deslig_motivos: list[CountItem]
    por_ubm: list[CountItem]
    evolucao_mensal: list[dict[str, Any]]
    evolucao_anual: list[dict[str, Any]]
    dist_categoria: list[CountItem]
    dist_edital: list[CountItem]
    faixas_vencimento: list[FaixaItem]


# ---------- importação ----------
class CampoDef(BaseModel):
    key: str
    label: str
    obrigatorio: bool


class ImportAnalisarIn(BaseModel):
    content: str = Field(max_length=10_000_000)
    filename: str = Field(default="arquivo.csv", max_length=200)


class ImportAnalise(BaseModel):
    delimitador: str
    linha_cabecalho: int | None
    cabecalho: list[str]
    mapeamento: dict[str, int | None]
    amostra: list[list[str]]
    total_linhas: int
    campos: list[CampoDef]


class ImportValidarIn(BaseModel):
    content: str = Field(max_length=10_000_000)
    filename: str = Field(default="arquivo.csv", max_length=200)
    linha_cabecalho: int = Field(ge=1)
    mapeamento: dict[str, int | None]
    aprovar_atualizacoes: list[str] = []


class Diferenca(BaseModel):
    campo: str
    atual: str | None
    novo: str | None


class ImportLinha(BaseModel):
    linha: int
    matricula: str
    nome_completo: str
    acao: Literal["INSERIR", "ATUALIZAR", "IGNORAR", "REJEITAR"]
    erros: list[str]
    avisos: list[str]
    diferencas: list[Diferenca]
    dados: dict[str, str]


class ImportResumo(BaseModel):
    inserir: int
    atualizar: int
    ignorar: int
    rejeitar: int


class ImportValidacao(BaseModel):
    linhas: list[ImportLinha]
    resumo: ImportResumo
    novos_cargos: list[str]
    novas_lotacoes: list[str]
    novos_editais: list[str]


class ImportResultado(BaseModel):
    inseridos: int
    atualizados: int
    ignorados: int
    rejeitados: int
    atualizacoes_nao_aprovadas: int


# ---------- relatórios ----------
class Coluna(BaseModel):
    key: str
    label: str


class Relatorio(BaseModel):
    tipo: str
    titulo: str
    descricao: str
    colunas: list[Coluna]
    linhas: list[dict[str, Any]]
    gerado_em: str
    filtros: str
