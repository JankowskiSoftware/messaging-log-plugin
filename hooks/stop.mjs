#!/usr/bin/env node
// Hak Stop, uruchamiany po każdej turze: transkrypt tej sesji → nowe rekordy →
// plik sesji w klonie → zatwierdzenie → wypchnięcie.
// Nic nowego = koniec bez dotykania gita. Cokolwiek pójdzie źle, hak mówi to
// wprost: linia na stderr i kod różny od zera, czyli błąd widać w sesji.

import fs from 'node:fs';
import { transkryptNaRekordy } from '../lib/filtr.mjs';
import { dopiszRekordy } from '../lib/sesja.mjs';
import { KLON, git, dziennik, wytrzyj, zapewnijKlon, zajmijZamek, zwolnijZamek, pobierz, wypchnij } from '../lib/klon.mjs';

const zapisz = dziennik('.messaging-log-hak.log');

// Hak chodzi z flagą async, żeby nie doklejać sekundy do końca każdej tury.
// Claude Code wyrzuca wtedy wynik haka do kosza, więc powód awarii musi zostać
// na dysku: najpierw dziennik ~/.messaging-log-hak.log, dopiero potem stderr
// i kod 1 — te dwa są dla uruchomienia wprost (testy, ręczne wywołanie).
function zglos(powod) {
  zapisz(powod);
  process.exitCode = 1;
  console.error(`messaging-log: ${wytrzyj(powod)}`);
}

function main() {
  // sesja odpalona przez nasze własne skrypty (opisz w przebieg.mjs) nie jest rozmową —
  // wyjście przed jakimkolwiek dotknięciem gita i klonu
  if (process.env.MESSAGING_LOG_WEWNETRZNE) return;

  const wejscie = JSON.parse(fs.readFileSync(0, 'utf8'));
  const sesja = wejscie.session_id;
  const transkrypt = wejscie.transcript_path;
  if (!sesja || !transkrypt) return;

  zapewnijKlon();
  if (!zajmijZamek()) return zapisz('zamek zajęty, pomijam turę — dogoni się przy następnej');
  try {
    // znacznik postępu czyta się z lokalnego pliku, więc najpierw dociągamy stan zdalny —
    // klon w tyle (drugi komputer, sesja chmurowa) przepisałby sesję od starego miejsca
    try {
      pobierz();
    } catch (blad) {
      zglos(`pobranie nieudane, piszę na tym, co lokalne: ${blad.stderr || blad.message}`);
    }
    const rekordy = transkryptNaRekordy(fs.readFileSync(transkrypt, 'utf8'), 'claude');
    const wzgledna = dopiszRekordy(KLON, rekordy);
    if (!wzgledna) return;

    git('add', '--', wzgledna);
    git('commit', '-m', `rozmowa ${sesja.slice(0, 8)}`);
    // brak sieci wstrzymuje wypchnięcie, ale nie zapis — zaległość dogoni następna tura
    try {
      wypchnij(zapisz);
    } catch (blad) {
      zglos(`wypchnięcie nieudane, zostaje lokalnie: ${blad.stderr || blad.message}`);
    }
  } finally {
    zwolnijZamek();
  }
}

try {
  main();
} catch (blad) {
  zglos(`hak przerwany: ${blad.stack || blad.message}`);
}
