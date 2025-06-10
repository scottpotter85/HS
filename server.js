const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express(); // Express App initialisieren

// CORS-Konfiguration
const corsOptions = {
    origin: ['https://hs-2r01.onrender.com', 'http://localhost:5050'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Zusätzliche CORS-Header für alle Routen
app.use((req, res, next) => {
    const allowedOrigins = ['https://hs-2r01.onrender.com', 'http://localhost:5050'];
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// Port aus Umgebungsvariable oder Standard-Port
const PORT = process.env.PORT || 5050;

// Pfad zur Datenbank (anpassen, falls nötig)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data');

// Stelle sicher, dass der Datenbankpfad existiert
const fs = require('fs');
if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
}

// Benutzer-Datenbank
const dbUsers = new sqlite3.Database(path.join(DB_PATH, 'users.db'));
console.log('Benutzer-Datenbank initialisiert');

// Benutzer-Tabelle erstellen und Standardbenutzer anlegen
dbUsers.serialize(() => {
    dbUsers.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            rights TEXT
        )
    `);

    // Standardbenutzer anlegen (nur wenn noch nicht vorhanden)
    dbUsers.get("SELECT * FROM users WHERE username = 'admin'", [], (err, row) => {
        if (err) {
            console.error('Fehler beim Prüfen des Admin-Benutzers:', err);
            return;
        }
        if (!row) {
            dbUsers.run(`
                INSERT INTO users (username, password, role, rights)
                VALUES (?, ?, ?, ?)
            `, ['admin', 'admin123', 'admin', JSON.stringify(['Kalkulation.html', 'EPS.html', 'Drucker.html', 'Plotter.html', 'Zuschnitte.html', 'Produktion.html', 'Palettenkonto.html', 'Aufgabe.html', 'Tourenplaner.html', 'G-Code.html', 'unternehmensplaner.html', 'Lieferant.html'])], 
            (err) => {
                if (err) {
                    console.error('Fehler beim Anlegen des Admin-Benutzers:', err);
                } else {
                    console.log('Standard Admin-Benutzer angelegt');
                }
            });
        }
    });
});

// Produktionsaufträge Datenbank
const dbProd = new sqlite3.Database(path.join(DB_PATH, 'produktionsauftraege.db'));
console.log('Produktionsaufträge-Datenbank initialisiert');

// Support-System Datenbank
const dbSupport = new sqlite3.Database(path.join(DB_PATH, 'support.db'));
console.log('Support-Datenbank initialisiert');

// Login Route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    dbUsers.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
        if (err) {
            console.error('Login-Fehler:', err);
            return res.status(500).json({ error: 'Interner Server-Fehler' });
        }
        
        if (!user) {
            return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
        }

        // Parse rights from JSON string
        const rights = JSON.parse(user.rights || '[]');
        
        res.json({
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                rights: rights
            }
        });
    });
});

// Health Check Route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Server starten
app.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});