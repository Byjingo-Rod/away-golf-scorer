export function validateAccountConfig(config) {
  if (!config) throw new Error('Group accounts have not been connected yet.');
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/' || url.username || url.password || url.search || url.hash)
    throw new Error('Use the HTTPS address of the new Supabase project.');
  if (url.hostname === 'qlxcpsbyfhgatujrqxkd.supabase.co')
    throw new Error('Golf Event Scorer must use its own database.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey || ''))
    throw new Error('Use a publishable key, not a secret or service-role key.');
  return {url: url.origin, key: config.publishableKey};
}

export function createGroupApi(client) {
  async function rpc(name, args = {}) {
    const {data, error} = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  async function rows(table, groupId, sort) {
    let query = client.from(table).select('*');
    if (groupId) query = query.eq('group_id', groupId);
    const {data, error} = await query.order(sort);
    if (error) throw error;
    return data;
  }
  return {
    isOwner: () => rpc('ges_is_owner'),
    groups: () => rows('ges_groups', null, 'name'),
    players: id => rows('ges_players', id, 'name'),
    events: id => rows('ges_events', id, 'event_date'),
    organisers: id => rpc('ges_list_organisers', {p_group_id: id}),
    createGroup: name => rpc('ges_create_group', {p_name: name}),
    setGroupEnabled: (id, enabled) => rpc('ges_set_group_enabled', {p_group_id: id, p_enabled: enabled}),
    approveOrganiser: (id, email) => rpc('ges_approve_organiser', {p_group_id: id, p_email: email}),
    setOrganiserEnabled: (group, user, enabled) => rpc('ges_set_organiser_enabled', {p_group_id: group, p_user_id: user, p_enabled: enabled}),
    savePlayer: (group, name, ga, player = null) => rpc('ges_save_player', {
      p_group_id: group, p_name: name, p_ga: ga, p_player_id: player?.id ?? null,
      p_expected_revision: player?.revision ?? null, p_active: player?.active ?? true,
    }),
    createEvent: (group, name, date, size) => rpc('ges_create_event', {
      p_group_id: group, p_name: name, p_date: date, p_field_size: size,
    }),
    saveEvent: event => rpc('ges_save_event', {
      p_event_id: event.id, p_expected_revision: event.revision, p_name: event.name,
      p_date: event.event_date, p_field_size: event.field_size, p_planning_data: event.planning_data,
    }),
  };
}
