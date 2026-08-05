INSERT INTO exercises (
  id, inputMode, mobileSolvable, learningLevel, difficulty,
  categories, specializations, instruction, images, answerOptions,
  matchOptions, correct, submitButton, caseSensitive,
  maximumStringDistance, explainInstruction, explainAnswerOptions,
  adminComment, adminTags, contentRevision, isActive
) VALUES
(
  'demo_ap1_001', 'SINGLE_CHOICE', TRUE, 1, 1,
  JSON_ARRAY('AP1', 'Netzwerkgrundlagen'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Auf welcher OSI-Schicht arbeitet ein Router hauptsächlich?', JSON_ARRAY(),
  JSON_ARRAY('Bitübertragungsschicht', 'Sicherungsschicht', 'Vermittlungsschicht', 'Darstellungsschicht'),
  JSON_ARRAY(), JSON_ARRAY(2), TRUE, FALSE, 1,
  'Router leiten IP-Pakete auf der Vermittlungsschicht weiter.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap2_002', 'SINGLE_CHOICE', TRUE, 5, 1,
  JSON_ARRAY('AP2', 'Algorithmen und Datenstrukturen'), JSON_ARRAY('FIAN'),
  'Welche durchschnittliche Laufzeit hat die binäre Suche?', JSON_ARRAY(),
  JSON_ARRAY('O(1)', 'O(log n)', 'O(n)', 'O(n²)'), JSON_ARRAY(),
  JSON_ARRAY(1), TRUE, FALSE, 1,
  'Der verbleibende Suchbereich wird in jedem Schritt halbiert.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_003', 'SINGLE_CHOICE', TRUE, 2, 2,
  JSON_ARRAY('AP1', 'Datenschutz'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Welche Stelle entscheidet über Zweck und Mittel einer Verarbeitung?', JSON_ARRAY(),
  JSON_ARRAY('Betroffene Person', 'Verantwortlicher', 'Auftragsverarbeiter', 'Empfänger'),
  JSON_ARRAY(), JSON_ARRAY(1), TRUE, FALSE, 1,
  'Der Verantwortliche legt Zweck und Mittel der Verarbeitung fest.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_004', 'MULTIPLE_CHOICE', TRUE, 3, 2,
  JSON_ARRAY('AP1', 'Datenbanken'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Welche SQL-Anweisungen gehören zur Data Definition Language?', JSON_ARRAY(),
  JSON_ARRAY('CREATE TABLE', 'ALTER TABLE', 'SELECT', 'DROP TABLE'), JSON_ARRAY(),
  JSON_ARRAY(0, 1, 3), TRUE, FALSE, 1,
  'CREATE, ALTER und DROP verändern die Datenbankstruktur.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_005', 'NUMBER', TRUE, 2, 2,
  JSON_ARRAY('AP1', 'IPv4'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Wie viele nutzbare Hostadressen hat ein klassisches /24-IPv4-Netz?', JSON_ARRAY(),
  JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(254), TRUE, FALSE, 0,
  'Von 256 Adressen sind Netz- und Broadcastadresse nicht als Hostadresse nutzbar.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_006', 'TEXT', TRUE, 3, 1,
  JSON_ARRAY('AP1', 'Datenbanken'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Mit welchem SQL-Schlüsselwort wird ein Primärschlüssel definiert?', JSON_ARRAY(),
  JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('PRIMARY KEY'), TRUE, FALSE, 1,
  'PRIMARY KEY kennzeichnet den Primärschlüssel einer Tabelle.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_007', 'MATCH', TRUE, 3, 3,
  JSON_ARRAY('AP1', 'OSI-Modell'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Ordne die Protokolle der passenden OSI-Schicht zu.', JSON_ARRAY(),
  JSON_ARRAY('Ethernet', 'IP', 'TCP'),
  JSON_ARRAY('Sicherungsschicht', 'Vermittlungsschicht', 'Transportschicht'),
  JSON_ARRAY(0, 1, 2), TRUE, FALSE, 1,
  'Ethernet, IP und TCP sind typische Vertreter der Schichten 2, 3 und 4.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_008', 'SINGLE_CHOICE', TRUE, 2, 1,
  JSON_ARRAY('AP1', 'HTTP'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Welcher HTTP-Statuscode steht für „Not Found“?', JSON_ARRAY(),
  JSON_ARRAY('200', '301', '404', '500'), JSON_ARRAY(), JSON_ARRAY(2),
  TRUE, FALSE, 1, '404 bedeutet, dass die angeforderte Ressource nicht gefunden wurde.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap2_009', 'MULTIPLE_CHOICE', TRUE, 5, 3,
  JSON_ARRAY('AP2', 'Datenbanken', 'Transaktionen'), JSON_ARRAY('FIAN', 'FISI'),
  'Welche Eigenschaften gehören zu ACID?', JSON_ARRAY(),
  JSON_ARRAY('Atomicity', 'Consistency', 'Isolation', 'Distribution'), JSON_ARRAY(),
  JSON_ARRAY(0, 1, 2), TRUE, FALSE, 1,
  'ACID steht für Atomicity, Consistency, Isolation und Durability.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_010', 'NUMBER', TRUE, 1, 1,
  JSON_ARRAY('AP1', 'Zahlensysteme'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Wie viele Byte enthält ein Kibibyte (KiB)?', JSON_ARRAY(),
  JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(1024), TRUE, FALSE, 0,
  'Ein Kibibyte entspricht 2 hoch 10 und damit 1024 Byte.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_011', 'TEXT', TRUE, 2, 1,
  JSON_ARRAY('AP1', 'Versionsverwaltung'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Welcher Git-Befehl zeigt den Zustand des Arbeitsverzeichnisses?', JSON_ARRAY(),
  JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('git status'), TRUE, FALSE, 1,
  'git status zeigt unter anderem geänderte und vorgemerkte Dateien.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_012', 'MATCH', TRUE, 3, 2,
  JSON_ARRAY('AP1', 'SQL'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Ordne die SQL-Anweisung ihrer Wirkung zu.', JSON_ARRAY(),
  JSON_ARRAY('SELECT', 'INSERT', 'DELETE'),
  JSON_ARRAY('Daten lesen', 'Datensätze anlegen', 'Datensätze entfernen'),
  JSON_ARRAY(0, 1, 2), TRUE, FALSE, 1,
  'SELECT liest, INSERT legt an und DELETE entfernt Datensätze.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap2_013', 'SINGLE_CHOICE', TRUE, 6, 3,
  JSON_ARRAY('AP2', 'Softwarearchitektur'), JSON_ARRAY('FIAN'),
  'Was ist ein wesentliches Ziel von Dependency Injection?', JSON_ARRAY(),
  JSON_ARRAY('Abhängigkeiten verstecken', 'Komponenten lose koppeln', 'Vererbung erzwingen', 'SQL vermeiden'),
  JSON_ARRAY(), JSON_ARRAY(1), TRUE, FALSE, 1,
  'Abhängigkeiten werden von außen bereitgestellt und Komponenten dadurch leichter austauschbar.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_014', 'MULTIPLE_CHOICE', TRUE, 3, 2,
  JSON_ARRAY('AP1', 'IT-Sicherheit'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Welche Maßnahmen unterstützen eine sichere Anmeldung?', JSON_ARRAY(),
  JSON_ARRAY('Mehrfaktor-Authentifizierung', 'Passwort-Hashing', 'Passwörter im Klartext', 'Rate Limiting'),
  JSON_ARRAY(), JSON_ARRAY(0, 1, 3), TRUE, FALSE, 1,
  'MFA, sicheres Hashing und Rate Limiting reduzieren typische Anmelderisiken.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_015', 'NUMBER', TRUE, 4, 2,
  JSON_ARRAY('AP1', 'IPv4'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Wie viele nutzbare Hostadressen hat ein klassisches /26-IPv4-Netz?', JSON_ARRAY(),
  JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(62), TRUE, FALSE, 0,
  'Ein /26-Netz hat 64 Adressen; Netz- und Broadcastadresse werden abgezogen.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_016', 'TEXT', TRUE, 3, 2,
  JSON_ARRAY('AP1', 'Web-APIs'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Wie heißt der Architekturstil, der häufig für ressourcenorientierte HTTP-APIs genutzt wird?', JSON_ARRAY(),
  JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('REST', 'Representational State Transfer'),
  TRUE, FALSE, 1, 'REST steht für Representational State Transfer.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap2_017', 'MATCH', TRUE, 5, 3,
  JSON_ARRAY('AP2', 'Entwurfsmuster'), JSON_ARRAY('FIAN'),
  'Ordne das Entwurfsmuster seiner Gruppe zu.', JSON_ARRAY(),
  JSON_ARRAY('Fabrikmethode', 'Adapter', 'Beobachter'),
  JSON_ARRAY('Erzeugungsmuster', 'Strukturmuster', 'Verhaltensmuster'),
  JSON_ARRAY(0, 1, 2), TRUE, FALSE, 1,
  'Fabrikmethode, Adapter und Beobachter stehen beispielhaft für die drei GoF-Gruppen.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_wiso_018', 'SINGLE_CHOICE', TRUE, 2, 2,
  JSON_ARRAY('WiSo', 'Urheberrecht'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Wann entsteht der Urheberrechtsschutz für ein hinreichend schöpferisches Werk grundsätzlich?', JSON_ARRAY(),
  JSON_ARRAY('Mit der Schöpfung', 'Erst mit Registrierung', 'Erst mit Veröffentlichung', 'Nach fünf Jahren'),
  JSON_ARRAY(), JSON_ARRAY(0), TRUE, FALSE, 1,
  'Der Schutz entsteht grundsätzlich mit der Schöpfung des Werkes.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_019', 'MULTIPLE_CHOICE', TRUE, 3, 2,
  JSON_ARRAY('AP1', 'Barrierefreiheit'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Welche Maßnahmen verbessern die Zugänglichkeit einer Webanwendung?', JSON_ARRAY(),
  JSON_ARRAY('Beschriftete Formularfelder', 'Tastaturbedienung', 'Aussagekräftige Alternativtexte', 'Information nur durch Farbe'),
  JSON_ARRAY(), JSON_ARRAY(0, 1, 2), TRUE, FALSE, 1,
  'Beschriftungen, Tastaturbedienung und Alternativtexte unterstützen unterschiedliche Nutzungssituationen.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
),
(
  'demo_ap1_020', 'TEXT', TRUE, 1, 1,
  JSON_ARRAY('AP1', 'Datenformate'),
  JSON_ARRAY('FIAN', 'FISI', 'FIDP', 'FIDV'),
  'Welches textbasierte Datenformat verwendet Objekte mit Schlüssel-Wert-Paaren und Arrays?', JSON_ARRAY(),
  JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('JSON', 'JavaScript Object Notation'),
  TRUE, FALSE, 1, 'JSON steht für JavaScript Object Notation.',
  JSON_ARRAY(), '', JSON_ARRAY('demo'), 1, TRUE
);
