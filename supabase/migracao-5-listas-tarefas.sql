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
