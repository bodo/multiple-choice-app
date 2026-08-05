# Lern-, Sitzungs-, Serien-, XP- und Motivationslogik

## Status und Zweck

Dieses Dokument ist die normative Implementierungsspezifikation für die
Lernstatistik. Die lokalen Regeln für Antwortwerte, Sitzungen, Serien,
Basis-/Motivations-XP, XP-Verfall, Rhythmuswerte, Hinweise und die Hilfeseite
sind implementiert. Die private Tagesauszeichnung bleibt ausdrücklich offen,
bis ein authentifiziertes Synchronisationsbackend vorhanden ist.

Ein implementierendes Modell darf die hier festgelegten Werte nicht
stillschweigend ändern oder zusätzliche Gamification ergänzen.

Die Spezifikation verfolgt fünf Ziele:

1. Eine echte Lernpause soll eine neue Sitzung beginnen, ein Reload dagegen
   nicht.
2. Mehrere kurze, ernsthafte Sitzungen sollen etwas mehr XP als eine einzelne
   lange Sitzung mit derselben Zahl wertbarer Antworten bringen.
3. Teilweise richtige Antworten sollen differenziert behandelt werden.
4. Rhythmus, Kontinuität und Verteilung sollen über mehrere Wochen sichtbar
   werden, ohne einen einzelnen ungewöhnlichen Tag zu bestrafen.
5. Motivation soll privat bleiben. Es gibt keine Rangliste und keine Ansicht,
   in der Lernende miteinander verglichen werden.

## Bewusste Nicht-Ziele

- XP ersetzen weder Leitner-Boxen noch Lernstände.
- Lernstufe, Kartenschwierigkeit, Leitner-Box und XP bleiben getrennte Größen.
- Es gibt keine öffentliche oder gruppeninterne Highscore-Liste.
- Es gibt keine künstliche Schaltfläche zum Beenden oder Neustarten einer
  Sitzung, um Bonus-XP zu erzeugen.
- Die spätere Tagesauszeichnung wird nicht im Client entschieden.
- Das Dokument autorisiert keine Backend-Synchronisation und keine Änderung an
  Lernstufen oder Tageszielen außerhalb der ausdrücklich beschriebenen Regeln.

## Normative Konstanten

Alle Zeitstempel werden als UTC-Epoch-Millisekunden gespeichert. Kalendertage
werden erst bei der Auswertung in der Benutzerzeitzone gebildet.

| Konstante | Wert | Bedeutung |
|-----------|------|-----------|
| `SESSION_IDLE_TIMEOUT_MS` | `25 * 60 * 1000` | Inaktivität, die eine Sitzung beendet |
| `SESSION_MIN_ANSWERS` | `3` | Mindestzahl abgegebener Antworten für eine qualifizierte Sitzung |
| `SESSION_MIN_ACTIVE_MS` | `2 * 60 * 1000` | Mindestmaß aktiver Lernzeit |
| `MAX_CREDITED_ANSWER_MS` | `2 * 60 * 1000` | Obergrenze der aktiven Zeit je Antwort |
| `CURRENT_LEVEL_WEIGHT_FACTOR` | `2` | Multiplikator je fälliger Karte auf der aktuellen Lernstufe |
| `RETRY_DISTINCT_CARD_GAP` | `5` | Unterschiedliche Zwischenkarten vor einem erneuten Versuch |
| `RETRY_MIN_WEIGHT` | `10` | Mindestgewicht eines freigegebenen erneuten Versuchs |
| `SESSION_BONUS_START_INDEX` | `4` | Die ersten drei Antworten erhalten keinen Sitzungsbonus |
| `SESSION_BONUS_FACTOR_SHORT` | `1.25` | Faktor für Antwort 4 bis 10 |
| `SESSION_BONUS_FACTOR_ENDURANCE` | `1.10` | Faktor für Antwort 11 bis 30 |
| `SESSION_BONUS_FACTOR_COOLDOWN` | `1.00` | Faktor ab Antwort 31 |
| `MAX_BONUS_SESSIONS_PER_DAY` | `4` | Tagesgrenze für Sitzungsbonus, nicht für Sitzungsstatistik |
| `PARTIAL_THRESHOLD_PERMILLE` | `500` | Ab 0,5 ist eine Antwort teilweise richtig |
| `WEAKSPOT_INCORRECT_LIMIT` | `4` | Vollständig falsche Antworten bis Box 0 |
| `WEAKSPOT_WINDOW_MS` | `24 * 60 * 60 * 1000` | Zeitfenster für die vier falschen Antworten |
| `RHYTHM_WINDOW_DAYS` | `28` | Rollierendes Fenster für Rhythmusmetriken |
| `XP_DECAY_GRACE_DAYS` | `2` | Volle inaktive Kalendertage ohne Verfall |
| `XP_DECAY_AVERAGE_DAYS` | `28` | Fenster für durchschnittliche Tages-XP |
| `XP_DECAY_FACTOR` | `0.50` | Verfall ab dem dritten inaktiven Tag |
| `XP_SCALE` | `1000` | Ganzzahlige Speichereinheiten je angezeigtem XP |

Die Faktoren 1,25 und 1,10 beziehen sich nur auf XP, die durch die jeweilige
Antwort neu verdient werden. Sie multiplizieren niemals den bisherigen
XP-Kontostand.

## Begriffe

### Antwortwert und Ergebnis

Jede abgegebene Antwort besitzt einen Wert `scorePermille` zwischen `0` und
`1000` und genau eines der folgenden Ergebnisse:

