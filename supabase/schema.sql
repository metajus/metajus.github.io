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

-- =====================================================================
-- DEPOIS DE SE CADASTRAR PELO APP, torne-se administrador rodando
-- (troque pelo seu e-mail):
--
--   update public.usuarios set role = 'admin', status = 'aprovado'
--   where email = 'seu.email@tjal.jus.br';
-- =====================================================================
