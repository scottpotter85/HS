const SERVER_PORT = 5050;
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Parser } = require('json2csv');

// Globale Fehlerbehandlung für unbehandelte Exceptions
process.on('uncaughtException', (err) => {
    console.error('UNBEHANDELTE EXCEPTION:', err);
    console.error('Stack Trace:', err.stack);
    // Der Server wird nicht beendet, sondern läuft weiter
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNBEHANDELTE PROMISE REJECTION:', reason);
    // Der Server wird nicht beendet, sondern läuft weiter
});

// Graceful Shutdown bei Programmbeendigung
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

function gracefulShutdown() {
    console.log('Beende Server sauber...');
    
    server.close(() => {
        console.log('Server geschlossen.');
        
        // Datenbanken sauber schließen
        db.close((err) => {
            if (err) {
                console.error('Fehler beim Schließen der Hauptdatenbank:', err.message);
            } else {
                console.log('Hauptdatenbank geschlossen.');
            }
            
            dbProd.close((err) => {
                if (err) {
                    console.error('Fehler beim Schließen der Produktionsdatenbank:', err.message);
                } else {
                    console.log('Produktionsdatenbank geschlossen.');
                }
                
                dbEnt.close((err) => {
                    if (err) {
                        console.error('Fehler beim Schließen der Unternehmensplaner-Datenbank:', err.message);
                    } else {
                        console.log('Unternehmensplaner-Datenbank geschlossen.');
                    }
                    
                    dbTour.close((err) => {
                        if (err) {
                            console.error('Fehler beim Schließen der Tourenplaner-Datenbank:', err.message);
                        } else {
                            console.log('Tourenplaner-Datenbank geschlossen.');
                        }
                        
                        console.log('Server wurde sauber beendet.');
                        process.exit(0);
                    });
                });
            });
        });
    });
    
    // Notfallmaßnahme: Nach 10 Sekunden hart beenden, falls es hängt
    setTimeout(() => {
        console.error('Konnte Server nicht sauber beenden. Erzwinge Beendigung.');
        process.exit(1);
    }, 10000);
}

// Pfad zur Datenbank (anpassen, falls nötig)
const dbPath = path.join(__dirname, 'kalkulationen.db');
console.log('Verwende Datenbank:', dbPath);

// Produktionsaufträge Datenbank
const dbProd = new sqlite3.Database(path.join(__dirname, 'produktionsauftraege.db'));
console.log('Produktionsaufträge-Datenbank initialisiert');

// Support-System Datenbank
const dbSupport = new sqlite3.Database(path.join(__dirname, 'support.db'));
console.log('Support-Datenbank initialisiert');

// Support-Tabelle erstellen
dbSupport.serialize(() => {
    dbSupport.run(`
        CREATE TABLE IF NOT EXISTS support_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            priority TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            user TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Fehler beim Erstellen der Support-Tabelle:', err);
        } else {
            console.log('Support-Tabelle erfolgreich initialisiert');
        }
    });
});

// Express-App initialisieren
const app = express();

// Statische Dateien servieren
app.use(express.static(path.join(__dirname)));

// CORS-Konfiguration für alle Routen
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    credentials: true
}));

app.use(express.json());

// Zusätzliche Header für CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Debug-Endpunkte
app.get('/api/debug/test', (req, res) => {
    res.json({ status: 'ok', message: 'Debug-Endpunkt funktioniert' });
});

app.get('/api/debug/users-schema', async (req, res) => {
    try {
        const schema = await getDatabaseSchema(dbUsers, 'Benutzer');
        console.log('Benutzer-Datenbankstruktur:', JSON.stringify(schema, null, 2));
        res.json(schema);
    } catch (error) {
        console.error('Fehler beim Auslesen der Benutzer-Datenbankstruktur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/debug/produktion-schema', async (req, res) => {
    try {
        const schema = await getDatabaseSchema(dbProd, 'Produktionsaufträge');
        console.log('Produktionsaufträge-Datenbankstruktur:', JSON.stringify(schema, null, 2));
        res.json(schema);
    } catch (error) {
        console.error('Fehler beim Auslesen der Produktionsaufträge-Datenbankstruktur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/debug/touren-schema', async (req, res) => {
    try {
        const schema = await getDatabaseSchema(dbTour, 'Tourenplaner');
        console.log('Tourenplaner-Datenbankstruktur:', JSON.stringify(schema, null, 2));
        res.json(schema);
    } catch (error) {
        console.error('Fehler beim Auslesen der Tourenplaner-Datenbankstruktur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/debug/lieferanten-schema', async (req, res) => {
    try {
        const schema = await getDatabaseSchema(dbLief, 'Lieferanten');
        console.log('Lieferanten-Datenbankstruktur:', JSON.stringify(schema, null, 2));
        res.json(schema);
    } catch (error) {
        console.error('Fehler beim Auslesen der Lieferanten-Datenbankstruktur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/debug/kalkulation-schema', async (req, res) => {
    try {
        const schema = await getDatabaseSchema(db, 'Kalkulation');
        console.log('Kalkulations-Datenbankstruktur:', JSON.stringify(schema, null, 2));
        res.json(schema);
    } catch (error) {
        console.error('Fehler beim Auslesen der Kalkulations-Datenbankstruktur:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/debug/unternehmensplaner-schema', async (req, res) => {
    try {
        const schema = await getDatabaseSchema(dbEnt, 'Unternehmensplaner');
        console.log('Unternehmensplaner-Datenbankstruktur:', JSON.stringify(schema, null, 2));
        res.json(schema);
    } catch (error) {
        console.error('Fehler beim Auslesen der Unternehmensplaner-Datenbankstruktur:', error);
        res.status(500).json({ error: error.message });
    }
});

// Produktionsaufträge API-Endpunkte
app.get('/api/Produktion/auftraege/recent', (req, res) => {
    console.log('Recent-Endpunkt aufgerufen');
    const query = `
        SELECT 
            id,
            bezeichnung,
            beschreibung,
            datum,
            startZeit,
            status,
            artikelnummer,
            artikelbezeichnung,
            maschine,
            bearbeiter
        FROM auftraege 
        WHERE status != 'abgeschlossen'
            AND datum >= date('now', '-30 days')
        ORDER BY datum DESC, startZeit DESC 
        LIMIT 10
    `;
    
    dbProd.all(query, [], (err, rows) => {
        if (err) {
            console.error('Fehler beim Abrufen der Aufträge:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        console.log('Gefundene Aufträge:', rows);
        res.json(rows || []);
    });
});

app.get('/api/Produktion/auftraege/kalender', async (req, res) => {
    try {
        console.log('Kalender-Endpunkt aufgerufen mit Query:', req.query);
        const { year, month } = req.query;
        
        // Sicherstellen, dass year und month vorhanden sind
        if (!year || !month) {
            throw new Error('Jahr und Monat müssen angegeben werden');
        }

        // Monat als zweistellige Zahl formatieren
        const monthStr = String(parseInt(month)).padStart(2, '0');
        const yearMonth = `${year}-${monthStr}`;
        
        console.log('Suche nach Aufträgen für:', yearMonth);
        
        const query = `
            SELECT 
                id,
                bezeichnung,
                beschreibung,
                datum,
                startZeit,
                endZeit,
                status
            FROM auftraege
            WHERE substr(datum, 1, 7) = ?
            ORDER BY datum ASC, startZeit ASC
        `;
        
        // Verwende dbProd statt db
        const auftraege = await new Promise((resolve, reject) => {
            dbProd.all(query, [yearMonth], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        console.log(`Gefundene Aufträge: ${auftraege.length}`);
        if (auftraege.length > 0) {
            console.log('Beispiel-Auftrag:', auftraege[0]);
        }
        
        res.json(auftraege);
    } catch (error) {
        console.error('Fehler beim Laden der Kalenderdaten:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/Produktion/auftraege/details/:id', (req, res) => {
    const query = `
        SELECT *
        FROM auftraege 
        WHERE id = ?
    `;
    
    dbProd.get(query, [req.params.id], (err, row) => {
        if (err) {
            console.error('Fehler beim Abrufen der Auftragsdetails:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Auftrag nicht gefunden' });
            return;
        }
        res.json(row);
    });
});

app.post('/api/Produktion/auftraege/update/:id', (req, res) => {
    const { bezeichnung, beschreibung, status, datum, startZeit } = req.body;
    const query = `
        UPDATE auftraege 
        SET bezeichnung = ?,
            beschreibung = ?,
            status = ?,
            datum = ?,
            startZeit = ?
        WHERE id = ?
    `;
    
    dbProd.run(query, [bezeichnung, beschreibung, status, datum, startZeit, req.params.id], function(err) {
        if (err) {
            console.error('Fehler beim Aktualisieren des Auftrags:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Auftrag aktualisiert', changes: this.changes });
    });
});

app.post('/api/Produktion/auftraege/delete/:id', (req, res) => {
    const query = `DELETE FROM auftraege WHERE id = ?`;
    
    dbProd.run(query, [req.params.id], function(err) {
        if (err) {
            console.error('Fehler beim Löschen des Auftrags:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Auftrag gelöscht', changes: this.changes });
    });
});

// Endpunkt zum Erstellen neuer Aufträge
app.post('/api/Produktion/auftraege', (req, res) => {
    const {
        bezeichnung,
        artikelnummer,
        artikelbezeichnung,
        beschreibung,
        maschine,
        bearbeiter,
        sollMenge,
        status,
        datum,
        startZeit
    } = req.body;

    const query = `
        INSERT INTO auftraege (
            bezeichnung,
            artikelnummer,
            artikelbezeichnung,
            beschreibung,
            maschine,
            bearbeiter,
            sollMenge,
            status,
            datum,
            startZeit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    dbProd.run(query, [
        bezeichnung,
        artikelnummer,
        artikelbezeichnung,
        beschreibung,
        maschine,
        bearbeiter,
        sollMenge,
        status,
        datum,
        startZeit
    ], function(err) {
        if (err) {
            console.error('Fehler beim Erstellen des Auftrags:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ 
            message: 'Auftrag erstellt',
            id: this.lastID,
            changes: this.changes 
        });
    });
});

// Archiv-Endpunkt

app.get('/api/Produktion/auftraege/archiv', (req, res) => {
    console.log('Archiv-Endpunkt aufgerufen');
    const query = `
        SELECT 
            id,
            bezeichnung,
            beschreibung,
            datum,
            startZeit,
            endZeit,
            status,
            artikelnummer,
            artikelbezeichnung,
            maschine,
            bearbeiter,
            sollMenge,
            rueckmeldung
        FROM auftraege 
        WHERE (status = 'abgeschlossen' OR status = 'Abgeschlossen' OR status = 'completed' OR status = 'Completed')
            AND datum >= date('now', '-90 days')
        ORDER BY datum DESC, startZeit DESC 
        LIMIT 50
    `;
    
    dbProd.all(query, [], (err, rows) => {
        if (err) {
            console.error('Fehler beim Abrufen der Archivdaten:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        console.log('Gefundene Archiveinträge:', rows);
        res.json(rows || []);
    });
});
// Datenbank-Ping für Systemstatus
app.get('/api/database/ping', async (req, res) => {
    try {
        // Einfacher Test-Query auf die Benutzer-Datenbank
        await new Promise((resolve, reject) => {
            dbUsers.get('SELECT 1', [], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
        res.json({ connected: true });
    } catch (error) {
        console.error('Datenbank-Verbindungsfehler:', error);
        res.json({ connected: false });
    }
});

// Letzte Produktionsaufträge
app.get('/api/Produktion/auftraege/recent', async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                bezeichnung as beschreibung,
                datetime(datum || ' ' || startZeit) as zeitstempel,
                status
            FROM auftraege 
            WHERE status != 'abgeschlossen'
            ORDER BY datum DESC, startZeit DESC 
            LIMIT 5
        `;
        
        dbProd.all(query, [], (err, rows) => {
            if (err) {
                console.error('Fehler beim Abrufen der letzten Aufträge:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows || []);
        });
    } catch (error) {
        console.error('Fehler beim Abrufen der letzten Aufträge:', error);
        res.status(500).json({ error: error.message });
    }
});

// Support-System API Endpunkte
app.post('/api/support/submit', async (req, res) => {
    const { type, title, description, priority, timestamp, user, status } = req.body;
    
    // Validierung
    if (!type || !title || !description || !priority) {
        return res.status(400).json({ 
            error: 'Fehlende Pflichtfelder',
            message: 'Bitte füllen Sie alle Pflichtfelder aus.'
        });
    }
    
    dbSupport.run(
        `INSERT INTO support_tickets (type, title, description, priority, timestamp, user, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [type, title, description, priority, timestamp, user, status],
        function(err) {
            if (err) {
                console.error('Fehler beim Speichern des Support-Tickets:', err);
                return res.status(500).json({ 
                    error: 'Datenbankfehler',
                    message: 'Fehler beim Speichern des Tickets.'
                });
            }
            
            // Erfolgreiche Antwort mit Ticket-ID
            res.status(201).json({ 
                success: true,
                message: 'Support-Ticket erfolgreich erstellt',
                ticketId: this.lastID 
            });
        }
    );
});

// Support-Tickets abrufen (für Admin-Bereich)
app.get('/api/support/tickets', async (req, res) => {
    dbSupport.all(
        `SELECT * FROM support_tickets 
         ORDER BY timestamp DESC`,
        [],
        (err, rows) => {
            if (err) {
                console.error('Fehler beim Abrufen der Support-Tickets:', err);
                return res.status(500).json({ 
                    error: 'Datenbankfehler',
                    message: 'Fehler beim Abrufen der Tickets.'
                });
            }
            res.json(rows);
        }
    );
});

// Support-Ticket Status aktualisieren
app.patch('/api/support/tickets/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
        return res.status(400).json({ 
            error: 'Fehlender Status',
            message: 'Bitte geben Sie einen neuen Status an.'
        });
    }
    
    dbSupport.run(
        `UPDATE support_tickets 
         SET status = ? 
         WHERE id = ?`,
        [status, id],
        function(err) {
            if (err) {
                console.error('Fehler beim Aktualisieren des Ticket-Status:', err);
                return res.status(500).json({ 
                    error: 'Datenbankfehler',
                    message: 'Fehler beim Aktualisieren des Status.'
                });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ 
                    error: 'Nicht gefunden',
                    message: 'Ticket nicht gefunden.'
                });
            }
            
            res.json({ 
                success: true,
                message: 'Status erfolgreich aktualisiert'
            });
        }
    );
});

// Support-Ticket löschen
app.delete('/api/support/tickets/:id', (req, res) => {
    const ticketId = req.params.id;
    
    if (!ticketId) {
        return res.status(400).json({ error: 'Ticket ID ist erforderlich' });
    }

    dbSupport.run(
        'DELETE FROM support_tickets WHERE id = ?',
        [ticketId],
        function(err) {
            if (err) {
                console.error('Fehler beim Löschen des Tickets:', err);
                return res.status(500).json({ error: 'Datenbankfehler' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Ticket nicht gefunden' });
            }
            res.json({ success: true, message: 'Status erfolgreich aktualisiert' });
        }
    );
});

// Benachrichtigungen
// System-Events
// System-Version und Updates
// Lieferanten-Statistiken
app.get('/api/lieferanten/stats', async (req, res) => {
    try {
        const stats = {
            total: 0,
            active: 0,
            productGroups: 0,
            topRating: 0
        };

        // Gesamtzahl der Lieferanten
        await new Promise((resolve, reject) => {
            dbLief.get('SELECT COUNT(*) as count FROM lieferanten', [], (err, row) => {
                if (err) reject(err);
                stats.total = row ? row.count : 0;
                resolve();
            });
        });

        // Aktive Lieferanten
        await new Promise((resolve, reject) => {
            dbLief.get('SELECT COUNT(*) as count FROM lieferanten WHERE aktiv = 1', [], (err, row) => {
                if (err) reject(err);
                stats.active = row ? row.count : 0;
                resolve();
            });
        });

        // Anzahl der Produktgruppen
        await new Promise((resolve, reject) => {
            dbLief.get('SELECT COUNT(*) as count FROM produktgruppen', [], (err, row) => {
                if (err) reject(err);
                stats.productGroups = row ? row.count : 0;
                resolve();
            });
        });

        // Höchstes Rating
        await new Promise((resolve, reject) => {
            dbLief.get('SELECT MAX(rating) as maxRating FROM lieferanten WHERE rating IS NOT NULL', [], (err, row) => {
                if (err) reject(err);
                stats.topRating = row && row.maxRating !== null ? row.maxRating : 0;
                resolve();
            });
        });

        res.json(stats);
    } catch (error) {
        console.error('Fehler beim Abrufen der Lieferantenstatistiken:', error);
        res.status(500).json({ error: error.message });
    }
});

// System-Version und Updates
app.get('/api/system/version', async (req, res) => {
    try {
        // Aktuelle Version aus der Konfiguration (später dynamisch machen)
        const currentVersion = '1.5.0';
        const latestVersion = '1.5.1';
        
        res.json({
            currentVersion,
            latestVersion,
            updateAvailable: currentVersion !== latestVersion
        });
    } catch (error) {
        console.error('Fehler beim Abrufen der Systemversion:', error);
        res.status(500).json({ error: error.message });
    }
});

// System-Events
app.get('/api/system/events/recent', async (req, res) => {
    try {
        // Beispiel-System-Events (später durch echte Datenbankabfragen ersetzen)
        const events = [
            {
                id: 1,
                meldung: 'System-Update 1.5.1 verfügbar',
                zeitstempel: new Date(Date.now() - 2 * 3600000).toISOString(), // 2 Stunden alt
                typ: 'update'
            },
            {
                id: 2,
                meldung: 'Automatisches Backup erfolgreich',
                zeitstempel: new Date(Date.now() - 4 * 3600000).toISOString(), // 4 Stunden alt
                typ: 'backup'
            }
        ];
        res.json(events);
    } catch (error) {
        console.error('Fehler beim Abrufen der System-Events:', error);
        res.status(500).json({ error: error.message });
    }
});

// Benutzeraktivitäten
app.get('/api/users/activities/recent', async (req, res) => {
    try {
        // Beispiel-Benutzeraktivitäten (später durch echte Datenbankabfragen ersetzen)
        const activities = [
            {
                id: 1,
                benutzer: 'Max Mustermann',
                aktion: 'Neuer Produktionsauftrag erstellt',
                zeitstempel: new Date(Date.now() - 30 * 60000).toISOString() // 30 Minuten alt
            },
            {
                id: 2,
                benutzer: 'Anna Schmidt',
                aktion: 'Kalkulation aktualisiert',
                zeitstempel: new Date(Date.now() - 45 * 60000).toISOString() // 45 Minuten alt
            }
        ];
        res.json(activities);
    } catch (error) {
        console.error('Fehler beim Abrufen der Benutzeraktivitäten:', error);
        res.status(500).json({ error: error.message });
    }
});

// Benachrichtigungen
app.get('/api/notifications', async (req, res) => {
    try {
        // Beispiel-Benachrichtigungen (später durch echte Datenbankabfragen ersetzen)
        const notifications = [
            {
                id: 1,
                title: 'System-Update verfügbar',
                description: 'Eine neue Version (1.5.1) ist verfügbar.',
                timestamp: new Date(Date.now() - 10 * 60000).toISOString(), // 10 Minuten alt
                read: false
            },
            {
                id: 2,
                title: 'Backup abgeschlossen',
                description: 'Tägliches Backup wurde erfolgreich erstellt.',
                timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), // 2 Stunden alt
                read: false
            }
        ];
        res.json(notifications);
    } catch (error) {
        console.error('Fehler beim Abrufen der Benachrichtigungen:', error);
        res.status(500).json({ error: error.message });
    }
});

// Benutzeraktivitäts-Statistiken
app.get('/api/users/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const stats = {
            activeUsers: 0,
            activeSessions: 0,
            newDocuments: 0,
            changesCount: 0
        };

        // Aktive Benutzer zählen
        const activeUsersQuery = 'SELECT COUNT(DISTINCT username) as count FROM users WHERE role != "disabled"';
        
        await new Promise((resolve, reject) => {
            dbUsers.get(activeUsersQuery, [], (err, row) => {
                if (err) reject(err);
                stats.activeUsers = row ? row.count : 0;
                resolve();
            });
        });

        // Aktive Sitzungen werden später implementiert
        stats.activeSessions = 0;

        // Neue Dokumente und Änderungen aus verschiedenen Datenbanken zusammenzählen
        const prodChangesQuery = 'SELECT COUNT(*) as count FROM auftraege WHERE date(datum) = date(?)';
        const tourChangesQuery = 'SELECT COUNT(*) as count FROM shipments WHERE date(created_at) = date(?)';
        
        await new Promise((resolve, reject) => {
            dbProd.get(prodChangesQuery, [today], (err, row) => {
                if (err) reject(err);
                stats.newDocuments += row ? row.count : 0;
                resolve();
            });
        });

        await new Promise((resolve, reject) => {
            dbTour.get(tourChangesQuery, [today], (err, row) => {
                if (err) reject(err);
                stats.newDocuments += row ? row.count : 0;
                resolve();
            });
        });

        // Änderungen werden später implementiert
        stats.changesCount = 0;

        res.json(stats);
    } catch (error) {
        console.error('Fehler beim Abrufen der Benutzerstatistiken:', error);
        res.status(500).json({ error: error.message });
    }
});