| Ergebnis | Bedingung | Bedeutung |
|----------|-----------|-----------|
| `correct` | `scorePermille === 1000` | vollständig richtig |
| `partial` | `500 <= scorePermille < 1000` | teilweise richtig |
| `incorrect` | `scorePermille < 500` | nicht ausreichend richtig |

Die Ganzzahldarstellung verhindert Unterschiede durch
Gleitkomma-Rundungsfehler. Die vorhandene boolesche Eigenschaft `correct` darf
für Abwärtskompatibilität vorübergehend bestehen, wird aber immer aus dem
Ergebnis abgeleitet: Nur `correct` ergibt `true`.

### Sitzung

Eine Sitzung ist eine Folge von Lernaktivitäten, zwischen denen nie mindestens
25 Minuten Inaktivität liegen. Sie beginnt mit der ersten abgegebenen Antwort.
Ein Reload, ein PWA-Update, ein Wechsel zwischen Übung und Exam oder das
Schließen und erneute Öffnen der App innerhalb der 25 Minuten erzeugt keine neue
Sitzung.

Eine Sitzung ist **qualifiziert**, sobald beide Bedingungen erfüllt sind:

- mindestens drei Antworten wurden abgegeben;
- mindestens zwei Minuten aktive Lernzeit wurden angerechnet.

Nicht qualifizierte Sitzungen bleiben als Rohdaten nachvollziehbar, zählen aber
nicht in Rhythmusmetriken und setzen Inaktivitätsverfall nicht zurück.

### Kartenauswahl innerhalb einer Sitzung

Im Übungsmodus werden alle durch Fachrichtung, Kategorie, Gerät und Lernstufe
zugelassenen Karten gemeinsam gewichtet. Eine fällige Karte auf der aktuell
gewählten Lernstufe erhält den Faktor `CURRENT_LEVEL_WEIGHT_FACTOR`; niedrigere
Lernstufen erhalten den Faktor 1. Es gibt keine feste Quote für die aktuelle
Lernstufe. Damit kann eine kleine oder nur aus einer Karte bestehende Lernstufe
nicht einen festen Anteil aller Ziehungen belegen.

Nicht fällige Karten haben im Übungsmodus Gewicht 0. Zusätzlich gelten für die
offene Sitzung folgende Regeln:

- Nach einer vollständig richtigen Antwort bleibt die Karte bis zum Ende der
  Sitzung ausgeschlossen.
- Nach einer teilweise richtigen oder falschen Antwort bleibt die Karte
  ausgeschlossen, bis mindestens `RETRY_DISTINCT_CARD_GAP` unterschiedliche
  andere Karten beantwortet wurden. Danach erhält sie mindestens
  `RETRY_MIN_WEIGHT`.
- Gibt es keine Karte mit positivem Gewicht, zeigt die App den ausgeschöpften
  Lernstand an. Sie wählt nicht ersatzweise die erste oder eine nicht fällige
  Karte.

Diese Regeln verändern weder Leitner-Intervalle noch Lernstufen. Im Examen gilt
weiterhin die einmalige Auswahl ohne Wiederholung innerhalb des Examens.

### Serie

Eine Serie ist eine ununterbrochene Folge von vollständig oder teilweise
richtigen Antworten innerhalb derselben Sitzung. Eine vollständig falsche
Antwort oder das Ende der Sitzung beendet sie. Ein Reload beendet sie nicht.

### XP-Konten

XP werden in zwei getrennten Konten geführt:

- **Basis-XP** (`mastery`): durch Antworten verdient und unverfallbar;
- **Motivations-XP** (`momentum`): Sitzungsbonus und spätere
  Tagesauszeichnung; diese XP können bei längerer Inaktivität verfallen.

Der sichtbare aktuelle Stand ist `Basis-XP + Motivations-XP`. Zusätzlich bleibt
die Summe aller jemals verdienten XP auswertbar. Ein Verfall löscht oder ändert
keine Antwort in der Historie.

## Bewertung der Eingabemodi

### Binäre Modi

`SINGLE_CHOICE`, `TEXT` und `NUMBER` liefern ausschließlich `0` oder `1000`.
Eine nach den bestehenden Regeln akzeptierte unscharfe Texteingabe ist
vollständig richtig und liefert `1000`.

### Multiple Choice

Für `MULTIPLE_CHOICE` gilt:

```text
trefferAnteil = korrektAusgewählt / anzahlKorrekterOptionen
fehlerAnteil  = falschAusgewählt / anzahlFalscherOptionen
score         = clamp(trefferAnteil - fehlerAnteil, 0, 1)
scorePermille = round(score * 1000)
```

Damit lohnt sich das Auswählen aller Optionen nicht. Eine richtige Auswahl wird
durch eine falsche Auswahl wieder gemindert. Leere Mengen und Division durch
null sind durch die bereits vorhandene Schemavalidierung auszuschließen; der
Evaluator muss dennoch defensiv auf `0` zurückfallen.

### Zuordnung

Für `MATCH` gilt:

```text
scorePermille = round(korrekteZeilen / alleZeilen * 1000)
```

Die bestehende Regel, dass jede Zeile vor dem Absenden belegt sein muss, bleibt
unverändert.

### Anzeige

Das Ergebnis muss semantisch und zugänglich angezeigt werden:

- vollständig richtig: vorhandene positive Darstellung;
- teilweise richtig: eigene neutrale Warnfarbe und Text „Teilweise richtig“;
- nicht ausreichend richtig: vorhandene Fehlerdarstellung.

