// Minimal, accessible email layout (plain text + inline-styled HTML that renders in
// Gmail/Outlook and on low-end phones). All dynamic text is HTML-escaped.

export interface EmailContent {
  title: string;
  /** Coloured strip at the top (risk level / status). */
  accent?: string;
  paragraphs: string[];
  bullets?: string[];
  cta?: { label: string; url: string };
  footer?: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function renderEmail(c: EmailContent): { text: string; html: string } {
  const text = [
    c.title,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.bullets?.length ? [...c.bullets.map((b) => `• ${b}`), ""] : []),
    ...(c.cta ? [`${c.cta.label}: ${c.cta.url}`, ""] : []),
    ...(c.footer ? ["—", c.footer] : []),
  ]
    .join("\n")
    .trim();

  const accent = c.accent ?? "#0ea5e9";
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:16px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="background:${escapeHtml(accent)};height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:20px 24px 4px;font-size:13px;font-weight:bold;letter-spacing:.06em;color:#0369a1">FLOODGUARD</td></tr>
<tr><td style="padding:0 24px 8px;font-size:22px;font-weight:bold;line-height:1.3">${escapeHtml(c.title)}</td></tr>
${c.paragraphs.map((p) => `<tr><td style="padding:6px 24px;font-size:16px;line-height:1.5">${escapeHtml(p)}</td></tr>`).join("\n")}
${c.bullets?.length ? `<tr><td style="padding:6px 24px"><ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.6">${c.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul></td></tr>` : ""}
${c.cta ? `<tr><td style="padding:14px 24px"><a href="${escapeHtml(c.cta.url)}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">${escapeHtml(c.cta.label)}</a></td></tr>` : ""}
${c.footer ? `<tr><td style="padding:14px 24px 20px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0">${escapeHtml(c.footer)}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
  return { text, html };
}
