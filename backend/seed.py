"""Carga inicial idempotente: categorias, motivos, configuração, usuários de demonstração
e importação dos CSVs oficiais em backend/data (registros entram como ATIVO).

Uso: cd /app/backend && python seed.py
"""

import asyncio
import os
from pathlib import Path

from lib.csv_import import decode_bytes, detect_header, read_rows, suggest_mapping
from lib.db import db, ensure_indexes
from lib.importer import aplicar, validar
from lib.normalize import CATEGORIAS_PADRAO, norm_key
from lib.security import hash_password
from models.schemas import new_id

MOTIVOS = ["Desistência", "Encerramento do contrato", "Desligamento administrativo", "Rescisão ou distrato", "Outra situação"]

USUARIOS = [
    ("Administrador do Sistema", "admin@cbmmt.mt.gov.br", "ADMIN", os.environ.get("SEED_ADMIN_PASSWORD", "Admin@2026")),
    ("Gestor de Pessoal", "gestor@cbmmt.mt.gov.br", "GESTOR", os.environ.get("SEED_GESTOR_PASSWORD", "Gestor@2026")),
    ("Usuário Consulta", "consulta@cbmmt.mt.gov.br", "CONSULTA", os.environ.get("SEED_CONSULTA_PASSWORD", "Consulta@2026")),
]

DATA_DIR = Path(__file__).parent / "data"


async def main() -> None:
    await ensure_indexes()
    for codigo, nome, ordem in CATEGORIAS_PADRAO:
        if not await db.categorias.find_one({"codigo": codigo}):
            await db.categorias.insert_one({"id": new_id(), "codigo": codigo, "nome": nome, "ordem": ordem, "ativo": True})
    for nome in MOTIVOS:
        if not await db.motivos.find_one({"key": norm_key(nome)}):
            await db.motivos.insert_one({"id": new_id(), "nome": nome, "key": norm_key(nome), "ativo": True})
    await db.config.update_one({"_id": "app"}, {"$setOnInsert": {"alerta_dias": 30}}, upsert=True)
    for nome, email, perfil, senha in USUARIOS:
        if not await db.usuarios.find_one({"email": email}):
            await db.usuarios.insert_one({"id": new_id(), "nome": nome, "email": email, "perfil": perfil, "ativo": True, "senha_hash": hash_password(senha)})
    admin = await db.usuarios.find_one({"email": USUARIOS[0][1]})
    if await db.militares.count_documents({}) == 0:
        for path in sorted(DATA_DIR.glob("*.csv")):
            content = decode_bytes(path.read_bytes())
            _, rows = read_rows(content)
            idx = detect_header(rows)
            if idx is None:
                print(f"{path.name}: cabeçalho não encontrado")
                continue
            val = await validar(content, idx + 1, suggest_mapping(rows[idx]))
            res = await aplicar(val, set(), admin, f"Carga inicial — {path.name}")
            print(path.name, res)
            for li in val["linhas"]:
                if li["acao"] == "REJEITAR":
                    print("  rejeitado linha", li["linha"], li["erros"])
    print("militares:", await db.militares.count_documents({}))


if __name__ == "__main__":
    asyncio.run(main())
