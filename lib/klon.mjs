// Klon repo danych: token, zamek, pobranie i wypchnięcie. Piszą do niego dwaj
// niezależni pisarze — hak sesyjny i zadanie godzinowe — więc ta obsługa istnieje
// raz. Dwie kopie logiki wypychania rozjechałyby się na pierwszym konflikcie.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = 'JankowskiSoftware/messaging-log';
const ZDALNE = `https://github.com/${REPO}.git`;
const ZAMEK_PRZETERMINOWANY_MS = 5 * 60 * 1000;

export const KLON = path.join(os.homedir(), '.messaging-log');
const ZAMEK = path.join(KLON, '.hak-zamek');

// ADR 0001: proxy kontenera obsługuje wyłącznie repozytoria przypisane do sesji,
// więc jedziemy wprost na github.com. Zmiennych nie przywracamy.
// EMAIL jest awaryjnym źródłem `user.email` — git sięga po nie dopiero wtedy, gdy
// konfiguracji nie ma, czyli w świeżym kontenerze, gdzie bez tego zatwierdzenie pada.
const SRODOWISKO = { EMAIL: 'hak@messaging-log.local', ...process.env, GIT_TERMINAL_PROMPT: '0' };
for (const zmienna of ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY']) {
  delete SRODOWISKO[zmienna];
}

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

const token = czytajToken();
// URL z tokenem podajemy przy każdym poleceniu i nigdy nie zapisujemy w konfiguracji
const zUwierzytelnieniem = token ? `https://oauth2:${token}@github.com/${REPO}.git` : ZDALNE;

/** Token nigdy nie trafia do dziennika ani na wyjście. */
export const wytrzyj = tekst => (token ? String(tekst).split(token).join('***') : String(tekst));

/** Dziennik diagnostyczny: cicha awaria zapisu jest gorsza niż brak zapisu. */
export function dziennik(nazwa) {
  const plik = path.join(os.homedir(), nazwa);
  return powod => {
    try {
      fs.appendFileSync(plik, `${new Date().toISOString()} ${wytrzyj(powod)}\n`);
    } catch {
      // dziennik jest wygodą, nie warunkiem działania
    }
  };
}

export const git = (...argumenty) =>
  execFileSync('git', ['-C', KLON, ...argumenty], { env: SRODOWISKO, encoding: 'utf8', stdio: 'pipe' });

export function zapewnijKlon() {
  if (fs.existsSync(path.join(KLON, '.git'))) {
    // zastane po dawnej awarii scalenie blokowałoby każde następne zatwierdzenie
    if (fs.existsSync(path.join(KLON, '.git', 'MERGE_HEAD'))) {
      try {
        git('merge', '--abort');
      } catch {
        // nieudane sprzątanie zgłosi się przy zatwierdzeniu — tak jak dotąd
      }
    }
    return;
  }
  execFileSync('git', ['clone', '--depth', '1', zUwierzytelnieniem, KLON], { env: SRODOWISKO, stdio: 'pipe' });
  // origin bez tokenu, żeby token nie wylądował w .git/config
  git('remote', 'set-url', 'origin', ZDALNE);
}

/**
 * Zamek na klonie: dwa komputery i dwie sesje na jednym piszą do tego samego
 * drzewa gita, a indeks gita nie znosi równoległości. Pliki per sesja sprawiają,
 * że nie ma konfliktu treści — zamek pilnuje tylko zatwierdzenia.
 */
export function zajmijZamek() {
  for (let proba = 0; proba < 40; proba++) {
    try {
      fs.mkdirSync(ZAMEK);
      return true;
    } catch {
      const wiek = Date.now() - (fs.statSync(ZAMEK, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (wiek > ZAMEK_PRZETERMINOWANY_MS) {
        // poprzedni pisarz padł w środku; po pięciu minutach nikt już nie pisze
        fs.rmSync(ZAMEK, { recursive: true, force: true });
        continue;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  return false;
}

export const zwolnijZamek = () => fs.rmSync(ZAMEK, { recursive: true, force: true });

/** Pogodzenie płytkiego klonu ze zdalnym: pogłębienie, potem rebase albo scalenie. */
function pogodz() {
  try {
    git('fetch', '--unshallow', zUwierzytelnieniem, 'main');
  } catch {
    git('fetch', zUwierzytelnieniem, 'main');
  }
  try {
    git('rebase', 'FETCH_HEAD');
  } catch {
    git('rebase', '--abort');
    try {
      git('merge', '--no-edit', 'FETCH_HEAD');
    } catch (blad) {
      // niedokończone scalenie zablokowałoby klon na stałe — najpierw sprzątamy
      try {
        git('merge', '--abort');
      } catch {
        // scalenie mogło w ogóle nie ruszyć, wtedy nie ma czego przerywać
      }
      throw blad;
    }
  }
}

export const pobierz = pogodz;

export function wypchnij(zapisz = () => {}) {
  try {
    git('push', zUwierzytelnieniem, 'HEAD:main');
    return;
  } catch (blad) {
    zapisz(`pierwsze wypchnięcie odrzucone: ${blad.stderr || blad.message}`);
  }
  // ADR 0001: klon jest płytki, więc pogodzenie się z remote zaczyna się od pogłębienia
  pogodz();
  git('push', zUwierzytelnieniem, 'HEAD:main');
}
