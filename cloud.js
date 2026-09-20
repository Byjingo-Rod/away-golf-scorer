(() => {
  "use strict";

  const SUPABASE_URL = "https://qlxcpsbyfhgatujrqxkd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_fzOrPzsGh48ABTEoob5O0Q_gpdZTEmI";
  const OWNER_REDIRECT_URL = "https://byjingo-rod.github.io/away-golf-scorer/";
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  let initPromise = null;

  async function ensureSignedIn() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const current = await client.auth.getSession();
      if (current.error) throw current.error;
      if (current.data.session) return current.data.session;
      const signed = await client.auth.signInAnonymously();
      if (signed.error) throw signed.error;
      return signed.data.session;
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
    return initPromise;
  }

  async function ownerAccount() {
    const session = await ensureSignedIn();
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    const user = data.user || session.user;
    const email = String(user?.email || "");
    const confirmed = Boolean(user?.email_confirmed_at);
    return {
      id: String(user?.id || ""),
      email,
      confirmed,
      pending: Boolean(email && !confirmed),
      permanent: Boolean(user && !user.is_anonymous && email && confirmed),
      anonymous: Boolean(user?.is_anonymous),
    };
  }

  async function protectOwnerAccount(email) {
    const address = String(email || "").trim().toLowerCase();
    if (!address || !address.includes("@"))
      throw new Error("Enter a valid email address.");
    const current = await ownerAccount();
    if (current.permanent)
      throw new Error("This organiser already has a permanent sign-in.");
    if (current.pending)
      return resendOwnerVerification(current.email);
    const { data, error } = await client.auth.updateUser(
      { email: address },
      { emailRedirectTo: OWNER_REDIRECT_URL },
    );
    if (error) throw error;
    return data;
  }

  async function resendOwnerVerification(email) {
    const address = String(email || "").trim().toLowerCase();
    if (!address || !address.includes("@"))
      throw new Error("Enter a valid email address.");
    const { data, error } = await client.auth.resend({
      type: "email_change",
      email: address,
      options: { emailRedirectTo: OWNER_REDIRECT_URL },
    });
    if (error) throw error;
    return data;
  }

  async function sendOwnerSignInLink(email) {
    const address = String(email || "").trim().toLowerCase();
    if (!address || !address.includes("@"))
      throw new Error("Enter a valid email address.");
    const { data, error } = await client.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: OWNER_REDIRECT_URL,
      },
    });
    if (error) throw error;
    return data;
  }

  async function createEvent(name, eventData, players) {
    await ensureSignedIn();
    const { data, error } = await client.rpc("create_away_event", {
      p_name: name,
      p_event_data: eventData,
      p_players: players,
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }

  async function updateEvent(eventId, eventData, status) {
    await ensureSignedIn();
    const { data, error } = await client
      .from("away_events")
      .update({
        name: eventData?.event?.name || "Away Golf Event",
        event_data: eventData,
        status,
      })
      .eq("id", eventId)
      .select("id,join_code,revision,updated_at")
      .single();
    if (error) throw error;
    return data;
  }

  async function syncEventPlayers(eventId, players) {
    await ensureSignedIn();
    const wanted = (players || []).map((player) => ({
      event_id: String(eventId),
      player_id: String(player.id),
      display_name: String(player.name || "Player"),
      player_data: Object.fromEntries(
        Object.entries(player).filter(([key]) => key !== "id" && key !== "name"),
      ),
    }));
    const { data: existing, error: readError } = await client
      .from("away_event_players")
      .select("player_id")
      .eq("event_id", String(eventId));
    if (readError) throw readError;
    if (wanted.length) {
      const { error: upsertError } = await client
        .from("away_event_players")
        .upsert(wanted, { onConflict: "event_id,player_id" });
      if (upsertError) throw upsertError;
    }
    const wantedIds = new Set(wanted.map((player) => player.player_id));
    for (const player of existing || []) {
      if (wantedIds.has(String(player.player_id))) continue;
      const { error: deleteError } = await client
        .from("away_event_players")
        .delete()
        .eq("event_id", String(eventId))
        .eq("player_id", String(player.player_id));
      if (deleteError) throw deleteError;
    }
  }

  async function invitation(code) {
    await ensureSignedIn();
    const { data, error } = await client.rpc("away_event_invitation", {
      p_join_code: String(code || "")
        .trim()
        .toUpperCase(),
    });
    if (error) throw error;
    return data || [];
  }

  async function joinEvent(code, playerId) {
    await ensureSignedIn();
    const { data, error } = await client.rpc("join_away_event", {
      p_join_code: String(code || "")
        .trim()
        .toUpperCase(),
      p_player_id: String(playerId),
    });
    if (error) throw error;
    return data;
  }

  async function spectateEvent(code) {
    await ensureSignedIn();
    const { data, error } = await client.rpc("spectate_away_event", {
      p_join_code: String(code || "").trim().toUpperCase(),
    });
    if (error) throw error;
    if (!data) throw new Error("No current event was found for that code.");
    return data;
  }

  async function loadEvent(eventId) {
    await ensureSignedIn();
    const [eventResult, playersResult, scoresResult, spectatorResult] = await Promise.all([
      client
        .from("away_events")
        .select("id,join_code,name,status,event_data,revision,updated_at")
        .eq("id", eventId)
        .single(),
      client
        .from("away_event_players")
        .select("player_id,display_name,player_data,member_user_id,joined_at")
        .eq("event_id", eventId),
      client
        .from("away_round_scores")
        .select("day,scorer_player_id,score_data,revision,updated_at")
        .eq("event_id", eventId),
      client.rpc("away_event_spectator_count", { p_event_id: eventId }),
    ]);
    if (eventResult.error) throw eventResult.error;
    if (playersResult.error) throw playersResult.error;
    if (scoresResult.error) throw scoresResult.error;
    return {
      event: eventResult.data,
      players: playersResult.data || [],
      scores: scoresResult.data || [],
      spectatorCount: spectatorResult.error ? 0 : +(spectatorResult.data || 0),
    };
  }

  async function saveRound(eventId, day, playerId, scoreData) {
    await ensureSignedIn();
    const { data, error } = await client
      .from("away_round_scores")
      .upsert(
        {
          event_id: eventId,
          day: +day,
          scorer_player_id: String(playerId),
          score_data: scoreData,
        },
        { onConflict: "event_id,day,scorer_player_id" },
      )
      .select("revision,updated_at")
      .single();
    if (error) throw error;
    return data;
  }

  async function releasePlayer(eventId, playerId) {
    await ensureSignedIn();
    const { data, error } = await client
      .from("away_event_players")
      .update({ member_user_id: null, joined_at: null })
      .eq("event_id", eventId)
      .eq("player_id", String(playerId))
      .select("player_id,display_name,joined_at")
      .single();
    if (error) throw error;
    return data;
  }

  async function saveWorkspace(workspaceData) {
    const session = await ensureSignedIn();
    const { data, error } = await client
      .from("away_organiser_workspaces")
      .upsert(
        {
          owner_id: session.user.id,
          workspace_data: workspaceData,
        },
        { onConflict: "owner_id" },
      )
      .select("revision,updated_at")
      .single();
    if (error) throw error;
    return data;
  }

  async function loadWorkspace() {
    const session = await ensureSignedIn();
    const { data, error } = await client
      .from("away_organiser_workspaces")
      .select("workspace_data,revision,updated_at")
      .eq("owner_id", session.user.id)
      .maybeSingle();
    if (error) throw error;
    return data?.workspace_data || null;
  }

  async function loadLatestOwnedEvent() {
    await ensureSignedIn();
    const { data, error } = await client
      .from("away_events")
      .select("id,join_code,name,status,updated_at")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function loadRecentOwnedEvents(limit = 5) {
    await ensureSignedIn();
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 5));
    const { data, error } = await client
      .from("away_events")
      .select("id,join_code,name,status,updated_at")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(safeLimit);
    if (error) throw error;
    return data || [];
  }

  async function createOrganiserKey(eventId) {
    await ensureSignedIn();
    const { data, error } = await client.rpc("create_away_organiser_key", {
      p_event_id: eventId,
    });
    if (error) throw error;
    return String(data || "").toUpperCase();
  }

  async function claimOrganiserAccess(joinCode, accessCode) {
    await ensureSignedIn();
    const { data, error } = await client.rpc("claim_away_organiser_access", {
      p_join_code: String(joinCode || "").toUpperCase(),
      p_access_code: String(accessCode || "").toUpperCase(),
    });
    if (error) throw error;
    return String(data || "");
  }

  async function createGuestOrganiserKey(eventId) {
    await ensureSignedIn();
    const { data, error } = await client.rpc("create_away_guest_organiser_key", {
      p_event_id: String(eventId),
    });
    if (error) throw error;
    return String(data || "").toUpperCase();
  }

  async function claimGuestOrganiserAccess(joinCode, accessCode) {
    await ensureSignedIn();
    const { data, error } = await client.rpc("claim_away_guest_organiser_access", {
      p_join_code: String(joinCode || "").toUpperCase(),
      p_access_code: String(accessCode || "").toUpperCase(),
    });
    if (error) throw error;
    return String(data || "");
  }

  async function revokeGuestOrganiser(eventId) {
    await ensureSignedIn();
    const { data, error } = await client.rpc("revoke_away_guest_organiser", {
      p_event_id: String(eventId),
    });
    if (error) throw error;
    return Boolean(data);
  }

  async function guestOrganiserActive(eventId) {
    await ensureSignedIn();
    const { data, error } = await client.rpc("away_guest_organiser_active", {
      p_event_id: String(eventId),
    });
    if (error) throw error;
    return Boolean(data);
  }

  async function archiveAllOwnedEvents() {
    const session = await ensureSignedIn();
    const { data, error } = await client
      .from("away_events")
      .update({ status: "archived" })
      .eq("organiser_id", session.user.id)
      .neq("status", "archived")
      .select("id,name,join_code");
    if (error) throw error;
    return data || [];
  }

  async function archiveEvent(eventId) {
    await ensureSignedIn();
    const { data, error } = await client
      .from("away_events")
      .update({ status: "archived" })
      .eq("id", String(eventId))
      .select("id,name,join_code")
      .single();
    if (error) throw error;
    return data;
  }

  function subscribe(eventId, onChange) {
    return client
      .channel("away-event-" + eventId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "away_events",
          filter: `id=eq.${eventId}`,
        },
        onChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "away_event_players",
          filter: `event_id=eq.${eventId}`,
        },
        onChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "away_round_scores",
          filter: `event_id=eq.${eventId}`,
        },
        onChange,
      )
      .subscribe();
  }

  window.AwayCloud = {
    client,
    ensureSignedIn,
    ownerAccount,
    protectOwnerAccount,
    resendOwnerVerification,
    sendOwnerSignInLink,
    createEvent,
    updateEvent,
    syncEventPlayers,
    invitation,
    joinEvent,
    spectateEvent,
    loadEvent,
    saveRound,
    releasePlayer,
    saveWorkspace,
    loadWorkspace,
    loadLatestOwnedEvent,
    loadRecentOwnedEvents,
    archiveAllOwnedEvents,
    archiveEvent,
    createOrganiserKey,
    claimOrganiserAccess,
    createGuestOrganiserKey,
    claimGuestOrganiserAccess,
    revokeGuestOrganiser,
    guestOrganiserActive,
    subscribe,
  };
})();
