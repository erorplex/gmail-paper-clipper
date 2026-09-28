# MailClip für Gmail

Chrome-Erweiterung, die Gmail-Mails mit einem Klick kopiert: Betreff, Absender, Empfänger, Cc, Datum und Text.
Auf Wunsch kommen alle Anhänge als **echte Dateien** mit, also so, als hättest du sie im Finder kopiert.

*English summary: Chrome extension that copies a Gmail email or a whole thread to the clipboard. Optionally the
attachments come along as real files (via a small macOS helper), so ⌘V in Claude, ChatGPT, Slack or Finder pastes
the PDFs, not just text. Everything runs locally.*

## Buttons

| Wo | Button | Ergebnis |
| --- | --- | --- |
| an jeder geöffneten Mail | **Kopieren** | Kopfzeilen und Text dieser Mail als Text |
| an jeder geöffneten Mail | **Mit Anhängen** | Text und alle Anhänge als Dateien |
| unter dem Betreff | **Verlauf kopieren** | alle Mails des Verlaufs, nummeriert, ohne doppelte Zitate |
| unter dem Betreff | **Verlauf + Anhänge** | Verlauf und alle Anhänge (jeder Anhang nur einmal) |

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

Bei den Anhang-Buttons liegen danach in der Zwischenablage:

- der Text, für normale Textfelder,
- `<Betreff>.txt` mit demselben Text als Datei,
- jeder Anhang als Datei.

Warum auch die `.txt`-Datei? Web-Apps wie Claude oder ChatGPT übernehmen beim Einfügen die Dateien und lassen
den Text weg. Mit der `.txt` kommt der Mailtext trotzdem an.

## Installation (macOS)

1. **Helfer installieren.** Nötig nur für die Anhang-Buttons. Einmal im Terminal ausführen:

   ```bash
   ./install.sh
   ```

   Das Skript kompiliert den Helfer (`host/MailClipHelper.swift`) und meldet ihn bei Chrome an, außerdem bei
   Chrome Beta/Canary, Chromium, Brave, Edge und Arc, falls vorhanden. Voraussetzung ist Swift (`xcode-select --install`).

2. **Erweiterung laden.**
   1. `chrome://extensions` öffnen.
   2. Rechts oben den **Entwicklermodus** einschalten.
   3. **Entpackte Erweiterung laden** klicken und diesen Ordner wählen.

3. Gmail neu laden und eine Mail öffnen.

Entfernen: `./uninstall.sh` und die Erweiterung unter `chrome://extensions` löschen.

## So funktioniert es

- Die Erweiterung liest jede Mail über Gmails eigene Funktion „Original herunterladen“ als Rohmail (RFC 822).
  Darin stecken alle Kopfzeilen und Anhänge. Geladen wird mit deiner bestehenden Gmail-Sitzung, ohne Google-API
  und ohne Anmeldung.
- `src/mime.js` zerlegt die Rohmail: Zeichensätze, Quoted-Printable/Base64, RFC-2047/2231-Namen, `format=flowed`.
- `src/format.js` baut daraus den Text. Im Verlauf wird zitierter Antwortverlauf („Am … schrieb …“, „On … wrote“,
  Outlook-Kopfblöcke) abgeschnitten, weitergeleitete Mails bleiben erhalten.
- Kleine eingebettete Bilder unter 30 KB, meist Signatur-Logos, werden übersprungen. Eingefügte Screenshots
  kommen mit.
- Die Anhang-Buttons schicken Text und Dateien an den Mac-Helfer (Chrome Native Messaging). Der Helfer legt sie
  unter `~/Library/Caches/MailClip` ab und schreibt Text und Dateien in die macOS-Zwischenablage. Kopien, die
  älter als eine Stunde sind, löscht er beim nächsten Kopieren.

**Datenschutz:** Nichts verlässt deinen Rechner. Es gibt keinen Server, kein Tracking und keine Fremdbibliotheken.

## Grenzen

- Die Anhang-Buttons gibt es nur auf macOS. Die Text-Buttons laufen überall, wo Chrome läuft.
- Google-Drive-Links in Mails sind keine Anhänge und werden nicht mitkopiert.
- Gmail ändert gelegentlich sein HTML. Alles, was davon abhängt (Selektoren, URL), steht gebündelt in
  `src/gmail.js`.
- Der Helfer ist für eine bestimmte Erweiterungs-ID freigegeben. `manifest.json` legt sie über `key` fest.
  Wer eine eigene ID nutzt, ruft `./install.sh <id>` auf.

## Entwicklung

```bash
npm test          # Parser- und Format-Tests (Node ≥ 20, keine Abhängigkeiten)
npm run icons     # Icons neu rendern
```

`tools/paste-probe.html` zeigt, was eine Webseite beim Einfügen aus der Zwischenablage bekommt: Typen, Text und
Dateien.

Aufbau:

```
manifest.json         MV3-Manifest
src/content.js        Buttons, Hinweise, Ablauf beim Kopieren
src/gmail.js          alles Gmail-Spezifische (DOM, Rohmail-URL)
src/mime.js           MIME-Parser
src/format.js         Textausgabe, Zitate kürzen, Dateiliste
src/background.js     Weiterleitung zum Mac-Helfer
host/                 Mac-Helfer (Swift)
install.sh            Helfer bauen und anmelden
```

## Lizenz

MIT, siehe [LICENSE](LICENSE).
