#!/usr/bin/env node
// Hak Stop, uruchamiany z flagą async po każdej turze: transkrypt tej sesji →
// nowe rekordy → plik sesji w klonie → zatwierdzenie → wypchnięcie.
// Granicą sukcesu jest zapis lokalny, nie wypchnięcie: zaległe zatwierdzenia
// zabiera następna tura, bo `push HEAD:main` niesie je razem z bieżącym.
// Cokolwiek pójdzie źle, hak kończy zerem — tura Michała nigdy nie ma ucierpieć —
// ale zostawia ślad awarii, który przy następnej turze pokaże ostrzezenie.mjs.

import fs from 'node:fs';
import { transkryptNaRekordy } from '../lib/filtr.mjs';
import { dopiszRekordy } from '../lib/sesja.mjs';
import { oznaczAwarie, odznaczAwarie } from '../lib/awaria.mjs';
import { KLON, git, dziennik, wytrzyj, zapewnijKlon, zajmijZamek, zwolnijZamek, pobierz, wypchnij } from '../lib/klon.mjs';

const zapisz = dziennik('.messaging-log-hak.log');
const opis = blad => wytrzyj(blad.stderr || blad.message);

/** Ślad trafia i do dziennika, i do pliku czytanego przez hak ostrzegający. */
function zglos(powod, odzyskiwalne) {
  zapisz(powod);
  oznaczAwarie(powod, odzyskiwalne);
}

function main() {
  // sesja odpalona przez nasze własne skrypty (opisz w przebieg.mjs) nie jest rozmową —
  // wyjście przed jakimkolwiek dotknięciem gita i klonu
  if (process.env.MESSAGING_LOG_WEWNETRZNE) return;

  const wejscie = JSON.parse(fs.readFileSync(0, 'utf8'));
  const sesja = wejscie.session_id;
  const transkrypt = wejscie.transcript_path;
  // bez transkryptu nie ma jak stwierdzić, czy to sesja główna; zgadywanie z treści
  // jest zakazane, więc turę pomijamy i mówimy o tym wprost
  if (!sesja || !transkrypt) return zglos('zdarzenie Stop bez identyfikatora sesji albo ścieżki transkryptu — tura pominięta', false);

  zapewnijKlon();
  if (!zajmijZamek()) return zapisz('zamek zajęty, pomijam turę — dogoni się przy następnej');
  try {
    // znacznik postępu czyta się z lokalnego pliku, więc najpierw dociągamy stan zdalny —
    // klon w tyle (drugi komputer, sesja chmurowa) przepisałby sesję od starego miejsca
    try {
      pobierz();
    } catch (blad) {
      zapisz(`pobranie nieudane, piszę na tym, co lokalne: ${opis(blad)}`);
    }

    let awaria;
    try {
      const rekordy = transkryptNaRekordy(fs.readFileSync(transkrypt, 'utf8'), 'claude');
      const wzgledna = dopiszRekordy(KLON, rekordy);
      if (wzgledna) {
        git('add', '--', wzgledna);
        git('commit', '-m', `rozmowa ${sesja.slice(0, 8)}`);
      }
    } catch (blad) {
      // magazyn lokalny jest granicą sukcesu: bez zapisu tura nie jest zaległa, tylko stracona
      awaria = { powod: `zapis lokalny nieudany: ${opis(blad)}`, odzyskiwalne: false };
    }

    // wypchnięcie idzie także wtedy, gdy bieżąca tura padła — zaległość innych tur
    // nie ma powodu czekać na nią
    try {
      wypchnij(zapisz);
    } catch (blad) {
      awaria ??= { powod: `wypchnięcie nieudane, zostaje lokalnie: ${opis(blad)}`, odzyskiwalne: true };
    }

    if (awaria) zglos(awaria.powod, awaria.odzyskiwalne);
    else odznaczAwarie();
  } finally {
    zwolnijZamek();
  }
}

try {
  main();
} catch (blad) {
  zglos(`hak przerwany: ${wytrzyj(blad.stack || blad.message)}`, false);
}
