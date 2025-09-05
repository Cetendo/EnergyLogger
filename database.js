const Database = require('better-sqlite3');
const path = require('path');

class EnergyDatabase {
    constructor(dbPath = './energy.db') {
        this.db = new Database(dbPath);
        this.initDatabase();
        this.prepareStatements();
    }

    initDatabase() {
        // Create tables for each category to store complete snapshots
        
        // Temperaturen table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS temperaturen (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                vorlauf REAL,
                ruecklauf REAL,
                ruecklauf_soll REAL,
                heissgas REAL,
                aussentemperatur REAL,
                mitteltemperatur REAL,
                warmwasser_ist REAL,
                warmwasser_soll REAL,
                waermequelle_ein REAL,
                waermequelle_aus REAL,
                mischkreis1_vorlauf REAL,
                mischkreis1_vl_soll REAL,
                vorlauf_max REAL,
                ansaug_vd REAL,
                vd_heizung REAL,
                ueberhitzung REAL
            );
        `);

        // Eingänge table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS eingaenge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                asd TEXT,
                evu TEXT,
                hd_status TEXT,
                mot TEXT,
                pex TEXT,
                hd_bar REAL,
                nd_bar REAL,
                durchfluss REAL
            );
        `);

        // Ausgänge table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ausgaenge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                bup TEXT,
                fup_1 TEXT,
                hup TEXT,
                mischer_1_auf TEXT,
                mischer_1_zu TEXT,
                ventil_bosup TEXT,
                verdichter TEXT,
                zip TEXT,
                zup TEXT,
                zwe_1 TEXT,
                zwe_2_sst TEXT,
                vd_heizung TEXT,
                freq_sollwert REAL,
                freq_aktuell REAL,
                ventil_bosup_percent REAL,
                hup_percent REAL
            );
        `);

        // Abschaltungen table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS abschaltungen (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                abschaltung_1 TEXT,
                abschaltung_2 TEXT,
                abschaltung_3 TEXT,
                abschaltung_4 TEXT,
                abschaltung_5 TEXT
            );
        `);

        // Anlagenstatus table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS anlagenstatus (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                bivalenz_stufe INTEGER,
                heizleistung_ist REAL,
                leistungsaufnahme REAL
            );
        `);

        // Energiemonitor Wärmemenge table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS energiemonitor_waermemenge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                heizung REAL,
                warmwasser REAL,
                kuehlung REAL,
                gesamt REAL
            );
        `);

        // Energiemonitor Leistungsaufnahme table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS energiemonitor_leistungsaufnahme (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                heizung REAL,
                warmwasser REAL,
                kuehlung REAL,
                gesamt REAL
            );
        `);

        // Create indexes for better performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_temperaturen_timestamp ON temperaturen(timestamp);
            CREATE INDEX IF NOT EXISTS idx_eingaenge_timestamp ON eingaenge(timestamp);
            CREATE INDEX IF NOT EXISTS idx_ausgaenge_timestamp ON ausgaenge(timestamp);
            CREATE INDEX IF NOT EXISTS idx_abschaltungen_timestamp ON abschaltungen(timestamp);
            CREATE INDEX IF NOT EXISTS idx_anlagenstatus_timestamp ON anlagenstatus(timestamp);
            CREATE INDEX IF NOT EXISTS idx_energiemonitor_waermemenge_timestamp ON energiemonitor_waermemenge(timestamp);
            CREATE INDEX IF NOT EXISTS idx_energiemonitor_leistungsaufnahme_timestamp ON energiemonitor_leistungsaufnahme(timestamp);
        `);
    }

    prepareStatements() {
        // Prepare insert statements for each table
        this.insertTemperaturen = this.db.prepare(`
            INSERT INTO temperaturen (timestamp, vorlauf, ruecklauf, ruecklauf_soll, heissgas, aussentemperatur, 
                mitteltemperatur, warmwasser_ist, warmwasser_soll, waermequelle_ein, waermequelle_aus, 
                mischkreis1_vorlauf, mischkreis1_vl_soll, vorlauf_max, ansaug_vd, vd_heizung, ueberhitzung)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        this.insertEingaenge = this.db.prepare(`
            INSERT INTO eingaenge (timestamp, asd, evu, hd_status, mot, pex, hd_bar, nd_bar, durchfluss)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        this.insertAusgaenge = this.db.prepare(`
            INSERT INTO ausgaenge (timestamp, bup, fup_1, hup, mischer_1_auf, mischer_1_zu, ventil_bosup, 
                verdichter, zip, zup, zwe_1, zwe_2_sst, vd_heizung, freq_sollwert, freq_aktuell, 
                ventil_bosup_percent, hup_percent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        this.insertAbschaltungen = this.db.prepare(`
            INSERT INTO abschaltungen (timestamp, abschaltung_1, abschaltung_2, abschaltung_3, abschaltung_4, abschaltung_5)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        this.insertAnlagenstatus = this.db.prepare(`
            INSERT INTO anlagenstatus (timestamp, bivalenz_stufe, heizleistung_ist, leistungsaufnahme)
            VALUES (?, ?, ?, ?)
        `);

        this.insertEnergiemonitorWaermemenge = this.db.prepare(`
            INSERT INTO energiemonitor_waermemenge (timestamp, heizung, warmwasser, kuehlung, gesamt)
            VALUES (?, ?, ?, ?, ?)
        `);

        this.insertEnergiemonitorLeistungsaufnahme = this.db.prepare(`
            INSERT INTO energiemonitor_leistungsaufnahme (timestamp, heizung, warmwasser, kuehlung, gesamt)
            VALUES (?, ?, ?, ?, ?)
        `);
    }

    saveSnapshotData(categoryData) {
        const timestamp = Math.floor(Date.now() / 1000);
        let savedCategories = 0;

        try {
            for (const [category, data] of Object.entries(categoryData)) {
                switch (category) {
                    case 'Temperaturen':
                        this.saveTemperaturen(timestamp, data);
                        savedCategories++;
                        break;
                    case 'Eingänge':
                        this.saveEingaenge(timestamp, data);
                        savedCategories++;
                        break;
                    case 'Ausgänge':
                        this.saveAusgaenge(timestamp, data);
                        savedCategories++;
                        break;
                    case 'Abschaltungen':
                        this.saveAbschaltungen(timestamp, data);
                        savedCategories++;
                        break;
                    case 'Anlagenstatus':
                        this.saveAnlagenstatus(timestamp, data);
                        savedCategories++;
                        break;
                    case 'Energiemonitor':
                        if (data['Wärmemenge']) {
                            this.saveEnergiemonitorWaermemenge(timestamp, data['Wärmemenge']);
                            savedCategories++;
                        }
                        if (data['Leistungsaufnahme']) {
                            this.saveEnergiemonitorLeistungsaufnahme(timestamp, data['Leistungsaufnahme']);
                            savedCategories++;
                        }
                        break;
                }
            }
        } catch (error) {
            console.error('Error saving snapshot data:', error);
            return { snapshots: 0, categories: 0 };
        }

        return { 
            snapshots: savedCategories > 0 ? 1 : 0, 
            categories: savedCategories 
        };
    }

    saveTemperaturen(timestamp, data) {
        this.insertTemperaturen.run(
            timestamp,
            this.extractValue(data['Vorlauf']),
            this.extractValue(data['Rücklauf']),
            this.extractValue(data['Rückl.-Soll']),
            this.extractValue(data['Heissgas']),
            this.extractValue(data['Außentemperatur']),
            this.extractValue(data['Mitteltemperatur']),
            this.extractValue(data['Warmwasser-Ist']),
            this.extractValue(data['Warmwasser-Soll']),
            this.extractValue(data['Wärmequelle-Ein']),
            this.extractValue(data['Wärmequelle-Aus']),
            this.extractValue(data['Mischkreis1-Vorlauf']),
            this.extractValue(data['Mischkreis1 VL-Soll']),
            this.extractValue(data['Vorlauf max.']),
            this.extractValue(data['Ansaug VD']),
            this.extractValue(data['VD-Heizung']),
            this.extractValue(data['Überhitzung'])
        );
    }

    saveEingaenge(timestamp, data) {
        this.insertEingaenge.run(
            timestamp,
            data['ASD'],
            data['EVU'],
            data['HD'],
            data['MOT'],
            data['PEX'],
            this.extractValue(data['HD']), // bar value
            this.extractValue(data['ND']),
            this.extractValue(data['Durchfluss'])
        );
    }

    saveAusgaenge(timestamp, data) {
        this.insertAusgaenge.run(
            timestamp,
            data['BUP'],
            data['FUP 1'],
            data['HUP'],
            data['Mischer 1 Auf'],
            data['Mischer 1 Zu'],
            data['Ventil.-BOSUP'],
            data['Verdichter'],
            data['ZIP'],
            data['ZUP'],
            data['ZWE 1'],
            data['ZWE 2 - SST'],
            data['VD-Heizung'],
            this.extractValue(data['Freq. Sollwert']),
            this.extractValue(data['Freq. aktuell']),
            this.extractValue(data['Ventil.-BOSUP']), // percent value
            this.extractValue(data['HUP']) // percent value
        );
    }

    saveAbschaltungen(timestamp, data) {
        // Convert the abschaltungen object to an array of up to 5 entries
        const entries = Object.values(data);
        this.insertAbschaltungen.run(
            timestamp,
            entries[0] || null,
            entries[1] || null,
            entries[2] || null,
            entries[3] || null,
            entries[4] || null
        );
    }

    saveAnlagenstatus(timestamp, data) {
        this.insertAnlagenstatus.run(
            timestamp,
            this.extractValue(data['Bivalenz Stufe']),
            this.extractValue(data['Heizleistung Ist']),
            this.extractValue(data['Leistungsaufnahme'])
        );
    }

    saveEnergiemonitorWaermemenge(timestamp, data) {
        this.insertEnergiemonitorWaermemenge.run(
            timestamp,
            this.extractValue(data['Heizung']),
            this.extractValue(data['Warmwasser']),
            this.extractValue(data['Kühlung']),
            this.extractValue(data['Gesamt'])
        );
    }

    saveEnergiemonitorLeistungsaufnahme(timestamp, data) {
        this.insertEnergiemonitorLeistungsaufnahme.run(
            timestamp,
            this.extractValue(data['Heizung']),
            this.extractValue(data['Warmwasser']),
            this.extractValue(data['Kühlung']),
            this.extractValue(data['Gesamt'])
        );
    }

    extractValue(rawValue) {
        if (!rawValue) return null;
        const value = parseFloat(rawValue);
        return isNaN(value) ? null : value;
    }

    // Add cleanup method for old data
    deleteOldData(yearsToKeep = 3) {
        const cutoffTimestamp = Math.floor(Date.now() / 1000) - (yearsToKeep * 365 * 24 * 60 * 60);
        const tables = ['temperaturen', 'eingaenge', 'ausgaenge', 'abschaltungen', 'anlagenstatus', 
                       'energiemonitor_waermemenge', 'energiemonitor_leistungsaufnahme'];
        
        let totalDeleted = 0;
        for (const table of tables) {
            const stmt = this.db.prepare(`DELETE FROM ${table} WHERE timestamp < ?`);
            const result = stmt.run(cutoffTimestamp);
            totalDeleted += result.changes;
        }
        return totalDeleted;
    }

    getLatestReadings(category = null, limit = 100) {
        if (category) {
            const tableName = this.getCategoryTableName(category);
            if (tableName) {
                const stmt = this.db.prepare(`SELECT * FROM ${tableName} ORDER BY timestamp DESC LIMIT ?`);
                return stmt.all(limit);
            }
        }
        
        // Return latest from all tables
        const results = {};
        const tables = ['temperaturen', 'eingaenge', 'ausgaenge', 'abschaltungen', 'anlagenstatus', 
                       'energiemonitor_waermemenge', 'energiemonitor_leistungsaufnahme'];
        
        for (const table of tables) {
            const stmt = this.db.prepare(`SELECT * FROM ${table} ORDER BY timestamp DESC LIMIT ?`);
            results[table] = stmt.all(limit);
        }
        return results;
    }

    getCategoryTableName(category) {
        const tableMap = {
            'Temperaturen': 'temperaturen',
            'Eingänge': 'eingaenge',
            'Ausgänge': 'ausgaenge',
            'Abschaltungen': 'abschaltungen',
            'Anlagenstatus': 'anlagenstatus',
            'Energiemonitor_Waermemenge': 'energiemonitor_waermemenge',
            'Energiemonitor_Leistungsaufnahme': 'energiemonitor_leistungsaufnahme'
        };
        return tableMap[category];
    }

    close() {
        this.db.close();
    }
}

module.exports = EnergyDatabase;