// Planer-Statistiken
app.get('/api/planer/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        const weekDate = oneWeekFromNow.toISOString().split('T')[0];
        
        const stats = {
            totalTasks: 0,
            dueToday: 0,
            dueThisWeek: 0,
            plannedMaintenance: 0
        };

        // Aufgaben zählen
        const totalQuery = 'SELECT COUNT(*) as count FROM tasks WHERE status != "abgeschlossen"';
        const dueTodayQuery = 'SELECT COUNT(*) as count FROM tasks WHERE date(dueDate) = date(?) AND status != "abgeschlossen"';
        const dueWeekQuery = 'SELECT COUNT(*) as count FROM tasks WHERE date(dueDate) <= date(?) AND status != "abgeschlossen"';
        const maintenanceQuery = 'SELECT COUNT(*) as count FROM maintenance WHERE date(nextMaintenance) <= date(?)';
        
        await new Promise((resolve, reject) => {
            dbEnt.get(totalQuery, [], (err, row) => {
                if (err) reject(err);
                stats.totalTasks = row ? row.count : 0;
                resolve();
            });
        });

        await new Promise((resolve, reject) => {
            dbEnt.get(dueTodayQuery, [today], (err, row) => {
                if (err) reject(err);
                stats.dueToday = row ? row.count : 0;
                resolve();
            });
        });

        await new Promise((resolve, reject) => {
            dbEnt.get(dueWeekQuery, [weekDate], (err, row) => {
                if (err) reject(err);
                stats.dueThisWeek = row ? row.count : 0;
                resolve();
            });
        });

        await new Promise((resolve, reject) => {
            dbEnt.get(maintenanceQuery, [weekDate], (err, row) => {
                if (err) reject(err);
                stats.plannedMaintenance = row ? row.count : 0;
                resolve();
            });
        });

        res.json(stats);
    } catch (error) {
        console.error('Fehler beim Abrufen der Planerstatistiken:', error);
        res.status(500).json({ error: error.message });
    }
});

// Kalkulations-Statistiken
app.get('/api/kalkulation/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const stats = {
            totalCalculations: 0,
            createdToday: 0,
            accepted: 0,
            pending: 0
        };

        // Gesamtzahl der Kalkulationen
        const totalQuery = 'SELECT COUNT(*) as count FROM kalkulationen_artikel';
        const todayQuery = 'SELECT COUNT(*) as count FROM kalkulationen_artikel WHERE date(datum) = date(?)';
        
        await new Promise((resolve, reject) => {
            db.get(totalQuery, [], (err, row) => {
                if (err) reject(err);
                stats.totalCalculations = row ? row.count : 0;
                resolve();
            });
        });

        await new Promise((resolve, reject) => {
            db.get(todayQuery, [today], (err, row) => {
                if (err) reject(err);
                stats.createdToday = row ? row.count : 0;
                resolve();
            });
        });

        // Angenommen/Ausstehend wird später implementiert
        stats.accepted = 0;
        stats.pending = 0;

        res.json(stats);
    } catch (error) {
        console.error('Fehler beim Abrufen der Kalkulationsstatistiken:', error);
        res.status(500).json({ error: error.message });
    }
});

// Touren-Statistiken
app.get('/api/touren/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const stats = {
            activeRoutes: 0,
            vehiclesOnRoute: 0,
            deliveriesToday: 0,
            kmToday: 0
        };

        // Aktive Touren heute
        const activeRoutesQuery = 'SELECT COUNT(*) as count FROM tours WHERE date(datum) = date(?) AND status = "aktiv"';
        const vehiclesQuery = 'SELECT COUNT(DISTINCT fahrzeug) as count FROM tours WHERE date(datum) = date(?) AND status = "aktiv"';
        const deliveriesQuery = 'SELECT COUNT(*) as count FROM shipments WHERE date(lieferdatum) = date(?)';
        
        await new Promise((resolve, reject) => {
            dbTour.get(activeRoutesQuery, [today], (err, row) => {
                if (err) reject(err);
                stats.activeRoutes = row ? row.count : 0;
                resolve();
            });
        });

        await new Promise((resolve, reject) => {
            dbTour.get(vehiclesQuery, [today], (err, row) => {
                if (err) reject(err);
                stats.vehiclesOnRoute = row ? row.count : 0;
                resolve();
            });
        });

        await new Promise((resolve, reject) => {
            dbTour.get(deliveriesQuery, [today], (err, row) => {
                if (err) reject(err);
                stats.deliveriesToday = row ? row.count : 0;
                resolve();
            });
        });

        // Gesamtkilometer werden später implementiert
        stats.kmToday = 0;

        res.json(stats);
    } catch (error) {
        console.error('Fehler beim Abrufen der Tourenstatistiken:', error);
        res.status(500).json({ error: error.message });
    }
});

// Produktionsstatistiken
app.get('/api/produktion/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        const weekDate = oneWeekFromNow.toISOString().split('T')[0];

        const stats = {
            total: 0,
            dueToday: 0,
            dueThisWeek: 0,
            urgent: 0
        };

        // Gesamtzahl aktiver Aufträge
        const totalQuery = 'SELECT COUNT(*) as count FROM auftraege WHERE status != "abgeschlossen"';
        const dueTodayQuery = 'SELECT COUNT(*) as count FROM auftraege WHERE date(due) = date(?) AND status != "abgeschlossen"';
        const dueWeekQuery = 'SELECT COUNT(*) as count FROM auftraege WHERE date(due) <= date(?) AND status != "abgeschlossen"';
        const urgentQuery = 'SELECT COUNT(*) as count FROM auftraege WHERE status = "dringend"';

        await new Promise((resolve, reject) => {
            dbProd.get(totalQuery, [], (err, row) => {
                if (err) reject(err);
                stats.total = row ? row.count : 0;
                resolve();
            });
        });

        await new Promise((resolve, reject) => {
            dbProd.get(dueTodayQuery, [today], (err, row) => {
                if (err) reject(err);
                stats.dueToday = row ? row.count : 0;
                resolve();
            });
        });

        await new Promise((resolve, reject) => {
            dbProd.get(dueWeekQuery, [weekDate], (err, row) => {
                if (err) reject(err);
                stats.dueThisWeek = row ? row.count : 0;
                resolve();
            });
        });

        await new Promise((resolve, reject) => {
            dbProd.get(urgentQuery, [], (err, row) => {
                if (err) reject(err);
                stats.urgent = row ? row.count : 0;
                resolve();
            });
        });

        res.json(stats);
    } catch (error) {
        console.error('Fehler beim Abrufen der Produktionsstatistiken:', error);
        res.status(500).json({ error: error.message });
    }
});

// CORS-Konfiguration für alle Routen
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    credentials: true
}));

app.use(express.json());

// Zusätzliche Header für CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Benutzer-Datenbank initialisieren
const dbUsers = new sqlite3.Database(path.join(__dirname, 'benutzer.db'), (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Benutzer-Datenbank:', err.message);
    } else {
        console.log('Benutzer-Datenbank erfolgreich geöffnet.');
    }
});

// Lieferanten-Datenbank initialisieren
const dbLief = new sqlite3.Database(path.join(__dirname, 'lieferanten.db'), (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Lieferanten-Datenbank:', err.message);
    } else {
        console.log('Lieferanten-Datenbank erfolgreich geöffnet.');
    }
});

// Benutzer-Tabelle erstellen
dbUsers.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        rights TEXT
    )
`, (err) => {
    if (err) {
        console.error('Fehler beim Erstellen der Benutzer-Tabelle:', err.message);
    } else {
        console.log('Benutzer-Tabelle erfolgreich erstellt oder bereits vorhanden.');
        // Standard-Admin-Benutzer mit allen Rechten erstellen
        const adminRights = JSON.stringify([
            'Kalkulation.html',
            'EPS.html',
            'Drucker.html',
            'Plotter.html',
            'Zuschnitte.html',
            'Produktion.html',
            'Palettenkonto.html',
            'Aufgabe.html',
            'Entfernung.html',
            'G-Code.html',
            'unternehmensplaner.html'
        ]);
        
        dbUsers.run(
            'INSERT OR REPLACE INTO users (username, password, role, rights) VALUES (?, ?, ?, ?)',
            ['admin', 'admin123', 'admin', adminRights],
            (err) => {
                if (err) {
                    console.error('Fehler beim Erstellen des Admin-Benutzers:', err.message);
                } else {
                    console.log('Admin-Benutzer erfolgreich erstellt oder aktualisiert.');
                }
            }
        );
    }
});

// Login-Route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login-Versuch für Benutzer:', username);
    
    dbUsers.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
        if (err) {
            console.error('Datenbankfehler beim Login:', err);
            return res.status(500).json({ status: 'error', message: 'Datenbankfehler' });
        }
        
        if (!row) {
            console.log('Ungültige Anmeldedaten für Benutzer:', username);
            return res.status(401).json({ status: 'error', message: 'Ungültige Anmeldedaten' });
        }
        
        console.log('Gefundener Benutzer:', row);
        
        let userRights = [];
        try {
            userRights = JSON.parse(row.rights || '[]');
            console.log('Geparste Benutzerrechte:', userRights);
        } catch (e) {
            console.error('Fehler beim Parsen der Benutzerrechte:', e);
            console.log('Rohe Rechte aus DB:', row.rights);
            userRights = [];
        }

        // Für Admin-Benutzer alle verfügbaren Rechte setzen
        if (row.role === 'admin') {
            userRights = [
                'Kalkulation.html',
                'EPS.html',
                'Drucker.html',
                'Plotter.html',
                'Zuschnitte.html',
                'Produktion.html',
                'Palettenkonto.html',
                'Aufgabe.html',
                'Entfernung.html',
                'G-Code.html',
                'unternehmensplaner.html'
            ];
            console.log('Admin-Benutzer - setze alle Rechte:', userRights);
        }

        // Erfolgreiche Anmeldung
        const userData = {
            status: 'success',
            user: {
                id: row.id,
                name: row.username,
                role: row.role,
                rights: userRights
            }
        };
        
        console.log('Sende Benutzerantwort:', userData);
        res.json(userData);
    });
});

// Benutzer abrufen (nur für Admin)
app.get('/api/users', (req, res) => {
    dbUsers.all('SELECT id, username, role, rights FROM users', (err, rows) => {
        if (err) {
            console.error('Fehler beim Abrufen der Benutzer:', err);
            return res.status(500).json({ status: 'error', message: 'Datenbankfehler' });
        }
        const users = rows.map(row => ({
            id: row.id,
            name: row.username,  // Hier war der Fehler - wir müssen username als name zurückgeben
            username: row.username,
            role: row.role,
            rights: JSON.parse(row.rights || '[]')
        }));
        console.log('Sende Benutzerliste:', users);
        res.json(users);
    });
});

// Benutzer-Management-Routen
app.get('/api/users/:id', (req, res) => {
    dbUsers.get('SELECT id, username, role, rights FROM users WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ status: 'error', message: 'Datenbankfehler' });
        }
        if (!row) {
            return res.status(404).json({ status: 'error', message: 'Benutzer nicht gefunden' });
        }
        res.json({
            ...row,
            rights: JSON.parse(row.rights || '[]')
        });
    });
});

app.post('/api/users', (req, res) => {
    const { username, password, role, rights } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ status: 'error', message: 'Benutzername und Passwort sind erforderlich' });
    }

    dbUsers.run(
        'INSERT INTO users (username, password, role, rights) VALUES (?, ?, ?, ?)',
        [username, password, role, JSON.stringify(rights)],
        function(err) {
            if (err) {
                console.error('Fehler beim Erstellen des Benutzers:', err);
                return res.status(500).json({ status: 'error', message: 'Fehler beim Erstellen des Benutzers' });
            }
            res.json({ status: 'success', id: this.lastID });
        }
    );
});

app.put('/api/users/:id', (req, res) => {
    const { username, password, role, rights } = req.body;
    
    if (!username) {
        return res.status(400).json({ status: 'error', message: 'Benutzername ist erforderlich' });
    }

    let query, params;
    if (password) {
        query = 'UPDATE users SET username = ?, password = ?, role = ?, rights = ? WHERE id = ?';
        params = [username, password, role, JSON.stringify(rights), req.params.id];
    } else {
        query = 'UPDATE users SET username = ?, role = ?, rights = ? WHERE id = ?';
        params = [username, role, JSON.stringify(rights), req.params.id];
    }

    dbUsers.run(query, params, function(err) {
        if (err) {
            console.error('Fehler beim Aktualisieren des Benutzers:', err);
            return res.status(500).json({ status: 'error', message: 'Fehler beim Aktualisieren des Benutzers' });
        }
        res.json({ status: 'success', changes: this.changes });
    });
});

app.delete('/api/users/:id', (req, res) => {
    // Verhindere das Löschen des Admin-Benutzers
    dbUsers.get('SELECT username FROM users WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ status: 'error', message: 'Datenbankfehler' });
        }
        if (row && row.username === 'admin') {
            return res.status(403).json({ status: 'error', message: 'Der Admin-Benutzer kann nicht gelöscht werden' });
        }
        
        dbUsers.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
            if (err) {
                return res.status(500).json({ status: 'error', message: 'Fehler beim Löschen des Benutzers' });
            }
            res.json({ status: 'success', changes: this.changes });
        });
    });
});

// Statische Route für Unternehmensplaner
app.get('/unternehmensplaner', (req, res) => {
    res.sendFile(path.join(__dirname, 'unternehmensplaner.html'));
});

// SQLite-Datenbank öffnen
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Datenbank:', err.message);
    } else {
        console.log('Datenbank erfolgreich geöffnet.');
    }
});

// Tabelle aufgaben anpassen: Feld 'maschine' ergänzen
// (Falls die Spalte noch nicht existiert, per ALTER TABLE hinzufügen)
db.run(`ALTER TABLE aufgaben ADD COLUMN maschine TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen der Spalte maschine:', err.message);
    }
});

