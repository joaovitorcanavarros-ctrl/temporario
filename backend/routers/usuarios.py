from fastapi import APIRouter, Depends, HTTPException, Query

from lib.db import db
from lib.militares import tz_fix
from lib.security import hash_password, require, senha_valida
from lib.militares import registrar_alteracao
from models.schemas import AuditoriaPage, HistoricoAlteracao, UserOut, UsuarioIn, new_id

router = APIRouter(tags=["usuarios"])
admin = require("ADMIN")


@router.get("/usuarios", response_model=list[UserOut])
async def listar(_: dict = Depends(admin)):
    return await db.usuarios.find({}, {"_id": 0, "senha_hash": 0}).sort("nome", 1).to_list(5000)


@router.post("/usuarios", response_model=UserOut)
async def criar(body: UsuarioIn, user: dict = Depends(admin)):
    if not body.senha or not senha_valida(body.senha):
        raise HTTPException(status_code=400, detail="A senha deve ter ao menos 8 caracteres, com letras e números")
    if await db.usuarios.find_one({"email": body.email}):
        raise HTTPException(status_code=409, detail="Já existe um usuário com este e-mail")
    doc = {"id": new_id(), **body.model_dump(exclude={"senha"}), "senha_hash": hash_password(body.senha)}
    await db.usuarios.insert_one(doc)
    await registrar_alteracao("usuario", doc["id"], "CRIACAO", user, None, body.model_dump(exclude={"senha"}))
    return UserOut(**doc)


@router.put("/usuarios/{id}", response_model=UserOut)
async def editar(id: str, body: UsuarioIn, user: dict = Depends(admin)):
    atual = await db.usuarios.find_one({"id": id}, {"_id": 0, "senha_hash": 0})
    if not atual:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if await db.usuarios.find_one({"email": body.email, "id": {"$ne": id}}):
        raise HTTPException(status_code=409, detail="Já existe um usuário com este e-mail")
    if id == user["id"] and (body.perfil != "ADMIN" or not body.ativo):
        raise HTTPException(status_code=400, detail="Você não pode remover seu próprio perfil de administrador")
    upd = body.model_dump(exclude={"senha"})
    if body.senha:
        if not senha_valida(body.senha):
            raise HTTPException(status_code=400, detail="A senha deve ter ao menos 8 caracteres, com letras e números")
        upd["senha_hash"] = hash_password(body.senha)
    await db.usuarios.update_one({"id": id}, {"$set": upd})
    if not body.ativo or body.senha:
        await db.sessions.delete_many({"user_id": id})
    depois = body.model_dump(exclude={"senha"}) | ({"senha": "alterada"} if body.senha else {})
    await registrar_alteracao("usuario", id, "EDICAO", user, {k: atual.get(k) for k in upd if k != "senha_hash"}, depois)
    return UserOut(id=id, **body.model_dump(exclude={"senha"}))


@router.get("/auditoria", response_model=AuditoriaPage)
async def auditoria(
    entidade: str | None = None, limit: int = Query(200, ge=1, le=2000), _: dict = Depends(admin)
):
    q = {"entidade": entidade} if entidade else {}
    docs = await db.historico_alteracoes.find(q, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    total = await db.historico_alteracoes.count_documents(q)
    return AuditoriaPage(items=[HistoricoAlteracao(**tz_fix(d, "timestamp")) for d in docs], total=total)
