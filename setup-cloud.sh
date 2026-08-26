#!/bin/bash
# ZASTĄP poniższy placeholder tokenem GitHub do repo messaging-log.
TOKEN='__MESSAGING_LOG_TOKEN__'

mkdir -p ~/.claude
cat > ~/.claude/settings.json <<'USTAWIENIA'
{
  "extraKnownMarketplaces": {
    "ponytail": { "source": { "source": "github", "repo": "DietrichGebert/ponytail" } },
    "messaging-log": { "source": { "source": "github", "repo": "JankowskiSoftware/messaging-log-plugin" } }
  },
  "enabledPlugins": {
    "ponytail@ponytail": true,
    "messaging-log@messaging-log": true
  }
}
USTAWIENIA
umask 077
printf '%s\n' "$TOKEN" > ~/.messaging-log-token
{
  # ADR 0001: proxy kontenera obsługuje wyłącznie repozytoria przypisane do sesji
  unset https_proxy HTTPS_PROXY http_proxy HTTP_PROXY all_proxy ALL_PROXY
  claude plugin marketplace add DietrichGebert/ponytail
  claude plugin install ponytail@ponytail --scope user
  claude plugin marketplace add JankowskiSoftware/messaging-log-plugin
  claude plugin install messaging-log@messaging-log --scope user
  git clone --depth 1 "https://oauth2:$TOKEN@github.com/JankowskiSoftware/messaging-log.git" ~/.messaging-log
  git -C ~/.messaging-log remote set-url origin https://github.com/JankowskiSoftware/messaging-log.git

  # Cicha awaria instalacji wygląda dokładnie jak sukces — a bez pluginu nie ma haka
  # i rozmowy z chmury nie trafiają nigdzie. Sprawdzamy wynik, nie przebieg.
  grep -q 'messaging-log@messaging-log' ~/.claude/plugins/installed_plugins.json \
    || echo "BŁĄD: plugin messaging-log nie zainstalowany — hak Stop nie ruszy"
  [ -d ~/.messaging-log/.git ] || echo "BŁĄD: klon repo danych nie powstał — sprawdź token"
# tee zamiast przekierowania do /tmp: log środowiska chmurowego jest jedynym miejscem,
# gdzie widać, czemu instalacja padła. sed pilnuje, żeby token tam nie wyciekł.
} 2>&1 | sed "s|$TOKEN|***|g" | tee /tmp/messaging-log-setup.log
exit 0
