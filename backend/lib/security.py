"""Autenticação por sessão (cookie httpOnly), hash de senha PBKDF2 e controle de perfis."""

import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response

from lib.db import db

SESSION_COOKIE = "cbmmt_session"
SESSION_HOURS = int(os.environ.get("SESSION_HOURS", "10"))
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() == "true"
ITERATIONS = 260_000

PERFIS = ("ADMIN", "GESTOR", "CONSULTA")
EDITORES = ("ADMIN", "GESTOR")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, it, salt, dk = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(it))
        return hmac.compare_digest(calc.hex(), dk)
    except (ValueError, AttributeError):
        return False


def senha_valida(password: str) -> bool:
    return len(password) >= 8 and bool(re.search(r"[A-Za-z]", password)) and bool(re.search(r"\d", password))


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(response: Response, user_id: str) -> None:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)
    await db.sessions.insert_one({"token_hash": _token_hash(token), "user_id": user_id, "expires_at": expires})
    response.set_cookie(
        SESSION_COOKIE, token, httponly=True, secure=COOKIE_SECURE, samesite="lax",
        max_age=SESSION_HOURS * 3600, path="/",
    )


async def destroy_session(request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await db.sessions.delete_one({"token_hash": _token_hash(token)})
    response.delete_cookie(SESSION_COOKIE, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    sess = await db.sessions.find_one({"token_hash": _token_hash(token)})
    if not sess:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    exp = sess["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        await db.sessions.delete_one({"_id": sess["_id"]})
        raise HTTPException(status_code=401, detail="Sessão expirada")
    user = await db.usuarios.find_one({"id": sess["user_id"]}, {"_id": 0, "senha_hash": 0})
    if not user or not user.get("ativo", True):
        raise HTTPException(status_code=401, detail="Usuário inativo")
    return user


def require(*perfis: str):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["perfil"] not in perfis:
            raise HTTPException(status_code=403, detail="Seu perfil não tem permissão para esta operação")
        return user

    return dep
