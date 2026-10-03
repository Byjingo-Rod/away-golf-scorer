  // Golf Event Scorer product-only player form; existing golfLink storage stays compatible.
  function addPlayer(onSaved) {
    const search = ($('#playerSearchMain')?.value || '').trim();
    const words = search && !/^\d+$/.test(search) ? search.split(/\s+/) : [];
    gesPlayerDetails(null, '', typeof onSaved === 'function' ? onSaved : null, {
      firstName: words.length > 1 ? words.slice(0, -1).join(' ') : (words[0] || ''),
      lastName: words.length > 1 ? words.at(-1) : '',
      golfLink: /^\d+$/.test(search) ? search : ''
    });
    return null;
  }
  function gesPlayerDetails(id, status = '', onSaved = null, defaults = {}) {
    const existing = id ? player(id) : null;
    if (id && !existing) return;
    const p = existing || defaults;
    const words = String(p.name || '').trim().split(/\s+/).filter(Boolean);
    const firstName = p.firstName ?? (words.length > 1 ? words.slice(0,-1).join(' ') : words[0] || '');
    const lastName = p.lastName ?? (words.length > 1 ? words.at(-1) : '');
    const address = p.addressDetails || {};
    const legacyAddress = !p.addressDetails ? String(p.address || '') : String(p.addressDetails.legacyAddress || '');
    const streetTypes = ['Street','Rd','Close','Pde','Hwy','Other'];
    showSide(`<div class="gesPlayerDetail"><h2>${existing ? 'Edit Player Details' : 'Player Details'}</h2><p>Enter the golfer’s details. First Name and Last Name are required.</p><p id="gesPlayerFormStatus" role="status" aria-live="polite"></p><form id="gesPlayerDetailForm">
      <div class="gesNameFields"><label>First Name<input id="gesFirstName" maxlength="80" autocomplete="given-name" required value="${esc(firstName)}"></label><label>Last Name<input id="gesLastName" maxlength="80" autocomplete="family-name" required value="${esc(lastName)}"></label></div>
      <label>Nick Name<input id="gesNickname" maxlength="80" value="${esc(p.nickname || '')}"></label>
      <label>Golf Registration No <small>(where applicable)</small><input id="gesRegistration" maxlength="40" inputmode="numeric" value="${esc(p.golfLink || '')}"></label>
      <label>Cell Phone No<input id="gesCellPhone" type="tel" maxlength="60" autocomplete="tel" value="${esc(p.cellPhone || '')}"></label>
      <fieldset class="gesAddressFields"><legend>Address</legend>
      <label>House/Apt No<input id="gesHouseNo" maxlength="80" value="${esc(address.houseNo || '')}"></label>
      <label>Street Name<input id="gesStreetName" maxlength="160" value="${esc(address.streetName || '')}"></label>
      <label>Street Type<select id="gesStreetType"><option value="">Select street type</option>${streetTypes.map(type => `<option value="${type}" ${address.streetType === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label>
      <label id="gesOtherStreetLabel" style="${address.streetType === 'Other' ? '' : 'display:none'}" ${address.streetType === 'Other' ? '' : 'hidden'}>Other — please insert<input id="gesOtherStreet" maxlength="80" value="${esc(address.otherStreetType || '')}"></label>
      <label>Suburb<input id="gesSuburb" maxlength="160" autocomplete="address-level2" value="${esc(address.suburb || '')}"></label>
      <label>State<input id="gesState" maxlength="80" autocomplete="address-level1" value="${esc(address.state || '')}"></label>
      <label>Post Code<input id="gesPostCode" maxlength="20" inputmode="numeric" autocomplete="postal-code" value="${esc(address.postCode || '')}"></label>
      ${legacyAddress ? `<label>Previously saved address<textarea id="gesLegacyAddress" rows="3" maxlength="1000">${esc(legacyAddress)}</textarea></label><small>You can transfer this address into the fields above and clear this box when finished.</small>` : ''}
      </fieldset>
      <label>Notes<textarea id="gesNotes" rows="4" maxlength="10000">${esc(p.notes || '')}</textarea></label>
      ${existing ? `<details><summary>Handicap & club details</summary><label>Home club<input id="gesHomeClub" maxlength="160" value="${esc(p.homeClub || '')}"></label><label>GA handicap<input id="gesGa" type="number" min="-10" max="54" step="0.1" value="${p.gaUpdatedAt ? esc(p.ga) : ''}"></label><p>Enter a plus handicap as a negative number: +4 means −4.</p><label>Status<select id="gesRosterActive"><option value="active" ${p.rosterActive !== false ? 'selected' : ''}>Active</option><option value="inactive" ${p.rosterActive === false ? 'selected' : ''}>Inactive</option></select></label></details>` : ''}
      ${existing ? '<button class="soft" type="button" id="gesHandicapDetails">Event Handicap Details</button> <button class="danger" type="button" id="gesDeletePlayer">Delete Player</button>' : ''}<div class="rowBtns"><button class="primary" type="submit">Save Player</button><button class="soft" type="button" id="gesCancelPlayer">Cancel</button></div>
    </form></div>`);
    $('#gesStreetType').onchange = () => { const other = $('#gesStreetType').value === 'Other'; $('#gesOtherStreetLabel').hidden = !other; $('#gesOtherStreetLabel').style.display = other ? '' : 'none'; $('#gesOtherStreet').required = other; };
    $('#gesStreetType').onchange();
    if(existing) { $('#gesHandicapDetails').onclick=()=>gesHandicapProfile(id,status); $('#gesDeletePlayer').onclick=()=>gesDeletePlayer(id); }
    $('#gesCancelPlayer').onclick = () => { if (existing) playerInfo(id,status); else $('#sidePanel').classList.remove('open'); };
    $('#gesPlayerDetailForm').onsubmit = event => {
      event.preventDefault(); const note = $('#gesPlayerFormStatus');
      try {
        if (localStorage.getItem(AWAY_GOLF_WRITER_LEASE_KEY) !== appTabId) throw new Error('A newer Golf Event Scorer tab is open. Close the other app tabs and refresh this one before saving.');
        const first = $('#gesFirstName').value.trim(), last = $('#gesLastName').value.trim();
        if (!first || !last) throw new Error('Enter First Name and Last Name.');
        const addressDetails = {houseNo:$('#gesHouseNo').value.trim(),streetName:$('#gesStreetName').value.trim(),streetType:$('#gesStreetType').value,otherStreetType:$('#gesOtherStreet').value.trim(),suburb:$('#gesSuburb').value.trim(),state:$('#gesState').value.trim(),postCode:$('#gesPostCode').value.trim(),legacyAddress:legacyAddress ? $('#gesLegacyAddress').value.trim() : ''};
        if(addressDetails.streetType === 'Other' && !addressDetails.otherStreetType) throw new Error('Please insert the other street type.');
        const formattedAddress = [[addressDetails.houseNo,addressDetails.streetName,addressDetails.streetType === 'Other' ? addressDetails.otherStreetType : addressDetails.streetType].filter(Boolean).join(' '),[addressDetails.suburb,addressDetails.state,addressDetails.postCode].filter(Boolean).join(' '),addressDetails.legacyAddress].filter(Boolean).join('\n');
        const record = {...(existing || {id:'p'+uid(),ga:0,rosterActive:true,homeClub:'',eventsPlayed:0,lastEvent:''}),firstName:first,lastName:last,name:first+' '+last,
          nickname:$('#gesNickname').value.trim(),golfLink:$('#gesRegistration').value.trim(),cellPhone:$('#gesCellPhone').value.trim(),address:formattedAddress,addressDetails,notes:$('#gesNotes').value.trim()};
        if (existing) {
          record.homeClub=$('#gesHomeClub').value.trim();record.rosterActive=$('#gesRosterActive').value==='active';
          const ga=$('#gesGa').value;if(ga!==''){record.ga=Number(ga);record.gaUpdatedAt=new Date().toISOString();}
        }
        const previous = structuredClone(store.players);
        if (existing) store.players=store.players.map(item=>String(item.id)===String(id)?record:item); else store.players.push(record);
        try {
          save();
          const saved=JSON.parse(localStorage.getItem('golfEventScorer13') || 'null');
          if (!saved?.players?.some(item=>String(item.id)===String(record.id)&&JSON.stringify(item)===JSON.stringify(record))) throw new Error('The player could not be saved on this device. Keep this form open and try again.');
        } catch(error) {store.players=previous;renderPlayersAdmin();throw error;}
        $('#playerSearchMain').value='';renderPlayersAdmin();
        if(onSaved)onSaved(record.id);
        showSide(`<h2>Player saved</h2><p>${esc(record.name)} has been saved to the player list on this device.</p><button class="primary" id="gesViewSavedPlayer">View Player Details</button> <button class="soft" id="gesCloseSavedPlayer">Back to Players</button>`);
        $('#gesViewSavedPlayer').onclick=()=>gesPlayerDetails(record.id,status);
        $('#gesCloseSavedPlayer').onclick=()=>$('#sidePanel').classList.remove('open');
      } catch(error) {note.textContent=error.message;note.className='gesFormError';}
    };
    $('#gesFirstName').focus();
  }

  function gesDeletePlayer(id) {
    const p = player(id); if(!p) return;
    showSide(`<h2>Delete Player</h2><p>Remove <b>${esc(p.name)}</b> from your group’s player list?</p><p>This player will move to the Inactive list. Their details and event history will be kept, and you can reactivate them later.</p><p id="gesDeleteStatus" role="status"></p><button class="danger" id="gesConfirmDelete">Delete Player</button> <button class="soft" id="gesCancelDelete">Cancel</button>`);
    $('#gesCancelDelete').onclick=()=>gesPlayerDetails(id);
    $('#gesConfirmDelete').onclick=()=>{
      const previous=structuredClone(store.players);
      try {
        if(localStorage.getItem(AWAY_GOLF_WRITER_LEASE_KEY)!==appTabId) throw new Error('A newer app tab is open. Refresh this tab before deleting.');
        store.players = store.players.map(item=>String(item.id)===String(id)?{...item,rosterActive:false}:item);
        save();
        const saved=JSON.parse(localStorage.getItem('golfEventScorer13') || 'null');
        if(!saved || !saved.players.some(item=>String(item.id)===String(id)&&item.rosterActive===false)) throw new Error('The player could not be removed on this device. Please try again.');
        showSide(`<h2>Player removed</h2><p>${esc(p.name)} has been moved to the Inactive list. Their details and history have been kept.</p><button class="soft" id="gesCloseDeleted">Back to Players</button>`);
        $('#gesCloseDeleted').onclick=()=>$('#sidePanel').classList.remove('open');
      }catch(error){store.players=previous;renderPlayersAdmin();$('#gesDeleteStatus').textContent=error.message;}
    };
  }
