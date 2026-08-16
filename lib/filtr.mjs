// Filtr rozmów: transkrypt → rekordy gotowe do dopisania.
// Jedyne miejsce w systemie, gdzie ta logika istnieje — wołają ją hak sesyjny,
// zadanie godzinowe i pierwszy przebieg. Czysta funkcja, zero wejścia-wyjścia.

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
      kanal: o.entrypoint,
      sesja: o.sessionId,
      repo: nazwaRepo(o.cwd),
      rola: o.type === 'user' ? 'michal' : 'claude',
      tekst,
      uuid: o.uuid,
    });
  }
  return rekordy;
}

function rekordyCodex(tresc) {
  const rekordy = [];
  let sesja = '';
  let kanal = '';
  let repo = '';
  for (const [o, numer] of linie(tresc)) {
    if (o.type === 'session_meta') {
      const p = o.payload ?? {};
      // przebiegi maszynowe to pętla automatu, nie rozmowa — nigdy nie zapisujemy
      if (p.originator === 'codex_exec') return [];
      sesja = p.session_id ?? p.id ?? '';
      kanal = p.originator ?? '';
      repo = nazwaRepo(p.cwd);
      continue;
    }
    if (o.type !== 'event_msg') continue;
    const p = o.payload ?? {};
    if (p.type !== 'user_message' && p.type !== 'agent_message') continue;
    const tekst = (p.message ?? p.text ?? '').trim();
    if (!tekst) continue;

    rekordy.push({
      ts: o.timestamp,
      kanal,
      sesja,
      repo,
      rola: p.type === 'user_message' ? 'michal' : 'claude',
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

/**
 * @param {string} tresc treść pliku transkryptu
 * @param {'claude'|'codex'} zrodlo
 * @param {string} [odUuid] znacznik ostatniej już zapisanej wymiany
 * @returns {Array<{ts:string,kanal:string,sesja:string,repo:string,rola:string,tekst:string,uuid:string}>}
 */
export function transkryptNaRekordy(tresc, zrodlo, odUuid) {
  return odZnacznika(zrodlo === 'codex' ? rekordyCodex(tresc) : rekordyClaude(tresc), odUuid);
}
