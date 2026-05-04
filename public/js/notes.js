/* ============================================================
   notes.js  —  Diario / Notas personales
   ============================================================ */

let _notesSearch = '';

async function renderNotes(container) {
  container.innerHTML = `<div class="page-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>`;
  await loadNotes(container);
}

async function loadNotes(container, search = _notesSearch) {
  try {
    const notes = await API.getNotes(search || undefined);
    renderNotesList(container, notes, search);
  } catch (e) {
    Utils.toast(e.message, 'error');
  }
}

function renderNotesList(container, notes, currentSearch) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin-bottom:1.5rem">
      <h1 class="page-title" style="margin:0">Diario</h1>
      <button class="btn btn-primary" id="note-new-btn">
        <i class="fa-solid fa-plus"></i> Nueva nota
      </button>
    </div>

    <!-- Search -->
    <div class="search-bar mb-2">
      <i class="fa-solid fa-magnifying-glass search-icon"></i>
      <input id="notes-search" class="search-input" type="search" placeholder="Buscar en mis notas…" value="${Utils.escHtml(currentSearch)}">
    </div>

    <!-- Notes list -->
    <div id="notes-list">
      ${notes.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">📔</div>
          <h3>${currentSearch ? 'Sin resultados' : 'Sin notas aún'}</h3>
          <p>${currentSearch ? 'Intenta otra búsqueda.' : 'Escribe tu primera nota para empezar tu diario.'}</p>
        </div>` : notes.map(noteCard).join('')}
    </div>
  `;

  // New note button
  document.getElementById('note-new-btn')?.addEventListener('click', () => showNoteModal(null, container));

  // Search with debounce
  const searchEl = document.getElementById('notes-search');
  const doSearch = Utils.debounce(async v => {
    _notesSearch = v;
    await loadNotes(container, v);
  }, 400);
  searchEl?.addEventListener('input', e => doSearch(e.target.value));

  // Delegate edit/delete clicks
  document.getElementById('notes-list')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-action="edit-note"]');
    const delBtn  = e.target.closest('[data-action="delete-note"]');

    if (editBtn) {
      const id = editBtn.dataset.id;
      try {
        const note = await API.getNote(id);
        showNoteModal(note, container);
      } catch (err) { Utils.toast(err.message, 'error'); }
    }

    if (delBtn) {
      const id = delBtn.dataset.id;
      const ok = await Utils.confirm('¿Eliminar esta nota?', 'Esta acción no se puede deshacer.');
      if (!ok) return;
      try {
        await API.deleteNote(id);
        Utils.toast('Nota eliminada', 'success');
        await loadNotes(container);
      } catch (err) { Utils.toast(err.message, 'error'); }
    }
  });
}

function noteCard(note) {
  const preview   = (note.content || '').substring(0, 140).replace(/\n/g, ' ');
  const hasMore   = (note.content || '').length > 140;
  const dateStr   = Utils.formatDate(note.date, {day:'numeric', month:'long', year:'numeric'});
  const tags      = (note.tags || []).filter(Boolean);

  return `
    <div class="note-card">
      <div class="note-header">
        <div>
          ${note.title ? `<div class="note-title">${Utils.escHtml(note.title)}</div>` : ''}
          <div class="note-date"><i class="fa-regular fa-calendar"></i> ${dateStr}</div>
        </div>
        <div class="note-actions">
          <button class="btn-icon" data-action="edit-note" data-id="${note.id}" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-icon btn-icon-danger" data-action="delete-note" data-id="${note.id}" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <p class="note-preview">${Utils.escHtml(preview)}${hasMore ? '…' : ''}</p>
      ${tags.length ? `<div class="note-tags">${tags.map(t => `<span class="note-tag">${Utils.escHtml(t)}</span>`).join('')}</div>` : ''}
    </div>
  `;
}

function showNoteModal(existing, container) {
  const isNew  = !existing;
  const title  = isNew ? 'Nueva nota' : 'Editar nota';
  const defDate = existing?.date ? existing.date.split('T')[0] : Utils.today();

  Utils.modal.open(
    `${isNew ? '📝' : '✏️'} ${title}`,
    `<form id="note-form" novalidate>
        <div class="form-group">
          <label class="form-label">Título (opcional)</label>
          <input class="form-input" id="note-title" type="text" maxlength="200"
            placeholder="Ej. Cómo me sentí hoy…" value="${Utils.escHtml(existing?.title || '')}">
        </div>

        <div class="form-group">
          <label class="form-label">Fecha</label>
          <input class="form-input" id="note-date" type="date"
            value="${defDate}" max="${Utils.today()}">
        </div>

        <div class="form-group">
          <label class="form-label">Contenido <span class="required">*</span></label>
          <textarea class="form-textarea" id="note-content" rows="8"
            placeholder="Escribe aquí…" required>${Utils.escHtml(existing?.content || '')}</textarea>
          <div id="note-content-error" class="field-error"></div>
        </div>

        <div class="form-group">
          <label class="form-label">Etiquetas (separadas por coma)</label>
          <input class="form-input" id="note-tags" type="text"
            placeholder="Ej. ciclo, emociones, síntomas"
            value="${Utils.escHtml((existing?.tags || []).join(', '))}">
        </div>
      </form>`,
    `<button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-primary" id="note-save-btn">
        <i class="fa-solid fa-floppy-disk"></i> Guardar
      </button>`
  );

  document.getElementById('note-save-btn')?.addEventListener('click', async () => {
    const content = document.getElementById('note-content').value.trim();
    if (!content) {
      document.getElementById('note-content-error').textContent = 'El contenido es requerido.';
      return;
    }
    document.getElementById('note-content-error').textContent = '';

    const payload = {
      title:   document.getElementById('note-title').value.trim() || null,
      date:    document.getElementById('note-date').value,
      content,
      tags:    document.getElementById('note-tags').value
                 .split(',').map(t => t.trim()).filter(Boolean),
    };

    const btn = document.getElementById('note-save-btn');
    Utils.btnLoading(btn, true, 'Guardando…');
    try {
      if (isNew) await API.createNote(payload);
      else       await API.updateNote(existing.id, payload);

      Utils.toast(isNew ? 'Nota guardada ✓' : 'Nota actualizada ✓', 'success');
      Utils.modal.close();
      await loadNotes(container);
    } catch (e) {
      Utils.toast(e.message, 'error');
    } finally {
      Utils.btnLoading(btn, false, '<i class="fa-solid fa-floppy-disk"></i> Guardar');
    }
  });
}

window.renderNotes = renderNotes;
