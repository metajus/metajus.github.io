-- =====================================================================
-- MetaJus — estrutura do banco (Supabase / PostgreSQL)
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Pode rodar de novo sem problema (usa "if not exists"/"or replace").
--
-- LGPD — minimização de dados: o banco guarda apenas número do processo,
-- faixa de dias parados, localização (Cartório/Gabinete) e sequencial.
-- Nada de nomes de partes, CPF, endereço ou conteúdo de peças.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. USUÁRIOS (perfil ligado ao login do Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text not null,
  email           text not null,
  setor           text not null default 'Cartório'
                  check (setor in ('Cartório','Gabinete','Híbrido')),
  especialidades  text[] not null default '{Geral}',
  sequenciais     int[]  not null default '{}',
  role            text not null default 'servidor' check (role in ('servidor','admin')),
  status          text not null default 'pendente'
                  check (status in ('pendente','aprovado','bloqueado')),
  criado_em       timestamptz not null default now()
);

-- Funções auxiliares usadas nas regras de segurança
create or replace function public.eh_aprovado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and status = 'aprovado');
$$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios
                 where id = auth.uid() and status = 'aprovado' and role = 'admin');
$$;

-- Todo cadastro novo nasce como PENDENTE e SERVIDOR (o próprio usuário
-- não consegue se aprovar nem virar admin).
create or replace function public.criar_perfil_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_setor text := m->>'setor';
  v_esp text[];
  v_seq int[];
begin
  if v_setor is null or v_setor not in ('Cartório','Gabinete','Híbrido') then
    v_setor := 'Cartório';
  end if;

  select coalesce(array_agg(e), '{}') into v_esp
  from jsonb_array_elements_text(case when jsonb_typeof(m->'especialidades') = 'array'
                                      then m->'especialidades' else '[]'::jsonb end) e
  where e in ('Geral','Réu Preso','Saúde','SEEU');
  if array_length(v_esp, 1) is null then v_esp := '{Geral}'; end if;

  select coalesce(array_agg(distinct s::int), '{}') into v_seq
  from jsonb_array_elements_text(case when jsonb_typeof(m->'sequenciais') = 'array'
                                      then m->'sequenciais' else '[]'::jsonb end) s
  where s ~ '^[0-9]$';

  insert into public.usuarios (id, nome, email, setor, especialidades, sequenciais)
  values (new.id,
          coalesce(nullif(trim(m->>'nome'), ''), split_part(new.email, '@', 1)),
          new.email, v_setor, v_esp, v_seq)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

alter table public.usuarios enable row level security;

drop policy if exists usuarios_ver on public.usuarios;
create policy usuarios_ver on public.usuarios for select
  using (id = auth.uid() or public.eh_aprovado());

drop policy if exists usuarios_admin_alterar on public.usuarios;
create policy usuarios_admin_alterar on public.usuarios for update
  using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists usuarios_admin_excluir on public.usuarios;
create policy usuarios_admin_excluir on public.usuarios for delete
  using (public.eh_admin());

-- ---------------------------------------------------------------------
-- 2. ACERVO DE PROCESSOS PARADOS (planilha do SAJ Insights)
-- ---------------------------------------------------------------------
create table if not exists public.processos (
  numero       text primary key,
  faixa        int  not null,             -- 30, 60, 100, 120, 180, 365
  faixa_texto  text,                      -- texto original, ex.: "+ 100 dias"
  local        text not null default '',  -- 'Cartório', 'Gabinete' ou ''
  sequencial   int check (sequencial between 0 and 9),
  importado_em timestamptz not null default now()
);
create index if not exists processos_seq_idx on public.processos (sequencial);

alter table public.processos enable row level security;
drop policy if exists processos_ver on public.processos;
create policy processos_ver on public.processos for select using (public.eh_aprovado());
-- Escrita só pela função substituir_acervo (abaixo), restrita ao admin.

