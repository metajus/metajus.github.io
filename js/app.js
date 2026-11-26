// ============================================================
// MetaJus — módulos principais
//  #/           Início (Meu Painel + Termômetro do mês + avisos)
//  #/parados    1. Processos Parados (faixa + sequencial + Cartório/Gabinete)
//  #/meta       2. Entradas e Meta do Mês (Meta = Entradas + 1)
//  #/gabinete   4. Painel do Gabinete e Comandos
//  #/repasses   5. Repasse de Diligências
//  #/tarefas    Listas de cumprimento (Corregedoria, chefia) por sequencial
//  #/atendimentos Área de Atendimentos: certidões e documentos do balcão, prontos para imprimir
//  #/admin      3. Perfis, aprovações, QR Code e atualização da base
//  #/conta      Minha conta
// ============================================================
(function () {
  const cfg = window.METAJUS_CONFIG;
  const { esc, $, $$ } = UI;
  const ic = UI.ic;

  const S = {
    perfil: null, usuarios: [], processos: [], cumpridos: [], importacoes: [],
    comandos: [], repasses: [], meta: null, filas: null, meta2: null, tarefas: null
  };
  const estadoParadosInicial = () => ({ faixa: null, eAcima: false, local: null, seqs: null, fila: '', busca: '', limite: 200, ocultarCumpridos: false, soMeta2: false });
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
      meta: () => DB.obterMeta(mesAtual()).then((v) => (S.meta = v)),
      filas: () => DB.ultimaFila().then((v) => (S.filas = v)),
      meta2: () => DB.ultimaMetaCNJ(2).then((v) => { S.meta2 = v; m2Cache = null; }).catch(() => (S.meta2 = null)),
      tarefas: () => DB.listarListasTarefas().then((v) => (S.tarefas = v)).catch(() => (S.tarefas = null))
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

  // ---------- Meta 2 CNJ (julgar os processos mais antigos) ----------
  const M2_PCT = 0.8; // Justiça Estadual 1º grau 2026: julgar 80% dos distribuídos até 31/12/2022
  let m2Cache = null;
  function m2Mapa() {
    if (!m2Cache) m2Cache = new Map(((S.meta2 && S.meta2.pendentes) || []).map((x) => [x.numero, x]));
    return m2Cache;
  }
  function calcMeta2(snap) {
    if (!snap) return null;
    const r = snap.resumo || {}, u = r.unicas || {}, mens = r.mensais || {};
    const ano = (snap.referencia || '').slice(0, 4);
    const somaMes = (cod) => Object.entries(mens).filter(([m]) => !ano || m.startsWith(ano)).reduce((a, [, v]) => a + (v[cod] || 0), 0);
    const estoque = u['P2.1'] || 0, antes = u['P2.25'] || 0, noAno = somaMes('P2.5');
    const universo = estoque + antes, julgados = antes + noAno;
    const alvo = Math.ceil(universo * M2_PCT);
    const ult = mens[snap.referencia] || {};
    return {
      estoque, antes, noAno, universo, julgados, alvo,
      faltam: Math.max(0, alvo - julgados),
      pct: universo ? julgados / universo / M2_PCT * 100 : 0,
      saldo: (snap.pendentes || []).length || ult['P2.26'] || 0,
      sentencasMes: ult['P2.2'] || 0, julgadosMes: ult['P2.5'] || 0,
      meses: Object.keys(mens).filter((m) => !ano || m.startsWith(ano)).sort()
    };
  }

  function calcMeta(m) {
    const entradas = m ? m.entradas : 0;
    const arquivados = m ? m.arquivados : 0;
    const meta = entradas + 1;
    const falta = Math.max(0, meta - arquivados);
    const pct = meta ? Math.min(100, Math.round((arquivados / meta) * 100)) : 0;
    return { entradas, arquivados, meta, falta, pct, batida: arquivados >= meta && !!m };
  }
  // Dias úteis (seg–sex) do mês inteiro; feriados não são descontados
  function diasUteisNoMes(mes) {
    const [a, m] = mes.split('-').map(Number);
    let n = 0;
    for (let d = new Date(a, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) { const w = d.getDay(); if (w && w !== 6) n++; }
    return n;
  }
  // Projeção para o fim do mês no ritmo atual (só para o mês corrente)
  function projecao(m, mes) {
    if (!m || mes !== mesAtual()) return null;
    const total = diasUteisNoMes(mes), restantes = diasUteisRestantes(mes);
    const hojeUtil = [1, 2, 3, 4, 5].includes(new Date().getDay()) ? 1 : 0;
    const decorridos = Math.max(1, total - restantes + hojeUtil);
    return {
      baixados: Math.round(m.arquivados / decorridos * total),
      novos: Math.round(m.entradas / decorridos * total),
      decorridos, total, restantes
    };
  }
  const v2 = (x) => x.toFixed(2).replace('.', ',');

  function cartaoTermometro(m, titulo, mes, comLink) {
    mes = mes || mesAtual();
    const c = calcMeta(m);
    const p = projecao(m, mes);
    const saldo = c.arquivados - c.entradas;
    return `
      <div class="cartao termometro ${c.batida ? 'batida' : ''}">
        <div class="cartao-cab"><h3>${ic('grafico')} ${esc(titulo)}</h3>
          ${m ? `<span class="selo ${c.batida ? 'ok' : 'alerta'}">${c.batida ? '&#10003; Meta batida' : '&#9888; Em andamento'}</span>` : ''}</div>
        ${m ? `
        <div class="kpis">
          <div class="kpi"><small><i class="sw" style="background:${c.batida ? Graficos.COR.bom : Graficos.COR.s1}"></i>Baixados</small><b>${Graficos.fmt(c.arquivados)}</b></div>
          <div class="kpi"><small>Novos</small><b>${Graficos.fmt(c.entradas)}</b></div>
          <div class="kpi"><small>Saldo</small><b class="${saldo >= 0 ? 'ok-txt' : 'alerta-txt'}">${saldo > 0 ? '+' : ''}${saldo}</b></div>
          <div class="kpi"><small>IAD</small><b class="${c.entradas && c.arquivados / c.entradas >= 1 ? 'ok-txt' : 'alerta-txt'}">${c.entradas ? v2(c.arquivados / c.entradas) : '—'}</b></div>
        </div>
        ${Graficos.bullet({ valor: c.arquivados, meta: c.meta, projecao: p && p.baixados, rotuloMeta: 'Meta' })}
        ${Graficos.legenda([{ rotulo: 'Baixados', cor: c.batida ? Graficos.COR.bom : Graficos.COR.s1 }, { rotulo: 'Meta (casos novos + 1)', cor: '#fff' }].concat(p ? [{ rotulo: 'Projeção do mês', cor: 'rgba(57,135,229,.35)' }] : []))}
        <p class="resumo-meta">${c.batida
          ? `A comarca já baixou <b>${saldo}</b> processo(s) a mais do que recebeu.`
          : `Faltam <b>${c.falta}</b> baixa(s) para fechar o mês com saldo positivo.`}
          ${p ? ` No ritmo atual o mês fecha com cerca de <b>${p.baixados}</b> baixados para <b>${p.novos}</b> casos novos (saldo <b>${p.baixados - p.novos >= 0 ? '+' : ''}${p.baixados - p.novos}</b>).` : ''}</p>
        ${comLink ? '<a class="btn secundario largo" href="#/meta">' + ic('grafico') + ' Ver todos os indicadores</a>' : ''}`
        : '<p class="dica">Números do mês ainda não lançados pelo administrador.</p>'}
      </div>`;
  }

  // ======================= INÍCIO =======================
  async function telaInicio() {
    UI.topo('MetaJus', S.perfil.nome.split(' ')[0] + ' · ' + S.perfil.setor);
    UI.render('<div class="carregando">Carregando painel…</div>');
    await carregar('processos', 'cumpridos', 'meta', 'comandos', 'repasses', 'importacoes', 'usuarios', 'meta2', 'tarefas');
    const tar = minhasTarefas(S.tarefas);
    const m2c = calcMeta2(S.meta2);
    const m2meus = (() => { const m2 = m2Mapa(); const seqs = new Set(S.perfil.sequenciais || []); return S.processos.filter((p) => m2.has(p.numero) && seqs.has(p.sequencial) && (S.perfil.setor === 'Híbrido' || p.local === S.perfil.setor)).length; })();

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

    const hora = new Date().getHours();
    const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const pendentesCad = S.usuarios.filter((u) => u.status === 'pendente').length;
    UI.render(`
      <section class="painel">
        <div class="saudacao"><h2>${saud}, ${esc(S.perfil.nome.split(' ')[0])}!</h2>
          <p>Toque num dos blocos abaixo para começar.</p></div>

        ${UI.ajuda('inicio', 'Como usar o MetaJus', [
          'Toque em <b>Processos Parados</b> para ver a sua lista de trabalho (só os seus finais).',
          'Copie o número, cumpra no SAJ e volte para tocar em <b>✓ Cumprido</b>.',
          'O <b>Termômetro</b> mostra quantos arquivamentos faltam para a vara fechar o mês no positivo.',
          'Avisos do Gabinete e repasses dos colegas aparecem aqui no início. Use a barra de baixo para trocar de tela.'
        ])}

        <nav class="grade-modulos">
          <a class="modulo" href="#/parados"><span class="mod-ic">${ic('relogio')}</span><b>Processos Parados</b><small>Sua lista por faixa de dias</small>${pendentesCart.length ? `<span class="contador">${pendentesCart.length}</span>` : ''}</a>
          <a class="modulo" href="#/filas"><span class="mod-ic">${ic('lista')}</span><b>Filas de Cumprimento</b><small>Onde os processos estão parados no SAJ</small></a>
          <a class="modulo" href="#/meta"><span class="mod-ic">${ic('grafico')}</span><b>Painel e Meta</b><small>Gráficos da meta, evolução e acervo</small></a>
          <a class="modulo m2" href="#/meta2"><span class="mod-ic">${ic('alvo')}</span><b>Meta 2 · CNJ</b><small>${m2c ? `${Graficos.fmt(Math.round(m2c.pct * 10) / 10)}% · ${m2c.saldo} antigos pendentes` : 'Processos mais antigos'}</small>${m2meus ? `<span class="contador">${m2meus}</span>` : ''}</a>
          <a class="modulo atd" href="#/atendimentos"><span class="mod-ic">${ic('imprimir')}</span><b>Área de Atendimentos</b><small>Certidões e documentos do balcão, prontos para imprimir</small></a>
          <a class="modulo tar" href="#/tarefas"><span class="mod-ic">${ic('prancheta')}</span><b>Listas de Cumprimento</b><small>${tar.listas ? `${tar.listas} lista(s) da Corregedoria e chefia` : 'Pedidos da Corregedoria e da chefia'}</small>${tar.meus ? `<span class="contador">${tar.meus}</span>` : ''}</a>
          <a class="modulo" href="#/gabinete"><span class="mod-ic">${ic('balanca')}</span><b>Gabinete e Comandos</b><small>Conclusos e determinações</small>${av.comandos.length ? `<span class="contador">${av.comandos.length}</span>` : ''}</a>
          <a class="modulo" href="#/repasses"><span class="mod-ic">${ic('setas')}</span><b>Repasse de Diligências</b><small>SISBAJUD, RENAJUD, ofícios…</small>${av.repasses.length ? `<span class="contador">${av.repasses.length}</span>` : ''}</a>
          ${ehAdmin() ? `<a class="modulo admin" href="#/admin"><span class="mod-ic">${ic('cadeado')}</span><b>Administração</b><small>Aprovar colegas, planilha e QR Code</small>${pendentesCad ? `<span class="contador">${pendentesCad}</span>` : ''}</a>` : ''}
          <a class="modulo" href="#/conta"><span class="mod-ic">${ic('pessoa')}</span><b>Minha conta</b><small>Seus dados e senha</small></a>
        </nav>

        <div class="cartao meu">
          <div class="cartao-cab"><h3>${ic('lista')} Meu painel</h3><span class="selo">Finais ${esc(UI.listaSeq(S.perfil.sequenciais))}</span></div>
          <div class="numeros">
            <div><b>${meus.length}</b><small>Sob minha resp.</small></div>
            <div><b>${pendentesCart.length}</b><small>A cumprir (Cartório)</small></div>
            <div class="destaque"><b>${meusHoje}</b><small>Cumpridos hoje</small></div>
          </div>
          ${pendentesCart.length ? `<div class="mini-faixas">${faixasDesc.filter((f) => porFaixa[f]).map((f) =>
            `<a class="badge ${classeFaixa(f)}" href="#/parados?faixa=${f}">${rotuloFaixa(f)}: ${porFaixa[f]}</a>`).join('')}</div>` : ''}
        </div>

        ${cartaoTermometro(S.meta, 'Meta de ' + nomeMes(mesAtual()), mesAtual(), true)}

        ${(av.comandos.length || av.repasses.length) ? `
        <div class="cartao avisos">
          <div class="cartao-cab"><h3>${ic('sino')} Avisos para você</h3></div>
          ${av.comandos.slice(0, 3).map((c) => `<a class="aviso" href="#/gabinete"><span class="badge urg">${esc(c.urgencia)}</span> <code>${esc(c.numero)}</code> — ${esc(c.texto)}</a>`).join('')}
          ${av.repasses.slice(0, 3).map((r) => `<a class="aviso" href="#/repasses"><span class="badge dil">${esc(r.tipo)}</span> <code>${esc(r.numero)}</code> — de ${esc(nomeUsuario(r.autor_id))}</a>`).join('')}
        </div>` : ''}


        ${UI.blocoInstalar()}
        <p class="dica centro">${imp.length ? `Base atualizada em ${UI.dataHora(imp[0].criado_em)} · ${imp[0].total} processos parados ${comparacao ? '· ' + comparacao : ''}` : 'A base de processos ainda não foi importada.'}</p>
      </section>`);
    UI.atualizarInstalar();
    animarNumeros($('#app'));
  }

  // ======================= 1. PROCESSOS PARADOS =======================
  async function telaParados() {
    UI.topo('Processos Parados', 'Finais ' + UI.listaSeq(S.perfil.sequenciais), true);
    UI.render('<div class="carregando">Carregando processos…</div>');
    await carregar('processos', 'cumpridos', 'usuarios', 'meta2');

    const q = consultaHash();
    if (q.get('m2') === '1') { estadoParados.soMeta2 = true; estadoParados.faixa = null; }
    if (q.get('faixa')) { estadoParados.faixa = parseInt(q.get('faixa'), 10); estadoParados.eAcima = false; }
    if (q.has('fila')) {
      estadoParados.fila = q.get('fila'); estadoParados.faixa = null;
      estadoParados.local = null; estadoParados.seqs = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const ex = S.processos.find((p) => p.fila === estadoParados.fila);
      if (ex) estadoParados.local = ex.local;
    }
    if (estadoParados.seqs == null) {
      // -1 = processos sem sequencial no SAJ
      estadoParados.seqs = (S.perfil.sequenciais && S.perfil.sequenciais.length && !ehAdmin())
        ? S.perfil.sequenciais.slice() : [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    }
    if (estadoParados.local == null) estadoParados.local = S.perfil.setor === 'Gabinete' ? 'Gabinete' : 'Cartório';

    UI.render(`
      <section>
        ${UI.ajuda('parados', 'Como usar esta tela', [
          'Escolha <b>onde</b> o processo está: Cartório, Gabinete ou Sem local.',
          'Toque numa <b>faixa de dias</b>. Quanto mais vermelha, mais tempo parado — comece por ela.',
          'Seus <b>finais</b> já vêm marcados em azul. Toque num número para incluir ou tirar.',
          'Toque em <b>Copiar</b>, cumpra no SAJ e depois em <b>✓ Cumprido</b>. Precisa de outro colega? Use <b>Repassar</b>.'
        ])}
        <div class="cartao filtros">
          <div class="abas" id="abasLocal">
            ${['Cartório', 'Gabinete', ''].map((l) => `<button class="aba${estadoParados.local === l ? ' on' : ''}" data-local="${l}">${l || 'Sem local'}</button>`).join('')}
          </div>
          <div class="rotulo"><b>1</b> · Onde está ↑ &nbsp; <b>2</b> · Faixa de dias parados</div>
          <div class="faixas" id="faixas"></div>
          <label class="check"><input type="checkbox" id="eAcima"${estadoParados.eAcima ? ' checked' : ''}> incluir faixas acima da escolhida</label>
          <div class="rotulo"><b>3</b> · Sequenciais (finais)</div>
          ${UI.chipsSeq(estadoParados.seqs, 'pSeq').replace(/<\/div>$/, `<button type="button" class="chip chip-sem${estadoParados.seqs.includes(-1) ? ' on' : ''}" data-v="-1">Sem sequencial</button></div>`)}
          <div class="rotulo"><b>4</b> · Fila do SAJ <span class="dica">(opcional)</span></div>
          <select id="pFila"></select>
          <div class="linha">
            <input type="search" id="pBusca" placeholder="Buscar número…" value="${esc(estadoParados.busca)}" inputmode="numeric">
            <label class="check"><input type="checkbox" id="pOcultar"${estadoParados.ocultarCumpridos ? ' checked' : ''}> ocultar cumpridos</label>
            ${S.meta2 ? `<label class="check m2-check"><input type="checkbox" id="pMeta2"${estadoParados.soMeta2 ? ' checked' : ''}> só <b>Meta 2</b></label>` : ''}
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
    $('#pFila').addEventListener('change', (e) => { estadoParados.fila = e.target.value; estadoParados.limite = 200; atualizar(); });
    $('#pBusca').addEventListener('input', (e) => { estadoParados.busca = e.target.value; atualizar(); });
    $('#pOcultar').addEventListener('change', (e) => { estadoParados.ocultarCumpridos = e.target.checked; atualizar(); });
    if ($('#pMeta2')) $('#pMeta2').addEventListener('change', (e) => { estadoParados.soMeta2 = e.target.checked; atualizar(); });
    $('#pLista').addEventListener('click', acaoProcesso);
    atualizar();
  }

  function desenharParados() {
    const st = estadoParados;
    const seqs = new Set(st.seqs);
    const cumpridos = new Map(S.cumpridos.map((c) => [c.numero, c]));
    const m2 = m2Mapa();
    const base0 = S.processos.filter((p) => p.local === st.local && seqs.has(p.sequencial == null ? -1 : p.sequencial) && (!st.soMeta2 || m2.has(p.numero)));
    // Fila: opções com contagem (dentro do local e finais escolhidos)
    const contFila = {};
    for (const p of base0) if (p.fila) contFila[p.fila] = (contFila[p.fila] || 0) + 1;
    const filasOrd = Object.keys(contFila).sort((a, b) => contFila[b] - contFila[a]);
    if (st.fila && !contFila[st.fila]) filasOrd.unshift(st.fila);
    $('#pFila').innerHTML = `<option value="">Todas as filas (${base0.length})</option>` +
      filasOrd.map((f) => `<option value="${esc(f)}"${f === st.fila ? ' selected' : ''}>${esc(f)} (${contFila[f] || 0})</option>`).join('');
    const base = st.fila ? base0.filter((p) => p.fila === st.fila) : base0;

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
    lista.sort((a, b) => (m2.has(b.numero) - m2.has(a.numero)) || b.faixa - a.faixa || a.numero.localeCompare(b.numero));

    const feitos = lista.filter((p) => cumpridos.has(p.numero)).length;
    IMPRESSOES.parados = () => ({
      titulo: 'Processos parados' + (st.fila ? ' — ' + st.fila : ''),
      sub: `${st.local} · finais ${UI.listaSeq(st.seqs.filter((x) => x >= 0))}${st.faixa != null ? ' · ' + rotuloFaixa(st.faixa) + (st.eAcima ? ' ou mais' : '') : ''}${st.soMeta2 ? ' · só Meta 2' : ''}`,
      colunas: [{ rot: 'Processo' }, { rot: 'Seq.' }, { rot: 'Parado há' }, { rot: 'Fila' }, { rot: 'Últ. mov.' }, { rot: 'Situação' }],
      linhas: lista.map((p) => { const c = cumpridos.get(p.numero); return [p.numero, p.sequencial == null ? '—' : p.sequencial, p.faixa_texto || rotuloFaixa(p.faixa), p.fila || '', p.ultima_mov ? p.ultima_mov.split('-').reverse().join('/') : '', (m2.has(p.numero) ? 'Meta 2. ' : '') + (c ? 'Cumprido por ' + nomeUsuario(c.usuario_id) : '')]; })
    });
    $('#pResumo').innerHTML = botaoImprimir('parados') + ' ' + `${lista.length} processo(s) · ${feitos} cumprido(s)` +
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
          ${m2Mapa().has(p.numero) ? `<span class="badge m2" title="Meta 2 CNJ: processo antigo pendente de julgamento">Meta 2 · ${m2Mapa().get(p.numero).ano}</span>` : ''}
          <span>Seq. ${p.sequencial == null ? 'sem' : p.sequencial}</span>
          ${p.local ? `<span>${esc(p.local)}</span>` : ''}
          ${p.ultima_mov ? `<span>Últ. mov. ${p.ultima_mov.split('-').reverse().join('/')}</span>` : ''}
        </div>
        ${p.fila ? `<div class="proc-fila">${ic('lista')} ${esc(p.fila)}</div>` : ''}
        <div class="proc-meta">
          ${c ? `<span class="ok-txt">&#10003; ${esc(nomeUsuario(c.usuario_id))} · ${UI.dataHora(c.cumprido_em)}</span>` : ''}
        </div>
        ${semAcoes ? `<div class="proc-acoes"><button class="btn mini" data-acao="copiar">${ic('copiar')} Copiar</button></div>` : `
        <div class="proc-acoes">
          <button class="btn mini" data-acao="copiar">${ic('copiar')} Copiar</button>
          ${c ? (meu || ehAdmin() ? '<button class="btn mini" data-acao="desfazer">Desfazer</button>' : '')
              : `<button class="btn mini ok" data-acao="cumprir">${ic('check')} Cumprido</button>`}
          <button class="btn mini" data-acao="repassar">${ic('setas')} Repassar</button>
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
      if (ac === 'cumprir') {
        UI.toast('Marcado como cumprido. Bom trabalho!', 'ok');
        const el = $(`.proc[data-n="${CSS.escape(n)}"]`); if (el) el.classList.add('pulso');
      }
    });
    if ($('#gLista')) desenharConclusos();
    if ($('#m2Lista') && redesenharM2) redesenharM2();
  }

  // ======================= 2. ENTRADAS E META =======================
  // Dias úteis (seg–sex) de hoje até o fim do mês; feriados não são descontados
  function diasUteisRestantes(mes) {
    const [a, m] = mes.split('-').map(Number);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const fim = new Date(a, m, 0);
    let d = new Date(a, m - 1, 1);
    if (hoje > d) d = hoje;
    let n = 0;
    for (; d <= fim; d.setDate(d.getDate() + 1)) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
    return n;
  }

  const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesCurto = (m) => { const [a, mm] = m.split('-'); return MES_CURTO[+mm - 1] + '/' + a.slice(2); };
  const estadoPainel = { aba: 'meta' };
  // Tons ordinais (azul) para as faixas de parados: mais escuro = mais antigo
  const TOM_FAIXA = { 30: '#86b6ef', 60: '#5598e7', 100: '#3987e5', 120: '#2a78d6', 180: '#256abf', 365: '#184f95' };

  async function telaMeta() {
    UI.topo('Painel de Indicadores', 'Meta, evolução e acervo', true);
    const q = consultaHash();
    const mes = q.get('mes') || mesAtual();
    if (q.get('aba')) estadoPainel.aba = q.get('aba');
    UI.render(`<section>${'<div class="cartao esqueleto"></div>'.repeat(3)}</section>`);
    const [m, metas] = await Promise.all([DB.obterMeta(mes), DB.listarMetas().catch(() => []), S.processos.length ? null : carregar('processos'), S.filas ? null : carregar('filas').catch(() => null), carregar('meta2')]);
    const c = calcMeta(m);
    const dias = diasUteisRestantes(mes);
    const porDia = dias ? Math.ceil(c.falta / dias) : c.falta;
    const G = Graficos, COR = G.COR;

    // ---------- Aba 1: Meta do mês ----------
    const abaMeta = `
        <div class="cartao seletor-mes">
          <button class="btn-icone" id="mAnt" aria-label="Mês anterior">&#8249;</button>
          <label><span>${esc(nomeMes(mes).replace(/^./, (l) => l.toUpperCase()))}</span><input type="month" id="mMes" value="${mes}" max="${mesAtual()}"></label>
          <button class="btn-icone" id="mProx" aria-label="Próximo mês" ${mes >= mesAtual() ? 'disabled' : ''}>&#8250;</button>
        </div>
        ${cartaoTermometro(m, 'Meta de baixados', mes)}
        ${m && !c.batida && mes === mesAtual() ? `
        <div class="cartao ritmo">
          <h3>${ic('relogio')} Ritmo necessário</h3>
          <div class="kpis">
            <div class="kpi"><small>Faltam</small><b>${c.falta}</b></div>
            <div class="kpi"><small>Dias úteis</small><b>${dias}</b></div>
            <div class="kpi destaque"><small>Baixas/dia</small><b>${porDia}</b></div>
          </div>
          <p class="dica">Para bater a meta, a comarca precisa de <b>${porDia}</b> baixa(s) por dia útil até o fim do mês (feriados não descontados).</p>
        </div>` : ''}
        ${S.meta2 ? cartaoMeta2(calcMeta2(S.meta2), true) : ''}
        ${m ? `<p class="dica centro">Atualizado em ${UI.dataHora(m.atualizado_em)}</p>` : ''}`;

    // ---------- Aba 2: Evolução ----------
    const hist = metas.filter((x) => x.mes <= mesAtual()).slice(-6);
    const abaEvolucao = hist.length ? `
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('grafico')} Baixados × Casos novos</h3><span class="selo">${hist.length} ${hist.length > 1 ? 'meses' : 'mês'}</span></div>
          <p class="dica">Quando a barra <b style="color:${COR.s1}">azul</b> passa a <b style="color:${COR.s2}">laranja</b>, a comarca baixou mais do que recebeu.</p>
          ${G.colunasAgrupadas(hist.map((x) => mesCurto(x.mes)), [
            { nome: 'Baixados', cor: COR.s1, valores: hist.map((x) => x.arquivados) },
            { nome: 'Casos novos', cor: COR.s2, valores: hist.map((x) => x.entradas) }])}
          ${G.legenda([{ rotulo: 'Baixados', cor: COR.s1 }, { rotulo: 'Casos novos', cor: COR.s2 }])}
        </div>
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('alvo')} IAD por mês</h3></div>
          <p class="dica">IAD = baixados ÷ casos novos. Pontos <b class="ok-txt">verdes</b> estão acima de 1,00 (meta atendida); <b class="alerta-txt">vermelhos</b>, abaixo.</p>
          ${G.linha(hist.map((x) => mesCurto(x.mes)), hist.map((x) => x.entradas ? x.arquivados / x.entradas : 0))}
        </div>
        <details class="cartao tabela-dados"><summary>${ic('lista')} Ver em tabela</summary>
          <table><thead><tr><th>Mês</th><th>Novos</th><th>Baixados</th><th>Saldo</th><th>IAD</th></tr></thead><tbody>
          ${hist.slice().reverse().map((x) => { const sd = x.arquivados - x.entradas; return `<tr><td>${mesCurto(x.mes)}</td><td>${x.entradas}</td><td>${x.arquivados}</td><td class="${sd >= 0 ? 'ok-txt' : 'alerta-txt'}">${sd > 0 ? '+' : ''}${sd}</td><td>${x.entradas ? v2(x.arquivados / x.entradas) : '—'}</td></tr>`; }).join('')}
          </tbody></table></details>`
      : `<div class="vazio">${ic('grafico')}<p>Ainda não há meses lançados para mostrar a evolução.</p></div>`;

    // ---------- Aba 3: Acervo ----------
    const P = S.processos;
    let abaAcervo;
    if (!P.length) abaAcervo = `<div class="vazio">${ic('ampulheta')}<p>O acervo de processos parados ainda não foi importado.</p></div>`;
    else {
      const porFaixa = cfg.FAIXAS.map((f) => ({ rotulo: '+' + f + ' dias', valor: P.filter((p) => p.faixa === f).length, cor: TOM_FAIXA[f] || COR.s1 }));
      const mais100 = P.filter((p) => p.faixa >= 100).length;
      const semSeq = P.filter((p) => p.sequencial == null).length;
      const loc = { 'Cartório': 0, 'Gabinete': 0, '': 0 };
      P.forEach((p) => { loc[p.local in loc ? p.local : ''] += 1; });
      const seqs = Array.from({ length: 10 }, (_, k) => ({ rotulo: String(k), valor: P.filter((p) => p.sequencial === k).length }));
      const fl = S.filas && S.filas.itens ? S.filas.itens : [];
      const porFila = {};
      fl.forEach((it) => { porFila[it.fila] = (porFila[it.fila] || 0) + it.qtd; });
      const topFilas = Object.entries(porFila).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f, v]) => ({ rotulo: f, valor: v }));
      abaAcervo = `
        <div class="cartao">
          <div class="kpis">
            <div class="kpi"><small>Parados</small><b>${G.fmt(P.length)}</b></div>
            <div class="kpi"><small>+100 dias</small><b class="alerta-txt">${G.fmt(mais100)}</b></div>
            <div class="kpi"><small>% antigos</small><b>${Math.round(mais100 / P.length * 100)}%</b></div>
            <div class="kpi"><small>Sem seq.</small><b>${G.fmt(semSeq)}</b></div>
          </div>
        </div>
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('ampulheta')} Tempo sem movimentação</h3></div>
          <p class="dica">Quanto mais escura a barra, mais antigo o processo. Toque numa faixa em <b>Parados</b> para ver a lista.</p>
          ${G.barrasH(porFaixa, { larguraRotulo: 80 })}
        </div>
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('balanca')} Onde estão</h3></div>
          ${G.pilha100([{ rotulo: 'Cartório', valor: loc['Cartório'], cor: COR.s1 }, { rotulo: 'Gabinete', valor: loc['Gabinete'], cor: COR.s2 }, { rotulo: 'Sem local', valor: loc[''], cor: COR.neutro }])}
          <div class="g-partes">
            <div><i style="background:${COR.s1}"></i>Cartório<b>${G.fmt(loc['Cartório'])}</b></div>
            <div><i style="background:${COR.s2}"></i>Gabinete<b>${G.fmt(loc['Gabinete'])}</b></div>
            <div><i style="background:${COR.neutro}"></i>Sem local<b>${G.fmt(loc[''])}</b></div>
          </div>
        </div>
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('pessoa')} Por sequencial (final do número)</h3></div>
          <p class="dica">Mostra a carga de cada final. ${semSeq ? `<b>${G.fmt(semSeq)}</b> processo(s) vieram do SAJ sem sequencial.` : ''}</p>
          ${G.colunas(seqs.map((x) => (S.perfil.sequenciais || []).includes(+x.rotulo) ? { ...x, cor: COR.s3, tip: `Final ${x.rotulo} (seu): ${G.fmt(x.valor)}` } : { ...x, tip: `Final ${x.rotulo}: ${G.fmt(x.valor)}` }))}
          ${(S.perfil.sequenciais || []).length ? G.legenda([{ rotulo: 'Outros finais', cor: COR.s1 }, { rotulo: 'Seus finais', cor: COR.s3 }]) : ''}
        </div>
        ${topFilas.length ? `
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('lista')} Maiores filas de cumprimento</h3><a class="selo" href="#/filas">ver todas</a></div>
          ${G.barrasH(topFilas, { larguraRotulo: 150 })}
        </div>` : ''}`;
    }

    const ABAS = [['meta', 'Meta do mês'], ['evolucao', 'Evolução'], ['acervo', 'Acervo']];
    UI.render(`
      <section>
        ${UI.ajuda('painel', 'Como usar o painel', [
          '<b>Meta do mês</b>: a meta é sempre <b>Casos novos + 1</b>. A linha branca é a meta; a barra azul, o que já foi baixado; a faixa clara, a projeção até o fim do mês.',
          '<b>Evolução</b>: compara os meses e mostra o IAD (acima de 1,00 = comarca em dia).',
          '<b>Acervo</b>: processos parados por tempo, local, sequencial e as maiores filas.',
          'Toque ou passe o dedo sobre qualquer barra para ver o número exato.'
        ])}
        <div class="segmentado" id="pAbas">${ABAS.map(([k, t]) => `<button data-a="${k}" class="${estadoPainel.aba === k ? 'on' : ''}">${t}</button>`).join('')}<span class="seg-ind"></span></div>
        <div id="pCorpo" class="painel-corpo"></div>
        ${ehAdmin() ? `
        <div class="cartao">
          <h3>${ic('enviar')} Importar do SAJ Insights</h3>
          <div class="slots">
            ${slotHTML('iad', 'A', 'IAD, Casos Novos e Baixados', 'Recomendado: a planilha "IAD" preenche entradas e baixados de uma vez.', '')}
            ${slotHTML('baixados', 'B', 'Baixados (lista)', 'Lista de processos baixados no mês. O app conta quantos.', '')}
            ${slotHTML('entradas', 'C', 'Casos Novos (lista)', 'Lista de processos novos no mês (entradas). O app conta quantos.', '')}
          </div>
        </div>
        <form class="cartao" id="fMeta">
          <h3>${ic('lista')} Ou digite os números de ${esc(nomeMes(mes))}</h3>
          <div class="linha2">
            <label>Casos novos (entradas)<input type="number" min="0" id="mEnt" value="${m ? m.entradas : 0}" required></label>
            <label>Baixados no mês<input type="number" min="0" id="mArq" value="${m ? m.arquivados : 0}" required></label>
          </div>
          <button class="btn primario" type="submit">Salvar</button>
        </form>` : ''}
      </section>`);

    const corpos = { meta: abaMeta, evolucao: abaEvolucao, acervo: abaAcervo };
    function mostrarAba(k, animar) {
      const de = ABAS.findIndex((a) => a[0] === estadoPainel.aba), para = ABAS.findIndex((a) => a[0] === k);
      estadoPainel.aba = k;
      const corpo = $('#pCorpo');
      corpo.innerHTML = corpos[k];
      $$('#pAbas button').forEach((b, n) => b.classList.toggle('on', n === para));
      $('#pAbas').style.setProperty('--seg', para);
      if (animar) { corpo.classList.remove('entra-dir', 'entra-esq'); void corpo.offsetWidth; corpo.classList.add(para >= de ? 'entra-dir' : 'entra-esq'); }
      animarNumeros(corpo);
      if (k === 'meta') ligarMes();
    }
    function ligarMes() {
      const ir = (mm) => { location.hash = '#/meta?aba=meta&mes=' + mm; };
      const desloca = (n) => { const [a, mm] = mes.split('-').map(Number); const d = new Date(a, mm - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
      $('#mMes').addEventListener('change', (e) => { if (e.target.value) ir(e.target.value); });
      $('#mAnt').addEventListener('click', () => ir(desloca(-1)));
      $('#mProx').addEventListener('click', () => { if (mes < mesAtual()) ir(desloca(1)); });
    }
    $('#pAbas').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.a !== estadoPainel.aba) mostrarAba(b.dataset.a, true); });
    // deslizar o dedo para trocar de aba
    let x0 = null;
    $('#pCorpo').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    $('#pCorpo').addEventListener('touchend', (e) => {
      if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) < 70) return;
      const n = ABAS.findIndex((a) => a[0] === estadoPainel.aba) + (dx < 0 ? 1 : -1);
      if (ABAS[n]) mostrarAba(ABAS[n][0], true);
    });
    mostrarAba(estadoPainel.aba, false);

    if (ehAdmin()) {
      $('#fMeta').addEventListener('submit', (e) => {
        e.preventDefault();
        UI.ocupado($('#fMeta .primario'), async () => {
          await DB.salvarMeta(mes, parseInt($('#mEnt').value, 10) || 0, parseInt($('#mArq').value, 10) || 0);
          UI.toast('Números do mês salvos.', 'ok');
          telaMeta();
        });
      });
      ligarSlots(() => telaMeta());
    }
  }

  // Números "contando" de 0 até o valor (dá sensação de painel vivo)
  function animarNumeros(raiz) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    raiz.querySelectorAll('.kpi b').forEach((b) => {
      const txt = b.textContent.trim();
      const m = txt.match(/^([+]?)([\d.]+)(%?)$/);
      if (!m) return;
      const alvo = parseInt(m[2].replace(/\./g, ''), 10); if (!alvo) return;
      const t0 = performance.now(), dur = 700;
      const passo = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        b.textContent = m[1] + Math.round(alvo * e).toLocaleString('pt-BR') + m[3];
        if (k < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    });
  }

  // ======================= META 2 · CNJ =======================
  const estadoM2 = { aba: 'todos', meus: false, busca: '', limite: 60 };
  let redesenharM2 = null;
  const ONDE_M2 = { todos: 'Todos', 'Cartório': 'Cartório', 'Gabinete': 'Gabinete', fora: 'Andando' };

  function cartaoMeta2(c, compacto) {
    const G = Graficos, COR = G.COR, ok = c.pct >= 100;
    return `
      <div class="cartao termometro ${ok ? 'batida' : ''}">
        <div class="cartao-cab"><h3>${ic('alvo')} Meta 2 · processos mais antigos</h3>
          <span class="selo ${ok ? 'ok' : 'alerta'}">${ok ? '&#10003; Meta atingida' : '&#9888; Em andamento'}</span></div>
        <div class="kpis">
          <div class="kpi ${compacto ? '' : 'destaque'}"><small>Cumprimento</small><b>${G.fmt(Math.round(c.pct * 10) / 10)}%</b></div>
          <div class="kpi"><small><i class="sw" style="background:${ok ? COR.bom : COR.s1}"></i>Julgados</small><b>${G.fmt(c.julgados)}</b></div>
          <div class="kpi"><small>Alvo 80%</small><b>${G.fmt(c.alvo)}</b></div>
          <div class="kpi"><small>Faltam</small><b class="${c.faltam ? 'alerta-txt' : 'ok-txt'}">${G.fmt(c.faltam)}</b></div>
        </div>
        ${G.bullet({ valor: c.julgados, meta: c.alvo, rotuloValor: 'Julgados', rotuloMeta: 'Alvo 80%' })}
        <p class="resumo-meta">${c.faltam
          ? `Faltam julgar <b>${G.fmt(c.faltam)}</b> processo(s) antigos para chegar a 80%. Ainda há <b>${G.fmt(c.saldo)}</b> pendentes na lista do SAJ.`
          : `A comarca já julgou <b>${G.fmt(c.julgados - c.alvo)}</b> a mais do que o alvo de 80%. Ainda há <b>${G.fmt(c.saldo)}</b> pendentes — julgar todos melhora o resultado.`}</p>
        ${compacto ? '<a class="btn secundario largo" href="#/meta2">' + ic('alvo') + ' Ver a lista da Meta 2</a>' : ''}
      </div>`;
  }

  async function telaMeta2() {
    UI.topo('Meta 2 · CNJ', 'Julgar os processos mais antigos', true);
    UI.render(`<section>${'<div class="cartao esqueleto"></div>'.repeat(3)}</section>`);
    await carregar('processos', 'cumpridos', 'usuarios', 'meta2');
    if (!S.meta2) {
      UI.render(`<section><div class="vazio">${ic('alvo')}<p>Os dados da Meta 2 ainda não foram importados.</p>
        ${ehAdmin() ? '<a class="btn primario" href="#/admin">Importar "Perguntas Únicas" e "Perguntas Mensais"</a>' : '<p class="dica">O administrador precisa importar as planilhas do painel "(PG) Metas CNJ" do SAJ Insights.</p>'}</div></section>`);
      return;
    }
    const G = Graficos, COR = G.COR;
    const c = calcMeta2(S.meta2);
    const acervo = new Map(S.processos.map((p) => [p.numero, p]));
    const pend = (S.meta2.pendentes || []).map((x) => ({ ...x, p: acervo.get(x.numero) }));
    const onde = (x) => x.p ? (x.p.local || 'fora') : 'fora';
    const cont = { 'Cartório': 0, 'Gabinete': 0, fora: 0 };
    pend.forEach((x) => { cont[onde(x)] = (cont[onde(x)] || 0) + 1; });
    const porAno = {};
    pend.forEach((x) => { porAno[x.ano] = (porAno[x.ano] || 0) + 1; });
    const anos = Object.keys(porAno).map(Number).sort((a, b) => a - b);
    const limite15 = parseInt((S.meta2.referencia || String(new Date().getFullYear())).slice(0, 4), 10) - 15;
    const porClasse = {};
    pend.forEach((x) => { const k = x.classe || '—'; porClasse[k] = (porClasse[k] || 0) + 1; });
    const topClasses = Object.entries(porClasse).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ rotulo: k, valor: v }));
    const ref = (S.meta2.referencia || '').split('-').reverse().join('/');
    const mesRef = parseInt((S.meta2.referencia || '').slice(5, 7), 10) || 1;
    const faltamMeses = c.meses.length < mesRef;

    UI.render(`
      <section>
        ${UI.ajuda('meta2cnj', 'O que é a Meta 2 do CNJ', [
          'É a meta de <b>julgar os processos mais antigos</b>: até 31/12/2026, a Justiça Estadual (1º grau) precisa ter julgado <b>pelo menos 80%</b> dos processos distribuídos até <b>31/12/2022</b>.',
          '<b>Cartório</b>: impulsione primeiro os processos com o selo <b>Meta 2</b> (intimações, prazos, audiências) e faça-os <b>chegar conclusos</b> ao gabinete.',
          '<b>Gabinete</b>: priorize a <b>sentença</b> desses processos — cada julgamento conta para a meta.',
          'Os mais antigos aparecem primeiro. Use as abas para ver onde cada um está parado.'
        ])}
        ${cartaoMeta2(c)}
        ${faltamMeses ? `<div class="aviso-m2">${ic('sino')}<span>Só ${c.meses.length ? 'o(s) mês(es) ' + c.meses.map((m) => m.split('-').reverse().join('/')).join(', ') : 'nenhum mês'} de ${(S.meta2.referencia || '').slice(0, 4)} foi importado em "Perguntas Mensais". Para o percentual ficar completo, o administrador deve exportar essa planilha com <b>todos os meses do ano</b> marcados no filtro.</span></div>` : ''}
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('relogio')} Em ${esc(ref)}</h3></div>
          <div class="kpis kpis3">
            <div class="kpi"><small>1ª sentença</small><b>${G.fmt(c.sentencasMes)}</b></div>
            <div class="kpi"><small>Julgados</small><b>${G.fmt(c.julgadosMes)}</b></div>
            <div class="kpi"><small>Pendentes</small><b class="alerta-txt">${G.fmt(c.saldo)}</b></div>
          </div>
          <p class="dica">Universo da meta: ${G.fmt(c.universo)} processos distribuídos até 2022 (${G.fmt(c.antes)} julgados até 2025 + ${G.fmt(c.estoque)} do estoque). Conta para a meta: julgados até 2025 + julgados em ${(S.meta2.referencia || '').slice(0, 4)}.</p>
        </div>
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('balanca')} Onde estão os pendentes</h3></div>
          ${G.pilha100([{ rotulo: 'Cartório', valor: cont['Cartório'], cor: COR.s1 }, { rotulo: 'Gabinete', valor: cont['Gabinete'], cor: COR.s2 }, { rotulo: 'Andando (sem parada +30 dias)', valor: cont.fora, cor: COR.neutro }])}
          <div class="g-partes">
            <div><i style="background:${COR.s1}"></i>Cartório<b>${cont['Cartório']}</b></div>
            <div><i style="background:${COR.s2}"></i>Gabinete<b>${cont['Gabinete']}</b></div>
            <div><i style="background:${COR.neutro}"></i>Andando<b>${cont.fora}</b></div>
          </div>
          <p class="dica">"Andando" = não estão na lista de parados há mais de 30 dias (tiveram movimento recente).</p>
        </div>
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('ampulheta')} Pendentes por ano de distribuição</h3></div>
          ${G.colunas(anos.map((a) => ({ rotulo: "'" + String(a).slice(2), valor: porAno[a], cor: a <= limite15 ? COR.s2 : COR.s1, tip: `Distribuídos em ${a}: ${porAno[a]}` })))}
          ${anos.some((a) => a <= limite15) ? G.legenda([{ rotulo: 'Há 15 anos ou mais', cor: COR.s2 }, { rotulo: 'Demais', cor: COR.s1 }]) : ''}
        </div>
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('lista')} Tipos de ação pendentes</h3></div>
          ${G.barrasH(topClasses, { larguraRotulo: 170 })}
        </div>
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('lista')} Lista dos pendentes</h3><span class="selo">mais antigos primeiro</span></div>
          <div class="abas" id="m2Abas">${Object.entries(ONDE_M2).map(([k, t]) => `<button class="aba${estadoM2.aba === k ? ' on' : ''}" data-a="${k}">${t} <small>${k === 'todos' ? pend.length : cont[k] || 0}</small></button>`).join('')}</div>
          <div class="linha">
            <input type="search" id="m2Busca" placeholder="Buscar número ou classe…" value="${esc(estadoM2.busca)}">
            ${(S.perfil.sequenciais || []).length ? `<label class="check"><input type="checkbox" id="m2Meus"${estadoM2.meus ? ' checked' : ''}> meus finais</label>` : ''}
          </div>
          <div id="m2Resumo" class="resumo-lista"></div>
          <div id="m2Lista" class="lista"></div>
        </div>
        <p class="dica centro">Referência ${esc(ref)} · importado em ${UI.dataHora(S.meta2.criado_em)}</p>
      </section>`);

    const desenhar = () => {
      const seqs = new Set(S.perfil.sequenciais || []);
      const dig = estadoM2.busca.replace(/\D/g, ''), txt = estadoM2.busca.trim().toLowerCase();
      const lista = pend.filter((x) => (estadoM2.aba === 'todos' || onde(x) === estadoM2.aba) &&
        (!estadoM2.meus || (x.p && seqs.has(x.p.sequencial))) &&
        (!txt || (dig && x.numero.replace(/\D/g, '').includes(dig)) || (x.classe + ' ' + x.assunto).toLowerCase().includes(txt)));
      const cumpridos = new Map(S.cumpridos.map((k) => [k.numero, k]));
      IMPRESSOES.meta2 = () => ({
        titulo: 'Meta 2 do CNJ — processos antigos pendentes',
        sub: `${estadoM2.aba === 'todos' ? 'Todos' : estadoM2.aba}${estadoM2.meus ? ' · meus finais' : ''} · referência ${ref}`,
        colunas: [{ rot: 'Processo' }, { rot: 'Ano' }, { rot: 'Seq.' }, { rot: 'Onde está' }, { rot: 'Classe · assunto' }],
        linhas: lista.map((x) => [x.numero, x.ano, x.p && x.p.sequencial != null ? x.p.sequencial : '—', x.p ? (x.p.fila || x.p.local || '') : 'Andando no SAJ', [x.classe, x.assunto].filter(Boolean).join(' · ')])
      });
      $('#m2Resumo').innerHTML = `${botaoImprimir('meta2')} ${lista.length} processo(s)`;
      $('#m2Lista').innerHTML = lista.length ? lista.slice(0, estadoM2.limite).map((x) => x.p
        ? itemProcesso(x.p, cumpridos.get(x.numero)).replace('<div class="proc-fila">', `<div class="proc-classe">${esc(x.classe)}${x.assunto ? ' · ' + esc(x.assunto) : ''}</div><div class="proc-fila">`)
        : `<div class="proc" data-n="${esc(x.numero)}">
            <div class="proc-num">${esc(x.numero)}</div>
            <div class="proc-meta"><span class="badge m2">Meta 2 · ${x.ano}</span><span>Andando no SAJ</span></div>
            <div class="proc-classe">${esc(x.classe)}${x.assunto ? ' · ' + esc(x.assunto) : ''}</div>
            <div class="proc-acoes"><button class="btn mini" data-acao="copiar">${ic('copiar')} Copiar</button></div>
          </div>`).join('') + (lista.length > estadoM2.limite ? `<button class="btn secundario" data-acao="maisM2">Mostrar mais (${lista.length - estadoM2.limite})</button>` : '')
        : '<div class="vazio">Nenhum processo com estes filtros. &#127881;</div>';
    };
    $('#m2Abas').addEventListener('click', (e) => {
      const b = e.target.closest('.aba'); if (!b) return;
      estadoM2.aba = b.dataset.a; estadoM2.limite = 60;
      $$('#m2Abas .aba').forEach((x) => x.classList.toggle('on', x === b)); desenhar();
    });
    $('#m2Busca').addEventListener('input', (e) => { estadoM2.busca = e.target.value; desenhar(); });
    if ($('#m2Meus')) $('#m2Meus').addEventListener('change', (e) => { estadoM2.meus = e.target.checked; desenhar(); });
    $('#m2Lista').addEventListener('click', (e) => {
      if (e.target.closest('[data-acao="maisM2"]')) { estadoM2.limite += 60; desenhar(); return; }
      acaoProcesso(e);
    });
    redesenharM2 = desenhar;
    desenhar();
    animarNumeros($('#app'));
  }

  // ======================= ÁREA DE ATENDIMENTOS (certidões e documentos do balcão) =======================
  //  #/atendimentos           lista de documentos, com busca
  //  #/atendimentos?doc=ID    formulário + folha oficial ao vivo + Imprimir
  // LGPD: nada do que é digitado aqui é enviado ou guardado; some ao sair da tela.
  const CARGOS_ASSIN = ['Servidor Judiciário', 'Servidora Judiciária', 'Chefe de Secretaria', 'Analista Judiciário', 'Técnico Judiciário', 'Estagiário(a)'];
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const so = (v) => String(v || '').replace(/\D/g, '');
  const MASCARA = {
    cpf: (v) => so(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'),
    cnpj: (v) => so(v).slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2'),
    processo: (v) => {
      const d = so(v).slice(0, 20); let r = d.slice(0, 7);
      if (d.length > 7) r += '-' + d.slice(7, 9);
      if (d.length > 9) r += '.' + d.slice(9, 13);
      if (d.length > 13) r += '.' + d.slice(13, 14);
      if (d.length > 14) r += '.' + d.slice(14, 16);
      if (d.length > 16) r += '.' + d.slice(16, 20);
      return r;
    },
    telefone: (v) => {
      const d = so(v).slice(0, 11);
      if (d.length <= 2) return d.length ? '(' + d : '';
      if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
    }
  };
  function cpfValido(v) {
    const c = so(v); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === +c[9] && dv(10) === +c[10];
  }
  const avisoCampo = (c, v) => {
    if (!v) return '';
    if (c.tipo === 'cpf' && !cpfValido(v)) return 'Confira o CPF: os números não batem.';
    if (c.tipo === 'processo' && so(v).length !== 20) return 'O número do processo tem 20 dígitos.';
    if (c.tipo === 'cnpj' && so(v).length !== 14) return 'O CNPJ tem 14 dígitos.';
    return '';
  };

  let estadoAtd = { busca: '' };

  function telaAtendimentos() {
    const docId = consultaHash().get('doc');
    if (docId) return telaAtendimentoDoc(docId);
    UI.topo('Área de Atendimentos', 'Certidões e documentos do balcão', true);
    UI.render(`
      <section>
        ${UI.ajuda('atendimentos', 'Como emitir um documento', [
          'Procure o documento que a pessoa pediu: digite uma palavra (ex.: <b>comparecimento</b>, <b>INSS</b>, <b>negativa</b>) ou escolha na lista.',
          'Preencha os dados que aparecem (nome, CPF, nº do processo…). A folha oficial vai se montando sozinha ao lado.',
          'Confira e toque em <b>Imprimir</b>. No celular, escolha a impressora ou "Salvar como PDF".',
          'Nada do que você digita fica guardado: ao sair da tela, os dados somem.'
        ])}
        <div class="atd-busca">${ic('busca')}<input type="search" id="atdBusca" placeholder="O que a pessoa pediu? Ex.: comparecimento, INSS, negativa…" value="${esc(estadoAtd.busca)}" autocomplete="off"></div>
        <div id="atdLista"></div>
      </section>`);
    const desenhar = () => {
      const t = semAcento(estadoAtd.busca).trim().split(/\s+/).filter(Boolean);
      const ok = (m) => !t.length || t.every((p) => semAcento(m.titulo + ' ' + m.desc + ' ' + m.grupo).includes(p));
      const html = MODELOS_INFO.GRUPOS.map((g) => {
        const ms = MODELOS.filter((m) => m.grupo === g && ok(m));
        return ms.length ? `<div class="atd-grupo">${esc(g)}</div><div class="atd-docs">${ms.map((m) => `
          <a class="cartao atd-doc" href="#/atendimentos?doc=${m.id}"><span class="mod-ic">${ic(m.icone || 'lista')}</span>
            <span><b>${esc(m.titulo)}</b><small>${esc(m.desc)}</small></span></a>`).join('')}</div>` : '';
      }).join('');
      $('#atdLista').innerHTML = html || `<div class="vazio">${ic('busca')}<p>Nenhum documento com essa palavra.</p><p class="dica">Use a <a href="#/atendimentos?doc=certidao-livre">Certidão em branco</a> para casos diferentes.</p></div>`;
    };
    $('#atdBusca').addEventListener('input', (e) => { estadoAtd.busca = e.target.value; desenhar(); });
    desenhar();
  }

  // ----- Foto do documento → preenche os dados (leitura no próprio aparelho; a foto não é guardada) -----
  const PESSOAS_DOC = [
    { rot: 'Pessoa', nome: 'nome', cpf: 'cpf', nasc: 'nasc', mae: 'mae' },
    { rot: 'Requerente', nome: 'requerente', cpf: 'reqCpf', rg: 'reqRg' },
    { rot: 'Beneficiário(a)', nome: 'beneficiario', cpf: 'benCpf', ativar: 'temBen' },
    { rot: 'Advogado(a)', nome: 'adv' },
    { rot: 'Quem recebe o equipamento', nome: 'recebedor' },
    { rot: 'Entregador(a)', nome: 'eNome', cpf: 'eCpf', rg: 'eRg' },
    { rot: 'Menor', nome: 'mNome', cpf: 'mCpf', nasc: 'mNasc', filiacao: 'mPais' },
    { rot: 'Recebedor(a)', nome: 'rNome', cpf: 'rCpf', rg: 'rRg' }
  ];
  const pessoasDoModelo = (m) => {
    const tem = (id) => id && m.campos.some((c) => c.id === id);
    return PESSOAS_DOC.filter((p) => m.campos.some((c) => c.id === p.nome && c.tipo === 'nome'))
      .map((p) => ({ ...p, cpf: tem(p.cpf) && p.cpf, nasc: tem(p.nasc) && p.nasc, mae: tem(p.mae) && p.mae, rg: tem(p.rg) && p.rg, filiacao: tem(p.filiacao) && p.filiacao,
        doc: p.nome === 'nome' && tem('docTipo') && tem('docNum') }));
  };

  // Abre a câmera/galeria, lê o documento e mostra o resultado para o servidor conferir.
  // aoConfirmar(pessoa, valores) é chamado só quando o servidor toca em "Preencher".
  function lerDocumentoPorFoto(m, aoConfirmar) {
    const pessoas = pessoasDoModelo(m);
    const processar = async (arq) => {
      if (!arq) return;
      const fundo = document.createElement('div');
      fundo.className = 'painel-fundo';
      fundo.innerHTML = `<div class="painel" role="dialog" aria-modal="true" aria-label="Ler documento">
        <div class="painel-cab"><h3>${ic('camera')} Ler documento</h3><button class="topo-btn" data-p="fechar" aria-label="Fechar">✕</button></div>
        <div class="painel-corpo" id="ldCorpo">
          <p class="dica" id="ldFase">Preparando…</p>
          <div class="ld-barra"><span id="ldBarra"></span></div>
          <p class="atd-lgpd">${ic('cadeado')} <span>A foto é lida aqui mesmo no aparelho. Ela não é enviada nem guardada.</span></p>
        </div></div>`;
      document.body.appendChild(fundo); document.body.classList.add('com-painel');
      let aberto = true;
      const fechar = () => { aberto = false; fundo.remove(); document.body.classList.remove('com-painel'); };
      fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-p="fechar"]')) fechar(); });
      let r, copia = null;
      const pegarCopia = async () => { if (!copia) copia = await LeitorDoc.fotoCopia(arq, (r && r.giro) || 0); return copia; };
      try {
        r = await LeitorDoc.ler(arq, (txt, p) => { if (!aberto) return; $('#ldFase', fundo).textContent = txt; $('#ldBarra', fundo).style.width = Math.round(p * 100) + '%'; });
      } catch (e) {
        if (!aberto) return;
        $('#ldCorpo', fundo).innerHTML = `<p class="dica">Não foi possível abrir o leitor: ${esc(e.message || e)}</p><p class="dica">Confira a internet (na primeira vez o leitor precisa ser baixado) e tente de novo.</p>`;
        return;
      }
      if (!aberto) return;
      const achou = r && (r.nome || r.cpf);
      if (!achou) {
        $('#ldCorpo', fundo).innerHTML = `<p><b>Não consegui ler os dados desta foto.</b></p>
          <ul class="ld-dicas"><li>Tire o documento do plástico e apoie numa mesa.</li><li>Use boa luz, sem reflexo nem sombra.</li>
          <li>Chegue perto: o documento deve ocupar quase toda a foto, reto e em foco.</li><li>Na CNH e no RG, fotografe o lado onde estão nome e CPF.</li></ul>
          <div class="painel-pe" style="padding:0;border:0;flex-wrap:wrap"><button class="btn secundario" data-p="soCopia">Usar só como cópia para imprimir</button><button class="btn primario" data-p="outra">${ic('camera')} Tentar outra foto</button></div>`;
        $('[data-p="outra"]', fundo).addEventListener('click', () => { fechar(); lerDocumentoPorFoto(m, aoConfirmar); });
        $('[data-p="soCopia"]', fundo).addEventListener('click', async () => { const c = await pegarCopia(); fechar(); aoConfirmar(null, null, c); });
        return;
      }
      const temRg = pessoas.some((p) => p.rg || p.doc), temNasc = pessoas.some((p) => p.nasc), temMae = pessoas.some((p) => p.mae || p.filiacao);
      const campo = (id, rot, v, extra) => `<div class="campo"><label for="${id}">${rot}</label><input id="${id}" value="${esc(v || '')}" ${extra || ''}></div>`;
      $('#ldCorpo', fundo).innerHTML = `
        <p class="dica">Confira com o documento e corrija o que precisar. <b>A leitura automática pode errar.</b></p>
        ${pessoas.length > 1 ? `<div class="campo"><label for="ldPessoa">Preencher os dados de</label><select id="ldPessoa">${pessoas.map((p, i) => `<option value="${i}">${esc(p.rot)}</option>`).join('')}</select></div>` : ''}
        ${campo('ldNome', 'Nome', r.nome, 'autocapitalize="words"')}
        ${pessoas.some((p) => p.cpf || p.doc) ? campo('ldCpf', 'CPF', r.cpf, 'inputmode="numeric"') : ''}
        ${temRg ? campo('ldRg', 'RG', r.rg) : ''}
        ${temNasc ? `<div class="campo"><label for="ldNasc">Data de nascimento</label><input type="date" id="ldNasc" value="${esc(r.nasc || '')}"></div>` : ''}
        ${temMae ? campo('ldMae', 'Mãe', r.mae, 'autocapitalize="words"') + campo('ldPai', 'Pai', r.pai, 'autocapitalize="words"') : ''}
        <label class="ld-copia"><input type="checkbox" id="ldCopia"><span><b>Imprimir também a cópia deste documento?</b><small>Sai numa folha a mais, com o timbre do Fórum, para ficar no Fórum ou anexar no sistema.</small></span></label>
        <p class="atd-lgpd">${ic('cadeado')} <span>A foto não é enviada nem guardada. Se pedir a cópia, ela fica só nesta tela até você sair.</span></p>`;
      const pe = document.createElement('div');
      pe.className = 'painel-pe';
      pe.innerHTML = `<button class="btn secundario" data-p="outra">${ic('camera')} Outra foto</button><button class="btn primario" data-p="ok">${ic('check')} Preencher</button>`;
      $('.painel', fundo).appendChild(pe);
      const cpfIn = $('#ldCpf', fundo);
      if (cpfIn) {
        const av = () => { const ok = !cpfIn.value || cpfValido(cpfIn.value); cpfIn.closest('.campo').classList.toggle('erro', !ok); };
        cpfIn.addEventListener('input', () => { cpfIn.value = MASCARA.cpf(cpfIn.value); av(); }); av();
      }
      $('[data-p="outra"]', pe).addEventListener('click', () => { fechar(); lerDocumentoPorFoto(m, aoConfirmar); });
      $('[data-p="ok"]', pe).addEventListener('click', async () => {
        const p = pessoas[$('#ldPessoa', fundo) ? +$('#ldPessoa', fundo).value : 0];
        const v = (id) => { const el = $('#' + id, fundo); return el ? el.value.trim() : ''; };
        const mae = v('ldMae'), pai = v('ldPai');
        const querCopia = $('#ldCopia', fundo).checked;
        const c = querCopia ? await pegarCopia() : null;
        aoConfirmar(p, { nome: v('ldNome'), cpf: v('ldCpf'), rg: v('ldRg'), nasc: v('ldNasc'), mae, filiacao: [pai, mae].filter(Boolean).join(' e ') }, c);
        fechar();
      });
    };
    // câmera ao vivo dentro do app; se o aparelho não tiver (ou o site não tiver permissão), vai pela galeria
    if (LeitorDoc.temCamera()) LeitorDoc.abrirCamera().then(processar);
    else LeitorDoc.escolherDaGaleria().then(processar);
  }

  function telaAtendimentoDoc(id) {
    const m = MODELOS.find((x) => x.id === id);
    if (!m) { location.hash = '#/atendimentos'; return; }
    UI.topo(m.titulo, 'Área de Atendimentos', true);
    const ini = typeof m.valores === 'function' ? m.valores() : (m.valores || {});
    const dados = { ...ini };
    m.campos.forEach((c) => { if (c.tipo === 'opcao' && dados[c.id] == null && c.obr) dados[c.id] = c.ops[0]; });
    let cargo = ''; try { cargo = localStorage.getItem('mj_cargo') || ''; } catch (_) {}
    const ass = { nome: S.perfil.nome, cargo: cargo || 'Servidor Judiciário' };
    let dataDoc = Impressao.hojeISO();
    let modo = 'auto';

    const campoHTML = (c) => {
      if (c.tipo === 'secao') return `<div class="secao" data-c="${c.id}">${esc(c.rot)}</div>`;
      const v = dados[c.id] == null ? '' : dados[c.id];
      const obr = c.obr ? '<span class="obr" title="obrigatório">*</span>' : '';
      let input;
      if (c.tipo === 'opcao' && c.ops.length <= 3) {
        input = `<div class="chips" role="radiogroup">${c.ops.map((o) => `<button type="button" class="chip${v === o ? ' on' : ''}" data-op="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
        return `<div class="campo" data-c="${c.id}"><span class="rot">${esc(c.rot)}${obr}</span>${input}</div>`;
      }
      if (c.tipo === 'opcao') input = `<select name="${c.id}">${c.obr ? '' : '<option value=""></option>'}${c.ops.map((o) => `<option${v === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      else if (c.tipo === 'sim') return `<div class="campo" data-c="${c.id}"><label class="sim"><span>${esc(c.rot)}</span><input type="checkbox" name="${c.id}"${v ? ' checked' : ''}></label></div>`;
      else if (c.tipo === 'longo') input = `<textarea name="${c.id}" placeholder="${esc(c.ex || '')}">${esc(v)}</textarea>`;
      else {
        const tipo = c.tipo === 'data' ? 'date' : c.tipo === 'hora' ? 'time' : 'text';
        const modo = ['cpf', 'cnpj', 'processo', 'telefone', 'numero'].includes(c.tipo) ? ' inputmode="numeric"' : '';
        const cap = c.tipo === 'nome' ? ' autocapitalize="words"' : '';
        const ph = c.ex || ({ cpf: '000.000.000-00', cnpj: '00.000.000/0000-00', processo: '0000000-00.0000.8.02.0034', telefone: '(82) 9 0000-0000' })[c.tipo] || '';
        input = `<input type="${tipo}" name="${c.id}" value="${esc(v)}" placeholder="${esc(ph)}"${modo}${cap} autocomplete="off" spellcheck="${c.tipo === 'nome' || c.tipo === 'texto' || c.tipo === 'longo'}">`;
      }
      return `<div class="campo" data-c="${c.id}"><label for="f_${c.id}">${esc(c.rot)}${obr}</label>${input.replace(/name="/, `id="f_${c.id}" name="`)}<div class="aviso"></div></div>`;
    };

    UI.render(`
      <section class="tela-atd">
        <div class="atd-layout">
          <div>
            <div class="cartao atd-form" id="atdForm">
              <div class="cartao-cab"><h3 class="atd-passo"><span class="num">1</span> Dados da pessoa</h3></div>
              <p class="dica">${esc(m.desc)}</p>
              ${pessoasDoModelo(m).length ? `<button type="button" class="btn secundario atd-foto" id="atdFoto">${ic('camera')} Ler documento com a câmera <small>RG, CNH ou CPF</small></button>
              <p class="atd-dica-teclado">Se a leitura errar, use o teclado do celular: toque no campo e escolha <b>Escanear Texto</b> (iPhone) ou o ícone de <b>câmera/Lens</b> do teclado (Android, teclado Gboard) e aponte para o documento.</p>` : ''}
              <div id="atdCopias"></div>
              <div id="atdCampos"></div>
            </div>
            <div class="cartao atd-form">
              <div class="cartao-cab"><h3 class="atd-passo"><span class="num">2</span> Quem assina e data</h3></div>
              <div class="campo"><label for="aNome">Nome de quem assina</label><input id="aNome" value="${esc(ass.nome)}" autocapitalize="words"></div>
              <div class="campo"><label for="aCargo">Cargo</label><select id="aCargo">${[...new Set([ass.cargo, ...CARGOS_ASSIN])].map((c) => `<option${c === ass.cargo ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
              <div class="campo"><label for="aData">Data do documento</label><input type="date" id="aData" value="${dataDoc}"></div>
            </div>
          </div>
          <div class="cartao">
            <div class="atd-previa-cab">
              <h3 class="atd-passo"><span class="num">3</span> Confira e imprima</h3>
              <button class="btn mini" id="atdEditar">${ic('editar')} Ajustar texto</button>
            </div>
            <p class="dica" id="atdDicaEdit">Os campos em <mark style="background:#fff1a8;color:#6b4e00;padding:0 3px;border-radius:3px">amarelo</mark> ainda faltam preencher.</p>
            <div class="atd-previa" id="atdPrevia"><div class="escala" id="atdEscala"><div id="atdDocF"></div><div id="atdCopiaF"></div></div></div>
            <div class="atd-acoes">
              <button class="btn primario" id="atdImprimir">${ic('imprimir')} Imprimir</button>
              <button class="btn secundario" id="atdLimpar">Limpar e fazer outro</button>
            </div>
            <p class="atd-lgpd">${ic('cadeado')} <span>Os dados digitados não são enviados nem guardados. Ao sair desta tela, eles somem.</span></p>
          </div>
        </div>
      </section>`);

    const camposVisiveis = () => m.campos.filter((c) => !c.se || c.se(dados));
    const desenharCampos = () => {
      const foco = document.activeElement && document.activeElement.name;
      $('#atdCampos').innerHTML = camposVisiveis().map(campoHTML).join('');
      if (foco && $(`#atdCampos [name="${foco}"]`)) $(`#atdCampos [name="${foco}"]`).focus();
    };
    const copias = []; // fotos para a folha de cópia (só na memória desta tela)
    const ajustarEscala = () => {
      const caixa = $('#atdPrevia'), alvo = $('#atdEscala'); if (!caixa || !alvo) return;
      const folhas = $$('.folha', alvo); if (!folhas.length) return;
      const larg = caixa.clientWidth - 20, esc1 = Math.min(1, larg / folhas[0].offsetWidth);
      const alt = folhas.reduce((t, f) => t + f.offsetHeight, 0) + (folhas.length - 1) * 16;
      alvo.style.transform = `scale(${esc1})`;
      alvo.style.height = (alt * esc1) + 'px';
      alvo.style.width = (folhas[0].offsetWidth * esc1) + 'px';
    };
    const aposDesenhar = () => { requestAnimationFrame(ajustarEscala); $$('#atdEscala img').forEach((i) => { if (!i.complete) i.onload = ajustarEscala; }); };
    const desenharCopia = () => {
      $('#atdCopiaF').innerHTML = Impressao.copiaDocumento(copias, { documento: m.titulo.split(' — ')[0], assinante: ass, dataISO: dataDoc });
      $('#atdCopias').innerHTML = copias.length ? `
        <div class="atd-copias"><div class="atd-copias-tit">${ic('camera')} Cópia do documento para imprimir (folha extra)</div>
          <div class="atd-copias-lista">${copias.map((c, i) => `<div class="atd-copia"><img src="${c.src}" alt=""><div>
            <button type="button" class="btn mini" data-cp="girar" data-i="${i}" title="Girar">↻</button>
            <button type="button" class="btn mini" data-cp="tirar" data-i="${i}" title="Tirar da impressão">✕</button></div></div>`).join('')}</div>
          ${copias.length < 3 ? `<button type="button" class="btn mini" data-cp="mais">+ Adicionar foto do verso</button>` : ''}</div>` : '';
      aposDesenhar();
    };
    const desenharFolha = () => {
      if (modo !== 'auto') return;
      $('#atdDocF').innerHTML = Impressao.documento(m, dados, ass, dataDoc);
      aposDesenhar();
    };
    desenharCampos(); desenharFolha();
    window.addEventListener('resize', ajustarEscala);

    const atualizar = (nome, valor, redesenharCampos) => {
      dados[nome] = valor;
      if (redesenharCampos) desenharCampos();
      desenharFolha();
    };
    $('#atdCampos').addEventListener('input', (e) => {
      const el = e.target; if (!el.name) return;
      const c = m.campos.find((x) => x.id === el.name); if (!c) return;
      if (MASCARA[c.tipo]) { const p = el.selectionStart, antes = el.value.length; el.value = MASCARA[c.tipo](el.value); const dif = el.value.length - antes; try { el.setSelectionRange(p + dif, p + dif); } catch (_) {} }
      if (c.tipo === 'numero') el.value = el.value.replace(/[^\d/]/g, '');
      const caixa = el.closest('.campo'); caixa.classList.remove('erro');
      atualizar(c.id, c.tipo === 'sim' ? el.checked : el.value, c.tipo === 'sim');
    });
    $('#atdCampos').addEventListener('change', (e) => {
      const el = e.target; if (!el.name) return;
      const c = m.campos.find((x) => x.id === el.name);
      if (c && c.tipo === 'sim') { atualizar(c.id, el.checked, true); return; }
      if (c) { const av = el.closest('.campo').querySelector('.aviso'); if (av) av.textContent = avisoCampo(c, el.value); }
    });
    $('#atdCampos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-op]'); if (!b) return;
      const id = b.closest('.campo').dataset.c;
      $$('.chip', b.parentNode).forEach((x) => x.classList.toggle('on', x === b));
      b.closest('.campo').classList.remove('erro');
      atualizar(id, b.dataset.op, true);
    });
    $('#aNome').addEventListener('input', (e) => { ass.nome = e.target.value; desenharFolha(); if (copias.length) desenharCopia(); });
    $('#aCargo').addEventListener('change', (e) => { ass.cargo = e.target.value; try { localStorage.setItem('mj_cargo', ass.cargo); } catch (_) {} desenharFolha(); });
    $('#aData').addEventListener('change', (e) => { dataDoc = e.target.value || Impressao.hojeISO(); desenharFolha(); if (copias.length) desenharCopia(); });
    $('#atdCopias').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cp]'); if (!b) return;
      const i = +b.dataset.i;
      if (b.dataset.cp === 'tirar') { copias.splice(i, 1); desenharCopia(); return; }
      if (b.dataset.cp === 'girar') { copias[i] = await LeitorDoc.fotoCopia(copias[i].src, 90); desenharCopia(); return; }
      const f = LeitorDoc.temCamera() ? await LeitorDoc.abrirCamera() : await LeitorDoc.escolherDaGaleria();
      if (!f) return;
      copias.push(await LeitorDoc.fotoCopia(f, 0)); desenharCopia();
      UI.toast('Foto adicionada à cópia. Se ficou de lado, toque em ↻.', 'ok');
    });
    if ($('#atdFoto')) $('#atdFoto').addEventListener('click', () => lerDocumentoPorFoto(m, (p, val, copia) => {
      if (copia && copias.length < 3) { copias.push(copia); desenharCopia(); }
      if (!p) { UI.toast('A cópia do documento vai sair numa folha a mais. Preencha os dados à mão.', 'ok'); return; }
      const por = (id, valor) => { if (id && valor) dados[id] = valor; };
      if (p.ativar) dados[p.ativar] = true;
      por(p.nome, val.nome);
      por(p.cpf, val.cpf && MASCARA.cpf(val.cpf));
      por(p.rg, val.rg);
      por(p.nasc, val.nasc);
      por(p.mae, val.mae);
      por(p.filiacao, val.filiacao);
      if (p.doc) {
        if (val.cpf) { dados.docTipo = 'CPF'; dados.docNum = MASCARA.cpf(val.cpf); }
        else if (val.rg) { dados.docTipo = 'RG'; dados.docNum = val.rg; }
      }
      desenharCampos(); desenharFolha();
      $$('#atdCampos .campo').forEach((x) => x.classList.remove('erro'));
      UI.toast(modo === 'auto' ? 'Dados preenchidos. Confira com o documento.' : 'Dados preenchidos no formulário. Toque em "Desfazer ajustes" para vê-los na folha.', 'ok');
    }));

    // modo: 'auto' (folha segue o formulário) | 'editando' | 'ajustado' (ajustes à mão, folha congelada)
    $('#atdEditar').addEventListener('click', () => {
      const btn = $('#atdEditar');
      if (modo !== 'editando') {
        modo = 'editando';
        $$('#atdDocF .fl-p, #atdDocF .fl-tit, #atdDocF .fl-sub, #atdDocF .fl-data, #atdDocF .fl-nome, #atdDocF .fl-cargo, #atdDocF .fl-of-dest, #atdDocF .fl-of-ass, #atdDocF .fl-of-voc, #atdDocF .fl-of-num').forEach((p) => p.setAttribute('contenteditable', 'true'));
        btn.innerHTML = `${ic('check')} Concluir ajustes`;
        $('#atdDicaEdit').innerHTML = 'Toque no texto da folha para corrigir o que quiser. Enquanto estiver ajustando, mudanças no formulário não aparecem na folha.';
        $('#atdForm').style.opacity = '.55';
        const p1 = $('#atdDocF .fl-p'); if (p1) p1.focus();
      } else {
        modo = 'ajustado';
        $$('#atdEscala [contenteditable]').forEach((p) => p.removeAttribute('contenteditable'));
        btn.innerHTML = `${ic('editar')} Ajustar texto`;
        $('#atdForm').style.opacity = '';
        $('#atdDicaEdit').innerHTML = 'Ajustes feitos à mão. <button class="btn mini" id="atdRefazer">Desfazer ajustes</button>';
        $('#atdRefazer').addEventListener('click', () => { modo = 'auto'; desenharFolha(); $('#atdDicaEdit').textContent = 'A folha voltou a seguir o formulário.'; });
      }
    });

    $('#atdImprimir').addEventListener('click', () => {
      const faltam = camposVisiveis().filter((c) => c.obr && c.tipo !== 'secao' && c.tipo !== 'sim' && !String(dados[c.id] || '').trim());
      $$('#atdCampos .campo').forEach((x) => x.classList.toggle('erro', faltam.some((c) => c.id === x.dataset.c)));
      if (modo === 'editando') { $('#atdEditar').click(); }
      if (faltam.length && modo === 'auto') {
        UI.toast('Falta preencher: ' + faltam.map((c) => c.rot.replace(/\s*\(.*?\)/g, '')).join(', '), 'erro');
        const el = $(`#atdCampos [data-c="${faltam[0].id}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = el.querySelector('input,select,textarea'); if (i) setTimeout(() => { const a = document.activeElement; if (!a || !a.closest || !a.closest('#atdCampos')) i.focus(); }, 350); }
        return;
      }
      if (!ass.nome.trim()) { UI.toast('Informe o nome de quem assina.', 'erro'); $('#aNome').focus(); return; }
      const html = $('#atdDocF').innerHTML + $('#atdCopiaF').innerHTML;
      const nomeArq = (m.titulo.split(' — ')[0] + ' - ' + (dados.nome || dados.requerente || dados.razao || dados.adv || '')).trim().replace(/\s+-\s*$/, '');
      Impressao.imprimir(html, { titulo: nomeArq, tipo: 'doc' });
      if (navigator.standalone) UI.toast('Se a impressão não abrir, toque em Compartilhar › Imprimir.', 'ok');
    });
    $('#atdLimpar').addEventListener('click', () => {
      if (!confirmar('Apagar os dados digitados e começar outro documento?')) return;
      rotear();
    });
  }

  // ----------------------- Impressão de listas (filas, parados, metas, listas) -----------------------
  const IMPRESSOES = {};
  const botaoImprimir = (chave, texto) => `<button type="button" class="btn mini btn-imprimir" data-imprimir="${chave}">${ic('imprimir')} ${texto || 'Imprimir'}</button>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-imprimir]'); if (!b) return;
    const k = b.dataset.imprimir;
    if (k === 'parados') { e.preventDefault(); e.stopPropagation(); painelParados(); return; }
    if (k === 'fila' || k === 'filasProc') { e.preventDefault(); e.stopPropagation(); painelFilas(k === 'fila' ? estadoFilas.aberta : null); return; }
    const gerar = IMPRESSOES[k]; if (!gerar) return;
    e.preventDefault(); e.stopPropagation();
    const t = gerar();
    if (!t || !t.linhas.length) { UI.toast('Não há nada para imprimir com estes filtros.', 'erro'); return; }
    if (t.linhas.length > 150 && !confirmar(`São ${t.linhas.length.toLocaleString('pt-BR')} linhas (cerca de ${Math.ceil(t.linhas.length / 36)} folhas). Imprimir mesmo assim?\n\nDica: use os filtros (seus finais, tempo na fila…) para imprimir só o que precisa.`)) return;
    Impressao.imprimir(Impressao.tabela({ ...t, por: S.perfil && S.perfil.nome }), { titulo: t.titulo, tipo: 'lista' });
  }, true);

  // ----------------------- Painel "Imprimir processos" (Filas e Parados) -----------------------
  // Escolhe as filas (uma, várias ou todas), os finais (sequenciais) e se sai tudo junto,
  // uma lista por fila ou uma lista por final.
  //  cfg: { origem, titulo, sub, filas:[{nome, qtd}], filasIniciais, seqsIniciais, colunas, carregar(filasSel) -> [{numero, seq, fila, linha}] }
  let painelPrefs = (() => { try { return JSON.parse(localStorage.getItem('mj_impr') || '{}'); } catch (_) { return {}; } })();
  function abrirPainelImpressao(cfg) {
    const meus = (S.perfil.sequenciais || []).slice();
    const sel = new Set(cfg.filasIniciais && cfg.filasIniciais.length ? cfg.filasIniciais : cfg.filas.map((f) => f.nome));
    const seqs = new Set(cfg.seqsIniciais && cfg.seqsIniciais.length ? cfg.seqsIniciais : (meus.length ? meus : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1]));
    let modo = painelPrefs.modo || 'junto';
    const fundo = document.createElement('div');
    fundo.className = 'painel-fundo';
    fundo.innerHTML = `
      <div class="painel" role="dialog" aria-modal="true" aria-label="Imprimir processos">
        <div class="painel-cab"><h3>${ic('imprimir')} Imprimir processos</h3><button class="topo-btn" data-p="fechar" aria-label="Fechar">✕</button></div>
        <div class="painel-corpo">
          <div class="pi-bloco">
            <div class="pi-tit"><span class="num">1</span> Quais filas?</div>
            <div class="pi-atalhos"><button class="btn mini" data-p="todasF">Todas</button><button class="btn mini" data-p="nenhumaF">Nenhuma</button>
              <input type="search" class="pi-busca" placeholder="Procurar fila…"></div>
            <div class="pi-filas">${cfg.filas.map((f) => `
              <label class="pi-fila"><input type="checkbox" value="${esc(f.nome)}"${sel.has(f.nome) ? ' checked' : ''}><span>${esc(f.nome ? f.nome.replace(/^\d+\s*-\s*/, '') : '(sem fila)')}</span><small>${f.qtd.toLocaleString('pt-BR')}</small></label>`).join('')}</div>
          </div>
          <div class="pi-bloco">
            <div class="pi-tit"><span class="num">2</span> Quais finais (sequenciais)?</div>
            <div class="pi-atalhos">${meus.length ? '<button class="btn mini" data-p="meus">Meus finais</button>' : ''}<button class="btn mini" data-p="todosS">Todos</button></div>
            <div class="chips pi-seqs">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1].map((n) => `<button type="button" class="chip${seqs.has(n) ? ' on' : ''}" data-s="${n}">${n < 0 ? 'Sem final' : n}</button>`).join('')}</div>
          </div>
          <div class="pi-bloco">
            <div class="pi-tit"><span class="num">3</span> Como sair no papel?</div>
            <div class="pi-modos">
              ${[['junto', 'Tudo junto', 'Uma lista só, com a coluna da fila'], ['fila', 'Separado por fila', 'Cada fila começa numa folha nova'], ['final', 'Separado por final', 'Cada final numa folha (bom para entregar a cada servidor)']]
                .map(([k, t, d]) => `<label class="opcao"><input type="radio" name="piModo" value="${k}"${modo === k ? ' checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}
            </div>
          </div>
        </div>
        <div class="painel-pe"><span id="piConta" class="dica"></span><button class="btn primario" data-p="imprimir">${ic('imprimir')} Imprimir</button></div>
      </div>`;
    document.body.appendChild(fundo);
    document.body.classList.add('com-painel');
    const fechar = () => { fundo.remove(); document.body.classList.remove('com-painel'); };
    const conta = () => {
      const n = cfg.filas.filter((f) => sel.has(f.nome)).reduce((a, f) => a + f.qtd, 0);
      $('#piConta', fundo).textContent = `${sel.size} fila(s) · até ${n.toLocaleString('pt-BR')} processos, antes de filtrar os finais`;
    };
    conta();
    fundo.addEventListener('click', async (e) => {
      if (e.target === fundo) return fechar();
      const b = e.target.closest('[data-p],[data-s]'); if (!b) return;
      if (b.dataset.s != null) { const n = +b.dataset.s; seqs.has(n) ? seqs.delete(n) : seqs.add(n); b.classList.toggle('on', seqs.has(n)); return; }
      const p = b.dataset.p;
      if (p === 'fechar') return fechar();
      if (p === 'todasF' || p === 'nenhumaF') {
        $$('.pi-fila', fundo).forEach((l) => { if (l.style.display === 'none') return; const i = l.querySelector('input'); i.checked = p === 'todasF'; i.checked ? sel.add(i.value) : sel.delete(i.value); });
        return conta();
      }
      if (p === 'meus' || p === 'todosS') {
        seqs.clear(); (p === 'meus' ? meus : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1]).forEach((n) => seqs.add(n));
        $$('.pi-seqs .chip', fundo).forEach((c) => c.classList.toggle('on', seqs.has(+c.dataset.s)));
        return;
      }
      if (p === 'imprimir') {
        if (!sel.size) { UI.toast('Escolha pelo menos uma fila.', 'erro'); return; }
        if (!seqs.size) { UI.toast('Escolha pelo menos um final.', 'erro'); return; }
        modo = ($('input[name=piModo]:checked', fundo) || {}).value || 'junto';
        painelPrefs = { modo }; try { localStorage.setItem('mj_impr', JSON.stringify(painelPrefs)); } catch (_) {}
        b.disabled = true; b.textContent = 'Preparando…';
        let rows;
        try { rows = await cfg.carregar([...sel]); }
        catch (err) { UI.toast(err.message || String(err), 'erro'); b.disabled = false; b.innerHTML = `${ic('imprimir')} Imprimir`; return; }
        rows = rows.filter((r) => seqs.has(r.seq == null ? -1 : r.seq));
        b.disabled = false; b.innerHTML = `${ic('imprimir')} Imprimir`;
        if (!rows.length) { UI.toast('Nenhum processo com essas filas e finais.', 'erro'); return; }
        if (rows.length > 150 && !confirmar(`São ${rows.length.toLocaleString('pt-BR')} processos (cerca de ${Math.ceil(rows.length / 36)} folhas). Imprimir mesmo assim?`)) return;
        const finaisTxt = seqs.size === 11 ? 'todos os finais' : 'finais ' + [...seqs].sort((a, b2) => a - b2).map((n) => n < 0 ? 'sem final' : n).join(', ');
        const nomeFila = (f) => (f || '(sem fila)').replace(/^\d+\s*-\s*/, '');
        const por = S.perfil && S.perfil.nome;
        let html = '';
        if (modo === 'junto') {
          const variasFilas = sel.size > 1;
          html = Impressao.tabela({ titulo: cfg.titulo + (variasFilas ? '' : ' — ' + nomeFila([...sel][0])), sub: `${cfg.sub ? cfg.sub + ' · ' : ''}${variasFilas ? sel.size + ' filas · ' : ''}${finaisTxt}`,
            colunas: variasFilas ? [...cfg.colunas, { rot: 'Fila' }] : cfg.colunas,
            linhas: rows.map((r) => variasFilas ? [...r.linha, nomeFila(r.fila)] : r.linha), por });
        } else {
          const chave = (r) => modo === 'fila' ? (r.fila || '') : (r.seq == null ? -1 : r.seq);
          const grupos = new Map();
          rows.forEach((r) => { const k = chave(r); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); });
          const ordem = [...grupos.keys()].sort((a, b2) => modo === 'final' ? a - b2 : grupos.get(b2).length - grupos.get(a).length);
          html = ordem.map((k) => {
            const rs = grupos.get(k);
            const titulo = modo === 'fila' ? nomeFila(k) : (k < 0 ? 'Processos sem final' : 'Final ' + k);
            return Impressao.tabela({ titulo, sub: `${cfg.titulo}${cfg.sub ? ' · ' + cfg.sub : ''} · ${modo === 'fila' ? finaisTxt : sel.size + ' fila(s)'}`,
              colunas: modo === 'final' ? [...cfg.colunas, { rot: 'Fila' }] : cfg.colunas,
              linhas: rs.map((r) => modo === 'final' ? [...r.linha, nomeFila(r.fila)] : r.linha), por });
          }).join('');
        }
        fechar();
        Impressao.imprimir(html, { titulo: cfg.titulo, tipo: 'lista' });
      }
    });
    $('.pi-busca', fundo).addEventListener('input', (e) => {
      const t = semAcento(e.target.value);
      $$('.pi-fila', fundo).forEach((l) => { l.style.display = !t || semAcento(l.textContent).includes(t) ? '' : 'none'; });
    });
    $('.pi-filas', fundo).addEventListener('change', (e) => { const i = e.target; if (i.type !== 'checkbox') return; i.checked ? sel.add(i.value) : sel.delete(i.value); conta(); });
  }

  // Abre o painel a partir da tela de Filas
  function painelFilas(filaInicial) {
    const itens = S.filas.itens;
    const tot = new Map();
    itens.forEach((x) => tot.set(x.fila, (tot.get(x.fila) || 0) + x.qtd));
    const filas = [...tot.entries()].sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd }));
    const acervo = new Map(S.processos.map((p) => [p.numero, p]));
    const m2 = m2Mapa();
    const st = estadoFilas;
    const seqIni = st.seq === 'meus' ? (S.perfil.sequenciais || []) : /^\d$/.test(st.seq) ? [+st.seq] : st.seq === 'sem' ? [-1] : null;
    abrirPainelImpressao({
      titulo: 'Filas de Cumprimento', sub: 'mais antigos na fila primeiro',
      filas, filasIniciais: filaInicial ? [filaInicial] : null, seqsIniciais: seqIni,
      colunas: [{ rot: 'Processo' }, { rot: 'Seq.' }, { rot: 'Tempo na fila' }, { rot: 'Na fila desde' }, { rot: 'Classe · assunto' }],
      carregar: async (sel) => {
        const rows = await procsDasFilas(sel);
        if (!rows.length) throw new Error('A lista de processos das filas ainda não foi importada (Administração › Fluxo e Fila).');
        return rows.map((r) => {
          const p = acervo.get(r.numero), seq = p && p.sequencial != null ? p.sequencial : null;
          return { numero: r.numero, seq, fila: r.fila, linha: [r.numero, seq != null ? seq : '—', r.faixa || '', dataBR(r.entrada), [r.classe, r.assunto].filter(Boolean).join(' · ') + (m2.has(r.numero) ? ' (Meta 2)' : '')] };
        });
      }
    });
  }

  // Abre o painel a partir da tela de Processos Parados
  function painelParados() {
    const st = estadoParados;
    const base = S.processos.filter((p) => p.local === st.local);
    const cont = new Map();
    base.forEach((p) => cont.set(p.fila || '', (cont.get(p.fila || '') || 0) + 1));
    const filas = [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd }));
    const cumpridos = new Map(S.cumpridos.map((c) => [c.numero, c]));
    const m2 = m2Mapa();
    abrirPainelImpressao({
      titulo: 'Processos parados', sub: st.local + (st.soMeta2 ? ' · só Meta 2' : '') + ' · mais parados primeiro',
      filas, filasIniciais: st.fila ? [st.fila] : null, seqsIniciais: st.seqs,
      colunas: [{ rot: 'Processo' }, { rot: 'Seq.' }, { rot: 'Parado há' }, { rot: 'Últ. mov.' }, { rot: 'Situação' }],
      carregar: async (sel) => {
        const s = new Set(sel);
        return base.filter((p) => s.has(p.fila || '') && (!st.soMeta2 || m2.has(p.numero)))
          .sort((a, b) => b.faixa - a.faixa || a.numero.localeCompare(b.numero))
          .map((p) => { const c = cumpridos.get(p.numero); return { numero: p.numero, seq: p.sequencial, fila: p.fila,
            linha: [p.numero, p.sequencial == null ? '—' : p.sequencial, p.faixa_texto || rotuloFaixa(p.faixa), p.ultima_mov ? p.ultima_mov.split('-').reverse().join('/') : '', (m2.has(p.numero) ? 'Meta 2. ' : '') + (c ? 'Cumprido por ' + nomeUsuario(c.usuario_id) : '')] }; });
      }
    });
  }

  // ======================= LISTAS DE CUMPRIMENTO (Corregedoria, chefia…) =======================
  //  #/tarefas          todas as listas, com o disco de andamento de cada uma
  //  #/tarefas?id=N     a lista aberta: processos por final, marcar Feito/Pautada
  const TIPOS_AUD = ['Conciliação', 'Instrução e Julgamento', 'Preliminar', 'Júri', 'Outra'];
  const COR_TAR = { feito: '#0ca30c', tipo: '#3987e5', falta: '#5b6680' };
  let estadoTar = { id: null, ver: 'falta', seq: 'meus', area: 'Todas', busca: '', limite: 40 };
  let tarRecarregar = null;

  const ehAud = (l) => l && l.tipo === 'audiencia';
  const verboFeito = (l) => ehAud(l) ? 'Pautada' : 'Cumprido';
  function diasAte(iso) {
    if (!iso) return null;
    const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    const h = new Date(); h.setHours(0, 0, 0, 0);
    return Math.round((new Date(a, m - 1, d) - h) / 86400000);
  }
  function textoPrazo(iso) {
    const n = diasAte(iso);
    if (n == null) return '';
    if (n < 0) return `<span class="alerta-txt">prazo vencido em ${dataBR(iso)}</span>`;
    if (n === 0) return '<span class="alerta-txt">prazo termina hoje</span>';
    return `prazo ${dataBR(iso)} · <b>${n === 1 ? 'falta 1 dia' : 'faltam ' + n + ' dias'}</b>`;
  }
  // Soma o resumo (lista_id, sequencial, status, com_tipo, qtd) com filtro opcional de finais
  function contaTar(linhas, filtroSeq) {
    const c = { total: 0, feitos: 0, tipo: 0, falta: 0 };
    linhas.forEach((r) => {
      if (filtroSeq && !filtroSeq(r.sequencial)) return;
      c.total += r.qtd;
      if (r.status === 'feito') c.feitos += r.qtd; else if (r.com_tipo) c.tipo += r.qtd; else c.falta += r.qtd;
    });
    c.pend = c.total - c.feitos;
    c.pct = c.total ? Math.round(c.feitos / c.total * 100) : 0;
    c.pctTxt = (c.feitos && c.pct === 0 ? '<1' : c.feitos < c.total && c.pct === 100 ? '99' : c.pct) + '%';
    return c;
  }
  function segsTar(c, aud) {
    return aud
      ? [{ rotulo: 'Pautadas', valor: c.feitos, cor: COR_TAR.feito }, { rotulo: 'Tipo já identificado', valor: c.tipo, cor: COR_TAR.tipo }, { rotulo: 'Falta abrir', valor: c.falta, cor: COR_TAR.falta }]
      : [{ rotulo: 'Cumpridos', valor: c.feitos, cor: COR_TAR.feito }, { rotulo: 'Falta cumprir', valor: c.tipo + c.falta, cor: COR_TAR.falta }];
  }
  const resumoDeItens = (itens) => {
    const m = new Map();
    itens.forEach((x) => {
      const k = x.sequencial + '|' + x.status + '|' + !!x.aud_tipo;
      const r = m.get(k) || { sequencial: x.sequencial, status: x.status, com_tipo: !!x.aud_tipo, qtd: 0 };
      r.qtd++; m.set(k, r);
    });
    return [...m.values()];
  };
  // Pendentes dos meus finais em listas abertas (para o bloco do Início)
  function minhasTarefas(t) {
    if (!t) return { listas: 0, meus: 0 };
    const seqs = new Set(S.perfil.sequenciais || []);
    const abertas = new Set(t.listas.filter((l) => !l.encerrada).map((l) => l.id));
    const meus = t.resumo.filter((r) => abertas.has(r.lista_id) && r.status !== 'feito' && seqs.has(r.sequencial)).reduce((a, r) => a + r.qtd, 0);
    return { listas: abertas.size, meus };
  }

  async function telaTarefas() {
    const id = parseInt(consultaHash().get('id'), 10);
    if (id) return telaTarefa(id);
    UI.topo('Listas de Cumprimento', 'Pedidos da Corregedoria e da chefia', true);
    UI.render(`<section>${'<div class="cartao esqueleto"></div>'.repeat(3)}</section>`);
    let t;
    try { t = await DB.listarListasTarefas(); }
    catch (e) { UI.render(`<section><div class="vazio">${ic('prancheta')}<p>As listas ainda não estão disponíveis.</p><p class="dica">${esc(e.message)}</p></div></section>`); return; }
    S.tarefas = t;
    const seqs = new Set(S.perfil.sequenciais || []);
    const abertas = t.listas.filter((l) => !l.encerrada), fechadas = t.listas.filter((l) => l.encerrada);
    const cartao = (l) => {
      const linhas = t.resumo.filter((r) => r.lista_id === l.id);
      const c = contaTar(linhas), meu = contaTar(linhas, (s) => seqs.has(s));
      return `
        <a class="cartao lista-tar${l.encerrada ? ' encerrada' : ''}" href="#/tarefas?id=${l.id}">
          <div class="lt-disco">${Graficos.rosca(segsTar(c, ehAud(l)), { centro: c.pctTxt, sub: 'feito', tamanho: 88 })}</div>
          <div class="lt-info">
            <span class="selo ${ehAud(l) ? 'aud' : ''}">${ehAud(l) ? ic('calendario') + ' Audiências' : ic('prancheta') + ' Cumprimento'}</span>
            <b>${esc(l.titulo)}</b>
            <small>${l.origem ? esc(l.origem) + ' · ' : ''}${Graficos.fmt(c.feitos)} de ${Graficos.fmt(c.total)} ${ehAud(l) ? 'pautadas' : 'cumpridos'}${l.prazo ? ' · ' + textoPrazo(l.prazo) : ''}</small>
            ${seqs.size && !l.encerrada ? `<span class="lt-meus">${meu.pend ? `Seus finais: <b>${meu.pend}</b> por fazer` : (meu.total ? '<span class="ok-txt">&#10003; Seus finais estão em dia</span>' : 'Nenhum processo dos seus finais')}</span>` : ''}
          </div>
          <span class="lt-seta">${ic('voltar')}</span>
        </a>`;
    };
    UI.render(`
      <section>
        ${UI.ajuda('tarefas', 'Como funcionam as listas', [
          'Cada lista é um <b>pedido</b> (da Corregedoria, por exemplo) com vários processos. O <b>disco</b> mostra quanto já foi feito.',
          'Toque numa lista. Os processos dos <b>seus finais</b> já aparecem separados para você.',
          'Toque em <b>Copiar</b>, abra o processo no SAJ, faça o que a lista pede e volte para tocar em <b>Cumprido</b> (ou <b>Pautada</b>, nas listas de audiência).',
          'Todo mundo vê o andamento na hora, inclusive a chefia. Marcou errado? Toque em <b>Desfazer</b>.'
        ])}
        ${ehAdmin() ? `
        <div class="cartao nova-tar" id="tarNova">
          <div class="cartao-cab"><h3>${ic('mais')} Nova lista</h3></div>
          <p class="dica">Recebeu uma planilha com números de processo? Envie aqui: o app separa por <b>final (sequencial)</b> sozinho e cada servidor vê só os seus.</p>
          <label class="btn primario largo arquivo">${ic('enviar')} Escolher a planilha (.xlsx)<input type="file" id="tarArq" accept=".xlsx,.xls,.csv"></label>
          <div id="tarPrev"></div>
        </div>` : ''}
        ${abertas.length ? abertas.map(cartao).join('') : `<div class="vazio">${ic('prancheta')}<p>Nenhuma lista aberta no momento.</p>${ehAdmin() ? '' : '<p class="dica">Quando a chefia enviar uma lista, ela aparece aqui.</p>'}</div>`}
        ${fechadas.length ? `<details class="tar-fechadas"><summary>Listas encerradas (${fechadas.length})</summary>${fechadas.map(cartao).join('')}</details>` : ''}
      </section>`);
    if (ehAdmin()) ligarNovaLista();
  }

  function ligarNovaLista() {
    $('#tarArq').addEventListener('change', async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const alvo = $('#tarPrev');
      alvo.innerHTML = '<div class="carregando">Lendo a planilha…</div>';
      let r;
      try { r = await Parser.lerListaTarefas(f); }
      catch (e) { alvo.innerHTML = `<p class="alerta-txt">${esc(e.message)}</p>`; ev.target.value = ''; return; }
      // Sequencial que faltar: tenta achar no relatório de processos parados
      if (r.comSeq < r.itens.length) {
        try { if (!S.processos.length) await carregar('processos'); } catch (_) {}
        const ac = new Map(S.processos.map((p) => [p.numero, p.sequencial]));
        r.itens.forEach((x) => { if (x.sequencial == null && ac.get(x.numero) != null) x.sequencial = ac.get(x.numero); });
        r.comSeq = r.itens.filter((x) => x.sequencial != null).length;
      }
      const porSeq = Array.from({ length: 10 }, (_, k) => ({ rotulo: String(k), valor: r.itens.filter((x) => x.sequencial === k).length }));
      const semSeq = r.itens.length - r.comSeq;
      const pareceAud = /audi[eê]n/i.test(r.titulo + ' ' + r.arquivo);
      const G = Graficos;
      alvo.innerHTML = `
        <div class="tar-prev">
          <p class="ok-txt">&#10003; <b>${G.fmt(r.itens.length)}</b> processos encontrados${Object.keys(r.areas).length > 1 || !r.areas['Sem área'] ? ' · ' + Object.entries(r.areas).map(([k, v]) => `${esc(k)} ${G.fmt(v)}`).join(' · ') : ''}</p>
          ${semSeq ? `<p class="dica">${G.fmt(semSeq)} sem final (sequencial): aparecem para quem escolher "Sem final".</p>` : ''}
          <div class="rotulo">Quantos processos ficam com cada final</div>
          ${G.colunas(porSeq)}
          <label>Nome da lista<input id="tarTitulo" maxlength="120" value="${esc(r.titulo)}"></label>
          <div class="rotulo">O que os servidores devem fazer?</div>
          <div class="tar-tipo-esc">
            <label class="opcao"><input type="radio" name="tarTipo" value="cumprir"${pareceAud ? '' : ' checked'}><span>${ic('prancheta')}<b>Cumprir</b><small>Fazer o ato pedido e marcar <b>Cumprido</b></small></span></label>
            <label class="opcao"><input type="radio" name="tarTipo" value="audiencia"${pareceAud ? ' checked' : ''}><span>${ic('calendario')}<b>Audiências</b><small>Ver na decisão qual audiência é, escolher o tipo e marcar <b>Pautada</b></small></span></label>
          </div>
          <label>Explique em poucas palavras o pedido <small>(aparece no topo da lista)</small>
            <textarea id="tarOrient" rows="3" maxlength="1000" placeholder="${pareceAud ? 'Ex.: A Corregedoria pede que todas estas audiências sejam marcadas na pauta.' : 'Ex.: Cumprir o despacho pendente e movimentar no SAJ.'}">${pareceAud ? 'A Corregedoria pede que todas estas audiências sejam marcadas na pauta. Abra a decisão no SAJ, veja qual audiência foi determinada, escolha o tipo aqui e, depois de pautar, toque em Pautada.' : ''}</textarea></label>
          <div class="linha2">
            <label>Quem pediu<input id="tarOrigem" maxlength="120" value="Corregedoria"></label>
            <label>Prazo <small>(opcional)</small><input type="date" id="tarPrazo"></label>
          </div>
          ${r.temProvidencia ? '<p class="dica">A planilha tem uma coluna de providência: ela aparece em cada processo.</p>' : ''}
          <div class="acoes"><button class="btn primario" id="tarCriar">${ic('check')} Criar lista com ${G.fmt(r.itens.length)} processos</button>
          <button class="btn secundario" id="tarCancelar">Cancelar</button></div>
        </div>`;
      $('#tarCancelar').addEventListener('click', () => { alvo.innerHTML = ''; ev.target.value = ''; });
      $('#tarCriar').addEventListener('click', (e2) => UI.ocupado(e2.currentTarget, async () => {
        const lista = {
          titulo: $('#tarTitulo').value.trim() || r.titulo,
          tipo: ($('input[name=tarTipo]:checked') || {}).value || 'cumprir',
          orientacao: $('#tarOrient').value.trim(),
          origem: $('#tarOrigem').value.trim(),
          prazo: $('#tarPrazo').value || null
        };
        const novo = await DB.criarListaTarefas(lista, r.itens);
        UI.toast('Lista criada. Os servidores já podem ver.', 'ok');
        estadoTar.id = null;
        location.hash = '#/tarefas?id=' + novo;
      }));
    });
  }

  async function telaTarefa(id) {
    UI.topo('Lista de Cumprimento', 'Carregando…', true);
    UI.render(`<section>${'<div class="cartao esqueleto"></div>'.repeat(3)}</section>`);
    const [t, itens] = await Promise.all([DB.listarListasTarefas(), DB.itensDaLista(id), carregar('usuarios')]);
    const l = t.listas.find((x) => x.id === id);
    if (!l) { UI.render(`<section><div class="vazio">${ic('prancheta')}<p>Esta lista não existe mais.</p><a class="btn secundario" href="#/tarefas">Ver as listas</a></div></section>`); return; }
    const meusSeqs = new Set(S.perfil.sequenciais || []);
    if (estadoTar.id !== id) estadoTar = { id, ver: 'falta', seq: meusSeqs.size ? 'meus' : 'todos', area: 'Todas', busca: '', limite: 40 };
    const st = estadoTar, aud = ehAud(l), G = Graficos;
    let dados = itens;
    const areas = [...new Set(dados.map((x) => x.area).filter(Boolean))];
    UI.topo(l.titulo, (aud ? 'Audiências' : 'Cumprimento') + (l.origem ? ' · ' + l.origem : ''), true);

    UI.render(`
      <section class="tela-tar">
        ${UI.ajuda(aud ? 'tarefaAud' : 'tarefaCump', aud ? 'Como fazer esta lista de audiências' : 'Como fazer esta lista', aud ? [
          'Toque em <b>Copiar</b> e abra o processo no SAJ.',
          'Leia a <b>decisão</b> e veja qual audiência o juiz determinou.',
          'Toque no tipo: <b>Conciliação</b>, <b>Instrução e Julgamento</b>, <b>Preliminar</b> (criminal) ou <b>Júri</b>.',
          'Depois de marcar a audiência na pauta, toque em <b>Pautada</b>. Pronto: o disco avança para todos.'
        ] : [
          'Toque em <b>Copiar</b> e abra o processo no SAJ.',
          'Faça o que a lista pede (veja o quadro "O que fazer").',
          'Volte aqui e toque em <b>Cumprido</b>. O disco avança para todos.',
          'Marcou errado? Toque em <b>Desfazer</b>.'
        ])}
        <div class="cartao tar-oque">
          <div class="cartao-cab"><h3>${ic('sino')} O que fazer</h3>${l.encerrada ? '<span class="selo">Encerrada</span>' : ''}</div>
          <p>${l.orientacao ? esc(l.orientacao).replace(/\n/g, '<br>') : aud ? 'Identificar o tipo de audiência de cada processo e marcá-la na pauta.' : 'Cumprir cada processo e marcar como cumprido.'}</p>
          <p class="dica">${l.prazo ? textoPrazo(l.prazo) + ' · ' : ''}criada em ${UI.dataHora(l.criado_em)}${l.criado_por ? ' por ' + esc(nomeUsuario(l.criado_por)) : ''}</p>
        </div>
        <div class="cartao" id="tarAndamento"></div>
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('pessoa')} Andamento por final</h3></div>
          <p class="dica">Toque num final para ver só os processos dele.</p>
          <div class="tar-finais" id="tarFinais"></div>
        </div>
        <div class="cartao" id="tarListaCartao">
          <div class="segmentado" id="tarVer" role="tablist"></div>
          ${areas.length > 1 ? `<div class="abas" id="tarArea">${['Todas', ...areas].map((a) => `<button class="aba${st.area === a ? ' on' : ''}" data-a="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}
          <div class="linha"><input type="search" id="tarBusca" placeholder="Buscar pelo número do processo…" value="${esc(st.busca)}"></div>
          <div class="resumo-lista" id="tarResumo"></div>
          <div class="lista" id="tarLista"></div>
        </div>
        ${ehAdmin() ? `
        <div class="cartao tar-admin">
          <div class="cartao-cab"><h3>${ic('cadeado')} Administração da lista</h3></div>
          <p class="dica">Encerre quando o pedido estiver concluído: a lista vai para "encerradas" e ninguém mais marca nela.</p>
          <div class="acoes">
            <button class="btn secundario" data-tadm="${l.encerrada ? 'reabrir' : 'encerrar'}">${l.encerrada ? 'Reabrir lista' : ic('check') + ' Encerrar lista'}</button>
            <button class="btn secundario perigo" data-tadm="excluir">Excluir lista</button>
          </div>
        </div>` : ''}
      </section>`);

    const filtroSeq = () => st.seq === 'meus' ? (s) => meusSeqs.has(s) : st.seq === 'todos' ? () => true : st.seq === 'sem' ? (s) => s == null : (s) => s === st.seq;
    const rotuloSeq = () => st.seq === 'meus' ? 'dos seus finais (' + UI.listaSeq([...meusSeqs]) + ')' : st.seq === 'todos' ? 'de todos os finais' : st.seq === 'sem' ? 'sem final' : 'do final ' + st.seq;

    function desenharAndamento() {
      const geral = contaTar(resumoDeItens(dados));
      const meu = contaTar(resumoDeItens(dados), (s) => meusSeqs.has(s));
      const porTipo = {};
      dados.forEach((x) => { if (x.aud_tipo) porTipo[x.aud_tipo] = (porTipo[x.aud_tipo] || 0) + 1; });
      const tipos = TIPOS_AUD.filter((k) => porTipo[k]).map((k) => ({ rotulo: k, valor: porTipo[k], cor: G.COR.s1 }));
      const legs = segsTar(geral, aud);
      $('#tarAndamento').innerHTML = `
        <div class="cartao-cab"><h3>${ic('grafico')} Andamento da lista</h3><span class="selo">${G.fmt(geral.total)} processos</span></div>
        <div class="tar-and">
          ${G.rosca(legs, { centro: geral.pctTxt, sub: aud ? 'pautadas' : 'cumpridos', tamanho: 132 })}
          <div class="tar-and-num">
            ${legs.map((g) => `<div><i style="background:${g.cor}"></i><span>${g.rotulo}</span><b>${G.fmt(g.valor)}</b></div>`).join('')}
            ${meusSeqs.size ? `<div class="tar-meu">Seus finais: <b>${G.fmt(meu.feitos)}</b> de <b>${G.fmt(meu.total)}</b>${meu.total ? ` <span class="${meu.pend ? '' : 'ok-txt'}">${meu.pend ? '· faltam ' + meu.pend : '&#10003; em dia'}</span>` : ''}</div>` : ''}
          </div>
        </div>
        ${aud && tipos.length ? `<div class="rotulo">Tipos já identificados</div>${G.barrasH(tipos, { larguraRotulo: 150 })}` : ''}`;
      const fin = [...Array(10).keys()].map((k) => ({ k, c: contaTar(resumoDeItens(dados), (s) => s === k) }));
      const sem = contaTar(resumoDeItens(dados), (s) => s == null);
      const tile = (val, rot, c, extra) => `
        <button type="button" class="tar-final${String(st.seq) === String(val) ? ' on' : ''}${extra || ''}" data-seq="${val}">
          ${G.rosca(segsTar(c, aud), { mini: true, tamanho: 34 })}
          <b>${rot}</b><small>${c.total ? `${c.feitos}/${c.total}` : '—'}</small>
        </button>`;
      $('#tarFinais').innerHTML =
        (meusSeqs.size ? tile('meus', 'Meus', contaTar(resumoDeItens(dados), (s) => meusSeqs.has(s)), ' meus') : '') +
        tile('todos', 'Todos', geral, ' todos') +
        fin.map(({ k, c }) => tile(k, String(k), c, meusSeqs.has(k) ? ' eh-meu' : '')).join('') +
        (sem.total ? tile('sem', 'Sem', sem) : '');
    }

    function desenharLista() {
      const fs = filtroSeq();
      const dig = st.busca.replace(/\D/g, '');
      const base = dados.filter((x) => fs(x.sequencial) && (st.area === 'Todas' || x.area === st.area) && (!dig || x.numero.replace(/\D/g, '').includes(dig)));
      const falta = base.filter((x) => x.status !== 'feito'), feitos = base.filter((x) => x.status === 'feito');
      const lista = st.ver === 'falta' ? falta : st.ver === 'feito' ? feitos : base;
      const segs = [['falta', 'Falta fazer', falta.length], ['feito', aud ? 'Pautadas' : 'Feitos', feitos.length], ['todos', 'Todos', base.length]];
      const iv = segs.findIndex((s) => s[0] === st.ver);
      $('#tarVer').style.setProperty('--seg', iv);
      $('#tarVer').innerHTML = segs.map(([k, t, n]) => `<button class="${st.ver === k ? 'on' : ''}" data-v="${k}" role="tab">${t} <small>${n}</small></button>`).join('') + '<span class="seg-ind"></span>';
      IMPRESSOES.tarefa = () => ({
        titulo: l.titulo,
        sub: `${l.origem ? l.origem + ' · ' : ''}${st.ver === 'falta' ? 'falta fazer' : st.ver === 'feito' ? (aud ? 'pautadas' : 'feitos') : 'todos'} · ${rotuloSeq()}${st.area !== 'Todas' ? ' · ' + st.area : ''}`,
        colunas: [{ rot: 'Processo' }, { rot: 'Final' }, { rot: 'Área' }, { rot: 'Dias', num: true }, ...(aud ? [{ rot: 'Audiência' }] : []), { rot: 'Situação' }],
        linhas: lista.map((x) => [x.numero, x.sequencial == null ? '—' : x.sequencial, x.area || '', x.dias == null ? '' : x.dias, ...(aud ? [x.aud_tipo || ''] : []), x.status === 'feito' ? verboFeito(l) + ' — ' + nomeUsuario(x.feito_por) : 'Falta fazer'])
      });
      $('#tarResumo').innerHTML = `${botaoImprimir('tarefa')} ${lista.length} processo(s) ${rotuloSeq()}${lista.length && st.ver !== 'feito' ? ` <button class="btn mini" data-tacao="copiarTodos">${ic('copiar')} Copiar os números</button>` : ''}`;
      if (!lista.length) {
        $('#tarLista').innerHTML = `<div class="vazio">${st.ver === 'falta' && base.length ? '&#127881; Tudo feito por aqui. Bom trabalho!' : 'Nenhum processo com estes filtros.'}</div>`;
        return;
      }
      $('#tarLista').innerHTML = lista.slice(0, st.limite).map(itemTar).join('') +
        (lista.length > st.limite ? `<button class="btn secundario largo" data-tacao="mais">Mostrar mais (${lista.length - st.limite})</button>` : '');
      $('#tarLista').dataset.total = lista.length;
    }

    function itemTar(x) {
      const feito = x.status === 'feito';
      const meu = x.feito_por === S.perfil.id;
      const tarjas = (x.tarjas || '').split(' · ').filter(Boolean);
      return `
        <div class="proc tar-item${feito ? ' feito' : ''}" data-id="${x.id}" data-n="${esc(x.numero)}">
          <div class="proc-num">${esc(x.numero)}</div>
          <div class="proc-meta">
            <span class="badge seqb${meusSeqs.has(x.sequencial) ? ' meu' : ''}">Final ${x.sequencial == null ? '—' : x.sequencial}</span>
            ${x.area ? `<span>${esc(x.area)}</span>` : ''}
            ${x.dias != null ? `<span class="${x.dias >= 365 ? 'alerta-txt' : ''}">${G.fmt(x.dias)} dias na fila</span>` : ''}
            ${tarjas.map((k) => `<span class="badge tarja">${esc(k)}</span>`).join('')}
          </div>
          ${x.providencia ? `<div class="tar-prov">${ic('sino')} ${esc(x.providencia)}</div>` : ''}
          ${aud ? `
          <div class="tar-tipos">
            <span class="rotulo">${x.aud_tipo ? 'Audiência:' : 'Qual audiência a decisão determinou?'}</span>
            <div class="chips">${TIPOS_AUD.map((k) => `<button type="button" class="chip${x.aud_tipo === k ? ' on' : ''}" data-tacao="tipo" data-tipo="${esc(k)}"${l.encerrada ? ' disabled' : ''}>${esc(k)}</button>`).join('')}</div>
          </div>` : ''}
          ${feito ? `<div class="proc-meta"><span class="ok-txt">&#10003; ${verboFeito(l)} por ${esc(nomeUsuario(x.feito_por))} · ${UI.dataHora(x.feito_em)}</span></div>` : ''}
          <div class="proc-acoes">
            <button class="btn mini" data-tacao="copiar">${ic('copiar')} Copiar</button>
            ${l.encerrada ? '' : feito
              ? (meu || ehAdmin() ? '<button class="btn mini" data-tacao="desfazer">Desfazer</button>' : '')
              : `<button class="btn mini ok grande" data-tacao="feito">${ic('check')} ${verboFeito(l)}</button>`}
          </div>
        </div>`;
    }

    function tudo() { desenharAndamento(); desenharLista(); }
    tudo();
    animarNumeros($('#app'));

    $('#tarFinais').addEventListener('click', (e) => {
      const b = e.target.closest('[data-seq]'); if (!b) return;
      const v = b.dataset.seq;
      st.seq = ['meus', 'todos', 'sem'].includes(v) ? v : parseInt(v, 10);
      st.limite = 40;
      $$('#tarFinais .tar-final').forEach((x) => x.classList.toggle('on', x === b));
      desenharLista();
      $('#tarListaCartao').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#tarVer').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      st.ver = b.dataset.v; st.limite = 40; desenharLista();
    });
    if ($('#tarArea')) $('#tarArea').addEventListener('click', (e) => {
      const b = e.target.closest('.aba'); if (!b) return;
      st.area = b.dataset.a; st.limite = 40;
      $$('#tarArea .aba').forEach((x) => x.classList.toggle('on', x === b)); desenharLista();
    });
    $('#tarBusca').addEventListener('input', (e) => { st.busca = e.target.value; desenharLista(); });

    $('#tarLista').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-tacao]'); if (!b) return;
      const ac = b.dataset.tacao;
      if (ac === 'mais') { st.limite += 60; desenharLista(); return; }
      if (ac === 'copiarTodos') return;
      const card = b.closest('.tar-item'); const itemId = parseInt(card.dataset.id, 10);
      const x = dados.find((d) => d.id === itemId);
      if (ac === 'copiar') return UI.copiar(x.numero);
      if (ac === 'feito' && aud && !x.aud_tipo) {
        UI.toast('Antes, toque no tipo da audiência (Conciliação, Instrução…).', 'erro');
        const tp = $('.tar-tipos', card); tp.classList.remove('chamar'); void tp.offsetWidth; tp.classList.add('chamar');
        return;
      }
      let status = null, tipo;
      if (ac === 'feito') status = 'feito';
      if (ac === 'desfazer') status = 'pendente';
      if (ac === 'tipo') tipo = x.aud_tipo === b.dataset.tipo ? '' : b.dataset.tipo;
      b.disabled = true;
      try {
        const novo = await DB.marcarTarefa(itemId, status, tipo);
        Object.assign(x, novo || {});
        if (ac === 'feito') {
          UI.toast(aud ? 'Audiência marcada como pautada. Ótimo!' : 'Marcado como cumprido. Bom trabalho!', 'ok');
          if (st.ver === 'falta') { card.classList.add('saindo'); await new Promise((r) => setTimeout(r, 320)); }
        }
        if (ac === 'desfazer') UI.toast('Desfeito: voltou para "Falta fazer".', 'ok');
        if (ac === 'tipo') {
          desenharAndamento();
          const novoCard = itemTar(x);
          card.outerHTML = novoCard;
          return;
        }
        tudo();
      } catch (err) {
        UI.toast(err.message || String(err), 'erro');
        b.disabled = false;
      }
    });
    $('#tarResumo').addEventListener('click', (e) => {
      if (!e.target.closest('[data-tacao="copiarTodos"]')) return;
      const fs = filtroSeq(), dig = st.busca.replace(/\D/g, '');
      const nums = dados.filter((x) => fs(x.sequencial) && (st.area === 'Todas' || x.area === st.area) && (!dig || x.numero.replace(/\D/g, '').includes(dig)) && (st.ver === 'todos' || x.status !== 'feito')).map((x) => x.numero);
      UI.copiar(nums.join('\n'), nums.length + ' número(s) copiados, um por linha. Cole no SAJ ou numa planilha.');
    });
    const adm = $('.tar-admin');
    if (adm) adm.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tadm]'); if (!b) return;
      const a = b.dataset.tadm;
      if (a === 'excluir' && !confirmar('Excluir esta lista e todas as marcações? Não dá para desfazer.')) return;
      if (a === 'encerrar' && !confirmar('Encerrar esta lista? Ninguém mais poderá marcar nela.')) return;
      UI.ocupado(b, async () => {
        if (a === 'excluir') { await DB.excluirListaTarefas(id); UI.toast('Lista excluída.', 'ok'); location.hash = '#/tarefas'; return; }
        await DB.atualizarListaTarefas(id, { encerrada: a === 'encerrar' });
        UI.toast(a === 'encerrar' ? 'Lista encerrada.' : 'Lista reaberta.', 'ok');
        rotear();
      });
    });

    // Volta do SAJ para o app: busca as marcações dos colegas
    tarRecarregar = async () => {
      if (!$('#tarLista') || estadoTar.id !== id) return;
      try { dados = await DB.itensDaLista(id); tudo(); } catch (_) {}
    };
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && tarRecarregar) tarRecarregar(); });

  // ======================= FILAS DE CUMPRIMENTO =======================
  const ORDEM_FAIXA = ['1 a 15 dias', '+ 15 dias', '+ 30 dias', '+ 60 dias', '+ 100 dias', '+ 120 dias', '+ 180 dias', '+ 365 dias'];
  const COR_FAIXA = { '1 a 15 dias': '#4d8dff', '+ 15 dias': '#7fb0ff', '+ 30 dias': '#e9c46a', '+ 60 dias': '#f4a259', '+ 100 dias': '#e5603e', '+ 120 dias': '#d43a3a', '+ 180 dias': '#b02a2a', '+ 365 dias': '#8a1c1c' };
  const ordFaixa = (f) => { const i = ORDEM_FAIXA.indexOf(f); return i < 0 ? 99 : i; };
  const estadoFilas = { area: 'Todas', aberta: null, cache: {}, seq: 'todos', faixa: '', busca: '', limite: 50 };

  async function telaFilas() {
    UI.topo('Filas de Cumprimento', 'Fluxo e Fila do SAJ', true);
    UI.render('<div class="carregando">Carregando filas…</div>');
    await carregar('filas', 'processos');
    const snap = S.filas;
    if (!snap) {
      UI.render(`<section><div class="vazio">${ic('lista')}<p>As filas ainda não foram importadas.</p>
        ${ehAdmin() ? '<a class="btn primario" href="#/admin">Importar planilha Fluxo e Fila</a>' : '<p class="dica">O administrador precisa importar a planilha "Fluxo e Fila" do SAJ Insights.</p>'}</div></section>`);
      return;
    }
    UI.render(`
      <section>
        ${UI.ajuda('filas', 'Como ler esta tela', [
          'Cada cartão é uma <b>fila do SAJ</b>, da maior para a menor, com o total de processos parados nela.',
          'A barra colorida mostra <b>há quanto tempo</b> estão na fila: azul = recente, amarelo/laranja = atenção, vermelho = mais de 100 dias.',
          'Use as abas para ver só <b>Cível</b> ou <b>Criminal</b>. Toque num cartão para ver os <b>processos daquela fila</b>, filtrar pelo seu sequencial e copiar o número.', 'A <b>Conferência de audiências</b> mostra quem está em Ag. Designação de Audiência mas já foi pautado — dá para conferir também com a pauta em PDF.'
        ])}
        <div class="cartao resumo-filas">
          <div class="numeros">
            <div class="destaque"><b>${snap.total.toLocaleString('pt-BR')}</b><small>Processos nas filas</small></div>
            <div><b id="fQtdFilas">–</b><small>Filas com processos</small></div>
            <div><b id="fMais100">–</b><small>Há +100 dias</small></div>
          </div>
          <p class="dica">Referência ${snap.referencia ? esc(snap.referencia.split('-').reverse().join('/')) : '—'} · importado em ${UI.dataHora(snap.criado_em)}</p>
          <div class="legenda">${ORDEM_FAIXA.slice(0, 5).map((f) => `<span><i style="background:${COR_FAIXA[f]}"></i>${f}</span>`).join('')}</div>
        </div>
        <div id="fAudiencia"></div>
        <div class="linha-acoes">${botaoImprimir('filasProc', 'Imprimir processos das filas')}${botaoImprimir('filas', 'Imprimir quadro (resumo)')}</div>
        <div class="abas" id="fAbas">${['Todas', 'Cível', 'Criminal', 'Outros'].map((a) => `<button class="aba${estadoFilas.area === a ? ' on' : ''}" data-a="${a}">${a}</button>`).join('')}</div>
        <div id="fLista" class="lista filas"></div>
      </section>`);
    $('#fAbas').addEventListener('click', (e) => {
      const b = e.target.closest('.aba'); if (!b) return;
      estadoFilas.area = b.dataset.a; estadoFilas.aberta = null;
      $$('#fAbas .aba').forEach((x) => x.classList.toggle('on', x === b)); desenharFilas();
    });
    $('#fLista').addEventListener('click', (e) => {
      const card = e.target.closest('.fila-card'); if (!card || e.target.closest('a') || e.target.closest('.fila-procs')) return;
      estadoFilas.limite = 50;
      estadoFilas.aberta = estadoFilas.aberta === card.dataset.fila ? null : card.dataset.fila; desenharFilas();
    });
    desenharFilas();
    montarConferenciaAudiencia();
  }

  function desenharFilas() {
    const itens = S.filas.itens.filter((x) => estadoFilas.area === 'Todas' || x.area === estadoFilas.area);
    const grupos = new Map();
    for (const x of itens) {
      const g = grupos.get(x.fila) || { fila: x.fila, total: 0, faixas: {} };
      g.total += x.qtd; g.faixas[x.faixa] = (g.faixas[x.faixa] || 0) + x.qtd;
      grupos.set(x.fila, g);
    }
    const lista = [...grupos.values()].sort((a, b) => b.total - a.total);
    const mais100 = itens.filter((x) => ordFaixa(x.faixa) >= ordFaixa('+ 100 dias')).reduce((a, b) => a + b.qtd, 0);
    IMPRESSOES.filas = () => {
      const fx = ORDEM_FAIXA.filter((f) => lista.some((g) => g.faixas[f]));
      return { titulo: 'Filas de Cumprimento — ' + (estadoFilas.area === 'Todas' ? 'todas as áreas' : estadoFilas.area),
        sub: `Referência ${S.filas.referencia ? S.filas.referencia.split('-').reverse().join('/') : '—'} · quantidade de processos por tempo na fila`,
        colunas: [{ rot: 'Fila' }, { rot: 'Total', num: true }, ...fx.map((f) => ({ rot: f, num: true }))],
        linhas: lista.map((g) => [g.fila, g.total, ...fx.map((f) => g.faixas[f] || '')]) };
    };
    $('#fQtdFilas').textContent = lista.length;
    $('#fMais100').textContent = mais100.toLocaleString('pt-BR');
    const procPorFila = {};
    for (const p of S.processos) if (p.fila) procPorFila[p.fila] = (procPorFila[p.fila] || 0) + 1;

    $('#fLista').innerHTML = lista.map((g) => {
      const faixas = Object.keys(g.faixas).sort((a, b) => ordFaixa(a) - ordFaixa(b));
      const nome = g.fila.replace(/^\d+\s*-\s*/, '');
      const codigo = (g.fila.match(/^(\d+)/) || [])[1];
      const tags = [];
      if (/urgente|protetiva|preso/i.test(g.fila)) tags.push('<span class="badge f365">Urgente</span>');
      if (/conclus/i.test(g.fila)) tags.push('<span class="badge">Gabinete</span>');
      if (/sisbajud|bacen|renajud|infojud|sistemas externos/i.test(g.fila)) tags.push('<span class="badge dil">Sistemas</span>');
      const aberta = estadoFilas.aberta === g.fila;
      const nProc = procPorFila[g.fila] || 0;
      return `
        <div class="fila-card${aberta ? ' aberta' : ''}" data-fila="${esc(g.fila)}">
          <div class="fila-topo">
            <div class="fila-nome"><b>${esc(nome)}</b><small>${codigo ? 'Fila ' + codigo : ''} ${tags.join(' ')}</small></div>
            <div class="fila-total">${g.total.toLocaleString('pt-BR')}</div>
          </div>
          <div class="barra-pilha">${faixas.map((f) => `<span style="width:${(g.faixas[f] / g.total * 100).toFixed(2)}%;background:${COR_FAIXA[f] || '#888'}" title="${esc(f)}: ${g.faixas[f]}"></span>`).join('')}</div>
          ${aberta ? `
          <div class="fila-detalhe">
            ${faixas.map((f) => `<div><i style="background:${COR_FAIXA[f] || '#888'}"></i>${esc(f)}<b>${g.faixas[f]}</b></div>`).join('')}
            <div class="fila-procs" id="fProcs" data-nproc="${nProc}"><div class="carregando">Carregando processos…</div></div>
          </div>` : ''}
        </div>`;
    }).join('') || '<div class="vazio">Nenhuma fila nesta área.</div>';
    if (estadoFilas.aberta && $('#fProcs')) carregarProcsFila(estadoFilas.aberta);
  }

  async function procsDasFilas(filas) {
    const falta = filas.filter((f) => !estadoFilas.cache[f]);
    if (falta.length) {
      const rows = await DB.listarFilaProcessos(falta);
      falta.forEach((f) => { estadoFilas.cache[f] = []; });
      rows.forEach((r) => estadoFilas.cache[r.fila].push(r));
    }
    return filas.flatMap((f) => estadoFilas.cache[f]);
  }
  const dataBR = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

  async function carregarProcsFila(fila) {
    const alvo = $('#fProcs'); if (!alvo) return;
    let rows;
    try { rows = await procsDasFilas([fila]); } catch (e) { rows = []; }
    if (estadoFilas.aberta !== fila || !$('#fProcs')) return;
    if (!rows.length) {
      const n = +alvo.dataset.nproc;
      alvo.innerHTML = n ? `<a class="btn primario" href="#/parados?fila=${encodeURIComponent(fila)}">${ic('relogio')} Ver os ${n} processos parados desta fila</a>`
        : `<p class="dica">A lista de processos desta fila ainda não foi importada.${ehAdmin() ? ' Em Administração › Fluxo e Fila, envie a planilha que tem a coluna <b>Processo</b>.' : ''}</p>`;
      return;
    }
    const acervo = new Map(S.processos.map((p) => [p.numero, p]));
    const m2 = m2Mapa();
    const meus = new Set(S.perfil.sequenciais || []);
    const faixas = [...new Set(rows.map((r) => r.faixa))].sort((a, b) => ordFaixa(a) - ordFaixa(b));
    const seqDe = (n) => { const p = acervo.get(n); return p && p.sequencial != null ? p.sequencial : null; };
    const desenhar = () => {
      const st = estadoFilas, dig = st.busca.replace(/\D/g, ''), t = st.busca.trim().toLowerCase();
      const lista = rows.filter((r) => {
        const sq = seqDe(r.numero);
        if (st.seq === 'meus' && !meus.has(sq)) return false;
        if (st.seq === 'sem' && sq != null) return false;
        if (/^\d$/.test(st.seq) && sq !== +st.seq) return false;
        if (st.faixa && r.faixa !== st.faixa) return false;
        if (t && !((dig && r.numero.replace(/\D/g, '').includes(dig)) || (r.classe + ' ' + r.assunto).toLowerCase().includes(t))) return false;
        return true;
      });
      IMPRESSOES.fila = () => ({
        titulo: fila.replace(/^\d+\s*-\s*/, ''),
        sub: `Fila do SAJ · ${st.seq === 'todos' ? 'todos os sequenciais' : st.seq === 'meus' ? 'meus finais' : st.seq === 'sem' ? 'sem sequencial' : 'final ' + st.seq}${st.faixa ? ' · ' + st.faixa : ''} · mais antigos primeiro`,
        colunas: [{ rot: 'Processo' }, { rot: 'Seq.' }, { rot: 'Tempo na fila' }, { rot: 'Na fila desde' }, { rot: 'Classe · assunto' }],
        linhas: lista.map((r) => { const sq = seqDe(r.numero); return [r.numero, sq != null ? sq : '—', r.faixa || '', dataBR(r.entrada), [r.classe, r.assunto].filter(Boolean).join(' · ') + (m2.has(r.numero) ? ' (Meta 2)' : '')]; })
      });
      $('#fpResumo').innerHTML = `${botaoImprimir('fila')} ${lista.length} de ${rows.length} processo(s) · mais antigos na fila primeiro`;
      $('#fpLista').innerHTML = lista.slice(0, st.limite).map((r) => {
        const sq = seqDe(r.numero), p = acervo.get(r.numero);
        return `<div class="proc" data-n="${esc(r.numero)}">
          <div class="proc-num">${esc(r.numero)}</div>
          <div class="proc-meta">
            <span class="badge" style="background:${COR_FAIXA[r.faixa] || '#556'};color:#0b1020">${esc(r.faixa || '—')}</span>
            <span>na fila desde ${dataBR(r.entrada)}</span>
            <span>Seq. ${sq != null ? sq : '—'}</span>
            ${p && p.local ? `<span>${esc(p.local)}</span>` : ''}
            ${m2.has(r.numero) ? `<span class="badge m2">Meta 2 · ${m2.get(r.numero).ano}</span>` : ''}
          </div>
          ${r.classe ? `<div class="proc-classe">${esc(r.classe)}${r.assunto ? ' · ' + esc(r.assunto) : ''}</div>` : ''}
          <div class="proc-acoes"><button class="btn mini" data-acao="copiar">${ic('copiar')} Copiar</button></div>
        </div>`;
      }).join('') + (lista.length > st.limite ? `<button class="btn secundario largo" data-acao="maisFila">Mostrar mais (${lista.length - st.limite})</button>` : '')
        || '<div class="vazio">Nenhum processo com estes filtros.</div>';
    };
    alvo.innerHTML = `
      <div class="fp-filtros">
        <select id="fpSeq" aria-label="Sequencial">
          <option value="todos">Todos os sequenciais</option>
          ${meus.size ? '<option value="meus">Meus finais</option>' : ''}
          ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<option value="${n}">Final ${n}</option>`).join('')}
          <option value="sem">Sem sequencial</option>
        </select>
        <select id="fpFaixa" aria-label="Tempo na fila"><option value="">Todo o tempo</option>${faixas.map((f) => `<option>${esc(f)}</option>`).join('')}</select>
        <input type="search" id="fpBusca" placeholder="Buscar número ou classe…">
      </div>
      <p class="dica">O sequencial vem do relatório de "sem movimentação"; processos que não estão nele aparecem como "Seq. —".</p>
      <div id="fpResumo" class="resumo-lista"></div>
      <div id="fpLista" class="lista"></div>`;
    $('#fpSeq').value = estadoFilas.seq; $('#fpFaixa').value = estadoFilas.faixa; $('#fpBusca').value = estadoFilas.busca;
    $('#fpSeq').addEventListener('change', (e) => { estadoFilas.seq = e.target.value; estadoFilas.limite = 50; desenhar(); });
    $('#fpFaixa').addEventListener('change', (e) => { estadoFilas.faixa = e.target.value; estadoFilas.limite = 50; desenhar(); });
    $('#fpBusca').addEventListener('input', (e) => { estadoFilas.busca = e.target.value; desenhar(); });
    alvo.addEventListener('click', (e) => {
      if (e.target.closest('[data-acao="maisFila"]')) { estadoFilas.limite += 100; desenhar(); return; }
      if (e.target.closest('[data-acao="copiar"]')) acaoProcesso(e);
    });
    desenhar();
  }

  // ---------- Conferência de audiências ----------
  const RE_DESIGNA = /designa[çc][ãa]o de audi/i, RE_DEPOIS = /(cumprimento de atos para audi|realiza[çc][ãa]o de audi)/i;
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/';
  // Lê a pauta (PDF do SAJ) no próprio aparelho: devolve Map numero -> {data, tipo}. Nada é gravado.
  async function numerosDoPdf(file) {
    const pdfjs = await import(window.__PDFJS || PDFJS + 'pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = window.__PDFJS_WORKER || PDFJS + 'pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const achados = new Map();
    const RE = new RegExp('(\\d{2}/\\d{2}/\\d{2,4})\\s+(\\d{2}:\\d{2})\\s*:\\s*([^:]*?)\\s+Processo|(' + Parser.RE_CNJ.source + ')', 'g');
    let atual = null;
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const t = (await pg.getTextContent()).items.map((x) => x.str).join(' ').replace(/\s+/g, ' ');
      let m;
      RE.lastIndex = 0;
      while ((m = RE.exec(t))) {
        if (m[1]) atual = { data: m[1] + ' ' + m[2], tipo: m[3].trim().slice(0, 60) };
        else { const n = m[4].slice(0, 25); if (!achados.has(n)) achados.set(n, atual || { data: '', tipo: '' }); }
      }
    }
    return achados;
  }
  async function montarConferenciaAudiencia() {
    const alvo = $('#fAudiencia'); if (!alvo || !S.filas) return;
    const nomes = [...new Set(S.filas.itens.map((x) => x.fila))];
    const fD = nomes.filter((n) => RE_DESIGNA.test(n)), fO = nomes.filter((n) => RE_DEPOIS.test(n));
    if (!fD.length) return;
    let rows = [];
    try { rows = await procsDasFilas([...fD, ...fO]); } catch (e) { /* sem dados */ }
    if (!$('#fAudiencia')) return;
    if (!rows.length) {
      alvo.innerHTML = `<div class="cartao aud"><h3>${ic('balanca')} Conferência de audiências</h3><p class="dica">Para comparar as filas de audiência, o administrador precisa importar a planilha do Fluxo e Fila com a coluna <b>Processo</b>.</p></div>`;
      return;
    }
    const desig = new Map(), depois = new Map();
    rows.forEach((r) => {
      if (fD.includes(r.fila)) desig.set(r.numero, r);
      else (depois.get(r.numero) || depois.set(r.numero, []).get(r.numero)).push(r);
    });
    const dupl = [...desig.keys()].filter((n) => depois.has(n));
    const novaAud = (n) => depois.get(n).every((r) => (r.entrada || '') < (desig.get(n).entrada || ''));
    const limpar = dupl.filter((n) => !novaAud(n)), conferir = dupl.filter(novaAud);
    const nomeCurto = (f) => f.replace(/^\d+\s*-\s*/, '');
    const item = (n, extra) => `<div class="proc" data-n="${esc(n)}">
        <div class="proc-num">${esc(n)}</div>
        <div class="proc-meta"><span class="badge f365">Ag. Designação desde ${dataBR(desig.get(n).entrada)}</span>${extra}</div>
        ${desig.get(n).classe ? `<div class="proc-classe">${esc(desig.get(n).classe)}</div>` : ''}
        <div class="proc-acoes"><button class="btn mini" data-acao="copiar">${ic('copiar')} Copiar</button></div>
      </div>`;
    const outras = (n) => depois.get(n).map((r) => `<span class="badge">${esc(nomeCurto(r.fila))} desde ${dataBR(r.entrada)}</span>`).join('');
    alvo.innerHTML = `
      <div class="cartao aud">
        <div class="cartao-cab"><h3>${ic('balanca')} Conferência de audiências</h3><span class="selo ${limpar.length ? 'alerta' : 'ok'}">${limpar.length ? limpar.length + ' para limpar' : 'Nada para limpar'}</span></div>
        <p class="dica">Quando a audiência é pautada, o processo sai de <b>${esc(nomeCurto(fD[0]))}</b> (${desig.size} processos hoje) e vai para <b>${esc(fO.map(nomeCurto).join(' / ') || 'a fila de atos de audiência')}</b>. O app cruza as duas listas:</p>
        <h4 class="aud-tit">Para limpar <small>(entrou na fila de audiência depois da designação — já foi pautado)</small></h4>
        <div class="lista">${limpar.length ? limpar.map((n) => item(n, outras(n))).join('') : '<div class="vazio">Nenhum processo para limpar. &#127881;</div>'}</div>
        ${conferir.length ? `<details class="aud-conf"><summary>Conferir ${conferir.length} processo(s) <small>(voltaram para designação depois da audiência anterior — pode ser nova audiência a marcar)</small></summary>
          <div class="lista">${conferir.map((n) => item(n, outras(n))).join('')}</div></details>` : ''}
        <div class="aud-pauta">
          <label class="btn secundario largo">${ic('enviar')} Conferir também com a pauta (PDF)<input type="file" accept="application/pdf,.pdf" id="audPdf" hidden></label>
          <p class="dica">O PDF é lido só no seu aparelho: o app pega apenas os números dos processos e não guarda a pauta.</p>
          <div id="audPautaRes"></div>
        </div>
      </div>`;
    alvo.addEventListener('click', (e) => { if (e.target.closest('[data-acao="copiar"]')) acaoProcesso(e); });
    $('#audPdf').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const res = $('#audPautaRes');
      res.innerHTML = '<div class="carregando">Lendo a pauta…</div>';
      try {
        const nums = await numerosDoPdf(f);
        const naPauta = [...desig.keys()].filter((n) => nums.has(n));
        res.innerHTML = `<p class="resumo-meta">Encontrei <b>${nums.size}</b> processo(s) na pauta. <b>${naPauta.length}</b> deles ainda estão em Ag. Designação de Audiência — a audiência já está marcada, então podem sair dessa fila.</p>
          <div class="lista">${naPauta.map((n) => { const a = nums.get(n); return item(n, `<span class="badge ok">Pauta: ${esc(a.data || 'marcada')}${a.tipo ? ' · ' + esc(a.tipo) : ''}</span>`); }).join('')}</div>
          <div id="audFora"></div>`;
        const fora = [...nums.keys()].filter((n) => !desig.has(n) && !depois.has(n));
        if (fora.length) {
          const onde = new Map();
          (await DB.filasDosNumeros(fora)).forEach((r) => (onde.get(r.numero) || onde.set(r.numero, []).get(r.numero)).push(r));
          const pauta = (n) => { const a = nums.get(n); return `<span class="badge ok">Pauta: ${esc(a.data || 'marcada')}${a.tipo ? ' · ' + esc(a.tipo) : ''}</span>`; };
          $('#audFora').innerHTML = `<details class="aud-conf" open><summary>${fora.length} processo(s) da pauta fora das filas de audiência <small>(audiência marcada, mas o processo não está em "Ag. Cumprimento de Atos para Audiência" — confira se as intimações foram feitas)</small></summary>
            <div class="lista">${fora.map((n) => `<div class="proc" data-n="${esc(n)}">
              <div class="proc-num">${esc(n)}</div>
              <div class="proc-meta">${pauta(n)}${(onde.get(n) || []).map((r) => `<span class="badge">${esc(nomeCurto(r.fila))}</span>`).join('') || '<span class="badge f120">Não aparece em nenhuma fila</span>'}</div>
              <div class="proc-acoes"><button class="btn mini" data-acao="copiar">${ic('copiar')} Copiar</button></div>
            </div>`).join('')}</div></details>`;
        }
      } catch (err) {
        res.innerHTML = `<p class="alerta-txt">Não consegui ler este PDF (${esc(err.message)}). Se a pauta for uma imagem escaneada, o app não consegue extrair os números.</p>`;
      }
    });
  }

  // ======================= IMPORTAÇÃO (cartões de arquivo) =======================
  const TIPO_ESPERADO = { parados: 'parados', filas: 'filas', iad: 'iad', baixados: 'lista', entradas: 'lista' };
  const NOME_TIPO = { filasproc: 'Fluxo e Fila (processos por fila)', parados: 'Processos sem movimentação', filas: 'Fluxo e Fila', iad: 'IAD (Casos Novos e Baixados)', lista: 'lista de processos do mês (Baixados ou Casos Novos)' };
  function slotHTML(tipo, num, titulo, desc, info) {
    return `
      <div class="slot" data-tipo="${tipo}">
        <div class="slot-num">${num}</div>
        <div class="slot-txt"><b>${titulo}</b><small>${desc}</small>${info ? `<small class="ok-txt">${info}</small>` : ''}</div>
        <label class="btn secundario slot-btn">${ic('enviar')} Escolher<input type="file" accept=".xlsx,.xls,.csv" data-tipo="${tipo}"${tipo === 'metacnj' ? ' multiple' : ''} hidden></label>
      </div>
      <div class="slot-previa" id="prev-${tipo}"></div>`;
  }
  function ligarSlots(depois) {
    $$('input[type=file][data-tipo]').forEach((inp) => inp.addEventListener('change', async (e) => {
      const arqs = [...e.target.files]; const f = arqs[0]; const tipo = e.target.dataset.tipo; e.target.value = '';
      if (!f) return;
      const alvo = $('#prev-' + tipo);
      alvo.innerHTML = '<div class="carregando">Lendo planilha…</div>';
      try {
        if (tipo === 'metacnj') return previaMetaCNJ(arqs, alvo, depois);
        const qual = await Parser.identificar(f);
        if (tipo === 'filas' && qual === 'filasproc') return previaFilasProc(f, alvo, depois);
        if (qual !== TIPO_ESPERADO[tipo]) {
          alvo.innerHTML = `<p class="alerta-txt">${qual ? `Este arquivo parece ser <b>${NOME_TIPO[qual]}</b>, não "${esc(tipo)}". Use o cartão certo.` : 'Não reconheci esta planilha. Envie o arquivo .xlsx como veio do SAJ Insights.'}</p>`;
          return;
        }
        if (tipo === 'parados') return previaParados(f, alvo, depois);
        if (tipo === 'filas') return previaFilas(f, alvo, depois);
        if (tipo === 'iad') return previaIAD(f, alvo, depois);
        return previaLista(f, tipo, alvo, depois);
      } catch (err) { alvo.innerHTML = `<p class="alerta-txt">${esc(err.message)}</p>`; }
    }));
  }
  async function previaMetaCNJ(arqs, alvo, depois) {
    const ant = S.meta2 || { resumo: {}, pendentes: [] };
    const resumo = { unicas: { ...(ant.resumo.unicas || {}) }, mensais: { ...(ant.resumo.mensais || {}) }, nomes: { ...(ant.resumo.nomes || {}) } };
    let pendentes = ant.pendentes || [], referencia = ant.referencia || null;
    const lidos = [];
    for (const f of arqs) {
      const r = await Parser.lerMetaCNJ(f);
      if (r.meta && r.meta !== 2) throw new Error(`"${f.name}" é da Meta ${r.meta}. Por enquanto o app acompanha a Meta 2 — exporte o painel com o filtro Meta = 2.`);
      if (Object.keys(r.unicas).length) resumo.unicas = r.unicas;
      Object.assign(resumo.mensais, r.mensais); Object.assign(resumo.nomes, r.nomes);
      if (r.pendentes && (!referencia || r.referencia >= referencia)) { pendentes = r.pendentes; referencia = r.referencia; }
      lidos.push(`${esc(f.name)}: ${r.tipo === 'unicas' ? 'Perguntas Únicas' : 'Perguntas Mensais (' + Object.keys(r.mensais).map((m) => m.split('-').reverse().join('/')).join(', ') + ')'}`);
    }
    const reg = { meta: 2, referencia, resumo, pendentes };
    const c = calcMeta2(reg);
    alvo.innerHTML = `
      <div class="previa">
        <div>${lidos.join('<br>')}</div>
        <div>Universo: <b>${c.universo}</b> · Julgados: <b>${c.julgados}</b> · Alvo 80%: <b>${c.alvo}</b> · Cumprimento: <b>${c.pct.toFixed(2).replace('.', ',')}%</b></div>
        <div>Pendentes (saldo): <b>${pendentes.length}</b>${referencia ? ` · ref. ${esc(referencia.split('-').reverse().join('/'))}` : ''}</div>
        ${!Object.keys(resumo.unicas).length ? '<div class="alerta-txt">Falta a planilha "Perguntas Únicas" (P2.1 e P2.25) para calcular o percentual.</div>' : ''}
        <button class="btn primario">${ic('check')} Gravar Meta 2</button>
      </div>`;
    $('.btn.primario', alvo).addEventListener('click', (ev) => UI.ocupado(ev.currentTarget, async () => {
      await DB.salvarMetaCNJ(reg);
      UI.toast('Meta 2 atualizada.', 'ok'); depois();
    }));
  }
  async function previaParados(f, alvo, depois) {
    const res = await Parser.lerParados(f);
    const r = res.resumo;
    const faixas = Object.keys(r.porFaixa).map(Number).sort((a, b) => b - a);
    const ant = S.importacoes[0];
    alvo.innerHTML = `
      <div class="previa">
        <div><b>${r.total}</b> processos sem movimentação${r.referencia ? ` (ref. ${esc(r.referencia.split('-').reverse().join('/'))})` : ''}${ant ? ` · relatório anterior: ${ant.total}` : ''}</div>
        <div class="mini-faixas">${faixas.map((x) => `<span class="badge ${classeFaixa(x)}">${rotuloFaixa(x)}: ${r.porFaixa[x]}</span>`).join('')}</div>
        <div>Cartório: <b>${r.porLocal['Cartório'] || 0}</b> · Gabinete: <b>${r.porLocal['Gabinete'] || 0}</b> · Sem local: <b>${r.porLocal[''] || 0}</b></div>
        <div>Com fila do SAJ: <b>${r.comFila || 0}</b></div>
        ${r.semSequencial ? `<div class="alerta-txt">${r.semSequencial} sem sequencial no SAJ — aparecem para quem marcar "Sem sequencial" nos filtros.</div>` : ''}
        ${r.ignoradosSegredo ? `<div>${r.ignoradosSegredo} ignorado(s) por segredo de justiça</div>` : ''}
        <button class="btn primario">${ic('check')} Substituir base atual por esta</button>
      </div>`;
    $('.btn.primario', alvo).addEventListener('click', (ev) => UI.ocupado(ev.currentTarget, async () => {
      const n = await DB.substituirAcervo(res.itens, r);
      UI.toast(`Base atualizada: ${n} processos.`, 'ok'); depois();
    }));
  }
  async function previaFilasProc(f, alvo, depois) {
    const r = await Parser.lerFilaProc(f);
    const porFila = {};
    for (const x of r.itens) porFila[x.fila] = (porFila[x.fila] || 0) + 1;
    const top = Object.entries(porFila).sort((a, b) => b[1] - a[1]).slice(0, 5);
    alvo.innerHTML = `
      <div class="previa">
        <div><b>${r.total.toLocaleString('pt-BR')}</b> registros de <b>${r.processos.toLocaleString('pt-BR')}</b> processos em <b>${Object.keys(porFila).length}</b> filas${r.referencia ? ` (ref. ${esc(r.referencia.split('-').reverse().join('/'))})` : ''}</div>
        <div class="dica">Maiores filas: ${top.map(([k, v]) => `${esc(k)} (${v})`).join(' · ')}</div>
        <div class="dica">Um processo pode estar em mais de uma fila ao mesmo tempo. Ao gravar, cada fila passa a mostrar a lista dos seus processos.</div>
        <button class="btn primario">${ic('check')} Gravar filas e processos</button>
      </div>`;
    $('.btn.primario', alvo).addEventListener('click', (ev) => UI.ocupado(ev.currentTarget, async () => {
      const bt = ev.currentTarget;
      await DB.salvarFilasProcessos(r.itens, r.agregado, r.total, r.referencia, (k, n) => { bt.lastChild.textContent = ` Gravando ${k}/${n}…`; });
      estadoFilas.cache = {};
      UI.toast('Filas e processos atualizados.', 'ok'); depois();
    }));
  }
  async function previaFilas(f, alvo, depois) {
    const r = await Parser.lerFilas(f);
    const porFila = {};
    for (const x of r.itens) porFila[x.fila] = (porFila[x.fila] || 0) + x.qtd;
    const top = Object.entries(porFila).sort((a, b) => b[1] - a[1]).slice(0, 5);
    alvo.innerHTML = `
      <div class="previa">
        <div><b>${r.total.toLocaleString('pt-BR')}</b> processos em <b>${Object.keys(porFila).length}</b> filas${r.referencia ? ` (ref. ${esc(r.referencia.split('-').reverse().join('/'))})` : ''}</div>
        <div class="dica">Maiores filas: ${top.map(([k, v]) => `${esc(k)} (${v})`).join(' · ')}</div>
        <button class="btn primario">${ic('check')} Gravar filas</button>
      </div>`;
    $('.btn.primario', alvo).addEventListener('click', (ev) => UI.ocupado(ev.currentTarget, async () => {
      await DB.salvarFilas(r.itens, r.total, r.referencia);
      UI.toast('Filas atualizadas.', 'ok'); depois();
    }));
  }
  async function previaIAD(f, alvo, depois) {
    const r = await Parser.lerIAD(f);
    const meses = Object.keys(r.meses).sort();
    alvo.innerHTML = `
      <div class="previa">
        ${meses.map((m) => { const v = r.meses[m]; const iad = v.entradas ? (v.arquivados / v.entradas) : 0;
          return `<div class="linha"><span>${esc(nomeMes(m))}: <b>${v.entradas}</b> casos novos · <b>${v.arquivados}</b> baixados · IAD <b>${iad.toFixed(2).replace('.', ',')}</b></span>
          <button class="btn mini ok" data-mes="${m}">${ic('check')} Gravar</button></div>`; }).join('')}
        <p class="dica">Preenche Entradas (casos novos) e Baixados do mês de uma vez.</p>
      </div>`;
    $$('[data-mes]', alvo).forEach((b) => b.addEventListener('click', (ev) => UI.ocupado(ev.currentTarget, async () => {
      const v = r.meses[b.dataset.mes];
      await DB.salvarMeta(b.dataset.mes, Math.round(v.entradas), Math.round(v.arquivados));
      UI.toast(`Casos novos e baixados de ${nomeMes(b.dataset.mes)} gravados.`, 'ok'); depois();
    })));
  }
  async function previaLista(f, tipo, alvo, depois) {
    const r = await Parser.lerListaMes(f);
    const campo = tipo === 'baixados' ? 'arquivados' : 'entradas';
    const rot = tipo === 'baixados' ? 'Baixados' : 'Casos Novos';
    const meses = Object.keys(r.meses).sort();
    alvo.innerHTML = `
      <div class="previa">
        ${meses.map((m) => `<div class="linha"><span>${esc(nomeMes(m))}: <b>${r.meses[m]}</b> ${rot.toLowerCase()}</span>
          <button class="btn mini ok" data-mes="${m}">${ic('check')} Gravar como ${rot}</button></div>`).join('')}
        <p class="dica">Conta cada número de processo uma única vez.</p>
      </div>`;
    $$('[data-mes]', alvo).forEach((b) => b.addEventListener('click', (ev) => UI.ocupado(ev.currentTarget, async () => {
      await DB.salvarMetaCampo(b.dataset.mes, campo, r.meses[b.dataset.mes]);
      UI.toast(`${rot} de ${nomeMes(b.dataset.mes)} gravados.`, 'ok'); depois();
    })));
  }

  // ======================= 4. GABINETE E COMANDOS =======================
  const estadoGab = { faixa: null, filtroCmd: 'aberto' };
  async function telaGabinete() {
    UI.topo('Gabinete e Comandos', 'Conclusos e determinações', true);
    UI.render('<div class="carregando">Carregando…</div>');
    await carregar('processos', 'cumpridos', 'comandos', 'usuarios', 'meta2');
    const aprovados = S.usuarios.filter((u) => u.status === 'aprovado');
    const n = consultaHash().get('n') || '';

    UI.render(`
      <section>
        ${UI.ajuda('gabinete', 'Como usar o Gabinete', [
          'Toque numa <b>faixa de dias</b> para ver os processos conclusos há mais tempo.',
          'Em <b>Comandos</b> ficam as determinações abertas, das mais urgentes (Réu Preso, Medida Protetiva) para as demais.',
          'Quem cumprir toca em <b>✓ Cumprido</b> — todos veem que foi feito.',
          'Gabinete e Híbrido: registre novos comandos no formulário no fim da tela.'
        ])}
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('balanca')} Conclusos no Gabinete</h3><span class="selo">${S.processos.filter((p) => p.local === 'Gabinete').length} no total</span></div>
          <div class="faixas" id="gFaixas"></div>
          <div id="gLista" class="lista"></div>
        </div>

        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('lista')} Comandos</h3></div>
          <div class="abas" id="gAbas">
            ${[['aberto', 'Abertos'], ['cumprido', 'Cumpridos'], ['todos', 'Todos']].map(([v, t]) =>
              `<button class="aba${estadoGab.filtroCmd === v ? ' on' : ''}" data-v="${v}">${t}</button>`).join('')}
          </div>
          <div id="gCmds" class="lista"></div>
        </div>

        ${podeGabinete() ? `
        <form class="cartao" id="fCmd">
          <h3>${ic('enviar')} Novo comando</h3>
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
      estadoGab.faixa = b.dataset.f === '' ? null : b.dataset.f === 'm2' ? 'm2' : parseInt(b.dataset.f, 10); desenharConclusos();
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
    const m2 = m2Mapa(), baseM2 = base.filter((p) => m2.has(p.numero));
    $('#gFaixas').innerHTML = (S.meta2 ? `<button class="faixa m2${estadoGab.faixa === 'm2' ? ' on' : ''}" data-f="m2"><b>${baseM2.length}</b><small>Meta 2</small></button>` : '') + faixas.map((f) =>
      `<button class="faixa ${classeFaixa(f)}${estadoGab.faixa === f ? ' on' : ''}" data-f="${f}"><b>${cont[f] || 0}</b><small>${rotuloFaixa(f)}</small></button>`).join('');
    if (estadoGab.faixa == null) { $('#gLista').innerHTML = `<p class="dica">Toque numa faixa para ver os processos conclusos há mais tempo.${S.meta2 ? ' <b>Meta 2</b> = processos antigos que contam para a meta do CNJ — priorize a sentença.' : ''}</p>`; return; }
    const cumpridos = new Map(S.cumpridos.map((c) => [c.numero, c]));
    const lista = estadoGab.faixa === 'm2' ? baseM2.sort((a, b) => m2.get(a.numero).ano - m2.get(b.numero).ano) : base.filter((p) => p.faixa === estadoGab.faixa);
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
          ${c.status === 'aberto' ? `<button class="btn mini ok" data-acao="concluir">${ic('check')} Cumprido</button>` : '<button class="btn mini" data-acao="reabrir">Reabrir</button>'}
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
        ${UI.ajuda('repasses', 'Como repassar uma diligência', [
          'Digite o <b>número do processo</b> e escolha a diligência (ex.: SISBAJUD).',
          'Escolha o <b>colega habilitado</b> e toque em <b>Enviar repasse</b>.',
          'Quem recebe vê em <b>Para mim</b> e marca <b>Cumprido</b> ou <b>Devolve</b> com o motivo.'
        ])}
        <form class="cartao" id="fRep">
          <h3>${ic('setas')} Novo repasse</h3>
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
          ${r.status === 'pendente' && r.destinatario_id === eu ? `<button class="btn mini ok" data-acao="cumprido">${ic('check')} Cumprido</button><button class="btn mini" data-acao="devolver">Devolver</button>` : ''}
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
  async function telaAdmin() {
    if (!ehAdmin()) { location.hash = '#/'; return; }
    UI.topo('Administração', 'Perfis, base e QR Code', true);
    UI.render('<div class="carregando">Carregando…</div>');
    await carregar('usuarios', 'importacoes', 'filas', 'meta', 'meta2');
    const pend = S.usuarios.filter((u) => u.status === 'pendente');
    const equipe = S.usuarios.filter((u) => u.status !== 'pendente');
    // Sempre o endereço oficial (se o app for aberto pelo arquivo do PC, o QR não aponta para o computador)
    const url = cfg.APP_URL || (location.origin + location.pathname);

    UI.render(`
      <section>
        ${UI.ajuda('admin', 'O que fazer aqui', [
          'Confira os <b>cadastros pendentes</b>: ajuste setor e sequenciais e toque em <b>Aprovar</b>.',
          'Em <b>Atualizar dados do SAJ Insights</b>, envie cada relatório no seu cartão (1, 2 e 3 bastam). Confira o resumo antes de gravar.',
          'Mostre ou imprima o <b>QR Code</b> para os colegas instalarem o app.'
        ])}
        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('pessoa')} Cadastros pendentes</h3><span class="selo ${pend.length ? 'alerta' : ''}">${pend.length}</span></div>
          ${pend.length ? pend.map((u) => editorUsuario(u)).join('') : '<p class="dica">Nenhum cadastro aguardando.</p>'}
        </div>

        <div class="cartao">
          <h3>${ic('enviar')} Atualizar dados do SAJ Insights</h3>
          <p class="dica">Envie cada relatório do jeito que sai do SAJ Insights (.xlsx). O arquivo é lido aqui no aparelho; nomes de partes e demais colunas não vão para o banco.</p>
          <div class="slots">
            ${slotHTML('parados', '1', 'Processos sem movimentação', 'Lista com Faixa de Dias, Processo, Fila, Cartório/Gabinete e Sequencial.',
              S.importacoes[0] ? `Última: ${UI.dataHora(S.importacoes[0].criado_em)} · ${S.importacoes[0].total} processos` : '')}
            ${slotHTML('filas', '2', 'Fluxo e Fila', 'Use a planilha com a coluna <b>Processo</b> (data.xlsx do Fluxo e Fila): mostra os processos de cada fila. O resumo só com quantidades também é aceito.',
              S.filas ? `Última: ${UI.dataHora(S.filas.criado_em)} · ${S.filas.total} processos` : '')}
            ${slotHTML('iad', '3', 'IAD, Casos Novos e Baixados', 'Preenche de uma vez as Entradas (casos novos) e os Baixados da meta.',
              S.meta ? `Mês atual: ${S.meta.entradas} casos novos · ${S.meta.arquivados} baixados` : '')}
            ${slotHTML('metacnj', '6', 'Metas CNJ · Meta 2', 'Painel "(PG) Metas CNJ": Perguntas Únicas e Perguntas Mensais (escolha os 2 arquivos juntos).', S.meta2 ? 'Última: ref. ' + esc((S.meta2.referencia || '').split('-').reverse().join('/')) + ' · ' + UI.dataHora(S.meta2.criado_em) : '')}
            ${slotHTML('baixados', '4', 'Baixados (lista)', 'Opcional, se não tiver a planilha IAD: conta os baixados.', '')}
            ${slotHTML('entradas', '5', 'Casos Novos (lista)', 'Opcional, se não tiver a planilha IAD: conta as entradas.', '')}
          </div>
        </div>

        <div class="cartao">
          <div class="cartao-cab"><h3>${ic('lista')} Equipe</h3><span class="selo">${equipe.length}</span></div>
          ${equipe.map((u) => editorUsuario(u)).join('') || '<p class="dica">Ninguém ainda.</p>'}
        </div>

        <div class="cartao centro" id="cartaoQR">
          <h3 class="centro">${ic('qr')} QR Code de acesso</h3>
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
      $('#qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 24, scalable: true });
    } catch (_) { $('#qr').textContent = 'Biblioteca de QR Code não carregou.'; }
    $('#aCopiarUrl').addEventListener('click', () => UI.copiar(url));
    $('#aImprimir').addEventListener('click', () => { document.body.classList.remove('imprimindo', 'imprimindo-doc', 'imprimindo-lista'); document.body.classList.add('imprimindo-qr'); window.print(); setTimeout(() => document.body.classList.remove('imprimindo-qr'), 500); });

    // Usuários
    $('#app > section').addEventListener('click', acaoUsuario);

    // Importação
    ligarSlots(() => telaAdmin());

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
          ${u.status === 'pendente' ? `<button class="btn mini ok" data-uacao="aprovar">${ic('check')} Aprovar</button><button class="btn mini perigo" data-uacao="recusar">Recusar</button>`
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
          <h3>${ic('cadeado')} Trocar senha</h3>
          <label>Nova senha<input type="password" id="cNova" minlength="6" required autocomplete="new-password"></label>
          <button class="btn secundario" type="submit">Salvar nova senha</button>
        </form>
        <button class="btn perigo largo" id="cSair">${ic('sair')} Sair do aplicativo</button>
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

  // Transição entre telas: avança deslizando da direita, volta deslizando da esquerda
  const ORDEM_TELAS = ['/', '/atendimentos', '/parados', '/filas', '/tarefas', '/meta', '/meta2', '/gabinete', '/repasses', '/admin', '/conta'];
  let rotaAtual = null;
  function transicao(rota) {
    const app = document.getElementById('app');
    const de = ORDEM_TELAS.indexOf(rotaAtual), para = ORDEM_TELAS.indexOf(rota);
    const mudou = rotaAtual !== null && rota !== rotaAtual;
    rotaAtual = rota;
    if (!mudou) return;
    app.classList.remove('vai-frente', 'vai-tras');
    void app.offsetWidth; // reinicia a animação
    app.classList.add(para >= de ? 'vai-frente' : 'vai-tras');
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

    UI.nav(rota === '/meta2' ? '/meta' : ['/', '/parados', '/filas', '/meta', '/gabinete', '/repasses'].includes(rota) ? rota : '');
    transicao(rota);
    const telas = {
      '/': telaInicio, '/parados': telaParados, '/filas': telaFilas, '/meta2': telaMeta2, '/meta': telaMeta, '/gabinete': telaGabinete,
      '/repasses': telaRepasses, '/admin': telaAdmin, '/conta': telaConta, '/tarefas': telaTarefas, '/atendimentos': telaAtendimentos
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
