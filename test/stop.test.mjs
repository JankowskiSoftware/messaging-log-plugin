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
const OSTRZEZENIE = path.join(KORZEN, 'hooks', 'ostrzezenie.mjs');
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
  const zdalneGitConfig = zdalne.replaceAll('\\', '/');
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
    `[url "${zdalneGitConfig}"]`,
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
const lf = tresc => tresc.replaceAll('\r\n', '\n');

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
    assert.equal(lf(k.git(k.zdalne, 'show', `main:${WZGLEDNA}`)), lf(tresc));
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
    przekieruj(k, path.join(k.dom, 'nie-ma.git'));

    // hak kończy zerem — awarię widać w dzienniku i śladzie, nie w kodzie wyjścia
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

const AWARIA = k => path.join(k.dom, '.messaging-log-awaria');
const slad = k => JSON.parse(fs.readFileSync(AWARIA(k), 'utf8'));
const ostrzez = k => spawnSync('node', [OSTRZEZENIE], { env: k.env, encoding: 'utf8' });

/** Przekierowanie github.com na wskazane repo; „nie-ma.git" udaje brak sieci. */
function przekieruj(k, cel) {
  fs.writeFileSync(path.join(k.dom, '.gitconfig'), [
    '[user]', '\tname = Test', '\temail = test@test.local',
    `[url "${cel.replaceAll(path.sep, '/')}"]`, `\tinsteadOf = ${ZDALNY_URL}`, '',
  ].join('\n'));
}