-- Histórico de importações (para comparar com o relatório anterior)
create table if not exists public.importacoes (
  id         bigserial primary key,
  criado_em  timestamptz not null default now(),
  total      int not null,
  resumo     jsonb not null default '{}',
  usuario_id uuid references public.usuarios(id) on delete set null
);
alter table public.importacoes enable row level security;
drop policy if exists importacoes_ver on public.importacoes;
create policy importacoes_ver on public.importacoes for select using (public.eh_aprovado());

-- Marcações de "Cumprido"
create table if not exists public.cumpridos (
  numero      text primary key,
  usuario_id  uuid not null default auth.uid() references public.usuarios(id) on delete cascade,
  cumprido_em timestamptz not null default now()
);
alter table public.cumpridos enable row level security;
drop policy if exists cumpridos_ver on public.cumpridos;
create policy cumpridos_ver on public.cumpridos for select using (public.eh_aprovado());
drop policy if exists cumpridos_marcar on public.cumpridos;
create policy cumpridos_marcar on public.cumpridos for insert
  with check (public.eh_aprovado() and usuario_id = auth.uid());
drop policy if exists cumpridos_desmarcar on public.cumpridos;
create policy cumpridos_desmarcar on public.cumpridos for delete
  using (usuario_id = auth.uid() or public.eh_admin());

-- Troca o acervo inteiro de uma vez (tudo ou nada). Só admin.
-- Marcações de "Cumprido" de processos que saíram do relatório são apagadas.
create or replace function public.substituir_acervo(itens jsonb, resumo jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then
    raise exception 'Apenas o administrador pode atualizar a base.';
  end if;

  delete from public.processos where true;

  insert into public.processos (numero, faixa, faixa_texto, local, sequencial)
  select distinct on (x->>'numero')
         x->>'numero',
         coalesce((x->>'faixa')::int, 0),
         x->>'faixa_texto',
         coalesce(x->>'local', ''),
         case when (x->>'sequencial') ~ '^[0-9]$' then (x->>'sequencial')::int end
  from jsonb_array_elements(itens) x
  where coalesce(x->>'numero', '') <> ''
  order by x->>'numero', coalesce((x->>'faixa')::int, 0) desc;
  get diagnostics n = row_count;

  delete from public.cumpridos c
  where not exists (select 1 from public.processos p where p.numero = c.numero);

  insert into public.importacoes (total, resumo, usuario_id) values (n, resumo, auth.uid());
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 3. METAS MENSAIS (Meta = Entradas + 1)
-- ---------------------------------------------------------------------
create table if not exists public.metas_mensais (
  mes            text primary key check (mes ~ '^[0-9]{4}-[0-9]{2}$'), -- 'AAAA-MM'
  entradas       int not null default 0 check (entradas >= 0),
  arquivados     int not null default 0 check (arquivados >= 0),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id) on delete set null
);
alter table public.metas_mensais enable row level security;
drop policy if exists metas_ver on public.metas_mensais;
create policy metas_ver on public.metas_mensais for select using (public.eh_aprovado());
drop policy if exists metas_admin_inserir on public.metas_mensais;
create policy metas_admin_inserir on public.metas_mensais for insert with check (public.eh_admin());
drop policy if exists metas_admin_alterar on public.metas_mensais;
create policy metas_admin_alterar on public.metas_mensais for update
  using (public.eh_admin()) with check (public.eh_admin());

