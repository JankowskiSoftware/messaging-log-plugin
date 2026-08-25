#!/usr/bin/env node
// Podstawia token do śledzonego setup-cloud.sh i wypisuje gotowy skrypt.
//
//   node chmura.mjs [plik-tokenu] [plik-wyjściowy]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PLACEHOLDER = '__MESSAGING_LOG_TOKEN__';
const zrodloTokenu = path.resolve(process.argv[2] ?? path.join(os.homedir(), '.messaging-log-token'));
const wyjscie = process.argv[3] ? path.resolve(process.argv[3]) : null;
const token = fs.readFileSync(zrodloTokenu, 'utf8').trim();
if (!token) throw new Error(`pusty plik tokenu: ${zrodloTokenu}`);
if (token.includes("'")) throw new Error('token zawiera apostrof');

const szablon = fs.readFileSync(path.join(import.meta.dirname, 'setup-cloud.sh'), 'utf8');
if (szablon.split(PLACEHOLDER).length !== 2) {
  throw new Error('setup-cloud.sh musi mieć dokładnie jeden placeholder tokenu');
}
const skrypt = szablon.replace(PLACEHOLDER, token);

if (wyjscie) fs.writeFileSync(wyjscie, skrypt, { mode: 0o600 });
else process.stdout.write(skrypt);