Farbe allein darf das Ergebnis nicht vermitteln. `aria-live` nennt das
Ergebnis. Die Detailmarkierung einzelner Optionen oder Zuordnungen bleibt
erhalten.

## Auswirkungen eines Ergebnisses

| Wirkung | `correct` | `partial` | `incorrect` |
|---------|-----------|-----------|-------------|
| Serie | +1 | +1 | beenden |
| Leitner-Box | nach bestehender Regel erhöhen | unverändert | nach bestehender Regel auf Box 1 |
| Fehlerfolge für Box 0 | auf 0 | auf 0 | +1 |
| Basis-XP | anteilig bis Tagesmaximum | anteilig bis Tagesmaximum | 0 |
| Tagesziel | 1, falls heute noch nicht vollständig gelöst | 0 | 0 |
| Antwortzahl der Sitzung | +1 | +1 | +1 |

„Anteilig bis Tagesmaximum“ gilt für XP und verhindert Mehrfachbelohnung
derselben Karte am selben lokalen Tag. Für XP zählt ein `incorrect`-Ergebnis
unabhängig von seinem Rohwert als null. Pro Karte und Tag wird der bislang beste
wertbare Antwortwert gespeichert beziehungsweise aus Ereignissen ermittelt.
Eine neue Antwort erhält nur die positive Differenz:

```text
creditedScore = outcome === incorrect ? 0 : currentScore
scoreDelta = max(0, creditedScore - bestCreditedScoreToday)
xpDelta = baseXpForCard * scoreDelta
```

Beispiel: Eine Karte wird zuerst mit 0,6 und später vollständig richtig
beantwortet. Die erste Antwort erhält 60 Prozent, die zweite noch 40 Prozent.
Zusammen entstehen nie mehr als 100 Prozent der Basis-XP. Das bestehende
Tagesziel bleibt dagegen binär: Erst die vollständige Lösung erzeugt genau einen
Tagesziel-Punkt für diese Karte. Teilantworten verändern die Definition „30
verschiedene vollständig richtige Karten“ nicht.

## Box 0 bei teilweise richtigen Antworten

Box 0 bleibt eine Intervention für wiederholt vollständig falsche Antworten.
Eine teilweise richtige Antwort zeigt verwertbares Wissen und wird deshalb
nicht wie ein kompletter Fehlschlag behandelt.

Normative Regeln:

1. Nur `incorrect` erhöht die laufende Fehlerfolge.
2. `partial` setzt die laufende Fehlerfolge auf null, verschiebt die Karte aber
   nicht in eine höhere Box.
3. Vier aufeinanderfolgende `incorrect`-Ergebnisse innerhalb von 24 Stunden
   führen wie bisher zu `interventionRequired` beziehungsweise Box 0.
4. Eine bereits in Box 0 befindliche Karte verlässt Box 0 weder durch `partial`
   noch durch `correct`. Die Rückkehr ins Training bleibt eine ausdrückliche
   Benutzeraktion.
5. Eine manuelle Markierung als Schwachstelle ist von Antwortwerten unabhängig.
6. Im Exam werden neue automatische Box-0-Übergänge weiterhin erst nach Ende
   des Exams angewandt.

Dadurch geraten Lernende mit stabilem Teilwissen nicht wegen vier halben
Lösungen in die Intervention. Gleichzeitig kann die Karte nicht aufsteigen,
bis sie vollständig gelöst wurde, und bleibt durch ihre Box häufig im Training.

## Lebenszyklus einer Sitzung

### Aktivität und Inaktivität

Als sinnvolle Aktivität gelten:

- Auswahl oder Änderung einer Antwort;
- Eingabe in ein Text- oder Zahlenfeld;
- Absenden einer Antwort;
- explizites Weitergehen zur nächsten Karte.

Reine Mausbewegungen zählen nicht. Aktivität bei verborgenem Dokument zählt
nicht. Persistente Aktualisierungen von `lastActivityAt` werden auf höchstens
eine Speicherung je 30 Sekunden gedrosselt; das Absenden einer Antwort wird
immer sofort gespeichert.

Vor jeder Aktivität wird geprüft:

```text
if no open session:
    prepare a new session
else if now - lastActivityAt >= 25 minutes:
    close old session at lastActivityAt
    finalize its open streak
    prepare a new session
else:
    continue open session
```

Die vorbereitete neue Sitzung wird erst mit der ersten abgegebenen Antwort
persistiert. So erzeugt das bloße Öffnen der App keine leeren Sitzungen.

### Aktive Lernzeit

Für eine Antwort wird nur sichtbare Vordergrundzeit angerechnet. Pro Antwort
werden höchstens zwei Minuten gezählt:

```text
creditedAnswerMs = min(foregroundAnswerMs, MAX_CREDITED_ANSWER_MS)
session.activeDurationMs += creditedAnswerMs
```

Die Kappung dient nur der Qualifikation einer Sitzung; XP steigen nicht mit der
verbrauchten Zeit. Wer für eine schwere Karte länger braucht, verliert keine
Basis-XP. Liegen nach drei schnellen Antworten noch keine zwei aktiven Minuten
vor, wird die Sitzung erst mit der ersten späteren Antwort qualifiziert, bei der
beide Grenzen erreicht sind.

### Reload und Update

Der offene Sitzungsdatensatz liegt in Dexie und ist die einzige Quelle der
Wahrheit. Beim App-Start wird er geladen:

