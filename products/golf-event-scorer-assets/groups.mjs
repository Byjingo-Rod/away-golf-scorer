import {createGroupApi, validateAccountConfig} from './group-api.mjs';
const $ = id => document.getElementById(id);
let client, api, owner = false, groups = [], selected = '', currentEvents = [], editing = null;
let loadSerial = 0;
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function show(id, visible) { $(id).hidden = !visible; }
function resetPrivate() {
  for (const id of ['owner','groups','approvals','roster','events','eventEditor']) show(id, false);
  for (const id of ['groupSelect','organiserList','playerList','eventList']) $(id).replaceChildren();
  groups = []; selected = ''; currentEvents = []; editing = null;
}
function entry(text) { const node = document.createElement('div'); node.className = 'entry'; node.textContent = text; return node; }
function button(parent, text, handler) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', () => action(handler)); parent.append(b); }
async function action(fn) {
  const buttons = [...document.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
  try { await fn(); } catch (e) { message(e.message || 'Unable to save. Please refresh and try again.', true); }
  finally { buttons.forEach(b => b.disabled = false); }
}
function bindForm(id, fn) { $(id).addEventListener('submit', e => { e.preventDefault(); action(fn); }); }
async function refresh() {
  const serial = ++loadSerial; resetPrivate();
  const {data, error} = await client.auth.getUser(); if (error) {
    show('login',true); show('account',false); message('Sign in to access your group.'); return;
  }
  if (serial !== loadSerial) return;
  const user = data.user;
  if (!user || user.is_anonymous) { show('login',true); show('account',false); message('Sign in to access your group.'); return; }
  show('login',false); show('account',true); $('signedInAs').textContent = `Signed in as ${user.email}`;
  const nextOwner = await api.isOwner(), nextGroups = await api.groups();
  if (serial !== loadSerial) return;
  owner = nextOwner; groups = nextGroups;
  show('owner',owner); show('groups',groups.length > 0);
  if (!groups.length) { message(owner ? 'Create your first group below.' : 'Your account is ready. The owner needs to approve your group access.'); return; }
  groups.forEach(g => {const option = document.createElement('option'); option.value = g.id; option.textContent = g.name; $('groupSelect').append(option);});
  selected = groups[0].id; await loadGroup();
}
async function loadGroup() {
  const serial = ++loadSerial, group = groups.find(g => g.id === selected);
  show('eventEditor',false); editing = null;
  for (const id of ['playerList','eventList','organiserList']) $(id).replaceChildren();
  if (!group) return;
  const [players, events, organisers] = await Promise.all([api.players(group.id), api.events(group.id), owner ? api.organisers(group.id) : []]);
  if (serial !== loadSerial) return;
  currentEvents = events; $('groupStatus').textContent = group.enabled ? 'Group access active' : 'Group access suspended — records retained';
  show('approvals',owner); show('roster',true); show('events',true);
  players.forEach(p => {
    const li = document.createElement('li'); li.textContent = `${p.name}${p.ga === null ? '' : ` · GA ${p.ga < 0 ? '+' + Math.abs(p.ga) : p.ga}`}${p.active ? '' : ' · inactive'}`; $('playerList').append(li);
  });
  events.slice().reverse().forEach(event => {
    const row = entry(`${event.name} · ${event.event_date} · ${event.field_size} players · ${event.status}`);
    if (event.status === 'draft') button(row, 'Edit draft', () => {
      editing = structuredClone(event); $('editName').value = event.name; $('editDate').value = event.event_date;
      $('editSize').value = event.field_size; $('editNotes').value = event.planning_data.notes || '';
      show('eventEditor',true); $('editName').focus();
    });
    else { const details = document.createElement('pre'); details.textContent = JSON.stringify(event.results_data, null, 2); row.append(details); }
    $('eventList').append(row);
  });
  organisers.forEach(m => {
    const row = entry(`${m.email} · ${m.enabled ? 'active' : 'suspended'}`);
    button(row, m.enabled ? 'Suspend organiser' : 'Restore organiser', async () => { await api.setOrganiserEnabled(group.id,m.user_id,!m.enabled); await loadGroup(); });
    $('organiserList').append(row);
  });
  $('toggleGroup').textContent = group.enabled ? 'Suspend group access' : 'Restore group access';
  message(`Loaded ${group.name}.`);
}
async function initialise() {
  try {
    const config = validateAccountConfig(window.GES_ACCOUNT_CONFIG);
    client = window.supabase.createClient(config.url,config.key,{auth:{storageKey:'golfEventScorerGroupAuth',persistSession:true,detectSessionInUrl:true,autoRefreshToken:true}});
    api = createGroupApi(client);
  } catch(e) { message(e.message + ' This development build is not ready for online group use.',true); return; }
  bindForm('signIn', async () => {
    const {error} = await client.auth.signInWithOtp({email:$('email').value.trim(),options:{emailRedirectTo:new URL('groups.html',location.href).href}});
    if (error) throw error; message('Check your email for the sign-in link. Signing in does not grant organiser permission.');
  });
  bindForm('createGroup', async () => {await api.createGroup($('groupName').value); $('createGroup').reset(); await refresh();});
  bindForm('approve', async () => {await api.approveOrganiser(selected,$('organiserEmail').value); $('approve').reset(); await loadGroup();});
  bindForm('addPlayer', async () => {await api.savePlayer(selected,$('playerName').value,$('playerGa').value === '' ? null : Number($('playerGa').value)); $('addPlayer').reset(); await loadGroup();});
  bindForm('createEvent', async () => {await api.createEvent(selected,$('eventName').value,$('eventDate').value,Number($('fieldSize').value)); $('eventName').value = ''; await loadGroup();});
  bindForm('saveEvent', async () => {
    if (!editing) throw new Error('Choose an event first.');
    await api.saveEvent({...editing,name:$('editName').value,event_date:$('editDate').value,field_size:Number($('editSize').value),planning_data:{...editing.planning_data,notes:$('editNotes').value}});
    await loadGroup(); message('Event draft saved to your group.');
  });
  $('cancelEdit').onclick = () => {show('eventEditor',false); editing=null;};
  $('refresh').onclick = () => action(refresh);
  $('signOut').onclick = () => action(async () => {++loadSerial; resetPrivate(); const {error} = await client.auth.signOut(); if (error) throw error; await refresh();});
  $('groupSelect').onchange = () => action(async () => {selected=$('groupSelect').value; await loadGroup();});
  $('toggleGroup').onclick = () => action(async () => {const group=groups.find(g=>g.id===selected); await api.setGroupEnabled(selected,!group.enabled); await refresh();});
  client.auth.onAuthStateChange(event => {if(event==='SIGNED_OUT') {++loadSerial; resetPrivate(); show('account',false); show('login',true);} if(event==='SIGNED_IN') setTimeout(()=>action(refresh),0);});
  await refresh();
}
initialise().catch(e => message(e.message,true));
