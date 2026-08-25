#!/usr/bin/env node
// Hak Stop, uruchamiany z flagą async po każdej turze: transkrypt tej sesji →
// nowe rekordy → plik sesji w klonie → zatwierdzenie → wypchnięcie.
// Ten sam plik obsługuje Claude'a i Codeksa — Codex woła go z argumentem `codex`.
// Adapter Codeksa to wyłącznie brama zdatności poniżej: dalej idzie wspólny tor.
// Granicą sukcesu jest zapis lokalny, nie wypchnięcie: zaległe zatwierdzenia
// zabiera następna tura, bo `push HEAD:main` niesie je razem z bieżącym.
// Cokolwiek pójdzie źle, hak kończy zerem — tura Michała nigdy nie ma ucierpieć —
// ale zostawia ślad awarii, który przy następnej turze pokaże ostrzezenie.mjs.

import fs from 'node:fs';
import { transkryptNaRekordy } from '../lib/filtr.mjs';
import { dopiszRekordy } from '../lib/sesja.mjs';
import { oznaczAwarie, odznaczAwarie, komunikatSladu } from '../lib/awaria.mjs';
import { KLON, git, dziennik, wytrzyj, zapewnijKlon, zajmijZamek, zwolnijZamek, pobierz, wypchnij } from '../lib/klon.mjs';

const ZRODLO = process.argv[2] === 'codex' ? 'codex' : 'claude';

const zapisz = dziennik('.messaging-log-hak.log');
const opis = blad => wytrzyj(blad.stderr || blad.message);

/** Ślad trafia i do dziennika, i do pliku czytanego przez hak ostrzegający. */
function zglos(powod, odzyskiwalne) {
  zapisz(powod);
  oznaczAwarie(powod, odzyskiwalne);
}

/**
 * Brama Codeksa: tylko natywne pola zdarzenia, zero zgadywania z treści rozmowy.
 * `hook_event_name` oddziela turę główną od SubagentStop, a `agent_id`/`agent_type`
 * są wypełnione wyłącznie dla podagenta. Tura główna, która sama odpaliła podagenty,
 * przychodzi jako czyste `Stop` i wchodzi normalnie. Przebieg maszynowy
 * (`originator: codex_exec`) odsiewa filtr po `session_meta`, przed zapisem.
 */
function turaGlownaCodeksa(wejscie) {
  if (wejscie.hook_event_name === 'Stop') return !wejscie.agent_id && !wejscie.agent_type;
  // podagent ma własne zdarzenie i pomijamy go świadomie, bez zgłoszenia
  if (wejscie.hook_event_name === 'SubagentStop') return false;
  // cokolwiek innego znaczy, że natywne dane nie identyfikują interaktywnej tury
  // głównej — wtedy wolno tylko pominąć i powiedzieć wprost, czego zabrakło
  zglos(`zdarzenie Codeksa \`hook_event_name\`=${JSON.stringify(wejscie.hook_event_name ?? null)} — natywne dane nie identyfikują interaktywnej tury głównej, tura pominięta`, false);
  return false;
}

function main() {
  // sesja odpalona przez nasze własne skrypty (opisz w przebieg.mjs) nie jest rozmową —
  // wyjście przed jakimkolwiek dotknięciem gita i klonu
  if (process.env.MESSAGING_LOG_WEWNETRZNE) return;

  const wejscie = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (ZRODLO === 'codex') {
    // Codex pokazuje `systemMessage` haka asynchronicznego, więc drugi, synchroniczny
    // hak jest tu zbędny — ostrzeżenie idzie stąd i przed jakąkolwiek pracą
    const komunikat = komunikatSladu();
    if (komunikat) process.stdout.write(JSON.stringify({ systemMessage: komunikat }));
    if (!turaGlownaCodeksa(wejscie)) return;
  }

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
      const rekordy = transkryptNaRekordy(fs.readFileSync(transkrypt, 'utf8'), ZRODLO);
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