- `now - lastActivityAt < 25 Minuten`: fortsetzen;
- andernfalls: alte Sitzung bei `lastActivityAt` schließen und bei der nächsten
  Antwort eine neue beginnen.

Weder `beforeunload` noch Service-Worker-Updates dürfen eine Sitzung pauschal
beenden. Ein Profilwechsel oder Logout beendet sie dagegen ausdrücklich, weil
Ereignisse nicht zwischen Profilen vermischt werden dürfen.

### Mitternacht und Moduswechsel

Eine kontinuierliche Sitzung wird an Mitternacht nicht künstlich geteilt. Für
Tagesauswertungen zählt jedes Antwortereignis zu seinem lokalen Kalendertag.
Die Sitzung selbst wird dem Kalendertag ihrer Qualifikation zugeordnet. Ein
Wechsel zwischen Übung und Exam erzeugt ebenfalls keine neue Sitzung; der Modus
bleibt je Antwort gespeichert.

## XP-Berechnung

### Basis-XP

Die bestehenden Basiswerte bleiben erhalten:

| Kartenschwierigkeit | Basis-XP |
|---------------------|----------|
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 5 |
| 5 | 8 |

Kam die Karte vor der Antwort aus Box 2 bis 5, wird wie bisher ein Basis-XP
addiert. Der so ermittelte Kartenwert wird mit `scoreDelta` multipliziert.
Negative Ergebnisse, reine Wiederholungen ohne besseren Tageswert und
vollständig falsche Antworten liefern null Basis-XP.

### Sitzungsbonus

Die Zahl abgegebener Antworten ist die primäre Staffel. Zeit ist nur eine
Mindestschranke. Eine rein zeitbasierte Staffel ist ausdrücklich nicht
vorgesehen, weil sie Warten belohnen und schnelle Lernende benachteiligen würde.

Voraussetzungen für einen Bonus auf eine Antwort:

1. Die Sitzung hat mindestens drei Antworten und zwei aktive Minuten erreicht.
2. Die aktuelle Antwort hat einen positiven `xpDelta`.
3. Die aktuelle Sitzung gehört zu den ersten vier qualifizierten Sitzungen
   ihres lokalen Qualifikationstags.
4. Der Antwortindex liegt zwischen 4 und 30 einschließlich.

Der Bonus wird nur auf die neu verdienten Basis-XP dieser Antwort angewandt:

| Antwortindex in Sitzung | Gesamtfaktor | Motivations-XP zusätzlich |
|-------------------------|--------------|----------------------------|
| 1–3 | 1,00 | 0 % |
| 4–10 | 1,25 | 25 % der neuen Basis-XP |
| 11–30 | 1,10 | 10 % der neuen Basis-XP |
| ab 31 | 1,00 | 0 % |

Erreicht eine Sitzung die Zwei-Minuten-Grenze erst bei Antwort 6, werden die
Antworten 4 und 5 nicht rückwirkend verändert. Ab Antwort 6 gilt der zu ihrem
Index gehörende Faktor. Das hält das Ereignisprotokoll unveränderlich und die
Berechnung deterministisch.

Die fünfte und jede weitere qualifizierte Sitzung eines Tages zählt weiterhin
für Rhythmus und Statistik, erhält aber keinen Sitzungsbonus. Es gibt keine
Obergrenze für Basis-XP außer der Tagesobergrenze je Karte.

### Wirkung kurzer und langer Sitzungen

Bei 30 Antworten mit jeweils einem neuen Basis-XP ergibt eine lange Sitzung
3,75 Motivations-XP. Drei qualifizierte Sitzungen mit je zehn Antworten ergeben
zusammen 5,25 Motivations-XP. Die Basis-XP bleiben in beiden Fällen 30.

Damit werden mehrere echte Lernanlässe leicht stärker belohnt, ohne Ausdauer in
einer längeren Sitzung wertlos zu machen. Antworten 11 bis 30 erhalten weiterhin
den Faktor 1,10. Ab Antwort 31 gibt es Basis-XP, aber keinen zusätzlichen Anreiz,
eine sehr lange Sitzung fortzusetzen.

### Rundung

Alle Beträge werden als ganze `xpMilli` gespeichert; `1000` entspricht einem
XP. Jeder Ledger-Eintrag wird nach der vollständigen Berechnung kaufmännisch auf
die nächste ganze Milli-Einheit gerundet. Die UI darf auf eine Nachkommastelle
runden, Berechnungen verwenden immer die gespeicherten Milliwerte.

## Verfall von Motivations-XP

Ein Verfall darf keine nachgewiesene Lernleistung löschen. Deshalb verfallen nur
Motivations-XP, niemals Basis-XP. Der aktuelle Gesamtstand und ein davon
abhängiger Rang können höchstens bis zum unverfallbaren Basis-XP-Stand sinken.

### Inaktivität

Ein aktiver Kalendertag ist ein Tag, an dem mindestens eine Sitzung qualifiziert
wurde. Einzelne sehr kurze Aufrufe oder Antworten setzen die Inaktivität nicht
zurück.

Nach dem letzten aktiven Tag bleiben zwei vollständige inaktive Kalendertage
folgenlos. Ab dem dritten inaktiven Kalendertag wird einmal pro Tag ein Verfall
gebucht.

Beispiel: Montag war aktiv, Dienstag und Mittwoch sind frei. Am Donnerstag als
drittem inaktiven Tag wird der erste Verfall fällig.

