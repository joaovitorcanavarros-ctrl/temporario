# CBMMT — Sistema de Gerenciamento de Bombeiros Militares Temporários

## O que é
Aplicação web full-stack que substitui a gestão manual em planilhas do efetivo de Bombeiros Militares Temporários do CBMMT, com banco de dados próprio, indicadores e gráficos recalculados a cada operação, autenticação por perfil e importação dos CSVs atuais. Roda sobre a stack da plataforma (FastAPI + MongoDB + React/TypeScript com Recharts e shadcn/ui), mantendo integralmente a funcionalidade e as regras de negócio pedidas — decisão confirmada pelo usuário.

## Para quem é
Seção de pessoal do CBMMT: Administrador (usuários e configurações), Gestor de Pessoal (cadastro, edição, importação, desligamentos) e Consulta (somente leitura).

## Funcionalidades e experiência
- **Visual dark mode profissional**: fundo grafite/azul-marinho, painéis mais claros, alto contraste; azul para indicadores e navegação, verde para ativos, amarelo para alertas, vermelho para desligamentos. Menu lateral fixo e recolhível; cabeçalho com nome do sistema, usuário e data da última atualização; layout responsivo (desktop, tablet, celular).
- **Dashboard dinâmico, sem nenhum número fixo em código**: cards de Temporários Ativos, Distratos/Desligamentos no período, Efetivo por UBM, contagem por cargo (Auxiliares, Condutores, Técnicos de Enfermagem, Enfermeiros, Médicos), Contratos a Vencer e Contratos Vencidos.
- **Seis gráficos interativos** (efetivo por cargo com comparação anual; desligamentos por cargo, ano e motivo; efetivo por UBM em barras horizontais; evolução anual e mensal; distribuição por período; contratos a vencer por faixa de dias) com valores exatos no tooltip e clique que lista os registros correspondentes.
- **Filtros consistentes em todas as telas**: ano, cargo, lotação, edital, status e intervalo de datas. Data de referência no fuso America/Cuiaba, calculada no servidor.
- **Cadastro com validação**: matrícula única (duplicidade apresenta mensagem e atalho para abrir o registro existente), campos obrigatórios e datas válidas validados também no servidor; botões Salvar, Salvar e Cadastrar Outro, Cancelar e Limpar. Edição registra o histórico das alterações.
- **Desligamento sem exclusão**: janela de confirmação com nome, matrícula, lotação, cargo, data efetiva, motivo configurável (Desistência, Encerramento do contrato, Desligamento administrativo, Rescisão/distrato, Outra), documento/processo e observações; registra usuário, data e hora; inativação lógica preserva o histórico. Reativação restrita a perfis autorizados, com justificativa. Contrato vencido nunca desliga automaticamente — gera alerta de conferência.
- **Tela Temporários Geral**: busca por nome/matrícula, filtros por cargo, lotação, edital, situação e vencimento, ordenação por coluna, paginação, destaque dos contratos a vencer nos próximos 30 dias (prazo configurável), visualização ativos/desligados/todos, histórico individual e exportação do recorte filtrado.
- **Importação CSV em 4 etapas** (selecionar arquivo → pré-visualizar e mapear colunas → validar com erros e duplicidades → confirmar), reconhecendo o cabeçalho mesmo com linhas decorativas antes da tabela; mostra quantos registros serão inseridos, atualizados, ignorados ou rejeitados; revisão obrigatória antes de atualizar matrículas existentes; relatório com download dos rejeitados. Registros importados entram como ATIVO.
- **Relatórios com os mesmos filtros** (efetivo por cargo, por UBM, por edital, inclusões por período, contratos a vencer, contratos vencidos pendentes, desligamentos por período e motivo, histórico por matrícula), exportáveis em CSV e Excel.
- **Segurança**: perfis e permissões validados no servidor, sessões por cookie httpOnly, senhas com hash, auditoria com valores anteriores e posteriores. Cargos, lotações, editais, motivos e limite de alerta configuráveis sem alterar código.

## Fase 1 — o que será construído agora
Tudo o que está acima, completo e integrado ao banco, incluindo:
- Carga inicial pelos 5 CSVs anexados (Auxiliares, Condutores, Téc. Enfermagem, Enfermeiros, Médicos), importados como ATIVO.
- Fluxo manual de desligamento pronto para uso: os dados do arquivo de Distratos/desligamentos NÃO serão importados — o usuário os lançará manualmente depois, e o sistema deve receber esses registros futuros sem ajustes.
- Usuários de demonstração dos três perfis, testes das regras de negócio principais e README em português.

Fica para depois: exportação em PDF, integração com o SSO institucional do CBMMT e rotinas automáticas de backup.
