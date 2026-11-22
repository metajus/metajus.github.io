// ============================================================
// Leitor das planilhas do SAJ Insights (.xlsx, .xls ou .csv)
// Tudo acontece no navegador: o arquivo não é enviado a lugar
// nenhum; só os 4 campos essenciais vão para o banco.
// ============================================================
(function () {
  const FAIXAS = (window.METAJUS_CONFIG && window.METAJUS_CONFIG.FAIXAS) || [30, 60, 100, 120, 180, 365];
  const RE_CNJ = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}(\/\d{4})?/;

  const norm = (s) => String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  async function lerArquivo(file, raw = false) {
    if (!window.XLSX) throw new Error('Leitor de planilhas não carregou. Verifique a internet e recarregue.');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    return wb.SheetNames.map((nome) => ({
      nome,
      linhas: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw, defval: '', blankrows: false })
    }));
  }

  // Procura a linha de cabeçalho (relatórios às vezes têm título em cima)
  function acharCabecalho(linhas, testar) {
    const lim = Math.min(linhas.length, 40);
    for (let i = 0; i < lim; i++) {
      const cab = (linhas[i] || []).map(norm);
      const mapa = testar(cab);
      if (mapa) return { indice: i, mapa };
    }
    return null;
  }

  const acharCol = (cab, pred) => cab.findIndex((c) => c && pred(c));

  // --------------------------------------------------------
  // 1) Relatório de processos parados
  //    Colunas: Faixa de Dias | Processo | Cartório/Gabinete | Sequencial
  //    (demais colunas são ignoradas)
  // --------------------------------------------------------
  function mapaParados(cab) {
    const processo = (() => {
      let i = cab.findIndex((c) => c === 'processo' || c === 'numero do processo' || c === 'n. processo' || c === 'nº processo');
      if (i < 0) i = acharCol(cab, (c) => c.startsWith('processo') || c.includes('numero do processo'));
      return i;
    })();
    if (processo < 0) return null;
    const faixa = acharCol(cab, (c) => c.includes('faixa'));
    const dias = acharCol(cab, (c) => !c.includes('faixa') && /dias|sem moviment/.test(c));
    const local = acharCol(cab, (c) => c.includes('cartorio') || c.includes('gabinete') || c.includes('localiza'));
    const sequencial = acharCol(cab, (c) => c.includes('sequencial') || c === 'seq' || c === 'seq.');
    const segredo = acharCol(cab, (c) => c.includes('segredo') || c.includes('sigilo'));
    if (faixa < 0 && dias < 0 && sequencial < 0) return null;
    return { processo, faixa, dias, local, sequencial, segredo };
  }

  function faixaDeTexto(txt) {
    const m = String(txt || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }
  function faixaDeDias(n) {
    let f = 0;
    for (const x of FAIXAS) if (n >= x) f = x;
    return f;
  }
  function normLocal(v) {
    const t = norm(v);
    if (t.startsWith('cart')) return 'Cartório';
    if (t.startsWith('gab')) return 'Gabinete';
    return '';
  }
  const verdadeiro = (v) => ['sim', 's', 'x', 'true', '1', 'verdadeiro'].includes(norm(v));

  async function lerParados(file) {
    const abas = await lerArquivo(file);
    for (const aba of abas) {
      const cab = acharCabecalho(aba.linhas, mapaParados);
      if (!cab) continue;
      const m = cab.mapa;
      const mapa = new Map();
      let ultimaFaixa = null;
      let ultimaFaixaTexto = '';
      const resumo = { total: 0, porFaixa: {}, porLocal: { 'Cartório': 0, 'Gabinete': 0, '': 0 },
                       ignoradosSegredo: 0, ignoradosInvalidos: 0, aba: aba.nome,
                       colunas: Object.fromEntries(Object.entries(m).map(([k, i]) => [k, i >= 0 ? aba.linhas[cab.indice][i] : null])) };

      for (let i = cab.indice + 1; i < aba.linhas.length; i++) {
        const l = aba.linhas[i] || [];
        // Relatórios agrupados repetem a faixa só na 1ª linha do bloco: herda a anterior
        let faixa = null, faixaTexto = '';
        if (m.faixa >= 0 && String(l[m.faixa]).trim() !== '') {
          faixaTexto = String(l[m.faixa]).trim();
          faixa = faixaDeTexto(faixaTexto);
          if (faixa != null) { ultimaFaixa = faixa; ultimaFaixaTexto = faixaTexto; }
        } else if (m.dias >= 0 && String(l[m.dias]).trim() !== '') {
          const n = faixaDeTexto(l[m.dias]);
          if (n != null) { faixa = faixaDeDias(n); faixaTexto = n + ' dias'; }
        } else if (ultimaFaixa != null) {
          faixa = ultimaFaixa; faixaTexto = ultimaFaixaTexto;
        }

        const bruto = String(l[m.processo] || '');
        const achou = bruto.match(RE_CNJ);
        if (!achou) { if (bruto.trim()) resumo.ignoradosInvalidos++; continue; }
        if (m.segredo >= 0 && verdadeiro(l[m.segredo])) { resumo.ignoradosSegredo++; continue; }

        const seqTxt = m.sequencial >= 0 ? String(l[m.sequencial]).trim() : '';
        const sequencial = /^\d$/.test(seqTxt) ? parseInt(seqTxt, 10) : null;
        const item = {
          numero: achou[0],
          faixa: faixa == null ? 0 : faixa,
          faixa_texto: faixaTexto,
          local: m.local >= 0 ? normLocal(l[m.local]) : '',
          sequencial
        };
        const ant = mapa.get(item.numero);
        if (!ant || item.faixa > ant.faixa) mapa.set(item.numero, item);
      }

      const itens = [...mapa.values()];
      for (const p of itens) {
        resumo.total++;
        resumo.porFaixa[p.faixa] = (resumo.porFaixa[p.faixa] || 0) + 1;
        resumo.porLocal[p.local] = (resumo.porLocal[p.local] || 0) + 1;
      }
      resumo.semSequencial = itens.filter((p) => p.sequencial == null).length;
      if (itens.length) return { itens, resumo };
    }
    throw new Error('Não encontrei as colunas "Processo" e "Faixa de Dias"/"Sequencial" em nenhuma aba da planilha.');
  }

  // --------------------------------------------------------
  // 2) Relatório de movimentação (Distribuídos x Baixados)
  //    Colunas: Data | Tipo (Entrada/Arquivamento) | Processo
  //    Devolve contagem por mês: { 'AAAA-MM': {entradas, arquivados} }
  // --------------------------------------------------------
  function mapaMovimentacao(cab) {
    const data = acharCol(cab, (c) => c === 'data' || c.startsWith('data'));
    const tipo = acharCol(cab, (c) => c.includes('tipo') || c.includes('movimenta') || c.includes('situa'));
    const processo = acharCol(cab, (c) => c.includes('processo'));
    if (data < 0 || tipo < 0) return null;
    return { data, tipo, processo };
  }
  function mesDe(v) {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0');
    const s = String(v || '').trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return a + '-' + m[2].padStart(2, '0'); }
    m = s.match(/^(\d{4})-(\d{2})/);
    if (m) return m[1] + '-' + m[2];
    return null;
  }
  async function lerMovimentacao(file) {
    const abas = await lerArquivo(file, true);
    for (const aba of abas) {
      const cab = acharCabecalho(aba.linhas, mapaMovimentacao);
      if (!cab) continue;
      const m = cab.mapa;
      const meses = {};
      const vistos = new Set();
      let ignorados = 0;
      for (let i = cab.indice + 1; i < aba.linhas.length; i++) {
        const l = aba.linhas[i] || [];
        const mes = mesDe(l[m.data]);
        const t = norm(l[m.tipo]);
        let campo = null;
        if (/entr|distrib|novo|receb/.test(t)) campo = 'entradas';
        else if (/arquiv|baix/.test(t)) campo = 'arquivados';
        if (!mes || !campo) { ignorados++; continue; }
        const chave = mes + '|' + campo + '|' + (m.processo >= 0 ? String(l[m.processo]).trim() : i);
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        meses[mes] = meses[mes] || { entradas: 0, arquivados: 0 };
        meses[mes][campo]++;
      }
      if (Object.keys(meses).length) return { meses, ignorados, aba: aba.nome };
    }
    throw new Error('Não encontrei as colunas "Data" e "Tipo" (Entrada/Arquivamento) na planilha.');
  }

  window.Parser = { lerParados, lerMovimentacao, RE_CNJ, faixaDeDias };
})();
