import { tokens } from '../tokens.ts';

// Generate a transport-neutral asset; the API only substitutes a validated code.
export function signInEmailTemplate() {
  const { colors, spacing, radius, typography } = tokens;
  const font = `'${tokens.fontFamily}', Arial, sans-serif`;
  return {
    subject: 'Your Auction NG sign-in code',
    text: [
      'Auction NG',
      '',
      'Your sign-in code',
      '',
      'Enter this code in the app or website where you requested it:',
      '',
      '{{code}}',
      '',
      'This code expires in 5 minutes and can be used once.',
      '',
      'Keep your code private. Auction NG staff will never ask you to share it.',
      '',
      'If you did not request this code, you can ignore this email.',
      '',
      'Auction NG',
      'This is an automated sign-in email. Please do not reply.',
    ].join('\n'),
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Your Auction NG sign-in code</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-content { padding: ${spacing.xl}px !important; }
      .email-outer { padding: ${spacing.xl}px ${spacing.lg}px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${colors.canvas};color:${colors.ink};font-family:${font};-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Use your one-time code to sign in. It expires in 5 minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${colors.canvas};">
    <tr><td class="email-outer" align="center" style="padding:${spacing['3xl']}px ${spacing.lg}px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${tokens.measure.body}px;background-color:${colors.surface};border:1px solid ${colors.line};border-radius:${radius.card}px;">
        <tr><td class="email-content" style="padding:${spacing['2xl']}px;">
          <p style="margin:0 0 ${spacing['2xl']}px;color:${colors['indigo-900']};font-size:${typography.section.fontSize}px;line-height:${typography.section.lineHeight}px;font-weight:700;">Auction NG</p>
          <h1 style="margin:0 0 ${spacing.md}px;font-size:${typography.section.fontSize}px;line-height:${typography.section.lineHeight}px;font-weight:700;">Your sign-in code</h1>
          <p style="margin:0 0 ${spacing.xl}px;font-size:${typography.body.fontSize}px;line-height:${typography.body.lineHeight}px;">Enter this code in the app or website where you requested it.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${colors['indigo-50']};border:1px solid ${colors.line};border-radius:${radius.control}px;">
            <tr><td align="center" style="padding:${spacing.xl}px ${spacing.lg}px;">
              <p style="margin:0;color:${colors['indigo-900']};font-size:${typography.title.fontSize}px;line-height:${typography.title.lineHeight}px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:${spacing.xs}px;">{{code}}</p>
            </td></tr>
          </table>
          <p style="margin:${spacing.lg}px 0 ${spacing.xl}px;color:${colors['slate-600']};font-size:${typography.secondary.fontSize}px;line-height:${typography.secondary.lineHeight}px;">This code expires in <strong>5 minutes</strong> and can be used once.</p>
          <p style="margin:0 0 ${spacing.xl}px;font-size:${typography.secondary.fontSize}px;line-height:${typography.secondary.lineHeight}px;"><strong>Keep your code private.</strong> Auction NG staff will never ask you to share it.</p>
          <hr style="margin:0 0 ${spacing.xl}px;border:0;border-top:1px solid ${colors.line};">
          <p style="margin:0;color:${colors['slate-600']};font-size:${typography.secondary.fontSize}px;line-height:${typography.secondary.lineHeight}px;">If you did not request this code, you can ignore this email.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${tokens.measure.body}px;">
        <tr><td style="padding:${spacing.xl}px ${spacing.lg}px 0;color:${colors['slate-600']};font-size:${typography.fine.fontSize}px;line-height:${typography.fine.lineHeight}px;text-align:center;">
          Auction NG<br>This is an automated sign-in email. Please do not reply.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