// Alle Aufgaben abrufen (inkl. maschine)
app.get('/api/aufgaben', (req, res) => {
    db.all('SELECT * FROM aufgaben', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});

// Neue Aufgabe anlegen (inkl. maschine)
app.post('/api/aufgaben', (req, res) => {
    const { titel, beschreibung, ansprechpartner, status, prioritaet, due, created, maschine } = req.body;
    db.run(
        `INSERT INTO aufgaben (titel, beschreibung, ansprechpartner, status, prioritaet, due, created, maschine)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [titel, beschreibung, ansprechpartner, status, prioritaet, due, created, maschine],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', id: this.lastID });
        }
    );
});

// Aufgabe bearbeiten (inkl. maschine)
app.put('/api/aufgaben/:id', (req, res) => {
    const { titel, beschreibung, ansprechpartner, status, prioritaet, due, created, maschine } = req.body;
    db.run(
        `UPDATE aufgaben SET titel=?, beschreibung=?, ansprechpartner=?, status=?, prioritaet=?, due=?, created=?, maschine=? WHERE id=?`,
        [titel, beschreibung, ansprechpartner, status, prioritaet, due, created, maschine, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', changes: this.changes });
        }
    );
});

// Aufgabe löschen
app.delete('/api/aufgaben/:id', (req, res) => {
    db.run('DELETE FROM aufgaben WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// --- Neue Kalkulationen-Artikel-API ---

db.run(`
    CREATE TABLE IF NOT EXISTS kalkulationen_artikel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kalkulation_id TEXT,
        datum TEXT,
        angebotsnummer TEXT,
        kundenname TEXT,
        menge REAL,
        paletten REAL,
        ek_je_pe REAL,
        einkaufssumme REAL,
        verkaufssumme REAL,
        vk_je_pe REAL,
        aufschlag REAL,
        anteilige_fracht REAL,
        db_gesamt REAL,
        ersteller TEXT DEFAULT 'Julian'
    )
`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle kalkulationen_artikel:', err.message);
    } else {
        console.log('Tabelle kalkulationen_artikel ist bereit.');
    }
});

// Stelle sicher, dass die ersteller-Spalte existiert (sicherer Ansatz)
db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='kalkulationen_artikel'", (err, tableInfo) => {
    if (err || !tableInfo) {
        console.error("Fehler beim Prüfen der Tabelle:", err ? err.message : "Tabelle nicht gefunden");
        return;
    }
    
    // Prüfe, ob die ersteller-Spalte in der Tabellendefinition vorkommt
    if (!tableInfo.sql.includes('ersteller')) {
        console.log("Füge ersteller-Spalte hinzu...");
        db.run("ALTER TABLE kalkulationen_artikel ADD COLUMN ersteller TEXT DEFAULT 'Julian'", err => {
            if (err) {
                console.error("Fehler beim Hinzufügen der ersteller-Spalte:", err.message);
            } else {
                console.log("ersteller-Spalte erfolgreich hinzugefügt!");
            }
        });
    }
});

// Alle Kalkulationen (gruppiert nach kalkulation_id)
app.get('/api/kalkulationen', (req, res) => {
    db.all('SELECT * FROM kalkulationen_artikel', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        
        // Gruppieren nach kalkulation_id
        const gruppiert = {};
        rows.forEach(row => {
            // Wenn diese kalkulation_id noch nicht existiert, initialisiere sie
            if (!gruppiert[row.kalkulation_id]) {
                // Ersteller-Wert behandeln
                let erstellerWert = row.ersteller || 'Julian';
                
                gruppiert[row.kalkulation_id] = { 
                    datum: row.datum, 
                    artikel: [],
                    ersteller: erstellerWert
                };
            }
            
            // Artikel zur Kalkulation hinzufügen mit ersteller
            const artikelObj = {...row};
            if (!artikelObj.ersteller) {
                artikelObj.ersteller = gruppiert[row.kalkulation_id].ersteller;
            }
            
            gruppiert[row.kalkulation_id].artikel.push(artikelObj);
        });
        
        // In Array umwandeln
        const groupedArray = Object.entries(gruppiert).map(([kalkulation_id, v]) => ({ 
            kalkulation_id, 
            datum: v.datum, 
            ersteller: v.ersteller,
            artikel: v.artikel.map(a => ({
                ...a,
                ersteller: a.ersteller || v.ersteller
            }))
        }));
        
        res.json(groupedArray);
    });
});

// Kalkulation mit Artikelliste speichern
app.post('/api/kalkulationen', (req, res) => {
    const { kalkulation_id, datum, artikelListe, ersteller } = req.body;
    
    if (!kalkulation_id || !datum || !Array.isArray(artikelListe)) {
        return res.status(400).json({ status: 'error', message: 'Ungültige Daten' });
    }
    
    // Standard-Ersteller verwenden, wenn keiner angegeben ist
    const erstellerWert = ersteller || 'Julian';
    
    const stmt = db.prepare(`INSERT INTO kalkulationen_artikel 
        (kalkulation_id, datum, angebotsnummer, kundenname, menge, paletten, ek_je_pe, einkaufssumme, verkaufssumme, vk_je_pe, aufschlag, anteilige_fracht, db_gesamt, ersteller) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    
    artikelListe.forEach(a => {
        // Verwende den Ersteller des Artikels oder fallback auf den Hauptersteller
        const artikelErsteller = a.ersteller || erstellerWert;
        
        stmt.run([
            kalkulation_id,
            datum,
            a.interneNummer || a.angebotsnummer || '',
            a.kundenname || '',
            a.mengeNum || a.menge || 0,
            a.anzahlPaletten || a.paletten || 0,
            a.ekJePreiseinheit || a.ek_je_pe || 0,
            a.einkaufssumme || ((a.ekJePreiseinheit || 0) * ((a.mengeNum || a.menge || 0) / (a.einheit || 1))),
            a.verkaufssumme || ((a.vkJePreiseinheit || 0) * ((a.mengeNum || a.menge || 0) / (a.einheit || 1))),
            a.vkJePreiseinheit || a.vk_je_pe || 0,
            a.aufschlagProzent || a.aufschlag || 0,
            a.anteiligeFracht || a.anteilige_fracht || 0,
            a.dbGesamt || a.db_gesamt || 0,
            artikelErsteller
        ]);
    });
    
    stmt.finalize(err => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});

// Einzelnen Artikel löschen
app.delete('/api/kalkulationen/:id', (req, res) => {
    db.run('DELETE FROM kalkulationen_artikel WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// === Neue Datenbank für Produktionsaufträge und Archiv ===
const dbPathProd = path.join(__dirname, 'produktionsauftraege.db');
console.log('Verwende Produktionsaufträge-Datenbank:', dbPathProd);
dbProd.on('open', (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Produktionsaufträge-Datenbank:', err.message);
    } else {
        console.log('Produktionsaufträge-Datenbank erfolgreich geöffnet.');
    }
});

dbProd.run(`
    CREATE TABLE IF NOT EXISTS auftraege (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bezeichnung TEXT,
        status TEXT,
        beschreibung TEXT,
        netzwerkDatei TEXT,
        bearbeiter TEXT,
        sollMenge INTEGER,
        artikelnummer TEXT,
        artikelbezeichnung TEXT,
        maschine TEXT,
        datum TEXT,
        rueckmeldung TEXT,
        startZeit TEXT,
        endZeit TEXT,
        pausen TEXT,
        stadien TEXT
    )
`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle auftraege (prod):', err.message);
    } else {
        console.log('Tabelle auftraege (prod) ist bereit.');
    }
});

dbProd.run(`
    CREATE TABLE IF NOT EXISTS archiv (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bezeichnung TEXT,
        status TEXT,
        beschreibung TEXT,
        netzwerkDatei TEXT,
        bearbeiter TEXT,
        sollMenge INTEGER,
        artikelnummer TEXT,
        artikelbezeichnung TEXT,
        maschine TEXT,
        datum TEXT,
        rueckmeldung TEXT,
        startZeit TEXT,
        endZeit TEXT,
        pausen TEXT,
        stadien TEXT
    )
`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle archiv (prod):', err.message);
    } else {
        console.log('Tabelle archiv (prod) ist bereit.');
    }
});

// Tabellen ggf. um das Feld kundenname erweitern
// (Falls die Spalte noch nicht existiert, per ALTER TABLE hinzufügen)
dbProd.run(`ALTER TABLE auftraege ADD COLUMN kundenname TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen der Spalte kundenname (auftraege):', err.message);
    }
});
dbProd.run(`ALTER TABLE archiv ADD COLUMN kundenname TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen der Spalte kundenname (archiv):', err.message);
    }
});

// Tabellen ggf. um das Feld due erweitern
// (Falls die Spalte noch nicht existiert, per ALTER TABLE hinzufügen)
dbProd.run(`ALTER TABLE auftraege ADD COLUMN due TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen der Spalte due (auftraege):', err.message);
    }
});
dbProd.run(`ALTER TABLE archiv ADD COLUMN due TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen der Spalte due (archiv):', err.message);
    }
});

// Tabellen ggf. um das Feld auftrag_id hinzufügen
// (Falls die Spalte noch nicht existiert, per ALTER TABLE hinzufügen)
dbProd.run(`ALTER TABLE archiv ADD COLUMN auftrag_id INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen der Spalte auftrag_id (archiv):', err.message);
    }
});

// === API für Produktionsaufträge ===
app.get('/api/prod-auftraege', (req, res) => {
    dbProd.all('SELECT * FROM auftraege', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});

app.post('/api/prod-auftraege', (req, res) => {
    const { bezeichnung, status, beschreibung, netzwerkDatei, bearbeiter, sollMenge, artikelnummer, artikelbezeichnung, maschine, kundenname, due, datum, rueckmeldung, startZeit, endZeit, pausen, stadien } = req.body;
    dbProd.run(
        `INSERT INTO auftraege (bezeichnung, status, beschreibung, netzwerkDatei, bearbeiter, sollMenge, artikelnummer, artikelbezeichnung, maschine, kundenname, due, datum, rueckmeldung, startZeit, endZeit, pausen, stadien)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [bezeichnung, status, beschreibung, netzwerkDatei, bearbeiter, sollMenge, artikelnummer, artikelbezeichnung, maschine, kundenname, due, datum, JSON.stringify(rueckmeldung), startZeit, endZeit, JSON.stringify(pausen), JSON.stringify(stadien)],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', id: this.lastID });
        }
    );
});

app.put('/api/prod-auftraege/:id', (req, res) => {
    const { bezeichnung, status, beschreibung, netzwerkDatei, bearbeiter, sollMenge, artikelnummer, artikelbezeichnung, maschine, kundenname, due, datum, rueckmeldung, startZeit, endZeit, pausen, stadien } = req.body;
    dbProd.run(
        `UPDATE auftraege SET bezeichnung=?, status=?, beschreibung=?, netzwerkDatei=?, bearbeiter=?, sollMenge=?, artikelnummer=?, artikelbezeichnung=?, maschine=?, kundenname=?, due=?, datum=?, rueckmeldung=?, startZeit=?, endZeit=?, pausen=?, stadien=? WHERE id=?`,
        [bezeichnung, status, beschreibung, netzwerkDatei, bearbeiter, sollMenge, artikelnummer, artikelbezeichnung, maschine, kundenname, due, datum, JSON.stringify(rueckmeldung), startZeit, endZeit, JSON.stringify(pausen), JSON.stringify(stadien), req.params.id],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', changes: this.changes });
        }
    );
});

app.delete('/api/prod-auftraege/:id', (req, res) => {
    dbProd.run('DELETE FROM auftraege WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// === API für Produktionsarchiv ===
app.get('/api/prod-archiv', (req, res) => {
    dbProd.all('SELECT * FROM archiv', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});

app.post('/api/prod-archiv', (req, res) => {
    const { id, bezeichnung, status, beschreibung, netzwerkDatei, bearbeiter, sollMenge, artikelnummer, artikelbezeichnung, maschine, kundenname, due, datum, rueckmeldung, startZeit, endZeit, pausen, stadien } = req.body;
    dbProd.run(
        `INSERT INTO archiv (auftrag_id, bezeichnung, status, beschreibung, netzwerkDatei, bearbeiter, sollMenge, artikelnummer, artikelbezeichnung, maschine, kundenname, due, datum, rueckmeldung, startZeit, endZeit, pausen, stadien)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, bezeichnung, status, beschreibung, netzwerkDatei, bearbeiter, sollMenge, artikelnummer, artikelbezeichnung, maschine, kundenname, due, datum, JSON.stringify(rueckmeldung), startZeit, endZeit, JSON.stringify(pausen), JSON.stringify(stadien)],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', id: this.lastID });
        }
    );
});

app.put('/api/prod-archiv/:id', (req, res) => {
    const { bezeichnung, status, beschreibung, netzwerkDatei, bearbeiter, sollMenge, artikelnummer, artikelbezeichnung, maschine, kundenname, due, datum, rueckmeldung, startZeit, endZeit, pausen, stadien } = req.body;
    dbProd.run(
        `UPDATE archiv SET bezeichnung=?, status=?, beschreibung=?, netzwerkDatei=?, bearbeiter=?, sollMenge=?, artikelnummer=?, artikelbezeichnung=?, maschine=?, kundenname=?, due=?, datum=?, rueckmeldung=?, startZeit=?, endZeit=?, pausen=?, stadien=? WHERE id=?`,
        [bezeichnung, status, beschreibung, netzwerkDatei, bearbeiter, sollMenge, artikelnummer, artikelbezeichnung, maschine, kundenname, due, datum, JSON.stringify(rueckmeldung), startZeit, endZeit, JSON.stringify(pausen), JSON.stringify(stadien), req.params.id],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', changes: this.changes });
        }
    );
});

app.delete('/api/prod-archiv/:id', (req, res) => {
    dbProd.run('DELETE FROM archiv WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// === Palettenkonto: Kunden & Vorgänge ===
db.run(`
    CREATE TABLE IF NOT EXISTS paletten_kunden (
        id TEXT PRIMARY KEY,
        name TEXT,
        nummer TEXT,
        adresse TEXT
    )
`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle paletten_kunden:', err.message);
    } else {
        console.log('Tabelle paletten_kunden ist bereit.');
    }
});
db.run(`
    CREATE TABLE IF NOT EXISTS paletten_vorgaenge (
        id TEXT PRIMARY KEY,
        kundeId TEXT,
        lieferschein TEXT,
        geliefert INTEGER,
        getauscht INTEGER,
        differenz INTEGER,
        datum TEXT
    )
`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle paletten_vorgaenge:', err.message);
    } else {
        console.log('Tabelle paletten_vorgaenge ist bereit.');
    }
});
// --- Kunden-API ---
app.get('/api/paletten-kunden', (req, res) => {
    db.all('SELECT * FROM paletten_kunden', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});
app.post('/api/paletten-kunden', (req, res) => {
    const { id, name, nummer, adresse } = req.body;
    db.run(
        `INSERT INTO paletten_kunden (id, name, nummer, adresse) VALUES (?, ?, ?, ?)`,
        [id, name, nummer, adresse],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', id });
        }
    );
});
app.delete('/api/paletten-kunden/:id', (req, res) => {
    db.run('DELETE FROM paletten_kunden WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});
// --- Vorgänge-API ---
app.get('/api/paletten-vorgaenge', (req, res) => {
    db.all('SELECT * FROM paletten_vorgaenge', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});
app.post('/api/paletten-vorgaenge', (req, res) => {
    const { id, kundeId, lieferschein, geliefert, getauscht, differenz, datum } = req.body;
    db.run(
        `INSERT INTO paletten_vorgaenge (id, kundeId, lieferschein, geliefert, getauscht, differenz, datum) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, kundeId, lieferschein, geliefert, getauscht, differenz, datum],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', id });
        }
    );
});
app.delete('/api/paletten-vorgaenge/:id', (req, res) => {
    db.run('DELETE FROM paletten_vorgaenge WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// === Palettenkonto: Archiv ===
db.run(`
    CREATE TABLE IF NOT EXISTS paletten_archiv (
        id TEXT PRIMARY KEY,
        kundeId TEXT,
        lieferschein TEXT,
        geliefert INTEGER,
        getauscht INTEGER,
        differenz INTEGER,
        datum TEXT
    )
`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle paletten_archiv:', err.message);
    } else {
        console.log('Tabelle paletten_archiv ist bereit.');
    }
});
// --- Archiv-API ---
app.get('/api/paletten-archiv', (req, res) => {
    db.all('SELECT * FROM paletten_archiv', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});
app.post('/api/paletten-archiv', (req, res) => {
    const { id, kundeId, lieferschein, geliefert, getauscht, differenz, datum } = req.body;
    db.run(
        `INSERT INTO paletten_archiv (id, kundeId, lieferschein, geliefert, getauscht, differenz, datum) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, kundeId, lieferschein, geliefert, getauscht, differenz, datum],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', id });
        }
    );
});
app.delete('/api/paletten-archiv/:id', (req, res) => {
    db.run('DELETE FROM paletten_archiv WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});
// --- Import/Export für Kunden, Vorgänge, Archiv ---
// --- Import Kunden ---
app.post('/api/paletten-kunden/import', (req, res) => {
    const kunden = req.body;
    if (!Array.isArray(kunden)) return res.status(400).json({ status: 'error', message: 'Array erwartet' });
    const stmt = db.prepare(`INSERT OR IGNORE INTO paletten_kunden (id, name, nummer, adresse) VALUES (?, ?, ?, ?)`);
    kunden.forEach(k => {
        stmt.run([k.id, k.name, k.nummer, k.adresse]);
    });
    stmt.finalize(err => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});
// --- Import Vorgänge ---
app.post('/api/paletten-vorgaenge/import', (req, res) => {
    const vorgaenge = req.body;
    if (!Array.isArray(vorgaenge)) return res.status(400).json({ status: 'error', message: 'Array erwartet' });
    const stmt = db.prepare(`INSERT OR IGNORE INTO paletten_vorgaenge (id, kundeId, lieferschein, geliefert, getauscht, differenz, datum) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    vorgaenge.forEach(v => {
        stmt.run([v.id, v.kundeId, v.lieferschein, v.geliefert, v.getauscht, v.differenz, v.datum]);
    });
    stmt.finalize(err => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});
// --- Import Archiv ---
app.post('/api/paletten-archiv/import', (req, res) => {
    const archiv = req.body;
    if (!Array.isArray(archiv)) return res.status(400).json({ status: 'error', message: 'Array erwartet' });
    const stmt = db.prepare(`INSERT OR IGNORE INTO paletten_archiv (id, kundeId, lieferschein, geliefert, getauscht, differenz, datum) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    archiv.forEach(v => {
        stmt.run([v.id, v.kundeId, v.lieferschein, v.geliefert, v.getauscht, v.differenz, v.datum]);
    });
    stmt.finalize(err => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success' });
    });
});
// --- Export Kunden ---
app.get('/api/paletten-kunden/export', (req, res) => {
    db.all('SELECT * FROM paletten_kunden', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        if (req.query.format === 'csv') {
            const parser = new Parser();
            const csv = parser.parse(rows);
            res.header('Content-Type', 'text/csv');
            res.attachment('paletten_kunden.csv');
            return res.send(csv);
        }
        res.json(rows);
    });
});
// --- Export Vorgänge ---
app.get('/api/paletten-vorgaenge/export', (req, res) => {
    db.all('SELECT * FROM paletten_vorgaenge', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        if (req.query.format === 'csv') {
            const parser = new Parser();
            const csv = parser.parse(rows);
            res.header('Content-Type', 'text/csv');
            res.attachment('paletten_vorgaenge.csv');
            return res.send(csv);
        }
        res.json(rows);
    });
});
// --- Export Archiv ---
app.get('/api/paletten-archiv/export', (req, res) => {
    db.all('SELECT * FROM paletten_archiv', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        if (req.query.format === 'csv') {
            const parser = new Parser();
            const csv = parser.parse(rows);
            res.header('Content-Type', 'text/csv');
            res.attachment('paletten_archiv.csv');
            return res.send(csv);
        }
        res.json(rows);
    });
});

// === Zuschnitt Preisliste ===
db.run(`
    CREATE TABLE IF NOT EXISTS zuschnitt_preisliste (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preise TEXT,
        labels TEXT,
        beschreibung TEXT,
        updated_at TEXT
    )
`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle zuschnitt_preisliste:', err.message);
    } else {
        console.log('Tabelle zuschnitt_preisliste ist bereit.');
    }
});

// GET Preisliste abrufen
app.get('/api/zuschnitt-preisliste', (req, res) => {
    db.get('SELECT * FROM zuschnitt_preisliste ORDER BY id DESC LIMIT 1', (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        if (!row) {
            // Standardpreise zurückgeben, wenn noch keine in der DB sind
            return res.json({
                preise: {
                    b: { '200': 0.80, '500': 0.75, '1500': 0.70, '3000': 0.65 },
                    e: { '200': 0.90, '500': 0.85, '1500': 0.80, '3000': 0.72 },
                    bc: { '200': 1.10, '500': 1.00, '1500': 0.95, '3000': 0.89 }
                },
                labels: {
                    b: 'B-Welle',
                    e: 'E-Welle',
                    bc: 'BC-Welle'
                },
                beschreibung: 'Standardpreisliste',
                updated_at: new Date().toISOString()
            });
        }
        try {
            // Parse JSON Preise und Labels
            const preise = JSON.parse(row.preise);
            const labels = JSON.parse(row.labels);
            
            res.json({
                id: row.id,
                preise,
                labels,
                beschreibung: row.beschreibung,
                updated_at: row.updated_at
            });
        } catch (e) {
            res.status(500).json({ status: 'error', message: 'Fehler beim Parsen der Preisdaten: ' + e.message });
        }
    });
});

// Preisliste speichern (überschreibt bestehende)
app.post('/api/zuschnitt-preisliste', (req, res) => {
    const { preise, labels, beschreibung } = req.body;
    
    if (!preise || !labels) {
        return res.status(400).json({ status: 'error', message: 'Preise und Labels sind erforderlich' });
    }

    // Preise und Labels als JSON speichern
    const preiseJSON = JSON.stringify(preise);
    const labelsJSON = JSON.stringify(labels);
    const now = new Date().toISOString();
    
    // Erst alle vorhandenen Preislisten löschen
    db.run('DELETE FROM zuschnitt_preisliste', function(err) {
        if (err) {
            console.error('Fehler beim Löschen alter Preislisten:', err.message);
            // Trotzdem fortfahren, auch wenn Löschen fehlschlägt
        }
        
        // Dann neue Preisliste einfügen
        db.run(
            `INSERT INTO zuschnitt_preisliste (preise, labels, beschreibung, updated_at) VALUES (?, ?, ?, ?)`,
            [preiseJSON, labelsJSON, beschreibung || 'Importierte Preisliste', now],
            function(err) {
                if (err) return res.status(500).json({ status: 'error', message: err.message });
                res.json({ 
                    status: 'success', 
                    id: this.lastID,
                    updated_at: now 
                });
            }
        );
    });
});

// Preisliste löschen
app.delete('/api/zuschnitt-preisliste', (req, res) => {
    db.run('DELETE FROM zuschnitt_preisliste', function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ 
            status: 'success', 
            message: 'Alle Preislisten wurden gelöscht',
            deleted: this.changes 
        });
    });
});

// Preisliste Export (nur aktuelle Version, da wir ältere löschen)
app.get('/api/zuschnitt-preisliste/export', (req, res) => {
    db.get('SELECT * FROM zuschnitt_preisliste ORDER BY id DESC LIMIT 1', (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        if (!row) return res.json({ status: 'info', message: 'Keine Preisliste vorhanden' });
        
        try {
            const result = {
                id: row.id,
                preise: JSON.parse(row.preise),
                labels: JSON.parse(row.labels),
                beschreibung: row.beschreibung,
                updated_at: row.updated_at
            };
            res.json(result);
        } catch (e) {
            res.status(500).json({ 
                status: 'error', 
                message: 'Fehler beim Parsen der Daten',
                error: e.message 
            });
        }
    });
});

// === UNTERNEHMENSPLANER DATABASE & APIs ===
const dbUnternehmen = path.join(__dirname, 'unternehmensplaner.db');
console.log('Verwende Unternehmensplaner-Datenbank:', dbUnternehmen);
const dbEnt = new sqlite3.Database(dbUnternehmen, (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Unternehmensplaner-Datenbank:', err.message);
    } else {
        console.log('Unternehmensplaner-Datenbank erfolgreich geöffnet.');
    }
});

// Füge fehlende Spalten zur contracts Tabelle hinzu
dbEnt.run(`ALTER TABLE contracts ADD COLUMN cancelationPeriod TEXT DEFAULT ''`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen der cancelationPeriod Spalte:', err);
    }
});

dbEnt.run(`ALTER TABLE contracts ADD COLUMN reminderDays INTEGER DEFAULT 30`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
        console.error('Fehler beim Hinzufügen der reminderDays Spalte:', err);
    }
});

// Graceful Shutdown erweitern für Enterprise DB
function gracefulShutdown() {
    console.log('Beende Server sauber...');
    
    server.close(() => {
        console.log('Server geschlossen.');
        
        // Alle Datenbanken sauber schließen
        db.close((err) => {
            if (err) console.error('Fehler beim Schließen der Hauptdatenbank:', err.message);
            else console.log('Hauptdatenbank geschlossen.');
            
            dbProd.close((err) => {
                if (err) console.error('Fehler beim Schließen der Produktionsdatenbank:', err.message);
                else console.log('Produktionsdatenbank geschlossen.');
                
                dbEnt.close((err) => {
                    if (err) console.error('Fehler beim Schließen der Unternehmensplaner-Datenbank:', err.message);
                    else console.log('Unternehmensplaner-Datenbank geschlossen.');
                    
                    dbTour.close((err) => {
                        if (err) console.error('Fehler beim Schließen der Tourenplaner-Datenbank:', err.message);
                        else console.log('Tourenplaner-Datenbank geschlossen.');
                        
                        console.log('Server wurde sauber beendet.');
                        process.exit(0);
                    });
                });
            });
        });
    });
    
    setTimeout(() => {
        console.error('Konnte Server nicht sauber beenden. Erzwinge Beendigung.');
        process.exit(1);
    }, 10000);
}

// Unternehmensplaner Tabellen erstellen
dbEnt.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    assignee TEXT,
    dueDate TEXT,
    recurring INTEGER DEFAULT 0,
    recurringInterval TEXT,
    vehicleId INTEGER,
    createdBy TEXT,
    created TEXT DEFAULT CURRENT_DATE,
    completed TEXT,
    notificationSent INTEGER DEFAULT 0
)`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle tasks:', err.message);
    } else {
        console.log('Tabelle tasks (Unternehmensplaner) ist bereit.');
    }
});

dbEnt.run(`CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    model TEXT,
    year INTEGER,
    tuvDate TEXT,
    auDate TEXT,
    uvvDate TEXT,
    tachographLastRead TEXT,
    tachographNextRead TEXT,
    tachographLastCheck TEXT,
    tachographNextCheck TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle vehicles:', err.message);
    } else {
        console.log('Tabelle vehicles (Unternehmensplaner) ist bereit.');
        
        // Füge Tachograph-Spalten hinzu, falls sie nicht existieren
        const tachographColumns = [
            'tachographLastRead TEXT',
            'tachographNextRead TEXT', 
            'tachographLastCheck TEXT',
            'tachographNextCheck TEXT'
        ];
        
        tachographColumns.forEach(column => {
            const columnName = column.split(' ')[0];
            dbEnt.run(`ALTER TABLE vehicles ADD COLUMN ${column}`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error(`Fehler beim Hinzufügen der Spalte ${columnName}:`, err.message);
                }
            });
        });
    }
});

dbEnt.run(`CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    issuer TEXT,
    issuedDate TEXT,
    expiryDate TEXT,
    type TEXT,
    description TEXT,
    createdBy TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle certificates:', err.message);
    } else {
        console.log('Tabelle certificates (Unternehmensplaner) ist bereit.');
    }
});

dbEnt.run(`CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    partner TEXT,
    type TEXT,
    startDate TEXT,
    endDate TEXT,
    cancelationPeriod TEXT,
    reminderDays INTEGER,
    description TEXT,
    createdBy TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'
)`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle contracts:', err.message);
    } else {
        console.log('Tabelle contracts (Unternehmensplaner) ist bereit.');
    }
});

dbEnt.run(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position TEXT,
    department TEXT,
    email TEXT,
    phone TEXT,
    hireDate TEXT,
    driverCardRead TEXT,
    firstAid TEXT,
    safety TEXT,
    forklift TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle employees:', err.message);
    } else {
        console.log('Tabelle employees (Unternehmensplaner) ist bereit.');
    }
});

