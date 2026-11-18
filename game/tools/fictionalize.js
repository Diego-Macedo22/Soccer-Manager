#!/usr/bin/env node
/*
 * Troca nomes reais de clubes, estádios, competições e jogadores por nomes
 * fictícios em frontend/js/app.js, usando frontend/js/fictional-names.js.
 *
 * Uso:  node tools/fictionalize.js            (reescreve app.js)
 *       node tools/fictionalize.js --dry-run  (só mostra o relatório)
 *
 * Idempotente na prática: rodar de novo sobre nomes já fictícios gera outra
 * variação, então rode apenas uma vez sobre a base real.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const FN = require('../frontend/js/fictional-names.js');

const APP = path.resolve(__dirname, '../frontend/js/app.js');
const dry = process.argv.includes('--dry-run');
let src = fs.readFileSync(APP, 'utf8');

/** Localiza o valor literal de `const NAME=` (do primeiro caractere ao fechamento). */
function valueSpan(text, name) {
  const decl = 'const ' + name + '=';
  const i = text.indexOf(decl);
  if (i < 0) throw new Error('Constante não encontrada: ' + name);
  let j = i + decl.length;
  while (/\s/.test(text[j])) j++;
  let depth = 0, q = null;
  for (let k = j; k < text.length; k++) {
    const c = text[k];
    if (q) { if (c === '\\') { k++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if ('[{('.includes(c)) depth++;
    else if (']})'.includes(c)) { depth--; if (depth === 0) return [j, k + 1]; }
  }
  throw new Error('Fim não encontrado: ' + name);
}
const read = (name) => { const [a, b] = valueSpan(src, name); return Function('"use strict";return (' + src.slice(a, b) + ')')(); };
function write(name, value, pretty) {
  const [a, b] = valueSpan(src, name);
  const json = pretty ? pretty(value) : JSON.stringify(value);
  src = src.slice(0, a) + json + src.slice(b);
}

const playerMap = new Map();
const P = (n) => { if (!playerMap.has(n)) playerMap.set(n, FN.person(n)); return playerMap.get(n); };
const clubById = {};
const realClubToId = new Map();
const realStadiums = new Set();

// ---- BASE_DATA (clubes brasileiros + convidados, elencos brasileiros)
const base = read('BASE_DATA');
for (const c of base.clubs) {
  realClubToId.set(c.name, c.id);
  const f = FN.CLUBS[c.id];
  if (!f) throw new Error('Sem nome fictício para ' + c.id);
  c.name = f[0]; c.abbr = f[1];
  clubById[c.id] = f;
}
for (const id of Object.keys(base.rosters)) base.rosters[id].forEach((p) => { p.name = P(p.name); });
write('BASE_DATA', base);

// ---- Elencos detalhados da v0.4
const cor = read('V04_CORINTHIANS'); cor.forEach((p) => { p.name = P(p.name); });
write('V04_CORINTHIANS', cor, (v) => '[\n ' + v.map((x) => JSON.stringify(x)).join(',\n ') + '\n]');
const extra = read('V04_EXTRA_ROSTERS');
for (const id of Object.keys(extra)) extra[id].forEach((p) => { p.name = P(p.name); });
write('V04_EXTRA_ROSTERS', extra, (v) => '{\n' + Object.entries(v).map(([k, arr]) => ' ' + JSON.stringify(k) + ':[\n  ' + arr.map((x) => JSON.stringify(x)).join(',\n  ') + '\n ]').join(',\n') + '\n}');

// ---- Estádios brasileiros
const st = read('V04_STADIUMS');
for (const id of Object.keys(st)) { realStadiums.add(st[id][0]); if (FN.CLUBS[id]?.[2]) st[id][0] = FN.CLUBS[id][2]; }
write('V04_STADIUMS', st, (v) => '{\n ' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ':' + JSON.stringify(x)).join(',\n ') + '\n}');

// ---- Clubes da Liga Inglesa e Espanhola
const foreign = read('V05_FOREIGN_CLUBS');
for (const c of foreign) {
  if (c[0] === 'free_agents') continue;
  realClubToId.set(c[1], c[0]); realStadiums.add(c[9]);
  const f = FN.CLUBS[c[0]];
  if (!f) throw new Error('Sem nome fictício para ' + c[0]);
  c[1] = f[0]; c[2] = f[1]; c[9] = f[2];
  clubById[c[0]] = f;
}
write('V05_FOREIGN_CLUBS', foreign, (v) => '[\n ' + v.map((x) => JSON.stringify(x)).join(',\n ') + '\n]');

// ---- Elencos europeus (strings separadas por |)
for (const name of ['V05_PL_ROSTERS', 'V05_LL_ROSTERS']) {
  const r = read(name);
  for (const id of Object.keys(r)) r[id] = r[id].split('|').map((n) => (n ? P(n) : n)).join('|');
  write(name, r, (v) => '{\n ' + Object.entries(v).map(([k, x]) => k + ':' + JSON.stringify(x)).join(',\n ') + '\n}');
}

// ---- Agentes livres
const free = read('V05_FREE_AGENTS'); free.forEach((p) => { p.name = P(p.name); });
write('V05_FREE_AGENTS', free, (v) => '[\n ' + v.map((x) => JSON.stringify(x)).join(',\n ') + '\n]');

// ---- Tabelas indexadas por nome de jogador
for (const name of ['V05_STAR_OVR', 'V05_KNOWN_POS', 'V05_AGE_FIX', 'AGE_FIXES', 'V05_NAT']) {
  const obj = read(name), out = {};
  for (const [k, v] of Object.entries(obj)) out[P(k)] = v;
  write(name, out, name === 'V05_KNOWN_POS' || name === 'V05_NAT' ? (v) => '{\n ' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ':' + JSON.stringify(x)).join(',') + '\n}' : null);
}

