// Testy haka Stop na żywym gicie: tymczasowy HOME z klonem i lokalnym „zdalnym".
// Adres GitHuba z klon.mjs jest przekierowany przez url.insteadOf w ~/.gitconfig,
// więc pobrania i wypchnięcia chodzą naprawdę, tylko bez sieci.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const KORZEN = path.dirname(import.meta.dirname);
const STOP = path.join(KORZEN, 'hooks', 'stop.mjs');
const KLON_MJS = path.join(KORZEN, 'lib', 'klon.mjs');
const ZDALNY_URL = 'https://github.com/JankowskiSoftware/messaging-log.git';

const SESJA = 'e5b1a539-a443-4957-b265-241e57ee9d49';
const WZGLEDNA = 'rozmowy/2026-07-05/1902-alfa-e5b1a539.jsonl';

const transkrypt = wymiany =>
  wymiany
    .map(([type, text], i) =>
      JSON.stringify({
        type,
        uuid: `${SESJA}-${i}`,
        sessionId: SESJA,
        timestamp: `2026-07-05T17:0${2 + i}:36.402Z`,
        cwd: 'C:\\Users\\borsu\\repos\\alfa',
        entrypoint: 'claude-vscode',
        message: { content: [{ type: 'text', text }] },
      }))
    .join('\n') + '\n';

/** Rekord w formacie pliku sesji — tak wygląda wymiana dopisana przez drugi komputer. */
const rekordZdalny = i =>
  JSON.stringify({
    ts: `2026-07-05T17:0${2 + i}:36.402Z`,
    kanal: 'claude-vscode',
    sesja: SESJA,
    repo: 'alfa',
    rola: i % 2 ? 'claude' : 'michal',
    tekst: `wymiana ${i}`,
    uuid: `${SESJA}-${i}`,
  }) + '\n';

function srodowisko() {
  const dom = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-'));
  const zdalne = path.join(dom, 'zdalne.git');
  const klon = path.join(dom, '.messaging-log');
  const env = { ...process.env, HOME: dom };
  const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { env, encoding: 'utf8' });

  execFileSync('git', ['init', '--bare', '-b', 'main', zdalne], { env, stdio: 'pipe' });
  fs.writeFileSync(path.join(dom, '.gitconfig'), [
    '[user]',
    '\tname = Test',
    '\temail = test@test.local',
    `[url "${zdalne}"]`,
    `\tinsteadOf = ${ZDALNY_URL}`,
    '',
  ].join('\n'));

  fs.mkdirSync(klon);
  git(klon, 'init', '-b', 'main');
  fs.writeFileSync(path.join(klon, 'README.md'), 'dane\n');
  git(klon, 'add', 'README.md');
  git(klon, 'commit', '-m', 'start');
  git(klon, 'push', ZDALNY_URL, 'HEAD:main');

  return { dom, zdalne, klon, env, git };
}

/** Drugi komputer: osobny klon zdalnego, w którym można dopisać i wypchnąć. */
function drugiKomputer(k) {
  const drugi = path.join(k.dom, 'drugi');
  execFileSync('git', ['clone', k.zdalne, drugi], { env: k.env, stdio: 'pipe' });
  return drugi;
}

function hak(k, wymiany, srodowiskoHaka = {}) {
  const plik = path.join(k.dom, 'transkrypt.jsonl');
  fs.writeFileSync(plik, transkrypt(wymiany));
  return spawnSync('node', [STOP], {
    input: JSON.stringify({ session_id: SESJA, transcript_path: plik }),
    env: { ...k.env, ...srodowiskoHaka },
    encoding: 'utf8',
  });
}

const uuidy = tresc => tresc.trim().split('\n').map(l => JSON.parse(l).uuid);

