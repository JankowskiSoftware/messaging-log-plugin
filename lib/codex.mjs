// Rozmowy z Codeksa: żaden hak ich nie złapie, bo Codex haków nie ma, więc czyta
// je z dysku zadanie godzinowe. Trafiają do tych samych plików per sesja i tego
// samego schematu co rozmowy Claude'a — odczyt zna jeden format.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transkryptNaRekordy } from './filtr.mjs';
import { dopiszRekordy } from './sesja.mjs';

export const KATALOG_CODEKSA = path.join(os.homedir(), '.codex', 'sessions');

/** Rollouty z podanych dób. Katalog jest RRRR/MM/DD, więc wchodzimy wprost —
 *  obchodzenie całości to 83 tysiące plików i 24 GB. */
function* rollouty(katalog, doby) {
  for (const doba of doby) {
    const dzien = path.join(katalog, ...doba.split('-'));
    let pliki;
    try {
      pliki = fs.readdirSync(dzien);
    } catch {
      continue; // doba bez sesji nie ma katalogu
    }
    for (const plik of pliki.filter(p => p.endsWith('.jsonl'))) yield path.join(dzien, plik);
  }
}

/**
 * Dopisuje nowe wymiany Codeksa do plików sesji w klonie. Zatwierdzenie zostaje
 * po stronie wołającego, bo to on trzyma zamek.
 * @returns {string[]} ścieżki dopisanych plików względem klonu
 */
export function dopiszRozmowyCodeksa(katalog, klon, doby) {
  const dopisane = [];
  for (const rollout of rollouty(katalog, doby)) {
    // przebiegi maszynowe odsiewa filtr — pustą listą, zanim cokolwiek powstanie
    const wzgledna = dopiszRekordy(klon, transkryptNaRekordy(fs.readFileSync(rollout, 'utf8'), 'codex'));
    if (wzgledna) dopisane.push(wzgledna);
  }
  return dopisane;
}
