// ============================================================
// Camada de dados do MetaJus
// - Modo SUPABASE: quando config.js tem URL e chave preenchidas.
// - Modo DEMO: sem configuração; guarda tudo no localStorage
//   deste aparelho, apenas para testar telas e filtros.
// As duas implementações têm exatamente os mesmos métodos.
// ============================================================
(function () {
  const cfg = window.METAJUS_CONFIG || {};
  const temSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

  // ----------------------------------------------------------
  // SUPABASE
  // ----------------------------------------------------------
  function criarSupabase() {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Biblioteca do Supabase não carregou. Verifique a internet.');
    }
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const ok = ({ data, error }) => { if (error) throw traduzErro(error); return data; };

    return {
      modo: 'supabase',

      async sessaoAtual() {
        const { data } = await sb.auth.getSession();
        const s = data && data.session;
        return s ? { userId: s.user.id, email: s.user.email } : null;
      },
      async entrar(email, senha) {
        ok(await sb.auth.signInWithPassword({ email, password: senha }));
      },
      async cadastrar(d) {
        const data = ok(await sb.auth.signUp({
          email: d.email,
          password: d.senha,
          options: {
            emailRedirectTo: location.origin + location.pathname,
            data: { nome: d.nome, setor: d.setor, especialidades: d.especialidades, sequenciais: d.sequenciais }
          }
        }));
        return { precisaConfirmarEmail: !data.session };
      },
      async sair() { await sb.auth.signOut(); },
      async recuperarSenha(email) {
        ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
      },
      async trocarSenha(nova) { ok(await sb.auth.updateUser({ password: nova })); },
      aoMudarSessao(fn) { sb.auth.onAuthStateChange((evento) => fn(evento)); },

      async meuPerfil() {
        const s = await this.sessaoAtual();
        if (!s) return null;
        return ok(await sb.from('usuarios').select('*').eq('id', s.userId).maybeSingle());
      },
      async listarUsuarios() {
        return ok(await sb.from('usuarios').select('*').order('status').order('nome'));
      },
      async atualizarUsuario(id, campos) {
        ok(await sb.from('usuarios').update(campos).eq('id', id));
      },
      async excluirUsuario(id) {
        ok(await sb.from('usuarios').delete().eq('id', id));
      },

      async substituirAcervo(itens, resumo) {
        return ok(await sb.rpc('substituir_acervo', { itens, resumo }));
      },
      async listarProcessos() {
        // O Supabase devolve no máximo 1000 linhas por vez: busca em páginas.
        let todos = [], de = 0;
        const passo = 1000;
        for (;;) {
          const pg = ok(await sb.from('processos')
            .select('numero,faixa,faixa_texto,local,sequencial,fila,fluxo,ultima_mov')
            .order('faixa', { ascending: false }).order('numero')
            .range(de, de + passo - 1));
          todos = todos.concat(pg);
          if (pg.length < passo) break;
          de += passo;
        }
        return todos;
      },
      async listarImportacoes(limite = 5) {
        return ok(await sb.from('importacoes').select('*').order('criado_em', { ascending: false }).limit(limite));
      },
      async listarCumpridos() {
        return ok(await sb.from('cumpridos').select('*'));
      },
      async marcarCumprido(numero) {
        ok(await sb.from('cumpridos').insert({ numero }));
      },
      async desmarcarCumprido(numero) {
        ok(await sb.from('cumpridos').delete().eq('numero', numero));
      },

      async obterMeta(mes) {
        return ok(await sb.from('metas_mensais').select('*').eq('mes', mes).maybeSingle());
      },
      async salvarMeta(mes, entradas, arquivados) {
        const s = await this.sessaoAtual();
        ok(await sb.from('metas_mensais').upsert({
          mes, entradas, arquivados, atualizado_em: new Date().toISOString(), atualizado_por: s && s.userId
        }));
      },
      // Atualiza só um dos campos (ex.: importou só os Baixados)
      async salvarMetaCampo(mes, campo, valor) {
        const atual = await this.obterMeta(mes);
        const e = campo === 'entradas' ? valor : (atual ? atual.entradas : 0);
        const a = campo === 'arquivados' ? valor : (atual ? atual.arquivados : 0);
        await this.salvarMeta(mes, e, a);
      },

      async listarMetas() {
        return ok(await sb.from('metas_mensais').select('*').order('mes'));
      },
      async ultimaMetaCNJ(meta) {
        return ok(await sb.from('metas_cnj').select('*').eq('meta', meta).order('criado_em', { ascending: false }).limit(1).maybeSingle());
      },
      async salvarMetaCNJ(reg) {
        ok(await sb.from('metas_cnj').insert(reg));
      },
      async salvarFilasProcessos(itens, agregado, total, referencia, progresso) {
        const T = 1500, partes = Math.max(1, Math.ceil(itens.length / T));
        for (let k = 0; k < partes; k++) {
          const ultima = k === partes - 1;
          ok(await sb.rpc('substituir_filas_processos', { itens: itens.slice(k * T, (k + 1) * T), parte: k,
            agregado: ultima ? agregado : null, total, referencia }));
          if (progresso) progresso(k + 1, partes);
        }
        return itens.length;
      },
      async filasDosNumeros(nums) {
        const out = [];
        for (let k = 0; k < nums.length; k += 150) out.push(...ok(await sb.from('fila_processos').select('numero,fila,entrada').in('numero', nums.slice(k, k + 150))));
        return out;
      },
      async listarFilaProcessos(filas) {
        const out = [];
        for (let de = 0; ; de += 1000) {
          const r = ok(await sb.from('fila_processos').select('numero,fila,fluxo,faixa,entrada,classe,assunto')
            .in('fila', filas).order('entrada', { ascending: true }).range(de, de + 999));
          out.push(...r); if (r.length < 1000) break;
        }
        return out;
      },
      async ultimaFila() {
        return ok(await sb.from('filas_snapshots').select('*').order('criado_em', { ascending: false }).limit(1).maybeSingle());
      },
      async salvarFilas(itens, total, referencia) {
        ok(await sb.from('filas_snapshots').insert({ itens, total, referencia }));
      },

      async listarComandos() {
        return ok(await sb.from('comandos').select('*').order('criado_em', { ascending: false }).limit(300));
      },
      async criarComando(c) { ok(await sb.from('comandos').insert(c)); },
      async atualizarComando(id, campos) { ok(await sb.from('comandos').update(campos).eq('id', id)); },
      async excluirComando(id) { ok(await sb.from('comandos').delete().eq('id', id)); },

      async listarRepasses() {
        return ok(await sb.from('repasses').select('*').order('criado_em', { ascending: false }).limit(300));
      },
      async criarRepasse(r) { ok(await sb.from('repasses').insert(r)); },
      async atualizarRepasse(id, campos) { ok(await sb.from('repasses').update(campos).eq('id', id)); },
      async excluirRepasse(id) { ok(await sb.from('repasses').delete().eq('id', id)); },

      // ---- Listas de cumprimento (Corregedoria, chefia…) ----
      async listarListasTarefas() {
        const listas = ok(await sb.from('tarefas_listas').select('*').order('encerrada').order('criado_em', { ascending: false }).limit(100));
        const resumo = ok(await sb.from('tarefas_resumo').select('*'));
        return { listas, resumo };
      },
      async criarListaTarefas(lista, itens) {
        return ok(await sb.rpc('criar_lista_tarefas', { lista, itens }));
      },
      async itensDaLista(id) {
        let todos = [], de = 0;
        for (;;) {
          const pg = ok(await sb.from('tarefas_itens').select('*').eq('lista_id', id).order('ordem').range(de, de + 999));
          todos = todos.concat(pg);
          if (pg.length < 1000) break;
          de += 1000;
        }
        return todos;
      },
      async marcarTarefa(item, status, tipo) {
        return ok(await sb.rpc('marcar_tarefa', { item, novo_status: status || null, tipo: tipo === undefined ? null : tipo }));
      },
      async atualizarListaTarefas(id, campos) { ok(await sb.from('tarefas_listas').update(campos).eq('id', id)); },
      async excluirListaTarefas(id) { ok(await sb.from('tarefas_listas').delete().eq('id', id)); }
    };
  }

  function traduzErro(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    const mapa = [
      [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
      [/Email not confirmed/i, 'Confirme seu e-mail pelo link enviado antes de entrar.'],
      [/User already registered/i, 'Este e-mail já tem cadastro. Use "Entrar".'],
      [/Password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
      [/rate limit/i, 'Muitas tentativas seguidas. Aguarde alguns minutos.'],
      [/Failed to fetch|NetworkError/i, 'Sem conexão com o servidor. Verifique a internet.'],
      [/row-level security|permission denied/i, 'Sem permissão para esta ação.'],
      [/duplicate key/i, 'Já marcado por outro servidor. Atualize a tela.']
    ];
    for (const [re, txt] of mapa) if (re.test(m)) return new Error(txt);
    return new Error(m);
  }

  // ----------------------------------------------------------
  // DEMO (localStorage)
  // ----------------------------------------------------------
  function criarDemo() {
    const CHAVE = 'metajus_demo_v1';
    const ler = () => {
      try { return JSON.parse(localStorage.getItem(CHAVE)) || null; } catch (_) { return null; }
    };
    let st = ler() || {
      usuarios: [], senhas: {}, sessao: null, processos: [], importacoes: [],
      cumpridos: [], metas: {}, comandos: [], repasses: [], seq: 1
    };
    const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(st)); } catch (_) {} };
    const agora = () => new Date().toISOString();
    const uid = () => 'u' + (st.seq++) + '-' + Math.random().toString(36).slice(2, 8);
    const eu = () => st.sessao && st.usuarios.find((u) => u.id === st.sessao);
    const exigeAprovado = () => { const u = eu(); if (!u || u.status !== 'aprovado') throw new Error('Sem permissão para esta ação.'); return u; };
    const exigeAdmin = () => { const u = exigeAprovado(); if (u.role !== 'admin') throw new Error('Apenas o administrador.'); return u; };
    const copia = (x) => JSON.parse(JSON.stringify(x));

    return {
      modo: 'demo',
      async sessaoAtual() { const u = eu(); return u ? { userId: u.id, email: u.email } : null; },
      async entrar(email, senha) {
        const u = st.usuarios.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
        if (!u || st.senhas[u.id] !== senha) throw new Error('E-mail ou senha incorretos.');
        st.sessao = u.id; salvar();
      },
      async cadastrar(d) {
        if (st.usuarios.some((x) => x.email.toLowerCase() === d.email.toLowerCase())) {
          throw new Error('Este e-mail já tem cadastro. Use "Entrar".');
        }
        if (!d.senha || d.senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
        const primeiro = st.usuarios.length === 0; // no demo, o 1º cadastro vira admin
        const u = {
          id: uid(), nome: d.nome, email: d.email, setor: d.setor,
          especialidades: d.especialidades.length ? d.especialidades : ['Geral'],
          sequenciais: d.sequenciais, role: primeiro ? 'admin' : 'servidor',
          status: primeiro ? 'aprovado' : 'pendente', criado_em: agora()
        };
        st.usuarios.push(u); st.senhas[u.id] = d.senha; st.sessao = u.id; salvar();
        return { precisaConfirmarEmail: false };
      },
      async sair() { st.sessao = null; salvar(); },
      async recuperarSenha() { throw new Error('No modo demonstração não há envio de e-mail.'); },
      async trocarSenha(nova) { const u = eu(); if (u) { st.senhas[u.id] = nova; salvar(); } },
      aoMudarSessao() {},

      async meuPerfil() { const u = eu(); return u ? copia(u) : null; },
      async listarUsuarios() { exigeAprovado(); return copia(st.usuarios); },
      async atualizarUsuario(id, campos) {
        exigeAdmin();
        const u = st.usuarios.find((x) => x.id === id); if (u) Object.assign(u, campos); salvar();
      },
      async excluirUsuario(id) {
        exigeAdmin();
        st.usuarios = st.usuarios.filter((x) => x.id !== id); delete st.senhas[id]; salvar();
      },

      async substituirAcervo(itens, resumo) {
        const u = exigeAdmin();
        const mapa = new Map();
        for (const p of itens) {
          const ant = mapa.get(p.numero);
          if (!ant || p.faixa > ant.faixa) mapa.set(p.numero, { ...p, importado_em: agora() });
        }
        st.processos = [...mapa.values()];
        const nums = new Set(mapa.keys());
        st.cumpridos = st.cumpridos.filter((c) => nums.has(c.numero));
        st.importacoes.unshift({ id: st.seq++, criado_em: agora(), total: st.processos.length, resumo, usuario_id: u.id });
        salvar();
        return st.processos.length;
      },
      async listarProcessos() {
        exigeAprovado();
        return copia(st.processos).sort((a, b) => b.faixa - a.faixa || a.numero.localeCompare(b.numero));
      },
      async listarImportacoes(limite = 5) { exigeAprovado(); return copia(st.importacoes.slice(0, limite)); },
      async listarCumpridos() { exigeAprovado(); return copia(st.cumpridos); },
      async marcarCumprido(numero) {
        const u = exigeAprovado();
        if (st.cumpridos.some((c) => c.numero === numero)) throw new Error('Já marcado por outro servidor.');
        st.cumpridos.push({ numero, usuario_id: u.id, cumprido_em: agora() }); salvar();
      },
      async desmarcarCumprido(numero) {
        const u = exigeAprovado();
        st.cumpridos = st.cumpridos.filter((c) => !(c.numero === numero && (c.usuario_id === u.id || u.role === 'admin')));
        salvar();
      },

      async obterMeta(mes) { exigeAprovado(); return st.metas[mes] ? copia(st.metas[mes]) : null; },
      async salvarMeta(mes, entradas, arquivados) {
        const u = exigeAdmin();
        st.metas[mes] = { mes, entradas, arquivados, atualizado_em: agora(), atualizado_por: u.id }; salvar();
      },

      async salvarMetaCampo(mes, campo, valor) {
        const atual = st.metas[mes] || { entradas: 0, arquivados: 0 };
        await this.salvarMeta(mes, campo === 'entradas' ? valor : atual.entradas, campo === 'arquivados' ? valor : atual.arquivados);
      },
      async listarMetas() { exigeAprovado(); return Object.values(st.metas).map(copia).sort((a, b) => a.mes.localeCompare(b.mes)); },
      async ultimaMetaCNJ(meta) { exigeAprovado(); const l = (st.metasCnj || []).filter((x) => x.meta === meta); return l.length ? copia(l[l.length - 1]) : null; },
      async salvarMetaCNJ(reg) {
        const u = exigeAdmin();
        (st.metasCnj = st.metasCnj || []).push({ id: st.seq++, criado_em: agora(), usuario_id: u.id, ...reg }); salvar();
      },
      async salvarFilasProcessos(itens, agregado, total, referencia) {
        const u = exigeAdmin();
        st.filaProc = itens;
        st.filas = { id: st.seq++, criado_em: agora(), itens: agregado, total, referencia, usuario_id: u.id }; salvar();
        return itens.length;
      },
      async filasDosNumeros(nums) { exigeAprovado(); return copia((st.filaProc || []).filter((x) => nums.includes(x.numero))); },
      async listarFilaProcessos(filas) { exigeAprovado(); return copia((st.filaProc || []).filter((x) => filas.includes(x.fila))).sort((a, b) => String(a.entrada).localeCompare(String(b.entrada))); },
      async ultimaFila() { exigeAprovado(); return st.filas ? copia(st.filas) : null; },
      async salvarFilas(itens, total, referencia) {
        const u = exigeAdmin();
        st.filas = { id: st.seq++, criado_em: agora(), itens, total, referencia, usuario_id: u.id }; salvar();
      },

      async listarComandos() { exigeAprovado(); return copia(st.comandos).sort((a, b) => b.criado_em.localeCompare(a.criado_em)); },
      async criarComando(c) {
        const u = exigeAprovado();
        st.comandos.push({ id: st.seq++, status: 'aberto', criado_em: agora(), autor_id: u.id, ...c }); salvar();
      },
      async atualizarComando(id, campos) {
        exigeAprovado(); const c = st.comandos.find((x) => x.id === id); if (c) Object.assign(c, campos); salvar();
      },
      async excluirComando(id) { exigeAprovado(); st.comandos = st.comandos.filter((x) => x.id !== id); salvar(); },

      async listarRepasses() { exigeAprovado(); return copia(st.repasses).sort((a, b) => b.criado_em.localeCompare(a.criado_em)); },
      async criarRepasse(r) {
        const u = exigeAprovado();
        st.repasses.push({ id: st.seq++, status: 'pendente', criado_em: agora(), autor_id: u.id, ...r }); salvar();
      },
      async atualizarRepasse(id, campos) {
        exigeAprovado(); const r = st.repasses.find((x) => x.id === id); if (r) Object.assign(r, campos); salvar();
      },
      async excluirRepasse(id) { exigeAprovado(); st.repasses = st.repasses.filter((x) => x.id !== id); salvar(); },

      // ---- Listas de cumprimento ----
      async listarListasTarefas() {
        exigeAprovado();
        const listas = copia(st.tListas || []).sort((a, b) => (a.encerrada - b.encerrada) || b.criado_em.localeCompare(a.criado_em));
        const m = new Map();
        (st.tItens || []).forEach((x) => {
          const k = [x.lista_id, x.sequencial, x.status, !!x.aud_tipo].join('|');
          const r = m.get(k) || { lista_id: x.lista_id, sequencial: x.sequencial, status: x.status, com_tipo: !!x.aud_tipo, qtd: 0 };
          r.qtd++; m.set(k, r);
        });
        return { listas, resumo: [...m.values()] };
      },
      async criarListaTarefas(lista, itens) {
        const u = exigeAdmin();
        const id = st.seq++;
        st.tListas = st.tListas || []; st.tItens = st.tItens || [];
        const vistos = new Set();
        itens.forEach((x) => {
          if (!x.numero || vistos.has(x.numero)) return; vistos.add(x.numero);
          st.tItens.push({ id: st.seq++, lista_id: id, ordem: x.ordem || 0, numero: x.numero, sequencial: x.sequencial, area: x.area || null, dias: x.dias, tarjas: x.tarjas || null, providencia: x.providencia || null, aud_tipo: null, status: 'pendente', feito_por: null, feito_em: null });
        });
        st.tListas.push({ id, titulo: lista.titulo || 'Lista de cumprimento', tipo: lista.tipo || 'cumprir', orientacao: lista.orientacao || null, origem: lista.origem || null, prazo: lista.prazo || null, total: vistos.size, criado_por: u.id, criado_em: agora(), encerrada: false });
        salvar(); return id;
      },
      async itensDaLista(id) { exigeAprovado(); return copia((st.tItens || []).filter((x) => x.lista_id === id)).sort((a, b) => a.ordem - b.ordem); },
      async marcarTarefa(item, status, tipo) {
        const u = exigeAprovado();
        const r = (st.tItens || []).find((x) => x.id === item);
        if (!r) throw new Error('Processo não encontrado na lista.');
        const l = st.tListas.find((x) => x.id === r.lista_id);
        if (l && l.encerrada) throw new Error('Esta lista foi encerrada.');
        if (status === 'pendente' && r.status === 'feito' && r.feito_por !== u.id && u.role !== 'admin') throw new Error('Só quem marcou (ou o administrador) pode desfazer.');
        if (status === 'feito' && r.status !== 'feito') { r.feito_por = u.id; r.feito_em = agora(); }
        if (status === 'pendente') { r.feito_por = null; r.feito_em = null; }
        if (status) r.status = status;
        if (tipo !== undefined && tipo !== null) r.aud_tipo = tipo || null;
        salvar(); return copia(r);
      },
      async atualizarListaTarefas(id, campos) { exigeAdmin(); const l = (st.tListas || []).find((x) => x.id === id); if (l) Object.assign(l, campos); salvar(); },
      async excluirListaTarefas(id) { exigeAdmin(); st.tListas = (st.tListas || []).filter((x) => x.id !== id); st.tItens = (st.tItens || []).filter((x) => x.lista_id !== id); salvar(); },

      // Exclusivo do demo: entrar como outro usuário e apagar tudo
      async demoEntrarComo(id) { st.sessao = id; salvar(); },
      async demoResetar() { localStorage.removeItem(CHAVE); location.reload(); }
    };
  }

  window.DB = temSupabase ? criarSupabase() : criarDemo();
})();
