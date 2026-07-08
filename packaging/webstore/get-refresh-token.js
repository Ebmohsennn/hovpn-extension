#!/usr/bin/env node
// Generates a Chrome Web Store API refresh token for CI publishing, via the
// OAuth loopback flow (Google removed the copy-paste "OOB" flow in 2022).
//
//   node get-refresh-token.js <client_id> <client_secret>
//
// Opens your browser, you approve with the Google account that owns the
// Hovpn Web Store item, and it prints the refresh token to add as the
// GitHub secret CWS_REFRESH_TOKEN. Run it locally — never commit the output.

const http = require('http');
const { exec } = require('child_process');

const [, , CLIENT_ID, CLIENT_SECRET] = process.argv;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Usage: node get-refresh-token.js <client_id> <client_secret>');
  process.exit(1);
}

const PORT = 8976;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent'
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get('code');
  if (!code) { res.statusCode = 400; res.end('No authorization code.'); return; }
  res.end('Hovpn: got it. You can close this tab and return to the terminal.');
  server.close();
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT, grant_type: 'authorization_code'
      })
    });
    const json = await resp.json();
    if (json.refresh_token) {
      console.log('\n✅ REFRESH TOKEN — add this as the GitHub secret CWS_REFRESH_TOKEN:\n');
      console.log('   ' + json.refresh_token + '\n');
    } else {
      console.error('\n❌ Token exchange failed:', JSON.stringify(json, null, 2));
      console.error('Make sure the Chrome Web Store API is enabled and you are a test user on the consent screen.');
    }
  } catch (e) {
    console.error('Request error:', e.message);
  }
});

server.listen(PORT, () => {
  console.log('\n1) Approve in your browser (opening now). If it does not open, paste this URL:\n');
  console.log('   ' + authUrl + '\n');
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${opener} "${authUrl}"`);
});
