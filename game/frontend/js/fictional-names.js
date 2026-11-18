/*
 * Soccer Manager — nomes fictícios.
 *
 * O jogo não possui licença de clubes, ligas ou jogadores. Por isso todos os
 * nomes exibidos são variações fictícias (estilo "Yuri Alberto" → "Yuri Aberdo").
 *
 * - FN.person(nome)  → variação determinística de um nome de pessoa.
 * - FN.clubName(nome) → variação genérica para clubes sem nome definido à mão.
 * - FN.CLUBS[id]     → [nome, sigla, estádio] definidos à mão para os clubes jogáveis.
 * - FN.COMPETITIONS  → nomes fictícios das competições.
 *
 * O mesmo arquivo é usado pelo script tools/fictionalize.js (Node) e pelo jogo
 * (navegador), para migrar saves antigos com o mesmo resultado.
 */
(function (root) {
  'use strict';

  const CLUBS = {
    // Série A
    athletico: ['Atlético Paranista', 'APR', 'Arena do Baixio'],
    atletico_mg: ['Atlético Minério', 'AMN', 'Arena Minério'],
    bahia: ['Baía FC', 'BAI', 'Arena Fonte Velha'],
    botafogo: ['Botafuego', 'BTF', 'Estádio Milton Santana'],
    chapecoense: ['Chapecó EC', 'CHP', 'Arena Kondá'],
    corinthians: ['Corintianos', 'COR', 'Arena Itaquerense'],
    coritiba: ['Curitibano', 'CUR', 'Couto Pereiro'],
    cruzeiro: ['Cruzador EC', 'CRZ', 'Mineiraço'],
    flamengo: ['Flamenco', 'FLC', 'Maracaná'],
    fluminense: ['Flumineiro', 'FLU', 'Maracaná'],
    gremio: ['Grênio', 'GRN', 'Arena do Grênio'],
    internacional: ['Inter Gaúcho', 'ING', 'Beira-Lago'],
    mirassol: ['Mirasolense', 'MIR', 'José Mário de Campos'],
    palmeiras: ['Palmares', 'PLM', 'Arena Palestra'],
    bragantino: ['Bragança Touros', 'BRT', 'Cícero de Sousa'],
    remo: ['Remadores', 'REM', 'Mangueiral'],
    santos: ['Santista FC', 'SAN', 'Vila Belmira'],
    sao_paulo: ['São Paulino', 'SPL', 'Morumbá'],
    vasco: ['Vasca da Gama', 'VAS', 'São Janeiro'],
    vitoria: ['Vitorioso', 'VIT', 'Barrancão'],
    // Série B
    america_mg: ['Américo MG', 'AMG', 'Independente'],
    athletic: ['Atlética São João', 'ASJ', 'Arena del-Rei'],
    atletico_go: ['Atlético Goianense', 'AGO', 'Antônio Aciolli'],
    avai: ['Avaiense', 'AVA', 'Ressaca'],
    botafogo_sp: ['Botafuego SP', 'BSP', 'Arena Ribeirão'],
    ceara: ['Cearense SC', 'CEA', 'Arena Castelo'],
    crb: ['CR Alagoano', 'CRA', 'Estádio Rei Alagoano'],
    criciuma: ['Criciumense', 'CRI', 'Heriberto Hulso'],
    cuiaba: ['Cuiabano', 'CUI', 'Arena Pantaneira'],
    fortaleza: ['Fortalezense', 'FTZ', 'Arena Castelo'],
    goias: ['Goiano EC', 'GOI', 'Serrinhas'],
    juventude: ['Juventino', 'JUV', 'Alfredo Jacone'],
    londrina: ['Londrinense', 'LON', 'Estádio do Cafezal'],
    nautico: ['Náutica PE', 'NAU', 'Aflitas'],
    novorizontino: ['Novo Horizonte', 'NHZ', 'Jorge Ismar de Biase'],
    operario: ['Operários PR', 'OPE', 'Germano Krieger'],
    ponte_preta: ['Ponte Negra', 'PNG', 'Moisés Lucarello'],
    sao_bernardo: ['São Bernardino', 'SBD', 'Primeiro de Março'],
    sport: ['Esporte Recife', 'ESR', 'Ilha do Recreio'],
    vila_nova: ['Vila Novense', 'VNO', 'Onésio Alvarenga Brasil'],
    // Convidados sul-americanos
    boca: ['Boca Juvenil', 'BOJ', ''],
    river: ['Ribera Plata', 'RPL', ''],
    racing: ['Rácin Club', 'RAC', ''],
    estudiantes: ['Estudiantil', 'ETL', ''],
    penarol: ['Peñarolo', 'PNO', ''],
    nacional: ['Nacionale', 'NAL', ''],
    ldu: ['Liga Quiteña', 'LQT', ''],
    idv: ['Independente do Vale', 'IDV', ''],
    // Liga Inglesa
    pl_arsenal: ['Arsenol FC', 'ASN', 'Emerald Stadium'],
    pl_astonvilla: ['Aston Vila', 'ASV', 'Vale Park'],
    pl_bournemouth: ['AFC Bornemouth', 'BOR', 'Vitalis Stadium'],
    pl_brentford: ['Brentvord', 'BRV', 'Brentvord Community Stadium'],
    pl_brighton: ['Brigton Albion', 'BGA', 'Amax Stadium'],
    pl_chelsea: ['Chelsia', 'CHL', 'Stanford Bridge'],
    pl_coventry: ['Coventri City', 'COV', 'Coventri Arena'],
    pl_palace: ['Cristal Palace', 'CPL', 'Selhorst Park'],
    pl_everton: ['Everdon', 'EVD', 'Bramley Dock Stadium'],
    pl_fulham: ['Fullam FC', 'FLM', 'Cravel Cottage'],
    pl_hull: ['Hul City', 'HCT', 'Humber Stadium'],
    pl_ipswich: ['Ipsvich Town', 'IPV', 'Portland Road'],
    pl_leeds: ['Leads United', 'LDS', 'Eland Road'],
    pl_liverpool: ['Liverpul', 'LVP', 'Annfield'],
    pl_mancity: ['Manchester Celeste', 'MCE', 'Citizens Stadium'],
    pl_manunited: ['Manchester Rubra', 'MRU', 'Old Stratford'],
    pl_newcastle: ['Newcastel United', 'NWC', 'St Jarvis Park'],
    pl_forest: ['Notingam Forest', 'NTF', 'Trent Ground'],
    pl_sunderland: ['Sunderlend', 'SDL', 'Stadium of Lights'],
    pl_tottenham: ['Totenham Hotspurs', 'TTH', 'Totenham Arena'],
    // Liga Espanhola
    ll_athletic: ['Atlétic Bilbo', 'ABL', 'San Mameu'],
    ll_atletico: ['Atlético Madrileño', 'AMD', 'Metropolitán'],
    ll_osasuna: ['CA Osasune', 'OSS', 'El Sadal'],
    ll_celta: ['Celtia Vigo', 'CTV', 'Balaides'],
    ll_alaves: ['Deportivo Alabés', 'ALB', 'Mendizorra'],
    ll_elche: ['Elxe CF', 'ELX', 'Martín Valera'],
    ll_barcelona: ['CF Barselona', 'BRS', 'Camp Nouet'],
    ll_getafe: ['Getafo CF', 'GTF', 'Coliseo Sur'],
    ll_levante: ['Levanto UD', 'LVT', 'Ciutat del Llevant'],
    ll_malaga: ['Malagueño CF', 'MLG', 'La Rosaleta'],
    ll_racing: ['Rácing Cantabria', 'RCA', 'El Sardinal'],
    ll_rayo: ['Raio Vallecano', 'RVA', 'Valecas'],
    ll_deportivo: ['RC Deportivo Coruñés', 'DCR', 'Riazar'],
    ll_espanyol: ['RCD Espanyolo', 'ESY', 'Cornellà Arena'],
    ll_betis: ['Real Bétic', 'RBT', 'Benito Villamar'],
    ll_realmadrid: ['Real Madri', 'RMD', 'Santiago Bernabel'],
    ll_sociedad: ['Real Sociedade', 'RSD', 'Anoeta Arena'],
    ll_sevilla: ['Sevilha FC', 'SVH', 'Ramón Sánchez-Pijuán'],
    ll_valencia: ['Valença CF', 'VLC', 'Mestala'],
    ll_villarreal: ['Vilareal CF', 'VLR', 'Estadio Cerámico'],
  };

  // Ordem importa: nomes mais longos primeiro.
  const COMPETITIONS = [
    ['CONMEBOL Sul-Americana', 'Copa Sul-Continental'],
    ['CONMEBOL Libertadores', 'Taça Continental'],
    ['Brasileirão Série A', 'Liga Nacional Série A'],
    ['Brasileirão Série B', 'Liga Nacional Série B'],
    ['LaLiga EA Sports', 'Liga Espanhola'],
    ['Premier League', 'Liga Inglesa'],
    ['Copa do Brasil', 'Copa Nacional'],
    ['Sul-Americana', 'Sul-Continental'],
    ['Libertadores', 'Taça Continental'],
    ['Brasileirão', 'Liga Nacional'],
    ['LaLiga', 'Liga Espanhola'],
  ];

  const VOWELS = 'aeiouáàâãéêíóôõúü';
  const isV = (c) => !!c && VOWELS.includes(c);
  const isC = (c) => !!c && /[a-zçñ]/.test(c) && !isV(c);
  const KEEP = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'y', 'van', 'von', 'der', 'den', 'di', 'del', 'la', 'le', 'el', 'dal', 'ter', 'mac', 'jr', 'jr.', 'junior', 'júnior', 'filho', 'neto', 'sobrinho', 'fc', 'cf', 'sc', 'ec', 'club', 'clube', 'city', 'united', 'deportivo', 'atlético', 'real', 'sporting', 'academia', 'de', 'river', 'san', 'são', 'santa', 'central', 'independiente']);
  const BAD = ['puta', 'merd', 'caral', 'porr', 'bucet', 'bost', 'viad', 'cuzã', 'pint', 'rola', 'foda', 'fod', 'cag', 'mij', 'peid', 'xot', 'shit', 'fuck', 'cunt', 'nazi'];

  function hash(str) {
    let x = 2166136261;
    for (const ch of str) { x ^= ch.codePointAt(0); x = Math.imul(x, 16777619); }
    return x >>> 0;
  }
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  const VOICE = { t: 'd', d: 't', p: 'b', b: 'p', f: 'v', v: 'f', k: 'c', m: 'n', n: 'm', s: 'z', z: 's' };
  const SHIFT = { e: 'i', i: 'e', o: 'u', u: 'o', a: 'e', é: 'ê', ê: 'é', ó: 'ô', ô: 'ó' };

  // Cada regra recebe a palavra em minúsculas e devolve uma lista de variações possíveis.
  const RULES = {
    voice(w) {
      const out = [];
      for (let i = 1; i < w.length; i++) {
        const c = w[i], nx = w[i + 1], pv = w[i - 1];
        if ((c === 'm' || c === 'n') && !(isV(pv) && isV(nx))) continue;
        if ((c === 's' || c === 'z') && !(isV(pv) && isV(nx))) continue;
        if (c === 'c' && 'aou'.includes(nx || '-') && pv !== 's') out.push(w.slice(0, i) + 'g' + w.slice(i + 1));
        else if (c === 'g' && 'aou'.includes(nx || '-')) out.push(w.slice(0, i) + 'c' + w.slice(i + 1));
        else if (VOICE[c] && w[i + 1] !== c && pv !== c) out.push(w.slice(0, i) + VOICE[c] + w.slice(i + 1));
      }
      return out;
    },
    dropLiquid(w) {
      const out = [];
      for (let i = 1; i < w.length - 1; i++) if ('lrn'.includes(w[i]) && isV(w[i - 1]) && isC(w[i + 1]) && w[i + 1] !== 'h') out.push(w.slice(0, i) + w.slice(i + 1));
      return out;
    },
    vowelSwap(w) {
      const pos = [];
      for (let i = 1; i < w.length; i++) if (isV(w[i]) && !isV(w[i - 1]) && !isV(w[i + 1])) pos.push(i);
      const out = [];
      for (let a = 0; a < pos.length; a++) for (let b = a + 1; b < pos.length; b++) {
        const i = pos[a], j = pos[b];
        if (w[i] === w[j]) continue;
        out.push(w.slice(0, i) + w[j] + w.slice(i + 1, j) + w[i] + w.slice(j + 1));
      }
      return out;
    },
    vowelShift(w) {
      const out = [];
      for (let i = 1; i < w.length; i++) if (SHIFT[w[i]] && !(w[i] === 'u' && w[i - 1] === 'q') && !(w[i] === 'a' && i !== w.length - 1)) out.push(w.slice(0, i) + SHIFT[w[i]] + w.slice(i + 1));
      return out;
    },
    doubling(w) {
      const out = [];
      for (let i = 1; i < w.length - 1; i++) {
        if (w[i] === w[i + 1] && isC(w[i])) out.push(w.slice(0, i) + w.slice(i + 1));
        else if ('lrtsn'.includes(w[i]) && isV(w[i - 1]) && isV(w[i + 1])) out.push(w.slice(0, i) + w[i] + w.slice(i));
      }
      return out;
    },
    spelling(w) {
      const out = [];
      const subs = [['ph', 'f'], ['th', 't'], ['ck', 'k'], ['w', 'v'], ['y', 'i'], ['k', 'c'], ['qu', 'k'], ['ch', 'x'], ['ss', 'ç'], ['ll', 'lh'], ['nh', 'ñ'], ['x', 'ks'], ['ç', 'ss']];
      for (const [a, b] of subs) { const i = w.indexOf(a, 1); if (i > 0) out.push(w.slice(0, i) + b + w.slice(i + a.length)); }
      if (w[0] === 'y') out.push('i' + w.slice(1));
      else if (w[0] === 'i' && isV(w[1])) out.push('y' + w.slice(1));
      if (w[0] === 'k') out.push('c' + w.slice(1));
      if (w[0] === 'w') out.push('v' + w.slice(1));
      return out;
    },
  };
  const RULE_ORDER = ['voice', 'dropLiquid', 'vowelSwap', 'vowelShift', 'doubling', 'spelling'];

  function clean(w) { const l = w.toLowerCase(); return !BAD.some((b) => l.includes(b)); }

  function mutateLower(w, r, times) {
    let cur = w;
    const used = new Set();
    for (let t = 0; t < times; t++) {
      const options = RULE_ORDER.filter((k) => !used.has(k)).map((k) => [k, RULES[k](cur).filter(clean)]).filter(([, v]) => v.length);
      if (!options.length) break;
      const [k, vs] = pick(r, options);
      used.add(k);
      cur = pick(r, vs);
    }
    if (cur === w) { const vs = RULES.vowelShift(w).concat(RULES.doubling(w)).filter(clean); if (vs.length) cur = pick(r, vs); else cur = w + (isV(w[w.length - 1]) ? 's' : 'o'); }
    return cur;
  }

  function restoreCase(orig, low) {
    if (orig === orig.toUpperCase() && orig.length > 1) return low.toUpperCase();
    return orig[0] === orig[0].toUpperCase() ? low[0].toUpperCase() + low.slice(1) : low;
  }

  function mutateWord(word, r, strength) {
    if (word.includes('-')) return word.split('-').map((p) => mutateWord(p, r, strength)).join('-');
    const m = word.match(/^([^A-Za-zÀ-ÿ]*)([A-Za-zÀ-ÿ'’]+)([^A-Za-zÀ-ÿ]*)$/);
    if (!m) return word;
    const [, pre, core, post] = m;
    const low = core.toLowerCase();
    if (low.length <= 2 || KEEP.has(low) || /['’]/.test(low)) return word;
    const times = strength === 'light' ? 1 : low.length >= 6 ? 2 : 1;
    return pre + restoreCase(core, mutateLower(low, r, times)) + post;
  }

  /** Variação fictícia e determinística de um nome de pessoa. */
  function person(name) {
    if (!name || typeof name !== 'string') return name;
    const r = rng(hash('p:' + name));
    const words = name.split(' ');
    if (words.length === 1) return mutateWord(words[0], r, 'full');
    // Primeiro nome muda às vezes (leve); sobrenomes sempre mudam.
    const out = words.map((w, i) => (i === 0 ? (r() < 0.3 ? mutateWord(w, r, 'light') : w) : mutateWord(w, r, 'full')));
    let res = out.join(' ');
    if (res === name) res = words.map((w) => mutateWord(w, r, 'full')).join(' ');
    return res;
  }

  /** Variação genérica para clubes sem nome definido à mão (ex.: grupos continentais). */
  function clubName(name) {
    if (!name || typeof name !== 'string') return name;
    const r = rng(hash('c:' + name));
    const res = name.split(' ').map((w) => mutateWord(w, r, 'light')).join(' ');
    return res === name ? name.split(' ').map((w) => mutateWord(w, r, 'full')).join(' ') : res;
  }

  function competition(text) {
    if (typeof text !== 'string') return text;
    let out = text;
    for (const [a, b] of COMPETITIONS) out = out.split(a).join(b);
    return out;
  }

  const api = { CLUBS, COMPETITIONS, person, clubName, competition, hash };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FN = api;
})(typeof window !== 'undefined' ? window : globalThis);
