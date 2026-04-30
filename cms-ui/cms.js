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
      <td><input type="url" data-field="linkedin" value="${escapeAttr(p.linkedin)}" placeholder="https://linkedin.com/in/..." /></td>
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

  async function load() {
    setStatus('Loading…');
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
    setDirty(false);
    setStatus('Draft saved', 'ok');
    return true;
  }

  async function publish() {
    if (!confirm('Publish people changes? This regenerates the public site and pushes to draft branch.')) return;
    if (!(await save())) return;
    setStatus('Publishing…');
    const r = await fetch('/api/publish/people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'CMS publish: people' }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { setStatus('Publish failed: ' + (body.error || r.status), 'err'); return; }
    setStatus('Published — Coolify is redeploying', 'ok');
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
      data.people.push({ id: '', name: '', role_en: '', role_no: '', bio_en: '', bio_no: '', photo: '', linkedin: '', is_founder: false, published: false });
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
