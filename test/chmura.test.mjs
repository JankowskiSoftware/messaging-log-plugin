import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const KORZEN = path.dirname(import.meta.dirname);
const CHMURA = path.join(KORZEN, 'chmura.mjs');

function zbuduj(tresc = 'github_pat_udawany\n') {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'chmura-'));
  const token = path.join(katalog, 'token');
  fs.writeFileSync(token, tresc);
  const skrypt = execFileSync('node', [CHMURA, token], { cwd: KORZEN, encoding: 'utf8' });
  return { katalog, skrypt };
}

test('skrypt dodaje marketplace przed instalacją pluginu i niesie token', () => {
  const { katalog, skrypt } = zbuduj();
  try {
    const marketplace = skrypt.indexOf('claude plugin marketplace add');
    const instalacja = skrypt.indexOf('claude plugin install');
    assert.ok(marketplace > 0 && instalacja > marketplace, 'marketplace musi pójść przed instalacją (ADR 0002)');
    assert.match(skrypt, /git clone .*messaging-log\.git/, 'hak ma zastać gotowy klon repo danych');
    assert.ok(skrypt.includes('github_pat_udawany'));
    assert.ok(skrypt.includes('|| true'), 'niezerowy kod wyjścia uniemożliwia start sesji');
    assert.equal(spawnSync('bash', ['-n'], { input: skrypt }).status, 0, 'skrypt musi być poprawnym bashem');
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
});

test('polecenie niekrytyczne może paść, a skrypt i tak kończy się zerem', () => {
  const { katalog, skrypt } = zbuduj();
  const dom = path.join(katalog, 'dom');
  const stuby = path.join(katalog, 'stuby');
  fs.mkdirSync(dom);
  fs.mkdirSync(stuby);
  for (const nazwa of ['claude', 'git']) {
    fs.writeFileSync(path.join(stuby, nazwa), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  }
  try {
    const przebieg = spawnSync('bash', ['-s'], {
      input: skrypt,
      env: { ...process.env, HOME: dom, PATH: `${stuby}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.equal(przebieg.status, 0);
    assert.match(fs.readFileSync(path.join(dom, '.claude', 'settings.json'), 'utf8'), /enabledPlugins/);
    assert.equal(fs.readFileSync(path.join(dom, '.messaging-log-token'), 'utf8').trim(), 'github_pat_udawany');
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
});

test('bez tokenu skryptu nie ma', () => {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'chmura-'));
  try {
    assert.throws(() =>
      execFileSync('node', [CHMURA, path.join(katalog, 'nie-ma')], { cwd: KORZEN, stdio: 'pipe' })
    );
    fs.writeFileSync(path.join(katalog, 'pusty'), '\n');
    assert.throws(() => execFileSync('node', [CHMURA, path.join(katalog, 'pusty')], { cwd: KORZEN, stdio: 'pipe' }));
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
});
