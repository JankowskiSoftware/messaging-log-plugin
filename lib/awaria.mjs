// Trwały ślad nieudanej tury haka. Leży w katalogu domowym, a nie w klonie, bo
// najgorszy przypadek to właśnie klon, do którego nie da się pisać.
//
// Wyjście haka asynchronicznego nie dociera do Michała, więc ślad czyta osobny
// hak synchroniczny (hooks/ostrzezenie.mjs) i to on pokazuje ostrzeżenie.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SLAD = path.join(os.homedir(), '.messaging-log-awaria');

/**
 * @param {string} powod bez tokenu — wycieranie należy do wołającego
 * @param {boolean} odzyskiwalne czy praca czeka zatwierdzona lokalnie i dojdzie sama
 */
export function oznaczAwarie(powod, odzyskiwalne) {
  try {
    fs.writeFileSync(SLAD, JSON.stringify({ czas: new Date().toISOString(), powod, odzyskiwalne }) + '\n');
  } catch {
    // magazyn nie przyjmuje nawet śladu — zostaje strumień błędów, żeby awaria nie zniknęła
    process.stderr.write(`messaging-log: ${powod}\n`);
  }
}

/**
 * Kasuje ślad wyłącznie wtedy, gdy reprezentowana przez niego praca naprawdę doszła.
 * Trwała awaria (nieudany zapis lokalny) nie ma czego dogonić, więc czeka na decyzję.
 */
export function odznaczAwarie() {
  try {
    if (JSON.parse(fs.readFileSync(SLAD, 'utf8')).odzyskiwalne === false) return;
  } catch {
    // brak śladu albo ślad uszkodzony — kasowanie i tak jest bezpieczne
  }
  fs.rmSync(SLAD, { force: true });
}
