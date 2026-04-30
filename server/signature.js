// Build email signature HTML for a person — shared by client (preview/copy) and server (/api/signature/:id).
function buildSignatureHtml(p) {
  const SITE = 'https://www.scale-42.com';
  const photoUrl = p.photo ? `${SITE}/${p.photo}` : '';
  const logoUrl = `${SITE}/assets/logo.png`;
  const teal = '#2f6675';
  const ink = '#1c2e3f';
  const muted = '#6b7780';
  const role = p.role_en || '';
  const phone = p.phone || '';
  const email = p.email || '';
  const linkedin = p.linkedin || '';
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${ink};font-size:13px;line-height:1.45;border-collapse:collapse;">
  <tr>
    ${photoUrl ? `<td valign="top" style="padding:0 18px 0 0;"><img src="${esc(photoUrl)}" alt="${esc(p.name||'')}" width="84" height="84" style="display:block;border-radius:50%;border:0;object-fit:cover;" /></td>` : ''}
    <td valign="top" style="border-left:3px solid ${teal};padding:2px 0 2px 16px;">
      <div style="font-size:16px;font-weight:600;color:${ink};letter-spacing:-0.01em;">${esc(p.name||'')}</div>
      <div style="font-size:13px;color:${muted};margin-top:2px;">${role ? esc(role) + ' &middot; ' : ''}Scale42</div>
      <div style="margin-top:10px;font-size:12.5px;">
        ${phone ? `<a href="tel:${esc(phone.replace(/\s/g,''))}" style="color:${ink};text-decoration:none;">${esc(phone)}</a>` : ''}
        ${phone && email ? `<span style="color:${muted};margin:0 6px;">&middot;</span>` : ''}
        ${email ? `<a href="mailto:${esc(email)}" style="color:${ink};text-decoration:none;">${esc(email)}</a>` : ''}
      </div>
      <div style="margin-top:6px;font-size:12.5px;">
        <a href="${SITE}" style="color:${teal};text-decoration:none;font-weight:600;">scale-42.com</a>
        ${linkedin ? `<span style="color:${muted};margin:0 6px;">&middot;</span><a href="${esc(linkedin)}" style="color:${teal};text-decoration:none;font-weight:600;">LinkedIn</a>` : ''}
      </div>
      <div style="margin-top:12px;"><img src="${logoUrl}" alt="Scale42" width="96" style="display:block;border:0;" /></div>
      <div style="margin-top:8px;font-size:11px;color:${muted};">Next-generation European digital infrastructure</div>
    </td>
  </tr>
</table>`;
}

module.exports = { buildSignatureHtml };
