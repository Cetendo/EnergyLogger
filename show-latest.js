const Database = require('better-sqlite3');
const path = require('path');

class DatabaseViewer {
    constructor(dbPath = './energy.db') {
        this.db = new Database(dbPath);
    }

    formatTimestamp(timestamp) {
        return new Date(timestamp * 1000).toLocaleString('de-DE');
    }

    getLatestFromTable(tableName) {
        try {
            const stmt = this.db.prepare(`SELECT * FROM ${tableName} ORDER BY timestamp DESC LIMIT 1`);
            return stmt.get();
        } catch (error) {
            console.error(`Error reading from ${tableName}:`, error.message);
            return null;
        }
    }

    showLatestEntries() {
        const tables = [
            'temperaturen',
            'eingaenge', 
            'ausgaenge',
            'abschaltungen',
            'anlagenstatus',
            'energiemonitor_waermemenge',
            'energiemonitor_leistungsaufnahme'
        ];

        console.log('=== Latest Entries from All Tables ===\n');

        for (const tableName of tables) {
            console.log(`📊 ${tableName.toUpperCase()}:`);
            console.log('─'.repeat(50));
            
            const latest = this.getLatestFromTable(tableName);
            
            if (latest) {
                console.log(`Time: ${this.formatTimestamp(latest.timestamp)}`);
                
                // Display all columns except id and timestamp
                Object.entries(latest).forEach(([key, value]) => {
                    if (key !== 'id' && key !== 'timestamp') {
                        if (value !== null) {
                            console.log(`  ${key}: ${value}`);
                        }
                    }
                });
            } else {
                console.log('  No data found');
            }
            
            console.log(''); // Empty line between tables
        }
    }

    getTableStats() {
        const tables = [
            'temperaturen',
            'eingaenge', 
            'ausgaenge',
            'abschaltungen',
            'anlagenstatus',
            'energiemonitor_waermemenge',
            'energiemonitor_leistungsaufnahme'
        ];

        console.log('=== Database Statistics ===');
        let totalRows = 0;

        for (const tableName of tables) {
            try {
                const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
                const result = stmt.get();
                const count = result.count;
                totalRows += count;
                console.log(`${tableName}: ${count.toLocaleString()} rows`);
            } catch (error) {
                console.log(`${tableName}: Error - ${error.message}`);
            }
        }
        
        console.log(`\nTotal rows across all tables: ${totalRows.toLocaleString()}`);
        
        // Get database file size
        const fs = require('fs');
        try {
            const stats = fs.statSync('./energy.db');
            const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`Database file size: ${fileSizeInMB} MB`);
        } catch (error) {
            console.log('Could not get file size');
        }
    }

    close() {
        this.db.close();
    }
}

// Main execution
console.log('Energy Logger Database Viewer');
console.log('============================\n');

const viewer = new DatabaseViewer();

// Show statistics first
viewer.getTableStats();
console.log('\n');

// Show latest entries
viewer.showLatestEntries();

viewer.close();