// Maintenance table with vehicle_id column
dbEnt.run(`CREATE TABLE IF NOT EXISTS maintenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER,
    object TEXT NOT NULL,
    type TEXT NOT NULL,
    lastMaintenance TEXT,
    nextMaintenance TEXT,
    interval TEXT,
    description TEXT,
    notes TEXT,
    createdBy TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE CASCADE
)`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle maintenance:', err.message);
    } else {
        console.log('Tabelle maintenance (Unternehmensplaner) ist bereit.');
    }
});

// Vehicle maintenance table (separate from general maintenance)
dbEnt.run(`CREATE TABLE IF NOT EXISTS vehicle_maintenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    lastDate TEXT,
    nextDate TEXT,
    interval INTEGER DEFAULT 12,
    reminderDays INTEGER DEFAULT 30,
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE CASCADE
)`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle vehicle_maintenance:', err.message);
    } else {
        console.log('Tabelle vehicle_maintenance ist bereit.');
    }
});

// Vehicle compliance table
dbEnt.run(`CREATE TABLE IF NOT EXISTS vehicle_compliance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    tuv TEXT,
    au TEXT,
    uvv TEXT,
    insurance TEXT,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE CASCADE
)`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle vehicle_compliance:', err.message);
    } else {
        console.log('Tabelle vehicle_compliance ist bereit.');
    }
});

// Employee licenses table
dbEnt.run(`CREATE TABLE IF NOT EXISTS employee_licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    class TEXT NOT NULL,
    expiry TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
)`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle employee_licenses:', err.message);
    } else {
        console.log('Tabelle employee_licenses ist bereit.');
    }
});

// Add new columns to existing employees table
const employeeColumns = [
    'drivingLicenses TEXT',
    'driverCardRead TEXT', 
    'firstAid TEXT',
    'safety TEXT',
    'forklift TEXT'
];

employeeColumns.forEach(column => {
    const columnName = column.split(' ')[0];
    dbEnt.run(`ALTER TABLE employees ADD COLUMN ${column}`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error(`Fehler beim Hinzufügen der Spalte ${columnName}:`, err.message);
        }
    });
});

// === TASKS API ===
app.get('/api/tasks', (req, res) => {
    dbEnt.all('SELECT * FROM tasks ORDER BY dueDate', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});

// Einzelnen Task laden
app.get('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    dbEnt.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        if (!row) return res.status(404).json({ status: 'error', message: 'Task nicht gefunden' });
        res.json(row);
    });
});

app.post('/api/tasks', (req, res) => {
    const { title, description, type, priority, assignee, dueDate, recurring, recurringInterval, vehicleId, createdBy } = req.body;
    
    if (!title || !type) {
        return res.status(400).json({ status: 'error', message: 'Titel und Typ sind erforderlich' });
    }
    
    dbEnt.run(
        `INSERT INTO tasks (title, description, type, priority, assignee, dueDate, recurring, recurringInterval, vehicleId, createdBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, description, type, priority, assignee, dueDate, recurring ? 1 : 0, recurringInterval, vehicleId, createdBy],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', id: this.lastID });
        }
    );
});

app.put('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const { status, completed, recurring, recurringInterval, title, description, type, priority, assignee, dueDate, vehicleId } = req.body;

    // Wenn Task auf "completed" gesetzt wird und es sich um eine Wartungsaufgabe handelt
    if (status === 'completed' && type === 'maintenance' && recurring) {
        // Berechne das neue Fälligkeitsdatum basierend auf dem Intervall
        let newDueDate = new Date(dueDate);
        const today = new Date();
        
        // Setze das neue Datum basierend auf dem aktuellen Datum
        switch(recurringInterval) {
            case 'weekly':
                newDueDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
                break;
            case 'monthly':
                newDueDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
                break;
            case 'quarterly':
                newDueDate = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
                break;
            case 'yearly':
                newDueDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
                break;
            default:
                // Wenn kein gültiges Intervall, keine neue Aufgabe erstellen
                break;
        }

        // Erstelle neue Wartungsaufgabe mit gleicher Struktur wie Compliance Tasks
        if (recurringInterval) {
            const taskTitle = `Wartung: ${title.replace(/^Wartung: /, '')}`;
            const taskDescription = `Nächste planmäßige Wartung für: ${description.split('\n')[0]}`;
            
            dbEnt.run(
                `INSERT INTO tasks (
                    title, description, type, priority, status, 
                    assignee, dueDate, recurring, recurringInterval, 
                    vehicleId, createdBy, created
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    taskTitle, taskDescription, type, priority, 'open',
                    assignee, newDueDate.toISOString().split('T')[0], 1, recurringInterval,
                    vehicleId, 'System (Auto)', today.toISOString().split('T')[0]
                ],
                (err) => {
                    if (err) {
                        console.error('Fehler beim Erstellen der neuen Wartungsaufgabe:', err);
                    } else {
                        console.log('Neue Wartungsaufgabe erstellt für:', taskTitle);
                    }
                }
            );
        }
    }

    // Aktualisiere den bestehenden Task
    dbEnt.run(
        `UPDATE tasks SET 
            status = COALESCE(?, status),
            completed = CASE 
                WHEN ? = 'completed' AND completed IS NULL THEN CURRENT_DATE
                WHEN ? != 'completed' THEN NULL
                ELSE completed
            END
        WHERE id = ?`,
        [status, status, status, id],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ error: 'Task nicht gefunden' });
                return;
            }
            res.json({ 
                status: 'success',
                message: 'Task aktualisiert' + (recurring && status === 'completed' ? ' und neue Wartungsaufgabe erstellt' : ''),
                changes: this.changes 
            });
        }
    );
});