### Höhe

Für jeden fälligen Verfallstag wird der Durchschnitt der in den unmittelbar
vorhergehenden 28 Kalendertagen positiv verdienten Basis- und Sitzungsbonus-XP
berechnet. Nulltage bleiben im Nenner enthalten. Migrationen,
Tagesauszeichnungen und frühere Verfallsbuchungen werden nicht einbezogen.

```text
averageDailyXp = positiveEligibleXpInPrevious28Days / 28
requestedDecay = 0.50 * averageDailyXp
actualDecay    = min(requestedDecay, currentMomentumXp)
```

`actualDecay` wird als negativer `momentum`-Ledger-Eintrag gebucht. Ist das
Motivationskonto leer, beträgt der Verfall null. Beim nächsten App-Start oder
Sync werden versäumte Tage chronologisch und idempotent nachgebucht. Für jeden
lokalen Tag darf es pro Richtlinienversion höchstens einen Verfallseintrag
geben.

## Serien

### Zählung

- `correct` erhöht die aktuelle Serie um eins.
- `partial` erhöht die aktuelle Serie ebenfalls um eins.
- `incorrect` beendet die Serie.
- Eine Sitzungspause von mindestens 25 Minuten beendet eine offene Serie.
- Reload, Update und Moduswechsel innerhalb derselben Sitzung ändern sie nicht.

Die aktuelle Serie darf ab Länge 1 angezeigt werden. In der historischen Liste
werden nur abgeschlossene Serien ab Länge 2 gespeichert beziehungsweise
angezeigt, damit einzelne Antworten nicht als besondere Serie erscheinen.

Ein abgeschlossener Seriendatensatz speichert `length`, `correctCount`,
`partialCount`, `startedAt`, `endedAt`, `sessionId` und den Abschlussgrund
`incorrect`, `sessionTimeout` oder `profileChange`. Damit bleibt sichtbar, ob
eine Serie teilweise richtige Antworten enthielt, ohne sie nachträglich anders
zu bewerten.

## Sitzungs- und Rhythmusmetriken

Nur qualifizierte Sitzungen fließen in diese Metriken ein. Das Fenster umfasst
die letzten 28 lokalen Kalendertage einschließlich heute und damit genau vier
Sieben-Tage-Zeiträume.

### Kennzahlen

```text
sessionsPerWeek       = qualifiedSessionsInWindow / 4
sessionsPerCalendarDay = qualifiedSessionsInWindow / 28
sessionsPerActiveDay   = qualifiedSessionsInWindow / activeDaysInWindow
activeDaysPerWeek      = activeDaysInWindow / 4
```

Bei null aktiven Tagen ist `sessionsPerActiveDay` null, nicht `NaN`.

Zusätzlich werden angezeigt:

- längste Folge aktiver Tage im 28-Tage-Fenster;
- längste Pause zwischen aktiven Tagen;
- qualifizierte Sitzungen je Wochentag, über vier Wochen aggregiert.

### Gleichverteilung

Die Gleichverteilung wird aus den sieben aggregierten Wochentagswerten mit der
normalisierten Shannon-Entropie berechnet:

```text
total = sum(weekdaySessions)
p[d] = weekdaySessions[d] / total
evenness = -sum(p[d] * ln(p[d])) / ln(7) * 100
```

Terme mit `p[d] === 0` werden ausgelassen. Bei weniger als drei qualifizierten
Sitzungen wird kein Prozentwert gezeigt, sondern „Noch nicht genug Daten“.
`100` bedeutet eine gleichmäßige Verteilung über die Wochentage; `0` bedeutet,
dass alle Sitzungen auf denselben Wochentag fallen. Der Wert ist beschreibend
und vergibt keine XP.

### Einordnung

- Rund 15 qualifizierte Sitzungen pro Woche gelten als **ausgewogen**.
- Ab 20 qualifizierten Sitzungen pro Woche gilt der Rhythmus als **musterhaft**.

Diese Texte werden erst angezeigt, wenn mindestens 14 Kalendertage im Fenster
beobachtet wurden. Unterhalb von 15 steht keine negative Bewertung. Die App
zeigt die neutralen Rohwerte und ermutigt zu einem passenden eigenen Rhythmus.
Das rollierende Vier-Wochen-Fenster verhindert, dass ein einzelnes freies oder
partyreiches Wochenende die Gesamtbewertung dominiert.

## Motivierende Hinweise innerhalb einer Sitzung

Die Hinweise sind nicht modal, blockieren keine Eingabe und verschwinden nach
höchstens fünf Sekunden. Sie verwenden das vorhandene DaisyUI-Toast/Alert-
Muster, respektieren reduzierte Bewegung und werden per `aria-live="polite"`
angekündigt.

| Nach Antwort | Deutscher Text | Zweck |
|--------------|-----------------|-------|
| 3 | „Weiter so!“ | Mindestmaß anerkennen |
| 20 | „Du bist voll im Flow.“ | Ausdauer anerkennen |
| 50 | „Gönn dir auch eine Pause.“ | Abkühlung anregen |

Jeder Hinweis erscheint höchstens einmal pro Sitzung. Die bereits angezeigten
Schwellen werden im Sitzungsdatensatz persistiert, damit ein Reload sie nicht
wiederholt. Die 50er-Meldung verändert keine XP und beendet die Sitzung nicht.
Sie ist eine Empfehlung, keine Sperre.

## Spätere private Tagesauszeichnung