test('cofnięty klon: hak pobiera przed zapisem i nie duplikuje wymian', () => {
  const k = srodowisko();
  try {
    // pierwsza tura zapisuje dwie wymiany i wypycha
    assert.equal(hak(k, [['user', 'wymiana 0'], ['assistant', 'wymiana 1']]).status, 0);
    assert.deepEqual(uuidy(fs.readFileSync(path.join(k.klon, WZGLEDNA), 'utf8')), [
      `${SESJA}-0`, `${SESJA}-1`,
    ]);

    // drugi komputer dopisuje trzecią wymianę i wypycha — lokalny klon zostaje w tyle
    const drugi = drugiKomputer(k);
    fs.appendFileSync(path.join(drugi, WZGLEDNA), rekordZdalny(2));
    k.git(drugi, 'commit', '-am', 'wymiana z drugiego komputera');
    k.git(drugi, 'push', 'origin', 'HEAD:main');

    // tura z czterema wymianami: znacznik musi przyjść ze świeżo pobranego pliku
    assert.equal(hak(k, [
      ['user', 'wymiana 0'], ['assistant', 'wymiana 1'],
      ['user', 'wymiana 2'], ['assistant', 'wymiana 3'],
    ]).status, 0);

    const tresc = fs.readFileSync(path.join(k.klon, WZGLEDNA), 'utf8');
    assert.deepEqual(uuidy(tresc), [`${SESJA}-0`, `${SESJA}-1`, `${SESJA}-2`, `${SESJA}-3`]);
    // wypchnięte: zdalne widzi to samo, bez konfliktu
    assert.equal(k.git(k.zdalne, 'show', `main:${WZGLEDNA}`), tresc);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

/** Rozjazd treści: lokalny i zdalny commit zmieniają tę samą linię README. */
function skonfliktuj(k) {
  fs.writeFileSync(path.join(k.klon, 'README.md'), 'wersja lokalna\n');
  k.git(k.klon, 'commit', '-am', 'lokalna');
  const drugi = drugiKomputer(k);
  fs.writeFileSync(path.join(drugi, 'README.md'), 'wersja zdalna\n');
  k.git(drugi, 'commit', '-am', 'zdalna');
  k.git(drugi, 'push', 'origin', 'HEAD:main');
}

test('nieudane scalenie w pogodz nie zostawia klonu w MERGE_HEAD', () => {
  const k = srodowisko();
  try {
    skonfliktuj(k);
    const przebieg = spawnSync('node', [
      '--input-type=module', '-e',
      `import { pobierz } from ${JSON.stringify(pathToFileURL(KLON_MJS).href)}; pobierz();`,
    ], { env: k.env, encoding: 'utf8' });
    assert.notEqual(przebieg.status, 0, 'konflikt ma wyjść wyjątkiem, nie przejść cicho');
    assert.equal(fs.existsSync(path.join(k.klon, '.git', 'MERGE_HEAD')), false);
    assert.equal(fs.existsSync(path.join(k.klon, '.git', 'rebase-merge')), false);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('zastane MERGE_HEAD po dawnej awarii: hak sprząta i pisze dalej', () => {
  const k = srodowisko();
  try {
    skonfliktuj(k);
    // niedokończone scalenie, dokładnie tak jak zostawiała je stara wersja pogodz
    k.git(k.klon, 'fetch', ZDALNY_URL, 'main');
    assert.notEqual(spawnSync('git', ['-C', k.klon, 'merge', 'FETCH_HEAD'], { env: k.env }).status, 0);
    assert.ok(fs.existsSync(path.join(k.klon, '.git', 'MERGE_HEAD')));

    assert.equal(hak(k, [['user', 'wymiana 0'], ['assistant', 'wymiana 1']]).status, 0);

    assert.equal(fs.existsSync(path.join(k.klon, '.git', 'MERGE_HEAD')), false);
    assert.deepEqual(uuidy(fs.readFileSync(path.join(k.klon, WZGLEDNA), 'utf8')), [
      `${SESJA}-0`, `${SESJA}-1`,
    ]);
    assert.match(k.git(k.klon, 'log', '--format=%s'), /rozmowa e5b1a539/);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('sesja wewnętrzna: hak wychodzi, zanim tknie gita i klon', () => {
  const dom = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-'));
  try {
    const plik = path.join(dom, 'transkrypt.jsonl');
    fs.writeFileSync(plik, transkrypt([['user', 'streszczenie koszyka']]));
    const przebieg = spawnSync('node', [STOP], {
      input: JSON.stringify({ session_id: SESJA, transcript_path: plik }),
      env: { ...process.env, HOME: dom, MESSAGING_LOG_WEWNETRZNE: '1' },
      encoding: 'utf8',
    });
    assert.equal(przebieg.status, 0);
    assert.equal(fs.existsSync(path.join(dom, '.messaging-log')), false, 'klon nie ma prawa powstać');
    assert.equal(fs.existsSync(path.join(dom, '.messaging-log-hak.log')), false, 'nawet dziennik ma milczeć');
  } finally {
    fs.rmSync(dom, { recursive: true, force: true });
  }
});

test('awaria sieci wstrzymuje wypchnięcie, ale nie zapis', () => {
  const k = srodowisko();
  try {
    // „sieć" znika: przekierowanie prowadzi donikąd
    fs.writeFileSync(path.join(k.dom, '.gitconfig'), [
      '[user]',
      '\tname = Test',
      '\temail = test@test.local',
      `[url "${path.join(k.dom, 'nie-ma.git')}"]`,
      `\tinsteadOf = ${ZDALNY_URL}`,
      '',
    ].join('\n'));

    assert.equal(hak(k, [['user', 'wymiana 0'], ['assistant', 'wymiana 1']]).status, 0);

    assert.deepEqual(uuidy(fs.readFileSync(path.join(k.klon, WZGLEDNA), 'utf8')), [
      `${SESJA}-0`, `${SESJA}-1`,
    ]);
    assert.match(k.git(k.klon, 'log', '--format=%s'), /rozmowa e5b1a539/);
    const dziennik = fs.readFileSync(path.join(k.dom, '.messaging-log-hak.log'), 'utf8');
    assert.match(dziennik, /pobranie nieudane/);
    assert.match(dziennik, /wypchnięcie nieudane/);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});