// ---- Grupos continentais (nomes curtos de clubes)
const ALIASES = { 'Vasco': 'vasco', 'Red Bull Bragantino': 'bragantino', 'Racing': 'racing', 'River Plate': 'river', 'Atlético Mineiro': 'atletico_mg', 'São Paulo': 'sao_paulo', 'Santos': 'santos', 'Botafogo': 'botafogo', 'Grêmio': 'gremio' };
const clubLabel = (n) => { const id = ALIASES[n] || realClubToId.get(n); return id && FN.CLUBS[id] ? FN.CLUBS[id][0] : FN.clubName(n); };
const sula = read('V05_SULA_GROUPS');
for (const g of Object.keys(sula)) sula[g] = sula[g].map(clubLabel);
write('V05_SULA_GROUPS', sula);

// ---- Literais restantes no código ('...' e "..."): nomes exatos de clubes/jogadores
const clubNames = new Map([...realClubToId.entries()].map(([n, id]) => [n, FN.CLUBS[id][0]]));
for (const [n, id] of Object.entries(ALIASES)) clubNames.set(n, FN.CLUBS[id][0]);
let literalHits = 0;
src = src.replace(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g, (m, a, b) => {
  const s = a !== undefined ? a : b, q = a !== undefined ? "'" : '"';
  let r = null;
  if (clubNames.has(s)) r = clubNames.get(s);
  else if (playerMap.has(s)) r = playerMap.get(s);
  if (r === null) return m;
  literalHits++;
  return q + r.replace(new RegExp(q, 'g'), '\\' + q) + q;
});

// ---- Nomes de competições (texto livre, inclusive templates)
const beforeComp = src;
src = FN.competition(src);

// ---- Relatório
const fakes = [...playerMap.values()];
const dupes = fakes.filter((v, i) => fakes.indexOf(v) !== i);
const unchanged = [...playerMap.entries()].filter(([a, b]) => a === b).map(([a]) => a);
const leftovers = [];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const n of [...clubNames.keys(), ...realStadiums, ...[...playerMap.keys()].filter((n) => n.length >= 5)]) {
  if (!n || n === '—') continue;
  const re = new RegExp('(^|[^\\wÀ-ÿ])' + escapeRe(n) + '(?=$|[^\\wÀ-ÿ])');
  if (re.test(src)) leftovers.push(n);
}
console.log(`Jogadores renomeados: ${playerMap.size}`);
console.log(`Clubes renomeados: ${Object.keys(clubById).length}`);
console.log(`Literais soltos substituídos: ${literalHits}`);
console.log(`Competições: ${beforeComp === src ? 'nenhuma alteração' : 'renomeadas'}`);
console.log(`Nomes fictícios repetidos: ${dupes.length ? dupes.join(', ') : 'nenhum'}`);
console.log(`Nomes que não mudaram: ${unchanged.length ? unchanged.join(', ') : 'nenhum'}`);
console.log(`Nomes reais que ainda aparecem no código: ${leftovers.length ? leftovers.join(', ') : 'nenhum'}`);

if (!dry) { fs.writeFileSync(APP, src); console.log('app.js atualizado.'); }
