// ============================================================
// Gráficos do MetaJus — SVG puro, sem bibliotecas externas.
// Cada função devolve o HTML de um <svg> responsivo.
// Passe o dedo/mouse sobre as barras para ver o valor (data-tip).
// ============================================================
(function () {
  // Cores (tema escuro). Série 1 = azul (baixados), série 2 = laranja (casos novos).
  const COR = {
    s1: '#3987e5', s2: '#d95926', s3: '#199e70', s4: '#c98500', s5: '#9085e9',
    bom: '#0ca30c', alerta: '#fab219', serio: '#ec835a', critico: '#d03b3b',
    grade: 'rgba(158,171,198,.18)', eixo: 'rgba(158,171,198,.45)', neutro: '#5b6680'
  };
  const fmt = (n) => Number(n).toLocaleString('pt-BR');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Retângulo com cantos arredondados só na ponta do dado (base reta)
  function barraH(x, y, w, h, cor, tip) {
    if (w <= 0) return '';
    const r = Math.min(4, w / 2, h / 2);
    return `<path d="M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z" fill="${cor}" data-tip="${esc(tip)}"/>`;
  }
  function barraV(x, yBase, w, h, cor, tip) {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h / 2), y = yBase - h;
    return `<path d="M${x},${yBase} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${yBase} Z" fill="${cor}" data-tip="${esc(tip)}"/>`;
  }
  function escalaMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  // ---------- 1. Bullet: realizado x meta (+ projeção) ----------
  // { valor, meta, projecao, rotulo }
  function bullet({ valor, meta, projecao, rotuloValor = 'Baixados', rotuloMeta = 'Meta' }) {
    const W = 340, H = 92, x0 = 8, x1 = W - 8, w = x1 - x0;
    const max = escalaMax(Math.max(valor, meta, projecao || 0) * 1.08);
    const X = (v) => x0 + (v / max) * w;
    const batida = valor >= meta;
    const cor = batida ? COR.bom : COR.s1;
    let s = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(rotuloValor)} ${valor} de ${rotuloMeta} ${meta}">`;
    // trilho
    s += `<rect x="${x0}" y="30" width="${w}" height="22" rx="6" fill="rgba(0,0,0,.35)" stroke="${COR.grade}"/>`;
    // projeção (faixa clara até o valor projetado)
    if (projecao && projecao > valor) {
      s += `<rect x="${x0}" y="34" width="${X(projecao) - x0}" height="14" rx="4" fill="${cor}" opacity=".22" data-tip="Projeção no ritmo atual: ${fmt(projecao)}"/>`;
    }
    s += barraH(x0, 34, X(valor) - x0, 14, cor, `${rotuloValor}: ${fmt(valor)}`);
    // marcador da meta
    const xm = X(meta);
    s += `<line x1="${xm}" x2="${xm}" y1="24" y2="58" stroke="#fff" stroke-width="3" stroke-linecap="round" data-tip="${esc(rotuloMeta)}: ${fmt(meta)}"/>`;
    s += `<text x="${Math.min(Math.max(xm, 30), W - 30)}" y="16" text-anchor="middle" class="g-rot">${esc(rotuloMeta)} ${fmt(meta)}</text>`;
    // eixo
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, x = X(v);
      s += `<text x="${x}" y="76" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}" class="g-eixo">${fmt(Math.round(v))}</text>`;
    }
    if (projecao) {
      const xp = X(projecao);
      s += `<line x1="${xp}" x2="${xp}" y1="30" y2="52" stroke="${cor}" stroke-width="2" stroke-dasharray="3 3" data-tip="Projeção: ${fmt(projecao)}"/>`;
    }
    return s + '</svg>';
  }

  // ---------- 2. Barras horizontais ----------
  // itens: [{rotulo, valor, cor?, tip?}]
  function barrasH(itens, { cor = COR.s1, larguraRotulo = 150, sufixo = '' } = {}) {
    const lh = 30, W = 340, H = itens.length * lh + 6;
    const x0 = larguraRotulo, w = W - x0 - 44;
    const max = Math.max(1, ...itens.map((i) => i.valor));
    let s = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img">`;
    itens.forEach((it, i) => {
      const y = i * lh + 4, bw = (it.valor / max) * w;
      const rot = it.rotulo.length > 24 ? it.rotulo.slice(0, 23) + '…' : it.rotulo;
      s += `<text x="${x0 - 8}" y="${y + 15}" text-anchor="end" class="g-rot"><title>${esc(it.rotulo)}</title>${esc(rot)}</text>`;
      s += `<rect x="${x0}" y="${y + 2}" width="${w}" height="18" fill="transparent" data-tip="${esc(it.tip || it.rotulo + ': ' + fmt(it.valor) + sufixo)}"/>`;
      s += barraH(x0, y + 4, Math.max(bw, it.valor ? 2 : 0), 14, it.cor || cor, it.tip || `${it.rotulo}: ${fmt(it.valor)}${sufixo}`);
      s += `<text x="${x0 + bw + 6}" y="${y + 15}" class="g-val">${fmt(it.valor)}${sufixo}</text>`;
    });
    return s + '</svg>';
  }

  // ---------- 3. Colunas agrupadas (evolução mensal) ----------
  // categorias: ['out/26','nov/26'], series: [{nome, cor, valores:[]}]
  function colunasAgrupadas(categorias, series) {
    const W = 340, H = 190, top = 14, base = 160, x0 = 30, x1 = W - 6;
    const max = escalaMax(Math.max(1, ...series.flatMap((s) => s.valores)) * 1.1);
    const Y = (v) => base - (v / max) * (base - top);
    const gw = (x1 - x0) / Math.max(categorias.length, 1);
    const bw = Math.min(26, (gw - 14) / series.length);
    let s = `<svg class="graf vertical" viewBox="0 0 ${W} ${H}" role="img">`;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, y = Y(v);
      s += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${COR.grade}"/>`;
      s += `<text x="${x0 - 5}" y="${y + 4}" text-anchor="end" class="g-eixo">${fmt(Math.round(v))}</text>`;
    }
    categorias.forEach((c, i) => {
      const cx = x0 + gw * i + gw / 2, totalW = bw * series.length + 2 * (series.length - 1);
      series.forEach((se, j) => {
        const x = cx - totalW / 2 + j * (bw + 2), v = se.valores[i] || 0;
        s += barraV(x, base, bw, base - Y(v), se.cor, `${c} · ${se.nome}: ${fmt(v)}`);
        if (categorias.length <= 6) s += `<text x="${x + bw / 2}" y="${Y(v) - 4}" text-anchor="middle" class="g-val">${fmt(v)}</text>`;
      });
      s += `<text x="${cx}" y="${base + 16}" text-anchor="middle" class="g-eixo">${esc(c)}</text>`;
    });
    s += `<line x1="${x0}" x2="${x1}" y1="${base}" y2="${base}" stroke="${COR.eixo}"/>`;
    return s + '</svg>';
  }

  // ---------- 4. Linha (IAD por mês) com linha de referência ----------
  function linha(categorias, valores, { ref = 1, nome = 'IAD' } = {}) {
    const W = 340, H = 150, top = 14, base = 120, x0 = 30, x1 = W - 14;
    const vmax = Math.max(ref * 1.3, ...valores) * 1.05, vmin = Math.min(ref * 0.7, ...valores) * 0.95;
    const Y = (v) => base - ((v - vmin) / (vmax - vmin)) * (base - top);
    const X = (i) => categorias.length === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) / (categorias.length - 1)) * i;
    let s = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img">`;
    s += `<rect x="${x0}" y="${top}" width="${x1 - x0}" height="${Y(ref) - top}" fill="${COR.bom}" opacity=".07"/>`;
    s += `<line x1="${x0}" x2="${x1}" y1="${Y(ref)}" y2="${Y(ref)}" stroke="${COR.eixo}" stroke-dasharray="4 4"/>`;
    s += `<text x="${(x0 + x1) / 2}" y="${top + 2}" text-anchor="middle" class="g-eixo">acima da linha tracejada: IAD ≥ ${String(ref.toFixed(2)).replace('.', ',')}</text>`;
    if (valores.length > 1) {
      s += `<polyline fill="none" stroke="${COR.s1}" stroke-width="2" stroke-linejoin="round" points="${valores.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}"/>`;
    }
    valores.forEach((v, i) => {
      const bom = v >= ref;
      s += `<circle cx="${X(i)}" cy="${Y(v)}" r="5" fill="${bom ? COR.bom : COR.critico}" stroke="#0f1a30" stroke-width="2" data-tip="${esc(categorias[i])} · ${nome} ${v.toFixed(2).replace('.', ',')}"/>`;
      s += `<text x="${X(i)}" y="${Y(v) - 10}" text-anchor="middle" class="g-val">${v.toFixed(2).replace('.', ',')}</text>`;
      s += `<text x="${X(i)}" y="${base + 18}" text-anchor="middle" class="g-eixo">${esc(categorias[i])}</text>`;
    });
    return s + '</svg>';
  }

  // ---------- 5. Barra única 100% (composição) ----------
  // segs: [{rotulo, valor, cor}]
  function pilha100(segs) {
    const W = 340, H = 30, total = segs.reduce((a, b) => a + b.valor, 0) || 1;
    let x = 0, s = `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img">`;
    segs.filter((g) => g.valor > 0).forEach((g, i, arr) => {
      const w = (g.valor / total) * W - (i < arr.length - 1 ? 2 : 0);
      s += `<rect x="${x}" y="4" width="${Math.max(w, 1)}" height="22" rx="${i === 0 || i === arr.length - 1 ? 5 : 0}" fill="${g.cor}" data-tip="${esc(g.rotulo)}: ${fmt(g.valor)} (${Math.round(g.valor / total * 100)}%)"/>`;
      x += w + 2;
    });
    return s + '</svg>';
  }

  // ---------- 6. Colunas simples (ex.: por sequencial) ----------
  function colunas(itens, { cor = COR.s1 } = {}) {
    const W = 340, H = 150, top = 16, base = 124, x0 = 4, x1 = W - 4;
    const max = Math.max(1, ...itens.map((i) => i.valor));
    const gw = (x1 - x0) / itens.length, bw = Math.min(24, gw - 6);
    let s = `<svg class="graf vertical" viewBox="0 0 ${W} ${H}" role="img">`;
    itens.forEach((it, i) => {
      const cx = x0 + gw * i + gw / 2, h = (it.valor / max) * (base - top);
      s += `<rect x="${cx - gw / 2}" y="${top}" width="${gw}" height="${base - top}" fill="transparent" data-tip="${esc(it.tip || it.rotulo + ': ' + fmt(it.valor))}"/>`;
      s += barraV(cx - bw / 2, base, bw, h, it.cor || cor, it.tip || `${it.rotulo}: ${fmt(it.valor)}`);
      s += `<text x="${cx}" y="${base - h - 4}" text-anchor="middle" class="g-val">${fmt(it.valor)}</text>`;
      s += `<text x="${cx}" y="${base + 16}" text-anchor="middle" class="g-eixo">${esc(it.rotulo)}</text>`;
    });
    s += `<line x1="${x0}" x2="${x1}" y1="${base}" y2="${base}" stroke="${COR.eixo}"/>`;
    return s + '</svg>';
  }

  // ---------- 7. Disco (rosca) de andamento ----------
  // segs: [{rotulo, valor, cor}] · centro: texto grande · sub: texto pequeno
  // tamanho em px; mini=true desenha só o anel (sem textos)
  function rosca(segs, { centro = '', sub = '', tamanho = 132, mini = false, espessura } = {}) {
    const S = 100, c = S / 2, esp = espessura || (mini ? 16 : 13), r = c - esp / 2 - 1;
    const total = segs.reduce((a, b) => a + b.valor, 0);
    const vis = segs.filter((g) => g.valor > 0);
    const circ = 2 * Math.PI * r, gap = vis.length > 1 ? 1.6 : 0;
    let s = `<svg class="graf rosca${mini ? ' mini' : ''}" viewBox="0 0 ${S} ${S}" width="${tamanho}" height="${tamanho}" role="img" aria-label="${esc(sub ? centro + ' ' + sub : centro)}">`;
    s += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(158,171,198,.16)" stroke-width="${esp}"/>`;
    let ac = 0;
    if (total > 0) vis.forEach((g) => {
      const parte = (g.valor / total) * circ;
      const len = Math.max(parte - gap, 0.8);
      s += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${g.cor}" stroke-width="${esp}" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-ac).toFixed(2)}" transform="rotate(-90 ${c} ${c})" data-tip="${esc(g.rotulo)}: ${fmt(g.valor)} (${Math.round(g.valor / total * 100)}%)"/>`;
      ac += parte;
    });
    if (!mini) {
      s += `<text x="${c}" y="${sub ? c + 2 : c + 7}" text-anchor="middle" class="r-centro">${esc(centro)}</text>`;
      if (sub) s += `<text x="${c}" y="${c + 16}" text-anchor="middle" class="r-sub">${esc(sub)}</text>`;
    }
    return s + '</svg>';
  }

  function legenda(itens) {
    return '<div class="g-legenda">' + itens.map((i) => `<span><i style="background:${i.cor}"></i>${esc(i.rotulo)}</span>`).join('') + '</div>';
  }

  // ---------- Dica flutuante (hover/toque) ----------
  let dica = null;
  function mostrar(e) {
    const alvo = e.target.closest && e.target.closest('[data-tip]');
    if (!alvo || !alvo.closest('svg.graf')) { if (dica) dica.classList.remove('vis'); return; }
    if (!dica) { dica = document.createElement('div'); dica.className = 'g-dica'; document.body.appendChild(dica); }
    dica.textContent = alvo.getAttribute('data-tip');
    dica.classList.add('vis');
    const x = Math.min(window.innerWidth - dica.offsetWidth - 8, Math.max(8, e.clientX - dica.offsetWidth / 2));
    dica.style.left = x + 'px';
    dica.style.top = Math.max(8, e.clientY - dica.offsetHeight - 14) + 'px';
  }
  document.addEventListener('pointermove', mostrar);
  document.addEventListener('pointerdown', mostrar);
  document.addEventListener('scroll', () => dica && dica.classList.remove('vis'), true);

  window.Graficos = { rosca, bullet, barrasH, colunasAgrupadas, linha, pilha100, colunas, legenda, COR, fmt };
})();
