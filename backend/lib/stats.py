"""Regras de cálculo dos indicadores — funções puras sobre registros enriquecidos.

Critérios temporais:
- Estoque (efetivo) numa data D: incluído até D e não desligado até D.
  Para D >= hoje vale a regra direta: status == ATIVO.
- Movimentações (inclusões/desligamentos) num período [ini, fim]: data do evento dentro do período.
- Contratos a vencer / vencidos: sempre em relação a HOJE (America/Cuiaba), apenas status ATIVO.
"""

from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any

MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

FAIXAS = [
    ("Vencidos", None, -1),
    ("0–30 dias", 0, 30),
    ("31–60 dias", 31, 60),
    ("61–90 dias", 61, 90),
    ("91–180 dias", 91, 180),
    ("> 180 dias", 181, None),
]


def dias_entre(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def ativo_em(m: dict, ref: str, hoje: str) -> bool:
    if ref >= hoje:
        return m["status"] == "ATIVO"
    if m["data_inclusao"] > ref:
        return False
    if m["status"] == "ATIVO":
        return True
    return bool(m.get("data_desligamento")) and m["data_desligamento"] > ref


def no_periodo(d: str | None, ini: str | None, fim: str | None) -> bool:
    if not d:
        return False
    return (ini is None or d >= ini) and (fim is None or d <= fim)


def alerta_contrato(m: dict, hoje: str, alerta_dias: int) -> str | None:
    if m["status"] != "ATIVO":
        return None
    dias = dias_entre(hoje, m["data_vencimento_contrato"])
    if dias < 0:
        return "VENCIDO"
    if dias <= alerta_dias:
        return "A_VENCER"
    return None


def _fim_mes(ano: int, mes: int) -> str:
    prox = date(ano + (mes // 12), mes % 12 + 1, 1)
    return (prox - timedelta(days=1)).isoformat()


def compute_dashboard(
    records: list[dict],
    hoje: str,
    alerta_dias: int,
    ini: str | None,
    fim: str | None,
    categorias: list[dict],
    motivos: list[dict],
) -> dict[str, Any]:
    ref = min(hoje, fim) if fim else hoje
    cat_codes = [c["codigo"] for c in categorias]
    cat_nome = {c["codigo"]: c["nome"] for c in categorias}
    mot_nome = {m["id"]: m["nome"] for m in motivos}

    ativos_ref = [m for m in records if ativo_em(m, ref, hoje)]
    ativos_hoje = [m for m in records if m["status"] == "ATIVO"]
    deslig_periodo = [m for m in records if m["status"] == "DESLIGADO" and no_periodo(m.get("data_desligamento"), ini, fim)]
    inclusoes_periodo = [m for m in records if no_periodo(m["data_inclusao"], ini, fim)]

    por_cat = Counter(m["categoria"] for m in ativos_ref)
    ubm = Counter()
    ubm_nome: dict[str, str] = {}
    for m in ativos_ref:
        ubm[m["lotacao_id"]] += 1
        ubm_nome[m["lotacao_id"]] = m["lotacao_nome"]
    por_ubm = [{"chave": k, "nome": ubm_nome[k], "total": v} for k, v in sorted(ubm.items(), key=lambda kv: (-kv[1], ubm_nome[kv[0]]))]

    edital = Counter()
    edital_nome: dict[str, str] = {}
    for m in ativos_ref:
        edital[m["edital_id"]] += 1
        edital_nome[m["edital_id"]] = m["edital_nome"]
    dist_edital = [{"chave": k, "nome": edital_nome[k], "total": v} for k, v in edital.most_common()]

    alertas = [alerta_contrato(m, hoje, alerta_dias) for m in ativos_hoje]

    # 1. efetivo por cargo e ano (estoque ao fim de cada ano, ou na data de referência)
    anos_incl = [int(m["data_inclusao"][:4]) for m in records]
    ref_ano = int(ref[:4])
    efetivo_cargo_ano = []
    if anos_incl:
        for ano in range(min(anos_incl), ref_ano + 1):
            d = min(f"{ano}-12-31", ref)
            row: dict[str, Any] = {"ano": str(ano), "data": d}
            cnt = Counter(m["categoria"] for m in records if ativo_em(m, d, hoje))
            for c in cat_codes:
                row[c] = cnt.get(c, 0)
            row["total"] = sum(cnt.values())
            efetivo_cargo_ano.append(row)

    # 2. desligamentos por ano / cargo, empilhados por motivo
    por_ano: dict[str, Counter] = defaultdict(Counter)
    por_cargo: dict[str, Counter] = defaultdict(Counter)
    tot_motivo = Counter()
    for m in deslig_periodo:
        mid = m.get("motivo_desligamento_id") or "sem_motivo"
        por_ano[m["data_desligamento"][:4]][mid] += 1
        por_cargo[m["categoria"]][mid] += 1
        tot_motivo[mid] += 1
    deslig_por_ano = [{"ano": a, **dict(c), "total": sum(c.values())} for a, c in sorted(por_ano.items())]
    deslig_por_cargo = [
        {"categoria": k, "nome": cat_nome.get(k, k), **dict(c), "total": sum(c.values())}
        for k, c in sorted(por_cargo.items(), key=lambda kv: cat_codes.index(kv[0]) if kv[0] in cat_codes else 999)
    ]
    deslig_motivos = [{"chave": k, "nome": mot_nome.get(k, "Não informado"), "total": v} for k, v in tot_motivo.most_common()]

    # 4. evolução mensal (meses do período/ano, ou últimos 12 meses) e anual
    if ini and fim:
        y0, m0 = int(ini[:4]), int(ini[5:7])
        y1, m1 = int(fim[:4]), int(fim[5:7])
    else:
        y1, m1 = int(ref[:4]), int(ref[5:7])
        y0, m0 = (y1 - 1, m1 + 1) if m1 < 12 else (y1, 1)
    meses = []
    y, mm = y0, m0
    while (y, mm) <= (y1, m1) and len(meses) < 60:
        meses.append((y, mm))
        y, mm = (y + 1, 1) if mm == 12 else (y, mm + 1)
    evolucao_mensal = []
    for y, mm in meses:
        pref = f"{y}-{mm:02d}"
        d = min(_fim_mes(y, mm), hoje)
        evolucao_mensal.append({
            "mes": pref,
            "rotulo": f"{MESES[mm - 1]}/{str(y)[2:]}",
            "inclusoes": sum(1 for m in records if m["data_inclusao"].startswith(pref)),
            "desligamentos": sum(1 for m in records if (m.get("data_desligamento") or "").startswith(pref)),
            "efetivo": sum(1 for m in records if ativo_em(m, d, hoje)) if pref <= hoje[:7] else 0,
        })
    evolucao_anual = []
    if anos_incl:
        for ano in range(min(anos_incl), int(hoje[:4]) + 1):
            d = min(f"{ano}-12-31", hoje)
            evolucao_anual.append({
                "ano": str(ano),
                "inclusoes": sum(1 for m in records if m["data_inclusao"].startswith(str(ano))),
                "desligamentos": sum(1 for m in records if (m.get("data_desligamento") or "").startswith(str(ano))),
                "efetivo": sum(1 for m in records if ativo_em(m, d, hoje)),
            })

    # 6. contratos a vencer por faixa (apenas ATIVO, relativo a hoje)
    faixas = []
    for nome, mn, mx in FAIXAS:
        total = 0
        for m in ativos_hoje:
            dias = dias_entre(hoje, m["data_vencimento_contrato"])
            if (mn is None or dias >= mn) and (mx is None or dias <= mx):
                total += 1
        faixas.append({"faixa": nome, "min": mn, "max": mx, "total": total})

    top = por_ubm[0] if por_ubm else None
    return {
        "data_hoje": hoje,
        "data_referencia": ref,
        "periodo_inicio": ini,
        "periodo_fim": fim,
        "alerta_dias": alerta_dias,
        "kpis": {
            "ativos": len(ativos_ref),
            "desligamentos_periodo": len(deslig_periodo),
            "inclusoes_periodo": len(inclusoes_periodo),
            "top_ubm_id": top["chave"] if top else None,
            "top_ubm_nome": top["nome"] if top else None,
            "top_ubm_total": top["total"] if top else 0,
            "por_categoria": {c: por_cat.get(c, 0) for c in cat_codes},
            "a_vencer": alertas.count("A_VENCER"),
            "vencidos": alertas.count("VENCIDO"),
            "sub_judice": sum(1 for m in ativos_ref if m.get("sub_judice")),
        },
        "categorias": [{"chave": c["codigo"], "nome": c["nome"], "total": por_cat.get(c["codigo"], 0)} for c in categorias],
        "motivos": [{"chave": m["id"], "nome": m["nome"], "total": tot_motivo.get(m["id"], 0)} for m in motivos],
        "efetivo_cargo_ano": efetivo_cargo_ano,
        "deslig_por_ano": deslig_por_ano,
        "deslig_por_cargo": deslig_por_cargo,
        "deslig_motivos": deslig_motivos,
        "por_ubm": por_ubm,
        "evolucao_mensal": evolucao_mensal,
        "evolucao_anual": evolucao_anual,
        "dist_categoria": [{"chave": c, "nome": cat_nome.get(c, c), "total": por_cat.get(c, 0)} for c in cat_codes if por_cat.get(c, 0)],
        "dist_edital": dist_edital,
        "faixas_vencimento": faixas,
    }
