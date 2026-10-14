from typing import Annotated

from fastapi import APIRouter, Depends

from lib.db import db
from lib.militares import Filtros, build_query, enrich, hoje, load_maps, periodo
from lib.security import get_current_user
from lib.stats import compute_dashboard
from models.schemas import Dashboard

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=Dashboard)
async def dashboard(f: Annotated[Filtros, Depends()], _: dict = Depends(get_current_user)):
    maps = await load_maps()
    today = hoje()
    base = Filtros(categoria=f.categoria, cargo_id=f.cargo_id, lotacao_id=f.lotacao_id, edital_id=f.edital_id, status=f.status)
    docs = await db.militares.find(build_query(base, maps, today), {"_id": 0}).to_list(100000)
    records = [enrich(d, maps, today) for d in docs]
    ini, fim = periodo(f)
    motivos = sorted(maps.motivos.values(), key=lambda m: m["nome"])
    return compute_dashboard(records, today, maps.alerta_dias, ini, fim, maps.categorias, motivos)