Dieser Abschnitt ist eine Backend-Vormerkung. Die Funktion darf erst aktiviert
werden, wenn Karten, Antwortereignisse und Lernfortschritt authentifiziert und
idempotent mit einem Backend synchronisiert werden. Der Client allein kann
weder Gruppenzugehörigkeit noch Gewinner vertrauenswürdig bestimmen.

### Genau zwölf getrennte Gruppen

Eine Person gehört für einen Wettbewerbstag genau einer Kombination aus
Fachrichtung und Statusgruppe an:

- Fachrichtung: `FIAN`, `FISI`, `FIDP` oder `FIDV`;
- Statusgruppe: `guest`, `participant` oder `alumniTeacher`.

`Alumni/Dozent` ist dabei eine gemeinsame Statusgruppe. Daraus entstehen
`4 * 3 = 12` voneinander getrennte, geschützte Gruppen. Fachrichtung und
Statusgruppe stammen aus dem serverseitigen Profil. Ein Clientparameter darf
sie nicht überschreiben. Für reine Gäste ist vor Aktivierung mindestens eine
stabile pseudonyme Backend-Identität erforderlich.

### Tageswert und Vergabe

- Wettbewerbstag ist der lokale Tag in der serverseitig konfigurierten
  Mandantenzeitzone, zunächst `Europe/Berlin`.
- Gewertet werden nur an diesem Tag synchronisierte Basis-XP aus
  Antwortereignissen; Sitzungsbonus, Verfall und frühere Auszeichnungen bleiben
  außen vor.
- Teilnahme erfordert mindestens eine qualifizierte Sitzung an diesem Tag.
- Die höchste Tagessumme innerhalb einer der zwölf Gruppen erhält genau
  `1 XP` als Motivations-XP.
- Bei exakt gleichem Höchstwert erhalten alle Gleichplatzierten den einen
  Bonus-XP. Es gibt keinen willkürlichen Zeit-Tiebreaker.
- Bei weniger als zwei qualifizierten Personen in einer Gruppe wird keine
  Auszeichnung vergeben.
- Die Vergabe ist serverseitig idempotent nach `localDate`, `specialization`,
  `roleGroup`, `subjectId` und Richtlinienversion.

Eine endgültige Auszeichnung kann erst feststehen, wenn der Tag abgeschlossen
und die definierte Synchronisationsfrist verstrichen ist. Die Meldung passt den
Zeitbezug an, zum Beispiel:

- am selben Tag: „Du bist heute in deiner Gruppe vorn. Dafür gibt es +1 XP.“
- später: „Du warst gestern in deiner Gruppe vorn. Dafür gibt es +1 XP.“

### Strikte Datenschutz- und UI-Grenzen

- Es gibt keine Highscore-Liste, Rangfolge, Tabelle oder Platznummer.
- Die API liefert dem Client ausschließlich die eigene Auszeichnung.
- Namen, Pseudonyme, XP-Werte und Aktivität anderer Personen werden niemals
  ausgeliefert.
- Nicht ausgezeichnete Personen erhalten keine Mitteilung über Sieger oder
  Abstände.
- Die App zeigt keine Gruppengröße, sofern dies Rückschlüsse auf Personen
  erlauben könnte.
- Das Feature ist eine private Anerkennung und keine öffentliche
  Vergleichsfunktion.

Die genaue Offline-Synchronisationsfrist und Regeln für verspätete Ereignisse
werden mit dem Backend-Protokoll festgelegt. Bis dahin darf die Funktion nicht
teilweise clientseitig umgesetzt werden.

## Persistenzmodell

Dexie bleibt lokal die einzige Quelle der Wahrheit. Die spätere Synchronisation
überträgt Ereignisse, ersetzt aber nicht die lokale Datenhaltung.

### Antwortereignis

Das bestehende `StoredAnswerEvent` wird mindestens um folgende Felder ergänzt:

```typescript
type AnswerOutcome = 'correct' | 'partial' | 'incorrect'

interface StoredAnswerEventVNext {
  id: string
  exerciseId: string
  occurredAt: number
  mode: 'train' | 'exam'
  durationMs: number
  activeDurationMs: number
  scorePermille: number
  outcome: AnswerOutcome
  correct: boolean
  sessionId: string
  sessionAnswerIndex: number
  boxBefore?: number
  boxAfter?: number
  masteryXpMilli: number
  momentumXpMilli: number
  dailyGoalCredit: boolean
  policyVersion: number
}
```

`durationMs` bleibt für Zeitstatistiken erhalten. `activeDurationMs` ist die
sichtbare, gekappte Zeit für die Sitzungsqualifikation. Alle Ereignisse sind
append-only und erhalten für eine spätere Synchronisation eine global stabile
ID.

### Sitzung

```typescript
interface StoredLearningSession {
  id: string
  startedAt: number
  lastActivityAt: number
  endedAt?: number
  answerCount: number
  correctCount: number
  partialCount: number
  incorrectCount: number
  activeDurationMs: number
  qualifiedAt?: number
  qualificationLocalDate?: string
  bonusSessionOrdinal?: number
  shownMilestones: number[]
  policyVersion: number
}
```

Es darf höchstens eine offene Sitzung pro lokalem Profil geben. Ein Index oder
eine transaktionale Prüfung muss diese Invariante absichern.

### XP-Ledger

