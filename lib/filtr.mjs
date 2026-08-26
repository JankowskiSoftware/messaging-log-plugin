// Filtr rozmów: transkrypt → rekordy gotowe do dopisania.
// Jedyne miejsce w systemie, gdzie ta logika istnieje — wołają ją hak sesyjny
// i pierwszy przebieg. Czysta funkcja, zero wejścia-wyjścia.

const OBUDOWA_KOMEND = ['<command-message>', '<command-name>', '<local-command-'];

const nazwaRepo = cwd => String(cwd ?? '').split(/[\\/]/).filter(Boolean).at(-1) ?? '';

/** Obcina doklejone bloki <system-reminder>; treści przed nimi nie rusza. */
const oczysc = tekst => tekst.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();

function* linie(tresc) {
  let numer = 0;
  for (const linia of tresc.split('\n')) {
    numer++;
    if (!linia.trim()) continue;
    try {
      yield [JSON.parse(linia), numer];
    } catch {
      // ucięta albo uszkodzona linia — pomijamy, reszta pliku jest dobra
    }
  }
}

function rekordyClaude(tresc) {
  const rekordy = [];
  for (const [o] of linie(tresc)) {
    if (o.type !== 'user' && o.type !== 'assistant') continue;
    if (o.isSidechain || o.isMeta) continue;
    // przebieg bezinteraktywny (`claude -p`), symetrycznie do codex_exec — to nie rozmowa
    if (o.entrypoint === 'sdk-cli') continue;

    const tresci = o.message?.content;
    const bloki = typeof tresci === 'string' ? [{ type: 'text', text: tresci }] : tresci;
    if (!Array.isArray(bloki)) continue;
    // wynik narzędzia odrzuca całą linię, nie tylko swój blok
    if (bloki.some(b => b.type === 'tool_result')) continue;

    // bierzemy wyłącznie bloki text — rozumowanie i wywołania narzędzi odpadają
    const tekst = oczysc(bloki.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n'));
    if (!tekst) continue;
    if (OBUDOWA_KOMEND.some(obudowa => tekst.startsWith(obudowa))) continue;

    rekordy.push({
      ts: o.timestamp,
      // pochodzenia nigdy nie zgadujemy z treści — brak znaczy `unknown`
      kanal: o.entrypoint ?? 'unknown',
      sesja: o.sessionId,
      repo: nazwaRepo(o.cwd),
      rola: o.type === 'user' ? 'michal' : 'claude',
      tekst,
      uuid: o.uuid,
    });
  }
  return rekordy;
}

const ROLE_CODEKSA = { user_message: 'michal', agent_message: 'claude' };

/** `UserMessage` bieżącego Desktopa i `user_message` starszych wydań to ta sama rola. */
const rolaCodeksa = typ =>
  ROLE_CODEKSA[String(typ ?? '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()];

function rekordyCodex(tresc) {
  const rekordy = [];
  let sesja = '';
  let kanal = 'unknown';
  let repo = '';
  for (const [o, numer] of linie(tresc)) {
    if (o.type === 'session_meta') {
      const p = o.payload ?? {};
      // przebiegi maszynowe to pętla automatu, nie rozmowa — nigdy nie zapisujemy
      if (p.originator === 'codex_exec') return [];
      sesja = p.session_id ?? p.id ?? '';
      kanal = p.originator ?? 'unknown';
      repo = nazwaRepo(p.cwd);
      continue;
    }
    // starsze wydania pakują wymianę w `event_msg`, bieżący Desktop w `item_completed`
    const p = o.type === 'event_msg' ? (o.payload ?? {}) : o;
    const w = p.type === 'item_completed' ? (p.item ?? {}) : p;
    const rola = rolaCodeksa(w.type ?? w.item_type);
    if (!rola) continue;
    const tekst = (w.message ?? w.text ?? '').trim();
    if (!tekst) continue;

    rekordy.push({
      ts: o.timestamp,
      kanal,
      sesja,
      repo,
      rola,
      tekst,
      // linie Codeksa nie mają własnego znacznika — syntetyzujemy, żeby
      // wznawianie było identyczne dla obu źródeł
      uuid: `${sesja}#${numer}`,
    });
  }
  return rekordy;
}

/** Ogon listy za znacznikiem. Nieznany znacznik albo jego brak znaczy całość. */
export function odZnacznika(rekordy, odUuid) {
  const od = odUuid ? rekordy.findIndex(r => r.uuid === odUuid) : -1;
  return od === -1 ? rekordy : rekordy.slice(od + 1);
}

const LINIE_CODEKSA = new Set(['session_meta', 'event_msg', 'response_item', 'turn_context', 'item_completed']);

/**
 * Źródło rozpoznane po kształcie linii transkryptu, nigdy po treści rozmowy:
 * rollout Codeksa ma własne typy linii, transkrypt Claude'a `user`/`assistant`.
 * Dzięki temu ten sam hak działa też tam, gdzie host woła go bez argumentu —
 * Codex zaciąga wspólne `hooks/hooks.json` i argumentu `codex` nie przekazuje.
 * @param {string} tresc
 * @returns {'claude'|'codex'}
 */
export function zrodloTranskryptu(tresc) {
  for (const [o] of linie(tresc)) return LINIE_CODEKSA.has(o.type) ? 'codex' : 'claude';
  return 'claude';
}

/**
 * @param {string} tresc treść pliku transkryptu
 * @param {'claude'|'codex'} [zrodlo] domyślnie rozpoznane z kształtu transkryptu
 * @param {string} [odUuid] znacznik ostatniej już zapisanej wymiany
 * @returns {Array<{ts:string,kanal:string,sesja:string,repo:string,rola:string,tekst:string,uuid:string}>}
 */
export function transkryptNaRekordy(tresc, zrodlo, odUuid) {
  const wybrane = zrodlo ?? zrodloTranskryptu(tresc);
  return odZnacznika(wybrane === 'codex' ? rekordyCodex(tresc) : rekordyClaude(tresc), odUuid);
}
