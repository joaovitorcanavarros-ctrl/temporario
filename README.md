# CBMMT — Sistema de Gerenciamento de Bombeiros Militares Temporários

Aplicação web full-stack para gestão do efetivo de BM temporários do Corpo de Bombeiros Militar de Mato Grosso:
cadastro, edição com histórico, desligamento lógico, reativação, alertas de vencimento de contrato,
dashboard com indicadores e gráficos calculados a partir do banco, importação de CSV, relatórios e exportação CSV/Excel.

> Stack adotada (aprovada): **FastAPI (Python) + MongoDB** no backend e **React 19 + TypeScript + Vite + Tailwind + shadcn/ui + Recharts +
> React Hook Form + Zod** no frontend. Detalhes técnicos do template em `TEMPLATE.md`.

## Arquitetura

```
backend/
  server.py              # FastAPI; todas as rotas sob /api (api_router) — include_router no final
  seed.py                # carga inicial idempotente (categorias, motivos, usuários, CSVs de backend/data)
  data/*.csv             # planilhas oficiais usadas na migração inicial
  lib/
    db.py                # conexão Mongo (motor) + índices (únicos: matrícula, e-mail, catálogos)
    security.py          # hash PBKDF2-SHA256, sessões em cookie httpOnly, require(perfis)
    normalize.py         # normalização de textos/datas, categoria sugerida por cargo
    csv_import.py        # separador, detecção da linha de cabeçalho, mapeamento de colunas
    importer.py          # validação (inserir/atualizar/ignorar/rejeitar) e aplicação da importação
    stats.py             # REGRAS DE CÁLCULO dos indicadores (funções puras, testadas)
    militares.py         # filtros compartilhados, enriquecimento, auditoria
    export.py            # CSV (UTF-8 BOM, ';') e XLSX (openpyxl)
  models/schemas.py      # modelos Pydantic (espelhados em frontend/src/lib/types.ts)
  routers/               # auth, catalogos, militares, dashboard, importacao, relatorios, usuarios
  tests/                 # test_regras.py (cálculos/CSV) e test_api.py (fluxos e permissões)
frontend/src/
  components/            # AppShell (menu lateral recolhível + cabeçalho), FiltersBar, MilitaresTable,
                         # MilitarDialogs (desligamento, reativação, edição rápida), DrillSheet
  pages/                 # Login, Dashboard, Temporarios, MilitarForm, MilitarDetalhe, Desligamentos,
                         # Importacao, Relatorios, Configuracoes
  lib/                   # api.ts (fetch tipado /api), types.ts, filters.tsx (filtros globais), hooks.ts
```

### Modelo de dados (coleções)
`militares`, `cargos` (com categoria), `categorias` (seções do menu), `lotacoes`, `editais`, `motivos`, `usuarios`,
`sessions` (TTL), `config`, `historico_alteracoes` (antes/depois por campo), `historico_situacao` (inclusão, desligamento, reativação).
Ids são UUID; datas de negócio em ISO `YYYY-MM-DD`; carimbos de data/hora em UTC.

### Regras de cálculo (lib/stats.py)
| Indicador | Critério |
|---|---|
| Efetivo ativo | status ATIVO na data de referência (hoje em America/Cuiaba; ou fim do período filtrado — estoque histórico: incluído até a data e não desligado até ela) |
| Efetivo por cargo / UBM | ativos agrupados por categoria/cargo ou lotação |
| Inclusões no período | data de inclusão dentro do período |
| Desligamentos no período | status DESLIGADO e data efetiva de desligamento dentro do período |
| Contratos a vencer | ATIVO e vencimento entre hoje e hoje + prazo configurado (padrão 30 dias) |
| Contratos vencidos | ATIVO e vencimento anterior a hoje — apenas alerta, sem desligamento automático |

## Perfis e segurança
- **Administrador**: usuários, configurações, catálogos, auditoria e reativação de cadastros.
- **Gestor de Pessoal**: cadastro, edição, importação e desligamentos.
- **Consulta**: somente leitura.
Permissões verificadas no servidor em cada endpoint. Senhas com PBKDF2 (260 mil iterações), sessão em cookie httpOnly/Secure/SameSite=Lax,
bloqueio após 5 tentativas em 15 min, logs técnicos sem dados pessoais, auditoria funcional com usuário, data/hora e valores anteriores/posteriores.

## Execução local
```bash
cp backend/.env.example backend/.env      # ajuste MONGO_URL, DB_NAME, COOKIE_SECURE=false sem HTTPS
cd backend && pip install -r requirements.txt && python seed.py
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
cd frontend && yarn && yarn dev            # http://localhost:3000 (proxy /api → 8001)
```
Usuários iniciais: ver `memory/test_credentials.md` (altere as senhas após o primeiro acesso).

## Testes
```bash
cd backend && pytest          # regras de cálculo, leitura de CSV, cadastro, duplicidade, desligamento, reativação, permissões
cd frontend && yarn typecheck
```

## Importação de CSV
Menu **Importação de Dados**: 1) selecionar arquivo, 2) pré-visualizar e mapear colunas (cabeçalho detectado automaticamente mesmo com linhas
de título), 3) validar (erros, ausências, duplicidades, diferenças para matrículas existentes — aprovação individual), 4) confirmar.
Relatório de validação e registros rejeitados podem ser baixados em CSV. Cargos/lotações/editais novos são cadastrados automaticamente.

## Backup e implantação
- Backup diário recomendado: `mongodump --uri "$MONGO_URL" --db "$DB_NAME" --gzip --archive=backup_$(date +%F).gz`
  (restauração: `mongorestore --gzip --archive=arquivo.gz`). Mantenha cópias fora do servidor conforme política de retenção do Estado.
- Implantar somente em ambiente autorizado pelo CBMMT/Estado, com HTTPS obrigatório, `COOKIE_SECURE=true` e `CORS_ORIGINS` restrito ao domínio oficial.

## Manutenção
- Novos cargos/categorias/lotações/editais/motivos: **Configurações e Usuários** (sem alterar código). Novas categorias aparecem no menu lateral.
- Ao alterar um modelo Pydantic em `models/schemas.py`, atualize a interface correspondente em `frontend/src/lib/types.ts`.
- Próximas fases: relatórios PDF, integração com autenticação institucional (SSO) e rotina automática de backup.
