# MetaJus

Aplicativo (PWA) de gestão de cumprimentos e metas da **Comarca de Santa Luzia do Norte (TJAL)**.
Funciona no celular pelo navegador e pode ser instalado na tela inicial, sem loja de aplicativos.

## O que o app faz

| Módulo | Função |
|---|---|
| **Meu painel** | Processos sob seus sequenciais, quantos cumpriu hoje, avisos e Termômetro do mês |
| **1. Processos Parados** | Escolhe a faixa (+30 … +365 dias), filtra seus finais e o local (Cartório/Gabinete), copia o número com um toque e marca **Cumprido** |
| **2. Entradas e Meta** | Meta = **Entradas + 1**; mostra quanto falta arquivar para fechar o mês com saldo positivo |
| **3. Perfis (Admin)** | Aprova cadastros, define setor (Cartório/Gabinete/Híbrido), especialidades (Geral, Réu Preso, Saúde, SEEU) e sequenciais |
| **4. Gabinete e Comandos** | Conclusos por faixa de dias e comandos com urgência (Réu Preso, Saúde, Medida Protetiva…) para Cartório, Gabinete ou um servidor |
| **5. Repasse de Diligências** | Encaminha um processo (ex.: SISBAJUD) ao colega habilitado, que marca Cumprido ou Devolve |
| **QR Code** | Na Administração: o colega lê, instala e se cadastra; o acesso fica **Pendente** até você aprovar |

## LGPD

Só são tratados: número do processo (CNJ), faixa de dias, localização e sequencial.
A planilha é lida **no próprio aparelho**; o restante das colunas é descartado e nunca sai do celular/PC.
Colunas de segredo de justiça/sigilo, se existirem na planilha, fazem a linha ser ignorada.

## Estrutura

```
index.html          telas (login, cadastro, módulos)
manifest.json       instalação como app
sw.js               cache da "casca" do app (nunca guarda dados de processos)
css/style.css       visual mobile
js/config.js        chaves do Supabase + listas (faixas, especialidades, diligências)
js/db.js            banco (Supabase) ou modo demonstração (localStorage)
js/parser.js        leitura da planilha do SAJ Insights
js/auth.js          login, cadastro, aguardando aprovação
js/app.js           módulos
supabase/schema.sql tabelas e regras de segurança (RLS)
icons/              ícones do app
```

## Implantação passo a passo

### 1. Supabase (banco e login) — grátis
1. Crie uma conta em https://supabase.com e um **New project** (região São Paulo, se disponível).
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**, e cole em `js/config.js`.
   (Nunca use a chave `service_role` no app.)
4. Em **Authentication → URL Configuration**, coloque em **Site URL** o endereço do GitHub Pages
   (ex.: `https://SEU-USUARIO.github.io/metajus/`) e adicione o mesmo em **Redirect URLs**.
5. (Opcional) Em **Authentication → Providers → Email**, desligue "Confirm email" se não quiser
   que os colegas precisem confirmar o e-mail — a aprovação do admin já controla o acesso.

### 2. GitHub Pages
1. Crie o repositório `metajus` no GitHub e envie estes arquivos.
2. **Settings → Pages → Branch: main / (root) → Save**. Em 1–2 minutos o app fica em
   `https://SEU-USUARIO.github.io/metajus/`.

### 3. Virar administrador
1. Abra o link, toque em **Solicitar cadastro** e cadastre-se.
2. No Supabase, **SQL Editor**, rode (com seu e-mail):
   ```sql
   update public.usuarios set role = 'admin', status = 'aprovado' where email = 'seu.email@tjal.jus.br';
   ```
3. Entre no app: aparece o botão **Administração**.

### 4. Piloto
1. Em **Administração → Atualizar base**, envie a planilha de processos parados do SAJ Insights.
2. Em **Entradas e Meta**, lance (ou importe) entradas e arquivados do mês.
3. Mostre o **QR Code** a 2 ou 3 colegas, aprove-os e confira os filtros antes de liberar para todos.

## Modo demonstração
Com `SUPABASE_URL` vazio em `js/config.js`, o app roda só no aparelho: o primeiro cadastro vira
admin, há botão para gerar processos fictícios (ano 2099) e para "entrar como" outro usuário.

## Atualizações
Ao publicar mudanças, aumente `VERSAO` em `sw.js` (ex.: `metajus-v2`) para os celulares baixarem a nova versão.
