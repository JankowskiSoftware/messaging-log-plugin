# messaging-log-plugin

Cały kod dziennika rozmów: filtr transkryptów, hak sesyjny, skill i skrypty
zadania godzinowego. Dane mieszkają osobno, w repo `messaging-log` (ADR 0003).

Bez zależności zewnętrznych. Testy: `node --test`.

## Instalacja

```
/plugin marketplace add JankowskiSoftware/messaging-log-plugin
/plugin install messaging-log@messaging-log
```

Token drobnoziarnisty do repo `messaging-log` (Contents: read and write) ląduje
w `~/.messaging-log-token`, a w paczce `.plugin` w `token.txt` obok pluginu.
Bez tokenu hak i tak zapisze rozmowę i spróbuje wypchnąć ją poświadczeniami
gita — token jest po to, żeby działało też tam, gdzie ich nie ma.

## Paczka do Coworku

```
npm run spakuj
```

Buduje `messaging-log.plugin` z **zatwierdzonego** stanu repo i dokłada token
z `~/.messaging-log-token` jako `token.txt`. Paczka idzie na claude.ai przez
Customize → Plugins i jest w Coworku jedynym nośnikiem — także poświadczenia,
bo kontener nie ma skąd go wziąć (ADR 0001).

## Skrypt startowy sesji chmurowej

```
npm run chmura
```

Wypisuje skrypt do pola *Setup script* środowiska chmurowego: trzy kropki
w prawym górnym rogu sesji → *Edit environment*. Środowisko należy do konta,
więc to jedno wklejenie obowiązuje we wszystkich repozytoriach (ADR 0002).
Skrypt zapisuje ustawienia, token, instaluje plugin i klonuje repo danych.

Migawka systemu plików trzyma wynik do następnej zmiany skryptu albo mniej
więcej siedem dni. Pluginy z repo gitowego nie odświeżają się same, więc
aktualizacją w chmurze jest zmiana skryptu — dowolna, bo unieważnia migawkę.

Klon repo danych powstaje sam przy pierwszej turze, pod `~/.messaging-log`.
Kiedy coś nie wyjdzie, hak milczy i pisze linię do `~/.messaging-log-hak.log`.

## Skill „co robiłem"

Pytanie „co robiłem wczoraj" albo „co robiłem w ostatnie dwa tygodnie" w dowolnej
sesji i dowolnym repozytorium — także z telefonu — uruchamia
`skills/co-robilem/SKILL.md`. Skill odświeża klon i woła
`bin/co-robilem.mjs [od] [do]`, który wypisuje wiersze dobowe pogrupowane po
godzinie i repozytorium. Bez argumentów wypisuje wczoraj.

Godziny, w których były rozmowy, ale nie ma wierszy, wychodzą jako
`bez wierszy: 14, 15` i skill mówi to wprost. Nie odtwarza ich z surowych rozmów —
to droga ścieżka, a przy oknie 48 godzin zadania godzinowego dziury są rzadkie.
Skill nie zapisuje ani jednego bajtu do repo: plik dziennika ma dokładnie jednego
pisarza, którym jest zadanie godzinowe.

Skrypt działa też z ręki, bez sesji Claude'a — wiersze są czytelne same z siebie,
skill tylko skraca drogę.

## Zadanie godzinowe

`bin/godzina.mjs` dopisuje wiersze `godziny/<doba>.csv` za godziny, które już się
zamknęły. Chodzi na **jednej** maszynie — tej stojącej non stop — bo dwóch
pisarzy tego samego pliku rozjedzie się na wypchnięciu. Rejestracja w Harmonogramie
zadań Windows, z tego klonu pluginu:

```
schtasks /create /tn messaging-log-godzina /sc hourly /f ^
  /tr "node %USERPROFILE%\repos\messaging-log-plugin\bin\godzina.mjs"
```

Przed liczeniem koszyków ten sam przebieg dociąga rozmowy z Codeksa —
`~/.codex/sessions/RRRR/MM/DD/rollout-*.jsonl` z okna czterech dób — do plików
per sesja w `rozmowy/`, w tym samym schemacie co rozmowy Claude'a. Codex nie ma
haków, więc nikt inny ich nie zbierze. Przebiegi maszynowe (`codex_exec`) nie
wchodzą nigdy: to 23 z 24 GB tego katalogu i pętla automatu, nie rozmowa.

Ten sam przebieg kasuje katalogi dobowe `rozmowy/` starsze niż sześćdziesiąt dni
(ADR 0004) — w tym samym zatwierdzeniu co wiersze. Dziennik godzinowy nie jest
kasowany nigdy, więc po sześćdziesięciu dniach z danego dnia zostają same wiersze.

## Pierwszy przebieg

```
node bin/pierwszy-przebieg.mjs
```

Jednorazowo, na maszynie z zadaniem godzinowym, żeby system nie startował od
pustego repo. Dociąga trzydzieści dni rozmów z obu źródeł — transkrypty Claude'a
z `~/.claude/projects` i rollouty Codeksa — a potem liczy wiersze dziennika za
ostatnie pięć dni, czyli kilkadziesiąt wywołań taniego modelu. Rozmowy idą tym
samym filtrem i tą samą funkcją zapisu co warstwa sesyjna, więc w `rozmowy/`
leży jeden format.

Puszczony drugi raz nie duplikuje ani jednej wymiany i nie rusza wierszy
policzonych wcześniej. Zamek jest tu twardym warunkiem: przy zajętym przebieg
kończy się błędem, zamiast pisać obok zadania godzinowego.

Pytanie o pełne cztery tygodnie zacznie dawać kompletną odpowiedź dopiero po
trzech tygodniach działania systemu — poszerzenie okna to `DNI_WIERSZY`
w skrypcie.

Każdy przebieg zostawia jedną linię w `~/.messaging-log-godzina.log`. Model woła
się przez CLI Claude Code (`claude -p --model haiku`), raz na koszyk, czyli parę
razy na dobę. Nieudane wywołanie nie tworzy wierszy i koszyk wraca za godzinę.
