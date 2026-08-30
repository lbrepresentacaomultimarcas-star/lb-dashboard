-- ============================================================================
-- LB CRM — PIX NOS DADOS BANCÁRIOS DA FICHA FINAL
--
-- 100% ADITIVA e IDEMPOTENTE. Só acrescenta 3 colunas em `fichas`.
-- NÃO altera nada mais. NÃO encosta em `forma_pagamento` — a forma de
-- pagamento da OPERAÇÃO é outra coisa e continua exatamente como está.
--
-- ----------------------------------------------------------------------------
-- SÃO DUAS COISAS DIFERENTES, E O SISTEMA PRECISA MANTÊ-LAS SEPARADAS:
--
--   fichas.forma_pagamento  → como o consorciado PAGA as parcelas
--                             (boleto, débito, PIX, cartão…)  ← NÃO MEXER
--   fichas.banco_meio       → onde ele RECEBE, quando houver devolução
--                             (conta bancária ou chave PIX)   ← o que entra aqui
--
-- Ter "PIX" nos dois lugares é correto: um é pagamento, o outro é recebimento.
-- Misturar os dois é que seria o erro.
-- ============================================================================

alter table public.fichas
  add column if not exists banco_meio text not null default 'conta',
  add column if not exists pix_tipo   text,
  add column if not exists pix_chave  text;

comment on column public.fichas.banco_meio is
  'conta | pix — como o consorciado RECEBE. Nada a ver com forma_pagamento, que é como ele PAGA.';
comment on column public.fichas.pix_tipo is
  'Tipo da chave PIX: cpf | cnpj | email | telefone | aleatoria.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fichas_banco_meio_check') then
    alter table public.fichas
      add constraint fichas_banco_meio_check check (banco_meio in ('conta', 'pix'));
  end if;
end $$;

-- As fichas que já existem continuam com conta bancária, que é o que foi
-- preenchido nelas. O default cuida disso; nada é reescrito.

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
select 'colunas novas em fichas' as item, count(*)::text as valor
  from information_schema.columns
 where table_name = 'fichas' and column_name in ('banco_meio', 'pix_tipo', 'pix_chave')
union all
select 'forma_pagamento intacta', count(*)::text
  from information_schema.columns
 where table_name = 'fichas' and column_name = 'forma_pagamento'
union all
select 'fichas (deve seguir igual)', count(*)::text from public.fichas
union all
select 'analises (deve seguir igual)', count(*)::text from public.analises;
