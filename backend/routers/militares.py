from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from lib.db import db
from lib.export import file_response
from lib.militares import (
    Filtros, Maps, agora, audit_view, build_query, diff, enrich, hoje, load_maps,
    registrar_alteracao, registrar_situacao, tz_fix,
)
from lib.normalize import norm_matricula
from lib.security import EDITORES, get_current_user, require
from models.schemas import (
    DesligamentoIn, HistoricoAlteracao, HistoricoSituacao, MatriculaCheck, Militar, MilitarHistorico,
    MilitarIn, MilitarPage, MilitarRapidoIn, ReativacaoIn, SituacaoPage, new_id,
)

router = APIRouter(prefix="/militares", tags=["militares"])
editor = require(*EDITORES)
admin = require("ADMIN")

SORTABLE = {
    "matricula", "nome_completo", "cargo_nome", "lotacao_nome", "edital_nome", "data_inclusao",
    "data_vencimento_contrato", "status", "dias_para_vencer", "data_desligamento", "motivo_desligamento_nome",
}

EXPORT_COLS = [
    ("matricula", "Matrícula"), ("nome_completo", "Nome completo"), ("cargo_nome", "Cargo/Função"),
    ("categoria_nome", "Categoria"), ("lotacao_nome", "Lotação/UBM"), ("edital_nome", "Edital/Processo seletivo"),
    ("data_inclusao", "Data de inclusão"), ("data_vencimento_contrato", "Vencimento do contrato"),
    ("dias_para_vencer", "Dias p/ vencer"), ("status", "Situação"), ("data_desligamento", "Data do desligamento"),
    ("motivo_desligamento_nome", "Motivo do desligamento"), ("documento_desligamento", "Documento/processo"),
    ("doe_incorporacao", "DOE - Incorporação"), ("observacoes", "Observações"),
]


async def _listar(f: Filtros, sort: str, direction: str) -> list[dict]:
    maps = await load_maps()
    today = hoje()
    docs = await db.militares.find(build_query(f, maps, today), {"_id": 0}).to_list(100000)
    items = [enrich(d, maps, today) for d in docs]
    key = sort if sort in SORTABLE else "nome_completo"
    items.sort(key=lambda m: (m.get(key) is None, m.get(key) if m.get(key) is not None else ""), reverse=direction == "desc")
    return items


async def _validar_refs(body: MilitarIn | MilitarRapidoIn, maps: Maps) -> None:
    for campo, d, label in (("cargo_id", maps.cargos, "Cargo"), ("lotacao_id", maps.lotacoes, "Lotação"), ("edital_id", maps.editais, "Edital")):
        val = getattr(body, campo, None)
        if val is not None and val not in d:
            raise HTTPException(status_code=400, detail=f"{label} inexistente")
    mot = getattr(body, "motivo_desligamento_id", None)
    if mot and mot not in maps.motivos:
        raise HTTPException(status_code=400, detail="Motivo de desligamento inexistente")


def _dup_detail(existente: dict) -> dict:
    return {
        "message": f"Já existe cadastro para a matrícula {existente['matricula']} ({existente['nome_completo']}).",
        "militar_id": existente["id"],
    }


@router.get("", response_model=MilitarPage)
async def listar(
    f: Annotated[Filtros, Depends()],
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    sort: str = "nome_completo",
    direction: Literal["asc", "desc"] = "asc",
    _: dict = Depends(get_current_user),
):
    items = await _listar(f, sort, direction)
    start = (page - 1) * page_size
    return MilitarPage(items=items[start:start + page_size], total=len(items), page=page, page_size=page_size)


@router.get("/exportar")
async def exportar(
    f: Annotated[Filtros, Depends()],
    formato: Literal["csv", "xlsx"] = "csv",
    sort: str = "nome_completo",
    direction: Literal["asc", "desc"] = "asc",
    _: dict = Depends(get_current_user),
):
    items = await _listar(f, sort, direction)
    return file_response("Temporários", EXPORT_COLS, items, formato, f"temporarios_{hoje()}")


@router.get("/verificar-matricula", response_model=MatriculaCheck)
async def verificar_matricula(matricula: str, excluir_id: str | None = None, _: dict = Depends(get_current_user)):
    q: dict = {"matricula": norm_matricula(matricula)}
    if excluir_id:
        q["id"] = {"$ne": excluir_id}
    doc = await db.militares.find_one(q, {"_id": 0, "id": 1, "nome_completo": 1})
    return MatriculaCheck(existe=bool(doc), militar_id=doc and doc["id"], nome_completo=doc and doc["nome_completo"])


