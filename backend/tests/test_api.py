"""Testes de API (servidor ativo): cadastro, duplicidade, edição com histórico, desligamento,
reativação e permissões por perfil. Requer `python seed.py` executado."""

import uuid

import httpx
import pytest

from tests.conftest import api_url  # noqa: F401  (garante BACKEND_URL)

BASE = __import__("os").environ.get("BACKEND_URL", "http://localhost:8001") + "/api"


def login(email: str, senha: str) -> httpx.Client:
    c = httpx.Client(base_url=BASE, timeout=30)
    r = c.post("/auth/login", json={"email": email, "senha": senha})
    assert r.status_code == 200, r.text
    # o cookie é "secure" (HTTPS); em testes via http://localhost reenviamos o valor manualmente
    token = r.cookies.get("cbmmt_session")
    c.cookies.clear()
    c.cookies.set("cbmmt_session", token)
    return c


def limpar(militar_id: str) -> None:
    """Remove fisicamente o registro de TESTE para não poluir os indicadores reais."""
    import os
    from dotenv import load_dotenv
    from pymongo import MongoClient
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    db.militares.delete_one({"id": militar_id})
    db.historico_situacao.delete_many({"militar_id": militar_id})
    db.historico_alteracoes.delete_many({"entidade_id": militar_id})


@pytest.fixture(scope="module")
def gestor():
    return login("gestor@cbmmt.mt.gov.br", "Gestor@2026")


@pytest.fixture(scope="module")
def admin():
    return login("admin@cbmmt.mt.gov.br", "Admin@2026")


@pytest.fixture(scope="module")
def consulta():
    return login("consulta@cbmmt.mt.gov.br", "Consulta@2026")


def novo_body(c: httpx.Client) -> dict:
    cat = c.get("/catalogos").json()
    return {
        "matricula": f"TESTE-{uuid.uuid4().hex[:8].upper()}", "nome_completo": "Teste Automatizado",
        "cargo_id": cat["cargos"][0]["id"], "lotacao_id": cat["lotacoes"][0]["id"], "edital_id": cat["editais"][0]["id"],
        "data_inclusao": "2026-01-01", "data_vencimento_contrato": "2026-12-31", "status": "ATIVO",
    }


def test_sem_login_401():
    assert httpx.get(f"{BASE}/militares").status_code == 401


def test_fluxo_completo(gestor, admin):
    ativos0 = gestor.get("/dashboard").json()["kpis"]["ativos"]
    body = novo_body(gestor)
    r = gestor.post("/militares", json=body)
    assert r.status_code == 200, r.text
    m = r.json()
    assert gestor.get("/dashboard").json()["kpis"]["ativos"] == ativos0 + 1
    assert gestor.get("/militares", params={"q": body["matricula"]}).json()["total"] == 1

    dup = gestor.post("/militares", json=body)
    assert dup.status_code == 409 and dup.json()["detail"]["militar_id"] == m["id"]

    r = gestor.put(f"/militares/{m['id']}", json={**body, "observacoes": "editado"})
    assert r.status_code == 200
    hist = gestor.get(f"/militares/{m['id']}/historico").json()
    assert any(a["operacao"] == "EDICAO" for a in hist["alteracoes"])

    motivo = gestor.get("/catalogos").json()["motivos"][0]["id"]
    r = gestor.post(f"/militares/{m['id']}/desligar", json={"data_desligamento": "2026-02-01", "motivo_id": motivo})
    assert r.status_code == 200 and r.json()["status"] == "DESLIGADO"
    assert gestor.get(f"/militares/{m['id']}").status_code == 200  # não excluído
    assert gestor.get("/dashboard").json()["kpis"]["ativos"] == ativos0

    assert gestor.post(f"/militares/{m['id']}/reativar", json={"justificativa": "Decisão administrativa X"}).status_code == 403
    r = admin.post(f"/militares/{m['id']}/reativar", json={"justificativa": "Decisão administrativa X"})
    assert r.status_code == 200 and r.json()["status"] == "ATIVO"
    tipos = {s["tipo"] for s in gestor.get(f"/militares/{m['id']}/historico").json()["situacao"]}
    assert tipos == {"INCLUSAO", "DESLIGAMENTO", "REATIVACAO"}
    limpar(m["id"])


def test_datas_invalidas(gestor):
    body = {**novo_body(gestor), "data_vencimento_contrato": "2025-01-01"}
    assert gestor.post("/militares", json=body).status_code == 422


def test_consulta_nao_altera(consulta):
    assert consulta.post("/militares", json={}).status_code in (403, 422)
    body = novo_body(consulta)
    assert consulta.post("/militares", json=body).status_code == 403
    assert consulta.get("/usuarios").status_code == 403
    assert consulta.get("/dashboard").status_code == 200
