// Toolbar popup: every thread note, newest first, with search, delete and JSON export.
(async function () {
  'use strict';

  const PC = globalThis.PaperClipper;
  const locale = navigator.language || 'de-DE';
  const T = locale.toLowerCase().startsWith('de')
    ? {
        title: 'Notizen',
        search: 'Notizen durchsuchen …',
        empty: 'Noch keine Notizen. Öffne einen Verlauf in Gmail und klicke auf „Notiz“.',
        noMatch: 'Keine Notiz passt zur Suche.',
        noSubject: '(kein Betreff)',
        remove: 'Löschen',
        confirmRemove: (subject) => `Notiz zu „${subject}“ löschen?`,
        export: 'Alle Notizen als JSON exportieren',
        footer: 'Notizen liegen nur in diesem Browser. Beim Entfernen der Erweiterung werden sie gelöscht, vorher exportieren.',
      }
    : {
        title: 'Notes',
        search: 'Search notes …',
        empty: 'No notes yet. Open a thread in Gmail and click “Note”.',
        noMatch: 'No note matches your search.',
        noSubject: '(no subject)',
        remove: 'Delete',
        confirmRemove: (subject) => `Delete the note on “${subject}”?`,
        export: 'Export all notes as JSON',
        footer: 'Notes live only in this browser and are deleted with the extension. Export them first.',
      };

  const $ = (id) => document.getElementById(id);
  const search = $('search');
  const exportButton = $('export');
  $('title').textContent = T.title;
  search.placeholder = T.search;
  exportButton.title = T.export;
  exportButton.setAttribute('aria-label', T.export);
  $('footer').textContent = T.footer;

  let notes = await PC.allNotes();
  render();
  search.addEventListener('input', render);
  PC.onStoreChange(async (kind) => {
    if (kind !== 'note') return;
    notes = await PC.allNotes();
    render();
  });
  exportButton.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `paper-clipper-notes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  function render() {
    const shown = PC.filterNotes(notes, search.value);
    $('list').replaceChildren(...shown.map(item));
    $('count').textContent = notes.length ? String(notes.length) : '';
    $('empty').hidden = shown.length > 0;
    $('empty').textContent = notes.length ? T.noMatch : T.empty;
    exportButton.disabled = notes.length === 0;
  }

  function item(note) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'row';
    const subject = document.createElement('a');
    subject.className = 'subject';
    subject.textContent = note.subject || T.noSubject;
    // Only links back into Gmail; the url comes from storage, not from a page.
    if (/^https:\/\/mail\.google\.com\//.test(note.url || '')) {
      subject.href = note.url;
      subject.target = '_blank';
      subject.rel = 'noopener';
    }
    const time = document.createElement('time');
    time.dateTime = new Date(note.updatedAt).toISOString();
    time.textContent = new Date(note.updatedAt).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete';
    remove.textContent = T.remove;
    remove.addEventListener('click', async () => {
      if (confirm(T.confirmRemove(note.subject || T.noSubject))) await PC.deleteNote(note.id);
    });
    row.append(subject, time, remove);
    const text = document.createElement('p');
    text.className = 'text';
    text.textContent = note.text;
    li.append(row, text);
    return li;
  }
})();