@router.get("/situacao", response_model=SituacaoPage)
async def historico_situacao_geral(
    tipo: str | None = None, limit: int = Query(200, ge=1, le=2000), _: dict = Depends(get_current_user)
):
    q = {"tipo": tipo} if tipo else {}
    docs = await db.historico_situacao.find(q, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    total = await db.historico_situacao.count_documents(q)
    return SituacaoPage(items=[HistoricoSituacao(**tz_fix(d, "timestamp")) for d in docs], total=total)


@router.post("", response_model=Militar)
async def criar(body: MilitarIn, user: dict = Depends(editor)):
    maps = await load_maps()
    await _validar_refs(body, maps)
    existente = await db.militares.find_one({"matricula": body.matricula}, {"_id": 0})
    if existente:
        raise HTTPException(status_code=409, detail=_dup_detail(existente))
    if body.status == "DESLIGADO" and body.data_desligamento and body.data_desligamento.isoformat() > hoje():
        raise HTTPException(status_code=400, detail="A data de desligamento não pode ser futura")
    data = body.model_dump(mode="json")
    doc = {"id": new_id(), **data, "criado_em": agora(), "atualizado_em": agora(), "criado_por": user["id"], "atualizado_por": user["id"]}
    try:
        await db.militares.insert_one(doc)
    except DuplicateKeyError:
        existente = await db.militares.find_one({"matricula": body.matricula}, {"_id": 0})
        raise HTTPException(status_code=409, detail=_dup_detail(existente or doc))
    await registrar_alteracao("militar", doc["id"], "CRIACAO", user, None, audit_view(doc, maps), doc["matricula"])
    await registrar_situacao(doc, "INCLUSAO", doc["data_inclusao"], user)
    if doc["status"] == "DESLIGADO":
        await registrar_situacao(
            doc, "DESLIGAMENTO", doc["data_desligamento"], user,
            motivo_nome=maps.motivos[doc["motivo_desligamento_id"]]["nome"], documento=doc.get("documento_desligamento"),
        )
    return Militar(**enrich(doc, maps, hoje()))


async def _get(id: str) -> dict:
    doc = await db.militares.find_one({"id": id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Militar não encontrado")
    return doc


@router.get("/{id}", response_model=Militar)
async def obter(id: str, _: dict = Depends(get_current_user)):
    doc = await _get(id)
    return Militar(**enrich(doc, await load_maps(), hoje()))


@router.put("/{id}", response_model=Militar)
async def editar(id: str, body: MilitarIn, user: dict = Depends(editor)):
    atual = await _get(id)
    maps = await load_maps()
    await _validar_refs(body, maps)
    outro = await db.militares.find_one({"matricula": body.matricula, "id": {"$ne": id}}, {"_id": 0})
    if outro:
        raise HTTPException(status_code=409, detail=_dup_detail(outro))
    if atual["status"] == "DESLIGADO" and body.status == "ATIVO":
        raise HTTPException(status_code=400, detail="Para reativar um cadastro desligado utilize a ação 'Reativar Cadastro'")
    if body.status == "DESLIGADO" and body.data_desligamento and body.data_desligamento.isoformat() > hoje():
        raise HTTPException(status_code=400, detail="A data de desligamento não pode ser futura")
    data = body.model_dump(mode="json")
    novo = {**atual, **data, "atualizado_em": agora(), "atualizado_por": user["id"]}
    antes, depois = diff(audit_view(atual, maps), audit_view(novo, maps))
    if not depois:
        return Militar(**enrich(atual, maps, hoje()))
    await db.militares.update_one({"id": id}, {"$set": {**data, "atualizado_em": novo["atualizado_em"], "atualizado_por": user["id"]}})
    await registrar_alteracao("militar", id, "EDICAO", user, antes, depois, novo["matricula"])
    if atual["status"] == "ATIVO" and novo["status"] == "DESLIGADO":
        await registrar_situacao(
            novo, "DESLIGAMENTO", novo["data_desligamento"], user,
            motivo_nome=maps.motivos[novo["motivo_desligamento_id"]]["nome"], documento=novo.get("documento_desligamento"),
        )
    return Militar(**enrich(novo, maps, hoje()))


@router.patch("/{id}/rapido", response_model=Militar)
async def edicao_rapida(id: str, body: MilitarRapidoIn, user: dict = Depends(editor)):
    atual = await _get(id)
    maps = await load_maps()
    await _validar_refs(body, maps)
    upd = body.model_dump(mode="json", exclude_unset=True)
    if "data_vencimento_contrato" in upd and upd["data_vencimento_contrato"] is None:
        upd.pop("data_vencimento_contrato")
    if upd.get("data_vencimento_contrato") and upd["data_vencimento_contrato"] < atual["data_inclusao"]:
        raise HTTPException(status_code=400, detail="O vencimento não pode ser anterior à data de inclusão")
    for k in ("lotacao_id", "edital_id"):
        if k in upd and not upd[k]:
            upd.pop(k)
    novo = {**atual, **upd}
    antes, depois = diff(audit_view(atual, maps), audit_view(novo, maps))
    if depois:
        upd.update(atualizado_em=agora(), atualizado_por=user["id"])
        await db.militares.update_one({"id": id}, {"$set": upd})
        await registrar_alteracao("militar", id, "EDICAO_RAPIDA", user, antes, depois, atual["matricula"])
    return Militar(**enrich({**novo, **upd}, maps, hoje()))


@router.post("/{id}/desligar", response_model=Militar)
async def desligar(id: str, body: DesligamentoIn, user: dict = Depends(editor)):
    atual = await _get(id)
    if atual["status"] != "ATIVO":
        raise HTTPException(status_code=400, detail="O cadastro já está desligado")
    maps = await load_maps()
    if body.motivo_id not in maps.motivos:
        raise HTTPException(status_code=400, detail="Motivo de desligamento inexistente")
    data = body.data_desligamento.isoformat()
    if data < atual["data_inclusao"]:
        raise HTTPException(status_code=400, detail="A data de desligamento não pode ser anterior à data de inclusão")
    if data > hoje():
        raise HTTPException(status_code=400, detail="A data de desligamento não pode ser futura")
    upd = {
        "status": "DESLIGADO", "data_desligamento": data, "motivo_desligamento_id": body.motivo_id,
        "documento_desligamento": body.documento or None, "atualizado_em": agora(), "atualizado_por": user["id"],
    }
    if body.observacoes:
        obs = (atual.get("observacoes") or "").strip()
        upd["observacoes"] = (obs + "\n" if obs else "") + f"[Desligamento {data}] {body.observacoes}"
    novo = {**atual, **upd}
    await db.militares.update_one({"id": id, "status": "ATIVO"}, {"$set": upd})
    antes, depois = diff(audit_view(atual, maps), audit_view(novo, maps))
    await registrar_alteracao("militar", id, "DESLIGAMENTO", user, antes, depois, atual["matricula"])
    await registrar_situacao(
        novo, "DESLIGAMENTO", data, user, motivo_nome=maps.motivos[body.motivo_id]["nome"],
        documento=body.documento, observacoes=body.observacoes,
    )
    return Militar(**enrich(novo, maps, hoje()))


@router.post("/{id}/reativar", response_model=Militar)
async def reativar(id: str, body: ReativacaoIn, user: dict = Depends(admin)):
    atual = await _get(id)
    if atual["status"] != "DESLIGADO":
        raise HTTPException(status_code=400, detail="O cadastro já está ativo")
    maps = await load_maps()
    upd: dict = {
        "status": "ATIVO", "data_desligamento": None, "motivo_desligamento_id": None, "documento_desligamento": None,
        "atualizado_em": agora(), "atualizado_por": user["id"],
    }
    if body.data_vencimento_contrato:
        v = body.data_vencimento_contrato.isoformat()
        if v < atual["data_inclusao"]:
            raise HTTPException(status_code=400, detail="O vencimento não pode ser anterior à data de inclusão")
        upd["data_vencimento_contrato"] = v
    novo = {**atual, **upd}
    await db.militares.update_one({"id": id}, {"$set": upd})
    antes, depois = diff(audit_view(atual, maps), audit_view(novo, maps))
    depois["Justificativa"] = body.justificativa
    await registrar_alteracao("militar", id, "REATIVACAO", user, antes, depois, atual["matricula"])
    await registrar_situacao(novo, "REATIVACAO", hoje(), user, documento=body.documento, justificativa=body.justificativa)
    return Militar(**enrich(novo, maps, hoje()))


@router.get("/{id}/historico", response_model=MilitarHistorico)
async def historico(id: str, _: dict = Depends(get_current_user)):
    await _get(id)
    alt = await db.historico_alteracoes.find({"entidade": "militar", "entidade_id": id}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    sit = await db.historico_situacao.find({"militar_id": id}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return MilitarHistorico(
        alteracoes=[HistoricoAlteracao(**tz_fix(a, "timestamp")) for a in alt],
        situacao=[HistoricoSituacao(**tz_fix(s, "timestamp")) for s in sit],
    )
