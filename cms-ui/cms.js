function cmsPeople() {
  let data = { people: [] };
  let dirty = false;
  const $ = (id) => document.getElementById(id);

  function setDirty(v) { dirty = v; $('dirty-meta').textContent = v ? 'Unsaved changes' : 'No unsaved changes'; }
  function setStatus(msg, kind) { const el = $('status'); el.textContent = msg || ''; el.className = 'status-msg' + (kind ? ' ' + kind : ''); }
  function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }
  function escapeText(s) { return (s || '').replace(/</g, '&lt;'); }
  function slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'new'; }
  function preview(s) { return (s || '').slice(0, 80) + ((s || '').length > 80 ? '…' : ''); }

  function row(p, idx) {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    const photoSrc = p.photo ? ('/' + p.photo) : '';
    tr.innerHTML = `
      <td class="img-cell"><div class="img-thumb ${p.photo ? '' : 'empty'}" data-action="pick-photo" title="Click to change">${p.photo ? `<img src="${photoSrc}" alt="" onerror="this.parentElement.classList.add('empty');this.remove()"/>` : ''}</div></td>
      <td><input type="text" data-field="name" value="${escapeAttr(p.name)}" /></td>
      <td><input type="text" data-field="role_en" value="${escapeAttr(p.role_en)}" /></td>
      <td><input type="text" data-field="role_no" value="${escapeAttr(p.role_no)}" /></td>
      <td class="bio-cell">
        <p class="preview" data-bio-preview>${escapeText(preview(p.bio_en))}</p>
        <button class="btn linkish" data-action="edit-bio">Edit bios</button>
      </td>
      <td><input type="email" data-field="email" value="${escapeAttr(p.email)}" placeholder="name@scale-42.com" /></td>
      <td><input type="tel" data-field="phone" value="${escapeAttr(p.phone)}" placeholder="+47 …" /></td>
      <td><input type="url" data-field="linkedin" value="${escapeAttr(p.linkedin)}" placeholder="https://linkedin.com/in/..." /></td>
      <td class="col-actions"><button class="btn linkish" data-action="signature">Open</button></td>
      <td class="col-pub"><label class="toggle"><input type="checkbox" data-field="is_founder" ${p.is_founder ? 'checked' : ''}/><span class="slider"></span></label></td>
      <td class="col-pub"><label class="toggle"><input type="checkbox" data-field="published" ${p.published ? 'checked' : ''}/><span class="slider"></span></label></td>
      <td class="col-actions">
        <button class="btn icon" data-action="up" title="Move up">▲</button>
        <button class="btn icon" data-action="down" title="Move down">▼</button>
        <button class="btn danger" data-action="delete">Delete</button>
      </td>
    `;
    return tr;
  }

  function render() {
    const tbody = $('tbody-people');
    tbody.innerHTML = '';
    data.people.forEach((p, i) => tbody.appendChild(row(p, i)));
  }

  function readBack() {
    const rows = $('tbody-people').querySelectorAll('tr');
    const arr = [];
    rows.forEach((tr) => {
      const get = (f) => {
        const el = tr.querySelector(`[data-field="${f}"]`);
        if (!el) return '';
        if (el.type === 'checkbox') return el.checked;
        return el.value;
      };
      const original = data.people[parseInt(tr.dataset.idx, 10)] || {};
      arr.push({
        id: original.id || slug(get('name')),
        name: get('name'),
        role_en: get('role_en'),
        role_no: get('role_no'),
        bio_en: original.bio_en || '',
        bio_no: original.bio_no || '',
        photo: original.photo || '',
        email: get('email'),
        phone: get('phone'),
        linkedin: get('linkedin'),
        is_founder: get('is_founder'),
        published: get('published'),
      });
    });
    data.people = arr;
  }

  function openBioModal(idx) {
    readBack();
    const p = data.people[idx];
    const root = $('modal-root');
    root.innerHTML = `
      <div class="modal-overlay" data-modal-overlay>
        <div class="modal">
          <div class="modal-head">
            <h2>Edit bio &mdash; ${escapeText(p.name || 'Untitled')}</h2>
            <button class="close" data-modal-close aria-label="Close">×</button>
          </div>
          <div class="modal-body">
            <div>
              <label>Bio (EN)</label>
              <textarea id="bio-en">${escapeText(p.bio_en)}</textarea>
            </div>
            <div>
              <label>Bio (NO)</label>
              <textarea id="bio-no">${escapeText(p.bio_no)}</textarea>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" data-modal-close>Cancel</button>
            <button class="btn primary" id="bio-apply">Apply</button>
          </div>
        </div>
      </div>
    `;
    const close = () => { root.innerHTML = ''; };
    root.querySelector('[data-modal-overlay]').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
    root.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', close));
    document.getElementById('bio-apply').addEventListener('click', () => {
      data.people[idx].bio_en = document.getElementById('bio-en').value;
      data.people[idx].bio_no = document.getElementById('bio-no').value;
      const tr = document.querySelector(`#tbody-people tr[data-idx="${idx}"]`);
      if (tr) tr.querySelector('[data-bio-preview]').textContent = preview(data.people[idx].bio_en);
      setDirty(true);
      close();
    });
  }

  function buildSignatureHtml(p) {
    const SITE = 'https://draft.scale-42.com'; // until DNS for www is moved off Wix
    const photoUrl = p.photo ? `${SITE}/${p.photo}` : '';
    const logoUrl = `${SITE}/assets/logo.png`;
    const teal = '#2f6675';
    const ink = '#1c2e3f';
    const muted = '#6b7780';
    const role = p.role_en || '';
    const phone = p.phone || '';
    const email = p.email || '';
    const linkedin = p.linkedin || '';
    return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${ink};font-size:13px;line-height:1.45;border-collapse:collapse;">
  <tr>
    ${photoUrl ? `<td valign="top" style="padding:0 18px 0 0;">
      <img src="${photoUrl}" alt="${(p.name||'').replace(/"/g,'&quot;')}" width="84" height="84" style="display:block;border-radius:50%;border:0;object-fit:cover;" />
    </td>` : ''}
    <td valign="top" style="border-left:3px solid ${teal};padding:2px 0 2px 16px;">
      <div style="font-size:16px;font-weight:600;color:${ink};letter-spacing:-0.01em;">${p.name || ''}</div>
      ${role ? `<div style="font-size:13px;color:${muted};margin-top:2px;">${role} &middot; Scale42</div>` : `<div style="font-size:13px;color:${muted};margin-top:2px;">Scale42</div>`}
      <div style="margin-top:10px;font-size:12.5px;">
        ${phone ? `<a href="tel:${phone.replace(/\s/g,'')}" style="color:${ink};text-decoration:none;">${phone}</a>` : ''}
        ${phone && email ? `<span style="color:${muted};margin:0 6px;">&middot;</span>` : ''}
        ${email ? `<a href="mailto:${email}" style="color:${ink};text-decoration:none;">${email}</a>` : ''}
      </div>
      <div style="margin-top:6px;font-size:12.5px;">
        <a href="${SITE}" style="color:${teal};text-decoration:none;font-weight:600;">scale-42.com</a>
        ${linkedin ? `<span style="color:${muted};margin:0 6px;">&middot;</span><a href="${linkedin}" style="color:${teal};text-decoration:none;font-weight:600;">LinkedIn</a>` : ''}
      </div>
      <div style="margin-top:12px;">
        <img src="${logoUrl}" alt="Scale42" width="96" style="display:block;border:0;" />
      </div>
      <div style="margin-top:8px;font-size:11px;color:${muted};">Next-generation European digital infrastructure</div>
    </td>
  </tr>
</table>`;
  }

  function buildSignatureText(p) {
    const lines = [];
    lines.push(p.name || '');
    if (p.role_en) lines.push(`${p.role_en} · Scale42`); else lines.push('Scale42');
    lines.push('');
    if (p.phone) lines.push(p.phone);
    if (p.email) lines.push(p.email);
    lines.push('https://www.scale-42.com');
    if (p.linkedin) lines.push(p.linkedin);
    return lines.filter(l => l !== undefined).join('\n');
  }

  function openSignatureModal(idx) {
    const p = data.people[idx];
    const html = buildSignatureHtml(p);
    const text = buildSignatureText(p);
    const root = $('modal-root');
    root.innerHTML = `
      <div class="modal-overlay" data-modal-overlay>
        <div class="modal" style="max-width:720px;">
          <div class="modal-head">
            <h2>Email signature &mdash; ${escapeText(p.name || 'Untitled')}</h2>
            <button class="close" data-modal-close aria-label="Close">×</button>
          </div>
          <div class="modal-body" style="display:block;">
            <p style="margin:0 0 10px;font-size:13px;color:#6b7780;">Preview (rendered):</p>
            <div style="background:#fff;border:1px solid #e5e8eb;border-radius:10px;padding:20px;margin-bottom:18px;">
              <div id="sig-preview"></div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
              <button class="btn primary" id="sig-copy-html">Copy rich (Gmail / Outlook web)</button>
              <button class="btn" id="sig-copy-source">Copy HTML source</button>
              <button class="btn" id="sig-copy-text">Copy plain text</button>
            </div>
            <details>
              <summary style="cursor:pointer;font-size:13px;color:#6b7780;">HTML source</summary>
              <textarea readonly style="width:100%;height:180px;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;margin-top:8px;border:1px solid #e5e8eb;border-radius:6px;padding:8px;">${escapeText(html)}</textarea>
            </details>
            <p style="margin:14px 0 0;font-size:12px;color:#6b7780;">
              <strong>Outlook desktop:</strong> File &rarr; Options &rarr; Mail &rarr; Signatures &rarr; New &rarr; paste the rich version.<br/>
              <strong>Gmail:</strong> Settings &rarr; See all settings &rarr; Signature &rarr; paste the rich version.<br/>
              The image links to https://www.scale-42.com so it loads in any client; nothing is embedded.
            </p>
          </div>
          <div class="modal-foot">
            <button class="btn" data-modal-close>Close</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('sig-preview').innerHTML = html;
    const close = () => { root.innerHTML = ''; };
    root.querySelector('[data-modal-overlay]').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
    root.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', close));

    const flash = (btn, msg) => { const o = btn.textContent; btn.textContent = msg; setTimeout(() => btn.textContent = o, 1400); };

    document.getElementById('sig-copy-html').addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          })
        ]);
        flash(e.target, '✓ Copied — paste into Gmail/Outlook');
      } catch (err) {
        // fallback
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('sig-preview'));
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        document.execCommand('copy'); sel.removeAllRanges();
        flash(e.target, '✓ Copied');
      }
    });
    document.getElementById('sig-copy-source').addEventListener('click', async (e) => {
      await navigator.clipboard.writeText(html); flash(e.target, '✓ Copied HTML');
    });
    document.getElementById('sig-copy-text').addEventListener('click', async (e) => {
      await navigator.clipboard.writeText(text); flash(e.target, '✓ Copied text');
    });
  }

  async function loadMeta() {
    try {
      const r = await fetch('/api/published-meta');
      if (!r.ok) return;
      const m = await r.json();
      const info = m.people;
      const el = document.getElementById('last-published');
      if (!el) return;
      if (info?.at) {
        const dt = new Date(info.at);
        const ago = Math.round((Date.now() - dt.getTime()) / 60000);
        const txt = ago < 60 ? `${ago} min ago` : ago < 1440 ? `${Math.round(ago/60)} h ago` : dt.toLocaleDateString();
        el.textContent = `Last published: ${txt}`;
      } else { el.textContent = 'Never published'; }
    } catch {}
  }

  async function load() {
    setStatus('Loading…');
    loadMeta();
    const r = await fetch('/api/people');
    if (!r.ok) { setStatus('Load failed', 'err'); return; }
    data = await r.json();
    render();
    setDirty(false);
    setStatus('Loaded');
    setTimeout(() => setStatus(''), 1500);
  }

  async function save() {
    readBack();
    setStatus('Saving…');
    const r = await fetch('/api/people', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) { setStatus('Save failed', 'err'); return false; }
    const r2 = await fetch('/api/save/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!r2.ok) { setStatus('Saved locally; draft commit failed', 'err'); setDirty(false); return true; }
    setDirty(false);
    setStatus('Saved to draft branch', 'ok');
    return true;
  }

  async function publish() {
    if (!confirm('Publish people changes? This regenerates the public site and pushes to draft branch.')) return;
    if (!(await save())) return;
    setStatus('Publishing…');
    const r = await fetch('/api/publish/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'CMS publish: people' }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { setStatus('Publish failed: ' + (body.error || r.status), 'err'); return; }
    setStatus('Published to LIVE — both sites redeploying', 'ok');
  }

  document.addEventListener('input', (e) => { if (e.target.closest('table.cms')) setDirty(true); });
  document.addEventListener('change', (e) => { if (e.target.closest('table.cms')) setDirty(true); });
  document.addEventListener('click', (e) => {
    const t = e.target;
    const tr = t.closest('tr');
    if (t.matches('[data-action="delete"]')) {
      const idx = parseInt(tr.dataset.idx, 10);
      readBack();
      data.people.splice(idx, 1);
      render();
      setDirty(true);
    } else if (t.matches('[data-action="up"]') || t.matches('[data-action="down"]')) {
      const idx = parseInt(tr.dataset.idx, 10);
      const newIdx = t.matches('[data-action="up"]') ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= data.people.length) return;
      readBack();
      const [moved] = data.people.splice(idx, 1);
      data.people.splice(newIdx, 0, moved);
      render();
      setDirty(true);
    } else if (t.matches('[data-action="edit-bio"]')) {
      openBioModal(parseInt(tr.dataset.idx, 10));
    } else if (t.matches('[data-action="signature"]')) {
      readBack();
      openSignatureModal(parseInt(tr.dataset.idx, 10));
    } else if (t.closest('[data-action="pick-photo"]')) {
      const idx = parseInt(tr.dataset.idx, 10);
      readBack();
      window.openImagePicker({
        folder: 'team',
        current: data.people[idx].photo,
        onPick: (path) => { data.people[idx].photo = path; setDirty(true); render(); },
      });
    } else if (t.matches('[data-add]')) {
      readBack();
      data.people.push({ id: '', name: '', role_en: '', role_no: '', bio_en: '', bio_no: '', photo: '', email: '', phone: '', linkedin: '', is_founder: false, published: false });
      render();
      setDirty(true);
    }
  });

  $('btn-save').addEventListener('click', save);
  $('btn-publish').addEventListener('click', publish);
  $('btn-reload').addEventListener('click', () => { if (dirty && !confirm('Discard unsaved changes?')) return; load(); });
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  load();
}
