"""Testes das regras de negócio puras: normalização, leitura de CSV e cálculo de indicadores."""

from lib.csv_import import detect_header, extract_records, read_rows, suggest_mapping
from lib.normalize import guess_categoria, norm_key, parse_date
from lib.stats import alerta_contrato, ativo_em, compute_dashboard

CATS = [{"codigo": "AUXILIAR", "nome": "Auxiliares"}, {"codigo": "MEDICO", "nome": "Médicos"}]
MOTIVOS = [{"id": "m1", "nome": "Desistência"}]


def rec(**kw):
    base = {
        "categoria": "AUXILIAR", "lotacao_id": "l1", "lotacao_nome": "1º BBM", "edital_id": "e1", "edital_nome": "ED 1",
        "data_inclusao": "2025-01-10", "data_vencimento_contrato": "2027-01-09", "status": "ATIVO",
        "data_desligamento": None, "motivo_desligamento_id": None,
    }
    base.update(kw)
    return base


def test_norm_key_equivale_simbolos():
    assert norm_key("EDITAL N° 004/DGP") == norm_key("Edital Nº 004/DGP")
    assert norm_key("  DSAU - CUIABÁ ") == "DSAU CUIABA"


def test_parse_date():
    assert parse_date("29/04/2025") == "2025-04-29"
    assert parse_date("") is None
    try:
        parse_date("31/02/2025")
        raise AssertionError("deveria falhar")
    except ValueError:
        pass


def test_guess_categoria():
    assert guess_categoria("SD BM AUXILIAR") == "AUXILIAR"
    assert guess_categoria("SD BM SAÚDE DE SEGUNDA CLASSE") == "TEC_ENFERMAGEM"
    assert guess_categoria("SD BM DE SAUDE DE PRIMEIRA CLASSE") == "ENFERMEIRO"
    assert guess_categoria("OFICIAL MÉDICO BM") == "MEDICO"
    assert guess_categoria("ANALISTA") == "OUTROS"


def test_csv_com_linhas_decorativas():
    content = (
        ",,QUADRO DE PRAÇA,,,\n"
        ",,\"Nº\nORD\",VÍNCULO,CARGO,NOME,LOTAÇÃO,PROCESSO SELETIVO,\"DATA\nINCLUSÃO\",DATA FINAL VINCULO,OBSERVAÇÃO\n"
        ",📊 VISÃO GERAL,1,111/01,SD BM AUXILIAR,FULANO,1º BBM,EDITAL 1,01/01/2026,31/12/2026,\n"
        ",,,,,,,,,,\n"
    )
    _, rows = read_rows(content)
    idx = detect_header(rows)
    assert idx == 1
    m = suggest_mapping(rows[idx])
    assert m["matricula"] == 3 and m["data_inclusao"] == 8 and m["data_vencimento_contrato"] == 9
    recs = extract_records(rows, idx, m)
    assert len(recs) == 1 and recs[0][1]["nome_completo"] == "FULANO"


def test_csv_ponto_e_virgula():
    content = "VÍNCULO;NOME;CARGO;LOTAÇÃO;EDITAL\n1/01;A;B;C;D\n"
    delim, rows = read_rows(content)
    assert delim == ";" and detect_header(rows) == 0


def test_ativo_em_historico():
    m = rec(status="DESLIGADO", data_desligamento="2026-03-01")
    assert ativo_em(m, "2026-02-28", "2026-10-14") is True
    assert ativo_em(m, "2026-03-01", "2026-10-14") is False
    assert ativo_em(m, "2026-10-14", "2026-10-14") is False
    assert ativo_em(rec(), "2024-12-31", "2026-10-14") is False


def test_alerta_contrato():
    assert alerta_contrato(rec(data_vencimento_contrato="2026-10-01"), "2026-10-14", 30) == "VENCIDO"
    assert alerta_contrato(rec(data_vencimento_contrato="2026-11-01"), "2026-10-14", 30) == "A_VENCER"
    assert alerta_contrato(rec(data_vencimento_contrato="2027-11-01"), "2026-10-14", 30) is None
    assert alerta_contrato(rec(status="DESLIGADO", data_vencimento_contrato="2026-10-01"), "2026-10-14", 30) is None


def test_dashboard_contagens():
    hoje = "2026-10-14"
    records = [
        rec(),
        rec(categoria="MEDICO", lotacao_id="l2", lotacao_nome="DSAU"),
        rec(status="DESLIGADO", data_desligamento="2026-05-10", motivo_desligamento_id="m1"),
        rec(data_vencimento_contrato="2026-10-01"),  # vencido, ainda ativo
        rec(data_vencimento_contrato="2026-10-20"),  # a vencer
    ]
    d = compute_dashboard(records, hoje, 30, None, None, CATS, MOTIVOS)
    k = d["kpis"]
    assert k["ativos"] == 4  # desligado não conta
    assert k["desligamentos_periodo"] == 1
    assert k["por_categoria"] == {"AUXILIAR": 3, "MEDICO": 1}
    assert k["vencidos"] == 1 and k["a_vencer"] == 1
    assert k["top_ubm_nome"] == "1º BBM" and k["top_ubm_total"] == 3
    assert sum(f["total"] for f in d["faixas_vencimento"]) == 4
    # período sem desligamentos
    d2 = compute_dashboard(records, hoje, 30, "2025-01-01", "2025-12-31", CATS, MOTIVOS)
    assert d2["kpis"]["desligamentos_periodo"] == 0
    assert d2["kpis"]["ativos"] == 5  # estoque em 31/12/2025: o desligado ainda estava ativo
