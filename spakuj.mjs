#!/usr/bin/env node
// Buduje paczkę .plugin do wgrania w Customize → Plugins (Cowork, ticket 04).
// Paczka to zip zatwierdzonego stanu repo plus token, który w Coworku nie ma
// innej drogi do kontenera niż ta paczka (ADR 0001).
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
fs.copyFileSync(zrodloTokenu, token);
try {
  execFileSync('git', ['archive', '--format=zip', `--add-file=${token}`, '-o', wyjscie, 'HEAD'], {
    cwd: korzen,
    stdio: 'pipe',
  });
} finally {
  fs.rmSync(token, { force: true });
}

console.log(wyjscie);
