"""Validação e aplicação de importações CSV (compartilhado pela rota e pelo seed)."""

from typing import Any

from lib.csv_import import CAMPOS, extract_records, read_rows
from lib.db import db
from lib.militares import Maps, agora, audit_view, diff, hoje, load_maps, registrar_alteracao, registrar_situacao
from lib.normalize import guess_ano, guess_categoria, norm_key, norm_matricula, parse_date
from models.schemas import new_id

OBRIGATORIOS = [k for k, (_, req, _) in CAMPOS.items() if req]
COMPARAVEIS = ["nome_completo", "cargo", "lotacao", "edital", "data_inclusao", "data_vencimento_contrato", "observacoes", "doe_incorporacao"]


def _key_map(items: dict[str, dict]) -> dict[str, dict]:
    return {c.get("key") or norm_key(c["nome"]): c for c in items.values()}


async def validar(content: str, linha_cabecalho: int, mapeamento: dict[str, int | None]) -> dict[str, Any]:
    _, rows = read_rows(content)
    header_idx = linha_cabecalho - 1
    if header_idx >= len(rows):
        raise ValueError("linha de cabeçalho fora do arquivo")
    faltando = [CAMPOS[c][0] for c in OBRIGATORIOS if mapeamento.get(c) is None]
    if faltando:
        raise ValueError("mapeie as colunas obrigatórias: " + ", ".join(faltando))

    maps = await load_maps()
    cargos_k, lot_k, ed_k = _key_map(maps.cargos), _key_map(maps.lotacoes), _key_map(maps.editais)
    existentes = {m["matricula"]: m for m in await db.militares.find({}, {"_id": 0}).to_list(100000)}

    novos_cargos: dict[str, str] = {}
    novas_lot: dict[str, str] = {}
    novos_ed: dict[str, str] = {}
    vistos: dict[str, int] = {}
    linhas = []
    for num, rec in extract_records(rows, header_idx, mapeamento):
        erros: list[str] = []
        avisos: list[str] = []
        rec["matricula"] = norm_matricula(rec.get("matricula"))
        rec["nome_completo"] = (rec.get("nome_completo") or "").upper()
        for c in OBRIGATORIOS:
            if not rec.get(c):
                erros.append(f"{CAMPOS[c][0]} não informado(a)")
        datas: dict[str, str | None] = {}
        for c in ("data_inclusao", "data_vencimento_contrato"):
            try:
                datas[c] = parse_date(rec.get(c))
            except ValueError as exc:
                erros.append(f"{CAMPOS[c][0]}: {exc}")
                datas[c] = None
        if datas.get("data_inclusao") and datas.get("data_vencimento_contrato") and datas["data_vencimento_contrato"] < datas["data_inclusao"]:
            erros.append("vencimento do contrato anterior à data de inclusão")
        st = norm_key(rec.get("status"))
        if st and st not in ("ATIVO", "ATIVA"):
            erros.append("situação diferente de ATIVO — desligamentos devem ser registrados pelo fluxo de desligamento")
        if rec["matricula"]:
            if rec["matricula"] in vistos:
                erros.append(f"matrícula duplicada no arquivo (também na linha {vistos[rec['matricula']]})")
            else:
                vistos[rec["matricula"]] = num
        for campo, kmap, novos in (("cargo", cargos_k, novos_cargos), ("lotacao", lot_k, novas_lot), ("edital", ed_k, novos_ed)):
            v = rec.get(campo)
            if v and norm_key(v) not in kmap:
                novos.setdefault(norm_key(v), v)
                avisos.append(f"{CAMPOS[campo][0]} novo será cadastrado: {v}")
        rec.update({k: v or "" for k, v in datas.items()})

        diferencas = []
        acao = "INSERIR"
        if erros:
            acao = "REJEITAR"
        elif rec["matricula"] in existentes:
            atual = existentes[rec["matricula"]]
            atual_view = {
                "nome_completo": atual["nome_completo"],
                "cargo": maps.cargos.get(atual["cargo_id"], {}).get("nome", ""),
                "lotacao": maps.lotacoes.get(atual["lotacao_id"], {}).get("nome", ""),
                "edital": maps.editais.get(atual["edital_id"], {}).get("nome", ""),
                "data_inclusao": atual["data_inclusao"],
                "data_vencimento_contrato": atual["data_vencimento_contrato"],
                "observacoes": atual.get("observacoes") or "",
                "doe_incorporacao": atual.get("doe_incorporacao") or "",
            }
            for c in COMPARAVEIS:
                novo = rec.get(c) or ""
                if not novo:
                    continue
                cmp = (norm_key(novo) != norm_key(atual_view[c])) if c in ("cargo", "lotacao", "edital") else (novo != atual_view[c])
                if cmp:
                    diferencas.append({"campo": CAMPOS[c][0], "atual": atual_view[c] or None, "novo": novo})
            acao = "ATUALIZAR" if diferencas else "IGNORAR"
            if acao == "IGNORAR":
                avisos.append("matrícula já cadastrada com os mesmos dados")
            if atual["status"] == "DESLIGADO":
                avisos.append("cadastro existente está DESLIGADO — a situação não será alterada pela importação")
        linhas.append({
            "linha": num, "matricula": rec["matricula"], "nome_completo": rec["nome_completo"], "acao": acao,
            "erros": erros, "avisos": avisos, "diferencas": diferencas, "dados": rec,
        })
    resumo = {k: sum(1 for li in linhas if li["acao"] == v) for k, v in
              (("inserir", "INSERIR"), ("atualizar", "ATUALIZAR"), ("ignorar", "IGNORAR"), ("rejeitar", "REJEITAR"))}
    return {
        "linhas": linhas, "resumo": resumo,
        "novos_cargos": sorted(novos_cargos.values()),
        "novas_lotacoes": sorted(novas_lot.values()),
        "novos_editais": sorted(novos_ed.values()),
    }


