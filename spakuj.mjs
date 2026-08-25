#!/usr/bin/env node
// Buduje paczkę .plugin do wgrania w Customize → Plugins (Cowork, ticket 04).
// Paczka zawiera tylko hak Coworka i jego zależności. Lokalne bin/ jest celowo
// pominięte, bo claude.ai odrzuca niewidoczne na ekranie zatwierdzania programy.
//
// Ani token, ani paczka nie dotykają katalogu repo (ADR 0005: repo jest
// publiczne) — token jedzie przez katalog tymczasowy, paczka domyślnie do
// katalogu domowego.
//
//   node spakuj.mjs [wyjście] [plik-tokenu]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const korzen = import.meta.dirname;
const wyjscie = path.resolve(process.argv[2] ?? path.join(os.homedir(), 'messaging-log.plugin'));
const zrodloTokenu = path.resolve(process.argv[3] ?? path.join(os.homedir(), '.messaging-log-token'));

if (!fs.readFileSync(zrodloTokenu, 'utf8').trim()) {
  throw new Error(`pusty plik tokenu: ${zrodloTokenu}`);
}

// git archive kładzie plik spod --add-file pod jego nazwą bazową, więc kopia
// w katalogu tymczasowym musi nazywać się token.txt — hak czyta ../token.txt
const tymczasowy = fs.mkdtempSync(path.join(os.tmpdir(), 'spakuj-'));
const token = path.join(tymczasowy, 'token.txt');
fs.copyFileSync(zrodloTokenu, token);
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
  fs.rmSync(tymczasowy, { recursive: true, force: true });
}

console.log(wyjscie);
