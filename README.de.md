# Paper Clipper für Gmail

**Eine Gmail-Mail oder einen ganzen Verlauf mit einem Klick kopieren: Betreff, Absender, Empfänger, Datum und Text.
Auf Wunsch kommen die Anhänge als echte Dateien mit. Zu jedem Verlauf kannst du eigene Notizen schreiben.**

Mit ⌘V einfügen in Claude, ChatGPT, Slack, ein Ticket oder den Finder. Die PDFs kommen dabei als PDFs an, nicht als
Textzeile.

🇬🇧 [English README](README.md)

> Paper Clipper ist ein unabhängiges Open-Source-Projekt und steht in keiner Verbindung zu Google.
> Gmail ist eine Marke der Google LLC.

## Funktionen

In Gmail erscheinen zwei Button-Leisten:

| Wo | Button | Was in der Zwischenablage landet |
| --- | --- | --- |
| an jeder geöffneten Mail | **Kopieren** | Kopfzeilen und Text dieser Mail |
| an jeder geöffneten Mail | **Mit Anhängen** | Text und jeder Anhang als Datei |
| unter dem Betreff | **Verlauf kopieren** | alle Mails der Unterhaltung, nummeriert, ohne doppelte Zitate |
| unter dem Betreff | **Verlauf + Anhänge** | der Verlauf und alle Anhänge, jeder nur einmal |
| unter dem Betreff | **Notiz** | öffnet deine Notiz zu diesem Verlauf (siehe [Notizen](#anleitung-notizen)) |

Jeder Kopier-Button zählt, wie oft du diese Mail oder diesen Verlauf damit schon kopiert hast. Die Zahl steht am
Button, der Tooltip zeigt, wann zuletzt. So siehst du sofort, was du schon weitergegeben hast.

Beispiel für **Kopieren**:

```
Betreff: Angebot Q4
Von: Max Muster <max@example.org>
An: Erika Beispiel <erika@example.com>
Cc: Team <team@example.org>
Datum: Di., 22.09.2026, 08:30
Anhänge: Angebot.pdf (240 KB), Skizze.png (39 KB)

Hallo Erika, …
```

Beschriftung und Datumsformat folgen der Sprache des Browsers: Deutsch oder Englisch.

## Anleitung: Installation

### Voraussetzungen

- Google Chrome. Andere Chromium-Browser (Brave, Edge, Arc) gehen auch.
- Für die Anhang-Buttons: macOS mit Apples Kommandozeilen-Werkzeugen. `install.sh` meldet, wenn sie fehlen. Die
  Text-Buttons laufen auf jedem System mit Chrome.

### Schritt 1: Code holen

Leg den Ordner an einen festen Platz. Chrome lädt die Erweiterung bei jedem Start von dort.

```bash
git clone https://github.com/erorplex/gmail-paper-clipper.git ~/gmail-paper-clipper
```

Ohne git: auf GitHub **Code → Download ZIP** klicken, entpacken und den Ordner an einen festen Platz schieben, zum
Beispiel in deinen Benutzerordner. Der entpackte Ordner heißt `gmail-paper-clipper-main`; der Name spielt keine Rolle.

### Schritt 2: Helfer installieren (macOS, für die Anhang-Buttons)

Terminal öffnen, in den Ordner wechseln und das Installationsskript starten:

```bash
cd ~/gmail-paper-clipper && ./install.sh
```

Das Skript kompiliert den kleinen Helfer aus `host/PaperClipperHelper.swift` und meldet ihn bei jedem gefundenen
Chromium-Browser an. Es prüft, ob der Helfer antwortet (`✓ helper responds`), und zeigt die Erweiterungs-ID. Fehlt
Swift, vorher `xcode-select --install` ausführen.

### Schritt 3: Erweiterung in Chrome laden

1. `chrome://extensions` öffnen.
2. Rechts oben den **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** klicken und den Ordner `gmail-paper-clipper` wählen.
4. Optional: Paper Clipper über das Puzzle-Symbol in der Symbolleiste anheften.

### Schritt 4: Ausprobieren

Gmail neu laden und eine Mail öffnen. Die Buttons stehen unter dem Betreff und über dem Text jeder geöffneten Mail.
**Mit Anhängen** klicken, in den Finder wechseln und ⌘V drücken: Die Anhänge erscheinen als Dateien.

## Anleitung: Benutzung

- **Kopieren** und **Verlauf kopieren** legen reinen Text in die Zwischenablage. Das funktioniert in jedem Textfeld.
- **Mit Anhängen** und **Verlauf + Anhänge** legen drei Dinge in die Zwischenablage:
  - den Text, für normale Textfelder,
  - `<Betreff>.txt` mit demselben Text,
  - jeden Anhang als Datei.

  Web-Apps wie Claude oder ChatGPT übernehmen nur die Dateien, sobald Dateien in der Zwischenablage liegen. Mit der
  `.txt`-Datei kommt der Mailtext trotzdem an.
- Die Verlauf-Buttons klappen vorher Gmails Blase „ältere Nachrichten“ auf, damit keine Mail fehlt. Die Bestätigung
  zeigt, wie viele Nachrichten kopiert wurden.
- Im Verlauf wird zitierter Text („Am … schrieb …:“, „On … wrote:“, Outlook-Kopfblöcke) aus jeder Antwort entfernt,
  damit nichts doppelt vorkommt. Weitergeleitete Mails bleiben erhalten. **Kopieren** an einer einzelnen Mail
  behält den vollen Text.
- Kleine eingebettete Bilder unter 30 KB, meist Signatur-Logos, werden übersprungen. Eingefügte Screenshots kommen mit.

## Anleitung: Notizen

- Unter dem Betreff auf **Notiz** klicken und schreiben. Die Notiz speichert sich beim Tippen von selbst.
- Öffnest du den Verlauf wieder, klappt die Notiz von selbst auf und der Button **Notiz** ist hervorgehoben.
- Text leeren löscht die Notiz.
- Ein Klick auf das Paper-Clipper-Symbol in der Chrome-Symbolleiste zeigt alle Notizen: neueste zuerst, mit Suche,
  Link zurück zur Mail, Löschen und **Export** als JSON.
- Notizen und Zähler liegen nur in diesem Browser (`chrome.storage.local`). Sie werden nicht synchronisiert und beim
  Entfernen der Erweiterung gelöscht. Vorher exportieren.

## Aktualisieren

```bash
cd ~/gmail-paper-clipper && git pull && ./install.sh
```

Danach unter `chrome://extensions` bei Paper Clipper auf den Neu-laden-Pfeil klicken und Gmail neu laden.

## Deinstallieren

`./uninstall.sh` ausführen und die Erweiterung unter `chrome://extensions` entfernen.

## Hilfe bei Problemen

| Problem | Lösung |
| --- | --- |
| Keine Buttons in Gmail | Gmail neu laden. Unter `chrome://extensions` prüfen, ob Paper Clipper aktiv ist und keine Fehler zeigt. |
| „Mac-Helfer fehlt“ | Im Ordner der Erweiterung `./install.sh` ausführen, dann Gmail neu laden. Auch nötig, wenn du den Ordner verschoben hast. |
| „Mac-Helfer kennt diese Erweiterung nicht“ | Du hast eine Kopie mit anderer Erweiterungs-ID geladen. `./install.sh` erneut ausführen oder `./install.sh <id>` mit der ID aus `chrome://extensions`. |
| Im kopierten Verlauf fehlen Nachrichten | Den Verlauf einmal ganz aufklappen und erneut kopieren. Bleibt es so, bitte ein [Issue anlegen](https://github.com/erorplex/gmail-paper-clipper/issues/new/choose). |
| Nach einem Gmail-Update geht nichts mehr | Gmail hat sein HTML geändert. Bitte [melden](https://github.com/erorplex/gmail-paper-clipper/issues/new/choose); die Korrektur liegt meist in `src/gmail.js`. |

## Datenschutz

Alles bleibt auf deinem Rechner. Kein Server, kein Tracking, kein fremder Code. Details in [PRIVACY.md](PRIVACY.md).

Technik, Grenzen und Entwicklung: siehe [README.md](README.md).
