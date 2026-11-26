// MetaJus — leitura de documento por foto (RG, CIN, CPF, CNH).
// Tudo acontece no próprio aparelho: a foto NÃO é enviada nem guardada.
// A biblioteca de leitura (Tesseract.js) só é baixada na primeira vez que alguém usa o recurso.
(function () {
  'use strict';

  const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  // Palavras de cabeçalho/rótulo que nunca fazem parte de um nome
  const RUIDO = ['REPUBLICA', 'FEDERATIVA', 'BRASIL', 'MINISTERIO', 'SECRETARIA', 'CARTEIRA', 'IDENTIDADE', 'IDENTIFICACAO',
    'HABILITACAO', 'NACIONAL', 'DEPARTAMENTO', 'TRANSITO', 'ESTADO', 'VALIDA', 'VALIDADE', 'TODO', 'TERRITORIO', 'ASSINATURA',
    'TITULAR', 'DIRETOR', 'REGISTRO', 'GERAL', 'FILIACAO', 'NATURALIDADE', 'NASCIMENTO', 'EXPEDICAO', 'DOCUMENTO', 'EMISSOR',
    'ORGAO', 'CATEGORIA', 'PERMISSAO', 'OBSERVACOES', 'LOCAL', 'SEGURANCA', 'PUBLICA', 'INSTITUTO', 'POLICIA', 'CIVIL', 'LEI',
    'CPF', 'RG', 'CNH', 'DATA', 'NOME', 'SOCIAL', 'SEXO', 'NACIONALIDADE', 'BRASILEIRO', 'BRASILEIRA', 'DETRAN', 'SSP', 'VIA',
    'POLEGAR', 'DIREITO', 'CADASTRO', 'PESSOAS', 'FISICAS', 'RECEITA', 'FAZENDA', 'ACC', 'HAB', 'EMISSAO', 'DENATRAN', 'SENATRAN',
    'ALAGOAS', 'MACEIO', 'INSCRICAO', 'CODIGO', 'PROIBIDO', 'PLASTIFICAR', 'IDENT', 'ORG', 'UF', 'MUNICIPIO'];

  const semAc = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

  function cpfOk(c) {
    const d = c.replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === +d[9] && dv(10) === +d[10];
  }
  const fmtCpf = (d) => d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');

  // Troca letras que a leitura costuma confundir com números (só dentro de trechos "numéricos")
  const numerizar = (s) => String(s).replace(/[^\s]+/g, (t) => {
    if (!/\d/.test(t) || !/^[0-9OoQDIl|SBZ.,\-/–]+$/.test(t)) return t;
    const sig = t.replace(/[.,\-/–]/g, '');
    return (t.match(/\d/g) || []).length >= sig.length * 0.4
      ? t.replace(/[OoQD]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2') : t;
  });

  function acharCpf(txt) {
    const t = numerizar(txt);
    const cands = t.match(/\d{3}[.,\s]?\d{3}[.,\s]?\d{3}\s?[-–.,\s/]?\s?\d{2}(?!\d)/g) || [];
    for (const c of cands) { const d = c.replace(/\D/g, ''); if (cpfOk(d)) return fmtCpf(d); }
    // 11 dígitos seguidos em qualquer lugar
    const soDig = t.replace(/[^\d\n]/g, ' ');
    for (const c of soDig.match(/\d{11}/g) || []) if (cpfOk(c)) return fmtCpf(c);
    return '';
  }

  function datas(txt) {
    const t = numerizar(txt);
    const out = [];
    const anoMax = new Date().getFullYear() + 15;
    // aceita 14/03/1979, 14.03.1979, 14-03-1979 e também 1403/1979 ou 14031979 (a leitura às vezes perde as barras)
    const re = /(?<!\d)(\d{2})\s?[/.\-]?\s?(\d{2})\s?[/.\-]?\s?((?:19|20)\d{2})(?!\d)/g; let m;
    while ((m = re.exec(t))) {
      const d = +m[1], mm = +m[2], a = +m[3];
      if (d >= 1 && d <= 31 && mm >= 1 && mm <= 12 && a >= 1900 && a <= anoMax) out.push({ iso: `${m[3]}-${m[2]}-${m[1]}`, a, pos: m.index });
    }
    return out;
  }

  function acharNasc(txt) {
    const ds = datas(txt); if (!ds.length) return '';
    const U = semAc(txt).toUpperCase();
    const anoMax = new Date().getFullYear();
    // 1) data logo depois do rótulo "NASCIMENTO"
    const iLab = U.search(/NASC/);
    if (iLab >= 0) { const d = ds.find((x) => x.pos > iLab && x.pos - iLab < 160 && x.a <= anoMax); if (d) return d.iso; }
    // 2) a data mais antiga (expedição e validade vêm depois do nascimento)
    const passadas = ds.filter((x) => x.a <= anoMax).sort((a, b) => a.iso.localeCompare(b.iso));
    return passadas.length ? passadas[0].iso : '';
  }

  // Uma linha "parece nome": só letras, 2+ palavras, sem palavras de cabeçalho
  function limparNome(l) {
    let s = String(l).toUpperCase().replace(/[^A-ZÀ-ÖØ-Þ\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
    const pal = s.split(' ').filter((p) => p.length > 0);
    // descarta pedaços soltos de 1 letra no início/fim (sujeira da leitura), mantendo "E", "DA", "DE"...
    while (pal.length && pal[0].length === 1) pal.shift();
    while (pal.length && pal[pal.length - 1].length === 1) pal.pop();
    s = pal.join(' ');
    return s;
  }
  function pareceNome(l) {
    const s = limparNome(l);
    const pal = semAc(s).split(' ');
    if (pal.length < 2 || s.length < 6 || s.length > 70) return false;
    if (pal.some((p) => RUIDO.includes(p))) return false;
    const letras = semAc(l).replace(/[^A-Za-z]/g, '').length;
    const lixo = l.replace(/[A-Za-zÀ-ÿ\s'-]/g, '').length;
    if (lixo > Math.max(2, letras * 0.15)) return false;
    // nomes de verdade têm palavras de 2+ letras com vogais
    return pal.filter((p) => p.length >= 2 && /[AEIOUY]/.test(p)).length >= 2;
  }
  const titulo = (s) => s.toLowerCase().replace(/(^|[\s'-])(\S)/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\s(Da|De|Do|Das|Dos|E)(?=\s)/g, (m) => m.toLowerCase());

  function linhas(txt) { return String(txt).split(/\r?\n/).map((l) => l.trim()).filter(Boolean); }

  function depoisDoRotulo(ls, reRotulo, quantos) {
    const res = [];
    for (let i = 0; i < ls.length; i++) {
      const U = semAc(ls[i]).toUpperCase();
      if (!reRotulo.test(U)) continue;
      // o nome pode estar na mesma linha, depois do rótulo
      const resto = ls[i].replace(new RegExp('^.*?' + reRotulo.source.replace(/\\b/g, '') + '[^A-Za-zÀ-ÿ]*', 'i'), '');
      if (resto !== ls[i] && pareceNome(resto)) res.push(limparNome(resto));
      for (let j = i + 1; j < Math.min(ls.length, i + 5) && res.length < quantos; j++) {
        if (pareceNome(ls[j])) res.push(limparNome(ls[j]));
        else if (res.length && /[A-Z]{3,}/.test(semAc(ls[j]).toUpperCase()) && RUIDO.some((r) => semAc(ls[j]).toUpperCase().includes(r))) break;
      }
      if (res.length) return res.slice(0, quantos);
    }
    return res;
  }

  function acharRg(txt) {
    const ls = linhas(txt);
    for (let i = 0; i < ls.length; i++) {
      const U = semAc(ls[i]).toUpperCase();
      if (!/REGISTRO\s*GERAL|DOC\.?\s*IDENT|IDENTIDADE\s*\/|\bRG\b|ORG\.?\s*EMISSOR/.test(U)) continue;
      for (const l of [ls[i], ls[i + 1] || '', ls[i + 2] || '']) {
        const n = numerizar(semAc(l).toUpperCase());
        const m = n.match(/(\d[\d.\-]{3,13}[\dX])\s*([A-Z]{2,6})?\s*[/\-]?\s*([A-Z]{2})?\b/);
        if (m && !cpfOk(m[1].replace(/\D/g, '')) && m[1].replace(/\D/g, '').length >= 5 && !/\d{2}[/.]\d{2}[/.]\d{4}/.test(m[0])) {
          return [m[1], m[2] && m[2] !== 'CPF' ? m[2] : '', m[3] || ''].filter(Boolean).join(' ').replace(/\s+([A-Z]{2})$/, '/$1');
        }
      }
    }
    return '';
  }

  // RG no formato 1.234.567 / 12.345.678-9 mesmo sem o rótulo "REGISTRO GERAL"
  function rgSemRotulo(txt) {
    const t = numerizar(txt);
    for (const m of t.matchAll(/(?<![\d.])(\d{1,2}\.\d{3}\.\d{3}(?:-[\dX])?)(?![\d.])/g)) {
      if (!cpfOk(m[1].replace(/\D/g, ''))) return m[1];
    }
    return '';
  }

  // Lê o texto inteiro e devolve o que conseguir reconhecer
  function extrair(txt) {
    const ls = linhas(txt);
    const tipo = /HABILITA/.test(semAc(txt).toUpperCase()) ? 'CNH' : (/CADASTRO DE PESSOAS|PESSOAS F/i.test(semAc(txt)) ? 'CPF' : 'RG');
    let nome = depoisDoRotulo(ls, /\bNOME\b(?!\s*SOCIAL)/, 1)[0] || '';
    const porRotulo = !!nome;
    if (!nome) {
      const cands = ls.filter(pareceNome).map(limparNome);
      nome = cands.sort((a, b) => b.length - a.length)[0] || '';
    }
    let fil = depoisDoRotulo(ls, /FILIA/, 2).filter((x) => x !== nome);
    if (!fil.length && nome && tipo !== 'CPF') {
      // sem o rótulo "FILIAÇÃO": as linhas com cara de nome logo depois do nome costumam ser pai e mãe
      const i = ls.findIndex((l) => pareceNome(l) && limparNome(l) === nome);
      if (i >= 0) {
        const seguintes = [];
        for (let j = i + 1; j < Math.min(ls.length, i + 6) && seguintes.length < 2; j++) if (pareceNome(ls[j])) seguintes.push(limparNome(ls[j]));
        fil = seguintes;
      }
    }
    const cpf = acharCpf(txt), nasc = acharNasc(txt);
    // nome "adivinhado" sem rótulo, sem CPF e sem data costuma ser sujeira da leitura
    if (!porRotulo && !cpf && !nasc) nome = '';
    return {
      tipo,
      nome: nome ? titulo(nome) : '',
      cpf,
      nasc,
      rg: tipo === 'CPF' ? '' : (acharRg(txt) || rgSemRotulo(txt)),
      pai: fil.length === 2 ? titulo(fil[0]) : '',
      mae: fil.length ? titulo(fil[fil.length - 1]) : '',
      filiacao: fil.map(titulo).join(' e ')
    };
  }
  const pontos = (r) => (r.nome ? 3 : 0) + (r.cpf ? 3 : 0) + (r.nasc ? 1 : 0) + (r.rg ? 1 : 0) + (r.mae ? 1 : 0);

  // ---------------------------------------------------------------- leitura da imagem
  let carregando = null;
  function carregarLib() {
    if (window.Tesseract) return Promise.resolve();
    if (carregando) return carregando;
    carregando = new Promise((ok, erro) => {
      const s = document.createElement('script'); s.src = LIB; s.async = true;
      s.onload = () => ok(); s.onerror = () => { carregando = null; erro(new Error('Sem internet para baixar o leitor.')); };
      document.head.appendChild(s);
    });
    return carregando;
  }

  // Ajusta a foto: tamanho bom para leitura, tons de cinza e contraste
  async function prepararImagem(arquivo, giro) {
    const url = URL.createObjectURL(arquivo);
    try {
      const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
      const w0 = img.naturalWidth, h0 = img.naturalHeight;
      const esc = Math.min(1, 2200 / Math.max(w0, h0)) * (Math.max(w0, h0) < 1200 ? 1.6 : 1);
      const w = Math.round(w0 * esc), h = Math.round(h0 * esc);
      const cv = document.createElement('canvas');
      const de_lado = giro % 180 !== 0;
      cv.width = de_lado ? h : w; cv.height = de_lado ? w : h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(giro * Math.PI / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      const px = ctx.getImageData(0, 0, cv.width, cv.height), d = px.data;
      let mn = 255, mx = 0;
      for (let i = 0; i < d.length; i += 4) { const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; d[i] = g; if (g < mn) mn = g; if (g > mx) mx = g; }
      const amp = Math.max(1, mx - mn);
      for (let i = 0; i < d.length; i += 4) { const g = Math.max(0, Math.min(255, (d[i] - mn) * 255 / amp)); d[i] = d[i + 1] = d[i + 2] = g; }
      ctx.putImageData(px, 0, 0);
      return cv;
    } finally { URL.revokeObjectURL(url); }
  }

  // Cópia colorida da foto para imprimir (fica só na memória da tela)
  async function fotoCopia(arquivo, giro) {
    const url = typeof arquivo === 'string' ? arquivo : URL.createObjectURL(arquivo);
    try {
      const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
      const w0 = img.naturalWidth, h0 = img.naturalHeight, esc = Math.min(1, 1800 / Math.max(w0, h0));
      const w = Math.round(w0 * esc), h = Math.round(h0 * esc), lado = (giro || 0) % 180 !== 0;
      const cv = document.createElement('canvas'); cv.width = lado ? h : w; cv.height = lado ? w : h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate((giro || 0) * Math.PI / 180);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      return { src: cv.toDataURL('image/jpeg', 0.85), w: cv.width, h: cv.height };
    } finally { if (typeof arquivo !== 'string') URL.revokeObjectURL(url); }
  }

  // progresso(texto, 0..1)
  async function ler(arquivo, progresso) {
    const avisar = progresso || (() => {});
    avisar('Preparando o leitor…', 0.05);
    await carregarLib();
    let fase = 'Preparando o leitor…';
    const worker = await window.Tesseract.createWorker('por', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') avisar(fase, 0.3 + m.progress * 0.65);
        else if (/load|initializ/i.test(m.status)) avisar('Baixando o leitor (só na primeira vez)…', 0.05 + (m.progress || 0) * 0.25);
      }
    });
    try {
      let melhor = null, giroMelhor = 0;
      for (const giro of [0, 90, 270, 180]) {
        fase = giro ? 'Girando a foto e tentando de novo…' : 'Lendo o documento…';
        const cv = await prepararImagem(arquivo, giro);
        const { data } = await worker.recognize(cv);
        const r = extrair(data.text || '');
        r.texto = data.text || '';
        if (!melhor || pontos(r) > pontos(melhor)) { melhor = r; giroMelhor = giro; }
        if (r.nome && r.cpf) break;           // achou o essencial
        if (giro === 0 && pontos(r) >= 4) break; // leitura razoável sem girar
      }
      avisar('Pronto', 1);
      melhor.giro = giroMelhor;
      return melhor;
    } finally { worker.terminate(); }
  }


  // ---------------------------------------------------------------- câmera ao vivo
  // Abre a câmera dentro do app, com moldura no formato do documento.
  // Captura sozinha quando a imagem fica parada e nítida (ou no toque do botão).
  // Devolve um Blob só com o recorte da moldura, ou null se cancelar. Nada é salvo na galeria.
  const temCamera = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;

  function escolherDaGaleria() {
    return new Promise((ok) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); ok(f || null); });
      inp.click();
    });
  }

  function abrirCamera() {
    return new Promise(async (resolver) => {
      const tela = document.createElement('div');
      tela.className = 'cam-tela';
      tela.innerHTML = `
        <video class="cam-video" playsinline muted autoplay></video>
        <div class="cam-moldura"><span></span><span></span><span></span><span></span></div>
        <div class="cam-topo"><button type="button" class="cam-btn" data-c="fechar" aria-label="Fechar">✕</button>
          <div class="cam-dica" id="camDica">Abrindo a câmera…</div>
          <button type="button" class="cam-btn" data-c="luz" aria-label="Lanterna" hidden>🔦</button></div>
        <div class="cam-base">
          <button type="button" class="cam-txt" data-c="galeria">Galeria</button>
          <button type="button" class="cam-disparo" data-c="ler" aria-label="Ler agora"><span></span></button>
          <label class="cam-txt cam-auto"><input type="checkbox" id="camAuto" checked> Automático</label>
        </div>`;
      document.body.appendChild(tela); document.body.classList.add('com-camera');
      const video = tela.querySelector('video'), dica = tela.querySelector('#camDica'), moldura = tela.querySelector('.cam-moldura');
      // celular em pé: o documento também fica em pé na moldura (aproveita a altura da tela = mais resolução)
      const emPe = () => window.innerHeight > window.innerWidth;
      const ajustarMoldura = () => moldura.classList.toggle('vertical', emPe());
      ajustarMoldura(); window.addEventListener('resize', ajustarMoldura);
      const msgPadrao = () => emPe() ? 'Vire o documento de lado e encaixe na moldura' : 'Encaixe o documento na moldura e segure firme';
      let stream = null, timer = null, acabou = false, luz = false;
      const fim = (valor) => {
        if (acabou) return; acabou = true;
        clearInterval(timer);
        if (stream) stream.getTracks().forEach((t) => t.stop());
        window.removeEventListener('resize', ajustarMoldura);
        tela.remove(); document.body.classList.remove('com-camera');
        resolver(valor);
      };

      // recorta a área da moldura no tamanho real do vídeo
      const recortar = (larguraAlvo) => {
        const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return null;
        const tv = video.getBoundingClientRect(), tm = moldura.getBoundingClientRect();
        const k = Math.max(tv.width / vw, tv.height / vh);           // object-fit: cover
        const ox = (tv.width - vw * k) / 2, oy = (tv.height - vh * k) / 2;
        const folga = 0.04;
        let x = (tm.left - tv.left - ox) / k, y = (tm.top - tv.top - oy) / k, w = tm.width / k, h = tm.height / k;
        x -= w * folga; y -= h * folga; w *= 1 + 2 * folga; h *= 1 + 2 * folga;
        x = Math.max(0, x); y = Math.max(0, y); w = Math.min(vw - x, w); h = Math.min(vh - y, h);
        const e = larguraAlvo ? larguraAlvo / w : 1;
        const cv = document.createElement('canvas'); cv.width = Math.round(w * e); cv.height = Math.round(h * e);
        cv.getContext('2d', { willReadFrequently: true }).drawImage(video, x, y, w, h, 0, 0, cv.width, cv.height);
        return cv;
      };
      const capturar = () => {
        let cv = recortar(0); if (!cv) return;
        if (moldura.classList.contains('vertical')) {           // deixa o documento deitado para a leitura
          const r = document.createElement('canvas'); r.width = cv.height; r.height = cv.width;
          const c = r.getContext('2d'); c.translate(r.width / 2, r.height / 2); c.rotate(Math.PI / 2); c.drawImage(cv, -cv.width / 2, -cv.height / 2);
          cv = r;
        }
        if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {}
        dica.textContent = 'Pronto!';
        cv.toBlob((b) => fim(b), 'image/jpeg', 0.92);
      };

      tela.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        const c = b.dataset.c;
        if (c === 'fechar') fim(null);
        else if (c === 'ler') capturar();
        else if (c === 'galeria') { const f = await escolherDaGaleria(); if (f) fim(f); }
        else if (c === 'luz' && stream) {
          luz = !luz;
          try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: luz }] }); b.classList.toggle('on', luz); } catch (er) {}
        }
      });

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
      } catch (e) {
        dica.textContent = 'Não consegui abrir a câmera. Permita o acesso à câmera para este site, ou use a Galeria.';
        return;
      }
      if (acabou) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      try { await video.play(); } catch (e) {}
      const trilha = stream.getVideoTracks()[0];
      try {
        const cap = trilha.getCapabilities ? trilha.getCapabilities() : {};
        if (cap.torch) tela.querySelector('[data-c="luz"]').hidden = false;
        if (cap.focusMode && cap.focusMode.includes('continuous')) trilha.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      } catch (e) {}
      dica.textContent = msgPadrao();

      // captura automática: imagem parada + nítida por ~1 segundo
      let anterior = null, parado = 0, melhorNitidez = 0; const inicio = Date.now();
      timer = setInterval(() => {
        if (acabou || !$auto()) return;
        const cv = recortar(160);
        if (!cv) return;
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        const n = cv.width * cv.height, g = new Float32Array(n);
        for (let i = 0; i < n; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
        let dif = 0, nit = 0;
        for (let i = 1; i < n; i++) { nit += Math.abs(g[i] - g[i - 1]); if (anterior) dif += Math.abs(g[i] - anterior[i]); }
        dif /= n; nit /= n; anterior = g;
        melhorNitidez = Math.max(melhorNitidez * 0.98, nit);
        const nitido = nit >= melhorNitidez * 0.8 && nit > 2.5;
        if (dif < 4 && nitido) parado++; else parado = 0;
        moldura.classList.toggle('firme', parado >= 1);
        dica.textContent = parado >= 1 ? 'Segure assim…' : (nit <= 2.5 ? 'Aproxime o documento da câmera' : msgPadrao());
        if (parado >= 5 && Date.now() - inicio > 1800) capturar();
      }, 250);
      const $auto = () => tela.querySelector('#camAuto').checked;
    });
  }

  window.LeitorDoc = { ler, extrair, cpfOk, fotoCopia, abrirCamera, temCamera, escolherDaGaleria };
})();
