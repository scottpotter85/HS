const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express(); // Express App initialisieren

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Port aus Umgebungsvariable oder Standard-Port
const PORT = process.env.PORT || 5050;

// Pfad zur Datenbank (anpassen, falls nötig)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data');

// Stelle sicher, dass der Datenbankpfad existiert
const fs = require('fs');
if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
}

// Produktionsaufträge Datenbank
const dbProd = new sqlite3.Database(path.join(DB_PATH, 'produktionsauftraege.db'));
console.log('Produktionsaufträge-Datenbank initialisiert');

// Support-System Datenbank
const dbSupport = new sqlite3.Database(path.join(DB_PATH, 'support.db'));
console.log('Support-Datenbank initialisiert');

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