# Auditoria técnica do LB CRM — 23/11/2026

**Situação: parcial.** As correções abaixo estão na branch `fix/auditoria-geral`, sem commit e sem publicação. A auditoria só pode ser considerada concluída depois de rodar o diagnóstico no banco real e repetir os testes com dois usuários reais.

## 1. Como foi feita

- Revisão do código de sincronização, telefones, rotas de API, sessão, permissões, migrações SQL e carregamento de dados.
- Testes em cópia isolada, com dados de demonstração e sem credenciais de produção.
- Nenhum dado real foi lido, alterado ou apagado.
- O estado real das regras do banco ainda não foi lido. Os achados de banco vêm dos arquivos de migração e precisam da confirmação de `supabase/auditoria-diagnostico.sql`, que é somente leitura.

## 2. Problemas encontrados

### CRÍTICO

| ID | Problema | Causa técnica | Status |
|---|---|---|---|
| C1 | Consultor pode conseguir alterar dados comerciais direto pela API do navegador, como vendas, cadastro e comissão de vendedor, clientes e leads da Central | As migrações criam regras de escrita por empresa (`org_id`), sem conferir cargo | **Aberto.** Confirmar com o diagnóstico antes de mudar regras em produção |
| C2 | Acima de 1.000 registros, leads, vendas e clientes sumiam das telas e dos indicadores sem erro | O Supabase limita a resposta e o sistema não paginava | **Corrigido** |

### ALTO

| ID | Problema | Causa técnica | Status |
|---|---|---|---|
| A1 | Lead transferido continuava na tela do consultor anterior | O tempo real não envia evento a quem perdeu acesso à linha | **Corrigido:** conferência leve a cada 2 minutos com a aba visível |
| A2 | Atualizações feitas durante queda de conexão se perdiam até recarregar | Os canais não recarregavam os dados ao reconectar | **Corrigido** |
| A3 | Tela mostrava "salvo" quando o banco recusava a gravação | Recusa por permissão retorna 0 linhas, sem erro | **Corrigido** em Central, vendedores, vendas e clientes |
| A4 | WhatsApp e ligação abriam número errado para clientes do DDD 55 | O código confundia o DDD 55 com o código do país | **Corrigido** em todas as telas |
| A5 | Login por código aceitava curingas `%` e `_` | O texto digitado entrava sem escape na busca `ilike` | **Corrigido** |
| A6 | Em aparelho compartilhado, dados e canais do usuário anterior ficavam na memória após sair | O logout limpava só parte dos dados e não fechava o tempo real | **Corrigido** |

### MÉDIO

| ID | Problema | Status |
|---|---|---|
| M1 | Evento de tempo real com campos cortados podia apagar textos longos da tela | **Corrigido** |
| M2 | Login por e-mail não carregava mensagens prontas e resultados | **Corrigido** |
| M3 | Mensagens prontas não atualizavam em tempo real | **Corrigido** |
| M4 | Upload aceitava qualquer `tipo`, usado no caminho do arquivo | **Corrigido** |
| M5 | Ranking recalculava todas as vendas a cada renderização | **Corrigido** |
| M6 | Dois usuários editando o mesmo campo: a última gravação vence, sem aviso | Aberto |
| M7 | Todo consultor recebe nome, e-mail e cargo da equipe inteira | Aberto, decisão de negócio |
| M8 | Limite de tentativas de login fica na memória de cada servidor | Aberto |
| M9 | Central carrega no máximo 1.000 leads ativos | Aberto, verificar volume no diagnóstico |
| M10 | Telefone salvo com zero na frente gera chave de duplicidade diferente | Aberto, exige migração. O link de WhatsApp já trata esse caso |
| M11 | Telefone sem DDD não pode ser discado com segurança | Link deixa de ser gerado. Os cadastros precisam de revisão humana |

### BAIXO

| ID | Problema | Status |
|---|---|---|
| B1 | Logs de diagnóstico no console em Resultados e integrações | Aberto |
| B2 | Função sem uso na Central (`fmtDataHora`) | Aberto |

## 3. Desempenho

**Não há comparação de antes e depois**, porque não houve medição em produção. A única melhoria aplicada é evitar o recálculo do ranking a cada renderização (M5).

Pontos que ainda pesam:

- A abertura do sistema busca 17 conjuntos de dados.
- Leads são carregados com todas as colunas.
- A correção C2 aumenta o tráfego se a empresa tiver mais de 1.000 registros, porque passa a buscar os dados que antes faltavam.
- A conferência A1 acrescenta uma consulta leve de ids a cada 2 minutos para consultores.

## 4. Testes executados

| Teste | Resultado |
|---|---|
| Checagem de tipos e lint nos arquivos alterados | Passou |
| Build de produção | Passou, depois de corrigir um erro introduzido na própria auditoria |
| 14 formatos de telefone e 3 verificações de links e chave | Passou |
| 4 casos de escape no login | Passou |
| 36 telas abertas como administrador | Passou, sem erro de tela |
| Links de WhatsApp na tela de Pipeline | Passou |
| Consultor bloqueado em 6 áreas administrativas | Passou |
| Sair, entrar novamente e manter o tema | Passou no modo demonstração |

### Os 10 cenários obrigatórios

| # | Cenário | Situação |
|---|---|---|
| 1 | Admin altera e consultor vê | **Não testado:** exige banco e dois usuários |
| 2 | Consultor altera e admin vê | **Não testado** |
| 3 | Consultor altera telefone | Parcial: link testado, gravação real não |
| 4 | Novo lead é distribuído | **Não testado:** não acionei a integração real |
| 5 | Pipeline atualiza ranking | **Não testado** com banco real |
| 6 | Metas refletem dados reais | **Não testado** com banco real |
| 7 | Filtros e relatórios consistentes | Parcial: telas abrem, valores não foram conciliados |
| 8 | Permissões | Parcial: telas testadas, regras reais do banco não |
| 9 | Dois usuários simultâneos | **Não testado** |
| 10 | Atualizar a página e novo login | Passou no modo demonstração |

## 5. O que não foi coberto

- Clique manual em cada botão, filtro, modal e formulário de todos os módulos.
- Conferência dos cálculos de Financeiro, Simuladores e Análise de lances.
- Chamadas reais à Meta e aos recursos de IA.
- Duplicados, órfãos e índices no banco real, que dependem do diagnóstico.

## 6. Próximos passos

1. Publicar as correções desta branch.
2. Rodar `supabase/auditoria-diagnostico.sql` e analisar o resultado.
3. Se C1 for confirmado, preparar a migração de permissões com plano de reversão e fazer backup antes.
4. Criar um ambiente de testes com dois usuários e executar os 10 cenários.
