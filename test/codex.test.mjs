import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dopiszRozmowyCodeksa } from '../lib/codex.mjs';

const DOBY = ['2026-05-24', '2026-05-23'];

const sesja = (id, originator, wymiany) =>
  [
    JSON.stringify({
      timestamp: '2026-05-24T07:40:00.000Z',
      type: 'session_meta',
      payload: { id, originator, cwd: 'C:\\Users\\borsu\\repos\\llm-wiki' },
    }),
    ...wymiany.map(([type, message, timestamp]) =>
      JSON.stringify({ timestamp, type: 'event_msg', payload: { type, message } })),
  ].join('\n') + '\n';

function katalogi() {
  const korzen = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-'));
  const codex = path.join(korzen, 'sessions', '2026', '05', '24');
  fs.mkdirSync(codex, { recursive: true });
  return { korzen, codex, sessions: path.join(korzen, 'sessions'), klon: korzen };
}

const linie = plik => fs.readFileSync(plik, 'utf8').split('\n').filter(l => l.trim()).map(JSON.parse);

test('dwie przeplatające się sesje dają dwa pliki i żadnej zgubionej wymiany', () => {
  const k = katalogi();
  fs.writeFileSync(path.join(k.codex, 'rollout-a.jsonl'), sesja('aaaa58ed-6ec6-7c03-93b7-bb9584dd38fc', 'codex_vscode', [
    ['user_message', 'pierwsze pytanie', '2026-05-24T07:40:23.111Z'],
    ['agent_message', 'pierwsza odpowiedź', '2026-05-24T07:41:00.000Z'],
  ]));
  fs.writeFileSync(path.join(k.codex, 'rollout-b.jsonl'), sesja('bbbb58ed-6ec6-7c03-93b7-bb9584dd38fc', 'Codex Desktop', [
    ['user_message', 'drugie pytanie', '2026-05-24T07:40:30.000Z'],
  ]));

  const dopisane = dopiszRozmowyCodeksa(k.sessions, k.klon, DOBY).sort();
  assert.deepEqual(dopisane, [
    'rozmowy/2026-05-24/0940-llm-wiki-aaaa58ed.jsonl',
    'rozmowy/2026-05-24/0940-llm-wiki-bbbb58ed.jsonl',
  ]);

  const wszystkie = dopisane.flatMap(w => linie(path.join(k.klon, w)));
  assert.deepEqual(wszystkie.map(r => r.tekst).sort(), ['drugie pytanie', 'pierwsza odpowiedź', 'pierwsze pytanie']);
  // pochodzenie idzie do rekordu dosłownie
  assert.deepEqual([...new Set(wszystkie.map(r => r.kanal))].sort(), ['Codex Desktop', 'codex_vscode']);

  fs.rmSync(k.korzen, { recursive: true, force: true });
});

test('drugi przebieg dopisuje tylko nową wymianę', () => {
  const k = katalogi();
  const plik = path.join(k.codex, 'rollout-a.jsonl');
  const wymiany = [['user_message', 'pierwsze pytanie', '2026-05-24T07:40:23.111Z']];
  fs.writeFileSync(plik, sesja('019e58ed-aaaa-7c03-93b7-bb9584dd38fc', 'codex_vscode', wymiany));
  const [wzgledna] = dopiszRozmowyCodeksa(k.sessions, k.klon, DOBY);

  assert.deepEqual(dopiszRozmowyCodeksa(k.sessions, k.klon, DOBY), []);
  assert.equal(linie(path.join(k.klon, wzgledna)).length, 1);

  wymiany.push(['agent_message', 'odpowiedź', '2026-05-24T07:41:00.000Z']);
  fs.writeFileSync(plik, sesja('019e58ed-aaaa-7c03-93b7-bb9584dd38fc', 'codex_vscode', wymiany));
  assert.deepEqual(dopiszRozmowyCodeksa(k.sessions, k.klon, DOBY), [wzgledna]);
  assert.deepEqual(linie(path.join(k.klon, wzgledna)).map(r => r.tekst), ['pierwsze pytanie', 'odpowiedź']);

  fs.rmSync(k.korzen, { recursive: true, force: true });
});

test('przebieg maszynowy nie zakłada żadnego pliku', () => {
  const k = katalogi();
  fs.writeFileSync(path.join(k.codex, 'rollout-x.jsonl'), sesja('019e58ed-cccc-7c03-93b7-bb9584dd38fc', 'codex_exec', [
    ['user_message', 'zadanie automatu', '2026-05-24T07:40:23.111Z'],
  ]));

  assert.deepEqual(dopiszRozmowyCodeksa(k.sessions, k.klon, DOBY), []);
  assert.equal(fs.existsSync(path.join(k.klon, 'rozmowy')), false);

  fs.rmSync(k.korzen, { recursive: true, force: true });
});

test('doby spoza okna i brak katalogu Codeksa nie wysadzają przebiegu', () => {
  const k = katalogi();
  fs.writeFileSync(path.join(k.codex, 'rollout-a.jsonl'), sesja('019e58ed-aaaa-7c03-93b7-bb9584dd38fc', 'codex_vscode', [
    ['user_message', 'stara wymiana', '2026-05-24T07:40:23.111Z'],
  ]));

  assert.deepEqual(dopiszRozmowyCodeksa(k.sessions, k.klon, ['2026-06-01']), []);
  assert.deepEqual(dopiszRozmowyCodeksa(path.join(k.korzen, 'nie-ma'), k.klon, DOBY), []);

  fs.rmSync(k.korzen, { recursive: true, force: true });
});