test('nieudane wypchnięcie: ślad awarii, ostrzeżenie przy następnej turze, odzysk kasuje ślad', () => {
  const k = srodowisko();
  try {
    przekieruj(k, path.join(k.dom, 'nie-ma.git'));
    assert.equal(hak(k, [['user', 'wymiana 0'], ['assistant', 'wymiana 1']]).status, 0);
    assert.equal(slad(k).odzyskiwalne, true, 'zaległość gitowa jest odzyskiwalna');

    // ostrzeżenie idzie synchronicznym hakiem, bo wyjście asynchronicznego nie dociera do Michała
    const przed = ostrzez(k);
    assert.equal(przed.status, 0);
    assert.match(JSON.parse(przed.stdout).systemMessage, /Messaging Log/);

    // sieć wraca: ta sama tura raz jeszcze — zaległość dochodzi, nic się nie dubluje
    przekieruj(k, k.zdalne);
    assert.equal(hak(k, [['user', 'wymiana 0'], ['assistant', 'wymiana 1']]).status, 0);

    assert.equal(fs.existsSync(AWARIA(k)), false, 'dostarczona zaległość kasuje ślad');
    assert.deepEqual(uuidy(k.git(k.zdalne, 'show', `main:${WZGLEDNA}`)), [`${SESJA}-0`, `${SESJA}-1`]);
    assert.equal(ostrzez(k).stdout, '', 'bez śladu ostrzeżenie milczy');
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('niepiszący magazyn lokalny nigdy nie melduje zapisu', () => {
  const k = srodowisko();
  try {
    // katalog w miejscu pliku sesji: zapis pada tak samo jak na niepiszącym dysku
    fs.mkdirSync(path.join(k.klon, WZGLEDNA), { recursive: true });

    assert.equal(hak(k, [['user', 'wymiana 0'], ['assistant', 'wymiana 1']]).status, 0);

    assert.equal(slad(k).odzyskiwalne, false, 'bez zapisu lokalnego nie ma czego dogonić');
    assert.doesNotMatch(k.git(k.klon, 'log', '--format=%s'), /rozmowa e5b1a539/);

    // udana tura innej sesji nie ma prawa skasować śladu nieodzyskanej pracy
    przekieruj(k, k.zdalne);
    fs.rmSync(path.join(k.klon, WZGLEDNA), { recursive: true });
    assert.equal(hak(k, [['user', 'wymiana 0'], ['assistant', 'wymiana 1']]).status, 0);
    assert.equal(slad(k).odzyskiwalne, false, 'ślad trwałej awarii czeka na decyzję Michała');
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('zdarzenie Stop bez transkryptu: pominięte i zgłoszone, klon nietknięty', () => {
  const k = srodowisko();
  try {
    const przebieg = spawnSync('node', [STOP], {
      input: JSON.stringify({ session_id: SESJA }),
      env: k.env,
      encoding: 'utf8',
    });
    assert.equal(przebieg.status, 0);
    assert.equal(slad(k).odzyskiwalne, false);
    assert.match(slad(k).powod, /transkryptu/);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

// ── Codex ────────────────────────────────────────────────────────────────────
// Ten sam hak i ten sam wpis w hooks/hooks.json: Codex woła `stop.mjs` bez
// żadnego argumentu, a format rozpoznaje filtr po kształcie transkryptu. Pola
// zdarzenia są te same co u Claude'a plus `hook_event_name`, `agent_id`
// i `agent_type`, po których poznaje się turę podagenta.

const SESJA_CODEKSA = 'c0dec5aa-1111-4957-b265-241e57ee9d49';
const WZGLEDNA_CODEKSA = 'rozmowy/2026-07-05/1902-beta-c0dec5aa.jsonl';

const rollout = (originator, wpisy) =>
  [
    JSON.stringify({
      timestamp: '2026-07-05T17:02:30.000Z',
      type: 'session_meta',
      payload: { id: SESJA_CODEKSA, originator, cwd: 'C:\\Users\\borsu\\repos\\beta' },
    }),
    ...wpisy,
  ].join('\n') + '\n';

const wiadomosc = (type, message, i) =>
  JSON.stringify({ timestamp: `2026-07-05T17:0${2 + i}:36.402Z`, type: 'event_msg', payload: { type, message } });

function hakCodeksa(k, tresc, wejscie = {}) {
  const plik = path.join(k.dom, 'rollout.jsonl');
  fs.writeFileSync(plik, tresc);
  return spawnSync('node', [STOP], {
    input: JSON.stringify({
      hook_event_name: 'Stop',
      session_id: SESJA_CODEKSA,
      transcript_path: plik,
      cwd: 'C:\\Users\\borsu\\repos\\beta',
      turn_id: 'tura-1',
      ...wejscie,
    }),
    env: k.env,
    encoding: 'utf8',
  });
}

const brakPlikuCodeksa = k =>
  assert.equal(fs.existsSync(path.join(k.klon, WZGLEDNA_CODEKSA)), false, 'nic nie ma prawa powstać');

test('Codex: interaktywna tura główna wchodzi tym samym zapisem i wypchnięciem', () => {
  const k = srodowisko();
  try {
    const wynik = hakCodeksa(k, rollout('codex_vscode', [
      wiadomosc('user_message', 'pytanie do Codeksa', 0),
      wiadomosc('agent_message', 'odpowiedź Codeksa', 1),
    ]));
    assert.equal(wynik.status, 0);

    const zapisane = fs.readFileSync(path.join(k.klon, WZGLEDNA_CODEKSA), 'utf8')
      .trim().split('\n').map(JSON.parse);
    assert.deepEqual(zapisane.map(r => r.tekst), ['pytanie do Codeksa', 'odpowiedź Codeksa']);
    assert.deepEqual(zapisane.map(r => r.rola), ['michal', 'claude']);
    assert.equal(zapisane[0].kanal, 'codex_vscode');
    // ten sam trwały tor co Claude: zatwierdzenie i wypchnięcie bez śladu awarii
    assert.match(k.git(k.klon, 'log', '--format=%s'), /rozmowa c0dec5aa/);
    assert.equal(lf(k.git(k.zdalne, 'show', `main:${WZGLEDNA_CODEKSA}`)).trim().split('\n').length, 2);
    assert.equal(fs.existsSync(AWARIA(k)), false);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('Codex: powtórzona tura nie dubluje wymian', () => {
  const k = srodowisko();
  try {
    const tresc = rollout('codex_vscode', [
      wiadomosc('user_message', 'pytanie do Codeksa', 0),
      wiadomosc('agent_message', 'odpowiedź Codeksa', 1),
    ]);
    assert.equal(hakCodeksa(k, tresc).status, 0);
    assert.equal(hakCodeksa(k, tresc).status, 0);
    assert.equal(fs.readFileSync(path.join(k.klon, WZGLEDNA_CODEKSA), 'utf8').trim().split('\n').length, 2);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('Codex: tura podagenta rozpoznana natywnie, nie zapisana i nie zgłoszona jako awaria', () => {
  const k = srodowisko();
  try {
    const tresc = rollout('codex_vscode', [wiadomosc('agent_message', 'robota podagenta', 0)]);
    // własne zdarzenie podagenta
    assert.equal(hakCodeksa(k, tresc, { hook_event_name: 'SubagentStop' }).status, 0);
    brakPlikuCodeksa(k);
    // Stop z tożsamością podagenta w polach natywnych
    assert.equal(hakCodeksa(k, tresc, { agent_id: 'ag-1', agent_type: 'reviewer' }).status, 0);
    brakPlikuCodeksa(k);
    assert.equal(fs.existsSync(AWARIA(k)), false, 'pominięcie podagenta to nie awaria');
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('Codex: przebieg maszynowy odsiewa natywne pochodzenie sesji', () => {
  const k = srodowisko();
  try {
    assert.equal(hakCodeksa(k, rollout('codex_exec', [
      wiadomosc('user_message', 'zadanie automatu', 0),
      wiadomosc('agent_message', 'odpowiedź automatu', 1),
    ])).status, 0);
    assert.equal(fs.existsSync(path.join(k.klon, 'rozmowy')), false);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('Codex: tura główna bez nazwy zdarzenia wchodzi normalnie', () => {
  const k = srodowisko();
  try {
    assert.equal(hakCodeksa(k, rollout('codex_vscode', [
      wiadomosc('user_message', 'pytanie do Codeksa', 0),
    ]), { hook_event_name: undefined }).status, 0);
    assert.equal(fs.existsSync(path.join(k.klon, WZGLEDNA_CODEKSA)), true);
    assert.equal(fs.existsSync(AWARIA(k)), false);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('Codex: przerwana tura zostawia pełne pytanie, nigdy urwanej odpowiedzi', () => {
  const k = srodowisko();
  try {
    assert.equal(hakCodeksa(k, rollout('codex_vscode', [
      wiadomosc('user_message', 'pytanie do Codeksa', 0),
      // strumień urwany w połowie: rollout ma tylko pozycję odpowiedzi, bez `agent_message`
      JSON.stringify({ timestamp: '2026-07-05T17:03:36.402Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'urwana odp' }] } }),
      JSON.stringify({ timestamp: '2026-07-05T17:03:37.402Z', type: 'event_msg', payload: { type: 'turn_aborted', reason: 'interrupted' } }),
    ])).status, 0);

    const zapisane = fs.readFileSync(path.join(k.klon, WZGLEDNA_CODEKSA), 'utf8')
      .trim().split('\n').map(JSON.parse);
    assert.deepEqual(zapisane.map(r => r.tekst), ['pytanie do Codeksa']);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('Codex: bieżący format Desktopa (item_completed) zapisuje się tak samo', () => {
  const k = srodowisko();
  try {
    const pozycja = (typ, text, i) => JSON.stringify({
      timestamp: `2026-07-05T17:0${2 + i}:36.402Z`,
      type: 'event_msg',
      payload: { type: 'item_completed', item: { type: typ, text } },
    });
    assert.equal(hakCodeksa(k, rollout('Codex Desktop', [
      pozycja('UserMessage', 'pytanie do Codeksa', 0),
      pozycja('AgentMessage', 'odpowiedź Codeksa', 1),
    ])).status, 0);

    const zapisane = fs.readFileSync(path.join(k.klon, WZGLEDNA_CODEKSA), 'utf8')
      .trim().split('\n').map(JSON.parse);
    assert.deepEqual(zapisane.map(r => r.tekst), ['pytanie do Codeksa', 'odpowiedź Codeksa']);
    assert.deepEqual(zapisane.map(r => r.rola), ['michal', 'claude']);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});

test('wspólny plik haka: format poznaje się z transkryptu, nie z argumentu', () => {
  const k = srodowisko();
  try {
    // dokładnie ten wpis, który Codex zaciąga z hooks/hooks.json — bez argumentu
    const plik = path.join(k.dom, 'rollout.jsonl');
    fs.writeFileSync(plik, rollout('codex_vscode', [wiadomosc('user_message', 'pytanie do Codeksa', 0)]));
    assert.equal(spawnSync('node', [STOP], {
      input: JSON.stringify({ session_id: SESJA_CODEKSA, transcript_path: plik }),
      env: k.env,
      encoding: 'utf8',
    }).status, 0);
    assert.deepEqual(
      fs.readFileSync(path.join(k.klon, WZGLEDNA_CODEKSA), 'utf8').trim().split('\n')
        .map(l => JSON.parse(l).tekst),
      ['pytanie do Codeksa'],
    );

    // ten sam hak z transkryptem Claude'a dalej czyta go jako Claude'a
    assert.equal(hak(k, [['user', 'wymiana 0']]).status, 0);
    assert.equal(fs.existsSync(path.join(k.klon, WZGLEDNA)), true);
    assert.equal(fs.existsSync(AWARIA(k)), false);
  } finally {
    fs.rmSync(k.dom, { recursive: true, force: true });
  }
});
