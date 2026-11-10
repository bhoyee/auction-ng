import { contactTopicLabels } from '@auction-ng/shared';
import type { EmailMessage } from '../email/mail-delivery';
import { EMAIL_BRAND_HEADER } from '../email/branding';

export type ContactPayload = {
  name: string;
  email: string;
  topic: keyof typeof contactTopicLabels;
  reference?: string;
  message: string;
};

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] ?? c,
  );
const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 12px;line-height:1.55">${escape(block).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
const shell = (body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;font-family:Arial,sans-serif;font-size:16px"><div style="max-width:600px;margin:0 auto">${EMAIL_BRAND_HEADER}${body}</div></body></html>`;

// To the support inbox. Reply-To is the sender, so the team simply replies.
export function contactInboxEmail(
  reference: string,
  payload: ContactPayload,
): EmailMessage {
  const topic = contactTopicLabels[payload.topic];
  const rows: [string, string][] = [
    ['Reference', reference],
    ['From', `${payload.name} <${payload.email}>`],
    ['Topic', topic],
    ...(payload.reference
      ? ([['Item or invoice', payload.reference]] as [string, string][])
      : []),
  ];
  return {
    Subject: `[${reference}] ${topic}: message from ${payload.name}`,
    ReplyTo: payload.email,
    Text: `${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${payload.message}\n\nReply to this email to answer ${payload.name} directly.`,
    HTML: shell(
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:4px 16px 4px 0;font-weight:700">${escape(label)}</td><td style="padding:4px 0">${escape(value)}</td></tr>`,
        )
        .join(
          '',
        )}</table>${paragraphs(payload.message)}<p style="margin:16px 0 0;font-size:14px">Reply to this email to answer ${escape(payload.name)} directly.</p>`,
    ),
  };
}

// Confirmation to the sender, with their reference number.
export function contactAckEmail(
  reference: string,
  payload: ContactPayload,
): EmailMessage {
  const lines = [
    // Fixed greeting: anyone can type any address, so repeat no sender text.
    'Hi there,',
    `Thanks for contacting LotVanta. We have received your message about "${contactTopicLabels[payload.topic]}" and our team will reply within 1 working day.`,
    `Your reference is ${reference}. Please quote it if you contact us again about this.`,
    'Our support team is available 9am to 5pm, Monday to Saturday (WAT).',
    'We will never ask for your password, sign-in code or pickup QR code.',
  ];
  return {
    Subject: `We received your message (${reference})`,
    Text: lines.join('\n\n'),
    HTML: shell(lines.map((line) => paragraphs(line)).join('')),
  };
}
