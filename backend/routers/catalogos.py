from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.militares import hoje, load_config, registrar_alteracao, tz_fix
from lib.normalize import norm_key
from lib.security import get_current_user, require
from models.schemas import (
    Cargo, CargoIn, Catalogos, Categoria, CategoriaIn, Config, Edital, EditalIn, Lotacao, LotacaoIn,
    Meta, Motivo, MotivoIn, new_id,
)

router = APIRouter(tags=["catalogos"])

admin = require("ADMIN")

COLECOES = {
    "cargos": (CargoIn, Cargo),
    "lotacoes": (LotacaoIn, Lotacao),
    "editais": (EditalIn, Edital),
    "motivos": (MotivoIn, Motivo),
}


@router.get("/catalogos", response_model=Catalogos)
async def catalogos(_: dict = Depends(get_current_user)):
    p = {"_id": 0}
    return Catalogos(
        categorias=sorted(await db.categorias.find({}, p).to_list(500), key=lambda c: (c.get("ordem", 50), c["nome"])),
        cargos=sorted(await db.cargos.find({}, p).to_list(5000), key=lambda c: c["nome"]),
        lotacoes=sorted(await db.lotacoes.find({}, p).to_list(5000), key=lambda c: c["nome"]),
        editais=sorted(await db.editais.find({}, p).to_list(5000), key=lambda c: c["nome"]),
        motivos=sorted(await db.motivos.find({}, p).to_list(500), key=lambda c: c["nome"]),
        config=Config(**await load_config()),
    )


@router.get("/meta", response_model=Meta)
async def meta(_: dict = Depends(get_current_user)):
    last = await db.militares.find_one({}, {"_id": 0, "atualizado_em": 1}, sort=[("atualizado_em", -1)])
    total = await db.militares.count_documents({})
    return Meta(data_hoje=hoje(), ultima_atualizacao=tz_fix(last or {}, "atualizado_em").get("atualizado_em"), total_registros=total)


@router.put("/config", response_model=Config)
async def put_config(body: Config, user: dict = Depends(admin)):
    antes = await load_config()
    await db.config.update_one({"_id": "app"}, {"$set": body.model_dump()}, upsert=True)
    await registrar_alteracao("config", "app", "EDICAO", user, antes, body.model_dump())
    return body


@router.post("/categorias", response_model=Categoria)
async def criar_categoria(body: CategoriaIn, user: dict = Depends(admin)):
    if await db.categorias.find_one({"codigo": body.codigo}):
        raise HTTPException(status_code=409, detail="Já existe uma categoria com este código")
    doc = {"id": new_id(), **body.model_dump()}
    await db.categorias.insert_one(doc)
    await registrar_alteracao("categorias", doc["id"], "CRIACAO", user, None, body.model_dump())
    return Categoria(**doc)


@router.put("/categorias/{id}", response_model=Categoria)
async def editar_categoria(id: str, body: CategoriaIn, user: dict = Depends(admin)):
    atual = await db.categorias.find_one({"id": id}, {"_id": 0})
    if not atual:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    if body.codigo != atual["codigo"]:
        raise HTTPException(status_code=400, detail="O código da categoria não pode ser alterado")
    await db.categorias.update_one({"id": id}, {"$set": body.model_dump()})
    await registrar_alteracao("categorias", id, "EDICAO", user, atual, body.model_dump())
    return Categoria(id=id, **body.model_dump())


def _make_routes(nome: str, model_in, model_out):
    async def criar(body: model_in, user: dict = Depends(admin)):  # type: ignore[valid-type]
        key = norm_key(body.nome)
        if await db[nome].find_one({"key": key}):
            raise HTTPException(status_code=409, detail="Já existe um registro com este nome")
        if nome == "cargos" and not await db.categorias.find_one({"codigo": body.categoria}):
            raise HTTPException(status_code=400, detail="Categoria inexistente")
        doc = {"id": new_id(), "key": key, **body.model_dump()}
        await db[nome].insert_one(doc)
        await registrar_alteracao(nome, doc["id"], "CRIACAO", user, None, body.model_dump())
        return model_out(**doc)

    async def editar(id: str, body: model_in, user: dict = Depends(admin)):  # type: ignore[valid-type]
        atual = await db[nome].find_one({"id": id}, {"_id": 0})
        if not atual:
            raise HTTPException(status_code=404, detail="Registro não encontrado")
        key = norm_key(body.nome)
        outro = await db[nome].find_one({"key": key, "id": {"$ne": id}})
        if outro:
            raise HTTPException(status_code=409, detail="Já existe um registro com este nome")
        if nome == "cargos" and not await db.categorias.find_one({"codigo": body.categoria}):
            raise HTTPException(status_code=400, detail="Categoria inexistente")
        await db[nome].update_one({"id": id}, {"$set": {"key": key, **body.model_dump()}})
        await registrar_alteracao(nome, id, "EDICAO", user, {k: atual.get(k) for k in body.model_dump()}, body.model_dump())
        return model_out(id=id, **body.model_dump())

    router.add_api_route(f"/{nome}", criar, methods=["POST"], response_model=model_out)
    router.add_api_route(f"/{nome}/{{id}}", editar, methods=["PUT"], response_model=model_out)


for _nome, (_in, _out) in COLECOES.items():
    _make_routes(_nome, _in, _out)
