"""Leitura de CSV com detecção de separador e da linha de cabeçalho — funções puras."""

import csv
import io

from lib.normalize import clean_text, norm_key

# campo do sistema → (rótulo, obrigatório, apelidos aceitos no cabeçalho)
CAMPOS: dict[str, tuple[str, bool, list[str]]] = {
    "matricula": ("Matrícula / Vínculo", True, ["VINCULO", "MATRICULA", "MATRICULA VINCULO"]),
    "nome_completo": ("Nome completo", True, ["NOME", "NOME COMPLETO"]),
    "cargo": ("Cargo / Função", True, ["CARGO", "FUNCAO", "CARGO FUNCAO"]),
    "lotacao": ("Lotação / UBM", True, ["LOTACAO", "UBM", "LOTACAO UBM"]),
    "edital": ("Edital / Processo seletivo", True, ["PROCESSO SELETIVO", "EDITAL", "EDITAL PROCESSO SELETIVO"]),
    "data_inclusao": ("Data de inclusão", True, ["DATA INCLUSAO", "INCLUSAO", "DATA DE INCLUSAO"]),
    "data_vencimento_contrato": (
        "Data de vencimento do contrato",
        True,
        ["DATA FINAL VINCULO", "DATA VENCIMENTO", "VENCIMENTO", "DATA DE VENCIMENTO DO CONTRATO", "DATA FINAL"],
    ),
    "observacoes": ("Observações", False, ["OBSERVACAO", "OBSERVACOES", "OBS"]),
    "doe_incorporacao": ("DOE - Incorporação", False, ["DOE INCORPORACAO", "DOE"]),
    "status": ("Situação", False, ["SITUACAO", "STATUS"]),
}


def decode_bytes(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def detect_delimiter(content: str) -> str:
    sample = content[:8192]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        counts = {d: sample.count(d) for d in (",", ";", "\t", "|")}
        return max(counts, key=lambda d: counts[d])


def read_rows(content: str) -> tuple[str, list[list[str]]]:
    content = content.lstrip("\ufeff")
    delim = detect_delimiter(content)
    rows = list(csv.reader(io.StringIO(content), delimiter=delim))
    return delim, rows


def detect_header(rows: list[list[str]], max_scan: int = 60) -> int | None:
    """Índice (0-based) da primeira linha que contém ao menos 3 nomes de campo conhecidos."""
    for i, row in enumerate(rows[:max_scan]):
        keys = {norm_key(c) for c in row if c.strip()}
        score = sum(1 for _, (_, _, aliases) in CAMPOS.items() if keys & set(aliases))
        if score >= 3:
            return i
    return None


def suggest_mapping(header: list[str]) -> dict[str, int | None]:
    keys = [norm_key(h) for h in header]
    mapping: dict[str, int | None] = {}
    for campo, (_, _, aliases) in CAMPOS.items():
        mapping[campo] = next((j for j, k in enumerate(keys) if k in aliases), None)
    return mapping


def extract_records(
    rows: list[list[str]], header_idx: int, mapping: dict[str, int | None]
) -> list[tuple[int, dict[str, str]]]:
    """Extrai registros abaixo do cabeçalho, ignorando linhas decorativas/vazias.
    Retorna (número da linha no arquivo, 1-based) + dicionário campo → valor limpo."""
    out: list[tuple[int, dict[str, str]]] = []
    for i in range(header_idx + 1, len(rows)):
        row = rows[i]
        rec: dict[str, str] = {}
        for campo, idx in mapping.items():
            if idx is None or idx >= len(row):
                rec[campo] = ""
            else:
                rec[campo] = clean_text(row[idx])
        if not rec.get("matricula") and not rec.get("nome_completo"):
            continue  # linha decorativa ou em branco
        if norm_key(rec.get("matricula")) in CAMPOS["matricula"][2]:
            continue  # cabeçalho repetido
        out.append((i + 1, rec))
    return out
