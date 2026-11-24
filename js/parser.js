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
    const fila = acharCol(cab, (c) => c.startsWith('fila'));
    const fluxo = acharCol(cab, (c) => c.startsWith('fluxo'));
    const ultMov = acharCol(cab, (c) => c.includes('data') && c.includes('moviment'));
    if (faixa < 0 && dias < 0 && sequencial < 0) return null;
    return { processo, faixa, dias, local, sequencial, segredo, fila, fluxo, ultMov };
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

  // Data (Date do Excel ou texto dd/mm/aaaa) -> 'AAAA-MM-DD'
  function dataISO(v) {
    if (v instanceof Date && !isNaN(v)) {
      return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    }
    const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : null;
  }
  const txt = (v) => (v == null ? '' : String(v)).trim();
  // Competência a partir do fluxo do SAJ
  function area(fluxo) {
    const f = norm(fluxo);
    if (f.startsWith('civel')) return 'Cível';
    if (f.startsWith('criminal') || f.includes('garantias')) return 'Criminal';
    return 'Outros';
  }

  async function lerParados(file) {
    const abas = await lerArquivo(file, true);
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
        if (m.faixa >= 0 && txt(l[m.faixa]) !== '') {
          faixaTexto = txt(l[m.faixa]);
          faixa = faixaDeTexto(faixaTexto);
          if (faixa != null) { ultimaFaixa = faixa; ultimaFaixaTexto = faixaTexto; }
        } else if (m.dias >= 0 && txt(l[m.dias]) !== '') {
          const n = faixaDeTexto(l[m.dias]);
          if (n != null) { faixa = faixaDeDias(n); faixaTexto = n + ' dias'; }
        } else if (ultimaFaixa != null) {
          faixa = ultimaFaixa; faixaTexto = ultimaFaixaTexto;
        }

        const bruto = String(l[m.processo] || '');
        const achou = bruto.match(RE_CNJ);
        if (!achou) { if (bruto.trim()) resumo.ignoradosInvalidos++; continue; }
        if (m.segredo >= 0 && verdadeiro(l[m.segredo])) { resumo.ignoradosSegredo++; continue; }

        const seqTxt = m.sequencial >= 0 ? txt(l[m.sequencial]) : '';
        const sequencial = /^\d$/.test(seqTxt) ? parseInt(seqTxt, 10) : null;
        const item = {
          numero: achou[0],
          faixa: faixa == null ? 0 : faixa,
          faixa_texto: faixaTexto,
          local: m.local >= 0 ? normLocal(l[m.local]) : '',
          sequencial,
          fila: m.fila >= 0 ? txt(l[m.fila]).slice(0, 120) || null : null,
          fluxo: m.fluxo >= 0 ? txt(l[m.fluxo]).slice(0, 120) || null : null,
          ultima_mov: m.ultMov >= 0 ? dataISO(l[m.ultMov]) : null
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
      resumo.comFila = itens.filter((p) => p.fila).length;
      resumo.referencia = referenciaDe(aba.linhas);
      if (itens.length) return { itens, resumo };
    }
    throw new Error('Não encontrei as colunas "Processo" e "Faixa de Dias"/"Sequencial" em nenhuma aba da planilha.');
  }

  // "Filtros aplicados: ... Mês/Ano é 11/2026" -> '2026-11'
  function referenciaDe(linhas) {
    for (const l of linhas) for (const c of (l || [])) {
      const m = String(c || '').match(/m[eê]s\/ano\s+[eé]\s+(\d{1,2})\/(\d{4})/i);
      if (m) return m[2] + '-' + m[1].padStart(2, '0');
    }
    return null;
  }

  // --------------------------------------------------------
  // Filas de cumprimento (Fluxo e Fila)
  //   Fluxo | Fila | Faixa de Dias | Processos no Fluxo no Fim do Período
  //   Só números agregados — nenhum número de processo.
  // --------------------------------------------------------
  function mapaFilas(cab) {
    const fluxo = acharCol(cab, (c) => c.startsWith('fluxo'));
    const fila = acharCol(cab, (c) => c.startsWith('fila'));
    const faixa = acharCol(cab, (c) => c.includes('faixa'));
    const qtd = acharCol(cab, (c) => c.includes('processos no fluxo') || c.includes('quantidade') || c === 'qtd' || c === 'total');
    if (fila < 0 || qtd < 0) return null;
    return { fluxo, fila, faixa, qtd };
  }
  async function lerFilas(file) {
    const abas = await lerArquivo(file, true);
    for (const aba of abas) {
      const cab = acharCabecalho(aba.linhas, mapaFilas);
      if (!cab) continue;
      const m = cab.mapa;
      const agrup = new Map();
      for (let i = cab.indice + 1; i < aba.linhas.length; i++) {
        const l = aba.linhas[i] || [];
        const fila = txt(l[m.fila]);
        const qtd = parseInt(String(l[m.qtd]).replace(/\D/g, ''), 10);
        if (!fila || isNaN(qtd)) continue;
        const fluxo = m.fluxo >= 0 ? txt(l[m.fluxo]) : '';
        const faixa = m.faixa >= 0 ? txt(l[m.faixa]) : '';
        const k = fluxo + '|' + fila + '|' + faixa;
        agrup.set(k, (agrup.get(k) || 0) + qtd);
      }
      const itens = [...agrup.entries()].map(([k, qtd]) => {
        const [fluxo, fila, faixa] = k.split('|');
        return { fluxo, area: area(fluxo), fila, faixa, qtd };
      });
      if (itens.length) {
        return { itens, total: itens.reduce((a, b) => a + b.qtd, 0), referencia: referenciaDe(aba.linhas), aba: aba.nome };
      }
    }
    throw new Error('Não encontrei as colunas "Fila" e "Processos no Fluxo" nesta planilha.');
  }

  // --------------------------------------------------------
  // Lista de processos do mês (Baixados ou Entradas/Distribuídos)
  //   n | Mês/Ano | Processo | ...  -> quantidade por mês
  // --------------------------------------------------------
  function mapaListaMes(cab) {
    const processo = cab.findIndex((c) => c === 'processo' || c.startsWith('processo'));
    const mes = acharCol(cab, (c) => c.replace(/\s/g, '') === 'mes/ano' || c.startsWith('mes'));
    const data = acharCol(cab, (c) => c.startsWith('data'));
    if (processo < 0 || (mes < 0 && data < 0)) return null;
    if (acharCol(cab, (c) => c.includes('faixa')) >= 0) return null; // é o relatório de parados
    return { processo, mes, data };
  }
  async function lerListaMes(file) {
    const abas = await lerArquivo(file, true);
    for (const aba of abas) {
      const cab = acharCabecalho(aba.linhas, mapaListaMes);
      if (!cab) continue;
      const m = cab.mapa;
      const porMes = {};
      for (let i = cab.indice + 1; i < aba.linhas.length; i++) {
        const l = aba.linhas[i] || [];
        const achou = txt(l[m.processo]).match(RE_CNJ);
        if (!achou) continue;
        let mes = null;
        if (m.mes >= 0) { const x = txt(l[m.mes]).match(/(\d{1,2})\/(\d{4})/); if (x) mes = x[2] + '-' + x[1].padStart(2, '0'); }
        if (!mes && m.data >= 0) { const d = dataISO(l[m.data]); if (d) mes = d.slice(0, 7); }
        if (!mes) continue;
        (porMes[mes] = porMes[mes] || new Set()).add(achou[0]);
      }
      const meses = Object.fromEntries(Object.entries(porMes).map(([k, v]) => [k, v.size]));
      if (Object.keys(meses).length) return { meses, referencia: referenciaDe(aba.linhas), aba: aba.nome };
    }
    throw new Error('Não encontrei as colunas "Processo" e "Mês/Ano" nesta planilha.');
  }

  // --------------------------------------------------------
  // IAD, Casos Novos e Baixados (resumo por classe/assunto)
  //   Mês/Ano | IAD | Casos Novos | Baixados | ...  -> soma por mês
  // --------------------------------------------------------
  function mapaIAD(cab) {
    const mes = acharCol(cab, (c) => c.replace(/\s/g, '') === 'mes/ano');
    const novos = acharCol(cab, (c) => c.startsWith('casos novos'));
    const baixados = acharCol(cab, (c) => c.startsWith('baixados'));
    if (mes < 0 || novos < 0 || baixados < 0) return null;
    return { mes, novos, baixados };
  }
  async function lerIAD(file) {
    const abas = await lerArquivo(file, true);
    for (const aba of abas) {
      const cab = acharCabecalho(aba.linhas, mapaIAD);
      if (!cab) continue;
      const m = cab.mapa;
      const meses = {};
      const num = (v) => { const n = Number(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
      for (let i = cab.indice + 1; i < aba.linhas.length; i++) {
        const l = aba.linhas[i] || [];
        const x = txt(l[m.mes]).match(/^(\d{1,2})\/(\d{4})$/);
        if (!x) continue;
        const k = x[2] + '-' + x[1].padStart(2, '0');
        meses[k] = meses[k] || { entradas: 0, arquivados: 0 };
        meses[k].entradas += num(l[m.novos]);
        meses[k].arquivados += num(l[m.baixados]);
      }
      if (Object.keys(meses).length) return { meses, referencia: referenciaDe(aba.linhas), aba: aba.nome };
    }
    throw new Error('Não encontrei as colunas "Mês/Ano", "Casos Novos" e "Baixados" nesta planilha.');
  }


  // --------------------------------------------------------
  // Metas CNJ (painel "(PG) Metas CNJ" do SAJ Insights)
  //   Perguntas Únicas:  n | Pergunta | Processo | Foro | Vara | Classe | Assunto
  //   Perguntas Mensais: n | Mês/Ano | Pergunta | Processo | ...
  //   Pergunta = "P2.26 - Saldo - Primeiro Grau" etc.
  // --------------------------------------------------------
  function mapaMetaCNJ(cab) {
    const pergunta = acharCol(cab, (c) => c.startsWith('pergunta'));
    const processo = acharCol(cab, (c) => c === 'processo' || c.startsWith('processo'));
    if (pergunta < 0 || processo < 0) return null;
    return { pergunta, processo, mes: acharCol(cab, (c) => c.replace(/\s/g, '') === 'mes/ano'),
             classe: acharCol(cab, (c) => c.startsWith('classe')), assunto: acharCol(cab, (c) => c.startsWith('assunto')) };
  }
  async function lerMetaCNJ(file) {
    const abas = await lerArquivo(file, true);
    for (const aba of abas) {
      const cab = acharCabecalho(aba.linhas, mapaMetaCNJ);
      if (!cab) continue;
      const m = cab.mapa;
      const unicas = {}, mensais = {}, nomes = {}, listas = {};
      let meta = null;
      for (const l of aba.linhas) for (const c of (l || [])) {
        const x = String(c || '').match(/meta\s+[eé]\s+(\d+)/i); if (x) meta = parseInt(x[1], 10);
      }
      for (let i = cab.indice + 1; i < aba.linhas.length; i++) {
        const l = aba.linhas[i] || [];
        const pq = txt(l[m.pergunta]).match(/^(P\d+\.\d+)\s*-\s*(.*)$/i);
        const achou = txt(l[m.processo]).match(RE_CNJ);
        if (!pq || !achou) continue;
        const cod = pq[1].toUpperCase(); nomes[cod] = pq[2];
        let mes = null;
        if (m.mes >= 0) { const x = txt(l[m.mes]).match(/(\d{1,2})\/(\d{4})/); if (x) mes = x[2] + '-' + x[1].padStart(2, '0'); }
        const alvo = mes ? ((mensais[mes] = mensais[mes] || {})) : unicas;
        alvo[cod] = alvo[cod] || new Set();
        alvo[cod].add(achou[0]);
        const k = (mes || '') + '|' + cod;
        (listas[k] = listas[k] || new Map()).set(achou[0], {
          numero: achou[0], ano: parseInt(achou[0].slice(11, 15), 10),
          classe: m.classe >= 0 ? txt(l[m.classe]).replace(/^\d+\s*-\s*/, '').slice(0, 80) : '',
          assunto: m.assunto >= 0 ? txt(l[m.assunto]).replace(/^\d+\s*-\s*/, '').slice(0, 80) : ''
        });
      }
      const conta = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.size]));
      const mesesOrd = Object.keys(mensais).sort();
      if (!Object.keys(unicas).length && !mesesOrd.length) continue;
      // Saldo (pendentes) = última pergunta "Saldo" do mês mais recente
      let pendentes = null;
      const ult = mesesOrd[mesesOrd.length - 1];
      if (ult) {
        const codSaldo = Object.keys(mensais[ult]).find((c) => /saldo/i.test(nomes[c]));
        if (codSaldo) pendentes = [...listas[ult + '|' + codSaldo].values()].sort((a, b) => a.ano - b.ano || a.numero.localeCompare(b.numero));
      }
      return {
        meta, tipo: mesesOrd.length ? 'mensais' : 'unicas', nomes,
        unicas: conta(unicas),
        mensais: Object.fromEntries(mesesOrd.map((k) => [k, conta(mensais[k])])),
        pendentes, referencia: ult || referenciaDe(aba.linhas), aba: aba.nome
      };
    }
    throw new Error('Não encontrei as colunas "Pergunta" e "Processo" (relatório de Metas CNJ).');
  }


  // --------------------------------------------------------
  // Processos por fila (relatório "data" do Fluxo e Fila, nível processo)
  //   n | Mês/Ano | Processo | Data da Entrada | Fluxo | Fila | Faixa de Dias | ... | Classe | Assunto
  //   Um processo pode aparecer em mais de uma fila (uma linha por fila).
  // --------------------------------------------------------
  function mapaFilaProc(cab) {
    const processo = acharCol(cab, (c) => c === 'processo' || c.startsWith('processo') || c.includes('numero do processo'));
    const fila = acharCol(cab, (c) => c.startsWith('fila'));
    if (processo < 0 || fila < 0) return null;
    // o relatório de "sem movimentação" também tem fila, mas traz sequencial/localização
    if (acharCol(cab, (c) => c.includes('sequencial')) >= 0) return null;
    if (acharCol(cab, (c) => c.includes('cartorio') || c.includes('gabinete') || c.includes('localiza')) >= 0) return null;
    return { processo, fila, fluxo: acharCol(cab, (c) => c.startsWith('fluxo')), faixa: acharCol(cab, (c) => c.includes('faixa')),
             entrada: acharCol(cab, (c) => c.startsWith('data') && c.includes('entrada')),
             mes: acharCol(cab, (c) => c.replace(/\s/g, '') === 'mes/ano'),
             classe: acharCol(cab, (c) => c.startsWith('classe')), assunto: acharCol(cab, (c) => c.startsWith('assunto')) };
  }
  async function lerFilaProc(file) {
    const abas = await lerArquivo(file, true);
    for (const aba of abas) {
      const cab = acharCabecalho(aba.linhas, mapaFilaProc);
      if (!cab) continue;
      const m = cab.mapa, vistos = new Set(), itens = [], ag = new Map();
      let referencia = null;
      const limpa = (v) => txt(v).replace(/^\d+\s*-\s*/, '').slice(0, 70);
      for (let i = cab.indice + 1; i < aba.linhas.length; i++) {
        const l = aba.linhas[i] || [];
        const achou = String(l[m.processo] || '').match(RE_CNJ);
        const fila = txt(l[m.fila]).slice(0, 120);
        if (!achou || !fila) continue;
        if (!referencia && m.mes >= 0) { const x = txt(l[m.mes]).match(/(\d{1,2})\/(\d{4})/); if (x) referencia = x[2] + '-' + x[1].padStart(2, '0'); }
        const chave = achou[0] + '|' + fila;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        const it = {
          numero: achou[0], fila,
          fluxo: m.fluxo >= 0 ? txt(l[m.fluxo]).slice(0, 120) : '',
          faixa: m.faixa >= 0 ? txt(l[m.faixa]) : '',
          entrada: m.entrada >= 0 ? dataISO(l[m.entrada]) : null,
          classe: m.classe >= 0 ? limpa(l[m.classe]) : '',
          assunto: m.assunto >= 0 ? limpa(l[m.assunto]) : ''
        };
        itens.push(it);
        const k = it.fluxo + '|' + it.fila + '|' + it.faixa;
        const g = ag.get(k) || { fluxo: it.fluxo, area: area(it.fluxo), fila: it.fila, faixa: it.faixa, qtd: 0 };
        g.qtd++; ag.set(k, g);
      }
      if (!itens.length) continue;
      return { itens, agregado: [...ag.values()], total: itens.length, referencia: referencia || referenciaDe(aba.linhas),
               processos: new Set(itens.map((x) => x.numero)).size, aba: aba.nome };
    }
    throw new Error('Não encontrei as colunas "Processo" e "Fila" nesta planilha.');
  }

  // --------------------------------------------------------
  // Listas de cumprimento (Corregedoria, chefia etc.)
  //   Qualquer planilha com números de processo. Colunas opcionais
  //   reconhecidas: Seq./Sequencial, Área/Subfluxo, Dias, Tarjas,
  //   Providência/Cumprimento/Determinação/Observação.
  //   Várias abas são juntas (sem repetir processo).
  //   LGPD: tarjas de saúde/idade viram só "Prioridade legal".
  // --------------------------------------------------------
  function mapaTarefas(cab) {
    if (cab.filter(Boolean).length < 2) return null; // linha de título, não de cabeçalho
    const processo = acharCol(cab, (c) => (c.length <= 30 && c.includes('processo') && !/data|classe|assunto|tipo|total/.test(c)) || c === 'numero' || c === 'nº');
    if (processo < 0) return null;
    return {
      processo,
      seq: acharCol(cab, (c) => c === 'seq' || c === 'seq.' || c.startsWith('sequencial') || c === 'final'),
      area: acharCol(cab, (c) => c.startsWith('area') || c.includes('subfluxo') || c.startsWith('competencia')),
      dias: acharCol(cab, (c) => c.startsWith('dias') || c.includes('dias na fila') || c.includes('dias parado')),
      tarjas: acharCol(cab, (c) => c.startsWith('tarja') || c.startsWith('prioridade')),
      prov: acharCol(cab, (c) => /^(providencia|cumprimento|determinacao|diligencia|o que fazer|tarefa|ato|observa)/.test(c))
    };
  }
  const RE_SAUDE = /doen|defici|idos|crian|adolesc|gestant|autis|neoplas|cancer|hiv|saude|saúde|tea\b/i;
  const RE_CNJ_INC = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}(\/\d{1,4})?/; // aceita incidentes (/01)
  function limparTarjas(v) {
    const t = txt(v);
    if (!t) return '';
    const partes = t.split(/\s*(?:\/|,|;|\|| e )\s*/).map((x) => x.trim()).filter(Boolean)
      .map((x) => RE_SAUDE.test(x) ? 'Prioridade legal' : x.replace(/^portador de\s*/i, ''));
    return [...new Set(partes)].join(' · ').slice(0, 160);
  }
  function areaTexto(v) {
    const n = norm(v);
    if (!n) return '';
    if (n.includes('crim') || n.includes('garantia') || n.includes('juri')) return 'Criminal';
    if (n.includes('civ') || n.includes('famil') || n.includes('fazenda') || n.includes('juizado')) return 'Cível';
    return txt(v).slice(0, 40);
  }
  async function lerListaTarefas(file) {
    const abas = await lerArquivo(file, true);
    const mapa = new Map();
    let titulo = '', ordem = 0;
    for (const aba of abas) {
      const cab = acharCabecalho(aba.linhas, mapaTarefas);
      const areaAba = /c[ií]vel|criminal|crime/i.test(aba.nome) ? areaTexto(aba.nome) : '';
      const ini = cab ? cab.indice + 1 : 0;
      if (!titulo) {
        for (let i = 0; i < Math.min(ini || 3, 3); i++) {
          const t = (aba.linhas[i] || []).map(txt).find((x) => x && !RE_CNJ_INC.test(x));
          if (t && t.length > 8) {
            titulo = t.replace(/\s+[—-]\s+/g, ' — ').replace(/^(painel de controle|relat[oó]rio|planilha)\s*[—:-]\s*/i, '');
            if (titulo === titulo.toUpperCase()) titulo = titulo.charAt(0) + titulo.slice(1).toLowerCase();
            titulo = titulo.slice(0, 90); break;
          }
        }
      }
      for (let i = ini; i < aba.linhas.length; i++) {
        const l = aba.linhas[i] || [];
        let achou = null;
        if (cab) achou = String(l[cab.mapa.processo] || '').match(RE_CNJ_INC);
        if (!achou) { for (const c of l) { const m = String(c || '').match(RE_CNJ_INC); if (m) { achou = m; break; } } }
        if (!achou) continue;
        const m = cab ? cab.mapa : {};
        const pega = (k) => (m[k] != null && m[k] >= 0 ? l[m[k]] : '');
        const s = parseInt(String(pega('seq')).replace(/\D/g, ''), 10);
        const d = parseInt(String(pega('dias')).replace(/\D/g, ''), 10);
        const novo = {
          numero: achou[0],
          sequencial: Number.isFinite(s) && s >= 0 && s <= 9 ? s : null,
          area: areaTexto(pega('area')) || areaAba,
          dias: Number.isFinite(d) ? d : null,
          tarjas: limparTarjas(pega('tarjas')),
          providencia: txt(pega('prov')).slice(0, 300)
        };
        const velho = mapa.get(novo.numero);
        if (!velho) { novo.ordem = ++ordem; mapa.set(novo.numero, novo); continue; }
        for (const k of ['sequencial', 'area', 'dias', 'tarjas', 'providencia']) {
          if ((velho[k] == null || velho[k] === '') && novo[k] != null && novo[k] !== '') velho[k] = novo[k];
        }
      }
    }
    const itens = [...mapa.values()];
    if (!itens.length) throw new Error('Não encontrei números de processo (padrão CNJ) nesta planilha.');
    const nomeArq = String(file.name || '').replace(/\.[^.]+$/, '').replace(/^[0-9a-f]{8}-/, '').replace(/[_]+/g, ' ').trim();
    return {
      itens, titulo: titulo || nomeArq, arquivo: file.name || '',
      comSeq: itens.filter((x) => x.sequencial != null).length,
      areas: itens.reduce((a, x) => { const k = x.area || 'Sem área'; a[k] = (a[k] || 0) + 1; return a; }, {}),
      temProvidencia: itens.some((x) => x.providencia)
    };
  }

  // Descobre qual relatório é, pelo cabeçalho
  async function identificar(file) {
    const abas = await lerArquivo(file, true);
    for (const aba of abas) {
      if (acharCabecalho(aba.linhas, mapaMetaCNJ)) return 'metacnj';
      if (acharCabecalho(aba.linhas, mapaIAD)) return 'iad';
      if (acharCabecalho(aba.linhas, mapaFilas)) return 'filas';
      if (acharCabecalho(aba.linhas, mapaFilaProc)) return 'filasproc';
      if (acharCabecalho(aba.linhas, mapaParados)) return 'parados';
      if (acharCabecalho(aba.linhas, mapaListaMes)) return 'lista';
    }
    return null;
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

  window.Parser = { lerListaTarefas, lerFilaProc, lerMetaCNJ, lerParados, lerMovimentacao, lerFilas, lerListaMes, lerIAD, identificar, area, RE_CNJ, faixaDeDias };
})();
