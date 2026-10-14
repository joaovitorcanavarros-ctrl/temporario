from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.db import db
from lib.security import create_session, destroy_session, get_current_user, verify_password
from lib.militares import registrar_alteracao
from models.schemas import LoginIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_TENTATIVAS = 5


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, response: Response):
    email = body.email.strip().lower()
    desde = datetime.now(timezone.utc) - timedelta(minutes=15)
    falhas = await db.login_attempts.count_documents({"email": email, "ts": {"$gte": desde}})
    if falhas >= MAX_TENTATIVAS:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde 15 minutos e tente novamente.")
    user = await db.usuarios.find_one({"email": email})
    if not user or not user.get("ativo", True) or not verify_password(body.senha, user.get("senha_hash", "")):
        await db.login_attempts.insert_one({"email": email, "ts": datetime.now(timezone.utc)})
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    await db.login_attempts.delete_many({"email": email})
    await create_session(response, user["id"])
    await registrar_alteracao("sessao", user["id"], "LOGIN", user)
    return UserOut(**user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    await destroy_session(request, response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**user)
