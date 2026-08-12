import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const KORZEN = path.dirname(import.meta.dirname);
const SPAKUJ = path.join(KORZEN, 'spakuj.mjs');

/** Nazwy plików stoją w nagłówkach zipa czystym tekstem — tyle wystarczy do sprawdzenia zawartości. */
const zawiera = (paczka, nazwa) => fs.readFileSync(paczka).includes(nazwa);

test('paczka .plugin niesie manifest, hak i token', () => {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'spakuj-'));
  const paczka = path.join(katalog, 'messaging-log.plugin');
  const token = path.join(katalog, 'token');
  fs.writeFileSync(token, 'github_pat_udawany\n');
  try {
    execFileSync('node', [SPAKUJ, paczka, token], { cwd: KORZEN, stdio: 'pipe' });

    assert.ok(zawiera(paczka, '.claude-plugin/plugin.json'));
    assert.ok(zawiera(paczka, 'hooks/stop.mjs'));
    assert.ok(zawiera(paczka, 'token.txt'), 'poświadczenie musi jechać w paczce (ADR 0001)');
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
});

test('bez pliku tokenu paczka się nie buduje', () => {
  const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'spakuj-'));
  try {
    assert.throws(() =>
      execFileSync('node', [SPAKUJ, path.join(katalog, 'x.plugin'), path.join(katalog, 'nie-ma')], {
        cwd: KORZEN,
        stdio: 'pipe',
      })
    );
  } finally {
    fs.rmSync(katalog, { recursive: true, force: true });
  }
});
