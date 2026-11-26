// ============================================================
// Utilitários de tela + telas de acesso (login, cadastro,
// aguardando aprovação, nova senha)
// ============================================================
(function () {
  const cfg = window.METAJUS_CONFIG;

  // ---------------- Ícones (SVG simples, herdam a cor do texto) ----------------
  const P = {
    casa: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    balanca: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 006 0L5 7zM19 7l-3 7a3 3 0 006 0l-3-7z"/>',
    setas: '<path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
    sair: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
    voltar: '<path d="M15 18l-6-6 6-6"/>',
    copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
    check: '<path d="M5 13l4 4L19 7"/>',
    ajuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01"/>',
    enviar: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v7M14 20h3"/>',
    sino: '<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/>',
    ampulheta: '<path d="M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10s10 4 10 10"/>',
    bloqueio: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    prancheta: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11.5l2 2 4-4M9 17h6"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    imprimir: '<path d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>'
  };
  const ic = (nome) => `<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[nome] || ''}</svg></span>`;

  // ---------------- Utilitários compartilhados ----------------
  const UI = {
    ic,
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    $(sel, raiz) { return (raiz || document).querySelector(sel); },
    $$(sel, raiz) { return [...(raiz || document).querySelectorAll(sel)]; },
    render(html) {
      const app = document.getElementById('app');
      app.innerHTML = html;
      window.scrollTo(0, 0);
      return app;
    },
    toast(msg, tipo) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast visivel ' + (tipo || '');
      clearTimeout(UI._tt);
      UI._tt = setTimeout(() => { t.className = 'toast'; }, 3200);
    },
    topo(titulo, sub, comVoltar) {
      document.getElementById('topo').classList.remove('oculto');
      document.getElementById('topoTitulo').textContent = titulo;
      document.getElementById('topoSub').textContent = sub || '';
      document.getElementById('btnVoltar').classList.toggle('oculto', !comVoltar);
      document.getElementById('topoLogo').classList.toggle('oculto', !!comVoltar);
    },
    semTopo() {
      document.getElementById('topo').classList.add('oculto');
      UI.nav(null);
    },
    // Barra inferior: rota ativa, ou null para esconder
    nav(rota) {
      const n = document.getElementById('navBaixo');
      n.classList.toggle('oculto', rota == null);
      document.body.classList.toggle('com-nav', rota != null);
      UI.$$('.nav-item', n).forEach((a) => a.classList.toggle('on', a.dataset.rota === rota));
    },
    // Caixa "Como usar": aberta até a pessoa tocar em "Entendi"
    ajuda(chave, titulo, passos) {
      let visto = false;
      try { visto = localStorage.getItem('mj_ajuda_' + chave) === '1'; } catch (_) {}
      return `<details class="ajuda" data-chave="${chave}"${visto ? '' : ' open'}>
        <summary>${ic('ajuda')} ${UI.esc(titulo)}</summary>
        <ol>${passos.map((p) => `<li>${p}</li>`).join('')}</ol>
        <button type="button" class="btn secundario" data-entendi>${ic('check')} Entendi</button>
      </details>`;
    },
    listaSeq(seqs) {
      const v = (seqs || []).slice().sort((a, b) => a - b);
      if (!v.length) return 'nenhum';
      if (v.length === 1) return String(v[0]);
      return v.slice(0, -1).join(', ') + ' e ' + v[v.length - 1];
    },
    chipsSeq(selecionados, id) {
      const sel = new Set(selecionados || []);
      let h = `<div class="chips-seq" id="${id}">`;
      for (let i = 0; i <= 9; i++) {
        h += `<button type="button" class="chip${sel.has(i) ? ' on' : ''}" data-v="${i}">${i}</button>`;
      }
      return h + '</div>';
    },
    lerChipsSeq(el) { return UI.$$('.chip.on', el).map((b) => parseInt(b.dataset.v, 10)); },
    checksEsp(selecionadas, nome) {
      const sel = new Set(selecionadas || []);
      return '<div class="checks">' + cfg.ESPECIALIDADES.map((e) =>
        `<label class="check"><input type="checkbox" name="${nome}" value="${UI.esc(e)}"${sel.has(e) ? ' checked' : ''}> ${UI.esc(e)}</label>`
      ).join('') + '</div>';
    },
    lerChecks(nome, raiz) { return UI.$$(`input[name="${nome}"]:checked`, raiz).map((i) => i.value); },
    selectSetor(atual, id) {
      return `<select id="${id}">` + ['Cartório', 'Gabinete', 'Híbrido'].map((s) =>
        `<option${s === atual ? ' selected' : ''}>${s}</option>`).join('') + '</select>';
    },
    async ocupado(botao, fn) {
      const txt = botao.textContent;
      botao.disabled = true; botao.textContent = 'Aguarde…';
      try { return await fn(); }
      catch (e) { UI.toast(e.message || String(e), 'erro'); }
      finally { botao.disabled = false; botao.textContent = txt; }
    },
    dataHora(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    },
    async copiar(texto, msg) {
      try { await navigator.clipboard.writeText(texto); }
      catch (_) {
        const ta = document.createElement('textarea');
        ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      UI.toast(msg || 'Copiado: ' + texto, 'ok');
    }
  };
  // Efeito de toque: onda saindo do ponto onde o dedo encostou + vibração curta
  document.addEventListener('pointerdown', (e) => {
    const alvo = e.target.closest('.btn, .modulo, .faixa, .chip, .aba, .nav-item, .topo-btn, .aviso');
    if (!alvo || alvo.disabled) return;
    const r = alvo.getBoundingClientRect();
    const tam = Math.max(r.width, r.height);
    const o = document.createElement('span');
    o.className = 'onda';
    o.style.width = o.style.height = tam + 'px';
    o.style.left = (e.clientX - r.left - tam / 2) + 'px';
    o.style.top = (e.clientY - r.top - tam / 2) + 'px';
    alvo.appendChild(o);
    setTimeout(() => o.remove(), 600);
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
  });
  // Botão "Entendi" das caixas de ajuda
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-entendi]'); if (!b) return;
    const d = b.closest('.ajuda');
    try { localStorage.setItem('mj_ajuda_' + d.dataset.chave, '1'); } catch (_) {}
    d.open = false;
  });
  // Coloca os ícones fixos da página (topo e barra inferior)
  document.querySelectorAll('[data-ic]').forEach((el) => { el.outerHTML = ic(el.dataset.ic); });
  document.getElementById('btnVoltar').innerHTML = ic('voltar');
  document.getElementById('btnSair').innerHTML = ic('sair');

  // ---------------- Instalação no celular ----------------
  // Android/Chrome: o navegador avisa que o app pode ser instalado; guardamos o aviso
  // para disparar quando a pessoa tocar no botão "Instalar".
  let pedidoInstalar = null;
  const jaInstalado = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const ehIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); pedidoInstalar = e; UI.atualizarInstalar();
  });
  window.addEventListener('appinstalled', () => { pedidoInstalar = null; UI.toast('App instalado! Procure o ícone MetaJus.', 'ok'); UI.atualizarInstalar(); });
  UI.blocoInstalar = () => '<div id="instalar"></div>';
  UI.atualizarInstalar = () => {
    const el = document.getElementById('instalar'); if (!el) return;
    if (jaInstalado()) { el.innerHTML = ''; return; }
    if (ehIphone()) {
      el.innerHTML = `<div class="cartao instalar">
        <h3>${ic('enviar')} Instalar no iPhone</h3>
        <ol class="passos">
          <li>Abra este link no <b>Safari</b>.</li>
          <li>Toque no botão <b>Compartilhar</b> (quadrado com seta para cima, na barra de baixo).</li>
          <li>Toque em <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.</li>
        </ol>
        <p class="dica">O ícone do MetaJus vai aparecer junto com seus apps.</p></div>`;
      return;
    }
    el.innerHTML = `<div class="cartao instalar">
      <h3>${ic('enviar')} Instale o app no seu celular</h3>
      ${pedidoInstalar
        ? `<button type="button" class="btn primario" id="btnInstalar">${ic('enviar')} Instalar o MetaJus</button>
           <p class="dica">Um toque e o app fica na sua tela inicial, como qualquer outro aplicativo.</p>`
        : `<p class="dica">No Chrome do Android: toque nos <b>três pontinhos ⋮</b> (canto de cima) e em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p>`}
    </div>`;
    const b = document.getElementById('btnInstalar');
    if (b) b.addEventListener('click', async () => {
      if (!pedidoInstalar) return;
      pedidoInstalar.prompt();
      try { await pedidoInstalar.userChoice; } catch (_) {}
      pedidoInstalar = null; UI.atualizarInstalar();
    });
  };

  // Liga/desliga os botões de sequencial em qualquer tela
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.chips-seq .chip');
    if (b && !b.closest('.chips-seq').classList.contains('so-leitura')) b.classList.toggle('on');
  });
  window.UI = UI;

  // ---------------- Telas de acesso ----------------
  const marca = `
    <div class="marca">
      <img src="icons/icon-192.png" alt="" width="64" height="64">
      <h1>MetaJus</h1>
      <p>${UI.esc(cfg.NOME_UNIDADE)}</p>
    </div>`;

  function telaLogin() {
    UI.semTopo();
    UI.render(`
      <section class="acesso">
        ${marca}
        <form id="fLogin" class="cartao">
          <h2>Entrar</h2>
          <label>E-mail<input type="email" id="lEmail" autocomplete="email" required></label>
          <label>Senha<input type="password" id="lSenha" autocomplete="current-password" required></label>
          <button class="btn primario" type="submit">Entrar</button>
          <button class="btn link" type="button" id="lEsqueci">Esqueci minha senha</button>
        </form>
        <div class="cartao centro">
          <p>Primeiro acesso? Faça seu cadastro e aguarde a aprovação do administrador.</p>
          <a class="btn secundario" href="#/cadastro">Solicitar cadastro</a>
        </div>
        ${UI.blocoInstalar()}
        <p class="rodape-lgpd">Ferramenta interna. Trata apenas número do processo, faixa de dias, localização e sequencial — sem nomes de partes ou dados pessoais (LGPD).</p>
      </section>`);
    UI.atualizarInstalar();
    UI.$('#fLogin').addEventListener('submit', (e) => {
      e.preventDefault();
      const b = e.submitter || UI.$('#fLogin .primario');
      UI.ocupado(b, async () => {
        await DB.entrar(UI.$('#lEmail').value.trim(), UI.$('#lSenha').value);
        location.hash = '#/';
        App.rotear();
      });
    });
    UI.$('#lEsqueci').addEventListener('click', (e) => {
      const email = UI.$('#lEmail').value.trim();
      if (!email) { UI.toast('Digite seu e-mail no campo acima primeiro.'); return; }
      UI.ocupado(e.target, async () => {
        await DB.recuperarSenha(email);
        UI.toast('Enviamos um link para redefinir a senha no seu e-mail.', 'ok');
      });
    });
  }

  function telaCadastro() {
    UI.semTopo();
    UI.render(`
      <section class="acesso">
        ${marca}
        <form id="fCad" class="cartao">
          <h2>Solicitar cadastro</h2>
          <p class="dica">Seu acesso fica <b>pendente</b> até o administrador aprovar.</p>
          <label>Nome<input id="cNome" required maxlength="80" autocomplete="name"></label>
          <label>E-mail (de preferência institucional)<input type="email" id="cEmail" required autocomplete="email"></label>
          <label>Senha (mín. 6 caracteres)<input type="password" id="cSenha" required minlength="6" autocomplete="new-password"></label>
          <label>Setor ${UI.selectSetor('Cartório', 'cSetor')}</label>
          <fieldset><legend>Especialidade / frente</legend>${UI.checksEsp(['Geral'], 'cEsp')}</fieldset>
          <fieldset><legend>Meus sequenciais (finais)</legend>
            ${UI.chipsSeq([], 'cSeq')}
            <p class="dica">Toque nos números finais dos processos que ficam com você (ex.: 1 e 9). Eles ficam azuis quando marcados. Deixe em branco se atua só numa especialidade.</p>
          </fieldset>
          <button class="btn primario" type="submit">Enviar cadastro</button>
          <a class="btn link" href="#/">Já tenho cadastro</a>
        </form>
      </section>`);
    UI.$('#fCad').addEventListener('submit', (e) => {
      e.preventDefault();
      const b = UI.$('#fCad .primario');
      UI.ocupado(b, async () => {
        const r = await DB.cadastrar({
          nome: UI.$('#cNome').value.trim(),
          email: UI.$('#cEmail').value.trim(),
          senha: UI.$('#cSenha').value,
          setor: UI.$('#cSetor').value,
          especialidades: UI.lerChecks('cEsp'),
          sequenciais: UI.lerChipsSeq(UI.$('#cSeq'))
        });
        if (r.precisaConfirmarEmail) {
          UI.render(`<section class="acesso">${marca}
            <div class="cartao centro"><h2>Confirme seu e-mail</h2>
            <p>Enviamos um link de confirmação. Depois de confirmar, entre com seu e-mail e senha — seu cadastro ficará aguardando aprovação do administrador.</p>
            <a class="btn primario" href="#/">Ir para o login</a></div></section>`);
          return;
        }
        location.hash = '#/';
        App.rotear();
      });
    });
  }

  function telaPendente(perfil) {
    UI.semTopo();
    const bloqueado = perfil && perfil.status === 'bloqueado';
    UI.render(`
      <section class="acesso">
        ${marca}
        <div class="cartao centro">
          <div class="icone-grande">${ic(bloqueado ? 'bloqueio' : 'ampulheta')}</div>
          <h2>${bloqueado ? 'Acesso bloqueado' : 'Cadastro aguardando aprovação'}</h2>
          <p>${bloqueado
            ? 'Seu acesso foi suspenso pelo administrador. Procure-o se achar que é um engano.'
            : 'Seu cadastro foi enviado. Assim que o administrador da vara aprovar, os painéis aparecem aqui.'}</p>
          ${perfil ? `<p class="dica">${UI.esc(perfil.nome)} · ${UI.esc(perfil.email)}</p>` : ''}
          <button class="btn primario" id="pAtualizar">Verificar novamente</button>
          <button class="btn link" id="pSair">Sair</button>
        </div>
        ${UI.blocoInstalar()}
      </section>`);
    UI.atualizarInstalar();
    UI.$('#pAtualizar').addEventListener('click', () => App.rotear());
    UI.$('#pSair').addEventListener('click', async () => { await DB.sair(); location.hash = '#/'; App.rotear(); });
  }

  function telaNovaSenha() {
    UI.semTopo();
    UI.render(`
      <section class="acesso">
        ${marca}
        <form id="fNova" class="cartao">
          <h2>Definir nova senha</h2>
          <label>Nova senha<input type="password" id="nSenha" minlength="6" required autocomplete="new-password"></label>
          <button class="btn primario" type="submit">Salvar senha</button>
        </form>
      </section>`);
    UI.$('#fNova').addEventListener('submit', (e) => {
      e.preventDefault();
      UI.ocupado(UI.$('#fNova .primario'), async () => {
        await DB.trocarSenha(UI.$('#nSenha').value);
        App.recuperandoSenha = false;
        history.replaceState(null, '', location.pathname + '#/');
        UI.toast('Senha alterada.', 'ok');
        App.rotear();
      });
    });
  }

  window.Auth = { telaLogin, telaCadastro, telaPendente, telaNovaSenha };
})();
