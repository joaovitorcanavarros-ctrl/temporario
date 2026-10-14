# SPEC — CBMMT · Gestão de Bombeiros Militares Temporários

## O que é
Sistema web (FastAPI + MongoDB + React/TS) que substitui as planilhas de BM temporários do CBMMT.
Indicadores e gráficos calculados no servidor a partir do banco (nenhum número fixo).
Data de referência: hoje em America/Cuiaba (`lib/militares.hoje()`).

## Perfis (validados no servidor — `lib/security.require`)
- ADMIN: tudo + usuários, configurações/catálogos, auditoria, **reativação**.
- GESTOR: cadastrar, editar, edição rápida, importar, registrar desligamento.
- CONSULTA: somente leitura (dashboard, tabelas, relatórios, exportações).
Login: POST /api/auth/login → cookie httpOnly `cbmmt_session` (secure; SameSite=Lax). Bloqueio após 5 falhas/15 min.

## Coleções
militares (id, matricula única, nome_completo, cargo_id, lotacao_id, edital_id, data_inclusao, data_vencimento_contrato [ISO str],
status ATIVO|DESLIGADO, data_desligamento, motivo_desligamento_id, documento_desligamento, observacoes, doe_incorporacao,
criado_em/atualizado_em/criado_por/atualizado_por) · cargos (categoria=codigo) · categorias (codigo, nome, ordem → itens do menu) ·
lotacoes · editais · motivos · usuarios · sessions · config (_id "app": alerta_dias) · historico_alteracoes (antes/depois) ·
historico_situacao (INCLUSAO/DESLIGAMENTO/REATIVACAO).

## Regras
- Ativo = status ATIVO (estoque em data passada: incluído ≤ D e não desligado até D).
- Desligamentos/inclusões no período = data do evento no período (filtros ano ou data_inicio/data_fim).
- A vencer = ATIVO e vencimento em [hoje, hoje+alerta_dias]; Vencido = ATIVO e vencimento < hoje. Nunca desliga automaticamente.
- Desligamento = inativação lógica (sem exclusão). Data não futura e ≥ inclusão. Reativação exige justificativa (ADMIN).
- Matrícula única (409 com `detail.militar_id` para abrir o existente).

## Seed (`cd /app/backend && python seed.py`, idempotente)
- 421 militares ATIVO importados de backend/data/*.csv (209 auxiliares, 71 condutores, 77 téc. enf., 57 enfermeiros, 7 médicos).
- 6 categorias, 5 motivos, alerta_dias=30, 3 usuários (ver test_credentials.md).
- Hoje (pod) ≈ 2026-10-14 → ~195 contratos vencidos ainda ativos (dados reais da planilha).
- Nenhum desligamento importado (serão lançados manualmente).

## Telas
/login · / (dashboard + drill-down nos gráficos) · /temporarios · /quadro/:categoria · /temporarios/novo · /temporarios/:id ·
/temporarios/:id/editar · /desligamentos · /importacao (4 etapas) · /relatorios (8 tipos, CSV/XLSX) · /configuracoes.

## Fora do escopo (fase 2)
PDF, SSO institucional, backup automático.
