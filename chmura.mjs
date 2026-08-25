#!/usr/bin/env node
// Wypisuje skrypt startowy środowiska chmurowego (ticket 05, ADR 0002).
// Środowisko należy do konta, nie do repozytorium — dlatego to jedyne miejsce,
// w którym plugin włącza się raz dla wszystkich repozytoriów.
// Skrypt idzie do pola Setup script: trzy kropki w prawym górnym rogu sesji →
// Edit environment.
//
//   node chmura.mjs [plik-tokenu] [plik-wyjściowy]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PLUGIN = 'JankowskiSoftware/messaging-log-plugin';
const DANE = 'JankowskiSoftware/messaging-log';
const PONYTAIL = 'DietrichGebert/ponytail';

const zrodloTokenu = path.resolve(process.argv[2] ?? path.join(os.homedir(), '.messaging-log-token'));
const wyjscie = process.argv[3] ? path.resolve(process.argv[3]) : null;
const token = fs.readFileSync(zrodloTokenu, 'utf8').trim();
if (!token) throw new Error(`pusty plik tokenu: ${zrodloTokenu}`);
// token siedzi w skrypcie w apostrofach; z apostrofem w środku skrypt by się rozjechał
if (token.includes("'")) throw new Error('token zawiera apostrof');

// Kolejność wiążąca (ADR 0002): marketplace przed instalacją, inaczej instalacja
// trafia w moment, w którym klon jeszcze nie istnieje.
// Niezerowy kod wyjścia uniemożliwia start sesji, więc cały blok kończy się `|| true`.
const skrypt = `#!/bin/bash
mkdir -p ~/.claude
cat > ~/.claude/settings.json <<'USTAWIENIA'
{
  "extraKnownMarketplaces": {
    "ponytail": { "source": { "source": "github", "repo": "${PONYTAIL}" } },
    "messaging-log": { "source": { "source": "github", "repo": "${PLUGIN}" } }
  },
  "enabledPlugins": {
    "ponytail@ponytail": true,
    "messaging-log@messaging-log": true
  }
}
USTAWIENIA
umask 077
TOKEN='${token}'
printf '%s\\n' "$TOKEN" > ~/.messaging-log-token
{
  # ADR 0001: proxy kontenera obsługuje wyłącznie repozytoria przypisane do sesji
  unset https_proxy HTTPS_PROXY http_proxy HTTP_PROXY all_proxy ALL_PROXY
  claude plugin marketplace add ${PONYTAIL}
  claude plugin install ponytail@ponytail --scope user
  claude plugin marketplace add ${PLUGIN}
  claude plugin install messaging-log@messaging-log --scope user
  git clone --depth 1 "https://oauth2:$TOKEN@github.com/${DANE}.git" ~/.messaging-log
  git -C ~/.messaging-log remote set-url origin https://github.com/${DANE}.git
} > /tmp/messaging-log-setup.log 2>&1 || true
exit 0
`;

if (wyjscie) fs.writeFileSync(wyjscie, skrypt, { mode: 0o600 });
else process.stdout.write(skrypt);
