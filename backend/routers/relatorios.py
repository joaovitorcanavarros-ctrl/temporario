from collections import Counter
from dataclasses import replace
from datetime import datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException

from lib.db import db
from lib.export import file_response
from lib.militares import TZ, Filtros, build_query, descrever_filtros, enrich, hoje, load_maps, periodo
from lib.normalize import norm_matricula
from lib.security import get_current_user
from models.schemas import Coluna, Relatorio

router = APIRouter(prefix="/relatorios", tags=["relatorios"])

TIPOS = {
    "efetivo-cargo": ("Efetivo ativo por cargo", "Militares ativos na data de referência, agrupados por cargo."),
    "efetivo-ubm": ("Efetivo ativo por UBM", "Militares ativos na data de referência, agrupados por lotação."),
    "por-edital": ("Temporários por edital", "Registros que integraram o efetivo no período, por edital/processo seletivo."),
    "inclusoes": ("Inclusões por período", "Militares cuja data de inclusão está no período selecionado."),
    "a-vencer": ("Contratos a vencer", "Contratos ativos com vencimento dentro do prazo de alerta configurado."),
    "vencidos": ("Contratos vencidos pendentes de conferência", "Cadastros ativos cuja data final do vínculo já passou."),
    "desligamentos": ("Desligamentos por período e motivo", "Desligamentos com data efetiva no período selecionado."),
    "historico": ("Histórico individual por matrícula", "Inclusões, desligamentos, reativações e alterações do cadastro."),
}

LISTA_COLS = [
    ("matricula", "Matrícula"), ("nome_completo", "Nome completo"), ("cargo_nome", "Cargo"),
    ("lotacao_nome", "Lotação/UBM"), ("edital_nome", "Edital"), ("data_inclusao", "Inclusão"),
    ("data_vencimento_contrato", "Vencimento"),
]


async def _records(f: Filtros) -> list[dict]:
    maps = await load_maps()
    today = hoje()
    docs = await db.militares.find(build_query(f, maps, today), {"_id": 0}).to_list(100000)
    return sorted([enrich(d, maps, today) for d in docs], key=lambda m: m["nome_completo"])


def _grupo(records: list[dict], key: str, label: str, nome_key: str) -> tuple[list, list]:
    cnt = Counter(r[nome_key] for r in records)
    linhas = [{key: k, "total": v} for k, v in sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))]
    linhas.append({key: "TOTAL", "total": sum(cnt.values())})
    return [(key, label), ("total", "Quantidade")], linhas


