  async function gesLinkedWorkspace() {
    if (window.GES_PLANNER_CONTEXT) return window.GES_PLANNER_CONTEXT;
    if (!store.cloud?.eventId || store.cloud.role !== 'organiser') throw Error('Open your event through Groups & Organiser Accounts to see its approved group lists.');
    const {createGroupApi, validateAccountConfig} = await import('./group-api.mjs');
    const cfg = validateAccountConfig(window.GES_ACCOUNT_CONFIG);
    const client = window.supabase.createClient(cfg.url, cfg.key, {auth:{storageKey:'golfEventScorerGroupAuth',persistSession:true,detectSessionInUrl:false}});
    const api = createGroupApi(client);
    const published = (await AwayCloud.loadRecentOwnedEvents(100)).find(e => String(e.id) === String(store.cloud.eventId));
    if (!published) throw Error('Sign in to your organiser account and reopen this event from your group.');
    const draft = (await api.events()).find(e => String(e.id) === String(published.draft_id));
    const group = (await api.groups()).find(g => String(g.id) === String(draft?.group_id));
    if (!group) throw Error('The event’s group could not be identified. Open it from Groups & Organiser Accounts.');
    const [players, courses] = await Promise.all([api.players(group.id),api.courses()]);
    return {group,players,courses:courses.filter(c => group.requested_course_ids.includes(c.id))};
  }
  async function gesRenderLinkedList(kind) {
    const host = document.getElementById(kind === 'courses' ? 'coursesPage' : 'playersPage');
    const eventId = store.cloud?.eventId;
    host.innerHTML = '<p class="gesListMessage">Loading online group list…</p>';
    try {
      const ctx = await gesLinkedWorkspace();
      if (eventId !== store.cloud?.eventId) return;
      const groupLink = 'groups.html?group=' + encodeURIComponent(ctx.group.id);
      if (kind === 'courses') {
        host.innerHTML = `<h2>Approved Golf Courses</h2><p class="gesListMessage">${esc(ctx.group.name)}</p><div class="gesLinkedRows">${ctx.courses.map(c => `<div class="gesLinkedRow"><b>${esc(c.name)}</b><button class="soft" data-gescard="${esc(c.id)}">View Scorecards</button></div>`).join('')}</div><a class="productGroupsLink" href="${groupLink}#setup">Add Golf Courses — request approval</a><a class="productGroupsLink" href="courses.html?group=${encodeURIComponent(ctx.group.id)}">Owner: Review Accepted Course Details</a>`;
        host.querySelectorAll('[data-gescard]').forEach(button => button.onclick = () => {
          const c = ctx.courses.find(c => c.id === button.dataset.gescard);
          gesShowAcceptedCard({...structuredClone(c.details),id:c.id,name:c.name});
        });
      } else {
        const players = [...new Map(ctx.players.map(p => [p.id,p])).values()].filter(p => p.active);
        host.innerHTML = `<h2>Group Players</h2><p class="gesListMessage">${esc(ctx.group.name)} · ${players.length} / ${ctx.group.golfer_count} approved active golfers</p><div class="gesLinkedRows">${players.map(p => `<div class="gesLinkedRow"><b>${esc(p.name)}</b></div>`).join('')}</div><a class="productGroupsLink" href="roster.html?group=${encodeURIComponent(ctx.group.id)}">Manage Group Players &amp; Details</a>`;
      }
    } catch (error) {
      host.innerHTML = `<p class="gesListMessage">${esc(error.message)}</p><a class="productGroupsLink" href="groups.html">Groups &amp; Organiser Accounts</a>`;
    }
  }
