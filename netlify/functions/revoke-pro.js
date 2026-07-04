require('./_error_reporter');
const { wrap: __wrapErr } = require('./_error_reporter');
// Netlify Function: /revoke-pro
//
// Owner-only endpoint that makes the 30-day refund promise enforceable.
// Adds/removes a token sid on the revocation list (Netlify Blobs). Once a
// sid is revoked, the customer's Pro token still passes HMAC verification
// but _rate_limit.js demotes every AI request to free-tier quota.
//
// Where to find the sid: the token's sid IS the Stripe Checkout session ID
// (cs_live_...). In Stripe Dashboard → the refunded payment → Checkout
// session ID. Creator tokens use sid `creator-<hex>`.
//
// Request:  POST { code: '<FLIPIT_CREATOR_CODE>', sid: 'cs_live_...',
//                  action: 'revoke' | 'restore' | 'check' }
// Response: 200 { sid, revoked: true|false }
//           401 { error: 'Unauthorized' }
//
// Protected by FLIPIT_CREATOR_CODE — same secret as /redeem-creator.

const crypto = require('crypto');
const { setRevoked, getRevoked } = require('./_rate_limit');

exports.handler = __wrapErr(async function (event) {
    const allowedOrigins = ['https://flipit.earnwith-ai.com', 'https://flipit-app.netlify.app'];
    const origin = event.headers?.origin || '';
    const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    const headers = {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const creatorCode = process.env.FLIPIT_CREATOR_CODE;
    if (!creatorCode || String(creatorCode).length < 16) {
        return { statusCode: 503, headers, body: JSON.stringify({ error: 'Service unavailable.' }) };
    }

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
    }

    const submitted = String(body.code || '').trim();
    if (!submitted || !constantTimeEq(submitted, String(creatorCode))) {
        await new Promise(r => setTimeout(r, 250)); // brute-force damper
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const sid = String(body.sid || '').trim();
    // sid is either a Stripe checkout session or a creator token id.
    if (!/^(cs_(live|test)_[A-Za-z0-9_]+|creator-[a-f0-9]{16})$/.test(sid)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid sid — expected cs_live_..., cs_test_..., or creator-<hex>.' }) };
    }

    const action = String(body.action || 'revoke').toLowerCase();
    try {
        if (action === 'revoke') {
            await setRevoked(sid, true);
            return { statusCode: 200, headers, body: JSON.stringify({ sid, revoked: true }) };
        }
        if (action === 'restore') {
            await setRevoked(sid, false);
            return { statusCode: 200, headers, body: JSON.stringify({ sid, revoked: false }) };
        }
        if (action === 'check') {
            const revoked = await getRevoked(sid);
            return { statusCode: 200, headers, body: JSON.stringify({ sid, revoked }) };
        }
        return { statusCode: 400, headers, body: JSON.stringify({ error: "action must be 'revoke', 'restore', or 'check'" }) };
    } catch (err) {
        console.error('revoke-pro failed:', err?.message || err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Could not update revocation list: ' + (err?.message || 'unknown') }) };
    }
});

function constantTimeEq(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}