async def gerar(tipo: str, f: Filtros, matricula: str | None) -> dict:
    if tipo not in TIPOS:
        raise HTTPException(status_code=404, detail="Relatório inexistente")
    maps = await load_maps()
    today = hoje()
    ini, fim = periodo(f)
    ref = min(today, fim) if fim else today
    base = replace(f, ano=None, data_inicio=None, data_fim=None)
    if tipo == "efetivo-cargo":
        recs = await _records(replace(base, ativo_em=ref))
        cnt = Counter((r["categoria_nome"], r["cargo_nome"]) for r in recs)
        cols = [("categoria", "Categoria"), ("cargo", "Cargo"), ("total", "Ativos")]
        linhas = [{"categoria": c, "cargo": n, "total": v} for (c, n), v in sorted(cnt.items())]
        linhas.append({"categoria": "TOTAL", "cargo": "", "total": len(recs)})
    elif tipo == "efetivo-ubm":
        recs = await _records(replace(base, ativo_em=ref))
        cols, linhas = _grupo(recs, "lotacao", "Lotação/UBM", "lotacao_nome")
    elif tipo == "por-edital":
        recs = await _records(f)
        agg: dict[str, Counter] = {}
        for r in recs:
            agg.setdefault(r["edital_nome"], Counter())[r["status"]] += 1
        cols = [("edital", "Edital/Processo seletivo"), ("ativos", "Ativos"), ("desligados", "Desligados"), ("total", "Total")]
        linhas = [{"edital": k, "ativos": c["ATIVO"], "desligados": c["DESLIGADO"], "total": c.total()} for k, c in sorted(agg.items())]
    elif tipo == "inclusoes":
        recs = await _records(replace(base, inclusao_ini=ini, inclusao_fim=fim))
        recs.sort(key=lambda r: (r["data_inclusao"], r["nome_completo"]))
        cols, linhas = LISTA_COLS + [("status", "Situação")], recs
    elif tipo in ("a-vencer", "vencidos"):
        recs = await _records(replace(base, venc="a_vencer" if tipo == "a-vencer" else "vencidos"))
        recs.sort(key=lambda r: r["data_vencimento_contrato"])
        cols, linhas = LISTA_COLS + [("dias_para_vencer", "Dias p/ vencer")], recs
    elif tipo == "desligamentos":
        recs = await _records(replace(base, deslig_ini=ini, deslig_fim=fim, status="DESLIGADO"))
        recs.sort(key=lambda r: r["data_desligamento"] or "", reverse=True)
        cols = LISTA_COLS[:5] + [
            ("data_desligamento", "Data do desligamento"), ("motivo_desligamento_nome", "Motivo"),
            ("documento_desligamento", "Documento/processo"),
        ]
        linhas = recs
    else:
        if not matricula:
            raise HTTPException(status_code=400, detail="Informe a matrícula")
        mil = await db.militares.find_one({"matricula": norm_matricula(matricula)}, {"_id": 0})
        if not mil:
            raise HTTPException(status_code=404, detail="Matrícula não encontrada")
        sit = await db.historico_situacao.find({"militar_id": mil["id"]}, {"_id": 0}).to_list(1000)
        alt = await db.historico_alteracoes.find({"entidade": "militar", "entidade_id": mil["id"]}, {"_id": 0}).to_list(1000)
        cols = [("quando", "Data/hora do registro"), ("evento", "Evento"), ("data_efetiva", "Data efetiva"), ("detalhes", "Detalhes"), ("usuario", "Usuário")]
        linhas = []
        for s in sit:
            det = "; ".join(x for x in (s.get("motivo_nome"), s.get("documento"), s.get("justificativa"), s.get("observacoes")) if x)
            linhas.append({"ts": s["timestamp"], "evento": s["tipo"], "data_efetiva": s["data_efetiva"], "detalhes": det, "usuario": s["usuario_nome"]})
        for a in alt:
            mud = "; ".join(f"{k}: {(a.get('antes') or {}).get(k) or '—'} → {v or '—'}" for k, v in (a.get("depois") or {}).items())
            linhas.append({"ts": a["timestamp"], "evento": a["operacao"], "data_efetiva": None, "detalhes": mud[:1500], "usuario": a["usuario_nome"]})
        linhas.sort(key=lambda li: li["ts"], reverse=True)
        for li in linhas:
            ts = li.pop("ts")
            li["quando"] = ts.replace(tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo(TZ)).strftime("%d/%m/%Y %H:%M") if isinstance(ts, datetime) else str(ts)
        titulo, desc = TIPOS[tipo]
        return {
            "tipo": tipo, "titulo": f"{titulo} — {mil['matricula']} {mil['nome_completo']}", "descricao": desc,
            "colunas": [{"key": k, "label": v} for k, v in cols], "linhas": linhas,
            "gerado_em": datetime.now(ZoneInfo(TZ)).strftime("%d/%m/%Y %H:%M"), "filtros": f"Matrícula: {mil['matricula']}",
        }
    titulo, desc = TIPOS[tipo]
    keys = [k for k, _ in cols]
    return {
        "tipo": tipo, "titulo": titulo, "descricao": f"{desc} Data de referência: {ref[8:]}/{ref[5:7]}/{ref[:4]}.",
        "colunas": [{"key": k, "label": v} for k, v in cols],
        "linhas": [{k: li.get(k) for k in keys} for li in linhas],
        "gerado_em": datetime.now(ZoneInfo(TZ)).strftime("%d/%m/%Y %H:%M"),
        "filtros": descrever_filtros(f, maps),
    }


@router.get("/{tipo}", response_model=Relatorio)
async def relatorio(tipo: str, f: Annotated[Filtros, Depends()], matricula: str | None = None, _: dict = Depends(get_current_user)):
    return await gerar(tipo, f, matricula)


@router.get("/{tipo}/exportar")
async def exportar(
    tipo: str, f: Annotated[Filtros, Depends()], formato: Literal["csv", "xlsx"] = "csv",
    matricula: str | None = None, _: dict = Depends(get_current_user),
):
    rel = await gerar(tipo, f, matricula)
    return file_response(rel["titulo"], [(c["key"], c["label"]) for c in rel["colunas"]], rel["linhas"], formato, f"relatorio_{tipo}_{hoje()}")


_ = (Coluna,)
