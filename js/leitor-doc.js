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
    const re = /(\d{2})\s?[/.\-]\s?(\d{2})\s?[/.\-]\s?(\d{4})/g; let m;
    while ((m = re.exec(t))) {
      const d = +m[1], mm = +m[2], a = +m[3];
      if (d >= 1 && d <= 31 && mm >= 1 && mm <= 12 && a >= 1900 && a <= new Date().getFullYear() + 15) out.push({ iso: `${m[3]}-${m[2]}-${m[1]}`, a, pos: m.index });
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
    const fil = depoisDoRotulo(ls, /FILIA/, 2).filter((x) => x !== nome);
    const cpf = acharCpf(txt), nasc = acharNasc(txt);
    // nome "adivinhado" sem rótulo, sem CPF e sem data costuma ser sujeira da leitura
    if (!porRotulo && !cpf && !nasc) nome = '';
    return {
      tipo,
      nome: nome ? titulo(nome) : '',
      cpf,
      nasc,
      rg: tipo === 'CPF' ? '' : acharRg(txt),
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

  window.LeitorDoc = { ler, extrair, cpfOk, fotoCopia };
})();
