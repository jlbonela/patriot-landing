// POST /api/lead — landing form → GoHighLevel contact (Patriot Home Buyers)
// The PIT never reaches the browser: it lives only in Vercel env vars.
const GHL = 'https://services.leadconnectorhq.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const PIT = process.env.GHL_PIT;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!PIT || !locationId) {
    console.error('Missing GHL_PIT or GHL_LOCATION_ID env var');
    return res.status(500).json({ ok: false, error: 'Server not configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { name = '', address = '', phone = '', email = '', note = '', smsConsent = false, company = '' } = body;

  // Honeypot: real people leave this hidden field empty.
  if (company) return res.status(200).json({ ok: true });

  if (!phone && !email) return res.status(400).json({ ok: false, error: 'Give us a phone or an email so we can send the offer.' });
  if (!address) return res.status(400).json({ ok: false, error: 'We need the property address.' });

  const parts = String(name).trim().split(/\s+/);
  const firstName = parts.shift() || 'Seller';
  const lastName = parts.join(' ') || '(landing)';

  // sms-ok gates every SMS step in the workflows until A2P 10DLC is approved.
  const tags = ['landing-lead', 'price-lock-page'];
  if (smsConsent) tags.push('sms-ok');

  const payload = {
    locationId,
    firstName,
    lastName,
    email: email || undefined,
    phone: phone || undefined,
    address1: address,
    source: 'Landing — patriot-landing.vercel.app',
    tags,
    customFields: [],
  };

  try {
    // upsert = no duplicate contact when someone submits twice
    const r = await fetch(`${GHL}/contacts/upsert`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PIT}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('GHL upsert failed', r.status, JSON.stringify(data).slice(0, 400));
      return res.status(502).json({ ok: false, error: "We couldn't save that. Please call us instead." });
    }

    const contactId = data?.contact?.id || data?.id;

    if (note) {
      await fetch(`${GHL}/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PIT}`,
          Version: '2021-07-28',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ body: `Landing form — what's going on with the house:\n${note}` }),
      }).catch((e) => console.error('note failed', e.message));
    }

    return res.status(200).json({ ok: true, contactId });
  } catch (e) {
    console.error('lead handler error', e.message);
    return res.status(500).json({ ok: false, error: "We couldn't save that. Please call us instead." });
  }
}
