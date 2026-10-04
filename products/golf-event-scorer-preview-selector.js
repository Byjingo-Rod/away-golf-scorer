  function renderPlayerExperience() {
    gesRenderPlayerExperience();
    const host = document.getElementById('playerExperience');
    if (!host || !store.event || isPlayerDevice() || store.cloud?.role === 'spectator' || document.getElementById('previewPlayer')) return;
    const day = Math.min(store.event.playerPreviewDay || 1, store.event.days || 1);
    const field = dayFieldIds(day).filter(id => String(id) !== NO_PARTNER_ID);
    if (!field.length) return;
    const label = document.createElement('label');
    label.className = 'gesPreviewSelector';
    label.textContent = 'Choose golfer';
    const select = document.createElement('select');
    select.id = 'gesPreviewPlayer';
    for (const id of field) {
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = player(id)?.name || 'Player';
      option.selected = String(id) === String(store.event.playerPreviewId);
      select.append(option);
    }
    select.onchange = () => {
      store.event.playerPreviewId = select.value;
      store.event.playerRoundMode = 'preview';
      store.event.playerHolePos = 0;
      save();
      renderPlayerExperience();
    };
    label.append(select);
    host.prepend(label);
  }