app.delete('/api/tasks/:id', (req, res) => {
    dbEnt.run('DELETE FROM tasks WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// === VEHICLES API ===
app.get('/api/vehicles', (req, res) => {
    dbEnt.all('SELECT * FROM vehicles ORDER BY plate', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});

app.post('/api/vehicles', (req, res) => {
    const { plate, type, model, year, tuvDate, auDate, uvvDate, tachographLastRead, tachographNextRead, tachographLastCheck, tachographNextCheck } = req.body;
    
    if (!plate || !type) {
        return res.status(400).json({ error: 'Kennzeichen und Typ sind erforderlich' });
    }
    
    dbEnt.run(
        `INSERT INTO vehicles (plate, type, model, year, tuvDate, auDate, uvvDate, tachographLastRead, tachographNextRead, tachographLastCheck, tachographNextCheck) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [plate, type, model, year, tuvDate, auDate, uvvDate, tachographLastRead, tachographNextRead, tachographLastCheck, tachographNextCheck],
        function(err) {
            if (err) {
                console.error('Fehler beim Speichern des Fahrzeugs:', err.message);
                res.status(400).json({ error: err.message });
                return;
            }
            console.log('Fahrzeug erfolgreich gespeichert mit ID:', this.lastID);
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/vehicles/:id', (req, res) => {
    const { id } = req.params;
    const { plate, type, model, year, tuvDate, auDate, uvvDate, tachographLastRead, tachographNextRead, tachographLastCheck, tachographNextCheck } = req.body;
    
    dbEnt.run(
        `UPDATE vehicles SET plate = ?, type = ?, model = ?, 
         tuvDate = ?, auDate = ?, uvvDate = ?, tachographLastRead = ?, tachographNextRead = ?, tachographLastCheck = ?, tachographNextCheck = ? WHERE id = ?`,
        [plate, type, model, tuvDate, auDate, uvvDate, tachographLastRead, tachographNextRead, tachographLastCheck, tachographNextCheck, id],
        function(err) {
            if (err) {
                console.error('Fehler beim Update des Fahrzeugs:', err.message);
                res.status(400).json({ error: err.message });
                return;
            }
            console.log('Fahrzeug erfolgreich aktualisiert, Änderungen:', this.changes);
            res.json({ changes: this.changes });
        }
    );
});

app.delete('/api/vehicles/:id', (req, res) => {
    dbEnt.run('DELETE FROM vehicles WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// === CERTIFICATES API ===
app.get('/api/certificates', (req, res) => {
    dbEnt.all('SELECT * FROM certificates ORDER BY expiryDate', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});

app.post('/api/certificates', (req, res) => {
    const { name, issuer, issuedDate, expiryDate, type, description, createdBy } = req.body;
    
    dbEnt.run(
        `INSERT INTO certificates (name, issuer, issuedDate, expiryDate, type, description, createdBy) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, issuer, issuedDate, expiryDate, type, description, createdBy],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/certificates/:id', (req, res) => {
    const { id } = req.params;
    const { name, issuer, issuedDate, expiryDate, type, description } = req.body;
    
    dbEnt.run(
        `UPDATE certificates SET name = ?, issuer = ?, issuedDate = ?, 
         expiryDate = ?, type = ?, description = ? WHERE id = ?`,
        [name, issuer, issuedDate, expiryDate, type, description, id],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.json({ changes: this.changes });
        }
    );
});

app.delete('/api/certificates/:id', (req, res) => {
    dbEnt.run('DELETE FROM certificates WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// === CONTRACTS API ===
app.get('/api/contracts', (req, res) => {
    dbEnt.all('SELECT * FROM contracts ORDER BY endDate', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        // Feldnamen für Frontend anpassen
        const transformedRows = rows.map(row => ({
            ...row,
            name: row.title,
            notes: row.description
        }));
        res.json(transformedRows);
    });
});

app.post('/api/contracts', (req, res) => {
    const { name, partner, type, startDate, endDate, cancelationPeriod, reminderDays, notes, createdBy } = req.body;
    
    // Validierung der Pflichtfelder
    if (!name || !partner || !type) {
        return res.status(400).json({ 
            error: 'Pflichtfelder fehlen',
            details: {
                name: !name ? 'Name ist erforderlich' : null,
                partner: !partner ? 'Partner ist erforderlich' : null,
                type: !type ? 'Typ ist erforderlich' : null
            }
        });
    }

    // Datumsvalidierung
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({ 
            error: 'Ungültiger Zeitraum',
            details: 'Das Startdatum muss vor dem Enddatum liegen'
        });
    }

    // Standardwerte setzen
    const contractData = {
        title: name.trim(),
        partner: partner.trim(),
        type: type.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
        cancelationPeriod: cancelationPeriod || '',
        reminderDays: reminderDays || 30,
        description: notes ? notes.trim() : '',
        createdBy: createdBy || 'System',
        createdAt: new Date().toISOString(),
        status: 'active'
    };
    
    dbEnt.run(
        `INSERT INTO contracts (
            title, partner, type, startDate, endDate, 
            cancelationPeriod, reminderDays, description, createdBy, createdAt,
            status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            contractData.title, contractData.partner, contractData.type,
            contractData.startDate, contractData.endDate, 
            contractData.cancelationPeriod, contractData.reminderDays,
            contractData.description, contractData.createdBy, contractData.createdAt,
            contractData.status
        ],
        function(err) {
            if (err) {
                console.error('Fehler beim Speichern des Vertrags:', err);
                res.status(500).json({ 
                    error: 'Datenbankfehler',
                    details: err.message 
                });
                return;
            }
            res.json({ 
                status: 'success',
                id: this.lastID,
                message: 'Vertrag erfolgreich gespeichert'
            });
        }
    );
});

app.put('/api/contracts/:id', (req, res) => {
    const { id } = req.params;
    const { name, partner, type, startDate, endDate, cancelationPeriod, reminderDays, notes } = req.body;
    
    // Validierung der Pflichtfelder
    if (!name || !partner || !type) {
        return res.status(400).json({ 
            error: 'Pflichtfelder fehlen',
            details: {
                name: !name ? 'Name ist erforderlich' : null,
                partner: !partner ? 'Partner ist erforderlich' : null,
                type: !type ? 'Typ ist erforderlich' : null
            }
        });
    }

    // Datumsvalidierung
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({ 
            error: 'Ungültiger Zeitraum',
            details: 'Das Startdatum muss vor dem Enddatum liegen'
        });
    }

    // Standardwerte setzen
    const contractData = {
        title: name.trim(),
        partner: partner.trim(),
        type: type.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
        cancelationPeriod: cancelationPeriod || '',
        reminderDays: reminderDays || 30,
        description: notes ? notes.trim() : '',
        updatedAt: new Date().toISOString()
    };
    
    dbEnt.run(
        `UPDATE contracts SET 
            title = ?, partner = ?, type = ?, startDate = ?, 
            endDate = ?, cancelationPeriod = ?, reminderDays = ?,
            description = ?, updatedAt = ?
         WHERE id = ?`,
        [
            contractData.title, contractData.partner, contractData.type,
            contractData.startDate, contractData.endDate,
            contractData.cancelationPeriod, contractData.reminderDays,
            contractData.description, contractData.updatedAt,
            id
        ],
        function(err) {
            if (err) {
                console.error('Fehler beim Aktualisieren des Vertrags:', err);
                res.status(500).json({ 
                    error: 'Datenbankfehler',
                    details: err.message 
                });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ 
                    error: 'Vertrag nicht gefunden',
                    details: `Kein Vertrag mit ID ${id} gefunden`
                });
                return;
            }
            res.json({ 
                status: 'success',
                changes: this.changes,
                message: 'Vertrag erfolgreich aktualisiert'
            });
        }
    );
});

app.delete('/api/contracts/:id', (req, res) => {
    dbEnt.run('DELETE FROM contracts WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// === EMPLOYEES API ===
app.get('/api/employees', (req, res) => {
    dbEnt.all(`SELECT e.*, 
            GROUP_CONCAT(el.class || ':' || el.expiry) as licenses
            FROM employees e 
            LEFT JOIN employee_licenses el ON e.id = el.employee_id 
            GROUP BY e.id 
            ORDER BY e.createdAt DESC`, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Parse licenses
        const employees = rows.map(emp => ({
            ...emp,
            drivingLicenses: emp.licenses ? 
                emp.licenses.split(',').map(l => {
                    const [licenseClass, expiry] = l.split(':');
                    return { class: licenseClass, expiry };
                }) : []
        }));
        
        res.json(employees);
    });
});

app.post('/api/employees', (req, res) => {
    const { name, position, department, email, phone, hireDate, driverCardRead, firstAid, safety, forklift, drivingLicenses } = req.body;
    
    dbEnt.run(`INSERT INTO employees (name, position, department, email, phone, hireDate, driverCardRead, firstAid, safety, forklift) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, position, department, email, phone, hireDate, driverCardRead, firstAid, safety, forklift],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            
            const employeeId = this.lastID;
            
            // Insert driving licenses
            if (drivingLicenses && drivingLicenses.length > 0) {
                const stmt = dbEnt.prepare('INSERT INTO employee_licenses (employee_id, class, expiry) VALUES (?, ?, ?)');
                drivingLicenses.forEach(license => {
                    stmt.run(employeeId, license.class, license.expiry);
                });
                stmt.finalize();
            }
            
            res.json({ id: employeeId });
        }
    );
});

app.put('/api/employees/:id', (req, res) => {
    const { id } = req.params;
    const { name, position, department, email, phone, hireDate, driverCardRead, firstAid, safety, forklift, drivingLicenses } = req.body;
    
    dbEnt.run(`UPDATE employees SET name = ?, position = ?, department = ?, email = ?, 
            phone = ?, hireDate = ?, driverCardRead = ?, firstAid = ?, safety = ?, forklift = ? WHERE id = ?`,
        [name, position, department, email, phone, hireDate, driverCardRead, firstAid, safety, forklift, id],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            
            // Update driving licenses
            dbEnt.run('DELETE FROM employee_licenses WHERE employee_id = ?', id, () => {
                if (drivingLicenses && drivingLicenses.length > 0) {
                    const stmt = dbEnt.prepare('INSERT INTO employee_licenses (employee_id, class, expiry) VALUES (?, ?, ?)');
                    drivingLicenses.forEach(license => {
                        stmt.run(id, license.class, license.expiry);
                    });
                    stmt.finalize();
                }
            });
            
            res.json({ changes: this.changes });
        }
    );
});

app.delete('/api/employees/:id', (req, res) => {
    dbEnt.run('DELETE FROM employees WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// === COMPLIANCE API ===
app.get('/api/employees/compliance', (req, res) => {
    dbEnt.all('SELECT * FROM employees ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        
        const today = new Date();
        const complianceReport = rows.map(employee => {
            try {
                const drivingLicenses = employee.drivingLicenses ? JSON.parse(employee.drivingLicenses) : [];
                const issues = [];
                let criticalCount = 0;
                let warningCount = 0;
                
                // Check driving licenses
                drivingLicenses.forEach(license => {
                    if (license.expiry) {
                        const expiry = new Date(license.expiry);
                        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                        if (diffDays < 0) {
                            issues.push(`Führerschein ${license.class} abgelaufen (${Math.abs(diffDays)} Tage)`);
                            criticalCount++;
                        } else if (diffDays <= 30) {
                            issues.push(`Führerschein ${license.class} läuft in ${diffDays} Tagen ab`);
                            criticalCount++;
                        } else if (diffDays <= 90) {
                            issues.push(`Führerschein ${license.class} läuft in ${diffDays} Tagen ab`);
                            warningCount++;
                        }
                    }
                });
                
                // Check driver card
                if (employee.driverCardRead) {
                    const lastRead = new Date(employee.driverCardRead);
                    const diffDays = Math.ceil((today - lastRead) / (1000 * 60 * 60 * 24));
                    if (diffDays > 30) {
                        issues.push(`Fahrerkarte muss ausgelesen werden (${diffDays} Tage überfällig)`);
                        criticalCount++;
                    } else if (diffDays > 25) {
                        issues.push(`Fahrerkarte bald auslesen (${30-diffDays} Tage)`);
                        warningCount++;
                    }
                }
                
                // Check certificates
                ['firstAid', 'safety', 'forklift'].forEach(cert => {
                    if (employee[cert]) {
                        const expiry = new Date(employee[cert]);
                        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                        const certName = {
                            firstAid: 'Erste-Hilfe-Kurs',
                            safety: 'Sicherheitsschulung',
                            forklift: 'Gabelstaplerschein'
                        }[cert];
                        
                        if (diffDays < 0) {
                            issues.push(`${certName} abgelaufen (${Math.abs(diffDays)} Tage)`);
                            criticalCount++;
                        } else if (diffDays <= 30) {
                            issues.push(`${certName} läuft in ${diffDays} Tagen ab`);
                            criticalCount++;
                        } else if (diffDays <= 90) {
                            issues.push(`${certName} läuft in ${diffDays} Tagen ab`);
                            warningCount++;
                        }
                    }
                });
                
                return {
                    id: employee.id,
                    name: employee.name,
                    issues: issues,
                    criticalCount: criticalCount,
                    warningCount: warningCount,
                    status: criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'ok'
                };
            } catch (e) {
                console.error('Fehler bei Compliance-Prüfung für', employee.name, ':', e);
                return {
                    id: employee.id,
                    name: employee.name,
                    issues: ['Fehler bei der Compliance-Prüfung'],
                    criticalCount: 0,
                    warningCount: 0,
                    status: 'error'
                };
            }
        });
        
        res.json(complianceReport);
    });
});

// === DASHBOARD STATS API ===
app.get('/api/dashboard/stats', (req, res) => {
    const stats = {};
    
    // Total tasks
    dbEnt.get('SELECT COUNT(*) as count FROM tasks WHERE status != "completed"', (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        stats.totalTasks = row.count;
        
        // Urgent tasks
        dbEnt.get('SELECT COUNT(*) as count FROM tasks WHERE status != "completed" AND (priority = "critical" OR dueDate <= date("now", "+7 days"))', (err, row) => {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            stats.urgentTasks = row.count;
            
            // Due soon
            dbEnt.get('SELECT COUNT(*) as count FROM tasks WHERE status != "completed" AND dueDate BETWEEN date("now") AND date("now", "+7 days")', (err, row) => {
                if (err) return res.status(500).json({ status: 'error', message: err.message });
                stats.dueSoon = row.count;
                
                // Completed this week
                dbEnt.get('SELECT COUNT(*) as count FROM tasks WHERE status = "completed" AND completed >= date("now", "-7 days")', (err, row) => {
                    if (err) return res.status(500).json({ status: 'error', message: err.message });
                    stats.completed = row.count;
                    
                    // Vehicle counts
                    dbEnt.get('SELECT COUNT(*) as count FROM vehicles', (err, row) => {
                        if (err) return res.status(500).json({ status: 'error', message: err.message });
                        stats.totalVehicles = row.count;
                        
                        res.json(stats);
                    });
                });
            });
        });
    });
});

// === HEALTH CHECK ===
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        databases: {
            kalkulationen: 'connected',
            produktion: 'connected', 
            unternehmensplaner: 'connected'
        },
        version: '2.0.0'
    });
});

