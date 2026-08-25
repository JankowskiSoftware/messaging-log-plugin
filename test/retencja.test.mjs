import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stareDoby, skasujDobe } from '../lib/retencja.mjs';

// 2026-08-12 12:00 czasu warszawskiego; sześćdziesiąt dni wstecz to 2026-06-13
const TERAZ = Date.parse('2026-08-12T10:00:00Z');

function klonZDobami(...doby) {
  const klon = fs.mkdtempSync(path.join(os.tmpdir(), 'retencja-'));
  for (const doba of doby) {
    fs.mkdirSync(path.join(klon, 'rozmowy', doba), { recursive: true });
    fs.writeFileSync(path.join(klon, 'rozmowy', doba, 'sesja.jsonl'), '{}\n');
  }
  return klon;
}

test('katalog dokładnie sześćdziesięciodniowy zostaje, sześćdziesięciojednodniowy znika', () => {
  const klon = klonZDobami('2026-06-13', '2026-06-12', '2026-08-12');
  assert.deepEqual(stareDoby(klon, TERAZ), ['2026-06-12']);
});

test('przebieg bez starych katalogów nie wskazuje nic do skasowania', () => {
  assert.deepEqual(stareDoby(klonZDobami('2026-08-12'), TERAZ), []);
  assert.deepEqual(stareDoby(fs.mkdtempSync(path.join(os.tmpdir(), 'pusty-')), TERAZ), []);
});

test('dziennik godzinowy nie jest kasowany, bez względu na wiek', () => {
  const klon = klonZDobami('2020-01-01');
  fs.mkdirSync(path.join(klon, 'godziny'), { recursive: true });
  fs.writeFileSync(path.join(klon, 'godziny', '2020-01-01.csv'), 'x\n');

  for (const doba of stareDoby(klon, TERAZ)) skasujDobe(klon, doba);

  assert.equal(fs.existsSync(path.join(klon, 'rozmowy', '2020-01-01')), false);
  assert.equal(fs.existsSync(path.join(klon, 'godziny', '2020-01-01.csv')), true);
});

test('cudze nazwy w katalogu rozmów są nietykalne', () => {
  const klon = klonZDobami('2026-06-12');
  fs.writeFileSync(path.join(klon, 'rozmowy', 'README.md'), 'x\n');
  assert.deepEqual(stareDoby(klon, TERAZ), ['2026-06-12']);
});

// Przebieg zadania dobowego na żywym gicie: tymczasowy HOME z klonem i lokalnym
// „zdalnym" (url.insteadOf jak w stop.test.mjs). Doby liczone od `Date.now()`,
// więc 2020 jest przeterminowane, a dzisiejsza doba zostaje — dziś i za rok.

import { execFileSync, spawnSync } from 'node:child_process';
import { czasWarszawski } from '../lib/sesja.mjs';

const RETENCJA = path.join(path.dirname(import.meta.dirname), 'bin', 'retencja.mjs');
const ZDALNY_URL = 'https://github.com/JankowskiSoftware/messaging-log.git';

function srodowisko(...doby) {
  const dom = fs.mkdtempSync(path.join(os.tmpdir(), 'retencja-zadanie-'));
  const zdalne = path.join(dom, 'zdalne.git');
  const klon = path.join(dom, '.messaging-log');
  const pustyToken = path.join(dom, 'pusty-token');
  fs.writeFileSync(pustyToken, '');
  const env = { ...process.env, HOME: dom, USERPROFILE: dom, MESSAGING_LOG_TOKEN_PATH: pustyToken };
  const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { env, encoding: 'utf8' });

  execFileSync('git', ['init', '--bare', '-b', 'main', zdalne], { env, stdio: 'pipe' });
  fs.writeFileSync(path.join(dom, '.gitconfig'), [
    '[user]',
    '\tname = Test',
    '\temail = test@test.local',
    `[url "${zdalne.replaceAll('\\', '/')}"]`,
    `\tinsteadOf = ${ZDALNY_URL}`,
    '',
  ].join('\n'));

  fs.mkdirSync(klon);
  git(klon, 'init', '-b', 'main');
  for (const doba of doby) {
    fs.mkdirSync(path.join(klon, 'rozmowy', doba), { recursive: true });
    fs.writeFileSync(path.join(klon, 'rozmowy', doba, 'sesja.jsonl'), '{}\n');
  }
  fs.mkdirSync(path.join(klon, 'godziny'), { recursive: true });
  fs.writeFileSync(path.join(klon, 'godziny', '2020-01-01.csv'), 'data,godzina\n');
  git(klon, 'add', '-A');
  git(klon, 'commit', '-m', 'start');
  git(klon, 'push', ZDALNY_URL, 'HEAD:main');

  return { dom, zdalne, klon, env, git };
}

const zadanie = k => {
  const wynik = spawnSync('node', [RETENCJA], { env: k.env, encoding: 'utf8' });
  if (wynik.error) throw wynik.error;
  return wynik;
};

test('zadanie dobowe kasuje przeterminowaną dobę i wypycha to skasowanie', () => {
  const dzis = czasWarszawski(Date.now()).doba;
  const k = srodowisko('2020-01-01', dzis);
  try {
    assert.equal(zadanie(k).status, 0);

    assert.equal(fs.existsSync(path.join(k.klon, 'rozmowy', '2020-01-01')), false);
    assert.equal(fs.existsSync(path.join(k.klon, 'rozmowy', dzis)), true, 'świeża doba zostaje');
    // dziennik godzinowy nie jest kasowany nigdy, także tu
    assert.equal(fs.existsSync(path.join(k.klon, 'godziny', '2020-01-01.csv')), true);

    const zdalnePliki = k.git(k.zdalne, 'ls-tree', '-r', '--name-only', 'main');
    assert.equal(zdalnePliki.includes('rozmowy/2020-01-01/'), false, 'skasowanie doszło do zdalnego');
    assert.equal(zdalnePliki.includes(`rozmowy/${dzis}/`), true);
    assert.equal(zdalnePliki.includes('godziny/2020-01-01.csv'), true);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('przebieg bez przeterminowanych dób nie zatwierdza niczego', () => {
  const k = srodowisko(czasWarszawski(Date.now()).doba);
  try {
    const przed = k.git(k.klon, 'rev-parse', 'HEAD').trim();
    assert.equal(zadanie(k).status, 0);
    assert.equal(k.git(k.klon, 'rev-parse', 'HEAD').trim(), przed);
    assert.equal(k.git(k.klon, 'status', '--porcelain').trim(), '');
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});
