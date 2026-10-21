/**
 * Transactional email content. Kept deliberately plain: a text version for
 * every message and a minimal HTML version with escaped user content.
 */

import type { ContactSubmission, VolunteerSubmission } from './forms.ts';
import { VOLUNTEER_AVAILABILITY, VOLUNTEER_INTERESTS } from './forms.ts';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

const ORG = 'Get Involved Van';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapHtml(body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#13212c;line-height:1.55">
<div style="max-width:560px;margin:0 auto">
<p style="margin:0 0 20px;font-weight:700;font-size:15px;letter-spacing:.02em;color:#0c5678">GET INVOLVED <span style="color:#9a1f27">VAN</span></p>
${body}
</div></body></html>`;
}

export function confirmationEmail(to: string, siteUrl: string, token: string): EmailMessage {
  const base = siteUrl.replace(/\/+$/, '');
  const confirmUrl = `${base}/newsletter/confirm/?token=${encodeURIComponent(token)}`;
  const unsubscribeUrl = `${base}/newsletter/unsubscribe/?token=${encodeURIComponent(token)}`;
  const text = [
    `Please confirm your subscription to ${ORG} updates.`,
    '',
    `Confirm here: ${confirmUrl}`,
    '',
    'If you didn’t ask to subscribe, you can ignore this email. You won’t be added unless you click the link.',
    '',
    `Changed your mind later? Unsubscribe any time: ${unsubscribeUrl}`,
  ].join('\n');
  const html = wrapHtml(`
<h1 style="font-size:22px;margin:0 0 12px">Confirm your subscription</h1>
<p>Someone (hopefully you) asked to receive email updates from ${ORG}. Click the button below to confirm.</p>
<p style="margin:24px 0"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#0c5678;color:#ffffff;padding:12px 20px;text-decoration:none;font-weight:700;border-radius:3px">Confirm my subscription</a></p>
<p style="font-size:14px;color:#4a5b6d">If you didn’t ask to subscribe, ignore this email. You won’t be added unless you click the link.</p>
<p style="font-size:14px;color:#4a5b6d">You can <a href="${escapeHtml(unsubscribeUrl)}" style="color:#0c5678">unsubscribe</a> at any time.</p>`);
  return { to, subject: `Confirm your ${ORG} subscription`, text, html };
}

function labelsFor(values: string[], options: ReadonlyArray<{ value: string; label: string }>): string {
  return values.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ') || 'None given';
}

export function volunteerNotificationEmail(to: string, v: VolunteerSubmission): EmailMessage {
  const rows: Array<[string, string]> = [
    ['Name', v.fullName],
    ['Email', v.email],
    ['Phone', v.phone ?? 'Not given'],
    ['Interests', labelsFor(v.interests, VOLUNTEER_INTERESTS)],
    ['Availability', labelsFor(v.availability, VOLUNTEER_AVAILABILITY)],
    ['Comments', v.comments ?? 'None'],
  ];
  return {
    to,
    replyTo: v.email,
    subject: `New volunteer sign-up: ${v.fullName}`,
    text: `A new volunteer signed up on the website.\n\n${rows.map(([k, val]) => `${k}: ${val}`).join('\n')}\n\nThe full record is in Supabase (reports.volunteers).`,
    html: wrapHtml(
      `<h1 style="font-size:20px;margin:0 0 12px">New volunteer sign-up</h1><table style="border-collapse:collapse">${rows
        .map(
          ([k, val]) =>
            `<tr><th style="text-align:left;padding:6px 12px 6px 0;vertical-align:top">${k}</th><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(val)}</td></tr>`,
        )
        .join('')}</table>`,
    ),
  };
}

export function contactNotificationEmail(to: string, c: ContactSubmission): EmailMessage {
  return {
    to,
    replyTo: c.email,
    subject: `Website message: ${c.subject}`,
    text: `From: ${c.name} <${c.email}>\nSubject: ${c.subject}\n\n${c.message}\n\nReply to this email to answer ${c.name} directly.`,
    html: wrapHtml(
      `<p style="margin:0 0 4px"><strong>From:</strong> ${escapeHtml(c.name)} &lt;${escapeHtml(c.email)}&gt;</p>
<p style="margin:0 0 16px"><strong>Subject:</strong> ${escapeHtml(c.subject)}</p>
<div style="white-space:pre-wrap;border-left:3px solid #6d8196;padding-left:12px">${escapeHtml(c.message)}</div>
<p style="font-size:14px;color:#4a5b6d;margin-top:20px">Reply to this email to answer ${escapeHtml(c.name)} directly.</p>`,
    ),
  };
}
