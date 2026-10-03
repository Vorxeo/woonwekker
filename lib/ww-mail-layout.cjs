'use strict';
/**
 * Shared customer-mail layout. Factual paragraphs only.
 * Every message closes with the signature Woonwekker.
 */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SIGNATURE = 'Woonwekker';

function httpUrl(value) {
  const s = String(value || '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  return s;
}

/**
 * @param {{ paragraphs?: string[], link?: string, linkLabel?: string }} opts
 * @returns {{ html: string, text: string, signature: string }}
 */
function professionalEmail({ paragraphs, link, linkLabel } = {}) {
  const paras = (Array.isArray(paragraphs) ? paragraphs : [])
    .map((p) => String(p == null ? '' : p).trim())
    .filter(Boolean);
  const href = httpUrl(link);
  const label = String(linkLabel || '').trim() || href;
  const textParts = paras.slice();
  if (href) textParts.push(label && label !== href ? label + '\n' + href : href);
  textParts.push(SIGNATURE);
  const text = textParts.join('\n\n');
  const htmlParas = paras
    .map((p) => '<p>' + escapeHtml(p).replace(/\n/g, '<br>') + '</p>')
    .join('\n');
  const htmlLink = href
    ? '<p><a href="' + escapeHtml(href) + '">' + escapeHtml(label) + '</a></p>'
    : '';
  const html =
    '<!doctype html><html><body style="font-family:Georgia,Times New Roman,serif;line-height:1.5;color:#10254c;max-width:560px">\n' +
    htmlParas +
    '\n' +
    htmlLink +
    '\n<p style="margin-top:24px">' +
    SIGNATURE +
    '</p>\n</body></html>';
  return { html, text, signature: SIGNATURE };
}

module.exports = { professionalEmail, escapeHtml, SIGNATURE, httpUrl };
