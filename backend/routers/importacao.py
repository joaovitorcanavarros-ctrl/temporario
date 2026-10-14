from fastapi import APIRouter, Depends, HTTPException

from lib import importer
from lib.csv_import import CAMPOS, detect_header, read_rows, suggest_mapping
from lib.security import EDITORES, require
from models.schemas import (
    CampoDef, ImportAnalisarIn, ImportAnalise, ImportResultado, ImportValidacao, ImportValidarIn,
)

router = APIRouter(prefix="/importacao", tags=["importacao"])
editor = require(*EDITORES)


@router.post("/analisar", response_model=ImportAnalise)
async def analisar(body: ImportAnalisarIn, _: dict = Depends(editor)):
    delim, rows = read_rows(body.content)
    if not rows:
        raise HTTPException(status_code=400, detail="Arquivo vazio")
    idx = detect_header(rows)
    header = rows[idx] if idx is not None else []
    mapping = suggest_mapping(header) if idx is not None else {k: None for k in CAMPOS}
    start = (idx + 1) if idx is not None else 0
    amostra = [r for r in rows[start:] if any(c.strip() for c in r)][:8]
    return ImportAnalise(
        delimitador=delim,
        linha_cabecalho=(idx + 1) if idx is not None else None,
        cabecalho=[h.replace("\n", " ").strip() for h in header],
        mapeamento=mapping,
        amostra=amostra,
        total_linhas=len(rows),
        campos=[CampoDef(key=k, label=v[0], obrigatorio=v[1]) for k, v in CAMPOS.items()],
    )


@router.post("/validar", response_model=ImportValidacao)
async def validar(body: ImportValidarIn, _: dict = Depends(editor)):
    try:
        return await importer.validar(body.content, body.linha_cabecalho, body.mapeamento)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/confirmar", response_model=ImportResultado)
async def confirmar(body: ImportValidarIn, user: dict = Depends(editor)):
    try:
        val = await importer.validar(body.content, body.linha_cabecalho, body.mapeamento)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await importer.aplicar(val, set(body.aprovar_atualizacoes), user, body.filename)
