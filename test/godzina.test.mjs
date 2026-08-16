// Testy zadania godzinowego na żywym gicie: tymczasowy HOME z klonem i lokalnym
// „zdalnym" (url.insteadOf jak w stop.test.mjs). Atrapa `claude` na PATH gra
// drugiego pisarza: dopisuje wiersz do pliku dobowego dokładnie w trakcie
// wywołania modelu, czyli w oknie, w którym zamek nie jest trzymany.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { czasWarszawski } from '../lib/sesja.mjs';
import { czytajCsv } from '../lib/wiersze.mjs';

const KORZEN = path.dirname(import.meta.dirname);
const GODZINA = path.join(KORZEN, 'bin', 'godzina.mjs');
const ZDALNY_URL = 'https://github.com/JankowskiSoftware/messaging-log.git';

const SESJA = 'aaaa1111-a443-4957-b265-241e57ee9d49';

function srodowisko() {
  const dom = fs.mkdtempSync(path.join(os.tmpdir(), 'godzina-'));
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

  // dwie wymiany sprzed dwóch godzin, czyli koszyk z zamkniętej godziny
  const ts = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { doba, godzina, minuta } = czasWarszawski(ts);
  const katalog = path.join(klon, 'rozmowy', doba);
  fs.mkdirSync(katalog, { recursive: true });
  fs.writeFileSync(
    path.join(katalog, `${godzina}${minuta}-alfa-${SESJA.slice(0, 8)}.jsonl`),
    [
      { ts, kanal: 'claude-vscode', sesja: SESJA, repo: 'alfa', rola: 'michal', tekst: 'pytanie', uuid: `${SESJA}-0` },
      { ts, kanal: 'claude-vscode', sesja: SESJA, repo: 'alfa', rola: 'claude', tekst: 'odpowiedź', uuid: `${SESJA}-1` },
    ].map(r => JSON.stringify(r)).join('\n') + '\n',
  );

  return { dom, zdalne, klon, env, git, doba, godzina };
}

/** Atrapa modelu: dopisuje cudzy wiersz do pliku dobowego i dopiero potem odpowiada. */
function atrapaModelu(k, cudzyWiersz) {
  const stuby = path.join(k.dom, 'stuby');
  fs.mkdirSync(stuby);
  const csv = path.join(k.klon, 'godziny', `${k.doba}.csv`);
  fs.writeFileSync(path.join(stuby, 'claude'), [
    '#!/bin/sh',
    'cat > /dev/null',
    `mkdir -p ${JSON.stringify(path.dirname(csv))}`,
    `csv=${JSON.stringify(csv)}`,
    'if [ ! -f "$csv" ]; then printf \'data,godzina,od,do,repo,wymiany,temat\\n\' > "$csv"; fi',
    `printf '%s\\n' ${JSON.stringify(cudzyWiersz)} >> "$csv"`,
    'echo "Temat z modelu"',
  ].join('\n') + '\n', { mode: 0o755 });
  k.env.PATH = `${stuby}:${k.env.PATH}`;
}

const zadanie = k => spawnSync('node', [GODZINA], { env: k.env, encoding: 'utf8' });

test('wiersz dopisany w trakcie wywołań modelu przeżywa zapis', () => {
  const k = srodowisko();
  try {
    atrapaModelu(k, `${k.doba},${k.godzina},10,20,obcy,2,Cudzy wiersz`);
    assert.equal(zadanie(k).status, 0);

    const wiersze = czytajCsv(fs.readFileSync(path.join(k.klon, 'godziny', `${k.doba}.csv`), 'utf8'));
    assert.deepEqual(
      wiersze.map(w => [w.repo, w.temat]).sort(),
      [['alfa', 'Temat z modelu'], ['obcy', 'Cudzy wiersz']],
      'przeżyć mają oba wiersze: cudzy i policzony przez to zadanie',
    );
    // scalona treść jest zatwierdzona i wypchnięta w całości
    assert.equal(
      k.git(k.zdalne, 'show', `main:godziny/${k.doba}.csv`),
      fs.readFileSync(path.join(k.klon, 'godziny', `${k.doba}.csv`), 'utf8'),
    );
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('koszyk opisany w międzyczasie przez drugiego pisarza nie dostaje drugiego kompletu', () => {
  const k = srodowisko();
  try {
    // cudzy wiersz trafia w ten sam koszyk: doba, godzina i repo policzonych wymian
    atrapaModelu(k, `${k.doba},${k.godzina},00,59,alfa,2,Cudzy temat`);
    assert.equal(zadanie(k).status, 0);

    const wiersze = czytajCsv(fs.readFileSync(path.join(k.klon, 'godziny', `${k.doba}.csv`), 'utf8'));
    assert.deepEqual(wiersze.map(w => [w.repo, w.temat]), [['alfa', 'Cudzy temat']]);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});
