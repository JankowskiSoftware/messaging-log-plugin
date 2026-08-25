#!/usr/bin/env node
// Buduje paczkę .plugin do wgrania w Customize → Plugins (Cowork, ticket 04).
// Paczka zawiera tylko hak Coworka i jego zależności. Lokalne bin/ jest celowo
// pominięte, bo claude.ai odrzuca niewidoczne na ekranie zatwierdzania programy.
//
//   node spakuj.mjs [wyjście] [plik-tokenu]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const korzen = import.meta.dirname;
const wyjscie = path.resolve(process.argv[2] ?? path.join(korzen, 'messaging-log.plugin'));
const zrodloTokenu = path.resolve(process.argv[3] ?? path.join(os.homedir(), '.messaging-log-token'));

if (!fs.readFileSync(zrodloTokenu, 'utf8').trim()) {
  throw new Error(`pusty plik tokenu: ${zrodloTokenu}`);
}

// git archive bierze token spod własnej nazwy — plik jest poza gitem i tak ma zostać
const token = path.join(korzen, 'token.txt');
const tokenJuzNaMiejscu = zrodloTokenu === token;
const poprzedniToken = !tokenJuzNaMiejscu && fs.existsSync(token) ? fs.readFileSync(token) : null;
if (!tokenJuzNaMiejscu) fs.copyFileSync(zrodloTokenu, token);
try {
  execFileSync('git', [
    'archive', '--format=zip', `--add-file=${token}`, '-o', wyjscie, 'HEAD',
    '.claude-plugin/plugin.json',
    'hooks/hooks.json',
    'hooks/stop.mjs',
    'lib/filtr.mjs',
    'lib/klon.mjs',
    'lib/sesja.mjs',
  ], {
    cwd: korzen,
    stdio: 'pipe',
  });
} finally {
  if (!tokenJuzNaMiejscu) {
    if (poprzedniToken) fs.writeFileSync(token, poprzedniToken);
    else fs.rmSync(token, { force: true });
  }
}

console.log(wyjscie);