```typescript
type XpBucket = 'mastery' | 'momentum'
type XpReason =
  | 'answerBase'
  | 'sessionBonus'
  | 'dailyGroupAward'
  | 'inactivityDecay'
  | 'legacyMigration'

interface StoredXpLedgerEntry {
  id: string
  occurredAt: number
  localDate: string
  amountMilli: number
  bucket: XpBucket
  reason: XpReason
  answerEventId?: string
  sessionId?: string
  idempotencyKey: string
  policyVersion: number
}
```

Der Ledger ist append-only. `amountMilli` ist nur beim Verfall negativ. Ein
eindeutiger Index auf `idempotencyKey` verhindert doppelte Buchungen. Angezeigte
Summen dürfen gecacht werden, müssen aber jederzeit aus dem Ledger
rekonstruierbar sein.

## Transaktionale Verarbeitung einer Antwort

Antwort, Lernfortschritt, Sitzung, Serie, Tagesziel und XP müssen in einer
einzigen Dexie-Transaktion konsistent geschrieben werden. Die Reihenfolge der
Berechnung lautet:

1. Benutzerzeitzone und lokalen Kalendertag bestimmen.
2. Fällige Verfallsereignisse bis einschließlich des aktuellen Tags vor der
   neuen Aktivitätsbuchung idempotent nachtragen.
3. Offene Sitzung laden und die 25-Minuten-Regel anwenden.
4. Antwortwert und Ergebnis bestimmen.
5. bisherigen besten wertbaren Tageswert derselben Karte laden.
6. `scoreDelta`, Tageszielanteil und Basis-XP berechnen.
7. Leitner- und Box-0-Übergang anhand des Ergebnisses berechnen.
8. Sitzungszähler und aktive Zeit erhöhen; gegebenenfalls qualifizieren.
9. Sitzungsbonus anhand des aktuellen Antwortindex berechnen.
10. Serienzustand aktualisieren.
11. Antwortereignis, Fortschritt, Sitzung, Serie und Ledger-Einträge gemeinsam
    schreiben.
12. Erst nach erfolgreichem Commit UI, Sound, Haptik und Hinweise auslösen.

Schlägt die Transaktion fehl, darf kein Teilergebnis im reaktiven Zustand
verbleiben. Die UI zeigt einen knappen Fehler und erlaubt ein idempotentes
erneutes Absenden mit derselben Antwortereignis-ID.

## Migration

Die Implementierung verwendet die nächste zum Implementierungszeitpunkt freie
Dexie-Schemaversion; sie darf nicht blind eine in diesem Dokument vermutete
Versionsnummer übernehmen.

1. Alte Antwortereignisse mit `correct: true` werden auf `scorePermille: 1000`
   und `outcome: correct` abgebildet, andere auf `0` und `incorrect`.
2. Bestehende XP bleiben vollständig als Basis-XP erhalten. Aus alten
   `xpEarned`-Ereignissen werden Ledger-Einträge erzeugt. Eine mögliche Differenz
   zum bisherigen aggregierten XP-Stand wird genau einmal als
   `legacyMigration` gebucht.
3. Alte Sitzungen werden als geschlossen übernommen. Sie werden nicht anhand
   alter Antwortabstände nachträglich neu geschnitten.
4. Bestehende Serien bleiben historische Serien. Erst neue Ereignisse kennen
   `partialCount`.
5. Die Migration läuft vollständig transaktional und besitzt einen Marker in
   `metadata`.
6. Ein zweiter Lauf erzeugt weder weitere XP noch doppelte Sitzungen oder
   Ledger-Einträge.

## Architekturgrenzen

- Reine Bewertungsfunktionen für `scorePermille` enthalten keine Vue- oder
  Dexie-Abhängigkeit und sind separat testbar.
- Sitzung, XP-Ledger, Serie und Lernfortschritt bleiben fachliche Entitäten.
- Die Orchestrierung einer abgegebenen Antwort darf diese Entitäten koordinieren,
  muss aber die beschriebene Transaktionsgrenze besitzen.
- Seitenspezifische Toasts gehören in den Bereich der Lernseite und nicht in
  eine globale Business-Entität.
- Der künftige Synchronisationsadapter arbeitet ausschließlich auf stabilen
  Ereignissen und vertraut keiner clientseitig berechneten Gruppenzugehörigkeit.
- Neue Dateien halten die im Repository vorgegebene Feature-Sliced-Struktur ein;
  es werden keine zusätzlichen Verzeichnisse auf oberster `src`-Ebene erzeugt.

## UI, Übersetzungen und Hilfe

Bei der Implementierung sind Deutsch und Englisch gleichzeitig zu ergänzen.
Kurze Beschriftungen und Toasttexte liegen in den Locale-JSON-Dateien. Längere
Erklärungen gehören in die sprachspezifischen Markdown-Dateien der Hilfeseite.

Die Hilfeseite muss dann mindestens erklären:

- wann eine Sitzung fortgesetzt oder neu begonnen wird;
- wie vollständig, teilweise und nicht ausreichend richtige Antworten wirken;
- warum eine teilweise richtige Antwort eine Serie fortsetzt, aber keine Box
  erhöht;
- warum nur vollständige Fehler für Box 0 zählen;
- wie Basis- und Motivations-XP unterschieden werden;
- dass Motivations-XP verfallen können;
- wie die 28-Tage-Rhythmuswerte zu lesen sind;
- dass die spätere Tagesauszeichnung privat ist und keine Rangliste existiert.

Die Hilfe wird erst zusammen mit dem jeweiligen Laufzeitfeature geändert. Sie
darf kein noch nicht verfügbares Verhalten als bereits vorhanden beschreiben.

