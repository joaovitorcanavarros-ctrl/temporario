"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)


def _uid() -> IndexModel:
    return IndexModel([("id", ASCENDING)], name="id", unique=True)


def _ukey() -> IndexModel:
    return IndexModel([("key", ASCENDING)], name="key", unique=True)


# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "militares": [
        _uid(),
        IndexModel([("matricula", ASCENDING)], name="matricula", unique=True),
        IndexModel([("status", ASCENDING), ("data_vencimento_contrato", ASCENDING)], name="status_venc"),
        IndexModel([("cargo_id", ASCENDING)], name="cargo"),
        IndexModel([("lotacao_id", ASCENDING)], name="lotacao"),
        IndexModel([("edital_id", ASCENDING)], name="edital"),
        IndexModel([("data_desligamento", ASCENDING)], name="deslig"),
        IndexModel([("atualizado_em", DESCENDING)], name="atualizado"),
    ],
    "cargos": [_uid(), _ukey()],
    "lotacoes": [_uid(), _ukey()],
    "editais": [_uid(), _ukey()],
    "motivos": [_uid(), _ukey()],
    "categorias": [_uid(), IndexModel([("codigo", ASCENDING)], name="codigo", unique=True)],
    "usuarios": [_uid(), IndexModel([("email", ASCENDING)], name="email", unique=True)],
    "sessions": [
        IndexModel([("token_hash", ASCENDING)], name="token", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "historico_alteracoes": [
        _uid(),
        IndexModel([("entidade_id", ASCENDING), ("timestamp", DESCENDING)], name="entidade_ts"),
        IndexModel([("timestamp", DESCENDING)], name="ts"),
    ],
    "historico_situacao": [
        _uid(),
        IndexModel([("militar_id", ASCENDING), ("timestamp", DESCENDING)], name="militar_ts"),
        IndexModel([("tipo", ASCENDING), ("data_efetiva", DESCENDING)], name="tipo_data"),
    ],
    "login_attempts": [
        IndexModel([("email", ASCENDING)], name="email"),
        IndexModel([("ts", ASCENDING)], name="ttl", expireAfterSeconds=900),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
