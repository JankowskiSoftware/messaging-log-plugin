# messaging-log-plugin

Cały kod zapisu rozmów: filtr transkryptów, hak sesyjny obu narzędzi, skill,
zadanie retencji i pierwszy przebieg. Dane mieszkają osobno, w repo
`messaging-log` (ADR 0003), a godzinowe sekcje aktywności liczy repo `personal`
(ADR 0006) — tutaj nie ma ani jednego pisarza tych sekcji.

Bez zależności zewnętrznych. Testy: `node --test`.

## Instalacja

Na obu komputerach dokładnie to samo, z klonu odbitego na tagu wersji — nie
prosto z GitHuba, bo tamten adres ciągnie gałąź domyślną i obie maszyny
rozjechałyby się same:

```
git clone https://github.com/JankowskiSoftware/messaging-log-plugin %USERPROFILE%\repos\messaging-log-plugin
git -C %USERPROFILE%\repos\messaging-log-plugin checkout v0.2.1
```

```
/plugin marketplace add %USERPROFILE%\repos\messaging-log-plugin
/plugin install messaging-log@messaging-log
```

Odbicie na tagu stoi w miejscu: dopóki ktoś ręcznie nie wpisze `git fetch --tags`
i `git checkout <nowszy tag>`, wersja się nie rusza. Automatycznego
aktualizatora nie ma i nie będzie. Wydanie to podbicie wersji w trzech
manifestach (`package.json` i oba `plugin.json` — pilnuje tego
`test/wersja.test.mjs`), tag `vX.Y.Z` i `git push --tags`.

To samo odbicie obsługuje oba narzędzia: Claude Code bierze `.claude-plugin`,
Codex `.codex-plugin`, hak jest jeden.

## Dwa komputery

Pierwszy skonfigurowany komputer jest **pełnym właścicielem**: zapisuje rozmowy
z Claude Code i z Codeksa, i do tego liczy godzinowe sekcje aktywności. Drugi
jest **tylko zapisujący**: zapisuje rozmowy z obu narzędzi i sekcji nie liczy
nigdy.

Pełny właściciel to instalacja powyżej, `AKTYWNOSC/setup-ClaudeAktywnosc.cmd`
z repo `personal` — zakłada znacznik `~/.messaging-log-wlasciciel` i rejestruje
godzinowe zadanie pisarza aktywności — plus dobowe zadanie retencji niżej.
Tylko zapisujący to instalacja powyżej i nic
więcej — bez znacznika pisarz aktywności kończy przebieg, zanim cokolwiek
odświeży czy zapisze, także puszczony z ręki. Dwóch pisarzy tego samego pliku
więc nie będzie.

Nazw komputerów, wyboru właściciela, wymiany stanu między maszynami ani
automatycznego przejęcia roli nie ma. Wyłączony pełny właściciel wstrzymuje
sekcje do swojego następnego zwykłego przebiegu godzinowego, który nadrabia
zaległość z różnicy zatwierdzeń — drugi komputer nie przejmuje niczego i przez
ten czas dalej tylko zapisuje.

Podpowiedź do wklejenia w sesji na drugim komputerze:

```
Skonfiguruj ten komputer jako TYLKO ZAPISUJĄCY dla Messaging Loga.
1. git clone https://github.com/JankowskiSoftware/messaging-log-plugin %USERPROFILE%\repos\messaging-log-plugin
2. git -C %USERPROFILE%\repos\messaging-log-plugin checkout v0.2.1   (ta sama wersja co na pierwszym komputerze)
3. /plugin marketplace add %USERPROFILE%\repos\messaging-log-plugin oraz /plugin install messaging-log@messaging-log
4. Wpisz token do repo messaging-log w ~/.messaging-log-token
Nie zakładaj ~/.messaging-log-wlasciciel i nie uruchamiaj
AKTYWNOSC/setup-ClaudeAktywnosc.cmd z repo personal — sekcje aktywności liczy
wyłącznie pierwszy komputer.
```

To samo repo jest wtyczką Codeksa (`.codex-plugin/plugin.json`). Plik haka jest
jeden i wspólny — `hooks/hooks.json`, bo dokładnie stamtąd Codex czyta swoje
zdarzenie Stop — więc rozmowy z obu narzędzi idą jednym torem: filtr, plik sesji,
zatwierdzenie, wypchnięcie i ten sam ślad awarii. Osobnego `hooks.json`
w korzeniu nie ma i mieć nie może: Codex go nie rejestruje, a dublował tylko
wpis, przez który hak dostawał argument `codex` raz tak, raz nie.