## Abnahmekriterien

### Sitzung

- Reload nach 24 Minuten setzt dieselbe Sitzungs-ID fort.
- Die erste Antwort nach mindestens 25 Minuten Inaktivität erhält eine neue
  Sitzungs-ID.
- Ein Moduswechsel innerhalb von 25 Minuten behält die Sitzungs-ID.
- Drei Antworten in 90 Sekunden qualifizieren die Sitzung noch nicht.
- Die erste spätere Antwort nach insgesamt zwei aktiven Minuten qualifiziert
  sie.
- Ein App-Update oder harter Reload erzeugt keine doppelte Sitzung.

### Teilweise richtige Antworten und Box 0

- Multiple Choice „alle auswählen“ ergibt bei vorhandenen falschen Optionen
  null und nicht teilweise richtig.
- Eine MATCH-Lösung mit drei von vier korrekten Zeilen ergibt 750 Promille und
  `partial`.
- Eine teilweise richtige Antwort lässt die Box unverändert.
- Eine teilweise richtige Antwort setzt eine laufende vollständige Fehlerfolge
  zurück.
- Vier vollständig falsche Antworten innerhalb von 24 Stunden führen zu Box 0.
- Eine richtige oder teilweise richtige Exam-Antwort holt eine Box-0-Karte nicht
  automatisch zurück.

### XP

- Die ersten drei Antworten einer Sitzung erhalten keinen Sitzungsbonus.
- Eine wertbare Antwort 4 erhält bei qualifizierter Sitzung 25 Prozent Bonus.
- Antwort 11 erhält 10 Prozent Bonus, Antwort 31 keinen Bonus.
- Dieselbe Karte kann pro Tag über mehrere Versuche zusammen höchstens ihren
  vollen Basiswert und einen Tagesziel-Punkt erzeugen.
- Eine fünfte qualifizierte Sitzung erhält Basis-XP, aber keinen Sitzungsbonus.
- Eine lange 30-Antworten-Sitzung erhält bei identischen Ein-Punkt-Antworten
  weniger Bonus als drei qualifizierte Zehn-Antworten-Sitzungen.
- Alle XP-Buchungen bleiben nach Reload identisch und werden nicht verdoppelt.

### Verfall

- Zwei volle inaktive Tage verändern keine XP.
- Am dritten inaktiven Tag wird genau einmal die Hälfte der vorausgehenden
  28-Tage-Durchschnitts-XP angefordert.
- Der Verfall reduziert ausschließlich das Motivationskonto und nie unter null.
- Mehrfaches Öffnen am selben Tag erzeugt keinen zweiten Verfallseintrag.
- Nach längerer Offlinezeit werden fällige Tage genau einmal nachgetragen.

### Serien und Motivation

- `correct, partial, correct` ergibt eine Serie der Länge 3.
- `incorrect` beendet die Serie; ein Reload nicht.
- Eine offene Serie endet beim Start der nächsten Sitzung nach 25 Minuten Pause.
- Die Hinweise 3, 20 und 50 erscheinen je Sitzung genau einmal, auch über
  Reloads hinweg.
- Der 50er-Hinweis blockiert die 51. Antwort nicht.

### Rhythmus und spätere Tagesauszeichnung

- Nur qualifizierte Sitzungen fließen in die 28-Tage-Metriken ein.
- Tage ohne Sitzung bleiben in den Durchschnittsnennern enthalten.
- Die Einordnung „ausgewogen“ beziehungsweise „musterhaft“ erscheint erst nach
  mindestens 14 beobachteten Tagen.
- Der Backend-Client kann keine Rangliste und keine fremden XP-Daten abrufen.
- Ein Benutzer kann Fachrichtung oder Statusgruppe nicht in der Award-Anfrage
  setzen.
- Dieselbe Tagesauszeichnung kann durch Wiederholung oder erneuten Sync nicht
  doppelt gebucht werden.

## Implementierungsstand

Die Schritte 1 bis 5 sind lokal umgesetzt: Teilantworten und Box-0-Regeln,
reload-feste Sitzungen und Serien, XP-Ledger samt Migration, Sitzungsbonus,
Rhythmuswerte, Hinweise und der Verfall von Motivations-XP. Die Hilfeseite
erklärt das sichtbare Verhalten in beiden Sprachen.

Offen bleibt ausschließlich Schritt 6: Erst nach vorhandenem
Authentifizierungs- und Synchronisationsbackend darf die private
Tagesauszeichnung implementiert werden.

Jede Änderung umfasst mindestens Lint, Build, Diff-Prüfung sowie angemessene
Tests der berührten Regeln und Migration.

## Fachliche Grundlage

Die 25 Minuten sind eine Produktgrenze, die sich an der klassischen
Pomodoro-Arbeitsphase orientiert. Die Bevorzugung mehrerer verteilter Sitzungen
folgt dem gut belegten Spacing-Effekt. Daraus wird bewusst keine medizinische
oder individuelle Lernzusage abgeleitet; die konkreten XP-Faktoren bleiben eine
transparente Produktregel.

- Pomodoro Technique: <https://www.pomodorotechnique.com/solutions/pomodoro-classic-timer/>
- Cepeda et al., *Spacing Effects in Learning*: <https://pubmed.ncbi.nlm.nih.gov/19076480/>
- Dunlosky et al., *Improving Students' Learning With Effective Learning Techniques*: <https://www.psychologicalscience.org/journals/pspi/volume/14/issue/1/>
