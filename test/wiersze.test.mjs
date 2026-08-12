import test from 'node:test';
import assert from 'node:assert/strict';
import { dopiszWiersze, czytajCsv, zachetaKoszyka } from '../lib/wiersze.mjs';

const GODZINA = 3600 * 1000;
// 2026-08-12 16:00 czasu warszawskiego; „teraz" domyślnie tuż po zamknięciu godziny 15
const TERAZ = Date.parse('2026-08-12T14:00:00.000Z');

const rekord = (ts, repo = 'personal', rola = 'michal', tekst = 'x') =>
  ({ ts, repo, rola, tekst, kanal: 'claude-vscode', sesja: 'e5b1a539', uuid: ts });

const trzy = () => ['Pierwszy temat', 'Drugi temat', 'Trzeci temat'];

test('koszyk bez wierszy dostaje wiersze, kolumny liczy skrypt a nie model', async () => {
  const rekordy = [
    rekord('2026-08-12T13:08:00.000Z'),
    rekord('2026-08-12T13:30:00.000Z', 'personal', 'claude'),
    rekord('2026-08-12T13:57:00.000Z'),
  ];
  const csvy = await dopiszWiersze(rekordy, {}, TERAZ, async () => ['Temat, z przecinkiem i "cudzysłowem"']);

  const wiersze = czytajCsv(csvy['2026-08-12']);
  assert.equal(wiersze.length, 1);
  assert.deepEqual(wiersze[0], {
    data: '2026-08-12',
    godzina: '15',
    od: '08',
    do: '57',
    repo: 'personal',
    wymiany: '3',
    temat: 'Temat, z przecinkiem i "cudzysłowem"',
  });
});

test('koszyk, który ma już wiersze, nie jest ruszany', async () => {
  const stary =
    'data,godzina,od,do,repo,wymiany,temat\n' +
    '2026-08-12,15,08,57,personal,3,"Zapisany raz i na zawsze"\n';
  let wolano = 0;
  const csvy = await dopiszWiersze(
    [rekord('2026-08-12T13:08:00.000Z'), rekord('2026-08-12T13:59:00.000Z')],
    { '2026-08-12': stary },
    TERAZ,
    async () => { wolano++; return trzy(); },
  );
  assert.equal(wolano, 0);
  assert.equal(csvy['2026-08-12'], stary);
});

test('godzina bez wymian i godzina jeszcze niezamknięta nie dostają wierszy', async () => {
  const csvy = await dopiszWiersze(
    // 16:20 warszawskiego to bieżąca, niezamknięta godzina
    [rekord('2026-08-12T14:20:00.000Z')],
    {},
    TERAZ,
    async () => trzy(),
  );
  assert.deepEqual(csvy, {});
});

test('godzina z dwoma repozytoriami daje dwa wywołania, każde widzi tylko swoje', async () => {
  const widziane = [];
  const csvy = await dopiszWiersze(
    [
      rekord('2026-08-12T13:05:00.000Z', 'personal', 'michal', 'sprawa prywatna'),
      rekord('2026-08-12T13:15:00.000Z', 'company', 'michal', 'sprawa firmowa'),
      rekord('2026-08-12T13:25:00.000Z', 'company', 'michal', 'dalej firmowa'),
    ],
    {},
    TERAZ,
    async koszyk => { widziane.push(koszyk.map(r => r.tekst)); return ['Temat koszyka']; },
  );

  assert.deepEqual(widziane, [['sprawa firmowa', 'dalej firmowa'], ['sprawa prywatna']]);
  const wiersze = czytajCsv(csvy['2026-08-12']);
  assert.deepEqual(
    wiersze.map(w => [w.repo, w.od, w.do, w.wymiany]),
    [['company', '15', '25', '2'], ['personal', '05', '05', '1']],
  );
});