Który to format transkryptu, poznaje `zrodloTranskryptu()` po kształcie linii
(rollout Codeksa ma `session_meta`/`event_msg`, transkrypt Claude'a
`user`/`assistant`) — nigdy po treści rozmowy i nigdy po argumencie wywołania.
Czytane są oba zapisy wymian Codeksa: starszy `user_message`/`agent_message`
i bieżący Desktopowy `item_completed` z `UserMessage`/`AgentMessage`.

Brama zdatności stoi wyłącznie na natywnych polach zdarzenia — `hook_event_name`,
`agent_id`, `agent_type`: tura podagenta odpada przed zapisem, tura główna, która
sama odpaliła podagenty, wchodzi normalnie.

Ostrzeżenie o zaległości wypisuje jeden, synchroniczny `hooks/ostrzezenie.mjs`,
ten sam dla obu hostów — wyjście haka asynchronicznego do Michała nie dociera.

Token drobnoziarnisty do repo `messaging-log` (Contents: read and write) ląduje
w `~/.messaging-log-token`, a w paczce `.plugin` w `token.txt` obok pluginu.
Bez tokenu hak i tak zapisze rozmowę i spróbuje wypchnąć ją poświadczeniami
gita — token jest po to, żeby działało też tam, gdzie ich nie ma.

Hak chodzi asynchronicznie (limit 20 s), więc nie przedłuża tury. Cena: wynik haka
z flagą `async` Claude Code wyrzuca do kosza, więc awarii nie widać w samym haku —
dlatego zostawia ślad w `~/.messaging-log-awaria` i w `~/.messaging-log-hak.log`,
a przy następnej turze pokazuje go synchroniczny `hooks/ostrzezenie.mjs`. Zgubić
da się najwyżej ostatnią turę sesji, jeśli kontener zniknie w trakcie zapisu.

## Gdzie mieszka token

Repo pluginu jest publiczne — zawiera wyłącznie kod. Token do repo danych
nigdy nie trafia do gita (`token.txt` i `*.plugin` są w `.gitignore`,
historia sprawdzona) i żyje dokładnie w trzech miejscach, każde poza repo:
`~/.messaging-log-token` na maszynie lokalnej, w paczce `.plugin` wgranej na
claude.ai i w polu *Setup script* środowiska chmurowego. Same rozmowy leżą
w prywatnym repo `messaging-log` (ADR 0003, ADR 0005).

## Paczka do Coworku

```
npm run spakuj
```

Buduje `~/messaging-log.plugin` z **zatwierdzonego** stanu repo i dokłada token
z `~/.messaging-log-token` jako `token.txt` — przez katalog tymczasowy, więc
ani token, ani paczka nigdy nie leżą w katalogu repo. Paczka idzie na claude.ai przez
Customize → Plugins i jest w Coworku jedynym nośnikiem — także poświadczenia,
bo kontener nie ma skąd go wziąć (ADR 0001).

## Skrypt startowy sesji chmurowej

`setup-cloud.sh` jest gotowym skryptem do pola *Setup script* środowiska
chmurowego: trzy kropki w prawym górnym rogu sesji → *Edit environment*.
Przed wklejeniem zastąp `__MESSAGING_LOG_TOKEN__` tokenem do repo danych.
Skrypt instaluje Ponytail i Messaging Log oraz klonuje repo danych.

Migawka systemu plików trzyma wynik do następnej zmiany skryptu albo mniej
więcej siedem dni. Pluginy z repo gitowego nie odświeżają się same, więc
aktualizacją w chmurze jest zmiana skryptu — dowolna, bo unieważnia migawkę.

Klon repo danych powstaje sam przy pierwszej turze, pod `~/.messaging-log`.
Kiedy coś nie wyjdzie, hak zostawia ślad awarii, a ostrzeżenie o nim wychodzi
przy następnej turze; ta sama linia trafia do `~/.messaging-log-hak.log`. Skrypt startowy na koniec
sprawdza, czy plugin faktycznie się zainstalował i czy klon powstał — nieudana
instalacja wygląda inaczej niż udana.

## Skill „co robiłem"

