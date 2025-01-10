const puppeteer = require('puppeteer');
const config = require('./config.json');

// Helper function to delay execution
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getValueByName(page, name) {
    try {
        const value = await page.evaluate((searchName) => {
            const cells = document.querySelectorAll('td.output_field_long');
            for (const cell of cells) {
                if (cell.textContent.trim() === searchName) {
                    const valueCell = cell.nextElementSibling;
                    return valueCell ? valueCell.textContent.trim() : null;
                }
            }
            return null;
        }, name);
        
        return { name, value };
    } catch (error) {
        console.error(`Error getting value for ${name}:`, error);
        return null;
    }
}

async function getAllValues(page, valuesToGet) {
    // Create a timestamp
    const timestamp = new Date().toLocaleTimeString();
    
    // Create the output string
    let output = `\n[${timestamp}] Heat Pump Status:\n`;
    output += '='.repeat(40) + '\n';
    
    // Get all values
    for (const name of valuesToGet) {
        const result = await getValueByName(page, name);
        if (result && result.value) {
            output += `${result.name.padEnd(20)}: ${result.value}\n`;
        }
    }
    
    // Add a separator
    output += '-'.repeat(40) + '\n';
    
    // Log the entire output at once
    console.log(output);
}

async function openHeatPumpInterface() {
    try {
        // Launch browser with visible window (headless: false)
        const browser = await puppeteer.launch({
            headless: false,  // Show the browser window
            defaultViewport: null,  // Use default viewport size
            args: ['--start-maximized']  // Start with maximized window
        });

        const page = await browser.newPage();

        // Get heat pump IP from config
        const heatpumpUrl = `http://${config.heatpump.ip_address}`;
        console.log(`Connecting to heat pump at: ${heatpumpUrl}`);

        // Navigate to the heat pump interface
        await page.goto(heatpumpUrl, {
            waitUntil: 'networkidle0',  // Wait until page is fully loaded
            timeout: config.settings.connection_timeout * 1000
        });

        // Wait for the password input field to be visible
        await page.waitForSelector('#password_prompt_input');

        // Type the PIN into the password field
        await page.type('#password_prompt_input', config.heatpump.pin);

        // Click the submit button
        await page.click('#password_submit_button');

        console.log('PIN entered successfully');

        // Wait for navigation to be visible after login
        await page.waitForSelector('#Navigation > ul > li:nth-child(1) > a');
        
        // Click the first navigation button
        await page.click('#Navigation > ul > li:nth-child(1) > a');
        
        // Move mouse away from the navigation to hide dropdown
        await page.mouse.move(0, 200);

        // Wait for content to load
        await page.waitForSelector('td.output_field_long');
        
        const valuesToGet = [
            'Vorlauf',
            'Außentemperatur',
            'Warmwasser-Ist',
            'Heizleistung Ist',
            'Leistungsaufnahme'
        ];

        // Continuous monitoring loop
        while (true) {
            await getAllValues(page, valuesToGet);
            await delay(5000); // Wait 5 seconds before next update
        }

    } catch (error) {
        console.error('\nError occurred:', error);
        console.log('Attempting to reconnect in 30 seconds...');
        await delay(30000);
        openHeatPumpInterface();
    }
}

// Run the function
openHeatPumpInterface();
