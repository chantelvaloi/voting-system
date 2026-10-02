'use strict';

// Gera data/voters.csv com um código pessoal por votante.
// Uso: node scripts/gerar-codigos.js [--membros 5] [--visitantes 6] [--admins 1] [--force]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const perTeam = opt('membros', 5);
const visitors = opt('visitantes', 6);
const admins = opt('admins', 1);

const file = path.join(__dirname, '..', 'data', 'voters.csv');
if (fs.existsSync(file) && !args.includes('--force')) {
  console.error(`${file} já existe. Use --force para substituir (os votos de códigos removidos deixam de contar).`);
  process.exit(1);
}

// Sem caracteres ambíguos (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const used = new Set();
function newCode() {
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');
  } while (used.has(code));
  used.add(code);
  return code;
}

const rows = [['codigo', 'nome', 'equipa', 'tipo']];
for (let i = 1; i <= admins; i++) rows.push([newCode(), `Administrador ${i}`, '', 'admin']);
for (const team of config.teams) {
  for (let i = 1; i <= perTeam; i++) rows.push([newCode(), `${team.name} - Membro ${i}`, team.name, 'participante']);
}
for (let i = 1; i <= visitors; i++) rows.push([newCode(), `Visitante ${i}`, '', 'visitante']);

const csvField = (v) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n');

console.log(`Gerados ${rows.length - 1} códigos em ${file}`);
console.log('Edite os nomes no ficheiro (pode abrir no Excel) — as alterações são lidas automaticamente.');
console.log(`Código(s) de administrador: ${rows.filter((r) => r[3] === 'admin').map((r) => r[0]).join(', ')}`);
