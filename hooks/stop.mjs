#!/usr/bin/env node
// Hak Stop, uruchamiany z flagą async po każdej turze: transkrypt tej sesji →
// nowe rekordy → plik sesji w klonie → zatwierdzenie → wypchnięcie.
// Nic nowego = koniec bez dotykania gita. Cokolwiek pójdzie źle, hak milczy
// i kończy zerem — tura Michała nigdy nie ma na tym ucierpieć.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { transkryptNaRekordy } from '../lib/filtr.mjs';
import { sciezkaSesji, ostatniUuid, znajdzSciezkeSesji } from '../lib/sesja.mjs';

const REPO = 'JankowskiSoftware/messaging-log';
const ZDALNE = `https://github.com/${REPO}.git`;
const KLON = path.join(os.homedir(), '.messaging-log');
const ZAMEK = path.join(KLON, '.hak-zamek');
const DZIENNIK = path.join(os.homedir(), '.messaging-log-hak.log');
const ZAMEK_PRZETERMINOWANY_MS = 5 * 60 * 1000;

// ADR 0001: proxy kontenera obsługuje wyłącznie repozytoria przypisane do sesji,
// więc jedziemy wprost na github.com. Zmiennych nie przywracamy.
// EMAIL jest awaryjnym źródłem `user.email` — git sięga po nie dopiero wtedy, gdy
// konfiguracji nie ma, czyli w świeżym kontenerze, gdzie bez tego zatwierdzenie pada.
const SRODOWISKO = { EMAIL: 'hak@messaging-log.local', ...process.env, GIT_TERMINAL_PROMPT: '0' };
for (const zmienna of ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY']) {
  delete SRODOWISKO[zmienna];
}

const token = czytajToken();
// URL z tokenem podajemy przy każdym poleceniu i nigdy nie zapisujemy w konfiguracji
const zUwierzytelnieniem = token ? `https://oauth2:${token}@github.com/${REPO}.git` : ZDALNE;

function czytajToken() {
  const miejsca = [
    path.join(os.homedir(), '.messaging-log-token'),
    // paczka .plugin w Coworku nie ma katalogu domowego do dostarczenia pliku
    new URL('../token.txt', import.meta.url),
  ];
  for (const miejsce of miejsca) {
    try {
      const t = fs.readFileSync(miejsce, 'utf8').trim();
      if (t) return t;
    } catch {
      // brak pliku to nie błąd — lokalnie wystarczą poświadczenia gita
    }
  }
  return '';
}

/** Token nigdy nie trafia do dziennika ani na wyjście. */
const wytrzyj = tekst => (token ? String(tekst).split(token).join('***') : String(tekst));

function zapisz(powod) {
  try {
    fs.appendFileSync(DZIENNIK, `${new Date().toISOString()} ${wytrzyj(powod)}\n`);
  } catch {
    // dziennik jest wygodą, nie warunkiem działania
  }
}

const git = (...argumenty) =>
  execFileSync('git', ['-C', KLON, ...argumenty], { env: SRODOWISKO, encoding: 'utf8', stdio: 'pipe' });

function zapewnijKlon() {
  if (fs.existsSync(path.join(KLON, '.git'))) return;
  execFileSync('git', ['clone', '--depth', '1', zUwierzytelnieniem, KLON], { env: SRODOWISKO, stdio: 'pipe' });
  // origin bez tokenu, żeby token nie wylądował w .git/config
  git('remote', 'set-url', 'origin', ZDALNE);
}

/**
 * Zamek na klonie: dwa komputery i dwie sesje na jednym piszą do tego samego
 * drzewa gita, a indeks gita nie znosi równoległości. Pliki per sesja sprawiają,
 * że nie ma konfliktu treści — zamek pilnuje tylko zatwierdzenia.
 */
function zajmijZamek() {
  for (let proba = 0; proba < 40; proba++) {
    try {
      fs.mkdirSync(ZAMEK);
      return true;
    } catch {
      const wiek = Date.now() - (fs.statSync(ZAMEK, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (wiek > ZAMEK_PRZETERMINOWANY_MS) {
        // poprzedni hak padł w środku; po pięciu minutach nikt już nie pisze
        fs.rmSync(ZAMEK, { recursive: true, force: true });
        continue;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  return false;
}

function wypchnij() {
  try {
    git('push', zUwierzytelnieniem, 'HEAD:main');
    return;
  } catch (blad) {
    zapisz(`pierwsze wypchnięcie odrzucone: ${blad.stderr || blad.message}`);
  }
  // ADR 0001: klon jest płytki, więc pogodzenie się z remote zaczyna się od pogłębienia
  try {
    git('fetch', '--unshallow', zUwierzytelnieniem, 'main');
  } catch {
    git('fetch', zUwierzytelnieniem, 'main');
  }
  try {
    git('rebase', 'FETCH_HEAD');
  } catch {
    git('rebase', '--abort');
    git('merge', '--no-edit', 'FETCH_HEAD');
  }
  git('push', zUwierzytelnieniem, 'HEAD:main');
}

function main() {
  const wejscie = JSON.parse(fs.readFileSync(0, 'utf8'));
  const sesja = wejscie.session_id;
  const transkrypt = wejscie.transcript_path;
  if (!sesja || !transkrypt) return;

  zapewnijKlon();
  if (!zajmijZamek()) return zapisz('zamek zajęty, pomijam turę — dogoni się przy następnej');
  try {
    const wzgledna = znajdzSciezkeSesji(KLON, sesja);
    const istniejaca = wzgledna && path.join(KLON, wzgledna);
    const odUuid = istniejaca ? ostatniUuid(fs.readFileSync(istniejaca, 'utf8')) : undefined;

    const rekordy = transkryptNaRekordy(fs.readFileSync(transkrypt, 'utf8'), 'claude', odUuid);
    if (!rekordy.length) return;

    const docelowy = istniejaca ?? path.join(KLON, sciezkaSesji(rekordy[0]));
    fs.mkdirSync(path.dirname(docelowy), { recursive: true });
    fs.appendFileSync(docelowy, rekordy.map(r => JSON.stringify(r)).join('\n') + '\n');

    git('add', '--', path.relative(KLON, docelowy).split(path.sep).join('/'));
    git('commit', '-m', `rozmowa ${sesja.slice(0, 8)}: +${rekordy.length}`);
    // brak sieci wstrzymuje wypchnięcie, ale nie zapis — zaległość dogoni następna tura
    try {
      wypchnij();
    } catch (blad) {
      zapisz(`wypchnięcie nieudane, zostaje lokalnie: ${blad.stderr || blad.message}`);
    }
  } finally {
    fs.rmSync(ZAMEK, { recursive: true, force: true });
  }
}

try {
  main();
} catch (blad) {
  zapisz(`hak przerwany: ${blad.stack || blad.message}`);
}
