"""Filtros compartilhados, enriquecimento de registros e auditoria."""

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from lib.dates import today_iso
from lib.db import db
from lib.stats import alerta_contrato, dias_entre
from models.schemas import new_id

TZ = "America/Cuiaba"


def hoje() -> str:
    return today_iso(TZ)


def agora() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Filtros:
    q: str | None = None
    categoria: str | None = None
    cargo_id: str | None = None
    lotacao_id: str | None = None
    edital_id: str | None = None
    status: str | None = None
    motivo_id: str | None = None
    ano: int | None = None
    data_inicio: str | None = None
    data_fim: str | None = None
    ativo_em: str | None = None
    inclusao_ini: str | None = None
    inclusao_fim: str | None = None
    deslig_ini: str | None = None
    deslig_fim: str | None = None
    venc_min_dias: int | None = None
    venc_max_dias: int | None = None
    venc: str | None = None  # a_vencer | vencidos
    sub_judice: bool | None = None


def periodo(f: Filtros) -> tuple[str | None, str | None]:
    if f.data_inicio or f.data_fim:
        return f.data_inicio or None, f.data_fim or None
    if f.ano:
        return f"{f.ano}-01-01", f"{f.ano}-12-31"
    return None, None


def descrever_filtros(f: Filtros, maps: "Maps") -> str:
    partes = []
    if f.categoria:
        partes.append(f"Categoria: {maps.categoria_nome.get(f.categoria, f.categoria)}")
    if f.cargo_id:
        partes.append(f"Cargo: {maps.cargos.get(f.cargo_id, {}).get('nome', '-')}")
    if f.lotacao_id:
        partes.append(f"Lotação: {maps.lotacoes.get(f.lotacao_id, {}).get('nome', '-')}")
    if f.edital_id:
        partes.append(f"Edital: {maps.editais.get(f.edital_id, {}).get('nome', '-')}")
    if f.status:
        partes.append(f"Situação: {f.status}")
    ini, fim = periodo(f)
    if ini or fim:
        partes.append(f"Período: {ini or '...'} a {fim or '...'}")
    if f.q:
        partes.append(f"Pesquisa: {f.q}")
    return "; ".join(partes) or "Sem filtros"


class Maps:
    def __init__(self, cargos: list, lotacoes: list, editais: list, motivos: list, categorias: list, usuarios: list, alerta_dias: int):
        self.cargos = {c["id"]: c for c in cargos}
        self.lotacoes = {c["id"]: c for c in lotacoes}
        self.editais = {c["id"]: c for c in editais}
        self.motivos = {c["id"]: c for c in motivos}
        self.categorias = sorted(categorias, key=lambda c: (c.get("ordem", 50), c["nome"]))
        self.categoria_nome = {c["codigo"]: c["nome"] for c in categorias}
        self.usuarios = {u["id"]: u["nome"] for u in usuarios}
        self.alerta_dias = alerta_dias


async def load_config() -> dict:
    cfg = await db.config.find_one({"_id": "app"}) or {}
    return {"alerta_dias": int(cfg.get("alerta_dias", 30))}


async def load_maps() -> Maps:
    proj = {"_id": 0}
    cargos = await db.cargos.find({}, proj).to_list(5000)
    lotacoes = await db.lotacoes.find({}, proj).to_list(5000)
    editais = await db.editais.find({}, proj).to_list(5000)
    motivos = await db.motivos.find({}, proj).to_list(500)
    categorias = await db.categorias.find({}, proj).to_list(500)
    usuarios = await db.usuarios.find({}, {"_id": 0, "id": 1, "nome": 1}).to_list(5000)
    cfg = await load_config()
    return Maps(cargos, lotacoes, editais, motivos, categorias, usuarios, cfg["alerta_dias"])


def _add_days(d: str, n: int) -> str:
    return (date.fromisoformat(d) + timedelta(days=n)).isoformat()


def build_query(f: Filtros, maps: Maps, today: str) -> dict:
    conds: list[dict] = []
    if f.categoria:
        conds.append({"cargo_id": {"$in": [c["id"] for c in maps.cargos.values() if c["categoria"] == f.categoria]}})
    for campo in ("cargo_id", "lotacao_id", "edital_id", "status"):
        val = getattr(f, campo)
        if val:
            conds.append({campo: val})
    if f.sub_judice is not None:
        conds.append({"sub_judice": True} if f.sub_judice else {"sub_judice": {"$ne": True}})
    if f.motivo_id:
        conds.append({"motivo_desligamento_id": None if f.motivo_id == "sem_motivo" else f.motivo_id})
    if f.q:
        rx = {"$regex": re.escape(f.q.strip()), "$options": "i"}
        conds.append({"$or": [{"nome_completo": rx}, {"matricula": rx}]})
    ini, fim = periodo(f)
    if fim:
        conds.append({"data_inclusao": {"$lte": fim}})
    if ini:
        conds.append({"$or": [{"data_desligamento": None}, {"data_desligamento": {"$gte": ini}}]})
    if f.ativo_em:
        if f.ativo_em >= today:
            conds.append({"status": "ATIVO"})
        else:
            conds.append({"data_inclusao": {"$lte": f.ativo_em}})
            conds.append({"$or": [{"status": "ATIVO"}, {"data_desligamento": {"$gt": f.ativo_em}}]})
    if f.inclusao_ini:
        conds.append({"data_inclusao": {"$gte": f.inclusao_ini}})
    if f.inclusao_fim:
        conds.append({"data_inclusao": {"$lte": f.inclusao_fim}})
    if f.deslig_ini:
        conds.append({"data_desligamento": {"$gte": f.deslig_ini}})
    if f.deslig_fim:
        conds.append({"data_desligamento": {"$lte": f.deslig_fim}})
    if f.deslig_ini or f.deslig_fim:
        conds.append({"status": "DESLIGADO"})
    if f.venc_min_dias is not None:
        conds.append({"data_vencimento_contrato": {"$gte": _add_days(today, f.venc_min_dias)}})
    if f.venc_max_dias is not None:
        conds.append({"data_vencimento_contrato": {"$lte": _add_days(today, f.venc_max_dias)}})
    if f.venc == "a_vencer":
        conds.append({"status": "ATIVO"})
        conds.append({"data_vencimento_contrato": {"$gte": today, "$lte": _add_days(today, maps.alerta_dias)}})
    elif f.venc == "vencidos":
        conds.append({"status": "ATIVO"})
        conds.append({"data_vencimento_contrato": {"$lt": today}})
    return {"$and": conds} if conds else {}


