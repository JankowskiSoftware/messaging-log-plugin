// Umiejscowienie rekordu na dysku: gdzie leży plik sesji i dokąd doszedł zapis.
// Doba i godzina liczone w strefie Europe/Warsaw, bo „dziś" znaczy dziś u Michała.

import fs from 'node:fs';
import path from 'node:path';
import { odZnacznika } from './filtr.mjs';

const FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Doba, godzina i minuta znacznika czasu u Michała. Jedyne miejsce z tą strefą. */
export function czasWarszawski(ts) {
  const cz = Object.fromEntries(FORMAT.formatToParts(new Date(ts)).map(p => [p.type, p.value]));
  return { doba: `${cz.year}-${cz.month}-${cz.day}`, godzina: cz.hour, minuta: cz.minute };
}

/** Ścieżka pliku sesji względem klonu, wyprowadzona z pierwszej zapisanej wymiany. */
export function sciezkaSesji(rekord) {
  const { doba, godzina, minuta } = czasWarszawski(rekord.ts);
  return `rozmowy/${doba}/${godzina}${minuta}-${rekord.repo}-${rekord.sesja.slice(0, 8)}.jsonl`;
}

/** Znacznik postępu: uuid ostatniej linii pliku docelowego. Brak = zapis od początku. */
export function ostatniUuid(tresc) {
  const linie = tresc.split('\n').filter(l => l.trim());
  // przerwany zapis psuje najwyżej ostatnią linię — cofamy się do pierwszej całej,
  // bo brak znacznika oznaczałby przepisanie całej sesji od nowa
  for (let i = linie.length - 1; i >= 0; i--) {
    try {
      const uuid = JSON.parse(linie[i]).uuid;
      if (uuid) return uuid;
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * Plik tej sesji, jeśli już istnieje — kolejne tury dopisują do niego, także po
 * północy, a nazwy nie da się przeliczyć z drugiej tury, bo niesie czas pierwszej.
 */
export function znajdzSciezkeSesji(klon, sesja) {
  const rozmowy = path.join(klon, 'rozmowy');
  const koncowka = `-${sesja.slice(0, 8)}.jsonl`;
  let doby;
  try {
    doby = fs.readdirSync(rozmowy).sort().reverse();
  } catch {
    return undefined;
  }
  for (const doba of doby) {
    let pliki;
    try {
      pliki = fs.readdirSync(path.join(rozmowy, doba));
    } catch {
      continue;
    }
    const plik = pliki.find(p => p.endsWith(koncowka));
    if (plik) return `rozmowy/${doba}/${plik}`;
  }
  return undefined;
}

/**
 * Jedyny zapis rozmowy do klonu — wołają go hak sesyjny i pierwszy przebieg. Dwie ścieżki zapisu dałyby dwa formaty w jednym katalogu.
 * Zatwierdzenie zostaje po stronie wołającego, bo to on trzyma zamek.
 * @param {string} klon
 * @param {Array<object>} rekordy całość sesji; już zapisany początek odcina znacznik
 * @returns {string|undefined} ścieżka pliku względem klonu, albo nic nowego
 */
export function dopiszRekordy(klon, rekordy) {
  // bez identyfikatora sesji nie ma jak nazwać pliku ani wznowić — rekordy zostają
  if (!rekordy.length || !rekordy[0].sesja) return undefined;

  const wzgledna = znajdzSciezkeSesji(klon, rekordy[0].sesja) ?? sciezkaSesji(rekordy[0]);
  const docelowy = path.join(klon, wzgledna);
  let odUuid;
  try {
    odUuid = ostatniUuid(fs.readFileSync(docelowy, 'utf8'));
  } catch {
    // pierwszy zapis tej sesji — od początku
  }

  const nowe = odZnacznika(rekordy, odUuid);
  if (!nowe.length) return undefined;
  fs.mkdirSync(path.dirname(docelowy), { recursive: true });
  fs.appendFileSync(docelowy, nowe.map(r => JSON.stringify(r)).join('\n') + '\n');
  return wzgledna;
}