-- ---------------------------------------------------------------------
-- 4. COMANDOS DO GABINETE
-- ---------------------------------------------------------------------
create table if not exists public.comandos (
  id              bigserial primary key,
  numero          text not null,
  urgencia        text not null default 'Normal',
  destino         text not null default 'Cartório' check (destino in ('Cartório','Gabinete')),
  destinatario_id uuid references public.usuarios(id) on delete set null,
  texto           text not null check (char_length(texto) <= 500),
  autor_id        uuid not null default auth.uid() references public.usuarios(id) on delete cascade,
  status          text not null default 'aberto' check (status in ('aberto','cumprido')),
  criado_em       timestamptz not null default now(),
  concluido_em    timestamptz,
  concluido_por   uuid references public.usuarios(id) on delete set null
);
alter table public.comandos enable row level security;
drop policy if exists comandos_ver on public.comandos;
create policy comandos_ver on public.comandos for select using (public.eh_aprovado());
drop policy if exists comandos_criar on public.comandos;
create policy comandos_criar on public.comandos for insert
  with check (public.eh_aprovado() and autor_id = auth.uid());
drop policy if exists comandos_alterar on public.comandos;
create policy comandos_alterar on public.comandos for update
  using (public.eh_aprovado()) with check (public.eh_aprovado());
drop policy if exists comandos_excluir on public.comandos;
create policy comandos_excluir on public.comandos for delete
  using (autor_id = auth.uid() or public.eh_admin());

-- ---------------------------------------------------------------------
-- 5. REPASSE DE DILIGÊNCIAS (ex.: SISBAJUD para o servidor habilitado)
-- ---------------------------------------------------------------------
create table if not exists public.repasses (
  id              bigserial primary key,
  numero          text not null,
  tipo            text not null,
  destinatario_id uuid not null references public.usuarios(id) on delete cascade,
  observacao      text check (char_length(observacao) <= 500),
  autor_id        uuid not null default auth.uid() references public.usuarios(id) on delete cascade,
  status          text not null default 'pendente' check (status in ('pendente','cumprido','devolvido')),
  resposta        text check (char_length(resposta) <= 500),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz
);
alter table public.repasses enable row level security;
drop policy if exists repasses_ver on public.repasses;
create policy repasses_ver on public.repasses for select using (public.eh_aprovado());
drop policy if exists repasses_criar on public.repasses;
create policy repasses_criar on public.repasses for insert
  with check (public.eh_aprovado() and autor_id = auth.uid());
drop policy if exists repasses_alterar on public.repasses;
create policy repasses_alterar on public.repasses for update
  using (public.eh_aprovado() and (destinatario_id = auth.uid() or autor_id = auth.uid() or public.eh_admin()))
  with check (public.eh_aprovado());
drop policy if exists repasses_excluir on public.repasses;
create policy repasses_excluir on public.repasses for delete
  using (autor_id = auth.uid() or public.eh_admin());

-- ---------------------------------------------------------------------
-- 6. PERMISSÕES DE ACESSO PELA API
-- (as regras RLS acima continuam decidindo QUEM vê O QUÊ;
--  isto só libera o app a conversar com as tabelas)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.eh_aprovado(), public.eh_admin(),
  public.substituir_acervo(jsonb, jsonb) to authenticated;
revoke execute on function public.substituir_acervo(jsonb, jsonb) from anon, public;

-- =====================================================================
-- DEPOIS DE SE CADASTRAR PELO APP, torne-se administrador rodando
-- (troque pelo seu e-mail):
--
--   update public.usuarios set role = 'admin', status = 'aprovado'
--   where email = 'seu.email@tjal.jus.br';
-- =====================================================================


-- =====================================================================
-- (incluído a partir de migracao-2-filas.sql)
-- =====================================================================
-- MetaJus — atualização 2 (22/11/2026)
-- Fila/fluxo/última movimentação nos processos parados + resumo das
-- filas de cumprimento. Pode rodar mais de uma vez sem problema.
-- =====================================================================

alter table public.processos
  add column if not exists fila text,
  add column if not exists fluxo text,
  add column if not exists ultima_mov date;
create index if not exists processos_fila_idx on public.processos (fila);

