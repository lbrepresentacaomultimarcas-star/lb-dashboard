# Central de Leads — Arquitetura

Módulo de **intake e distribuição de leads** que vive dentro do LB CRM (mesmo banco,
auth, usuários, permissões e layout). Objetivo: eliminar a distribuição manual
(prints/caderno) e manter o **Pipeline só com leads qualificados**.

Leads crus entram na **Central** → o admin **distribui** aos consultores → o consultor
**trabalha** (liga, registra) → ao **ATENDER**, o lead é **promovido pro Pipeline**
(`leads`, status `primeiro_contato`). Tudo isolado do Pipeline: o módulo é 100% aditivo.

## Banco (`supabase/migration-central-leads.sql`)

- **`central_leads`** — o lead cru + ciclo de vida em **colunas de marco** (nunca depende
  de texto): `recebido_em`, `distribuido_em`/`distribuido_por`, `ligacao_iniciada_em`,
  `atendido_em`, `mensagem_enviada_em`, `convertido_em`+`lead_id`, `encerrado_em`,
  `motivo_perda`. Mais: `prioridade` (urgente/alta/normal/baixa), `status`
  (novo·aguardando·em_atendimento·aguardando_resposta·nao_atendeu·convertido·perdido),
  `vendedor_id` (consultor → vendedores.id), `produto`, `origem`, `observacoes`.
  **Preparo Cloud API:** `external_id` (dedupe) + `wa_contato` jsonb (payload bruto).
- **`central_leads_eventos`** — timeline + **auditoria campo a campo**
  (`tipo`, `campo`, `valor_anterior`, `valor_novo`, `autor_id`/`autor_nome`, `criado_em`).
- **`notificacoes`** — base de avisos internos por usuário (sem push ainda).
- **RLS multiempresa**: `org_id = current_org_id()` em tudo; leitura de `central_leads`
  reusa `public.pode_ver_vendedor(vendedor_id)` (admin=empresa · gestor=equipe ·
  consultor=os seus). Escrita por org (distribuição é controlada no app).
- **Métricas por RPC `SECURITY DEFINER`** (agrega no banco, respeita o escopo do chamador):
  `central_dashboard(from,to)` e `central_ranking(from,to)`.
- Índices em `(org_id,vendedor_id,status)`, `(org_id,recebido_em)`, `(org_id,prioridade)`,
  `unique(org_id,external_id)`, `eventos(central_lead_id)`, `notificacoes(user_id,lida)`.

## App (mesmo padrão do CRM)

- `src/lib/types.ts` — `CentralLead`, `Prioridade`, `CentralLeadStatus`,
  `CentralLeadEvento`, `Notificacao`, `CentralDashboard`, `CentralRankingRow` + infos.
- `src/lib/repo/mappers.ts` — mappers camelCase ↔ snake_case.
- `src/lib/store.ts` — `state.centralLeads`/`notificacoes`, reloads (fila ativa =
  `encerrado_em is null`, limit 1000) + realtime, hooks `useCentralLeads`/`useNotificacoes`,
  **`centralLeadsApi`** (add, importar, distribuir, iniciarLigacao, atendeu, naoAtendeu,
  mensagemEnviada, perder, mudarPrioridade, addObservacao, historico, dashboard, ranking)
  e `notificacoesApi`. Toda ação grava um evento (auditoria automática).
- `src/app/(app)/central/page.tsx` — fila do consultor + painel do admin (distribuir/
  importar/novo lead), adapta por cargo (`ehAdmin`/`useEscopo`).
- `src/app/(app)/central/painel/page.tsx` — painel do gestor (período + KPIs + tempos +
  ranking de produtividade + conversão por origem).
- `src/components/nav-items.ts` — grupo "Central de Leads" (Fila + Painel).

## Escala

Fila ativa carregada no cliente é naturalmente limitada (leads encerrados saem);
métricas/relatórios/ranking vêm por RPC (nunca baixa milhares de linhas). Índices cobrem
filtro/ordenação/paginação. Zero query compartilhada com o Pipeline → sem impacto no CRM.

## Entrada automática pela Meta (WhatsApp Cloud API) — IMPLEMENTADO

`src/app/api/central-leads/intake/route.ts` — webhook público (sem login; a segurança
é a assinatura da Meta, não sessão).

- **GET** responde o handshake (`hub.mode`/`hub.verify_token`/`hub.challenge`).
- **POST** valida `X-Hub-Signature-256` (HMAC-SHA256 do corpo CRU com o App Secret),
  lê o evento `messages` e cria o lead com `status='novo'`, `prioridade='alta'`,
  `origem='Meta Ads · Click-to-WhatsApp'` e o payload bruto em `wa_contato`.
- **Origem do anúncio**: o objeto `referral` (só vem na 1ª mensagem de um clique em
  anúncio) traz `source_id`, `headline`, `source_url` e `ctwa_clid` — é a prova
  oficial de que a conversa nasceu de um anúncio Click-to-WhatsApp.
- **Interesse automático**: `detectarInteresse()` preenche `produto` a partir da
  resposta (menu 1–4 ou palavra-chave), lendo texto digitado **ou** botão tocado
  (`interactive.button_reply`/`list_reply`/`button.text`). Se o interesse só chega
  numa mensagem posterior, o produto é preenchido por `update` + evento de auditoria.
- **Dedupe**: lead ATIVO é buscado por `telefone`. Cliente cujo lead já foi encerrado
  (perdido/convertido) e volta a chamar gera um lead NOVO — o `external_id` ganha
  sufixo `#<timestamp>` para não colidir com o índice único.
- **Idempotência**: a Meta reenvia webhooks; cada evento guarda o `wamid` em
  `campo='wamid'`/`valor_novo` e reentrega é ignorada.
- **Aviso**: admin/coordenador recebem `notificacoes` (que a Central já escuta em
  tempo real) com nome + interesse.
- **Env**: `META_VERIFY_TOKEN`, `META_APP_SECRET`, `LB_ORG_ID`.
- **Status**: `GET /api/central-leads/status` (só admin) alimenta o cartão
  "Conexão com a Meta" em Configurações → Integrações. Devolve apenas booleanos —
  nenhum segredo trafega.

## Como estender no futuro (sem refazer o módulo)

- **Distribuição inteligente** (rodízio / menor volume / melhor desempenho / online):
  `centralLeadsApi.distribuir(ids, vendedorId)` já é o ponto único; criar uma função que
  ESCOLHE `vendedorId` (a estratégia) e chama `distribuir`. "Online" precisa de presença
  (ex.: `profiles.ultimo_acesso`).
- **Discador / VoIP**: o botão LIGAR hoje só marca `ligacao_iniciada_em`; integrar um
  discador = disparar a chamada nesse mesmo handler.
- **IA** (priorização, sugestão de resposta): consumir `central_leads` + eventos; gravar
  sugestões como observação/evento.
- **Notificações push**: já há `notificacoes` + `notificarUsuario()`; plugar e-mail/WhatsApp
  num worker que lê a tabela.