Pytanie „co robiłem wczoraj" albo „co robiłem w ostatnie dwa tygodnie" w dowolnej
sesji i dowolnym repozytorium — także z telefonu — uruchamia
`skills/co-robilem/SKILL.md`. Skill odświeża klon i woła
`bin/co-robilem.mjs [od] [do]`, który wypisuje wiersze dobowe pogrupowane po
godzinie i repozytorium. Bez argumentów wypisuje wczoraj.

Dziennik `godziny/` jest **zamknięty na 2026-08-25** — od przełączenia nikt do
niego nie dopisuje, więc skill odpowiada z niego wyłącznie o dniach sprzed tej
daty. Od tego dnia bieżące odpowiedzi stoją w plikach aktywności repo `personal`
(`AKTYWNOSC/dni/<doba>.md`); skill mówi to wprost, zamiast zgłaszać `brak zapisu`.

Godziny, w których były rozmowy, ale nie ma wierszy, wychodzą jako
`bez wierszy: 14, 15`. Skill nie zapisuje ani jednego bajtu do repo.

Skrypt działa też z ręki, bez sesji Claude'a — wiersze są czytelne same z siebie,
skill tylko skraca drogę.

## Zadanie retencji

`bin/retencja.mjs` kasuje katalogi dobowe `rozmowy/` starsze niż sześćdziesiąt dni
(ADR 0004) i wypycha to skasowanie. Poza tym nie pisze niczego. Chodzi raz na dobę,
na maszynie pełnego właściciela:

```
schtasks /create /tn messaging-log-retencja /sc daily /st 04:00 /f ^
  /tr "node %USERPROFILE%\repos\messaging-log-plugin\bin\retencja.mjs"
```

Dziennik godzinowy nie jest kasowany nigdy, więc po sześćdziesięciu dniach
z danego dnia zostaje historia w `godziny/` i sekcje aktywności w repo `personal`.

Nieudane pobranie ani nieudane wypchnięcie nie są awarią: skasowanie zostaje
lokalnie i pójdzie ze zwykłym wypchnięciem następnego haka. Każdy przebieg
zostawia linię w `~/.messaging-log-retencja.log`.

## Przełączenie ze starego zadania godzinowego

Zadanie `messaging-log-godzina` — godzinowy skan rolloutów Codeksa z dysku plus
pisarz wierszy `godziny/<doba>.csv` — jest wycofane. Rozmowy obu narzędzi zapisuje
natywny hak Stop po każdej turze, godzinowe sekcje aktywności liczy repo
`personal`, a stare katalogi kasuje zadanie retencji. Na maszynie, na której
zadanie jest jeszcze zarejestrowane, wyrejestrowanie brzmi:

```
schtasks /delete /tn messaging-log-godzina /f
```

Kolejność ma znaczenie: zadanie retencji ma już chodzić, zanim tamto zniknie —
inaczej przez cykl nikt nie kasuje starych rozmów.

## Pierwszy przebieg

```
node bin/pierwszy-przebieg.mjs
```

Jednorazowo, przy zakładaniu systemu, żeby nie startował od pustego repo. Dociąga trzydzieści dni rozmów z obu źródeł — transkrypty Claude'a
z `~/.claude/projects` i rollouty Codeksa — a potem liczy wiersze dziennika za
ostatnie pięć dni, czyli kilkadziesiąt wywołań taniego modelu. Rozmowy idą tym
samym filtrem i tą samą funkcją zapisu co warstwa sesyjna, więc w `rozmowy/`
leży jeden format.

Puszczony drugi raz nie duplikuje ani jednej wymiany i nie rusza wierszy
policzonych wcześniej. Zamek jest tu twardym warunkiem: przy zajętym przebieg
kończy się błędem, zamiast pisać obok haka.

Po przełączeniu jest to skrypt historyczny: wiersze dopisuje do zamkniętego
dziennika `godziny/`, a bieżące sekcje aktywności i tak liczy pisarz z repo
`personal`, z surowych rozmów. Świeżej maszynie wystarcza sam zapas rozmów.

Pytanie o pełne cztery tygodnie zacznie dawać kompletną odpowiedź dopiero po
trzech tygodniach działania systemu — poszerzenie okna to `DNI_WIERSZY`
w skrypcie.

Przebieg zostawia linię w `~/.messaging-log-godzina.log`. Model woła się przez CLI
Claude Code (`claude -p --model haiku`), raz na koszyk. Nieudane wywołanie nie
tworzy wierszy.
