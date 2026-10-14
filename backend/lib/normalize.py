"""Normalização de textos, datas e categorias — funções puras (testáveis sem banco)."""

import re
import unicodedata
from datetime import date, datetime

CATEGORIAS_PADRAO = [
    ("AUXILIAR", "Auxiliares", 1),
    ("CONDUTOR", "Condutores", 2),
    ("TEC_ENFERMAGEM", "Técnicos de Enfermagem", 3),
    ("ENFERMEIRO", "Enfermeiros", 4),
    ("MEDICO", "Médicos", 5),
    ("OUTROS", "Outros Cargos", 99),
]


def clean_text(value: str | None) -> str:
    """Remove espaços duplicados/quebras de linha e apara extremidades."""
    return re.sub(r"\s+", " ", value or "").strip()


def norm_key(value: str | None) -> str:
    """Chave de comparação: maiúsculas, sem acentos, sem pontuação (Nº == N° == NO)."""
    s = (value or "").replace("°", "o").replace("º", "o").replace("ª", "a")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).upper()
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return s.strip()


def norm_matricula(value: str | None) -> str:
    return re.sub(r"\s+", "", value or "").upper()


_DATE_FORMATS = ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y")


def parse_date(value: str | None) -> str | None:
    """Converte data textual para ISO (YYYY-MM-DD). Vazio → None. Inválida → ValueError."""
    s = clean_text(value)
    if not s or s in {"-", "--"}:
        return None
    for fmt in _DATE_FORMATS:
        try:
            d = datetime.strptime(s, fmt).date()
        except ValueError:
            continue
        if not (1950 <= d.year <= 2100):
            raise ValueError(f"data fora do intervalo aceitável: {s}")
        return d.isoformat()
    raise ValueError(f"data inválida: {s}")


def iso(d: date | str | None) -> str | None:
    if d is None:
        return None
    return d.isoformat() if isinstance(d, date) else d


def guess_categoria(cargo_nome: str) -> str:
    k = norm_key(cargo_nome)
    if "MEDIC" in k:
        return "MEDICO"
    if "AUXILIAR" in k:
        return "AUXILIAR"
    if "CONDUTOR" in k or "MOTORISTA" in k:
        return "CONDUTOR"
    if "SEGUNDA CLASSE" in k or "TECNIC" in k:
        return "TEC_ENFERMAGEM"
    if "PRIMEIRA CLASSE" in k or "ENFERM" in k:
        return "ENFERMEIRO"
    return "OUTROS"


def guess_ano(texto: str) -> int | None:
    anos = re.findall(r"(19\d{2}|20\d{2})", texto or "")
    return int(anos[-1]) if anos else None
