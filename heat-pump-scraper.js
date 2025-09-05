const WebSocket = require('ws');
const { parseString } = require('xml2js');
const util = require('util');
const config = require('./config.json');
const EnergyDatabase = require('./database');

class EnergyLogger {
    constructor() {
        this.host = config.heatpump.ip_address;
        this.ws = null;
        this.db = new EnergyDatabase();
        this.requestedInformationen = false;
        this.informationenId = null;
        this.updateInterval = null;
        this.updateSeconds = config.settings?.update_interval || 5;
        this.isConnected = false;
        this.lastSaveTime = 0;
        this.totalReadingsSaved = 0;
    }

    connect() {
        console.log(`Connecting to ${this.host}:8214...`);
        this.ws = new WebSocket(`ws://${this.host}:8214`, 'Lux_WS');
        
        this.ws.on('open', () => this.onOpen());
        this.ws.on('message', (data) => this.onMessage(data));
        this.ws.on('close', () => this.onClose());
        this.ws.on('error', (err) => this.onError(err));
    }

    onOpen() {
        this.ws.send('LOGIN;0');
        this.isConnected = true;
        console.log('✓ Connected to heat pump');
    }

    onMessage(data) {
        const xml = Buffer.isBuffer(data) ? data.toString() : data;
        parseString(xml, (err, result) => {
            if (err) {
                console.error('XML parse error:', err);
                return;
            }

            this.processMessage(result);
        });
    }

    processMessage(result) {
        // Handle Informationen content
        if (result.Content && result.Content.item) {
            this.handleInformationenContent(result.Content.item);
        } else if (result.Content) {
            this.handleInformationenContent([result.Content]);
        }

        // Handle Navigation (first time setup)
        if (!this.requestedInformationen && result.Navigation?.item) {
            this.setupInformationenRequest(result.Navigation.item);
        }
    }

    handleInformationenContent(items) {
        const filteredSections = this.filterSections(items);
        
        // Display data
        //this.printSection(filteredSections);
        
        // Collect all data into structured format for database
        const categoryData = this.collectCategoryData(filteredSections);
        
        // Save to database as complete snapshots
        const savedCount = this.db.saveSnapshotData(categoryData);
        if (savedCount > 0) {
            this.totalReadingsSaved += savedCount;
            const now = Date.now();
            if (now - this.lastSaveTime > 30000) { // Log every 30 seconds max
                console.log(`📊 Database: ${savedCount} category snapshots saved (Total: ${this.totalReadingsSaved})`);
                this.lastSaveTime = now;
            }
        }
    }

    setupInformationenRequest(navigationItems) {
        for (const item of navigationItems) {
            if (item.name?.[0] === 'Informationen' && item.$?.id) {
                this.informationenId = item.$.id;
                this.ws.send(`GET;${this.informationenId}`);
                this.requestedInformationen = true;
                
                // Start periodic updates
                this.updateInterval = setInterval(() => {
                    if (this.isConnected) {
                        this.ws.send(`GET;${this.informationenId}`);
                    }
                }, this.updateSeconds * 1000);
                
                console.log(`🔄 Updates every ${this.updateSeconds} seconds`);
                break;
            }
        }
    }

    printSection(items, indent = 0, isTopLevel = true, parentConfig = null) {
        const pad = '    '.repeat(indent);
        for (const item of items) {
            const name = item.name ? item.name[0] : undefined;
            if (item.item) {
                if (name) {
                    // Check if this section should be filtered
                    let importConfig;
                    if (isTopLevel) {
                        importConfig = config.heatpump.import_values[name];
                    } else if (parentConfig?.nested?.[name]) {
                        importConfig = parentConfig.nested[name];
                    } else {
                        importConfig = null;
                    }

                    if (importConfig !== undefined && importConfig !== null) {
                        // This section has import configuration
                        if (isTopLevel && indent === 0) {
                            console.log('');
                        }
                        console.log(pad + name + ':');
                        const filteredItems = this.filterItems(item.item, importConfig);
                        this.printSection(filteredItems, indent + 1, false, importConfig);
                    } else if (isTopLevel) {
                        // Top level without config - don't show
                        continue;
                    } else {
                        // Nested section without specific config, print normally
                        console.log(pad + name + ':');
                        this.printSection(item.item, indent + 1, false, parentConfig);
                    }
                } else {
                    this.printSection(item.item, indent + 1, false, parentConfig);
                }
            } else if (item.value && name) {
                // Print name and value on the same line for leaf nodes
                for (const v of item.value) {
                    console.log(pad + name + ': ' + v);
                }
            } else if (item.value) {
                for (const v of item.value) {
                    console.log(pad + v);
                }
            } else if (name) {
                if (isTopLevel && indent === 0) {
                    console.log('');
                }
                console.log(pad + name + ':');
            }
        }
    }

    collectCategoryData(items) {
        const categoryData = {};
        
        for (const item of items) {
            const name = item.name ? item.name[0] : undefined;
            
            if (item.item && name) {
                // This is a main category
                if (name === 'Energiemonitor') {
                    // Special handling for Energiemonitor with subcategories
                    categoryData[name] = this.collectEnergiemonitorData(item.item);
                } else {
                    // Regular category
                    categoryData[name] = this.collectSectionData(item.item);
                }
            }
        }
        
        return categoryData;
    }

    collectEnergiemonitorData(items) {
        const energiemonitorData = {};
        
        for (const item of items) {
            const name = item.name ? item.name[0] : undefined;
            if (item.item && name) {
                // This is a subcategory like 'Wärmemenge' or 'Leistungsaufnahme'
                energiemonitorData[name] = this.collectSectionData(item.item);
            }
        }
        
        return energiemonitorData;
    }

    collectSectionData(items) {
        const sectionData = {};
        
        for (const item of items) {
            const name = item.name ? item.name[0] : undefined;
            
            if (item.value && name) {
                // This is a leaf value
                sectionData[name] = item.value[0];
            } else if (item.item && name) {
                // This is a nested section, collect recursively
                Object.assign(sectionData, this.collectSectionData(item.item));
            }
        }
        
        return sectionData;
    }

    filterSections(items) {
        const importConfig = config.heatpump.import_values;
        return items.filter(item => {
            const name = item.name ? item.name[0] : undefined;
            return importConfig.hasOwnProperty(name);
        });
    }

    filterItems(items, config) {
        if (!config || Object.keys(config).length === 0) {
            return items;
        }
        
        if (config.include) {
            return items.filter(item => {
                const name = item.name ? item.name[0] : undefined;
                return config.include.includes(name);
            });
        }
        
        if (config.exclude) {
            return items.filter(item => {
                const name = item.name ? item.name[0] : undefined;
                return !config.exclude.includes(name);
            });
        }
        
        return items;
    }

    onClose() {
        this.isConnected = false;
        console.log('❌ Connection closed');
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }

    onError(err) {
        this.isConnected = false;
        console.error('❌ WebSocket error:', err.message);
    }

    shutdown() {
        console.log('\n🛑 Shutting down...');
        this.isConnected = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.ws) {
            this.ws.close();
        }
        this.db.close();
        console.log(`📊 Total readings saved: ${this.totalReadingsSaved}`);
    }
}

// Create and start the logger
const logger = new EnergyLogger();
logger.connect();

// Cleanup on exit
process.on('SIGINT', () => {
    logger.shutdown();
    process.exit(0);
});