// === MAINTENANCE API ===
app.get('/api/maintenance', (req, res) => {
    dbEnt.all('SELECT * FROM maintenance ORDER BY createdAt DESC', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/maintenance', (req, res) => {
    const { vehicle_id, object, type, lastMaintenance, interval, description, notes, createdBy } = req.body;
    
    // Berechne nextMaintenance basierend auf lastMaintenance und interval
    let nextMaintenance = null;
    if (lastMaintenance && interval) {
        const lastDate = new Date(lastMaintenance);
        switch(interval) {
            case '1 Woche':
                nextMaintenance = new Date(lastDate.setDate(lastDate.getDate() + 7));
                break;
            case '1 Monat':
                nextMaintenance = new Date(lastDate.setMonth(lastDate.getMonth() + 1));
                break;
            case '3 Monate':
                nextMaintenance = new Date(lastDate.setMonth(lastDate.getMonth() + 3));
                break;
            case '6 Monate':
                nextMaintenance = new Date(lastDate.setMonth(lastDate.getMonth() + 6));
                break;
            case '1 Jahr':
                nextMaintenance = new Date(lastDate.setFullYear(lastDate.getFullYear() + 1));
                break;
            default:
                break;
        }
        nextMaintenance = nextMaintenance ? nextMaintenance.toISOString().split('T')[0] : null;
    }
    
    dbEnt.run(`INSERT INTO maintenance (vehicle_id, object, type, lastMaintenance, nextMaintenance, interval, description, notes, createdBy) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vehicle_id, object, type, lastMaintenance, nextMaintenance, interval, description, notes, createdBy],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/maintenance/:id', (req, res) => {
    const { id } = req.params;
    const { vehicle_id, object, type, lastMaintenance, interval, description, notes } = req.body;
    
    // Berechne nextMaintenance basierend auf lastMaintenance und interval
    let nextMaintenance = null;
    if (lastMaintenance && interval) {
        const lastDate = new Date(lastMaintenance);
        switch(interval) {
            case '1 Woche':
                nextMaintenance = new Date(lastDate.setDate(lastDate.getDate() + 7));
                break;
            case '1 Monat':
                nextMaintenance = new Date(lastDate.setMonth(lastDate.getMonth() + 1));
                break;
            case '3 Monate':
                nextMaintenance = new Date(lastDate.setMonth(lastDate.getMonth() + 3));
                break;
            case '6 Monate':
                nextMaintenance = new Date(lastDate.setMonth(lastDate.getMonth() + 6));
                break;
            case '1 Jahr':
                nextMaintenance = new Date(lastDate.setFullYear(lastDate.getFullYear() + 1));
                break;
            default:
                break;
        }
        nextMaintenance = nextMaintenance ? nextMaintenance.toISOString().split('T')[0] : null;
    }
    
    dbEnt.run(`UPDATE maintenance SET vehicle_id = ?, object = ?, type = ?, lastMaintenance = ?, 
            nextMaintenance = ?, interval = ?, description = ?, notes = ? WHERE id = ?`,
        [vehicle_id, object, type, lastMaintenance, nextMaintenance, interval, description, notes, id],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.json({ changes: this.changes });
        }
    );
});

app.delete('/api/maintenance/:id', (req, res) => {
    const { id } = req.params;
    
    dbEnt.run('DELETE FROM maintenance WHERE id = ?', id, function(err) {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({ changes: this.changes });
    });
});

// Vehicle Maintenance
app.get('/api/vehicles/:vehicleId/maintenance', (req, res) => {
    const { vehicleId } = req.params;
    
    dbEnt.all('SELECT * FROM vehicle_maintenance WHERE vehicle_id = ? ORDER BY createdAt DESC', 
        vehicleId, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/vehicles/:vehicleId/maintenance', (req, res) => {
    const { vehicleId } = req.params;
    const { type, description, lastDate, nextDate, interval, reminderDays, notes } = req.body;
    
    dbEnt.run(`INSERT INTO vehicle_maintenance (vehicle_id, type, description, lastDate, nextDate, interval, reminderDays, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [vehicleId, type, description, lastDate, nextDate, interval, reminderDays, notes],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/vehicles/:vehicleId/maintenance/:id', (req, res) => {
    const { vehicleId, id } = req.params;
    const { type, description, lastDate, nextDate, interval, reminderDays, notes } = req.body;
    
    dbEnt.run(`UPDATE vehicle_maintenance SET type = ?, description = ?, lastDate = ?, 
            nextDate = ?, interval = ?, reminderDays = ?, notes = ? 
            WHERE id = ? AND vehicle_id = ?`,
        [type, description, lastDate, nextDate, interval, reminderDays, notes, id, vehicleId],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.json({ changes: this.changes });
        }
    );
});

app.delete('/api/vehicles/:vehicleId/maintenance/:id', (req, res) => {
    const { vehicleId, id } = req.params;
    
    dbEnt.run('DELETE FROM vehicle_maintenance WHERE id = ? AND vehicle_id = ?', [id, vehicleId], function(err) {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({ changes: this.changes });
    });
});

// Vehicle Compliance
app.get('/api/vehicles/:vehicleId/compliance', (req, res) => {
    const { vehicleId } = req.params;
    
    dbEnt.get('SELECT * FROM vehicle_compliance WHERE vehicle_id = ?', vehicleId, (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row || {});
    });
});

app.post('/api/vehicles/:vehicleId/compliance', (req, res) => {
    const { vehicleId } = req.params;
    const { tuv, au, uvv, insurance } = req.body;
    
    dbEnt.run(`INSERT OR REPLACE INTO vehicle_compliance (vehicle_id, tuv, au, uvv, insurance, updatedAt) 
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [vehicleId, tuv, au, uvv, insurance],
        function(err) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

// === COMPLIANCE REMINDER SYSTEM ===
async function checkComplianceAndCreateTasks() {
    console.log('Prüfe Compliance und erstelle Erinnerungsaufgaben...');
    
    return new Promise((resolve) => {
        const today = new Date();
        let tasksCreated = 0;
        
        // Check all compliance areas in parallel
        Promise.all([
            checkEmployeeCompliance(today),
            checkVehicleCompliance(today),
            checkCertificateCompliance(today),
            checkContractCompliance(today),
            checkMaintenanceCompliance(today)
        ]).then(results => {
            tasksCreated = results.reduce((sum, count) => sum + count, 0);
            
            if (tasksCreated > 0) {
                console.log(`${tasksCreated} Compliance-Erinnerungsaufgaben erstellt.`);
            } else {
                console.log('Alle Compliance-Termine sind aktuell.');
            }
            
            resolve();
        }).catch(error => {
            console.error('Fehler bei der Compliance-Prüfung:', error);
            resolve();
        });
    });
}

// Employee Compliance Check
async function checkEmployeeCompliance(today) {
    return new Promise((resolve) => {
        dbEnt.all('SELECT * FROM employees', async (err, employees) => {
            if (err) {
                console.error('Fehler beim Laden der Mitarbeiter für Compliance-Prüfung:', err);
                return resolve(0);
            }
            
            let tasksCreated = 0;
            
            for (const employee of employees) {
                try {
                    const drivingLicenses = employee.drivingLicenses ? JSON.parse(employee.drivingLicenses) : [];
                    
                    // Check driving licenses
                    for (const license of drivingLicenses) {
                        if (license.expiry) {
                            const expiry = new Date(license.expiry);
                            const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                            
                            if (diffDays <= 90) {
                                const priority = diffDays <= 30 ? 'critical' : 'high';
                                const dueDate = diffDays <= 0 ? today.toISOString().split('T')[0] : 
                                              new Date(today.getTime() + 7*24*60*60*1000).toISOString().split('T')[0];
                                
                                const taskTitle = `${employee.name}: Führerschein ${license.class} ${diffDays <= 0 ? 'abgelaufen' : 'läuft bald ab'}`;
                                const taskDescription = diffDays <= 0 ? 
                                    `Führerschein Klasse ${license.class} ist seit ${Math.abs(diffDays)} Tagen abgelaufen. Sofortige Erneuerung erforderlich!` :
                                    `Führerschein Klasse ${license.class} läuft in ${diffDays} Tagen ab (${license.expiry}). Rechtzeitig erneuern!`;
                                
                                if (await createComplianceTask(taskTitle, taskDescription, 'certificate', priority, dueDate, employee.name)) {
                                    tasksCreated++;
                                }
                            }
                        }
                    }
                    
                    // Check driver card (28-day reading required)
                    if (employee.driverCardRead) {
                        const lastRead = new Date(employee.driverCardRead);
                        const diffDays = Math.ceil((today - lastRead) / (1000 * 60 * 60 * 24));
                        
                        if (diffDays >= 23) {
                            const priority = diffDays >= 28 ? 'critical' : 'high';
                            const dueDate = today.toISOString().split('T')[0];
                            
                            const taskTitle = `${employee.name}: Fahrerkarte ${diffDays >= 28 ? 'überfällig' : 'bald'} auslesen`;
                            const taskDescription = diffDays >= 28 ? 
                                `Fahrerkarte ist ${diffDays - 28} Tage überfällig! Letzte Auslesung: ${employee.driverCardRead}. Sofort auslesen!` :
                                `Fahrerkarte muss in ${28 - diffDays} Tagen ausgelesen werden. Letzte Auslesung: ${employee.driverCardRead}`;
                            
                            if (await createComplianceTask(taskTitle, taskDescription, 'certificate', priority, dueDate, employee.name)) {
                                tasksCreated++;
                            }
                        }
                    } else if (employee.position && (employee.position.toLowerCase().includes('fahrer') || 
                                                   employee.department && employee.department.toLowerCase().includes('transport'))) {
                        if (await createComplianceTask(
                            `${employee.name}: Fahrerkarte erstmals auslesen`,
                            'Noch keine Fahrerkarten-Auslesung dokumentiert. Erste Auslesung erforderlich.',
                            'certificate', 'high', today.toISOString().split('T')[0], employee.name
                        )) {
                            tasksCreated++;
                        }
                    }
                    
                    // Check certificates (first aid, safety, forklift)
                    const certificates = [
                        { field: 'firstAid', name: 'Erste-Hilfe-Kurs', reminderDays: 60 },
                        { field: 'safety', name: 'Sicherheitsschulung', reminderDays: 90 },
                        { field: 'forklift', name: 'Gabelstaplerschein', reminderDays: 90 }
                    ];
                    
                    for (const cert of certificates) {
                        if (employee[cert.field]) {
                            const expiry = new Date(employee[cert.field]);
                            const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                            
                            if (diffDays <= cert.reminderDays) {
                                const priority = diffDays <= 30 ? 'critical' : diffDays <= 60 ? 'high' : 'medium';
                                const dueDate = diffDays <= 0 ? today.toISOString().split('T')[0] : 
                                              new Date(today.getTime() + Math.min(diffDays, 14)*24*60*60*1000).toISOString().split('T')[0];
                                
                                const taskTitle = `${employee.name}: ${cert.name} ${diffDays <= 0 ? 'abgelaufen' : 'läuft bald ab'}`;
                                const taskDescription = diffDays <= 0 ? 
                                    `${cert.name} ist seit ${Math.abs(diffDays)} Tagen abgelaufen. Sofortige Erneuerung erforderlich!` :
                                    `${cert.name} läuft in ${diffDays} Tagen ab (${employee[cert.field]}). Rechtzeitig erneuern!`;
                                
                                if (await createComplianceTask(taskTitle, taskDescription, 'certificate', priority, dueDate, employee.name)) {
                                    tasksCreated++;
                                }
                            }
                        }
                    }
                    
                } catch (e) {
                    console.error('Fehler bei Compliance-Prüfung für Mitarbeiter', employee.name, ':', e);
                }
            }
            
            resolve(tasksCreated);
        });
    });
}

// Vehicle Compliance Check
async function checkVehicleCompliance(today) {
    return new Promise((resolve) => {
        dbEnt.all('SELECT * FROM vehicles', async (err, vehicles) => {
            if (err) {
                console.error('Fehler beim Laden der Fahrzeuge für Compliance-Prüfung:', err);
                return resolve(0);
            }
            
            let tasksCreated = 0;
            
            for (const vehicle of vehicles) {
                try {
                    // Check TÜV
                    if (vehicle.tuvDate) {
                        const expiry = new Date(vehicle.tuvDate);
                        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                        
                        if (diffDays <= 60) {
                            const priority = diffDays <= 7 ? 'critical' : diffDays <= 30 ? 'high' : 'medium';
                            const dueDate = diffDays <= 0 ? today.toISOString().split('T')[0] : 
                                          new Date(Math.min(expiry.getTime(), today.getTime() + 14*24*60*60*1000)).toISOString().split('T')[0];
                            
                            const taskTitle = `TÜV ${vehicle.plate}: ${diffDays <= 0 ? 'abgelaufen' : 'läuft bald ab'}`;
                            const taskDescription = diffDays <= 0 ? 
                                `TÜV für ${vehicle.plate} (${vehicle.type}) ist seit ${Math.abs(diffDays)} Tagen abgelaufen!` :
                                `TÜV für ${vehicle.plate} (${vehicle.type}) läuft in ${diffDays} Tagen ab (${vehicle.tuvDate}).`;
                            
                            if (await createComplianceTask(taskTitle, taskDescription, 'vehicle', priority, dueDate, 'Fahrzeugverwaltung')) {
                                tasksCreated++;
                            }
                        }
                    }

                    // Check AU
                    if (vehicle.auDate) {
                        const expiry = new Date(vehicle.auDate);
                        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                        
                        if (diffDays <= 60) {
                            const priority = diffDays <= 7 ? 'critical' : diffDays <= 30 ? 'high' : 'medium';
                            const dueDate = diffDays <= 0 ? today.toISOString().split('T')[0] : 
                                          new Date(Math.min(expiry.getTime(), today.getTime() + 14*24*60*60*1000)).toISOString().split('T')[0];
                            
                            const taskTitle = `AU ${vehicle.plate}: ${diffDays <= 0 ? 'abgelaufen' : 'läuft bald ab'}`;
                            const taskDescription = diffDays <= 0 ? 
                                `AU für ${vehicle.plate} (${vehicle.type}) ist seit ${Math.abs(diffDays)} Tagen abgelaufen!` :
                                `AU für ${vehicle.plate} (${vehicle.type}) läuft in ${diffDays} Tagen ab (${vehicle.auDate}).`;
                            
                            if (await createComplianceTask(taskTitle, taskDescription, 'vehicle', priority, dueDate, 'Fahrzeugverwaltung')) {
                                tasksCreated++;
                            }
                        }
                    }

                    // Check UVV
                    if (vehicle.uvvDate) {
                        const expiry = new Date(vehicle.uvvDate);
                        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                        
                        if (diffDays <= 60) {
                            const priority = diffDays <= 7 ? 'critical' : diffDays <= 30 ? 'high' : 'medium';
                            const dueDate = diffDays <= 0 ? today.toISOString().split('T')[0] : 
                                          new Date(Math.min(expiry.getTime(), today.getTime() + 14*24*60*60*1000)).toISOString().split('T')[0];
                            
                            const taskTitle = `UVV ${vehicle.plate}: ${diffDays <= 0 ? 'abgelaufen' : 'läuft bald ab'}`;
                            const taskDescription = diffDays <= 0 ? 
                                `UVV für ${vehicle.plate} (${vehicle.type}) ist seit ${Math.abs(diffDays)} Tagen abgelaufen!` :
                                `UVV für ${vehicle.plate} (${vehicle.type}) läuft in ${diffDays} Tagen ab (${vehicle.uvvDate}).`;
                            
                            if (await createComplianceTask(taskTitle, taskDescription, 'vehicle', priority, dueDate, 'Fahrzeugverwaltung')) {
                                tasksCreated++;
                            }
                        }
                    }

                    // Check Tachograph Read (nur für LKW)
                    if (vehicle.type === 'LKW' && vehicle.tachographNextRead) {
                        const nextRead = new Date(vehicle.tachographNextRead);
                        const diffDays = Math.ceil((nextRead - today) / (1000 * 60 * 60 * 24));
                        
                        if (diffDays <= 14) {
                            const priority = diffDays <= 0 ? 'critical' : diffDays <= 7 ? 'high' : 'medium';
                            const dueDate = diffDays <= 0 ? today.toISOString().split('T')[0] : 
                                          new Date(Math.min(nextRead.getTime(), today.getTime() + 7*24*60*60*1000)).toISOString().split('T')[0];
                            
                            const taskTitle = `Tachograph ${vehicle.plate}: ${diffDays <= 0 ? 'Auslesen überfällig' : 'Auslesen erforderlich'}`;
                            const taskDescription = diffDays <= 0 ? 
                                `Tachograph für ${vehicle.plate} muss seit ${Math.abs(diffDays)} Tagen ausgelesen werden!` :
                                `Tachograph für ${vehicle.plate} muss in ${diffDays} Tagen ausgelesen werden (${vehicle.tachographNextRead}).`;
                            
                            if (await createComplianceTask(taskTitle, taskDescription, 'vehicle', priority, dueDate, 'Fahrzeugverwaltung')) {
                                tasksCreated++;
                            }
                        }
                    }

                    // Check Tachograph Calibration (nur für LKW)
                    if (vehicle.type === 'LKW' && vehicle.tachographNextCheck) {
                        const nextCheck = new Date(vehicle.tachographNextCheck);
                        const diffDays = Math.ceil((nextCheck - today) / (1000 * 60 * 60 * 24));
                        
                        if (diffDays <= 30) {
                            const priority = diffDays <= 0 ? 'critical' : diffDays <= 14 ? 'high' : 'medium';
                            const dueDate = diffDays <= 0 ? today.toISOString().split('T')[0] : 
                                          new Date(Math.min(nextCheck.getTime(), today.getTime() + 14*24*60*60*1000)).toISOString().split('T')[0];
                            
                            const taskTitle = `Tachograph ${vehicle.plate}: ${diffDays <= 0 ? 'Kalibrierung überfällig' : 'Kalibrierung erforderlich'}`;
                            const taskDescription = diffDays <= 0 ? 
                                `Tachograph-Kalibrierung für ${vehicle.plate} ist seit ${Math.abs(diffDays)} Tagen überfällig!` :
                                `Tachograph-Kalibrierung für ${vehicle.plate} ist in ${diffDays} Tagen fällig (${vehicle.tachographNextCheck}).`;
                            
                            if (await createComplianceTask(taskTitle, taskDescription, 'vehicle', priority, dueDate, 'Fahrzeugverwaltung')) {
                                tasksCreated++;
                            }
                        }
                    }
                    
                } catch (e) {
                    console.error('Fehler bei Compliance-Prüfung für Fahrzeug', vehicle.plate, ':', e);
                }
            }
            
            resolve(tasksCreated);
        });
    });
}

// Certificate Compliance Check
async function checkCertificateCompliance(today) {
    return new Promise((resolve) => {
        dbEnt.all('SELECT * FROM certificates', async (err, certificates) => {
            if (err) {
                console.error('Fehler beim Laden der Zertifikate für Compliance-Prüfung:', err);
                return resolve(0);
            }
            
            let tasksCreated = 0;
            
            for (const cert of certificates) {
                try {
                    if (cert.expiryDate) {
                        const expiry = new Date(cert.expiryDate);
                        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                        const reminderDays = cert.reminderDays || 30;
                        
                        if (diffDays <= reminderDays) {
                            const priority = diffDays <= 7 ? 'critical' : diffDays <= 30 ? 'high' : 'medium';
                            const dueDate = diffDays <= 0 ? today.toISOString().split('T')[0] : 
                                          new Date(Math.min(expiry.getTime(), today.getTime() + 14*24*60*60*1000)).toISOString().split('T')[0];
                            
                            const taskTitle = `Zertifikat ${cert.name}: ${diffDays <= 0 ? 'abgelaufen' : 'läuft bald ab'}`;
                            const taskDescription = diffDays <= 0 ? 
                                `Zertifikat "${cert.name}" (${cert.type}) ist seit ${Math.abs(diffDays)} Tagen abgelaufen!` :
                                `Zertifikat "${cert.name}" (${cert.type}) läuft in ${diffDays} Tagen ab (${cert.expiryDate}).`;
                            
                            if (await createComplianceTask(taskTitle, taskDescription, 'certificate', priority, dueDate, 'Qualitätsmanagement')) {
                                tasksCreated++;
                            }
                        }
                    }
                } catch (e) {
                    console.error('Fehler bei Compliance-Prüfung für Zertifikat', cert.name, ':', e);
                }
            }
            
            resolve(tasksCreated);
        });
    });
}

// Contract Compliance Check
async function checkContractCompliance(today) {
    return new Promise((resolve) => {
        dbEnt.all('SELECT * FROM contracts', async (err, contracts) => {
            if (err) {
                console.error('Fehler beim Laden der Verträge für Compliance-Prüfung:', err);
                return resolve(0);
            }
            
            let tasksCreated = 0;
            
            for (const contract of contracts) {
                try {
                    if (contract.endDate) {
                        const expiry = new Date(contract.endDate);
                        const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                        const reminderDays = contract.reminderDays || 90;
                        
                        if (diffDays <= reminderDays) {
                            const priority = diffDays <= 30 ? 'critical' : diffDays <= 60 ? 'high' : 'medium';
                            const dueDate = diffDays <= 0 ? today.toISOString().split('T')[0] : 
                                          new Date(Math.min(expiry.getTime(), today.getTime() + 30*24*60*60*1000)).toISOString().split('T')[0];
                            
                            const taskTitle = `Vertrag ${contract.name}: ${diffDays <= 0 ? 'abgelaufen' : 'läuft bald ab'}`;
                            const taskDescription = diffDays <= 0 ? 
                                `Vertrag "${contract.name}" mit ${contract.partner} ist seit ${Math.abs(diffDays)} Tagen abgelaufen!` :
                                `Vertrag "${contract.name}" mit ${contract.partner} läuft in ${diffDays} Tagen ab (${contract.endDate}). ${contract.cancelationPeriod ? `Kündigungsfrist: ${contract.cancelationPeriod}` : ''}`;
                            
                            if (await createComplianceTask(taskTitle, taskDescription, 'contract', priority, dueDate, 'Verwaltung')) {
                                tasksCreated++;
                            }
                        }
                    }
                } catch (e) {
                    console.error('Fehler bei Compliance-Prüfung für Vertrag', contract.name, ':', e);
                }
            }
            
            resolve(tasksCreated);
        });
    });
}

// Maintenance Compliance Check
async function checkMaintenanceCompliance(today) {
    return new Promise((resolve) => {
        dbEnt.all('SELECT * FROM maintenance', async (err, maintenances) => {
            if (err) {
                console.error('Fehler beim Laden der Wartungen für Compliance-Prüfung:', err);
                return resolve(0);
            }
            
            let tasksCreated = 0;
            
            for (const maint of maintenances) {
                try {
                    if (maint.nextMaintenance) {
                        const nextDate = new Date(maint.nextMaintenance);
                        const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
                        
                        if (diffDays <= 30) {
                            const priority = diffDays <= 0 ? 'critical' : diffDays <= 7 ? 'high' : 'medium';
                            const dueDate = diffDays <= 0 ? today.toISOString().split('T')[0] : 
                                          new Date(Math.min(nextDate.getTime(), today.getTime() + 7*24*60*60*1000)).toISOString().split('T')[0];
                            
                            const taskTitle = `Wartung ${maint.object}: ${diffDays <= 0 ? 'überfällig' : 'bald fällig'}`;
                            const taskDescription = diffDays <= 0 ? 
                                `Wartung für "${maint.object}" (${maint.type}) ist seit ${Math.abs(diffDays)} Tagen überfällig!` :
                                `Wartung für "${maint.object}" (${maint.type}) ist in ${diffDays} Tagen fällig (${maint.nextMaintenance}).`;
                            
                            if (await createComplianceTask(taskTitle, taskDescription, 'maintenance', priority, dueDate, 'Wartung')) {
                                tasksCreated++;
                            }
                        }
                    }
                } catch (e) {
                    console.error('Fehler bei Compliance-Prüfung für Wartung', maint.object, ':', e);
                }
            }
            
            resolve(tasksCreated);
        });
    });
}

async function createComplianceTask(title, description, type, priority, dueDate, assignee) {
    return new Promise((resolve) => {
        // Prüfe nur auf offene Tasks mit exakt gleichem Titel
        const checkQuery = `
            SELECT id FROM tasks WHERE 
            title = ? AND 
            status != 'completed'
        `;
        
        dbEnt.get(checkQuery, [title], (err, existingTask) => {
            if (err) {
                console.error('Fehler beim Prüfen bestehender Aufgaben:', err);
                return resolve(false);
            }
            
            if (existingTask) {
                // Task already exists - skip silently
                return resolve(false);
            }
            
            // Simple insert with immediate check
            dbEnt.run(
                `INSERT INTO tasks (title, description, type, priority, assignee, dueDate, recurring, createdBy, created, status)
                 VALUES (?, ?, ?, ?, ?, ?, 0, 'System (Compliance)', datetime('now'), 'open')`,
                [title, description, type, priority, assignee, dueDate],
                function(err) {
                    if (err) {
                        console.error('Fehler beim Erstellen der Compliance-Aufgabe:', err);
                        resolve(false);
                    } else {
                        console.log(`Compliance-Aufgabe erstellt: ${title}`);
                        resolve(true);
                    }
                }
            );
        });
    });
}

// Run compliance check every hour
setInterval(checkComplianceAndCreateTasks, 60 * 60 * 1000);

// Run initial compliance check 30 seconds after server start
setTimeout(checkComplianceAndCreateTasks, 30000);

// Server starten (auf allen Netzwerkadressen!)
const PORT = 5050;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server läuft auf http://0.0.0.0:${PORT}`);
    const interfaces = require('os').networkInterfaces();
    for (let iface in interfaces) {
        interfaces[iface].forEach(details => {
            if (details.family === 'IPv4' && !details.internal) {
                console.log(`Server ist erreichbar unter: http://${details.address}:${PORT}`);
            }
        });
    }
});

// Erhöhte Timeouts für Server-Verbindungen
server.timeout = 120000; // 2 Minuten Timeout für Anfragen
server.keepAliveTimeout = 65000; // 65 Sekunden Keep-Alive Timeout
server.headersTimeout = 66000; // 66 Sekunden Headers Timeout (muss größer als keepAliveTimeout sein)

// Automatischer Neustart bei Server-Fehler
server.on('error', (error) => {
    console.error('SERVER FEHLER:', error);
    // Wenn der Server einen Fehler wirft, wird er nach 10 Sekunden neu gestartet
    console.log('Server wird in 10 Sekunden neu gestartet...');
    setTimeout(() => {
        server.close(() => {
            console.log('Server beendet, starte neu...');
            server.listen(PORT, '0.0.0.0', () => {
                console.log(`Server neu gestartet auf http://0.0.0.0:${PORT}`);
            });
        });
    }, 10000);
});

// === MANUAL COMPLIANCE CHECK API ===
app.post('/api/compliance/check', async (req, res) => {
    try {
        await checkComplianceAndCreateTasks();
        res.json({ 
            status: 'success', 
            message: 'Compliance-Prüfung abgeschlossen',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Fehler bei manueller Compliance-Prüfung:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Fehler bei der Compliance-Prüfung',
            error: error.message
        });
    }
});

// === VEHICLE INSPECTION COMPLETION API ===
app.post('/api/vehicle-inspections/complete', async (req, res) => {
    const { taskId, vehicleId, inspectionType, completedDate, validityMonths } = req.body;
    
    try {
        // Berechne das nächste Fälligkeitsdatum
        const nextDueDate = new Date(completedDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + validityMonths);
        const nextDueDateStr = nextDueDate.toISOString().split('T')[0];

        // Update das entsprechende Datum im Fahrzeug
        let updateField;
        switch(inspectionType.toLowerCase()) {
            case 'tuv':
                updateField = 'tuvDate';
                break;
            case 'au':
                updateField = 'auDate';
                break;
            case 'uvv':
                updateField = 'uvvDate';
                break;
            default:
                throw new Error('Ungültiger Prüfungstyp');
        }

        // Update Fahrzeugdaten
        await new Promise((resolve, reject) => {
            dbEnt.run(
                `UPDATE vehicles SET ${updateField} = ? WHERE id = ?`,
                [nextDueDateStr, vehicleId],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Markiere die Aufgabe als erledigt
        await new Promise((resolve, reject) => {
            dbEnt.run(
                `UPDATE tasks SET status = 'completed', completed = 1 WHERE id = ?`,
                [taskId],
                function(err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        res.json({ 
            status: 'success', 
            message: `${inspectionType} wurde als erledigt markiert und nächstes Fälligkeitsdatum auf ${nextDueDateStr} gesetzt` 
        });
    } catch (err) {
        console.error('Fehler beim Abschließen der Fahrzeugprüfung:', err);
        res.status(500).json({ 
            status: 'error', 
            message: err.message 
        });
    }
});

// Endpoint für kommende Termine
app.get('/api/upcoming-tasks', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        if (days < 1 || days > 30) {
            return res.status(400).json({ error: 'Tage müssen zwischen 1 und 30 liegen' });
        }

        const today = new Date();
        const futureDate = new Date(today);
        futureDate.setDate(today.getDate() + days);

        const db = await getDb();
        const tasks = await new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM tasks 
                WHERE dueDate BETWEEN date('now') AND date('now', '+' || ? || ' days')
                AND completed = 0
                ORDER BY dueDate ASC`,
                [days],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });

        res.json(tasks);
    } catch (error) {
        console.error('Fehler beim Laden der kommenden Termine:', error);
        res.status(500).json({ error: 'Interner Serverfehler' });
    }
});

// === COMPLIANCE API ===
app.post('/api/check-compliance', async (req, res) => {
    try {
        const tasksCreated = await checkComplianceAndCreateTasks();
        res.json({ 
            status: 'success', 
            message: `Compliance-Prüfung abgeschlossen: ${tasksCreated} neue Aufgaben erstellt` 
        });
    } catch (error) {
        console.error('Fehler bei manueller Compliance-Prüfung:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Fehler bei der Compliance-Prüfung',
            error: error.message 
        });
    }
});

// === Planungsdaten für den Kalender ===
dbProd.run(`
    CREATE TABLE IF NOT EXISTS produktionsplanung (
        id TEXT PRIMARY KEY,
        title TEXT,
        start TEXT,
        end TEXT,
        resourceId TEXT,
        machine TEXT,
        auftragId INTEGER,
        status TEXT,
        bearbeiter TEXT,
        vorbereitung INTEGER,
        produktion INTEGER,
        nachbereitung INTEGER,
        notizen TEXT
    )
`, (err) => {
    if (err) {
        console.error('Fehler beim Anlegen der Tabelle produktionsplanung:', err.message);
    } else {
        console.log('Tabelle produktionsplanung ist bereit.');
    }
});

// API für Produktionsplanung
app.get('/api/prod-planung', (req, res) => {
    dbProd.all('SELECT * FROM produktionsplanung', (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json(rows);
    });
});

app.post('/api/prod-planung', (req, res) => {
    const { id, title, start, end, resourceId, machine, auftragId, status, bearbeiter, vorbereitung, produktion, nachbereitung, notizen } = req.body;
    
    if (!id || !start || !end || !resourceId) {
        return res.status(400).json({ status: 'error', message: 'Unvollständige Daten' });
    }
    
    dbProd.run(
        `INSERT INTO produktionsplanung (id, title, start, end, resourceId, machine, auftragId, status, bearbeiter, vorbereitung, produktion, nachbereitung, notizen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title, start, end, resourceId, machine || resourceId, auftragId, status, bearbeiter, vorbereitung, produktion, nachbereitung, notizen],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', id: id });
        }
    );
});

app.put('/api/prod-planung/:id', (req, res) => {
    const { title, start, end, resourceId, machine, auftragId, status, bearbeiter, vorbereitung, produktion, nachbereitung, notizen } = req.body;
    
    dbProd.run(
        `UPDATE produktionsplanung SET title=?, start=?, end=?, resourceId=?, machine=?, auftragId=?, status=?, bearbeiter=?, vorbereitung=?, produktion=?, nachbereitung=?, notizen=? WHERE id=?`,
        [title, start, end, resourceId, machine || resourceId, auftragId, status, bearbeiter, vorbereitung, produktion, nachbereitung, notizen, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ status: 'error', message: err.message });
            res.json({ status: 'success', changes: this.changes });
        }
    );
});

app.delete('/api/prod-planung/:id', (req, res) => {
    dbProd.run('DELETE FROM produktionsplanung WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', deleted: this.changes });
    });
});