-- Resumo das filas (só números agregados: fluxo, fila, faixa, quantidade)
create table if not exists public.filas_snapshots (
  id          bigserial primary key,
  criado_em   timestamptz not null default now(),
  referencia  text,                 -- 'AAAA-MM' do relatório
  total       int not null,
  itens       jsonb not null,       -- [{fluxo, area, fila, faixa, qtd}]
  usuario_id  uuid default auth.uid() references public.usuarios(id) on delete set null
);
alter table public.filas_snapshots enable row level security;
drop policy if exists filas_ver on public.filas_snapshots;
create policy filas_ver on public.filas_snapshots for select using (public.eh_aprovado());
drop policy if exists filas_admin_inserir on public.filas_snapshots;
create policy filas_admin_inserir on public.filas_snapshots for insert with check (public.eh_admin());
grant select, insert on public.filas_snapshots to authenticated;
grant usage, select on sequence public.filas_snapshots_id_seq to authenticated;

-- Troca do acervo agora grava também fila, fluxo e última movimentação
create or replace function public.substituir_acervo(itens jsonb, resumo jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then
    raise exception 'Apenas o administrador pode atualizar a base.';
  end if;

  delete from public.processos where true;

  insert into public.processos (numero, faixa, faixa_texto, local, sequencial, fila, fluxo, ultima_mov)
  select distinct on (x->>'numero')
         x->>'numero',
         coalesce((x->>'faixa')::int, 0),
         x->>'faixa_texto',
         coalesce(x->>'local', ''),
         case when (x->>'sequencial') ~ '^[0-9]$' then (x->>'sequencial')::int end,
         nullif(x->>'fila', ''),
         nullif(x->>'fluxo', ''),
         case when (x->>'ultima_mov') ~ '^\d{4}-\d{2}-\d{2}$' then (x->>'ultima_mov')::date end
  from jsonb_array_elements(itens) x
  where coalesce(x->>'numero', '') <> ''
  order by x->>'numero', coalesce((x->>'faixa')::int, 0) desc;
  get diagnostics n = row_count;

  delete from public.cumpridos c
  where not exists (select 1 from public.processos p where p.numero = c.numero);

  insert into public.importacoes (total, resumo, usuario_id) values (n, resumo, auth.uid());
  return n;
end $$;
-- ============================================================
-- MetaJus — Migração 3: Metas CNJ (Meta 2 — processos mais antigos)
-- Guarda o retrato do painel "(PG) Metas CNJ" do SAJ Insights:
--   resumo  = contagens das perguntas (P2.1, P2.25, P2.5 por mês...)
--   pendentes = lista do Saldo (só nº do processo, ano, classe e assunto)
-- ============================================================
create table if not exists public.metas_cnj (
  id          bigserial primary key,
  criado_em   timestamptz not null default now(),
  meta        int not null default 2,
  referencia  text,
  resumo      jsonb not null default '{}',
  pendentes   jsonb not null default '[]',
  usuario_id  uuid default auth.uid() references public.usuarios(id) on delete set null
);
alter table public.metas_cnj enable row level security;
drop policy if exists metas_cnj_ver on public.metas_cnj;
create policy metas_cnj_ver on public.metas_cnj for select using (public.eh_aprovado());
drop policy if exists metas_cnj_inserir on public.metas_cnj;
create policy metas_cnj_inserir on public.metas_cnj for insert with check (public.eh_admin());
grant select, insert on public.metas_cnj to authenticated;
grant usage, select on sequence public.metas_cnj_id_seq to authenticated;
-- ============================================================
-- MetaJus — Migração 4: processos de cada fila (Fluxo e Fila, nível processo)
-- Guarda só: nº do processo, fila, fluxo, faixa de dias, data de entrada na fila,
-- classe e assunto (sem partes/CPF — LGPD).
-- ============================================================
create table if not exists public.fila_processos (
  id        bigserial primary key,
  numero    text not null,
  fila      text not null,
  fluxo     text,
  faixa     text,
  entrada   date,
  classe    text,
  assunto   text
);
create index if not exists fila_processos_fila_idx on public.fila_processos (fila);
create index if not exists fila_processos_numero_idx on public.fila_processos (numero);
alter table public.fila_processos enable row level security;
drop policy if exists fila_processos_ver on public.fila_processos;
create policy fila_processos_ver on public.fila_processos for select using (public.eh_aprovado());
grant select on public.fila_processos to authenticated;

-- Substitui a lista inteira em partes (parte 0 apaga a lista antiga; a última parte grava o resumo)
drop function if exists public.substituir_filas_processos(jsonb, jsonb, int, text);
create or replace function public.substituir_filas_processos(itens jsonb, parte int, agregado jsonb, total int, referencia text)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Somente administradores podem importar.'; end if;
  if parte = 0 then delete from public.fila_processos where true; end if;
  insert into public.fila_processos (numero, fila, fluxo, faixa, entrada, classe, assunto)
  select x->>'numero', x->>'fila', x->>'fluxo', x->>'faixa', nullif(x->>'entrada', '')::date, x->>'classe', x->>'assunto'
  from jsonb_array_elements(itens) x;
  if agregado is not null then
    insert into public.filas_snapshots (itens, total, referencia) values (agregado, total, referencia);
  end if;
  return jsonb_array_length(itens);
end $$;
revoke all on function public.substituir_filas_processos(jsonb, int, jsonb, int, text) from public;
grant execute on function public.substituir_filas_processos(jsonb, int, jsonb, int, text) to authenticated;


-- =====================================================================
-- MetaJus — migração 5: Listas de cumprimento (Corregedoria, chefia…)
-- Rodar no Supabase > SQL Editor. Pode rodar de novo sem problema.
-- LGPD: guarda só número do processo, sequencial, área, dias na fila,
-- tarjas operacionais (saúde/idade viram "Prioridade legal") e a
-- providência pedida. Nada de nomes de partes.
-- =====================================================================

create table if not exists public.tarefas_listas (
  id          bigint generated always as identity primary key,
  titulo      text not null,
  tipo        text not null default 'cumprir' check (tipo in ('cumprir','audiencia')),
  orientacao  text,
  origem      text,
  prazo       date,
  total       int not null default 0,
  criado_por  uuid default auth.uid() references public.usuarios(id) on delete set null,
  criado_em   timestamptz not null default now(),
  encerrada   boolean not null default false
);

create table if not exists public.tarefas_itens (
  id            bigint generated always as identity primary key,
  lista_id      bigint not null references public.tarefas_listas(id) on delete cascade,
  ordem         int not null default 0,
  numero        text not null,
  sequencial    int check (sequencial between 0 and 9),
  area          text,
  dias          int,
  tarjas        text,
  providencia   text,
  aud_tipo      text,
  status        text not null default 'pendente' check (status in ('pendente','feito')),
  feito_por     uuid references public.usuarios(id) on delete set null,
  feito_em      timestamptz,
  mexido_por    uuid references public.usuarios(id) on delete set null,
  mexido_em     timestamptz,
  unique (lista_id, numero)
);
create index if not exists tarefas_itens_lista on public.tarefas_itens(lista_id);

alter table public.tarefas_listas enable row level security;
alter table public.tarefas_itens  enable row level security;

drop policy if exists tarefas_listas_ver on public.tarefas_listas;
create policy tarefas_listas_ver on public.tarefas_listas for select using (public.eh_aprovado());
drop policy if exists tarefas_listas_admin on public.tarefas_listas;
create policy tarefas_listas_admin on public.tarefas_listas for update
  using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists tarefas_listas_excluir on public.tarefas_listas;
create policy tarefas_listas_excluir on public.tarefas_listas for delete using (public.eh_admin());

drop policy if exists tarefas_itens_ver on public.tarefas_itens;
create policy tarefas_itens_ver on public.tarefas_itens for select using (public.eh_aprovado());

grant select on public.tarefas_listas, public.tarefas_itens to authenticated;
grant update, delete on public.tarefas_listas to authenticated;

-- Resumo para os discos de andamento (respeita as regras de acesso)
create or replace view public.tarefas_resumo with (security_invoker = true) as
  select lista_id, sequencial, status, (aud_tipo is not null) as com_tipo, count(*)::int as qtd
  from public.tarefas_itens group by 1, 2, 3, 4;
grant select on public.tarefas_resumo to authenticated;

-- Cria uma lista com todos os processos de uma vez (só admin)
create or replace function public.criar_lista_tarefas(lista jsonb, itens jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare novo bigint;
begin
  if not public.eh_admin() then raise exception 'Somente administradores podem criar listas.'; end if;
  insert into public.tarefas_listas (titulo, tipo, orientacao, origem, prazo, total)
  values (left(coalesce(nullif(trim(lista->>'titulo'), ''), 'Lista de cumprimento'), 120),
          coalesce(nullif(lista->>'tipo', ''), 'cumprir'),
          left(lista->>'orientacao', 1000), left(lista->>'origem', 120),
          nullif(lista->>'prazo', '')::date, jsonb_array_length(itens))
  returning id into novo;
  insert into public.tarefas_itens (lista_id, ordem, numero, sequencial, area, dias, tarjas, providencia)
  select novo, coalesce((x->>'ordem')::int, 0), x->>'numero', nullif(x->>'sequencial', '')::int,
         left(x->>'area', 40), nullif(x->>'dias', '')::int, left(x->>'tarjas', 160), left(x->>'providencia', 300)
  from jsonb_array_elements(itens) x
  where coalesce(x->>'numero', '') <> ''
  on conflict (lista_id, numero) do nothing;
  update public.tarefas_listas set total = (select count(*) from public.tarefas_itens where lista_id = novo) where id = novo;
  return novo;
end $$;

-- Marca / desmarca um processo da lista (qualquer servidor aprovado).
--   status: 'feito' ou 'pendente'; tipo: tipo de audiência ('' apaga, null mantém)
-- Só quem marcou (ou um admin) pode desfazer o "feito".
create or replace function public.marcar_tarefa(item bigint, novo_status text, tipo text default null)
returns public.tarefas_itens language plpgsql security definer set search_path = public as $$
declare r public.tarefas_itens;
begin
  if not public.eh_aprovado() then raise exception 'Acesso não aprovado.'; end if;
  select * into r from public.tarefas_itens where id = item for update;
  if not found then raise exception 'Processo não encontrado na lista.'; end if;
  if (select encerrada from public.tarefas_listas where id = r.lista_id) then
    raise exception 'Esta lista foi encerrada.';
  end if;
  if novo_status = 'pendente' and r.status = 'feito'
     and r.feito_por is distinct from auth.uid() and not public.eh_admin() then
    raise exception 'Só quem marcou (ou o administrador) pode desfazer.';
  end if;
  update public.tarefas_itens set
    status    = coalesce(nullif(novo_status, ''), status),
    feito_por = case when novo_status = 'feito' and status <> 'feito' then auth.uid()
                     when novo_status = 'pendente' then null else feito_por end,
    feito_em  = case when novo_status = 'feito' and status <> 'feito' then now()
                     when novo_status = 'pendente' then null else feito_em end,
    aud_tipo  = case when tipo is null then aud_tipo else nullif(left(tipo, 40), '') end,
    mexido_por = auth.uid(), mexido_em = now()
  where id = item returning * into r;
  return r;
end $$;

revoke all on function public.criar_lista_tarefas(jsonb, jsonb) from public, anon;
revoke all on function public.marcar_tarefa(bigint, text, text) from public, anon;
grant execute on function public.criar_lista_tarefas(jsonb, jsonb) to authenticated;
grant execute on function public.marcar_tarefa(bigint, text, text) to authenticated;
