// ============================================================
// MetaJus — módulos principais
//  #/           Início (Meu Painel + Termômetro do mês + avisos)
//  #/parados    1. Processos Parados (faixa + sequencial + Cartório/Gabinete)
//  #/meta       2. Entradas e Meta do Mês (Meta = Entradas + 1)
//  #/gabinete   4. Painel do Gabinete e Comandos
//  #/repasses   5. Repasse de Diligências
//  #/admin      3. Perfis, aprovações, QR Code e atualização da base
//  #/conta      Minha conta
// ============================================================
(function () {
  const cfg = window.METAJUS_CONFIG;
  const { esc, $, $$ } = UI;

  const S = {
    perfil: null, usuarios: [], processos: [], cumpridos: [], importacoes: [],
    comandos: [], repasses: [], meta: null
  };
  const estadoParadosInicial = () => ({ faixa: null, eAcima: false, local: null, seqs: null, busca: '', limite: 200, ocultarCumpridos: false });
  let estadoParados = estadoParadosInicial();
  let donoEstado = null; // filtros são zerados quando outro usuário entra no aparelho

  const ehAdmin = () => S.perfil && S.perfil.role === 'admin';
  const podeGabinete = () => ehAdmin() || ['Gabinete', 'Híbrido'].includes(S.perfil.setor);
  const mesAtual = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const nomeMes = (m) => { const [a, mm] = m.split('-'); return new Date(+a, +mm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
  const nomeUsuario = (id) => { const u = S.usuarios.find((x) => x.id === id); return u ? u.nome : '—'; };
  const hoje = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();
  const classeFaixa = (f) => f >= 365 ? 'f365' : f >= 180 ? 'f180' : f >= 100 ? 'f100' : f >= 60 ? 'f60' : 'f30';
  const rotuloFaixa = (f) => f ? '+' + f + ' dias' : 'sem faixa';
  const consultaHash = () => new URLSearchParams((location.hash.split('?')[1]) || '');

  async function carregar(...quais) {
    const tarefas = {
      usuarios: () => DB.listarUsuarios().then((v) => (S.usuarios = v)),
      processos: () => DB.listarProcessos().then((v) => (S.processos = v)),
      cumpridos: () => DB.listarCumpridos().then((v) => (S.cumpridos = v)),
      importacoes: () => DB.listarImportacoes(5).then((v) => (S.importacoes = v)),
      comandos: () => DB.listarComandos().then((v) => (S.comandos = v)),
      repasses: () => DB.listarRepasses().then((v) => (S.repasses = v)),
      meta: () => DB.obterMeta(mesAtual()).then((v) => (S.meta = v))
    };
    await Promise.all(quais.map((q) => tarefas[q]()));
  }

  // Processos "meus": meus sequenciais, no(s) setor(es) do meu perfil
  function meusProcessos() {
    const seqs = new Set(S.perfil.sequenciais || []);
    return S.processos.filter((p) => seqs.has(p.sequencial));
  }
  function avisosParaMim() {
    const eu = S.perfil;
    const esp = new Set(eu.especialidades || []);
    const setores = eu.setor === 'Híbrido' ? ['Cartório', 'Gabinete'] : [eu.setor];
    const comandos = S.comandos.filter((c) => c.status === 'aberto' && (
      c.destinatario_id === eu.id ||
      (!c.destinatario_id && setores.includes(c.destino)) ||
      esp.has(c.urgencia)));
    const repasses = S.repasses.filter((r) => r.status === 'pendente' && r.destinatario_id === eu.id);
    return { comandos, repasses };
  }

  function calcMeta(m) {
    const entradas = m ? m.entradas : 0;
    const arquivados = m ? m.arquivados : 0;
    const meta = entradas + 1;
    const falta = Math.max(0, meta - arquivados);
    const pct = meta ? Math.min(100, Math.round((arquivados / meta) * 100)) : 0;
    return { entradas, arquivados, meta, falta, pct, batida: arquivados >= meta && !!m };
  }
  function cartaoTermometro(m, titulo) {
    const c = calcMeta(m);
    return `
      <div class="cartao termometro ${c.batida ? 'batida' : ''}">
        <div class="cartao-cab"><h3>${esc(titulo)}</h3>${c.batida ? '<span class="selo ok">Meta batida</span>' : ''}</div>
        ${m ? `
        <div class="numeros">
          <div><b>${c.entradas}</b><small>Entradas</small></div>
          <div><b>${c.arquivados}</b><small>Arquivados</small></div>
          <div><b>${c.meta}</b><small>Meta (Entr.+1)</small></div>
          <div class="destaque"><b>${c.falta}</b><small>Faltam</small></div>
        </div>
        <div class="barra"><div style="width:${c.pct}%"></div></div>
        <p class="dica">${c.batida ? 'Saldo positivo garantido neste mês.' : `Faltam ${c.falta} arquivamento(s) para fechar o mês com saldo positivo.`}</p>`
        : '<p class="dica">Números do mês ainda não lançados pelo administrador.</p>'}
      </div>`;
  }

  // ======================= INÍCIO =======================
  async function telaInicio() {
    UI.topo('MetaJus', S.perfil.nome.split(' ')[0] + ' · ' + S.perfil.setor);
    UI.render('<div class="carregando">Carregando painel…</div>');
    await carregar('processos', 'cumpridos', 'meta', 'comandos', 'repasses', 'importacoes', 'usuarios');

    const meus = meusProcessos();
    const cumpridosSet = new Set(S.cumpridos.map((c) => c.numero));
    const meusCart = meus.filter((p) => p.local === 'Cartório');
    const pendentesCart = meusCart.filter((p) => !cumpridosSet.has(p.numero));
    const meusHoje = S.cumpridos.filter((c) => c.usuario_id === S.perfil.id && hoje(c.cumprido_em)).length;
    const av = avisosParaMim();
    const imp = S.importacoes;
    let comparacao = '';
    if (imp.length >= 2) {
      const dif = imp[0].total - imp[1].total;
      comparacao = dif < 0 ? `<span class="ok-txt">&#9660; ${-dif} a menos que o relatório anterior</span>`
        : dif > 0 ? `<span class="alerta-txt">&#9650; ${dif} a mais que o relatório anterior</span>` : 'igual ao relatório anterior';
    }
    const porFaixa = {};
    for (const p of pendentesCart) porFaixa[p.faixa] = (porFaixa[p.faixa] || 0) + 1;
    const faixasDesc = [...cfg.FAIXAS].reverse();

    UI.render(`
      <section class="painel">
        <div class="cartao meu">
          <div class="cartao-cab"><h3>Meu painel</h3><span class="selo">Finais ${esc(UI.listaSeq(S.perfil.sequenciais))}</span></div>
          <div class="numeros">
            <div><b>${meus.length}</b><small>Sob minha resp.</small></div>
            <div><b>${pendentesCart.length}</b><small>A cumprir (Cartório)</small></div>
            <div class="destaque"><b>${meusHoje}</b><small>Cumpridos hoje</small></div>
          </div>
          ${pendentesCart.length ? `<div class="mini-faixas">${faixasDesc.filter((f) => porFaixa[f]).map((f) =>
            `<a class="badge ${classeFaixa(f)}" href="#/parados?faixa=${f}">${rotuloFaixa(f)}: ${porFaixa[f]}</a>`).join('')}</div>` : ''}
        </div>

        ${cartaoTermometro(S.meta, 'Termômetro de ' + nomeMes(mesAtual()))}

        ${(av.comandos.length || av.repasses.length) ? `
        <div class="cartao avisos">
          <div class="cartao-cab"><h3>Avisos para você</h3></div>
          ${av.comandos.slice(0, 3).map((c) => `<a class="aviso" href="#/gabinete"><span class="badge urg">${esc(c.urgencia)}</span> <code>${esc(c.numero)}</code> — ${esc(c.texto)}</a>`).join('')}
          ${av.repasses.slice(0, 3).map((r) => `<a class="aviso" href="#/repasses"><span class="badge dil">${esc(r.tipo)}</span> <code>${esc(r.numero)}</code> — de ${esc(nomeUsuario(r.autor_id))}</a>`).join('')}
        </div>` : ''}

        <nav class="grade-modulos">
          <a class="modulo" href="#/parados"><span class="ic">&#9203;</span><b>Processos Parados</b><small>Por faixa e sequencial</small></a>
          <a class="modulo" href="#/meta"><span class="ic">&#127919;</span><b>Entradas e Meta</b><small>Saldo positivo do mês</small></a>
          <a class="modulo" href="#/gabinete"><span class="ic">&#9878;</span><b>Gabinete e Comandos</b><small>${av.comandos.length ? av.comandos.length + ' aberto(s) p/ você' : 'Conclusos e determinações'}</small></a>
          <a class="modulo" href="#/repasses"><span class="ic">&#128257;</span><b>Repasse de Diligências</b><small>${av.repasses.length ? av.repasses.length + ' pendente(s) p/ você' : 'SISBAJUD, RENAJUD…'}</small></a>
          ${ehAdmin() ? `<a class="modulo admin" href="#/admin"><span class="ic">&#128274;</span><b>Administração</b><small>${S.usuarios.filter((u) => u.status === 'pendente').length} cadastro(s) pendente(s)</small></a>` : ''}
          <a class="modulo" href="#/conta"><span class="ic">&#128100;</span><b>Minha conta</b><small>Perfil e senha</small></a>
        </nav>

        <p class="dica centro">${imp.length ? `Base atualizada em ${UI.dataHora(imp[0].criado_em)} · ${imp[0].total} processos parados ${comparacao ? '· ' + comparacao : ''}` : 'A base de processos ainda não foi importada.'}</p>
      </section>`);
  }

  // ======================= 1. PROCESSOS PARADOS =======================
  async function telaParados() {
    UI.topo('Processos Parados', 'Finais ' + UI.listaSeq(S.perfil.sequenciais), true);
    UI.render('<div class="carregando">Carregando processos…</div>');
    await carregar('processos', 'cumpridos', 'usuarios');

    const q = consultaHash();
    if (q.get('faixa')) { estadoParados.faixa = parseInt(q.get('faixa'), 10); estadoParados.eAcima = false; }
    if (estadoParados.seqs == null) {
      estadoParados.seqs = (S.perfil.sequenciais && S.perfil.sequenciais.length) ? S.perfil.sequenciais.slice() : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    }
    if (estadoParados.local == null) estadoParados.local = S.perfil.setor === 'Gabinete' ? 'Gabinete' : 'Cartório';

    UI.render(`
      <section>
        <div class="cartao filtros">
          <div class="abas" id="abasLocal">
            ${['Cartório', 'Gabinete', ''].map((l) => `<button class="aba${estadoParados.local === l ? ' on' : ''}" data-local="${l}">${l || 'Sem local'}</button>`).join('')}
          </div>
          <div class="rotulo">Faixa de dias parados</div>
          <div class="faixas" id="faixas"></div>
          <label class="check"><input type="checkbox" id="eAcima"${estadoParados.eAcima ? ' checked' : ''}> incluir faixas acima da escolhida</label>
          <div class="rotulo">Sequenciais</div>
          ${UI.chipsSeq(estadoParados.seqs, 'pSeq')}
          <div class="linha">
            <input type="search" id="pBusca" placeholder="Buscar número…" value="${esc(estadoParados.busca)}" inputmode="numeric">
            <label class="check"><input type="checkbox" id="pOcultar"${estadoParados.ocultarCumpridos ? ' checked' : ''}> ocultar cumpridos</label>
          </div>
        </div>
        <div id="pResumo" class="resumo-lista"></div>
        <div id="pLista" class="lista"></div>
      </section>`);

    const atualizar = () => desenharParados();
    $('#abasLocal').addEventListener('click', (e) => {
      const b = e.target.closest('.aba'); if (!b) return;
      estadoParados.local = b.dataset.local; estadoParados.limite = 200;
      $$('#abasLocal .aba').forEach((x) => x.classList.toggle('on', x === b)); atualizar();
    });
    $('#faixas').addEventListener('click', (e) => {
      const b = e.target.closest('.faixa'); if (!b) return;
      estadoParados.faixa = b.dataset.f === '' ? null : parseInt(b.dataset.f, 10); estadoParados.limite = 200; atualizar();
    });
    $('#eAcima').addEventListener('change', (e) => { estadoParados.eAcima = e.target.checked; atualizar(); });
    $('#pSeq').addEventListener('click', () => setTimeout(() => { estadoParados.seqs = UI.lerChipsSeq($('#pSeq')); atualizar(); }, 0));
    $('#pBusca').addEventListener('input', (e) => { estadoParados.busca = e.target.value; atualizar(); });
    $('#pOcultar').addEventListener('change', (e) => { estadoParados.ocultarCumpridos = e.target.checked; atualizar(); });
    $('#pLista').addEventListener('click', acaoProcesso);
    atualizar();
  }

  function desenharParados() {
    const st = estadoParados;
    const seqs = new Set(st.seqs);
    const cumpridos = new Map(S.cumpridos.map((c) => [c.numero, c]));
    const base = S.processos.filter((p) => p.local === st.local && seqs.has(p.sequencial));

    // Contadores por faixa (pendentes)
    const cont = {};
    for (const p of base) if (!cumpridos.has(p.numero)) cont[p.faixa] = (cont[p.faixa] || 0) + 1;
    const faixasExist = [...new Set([...cfg.FAIXAS, ...base.map((p) => p.faixa)])].sort((a, b) => b - a);
    $('#faixas').innerHTML =
      `<button class="faixa${st.faixa == null ? ' on' : ''}" data-f=""><b>${base.filter((p) => !cumpridos.has(p.numero)).length}</b><small>Todas</small></button>` +
      faixasExist.map((f) => `<button class="faixa ${classeFaixa(f)}${st.faixa === f ? ' on' : ''}" data-f="${f}"><b>${cont[f] || 0}</b><small>${rotuloFaixa(f)}</small></button>`).join('');

    const digitos = st.busca.replace(/\D/g, '');
    let lista = base.filter((p) =>
      (st.faixa == null || (st.eAcima ? p.faixa >= st.faixa : p.faixa === st.faixa)) &&
      (!digitos || p.numero.replace(/\D/g, '').includes(digitos)) &&
      (!st.ocultarCumpridos || !cumpridos.has(p.numero)));
    lista.sort((a, b) => b.faixa - a.faixa || a.numero.localeCompare(b.numero));

    const feitos = lista.filter((p) => cumpridos.has(p.numero)).length;
    $('#pResumo').innerHTML = `${lista.length} processo(s) · ${feitos} cumprido(s)` +
      (lista.length ? ` <span class="barra fina"><span style="width:${Math.round(feitos / lista.length * 100)}%"></span></span>` : '');

    if (!S.processos.length) {
      $('#pLista').innerHTML = '<div class="vazio">A base ainda não foi importada pelo administrador.</div>'; return;
    }
    if (!lista.length) { $('#pLista').innerHTML = '<div class="vazio">Nenhum processo com estes filtros. &#127881;</div>'; return; }

    $('#pLista').innerHTML = lista.slice(0, st.limite).map((p) => itemProcesso(p, cumpridos.get(p.numero))).join('') +
      (lista.length > st.limite ? `<button class="btn secundario" data-acao="mais">Mostrar mais (${lista.length - st.limite})</button>` : '');
  }

  function itemProcesso(p, c, semAcoes) {
    const meu = c && c.usuario_id === S.perfil.id;
    return `
      <div class="proc${c ? ' feito' : ''}" data-n="${esc(p.numero)}">
        <div class="proc-num">${esc(p.numero)}</div>
        <div class="proc-meta">
          <span class="badge ${classeFaixa(p.faixa)}">${esc(p.faixa_texto || rotuloFaixa(p.faixa))}</span>
          <span>Seq. ${p.sequencial == null ? '—' : p.sequencial}</span>
          ${p.local ? `<span>${esc(p.local)}</span>` : ''}
          ${c ? `<span class="ok-txt">&#10003; ${esc(nomeUsuario(c.usuario_id))} · ${UI.dataHora(c.cumprido_em)}</span>` : ''}
        </div>
        ${semAcoes ? `<div class="proc-acoes"><button class="btn mini" data-acao="copiar">Copiar</button></div>` : `
        <div class="proc-acoes">
          <button class="btn mini" data-acao="copiar">Copiar</button>
          ${c ? (meu || ehAdmin() ? '<button class="btn mini" data-acao="desfazer">Desfazer</button>' : '')
              : '<button class="btn mini ok" data-acao="cumprir">&#10003; Cumprido</button>'}
          <button class="btn mini" data-acao="repassar">Repassar</button>
        </div>`}
      </div>`;
  }

  async function acaoProcesso(e) {
    const b = e.target.closest('[data-acao]'); if (!b) return;
    if (b.dataset.acao === 'mais') { estadoParados.limite += 200; desenharParados(); return; }
    const n = b.closest('.proc').dataset.n;
    const ac = b.dataset.acao;
    if (ac === 'copiar') return UI.copiar(n);
    if (ac === 'repassar') { location.hash = '#/repasses?n=' + encodeURIComponent(n); return; }
    await UI.ocupado(b, async () => {
      if (ac === 'cumprir') await DB.marcarCumprido(n);
      if (ac === 'desfazer') await DB.desmarcarCumprido(n);
      await carregar('cumpridos');
      if ($('#pLista')) desenharParados();
      if (ac === 'cumprir') UI.toast('Marcado como cumprido.', 'ok');
    });
    if ($('#gLista')) desenharConclusos();
  }

  // ======================= 2. ENTRADAS E META =======================
  async function telaMeta() {
    UI.topo('Entradas e Meta do Mês', 'Meta = Entradas + 1', true);
    const q = consultaHash();
    const mes = q.get('mes') || mesAtual();
    UI.render('<div class="carregando">Carregando…</div>');
    const m = await DB.obterMeta(mes);

    UI.render(`
      <section>
        <div class="cartao">
          <label>Mês<input type="month" id="mMes" value="${mes}" max="${mesAtual()}"></label>
        </div>
        ${cartaoTermometro(m, nomeMes(mes))}
        <div class="cartao">
          <h3>Como a meta é calculada</h3>
          <p>Para fechar o mês com <b>saldo positivo</b>, a vara precisa arquivar pelo menos <b>uma unidade a mais</b> do que entrou.
          Ex.: entraram 10 processos novos &rarr; meta mínima de 11 arquivamentos.</p>
          <p class="dica">Faltam = (Entradas + 1) &minus; Arquivados.</p>
        </div>
        ${ehAdmin() ? `
        <form class="cartao" id="fMeta">
          <h3>Lançar números de ${esc(nomeMes(mes))}</h3>
          <div class="linha2">
            <label>Entradas no mês<input type="number" min="0" id="mEnt" value="${m ? m.entradas : 0}" required></label>
            <label>Arquivados no mês<input type="number" min="0" id="mArq" value="${m ? m.arquivados : 0}" required></label>
          </div>
          <button class="btn primario" type="submit">Salvar</button>
          <div class="separador">ou</div>
          <label class="arquivo">Importar relatório de movimentação (Data, Tipo, Processo)
            <input type="file" id="mArquivo" accept=".xlsx,.xls,.csv"></label>
          <div id="mImport" class="dica"></div>
          ${m ? `<p class="dica">Última atualização: ${UI.dataHora(m.atualizado_em)}</p>` : ''}
        </form>` : ''}
      </section>`);

    $('#mMes').addEventListener('change', (e) => { if (e.target.value) location.hash = '#/meta?mes=' + e.target.value; });
    if (ehAdmin()) {
      $('#fMeta').addEventListener('submit', (e) => {
        e.preventDefault();
        UI.ocupado($('#fMeta .primario'), async () => {
          await DB.salvarMeta(mes, parseInt($('#mEnt').value, 10) || 0, parseInt($('#mArq').value, 10) || 0);
          UI.toast('Números do mês salvos.', 'ok');
          telaMeta();
        });
      });
      $('#mArquivo').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const r = await Parser.lerMovimentacao(f);
          const doMes = r.meses[mes];
          const outros = Object.keys(r.meses).sort().map((k) => `${k}: ${r.meses[k].entradas} entr. / ${r.meses[k].arquivados} arq.`).join(' · ');
          if (doMes) {
            $('#mEnt').value = doMes.entradas; $('#mArq').value = doMes.arquivados;
            $('#mImport').innerHTML = `Lido da planilha para ${esc(nomeMes(mes))}: <b>${doMes.entradas}</b> entradas e <b>${doMes.arquivados}</b> arquivados. Confira e toque em <b>Salvar</b>.<br>Meses encontrados: ${esc(outros)}`;
          } else {
            $('#mImport').innerHTML = `A planilha não tem lançamentos de ${esc(nomeMes(mes))}. Meses encontrados: ${esc(outros)}`;
          }
        } catch (err) { $('#mImport').textContent = err.message; }
      });
    }
  }

  // ======================= 4. GABINETE E COMANDOS =======================
  const estadoGab = { faixa: null, filtroCmd: 'aberto' };
  async function telaGabinete() {
    UI.topo('Gabinete e Comandos', 'Conclusos e determinações', true);
    UI.render('<div class="carregando">Carregando…</div>');
    await carregar('processos', 'cumpridos', 'comandos', 'usuarios');
    const aprovados = S.usuarios.filter((u) => u.status === 'aprovado');
    const n = consultaHash().get('n') || '';

    UI.render(`
      <section>
        <div class="cartao">
          <div class="cartao-cab"><h3>Conclusos no Gabinete</h3><span class="selo">${S.processos.filter((p) => p.local === 'Gabinete').length} no total</span></div>
          <div class="faixas" id="gFaixas"></div>
          <div id="gLista" class="lista"></div>
        </div>

        <div class="cartao">
          <div class="cartao-cab"><h3>Comandos</h3></div>
          <div class="abas" id="gAbas">
            ${[['aberto', 'Abertos'], ['cumprido', 'Cumpridos'], ['todos', 'Todos']].map(([v, t]) =>
              `<button class="aba${estadoGab.filtroCmd === v ? ' on' : ''}" data-v="${v}">${t}</button>`).join('')}
          </div>
          <div id="gCmds" class="lista"></div>
        </div>

        ${podeGabinete() ? `
        <form class="cartao" id="fCmd">
          <h3>Novo comando</h3>
          <label>Nº do processo<input id="gNum" required placeholder="0000000-00.0000.8.02.0034" value="${esc(n)}"></label>
          <div class="linha2">
            <label>Urgência<select id="gUrg">${cfg.URGENCIAS.map((u) => `<option>${esc(u)}</option>`).join('')}</select></label>
            <label>Para<select id="gDest"><option>Cartório</option><option>Gabinete</option></select></label>
          </div>
          <label>Servidor específico (opcional)<select id="gPara"><option value="">— toda a equipe do setor —</option>
            ${aprovados.map((u) => `<option value="${u.id}">${esc(u.nome)} (${esc(u.setor)})</option>`).join('')}</select></label>
          <label>Determinação<textarea id="gTexto" maxlength="500" required placeholder="Ex.: cumprir despacho urgente, intimar, expedir ofício…"></textarea></label>
          <p class="dica">Não escreva nomes de partes nem dados pessoais.</p>
          <button class="btn primario" type="submit">Registrar comando</button>
        </form>` : ''}
      </section>`);

    $('#gFaixas').addEventListener('click', (e) => {
      const b = e.target.closest('.faixa'); if (!b) return;
      estadoGab.faixa = b.dataset.f === '' ? null : parseInt(b.dataset.f, 10); desenharConclusos();
    });
    $('#gLista').addEventListener('click', acaoProcesso);
    $('#gAbas').addEventListener('click', (e) => {
      const b = e.target.closest('.aba'); if (!b) return;
      estadoGab.filtroCmd = b.dataset.v;
      $$('#gAbas .aba').forEach((x) => x.classList.toggle('on', x === b)); desenharComandos();
    });
    $('#gCmds').addEventListener('click', acaoComando);
    if (podeGabinete()) {
      $('#fCmd').addEventListener('submit', (e) => {
        e.preventDefault();
        const numero = $('#gNum').value.trim();
        if (!Parser.RE_CNJ.test(numero)) { UI.toast('Número de processo fora do padrão CNJ.', 'erro'); return; }
        UI.ocupado($('#fCmd .primario'), async () => {
          await DB.criarComando({
            numero: numero.match(Parser.RE_CNJ)[0], urgencia: $('#gUrg').value, destino: $('#gDest').value,
            destinatario_id: $('#gPara').value || null, texto: $('#gTexto').value.trim()
          });
          UI.toast('Comando registrado.', 'ok');
          history.replaceState(null, '', '#/gabinete');
          telaGabinete();
        });
      });
    }
    desenharConclusos();
    desenharComandos();
  }

  function desenharConclusos() {
    const base = S.processos.filter((p) => p.local === 'Gabinete');
    const cont = {};
    for (const p of base) cont[p.faixa] = (cont[p.faixa] || 0) + 1;
    const faixas = [...new Set([...cfg.FAIXAS, ...base.map((p) => p.faixa)])].sort((a, b) => b - a);
    $('#gFaixas').innerHTML = faixas.map((f) =>
      `<button class="faixa ${classeFaixa(f)}${estadoGab.faixa === f ? ' on' : ''}" data-f="${f}"><b>${cont[f] || 0}</b><small>${rotuloFaixa(f)}</small></button>`).join('');
    if (estadoGab.faixa == null) { $('#gLista').innerHTML = '<p class="dica">Toque numa faixa para ver os processos conclusos há mais tempo.</p>'; return; }
    const cumpridos = new Map(S.cumpridos.map((c) => [c.numero, c]));
    const lista = base.filter((p) => p.faixa === estadoGab.faixa);
    $('#gLista').innerHTML = lista.length ? lista.slice(0, 300).map((p) => itemProcesso(p, cumpridos.get(p.numero), true)).join('')
      : '<div class="vazio">Nenhum processo nesta faixa.</div>';
  }

  function desenharComandos() {
    const f = estadoGab.filtroCmd;
    const lista = S.comandos.filter((c) => f === 'todos' || c.status === f);
    const ordemUrg = (u) => ({ 'Réu Preso': 0, 'Medida Protetiva': 1, 'Saúde': 2, 'Urgente': 3 }[u] ?? 9);
    lista.sort((a, b) => (a.status === b.status ? 0 : a.status === 'aberto' ? -1 : 1) || ordemUrg(a.urgencia) - ordemUrg(b.urgencia) || b.criado_em.localeCompare(a.criado_em));
    $('#gCmds').innerHTML = lista.length ? lista.map((c) => `
      <div class="cmd${c.status === 'cumprido' ? ' feito' : ''}" data-id="${c.id}" data-n="${esc(c.numero)}">
        <div class="proc-meta">
          <span class="badge urg u-${esc(c.urgencia.replace(/\s/g, ''))}">${esc(c.urgencia)}</span>
          <span>Para: ${esc(c.destinatario_id ? nomeUsuario(c.destinatario_id) : c.destino)}</span>
        </div>
        <div class="proc-num">${esc(c.numero)}</div>
        <p class="cmd-texto">${esc(c.texto)}</p>
        <div class="dica">Por ${esc(nomeUsuario(c.autor_id))} · ${UI.dataHora(c.criado_em)}
          ${c.status === 'cumprido' ? ` · <span class="ok-txt">&#10003; cumprido por ${esc(nomeUsuario(c.concluido_por))} em ${UI.dataHora(c.concluido_em)}</span>` : ''}</div>
        <div class="proc-acoes">
          <button class="btn mini" data-acao="copiar">Copiar nº</button>
          ${c.status === 'aberto' ? '<button class="btn mini ok" data-acao="concluir">&#10003; Cumprido</button>' : '<button class="btn mini" data-acao="reabrir">Reabrir</button>'}
          ${(c.autor_id === S.perfil.id || ehAdmin()) ? '<button class="btn mini perigo" data-acao="excluir">Excluir</button>' : ''}
        </div>
      </div>`).join('') : '<div class="vazio">Nenhum comando aqui.</div>';
  }

  async function acaoComando(e) {
    const b = e.target.closest('[data-acao]'); if (!b) return;
    const card = b.closest('.cmd');
    const id = isNaN(card.dataset.id) ? card.dataset.id : Number(card.dataset.id);
    const ac = b.dataset.acao;
    if (ac === 'copiar') return UI.copiar(card.dataset.n);
    if (ac === 'excluir' && !confirmar('Excluir este comando?')) return;
    await UI.ocupado(b, async () => {
      if (ac === 'concluir') await DB.atualizarComando(id, { status: 'cumprido', concluido_em: new Date().toISOString(), concluido_por: S.perfil.id });
      if (ac === 'reabrir') await DB.atualizarComando(id, { status: 'aberto', concluido_em: null, concluido_por: null });
      if (ac === 'excluir') await DB.excluirComando(id);
      await carregar('comandos');
      desenharComandos();
    });
  }

  // confirm() simples (o app não usa janelas nativas em outros pontos)
  function confirmar(msg) { return window.confirm(msg); }

  // ======================= 5. REPASSE DE DILIGÊNCIAS =======================
  const estadoRep = { aba: 'para' };
  async function telaRepasses() {
    UI.topo('Repasse de Diligências', 'Encaminhar ao servidor habilitado', true);
    UI.render('<div class="carregando">Carregando…</div>');
    await carregar('repasses', 'usuarios');
    const n = consultaHash().get('n') || '';
    const outros = S.usuarios.filter((u) => u.status === 'aprovado' && u.id !== S.perfil.id);

    UI.render(`
      <section>
        <form class="cartao" id="fRep">
          <h3>Novo repasse</h3>
          <label>Nº do processo<input id="rNum" required value="${esc(n)}" placeholder="0000000-00.0000.8.02.0034"></label>
          <div class="linha2">
            <label>Diligência<select id="rTipo">${cfg.DILIGENCIAS.map((d) => `<option>${esc(d)}</option>`).join('')}</select></label>
            <label>Para<select id="rPara" required><option value="">Escolha…</option>
              ${outros.map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}</select></label>
          </div>
          <label>Observação (opcional)<textarea id="rObs" maxlength="500" placeholder="Ex.: decisão de bloqueio já assinada, fls. …"></textarea></label>
          <p class="dica">Não escreva nomes de partes, CPF ou valores de contas.</p>
          <button class="btn primario" type="submit">Enviar repasse</button>
        </form>
        <div class="cartao">
          <div class="abas" id="rAbas">
            ${[['para', 'Para mim'], ['enviados', 'Enviados por mim'], ...(ehAdmin() ? [['todos', 'Todos']] : [])].map(([v, t]) =>
              `<button class="aba${estadoRep.aba === v ? ' on' : ''}" data-v="${v}">${t}</button>`).join('')}
          </div>
          <div id="rLista" class="lista"></div>
        </div>
      </section>`);

    $('#fRep').addEventListener('submit', (e) => {
      e.preventDefault();
      const numero = $('#rNum').value.trim();
      if (!Parser.RE_CNJ.test(numero)) { UI.toast('Número de processo fora do padrão CNJ.', 'erro'); return; }
      UI.ocupado($('#fRep .primario'), async () => {
        await DB.criarRepasse({ numero: numero.match(Parser.RE_CNJ)[0], tipo: $('#rTipo').value, destinatario_id: $('#rPara').value, observacao: $('#rObs').value.trim() || null });
        UI.toast('Repasse enviado.', 'ok');
        estadoRep.aba = 'enviados';
        history.replaceState(null, '', '#/repasses');
        telaRepasses();
      });
    });
    $('#rAbas').addEventListener('click', (e) => {
      const b = e.target.closest('.aba'); if (!b) return;
      estadoRep.aba = b.dataset.v; $$('#rAbas .aba').forEach((x) => x.classList.toggle('on', x === b)); desenharRepasses();
    });
    $('#rLista').addEventListener('click', acaoRepasse);
    desenharRepasses();
  }

  function desenharRepasses() {
    const eu = S.perfil.id;
    let lista = S.repasses.filter((r) => estadoRep.aba === 'todos' || (estadoRep.aba === 'para' ? r.destinatario_id === eu : r.autor_id === eu));
    lista.sort((a, b) => (a.status === 'pendente' ? -1 : 1) - (b.status === 'pendente' ? -1 : 1) || b.criado_em.localeCompare(a.criado_em));
    const rot = { pendente: 'Pendente', cumprido: 'Cumprido', devolvido: 'Devolvido' };
    $('#rLista').innerHTML = lista.length ? lista.map((r) => `
      <div class="cmd${r.status !== 'pendente' ? ' feito' : ''}" data-id="${r.id}" data-n="${esc(r.numero)}">
        <div class="proc-meta"><span class="badge dil">${esc(r.tipo)}</span><span class="st-${r.status}">${rot[r.status]}</span></div>
        <div class="proc-num">${esc(r.numero)}</div>
        ${r.observacao ? `<p class="cmd-texto">${esc(r.observacao)}</p>` : ''}
        ${r.resposta ? `<p class="cmd-texto resp">Resposta: ${esc(r.resposta)}</p>` : ''}
        <div class="dica">De ${esc(nomeUsuario(r.autor_id))} para ${esc(nomeUsuario(r.destinatario_id))} · ${UI.dataHora(r.criado_em)}</div>
        <div class="proc-acoes">
          <button class="btn mini" data-acao="copiar">Copiar nº</button>
          ${r.status === 'pendente' && r.destinatario_id === eu ? '<button class="btn mini ok" data-acao="cumprido">&#10003; Cumprido</button><button class="btn mini" data-acao="devolver">Devolver</button>' : ''}
          ${r.status !== 'pendente' && (r.destinatario_id === eu || ehAdmin()) ? '<button class="btn mini" data-acao="reabrir">Reabrir</button>' : ''}
          ${(r.autor_id === eu || ehAdmin()) ? '<button class="btn mini perigo" data-acao="excluir">Excluir</button>' : ''}
        </div>
      </div>`).join('') : '<div class="vazio">Nada por aqui.</div>';
  }

  async function acaoRepasse(e) {
    const b = e.target.closest('[data-acao]'); if (!b) return;
    const card = b.closest('.cmd');
    const id = isNaN(card.dataset.id) ? card.dataset.id : Number(card.dataset.id);
    const ac = b.dataset.acao;
    if (ac === 'copiar') return UI.copiar(card.dataset.n);
    let resposta = null;
    if (ac === 'devolver') { resposta = window.prompt('Motivo da devolução (sem dados pessoais):'); if (resposta === null) return; }
    if (ac === 'excluir' && !confirmar('Excluir este repasse?')) return;
    await UI.ocupado(b, async () => {
      const agora = new Date().toISOString();
      if (ac === 'cumprido') await DB.atualizarRepasse(id, { status: 'cumprido', atualizado_em: agora });
      if (ac === 'devolver') await DB.atualizarRepasse(id, { status: 'devolvido', resposta: resposta.slice(0, 500), atualizado_em: agora });
      if (ac === 'reabrir') await DB.atualizarRepasse(id, { status: 'pendente', atualizado_em: agora });
      if (ac === 'excluir') await DB.excluirRepasse(id);
      await carregar('repasses');
      desenharRepasses();
    });
  }

  // ======================= 3. ADMINISTRAÇÃO =======================
  let previaImport = null;
  async function telaAdmin() {
    if (!ehAdmin()) { location.hash = '#/'; return; }
    UI.topo('Administração', 'Perfis, base e QR Code', true);
    UI.render('<div class="carregando">Carregando…</div>');
    await carregar('usuarios', 'importacoes');
    const pend = S.usuarios.filter((u) => u.status === 'pendente');
    const equipe = S.usuarios.filter((u) => u.status !== 'pendente');
    const url = location.origin + location.pathname;

    UI.render(`
      <section>
        <div class="cartao">
          <div class="cartao-cab"><h3>Cadastros pendentes</h3><span class="selo ${pend.length ? 'alerta' : ''}">${pend.length}</span></div>
          ${pend.length ? pend.map((u) => editorUsuario(u)).join('') : '<p class="dica">Nenhum cadastro aguardando.</p>'}
        </div>

        <div class="cartao">
          <h3>Atualizar base (planilha do SAJ Insights)</h3>
          <p class="dica">Envie o relatório de processos parados como veio do SAJ (.xlsx/.csv). O app lê só as colunas <b>Faixa de Dias, Processo, Cartório/Gabinete e Sequencial</b> e ignora o resto. O arquivo é lido aqui no aparelho; só esses 4 campos vão para o banco.</p>
          <label class="arquivo">Escolher planilha<input type="file" id="aArquivo" accept=".xlsx,.xls,.csv"></label>
          <div id="aPrevia"></div>
          ${S.importacoes.length ? `<div class="historico"><div class="rotulo">Últimas importações</div>
            ${S.importacoes.map((i) => `<div>${UI.dataHora(i.criado_em)} — <b>${i.total}</b> processos (${esc(nomeUsuario(i.usuario_id))})</div>`).join('')}</div>` : ''}
        </div>

        <div class="cartao">
          <div class="cartao-cab"><h3>Equipe</h3><span class="selo">${equipe.length}</span></div>
          ${equipe.map((u) => editorUsuario(u)).join('') || '<p class="dica">Ninguém ainda.</p>'}
        </div>

        <div class="cartao centro" id="cartaoQR">
          <h3>QR Code de acesso</h3>
          <p class="dica">O colega aponta a câmera, abre o link, toca em "Adicionar à tela inicial" e faz o cadastro. O acesso só é liberado após sua aprovação.</p>
          <div id="qr" class="qr"></div>
          <code class="url">${esc(url)}</code>
          <div class="linha centro">
            <button class="btn secundario" id="aCopiarUrl">Copiar link</button>
            <button class="btn secundario" id="aImprimir">Imprimir QR</button>
          </div>
        </div>

        ${DB.modo === 'demo' ? `
        <div class="cartao demo">
          <h3>Ferramentas do modo demonstração</h3>
          <button class="btn secundario" id="dGerar">Gerar dados fictícios</button>
          <label>Entrar como outro usuário<select id="dComo"><option value="">Escolha…</option>
            ${S.usuarios.filter((u) => u.id !== S.perfil.id).map((u) => `<option value="${u.id}">${esc(u.nome)} (${u.status})</option>`).join('')}</select></label>
          <button class="btn perigo" id="dReset">Apagar todos os dados do demo</button>
        </div>` : ''}
      </section>`);

    // QR Code
    try {
      const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
      $('#qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    } catch (_) { $('#qr').textContent = 'Biblioteca de QR Code não carregou.'; }
    $('#aCopiarUrl').addEventListener('click', () => UI.copiar(url));
    $('#aImprimir').addEventListener('click', () => { document.body.classList.add('imprimindo-qr'); window.print(); setTimeout(() => document.body.classList.remove('imprimindo-qr'), 500); });

    // Usuários
    $('#app > section').addEventListener('click', acaoUsuario);

    // Importação
    $('#aArquivo').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      $('#aPrevia').innerHTML = '<p class="dica">Lendo planilha…</p>';
      try {
        previaImport = await Parser.lerParados(f);
        const r = previaImport.resumo;
        const faixas = Object.keys(r.porFaixa).map(Number).sort((a, b) => b - a);
        const ant = S.importacoes[0];
        $('#aPrevia').innerHTML = `
          <div class="previa">
            <div><b>${r.total}</b> processos encontrados na aba "${esc(r.aba)}"${ant ? ` (relatório anterior: ${ant.total})` : ''}</div>
            <div class="mini-faixas">${faixas.map((f) => `<span class="badge ${classeFaixa(f)}">${rotuloFaixa(f)}: ${r.porFaixa[f]}</span>`).join('')}</div>
            <div>Cartório: <b>${r.porLocal['Cartório'] || 0}</b> · Gabinete: <b>${r.porLocal['Gabinete'] || 0}</b> · Sem local: <b>${r.porLocal[''] || 0}</b></div>
            ${r.semSequencial ? `<div class="alerta-txt">${r.semSequencial} sem sequencial (não aparecerão para nenhum servidor)</div>` : ''}
            ${r.ignoradosSegredo ? `<div>${r.ignoradosSegredo} ignorado(s) por segredo de justiça</div>` : ''}
            ${r.ignoradosInvalidos ? `<div>${r.ignoradosInvalidos} linha(s) sem número CNJ válido ignorada(s)</div>` : ''}
            <div class="dica">Colunas reconhecidas: ${Object.entries(r.colunas).filter(([, v]) => v).map(([k, v]) => `${k} = "${esc(v)}"`).join(' · ')}</div>
            <button class="btn primario" id="aConfirmar">Substituir base atual por esta</button>
          </div>`;
        $('#aConfirmar').addEventListener('click', (ev) => UI.ocupado(ev.target, async () => {
          const n = await DB.substituirAcervo(previaImport.itens, previaImport.resumo);
          UI.toast(`Base atualizada: ${n} processos.`, 'ok');
          previaImport = null;
          telaAdmin();
        }));
      } catch (err) { $('#aPrevia').innerHTML = `<p class="alerta-txt">${esc(err.message)}</p>`; }
    });

    if (DB.modo === 'demo') {
      $('#dGerar').addEventListener('click', (ev) => UI.ocupado(ev.target, async () => {
        const itens = [];
        const pesos = [30, 30, 60, 60, 100, 100, 120, 180, 365];
        for (let i = 0; i < 400; i++) {
          const r = Math.random();
          itens.push({
            numero: String(1000000 + i * 37).padStart(7, '0') + '-00.2099.8.02.0034' + (i % 23 === 0 ? '/0001' : ''),
            faixa: pesos[Math.floor(Math.random() * pesos.length)], faixa_texto: '',
            local: r < 0.65 ? 'Cartório' : r < 0.95 ? 'Gabinete' : '', sequencial: i % 10
          });
        }
        itens.forEach((p) => (p.faixa_texto = '+ ' + p.faixa + ' dias'));
        await DB.substituirAcervo(itens, { total: itens.length, ficticio: true });
        await DB.salvarMeta(mesAtual(), 10, 7);
        UI.toast('400 processos fictícios (ano 2099) gerados.', 'ok');
        telaAdmin();
      }));
      $('#dComo').addEventListener('change', async (e) => { if (e.target.value) { await DB.demoEntrarComo(e.target.value); location.hash = '#/'; rotear(); } });
      $('#dReset').addEventListener('click', () => { if (confirmar('Apagar todos os dados do modo demonstração?')) DB.demoResetar(); });
    }
  }

  function editorUsuario(u) {
    const eu = u.id === S.perfil.id;
    return `
      <div class="usuario st-${u.status}" data-id="${u.id}">
        <div class="usuario-cab">
          <div><b>${esc(u.nome)}</b>${eu ? ' (você)' : ''}<br><small>${esc(u.email)}</small></div>
          <span class="selo st-${u.status}">${u.status}</span>
        </div>
        <div class="linha2">
          <label>Setor ${UI.selectSetor(u.setor, 'set-' + u.id)}</label>
          <label>Papel<select class="u-role"${eu ? ' disabled' : ''}><option value="servidor"${u.role === 'servidor' ? ' selected' : ''}>Servidor</option><option value="admin"${u.role === 'admin' ? ' selected' : ''}>Administrador</option></select></label>
        </div>
        ${UI.checksEsp(u.especialidades, 'esp-' + u.id)}
        <div class="rotulo">Sequenciais</div>
        ${UI.chipsSeq(u.sequenciais, 'seq-' + u.id)}
        <div class="proc-acoes">
          ${u.status === 'pendente' ? `<button class="btn mini ok" data-uacao="aprovar">Aprovar</button><button class="btn mini perigo" data-uacao="recusar">Recusar</button>`
            : `<button class="btn mini" data-uacao="salvar">Salvar alterações</button>
               ${eu ? '' : (u.status === 'bloqueado' ? '<button class="btn mini ok" data-uacao="desbloquear">Desbloquear</button>' : '<button class="btn mini perigo" data-uacao="bloquear">Bloquear</button>')}`}
        </div>
      </div>`;
  }

  async function acaoUsuario(e) {
    const b = e.target.closest('[data-uacao]'); if (!b) return;
    const box = b.closest('.usuario'); const id = box.dataset.id;
    const ac = b.dataset.uacao;
    const campos = {
      setor: $('#set-' + CSS.escape(id)).value,
      role: $('.u-role', box).value,
      especialidades: UI.lerChecks('esp-' + id, box),
      sequenciais: UI.lerChipsSeq($('#seq-' + CSS.escape(id)))
    };
    if (!campos.especialidades.length) campos.especialidades = ['Geral'];
    if (ac === 'recusar' && !confirmar('Recusar e apagar este cadastro?')) return;
    if (ac === 'bloquear' && !confirmar('Bloquear o acesso deste servidor?')) return;
    await UI.ocupado(b, async () => {
      if (ac === 'aprovar') await DB.atualizarUsuario(id, { ...campos, status: 'aprovado' });
      if (ac === 'salvar') await DB.atualizarUsuario(id, campos);
      if (ac === 'bloquear') await DB.atualizarUsuario(id, { status: 'bloqueado' });
      if (ac === 'desbloquear') await DB.atualizarUsuario(id, { status: 'aprovado' });
      if (ac === 'recusar') await DB.excluirUsuario(id);
      UI.toast('Feito.', 'ok');
      if (id === S.perfil.id) S.perfil = await DB.meuPerfil();
      telaAdmin();
    });
  }

  // ======================= MINHA CONTA =======================
  function telaConta() {
    UI.topo('Minha conta', '', true);
    const p = S.perfil;
    UI.render(`
      <section>
        <div class="cartao">
          <h3>${esc(p.nome)}</h3>
          <p>${esc(p.email)}</p>
          <p>Setor: <b>${esc(p.setor)}</b> · Papel: <b>${p.role === 'admin' ? 'Administrador' : 'Servidor'}</b></p>
          <p>Especialidades: <b>${esc((p.especialidades || []).join(', '))}</b></p>
          <div class="rotulo">Meus sequenciais</div>
          ${UI.chipsSeq(p.sequenciais, 'contaSeq').replace('class="chips-seq"', 'class="chips-seq so-leitura"')}
          <p class="dica">Para mudar setor ou sequenciais, peça ao administrador.</p>
        </div>
        <form class="cartao" id="fSenha">
          <h3>Trocar senha</h3>
          <label>Nova senha<input type="password" id="cNova" minlength="6" required autocomplete="new-password"></label>
          <button class="btn secundario" type="submit">Salvar nova senha</button>
        </form>
        <button class="btn perigo largo" id="cSair">Sair do aplicativo</button>
        <p class="dica centro">MetaJus · ${DB.modo === 'demo' ? 'modo demonstração' : 'conectado ao banco'}</p>
      </section>`);
    $('#fSenha').addEventListener('submit', (e) => {
      e.preventDefault();
      UI.ocupado($('#fSenha button'), async () => { await DB.trocarSenha($('#cNova').value); $('#cNova').value = ''; UI.toast('Senha alterada.', 'ok'); });
    });
    $('#cSair').addEventListener('click', sair);
  }

  async function sair() { await DB.sair(); S.perfil = null; location.hash = '#/'; rotear(); }

  // ======================= ROTEADOR =======================
  let rodando = false, pedido = false;
  async function rotear() {
    if (rodando) { pedido = true; return; }
    rodando = true;
    try {
      do {
        pedido = false;
        await rotearUmaVez();
      } while (pedido);
    } finally { rodando = false; }
  }

  async function rotearUmaVez() {
    if (App.recuperandoSenha) return Auth.telaNovaSenha();
    const rota = (location.hash.replace(/^#/, '').split('?')[0]) || '/';
    let sessao;
    try { sessao = await DB.sessaoAtual(); }
    catch (e) { UI.render(`<div class="vazio">${esc(e.message)}</div>`); return; }

    if (!sessao) {
      S.perfil = null;
      return rota === '/cadastro' ? Auth.telaCadastro() : Auth.telaLogin();
    }
    try { S.perfil = await DB.meuPerfil(); }
    catch (e) { UI.render(`<div class="vazio">Erro ao carregar perfil: ${esc(e.message)}</div>`); return; }
    if (!S.perfil || S.perfil.status !== 'aprovado') return Auth.telaPendente(S.perfil);
    if (donoEstado !== S.perfil.id) {
      donoEstado = S.perfil.id;
      estadoParados = estadoParadosInicial();
      estadoGab.faixa = null; estadoGab.filtroCmd = 'aberto';
      estadoRep.aba = 'para';
    }

    const telas = {
      '/': telaInicio, '/parados': telaParados, '/meta': telaMeta, '/gabinete': telaGabinete,
      '/repasses': telaRepasses, '/admin': telaAdmin, '/conta': telaConta
    };
    try { await (telas[rota] || telaInicio)(); }
    catch (e) {
      console.error(e);
      UI.render(`<div class="vazio">Não foi possível carregar: ${esc(e.message)}<br><a class="btn secundario" href="#/">Voltar ao início</a></div>`);
    }
  }

  function iniciar() {
    if (DB.modo === 'demo') document.getElementById('faixaDemo').classList.remove('oculto');
    if (/type=recovery/.test(location.hash)) App.recuperandoSenha = true;

    document.getElementById('btnVoltar').addEventListener('click', () => {
      if (history.length > 1) history.back(); else location.hash = '#/';
    });
    document.getElementById('btnSair').addEventListener('click', () => { if (confirmar('Sair do MetaJus?')) sair(); });

    DB.aoMudarSessao((evento) => {
      if (evento === 'PASSWORD_RECOVERY') { App.recuperandoSenha = true; rotear(); }
      else if (evento === 'SIGNED_OUT') rotear();
    });
    window.addEventListener('hashchange', () => {
      if (/access_token=|type=recovery/.test(location.hash)) return; // retorno de link de e-mail
      rotear();
    });
    // Se veio de link de confirmação de e-mail, limpa os tokens da URL depois que o Supabase os ler
    if (/access_token=/.test(location.hash) && !App.recuperandoSenha) {
      setTimeout(() => { history.replaceState(null, '', location.pathname + '#/'); rotear(); }, 800);
    } else {
      rotear();
    }

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  const App = window.App = { rotear, recuperandoSenha: false };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
