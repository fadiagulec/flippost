// Netlify Function: /.netlify/functions/go-checkout   (aliased to /get)
//
// Short, shareable checkout link. netlify.toml redirects can't read
// environment variables, so the old `/get → https://buy.stripe.com/...`
// redirect baked the seller's payment link into version control. This
// function reads STRIPE_PAYMENT_LINK at request time instead, which means
// a new owner points /get at their OWN Stripe checkout with one env var
// and zero code edits.
//
// Env vars:
//   STRIPE_PAYMENT_LINK  — your Stripe Payment Link (https://buy.stripe.com/...)
//   SITE_URL             — fallback destination when the link isn't set yet

const { STRIPE_PAYMENT_LINK, SITE_URL } = require('./_config');

exports.handler = async function handler(event) {
    // Pass through UTM / referral params so campaign attribution survives
    // the hop into Stripe.
    const qs = (event && event.rawQuery) || '';

    if (!STRIPE_PAYMENT_LINK) {
        // Not configured yet — send visitors to the sales page rather than
        // a dead end, and make the reason obvious in the function log.
        console.error('go-checkout: STRIPE_PAYMENT_LINK is not set — falling back to /sell');
        return {
            statusCode: 302,
            headers: { Location: (SITE_URL || '') + '/sell', 'Cache-Control': 'no-store' },
            body: ''
        };
    }

    const sep = STRIPE_PAYMENT_LINK.includes('?') ? '&' : '?';
    const target = qs ? STRIPE_PAYMENT_LINK + sep + qs : STRIPE_PAYMENT_LINK;

    return {
        statusCode: 302,
        headers: { Location: target, 'Cache-Control': 'no-store' },
        body: ''
    };
};