// Endpoint zum Prüfen der Serververfügbarkeit
app.get('/api/ping', (req, res) => {
    res.json({ status: 'success', message: 'Server läuft', timestamp: new Date().toISOString() });
});

// === TOURENPLANER DATABASE ===
const dbTourenplaner = path.join(__dirname, 'tourenplaner.db');
console.log('Verwende Tourenplaner-Datenbank:', dbTourenplaner);
const dbTour = new sqlite3.Database(dbTourenplaner, (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Tourenplaner-Datenbank:', err.message);
    } else {
        console.log('Tourenplaner-Datenbank erfolgreich geöffnet.');
    }
});

// Tabellen für Tourenplaner erstellen
dbTour.serialize(() => {
    // Sendungen Tabelle
    dbTour.run(`CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sendungsnummer TEXT UNIQUE,
        kunde TEXT,
        adresse TEXT,
        plz TEXT,
        ort TEXT,
        gewicht REAL,
        volumen REAL,
        lieferdatum TEXT,
        zeitfenster TEXT,
        status TEXT DEFAULT 'neu',
        tour_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Touren Tabelle
    dbTour.run(`CREATE TABLE IF NOT EXISTS tours (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        datum TEXT,
        fahrer TEXT,
        fahrzeug TEXT,
        status TEXT DEFAULT 'geplant',
        startzeit TEXT,
        endzeit TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// === TOURENPLANER API ROUTES ===

// Sendungen abrufen
app.get('/api/shipments', (req, res) => {
    console.log('GET /api/shipments aufgerufen');
    try {
        dbTour.all('SELECT * FROM shipments ORDER BY lieferdatum, zeitfenster', [], (err, rows) => {
            if (err) {
                console.error('Fehler beim Abrufen der Sendungen:', err);
                return res.status(500).json({ 
                    error: 'Datenbankfehler beim Abrufen der Sendungen',
                    details: err.message 
                });
            }
            console.log(`${rows.length} Sendungen gefunden`);
            res.json(rows || []);
        });
    } catch (error) {
        console.error('Unerwarteter Fehler in /api/shipments:', error);
        res.status(500).json({ 
            error: 'Unerwarteter Serverfehler',
            details: error.message 
        });
    }
});

// Neue Sendung anlegen
app.post('/api/shipments', (req, res) => {
    const {
        sendungsnummer, kunde, adresse, plz, ort,
        gewicht, volumen, lieferdatum, zeitfenster
    } = req.body;

    dbTour.run(
        `INSERT INTO shipments (
            sendungsnummer, kunde, adresse, plz, ort,
            gewicht, volumen, lieferdatum, zeitfenster
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sendungsnummer, kunde, adresse, plz, ort,
         gewicht, volumen, lieferdatum, zeitfenster],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                id: this.lastID,
                message: "Sendung erfolgreich angelegt"
            });
        }
    );
});

// Touren für ein bestimmtes Datum abrufen
app.get('/api/tours/date/:date', (req, res) => {
    const { date } = req.params;
    console.log('GET /api/tours/date/:date aufgerufen für Datum:', date);
    
    try {
        // Zuerst prüfen, ob das Datum gültig ist
        if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return res.status(400).json({ 
                error: 'Ungültiges Datumsformat',
                details: 'Bitte verwenden Sie das Format YYYY-MM-DD' 
            });
        }

        dbTour.all(
            `SELECT t.*, 
             (SELECT COUNT(*) FROM shipments WHERE tour_id = t.id) as shipment_count
             FROM tours t 
             WHERE datum = ?`,
            [date],
            (err, tours) => {
                if (err) {
                    console.error('Fehler beim Abrufen der Touren:', err);
                    return res.status(500).json({ 
                        error: 'Datenbankfehler beim Abrufen der Touren',
                        details: err.message 
                    });
                }

                console.log(`${tours.length} Touren für Datum ${date} gefunden`);
                
                // Wenn keine Touren gefunden wurden, leeres Array zurückgeben
                if (!tours || tours.length === 0) {
                    return res.json([]);
                }

                // Für jede Tour die zugehörigen Sendungen laden
                Promise.all(tours.map(tour => {
                    return new Promise((resolve, reject) => {
                        dbTour.all(
                            'SELECT * FROM shipments WHERE tour_id = ? ORDER BY zeitfenster',
                            [tour.id],
                            (err, shipments) => {
                                if (err) {
                                    console.error('Fehler beim Laden der Sendungen für Tour', tour.id, ':', err);
                                    reject(err);
                                } else {
                                    tour.shipments = shipments || [];
                                    console.log(`${shipments ? shipments.length : 0} Sendungen für Tour ${tour.id} geladen`);
                                    resolve(tour);
                                }
                            }
                        );
                    });
                }))
                .then(toursWithShipments => {
                    res.json(toursWithShipments);
                })
                .catch(err => {
                    console.error('Fehler beim Laden der Sendungen:', err);
                    res.status(500).json({ 
                        error: 'Fehler beim Laden der Sendungen',
                        details: err.message 
                    });
                });
            }
        );
    } catch (error) {
        console.error('Unerwarteter Fehler in /api/tours/date/:date:', error);
        res.status(500).json({ 
            error: 'Unerwarteter Serverfehler',
            details: error.message 
        });
    }
});

// Neue Tour anlegen
app.post('/api/tours', (req, res) => {
    const { datum, fahrer, fahrzeug, startzeit, endzeit } = req.body;

    dbTour.run(
        `INSERT INTO tours (datum, fahrer, fahrzeug, startzeit, endzeit)
         VALUES (?, ?, ?, ?, ?)`,
        [datum, fahrer, fahrzeug, startzeit, endzeit],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                id: this.lastID,
                message: "Tour erfolgreich angelegt"
            });
        }
    );
});

// Sendung einer Tour zuweisen
app.put('/api/shipments/:id/assign-tour', (req, res) => {
    const { id } = req.params;
    const { tour_id } = req.body;

    dbTour.run(
        'UPDATE shipments SET tour_id = ? WHERE id = ?',
        [tour_id, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                changes: this.changes,
                message: "Sendung erfolgreich der Tour zugewiesen"
            });
        }
    );
});

// Tour Status aktualisieren
app.put('/api/tours/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    dbTour.run(
        'UPDATE tours SET status = ? WHERE id = ?',
        [status, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({
                changes: this.changes,
                message: "Tour Status aktualisiert"
            });
        }
    );
});

// Graceful Shutdown erweitern für Tourenplaner DB
function gracefulShutdown() {
    console.log('Beende Server sauber...');
    
    server.close(() => {
        console.log('Server geschlossen.');
        
        // Alle Datenbanken sauber schließen
        db.close((err) => {
            if (err) console.error('Fehler beim Schließen der Hauptdatenbank:', err.message);
            else console.log('Hauptdatenbank geschlossen.');
            
            dbProd.close((err) => {
                if (err) console.error('Fehler beim Schließen der Produktionsdatenbank:', err.message);
                else console.log('Produktionsdatenbank geschlossen.');
                
                dbEnt.close((err) => {
                    if (err) console.error('Fehler beim Schließen der Unternehmensplaner-Datenbank:', err.message);
                    else console.log('Unternehmensplaner-Datenbank geschlossen.');
                    
                    dbTour.close((err) => {
                        if (err) console.error('Fehler beim Schließen der Tourenplaner-Datenbank:', err.message);
                        else console.log('Tourenplaner-Datenbank geschlossen.');
                        
                        console.log('Server wurde sauber beendet.');
                        process.exit(0);
                    });
                });
            });
        });
    });
    
    setTimeout(() => {
        console.error('Konnte Server nicht sauber beenden. Erzwinge Beendigung.');
        process.exit(1);
    }, 10000);
}

// Sendung aktualisieren
app.put('/api/shipments/:id', (req, res) => {
    const { id } = req.params;
    const {
        sendungsnummer, kunde, adresse, plz, ort,
        gewicht, volumen, lieferdatum, zeitfenster, status, tour_id
    } = req.body;

    dbTour.run(
        `UPDATE shipments SET 
            sendungsnummer = ?, kunde = ?, adresse = ?, plz = ?, ort = ?,
            gewicht = ?, volumen = ?, lieferdatum = ?, zeitfenster = ?,
            status = ?, tour_id = ?
         WHERE id = ?`,
        [sendungsnummer, kunde, adresse, plz, ort,
         gewicht, volumen, lieferdatum, zeitfenster,
         status, tour_id, id],
        function(err) {
            if (err) {
                console.error('Fehler beim Aktualisieren der Sendung:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({
                changes: this.changes,
                message: "Sendung erfolgreich aktualisiert"
            });
        }
    );
});

// Sendung löschen
app.delete('/api/shipments/:id', (req, res) => {
    const { id } = req.params;
    dbTour.run('DELETE FROM shipments WHERE id = ?', [id], function(err) {
        if (err) {
            console.error('Fehler beim Löschen der Sendung:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({
            changes: this.changes,
            message: "Sendung erfolgreich gelöscht"
        });
    });
});

// Status einer Sendung aktualisieren
app.put('/api/shipments/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    dbTour.run(
        'UPDATE shipments SET status = ? WHERE id = ?',
        [status, id],
        function(err) {
            if (err) {
                console.error('Fehler beim Aktualisieren des Status:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({
                changes: this.changes,
                message: "Status erfolgreich aktualisiert"
            });
        }
    );
});

// Geocoding-Proxy für OpenRouteService
app.post('/api/geocode', async (req, res) => {
    const { address } = req.body;
    try {
        const response = await fetch(
            'https://api.openrouteservice.org/geocode/search', {
            method: 'GET',
            headers: {
                'Authorization': '5b3ce3597851110001cf6248b4c2a6f85bd94a93a77d969909f8a942'
            },
            params: {
                text: address,
                size: 1
            }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Fehler beim Geocoding:', error);
        res.status(500).json({ error: 'Geocoding-Fehler' });
    }
});

// Lieferanten-Datenbank Initialisierung
const lieferantenDB = new sqlite3.Database(path.join(__dirname, 'lieferanten.db'), (err) => {
    if (err) {
        console.error('Fehler beim Öffnen der Lieferanten-Datenbank:', err);
    } else {
        console.log('Verbindung zur Lieferanten-Datenbank hergestellt');
        initLieferantenDB();
    }
});

// Lieferanten-Tabellen erstellen
function initLieferantenDB() {
    // Lieferanten-Tabelle erstellen
    lieferantenDB.run(`
        CREATE TABLE IF NOT EXISTS lieferanten (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rating INTEGER,
            produkte TEXT,
            veredelungen TEXT,
            druckart TEXT,
            farbenDruck TEXT,
            besonderheiten TEXT,
            bemerkungen TEXT,
            aktiv BOOLEAN DEFAULT 1,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Fehler beim Erstellen der Lieferanten-Tabelle:', err);
        } else {
            console.log('Lieferanten-Tabelle erfolgreich erstellt oder bereits vorhanden');
            
            // Produktgruppen-Tabelle erstellen
            lieferantenDB.run(`
                CREATE TABLE IF NOT EXISTS produktgruppen (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    subgroups TEXT,
                    hasVeredelung BOOLEAN DEFAULT 0,
                    availableVeredelungen TEXT,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('Fehler beim Erstellen der Produktgruppen-Tabelle:', err);
                } else {
                    console.log('Produktgruppen-Tabelle erfolgreich erstellt oder bereits vorhanden');
                }
            });
        }
    });
}

// API-Endpunkte für Produktgruppen
app.get('/api/produktgruppen', (req, res) => {
    lieferantenDB.all('SELECT * FROM produktgruppen', [], (err, rows) => {
        if (err) {
            console.error('Fehler beim Laden der Produktgruppen:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Parse JSON-Felder
        const produktgruppen = rows.map(row => ({
            ...row,
            subgroups: JSON.parse(row.subgroups || '[]'),
            availableVeredelungen: JSON.parse(row.availableVeredelungen || '[]')
        }));
        
        res.json(produktgruppen);
    });
});

app.post('/api/produktgruppen', (req, res) => {
    const { name, description, subgroups, hasVeredelung, availableVeredelungen } = req.body;
    
    lieferantenDB.run(
        `INSERT INTO produktgruppen (name, description, subgroups, hasVeredelung, availableVeredelungen)
         VALUES (?, ?, ?, ?, ?)`,
        [name, description, JSON.stringify(subgroups), hasVeredelung, JSON.stringify(availableVeredelungen)],
        function(err) {
            if (err) {
                console.error('Fehler beim Speichern der Produktgruppe:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/produktgruppen/:id', (req, res) => {
    const { name, description, subgroups, hasVeredelung, availableVeredelungen } = req.body;
    
    lieferantenDB.run(
        `UPDATE produktgruppen 
         SET name = ?, description = ?, subgroups = ?, hasVeredelung = ?, availableVeredelungen = ?
         WHERE id = ?`,
        [name, description, JSON.stringify(subgroups), hasVeredelung, JSON.stringify(availableVeredelungen), req.params.id],
        function(err) {
            if (err) {
                console.error('Fehler beim Aktualisieren der Produktgruppe:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ changes: this.changes });
        }
    );
});

app.delete('/api/produktgruppen/:id', (req, res) => {
    lieferantenDB.run('DELETE FROM produktgruppen WHERE id = ?', [req.params.id], function(err) {
        if (err) {
            console.error('Fehler beim Löschen der Produktgruppe:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ changes: this.changes });
    });
});

// API-Endpunkte für Lieferanten
app.get('/api/lieferanten', (req, res) => {
    lieferantenDB.all('SELECT * FROM lieferanten', [], (err, rows) => {
        if (err) {
            console.error('Fehler beim Abrufen der Lieferanten:', err);
            res.status(500).json({ error: 'Datenbankfehler' });
            return;
        }
        // Parse JSON-Strings zurück in Objekte
        const lieferanten = rows.map(row => ({
            ...row,
            produkte: JSON.parse(row.produkte || '[]'),
            veredelungen: JSON.parse(row.veredelungen || '[]'),
            aktiv: Boolean(row.aktiv)
        }));
        res.json(lieferanten);
    });
});

app.post('/api/lieferanten', (req, res) => {
    const supplier = req.body;
    const sql = `
        INSERT INTO lieferanten (
            name, rating, produkte, veredelungen, 
            druckart, farbenDruck, besonderheiten, 
            bemerkungen, aktiv
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
        supplier.name,
        supplier.rating,
        JSON.stringify(supplier.produkte || []),
        JSON.stringify(supplier.veredelungen || []),
        supplier.druckart || null,
        supplier.farbenDruck || null,
        supplier.besonderheiten || null,
        supplier.bemerkungen || null,
        supplier.aktiv ? 1 : 0
    ];

    lieferantenDB.run(sql, values, function(err) {
        if (err) {
            console.error('Fehler beim Speichern des Lieferanten:', err);
            res.status(500).json({ error: 'Datenbankfehler' });
            return;
        }
        // Neuen Lieferanten zurückgeben
        const newSupplier = {
            id: this.lastID,
            ...supplier,
            createdAt: new Date().toISOString()
        };
        res.json(newSupplier);
    });
});

app.get('/api/lieferanten/:id', (req, res) => {
    const sql = 'SELECT * FROM lieferanten WHERE id = ?';
    lieferantenDB.get(sql, [req.params.id], (err, row) => {
        if (err) {
            console.error('Fehler beim Abrufen des Lieferanten:', err);
            res.status(500).json({ error: 'Datenbankfehler' });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Lieferant nicht gefunden' });
            return;
        }
        // Parse JSON-Strings zurück in Objekte
        const lieferant = {
            ...row,
            produkte: JSON.parse(row.produkte || '[]'),
            veredelungen: JSON.parse(row.veredelungen || '[]'),
            aktiv: Boolean(row.aktiv)
        };
        res.json(lieferant);
    });
});

app.put('/api/lieferanten/:id', (req, res) => {
    const supplier = req.body;
    const sql = `
        UPDATE lieferanten 
        SET name = ?, rating = ?, produkte = ?, veredelungen = ?,
            druckart = ?, farbenDruck = ?, besonderheiten = ?,
            bemerkungen = ?, aktiv = ?
        WHERE id = ?
    `;
    
    const values = [
        supplier.name,
        supplier.rating,
        JSON.stringify(supplier.produkte || []),
        JSON.stringify(supplier.veredelungen || []),
        supplier.druckart || null,
        supplier.farbenDruck || null,
        supplier.besonderheiten || null,
        supplier.bemerkungen || null,
        supplier.aktiv ? 1 : 0,
        req.params.id
    ];

    lieferantenDB.run(sql, values, function(err) {
        if (err) {
            console.error('Fehler beim Aktualisieren des Lieferanten:', err);
            res.status(500).json({ error: 'Datenbankfehler' });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ error: 'Lieferant nicht gefunden' });
            return;
        }
        // Aktualisierte Daten zurückgeben
        const updatedSupplier = {
            id: parseInt(req.params.id),
            ...supplier,
            updatedAt: new Date().toISOString()
        };
        res.json(updatedSupplier);
    });
});

app.delete('/api/lieferanten/:id', (req, res) => {
    const sql = 'DELETE FROM lieferanten WHERE id = ?';
    lieferantenDB.run(sql, [req.params.id], function(err) {
        if (err) {
            console.error('Fehler beim Löschen des Lieferanten:', err);
            res.status(500).json({ error: 'Datenbankfehler' });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ error: 'Lieferant nicht gefunden' });
            return;
        }
        res.json({ success: true });
    });
});

app.post('/api/lieferanten/bulk', (req, res) => {
    const suppliers = req.body;
    if (!Array.isArray(suppliers)) {
        res.status(400).json({ error: 'Ungültiges Format' });
        return;
    }

    const sql = `
        INSERT INTO lieferanten (
            name, rating, produkte, veredelungen, 
            druckart, farbenDruck, besonderheiten, 
            bemerkungen, aktiv
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const results = [];
    const stmt = lieferantenDB.prepare(sql);

    lieferantenDB.serialize(() => {
        lieferantenDB.run('BEGIN TRANSACTION');

        suppliers.forEach(supplier => {
            try {
                stmt.run(
                    supplier.name,
                    supplier.rating,
                    JSON.stringify(supplier.produkte || []),
                    JSON.stringify(supplier.veredelungen || []),
                    supplier.druckart || null,
                    supplier.farbenDruck || null,
                    supplier.besonderheiten || null,
                    supplier.bemerkungen || null,
                    supplier.aktiv ? 1 : 0
                );
                results.push({ success: true, name: supplier.name });
            } catch (err) {
                results.push({ success: false, name: supplier.name, error: err.message });
            }
        });

        lieferantenDB.run('COMMIT');
        stmt.finalize();
        res.json(results);
    });
});

// Server starten
app.listen(SERVER_PORT, SERVER_HOST, () => {
    console.log(`Server läuft auf http://${SERVER_HOST}:${SERVER_PORT}`);
});

app.get('/api/dashboard-stats', async (req, res) => {
    try {
        // Beispiel für die Implementierung:
        const stats = {
            activeOrders: await db.get('SELECT COUNT(*) as count FROM orders WHERE status = "active"').count,
            paletteMovements: await db.get('SELECT COUNT(*) as count FROM palette_movements WHERE date = DATE("now")').count,
            openTasks: await db.get('SELECT COUNT(*) as count FROM tasks WHERE status = "open"').count,
            activeUsers: await db.get('SELECT COUNT(*) as count FROM users WHERE last_login > datetime("now", "-1 hour")').count
        };
        res.json(stats);
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            activeOrders: 0,
            paletteMovements: 0,
            openTasks: 0,
            activeUsers: 0
        });
    }
});

// Activity Feed Endpoint
app.get('/api/activity-feed', async (req, res) => {
    try {
        // Beispiel für Datenabruf aus Ihrer Datenbank
        const activities = await db.getRecentActivities();
        res.json(activities);
    } catch (error) {
        console.error('Error fetching activity feed:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// User Favorites Endpoint
app.get('/api/user-favorites', async (req, res) => {
    try {
        // Beispiel für Datenabruf aus Ihrer Datenbank
        const favorites = await db.getUserFavorites(req.user.id);
        res.json(favorites);
    } catch (error) {
        console.error('Error fetching user favorites:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Dashboard Stats Endpoint (erweitert)
app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const stats = {
            activeOrders: await db.getActiveOrdersCount(),
            paletteMovements: await db.getTodaysPaletteMovements(),
            openTasks: await db.getOpenTasksCount(),
            activeUsers: await db.getActiveUsersCount(),
            weeklyActivity: await db.getWeeklyActivityData()
        };
        res.json(stats);
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Dashboard API-Endpunkte
app.get('/api/produktion/stats', (req, res) => {
    dbProd.all(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN date(faellig) = date('now') THEN 1 ELSE 0 END) as dueToday,
            SUM(CASE WHEN date(faellig) BETWEEN date('now') AND date('now', '+7 days') THEN 1 ELSE 0 END) as dueThisWeek,
            SUM(CASE WHEN prioritaet = 'hoch' AND status != 'abgeschlossen' THEN 1 ELSE 0 END) as urgent
        FROM produktionsauftraege
        WHERE status != 'abgeschlossen'
    `, (err, rows) => {
        if (err) {
            console.error('Fehler beim Laden der Produktionsstatistiken:', err);
            return res.status(500).json({ error: 'Datenbankfehler' });
        }
        res.json(rows[0]);
    });
});

app.get('/api/touren/stats', (req, res) => {
    dbTour.all(`
        SELECT 
            COUNT(DISTINCT id) as activeRoutes,
            COUNT(DISTINCT fahrzeug_id) as vehiclesOnRoute,
            COUNT(DISTINCT CASE WHEN date(lieferdatum) = date('now') THEN id END) as deliveriesToday,
            SUM(CASE WHEN date(lieferdatum) = date('now') THEN kilometer ELSE 0 END) as kmToday
        FROM touren
        WHERE status = 'aktiv'
    `, (err, rows) => {
        if (err) {
            console.error('Fehler beim Laden der Tourenstatistiken:', err);
            return res.status(500).json({ error: 'Datenbankfehler' });
        }
        res.json(rows[0]);
    });
});

app.get('/api/lager/stats', (req, res) => {
    dbLager.all(`
        SELECT 
            COUNT(*) as totalItems,
            SUM(CASE WHEN menge <= mindestbestand THEN 1 ELSE 0 END) as criticalStock,
            (SELECT COUNT(*) FROM bestellungen WHERE status = 'offen') as openOrders,
            MAX(letzte_lieferung) as lastDelivery
        FROM materialbestand
    `, (err, rows) => {
        if (err) {
            console.error('Fehler beim Laden der Lagerstatistiken:', err);
            return res.status(500).json({ error: 'Datenbankfehler' });
        }
        res.json(rows[0]);
    });
});

app.get('/api/kalkulation/stats', (req, res) => {
    db.all(`
        SELECT 
            COUNT(*) as totalCalculations,
            SUM(CASE WHEN date(erstellt_am) = date('now') THEN 1 ELSE 0 END) as createdToday,
            SUM(CASE WHEN status = 'angenommen' THEN 1 ELSE 0 END) as accepted,
            SUM(CASE WHEN status = 'in_bearbeitung' THEN 1 ELSE 0 END) as pending
        FROM kalkulationen
    `, (err, rows) => {
        if (err) {
            console.error('Fehler beim Laden der Kalkulationsstatistiken:', err);
            return res.status(500).json({ error: 'Datenbankfehler' });
        }
        res.json(rows[0]);
    });
});

app.get('/api/planer/stats', (req, res) => {
    dbEnt.all(`
        SELECT 
            COUNT(*) as totalTasks,
            SUM(CASE WHEN date(faellig_am) = date('now') THEN 1 ELSE 0 END) as dueToday,
            SUM(CASE WHEN date(faellig_am) BETWEEN date('now') AND date('now', '+7 days') THEN 1 ELSE 0 END) as dueThisWeek,
            SUM(CASE WHEN typ = 'wartung' AND status != 'abgeschlossen' THEN 1 ELSE 0 END) as plannedMaintenance
        FROM aufgaben
        WHERE status != 'abgeschlossen'
    `, (err, rows) => {
        if (err) {
            console.error('Fehler beim Laden der Aufgabenstatistiken:', err);
            return res.status(500).json({ error: 'Datenbankfehler' });
        }
        res.json(rows[0]);
    });
});

app.get('/api/users/stats', (req, res) => {
    dbUsers.all(`
        SELECT 
            COUNT(DISTINCT id) as activeUsers,
            (SELECT COUNT(*) FROM sessions WHERE aktiv = 1) as activeSessions,
            (SELECT COUNT(*) FROM dokumente WHERE date(erstellt_am) = date('now')) as newDocuments,
            (SELECT COUNT(*) FROM aenderungen WHERE date(zeitstempel) = date('now')) as changesCount
        FROM users
        WHERE letzter_login >= datetime('now', '-1 day')
    `, (err, rows) => {
        if (err) {
            console.error('Fehler beim Laden der Benutzerstatistiken:', err);
            return res.status(500).json({ error: 'Datenbankfehler' });
        }
        res.json(rows[0]);
    });
});

// Test-Endpunkt
app.get('/api/debug/test', (req, res) => {
    res.json({ status: 'ok', message: 'Debug-Endpunkt funktioniert' });
});

// Debug-Endpunkt zum Auslesen der Datenbankstruktur
app.get('/api/debug/schema', async (req, res) => {
    try {
        const schemas = {
            produktion: await getDatabaseSchema(dbProd, 'Produktionsdatenbank'),
            touren: await getDatabaseSchema(dbTour, 'Tourenplaner'),
            lager: await getDatabaseSchema(dbLager, 'Lager'),
            kalkulation: await getDatabaseSchema(db, 'Kalkulation'),
            planer: await getDatabaseSchema(dbEnt, 'Unternehmensplaner'),
            benutzer: await getDatabaseSchema(dbUsers, 'Benutzer')
        };
        
        console.log('Gefundene Datenbankstruktur:', JSON.stringify(schemas, null, 2));
        res.json(schemas);
    } catch (error) {
        console.error('Fehler beim Auslesen der Datenbankstruktur:', error);
        res.status(500).json({ error: 'Fehler beim Auslesen der Datenbankstruktur' });
    }
});

// Hilfsfunktion zum Auslesen der Datenbankstruktur
async function getDatabaseSchema(db, dbName) {
    if (!db) {
        console.log(`Datenbank ${dbName} ist nicht initialisiert`);
        return {};
    }
    
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                name as tableName,
                sql as tableSchema
            FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `, [], (err, tables) => {
            if (err) {
                console.error(`Fehler beim Lesen der ${dbName} Struktur:`, err);
                resolve({}); // Statt reject, geben wir ein leeres Objekt zurück
                return;
            }
            
            if (!tables || tables.length === 0) {
                console.log(`Keine Tabellen in ${dbName} gefunden`);
                resolve({});
                return;
            }
            
            const schema = {};
            let processedTables = 0;
            
            tables.forEach(table => {
                if (!table.tableName) {
                    processedTables++;
                    if (processedTables === tables.length) {
                        resolve(schema);
                    }
                    return;
                }
                
                db.all(`PRAGMA table_info("${table.tableName}")`, [], (err, columns) => {
                    if (err) {
                        console.error(`Fehler beim Lesen der Spalten für ${table.tableName}:`, err);
                        processedTables++;
                    } else {
                        schema[table.tableName] = {
                            columns: columns ? columns.map(col => ({
                                name: col.name,
                                type: col.type,
                                notnull: col.notnull === 1,
                                pk: col.pk === 1
                            })) : [],
                            sql: table.tableSchema
                        };
                        processedTables++;
                    }
                    
                    if (processedTables === tables.length) {
                        resolve(schema);
                    }
                });
            });
        });
    });
}

// Temporärer API-Endpunkt zum Auslesen der Datenbankstruktur
app.get('/api/debug/schema', async (req, res) => {
    try {
        const schemas = {
            produktion: await getDatabaseSchema(dbProd, 'Produktionsdatenbank'),
            touren: await getDatabaseSchema(dbTour, 'Tourenplaner'),
            lager: await getDatabaseSchema(dbLager, 'Lager'),
            kalkulation: await getDatabaseSchema(db, 'Kalkulation'),
            planer: await getDatabaseSchema(dbEnt, 'Unternehmensplaner'),
            benutzer: await getDatabaseSchema(dbUsers, 'Benutzer')
        };
        
        console.log('Gefundene Datenbankstruktur:', JSON.stringify(schemas, null, 2));
        res.json(schemas);
    } catch (error) {
        console.error('Fehler beim Auslesen der Datenbankstruktur:', error);
        res.status(500).json({ error: 'Fehler beim Auslesen der Datenbankstruktur' });
    }
});

// Details eines Produktionsauftrags abrufen
app.get('/api/Produktion/auftraege/details/:id', async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                bezeichnung,
                beschreibung,
                datum,
                startZeit,
                status
            FROM auftraege 
            WHERE id = ?
        `;
        
        dbProd.get(query, [req.params.id], (err, row) => {
            if (err) {
                console.error('Fehler beim Abrufen der Auftragsdetails:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            if (!row) {
                res.status(404).json({ error: 'Auftrag nicht gefunden' });
                return;
            }
            res.json(row);
        });
    } catch (error) {
        console.error('Fehler beim Abrufen der Auftragsdetails:', error);
        res.status(500).json({ error: error.message });
    }
});

// Produktionsauftrag aktualisieren
app.post('/api/Produktion/auftraege/update/:id', async (req, res) => {
    try {
        const { bezeichnung, beschreibung, status, datum, startZeit } = req.body;
        const query = `
            UPDATE auftraege 
            SET 
                bezeichnung = ?,
                beschreibung = ?,
                status = ?,
                datum = ?,
                startZeit = ?,
                lastUpdate = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        
        dbProd.run(query, [bezeichnung, beschreibung, status, datum, startZeit, req.params.id], function(err) {
            if (err) {
                console.error('Fehler beim Aktualisieren des Auftrags:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ error: 'Auftrag nicht gefunden' });
                return;
            }
            res.json({ message: 'Auftrag erfolgreich aktualisiert', id: req.params.id });
        });
    } catch (error) {
        console.error('Fehler beim Aktualisieren des Auftrags:', error);
        res.status(500).json({ error: error.message });
    }
});

// Produktionsauftrag löschen
app.post('/api/Produktion/auftraege/delete/:id', async (req, res) => {
    try {
        const query = `
            UPDATE auftraege 
            SET 
                status = 'gelöscht',
                lastUpdate = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        
        dbProd.run(query, [req.params.id], function(err) {
            if (err) {
                console.error('Fehler beim Löschen des Auftrags:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            if (this.changes === 0) {
                res.status(404).json({ error: 'Auftrag nicht gefunden' });
                return;
            }
            res.json({ message: 'Auftrag erfolgreich gelöscht', id: req.params.id });
        });
    } catch (error) {
        console.error('Fehler beim Löschen des Auftrags:', error);
        res.status(500).json({ error: error.message });
    }
});