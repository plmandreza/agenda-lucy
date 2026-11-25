// QR code desenhado aqui mesmo (padrão ISO/IEC 18004, modo byte, correção nível M).
// É o mesmo código da versão em HTML, só que como módulo.
export const QR = (() => {
  const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  const BLOCOS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

  const modulosDeDados = (v) => {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const n = Math.floor(v / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (v >= 7) r -= 36;
    }
    return r;
  };
  const capacidade = (v) => Math.floor(modulosDeDados(v) / 8) - ECC_M[v] * BLOCOS_M[v];

  // Aritmética do campo de Galois GF(256) e Reed-Solomon
  const mult = (x, y) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z;
  };
  const divisor = (grau) => {
    const r = new Array(grau).fill(0); r[grau - 1] = 1;
    let raiz = 1;
    for (let i = 0; i < grau; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = mult(r[j], raiz); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      raiz = mult(raiz, 0x02);
    }
    return r;
  };
  const resto = (dados, div) => {
    const r = new Array(div.length).fill(0);
    for (const b of dados) {
      const f = b ^ r.shift(); r.push(0);
      div.forEach((c, i) => { r[i] ^= mult(c, f); });
    }
    return r;
  };

  function gerar(texto) {
    const bytes = Array.from(new TextEncoder().encode(texto));
    let v = 1;
    for (; v <= 40; v++) {
      const bitsContagem = v <= 9 ? 8 : 16;
      if (4 + bitsContagem + bytes.length * 8 <= capacidade(v) * 8) break;
    }
    if (v > 40) throw new Error('Texto grande demais para QR code');

    // 1) Sequência de bits: modo byte (0100), tamanho, dados, terminador e preenchimento
    const bits = [];
    const por = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
    por(4, 4); por(bytes.length, v <= 9 ? 8 : 16); bytes.forEach((b) => por(b, 8));
    const cap = capacidade(v) * 8;
    por(0, Math.min(4, cap - bits.length));
    por(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) por(pad, 8);
    const dados = [];
    for (let i = 0; i < bits.length; i += 8) dados.push(parseInt(bits.slice(i, i + 8).join(''), 2));

    // 2) Correção de erros e intercalação dos blocos
    const nBlocos = BLOCOS_M[v], eccLen = ECC_M[v];
    const total = Math.floor(modulosDeDados(v) / 8);
    const curtos = nBlocos - (total % nBlocos), tamCurto = Math.floor(total / nBlocos);
    const div = divisor(eccLen), blocos = [];
    for (let i = 0, k = 0; i < nBlocos; i++) {
      const d = dados.slice(k, k + tamCurto - eccLen + (i < curtos ? 0 : 1));
      k += d.length;
      const ecc = resto(d, div);
      if (i < curtos) d.push(0);
      blocos.push(d.concat(ecc));
    }
    const final = [];
    for (let i = 0; i < blocos[0].length; i++) {
      blocos.forEach((b, j) => { if (i !== tamCurto - eccLen || j >= curtos) final.push(b[i]); });
    }

    // 3) Desenho: padrões fixos, dados, máscara
    const tam = v * 4 + 17;
    const mod = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const fixo = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const pinta = (x, y, escuro) => { mod[y][x] = escuro; fixo[y][x] = true; };
    for (let i = 0; i < tam; i++) { pinta(6, i, i % 2 === 0); pinta(i, 6, i % 2 === 0); }
    const localizador = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < tam && y >= 0 && y < tam) pinta(x, y, d !== 2 && d !== 4);
      }
    };
    localizador(3, 3); localizador(tam - 4, 3); localizador(3, tam - 4);
    if (v > 1) {
      const n = Math.floor(v / 7) + 2;
      const passo = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
      const pos = [6];
      for (let p = tam - 7; pos.length < n; p -= passo) pos.splice(1, 0, p);
      pos.forEach((a, i) => pos.forEach((b, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) pinta(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }));
    }
    const formato = (mascara) => {
      const d = (0 << 3) | mascara;  // nível M = 00
      let r = d;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      const bit = (i) => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) pinta(8, i, bit(i));
      pinta(8, 7, bit(6)); pinta(8, 8, bit(7)); pinta(7, 8, bit(8));
      for (let i = 9; i < 15; i++) pinta(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) pinta(tam - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) pinta(8, tam - 15 + i, bit(i));
      pinta(8, tam - 8, true);
    };
    formato(0);  // reserva a área do formato
    if (v >= 7) {
      let r = v;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const b = (v << 12) | r;
      for (let i = 0; i < 18; i++) {
        const e = ((b >>> i) & 1) !== 0, a = tam - 11 + (i % 3), c = Math.floor(i / 3);
        pinta(a, c, e); pinta(c, a, e);
      }
    }
    let i = 0;
    for (let dir = tam - 1; dir >= 1; dir -= 2) {
      if (dir === 6) dir = 5;
      for (let vert = 0; vert < tam; vert++) for (let j = 0; j < 2; j++) {
        const x = dir - j, sobe = ((dir + 1) & 2) === 0, y = sobe ? tam - 1 - vert : vert;
        if (!fixo[y][x] && i < final.length * 8) { mod[y][x] = ((final[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
      }
    }
    const MASCARAS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    const aplica = (m) => { for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (!fixo[y][x] && MASCARAS[m](x, y)) mod[y][x] = !mod[y][x]; };
    // Escolhe a máscara com menos "penalidade" (sequências longas, blocos e desequilíbrio)
    const penalidade = () => {
      let p = 0;
      for (let k = 0; k < 2; k++) for (let a = 0; a < tam; a++) {
        let corr = 1;
        for (let b = 1; b < tam; b++) {
          const atual = k ? mod[b][a] : mod[a][b], ant = k ? mod[b - 1][a] : mod[a][b - 1];
          if (atual === ant) { corr++; if (corr === 5) p += 3; else if (corr > 5) p++; } else corr = 1;
        }
      }
      for (let y = 0; y < tam - 1; y++) for (let x = 0; x < tam - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
      const escuros = mod.flat().filter(Boolean).length;
      p += Math.floor(Math.abs(escuros * 20 - tam * tam * 10) / (tam * tam)) * 10;
      return p;
    };
    let melhor = 0, menor = Infinity;
    for (let m = 0; m < 8; m++) {
      aplica(m); formato(m);
      const pen = penalidade();
      if (pen < menor) { menor = pen; melhor = m; }
      aplica(m);
    }
    aplica(melhor); formato(melhor);
    return mod;
  }

  // Desenha como imagem SVG (com margem branca de 4 módulos, exigida pelo padrão)
  function svg(texto, rotulo = 'QR code') {
    const m = gerar(texto), n = m.length, margem = 4, lado = n + margem * 2;
    let d = '';
    m.forEach((linha, y) => linha.forEach((e, x) => { if (e) d += `M${x + margem},${y + margem}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" role="img" aria-label="${rotulo}"
      shape-rendering="crispEdges"><rect width="${lado}" height="${lado}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  return { gerar, svg };
})();
