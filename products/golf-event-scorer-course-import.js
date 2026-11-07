  // Product-only course transfer. Never restores players, events or cloud credentials.
  const gesCourseSafetyKey = 'golfEventScorerCoursesBeforeImport';
  const gesImportButton = document.createElement('button');
  gesImportButton.className = 'soft';
  gesImportButton.textContent = 'Import Courses from Away Golf';
  $('#coursesPage .pageHead').append(gesImportButton);
  gesImportButton.onclick = () => {
    $('#modalShade').classList.add('open');
    $('#modalContent').innerHTML = '<h2>Import Courses from Away Golf</h2><p>In Away Golf Scorer, open Organiser Backup and choose Download Backup File. Select that file here to copy course contacts, tee details and all saved scorecards.</p><p>Matching course names are updated; other courses are kept. Players and events are not imported.</p><label>Select Away Golf backup<input id="gesCourseFile" type="file" accept="application/json,.json"></label><p id="gesCourseImportStatus" role="status"></p><button id="gesCourseApply" class="primary" disabled>Choose a backup first</button> <button id="gesCourseUndo" class="soft">Undo Last Course Import</button> <button id="gesCourseClose" class="soft">Close</button>';
    $('#gesCourseUndo').disabled = !localStorage.getItem(gesCourseSafetyKey);
    $('#gesCourseClose').onclick = () => $('#modalShade').classList.remove('open');
    $('#gesCourseUndo').onclick = () => {
      const previous = JSON.parse(localStorage.getItem(gesCourseSafetyKey));
      store.courses = previous.courses; store.courseFavourites = previous.favourites;
      save(); localStorage.removeItem(gesCourseSafetyKey);
      $('#gesCourseUndo').disabled = true;
      $('#gesCourseImportStatus').textContent = 'Previous courses restored.';
    };
    $('#gesCourseFile').onchange = async event => {
      try {
        const apply = $('#gesCourseApply'); apply.disabled = true; apply.onclick = null;
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 20 * 1024 * 1024) throw new Error('This file is too large. Choose an organiser JSON backup.');
        const payload = JSON.parse(await file.text(), (key, value) => {
          if (['__proto__','prototype','constructor'].includes(key)) throw new Error('Invalid backup contents.');
          return value;
        });
        if (payload.format !== 'Away Golf Organiser Backup' || payload.backupVersion !== 1 || !Array.isArray(payload.data?.courses)) throw new Error('Choose a backup downloaded from Away Golf Scorer.');
        const courses = payload.data.courses;
        if (!courses.length) throw new Error('This backup contains no courses.');
        if (courses.some(c => !c || typeof c.name !== 'string' || !c.name.trim() || !/^[a-zA-Z0-9_-]+$/.test(String(c.id)) || !Array.isArray(c.versions))) throw new Error('The backup contains an invalid course record.');
        const names = courses.map(c => c.name.trim().toLowerCase());
        if (new Set(names).size !== names.length) throw new Error('The backup contains duplicate course names. Resolve them in Away Golf before importing.');
        const next = JSON.parse(JSON.stringify(store.courses)), favourites = new Set(store.courseFavourites || []);
        let added = 0, updated = 0;
        for (const original of courses) {
          const c = JSON.parse(JSON.stringify(original));
          const index = next.findIndex(x => x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
          if (index >= 0) {c.id = next[index].id; updated++;}
          else {if (next.some(x => String(x.id) === String(c.id))) c.id = 'c' + uid(); added++;}
          ensureCourseData(c);
          if (index >= 0) next[index] = c; else next.push(c);
          if ((payload.data.courseFavourites || []).map(String).includes(String(original.id))) favourites.add(c.id);
        }
        $('#gesCourseImportStatus').textContent = `Ready: ${courses.length} courses. ${added} new courses; ${updated} matching courses will be updated. Click Import below.`;
        apply.textContent = `Import ${courses.length} Courses`; apply.disabled = false;
        apply.onclick = () => {
        try {
        if (localStorage.getItem(AWAY_GOLF_WRITER_LEASE_KEY) !== appTabId) throw new Error('A newer app tab is open. Close other Golf Event Scorer tabs, refresh this one, and select the backup again.');
        localStorage.setItem(gesCourseSafetyKey, JSON.stringify({courses:store.courses,favourites:store.courseFavourites || []}));
        const before = {courses:store.courses,favourites:store.courseFavourites};
        try {store.courses = next; store.courseFavourites = [...favourites]; save();
          const saved = JSON.parse(localStorage.getItem('golfEventScorer13') || 'null');
          if (JSON.stringify(saved?.courses) !== JSON.stringify(store.courses)) throw new Error('The courses could not be saved. Refresh this app and retry.');}
        catch (error) {store.courses = before.courses; store.courseFavourites = before.favourites; throw error;}
        $('#gesCourseUndo').disabled = false;
        $('#gesCourseImportStatus').textContent = `Imported ${courses.length} courses: ${added} added, ${updated} updated. Close this window to view the courses.`;
        apply.disabled = true;
        } catch(error) {$('#gesCourseImportStatus').textContent = error.message || 'Unable to save courses.';}
        };
      } catch(error) {$('#gesCourseImportStatus').textContent = error.message || 'Unable to import courses.';}
      finally {event.target.value = '';}
    };
  };
