function cmsPeople() {
  let data = { people: [] };
  let dirty = false;
  const $ = (id) => document.getElementById(id);

  function setDirty(v) {
    dirty = v;
    $('dirty-meta').textContent = v ? 'Unsaved changes' : 'No unsaved changes';
  }
  function setStatus(msg, kind) {
    const el = $('status');
    el.textContent = msg || '';
    el.className = 'status-msg' + (kind ? ' ' + kind : '');
  }

  function escapeAttr(s) { return (s || '').replace(/"/g, '&quot;'); }
  function escapeText(s) { return (s || '').replace(/</g, '&lt;'); }

  function row(p, idx) {
    const tr = document.createElement('tr');
    tr.dataset.idx = idx;
    const photoSrc = p.photo ? ('/' + p.photo) : '';
    tr.innerHTML = `
      <td class="col-photo">${photoSrc ? `<img src="${photoSrc}" alt="" onerror="this.style.opacity=0.2"/>` : ''}</td>
      <td><input type="text" data-field="name" value="${escapeAttr(p.name)}" /></td>
      <td><input type="text" data-field="role_en" value="${escapeAttr(p.role_en)}" /></td>
      <td><input type="text" data-field="role_no" value="${escapeAttr(p.role_no)}" /></td>
      <td><textarea data-field="bio_en">${escapeText(p.bio_en)}</textarea></td>
      <td><textarea data-field="bio_no">${escapeText(p.bio_no)}</textarea></td>
      <td><input type="text" data-field="photo" value="${escapeAttr(p.photo)}" placeholder="assets/team/foo.jpg" /></td>
      <td><input type="url" data-field="linkedin" value="${escapeAttr(p.linkedin)}" placeholder="https://linkedin.com/in/..." /></td>
      <td class="col-pub"><label class="toggle"><input type="checkbox" data-field="is_founder" ${p.is_founder ? 'checked' : ''}/><span class="slider"></span></label></td>
      <td class="col-pub"><label class="toggle"><input type="checkbox" data-field="published" ${p.published ? 'checked' : ''}/><span class="slider"></span></label></td>
      <td class="col-actions"><button class="btn danger" data-action="delete">Delete</button></td>
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
        bio_en: get('bio_en'),
        bio_no: get('bio_no'),
        photo: get('photo'),
        linkedin: get('linkedin'),
        is_founder: get('is_founder'),
        published: get('published'),
      });
    });
    data.people = arr;
  }

  function slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'new'; }

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
    const r = await fetch('/api/people', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) { setStatus('Save failed', 'err'); return false; }
    setDirty(false);
    setStatus('Draft saved', 'ok');
    return true;
  }

  async function publish() {
    if (!confirm('Publish people changes? This regenerates the public site and pushes to draft branch.')) return;
    if (!(await save())) return;
    setStatus('Publishing…');
    const r = await fetch('/api/publish/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'CMS publish: people' }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { setStatus('Publish failed: ' + (body.error || r.status), 'err'); return; }
    setStatus('Published — Coolify is redeploying', 'ok');
  }

  document.addEventListener('input', (e) => { if (e.target.closest('table.cms')) setDirty(true); });
  document.addEventListener('change', (e) => { if (e.target.closest('table.cms')) setDirty(true); });
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('[data-action="delete"]')) {
      const tr = t.closest('tr');
      const idx = parseInt(tr.dataset.idx, 10);
      readBack();
      data.people.splice(idx, 1);
      render();
      setDirty(true);
    } else if (t.matches('[data-add]')) {
      readBack();
      data.people.push({ id: '', name: '', role_en: '', role_no: '', bio_en: '', bio_no: '', photo: '', linkedin: '', is_founder: false, published: false });
      render();
      setDirty(true);
    }
  });

  $('btn-save').addEventListener('click', save);
  $('btn-publish').addEventListener('click', publish);
  $('btn-reload').addEventListener('click', () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    load();
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  load();
}
