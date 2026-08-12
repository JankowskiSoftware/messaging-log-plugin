// Rozmowy z Codeksa: żaden hak ich nie złapie, bo Codex haków nie ma, więc czyta
// je z dysku zadanie godzinowe. Trafiają do tych samych plików per sesja i tego
// samego schematu co rozmowy Claude'a — odczyt zna jeden format.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transkryptNaRekordy, odZnacznika } from './filtr.mjs';
import { sciezkaSesji, ostatniUuid, znajdzSciezkeSesji } from './sesja.mjs';

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
    const rekordy = transkryptNaRekordy(fs.readFileSync(rollout, 'utf8'), 'codex');
    // bez identyfikatora sesji nie ma jak nazwać pliku ani wznowić — plik zostaje
    if (!rekordy.length || !rekordy[0].sesja) continue;

    const wzgledna = znajdzSciezkeSesji(klon, rekordy[0].sesja) ?? sciezkaSesji(rekordy[0]);
    const docelowy = path.join(klon, wzgledna);
    let odUuid;
    try {
      odUuid = ostatniUuid(fs.readFileSync(docelowy, 'utf8'));
    } catch {
      // pierwszy przebieg tej sesji — zapis od początku
    }

    const nowe = odZnacznika(rekordy, odUuid);
    if (!nowe.length) continue;
    fs.mkdirSync(path.dirname(docelowy), { recursive: true });
    fs.appendFileSync(docelowy, nowe.map(r => JSON.stringify(r)).join('\n') + '\n');
    dopisane.push(wzgledna);
  }
  return dopisane;
}
