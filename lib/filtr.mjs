// Jedyne miejsce w systemie, gdzie transkrypt zamienia sie w rekordy rozmowy.
// Wola to hak Stop, zadanie godzinowe i pierwszy przebieg — patrz ADR 0003.

const OBUDOWA = ['<command-message>', '<command-name>', '<local-command-', '<system-reminder>'];

const repoZeSciezki = (cwd = '') => cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

// Doklejonych blokow na koncu bywa kilka pod rzad, wiec obcinamy je wszystkie.
const oczysc = (tekst) =>
  tekst.replace(/(?:\s*<system-reminder>[\s\S]*?<\/system-reminder>)+\s*$/, '').trim();

function parsuj(tresc) {
  const linie = [];
  for (const linia of tresc.split('\n')) {
    if (!linia.trim()) continue;
    try {
      linie.push(JSON.parse(linia));
    } catch {
      // ucieta ostatnia linia albo smiec — pomijamy
    }
  }
  return linie;
}

function zClaude(linie) {
  const rekordy = [];
  for (const o of linie) {
    if (o.isSidechain || o.isMeta) continue;
    if (o.type !== 'user' && o.type !== 'assistant') continue;
    if (o.type === 'user' && o.toolUseResult) continue;

    const tresc = o.message?.content;
    const tekst = oczysc(
      typeof tresc === 'string'
        ? tresc
        : Array.isArray(tresc)
          ? tresc.filter((b) => b.type === 'text').map((b) => b.text).join('')
          : '',
    );
    if (!tekst) continue;
    if (OBUDOWA.some((znacznik) => tekst.startsWith(znacznik))) continue;

    rekordy.push({
      ts: o.timestamp,
      kanal: o.entrypoint,
      sesja: o.sessionId,
      repo: repoZeSciezki(o.cwd),
      rola: o.type === 'user' ? 'michal' : 'claude',
      tekst,
      uuid: o.uuid,
    });
  }
  return rekordy;
}

function zCodeksa(linie) {
  const meta = linie.find((o) => o.type === 'session_meta')?.payload ?? {};
  // Petla automatu, nie Michal — 23 z 24 GB katalogu Codeksa.
  if (meta.originator === 'codex_exec') return [];

  const rekordy = [];
  linie.forEach((o, i) => {
    if (o.type !== 'event_msg') return;
    const p = o.payload || {};
    if (p.type !== 'user_message' && p.type !== 'agent_message') return;
    const t = p.message ?? p.text ?? '';
    if (!t.trim()) return;

    rekordy.push({
      ts: o.timestamp,
      kanal: meta.originator,
      sesja: meta.id,
      repo: repoZeSciezki(meta.cwd),
      rola: p.type === 'user_message' ? 'michal' : 'claude',
      tekst: t.trim(),
      // Linie Codeksa nie maja wlasnego znacznika, wiec syntetyzujemy z numeru linii.
      uuid: `${meta.id}#${i + 1}`,
    });
  });
  return rekordy;
}

/**
 * @param {string} tresc pelna tresc pliku transkryptu
 * @param {'claude'|'codex'} zrodlo
 * @param {string} [uuidOd] znacznik ostatniej zapisanej linii; nieznany albo brak = od poczatku
 * @returns rekordy o siedmiu polach, gotowe do dopisania
 */
export function filtruj(tresc, zrodlo, uuidOd) {
  const linie = parsuj(tresc);
  const rekordy = zrodlo === 'codex' ? zCodeksa(linie) : zClaude(linie);
  const od = uuidOd ? rekordy.findIndex((r) => r.uuid === uuidOd) : -1;
  return od === -1 ? rekordy : rekordy.slice(od + 1);
}
