// Trwały ślad nieudanej tury haka. Leży w katalogu domowym, a nie w klonie, bo
// najgorszy przypadek to właśnie klon, do którego nie da się pisać.
//
// Wyjście haka asynchronicznego nie dociera do Michała, więc ślad czyta osobny
// hak synchroniczny (hooks/ostrzezenie.mjs), wpięty raz dla obu hostów.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SLAD = path.join(os.homedir(), '.messaging-log-awaria');

/**
 * Ostrzeżenie do pokazania Michałowi, albo nic, gdy śladu nie ma.
 * Brak śladu to stan normalny; uszkodzony ślad nie ma prawa zablokować tury.
 * @returns {string|undefined}
 */
export function komunikatSladu() {
  let slad;
  try {
    slad = JSON.parse(fs.readFileSync(SLAD, 'utf8'));
  } catch {
    return undefined;
  }
  const ogon = slad.odzyskiwalne
    ? 'zaległość zostanie dostarczona przy najbliższej udanej turze'
    : `rozmowa nie została zapisana; skasuj ${SLAD}, gdy się tym zajmiesz`;
  return `Messaging Log: ${slad.powod} — ${ogon}`;
}

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
