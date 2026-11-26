// =====================================================================
// MetaJus — Impressão
//   Impressao.documento(modelo, dados, assinante, dataISO) -> HTML da folha oficial
//   Impressao.tabela({titulo, sub, colunas, linhas, nota}) -> HTML de lista para papel
//   Impressao.imprimir(html, {titulo, tipo:'doc'|'lista'})
// A folha reproduz a FOLHA_MODELO.docx do Fórum (logo do TJAL, cabeçalho,
// brasão de Santa Luzia do Norte em marca-d'água e rodapé em caixa).
// =====================================================================
(function () {
  'use strict';

  const CAB = {
    l1: 'ESTADO DE ALAGOAS', l2: 'PODER JUDICIÁRIO',
    l3: 'JUÍZO DE DIREITO DA COMARCA DE SANTA LUZIA DO NORTE, ALAGOAS.',
    email: 'santaluzianorte@tjal.jus.br', whats: '(82) 99189-1229', tel: '(82) 4009-3894'
  };
  const ROD = {
    l1: 'CARTÓRIO DO ÚNICO OFÍCIO DE SANTA LUZIA DO NORTE  -  FÓRUM Deoclecio Feitosa',
    l2: 'Rua Imaculada Conceição, s/n, Centro – Santa Luzia do Norte-AL', fone: 'FONE/FAX: (0xx82) 4009-3894'
  };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hojeISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  function dataExtenso(iso) {
    const [a, m, d] = String(iso || hojeISO()).slice(0, 10).split('-').map(Number);
    return `${String(d).padStart(2, '0')} de ${MESES[m - 1]} de ${a}`;
  }
  const dataCurta = (iso) => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';

  // Valor de um campo já pronto para o texto
  function formatar(campo, v) {
    if (v == null || v === '' || v === false) return '';
    if (campo && campo.tipo === 'data') return dataCurta(v);
    if (campo && campo.tipo === 'longo') return esc(v).replace(/\n/g, '<br>');
    return esc(v);
  }

  const cabecalho = () => `
    <div class="fl-cab">
      <img class="fl-logo" src="icons/pj-al-logo.png" alt="">
      <div class="fl-c1">${CAB.l1}</div>
      <div class="fl-c1">${CAB.l2}</div>
      <div class="fl-c2">${CAB.l3}</div>
      <div class="fl-c3"><b>E-mail:</b> ${CAB.email} &nbsp;|&nbsp; WhatsApp/Balcão Virtual: ${CAB.whats} &nbsp;|&nbsp; Tel.: ${CAB.tel}</div>
    </div>`;
  const rodape = () => `
    <div class="fl-rod"><div>${ROD.l1}</div><div>&#128205; ${ROD.l2} &nbsp;&nbsp;&nbsp; &#9742; ${ROD.fone}</div></div>`;

  function assinaturasHTML(lista) {
    return `<div class="fl-ass n${lista.length}">${lista.map((a) => `
      <div class="fl-ass1">${lista.length > 1 ? '<div class="fl-linha"></div>' : ''}
        <div class="fl-nome">${a.nome ? esc(a.nome) : '&nbsp;'}</div><div class="fl-cargo">${esc(a.cargo || '')}</div></div>`).join('')}</div>`;
  }

  // Monta a folha a partir de um modelo de js/modelos.js
  function documento(modelo, dados, assinante, dataISO, opcoes = {}) {
    const d = dados || {};
    const campos = Object.fromEntries((modelo.campos || []).map((c) => [c.id, c]));
    const f = (k) => {
      const v = formatar(campos[k], d[k]);
      if (v) return v;
      const rot = (campos[k] && campos[k].rot || k).replace(/\s*\(.*?\)\s*/g, '').toUpperCase();
      return opcoes.marcador ? opcoes.marcador(rot) : `<mark class="falta">[${esc(rot)}]</mark>`;
    };
    const a = { nome: assinante && assinante.nome || '', cargo: assinante && assinante.cargo || 'Servidor Judiciário' };
    const oficio = modelo.tipoDoc === 'oficio';
    const titulo = modelo.tituloDoc ? modelo.tituloDoc(f, d) : (oficio ? '' : 'CERTIDÃO');
    const pars = (modelo.corpo(f, d, a) || []).filter(Boolean);
    const ass = modelo.assinaturas ? modelo.assinaturas(d, a) : [a];
    const validade = modelo.validade || (modelo.validadeSe && modelo.validadeSe(d));
    const local = `Santa Luzia do Norte/AL, ${dataExtenso(dataISO)}.`;

    let miolo;
    if (oficio) {
      const destino = modelo.destinoTxt ? modelo.destinoTxt(f, d) : f('destino');
      const assunto = modelo.assunto || f('assunto');
      const vocativo = modelo.vocativo || (d.vocativo ? f('vocativo') : '');
      miolo = `
        <div class="fl-of-num">Ofício nº ${f('numero')} – JCSLN</div>
        <div class="fl-of-data">${local}</div>
        <div class="fl-of-dest">${destino}</div>
        <div class="fl-of-ass"><b>Assunto:</b> ${assunto}</div>
        ${vocativo ? `<div class="fl-of-voc">${vocativo}</div>` : ''}
        ${pars.map((p) => `<p class="fl-p">${p}</p>`).join('')}
        <p class="fl-of-at">Atenciosamente,</p>
        ${assinaturasHTML(ass)}`;
    } else {
      miolo = `
        <h1 class="fl-tit">${titulo}</h1>
        ${modelo.subtitulo ? `<div class="fl-sub">${esc(modelo.subtitulo)}</div>` : ''}
        ${pars.map((p) => `<p class="fl-p">${p}</p>`).join('')}
        <p class="fl-data">${local}</p>
        ${assinaturasHTML(ass)}
        ${validade ? `<p class="fl-nota">${esc(MODELOS_INFO.NOTA_VALIDADE)}</p>` : ''}`;
    }
    return `<div class="folha"><img class="fl-marca" src="icons/marca-dagua.jpg" alt="">
      <div class="fl-corpo">${cabecalho()}${miolo}</div>${rodape()}</div>`;
  }

  // Folha timbrada com a cópia do(s) documento(s) fotografado(s) no balcão
  function copiaDocumento(fotos, { documento: nomeDoc, assinante, dataISO } = {}) {
    if (!fotos || !fotos.length) return '';
    // Espaço útil da folha para as fotos: ~140 mm de altura x 150 mm de largura
    const n = fotos.length;
    const empe = fotos.every((f) => f.h > f.w);
    const lado = empe && n === 2;                    // duas fotos em pé: lado a lado
    const hMax = lado ? 135 : n === 1 ? 140 : n === 2 ? 66 : 42;
    const wMax = lado ? 72 : 150;
    const imgs = fotos.map((f) => {
      const larg = Math.min(wMax, hMax * f.w / f.h);
      return `<img class="fl-cp-img" src="${f.src}" style="width:${larg.toFixed(1)}mm" alt="Cópia do documento">`;
    }).join('');
    const a = assinante || {};
    return `<div class="folha fl-copia"><img class="fl-marca" src="icons/marca-dagua.jpg" alt="">
      <div class="fl-corpo">${cabecalho()}
        <h1 class="fl-cp-tit">CÓPIA DE DOCUMENTO</h1>
        <div class="fl-cp-sub">Documento apresentado no balcão de atendimento${nomeDoc ? ` — anexo: ${esc(nomeDoc)}` : ''}</div>
        <div class="fl-cp-fotos${lado ? ' lado' : ''}">${imgs}</div>
        <p class="fl-cp-txt">Cópia extraída do documento original apresentado nesta data.</p>
        <p class="fl-cp-txt">Santa Luzia do Norte/AL, ${dataExtenso(dataISO)}.</p>
        ${a.nome ? `<div class="fl-cp-ass"><div class="fl-nome">${esc(a.nome)}</div><div class="fl-cargo">${esc(a.cargo || '')}</div></div>` : ''}
      </div>${rodape()}</div>`;
  }

  // Lista/planilha em papel (cabeçalho compacto, tabela com cabeçalho repetido em cada página)
  function tabela({ titulo, sub, colunas, linhas, nota, por }) {
    const quando = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    return `<div class="folha-lista">
      <div class="fll-cab"><img src="icons/pj-al-logo.png" alt=""><div><b>PODER JUDICIÁRIO DO ESTADO DE ALAGOAS</b><br>Juízo de Direito da Comarca de Santa Luzia do Norte</div></div>
      <h1>${esc(titulo)}</h1>
      ${sub ? `<div class="fll-sub">${esc(sub)}</div>` : ''}
      <table><thead><tr><th class="n">#</th>${colunas.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.rot || c)}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map((l, i) => `<tr><td class="n">${i + 1}</td>${l.map((v, j) => `<td${colunas[j] && colunas[j].num ? ' class="num"' : ''}>${v == null ? '' : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <div class="fll-rod">${linhas.length} linha(s) · impresso pelo MetaJus em ${quando}${por ? ' por ' + esc(por) : ''}${nota ? ' · ' + esc(nota) : ''}</div>
    </div>`;
  }

  function imprimir(html, { titulo = 'MetaJus', tipo = 'doc' } = {}) {
    let area = document.getElementById('areaImpressao');
    if (!area) { area = document.createElement('div'); area.id = 'areaImpressao'; document.body.appendChild(area); }
    area.innerHTML = html;
    area.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
    let pag = document.getElementById('estiloPagina');
    if (!pag) { pag = document.createElement('style'); pag.id = 'estiloPagina'; document.head.appendChild(pag); }
    pag.textContent = tipo === 'lista' ? '@page { size: A4; margin: 12mm 11mm 14mm; }' : '@page { size: A4; margin: 0; }';
    const tituloAntes = document.title;
    document.title = titulo;
    document.body.classList.add('imprimindo', tipo === 'lista' ? 'imprimindo-lista' : 'imprimindo-doc');
    const fim = () => {
      document.body.classList.remove('imprimindo', 'imprimindo-lista', 'imprimindo-doc');
      document.title = tituloAntes;
      window.removeEventListener('afterprint', fim);
    };
    window.addEventListener('afterprint', fim);
    // Espera as imagens da folha carregarem antes de abrir a impressão
    const imgs = [...area.querySelectorAll('img')].filter((i) => !i.complete);
    Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))).then(() => {
      setTimeout(() => {
        // As classes só valem na impressão (@media print); se o celular não avisar
        // o fim da impressão, ficam até a próxima — na tela não mudam nada.
        try { window.print(); } catch (e) { fim(); throw e; }
        setTimeout(() => { if (document.title === titulo) document.title = tituloAntes; }, 5000);
      }, 60);
    });
  }

  window.Impressao = { documento, copiaDocumento, tabela, imprimir, dataExtenso, hojeISO, CAB, ROD };
})();