test('pięć tematów daje trzy wiersze, a za długi temat zostaje przycięty', async () => {
  const dlugi = 'A'.repeat(200);
  const csvy = await dopiszWiersze(
    [rekord('2026-08-12T13:05:00.000Z')],
    {},
    TERAZ,
    async () => [dlugi, 'Drugi', 'Trzeci', 'Czwarty', 'Piąty'],
  );
  const wiersze = czytajCsv(csvy['2026-08-12']);
  assert.equal(wiersze.length, 3);
  assert.equal(wiersze[0].temat, 'A'.repeat(120));
  assert.deepEqual(wiersze.map(w => w.temat).slice(1), ['Drugi', 'Trzeci']);
});

test('model zwracający czysty tekst z myślnikami daje po wierszu na linię', async () => {
  const csvy = await dopiszWiersze(
    [rekord('2026-08-12T13:05:00.000Z')],
    {},
    TERAZ,
    async () => '- Pierwszy temat\n\n- Drugi temat\n',
  );
  assert.deepEqual(
    czytajCsv(csvy['2026-08-12']).map(w => w.temat),
    ['Pierwszy temat', 'Drugi temat'],
  );
});

test('nieudane wywołanie nie tworzy wierszy i nie zabiera reszty koszyków', async () => {
  const rekordy = [
    rekord('2026-08-12T13:05:00.000Z', 'personal'),
    rekord('2026-08-12T13:05:00.000Z', 'company'),
  ];
  const csvy = await dopiszWiersze(rekordy, {}, TERAZ, async koszyk => {
    if (koszyk[0].repo === 'personal') throw new Error('model padł');
    return ['Temat firmowy'];
  });
  const wiersze = czytajCsv(csvy['2026-08-12']);
  assert.deepEqual(wiersze.map(w => w.repo), ['company']);

  // koszyk personal wraca przy następnym przebiegu, bo nadal nie ma wiersza
  const drugi = await dopiszWiersze(rekordy, csvy, TERAZ, async () => ['Temat prywatny']);
  assert.deepEqual(czytajCsv(drugi['2026-08-12']).map(w => w.repo), ['company', 'personal']);
});

test('okno to 48 godzin: koszyk sprzed 30 godzin wchodzi, sprzed 72 już nie', async () => {
  const csvy = await dopiszWiersze(
    [
      rekord(new Date(TERAZ - 30 * GODZINA).toISOString()),
      rekord(new Date(TERAZ - 72 * GODZINA).toISOString()),
    ],
    {},
    TERAZ,
    async () => ['Temat'],
  );
  assert.deepEqual(Object.keys(csvy), ['2026-08-11']);
});

test('wymiany sprzed i po północy warszawskiej trafiają do dwóch plików dobowych', async () => {
  const csvy = await dopiszWiersze(
    // 23:30 i 00:30 czasu warszawskiego, czyli 21:30 i 22:30 UTC w sierpniu
    [rekord('2026-08-11T21:30:00.000Z'), rekord('2026-08-11T22:30:00.000Z')],
    {},
    TERAZ,
    async () => ['Temat'],
  );
  assert.deepEqual(Object.keys(csvy).sort(), ['2026-08-11', '2026-08-12']);
  assert.equal(czytajCsv(csvy['2026-08-11'])[0].godzina, '23');
  assert.equal(czytajCsv(csvy['2026-08-12'])[0].godzina, '00');
});

test('zachęta niesie wymiany koszyka przyciętą do sufitów kosztowych', () => {
  const zacheta = zachetaKoszyka([
    { rola: 'michal', tekst: 'B'.repeat(5000) },
    { rola: 'claude', tekst: 'krótka odpowiedź' },
  ]);
  assert.ok(zacheta.includes('michal: ' + 'B'.repeat(2000) + '\n'));
  assert.ok(!zacheta.includes('B'.repeat(2001)));
  assert.ok(zacheta.includes('krótka odpowiedź'));

  const wielki = zachetaKoszyka(Array.from({ length: 200 }, () => ({ rola: 'michal', tekst: 'C'.repeat(2000) })));
  assert.ok(wielki.length <= 100 * 1024 + 2000);
});