async def _resolve(coll: str, nome: str, maps_dict: dict[str, dict], user: dict, extra: dict) -> str:
    key = norm_key(nome)
    for c in maps_dict.values():
        if (c.get("key") or norm_key(c["nome"])) == key:
            return c["id"]
    doc = {"id": new_id(), "nome": nome, "key": key, "ativo": True, **extra}
    await db[coll].insert_one(doc)
    doc.pop("_id", None)
    maps_dict[doc["id"]] = doc
    await registrar_alteracao(coll, doc["id"], "CRIACAO_VIA_IMPORTACAO", user, None, {"Nome": nome})
    return doc["id"]


async def aplicar(validacao: dict[str, Any], aprovar: set[str], user: dict, origem: str) -> dict[str, int]:
    maps: Maps = await load_maps()
    res = {"inseridos": 0, "atualizados": 0, "ignorados": 0, "rejeitados": 0, "atualizacoes_nao_aprovadas": 0}
    today = hoje()
    for li in validacao["linhas"]:
        acao, rec = li["acao"], li["dados"]
        if acao == "REJEITAR":
            res["rejeitados"] += 1
            continue
        if acao == "IGNORAR":
            res["ignorados"] += 1
            continue
        if acao == "ATUALIZAR" and rec["matricula"] not in aprovar:
            res["ignorados"] += 1
            res["atualizacoes_nao_aprovadas"] += 1
            continue
        cargo_id = await _resolve("cargos", rec["cargo"], maps.cargos, user, {"categoria": guess_categoria(rec["cargo"])})
        lot_id = await _resolve("lotacoes", rec["lotacao"], maps.lotacoes, user, {"tipo": "UBM"})
        ed_id = await _resolve("editais", rec["edital"], maps.editais, user, {"ano": guess_ano(rec["edital"]), "descricao": None})
        campos = {
            "nome_completo": rec["nome_completo"], "cargo_id": cargo_id, "lotacao_id": lot_id, "edital_id": ed_id,
            "data_inclusao": rec["data_inclusao"], "data_vencimento_contrato": rec["data_vencimento_contrato"],
        }
        if rec.get("observacoes"):
            campos["observacoes"] = rec["observacoes"]
        if rec.get("doe_incorporacao"):
            campos["doe_incorporacao"] = rec["doe_incorporacao"]
        if acao == "INSERIR":
            doc = {
                "id": new_id(), "matricula": rec["matricula"], **campos, "status": "ATIVO",
                "observacoes": campos.get("observacoes"), "doe_incorporacao": campos.get("doe_incorporacao"),
                "sub_judice": "SUB JUDICE" in norm_key(rec["nome_completo"]),
                "data_desligamento": None, "motivo_desligamento_id": None, "documento_desligamento": None,
                "criado_em": agora(), "atualizado_em": agora(), "criado_por": user["id"], "atualizado_por": user["id"],
            }
            await db.militares.insert_one(doc)
            await registrar_alteracao("militar", doc["id"], "IMPORTACAO_INCLUSAO", user, None, audit_view(doc, maps), doc["matricula"])
            await registrar_situacao(doc, "INCLUSAO", doc["data_inclusao"], user, observacoes=f"Importação: {origem}")
            res["inseridos"] += 1
        else:
            atual = await db.militares.find_one({"matricula": rec["matricula"]}, {"_id": 0})
            if not atual:
                res["rejeitados"] += 1
                continue
            novo = {**atual, **campos}
            antes, depois = diff(audit_view(atual, maps), audit_view(novo, maps))
            await db.militares.update_one(
                {"id": atual["id"]}, {"$set": {**campos, "atualizado_em": agora(), "atualizado_por": user["id"]}}
            )
            await registrar_alteracao("militar", atual["id"], "IMPORTACAO_ATUALIZACAO", user, antes, depois, atual["matricula"])
            res["atualizados"] += 1
    _ = today
    await registrar_alteracao("importacao", None, "IMPORTACAO_CSV", user, None, {"Arquivo": origem, **res})
    return res