def enrich(doc: dict, maps: Maps, today: str) -> dict:
    cargo = maps.cargos.get(doc["cargo_id"], {})
    cat = cargo.get("categoria", "OUTROS")
    mot = maps.motivos.get(doc.get("motivo_desligamento_id") or "", {})
    out = {k: v for k, v in doc.items() if k != "_id"}
    out.update(
        cargo_nome=cargo.get("nome", "—"),
        categoria=cat,
        categoria_nome=maps.categoria_nome.get(cat, cat),
        lotacao_nome=maps.lotacoes.get(doc["lotacao_id"], {}).get("nome", "—"),
        edital_nome=maps.editais.get(doc["edital_id"], {}).get("nome", "—"),
        motivo_desligamento_nome=mot.get("nome"),
        sub_judice=bool(doc.get("sub_judice")),
        dias_para_vencer=dias_entre(today, doc["data_vencimento_contrato"]),
        alerta=alerta_contrato(doc, today, maps.alerta_dias),
        criado_por_nome=maps.usuarios.get(doc.get("criado_por") or "", doc.get("criado_por_nome")),
        atualizado_por_nome=maps.usuarios.get(doc.get("atualizado_por") or "", doc.get("atualizado_por_nome")),
    )
    for k in ("criado_em", "atualizado_em"):
        if isinstance(out.get(k), datetime) and out[k].tzinfo is None:
            out[k] = out[k].replace(tzinfo=timezone.utc)
    return out


AUDIT_FIELDS = [
    ("matricula", "Matrícula"),
    ("nome_completo", "Nome completo"),
    ("cargo", "Cargo"),
    ("lotacao", "Lotação"),
    ("edital", "Edital"),
    ("data_inclusao", "Data de inclusão"),
    ("data_vencimento_contrato", "Vencimento do contrato"),
    ("status", "Situação"),
    ("data_desligamento", "Data do desligamento"),
    ("motivo_desligamento", "Motivo do desligamento"),
    ("documento_desligamento", "Documento/processo"),
    ("observacoes", "Observações"),
    ("doe_incorporacao", "DOE - Incorporação"),
]


def audit_view(doc: dict | None, maps: Maps) -> dict[str, Any]:
    if not doc:
        return {}
    return {
        "Matrícula": doc.get("matricula"),
        "Nome completo": doc.get("nome_completo"),
        "Cargo": maps.cargos.get(doc.get("cargo_id") or "", {}).get("nome"),
        "Lotação": maps.lotacoes.get(doc.get("lotacao_id") or "", {}).get("nome"),
        "Edital": maps.editais.get(doc.get("edital_id") or "", {}).get("nome"),
        "Data de inclusão": doc.get("data_inclusao"),
        "Vencimento do contrato": doc.get("data_vencimento_contrato"),
        "Situação": doc.get("status"),
        "Data do desligamento": doc.get("data_desligamento"),
        "Motivo do desligamento": maps.motivos.get(doc.get("motivo_desligamento_id") or "", {}).get("nome"),
        "Documento/processo": doc.get("documento_desligamento"),
        "Observações": doc.get("observacoes"),
        "DOE - Incorporação": doc.get("doe_incorporacao"),
        "Sub judice": "Sim" if doc.get("sub_judice") else "Não",
    }


def diff(antes: dict, depois: dict) -> tuple[dict, dict]:
    a, d = {}, {}
    for k in set(antes) | set(depois):
        if (antes.get(k) or None) != (depois.get(k) or None):
            a[k], d[k] = antes.get(k), depois.get(k)
    return a, d


async def registrar_alteracao(
    entidade: str, entidade_id: str | None, operacao: str, user: dict,
    antes: dict | None = None, depois: dict | None = None, matricula: str | None = None,
) -> None:
    await db.historico_alteracoes.insert_one({
        "id": new_id(), "entidade": entidade, "entidade_id": entidade_id, "matricula": matricula,
        "operacao": operacao, "usuario_id": user["id"], "usuario_nome": user["nome"],
        "timestamp": agora(), "antes": antes, "depois": depois,
    })


async def registrar_situacao(
    militar: dict, tipo: str, data_efetiva: str, user: dict, motivo_nome: str | None = None,
    documento: str | None = None, justificativa: str | None = None, observacoes: str | None = None,
) -> None:
    await db.historico_situacao.insert_one({
        "id": new_id(), "militar_id": militar["id"], "matricula": militar["matricula"],
        "nome_completo": militar["nome_completo"], "tipo": tipo, "data_efetiva": data_efetiva,
        "motivo_nome": motivo_nome, "documento": documento, "justificativa": justificativa,
        "observacoes": observacoes, "usuario_id": user["id"], "usuario_nome": user["nome"], "timestamp": agora(),
    })


def tz_fix(doc: dict, *fields: str) -> dict:
    for k in fields:
        v = doc.get(k)
        if isinstance(v, datetime) and v.tzinfo is None:
            doc[k] = v.replace(tzinfo=timezone.utc)
    return doc
