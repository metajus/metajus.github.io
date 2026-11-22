// ============================================================
// Utilitários de tela + telas de acesso (login, cadastro,
// aguardando aprovação, nova senha)
// ============================================================
(function () {
  const cfg = window.METAJUS_CONFIG;

  // ---------------- Utilitários compartilhados ----------------
  const UI = {
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
    },
    semTopo() { document.getElementById('topo').classList.add('oculto'); },
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
    async copiar(texto) {
      try { await navigator.clipboard.writeText(texto); }
      catch (_) {
        const ta = document.createElement('textarea');
        ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      UI.toast('Copiado: ' + texto, 'ok');
    }
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
          <p>Primeiro acesso?</p>
          <a class="btn secundario" href="#/cadastro">Solicitar cadastro</a>
        </div>
        <p class="rodape-lgpd">Ferramenta interna. Trata apenas número do processo, faixa de dias, localização e sequencial — sem nomes de partes ou dados pessoais (LGPD).</p>
      </section>`);
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
            <p class="dica">Toque nos números sob sua responsabilidade (ex.: 1 e 9). Deixe em branco se atua só numa especialidade.</p>
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
          <div class="icone-grande">${bloqueado ? '&#9940;' : '&#9203;'}</div>
          <h2>${bloqueado ? 'Acesso bloqueado' : 'Cadastro aguardando aprovação'}</h2>
          <p>${bloqueado
            ? 'Seu acesso foi suspenso pelo administrador. Procure-o se achar que é um engano.'
            : 'Seu cadastro foi enviado. Assim que o administrador da vara aprovar, os painéis aparecem aqui.'}</p>
          ${perfil ? `<p class="dica">${UI.esc(perfil.nome)} · ${UI.esc(perfil.email)}</p>` : ''}
          <button class="btn primario" id="pAtualizar">Verificar novamente</button>
          <button class="btn link" id="pSair">Sair</button>
        </div>
      </section>`);
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
