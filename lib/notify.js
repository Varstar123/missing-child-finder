// Delivers a real alert to a registered family when a strong match is found.
//
// Two channels, both optional and configured purely through environment
// variables (no extra npm packages — uses the global fetch in Node 18+):
//
//   • Email via Resend  — set RESEND_API_KEY and ALERT_FROM_EMAIL
//     (ALERT_FROM_EMAIL must be on a domain you verified in Resend).
//   • SMS via Twilio    — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//     and TWILIO_FROM_NUMBER (your Twilio number, e.g. +15551234567).
//
// If neither is configured the function is a safe no-op: the alert is still
// recorded and shown on the Alerts page, it just isn't pushed out. This keeps
// the site working before any provider is wired up. Failures never throw — we
// return a summary so the caller can record it without breaking the response.

const APP_URL = process.env.APP_URL || ''; // e.g. https://your-app.vercel.app

function emailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);
}
function smsConfigured() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

function buildText(alert) {
  const where = alert.location ? ` near ${alert.location}` : '';
  const link = APP_URL ? ` See the photo and details: ${APP_URL}/alerts.html` : '';
  return (
    `Missing Child Finder: a possible sighting of ${alert.childName} ` +
    `(${alert.matchPercent}% match) was just reported${where}. ` +
    `This is an automated match and must be verified — please contact your ` +
    `local police or child-protection authorities.${link}`
  );
}

function buildHtml(alert) {
  const where = alert.location
    ? `<p><strong>Reported location:</strong> ${escapeHtml(alert.location)}</p>`
    : '';
  const photo = alert.foundPhotoUrl
    ? `<p><img src="${escapeHtml(alert.foundPhotoUrl)}" alt="Photo from the person who reported the sighting" style="max-width:280px;border-radius:6px" /></p>`
    : '';
  const link = APP_URL
    ? `<p><a href="${APP_URL}/alerts.html">View this alert</a></p>`
    : '';
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c2733;line-height:1.5">` +
    `<h2 style="color:#1f3a5f">Possible sighting of ${escapeHtml(alert.childName)}</h2>` +
    `<p>Someone just reported a child who is a <strong>${alert.matchPercent}% face match</strong> ` +
    `for <strong>${escapeHtml(alert.childName)}</strong>.</p>` +
    where +
    photo +
    `<p style="background:#fbf3ef;border:1px solid #e7cdbf;border-radius:6px;padding:12px">` +
    `<strong>Important:</strong> a face match is not proof. Please do not confront anyone. ` +
    `Share this with your local police or child-protection authorities, who can verify it safely. ` +
    `If you believe the child is in immediate danger, contact emergency services first.</p>` +
    link +
    `<p style="color:#5c6b7a;font-size:13px">Sent automatically by Missing Child Finder.</p>` +
    `</div>`
  );
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

async function sendEmail(alert) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.ALERT_FROM_EMAIL,
      to: [alert.parentEmail],
      subject: `Possible sighting of ${alert.childName} (${alert.matchPercent}% match)`,
      html: buildHtml(alert),
      text: buildText(alert),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
}

async function sendSms(alert) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const body = new URLSearchParams({
    From: process.env.TWILIO_FROM_NUMBER,
    To: alert.parentPhone,
    Body: buildText(alert),
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Twilio ${res.status}: ${detail.slice(0, 200)}`);
  }
}

// Notify one family. `alert` needs: childName, matchPercent, parentEmail,
// parentPhone, location, foundPhotoUrl. Returns a summary; never throws.
async function notifyGuardian(alert) {
  const channels = [];
  const errors = [];

  if (alert.parentEmail && emailConfigured()) {
    try {
      await sendEmail(alert);
      channels.push('email');
    } catch (err) {
      errors.push(`email: ${err.message}`);
    }
  }

  if (alert.parentPhone && smsConfigured()) {
    try {
      await sendSms(alert);
      channels.push('sms');
    } catch (err) {
      errors.push(`sms: ${err.message}`);
    }
  }

  return {
    attempted: emailConfigured() || smsConfigured(),
    sent: channels.length > 0,
    channels,
    error: errors.join('; '),
  };
}

module.exports = { notifyGuardian, emailConfigured, smsConfigured };
