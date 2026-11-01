(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)],
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (m) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[m],
      );
  const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const inactiveNames = new Set(["Denis Lenard", "John Herbert", "Rolly Nice"]);
  const NO_PARTNER_ID = "system-no-partner";
  const NO_PARTNER = {
    id: NO_PARTNER_ID,
    name: "No Partner",
    golfLink: "",
    ga: "",
    rosterActive: true,
    system: true,
  };
  const ORGANISER_LIVE_KEY = "awayGolfOrganiserLiveV1";
  function rememberedOrganiserEvent() {
    try {
      return JSON.parse(localStorage.getItem(ORGANISER_LIVE_KEY) || "null");
    } catch (_) {
      return null;
    }
  }
  function rememberOrganiserEvent(eventId, joinCode) {
    localStorage.setItem(
      ORGANISER_LIVE_KEY,
      JSON.stringify({
        eventId: String(eventId),
        joinCode: String(joinCode || "").toUpperCase(),
      }),
    );
  }
  function forgetOrganiserEvent() {
    localStorage.removeItem(ORGANISER_LIVE_KEY);
  }
  async function rememberOrganiserWorkspace(eventId, joinCode) {
    rememberOrganiserEvent(eventId, joinCode);
    try {
      await AwayCloud.saveWorkspace({
        activePublishedEvent: {
          eventId: String(eventId),
          joinCode: String(joinCode || "").toUpperCase(),
        },
      });
    } catch (_) {}
  }
  const RECENT_PUBLISHED_KEY = "awayGolfRecentPublishedV1";
  function recentPublishedEvents() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_PUBLISHED_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }
  function rememberPublishedEvent(item) {
    const event = {
      eventId: String(item.eventId || item.id),
      joinCode: String(item.joinCode || item.join_code || "").toUpperCase(),
      name: String(item.name || "Away Golf Event"),
      updatedAt: item.updatedAt || item.updated_at || new Date().toISOString(),
    };
    const list = [
      event,
      ...recentPublishedEvents().filter(
        (x) => String(x.eventId) !== event.eventId,
      ),
    ].slice(0, 5);
    localStorage.setItem(RECENT_PUBLISHED_KEY, JSON.stringify(list));
  }
  function forgetPublishedEvent(eventId) {
    const id = String(eventId || "");
    localStorage.setItem(
      RECENT_PUBLISHED_KEY,
      JSON.stringify(
        recentPublishedEvents().filter((x) => String(x.eventId) !== id),
      ),
    );
  }
  let roundWakeLock = null,
    roundWakeLockActive = false,
    scoringOpenTimer = null,
    ownerAccountState = null;
  let waitingAppWorker = null,
    scorecardOpenedThisPage = false,
    controllerChangedDuringScorecard = false,
    reloadingForAppUpdate = false;
  function activeScorecardSession() {
    return scorecardOpenedThisPage &&
      ["scoring", "verify", "fullCardEntry", "finalEntry"].includes(
        store.event?.playerRoundMode,
      );
  }
  function showPendingAppUpdate() {
    const indicator = $("#updateHeader");
    if (!indicator) return;
    const organiser = !isPlayerDevice() && !isSpectatorDevice();
    indicator.hidden = !organiser || (!waitingAppWorker && !controllerChangedDuringScorecard);
  }
  function activatePendingAppUpdate() {
    if (activeScorecardSession()) {
      showPendingAppUpdate();
      return false;
    }
    if (controllerChangedDuringScorecard) {
      controllerChangedDuringScorecard = false;
      reloadingForAppUpdate = true;
      location.reload();
      return true;
    }
    if (!waitingAppWorker) return false;
    const worker = waitingAppWorker;
    waitingAppWorker = null;
    worker.postMessage({ type: "ACTIVATE_UPDATE" });
    showPendingAppUpdate();
    return true;
  }
  function beginScorecardUpdateProtection() {
    scorecardOpenedThisPage = true;
    showPendingAppUpdate();
  }
  function endScorecardUpdateProtection() {
    scorecardOpenedThisPage = false;
    showPendingAppUpdate();
    activatePendingAppUpdate();
  }
  function watchForAppUpdate(registration) {
    const updateReady = (worker) => {
      if (!worker || !navigator.serviceWorker.controller) return;
      waitingAppWorker = worker;
      showPendingAppUpdate();
      activatePendingAppUpdate();
    };
    updateReady(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed")
          updateReady(registration.waiting || installing);
      });
    });
  }
  function updateWakeIndicator() {
    const el = $("#wakeHeader");
    if (!el) return;
    const active =
      isPlayerDevice() &&
      ["scoring", "verify"].includes(store.event?.playerRoundMode);
    el.classList.toggle("active", active);
    el.textContent = !("wakeLock" in navigator)
      ? "Use screen-lock setting"
      : roundWakeLockActive
        ? "Screen awake âœ“"
        : "Keeping screen awakeâ€¦";
  }
  async function requestRoundWakeLock() {
    if (
      !("wakeLock" in navigator) ||
      !["scoring", "verify"].includes(store.event?.playerRoundMode) ||
      document.visibilityState !== "visible"
    )
      return false;
    try {
      if (!roundWakeLock || roundWakeLock.released) {
        roundWakeLock = await navigator.wakeLock.request("screen");
        roundWakeLock.addEventListener("release", () => {
          roundWakeLockActive = false;
          updateWakeIndicator();
        });
      }
      roundWakeLockActive = true;
      updateWakeIndicator();
      return true;
    } catch (_) {
      roundWakeLock = null;
      roundWakeLockActive = false;
      updateWakeIndicator();
      return false;
    }
  }
  async function releaseRoundWakeLock() {
    try {
      if (roundWakeLock && !roundWakeLock.released)
        await roundWakeLock.release();
    } catch (_) {}
    roundWakeLock = null;
    roundWakeLockActive = false;
  }
  const renewRoundWakeLock = () => {
    if (
      document.visibilityState === "visible" &&
      ["scoring", "verify"].includes(store.event?.playerRoundMode)
    )
      requestRoundWakeLock();
  };
  document.addEventListener("visibilitychange", renewRoundWakeLock);
  window.addEventListener("focus", renewRoundWakeLock);
  window.addEventListener("pageshow", renewRoundWakeLock);
  document.addEventListener("pointerdown", renewRoundWakeLock, {
    passive: true,
  });
  const competitionNames = {
    single: "Single Stableford",
    combined: "Single Stableford",
    stroke: "Stroke",
    fourball: "4BBB Stableford",
    teamPutts: "Putting Competition",
    best3of4: "Best 3 of 4 Stableford",
    ambrose: "Ambrose",
    yellowBall: "Yellow Ball",
    par3: "Par 3 Competition",
    ntp: "Nearest the Pin",
    scratch: "Scratch",
    eclectic: "Eclectic",
    capTeams: "Black Cap â€“ White Cap",
  };
  const SCORING_METHODS = {
    holeByHole: "On course by players and confirmed by Markers hole-by-hole",
    fullCardPlayer: "Strokes/hole entered by Player",
    finalStableford: "Insert Final Score â€” Stableford",
    finalGross: "Insert Final Score â€” Gross Strokes",
  };
  function dayScoringMethod(day, event = store.event) {
    return event?.scoringMethods?.["day" + day] || "holeByHole";
  }
  function finalScoreEntry(day, playerId, event = store.event) {
    return event?.finalScores?.["day" + day]?.[String(playerId)] || event?.scoring?.["day"+day]?.[String(playerId)]?._finalScore || null;
  }
  function finalScoreComplete(day, playerId, event = store.event) {
    const entry = finalScoreEntry(day, playerId, event);
    return Boolean(entry && Number.isFinite(+entry.total) && entry.confirmedAt);
  }
  function finalScoreCompetitionAllowed(id, method) {
    if (["holeByHole", "fullCardPlayer"].includes(method)) return true;
    // A final total has no hole-by-hole detail. Stableford totals can support
    // individual/event totals and the Black Cap â€“ White Cap team aggregate.
    // Gross totals can support Stroke and Scratch, but not countbacks.
    if (method === "finalStableford") return ["single", "combined", "capTeams"].includes(id);
    if (method === "finalGross") return ["stroke", "scratch"].includes(id);
    return false;
  }
  function competitionNeedsEverySelectedDay(id, event = store.event) {
    return id === "capTeams" || id === "eclectic" ||
      (id === "scratch" && ["aggregate", "bestAggregate"].includes(event?.scratchFormat)) ||
      (id === "par3" && ["overallPlayers", "overallPairs"].includes(par3Mode(event)));
  }
  function competitionCompatibleDays(id, event = store.event) {
    return eventDays(event).filter(day => finalScoreCompetitionAllowed(id, dayScoringMethod(day, event)));
  }
  function incompatibleDayCompetitions(day, event = store.event, competitions = event?.competitions || []) {
    const method = dayScoringMethod(day, event);
    return competitions.filter(id => competitionDays(id, event).includes(+day) && !finalScoreCompetitionAllowed(id, method));
  }
  function eventDays(event = store.event) {
    return Array.from({ length: Math.max(1, Math.min(7, Math.trunc(+event?.days || 1))) }, (_, i) => i + 1);
  }
  function par3Mode(event = store.event) {
    const mode = event?.par3Mode || (event?.par3Format === "aggregate" ? "overallPairs" : "dailyPairs");
    return +event?.days === 1 && ["overallPlayers", "overallPairs"].includes(mode) ? "dailyPairs" : mode;
  }
  function capRoster(event = store.event) {
    return [...new Set(eventDays(event).flatMap(day => event.dayFields?.["day" + day] || event.confirmed || []).map(id=>sharedPositionId(id,event)))].map(String).filter(id => id !== NO_PARTNER_ID);
  }
  function balanceCapTeams(ids, event = store.event) {
    ids = [...new Set(ids.map(String))].filter(id => id !== NO_PARTNER_ID);
    const values = ids.map(id => eventGaHandicap(id, event));
    if (values.some(v => v === "" || v == null || !Number.isFinite(+v))) return null;
    const donor = ids.length % 2 ? Math.floor(Math.random() * ids.length) : -1, virtualGa = donor >= 0 ? +values[donor] : 0,
      size = Math.floor(ids.length / 2), total = values.reduce((n,v) => n + +v, 0) + virtualGa;
    let best = [], difference = Infinity;
    if (ids.length <= 20) {
      const search = (start, selected, sum) => {
        if (selected.length === size) {
          const gap = Math.abs(total - 2 * sum);
          if (gap < difference - 0.000001) { difference = gap; best = [...selected]; }
          return;
        }
        for (let i = start; i <= ids.length - (size - selected.length); i++) { if (i !== donor) search(i + 1, [...selected, i], sum + +values[i]); }
      };
      search(0, [], virtualGa);
    } else {
      const ranked = ids.map((id,i) => i).filter(i => i !== donor).sort((a,b) => +values[b] - +values[a]);
      const teams = [[], donor >= 0 ? [donor] : []], sums = [virtualGa, virtualGa], sizes = [size, ids.length - size];
      ranked.forEach(i => { const t = teams[0].length >= sizes[0] ? 1 : teams[1].length >= sizes[1] ? 0 : sums[0] <= sums[1] ? 0 : 1; teams[t].push(i); sums[t] += +values[i]; });
      let improved = true;
      while (improved) {
        improved = false;
        for (let a = 0; a < teams[0].length; a++) for (let b = 0; b < teams[1].length; b++) {
          if (teams[1][b] === donor) continue;
          const change = +values[teams[1][b]] - +values[teams[0][a]];
          if (Math.abs(sums[0] - sums[1] + 2 * change) < Math.abs(sums[0] - sums[1]) - 0.000001) {
            [teams[0][a], teams[1][b]] = [teams[1][b], teams[0][a]]; sums[0] += change; sums[1] -= change; improved = true;
          }
        }
      }
      best = teams[0];
    }
    const chosen = new Set(best);
    return {black: ids.filter((id,i) => chosen.has(i)), white: ids.filter((id,i) => !chosen.has(i)), ...(donor >= 0 ? {virtualPlayer:ids[donor], virtualTeam:"black"} : {})};
  }
  function capVirtualInfo(teams) {
    if (!teams || Math.abs(teams.black.length - teams.white.length) !== 1) return null;
    const side = teams.black.length < teams.white.length ? "black" : "white", other = side === "black" ? "white" : "black", id = String(teams.virtualPlayer || "");
    return teams.virtualTeam === side && teams[other].map(String).includes(id) && !teams[side].map(String).includes(id) ? {side, id} : null;
  }
  function capRulesText(event = store.event) {
    return "Event players split into two teams that remain fixed for the duration of the event. The lowest score for each team is eliminated each day and the remaining scores aggregated. A resting golfer contributes zero and is treated as a lowest score. The winning team has the highest aggregate Stableford points over the duration of the event. In the event of an odd number of players, a random Virtual Player will be appointed before the event begins and that player will be the Virtual Player for the short team for the duration of the event.";
  }
  function capTeamsLocked(event = store.event) {
    return Boolean(event.locked || event.pastEventReadOnly || eventDays(event).some(day => Object.values(event.scoring?.["day" + day] || {}).some(round => Object.entries(round || {}).some(([hole,rec]) => /^([1-9]|1[0-8])$/.test(hole) && [rec?.self?.gross,rec?.self?.putts,rec?.official?.gross,rec?.official?.putts].some(v => v !== "" && v != null))) || event.manualScorecards?.["day" + day]?.status === "submitted"));
  }
  function ensureCapTeams(event, ids) {
    const saved = event.capTeams, actual = [...(saved?.black || []), ...(saved?.white || [])].map(String);
    if (saved && actual.length === ids.length && new Set(actual).size === ids.length && ids.every(id => actual.includes(String(id)))) {
      if (ids.length % 2 && !capVirtualInfo(saved)) {
        if (capTeamsLocked(event)) return null;
        const side = saved.black.length < saved.white.length ? "black" : "white", other = side === "black" ? "white" : "black";
        saved.virtualTeam = side;
        saved.virtualPlayer = saved[other][Math.floor(Math.random() * saved[other].length)];
      }
      return saved;
    }
    if (capTeamsLocked(event)) return null;
    return event.capTeams = balanceCapTeams(ids, event);
  }
  function swapCapPlayers(event, blackId, whiteId) {
    if (capTeamsLocked(event)) return false;
    const teams = event.capTeams, a = teams?.black.indexOf(String(blackId)), b = teams?.white.indexOf(String(whiteId));
    if (a == null || b == null || a < 0 || b < 0) return false;
    const virtual = capVirtualInfo(teams);
    if (virtual && (String(blackId) === virtual.id || String(whiteId) === virtual.id)) return false;
    [teams.black[a], teams.white[b]] = [teams.white[b], teams.black[a]];
    return true;
  }
  function capTeamsHtml(event, ids, locked = false) {
    locked ||= capTeamsLocked(event);
    const teams = ensureCapTeams(event, ids);
    if (!teams) return `<div class="ntpBox"><b>Black Cap â€“ White Cap</b><p>${locked ? "Cap-team setup is incomplete. Review it before starting a new event; existing scored cap teams cannot be changed." : "Enter a current GA handicap for every selected golfer to balance the cap teams."}</p></div>`;
    const virtual = capVirtualInfo(teams), options = side => teams[side].filter(id => !virtual || String(id) !== virtual.id).map(id => `<option value="${esc(id)}">${esc(player(id)?.name || "Player")}</option>`).join("");
    return `<div class="ntpBox capTeamsEditor"><b>Black Cap â€“ White Cap Â· all ${event.days || 1} ${(event.days || 1) === 1 ? "day" : "days"}</b><p>${esc(capRulesText(event))}</p>${virtual ? `<p class="capVirtualNote"><b>Fixed Virtual Player: ${esc(player(virtual.id)?.name || "Player")}</b> Â· ${virtual.side === "black" ? "Black" : "White"} Cap. Their daily Stableford score is copied from the other cap team. A rest day contributes zero. This golfer stays in the other team and cannot be swapped into the short team.</p>` : ""}<div class="capTeamColumns">${["black", "white"].map(side => { const hasVirtual = virtual?.side === side, members = [...teams[side], ...(hasVirtual ? [virtual.id] : [])]; return `<div><h4>${side === "black" ? "Black" : "White"} Cap Â· ${members.length} players${hasVirtual ? " (including VP)" : ""}</h4><b>GA total: ${members.reduce((n,id) => n + (+eventGaHandicap(id,event) || 0),0).toFixed(1)}</b><ul>${teams[side].map(id => `<li>${esc(player(id)?.name || "Player")} Â· GA ${esc(eventGaHandicap(id,event))}</li>`).join("")}${hasVirtual ? `<li><b>VP: ${esc(player(virtual.id)?.name || "Player")}</b> Â· GA ${esc(eventGaHandicap(virtual.id,event))}</li>` : ""}</ul>${!locked ? `<label>Choose golfer to swap<select id="cap-${side}">${options(side)}</select></label>` : ""}</div>`; }).join("")}</div>${locked ? '<small>Cap teams and the virtual player are fixed once the event is locked or scoring has started.</small>' : '<button type="button" class="soft" id="swapCapPlayers">Swap selected golfers</button> <button type="button" class="soft" id="rebalanceCapTeams">Balance GA totals again</button>'}</div>`;
  }
  function bindCapTeams(event, ids, refresh) {
    const swap = $("#swapCapPlayers"), balance = $("#rebalanceCapTeams");
    if (swap) swap.onclick = () => { if (swapCapPlayers(event, $("#cap-black").value, $("#cap-white").value)) { if (event === store.event) save(); refresh(); } };
    if (balance) balance.onclick = () => { if (capTeamsLocked(event)) return; event.capTeams = balanceCapTeams(ids,event); if (event === store.event) save(); refresh(); };
  }
  function capTeamRows() {
    const event = store.event, teams = event.capTeams;
    if (!teams || ((teams.black.length + teams.white.length) % 2 && !capVirtualInfo(teams))) return [];
    const virtual = capVirtualInfo(teams);
    return ["black", "white"].map(side => {
      const members = [...teams[side], ...(virtual?.side === side ? [virtual.id] : [])], count = Math.max(0, members.length - 1);
      const daily = eventDays(event).map(day => {
        const field = dayFieldIds(day).map(String), playing = members.filter(id => field.includes(sharedActualId(id,day)));
        const rounds = members.map(slot => {
          const id=sharedActualId(slot,day);
          if (!field.includes(String(id))) return 0;
          const final = event?.finalScores?.["day"+day]?.[String(id)] || event?.scoring?.["day"+day]?.[String(id)]?._finalScore;
          if (final?.kind === "stableford" && final.confirmedAt && Number.isFinite(+final.total)) return +final.total;
          const manual = manualPlayerSummary(day,id,"single");
          if (manual && manual.total !== "" && manual.total != null && Number.isFinite(+manual.total)) return +manual.total;
          const scores = leaderboardPlayerPoints(day,id);
          return scores.length === 18 && scores.every(x => x != null) ? leaderSum(scores) : null;
        });
        const complete = count === 0 || rounds.every(x => x != null), total = complete ? rounds.filter(x => x != null).sort((a,b) => b - a).slice(0,count).reduce((n,v) => n + v,0) : null;
        return {day, count, playing:playing.length, size:members.length, total};
      });
      const detail = daily.map(d => `Day ${d.day}: ${d.total == null ? "pending" : d.total + " pts"} (best ${d.count} of ${d.size}${d.playing < d.size ? ` Â· ${d.size - d.playing} resting` : ""})`).join(" Â· ") + (virtual?.side === side ? ` Â· Fixed VP: ${player(virtual.id)?.name || "Player"}` : "");
      const row = leaderRow(side, side === "black" ? "Black Cap" : "White Cap", detail, daily.map(d => d.total), daily.length);
      row.daily = daily;
      return row;
    });
  }
  function eventDate(day, event = store.event) {
    if (event?.dayDates?.["day" + day]) return event.dayDates["day" + day];
    if (!event?.date) return "";
    const date = new Date(event.date + "T12:00:00");
    date.setDate(date.getDate() + day - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function australianDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "");
  }
  function competitionDays(id, event = store.event) {
    const all = eventDays(event);
    if (id === "capTeams" || (id === "scratch" && ["aggregate", "bestAggregate"].includes(event?.scratchFormat)) || (id === "par3" && ["overallPlayers", "overallPairs"].includes(par3Mode(event)))) return all;
    const saved = event?.competitionDays?.[id] ||
      (id === "yellowBall" ? event?.yellowBallDays : null);
    return Array.isArray(saved) ? all.filter(day => saved.map(Number).includes(day)) : all;
  }
  function competitionIsOn(id, day, event = store.event) {
    return (event?.competitions || []).includes(id) && competitionDays(id, event).includes(+day);
  }
  function dailyCompetitionSummary(day, event = store.event) {
    const ids = [...new Set(event?.competitions || [])], items = [], multi = +event?.days > 1;
    for (const id of ids) {
      if (!competitionNames[id] || !competitionDays(id, event).includes(+day)) continue;
      if (id === "single" && ids.includes("combined")) continue;
      if (id === "combined") {
        const format = multi ? event.singleStablefordFormat || "aggregate" : "daily";
        if (format !== "aggregate") items.push({id:"stableford-daily", name:"Single Stableford", aggregate:false});
        if (format !== "daily") items.push({id:"stableford-aggregate", name:"Overall Stableford â€” aggregate round", aggregate:true});
        continue;
      }
      const aggregate = multi && (id === "capTeams" || id === "eclectic" ||
        (id === "par3" && ["overallPlayers", "overallPairs"].includes(par3Mode(event))) ||
        (id === "scratch" && ["aggregate", "bestAggregate"].includes(event.scratchFormat)));
      items.push({id, name:competitionNames[id] + (aggregate ? " â€” aggregate round" : ""), aggregate});
    }
    return items;
  }
  function multiDayCompetitionSummary(event = store.event) {
    const items = [], seen = new Set();
    for (const day of eventDays(event)) {
      for (const item of dailyCompetitionSummary(day, event).filter(entry => entry.aggregate)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push({
          ...item,
          name: item.id === "stableford-aggregate"
            ? "Single Stableford"
            : item.id === "par3"
              ? "Par 3 Event"
              : item.name.replace(" â€” aggregate round", ""),
          detail: item.id === "stableford-aggregate"
            ? `Best ${countingRounds(event)} of ${competitionDays("combined", event).length} rounds count.`
            : "",
        });
      }
    }
    return items;
  }
  function dailyCompetitionChecks(event = store.event) {
    return eventDays(event).map(day => {
      const items = dailyCompetitionSummary(day, event).filter(item => !item.aggregate);
      return {ok:(event.competitions || []).length > 0,
        label:`Day ${day} Daily Competitions: ${items.length}`};
    });
  }
  function countingRounds(event = store.event) {
    const id = (event?.competitions || []).includes("combined") ? "combined" : "single";
    return Math.max(1, Math.min(competitionDays(id, event).length || 1, Math.trunc(+event?.stablefordCountingRounds || competitionDays(id, event).length || 1)));
  }
  function dayTabs(attribute, selected, event = store.event, extraClass = "") {
    return eventDays(event).length > 1 ? `<div class="dayTabs multiDayTabs ${extraClass}" aria-label="Select event day">${eventDays(event).filter(day=>attribute!=="previewday" || !isPlayerDevice() || !(event.sharedPositions && Object.keys(event.sharedPositions).length) || dayFieldIds(day).includes(String(store.cloud?.playerId))).map(day => `<button type="button" data-${attribute}="${day}" class="${+selected === day ? "active" : ""}">Day ${day}</button>`).join("")}</div>` : "";
  }
  function ntpCount(day, event = store.event) {
    // The former two-day default must not add a second NTP on Day 2
    // of a longer trip. Explicit per-day choices always take precedence.
    const legacyCount = day === 1 || +(event?.days || 1) <= 2
      ? event?.["ntpDay" + day + "Count"] : undefined;
    return Math.max(1, Math.min(2, +(event?.ntpCounts?.["day" + day] ?? legacyCount ?? (day === 2 && +event?.days === 2 ? 2 : 1)) || 1));
  }
  const gcCourseName = (name) =>
    String(name || "").replace(/\bGolf Club\b/g, "GC");
  function parsePlayingHandicap(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const plus = text.startsWith("+"),
      number = Number(plus ? text.slice(1) : text);
    if (!Number.isFinite(number)) return null;
    return plus
      ? -Math.min(20, Math.abs(number))
      : Math.max(-20, Math.min(54, number));
  }
  function formatPlayingHandicap(value) {
    const n = Number(value);
    return value === "" || value == null || !Number.isFinite(n)
      ? ""
      : n < 0
        ? `+${Math.abs(n)}`
        : String(n);
  }
  function handicapMagnitude(value) {
    const n = Number(value);
    return value === "" || value == null || !Number.isFinite(n)
      ? ""
      : Math.abs(n);
  }
  function formatGaHandicap(value) {
    const n = Number(value);
    return value === "" || value == null || !Number.isFinite(n)
      ? ""
      : `${n < 0 ? "+" : ""}${Math.abs(n).toFixed(1)}`;
  }
  const EVENT_TEES = ["back", "middle", "front", "tee4", "tee5"];
  const EVENT_TEE_LABELS = { back: "Back", middle: "Middle", front: "Front", tee4: "Tee 4", tee5: "Tee 5" };
  const TEE_MARKER_COLOURS = [
    "Black",
    "Blue",
    "White",
    "Yellow",
    "Green",
    "Red",
    "Pink",
    "Silver",
    "Brown",
    "Gold",
  ];
  const DEFAULT_TEE_MARKER_COLOURS = {
    back: "Blue",
    middle: "White",
    front: "Yellow",
  };
  function teeMarkerColour(tee, courseRecord, category = "men") {
    courseRecord = GolfCourseCategories.data(courseRecord, category);
    const saved = String(courseRecord?.teeDetails?.[tee]?.colour || "").trim();
    return saved || DEFAULT_TEE_MARKER_COLOURS[tee] || EVENT_TEE_LABELS[tee] || "Tee";
  }
  function eventTeeMarkerColour(day, event = store.event, category = "men") {
    const tee = selectedEventTee(day, event, category),
      courseRecord = course(event?.["course" + day]);
    return eventTeeDisplayName(day, tee, event, category, courseRecord);
  }
  function captureEventTeeNames(event = store.event, day = 1, category = "men", courseRecord = null, replace = false) {
    if (!event) return;
    const key = "day" + day,
      source = courseRecord || course(event?.["course" + day], Boolean(event.locked)),
      positions = GolfCourseCategories.positions(GolfCourseCategories.data(source, category));
    event.teeNamesByDayCategory ||= {};
    event.teeNamesByDayCategory[key] ||= {};
    event.teeNamesByDayCategory[key][category] ||= {};
    positions.forEach(tee => {
      const name = teeMarkerColour(tee, source, category);
      if (replace || !event.teeNamesByDayCategory[key][category][tee])
        event.teeNamesByDayCategory[key][category][tee] = name;
    });
  }
  function eventTeeDisplayName(day, tee, event = store.event, category = "men", courseRecord = null) {
    return event?.teeNamesByDayCategory?.["day" + day]?.[category]?.[tee]
      || teeMarkerColour(tee, courseRecord || course(event?.["course" + day]), category);
  }
  function authoritativeMasterCourse(id) {
    const key = String(id), state = store.courseLibrary || {};
    return state.conflicts?.[key]?.data
      || state.bases?.[key]?.data
      || course(id, true);
  }
  function refreshEventCourseSnapshot(event = store.event) {
    if (!event) return;
    const ids = [...new Set(eventDays(event).map(day => String(event["course" + day] || "")).filter(Boolean))];
    const retained = (event.courseSnapshot || []).filter(item => !ids.includes(String(item.id)));
    event.courseSnapshot = [
      ...retained,
      ...ids.map(authoritativeMasterCourse).filter(Boolean).map(item => JSON.parse(JSON.stringify(item))),
    ];
  }
  function courseEventTees(day, event = store.event, category = "men", courseRecord = null) {
    const c = courseRecord || course(event?.["course" + day]), data = GolfCourseCategories.data(c, category);
    return GolfCourseCategories.positions(data).filter(tee => {
      const detail = data?.teeDetails?.[tee] || {}, card = courseScorecard(c, tee, false, category);
      return Boolean(card && card.par?.some(value => String(value ?? "").trim()) && (detail.colour || detail.slope || detail.scratch || detail.par));
    });
  }
  function enabledEventTeesForCategory(event = store.event, day = 1, category = "men") {
    if (!event) return [];
    const available = courseEventTees(day, event, category), key = "day" + day;
    const saved = event.enabledTeesByDayCategory?.[key]?.[category];
    if (Array.isArray(saved)) {
      const planned = saved.filter(tee => EVENT_TEES.includes(tee)).slice(0, 3);
      // Once an event is locked, its saved tee plan is authoritative. A device
      // may not yet have the same category-specific course-card copy, but that
      // must not make the planned Men's or Women's tee choices disappear.
      if (event.locked && planned.length) return planned;
      const valid = saved.filter(tee => available.includes(tee)).slice(0, 3);
      if (valid.length) return valid;
    }
    if (event.locked) {
      const categoryIds = (event.confirmed?.length ? event.confirmed : Object.keys(event.gaCategories || {}))
        .filter(id => String(id) !== NO_PARTNER_ID)
        .filter(id => GolfCourseCategories.category(event, id, day, eventPlayer) === category);
      const inferred = EVENT_TEES.filter(tee => {
        const handicaps = event.teeHandicaps?.[key]?.[tee] || {};
        return categoryIds.length && categoryIds.every(id => {
          const value = handicaps[String(id)];
          return value !== "" && value != null && Number.isFinite(+value);
        });
      }).slice(0, 3);
      if (inferred.length) return inferred;
      const selected = event.teeSelectionByCategory?.[key]?.[category];
      if (EVENT_TEES.includes(selected)) return [selected];
    }
    const legacy = event.enabledTeesByDay?.[key];
    if (category === "men" && Array.isArray(legacy)) {
      const valid = legacy.filter(tee => available.includes(tee)).slice(0, 3);
      if (valid.length) return valid;
    }
    return available.slice(0, 3);
  }
  function eventPlayerCategories(day, event = store.event) {
    const ids = (event?.confirmed?.length ? event.confirmed : Object.keys(event?.gaCategories || {}))
      .filter(id => String(id) !== NO_PARTNER_ID);
    const categories = [...new Set(ids.map(id => GolfCourseCategories.category(event, id, day, eventPlayer)))];
    return categories.length ? categories : ["men"];
  }
  function enabledEventTees(event = store.event, day = 1) {
    const categories = eventPlayerCategories(day, event);
    return [...new Set(categories.flatMap(category => enabledEventTeesForCategory(event, day, category)))];
  }
  function setEventFrontTee(event, day, enabled, scope = "course") {
    event.enabledTeesByDay ||= {};
    const days = +day === 1 && scope === "all"
      ? Array.from({ length: Math.max(1, +event.days || 1) }, (_, i) => i + 1)
      : [+day];
    for (const d of days)
      event.enabledTeesByDay["day" + d] = enabled
        ? ["back", "middle", "front"] : ["back", "middle"];
  }
  function ensureEventTeePlanning(event = store.event) {
    if (!event) return;
    event.dailyHandicaps = event.dailyHandicaps || { day1: {}, day2: {} };
    const initialiseFromLegacy = !event.teePlanningVersion;
    event.teeHandicaps = event.teeHandicaps || { day1: {}, day2: {} };
    event.enabledTeesByDay = event.enabledTeesByDay || {};
    event.enabledTeesByDayCategory = event.enabledTeesByDayCategory || {};
    event.teeSelection = event.teeSelection || {};
    event.teeSelectionByCategory = event.teeSelectionByCategory || {};
    event.teeSelectionFinalised = event.teeSelectionFinalised || {};
    for (let day = 1; day <= (event.days || 1); day++) {
      const key = "day" + day,
        legacy = event.dailyHandicaps[key] || {};
      event.teeHandicaps[key] = event.teeHandicaps[key] || {};
      EVENT_TEES.forEach((tee) => {
        const existing = event.teeHandicaps[key][tee];
        event.teeHandicaps[key][tee] = existing || {};
        if (
          initialiseFromLegacy &&
          !Object.keys(event.teeHandicaps[key][tee]).length
        )
          event.teeHandicaps[key][tee] = { ...legacy };
      });
      const enabled = enabledEventTees(event, day);
      event.enabledTeesByDay[key] = [...enabled];
      event.enabledTeesByDayCategory[key] ||= {};
      event.teeSelectionByCategory[key] ||= {};
      for (const category of ["men", "women"]) {
        const categoryTees = enabledEventTeesForCategory(event, day, category);
        event.enabledTeesByDayCategory[key][category] = [...categoryTees];
        const current = event.teeSelectionByCategory[key][category] || (category === "men" ? event.teeSelection[key] : "");
        event.teeSelectionByCategory[key][category] = categoryTees.includes(current) ? current : categoryTees[0] || "";
      }
      event.teeSelection[key] = enabled.includes(event.teeSelection[key])
        ? event.teeSelection[key]
        : enabled.includes("middle") ? "middle" : enabled[0];
      if (event.teeSelectionFinalised[key] == null)
        event.teeSelectionFinalised[key] = Boolean(event.locked);
      // Daily handicaps must follow the saved tee for each player's category.
      // Copying the whole Men's selected-tee map here used to reintroduce
      // declined men and remove women merely by displaying a locked event.
      const field = Array.isArray(event.dayFields?.[key]) && event.dayFields[key].length
        ? event.dayFields[key]
        : (event.confirmed || []).filter(id => event.dayAvailability?.[String(id)]?.[String(day)] !== false);
      event.dailyHandicaps[key] = Object.fromEntries(
        field.filter(id => String(id) !== NO_PARTNER_ID).map(id => {
          const category = event.gaCategories?.[String(id)] === "women" ? "women" : "men",
            selected = event.teeSelectionByCategory[key][category] || event.teeSelection[key],
            value = event.teeHandicaps[key]?.[selected]?.[String(id)];
          return [String(id), value];
        }),
      );
    }
    event.teePlanningVersion = 1;
  }
  function selectedEventTee(day, event = store.event, category = "men") {
    ensureEventTeePlanning(event);
    return event?.teeSelectionByCategory?.["day" + day]?.[category] || event?.teeSelection?.["day" + day] || "middle";
  }
  function teeHandicapsFor(day, tee, event = store.event) {
    ensureEventTeePlanning(event);
    return event?.teeHandicaps?.["day" + day]?.[tee] || {};
  }
  function ensureEventGaHandicaps(event = store.event) {
    if (!event) return;
    event.gaHandicaps = event.gaHandicaps || {};
    event.gaCategories = event.gaCategories || {};
    event.teeHandicapSources = event.teeHandicapSources || {
      day1: {},
      day2: {},
    };
    for (let day = 1; day <= (event.days || 1); day++) {
      const key = "day" + day;
      event.teeHandicapSources[key] = event.teeHandicapSources[key] || {};
      EVENT_TEES.forEach((tee) => {
        event.teeHandicapSources[key][tee] =
          event.teeHandicapSources[key][tee] || {};
      });
    }
  }
  function eventGaHandicap(id, event = store.event) {
    ensureEventGaHandicaps(event);
    const key = String(id);
    if (Object.prototype.hasOwnProperty.call(event?.gaHandicaps || {}, key))
      return event.gaHandicaps[key];
    const p = player(id);
    return p?.gaUpdatedAt && Number.isFinite(+p.ga) ? +p.ga : "";
  }
  function eventGaCategory(id, event = store.event) {
    ensureEventGaHandicaps(event);
    return event?.gaCategories?.[String(id)] || player(id)?.gaCategory || "men";
  }
  function saveEventGaToPlayerProfiles(ids, event = W.event) {
    ensureEventGaHandicaps(event);
    const updatedAt = new Date().toISOString();
    ids.forEach((id) => {
      const current = player(id),
        p = store.players.find(p=>String(p.id)===String(current?.profileId || id)),
        ga = eventGaHandicap(id, event);
      if (!p || ga === "" || ga == null || !Number.isFinite(+ga)) return;
      if(p.noOfficialHandicap)return;
      p.ga = +ga;
      p.gaCategory = eventGaCategory(id, event);
      p.gaUpdatedAt = updatedAt;
    });
  }
  function teeRatingForDailyHandicap(day, tee, event = store.event, category = "men") {
    const c = course(event?.["course" + day]),
      detail = GolfCourseCategories.data(c, category)?.teeDetails?.[tee] || {},
      cardPars = courseScorecard(c, tee, false, category)?.par || [],
      cardPar = cardPars.length === 18
        ? cardPars.reduce((total, value) => total + (+value || 0), 0)
        : 0,
      slope = +detail.slope,
      scratch = +detail.scratch,
      par = +detail.par || cardPar;
    return {
      courseName: c?.name || `Day ${day} course`,
      teeColour: `${category === "women" ? "Women" : "Men"} Â· ${teeMarkerColour(tee, c, category)}`,
      slope,
      scratch,
      par,
      valid:
        Number.isFinite(slope) && slope >= 55 && slope <= 155 &&
        Number.isFinite(scratch) && scratch > 0 &&
        Number.isFinite(par) && par > 0,
    };
  }
  function roundDailyHandicap(value) {
    return value < 0 ? -Math.round(Math.abs(value)) : Math.round(value);
  }
  function calculateDailyHandicap(ga, rating, category = "men") {
    if (!rating?.valid || !Number.isFinite(+ga)) return null;
    const consistency = category === "women" ? 1.0483 : 0.9986;
    return roundDailyHandicap(
      ((+ga * rating.slope) / 113 + (rating.scratch - rating.par)) *
        0.93 * consistency,
    );
  }
  function applyCalculatedEventHandicaps(event = W.event, categoryFilter = null) {
    ensureEventTeePlanning(event);
    ensureEventGaHandicaps(event);
    const issues = [];
    for (let day = 1; day <= (event.days || 1); day++) {
      const key = "day" + day,
        ids = wizardPlanningPlayers(day).filter((id) => id !== NO_PARTNER_ID);
      const dayCategories = categoryFilter ? [categoryFilter] : eventPlayerCategories(day,event);
      for (const category of dayCategories) for (const tee of enabledEventTeesForCategory(event, day, category)) {
        const map=teeHandicapsFor(day,tee,event), sources=event.teeHandicapSources[key][tee];
        for(const id of ids.filter(id=>eventGaCategory(id,event)===category)){
          const rating=teeRatingForDailyHandicap(day,tee,event,category),ga=eventGaHandicap(id,event),name=player(id)?.name||"Player";
          if(!rating.valid){issues.push(`${rating.courseName} â€” ${rating.teeColour}: enter Slope, Scratch Rating and Par in Course Details.`);continue;}
          if(ga===""||ga==null||!Number.isFinite(+ga)){issues.push(`${name}: enter a GA Handicap.`);continue;}
          map[String(id)]=calculateDailyHandicap(ga,rating,category);sources[String(id)]="calculated";
        }
      }
      eventPlayerCategories(day,event).forEach(category=>selectEventTee(day,selectedEventTee(day,event,category),event,category));
    }
    return [...new Set(issues)];
  }
  function selectEventTee(day, tee, event = store.event, category = "men") {
    ensureEventTeePlanning(event);
    if (!event || !enabledEventTeesForCategory(event, day, category).includes(tee)) return;
    const key = "day" + day;
    event.teeSelectionByCategory ||= {}; event.teeSelectionByCategory[key] ||= {};
    if (event.teeSelectionByCategory[key][category] !== tee) event.scorecardsChecked = false;
    event.teeSelectionByCategory[key][category] = tee;
    if (category === "men") event.teeSelection[key] = tee;
    event.dailyHandicaps[key] = Object.fromEntries(wizardPlanningPlayers(day).filter(id=>String(id)!==NO_PARTNER_ID).map(id=>{
      const playerCategory=eventGaCategory(id,event), playerTee=selectedEventTee(day,event,playerCategory);
      return [String(id),teeHandicapsFor(day,playerTee,event)[String(id)]];
    }));
  }
  function teeSelectionIsFinal(day, event = store.event) {
    ensureEventTeePlanning(event);
    return Boolean(event?.teeSelectionFinalised?.["day" + day]);
  }
  function competitionDisplayName(id) {
    if (id === "teamPutts")
      return `Putting Competition (${store.event?.puttingFormat === "pairs" ? "2 Player" : "4 Player"})`;
    return competitionNames[id] || id;
  }
  function capRewardChoice(benefit = {}) {
    if (Object.prototype.hasOwnProperty.call(benefit,"rewardChoice") && ["", "balls", "prize", "both"].includes(benefit.rewardChoice)) return benefit.rewardChoice;
    const prize = Boolean(benefit.plus || benefit.extra);
    return benefit.balls ? prize ? "both" : "balls" : prize ? "prize" : "";
  }
  function capRewardBenefit(benefit = {}) {
    const choice = capRewardChoice(benefit), balls = ["balls","both"].includes(choice), prize = ["prize","both"].includes(choice);
    return {...benefit, balls:balls ? benefit.balls || "" : "", plus:prize, extra:prize ? benefit.extra || "" : ""};
  }
  function capRewardFields(benefit) {
    const choice = capRewardChoice(benefit), balls = ["balls","both"].includes(choice), prize = ["prize","both"].includes(choice);
    return `<label>Reward choice<select data-breward="capTeams"><option value="" ${!choice ? "selected" : ""}>Not Yet Set</option>${[["balls","Balls"],["prize","Prize"],["both","Both"]].map(([value,label]) => `<option value="${value}" ${choice === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>${balls ? prizeFields("capTeams",benefit,true) : ""}${prize ? `<label class="prizeLabel"><span>Specify Prize</span><input data-bextra="capTeams" value="${esc(benefit.extra || "")}" placeholder="Describe the prize"></label>` : ""}`;
  }
  function stablefordBenefit(id, benefits = {}) {
    if (id === "capTeams") return capRewardBenefit(benefits.capTeams);
    if (id === "dailyStableford") {
      const saved = benefits.dailyStableford || benefits.single || benefits.combined || {};
      return {balls:saved.balls || ""};
    }
    if (id === "overallStableford") return {...(benefits.overallStableford || benefits.combined || benefits.single || {})};
    return benefits[id] || {};
  }
  function normaliseStablefordBenefits(benefits) {
    benefits.dailyStableford = stablefordBenefit("dailyStableford",benefits);
    if (!Object.prototype.hasOwnProperty.call(benefits,"overallStableford")) benefits.overallStableford = stablefordBenefit("overallStableford",benefits);
  }
  function stablefordPrizeFormats(event) {
    const format = event.singleStablefordFormat || "aggregate", multi = +event.days > 1;
    return {daily:!multi || format !== "aggregate", overall:multi && format !== "daily"};
  }
  function stablefordBenefitsHtml() {
    const formats = stablefordPrizeFormats(W.event);
    return `<div class="stablefordBenefitColumns">${[["dailyStableford","Daily Stableford",formats.daily],["overallStableford","Overall Event Stableford",formats.overall]].map(([id,label,enabled]) => {
      const summary = enabled ? benefitSummary(id) : "Not Applicable", open = enabled && W.benefitOpen.has(id);
      return `<section class="stablefordBenefitCell ${enabled ? "" : "notApplicable"}"><div class="benefitCurrent ${enabled && summary === "Not Yet Set" ? "notSet" : ""}" role="status">${esc(summary)}</div><button type="button" class="soft benefitBtn" data-benefit="${id}" ${enabled ? "" : "disabled"}>Set/Change Win Benefit ${label}</button>${enabled ? `<div class="benefit ${open ? "open" : ""}"><div class="benefitGrid">${prizeFields(id,stablefordBenefit(id,W.benefits))}</div></div>` : ""}</section>`;
    }).join("")}</div>`;
  }
  function stablefordPlayerPrizesHtml(event) {
    const formats = stablefordPrizeFormats(event);
    return [["dailyStableford","Daily Stableford",formats.daily],["overallStableford","Overall Event Stableford",formats.overall]].filter(([,label,on]) => on).map(([id,label]) => `<div data-competition="${id}"><span>${label}</span><b>${esc(competitionBenefitText(id,event.benefits))}</b></div>`).join("");
  }
  function competitionBenefitText(id, benefits) {
    const b = stablefordBenefit(id,benefits || {});
    if (["best3of4", "yellowBall"].includes(id) && b.mode === "lottery")
      return b.contribution
        ? `This is the only team that DOES NOT contribute $${b.contribution} to the Lottery Pool`
        : "This is the only team that does not contribute to the Lottery Pool";
    const parts = [];
    if (b.balls) parts.push(`${b.balls} Ball${+b.balls === 1 ? "" : "s"}`);
    if (b.plus) parts.push(id === "capTeams" && !b.balls ? "Prize" : "+ Prize");
    if (b.extra) parts.push(b.extra);
    return parts.join(" ") || "Prize not set";
  }
  const courseRegionByName = {
    Bathurst: "Orange & Central West",
    Duntryleague: "Orange & Central West",
    Mudgee: "Orange & Central West",
    "Wentworth (Orange)": "Orange & Central West",
    "Cypress Lakes": "Hunter Valley",
    "Hunter Valley G&CC": "Hunter Valley",
    "The Vintage": "Hunter Valley",
    "Horizons GC": "Hunter & Newcastle",
    "Kooindah Waters": "Hunter & Newcastle",
    Newcastle: "Hunter & Newcastle",
    "Pacific Dunes": "Hunter & Newcastle",
    "Nelson Bay GC": "Hunter & Newcastle",
    "Kiama GC": "Illawarra & South Coast",
    "Links at Shell Cove": "Illawarra & South Coast",
    "Mollymook GC": "Illawarra & South Coast",
    "Moruya GC": "Illawarra & South Coast",
    "Narooma GC": "Illawarra & South Coast",
    "Nowra Golf & Recreation Club": "Illawarra & South Coast",
    "Port Kembla": "Illawarra & South Coast",
    "Shoalhaven Heads GC": "Illawarra & South Coast",
    "The Grange": "Illawarra & South Coast",
    Wollongong: "Illawarra & South Coast",
    "Federal GC": "Canberra",
    "Gold Creek GC": "Canberra",
    "Gungahlin Lakes": "Canberra",
    "Royal Canberra (West)": "Canberra",
    "Royal Canberra (Yarra)": "Canberra",
  };
  function fresh() {
    return {
      players: AWAY_SEED.players.map((p) => ({
        ...p,
        gaCategory: p.gaCategory === "women" ? "women" : "men",
        rosterActive: !inactiveNames.has(p.name),
        homeClub: "",
        notes: "",
        eventsPlayed: 0,
        lastEvent: "",
        awayGolfEventsPlayed: [],
      })),
      courses: AWAY_SEED.courses.map((c) => ({
        ...c,
        available: c.available !== false,
        address: "",
        phone: "",
        website: "",
        email: "",
        mapLink: "",
        notes: "",
      })),
      event: null,
      template: null,
      playerLists: [],
    };
  }
  // Only the newest open app tab may persist the organiser workspace. Without
  // this lease, an older tab can later write its stale in-memory event list
  // over changes made in a newer tab.
  const AWAY_GOLF_WRITER_LEASE_KEY = "awayGolfActiveWriterV1";
  const AWAY_GOLF_WORKSPACE_JOURNAL_KEY = "awayGolfWorkspaceJournalV1";
  const appTabId =
    globalThis.crypto?.randomUUID?.() ||
    `away-tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(AWAY_GOLF_WRITER_LEASE_KEY, appTabId);
  let appTabSuperseded = false;
  let workspaceShrinkAuthorised = false;
  const localSaveDiagnostics = [];
  let store;

  function recordLocalSaveFailure(area, error) {
    const detail = {
      at: new Date().toISOString(),
      area,
      message: String(error?.message || error || "Browser storage write failed"),
    };
    localSaveDiagnostics.push(detail);
    if (localSaveDiagnostics.length > 20) localSaveDiagnostics.shift();
    console.error("Away Golf local save failure", detail);
  }
  window.AwayGolfLocalSaveDiagnostics = () =>
    JSON.parse(JSON.stringify(localSaveDiagnostics));

  function savedWorkspaceCount(value) {
    return Array.isArray(value?.eventWorkspace)
      ? value.eventWorkspace.length
      : value?.event
        ? 1
        : 0;
  }

  function readWorkspaceJournal() {
    try {
      return JSON.parse(
        localStorage.getItem(AWAY_GOLF_WORKSPACE_JOURNAL_KEY) || "null",
      );
    } catch (_) {
      return null;
    }
  }

  function restoreWorkspaceFromJournalIfShrunk() {
    const journal = readWorkspaceJournal(),
      saved = journal?.data;
    if (!saved || workspaceShrinkAuthorised) return false;
    const current = store.eventWorkspace || [];
    const ids = new Set(current.map(record => String(record.id)));
    // Only unpublished planning records belong in this recovery journal.
    // Published events reopen from the cloud and must never be resurrected
    // from an older local plan after a device refresh.
    const missing = (saved.eventWorkspace || []).filter(
      record => record?.event && !ids.has(String(record.id)),
    );
    if (!missing.length) return false;
    // Restore missing identities without replacing newer plans or the active draft.
    store.eventWorkspace = current.concat(JSON.parse(JSON.stringify(missing)));

    return true;
  }

  function writeWorkspaceJournal() {
    const unpublished = (store.eventWorkspace || []).filter(
      record => record?.event && !["Published", "Completed", "Cancelled"].includes(eventWorkspaceStatus(record.event)),
    );
    const identities = (store.eventWorkspace || [])
      .filter(record => record?.event && ["Published", "Completed"].includes(eventWorkspaceStatus(record.event)))
      .map(record => ({
        id: record.id,
        updatedAt: record.updatedAt || null,
        name: record.event?.name || "",
        date: record.event?.date || "",
        eventId: record.cloud?.eventId || record.event?.id || null,
        joinCode: record.cloud?.joinCode || record.event?.joinCode || null,
        status: eventWorkspaceStatus(record.event),
      }));
    const currentIsUnpublished = store.event &&
      !["Published", "Completed", "Cancelled"].includes(eventWorkspaceStatus(store.event));
    GolfSafeCloud.storageWrite(
      AWAY_GOLF_WORKSPACE_JOURNAL_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        data: {
          event: currentIsUnpublished ? JSON.parse(JSON.stringify(store.event)) : null,
          eventWorkspace: JSON.parse(JSON.stringify(unpublished)),
          publishedIdentities: JSON.parse(JSON.stringify(identities)),
          activeEventId: store.activeEventId || null,
          cloud: store.cloud ? {
            role: store.cloud.role || null,
            eventId: store.cloud.eventId || null,
            joinCode: store.cloud.joinCode || null,
          } : null,
          cloudPlayers: [],
        },
      }),
    );
    workspaceShrinkAuthorised = false;
  }

  function markSupersededTab() {
    if (appTabSuperseded) return;
    appTabSuperseded = true;
    const cloudHeader = document.getElementById("cloudHeader");
    if (cloudHeader) {
      cloudHeader.textContent = "Older tab â€” close this copy";
      cloudHeader.classList.add("offline");
    }
  }

  function writeLocalStore() {
    if (localStorage.getItem(AWAY_GOLF_WRITER_LEASE_KEY) !== appTabId) {
      markSupersededTab();
      recordLocalSaveFailure("writer lease", "This App tab is no longer the active writer");
      return false;
    }
    const playerOnly = ["player", "spectator"].includes(store.cloud?.role);
    if (!playerOnly) restoreWorkspaceFromJournalIfShrunk();
    try {
      // A player phone only needs the published event, its participants and
      // the courses used by that event. Persisting the organiser's complete
      // course library and event workspace on every hole duplicated several
      // megabytes and could exhaust a mobile browser's storage quota mid-round.
      // Keep the in-memory store intact; only the durable player copy is slim.
      let durableStore = store;
      if (playerOnly && store.event) {
        durableStore = JSON.parse(JSON.stringify(store));
        const participantIds = new Set(
          eventDays(store.event)
            .flatMap((day) => store.event.dayFields?.["day" + day] || store.event.confirmed || [])
            .map(String),
        );
        const courseIds = new Set(
          eventDays(store.event)
            .map((day) => String(store.event["course" + day] || ""))
            .filter(Boolean),
        );
        durableStore.players = (durableStore.players || []).filter(
          (record) => participantIds.has(String(record.id)) || record.system,
        );
        durableStore.courses = (durableStore.courses || []).filter((record) =>
          courseIds.has(String(record.id)),
        );
        durableStore.eventWorkspace = [];
        durableStore.activeEventId = null;
      }
      GolfSafeCloud.storageWrite("awayGolf13", JSON.stringify(durableStore));
      // The primary player copy and Safe Cloud score copy already provide two
      // independent protections. The organiser workspace journal is both
      // irrelevant and dangerously large on a player phone.
      if (!playerOnly) {
        // The workspace journal is a secondary organiser safeguard. Once the
        // primary store is durable, a journal failure must not make a valid
        // score appear unsaved or cause the in-memory card to be rolled back.
        try { writeWorkspaceJournal(); }
        catch (error) { recordLocalSaveFailure("organiser workspace journal", error); }
      }
      else {
        const journal = readWorkspaceJournal();
        if (["player", "spectator"].includes(journal?.data?.cloud?.role))
          localStorage.removeItem(AWAY_GOLF_WORKSPACE_JOURNAL_KEY);
      }
    } catch (error) {
      recordLocalSaveFailure("primary App store", error);
      return false;
    }
    return true;
  }

  window.addEventListener("pagehide", () => {
    if (localStorage.getItem(AWAY_GOLF_WRITER_LEASE_KEY) === appTabId)
      localStorage.removeItem(AWAY_GOLF_WRITER_LEASE_KEY);
  });
  window.addEventListener("pageshow", (event) => {
    // A back/forward-cache return resumes this script without running startup.
    // Reclaim a released lease only if another tab has not superseded this one.
    if (event.persisted && !appTabSuperseded && !localStorage.getItem(AWAY_GOLF_WRITER_LEASE_KEY))
      localStorage.setItem(AWAY_GOLF_WRITER_LEASE_KEY, appTabId);
  });
  window.addEventListener("storage", (event) => {
    if (
      event.key === AWAY_GOLF_WRITER_LEASE_KEY &&
      event.newValue &&
      event.newValue !== appTabId
    )
      markSupersededTab();
  });
  try {
    store = JSON.parse(localStorage.getItem("awayGolf13") || "null");
  } catch (e) {}
  if (!store) {
    store = fresh();
    try {
      const old = JSON.parse(localStorage.getItem("awayGolfV11") || "null");
      if (old?.players?.length) {
        const map = new Map(old.players.map((p) => [p.id, p]));
        store.players = store.players.map((p) => ({
          ...p,
          ...map.get(p.id),
          rosterActive: map.get(p.id)?.rosterActive ?? p.rosterActive,
        }));
      }
      if (old?.courses?.length) {
        const map = new Map(old.courses.map((c) => [c.id, c]));
        store.courses = store.courses.map((c) => ({
          ...c,
          ...map.get(c.id),
          available: map.get(c.id)?.available ?? true,
        }));
      }
    } catch (e) {}
  }
  restoreWorkspaceFromJournalIfShrunk();
  store.playerLists = Array.isArray(store.playerLists) ? store.playerLists : [];
  // The saved player category is now required. Preserve recorded women and
  // migrate the existing player list to men without individual data entry.
  (store.players || []).forEach((person) => {
    if (person.gaCategory !== "women" && person.gaCategory !== "men")
      person.gaCategory = "men";
  });
  try {
    store.template =
      JSON.parse(
        localStorage.getItem("awayGolfOrganiserTemplateV1") || "null",
      ) || store.template;
  } catch (e) {}
  // Retire the obsolete full-round cloud test wherever an old device link survived.
  // The genuine Oatlands Saturday field test uses BE8C94 and is never touched.
  const RETIRED_TEST_CODE = "2A40BC";
  const stale1539Test =
    String(store.cloud?.joinCode || "").toUpperCase() === RETIRED_TEST_CODE ||
    /away golf\s*-\s*15\.39 test/i.test(store.event?.name || "");
  if (stale1539Test) {
    store.event = null;
    delete store.cloud;
    store.cloudPlayers = [];
    forgetOrganiserEvent();
    writeLocalStore();
    sessionStorage.setItem("awayGolfRetired1539", "1");
  }
  // Keep the organiser PC attached to its published event independently of the
  // editable local workspace. A player device must always retain its own role.
  const rememberedLive = rememberedOrganiserEvent();
  function currentEventMatchesRememberedLive(live) {
    if (!live?.eventId || !store.event) return !store.event;
    const eventId = String(live.eventId || ""),
      joinCode = String(live.joinCode || "").toUpperCase(),
      activeId = String(
        store.event.workspaceId || store.activeEventId || "",
      ),
      activeRecord = (store.eventWorkspace || []).find(
        (item) => String(item.id) === activeId,
      ),
      localEventId = String(
        store.cloud?.eventId || activeRecord?.cloud?.eventId || "",
      ),
      localJoinCode = String(
        store.cloud?.joinCode ||
          activeRecord?.cloud?.joinCode ||
          store.event.joinCode ||
          "",
      ).toUpperCase();
    return Boolean(
      (localEventId && localEventId === eventId) ||
        (joinCode && localJoinCode === joinCode),
    );
  }
  if (
    rememberedLive?.eventId &&
    !["player", "spectator"].includes(store.cloud?.role) &&
    !store.cloud?.eventId &&
    currentEventMatchesRememberedLive(rememberedLive)
  )
    store.cloud = {
      role: "organiser",
      eventId: rememberedLive.eventId,
      joinCode: rememberedLive.joinCode,
      restorePublished: true,
    };
  store.eventWorkspace = Array.isArray(store.eventWorkspace)
    ? store.eventWorkspace
    : [];
  function workspaceCloudIdentity(record) {
    const eventId = String(record?.cloud?.eventId || "");
    if (eventId) return `event:${eventId}`;
    const joinCode = String(
      record?.cloud?.joinCode || record?.event?.joinCode || "",
    ).toUpperCase();
    return joinCode ? `code:${joinCode}` : "";
  }
  function workspaceExactIdentity(record) {
    if (!record?.event) return "";
    const event = JSON.parse(JSON.stringify(record.event));
    delete event.workspaceId;
    return `exact:${JSON.stringify(event)}`;
  }
  function consolidateWorkspaceCloudDuplicates() {
    // Cloud links and identical contents are not event identities. Separate
    // saved plans must survive even when an older build copied either value.
    // Keep all records here; only explicit organiser deletion may remove a plan.
    return;

  }
  consolidateWorkspaceCloudDuplicates();
  function workspaceIdFor(event) {
    if (!event) return "";
    if (!event.workspaceId) event.workspaceId = uid();
    return String(event.workspaceId);
  }
  function captureCurrentEvent() {
    if (!store.event) return;
    let id = workspaceIdFor(store.event);
    let record = store.eventWorkspace.find((item) => String(item.id) === id);
    if (!record) {
      record = { id, createdAt: new Date().toISOString() };
      store.eventWorkspace.push(record);
    } else {
      id = String(record.id);
      store.event.workspaceId = id;
    }
    record.event = JSON.parse(JSON.stringify(store.event));
    const eventIsPublished = Boolean(
      store.event.publishedAt ||
        store.event.previewPublishedAt ||
        store.event.finalUpdateAt ||
        store.event.joinCode,
    );
    // A draft is local planning data. Never attach whichever cloud event the
    // organiser device happened to remember, because that live event could
    // replace the draft after the next reload.
    record.cloud =
      eventIsPublished && store.cloud
        ? JSON.parse(JSON.stringify(store.cloud))
        : null;
    record.cloudPlayers = eventIsPublished
      ? JSON.parse(JSON.stringify(store.cloudPlayers || []))
      : [];
    if (!eventIsPublished && store.cloud?.role === "organiser") {
      delete store.cloud;
      store.cloudPlayers = [];
      forgetOrganiserEvent();
    }
    record.updatedAt = new Date().toISOString();
    store.activeEventId = id;
  }
  function migrateEventWorkspace() {
    if (store.event) captureCurrentEvent();
    const active = store.eventWorkspace.find(
      (item) => String(item.id) === String(store.activeEventId || ""),
    );
    if (active?.event) {
      store.event = JSON.parse(JSON.stringify(active.event));
      if (active.cloud) store.cloud = JSON.parse(JSON.stringify(active.cloud));
      else delete store.cloud;
      store.cloudPlayers = JSON.parse(JSON.stringify(active.cloudPlayers || []));
    }
  }
  migrateEventWorkspace();
  clearImpossibleDraftRuntime(store.event);
  (store.eventWorkspace || []).forEach((record) =>
    clearImpossibleDraftRuntime(record?.event),
  );
  normaliseTwoDaySingleStableford(store.event);
  (store.eventWorkspace || []).forEach((record) =>
    normaliseTwoDaySingleStableford(record?.event),
  );
  writeLocalStore();
  function persistStore() {
    captureCurrentEvent();
    return writeLocalStore();
  }
  function normaliseCourseNames() {
    (store.courses || []).forEach((c) => (c.name = gcCourseName(c.name)));
    (store.players || []).forEach((p) =>
      Object.values(p.courseHandicaps || {}).forEach(
        (h) => (h.courseName = gcCourseName(h.courseName)),
      ),
    );
  }
  normaliseCourseNames();
  // A course has one authoritative scorecard. Older builds allowed duplicate
  // course rows and multiple card versions, which could make a generic seed
  // card active after the organiser had saved a verified card. Consolidate by
  // course name, retain the most complete card and redirect every saved ID.
  function cardQuality(card) {
    if (!card) return -1;
    const indexes = Array.isArray(card.index) ? card.index : [],
      pars = Array.isArray(card.par) ? card.par : [],
      metres = Array.isArray(card.metres) ? card.metres : [];
    return (
      indexes.filter((value) => String(value || "").includes("/")).length * 100 +
      indexes.filter((value) => String(value || "").trim()).length * 10 +
      pars.filter((value) => Number(value) > 0).length * 5 +
      metres.filter((value) => Number(value) > 0).length * 5 +
      (String(card.confirmedDate || "").trim() ? 25 : 0)
    );
  }
  function courseQuality(courseRecord) {
    const bestCard = [
      ...Object.values(courseRecord.teeScorecards || {}),
      ...(courseRecord.versions || []),
    ].sort(
      (a, b) => cardQuality(b) - cardQuality(a),
    )[0];
    const detailFields = [
      "region", "clubPhone", "proPhone", "clubEmail", "proEmail",
      "proName", "address", "mapLink", "website", "notes",
    ];
    return (
      cardQuality(bestCard) +
      detailFields.filter((key) => String(courseRecord[key] || "").trim()).length * 8
    );
  }
  function remapEventCourseIds(event, idMap) {
    if (!event) return;
    for (const key of eventDays(event).map(day => "course" + day))
      if (idMap.has(String(event[key] || "")))
        event[key] = idMap.get(String(event[key]));
  }
  function consolidateCourseCards() {
    // Cloud record IDs are authoritative; do not merge same-named clubs from different locations.
    if (Object.keys(store.courseLibrary?.bases || {}).length) return;
    const groups = new Map();
    for (const item of store.courses || []) {
      const key = String(item.name || "").trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const idMap = new Map(), consolidated = [];
    for (const records of groups.values()) {
      const ranked = [...records].sort(
          (a, b) => courseQuality(b) - courseQuality(a),
        ),
        keeper = ranked[0],
        allCards = ranked.flatMap((item) => [
          ...Object.values(item.teeScorecards || {}),
          ...(item.versions || []),
        ]),
        bestCard = [...allCards].sort((a, b) => cardQuality(b) - cardQuality(a))[0];
      for (const record of records) idMap.set(String(record.id), String(keeper.id));
      for (const source of ranked.slice(1)) {
        for (const key of [
          "region", "clubPhone", "proPhone", "phone", "clubEmail", "proEmail",
          "email", "proName", "address", "mapLink", "website", "notes",
        ])
          if (!String(keeper[key] || "").trim() && String(source[key] || "").trim())
            keeper[key] = source[key];
        keeper.teeDetails = keeper.teeDetails || {};
        keeper.teeScorecards = keeper.teeScorecards || {};
        for (const [tee, card] of Object.entries(source.teeScorecards || {}))
          if (!keeper.teeScorecards[tee] || cardQuality(card) > cardQuality(keeper.teeScorecards[tee]))
            keeper.teeScorecards[tee] = card;
        for (const tee of ["back", "middle", "front"]) {
          keeper.teeDetails[tee] = keeper.teeDetails[tee] || {};
          for (const key of ["colour", "slope", "scratch", "par", "length"])
            if (
              !String(keeper.teeDetails[tee][key] || "").trim() &&
              String(source.teeDetails?.[tee]?.[key] || "").trim()
            )
              keeper.teeDetails[tee][key] = source.teeDetails[tee][key];
        }
      }
      if (bestCard) {
        keeper.teeScorecards = keeper.teeScorecards || {};
        if (!Object.keys(keeper.teeScorecards).length)
          keeper.teeScorecards.middle = { ...bestCard, tee: "middle" };
        keeper.activeScorecardTee = keeper.teeScorecards[keeper.activeScorecardTee]
          ? keeper.activeScorecardTee
          : Object.keys(keeper.teeScorecards)[0];
      }
      delete keeper.versions;
      delete keeper.activeVersionId;
      consolidated.push(keeper);
    }
    store.courses = consolidated;
    remapEventCourseIds(store.event, idMap);
    remapEventCourseIds(store.template, idMap);
    for (const record of store.eventWorkspace || [])
      remapEventCourseIds(record.event, idMap);
    for (const person of store.players || []) {
      const old = person.courseHandicaps || {}, next = {};
      for (const [courseId, details] of Object.entries(old)) {
        const mapped = idMap.get(String(courseId)) || String(courseId);
        if (!next[mapped] || String(details.updatedAt || "") > String(next[mapped].updatedAt || ""))
          next[mapped] = { ...details, courseId: mapped };
      }
      person.courseHandicaps = next;
    }
    store.courseFavourites = [
      ...new Set(
        (store.courseFavourites || []).map(
          (id) => idMap.get(String(id)) || String(id),
        ),
      ),
    ];
    writeLocalStore();
  }
  consolidateCourseCards();
  // Version 15.78 recovery: the first test package could expose the packaged
  // one-index Oatlands card in place of Rod's saved two-index course record.
  // After duplicate consolidation, repair only the exact incomplete signature.
  // A genuine organiser-edited card is always left untouched.
  function repairIncompleteOatlandsCard() {
    const oatlands = (store.courses || []).find((c) =>
      /^oatlands gc$/i.test(String(c.name || "").trim()),
    );
    if (!oatlands || store.courseLibrary?.bases?.[String(oatlands.id)]) return false;
    const card = oatlands.teeScorecards?.[oatlands.activeScorecardTee] ||
      oatlands.teeScorecards?.middle ||
      (oatlands.versions || []).find(
        (item) => String(item.id) === String(oatlands.activeVersionId || ""),
      ) || oatlands.versions?.[0];
    if (!card) return false;
    const indexes = Array.isArray(card.index) ? card.index.map(String) : [];
    const metres = Array.isArray(card.metres) ? card.metres.map(Number) : [];
    const primaryOnly = [
      "8", "12", "7", "6", "13", "2", "18", "15", "10",
      "17", "11", "3", "16", "4", "5", "9", "14", "1",
    ];
    const metreTotal = metres.reduce(
      (total, value) => total + (value || 0),
      0,
    );
    const isIncomplete1578Card =
      indexes.length === 18 &&
      indexes.every((value, i) => value === primaryOnly[i]) &&
      (metreTotal === 5503 || metreTotal === 0) &&
      !String(oatlands.clubPhone || "").trim() &&
      !String(oatlands.proPhone || "").trim();
    if (!isIncomplete1578Card) return false;

    oatlands.region = "Sydney";
    oatlands.clubPhone = "+61 2 9630 4444";
    oatlands.proPhone = "+61 2 9630 1423";
    oatlands.phone = oatlands.proPhone;
    oatlands.clubEmail = "administration@oatlandsgolf.com.au";
    oatlands.email = oatlands.clubEmail;
    oatlands.proName = "Jeremy Ward";
    oatlands.address = "Bettington Rd Oatlands";
    oatlands.teeDetails = oatlands.teeDetails || {};
    for (const key of ["back", "middle", "front"])
      oatlands.teeDetails[key] = {
        ...(oatlands.teeDetails[key] || {}),
        slope: "",
        scratch: "70",
        par: "70",
      };
    oatlands.teeDetails.middle.length = "5502";
    card.teeName = "Middle";
    card.slope = "";
    card.scratch = "70";
    card.par = [4, 3, 4, 4, 3, 4, 3, 4, 5, 3, 4, 4, 3, 5, 4, 5, 4, 4];
    card.index = [
      "8/28", "12/33", "7/25", "6/24", "13/32", "2/21",
      "18/36", "15/31", "10/27", "17/35", "11/29", "3/23",
      "16/34", "4/19", "5/22", "9/26", "14/30", "1/20",
    ];
    card.metres = [
      315, 193, 351, 369, 158, 397, 116, 276, 478,
      117, 301, 316, 137, 466, 366, 495, 272, 379,
    ];
    writeLocalStore();
    return true;
  }
  repairIncompleteOatlandsCard();
  // 15.35 repairs legacy player rows that pre-date the complete seed record.
  // Only blank values are filled, so organiser changes always win.
  const seedPlayersById = new Map(
    (AWAY_SEED.players || []).map((p) => [String(p.id), p]),
  );
  (store.players || []).forEach((p) => {
    const seed = seedPlayersById.get(String(p.id));
    if (seed && !String(p.golfLink || "").trim())
      p.golfLink = seed.golfLink || "";
  });
  const rodRuston = (store.players || []).find(
    (p) => String(p.id) === "p42" || /^rod ruston$/i.test(p.name || ""),
  );
  if (rodRuston && !String(rodRuston.homeClub || "").trim())
    rodRuston.homeClub = "Oatlands GC";
  store.pairHistory = store.pairHistory || {};
  store.partnerHistory = store.partnerHistory || {};
  if (
    store.event?.name &&
    /this page appears and needs to be filled in even when one tee/i.test(
      store.event.name,
    )
  ) {
    store.event.name =
      store.event.name
        .replace(
          /this page appears and needs to be filled in even when one tee/i,
          "",
        )
        .trim() || "Canberra";
  }
  // Development migration: an event locked in 14.x had no Daily Handicap step. Re-open it once so scoring setup can be completed.
  if (store.event?.locked && !store.event.dailyHandicaps) {
    store.event.locked = false;
    store.event.status = "planned";
    delete store.event.lockedAt;
  }
  // A legacy template could leave the two-day Single Stableford flag on a
  // one-day event. Convert it once so one-day screens and results stay clean.
  if (
    store.event?.days === 1 &&
    Array.isArray(store.event.competitions) &&
    store.event.competitions.includes("combined")
  ) {
    store.event.competitions = store.event.competitions.filter(
      (id) => id !== "combined",
    );
    if (!store.event.competitions.includes("single"))
      store.event.competitions.push("single");
    writeLocalStore();
  }

  const save = () => {
    const saved = persistStore();
    renderHome();
    renderPlayersAdmin();
    renderCoursesAdmin();
    return saved;
  };
  const surnameKey = (n) => {
    let p = String(n).trim().split(/\s+/);
    return (p.pop() + " " + p.join(" ")).toLowerCase();
  };
  const activePlayers = () =>
    store.players
      .filter((p) => p.rosterActive !== false)
      .sort((a, b) => surnameKey(a.name).localeCompare(surnameKey(b.name)));
  const activeCourses = () =>
    store.courses
      .filter((c) => c.available !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  const course = (id, master = false) => (!master && store.event?.locked && (store.cloud?.courseCards || store.event.courseSnapshot)?.find(c => String(c.id) === String(id))) || store.courses.find((c) => c.id === id),
    player = (id) =>
      String(id) === NO_PARTNER_ID
        ? NO_PARTNER
        : eventPlayer(id);
  function eventPlayer(id, day = null) {
    const base=store.players.find(p=>String(p.id)===String(id));
    return GolfPlayerSubstitution.occupant(store.event,id,base,day);
  }
  function sharedPositionId(id, event = store.event) { return GolfSharedPositions.position(event,id); }
  function sharedActualId(id, day, event = store.event) { return GolfSharedPositions.actual(event,id,day); }
  function eventPlayerName(id, day = null) {
    if(day!=null)return eventPlayer(sharedActualId(id,day),day)?.name || "Player";
    return GolfSharedPositions.label(store.event,id,person=>GolfPlayerSubstitution.aggregateName(store.event,person,player(person)?.name || "Player"));
  }
  function substitutionOptions(day, slot) {
    return {
      base:{...store.players.find(p=>String(p.id)===String(slot)),ga:eventGaHandicap(slot)}, at:new Date().toISOString(),
      scorecardsOpened:scoringIsOpen(1) || dayHasScoreEntries(1),
      field:dayFieldIds, complete:eventDayComplete, started:d=>dayHasScoreEntries(d) || Boolean(Object.keys(store.event.manualScorecards?.["day"+d]?.groups || {}).length),
      usedProfile:id=>cloudPlayerIds().map(String).includes(id) || Object.values(store.event.playerSubstitutions || {}).flat().some(r=>[r.previous.id,r.replacement.id].map(String).includes(id)),
      tees:d=>enabledEventTees(store.event,d),
      calculate:(d,tee,ga,category)=>calculateDailyHandicap(ga,teeRatingForDailyHandicap(d,tee,store.event,category),category),
    };
  }
  async function sendPlayerSubstitution() {
    const pending=store.event?.realPlayerSubstitutionPending;
    if (!pending) return true;
    if (store.cloud?.role !== "organiser" || !store.cloud.eventId || !navigator.onLine) throw Error("Connect the organiser to the published event online before sending the substitution.");
    // Release first: the former golfer must not submit under the shared event position.
    await AwayCloud.releasePlayer(store.cloud.eventId,pending.slot);
    if (!await updateCloudEvent()) throw Error("The final update is still waiting to be saved. Use Retry Substitute Update.");
    await AwayCloud.syncEventPlayers(store.cloud.eventId,cloudPlayerRows());
    const bundle=await AwayCloud.loadEvent(store.cloud.eventId);
    const sent=bundle?.event?.event_data?.event?.playerSubstitutions?.[pending.slot]?.some(r=>r.at===pending.at);
    if (!sent) throw Error("The substitution has not been confirmed online. Use Retry Substitute Update.");
    delete store.event.realPlayerSubstitutionPending;
    persistStore();
    // The pending marker is operational only. Persist its removal as well.
    if (!await updateCloudEvent()) {
      store.event.realPlayerSubstitutionPending=pending;persistStore();
      throw Error("The substitution saved but its final confirmation is still pending. Keep the substitute off the app and retry.");
    }
    await syncCloudNow();
    return true;
  }
  function readSubstitutePlayer() {
    const selected=$("#subProfile").value, existing=store.players.find(p=>String(p.id)===selected),
      raw=$("#subGa").value, magnitude=Number(raw), plus=$("#subGaPlus").checked;
    if(raw.trim()==="" || !Number.isFinite(magnitude) || magnitude<0 || magnitude>(plus ? 10 : 54))throw Error("Enter a GA Handicap from 0 to 54, or 0 to 10 with Plus ticked.");
    const replacement={...(existing || {}),id:selected || uid(),name:existing ? existing.name : $("#subName").value.trim(),ga:plus ? -magnitude : magnitude,gaCategory:$("#subCategory").value,golfLink:$("#subNoOfficial").checked ? "" : $("#subGolfId").value.trim(),noOfficialHandicap:$("#subNoOfficial").checked,rosterActive:true};
    delete replacement.handicapEstimate;
    if(!replacement.name)throw Error("Choose a substitute from the existing Player List or enter the Name of a New Player.");
    if(!replacement.noOfficialHandicap && !replacement.golfLink)throw Error("Insert a GolfLink / ID No or tick No Golf ID / GolfLink Number.");
    return {replacement,existing};
  }
  function bindSubstituteForm(day) {
    let estimate=null, savedNumber="";
    function clearEstimate(){estimate=null;$("#subEstimate").value="";$("#subEstimatePlus").checked=false;$("#subEstimateStatus").textContent="Enter an estimated playing handicap to calculate GA, or enter GA directly on the left.";}
    function noNumber(){const absent=$("#subNoOfficial").checked, input=$("#subGolfId");if(absent){savedNumber=input.value;input.value="";}else if(!input.value){input.value=savedNumber;}input.disabled=absent;input.placeholder=absent ? "No number recorded" : "Insert GolfLink / ID No";}
    function calculateEstimate(){
      const hadEstimate=Boolean(estimate);estimate=null;const raw=$("#subEstimate").value,status=$("#subEstimateStatus");
      if(raw.trim()===""){ if(hadEstimate){$("#subGa").value="";$("#subGaPlus").checked=false;}status.textContent="Enter an estimated playing handicap or enter GA directly on the left.";return; }
      try {
        const d=+$("#subEstimateDay").value,tee=$("#subEstimateTee").value,category=$("#subCategory").value,magnitude=Number(raw),plus=$("#subEstimatePlus").checked;
        if(!Number.isInteger(magnitude) || magnitude<0 || magnitude>(plus ? 10 : 54))throw Error("Enter a whole-number playing handicap from 0 to 54, or 0 to 10 with Plus ticked.");
        const handicap=plus ? -magnitude : magnitude,rating=teeRatingForDailyHandicap(d,tee,store.event,category),ga=estimateEventGa(handicap,rating,category,calculateDailyHandicap);
        $("#subGa").value=Math.abs(ga).toFixed(1);$("#subGaPlus").checked=ga<0;
        estimate={day:d,courseId:store.event['course'+d],tee,handicap,ga,category};
        status.textContent=`Estimated GA ${ga<0 ? "+" : ""}${Math.abs(ga).toFixed(1)} calculated from Day ${d} Â· ${rating.courseName} Â· ${rating.teeColour} tee Â· playing handicap ${handicap<0 ? "+" : ""}${Math.abs(handicap)}. This is an event estimate, not an official GA.`;
      }catch(error){$("#subGa").value="";$("#subGaPlus").checked=false;status.textContent=error.message || String(error);}
    }
    function updateTees(){const d=+$("#subEstimateDay").value;$("#subEstimateTee").innerHTML=enabledEventTees(store.event,d).map(tee=>`<option value="${tee}">${EVENT_TEE_LABELS[tee]} â€” ${esc(teeMarkerColour(tee,course(store.event['course'+d])))}</option>`).join("");$("#subEstimateTee").value=selectedEventTee(d);if($("#subEstimate").value!=="")calculateEstimate();}
    $("#subProfile").onchange=()=>{
      const p=store.players.find(p=>String(p.id)===$("#subProfile").value),input=$("#subName");
      input.value="";input.disabled=Boolean(p);input.placeholder=p ? "Clear the saved-player selection above to enter a new player" : "Enter a new playerâ€™s name";
      const known=p?.gaUpdatedAt || p?.ga ? p.ga : "";$("#subGa").value=known==="" || known==null ? "" : Math.abs(+known);$("#subGaPlus").checked=known!=="" && +known<0;
      $("#subCategory").value=p?.gaCategory || "men";$("#subGolfId").value=p?.golfLink || "";savedNumber=p?.golfLink || "";$("#subNoOfficial").checked=Boolean(p?.noOfficialHandicap);noNumber();clearEstimate();
    };
    $("#subNoOfficial").onchange=noNumber;
    $("#subGa").oninput=clearEstimate;$("#subGaPlus").onchange=clearEstimate;
    $("#subEstimate").oninput=calculateEstimate;$("#subEstimatePlus").onchange=calculateEstimate;
    $("#subEstimateDay").onchange=updateTees;$("#subEstimateTee").onchange=calculateEstimate;
    $("#subCategory").onchange=()=>{if($("#subEstimate").value!=="")calculateEstimate();};
    $("#subEstimateDay").value=String(day);updateTees();noNumber();clearEstimate();
    return {read:()=>{const result=readSubstitutePlayer();if(estimate)result.replacement.handicapEstimate={...estimate};return result;}};
  }
  async function openPlayerSubstitution(day) {
    if (isPlayerDevice() || isSpectatorDevice() || !store.event?.locked) return;
    if (store.event.realPlayerSubstitutionPending) {
      try { await sendPlayerSubstitution(); renderHome(); alert("Substitution confirmed online. The substitute can now join using the existing event code. Ask all players to receive the final update."); }
      catch(error){alert(error.message || String(error));}
      return;
    }
    if (store.cloud?.role!=="organiser" || !store.cloud.eventId || !navigator.onLine) return alert("Connect to the published event online before replacing a player.");
    if (!await syncCloudNow()) return alert("Refresh did not complete. Retry when connected before making a substitution.");
    if(Object.keys(store.event.sharedPositions || {}).length)return alert("This event has planned shared positions. Contact the event owner before changing those assignments after publication.");
    const ids=dayFieldIds(day).filter(id=>String(id)!==NO_PARTNER_ID), eligible=activePlayers().filter(p=>!substitutionOptions(day,ids[0]).usedProfile(String(p.id)));
    $("#modalContent").innerHTML=`<div class="substituteForm"><h2>Replace Player â€” Day ${day} onward</h2><p>The substitute takes the same groups, partnerships, tees and starting positions. Earlier cards stay unchanged. Both golfersâ€™ scores count together for aggregate competitions.</p><label class="substituteField"><strong>Player being replaced</strong><select id="subSlot">${ids.map(id=>`<option value="${esc(id)}">${esc(eventPlayerName(id,day))}</option>`).join("")}</select></label><label class="substituteField"><strong>Substitute from the existing Player List</strong><small>Open this list to choose a saved player. Leave it blank to add a new player below.</small><select id="subProfile"><option value="">Choose a player from this list - or insert the name of new player in the cell below</option>${eligible.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label><label class="substituteField"><strong>Name of a New Player</strong><input id="subName" autocomplete="name" placeholder="Enter a new playerâ€™s name"></label><fieldset class="substituteSection"><legend><strong>Golf ID / GolfLink Number</strong></legend><div class="substituteColumns"><label class="substituteField"><strong>Insert GolfLink / ID No</strong><input id="subGolfId" inputmode="numeric" aria-label="Golf ID or GolfLink number"></label><label class="substituteChoice"><input type="checkbox" id="subNoOfficial"><span><strong>Or click here if the replacement player doesnâ€™t have a GolfLink / ID No</strong><small>No Golf ID / GolfLink Number â€” recorded as No Official Handicap.</small></span></label></div></fieldset><label class="substituteField"><strong>Handicap category</strong><select id="subCategory"><option value="men">Men</option><option value="women">Women</option></select></label><div class="substituteColumns substituteHandicaps"><section class="substituteSection"><div class="substituteField"><label for="subGa"><strong>GA Handicap</strong></label><div class="substituteSigned"><input id="subGa" type="number" inputmode="decimal" min="0" max="54" step="0.1" placeholder="GA"><label class="substitutePlus"><input type="checkbox" id="subGaPlus"> Plus</label></div></div><small>Enter the number normally. Tick Plus for a plus handicap.</small></section><section class="substituteSection"><div class="substituteField"><label for="subEstimate"><strong>Insert Substitute Playerâ€™s Estimated Handicap</strong></label><div class="substituteSigned"><input id="subEstimate" type="number" inputmode="numeric" min="0" max="54" step="1" placeholder="Playing handicap"><label class="substitutePlus"><input type="checkbox" id="subEstimatePlus"> Plus</label></div></div><label class="substituteField"><strong>Estimate for this course</strong><select id="subEstimateDay">${eventDays().filter(d=>d>=day).map(d=>`<option value="${d}">Day ${d} â€” ${esc(course(store.event['course'+d])?.name || "Course")}</option>`).join("")}</select></label><label class="substituteField"><strong>Tee used for the estimate</strong><select id="subEstimateTee"></select></label></section></div><p id="subEstimateStatus" class="substituteEstimateStatus" role="status"></p><p id="subPreview" role="status"></p><div class="substituteActions"><button class="primary" id="applyRealSubstitute">Review and Send Substitution</button><button class="soft" id="cancelRealSubstitute">Close</button></div></div>`;
    $("#modalShade").classList.add("open");
    const form=bindSubstituteForm(day);
    $("#cancelRealSubstitute").onclick=()=>$("#modalShade").classList.remove("open");
    $("#applyRealSubstitute").onclick=async()=>{
      const button=$("#applyRealSubstitute");button.disabled=true;
      try {
        const slot=$("#subSlot").value, {replacement,existing}=form.read();
        const next=GolfPlayerSubstitution.prepare(store.event,slot,replacement,day,substitutionOptions(day,slot)),
          preview=eventDays(next).filter(d=>d>=day).map(d=>`Day ${d}: ${Object.entries(next.teeHandicaps['day'+d]).filter(([tee])=>enabledEventTees(next,d).includes(tee)).map(([tee,map])=>tee+" "+map[slot]).join(" Â· ")}`).join("\n");
        $("#subPreview").textContent=preview;
        if (!confirm(`Replace ${eventPlayerName(slot,day)} with ${replacement.name} from Day ${day}?\nGA ${replacement.ga}\n${preview}\n\nEarlier scores are retained and count with the substituteâ€™s scores for aggregates. The previous phone connection will be released.`)) return;
        // Re-read online immediately before applying, then repeat every safety check.
        if (!await syncCloudNow()) throw Error("The online refresh failed. Nothing has been changed.");
        const checked=GolfPlayerSubstitution.prepare(store.event,slot,replacement,day,substitutionOptions(day,slot));
        if (!existing) store.players.push(replacement);
        store.event=checked;persistStore();
        await sendPlayerSubstitution();
        $("#modalShade").classList.remove("open");renderHome();
        alert(`${replacement.name} can now join using the existing event code. Ask every player to receive the new final update before play.`);
      } catch(error) { alert((error.message || String(error))+(store.event?.realPlayerSubstitutionPending ? "\nThe substitution is saved locally. Use Retry Substitute Update in Round Progress before the substitute joins." : ""));renderLiveEventControl(); }
      finally { button.disabled=false; }
    };
  }
  const legacyVersion = (c) =>
    c?.versions?.find((v) => v.id === c.activeVersionId) || c?.versions?.[0];
  const version = (c) => {
    const cards = c?.teeScorecards || {};
    const tee =
      (c?.activeScorecardTee && cards[c.activeScorecardTee]
        ? c.activeScorecardTee
        : EVENT_TEES.find((key) => cards[key])) || "";
    if (tee) {
      const info = c?.teeDetails?.[tee] || {};
      return {
        ...cards[tee],
        tee,
        teeName: info.name || tee,
        slope: info.slope || "",
        scratch: info.scratch || "",
      };
    }
    return legacyVersion(c);
  };
  function courseDistanceUnit(card = {}) {
    return card.distanceUnit === "yards" ? "yards" : "metres";
  }
  function courseDistanceAbbrev(card = {}) {
    return courseDistanceUnit(card) === "yards" ? "yd" : "m";
  }
  function courseHoleDistance(card = {}, index) {
    const metres = card.metres?.[index];
    if (courseDistanceUnit(card) === "yards")
      return card.yards?.[index] ?? (Number(metres) > 0 ? Math.round(Number(metres) / 0.9144) : "");
    return metres ?? "";
  }
  function courseInputDistance(card = {}, index, unit = card.distanceInputUnit || courseDistanceUnit(card)) {
    if (unit === "yards")
      return card.yards?.[index] ?? (Number(card.metres?.[index]) > 0 ? Math.round(Number(card.metres[index]) / 0.9144) : "");
    return card.metres?.[index] ?? "";
  }
  function recordCourseDistances(card, values, inputUnit, savedUnit) {
    const yards = inputUnit === "yards";
    card.distanceInputUnit = yards ? "yards" : "metres";
    card.distanceUnit = yards && savedUnit === "yards" ? "yards" : "metres";
    card.metres = values.map(value => Number(value) > 0 ? Math.round(Number(value) * (yards ? 0.9144 : 1)) : "");
    if (yards) card.yards = values.map(value => Number(value) > 0 ? Number(value) : "");
    else delete card.yards;
  }
  function courseDistanceTotal(card = {}) {
    return Array.from({ length: 18 }, (_, i) => Number(courseHoleDistance(card, i)) || 0).reduce((sum, value) => sum + value, 0);
  }
  function cloneCourseCard(card = {}, tee = "middle") {
    return {
      tee,
      distanceUnit: courseDistanceUnit(card),
      distanceInputUnit: card.distanceInputUnit || courseDistanceUnit(card),
      ...(Array.isArray(card.yards) ? { yards: [...card.yards] } : {}),
      par: Array.from({ length: 18 }, (_, i) => card.par?.[i] ?? ""),
      index: Array.from({ length: 18 }, (_, i) => card.index?.[i] ?? ""),
      metres: Array.from({ length: 18 }, (_, i) => card.metres?.[i] ?? ""),
    };
  }
  function ensureTeeScorecards(c, category = "men") {
    if (!c) return {};
    c=GolfCourseCategories.data(c,category,true);
    const legacy =
      c?.versions?.find((item) => item.id === c.activeVersionId) ||
      c?.versions?.[0] || {};
    c.teeScorecards = c.teeScorecards || {};
    if (
      !Object.keys(c.teeScorecards).length &&
      [legacy.par, legacy.index, legacy.metres].some((values) => Array.isArray(values) && values.length)
    ) {
      const legacyLength = (legacy.metres || []).reduce(
        (total, value) => total + (+value || 0),
        0,
      );
      const lengthMatches = EVENT_TEES.filter(
        (tee) =>
          legacyLength > 0 &&
          +String(c.teeDetails?.[tee]?.length || "").replace(/[^0-9.]/g, "") ===
            legacyLength,
      );
      const legacyTee = lengthMatches.length === 1 ? lengthMatches[0] : "middle";
      c.teeScorecards[legacyTee] = cloneCourseCard(legacy, legacyTee);
    }
    delete c.versions;
    delete c.activeVersionId;
    return c.teeScorecards;
  }
  function courseScorecard(c, tee = "middle", create = false, category = "men") {
    const cards = ensureTeeScorecards(c,category);
    c=GolfCourseCategories.data(c,category,create);
    if (!cards[tee] && create) {
      const source = cards.middle || cards.back || cards.front || version(c) || {};
      cards[tee] = {
        tee,
        distanceUnit: courseDistanceUnit(source),
        distanceInputUnit: source.distanceInputUnit || courseDistanceUnit(source),
        ...(source.distanceInputUnit === "yards" || courseDistanceUnit(source) === "yards" ? { yards: Array(18).fill("") } : {}),
        par: Array.from({ length: 18 }, (_, i) => source.par?.[i] ?? ""),
        index: Array(18).fill(""),
        metres: Array(18).fill(""),
      };
    }
    return cards[tee] || null;
  }
  function eventCourseCategory(day,event=store.event,id=null){
    if(!event?.courseCategoryVersion)return "men";
    if(id!=null)return GolfCourseCategories.category(event,id,day,eventPlayer);
    const ids=(event.confirmed?.length?event.confirmed:Object.keys(event.gaCategories||{})).filter(id=>String(id)!==NO_PARTNER_ID);
    return ids.length&&ids.every(id=>GolfCourseCategories.category(event,id,day,eventPlayer)==="women")?"women":"men";
  }
  function eventCourseScorecard(day, event = store.event, id = null) {
    if (!event) return {};
    const category = eventCourseCategory(day,event,id);
    return courseScorecard(course(event["course"+day]),selectedEventTee(day,event,category),false,category)||{};
  }
  function eventCardChecks(day,event=store.event){
    const c=course(event["course"+day]),ids=(event.confirmed?.length?event.confirmed:Object.keys(event.gaCategories||{})).filter(id=>String(id)!==NO_PARTNER_ID),categories=[...new Set(ids.map(id=>eventCourseCategory(day,event,id)))];
    if(!categories.length)categories.push(eventCourseCategory(day,event));
    return categories.map(category=>({category,...validateCourseScorecard(c,selectedEventTee(day,event,category),category)}));
  }
  function validateCourseScorecard(c, tee = "middle", category = "men") {
    const v = courseScorecard(c, tee, false, category) || {},
      pars = Array.from({ length: 18 }, (_, i) => Number(v.par?.[i])),
      metres = Array.from({ length: 18 }, (_, i) => Number(v.metres?.[i])),
      indexes = Array.from({ length: 18 }, (_, i) => {
        const raw = String(v.index?.[i] ?? "").trim();
        return raw ? Number(raw.split("/")[0]) : NaN;
      }),
      issues = [];
    if(GolfCourseCategories.data(c,category).needsReview)issues.push("Copied tee data must be checked against the official card before use.");
    pars.forEach((par, i) => {
      if (!Number.isInteger(par) || par < 3 || par > 6)
        issues.push(`Hole ${i + 1}: par must be 3, 4, 5 or 6.`);
    });
    metres.forEach((distance, i) => {
      if (!Number.isFinite(distance) || distance <= 0)
        issues.push(`Hole ${i + 1}: distance is missing.`);
    });
    indexes.forEach((index, i) => {
      if (!Number.isInteger(index) || index < 1 || index > 18)
        issues.push(`Hole ${i + 1}: handicap index must begin with 1â€“18.`);
    });
    const validIndexes = indexes.filter(
      (index) => Number.isInteger(index) && index >= 1 && index <= 18,
    );
    if (validIndexes.length === 18 && new Set(validIndexes).size !== 18)
      issues.push("The primary handicap indexes contain a duplicate.");
    const secondaryIndexes = [];
    Array.from({ length: 18 }, (_, i) => {
      const raw = String(v.index?.[i] ?? "").trim();
      if (!raw.includes("/")) return;
      if (!/^([1-9]|1[0-8])\/(19|2[0-9]|3[0-6])$/.test(raw))
        issues.push(`Hole ${i + 1}: secondary handicap index must be 19â€“36 after the primary index.`);
      else secondaryIndexes.push(Number(raw.split("/")[1]));
    });
    if (new Set(secondaryIndexes).size !== secondaryIndexes.length)
      issues.push("The secondary handicap indexes contain a duplicate.");
    return {
      ok: issues.length === 0,
      issues,
      outPar: pars.slice(0, 9).reduce((sum, par) => sum + (Number.isFinite(par) ? par : 0), 0),
      inPar: pars.slice(9).reduce((sum, par) => sum + (Number.isFinite(par) ? par : 0), 0),
      totalPar: pars.reduce(
        (sum, par) => sum + (Number.isFinite(par) ? par : 0),
        0,
      ),
      outMetres: metres.slice(0, 9).reduce((sum, distance) => sum + (Number.isFinite(distance) ? distance : 0), 0),
      inMetres: metres.slice(9).reduce((sum, distance) => sum + (Number.isFinite(distance) ? distance : 0), 0),
      totalMetres: metres.reduce((sum, distance) => sum + (Number.isFinite(distance) ? distance : 0), 0),
    };
  }
  function ensureCourseData(c) {
    c.address = c.address || "";
    c.clubPhone = c.clubPhone || "";
    c.proPhone = c.proPhone || c.phone || "";
    c.phone = c.proPhone;
    c.clubEmail = c.clubEmail || c.email || "";
    c.proEmail = c.proEmail || "";
    c.proName = c.proName || "";
    c.website = c.website || "";
    c.email = c.clubEmail;
    c.mapLink = c.mapLink || "";
    c.notes = c.notes || "";
    c.region = c.region || courseRegionByName[c.name] || "";
    if (!c.teeDetails) {
      const v = version(c) || {},
        par = (v.par || []).reduce((x, y) => x + (+y || 0), 0) || "",
        length = (v.metres || []).reduce((x, y) => x + (+y || 0), 0) || "";
      c.teeDetails = {
        back: {
          name: "Back",
          colour: "Blue",
          slope: "",
          scratch: "",
          par: "",
          length: "",
        },
        middle: {
          name: "Middle",
          colour: "White",
          slope: v.slope || "",
          scratch: v.scratch || "",
          par,
          length,
        },
        front: {
          name: "Front",
          colour: "Yellow",
          slope: "",
          scratch: "",
          par: "",
          length: "",
        },
      };
    }
    for (const tee of EVENT_TEES) {
      c.teeDetails[tee] = c.teeDetails[tee] || {};
      c.teeDetails[tee].name = EVENT_TEE_LABELS[tee];
      c.teeDetails[tee].colour = teeMarkerColour(tee, c);
    }
    ensureTeeScorecards(c);
  }
  store.courses.forEach(ensureCourseData);

  // Authoritative Oatlands card supplied by the organiser and checked against
  // MiScore. Upgrade only the original incomplete placeholder; never overwrite a
  // later, complete organiser-edited card.
  const OATLANDS_CARD_2026 = {
    metres: [
      315, 193, 351, 369, 158, 397, 116, 276, 478, 117, 301, 316, 137, 466, 366,
      495, 272, 379,
    ],
    par: [4, 3, 4, 4, 3, 4, 3, 4, 5, 3, 4, 4, 3, 5, 4, 5, 4, 4],
    index: [
      "8/28",
      "12/33",
      "7/25",
      "6/24",
      "13/32",
      "2/21",
      "18/36",
      "15/31",
      "10/27",
      "17/35",
      "11/29",
      "3/23",
      "16/34",
      "4/19",
      "5/22",
      "9/26",
      "14/30",
      "1/20",
    ],
  };
  function enforceAuthoritativeOatlandsCard() {
    const oatlandsCourse = (store.courses || []).find((c) =>
      /^oatlands(?: gc| golf club)?$/i.test(String(c.name || "").trim()),
    );
    if (!oatlandsCourse || store.courseLibrary?.bases?.[String(oatlandsCourse.id)]) return false;
    ensureCourseData(oatlandsCourse);
    const ov = version(oatlandsCourse) || {},
      cardMatches =
        JSON.stringify(ov.metres || []) === JSON.stringify(OATLANDS_CARD_2026.metres) &&
        JSON.stringify(ov.par || []) === JSON.stringify(OATLANDS_CARD_2026.par) &&
        JSON.stringify(ov.index || []) === JSON.stringify(OATLANDS_CARD_2026.index);
    if (
      oatlandsCourse.scorecardAuthorityVersion !== "15.79-oatlands-v1" ||
      !cardMatches ||
      Boolean(oatlandsCourse.versions?.length)
    ) {
      ov.metres = [...OATLANDS_CARD_2026.metres];
      ov.par = [...OATLANDS_CARD_2026.par];
      ov.index = [...OATLANDS_CARD_2026.index];
      ov.slope = "";
      ov.scratch = "70";
      ov.teeName = "Middle";
      oatlandsCourse.region = oatlandsCourse.region || "Sydney";
      oatlandsCourse.address =
      oatlandsCourse.address || "Bettington Rd Oatlands";
      oatlandsCourse.clubPhone = oatlandsCourse.clubPhone || "+61 2 9630 4444";
      oatlandsCourse.proPhone = oatlandsCourse.proPhone || "+61 2 9630 1423";
      oatlandsCourse.phone = oatlandsCourse.proPhone;
      oatlandsCourse.clubEmail =
        oatlandsCourse.clubEmail || "administration@oatlandsgolf.com.au";
      oatlandsCourse.email = oatlandsCourse.clubEmail;
      oatlandsCourse.proName = oatlandsCourse.proName || "Jeremy Ward";
      oatlandsCourse.website =
        oatlandsCourse.website || "https://www.oatlandsgolf.com.au/";
      oatlandsCourse.teeDetails.middle = {
        ...(oatlandsCourse.teeDetails.middle || {}),
        name: "Middle",
        colour: "White",
        slope: "",
        scratch: "70",
        par: "70",
        length: "5502",
      };
      oatlandsCourse.teeScorecards.middle = cloneCourseCard(ov, "middle");
      oatlandsCourse.activeScorecardTee = "middle";
      delete oatlandsCourse.versions;
      delete oatlandsCourse.activeVersionId;
      oatlandsCourse.scorecardAuthorityVersion = "15.79-oatlands-v1";
      return true;
    }
    return false;
  }
  enforceAuthoritativeOatlandsCard();

  // Official Long Reef card supplied by the organiser. Apply it to the named
  // on-device draft once, including the separately stored course-editor draft,
  // so the organiser can review and publish it through the normal signed-in
  // Save Completed Course action.
  const LONG_REEF_CARD_2026 = {
    men: {
      par: [5,3,4,4,4,4,3,4,5,3,4,4,3,4,5,4,4,4],
      index: ["6/22","11/34","15/30","8/24","7/21","17/32","3/31","16/33","18/36","1/27","14/29","12/25","10/35","9/26","13/28","4/20","2/19","5/23"],
      tees: {
        back: {colour:"Black",slope:"133",scratch:"73",metres:[450,152,315,393,352,271,178,298,444,217,374,347,138,390,462,415,400,359]},
        middle: {colour:"Blue",slope:"130",scratch:"72",metres:[441,139,303,382,341,263,173,292,438,208,367,330,129,385,454,399,391,347]},
        front: {colour:"White",slope:"129",scratch:"71",metres:[430,125,285,377,325,247,160,282,429,167,345,321,112,385,427,387,369,325]},
        tee4: {colour:"Gold",slope:"120",scratch:"68",metres:[422,111,255,323,287,233,112,273,384,152,336,278,93,377,360,367,314,266]},
      },
    },
    women: {
      par: [5,3,4,5,4,4,3,4,5,3,4,4,3,4,5,5,4,4],
      index: ["2","15","16","13","4","12","18","9","6","11","8","10","17","1","7","14","3","5"],
      tees: {
        back: {colour:"Red",slope:"134",scratch:"76",metres:[433,134,261,366,292,257,120,286,426,169,358,302,99,372,372,404,340,312]},
        middle: {colour:"Gold",slope:"129",scratch:"73",metres:[422,111,255,323,287,233,112,273,384,152,336,278,93,377,360,367,314,266]},
      },
    },
  };
  function applyOfficialLongReefCard(courseRecord) {
    if (!courseRecord || courseRecord.scorecardAuthorityVersion === "15.95.40-long-reef-v1") return false;
    ensureCourseData(courseRecord);
    const installCategory = (category, definition) => {
      const target = GolfCourseCategories.data(courseRecord, category, true);
      target.teePositionCount = Object.keys(definition.tees).length;
      target.teeDetails ||= {};
      target.teeScorecards ||= {};
      for (const [tee, details] of Object.entries(definition.tees)) {
        const total = details.metres.reduce((sum, value) => sum + value, 0);
        target.teeDetails[tee] = {...(target.teeDetails[tee] || {}),name:GolfCourseCategories.positionLabel(target,tee),colour:details.colour,slope:details.slope,scratch:details.scratch,par:String(definition.par.reduce((sum,value)=>sum+value,0)),length:total};
        target.teeScorecards[tee] = {tee,par:[...definition.par],index:[...definition.index],metres:[...details.metres],distanceUnit:"metres",distanceInputUnit:"metres"};
      }
      target.activeScorecardTee = "back";
      if (category === "women") target.needsReview = false;
    };
    installCategory("men", LONG_REEF_CARD_2026.men);
    installCategory("women", LONG_REEF_CARD_2026.women);
    delete courseRecord.versions;
    delete courseRecord.activeVersionId;
    courseRecord.country = courseRecord.country || "Australia";
    courseRecord.state = courseRecord.state || "NSW";
    courseRecord.region = courseRecord.region || "Sydney";
    courseRecord.website = courseRecord.website || "https://longreefgolfclub.com.au/";
    courseRecord.scorecardAuthorityVersion = "15.95.40-long-reef-v1";
    return true;
  }
  function installOfficialLongReefDraft() {
    const longReef = (store.courses || []).find(c => /^long reef(?: gc| golf club)?$/i.test(String(c.name || "").trim()));
    if (!longReef) return false;
    const cloudBase = Boolean(store.courseLibrary?.bases?.[String(longReef.id)]);
    let changed = cloudBase ? false : applyOfficialLongReefCard(longReef);
    const draftKey = "awayGolfCourseDraft:" + longReef.id;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (draft?.course?.id === longReef.id && applyOfficialLongReefCard(draft.course)) {
        draft.savedAt = new Date().toISOString();
        localStorage.setItem(draftKey, JSON.stringify(draft));
        changed = true;
      }
    } catch (_) {}
    return changed;
  }
  installOfficialLongReefDraft();

  // Official Asquith card supplied by the organiser. As with Long Reef, fill
  // the organiser's existing on-device course and editor draft once so it can
  // be reviewed before the normal Save Completed Course cloud publication.
  const ASQUITH_CARD_2026 = {
    men: {
      par: [5,4,3,4,4,3,4,5,3,4,4,3,5,3,5,4,3,4],
      index: ["14","15","7","3","5","12","2","11","17","8","4","16","9","18","10","6","13","1"],
      tees: {
        back: {colour:"Blue",slope:"134",scratch:"70",metres:[424,270,188,379,339,144,376,434,159,364,313,134,478,126,463,347,163,393]},
        middle: {colour:"White",slope:"131",scratch:"68",metres:[409,263,188,355,330,127,367,389,129,355,297,126,464,126,437,329,151,368]},
      },
    },
    women: {
      par: [5,4,3,4,4,3,4,5,3,4,4,3,5,3,5,4,3,5],
      index: ["2","11","13","6","10","15","4","8","17","7","3","16","1","18","9","5","14","12"],
      tees: {
        back: {colour:"Red",slope:"137",scratch:"73",metres:[389,262,179,341,325,136,367,382,122,347,294,117,437,120,389,311,132,387]},
        middle: {colour:"Yellow",slope:"131",scratch:"70",metres:[352,255,173,330,272,120,356,356,116,329,246,105,413,110,325,292,132,289]},
      },
    },
  };
  function applyOfficialAsquithCard(courseRecord) {
    if (!courseRecord || courseRecord.scorecardAuthorityVersion === "15.95.41-asquith-v1") return false;
    ensureCourseData(courseRecord);
    const installCategory = (category, definition) => {
      const target = GolfCourseCategories.data(courseRecord, category, true);
      target.teePositionCount = Object.keys(definition.tees).length;
      target.teeDetails ||= {};
      target.teeScorecards ||= {};
      for (const [tee, details] of Object.entries(definition.tees)) {
        const total = details.metres.reduce((sum, value) => sum + value, 0);
        target.teeDetails[tee] = {...(target.teeDetails[tee] || {}),name:GolfCourseCategories.positionLabel(target,tee),colour:details.colour,slope:details.slope,scratch:details.scratch,par:String(definition.par.reduce((sum,value)=>sum+value,0)),length:total};
        target.teeScorecards[tee] = {tee,par:[...definition.par],index:[...definition.index],metres:[...details.metres],distanceUnit:"metres",distanceInputUnit:"metres"};
      }
      target.activeScorecardTee = "back";
      if (category === "women") target.needsReview = false;
    };
    installCategory("men", ASQUITH_CARD_2026.men);
    installCategory("women", ASQUITH_CARD_2026.women);
    delete courseRecord.versions;
    delete courseRecord.activeVersionId;
    courseRecord.country = courseRecord.country || "Australia";
    courseRecord.state = courseRecord.state || "NSW";
    courseRecord.region = courseRecord.region || "Sydney";
    courseRecord.website = courseRecord.website || "https://www.asquithgolfclub.com.au/";
    courseRecord.scorecardAuthorityVersion = "15.95.41-asquith-v1";
    return true;
  }
  function installOfficialAsquithDraft() {
    const asquith = (store.courses || []).find(c => /^asquith(?: gc| golf club)?$/i.test(String(c.name || "").trim()));
    if (!asquith) return false;
    const cloudBase = Boolean(store.courseLibrary?.bases?.[String(asquith.id)]);
    let changed = cloudBase ? false : applyOfficialAsquithCard(asquith);
    const draftKey = "awayGolfCourseDraft:" + asquith.id;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (draft?.course?.id === asquith.id && applyOfficialAsquithCard(draft.course)) {
        draft.savedAt = new Date().toISOString();
        localStorage.setItem(draftKey, JSON.stringify(draft));
        changed = true;
      }
    } catch (_) {}
    return changed;
  }
  installOfficialAsquithDraft();

  // Official Bayview card supplied by the organiser. The source display
  // repeats women's index 8 at holes 7 and 15 and omits 10; hole 15 uses the
  // missing index 10 so the women's card remains a valid 1â€“18 sequence.
  const BAYVIEW_CARD_2026 = {
    men: {
      par: [4,5,4,3,4,4,4,3,4,3,4,3,4,5,5,4,4,4],
      index: ["1","12","4","7","15","3","8","14","9","6","18","5","13","17","11","16","2","10"],
      tees: {
        back: {colour:"Black",slope:"133",scratch:"73",metres:[397,470,343,170,305,325,375,137,377,210,211,192,329,430,493,300,413,326]},
        middle: {colour:"Blue",slope:"128",scratch:"71",metres:[375,442,335,165,285,317,346,135,364,191,198,186,329,419,479,286,404,326]},
        front: {colour:"Red",slope:"126",scratch:"70",metres:[378,432,323,162,280,309,331,107,356,210,207,172,320,404,424,247,412,294]},
        tee4: {colour:"White",slope:"128",scratch:"68",metres:[350,415,318,162,275,317,315,110,354,171,138,186,317,407,425,270,413,269]},
        tee5: {colour:"Gold",slope:"121",scratch:"67",metres:[350,405,313,150,273,291,315,86,326,183,175,166,290,392,365,237,381,278]},
      },
    },
    women: {
      par: [5,5,4,3,4,4,4,3,4,4,4,3,4,4,5,4,5,4],
      index: ["6","14","1","9","11","3","8","17","2","18","12","13","7","15","10","16","4","5"],
      tees: {
        back: {colour:"Black",slope:"139",scratch:"76",metres:[397,470,343,170,305,325,375,137,377,210,211,192,329,430,493,300,413,326]},
        middle: {colour:"Blue",slope:"136",scratch:"75",metres:[375,442,335,165,285,317,346,135,364,191,198,186,329,419,479,286,404,326]},
        front: {colour:"Red",slope:"134",scratch:"74",metres:[378,432,323,162,280,309,331,107,356,210,207,172,320,404,424,247,412,294]},
        tee4: {colour:"Gold",slope:"132",scratch:"72",metres:[350,405,313,150,273,291,315,86,326,183,175,166,290,392,365,237,381,278]},
      },
    },
  };
  function applyOfficialBayviewCard(courseRecord) {
    if (!courseRecord || courseRecord.scorecardAuthorityVersion === "15.95.42-bayview-v1") return false;
    ensureCourseData(courseRecord);
    const installCategory = (category, definition) => {
      const target = GolfCourseCategories.data(courseRecord, category, true);
      target.teePositionCount = Object.keys(definition.tees).length;
      target.teeDetails ||= {};
      target.teeScorecards ||= {};
      for (const [tee, details] of Object.entries(definition.tees)) {
        const total = details.metres.reduce((sum, value) => sum + value, 0);
        target.teeDetails[tee] = {...(target.teeDetails[tee] || {}),name:GolfCourseCategories.positionLabel(target,tee),colour:details.colour,slope:details.slope,scratch:details.scratch,par:String(definition.par.reduce((sum,value)=>sum+value,0)),length:total};
        target.teeScorecards[tee] = {tee,par:[...definition.par],index:[...definition.index],metres:[...details.metres],distanceUnit:"metres",distanceInputUnit:"metres"};
      }
      target.activeScorecardTee = "back";
      if (category === "women") target.needsReview = false;
    };
    installCategory("men", BAYVIEW_CARD_2026.men);
    installCategory("women", BAYVIEW_CARD_2026.women);
    delete courseRecord.versions;
    delete courseRecord.activeVersionId;
    courseRecord.country = courseRecord.country || "Australia";
    courseRecord.state = courseRecord.state || "NSW";
    courseRecord.region = courseRecord.region || "Sydney";
    courseRecord.website = courseRecord.website || "https://bayviewgolfclub.com.au/";
    courseRecord.scorecardAuthorityVersion = "15.95.42-bayview-v1";
    return true;
  }
  function installOfficialBayviewDraft() {
    const bayview = (store.courses || []).find(c => /^bayview(?: gc| golf club)?$/i.test(String(c.name || "").trim()));
    if (!bayview) return false;
    const cloudBase = Boolean(store.courseLibrary?.bases?.[String(bayview.id)]);
    let changed = cloudBase ? false : applyOfficialBayviewCard(bayview);
    const draftKey = "awayGolfCourseDraft:" + bayview.id;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (draft?.course?.id === bayview.id && applyOfficialBayviewCard(draft.course)) {
        draft.savedAt = new Date().toISOString();
        localStorage.setItem(draftKey, JSON.stringify(draft));
        changed = true;
      }
    } catch (_) {}
    return changed;
  }
  installOfficialBayviewDraft();

  // Bathurst card supplied by the organiser. The printed card provides one
  // men's and one women's set of distances plus ACR/AWCR, but no slope values.
  const BATHURST_CARD_2026 = {
    men: {
      par: [4,5,4,4,3,4,4,3,5,4,4,4,3,4,5,3,4,4],
      index: ["6/22","12/30","9/25","16/34","2/27","4/20","7/23","18/36","13/31","1/19","17/35","15/33","10/28","8/24","11/29","3/26","14/32","5/21"],
      tees: {
        back: {colour:"Blue",slope:"",scratch:"71",metres:[368,462,392,299,190,386,377,125,504,407,306,316,158,326,525,191,342,391]},
      },
    },
    women: {
      par: [4,5,4,4,3,4,4,3,5,5,4,4,3,4,5,3,4,4],
      index: ["10","8","6","18","12","2","16","14","4","17","5","9","13","1","7","15","11","3"],
      tees: {
        back: {colour:"Red",slope:"",scratch:"73",metres:[294,389,372,202,140,356,269,109,460,384,267,296,121,295,435,159,335,356]},
      },
    },
  };
  function applyOfficialBathurstCard(courseRecord) {
    if (!courseRecord || courseRecord.scorecardAuthorityVersion === "15.95.43-bathurst-v1") return false;
    ensureCourseData(courseRecord);
    const installCategory = (category, definition) => {
      const target = GolfCourseCategories.data(courseRecord, category, true);
      target.teePositionCount = 1;
      target.teeDetails ||= {};
      target.teeScorecards ||= {};
      for (const [tee, details] of Object.entries(definition.tees)) {
        const total = details.metres.reduce((sum, value) => sum + value, 0);
        target.teeDetails[tee] = {...(target.teeDetails[tee] || {}),name:GolfCourseCategories.positionLabel(target,tee),colour:details.colour,slope:details.slope,scratch:details.scratch,par:String(definition.par.reduce((sum,value)=>sum+value,0)),length:total};
        target.teeScorecards[tee] = {tee,par:[...definition.par],index:[...definition.index],metres:[...details.metres],distanceUnit:"metres",distanceInputUnit:"metres"};
      }
      target.activeScorecardTee = "back";
      if (category === "women") target.needsReview = false;
    };
    installCategory("men", BATHURST_CARD_2026.men);
    installCategory("women", BATHURST_CARD_2026.women);
    delete courseRecord.versions;
    delete courseRecord.activeVersionId;
    courseRecord.country = courseRecord.country || "Australia";
    courseRecord.state = courseRecord.state || "NSW";
    courseRecord.region = courseRecord.region || "Bathurst/Orange";
    courseRecord.scorecardAuthorityVersion = "15.95.43-bathurst-v1";
    return true;
  }
  function installOfficialBathurstDraft() {
    const bathurst = (store.courses || []).find(c => /^bathurst(?: gc| golf club)?$/i.test(String(c.name || "").trim()));
    if (!bathurst) return false;
    const cloudBase = Boolean(store.courseLibrary?.bases?.[String(bathurst.id)]);
    let changed = cloudBase ? false : applyOfficialBathurstCard(bathurst);
    const draftKey = "awayGolfCourseDraft:" + bathurst.id;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (draft?.course?.id === bathurst.id && applyOfficialBathurstCard(draft.course)) {
        draft.savedAt = new Date().toISOString();
        localStorage.setItem(draftKey, JSON.stringify(draft));
        changed = true;
      }
    } catch (_) {}
    return changed;
  }
  installOfficialBathurstDraft();
  writeLocalStore();

  let cloudReady = false,
    cloudBusy = false,
    cloudMessage = "Connecting securelyâ€¦",
    cloudChannel = null,
    cloudReloadTimer = null,
    organiserPollTimer = null,
    cloudPollInFlight = false,
    lastCloudBundleSignature = "";
  const cloudRoundTimers = new Map();
  const cloudRoundChains = new Map();
  const isPlayerDevice = () =>
    store.cloud?.role === "player" && Boolean(store.cloud?.eventId);
  const isSpectatorDevice = () =>
    store.cloud?.role === "spectator" && Boolean(store.cloud?.eventId);
  const isGuestOrganiser = () =>
    store.cloud?.role === "organiser" &&
    Boolean(store.cloud?.eventId) &&
    Boolean(store.cloud?.guestOrganiser);
  const isFreshMobileDevice = () =>
    !store.event &&
    !store.cloud?.eventId &&
    window.matchMedia("(max-width:700px) and (pointer:coarse)").matches;
  function setQuickJoinStatus(message, error = false) {
    const el = $("#quickJoinStatus");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", error);
  }
  function applyDeviceRole() {
    document.body.classList.toggle("playerDevice", isPlayerDevice());
    document.body.classList.toggle("spectatorDevice", isSpectatorDevice());
    document.body.classList.toggle("guestOrganiserDevice", isGuestOrganiser());
    document.body.classList.toggle("joinOnlyDevice", isFreshMobileDevice());
    if (
      (isPlayerDevice() || isSpectatorDevice()) &&
      !["home", "scorePage", "leaderboardPage"].includes(
        $(".page.active")?.id || "",
      )
    ) nav(isSpectatorDevice() ? "leaderboardPage" : "scorePage");
    const guest = isGuestOrganiser();
    ["newEvent", "myEvents", "publishedEvents", "pastEvents", "organiserBackup", "ownerAccount"].forEach((id) => {
      const element = $("#" + id);
      if (element) element.hidden = guest;
    });
    const eventOptions = $("#eventOptions");
    if (eventOptions) eventOptions.hidden = !store.event;
    const guestAccess = $("#guestOrganiserAccess");
    if (guestAccess) {
      guestAccess.hidden = guest;
      guestAccess.textContent = "Guest Organiser";
    }
    updateWakeIndicator();
  }
  function cloudPlayerIds() {
    const ids = new Set((store.event?.confirmed || []).map(String));
    Object.values(store.event?.groupSetup || {}).forEach((s) =>
      (s?.groups || []).flat().forEach((id) => {
        if (String(id) !== NO_PARTNER_ID) ids.add(String(id));
      }),
    );
    Object.values(store.event?.sharedPositions || {}).forEach(days=>Object.values(days).forEach(id=>ids.add(String(id))));
    return [...ids].filter((id) => player(id));
  }
  function normaliseTwoDaySingleStableford(event) {
    if (!event || +event.days < 2 || !Array.isArray(event.competitions)) return;
    // Two-day Stableford is represented by `combined`, with its daily,
    // aggregate or both format stored separately. A legacy `single` entry can
    // otherwise survive beside it and reappear on player phones as an unwanted
    // one-day competition with an old prize.
    if (event.competitions.includes("combined"))
      event.competitions = event.competitions.filter((id) => id !== "single");
  }
  function clearImpossibleDraftRuntime(event) {
    if (!event || event.locked || event.status !== "planned") return;
    event.scoring = { day1: {}, day2: {} };
    event.roundFinalised = { day1: {}, day2: {} };
    event.prizesAwarded = {};
    delete event.finalResults;
    delete event.roundClosedAt;
    delete event.organiserCorrections;
    delete event.emergencyRecoveryLog;
  }
  function cloudPayload(sourceEvent = store.event) {
    const event = JSON.parse(JSON.stringify(sourceEvent || {}));
    normaliseTwoDaySingleStableford(event);
    synchroniseSingleTeeGroupStarts(event);
    delete event.courseSnapshot;
    delete event.scoring;
    delete event.playerRoundMode;
    delete event.playerHolePos;
    delete event.playerPreviewId;
    delete event.playerPreviewDay;
    delete event.playerPreviewAck;
    delete event.playerRulesOpen;
    delete event.playerVerificationStage;
    delete event.returnToMarkedVerification;
    delete event.leaderboardTab;
    delete event.leaderboardView;
    delete event.liveControlDay;
    delete event.activeGroupDay;
    delete event.leaderboardScrollLeft;
    delete event.workspaceId;
    // The join code identifies the cloud connection on this device. It is not
    // an editable part of the published event plan and must not make an opened
    // event appear to be waiting for upload.
    delete event.joinCode;
    // This is a receipt recorded by the organiser device after the cloud has
    // accepted the final update. It is not part of the shared event plan and
    // must not create a perpetual "waiting to upload" safe-copy record.
    delete event.finalUpdateCloudSentAt;
    const players = cloudPlayerIds().map((id) => {
      const p = player(id);
      return {
        id: String(p.id),
        name: p.name,
        ga: sourceEvent?.gaHandicaps?.[String(id)] ?? p.ga ?? "",
        rosterActive: true,
        golfLink: "",
        homeClub: "",
        notes: "",
      };
    });
    const courseIds = eventDays(event).map(day => event["course" + day])
      .filter(Boolean)
      .map(String);
    const courses = (sourceEvent?.locked && sourceEvent.courseSnapshot ? sourceEvent.courseSnapshot : store.courses)
      .filter((c) => courseIds.includes(String(c.id)))
      .map((c) => JSON.parse(JSON.stringify(c)));
    return { event, players, courses };
  }
  function cloudPlayerRows() {
    return cloudPlayerIds().map((id) => {
      const p = player(id);
      return {
        id: String(id),
        name: p.name,
        dailyHandicaps: Object.fromEntries(eventDays().map(day => ["day" + day, playerDailyHandicap(id, day)])),
      };
    });
  }
  function setCloudMessage(message, busy = false) {
    cloudMessage = message;
    window.GolfSafeCloud?.reportStatus(message,store.cloud?.eventId);
    cloudBusy = busy;
    renderCloudPanel();
  }
  function cloudTimeout(promise, milliseconds = 12000) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("The cloud connection took too long to respond.")),
          milliseconds,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  }
  function preparePhoneForJoinedEvent(eventId) {
    const previousEventId = String(store.cloud?.eventId || "");
    const nextEventId = String(eventId || "");
    if (previousEventId && previousEventId === nextEventId) return false;
    if (!store.event) return true;

    // Phone scorecards belong to one cloud event only. A duplicated or newly
    // joined event must never inherit scores or navigation state from the
    // previous event. Existing online scores for the new event are loaded
    // immediately afterwards by applyRemoteCloud.
    store.event.scoring = { day1: {}, day2: {} };
    store.event.playerRoundMode = "preview";
    store.event.playerHolePos = 0;
    store.event.playerPreviewDay = 1;
    store.event.playerPreviewId = "";
    store.event.playerRulesOpen = false;
    store.event.playerPreviewAck = {};
    store.event.leaderboardTab = "";
    store.event.leaderboardView = "";
    return true;
  }

  function resetDuplicatedEventRuntime(event) {
    delete event.courseSnapshot;
    event.scoring = { day1: {}, day2: {} };
    event.roundFinalised = { day1: {}, day2: {} };
    event.prizesAwarded = {};
    event.playerRoundMode = "preview";
    event.playerHolePos = 0;
    event.playerPreviewDay = 1;
    event.playerPreviewId = "";
    event.playerRulesOpen = false;
    event.playerPreviewAck = {};
    event.liveControlDay = 1;
    event.leaderboardTab = "";
    event.leaderboardView = "";
    delete event.finalResults;
    delete event.roundClosedAt;
    delete event.scoringOpenedEarly;
    delete event.playerStartingHoleNotice;
    delete event.playerVerificationStage;
    delete event.returnToMarkedVerification;
    delete event.organiserCorrections;
    delete event.emergencyRecoveryLog;
    delete event.emergencyReplacements;
    delete event.finalUpdateAt;
    delete event.previewPublishedAt;
    delete event.setupStage;
    delete event.joinCode;
    delete event.cancelledAt;
    return event;
  }
  function eventStartingHoleForPlayer(event, playerId, day) {
    const setup = event?.groupSetup?.["day" + day];
    if (!setup?.groups?.length) return null;
    const groupIndex = setup.groups.findIndex((group) =>
      (group || []).some((id) => String(id) === String(playerId)),
    );
    if (groupIndex < 0) return null;
    return groupStartingHole(event, day, groupIndex);
  }
  function renderPlayerExperienceAfterCloudRefresh() {
    if (!document.querySelector("#scorePage.active")) return;
    // A live update from another phone must never replace the score-entry DOM
    // while this player is entering a hole. On touch devices, replacing a
    // button between pointerdown and click silently loses the tap. Remote
    // scores are already merged into store above and will appear on the next
    // local scoring render. Verification screens still refresh so completed
    // player/marker cards can agree without a manual reload.
    if (
      store.event?.playerRoundMode === "completed" ||
      (store.cloud?.role === "player" &&
        store.event?.playerRoundMode === "scoring")
    )
      return;
    const scrollingElement = document.scrollingElement || document.documentElement;
    const pageScrollTop = scrollingElement?.scrollTop || window.scrollY || 0;
    const rulesScrollTop = document.querySelector("#playerExperience .playerRulesPanel")?.scrollTop || 0;
    const restoreScrollPositions = () => {
      const page = document.scrollingElement || document.documentElement;
      const rules = document.querySelector("#playerExperience .playerRulesPanel");
      if (pageScrollTop) {
        if (page) page.scrollTop = pageScrollTop;
        else window.scrollTo(0, pageScrollTop);
      }
      if (rules) rules.scrollTop = rulesScrollTop;
    };
    renderPlayerExperience();
    restoreScrollPositions();
    // Mobile browsers can apply their own scroll anchoring after innerHTML is
    // replaced. Restore both the page and its independently scrolling Rules
    // panel once more on the next paint.
    requestAnimationFrame(restoreScrollPositions);
  }
  function safeCloudBundle(bundle) {
    if(!AwayCloud.reconcile || !store.cloud?.eventId || !store.event)return bundle;
    const id=store.cloud.eventId,clone=JSON.parse(JSON.stringify(bundle));
    if(store.cloud.role==="organiser" && !store.cloud.restorePublished && !store.cloud.secondaryOrganiser) {
      const health=AwayCloud.saveHealth?.(id)||{},
        finalPlanIsAuthoritative=Boolean(
          store.event?.locked &&
          store.event?.finalUpdateCloudSentAt &&
          !health.pendingPlans &&
          !health.conflicts
        );
      // After Final Update, routine polling is read-only. Deliberate organiser
      // changes use updateCloudEvent(), which creates a protected pending save
      // before contacting the cloud. A plain refresh must therefore accept the
      // verified online plan rather than turn harmless render normalisation
      // into another unsent event plan.
      const merged=finalPlanIsAuthoritative
        ? clone.event.event_data
        : AwayCloud.reconcile(id,"event",cloudPayload(),clone.event.event_data,clone.event.revision);
      if(finalPlanIsAuthoritative){
        AwayCloud.safeReconcileAcknowledged?.(id,"event",clone.event.event_data,clone.event.revision);
        store.cloud.restorePublished=true;
      }
      const scoring=store.event.scoring,courseSnapshot=store.event.courseSnapshot,
        finalUpdateCloudSentAt=store.event.finalUpdateCloudSentAt;
      const ui=Object.fromEntries(Object.entries(store.event).filter(([k])=>k!=="playerSubstitutions" && /^(player|leaderboard|liveControlDay|activeGroupDay|workspaceId)/.test(k)));
      store.event={...merged.event,...ui,scoring,courseSnapshot};
      const verifiedFinalReceipt = finalUpdateCloudSentAt ||
        (merged.event?.locked &&
          (merged.event?.finalUpdateAt || merged.event?.lockedAt));
      if(verifiedFinalReceipt)
        store.event.finalUpdateCloudSentAt=verifiedFinalReceipt;
      clone.event.event_data=merged;
    }
    for(const row of clone.scores||[]) {
      // Player phones are the authority for ordinary scorecard entry. An
      // organiser PC or tablet merely displaying an earlier revision must not
      // be treated as a second editor when a later player-phone revision
      // arrives. Deliberate organiser corrections already pass through the
      // protected save path before polling, so the verified online row is the
      // correct display source here.
      if(store.cloud?.role==="organiser")continue;
      const ownActiveRound =
        store.cloud?.role === "player" &&
        String(row.scorer_player_id) === String(store.cloud.playerId) &&
        ["scoring", "verify"].includes(store.event?.playerRoundMode);
      // Realtime may echo an earlier revision while this phone is still
      // entering the same card. The visible-card guard in applyRemoteCloud()
      // prevents that echo replacing the live object; the safety layer must
      // also leave its acknowledged base alone. Reconciling here can mistake
      // two sequential saves from this one phone for independent edits,
      // create a protected conflict and then block every later hole upload.
      // The card is reconciled normally after scoring/verification ends.
      if(ownActiveRound)continue;
      const local=store.event.scoring?.["day"+row.day]?.[String(row.scorer_player_id)];
      if(local && Object.keys(local).length)row.score_data=AwayCloud.reconcile(id,"score",local,row.score_data,row.revision,+row.day,String(row.scorer_player_id));
    }
    return clone;
  }
  async function reviewSafeCloudConflicts() {
    if(store.cloud?.role!=="organiser")return;
    const connection=store.cloud;
    try {
      const rows=await AwayCloud.safeConflicts(connection.eventId);
      if(store.cloud!==connection)return;
      if(!rows.length)return alert("There are no conflicting saved copies to review.");
      const row=rows[0],comparison=GolfSafeCloud.merge(row.base_data,row.local_data,row.remote_data);
      const label=path=>path.map((key,i)=>i===0&&/^([1-9]|1[0-8])$/.test(key)?"Hole "+key:key).join(" Â· ");
      const value=v=>v===undefined?"Removed":JSON.stringify(v);
      $("#modalContent").innerHTML=`<h2>Review Saved Copies</h2><p>${row.kind==="score"?esc(player(row.player_id)?.name||row.player_id)+" Â· Day "+row.day:"Event plan"} Â· ${rows.length} review${rows.length===1?"":"s"} outstanding</p><p>Independent changes are combined. Choose the correct value for each difference. Both original copies are retained.</p><div class="rowBtns"><button class="primary" id="keepIncomingSafeReviews">Keep Incoming Device Copy for All ${rows.length===1?"Differences":"Reviews"}</button><button class="soft" id="keepOnlineSafeReviews">Keep Online Copy for All ${rows.length===1?"Differences":"Reviews"}</button></div><p class="hint"><b>Incoming device</b> is the copy retained on the phone or tablet that made the unsent changes. <b>Online copy</b> is the version already visible to the organiser.</p><div style="overflow:auto;max-height:45vh"><table><thead><tr><th>Field</th><th>Incoming device</th><th>Online copy</th><th>Keep</th></tr></thead><tbody>${comparison.conflicts.map((field,i)=>`<tr><td>${esc(label(field.path))}</td><td>${esc(value(field.local))}</td><td>${esc(value(field.remote))}</td><td><select data-safechoice="${i}"><option value="">Chooseâ€¦</option><option value="local">Incoming device</option><option value="remote">Online copy</option></select></td></tr>`).join("")}</tbody></table></div><p id="safeReviewStatus" role="status"></p><button class="primary" id="saveSafeReview">Save Reviewed Copy</button><button class="soft" id="closeSafeReview">Close</button>`;
      $("#modalShade").classList.add("open");
      $("#closeSafeReview").onclick=()=>$("#modalShade").classList.remove("open");
      const resolveAllSafeReviews=async(choice)=>{
        const incoming=choice==="local";
        if(!confirm(`${incoming?"Keep the incoming device copy":"Keep the published online copy"} for all ${rows.length} outstanding review${rows.length===1?"":"s"}?\n\n${incoming?"Use this when the phone or tablet contains the complete, correct scorecard.":"Use this when the published online event has already been verified as correct."}`))return;
        const incomingButton=$("#keepIncomingSafeReviews"),onlineButton=$("#keepOnlineSafeReviews");
        incomingButton.disabled=true;onlineButton.disabled=true;$("#saveSafeReview").disabled=true;
        try {
          let result=null;
          for(const saved of rows){
            const merged=GolfSafeCloud.merge(saved.base_data,saved.local_data,saved.remote_data);
            result=await AwayCloud.resolveSafeConflict(saved.id,merged.conflicts.map(field=>({path:field.path,choice})));
            if(result?.kind==="score")scoringDayStore(result.day)[result.player_id]=result.data;
          }
          if(store.cloud!==connection)return;
          if(result?.kind==="event"){
            const scoring=store.event.scoring,courseSnapshot=store.event.courseSnapshot;
            store.event={...store.event,...result.data.event,scoring,courseSnapshot};
          }
          writeLocalStore();$("#modalShade").classList.remove("open");await syncCloudNow();
          alert(incoming?"The complete incoming device copy was saved online and all outstanding reviews were closed.":"The verified online event was kept and all outstanding reviews were closed.");
        }catch(error){$("#safeReviewStatus").textContent=error.message||String(error);incomingButton.disabled=false;onlineButton.disabled=false;$("#saveSafeReview").disabled=false;}
      };
      $("#keepIncomingSafeReviews").onclick=()=>resolveAllSafeReviews("local");
      $("#keepOnlineSafeReviews").onclick=async()=>{
        await resolveAllSafeReviews("remote");
      };
      $("#saveSafeReview").onclick=async()=>{
        const choices=comparison.conflicts.map((field,i)=>({path:field.path,choice:$(`[data-safechoice="${i}"]`).value}));
        if(choices.some(c=>!c.choice))return $("#safeReviewStatus").textContent="Choose a value for each difference.";
        $("#saveSafeReview").disabled=true;
        try {
          const result=await AwayCloud.resolveSafeConflict(row.id,choices);
          if(store.cloud!==connection)return;
          if(result.kind==="score")scoringDayStore(result.day)[result.player_id]=result.data;
          else {const scoring=store.event.scoring,courseSnapshot=store.event.courseSnapshot;store.event={...store.event,...result.data.event,scoring,courseSnapshot};}
          writeLocalStore();$("#modalShade").classList.remove("open");await syncCloudNow();
          alert("Reviewed copy saved. Both original copies remain in the audit record.");
        }catch(error){$("#safeReviewStatus").textContent=error.message||String(error);$("#saveSafeReview").disabled=false;}
      };
    }catch(error){alert("Saved-copy review could not open. "+(error.message||error));}
  }
  function applyRemoteCloud(bundle) {
    bundle=safeCloudBundle(bundle);
    const signature = JSON.stringify([store.cloud?.eventId, store.cloud?.role, bundle]);
    if (!store.cloud?.restorePublished && signature === lastCloudBundleSignature) return false;
    const payload = bundle?.event?.event_data || {};
    if (store.cloud && payload.courses) store.cloud.courseCards = JSON.parse(JSON.stringify(payload.courses));
    normaliseTwoDaySingleStableford(payload.event);
    const activePageId = document.querySelector(".page.active")?.id || "home";
    const playerId = String(store.cloud?.playerId || "");
    const playerDay = Math.min(
      +(store.event?.playerPreviewDay || 1),
      +(payload.event?.days || store.event?.days || 1),
    );
    const previousStartingHole =
      store.cloud?.role === "player"
        ? eventStartingHoleForPlayer(store.event, playerId, playerDay)
        : null;
    const remoteStartingHole =
      store.cloud?.role === "player"
        ? eventStartingHoleForPlayer(payload.event, playerId, playerDay)
        : null;
    const startingHoleChanged =
      previousStartingHole != null &&
      remoteStartingHole != null &&
      previousStartingHole !== remoteStartingHole;
    const localWorkspaceId = String(
      store.event?.workspaceId || store.activeEventId || "",
    );
    if (payload.event?.organiserCorrections) {
      store.event = store.event || {};
      store.event.organiserCorrections = mergeOrganiserCorrections(
        store.event.organiserCorrections,
        payload.event.organiserCorrections,
      );
    }
    const remoteFinalTime = Date.parse(
        payload.event?.finalUpdateAt || payload.event?.lockedAt || "",
      ) || 0,
      localFinalTime = Date.parse(
        store.event?.finalUpdateAt || store.event?.lockedAt || "",
      ) || 0,
      newerFinalOrganiser =
        store.cloud?.role === "organiser" &&
        payload.event?.locked &&
        (!store.event?.locked || remoteFinalTime > localFinalTime),
      restoreOrganiser =
      store.cloud?.role === "organiser" &&
      (store.cloud.restorePublished ||
        store.cloud.secondaryOrganiser ||
        newerFinalOrganiser) &&
      payload.event;
    if ((store.cloud?.role === "player" || store.cloud?.role === "spectator" || restoreOrganiser) && payload.event) {
      const localScoring = store.event?.scoring || { day1: {}, day2: {} };
      const localUi =
        store.cloud?.role === "player"
          ? {
              playerRoundMode: store.event?.playerRoundMode || "preview",
              playerVerificationStage: store.event?.playerVerificationStage || "mine",
              returnToMarkedVerification: Boolean(store.event?.returnToMarkedVerification),
              playerHolePos: startingHoleChanged
                ? 0
                : store.event?.playerHolePos || 0,
              playerPreviewDay: store.event?.playerPreviewDay || 1,
              playerPreviewId: store.event?.playerPreviewId || "",
              playerRulesOpen: Boolean(store.event?.playerRulesOpen),
              // Acknowledgements are normally device-local UI state, but an
              // organiser may publish one during an emergency recovery. Merge
              // the two maps by day and player so an empty local object cannot
              // erase a verified online acknowledgement on every refresh.
              playerPreviewAck: Object.fromEntries(
                [
                  ...new Set([
                    ...Object.keys(payload.event?.playerPreviewAck || {}),
                    ...Object.keys(store.event?.playerPreviewAck || {}),
                  ]),
                ].map((dayKey) => [
                  dayKey,
                  {
                    ...(payload.event?.playerPreviewAck?.[dayKey] || {}),
                    ...(store.event?.playerPreviewAck?.[dayKey] || {}),
                  },
                ]),
              ),
              leaderboardTab: store.event?.leaderboardTab || "",
              leaderboardView: store.event?.leaderboardView || "",
              playerStartingHoleNotice: startingHoleChanged
                ? {
                    day: playerDay,
                    from: previousStartingHole,
                    hole: remoteStartingHole,
                    changedAt:
                      payload.event?.startingHoleUpdate?.changedAt ||
                      new Date().toISOString(),
                  }
                : store.event?.playerStartingHoleNotice || null,
            }
          : store.cloud?.role === "spectator"
            ? {
                leaderboardTab: store.event?.leaderboardTab || "",
                leaderboardView: store.event?.leaderboardView || "",
                liveControlDay: store.event?.liveControlDay || 1,
              }
            : {
                leaderboardTab: store.event?.leaderboardTab || "",
                leaderboardView: store.event?.leaderboardView || "",
                liveControlDay: store.event?.liveControlDay || 1,
                activeGroupDay: store.event?.activeGroupDay || 1,
                playerPreviewDay: store.event?.playerPreviewDay || 1,
                playerPreviewId: store.event?.playerPreviewId || "",
                playerRoundMode: store.event?.playerRoundMode || "preview",
                playerVerificationStage:
                  store.event?.playerVerificationStage || "mine",
                returnToMarkedVerification: Boolean(
                  store.event?.returnToMarkedVerification,
                ),
                playerHolePos: store.event?.playerHolePos || 0,
                playerRulesOpen: Boolean(store.event?.playerRulesOpen),
                // Player View on the organiser PC is a local preview. A live
                // organiser refresh must not undo Got It or close the card.
                playerPreviewAck: JSON.parse(
                  JSON.stringify(store.event?.playerPreviewAck || {}),
                ),
                finalUpdateCloudSentAt:
                  store.event?.finalUpdateCloudSentAt ||
                  payload.event?.finalUpdateAt ||
                  payload.event?.lockedAt ||
                  "",
              };
      store.event = {
        ...JSON.parse(JSON.stringify(payload.event)),
        ...localUi,
        scoring: localScoring,
      };
      if (restoreOrganiser && localWorkspaceId)
        store.event.workspaceId = localWorkspaceId;
      (payload.players || []).forEach((incoming) => {
        const original=GolfPlayerSubstitution.history(payload.event,incoming.id)[0]?.previous;
        const remote=original ? {...incoming,...original,id:incoming.id} : incoming;
        const i = store.players.findIndex(
          (p) => String(p.id) === String(remote.id),
        );
        if (i >= 0) store.players[i] = { ...store.players[i], ...remote };
        else store.players.push({ ...remote });
      });
      (payload.courses || []).forEach((remote) => {
        const i = store.courses.findIndex(
          (c) => String(c.id) === String(remote.id),
        );
        if (i >= 0) { if (store.cloud?.role !== "organiser") store.courses[i] = remote; }
        else store.courses.push(remote);
      });
      consolidateCourseCards();
      enforceAuthoritativeOatlandsCard();
      if (store.cloud?.role === "player")
        store.event.playerPreviewId = String(store.cloud.playerId);
      if (restoreOrganiser) refreshOpenWizardFromCloud();
      if (restoreOrganiser) delete store.cloud.restorePublished;
    }
    (bundle?.scores || []).forEach((row) => {
      const ownActiveRound =
        store.cloud?.role === "player" &&
        String(row.scorer_player_id) === String(store.cloud.playerId) &&
        ["scoring", "verify"].includes(store.event?.playerRoundMode);
      // While this phone is actively scoring, its locally persisted round is
      // authoritative. A Realtime echo can contain the previous cloud
      // revision and must not replace the live object between consecutive
      // hole entries. The current round is loaded from the cloud normally
      // before scoring begins and again after the player leaves scoring mode.
      if (!ownActiveRound)
        scoringDayStore(+row.day)[String(row.scorer_player_id)] =
          row.score_data || {};
    });
    store.cloudPlayers = (bundle?.players || []).map((row) => ({
      playerId: String(row.player_id),
      name: row.display_name || "",
      joined: Boolean(row.joined_at),
      joinedAt: row.joined_at || null,
    }));
    store.cloudSpectatorCount = +(
      bundle?.spectatorCount ?? bundle?.spectator_count ?? 0
    ) || 0;
    lastCloudBundleSignature = signature;
    if(AwayCloud.pendingSafeSaves?.(store.cloud?.eventId)||bundle.pendingConflictCount)cloudMessage="Saved copies need organiser review";
    writeLocalStore();
    for(const pending of AwayCloud.pendingRounds?.(store.cloud?.eventId)||[]) {
      if(!cloudRoundTimers.has(`${pending.day}:${pending.playerId}`)&&!cloudRoundChains.has(`${pending.day}:${pending.playerId}`))queueCloudRound(pending.day,pending.playerId);
    }
    renderHome();
    renderPlayerExperienceAfterCloudRefresh();
    if (document.querySelector("#leaderboardPage.active")) renderLeaderboard();
  }
  async function releaseCloudPlayer(playerId) {
    if (store.cloud?.role !== "organiser" || !store.cloud?.eventId) return;
    const row = (store.cloudPlayers || []).find(
      (x) => String(x.playerId) === String(playerId),
    );
    if (
      !confirm(
        `Release ${row?.name || "this player"}'s phone connection? They can then join again on another phone.`,
      )
    )
      return;
    setCloudMessage("Releasing player connectionâ€¦", true);
    try {
      await AwayCloud.releasePlayer(store.cloud.eventId, playerId);
      cloudBusy = false;
      await syncCloudNow();
      setCloudMessage(`${row?.name || "Player"} can join again`);
    } catch (error) {
      setCloudMessage("Release did not complete");
      alert(
        "The player connection was not released. " + (error.message || error),
      );
    }
  }
  async function resetCloudPlayers() {
    if (store.cloud?.role !== "organiser" || !store.cloud?.eventId) return;
    const joined = (store.cloudPlayers || []).filter((row) => row.joined);
    if (!joined.length) return alert("No player phone connections need resetting.");
    if (
      !confirm(
        `Release all ${joined.length} player phone connections?\n\nScores will not be deleted. Every player will be able to join again with the same event code.`,
      )
    )
      return;
    setCloudMessage("Releasing all phone connectionsâ€¦", true);
    try {
      for (const row of joined)
        await AwayCloud.releasePlayer(store.cloud.eventId, row.playerId);
      cloudBusy = false;
      await syncCloudNow();
      setCloudMessage("All phones released Â· ready to join");
    } catch (error) {
      setCloudMessage("Phone release did not complete");
      alert(
        "The player connections could not all be reset. " +
          (error.message || error),
      );
    }
  }
  function leaveOrganiserMode() {
    if (isGuestOrganiser()) {
      if (!confirm("Leave this Guest Organiser event on this device?\n\nThe Owner's online event remains safe, but this device will no longer retain its planning copy.")) return;
      endGuestOrganiserSession("You have left the delegated event. Its planning copy has been removed from this device.");
      return;
    }
    if (
      !confirm(
        "Leave Organiser Mode on this device and return to player joining?\n\nThe online event and all scores will remain safe. This changes only this device.",
      )
    )
      return;
    closeCloudConnection();
    forgetOrganiserEvent();
    store.event = null;
    delete store.cloud;
    store.cloudPlayers = [];
    writeLocalStore();
    applyDeviceRole();
    renderHome();
    nav(store.cloud?.role === "player" ? activePageId : "home");
    setCloudMessage("Ready to join as a player");
  }
  function endGuestOrganiserSession(message = "Guest Organiser access has ended.") {
    const guestEventId = String(store.cloud?.eventId || ""),
      guestWorkspaceId = String(store.event?.workspaceId || "");
    closeCloudConnection();
    forgetOrganiserEvent();
    store.eventWorkspace = (store.eventWorkspace || []).filter((record) => {
      const recordEventId = String(record?.cloud?.eventId || ""),
        recordWorkspaceId = String(record?.id || "");
      return !(
        (guestEventId && recordEventId === guestEventId) ||
        (guestWorkspaceId && recordWorkspaceId === guestWorkspaceId)
      );
    });
    workspaceShrinkAuthorised = true;
    if (guestWorkspaceId && String(store.activeEventId || "") === guestWorkspaceId)
      store.activeEventId = "";
    store.event = null;
    delete store.cloud;
    store.cloudPlayers = [];
    writeLocalStore();
    applyDeviceRole();
    renderHome();
    nav("home");
    setCloudMessage("Guest Organiser access ended");
    alert(message);
  }
  async function verifyGuestOrganiserAccess() {
    if (!isGuestOrganiser()) return true;
    try {
      const active = await AwayCloud.guestOrganiserActive(store.cloud.eventId);
      if (!active) {
        endGuestOrganiserSession(
          "Your Guest Organiser access to this event has ended. No other Away Golf events are available on this device.",
        );
        return false;
      }
      return true;
    } catch (_) {
      return true;
    }
  }
  function leavePlayerEvent() {
    const eventName = store.event?.name || "this event";
    if (
      !confirm(
        `Delete ${eventName} from this phone and join another event?\n\nScores already transmitted remain safely stored online. This removes this phone's event, scorecard and local saved copies. It does not delete the organiser's event or leaderboard results.`,
      )
    )
      return;
    const eventId = String(store.cloud?.eventId || "");
    const saveHealth = eventId ? GolfSafeCloud.saveHealth(eventId) : null;
    if (saveHealth && (saveHealth.pending || saveHealth.conflicts || saveHealth.blocked)) {
      alert("This event still has scores saved only on this phone. Use Retry Sync and wait for the scores to upload before deleting the event.");
      return;
    }
    try {
      if (eventId) GolfSafeCloud.discardEventCopies(eventId);
      const retained = JSON.parse(localStorage.getItem("awayGolfBeforeLeavingPlayerEvent") || "null");
      if (String(retained?.cloud?.eventId || "") === eventId)
        localStorage.removeItem("awayGolfBeforeLeavingPlayerEvent");
    } catch (error) {
      alert("This event could not be removed from the phone. Please keep it open and try again.");
      return;
    }
    closeCloudConnection();
    store.event = null;
    delete store.cloud;
    store.cloudPlayers = [];
    persistStore();
    applyDeviceRole();
    renderHome();
    renderPlayerExperience();
    renderLeaderboard();
    nav("home");
    setCloudMessage("Previous event deleted from this phone Â· enter the new code");
    const quickCode = $("#quickJoinCode");
    if (quickCode) quickCode.value = "";
    setQuickJoinStatus("Enter the six-character event code.");
    requestAnimationFrame(() => quickCode?.focus());
    endScorecardUpdateProtection();
  }
  const verifiedCloudAuthority = new Set();
  async function correctStoredCloudRole() {
    if (!store.cloud?.eventId || verifiedCloudAuthority.has(String(store.cloud.eventId))) return true;
    if (isGuestOrganiser() && (await AwayCloud.guestOrganiserActive(store.cloud.eventId))) {
      verifiedCloudAuthority.add(String(store.cloud.eventId));
      return true;
    }
    const access = await AwayCloud.eventAccess(store.cloud.eventId);
    verifiedCloudAuthority.add(String(store.cloud.eventId));
    if (access.role === "organiser") {
      store.cloud.role = "organiser";
      delete store.cloud.playerId;
      return true;
    }
    if (access.role === "player") {
      store.cloud.role = "player";
      store.cloud.playerId = access.playerId;
      if (store.event) store.event.playerPreviewId = access.playerId;
      writeLocalStore();
      applyDeviceRole();
      return true;
    }
    if (store.cloud.joinCode) {
      store.cloud.role = "spectator";
      delete store.cloud.playerId;
      writeLocalStore();
      applyDeviceRole();
      return true;
    }
    return false;
  }
  async function syncCloudNow() {
    if (!store.cloud?.eventId || cloudBusy) return false;
    const connection = store.cloud;
    setCloudMessage("Synchronisingâ€¦", true);
    try {
      await correctStoredCloudRole();
      const bundle = await cloudTimeout(
        isSpectatorDevice()
          ? AwayCloud.spectateEvent(store.cloud.joinCode)
          : AwayCloud.loadEvent(store.cloud.eventId),
      );
      if (store.cloud !== connection) return false;
      if (retirePhoneFromArchivedEvent(bundle)) return false;
      if (
        store.cloud?.role === "organiser" &&
        bundle?.event?.name &&
        store.event?.name &&
        bundle.event.name !== store.event.name
      )
        store.cloud.restorePublished = true;
      applyRemoteCloud(bundle);
      setCloudMessage(
        `Live Â· updated ${new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`,
      );
      return bundle;
    } catch (error) {
      if (store.cloud !== connection) return false;
      if (isGuestOrganiser() && !(await verifyGuestOrganiserAccess())) return false;
      setCloudMessage(
        navigator.onLine
          ? "Sync delayed â€” use Retry Sync"
          : "Offline â€” scores remain saved on this phone",
      );
      return false;
    }
  }
  function watchCloudEvent() {
    if (!store.cloud?.eventId || cloudChannel || isSpectatorDevice() && !AwayCloud.pollsEvents) return;
    const connection = store.cloud;
    cloudChannel = AwayCloud.subscribe(connection.eventId, (bundle) => {
      if (store.cloud !== connection) return false;
      if (bundle) {
        if (cloudBusy) return false;
        if (retirePhoneFromArchivedEvent(bundle)) return true;
        applyRemoteCloud(bundle);
        return true;
      }
      clearTimeout(cloudReloadTimer);
      cloudReloadTimer = setTimeout(syncCloudNow, 450);
    }, {spectator:isSpectatorDevice()});
  }
  async function pollCloudConnection(roles) {
    if (document.hidden || cloudBusy || cloudPollInFlight ||
        !roles.includes(store.cloud?.role) || !store.cloud?.eventId ||
        AwayCloud.pollsEvents && cloudChannel) return;
    const connection = store.cloud;
    cloudPollInFlight = true;
    try {
      const bundle = await cloudTimeout(
        isSpectatorDevice() ? AwayCloud.spectateEvent(connection.joinCode) : AwayCloud.loadEvent(connection.eventId), 8000);
      if (store.cloud !== connection) return;
      if (retirePhoneFromArchivedEvent(bundle)) return;
      applyRemoteCloud(bundle);
    } catch (_) {
      if (store.cloud === connection && isGuestOrganiser()) await verifyGuestOrganiserAccess();
      // A delayed background refresh must never interrupt the organiser or scorer.
    } finally { cloudPollInFlight = false; }
  }
  function retirePhoneFromArchivedEvent(bundle) {
    if (bundle?.event?.status !== "archived" || !["player", "spectator"].includes(store.cloud?.role)) return false;
    const retiredEventId = String(store.cloud?.eventId || "");
    closeCloudConnection();
    // Once the organiser has archived the event, its confirmed online scores
    // are final. Recovery copies on this phone are no longer useful and must
    // not remain as protected clutter.
    if (retiredEventId)
      try {
        GolfSafeCloud.discardEventCopies(retiredEventId);
      } catch (error) {
        console.warn("Archived-event recovery copies could not be removed", error);
      }
    store.event = null;
    delete store.cloud;
    store.cloudPlayers = [];
    writeLocalStore();
    applyDeviceRole();
    renderHome();
    renderPlayerExperience();
    renderLeaderboard();
    nav("home");
    setCloudMessage("Completed event archived Â· ready for the next event");
    return true;
  }
  async function pollOrganiserConnections() {
    return pollCloudConnection(["organiser"]);
  }
  function startOrganiserPolling() {
    if (organiserPollTimer) return;
    organiserPollTimer = setInterval(pollOrganiserConnections, 8000);
  }
  async function pollPlayerEvent() {
    return pollCloudConnection(["player", "spectator"]);
  }
  function startPlayerPolling() {
    setInterval(pollPlayerEvent, 10000);
  }
  async function publishCloudEvent() {
    if (!store.event) {
      alert("Create an event plan before publishing.");
      return false;
    }
    setCloudMessage("Publishing eventâ€¦", true);
    try {
      store.event.setupStage = store.event.locked ? "final" : "preview";
      if (store.event.locked) store.event.finalUpdateAt = new Date().toISOString();
      else store.event.previewPublishedAt = store.event.previewPublishedAt || new Date().toISOString();
      // Save the publication marker before contacting the cloud. If a network or
      // later update fails, the organiser can recover the exact row already made.
      persistStore();
      const payload = cloudPayload();
      let result = null;
      if (!store.event.locked && store.event.previewPublishedAt) {
        const recent = await AwayCloud.loadRecentOwnedEvents(20);
        for (const item of recent) {
          if (item.status !== "setup" || item.name !== store.event.name) continue;
          const existing = await AwayCloud.loadEvent(item.id);
          if (
            existing?.event?.event_data?.event?.previewPublishedAt ===
              store.event.previewPublishedAt ||
            (store.event.workspaceId &&
              existing?.event?.event_data?.event?.workspaceId ===
                store.event.workspaceId)
          ) {
            result = { event_id: item.id, join_code: item.join_code };
            break;
          }
        }
      }
      if (!result) {
        result = await AwayCloud.createEvent(
          store.event.name,
          payload,
          cloudPlayerRows(),
        );
      }
      store.cloud = {
        role: "organiser",
        eventId: result.event_id,
        joinCode: result.join_code,
        courseCards: JSON.parse(JSON.stringify(payload.courses || [])),
      };
      // Event Preview deliberately uses the schema's existing `setup` status.
      // The preview/final distinction lives in event_data.event.setupStage.
      // A final event still advances to the permitted `locked` status.
      if (store.event.locked) {
        await AwayCloud.updateEvent(result.event_id, payload, "locked");
      }
      await rememberOrganiserWorkspace(result.event_id, result.join_code);
      rememberPublishedEvent({
        eventId: result.event_id,
        joinCode: result.join_code,
        name: store.event.name,
      });
      if (store.event.locked)
        store.event.finalUpdateCloudSentAt = new Date().toISOString();
      watchCloudEvent();
      writeLocalStore();
      setCloudMessage(store.event.locked ? "All Set Â· final event published" : "Event Preview published");
      renderCloudPanel();
      return true;
    } catch (error) {
      setCloudMessage("Could not publish");
      alert("Publishing did not complete. " + (error.message || error));
      return false;
    }
  }
  async function updateCloudEvent() {
    if (!store.cloud?.eventId || store.cloud.role !== "organiser") return;
    setCloudMessage("Updating eventâ€¦", true);
    try {
      const latest = await cloudTimeout(AwayCloud.loadEvent(store.cloud.eventId));
      const latestEvent = latest?.event?.event_data?.event,
        latestFinalTime = Date.parse(
          latestEvent?.finalUpdateAt || latestEvent?.lockedAt || "",
        ) || 0,
        localFinalTime = Date.parse(
          store.event?.finalUpdateAt || store.event?.lockedAt || "",
        ) || 0;
      if (
        latestEvent?.locked &&
        (!store.event?.locked || latestFinalTime > localFinalTime)
      ) {
        cloudBusy = false;
        applyRemoteCloud(latest);
        setCloudMessage("Newer final update received â€” review before sending");
        alert(
          "A newer final event update was already online. This device has loaded it instead of replacing it with older event details.",
        );
        return;
      }
      store.event.organiserCorrections = mergeOrganiserCorrections(
        store.event.organiserCorrections,
        latest?.event?.event_data?.event?.organiserCorrections,
      );
      store.event.setupStage = store.event.locked ? "final" : "preview";
      if (store.event.locked) store.event.finalUpdateAt = new Date().toISOString();
      const sentPlan=cloudPayload();
      const savedPlan=await AwayCloud.updateEvent(
        store.cloud.eventId,
        sentPlan,
        store.event?.locked ? "locked" : "setup",
      );
      if(savedPlan?.saved_data?.event)store.event=GolfSafeCloud.merge(sentPlan.event,store.event,savedPlan.saved_data.event).data;
      store.cloud.courseCards = JSON.parse(JSON.stringify(cloudPayload().courses));
      if (store.event.locked)
        store.event.finalUpdateCloudSentAt = new Date().toISOString();
      delete store.event.handicapUpdatePendingAt;
      writeLocalStore();
      setCloudMessage(store.event.locked ? "All Set Â· final update shared" : "Preview changes shared");
      return true;
    } catch (error) {
      setCloudMessage("Update delayed â€” use Retry Sync");
      alert("The cloud update did not complete. " + (error.message || error));
      return false;
    }
  }
  async function lookupCloudEvent(codeOverride) {
    const input =
      typeof codeOverride === "string"
        ? null
        : [$("#joinCode"), $("#quickJoinCode")].find(
            (candidate) => candidate && String(candidate.value || "").trim(),
          ) || $("#joinCode") || $("#quickJoinCode");
    const code = String(
      typeof codeOverride === "string" ? codeOverride : input?.value || "",
    )
      .replace(/[^a-z0-9]/gi, "")
      .trim()
      .toUpperCase();
    if (code.length !== 6) {
      setQuickJoinStatus("Please enter all six characters.", true);
      input?.focus();
      return;
    }
    setQuickJoinStatus("Finding your eventâ€¦");
    const quickButton = $("#quickJoinEvent");
    if (quickButton) quickButton.disabled = true;
    setCloudMessage("Finding eventâ€¦", true);
    try {
      const rows = await cloudTimeout(AwayCloud.invitation(code));
      if (!rows.length) {
        setCloudMessage("Ready");
        setQuickJoinStatus(
          "No current event was found. Check the code and try again.",
          true,
        );
        return;
      }
      setQuickJoinStatus(`${rows[0].event_name} found. Select your name.`);
      $("#modalContent").innerHTML =
        `<h2>Join ${esc(rows[0].event_name)}</h2><p>Select your own name to score, or watch the event without making any changes.</p><label>Your name<select id="cloudJoinPlayer"><option value="" selected>Select your name here</option>${rows.map((r) => `<option value="${esc(r.player_id)}">${esc(r.display_name)}${r.already_joined ? " â€” previously connected" : " â€” available"}</option>`).join("")}</select></label><div class="rowBtns" style="margin-top:14px"><button class="primary" id="confirmCloudJoin" disabled>Join or Reconnect</button><button class="soft" id="watchCloudEvent">Watch as Spectator</button><button class="soft" id="cancelCloudJoin">Cancel</button></div>`;
      $("#modalShade").classList.add("open");
      $("#cloudJoinPlayer").onchange = () => {
        $("#confirmCloudJoin").disabled = !$("#cloudJoinPlayer").value;
      };
      $("#cancelCloudJoin").onclick = () => {
        $("#modalShade").classList.remove("open");
        setCloudMessage("Ready");
        setQuickJoinStatus("Enter your event code to join.");
      };
      $("#watchCloudEvent").onclick = async () => {
        $("#watchCloudEvent").disabled = true;
        try {
          const bundle = await cloudTimeout(AwayCloud.spectateEvent(code));
          if (!bundle?.event?.id) throw new Error("The event could not be opened.");
          preparePhoneForJoinedEvent(bundle.event.id);
          store.cloud = {
            role: "spectator",
            eventId: String(bundle.event.id),
            joinCode: code,
          };
          applyRemoteCloud(bundle);
          applyDeviceRole();
          $("#modalShade").classList.remove("open");
          setCloudMessage("Watching live Â· read only");
          nav("leaderboardPage");
        } catch (error) {
          $("#watchCloudEvent").disabled = false;
          alert("Spectator View could not open. " + (error.message || error));
        }
      };
      $("#confirmCloudJoin").onclick = async () => {
          const playerId = $("#cloudJoinPlayer").value;
          if (!playerId) return;
          $("#confirmCloudJoin").disabled = true;
          try {
            const eventId = await AwayCloud.joinEvent(code, playerId);
            preparePhoneForJoinedEvent(eventId);
            store.cloud = {
              role: "player",
              eventId,
              joinCode: code,
              playerId: String(playerId),
            };
            writeLocalStore();
            const bundle = await cloudTimeout(AwayCloud.loadEvent(eventId));
            applyRemoteCloud(bundle);
            applyDeviceRole();
            $("#modalShade").classList.remove("open");
            watchCloudEvent();
            setCloudMessage("Joined Â· live scoring connected");
            nav("scorePage");
          } catch (error) {
            $("#confirmCloudJoin").disabled = false;
            setQuickJoinStatus(
              "Joining did not complete. Check your connection and try again.",
              true,
            );
            const message = String(error.message || error);
            alert(
              /already joined/i.test(message)
                ? "That player is still connected to another phone. Ask the organiser to press Release Phone beside the player's name, then try again."
                : "Joining did not complete. " + message,
            );
          }
        };
    } catch (error) {
      setCloudMessage("Could not find event");
      setQuickJoinStatus(
        "Could not contact Away Golf. Check the internet connection and try again.",
        true,
      );
      alert("Event lookup did not complete. " + (error.message || error));
    } finally {
      cloudBusy = false;
      renderCloudPanel();
      const restoredInput = $("#joinCode");
      if (restoredInput && !store.cloud?.eventId) restoredInput.value = code;
      if (quickButton) quickButton.disabled = false;
    }
  }
  async function recoverOrganiserEvent() {
    const code = String($("#organiserCode")?.value || "")
      .trim()
      .toUpperCase();
    if (code.length !== 6) return alert("Enter the six-character event code.");
    setCloudMessage("Recovering published eventâ€¦", true);
    try {
      const rows = await AwayCloud.invitation(code);
      if (!rows.length)
        throw new Error("No current Away Golf event was found for that code.");
      const eventId = rows[0].event_id,
        bundle = await AwayCloud.loadEvent(eventId),
        payload = bundle?.event?.event_data || {};
      if (!payload.event)
        throw new Error("The published event plan could not be read.");
      if (
        !confirm(
          `Replace the event currently shown on this PC with the published event ${rows[0].event_name}?`,
        )
      ) {
        cloudBusy = false;
        setCloudMessage("Ready");
        return;
      }
      closeCloudConnection();
      captureCurrentEvent();
      store.event = JSON.parse(JSON.stringify(payload.event));
      store.event.courseSnapshot = JSON.parse(JSON.stringify(payload.courses || []));
      store.event.workspaceId = store.event.workspaceId || uid();
      (payload.players || []).forEach((incoming) => {
        const original=GolfPlayerSubstitution.history(payload.event,incoming.id)[0]?.previous;
        const remote=original ? {...incoming,...original,id:incoming.id} : incoming;
        const i = store.players.findIndex(
          (p) => String(p.id) === String(remote.id),
        );
        if (i >= 0) store.players[i] = { ...store.players[i], ...remote };
        else store.players.push({ ...remote });
      });
      (payload.courses || []).forEach((remote) => {
        const i = store.courses.findIndex(
          (c) => String(c.id) === String(remote.id),
        );
        if (i >= 0) { if (!store.courseLibrary?.bases?.[String(remote.id)]) store.courses[i] = remote; }
        else store.courses.push(remote);
      });
      consolidateCourseCards();
      enforceAuthoritativeOatlandsCard();
      store.event.scoring = { day1: {}, day2: {} };
      (bundle.scores || []).forEach((row) => {
        store.event.scoring["day" + row.day] =
          store.event.scoring["day" + row.day] || {};
        store.event.scoring["day" + row.day][String(row.scorer_player_id)] =
          row.score_data || {};
      });
      store.cloud = { role: "organiser", eventId, joinCode: code };
      await rememberOrganiserWorkspace(eventId, code);
      store.cloudPlayers = (bundle.players || []).map((row) => ({
        playerId: String(row.player_id),
        name: row.display_name || "",
        joined: Boolean(row.joined_at),
        joinedAt: row.joined_at || null,
      }));
      // This is an intentional switch to the recovered cloud workspace. Do not
      // let the anti-shrink journal restore the previous disconnected state.
      workspaceShrinkAuthorised = true;
      persistStore();
      cloudBusy = false;
      cloudMessage = "Published event recovered";
      watchCloudEvent();
      renderHome();
      renderPlayerExperience();
      renderLeaderboard();
      nav("home");
    } catch (error) {
      cloudBusy = false;
      setCloudMessage("Recovery did not complete");
      alert(
        "The published event could not be recovered on this organiser PC. " +
          (error.message || error),
      );
    }
  }
  async function openPublishedEvent(eventId, joinCode, name, skipConfirm = false) {
    if (cloudBusy) return false;
    const replacing =
      store.event && String(store.cloud?.eventId || "") !== String(eventId);
    if (
      replacing &&
      !skipConfirm &&
      !confirm(
        `Open ${name || "this published event"}? The event currently displayed will be replaced on this screen.`,
      )
    )
      return false;
    setCloudMessage("Opening published eventâ€¦", true);
    try {
      captureCurrentEvent();
      const bundle = await AwayCloud.loadEvent(eventId),
        payload = bundle?.event?.event_data || {};
      if (!payload.event)
        throw new Error("The published event plan could not be read.");
      // Choosing Open Event is an explicit instruction to trust the published
      // online plan. Clear only a stale local event-plan save; scorecard safety
      // records are separate and remain protected.
      AwayCloud.safeReconcileAcknowledged?.(
        String(eventId),
        "event",
        payload,
        bundle.event.revision,
      );
      closeCloudConnection();
      store.event = JSON.parse(JSON.stringify(payload.event));
      if (store.event.locked)
        store.event.finalUpdateCloudSentAt =
          store.event.finalUpdateCloudSentAt ||
          store.event.finalUpdateAt ||
          bundle.event.updated_at ||
          new Date().toISOString();
      store.event.courseSnapshot = JSON.parse(JSON.stringify(payload.courses || []));
      let existingRecord = store.eventWorkspace.find(
        (item) => String(item.cloud?.eventId || "") === String(eventId),
      );
      store.event.workspaceId = existingRecord?.id || store.event.workspaceId || uid();
      (payload.players || []).forEach((incoming) => {
        const original=GolfPlayerSubstitution.history(payload.event,incoming.id)[0]?.previous;
        const remote=original ? {...incoming,...original,id:incoming.id} : incoming;
        const i = store.players.findIndex(
          (p) => String(p.id) === String(remote.id),
        );
        if (i >= 0) store.players[i] = { ...store.players[i], ...remote };
        else store.players.push({ ...remote });
      });
      (payload.courses || []).forEach((remote) => {
        const i = store.courses.findIndex(
          (c) => String(c.id) === String(remote.id),
        );
        if (i >= 0) { if (!store.courseLibrary?.bases?.[String(remote.id)]) store.courses[i] = remote; }
        else store.courses.push(remote);
      });
      consolidateCourseCards();
      enforceAuthoritativeOatlandsCard();
      store.event.scoring = { day1: {}, day2: {} };
      (bundle.scores || []).forEach((row) => {
        const key = "day" + row.day;
        store.event.scoring[key] = store.event.scoring[key] || {};
        store.event.scoring[key][String(row.scorer_player_id)] =
          row.score_data || {};
      });
      const code = String(
        joinCode || bundle.event?.join_code || "",
      ).toUpperCase();
      store.event.joinCode = code;
      store.cloud = {
        role: "organiser",
        eventId: String(eventId),
        joinCode: code,
      };
      await rememberOrganiserWorkspace(eventId, code);
      rememberPublishedEvent({
        eventId,
        joinCode: code,
        name: store.event.name,
      });
      store.cloudPlayers = (bundle.players || []).map((row) => ({
        playerId: String(row.player_id),
        name: row.display_name || "",
        joined: Boolean(row.joined_at),
        joinedAt: row.joined_at || null,
      }));
      // Opening an existing published event intentionally changes the active
      // cloud workspace. Preserve that organiser connection on this write.
      workspaceShrinkAuthorised = true;
      persistStore();
      cloudBusy = false;
      setCloudMessage("Live event opened");
      $("#modalShade").classList.remove("open");
      watchCloudEvent();
      renderHome();
      renderPlayerExperience();
      renderLeaderboard();
      nav("home");
      return true;
    } catch (error) {
      cloudBusy = false;
      setCloudMessage("Published event did not open");
      alert(
        "The published event could not be opened. " + (error.message || error),
      );
      return false;
    }
  }
  async function openPublishedEvents() {
    $("#modalContent").innerHTML =
      '<h2>Published Events</h2><p class="publishedEventsHelp">Loading your five most recent published eventsâ€¦</p>';
    $("#modalShade").classList.add("open");
    try {
      const cloudEvents = (await AwayCloud.loadRecentOwnedEvents(5)).filter(
          (x) => String(x.join_code || "").toUpperCase() !== RETIRED_TEST_CODE,
        ),
        events = await Promise.all(
          cloudEvents.map(async (x) => {
            try {
              const bundle = await AwayCloud.loadEvent(x.id),
                actual = bundle?.event?.event_data?.event || {},
                actualName = String(actual.name || x.name || "Away Golf Event"),
                cloudName = String(x.name || "Away Golf Event");
              return {
                ...x,
                name: actualName,
                cloud_name: cloudName,
                mismatch: actualName !== cloudName,
                event_date: actual.date || "",
                field_size:
                  actual.dayFields?.day1?.length ||
                  actual.confirmed?.length ||
                  actual.fieldSize ||
                  0,
                readable: true,
              };
            } catch (_) {
              return { ...x, readable: false };
            }
          }),
        );
      $("#modalContent").innerHTML =
        `<h2>Published Events</h2><p class="publishedEventsHelp">These details have been checked against the actual event stored online.</p>${events.length ? `<div class="publishedEventList">${events.map((x) => `<div class="publishedEventChoice ${x.mismatch ? "mismatch" : ""} ${x.readable ? "" : "unreadable"}"><button data-openpublishedevent="${esc(x.id)}" data-joincode="${esc(x.join_code || "")}" data-eventname="${esc(x.name || "Away Golf Event")}" ${x.readable ? "" : "disabled"}><span><b>${esc(x.name || "Away Golf Event")}</b><small>${x.join_code ? `Join code ${esc(x.join_code)} Â· ` : ""}${x.event_date ? `${esc(formatEventDate(x.event_date))} Â· ` : ""}${x.field_size ? `${esc(x.field_size)} players` : x.updated_at ? `Updated ${new Date(x.updated_at).toLocaleDateString("en-AU")}` : "Published event"}</small>${x.mismatch ? `<em>Warning: old cloud label â€œ${esc(x.cloud_name)}â€ did not match the actual event contents.</em>` : ""}${x.readable ? "" : "<em>The stored event contents could not be read.</em>"}</span><strong>Open â†’</strong></button><button class="archivePublishedEvent" data-archivepublishedevent="${esc(x.id)}" data-archivename="${esc(x.name || "Away Golf Event")}">Archive</button></div>`).join("")}</div>` : '<p class="publishedEventsError">No published events were found for this organiser copy.</p>'}<section class="organiserTabletConnect"><h3>Connect this tablet as an organiser</h3><p>Use the two codes shown by the organiser PC. This is separate from joining as a player.</p><div><input id="tabletEventCode" maxlength="6" placeholder="Player event code"><input id="tabletOrganiserCode" maxlength="8" placeholder="Organiser access code"><button class="primary" id="claimOrganiserTablet">Connect Tablet</button></div></section><button class="soft" id="closePublishedEvents">Close</button>`;
      $("#closePublishedEvents").onclick = () =>
        $("#modalShade").classList.remove("open");
      $$("[data-openpublishedevent]").forEach(
        (button) =>
          (button.onclick = () =>
            openPublishedEvent(
              button.dataset.openpublishedevent,
              button.dataset.joincode,
              button.dataset.eventname,
            )),
      );
      $$("[data-archivepublishedevent]").forEach(
        (button) =>
          (button.onclick = async () => {
            const eventId = button.dataset.archivepublishedevent,
              eventName = button.dataset.archivename || "this event";
            if (!confirm(`Archive ${eventName}?\n\nIt will disappear from Published Events and its join code will stop being offered. Your players, courses and local planning data will not be deleted.`)) return;
            button.disabled = true;
            button.textContent = "Archivingâ€¦";
            try {
              await AwayCloud.archiveEvent(eventId);
              forgetPublishedEvent(eventId);
              if (String(store.cloud?.eventId || "") === String(eventId)) {
                closeCloudConnection();
                delete store.cloud;
                store.cloudPlayers = [];
                forgetOrganiserEvent();
                try { await AwayCloud.saveWorkspace({ activePublishedEvent: null }); } catch (_) {}
                save();
              }
              await openPublishedEvents();
            } catch (error) {
              button.disabled = false;
              button.textContent = "Archive";
              alert("The event could not be archived. " + (error.message || error));
            }
          }),
      );
      $("#claimOrganiserTablet").onclick = claimOrganiserTablet;
    } catch (error) {
      $("#modalContent").innerHTML =
        `<h2>Published Events</h2><p class="publishedEventsError">The published-event list could not be loaded. Check the internet connection and try again.</p><button class="soft" id="closePublishedEvents">Close</button>`;
      $("#closePublishedEvents").onclick = () =>
        $("#modalShade").classList.remove("open");
    }
  }

  async function openPastEvent(eventId, name) {
    if (cloudBusy) return false;
    if (
      store.event &&
      !confirm(
        `Open the saved results for ${name || "this past event"}? Your current event will remain saved in My Events.`,
      )
    ) return false;
    setCloudMessage("Opening past resultsâ€¦", true);
    try {
      captureCurrentEvent();
      const bundle = await AwayCloud.loadEvent(eventId),
        payload = bundle?.event?.event_data || {};
      if (!payload.event) throw new Error("The saved event results could not be read.");
      closeCloudConnection();
      const archivedJoinCode = String(bundle.event?.join_code || "").toUpperCase();
      store.event = JSON.parse(JSON.stringify(payload.event));
      store.event.courseSnapshot = JSON.parse(JSON.stringify(payload.courses || []));
      const existingRecord = store.eventWorkspace.find(
        (item) => String(item.event?.pastCloudEventId || "") === String(eventId),
      );
      store.event.workspaceId = existingRecord?.id || uid();
      store.event.pastCloudEventId = String(eventId);
      store.event.archivedJoinCode = archivedJoinCode;
      store.event.pastEventReadOnly = true;
      store.event.status = "completed";
      store.event.joinCode = "";
      store.event.leaderboardView = "summary";
      (payload.players || []).forEach((incoming) => {
        const original=GolfPlayerSubstitution.history(payload.event,incoming.id)[0]?.previous;
        const remote=original ? {...incoming,...original,id:incoming.id} : incoming;
        const i = store.players.findIndex((p) => String(p.id) === String(remote.id));
        if (i >= 0) store.players[i] = { ...store.players[i], ...remote };
        else store.players.push({ ...remote });
      });
      (payload.courses || []).forEach((remote) => {
        const i = store.courses.findIndex((c) => String(c.id) === String(remote.id));
        if (i >= 0) { if (!store.courseLibrary?.bases?.[String(remote.id)]) store.courses[i] = remote; }
        else store.courses.push(remote);
      });
      consolidateCourseCards();
      store.event.scoring = { day1: {}, day2: {} };
      (bundle.scores || []).forEach((row) => {
        const key = "day" + row.day;
        store.event.scoring[key] = store.event.scoring[key] || {};
        store.event.scoring[key][String(row.scorer_player_id)] = row.score_data || {};
      });
      delete store.cloud;
      store.cloudPlayers = [];
      forgetOrganiserEvent();
      workspaceShrinkAuthorised = true;
      persistStore();
      cloudBusy = false;
      cloudMessage = "Past results opened";
      $("#modalShade").classList.remove("open");
      renderHome();
      renderPlayerExperience();
      renderLeaderboard();
      nav("leaderboardPage");
      return true;
    } catch (error) {
      cloudBusy = false;
      setCloudMessage("Past event did not open");
      alert("The past event could not be opened. " + (error.message || error));
      return false;
    }
  }

  async function openPastEvents() {
    $("#modalContent").innerHTML =
      '<h2>Past Events</h2><p class="publishedEventsHelp">Loading retained past eventsâ€¦</p>';
    $("#modalShade").classList.add("open");
    try {
      const cloudEvents = await AwayCloud.loadPastOwnedEvents(100),
        checked = await Promise.all(
          cloudEvents.map(async (x) => {
            try {
              const bundle = await AwayCloud.loadEvent(x.id),
                actual = bundle?.event?.event_data?.event;
              if (!actual || isTestEvent(actual)) return null;
              return {
                ...x,
                name: String(actual.name || x.name || "Away Golf Event"),
                event_date: actual.date || "",
                field_size: actual.dayFields?.day1?.length || actual.confirmed?.length || actual.fieldSize || 0,
              };
            } catch (_) {
              return null;
            }
          }),
        ),
        events = checked.filter(Boolean);
      $("#modalContent").innerHTML =
        `<h2>Past Events</h2><p class="publishedEventsHelp">Open a retained event to review its saved final results. Events whose actual stored name begins with TEST are excluded.</p>${events.length ? `<div class="publishedEventList">${events.map((x) => `<div class="publishedEventChoice"><button data-openpastevent="${esc(x.id)}" data-eventname="${esc(x.name)}"><span><b>${esc(x.name)}</b><small>${x.event_date ? `${esc(formatEventDate(x.event_date))} Â· ` : ""}${x.field_size ? `${esc(x.field_size)} players` : "Past event"}</small></span><strong>Open Results â†’</strong></button></div>`).join("")}</div>` : '<p class="publishedEventsError">No retained non-TEST past events were found.</p>'}<button class="soft" id="closePastEvents">Close</button>`;
      $("#closePastEvents").onclick = () => $("#modalShade").classList.remove("open");
      $$('[data-openpastevent]').forEach((button) =>
        button.onclick = () => openPastEvent(button.dataset.openpastevent, button.dataset.eventname),
      );
    } catch (error) {
      $("#modalContent").innerHTML =
        '<h2>Past Events</h2><p class="publishedEventsError">The past-event list could not be loaded. Check the internet connection and try again.</p><button class="soft" id="closePastEvents">Close</button>';
      $("#closePastEvents").onclick = () => $("#modalShade").classList.remove("open");
    }
  }
  const PRE_IMPORT_BACKUP_KEY = "awayGolfPreImportBackupV1";
  const PRE_DEVICE_CLEAR_BACKUP_KEY = "awayGolfPreDeviceClearBackupV1";
  const SAFETY_BACKUP_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
  const STORAGE_AUTHORITY_MIGRATION_KEY = "awayGolfStorageAuthorityMigrationV1";
  function expiringSafetyBackup(payload) {
    const savedAt = new Date().toISOString();
    return {
      ...payload,
      savedAt,
      expiresAt: new Date(Date.now() + SAFETY_BACKUP_RETENTION_MS).toISOString(),
    };
  }
  function expireDeviceSafetyBackups() {
    for (const key of [PRE_IMPORT_BACKUP_KEY, PRE_DEVICE_CLEAR_BACKUP_KEY, "awayGolfPreCourseListImportV1"]) {
      try {
        const payload = JSON.parse(localStorage.getItem(key) || "null");
        const expiresAt = Date.parse(payload?.expiresAt || "");
        if (Number.isFinite(expiresAt) && Date.now() >= expiresAt) localStorage.removeItem(key);
      } catch (_) {}
    }
  }
  function migrateHistoricalTestBackups() {
    if (localStorage.getItem(STORAGE_AUTHORITY_MIGRATION_KEY)) return;
    // A currently running built-in test still needs its restoration snapshot.
    // Otherwise these two exact legacy keys are obsolete development material.
    if (!store.event?.testMode && !store.event?.ridgeTestMode) {
      localStorage.removeItem("awayGolfTestBackupV1");
      localStorage.removeItem("awayGolfRidgeTestBackupV1");
      localStorage.setItem(STORAGE_AUTHORITY_MIGRATION_KEY, new Date().toISOString());
    }
  }
  expireDeviceSafetyBackups();
  migrateHistoricalTestBackups();
  function eventWorkspaceStatus(event) {
    if (!event) return "Draft";
    if (event.status === "cancelled") return "Cancelled";
    if (
      event.roundClosedAt ||
      event.status === "complete" ||
      event.status === "completed"
    )
      return "Completed";
    if (event.publishedAt || event.joinCode) return "Published";
    if (event.locked) return "Locked";
    return "Draft";
  }
  function eventWorkspaceDate(record) {
    return record?.event?.date || record?.updatedAt || record?.createdAt || "";
  }
  function switchWorkspaceEvent(id) {
    captureCurrentEvent();
    const record = store.eventWorkspace.find((item) => String(item.id) === String(id));
    if (!record?.event) return;
    closeCloudConnection();
    store.event = JSON.parse(JSON.stringify(record.event));
    // The selected workspace record is authoritative. Older saved copies could
    // carry a stale workspaceId and be captured back over the previous event.
    store.event.workspaceId = String(record.id);
    store.activeEventId = String(record.id);
    const selectedIsPublished = Boolean(
      record.event.publishedAt || record.event.joinCode,
    );
    if (record.cloud && selectedIsPublished)
      store.cloud = JSON.parse(JSON.stringify(record.cloud));
    else {
      delete store.cloud;
      // A draft must never inherit a stale cloud record carried by an older
      // organiser backup. Otherwise the draft appears briefly before the old
      // published event reopens and takes its place.
      record.cloud = null;
      record.cloudPlayers = [];
      forgetOrganiserEvent();
    }
    store.cloudPlayers = JSON.parse(JSON.stringify(record.cloudPlayers || []));
    writeLocalStore();
    $("#modalShade").classList.remove("open");
    applyDeviceRole();
    renderHome();
    renderPlayerExperience();
    renderLeaderboard();
    initialiseCloud();
    nav("home");
  }
  async function continueWorkspaceEvent(id) {
    const record = store.eventWorkspace.find((item) => String(item.id) === String(id));
    if (!record?.event) return;
    if (eventWorkspaceStatus(record.event) !== "Draft") {
      const eventId = record.cloud?.eventId,
        joinCode = record.cloud?.joinCode || record.event.joinCode || "";
      // Published events belong to the live organiser workspace. Reload the
      // authoritative cloud copy instead of reopening an old planning wizard
      // snapshot which may still contain pre-publication checks and scores.
      if (eventId) {
        await openPublishedEvent(
          String(eventId),
          String(joinCode),
          record.event.name || "this published event",
          true,
        );
        return;
      }
      if (String(store.activeEventId || "") !== String(id))
        switchWorkspaceEvent(id);
      else {
        $("#modalShade").classList.remove("open");
        nav("home");
        void syncCloudNow();
      }
      return;
    }
    if (String(store.activeEventId || "") !== String(id))
      switchWorkspaceEvent(id);
    else $("#modalShade").classList.remove("open");
    reopenEventPlan();
  }
  function duplicateWorkspaceEvent(id) {
    captureCurrentEvent();
    const source = store.eventWorkspace.find((item) => String(item.id) === String(id));
    if (!source?.event) return;
    const event = JSON.parse(JSON.stringify(source.event));
    event.workspaceId = uid();
    event.name = `${event.name || "Away Golf Event"} â€” Copy`;
    event.status = "planned";
    event.locked = false;
    resetDuplicatedEventRuntime(event);
    delete event.lockedAt;
    delete event.publishedAt;
    store.eventWorkspace.push({
      id: event.workspaceId,
      event,
      cloud: null,
      cloudPlayers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    switchWorkspaceEvent(event.workspaceId);
    reopenEventPlan();
  }
  function deleteWorkspaceEvent(id) {
    const record = store.eventWorkspace.find((item) => String(item.id) === String(id));
    if (!record) return;
    const name = record.event?.name || "this event";
    if (!confirm(`Permanently delete ${name}?\n\nOnly this selected event will be removed. Players, courses and every other event will remain.`)) return;
    if (!confirm(`Final check: delete ${name} now?`)) return;
    const wasCurrent = String(store.activeEventId || "") === String(id);
    workspaceShrinkAuthorised = true;
    store.eventWorkspace = store.eventWorkspace.filter((item) => String(item.id) !== String(id));
    if (wasCurrent) {
      const next = [...store.eventWorkspace].sort((a, b) => eventWorkspaceDate(b).localeCompare(eventWorkspaceDate(a)))[0];
      if (next) {
        closeCloudConnection();
        store.event = JSON.parse(JSON.stringify(next.event));
        store.activeEventId = String(next.id);
        if (next.cloud) store.cloud = JSON.parse(JSON.stringify(next.cloud));
        else delete store.cloud;
        store.cloudPlayers = JSON.parse(JSON.stringify(next.cloudPlayers || []));
        persistStore();
        $("#modalShade").classList.remove("open");
        applyDeviceRole();
        renderHome();
        renderPlayerExperience();
        renderLeaderboard();
        initialiseCloud();
        nav("home");
        return;
      }
      store.event = null;
      store.activeEventId = null;
      delete store.cloud;
      store.cloudPlayers = [];
    }
    persistStore();
    openMyEvents();
  }
  function toggleWorkspaceArchive(id) {
    captureCurrentEvent();
    const record = store.eventWorkspace.find((item) => String(item.id) === String(id));
    if (!record) return;
    record.archived = !record.archived;
    record.updatedAt = new Date().toISOString();
    writeLocalStore();
    openMyEvents();
  }
  function openMyEvents() {
    if (isGuestOrganiser()) return alert("Guest Organiser access is limited to the delegated event.");
    captureCurrentEvent();
    const activeId = String(store.activeEventId || "");
    const allRecords = [...store.eventWorkspace].sort((a, b) => {
      if (String(a.id) === activeId) return -1;
      if (String(b.id) === activeId) return 1;
      return eventWorkspaceDate(b).localeCompare(eventWorkspaceDate(a));
    });
    // Every workspace record is valuable organiser data. Two events can share a
    // name, date, field size and status while containing different groups,
    // handicaps or competition settings, so never hide records heuristically.
    const records = allRecords;
    const cards = records.map((record) => {
      const event = record.event || {}, current = String(record.id) === activeId;
      const players = event.dayFields?.day1?.length || event.confirmed?.length || event.fieldSize || 0;
      return `<article class="myEventCard ${current ? "current" : ""} ${record.archived ? "archived" : ""}"><div class="myEventSummary"><small>${current ? "CURRENT EVENT" : record.archived ? "ARCHIVED" : eventWorkspaceStatus(event)}</small><h3>${esc(event.name || "Untitled Away Golf Event")}</h3><p>${event.date ? esc(formatEventDate(event.date)) : "Date not set"} Â· ${players} player${players === 1 ? "" : "s"} Â· ${esc(eventWorkspaceStatus(event))}</p></div><div class="myEventActions"><button class="primary" data-continueevent="${esc(record.id)}">${eventWorkspaceStatus(event) === "Draft" ? "Continue Setup" : "Open Event"}</button><button class="soft" data-duplicateevent="${esc(record.id)}">Duplicate</button><button class="soft" data-archiveevent="${esc(record.id)}">${record.archived ? "Restore" : "Archive"}</button><button class="danger" data-deleteevent="${esc(record.id)}">Delete</button></div></article>`;
    }).join("");
    $("#modalContent").innerHTML = `<div class="myEventsHead"><div><small>ORGANISER WORKSPACE</small><h2>My Events</h2><p>These organiser events are saved on this device only. Changes made on another phone, tablet or PC do not remove this device's saved copies.</p></div><div class="myEventsHeadActions"><button class="primary" id="newEventFromWorkspace">+ New Event</button><button class="soft" id="closeMyEvents">Close</button></div></div><div class="myEventList">${cards || '<div class="card"><p>No events have been saved yet.</p></div>'}</div>`;
    $("#modalShade").classList.add("open");
    $("#closeMyEvents").onclick = () => $("#modalShade").classList.remove("open");
    $("#newEventFromWorkspace").onclick = () => { $("#modalShade").classList.remove("open"); openWizard(); };
    $$('[data-continueevent]').forEach((button) => button.onclick = () => continueWorkspaceEvent(button.dataset.continueevent));
    $$('[data-duplicateevent]').forEach((button) => button.onclick = () => duplicateWorkspaceEvent(button.dataset.duplicateevent));
    $$('[data-archiveevent]').forEach((button) => button.onclick = () => toggleWorkspaceArchive(button.dataset.archiveevent));
    $$('[data-deleteevent]').forEach((button) => button.onclick = () => deleteWorkspaceEvent(button.dataset.deleteevent));
  }
  function organiserBackupPayload() {
    captureCurrentEvent();
    const data = JSON.parse(JSON.stringify(store));
    delete data.cloud;
    data.cloudPlayers = [];
    return { format: "Away Golf Organiser Backup", backupVersion: 1, appVersion: document.querySelector('meta[name="app-version"]')?.content || "unknown", exportedAt: new Date().toISOString(), data };
  }
  function downloadOrganiserBackup(payload) {
    const stamp = new Date().toISOString().slice(0, 10),
      name = String(store.event?.name || "Away-Golf").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, ""),
      blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${name || "Away-Golf"}-Organiser-Backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  function validateOrganiserBackup(payload) {
    if (payload?.format !== "Away Golf Organiser Backup" || payload?.backupVersion !== 1 || !payload?.data || !Array.isArray(payload.data.players) || !Array.isArray(payload.data.courses))
      throw new Error("This is not a valid Away Golf organiser backup file.");
    return payload.data;
  }
  async function applyOrganiserBackup(payload, preserveCurrent = true) {
    const imported = validateOrganiserBackup(payload);
    if (preserveCurrent) localStorage.setItem(PRE_IMPORT_BACKUP_KEY, JSON.stringify(expiringSafetyBackup(organiserBackupPayload())));
    closeCloudConnection();
    await releaseRoundWakeLock();
    workspaceShrinkAuthorised = true;
    store = JSON.parse(JSON.stringify(imported));
    delete store.cloud;
    store.cloudPlayers = [];
    store.players = store.players || [];
    store.courses = store.courses || [];
    store.pairHistory = store.pairHistory || {};
    store.partnerHistory = store.partnerHistory || {};
    forgetOrganiserEvent();
    writeLocalStore();
    try { await AwayCloud.saveWorkspace({ activePublishedEvent: null }); } catch (_) {}
    $("#modalShade").classList.remove("open");
    applyDeviceRole();
    renderHome();
    renderPlayersAdmin();
    renderCoursesAdmin();
    renderPlayerExperience();
    renderLeaderboard();
    nav("home");
  }
  function hasLocalOrganiserWork() {
    return Boolean(
      store.event ||
        store.eventWorkspace?.length ||
        recentPublishedEvents().length ||
        rememberedOrganiserEvent()?.eventId,
    );
  }
  function updateOwnerAccountButton() {
    const button = $("#ownerAccount");
    if (!button) return;
    button.hidden = Boolean(
      store.cloud?.secondaryOrganiser ||
        isGuestOrganiser() ||
        isPlayerDevice() ||
        isSpectatorDevice(),
    );
    if (button.hidden) return;
    button.textContent = ownerAccountState?.permanent
      ? "Owner Signed In âœ“"
      : ownerAccountState?.pending
        ? "Owner Verification Pending"
        : "Owner Sign-In";
    button.classList.toggle("ownerSignedIn", Boolean(ownerAccountState?.permanent));
    button.title = ownerAccountState?.permanent
      ? `Protected organiser: ${ownerAccountState.email}`
      : ownerAccountState?.pending
        ? `Verification awaiting confirmation: ${ownerAccountState.email}`
        : "Protect and recover organiser access by email";
  }
  async function refreshOwnerAccount() {
    if (!window.AwayCloud || !navigator.onLine) return null;
    try {
      ownerAccountState = await AwayCloud.ownerAccount();
      updateOwnerAccountButton();
      return ownerAccountState;
    } catch (_) {
      return null;
    }
  }
  function ownerEmailError(error) {
    const message = String(error?.message || error || "");
    if (/manual linking|identity linking|disabled/i.test(message))
      return "Owner Sign-In must first be enabled in the Supabase Authentication settings.";
    if (/already|registered|exists|identity/i.test(message))
      return "That email may already belong to an Owner account. No ownership was changed.";
    return message || "The email could not be sent.";
  }
  function showOwnerEmailSent(email, purpose) {
    $("#modalContent").innerHTML = `<div class="ownerAccountHead"><small>OWNER ORGANISER</small><h2>Check Your Email</h2><p>A secure ${purpose === "protect" ? "verification" : "sign-in"} link has been sent to <b>${esc(email)}</b>.</p></div><div class="ownerEmailSent"><b>Open the Away Golf email and press its link.</b><span>${purpose === "protect" ? "This permanently protects the organiser identity already used by this PC. Existing published events remain attached to it." : "The link returns this device to Away Golf as the existing Owner Organiser."}</span><span>If the email is not visible, check Junk or Spam.</span></div><div class="ownerAccountActions"><button class="soft" id="ownerAccountDone">Done</button></div>`;
    $("#ownerAccountDone").onclick = () => $("#modalShade").classList.remove("open");
  }
  async function openOwnerAccount() {
    $("#modalContent").innerHTML = '<div class="ownerAccountLoading"><b>Checking Owner Organiser sign-inâ€¦</b></div>';
    $("#modalShade").classList.add("open");
    const account = await refreshOwnerAccount();
    if (!account) {
      $("#modalContent").innerHTML = '<div class="ownerAccountHead"><small>OWNER ORGANISER</small><h2>Owner Sign-In</h2><p>The secure account service could not be reached. Check the internet connection and try again.</p></div><div class="ownerAccountActions"><button class="soft" id="ownerAccountDone">Close</button></div>';
      $("#ownerAccountDone").onclick = () => $("#modalShade").classList.remove("open");
      return;
    }
    if (account.permanent) {
      $("#modalContent").innerHTML = `<div class="ownerAccountHead"><small>OWNER ORGANISER</small><h2>Owner Signed In âœ“</h2><p>This organiser is permanently protected.</p></div><div class="ownerIdentityCard"><span>OWNER EMAIL</span><b>${esc(account.email)}</b><p>Published events can be recovered after signing in on a replacement computer. Draft planning remains on this PC unless you make an Organiser Backup.</p></div><div class="ownerAccountActions"><button class="primary" id="ownerPublishedEvents">Open Published Events</button><button class="soft" id="ownerAccountDone">Close</button></div>`;
      $("#ownerPublishedEvents").onclick = () => {
        $("#modalShade").classList.remove("open");
        openPublishedEvents();
      };
      $("#ownerAccountDone").onclick = () => $("#modalShade").classList.remove("open");
      return;
    }
    if (account.pending) {
      $("#modalContent").innerHTML = `<div class="ownerAccountHead"><small>OWNER ORGANISER</small><h2>Verification Pending</h2><p>${esc(account.email)} has been added but has not yet been verified.</p></div><div class="ownerEmailSent"><b>Open the newest Away Golf verification email and press its link.</b><span>The link will finish securely at the published Away Golf page. Return here and reopen Owner Verification Pending to confirm the tick.</span><span>Older verification links may have expired and should not be used.</span></div><div class="ownerAccountActions"><button class="primary" id="resendOwnerVerification">Send a New Verification Email</button><button class="soft" id="ownerAccountDone">Close</button></div>`;
      $("#resendOwnerVerification").onclick = async () => {
        const resend = $("#resendOwnerVerification");
        resend.disabled = true;
        resend.textContent = "Sendingâ€¦";
        try {
          await AwayCloud.resendOwnerVerification(account.email);
          showOwnerEmailSent(account.email, "protect");
        } catch (error) {
          resend.disabled = false;
          resend.textContent = "Send a New Verification Email";
          alert(ownerEmailError(error));
        }
      };
      $("#ownerAccountDone").onclick = () => $("#modalShade").classList.remove("open");
      return;
    }
    const localWork = hasLocalOrganiserWork();
    $("#modalContent").innerHTML = `<div class="ownerAccountHead"><small>OWNER ORGANISER</small><h2>${localWork ? "Protect This Organiser" : "Owner Sign-In"}</h2><p>${localWork ? "Add your email to the organiser identity already used by this PC. Its existing published events remain attached." : "Sign in to recover published events belonging to your permanent Owner account."}</p></div><label class="ownerEmailLabel">Owner email<input id="ownerEmail" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com"></label><div class="ownerAccountNotice"><b>${localWork ? "Choose the correct route." : "Existing Owner accounts only."}</b><span>${localWork ? "Use verification only for a new Owner email. If this email already owns Away Golf events, use Sign In to Existing Owner Account." : "For safety, this screen cannot create a different Owner account on a blank device."}</span></div><div class="ownerAccountActions"><button class="primary" id="sendOwnerEmail">${localWork ? "Protect This Organiser with a New Email" : "Send Secure Sign-In Link"}</button>${localWork ? '<button class="soft" id="signInExistingOwner">Sign In to Existing Owner Account</button>' : ""}<button class="soft" id="ownerAccountDone">Cancel</button></div>`;
    const input = $("#ownerEmail"),
      send = $("#sendOwnerEmail");
    send.onclick = async () => {
      const email = input.value.trim().toLowerCase();
      if (!email || !email.includes("@")) return alert("Enter a valid email address.");
      send.disabled = true;
      send.textContent = "Sendingâ€¦";
      try {
        if (localWork) await AwayCloud.protectOwnerAccount(email);
        else await AwayCloud.sendOwnerSignInLink(email);
        showOwnerEmailSent(email, localWork ? "protect" : "signin");
      } catch (error) {
        send.disabled = false;
        send.textContent = localWork
          ? "Send Verification Email"
          : "Send Secure Sign-In Link";
        alert(ownerEmailError(error));
      }
    };
    if ($("#signInExistingOwner"))
      $("#signInExistingOwner").onclick = async () => {
        const email = input.value.trim().toLowerCase(),
          button = $("#signInExistingOwner");
        if (!email || !email.includes("@"))
          return alert("Enter your existing Owner email address first.");
        button.disabled = true;
        button.textContent = "Sendingâ€¦";
        try {
          await AwayCloud.sendOwnerSignInLink(email);
          showOwnerEmailSent(email, "signin");
        } catch (error) {
          button.disabled = false;
          button.textContent = "Sign In to Existing Owner Account";
          alert(ownerEmailError(error));
        }
      };
    input.onkeydown = (event) => {
      if (event.key === "Enter") send.click();
    };
    $("#ownerAccountDone").onclick = () => $("#modalShade").classList.remove("open");
    input.focus();
  }
  function openOrganiserBackup() {
    let safety = null;
    try { safety = JSON.parse(localStorage.getItem(PRE_IMPORT_BACKUP_KEY) || "null"); } catch (_) {}
    const activeCount = store.players.filter((p) => p.rosterActive !== false).length,
      courseCount = store.courses.length;
    $("#modalContent").innerHTML = `<h2>Organiser Backup</h2><p>Move your complete planning setup between the Windows folder, desktop app and tabletâ€”or keep an emergency copy.</p><div class="backupSummary"><div><small>PLAYERS</small><b>${activeCount}</b></div><div><small>COURSES</small><b>${courseCount}</b></div><div><small>CURRENT EVENT</small><b>${esc(store.event?.name || "None")}</b></div></div><div class="backupActions"><button class="primary" id="exportOrganiserBackup">Download Backup File</button><label class="backupImportLabel">Import Backup File<input type="file" id="importOrganiserBackup" accept="application/json,.json"></label>${safety ? '<button class="soft" id="undoOrganiserImport">Undo Last Import</button>' : ""}<button class="soft" id="closeOrganiserBackup">Close</button></div><p class="backupSafetyNote"><b>Safe import:</b> Away Golf automatically keeps a copy of the setup currently on this device before replacing it. Online published events and join codes are deliberately not transferred.</p>`;
    $("#modalShade").classList.add("open");
    $("#exportOrganiserBackup").onclick = () => downloadOrganiserBackup(organiserBackupPayload());
    $("#importOrganiserBackup").onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        validateOrganiserBackup(payload);
        if (!confirm(`Import ${payload.data.event?.name || "this Away Golf setup"}?\n\nThe present setup on this device will be saved automatically so you can undo the import.`)) return (event.target.value = "");
        await applyOrganiserBackup(payload, true);
        alert("Organiser backup imported successfully.");
      } catch (error) {
        event.target.value = "";
        alert("The backup could not be imported. " + (error.message || error));
      }
    };
    if ($("#undoOrganiserImport")) $("#undoOrganiserImport").onclick = async () => {
      if (!confirm("Restore the setup that was on this device before the last import?")) return;
      try {
        await applyOrganiserBackup(safety, false);
        localStorage.removeItem(PRE_IMPORT_BACKUP_KEY);
        alert("The previous organiser setup has been restored.");
      } catch (error) { alert("The previous setup could not be restored. " + (error.message || error)); }
    };
    $("#closeOrganiserBackup").onclick = () => $("#modalShade").classList.remove("open");
  }
  async function showOrganiserTabletCode() {
    if (!store.cloud?.eventId) return;
    try {
      setCloudMessage("Creating organiser accessâ€¦", true);
      const code = await AwayCloud.createOrganiserKey(store.cloud.eventId);
      cloudBusy = false;
      setCloudMessage("Live Â· organiser access ready");
      $("#modalContent").innerHTML =
        `<h2>Connect an Organiser Tablet</h2><p>On the tablet open <b>Published Events</b>, then enter these two codes:</p><div class="organiserCodeCard"><span>PLAYER EVENT CODE</span><b>${esc(store.cloud.joinCode)}</b><span>ORGANISER ACCESS CODE</span><b>${esc(code)}</b></div><p>This opens management pages, scores, Results Summary and event close controls. Do not give the organiser access code to players.</p><button class="primary" id="closeOrganiserCode">Done</button>`;
      $("#modalShade").classList.add("open");
      $("#closeOrganiserCode").onclick = () =>
        $("#modalShade").classList.remove("open");
    } catch (error) {
      cloudBusy = false;
      setCloudMessage("Organiser access was not created");
      alert(
        "Could not create organiser tablet access. " + (error.message || error),
      );
    }
  }
  async function claimOrganiserTablet() {
    const join = $("#tabletEventCode").value.trim().toUpperCase(),
      access = $("#tabletOrganiserCode").value.trim().toUpperCase();
    if (join.length !== 6 || access.length !== 8)
      return alert("Enter both codes exactly as shown on the organiser PC.");
    try {
      $("#claimOrganiserTablet").disabled = true;
      $("#claimOrganiserTablet").textContent = "Connectingâ€¦";
      const eventId = await AwayCloud.claimOrganiserAccess(join, access);
      await openPublishedEvent(eventId, join, "the published event");
      // A connected organiser tablet is a secondary live console. Keep its
      // event plan aligned with the cloud copy published by the planning PC so
      // an older tablet snapshot cannot overwrite later setup changes.
      store.cloud.secondaryOrganiser = true;
      persistStore();
      await syncCloudNow();
    } catch (error) {
      $("#claimOrganiserTablet").disabled = false;
      $("#claimOrganiserTablet").textContent = "Connect Tablet";
      alert(
        "The tablet could not be connected. Check both codes and try again. " +
          (error.message || error),
      );
    }
  }
  function renderGuestOrganiserClaim() {
    $("#modalContent").innerHTML = `<div class="ownerAccountHead"><small>SINGLE-EVENT ACCESS</small><h2>Guest Organiser Invitation</h2><p>Enter the two codes supplied by the Owner Organiser. This opens the normal Away Golf planning and event-operation pages for that event only.</p></div><label>Player event code<input id="guestEventCode" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="6 characters"></label><label>Guest Organiser code<input id="guestAccessCode" maxlength="10" autocomplete="off" autocapitalize="characters" placeholder="10 characters"></label><div class="ownerAccountNotice"><b>One event only.</b><span>Access ends when the Owner revokes it or when the event is closed.</span></div><div class="ownerAccountActions"><button class="primary" id="claimGuestOrganiser">Open My Event</button><button class="soft" id="closeGuestOrganiser">Cancel</button></div>`;
    $("#claimGuestOrganiser").onclick = claimGuestOrganiser;
    $("#closeGuestOrganiser").onclick = () => $("#modalShade").classList.remove("open");
  }
  async function claimGuestOrganiser() {
    const join = $("#guestEventCode").value.replace(/[^a-z0-9]/gi, "").toUpperCase(),
      access = $("#guestAccessCode").value.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (join.length !== 6 || access.length !== 10)
      return alert("Enter both codes exactly as supplied by the Owner Organiser.");
    if (
      store.event &&
      !confirm(
        `Open the delegated event?\n\n${store.event.name || "The event currently displayed"} will be replaced on this screen.`,
      )
    ) return;
    const button = $("#claimGuestOrganiser");
    button.disabled = true;
    button.textContent = "Openingâ€¦";
    try {
      const eventId = await AwayCloud.claimGuestOrganiserAccess(join, access);
      const opened = await openPublishedEvent(eventId, join, "your delegated event", true);
      if (!opened) throw new Error("The delegated event was not opened.");
      store.cloud.guestOrganiser = true;
      delete store.cloud.secondaryOrganiser;
      persistStore();
      applyDeviceRole();
      renderHome();
      $("#modalShade").classList.remove("open");
      nav("home");
      await syncCloudNow();
      alert(`Guest Organiser access is ready for ${store.event?.name || "this event"}. You have the normal setup and operation pages, limited to this event.`);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Open My Event";
      alert("The Guest Organiser invitation could not be opened. Check both codes and try again. " + (error.message || error));
    }
  }
  async function createGuestOrganiserInvitation() {
    if (isGuestOrganiser()) return;
    const button = $("#createGuestOrganiserInvitation");
    if (button) {
      button.disabled = true;
      button.textContent = "Creatingâ€¦";
    }
    try {
      if (!store.cloud?.eventId) {
        if (!store.event) throw new Error("Save an event draft first.");
        store.event.setupStage = "delegated-draft";
        persistStore();
        const published = await publishCloudEvent();
        if (!published) throw new Error("The saved draft could not be placed online.");
        store.event.setupStage = "delegated-draft";
        persistStore();
        await AwayCloud.updateEvent(store.cloud.eventId, cloudPayload(), "setup");
      }
      if (store.cloud.role !== "organiser")
        throw new Error("Owner Organiser access is required.");
      const code = await AwayCloud.createGuestOrganiserKey(store.cloud.eventId);
      $("#modalContent").innerHTML = `<div class="ownerAccountHead"><small>GUEST ORGANISER INVITATION</small><h2>${esc(store.event?.name || "Away Golf Event")}</h2><p>Give the invited organiser these two codes. They press <b>Guest Organiser</b> on Away Golf and enter both.</p></div><div class="organiserCodeCard"><span>PLAYER EVENT CODE</span><b>${esc(store.cloud.joinCode)}</b><span>GUEST ORGANISER CODE</span><b>${esc(code)}</b></div><div class="ownerAccountNotice"><b>This replaces any earlier Guest Organiser invitation.</b><span>The invitation code can be used once and expires after 14 days. Once accepted, access remains limited to this event and ends when the event is closed or you revoke it.</span></div><div class="ownerAccountActions"><button class="danger" id="revokeGuestOrganiser">Revoke Guest Access</button><button class="primary" id="closeGuestOrganiser">Done</button></div>`;
      $("#revokeGuestOrganiser").onclick = revokeGuestOrganiserAccess;
      $("#closeGuestOrganiser").onclick = () => $("#modalShade").classList.remove("open");
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = "Create Guest Invitation";
      }
      alert("The Guest Organiser invitation could not be created. " + (error.message || error));
    }
  }
  async function revokeGuestOrganiserAccess() {
    if (!store.cloud?.eventId || isGuestOrganiser()) return;
    if (!confirm("Revoke this event's Guest Organiser access?\n\nThe guest will no longer be able to open or update the event.")) return;
    try {
      await AwayCloud.revokeGuestOrganiser(store.cloud.eventId);
      $("#modalShade").classList.remove("open");
      alert("Guest Organiser access has been revoked for this event.");
    } catch (error) {
      alert("Guest access could not be revoked. " + (error.message || error));
    }
  }
  function openGuestOrganiserAccess() {
    $("#modalShade").classList.add("open");
    const ownerEvent =
      Boolean(store.event) &&
      (!store.cloud?.role || store.cloud.role === "organiser") &&
      !store.cloud?.secondaryOrganiser &&
      !isGuestOrganiser();
    if (!ownerEvent) return renderGuestOrganiserClaim();
    $("#modalContent").innerHTML = `<div class="ownerAccountHead"><small>SINGLE-EVENT DELEGATION</small><h2>Guest Organiser</h2><p>Give another person the normal Away Golf setup and operation pages for <b>${esc(store.event?.name || "this event")}</b>â€”and no other event.</p></div><div class="ownerAccountNotice"><b>You remain the Owner Organiser.</b><span>The guest cannot create a different event, access your other events, create organiser-tablet codes, or use your Owner account. Closing the event automatically ends their access.</span></div><div class="ownerAccountActions"><button class="primary" id="createGuestOrganiserInvitation">Create Guest Invitation</button><button class="danger" id="revokeGuestOrganiser">Revoke Existing Guest Access</button><button class="soft" id="closeGuestOrganiser">Cancel</button></div>`;
    $("#createGuestOrganiserInvitation").onclick = createGuestOrganiserInvitation;
    $("#revokeGuestOrganiser").onclick = revokeGuestOrganiserAccess;
    $("#closeGuestOrganiser").onclick = () => $("#modalShade").classList.remove("open");
  }
  function queueCloudRound(day, playerId) {
    if (!store.cloud?.eventId) return;
    if (isSpectatorDevice()) return;
    if (
      store.cloud.role === "player" &&
      String(store.cloud.playerId) !== String(playerId)
    )
      return;
    const connection = store.cloud, eventId = connection.eventId, key = `${day}:${playerId}`;
    try { AwayCloud.stageRound?.(eventId,+day,String(playerId),scorerStore(day,playerId)); } catch (_) { /* The visible storage warning remains; keep scores in memory and retry online. */ }
    clearTimeout(cloudRoundTimers.get(key));
    setCloudMessage(
      navigator.onLine
        ? "Saved on phone Â· syncing onlineâ€¦"
        : "Score saved on phone Â· offline",
    );
    cloudRoundTimers.set(
      key,
      setTimeout(() => {
        if (store.cloud === connection) void flushCloudRound(day, playerId);
      }, 500),
    );
  }
  async function flushCloudRound(day, playerId) {
    if (!store.cloud?.eventId) return false;
    const connection = store.cloud, key = `${day}:${playerId}`,
      eventId = connection.eventId;
    let snapshot = JSON.parse(JSON.stringify(scorerStore(day, playerId)));
    clearTimeout(cloudRoundTimers.get(key));
    cloudRoundTimers.delete(key);
    const previous = cloudRoundChains.get(key) || Promise.resolve(),
      saving = previous
        .catch(() => {})
        .then(() => {
          if(store.cloud!==connection)return false;
          snapshot=JSON.parse(JSON.stringify(scorerStore(day,playerId)));
          return AwayCloud.saveRound(eventId,+day,String(playerId),snapshot,{correction:connection.role==="organiser",expectedPlayerId:connection.role==="player"?connection.playerId:null,reason:"Organiser score entry or Emergency Recovery"});
        });
    cloudRoundChains.set(key, saving);
    try {
      const result = await saving;
      if (store.cloud !== connection || result === false) return false;
      if (cloudRoundChains.get(key) === saving) cloudRoundChains.delete(key);
      if(result?.saved_data) {
        const ownActiveRound =
          store.cloud?.role === "player" &&
          String(store.cloud.playerId) === String(playerId) &&
          store.event?.playerRoundMode === "scoring";
        // The cloud acknowledgement describes the immutable snapshot that
        // began uploading, not necessarily the card after the player's next
        // few taps. Replacing the live round here disconnects the current
        // hole object and a later NTP or navigation render appears to erase
        // those newer entries. Safe Cloud has already acknowledged this save;
        // keep the live phone card untouched until scoring mode ends.
        if (!ownActiveRound) {
          const latest=scorerStore(day,playerId);
          scoringDayStore(day)[String(playerId)]=GolfSafeCloud.merge(snapshot,latest,result.saved_data).data;
        }
        writeLocalStore();
      }
      setCloudMessage("Hole saved online âœ“");
      return true;
    } catch (error) {
      if (store.cloud !== connection) return false;
      if (cloudRoundChains.get(key) === saving) cloudRoundChains.delete(key);
      if(error.code==="GOLF_CONFLICT" || /GOLF_CLOSED/.test(error.message||"")) {
        setCloudMessage(error.code==="GOLF_CONFLICT"?"Saved copies need organiser review":"Card accepted Â· local copy retained");
        return false;
      }
      if (error.code === "AWAY_AUTH_EXPIRED")
        setCloudMessage("Scores safe on phone Â· secure connection retrying");
      else
        setCloudMessage("Saved on phone Â· online sync will retry");
      cloudRoundTimers.set(
        key,
        setTimeout(() => {
          if (store.cloud === connection) void flushCloudRound(day, playerId);
        }, 5000),
      );
      return false;
    }
  }
  function renderCloudPanel() {
    const host = $("#cloudPanel"),
      head = $("#cloudHeader");
    if (!host || !head) return;
    head.textContent = cloudReady
      ? navigator.onLine
        ? "Cloud connected"
        : "Offline mode"
      : "Connectingâ€¦";
    head.classList.toggle("offline", !navigator.onLine);
    if (store.event?.testMode) {
      head.textContent = "Local test mode";
      const label =
        store.event.testKind === "sixteen"
          ? "16-player one-day dress rehearsal"
          : `eight-player ${store.event.days === 1 ? "one-day" : "two-day"} test`;
      host.innerHTML = `<div class="cloudPanelHead testCloudPanel"><div><small>SAFE LOCAL TEST</small><h3>Oatlands ${label}</h3></div><span class="cloudState">Not published</span></div><p>This test event cannot connect to or replace a live event in the cloud. Use <b>Testing Tools</b> to load test stages, change the test or restore your previous event.</p><button class="soft" id="testEventTools">Testing Tools</button>`;
      return;
    }
    if (store.event?.status === "cancelled") {
      head.textContent = "Event cancelled";
      host.innerHTML = `<div class="cancelledEventCard"><small>CANCELLED EVENT</small><h3>${esc(store.event.name || "Away Golf Event")}</h3><p>This event is closed. Players cannot join or enter further scores.</p></div>`;
      return;
    }
    const retryNeeded = /delayed|offline/i.test(cloudMessage),
      retryButton = retryNeeded
        ? `<button class="soft" id="retryCloud" ${cloudBusy ? "disabled" : ""}>Retry Sync</button>`
        : "";
    if (store.cloud?.role === "organiser" && store.cloud.eventId) {
      const connections = (store.cloudPlayers || []).filter((x) => x.joined),
        guest = isGuestOrganiser(),
        scoringStarted = Array.from(
          { length: store.event?.days || 1 },
          (_, index) => firstDayScoreEntry(index + 1),
        ).some(Boolean),
        finalUpdateSent = Boolean(
          store.event?.locked && store.event?.finalUpdateCloudSentAt,
        );
      host.innerHTML = `<div class="organiserModeBanner"><b>${guest ? "Guest Organiser â€” this event only" : "This device is in Organiser Mode"}</b><button class="soft" id="leaveOrganiserMode">${guest ? "Leave Guest Event" : "Leave Organiser Mode and Join as a Player"}</button></div><div class="cloudPanelHead"><div><small>${store.event?.locked ? "ALL SET â€” FINAL EVENT" : "EVENT PREVIEW"}</small><h3>${esc(store.event?.name || "Away Golf Event")}</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div><div class="joinCodeDisplay"><span>PLAYER JOIN CODE</span><b>${esc(store.cloud.joinCode || "â€”â€”")}</b></div><div class="cloudActions"><button class="${finalUpdateSent ? "finalUpdateSent" : "primary"}" id="updateCloudEvent" ${cloudBusy ? "disabled" : ""}>${finalUpdateSent ? "Final Update Sent âœ“" : store.event?.locked ? "Send All Set â€” Final Update" : "Share Preview Changes"}</button><button class="soft" id="updateGaHandicaps" ${cloudBusy || scoringStarted ? "disabled" : ""}>${scoringStarted ? "GA Handicaps Locked â€” Scoring Started" : "Update GA Handicaps"}</button><button class="soft" id="retryCloud" ${cloudBusy ? "disabled" : ""}>${retryNeeded ? "Retry Sync" : "Refresh Scores"}</button>${guest ? "" : `<button class="soft" id="guestOrganiserInvite" ${cloudBusy ? "disabled" : ""}>Delegate This Event</button><button class="soft" id="organiserTabletCode" ${cloudBusy ? "disabled" : ""}>Connect Organiser Tablet</button>`}<button class="soft" id="reviewSafeCopies">Review Saved Copies</button><button class="soft" id="resetCloudPlayers" ${cloudBusy || !connections.length ? "disabled" : ""}>Release All Phones</button></div><div class="connectedPlayers"><div><b>Connected Players</b><span>${connections.length} of ${(store.cloudPlayers || []).length} joined</span></div>${connections.map((x) => `<div class="connectedPlayer"><span><i></i>${esc(x.name)}</span><button class="soft" data-releaseplayer="${esc(x.playerId)}" ${cloudBusy ? "disabled" : ""}>Release Phone</button></div>`).join("") || '<p class="hint">No players have joined yet.</p>'}</div><div class="connectedSpectators"><b>Spectators watching this event</b><span>${+(store.cloudSpectatorCount || 0)}</span></div>`;
      $("#updateCloudEvent").onclick = updateCloudEvent;
      $("#updateGaHandicaps").onclick = openPublishedGaHandicapUpdate;
      $("#retryCloud").onclick = syncCloudNow;
      if ($("#guestOrganiserInvite")) $("#guestOrganiserInvite").onclick = openGuestOrganiserAccess;
      if ($("#organiserTabletCode")) $("#organiserTabletCode").onclick = showOrganiserTabletCode;
      $("#reviewSafeCopies").onclick = reviewSafeCloudConflicts;
      $("#resetCloudPlayers").onclick = resetCloudPlayers;
      $("#leaveOrganiserMode").onclick = leaveOrganiserMode;
      $$("[data-releaseplayer]").forEach(
        (b) => (b.onclick = () => releaseCloudPlayer(b.dataset.releaseplayer)),
      );
      return;
    }
    if (store.cloud?.role === "player" && store.cloud.eventId) {
      host.innerHTML = `<div class="cloudPanelHead"><div><small>JOINED AS</small><h3>${esc(player(store.cloud.playerId)?.name || "Player")}</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div><p>Your phone is connected to <b>${esc(store.event?.name || "the Away Golf event")}</b>. Scores are saved locally first and shared automatically.</p><div class="cloudActions"><button class="primary" id="openMyCard">Open Scoring Card</button>${retryButton}<button class="soft leavePlayerEvent" id="leavePlayerEvent">Delete This Event from This Phone and Join Another</button></div>`;
      $("#openMyCard").onclick = () => nav("scorePage");
      if ($("#retryCloud")) $("#retryCloud").onclick = syncCloudNow;
      $("#leavePlayerEvent").onclick = leavePlayerEvent;
      return;
    }
    if (store.cloud?.role === "spectator" && store.cloud.eventId) {
      host.innerHTML = `<div class="cloudPanelHead"><div><small>SPECTATOR VIEW</small><h3>${esc(store.event?.name || "Away Golf Event")}</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div><p>You are watching this event live. Spectator View is read only and cannot alter scores, players, prizes or event settings.</p><div class="cloudActions"><button class="primary" id="openSpectatorLeaderboard">View Live Leaderboard</button><button class="soft" id="refreshSpectator">Refresh</button><button class="soft leavePlayerEvent" id="leaveSpectatorEvent">Delete This Event from This Phone and Join Another</button></div>`;
      $("#openSpectatorLeaderboard").onclick = () => nav("leaderboardPage");
      $("#refreshSpectator").onclick = syncCloudNow;
      $("#leaveSpectatorEvent").onclick = leavePlayerEvent;
      return;
    }
    host.innerHTML = `<div class="cloudPanelHead"><div><small>SHARED EVENT</small><h3>Connect players' phones</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div><div class="cloudActions">${store.event ? `<button class="primary" id="publishCloudEvent">${store.event.locked ? "Publish Final Event" : "Publish Event Preview"}</button><p class="hint">${store.event.locked ? "Publish the final locked details for scoring." : "Players can join now to see the provisional arrangements. Use the same code for the final update."}</p>` : ""}${retryButton}</div>${!store.event ? `<div class="organiserCopyNotice"><b>Looking for an event you already published?</b><span>Reopen the same Away Golf browser tab or app copy that was used to create the event. Your organiser event will reopen automatically there.</span><span>The player joining code is for players only and cannot recover organiser control in a different browser or app copy.</span></div>` : ""}<form class="joinEventRow" id="joinEventForm"><input id="joinCode" maxlength="6" autocapitalize="characters" inputmode="text" enterkeyhint="go" placeholder="6-character event code"><button type="submit" class="primary" id="lookupCloudEvent" ${cloudBusy ? "disabled" : ""}>${cloudBusy ? "Finding Eventâ€¦" : "Join as a Player"}</button></form><p class="panelJoinStatus ${/could not|too long|offline/i.test(cloudMessage) ? "error" : ""}" aria-live="polite">${esc(cloudBusy ? "Contacting Away Golf â€” please waitâ€¦" : /could not|too long/i.test(cloudMessage) ? cloudMessage + ". Check the code and internet connection, then try again." : "Enter the six-character code supplied by your organiser.")}</p>`;
    if ($("#publishCloudEvent"))
      $("#publishCloudEvent").onclick = publishCloudEvent;
    if ($("#retryCloud"))
      $("#retryCloud").onclick = () => {
        if (store.cloud?.eventId) syncCloudNow();
        else initialiseCloud();
      };
    $("#joinEventForm").onsubmit = (event) => {
      event.preventDefault();
      lookupCloudEvent($("#joinCode")?.value || "");
    };
    // Some installed tablet web apps have proved unreliable at forwarding a
    // button tap to the form submit event. Keep a direct tap path as well;
    // preventDefault stops the same tap from triggering both handlers.
    $("#lookupCloudEvent").onclick = (event) => {
      event.preventDefault();
      lookupCloudEvent($("#joinCode")?.value || "");
    };
  }
  async function initialiseCloud() {
    try {
      await AwayCloud.ensureSignedIn();
      cloudReady = true;
      setCloudMessage("Secure connection ready");
      await refreshOwnerAccount();
      void syncMasterCourses();
      if (sessionStorage.getItem("awayGolfRetired1539")) {
        try {
          const workspace = await AwayCloud.loadWorkspace();
          if (
            String(
              workspace?.activePublishedEvent?.joinCode || "",
            ).toUpperCase() === RETIRED_TEST_CODE
          )
            await AwayCloud.saveWorkspace({ activePublishedEvent: null });
        } catch (_) {}
        sessionStorage.removeItem("awayGolfRetired1539");
      }
      if (
        !store.cloud?.eventId &&
        !["player", "spectator"].includes(store.cloud?.role) &&
        !store.event?.testMode
      ) {
        let live = null;
        try {
          const workspace = await AwayCloud.loadWorkspace();
          live = workspace?.activePublishedEvent || null;
        } catch (_) {}
        if (String(live?.joinCode || "").toUpperCase() === RETIRED_TEST_CODE)
          live = null;
        const mayRestorePublished = currentEventMatchesRememberedLive(live);
        if (live?.eventId && mayRestorePublished) {
          store.cloud = {
            role: "organiser",
            eventId: String(live.eventId),
            joinCode: String(live.joinCode || ""),
            restorePublished: true,
          };
          rememberOrganiserEvent(live.eventId, live.joinCode);
          writeLocalStore();
        }
      }
      if (store.cloud?.eventId) {
        await syncCloudNow();
        watchCloudEvent();
      }
    } catch (_) {
      cloudReady = false;
      setCloudMessage("Offline â€” local scoring available");
    }
  }
  window.addEventListener("online", () => {
    cloudReady = true;
    syncCloudNow();
    renderCloudPanel();
  });
  window.addEventListener("offline", renderCloudPanel);
  window.addEventListener("focus", () => {
    pollOrganiserConnections();
    pollPlayerEvent();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      pollOrganiserConnections();
      pollPlayerEvent();
    }
  });
  startOrganiserPolling();
  startPlayerPolling();

  const TEST_STORAGE_RETENTION_MS = 24 * 60 * 60 * 1000;
  function isTestEventName(event) {
    return /^TEST\b/i.test(String(event?.name || event || "").trim());
  }
  function retainedTestEvent() {
    try {
      const snapshot=JSON.parse(localStorage.getItem("awayGolfBeforeLeavingPlayerEvent")||"null"),event=snapshot?.event;
      if(!event || !(event.testMode || event.ridgeTestMode || isTestEventName(event)))return null;
      return {eventId:String(snapshot.cloud?.eventId||event.id||""),name:event.name||"TEST event",savedAt:Date.parse(snapshot.savedAt||"")||0};
    } catch (_) { return null; }
  }
  function removeRetainedTestData(test) {
    if(!test?.eventId)return 0;
    const removed=GolfSafeCloud.discardTestEvent(test.eventId);
    try {
      const snapshot=JSON.parse(localStorage.getItem("awayGolfBeforeLeavingPlayerEvent")||"null");
      if(String(snapshot?.cloud?.eventId||snapshot?.event?.id||"")===test.eventId)localStorage.removeItem("awayGolfBeforeLeavingPlayerEvent");
    } catch (_) {}
    return removed;
  }
  function expireRetainedTestData() {
    const test=retainedTestEvent();
    if(test?.savedAt && Date.now()-test.savedAt>=TEST_STORAGE_RETENTION_MS)removeRetainedTestData(test);
  }
  function renderAppStorage() {
    expireDeviceSafetyBackups();
    try { expireRetainedTestData(); }
    catch (error) { console.warn("Old TEST-event storage could not be expired", error); }
    const limited=isPlayerDevice() || isSpectatorDevice(),
      saveDiagnostics=[
        ...(window.AwayGolfLocalSaveDiagnostics?.() || []),
        ...(GolfSafeCloud.storageDiagnostics?.() || []),
      ];
    const rows=GolfSafeCloud.storageRecords(),panel=$("#modalContent"),retainedTest=retainedTestEvent();
    const activeStorageEventId=String(store.cloud?.eventId||"");
    const retiredTestEventIds=[...new Set(rows.filter(row=>String(row.eventId)!==activeStorageEventId&&isTestEventName({name:row.name||""})).map(row=>String(row.eventId)).filter(Boolean))];
    const retiredTestRows=rows.filter(row=>retiredTestEventIds.includes(String(row.eventId)));
    const inventory=[];let total=0,exported=false;
    const hasProtectedWork=rows.some(row=>row.pending || row.status.includes("review"));
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i),value=localStorage.getItem(key)||"",bytes=2*(key.length+value.length);total+=bytes;
      let label=key==="golfSafeSaves.v1"?"Score recovery â€” pending uploads and temporary online copies":key===AWAY_GOLF_WORKSPACE_JOURNAL_KEY?"Unpublished-plan recovery journal":key.startsWith("awayGolfCourseDraft:")?"Unfinished course edit â€” retained until master save":/PreImportBackup|PreDeviceClearBackup|PreCourseListImport|BeforeLeavingPlayerEvent|TestBackup|RidgeTestBackup/.test(key)?"Retained safety backup":/13$/.test(key)?"Current device data â€” players, courses and event workspace":/course/i.test(key)?"Course data":/auth|token|Connections/i.test(key)?"Sign-in and event connections":"App settings and saved information";
      if(label==="Retained safety backup"){
        const kind=/PreCourseListImport/.test(key)?"Before course-list replacement":/PreImport/.test(key)?"Before import":/PreDeviceClear/.test(key)?"Before device cleanup":/BeforeLeaving/.test(key)?"Before leaving event":/Ridge/.test(key)?"Ridge test":"Earlier test";
        try{const snapshot=JSON.parse(value);label+=" â€” "+kind+(snapshot.event?.name?" Â· "+snapshot.event.name:"")+(snapshot.savedAt?" Â· saved "+new Date(snapshot.savedAt).toLocaleDateString("en-AU"):"")+(snapshot.expiresAt?" Â· expires "+new Date(snapshot.expiresAt).toLocaleDateString("en-AU"):"");}catch{label+=" â€” "+kind+" (unreadable; protected)";}
      }
      const activeIds=[store.cloud?.eventId,store.event?.id].filter(Boolean);
      let testBackup=false;
      if(label.startsWith("Retained safety backup")&&!label.includes("unreadable"))try{const snapshot=JSON.parse(value),event=snapshot?.event;testBackup=Boolean(event&&(event.testMode||event.ridgeTestMode||isTestEventName(event)));}catch{}
      const removable=label.startsWith("Retained safety backup") && !label.includes("unreadable") && !hasProtectedWork && !activeIds.some(id=>value.includes(id)) && !/"(?:pending|cloudDirty|conflict)"\s*:\s*(?:true|\{|\[)/.test(value);
      inventory.push({key,label,bytes,value,removable,testBackup});
    }
    const settings=inventory.filter(row=>row.label==="App settings and saved information");
    if(settings.length>1){
      const first=inventory.indexOf(settings[0]),grouped={key:"grouped-settings",label:"App settings and saved information",bytes:settings.reduce((sum,row)=>sum+row.bytes,0),value:"",removable:false};
      for(let i=inventory.length-1;i>=0;i--)if(inventory[i].label==="App settings and saved information")inventory.splice(i,1);
      inventory.splice(Math.min(first,inventory.length),0,grouped);
    }
    const size=bytes=>bytes>=1024*1024?(bytes/1024/1024).toFixed(2)+" MB":(bytes/1024).toFixed(1)+" KB";
    const label=row=>`${row.eventId===store.cloud?.eventId?store.event?.name||row.name:row.name}${row.kind==="score"?" Â· Day "+row.day+" Â· "+(player(row.playerId)?.name||row.playerId):" Â· Event plan"}`;
    const currentIsTest=Boolean(store.event&&(store.event.testMode||store.event.ridgeTestMode||isTestEventName(store.event)));
    const mayDiscard=row=>Boolean(row.pending&&row.status==="Waiting to upload"&&(row.eventId!==store.cloud?.eventId||currentIsTest));
    panel.innerHTML=`<section class="appStoragePage"><h2>App Storage</h2><p>This browserâ€™s local app data: <b>${size(total)}</b>. This is separate from the tabletâ€™s total storage. The warning starts at 4 MB; it is an estimate, not a measured storage limit.</p><p>${limited?"This player-phone view safely identifies work waiting to upload. Old work and explicitly named TEST-event copies may be deliberately discarded.":"Cleanup removes local copies only. Your current genuine event, players, courses and cloud events are protected."}</p>${!limited&&saveDiagnostics.length?`<details class="storageDiagnostics"><summary>Local save diagnostics (${saveDiagnostics.length})</summary>${saveDiagnostics.map(item=>`<p><b>${esc(new Date(item.at).toLocaleString("en-AU"))} Â· ${esc(item.area)}</b><br>${esc(item.message)}</p>`).join("")}</details>`:""}${retainedTest?`<div class="storageTestCleanup"><b>${esc(retainedTest.name)}</b><p>This abandoned TEST-event copy is not required online. TEST data expires automatically 24 hours after leaving the event.</p><button class="danger" id="deleteRetainedTestData">Delete Test Data Now</button></div>`:""}${retiredTestRows.length?`<div class="storageTestCleanup"><b>Retired TEST-event data</b><p>${retiredTestRows.length} protected ${retiredTestRows.length===1?"copy belongs":"copies belong"} to a TEST event that is no longer open. Genuine events are not included.</p><button class="danger" id="deleteRetiredTestRecords">Remove Retired Test Data</button></div>`:""}<div class="rowBtns">${isSpectatorDevice()?"":'<button class="primary" id="storageExport">Download App Storage Backup</button>'}<button class="soft" id="storageRefresh">Refresh Storage</button><button class="soft" id="storageClose">Close</button></div><p id="storageMessage" role="status"></p><h3>Stored information</h3><table><thead><tr><th>Information</th><th>Space used</th><th>Action</th></tr></thead><tbody>${inventory.sort((a,b)=>b.bytes-a.bytes).map((r,index)=>`<tr><td>${esc(r.label)}</td><td>${size(r.bytes)}</td><td>${!limited&&r.removable?`<button class="soft" data-storagebackup="${index}" ${r.testBackup?"": "disabled"}>${r.testBackup?"Remove Test Backup":"Remove Backup Copy"}</button>`:"Protected"}</td></tr>`).join("")}</tbody></table><h3>Saved cards and plans</h3><p>Waiting to upload means a local change has not yet been confirmed online. Genuine current-event cards remain protected.</p>${rows.map((row,index)=>`<article class="storageRecord"><b>${esc(label(row))}</b><p>${esc(row.status)} Â· ${size(row.bytes)}</p>${row.pending && row.status==="Waiting to upload"?`<button class="primary" data-storageretry="${index}" ${row.eventId!==store.cloud?.eventId?"disabled":""}>Retry Upload</button>${mayDiscard(row)?`<button class="danger" data-storagediscard="${index}">Discard This Unsent Copy</button>`:""}`:""}${!limited&&row.removable?`<button class="danger" data-storageremove="${index}">Remove Local Copy</button>`:`<span>Protected</span>`}</article>`).join("")||"<p>No saved card or plan copies.</p>"}<p>${limited?"Current genuine-event work cannot be deleted. TEST-event data requires two confirmations before it is discarded.":"Retained safety backups are included in the download above. Confirmed online copies expire after 30 days; abandoned TEST-event data expires after 24 hours."}</p></section>`;
    $("#modalShade").classList.add("open");
    $("#storageClose").onclick=()=>$("#modalShade").classList.remove("open");
    $("#storageRefresh").onclick=openAppStorage;
    if($("#deleteRetainedTestData"))$("#deleteRetainedTestData").onclick=()=>{if(!confirm(`Delete the abandoned local data for ${retainedTest.name}?\n\nIt will not be uploaded. Genuine events, players, courses and cloud results are unchanged.`))return;try{removeRetainedTestData(retainedTest);openAppStorage();$("#storageMessage").textContent="Test data removed. The Jerry upload warning is cleared.";}catch(error){$("#storageMessage").textContent="Test data was not removed: "+error.message;}};
    if($("#deleteRetiredTestRecords"))$("#deleteRetiredTestRecords").onclick=()=>{if(!confirm(`Remove ${retiredTestRows.length} protected local ${retiredTestRows.length===1?"copy":"copies"} from retired TEST events?\n\nNo genuine event, player, course or cloud result will be changed.`))return;if(!confirm("Final check: permanently remove this retired TEST-event recovery data from this device?"))return;try{let removed=0;retiredTestEventIds.forEach(id=>{removed+=GolfSafeCloud.discardTestEvent(id);});openAppStorage();$("#storageMessage").textContent=`${removed} retired TEST-event ${removed===1?"copy":"copies"} removed.`;}catch(error){$("#storageMessage").textContent="Retired TEST data was not removed: "+error.message;}};
    $$('[data-storagediscard]').forEach(button=>button.onclick=()=>{const row=rows[+button.dataset.storagediscard];if(!confirm(`Discard this unsent local copy?\n\n${label(row)}\n\nIt will NOT be uploaded and cannot be recovered from this phone. No player list, course or cloud result will be changed.`))return;if(!confirm("Final check: permanently discard this TEST/old unsent copy?"))return;try{GolfSafeCloud.discardAbandonedRecord(row.record,currentIsTest);openAppStorage();$("#storageMessage").textContent="Unsent copy discarded. The upload warning is cleared.";}catch(error){$("#storageMessage").textContent="The copy was not discarded: "+error.message;}});
    if($("#storageExport"))$("#storageExport").onclick=()=>{const data={...organiserBackupPayload(),appStorage:{savedAt:new Date().toISOString(),localSaveDiagnostics:saveDiagnostics,localData:{}}};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(/auth|token|Connections|Writer|Lease/i.test(key))continue;data.appStorage.localData[key]=localStorage.getItem(key);}downloadOrganiserBackup(data);exported=true;$("#storageMessage").textContent="Backup downloaded. Confirm it is saved before removing any backup copy.";$$('[data-storagebackup]').forEach(button=>button.disabled=false);};
    $$('[data-storagebackup]').forEach(button=>button.onclick=()=>{const row=inventory[+button.dataset.storagebackup];if((!exported&&!row.testBackup)||!row.removable)return;if(GolfSafeCloud.storageRecords().some(r=>r.pending||r.status.includes("review"))||[store.cloud?.eventId,store.event?.id].filter(Boolean).some(id=>row.value.includes(id))){$("#storageMessage").textContent="New or active work is protected. Refresh Storage.";return;}if(localStorage.getItem(row.key)!==row.value){$("#storageMessage").textContent="This backup changed. Refresh Storage before removing it.";return;}const question=row.testBackup?"Remove this local TEST-event backup now? It is not required online.":"Confirm the downloaded App Storage backup is saved, then remove this older local backup copy?";if(!confirm(question))return;localStorage.removeItem(row.key);openAppStorage();});
    $$('[data-storageremove]').forEach(button=>button.onclick=()=>{const row=rows[+button.dataset.storageremove];if(!confirm(`Remove the local saved copy of ${label(row)}? Its confirmed online copy remains.`))return;try{GolfSafeCloud.removeStorageRecord(row.record);openAppStorage();}catch(error){$("#storageMessage").textContent=error.message;}});
    $$('[data-storageretry]').forEach(button=>button.onclick=async()=>{button.disabled=true;$("#storageMessage").textContent="Retrying uploadâ€¦";try{await GolfSafeCloud.retryStorageRecord(rows[+button.dataset.storageretry].record);openAppStorage();$("#storageMessage").textContent="Upload confirmed online.";}catch(error){$("#storageMessage").textContent="Upload not completed: "+error.message;button.disabled=false;}});
  }
  function openAppStorage() {
    try { renderAppStorage(); }
    catch (error) {
      console.error("App Storage could not be displayed", error);
      const panel=$("#modalContent"),shade=$("#modalShade");
      if(!panel || !shade){ alert("App Storage could not open: "+(error?.message||"Unknown error")); return; }
      panel.innerHTML=`<section class="appStoragePage"><h2>App Storage</h2><p class="storageOpenError"><b>The storage list could not be prepared.</b></p><p>Your saved information has not been deleted or changed.</p><p>${esc(error?.message||"Unknown storage error")}</p><div class="rowBtns"><button class="primary" id="storageTryAgain">Try Again</button><button class="soft" id="storageClose">Close</button></div></section>`;
      shade.classList.add("open");
      $("#storageClose").onclick=()=>shade.classList.remove("open");
      $("#storageTryAgain").onclick=openAppStorage;
    }
  }
  window.addEventListener("golf-open-storage",openAppStorage);
  function openOrganiserInstructions() {
    if(isPlayerDevice() || isSpectatorDevice())return;
    const panel=$("#modalContent");
    GolfOrganiserGuide.render(panel);
    const close=document.createElement("button");close.type="button";close.className="soft guideClose";close.textContent="Close Instructions";
    close.onclick=()=>$("#modalShade").classList.remove("open");panel.prepend(close);
    $("#modalShade").classList.add("open");panel.querySelector("[data-guide-phase] summary")?.focus();
  }
  function renderHome() {
    const instructions=$("#organiserInstructions");
    const storageButton=$("#appStorage");if(storageButton){storageButton.hidden=isSpectatorDevice();storageButton.onclick=openAppStorage;}
    if(instructions){instructions.hidden=isPlayerDevice() || isSpectatorDevice();instructions.onclick=openOrganiserInstructions;}

    updateOwnerAccountButton();
    $("#homeEvent").textContent = store.event?.name || "Not set";
    $("#homePlayers").textContent = store.event
      ? store.event.dayFields?.day1?.length ||
        store.event.confirmed?.length ||
        0
      : 0;
    const roundLabel = $("#homeRoundLabel"),
      roundValue = $("#homeRound"),
      markingId =
        isPlayerDevice() && store.event
          ? markerTargetFor(
              String(store.cloud.playerId),
              store.event.playerPreviewDay || 1,
            )
          : "";
    if (roundLabel)
      roundLabel.textContent = isPlayerDevice() ? "Marking" : "Event date";
    if (roundValue)
      roundValue.textContent = isPlayerDevice()
        ? player(markingId)?.name || "Awaiting player"
        : homeEventDate(store.event);
    const options = $("#eventOptions");
    if (options) options.hidden = !store.event;
    applyDeviceRole();
    renderCloudPanel();
    renderLiveEventControl();
  }
  function nav(id) {
    if (isSpectatorDevice() && !["home", "leaderboardPage"].includes(id))
      id = "leaderboardPage";
    if (
      isPlayerDevice() &&
      !["home", "scorePage", "leaderboardPage"].includes(id)
    )
      id = "scorePage";
    $$(".page").forEach((x) => x.classList.toggle("active", x.id === id));
    $$("nav button").forEach((x) =>
      x.classList.toggle("active", x.dataset.nav === id),
    );
    if (id === "coursesPage") { renderCoursesAdmin(); void syncMasterCourses(); }
    if (id === "teamsPage") renderTeamsPage();
    if (id === "scorePage") renderPlayerExperience();
    if (id === "leaderboardPage") renderLeaderboard();
  }
  $$("nav button").forEach((b) => (b.onclick = () => nav(b.dataset.nav)));
  function showSide(html) {
    $("#sideContent").innerHTML = html;
    $("#sidePanel").classList.add("open");
  }
  $("#closeSide").onclick = () => $("#sidePanel").classList.remove("open");
  function puttingRulesText(event = store.event) {
    const puttingUnit = event?.puttingFormat === "pairs" ? "pair" : "team",
      oneDay = (event?.days || 1) === 1;
    return `Winning ${puttingUnit}
The lowest total number of putts by a ${puttingUnit} over the round wins.

On-course play
1. The ball must be on the green to count as a putt.
2. All balls must be putted into the hole â€” NO GIMMIES.
3. Players who have no shots left before they reach the green will place the ball on the green at the point furthest from the hole and take the first putt from that point.

Count-back if tied
1. The ${puttingUnit} with the lowest number of putts on ${oneDay ? "the back 9" : "the last day"}.
2. The ${puttingUnit} with the lowest number of putts on ${oneDay ? "the last 6 holes" : "the back 9 on the last day"}.
3. The ${puttingUnit} with the lowest number of putts on ${oneDay ? "the last 3 holes" : "the last 6 holes"}.${oneDay ? "" : `
4. The ${puttingUnit} with the lowest number of putts on the last 3 holes.`}`;
  }
  function specialRuleLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^(?:[â€¢*-]|\d+[.)])\s*/, ""))
      .filter(Boolean);
  }
  function ambroseRulesText(event = store.event) {
    const minimum = +event?.ambroseMinimumDrives || 0,
      checking = event?.ambroseScoringMode === "scorerOnly"
        ? "One nominated team scorer records the card."
        : "The nominated scorer and marker each record the team score and selected drive; both cards must agree.";
    return `All players tee off. The team selects one ball and all players play the next shot from that position. Continue until the hole is completed. Record one team stroke score and the player whose drive was selected on every hole. ${minimum ? `At least ${minimum} drive${minimum === 1 ? "" : "s"} from every player must be selected during the round. ` : ""}${checking}`;
  }
  function specialRulesEditorHtml(text) {
    const lines = specialRuleLines(text);
    return (lines.length ? lines : [""])
      .map((line) => `<li>${esc(line) || "<br>"}</li>`)
      .join("");
  }
  function specialRulesListHtml(text) {
    const lines = specialRuleLines(text);
    return `<ul class="specialRulesList">${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`;
  }
  function eventRuleBodyHtml(section) {
    return section.bullets
      ? specialRulesListHtml(section.text)
      : `<p>${esc(section.text).replace(/\n/g, "<br>")}</p>`;
  }
  function preferredLiesSetting(event, day = 1) {
    const key = `day${day}`,
      enabled = Object.prototype.hasOwnProperty.call(
        event?.preferredLiesByDay || {},
        key,
      )
        ? Boolean(event.preferredLiesByDay[key])
        : Boolean(event?.preferredLies),
      area =
        event?.preferredLiesAreaByDay?.[key] ||
        event?.preferredLiesArea ||
        "general";
    return { enabled, area };
  }
  function preferredLiesText(event, day = 1) {
    const setting = preferredLiesSetting(event, day);
    return setting.enabled
      ? `Preferred Lies â€” ${setting.area === "fairway" ? "Closely Mown Areas Only" : "General Area"}`
      : "Play the ball as it lies";
  }
  function eventRuleSections(event = store.event, selectedDay = null) {
    if (!event) return [];
    const sections = [{
      title: "Scoring",
      text: "Scoring opens 15 minutes before the first tee time.",
    }];
    const days = eventDays(event),
      ruleDays = selectedDay ? [selectedDay] : days;
    ruleDays.forEach((day) => {
      const setting = preferredLiesSetting(event, day);
      if (setting.enabled || event.days > 1 || selectedDay)
        sections.push({
          title:
            event.days > 1 && !selectedDay
              ? `Day ${day} â€” Preferred Lies`
              : "Preferred Lies",
          text: preferredLiesText(event, day),
        });
    });
    if ((event.competitions || []).includes("teamPutts") && (!selectedDay || competitionIsOn("teamPutts", selectedDay, event)))
      sections.push({
        title: "Putting Competition Rules",
        text: event.puttingRulesCustom || puttingRulesText(event),
      });
    if ((event.competitions || []).includes("scratch") && (!selectedDay || competitionIsOn("scratch", selectedDay, event)))
      sections.push({
        title: "Scratch Competition Rules",
        text: scratchRulesText(event),
      });
    if ((event.competitions || []).includes("ambrose") && (!selectedDay || competitionIsOn("ambrose", selectedDay, event)))
      sections.push({
        title: "Ambrose Rules",
        text: ambroseRulesText(event),
      });
    if ((event.competitions || []).includes("capTeams")) sections.push({title:"Black Cap â€“ White Cap", text:capRulesText(event)});
    const emergencyRules = Object.keys(event.emergencyReplacements || {})
      .sort()
      .map((key) => event.emergencyReplacements[key]?.ruleText)
      .filter(Boolean);
    const shortRules=ruleDays.flatMap(day=>shortTeamRuleLines(event,day));
    const specialText = [event.specialRules, ...shortRules, ...emergencyRules]
      .flatMap(specialRuleLines)
      .join("\n");
    if (specialText)
      sections.push({ title: "Special Rules", text: specialText, bullets: true });
    return sections;
  }
  function openEventRules() {
    const sections = eventRuleSections(),
      activeRound =
        isPlayerDevice() &&
        ["scoring", "verify"].includes(store.event?.playerRoundMode);
    showSide(
      `<div class="eventRulesView"><small>AWAY GOLF EVENT RULES</small><h2>${esc(store.event?.name || "Today's Rules")}</h2>${
        sections.length
          ? sections
              .map(
                (section) =>
                  `<section><h3>${esc(section.title)}</h3>${eventRuleBodyHtml(section)}</section>`,
              )
              .join("")
          : '<section><h3>Todayâ€™s Rules</h3><p>No additional rules apply to this event.</p></section>'
      }<button class="primary eventRulesClose" id="closeEventRules">${activeRound ? "BACK TO SCORECARD" : "CLOSE RULES"}</button></div>`,
    );
    $("#closeEventRules").onclick = () => {
      $("#sidePanel").classList.remove("open");
      if (activeRound) nav("scorePage");
    };
  }
  $("#specialRulesHome").onclick = openEventRules;
  function profileCourseHandicaps(p) {
    const plan =
        typeof W !== "undefined" &&
        W.event?.course1 &&
        $("#wizardShade")?.classList.contains("open")
          ? W.event
          : store.event,
      rows = [],
      add = (courseId, day) => {
        if (!courseId) return;
        const c = course(courseId),
          eventValue = plan?.dailyHandicaps?.["day" + day]?.[String(p.id)],
          saved = p.courseHandicaps?.[String(courseId)]?.handicap,
          value = eventValue === "" || eventValue == null ? saved : eventValue;
        rows.push({
          courseId: String(courseId),
          day,
          name: c?.name || "Event course",
          value: value == null ? "" : value,
        });
      };
    if (plan) {
      add(plan.course1, 1);
      eventDays(plan).filter(day => day > 1).forEach(day => add(plan["course" + day], day));
    }
    return rows;
  }
  function profileHistoryText(p) {
    const items = Object.values(p.courseHandicaps || {})
      .sort((a, b) =>
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
      )
      .slice(0, 6);
    return items.length
      ? items
          .map(
            (x) =>
              `${esc(x.courseName || "Course")} â€” Handicap ${esc(formatPlayingHandicap(x.handicap))}`,
          )
          .join("<br>")
      : "â€”";
  }
  function awayGolfEventsPlayedText(p) {
    const rows = Array.isArray(p?.awayGolfEventsPlayed)
      ? [...p.awayGolfEventsPlayed].sort((a, b) =>
          String(b.date || "").localeCompare(String(a.date || "")),
        )
      : [];
    return rows.length
      ? rows
          .map(
            (entry) =>
              `${esc(entry.dateLabel || entry.date || "Date not set")} â€” ${esc(entry.courses || "Course not set")}`,
          )
          .join("<br>")
      : "â€”";
  }
  function playerInfo(id, status = "") {
    let p = store.players.find(p=>String(p.id)===String(id));
    if (!p) return;
    const eventRows = profileCourseHandicaps(p);
    showSide(
      `<h2>${esc(p.name)}</h2><p><small>GOLF ID / GOLFLINK NUMBER</small><br><b>${esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink || "â€”")}</b></p><p><small>CURRENT GA HANDICAP</small><br><b>${p.noOfficialHandicap ? "No Official Handicap â€” event estimate only" : p.gaUpdatedAt ? esc(formatGaHandicap(p.ga)) : "Not yet entered"}</b>${p.gaUpdatedAt ? `<br><small>${p.gaCategory === "women" ? "Women" : "Men"} factor Â· updated ${esc(new Date(p.gaUpdatedAt).toLocaleDateString("en-AU"))}</small>` : ""}</p><p><small>NICK NAME</small><br>${esc(p.nickname || "â€”")}</p><p><small>CELL PHONE</small><br>${esc(p.cellPhone || "â€”")}</p><p><small>ADDRESS</small><br>${esc(p.address || "â€”").replace(/\n/g,"<br>")}</p><p><small>HOME CLUB</small><br><b>${esc(p.homeClub || "â€”")}</b></p><p><small>AWAY GOLF EVENTS PLAYED</small><br><b>${awayGolfEventsPlayedText(p)}</b></p><p><small>COURSES PLAYED â€” HANDICAP WHEN LAST PLAYED</small><br><b>${profileHistoryText(p)}</b></p>${eventRows.map((x) => `<p><small>HANDICAP FOR ${esc(x.name).toUpperCase()}</small><br><b>${x.value === "" ? "Not yet entered" : esc(formatPlayingHandicap(x.value))}</b></p>`).join("")}<p><small>NOTES</small><br>${esc(p.notes || "â€”")}</p><p><small>STATUS</small><br><b>${p.rosterActive === false ? "Inactive" : "Active"}${status ? " â€¢ " + esc(status) : ""}</b></p><button class="primary profileEditBtn" id="editPlayerProfile">Edit Player Profile</button>`,
    );
    $("#editPlayerProfile")?.insertAdjacentHTML(
      "beforebegin",
      `<p><small>PLAYER CATEGORY</small><br><b>${p.gaCategory === "women" ? "Female" : "Male"}</b></p>`,
    );
    $("#editPlayerProfile").onclick = () => editPlayerProfile(id, status);
  }
  function editPlayerProfile(id, status = "", onSaved = null) {
    $("#sidePanel").classList.add("open");
    const p = typeof id === "object" ? id : store.players.find(p=>String(p.id)===String(id));
    if (!p) return;
    const eventRows = profileCourseHandicaps(p),
      plan =
        typeof W !== "undefined" &&
        W.event?.course1 &&
        $("#wizardShade")?.classList.contains("open")
          ? W.event
          : store.event,
      handicapsLocked = Boolean(plan?.locked);
    const nameWords=String(p.name||'').trim().split(/\s+/), first=p.firstName??nameWords.slice(0,-1).join(' '), last=p.lastName??nameWords.at(-1)??'', address=p.addressDetails||{};
    const stateChoices=[['ACT','Australian Capital Territory'],['NSW','New South Wales'],['NT','Northern Territory'],['QLD','Queensland'],['SA','South Australia'],['TAS','Tasmania'],['VIC','Victoria'],['WA','Western Australia']];
    const contactFields=`<label><span>Nick Name</span><input id="epNickname" maxlength="80" value="${esc(p.nickname||'')}"></label><label><span>Cell Phone No</span><input id="epPhone" type="tel" maxlength="80" value="${esc(p.cellPhone||'')}"></label><fieldset class="playerContactAddress"><legend>Address</legend>${[['houseNo','House/Apt No'],['streetName','Street Name']].map(([k,label])=>`<label><span>${label}</span><input data-playeraddress="${k}" maxlength="160" value="${esc(address[k]||'')}"></label>`).join('')}<label><span>Street Type</span><select id="epStreetType"><option value="">Choose</option>${['Street','Rd','Close','Pde','Hwy','Other'].map(t=>`<option ${address.streetType===t?'selected':''}>${t}</option>`).join('')}</select></label><label id="epOtherStreetLabel"><span>Other â€” please insert</span><input data-playeraddress="otherStreetType" maxlength="80" value="${esc(address.otherStreetType||'')}"></label><label><span>Suburb</span><input data-playeraddress="suburb" maxlength="160" value="${esc(address.suburb||'')}"></label><label><span>State</span><select data-playeraddress="state"><option value="">Choose</option>${stateChoices.map(([c,n])=>`<option value="${c}" ${address.state===c||address.state===n?'selected':''}>${c} â€” ${n}</option>`).join('')}${address.state&&!stateChoices.some(([c,n])=>address.state===c||address.state===n)?`<option selected value="${esc(address.state)}">${esc(address.state)}</option>`:''}</select></label><label><span>Post Code</span><input data-playeraddress="postCode" maxlength="20" value="${esc(address.postCode||'')}"></label><label><span>Previously saved address</span><textarea data-playeraddress="legacyAddress" maxlength="1000">${esc(address.legacyAddress||(!p.addressDetails?p.address:'')||'')}</textarea></label></fieldset>`;
    $("#sideContent").innerHTML =
      `<h2>Edit Player Profile</h2><div class="profileEditForm"><label><span>First Name (required)</span><input id="epFirst" maxlength="80" value="${esc(first)}"></label><label><span>Last Name (required)</span><input id="epLast" maxlength="80" value="${esc(last)}"></label><label><span>Golf ID / GolfLink Number (required)</span><select id="epHandicapStatus"><option value="">Choose</option><option value="insert" ${p.golfLink?"selected":""}>Insert</option><option value="none" ${p.noOfficialHandicap?"selected":""}>No Official Handicap</option></select><input id="epGolfLink" inputmode="numeric" maxlength="80" value="${esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink || "")}"></label>${contactFields}<label><span>Home club</span><input id="epHomeClub" value="${esc(p.homeClub || "")}"></label><label><span>GA Handicap</span><input id="epGa" type="number" inputmode="decimal" min="0" max="54" step="0.1" value="${p.gaUpdatedAt ? esc(Math.abs(+p.ga).toFixed(1)) : ""}" placeholder="e.g. 18.4"></label><label class="plusCheck"><input type="checkbox" id="epGaPlus" ${p.gaUpdatedAt && +p.ga < 0 ? "checked" : ""}> Plus GA Handicap</label><label><span>Handicap category</span><select id="epGaCategory"><option value="men" ${p.gaCategory !== "women" ? "selected" : ""}>Men</option><option value="women" ${p.gaCategory === "women" ? "selected" : ""}>Women</option></select></label></div><div class="profileReadOnly"><p><small>AWAY GOLF EVENTS PLAYED</small><br><b>${awayGolfEventsPlayedText(p)}</b></p><p><small>COURSES PLAYED â€” HANDICAP WHEN LAST PLAYED</small><br><b>${profileHistoryText(p)}</b></p></div>${eventRows.map((x) => `<div class="profileHcpEdit"><label><span>Handicap for ${esc(x.name)}</span><input type="text" inputmode="numeric" data-profilehcp="${x.courseId}" data-profileday="${x.day}" value="${esc(handicapMagnitude(x.value))}" ${handicapsLocked ? "disabled" : ""}></label><label class="plusCheck"><input type="checkbox" data-profileplus="${x.courseId}|${x.day}" ${Number(x.value) < 0 ? "checked" : ""} ${handicapsLocked ? "disabled" : ""}> Plus handicap</label></div>`).join("")}${handicapsLocked ? '<p class="hint">Event handicaps are fixed because this event is locked.</p>' : ""}<div class="profileEditForm"><label><span>Notes</span><textarea id="epNotes" rows="4">${esc(p.notes || "")}</textarea></label><label><span>Status</span><select id="epStatus"><option value="active" ${p.rosterActive !== false ? "selected" : ""}>Active</option><option value="inactive" ${p.rosterActive === false ? "selected" : ""}>Inactive</option></select></label></div><div class="rowBtns profileEditActions"><button class="primary" id="savePlayerProfile">Save Profile</button><button class="soft" id="cancelPlayerProfile">Cancel</button></div>`;
    const categorySelect = $("#epGaCategory"), categoryLabel = categorySelect?.closest("label")?.querySelector("span");
    if (categoryLabel) categoryLabel.textContent = "Male/Female (required)";
    if (categorySelect) {
      categorySelect.options[0].textContent = "Male";
      categorySelect.options[1].textContent = "Female";
      if (p.pendingNewPlayer) {
        categorySelect.insertAdjacentHTML("afterbegin", '<option value="">Choose</option>');
        categorySelect.value = "";
      }
    }
    const toggleGolfId=()=>{const noOfficial=$('#epHandicapStatus').value==='none';$('#epGolfLink').hidden=$('#epHandicapStatus').value!=='insert';$('#epGa').disabled=noOfficial;$('#epGaPlus').disabled=noOfficial;};$('#epHandicapStatus').onchange=toggleGolfId;toggleGolfId();
    const toggleOtherStreet=()=>{$('#epOtherStreetLabel').hidden=$('#epStreetType').value!=='Other';};$('#epStreetType').onchange=toggleOtherStreet;toggleOtherStreet();
    $("#cancelPlayerProfile").onclick = () => p.pendingNewPlayer ? $("#sidePanel").classList.remove("open") : playerInfo(id, status);
    $("#savePlayerProfile").onclick = () => {
      const firstName=$('#epFirst').value.trim(),lastName=$('#epLast').value.trim(),category=$('#epGaCategory').value,choice=$('#epHandicapStatus').value,golfLink=choice==='none'?'':$('#epGolfLink').value.trim();
      if(!firstName||!lastName||firstName.length+lastName.length+1>120)return alert('Enter First Name and Last Name (up to 120 characters together).');
      if(!category)return alert('Choose Male or Female for this player.');
      if(!choice||(choice==='insert'&&!/^[0-9]+$/.test(golfLink)))return alert('Insert a Golf ID number or choose No Official Handicap.');
      const addressDetails={...address};$$('[data-playeraddress]').forEach(input=>addressDetails[input.dataset.playeraddress]=input.value.trim());addressDetails.streetType=$('#epStreetType').value;
      if(addressDetails.streetType==='Other'&&!addressDetails.otherStreetType)return alert('Please insert the other street type.');
      p.firstName=firstName;p.lastName=lastName;p.name=firstName+' '+lastName;p.golfLink=golfLink;p.noOfficialHandicap=choice==='none';p.nickname=$('#epNickname').value.trim();p.cellPhone=$('#epPhone').value.trim();p.addressDetails=addressDetails;
      p.address=[[addressDetails.houseNo,addressDetails.streetName,addressDetails.streetType==='Other'?addressDetails.otherStreetType:addressDetails.streetType].filter(Boolean).join(' '),[addressDetails.suburb,addressDetails.state,addressDetails.postCode].filter(Boolean).join(' '),addressDetails.legacyAddress].filter(Boolean).join('\n');
      p.homeClub = $("#epHomeClub").value.trim();
      p.gaCategory = category;
      const gaRaw = Number($("#epGa").value);
      if (!p.noOfficialHandicap && $("#epGa").value !== "" && Number.isFinite(gaRaw)) {
        p.ga = $("#epGaPlus").checked ? -Math.abs(gaRaw) : Math.abs(gaRaw);
        p.gaUpdatedAt = new Date().toISOString();
      }
      if(p.pendingNewPlayer){delete p.pendingNewPlayer;store.players.push(p);}
      p.notes = $("#epNotes").value.trim();
      p.rosterActive = $("#epStatus").value === "active";
      $$("[data-profilehcp]:not([disabled])").forEach((inp) => {
        const raw = Number(inp.value);
        if (inp.value === "" || !Number.isFinite(raw) || !plan) return;
        const day = +inp.dataset.profileday,
          plus = $(
            `[data-profileplus="${inp.dataset.profilehcp}|${day}"]`,
          )?.checked,
          val = plus ? -Math.abs(raw) : Math.abs(raw);
        plan.dailyHandicaps = plan.dailyHandicaps || { day1: {}, day2: {} };
        plan.dailyHandicaps["day" + day] =
          plan.dailyHandicaps["day" + day] || {};
        plan.dailyHandicaps["day" + day][String(p.id)] = val;
      });
      save();
      if(typeof onSaved === "function")onSaved(p.id);
      playerInfo(p.id, status);
    };
  }
  function renderPlayersAdmin() {
    let q = ($("#playerSearchMain").value || "").toLowerCase(),
      ps = [...store.players]
        .filter((p) => (p.name + " " + p.golfLink + " " + (p.nickname || "") + " " + (p.noOfficialHandicap ? "No Official Handicap" : "")).toLowerCase().includes(q))
        .sort((a, b) => surnameKey(a.name).localeCompare(surnameKey(b.name))),
      act = ps.filter((p) => p.rosterActive !== false),
      ina = ps.filter((p) => p.rosterActive === false);
    let ret =
      wizardReturnStep || (store.event && !store.event.locked)
        ? `<div class="returnSetupBar"><button class="soft" id="returnToWizardPlayers">â† Return to Setup</button></div>`
        : "";
    $("#playerAdminList").innerHTML =
      ret +
      act
        .map(
          (p) =>
            `<div class="playerRow"><div><b>${esc(p.name)}</b><small>${esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink)}</small></div><div class="rowBtns"><button class="info" data-pinfo="${p.id}">i</button><button class="danger" data-pinactive="${p.id}">âˆ’</button></div></div>`,
        )
        .join("") +
      (ina.length
        ? `<div class="divider">Inactive Away Golf Members (${ina.length})</div>` +
          ina
            .map(
              (p) =>
                `<div class="playerRow inactive"><div><b>${esc(p.name)}</b><small>${esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink)}</small></div><div class="rowBtns"><button class="info" data-pinfo="${p.id}">i</button><button class="soft" data-preactivate="${p.id}">Reactivate</button></div></div>`,
            )
            .join("")
        : "");
  }
  $("#playerSearchMain").oninput = renderPlayersAdmin;
  $("#addPlayerTop").onclick = addPlayer;
  function addPlayer(onSaved = null) {
    editPlayerProfile({id:'p'+uid(),name:'',golfLink:'',ga:0,gaCategory:'',rosterActive:true,homeClub:'',notes:'',eventsPlayed:0,lastEvent:'',pendingNewPlayer:true},'',typeof onSaved === 'function' ? onSaved : null);
    return null;
  }
  let masterCourseLibrary = null;
  function getMasterCourseLibrary() {
    if (!window.AwayCourseLibrary || !window.AwayCloud) return null;
    if (!masterCourseLibrary && store.event?.locked && !store.event.courseSnapshot) {
      const ids=eventDays().map(day=>String(store.event['course'+day]));
      store.event.courseSnapshot=JSON.parse(JSON.stringify(store.cloud?.courseCards||store.courses.filter(c=>ids.includes(String(c.id)))));
      if(writeLocalStore()===false){alert('Could not protect the existing event card. Export a backup before syncing courses.');return null;}
    }
    if (!masterCourseLibrary) masterCourseLibrary = new AwayCourseLibrary.Library({
      store: () => store, api: AwayCloud, persist: writeLocalStore,
      changed: () => { renderMasterCoursePanel(); if (!$("#modalShade").classList.contains("open")) renderCoursesAdmin(); },
    });
    return masterCourseLibrary;
  }
  async function syncMasterCourses(force = false) {
    if (!force && $("#modalShade").classList.contains("open")) return;
    if (isPlayerDevice() || isSpectatorDevice() || isGuestOrganiser()) return;
    const library=getMasterCourseLibrary();if(!library)return;
    await library.sync();
    removeConfirmedCourseDrafts(library);
    if(library.allowed&&AwayCloud.loadCourseLocations)try{const rows=await AwayCloud.loadCourseLocations();store.courseRegions ||= {};for(const row of rows){addCourseCountry(row.country);store.courseRegions[row.country]=GolfCourseLocations.unique([...(store.courseRegions[row.country]||[]),row.region]);}writeLocalStore();}catch(error){console.warn('Shared locations unavailable',error);}
    renderCoursesAdmin();
  }
  const PRE_COURSE_LIST_IMPORT_KEY = "awayGolfPreCourseListImportV1";
  function removeConfirmedCourseDrafts(library = getMasterCourseLibrary()) {
    if (!library) return 0;
    const state = library.state(), keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("awayGolfCourseDraft:")) keys.push(key);
    }
    let removed = 0;
    for (const key of keys) {
      try {
        const draft = JSON.parse(localStorage.getItem(key) || "null"), id = String(draft?.course?.id || "");
        const base = state.bases?.[id];
        if (id && base && !state.pending?.[id] && !state.conflicts?.[id] && !state.proposals?.[id] && AwayCourseLibrary.same(draft.course, base.data)) {
          localStorage.removeItem(key);
          removed++;
        }
      } catch (_) {}
    }
    return removed;
  }
  function courseListTransferPayload(includeDrafts = false) {
    const library = store.courseLibrary || {}, data = {
      courses: JSON.parse(JSON.stringify(store.courses || [])),
      courseCountries: JSON.parse(JSON.stringify(store.courseCountries || [])),
      courseRegions: JSON.parse(JSON.stringify(store.courseRegions || {})),
      // Pending uploads and conflicts belong to one browser. Transfer only the
      // accepted master baselines so another device cannot submit the same
      // pending change or inherit a stale review.
      courseLibrary: JSON.parse(JSON.stringify({
        bases: library.bases || {},
        authority: library.authority || null,
        lastSync: library.lastSync || null,
        previousAuthorityBases: library.previousAuthorityBases || {},
      })),
    };
    if (includeDrafts) {
      data.courseFavourites = JSON.parse(JSON.stringify(store.courseFavourites || []));
      data.courseDrafts = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("awayGolfCourseDraft:")) data.courseDrafts[key] = localStorage.getItem(key);
      }
    }
    return {
      format: "Away Golf Course List",
      transferVersion: 1,
      appVersion: document.querySelector('meta[name="app-version"]')?.content || "unknown",
      exportedAt: new Date().toISOString(),
      data,
    };
  }
  function validateCourseListTransfer(payload) {
    if (payload?.format !== "Away Golf Course List" || payload?.transferVersion !== 1 || !Array.isArray(payload?.data?.courses))
      throw new Error("This is not a valid Away Golf course-list file.");
    const ids = new Set();
    for (const course of payload.data.courses) {
      const id = String(course?.id || "").trim(), name = String(course?.name || "").trim();
      if (!id || !name) throw new Error("The course-list file contains a course without an ID or name.");
      if (ids.has(id)) throw new Error("The course-list file contains a duplicate course ID.");
      ids.add(id);
    }
    return JSON.parse(JSON.stringify(payload.data));
  }
  function clearCourseDraftStorage() {
    const keys=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key?.startsWith("awayGolfCourseDraft:"))keys.push(key);
    }
    keys.forEach(key=>localStorage.removeItem(key));
  }
  function setCourseListFromTransfer(payload, preserveCurrent = true, restoreDrafts = false) {
    const imported = validateCourseListTransfer(payload), previous = courseListTransferPayload(true),
      previousFavourites = [...(store.courseFavourites || [])],
      importedIds = new Set(imported.courses.map(course => String(course.id)));
    if (preserveCurrent) localStorage.setItem(PRE_COURSE_LIST_IMPORT_KEY, JSON.stringify(expiringSafetyBackup(previous)));
    const old = {
      courses: store.courses,
      courseCountries: store.courseCountries,
      courseRegions: store.courseRegions,
      courseLibrary: store.courseLibrary,
      courseFavourites: store.courseFavourites,
    };
    try {
      clearCourseDraftStorage();
      store.courses = imported.courses;
      store.courseCountries = imported.courseCountries || ["Australia"];
      store.courseRegions = imported.courseRegions || {};
      store.courseLibrary = {
        bases: imported.courseLibrary?.bases || {},
        authority: imported.courseLibrary?.authority || null,
        lastSync: imported.courseLibrary?.lastSync || null,
        previousAuthorityBases: imported.courseLibrary?.previousAuthorityBases || {},
        pending: {}, conflicts: {}, countriesPending: [],
      };
      const favourites = restoreDrafts && Array.isArray(imported.courseFavourites)
        ? imported.courseFavourites
        : previousFavourites;
      store.courseFavourites = favourites.filter(id => importedIds.has(String(id)));
      if (restoreDrafts) for (const [key,value] of Object.entries(imported.courseDrafts || {})) localStorage.setItem(key,value);
      masterCourseLibrary = null;
      if (writeLocalStore() === false) throw new Error("The replacement list could not be saved on this device.");
    } catch (error) {
      Object.assign(store, old);masterCourseLibrary=null;
      clearCourseDraftStorage();
      for (const [key,value] of Object.entries(previous.data.courseDrafts || {})) localStorage.setItem(key,value);
      try { writeLocalStore(); } catch (_) {}
      throw error;
    }
  }
  function downloadCourseListTransfer() {
    const payload=courseListTransferPayload(false),stamp=new Date().toISOString().slice(0,10),
      blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),link=document.createElement("a");
    link.href=URL.createObjectURL(blob);link.download=`Away-Golf-Course-List-${stamp}.json`;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  function courseListMissingEventReferences(courses) {
    const ids=new Set(courses.map(course=>String(course.id))),events=[store.event,...(store.eventWorkspace||[]).map(record=>record?.event)].filter(Boolean);
    return events.filter(event=>eventDays(event).some(day=>event["course"+day]&&!ids.has(String(event["course"+day]))));
  }
  async function importCourseListTransfer(file) {
    const payload=JSON.parse(await file.text()),imported=validateCourseListTransfer(payload),missing=courseListMissingEventReferences(imported.courses);
    const warning=missing.length?`\n\n${missing.length} saved event plan${missing.length===1?" refers":"s refer"} to a course not included in this file. Those plans will retain their settings but may require that course to be selected again.`:"";
    if(!confirm(`Replace all ${store.courses.length} courses on this device with the ${imported.courses.length} courses from this file?\n\nPlayers, favourites, events and scores will not be imported or replaced.${warning}`))return false;
    setCourseListFromTransfer(payload,true,false);renderCoursesAdmin();return true;
  }
  function queueMasterCourse(c) {
    const library=getMasterCourseLibrary();if(!library)return;
    try {library.queue(c);void syncMasterCourses(true);}catch(error){alert(error.message);}
  }
  function queueMasterCountry(name) {
    const library=getMasterCourseLibrary();if(!library)return;
    try {library.queueCountry(name);void syncMasterCourses(true);}catch(error){alert(error.message);}
  }
  function renderMasterCoursePanel() {
    const panel=$("#masterCourseCloud");if(!panel)return;
    const library=getMasterCourseLibrary();if(!library)return;
    const conflicts=Object.keys(library.state().conflicts),pending=Object.keys(library.state().pending).length;
    let courseUndo=null;try{courseUndo=JSON.parse(localStorage.getItem(PRE_COURSE_LIST_IMPORT_KEY)||"null");}catch{}
    panel.innerHTML=`<b>Cloud Master Course List</b><p role="status">${esc(library.message)}</p><small>${pending ? pending+" course save(s) pending. " : ""}Changes download when you open Courses or refresh this list. Favourites stay personal to this device.</small><div class="rowBtns"><button class="primary" id="syncMasterCourseList" ${library.busy?'disabled':''}>${library.busy?'Synchronisingâ€¦':'Refresh / Sync Courses'}</button>${!library.allowed?'<button class="soft" id="courseOwnerSignIn">Owner Sign-In</button>':''}${conflicts.length?'<button class="soft" id="reviewMasterCourses">Review Different Copies ('+conflicts.length+')</button>':''}</div><div class="rowBtns courseTransferActions"><button class="soft" id="exportCourseList">Download Course List</button><label class="backupImportLabel">Replace Course List from File<input type="file" id="importCourseList" accept="application/json,.json"></label>${courseUndo?'<button class="soft" id="undoCourseListImport">Undo Last Course Import</button>':''}</div><small>Course transfer changes only this deviceâ€™s planning course list. Players, events, scores and personal favourites remain on this device.</small>`;
    const shared=document.createElement('button');shared.type='button';shared.className='soft';shared.textContent='Review Shared Course Changes';shared.onclick=()=>{const host=$("#modalContent");$("#modalShade").classList.add('open');host.replaceChildren();const close=document.createElement('button');close.textContent='Close';close.onclick=()=>$("#modalShade").classList.remove('open');const reviews=document.createElement('div');host.append(close,reviews);void GolfCatalogueReview.render(reviews,AwayCloud,()=>syncMasterCourses(true));};panel.append(shared);
    $("#syncMasterCourseList").onclick=()=>void syncMasterCourses();
    $("#exportCourseList").onclick=downloadCourseListTransfer;
    $("#importCourseList").onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{if(await importCourseListTransfer(file))alert("Course list replaced successfully.");}catch(error){alert("The course list could not be replaced. "+(error.message||error));}finally{event.target.value="";}};
    if($("#undoCourseListImport"))$("#undoCourseListImport").onclick=()=>{if(!confirm("Restore the course list that was on this device before the last course import?"))return;try{setCourseListFromTransfer(courseUndo,false,true);localStorage.removeItem(PRE_COURSE_LIST_IMPORT_KEY);renderCoursesAdmin();alert("The previous course list has been restored.");}catch(error){alert("The previous course list could not be restored. "+(error.message||error));}};
    if($("#courseOwnerSignIn"))$("#courseOwnerSignIn").onclick=openOwnerAccount;
    if($("#reviewMasterCourses"))$("#reviewMasterCourses").onclick=showMasterCourseConflicts;
  }
  function masterCourseReview(c) {
    const data=JSON.parse(JSON.stringify(c));
    return `<h3>${esc(data.name)}</h3><p>${esc([data.country||"Australia",data.state,data.region].filter(Boolean).join(" Â· "))}</p><p>${esc(data.address||"")}</p><p>${esc(data.notes||"")}</p>${EVENT_TEES.map(tee=>{
      const card=courseScorecard(data,tee);if(!card)return "";
      return `<details><summary>${esc(teeMarkerColour(tee,data))} tee â€” Slope ${esc(data.teeDetails?.[tee]?.slope||card.slope||"â€”")} Â· Scratch ${esc(data.teeDetails?.[tee]?.scratch||card.scratch||"â€”")}</summary><table><thead><tr><th>Hole</th><th>Par</th><th>Index</th><th>${courseDistanceUnit(card)==='yards'?'Yards':'Metres'}</th></tr></thead><tbody>${Array.from({length:18},(_,i)=>`<tr><td>${i+1}</td><td>${esc(card.par?.[i]??"")}</td><td>${esc(card.index?.[i]??"")}</td><td>${esc(courseHoleDistance(card,i))}</td></tr>`).join("")}</tbody></table></details>`;
    }).join("")}`;
  }
  function discardCourseDraftBeforeCloud(id) {
    const key = "awayGolfCourseDraft:" + id;
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      alert("The obsolete device draft could not be removed. Keep the device copy for now. " + error.message);
      return false;
    }
  }
  function showMasterCourseConflicts() {
    const library=getMasterCourseLibrary(),ids=Object.keys(library.state().conflicts);
    $("#modalContent").innerHTML=`<h2>Review Different Course Copies</h2><p>Your device and the cloud have different details. Choose the correct copy; the other copy will be removed.</p>${ids.map(id=>`<div class="courseConflict"><h3>${esc(course(id,true)?.name||id)}</h3><div class="rowBtns"><button class="soft" data-coursecompare="${esc(id)}">Compare / Choose</button></div></div>`).join("")}<div class="rowBtns"><button class="soft" id="useAllCloudCourses">Use Cloud Copies for All</button><button class="soft" id="closeCourseReview">Close</button></div>`;
    $("#modalShade").classList.add("open");
    $("#closeCourseReview").onclick=()=>$("#modalShade").classList.remove("open");
    $("#useAllCloudCourses").onclick=()=>{if(!confirm(`Use the cloud copy for all ${ids.length} courses and remove the conflicting device copies?`))return;for(const id of ids){if(!discardCourseDraftBeforeCloud(id))return;library.resolve(id,'cloud');}$("#modalShade").classList.remove("open");void syncMasterCourses();};
    $$('[data-coursecompare]').forEach(b=>b.onclick=()=>showMasterCourseComparison(b.dataset.coursecompare));
  }
  function showMasterCourseComparison(id) {
    const library=getMasterCourseLibrary(),remote=library.state().conflicts[id];if(!remote)return;
    $("#modalContent").innerHTML=`<h2>Choose Course Details</h2><div id="courseCardComparison"></div><p>Choosing this device submits its details as the proposed replacement. The copy not chosen is removed.</p><div class="rowBtns"><button class="primary" id="chooseCloudCourse">Use Cloud Copy</button><button class="soft" id="chooseDeviceCourse">Submit This Deviceâ€™s Copy</button><button class="soft" id="backCourseConflicts">Back</button></div>`;
    GolfCatalogueReview.renderComparison($("#courseCardComparison"),course(id,true),remote.data,"On this device",`Master revision ${remote.revision}`);
    $("#chooseCloudCourse").onclick=()=>{if(!discardCourseDraftBeforeCloud(id))return;library.resolve(id,'cloud');$("#modalShade").classList.remove("open");void syncMasterCourses();};
    $("#chooseDeviceCourse").onclick=()=>{if(!confirm('Save this deviceâ€™s details as the next cloud revision?'))return;library.resolve(id,'local');$("#modalShade").classList.remove("open");void syncMasterCourses();};
    $("#backCourseConflicts").onclick=showMasterCourseConflicts;
  }
  const COURSE_AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];
  let courseLocationFilter = { country: "", state: "", region: "" };
  function cleanCourseLocation(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }
  function courseCountryList(extra = "") {
    const names = new Map();
    for (const value of ["Australia", ...(store.courseCountries || []), ...store.courses.map(c => c.country), extra]) {
      const name = cleanCourseLocation(value);
      if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }
  function canonicalCourseCountry(value) {
    const name = cleanCourseLocation(value);
    return courseCountryList().find(c => c.toLowerCase() === name.toLowerCase()) || name;
  }
  function addCourseCountry(value) {
    const name = canonicalCourseCountry(value);
    if (!name) return "";
    store.courseCountries = courseCountryList(name);
    return name;
  }
  function courseLocationMatches(c, filters) {
    const norm = value => cleanCourseLocation(value).toLowerCase();
    return (!filters.country || norm(c.country || "Australia") === norm(filters.country)) &&
      (!filters.state || norm(c.state) === norm(filters.state)) &&
      (!filters.region || norm(c.region) === norm(filters.region));
  }
  function courseLocationIssues(c) {
    const issues = [];
    if (!cleanCourseLocation(c.country)) issues.push("Choose a country.");
    if (!cleanCourseLocation(c.region)) issues.push("Enter a Region / Area.");
    if (c.country === "Australia" && !COURSE_AU_STATES.includes(c.state)) issues.push("Choose an Australian state or territory.");
    return issues;
  }
  function courseRegionList(country,extra="") {
    return GolfCourseLocations.areas(country,store.courses,[...(store.courseRegions?.[country]||[]),extra]);
  }
  function courseRegionField(country,value="") {
    value = GolfCourseLocations.area(value);
    return `<select id="mcregion"><option value="">Choose</option>${courseRegionList(country,value).map(name=>`<option value="${esc(name)}" ${name===value?"selected":""}>${esc(name)}</option>`).join("")}<option value="__add_region__">Add a new areaâ€¦</option></select>`;
  }
  function bindCourseRegion(country) {
    $("#mcregion").onchange=e=>{if(e.target.value!=="__add_region__")return;const value=GolfCourseLocations.area(prompt("New Region / Area"));if(value){void AwayCloud.addCourseLocation?.(country,value).catch(error=>console.warn(error));store.courseRegions ||= {};store.courseRegions[country]=GolfCourseLocations.unique([...(store.courseRegions[country]||[]),value]);writeLocalStore();}const label=e.target.parentElement;label.innerHTML="Region / Area"+courseRegionField(country,value);bindCourseRegion(country);};
  }
  function courseLocationFields(c) {
    const country = canonicalCourseCountry(c.country || "Australia");
    return `<label>Country<select id="mccountry">${courseCountryList(country).map(name => `<option value="${esc(name)}" ${name === country ? "selected" : ""}>${esc(name)}</option>`).join("")}<option value="__add_country__">Add a countryâ€¦</option></select></label><label><span id="mcstateLabel">${country === "Australia" ? "State / Territory" : "State / Province (optional)"}</span><span id="mcstateField">${courseStateField(country, c.state)}</span></label><label>Region / Area${courseRegionField(country,c.region||"")}</label>`;
  }
  function courseStateField(country, state = "") {
    const values = GolfCourseLocations.provinces(country,store.courses,[...(store.courseProvinces?.[country]||[]),state]);
    return `<select id="mcstate"><option value="">Choose</option>${values.map(name=>`<option value="${esc(name)}" ${name===state?"selected":""}>${esc(name)}</option>`).join("")}${country === "Australia" ? "" : '<option value="__add_state__">Add a state / provinceâ€¦</option>'}</select>`;
  }
  function bindCourseProvince(country) {
    $("#mcstate").onchange=e=>{if(e.target.value!=="__add_state__")return;const value=cleanCourseLocation(prompt("New State / Province"));if(value){store.courseProvinces ||= {};store.courseProvinces[country]=GolfCourseLocations.unique([...(store.courseProvinces[country]||[]),value]);writeLocalStore();}$("#mcstateField").innerHTML=courseStateField(country,value);bindCourseProvince(country);};
  }
  function renderCourseLocationFilters() {
    const f = courseLocationFilter;
    const matching = store.courses.filter(c => courseLocationMatches(c, { country: f.country, state: "", region: "" }));
    const unique = values => [...new Map(values.map(cleanCourseLocation).filter(Boolean).map(v => [v.toLowerCase(), v])).values()].sort((a,b) => a.localeCompare(b));
    const states = unique(matching.map(c => c.state));
    if (f.state && !states.includes(f.state)) f.state = "";
    const regions = unique(matching.filter(c => courseLocationMatches(c, { state: f.state })).map(c => c.region));
    if (f.region && !regions.includes(f.region)) f.region = "";
    const options = (values, selected, all) => `<option value="">${all}</option>` + values.map(v => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(v)}</option>`).join("");
    $("#courseLocationFilters").innerHTML = `<label>Country<select id="courseCountryFilter">${options(courseCountryList(), f.country, "All countries")}</select></label><label>State / Province<select id="courseStateFilter">${options(states, f.state, "All states / provinces")}</select></label><label>Region / Area<select id="courseRegionFilter">${options(regions, f.region, "All regions / areas")}</select></label><div class="rowBtns"><button class="soft" id="clearCourseFilters">Clear filters</button><button class="soft" id="adminAddCountry">+ Add country</button></div>`;
    for (const [id, key] of [["courseCountryFilter", "country"], ["courseStateFilter", "state"], ["courseRegionFilter", "region"]]) $("#" + id).onchange = e => { f[key] = e.target.value; if (key === "country") f.state = f.region = ""; if (key === "state") f.region = ""; renderCoursesAdmin(); };
    $("#clearCourseFilters").onclick = () => { courseLocationFilter = { country: "", state: "", region: "" }; $("#courseSearchMain").value = ""; renderCoursesAdmin(); };
    $("#adminAddCountry").onclick = () => { const name = addCourseCountry(prompt("Country name")); if (name) { save(); queueMasterCountry(name); renderCoursesAdmin(); } };
  }
  function courseDetail(id, requestedCardTee = "", requestedCategory = "") {
    const acceptedCourse = course(id, true);
    if (!acceptedCourse) return;
    const draftKey = "awayGolfCourseDraft:" + id;
    let draft;
    try { draft = JSON.parse(localStorage.getItem(draftKey) || "null"); } catch {}
    const courseDataCompleteness = record => {
      if (!record) return 0;
      let total = 0;
      for (const cardCategory of ["men", "women"]) {
        const data = GolfCourseCategories.data(record, cardCategory);
        for (const tee of GolfCourseCategories.positions(data)) {
          const card = courseScorecard(record, tee, false, cardCategory);
          if (!card) continue;
          for (const field of ["par", "index", "metres"])
            total += (card[field] || []).filter(value => String(value ?? "").trim() !== "").length;
        }
      }
      return total;
    };
    const acceptedAt = Date.parse(acceptedCourse.masterAcceptedAt || ""),
      draftSavedAt = Date.parse(draft?.savedAt || ""),
      acceptedIsNewer = Number.isFinite(acceptedAt) && Number.isFinite(draftSavedAt) && acceptedAt > draftSavedAt,
      acceptedIsMoreComplete = courseDataCompleteness(acceptedCourse) > courseDataCompleteness(draft?.course);
    if (draft?.course?.id === id && (acceptedIsNewer || acceptedIsMoreComplete)) {
      localStorage.removeItem(draftKey);
      draft = null;
    }
    let c = JSON.parse(JSON.stringify(draft?.course?.id === id ? draft.course : acceptedCourse));
    ensureCourseData(c);
    const category=requestedCategory||draft?.category||"men", categoryData=GolfCourseCategories.data(c,category,true);
    const cardTees=GolfCourseCategories.positions(categoryData);
    for(const tee of cardTees){categoryData.teeDetails ||= {};categoryData.teeDetails[tee] ||= {name:GolfCourseCategories.positionLabel(categoryData,tee)};categoryData.teeDetails[tee].name=GolfCourseCategories.positionLabel(categoryData,tee);}
    const availableCardTees = cardTees.filter((tee) => courseScorecard(c, tee, false, category));
    let activeCardTee = cardTees.includes(requestedCardTee)
        ? requestedCardTee
        : cardTees.includes(categoryData.activeScorecardTee)
          ? categoryData.activeScorecardTee
          : availableCardTees[0] || (cardTees.includes("middle")?"middle":cardTees[0]),
      v = courseScorecard(c, activeCardTee, true, category),
      t = categoryData.teeDetails,
      distanceInputUnit = v.distanceInputUnit || courseDistanceUnit(v),
      distanceSavedUnit = courseDistanceUnit(v);
    categoryData.activeScorecardTee = activeCardTee;
    store.courseFavourites = store.courseFavourites || [];
    const isFavourite = store.courseFavourites
      .map(String)
      .includes(String(c.id));
    const nineRows = (first, last) =>
      Array.from({ length: last - first + 1 }, (_, j) => {
        let i = first - 1 + j;
        return `<tr><td>${i + 1}</td><td><input type="text" inputmode="numeric" maxlength="1" class="scorecardInput" id="scPar${i}" value="${v.par?.[i] ?? ""}"></td><td><input type="text" inputmode="numeric" maxlength="8" class="scorecardInput" id="scIdx${i}" value="${esc(v.index?.[i] ?? "")}"></td><td><input type="text" inputmode="numeric" maxlength="4" class="scorecardInput" id="scMet${i}" value="${courseInputDistance(v, i, distanceInputUnit)}"></td></tr>`;
      }).join("");
    const scoreTable = (first, last, label) =>
      `<table class="scoreNine"><thead><tr><th colspan="4">${label}</th></tr><tr><th class="holeCol">Hole</th><th class="parCol">Par</th><th class="indexCol">Index</th><th class="lengthCol">Length (<span class="distanceInputLabel">${distanceInputUnit === "yards" ? "yd" : "m"}</span>)</th></tr></thead><tbody>${nineRows(first, last)}</tbody></table>`;
    const totalsMarkup = () => {
      const pars = Array.from({ length: 18 }, (_, i) => +$("#scPar" + i)?.value || +(v.par?.[i] || 0));
      const raw = Array.from({ length: 18 }, (_, i) => $("#scMet" + i) ? $("#scMet" + i).value : courseInputDistance(v, i, distanceInputUnit));
      const preview = {};
      recordCourseDistances(preview, raw, distanceInputUnit, distanceSavedUnit);
      const metres = Array.from({ length: 18 }, (_, i) => +courseHoleDistance(preview, i) || 0), unit = courseDistanceAbbrev(preview);
      const sum = (values) => values.reduce((total, value) => total + value, 0);
      return `<div class="scorecardTotals"><div><b>OUT</b><span>${sum(metres.slice(0, 9))} ${unit}</span><span>Par ${sum(pars.slice(0, 9))}</span></div><div><b>IN</b><span>${sum(metres.slice(9))} ${unit}</span><span>Par ${sum(pars.slice(9))}</span></div><div><b>TOTAL</b><span>${sum(metres)} ${unit}</span><span>Par ${sum(pars)}</span></div></div>`;
    };
    const teeRow = (key, label) => {
      const selectedColour = teeMarkerColour(key, c, category),
        colourOptions = TEE_MARKER_COLOURS.map(
          (colour) =>
            `<option value="${colour}" ${colour === selectedColour ? "selected" : ""}>${colour}</option>`,
        ).join(""),
        customOption = selectedColour && !TEE_MARKER_COLOURS.includes(selectedColour)
          ? `<option value="${esc(selectedColour)}" selected>${esc(selectedColour)}</option>` : "";
      return `<tr><td><b>${label}</b></td><td><select class="teeDetailEntry teeColourSelect" id="${key}Colour" data-saved-colour="${esc(selectedColour)}">${colourOptions}${customOption}<option value="__other__">Other â€” specify</option></select></td><td><input class="teeDetailEntry" id="${key}Slope" value="${esc(t[key]?.slope || "")}"></td><td><input class="teeDetailEntry" id="${key}Scratch" value="${esc(t[key]?.scratch || "")}"></td><td><input class="teeDetailEntry" id="${key}Par" value="${esc(t[key]?.par || "")}"></td><td><span class="teeLengthValue"><input class="teeDetailEntry" id="${key}Length" value="${esc(courseDistanceTotal(courseScorecard(c, key, false, category) || {}) || t[key]?.length || "")}" readonly><small>${courseDistanceAbbrev(courseScorecard(c, key, false, category) || {})}</small></span></td></tr>`;
    };
    const cardOptions = cardTees.map((tee) => {
      const exists = Boolean(courseScorecard(c, tee, false, category));
      return `<option value="${tee}" ${tee === activeCardTee ? "selected" : ""}>${esc(teeMarkerColour(tee, c, category))}${exists ? "" : " â€” New card"}</option>`;
    }).join("");
    const copyCardOptions = cardTees.filter(
      (tee) => tee !== activeCardTee && Boolean(courseScorecard(c, tee, false, category)),
    )
      .map(
        (tee) =>
          `<option value="${tee}">${esc(teeMarkerColour(tee, c, category))}</option>`,
      )
      .join("");
    $("#modalContent").innerHTML =
      `<div class="courseDetailTop"><h2>Course Details â€” ${esc(c.name)}</h2><label class="favDetailToggle"><input type="checkbox" id="courseFavourite" ${isFavourite ? "checked" : ""}> Favourite course</label></div><div class="modalGrid courseContactGrid"><label>Name<input id="mcname" value="${esc(c.name)}"></label>${courseLocationFields(c)}<label>Club phone<input id="mcClubPhone" inputmode="tel" value="${esc(c.clubPhone || "")}"></label><label>Pro Shop phone<input id="mcProPhone" inputmode="tel" value="${esc(c.proPhone || "")}"></label><label>Club email<input id="mcClubEmail" inputmode="email" value="${esc(c.clubEmail || "")}"></label><label>Pro Shop email<input id="mcProEmail" inputmode="email" value="${esc(c.proEmail || "")}"></label><label>Golf professionalâ€™s name<input id="mcProName" value="${esc(c.proName || "")}"></label><label>Address / location<input id="mcaddress" value="${esc(c.address || "")}"></label><label>Google Maps link<input id="mcmap" value="${esc(c.mapLink || "")}"></label><label>Website<input id="mcweb" value="${esc(c.website || "")}"></label></div><label class="courseNotesLabel">Notes<textarea id="mcnotes" rows="4" placeholder="Course condition, greens cored, booking or clubhouse notes...">${esc(c.notes || "")}</textarea></label><div class="courseCategoryControls"><label class="courseCategorySelect"><b>Select Tee Data â€” Men/Women</b><select id="courseDataCategory"><option value="men" ${category==="men"?"selected":""}>Men</option><option value="women" ${category==="women"?"selected":""}>Women</option></select></label><label>Tee Positions<select id="courseTeePositionCount">${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===cardTees.length?"selected":""}>${n}</option>`).join("")}</select></label></div><small>Extra saved tees are retained when you reduce the number of positions.</small>${category==="women"?`<div class="scorecardCopyRow"><label>Copy from<select id="copyMenSource">${GolfCourseCategories.positions(c).map(tee=>`<option value="${tee}" ${tee==="middle"?"selected":""}>Menâ€™s ${GolfCourseCategories.positionLabel(c,tee)}${c.teeDetails?.[tee]?.colour?" Â· "+esc(c.teeDetails[tee].colour):""}</option>`).join("")}</select></label><label>Copy to<select id="copyWomenDestination">${cardTees.map(tee=>`<option value="${tee}" ${tee===activeCardTee?"selected":""}>Womenâ€™s ${GolfCourseCategories.positionLabel(categoryData,tee)}${categoryData.teeDetails?.[tee]?.colour?" Â· "+esc(categoryData.teeDetails[tee].colour):""}</option>`).join("")}</select></label><button type="button" class="soft" id="copyMenToWomen">Copy selected tee card</button></div><label class="cardCheckedConfirm"><input type="checkbox" id="womenDataChecked" ${categoryData.needsReview?"":"checked"}> Womenâ€™s ratings, pars, indexes and lengths checked against the official card</label>`:""}<h3>${category==="women"?"Womenâ€™s":"Menâ€™s"} Tee Details</h3><p class="scorecardHelp">Choose the course marker colour, then enter each value. Press Enter to move to the next field.</p><table class="teeTable"><thead><tr><th>Tee</th><th>Colour</th><th>Slope</th><th>Scratch</th><th>Par</th><th>Length</th></tr></thead><tbody>${cardTees.map(tee=>teeRow(tee,GolfCourseCategories.positionLabel(categoryData,tee))).join("")}</tbody></table><div class="scorecardTeeHeading"><h3>Scorecard â€” Active Tee <span>${esc(teeMarkerColour(activeCardTee, c, category))}</span></h3><label>Scorecard tee<select id="scorecardTeeSelect">${cardOptions}</select></label></div><p class="scorecardHelp">Choose the tee card above. A new card copies the saved pars; enter its own indexes and lengths.</p><div class="courseDistanceControls"><label>Enter hole lengths in<select id="courseDistanceInput"><option value="metres" ${distanceInputUnit === "metres" ? "selected" : ""}>Metres</option><option value="yards" ${distanceInputUnit === "yards" ? "selected" : ""}>Yards</option></select></label><label>Save and display lengths as<select id="courseDistanceSave"><option value="metres" ${distanceSavedUnit === "metres" ? "selected" : ""}>${distanceInputUnit === "yards" ? "Convert to metres" : "Metres"}</option><option value="yards" ${distanceSavedUnit === "yards" ? "selected" : ""} ${distanceInputUnit === "yards" ? "" : "disabled"}>Keep yards as entered</option></select></label><small>1 yard = 0.9144 metres. Converted metres are rounded to whole metres for each hole. Totals add the saved hole lengths.</small></div><div class="scoreMini"><div class="scoreNineWrap">${scoreTable(1, 9, "Front Nine")}${scoreTable(10, 18, "Back Nine")}</div></div><div class="rowBtns" style="margin-top:12px"><button class="soft" id="saveCourseDraft">Save Draft</button><button class="primary" id="saveCourseModal">Save Completed Course</button>${c.mapLink ? `<button class="soft" id="openMapLink">Open Map</button>` : ""}<button class="soft" id="closeModal">Close</button></div>`;
    if (copyCardOptions)
      $(".scorecardTeeHeading").insertAdjacentHTML(
        "afterend",
        `<div class="scorecardCopyRow"><label>Copy from tee<select id="copyScorecardFrom"><option value="">Choose tee</option>${copyCardOptions}</select></label><label>Copy<select id="copyScorecardMode"><option value="whole">Whole Card</option><option value="par">Par only</option><option value="index">Index only</option><option value="metres">Length only</option></select></label><button type="button" class="soft" id="copyScorecardButton">Copy into ${esc(teeMarkerColour(activeCardTee, c, category))}</button><small>Copy the whole card or only Par, Index or Length. A single-column copy keeps the other columns and tee ratings.</small></div>`,
      );
    $(".scoreMini")?.insertAdjacentHTML(
      "afterend",
      `<div id="scorecardTotals">${totalsMarkup()}</div>`,
    );
    $("#modalContent .rowBtns")?.insertAdjacentHTML("beforebegin", '<p id="courseDraftStatus" role="status" style="margin:12px 0">Drafts save automatically on this device. Complete cards are shared with the cloud master.</p>');
    if (draft?.savedAt) $("#courseDraftStatus").textContent = "Resumed draft saved " + new Date(draft.savedAt).toLocaleString() + ". Drafts stay on this device until the completed course is saved.";
    let selectedCountry = canonicalCourseCountry(c.country || "Australia");
    $("#mccountry").onchange = e => {
      let next = e.target.value;
      if (next === "__add_country__") {
        next = canonicalCourseCountry(prompt("New country name"));
        if (!next) { e.target.value = selectedCountry; return; }
        e.target.innerHTML = courseCountryList(next).map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("") + '<option value="__add_country__">Add a countryâ€¦</option>';
        e.target.value = next;
      }
      if (next !== selectedCountry) {
        $("#mcstateField").innerHTML = courseStateField(next);bindCourseProvince(next);
        $("#mcregion").parentElement.innerHTML="Region / Area"+courseRegionField(next);bindCourseRegion(next);
        $("#mcstateLabel").textContent = next === "Australia" ? "State / Territory" : "State / Province (optional)";
      }
      selectedCountry = next;
    };
    $("#modalShade").classList.add("open");
    $("#closeModal").onclick = () => $("#modalShade").classList.remove("open");
    if ($("#openMapLink"))
      $("#openMapLink").onclick = () =>
        window.open(c.mapLink, "_blank", "noopener");
    $("#courseFavourite").onchange = (e) => {
      const ids = store.courseFavourites.map(String),
        i = ids.indexOf(String(c.id));
      if (e.target.checked && i < 0) store.courseFavourites.push(String(c.id));
      if (!e.target.checked && i >= 0) store.courseFavourites.splice(i, 1);
      writeLocalStore();
      renderCoursesAdmin();
    };
    bindCourseRegion(c.country || "Australia");bindCourseProvince(c.country || "Australia");
    const captureVisibleCard = () => {
      for (let i = 0; i < 18; i++) {
        v.par[i] = +$("#scPar" + i).value || "";
        v.index[i] = $("#scIdx" + i).value.trim();
      }
      recordCourseDistances(v, Array.from({ length: 18 }, (_, i) => $("#scMet" + i).value), distanceInputUnit, distanceSavedUnit);
      categoryData.teeDetails[activeCardTee].length = v.metres.reduce((sum, value) => sum + (+value || 0), 0);
      categoryData.teeDetails[activeCardTee].par = v.par.reduce((sum, value) => sum + (+value || 0), 0);
    };
    const captureCourseFields = () => {
      if(category==="women")categoryData.needsReview=!$("#womenDataChecked").checked;
      c.name = gcCourseName($("#mcname").value.trim() || c.name);
      c.country = canonicalCourseCountry($("#mccountry").value);
      c.state = cleanCourseLocation($("#mcstate").value);
      c.region = cleanCourseLocation($("#mcregion").value);
      c.clubPhone = $("#mcClubPhone").value.trim();
      c.proPhone = $("#mcProPhone").value.trim();
      c.phone = c.proPhone;
      c.clubEmail = $("#mcClubEmail").value.trim();
      c.proEmail = $("#mcProEmail").value.trim();
      c.email = c.clubEmail;
      c.proName = $("#mcProName").value.trim();
      c.address = $("#mcaddress").value.trim();
      c.mapLink = $("#mcmap").value.trim();
      c.website = $("#mcweb").value.trim();
      c.notes = $("#mcnotes").value.trim();
      for (const key of cardTees) {
        categoryData.teeDetails[key] = categoryData.teeDetails[key] || {};
        categoryData.teeDetails[key].colour = $("#" + key + "Colour").value;
        categoryData.teeDetails[key].slope = $("#" + key + "Slope").value.trim();
        categoryData.teeDetails[key].scratch = $("#" + key + "Scratch").value.trim();
        categoryData.teeDetails[key].par = $("#" + key + "Par").value.trim();
        const savedCard = categoryData.teeScorecards?.[key];
        if (savedCard) categoryData.teeDetails[key].length = (savedCard.metres || []).reduce((sum, value) => sum + (+value || 0), 0);
      }
      captureVisibleCard();
    };
    const saveCourseDraft = (capture = true) => {
      if (!$("#saveCourseDraft")) return true;
      if (capture) captureCourseFields();
      categoryData.activeScorecardTee = activeCardTee;
      try {
        const savedAt = new Date().toISOString();
        localStorage.setItem(draftKey, JSON.stringify({savedAt, course:c,category}));
        $("#courseDraftStatus").textContent = "Draft saved on this device at " + new Date(savedAt).toLocaleTimeString() + ". You can close this editor and resume later. Completed cloud card unchanged.";
        return true;
      } catch (error) {
        $("#courseDraftStatus").textContent = "Draft could not be saved. Keep this editor open. " + error.message;
        return false;
      }
    };
    $("#courseTeePositionCount").onchange=e=>{captureCourseFields();categoryData.teePositionCount=Number(e.target.value);for(const [tee,card] of Object.entries(categoryData.teeScorecards||{}))if(!GolfCourseCategories.positions(categoryData).includes(tee)&&!GolfCourseCategories.data(acceptedCourse,category).teeScorecards?.[tee]&&['par','index','metres'].every(key=>(card[key]||[]).every(value=>value===''||value==null)))delete categoryData.teeScorecards[tee];if(!saveCourseDraft(false))return;courseDetail(id,"",category);};
    $("#courseDataCategory").onchange=e=>{if(!saveCourseDraft())return;courseDetail(id,"",e.target.value);};
    if($("#copyMenToWomen"))$("#copyMenToWomen").onclick=()=>{
      captureCourseFields();const source=$("#copyMenSource").value,destination=$("#copyWomenDestination").value;
      let copied;try{copied=GolfCourseCategories.copyMenTee(c,source,destination);}catch(error){alert(error.message);return;}
      if(!confirm(`Copy Menâ€™s ${source} tee ratings and all 18 holes to Womenâ€™s ${destination}? This replaces only that Womenâ€™s tee card. Check its ratings, pars, indexes and lengths before saving.`))return;
      c.womenTeeData=copied.womenTeeData;
      // Do not retain an empty card created just by opening this editor.
      for(const [tee,card] of Object.entries(c.womenTeeData.teeScorecards||{}))if(tee!==destination&&!acceptedCourse.womenTeeData?.teeScorecards?.[tee]&&['par','index','metres'].every(key=>(card[key]||[]).every(value=>value===''||value==null)))delete c.womenTeeData.teeScorecards[tee];
      if(!saveCourseDraft(false))return;courseDetail(id,destination,"women");
    };
    $("#saveCourseDraft").onclick = saveCourseDraft;
    $$(".teeColourSelect").forEach(select=>select.addEventListener("change",()=>{
      if(select.value!=="__other__"){select.dataset.savedColour=select.value;return;}
      const custom=String(prompt("Enter the tee colour or tee denotation",select.dataset.savedColour||"")||"").trim();
      if(!custom){select.value=select.dataset.savedColour||TEE_MARKER_COLOURS[0];return;}
      const option=document.createElement("option");option.value=custom;option.textContent=custom;
      select.insertBefore(option,select.options[select.options.length-1]);select.value=custom;select.dataset.savedColour=custom;
    }));
    $("#modalContent").oninput = saveCourseDraft;
    $("#modalContent").onchange = saveCourseDraft;
    $("#closeModal").onclick = () => { if(saveCourseDraft()) { $("#modalContent").oninput = $("#modalContent").onchange = null; $("#modalShade").classList.remove("open"); } };
    const refreshDistanceLabels = () => {
      $$(".distanceInputLabel").forEach(label => label.textContent = distanceInputUnit === "yards" ? "yd" : "m");
      $("#scorecardTotals").innerHTML = totalsMarkup();
    };
    $("#courseDistanceInput").onchange = (event) => {
      const next = event.target.value;
      const card = {};
      recordCourseDistances(card, Array.from({ length: 18 }, (_, i) => $("#scMet" + i).value), distanceInputUnit, distanceSavedUnit);
      for (let i = 0; i < 18; i++) $("#scMet" + i).value = courseInputDistance(card, i, next);
      distanceInputUnit = next;
      if (next === "metres") distanceSavedUnit = "metres";
      $("#courseDistanceSave").value = distanceSavedUnit;
      $("#courseDistanceSave").options[0].textContent = next === "yards" ? "Convert to metres" : "Metres";
      $("#courseDistanceSave").options[1].disabled = next !== "yards";
      refreshDistanceLabels();
    };
    $("#courseDistanceSave").onchange = (event) => {
      distanceSavedUnit = event.target.value;
      refreshDistanceLabels();
    };
    $("#scorecardTeeSelect").onchange = (event) => {
      captureCourseFields();
      const nextTee = event.target.value;
      courseScorecard(c, nextTee, true, category);
      categoryData.activeScorecardTee = nextTee;
      if (!saveCourseDraft()) return;
      courseDetail(id, nextTee, category);
    };
    if ($("#copyScorecardButton"))
      $("#copyScorecardButton").onclick = () => {
        const sourceTee = $("#copyScorecardFrom").value;
        if (!sourceTee) {
          alert("Choose the tee scorecard you want to copy from.");
          return;
        }
        const source = courseScorecard(c, sourceTee, false, category);
        if (!source) return;
        const selection = $("#copyScorecardMode").value;
        const labels = { whole: "the whole card", par: "only the Par column", index: "only the Index column", metres: "only the Length column" };
        if (!Object.hasOwn(labels, selection)) return;
        const sourceColour = teeMarkerColour(sourceTee, c, category),
          destinationColour = teeMarkerColour(activeCardTee, c, category);
        if (
          !confirm(
            `Copy ${labels[selection]} from ${sourceColour} into ${destinationColour}?\n\n${selection === "whole" ? "This replaces all 18 pars, indexes and hole lengths." : "This replaces only that column. Other columns and tee ratings stay unchanged."}`,
          )
        )
          return;
        captureCourseFields();
        if (selection === "whole") {
          categoryData.teeScorecards[activeCardTee] = cloneCourseCard(source, activeCardTee);
        } else if (selection === "metres") {
          const distances = cloneCourseCard(source, activeCardTee);
          v.metres = distances.metres;
          v.distanceUnit = distances.distanceUnit;
          v.distanceInputUnit = distances.distanceInputUnit;
          if (distances.yards) v.yards = distances.yards;
          else delete v.yards;
        } else {
          v[selection] = Array.from({ length: 18 }, (_, i) => source[selection]?.[i] ?? "");
        }
        const result = categoryData.teeScorecards[activeCardTee];
        categoryData.teeDetails[activeCardTee].par = result.par.reduce((sum, value) => sum + (+value || 0), 0);
        categoryData.teeDetails[activeCardTee].length = result.metres.reduce((sum, value) => sum + (+value || 0), 0);
        categoryData.activeScorecardTee = activeCardTee;
        if (!saveCourseDraft(false)) return;
        courseDetail(id, activeCardTee, category);
      };
    const entryOrder = [];
    for (let i = 0; i < 18; i++)
      entryOrder.push($("#scPar" + i), $("#scIdx" + i), $("#scMet" + i));
    entryOrder.forEach((input, i) =>
      input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          entryOrder[i + 1]?.focus();
          entryOrder[i + 1]?.select();
        }
      }),
    );
    entryOrder.forEach((input) => input?.addEventListener("input", () => {
      $("#scorecardTotals").innerHTML = totalsMarkup();
    }));
    const teeEntryOrder = [...$$('.teeDetailEntry')];
    teeEntryOrder.forEach((input, i) =>
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        teeEntryOrder[i + 1]?.focus();
        teeEntryOrder[i + 1]?.select?.();
      }),
    );
    $("#saveCourseModal").onclick = () => {
      if (!saveCourseDraft()) return;
      const location = { country: canonicalCourseCountry($("#mccountry").value), state: $("#mcstate").value, region: $("#mcregion").value };
      const locationIssues = courseLocationIssues(location);
      if ((c.locationRequired || c.locationIdentified) && locationIssues.length) {
        alert("Complete the course location before saving:\n\n" + locationIssues.join("\n"));
        return;
      }
      captureCourseFields();
      const cardChecks = ["men","women"].flatMap(cat=>{
        const categoryCourse=GolfCourseCategories.data(c,cat), activeTees=new Set(GolfCourseCategories.positions(categoryCourse));
        return Object.keys(categoryCourse.teeScorecards||{}).filter(tee=>activeTees.has(tee)).map(tee=>({tee,category:cat,...validateCourseScorecard(c,tee,cat)}));
      });
      const cardCheck = {ok:cardChecks.every(check => check.ok), issues:cardChecks.flatMap(check => check.issues.map(issue => check.category + " Â· " + teeMarkerColour(check.tee,c,check.category) + ": " + issue))};
      if (!cardCheck.ok) {
        alert(
          "The scorecard cannot be saved yet:\n\n" +
            cardCheck.issues.slice(0, 8).join("\n") +
            (cardCheck.issues.length > 8
              ? `\nâ€¦and ${cardCheck.issues.length - 8} more item(s).`
              : ""),
        );
        return;
      }
      categoryData.activeScorecardTee = activeCardTee;
      addCourseCountry(c.country);
      if (!locationIssues.length) { delete c.locationRequired; c.locationIdentified = true; }
      const previous = JSON.parse(JSON.stringify(acceptedCourse));
      for (const key of Object.keys(acceptedCourse)) delete acceptedCourse[key];
      Object.assign(acceptedCourse, c);
      if (!save()) { for (const key of Object.keys(acceptedCourse)) delete acceptedCourse[key]; Object.assign(acceptedCourse, previous); return; }
      $("#modalContent").oninput = $("#modalContent").onchange = null;
      queueMasterCourse(acceptedCourse);
      queueMasterCountry(c.country);
      $("#modalShade").classList.remove("open");
    };
  }
  function renderCoursesAdmin() {
    renderMasterCoursePanel();
    renderCourseLocationFilters();
    store.courseFavourites = store.courseFavourites || [];
    const favIds = new Set(store.courseFavourites.map(String));
    let q = ($("#courseSearchMain").value || "").toLowerCase(),
      cs = [...store.courses]
        .filter((c) => c.name.toLowerCase().includes(q) && courseLocationMatches(c, courseLocationFilter))
        .sort((x, y) => x.name.localeCompare(y.name)),
      act = cs.filter((c) => c.available !== false),
      ina = cs.filter((c) => c.available === false),
      fav = act.filter((c) => favIds.has(String(c.id))),
      other = act.filter((c) => !favIds.has(String(c.id)));
    let row = (c) => {
      ensureCourseData(c);
      const cardTees = EVENT_TEES.filter((tee) => courseScorecard(c, tee));
      let v = courseScorecard(c, c.activeScorecardTee) || courseScorecard(c, cardTees[0]) || version(c) || {},
        t = c.teeDetails.middle || {},
        scoreKnown = cardTees.some((tee) => validateCourseScorecard(c, tee).ok),
        contactKnown = Boolean(
          c.clubPhone || c.proPhone || c.address || c.website || c.mapLink,
        ),
        status =
          scoreKnown && contactKnown
            ? "Details recorded"
            : scoreKnown || contactKnown
              ? "Details partly recorded"
              : "Details to complete",
        star = favIds.has(String(c.id))
          ? '<span class="courseFavouriteStar" title="Favourite course">â˜…</span>'
          : "";
      return `<div class="courseRow ${c.available === false ? "inactive" : ""}"><div><b>${star}${esc(c.name)}</b><small>Middle / ${esc(teeMarkerColour("middle", c))} â€” Slope ${esc(t.slope || v.slope || "â€”")} â€¢ Par ${esc(t.par || "â€”")} â€¢ Length ${courseDistanceTotal(courseScorecard(c, "middle") || {}) ? courseDistanceTotal(courseScorecard(c, "middle")) + " " + courseDistanceAbbrev(courseScorecard(c, "middle")) : t.length ? esc(t.length) + " m" : "â€”"}</small><small>Cards Stored Men ${GolfCourseCategories.storedCount(c,"men")} Women ${GolfCourseCategories.storedCount(c,"women")}</small><small>${esc([c.country || "Australia", c.state, c.region].filter(Boolean).join(" Â· "))} â€¢ ${c.address ? esc(c.address) : "Location not yet entered"}${c.proPhone ? " â€¢ Pro Shop " + esc(c.proPhone) : ""}</small><span class="courseStatus">${status}</span><small>${esc(getMasterCourseLibrary()?.status(String(c.id)) || "On this device")}</small>${c.notes ? `<small>${esc(c.notes)}</small>` : ""}</div><div class="rowBtns"><button class="soft" data-cinfo="${c.id}">Course Details</button>${c.available === false ? `<button class="soft" data-creactivate="${c.id}">Reactivate</button>` : `<button class="danger" data-cinactive="${c.id}">âˆ’</button>`}</div></div>`;
    };
    let ret = wizardReturnStep
      ? `<div class="returnSetupBar"><button class="soft" id="returnToWizardCourses">â† Return to Setup</button></div>`
      : "";
    $("#courseAdminList").innerHTML =
      ret +
      (fav.length
        ? `<div class="courseSectionTitle">â˜… Favourite Courses</div>${fav.map(row).join("")}<div class="courseSectionTitle">All Other Courses</div>`
        : "") +
      other.map(row).join("") +
      (!cs.length ? '<p>No courses match these filters. Clear filters or add a course.</p>' : "") +
      (ina.length
        ? `<div class="divider">Inactive Courses (${ina.length})</div>` +
          ina.map(row).join("")
        : "");
  }

  $("#courseSearchMain").oninput = renderCoursesAdmin;
  $("#addCourseTop").onclick = () => addCourse(false);
  function addCourse(returnId) {
    let name = gcCourseName(prompt("Club / Course name"));
    if (!name) return null;
    let id = "c" + uid(),
      middleCard = {
        tee: "middle",
        distanceUnit: "metres",
        distanceInputUnit: "metres",
        par: [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4],
        index: [9, 3, 15, 1, 7, 17, 11, 5, 13, 8, 16, 10, 2, 12, 6, 18, 4, 14],
        metres: Array(18).fill(""),
      };
    let c = {
      id,
      name,
      country: courseLocationFilter.country || "Australia",
      state: courseLocationFilter.state || "",
      region: courseLocationFilter.region || "",
      locationRequired: true,
      available: true,
      address: "",
      phone: "",
      website: "",
      email: "",
      mapLink: "",
      notes: "",
      teeScorecards: { middle: middleCard },
      activeScorecardTee: "middle",
      teeDetails: {
        back: {
          name: "Back",
          colour: "Blue",
          slope: "",
          scratch: "",
          par: "",
          length: "",
        },
        middle: {
          name: "Middle",
          colour: "White",
          slope: "",
          scratch: "",
          par: "",
          length: "",
        },
        front: {
          name: "Front",
          colour: "Yellow",
          slope: "",
          scratch: "",
          par: "",
          length: "",
        },
      },
    };
    store.courses.push(c);
    save();
    courseDetail(id);
    return id;
  }

  document.addEventListener("click", (e) => {
    let t = e.target;
    if (t.id === "returnToWizardCourses" || t.id === "returnToWizardPlayers") {
      if (wizardReturnStep) {
        nav("homePage");
        $("#wizardShade").classList.add("open");
        W.step = wizardReturnStep;
        renderWizard();
        wizardReturnStep = null;
      } else reopenEventPlan();
      return;
    }
    if (t.dataset.pinfo) playerInfo(t.dataset.pinfo);
    if (t.dataset.pinactive) {
      let p = player(t.dataset.pinactive);
      if (confirm(`Make ${p.name} inactive?`)) {
        p.rosterActive = false;
        save();
      }
    }
    if (t.dataset.preactivate) {
      player(t.dataset.preactivate).rosterActive = true;
      save();
    }
    if (t.dataset.cinfo) courseDetail(t.dataset.cinfo);
    if (t.dataset.cinactive) {
      let c = course(t.dataset.cinactive,true);
      if (confirm(`Make ${c.name} inactive?`)) {
        c.available = false;
        save();
        queueMasterCourse(c);
      }
    }
    if (t.dataset.creactivate) {
      const c=course(t.dataset.creactivate,true);
      c.available = true;
      save();
      queueMasterCourse(c);
    }
  });

  let wizardReturnStep = null;
  let W = {
    step: 1,
    event: {},
    invites: new Map(),
    competitions: new Set(),
    benefits: {},
    benefitOpen: new Set(),
  };
  function refreshOpenWizardFromCloud() {
    // A background organiser refresh belongs to the published event in
    // `store.event`.  It must never replace a brand-new plan currently being
    // typed in the wizard (which lives in `W.event`).  Doing so redraws the
    // form, drops input focus and restores the old published event name.
    if (
      W?.newEvent ||
      !store.event ||
      !$("#wizardShade")?.classList.contains("open")
    )
      return;
    const step = Math.min(6, Math.max(1, +(W?.step || store.event.draftStep || 6)));
    W = {
      step,
      newEvent: false,
      event: JSON.parse(JSON.stringify(store.event)),
      invites: new Map(),
      competitions: new Set(store.event.competitions || []),
      benefits: JSON.parse(JSON.stringify(store.event.benefits || {})),
      benefitOpen: new Set(),
    };
    Object.entries(store.event.invitationStatus || {}).forEach(([id, status]) =>
      sharedPositionId(id, W.event) === String(id) && W.invites.set(String(id), status),
    );
    if (!W.invites.size)
      (store.event.confirmed || []).forEach(id =>
        sharedPositionId(id, W.event) === String(id) && W.invites.set(String(id), "accepted"),
      );
    renderWizard();
  }
  const stepNames = [
    "Event details",
    "Select players",
    "Competition setup",
    "Special rules",
    "NTP setup",
    "Review and Move to Scoring",
  ];
  function openWizard() {
    if (isGuestOrganiser()) return alert("Guest Organiser access cannot create another event.");
    W = {
      step: 1,
      newEvent: true,
      event: {
        name: "",
        courseCategoryVersion: 1,
        date: new Date().toISOString().slice(0, 10),
        days: 1,
        startMethod: "single",
        startMethods: { day1: "single", day2: "single" },
        startHoles: { day1: [1], day2: [1] },
        startTimes: { day1: ["07:30", "07:30"], day2: ["07:30", "07:30"] },
        teeIntervals: { day1: [8, 8], day2: [8, 8] },
        enabledTees: ["back", "middle"],
        fieldSize: 8,
        course1: activeCourses()[0]?.id || "",
        course2: activeCourses()[0]?.id || "",
        twoTeeStarts: { day1: [1, 10], day2: [1, 10] },
        puttingFormat: "team",
        singleStablefordFormat: "aggregate",
        scratchMaxHcp: 10,
        scratchScoringMode: "stroke",
        ambroseScoringMode: "scorerOnly",
        ambroseMinimumDrives: 3,
        ntpDay1Count: 1,
        ntpJackpot: false,
        ntpJackpotMode: "final",
        preferredLies: false,
        preferredLiesArea: "general",
        preferredLiesByDay: { day1: false, day2: false },
        preferredLiesAreaByDay: { day1: "general", day2: "general" },
        specialRules: "",
        dayAvailability: {},
        scorecardsChecked: false,
      },
      invites: new Map(),
      competitions: new Set(),
      benefits: {},
      benefitOpen: new Set(),
    };
    loadTemplate();
    $("#wizardShade").classList.add("open");
    renderWizard();
  }
  function reopenEventPlan() {
    if (!store.event) return openWizard();
    const e = JSON.parse(JSON.stringify(store.event));
    if(!e.locked&&!eventDays(e).some(day=>dayHasScoreEntries(day)))e.courseCategoryVersion=1;
    e.singleStablefordFormat =
      e.singleStablefordFormat || (e.days > 1 ? "aggregate" : "daily");
    W = {
      step: Math.min(6, Math.max(1, +(e.draftStep || 6))),
      newEvent: false,
      event: e,
      invites: new Map(),
      competitions: new Set(e.competitions || []),
      benefits: JSON.parse(JSON.stringify(e.benefits || {})),
      benefitOpen: new Set(),
    };
    if (e.invitationStatus)
      Object.entries(e.invitationStatus).forEach(([id, status]) =>
        sharedPositionId(id,W.event)===String(id) && W.invites.set(String(id), status),
      );
    else
      (e.confirmed || []).forEach((id) =>
        sharedPositionId(id,W.event)===String(id) && W.invites.set(String(id), "accepted"),
      );
    W.event.dayAvailability = W.event.dayAvailability || {};
    $("#wizardShade").classList.add("open");
    nav("homePage");
    renderWizard();
  }
  $("#newEvent").onclick = openWizard;
  $("#cancelWizard").onclick = () => $("#wizardShade").classList.remove("open");
  $("#backWizard").onclick = () => {
    if (W.step > 1) {
      W.step--;
      renderWizard();
    }
  };
  $("#nextWizard").onclick = () => {
    if (!validateStep()) return;
    if (W.step < 6) {
      W.step++;
      renderWizard();
    } else finishEvent();
  };
  $("#wizardOrganiserInstructions").onclick = openOrganiserInstructions;
  $("#saveEventDraft").onclick = () => {
    if (W.step === 1) syncEventFields();
    if (!W.event.name) return alert("Please enter an event name before saving the draft.");
    if (!saveWizardDraft()) return;
    $("#wizardShade").classList.remove("open");
    nav("home");
    alert("Draft saved. You can reopen it from Event Options, continue later, or delegate it from Guest Organiser.");
  };

  function saveWizardDraft() {
    // A closed lease owner releases its lock. Refresh stored records before
    // resuming this editor so the other window's saved plans remain intact.
    if (!localStorage.getItem(AWAY_GOLF_WRITER_LEASE_KEY)) {
      const latest = JSON.parse(localStorage.getItem("awayGolf13") || "null");
      if (latest) store = latest;
      localStorage.setItem(AWAY_GOLF_WRITER_LEASE_KEY, appTabId);
      appTabSuperseded = false;
    }
    // Keep the editor open and its contents intact if another window owns saving.
    if (localStorage.getItem(AWAY_GOLF_WRITER_LEASE_KEY) !== appTabId) {
      markSupersededTab();
      alert("Draft NOT saved: another Away Golf window is open. Keep this editor open, close the other window, then press Save Draft again.");
      return false;
    }
    const previousStore = JSON.parse(JSON.stringify(store));
    if (W.newEvent) captureCurrentEvent();
    const oldGroups = W.newEvent ? {} : (store.event?.groupSetup || {});
    if (W.newEvent) {
      closeCloudConnection();
      delete store.cloud;
      store.cloudPlayers = [];
      forgetOrganiserEvent();
    }
    const invitationStatus = Object.fromEntries(
      [...W.invites].map(([id, status]) => [String(id), status]),
    );
    Object.entries(W.event.sharedPositions || {}).forEach(([slot,days])=>Object.values(days).forEach(id=>invitationStatus[String(id)]=invitationStatus[slot]));
    const confirmed = [...W.invites]
      .filter(([, status]) => status === "accepted")
      .map(([id]) => String(id));
    store.event = {
      ...W.event,
      workspaceId: W.event.workspaceId || uid(),
      confirmed,
      invitationStatus,
      dayAvailability: JSON.parse(JSON.stringify(W.event.dayAvailability || {})),
      dayFields: Object.fromEntries(eventDays(W.event).map(day => ["day" + day, wizardPlanningPlayers(day)])),
      competitions: [...W.competitions],
      benefits: JSON.parse(JSON.stringify(W.benefits || {})),
      status: "planned",
      locked: false,
      groupSetup: oldGroups,
      draftStep: W.step,
      setupStage: "draft",
    };
    if (W.newEvent) resetDuplicatedEventRuntime(store.event);
    try {
      if (!save()) throw new Error("Another Away Golf window took over saving.");
      W.event.workspaceId = store.event.workspaceId;
      W.newEvent = false;
      return true;
    } catch (error) {
      store = previousStore;
      alert("Draft NOT saved. Keep this editor open and try again. " + error.message);
      return false;
    }
  }
  function loadTemplate() {
    let t = store.template;
    if (!t) return;
    W.competitions = new Set(t.competitions || []);
    W.benefits = JSON.parse(JSON.stringify(t.benefits || {}));
    W.event.puttingFormat = t.puttingFormat || "team";
    W.event.singleStablefordFormat = t.singleStablefordFormat || "aggregate";
    W.event.scratchMaxHcp = Number.isFinite(+t.scratchMaxHcp)
      ? +t.scratchMaxHcp
      : 10;
    W.event.scratchScoringMode =
      t.scratchScoringMode === "maxDoubleBogey"
        ? "maxDoubleBogey"
        : "stroke";
    W.event.ambroseScoringMode =
      t.ambroseScoringMode === "scorerMarker" ? "scorerMarker" : "scorerOnly";
    W.event.ambroseMinimumDrives = [2, 3, 4].includes(+t.ambroseMinimumDrives)
      ? +t.ambroseMinimumDrives
      : 3;
    W.event.par3Format =
      t.par3Format === "day2pair"
        ? "aggregate"
        : t.par3Format === "day1" || t.par3Format === "day2"
          ? "daily"
          : t.par3Format || "daily";
    W.event.par3Mode = t.par3Mode || (W.event.par3Format === "aggregate" ? "overallPairs" : "dailyPairs");
    W.event.scratchFormat = t.scratchFormat || "daily";
    W.event.ntpDay1Count = t.ntpDay1Count || 1;
    W.event.ntpDay2Count = t.ntpDay2Count;
    W.event.ntpCounts = JSON.parse(JSON.stringify(t.ntpCounts || {}));
    W.event.ntpJackpot = Boolean(t.ntpJackpot);
    W.event.ntpJackpotMode = t.ntpJackpotMode === "rolling" ? "rolling" : "final";
  }
  function wizardDayPlayers(day) {
    const accepted = [...W.invites.entries()]
      .filter(([id, s]) => s === "accepted")
      .map(([id]) => String(id));
    return accepted.filter((id) => {
      const a = W.event.dayAvailability?.[id];
      if (W.event.days === 1) return true;
      return a ? a[day] !== false : true;
    }).map(id=>sharedActualId(id,day,W.event));
  }
  function wizardPlanningPlayers(day) {
    const selected = [...W.invites.entries()]
      .filter(([id, s]) => s === "accepted" || s === "awaiting")
      .map(([id]) => String(id));
    return selected.filter((id) => {
      const a = W.event.dayAvailability?.[id];
      if (W.event.days === 1) return true;
      return a ? a[day] !== false : true;
    }).map(id=>sharedActualId(id,day,W.event));
  }
  function startMethodFor(e, day) {
    const m = e?.startMethods?.["day" + day] || e?.startMethod || "single";
    return ["single", "two", "shotgun"].includes(m) ? m : "single";
  }
  function startHolesFor(e, day) {
    const key = "day" + day,
      m = startMethodFor(e, day);
    if (m === "two") {
      const a = e?.startHoles?.[key] || e?.twoTeeStarts?.[key] || [1, 10];
      return [+(a[0] || 1), +(a[1] || 10)];
    }
    if (m === "single") {
      const a = e?.startHoles?.[key] || [1];
      return [+(a[0] || 1)];
    }
    return [];
  }
  function groupStartingHole(event, day, groupIndex) {
    const key = "day" + day,
      fallback = +(startHolesFor(event, day)[0] || 1);
    // A single-tee event has one authoritative starting hole for every group.
    // This must win over any older group-level value retained after revisiting
    // Event Setup and changing the starting hole.
    if (startMethodFor(event, day) === "single") return fallback;
    return +(event?.groupSetup?.[key]?.starts?.[groupIndex] || fallback);
  }
  function synchroniseSingleTeeGroupStarts(event) {
    if (!event?.groupSetup) return event;
    for (let day = 1; day <= +(event.days || 1); day++) {
      if (startMethodFor(event, day) !== "single") continue;
      const setup = event.groupSetup["day" + day];
      if (!setup?.groups?.length) continue;
      const start = +(startHolesFor(event, day)[0] || 1);
      setup.starts = setup.groups.map(() => start);
    }
    return event;
  }
  function startTimesFor(e, day) {
    const saved = e?.startTimes?.["day" + day];
    return Array.isArray(saved) && saved.length ? saved : ["07:30", "07:30"];
  }
  function teeIntervalsFor(e, day) {
    const saved = e?.teeIntervals?.["day" + day];
    return Array.isArray(saved) && saved.length ? saved.map(Number) : [8, 8];
  }
  function intervalOptions(selected) {
    return Array.from({ length: 10 }, (_, i) => i + 6)
      .map((n) => `<option value="${n}" ${+selected === n ? "selected" : ""}>${n} minutes</option>`)
      .join("");
  }
  function addMinutesToTime(value, minutes) {
    const [hour, minute] = String(value || "07:30").split(":").map(Number),
      total = (hour * 60 + minute + minutes + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  function groupTeeTime(day, groupIndex, event = store.event, setup = event?.groupSetup?.["day" + day] || {}) {
    const method = startMethodFor(event, day), times = startTimesFor(event, day), intervals = teeIntervalsFor(event, day);
    if (method === "shotgun") return times[0];
    if (method === "single") return addMinutesToTime(times[0], groupIndex * intervals[0]);
    const groups = setup.groups || [], holes = startHolesFor(event, day), thisHole = +(setup.starts?.[groupIndex] || holes[groupIndex % 2]),
      lane = thisHole === +holes[1] ? 1 : 0,
      earlier = groups.slice(0, groupIndex).filter((g, i) => +(setup.starts?.[i] || holes[i % 2]) === +holes[lane]).length;
    return addMinutesToTime(times[lane], earlier * intervals[lane]);
  }
  function firstEventTeeTime(day, event = store.event) {
    const times = startTimesFor(event, day).filter((value) => /^\d{2}:\d{2}$/.test(String(value)));
    if (startMethodFor(event, day) === "two" && times.length > 1)
      return [...times].sort()[0];
    return times[0] || "07:30";
  }
  function scoringOpeningTime(day, event = store.event) {
    if (!event?.date) return null;
    const date = new Date(`${eventDate(day, event)}T00:00:00`);
    const [hour, minute] = firstEventTeeTime(day, event).split(":").map(Number);
    date.setHours(hour, minute - 15, 0, 0);
    if (!event.timeZone) return date;
    const [year,month,dayOfMonth]=eventDate(day,event).split("-").map(Number),
      target=Date.UTC(year,month-1,dayOfMonth,hour,minute-15),
      formatter=new Intl.DateTimeFormat("en-GB",{timeZone:event.timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
    let instant=target;
    for(let iteration=0;iteration<3;iteration++) {
      const parts=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value])),
        wall=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);
      instant += target-wall;
    }
    return new Date(instant);
  }
  function scoringIsOpen(day, event = store.event, now = new Date()) {
    if (!event) return false;
    if (event.testMode || event.ridgeTestMode) return true;
    if (event.scoringOpenedEarly?.["day" + day]) return true;
    const opens = scoringOpeningTime(day, event);
    return Boolean(opens && now >= opens);
  }
  function scoringOpeningLabel(day, event = store.event) {
    const opens = scoringOpeningTime(day, event);
    return opens
      ? opens.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", ...(event.timeZone?{timeZone:event.timeZone}:{}) })
      : "15 minutes before the first tee time";
  }
  function scheduleScoringOpening(day, event = store.event) {
    clearTimeout(scoringOpenTimer);
    scoringOpenTimer = null;
    if (!event || scoringIsOpen(day, event)) return;
    const opens = scoringOpeningTime(day, event);
    if (!opens) return;
    const remaining = Math.max(0, opens.getTime() - Date.now());
    const delay = Math.min(remaining + 150, 5000);
    scoringOpenTimer = setTimeout(() => {
      scoringOpenTimer = null;
      if (scoringIsOpen(day, event)) {
        renderLiveEventControl();
        renderPlayerExperience();
      } else scheduleScoringOpening(day, event);
    }, delay);
  }
  function refreshScoringOpeningOnWake() {
    if (document.visibilityState !== "visible" || !store.event) return;
    const day = Math.min(
      store.event.days || 1,
      +(store.event.playerPreviewDay || store.event.liveControlDay || 1),
    );
    if (scoringIsOpen(day)) {
      clearTimeout(scoringOpenTimer);
      scoringOpenTimer = null;
      renderLiveEventControl();
      renderPlayerExperience();
    } else scheduleScoringOpening(day);
  }
  document.addEventListener("visibilitychange", refreshScoringOpeningOnWake);
  window.addEventListener("focus", refreshScoringOpeningOnWake);
  window.addEventListener("pageshow", refreshScoringOpeningOnWake);
  function validateStep() {
    if (W.step === 1) {
      syncEventFields();
      if (!W.event.name) return alert("Please enter an event name.");
      if (!W.event.course1)
        return alert(
          W.event.days === 1
            ? "Please select a course."
            : "Please select a Day 1 course.",
        );
      for (const day of eventDays(W.event)) {
        if (!W.event["course" + day]) return alert(`Please select a Day ${day} course.`);
        const date = eventDate(day, W.event);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return alert(`Please enter the Day ${day} date.`);
        if (day > 1 && date <= eventDate(day - 1, W.event)) return alert("Playing dates must be in day order. Leave a gap for a rest day if needed.");
      }
      for (let day = 1; day <= W.event.days; day++) {
        const m = startMethodFor(W.event, day),
          h = startHolesFor(W.event, day);
        if (m === "single" && !h[0])
          return alert(
            W.event.days === 1
              ? "Please select the starting tee."
              : `Please select the Day ${day} starting tee.`,
          );
        if (m === "two" && +h[0] === +h[1])
          return alert(
            W.event.days === 1
              ? "Please select two different starting tees."
              : `Day ${day} needs two different starting tees.`,
          );
      }
    }
    if (W.step === 2) {
      const selected = [...W.invites].filter(([, status]) => ["accepted", "awaiting"].includes(status)).length;
      if (selected < (+W.event.fieldSize || 0)) return alert(`Select your trip field of ${W.event.fieldSize} players first. Then untick any days they are resting.`);
      for (const day of eventDays(W.event)) {
        const ids = wizardPlanningPlayers(day);
        const realCount = ids.filter(id => id !== NO_PARTNER_ID).length;
        if (realCount < 4 || realCount === 5) return alert(`Day ${day} needs four real players, or at least six, to form the supported teams of three or four. Review that day's availability.`);
        if (ids.filter(id => id === NO_PARTNER_ID).length > 1) return alert("Only one No Partner position can be used on a day.");
      }
    }
    if (W.step === 3) {
      if (!W.competitions.size) return alert("Select at least one competition.");
      for (const day of eventDays(W.event)) {
        const conflicts = incompatibleDayCompetitions(day, {...W.event, competitions:[...W.competitions]}, [...W.competitions]);
        if (conflicts.length) return alert(`Day ${day} uses ${SCORING_METHODS[dayScoringMethod(day,W.event)]}. It cannot calculate ${conflicts.map(id=>competitionNames[id]||id).join(", ")}. Change the scoring method or those competition days.`);
      }
      if (W.competitions.has("capTeams")) {
        const ids = [...new Set(eventDays(W.event).flatMap(wizardPlanningPlayers))].filter(id => id !== NO_PARTNER_ID);
        if (!ensureCapTeams(W.event,ids)) return alert("Enter a GA handicap for each golfer before balancing the Black Cap â€“ White Cap teams.");
      }
      if (W.competitions.has("ambrose")) {
        const ambroseDays = competitionDays("ambrose", W.event);
        const conflicts = [...W.competitions].filter(id=>!["ambrose","ntp"].includes(id) && competitionDays(id,W.event).some(day=>ambroseDays.includes(day)));
        if (conflicts.length) return alert("Ambrose uses team stroke scoring. Select separate playing days for Ambrose and the individual/Stableford competitions.");
      }
      for (const day of eventDays(W.event)) if (![...W.competitions].some(id=>competitionDays(id,W.event).includes(day))) return alert(`Select a competition for Day ${day}.`);
    }
    return true;
  }
  function renderWizard() {
    W.lastRenderedStep = W.step;
    let spans = $$(".steps span");
    spans.forEach((s, i) => s.classList.toggle("on", i === W.step - 1));
    $("#stepText").textContent =
      `Step ${W.step} of 6 â€” ${stepNames[W.step - 1]}`;
    $("#backWizard").style.visibility = W.step === 1 ? "hidden" : "visible";
    $("#nextWizard").style.display = W.step === 6 ? "none" : "";
    $("#nextWizard").textContent = "Next";
    $("#saveEventDraft").style.display = "";
    ({
      1: renderStep1,
      2: renderStep2,
      3: renderStep3,
      4: renderStep4,
      5: renderStep5,
      6: renderStep6,
    })[W.step]();
  }
  function courseOptions(sel) {
    return activeCourses()
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`,
      )
      .join("");
  }
  function courseChoiceControl(day) {
    const selected = course(W.event["course" + day]);
    return `<div class="courseChoiceControl"><select id="weC${day}" class="courseNativeSelect" aria-hidden="true" tabindex="-1">${courseOptions(W.event["course" + day])}</select><button type="button" class="courseChoiceBtn" id="chooseCourse${day}"><span><small>SELECTED COURSE</small><b>${esc(selected?.name || "Choose a course")}</b>${selected?.region ? `<em>${esc(selected.region)}</em>` : ""}</span><strong>Choose Course â€º</strong></button></div>`;
  }
  function openCoursePicker(day) {
    syncEventFields();
    store.courseFavourites = store.courseFavourites || [];
    const chosenKey = "course" + day,
      source = day === 2 ? course(W.event.course1) : null;
    const draw = () => {
      const query = ($("#coursePickerSearch")?.value || "")
        .trim()
        .toLowerCase();
      const all = activeCourses().filter(
        (c) =>
          !query ||
          (c.name + " " + (c.region || "")).toLowerCase().includes(query),
      );
      const favIds = new Set(store.courseFavourites.map(String));
      const favourites = activeCourses().filter((c) =>
        favIds.has(String(c.id)),
      );
      const nearby = source?.region
        ? activeCourses().filter(
            (c) => c.id !== source.id && c.region === source.region,
          )
        : [];
      const quick = (c, label = "") =>
        `<button type="button" class="courseQuickBtn" data-pickcourse="${c.id}"><b>${esc(c.name)}</b>${label ? `<small>${esc(label)}</small>` : c.region ? `<small>${esc(c.region)}</small>` : ""}</button>`;
      $("#modalContent").innerHTML =
        `<div class="coursePickerHead"><div><h2>${W.event.days === 1 ? "Choose Course" : `Choose Day ${day} Course`}</h2><p>${day === 2 && source ? `Day 1 is ${esc(source.name)}${source.region ? ` in ${esc(source.region)}` : ""}.` : "Choose with the mouse from All Courses or your Favourites."}</p></div><button type="button" class="close" id="closeCoursePicker">Ã—</button></div><div class="coursePickerGrid"><section class="courseAll"><label>Search all courses<input id="coursePickerSearch" value="${esc(query)}" placeholder="Course or golf region"></label><div class="coursePickerList">${all.map((c) => `<div class="coursePickerRow"><button type="button" class="courseNamePick" data-pickcourse="${c.id}"><b>${esc(c.name)}</b>${c.region ? `<small>${esc(c.region)}</small>` : ""}</button><button type="button" class="courseFavToggle ${favIds.has(String(c.id)) ? "on" : ""}" data-favcourse="${c.id}" title="${favIds.has(String(c.id)) ? "Remove from Favourites" : "Add to Favourites"}">${favIds.has(String(c.id)) ? "âœ“" : "ï¼‹"}</button></div>`).join("") || '<p class="hint">No courses match that search.</p>'}</div></section><aside class="courseQuick"><div class="quickSection"><h3>Favourites</h3><p>Your regular courses</p>${favourites.map((c) => quick(c)).join("") || '<div class="quickEmpty">Use the + beside any course to build this list.</div>'}</div>${day === 2 && source?.region ? `<div class="quickSection nearby"><h3>Nearby Courses</h3><p>${esc(source.region)}</p>${nearby.map((c) => quick(c, "Same golf region")).join("") || '<div class="quickEmpty">No other course is assigned to this region yet.</div>'}</div>` : ""}</aside></div>`;
      $("#closeCoursePicker").onclick = () =>
        $("#modalShade").classList.remove("open");
      $("#coursePickerSearch").oninput = draw;
      if (query) {
        const search = $("#coursePickerSearch");
        search.focus();
        search.setSelectionRange(query.length, query.length);
      }
      $$("[data-pickcourse]").forEach(
        (b) =>
          (b.onclick = () => {
            W.event[chosenKey] = b.dataset.pickcourse;
            W.event.scorecardsChecked = false;
            if (day === 1 && W.event.days > 1 && !W.event.course2)
              W.event.course2 = b.dataset.pickcourse;
            $("#modalShade").classList.remove("open");
            renderStep1();
          }),
      );
      $$("[data-favcourse]").forEach(
        (b) =>
          (b.onclick = () => {
            const id = String(b.dataset.favcourse),
              i = store.courseFavourites.map(String).indexOf(id);
            if (i >= 0) store.courseFavourites.splice(i, 1);
            else store.courseFavourites.push(id);
            writeLocalStore();
            draw();
          }),
      );
    };
    $("#modalShade").classList.add("open");
    draw();
  }
  function holeOptions(selected) {
    return Array.from(
      { length: 18 },
      (_, i) =>
        `<option value="${i + 1}" ${+selected === i + 1 ? "selected" : ""}>Hole ${i + 1}</option>`,
    ).join("");
  }
  function startFormatOptions(selected) {
    return `<option value="single" ${selected === "single" ? "selected" : ""}>Single Tee</option><option value="two" ${selected === "two" ? "selected" : ""}>Two Tees</option><option value="shotgun" ${selected === "shotgun" ? "selected" : ""}>Shotgun</option>`;
  }
  function dayStartControls(day) {
    const m = startMethodFor(W.event, day),
      holes = startHolesFor(W.event, day), times = startTimesFor(W.event, day), intervals = teeIntervalsFor(W.event, day);
    if (m === "shotgun")
      return `<div class="shotgunSetup"><label>Shotgun Time</label><input id="weD${day}Time1" type="time" value="${times[0]}"><p>Starting holes for each group will be assigned on the Groups &amp; Teams page.</p></div>`;
    if (m === "two")
      return `<div class="twoTeeSetup"><div class="teeScheduleRow"><label>Hole #<select id="weD${day}T1">${holeOptions(holes[0])}</select></label><label>First Tee Time<input id="weD${day}Time1" type="time" value="${times[0]}"></label><label>Tee Time Interval<select id="weD${day}Interval1">${intervalOptions(intervals[0])}</select></label></div><div class="teeScheduleRow"><label>Hole #<select id="weD${day}T2">${holeOptions(holes[1])}</select></label><label>First Tee Time<input id="weD${day}Time2" type="time" value="${times[1]}"></label><label>Tee Time Interval<select id="weD${day}Interval2">${intervalOptions(intervals[1])}</select></label></div><p>Set each tee independently; their intervals may differ.</p></div>`;
    return `<div class="singleTeeSetup teeScheduleRow"><label>Hole #<select id="weD${day}T1">${holeOptions(holes[0])}</select></label><label>First Tee Time<input id="weD${day}Time1" type="time" value="${times[0]}"></label><label>Tee Time Interval<select id="weD${day}Interval1">${intervalOptions(intervals[0])}</select></label></div>`;
  }
  function renderStep1() {
    W.event.days = eventDays(W.event).length;
    W.event.dayDates ||= {};
    W.event.startMethods ||= {};
    W.event.startHoles ||= {};
    W.event.startTimes ||= {};
    W.event.teeIntervals ||= {};
    for (const day of eventDays(W.event)) {
      W.event["course" + day] ??= W.event.course1 || activeCourses()[0]?.id || "";
    }
    $("#wizardBody").innerHTML = `<h3>Event details</h3>
      <label>Event name<input id="weName" value="${esc(W.event.name)}" placeholder="Give Your Trip a Name to Remember"></label>
      <div class="grid3"><label>Start date<input id="weDate" type="date" value="${esc(W.event.date)}"></label>
      <label>Event length<select id="weDays">${Array.from({length:7}, (_, i) => `<option value="${i+1}" ${W.event.days===i+1?"selected":""}>${i+1} playing day${i?"s":""}</option>`).join("")}</select></label>
      <label>Size of Field<div class="fieldSizeStepper"><button type="button" id="weFieldMinus">âˆ’</button><input id="weField" type="number" min="3" max="60" value="${W.event.fieldSize}"><button type="button" id="weFieldPlus">+</button></div></label></div>
      <label>Course time zone<select id="weTimezone"><option value="" ${!W.event.timeZone?"selected":""}>This device's local time</option><option value="Australia/Sydney" ${W.event.timeZone==="Australia/Sydney"?"selected":""}>Sydney / NSW</option><option value="Asia/Ho_Chi_Minh" ${W.event.timeZone==="Asia/Ho_Chi_Minh"?"selected":""}>Vietnam</option></select></label>
      <p class="hint">Set each playing day independently. Dates default to consecutive days; change a date to allow a rest day. Tee times are local course times.</p>
      ${eventDays(W.event).map(day => `<div class="daySetupCard"><div class="daySetupHead"><b>${W.event.days===1?"Course & Start":`Day ${day}`}</b><span>Course and starting arrangement</span></div>
      ${day>1?`<label>Playing date<input type="date" id="weDayDate${day}" value="${eventDate(day,W.event)}"></label>`:""}
      <div class="courseSelectRow">${courseChoiceControl(day)}<button class="soft" id="weC${day}Details">Course Details</button></div>
      <div class="dayStartFormat"><label>Start Format</label><select id="weStart${day}">${startFormatOptions(startMethodFor(W.event,day))}</select></div>
      ${dayStartControls(day)}</div>`).join("")}
      <div class="rowBtns"><button class="soft" id="wizardAddCourse">+ Add Club / Course</button><button class="soft" id="wizardManageCourses">Manage Club / Course List</button></div>`;
    $("#weFieldMinus").onclick = () => { $("#weField").value=Math.max(3,+$("#weField").value-1); syncEventFields(); };
    $("#weFieldPlus").onclick = () => { $("#weField").value=Math.min(60,+$("#weField").value+1); syncEventFields(); };
    $$("#wizardBody input, #wizardBody select").forEach(input => input.onchange = () => {
      syncEventFields();
      if(input.id === "weDays" || input.id === "weDate" || input.id.startsWith("weStart")) renderStep1();
    });
    for(const day of eventDays(W.event)) {
      $("#weC"+day+"Details").onclick = () => { syncEventFields(); courseDetail(W.event["course"+day]); };
      $("#chooseCourse"+day).onclick = () => openCoursePicker(day);
    }
    $("#wizardAddCourse").onclick = () => { syncEventFields(); wizardReturnStep=1; $("#wizardShade").classList.remove("open"); nav("coursesPage"); addCourse(); };
    $("#wizardManageCourses").onclick = () => { syncEventFields(); wizardReturnStep=1; $("#wizardShade").classList.remove("open"); nav("coursesPage"); renderCoursesAdmin(); };
  }
  function syncEventFields() {
    if (!$("#weName")) return;
    const previousStart = W.event.date;
    const previousDays = eventDays(W.event);
    W.event.name = $("#weName").value.trim();
    W.event.date = $("#weDate").value;
    W.event.days = +$("#weDays").value;
    for (const [id, selected] of Object.entries(W.event.competitionDays || {})) {
      if (previousDays.every(day => selected.map(Number).includes(day)))
        W.event.competitionDays[id] = eventDays(W.event);
    }
    if (W.event.yellowBallDays && previousDays.every(day => W.event.yellowBallDays.map(Number).includes(day)))
      W.event.yellowBallDays = eventDays(W.event);
    W.event.fieldSize = +$("#weField").value || 8;
    W.event.timeZone = $("#weTimezone")?.value || "";
    W.event.course1 = $("#weC1").value;
    W.event.dayDates ||= {};
    for (const day of eventDays(W.event)) {
      W.event["course" + day] = $("#weC" + day)?.value || W.event["course" + day] || W.event.course1;
      const dateInput = $("#weDayDate" + day);
      if (dateInput && dateInput.value !== eventDate(day, { ...W.event, date: previousStart, dayDates: {} })) W.event.dayDates["day" + day] = dateInput.value;
      else if (dateInput) delete W.event.dayDates["day" + day];
      if ($("#weStart" + day)) W.event.startMethods["day" + day] = $("#weStart" + day).value;
    }
    W.event.startMethods = W.event.startMethods || {
      day1: "single",
      day2: "single",
    };
    W.event.startHoles = W.event.startHoles || { day1: [1], day2: [1] };
    W.event.startTimes = W.event.startTimes || { day1: ["07:30", "07:30"], day2: ["07:30", "07:30"] };
    W.event.teeIntervals = W.event.teeIntervals || { day1: [8, 8], day2: [8, 8] };
    if ($("#weStart1")) W.event.startMethods.day1 = $("#weStart1").value;
    if ($("#weStart2")) W.event.startMethods.day2 = $("#weStart2").value;
    for (const day of eventDays(W.event)) {
      const m = startMethodFor(W.event, day),
        a = $("#weD" + day + "T1"),
        b = $("#weD" + day + "T2");
      if (m === "two" && a && b)
        W.event.startHoles["day" + day] = [+a.value, +b.value];
      else if (m === "single" && a)
        W.event.startHoles["day" + day] = [+a.value];
      else if (m === "shotgun") W.event.startHoles["day" + day] = [];
      const time1 = $("#weD" + day + "Time1"), time2 = $("#weD" + day + "Time2"),
        interval1 = $("#weD" + day + "Interval1"), interval2 = $("#weD" + day + "Interval2");
      W.event.startTimes["day" + day] = [time1?.value || startTimesFor(W.event, day)[0], time2?.value || startTimesFor(W.event, day)[1] || time1?.value || "07:30"];
      W.event.teeIntervals["day" + day] = [+(interval1?.value || teeIntervalsFor(W.event, day)[0] || 8), +(interval2?.value || teeIntervalsFor(W.event, day)[1] || interval1?.value || 8)];
    }
    W.event.startMethod = W.event.startMethods.day1;
    W.event.twoTeeStarts = Object.fromEntries(eventDays(W.event).map(day=>["day"+day,startHolesFor(W.event,day)]));
  }
  function openPlayerListManager(onClose = renderStep2) {
    store.playerLists = Array.isArray(store.playerLists) ? store.playerLists : [];
    const showManager = () => {
      const lists = [...store.playerLists].sort((a, b) =>
        String(a.name).localeCompare(String(b.name)),
      );
      $("#modalContent").innerHTML = `<div class="playerListHead"><div><small>REUSABLE INVITATION GROUPS</small><h2>Named Player Lists</h2><p>Create lists from the Master Player List and reuse them in future events.</p></div><button class="primary" id="newNamedPlayerList">+ Create Player List</button></div><div class="namedPlayerListCards">${lists.map((list) => `<article><div><b>${esc(list.name)}</b><small>${(list.playerIds || []).filter((id) => player(id)).length} players</small></div><div class="rowBtns"><button class="soft" data-editplayerlist="${esc(list.id)}">Edit</button><button class="danger" data-deleteplayerlist="${esc(list.id)}">Delete</button></div></article>`).join("") || '<p class="hint">No named lists have been created yet.</p>'}</div><div class="ownerAccountActions"><button class="soft" id="closePlayerLists">Done</button></div>`;
      $("#modalShade").classList.add("open");
      $("#newNamedPlayerList").onclick = () => showEditor();
      $("#closePlayerLists").onclick = () => {
        $("#modalShade").classList.remove("open");
        onClose();
      };
      $$("[data-editplayerlist]").forEach(
        (button) => button.onclick = () => showEditor(button.dataset.editplayerlist),
      );
      $$("[data-deleteplayerlist]").forEach(
        (button) => button.onclick = () => {
          const list = store.playerLists.find((x) => String(x.id) === String(button.dataset.deleteplayerlist));
          if (!list || !confirm(`Delete the named list "${list.name}"?\n\nThe players remain in the Master Player List.`)) return;
          store.playerLists = store.playerLists.filter((x) => String(x.id) !== String(list.id));
          writeLocalStore();
          showManager();
        },
      );
    };
    const showEditor = (listId = "") => {
      const existing = store.playerLists.find((x) => String(x.id) === String(listId));
      const selected = new Set((existing?.playerIds || []).map(String));
      const players = activePlayers();
      $("#modalContent").innerHTML = `<div class="playerListHead"><div><small>MASTER PLAYER LIST</small><h2>${existing ? "Edit Player List" : "Create Player List"}</h2><p>Name the list and tick every player to include.</p></div></div><label>Player List name<input id="namedPlayerListName" maxlength="60" value="${esc(existing?.name || "")}" placeholder="e.g. Volunteers' Ambrose"></label><div class="namedPlayerChecklist">${players.map((person) => `<label><input type="checkbox" data-listplayer="${esc(person.id)}" ${selected.has(String(person.id)) ? "checked" : ""}><span><b>${esc(person.name)}</b><small>${esc(person?.noOfficialHandicap ? "No Official Handicap" : person.golfLink || "")}</small></span></label>`).join("") || "<p>No active players are available.</p>"}</div><div class="ownerAccountActions"><button class="primary" id="saveNamedPlayerList">Save Player List</button><button class="soft" id="backToPlayerLists">Back</button></div>`;
      $("#namedPlayerListName").focus();
      $("#backToPlayerLists").onclick = showManager;
      $("#saveNamedPlayerList").onclick = () => {
        const name = $("#namedPlayerListName").value.trim();
        const playerIds = $$("[data-listplayer]:checked").map((box) => String(box.dataset.listplayer));
        if (!name) return alert("Please enter a name for this Player List.");
        if (!playerIds.length) return alert("Select at least one player for this list.");
        const duplicate = store.playerLists.find(
          (list) => String(list.id) !== String(existing?.id || "") &&
            String(list.name).trim().toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) return alert("A Player List with that name already exists.");
        if (existing) {
          existing.name = name;
          existing.playerIds = playerIds;
          existing.updatedAt = new Date().toISOString();
        } else {
          store.playerLists.push({
            id: uid(),
            name,
            playerIds,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        writeLocalStore();
        showManager();
      };
    };
    showManager();
  }
  function openSharedPositionPlanner(refresh) {
    if(W.event.locked || W.event.previewPublishedAt || W.event.finalUpdateCloudSentAt)return alert("Arrange shared positions before publishing the event.");
    const selected=[...W.invites].filter(([,status])=>["accepted","awaiting"].includes(status)).map(([id])=>String(id)).filter(id=>id!==NO_PARTNER_ID);
    if(!selected.length)return alert("Select the primary golfer for the shared position first.");
    const profiles=store.players.filter(p=>!p.system), name=id=>profiles.find(p=>String(p.id)===String(id))?.name || "Player";
    $("#modalContent").innerHTML=`<h2>Shared Player Position</h2><p>Choose one position and assign its golfer for each day. Each golfer has a separate scorecard and handicap. Their aggregate scores and aggregate prize are shared.</p><label>Selected position<select id="sharedPrimary">${selected.map(id=>`<option value="${esc(id)}">${esc(name(id))}</option>`).join("")}</select></label><label>Primary golferâ€™s GA<input id="sharedPrimaryGa" type="number" min="-10" max="54" step="0.1"></label><label>Other golfer<select id="sharedOther"><option value="">Add a new golfer for this shared position</option>${profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.rosterActive===false ? " (saved reserve player)" : ""}</option>`).join("")}</select></label><div id="sharedNewDetails"><label>First name<input id="sharedFirst" maxlength="80"></label><label>Last name<input id="sharedLast" maxlength="80"></label><label>Golf ID / GolfLink Number<select id="sharedIdChoice"><option value="insert">Insert</option><option value="none">No Official Handicap</option></select><input id="sharedRegistration" inputmode="numeric" maxlength="80"></label></div><label>Other golferâ€™s GA<input id="sharedOtherGa" type="number" min="-10" max="54" step="0.1"></label><label>Other golferâ€™s handicap category<select id="sharedCategory"><option value="men">Men</option><option value="women">Women</option></select></label><p>Use a negative GA for a plus handicap. Review GA & Tee Hcps after assigning the days.</p><div id="sharedDays"></div><button class="primary" id="saveSharedPosition">Save Shared Position</button> <button class="soft" id="removeSharedPosition">Remove Shared Arrangement</button> <button class="soft" id="closeSharedPosition">Close</button>`;
    $("#modalShade").classList.add("open");
    function drawDays(){
      const slot=$("#sharedPrimary").value, other=$("#sharedOther").value,
        second=other ? name(other) : [$("#sharedFirst").value,$("#sharedLast").value].filter(Boolean).join(" ") || "Other golfer",
        prior=Object.fromEntries($$("[data-shareday]").map(el=>[el.dataset.shareday,el.value]));
      $("#sharedDays").innerHTML=eventDays(W.event).map(day=>`<label>Day ${day}<select data-shareday="${day}"><option value="primary">${esc(name(slot))}</option><option value="other">${esc(second)}</option></select></label>`).join("");
      $$("[data-shareday]").forEach(el=>el.value=prior[el.dataset.shareday] || (+el.dataset.shareday===1 ? "primary" : "other"));
    }
    function loadOther(){const p=profiles.find(p=>String(p.id)===$("#sharedOther").value);$("#sharedNewDetails").hidden=Boolean(p);$("#sharedOtherGa").value=p ? W.event.gaHandicaps?.[String(p.id)] ?? (p.gaUpdatedAt ? p.ga : "") : "";$("#sharedCategory").value=p?.gaCategory || "men";drawDays();}
    function loadPrimary(){const slot=$("#sharedPrimary").value, p=profiles.find(p=>String(p.id)===slot),existing=W.event.sharedPositions?.[slot];$("#sharedPrimaryGa").value=W.event.gaHandicaps?.[slot] ?? (p?.gaUpdatedAt ? p.ga : "");$("#sharedOther").value=existing ? Object.values(existing).find(id=>String(id)!==slot) || "" : "";loadOther();if(existing)$$("[data-shareday]").forEach(el=>el.value=String(existing['day'+el.dataset.shareday])===slot ? "primary" : "other");$("#removeSharedPosition").disabled=!existing;}
    $("#sharedPrimary").onchange=loadPrimary;$("#sharedOther").onchange=loadOther;$("#sharedFirst").oninput=drawDays;$("#sharedLast").oninput=drawDays;$("#sharedIdChoice").onchange=()=>$("#sharedRegistration").disabled=$("#sharedIdChoice").value==="none";
    $("#closeSharedPosition").onclick=()=>$("#modalShade").classList.remove("open");
    $("#removeSharedPosition").onclick=()=>{const slot=$("#sharedPrimary").value;if(!confirm("Remove this shared arrangement? The primary golfer will fill this position on every selected day. The other golfer stays in the player database."))return;delete W.event.sharedPositions[slot];invalidateSharedPlanning();$("#modalShade").classList.remove("open");refresh();};
    $("#saveSharedPosition").onclick=async()=>{
      const button=$("#saveSharedPosition");button.disabled=true;
      try{
        const slot=$("#sharedPrimary").value, existing=profiles.find(p=>String(p.id)===$("#sharedOther").value),
          primaryGa=Number($("#sharedPrimaryGa").value), otherGa=Number($("#sharedOtherGa").value),
          newPlayer=existing || {id:crypto.randomUUID(),firstName:$("#sharedFirst").value.trim(),lastName:$("#sharedLast").value.trim(),golfLink:$("#sharedRegistration").value.trim(),noOfficialHandicap:$("#sharedIdChoice").value==="none",rosterActive:!window.GES_PLANNER_CONTEXT};
        if($("#sharedPrimaryGa").value==="" || $("#sharedOtherGa").value==="" || ![primaryGa,otherGa].every(ga=>Number.isFinite(ga)&&ga>=-10&&ga<=54))throw Error("Enter both golfersâ€™ GA Handicaps from plus 10 to 54.");
        if(!existing){if(!newPlayer.firstName || !newPlayer.lastName)throw Error("Enter the other golferâ€™s first and last names.");if(!newPlayer.noOfficialHandicap && !/^[0-9]+$/.test(newPlayer.golfLink))throw Error("Enter a Golf ID / GolfLink Number or choose No Official Handicap.");newPlayer.name=newPlayer.firstName+" "+newPlayer.lastName;newPlayer.ga=otherGa;newPlayer.gaCategory=$("#sharedCategory").value;newPlayer.gaUpdatedAt=new Date().toISOString();}
        const map=Object.fromEntries($$("[data-shareday]").map(el=>['day'+el.dataset.shareday,el.value==="primary" ? slot : String(newPlayer.id)]));
        const next=GolfSharedPositions.assign(W.event,slot,map,selected.filter(id=>id!==String(newPlayer.id)));
        if(!confirm(`Share this position between ${name(slot)} and ${newPlayer.name}?\n${eventDays(W.event).map(day=>`Day ${day}: ${map['day'+day]===slot ? name(slot) : newPlayer.name}`).join("\n")}\n\nTheir scores and aggregate prizes are shared. Groups and handicaps will need review.`))return;
        if(!existing && AwayCloud.saveSharedPlayer)await AwayCloud.saveSharedPlayer(newPlayer);
        if(!existing)store.players.push(newPlayer);
        W.event=next;W.event.gaHandicaps ||= {};W.event.gaCategories ||= {};W.event.gaHandicaps[slot]=primaryGa;W.event.gaHandicaps[String(newPlayer.id)]=otherGa;W.event.gaCategories[String(newPlayer.id)]=$("#sharedCategory").value;
        W.invites.delete(String(newPlayer.id));W.invites.set(slot,"accepted");W.event.dayAvailability ||= {};W.event.dayAvailability[slot]=Object.fromEntries(eventDays(W.event).map(day=>[day,true]));
        invalidateSharedPlanning();$("#modalShade").classList.remove("open");refresh();
      }catch(error){alert(error.message || String(error));}finally{button.disabled=false;}
    };
    loadPrimary();
  }
  function invalidateSharedPlanning(){
    delete W.event.groupSetup;delete W.event.capTeams;delete W.event.teeHandicaps;delete W.event.teeHandicapSources;delete W.event.dailyHandicaps;delete W.event.teeSelectionFinalised;W.event.scorecardsChecked=false;
    if(!W.newEvent && store.event?.workspaceId===W.event.workspaceId){store.event.groupSetup={};delete store.event.capTeams;}
    saveWizardDraft();
  }
  function renderStep2() {
    let q = "";
    let keepSearchFocus = $("#wpSearch") === document.activeElement;
    let playerScroll = {
      body: $("#wizardBody")?.scrollTop || 0,
      av: $("#av")?.scrollTop || 0,
      inv: $("#inv")?.scrollTop || 0,
      conf: $("#conf")?.scrollTop || 0,
    };
    const rememberScroll = () => {
      if ($("#av"))
        playerScroll = {
          body: $("#wizardBody")?.scrollTop || 0,
          av: $("#av")?.scrollTop || 0,
          inv: $("#inv")?.scrollTop || 0,
          conf: $("#conf")?.scrollTop || 0,
        };
    };
    const restoreScroll = () => {
      if ($("#wizardBody")) $("#wizardBody").scrollTop = playerScroll.body;
      if ($("#av")) $("#av").scrollTop = playerScroll.av;
      if ($("#inv")) $("#inv").scrollTop = playerScroll.inv;
      if ($("#conf")) $("#conf").scrollTop = playerScroll.conf;
    };
    function ensureAvailability(id) {
      id = String(id);
      W.event.dayAvailability = W.event.dayAvailability || {};
      if (!W.event.dayAvailability[id])
        W.event.dayAvailability[id] = { 1: true, 2: true };
    }
    function draw() {
      rememberScroll();
      let normal = activePlayers().filter((p) =>
        (p.name + " " + p.golfLink + " " + (p.nickname || "") + " " + (p.noOfficialHandicap ? "No Official Handicap" : "")).toLowerCase().includes(q),
      );
      let systemMatches =
        "no partner".includes(q) || q === "" ? [NO_PARTNER] : [];
      let ps = [...normal, ...systemMatches];
      let available = ps.filter((p) => !W.invites.has(String(p.id)) && sharedPositionId(p.id,W.event)===String(p.id));
      let invitedIds = [...W.invites.keys()];
      let invited = invitedIds.map((id) => player(id)).filter(Boolean);
      let confirmed = invited.filter(
        (p) => W.invites.get(String(p.id)) === "accepted",
      );
      invited
        .filter((p) => W.invites.get(String(p.id)) !== "declined")
        .forEach((p) => ensureAvailability(p.id));
      let inactive = store.players
        .filter((p) => p.rosterActive === false)
        .sort((x, y) => surnameKey(x.name).localeCompare(surnameKey(y.name)));
      const planning = invited.filter((p) =>
        ["accepted", "awaiting"].includes(W.invites.get(String(p.id))),
      );
      const d1 = planning.filter(
        (p) =>
          W.event.days === 1 ||
          W.event.dayAvailability?.[String(p.id)]?.[1] !== false,
      );
      const need = +W.event.fieldSize || 0;
      const complete = planning.length >= need;
      const status = `${complete ? "âœ“ Trip field selected" : `${planning.length}/${need} trip players selected`} â€” ${eventDays(W.event).map(day => `Day ${day}: ${wizardPlanningPlayers(day).length} playing`).join(" Â· ")}. Untick a day when a golfer is resting.`;
      $("#wizardBody").innerHTML =
        `<div class="pageHead"><div><h3>Choose players</h3><p class="hint">Invite golfers, record their response and build the confirmed field.</p></div><div class="card targetCard"><b>${W.event.fieldSize}</b><small>TARGET FIELD</small></div></div>
  <div class="playerTools"><input id="wpSearch" placeholder="Search by name or GolfLink number"><div class="rowBtns"><button class="soft" id="wizardManagePlayers">Manage Player List</button><button class="soft" data-setcoursehcp="1">Set GA & Tee Hcps</button>${eventDays(W.event).filter(day => day>1).map(day => `<button class="soft" data-setcoursehcp="${day}">Review Day ${day} Calculations</button>`).join("")}<button class="primary" id="wizardAddPlayer">+ Add Player</button>${W.event.days>1 ? `<button class="soft" id="planSharedPosition">Share this position across days</button>` : ""}</div></div>
  <div class="savedPlayerListTools"><label>Available Player Lists<select id="availablePlayerList"><option value="">Choose a named list</option>${[...store.playerLists].sort((a, b) => String(a.name).localeCompare(String(b.name))).map((list) => `<option value="${esc(list.id)}">${esc(list.name)} (${(list.playerIds || []).filter((id) => player(id)).length})</option>`).join("")}</select></label><button class="primary" id="loadPlayerList" ${store.playerLists.length ? "" : "disabled"}>Load List into Invited</button><button class="soft" id="manageNamedPlayerLists">Create / Manage Player Lists</button></div>
  <div class="trafficLegend"><span><i class="legendDot accept"></i>Accepted</span><span><i class="legendDot wait"></i>Awaiting reply</span><span><i class="legendDot decline"></i>Declined</span>${W.event.days > 1 ? `<span class="availabilityLegend">For accepted players, tick the day(s) they are playing.</span>` : ""}</div>
  <div class="threeCols"><div class="col"><h3>Available Players <span>${available.length}</span></h3><div id="av"></div></div><div class="col"><h3 class="inviteHeading">Invited <span>${invited.length}</span>${invited.some((p) => W.invites.get(String(p.id)) === "awaiting") ? '<button type="button" class="allGreenBtn" id="wizardAllGreen">âœ“ All Green</button>' : ""}</h3><div id="inv"></div></div><div class="col"><h3>Confirmed Field <span>${confirmed.length}</span></h3><div id="conf"></div></div></div><div class="status">${status}</div>`;
      $("#wpSearch").value = q;
      if (keepSearchFocus) {
        try {
          $("#wpSearch").focus({ preventScroll: true });
          $("#wpSearch").setSelectionRange(q.length, q.length);
        } catch (_) {}
      }
      $("#wpSearch").oninput = (e) => {
        q = e.target.value.toLowerCase();
        keepSearchFocus = true;
        draw();
      };
      $("#wizardAddPlayer").onclick = () => {
        addPlayer(() => { q = ""; draw(); });
      };
      if($("#planSharedPosition"))$("#planSharedPosition").onclick=()=>openSharedPositionPlanner(draw);
      $("#manageNamedPlayerLists").onclick = () => openPlayerListManager(draw);
      $("#loadPlayerList").onclick = () => {
        const list = store.playerLists.find(
          (item) => String(item.id) === String($("#availablePlayerList").value),
        );
        if (!list) return alert("Choose a named Player List first.");
        let added = 0;
        for (const id of list.playerIds || []) {
          if (!player(id) || W.invites.has(String(id))) continue;
          W.invites.set(String(id), "awaiting");
          added++;
        }
        draw();
        alert(
          added
            ? `${added} player${added === 1 ? "" : "s"} from ${list.name} added to Invited as awaiting reply.`
            : `Everyone in ${list.name} is already included in this event.`,
        );
      };
      if ($("#wizardAllGreen")) {
        $("#wizardAllGreen").onclick = () => {
          const awaiting = invited.filter(
            (p) => W.invites.get(String(p.id)) === "awaiting",
          );
          if (
            awaiting.length &&
            confirm(
              `Mark all ${awaiting.length} remaining invited player${awaiting.length === 1 ? "" : "s"} as accepted?`,
            )
          ) {
            awaiting.forEach((p) =>
              W.invites.set(String(p.id), "accepted"),
            );
            draw();
          }
        };
      }
      $("#wizardManagePlayers").onclick = () => {
        wizardReturnStep = 2;
        $("#wizardShade").classList.remove("open");
        nav("playersPage");
        renderPlayersAdmin();
      };
      $$("[data-setcoursehcp]").forEach(
        (b) =>
          (b.onclick = () => openWizardHandicapEntry(+b.dataset.setcoursehcp)),
      );
      $("#av").innerHTML =
        available
          .map((p) =>
            p.system
              ? `<div class="playerRow noPartnerRow"><div><b>${esc(p.name)}</b><small>Use only when one playing position cannot be filled</small></div><button class="invite" data-winvite="${p.id}">Invite</button></div>`
              : `<div class="playerRow"><div><b>${esc(p.name)}</b><small>${esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink)}</small></div><div class="rowBtns"><button class="info" data-wpinfo="${p.id}">i</button><button class="invite" data-winvite="${p.id}">Invite</button><button class="danger miniMinus" title="Make inactive" data-wpinactive="${p.id}">âˆ’</button></div></div>`,
          )
          .join("") +
        (inactive.length
          ? `<div class="divider">Inactive Away Golf Members (${inactive.length})</div>` +
            inactive
              .map(
                (p) =>
                  `<div class="playerRow inactive"><div><b>${esc(p.name)}</b><small>${esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink)}</small></div><div class="rowBtns"><button class="info" data-wpinfo="${p.id}">i</button><button class="soft" data-wpreactivate="${p.id}">Reactivate</button></div></div>`,
              )
              .join("")
          : "");
      $("#inv").innerHTML =
        invited
          .map((p) => {
            let st = W.invites.get(String(p.id));
            return `<div class="playerRow ${p.system ? "noPartnerRow" : ""}"><div><b>${esc(GolfSharedPositions.label(W.event,p.id,id=>store.players.find(p=>String(p.id)===String(id))?.name || "Player"))}</b><small>${p.system ? "System position" : esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink)}</small></div>${p.system ? '<span class="noPartnerConfirmed">âœ“ Confirmed position</span>' : `<div class="rowBtns traffic"><button class="dotBtn wait ${st === "awaiting" ? "active" : ""}" title="Awaiting reply" data-wstatus="${p.id}|awaiting"></button><button class="dotBtn accept ${st === "accepted" ? "active" : ""}" title="Accepted" data-wstatus="${p.id}|accepted"></button><button class="dotBtn decline ${st === "declined" ? "active" : ""}" title="Declined" data-wstatus="${p.id}|declined"></button><button class="info" data-wpinfo="${p.id}">i</button></div>`}</div>`;
          })
          .join("") ||
        '<p class="hint" style="padding:10px">No invitations yet.</p>';
      $("#conf").innerHTML =
        confirmed
          .map((p) => {
            const id = String(p.id),
              a = W.event.dayAvailability[id] || { 1: true, 2: true };
            return `<div class="playerRow confirmedAvailability ${p.system ? "noPartnerRow" : ""}"><div><b>${esc(GolfSharedPositions.label(W.event,p.id,id=>store.players.find(p=>String(p.id)===String(id))?.name || "Player"))}</b><small>${p.system ? "Missing player position" : esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink)}</small></div>${W.event.days > 1 ? `<div class="dayAvailability">${eventDays(W.event).map(day => `<label><input type="checkbox" data-wday="${id}|${day}" ${a[day] !== false ? "checked" : ""}> D${day}${W.event.sharedPositions?.[id] ? " Â· "+esc(player(sharedActualId(id,day,W.event))?.name || "Player") : ""}</label>`).join("")}</div>` : "<span>âœ“</span>"}</div>`;
          })
          .join("") ||
        '<p class="hint" style="padding:10px">Accepted players appear here.</p>';
      $$("[data-wday]").forEach(
        (cb) =>
          (cb.onchange = () => {
            let [id, day] = cb.dataset.wday.split("|");
            ensureAvailability(id);
            W.event.dayAvailability[id][+day] = cb.checked;
            draw();
          }),
      );
      restoreScroll();
    }
    draw();
  }
  function openLegacyWizardHandicapEntry(day) {
    const ids = wizardPlanningPlayers(day).filter((id) => id !== NO_PARTNER_ID),
      c = course(W.event["course" + day]),
      key = "day" + day;
    W.event.dailyHandicaps = W.event.dailyHandicaps || { day1: {}, day2: {} };
    W.event.dailyHandicaps[key] = W.event.dailyHandicaps[key] || {};
    const initialDay1 = { ...(W.event.dailyHandicaps.day1 || {}) };
    if (day === 2)
      ids.forEach((id) => {
        if (
          (W.event.dailyHandicaps.day2[id] === "" ||
            W.event.dailyHandicaps.day2[id] == null) &&
          W.event.dailyHandicaps.day1[id] !== "" &&
          W.event.dailyHandicaps.day1[id] != null
        )
          W.event.dailyHandicaps.day2[id] = W.event.dailyHandicaps.day1[id];
      });
    const title = day === 2 ? "Review Day 2 Handicaps" : "Set Handicaps";
    const help =
      day === 2
        ? "Day 1 handicaps have been copied automatically. Change only any handicaps that differ on Day 2."
        : "Type each handicap and press Enter to move down the list. For a plus handicap, enter the number normally and tick Plus.";
    $("#modalContent").innerHTML =
      `<div class="handicapEntryHead"><div><h2>${title} â€” ${esc(c?.name || "Day " + day + " Course")}</h2><p>${help}</p></div></div><div class="quickHandicapColumns"><span>Player</span><span>Handicap</span><span>Plus</span></div><div class="quickHandicapList">${
        ids
          .map((id, i) => {
            const value = W.event.dailyHandicaps[key][id],
              plus = Number(value) < 0;
            return `<div class="quickHcpRow ${W.invites.get(String(id)) === "awaiting" ? "awaitingPlayer" : ""}"><span><b>${esc(player(id)?.name || "")}</b>${W.invites.get(String(id)) === "awaiting" ? "<small>Awaiting reply</small>" : ""}</span><div class="signedHcpInput ${plus ? "plus" : ""}" data-signedwrapper="${id}"><input type="number" inputmode="numeric" min="0" max="54" step="1" data-quickhcp="${id}" data-quickindex="${i}" value="${esc(handicapMagnitude(value))}" placeholder="Hcp"></div><label class="quickPlusCheck"><input type="checkbox" data-quickplus="${id}" ${plus ? "checked" : ""}><span>Plus</span></label></div>`;
          })
          .join("") || "<p>No selected players yet.</p>"
      }</div><div class="rowBtns handicapEntryActions"><button class="primary" id="saveQuickHandicaps">${day === 2 ? "Save Day 2 Handicaps" : "Save Handicaps"}</button><button class="soft" id="closeQuickHandicaps">Cancel</button></div>`;
    $("#modalShade").classList.add("open");
    const inputs = $$("[data-quickhcp]");
    if (inputs[0]) inputs[0].focus();
    const storeValue = (inp) => {
      if (inp.value === "") return;
      const raw = Math.max(0, Math.min(54, +inp.value || 0)),
        id = String(inp.dataset.quickhcp),
        plus = $(`[data-quickplus="${id}"]`)?.checked;
      W.event.dailyHandicaps[key][id] = plus ? -raw : raw;
      $(`[data-signedwrapper="${id}"]`)?.classList.toggle(
        "plus",
        Boolean(plus),
      );
    };
    inputs.forEach((inp, i) => {
      inp.oninput = () => storeValue(inp);
      inp.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          storeValue(inp);
          if (inputs[i + 1]) {
            inputs[i + 1].focus();
            inputs[i + 1].select();
          } else $("#saveQuickHandicaps").focus();
        }
      };
    });
    $$("[data-quickplus]").forEach(
      (cb) =>
        (cb.onchange = () => {
          const inp = $(`[data-quickhcp="${cb.dataset.quickplus}"]`);
          if (inp) storeValue(inp);
        }),
    );
    $("#closeQuickHandicaps").onclick = () =>
      $("#modalShade").classList.remove("open");
    $("#saveQuickHandicaps").onclick = () => {
      inputs.forEach(storeValue);
      if (day === 1 && W.event.days > 1) {
        const d1 = W.event.dailyHandicaps.day1,
          d2 = (W.event.dailyHandicaps.day2 =
            W.event.dailyHandicaps.day2 || {});
        wizardPlanningPlayers(2)
          .filter((id) => id !== NO_PARTNER_ID)
          .forEach((id) => {
            if (
              d1[id] !== "" &&
              d1[id] != null &&
              (d2[id] === "" || d2[id] == null || d2[id] === initialDay1[id])
            )
              d2[id] = d1[id];
          });
      }
      writeLocalStore();
      $("#modalShade").classList.remove("open");
      renderStep2();
    };
  }
// Invert the app's own handicap calculation, then confirm rounding reproduces
// the organiser's requested daily handicap. This is an event estimate, not GA registration.
function estimateEventGa(handicap, rating, category, calculate) {
 if(!rating?.valid)throw new Error('Enter Slope, Scratch Rating and Par for the selected tee first.');
 if(!Number.isInteger(handicap)||handicap < -10||handicap > 54)throw new Error('Enter a whole-number proposed handicap from âˆ’10 to 54. Use a negative number for a plus handicap.');
 const factor=.93*(category==='women'?1.0483:.9986);
 const raw=(handicap/factor-(rating.scratch-rating.par))*113/rating.slope;
 const candidates=Array.from({length:21},(_,i)=>Math.round((raw+(i-10)/10)*10)/10).filter(v=>v>=-10&&v<=54&&calculate(v,rating,category)===handicap);
 candidates.sort((a,b)=>Math.abs(a-raw)-Math.abs(b-raw));
 if(!candidates.length)throw new Error('This proposed handicap cannot be represented by a GA estimate from âˆ’10 to 54 for this tee. Check the proposed handicap and tee ratings.');
 return Object.is(candidates[0],-0)?0:candidates[0];
}
  function gesProposedHandicapRow(id,day) {
    if(!player(id)?.noOfficialHandicap)return '';
    const anchor=W.event.proposedHandicaps?.[id],same=anchor?.day===day&&String(anchor.courseId)===String(W.event['course'+day]);
    return `<div class="gesProposedHandicap"><small>No Official Handicap Â· event estimate only</small><div><label>Set Handicap for this tee<select data-proposedtee="${esc(id)}">${enabledEventTees(W.event,day).map(tee=>`<option value="${tee}" ${same&&anchor.tee===tee?'selected':''}>${EVENT_TEE_LABELS[tee]} â€” ${esc(teeMarkerColour(tee,course(W.event['course'+day])))}</option>`).join('')}</select></label><label>Proposed handicap<input type="number" min="-10" max="54" step="1" data-proposedhcp="${esc(id)}" value="${same?esc(anchor.handicap):''}" placeholder="e.g. 19"></label><button type="button" class="soft" data-estimatega="${esc(id)}">Set estimated GA</button></div><small data-estimatestatus="${esc(id)}" role="status">${same?`Day ${day}: ${esc(teeMarkerColour(anchor.tee,course(anchor.courseId)))} tee Â· ${esc(anchor.handicap)} hcp Â· estimated GA ${esc(anchor.ga)}`:'Choose a tee and proposed handicap, then set the estimated GA.'}</small></div>`;
  }
  function gesBindProposedHandicaps(day) {
    $$('[data-eventgaplus]').forEach(control=>{if(player(control.dataset.eventgaplus)?.noOfficialHandicap)control.disabled=true;});
    $$('[data-eventgacategory]').forEach(control=>{if(!player(control.dataset.eventgacategory)?.noOfficialHandicap)return;const existing=control.onchange;control.onchange=()=>{existing?.();const id=control.dataset.eventgacategory;delete W.event.gaHandicaps[id];if(W.event.proposedHandicaps)delete W.event.proposedHandicaps[id];$(`[data-eventga="${id}"]`).value='';$(`[data-estimatestatus="${id}"]`).textContent='Category changed. Press Set estimated GA again.';};});
    $$('[data-estimatega]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.estimatega,status=$(`[data-estimatestatus="${id}"]`);
      try {
        const tee=$(`[data-proposedtee="${id}"]`).value,raw=$(`[data-proposedhcp="${id}"]`).value;
        if(raw.trim()==='')throw Error('Enter the proposed handicap.');
        const category=$(`[data-eventgacategory="${id}"]`).value,handicap=Number(raw),rating=teeRatingForDailyHandicap(day,tee,W.event,category);
        const ga=estimateEventGa(handicap,rating,category,calculateDailyHandicap);
        W.event.gaHandicaps[id]=ga;W.event.gaCategories[id]=category;
        W.event.proposedHandicaps=W.event.proposedHandicaps||{};W.event.proposedHandicaps[id]={day,courseId:W.event['course'+day],tee,handicap,category,ga};
        const input=$(`[data-eventga="${id}"]`);input.value=Math.abs(ga).toFixed(1);$(`[data-eventgaplus="${id}"]`).checked=ga<0;$(`[data-gasigned="${id}"]`).classList.toggle('plus',ga<0);
        status.textContent=`Day ${day}: ${rating.teeColour} tee Â· ${handicap} hcp Â· estimated GA ${ga.toFixed(1)}. Calculate Event Handicaps applies this across the event.`;
      }catch(error){status.textContent=error.message;}
    });
    $$('[data-proposedtee],[data-proposedhcp]').forEach(input=>input.onchange=()=>{const id=input.dataset.proposedtee||input.dataset.proposedhcp;delete W.event.gaHandicaps[id];if(W.event.proposedHandicaps)delete W.event.proposedHandicaps[id];$(`[data-eventga="${id}"]`).value='';$(`[data-estimatestatus="${id}"]`).textContent='Proposed handicap changed. Press Set estimated GA again.';});
  }

  function gesCheckEstimates(ids) {
    for(const id of ids){
      if(!player(id)?.noOfficialHandicap)continue;
      const a=W.event.proposedHandicaps?.[id];
      if(!a||String(a.courseId)!==String(W.event['course'+a.day])||!enabledEventTees(W.event,a.day).includes(a.tee)||a.category!==eventGaCategory(id,W.event)||calculateDailyHandicap(eventGaHandicap(id,W.event),teeRatingForDailyHandicap(a.day,a.tee,W.event,a.category),a.category)!==a.handicap){
        alert(`Set the proposed tee handicap for ${player(id)?.name || 'this player'} first. Recheck it if the course, tee ratings or category has changed.`);return false;
      }
    }
    return true;
  }

  function bindEventGaControls(gaInputs, storeGaValue, afterBulkChange = null) {
    const editable = gaInputs.filter(input => !input.readOnly && !input.disabled);
    gaInputs.forEach(input => { if (input.readOnly || input.disabled) input.tabIndex = -1; });
    editable.forEach((input, index) => {
      // Native Android Next follows tab order even when no Enter event is emitted.
      input.tabIndex = index + 1;
      input.enterKeyHint = index + 1 < editable.length ? "next" : "done";
      input.oninput = () => storeGaValue(input);
      input.onkeydown = event => {
        if (event.key !== "Enter" && event.key !== "Tab") return;
        if (event.key === "Tab" && event.shiftKey && index === 0) return;
        event.preventDefault();
        storeGaValue(input);
        const next = editable[index + (event.shiftKey ? -1 : 1)];
        if (next) { next.focus(); next.select(); }
        else $("#calculateEventHandicaps").focus();
      };
    });
    const categories = $$('[data-eventgacategory]');
    const button = $("#changeAllGaCategories");
    const refreshLabel = () => {ßÝ¸Ñ¼­zÊ&ŠÛ^uÁ±…å•È½Ù•ÈÑ¡”•Ù•¹Ðˆ¥ô‘í¡½¥” ‰½Ù•É…±±A…¥ÉÌˆ°ˆ¤É•…Ñ”MÑ…‰±•™½ÉÁ½¥¹ÑÌ½¸Ñ¡”A…È€ÍÌ™½È•… €Ñ		Ñ•…´ƒŠPÁ…ÉÑ¹•ÉÌ…É”Ñ¡”…ä€‘í•Ù•¹Ð¹‘…åÍô€Ñ		Á…ÉÑ¹•ÉÍ€¥ôð½‘¥Øù€€è€ˆ‰ôð½‘¥Øù€ì(€ô(€™Õ¹Ñ¥½¸±…ÍÑ…å9ÑÁ!Ñµ°¡•Ù•¹Ð¤ì(€€€½¹ÍÐ‘…ä€ô•Ù•¹Ñ…åÌ¡•Ù•¹Ð¤¹±•¹Ñ °•¹…‰±•€ô½µÁ•Ñ¥Ñ¥½¹…åÌ ‰¹ÑÀˆ±•Ù•¹Ð¤¹¥¹±Õ‘•Ì¡‘…ä¤ì(€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰¹ÑÁ	½à±…ÍÑ…å9ÑÁ	½àˆøñ™¥•±‘Í•Ð±…ÍÌô‰±…ÍÑ…å9ÑÁ¡½¥•Ì€‘í•¹…‰±•€ü€ˆˆ€è€‰¥¹…Ñ¥Ù”‰ôˆ€‘í•¹…‰±•€ü€ˆˆ€è€‰‘¥Í…‰±•‰ôøñ±••¹ù9QAÌ½¸Ñ¡”±…ÍÐ‘…ä€¡…ä€‘í‘…åô¤ð½±••¹ø‘ílÄ°Ét¹µ…À¡¸€ôø€ñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰±…ÍÑ…å9ÑÁ½Õ¹ÐˆÙ…±Õ”ôˆ‘í¹ôˆ€‘í•¹…‰±•€˜˜¹ÑÁ½Õ¹Ð¡‘…ä±•Ù•¹Ð¤€ôôô¸€ü€‰¡•­•ˆ€è€ˆ‰ôø€‘í¸€ôôô€Ä€ü€‰=¹”ˆ€è€‰QÝ¼‰ôð½±…‰•°ù€¤¹©½¥¸ ˆ€ˆ¥ôð½™¥•±‘Í•ÐøñÍµ…±°±…ÍÌô‰±…ÍÑ…å9ÑÁ!•±Àˆø‘í•¹…‰±•€ü€‰¡½½Í”½¹”½ÈÑÝ¼9Q@¡½±•Ì™½ÈÑ¡”™¥¹…°‘…ä¸Q¡”…ÁÀÝ¥±°ÍÕ•ÍÐÍÕ¥Ñ…‰±”¡½±•Ì½¸Ñ¡”9Q@Í•ÑÕÀÁ…”¸ˆ€è€ñÍÑÉ½¹œùQ¥¬…ä€‘í‘…åô¥¸A±…å¥¹œ‘…åÌ…‰½Ù”Ñ¼¡½½Í”½¹”½ÈÑÝ¼9Q@¡½±•Ì™½ÈÑ¡”™¥¹…°‘…ä¸ð½ÍÑÉ½¹œùôð½Íµ…±°øð½‘¥Øù€ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€¹½Éµ…±¥Í•MÑ…‰±•™½É‘	•¹•™¥ÑÌ¡\¹‰•¹•™¥ÑÌ¤ì(€€€½¹ÍÐÍ•ÑÕÁ5•Ñ¡½‘Ìõí¡½±•	å!½±”è‰=¸½ÕÉÍ”‰äÁ±…å•ÉÌ…¹½¹™¥Éµ•‰ä5…É­•ÉÌ¡½±”µ‰äµ¡½±”ˆ±™Õ±±…É‘A±…å•Èè‰™Ñ•ÈÉ½Õ¹ƒŠPÍÑÉ½­•Ì•¹Ñ•É•¡½±”µ‰äµ¡½±”‰ä„A±…å•Èˆ±™¥¹…±É½ÍÌè‰™Ñ•ÈÉ½Õ¹ƒŠP™¥¹…°É½ÍÌMÑÉ½­•Ì½¹±äˆ±™¥¹…±MÑ…‰±•™½Éè‰™Ñ•ÈÉ½Õ¹ƒŠP™¥¹…°MÑ…‰±•™½ÉÁ½¥¹ÑÌ½¹±ä‰ô±Í•ÑÕÁ5•Ñ¡½‘½Èõ‘…äôù\¹•Ù•¹Ð¹Í½É¥¹5•Ñ¡½‘Ìü¹l‰‘…äˆ­‘…åuñð‰¡½±•	å!½±”ˆ±Í•ÑÕÁ½¹™±¥ÑÌõ‘…äôùl¸¸¹\¹½µÁ•Ñ¥Ñ¥½¹Ít¹™¥±Ñ•È¡¥ôù½µÁ•Ñ¥Ñ¥½¹…åÌ¡¥±\¹•Ù•¹Ð¤¹¥¹±Õ‘•Ì ­‘…ä¤˜˜…™¥¹…±M½É•½µÁ•Ñ¥Ñ¥½¹±±½Ý•¡¥±Í•ÑÕÁ5•Ñ¡½‘½È¡‘…ä¤¤¤ì(€€€½¹ÍÐÍÑ…‰±•™½É‘%€ô\¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰Í¥¹±”ˆ€è€‰½µ‰¥¹•ˆ°(€€€€€ÁÉ•Ù¥½ÕÍ%€ô\¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰½µ‰¥¹•ˆ€è€‰Í¥¹±”ˆì(€€€¥˜€¡\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì¡ÁÉ•Ù¥½ÕÍ%¤¤ì(€€€€€\¹½µÁ•Ñ¥Ñ¥½¹Ì¹‘•±•Ñ”¡ÁÉ•Ù¥½ÕÍ%¤ì(€€€€€\¹½µÁ•Ñ¥Ñ¥½¹Ì¹…‘¡ÍÑ…‰±•™½É‘%¤ì(€€€€€¥˜€¡\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÌü¹mÁÉ•Ù¥½ÕÍ%‘t¤ì(€€€€€€€\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍmÍÑ…‰±•™½É‘%‘t€ô\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍmÁÉ•Ù¥½ÕÍ%‘tì(€€€€€€€‘•±•Ñ”\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍmÁÉ•Ù¥½ÕÍ%‘tì(€€€€€ô(€€€ô(€€€±•Ð‘•™Ì€ô½µÁ•™¥¹¥Ñ¥½¹Ì ¤°(€€€€€•Œ€ô‘•™Ì¹™¥¹ ¡à¤€ôøà¹¥€ôôô€‰•±•Ñ¥Œˆ¤ì(€€€½¹ÍÐ…µ‰É½Í•=¸€ô\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰…µ‰É½Í”ˆ¤ì(€€€¥˜€¡…µ‰É½Í•=¸€˜˜\¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä¤(€€€€€l¸¸¹\¹½µÁ•Ñ¥Ñ¥½¹Ít¹™½É…  ¡¥¤€ôøì(€€€€€€€¥˜€ …l‰…µ‰É½Í”ˆ°€‰¹ÑÀ‰t¹¥¹±Õ‘•Ì¡¥¤¤\¹½µÁ•Ñ¥Ñ¥½¹Ì¹‘•±•Ñ”¡¥¤ì(€€€€€ô¤ì(€€€¥˜€¡•Œü¹Õ¹…Ù…¥±…‰±”¤\¹½µÁ•Ñ¥Ñ¥½¹Ì¹‘•±•Ñ” ‰•±•Ñ¥Œˆ¤ì(€€€±•ÐÑ•µÁ±…Ñ•Q•áÐ€ôÍÑ½É”¹Ñ•µÁ±…Ñ”(€€€€€€ü€‰e½ÕÈÁÉ•Ù¥½ÕÌ•Ù•¹Ð¡½¥•Ì…É”±½…‘•…ÌÑ¡”ÍÑ…ÉÑ¥¹œÁ½¥¹Ð¸¡…¹”½¹±äÝ¡…Ð¥Ì‘¥™™•É•¹ÐÑ¡¥ÌÑ¥µ”¸ˆ(€€€€€€è€‰M•ÐÕÀå½ÕÈ™¥ÉÍÐ•Ù•¹Ð¸Q¡•Í”¡½¥•ÌÝ¥±°‰”É•Ñ…¥¹•…ÌÑ¡”ÍÑ…ÉÑ¥¹œÁ½¥¹Ð™½Èå½ÕÈ¹•áÐ•Ù•¹Ð¸ˆì(€€€\¹•Ù•¹Ð¹ÍÉ…Ñ¡5…á!À€ô9Õµ‰•È¹¥Í¥¹¥Ñ” ­\¹•Ù•¹Ð¹ÍÉ…Ñ¡5…á!À¤(€€€€€€ü€­\¹•Ù•¹Ð¹ÍÉ…Ñ¡5…á!À(€€€€€€è€ÄÀì(€€€\¹•Ù•¹Ð¹ÍÉ…Ñ¡M½É¥¹5½‘”€ô(€€€€€\¹•Ù•¹Ð¹ÍÉ…Ñ¡M½É¥¹5½‘”€ôôô€‰µ…á½Õ‰±•	½•äˆ(€€€€€€€€ü€‰µ…á½Õ‰±•	½•äˆ(€€€€€€€€è€‰ÍÑÉ½­”ˆì(€€€\¹•Ù•¹Ð¹Í½É¥¹5•Ñ¡½‘Ìñðôíôì(€€€•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤¹™½É… ¡‘…ä€ôø\¹•Ù•¹Ð¹Í½É¥¹5•Ñ¡½‘Íl‰‘…äˆ€¬‘…åtñðô€‰¡½±•	å!½±”ˆ¤ì(€€€¥˜€¡•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤¹Í½µ”¡‘…ä€ôøÍ•ÑÕÁ5•Ñ¡½‘½È¡‘…ä¤€„ôô€‰¡½±•	å!½±”ˆ¤¤(€€€€€\¹•Ù•¹Ð¹Á±…¹±Ñ•É¹…Ñ¥Ù•M½É¥¹œ€ôÑÉÕ”ì(€€€l¸¸¹\¹½µÁ•Ñ¥Ñ¥½¹Ít¹™½É… ¡¥€ôøì(€€€€€½¹ÍÐÍ•±•Ñ•‘…åÌ€ô½µÁ•Ñ¥Ñ¥½¹…åÌ¡¥±\¹•Ù•¹Ð¤°(€€€€€€€Ù…±¥‘…åÌ€ôÍ•±•Ñ•‘…åÌ¹™¥±Ñ•È¡‘…ä€ôø™¥¹…±M½É•½µÁ•Ñ¥Ñ¥½¹±±½Ý•¡¥±Í•ÑÕÁ5•Ñ¡½‘½È¡‘…ä¤¤¤ì(€€€€€¥˜€¡Ù…±¥‘…åÌ¹±•¹Ñ €ôôôÍ•±•Ñ•‘…åÌ¹±•¹Ñ ¤É•ÑÕÉ¸ì(€€€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹9••‘ÍÙ•ÉåM•±•Ñ•‘…ä¡¥±\¹•Ù•¹Ð¤ñð€…Ù…±¥‘…åÌ¹±•¹Ñ ¤ì(€€€€€€€\¹½µÁ•Ñ¥Ñ¥½¹Ì¹‘•±•Ñ”¡¥¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÌñðôíôì(€€€€€\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍm¥‘t€ôÙ…±¥‘…åÌì(€€€ô¤ì(€€€€¼¼MÑÉ½­”¥Ì„¹•Ð½µÁ•Ñ¥Ñ¥½¸¸É½ÍÌÍ½É¥¹œ‰•±½¹ÌÕ¹‘•ÈMÉ…Ñ °(€€€€¼¼Ý¡•É”Ñ¡”½É…¹¥Í•È…¸…ÁÁ±äÑ¡”•Ù•¹ÐÌ¡…¹‘¥…À•±¥¥‰¥±¥Ñä±¥µ¥Ð¸(€€€\¹•Ù•¹Ð¹ÍÑÉ½­•I•ÍÕ±Ð€ô€‰¹•Ðˆì(€€€\¹•Ù•¹Ð¹ÍÑÉ½­•M½É¥¹5½‘”ñðô€‰…±±MÑÉ½­•Ìˆì(€€€\¹•Ù•¹Ð¹ÍÑÉ½­•½Õ¹Ñ¥¹5½‘”ñðô€‰‘…¥±äˆì(€€€¥˜€¡ÑåÁ•½˜\¹•Ù•¹Ð¹ÍÑÉ½­•…¥±åI•ÍÕ±ÑÌ€„ôô€‰‰½½±•…¸ˆ¤\¹•Ù•¹Ð¹ÍÑÉ½­•…¥±åI•ÍÕ±ÑÌ€ô\¹•Ù•¹Ð¹ÍÑÉ½­•½Õ¹Ñ¥¹5½‘”€ôôô€‰‘…¥±äˆì(€€€¥˜€¡ÑåÁ•½˜\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•¹…‰±•€„ôô€‰‰½½±•…¸ˆ¤\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•¹…‰±•€ô\¹•Ù•¹Ð¹ÍÑÉ½­•½Õ¹Ñ¥¹5½‘”€„ôô€‰‘…¥±äˆì(€€€\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•5½‘”ñðô\¹•Ù•¹Ð¹ÍÑÉ½­•½Õ¹Ñ¥¹5½‘”€ôôô€‰‰•ÍÑÉ•…Ñ”ˆ€ü€‰‰•ÍÑÉ•…Ñ”ˆ€è€‰…É•…Ñ”ˆì(€€€¥˜€¡\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰•±•Ñ¥Œˆ¤¤Íå¹±•Ñ¥½µÁ•Ñ¥Ñ¥½¹…åÌ¡\¹•Ù•¹Ð¤ì(€€€½¹ÍÐÍ½É¥¹5•Ñ¡½‘M•ÑÕÀ€ô€ñ‘¥Ø±…ÍÌô‰Í½É¥¹UÍ•M•ÑÕÀˆøñ‘¥Ø±…ÍÌô‰Í½É¥¹UÍ•EÕ•ÍÑ¥½¸ˆøñˆùM½É¥¹œÑ¼‰”½µÁ±•Ñ•ÕÍ¥¹œÑ¡”ÁÀÝ¡¥±”Á±…å¥¹œð½ˆøñ‘¥Ø±…ÍÌô‰Í½É¥¹UÍ•¡½¥•Ìˆøñ±…‰•°øñ¥¹ÁÕÐÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰Á±…¹±Ñ•É¹…Ñ¥Ù•M½É¥¹œˆÙ…±Õ”ô‰¹¼ˆ€‘í\¹•Ù•¹Ð¹Á±…¹±Ñ•É¹…Ñ¥Ù•M½É¥¹œüˆˆè‰¡•­•‰ôøe•Ìð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰Á±…¹±Ñ•É¹…Ñ¥Ù•M½É¥¹œˆÙ…±Õ”ô‰å•Ìˆ€‘í\¹•Ù•¹Ð¹Á±…¹±Ñ•É¹…Ñ¥Ù•M½É¥¹œü‰¡•­•ˆèˆ‰ôø9¼ð½±…‰•°øð½‘¥Øøð½‘¥Øø‘í\¹•Ù•¹Ð¹Á±…¹±Ñ•É¹…Ñ¥Ù•M½É¥¹œ€ü€ñ‘¥Ø±…ÍÌô‰Í½É¥¹5•Ñ¡½‘M•ÑÕÀˆøñ Ðù%˜Ñ¡”ÁÀ¥Ì¹½Ð‰•¥¹œÕÍ•™½È…¹äÉ½Õ¹¥¸Ñ¡”•Ù•¹Ð°ÕÍ”Ñ¡¥ÌÍ•Ñ¥½¸Ñ¼Á±…¸Ñ¡”Í½É¥¹œÁÉ½•ÍÌ¸ð½ ÐøñÀ±…ÍÌô‰¡¥¹Ðˆù¡½½Í”½¹”µ•Ñ¡½™½È•… Á±…å¥¹œ‘…ä¸¹ä½µÁ•Ñ¥Ñ¥½¸Ñ¡…Ð…¹¹½Ð‰”…±Õ±…Ñ•™É½´Ñ¡”Í•±•Ñ•Í½É”¥¹™½Éµ…Ñ¥½¸Ý¥±°‰”É•å•½ÕÐ¸ð½Àø‘í•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤¹µ…À¡‘…ä€ôø€ñ‘¥Ø±…ÍÌô‰Í½É¥¹5•Ñ¡½‘…äˆøñˆø‘í\¹•Ù•¹Ð¹‘…åÌ€ø€Ä€ü…ä€‘í‘…åõ€€è€‰A±…å¥¹œ…ä‰ôð½ˆøñ‘¥Ø±…ÍÌô‰Í½É¥¹5•Ñ¡½‘¡½¥•Ìˆø‘í=‰©•Ð¹•¹ÑÉ¥•Ì¡Í•ÑÕÁ5•Ñ¡½‘Ì¤¹µ…À ¡mÙ…±Õ”±±…‰•±t¤€ôø€ñ±…‰•°±…ÍÌô‰Í½É¥¹5•Ñ¡½‘¡½¥”€‘íÍ•ÑÕÁ5•Ñ¡½‘½È¡‘…ä¤ôôõÙ…±Õ”ü‰Í•±•Ñ•ˆèˆ‰ôˆøñÍÁ…¸ø‘í±…‰•±ôð½ÍÁ…¸øñ¥¹ÁÕÐÑåÁ”ô‰¡•­‰½àˆ‘…Ñ„µÍ½É¥¹µ•Ñ¡½ôˆ‘í‘…åôˆÙ…±Õ”ôˆ‘íÙ…±Õ•ôˆ€‘íÍ•ÑÕÁ5•Ñ¡½‘½È¡‘…ä¤ôôõÙ…±Õ”ü‰¡•­•ˆèˆ‰ôøð½±…‰•°ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øø‘íÍ•ÑÕÁ½¹™±¥ÑÌ¡‘…ä¤¹±•¹Ñ €ü€ñÍµ…±°±…ÍÌô‰µ•Ñ¡½‘½¹™±¥Ðˆù%¹½µÁ…Ñ¥‰±”½µÁ•Ñ¥Ñ¥½¹Ì¡…Ù”‰••¸É•µ½Ù•™É½´Ñ¡¥Ì‘…ä¸ð½Íµ…±°ù€€è€ˆ‰ôð½‘¥Øù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øù€€è€ˆ‰ôð½‘¥Øù€ì(€€€€ ˆÝ¥é…É‘	½‘äˆ¤¹¥¹¹•É!Q50€ô(€€€€€€ñ Ìù½µÁ•Ñ¥Ñ¥½¸M•ÑÕÀð½ Ìøñ‘¥Ø±…ÍÌô‰Ñ•µÁ±…Ñ•9½Ñ”ˆø‘íÑ•µÁ±…Ñ•Q•áÑôð½‘¥Øø‘íÍ½É¥¹5•Ñ¡½‘M•ÑÕÁô‘í‘•™Ì(€€€€€€€€¹µ…À ¡Œ¤€ôøì(€€€€€€€€€±•Ð½¸€ô\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì¡Œ¹¥¤°(€€€€€€€€€€€½µÁ…Ñ¥‰±•…åÌ€ô½µÁ•Ñ¥Ñ¥½¹½µÁ…Ñ¥‰±•…åÌ¡Œ¹¥°\¹•Ù•¹Ð¤°(€€€€€€€€€€€µ•Ñ¡½‘U¹…Ù…¥±…‰±”€ô€…½µÁ…Ñ¥‰±•…åÌ¹±•¹Ñ ñð€¡½µÁ•Ñ¥Ñ¥½¹9••‘ÍÙ•ÉåM•±•Ñ•‘…ä¡Œ¹¥±\¹•Ù•¹Ð¤€˜˜½µÁ…Ñ¥‰±•…åÌ¹±•¹Ñ €„ôô•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤¹±•¹Ñ ¤°(€€€€€€€€€€€‘¥Í…‰±•€ôŒ¹Õ¹…Ù…¥±…‰±”ñðµ•Ñ¡½‘U¹…Ù…¥±…‰±”ñð€¡…µ‰É½Í•=¸€˜˜\¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€˜˜€…l‰…µ‰É½Í”ˆ°€‰¹ÑÀ‰t¹¥¹±Õ‘•Ì¡Œ¹¥¤¤°(€€€€€€€€€€€µ•Ñ¡½‘I•…Í½¸€ôµ•Ñ¡½‘U¹…Ù…¥±…‰±”€ü€ñ‘¥Ø±…ÍÌô‰µ•Ñ¡½‘U¹…Ù…¥±…‰±•I•…Í½¸ˆùU¹…Ù…¥±…‰±”Ý¥Ñ Ñ¡”Í•±•Ñ•™¥¹…°µÍ½É”µ•Ñ¡½‘í\¹•Ù•¹Ð¹‘…åÌ€ø€Ä€ü€‰Ìˆ€è€ˆ‰ô¸ð½‘¥Øù€€è€ˆˆì(€€€€€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰½µÀ€‘í‘¥Í…‰±•€ü€‰Õ¹…Ù…¥±…‰±”ˆ€è€ˆ‰ôˆøñ‘¥Ø±…ÍÌô‰½µÁQ½Àˆøñ¥¹ÁÕÐÑåÁ”ô‰¡•­‰½àˆ‘…Ñ„µ½µÀôˆ‘íŒ¹¥‘ôˆ€‘í½¸€ü€‰¡•­•ˆ€è€ˆ‰ô€‘í‘¥Í…‰±•€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôøñ‘¥Øøñ Ðø‘íŒ¹¹…µ•ôð½ Ðøñ‘¥Ø±…ÍÌô‰¡¥¹Ðˆø‘íŒ¹‘•Íôð½‘¥Øø‘íµ•Ñ¡½‘I•…Í½¹ô‘íŒ¹¥€ôôô€‰½µ‰¥¹•ˆ€˜˜½¸€˜˜€…‘¥Í…‰±•€ü€ñ‘¥Ø±…ÍÌô‰¹ÑÁ	½àÍÑ…É½µÁ•Ñ¥Ñ¥½¹	½àˆøñˆùÙ•¹ÐM¥¹±”MÑ…‰±•™½É½Éµ…Ðð½ˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰Í¥¹±•½Éµ…ÐˆÙ…±Õ”ô‰‘…¥±äˆ€‘í\¹•Ù•¹Ð¹Í¥¹±•MÑ…‰±•™½É‘½Éµ…Ð€ôôô€‰‘…¥±äˆ€ü€‰¡•­•ˆ€è€ˆ‰ôø… Í•±•Ñ•‘…äƒŠP„Í•Á…É…Ñ”M¥¹±”MÑ…‰±•™½ÉÝ¥¹¹•Èð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰Í¥¹±•½Éµ…ÐˆÙ…±Õ”ô‰…É•…Ñ”ˆ€‘ì…\¹•Ù•¹Ð¹Í¥¹±•MÑ…‰±•™½É‘½Éµ…Ðñð\¹•Ù•¹Ð¹Í¥¹±•MÑ…‰±•™½É‘½Éµ…Ð€ôôô€‰…É•…Ñ”ˆ€ü€‰¡•­•ˆ€è€ˆ‰ôø=Ù•É…±°Ù•¹ÐÑ½Ñ…°ƒŠP½¹”½Ù•É…±°Ý¥¹¹•È½¹±äð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰Í¥¹±•½Éµ…ÐˆÙ…±Õ”ô‰‰½Ñ ˆ€‘í\¹•Ù•¹Ð¹Í¥¹±•MÑ…‰±•™½É‘½Éµ…Ð€ôôô€‰‰½Ñ ˆ€ü€‰¡•­•ˆ€è€ˆ‰ôø	½Ñ ƒŠP‘…¥±äÝ¥¹¹•ÉÌÁ±ÕÌÑ¡”½Ù•É…±°Ù•¹ÐÝ¥¹¹•Èð½±…‰•°øð½‘¥Øù€€è€ˆ‰ô‘í½¸€˜˜€…‘¥Í…‰±•€ü€¡Œ¹¥€ôôô€‰•±•Ñ¥Œˆ€ü•±•Ñ¥½ÕÉÍ•¡½¥•!Ñµ°¡\¹•Ù•¹Ð¤€è½µÁ•Ñ¥Ñ¥½¹M¡•‘Õ±•!Ñµ°¡Œ¹¥¤¤€¬‰•¹•™¥Ñ!Ñµ°¡Œ¹¥¤€è€ˆ‰ô‘íŒ¹¥€ôôô€‰Ñ•…µAÕÑÑÌˆ€˜˜½¸€˜˜€…‘¥Í…‰±•€ü€ñ‘¥Ø±…ÍÌô‰¹ÑÁ	½àÁÕÑÑ¥¹½Éµ…Ñ	½àˆøñˆùAÕÑÑ¥¹œ½µÁ•Ñ¥Ñ¥½¸½Éµ…Ðð½ˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÁÕÑÑ¥¹½Éµ…ÐˆÙ…±Õ”ô‰Á…¥ÉÌˆ€‘í\¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€ôôô€‰Á…¥ÉÌˆ€ü€‰¡•­•ˆ€è€ˆ‰ôø€Ñ		A…¥ÉÌƒŠPÑ¡”ÑÝ¼Á…ÉÑ¹•ÉÌœÁÕÑÑÌ…É”…‘‘•Ñ½•Ñ¡•Èð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÁÕÑÑ¥¹½Éµ…ÐˆÙ…±Õ”ô‰Ñ•…´ˆ€‘í\¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€„ôô€‰Á…¥ÉÌˆ€ü€‰¡•­•ˆ€è€ˆ‰ôø½ÕÈµA±…å•ÈQ•…´ƒŠP…±°™½ÕÈÉ½ÕÀµ•µ‰•ÉÌœÁÕÑÑÌ…É”…‘‘•Ñ½•Ñ¡•Èð½±…‰•°øð½‘¥Øù€€è€ˆ‰ô‘íŒ¹¥€ôôô€‰Á…ÈÌˆ€˜˜½¸€˜˜€…‘¥Í…‰±•€üÁ…ÈÍ½Éµ…Ñ!Ñµ°¡\¹•Ù•¹Ð¤€è€ˆ‰ô‘íŒ¹¥€ôôô€‰¹ÑÀˆ€˜˜½¸€˜˜€…‘¥Í…‰±•€˜˜\¹•Ù•¹Ð¹‘…åÌ€ø€Ä€ü€ñ‘¥Ø±…ÍÌô‰¹ÑÁ	½àˆøñˆù9Q@AÉ¥é•Ìð½ˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰¡•­‰½àˆ¥ô‰¹ÑÁ)…­Á½Ðˆ€‘í\¹•Ù•¹Ð¹¹ÑÁ)…­Á½Ð€ü€‰¡•­•ˆ€è€ˆ‰ôø9Q@!½±•Ì)…­Á½Ðð½±…‰•°ø‘í\¹•Ù•¹Ð¹¹ÑÁ)…­Á½Ð€ü€ñ‘¥Ø±…ÍÌô‰©…­Á½Ñ5½‘”ˆøñˆù)…­Á½Ð‘•ÍÑ¥¹…Ñ¥½¸ð½ˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰¹ÑÁ)…­Á½Ñ5½‘”ˆÙ…±Õ”ô‰™¥¹…°ˆ€‘í\¹•Ù•¹Ð¹¹ÑÁ)…­Á½Ñ5½‘”€„ôô€‰É½±±¥¹œˆ€ü€‰¡•­•ˆ€è€ˆ‰ôø¥¹…°9Q@ƒŠP…±°Õ¹±…¥µ•ÁÉ¥é•Ì‰Õ¥±Ñ¡”•Ù•¹Ðµ•¹‘¥¹œ©…­Á½Ðð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰¹ÑÁ)…­Á½Ñ5½‘”ˆÙ…±Õ”ô‰É½±±¥¹œˆ€‘í\¹•Ù•¹Ð¹¹ÑÁ)…­Á½Ñ5½‘”€ôôô€‰É½±±¥¹œˆ€ü€‰¡•­•ˆ€è€ˆ‰ôøI½±±¥¹œƒŠP…ÉÉäÑ¼Ñ¡”¹•áÐ9Q@…¹É•Í•ÐÝ¡•¸Ý½¸ð½±…‰•°øð½‘¥Øù€€è€ˆ‰ôñÍµ…±°±…ÍÌô‰¹ÑÁ)…­Á½Ñ!•±Àˆù¡½½Í”„‰¥œ™¥¹…°µ¡½±”©…­Á½Ð½È„É½±±¥¹œ©…­Á½ÐÑ¡É½Õ Ñ¡”•Ù•¹Ð¸ð½Íµ…±°øð½‘¥Øù€€è€ˆ‰ôð½‘¥ØøñÍÁ…¸±…ÍÌô‰Ñ…œˆø‘íŒ¹Ñ…ôð½ÍÁ…¸øð½‘¥Øøð½‘¥Øù€ì(€€€€€€€ô¤(€€€€€€€€¹©½¥¸ ˆˆ¥õ€ì(€€€€ ‰m‘…Ñ„µ½µÁtˆ¤¹™½É…  (€€€€€€¡à¤€ôø(€€€€€€€€¡à¹½¹¡…¹”€ô€ ¤€ôøì(€€€€€€€€€à¹¡•­•(€€€€€€€€€€€€ü\¹½µÁ•Ñ¥Ñ¥½¹Ì¹…‘¡à¹‘…Ñ…Í•Ð¹½µÀ¤(€€€€€€€€€€€€è\¹½µÁ•Ñ¥Ñ¥½¹Ì¹‘•±•Ñ”¡à¹‘…Ñ…Í•Ð¹½µÀ¤ì(€€€€€€€€€¥˜€¡à¹¡•­•€˜˜€…½µÁ•Ñ¥Ñ¥½¹9••‘ÍÙ•ÉåM•±•Ñ•‘…ä¡à¹‘…Ñ…Í•Ð¹½µÀ±\¹•Ù•¹Ð¤¤ì(€€€€€€€€€€€\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÌñðôíôì(€€€€€€€€€€€\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍmà¹‘…Ñ…Í•Ð¹½µÁt€ô½µÁ•Ñ¥Ñ¥½¹½µÁ…Ñ¥‰±•…åÌ¡à¹‘…Ñ…Í•Ð¹½µÀ±\¹•Ù•¹Ð¤ì(€€€€€€€€€ô(€€€€€€€€€¥˜€¡à¹¡•­•€˜˜à¹‘…Ñ…Í•Ð¹½µÀ€ôôô€‰å•±±½Ý	…±°ˆ¤(€€€€€€€€€€€\¹•Ù•¹Ð¹å•±±½Ý	…±±…åÌ€ô•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤ì(€€€€€€€€€¥˜€¡à¹¡•­•€˜˜à¹‘…Ñ…Í•Ð¹½µÀ€ôôô€‰•±•Ñ¥Œˆ¤ì(€€€€€€€€€€€\¹•Ù•¹Ð¹•±•Ñ¥½ÕÉÍ•%‘Ì€ô•±•Ñ¥½ÕÉÍ•É½ÕÁÌ¡\¹•Ù•¹Ð¤¹µ…À ¡É½ÕÀ¤€ôøÉ½ÕÀ¹­•ä¤ì(€€€€€€€€€€€Íå¹±•Ñ¥½µÁ•Ñ¥Ñ¥½¹…åÌ¡\¹•Ù•¹Ð¤ì(€€€€€€€€€ô(€€€€€€€€€¥˜€¡à¹¡•­•€˜˜à¹‘…Ñ…Í•Ð¹½µÀ€ôôô€‰…µ‰É½Í”ˆ¤ì(€€€€€€€€€€€¥˜€¡\¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä¤\¹½µÁ•Ñ¥Ñ¥½¹Ì€ô¹•ÜM•Ð¡l‰…µ‰É½Í”‰t¤ì(€€€€€€€€€€€\¹•Ù•¹Ð¹…µ‰É½Í•M½É¥¹5½‘”€ô\¹•Ù•¹Ð¹…µ‰É½Í•M½É¥¹5½‘”ñð€‰Í½É•É=¹±äˆì(€€€€€€€€€€€\¹•Ù•¹Ð¹…µ‰É½Í•5¥¹¥µÕµÉ¥Ù•Ì€ô€­\¹•Ù•¹Ð¹…µ‰É½Í•5¥¹¥µÕµÉ¥Ù•Ìñð€Ìì(€€€€€€€€€€€\¹•Ù•¹Ð¹¹ÑÁ…äÅ½Õ¹Ð€ô€Àì(€€€€€€€€€€€\¹•Ù•¹Ð¹¹ÑÁ…äÉ½Õ¹Ð€ô€Àì(€€€€€€€€€ô(€€€€€€€€€É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ m‘…Ñ„µÍ½É¥¹µ•Ñ¡½‘tœ¤¹™½É… ¡¡½¥”€ôø¡½¥”¹½¹¡…¹”€ô€ ¤€ôøì(€€€€€¥˜€ …¡½¥”¹¡•­•¤É•ÑÕÉ¸É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€€€\¹•Ù•¹Ð¹Í½É¥¹5•Ñ¡½‘Íl‰‘…äˆ€¬¡½¥”¹‘…Ñ…Í•Ð¹Í½É¥¹µ•Ñ¡½‘t€ô¡½¥”¹Ù…±Õ”ì(€€€€€½¹ÍÐ‘…ä€ô€­¡½¥”¹‘…Ñ…Í•Ð¹Í½É¥¹µ•Ñ¡½ì(€€€€€l¸¸¹\¹½µÁ•Ñ¥Ñ¥½¹Ít¹™½É… ¡¥€ôøì(€€€€€€€¥˜€ …½µÁ•Ñ¥Ñ¥½¹…åÌ¡¥±\¹•Ù•¹Ð¤¹¥¹±Õ‘•Ì¡‘…ä¤ñð™¥¹…±M½É•½µÁ•Ñ¥Ñ¥½¹±±½Ý•¡¥±¡½¥”¹Ù…±Õ”¤¤É•ÑÕÉ¸ì(€€€€€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹9••‘ÍÙ•ÉåM•±•Ñ•‘…ä¡¥±\¹•Ù•¹Ð¤¤ì(€€€€€€€€€\¹½µÁ•Ñ¥Ñ¥½¹Ì¹‘•±•Ñ”¡¥¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ô(€€€€€€€\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÌñðôíôì(€€€€€€€\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍm¥‘t€ô½µÁ•Ñ¥Ñ¥½¹…åÌ¡¥±\¹•Ù•¹Ð¤¹™¥±Ñ•È¡Í•±•Ñ•‘…ä€ôøÍ•±•Ñ•‘…ä€„ôô‘…ä¤ì(€€€€€€€¥˜€ …\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍm¥‘t¹±•¹Ñ ¤\¹½µÁ•Ñ¥Ñ¥½¹Ì¹‘•±•Ñ”¡¥¤ì(€€€€€ô¤ì(€€€€€É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€ô¤ì(€€€€ m¹…µ”ô‰Á±…¹±Ñ•É¹…Ñ¥Ù•M½É¥¹œ‰tœ¤¹™½É… ¡¡½¥”€ôø¡½¥”¹½¹¡…¹”€ô€ ¤€ôøì(€€€€€\¹•Ù•¹Ð¹Á±…¹±Ñ•É¹…Ñ¥Ù•M½É¥¹œ€ô¡½¥”¹Ù…±Õ”€ôôô€‰å•Ìˆì(€€€€€¥˜€ …\¹•Ù•¹Ð¹Á±…¹±Ñ•É¹…Ñ¥Ù•M½É¥¹œ¤(€€€€€€€•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤¹™½É… ¡‘…ä€ôø\¹•Ù•¹Ð¹Í½É¥¹5•Ñ¡½‘Íl‰‘…äˆ€¬‘…åt€ô€‰¡½±•	å!½±”ˆ¤ì(€€€€€É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€ô¤ì(€€€€ ‰m‘…Ñ„µ‰•¹•™¥Ñtˆ¤¹™½É…  (€€€€€€¡à¤€ôø(€€€€€€€€¡à¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€\¹‰•¹•™¥Ñ=Á•¸¹¡…Ì¡à¹‘…Ñ…Í•Ð¹‰•¹•™¥Ð¤(€€€€€€€€€€€€ü\¹‰•¹•™¥Ñ=Á•¸¹‘•±•Ñ”¡à¹‘…Ñ…Í•Ð¹‰•¹•™¥Ð¤(€€€€€€€€€€€€è\¹‰•¹•™¥Ñ=Á•¸¹…‘¡à¹‘…Ñ…Í•Ð¹‰•¹•™¥Ð¤ì(€€€€€€€€€É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€½¹ÍÐ…µ‰É½Í•½µÀ€ô€ m‘…Ñ„µ½µÀô‰…µ‰É½Í”‰tœ¤ü¹±½Í•ÍÐ ˆ¹½µÀˆ¤ì(€€€¥˜€¡…µ‰É½Í•½µÀ€˜˜\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰…µ‰É½Í”ˆ¤¤(€€€€€…µ‰É½Í•½µÀ¹¥¹Í•ÉÑ‘©…•¹Ñ!Q50 (€€€€€€€€‰‰•™½É••¹ˆ°(€€€€€€€€ñ‘¥Ø±…ÍÌô‰¹ÑÁ	½à…µ‰É½Í•M•ÑÕÀˆøñˆùµ‰É½Í”M½É¥¹œð½ˆøñÍµ…±°ùÙ•ÉäÑ•…´¡…Ì½¹”Í½É•È¸¡½½Í”Ý¡•Ñ¡•È•Ù•ÉäÑ•…´…±Í¼¡…Ì„¡•­¥¹œµ…É­•È½¸Ñ¡”É½ÕÁÌ€™…µÀìQ•…µÌÁ…”¸ð½Íµ…±°øñ‘¥Ø±…ÍÌô‰…µ‰É½Í•9ÑÁ¡½¥”ˆøñˆù9•…É•ÍÐÑ¡”A¥¸¡½±•Ìð½ˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰…µ‰É½Í•9ÑÁ½Õ¹ÐˆÙ…±Õ”ôˆÀˆ€‘ì…\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰¹ÑÀˆ¤€ü€‰¡•­•ˆ€è€ˆ‰ôø9½¹”ð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰…µ‰É½Í•9ÑÁ½Õ¹ÐˆÙ…±Õ”ôˆÄˆ€‘í\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰¹ÑÀˆ¤€˜˜€­\¹•Ù•¹Ð¹¹ÑÁ…äÅ½Õ¹Ð€ôôô€Ä€ü€‰¡•­•ˆ€è€ˆ‰ôø=¹”ð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰…µ‰É½Í•9ÑÁ½Õ¹ÐˆÙ…±Õ”ôˆÈˆ€‘í\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰¹ÑÀˆ¤€˜˜€­\¹•Ù•¹Ð¹¹ÑÁ…äÅ½Õ¹Ð€ôôô€È€ü€‰¡•­•ˆ€è€ˆ‰ôøQÝ¼ð½±…‰•°øñÍµ…±°ùQ¡”…ÁÀÍ•±•ÑÌÍÕ¥Ñ…‰±”A…È€Ì¡½±•Ì…ÕÑ½µ…Ñ¥…±±ä¸e½Ô…¸¡…¹”Ñ¡•´½¸Ñ¡”9Q@Á…”¸ð½Íµ…±°øð½‘¥Øøð½‘¥Øù€°(€€€€€€¤ì(€€€½¹ÍÐÍÉ…Ñ¡½µÀ€ô€ m‘…Ñ„µ½µÀô‰ÍÉ…Ñ ‰tœ¤ü¹±½Í•ÍÐ ˆ¹½µÀˆ¤ì(€€€½¹ÍÐÍÑÉ½­•½µÀ€ô€ m‘…Ñ„µ½µÀô‰ÍÑÉ½­”‰tœ¤ü¹±½Í•ÍÐ ˆ¹½µÀˆ¤ì(€€€¥˜€¡ÍÑÉ½­•½µÀ€˜˜\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰ÍÑÉ½­”ˆ¤¤ì(€€€€€½¹ÍÐÍÑÉ½­•…åÌ€ô½µÁ•Ñ¥Ñ¥½¹…åÌ ‰ÍÑÉ½­”ˆ°\¹•Ù•¹Ð¤°Ñ½Ñ…°€ôÍÑÉ½­•…åÌ¹±•¹Ñ °‰•ÍÐ€ô5…Ñ ¹µ…à Ä°Ñ½Ñ…°€´€Ä¤ì(€€€€€ÍÑÉ½­•½µÀ¹¥¹Í•ÉÑ‘©…•¹Ñ!Q50 ‰‰•™½É••¹ˆ°€ñ‘¥Ø±…ÍÌô‰¹ÑÁ	½àÍÑÉ½­•M•ÑÕÁ	½àˆøñÍ•Ñ¥½¸øñˆùMÑÉ½­”I•ÍÕ±Ðð½ˆøñÍÑÉ½¹œù9•Ð½¹±äð½ÍÑÉ½¹œøñÍµ…±°ùÉ½ÍÌÍ½É¥¹œ¥Ì…Ù…¥±…‰±”…Ì„Í•Á…É…Ñ”MÉ…Ñ ½µÁ•Ñ¥Ñ¥½¸¸ð½Íµ…±°øð½Í•Ñ¥½¸øñÍ•Ñ¥½¸øñˆù5…á¥µÕ´Í½É”½¸„¡½±”ð½ˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÍÑÉ½­•M½É¥¹5½‘”ˆÙ…±Õ”ô‰…±±MÑÉ½­•Ìˆ€‘í\¹•Ù•¹Ð¹ÍÑÉ½­•M½É¥¹5½‘”ôôô‰…±±MÑÉ½­•Ìˆü‰¡•­•ˆèˆ‰ôø±°MÑÉ½­•Ì½Õ¹Ðð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÍÑÉ½­•M½É¥¹5½‘”ˆÙ…±Õ”ô‰µ…á½Õ‰±•	½•äˆ€‘í\¹•Ù•¹Ð¹ÍÑÉ½­•M½É¥¹5½‘”ôôô‰µ…á½Õ‰±•	½•äˆü‰¡•­•ˆèˆ‰ôø5…á¥µÕ´½Õ‰±”	½•äð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÍÑÉ½­•M½É¥¹5½‘”ˆÙ…±Õ”ô‰µ…áQÉ¥Á±•	½•äˆ€‘í\¹•Ù•¹Ð¹ÍÑÉ½­•M½É¥¹5½‘”ôôô‰µ…áQÉ¥Á±•	½•äˆü‰¡•­•ˆèˆ‰ôø5…á¥µÕ´QÉ¥Á±”	½•äð½±…‰•°øð½Í•Ñ¥½¸øñÍ•Ñ¥½¸øñˆù½Õ¹Ñ¥¹œM½É•Ìð½ˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰¡•­‰½àˆ¹…µ”ô‰ÍÑÉ½­•…¥±åI•ÍÕ±ÑÌˆ€‘í\¹•Ù•¹Ð¹ÍÑÉ½­•…¥±åI•ÍÕ±ÑÌü‰¡•­•ˆèˆ‰ôø…¥±äÁÉ¥é”ƒŠP•… Í•±•Ñ•‘…äð½±…‰•°ø‘íÑ½Ñ…°€ø€Ä€ü€ñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰¡•­‰½àˆ¹…µ”ô‰ÍÑÉ½­•É•…Ñ•¹…‰±•ˆ€‘í\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•¹…‰±•ü‰¡•­•ˆèˆ‰ôø=Ù•É…±°•Ù•¹ÐÁÉ¥é”ð½±…‰•°øñ‘¥Ø±…ÍÌô‰ÍÑÉ½­•É•…Ñ•¡½¥•Ì€‘í\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•¹…‰±•üˆˆè‰¥¹…Ñ¥Ù”‰ôˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÍÑÉ½­•É•…Ñ•5½‘”ˆÙ…±Õ”ô‰…É•…Ñ”ˆ€‘í\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•5½‘”„ôô‰‰•ÍÑÉ•…Ñ”ˆü‰¡•­•ˆèˆ‰ô€‘í\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•¹…‰±•üˆˆè‰‘¥Í…‰±•‰ôø±°€‘íÑ½Ñ…±ôÉ½Õ¹‘Ì½Õ¹Ðð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÍÑÉ½­•É•…Ñ•5½‘”ˆÙ…±Õ”ô‰‰•ÍÑÉ•…Ñ”ˆ€‘í\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•5½‘”ôôô‰‰•ÍÑÉ•…Ñ”ˆü‰¡•­•ˆèˆ‰ô€‘í\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•¹…‰±•üˆˆè‰‘¥Í…‰±•‰ôø	•ÍÐ€‘í‰•ÍÑô½˜€‘íÑ½Ñ…±ôÉ½Õ¹‘Ìð½±…‰•°øð½‘¥Øù€€è€ˆ‰ôð½Í•Ñ¥½¸øñÍµ…±°ù…¥±ä…¹½Ù•É…±°MÑÉ½­”ÁÉ¥é•Ì…¸ÉÕ¸Ñ½•Ñ¡•È¸]¥Ñ ¥¹…°µÍ½É”•¹ÑÉä°Ñ¡”…‘‘¥”½È½™™¥¥…°…ÉµÕÍÐÍÕÁÁ±äÑ¡”…±É•…‘äµ…ÁÁ•½µÁ•Ñ¥Ñ¥½¸Ñ½Ñ…°¸ð½Íµ…±°øð½‘¥Øù€¤ì(€€€ô(€€€¥˜€¡ÍÉ…Ñ¡½µÀ€˜˜\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰ÍÉ…Ñ ˆ¤¤(€€€€€ÍÉ…Ñ¡½µÀ¹¥¹Í•ÉÑ‘©…•¹Ñ!Q50 (€€€€€€€€‰‰•™½É••¹ˆ°(€€€€€€€€ñ‘¥Ø±…ÍÌô‰¹ÑÁ	½àÍÉ…Ñ¡1¥µ¥Ñ	½àˆøñ±…‰•°øñˆùM•Ð5…àMÉ…Ñ !Àð½ˆøñ¥¹ÁÕÐ¥ô‰ÍÉ…Ñ¡5…á!ÀˆÑåÁ”ô‰¹Õµ‰•ÈˆÍÑ•ÀôˆÄˆÙ…±Õ”ôˆ‘í\¹•Ù•¹Ð¹ÍÉ…Ñ¡5…á!Áôˆøð½±…‰•°øñÍµ…±°ùA±…å•ÉÌÝ¥Ñ „‘…¥±ä¡…¹‘¥…À½˜€‘í\¹•Ù•¹Ð¹ÍÉ…Ñ¡5…á!Áô½È±•ÍÌ…É”¥¹±Õ‘•…ÕÑ½µ…Ñ¥…±±ä¸A±…å•ÉÌ…‰½Ù”€‘í\¹•Ù•¹Ð¹ÍÉ…Ñ¡5…á!Áô…É”¹½Ð¥¹±Õ‘•¸ð½Íµ…±°øñ‘¥Ø±…ÍÌô‰ÍÉ…Ñ¡M½É¥¹5½‘”ˆøñˆùMÉ…Ñ M½É¥¹œð½ˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÍÉ…Ñ¡M½É¥¹5½‘”ˆÙ…±Õ”ô‰ÍÑÉ½­”ˆ€‘í\¹•Ù•¹Ð¹ÍÉ…Ñ¡M½É¥¹5½‘”€„ôô€‰µ…á½Õ‰±•	½•äˆ€ü€‰¡•­•ˆ€è€ˆ‰ôøAÕÉ”MÑÉ½­”ƒŠP•Ù•ÉäÍÑÉ½­”½Õ¹ÑÌì„@Ý¥Ñ¡‘É…ÝÌÑ¡”Á±…å•È™É½´MÉ…Ñ ð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÍÉ…Ñ¡M½É¥¹5½‘”ˆÙ…±Õ”ô‰µ…á½Õ‰±•	½•äˆ€‘í\¹•Ù•¹Ð¹ÍÉ…Ñ¡M½É¥¹5½‘”€ôôô€‰µ…á½Õ‰±•	½•äˆ€ü€‰¡•­•ˆ€è€ˆ‰ôø5…á¥µÕ´½Õ‰±”	½•äƒŠPÑ¡”¡¥¡•ÍÐÍ½É”¥Ì€È½Ù•ÈÁ…Èì„@É•½É‘Ì€È½Ù•ÈÁ…Èð½±…‰•°øð½‘¥Øøð½‘¥Øù€°(€€€€€€¤ì(€€€½¹ÍÐ¹ÑÁ½µÀ€ô€ m‘…Ñ„µ½µÀô‰¹ÑÀ‰tœ¤ü¹±½Í•ÍÐ ˆ¹½µÀˆ¤ì(€€€¥˜€¡¹ÑÁ½µÀ€˜˜\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰¹ÑÀˆ¤€˜˜\¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä¤(€€€€€¹ÑÁ½µÀ¹¥¹Í•ÉÑ‘©…•¹Ñ!Q50 (€€€€€€€€‰‰•™½É••¹ˆ°(€€€€€€€€ñ‘¥Ø±…ÍÌô‰¹ÑÁ	½àˆøñˆù9Õµ‰•È½˜9QAÌð½ˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰¸ÄˆÙ…±Õ”ôˆÄˆ€‘í\¹•Ù•¹Ð¹¹ÑÁ…äÅ½Õ¹Ð€„ô€È€ü€‰¡•­•ˆ€è€ˆ‰ôø=¹”ð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰¸ÄˆÙ…±Õ”ôˆÈˆ€‘í\¹•Ù•¹Ð¹¹ÑÁ…äÅ½Õ¹Ð€ôô€È€ü€‰¡•­•ˆ€è€ˆ‰ôøQÝ¼ð½±…‰•°øð½‘¥Øù€°(€€€€€€¤ì(€€€¥˜€¡\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰…ÁQ•…µÌˆ¤¤ì(€€€€€½¹ÍÐ¥‘Ì€ôl¸¸¹¹•ÜM•Ð¡•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤¹™±…Ñ5…À¡Ý¥é…É‘A±…¹¹¥¹A±…å•ÉÌ¤¥t¹™¥±Ñ•È¡¥€ôø¥€„ôô9=}AIQ9I}%¤ì(€€€€€€ m‘…Ñ„µ½µÀô‰…ÁQ•…µÌ‰tœ¤ü¹±½Í•ÍÐ ˆ¹½µÀˆ¤ü¹¥¹Í•ÉÑ‘©…•¹Ñ!Q50 ‰‰•™½É••¹ˆ°…ÁQ•…µÍ!Ñµ°¡\¹•Ù•¹Ð°¥‘Ì¤¤ì(€€€€€‰¥¹‘…ÁQ•…µÌ¡\¹•Ù•¹Ð°¥‘Ì°É•¹‘•ÉMÑ•ÀÌ¤ì(€€€ô(€€€¥˜€¡ÍÉ…Ñ¡½µÀ€˜˜\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰ÍÉ…Ñ ˆ¤¤ÍÉ…Ñ¡½µÀ¹¥¹Í•ÉÑ‘©…•¹Ñ!Q50 ‰‰•™½É••¹ˆ°€ñ‘¥Ø±…ÍÌô‰¹ÑÁ	½àˆøñˆùMÉ…Ñ ½Éµ…Ðð½ˆøñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÍÉ…Ñ¡½Éµ…ÐˆÙ…±Õ”ô‰‘…¥±äˆ€‘ì…l‰…É•…Ñ”ˆ°€‰‰•ÍÑÉ•…Ñ”‰t¹¥¹±Õ‘•Ì¡\¹•Ù•¹Ð¹ÍÉ…Ñ¡½Éµ…Ð¤€ü€‰¡•­•ˆ€è€ˆ‰ôø…¥±äð½±…‰•°ø‘í\¹•Ù•¹Ð¹‘…åÌ€ø€Ä€ü€ñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÍÉ…Ñ¡½Éµ…ÐˆÙ…±Õ”ô‰…É•…Ñ”ˆ€‘í\¹•Ù•¹Ð¹ÍÉ…Ñ¡½Éµ…Ð€ôôô€‰…É•…Ñ”ˆ€ü€‰¡•­•ˆ€è€ˆ‰ôøM½É”½Ù•È™Õ±°•Ù•¹ÐƒŠP…±°€‘í\¹•Ù•¹Ð¹‘…åÍôÉ½Õ¹‘Ìð½±…‰•°øñ±…‰•°øñ¥¹ÁÕÐÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆÑåÁ”ô‰É…‘¥¼ˆ¹…µ”ô‰ÍÉ…Ñ¡½Éµ…ÐˆÙ…±Õ”ô‰‰•ÍÑÉ•…Ñ”ˆ€‘í\¹•Ù•¹Ð¹ÍÉ…Ñ¡½Éµ…Ð€ôôô€‰‰•ÍÑÉ•…Ñ”ˆ€ü€‰¡•­•ˆ€è€ˆ‰ôøM½É”‰•ÍÐ€‘í5…Ñ ¹µ…à Ä°\¹•Ù•¹Ð¹‘…åÌ€´€Ä¥ô½˜€‘í\¹•Ù•¹Ð¹‘…åÍôÉ½Õ¹‘Ìð½±…‰•°øñÀ±…ÍÌô‰¡¥¹Ðˆù	•ÍÐÉ½Õ¹‘Ì‘É½ÁÌ½¹”É½Õ¹¸µ¥ÍÍ•É½Õ¹½ÈÁ¥¬µÕÀ…¸‰”‘É½ÁÁ•ìÑ¡”É•ÅÕ¥É•¹Õµ‰•È½˜ÅÕ…±¥™å¥¹œ½µÁ±•Ñ•É½Õ¹‘ÌµÕÍÐÍÑ¥±°‰”Á±…å•¸ð½Àù€€è€ˆ‰ôð½‘¥Øù€¤ì(€€€¥˜€¡¹ÑÁ½µÀ€˜˜\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰¹ÑÀˆ¤€˜˜\¹•Ù•¹Ð¹‘…åÌ€ø€Ä¤¹ÑÁ½µÀ¹¥¹Í•ÉÑ‘©…•¹Ñ!Q50 ‰‰•™½É••¹ˆ°±…ÍÑ…å9ÑÁ!Ñµ°¡\¹•Ù•¹Ð¤¤ì(€€€€ ˆÝ¥é…É‘	½‘äˆ¤¹½¹¡…¹”€ô€¡”¤€ôøì(€€€€€±•ÐÐ€ô”¹Ñ…É•Ð°(€€€€€€€¥€ô(€€€€€€€€€Ð¹‘…Ñ…Í•Ð¹‰É•Ý…Éñð(€€€€€€€€€Ð¹‘…Ñ…Í•Ð¹‰µ½‘”ñð(€€€€€€€€€Ð¹‘…Ñ…Í•Ð¹‰‰…±±Ìñð(€€€€€€€€€Ð¹‘…Ñ…Í•Ð¹‰½¹ÑÉ¥ˆñð(€€€€€€€€€Ð¹‘…Ñ…Í•Ð¹‰Á±ÕÌñð(€€€€€€€€€Ð¹‘…Ñ…Í•Ð¹‰•áÑÉ„ì(€€€€€¥˜€¡Ð¹‘…Ñ…Í•Ð¹½µÁ‘…äñðÐ¹‘…Ñ…Í•Ð¹½µÁ…±±‘…åÌ¤ì(€€€€€€€½¹ÍÐm¥°É…Ý…åt€ô€¡Ð¹‘…Ñ…Í•Ð¹½µÁ‘…äñðÐ¹‘…Ñ…Í•Ð¹½µÁ…±±‘…åÌ¤¹ÍÁ±¥Ð ‰ðˆ¤ì(€€€€€€€\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÌñðôíôì(€€€€€€€½¹ÍÐÍ•±•Ñ•€ô¹•ÜM•Ð¡½µÁ•Ñ¥Ñ¥½¹…åÌ¡¥°\¹•Ù•¹Ð¤¤ì(€€€€€€€¥˜€¡Ð¹‘…Ñ…Í•Ð¹½µÁ…±±‘…åÌ¤ì(€€€€€€€€€¥˜€ …Ð¹¡•­•¤ìÐ¹¡•­•€ôÑÉÕ”ìÉ•ÑÕÉ¸ìô(€€€€€€€€€\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍm¥‘t€ô•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤ì(€€€€€€€ô•±Í”ì(€€€€€€€€€Ð¹¡•­•€üÍ•±•Ñ•¹…‘ ­É…Ý…ä¤€èÍ•±•Ñ•¹‘•±•Ñ” ­É…Ý…ä¤ì(€€€€€€€€€¥˜€ …Í•±•Ñ•¹Í¥é”¤ìÐ¹¡•­•õÑÉÕ”ìÉ•ÑÕÉ¸…±•ÉÐ ‰M•±•Ð…Ð±•…ÍÐ½¹”Á±…å¥¹œ‘…ä°½ÈÕ¹Ñ¥¬Ñ¡”½µÁ•Ñ¥Ñ¥½¸…‰½Ù”¸ˆ¤ìô(€€€€€€€€€\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍm¥‘t€ôl¸¸¹Í•±•Ñ•‘t¹Í½ÉÐ ¡„±ˆ¤ôù„µˆ¤ì(€€€€€€€ô(€€€€€€€¥˜€¡¥€ôôô€‰å•±±½Ý	…±°ˆ¤\¹•Ù•¹Ð¹å•±±½Ý	…±±…åÌ€ôl¸¸¹\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍm¥‘utì(€€€€€€€¥˜€¡¥€ôôô€‰½µ‰¥¹•ˆ¤\¹•Ù•¹Ð¹ÍÑ…‰±•™½É‘½Õ¹Ñ¥¹I½Õ¹‘Ì€ô5…Ñ ¹µ¥¸ ­\¹•Ù•¹Ð¹ÍÑ…‰±•™½É‘½Õ¹Ñ¥¹I½Õ¹‘ÌñðÍ•±•Ñ•¹Í¥é”°\¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍm¥‘t¹±•¹Ñ ¤ì(€€€€€€€É•¹‘•ÉMÑ•ÀÌ ¤ìÉ•ÑÕÉ¸ì(€€€€€ô(€€€€€¥˜€¡Ð¹¥€ôôô€‰ÍÑ…‰±•™½É‘½Õ¹Ñ¥¹I½Õ¹‘Ìˆ¤\¹•Ù•¹Ð¹ÍÑ…‰±•™½É‘½Õ¹Ñ¥¹I½Õ¹‘Ì€ô€­Ð¹Ù…±Õ”ì(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰Í¥¹±•½Éµ…Ðˆ¤ì\¹•Ù•¹Ð¹Í¥¹±•MÑ…‰±•™½É‘½Éµ…Ð€ôÐ¹Ù…±Õ”ìÉ•¹‘•ÉMÑ•ÀÌ ¤ìÉ•ÑÕÉ¸ìô(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰ÁÕÑÑ¥¹½Éµ…Ðˆ¤\¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€ôÐ¹Ù…±Õ”ì(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰ÍÉ…Ñ¡M½É¥¹5½‘”ˆ¤(€€€€€€€\¹•Ù•¹Ð¹ÍÉ…Ñ¡M½É¥¹5½‘”€ôÐ¹Ù…±Õ”ì(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰ÍÑÉ½­•M½É¥¹5½‘”ˆ¤ì\¹•Ù•¹Ð¹ÍÑÉ½­•M½É¥¹5½‘”€ôÐ¹Ù…±Õ”ìÉ•¹‘•ÉMÑ•ÀÌ ¤ìÉ•ÑÕÉ¸ìô(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰ÍÑÉ½­•…¥±åI•ÍÕ±ÑÌˆ¤ì(€€€€€€€¥˜€ …Ð¹¡•­•€˜˜€…\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•¹…‰±•¤ìÐ¹¡•­•€ôÑÉÕ”ìÉ•ÑÕÉ¸…±•ÉÐ ‰-••À…Ð±•…ÍÐ½¹”MÑÉ½­”ÁÉ¥é”Í•±•Ñ•¸ˆ¤ìô(€€€€€€€\¹•Ù•¹Ð¹ÍÑÉ½­•…¥±åI•ÍÕ±ÑÌ€ôÐ¹¡•­•ìÉ•¹‘•ÉMÑ•ÀÌ ¤ìÉ•ÑÕÉ¸ì(€€€€€ô(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰ÍÑÉ½­•É•…Ñ•¹…‰±•ˆ¤ì(€€€€€€€¥˜€ …Ð¹¡•­•€˜˜€…\¹•Ù•¹Ð¹ÍÑÉ½­•…¥±åI•ÍÕ±ÑÌ¤ìÐ¹¡•­•€ôÑÉÕ”ìÉ•ÑÕÉ¸…±•ÉÐ ‰-••À…Ð±•…ÍÐ½¹”MÑÉ½­”ÁÉ¥é”Í•±•Ñ•¸ˆ¤ìô(€€€€€€€\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•¹…‰±•€ôÐ¹¡•­•ìÉ•¹‘•ÉMÑ•ÀÌ ¤ìÉ•ÑÕÉ¸ì(€€€€€ô(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰ÍÑÉ½­•É•…Ñ•5½‘”ˆ¤ì\¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•5½‘”€ôÐ¹Ù…±Õ”ìÉ•¹‘•ÉMÑ•ÀÌ ¤ìÉ•ÑÕÉ¸ìô(€€€€€¥˜€¡Ð¹‘…Ñ…Í•Ð¹•±•Ñ¥½ÕÉÍ”¤ì(€€€€€€€½¹ÍÐÍ•±•Ñ•€ô¹•ÜM•Ð¡Í•±•Ñ•‘±•Ñ¥É½ÕÁÌ¡\¹•Ù•¹Ð¤¹µ…À ¡É½ÕÀ¤€ôøÉ½ÕÀ¹­•ä¤¤ì(€€€€€€€Ð¹¡•­•€üÍ•±•Ñ•¹…‘¡Ð¹‘…Ñ…Í•Ð¹•±•Ñ¥½ÕÉÍ”¤€èÍ•±•Ñ•¹‘•±•Ñ”¡Ð¹‘…Ñ…Í•Ð¹•±•Ñ¥½ÕÉÍ”¤ì(€€€€€€€¥˜€ …Í•±•Ñ•¹Í¥é”¤ì(€€€€€€€€€Í•±•Ñ•¹…‘¡Ð¹‘…Ñ…Í•Ð¹•±•Ñ¥½ÕÉÍ”¤ì(€€€€€€€€€Ð¹¡•­•€ôÑÉÕ”ì(€€€€€€€€€É•ÑÕÉ¸…±•ÉÐ ‰M•±•Ð…Ð±•…ÍÐ½¹”É•Á•…Ñ•½ÕÉÍ”™½È±•Ñ¥Œ°½ÈÕ¹Ñ¥¬±•Ñ¥Œ…‰½Ù”¸ˆ¤ì(€€€€€€€ô(€€€€€€€\¹•Ù•¹Ð¹•±•Ñ¥½ÕÉÍ•%‘Ì€ôl¸¸¹Í•±•Ñ•‘tì(€€€€€€€Íå¹±•Ñ¥½µÁ•Ñ¥Ñ¥½¹…åÌ¡\¹•Ù•¹Ð¤ì(€€€€€€€É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰…µ‰É½Í•M½É¥¹5½‘”ˆ¤\¹•Ù•¹Ð¹…µ‰É½Í•M½É¥¹5½‘”€ôÐ¹Ù…±Õ”ì(€€€€€¥˜€¡Ð¹¥€ôôô€‰…µ‰É½Í•5¥¹¥µÕµÉ¥Ù•Ìˆ¤(€€€€€€€\¹•Ù•¹Ð¹…µ‰É½Í•5¥¹¥µÕµÉ¥Ù•Ì€ô€­Ð¹Ù…±Õ”ì(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰…µ‰É½Í•9ÑÁ½Õ¹Ðˆ¤ì(€€€€€€€½¹ÍÐ½Õ¹Ð€ô€­Ð¹Ù…±Õ”ì(€€€€€€€¥˜€¡½Õ¹Ð¤\¹½µÁ•Ñ¥Ñ¥½¹Ì¹…‘ ‰¹ÑÀˆ¤ì(€€€€€€€•±Í”\¹½µÁ•Ñ¥Ñ¥½¹Ì¹‘•±•Ñ” ‰¹ÑÀˆ¤ì(€€€€€€€\¹•Ù•¹Ð¹¹ÑÁ…äÅ½Õ¹Ð€ô½Õ¹Ðì(€€€€€€€\¹•Ù•¹Ð¹¹ÑÁ…äÉ½Õ¹Ð€ô½Õ¹Ðì(€€€€€€€É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€€€ô(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰ÀÍ5½‘”ˆ¤ì\¹•Ù•¹Ð¹Á…ÈÍ5½‘”€ôÐ¹Ù…±Õ”ì\¹•Ù•¹Ð¹Á…ÈÍ½Éµ…Ð€ôÐ¹Ù…±Õ”€ôôô€‰½Ù•É…±±A…¥ÉÌˆ€ü€‰…É•…Ñ”ˆ€è€‰‘…¥±äˆìÉ•¹‘•ÉMÑ•ÀÌ ¤ìô(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰ÍÉ…Ñ¡½Éµ…Ðˆ¤ì\¹•Ù•¹Ð¹ÍÉ…Ñ¡½Éµ…Ð€ôÐ¹Ù…±Õ”ìÉ•¹‘•ÉMÑ•ÀÌ ¤ìô(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰±…ÍÑ…å9ÑÁ½Õ¹Ðˆ¤ì¥˜€ …½µÁ•Ñ¥Ñ¥½¹…åÌ ‰¹ÑÀˆ±\¹•Ù•¹Ð¤¹¥¹±Õ‘•Ì ­\¹•Ù•¹Ð¹‘…åÌ¤ñð€…lÄ°Ét¹¥¹±Õ‘•Ì ­Ð¹Ù…±Õ”¤¤É•ÑÕÉ¸ì\¹•Ù•¹Ð¹¹ÑÁ½Õ¹ÑÌñðôíôì\¹•Ù•¹Ð¹¹ÑÁ½Õ¹ÑÍl‰‘…äˆ€¬\¹•Ù•¹Ð¹‘…åÍt€ô€­Ð¹Ù…±Õ”ì¥˜€¡\¹•Ù•¹Ð¹‘…åÌ€ðô€È¤\¹•Ù•¹Ñl‰¹ÑÁ…äˆ€¬\¹•Ù•¹Ð¹‘…åÌ€¬€‰½Õ¹Ð‰t€ô€­Ð¹Ù…±Õ”ìô(€€€€€¥˜€¡Ð¹‘…Ñ…Í•Ð¹å•±±½Ý‰…±±‘…ä¤ì(€€€€€€€½¹ÍÐ‘…ä€ô€­Ð¹‘…Ñ…Í•Ð¹å•±±½Ý‰…±±‘…ä°(€€€€€€€€€Í•±•Ñ•‘…åÌ€ô¹•ÜM•Ð (€€€€€€€€€€€€¡\¹•Ù•¹Ð¹å•±±½Ý	…±±…åÌñðlÄ°€Ét¤¹µ…À¡9Õµ‰•È¤°(€€€€€€€€€€¤ì(€€€€€€€Ð¹¡•­•€üÍ•±•Ñ•‘…åÌ¹…‘¡‘…ä¤€èÍ•±•Ñ•‘…åÌ¹‘•±•Ñ”¡‘…ä¤ì(€€€€€€€¥˜€ …Í•±•Ñ•‘…åÌ¹Í¥é”¤ì(€€€€€€€€€Í•±•Ñ•‘…åÌ¹…‘¡‘…ä¤ì(€€€€€€€€€Ð¹¡•­•€ôÑÉÕ”ì(€€€€€€€€€…±•ÉÐ ‰e•±±½Ü	…±°µÕÍÐ‰”Á±…å•½¸…Ð±•…ÍÐ½¹”‘…ä¸ˆ¤ì(€€€€€€€ô(€€€€€€€\¹•Ù•¹Ð¹å•±±½Ý	…±±…åÌ€ôl¸¸¹Í•±•Ñ•‘…åÍt¹Í½ÉÐ ¤ì(€€€€€ô(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰¸Äˆ¤\¹•Ù•¹Ð¹¹ÑÁ…äÅ½Õ¹Ð€ô€­Ð¹Ù…±Õ”ì(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰¸Èˆ¤\¹•Ù•¹Ð¹¹ÑÁ…äÉ½Õ¹Ð€ô€­Ð¹Ù…±Õ”ì(€€€€€¥˜€¡Ð¹¥€ôôô€‰¹ÑÁ)…­Á½Ðˆ¤ì(€€€€€€€\¹•Ù•¹Ð¹¹ÑÁ)…­Á½Ð€ôÐ¹¡•­•ì(€€€€€€€É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€€€ô(€€€€€¥˜€¡Ð¹¹…µ”€ôôô€‰¹ÑÁ)…­Á½Ñ5½‘”ˆ¤\¹•Ù•¹Ð¹¹ÑÁ)…­Á½Ñ5½‘”€ôÐ¹Ù…±Õ”ì(€€€€€¥˜€¡Ð¹¥€ôôô€‰ÍÉ…Ñ¡5…á!Àˆ¤ì(€€€€€€€\¹•Ù•¹Ð¹ÍÉ…Ñ¡5…á!À€ô9Õµ‰•È¹¥Í¥¹¥Ñ” ­Ð¹Ù…±Õ”¤€ü€­Ð¹Ù…±Õ”€è€ÄÀì(€€€€€€€É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€€€ô(€€€€€¥˜€¡¥¤ì(€€€€€€€\¹‰•¹•™¥ÑÍm¥‘t€ô\¹‰•¹•™¥ÑÍm¥‘tñðíôì(€€€€€€€¥˜€¡Ð¹‘…Ñ…Í•Ð¹‰É•Ý…É¤\¹‰•¹•™¥ÑÍm¥‘t¹É•Ý…É‘¡½¥”€ôÐ¹Ù…±Õ”ì(€€€€€€€¥˜€¡Ð¹‘…Ñ…Í•Ð¹‰µ½‘”¤\¹‰•¹•™¥ÑÍm¥‘t¹µ½‘”€ôÐ¹Ù…±Õ”ì(€€€€€€€¥˜€¡Ð¹‘…Ñ…Í•Ð¹‰‰…±±Ì¤\¹‰•¹•™¥ÑÍm¥‘t¹‰…±±Ì€ô€­Ð¹Ù…±Õ”ñð€ˆˆì(€€€€€€€¥˜€¡Ð¹‘…Ñ…Í•Ð¹‰½¹ÑÉ¥ˆ¤\¹‰•¹•™¥ÑÍm¥‘t¹½¹ÑÉ¥‰ÕÑ¥½¸€ô€­Ð¹Ù…±Õ”ñð€ˆˆì(€€€€€€€¥˜€¡Ð¹‘…Ñ…Í•Ð¹‰Á±ÕÌ¤\¹‰•¹•™¥ÑÍm¥‘t¹Á±ÕÌ€ôÐ¹¡•­•ì(€€€€€€€¥˜€¡Ð¹‘…Ñ…Í•Ð¹‰•áÑÉ„¤\¹‰•¹•™¥ÑÍm¥‘t¹•áÑÉ„€ôÐ¹Ù…±Õ”ì(€€€€€€€\¹‰•¹•™¥Ñ=Á•¸¹…‘¡¥¤ì(€€€€€€€É•¹‘•ÉMÑ•ÀÌ ¤ì(€€€€€ô(€€€ôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉMÑ•ÀÐ ¤ì(€€€\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•Í	å…ä€ô\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•Í	å…äñðì(€€€€€‘…äÄè	½½±•…¸¡\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•Ì¤°(€€€€€‘…äÈè	½½±•…¸¡\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•Ì¤°(€€€ôì(€€€\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•…	å…ä€ô\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•…	å…äñðì(€€€€€‘…äÄè\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•„ñð€‰•¹•É…°ˆ°(€€€€€‘…äÈè\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•„ñð€‰•¹•É…°ˆ°(€€€ôì(€€€½¹ÍÐÁÕÑÑ¥¹œ€ô\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰Ñ•…µAÕÑÑÌˆ¤°(€€€€€‘•™…Õ±ÑIÕ±•Ì€ôÁÕÑÑ¥¹IÕ±•ÍQ•áÐ¡\¹•Ù•¹Ð¤ì(€€€½¹ÍÐÑáÐ€ô\¹•Ù•¹Ð¹ÁÕÑÑ¥¹IÕ±•ÍÕÍÑ½´ñð‘•™…Õ±ÑIÕ±•Ì°(€€€€€•‘¥Ñ¥¹œ€ô	½½±•…¸¡\¹•‘¥ÑAÕÑÑ¥¹IÕ±•Ì¤ì(€€€½¹ÍÐÁÉ•™•ÉÉ•‘…É€ô€¡‘…ä¤€ôøì(€€€€€½¹ÍÐ­•ä€ô‘…ä‘í‘…åõ€°(€€€€€€€ÁÉ•˜€ô	½½±•…¸¡\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•Í	å…åm­•åt¤°(€€€€€€€½ÕÉÍ•9…µ”€ô½ÕÉÍ”¡\¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤ü¹¹…µ”ì(€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰ÉÕ±•…ÉÁÉ•™•ÉÉ•‘…Éˆøñ Ðø‘í\¹•Ù•¹Ð¹‘…åÌ€ø€Ä€ü…ä€‘í‘…åôƒŠP€‘í•ÍŒ¡½ÕÉÍ•9…µ”ñð€‰½ÕÉÍ”ˆ¥õ€€è€‰AÉ•™•ÉÉ•1¥•Ì‰ôð½ Ðøñ‘¥Ø±…ÍÌô‰ÁÉ•™•ÉÉ•‘1¥¹”ˆøñ‘¥Ø±…ÍÌô‰ÁÉ•™•ÉÉ•‘MÑ…ÑÕÌ€‘íÁÉ•˜€ü€‰å•Ìˆ€è€ˆ‰ôˆø‘íÁÉ•˜€ü€‰e•Ìˆ€è€‰9¼‰ôð½‘¥Øøñ‘¥Ø±…ÍÌô‰ÁÉ•™•ÉÉ•‘•™…Õ±Ðˆø‘íÁÉ•˜€üAÉ•™•ÉÉ•±¥•Ì…É”¥¸ÕÍ”€‘í\¹•Ù•¹Ð¹‘…åÌ€ø€Ä€ü½¸…ä€‘í‘…åõ€€è€‰™½ÈÑ¡¥Ì•Ù•¹Ð‰ô¹€€è€‰A±…äÑ¡”‰…±°…Ì¥Ð±¥•Ì¸‰ôð½‘¥Øøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Í½™Ðˆ‘…Ñ„µ¡…¹”µÁÉ•™•ÉÉ•ôˆ‘í‘…åôˆù¡…¹”ð½‰ÕÑÑ½¸øð½‘¥Øø‘íÁÉ•˜€ü€ñ‘¥Ø±…ÍÌô‰ÁÉ•™É•„ˆøñ±…‰•°ùAÉ•™•ÉÉ•1¥•ÌÁÁ±äñÍ•±•Ð‘…Ñ„µÁÉ•˜µ…É•„ôˆ‘í‘…åôˆøñ½ÁÑ¥½¸Ù…±Õ”ô‰•¹•É…°ˆ€‘í\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•…	å…åm­•åt€ôôô€‰•¹•É…°ˆ€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôù%¸Ñ¡”•¹•É…°É•„ð½½ÁÑ¥½¸øñ½ÁÑ¥½¸Ù…±Õ”ô‰™…¥ÉÝ…äˆ€‘í\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•…	å…åm­•åt€ôôô€‰™…¥ÉÝ…äˆ€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôù=¸Ñ¡”±½Í•±äµ½Ý¸Á…ÉÐ½˜Ñ¡”½ÕÉÍ”ð½½ÁÑ¥½¸øð½Í•±•Ðøð½±…‰•°øð½‘¥Øù€€è€ˆ‰ôð½‘¥Øù€ì(€€€ôì(€€€€ ˆÝ¥é…É‘	½‘äˆ¤¹¥¹¹•É!Q50€ô(€€€€€€ñ‘¥Ø±…ÍÌô‰ÉÕ±•Í!•…½Á•É…Ñ¥½¹!•…ˆøñ‘¥Øøñ Ìù=Á•É…Ñ¥½¸ð½ ÌøñÀ±…ÍÌô‰¡¥¹Ðˆù!½ÜÑ¡”Í½É¥¹œ…ÉÝ½É­Ì‘ÕÉ¥¹œÁ±…ä¸ð½Àøð½‘¥ØøñÍÁ…¸±…ÍÌô‰ÉÕ±•Í	…‘”ˆùA@UMð½ÍÁ…¸øð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰ÉÕ±•…É½Á•É…Ñ¥½¹IÕ±•ÌˆøñÀùe½ÕÈÁ¡½¹”Ý¥±°É•Ñ…¥¸•Ù•ÉäÍ½É”å½Ô•¹Ñ•È‰ÕÐÑÉ…¹Íµ¥ÍÍ¥½¸½˜Ñ¡½Í”Í½É•ÌÑ¼Ñ¡”±•…‘•É‰½…Éµ…ä‰”‘•±…å•¸%˜å½ÕÈÍ½É”¥Ì¹½ÐÉ•™±•Ñ•½¸Ñ¡”±•…‘•É‰½…É°­••ÀÁ±…å¥¹œ°­••ÀÍ½É¥¹œ…¹•¹©½äå½ÕÈÉ½Õ¹¸Q¡”±•…‘•É‰½…ÉÝ¥±°ÕÁ‘…Ñ”¸ð½ÀøñÀøñˆùMÝ¥Á”±•™Ð™½ÈÑ¡”¹•áÐ¡½±”…¹É¥¡Ð™½ÈÑ¡”ÁÉ•Ù¥½ÕÌ¡½±”¸ð½ˆøð½Àøð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰ÉÕ±•Í!•…ˆøñ‘¥Øøñ ÌùIÕ±•Ìð½ ÌøñÀ±…ÍÌô‰¡¥¹ÐˆùM•Ð…¹ä½¹‘¥Ñ¥½¹ÌÑ¡…Ð‘¥™™•È™É½´¹½Éµ…°Á±…ä¸ð½Àøð½‘¥ØøñÍÁ…¸±…ÍÌô‰ÉÕ±•Í	…‘”ˆùY9PIU1Lð½ÍÁ…¸øð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰ÁÉ•™•ÉÉ•‘…åÉ¥€‘í\¹•Ù•¹Ð¹‘…åÌ€ø€Ä€ü€‰ÑÝ½…åÌˆ€è€ˆ‰ôˆø‘í•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤¹µ…À¡ÁÉ•™•ÉÉ•‘…É¤¹©½¥¸ ˆˆ¥ôð½‘¥Øø(€‘íÁÕÑÑ¥¹œ€ü€ñ‘¥Ø±…ÍÌô‰ÉÕ±•…ÉÁÕÑÑ¥¹IÕ±•Ìˆøñ‘¥Ø±…ÍÌô‰…ÕÑ½IÕ±•!•…ˆøñ‘¥Øøñ ÐùAÕÑÑ¥¹œ½µÁ•Ñ¥Ñ¥½¸IÕ±•Ìð½ ÐøñÀ±…ÍÌô‰¡¥¹Ðˆù%¹±Õ‘•…ÕÑ½µ…Ñ¥…±±ä‰•…ÕÍ”AÕÑÑ¥¹œ½µÁ•Ñ¥Ñ¥½¸¥ÌÍ•±•Ñ•¸ð½Àøð½‘¥Øøñ‘¥Ø±…ÍÌô‰ÉÕ±•!•…‘	Ñ¹ÌˆøñÍÁ…¸±…ÍÌô‰…ÕÑ½Q…œˆùUQ=5Q%ð½ÍÁ…¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Í½™Ðµ¥¹¥IÕ±•	Ñ¸ˆ¥ô‰•‘¥ÑAÕÑÑ¥¹œˆø‘í•‘¥Ñ¥¹œ€ü€‰½¹”ˆ€è€‰‘¥Ð‰ôð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øø‘í•‘¥Ñ¥¹œ€ü€ñÑ•áÑ…É•„¥ô‰ÁÕÑÑ¥¹IÕ±•Í‘¥ÐˆÉ½ÝÌôˆÄÌˆø‘í•ÍŒ¡ÑáÐ¥ôð½Ñ•áÑ…É•„ù€€è€ñ‘¥Ø±…ÍÌô‰ÁÕÑÑ¥¹IÕ±•Q•áÐˆø‘í•ÍŒ¡ÑáÐ¥ôð½‘¥Øùôð½‘¥Øù€€è€ˆ‰ô(€‘í\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰ÍÉ…Ñ ˆ¤€ü€ñ‘¥Ø±…ÍÌô‰ÉÕ±•…ÉÍÉ…Ñ¡IÕ±•Ìˆøñ‘¥Ø±…ÍÌô‰…ÕÑ½IÕ±•!•…ˆøñ‘¥Øøñ ÐùMÉ…Ñ ½µÁ•Ñ¥Ñ¥½¸IÕ±•Ìð½ ÐøñÀ±…ÍÌô‰¡¥¹Ðˆù%¹±Õ‘•…ÕÑ½µ…Ñ¥…±±ä‰•…ÕÍ”MÉ…Ñ ¥ÌÍ•±•Ñ•¸ð½Àøð½‘¥ØøñÍÁ…¸±…ÍÌô‰…ÕÑ½Q…œˆùUQ=5Q%ð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰ÁÕÑÑ¥¹IÕ±•Q•áÐˆø‘í•ÍŒ¡ÍÉ…Ñ¡IÕ±•ÍQ•áÐ¡\¹•Ù•¹Ð¤¥ôð½‘¥Øøð½‘¥Øù€€è€ˆ‰ô(€‘í\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰…µ‰É½Í”ˆ¤€ü€ñ‘¥Ø±…ÍÌô‰ÉÕ±•…É…µ‰É½Í•IÕ±•Ìˆøñ‘¥Ø±…ÍÌô‰…ÕÑ½IÕ±•!•…ˆøñ‘¥Øøñ Ðùµ‰É½Í”IÕ±•Ìð½ ÐøñÀ±…ÍÌô‰¡¥¹Ðˆù%¹±Õ‘•…ÕÑ½µ…Ñ¥…±±ä‰•…ÕÍ”µ‰É½Í”¥ÌÍ•±•Ñ•¸ð½Àøð½‘¥ØøñÍÁ…¸±…ÍÌô‰…ÕÑ½Q…œˆùUQ=5Q%ð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰ÁÕÑÑ¥¹IÕ±•Q•áÐˆø‘í•ÍŒ¡…µ‰É½Í•IÕ±•ÍQ•áÐ¡\¹•Ù•¹Ð¤¥ôð½‘¥Øøð½‘¥Øù€€è€ˆ‰ô(€ñ‘¥Ø±…ÍÌô‰ÉÕ±•…Éˆøñ‘¥Ø±…ÍÌô‰ÉÕ±•M•Ñ¥½¹!•…ˆøñ‘¥Øøñ ÐùMÁ•¥…°IÕ±•Ìð½ ÐøñÀ±…ÍÌô‰¡¥¹Ðˆù‘•… Í•Á…É…Ñ”¥¹ÍÑÉÕÑ¥½¸…Ì„‰Õ±±•ÐÁ½¥¹Ð¸AÉ•ÍÌ¹Ñ•È™½ÈÑ¡”¹•áÐ‰Õ±±•Ð¸ð½Àøð½‘¥Øøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Í½™Ðµ¥¹¥IÕ±•	Ñ¸ˆ¥ô‰±•…ÉMÁ•¥…°ˆù±•…Èð½‰ÕÑÑ½¸øð½‘¥ØøñÕ°¥ô‰ÍÁ•¥…±IÕ±•Ìˆ±…ÍÌô‰ÍÁ•¥…±IÕ±•Í‘¥Ñ½Èˆ½¹Ñ•¹Ñ•‘¥Ñ…‰±”ô‰ÑÉÕ”ˆÉ½±”ô‰Ñ•áÑ‰½àˆ…É¥„µ±…‰•°ô‰MÁ•¥…°IÕ±•Ìˆø‘íÍÁ•¥…±IÕ±•Í‘¥Ñ½É!Ñµ°¡\¹•Ù•¹Ð¹ÍÁ•¥…±IÕ±•Ì¥ôð½Õ°øð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰ÉÕ±•ÍAÉ•Ù¥•Ü€‘í\¹ÉÕ±•ÍAÉ•Ù¥•Ý¬€ü€‰…­¹½Ý±•‘•ˆ€è€ˆ‰ôˆøñ‘¥ØøñˆùA±…å•È…­¹½Ý±•‘•µ•¹Ðð½ˆøñÍÁ…¸ø‘í\¹ÉÕ±•ÍAÉ•Ù¥•Ý¬€ü€‰­¹½Ý±•‘•µ•¹ÐÉ•½É‘•™½ÈÑ¡¥ÌÁÉ•Ù¥•Ü¸ˆ€è€‰A±…å•ÉÌÍ•”Ñ¡”•Ù•¹ÐÉÕ±•Ì‰•™½É”Í½É¥¹œ‰•¥¹Ì¸‰ôð½ÍÁ…¸øð½‘¥Øøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰½Ñ%ÑAÉ•Ù¥•Üˆ¥ô‰½Ñ%ÑAÉ•Ù¥•Üˆø‘í\¹ÉÕ±•ÍAÉ•Ù¥•Ý¬€ü€‹ŠrL½Ð%Ðˆ€è€‰½Ð%Ð‰ôð½‰ÕÑÑ½¸øð½‘¥Øù€ì(€€€€ m‘…Ñ„µ¡…¹”µÁÉ•™•ÉÉ•‘tœ¤¹™½É…  ¡‰ÕÑÑ½¸¤€ôøì(€€€€€‰ÕÑÑ½¸¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€½¹ÍÐ‘…ä€ô€­‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹¡…¹•AÉ•™•ÉÉ•°(€€€€€€€€€­•ä€ô‘…ä‘í‘…åõ€ì(€€€€€€€\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•Í	å…åm­•åt€ô(€€€€€€€€€€…\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•Í	å…åm­•åtì(€€€€€€€¥˜€ …\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•Í	å…åm­•åt¤(€€€€€€€€€\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•…	å…åm­•åt€ô€‰•¹•É…°ˆì(€€€€€€€\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•Ì€ô\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•Í	å…ä¹‘…äÄì(€€€€€€€\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•„€ô\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•…	å…ä¹‘…äÄì(€€€€€€€É•¹‘•ÉMÑ•ÀÐ ¤ì(€€€€€ôì(€€€ô¤ì(€€€€ m‘…Ñ„µÁÉ•˜µ…É•…tœ¤¹™½É…  ¡Í•±•Ð¤€ôøì(€€€€€Í•±•Ð¹½¹¡…¹”€ô€ ¤€ôøì(€€€€€€€½¹ÍÐ­•ä€ô‘…ä‘íÍ•±•Ð¹‘…Ñ…Í•Ð¹ÁÉ•™É•…õ€ì(€€€€€€€\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•…	å…åm­•åt€ôÍ•±•Ð¹Ù…±Õ”ì(€€€€€€€¥˜€¡­•ä€ôôô€‰‘…äÄˆ¤\¹•Ù•¹Ð¹ÁÉ•™•ÉÉ•‘1¥•ÍÉ•„€ôÍ•±•Ð¹Ù…±Õ”ì(€€€€€ôì(€€€ô¤ì(€€€¥˜€  ˆ•‘¥ÑAÕÑÑ¥¹œˆ¤¤(€€€€€€ ˆ•‘¥ÑAÕÑÑ¥¹œˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€\¹•‘¥ÑAÕÑÑ¥¹IÕ±•Ì€ô€…\¹•‘¥ÑAÕÑÑ¥¹IÕ±•Ìì(€€€€€€€É•¹‘•ÉMÑ•ÀÐ ¤ì(€€€€€ôì(€€€¥˜€  ˆÁÕÑÑ¥¹IÕ±•Í‘¥Ðˆ¤¤(€€€€€€ ˆÁÕÑÑ¥¹IÕ±•Í‘¥Ðˆ¤¹½¹¥¹ÁÕÐ€ô€¡”¤€ôø(€€€€€€€€¡\¹•Ù•¹Ð¹ÁÕÑÑ¥¹IÕ±•ÍÕÍÑ½´€ô”¹Ñ…É•Ð¹Ù…±Õ”¤ì(€€€½¹ÍÐÍÁ•¥…±IÕ±•Í‘¥Ñ½È€ô€ ˆÍÁ•¥…±IÕ±•Ìˆ¤ì(€€€ÍÁ•¥…±IÕ±•Í‘¥Ñ½È¹½¹¥¹ÁÕÐ€ô€¡”¤€ôø(€€€€€€¡\¹•Ù•¹Ð¹ÍÁ•¥…±IÕ±•Ì€ôÍÁ•¥…±IÕ±•1¥¹•Ì¡”¹Ñ…É•Ð¹¥¹¹•ÉQ•áÐ¤¹©½¥¸ ‰q¸ˆ¤¤ì(€€€€ ˆ±•…ÉMÁ•¥…°ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€\¹•Ù•¹Ð¹ÍÁ•¥…±IÕ±•Ì€ô€ˆˆì(€€€€€É•¹‘•ÉMÑ•ÀÐ ¤ì(€€€ôì(€€€€ ˆ½Ñ%ÑAÉ•Ù¥•Üˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€\¹ÉÕ±•ÍAÉ•Ù¥•Ý¬€ô€…\¹ÉÕ±•ÍAÉ•Ù¥•Ý¬ì(€€€€€É•¹‘•ÉMÑ•ÀÐ ¤ì(€€€ôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉMÑ•ÀÔ ¤ì(€€€½¹ÍÐ¹ÑÁ=¸€ô\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰¹ÑÀˆ¤ì(€€€¥˜€ …¹ÑÁ=¸¤ì(€€€€€€ ˆÝ¥é…É‘	½‘äˆ¤¹¥¹¹•É!Q50€ô(€€€€€€€€ñ‘¥Ø±…ÍÌô‰¹ÑÁ!•…ˆøñ‘¥Øøñ Ìù9•…É•ÍÐÑ¡”A¥¸ð½ ÌøñÀ±…ÍÌô‰¡¥¹Ðˆù9Q@¡½±”Í•±•Ñ¥½¸ð½Àøð½‘¥ØøñÍÁ…¸±…ÍÌô‰ÉÕ±•Í	…‘”ˆù9Q@ð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰ÉÕ±•…Éˆøñ Ðù9•…É•ÍÐÑ¡”A¥¸¥Ì¹½Ð¥¹±Õ‘•¥¸Ñ¡¥Ì•Ù•¹Ð¸ð½ ÐøñÀ±…ÍÌô‰¡¥¹ÐˆùQ¡•É”¥Ì¹½Ñ¡¥¹œÑ¼Í•ÐÕÀ½¸Ñ¡¥ÌÁ…”¸ð½Àøð½‘¥Øù€ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ì€ô\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ìñðíôì(€€€\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹M½ÕÉ•Ì€ô\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹M½ÕÉ•Ìñðíôì(€€€½¹ÍÐÁ…ÈÍÌ€ô€¡¥°‘…ä¤€ôøì(€€€€€±•ÐØ€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä°\¹•Ù•¹Ð¤°(€€€€€€€È€ômtì(€€€€€™½È€¡±•Ð¤€ô€Àì¤€ð€Äàì¤¬¬¤(€€€€€€€¥˜€ ­Ø¹Á…Èü¹m¥t€ôôô€Ì¤(€€€€€€€€€È¹ÁÕÍ ¡ì(€€€€€€€€€€€¡½±”è¤€¬€Ä°(€€€€€€€€€€€¥¹‘•àèMÑÉ¥¹œ¡Ø¹¥¹‘•àü¹m¥t€üü€ˆˆ¤°(€€€€€€€€€€€µ•ÑÉ•Ìè½ÕÉÍ•!½±•¥ÍÑ…¹”¡Ø°¤¤°(€€€€€€€€€€€‘¥ÍÑ…¹•U¹¥Ðè½ÕÉÍ•¥ÍÑ…¹•‰‰É•Ø¡Ø¤°(€€€€€€€€€ô¤ì(€€€€€±•ÐÉ…¹¬€ô€¡à¤€ôøì(€€€€€€€±•Ð¸€ôÁ…ÉÍ•%¹Ð¡à¹¥¹‘•à¹ÍÁ±¥Ð ˆ¼ˆ¥lÁt°€ÄÀ¤ì(€€€€€€€É•ÑÕÉ¸9Õµ‰•È¹¥Í¥¹¥Ñ”¡¸¤€ü¸€è€´Äì(€€€€€ôì(€€€€€É•ÑÕÉ¸È¹Í½ÉÐ ¡à°ä¤€ôøÉ…¹¬¡ä¤€´É…¹¬¡à¤ñðà¹¡½±”€´ä¹¡½±”¤ì(€€€ôì(€€€½¹ÍÐ•¹ÍÕÉ”€ô€¡­•ä°¥°½Õ¹Ð¤€ôøì(€€€€€±•Ð €ôÁ…ÈÍÌ¡¥°€­­•ä¹É•Á±…” ‰‘…äˆ°€ˆˆ¤¤°(€€€€€€€Ø€ôÉÉ…ä¹¥ÍÉÉ…ä¡\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ím­•åt¤(€€€€€€€€€€ü\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ím­•åt¹µ…À¡9Õµ‰•È¤(€€€€€€€€€€èmtì(€€€€€½¹ÍÐ‘…ä€ô€­­•ä¹É•Á±…” ‰‘…äˆ°€ˆˆ¤°(€€€€€€€Í½ÕÉ”€ô€‘íMÑÉ¥¹œ¡¥ñð€ˆˆ¥õð‘íÍ•±•Ñ•‘Ù•¹ÑQ•”¡‘…ä°\¹•Ù•¹Ð¥õ€ì(€€€€€¥˜€¡\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹M½ÕÉ•Ím­•åt€„ôôÍ½ÕÉ”¤Ø€ômtì(€€€€€Ø€ôØ(€€€€€€€€¹™¥±Ñ•È ¡ °¤¤€ôø ¹Í½µ” ¡à¤€ôøà¹¡½±”€ôôô ¤€˜˜Ø¹¥¹‘•á=˜¡ ¤€ôôô¤¤(€€€€€€€€¹Í±¥” À°½Õ¹Ð¤ì(€€€€€™½È€¡±•Ðà½˜ ¤ì(€€€€€€€¥˜€¡Ø¹±•¹Ñ €øô½Õ¹Ð¤‰É•…¬ì(€€€€€€€¥˜€ …Ø¹¥¹±Õ‘•Ì¡à¹¡½±”¤¤Ø¹ÁÕÍ ¡à¹¡½±”¤ì(€€€€€ô(€€€€€\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ím­•åt€ôØì(€€€€€\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹M½ÕÉ•Ím­•åt€ôÍ½ÕÉ”ì(€€€€€É•ÑÕÉ¸ ì(€€€ôì(€€€½¹ÍÐÍÑ…ÉÑ1…‰•°€ô€¡‘…ä¤€ôøì(€€€€€½¹ÍÐµ•Ñ¡½€ôÍÑ…ÉÑ5•Ñ¡½‘½È¡\¹•Ù•¹Ð°‘…ä¤°(€€€€€€€¡½±•Ì€ôÍÑ…ÉÑ!½±•Í½È¡\¹•Ù•¹Ð°‘…ä¤ì(€€€€€¥˜€¡µ•Ñ¡½€ôôô€‰Í¡½ÑÕ¸ˆ¤É•ÑÕÉ¸€‰Q½‘…ä¥Ì„M¡½ÑÕ¸ÍÑ…ÉÐˆì(€€€€€¥˜€¡µ•Ñ¡½€ôôô€‰ÑÝ¼ˆ¤(€€€€€€€É•ÑÕÉ¸MÑ…ÉÑ¥¹œÑ••ÌÑ½‘…ä…É”!½±•Ì€‘í¡½±•ÍlÁuô…¹€‘í¡½±•ÍlÅuõ€ì(€€€€€É•ÑÕÉ¸MÑ…ÉÑ¥¹œÑ•”Ñ½‘…ä¥Ì!½±”€‘í¡½±•ÍlÁuõ€ì(€€€ôì(€€€½¹ÍÐÉ½Ü€ô€¡‘…ä°­•ä°Í±½Ð° °¥¤€ôøì(€€€€€±•ÐÍ•°€ô\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ím­•åumÍ±½Ñt°(€€€€€€€½Á•¸€ô\¹¹ÑÁ¡…¹”€ôôô€‘í­•åôè‘íÍ±½Ñõ€°(€€€€€€€ÕÍ•€ô\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ím­•åt¹™¥±Ñ•È ¡|°¤¤€ôø¤€„ôôÍ±½Ð¤°(€€€€€€€à€ô ¹™¥¹ ¡Ä¤€ôøÄ¹¡½±”€ôôôÍ•°¤ì(€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰¹ÑÁM•±•Ñ…Éˆøñ‘¥Ø±…ÍÌô‰¹ÑÁ…äˆøñˆø‘í‘…åô‘í\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ím­•åt¹±•¹Ñ €ø€Ä€ü€ƒŠP9Q@€‘íÍ±½Ð€¬€Åõ€€è€ˆ‰ôð½ˆøñÍÁ…¸ø‘í•ÍŒ¡½ÕÉÍ”¡¥¤ü¹¹…µ”ñð€‰½ÕÉÍ”ˆ¥ôð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰¹ÑÁM•±•Ñ•ˆøñ‘¥ØøñÍµ…±°ùM1Qð½Íµ…±°øñÍÑÉ½¹œù!½±”€‘íÍ•°ñð€‹ŠP‰ôð½ÍÑÉ½¹œøñÍÁ…¸ø‘íà€üA…È€Ì‘íà¹µ•ÑÉ•Ì€ü€ƒ
Ü€‘íà¹µ•ÑÉ•Íô€‘íà¹‘¥ÍÑ…¹•U¹¥Ñõ€€è€ˆ‰ô‘íà¹¥¹‘•à€ü€ƒ
Ü%¹‘•à€‘í•ÍŒ¡à¹¥¹‘•à¥õ€€è€ˆ‰õ€€è€ˆ‰ôð½ÍÁ…¸øð½‘¥Øøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Í½™Ðˆ‘…Ñ„µ¹ÑÁ¡…¹”ôˆ‘í­•åôè‘íÍ±½Ñôˆø‘í½Á•¸€ü€‰±½Í”ˆ€è€‰¡…¹”‰ôð½‰ÕÑÑ½¸øð½‘¥Øø‘í½Á•¸€ü€ñ‘¥Ø±…ÍÌô‰¹ÑÁ¡½¥•Ìˆøñˆù¡½½Í”…¹½Ñ¡•ÈA…È€Ìð½ˆø‘í ¹µ…À ¡Ä¤€ôø€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰¹ÑÁ¡½¥”€‘íÄ¹¡½±”€ôôôÍ•°€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ô€‘íÕÍ•¹¥¹±Õ‘•Ì¡Ä¹¡½±”¤€ü€‰ÕÍ•ˆ€è€ˆ‰ôˆ€‘íÕÍ•¹¥¹±Õ‘•Ì¡Ä¹¡½±”¤€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ô‘…Ñ„µ¹ÑÁÁ¥¬ôˆ‘í­•åôè‘íÍ±½Ñôè‘íÄ¹¡½±•ôˆøñÍÁ…¸ù!½±”€‘íÄ¹¡½±•ôð½ÍÁ…¸øñÍµ…±°ø‘íÄ¹µ•ÑÉ•Ì€üÄ¹µ•ÑÉ•Ì€¬€ˆ€ˆ€¬Ä¹‘¥ÍÑ…¹•U¹¥Ð€¬€ˆƒ
Ü€ˆ€è€ˆ‰ô‘íÄ¹¥¹‘•à€ü€‰%¹‘•à€ˆ€¬•ÍŒ¡Ä¹¥¹‘•à¤€è€ˆ‰ô‘íÄ¹¡½±”€ôôôÍ•°€ü€ˆƒ
ÜM•±•Ñ•ˆ€è€ˆ‰ôð½Íµ…±°øð½‰ÕÑÑ½¸ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øù€€è€ˆ‰ôð½‘¥Øù€ì(€€€ôì(€€€½¹ÍÐ‘…å!•…€ô€¡‘…ä°­•ä¤€ôø(€€€€€€ñ‘¥Ø±…ÍÌô‰¹ÑÁ…å!•…‘¥¹œˆøñ Ðø‘í\¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰9Q@!½±”ˆ€è…ä€‘í‘…åõôð½ ÐøñÍÑÉ½¹œø‘í•ÍŒ¡ÍÑ…ÉÑ1…‰•°¡‘…ä¤¥ôð½ÍÑÉ½¹œø‘í\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ím­•åt¹±•¹Ñ €ôôô€È€ü€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Í½™Ðˆ‘…Ñ„µ¹ÑÁÍÝ…Àôˆ‘í­•åôˆûŠMÝ…À9Q@=É‘•Èð½‰ÕÑÑ½¸ù€€è€ˆ‰ôð½‘¥Øù€ì(€€€€¼¼A½ÁÕ±…Ñ”Ñ¡”…ÕÑ½µ…Ñ¥ŒÍ•±•Ñ¥½¹Ì‰•™½É”½¹ÍÑÉÕÑ¥¹œÑ¡”ÁÉ¥¹Ñ…‰±”(€€€€¼¼…É‘Ì¸AÉ•Ù¥½ÕÍ±äÑ¡”™¥ÉÍÐÉ•¹‘•È‰Õ¥±ÐÑ¡”…É‘Ì™É½´…¸•µÁÑä±¥ÍÐì(€€€€¼¼½Á•¹¥¹œ¡…¹”…ÕÍ•„Í•½¹É•¹‘•È…¹µ…‘”Ñ¡•´…ÁÁ•…È‰ä…¥‘•¹Ð¸(€€€½µÁ•Ñ¥Ñ¥½¹…åÌ ‰¹ÑÀˆ°\¹•Ù•¹Ð¤¹™½É…  ¡‘…ä¤€ôøì(€€€€€½¹ÍÐ­•ä€ô€‰‘…äˆ€¬‘…ä°(€€€€€€€¥€ô\¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åtì(€€€€€•¹ÍÕÉ”¡­•ä°¥°¹ÑÁ½Õ¹Ð¡‘…ä°\¹•Ù•¹Ð¤¤ì(€€€ô¤ì(€€€½¹ÍÐÁÉ¥¹Ñ…‰±•9ÑÁ…É‘Ì€ô½µÁ•Ñ¥Ñ¥½¹…åÌ ‰¹ÑÀˆ°\¹•Ù•¹Ð¤¹™±…Ñ5…À ¡‘…ä¤€ôøì(€€€€€½¹ÍÐ¥€ô\¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åtì(€€€€€É•ÑÕÉ¸€¡\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ìü¹l‰‘…äˆ€¬‘…åtñðmt¤¹µ…À ¡¡½±”¤€ôø€¡ì(€€€€€€€½ÕÉÍ•9…µ”è½ÕÉÍ”¡¥¤ü¹¹…µ”ñð€‰½ÕÉÍ”ˆ°(€€€€€€€¡½±”è€­¡½±”°(€€€€€ô¤¤ì(€€€ô¤ì(€€€½¹ÍÐ¹ÑÁAÉ¥¹Ñ!Ñµ°€ôÁÉ¥¹Ñ…‰±•9ÑÁ…É‘Ì¹±•¹Ñ (€€€€€€ü€ñÍ•Ñ¥½¸±…ÍÌô‰¹ÑÁAÉ¥¹ÑM•Ñ¥½¸ˆøñ‘¥Ø±…ÍÌô‰¹ÑÁAÉ¥¹Ñ!•…‘¥¹œˆøñ‘¥Øøñ ÐùAÉ¥¹Ñ…‰±”9Q@…É‘Ìð½ ÐøñÀùAÉ¥¹Ð°ÕÐ½ÕÐ…¹Á±…”Ñ¡”µ…Ñ¡¥¹œ…ÉÝ¥Ñ Ñ¡”½¸µÉ••¸9Q@µ…É­•È¸ð½Àøð½‘¥Øøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Í½™Ðˆ¥ô‰ÁÉ¥¹Ñ9ÑÁ…É‘ÌˆùAÉ¥¹Ð9Q@…É‘Ìð½‰ÕÑÑ½¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰¹ÑÁAÉ¥¹Ñ…É‘Ìˆø‘íÁÉ¥¹Ñ…‰±•9ÑÁ…É‘Ì¹µ…À ¡…É¤€ôø€ñ…ÉÑ¥±”±…ÍÌô‰¹ÑÁAÉ¥¹Ñ…Éˆøñ¡•…‘•Èøñ‘¥ØøñÍµ…±°ù]d=1M=IHð½Íµ…±°øñÍÑÉ½¹œù9Q@ð½ÍÑÉ½¹œøð½‘¥Øøñ¥µœÍÉŒô‰…Ý…äµ½±˜µµ…Í½Ðµµ¥¹¤¹Á¹œˆ…±Ðôˆˆøð½¡•…‘•Èøñ Ôø‘í•ÍŒ¡…É¹½ÕÉÍ•9…µ”¥ôð½ Ôøñ Øù!½±”€‘í…É¹¡½±”ñð€‹ŠP‰ôð½ Øøñ‘¥Ø±…ÍÌô‰¹ÑÁAÉ¥¹Ñ1¥¹•ÌˆøñÍÁ…¸øð½ÍÁ…¸øñÍÁ…¸øð½ÍÁ…¸øñÍÁ…¸øð½ÍÁ…¸øñÍÁ…¸øð½ÍÁ…¸øð½‘¥Øøð½…ÉÑ¥±”ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½Í•Ñ¥½¸ù€(€€€€€€è€ˆˆì(€€€€ ˆÝ¥é…É‘	½‘äˆ¤¹¥¹¹•É!Q50€ô(€€€€€€ñ‘¥Ø±…ÍÌô‰¹ÑÁ!•…ˆøñ‘¥Øøñ Ìù9•…É•ÍÐÑ¡”A¥¸ð½ ÌøñÀ±…ÍÌô‰¡¥¹ÐˆùQ¡”•…Í¥•ÍÐµÉ…Ñ•A…È€Ì¡½±•Ì¡…Ù”‰••¸Í•±•Ñ•…ÕÑ½µ…Ñ¥…±±ä¸UÍ”¡…¹”½¹±ä¥˜å½ÔÝ…¹Ð„‘¥™™•É•¹Ð¡½±”¸ð½Àøð½‘¥ØøñÍÁ…¸±…ÍÌô‰ÉÕ±•Í	…‘”ˆù9Q@ð½ÍÁ…¸øð½‘¥Øø‘í½µÁ•Ñ¥Ñ¥½¹…åÌ ‰¹ÑÀˆ°\¹•Ù•¹Ð¤¹µ…À¡‘…äôùì(€€€€€€€½¹ÍÐ­•äô‰‘…äˆ­‘…ä°¥õ\¹•Ù•¹Ñl‰½ÕÉÍ”ˆ­‘…åt°½Õ¹Ðõ¹ÑÁ½Õ¹Ð¡‘…ä±\¹•Ù•¹Ð¤°¡½¥•Ìõ•¹ÍÕÉ”¡­•ä±¥±½Õ¹Ð¤ì(€€€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰¹ÑÁ…åÉ½ÕÀˆø‘í‘…å!•…¡‘…ä±­•ä¥ôñ±…‰•°ù9Õµ‰•È½˜9Q@¡½±•ÌñÍ•±•Ð‘…Ñ„µ¹ÑÁ½Õ¹Ðôˆ‘í‘…åôˆøñ½ÁÑ¥½¸Ù…±Õ”ôˆÄˆ€‘í½Õ¹ÐôôôÄü‰Í•±•Ñ•ˆèˆ‰ôù=¹”ð½½ÁÑ¥½¸øñ½ÁÑ¥½¸Ù…±Õ”ôˆÈˆ€‘í½Õ¹ÐôôôÈü‰Í•±•Ñ•ˆèˆ‰ôùQÝ¼ð½½ÁÑ¥½¸øð½Í•±•Ðøð½±…‰•°ø‘íÉÉ…ä¹™É½´¡í±•¹Ñ é½Õ¹Ñô°¡|±¤¤ôùÉ½Ü¡…ä€‘í‘…åõ€±­•ä±¤±¡½¥•Ì±¥¤¤¹©½¥¸ ˆˆ¥ôð½‘¥Øù€ì(€€€€€ô¤¹©½¥¸ ˆˆ¥ô‘í¹ÑÁAÉ¥¹Ñ!Ñµ±ôñ‘¥Ø±…ÍÌô‰¹ÑÁ%¹™¼ˆøñˆùÕÉ¥¹œÁ±…äð½ˆøñÍÁ…¸ù=¸•… 9Q@¡½±”°Á±…å•ÉÌ…¸½¹™¥É´Ñ¡…ÐÑ¡•äÁÕÐÑ¡•¥È¹…µ”½¸Ñ¡”9Q@µ…É­•È¸Q¡”±…Ñ•ÍÐ½¹™¥Éµ••¹ÑÉä½¸•… ¡½±”‰•½µ•ÌÑ¡”ÕÉÉ•¹Ð9Q@¡½±‘•È¸ð½ÍÁ…¸øð½‘¥Øù€ì(€€€¥˜€  ˆÁÉ¥¹Ñ9ÑÁ…É‘Ìˆ¤¤€ ˆÁÉ¥¹Ñ9ÑÁ…É‘Ìˆ¤¹½¹±¥¬€ô€ ¤€ôøÝ¥¹‘½Ü¹ÁÉ¥¹Ð ¤ì(€€€€ ‰m‘…Ñ„µ¹ÑÁ½Õ¹Ñtˆ¤¹™½É… ¡¥¹ÁÕÐôù¥¹ÁÕÐ¹½¹¡…¹”ô ¤ôùì(€€€€€\¹•Ù•¹Ð¹¹ÑÁ½Õ¹ÑÌñðôíôì\¹•Ù•¹Ð¹¹ÑÁ½Õ¹ÑÍl‰‘…äˆ­¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹¹ÑÁ½Õ¹Ñtô­¥¹ÁÕÐ¹Ù…±Õ”ìÉ•¹‘•ÉMÑ•ÀÔ ¤ì(€€€ô¤ì(€€€€ ‰m‘…Ñ„µ¹ÑÁ¡…¹•tˆ¤¹™½É…  (€€€€€€¡ˆ¤€ôø(€€€€€€€€¡ˆ¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€\¹¹ÑÁ¡…¹”€ô(€€€€€€€€€€€\¹¹ÑÁ¡…¹”€ôôôˆ¹‘…Ñ…Í•Ð¹¹ÑÁ¡…¹”€ü€ˆˆ€èˆ¹‘…Ñ…Í•Ð¹¹ÑÁ¡…¹”ì(€€€€€€€€€É•¹‘•ÉMÑ•ÀÔ ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ‰m‘…Ñ„µ¹ÑÁÁ¥­tˆ¤¹™½É…  (€€€€€€¡ˆ¤€ôø(€€€€€€€€¡ˆ¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€±•Ðm¬°Ì°¡t€ôˆ¹‘…Ñ…Í•Ð¹¹ÑÁÁ¥¬¹ÍÁ±¥Ð ˆèˆ¤ì(€€€€€€€€€\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ím­ul­Ít€ô€­ ì(€€€€€€€€€\¹¹ÑÁ¡…¹”€ô€ˆˆì(€€€€€€€€€É•¹‘•ÉMÑ•ÀÔ ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ‰m‘…Ñ„µ¹ÑÁÍÝ…Átˆ¤¹™½É…  (€€€€€€¡ˆ¤€ôø(€€€€€€€€¡ˆ¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€½¹ÍÐ¬€ôˆ¹‘…Ñ…Í•Ð¹¹ÑÁÍÝ…À°(€€€€€€€€€€€Ø€ô\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ím­tì(€€€€€€€€€¥˜€¡Øü¹±•¹Ñ €ôôô€È¤ì(€€€€€€€€€€€mÙlÁt°ÙlÅut€ômÙlÅt°ÙlÁutì(€€€€€€€€€€€\¹¹ÑÁ¡…¹”€ô€ˆˆì(€€€€€€€€€€€É•¹‘•ÉMÑ•ÀÔ ¤ì(€€€€€€€€€ô(€€€€€€€ô¤°(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉMÑ•ÀØ ¤ì(€€€•¹ÍÕÉ•Ù•¹ÑQ••A±…¹¹¥¹œ¡\¹•Ù•¹Ð¤ì(€€€½¹ÍÐ‘…åÌ€ô•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤°Í•±•Ñ•€ô½µÁ•™¥¹¥Ñ¥½¹Ì ¤¹™¥±Ñ•È¡½µÀôù\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì¡½µÀ¹¥¤˜˜…½µÀ¹Õ¹…Ù…¥±…‰±”¤°(€€€€€ÍÕµµ…ÉåÙ•¹Ð€ôì¸¸¹\¹•Ù•¹Ð°½µÁ•Ñ¥Ñ¥½¹ÌéÍ•±•Ñ•¹µ…À¡½µÀôù½µÀ¹¥¥ô°(€€€€€µÕ±Ñ¥…å½µÁ•Ñ¥Ñ¥½¹Ì€ôµÕ±Ñ¥…å½µÁ•Ñ¥Ñ¥½¹MÕµµ…Éä¡ÍÕµµ…ÉåÙ•¹Ð¤°(€€€€€…É‘I•ÍÕ±ÑÌ€ô‘…åÌ¹™±…Ñ5…À¡‘…äôù•Ù•¹Ñ…É‘¡•­Ì¡‘…ä±\¹•Ù•¹Ð¤¤°(€€€€€…É‘ÍY…±¥€ô…É‘I•ÍÕ±ÑÌ¹•Ù•Éä¡É•ÍÕ±ÐôùÉ•ÍÕ±Ðü¹½¬¤°(€€€€€¡•­Ì€ôl(€€€€€€€í½¬é	½½±•…¸¡\¹•Ù•¹Ð¹¹…µ”ü¹ÑÉ¥´ ¤¤±±…‰•°éÙ•¹Ð9…µ”è€‘í\¹•Ù•¹Ð¹¹…µ•ñð‰9½Ð•¹Ñ•É•‰õô°(€€€€€€€í½¬é	½½±•…¸¡\¹•Ù•¹Ð¹‘…Ñ”¤±±…‰•°éMÑ…ÉÐ…Ñ”è€‘í\¹•Ù•¹Ð¹‘…Ñ”ý…ÕÍÑÉ…±¥…¹…Ñ”¡\¹•Ù•¹Ð¹‘…Ñ”¤è‰9½Ð•¹Ñ•É•‰õô°(€€€€€€€€¸¸¹‘…åÌ¹µ…À¡‘…äôø¡í½¬é	½½±•…¸¡½ÕÉÍ”¡\¹•Ù•¹Ñl‰½ÕÉÍ”ˆ­‘…åt¤¤±±…‰•°é…ä€‘í‘…åôè€‘í½ÕÉÍ”¡\¹•Ù•¹Ñl‰½ÕÉÍ”ˆ­‘…åt¤ü¹¹…µ•ñð‰9½ÐÍ•±•Ñ•‰ôƒ
Ü€‘í…ÕÍÑÉ…±¥…¹…Ñ”¡•Ù•¹Ñ…Ñ”¡‘…ä±\¹•Ù•¹Ð¤¥ôƒ
Ü¥ÉÍÐQ•”Q¥µ”è€‘í™¥ÉÍÑÙ•¹ÑQ••Q¥µ”¡‘…ä±\¹•Ù•¹Ð¥õô¤¤°(€€€€€€€í½¬é…É‘ÍY…±¥˜™	½½±•…¸¡\¹•Ù•¹Ð¹Í½É•…É‘Í¡•­•¤±±…‰•°é=™™¥¥…°½ÕÉÍ”M½É•…É‘Ìè€‘í…É‘ÍY…±¥ü¡\¹•Ù•¹Ð¹Í½É•…É‘Í¡•­•ü‰½¹™¥Éµ•ˆè‰½¹™¥Éµ…Ñ¥½¸É•ÅÕ¥É•ˆ¤è‰½ÕÉÍ”‘…Ñ„¹••‘Ì½ÉÉ•Ñ¥½¸‰õô°(€€€€€€€€¸¸¹‘…åÌ¹µ…À¡‘…äôø¡í½¬éÝ¥é…É‘A±…¹¹¥¹A±…å•ÉÌ¡‘…ä¤¹±•¹Ñ øôÐ˜™Ý¥é…É‘A±…¹¹¥¹A±…å•ÉÌ¡‘…ä¤¹±•¹Ñ „ôôÔ±±…‰•°é…ä€‘í‘…åô¥•±è€‘íÝ¥é…É‘A±…¹¹¥¹A±…å•ÉÌ¡‘…ä¤¹±•¹Ñ¡ôÁ±…å¥¹œÁ½Í¥Ñ¥½¹Íô¤¤°(€€€€€€€€¸¸¹‘…åÌ¹µ…À¡‘…äôùí½¹ÍÐ…Ñ•½É¥•Ìõ•Ù•¹ÑA±…å•É…Ñ•½É¥•Ì¡‘…ä±\¹•Ù•¹Ð¤±½µÁ±•Ñ”õ…Ñ•½É¥•Ì¹•Ù•Éä¡…Ñ•½Éäôù•¹…‰±•‘Ù•¹ÑQ••Í½É…Ñ•½Éä¡\¹•Ù•¹Ð±‘…ä±…Ñ•½Éä¤¹•Ù•Éä¡Ñ•”ôùÑ••!…¹‘¥…ÁÍ½µÁ±•Ñ”¡‘…ä±Ñ•”±\¹•Ù•¹Ð±…Ñ•½Éä¤¤¤íÉ•ÑÕÉ¸í½¬é½µÁ±•Ñ”±±…‰•°é…ä€‘í‘…åôQ•”!…¹‘¥…ÁÌè€‘í½µÁ±•Ñ”ü‰½µÁ±•Ñ”ˆè‰%¹½µÁ±•Ñ”‰õôíô¤°(€€€€€€€€¸¸¹‘…¥±å½µÁ•Ñ¥Ñ¥½¹¡•­Ì¡ÍÕµµ…ÉåÙ•¹Ð¤°(€€€€€€€€¸¸¸¡µÕ±Ñ¥…å½µÁ•Ñ¥Ñ¥½¹Ì¹±•¹Ñ ýmí½¬éÑÉÕ”±±…‰•°é5Õ±Ñ¤µ‘…ä½µÁ•Ñ¥Ñ¥½¹Ìè€‘íµÕ±Ñ¥…å½µÁ•Ñ¥Ñ¥½¹Ì¹±•¹Ñ¡õõtémt¤°(€€€€€€€€¸¸¸¡\¹½µÁ•Ñ¥Ñ¥½¹Ì¹¡…Ì ‰¹ÑÀˆ¤ý½µÁ•Ñ¥Ñ¥½¹…åÌ ‰¹ÑÀˆ±\¹•Ù•¹Ð¤¹µ…À¡‘…äôø¡í½¬è¡\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ìü¹l‰‘…äˆ­‘…åuññmt¤¹±•¹Ñ ôôõ¹ÑÁ½Õ¹Ð¡‘…ä±\¹•Ù•¹Ð¤±±…‰•°é…ä€‘í‘…åô9Q@è€‘ì¡\¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ìü¹l‰‘…äˆ­‘…åuññmt¤¹µ…À¡ ôø‰!½±”€ˆ­ ¤¹©½¥¸ ˆ°€ˆ¥ñð‰9½ÐÍ•±•Ñ•‰õô¤¤émt¤°(€€€€€t°…±±I•…‘äõ¡•­Ì¹•Ù•Éä¡¡•¬ôù¡•¬¹½¬¤ì(€€€€ ˆÝ¥é…É‘	½‘äˆ¤¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰ÍÑ…ÉÑ!•…ˆøñ‘¥Øøñ ÌùÙ•¹ÐA±…¸I•…‘äð½ ÌøñÀùI•Ù¥•Ü…±°€‘í‘…åÌ¹±•¹Ñ¡ôÁ±…å¥¹œ‘…ä‘í‘…åÌ¹±•¹Ñ øÄü‰Ìˆèˆ‰ô‰•™½É”ÁÉ½••‘¥¹œÑ¼Í½É¥¹œÍ•ÑÕÀ¸ð½Àøð½‘¥ØøñÍÁ…¸±…ÍÌô‰ÍÑ…ÉÑ	…‘”€‘í…±±I•…‘äü‰É•…‘äˆè‰¡•¬‰ôˆø‘í…±±I•…‘äü‰Idˆè‰!,‰ôð½ÍÁ…¸øð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰ÍÑ…ÉÑMÕµµ…ÉåÉ¥ˆøñ‘¥Ø±…ÍÌô‰ÍÑ…ÉÑ…Éˆøñ ÐùÙ•¹Ðð½ Ðøñˆø‘í•ÍŒ¡\¹•Ù•¹Ð¹¹…µ”¥ôð½ˆøñÀø‘í‘…åÌ¹±•¹Ñ¡ôÁ±…å¥¹œ‘…ä‘í‘…åÌ¹±•¹Ñ øÄü‰Ìˆèˆ‰ôƒ
ÜQÉ¥À™¥•±è€‘í\¹•Ù•¹Ð¹™¥•±‘M¥é•ôð½ÀøñÀùMÑ…ÉÐè€‘í•ÍŒ¡…ÕÍÑÉ…±¥…¹…Ñ”¡•Ù•¹Ñ…Ñ”¡‘…åÍlÁt±\¹•Ù•¹Ð¤¤¥ôƒ
Ü¥¹¥Í è€‘í•ÍŒ¡…ÕÍÑÉ…±¥…¹…Ñ”¡•Ù•¹Ñ…Ñ”¡‘…åÍm‘…åÌ¹±•¹Ñ ´Åt±\¹•Ù•¹Ð¤¤¥ôð½Àøð½‘¥Øø(€€€€€€‘í‘…åÌ¹µ…À¡‘…äôùí½¹ÍÐ‘…¥±äõ‘…¥±å½µÁ•Ñ¥Ñ¥½¹MÕµµ…Éä¡‘…ä±ÍÕµµ…ÉåÙ•¹Ð¤¹™¥±Ñ•È¡½µÀôø…½µÀ¹…É•…Ñ”¤íÉ•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰ÍÑ…ÉÑ…Éˆøñ Ðù…ä€‘í‘…åôð½ ÐøñÀø‘í•ÍŒ¡½ÕÉÍ”¡\¹•Ù•¹Ñl‰½ÕÉÍ”ˆ­‘…åt¤ü¹¹…µ•ñð‰9¼½ÕÉÍ”ˆ¥ôƒ
Ü€‘íÝ¥é…É‘A±…¹¹¥¹A±…å•ÉÌ¡‘…ä¤¹±•¹Ñ¡ôÁ±…å•ÉÌƒ
Ü€‘í™¥ÉÍÑÙ•¹ÑQ••Q¥µ”¡‘…ä±\¹•Ù•¹Ð¥ôð½ÀøñÀøñˆù…¥±ä½µÁ•Ñ¥Ñ¥½¹Ìð½ˆøñ‰Èø‘í‘…¥±ä¹±•¹Ñ ý‘…¥±ä¹µ…À¡½µÀôù•ÍŒ¡½µÀ¹¹…µ”¤¤¹©½¥¸ ˆƒ
Ü€ˆ¤è‰9½¹”‰ôð½Àøð½‘¥Øù€íô¤¹©½¥¸ ˆˆ¥ô(€€€€€€‘í‘…åÌ¹±•¹Ñ øÄý€ñ‘¥Ø±…ÍÌô‰ÍÑ…ÉÑ…Éˆøñ Ðù5Õ±Ñ¤µ‘…ä½µÁ•Ñ¥Ñ¥½¹Ìð½ Ðø‘íµÕ±Ñ¥…å½µÁ•Ñ¥Ñ¥½¹Ì¹±•¹Ñ ýµÕ±Ñ¥…å½µÁ•Ñ¥Ñ¥½¹Ì¹µ…À¡½µÀôù€ñÀøñˆø‘í•ÍŒ¡½µÀ¹¹…µ”¥ôð½ˆø‘í½µÀ¹‘•Ñ…¥°ý€ñ‰Èø‘í•ÍŒ¡½µÀ¹‘•Ñ…¥°¥õ€èˆ‰ôð½Àù€¤¹©½¥¸ ˆˆ¤èˆñÀù9½¹”ð½Àø‰ôð½‘¥Øù€èˆ‰ôð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰™¥¹…±¡•¬ˆøñ Ðù¥¹…°¡•¬ð½ Ðøñ‘¥Ø±…ÍÌô‰¡•­1¥ÍÐˆø‘í¡•­Ì¹µ…À¡¡•¬ôù€ñ‘¥Ø±…ÍÌôˆ‘í¡•¬¹½¬ü‰½¬ˆè‰Ý…É¸‰ôˆøñÍÁ…¸ø‘í¡•¬¹½¬ü‹ŠrLˆèˆ„‰ôð½ÍÁ…¸ø‘í•ÍŒ¡¡•¬¹±…‰•°¥ôð½‘¥Øù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½‘¥Øø(€€€€€€ñ±…‰•°±…ÍÌô‰…É‘¡•­•‘½¹™¥É´ˆøñ¥¹ÁÕÐÑåÁ”ô‰¡•­‰½àˆ¥ô‰Í½É•…É‘Í¡•­•ˆ€‘í\¹•Ù•¹Ð¹Í½É•…É‘Í¡•­•ü‰¡•­•ˆèˆ‰ô€‘í…É‘ÍY…±¥üˆˆè‰‘¥Í…‰±•‰ôøñÍÁ…¸øñˆù…É¡•­•ð½ˆøƒŠP$¡…Ù”¡•­••Ù•Éä½ÕÉÍ”Í½É•…É……¥¹ÍÐÑ¡”½™™¥¥…°…É¸ð½ÍÁ…¸øð½±…‰•°ø(€€€€€€ñ‘¥Ø±…ÍÌô‰Á±…¹Q••M•±•Ñ¥½¸ˆøñˆùAÉ½Ù¥Í¥½¹…°A±…å¥¹œQ••Ìð½ˆø‘í‘…åÌ¹µ…À¡‘…äôù•Ù•¹ÑA±…å•É…Ñ•½É¥•Ì¡‘…ä±\¹•Ù•¹Ð¤¹µ…À¡…Ñ•½Éäôù€ñ‘¥Ø±…ÍÌô‰Á±…¹Q••…äˆøñÍÑÉ½¹œù…ä€‘í‘…åôƒ
Ü€‘í…Ñ•½Éäôôô‰Ý½µ•¸ˆü‰]½µ•¸ˆè‰5•¸‰ôð½ÍÑÉ½¹œø‘í•¹…‰±•‘Ù•¹ÑQ••Í½É…Ñ•½Éä¡\¹•Ù•¹Ð±‘…ä±…Ñ•½Éä¤¹µ…À¡Ñ•”ôù€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÝ¥é…É‘Á±…å¥¹Ñ•”ôˆ‘í‘…åõð‘í…Ñ•½Éåõð‘íÑ••ôˆ±…ÍÌôˆ‘íÍ•±•Ñ•‘Ù•¹ÑQ•”¡‘…ä±\¹•Ù•¹Ð±…Ñ•½Éä¤ôôõÑ•”ü‰…Ñ¥Ù”ˆèˆ‰ôˆø‘í•ÍŒ¡•Ù•¹ÑQ••¥ÍÁ±…å9…µ”¡‘…ä±Ñ•”±\¹•Ù•¹Ð±…Ñ•½Éä¤¥ôð½‰ÕÑÑ½¸ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øù€¤¹©½¥¸ ˆˆ¤¤¹©½¥¸ ˆˆ¥ôð½‘¥Øø(€€€€€€ñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰¡…¹•MÑ…ÉÑ¥¹Q•”ˆù¡…¹”½ÕÉÍ”€¼MÑ…ÉÑ¥¹œÉÉ…¹•µ•¹Ðð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰ÍÑ…ÉÑÙ•¹Ñ	¥œˆ¥ô‰ÍÑ…ÉÑÙ•¹Ñ	¥œˆ€‘í…±±I•…‘äüˆˆè‰‘¥Í…‰±•‰ôùMYY9PA18ƒŠLAI=Q<MPU@M=I%9ð½‰ÕÑÑ½¸ù€ì(€€€€ ˆÍ½É•…É‘Í¡•­•ˆ¤¹½¹¡…¹”õ”ôùí\¹•Ù•¹Ð¹Í½É•…É‘Í¡•­•õ”¹Ñ…É•Ð¹¡•­•íÉ•¹‘•ÉMÑ•ÀØ ¤íôì(€€€€ ˆ¡…¹•MÑ…ÉÑ¥¹Q•”ˆ¤¹½¹±¥¬ô ¤ôùí\¹ÍÑ•ÀôÄíÉ•¹‘•É]¥é…É ¤íôì(€€€€ ‰m‘…Ñ„µÝ¥é…É‘Á±…å¥¹Ñ••tˆ¤¹™½É… ¡‰ÕÑÑ½¸ôù‰ÕÑÑ½¸¹½¹±¥¬ô ¤ôùí½¹ÍÐm‘…ä±…Ñ•½Éä±Ñ••tõ‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹Ý¥é…É‘Á±…å¥¹Ñ•”¹ÍÁ±¥Ð ‰ðˆ¤íÍ•±•ÑÙ•¹ÑQ•” ­‘…ä±Ñ•”±\¹•Ù•¹Ð±…Ñ•½Éä¤íÉ•¹‘•ÉMÑ•ÀØ ¤íô¤ì(€€€€ ˆÍÑ…ÉÑÙ•¹Ñ	¥œˆ¤¹½¹±¥¬ô ¤ôùí¥˜¡…±±I•…‘ä¥™¥¹¥Í¡Ù•¹Ð ¤íôì(€ô(€™Õ¹Ñ¥½¸™¥¹¥Í¡Ù•¹Ð ¤ì(€€€¥˜€¡\¹¹•ÝÙ•¹Ð¤…ÁÑÕÉ•ÕÉÉ•¹ÑÙ•¹Ð ¤ì(€€€±•Ð½¹™¥Éµ•€ôl¸¸¹\¹¥¹Ù¥Ñ•Ít(€€€€€€¹™¥±Ñ•È ¡à¤€ôøálÅt€ôôô€‰…•ÁÑ•ˆ¤(€€€€€€¹µ…À ¡à¤€ôøMÑÉ¥¹œ¡álÁt¤¤ì(€€€±•Ð¥¹Ù¥Ñ…Ñ¥½¹MÑ…ÑÕÌ€ô=‰©•Ð¹™É½µ¹ÑÉ¥•Ì (€€€€€l¸¸¹\¹¥¹Ù¥Ñ•Ít¹µ…À ¡m¥°ÍÑ…ÑÕÍt¤€ôømMÑÉ¥¹œ¡¥¤°ÍÑ…ÑÕÍt¤°(€€€€¤ì(€€€=‰©•Ð¹•¹ÑÉ¥•Ì¡\¹•Ù•¹Ð¹Í¡…É•‘A½Í¥Ñ¥½¹Ìñðíô¤¹™½É…  ¡mÍ±½Ð±‘…åÍt¤ôù=‰©•Ð¹Ù…±Õ•Ì¡‘…åÌ¤¹™½É… ¡¥ôù¥¹Ù¥Ñ…Ñ¥½¹MÑ…ÑÕÍmMÑÉ¥¹œ¡¥¥tõ¥¹Ù¥Ñ…Ñ¥½¹MÑ…ÑÕÍmÍ±½Ñt¤¤ì(€€€±•Ð‘…åÙ…¥±…‰¥±¥Ñä€ô)M=8¹Á…ÉÍ” (€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡\¹•Ù•¹Ð¹‘…åÙ…¥±…‰¥±¥Ñäñðíô¤°(€€€€¤ì(€€€½¹ÍÐ‘…å¥•±‘Ì€ôíôì(€€€•Ù•¹Ñ…åÌ¡\¹•Ù•¹Ð¤¹™½É… ¡‘…ä€ôø‘…å¥•±‘Íl‰‘…äˆ€¬‘…åt€ôÝ¥é…É‘A±…¹¹¥¹A±…å•ÉÌ¡‘…ä¤¤ì(€€€½¹ÍÐ½±‘É½ÕÁÌ€ô\¹¹•ÝÙ•¹Ð€ü¹Õ±°€èÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀì(€€€¥˜€¡\¹¹•ÝÙ•¹Ð¤ì(€€€€€±½Í•±½Õ‘½¹¹•Ñ¥½¸ ¤ì(€€€€€‘•±•Ñ”ÍÑ½É”¹±½Õì(€€€€€ÍÑ½É”¹±½Õ‘A±…å•ÉÌ€ômtì(€€€€€™½É•Ñ=É…¹¥Í•ÉÙ•¹Ð ¤ì(€€€ô(€€€ÍÑ½É”¹•Ù•¹Ð€ôì(€€€€€€¸¸¹\¹•Ù•¹Ð°(€€€€€Ý½É­ÍÁ…•%è\¹•Ù•¹Ð¹Ý½É­ÍÁ…•%ñðÕ¥ ¤°(€€€€€½¹™¥Éµ•°(€€€€€¥¹Ù¥Ñ…Ñ¥½¹MÑ…ÑÕÌ°(€€€€€‘…åÙ…¥±…‰¥±¥Ñä°(€€€€€‘…å¥•±‘Ì°(€€€€€½µÁ•Ñ¥Ñ¥½¹Ìèl¸¸¹\¹½µÁ•Ñ¥Ñ¥½¹Ít°(€€€€€‰•¹•™¥ÑÌè\¹‰•¹•™¥ÑÌ°(€€€€€ÍÑ…ÑÕÌè€‰Á±…¹¹•ˆ°(€€€€€±½­•è™…±Í”°(€€€€€É½ÕÁM•ÑÕÀè½±‘É½ÕÁÌñðíô°(€€€€€Í•ÑÕÁMÑ…”è€‰Á±…¹¹•ˆ°(€€€ôì(€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹‘É…™ÑMÑ•Àì(€€€¥˜€¡\¹¹•ÝÙ•¹Ð¤É•Í•ÑÕÁ±¥…Ñ•‘Ù•¹ÑIÕ¹Ñ¥µ”¡ÍÑ½É”¹•Ù•¹Ð¤ì(€€€¹½Éµ…±¥Í•QÝ½…åM¥¹±•MÑ…‰±•™½É¡ÍÑ½É”¹•Ù•¹Ð¤ì(€€€ÍÑ½É”¹Ñ•µÁ±…Ñ”€ôì(€€€€€½µÁ•Ñ¥Ñ¥½¹Ìèl¸¸¹\¹½µÁ•Ñ¥Ñ¥½¹Ít¹™¥±Ñ•È ¡à¤€ôøà€„ôô€‰•±•Ñ¥Œˆ¤°(€€€€€‰•¹•™¥ÑÌè\¹‰•¹•™¥ÑÌ°(€€€€€ÁÕÑÑ¥¹½Éµ…Ðè\¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ðñð€‰Ñ•…´ˆ°(€€€€€Í¥¹±•MÑ…‰±•™½É‘½Éµ…Ðè\¹•Ù•¹Ð¹Í¥¹±•MÑ…‰±•™½É‘½Éµ…Ðñð€‰…É•…Ñ”ˆ°(€€€€€ÍÉ…Ñ¡5…á!Àè9Õµ‰•È¹¥Í¥¹¥Ñ” ­\¹•Ù•¹Ð¹ÍÉ…Ñ¡5…á!À¤(€€€€€€€€ü€­\¹•Ù•¹Ð¹ÍÉ…Ñ¡5…á!À(€€€€€€€€è€ÄÀ°(€€€€€ÍÉ…Ñ¡M½É¥¹5½‘”è(€€€€€€€\¹•Ù•¹Ð¹ÍÉ…Ñ¡M½É¥¹5½‘”€ôôô€‰µ…á½Õ‰±•	½•äˆ(€€€€€€€€€€ü€‰µ…á½Õ‰±•	½•äˆ(€€€€€€€€€€è€‰ÍÑÉ½­”ˆ°(€€€€€…µ‰É½Í•M½É¥¹5½‘”è(€€€€€€€\¹•Ù•¹Ð¹…µ‰É½Í•M½É¥¹5½‘”€ôôô€‰Í½É•É=¹±äˆ(€€€€€€€€€€ü€‰Í½É•É=¹±äˆ(€€€€€€€€€€è€‰Í½É•É5…É­•Èˆ°(€€€€€…µ‰É½Í•5¥¹¥µÕµÉ¥Ù•ÌèlÈ°€Ì°€Ñt¹¥¹±Õ‘•Ì ­\¹•Ù•¹Ð¹…µ‰É½Í•5¥¹¥µÕµÉ¥Ù•Ì¤(€€€€€€€€ü€­\¹•Ù•¹Ð¹…µ‰É½Í•5¥¹¥µÕµÉ¥Ù•Ì(€€€€€€€€è€Ì°(€€€€€Á…ÈÍ½Éµ…Ðè\¹•Ù•¹Ð¹Á…ÈÍ½Éµ…Ðñð€‰‘…¥±äˆ°(€€€€€Á…ÈÍ5½‘”èÁ…ÈÍ5½‘”¡\¹•Ù•¹Ð¤°(€€€€€ÍÉ…Ñ¡½Éµ…Ðè\¹•Ù•¹Ð¹ÍÉ…Ñ¡½Éµ…Ðñð€‰‘…¥±äˆ°(€€€€€¹ÑÁ…äÅ½Õ¹Ðè\¹•Ù•¹Ð¹¹ÑÁ…äÅ½Õ¹Ðñð€Ä°(€€€€€¹ÑÁ…äÉ½Õ¹Ðè¹ÑÁ½Õ¹Ð È°\¹•Ù•¹Ð¤°(€€€€€¹ÑÁ½Õ¹ÑÌè)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡\¹•Ù•¹Ð¹¹ÑÁ½Õ¹ÑÌñðíô¤¤°(€€€€€¹ÑÁ)…­Á½Ðè	½½±•…¸¡\¹•Ù•¹Ð¹¹ÑÁ)…­Á½Ð¤°(€€€€€¹ÑÁ)…­Á½Ñ5½‘”è\¹•Ù•¹Ð¹¹ÑÁ)…­Á½Ñ5½‘”€ôôô€‰É½±±¥¹œˆ€ü€‰É½±±¥¹œˆ€è€‰™¥¹…°ˆ°(€€€ôì(€€€±½…±MÑ½É…”¹Í•Ñ%Ñ•´ (€€€€€€‰…Ý…å½±™=É…¹¥Í•ÉQ•µÁ±…Ñ•XÄˆ°(€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡ÍÑ½É”¹Ñ•µÁ±…Ñ”¤°(€€€€¤ì(€€€€¼¼AÉ•Í•ÉÙ”Í…Ù•É½ÕÀ…ÉÉ…¹•µ•¹ÑÌ¸¥¹¥Ñ¥…±¥Í•É½ÕÁÌ½¹±äÉ•‰Õ¥±‘Ì„‘…ä(€€€€¼¼Ý¡•¸Ñ¡…Ð‘…äÌ…ÑÕ…°Á±…å•Èµ•µ‰•ÉÍ¡¥À¡…Ì¡…¹•¸(€€€¥¹¥Ñ¥…±¥Í•É½ÕÁÌ ¤ì(€€€Í…Ù” ¤ì(€€€€ ˆÝ¥é…É‘M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€€€¹…Ø ‰Ñ•…µÍA…”ˆ¤ì(€ô((€™Õ¹Ñ¥½¸Á…¥É-•ä¡„°ˆ¤ì(€€€É•ÑÕÉ¸mMÑÉ¥¹œ¡„¤°MÑÉ¥¹œ¡ˆ¥t¹Í½ÉÐ ¤¹©½¥¸ ‰ðˆ¤ì(€ô(€™Õ¹Ñ¥½¸¥ÍQ•ÍÑÙ•¹Ð¡•Ù•¹Ð¤ì(€€€É•ÑÕÉ¸€½yQMQqˆ½¤¹Ñ•ÍÐ¡MÑÉ¥¹œ¡•Ù•¹Ðü¹¹…µ”ñð€ˆˆ¤¹ÑÉ¥´ ¤¤ì(€ô(€™Õ¹Ñ¥½¸Á±…å•‘Q½•Ñ¡•É½Õ¹Ð¡„°ˆ¤ì(€€€¥˜€¡MÑÉ¥¹œ¡„¤€ôôô9=}AIQ9I}%ñðMÑÉ¥¹œ¡ˆ¤€ôôô9=}AIQ9I}%¤É•ÑÕÉ¸€Àì(€€€É•ÑÕÉ¸€¬¡ÍÑ½É”¹Á…¥É!¥ÍÑ½Éäü¹mÁ…¥É-•ä¡„°ˆ¥tñð€À¤ì(€ô(€™Õ¹Ñ¥½¸Á…ÉÑ¹•É•‘½Õ¹Ð¡„°ˆ¤ì(€€€¥˜€¡MÑÉ¥¹œ¡„¤€ôôô9=}AIQ9I}%ñðMÑÉ¥¹œ¡ˆ¤€ôôô9=}AIQ9I}%¤É•ÑÕÉ¸€Àì(€€€É•ÑÕÉ¸€¬¡ÍÑ½É”¹Á…ÉÑ¹•É!¥ÍÑ½Éäü¹mÁ…¥É-•ä¡„°ˆ¥tñð€À¤ì(€ô(€™Õ¹Ñ¥½¸É½ÕÁI•Á•…ÑM½É”¡œ°‘…ä¤ì(€€€±•ÐÍ½É”€ô€Àì(€€€™½È€¡±•Ð¤€ô€Àì¤€ðœ¹±•¹Ñ ì¤¬¬¤(€€€€€™½È€¡±•Ð¨€ô¤€¬€Äì¨€ðœ¹±•¹Ñ ì¨¬¬¤ì(€€€€€€€Í½É”€¬ôÁ±…å•‘Q½•Ñ¡•É½Õ¹Ð¡m¥t°m©t¤ì(€€€€€€€€¼¼MÑÉ½¹±ä‘¥Í½ÕÉ…”É•Á•…Ñ¥¹œ…ä€ÄÉ½ÕÀµµ…Ñ•Ì½¸…ä€È¸(€€€€€€€¥˜€¡‘…ä€ø€Ä¤ì(€€€€€€€€€½¹ÍÐÄ€ô•Ù•¹Ñ…åÌ ¤¹™¥±Ñ•È¡ÁÉ•Ù¥½ÕÌôùÁÉ•Ù¥½ÕÌñ‘…ä¤¹™±…Ñ5…À¡ÁÉ•Ù¥½ÕÌôùÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ­ÁÉ•Ù¥½ÕÍtü¹É½ÕÁÍññmt¤ì(€€€€€€€€€¥˜€ (€€€€€€€€€€€Ä¹Í½µ” (€€€€€€€€€€€€€€¡½±¤€ôø(€€€€€€€€€€€€€€€½±¹Í½µ” ¡à¤€ôøMÑÉ¥¹œ¡à¤€ôôôMÑÉ¥¹œ¡m¥t¤¤€˜˜(€€€€€€€€€€€€€€€½±¹Í½µ” ¡à¤€ôøMÑÉ¥¹œ¡à¤€ôôôMÑÉ¥¹œ¡m©t¤¤°(€€€€€€€€€€€€¤(€€€€€€€€€€¤(€€€€€€€€€€€Í½É”€¬ô€ÄÈì(€€€€€€€ô(€€€€€ô(€€€€¼¼I•Á•…Ñ•€Ñ		Á…ÉÑ¹•ÉÍ¡¥ÁÌ…É”µ½É”¥µÁ½ÉÑ…¹ÐÑ¡…¸Í¥µÁ±äÍ¡…É¥¹œÑ¡”™½ÕÈ¸(€€€¥˜€¡œ¹±•¹Ñ €øô€È¤ì(€€€€€Í½É”€¬ô€È€¨Á…ÉÑ¹•É•‘½Õ¹Ð¡lÁt°lÅt¤ì(€€€€€¥˜€¡‘…ä€ø€Ä¤ì(€€€€€€€½¹ÍÐÄ€ô•Ù•¹Ñ…åÌ ¤¹™¥±Ñ•È¡ÁÉ•Ù¥½ÕÌôùÁÉ•Ù¥½ÕÌñ‘…ä¤¹™±…Ñ5…À¡ÁÉ•Ù¥½ÕÌôùÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ­ÁÉ•Ù¥½ÕÍtü¹É½ÕÁÍññmt¤ì(€€€€€€€¥˜€ (€€€€€€€€€Ä¹Í½µ” (€€€€€€€€€€€€¡½±¤€ôø(€€€€€€€€€€€€€½±¹±•¹Ñ €øô€È€˜˜(€€€€€€€€€€€€€Á…¥É-•ä¡½±‘lÁt°½±‘lÅt¤€ôôôÁ…¥É-•ä¡lÁt°lÅt¤°(€€€€€€€€€€¤(€€€€€€€€¤(€€€€€€€€€Í½É”€¬ô€ÈÔì(€€€€€€€¥˜€ (€€€€€€€€€Ä¹Í½µ” (€€€€€€€€€€€€¡½±¤€ôø(€€€€€€€€€€€€€½±¹±•¹Ñ €øô€Ð€˜˜(€€€€€€€€€€€€€Á…¥É-•ä¡½±‘lÉt°½±‘lÍt¤€ôôôÁ…¥É-•ä¡lÁt°lÅt¤°(€€€€€€€€€€¤(€€€€€€€€¤(€€€€€€€€€Í½É”€¬ô€ÈÔì(€€€€€ô(€€€ô(€€€¥˜€¡œ¹±•¹Ñ €øô€Ð¤ì(€€€€€Í½É”€¬ô€È€¨Á…ÉÑ¹•É•‘½Õ¹Ð¡lÉt°lÍt¤ì(€€€€€¥˜€¡‘…ä€ø€Ä¤ì(€€€€€€€½¹ÍÐÄ€ô•Ù•¹Ñ…åÌ ¤¹™¥±Ñ•È¡ÁÉ•Ù¥½ÕÌôùÁÉ•Ù¥½ÕÌñ‘…ä¤¹™±…Ñ5…À¡ÁÉ•Ù¥½ÕÌôùÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ­ÁÉ•Ù¥½ÕÍtü¹É½ÕÁÍññmt¤ì(€€€€€€€¥˜€ (€€€€€€€€€Ä¹Í½µ” (€€€€€€€€€€€€¡½±¤€ôø(€€€€€€€€€€€€€½±¹±•¹Ñ €øô€È€˜˜(€€€€€€€€€€€€€Á…¥É-•ä¡½±‘lÁt°½±‘lÅt¤€ôôôÁ…¥É-•ä¡lÉt°lÍt¤°(€€€€€€€€€€¤(€€€€€€€€¤(€€€€€€€€€Í½É”€¬ô€ÈÔì(€€€€€€€¥˜€ (€€€€€€€€€Ä¹Í½µ” (€€€€€€€€€€€€¡½±¤€ôø(€€€€€€€€€€€€€½±¹±•¹Ñ €øô€Ð€˜˜(€€€€€€€€€€€€€Á…¥É-•ä¡½±‘lÉt°½±‘lÍt¤€ôôôÁ…¥É-•ä¡lÉt°lÍt¤°(€€€€€€€€€€¤(€€€€€€€€¤(€€€€€€€€€Í½É”€¬ô€ÈÔì(€€€€€ô(€€€ô(€€€É•ÑÕÉ¸Í½É”ì(€ô(€™Õ¹Ñ¥½¸‘É…ÝI•Á•…ÑM½É”¡É½ÕÁÌ°‘…ä¤ì(€€€É•ÑÕÉ¸É½ÕÁÌ¹É•‘Õ” ¡¸°œ¤€ôø¸€¬É½ÕÁI•Á•…ÑM½É”¡œ°‘…ä¤°€À¤ì(€ô(€™Õ¹Ñ¥½¸™½ÕÉ‰…±±É…ÝM¥¹…ÑÕÉ”¡É½ÕÁÌ¤ì(€€€É•ÑÕÉ¸É½ÕÁÌ(€€€€€€¹µ…À ¡œ¤€ôøì(€€€€€€€½¹ÍÐÁ…¥ÉÌ€ômtì(€€€€€€€™½È€¡±•Ð¤€ô€Àì¤€ðœ¹±•¹Ñ ì¤€¬ô€È¤(€€€€€€€€€Á…¥ÉÌ¹ÁÕÍ  (€€€€€€€€€€€œ(€€€€€€€€€€€€€€¹Í±¥”¡¤°¤€¬€È¤(€€€€€€€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤(€€€€€€€€€€€€€€¹Í½ÉÐ ¤(€€€€€€€€€€€€€€¹©½¥¸ ˆ°ˆ¤°(€€€€€€€€€€¤ì(€€€€€€€É•ÑÕÉ¸Á…¥ÉÌ¹Í½ÉÐ ¤¹©½¥¸ ˆ¼ˆ¤ì(€€€€€ô¤(€€€€€€¹Í½ÉÐ ¤(€€€€€€¹©½¥¸ ‰ðˆ¤ì(€ô(€™Õ¹Ñ¥½¸É•Á•…ÑÍ…äÅ½ÕÉ‰…±°¡É½ÕÁÌ°‘…ä€ô€È¤ì(€€€½¹ÍÐ½±‘A…¥ÉÌ€ô¹•ÜM•Ð (€€€€€•Ù•¹Ñ…åÌ ¤¹™¥±Ñ•È¡ÁÉ•Ù¥½ÕÌôùÁÉ•Ù¥½ÕÌñ‘…ä¤¹™±…Ñ5…À¡ÁÉ•Ù¥½ÕÌôùÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ­ÁÉ•Ù¥½ÕÍtü¹É½ÕÁÍññmt¤(€€€€€€€€¹™±…Ñ5…À ¡œ¤€ôømœ¹Í±¥” À°€È¤°œ¹Í±¥” È°€Ð¥t¤(€€€€€€€€¹™¥±Ñ•È (€€€€€€€€€€¡À¤€ôøÀ¹±•¹Ñ €ôôô€È€˜˜€…À¹Í½µ” ¡à¤€ôøMÑÉ¥¹œ¡à¤€ôôô9=}AIQ9I}%¤°(€€€€€€€€¤(€€€€€€€€¹µ…À ¡À¤€ôøÁ…¥É-•ä¡ÁlÁt°ÁlÅt¤¤°(€€€€¤ì(€€€É•ÑÕÉ¸É½ÕÁÌ¹Í½µ” ¡œ¤€ôø(€€€€€mœ¹Í±¥” À°€È¤°œ¹Í±¥” È°€Ð¥t¹Í½µ” (€€€€€€€€¡À¤€ôø(€€€€€€€€€À¹±•¹Ñ €ôôô€È€˜˜(€€€€€€€€€€…À¹Í½µ” ¡à¤€ôøMÑÉ¥¹œ¡à¤€ôôô9=}AIQ9I}%¤€˜˜(€€€€€€€€€½±‘A…¥ÉÌ¹¡…Ì¡Á…¥É-•ä¡ÁlÁt°ÁlÅt¤¤°(€€€€€€¤°(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸¡¥ÍÑ½Éå	…±…¹•‘É½ÕÁÌ¡¥‘Ì°‘…ä¤ì(€€€½¹ÍÐÍ••¸€ô¹•ÜM•Ð ¤°(€€€€€…¹‘¥‘…Ñ•Ì€ômtì(€€€™½È€¡±•Ð¸€ô€Àì¸€ð€ÄàÀÀì¸¬¬¤ì(€€€€€½¹ÍÐ…¹€ôµ…­•É½ÕÁÌ¡Í¡Õ™™±•½Áä¡¥‘Ì¤°‘…ä¤ì(€€€€€½¹ÍÐÍ¥¹…ÑÕÉ”€ô™½ÕÉ‰…±±É…ÝM¥¹…ÑÕÉ”¡…¹¤ì(€€€€€¥˜€¡Í••¸¹¡…Ì¡Í¥¹…ÑÕÉ”¤¤½¹Ñ¥¹Õ”ì(€€€€€Í••¸¹…‘¡Í¥¹…ÑÕÉ”¤ì(€€€€€…¹‘¥‘…Ñ•Ì¹ÁÕÍ ¡ì(€€€€€€€É½ÕÁÌè…¹°(€€€€€€€Í½É”è‘É…ÝI•Á•…ÑM½É”¡…¹°‘…ä¤°(€€€€€€€É•Á•…ÑÍA…ÉÑ¹•Èè‘…ä€ø€Ä€˜˜É•Á•…ÑÍ…äÅ½ÕÉ‰…±°¡…¹°‘…ä¤°(€€€€€ô¤ì(€€€ô(€€€¥˜€ ……¹‘¥‘…Ñ•Ì¹±•¹Ñ ¤É•ÑÕÉ¸µ…­•É½ÕÁÌ¡¥‘Ì°‘…ä¤ì(€€€½¹ÍÐ•±¥¥‰±”€ô(€€€€€‘…ä€ø€Ä€˜˜…¹‘¥‘…Ñ•Ì¹Í½µ” ¡à¤€ôø€…à¹É•Á•…ÑÍA…ÉÑ¹•È¤(€€€€€€€€ü…¹‘¥‘…Ñ•Ì¹™¥±Ñ•È ¡à¤€ôø€…à¹É•Á•…ÑÍA…ÉÑ¹•È¤(€€€€€€€€è…¹‘¥‘…Ñ•Ìì(€€€•±¥¥‰±”¹Í½ÉÐ ¡„°ˆ¤€ôø„¹Í½É”€´ˆ¹Í½É”¤ì(€€€½¹ÍÐ‰•ÍÐ€ô•±¥¥‰±•lÁt¹Í½É”ì(€€€€¼¼±±½Ü„™•Ü¹•…Èµ•ÅÕ…°½½Í½±ÕÑ¥½¹ÌÍ¼É•Á•…Ñ•±¥­Ì…¸Í¡½Ü…¹½Ñ¡•ÈÍ•¹Í¥‰±”‘É…Ü¸(€€€½¹ÍÐÍ¡½ÉÑ±¥ÍÐ€ô•±¥¥‰±”¹™¥±Ñ•È ¡à¤€ôøà¹Í½É”€ðô‰•ÍÐ€¬€È¤¹Í±¥” À°€ÄÈ¤ì(€€€É•ÑÕÉ¸Í¡½ÉÑ±¥ÍÑm5…Ñ ¹™±½½È¡5…Ñ ¹É…¹‘½´ ¤€¨Í¡½ÉÑ±¥ÍÐ¹±•¹Ñ ¥t¹É½ÕÁÌì(€ô(€™Õ¹Ñ¥½¸‘É…Ý5¥á¥¹MÑ…ÑÌ¡‘É…Ü¤ì(€€€½¹ÍÐÉ½ÕÁÌ€ô¹•Ü5…À ¤°Á…ÉÑ¹•ÉÌ€ô¹•Ü5…À ¤°µ…Ñ•Ì€ô¹•Ü5…À ¤ì(€€€™½È€¡½¹ÍÐm‘…ä°Ñ•…µÍt½˜=‰©•Ð¹•¹ÑÉ¥•Ì¡‘É…Ü¤¤™½È€¡½¹ÍÐÑ•…´½˜Ñ•…µÌ¤ì(€€€€€½¹ÍÐÉ•…°€ôÑ•…´¹™¥±Ñ•È¡¥€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤¹µ…À¡MÑÉ¥¹œ¤ì(€€€€€™½È€¡½¹ÍÐ¥½˜É•…°¤¥˜€ …µ…Ñ•Ì¹¡…Ì¡¥¤¤µ…Ñ•Ì¹Í•Ð¡¥°¹•ÜM•Ð ¤¤ì(€€€€€™½È€¡±•Ð¤ôÀí¤ñÉ•…°¹±•¹Ñ í¤¬¬¤™½È€¡±•Ð¨õ¤¬Äí¨ñÉ•…°¹±•¹Ñ í¨¬¬¤ì(€€€€€€€½¹ÍÐ­•äõÁ…¥É-•ä¡É•…±m¥t±É•…±m©t¤ì(€€€€€€€É½ÕÁÌ¹Í•Ð¡­•ä±l¸¸¸¡É½ÕÁÌ¹•Ð¡­•ä¥ññmt¤°­‘…åt¤ì(€€€€€€€µ…Ñ•Ì¹•Ð¡É•…±m¥t¤¹…‘¡É•…±m©t¤íµ…Ñ•Ì¹•Ð¡É•…±m©t¤¹…‘¡É•…±m¥t¤ì(€€€€€ô(€€€€€™½È€¡½¹ÍÐÁ…¥È½˜mÑ•…´¹Í±¥” À°È¤±Ñ•…´¹Í±¥” È°Ð¥t¤ì(€€€€€€€¥˜€¡Á…¥È¹±•¹Ñ „ôôÈñðÁ…¥È¹Í½µ”¡¥ôùMÑÉ¥¹œ¡¥¤ôôõ9=}AIQ9I}%¤¤½¹Ñ¥¹Õ”ì(€€€€€€€½¹ÍÐ­•äõÁ…¥É-•ä ¸¸¹Á…¥È¤íÁ…ÉÑ¹•ÉÌ¹Í•Ð¡­•ä±l¸¸¸¡Á…ÉÑ¹•ÉÌ¹•Ð¡­•ä¥ññmt¤°­‘…åt¤ì(€€€€€ô(€€€ô(€€€½¹ÍÐÉ•Á•…Ñ•€ôµ…À€ôøl¸¸¹µ…Át¹™¥±Ñ•È ¡l±‘…åÍt¤ôù‘…åÌ¹±•¹Ñ øÄ¤¹µ…À ¡m­•ä±‘…åÍt¤ôø¡í¥‘Ìé­•ä¹ÍÁ±¥Ð ðœ¤±‘…åÍô¤¤ì(€€€É•ÑÕÉ¸íÉ½ÕÁI•Á•…ÑÌéÉ•Á•…Ñ•¡É½ÕÁÌ¤±Á…ÉÑ¹•ÉI•Á•…ÑÌéÉ•Á•…Ñ•¡Á…ÉÑ¹•ÉÌ¤°(€€€€€É½ÕÁI•Á•…Ñ¹½Õ¹Ñ•ÉÌél¸¸¹É½ÕÁÌ¹Ù…±Õ•Ì ¥t¹É•‘Õ” ¡¸±‘Ì¤ôù¸­5…Ñ ¹µ…à À±‘Ì¹±•¹Ñ ´Ä¤°À¤°(€€€€€Á…ÉÑ¹•ÉI•Á•…Ñ¹½Õ¹Ñ•ÉÌél¸¸¹Á…ÉÑ¹•ÉÌ¹Ù…±Õ•Ì ¥t¹É•‘Õ” ¡¸±‘Ì¤ôù¸­5…Ñ ¹µ…à À±‘Ì¹±•¹Ñ ´Ä¤°À¤°(€€€€€‘¥ÍÑ¥¹Ñ5…Ñ•Ìé=‰©•Ð¹™É½µ¹ÑÉ¥•Ì¡l¸¸¹µ…Ñ•Ít¹µ…À ¡m¥±Í••¹t¤ôùm¥±Í••¸¹Í¥é•t¤¥ôì(€ô(€™Õ¹Ñ¥½¸µ…á¥µÕµ5¥á¥¹É…Ü¡™¥•±‘Ì¤ì(€€€½¹ÍÐ‘…åÌõ=‰©•Ð¹­•åÌ¡™¥•±‘Ì¤¹µ…À¡9Õµ‰•È¤¹Í½ÉÐ ¡„±ˆ¤ôù„µˆ¤°™¥ÉÍÐõ™¥•±‘Ím‘…åÍlÁutñðmtì(€€€½¹ÍÐ•á…Ðõ™¥ÉÍÐ¹±•¹Ñ ôôôÄØ€˜˜‘…åÌ¹±•¹Ñ ðôÔ€˜˜‘…åÌ¹•Ù•Éä¡‘…äôø(€€€€€™¥•±‘Ím‘…åt¹±•¹Ñ ôôôÄØ€˜˜l¸¸¹™¥•±‘Ím‘…åut¹µ…À¡MÑÉ¥¹œ¤¹Í½ÉÐ ¤¹©½¥¸ ðœ¤ôôõl¸¸¹™¥ÉÍÑt¹µ…À¡MÑÉ¥¹œ¤¹Í½ÉÐ ¤¹©½¥¸ ðœ¤¤ì(€€€¥˜€¡•á…Ð¤ì(€€€€€€¼¼1¥¹•Ì½˜Ñ¡”…™™¥¹”Á±…¹”½Ù•È Ð¤è™¥Ù”Á…ÉÑ¥Ñ¥½¹Ì½˜Í¥áÑ••¸(€€€€€€¼¼Á½¥¹ÑÌ¥¹Ñ¼™½ÕÉÌ¸Ù•ÉäÁ…¥È½˜Á½¥¹ÑÌ±¥•Ì½¸•á…Ñ±ä½¹”±¥¹”¸(€€€€€½¹ÍÐ¥‘ÌõÍ¡Õ™™±•½Áä¡™¥ÉÍÐ¤°Í±½Á•ÌõÍ¡Õ™™±•½Áä¡lÀ°Ä°È°Ì°Ñt¤ì(€€€€€½¹ÍÐµÕ±Ñ¥Á±äô¡„±ˆ¤ôùí±•ÐÉ•ÍÕ±ÐôÀí™½È¡±•Ð¤ôÀí¤ðÈí¤¬¬¥í¥˜¡ˆ˜Ä¥É•ÍÕ±Ñxõ„íˆøøôÄí„ððôÄí¥˜¡„˜Ð¥…xôÜíõÉ•ÑÕÉ¸É•ÍÕ±Ðíôì(€€€€€É•ÑÕÉ¸=‰©•Ð¹™É½µ¹ÑÉ¥•Ì¡‘…åÌ¹µ…À ¡‘…ä±¥¹‘•à¤ôùì(€€€€€€€½¹ÍÐÍ±½Á”õÍ±½Á•Ím¥¹‘•át°Ñ•…µÌõmtì(€€€€€€€™½È¡±•Ð¥¹Ñ•É•ÁÐôÀí¥¹Ñ•É•ÁÐðÐí¥¹Ñ•É•ÁÐ¬¬¤ì(€€€€€€€€€½¹ÍÐÉ½ÕÀõmtì(€€€€€€€€€™½È¡±•ÐàôÀíàðÐíà¬¬¤ì(€€€€€€€€€€€½¹ÍÐäõÍ±½Á”ôôôÐýàéµÕ±Ñ¥Á±ä¡Í±½Á”±à¥y¥¹Ñ•É•ÁÐì(€€€€€€€€€€€É½ÕÀ¹ÁÕÍ ¡¥‘ÍmÍ±½Á”ôôôÐý¥¹Ñ•É•ÁÐ¨Ð­äéà¨Ð­åt¤ì(€€€€€€€€€ô(€€€€€€€€€Ñ•…µÌ¹ÁÕÍ ¡Í¡Õ™™±•½Áä¡É½ÕÀ¤¤ì(€€€€€€€ô(€€€€€€€É•ÑÕÉ¸m‘…ä±Í¡Õ™™±•½Áä¡Ñ•…µÌ¥tì(€€€€€ô¤¤ì(€€€ô(€€€€¼¼½È½Ñ¡•È™¥•±Í¥é•Ì½…ÑÑ•¹‘…¹”°Í•…É ½µÁ±•Ñ”Í¡•‘Õ±•ÌÉ…Ñ¡•È(€€€€¼¼Ñ¡…¸½µµ¥ÑÑ¥¹œ½¹”‘…ä…Ð„Ñ¥µ”¸I•Á•…Ñ•Á…ÉÑ¹•ÉÌÑ…­”ÁÉ¥½É¥Ñä¸(€€€±•Ð‰•ÍÐõ¹Õ±°±‰•ÍÑM½É”õ%¹™¥¹¥Ñäì(€€€™½È¡±•Ð…ÑÑ•µÁÐôÀí…ÑÑ•µÁÐðÌÀí…ÑÑ•µÁÐ¬¬¤ì(€€€€€½¹ÍÐ‘É…Üõíô±É½ÕÁ½Õ¹ÑÌõ¹•Ü5…À ¤±Á…ÉÑ¹•É½Õ¹ÑÌõ¹•Ü5…À ¤ì(€€€€€™½È¡½¹ÍÐ‘…ä½˜‘…åÌ¤ì(€€€€€€€±•Ð¡½Í•¸õ¹Õ±°±¡½Í•¹M½É”õ%¹™¥¹¥Ñäì(€€€€€€€™½È¡±•ÐÑÉ¥…°ôÀíÑÉ¥…°ðÐÔíÑÉ¥…°¬¬¤ì(€€€€€€€€€½¹ÍÐÑ•…µÌõµ…­•É½ÕÁÌ¡Í¡Õ™™±•½Áä¡™¥•±‘Ím‘…åt¤±‘…ä¤í±•ÐÍ½É”ôÀì(€€€€€€€€€™½È¡½¹ÍÐÑ•…´½˜Ñ•…µÌ¤ì(€€€€€€€€€€€½¹ÍÐÉ•…°õÑ•…´¹™¥±Ñ•È¡¥ôùMÑÉ¥¹œ¡¥¤„ôõ9=}AIQ9I}%¤ì(€€€€€€€€€€€™½È¡±•Ð¤ôÀí¤ñÉ•…°¹±•¹Ñ í¤¬¬¥™½È¡±•Ð¨õ¤¬Äí¨ñÉ•…°¹±•¹Ñ í¨¬¬¥Í½É”¬ôÄÀ¨¡É½ÕÁ½Õ¹ÑÌ¹•Ð¡Á…¥É-•ä¡É•…±m¥t±É•…±m©t¤¥ñðÀ¤ì(€€€€€€€€€€€™½È¡½¹ÍÐÁ…¥È½˜mÑ•…´¹Í±¥” À°È¤±Ñ•…´¹Í±¥” È°Ð¥t¥¥˜¡Á…¥È¹±•¹Ñ ôôôÈ˜˜…Á…¥È¹¥¹±Õ‘•Ì¡9=}AIQ9I}%¤¥Í½É”¬ôÄÀÀ¨¡Á…ÉÑ¹•É½Õ¹ÑÌ¹•Ð¡Á…¥É-•ä ¸¸¹Á…¥È¤¥ñðÀ¤ì(€€€€€€€€€ô(€€€€€€€€€¥˜¡Í½É”ñ¡½Í•¹M½É”¥í¡½Í•¸õÑ•…µÌí¡½Í•¹M½É”õÍ½É”íô(€€€€€€€€€¥˜¡Í½É”ôôôÀ¥‰É•…¬ì(€€€€€€€ô(€€€€€€€‘É…Ým‘…åtõ¡½Í•¸ì(€€€€€€€™½È¡½¹ÍÐÑ•…´½˜¡½Í•¸¤ì(€€€€€€€€€½¹ÍÐÉ•…°õÑ•…´¹™¥±Ñ•È¡¥ôùMÑÉ¥¹œ¡¥¤„ôõ9=}AIQ9I}%¤ì(€€€€€€€€€™½È¡±•Ð¤ôÀí¤ñÉ•…°¹±•¹Ñ í¤¬¬¥™½È¡±•Ð¨õ¤¬Äí¨ñÉ•…°¹±•¹Ñ í¨¬¬¥í½¹ÍÐ¬õÁ…¥É-•ä¡É•…±m¥t±É•…±m©t¤íÉ½ÕÁ½Õ¹ÑÌ¹Í•Ð¡¬°¡É½ÕÁ½Õ¹ÑÌ¹•Ð¡¬¥ñðÀ¤¬Ä¤íô(€€€€€€€€€™½È¡½¹ÍÐÁ…¥È½˜mÑ•…´¹Í±¥” À°È¤±Ñ•…´¹Í±¥” È°Ð¥t¥¥˜¡Á…¥È¹±•¹Ñ ôôôÈ˜˜…Á…¥È¹¥¹±Õ‘•Ì¡9=}AIQ9I}%¤¥í½¹ÍÐ¬õÁ…¥É-•ä ¸¸¹Á…¥È¤íÁ…ÉÑ¹•É½Õ¹ÑÌ¹Í•Ð¡¬°¡Á…ÉÑ¹•É½Õ¹ÑÌ¹•Ð¡¬¥ñðÀ¤¬Ä¤íô(€€€€€€€ô(€€€€€ô(€€€€€½¹ÍÐÍÑ…ÑÌõ‘É…Ý5¥á¥¹MÑ…ÑÌ¡‘É…Ü¤°½Õ¹ÑÌõ=‰©•Ð¹Ù…±Õ•Ì¡ÍÑ…ÑÌ¹‘¥ÍÑ¥¹Ñ5…Ñ•Ì¤ì(€€€€€½¹ÍÐÍ½É”ôÄÀÀÀÀ©ÍÑ…ÑÌ¹Á…ÉÑ¹•ÉI•Á•…Ñ¹½Õ¹Ñ•ÉÌ¬ÄÀÀ©ÍÑ…ÑÌ¹É½ÕÁI•Á•…Ñ¹½Õ¹Ñ•ÉÌ¬¡5…Ñ ¹µ…à ¸¸¹½Õ¹ÑÌ°À¤µ5…Ñ ¹µ¥¸ ¸¸¹½Õ¹ÑÌ¤¤ì(€€€€€¥˜¡Í½É”ñ‰•ÍÑM½É”¥í‰•ÍÐõ‘É…Üí‰•ÍÑM½É”õÍ½É”íô(€€€€€¥˜¡Í½É”ôôôÀ¥‰É•…¬ì(€€€ô(€€€É•ÑÕÉ¸‰•ÍÐì(€ô(€™Õ¹Ñ¥½¸µ¥á¥¹MÕµµ…Éå!Ñµ°¡•Ù•¹ÐõÍÑ½É”¹•Ù•¹Ð¤ì(€€€½¹ÍÐ‘É…Üõ=‰©•Ð¹™É½µ¹ÑÉ¥•Ì¡•Ù•¹Ñ…åÌ¡•Ù•¹Ð¤¹µ…À¡‘…äôùm‘…ä±•Ù•¹Ð¹É½ÕÁM•ÑÕÀü¹l‘…äœ­‘…åtü¹É½ÕÁÍññmut¤¤ì(€€€½¹ÍÐÍÑ…ÑÌõ‘É…Ý5¥á¥¹MÑ…ÑÌ¡‘É…Ü¤°½Õ¹ÑÌõ=‰©•Ð¹Ù…±Õ•Ì¡ÍÑ…ÑÌ¹‘¥ÍÑ¥¹Ñ5…Ñ•Ì¤ì(€€€¥˜ …½Õ¹ÑÌ¹±•¹Ñ ¥É•ÑÕÉ¸€œœì(€€€½¹ÍÐÉ•Á•…ÑÌô¡É½ÝÌ¤ôùÉ½ÝÌ¹µ…À¡É½Üôù€ñ±¤ø‘íÉ½Ü¹¥‘Ì¹µ…À¡¥ôù•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ•ñðA±…å•Èœ¤¤¹©½¥¸ œ€™…µÀì€œ¥ôƒŠP…åÌ€‘íÉ½Ü¹‘…åÌ¹©½¥¸ œ°€œ¥ôð½±¤ù€¤¹©½¥¸ œœ¤ì(€€€½¹ÍÐ±½Üõ5…Ñ ¹µ¥¸ ¸¸¹½Õ¹ÑÌ¤±¡¥ õ5…Ñ ¹µ…à ¸¸¹½Õ¹ÑÌ¤ì(€€€É•ÑÕÉ¸€ñÍ•Ñ¥½¸±…ÍÌô‰¹ÑÁ	½àµ¥á¥¹MÕµµ…ÉäˆøñˆùA±…å•È5¥á¥¹œƒŠPÝ¡½±”•Ù•¹Ðð½ˆøñÀùI•Á•…Ñ•€Ñ		Á…ÉÑ¹•ÉÍ¡¥ÁÌè€ñÍÑÉ½¹œø‘íÍÑ…ÑÌ¹Á…ÉÑ¹•ÉI•Á•…ÑÌ¹±•¹Ñ¡ôð½ÍÑÉ½¹œøƒ
ÜI•Á•…Ñ•É½ÕÁµ…Ñ”½µ‰¥¹…Ñ¥½¹Ìè€ñÍÑÉ½¹œø‘íÍÑ…ÑÌ¹É½ÕÁI•Á•…ÑÌ¹±•¹Ñ¡ôð½ÍÑÉ½¹œø¸ð½ÀøñÀù¥™™•É•¹ÐÉ½ÕÁµ…Ñ•ÌÁ•È½±™•Èè€ñÍÑÉ½¹œø‘í±½Üôôõ¡¥ ý±½Üé±½Ü¬ŸŠLœ­¡¥¡ôð½ÍÑÉ½¹œø¸½Õ¹ÑÌ½Ù•ÈÑ¡”ÕÉÉ•¹Ð‘É…Ü…É½ÍÌ…±°Á±…å¥¹œ‘…åÌ°¥¹±Õ‘¥¹œÍ…Ù•Ñ•…µÌ¸ð½Àø‘íÍÑ…ÑÌ¹Á…ÉÑ¹•ÉI•Á•…ÑÌ¹±•¹Ñ¡ññÍÑ…ÑÌ¹É½ÕÁI•Á•…ÑÌ¹±•¹Ñ ý€ñ‘•Ñ…¥±ÌøñÍÕµµ…ÉäùI•Ù¥•ÜÉ•Á•…Ñ•½µ‰¥¹…Ñ¥½¹Ìð½ÍÕµµ…Éäøñ ÐùI•Á•…Ñ•€Ñ		Á…ÉÑ¹•ÉÌð½ Ðø‘íÍÑ…ÑÌ¹Á…ÉÑ¹•ÉI•Á•…ÑÌ¹±•¹Ñ ý€ñÕ°ø‘íÉ•Á•…ÑÌ¡ÍÑ…ÑÌ¹Á…ÉÑ¹•ÉI•Á•…ÑÌ¥ôð½Õ°ù€èœñÀù9½¹”¸ð½Àøôñ ÐùI•Á•…Ñ•É½ÕÁµ…Ñ•Ì€¡¥¹±Õ‘¥¹œÁ…ÉÑ¹•ÉÌ¤ð½ ÐøñÕ°ø‘íÉ•Á•…ÑÌ¡ÍÑ…ÑÌ¹É½ÕÁI•Á•…ÑÌ¥ôð½Õ°øð½‘•Ñ…¥±Ìù€èœôð½Í•Ñ¥½¸ù€ì(€ô(€™Õ¹Ñ¥½¸±½­±±Ù•¹ÑQ•…µÌ ¤ì(€€€½¹ÍÐ•Ù•¹ÐõÍÑ½É”¹•Ù•¹Ðì(€€€¥˜ …•Ù•¹Ðñð•Ù•¹Ð¹±½­•ñð•Ù•¹Ð¹Á…ÍÑÙ•¹ÑI•…‘=¹±ä¥É•ÑÕÉ¸ì(€€€½¹ÍÐ‘…åÌõ•Ù•¹Ñ…åÌ¡•Ù•¹Ð¤ì(€€€½¹ÍÐ¥¹½µÁ±•Ñ”õ‘…åÌ¹™¥±Ñ•È¡‘…äôùì(€€€€€½¹ÍÐÍ•ÑÕÀõ•Ù•¹Ð¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ­‘…åt±¥‘Ìõ‘…å¥•±‘%‘Ì¡‘…ä¤¹µ…À¡MÑÉ¥¹œ¤¹Í½ÉÐ ¤ì(€€€€€½¹ÍÐ‘É…Ý¸ô¡Í•ÑÕÀü¹É½ÕÁÍññmt¤¹™±…Ð ¤¹µ…À¡MÑÉ¥¹œ¤¹™¥±Ñ•È¡¥ôù¥„ôõ9=}AIQ9I}%¤¹Í½ÉÐ ¤ì(€€€€€É•ÑÕÉ¸¥‘Ì¹±•¹Ñ ðÐñð¥‘Ì¹©½¥¸ ‰ðˆ¤„ôõ‘É…Ý¸¹©½¥¸ ‰ðˆ¤ì(€€€ô¤ì(€€€¥˜¡¥¹½µÁ±•Ñ”¹±•¹Ñ ¥É•ÑÕÉ¸…±•ÉÐ¡I•Ù¥•ÜÑ¡”Á±…å•È±¥ÍÑÌ…¹Ñ•…µÌ™½È…ä€‘í¥¹½µÁ±•Ñ”¹©½¥¸ ˆ°…ä€ˆ¥ô‰•™½É”±½­¥¹œ…±°Ñ•…µÌ¹€¤ì(€€€½¹ÍÐÁÉ•Ù¥½ÕÌõ)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡•Ù•¹Ð¹É½ÕÁM•ÑÕÀ¤¤ì(€€€½¹ÍÐ½±‘MÝ…Àõ•Ù•¹Ð¹ÍÝ…ÁA±…å•È±½±‘=É‘•Èõ•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€ÑÉäì(€€€€€™½È¡½¹ÍÐ‘…ä½˜‘…åÌ¥í½¹ÍÐÍ•ÑÕÀõ•Ù•¹Ð¹É½ÕÁM•ÑÕÁl‰‘…äˆ­‘…åtí•¹ÍÕÉ•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡Í•ÑÕÀ±‘…ä¤íÍ•ÑÕÀ¹Í…Ù•õÑÉÕ”íô(€€€€€•Ù•¹Ð¹ÍÝ…ÁA±…å•Èõ¹Õ±°í‘•±•Ñ”•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€€€¥˜¡Í…Ù” ¤ôôõ™…±Í”¥Ñ¡É½Ü¹•ÜÉÉ½È ‰M…Ù¥¹œ‘¥¹½Ð½µÁ±•Ñ”¸A±•…Í”ÑÉä……¥¸¸ˆ¤ì(€€€ô…Ñ ¡•ÉÉ½È¤ì(€€€€€•Ù•¹Ð¹É½ÕÁM•ÑÕÀõÁÉ•Ù¥½ÕÌí•Ù•¹Ð¹ÍÝ…ÁA±…å•Èõ½±‘MÝ…Àí•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àõ½±‘=É‘•Èì(€€€€€…±•ÉÐ ‰Q•…µÌ½Õ±¹½Ð‰”±½­•è€ˆ­•ÉÉ½È¹µ•ÍÍ…”¤ì(€€€ô(€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€ô(€™Õ¹Ñ¥½¸…ÁÁ±å5…á¥µÕµA±…å•É5¥á¥¹œ ¤ì(€€€½¹ÍÐ•Ù•¹ÐõÍÑ½É”¹•Ù•¹Ð±‘…åÌõ•Ù•¹Ñ…åÌ¡•Ù•¹Ð¤ì(€€€¥˜¡•Ù•¹Ð¹±½­•ñð•Ù•¹Ð¹Á…ÍÑÙ•¹ÑI•…‘=¹±äñð‘…åÌ¹Í½µ”¡‘…äôù™¥ÉÍÑ…åM½É•¹ÑÉä¡‘…ä¤ñð=‰©•Ð¹­•åÌ¡•Ù•¹Ð¹µ…¹Õ…±M½É•…É‘Ìü¹l‰‘…äˆ­‘…åtü¹É½ÕÁÌñðíô¤¹±•¹Ñ ¤¥É•ÑÕÉ¸…±•ÉÐ 5…á¥µÕ´A±…å•È5¥á¥¹œ¥Ì…Ù…¥±…‰±”‰•™½É”Ñ¡”•Ù•¹Ð¥Ì±½­•½ÈÍ½É¥¹œÍÑ…ÉÑÌ¸œ¤ì(€€€¥˜¡•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌ€˜˜=‰©•Ð¹­•åÌ¡•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌ¤¹±•¹Ñ ¥É•ÑÕÉ¸…±•ÉÐ ¸•µ•É•¹äÉ•Á±…•µ•¹Ð¥Ì…±É•…‘ä…ÍÍ¥¹•¸-••ÀÑ¡”•á¥ÍÑ¥¹œÑ•…µÌ½ÈÉ•Í½±Ù”Ñ¡”É•Á±…•µ•¹Ð‰•™½É”‘É…Ý¥¹œÑ¡”Ý¡½±”•Ù•¹Ð……¥¸¸œ¤ì(€€€½¹ÍÐ™¥•±‘Ìõ=‰©•Ð¹™É½µ¹ÑÉ¥•Ì¡‘…åÌ¹µ…À¡‘…äôùm‘…ä±‘…å¥•±‘%‘Ì¡‘…ä¥t¤¤ì(€€€¥˜¡‘…åÌ¹Í½µ”¡‘…äôù™¥•±‘Ím‘…åt¹±•¹Ñ ðÐ¤¥É•ÑÕÉ¸…±•ÉÐ M•±•Ð…Ð±•…ÍÐ™½ÕÈÁ±…å•ÉÌ½¸•Ù•ÉäÁ±…å¥¹œ‘…ä‰•™½É”‘É…Ý¥¹œÑ¡”Ý¡½±”•Ù•¹Ð¸œ¤ì(€€€¥˜ …½¹™¥É´ É…Ü…±°Á±…å¥¹œ‘…åÌÕÍ¥¹œ5…á¥µÕ´A±…å•È5¥á¥¹œüQ¡¥ÌÉ•Á±…•ÌÑ¡”ÕÉÉ•¹ÐÑ•…µÌ…¹€Ñ		Á…ÉÑ¹•ÉÍ¡¥ÁÌ°¥¹±Õ‘¥¹œÍ…Ù•‘…åÌ¸¡•¬…¹Í…Ù”•… ‘…ä…™Ñ•ÉÝ…É‘Ì¸œ¤¥É•ÑÕÉ¸ì(€€€½¹ÍÐ‘É…Üõµ…á¥µÕµ5¥á¥¹É…Ü¡™¥•±‘Ì¤ì(€€€™½È¡½¹ÍÐ‘…ä½˜‘…åÌ¤ì(€€€€€½¹ÍÐ­•äô‘…äœ­‘…ä±Í•ÑÕÀõ•Ù•¹Ð¹É½ÕÁM•ÑÕÁm­•åtì(€€€€€Í•ÑÕÀ¹É½ÕÁÌõ‘É…Ým‘…åtíÍ•ÑÕÀ¹ÍÑ…ÉÑÌõ‘•™…Õ±ÑMÑ…ÉÑÌ¡Í•ÑÕÀ¹É½ÕÁÌ±ÍÑ…ÉÑ5•Ñ¡½‘½È¡•Ù•¹Ð±‘…ä¤±‘…ä¤íÍ•ÑÕÀ¹Í…Ù•õ™…±Í”ì(€€€€€‘•±•Ñ”Í•ÑÕÀ¹Í¡½ÉÑQ•…µÌí‘•±•Ñ”Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•Èí‘•±•Ñ”Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•Èí‘•±•Ñ”Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌì(€€€€€•¹ÍÕÉ•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡Í•ÑÕÀ±‘…ä¤ì(€€€ô(€€€•Ù•¹Ð¹‘É…Ý5½‘”ôµ¥á¥¹œœí•Ù•¹Ð¹µ…¹Õ…±5½‘”õ™…±Í”í•Ù•¹Ð¹ÍÝ…ÁA±…å•Èõ¹Õ±°í‘•±•Ñ”•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤íÉ•¹‘•ÉQ•…µÍA…” ¤ì(€ô(€™Õ¹Ñ¥½¸Á±…å•É!¥ÍÑ½Éå…¥¹ÍÑÉ½ÕÀ¡Á¥°œ¤ì(€€€É•ÑÕÉ¸œ(€€€€€€¹™¥±Ñ•È ¡à¤€ôøMÑÉ¥¹œ¡à¤€„ôôMÑÉ¥¹œ¡Á¥¤¤(€€€€€€¹µ…À ¡¥¤€ôø€¡ì(€€€€€€€¥°(€€€€€€€¹…µ”èÁ±…å•È¡¥¤ü¹¹…µ”ñð€‰U¹­¹½Ý¸ˆ°(€€€€€€€Á±…å•èÁ±…å•‘Q½•Ñ¡•É½Õ¹Ð¡Á¥°¥¤°(€€€€€€€Á…ÉÑ¹•ÉÌèÁ…ÉÑ¹•É•‘½Õ¹Ð¡Á¥°¥¤°(€€€€€ô¤¤(€€€€€€¹Í½ÉÐ ¡„°ˆ¤€ôøˆ¹Á…ÉÑ¹•ÉÌ€´„¹Á…ÉÑ¹•ÉÌñðˆ¹Á±…å•€´„¹Á±…å•¤ì(€ô(€™Õ¹Ñ¥½¸…Ý…å½±™Ù•¹Ñ½ÕÉÍ•9…µ•Ì¡•Ù•¹Ð¤ì(€€€½¹ÍÐÍ¹…ÁÍ¡½ÑÌ€ôl(€€€€€€¸¸¸¡•Ù•¹Ðü¹½ÕÉÍ•M¹…ÁÍ¡½Ðñðmt¤°(€€€€€€¸¸¸¡ÍÑ½É”¹±½Õü¹½ÕÉÍ•…É‘Ìñðmt¤°(€€€€€€¸¸¸¡ÍÑ½É”¹½ÕÉÍ•Ìñðmt¤°(€€€tì(€€€½¹ÍÐ¹…µ•Ì€ômtì(€€€™½È€¡±•Ð‘…ä€ô€Äì‘…ä€ðô5…Ñ ¹µ…à Ä°€­•Ù•¹Ðü¹‘…åÌñð€Ä¤ì‘…ä¬¬¤ì(€€€€€½¹ÍÐÍ•±•Ñ•€ô•Ù•¹Ðü¹l‰½ÕÉÍ”ˆ€¬‘…åtì(€€€€€½¹ÍÐµ…Ñ €ôÍ¹…ÁÍ¡½ÑÌ¹™¥¹ (€€€€€€€€¡…¹‘¥‘…Ñ”¤€ôøMÑÉ¥¹œ¡…¹‘¥‘…Ñ”ü¹¥¤€ôôôMÑÉ¥¹œ¡Í•±•Ñ•¤°(€€€€€€¤ì(€€€€€½¹ÍÐ¹…µ”€ôµ…Ñ ü¹¹…µ”ñð€ˆˆì(€€€€€¥˜€¡¹…µ”€˜˜€…¹…µ•Ì¹¥¹±Õ‘•Ì¡¹…µ”¤¤¹…µ•Ì¹ÁÕÍ ¡¹…µ”¤ì(€€€ô(€€€É•ÑÕÉ¸¹…µ•Ìì(€ô(€™Õ¹Ñ¥½¸…Ý…å½±™Ù•¹ÑA±…å•É%‘Ì¡•Ù•¹Ð¤ì(€€€½¹ÍÐ¥‘Ì€ô¹•ÜM•Ð ¤ì(€€€™½È€¡±•Ð‘…ä€ô€Äì‘…ä€ðô5…Ñ ¹µ…à Ä°€­•Ù•¹Ðü¹‘…åÌñð€Ä¤ì‘…ä¬¬¤ì(€€€€€½¹ÍÐ­•ä€ô€‰‘…äˆ€¬‘…äì(€€€€€±•ÐÍ±½ÑÌ€ô€¡•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹m­•åtü¹É½ÕÁÌñðmt¤¹™±…Ð ¤ì(€€€€€¥˜€ …Í±½ÑÌ¹±•¹Ñ ¤Í±½ÑÌ€ô•Ù•¹Ðü¹‘…å¥•±‘Ìü¹m­•åtñð•Ù•¹Ðü¹½¹™¥Éµ•ñðmtì(€€€€€™½È€¡½¹ÍÐÍ±½Ð½˜Í±½ÑÌ¤ì(€€€€€€€¥˜€¡Í±½Ð€ôô¹Õ±°ñðMÑÉ¥¹œ¡Í±½Ð¤€ôôô9=}AIQ9I}%¤½¹Ñ¥¹Õ”ì(€€€€€€€½¹ÍÐ‰…Í”€ôÍÑ½É”¹Á±…å•ÉÌ¹™¥¹ (€€€€€€€€€€¡Á•ÉÍ½¸¤€ôøMÑÉ¥¹œ¡Á•ÉÍ½¸¹¥¤€ôôôMÑÉ¥¹œ¡Í±½Ð¤°(€€€€€€€€¤ì(€€€€€€€½¹ÍÐ½ÕÁ…¹Ð€ôÝ¥¹‘½Ü¹½±™A±…å•ÉMÕ‰ÍÑ¥ÑÕÑ¥½¸ü¹½ÕÁ…¹Ð (€€€€€€€€€•Ù•¹Ð°(€€€€€€€€€Í±½Ð°(€€€€€€€€€‰…Í”°(€€€€€€€€€‘…ä°(€€€€€€€€¤ì(€€€€€€€¥‘Ì¹…‘¡MÑÉ¥¹œ¡½ÕÁ…¹Ðü¹ÁÉ½™¥±•%ñð½ÕÁ…¹Ðü¹¥ñðÍ±½Ð¤¤ì(€€€€€ô(€€€ô(€€€É•ÑÕÉ¸l¸¸¹¥‘Ítì(€ô(€™Õ¹Ñ¥½¸É•½É‘Ý…å½±™Ù•¹ÑA±…å•¡•Ù•¹Ð¤ì(€€€½¹ÍÐ•Ù•¹Ñ9…µ”€ôMÑÉ¥¹œ¡•Ù•¹Ðü¹¹…µ”ñð€ˆˆ¤¹ÑÉ¥´ ¤ì(€€€¥˜€ „½yÝ…ä½±™qˆ½¤¹Ñ•ÍÐ¡•Ù•¹Ñ9…µ”¤ñð¥ÍQ•ÍÑÙ•¹Ð¡•Ù•¹Ð¤¤É•ÑÕÉ¸™…±Í”ì(€€€½¹ÍÐ½ÕÉÍ•Ì€ô…Ý…å½±™Ù•¹Ñ½ÕÉÍ•9…µ•Ì¡•Ù•¹Ð¤°(€€€€€‘…Ñ”€ôMÑÉ¥¹œ¡•Ù•¹Ðü¹‘…Ñ”ñð€ˆˆ¤°(€€€€€‘…Ñ•1…‰•°€ô‘…Ñ”(€€€€€€€€ü¹•Ü…Ñ”¡‘…Ñ”€¬€‰PÄÈèÀÀèÀÀˆ¤¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ ‰•¸µTˆ¤(€€€€€€€€è€ˆˆ°(€€€€€­•ä€ôMÑÉ¥¹œ (€€€€€€€•Ù•¹Ðü¹Ý½É­ÍÁ…•%ñð(€€€€€€€€€•Ù•¹Ðü¹±½Õ‘Ù•¹Ñ%ñð(€€€€€€€€€•Ù•¹Ðü¹¥ñð(€€€€€€€€€€‘í•Ù•¹Ñ9…µ•õð‘í‘…Ñ•õð‘í½ÕÉÍ•Ì¹©½¥¸ ‰ðˆ¥õ€°(€€€€€€¤°(€€€€€•¹ÑÉä€ôì(€€€€€€€­•ä°(€€€€€€€•Ù•¹Ñ9…µ”°(€€€€€€€‘…Ñ”°(€€€€€€€‘…Ñ•1…‰•°°(€€€€€€€½ÕÉÍ•Ìè½ÕÉÍ•Ì¹©½¥¸ ˆƒ
Ü€ˆ¤°(€€€€€€€É•½É‘•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€ôì(€€€±•Ð¡…¹•€ô™…±Í”ì(€€€™½È€¡½¹ÍÐ¥½˜…Ý…å½±™Ù•¹ÑA±…å•É%‘Ì¡•Ù•¹Ð¤¤ì(€€€€€½¹ÍÐÁ•ÉÍ½¸€ôÍÑ½É”¹Á±…å•ÉÌ¹™¥¹ (€€€€€€€€¡…¹‘¥‘…Ñ”¤€ôøMÑÉ¥¹œ¡…¹‘¥‘…Ñ”¹¥¤€ôôôMÑÉ¥¹œ¡¥¤°(€€€€€€¤ì(€€€€€¥˜€ …Á•ÉÍ½¸¤½¹Ñ¥¹Õ”ì(€€€€€Á•ÉÍ½¸¹…Ý…å½±™Ù•¹ÑÍA±…å•€ôÉÉ…ä¹¥ÍÉÉ…ä¡Á•ÉÍ½¸¹…Ý…å½±™Ù•¹ÑÍA±…å•¤(€€€€€€€€üÁ•ÉÍ½¸¹…Ý…å½±™Ù•¹ÑÍA±…å•(€€€€€€€€èmtì(€€€€€¥˜€¡Á•ÉÍ½¸¹…Ý…å½±™Ù•¹ÑÍA±…å•¹Í½µ” ¡¥Ñ•´¤€ôø¥Ñ•´¹­•ä€ôôô­•ä¤¤½¹Ñ¥¹Õ”ì(€€€€€Á•ÉÍ½¸¹…Ý…å½±™Ù•¹ÑÍA±…å•¹ÁÕÍ ¡ì€¸¸¹•¹ÑÉäô¤ì(€€€€€¡…¹•€ôÑÉÕ”ì(€€€ô(€€€É•ÑÕÉ¸¡…¹•ì(€ô(€™Õ¹Ñ¥½¸É•½É‘½µÁ±•Ñ•‘Ù•¹Ñ!¥ÍÑ½Éä¡•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¤ì(€€€½¹ÍÐ…Ý…å½±™!¥ÍÑ½Éå¡…¹•€ôÉ•½É‘Ý…å½±™Ù•¹ÑA±…å•¡•Ù•¹Ð¤ì(€€€¥˜€ (€€€€€€…•Ù•¹Ðü¹É½ÕÁM•ÑÕÀñð(€€€€€•Ù•¹Ð¹¡¥ÍÑ½ÉåI•½É‘•‘Ðñð(€€€€€¥ÍQ•ÍÑÙ•¹Ð¡•Ù•¹Ð¤(€€€€¤(€€€€€É•ÑÕÉ¸…Ý…å½±™!¥ÍÑ½Éå¡…¹•ì(€€€™½È€¡±•Ð‘…ä€ô€Äì‘…ä€ðô€¡•Ù•¹Ð¹‘…åÌñð€Ä¤ì‘…ä¬¬¤ì(€€€€€½¹ÍÐÌ€ô•Ù•¹Ð¹É½ÕÁM•ÑÕÁl‰‘…äˆ€¬‘…åtü¹É½ÕÁÌñðmtì(€€€€€™½È€¡½¹ÍÐœ½˜Ì¤ì(€€€€€€€½¹ÍÐÉ•…±A±…å•ÉÌ€ôœ¹™¥±Ñ•È (€€€€€€€€€€¡¥¤€ôø¥€„ô¹Õ±°€˜˜MÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%°(€€€€€€€€¤ì(€€€€€€€™½È€¡±•Ð¤€ô€Àì¤€ðÉ•…±A±…å•ÉÌ¹±•¹Ñ ì¤¬¬¤(€€€€€€€€€™½È€¡±•Ð¨€ô¤€¬€Äì¨€ðÉ•…±A±…å•ÉÌ¹±•¹Ñ ì¨¬¬¤ì(€€€€€€€€€€€±•Ð¬€ôÁ…¥É-•ä¡É•…±A±…å•ÉÍm¥t°É•…±A±…å•ÉÍm©t¤ì(€€€€€€€€€€€ÍÑ½É”¹Á…¥É!¥ÍÑ½Éåm­t€ô€¡ÍÑ½É”¹Á…¥É!¥ÍÑ½Éåm­tñð€À¤€¬€Äì(€€€€€€€€€ô(€€€€€€€½¹ÍÐÁ…¥ÉÌ€ômœ¹Í±¥” À°€È¤°œ¹Í±¥” È°€Ð¥tì(€€€€€€€™½È€¡½¹ÍÐÁ…¥È½˜Á…¥ÉÌ¤ì(€€€€€€€€€¥˜€ (€€€€€€€€€€€Á…¥È¹±•¹Ñ €„ôô€Èñð(€€€€€€€€€€€Á…¥È¹Í½µ” ¡¥¤€ôø¥€ôô¹Õ±°ñðMÑÉ¥¹œ¡¥¤€ôôô9=}AIQ9I}%¤(€€€€€€€€€€¤(€€€€€€€€€€€½¹Ñ¥¹Õ”ì(€€€€€€€€€±•Ð¬€ôÁ…¥É-•ä¡Á…¥ÉlÁt°Á…¥ÉlÅt¤ì(€€€€€€€€€ÍÑ½É”¹Á…ÉÑ¹•É!¥ÍÑ½Éåm­t€ô€¡ÍÑ½É”¹Á…ÉÑ¹•É!¥ÍÑ½Éåm­tñð€À¤€¬€Äì(€€€€€€€ô(€€€€€ô(€€€ô(€€€•Ù•¹Ð¹¡¥ÍÑ½ÉåI•½É‘•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€É•ÑÕÉ¸ÑÉÕ”ì(€ô(€™Õ¹Ñ¥½¸É•µ½Ù•I•½É‘•‘Q•ÍÑÙ•¹Ñ!¥ÍÑ½Éä ¤ì(€€€±•Ð¡…¹•€ô™…±Í”ì(€€€½¹ÍÐÉ•‘Õ•½Õ¹Ð€ô€¡¡¥ÍÑ½Éä°­•ä¤€ôøì(€€€€€½¹ÍÐ¹•áÐ€ô5…Ñ ¹µ…à À°€¬¡¡¥ÍÑ½Éåm­•åtñð€À¤€´€Ä¤ì(€€€€€¥˜€¡¹•áÐ¤¡¥ÍÑ½Éåm­•åt€ô¹•áÐì(€€€€€•±Í”‘•±•Ñ”¡¥ÍÑ½Éåm­•åtì(€€€ôì(€€€™½È€¡½¹ÍÐÉ•½É½˜ÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…”ñðmt¤ì(€€€€€½¹ÍÐ•Ù•¹Ð€ôÉ•½Éü¹•Ù•¹Ðì(€€€€€¥˜€ (€€€€€€€€…•Ù•¹Ðü¹¡¥ÍÑ½ÉåI•½É‘•‘Ðñð(€€€€€€€•Ù•¹Ð¹Ñ•ÍÑ!¥ÍÑ½Éåá±Õ‘•‘Ðñð(€€€€€€€€…¥ÍQ•ÍÑÙ•¹Ð¡•Ù•¹Ð¤(€€€€€€¤(€€€€€€€½¹Ñ¥¹Õ”ì(€€€€€™½È€¡±•Ð‘…ä€ô€Äì‘…ä€ðô€¡•Ù•¹Ð¹‘…åÌñð€Ä¤ì‘…ä¬¬¤ì(€€€€€€€½¹ÍÐÉ½ÕÁÌ€ô•Ù•¹Ð¹É½ÕÁM•ÑÕÀü¹m‘…ä‘í‘…åõtü¹É½ÕÁÌñðmtì(€€€€€€€™½È€¡½¹ÍÐÉ½ÕÀ½˜É½ÕÁÌ¤ì(€€€€€€€€€½¹ÍÐÉ•…±A±…å•ÉÌ€ôÉ½ÕÀ¹™¥±Ñ•È (€€€€€€€€€€€€¡¥¤€ôø¥€„ô¹Õ±°€˜˜MÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%°(€€€€€€€€€€¤ì(€€€€€€€€€™½È€¡±•Ð¤€ô€Àì¤€ðÉ•…±A±…å•ÉÌ¹±•¹Ñ ì¤¬¬¤(€€€€€€€€€€€™½È€¡±•Ð¨€ô¤€¬€Äì¨€ðÉ•…±A±…å•ÉÌ¹±•¹Ñ ì¨¬¬¤(€€€€€€€€€€€€€É•‘Õ•½Õ¹Ð (€€€€€€€€€€€€€€€ÍÑ½É”¹Á…¥É!¥ÍÑ½Éä°(€€€€€€€€€€€€€€€Á…¥É-•ä¡É•…±A±…å•ÉÍm¥t°É•…±A±…å•ÉÍm©t¤°(€€€€€€€€€€€€€€¤ì(€€€€€€€€€™½È€¡½¹ÍÐÁ…¥È½˜mÉ½ÕÀ¹Í±¥” À°€È¤°É½ÕÀ¹Í±¥” È°€Ð¥t¤ì(€€€€€€€€€€€¥˜€ (€€€€€€€€€€€€€Á…¥È¹±•¹Ñ €ôôô€È€˜˜(€€€€€€€€€€€€€€…Á…¥È¹Í½µ” (€€€€€€€€€€€€€€€€¡¥¤€ôø¥€ôô¹Õ±°ñðMÑÉ¥¹œ¡¥¤€ôôô9=}AIQ9I}%°(€€€€€€€€€€€€€€¤(€€€€€€€€€€€€¤(€€€€€€€€€€€€€É•‘Õ•½Õ¹Ð¡ÍÑ½É”¹Á…ÉÑ¹•É!¥ÍÑ½Éä°Á…¥É-•ä¡Á…¥ÉlÁt°Á…¥ÉlÅt¤¤ì(€€€€€€€€€ô(€€€€€€€ô(€€€€€ô(€€€€€•Ù•¹Ð¹Ñ•ÍÑ!¥ÍÑ½Éåá±Õ‘•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€¡…¹•€ôÑÉÕ”ì(€€€ô(€€€™½È€¡½¹ÍÐÁ•ÉÍ½¸½˜ÍÑ½É”¹Á±…å•ÉÌñðmt¤ì(€€€€€¥˜€¡ÉÉ…ä¹¥ÍÉÉ…ä¡Á•ÉÍ½¸¹…Ý…å½±™Ù•¹ÑÍA±…å•¤¤ì(€€€€€€€½¹ÍÐ­•ÁÐ€ôÁ•ÉÍ½¸¹…Ý…å½±™Ù•¹ÑÍA±…å•¹™¥±Ñ•È (€€€€€€€€€€¡•¹ÑÉä¤€ôø€…¥ÍQ•ÍÑÙ•¹Ð¡ì¹…µ”è•¹ÑÉäü¹•Ù•¹Ñ9…µ”ô¤°(€€€€€€€€¤ì(€€€€€€€¥˜€¡­•ÁÐ¹±•¹Ñ €„ôôÁ•ÉÍ½¸¹…Ý…å½±™Ù•¹ÑÍA±…å•¹±•¹Ñ ¤ì(€€€€€€€€€Á•ÉÍ½¸¹…Ý…å½±™Ù•¹ÑÍA±…å•€ô­•ÁÐì(€€€€€€€€€¡…¹•€ôÑÉÕ”ì(€€€€€€€ô(€€€€€ô(€€€€€™½È€¡½¹ÍÐm½ÕÉÍ•%°•¹ÑÉåt½˜=‰©•Ð¹•¹ÑÉ¥•Ì (€€€€€€€Á•ÉÍ½¸¹½ÕÉÍ•!…¹‘¥…ÁÌñðíô°(€€€€€€¤¤ì(€€€€€€€¥˜€ …¥ÍQ•ÍÑÙ•¹Ð¡ì¹…µ”è•¹ÑÉäü¹•Ù•¹Ñ9…µ”ô¤¤½¹Ñ¥¹Õ”ì(€€€€€€€‘•±•Ñ”Á•ÉÍ½¸¹½ÕÉÍ•!…¹‘¥…ÁÍm½ÕÉÍ•%‘tì(€€€€€€€¡…¹•€ôÑÉÕ”ì(€€€€€ô(€€€ô(€€€½¹ÍÐ…Ñ¥Ù”€ô€¡ÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…”ñðmt¤¹™¥¹ (€€€€€€¡É•½É¤€ôø(€€€€€€€MÑÉ¥¹œ¡É•½É¹¥¤€ôôô(€€€€€€€MÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ðü¹Ý½É­ÍÁ…•%ñðÍÑ½É”¹…Ñ¥Ù•Ù•¹Ñ%ñð€ˆˆ¤°(€€€€¤ì(€€€¥˜€¡…Ñ¥Ù”ü¹•Ù•¹Ðü¹Ñ•ÍÑ!¥ÍÑ½Éåá±Õ‘•‘Ð€˜˜ÍÑ½É”¹•Ù•¹Ð¤(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Ñ•ÍÑ!¥ÍÑ½Éåá±Õ‘•‘Ð€ô(€€€€€€€…Ñ¥Ù”¹•Ù•¹Ð¹Ñ•ÍÑ!¥ÍÑ½Éåá±Õ‘•‘Ðì(€€€¥˜€¡¡…¹•¤ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€É•ÑÕÉ¸¡…¹•ì(€ô(€™Õ¹Ñ¥½¸¥¹ÍÑ…±±•‘•É…±I¥‘•!¥ÍÑ½Éå	…Í•±¥¹” ¤ì(€€€½¹ÍÐ‰…Í•±¥¹•%€ô€‰™•‘•É…°µÉ¥‘”´ÈÀÈØµØÄˆì(€€€¥˜€¡ÍÑ½É”¹¡¥ÍÑ½Éå	…Í•±¥¹”ü¹¥€ôôô‰…Í•±¥¹•%¤É•ÑÕÉ¸™…±Í”ì(€€€½¹ÍÐÉ¥‘•É½ÕÁÌ€ôl(€€€€€€€l‰)•É•µä]…Éˆ°€‰É…•µ”!•¹¹•ÍÍäˆ°€‰	•¸5••Ìˆ°€‰I½IÕÍÑ½¸‰t°(€€€€€€€l‰M…´I••”ˆ°€‰)•ÉÉä5…¡•Èˆ°€‰%…¸AÉ¥•ÍÐˆ°€‰5…ÕÉ¥”5•±…¸‰t°(€€€€€€€l‰É…¹Ð1½µ…Ìˆ°€‰1Õ­”	É…‘Í¡…Üˆ°€‰	½ˆY…±¬ˆ°€‰…Ù¥…¥ÉÝ•…Ñ¡•È‰t°(€€€€€€€l‰¡É¥ÍÑ¥…¸½¹œˆ°€‰A•Ñ•ÈI½±™”ˆ°€‰I½ˆ	±…¥¸ˆ°€‰I½ÍÌMµ¥Ñ ‰t°(€€€€€t°(€€€€€™•‘•É…±…äÅÉ½ÕÁÌ€ôl(€€€€€€€l‰I½	½Ýå•Èˆ°€‰)•ÉÉä5…¡•Èˆ°€‰É…•µ”!•¹¹•ÍÍäˆ°€‰I½ÍÌMµ¥Ñ ‰t°(€€€€€€€l‰…Ù¥…¥ÉÝ•…Ñ¡•Èˆ°€‰I½IÕÍÑ½¸ˆ°€‰…Ù¥…™™…¹•äˆ°€‰	•¸5••Ì‰t°(€€€€€t°(€€€€€™•‘•É…±…äÉÉ½ÕÁÌ€ôl(€€€€€€€l‰I½IÕÍÑ½¸ˆ°€‰	•¸5••Ìˆ°€‰É…•µ”!•¹¹•ÍÍäˆ°€‰)•ÉÉä5…¡•È‰t°(€€€€€€€l‰I½	½Ýå•Èˆ°€‰I½ÍÌMµ¥Ñ ˆ°€‰…Ù¥…™™…¹•äˆ°€‰…Ù¥…¥ÉÝ•…Ñ¡•È‰t°(€€€€€t°(€€€€€Á±…å•É%‘	å9…µ”€ô¹•Ü5…À (€€€€€€€€¡ÍÑ½É”¹Á±…å•ÉÌñðmt¤¹µ…À ¡Á•ÉÍ½¸¤€ôømÁ•ÉÍ½¸¹¹…µ”°MÑÉ¥¹œ¡Á•ÉÍ½¸¹¥¥t¤°(€€€€€€¤°(€€€€€¹…µ•‘I½Õ¹‘Ì€ômÉ¥‘•É½ÕÁÌ°™•‘•É…±…äÅÉ½ÕÁÌ°™•‘•É…±…äÉÉ½ÕÁÍt°(€€€€€É½Õ¹‘Ì€ô¹…µ•‘I½Õ¹‘Ì¹µ…À ¡É½Õ¹¤€ôø(€€€€€€€É½Õ¹¹µ…À ¡¹…µ•Ì¤€ôø¹…µ•Ì¹µ…À ¡¹…µ”¤€ôøÁ±…å•É%‘	å9…µ”¹•Ð¡¹…µ”¤¤¤°(€€€€€€¤ì(€€€¥˜€¡É½Õ¹‘Ì¹Í½µ” ¡É½Õ¹¤€ôøÉ½Õ¹¹Í½µ” ¡É½ÕÀ¤€ôøÉ½ÕÀ¹Í½µ” ¡¥¤€ôø€…¥¤¤¤¤(€€€€€É•ÑÕÉ¸™…±Í”ì((€€€€¼¼•±¥‰•É…Ñ•±äÉ•Á±…”°É…Ñ¡•ÈÑ¡…¸…‘Ñ¼°Ñ¡”‘•Ù¥”Ì½±½Õ¹Ñ•ÉÌ¸(€€€ÍÑ½É”¹Á…¥É!¥ÍÑ½Éä€ôíôì(€€€ÍÑ½É”¹Á…ÉÑ¹•É!¥ÍÑ½Éä€ôíôì(€€€™½È€¡½¹ÍÐÉ½Õ¹½˜É½Õ¹‘Ì¤ì(€€€€€™½È€¡½¹ÍÐÉ½ÕÀ½˜É½Õ¹¤ì(€€€€€€€™½È€¡±•Ð¤€ô€Àì¤€ðÉ½ÕÀ¹±•¹Ñ ì¤¬¬¤(€€€€€€€€€™½È€¡±•Ð¨€ô¤€¬€Äì¨€ðÉ½ÕÀ¹±•¹Ñ ì¨¬¬¤ì(€€€€€€€€€€€½¹ÍÐ­•ä€ôÁ…¥É-•ä¡É½ÕÁm¥t°É½ÕÁm©t¤ì(€€€€€€€€€€€ÍÑ½É”¹Á…¥É!¥ÍÑ½Éåm­•åt€ô€¡ÍÑ½É”¹Á…¥É!¥ÍÑ½Éåm­•åtñð€À¤€¬€Äì(€€€€€€€€€ô(€€€€€€€™½È€¡½¹ÍÐÁ…¥È½˜mÉ½ÕÀ¹Í±¥” À°€È¤°É½ÕÀ¹Í±¥” È°€Ð¥t¤ì(€€€€€€€€€½¹ÍÐ­•ä€ôÁ…¥É-•ä¡Á…¥ÉlÁt°Á…¥ÉlÅt¤ì(€€€€€€€€€ÍÑ½É”¹Á…ÉÑ¹•É!¥ÍÑ½Éåm­•åt€ô€¡ÍÑ½É”¹Á…ÉÑ¹•É!¥ÍÑ½Éåm­•åtñð€À¤€¬€Äì(€€€€€€€ô(€€€€€ô(€€€ô((€€€½¹ÍÐ¥¹ÍÑ…±±•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€ÍÑ½É”¹¡¥ÍÑ½Éå	…Í•±¥¹”€ôì(€€€€€¥è‰…Í•±¥¹•%°(€€€€€¥¹ÍÑ…±±•‘Ð°(€€€€€•Ù•¹ÑÌèl(€€€€€€€€‰Ý…ä½±˜€´Q¡”I¥‘”ˆ°(€€€€€€€€‰Ý…ä½±˜€´•‘•É…°…ä€Äˆ°(€€€€€€€€‰Ý…ä½±˜€´•‘•É…°…ä€Èˆ°(€€€€€t°(€€€ôì(€€€€¼¼AÉ•Ù•¹Ð½±±½…°•Ù•¹Ð½Á¥•Ì™É½´‰•¥¹œÉ”µ…‘‘•‰äÑ¡”±•…ä(€€€€¼¼½µÁ±•Ñ•µ•Ù•¹Ð‰…­™¥±°¸•¹Õ¥¹”•Ù•¹ÑÌ½µÁ±•Ñ•…™Ñ•ÈÑ¡¥ÌÉ•Í•Ð…É”(€€€€¼¼ÍÑ¥±°É•½É‘•¹½Éµ…±±äÝ¡•¸Ñ¡•ä±½Í”¸(€€€™½È€¡½¹ÍÐÉ•½É½˜ÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…”ñðmt¤ì(€€€€€½¹ÍÐ•Ù•¹Ð€ôÉ•½Éü¹•Ù•¹Ðì(€€€€€¥˜€ …•Ù•¹Ð¤½¹Ñ¥¹Õ”ì(€€€€€½¹ÍÐ¡…ÍA±…å•‘M½É”€ô=‰©•Ð¹Ù…±Õ•Ì¡•Ù•¹Ð¹Í½É¥¹œñðíô¤¹Í½µ” (€€€€€€€€¡É½Õ¹‘…Ñ„¤€ôø(€€€€€€€€€=‰©•Ð¹Ù…±Õ•Ì¡É½Õ¹‘…Ñ„ñðíô¤¹Í½µ” ¡É½Õ¹¤€ôø(€€€€€€€€€€€=‰©•Ð¹•¹ÑÉ¥•Ì¡É½Õ¹ñðíô¤¹Í½µ” (€€€€€€€€€€€€€€¡m¡½±”°•¹ÑÉåt¤€ôø(€€€€€€€€€€€€€€€€½yq¬¼¹Ñ•ÍÐ¡¡½±”¤€˜˜(€€€€€€€€€€€€€€€€¡Í½É•¹Ñ•É•¡•¹ÑÉäü¹½™™¥¥…°ü¹É½ÍÌ¤ñð(€€€€€€€€€€€€€€€€€Í½É•¹Ñ•É•¡•¹ÑÉäü¹Í•±˜ü¹É½ÍÌ¤¤°(€€€€€€€€€€€€¤°(€€€€€€€€€€¤°(€€€€€€¤ì(€€€€€¥˜€ (€€€€€€€•Ù•¹Ð¹ÍÑ…ÑÕÌ€ôôô€‰½µÁ±•Ñ”ˆñð(€€€€€€€•Ù•¹Ð¹ÍÑ…ÑÕÌ€ôôô€‰½µÁ±•Ñ•ˆñð(€€€€€€€•Ù•¹Ð¹™¥¹…±I•ÍÕ±ÑÌü¹½¹™¥Éµ•‘Ðñð(€€€€€€€¡…ÍA±…å•‘M½É”(€€€€€€¤(€€€€€€€•Ù•¹Ð¹¡¥ÍÑ½ÉåI•½É‘•‘Ð€ô¥¹ÍÑ…±±•‘Ðì(€€€€€¥˜€¡¥ÍQ•ÍÑÙ•¹Ð¡•Ù•¹Ð¤¤•Ù•¹Ð¹Ñ•ÍÑ!¥ÍÑ½Éåá±Õ‘•‘Ð€ô¥¹ÍÑ…±±•‘Ðì(€€€ô(€€€½¹ÍÐ…Ñ¥Ù”€ô€¡ÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…”ñðmt¤¹™¥¹ (€€€€€€¡É•½É¤€ôø(€€€€€€€MÑÉ¥¹œ¡É•½É¹¥¤€ôôô(€€€€€€€MÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ðü¹Ý½É­ÍÁ…•%ñðÍÑ½É”¹…Ñ¥Ù•Ù•¹Ñ%ñð€ˆˆ¤°(€€€€¤ì(€€€¥˜€¡…Ñ¥Ù”ü¹•Ù•¹Ðü¹¡¥ÍÑ½ÉåI•½É‘•‘Ð€˜˜ÍÑ½É”¹•Ù•¹Ð¤(€€€€€ÍÑ½É”¹•Ù•¹Ð¹¡¥ÍÑ½ÉåI•½É‘•‘Ð€ô…Ñ¥Ù”¹•Ù•¹Ð¹¡¥ÍÑ½ÉåI•½É‘•‘Ðì(€€€¥˜€¡…Ñ¥Ù”ü¹•Ù•¹Ðü¹Ñ•ÍÑ!¥ÍÑ½Éåá±Õ‘•‘Ð€˜˜ÍÑ½É”¹•Ù•¹Ð¤(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Ñ•ÍÑ!¥ÍÑ½Éåá±Õ‘•‘Ð€ô…Ñ¥Ù”¹•Ù•¹Ð¹Ñ•ÍÑ!¥ÍÑ½Éåá±Õ‘•‘Ðì(€€€É•ÑÕÉ¸ÑÉÕ”ì(€ô(€™Õ¹Ñ¥½¸‰…­™¥±±½µÁ±•Ñ•‘Ù•¹Ñ!¥ÍÑ½Éä ¤ì(€€€±•Ð¡…¹•€ô™…±Í”ì(€€€™½È€¡½¹ÍÐÉ•½É½˜ÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…”ñðmt¤ì(€€€€€½¹ÍÐ•Ù•¹Ð€ôÉ•½Éü¹•Ù•¹Ð°(€€€€€€€¡…ÍA±…å•‘M½É”€ô=‰©•Ð¹Ù…±Õ•Ì¡•Ù•¹Ðü¹Í½É¥¹œñðíô¤¹Í½µ” ¡É½Õ¹‘Ì¤€ôø(€€€€€€€€€=‰©•Ð¹Ù…±Õ•Ì¡É½Õ¹‘Ìñðíô¤¹Í½µ” ¡É½Õ¹¤€ôø(€€€€€€€€€€€=‰©•Ð¹•¹ÑÉ¥•Ì¡É½Õ¹ñðíô¤¹Í½µ” (€€€€€€€€€€€€€€¡m¡½±”°•¹ÑÉåt¤€ôø(€€€€€€€€€€€€€€€€½yq¬¼¹Ñ•ÍÐ¡¡½±”¤€˜˜(€€€€€€€€€€€€€€€€¡Í½É•¹Ñ•É•¡•¹ÑÉäü¹½™™¥¥…°ü¹É½ÍÌ¤ñð(€€€€€€€€€€€€€€€€€Í½É•¹Ñ•É•¡•¹ÑÉäü¹Í•±˜ü¹É½ÍÌ¤¤°(€€€€€€€€€€€€¤°(€€€€€€€€€€¤°(€€€€€€€€¤ì(€€€€€¥˜€ (€€€€€€€•Ù•¹Ð€˜˜(€€€€€€€€¡•Ù•¹Ð¹ÍÑ…ÑÕÌ€ôôô€‰½µÁ±•Ñ”ˆñð(€€€€€€€€€•Ù•¹Ð¹ÍÑ…ÑÕÌ€ôôô€‰½µÁ±•Ñ•ˆñð(€€€€€€€€€•Ù•¹Ð¹™¥¹…±I•ÍÕ±ÑÌü¹½¹™¥Éµ•‘Ðñð(€€€€€€€€€¡…ÍA±…å•‘M½É”¤(€€€€€€¤(€€€€€€€¡…¹•€ôÉ•½É‘½µÁ±•Ñ•‘Ù•¹Ñ!¥ÍÑ½Éä¡•Ù•¹Ð¤ñð¡…¹•ì(€€€ô(€€€½¹ÍÐ…Ñ¥Ù”€ô€¡ÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…”ñðmt¤¹™¥¹ (€€€€€€¡É•½É¤€ôø(€€€€€€€MÑÉ¥¹œ¡É•½É¹¥¤€ôôô(€€€€€€€MÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ðü¹Ý½É­ÍÁ…•%ñðÍÑ½É”¹…Ñ¥Ù•Ù•¹Ñ%ñð€ˆˆ¤°(€€€€¤ì(€€€¥˜€¡…Ñ¥Ù”ü¹•Ù•¹Ðü¹¡¥ÍÑ½ÉåI•½É‘•‘Ð€˜˜ÍÑ½É”¹•Ù•¹Ð¤(€€€€€ÍÑ½É”¹•Ù•¹Ð¹¡¥ÍÑ½ÉåI•½É‘•‘Ð€ô…Ñ¥Ù”¹•Ù•¹Ð¹¡¥ÍÑ½ÉåI•½É‘•‘Ðì(€€€¥˜€¡¡…¹•¤ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€ô(€™Õ¹Ñ¥½¸Í¡Õ™™±•½Áä¡…ÉÈ¤ì(€€€±•Ð„€ôl¸¸¹…ÉÉtì(€€€™½È€¡±•Ð¤€ô„¹±•¹Ñ €´€Äì¤€ø€Àì¤´´¤ì(€€€€€±•Ð¨€ô5…Ñ ¹™±½½È¡5…Ñ ¹É…¹‘½´ ¤€¨€¡¤€¬€Ä¤¤ì(€€€€€m…m¥t°…m©ut€ôm…m©t°…m¥utì(€€€ô(€€€É•ÑÕÉ¸„ì(€ô(€™Õ¹Ñ¥½¸µ…­•É½ÕÁÌ¡¥‘Ì°‘…ä€ôÍÑ½É”¹•Ù•¹Ðü¹…Ñ¥Ù•É½ÕÁ…äñð€Ä¤ì(€€€½¹ÍÐÉ•…°€ô¥‘Ì¹™¥±Ñ•È¡¥€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤ì(€€€¥˜€¡É•…°¹±•¹Ñ €ð€Ø¤ì(€€€€€½¹ÍÐ½ÕÐ€ômtì(€€€€€™½È€¡±•Ð¤ôÀì¤ñ¥‘Ì¹±•¹Ñ ì¤¬ôÐ¤½ÕÐ¹ÁÕÍ ¡¥‘Ì¹Í±¥”¡¤±¤¬Ð¤¤ì(€€€€€É•ÑÕÉ¸½ÕÐì(€€€ô(€€€½¹ÍÐ½Õ¹Ð€ô5…Ñ ¹•¥°¡É•…°¹±•¹Ñ ¼Ð¤°‰…Í”€ô5…Ñ ¹™±½½È¡É•…°¹±•¹Ñ ½½Õ¹Ð¤°•áÑÉ„€ôÉ•…°¹±•¹Ñ •½Õ¹Ðì(€€€±•Ð½™™Í•ÐôÀì(€€€É•ÑÕÉ¸ÉÉ…ä¹™É½´¡í±•¹Ñ é½Õ¹Ñô°¡|±¥¹‘•à¤ôùì(€€€€€½¹ÍÐÍ¥é”õ‰…Í”¬¡¥¹‘•àñ•áÑÉ„üÄèÀ¤°É½ÕÀõÉ•…°¹Í±¥”¡½™™Í•Ð±½™™Í•Ð­Í¥é”¤í½™™Í•Ð¬õÍ¥é”ì(€€€€€¥˜¡Í¥é”ôôôÌ˜˜……µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤¥É½ÕÀ¹ÁÕÍ ¡9=}AIQ9I}%¤ì(€€€€€É•ÑÕÉ¸É½ÕÀì(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸‘•™…Õ±ÑMÑ…ÉÑÌ¡É½ÕÁÌ°µ•Ñ¡½°‘…ä€ô€Ä¤ì(€€€µ•Ñ¡½€ôµ•Ñ¡½ñðÍÑ…ÉÑ5•Ñ¡½‘½È¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤ì(€€€¥˜€¡µ•Ñ¡½€ôôô€‰Í¡½ÑÕ¸ˆ¤ì(€€€€€½¹ÍÐ½µµ½¸€ôlÄ°€Ì°€Ô°€Ü°€ä°€ÄÀ°€ÄÈ°€ÄÐ°€ÄØ°€Äátì(€€€€€É•ÑÕÉ¸É½ÕÁÌ¹µ…À ¡|°¤¤€ôø½µµ½¹m¥tñð€ ¡¤€¨€È¤€”€Äà¤€¬€Ä¤ì(€€€ô(€€€½¹ÍÐ¡½±•Ì€ôÍÑ…ÉÑ!½±•Í½È¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤ì(€€€¥˜€¡µ•Ñ¡½€ôôô€‰ÑÝ¼ˆ¤É•ÑÕÉ¸É½ÕÁÌ¹µ…À ¡|°¤¤€ôø€¬¡¡½±•Ím¤€”€Étñð€Ä¤¤ì(€€€¥˜€¡µ•Ñ¡½€ôôô€‰Í¥¹±”ˆ¤É•ÑÕÉ¸É½ÕÁÌ¹µ…À  ¤€ôø€¬¡¡½±•ÍlÁtñð€Ä¤¤ì(€€€É•ÑÕÉ¸É½ÕÁÌ¹µ…À ¡|°¤¤€ôø¤€¬€Ä¤ì(€ô(€™Õ¹Ñ¥½¸‘…å¥•±‘%‘Ì¡‘…ä¤ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ð¤É•ÑÕÉ¸mtì(€€€½¹ÍÐ­•ä€ô€‰‘…äˆ€¬‘…äì(€€€½¹ÍÐµ¥ÍÍ¥¹œ€ôMÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌü¹m­•åtü¹µ¥ÍÍ¥¹A±…å•É%ñð€ˆˆ¤ì(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹‘…å¥•±‘Ìü¹m­•åt¤(€€€€€É•ÑÕÉ¸ÍÑ½É”¹•Ù•¹Ð¹‘…å¥•±‘Ím­•åt¹µ…À¡MÑÉ¥¹œ¤¹™¥±Ñ•È ¡¥¤€ôø¥€„ôôµ¥ÍÍ¥¹œ¤ì(€€€½¹ÍÐ¥‘Ì€ô€¡ÍÑ½É”¹•Ù•¹Ð¹½¹™¥Éµ•ñðmt¤¹µ…À¡MÑÉ¥¹œ¤ì(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä¤É•ÑÕÉ¸¥‘Ì¹™¥±Ñ•È ¡¥¤€ôø¥€„ôôµ¥ÍÍ¥¹œ¤ì(€€€É•ÑÕÉ¸¥‘Ì¹™¥±Ñ•È (€€€€€€¡¥¤€ôøÍÑ½É”¹•Ù•¹Ð¹‘…åÙ…¥±…‰¥±¥Ñäü¹m¥‘tü¹m‘…åt€„ôô™…±Í”°(€€€€¤¹™¥±Ñ•È ¡¥¤€ôø¥€„ôôµ¥ÍÍ¥¹œ¤ì(€ô(€™Õ¹Ñ¥½¸…É•…Ñ•A…ÈÍA…ÉÑ¹•È¡Á±…å•É%°‘…ä€ôÍÑ½É”¹•Ù•¹Ð¹‘…åÌ¤ì(€€€¥˜€ (€€€€€Á…ÈÍ5½‘”¡ÍÑ½É”¹•Ù•¹Ð¤€„ôô€‰½Ù•É…±±A…¥ÉÌˆñð(€€€€€€„¡ÍÑ½É”¹•Ù•¹Ðü¹½µÁ•Ñ¥Ñ¥½¹Ìñðmt¤¹¥¹±Õ‘•Ì ‰Á…ÈÌˆ¤(€€€€¤(€€€€€É•ÑÕÉ¸€ˆˆì(€€€½¹ÍÐÉ½ÕÁÌ€ôÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬ÍÑ½É”¹•Ù•¹Ð¹‘…åÍtü¹É½ÕÁÌñðmt°(€€€€€¥€ôÍ¡…É•‘ÑÕ…±%¡Á±…å•É%±ÍÑ½É”¹•Ù•¹Ð¹‘…åÌ¤°(€€€€€É½ÕÀ€ôÉ½ÕÁÌ¹™¥¹ ¡Ñ•…´¤€ôøÑ•…´¹µ…À¡MÑÉ¥¹œ¤¹¥¹±Õ‘•Ì¡¥¤¤ì(€€€¥˜€ …É½ÕÀ¤É•ÑÕÉ¸€ˆˆì(€€€½¹ÍÐ¥¹‘•à€ôÉ½ÕÀ¹µ…À¡MÑÉ¥¹œ¤¹¥¹‘•á=˜¡¥¤°(€€€€€Á…¥ÉMÑ…ÉÐ€ô¥¹‘•à€ð€È€ü€À€è€Èì(€€€É•ÑÕÉ¸Í¡…É•‘ÑÕ…±%¡MÑÉ¥¹œ (€€€€€É½ÕÀ(€€€€€€€€¹Í±¥”¡Á…¥ÉMÑ…ÉÐ°Á…¥ÉMÑ…ÉÐ€¬€È¤(€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤(€€€€€€€€¹™¥¹ ¡…¹‘¥‘…Ñ”¤€ôø…¹‘¥‘…Ñ”€„ôô¥€˜˜…¹‘¥‘…Ñ”€„ôô9=}AIQ9I}%¤ñð(€€€€€€€€ˆˆ°(€€€€¤±‘…ä¤ì(€ô(€™Õ¹Ñ¥½¸¹½A…ÉÑ¹•É½¹Ñ•áÐ¡É½ÕÁÌ°‘…ä°É½ÕÁ%¹‘•à€ô¹Õ±°¤ì(€€€½¹ÍÐ…±°€ô‘…å¥•±‘%‘Ì¡‘…ä¤°(€€€€€Í¡½ÉÑ%¹‘•à€ôÉ½ÕÁ%¹‘•à€ôôô¹Õ±°€üÉ½ÕÁÌ¹™¥¹‘%¹‘•à ¡œ¤€ôø(€€€€€€€œ¹Í½µ” ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€ôôô9=}AIQ9I}%¤°(€€€€€€¤€èÉ½ÕÁÍmÉ½ÕÁ%¹‘•átü¹Í½µ”¡¥€ôøMÑÉ¥¹œ¡¥¤€ôôô9=}AIQ9I}%¤€üÉ½ÕÁ%¹‘•à€è€´Äì(€€€¥˜€¡Í¡½ÉÑ%¹‘•à€ð€À¤É•ÑÕÉ¸¹Õ±°ì(€€€½¹ÍÐœ€ôÉ½ÕÁÍmÍ¡½ÉÑ%¹‘•át°(€€€€€¹Á%¹‘•à€ôœ¹™¥¹‘%¹‘•à ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€ôôô9=}AIQ9I}%¤ì(€€€½¹ÍÐÁ…¥ÉMÑ…ÉÐ€ô¹Á%¹‘•à€ð€È€ü€À€è€Èì(€€€½¹ÍÐ…™™•Ñ•€ôœ(€€€€€€¹Í±¥”¡Á…¥ÉMÑ…ÉÐ°Á…¥ÉMÑ…ÉÐ€¬€È¤(€€€€€€¹™¥¹ ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤ì(€€€½¹ÍÐÉ•…±%¹É½ÕÀ€ôœ¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤ì(€€€½¹ÍÐ¥¹M¡½ÉÑÉ½ÕÀ€ô¹•ÜM•Ð¡É•…±%¹É½ÕÀ¹µ…À¡MÑÉ¥¹œ¤¤ì(€€€½¹ÍÐ…¹‘¥‘…Ñ•Ì€ô…±°¹™¥±Ñ•È (€€€€€€¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%€˜˜€…¥¹M¡½ÉÑÉ½ÕÀ¹¡…Ì¡MÑÉ¥¹œ¡¥¤¤°(€€€€¤ì(€€€É•ÑÕÉ¸ì(€€€€€É½ÕÁ%¹‘•àèÍ¡½ÉÑ%¹‘•à°(€€€€€¹½A…ÉÑ¹•É%¹‘•àè¹Á%¹‘•à°(€€€€€…™™•Ñ•èMÑÉ¥¹œ¡…™™•Ñ•ñð€ˆˆ¤°(€€€€€É•…±%¹É½ÕÀ°(€€€€€…¹‘¥‘…Ñ•Ì°(€€€ôì(€ô(€™Õ¹Ñ¥½¸…µ‰É½Í•Q¡É••A±…å•É½¹Ñ•áÐ¡É½ÕÁÌ°É½ÕÁ%¹‘•à€ô¹Õ±°¤ì(€€€½¹ÍÐÍ¡½ÉÑ%¹‘•à€ôÉ½ÕÁ%¹‘•à€ôôô¹Õ±°€üÉ½ÕÁÌ¹™¥¹‘%¹‘•à (€€€€€€¡É½ÕÀ¤€ôøÉ½ÕÀ¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤¹±•¹Ñ €ôôô€Ì°(€€€€¤€èÉ½ÕÁÍmÉ½ÕÁ%¹‘•átü¹™¥±Ñ•È¡¥ôùMÑÉ¥¹œ¡¥¤„ôõ9=}AIQ9I}%¤¹±•¹Ñ ôôôÌ€üÉ½ÕÁ%¹‘•à€è€´Äì(€€€¥˜€¡Í¡½ÉÑ%¹‘•à€ð€À¤É•ÑÕÉ¸¹Õ±°ì(€€€É•ÑÕÉ¸ì(€€€€€É½ÕÁ%¹‘•àèÍ¡½ÉÑ%¹‘•à°(€€€€€¹½A…ÉÑ¹•É%¹‘•àè€´Ä°(€€€€€…™™•Ñ•è€ˆˆ°(€€€€€É•…±%¹É½ÕÀèÉ½ÕÁÍmÍ¡½ÉÑ%¹‘•át(€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤°(€€€€€…¹‘¥‘…Ñ•Ìèmt°(€€€ôì(€ô(€™Õ¹Ñ¥½¸¡½½Í•I…¹‘½´¡…ÉÈ°•á±Õ‘”€ômt¤ì(€€€½¹ÍÐ•à€ô¹•ÜM•Ð¡•á±Õ‘”¹µ…À¡MÑÉ¥¹œ¤¤°(€€€€€„€ô…ÉÈ¹™¥±Ñ•È ¡à¤€ôø€…•à¹¡…Ì¡MÑÉ¥¹œ¡à¤¤¤ì(€€€É•ÑÕÉ¸„¹±•¹Ñ €ü…m5…Ñ ¹™±½½È¡5…Ñ ¹É…¹‘½´ ¤€¨„¹±•¹Ñ ¥t€è¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸•¹ÍÕÉ•=¹•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡Í•ÑÕÀ°‘…ä¤ì(€€€½¹ÍÐÑà€ô…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤(€€€€€€ü…µ‰É½Í•Q¡É••A±…å•É½¹Ñ•áÐ¡Í•ÑÕÀ¹É½ÕÁÌ°Í•ÑÕÀ¹Í¡½ÉÑQ•…µ%¹‘•à€üü¹Õ±°¤(€€€€€€è¹½A…ÉÑ¹•É½¹Ñ•áÐ¡Í•ÑÕÀ¹É½ÕÁÌ°‘…ä°Í•ÑÕÀ¹Í¡½ÉÑQ•…µ%¹‘•à€üü¹Õ±°¤ì(€€€¥˜€ …Ñà¤ì(€€€€€Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È€ô¹Õ±°ì(€€€€€Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•È€ô¹Õ±°ì(€€€€€Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌ€ôíôì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€¥˜€¡…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤¤Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È€ô¹Õ±°ì(€€€•±Í”¥˜€ (€€€€€€…Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•Èñð(€€€€€€…Ñà¹…¹‘¥‘…Ñ•Ì¹µ…À¡MÑÉ¥¹œ¤¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È¤¤(€€€€¤(€€€€€Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È€ô¡½½Í•I…¹‘½´¡Ñà¹…¹‘¥‘…Ñ•Ì¤ì(€€€½¹ÍÐ•µ•É•¹ä€ôÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌü¹l‰‘…äˆ€¬‘…åtì(€€€¥˜€¡•µ•É•¹ä€˜˜•µ•É•¹ä¹É½ÕÁ%¹‘•à€ôôôÑà¹É½ÕÁ%¹‘•à¤ì(€€€€€Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È€ô•µ•É•¹ä¹Ù¥ÉÑÕ…±A±…å•É%ì(€€€€€Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌ€ô•µ•É•¹ä¹¹ÑÁáÑÉ…A±…å•ÉÌñðíôì(€€€€€Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•È€ô¹Õ±°ì(€€€ô•±Í”¥˜€¡½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰¹ÑÀˆ°‘…ä¤¤ì(€€€€€½¹ÍÐ•±¥¥‰±”€ôÑà¹É•…±%¹É½ÕÀ¹µ…À¡MÑÉ¥¹œ¤ì(€€€€€€¼¼AÉ•Í•ÉÙ”•á¥ÍÑ¥¹œ±½­•Í¥¹±”µY@•Ù•¹ÑÌì¹•Ü‘É…ÝÌÉ½Ñ…Ñ”…ÑÑ•µÁÑÌ‰ä¡½±”¸(€€€€€¥˜€¡Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•È€˜˜€¡Í•ÑÕÀ¹Í…Ù•ñðÍÑ½É”¹•Ù•¹Ð¹±½­•¤€˜˜€…=‰©•Ð¹­•åÌ¡Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌñðíô¤¹±•¹Ñ ¤É•ÑÕÉ¸ì(€€€€€½¹ÍÐ½É‘•È€ô€¡Í•ÑÕÀ¹¹ÑÁI½Ñ…Ñ¥½¸ñðmt¤¹™¥±Ñ•È¡¥€ôø•±¥¥‰±”¹¥¹±Õ‘•Ì¡¥¤¤ì(€€€€€¥˜€¡½É‘•È¹±•¹Ñ €„ôô•±¥¥‰±”¹±•¹Ñ ñð¹•ÜM•Ð¡½É‘•È¤¹Í¥é”€„ôô•±¥¥‰±”¹±•¹Ñ ¤Í•ÑÕÀ¹¹ÑÁI½Ñ…Ñ¥½¸€ôÍ¡Õ™™±•½Áä¡•±¥¥‰±”¤ì(€€€€€•±Í”Í•ÑÕÀ¹¹ÑÁI½Ñ…Ñ¥½¸€ô½É‘•Èì(€€€€€Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌ€ô=‰©•Ð¹™É½µ¹ÑÉ¥•Ì¡¹ÑÁ!½±•Í%¹A±…å¥¹=É‘•È¡‘…ä¤¹µ…À ¡¡½±”±¥¹‘•à¤ôùmMÑÉ¥¹œ¡¡½±”¤±Í•ÑÕÀ¹¹ÑÁI½Ñ…Ñ¥½¹m¥¹‘•à••±¥¥‰±”¹±•¹Ñ¡ut¤¤ì(€€€€€Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•È€ô¹Õ±°ì(€€€ô•±Í”ì(€€€€€Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•È€ô¹Õ±°ì(€€€€€Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌ€ôíôì(€€€ô(€ô(€™Õ¹Ñ¥½¸ÍÝ…Á]¡½±•Q•…µÌ¡•Ù•¹Ð°‘…ä°™¥ÉÍÐ°Í•½¹¤ì(€€€½¹ÍÐÍ•ÑÕÀ€ô•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‘…äœ€¬‘…åtì(€€€¥˜€ …Í•ÑÕÀñð•Ù•¹Ð¹±½­•ñðÍ•ÑÕÀ¹Í…Ù•ñð™¥ÉÍÑ…åM½É•¹ÑÉä¡‘…ä¤ñð(€€€€€€€€…9Õµ‰•È¹¥Í%¹Ñ••È¡™¥ÉÍÐ¤ñð€…9Õµ‰•È¹¥Í%¹Ñ••È¡Í•½¹¤ñð™¥ÉÍÐ€ôôôÍ•½¹ñð(€€€€€€€™¥ÉÍÐ€ð€ÀñðÍ•½¹€ð€Àñð€…Í•ÑÕÀ¹É½ÕÁÍm™¥ÉÍÑtñð€…Í•ÑÕÀ¹É½ÕÁÍmÍ•½¹‘t¤É•ÑÕÉ¸™…±Í”ì(€€€½¹ÍÐ•á¡…¹”€ô€¡µ…À¤€ôøì(€€€€€¥˜€ …µ…À¤É•ÑÕÉ¸ì(€€€€€½¹ÍÐ„€ôµ…Ám™¥ÉÍÑt°ˆ€ôµ…ÁmÍ•½¹‘tì(€€€€€¥˜€¡ˆ€ôôôÕ¹‘•™¥¹•¤‘•±•Ñ”µ…Ám™¥ÉÍÑtì•±Í”µ…Ám™¥ÉÍÑt€ôˆì(€€€€€¥˜€¡„€ôôôÕ¹‘•™¥¹•¤‘•±•Ñ”µ…ÁmÍ•½¹‘tì•±Í”µ…ÁmÍ•½¹‘t€ô„ì(€€€ôì(€€€•á¡…¹”¡Í•ÑÕÀ¹É½ÕÁÌ¤ì(€€€•á¡…¹”¡Í•ÑÕÀ¹Í¡½ÉÑQ•…µÌ¤ì(€€€•á¡…¹”¡•Ù•¹Ð¹…µ‰É½Í•I½±•ÍÍ¥¹µ•¹ÑÌü¹l‘…äœ€¬‘…åt¤ì(€€€½¹ÍÐ•µ•É•¹ä€ô•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌü¹l‘…äœ€¬‘…åtì(€€€¥˜€¡•µ•É•¹äü¹É½ÕÁ%¹‘•à€ôôô™¥ÉÍÐ¤•µ•É•¹ä¹É½ÕÁ%¹‘•à€ôÍ•½¹ì(€€€•±Í”¥˜€¡•µ•É•¹äü¹É½ÕÁ%¹‘•à€ôôôÍ•½¹¤•µ•É•¹ä¹É½ÕÁ%¹‘•à€ô™¥ÉÍÐì(€€€€¼¼MÑ…ÉÑ¥¹œ¡½±•Ì…¹Ñ•”Ñ¥µ•Ì‰•±½¹œÑ¼Ñ¡”Ñ•”Í±½ÑÌ°¹½ÐÑ¡”½±™•ÉÌ¸(€€€½¹ÍÐ™¥ÉÍÑM¡½ÉÐ€ôÍ•ÑÕÀ¹É½ÕÁÌ¹™¥¹‘%¹‘•à¡œ€ôøœ¹™¥±Ñ•È¡¥€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤¹±•¹Ñ €ôôô€Ì¤ì(€€€½¹ÍÐ…ÍÍ¥¹µ•¹Ð€ôÍ•ÑÕÀ¹Í¡½ÉÑQ•…µÌü¹m™¥ÉÍÑM¡½ÉÑtñðíôì(€€€Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È€ô…ÍÍ¥¹µ•¹Ð¹Ù¥ÉÑÕ…±A±…å•Èñð¹Õ±°ì(€€€Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•È€ô…ÍÍ¥¹µ•¹Ð¹¹ÑÁáÑÉ…A±…å•Èñð¹Õ±°ì(€€€Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌ€ô…ÍÍ¥¹µ•¹Ð¹¹ÑÁáÑÉ…A±…å•ÉÌñðíôì(€€€Í•ÑÕÀ¹Í…Ù•€ô™…±Í”ì(€€€•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€€€É•ÑÕÉ¸ÑÉÕ”ì(€ô(€™Õ¹Ñ¥½¸Í•ÑÕÁ½ÉQ•…´¡Í•ÑÕÀ°É½ÕÁ%¹‘•à¤ì(€€€¥˜€ …Í•ÑÕÀ¤É•ÑÕÉ¸Í•ÑÕÀì(€€€¥˜€¡Í•ÑÕÀ¹Í¡½ÉÑQ•…µÌ¤É•ÑÕÉ¸ì¸¸¹Í•ÑÕÀ°Ù¥ÉÑÕ…±A±…å•Èé¹Õ±°°¹ÑÁáÑÉ…A±…å•Èé¹Õ±°°¹ÑÁáÑÉ…A±…å•ÉÌéíô°€¸¸¹Í•ÑÕÀ¹Í¡½ÉÑQ•…µÍmMÑÉ¥¹œ¡É½ÕÁ%¹‘•à¥t°Í¡½ÉÑQ•…µ%¹‘•àéÉ½ÕÁ%¹‘•áôì(€€€½¹ÍÐ™¥ÉÍÐ€ôÍ•ÑÕÀ¹É½ÕÁÌ¹™¥¹‘%¹‘•à¡œ€ôøœ¹Í½µ”¡¥€ôøMÑÉ¥¹œ¡¥¤ôôõ9=}AIQ9I}%¤ñð€¡…µ‰É½Í•%Í=¸ ¤€˜˜œ¹±•¹Ñ ôôôÌ¤¤ì(€€€É•ÑÕÉ¸ì¸¸¹Í•ÑÕÀ°€¸¸¸¡™¥ÉÍÐôôõÉ½ÕÁ%¹‘•àýíôéíÙ¥ÉÑÕ…±A±…å•Èé¹Õ±°±¹ÑÁáÑÉ…A±…å•Èé¹Õ±°±¹ÑÁáÑÉ…A±…å•ÉÌéíõô¤±Í¡½ÉÑQ•…µ%¹‘•àéÉ½ÕÁ%¹‘•áôì(€ô(€™Õ¹Ñ¥½¸•¹ÍÕÉ•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡Í•ÑÕÀ°‘…ä¤ì(€€€½¹ÍÐÁÉ•Ù¥½ÕÌõÍ•ÑÕÀ¹Í¡½ÉÑQ•…µÌñðíô°¹•áÐõíô°ÕÍ•õ¹•ÜM•Ð ¤ì(€€€½¹ÍÐ•µ•É•¹äõÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌü¹l‘…äœ­‘…åtì(€€€¥˜¡•µ•É•¹äü¹Ù¥ÉÑÕ…±A±…å•É%¥ÕÍ•¹…‘¡MÑÉ¥¹œ¡•µ•É•¹ä¹Ù¥ÉÑÕ…±A±…å•É%¤¤ì(€€€½¹ÍÐÍ¡½ÉÑ%¹‘•á•ÌõÍ•ÑÕÀ¹É½ÕÁÌ¹µ…À ¡œ±¤¤ôùœ¹™¥±Ñ•È¡¥ôùMÑÉ¥¹œ¡¥¤„ôõ9=}AIQ9I}%¤¹±•¹Ñ ôôôÌý¤è´Ä¤¹™¥±Ñ•È¡¤ôù¤øôÀ¤ì(€€€½¹ÍÐ±•…å%¹‘•àõÍ•ÑÕÀ¹É½ÕÁÌ¹™¥¹‘%¹‘•à¡œôùœ¹Í½µ”¡¥ôùMÑÉ¥¹œ¡¥¤ôôõ9=}AIQ9I}%¤ñð€¡…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤˜™œ¹±•¹Ñ ôôôÌ¤¤ì(€€€™½È¡½¹ÍÐ¤½˜Í¡½ÉÑ%¹‘•á•Ì¥ì(€€€€€¥˜ ……µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤˜˜…Í•ÑÕÀ¹É½ÕÁÍm¥t¹Í½µ”¡¥ôùMÑÉ¥¹œ¡¥¤ôôõ9=}AIQ9I}%¤¥Í•ÑÕÀ¹É½ÕÁÍm¥t¹ÁÕÍ ¡9=}AIQ9I}%¤ì(€€€€€½¹ÍÐ±•…äô…Í•ÑÕÀ¹Í¡½ÉÑQ•…µÌ˜™¤ôôõ±•…å%¹‘•à€üíÙ¥ÉÑÕ…±A±…å•ÈéÍ•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È±¹ÑÁáÑÉ…A±…å•ÈéÍ•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•È±¹ÑÁáÑÉ…A±…å•ÉÌéÍ•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÍô€èíôì(€€€€€½¹ÍÐ±½…°õì¸¸¹Í•ÑÕÀ°¸¸¹±•…ä°¸¸¹ÁÉ•Ù¥½ÕÍmMÑÉ¥¹œ¡¤¥t±Í¡½ÉÑQ•…µ%¹‘•àé¥ôì(€€€€€¥˜ …ÁÉ•Ù¥½ÕÍmMÑÉ¥¹œ¡¤¥t˜˜…=‰©•Ð¹­•åÌ¡±•…ä¤¹±•¹Ñ ¥í±½…°¹Ù¥ÉÑÕ…±A±…å•Èõ¹Õ±°í±½…°¹¹ÑÁáÑÉ…A±…å•Èõ¹Õ±°í±½…°¹¹ÑÁáÑÉ…A±…å•ÉÌõíôí±½…°¹¹ÑÁI½Ñ…Ñ¥½¸õmtíô(€€€€€•¹ÍÕÉ•=¹•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡±½…°±‘…ä¤ì(€€€€€¥˜ ……µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤¥ì(€€€€€€€½¹ÍÐÑàõ¹½A…ÉÑ¹•É½¹Ñ•áÐ¡Í•ÑÕÀ¹É½ÕÁÌ±‘…ä±¤¤ì(€€€€€€€½¹ÍÐÉ•Í•ÉÙ•õ•µ•É•¹äü¹É½ÕÁ%¹‘•àôôõ¤ì(€€€€€€€¥˜ …É•Í•ÉÙ•€˜˜ÕÍ•¹¡…Ì¡MÑÉ¥¹œ¡±½…°¹Ù¥ÉÑÕ…±A±…å•È¤¤¤±½…°¹Ù¥ÉÑÕ…±A±…å•Èõ¡½½Í•I…¹‘½´¡Ñà¹…¹‘¥‘…Ñ•Ì±l¸¸¹ÕÍ•‘t¤ì(€€€€€€€¥˜ …±½…°¹Ù¥ÉÑÕ…±A±…å•È¥Ñ¡É½Ü¹•ÜÉÉ½È 9¼‘¥ÍÑ¥¹ÐY¥ÉÑÕ…°A±…å•È¥Ì…Ù…¥±…‰±”™½ÈQ•…´€œ¬¡¤¬Ä¤¬œ¸I•Ù¥•ÜÑ¡”‘É…Ü¸œ¤ì(€€€€€€€ÕÍ•¹…‘¡MÑÉ¥¹œ¡±½…°¹Ù¥ÉÑÕ…±A±…å•È¤¤ì(€€€€€ô(€€€€€¹•áÑmMÑÉ¥¹œ¡¤¥tõíÙ¥ÉÑÕ…±A±…å•Èé±½…°¹Ù¥ÉÑÕ…±A±…å•Éññ¹Õ±°±¹ÑÁáÑÉ…A±…å•Èé±½…°¹¹ÑÁáÑÉ…A±…å•Éññ¹Õ±°±¹ÑÁáÑÉ…A±…å•ÉÌé±½…°¹¹ÑÁáÑÉ…A±…å•ÉÍññíô±¹ÑÁI½Ñ…Ñ¥½¸é±½…°¹¹ÑÁI½Ñ…Ñ¥½¹ññmuôì(€€€ô(€€€Í•ÑÕÀ¹Í¡½ÉÑQ•…µÌõ¹•áÐì(€€€½¹ÍÐ™¥ÉÍÐõ¹•áÑmMÑÉ¥¹œ¡Í¡½ÉÑ%¹‘•á•ÍlÁt¥tñðíôì(€€€€¼¼1•…ä™¥•±‘ÌÉ•µ…¥¸É•…‘…‰±”‰ä½±‰…­ÕÁÌ¸ÕÉÉ•¹ÐÍ½É¥¹œÕÍ•ÌÑ¡”Ñ•…´µ…À¸(€€€Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•Èõ™¥ÉÍÐ¹Ù¥ÉÑÕ…±A±…å•Éññ¹Õ±°íÍ•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•Èõ™¥ÉÍÐ¹¹ÑÁáÑÉ…A±…å•Éññ¹Õ±°íÍ•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌõ™¥ÉÍÐ¹¹ÑÁáÑÉ…A±…å•ÉÍññíôì(€ô(€™Õ¹Ñ¥½¸Í¡½ÉÑQ•…µIÕ±•1¥¹•Ì¡•Ù•¹Ð°‘…ä¤ì(€€€½¹ÍÐÍ•ÑÕÀõ•Ù•¹Ð¹É½ÕÁM•ÑÕÀü¹l‘…äœ­‘…åtí¥˜ …Í•ÑÕÀ¥É•ÑÕÉ¸mtì(€€€É•ÑÕÉ¸=‰©•Ð¹•¹ÑÉ¥•Ì¡Í•ÑÕÀ¹Í¡½ÉÑQ•…µÍññíô¤¹™±…Ñ5…À ¡m¤±…t¤ôùì(€€€€€½¹ÍÐ±¥¹•ÌõmQ•…´€‘ì­¤¬ÅôèÑ¡É•”É•…°½±™•ÉÌ‘í„¹Ù¥ÉÑÕ…±A±…å•Èý€ì€‘íÁ±…å•È¡„¹Ù¥ÉÑÕ…±A±…å•È¤ü¹¹…µ”ñð€Ñ¡”…ÍÍ¥¹•½±™•ÈôÍÕÁÁ±¥•ÌÑ¡”Y¥ÉÑÕ…°A±…å•ÈÍ½É”™½ÈµÕ±Ñ¥Á±…å•È½µÁ•Ñ¥Ñ¥½¹Í€èœ¸9¼‰½ÉÉ½Ý•Í½É”¥ÌÕÍ•™½Èµ‰É½Í”ô¹tì(€€€€€½¹ÍÐ…ÑÑ•µÁÑÌõ=‰©•Ð¹•¹ÑÉ¥•Ì¡„¹¹ÑÁáÑÉ…A±…å•ÉÍññíô¤¹µ…À ¡m¡½±”±¥‘t¤ôù!½±”€‘í¡½±•ôè€‘íÁ±…å•È¡¥¤ü¹¹…µ•ñðÑ¡”…ÍÍ¥¹•½±™•ÈôÑ…­•ÌÑÝ¼Ñ•”Í¡½ÑÌì•¥Ñ¡•Èµ…äÝ¥¸9QA€¤ì(€€€€€¥˜¡„¹¹ÑÁáÑÉ…A±…å•È¥…ÑÑ•µÁÑÌ¹ÁÕÍ ¡€‘íÁ±…å•È¡„¹¹ÑÁáÑÉ…A±…å•È¤ü¹¹…µ•ñðÑ¡”…ÍÍ¥¹•½±™•ÈôÑ…­•ÌÑÝ¼Í¡½ÑÌ½¸•… 9Q@¡½±•€¤ì(€€€€€¥˜¡…ÑÑ•µÁÑÌ¹±•¹Ñ ¥±¥¹•Ì¹ÁÕÍ ¡Q•…´€‘ì­¤¬Åô9Q@•áÑÉ„…ÑÑ•µÁÑÌƒŠP€‘í…ÑÑ•µÁÑÌ¹©½¥¸ œì€œ¥ô¹€¤ì(€€€€€É•ÑÕÉ¸±¥¹•Ìì(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸¥¹¥Ñ¥…±¥Í•É½ÕÁÌ ¤ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ð¤É•ÑÕÉ¸ì(€€€ÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÀ€ôÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÀñðíôì(€€€™½È€¡±•Ð‘…ä€ô€Äì‘…ä€ðôÍÑ½É”¹•Ù•¹Ð¹‘…åÌì‘…ä¬¬¤ì(€€€€€½¹ÍÐ­•ä€ô€‰‘…äˆ€¬‘…ä°(€€€€€€€¥‘Ì€ô‘…å¥•±‘%‘Ì¡‘…ä¤°(€€€€€€€•µ•É•¹ä€ôÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌü¹m­•åt°(€€€€€€€•áÁ•Ñ•‘%‘Ì€ô•µ•É•¹ä€ül¸¸¹¥‘Ì°9=}AIQ9I}%t€è¥‘Ìì(€€€€€½¹ÍÐÕÉÉ•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÁm­•åtì(€€€€€½¹ÍÐÍ…µ”€ô(€€€€€€€ÕÉÉ•¹Ð€˜˜(€€€€€€€ÕÉÉ•¹Ð¹É½ÕÁÌ€˜˜(€€€€€€€ÕÉÉ•¹Ð¹É½ÕÁÌ¹™±…Ð ¤¹µ…À¡MÑÉ¥¹œ¤¹™¥±Ñ•È¡¥ôù¥„ôõ9=}AIQ9I}%¤¹Í½ÉÐ ¤¹©½¥¸ ‰ðˆ¤€ôôô(€€€€€€€€€•áÁ•Ñ•‘%‘Ì¹µ…À¡MÑÉ¥¹œ¤¹™¥±Ñ•È¡¥ôù¥„ôõ9=}AIQ9I}%¤¹Í½ÉÐ ¤¹©½¥¸ ‰ðˆ¤€˜˜(€€€€€€€ÕÉÉ•¹Ð¹É½ÕÁÌ¹•Ù•Éä¡É½ÕÀôù…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð±‘…ä¤€ü€…É½ÕÀ¹¥¹±Õ‘•Ì¡9=}AIQ9I}%¤€èÉ½ÕÀ¹™¥±Ñ•È¡¥ôù¥„ôõ9=}AIQ9I}%¤¹±•¹Ñ „ôôÌñðÉ½ÕÀ¹¥¹±Õ‘•Ì¡9=}AIQ9I}%¤¤ì(€€€€€¥˜€ …Í…µ”¤ì(€€€€€€€€¼¼	Õ¥±Ñ¡”™¥ÉÍÐÙ¥•ÜÝ¥Ñ Ñ¡”Í…µ”!¥ÍÑ½Éä	…±…¹•±½¥ŒÑ¡”½É…¹¥Í•È•ÑÌ‰äÁÉ•ÍÍ¥¹œÑ¡”‰ÕÑÑ½¸¸(€€€€€€€€¼¼…ä€ÈÑ¡•É•™½É”Í••ÌÑ¡”¹•Ý±äµÉ•…Ñ•…ä€Ä…¹…Ù½¥‘ÌÕ¹¹••ÍÍ…ÉäÉ•Á•…ÑÌ¥µµ•‘¥…Ñ•±ä¸(€€€€€€€±•ÐÉ½ÕÁÌ€ô¡¥ÍÑ½Éå	…±…¹•‘É½ÕÁÌ¡¥‘Ì°‘…ä¤ì(€€€€€€€€¼¼áÑÉ„Í…™•Õ…Éè¥˜9¼A…ÉÑ¹•È•á¥ÍÑÌ½¸‰½Ñ ‘…åÌ°…Ù½¥…±±½…Ñ¥¹œ¥ÐÑ¼Ñ¡”Í…µ”½±™•ÈÝ¡•É”…±Ñ•É¹…Ñ¥Ù•Ì•á¥ÍÐ¸(€€€€€€€¥˜€ (€€€€€€€€€‘…ä€ôôô€È€˜˜(€€€€€€€€€É½ÕÁÌ¹Í½µ” ¡œ¤€ôøœ¹Í½µ” ¡à¤€ôøMÑÉ¥¹œ¡à¤€ôôô9=}AIQ9I}%¤¤(€€€€€€€€¤ì(€€€€€€€€€½¹ÍÐÄ€ôÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÀ¹‘…äÄ°(€€€€€€€€€€€ÑàÄ€ôÄ€ü¹½A…ÉÑ¹•É½¹Ñ•áÐ¡Ä¹É½ÕÁÌ°€Ä¤€è¹Õ±°ì(€€€€€€€€€±•ÐÑàÈ€ô¹½A…ÉÑ¹•É½¹Ñ•áÐ¡É½ÕÁÌ°€È¤ì(€€€€€€€€€¥˜€¡ÑàÄ€˜˜ÑàÈ€˜˜MÑÉ¥¹œ¡ÑàÄ¹…™™•Ñ•¤€ôôôMÑÉ¥¹œ¡ÑàÈ¹…™™•Ñ•¤¤ì(€€€€€€€€€€€½¹ÍÐ¹Á€ôÑàÈ¹É½ÕÁ%¹‘•à°(€€€€€€€€€€€€€¹Á$€ôÑàÈ¹¹½A…ÉÑ¹•É%¹‘•àì(€€€€€€€€€€€±•ÐÍÝ…ÁÁ•€ô™…±Í”ì(€€€€€€€€€€€™½È€¡±•Ð¤€ô€Àì¤€ðÉ½ÕÁÌ¹±•¹Ñ €˜˜€…ÍÝ…ÁÁ•ì¤¬¬¤(€€€€€€€€€€€€€™½È€¡±•ÐÁ¤€ô€ÀìÁ¤€ðÉ½ÕÁÍm¥t¹±•¹Ñ €˜˜€…ÍÝ…ÁÁ•ìÁ¤¬¬¤ì(€€€€€€€€€€€€€€€½¹ÍÐ…¹‘¥‘…Ñ”€ôMÑÉ¥¹œ¡É½ÕÁÍm¥umÁ¥t¤ì(€€€€€€€€€€€€€€€¥˜€ (€€€€€€€€€€€€€€€€€…¹‘¥‘…Ñ”€„ôô9=}AIQ9I}%€˜˜(€€€€€€€€€€€€€€€€€…¹‘¥‘…Ñ”€„ôôMÑÉ¥¹œ¡ÑàÄ¹…™™•Ñ•¤(€€€€€€€€€€€€€€€€¤ì(€€€€€€€€€€€€€€€€€½¹ÍÐÑ•µÀ€ô(€€€€€€€€€€€€€€€€€€€É½ÕÁÍm¹Áum¹Á$€ôôô€À€ü€Ä€è¹Á$€ôôô€È€ü€Ì€è¹Á$€´€Åtì(€€€€€€€€€€€€€€€€€½¹ÍÐÁ…ÉÑ¹•É%¹‘•à€ô¹Á$€ôôô€À€ü€Ä€è¹Á$€ôôô€È€ü€Ì€è¹Á$€´€Äì(€€€€€€€€€€€€€€€€€É½ÕÁÍm¹ÁumÁ…ÉÑ¹•É%¹‘•át€ôÉ½ÕÁÍm¥umÁ¥tì(€€€€€€€€€€€€€€€€€É½ÕÁÍm¥umÁ¥t€ôÑ•µÀì(€€€€€€€€€€€€€€€€€ÍÝ…ÁÁ•€ôÑÉÕ”ì(€€€€€€€€€€€€€€€ô(€€€€€€€€€€€€€ô(€€€€€€€€€ô(€€€€€€€ô(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÁm­•åt€ôì(€€€€€€€€€É½ÕÁÌ°(€€€€€€€€€ÍÑ…ÉÑÌè‘•™…Õ±ÑMÑ…ÉÑÌ¡É½ÕÁÌ°ÍÑ…ÉÑ5•Ñ¡½‘½È¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤°‘…ä¤°(€€€€€€€€€Í…Ù•è™…±Í”°(€€€€€€€€€Ù¥ÉÑÕ…±A±…å•Èè¹Õ±°°(€€€€€€€€€¹ÑÁáÑÉ…A±…å•Èè¹Õ±°°(€€€€€€€ôì(€€€€€ô(€€€€€•¹ÍÕÉ•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡ÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÁm­•åt°‘…ä¤ì(€€€ô(€€€Íå¹¡É½¹¥Í•M¥¹±•Q••É½ÕÁMÑ…ÉÑÌ¡ÍÑ½É”¹•Ù•¹Ð¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹…Ñ¥Ù•É½ÕÁ…ä€ôÍÑ½É”¹•Ù•¹Ð¹…Ñ¥Ù•É½ÕÁ…äñð€Äì(€€€ÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ôÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”ñð€‰¡¥ÍÑ½Éäˆì(€€€ÍÑ½É”¹•Ù•¹Ð¹µ…¹Õ…±5½‘”€ôÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ôôô€‰µ…¹Õ…°ˆì(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ôôôÕ¹‘•™¥¹•¤ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸É½ÕÁ½µÁ•Ñ¥Ñ¥½¹Q•áÐ ¤ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ð¤É•ÑÕÉ¸€ˆˆì(€€€±•ÐŒ€ôµ…¹Õ…±M•±•Ñ•‘½µÁ•Ñ¥Ñ¥½¹Ì¡ÍÑ½É”¹•Ù•¹Ð¹…Ñ¥Ù•É½ÕÁ…äñð€Ä¤°(€€€€€Á…ÉÑÌ€ômtì(€€€¥˜€¡Œ¹¡…Ì ‰™½ÕÉ‰…±°ˆ¤¤(€€€€€Á…ÉÑÌ¹ÁÕÍ  ˆÑ		Á…ÉÑ¹•ÉÌ…É”Ñ¡”ÑÝ¼Á…¥ÉÌÍ¡½Ý¸¥¸•… É½ÕÀˆ¤ì(€€€¥˜€¡Œ¹¡…Ì ‰Ñ•…µAÕÑÑÌˆ¤¤(€€€€€Á…ÉÑÌ¹ÁÕÍ  (€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€ôôô€‰Á…¥ÉÌˆ(€€€€€€€€€€ü€‰Ñ¡”ÑÝ¼€Ñ		Á…ÉÑ¹•ÉÍ¡¥ÁÌ…É”Ñ¡”AÕÑÑ¥¹œÁ…¥ÉÌˆ(€€€€€€€€€€è€‰Ñ¡”™Õ±°™½ÕÈµÁ•ÉÍ½¸É½ÕÀ¥ÌÑ¡”AÕÑÑ¥¹œÑ•…´ˆ°(€€€€€€¤ì(€€€¥˜€¡Œ¹¡…Ì ‰‰•ÍÐÍ½˜Ðˆ¤¤(€€€€€Á…ÉÑÌ¹ÁÕÍ  ‰Ñ¡”™Õ±°™½ÕÈµÁ•ÉÍ½¸É½ÕÀ¥ÌÑ¡”	•ÍÐ€Ì½˜€ÐÑ•…´ˆ¤ì(€€€É•ÑÕÉ¸Á…ÉÑÌ¹©½¥¸ ˆƒ
Ü€ˆ¤ì(€ô(€™Õ¹Ñ¥½¸•Ù•¹Ñ…å!…¹‘¥…ÁÌ¡‘…ä¤ì(€€€•¹ÍÕÉ•Ù•¹ÑQ••A±…¹¹¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹‘…¥±å!…¹‘¥…ÁÌ€ôÍÑ½É”¹•Ù•¹Ð¹‘…¥±å!…¹‘¥…ÁÌñðì(€€€€€‘…äÄèíô°(€€€€€‘…äÈèíô°(€€€ôì(€€€½¹ÍÐ­•ä€ô€‰‘…äˆ€¬‘…ä°(€€€€€…Ñ¥Ù”€ô=‰©•Ð¹™É½µ¹ÑÉ¥•Ì¡‘…å¥•±‘%‘Ì¡‘…ä¤¹™¥±Ñ•È¡¥ôùMÑÉ¥¹œ¡¥¤„ôõ9=}AIQ9I}%¤¹µ…À¡¥ôùì(€€€€€€€½¹ÍÐ…Ñ•½Éäõ•Ù•¹Ñ½ÕÉÍ•…Ñ•½Éä¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±¥¤±Ñ•”õÍ•±•Ñ•‘Ù•¹ÑQ•”¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¤ì(€€€€€€€É•ÑÕÉ¸mMÑÉ¥¹œ¡¥¤±Ñ••!…¹‘¥…ÁÍ½È¡‘…ä±Ñ•”¥mMÑÉ¥¹œ¡¥¥utì(€€€€€ô¤¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹‘…¥±å!…¹‘¥…ÁÍm­•åt€ô…Ñ¥Ù”ì(€€€É•ÑÕÉ¸…Ñ¥Ù”ì(€ô(€™Õ¹Ñ¥½¸Á±…å•É…¥±å!…¹‘¥…À¡¥°‘…ä¤ì(€€€½¹ÍÐ…Ñ•½Éäõ•Ù•¹Ñ½ÕÉÍ•…Ñ•½Éä¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±¥¤ì(€€€½¹ÍÐØ€ôÑ••!…¹‘¥…ÁÍ½È (€€€€€‘…ä°(€€€€€Í•±•Ñ•‘Ù•¹ÑQ•”¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¤°(€€€€¥mMÑÉ¥¹œ¡¥¥tì(€€€É•ÑÕÉ¸Ø€ôôô€ˆˆñðØ€ôô¹Õ±°€ü¹Õ±°€è€­Øì(€ô(€™Õ¹Ñ¥½¸É•½É‘Ù•¹Ñ!…¹‘¥…Á!¥ÍÑ½Éä¡‘…å=¹±ä€ô¹Õ±°¤ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ðñð¥ÍQ•ÍÑÙ•¹Ð¡ÍÑ½É”¹•Ù•¹Ð¤¤É•ÑÕÉ¸ì(€€€½¹ÍÐ™¥ÉÍÑ…ä€ô‘…å=¹±äñð€Ä°(€€€€€±…ÍÑ…ä€ô‘…å=¹±äñðÍÑ½É”¹•Ù•¹Ð¹‘…åÌì(€€€™½È€¡±•Ð‘…ä€ô™¥ÉÍÑ…äì‘…ä€ðô±…ÍÑ…äì‘…ä¬¬¤ì(€€€€€½¹ÍÐŒ€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤ì(€€€€€‘…å¥•±‘%‘Ì¡‘…ä¤(€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôø¥€„ôô9=}AIQ9I}%¤(€€€€€€€€¹™½É…  ¡¥¤€ôøì(€€€€€€€€€½¹ÍÐ €ôÁ±…å•É…¥±å!…¹‘¥…À¡¥°‘…ä¤°(€€€€€€€€€€€¥‘•¹Ñ¥Ñä€ô•Ù•¹ÑA±…å•È¡¥±‘…ä¤°(€€€€€€€€€€€À€ôÍÑ½É”¹Á±…å•ÉÌ¹™¥¹¡ÀôùMÑÉ¥¹œ¡À¹¥¤ôôõMÑÉ¥¹œ¡¥‘•¹Ñ¥Ñäü¹ÁÉ½™¥±•%ñð¥¤¤ì(€€€€€€€€€¥˜€¡ €ôô¹Õ±°ñð€…Àñð€…Œ¤É•ÑÕÉ¸ì(€€€€€€€€€À¹½ÕÉÍ•!…¹‘¥…ÁÌ€ôÀ¹½ÕÉÍ•!…¹‘¥…ÁÌñðíôì(€€€€€€€€€À¹½ÕÉÍ•!…¹‘¥…ÁÍmMÑÉ¥¹œ¡Œ¹¥¥t€ôì(€€€€€€€€€€€½ÕÉÍ•%èMÑÉ¥¹œ¡Œ¹¥¤°(€€€€€€€€€€€½ÕÉÍ•9…µ”èŒ¹¹…µ”°(€€€€€€€€€€€¡…¹‘¥…Àè °(€€€€€€€€€€€ÕÁ‘…Ñ•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€€€€€€€•Ù•¹Ñ9…µ”èÍÑ½É”¹•Ù•¹Ð¹¹…µ”ñð€ˆˆ°(€€€€€€€€€ôì(€€€€€€€ô¤ì(€€€ô(€ô(€™Õ¹Ñ¥½¸É•Ñ…¥¹•‘1•…åM½É¥¹IÕ±•Ì ¤ì(€€€É•ÑÕÉ¸	½½±•…¸¡ÍÑ½É”¹•Ù•¹Ðü¹™¥¹…±I•ÍÕ±ÑÌü¹½¹™¥Éµ•‘Ð€˜˜ÍÑ½É”¹•Ù•¹Ð¹™¥¹…±I•ÍÕ±ÑÌ¹Í½É¥¹IÕ±•ÍY•ÉÍ¥½¸€„ôô€È¤ì(€ô(€™Õ¹Ñ¥½¸ÍÑ…‰±•™½É‘MÑÉ½­•½Õ¹Ð¡¥¹‘•áY…±Õ”°¡…¹‘¥…À¤ì(€€€¡…¹‘¥…À€ô€­¡…¹‘¥…Àñð€Àì(€€€½¹ÍÐÑáÐ€ôMÑÉ¥¹œ¡¥¹‘•áY…±Õ”€üü€ˆˆ¤¹ÑÉ¥´ ¤ì(€€€¥˜€¡¡…¹‘¥…À€ð€À¤ì(€€€€€½¹ÍÐ¥‘à€ô€¬¡ÑáÐ¹ÍÁ±¥Ð ˆ¼ˆ¥lÁtñð€À¤°(€€€€€€€Á±ÕÌ€ô5…Ñ ¹…‰Ì¡¡…¹‘¥…À¤ì(€€€€€¥˜€ …¥‘à¤É•ÑÕÉ¸€Àì(€€€€€½¹ÍÐ‰…Í”€ô5…Ñ ¹™±½½È¡Á±ÕÌ€¼€Äà¤°(€€€€€€€É•´€ôÁ±ÕÌ€”€Äàì(€€€€€É•ÑÕÉ¸€µ‰…Í”€´€¡É•´€˜˜¥‘à€ø€Äà€´É•´€ü€Ä€è€À¤ì(€€€ô(€€€¥˜€¡¡…¹‘¥…À€ôôô€À¤É•ÑÕÉ¸€Àì(€€€¥˜€¡ÑáÐ¹¥¹±Õ‘•Ì ˆ¼ˆ¤¤ì(€€€€€½¹ÍÐ¥¹‘•á•Ì€ôÑáÐ¹ÍÁ±¥Ð ˆ¼ˆ¤¹µ…À ¡à¤€ôø€­MÑÉ¥¹œ¡à¤¹ÑÉ¥´ ¤¤(€€€€€€€€¹™¥±Ñ•È ¡à¤€ôø9Õµ‰•È¹¥Í¥¹¥Ñ”¡à¤€˜˜à€ø€À¤ì(€€€€€½¹ÍÐ±¥ÍÑ•€ô¥¹‘•á•Ì¹™¥±Ñ•È ¡à¤€ôøà€ðô¡…¹‘¥…À¤¹±•¹Ñ ì(€€€€€€¼¼AÉ•Í•ÉÙ”½¹™¥Éµ•¡¥ÍÑ½É¥…°É•ÍÕ±ÑÌ¸‰½Ù”€ÌØ°É•Á•…ÐÑ¡”ÁÉ¥µ…Éä(€€€€€€¼¼€ÇŠLÄà¥¹‘•àÝ¡¥±”É•Ñ…¥¹¥¹œÑ¡”½ÕÉÍ”ÌÍ•Á…É…Ñ”Í•½¹µÍÑÉ½­”½É‘•È¸(€€€€€¥˜€¡É•Ñ…¥¹•‘1•…åM½É¥¹IÕ±•Ì ¤ñð¡…¹‘¥…À€ðô€ÌØ¤É•ÑÕÉ¸±¥ÍÑ•ì(€€€€€½¹ÍÐÁÉ¥µ…Éä€ô¥¹‘•á•ÍlÁtì(€€€€€¥˜€ …ÁÉ¥µ…ÉäñðÁÉ¥µ…Éä€ø€Äà¤É•ÑÕÉ¸±¥ÍÑ•ì(€€€€€½¹ÍÐ•áÑÉ„€ô¡…¹‘¥…À€´€ÌØì(€€€€€É•ÑÕÉ¸±¥ÍÑ•€¬5…Ñ ¹™±½½È¡•áÑÉ„€¼€Äà¤€¬€¡ÁÉ¥µ…Éä€ðô•áÑÉ„€”€Äà€ü€Ä€è€À¤ì(€€€ô(€€€½¹ÍÐ¥‘à€ô€­ÑáÐì(€€€¥˜€ …¥‘à¤É•ÑÕÉ¸€Àì(€€€½¹ÍÐ‰…Í”€ô5…Ñ ¹™±½½È¡¡…¹‘¥…À€¼€Äà¤°(€€€€€É•´€ô¡…¹‘¥…À€”€Äàì(€€€É•ÑÕÉ¸‰…Í”€¬€¡É•´€˜˜¥‘à€ðôÉ•´€ü€Ä€è€À¤ì(€ô(€™Õ¹Ñ¥½¸ÍÑ…‰±•™½É‘A½¥¹ÑÌ¡É½ÍÌ°Á…È°¥¹‘•áY…±Õ”°¡…¹‘¥…À¤ì(€€€¥˜€¡MÑÉ¥¹œ¡É½ÍÌ¤¹Ñ½UÁÁ•É…Í” ¤€ôôô€‰@ˆ¤É•ÑÕÉ¸€Àì(€€€É½ÍÌ€ô€­É½ÍÌì(€€€Á…È€ô€­Á…Èì(€€€¥˜€ …É½ÍÌñð€…Á…Èñð¡…¹‘¥…À€ôô¹Õ±°¤É•ÑÕÉ¸¹Õ±°ì(€€€É•ÑÕÉ¸5…Ñ ¹µ…à (€€€€€€À°(€€€€€€È€¬Á…È€¬ÍÑ…‰±•™½É‘MÑÉ½­•½Õ¹Ð¡¥¹‘•áY…±Õ”°¡…¹‘¥…À¤€´É½ÍÌ°(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸É½ÍÍM½É•ÍÉ•”¡‘…ä°Á±…å•É%°¡½±”°±•™ÑÉ½ÍÌ°É¥¡ÑÉ½ÍÌ°•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¤ì(€€€¥˜€ …Í½É•¹Ñ•É•¡±•™ÑÉ½ÍÌ¤ñð€…Í½É•¹Ñ•É•¡É¥¡ÑÉ½ÍÌ¤¤É•ÑÕÉ¸™…±Í”ì(€€€¥˜€¡MÑÉ¥¹œ¡±•™ÑÉ½ÍÌ¤¹Ñ½UÁÁ•É…Í” ¤€ôôôMÑÉ¥¹œ¡É¥¡ÑÉ½ÍÌ¤¹Ñ½UÁÁ•É…Í” ¤¤É•ÑÕÉ¸ÑÉÕ”ì(€€€€¼¼Ù•¹ÑÌ¹••‘¥¹œ…¸…ÑÕ…°É½ÍÌÍ½É”µÕÍÐµ…Ñ •á…Ñ±ä¸½È„(€€€€¼¼MÑ…‰±•™½Éµ½¹±äÉ•ÍÕ±Ð°„Á¥¬µÕÀ…¹„¹Õµ•É¥Œé•É¼µÁ½¥¹ÐÍ½É”…É”(€€€€¼¼•ÅÕ¥Ù…±•¹Ð½ÕÑ½µ•Ì™½ÈÑ¡”¡½±”¸(€€€¥˜€¡l‰ÍÑÉ½­”ˆ°€‰ÍÉ…Ñ ˆ°€‰•±•Ñ¥Œ‰t¹Í½µ” ¡¥¤€ôø½µÁ•Ñ¥Ñ¥½¹%Í=¸¡¥°‘…ä°•Ù•¹Ð¤¤¤É•ÑÕÉ¸™…±Í”ì(€€€¥˜€ …l‰Í¥¹±”ˆ°€‰½µ‰¥¹•ˆ°€‰™½ÕÉ‰…±°ˆ°€‰‰•ÍÐÍ½˜Ðˆ°€‰Á…ÈÌˆ°€‰å•±±½Ý	…±°ˆ°€‰…ÁQ•…µÌ‰t¹Í½µ” ¡¥¤€ôø½µÁ•Ñ¥Ñ¥½¹%Í=¸¡¥°‘…ä°•Ù•¹Ð¤¤¤É•ÑÕÉ¸™…±Í”ì(€€€½¹ÍÐ…É€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä°•Ù•¹Ð°Á±…å•É%¤°(€€€€€¥¹‘•à€ô€­¡½±”€´€Ä°(€€€€€Á…È€ô€¬¡…Éü¹Á…Èü¹m¥¹‘•átñð€À¤°(€€€€€ÍÑÉ½­•%¹‘•à€ô…Éü¹¥¹‘•àü¹m¥¹‘•át€üü€ˆˆ°(€€€€€¡…¹‘¥…À€ôÁ±…å•É…¥±å!…¹‘¥…À¡Á±…å•É%°‘…ä¤ì(€€€É•ÑÕÉ¸ÍÑ…‰±•™½É‘A½¥¹ÑÌ¡±•™ÑÉ½ÍÌ°Á…È°ÍÑÉ½­•%¹‘•à°¡…¹‘¥…À¤€ôôô€À€˜˜(€€€€€ÍÑ…‰±•™½É‘A½¥¹ÑÌ¡É¥¡ÑÉ½ÍÌ°Á…È°ÍÑÉ½­•%¹‘•à°¡…¹‘¥…À¤€ôôô€Àì(€ô(€™Õ¹Ñ¥½¸Í½É•M•ÅÕ•¹”¡ÍÑ…ÉÐ¤ì(€€€ÍÑ…ÉÐ€ô€­ÍÑ…ÉÐñð€Äì(€€€É•ÑÕÉ¸ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôø€ ¡ÍÑ…ÉÐ€´€Ä€¬¤¤€”€Äà¤€¬€Ä¤ì(€ô(€™Õ¹Ñ¥½¸Í½É¥¹…åMÑ½É”¡‘…ä¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹œ€ôÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹œñðì‘…äÄèíô°‘…äÈèíôôì(€€€ÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹l‰‘…äˆ€¬‘…åt€ôÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹l‰‘…äˆ€¬‘…åtñðíôì(€€€É•ÑÕÉ¸ÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹l‰‘…äˆ€¬‘…åtì(€ô(€™Õ¹Ñ¥½¸Í½É•ÉMÑ½É”¡‘…ä°Í½É•É%¤ì(€€€½¹ÍÐ€ôÍ½É¥¹…åMÑ½É”¡‘…ä¤°(€€€€€¥€ôMÑÉ¥¹œ¡Í½É•É%¤ì(€€€‘m¥‘t€ô‘m¥‘tñðíôì(€€€É•ÑÕÉ¸‘m¥‘tì(€ô(€™Õ¹Ñ¥½¸Í½É•I•½É¡‘…ä°Í½É•É%°¡½±”¤ì(€€€½¹ÍÐÌ€ôÍ½É•ÉMÑ½É”¡‘…ä°Í½É•É%¤°(€€€€€¬€ôMÑÉ¥¹œ¡¡½±”¤ì(€€€Ím­t€ôÍm­tñðì½™™¥¥…°èíô°Í•±˜èíô°¹ÑÀèíôôì(€€€É•ÑÕÉ¸Ím­tì(€ô(€½¹ÍÐÍ½É•¹Ñ•É•€ô€¡Ù…±Õ”¤€ôøÙ…±Õ”€„ôô€ˆˆ€˜˜Ù…±Õ”€„ô¹Õ±°ì(€™Õ¹Ñ¥½¸™¥ÉÍÑ…åM½É•¹ÑÉä¡‘…ä¤ì(€€€½¹ÍÐÉ½Õ¹‘Ì€ôÍÑ½É”¹•Ù•¹Ðü¹Í½É¥¹œü¹l‰‘…äˆ€¬‘…åtñðíôì(€€€™½È€¡½¹ÍÐmÍ½É•É%°É½Õ¹‘t½˜=‰©•Ð¹•¹ÑÉ¥•Ì¡É½Õ¹‘Ì¤¤ì(€€€€€™½È€¡½¹ÍÐm¡½±”°É•t½˜=‰©•Ð¹•¹ÑÉ¥•Ì¡É½Õ¹ñðíô¤¤ì(€€€€€€€¥˜€ „½x¡lÄ´åuðÅlÀ´át¤¼¹Ñ•ÍÐ¡¡½±”¤¤½¹Ñ¥¹Õ”ì(€€€€€€€¥˜€ (€€€€€€€€€l(€€€€€€€€€€€É•Œü¹Í•±˜ü¹É½ÍÌ°(€€€€€€€€€€€É•Œü¹Í•±˜ü¹ÁÕÑÑÌ°(€€€€€€€€€€€É•Œü¹½™™¥¥…°ü¹É½ÍÌ°(€€€€€€€€€€€É•Œü¹½™™¥¥…°ü¹ÁÕÑÑÌ°(€€€€€€€€€t¹Í½µ”¡Í½É•¹Ñ•É•¤(€€€€€€€€¤(€€€€€€€€€É•ÑÕÉ¸ìÍ½É•É%èMÑÉ¥¹œ¡Í½É•É%¤°¡½±”è€­¡½±”ôì(€€€€€ô(€€€ô(€€€É•ÑÕÉ¸¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸‘…å!…ÍM½É•¹ÑÉ¥•Ì¡‘…ä¤ì(€€€É•ÑÕÉ¸	½½±•…¸¡™¥ÉÍÑ…åM½É•¹ÑÉä¡‘…ä¤¤ì(€ô(€™Õ¹Ñ¥½¸É½ÕÁ!…ÍM½É•¹ÑÉ¥•Ì¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€½¹ÍÐÉ½ÕÀ€ôÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬‘…åtü¹É½ÕÁÌü¹mÉ½ÕÁ%¹‘•átñðmt°(€€€€€Í½É•É%‘Ì€ô¹•ÜM•Ð¡É½ÕÀ¹µ…À¡MÑÉ¥¹œ¤¹™¥±Ñ•È ¡¥¤€ôø¥€„ôô9=}AIQ9I}%¤¤°(€€€€€É½Õ¹‘Ì€ôÍÑ½É”¹•Ù•¹Ðü¹Í½É¥¹œü¹l‰‘…äˆ€¬‘…åtñðíôì(€€€™½È€¡½¹ÍÐmÍ½É•É%°É½Õ¹‘t½˜=‰©•Ð¹•¹ÑÉ¥•Ì¡É½Õ¹‘Ì¤¤ì(€€€€€¥˜€ …Í½É•É%‘Ì¹¡…Ì¡MÑÉ¥¹œ¡Í½É•É%¤¤¤½¹Ñ¥¹Õ”ì(€€€€€™½È€¡½¹ÍÐm¡½±”°É•t½˜=‰©•Ð¹•¹ÑÉ¥•Ì¡É½Õ¹ñðíô¤¤ì(€€€€€€€¥˜€ „½x¡lÄ´åuðÅlÀ´át¤¼¹Ñ•ÍÐ¡¡½±”¤¤½¹Ñ¥¹Õ”ì(€€€€€€€¥˜€¡mÉ•Œü¹Í•±˜ü¹É½ÍÌ°É•Œü¹Í•±˜ü¹ÁÕÑÑÌ°É•Œü¹½™™¥¥…°ü¹É½ÍÌ°É•Œü¹½™™¥¥…°ü¹ÁÕÑÑÍt¹Í½µ”¡Í½É•¹Ñ•É•¤¤(€€€€€€€€€É•ÑÕÉ¸ìÍ½É•É%èMÑÉ¥¹œ¡Í½É•É%¤°¡½±”è€­¡½±”ôì(€€€€€ô(€€€ô(€€€É•ÑÕÉ¸¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸Ñ••!…¹‘¥…ÁÍ½µÁ±•Ñ”¡‘…ä°Ñ•”°•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð°…Ñ•½Éä€ô¹Õ±°¤ì(€€€½¹ÍÐµ…À€ôÑ••!…¹‘¥…ÁÍ½È¡‘…ä°Ñ•”°•Ù•¹Ð¤°(€€€€€¥‘Ì€ô•Ù•¹Ð€ôôôÍÑ½É”¹•Ù•¹Ð€ü‘…å¥•±‘%‘Ì¡‘…ä¤€èÝ¥é…É‘A±…¹¹¥¹A±…å•ÉÌ¡‘…ä¤ì(€€€É•ÑÕÉ¸¥‘Ì(€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€¹™¥±Ñ•È ¡¥¤€ôø€……Ñ•½Éäñð•Ù•¹Ñ……Ñ•½Éä¡¥±•Ù•¹Ð¤€ôôô…Ñ•½Éä¤(€€€€€€¹•Ù•Éä ¡¥¤€ôøµ…ÁmMÑÉ¥¹œ¡¥¥t€„ôô€ˆˆ€˜˜µ…ÁmMÑÉ¥¹œ¡¥¥t€„ô¹Õ±°¤ì(€ô(€™Õ¹Ñ¥½¸ÍÉ…Ñ¡!…¹‘¥…Á1¥µ¥Ð¡•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¤ì(€€€É•ÑÕÉ¸•Ù•¹Ðü¹ÍÉ…Ñ¡5…á!À€ôô¹Õ±°(€€€€€€ü¹Õ±°(€€€€€€è9Õµ‰•È¹¥Í¥¹¥Ñ” ­•Ù•¹Ð¹ÍÉ…Ñ¡5…á!À¤(€€€€€€€€ü€­•Ù•¹Ð¹ÍÉ…Ñ¡5…á!À(€€€€€€€€è€ÄÀì(€ô(€™Õ¹Ñ¥½¸ÍÉ…Ñ¡IÕ±•ÍQ•áÐ¡•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¤ì(€€€½¹ÍÐµ…à€ôÍÉ…Ñ¡!…¹‘¥…Á1¥µ¥Ð¡•Ù•¹Ð¤€üü€ÄÀì(€€€½¹ÍÐÍ½É¥¹œ€ô(€€€€€•Ù•¹Ðü¹ÍÉ…Ñ¡M½É¥¹5½‘”€ôôô€‰µ…á½Õ‰±•	½•äˆ(€€€€€€€€ü€‰M½É¥¹œ¥Ì…ÁÁ•…Ð‘½Õ‰±”‰½•ä€ È½Ù•ÈÁ…È¤½¸•… ¡½±”¸A%,µU@€¡@¤É•½É‘Ì„Í½É”½˜€È½Ù•ÈÁ…È™½ÈÑ¡…Ð¡½±”¸ˆ(€€€€€€€€è€‰AÕÉ”MÑÉ½­”Í½É¥¹œ…ÁÁ±¥•Ìè•Ù•ÉäÍÑÉ½­”½Õ¹ÑÌ¸Ù•Éä¡½±”µÕÍÐ‰”Á±…å•Ñ¼½µÁ±•Ñ¥½¸…¹„A%,µU@€¡@¤É•ÍÕ±ÑÌ¥¸‘¥ÍÅÕ…±¥™¥…Ñ¥½¸™É½´Ñ¡”MÉ…Ñ ½µÁ•Ñ¥Ñ¥½¸¸ˆì(€€€É•ÑÕÉ¸Q¡¥Ì•Ù•¹Ð¥¹±Õ‘•Ì„MÉ…Ñ ½µÁ•Ñ¥Ñ¥½¸¸¹äÁ±…å•ÈÝ¥Ñ „‘…¥±ä¡…¹‘¥…À½˜€‘íµ…áô½È±•ÍÌ¥Ì¥¹±Õ‘•¥¸Ñ¡”MÉ…Ñ ½µÁ•Ñ¥Ñ¥½¸¸¹äÁ±…å•ÈÝ¥Ñ „‘…¥±ä¡…¹‘¥…ÀÉ•…Ñ•ÈÑ¡…¸€‘íµ…áô¥Ì¹½Ð¥¹±Õ‘•¸€‘íÍ½É¥¹õ€ì(€ô(€™Õ¹Ñ¥½¸ÍÉ…Ñ¡A¥­ÕÁ!½±”¡‘…ä°Á±…å•É%¤ì(€€€™½È€¡±•Ð €ô€Äì €ðô€Äàì ¬¬¤ì(€€€€€½¹ÍÐÉ½ÍÌ€ô™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Á±…å•É%° ¤ü¹É½ÍÌì(€€€€€¥˜€¡MÑÉ¥¹œ¡É½ÍÌ€üü€ˆˆ¤¹Ñ½UÁÁ•É…Í” ¤€ôôô€‰@ˆ¤É•ÑÕÉ¸ ì(€€€ô(€€€É•ÑÕÉ¸¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸ÍÉ…Ñ¡É½ÍÍM½É•Ì¡‘…ä°Á±…å•É%°…É¤ì(€€€½¹ÍÐµ…á¥µÕµ½Õ‰±•	½•ä€ô(€€€€€ÍÑ½É”¹•Ù•¹Ðü¹ÍÉ…Ñ¡M½É¥¹5½‘”€ôôô€‰µ…á½Õ‰±•	½•äˆì(€€€É•ÑÕÉ¸ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôøì(€€€€€½¹ÍÐÉ½ÍÌ€ô™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Á±…å•É%°¤€¬€Ä¤ü¹É½ÍÌì(€€€€€¥˜€¡MÑÉ¥¹œ¡É½ÍÌ€üü€ˆˆ¤¹Ñ½UÁÁ•É…Í” ¤€ôôô€‰@ˆ¤(€€€€€€€É•ÑÕÉ¸µ…á¥µÕµ½Õ‰±•	½•ä€ü€¬¡…Éü¹Á…Èü¹m¥tñð€À¤€¬€È€è¹Õ±°ì(€€€€€¥˜€¡É½ÍÌ€ôôô€ˆˆñðÉ½ÍÌ€ôô¹Õ±°¤É•ÑÕÉ¸¹Õ±°ì(€€€€€É•ÑÕÉ¸µ…á¥µÕµ½Õ‰±•	½•ä(€€€€€€€€ü5…Ñ ¹µ¥¸ ­É½ÍÌ°€¬¡…Éü¹Á…Èü¹m¥tñð€À¤€¬€È¤(€€€€€€€€è€­É½ÍÌì(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸É½Õ¹‘¥¹…±¥Í•‘½È¡‘…ä°Á±…å•É%¤ì(€€€½¹ÍÐ¥€ôMÑÉ¥¹œ¡Á±…å•É%¤°(€€€€€™¥¹…±¥Í•‘Ð€ôÍ½É¥¹…åMÑ½É”¡‘…ä¤ü¹m¥‘tü¹}µ•Ñ„ü¹™¥¹…±¥Í•‘Ðì(€€€¥˜€ (€€€€€™¥¹…±¥Í•‘Ð€˜˜(€€€€€ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰Á±…å•Èˆ€˜˜(€€€€€MÑÉ¥¹œ¡ÍÑ½É”¹±½Õ¹Á±…å•É%¤€ôôô¥€˜˜(€€€€€ÍÑ½É”¹±½Õü¹•Ù•¹Ñ%(€€€€¤ì(€€€€€½¹ÍÐÍÑ…Ñ”€ôÝ…å±½Õ¹É½Õ¹‘M…Ù•MÑ…Ñ”ü¸¡ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%°‘…ä°¥¤ñðíôì(€€€€€É•ÑÕÉ¸	½½±•…¸ (€€€€€€€ÍÑ…Ñ”¹…­¹½Ý±•‘•€˜˜(€€€€€€€€…ÍÑ…Ñ”¹Á•¹‘¥¹œ€˜˜(€€€€€€€€…ÍÑ…Ñ”¹½¹™±¥Ð€˜˜(€€€€€€€€…ÍÑ…Ñ”¹‰±½­•°(€€€€€€¤ì(€€€ô(€€€É•ÑÕÉ¸	½½±•…¸ (€€€€€µ…¹Õ…±…å¥¹…±¥Í•¡‘…ä¤ñð(€€€€€€€ÍÑ½É”¹•Ù•¹Ðü¹É½Õ¹‘¥¹…±¥Í•ü¹l‰‘…äˆ€¬‘…åtü¹m¥‘tñð(€€€€€€€™¥¹…±¥Í•‘Ð°(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸µ•É•=É…¹¥Í•É½ÉÉ•Ñ¥½¹Ì¡±½…°€ôíô°É•µ½Ñ”€ôíô¤ì(€€€½¹ÍÐµ•É•€ô)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡±½…°ñðíô¤¤ì(€€€=‰©•Ð¹•¹ÑÉ¥•Ì¡É•µ½Ñ”ñðíô¤¹™½É…  ¡m‘…å-•ä°Á±…å•ÉÍt¤€ôøì(€€€€€µ•É•‘m‘…å-•åt€ôµ•É•‘m‘…å-•åtñðíôì(€€€€€=‰©•Ð¹•¹ÑÉ¥•Ì¡Á±…å•ÉÌñðíô¤¹™½É…  ¡mÁ±…å•É%°¡½±•Ít¤€ôøì(€€€€€€€µ•É•‘m‘…å-•åumÁ±…å•É%‘t€ôµ•É•‘m‘…å-•åumÁ±…å•É%‘tñðíôì(€€€€€€€=‰©•Ð¹•¹ÑÉ¥•Ì¡¡½±•Ìñðíô¤¹™½É…  ¡m¡½±”°½ÉÉ•Ñ¥½¹t¤€ôøì(€€€€€€€€€½¹ÍÐÕÉÉ•¹Ð€ôµ•É•‘m‘…å-•åumÁ±…å•É%‘um¡½±•tì(€€€€€€€€€¥˜€ (€€€€€€€€€€€€…ÕÉÉ•¹Ðñð(€€€€€€€€€€€€¡…Ñ”¹Á…ÉÍ”¡½ÉÉ•Ñ¥½¸ü¹½ÉÉ•Ñ•‘Ðñð€À¤ñð€À¤€øô(€€€€€€€€€€€€€€¡…Ñ”¹Á…ÉÍ”¡ÕÉÉ•¹Ðü¹½ÉÉ•Ñ•‘Ðñð€À¤ñð€À¤(€€€€€€€€€€¤(€€€€€€€€€€€µ•É•‘m‘…å-•åumÁ±…å•É%‘um¡½±•t€ô)M=8¹Á…ÉÍ” (€€€€€€€€€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡½ÉÉ•Ñ¥½¸¤°(€€€€€€€€€€€€¤ì(€€€€€€€ô¤ì(€€€€€ô¤ì(€€€ô¤ì(€€€É•ÑÕÉ¸µ•É•ì(€ô(€™Õ¹Ñ¥½¸½É…¹¥Í•É½ÉÉ•Ñ¥½¹½È¡‘…ä°Á±…å•É%°¡½±”¤ì(€€€É•ÑÕÉ¸ÍÑ½É”¹•Ù•¹Ðü¹½É…¹¥Í•É½ÉÉ•Ñ¥½¹Ìü¹l‰‘…äˆ€¬‘…åtü¹l(€€€€€MÑÉ¥¹œ¡Á±…å•É%¤(€€€tü¹mMÑÉ¥¹œ¡¡½±”¥tñð¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸É•½É‘=É…¹¥Í•É½ÉÉ•Ñ¥½¸¡‘…ä°Á±…å•É%°¡½±”°Ù…±Õ•Ì¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹½É…¹¥Í•É½ÉÉ•Ñ¥½¹Ì€ô(€€€€€ÍÑ½É”¹•Ù•¹Ð¹½É…¹¥Í•É½ÉÉ•Ñ¥½¹Ìñðíôì(€€€½¹ÍÐ½ÉÉ•Ñ¥½¹…ä€ô(€€€€€€€€¡ÍÑ½É”¹•Ù•¹Ð¹½É…¹¥Í•É½ÉÉ•Ñ¥½¹Íl‰‘…äˆ€¬‘…åtñðôíô¤°(€€€€€½ÉÉ•Ñ¥½¹A±…å•È€ô€¡½ÉÉ•Ñ¥½¹…åmMÑÉ¥¹œ¡Á±…å•É%¥tñðôíô¤ì(€€€½ÉÉ•Ñ¥½¹A±…å•ÉmMÑÉ¥¹œ¡¡½±”¥t€ôì(€€€€€€¸¸¹Ù…±Õ•Ì°(€€€€€Á±…å•É%èMÑÉ¥¹œ¡Á±…å•É%¤°(€€€€€½É…¹¥Í•É½ÉÉ•Ñ•èÑÉÕ”°(€€€€€½ÉÉ•Ñ•‘ÐèÙ…±Õ•Ì¹½ÉÉ•Ñ•‘Ðñð¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€ôì(€€€É•ÑÕÉ¸½ÉÉ•Ñ¥½¹A±…å•ÉmMÑÉ¥¹œ¡¡½±”¥tì(€ô(€™Õ¹Ñ¥½¸•áÁ±¥¥Ñ±åI•½Ù•É•‘A±…å•È¡‘…ä°Á±…å•É%¤ì(€€€É•ÑÕÉ¸€¡ÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•½Ù•Éå1½œñðmt¤¹Í½µ” ¡•¹ÑÉä¤€ôøì(€€€€€¥˜€ ­•¹ÑÉä¹‘…ä€„ôô€­‘…ä¤É•ÑÕÉ¸™…±Í”ì(€€€€€½¹ÍÐ¥€ôMÑÉ¥¹œ¡Á±…å•É%¤ì(€€€€€¥˜€¡•¹ÑÉä¹ÑåÁ”€ôôô€‰Í•±˜µÍ½É”µ½Áäˆ¤(€€€€€€€É•ÑÕÉ¸MÑÉ¥¹œ¡•¹ÑÉä¹É•½Ù•É•‘A±…å•É%¤€ôôô¥ñð(€€€€€€€€€MÑÉ¥¹œ¡•¹ÑÉä¹É•½Ù•É•‘…¥±•‘A±…å•É%ñð€ˆˆ¤€ôôô¥ì(€€€€€¥˜€¡•¹ÑÉä¹ÑåÁ”€ôôô€‰Ù¥ÉÑÕ…°µÁ±…å•Èµµ…É­•Èµ…Éˆ¤(€€€€€€€É•ÑÕÉ¸m•¹ÑÉä¹Í½É•É%°•¹ÑÉä¹µ…É­•‘A±…å•É%‘t¹µ…À¡MÑÉ¥¹œ¤¹¥¹±Õ‘•Ì¡¥¤ì(€€€€€É•ÑÕÉ¸™…±Í”ì(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸É•½Ù•É•‘I½Õ¹‘•ÁÑ•¡‘…ä°Á±…å•É%¤ì(€€€É•ÑÕÉ¸•áÁ±¥¥Ñ±åI•½Ù•É•‘A±…å•È¡‘…ä°Á±…å•É%¤€˜˜(€€€€€É½Õ¹‘¥¹…±¥Í•‘½È¡‘…ä°Á±…å•É%¤€˜˜½™™¥¥…±…É‘AÉ½É•ÍÌ¡‘…ä°Á±…å•É%¤¹½µÁ±•Ñ”ì(€ô(€™Õ¹Ñ¥½¸Íå¹I•½Ù•É•‘A±…å•ÉI½Õ¹¡‘…ä°Á±…å•É%¤ì(€€€¥˜€ …l‰Í½É¥¹œˆ°€‰Ù•É¥™ä‰t¹¥¹±Õ‘•Ì¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”¤ñð(€€€€€€€€…É•½Ù•É•‘I½Õ¹‘•ÁÑ•¡‘…ä°Á±…å•É%¤¤É•ÑÕÉ¸™…±Í”ì(€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰½µÁ±•Ñ•ˆì(€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”€ô€‰µ¥¹”ˆì(€€€ÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ô™…±Í”ì(€€€É•±•…Í•I½Õ¹‘]…­•1½¬ ¤ì(€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€É•ÑÕÉ¸ÑÉÕ”ì(€ô(€™Õ¹Ñ¥½¸½™™¥¥…±…É‘AÉ½É•ÍÌ¡‘…ä°Á±…å•É%¤ì(€€€½¹ÍÐÁÕÑÑÍI•ÅÕ¥É•€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤°(€€€€€É•½É‘Ì€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôø(€€€€€€€™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Á±…å•É%°¤€¬€Ä¤°(€€€€€€¤°(€€€€€•¹Ñ•É•€ôÉ•½É‘Ì¹™¥±Ñ•È ¡É•½É¤€ôø(€€€€€€€Í½É•¹Ñ•É•¡É•½Éü¹É½ÍÌ¤°(€€€€€€¤¹±•¹Ñ °(€€€€€ÁÕÑÑÍ¹Ñ•É•€ôÉ•½É‘Ì¹™¥±Ñ•È ¡É•½É¤€ôø(€€€€€€€Í½É•¹Ñ•É•¡É•½Éü¹ÁÕÑÑÌ¤°(€€€€€€¤¹±•¹Ñ ì(€€€É•ÑÕÉ¸ì(€€€€€•¹Ñ•É•°(€€€€€ÁÕÑÑÍ¹Ñ•É•°(€€€€€½µÁ±•Ñ”è•¹Ñ•É•€ôôô€Äà€˜˜€ …ÁÕÑÑÍI•ÅÕ¥É•ñðÁÕÑÑÍ¹Ñ•É•€ôôô€Äà¤°(€€€ôì(€ô(€™Õ¹Ñ¥½¸Ù•É¥™¥…Ñ¥½¹%ÍÍÕ•½Õ¹Ð¡‘…ä°Á±…å•É%¤ì(€€€½¹ÍÐµ¥¹”€ôÍ½É¥¹…åMÑ½É”¡‘…ä¤ü¹mMÑÉ¥¹œ¡Á±…å•É%¥tñðíô°(€€€€€ÁÕÑÑÍI•ÅÕ¥É•€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤ì(€€€É•ÑÕÉ¸ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôø¤€¬€Ä¤¹™¥±Ñ•È ¡ ¤€ôøì(€€€€€½¹ÍÐÍ•±˜€ôµ¥¹•mMÑÉ¥¹œ¡ ¥tü¹Í•±˜ñðíô°(€€€€€€€½™˜€ô™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Á±…å•É%° ¤°(€€€€€€€Í•±™É½ÍÌ€ôÍ•±˜¹É½ÍÌ€üü€ˆˆ°(€€€€€€€½™™É½ÍÌ€ô½™˜ü¹É½ÍÌ€üü€ˆˆì(€€€€€¥˜€ …½™˜ñð€…Í½É•¹Ñ•É•¡Í•±™É½ÍÌ¤ñð€…Í½É•¹Ñ•É•¡½™™É½ÍÌ¤¤(€€€€€€€É•ÑÕÉ¸ÑÉÕ”ì(€€€€€½¹ÍÐÍ½É•5…Ñ €ôÉ½ÍÍM½É•ÍÉ•”¡‘…ä°Á±…å•É%° °½™™É½ÍÌ°Í•±™É½ÍÌ¤°(€€€€€€€ÁÕÑÑÍ5…Ñ €ô(€€€€€€€€€€…ÁÕÑÑÍI•ÅÕ¥É•ñð(€€€€€€€€€€¡Í½É•¹Ñ•É•¡½™˜¹ÁÕÑÑÌ¤€˜˜(€€€€€€€€€€€Í½É•¹Ñ•É•¡Í•±˜¹ÁÕÑÑÌ¤€˜˜(€€€€€€€€€€€€­½™˜¹ÁÕÑÑÌ€ôôô€­Í•±˜¹ÁÕÑÑÌ¤ì(€€€€€É•ÑÕÉ¸€„¡Í½É•5…Ñ €˜˜ÁÕÑÑÍ5…Ñ ¤ì(€€€ô¤¹±•¹Ñ ì(€ô(€™Õ¹Ñ¥½¸Ù•É¥™¥…Ñ¥½¹%ÍÍÕ•!½±•Ì¡‘…ä°Á±…å•É%¤ì(€€€½¹ÍÐµ¥¹”€ôÍ½É¥¹…åMÑ½É”¡‘…ä¤ü¹mMÑÉ¥¹œ¡Á±…å•É%¥tñðíô°(€€€€€ÁÕÑÑÍI•ÅÕ¥É•€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤ì(€€€É•ÑÕÉ¸ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôø¤€¬€Ä¤¹™¥±Ñ•È ¡ ¤€ôøì(€€€€€½¹ÍÐÍ•±˜€ôµ¥¹•mMÑÉ¥¹œ¡ ¥tü¹Í•±˜ñðíô°(€€€€€€€½™˜€ô™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Á±…å•É%° ¤ì(€€€€€¥˜€ …½™˜ñð€…Í½É•¹Ñ•É•¡Í•±˜¹É½ÍÌ¤ñð€…Í½É•¹Ñ•É•¡½™˜¹É½ÍÌ¤¤(€€€€€€€É•ÑÕÉ¸ÑÉÕ”ì(€€€€€É•ÑÕÉ¸€„ (€€€€€€€É½ÍÍM½É•ÍÉ•”¡‘…ä°Á±…å•É%° °½™˜¹É½ÍÌ°Í•±˜¹É½ÍÌ¤€˜˜(€€€€€€€€ …ÁÕÑÑÍI•ÅÕ¥É•ñð(€€€€€€€€€€¡Í½É•¹Ñ•É•¡½™˜¹ÁÕÑÑÌ¤€˜˜(€€€€€€€€€€€Í½É•¹Ñ•É•¡Í•±˜¹ÁÕÑÑÌ¤€˜˜(€€€€€€€€€€€€­½™˜¹ÁÕÑÑÌ€ôôô€­Í•±˜¹ÁÕÑÑÌ¤¤(€€€€€€¤ì(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸±¥Ù•A±…å•ÉMÑ…ÑÕÌ¡‘…ä°Á±…å•É%¤ì(€€€½¹ÍÐÍ•ÑÕÀ€ôÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬‘…åt°(€€€€€Ñà€ôÁ±…å•ÉÉ½ÕÁ½¹Ñ•áÐ¡Á±…å•É%°‘…ä¤°(€€€€€ÍÑ…ÉÐ€ôÍ•ÑÕÀü¹ÍÑ…ÉÑÌü¹mÑàü¹É½ÕÁ%¹‘•átñð€Ä°(€€€€€Í•Ä€ôÍ½É•M•ÅÕ•¹”¡ÍÑ…ÉÐ¤°(€€€€€½™™¥¥…°€ô½™™¥¥…±…É‘AÉ½É•ÍÌ¡‘…ä°Á±…å•É%¤°(€€€€€•¹Ñ•É•€ô½™™¥¥…°¹•¹Ñ•É•°(€€€€€µ¥¹”€ôÍ½É¥¹…åMÑ½É”¡‘…ä¤ü¹mMÑÉ¥¹œ¡Á±…å•É%¥tñðíô°(€€€€€•Ù•¹Ñ½µÁ±•Ñ”€ôÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÑÕÌ€ôôô€‰½µÁ±•Ñ”ˆ°(€€€€€Ù•É¥™¥…Ñ¥½¹%ÍÍÕ•Ì€ô½™™¥¥…°¹½µÁ±•Ñ”(€€€€€€€€üÙ•É¥™¥…Ñ¥½¹%ÍÍÕ•½Õ¹Ð¡‘…ä°Á±…å•É%¤(€€€€€€€€è€À°(€€€€€µ…É­•‘Y•É¥™¥…Ñ¥½¹%ÍÍÕ•Ì€ô½™™¥¥…°¹½µÁ±•Ñ”(€€€€€€€€üµ…É­•‘M½É•…É‘Y•É¥™¥…Ñ¥½¸¡‘…ä°Á±…å•É%¤¹µ¥Íµ…Ñ¡•Ì¹±•¹Ñ (€€€€€€€€è€À°(€€€€€•µ•É•¹å¥¹…±¥Í•€ô•áÁ±¥¥Ñ±åI•½Ù•É•‘A±…å•È¡‘…ä°Á±…å•É%¤°(€€€€€™¥¹…±¥Í•€ô(€€€€€€€•Ù•¹Ñ½µÁ±•Ñ”ñð(€€€€€€€€¡É½Õ¹‘¥¹…±¥Í•‘½È¡‘…ä°Á±…å•É%¤€˜˜(€€€€€€€€€€ ¡•µ•É•¹å¥¹…±¥Í•€˜˜½™™¥¥…°¹½µÁ±•Ñ”¤ñð(€€€€€€€€€€€€¡Ù•É¥™¥…Ñ¥½¹%ÍÍÕ•Ì€ôôô€À€˜˜µ…É­•‘Y•É¥™¥…Ñ¥½¹%ÍÍÕ•Ì€ôôô€À¤¤¤°(€€€€€¥ÍÍÕ•Ì€ô½™™¥¥…°¹½µÁ±•Ñ”€˜˜€…™¥¹…±¥Í•(€€€€€€€€üÙ•É¥™¥…Ñ¥½¹%ÍÍÕ•Ì€¬µ…É­•‘Y•É¥™¥…Ñ¥½¹%ÍÍÕ•Ì(€€€€€€€€è€À°(€€€€€¹•áÐ€ôÍ•Åm5…Ñ ¹µ¥¸¡•¹Ñ•É•°€ÄÜ¥t°(€€€€€©½¥¹•€ô	½½±•…¸ (€€€€€€€€¡ÍÑ½É”¹±½Õ‘A±…å•ÉÌñðmt¤¹™¥¹ (€€€€€€€€€€¡à¤€ôøMÑÉ¥¹œ¡à¹Á±…å•É%¤€ôôôMÑÉ¥¹œ¡Á±…å•É%¤°(€€€€€€€€¤ü¹©½¥¹•°(€€€€€€¤ì(€€€½¹ÍÐµ…¹Õ…±…É€ôÑà(€€€€€€üÍÕ‰µ¥ÑÑ•‘5…¹Õ…±…É¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤(€€€€€€è¹Õ±°ì(€€€¥˜€¡µ…¹Õ…±…É¤ì(€€€€€É•ÑÕÉ¸ì(€€€€€€€Á±…å•É%èMÑÉ¥¹œ¡Á±…å•É%¤°(€€€€€€€©½¥¹•°(€€€€€€€•¹Ñ•É•è€Äà°(€€€€€€€™¥¹…±¥Í•èÑÉÕ”°(€€€€€€€¥ÍÍÕ•Ìè€À°(€€€€€€€ÍÑ…Ñ”è€‰™¥¹…±¥Í•ˆ°(€€€€€€€±…‰•°è€‰½µÁ±•Ñ”ˆ°(€€€€€€€‘•Ñ…¥°è€‰=™™¥¥…°Á…Á•ÈÑ•…´…ÉÍÕ‰µ¥ÑÑ•ˆ°(€€€€€€€É½ÕÀèÑà¹É½ÕÁ%¹‘•à€¬€Ä°(€€€€€ôì(€€€ô(€€€¥˜€¡…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤€˜˜Ñà¤ì(€€€€€½¹ÍÐ¡•­Ì€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôø(€€€€€€€€€…µ‰É½Í•!½±•É••µ•¹Ð¡‘…ä°Ñà¹É½ÕÁ%¹‘•à°¥¹‘•à€¬€Ä¤°(€€€€€€€€¤°(€€€€€€€…µ‰É½Í•¹Ñ•É•€ô¡•­Ì¹™¥±Ñ•È ¡¡•¬¤€ôø¡•¬¹Í½É•É½¹”¤¹±•¹Ñ °(€€€€€€€…µ‰É½Í•%ÍÍÕ•Ì€ô¡•­Ì¹™¥±Ñ•È ¡¡•¬¤€ôø¡•¬¹µ¥Íµ…Ñ ¤¹±•¹Ñ °(€€€€€€€…µ‰É½Í•¥¹…±¥Í•€ô(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÑÕÌ€ôôô€‰½µÁ±•Ñ”ˆñð(€€€€€€€€€	½½±•…¸¡ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•ü¹l‰‘…äˆ€¬‘…åtü¹mMÑÉ¥¹œ¡Á±…å•É%¥t¤ñð(€€€€€€€€€…µ‰É½Í•Q•…µ½µÁ±•Ñ”¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤ì(€€€€€±•Ð…µ‰É½Í•MÑ…Ñ”€ô€‰¹½ÑMÑ…ÉÑ•ˆ°(€€€€€€€…µ‰É½Í•1…‰•°€ô€‰9½ÐÍÑ…ÉÑ•ˆ°(€€€€€€€…µ‰É½Í••Ñ…¥°€ô©½¥¹•€ü€‰½¹¹•Ñ•ƒ
ÜÉ•…‘äÑ¼ÍÑ…ÉÐˆ€è€‰A¡½¹”¹½Ð©½¥¹•ˆì(€€€€€¥˜€¡…µ‰É½Í•¹Ñ•É•¤ì(€€€€€€€…µ‰É½Í•MÑ…Ñ”€ô€‰Á±…å¥¹œˆì(€€€€€€€…µ‰É½Í•1…‰•°€ô€‰A±…å¥¹œˆì(€€€€€€€…µ‰É½Í••Ñ…¥°€ô€‘í…µ‰É½Í•¹Ñ•É•‘ô½˜€ÄàÑ•…´Í½É•Ì•¹Ñ•É•‘€ì(€€€€€ô(€€€€€¥˜€¡…µ‰É½Í•%ÍÍÕ•Ì¤ì(€€€€€€€…µ‰É½Í•MÑ…Ñ”€ô€‰…ÑÑ•¹Ñ¥½¸ˆì(€€€€€€€…µ‰É½Í•1…‰•°€ô€‰ÑÑ•¹Ñ¥½¸ˆì(€€€€€€€…µ‰É½Í••Ñ…¥°€ô€‘í…µ‰É½Í•%ÍÍÕ•Íô¡½±”‘í…µ‰É½Í•%ÍÍÕ•Ì€ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô¹••¡•­¥¹€ì(€€€€€ô(€€€€€¥˜€¡…µ‰É½Í•Q•…µ½µÁ±•Ñ”¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤€˜˜€……µ‰É½Í•¥¹…±¥Í•¤ì(€€€€€€€…µ‰É½Í•MÑ…Ñ”€ô€‰É•…‘äˆì(€€€€€€€…µ‰É½Í•1…‰•°€ô€‰I•…‘äÑ¼™¥¹…±¥Í”ˆì(€€€€€€€…µ‰É½Í••Ñ…¥°€ô€‰Q•…´Í½É”…¹Í•±•Ñ•‘É¥Ù•Ì…É”½µÁ±•Ñ”ˆì(€€€€€ô(€€€€€¥˜€¡…µ‰É½Í•¥¹…±¥Í•¤ì(€€€€€€€…µ‰É½Í•MÑ…Ñ”€ô€‰™¥¹…±¥Í•ˆì(€€€€€€€…µ‰É½Í•1…‰•°€ô€‰½µÁ±•Ñ”ˆì(€€€€€€€…µ‰É½Í••Ñ…¥°€ô€‰µ‰É½Í”Ñ•…´…É½µÁ±•Ñ”ˆì(€€€€€ô(€€€€€É•ÑÕÉ¸ì(€€€€€€€Á±…å•É%èMÑÉ¥¹œ¡Á±…å•É%¤°©½¥¹•°•¹Ñ•É•è…µ‰É½Í•¹Ñ•É•°(€€€€€€€™¥¹…±¥Í•è…µ‰É½Í•¥¹…±¥Í•°¥ÍÍÕ•Ìè…µ‰É½Í•%ÍÍÕ•Ì°(€€€€€€€ÍÑ…Ñ”è…µ‰É½Í•MÑ…Ñ”°±…‰•°è…µ‰É½Í•1…‰•°°‘•Ñ…¥°è…µ‰É½Í••Ñ…¥°°(€€€€€€€É½ÕÀèÑà¹É½ÕÁ%¹‘•à€¬€Ä°(€€€€€ôì(€€€ô(€€€±•ÐÍÑ…Ñ”€ô€‰¹½ÑMÑ…ÉÑ•ˆ°(€€€€€±…‰•°€ô€‰9½ÐÍÑ…ÉÑ•ˆ°(€€€€€‘•Ñ…¥°€ô©½¥¹•€ü€‰½¹¹•Ñ•ƒ
ÜÉ•…‘äÑ¼ÍÑ…ÉÐˆ€è€‰A¡½¹”¹½Ð©½¥¹•ˆì(€€€¥˜€¡•¹Ñ•É•€ø€À€˜˜•¹Ñ•É•€ð€Äà¤ì(€€€€€ÍÑ…Ñ”€ô€‰Á±…å¥¹œˆì(€€€€€±…‰•°€ô€‰A±…å¥¹œˆì(€€€€€‘•Ñ…¥°€ô!½±”€‘í¹•áÑô¹•áÐƒ
Ü€‘í•¹Ñ•É•‘ô½˜€Äà•¹Ñ•É•‘€ì(€€€ô(€€€¥˜€¡•¹Ñ•É•€ôôô€Äà€˜˜¥ÍÍÕ•Ì¤ì(€€€€€ÍÑ…Ñ”€ô€‰…ÑÑ•¹Ñ¥½¸ˆì(€€€€€±…‰•°€ô€‰ÑÑ•¹Ñ¥½¸ˆì(€€€€€‘•Ñ…¥°€ô€‘í¥ÍÍÕ•Íô¡½±”‘í¥ÍÍÕ•Ì€ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô¹••¡•­¥¹€ì(€€€ô(€€€¥˜€¡•¹Ñ•É•€ôôô€Äà€˜˜€…¥ÍÍÕ•Ì¤ì(€€€€€ÍÑ…Ñ”€ô€‰É•…‘äˆì(€€€€€±…‰•°€ô€‰I•…‘äÑ¼™¥¹…±¥Í”ˆì(€€€€€‘•Ñ…¥°€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤(€€€€€€€€ü€‰	½Ñ …É‘Ì…É•”½¸…±°Í½É•Ì…¹ÁÕÑÑÌˆ(€€€€€€€€è€‰	½Ñ …É‘Ì…É•”½¸…±°Í½É•Ìˆì(€€€ô(€€€¥˜€¡™¥¹…±¥Í•¤ì(€€€€€ÍÑ…Ñ”€ô€‰™¥¹…±¥Í•ˆì(€€€€€±…‰•°€ô€‰½µÁ±•Ñ”ˆì(€€€€€‘•Ñ…¥°€ô€‰=™™¥¥…°…É½µÁ±•Ñ”ˆì(€€€ô(€€€É•ÑÕÉ¸ì(€€€€€Á±…å•É%èMÑÉ¥¹œ¡Á±…å•É%¤°(€€€€€©½¥¹•°(€€€€€•¹Ñ•É•°(€€€€€™¥¹…±¥Í•°(€€€€€¥ÍÍÕ•Ì°(€€€€€ÍÑ…Ñ”°(€€€€€±…‰•°°(€€€€€‘•Ñ…¥°°(€€€€€É½ÕÀè€¡Ñàü¹É½ÕÁ%¹‘•à€üü€À¤€¬€Ä°(€€€ôì(€ô(€™Õ¹Ñ¥½¸•µ•É•¹å1½œ¡•¹ÑÉä¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•½Ù•Éå1½œ€ô(€€€€€ÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•½Ù•Éå1½œñðmtì(€€€ÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•½Ù•Éå1½œ¹ÁÕÍ ¡ì(€€€€€€¸¸¹•¹ÑÉä°(€€€€€…Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€‘•Ù¥”è€‰½É…¹¥Í•Èˆ°(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸•µ•É•¹å¥¹…±¥Í•%™Y•É¥™¥• (€€€‘…ä°(€€€Á±…å•É%°(€€€½É…¹¥Í•É•ÁÑ•€ô™…±Í”°(€€¤ì(€€€½¹ÍÐ¥€ôMÑÉ¥¹œ¡Á±…å•É%ñð€ˆˆ¤ì(€€€¥˜€ (€€€€€€…¥ñð(€€€€€€¡½É…¹¥Í•É•ÁÑ•(€€€€€€€€ü€…½™™¥¥…±…É‘AÉ½É•ÍÌ¡‘…ä°¥¤¹½µÁ±•Ñ”(€€€€€€€€èÙ•É¥™¥…Ñ¥½¹%ÍÍÕ•½Õ¹Ð¡‘…ä°¥¤€„ôô€À¤(€€€€¤(€€€€€É•ÑÕÉ¸™…±Í”ì(€€€½¹ÍÐ…Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€É½Õ¹€ôÍ½É•ÉMÑ½É”¡‘…ä°¥¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•€ôÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•ñðíôì(€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åt€ô(€€€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åtñðíôì(€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åum¥‘t€ô…Ðì(€€€É½Õ¹¹}µ•Ñ„€ôì(€€€€€€¸¸¸¡É½Õ¹¹}µ•Ñ„ñðíô¤°(€€€€€™¥¹…±¥Í•‘Ðè…Ð°(€€€€€•µ•É•¹å¥¹…±¥Í•èÑÉÕ”°(€€€ôì(€€€ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°¥¤ì(€€€É•ÑÕÉ¸ÑÉÕ”ì(€ô(€™Õ¹Ñ¥½¸±½Í•µ•É•¹åI•½Ù•Éä ¤ì(€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€ô(€™Õ¹Ñ¥½¸•µ•É•¹åA±…å•É=ÁÑ¥½¹Ì¡‘…ä°Í•±•Ñ•€ô€ˆˆ¤ì(€€€É•ÑÕÉ¸‘…å¥•±‘%‘Ì¡‘…ä¤(€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€¹µ…À¡MÑÉ¥¹œ¤(€€€€€€¹µ…À (€€€€€€€€¡¥¤€ôø(€€€€€€€€€€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í•ÍŒ¡¥¥ôˆ€‘í¥€ôôôMÑÉ¥¹œ¡Í•±•Ñ•¤€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôø‘í•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½½ÁÑ¥½¸ù€°(€€€€€€¤(€€€€€€¹©½¥¸ ˆˆ¤ì(€ô(€™Õ¹Ñ¥½¸½Á•¹µ•É•¹åI•½Ù•Éä ¤ì(€€€½¹ÍÐ‘…ä€ô5…Ñ ¹µ¥¸ (€€€€€ÍÑ½É”¹•Ù•¹Ð¹‘…åÌñð€Ä°(€€€€€€¬¡ÍÑ½É”¹•Ù•¹Ð¹±¥Ù•½¹ÑÉ½±…äñð€Ä¤°(€€€€¤ì(€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰•µ•É•¹å!•…ˆøñÍµ…±°ù=I9%MH=91dð½Íµ…±°øñ Èùµ•É•¹äM½É”I•½Ù•Éäð½ ÈøñÀùUÍ”Ñ¡¥Ì½¹±äÝ¡•¸¹½Éµ…°Á¡½¹”Í½É¥¹œ…¹¹½Ð‰”½µÁ±•Ñ•¸ð½Àøð½‘¥Øøñ‘¥Ø±…ÍÌô‰•µ•É•¹å¡½¥•Ìˆøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ¥ô‰É•½Ù•ÉM•±™M½É•ÌˆøñˆùA¡½¹”…¥±•ÕÉ¥¹œA±…äð½ˆøñÍÁ…¸ù½Áä„Á±…å•ÈÌ…Ù…¥±…‰±”Í•±˜µ¡•¬Í½É•Ì¥¹Ñ¼Ñ¡”½™™¥¥…°…ÉÑ¡•¥È™…¥±•µ…É­•È½Õ±¹½Ð™¥¹¥Í ¸ð½ÍÁ…¸øð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ¥ô‰•¹Ñ•ÉY¥ÉÑÕ…±…Éˆøñˆù¹Ñ•ÈA±…å•ËŠM5…É­•È…Éð½ˆøñÍÁ…¸ù¹Ñ•È…±°€Äà¡½±•Ì™É½´5¥M½É”½È„µ…¹Õ…±±ä½µÁ±•Ñ•…É¸ð½ÍÁ…¸øð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ¥ô‰½ÉÉ•Ñ=™™¥¥…±!½±”ˆøñˆù½ÉÉ•Ð=¹”=™™¥¥…°!½±”ð½ˆøñÍÁ…¸ù¥à…¸¥Í½±…Ñ•…•ÁÑ•Í½É”½Èµ¥ÍÍ¥¹œÁÕÑÑÌ…™Ñ•È¡•­¥¹œÑ¡”µ…¹Õ…°…É¸ð½ÍÁ…¸øð½‰ÕÑÑ½¸øð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ð•µ•É•¹å±½Í”ˆ¥ô‰±½Í•µ•É•¹åI•½Ù•Éäˆù±½Í”ð½‰ÕÑÑ½¸ù€ì(€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹…‘ ‰½Á•¸ˆ¤ì(€€€€ ˆ½ÉÉ•Ñ=™™¥¥…±!½±”ˆˆ¤¹Ñ•áÑ½¹Ñ•¹Ð€ô€‰½ÉÉ•Ð„A±…å•ËŠeÌ…Éˆì(€€€€ ˆ½ÉÉ•Ñ=™™¥¥…±!½±”ÍÁ…¸ˆ¤¹Ñ•áÑ½¹Ñ•¹Ð€ô(€€€€€€‰M•±•Ð„Á±…å•È°Ý½É¬Ñ¡É½Õ •Ù•ÉäÕ¹½¹™¥Éµ•¡½±”…¹Í…Ù”…ÕÑ¡½É¥Ñ…Ñ¥Ù”½É…¹¥Í•È½ÉÉ•Ñ¥½¹Ì¸ˆì(€€€€ ˆ±½Í•µ•É•¹åI•½Ù•Éäˆ¤¹½¹±¥¬€ô±½Í•µ•É•¹åI•½Ù•Éäì(€€€€ ˆÉ•½Ù•ÉM•±™M½É•Ìˆ¤¹½¹±¥¬€ô€ ¤€ôø(€€€€€É•¹‘•ÉM•±™M½É•I•½Ù•Éä¡‘…ä¤ì(€€€€ ˆ•¹Ñ•ÉY¥ÉÑÕ…±…Éˆ¤¹½¹±¥¬€ô€ ¤€ôøÉ•¹‘•ÉY¥ÉÑÕ…±…É¡‘…ä¤ì(€€€€ ˆ½ÉÉ•Ñ=™™¥¥…±!½±”ˆ¤¹½¹±¥¬€ô€ ¤€ôøÉ•¹‘•É=™™¥¥…±!½±•½ÉÉ•Ñ¥½¸¡‘…ä¤ì(€ô(€™Õ¹Ñ¥½¸½™™¥¥…±I•½É‘1½…Ñ¥½¸¡‘…ä°Á±…å•É%°¡½±”¤ì(€€€½¹ÍÐ‘…åM½É•Ì€ôÍ½É¥¹…åMÑ½É”¡‘…ä¤ì(€€€™½È€¡½¹ÍÐmÍ½É•É%°É½Õ¹‘t½˜=‰©•Ð¹•¹ÑÉ¥•Ì¡‘…åM½É•Ì¤¤ì(€€€€€½¹ÍÐÉ•½É€ôÉ½Õ¹ü¹mMÑÉ¥¹œ¡¡½±”¥tì(€€€€€¥˜€ (€€€€€€€MÑÉ¥¹œ¡É•½Éü¹½™™¥¥…°ü¹Á±…å•É%ñð€ˆˆ¤€ôôôMÑÉ¥¹œ¡Á±…å•É%¤€˜˜(€€€€€€€€¡Í½É•¹Ñ•É•¡É•½É¹½™™¥¥…°¹É½ÍÌ¤ñðÍ½É•¹Ñ•É•¡É•½É¹½™™¥¥…°¹ÁÕÑÑÌ¤¤(€€€€€€¤(€€€€€€€É•ÑÕÉ¸ìÍ½É•É%°É•½Éôì(€€€ô(€€€É•ÑÕÉ¸¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É=™™¥¥…±!½±•½ÉÉ•Ñ¥½¸¡‘…ä°Í•±•Ñ•‘A±…å•É%°Í•±•Ñ•‘!½±”€ô€Ä¤ì(€€€½¹ÍÐ¥‘Ì€ô‘…å¥•±‘%‘Ì¡‘…ä¤(€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤°(€€€€€Á±…å•É%€ôMÑÉ¥¹œ¡Í•±•Ñ•‘A±…å•É%ñð¥‘ÍlÁtñð€ˆˆ¤°(€€€€€¡½±”€ô5…Ñ ¹µ…à Ä°5…Ñ ¹µ¥¸ Äà°€­Í•±•Ñ•‘!½±”ñð€Ä¤¤°(€€€€€±½…Ñ¥½¸€ô½™™¥¥…±I•½É‘1½…Ñ¥½¸¡‘…ä°Á±…å•É%°¡½±”¤°(€€€€€½ÉÉ•Ñ¥½¸€ô½É…¹¥Í•É½ÉÉ•Ñ¥½¹½È¡‘…ä°Á±…å•É%°¡½±”¤°(€€€€€½™™¥¥…°€ô½ÉÉ•Ñ¥½¸ñð±½…Ñ¥½¸ü¹É•½Éü¹½™™¥¥…°ñðíô°(€€€€€Õ¹½¹™¥Éµ•€ôÙ•É¥™¥…Ñ¥½¹%ÍÍÕ•!½±•Ì¡‘…ä°Á±…å•É%¤ì(€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰•µ•É•¹å!•…ˆøñÍµ…±°ù=I9%MH=IIQ%=8ƒ
Üd€‘í‘…åôð½Íµ…±°øñ Èù½ÉÉ•Ð„A±…å•ËŠeÌ…Éð½ ÈøñÀùUÍ”Ñ¡”Í¥¹•…ÉÑ¼½ÉÉ•Ð…¸½™™¥¥…°•¹ÑÉä¸=É…¹¥Í•È½ÉÉ•Ñ¥½¹Ì…É”­•ÁÐÍ•Á…É…Ñ•±äÍ¼…¸½±‘•ÈÁ¡½¹”ÕÁ±½……¹¹½ÐÉ•Á±…”Ñ¡•´¸ð½Àøð½‘¥Øøñ‘¥Ø±…ÍÌô‰½ÉÉ•Ñ¥½¹]½É­±¥ÍÐˆøñ±…‰•°±…ÍÌô‰½ÉÉ•Ñ¥½¹!½±•A¥¬ˆùM•±•Ð!½±”ñÍ•±•Ð¥ô‰½ÉÉ•Ñ¥½¹!½±”ˆø‘íÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôø€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í¤€¬€Åôˆ€‘í¤€¬€Ä€ôôô¡½±”€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôø‘í¤€¬€Åôð½½ÁÑ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½Í•±•Ðøð½±…‰•°øñ‘¥Ø±…ÍÌô‰Õ¹½¹™¥Éµ•‘!½±•ÌˆøñÍµ…±°ùU9=9%I5!=1Lð½Íµ…±°øñˆø‘íÕ¹½¹™¥Éµ•¹±•¹Ñ €üÕ¹½¹™¥Éµ•¹©½¥¸ ˆ°€ˆ¤€è€‰9½¹”ƒŠP…±°¡½±•Ì…É•”‰ôð½ˆøð½‘¥Øøð½‘¥Øøñ‘¥Ø±…ÍÌô‰½™™¥¥…±½ÉÉ•Ñ¥½¹É¥ˆøñ±…‰•°ùA±…å•ÈñÍ•±•Ð¥ô‰½ÉÉ•Ñ¥½¹A±…å•Èˆø‘í¥‘Ì¹µ…À ¡¥¤€ôø€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í•ÍŒ¡¥¥ôˆ€‘í¥€ôôôÁ±…å•É%€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôø‘í•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½½ÁÑ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½Í•±•Ðøð½±…‰•°øñ±…‰•°ùÉ½ÍÌÍÑÉ½­•Ìñ¥¹ÁÕÐ¥ô‰½ÉÉ•Ñ¥½¹É½ÍÌˆ¥¹ÁÕÑµ½‘”ô‰Ñ•áÐˆµ…á±•¹Ñ ôˆÈˆÙ…±Õ”ôˆ‘í•ÍŒ¡½™™¥¥…°¹É½ÍÌ€üü€ˆˆ¥ôˆÁ±…•¡½±‘•ÈôˆÇŠLÈÀ½È@ˆøð½±…‰•°øñ±…‰•°ùAÕÑÑÌñ¥¹ÁÕÐ¥ô‰½ÉÉ•Ñ¥½¹AÕÑÑÌˆ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥Œˆµ…á±•¹Ñ ôˆÄˆÙ…±Õ”ôˆ‘í•ÍŒ¡½™™¥¥…°¹ÁÕÑÑÌ€üü€ˆˆ¥ôˆÁ±…•¡½±‘•ÈôˆÃŠLäˆøð½±…‰•°øð½‘¥Øø‘í½ÉÉ•Ñ¥½¸€ü€œñÀ±…ÍÌô‰É•½Ù•Éå9½Ñ¥”ˆøñˆùÕÑ¡½É¥Ñ…Ñ¥Ù”½É…¹¥Í•È½ÉÉ•Ñ¥½¸Í…Ù•™½ÈÑ¡¥Ì¡½±”¸ð½ˆøð½Àøœ€è±½…Ñ¥½¸€ü€ñÀ±…ÍÌô‰É•½Ù•Éå9½Ñ¥”ˆùÕÉÉ•¹Ð½™™¥¥…°•¹ÑÉä™½Õ¹¸5…É­•È‘•Ù¥”è€‘í•ÍŒ¡Á±…å•È¡±½…Ñ¥½¸¹Í½É•É%¤ü¹¹…µ”ñð€‰=É…¹¥Í•ÈÉ•½Ù•Éäˆ¥ôð½Àù€€è€œñÀ±…ÍÌô‰•µ•É•¹å]…É¹¥¹œˆøñˆù9¼½™™¥¥…°•¹ÑÉä¥ÌÕÉÉ•¹Ñ±äÍÑ½É•™½ÈÑ¡¥Ì¡½±”¸ð½ˆøñÍÁ…¸ùM•±•ÐÑ¡”½ÉÉ•ÐÁ±…å•È…¹¡½±”°Ñ¡•¸•¹Ñ•ÈÑ¡”Í¥¹•µ…ÉÙ…±Õ•Ì¸ð½ÍÁ…¸øð½Àøôñ‘¥Ø±…ÍÌô‰•µ•É•¹åÑ¥½¹Ìˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰‰…­µ•É•¹äˆûŠ@	…¬ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰Í…Ù•=™™¥¥…±½ÉÉ•Ñ¥½¸ˆùM…Ù”=É…¹¥Í•È½ÉÉ•Ñ¥½¸ð½‰ÕÑÑ½¸øð½‘¥Øù€ì(€€€€ ˆ½ÉÉ•Ñ¥½¹A±…å•Èˆ¤¹½¹¡…¹”€ô€¡•Ù•¹Ð¤€ôø(€€€€€É•¹‘•É=™™¥¥…±!½±•½ÉÉ•Ñ¥½¸¡‘…ä°•Ù•¹Ð¹Ñ…É•Ð¹Ù…±Õ”°¡½±”¤ì(€€€€ ˆ½ÉÉ•Ñ¥½¹!½±”ˆ¤¹½¹¡…¹”€ô€¡•Ù•¹Ð¤€ôø(€€€€€É•¹‘•É=™™¥¥…±!½±•½ÉÉ•Ñ¥½¸¡‘…ä°Á±…å•É%°€­•Ù•¹Ð¹Ñ…É•Ð¹Ù…±Õ”¤ì(€€€€ ˆ‰…­µ•É•¹äˆ¤¹½¹±¥¬€ô½Á•¹µ•É•¹åI•½Ù•Éäì(€€€€ ˆÍ…Ù•=™™¥¥…±½ÉÉ•Ñ¥½¸ˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€±•ÐÉ½ÍÌ€ô€ ˆ½ÉÉ•Ñ¥½¹É½ÍÌˆ¤¹Ù…±Õ”¹ÑÉ¥´ ¤¹Ñ½UÁÁ•É…Í” ¤°(€€€€€€€ÁÕÑÑÌ€ô€ ˆ½ÉÉ•Ñ¥½¹AÕÑÑÌˆ¤¹Ù…±Õ”¹ÑÉ¥´ ¤ì(€€€€€¥˜€¡É½ÍÌ€ôôô€ˆ´ˆñðÉ½ÍÌ€ôôô€‹ŠLˆ¤É½ÍÌ€ô€‰@ˆì(€€€€€¥˜€ (€€€€€€€€…Í½É•¹Ñ•É•¡É½ÍÌ¤ñð(€€€€€€€€…Í½É•¹Ñ•É•¡ÁÕÑÑÌ¤ñð(€€€€€€€€¡É½ÍÌ€„ôô€‰@ˆ€˜˜€ …9Õµ‰•È¹¥Í%¹Ñ••È ­É½ÍÌ¤ñð€­É½ÍÌ€ð€Äñð€­É½ÍÌ€ø€ÈÀ¤¤ñð(€€€€€€€€…9Õµ‰•È¹¥Í%¹Ñ••È ­ÁÕÑÑÌ¤ñð(€€€€€€€€­ÁÕÑÑÌ€ð€Àñð(€€€€€€€€­ÁÕÑÑÌ€ø€äñð(€€€€€€€€¡É½ÍÌ€„ôô€‰@ˆ€˜˜€­ÁÕÑÑÌ€ø€­É½ÍÌ¤(€€€€€€¤(€€€€€€€É•ÑÕÉ¸…±•ÉÐ ‰¹Ñ•ÈÉ½ÍÌÍÑÉ½­•Ì™É½´€ÇŠLÈÀ€¡½È@¤…¹ÁÕÑÑÌ™É½´€ÃŠLä¸ˆ¤ì(€€€€€¥˜€ (€€€€€€€€…½¹™¥É´ (€€€€€€€€€I•½É€‘íÁ±…å•È¡Á±…å•É%¤ü¹¹…µ”ñð€‰A±…å•È‰ôƒŠP!½±”€‘í¡½±•ôè€‘íÉ½ÍÍôÍÑÉ½­•Ì°€‘íÁÕÑÑÍôÁÕÑÑÌ…ÌÑ¡”½™™¥¥…°½É…¹¥Í•È½ÉÉ•Ñ¥½¸ý€°(€€€€€€€€¤(€€€€€€¤(€€€€€€€É•ÑÕÉ¸ì(€€€€€½¹ÍÐ…ÍÍ¥¹•‘M½É•È€ô(€€€€€€€€€¥‘Ì¹™¥¹ (€€€€€€€€€€€€¡¥¤€ôøMÑÉ¥¹œ¡µ…É­•ÉQ…É•Ñ½È¡¥°‘…ä¤¤€ôôôMÑÉ¥¹œ¡Á±…å•É%¤°(€€€€€€€€€€¤ñðÁ±…å•É%°(€€€€€€€Ñ…É•Ð€ô(€€€€€€€€€±½…Ñ¥½¸ñð(€€€€€€€€€€¡ì(€€€€€€€€€€€Í½É•É%è…ÍÍ¥¹•‘M½É•È°(€€€€€€€€€€€É•½ÉèÍ½É•I•½É¡‘…ä°…ÍÍ¥¹•‘M½É•È°¡½±”¤°(€€€€€€€€€ô¤ì(€€€€€Ñ…É•Ð¹É•½É¹½™™¥¥…°€ôì(€€€€€€€€¸¸¸¡Ñ…É•Ð¹É•½É¹½™™¥¥…°ñðíô¤°(€€€€€€€Á±…å•É%°(€€€€€€€É½ÍÌ°(€€€€€€€ÁÕÑÑÌè€­ÁÕÑÑÌ°(€€€€€€€½É…¹¥Í•É½ÉÉ•Ñ•èÑÉÕ”°(€€€€€€€½ÉÉ•Ñ•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€ôì(€€€€€É•½É‘=É…¹¥Í•É½ÉÉ•Ñ¥½¸¡‘…ä°Á±…å•É%°¡½±”°ì(€€€€€€€É½ÍÌ°(€€€€€€€ÁÕÑÑÌè€­ÁÕÑÑÌ°(€€€€€€€Í½É•É%èMÑÉ¥¹œ¡Ñ…É•Ð¹Í½É•É%¤°(€€€€€€€½ÉÉ•Ñ•‘ÐèÑ…É•Ð¹É•½É¹½™™¥¥…°¹½ÉÉ•Ñ•‘Ð°(€€€€€ô¤ì(€€€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•ü¹l‰‘…äˆ€¬‘…åt¤(€€€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åumÁ±…å•É%‘tì(€€€€€½¹ÍÐ½ÉÉ•Ñ•‘A±…å•ÉI½Õ¹€ôÍ½É•ÉMÑ½É”¡‘…ä°Á±…å•É%¤ì(€€€€€¥˜€¡½ÉÉ•Ñ•‘A±…å•ÉI½Õ¹¹}µ•Ñ„ü¹™¥¹…±¥Í•‘Ð¤(€€€€€€€‘•±•Ñ”½ÉÉ•Ñ•‘A±…å•ÉI½Õ¹¹}µ•Ñ„¹™¥¹…±¥Í•‘Ðì(€€€€€•µ•É•¹å1½œ¡ì(€€€€€€€ÑåÁ”è€‰½É…¹¥Í•Èµ¡½±”µ½ÉÉ•Ñ¥½¸ˆ°(€€€€€€€‘…ä°(€€€€€€€Á±…å•É%°(€€€€€€€Í½É•É%èÑ…É•Ð¹Í½É•É%°(€€€€€€€¡½±”°(€€€€€€€É½ÍÌ°(€€€€€€€ÁÕÑÑÌè€­ÁÕÑÑÌ°(€€€€€ô¤ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€…Ý…¥Ð™±ÕÍ¡±½Õ‘I½Õ¹¡‘…ä°Ñ…É•Ð¹Í½É•É%¤ì(€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€¥˜€ (€€€€€€€Ù•É¥™¥…Ñ¥½¹%ÍÍÕ•½Õ¹Ð¡‘…ä°Á±…å•É%¤€ôôô€À€˜˜(€€€€€€€µ…É­•‘M½É•…É‘Y•É¥™¥…Ñ¥½¸¡‘…ä°Á±…å•É%¤¹µ¥Íµ…Ñ¡•Ì¹±•¹Ñ €ôôô€À(€€€€€€¤(€€€€€€€•µ•É•¹å¥¹…±¥Í•%™Y•É¥™¥•¡‘…ä°Á±…å•É%°™…±Í”¤ì(€€€€€É•¹‘•É!½µ” ¤ì(€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€…±•ÉÐ ‰Q¡”½™™¥¥…°¡½±”¡…Ì‰••¸½ÉÉ•Ñ•…¹Í…Ù•¸ˆ¤ì(€€€€€É•¹‘•É=™™¥¥…±!½±•½ÉÉ•Ñ¥½¸¡‘…ä°Á±…å•É%°¡½±”¤ì(€€€ôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉM•±™M½É•I•½Ù•Éä¡‘…ä°™…¥±•‘M½É•É%¤ì(€€€½¹ÍÐ¥‘Ì€ô‘…å¥•±‘%‘Ì¡‘…ä¤(€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€¹µ…À¡MÑÉ¥¹œ¤ì(€€€½¹ÍÐ™…¥±•€ôMÑÉ¥¹œ¡™…¥±•‘M½É•É%ñð¥‘ÍlÁtñð€ˆˆ¤°(€€€€€ÁÕÑÑÍI•ÅÕ¥É•€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤°(€€€€€µ…É­•‘%€ôµ…É­•ÉQ…É•Ñ½È¡™…¥±•°‘…ä¤°(€€€€€µ…É­•€ôÁ±…å•È¡µ…É­•‘%¤°(€€€€€½Ý¸€ôÍ½É¥¹…åMÑ½É”¡‘…ä¤ü¹mMÑÉ¥¹œ¡µ…É­•‘%¥tñðíô°(€€€€€µ¥ÍÍ¥¹œ€ômtì(€€€™½È€¡±•Ð €ô€Äì €ðô€Äàì ¬¬¤ì(€€€€€½¹ÍÐÍ•±˜€ô½Ý¹mMÑÉ¥¹œ¡ ¥tü¹Í•±˜ñðíô°(€€€€€€€½™™¥¥…°€ô™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°µ…É­•‘%° ¤ì(€€€€€¥˜€ …½™™¥¥…°€˜˜Í½É•¹Ñ•É•¡Í•±˜¹É½ÍÌ¤¤(€€€€€€€µ¥ÍÍ¥¹œ¹ÁÕÍ ¡ì °É½ÍÌèÍ•±˜¹É½ÍÌ°ÁÕÑÑÌèÍ•±˜¹ÁÕÑÑÌô¤ì(€€€ô(€€€½¹ÍÐÉ½ÝÌ€ôµ¥ÍÍ¥¹œ¹±•¹Ñ (€€€€€€üµ¥ÍÍ¥¹œ(€€€€€€€€€€¹µ…À (€€€€€€€€€€€€¡È¤€ôø(€€€€€€€€€€€€€€ñÑÈøñÑø‘íÈ¹¡ôð½ÑøñÑøñ¥¹ÁÕÐ±…ÍÌô‰É•½Ù•Éå‘¥Ðˆ‘…Ñ„µÉ•½Ù•ÉåÉ½ÍÌôˆ‘íÈ¹¡ôˆ¥¹ÁÕÑµ½‘”ô‰Ñ•áÐˆµ…á±•¹Ñ ôˆÈˆÙ…±Õ”ôˆ‘í•ÍŒ¡È¹É½ÍÌ¥ôˆ…É¥„µ±…‰•°ô‰!½±”€‘íÈ¹¡ôÉ½ÍÌÍÑÉ½­•Ìˆøð½Ñø‘íÁÕÑÑÍI•ÅÕ¥É•€ü€ñÑøñ¥¹ÁÕÐ±…ÍÌô‰É•½Ù•Éå‘¥Ðˆ‘…Ñ„µÉ•½Ù•ÉåÁÕÑÑÌôˆ‘íÈ¹¡ôˆ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥Œˆµ…á±•¹Ñ ôˆÄˆÙ…±Õ”ôˆ‘íÍ½É•¹Ñ•É•¡È¹ÁÕÑÑÌ¤€ü•ÍŒ¡È¹ÁÕÑÑÌ¤€è€ˆ‰ôˆÁ±…•¡½±‘•Èô‰I•ÅÕ¥É•ˆ…É¥„µ±…‰•°ô‰!½±”€‘íÈ¹¡ôÁÕÑÑÌˆøð½Ñù€€è€ˆ‰ôñÑø‘íÍ½É•¹Ñ•É•¡È¹É½ÍÌ¤€˜˜€ …ÁÕÑÑÍI•ÅÕ¥É•ñðÍ½É•¹Ñ•É•¡È¹ÁÕÑÑÌ¤¤€ü€‰I•…‘äˆ€è€‰½µÁ±•Ñ”•¹ÑÉä‰ôð½Ñøð½ÑÈù€°(€€€€€€€€€€¤(€€€€€€€€€€¹©½¥¸ ˆˆ¤(€€€€€€è€œñÑÈøñÑ½±ÍÁ…¸ôˆÐˆù9¼É•½Ù•É…‰±”µ¥ÍÍ¥¹œÍ½É•ÌÝ•É”™½Õ¹¸ð½Ñøð½ÑÈøœì(€€€½¹ÍÐÉ•½Ù•ÉåI½ÝY…±¥€ô€¡É½Ü¤€ôøì(€€€€€€€½¹ÍÐÉ½ÍÌ€ôMÑÉ¥¹œ¡É½Ü¹É½ÍÌ€üü€ˆˆ¤¹Ñ½UÁÁ•É…Í” ¤°(€€€€€€€€€ÁÕÑÑÌ€ô9Õµ‰•È¡É½Ü¹ÁÕÑÑÌ¤ì(€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€Í½É•¹Ñ•É•¡É½ÍÌ¤€˜˜(€€€€€€€€€€¡É½ÍÌ€ôôô€‰@ˆñð(€€€€€€€€€€€€¡9Õµ‰•È¹¥Í%¹Ñ••È ­É½ÍÌ¤€˜˜€­É½ÍÌ€øô€Ä€˜˜€­É½ÍÌ€ðô€ÈÀ¤¤€˜˜(€€€€€€€€€€ …ÁÕÑÑÍI•ÅÕ¥É•ñð€¡Í½É•¹Ñ•É•¡É½Ü¹ÁÕÑÑÌ¤€˜˜(€€€€€€€€€€€9Õµ‰•È¹¥Í%¹Ñ••È¡ÁÕÑÑÌ¤€˜˜ÁÕÑÑÌ€øô€À€˜˜ÁÕÑÑÌ€ðô€ä€˜˜(€€€€€€€€€€€€¡É½ÍÌ€ôôô€‰@ˆñðÁÕÑÑÌ€ðô€­É½ÍÌ¤¤¤(€€€€€€€€¤ì(€€€€€ô°(€€€€€É•½Ù•ÉåI•…‘ä€ô€ ¤€ôø(€€€€€€€µ¥ÍÍ¥¹œ¹±•¹Ñ €ø€À€˜˜µ¥ÍÍ¥¹œ¹•Ù•Éä¡É•½Ù•ÉåI½ÝY…±¥¤ì(€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰•µ•É•¹å!•…ˆøñÍµ…±°ùA!=9%1UIƒ
Üd€‘í‘…åôð½Íµ…±°øñ ÈùI•½Ù•È™É½´M•±˜µM½É•Ìð½ ÈøñÀùM•±•ÐÑ¡”Á±…å•ÈÝ¡½Í”Á¡½¹”™…¥±•¸Q¡”…ÁÀÝ¥±°™¥¹Ñ¡”½™™¥¥…°…ÉÑ¡…ÐÁ¡½¹”Ý…Ìµ…É­¥¹œ¸ð½Àøð½‘¥Øøñ±…‰•°±…ÍÌô‰•µ•É•¹åM•±•ÐˆùA¡½¹”Ñ¡…Ð™…¥±•ñÍ•±•Ð¥ô‰™…¥±•‘M½É•Èˆø‘í•µ•É•¹åA±…å•É=ÁÑ¥½¹Ì¡‘…ä°™…¥±•¥ôð½Í•±•Ðøð½±…‰•°øñ‘¥Ø±…ÍÌô‰É•½Ù•ÉåI•±…Ñ¥½¹Í¡¥ÀˆøñÍÁ…¸øñÍµ…±°ù%1A!=9ð½Íµ…±°øñˆø‘í•ÍŒ¡Á±…å•È¡™…¥±•¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½ˆøð½ÍÁ…¸øñÍÑÉ½¹œùÝ…Ìµ…É­¥¹œƒŠHð½ÍÑÉ½¹œøñÍÁ…¸øñÍµ…±°ùA1eHQ<I=YHð½Íµ…±°øñˆø‘í•ÍŒ¡µ…É­•ü¹¹…µ”ñð€‰9¼µ…É­•ÈÁ…ÉÑ¹•È™½Õ¹ˆ¥ôð½ˆøð½ÍÁ…¸øð½‘¥ØøñÀ±…ÍÌô‰É•½Ù•Éå9½Ñ¥”ˆù½µÁ…É”•Ù•Éä•¹ÑÉäÝ¥Ñ Ñ¡”µ…¹Õ…±±ä½µÁ±•Ñ•…É¸¥±°…¹äµ¥ÍÍ¥¹œ€‘íÁÕÑÑÍI•ÅÕ¥É•€ü€‰Í½É”½ÈÁÕÑÑÌˆ€è€‰Í½É”‰ô‰•™½É”…•ÁÑ¥¹œ¸á¥ÍÑ¥¹œ½™™¥¥…°Í½É•ÌÝ¥±°¹½Ð‰”¡…¹•¸ð½Àøñ‘¥Ø±…ÍÌô‰•µ•É•¹åQ…‰±•]É…ÀˆøñÑ…‰±”±…ÍÌô‰•µ•É•¹åQ…‰±”ˆøñÑ¡•…øñÑÈøñÑ ù!½±”ð½Ñ øñÑ ø‘í•ÍŒ¡Á±…å•ÉMÕÉ¹…µ”¡µ…É­•‘%¤¥ôÍ•±˜Í½É”ð½Ñ ø‘íÁÕÑÑÍI•ÅÕ¥É•€ü€ˆñÑ ùAÕÑÑÌð½Ñ øˆ€è€ˆ‰ôñÑ ù=™™¥¥…°•¹ÑÉäð½Ñ øð½ÑÈøð½Ñ¡•…øñÑ‰½‘äø‘íÉ½ÝÍôð½Ñ‰½‘äøð½Ñ…‰±”øð½‘¥Øø‘í½™™¥¥…±…É‘AÉ½É•ÍÌ¡‘…ä°™…¥±•¤¹½µÁ±•Ñ”€ü€ñ±…‰•°±…ÍÌô‰É•½Ù•Éå9½Ñ¥”ˆøñ¥¹ÁÕÐ¥ô‰…•ÁÑ…¥±•‘=™™¥¥…°ˆÑåÁ”ô‰¡•­‰½àˆ¡•­•ÍÑå±”ô‰Ý¥‘Ñ é…ÕÑ¼ˆø±Í¼…•ÁÐ€‘í•ÍŒ¡Á±…å•È¡™…¥±•¤ü¹¹…µ”ñð€‰Ñ¡”™…¥±•µÁ¡½¹”Á±…å•Èˆ¥÷ŠeÌ½µÁ±•Ñ•½™™¥¥…°…É…™Ñ•È¡•­¥¹œ¥Ð¸Q¡•¥È™…¥±•Á¡½¹”…¹¹½ÐÙ•É¥™äÑ¡”É•µ…¥¹¥¹œ¡½±•Ì¸ð½±…‰•°ù€€è€ˆ‰ôñ‘¥Ø±…ÍÌô‰•µ•É•¹åÑ¥½¹Ìˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰‰…­µ•É•¹äˆûŠ@	…¬ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰…•ÁÑM•±™I•½Ù•Éäˆ€‘íÉ•½Ù•ÉåI•…‘ä ¤€ü€ˆˆ€è€‰‘¥Í…‰±•‰ôù•ÁÐ€‘íµ¥ÍÍ¥¹œ¹±•¹Ñ¡ôM•±˜µM½É”‘íµ¥ÍÍ¥¹œ¹±•¹Ñ €ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô…Ì½ÉÉ•Ðð½‰ÕÑÑ½¸øð½‘¥Øù€ì(€€€€ ˆ™…¥±•‘M½É•Èˆ¤¹½¹¡…¹”€ô€¡”¤€ôø(€€€€€É•¹‘•ÉM•±™M½É•I•½Ù•Éä¡‘…ä°”¹Ñ…É•Ð¹Ù…±Õ”¤ì(€€€€ ˆ‰…­µ•É•¹äˆ¤¹½¹±¥¬€ô½Á•¹µ•É•¹åI•½Ù•Éäì(€€€€ m‘…Ñ„µÉ•½Ù•ÉåÉ½ÍÍt°m‘…Ñ„µÉ•½Ù•ÉåÁÕÑÑÍtœ¤¹™½É…  ¡¥¹ÁÕÐ¤€ôøì(€€€€€¥¹ÁÕÐ¹½¹¥¹ÁÕÐ€ô€ ¤€ôøì(€€€€€€€½¹ÍÐ €ô€¬¡¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹É•½Ù•ÉåÉ½ÍÌñð¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹É•½Ù•ÉåÁÕÑÑÌ¤°(€€€€€€€€€É½Ü€ôµ¥ÍÍ¥¹œ¹™¥¹ ¡¥Ñ•´¤€ôø¥Ñ•´¹ €ôôô ¤ì(€€€€€€€¥˜€ …É½Ü¤É•ÑÕÉ¸ì(€€€€€€€¥˜€¡¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹É•½Ù•ÉåÉ½ÍÌ¤ì(€€€€€€€€€½¹ÍÐÙ…±Õ”€ô¥¹ÁÕÐ¹Ù…±Õ”¹ÑÉ¥´ ¤¹Ñ½UÁÁ•É…Í” ¤ì(€€€€€€€€€É½Ü¹É½ÍÌ€ôÙ…±Õ”€ôôô€ˆ´ˆñðÙ…±Õ”€ôôô€‹ŠLˆ€ü€‰@ˆ€èÙ…±Õ”ì(€€€€€€€ô•±Í”É½Ü¹ÁÕÑÑÌ€ô¥¹ÁÕÐ¹Ù…±Õ”¹ÑÉ¥´ ¤ì(€€€€€€€€ ˆ…•ÁÑM•±™I•½Ù•Éäˆ¤¹‘¥Í…‰±•€ô€…É•½Ù•ÉåI•…‘ä ¤ì(€€€€€ôì(€€€ô¤ì(€€€¥˜€  ˆ…•ÁÑM•±™I•½Ù•Éäˆ¤¤(€€€€€€ ˆ…•ÁÑM•±™I•½Ù•Éäˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€€€¥˜€ …É•½Ù•ÉåI•…‘ä ¤¤É•ÑÕÉ¸ì(€€€€€€€½¹ÍÐ…•ÁÑ…¥±•‘=™™¥¥…°€ô	½½±•…¸  ˆ…•ÁÑ…¥±•‘=™™¥¥…°ˆ¤ü¹¡•­•€˜˜½™™¥¥…±…É‘AÉ½É•ÍÌ¡‘…ä°™…¥±•¤¹½µÁ±•Ñ”¤ì(€€€€€€€¥˜€ (€€€€€€€€€€…½¹™¥É´ (€€€€€€€€€€€½Áä€‘íµ¥ÍÍ¥¹œ¹±•¹Ñ¡ô€‘íµ…É­•ü¹¹…µ”ñð€‰Á±…å•È‰ôÍ•±˜µÍ½É”•¹ÑÉ¥•Ì¥¹Ñ¼Ñ¡”µ¥ÍÍ¥¹œ½™™¥¥…°…Éü‘í…•ÁÑ…¥±•‘=™™¥¥…°€ü€±Í¼…•ÁÐ€‘íÁ±…å•È¡™…¥±•¤ü¹¹…µ”ñð€‰Ñ¡”™…¥±•µÁ¡½¹”Á±…å•È‰ôÌ½µÁ±•Ñ•½™™¥¥…°…É¹€€è€ˆ‰õ€°(€€€€€€€€€€¤(€€€€€€€€¤(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€µ¥ÍÍ¥¹œ¹™½É…  ¡È¤€ôøì(€€€€€€€€€½¹ÍÐÉ•Œ€ôÍ½É•I•½É¡‘…ä°™…¥±•°È¹ ¤ì(€€€€€€€€€¥˜€ …™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°µ…É­•‘%°È¹ ¤¤ì(€€€€€€€€€€€É•Œ¹½™™¥¥…°€ôì(€€€€€€€€€€€€€Á±…å•É%èMÑÉ¥¹œ¡µ…É­•‘%¤°(€€€€€€€€€€€€€É½ÍÌèÈ¹É½ÍÌ°(€€€€€€€€€€€€€€¸¸¸¡ÁÕÑÑÍI•ÅÕ¥É•€üìÁÕÑÑÌèÈ¹ÁÕÑÑÌô€èíô¤°(€€€€€€€€€€€€€•µ•É•¹åI•½Ù•É•èÑÉÕ”°(€€€€€€€€€€€€€É•½Ù•É•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€€€€€€€ôì(€€€€€€€€€€€É•½É‘=É…¹¥Í•É½ÉÉ•Ñ¥½¸¡‘…ä°µ…É­•‘%°È¹ °ì(€€€€€€€€€€€€€É½ÍÌèÈ¹É½ÍÌ°(€€€€€€€€€€€€€€¸¸¸¡ÁÕÑÑÍI•ÅÕ¥É•€üìÁÕÑÑÌè€­È¹ÁÕÑÑÌô€èíô¤°(€€€€€€€€€€€€€Í½É•É%èMÑÉ¥¹œ¡™…¥±•¤°(€€€€€€€€€€€€€•µ•É•¹åI•½Ù•É•èÑÉÕ”°(€€€€€€€€€€€ô¤ì(€€€€€€€€€ô(€€€€€€€ô¤ì(€€€€€€€•µ•É•¹å1½œ¡ì(€€€€€€€€€ÑåÁ”è€‰Í•±˜µÍ½É”µ½Áäˆ°(€€€€€€€€€‘…ä°(€€€€€€€€€™…¥±•‘M½É•É%è™…¥±•°(€€€€€€€€€É•½Ù•É•‘A±…å•É%èMÑÉ¥¹œ¡µ…É­•‘%¤°(€€€€€€€€€É•½Ù•É•‘…¥±•‘A±…å•É%è…•ÁÑ…¥±•‘=™™¥¥…°€ü™…¥±•€è¹Õ±°°(€€€€€€€€€™…¥±•‘M•±™5¥ÍÍ¥¹!½±•Ìè…•ÁÑ…¥±•‘=™™¥¥…°€üÉÉ…ä¹™É½´¡í±•¹Ñ èÄáô°€¡|±¤¤€ôø¤¬Ä¤¹™¥±Ñ•È¡ €ôø€…Í½É•¹Ñ•É•¡Í½É•ÉMÑ½É”¡‘…ä°™…¥±•¥mMÑÉ¥¹œ¡ ¥tü¹Í•±˜ü¹É½ÍÌ¤¤€èmt°(€€€€€€€€€¡½±•Ìèµ¥ÍÍ¥¹œ¹µ…À ¡à¤€ôøà¹ ¤°(€€€€€€€ô¤ì(€€€€€€€•µ•É•¹å¥¹…±¥Í•%™Y•É¥™¥•¡‘…ä°µ…É­•‘%°ÑÉÕ”¤ì(€€€€€€€¥˜€¡…•ÁÑ…¥±•‘=™™¥¥…°¤•µ•É•¹å¥¹…±¥Í•%™Y•É¥™¥•¡‘…ä°™…¥±•°ÑÉÕ”¤ì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õü¹•Ù•¹Ñ%¤ì(€€€€€€€€€…Ý…¥Ð™±ÕÍ¡±½Õ‘I½Õ¹¡‘…ä°™…¥±•¤ì(€€€€€€€€€…Ý…¥Ð™±ÕÍ¡±½Õ‘I½Õ¹¡‘…ä°µ…É­•‘%¤ì(€€€€€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€€€ô(€€€€€€€±½Í•µ•É•¹åI•½Ù•Éä ¤ì(€€€€€€€É•¹‘•É!½µ” ¤ì(€€€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€€€…±•ÉÐ¡€‘íµ…É­•ü¹¹…µ”ñð€‰A±…å•È‰ôÌµ¥ÍÍ¥¹œ½™™¥¥…°Í½É•Ì¡…Ù”‰••¸É•½Ù•É•¹€¤ì(€€€€€ôì(€ô(€™Õ¹Ñ¥½¸Ù¥ÉÑÕ…±…É‘]…É¹¥¹Ì¡Ù…±Õ•Ì¤ì(€€€½¹ÍÐÝ…É¹¥¹Ì€ômtì(€€€Ù…±Õ•Ì¹™½É…  ¡É½Ü¤€ôøì(€€€€€l(€€€€€€€l‰A±…å•Èˆ°É½Ü¹Í•±™É½ÍÌ°É½Ü¹Í•±™AÕÑÑÍt°(€€€€€€€l‰A…ÉÑ¹•Èˆ°É½Ü¹½™™¥¥…±É½ÍÌ°É½Ü¹½™™¥¥…±AÕÑÑÍt°(€€€€€t¹™½É…  ¡m±…‰•°°É½ÍÌ°ÁÕÑÑÍt¤€ôøì(€€€€€€€¥˜€ …Í½É•¹Ñ•É•¡É½ÍÌ¤ñð€…Í½É•¹Ñ•É•¡ÁÕÑÑÌ¤¤(€€€€€€€€€Ý…É¹¥¹Ì¹ÁÕÍ ¡!½±”€‘íÉ½Ü¹¡ôè€‘í±…‰•±ô•¹ÑÉä¥Ì¥¹½µÁ±•Ñ”¹€¤ì(€€€€€€€•±Í”¥˜€ (€€€€€€€€€MÑÉ¥¹œ¡É½ÍÌ¤¹Ñ½UÁÁ•É…Í” ¤€„ôô€‰@ˆ€˜˜(€€€€€€€€€€ ­É½ÍÌ€ð€Äñð€­É½ÍÌ€ø€ÈÀ¤(€€€€€€€€¤(€€€€€€€€€Ý…É¹¥¹Ì¹ÁÕÍ ¡!½±”€‘íÉ½Ü¹¡ôè€‘í±…‰•±ôÍ½É”µÕÍÐ‰”€ÇŠLÈÀ½È@¹€¤ì(€€€€€€€•±Í”¥˜€ ­ÁÕÑÑÌ€ð€Àñð€­ÁÕÑÑÌ€ø€ä¤(€€€€€€€€€Ý…É¹¥¹Ì¹ÁÕÍ ¡!½±”€‘íÉ½Ü¹¡ôè€‘í±…‰•±ôÁÕÑÑÌµÕÍÐ‰”€ÃŠLä¹€¤ì(€€€€€€€•±Í”¥˜€¡MÑÉ¥¹œ¡É½ÍÌ¤¹Ñ½UÁÁ•É…Í” ¤€„ôô€‰@ˆ€˜˜€­ÁÕÑÑÌ€ø€­É½ÍÌ¤(€€€€€€€€€Ý…É¹¥¹Ì¹ÁÕÍ ¡!½±”€‘íÉ½Ü¹¡ôè€‘í±…‰•±ôÁÕÑÑÌ•á••Ñ½Ñ…°ÍÑÉ½­•Ì¹€¤ì(€€€€€ô¤ì(€€€ô¤ì(€€€É•ÑÕÉ¸Ý…É¹¥¹Ìì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉY¥ÉÑÕ…±…É¡‘…ä°Í½É•É%¤ì(€€€½¹ÍÐ¥‘Ì€ô‘…å¥•±‘%‘Ì¡‘…ä¤(€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤°(€€€€€Í½É•È€ôMÑÉ¥¹œ¡Í½É•É%ñð¥‘ÍlÁtñð€ˆˆ¤°(€€€€€Ñ…É•Ñ%€ôµ…É­•ÉQ…É•Ñ½È¡Í½É•È°‘…ä¤°(€€€€€Œ€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤°(€€€€€Ø€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Í½É•È¤°(€€€€€•á¥ÍÑ¥¹œ€ô=‰©•Ð¹­•åÌ¡Í½É¥¹…åMÑ½É”¡‘…ä¤ü¹mÍ½É•Étñðíô¤¹™¥±Ñ•È (€€€€€€€€¡à¤€ôø€½yq¬¼¹Ñ•ÍÐ¡à¤°(€€€€€€¤¹±•¹Ñ ì(€€€½¹ÍÐÉ½ÝÌ€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôøì(€€€€€½¹ÍÐ €ô¤€¬€Äì(€€€€€É•ÑÕÉ¸€ñÑÈøñÑøñˆø‘í¡ôð½ˆøñÍµ…±°ùA…È€‘íØ¹Á…Èü¹m¥tñð€‹ŠP‰ôð½Íµ…±°øð½ÑøñÑøñ¥¹ÁÕÐ…É¥„µ±…‰•°ôˆ‘í•ÍŒ¡Á±…å•È¡Í½É•È¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ô!½±”€‘í¡ôÍÑÉ½­•Ìˆ‘…Ñ„µÙ…Éôˆ‘í¡õñÍ•±™É½ÍÌˆ¥¹ÁÕÑµ½‘”ô‰Ñ•áÐˆµ…á±•¹Ñ ôˆÈˆøð½ÑøñÑøñ¥¹ÁÕÐ…É¥„µ±…‰•°ôˆ‘í•ÍŒ¡Á±…å•È¡Í½É•È¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ô!½±”€‘í¡ôÁÕÑÑÌˆ‘…Ñ„µÙ…Éôˆ‘í¡õñÍ•±™AÕÑÑÌˆ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥Œˆµ…á±•¹Ñ ôˆÄˆøð½ÑøñÑøñ¥¹ÁÕÐ…É¥„µ±…‰•°ôˆ‘í•ÍŒ¡Á±…å•È¡Ñ…É•Ñ%¤ü¹¹…µ”ñð€‰A…ÉÑ¹•Èˆ¥ô!½±”€‘í¡ôÍÑÉ½­•Ìˆ‘…Ñ„µÙ…Éôˆ‘í¡õñ½™™¥¥…±É½ÍÌˆ¥¹ÁÕÑµ½‘”ô‰Ñ•áÐˆµ…á±•¹Ñ ôˆÈˆøð½ÑøñÑøñ¥¹ÁÕÐ…É¥„µ±…‰•°ôˆ‘í•ÍŒ¡Á±…å•È¡Ñ…É•Ñ%¤ü¹¹…µ”ñð€‰A…ÉÑ¹•Èˆ¥ô!½±”€‘í¡ôÁÕÑÑÌˆ‘…Ñ„µÙ…Éôˆ‘í¡õñ½™™¥¥…±AÕÑÑÌˆ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥Œˆµ…á±•¹Ñ ôˆÄˆøð½Ñøð½ÑÈù€ì(€€€ô¤¹©½¥¸ ˆˆ¤ì(€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰•µ•É•¹å!•…ˆøñÍµ…±°ù=5A1QIƒ
Üd€‘í‘…åôð½Íµ…±°øñ Èù¹Ñ•ÈA±…å•ËŠM5…É­•È…Éð½ Èøñ‘¥Ø±…ÍÌô‰Ù¥ÉÑÕ…±½ÕÉÍ•9…µ”ˆøñÍµ…±°ù=UIMM=IIð½Íµ…±°øñˆø‘í•ÍŒ¡Œü¹¹…µ”ñð€‰½ÕÉÍ”¹½ÐÍ•±•Ñ•ˆ¥ôð½ˆøð½‘¥ØøñÀù¹Ñ•È€ñˆùÉ½ÍÌÍÑÉ½­•ÌÑ…­•¸ð½ˆø™É½´5¥M½É”½ÈÑ¡”µ…¹Õ…°…É¸Ý…ä½±˜…±Õ±…Ñ•ÌMÑ…‰±•™½ÉÁ½¥¹ÑÌ…ÕÑ½µ…Ñ¥…±±ä¸ð½Àøð½‘¥Øøñ±…‰•°±…ÍÌô‰•µ•É•¹åM•±•ÐˆùY¥ÉÑÕ…°Á±…å•È€¼Í½É•ÈñÍ•±•Ð¥ô‰Ù¥ÉÑÕ…±M½É•Èˆø‘í•µ•É•¹åA±…å•É=ÁÑ¥½¹Ì¡‘…ä°Í½É•È¥ôð½Í•±•Ðøð½±…‰•°øñ‘¥Ø±…ÍÌô‰Ù¥ÉÑÕ…±…É‘9…µ•ÌˆøñÍÁ…¸øñÍµ…±°ùM1µ!,Ið½Íµ…±°øñˆø‘í•ÍŒ¡Á±…å•È¡Í½É•È¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½ˆøð½ÍÁ…¸øñÍÁ…¸øñÍµ…±°ù=%%0I	%95I-ð½Íµ…±°øñˆø‘í•ÍŒ¡Á±…å•È¡Ñ…É•Ñ%¤ü¹¹…µ”ñð€‰5…É­•ÈÁ…ÉÑ¹•Èˆ¥ôð½ˆøð½ÍÁ…¸øð½‘¥Øø‘í•á¥ÍÑ¥¹œ€ü€ñ‘¥Ø±…ÍÌô‰•µ•É•¹å]…É¹¥¹œˆøñˆù…É…±É•…‘ä½¹Ñ…¥¹Ì€‘í•á¥ÍÑ¥¹ô¡½±”‘í•á¥ÍÑ¥¹œ€ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô¸ð½ˆøñÍÁ…¸ù½µÁ±•Ñ”µ…É•¹ÑÉä¥Ì‘¥Í…‰±•Í¼•á¥ÍÑ¥¹œÁ¡½¹”Í½É•Ì…¹¹½Ð‰”½Ù•ÉÝÉ¥ÑÑ•¸¸ð½ÍÁ…¸øð½‘¥Øù€€è€ˆ‰ôñÀ±…ÍÌô‰™…ÍÑ¹ÑÉå!•±Àˆù¹Ñ•ÈÉ½ÍÌÍÑÉ½­•Ì…¹ÁÉ•ÍÌI•ÑÕÉ¸Ñ¼µ½Ù”Ñ¼Ñ¡”¹•áÐ‰½à¸i•É¼ÁÕÑÑÌ¥ÌÙ…±¥¸¹Ñ•È€ñˆù@ð½ˆø½È€ñˆûŠLð½ˆø™½È„Á¥­ÕÀ¸ð½Àøñ‘¥Ø±…ÍÌô‰•µ•É•¹åQ…‰±•]É…ÀÙ¥ÉÑÕ…±…É‘]É…ÀˆøñÑ…‰±”±…ÍÌô‰•µ•É•¹åQ…‰±”Ù¥ÉÑÕ…±…ÉˆøñÑ¡•…øñÑÈøñÑ ù!½±”ð½Ñ øñÑ ø‘í•ÍŒ¡Á±…å•ÉMÕÉ¹…µ”¡Í½É•È¤¥ôñ‰ÈùÉ½ÍÌMÑÉ½­•Ìð½Ñ øñÑ ø‘í•ÍŒ¡Á±…å•ÉMÕÉ¹…µ”¡Í½É•È¤¥ôñ‰ÈùAÕÑÑÌð½Ñ øñÑ ø‘í•ÍŒ¡Á±…å•ÉMÕÉ¹…µ”¡Ñ…É•Ñ%¤¥ôñ‰Èù=™™¥¥…°MÑÉ½­•Ìð½Ñ øñÑ ø‘í•ÍŒ¡Á±…å•ÉMÕÉ¹…µ”¡Ñ…É•Ñ%¤¥ôñ‰ÈùAÕÑÑÌð½Ñ øð½ÑÈøð½Ñ¡•…øñÑ‰½‘äø‘íÉ½ÝÍôð½Ñ‰½‘äøð½Ñ…‰±”øð½‘¥Øøñ‘¥Ø¥ô‰Ù¥ÉÑÕ…±…É‘¡•¬ˆ±…ÍÌô‰Ù¥ÉÑÕ…±…É‘¡•¬ˆøÀ½˜€ÜÈ•¹ÑÉ¥•Ì½µÁ±•Ñ•ð½‘¥Øøñ‘¥Ø±…ÍÌô‰•µ•É•¹åÑ¥½¹Ìˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰‰…­µ•É•¹äˆûŠ@	…¬ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰É•Ù¥•ÝY¥ÉÑÕ…±…Éˆ€‘í•á¥ÍÑ¥¹œ€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôùI•Ù¥•Ü…Éð½‰ÕÑÑ½¸øð½‘¥Øù€ì(€€€€ ˆÙ¥ÉÑÕ…±M½É•Èˆ¤¹½¹¡…¹”€ô€¡”¤€ôø(€€€€€É•¹‘•ÉY¥ÉÑÕ…±…É¡‘…ä°”¹Ñ…É•Ð¹Ù…±Õ”¤ì(€€€€ ˆ‰…­µ•É•¹äˆ¤¹½¹±¥¬€ô½Á•¹µ•É•¹åI•½Ù•Éäì(€€€½¹ÍÐ¥¹ÁÕÑÌ€ô€ m‘…Ñ„µÙ…É‘tœ¤ì(€€€½¹ÍÐÕÁ‘…Ñ•½Õ¹Ð€ô€ ¤€ôøì(€€€€€½¹ÍÐ¸€ô¥¹ÁÕÑÌ¹™¥±Ñ•È ¡à¤€ôøà¹Ù…±Õ”¹ÑÉ¥´ ¤€„ôô€ˆˆ¤¹±•¹Ñ ì(€€€€€€ ˆÙ¥ÉÑÕ…±…É‘¡•¬ˆ¤¹Ñ•áÑ½¹Ñ•¹Ð€ô€‘í¹ô½˜€ÜÈ•¹ÑÉ¥•Ì½µÁ±•Ñ•‘€ì(€€€ôì(€€€¥¹ÁÕÑÌ¹™½É…  ¡¥¹ÁÕÐ°¤¤€ôøì(€€€€€¥¹ÁÕÐ¹½¹¥¹ÁÕÐ€ô€ ¤€ôøì(€€€€€€€½¹ÍÐÍ½É•¥•±€ô€½É½ÍÌ¼¹Ñ•ÍÐ¡¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹Ù…Éñð€ˆˆ¤ì(€€€€€€€¥¹ÁÕÐ¹Ù…±Õ”€ôÍ½É•¥•±(€€€€€€€€€€ü¥¹ÁÕÐ¹Ù…±Õ”¹Ñ½UÁÁ•É…Í” ¤¹É•Á±…” ½oŠOŠPµt½œ°€‰@ˆ¤¹É•Á±…” ½mxÀ´åAt½œ°€ˆˆ¤(€€€€€€€€€€è¥¹ÁÕÐ¹Ù…±Õ”¹É•Á±…” ½mxÀ´åt½œ°€ˆˆ¤ì(€€€€€€€¥˜€¡Í½É•¥•±€˜˜¥¹ÁÕÐ¹Ù…±Õ”¹¥¹±Õ‘•Ì ‰@ˆ¤¤¥¹ÁÕÐ¹Ù…±Õ”€ô€‰@ˆì(€€€€€€€ÕÁ‘…Ñ•½Õ¹Ð ¤ì(€€€€€ôì(€€€€€¥¹ÁÕÐ¹½¹­•å‘½Ý¸€ô€¡”¤€ôøì(€€€€€€€¥˜€¡”¹­•ä€ôôô€‰¹Ñ•Èˆ¤ì(€€€€€€€€€”¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì(€€€€€€€€€¥¹ÁÕÑÍm¤€¬€Åtü¹™½ÕÌ ¤ì(€€€€€€€€€¥¹ÁÕÑÍm¤€¬€Åtü¹Í•±•Ð ¤ì(€€€€€€€ô(€€€€€ôì(€€€ô¤ì(€€€€ ˆÉ•Ù¥•ÝY¥ÉÑÕ…±…Éˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€½¹ÍÐÙ…±Õ•Ì€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôøì(€€€€€€€½¹ÍÐ €ô¤€¬€Ä°(€€€€€€€€€•Ð€ô€¡­•ä¤€ôø(€€€€€€€€€€€€¡m‘…Ñ„µÙ…Éôˆ‘í¡õð‘í­•åô‰u€¤¹Ù…±Õ”¹ÑÉ¥´ ¤¹Ñ½UÁÁ•É…Í” ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€ °(€€€€€€€€€Í•±™É½ÍÌè•Ð ‰Í•±™É½ÍÌˆ¤°(€€€€€€€€€Í•±™AÕÑÑÌè•Ð ‰Í•±™AÕÑÑÌˆ¤°(€€€€€€€€€½™™¥¥…±É½ÍÌè•Ð ‰½™™¥¥…±É½ÍÌˆ¤°(€€€€€€€€€½™™¥¥…±AÕÑÑÌè•Ð ‰½™™¥¥…±AÕÑÑÌˆ¤°(€€€€€€€ôì(€€€€€ô¤ì(€€€€€½¹ÍÐÝ…É¹¥¹Ì€ôÙ¥ÉÑÕ…±…É‘]…É¹¥¹Ì¡Ù…±Õ•Ì¤ì(€€€€€¥˜€¡Ý…É¹¥¹Ì¹±•¹Ñ ¤ì(€€€€€€€€ ˆÙ¥ÉÑÕ…±…É‘¡•¬ˆ¤¹¥¹¹•É!Q50€ô€ñˆù¡•¬€‘íÝ…É¹¥¹Ì¹±•¹Ñ¡ô•¹ÑÈ‘íÝ…É¹¥¹Ì¹±•¹Ñ €ôôô€Ä€ü€‰äˆ€è€‰¥•Ì‰ôð½ˆøñÍÁ…¸ø‘íÝ…É¹¥¹Ì¹Í±¥” À°€Ø¤¹µ…À¡•ÍŒ¤¹©½¥¸ ˆñ‰Èøˆ¥ô‘íÝ…É¹¥¹Ì¹±•¹Ñ €ø€Ø€ü€ñ‰ÈûŠ™…¹€‘íÝ…É¹¥¹Ì¹±•¹Ñ €´€Ùôµ½É•€€è€ˆ‰ôð½ÍÁ…¸ù€ì(€€€€€€€€ ˆÙ¥ÉÑÕ…±…É‘¡•¬ˆ¤¹±…ÍÍ1¥ÍÐ¹…‘ ‰¡…Í]…É¹¥¹Ìˆ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€¥˜€ (€€€€€€€€…½¹™¥É´ (€€€€€€€€€•ÁÐÑ¡”½µÁ±•Ñ”A±…å•ËŠM5…É­•È…É™½È€‘íÁ±…å•È¡Í½É•È¤ü¹¹…µ”ñð€‰Ñ¡¥ÌÁ±…å•È‰ôý€°(€€€€€€€€¤(€€€€€€¤(€€€€€€€É•ÑÕÉ¸ì(€€€€€Ù…±Õ•Ì¹™½É…  ¡È¤€ôøì(€€€€€€€½¹ÍÐÉ•Œ€ôÍ½É•I•½É¡‘…ä°Í½É•È°È¹ ¤ì(€€€€€€€É•Œ¹Í•±˜€ôì(€€€€€€€€€Á±…å•É%èÍ½É•È°(€€€€€€€€€É½ÍÌèÈ¹Í•±™É½ÍÌ°(€€€€€€€€€ÁÕÑÑÌè€­È¹Í•±™AÕÑÑÌ°(€€€€€€€€€•µ•É•¹å¹Ñ•É•èÑÉÕ”°(€€€€€€€ôì(€€€€€€€É•Œ¹½™™¥¥…°€ôì(€€€€€€€€€Á±…å•É%èMÑÉ¥¹œ¡Ñ…É•Ñ%¤°(€€€€€€€€€É½ÍÌèÈ¹½™™¥¥…±É½ÍÌ°(€€€€€€€€€ÁÕÑÑÌè€­È¹½™™¥¥…±AÕÑÑÌ°(€€€€€€€€€•µ•É•¹å¹Ñ•É•èÑÉÕ”°(€€€€€€€ôì(€€€€€€€É•½É‘=É…¹¥Í•É½ÉÉ•Ñ¥½¸¡‘…ä°Ñ…É•Ñ%°È¹ °ì(€€€€€€€€€É½ÍÌèÈ¹½™™¥¥…±É½ÍÌ°(€€€€€€€€€ÁÕÑÑÌè€­È¹½™™¥¥…±AÕÑÑÌ°(€€€€€€€€€Í½É•É%èMÑÉ¥¹œ¡Í½É•È¤°(€€€€€€€€€•µ•É•¹å¹Ñ•É•èÑÉÕ”°(€€€€€€€ô¤ì(€€€€€ô¤ì(€€€€€•µ•É•¹å1½œ¡ì(€€€€€€€ÑåÁ”è€‰Ù¥ÉÑÕ…°µÁ±…å•Èµµ…É­•Èµ…Éˆ°(€€€€€€€‘…ä°(€€€€€€€Í½É•É%èÍ½É•È°(€€€€€€€µ…É­•‘A±…å•É%èMÑÉ¥¹œ¡Ñ…É•Ñ%¤°(€€€€€€€¡½±•ÌèÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôø¤€¬€Ä¤°(€€€€€ô¤ì(€€€€€•µ•É•¹å¥¹…±¥Í•%™Y•É¥™¥•¡‘…ä°Í½É•È°ÑÉÕ”¤ì(€€€€€•µ•É•¹å¥¹…±¥Í•%™Y•É¥™¥•¡‘…ä°Ñ…É•Ñ%°ÑÉÕ”¤ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°Í½É•È¤ì(€€€€€±½Í•µ•É•¹åI•½Ù•Éä ¤ì(€€€€€É•¹‘•É!½µ” ¤ì(€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€…±•ÉÐ ‰Q¡”½µÁ±•Ñ”A±…å•ËŠM5…É­•È…É¡…Ì‰••¸…•ÁÑ•¸ˆ¤ì(€€€ôì(€€€¥¹ÁÕÑÍlÁtü¹™½ÕÌ ¤ì(€ô(€™Õ¹Ñ¥½¸•µ•É•¹åIÕ±•Q•áÐ¡‘…ä°Ù¥ÉÑÕ…±%°…™™•Ñ•‘%°¹ÑÁáÑÉ…A±…å•ÉÌ¤ì(€€€½¹ÍÐÁÉ•™¥à€ôÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ø€Ä€ü…ä€‘í‘…åôè€€è€ˆˆì(€€€½¹ÍÐ‰…Í”€ô€‘íÁÉ•™¥áõ]”…É”„Á±…å•ÈÍ¡½ÉÐ™½È½ÕÈÝ…ä½±˜Ù•¹ÐÑ½‘…ä¸€‘íÁ±…å•È¡Ù¥ÉÑÕ…±%¤ü¹¹…µ”ñð€‰Á±…å•È‰ô¡…Ì‰••¸É…¹‘½µ±äÍ•±•Ñ•Ñ¼‰”Ñ¡”Ù¥ÉÑÕ…°Á±…å•ÈÑ¼Á…ÉÑ¹•È€‘íÁ±…å•È¡…™™•Ñ•‘%¤ü¹¹…µ”ñð€‰Ñ¡”Á±…å•ÈÝ¥Ñ Ñ¡”µ¥ÍÍ¥¹œÁ…ÉÑ¹•È‰ô¥¸…±°µÕ±Ñ¥Á±…å•È½µÁ•Ñ¥Ñ¥½¹Ì¹€ì(€€€½¹ÍÐÍ¡½ÑÌ€ô=‰©•Ð¹•¹ÑÉ¥•Ì¡¹ÑÁáÑÉ…A±…å•ÉÌñðíô¤¹µ…À ¡m¡½±”°¥‘t¤€ôø€‘íÁ±…å•È¡¥¤ü¹¹…µ”ñð€‰Á±…å•È‰ô¡…Ì‰••¸É…¹‘½µ±äÍ•±•Ñ•Ñ¼¡…Ù”€ÈÍ¡½ÑÌ½¸Ñ¡”9Q@¡½±”€‘í¡½±•ô¹€¤ì(€€€É•ÑÕÉ¸m‰…Í”°€¸¸¹Í¡½ÑÍt¹©½¥¸ ˆ€ˆ¤ì(€ô(€™Õ¹Ñ¥½¸½Á•¹5¥ÍÍ¥¹A±…å•ÉI•Á±…•µ•¹Ð¡‘…ä¤ì(€€€¥¹¥Ñ¥…±¥Í•É½ÕÁÌ ¤ì(€€€½¹ÍÐ­•ä€ô€‰‘…äˆ€¬‘…ä°Í•ÑÕÀ€ôÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÀü¹m­•åtì(€€€¥˜€ …Í•ÑÕÀñðÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌü¹m­•åt¤ì(€€€€€…±•ÉÐ¡ÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌü¹m­•åt€ü€‰¸•µ•É•¹äÉ•Á±…•µ•¹Ð¡…Ì…±É•…‘ä‰••¸…ÁÁ±¥•™½ÈÑ¡¥Ì‘…ä¸ˆ€è€‰Q¡”É½ÕÁÌ™½ÈÑ¡¥Ì‘…ä…É”¹½ÐÉ•…‘ä¸ˆ¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€½¹ÍÐ¥‘Ì€ô‘…å¥•±‘%‘Ì¡‘…ä¤¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤ì(€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰•µ•É•¹å!•…ˆøñÍµ…±°ù	=IA1dƒ
Üd€‘í‘…åôð½Íµ…±°øñ Èùµ•É•¹ä5¥ÍÍ¥¹œA±…å•Èð½ ÈøñÀùM•±•ÐÑ¡”Á±…å•ÈÝ¡¼¡…Ì¹½Ð…ÉÉ¥Ù•¸Q¡”¡…¹”É•µ…¥¹Ì…Ù…¥±…‰±”Õ¹Ñ¥°Ñ¡…ÐÁ±…å•ÈÌÉ½ÕÀÉ•½É‘Ì¥ÑÌ™¥ÉÍÐÍ½É”¸ð½Àøð½‘¥Øøñ±…‰•°±…ÍÌô‰•µ•É•¹åM•±•ÐˆùM•±•Ð5¥ÍÍ¥¹œA±…å•ÈñÍ•±•Ð¥ô‰µ¥ÍÍ¥¹A±…å•ÉM•±•Ðˆøñ½ÁÑ¥½¸Ù…±Õ”ôˆˆù¡½½Í”Á±…å•ËŠ˜ð½½ÁÑ¥½¸ø‘í¥‘Ì¹µ…À ¡¥¤€ôøì½¹ÍÐÉ½ÕÁ%¹‘•à€ôÍ•ÑÕÀ¹É½ÕÁÌ¹™¥¹‘%¹‘•à ¡œ¤€ôøœ¹µ…À¡MÑÉ¥¹œ¤¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡¥¤¤¤°ÍÑ…ÉÑ•€ôÉ½ÕÁ!…ÍM½É•¹ÑÉ¥•Ì¡‘…ä°É½ÕÁ%¹‘•à¤ìÉ•ÑÕÉ¸€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í•ÍŒ¡¥¥ôˆ€‘íÍÑ…ÉÑ•€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôø‘í•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ô‘íÍÑ…ÉÑ•€ü€ˆƒŠPÉ½ÕÀ…±É•…‘äÍ½É¥¹œˆ€è€ˆ‰ôð½½ÁÑ¥½¸ù€ìô¤¹©½¥¸ ˆˆ¥ôð½Í•±•Ðøð½±…‰•°øñ‘¥Ø¥ô‰µ¥ÍÍ¥¹A±…å•ÉAÉ•Ù¥•Üˆøð½‘¥Øøñ‘¥Ø±…ÍÌô‰•µ•É•¹åÑ¥½¹Ìˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰…¹•±5¥ÍÍ¥¹A±…å•Èˆù…¹•°ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰…ÁÁ±å5¥ÍÍ¥¹A±…å•Èˆ‘¥Í…‰±•ùÁÁ±äµ•É•¹äI•Á±…•µ•¹Ðð½‰ÕÑÑ½¸øð½‘¥Øù€ì(€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹…‘ ‰½Á•¸ˆ¤ì(€€€±•ÐÁÉ½Á½Í…°€ô¹Õ±°ì(€€€½¹ÍÐÁÉ½Á½Í”€ô€¡µ¥ÍÍ¥¹%¤€ôøì(€€€€€½¹ÍÐÉ½ÕÁ%¹‘•à€ôÍ•ÑÕÀ¹É½ÕÁÌ¹™¥¹‘%¹‘•à ¡œ¤€ôøœ¹µ…À¡MÑÉ¥¹œ¤¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡µ¥ÍÍ¥¹%¤¤¤°É½ÕÀ€ôÍ•ÑÕÀ¹É½ÕÁÍmÉ½ÕÁ%¹‘•átü¹µ…À¡MÑÉ¥¹œ¤ñðmt°µ¥ÍÍ¥¹%¹‘•à€ôÉ½ÕÀ¹¥¹‘•á=˜¡MÑÉ¥¹œ¡µ¥ÍÍ¥¹%¤¤°Á…¥ÉMÑ…ÉÐ€ôµ¥ÍÍ¥¹%¹‘•à€ð€È€ü€À€è€È°…™™•Ñ•‘%€ôÉ½ÕÀ¹Í±¥”¡Á…¥ÉMÑ…ÉÐ°Á…¥ÉMÑ…ÉÐ€¬€È¤¹™¥¹ ¡¥¤€ôø¥€„ôôMÑÉ¥¹œ¡µ¥ÍÍ¥¹%¤¤°É•…±%¹É½ÕÀ€ôÉ½ÕÀ¹™¥±Ñ•È ¡¥¤€ôø¥€„ôôMÑÉ¥¹œ¡µ¥ÍÍ¥¹%¤€˜˜¥€„ôô9=}AIQ9I}%¤°…É•…Ñ•A…ÉÑ¹•È€ô…É•…Ñ•A…ÈÍA…ÉÑ¹•È¡µ¥ÍÍ¥¹%±‘…ä¤°…¹‘¥‘…Ñ•Ì€ô¥‘Ì¹™¥±Ñ•È ¡¥¤€ôø€…É½ÕÀ¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡¥¤¤€˜˜MÑÉ¥¹œ¡¥¤€„ôôMÑÉ¥¹œ¡µ¥ÍÍ¥¹%¤€˜˜MÑÉ¥¹œ¡¥¤€„ôô…É•…Ñ•A…ÉÑ¹•È€˜˜€…=‰©•Ð¹Ù…±Õ•Ì¡Í•ÑÕÀ¹Í¡½ÉÑQ•…µÍññíô¤¹Í½µ”¡„ôùMÑÉ¥¹œ¡„¹Ù¥ÉÑÕ…±A±…å•È¤ôôõMÑÉ¥¹œ¡¥¤¤¤°Ù¥ÉÑÕ…±%€ô¡½½Í•I…¹‘½´¡…¹‘¥‘…Ñ•Ì¤°¹ÑÁáÑÉ…A±…å•ÉÌ€ôíôì(€€€€€¥˜€¡É½ÕÁ%¹‘•à€ð€ÀñðÉ½ÕÁ!…ÍM½É•¹ÑÉ¥•Ì¡‘…ä°É½ÕÁ%¹‘•à¤ñð€……™™•Ñ•‘%ñð€…Ù¥ÉÑÕ…±%ñðÉ•…±%¹É½ÕÀ¹±•¹Ñ €„ôô€Ì¤É•ÑÕÉ¸¹Õ±°ì(€€€€€½¹ÍÐÍ¡Õ™™±•€ôÍ¡Õ™™±•½Áä¡É•…±%¹É½ÕÀ¤ì(€€€€€¹ÑÁ!½±•Í%¹A±…å¥¹=É‘•È¡‘…ä¤¹™½É…  ¡¡½±”°¤¤€ôø¹ÑÁáÑÉ…A±…å•ÉÍmMÑÉ¥¹œ¡¡½±”¥t€ôÍ¡Õ™™±•‘m¤€”Í¡Õ™™±•¹±•¹Ñ¡t¤ì(€€€€€É•ÑÕÉ¸ìµ¥ÍÍ¥¹%èMÑÉ¥¹œ¡µ¥ÍÍ¥¹%¤°É½ÕÁ%¹‘•à°µ¥ÍÍ¥¹%¹‘•à°…™™•Ñ•‘%èMÑÉ¥¹œ¡…™™•Ñ•‘%¤°Ù¥ÉÑÕ…±%èMÑÉ¥¹œ¡Ù¥ÉÑÕ…±%¤°¹ÑÁáÑÉ…A±…å•ÉÌôì(€€€ôì(€€€€ ˆµ¥ÍÍ¥¹A±…å•ÉM•±•Ðˆ¤¹½¹¡…¹”€ô€¡”¤€ôøì(€€€€€ÁÉ½Á½Í…°€ôÁÉ½Á½Í”¡”¹Ñ…É•Ð¹Ù…±Õ”¤ì€ ˆ…ÁÁ±å5¥ÍÍ¥¹A±…å•Èˆ¤¹‘¥Í…‰±•€ô€…ÁÉ½Á½Í…°ì(€€€€€€ ˆµ¥ÍÍ¥¹A±…å•ÉAÉ•Ù¥•Üˆ¤¹¥¹¹•É!Q50€ôÁÉ½Á½Í…°(€€€€€€€€ü€ñ‘¥Ø±…ÍÌô‰•µ•É•¹å]…É¹¥¹œˆøñˆø‘í•ÍŒ¡Á±…å•È¡ÁÉ½Á½Í…°¹µ¥ÍÍ¥¹%¤ü¹¹…µ”¥ôÝ¥±°‰”É•µ½Ù•™É½´Ñ½‘…çŠeÌ‘É…Ü¸ð½ˆøñÍÁ…¸ø‘í•ÍŒ¡Á±…å•È¡ÁÉ½Á½Í…°¹Ù¥ÉÑÕ…±%¤ü¹¹…µ”¥ôÝ¥±°‰”Ñ¡”±½­•Ù¥ÉÑÕ…°Á±…å•È™½È€‘í•ÍŒ¡Á±…å•È¡ÁÉ½Á½Í…°¹…™™•Ñ•‘%¤ü¹¹…µ”¥ô¸Q¡”É•µ…¥¹¥¹œÑ¡É•”Á±…å•ÉÌÝ¥±°µ…É¬•… ½Ñ¡•È¸ð½ÍÁ…¸ø‘í=‰©•Ð¹•¹ÑÉ¥•Ì¡ÁÉ½Á½Í…°¹¹ÑÁáÑÉ…A±…å•ÉÌ¤¹µ…À ¡m¡½±”°¥‘t¤€ôø€ñÍÁ…¸ù!½±”€‘í¡½±•ô9Q@•áÑÉ„…ÑÑ•µÁÐè€‘í•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ”¥ôð½ÍÁ…¸ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øù€(€€€€€€€€è”¹Ñ…É•Ð¹Ù…±Õ”(€€€€€€€€€€ü€œñ‘¥Ø±…ÍÌô‰•µ•É•¹å]…É¹¥¹œˆøñˆù9¼•µ•É•¹äÉ•Á±…•µ•¹Ð¥Ì…Ù…¥±…‰±”¸ð½ˆøñÍÁ…¸ù¸•µ•É•¹äÉ•Á±…•µ•¹ÐÉ•ÅÕ¥É•Ì„™½ÕÈµÁ±…å•ÈÑ•…´Ñ¡…Ð¡…Ì¹½ÐÍÑ…ÉÑ•Í½É¥¹œ…¹…¸Õ¹ÕÍ••±¥¥‰±”Y¥ÉÑÕ…°A±…å•È½ÕÑÍ¥‘”Ñ¡…ÐÑ•…´¸ð½ÍÁ…¸øð½‘¥Øøœ(€€€€€€€€€€è€ˆˆì(€€€ôì(€€€€ ˆ…¹•±5¥ÍÍ¥¹A±…å•Èˆ¤¹½¹±¥¬€ô€ ¤€ôø€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€€€€ ˆ…ÁÁ±å5¥ÍÍ¥¹A±…å•Èˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€¥˜€ …ÁÉ½Á½Í…°ñð€…½¹™¥É´¡ÁÁ±äÑ¡”•µ•É•¹äÉ•Á±…•µ•¹Ð™½È€‘íÁ±…å•È¡ÁÉ½Á½Í…°¹µ¥ÍÍ¥¹%¤ü¹¹…µ•ôý€¤¤É•ÑÕÉ¸ì(€€€€€¥˜€¡É½ÕÁ!…ÍM½É•¹ÑÉ¥•Ì¡‘…ä°ÁÉ½Á½Í…°¹É½ÕÁ%¹‘•à¤¤ì(€€€€€€€…±•ÉÐ ‰Q¡¥ÌÉ½ÕÀ¡…Ì¹½Ü‰•Õ¸Í½É¥¹œ°Í¼¥ÑÌÁ±…å•È…ÉÉ…¹•µ•¹Ð…¸¹¼±½¹•È‰”¡…¹•¸ˆ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€Í•ÑÕÀ¹É½ÕÁÍmÁÉ½Á½Í…°¹É½ÕÁ%¹‘•áumÁÉ½Á½Í…°¹µ¥ÍÍ¥¹%¹‘•át€ô9=}AIQ9I}%ì(€€€€€=‰©•Ð¹…ÍÍ¥¸¡Í•ÑÕÀ°ìµ¥ÍÍ¥¹A±…å•É%èÁÉ½Á½Í…°¹µ¥ÍÍ¥¹%°Ù¥ÉÑÕ…±A±…å•ÈèÁÉ½Á½Í…°¹Ù¥ÉÑÕ…±%°¹ÑÁáÑÉ…A±…å•ÉÌèÁÉ½Á½Í…°¹¹ÑÁáÑÉ…A±…å•ÉÌô¤ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌ€ôÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌñðíôì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÍm­•åt€ôìµ¥ÍÍ¥¹A±…å•É%èÁÉ½Á½Í…°¹µ¥ÍÍ¥¹%°Ù¥ÉÑÕ…±A±…å•É%èÁÉ½Á½Í…°¹Ù¥ÉÑÕ…±%°…™™•Ñ•‘A±…å•É%èÁÉ½Á½Í…°¹…™™•Ñ•‘%°É½ÕÁ%¹‘•àèÁÉ½Á½Í…°¹É½ÕÁ%¹‘•à°¹ÑÁáÑÉ…A±…å•ÉÌèÁÉ½Á½Í…°¹¹ÑÁáÑÉ…A±…å•ÉÌ°…ÁÁ±¥•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°ÉÕ±•Q•áÐè•µ•É•¹åIÕ±•Q•áÐ¡‘…ä°ÁÉ½Á½Í…°¹Ù¥ÉÑÕ…±%°ÁÉ½Á½Í…°¹…™™•Ñ•‘%°ÁÉ½Á½Í…°¹¹ÑÁáÑÉ…A±…å•ÉÌ¤ôì(€€€€€•¹ÍÕÉ•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡Í•ÑÕÀ±‘…ä¤ì(€€€€€Á•ÉÍ¥ÍÑMÑ½É” ¤ì(€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ìÉ•¹‘•É!½µ” ¤ìÉ•¹‘•ÉQ•…µÍA…” ¤ìÉ•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€ôì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±…åMÑ½É”¡‘…ä°É•…Ñ”€ôÑÉÕ”¤ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ð¤É•ÑÕÉ¸¹Õ±°ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ð¹µ…¹Õ…±M½É•…É‘Ì€˜˜É•…Ñ”¤(€€€€€ÍÑ½É”¹•Ù•¹Ð¹µ…¹Õ…±M½É•…É‘Ì€ôíôì(€€€½¹ÍÐÉ½½Ð€ôÍÑ½É”¹•Ù•¹Ð¹µ…¹Õ…±M½É•…É‘Ìì(€€€¥˜€ …É½½Ð¤É•ÑÕÉ¸¹Õ±°ì(€€€½¹ÍÐ­•ä€ô€‰‘…äˆ€¬‘…äì(€€€¥˜€ …É½½Ñm­•åt€˜˜É•…Ñ”¤(€€€€€É½½Ñm­•åt€ôìÉ½ÕÁÌèíô°¹ÑÀèíô°ÍÑ…ÑÕÌè€‰‘É…™Ðˆôì(€€€É•ÑÕÉ¸É½½Ñm­•åtñð¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±…å¥¹…±¥Í•¡‘…ä¤ì(€€€½¹ÍÐ‘…åMÑ½É”€ôµ…¹Õ…±…åMÑ½É”¡‘…ä°™…±Í”¤ì(€€€É•ÑÕÉ¸	½½±•…¸¡‘…åMÑ½É”ü¹ÍÑ…ÑÕÌ€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆ€˜˜‘…åMÑ½É”ü¹½µÁ±•Ñ•‘Ð¤ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±É½ÕÁ…É¡‘…ä°É½ÕÁ%¹‘•à°É•…Ñ”€ôÑÉÕ”¤ì(€€€½¹ÍÐ‘…åMÑ½É”€ôµ…¹Õ…±…åMÑ½É”¡‘…ä°É•…Ñ”¤ì(€€€¥˜€ …‘…åMÑ½É”¤É•ÑÕÉ¸¹Õ±°ì(€€€‘…åMÑ½É”¹É½ÕÁÌ€ô‘…åMÑ½É”¹É½ÕÁÌñðíôì(€€€½¹ÍÐ­•ä€ôMÑÉ¥¹œ¡É½ÕÁ%¹‘•à¤ì(€€€¥˜€ …‘…åMÑ½É”¹É½ÕÁÍm­•åt€˜˜É•…Ñ”¤ì(€€€€€½¹ÍÐÍ•ÑÕÀ€ôÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬‘…åt°(€€€€€€€¥‘Ì€ô€¡Í•ÑÕÀü¹É½ÕÁÌü¹mÉ½ÕÁ%¹‘•átñðmt¤(€€€€€€€€€€¹µ…À ¡¥¤€ôø(€€€€€€€€€€€MÑÉ¥¹œ¡¥¤€ôôô9=}AIQ9I}%(€€€€€€€€€€€€€€üMÑÉ¥¹œ¡Í•ÑÕÁ½ÉQ•…´¡Í•ÑÕÀ±É½ÕÁ%¹‘•à¤ü¹Ù¥ÉÑÕ…±A±…å•Èñð€ˆˆ¤(€€€€€€€€€€€€€€èMÑÉ¥¹œ¡¥¤°(€€€€€€€€€€¤(€€€€€€€€€€¹™¥±Ñ•È¡	½½±•…¸¤ì(€€€€€‘…åMÑ½É”¹É½ÕÁÍm­•åt€ôì(€€€€€€€ÍÑ…ÑÕÌè€‰‘É…™Ðˆ°(€€€€€€€Í½ÕÉ”è€‰Á…Á•ÈµÑ•…´µ…Éˆ°(€€€€€€€Á±…å•É%‘Ìè¥‘Ì°(€€€€€€€Á±…å•ÉÌèíô°(€€€€€€€Á…¥ÉÌèíô°(€€€€€€€Ñ•…´èíô°(€€€€€€€ÕÁ‘…Ñ•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€ôì(€€€ô(€€€É•ÑÕÉ¸‘…åMÑ½É”¹É½ÕÁÍm­•åtñð¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸ÍÕ‰µ¥ÑÑ•‘5…¹Õ…±…É¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€½¹ÍÐ…É€ôµ…¹Õ…±É½ÕÁ…É¡‘…ä°É½ÕÁ%¹‘•à°™…±Í”¤ì(€€€É•ÑÕÉ¸…Éü¹ÍÑ…ÑÕÌ€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆ€ü…É€è¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±…É‘½ÉA±…å•È¡‘…ä°Á±…å•É%¤ì(€€€½¹ÍÐÑà€ôÁ±…å•ÉÉ½ÕÁ½¹Ñ•áÐ¡MÑÉ¥¹œ¡Á±…å•É%¤°‘…ä¤ì(€€€É•ÑÕÉ¸Ñà€üÍÕ‰µ¥ÑÑ•‘5…¹Õ…±…É¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤€è¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±Y…±Õ”¡½‰©•Ð°Á…Ñ °™…±±‰…¬€ô€ˆˆ¤ì(€€€±•ÐÙ…±Õ”€ô½‰©•Ðì(€€€™½È€¡½¹ÍÐ­•ä½˜Á…Ñ ¹ÍÁ±¥Ð ˆ¸ˆ¤¤ì(€€€€€¥˜€¡Ù…±Õ”€ôô¹Õ±°¤É•ÑÕÉ¸™…±±‰…¬ì(€€€€€Ù…±Õ”€ôÙ…±Õ•m­•åtì(€€€ô(€€€É•ÑÕÉ¸Ù…±Õ”€ôô¹Õ±°€ü™…±±‰…¬€èÙ…±Õ”ì(€ô(€™Õ¹Ñ¥½¸Í•Ñ5…¹Õ…±Y…±Õ”¡½‰©•Ð°Á…Ñ °Ù…±Õ”¤ì(€€€½¹ÍÐ­•åÌ€ôÁ…Ñ ¹ÍÁ±¥Ð ˆ¸ˆ¤ì(€€€±•ÐÑ…É•Ð€ô½‰©•Ðì(€€€­•åÌ¹Í±¥” À°€´Ä¤¹™½É…  ¡­•ä¤€ôøì(€€€€€Ñ…É•Ñm­•åt€ôÑ…É•Ñm­•åtñðíôì(€€€€€Ñ…É•Ð€ôÑ…É•Ñm­•åtì(€€€ô¤ì(€€€Ñ…É•Ñm­•åÍm­•åÌ¹±•¹Ñ €´€Åut€ôÙ…±Õ”ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±MÕµµ…Éå¥•±‘Ì¡ÁÉ•™¥à°Ù…±Õ•Ì€ôíô°É•ÅÕ¥É•€ôÑÉÕ”¤ì(€€€½¹ÍÐ™¥•±€ô€¡­•ä°±…‰•°°ÍÌ€ô€ˆˆ¤€ôø(€€€€€€ñ±…‰•°±…ÍÌôˆ‘íÍÍôˆøñÍÁ…¸ø‘í±…‰•±ôð½ÍÁ…¸øñ¥¹ÁÕÐ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥ŒˆÁ…ÑÑ•É¸ô‰lÀ´åt¨ˆ‘…Ñ„µµ…¹Õ…°ôˆ‘í•ÍŒ¡ÁÉ•™¥à€¬€ˆ¸ˆ€¬­•ä¥ôˆ€‘íÉ•ÅÕ¥É•€˜˜­•ä€ôôô€‰Ñ½Ñ…°ˆ€ü€‰‘…Ñ„µÉ•ÅÕ¥É•ˆ€è€ˆ‰ôÙ…±Õ”ôˆ‘í•ÍŒ¡Ù…±Õ•Ím­•åt€üü€ˆˆ¥ôˆøð½±…‰•°ù€ì(€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰µ…¹Õ…±MÕµµ…Éå¥•±‘Ìˆø‘í™¥•± ‰Ñ½Ñ…°ˆ°€‰Q½Ñ…°ˆ°€‰µ…¹Õ…±Q½Ñ…°ˆ¥ô‘í™¥•± ‰‰…¬äˆ°€‰	…¬€äˆ¥ô‘í™¥•± ‰±…ÍÐØˆ°€‰1…ÍÐ€Øˆ¥ô‘í™¥•± ‰±…ÍÐÌˆ°€‰1…ÍÐ€Ìˆ¥ôð½‘¥Øù€ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±M•±•Ñ•‘½µÁ•Ñ¥Ñ¥½¹Ì¡‘…ä€ôÍÑ½É”¹•Ù•¹Ðü¹±¥Ù•½¹ÑÉ½±…äñð€Ä¤ì(€€€É•ÑÕÉ¸¹•ÜM•Ð ¡ÍÑ½É”¹•Ù•¹Ðü¹½µÁ•Ñ¥Ñ¥½¹Ìñðmt¤¹™¥±Ñ•È¡¥ôù½µÁ•Ñ¥Ñ¥½¹%Í=¸¡¥±‘…ä¤¤¤ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±A…ÈÍ!½±•Ì¡‘…ä°¥€ô¹Õ±°¤ì(€€€½¹ÍÐ¥‘Ìõ¥ôõ¹Õ±°ý‘…å¥•±‘%‘Ì¡‘…ä¤¹™¥±Ñ•È¡àôùMÑÉ¥¹œ¡à¤„ôõ9=}AIQ9I}%¤ém¥‘tì(€€€½¹ÍÐ…É‘Ìõ¥‘Ì¹±•¹Ñ ý¥‘Ì¹µ…À¡Á¥ôù•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Á¥¤¤ém•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä¥tì(€€€É•ÑÕÉ¸ÉÉ…ä¹™É½´¡í±•¹Ñ èÄáô°¡|±¤¤ôù¤¬Ä¤¹™¥±Ñ•È¡¡½±”ôù…É‘Ì¹Í½µ”¡Øôø­Ø¹Á…Èü¹m¡½±”´ÅtôôôÌ¤¤ì(€ô((€™Õ¹Ñ¥½¸µ…¹Õ…±A±…å•ÉMÕµµ…Éä¡‘…ä°Á±…å•É%°ÑåÁ”¤ì(€€€½¹ÍÐ…É€ôµ…¹Õ…±…É‘½ÉA±…å•È¡‘…ä°Á±…å•É%¤ì(€€€É•ÑÕÉ¸…Éü¹Á±…å•ÉÌü¹mMÑÉ¥¹œ¡Á±…å•É%¥tü¹mÑåÁ•tñð¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±A…ÈÍA½¥¹Ð¡‘…ä°Á±…å•É%°¡½±”¤ì(€€€½¹ÍÐÉ½ÍÌ€ôµ…¹Õ…±…É‘½ÉA±…å•È¡‘…ä°Á±…å•É%¤ü¹Á±…å•ÉÌü¹l(€€€€€€€MÑÉ¥¹œ¡Á±…å•É%¤(€€€€€tü¹Á…ÈÌü¹mMÑÉ¥¹œ¡¡½±”¥tì(€€€¥˜€¡É½ÍÌ€ôôô€ˆˆñðÉ½ÍÌ€ôô¹Õ±°¤É•ÑÕÉ¸¹Õ±°ì(€€€½¹ÍÐØ€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Á±…å•É%¤ì(€€€¥˜ ­Ø¹Á…Èü¹m¡½±”´Åt„ôôÌ¥É•ÑÕÉ¸€Àì(€€€É•ÑÕÉ¸ÍÑ…‰±•™½É‘A½¥¹ÑÌ (€€€€€É½ÍÌ°(€€€€€€¬¡Ø¹Á…Èü¹m¡½±”€´€Åtñð€À¤°(€€€€€Ø¹¥¹‘•àü¹m¡½±”€´€Åt€üü€ˆˆ°(€€€€€Á±…å•É…¥±å!…¹‘¥…À¡Á±…å•É%°‘…ä¤°(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±A…¥ÉMÕµµ…Éä¡‘…ä°Õ¹¥Ñ%°ÑåÁ”€ô€‰™½ÕÉ‰…±°ˆ¤ì(€€€½¹ÍÐµ…Ñ €ôMÑÉ¥¹œ¡Õ¹¥Ñ%¤¹µ…Ñ  ½y‘q­œ¡q¬¥À¡q¬¤¼¤ì(€€€¥˜€ …µ…Ñ ¤É•ÑÕÉ¸¹Õ±°ì(€€€½¹ÍÐ…É€ôÍÕ‰µ¥ÑÑ•‘5…¹Õ…±…É¡‘…ä°€­µ…Ñ¡lÅt¤ì(€€€É•ÑÕÉ¸…Éü¹Á…¥ÉÌü¹l‰Àˆ€¬µ…Ñ¡lÉutü¹mÑåÁ•tñð¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±Q•…µMÕµµ…Éä¡‘…ä°Õ¹¥Ñ%°ÑåÁ”¤ì(€€€½¹ÍÐµ…Ñ €ôMÑÉ¥¹œ¡Õ¹¥Ñ%¤¹µ…Ñ  ½y‘q­œ¡q¬¤¼¤ì(€€€¥˜€ …µ…Ñ ¤É•ÑÕÉ¸¹Õ±°ì(€€€É•ÑÕÉ¸ÍÕ‰µ¥ÑÑ•‘5…¹Õ…±…É¡‘…ä°€­µ…Ñ¡lÅt¤ü¹Ñ•…´ü¹mÑåÁ•tñð¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±Q•…µ!…ÍA¡½¹•M½É•Ì¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€É•ÑÕÉ¸	½½±•…¸¡É½ÕÁ!…ÍM½É•¹ÑÉ¥•Ì¡‘…ä°É½ÕÁ%¹‘•à¤¤ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±I•ÅÕ¥É•µ•¹ÑÌ¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€½¹ÍÐ½µÁÌ€ôµ…¹Õ…±M•±•Ñ•‘½µÁ•Ñ¥Ñ¥½¹Ì¡‘…ä¤°(€€€€€Í•ÑÕÀ€ôÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬‘…åt°(€€€€€É…Ü€ôÍ•ÑÕÀü¹É½ÕÁÌü¹mÉ½ÕÁ%¹‘•átñðmt°(€€€€€Ù¥ÉÑÕ…±%€ôÉ…Ü¹Í½µ” ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€ôôô9=}AIQ9I}%¤(€€€€€€€€üMÑÉ¥¹œ¡Í•ÑÕÁ½ÉQ•…´¡Í•ÑÕÀ±É½ÕÁ%¹‘•à¤ü¹Ù¥ÉÑÕ…±A±…å•Èñð€ˆˆ¤(€€€€€€€€è€ˆˆ°(€€€€€¥‘Ì€ôÉ…Ü(€€€€€€€€¹µ…À ¡¥¤€ôø(€€€€€€€€€MÑÉ¥¹œ¡¥¤€ôôô9=}AIQ9I}%€üÙ¥ÉÑÕ…±%€èMÑÉ¥¹œ¡¥¤°(€€€€€€€€¤(€€€€€€€€¹™¥±Ñ•È¡	½½±•…¸¤ì(€€€É•ÑÕÉ¸ì(€€€€€¥‘Ì°(€€€€€Ù¥ÉÑÕ…±%°(€€€€€Í¡½ÉÑQ•…´è	½½±•…¸¡Ù¥ÉÑÕ…±%¤°(€€€€€Í¥¹±”è½µÁÌ¹¡…Ì ‰Í¥¹±”ˆ¤ñð½µÁÌ¹¡…Ì ‰½µ‰¥¹•ˆ¤ñð½µÁÌ¹¡…Ì ‰…ÁQ•…µÌˆ¤°(€€€€€™½ÕÉ‰…±°è½µÁÌ¹¡…Ì ‰™½ÕÉ‰…±°ˆ¤°(€€€€€‰•ÍÐÌè½µÁÌ¹¡…Ì ‰‰•ÍÐÍ½˜Ðˆ¤°(€€€€€ÁÕÑÑ¥¹œè½µÁÌ¹¡…Ì ‰Ñ•…µAÕÑÑÌˆ¤°(€€€€€ÁÕÑÑ¥¹A…¥ÉÌèÍÑ½É”¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€ôôô€‰Á…¥ÉÌˆ°(€€€€€Á…ÈÌè½µÁÌ¹¡…Ì ‰Á…ÈÌˆ¤°(€€€€€¹ÑÀè½µÁÌ¹¡…Ì ‰¹ÑÀˆ¤°(€€€€€å•±±½Ý	…±°èå•±±½Ý	…±±%Í=¸¡‘…ä¤°(€€€ôì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±…±Õ±…Ñ•‘MÕµµ…Éä¡Ù…±Õ•Ì¤ì(€€€½¹ÍÐÍÕ´€ô€¡¥Ñ•µÌ¤€ôø(€€€€€¥Ñ•µÌ¹É•‘Õ” ¡Ñ½Ñ…°°Ù…±Õ”¤€ôøÑ½Ñ…°€¬€¡Ù…±Õ”€ôô¹Õ±°€ü€À€è€­Ù…±Õ”ñð€À¤°€À¤ì(€€€É•ÑÕÉ¸ì(€€€€€Ñ½Ñ…°èMÑÉ¥¹œ¡ÍÕ´¡Ù…±Õ•Ì¤¤°(€€€€€‰…¬äèMÑÉ¥¹œ¡ÍÕ´¡Ù…±Õ•Ì¹Í±¥” ä°€Äà¤¤¤°(€€€€€±…ÍÐØèMÑÉ¥¹œ¡ÍÕ´¡Ù…±Õ•Ì¹Í±¥” ÄÈ°€Äà¤¤¤°(€€€€€±…ÍÐÌèMÑÉ¥¹œ¡ÍÕ´¡Ù…±Õ•Ì¹Í±¥” ÄÔ°€Äà¤¤¤°(€€€ôì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±e•±±½Ý	…±±1½ÍÌ¡‘…ä°É½ÕÁ%¹‘•à°É•ÍÕ±Ð¤ì(€€€¥˜€ …É•ÍÕ±Ðñð€…É•ÍÕ±Ð¹±½ÍÍ!½±”ñðÉ•ÍÕ±Ð¹±½ÍÍ!½±”€ôôô€‰9=9ˆ¤É•ÑÕÉ¸¹Õ±°ì(€€€½¹ÍÐ¡½±”€ô€­É•ÍÕ±Ð¹±½ÍÍ!½±”ì(€€€½¹ÍÐÁ½Í¥Ñ¥½¸€ôÍ½É•M•ÅÕ•¹”¡É½ÕÁMÑ…ÉÑ¥¹!½±”¡ÍÑ½É”¹•Ù•¹Ð°‘…ä°É½ÕÁ%¹‘•à¤¤¹¥¹‘•á=˜¡¡½±”¤ì(€€€É•ÑÕÉ¸Á½Í¥Ñ¥½¸€ð€À€ü¹Õ±°€èí¡½±”°Á½Í¥Ñ¥½¸°Á±…å•É%èå•±±½Ý	…±±A±…å•É½É!½±”¡‘…ä°É½ÕÁ%¹‘•à°¡½±”¤°Í½ÕÉ”è€‰Á…Á•ÈµÑ•…´µ…É‰ôì(€ô(€™Õ¹Ñ¥½¸‘•É¥Ù•5…¹Õ…±e•±±½Ý	…±°¡‘…ä°É½ÕÁ%¹‘•à°…É°Á½¥¹ÑÌ¤ì(€€€½¹ÍÐÉ•ÍÕ±Ð€ô…É¹Ñ•…´¹å•±±½Ý	…±°ì(€€€¥˜€ …É•ÍÕ±Ðü¹±½ÍÍ!½±”¤É•ÑÕÉ¸ì(€€€½¹ÍÐÍ•ÅÕ•¹”€ôÍ½É•M•ÅÕ•¹”¡É½ÕÁMÑ…ÉÑ¥¹!½±”¡ÍÑ½É”¹•Ù•¹Ð°‘…ä°É½ÕÁ%¹‘•à¤¤ì(€€€½¹ÍÐ±½ÍÌ€ôµ…¹Õ…±e•±±½Ý	…±±1½ÍÌ¡‘…ä°É½ÕÁ%¹‘•à°É•ÍÕ±Ð¤ì(€€€½¹ÍÐ½Õ¹Ñ¥¹œ€ôÍ•ÅÕ•¹”¹Í±¥” À°±½ÍÌ€ü±½ÍÌ¹Á½Í¥Ñ¥½¸€èÍ•ÅÕ•¹”¹±•¹Ñ ¤ì(€€€½¹ÍÐÙ…±Õ•Ì€ô½Õ¹Ñ¥¹œ¹µ…À¡¡½±”€ôøÁ½¥¹ÑÍmå•±±½Ý	…±±A±…å•É½É!½±”¡‘…ä°É½ÕÁ%¹‘•à°¡½±”¥tü¹m¡½±”€´€Åt¤ì(€€€É•ÍÕ±Ð¹Ñ½Ñ…°€ôÙ…±Õ•Ì¹•Ù•Éä¡Ù…±Õ”€ôøÙ…±Õ”€„ô¹Õ±°¤€üMÑÉ¥¹œ¡Ù…±Õ•Ì¹É•‘Õ” ¡ÍÕ´°Ù…±Õ”¤€ôøÍÕ´€¬Ù…±Õ”°€À¤¤€è€ˆˆì(€ô(€™Õ¹Ñ¥½¸‘•É¥Ù•5…¹Õ…±Õ±±…É‘Ì¡‘…ä°É½ÕÁ%¹‘•à°…É°É•Ä¤ì(€€€¥˜€ ……É¹™Õ±±…É‘Í=Á•¸¤É•ÑÕÉ¸ì(€€€½¹ÍÐÁ½¥¹ÑÌ€ôíôì(€€€É•Ä¹¥‘Ì¹™½É…  ¡¥¤€ôøì(€€€€€½¹ÍÐÉ½ÍÌ€ô…É¹Á±…å•ÉÌü¹m¥‘tü¹™Õ±±É½ÍÌñðíô±Øõ•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±¥¤ì(€€€€€Á½¥¹ÑÍm¥‘t€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôøì(€€€€€€€½¹ÍÐÙ…±Õ”€ôÉ½ÍÍmMÑÉ¥¹œ¡¥¹‘•à€¬€Ä¥tì(€€€€€€€É•ÑÕÉ¸Ù…±Õ”€ôôô€ˆˆñðÙ…±Õ”€ôô¹Õ±°(€€€€€€€€€€ü¹Õ±°(€€€€€€€€€€èÍÑ…‰±•™½É‘A½¥¹ÑÌ (€€€€€€€€€€€€€Ù…±Õ”°(€€€€€€€€€€€€€€¬¡Ø¹Á…Èü¹m¥¹‘•átñð€À¤°(€€€€€€€€€€€€€Ø¹¥¹‘•àü¹m¥¹‘•át€üü€ˆˆ°(€€€€€€€€€€€€€Á±…å•É…¥±å!…¹‘¥…À¡¥°‘…ä¤°(€€€€€€€€€€€€¤ì(€€€€€ô¤ì(€€€€€Í•Ñ5…¹Õ…±Y…±Õ”¡…É°Á±…å•ÉÌ¸‘í¥‘ô¹Í¥¹±•€°µ…¹Õ…±…±Õ±…Ñ•‘MÕµµ…Éä¡Á½¥¹ÑÍm¥‘t¤¤ì(€€€€€µ…¹Õ…±A…ÈÍ!½±•Ì¡‘…ä¤¹™½É…  ¡¡½±”¤€ôøì(€€€€€€€½¹ÍÐÙ…±Õ”€ôÉ½ÍÍmMÑÉ¥¹œ¡¡½±”¥tì(€€€€€€€Í•Ñ5…¹Õ…±Y…±Õ” (€€€€€€€€€…É°(€€€€€€€€€Á±…å•ÉÌ¸‘í¥‘ô¹Á…ÈÌ¸‘í¡½±•õ€°(€€€€€€€€€Ù…±Õ”€ôôô€ˆˆñðÙ…±Õ”€ôô¹Õ±°€ü€ˆˆ€èÙ…±Õ”°(€€€€€€€€¤ì(€€€€€ô¤ì(€€€€€½¹ÍÐÁÕÑÑÌ€ô…É¹Á±…å•ÉÌü¹m¥‘tü¹™Õ±±AÕÑÑÍQ½Ñ…°ì(€€€€€¥˜€¡ÁÕÑÑÌ€„ôô€ˆˆ€˜˜ÁÕÑÑÌ€„ô¹Õ±°¤(€€€€€€€Í•Ñ5…¹Õ…±Y…±Õ”¡…É°Á±…å•ÉÌ¸‘í¥‘ô¹ÁÕÑÑÌ¹Ñ½Ñ…±€°MÑÉ¥¹œ ­ÁÕÑÑÌñð€À¤¤ì(€€€ô¤ì(€€€¥˜€¡É•Ä¹å•±±½Ý	…±°¤‘•É¥Ù•5…¹Õ…±e•±±½Ý	…±°¡‘…ä°É½ÕÁ%¹‘•à°…É°Á½¥¹ÑÌ¤ì(€€€mÉ•Ä¹¥‘Ì¹Í±¥” À°€È¤°É•Ä¹¥‘Ì¹Í±¥” È°€Ð¥t¹™½É…  ¡¥‘Ì°Á…¥É%¹‘•à¤€ôøì(€€€€€½¹ÍÐÁ…¥ÉA½¥¹ÑÌ€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôøì(€€€€€€€½¹ÍÐÙ…±Õ•Ì€ô¥‘Ì¹µ…À ¡¥¤€ôøÁ½¥¹ÑÍm¥‘tü¹m¥¹‘•át¤ì(€€€€€€€É•ÑÕÉ¸Ù…±Õ•Ì¹•Ù•Éä ¡Ù…±Õ”¤€ôøÙ…±Õ”€„ô¹Õ±°¤(€€€€€€€€€€ü5…Ñ ¹µ…à ¸¸¹Ù…±Õ•Ì¤(€€€€€€€€€€è¹Õ±°ì(€€€€€ô¤ì(€€€€€Í•Ñ5…¹Õ…±Y…±Õ” (€€€€€€€…É°(€€€€€€€Á…¥ÉÌ¹À‘íÁ…¥É%¹‘•áô¹™½ÕÉ‰…±±€°(€€€€€€€µ…¹Õ…±…±Õ±…Ñ•‘MÕµµ…Éä¡Á…¥ÉA½¥¹ÑÌ¤°(€€€€€€¤ì(€€€ô¤ì(€€€½¹ÍÐ‰•ÍÐÌ€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôøì(€€€€€½¹ÍÐÙ…±Õ•Ì€ôÉ•Ä¹¥‘Ì¹µ…À ¡¥¤€ôøÁ½¥¹ÑÍm¥‘tü¹m¥¹‘•át¤ì(€€€€€¥˜€ …Ù…±Õ•Ì¹•Ù•Éä ¡Ù…±Õ”¤€ôøÙ…±Õ”€„ô¹Õ±°¤¤É•ÑÕÉ¸¹Õ±°ì(€€€€€É•ÑÕÉ¸Ù…±Õ•Ì¹Í½ÉÐ ¡„°ˆ¤€ôøˆ€´„¤¹Í±¥” À°€Ì¤¹É•‘Õ” ¡¸°Ù…±Õ”¤€ôø¸€¬Ù…±Õ”°€À¤ì(€€€ô¤ì(€€€Í•Ñ5…¹Õ…±Y…±Õ”¡…É°€‰Ñ•…´¹‰•ÍÐÌˆ°µ…¹Õ…±…±Õ±…Ñ•‘MÕµµ…Éä¡‰•ÍÐÌ¤¤ì(€€€½¹ÍÐÁÕÑÑY…±Õ•Ì€ôÉ•Ä¹¥‘Ì¹µ…À (€€€€€€¡¥¤€ôø…É¹Á±…å•ÉÌü¹m¥‘tü¹™Õ±±AÕÑÑÍQ½Ñ…°°(€€€€¤ì(€€€¥˜€¡ÁÕÑÑY…±Õ•Ì¹Í½µ” ¡Ù…±Õ”¤€ôøÙ…±Õ”€„ôô€ˆˆ€˜˜Ù…±Õ”€„ô¹Õ±°¤¤ì(€€€€€½¹ÍÐÑ½Ñ…°€ôÁÕÑÑY…±Õ•Ì¹É•‘Õ” (€€€€€€€€¡ÍÕ´°Ù…±Õ”¤€ôøÍÕ´€¬€¡Ù…±Õ”€ôôô€ˆˆñðÙ…±Õ”€ôô¹Õ±°€ü€À€è€­Ù…±Õ”ñð€À¤°(€€€€€€€€À°(€€€€€€¤ì(€€€€€Í•Ñ5…¹Õ…±Y…±Õ”¡…É°€‰Ñ•…´¹ÁÕÑÑÌ¹Ñ½Ñ…°ˆ°MÑÉ¥¹œ¡Ñ½Ñ…°¤¤ì(€€€ô(€ô(€™Õ¹Ñ¥½¸Íå¹5…¹Õ…±…±Õ±…Ñ•‘%¹ÁÕÑÌ¡…É¤ì(€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤(€€€€€€¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µµ…¹Õ…±tˆ¤(€€€€€€¹™½É…  ¡¥¹ÁÕÐ¤€ôøì(€€€€€€€¥˜€ (€€€€€€€€€¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹µ…¹Õ…°¹¥¹±Õ‘•Ì ˆ¹™Õ±±É½ÍÌ¸ˆ¤ñð(€€€€€€€€€¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹µ…¹Õ…°¹•¹‘Í]¥Ñ  ˆ¹™Õ±±AÕÑÑÍQ½Ñ…°ˆ¤(€€€€€€€€¤(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€½¹ÍÐÙ…±Õ”€ôµ…¹Õ…±Y…±Õ”¡…É°¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹µ…¹Õ…°°€ˆˆ¤ì(€€€€€€€¥¹ÁÕÐ¹Ù…±Õ”€ôÙ…±Õ”ì(€€€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸Ù…±¥‘…Ñ•5…¹Õ…±…É¡…É°¡½ÍÐ¤ì(€€€½¹ÍÐµ¥ÍÍ¥¹œ€ôl¸¸¹¡½ÍÐ¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µÉ•ÅÕ¥É•‘tˆ¥t¹™¥±Ñ•È (€€€€€€¡¥¹ÁÕÐ¤€ôøMÑÉ¥¹œ¡¥¹ÁÕÐ¹Ù…±Õ”¤¹ÑÉ¥´ ¤€ôôô€ˆˆ°(€€€€¤ì(€€€¥˜€¡µ¥ÍÍ¥¹œ¹±•¹Ñ ¤ì(€€€€€µ¥ÍÍ¥¹lÁt¹™½ÕÌ ¤ì(€€€€€…±•ÉÐ¡½µÁ±•Ñ”Ñ¡”É•µ…¥¹¥¹œ€‘íµ¥ÍÍ¥¹œ¹±•¹Ñ¡ô¡¥¡±¥¡Ñ•™¥•±‘íµ¥ÍÍ¥¹œ¹±•¹Ñ €ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô‰•™½É”ÍÕ‰µ¥ÑÑ¥¹œÑ¡¥ÌÑ•…´…É¹€¤ì(€€€€€µ¥ÍÍ¥¹œ¹™½É…  ¡¥¹ÁÕÐ¤€ôø¥¹ÁÕÐ¹±…ÍÍ1¥ÍÐ¹…‘ ‰µ…¹Õ…±5¥ÍÍ¥¹œˆ¤¤ì(€€€€€É•ÑÕÉ¸™…±Í”ì(€€€ô(€€€½¹ÍÐ¥¹Ù…±¥€ôl¸¸¹¡½ÍÐ¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µµ…¹Õ…±tˆ¥t¹™¥¹ ¡¥¹ÁÕÐ¤€ôøì(€€€€€¥˜€¡¥¹ÁÕÐ¹Ù…±Õ”€ôôô€ˆˆ¤É•ÑÕÉ¸™…±Í”ì(€€€€€½¹ÍÐÉ½ÍÍ¹ÑÉä€ô(€€€€€€€¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹µ…¹Õ…°¹¥¹±Õ‘•Ì ˆ¹™Õ±±É½ÍÌ¸ˆ¤ñð(€€€€€€€¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹µ…¹Õ…°¹¥¹±Õ‘•Ì ˆ¹Á…ÈÌ¸ˆ¤ì(€€€€€¥˜€¡É½ÍÍ¹ÑÉä€˜˜¥¹ÁÕÐ¹Ù…±Õ”¹Ñ½UÁÁ•É…Í” ¤€ôôô€‰@ˆ¤É•ÑÕÉ¸™…±Í”ì(€€€€€¥˜€ …9Õµ‰•È¹¥Í%¹Ñ••È ­¥¹ÁÕÐ¹Ù…±Õ”¤¤É•ÑÕÉ¸ÑÉÕ”ì(€€€€€É•ÑÕÉ¸É½ÍÍ¹ÑÉä(€€€€€€€€ü€­¥¹ÁÕÐ¹Ù…±Õ”€ð€Äñð€­¥¹ÁÕÐ¹Ù…±Õ”€ø€ÈÀ(€€€€€€€€è€­¥¹ÁÕÐ¹Ù…±Õ”€ð€Àñð€­¥¹ÁÕÐ¹Ù…±Õ”€ø€äääì(€€€ô¤ì(€€€¥˜€¡¥¹Ù…±¥¤ì(€€€€€¥¹Ù…±¥¹™½ÕÌ ¤ì(€€€€€…±•ÉÐ ‰¹Ñ•ÈÝ¡½±”¹Õµ‰•ÉÌ½¹±ä°½È@™½È„Á¥­ÕÀ½¸„É½ÍÌµÍ½É”…É¸¡•¬Ñ¡”¡¥¡±¥¡Ñ•™¥•±¸ˆ¤ì(€€€€€¥¹Ù…±¥¹±…ÍÍ1¥ÍÐ¹…‘ ‰µ…¹Õ…±5¥ÍÍ¥¹œˆ¤ì(€€€€€É•ÑÕÉ¸™…±Í”ì(€€€ô(€€€É•ÑÕÉ¸	½½±•…¸¡…É¤ì(€ô(€™Õ¹Ñ¥½¸‰¥¹‘5…¹Õ…±%¹ÁÕÑÌ¡…É°‘…ä°É½ÕÁ%¹‘•à°É•Ä¤ì(€€€½¹ÍÐ¥¹ÁÕÑÌ€ôl¸¸¸ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µµ…¹Õ…±tˆ¥tì(€€€¥¹ÁÕÑÌ¹™½É…  ¡¥¹ÁÕÐ°¥¹‘•à¤€ôøì(€€€€€¥¹ÁÕÐ¹½¹¥¹ÁÕÐ€ô€ ¤€ôøì(€€€€€€€¥¹ÁÕÐ¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰µ…¹Õ…±5¥ÍÍ¥¹œˆ¤ì(€€€€€€€¥˜€¡¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹µ…¹Õ…°¹¥¹±Õ‘•Ì ˆ¹™Õ±±É½ÍÌ¸ˆ¤¤(€€€€€€€€€¥¹ÁÕÐ¹Ù…±Õ”€ô¥¹ÁÕÐ¹Ù…±Õ”(€€€€€€€€€€€€¹Ñ½UÁÁ•É…Í” ¤(€€€€€€€€€€€€¹É•Á±…” ½oŠOŠPµt½œ°€‰@ˆ¤(€€€€€€€€€€€€¹É•Á±…” ½mxÀ´åAt½œ°€ˆˆ¤(€€€€€€€€€€€€¹Í±¥” À°€È¤ì(€€€€€€€Í•Ñ5…¹Õ…±Y…±Õ”¡…É°¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹µ…¹Õ…°°¥¹ÁÕÐ¹Ù…±Õ”¹ÑÉ¥´ ¤¤ì(€€€€€€€‘•É¥Ù•5…¹Õ…±Õ±±…É‘Ì¡‘…ä°É½ÕÁ%¹‘•à°…É°É•Ä¤ì(€€€€€€€Íå¹5…¹Õ…±…±Õ±…Ñ•‘%¹ÁÕÑÌ¡…É¤ì(€€€€€€€…É¹ÍÑ…ÑÕÌ€ô€‰‘É…™Ðˆì(€€€€€€€…É¹ÕÁ‘…Ñ•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€½¹ÍÐÍ…Ù•€ô€ ˆµ…¹Õ…±M…Ù•‘MÑ…Ñ”ˆ¤ì(€€€€€€€¥˜€¡Í…Ù•¤Í…Ù•¹Ñ•áÑ½¹Ñ•¹Ð€ô€‰M…Ù•½¸Ñ¡¥Ì‘•Ù¥”ƒŠrLˆì(€€€€€ôì(€€€€€¥¹ÁÕÐ¹½¹­•å‘½Ý¸€ô€¡•Ù•¹Ð¤€ôøì(€€€€€€€¥˜€¡•Ù•¹Ð¹­•ä€„ôô€‰¹Ñ•Èˆ¤É•ÑÕÉ¸ì(€€€€€€€•Ù•¹Ð¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì(€€€€€€€¥¹ÁÕÑÍm¥¹‘•à€¬€Åtü¹™½ÕÌ ¤ì(€€€€€€€¥¹ÁÕÑÍm¥¹‘•à€¬€Åtü¹Í•±•Ðü¸ ¤ì(€€€€€ôì(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É5…¹Õ…±Q•…µ…É¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€½¹ÍÐÉ•Ä€ôµ…¹Õ…±I•ÅÕ¥É•µ•¹ÑÌ¡‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€…É€ôµ…¹Õ…±É½ÕÁ…É¡‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€Á±…å¥¹½ÕÉÍ”€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤°(€€€€€Á±…å¥¹Y•ÉÍ¥½¸€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä¤°(€€€€€½µÁÌ€ômt°(€€€€€ÍÕµµ…ÉåM•Ñ¥½¸€ô€¡Ñ¥Ñ±”°‰½‘ä°¹½Ñ”€ô€ˆˆ¤€ôø(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÌô‰µ…¹Õ…±¹ÑÉåM•Ñ¥½¸ˆøñ Ìø‘íÑ¥Ñ±•ôð½ Ìø‘í¹½Ñ”€ü€ñÀø‘í¹½Ñ•ôð½Àù€€è€ˆ‰ô‘í‰½‘åôð½Í•Ñ¥½¸ù€ì(€€€‘•É¥Ù•5…¹Õ…±Õ±±…É‘Ì¡‘…ä°É½ÕÁ%¹‘•à°…É°É•Ä¤ì(€€€½¹ÍÐÁ±…å•É1…‰•°€ô€¡¥¤€ôø(€€€€€€€€‘í•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ô‘í¥€ôôôÉ•Ä¹Ù¥ÉÑÕ…±%€ü€ˆ€ñÍµ…±°ø¡Y%IQU0A1eH¤ð½Íµ…±°øˆ€è€ˆ‰õ€°(€€€€€Á…¥É1…‰•°€ô€¡¥‘Ì¤€ôø(€€€€€€€¥‘Ì(€€€€€€€€€€¹µ…À (€€€€€€€€€€€€¡¥¤€ôø(€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÌô‰µ…¹Õ…±A…¥ÉA±…å•Èˆø‘íÁ±…å•É1…‰•°¡¥¥ôð½ÍÁ…¸ù€°(€€€€€€€€€€¤(€€€€€€€€€€¹©½¥¸ œñÍÁ…¸±…ÍÌô‰µ…¹Õ…±A…¥É¹ˆø€™…µÀì€ð½ÍÁ…¸øœ¤°(€€€€€™Õ±±…É‘¹ÑÉä€ô…É¹™Õ±±…É‘Í=Á•¸(€€€€€€€€€€ü€ñÍ•Ñ¥½¸±…ÍÌô‰µ…¹Õ…±¹ÑÉåM•Ñ¥½¸µ…¹Õ…±Õ±±…É‘Ìˆøñ‘¥Ø±…ÍÌô‰µ…¹Õ…±Õ±±…É‘Q¥Ñ±”ˆøñ‘¥Øøñ Ìù%¹‘¥Ù¥‘Õ…°M½É”…É‘Ìð½ ÌøñÀø‘íÉ•Ä¹Í¡½ÉÑQ•…´€ü€‰¹Ñ•ÈÉ½ÍÌÍÑÉ½­•Ì™É½´Ñ¡”Ñ¡É•”Í¥¹•…É‘Ì…¹Ñ¡”Í•±•Ñ•Ù¥ÉÑÕ…°Á±…å•ÈÌ…É¸ˆ€è€‰¹Ñ•ÈÉ½ÍÌÍÑÉ½­•Ì™É½´•… Á±…å•ÈÌÍ¥¹•…É¸‰ô¹Ñ•È@™½È„Á¥­ÕÀ¸ð½Àøð½‘¥Øøñ‘¥Ø±…ÍÌô‰µ…¹Õ…±Õ±±…É‘½¹ÑÉ½±ÌˆøñÍÁ…¸ù…±Õ±…Ñ•…ÕÑ½µ…Ñ¥…±±äð½ÍÁ…¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Í½™Ðˆ¥ô‰±½Í•5…¹Õ…±Õ±±…É‘Ìˆù±½Í”M½É”…É‘Ìð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øøñ‘¥Ø±…ÍÌô‰µ…¹Õ…±Õ±±…É‘É¥ˆÍÑå±”ôˆ´µµ…¹Õ…°µÁ±…å•Èµ½Õ¹Ðè‘íÉ•Ä¹¥‘Ì¹±•¹Ñ¡ôˆøñÍÁ…¸±…ÍÌô‰µ…¹Õ…±A…ÈÍ½É¹•ÈˆÍÑå±”ô‰É¥µ½±Õµ¸èÄíÉ¥µÉ½ÜèÄˆù!½±”ð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰µ…¹Õ…±A…ÈÍ½É¹•ÈˆÍÑå±”ô‰É¥µ½±Õµ¸èÈíÉ¥µÉ½ÜèÄˆùA…Èð½ÍÁ…¸ø‘íÉ•Ä¹¥‘Ì¹µ…À ¡¥°Á±…å•É%¹‘•à¤€ôø€ñÍÑÉ½¹œ±…ÍÌô‰µ…¹Õ…±A…ÈÍA±…å•ÈˆÍÑå±”ô‰É¥µ½±Õµ¸è‘íÁ±…å•É%¹‘•à€¬€ÍôíÉ¥µÉ½ÜèÄˆø‘íÁ±…å•É1…‰•°¡¥¥ôð½ÍÑÉ½¹œù€¤¹©½¥¸ ˆˆ¥ô‘íÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôø€ñˆ±…ÍÌô‰µ…¹Õ…±A…ÈÍ!½±”ˆÍÑå±”ô‰É¥µ½±Õµ¸èÄíÉ¥µÉ½Üè‘í¥¹‘•à€¬€Éôˆø‘í¥¹‘•à€¬€Åôð½ˆøñˆ±…ÍÌô‰µ…¹Õ…±Õ±±…É‘A…ÈˆÍÑå±”ô‰É¥µ½±Õµ¸èÈíÉ¥µÉ½Üè‘í¥¹‘•à€¬€Éôˆø‘í•ÍŒ¡Á±…å¥¹Y•ÉÍ¥½¸¹Á…Èü¹m¥¹‘•át€üü€‹ŠLˆ¥ôð½ˆù€¤¹©½¥¸ ˆˆ¥ô‘íÉ•Ä¹¥‘Ì¹µ…À ¡¥°Á±…å•É%¹‘•à¤€ôøÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôø€ñ¥¹ÁÕÐÍÑå±”ô‰É¥µ½±Õµ¸è‘íÁ±…å•É%¹‘•à€¬€ÍôíÉ¥µÉ½Üè‘í¥¹‘•à€¬€Éôˆ¥¹ÁÕÑµ½‘”ô‰Ñ•áÐˆµ…á±•¹Ñ ôˆÈˆ‘…Ñ„µÉ•ÅÕ¥É•‘…Ñ„µµ…¹Õ…°ô‰Á±…å•ÉÌ¸‘í¥‘ô¹™Õ±±É½ÍÌ¸‘í¥¹‘•à€¬€ÅôˆÙ…±Õ”ôˆ‘í•ÍŒ¡…É¹Á±…å•ÉÌü¹m¥‘tü¹™Õ±±É½ÍÌü¹m¥¹‘•à€¬€Åt€üü€ˆˆ¥ôˆ…É¥„µ±…‰•°ôˆ‘í•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ô!½±”€‘í¥¹‘•à€¬€ÅôÉ½ÍÌÍ½É”°Á…È€‘í•ÍŒ¡Á±…å¥¹Y•ÉÍ¥½¸¹Á…Èü¹m¥¹‘•át€üü€‰Õ¹­¹½Ý¸ˆ¥ôˆù€¤¹©½¥¸ ˆˆ¤¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøñ‘¥Ø±…ÍÌô‰µ…¹Õ…±Õ±±AÕÑÑ¥¹œˆøñ ÌùQ•…´AÕÑÑ¥¹œð½ Ìøñ‘¥Ø±…ÍÌô‰µ…¹Õ…±Õ±±AÕÑÑ¥¹É¥ˆÍÑå±”ôˆ´µµ…¹Õ…°µÁÕÑÑ¥¹œµ½Õ¹Ðè‘íÉ•Ä¹¥‘Ì¹±•¹Ñ €¬€Åôˆø‘íÉ•Ä¹¥‘Ì¹µ…À ¡¥¤€ôø€ñ±…‰•°øñÍÁ…¸ø‘íÁ±…å•É1…‰•°¡¥¥ôð½ÍÁ…¸øñ¥¹ÁÕÐ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥ŒˆÁ…ÑÑ•É¸ô‰lÀ´åt¨ˆ‘…Ñ„µÉ•ÅÕ¥É•‘…Ñ„µµ…¹Õ…°ô‰Á±…å•ÉÌ¸‘í¥‘ô¹™Õ±±AÕÑÑÍQ½Ñ…°ˆÙ…±Õ”ôˆ‘í•ÍŒ¡…É¹Á±…å•ÉÌü¹m¥‘tü¹™Õ±±AÕÑÑÍQ½Ñ…°€üü€ˆˆ¥ôˆøð½±…‰•°ù€¤¹©½¥¸ ˆˆ¥ôñ±…‰•°±…ÍÌô‰µ…¹Õ…±AÕÑÑ¥¹Q½Ñ…°ˆøñÍÁ…¸ùQ½Ñ…°ð½ÍÁ…¸øñ¥¹ÁÕÐÉ•…‘½¹±ä‘…Ñ„µµ…¹Õ…°ô‰Ñ•…´¹ÁÕÑÑÌ¹Ñ½Ñ…°ˆÙ…±Õ”ôˆ‘í•ÍŒ¡…É¹Ñ•…´ü¹ÁÕÑÑÌü¹Ñ½Ñ…°€üü€ˆˆ¥ôˆ…É¥„µ±…‰•°ô‰Q•…´ÁÕÑÑ¥¹œÑ½Ñ…°ˆøð½±…‰•°øð½‘¥Øøð½‘¥Øøð½Í•Ñ¥½¸ù€(€€€€€€€€€€è€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰ÁÉ¥µ…Éäµ…¹Õ…±=Á•¹Õ±±…É‘Ìˆ¥ô‰½Á•¹5…¹Õ…±Õ±±…É‘Ìˆù=Á•¸%¹‘¥Ù¥‘Õ…°M½É”…É‘Ìð½‰ÕÑÑ½¸ù€ì(€€€¥˜€¡É•Ä¹Í¥¹±”¤(€€€€€½µÁÌ¹ÁÕÍ  (€€€€€€€ÍÕµµ…ÉåM•Ñ¥½¸ (€€€€€€€€€€‰M¥¹±”MÑ…‰±•™½Éˆ°(€€€€€€€€€É•Ä¹¥‘Ì(€€€€€€€€€€€€¹µ…À (€€€€€€€€€€€€€€¡¥¤€ôø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰µ…¹Õ…±¹ÑÉåI½Üˆøñˆø‘íÁ±…å•É1…‰•°¡¥¥ôð½ˆø‘íµ…¹Õ…±MÕµµ…Éå¥•±‘Ì¡Á±…å•ÉÌ¸‘í¥‘ô¹Í¥¹±•€°…É¹Á±…å•ÉÌü¹m¥‘tü¹Í¥¹±”¥ôð½‘¥Øù€°(€€€€€€€€€€€€¤(€€€€€€€€€€€€¹©½¥¸ ˆˆ¤°(€€€€€€€€€€‰¹Ñ•È•… Á±…å•ÈÌÍ¥¹•µ…ÉÑ½Ñ…°…¹½Õ¹Ñ‰…¬™¥ÕÉ•Ì¸ˆ°(€€€€€€€€¤°(€€€€€€¤ì(€€€¥˜€¡É•Ä¹™½ÕÉ‰…±°¤ì(€€€€€½¹ÍÐÁ…¥ÉÌ€ômÉ•Ä¹¥‘Ì¹Í±¥” À°€È¤°É•Ä¹¥‘Ì¹Í±¥” È°€Ð¥t¹™¥±Ñ•È (€€€€€€€€¡¥‘Ì¤€ôø¥‘Ì¹±•¹Ñ °(€€€€€€¤ì(€€€€€½µÁÌ¹ÁÕÍ  (€€€€€€€ÍÕµµ…ÉåM•Ñ¥½¸ (€€€€€€€€€€ˆÑ		MÑ…‰±•™½Éˆ°(€€€€€€€€€Á…¥ÉÌ(€€€€€€€€€€€€¹µ…À (€€€€€€€€€€€€€€¡¥‘Ì°¥¹‘•à¤€ôø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰µ…¹Õ…±¹ÑÉåI½Üˆøñˆ±…ÍÌô‰µ…¹Õ…±A…¥É1…‰•°ˆø‘íÁ…¥É1…‰•°¡¥‘Ì¥ôð½ˆø‘íµ…¹Õ…±MÕµµ…Éå¥•±‘Ì¡Á…¥ÉÌ¹À‘í¥¹‘•áô¹™½ÕÉ‰…±±€°…É¹Á…¥ÉÌü¹l‰Àˆ€¬¥¹‘•átü¹™½ÕÉ‰…±°¥ôð½‘¥Øù€°(€€€€€€€€€€€€¤(€€€€€€€€€€€€¹©½¥¸ ˆˆ¤°(€€€€€€€€¤°(€€€€€€¤ì(€€€ô(€€€¥˜€¡É•Ä¹‰•ÍÐÌ¤(€€€€€½µÁÌ¹ÁÕÍ  (€€€€€€€ÍÕµµ…ÉåM•Ñ¥½¸ (€€€€€€€€€€‰	•ÍÐ€Ì½˜€ÐMÑ…‰±•™½Éˆ°(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰µ…¹Õ…±¹ÑÉåI½ÜˆøñˆùQ•…´€‘íÉ½ÕÁ%¹‘•à€¬€Åôð½ˆø‘íµ…¹Õ…±MÕµµ…Éå¥•±‘Ì ‰Ñ•…´¹‰•ÍÐÌˆ°…É¹Ñ•…´ü¹‰•ÍÐÌ¥ôð½‘¥Øù€°(€€€€€€€€¤°(€€€€€€¤ì(€€€¥˜€¡É•Ä¹ÁÕÑÑ¥¹œ¤ì(€€€€€¥˜€¡É•Ä¹ÁÕÑÑ¥¹A…¥ÉÌ¤(€€€€€€€½µÁÌ¹ÁÕÍ  (€€€€€€€€€ÍÕµµ…ÉåM•Ñ¥½¸ (€€€€€€€€€€€€‰AÕÑÑ¥¹œƒŠP¥¹‘¥Ù¥‘Õ…°Ñ½Ñ…±Ìˆ°(€€€€€€€€€€€É•Ä¹¥‘Ì(€€€€€€€€€€€€€€¹µ…À (€€€€€€€€€€€€€€€€¡¥¤€ôø(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰µ…¹Õ…±¹ÑÉåI½Üˆøñˆø‘íÁ±…å•É1…‰•°¡¥¥ôð½ˆø‘íµ…¹Õ…±MÕµµ…Éå¥•±‘Ì¡Á±…å•ÉÌ¸‘í¥‘ô¹ÁÕÑÑÍ€°…É¹Á±…å•ÉÌü¹m¥‘tü¹ÁÕÑÑÌ¥ôð½‘¥Øù€°(€€€€€€€€€€€€€€¤(€€€€€€€€€€€€€€¹©½¥¸ ˆˆ¤°(€€€€€€€€€€€€‰Q¡”…ÁÀÝ¥±°½µ‰¥¹”Ñ¡”½¹™¥ÕÉ•ÁÕÑÑ¥¹œÁ…ÉÑ¹•ÉÌ…ÕÑ½µ…Ñ¥…±±ä¸ˆ°(€€€€€€€€€€¤°(€€€€€€€€¤ì(€€€€€•±Í”(€€€€€€€½µÁÌ¹ÁÕÍ  (€€€€€€€€€ÍÕµµ…ÉåM•Ñ¥½¸ (€€€€€€€€€€€€‰Q•…´AÕÑÑ¥¹œˆ°(€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰µ…¹Õ…±¹ÑÉåI½ÜˆøñˆùQ•…´€‘íÉ½ÕÁ%¹‘•à€¬€Åôð½ˆø‘íµ…¹Õ…±MÕµµ…Éå¥•±‘Ì ‰Ñ•…´¹ÁÕÑÑÌˆ°…É¹Ñ•…´ü¹ÁÕÑÑÌ¥ôð½‘¥Øù€°(€€€€€€€€€€€€‰=¹±äÑ¡”Ñ•…´Ñ½Ñ…±Ì…É”É•ÅÕ¥É•™½ÈÑ¡¥Ì•Ù•¹ÐÌÁÕÑÑ¥¹œ™½Éµ…Ð¸ˆ°(€€€€€€€€€€¤°(€€€€€€€€¤ì(€€€ô(€€€¥˜€¡É•Ä¹Á…ÈÌ¤ì(€€€€€½¹ÍÐ¡½±•Ì€ôµ…¹Õ…±A…ÈÍ!½±•Ì¡‘…ä¤ì(€€€€€½µÁÌ¹ÁÕÍ  (€€€€€€€ÍÕµµ…ÉåM•Ñ¥½¸ (€€€€€€€€€€‰A…È€ÌM½É•Ìˆ°(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰µ…¹Õ…±A…ÈÍÉ¥ˆÍÑå±”ôˆ´µµ…¹Õ…°µÁ±…å•Èµ½Õ¹Ðè‘íÉ•Ä¹¥‘Ì¹±•¹Ñ¡ôˆøñÍÁ…¸±…ÍÌô‰µ…¹Õ…±A…ÈÍ½É¹•Èˆù!½±”ð½ÍÁ…¸ø‘íÉ•Ä¹¥‘Ì(€€€€€€€€€€€€¹µ…À (€€€€€€€€€€€€€€¡¥°Á±…å•É%¹‘•à¤€ôø(€€€€€€€€€€€€€€€€ñÍÑÉ½¹œ±…ÍÌô‰µ…¹Õ…±A…ÈÍA±…å•ÈˆÍÑå±”ô‰É¥µ½±Õµ¸è‘íÁ±…å•É%¹‘•à€¬€ÉôíÉ¥µÉ½ÜèÄˆø‘íÁ±…å•É1…‰•°¡¥¥ôð½ÍÑÉ½¹œù€°(€€€€€€€€€€€€¤(€€€€€€€€€€€€¹©½¥¸ ˆˆ¥ô‘í¡½±•Ì(€€€€€€€€€€€€¹µ…À (€€€€€€€€€€€€€€¡¡½±”°¡½±•%¹‘•à¤€ôø(€€€€€€€€€€€€€€€€ñˆ±…ÍÌô‰µ…¹Õ…±A…ÈÍ!½±”ˆÍÑå±”ô‰É¥µ½±Õµ¸èÄíÉ¥µÉ½Üè‘í¡½±•%¹‘•à€¬€Éôˆù!½±”€‘í¡½±•ôð½ˆù€°(€€€€€€€€€€€€¤(€€€€€€€€€€€€¹©½¥¸ ˆˆ¥ô‘íÉ•Ä¹¥‘Ì(€€€€€€€€€€€€¹µ…À ¡¥°Á±…å•É%¹‘•à¤€ôø(€€€€€€€€€€€€€¡½±•Ì(€€€€€€€€€€€€€€€€¹µ…À (€€€€€€€€€€€€€€€€€€¡¡½±”°¡½±•%¹‘•à¤€ôø(€€€€€€€€€€€€€€€€€€€€ñ¥¹ÁÕÐÍÑå±”ô‰É¥µ½±Õµ¸è‘íÁ±…å•É%¹‘•à€¬€ÉôíÉ¥µÉ½Üè‘í¡½±•%¹‘•à€¬€Éôˆ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥ŒˆÁ…ÑÑ•É¸ô‰lÀ´åt¨ˆ‘…Ñ„µÉ•ÅÕ¥É•‘…Ñ„µµ…¹Õ…°ô‰Á±…å•ÉÌ¸‘í¥‘ô¹Á…ÈÌ¸‘í¡½±•ôˆÙ…±Õ”ôˆ‘í•ÍŒ¡…É¹Á±…å•ÉÌü¹m¥‘tü¹Á…ÈÌü¹m¡½±•t€üü€ˆˆ¥ôˆ…É¥„µ±…‰•°ôˆ‘í•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ô!½±”€‘í¡½±•ôÉ½ÍÌÍ½É”ˆù€°(€€€€€€€€€€€€€€€€¤(€€€€€€€€€€€€€€€€¹©½¥¸ ˆˆ¤°(€€€€€€€€€€€€¤(€€€€€€€€€€€€¹©½¥¸ ˆˆ¥ôð½‘¥Øù€°(€€€€€€€€€€‰¹Ñ•ÈÉ½ÍÌÍÑÉ½­•Ì¸Q¡”…ÁÀ…ÁÁ±¥•Ì•… Á±…å•ÈÌ¡…¹‘¥…À¸ˆ°(€€€€€€€€¤°(€€€€€€¤ì(€€€ô(€€€¥˜€¡É•Ä¹å•±±½Ý	…±°¤ì(€€€€€…É¹Ñ•…´¹å•±±½Ý	…±°ñðôíÑ½Ñ…°è€ˆˆ°±½ÍÍ!½±”è€ˆ‰ôì(€€€€€½¹ÍÐÉ•ÍÕ±Ð€ô…É¹Ñ•…´¹å•±±½Ý	…±°ì(€€€€€½¹ÍÐÍ•ÅÕ•¹”€ôÍ½É•M•ÅÕ•¹”¡É½ÕÁMÑ…ÉÑ¥¹!½±”¡ÍÑ½É”¹•Ù•¹Ð°‘…ä°É½ÕÁ%¹‘•à¤¤ì(€€€€€½µÁÌ¹ÁÕÍ ¡ÍÕµµ…ÉåM•Ñ¥½¸ ‰e•±±½Ü	…±°ˆ°€ñ±…‰•°ù	…±°É•ÍÕ±ÐñÍ•±•Ð¥ô‰µ…¹Õ…±e•±±½Ý	…±±1½ÍÌˆ‘…Ñ„µÉ•ÅÕ¥É•øñ½ÁÑ¥½¸Ù…±Õ”ôˆˆù¡½½Í”É•ÍÕ±Ðð½½ÁÑ¥½¸øñ½ÁÑ¥½¸Ù…±Õ”ô‰9=9ˆ€‘íÉ•ÍÕ±Ð¹±½ÍÍ!½±”€ôôô€‰9=9ˆ€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôù½µÁ±•Ñ•ƒŠP‰…±°¹½Ð±½ÍÐð½½ÁÑ¥½¸ø‘íÍ•ÅÕ•¹”¹µ…À¡¡½±”€ôø€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í¡½±•ôˆ€‘íMÑÉ¥¹œ¡É•ÍÕ±Ð¹±½ÍÍ!½±”¤€ôôôMÑÉ¥¹œ¡¡½±”¤€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôù1½ÍÐ½¸!½±”€‘í¡½±•ôƒŠP€‘í•ÍŒ¡Á±…å•È¡å•±±½Ý	…±±A±…å•É½É!½±”¡‘…ä°É½ÕÁ%¹‘•à°¡½±”¤¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½½ÁÑ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½Í•±•Ðøð½±…‰•°øñ‘¥Ø±…ÍÌô‰µ…¹Õ…±¹ÑÉåI½Üˆøñˆùe•±±½Ü	…±°Á½¥¹ÑÌð½ˆøñ±…‰•°øñÍÁ…¸ùQ½Ñ…°ð½ÍÁ…¸øñ¥¹ÁÕÐ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥Œˆ‘…Ñ„µÉ•ÅÕ¥É•‘…Ñ„µµ…¹Õ…°ô‰Ñ•…´¹å•±±½Ý	…±°¹Ñ½Ñ…°ˆÙ…±Õ”ôˆ‘í•ÍŒ¡É•ÍÕ±Ð¹Ñ½Ñ…°€üü€ˆˆ¥ôˆøð½±…‰•°øð½‘¥Øù€°€‰½Õ¹ÐÑ¡”¹½µ¥¹…Ñ•É•…°½±™•ÈÌMÑ…‰±•™½ÉÁ½¥¹ÑÌ½¸•… ¡½±”‰•™½É”Ñ¡”‰…±°Ý…Ì±½ÍÐ¸Q¡”±½ÍÌ¡½±”‘½•Ì¹½Ð½Õ¹Ð¸Õ±°Í½É”…É‘Ì…±Õ±…Ñ”Ñ¡¥ÌÑ½Ñ…°…ÕÑ½µ…Ñ¥…±±ä¸Y¥ÉÑÕ…°A±…å•ÉÌ¹•Ù•È•¹Ñ•ÈÑ¡”É½Ñ…Ñ¥½¸¸ˆ¤¤ì(€€€ô(€€€½¹ÍÐÁ¡½¹•]…É¹¥¹œ€ôµ…¹Õ…±Q•…µ!…ÍA¡½¹•M½É•Ì¡‘…ä°É½ÕÁ%¹‘•à¤(€€€€€€ü€œñ‘¥Ø±…ÍÌô‰µ…¹Õ…±½¹™±¥ÐˆøñˆùA¡½¹”Í½É•Ì…±É•…‘ä•á¥ÍÐ™½ÈÑ¡¥ÌÑ•…´¸ð½ˆøñÍÁ…¸ùMÕ‰µ¥ÑÑ¥¹œÑ¡¥ÌÁ…Á•È…Éµ…­•Ì¥ÑÌÍÕµµ…ÉäÉ•ÍÕ±ÑÌ…ÕÑ¡½É¥Ñ…Ñ¥Ù”¸Q¡”Õ¹‘•É±å¥¹œÁ¡½¹”Í½É•Ì…É”É•Ñ…¥¹•¸ð½ÍÁ…¸øð½‘¥Øøœ(€€€€€€è€ˆˆì(€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰•µ•É•¹å!•…µ…¹Õ…±¹ÑÉå!•…ˆøñÍµ…±°ùI=I10M=ILƒ
Üd€‘í‘…åôð½Íµ…±°øñ ÈùQ•…´€‘íÉ½ÕÁ%¹‘•à€¬€ÅôA…Á•È…Éð½ ÈøñÀø‘íÉ•Ä¹¥‘Ì¹µ…À¡Á±…å•É1…‰•°¤¹©½¥¸ ˆƒ
Ü€ˆ¥ôð½Àøð½‘¥Øø‘íÁ¡½¹•]…É¹¥¹ôñÀ±…ÍÌô‰µ…¹Õ…±‘…ÁÑ¥Ù•9½Ñ”ˆù=¹±ä™¥•±‘ÌÉ•ÅÕ¥É•‰äÑ¡¥Ì•Ù•¹ÐÌÍ•±•Ñ•½µÁ•Ñ¥Ñ¥½¹Ì…É”Í¡½Ý¸¸ð½Àø‘í™Õ±±…É‘¹ÑÉåôñ‘¥Ø±…ÍÌô‰µ…¹Õ…±¹ÑÉå	½‘äˆø‘í½µÁÌ¹©½¥¸ ˆˆ¥ôð½‘¥Øøñ‘¥Ø±…ÍÌô‰µ…¹Õ…±MÑ¥­åÑ¥½¹ÌˆøñÍÁ…¸¥ô‰µ…¹Õ…±M…Ù•‘MÑ…Ñ”ˆø‘í…É¹ÕÁ‘…Ñ•‘Ð€ü€‰M…Ù•½¸Ñ¡¥Ì‘•Ù¥”ƒŠrLˆ€è€‰9½Ðå•ÐÍ…Ù•‰ôð½ÍÁ…¸øñ‘¥Øøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰‰…­5…¹Õ…±…Í¡‰½…ÉˆûŠ@Q•…µÌð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰Í…Ù•5…¹Õ…±É…™ÐˆùM…Ù”É…™Ðð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰ÍÕ‰µ¥Ñ5…¹Õ…±…Éˆø‘í…É¹ÍÑ…ÑÕÌ€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆ€ü€‰UÁ‘…Ñ”MÕ‰µ¥ÑÑ•…Éˆ€è€‰MÕ‰µ¥ÐQ•…´…É‰ôð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øù€ì(€€€‰¥¹‘5…¹Õ…±%¹ÁÕÑÌ¡…É°‘…ä°É½ÕÁ%¹‘•à°É•Ä¤ì(€€€¥˜€  ˆµ…¹Õ…±e•±±½Ý	…±±1½ÍÌˆ¤¤€ ˆµ…¹Õ…±e•±±½Ý	…±±1½ÍÌˆ¤¹½¹¡…¹”€ô”€ôøì(€€€€€…É¹Ñ•…´¹å•±±½Ý	…±°¹±½ÍÍ!½±”€ô”¹Ñ…É•Ð¹Ù…±Õ”ì(€€€€€…É¹ÍÑ…ÑÕÌ€ô€‰‘É…™Ðˆì(€€€€€‘•É¥Ù•5…¹Õ…±Õ±±…É‘Ì¡‘…ä°É½ÕÁ%¹‘•à°…É°É•Ä¤ì(€€€€€Íå¹5…¹Õ…±…±Õ±…Ñ•‘%¹ÁÕÑÌ¡…É¤ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€ôì(€€€¥˜€¡…É¹™Õ±±…É‘Í=Á•¸¤(€€€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤(€€€€€€€€¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µµ…¹Õ…±tˆ¤(€€€€€€€€¹™½É…  ¡¥¹ÁÕÐ¤€ôøì(€€€€€€€€€¥˜€ (€€€€€€€€€€€€…¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹µ…¹Õ…°¹¥¹±Õ‘•Ì ˆ¹™Õ±±É½ÍÌ¸ˆ¤€˜˜(€€€€€€€€€€€€…¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹µ…¹Õ…°¹•¹‘Í]¥Ñ  ˆ¹™Õ±±AÕÑÑÍQ½Ñ…°ˆ¤(€€€€€€€€€€¤ì(€€€€€€€€€€€¥¹ÁÕÐ¹É•…‘=¹±ä€ôÑÉÕ”ì(€€€€€€€€€€€¥¹ÁÕÐ¹±…ÍÍ1¥ÍÐ¹…‘ ‰µ…¹Õ…±…±Õ±…Ñ•ˆ¤ì(€€€€€€€€€ô(€€€€€€€ô¤ì(€€€¥˜€  ˆ½Á•¹5…¹Õ…±Õ±±…É‘Ìˆ¤¤(€€€€€€ ˆ½Á•¹5…¹Õ…±Õ±±…É‘Ìˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€…É¹™Õ±±…É‘Í=Á•¸€ôÑÉÕ”ì(€€€€€€€…É¹ÍÑ…ÑÕÌ€ô€‰‘É…™Ðˆì(€€€€€€€…É¹ÕÁ‘…Ñ•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€É•¹‘•É5…¹Õ…±Q•…µ…É¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€€€ôì(€€€¥˜€  ˆ±½Í•5…¹Õ…±Õ±±…É‘Ìˆ¤¤(€€€€€€ ˆ±½Í•5…¹Õ…±Õ±±…É‘Ìˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€…É¹™Õ±±…É‘Í=Á•¸€ô™…±Í”ì(€€€€€€€…É¹ÍÑ…ÑÕÌ€ô€‰‘É…™Ðˆì(€€€€€€€…É¹ÕÁ‘…Ñ•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€É•¹‘•É5…¹Õ…±Q•…µ…É¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€€€ôì(€€€€ ˆ‰…­5…¹Õ…±…Í¡‰½…Éˆ¤¹½¹±¥¬€ô€ ¤€ôøÉ•¹‘•É5…¹Õ…±M½É•Í…Í¡‰½…É¡‘…ä¤ì(€€€€ ˆÍ…Ù•5…¹Õ…±É…™Ðˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€…É¹ÕÁ‘…Ñ•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€ ˆµ…¹Õ…±M…Ù•‘MÑ…Ñ”ˆ¤¹Ñ•áÑ½¹Ñ•¹Ð€ô€‰M…Ù•½¸Ñ¡¥Ì‘•Ù¥”ƒŠrLˆì(€€€ôì(€€€€ ˆÍÕ‰µ¥Ñ5…¹Õ…±…Éˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€¥˜€ …Ù…±¥‘…Ñ•5…¹Õ…±…É¡…É°€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¤¤É•ÑÕÉ¸ì(€€€€€¥˜€ (€€€€€€€€…½¹™¥É´ (€€€€€€€€€MÕ‰µ¥ÐQ•…´€‘íÉ½ÕÁ%¹‘•à€¬€ÅôÌÁ…Á•È…É…ÌÑ¡”…ÕÑ¡½É¥Ñ…Ñ¥Ù”…ä€‘í‘…åôÉ•ÍÕ±Ðý€°(€€€€€€€€¤(€€€€€€¤(€€€€€€€É•ÑÕÉ¸ì(€€€€€…É¹ÍÑ…ÑÕÌ€ô€‰ÍÕ‰µ¥ÑÑ•ˆì(€€€€€…É¹ÍÕ‰µ¥ÑÑ•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€…É¹ÕÁ‘…Ñ•‘Ð€ô…É¹ÍÕ‰µ¥ÑÑ•‘Ðì(€€€€€…É¹Á¡½¹•M½É•ÍMÕÁ•ÉÍ•‘•€ôµ…¹Õ…±Q•…µ!…ÍA¡½¹•M½É•Ì¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤(€€€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€É•¹‘•É!½µ” ¤ì(€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€É•¹‘•É5…¹Õ…±M½É•Í…Í¡‰½…É¡‘…ä¤ì(€€€ôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É5…¹Õ…±9ÑÁ‘¥Ñ½È¡‘…ä¤ì(€€€½¹ÍÐ‘…åMÑ½É”€ôµ…¹Õ…±…åMÑ½É”¡‘…ä¤°(€€€€€¡½±•Ì€ô¹ÑÁ!½±•Í%¹A±…å¥¹=É‘•È¡‘…ä¤°(€€€€€¥‘Ì€ô‘…å¥•±‘%‘Ì¡‘…ä¤(€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤ì(€€€¥˜€ …¡½±•Ì¹±•¹Ñ ¤É•ÑÕÉ¸€ˆˆì(€€€É•ÑÕÉ¸€ñÍ•Ñ¥½¸±…ÍÌô‰µ…¹Õ…±9ÑÁ‘¥Ñ½Èˆøñ Ìù9•…É•ÍÐÑ¡”A¥¸ð½ ÌøñÀùM•±•ÐÑ¡”Á…Á•Èµ…ÉÝ¥¹¹•È½È9½Ð]½¸¸ð½Àø‘í¡½±•Ì(€€€€€€¹µ…À (€€€€€€€€¡¡½±”¤€ôø(€€€€€€€€€€ñ±…‰•°øñˆù!½±”€‘í¡½±•ôð½ˆøñÍ•±•Ð‘…Ñ„µµ…¹Õ…°µ¹ÑÀôˆ‘í¡½±•ôˆøñ½ÁÑ¥½¸Ù…±Õ”ôˆˆùM•±•ÐÉ•ÍÕ±Ðð½½ÁÑ¥½¸øñ½ÁÑ¥½¸Ù…±Õ”ô‰9=9ˆ€‘í‘…åMÑ½É”¹¹ÑÀü¹m¡½±•t€ôôô€‰9=9ˆ€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôù9½Ð]½¸ð½½ÁÑ¥½¸ø‘í¥‘Ì¹µ…À ¡¥¤€ôø€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í•ÍŒ¡¥¥ôˆ€‘íMÑÉ¥¹œ¡‘…åMÑ½É”¹¹ÑÀü¹m¡½±•tñð€ˆˆ¤€ôôô¥€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôø‘í•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½½ÁÑ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½Í•±•Ðøð½±…‰•°ù€°(€€€€€€¤(€€€€€€¹©½¥¸ ˆˆ¥ôð½Í•Ñ¥½¸ù€ì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±…åI•…‘ä¡‘…ä¤ì(€€€½¹ÍÐÍ•ÑÕÀ€ôÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬‘…åt°(€€€€€…É‘ÍI•…‘ä€ô	½½±•…¸ (€€€€€€€Í•ÑÕÀü¹É½ÕÁÌü¹±•¹Ñ €˜˜(€€€€€€€€€Í•ÑÕÀ¹É½ÕÁÌ¹•Ù•Éä ¡É…Ü°¥¹‘•à¤€ôøì(€€€€€€€€€€€¥˜€¡ÍÕ‰µ¥ÑÑ•‘5…¹Õ…±…É¡‘…ä°¥¹‘•à¤¤É•ÑÕÉ¸ÑÉÕ”ì(€€€€€€€€€€€½¹ÍÐ¥‘Ì€ôÉ…Ü(€€€€€€€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤(€€€€€€€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôø¥€˜˜¥€„ôô9=}AIQ9I}%¤ì(€€€€€€€€€€€É•ÑÕÉ¸	½½±•…¸ (€€€€€€€€€€€€€¥‘Ì¹±•¹Ñ €˜˜¥‘Ì¹•Ù•Éä ¡¥¤€ôø±¥Ù•A±…å•ÉMÑ…ÑÕÌ¡‘…ä°¥¤¹™¥¹…±¥Í•¤°(€€€€€€€€€€€€¤ì(€€€€€€€€€ô¤°(€€€€€€¤°(€€€€€½µÁÌ€ôµ…¹Õ…±M•±•Ñ•‘½µÁ•Ñ¥Ñ¥½¹Ì¡‘…ä¤°(€€€€€¹ÑÁI•…‘ä€ô(€€€€€€€€…½µÁÌ¹¡…Ì ‰¹ÑÀˆ¤ñð(€€€€€€€¹ÑÁ!½±•Í%¹A±…å¥¹=É‘•È¡‘…ä¤¹•Ù•Éä (€€€€€€€€€€¡¡½±”¤€ôøMÑÉ¥¹œ¡µ…¹Õ…±…åMÑ½É”¡‘…ä°™…±Í”¤ü¹¹ÑÀü¹m¡½±•tñð€ˆˆ¤€„ôô€ˆˆ°(€€€€€€€€¤ì(€€€É•ÑÕÉ¸…É‘ÍI•…‘ä€˜˜¹ÑÁI•…‘äì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É5…¹Õ…±M½É•Í…Í¡‰½…É¡‘…ä¤ì(€€€½¹ÍÐ‘…åÌ€ôÍÑ½É”¹•Ù•¹Ð¹‘…åÌñð€Ä°(€€€€€Í•±•Ñ•‘…ä€ô5…Ñ ¹µ…à Ä°5…Ñ ¹µ¥¸¡‘…åÌ°€­‘…äñð€Ä¤¤°(€€€€€Í•ÑÕÀ€ôÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬Í•±•Ñ•‘…åt°(€€€€€‘…åMÑ½É”€ôµ…¹Õ…±…åMÑ½É”¡Í•±•Ñ•‘…ä¤°(€€€€€É½ÕÁÌ€ôÍ•ÑÕÀü¹É½ÕÁÌñðmtì(€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰•µ•É•¹å!•…µ…¹Õ…±¹ÑÉå!•…ˆøñÍµ…±°ù=I9%MHAAHµI9QIdð½Íµ…±°øñ ÈùI•½É±°M½É•Ìð½ ÈøñÀù¹Ñ•È½¹”Í¥¹•Ñ•…´…É…Ð„Ñ¥µ”¸É…™Ð•¹ÑÉ¥•Ì‘¼¹½Ð…™™•ÐÉ•ÍÕ±ÑÌ¸ð½Àøð½‘¥Øø‘í‘…åQ…‰Ì ‰µ…¹Õ…±‘…äˆ°Í•±•Ñ•‘…ä°ÍÑ½É”¹•Ù•¹Ð°€‰µ…¹Õ…±…åQ…‰Ìˆ¥ôñ‘¥Ø±…ÍÌô‰µ…¹Õ…±Q•…µ…Í¡‰½…Éˆø‘íÉ½ÕÁÌ(€€€€€€¹µ…À ¡É…Ü°¥¹‘•à¤€ôøì(€€€€€€€½¹ÍÐÉ•Ä€ôµ…¹Õ…±I•ÅÕ¥É•µ•¹ÑÌ¡Í•±•Ñ•‘…ä°¥¹‘•à¤°(€€€€€€€€€¥‘Ì€ôÉ•Ä¹¥‘Ì°(€€€€€€€€€…É€ôµ…¹Õ…±É½ÕÁ…É¡Í•±•Ñ•‘…ä°¥¹‘•à°™…±Í”¤°(€€€€€€€€€ÍÑ…ÑÕÌ€ô…Éü¹ÍÑ…ÑÕÌ€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆ€ü€‰MÕ‰µ¥ÑÑ•ƒŠrLˆ€è…É€ü€‰É…™Ðˆ€è€‰9½ÐÍÑ…ÉÑ•ˆì(€€€€€€€É•ÑÕÉ¸€ñÍ•Ñ¥½¸±…ÍÌô‰µ…¹Õ…±Q•…µQ¥±”€‘í…Éü¹ÍÑ…ÑÕÌñð€‰•µÁÑä‰ôˆøñ‘¥ØøñÍµ…±°ùQ4€‘í¥¹‘•à€¬€Åôð½Íµ…±°øñ Ìø‘í¥‘Ì¹µ…À ¡¥¤€ôø€‘í•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ô‘í¥€ôôôÉ•Ä¹Ù¥ÉÑÕ…±%€ü€œ€ñ•´±…ÍÌô‰µ…¹Õ…±Y¥ÉÑÕ…±1…‰•°ˆø¡Y%IQU0A1eH¤ð½•´øœ€è€ˆ‰õ€¤¹©½¥¸ ˆƒ
Ü€ˆ¥ôð½ ÌøñÍÁ…¸ø‘íÍÑ…ÑÕÍôð½ÍÁ…¸øð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÌôˆ‘í…Éü¹ÍÑ…ÑÕÌ€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆ€ü€‰Í½™Ðˆ€è€‰ÁÉ¥µ…Éä‰ôˆ‘…Ñ„µ½Á•¹µ…¹Õ…±Ñ•…´ôˆ‘í¥¹‘•áôˆø‘í…Éü¹ÍÑ…ÑÕÌ€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆ€ü€‰I•Ù¥•Ü€¼‘¥Ðˆ€è…É€ü€‰½¹Ñ¥¹Õ”ˆ€è€‰=Á•¸Q•…´…É‰ôð½‰ÕÑÑ½¸øð½Í•Ñ¥½¸ù€ì(€€€€€ô¤(€€€€€€¹©½¥¸ ˆˆ¤ñð€œñÀ±…ÍÌô‰±•…‘•ÉµÁÑäˆùM…Ù”Ñ¡”Ñ•…µÌ™½ÈÑ¡¥Ì‘…ä‰•™½É”É•½É‘¥¹œÁ…Á•È…É‘Ì¸ð½Àøôð½‘¥Øø‘íµ…¹Õ…±M•±•Ñ•‘½µÁ•Ñ¥Ñ¥½¹Ì¡Í•±•Ñ•‘…ä¤¹¡…Ì ‰¹ÑÀˆ¤€üÉ•¹‘•É5…¹Õ…±9ÑÁ‘¥Ñ½È¡Í•±•Ñ•‘…ä¤€è€ˆ‰ôñ‘¥Ø±…ÍÌô‰µ…¹Õ…±…å¥¹¥Í ˆøñ‘¥Øøñˆø‘íµ…¹Õ…±…åI•…‘ä¡Í•±•Ñ•‘…ä¤€ü…ä€‘íÍ•±•Ñ•‘…åô•¹ÑÉä½µÁ±•Ñ”ƒŠrM€€è…ä€‘íÍ•±•Ñ•‘…åôÉ•µ…¥¹Ì¥¸ÁÉ½É•ÍÍôð½ˆøñÍÁ…¸ø‘íµ…¹Õ…±…åI•…‘ä¡Í•±•Ñ•‘…ä¤€ü€‰±°Á…Á•È…É‘Ì…¹9Q@É•ÍÕ±ÑÌ…É”É•…‘ä™½ÈÑ¡”±•…‘•É‰½…É‘Ì¸ˆ€è€‰MÕ‰µ¥Ð•Ù•ÉäÑ•…´…É…¹½µÁ±•Ñ”Ñ¡”9Q@É•ÍÕ±Ð‰•™½É”™¥¹¥Í¡¥¹œÑ¡”‘…ä¸‰ôð½ÍÁ…¸øð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰½µÁ±•Ñ•5…¹Õ…±…äˆ€‘íµ…¹Õ…±…åI•…‘ä¡Í•±•Ñ•‘…ä¤€ü€ˆˆ€è€‰‘¥Í…‰±•‰ôù½µÁ±•Ñ”…ä€‘íÍ•±•Ñ•‘…åôI•ÍÕ±ÑÌð½‰ÕÑÑ½¸øð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ð•µ•É•¹å±½Í”ˆ¥ô‰±½Í•5…¹Õ…±M½É•Ìˆù±½Í”ð½‰ÕÑÑ½¸ù€ì(€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹…‘ ‰½Á•¸ˆ¤ì(€€€€ m‘…Ñ„µµ…¹Õ…±‘…åtœ¤¹™½É…  (€€€€€€¡‰ÕÑÑ½¸¤€ôø(€€€€€€€€¡‰ÕÑÑ½¸¹½¹±¥¬€ô€ ¤€ôø½Á•¹5…¹Õ…±M½É•Ì ­‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹µ…¹Õ…±‘…ä¤¤°(€€€€¤ì(€€€€ m‘…Ñ„µ½Á•¹µ…¹Õ…±Ñ•…µtœ¤¹™½É…  (€€€€€€¡‰ÕÑÑ½¸¤€ôø(€€€€€€€€¡‰ÕÑÑ½¸¹½¹±¥¬€ô€ ¤€ôø(€€€€€€€€€É•¹‘•É5…¹Õ…±Q•…µ…É¡Í•±•Ñ•‘…ä°€­‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹½Á•¹µ…¹Õ…±Ñ•…´¤¤°(€€€€¤ì(€€€€ m‘…Ñ„µµ…¹Õ…°µ¹ÑÁtœ¤¹™½É…  ¡Í•±•Ð¤€ôøì(€€€€€Í•±•Ð¹½¹¡…¹”€ô€ ¤€ôøì(€€€€€€€‘…åMÑ½É”¹¹ÑÁmÍ•±•Ð¹‘…Ñ…Í•Ð¹µ…¹Õ…±9ÑÁt€ôÍ•±•Ð¹Ù…±Õ”ì(€€€€€€€‘…åMÑ½É”¹¹ÑÁ¥¹…±¥Í•€ô™…±Í”ì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€É•¹‘•É5…¹Õ…±M½É•Í…Í¡‰½…É¡Í•±•Ñ•‘…ä¤ì(€€€€€ôì(€€€ô¤ì(€€€€ ˆ½µÁ±•Ñ•5…¹Õ…±…äˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€¥˜€ …µ…¹Õ…±…åI•…‘ä¡Í•±•Ñ•‘…ä¤¤É•ÑÕÉ¸ì(€€€€€‘…åMÑ½É”¹ÍÑ…ÑÕÌ€ô€‰ÍÕ‰µ¥ÑÑ•ˆì(€€€€€‘…åMÑ½É”¹¹ÑÁ¥¹…±¥Í•€ôÑÉÕ”ì(€€€€€‘…åMÑ½É”¹½µÁ±•Ñ•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤(€€€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€É•¹‘•É!½µ” ¤ì(€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€É•¹‘•É5…¹Õ…±M½É•Í…Í¡‰½…É¡Í•±•Ñ•‘…ä¤ì(€€€ôì(€€€€ ˆ±½Í•5…¹Õ…±M½É•Ìˆ¤¹½¹±¥¬€ô€ ¤€ôø(€€€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€ô(€™Õ¹Ñ¥½¸½Á•¹5…¹Õ…±M½É•Ì¡‘…ä€ô€Ä¤ì(€€€¥˜€¡…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤¤ì(€€€€€…±•ÉÐ ‰µ‰É½Í”Á…Á•Èµ…É•¹ÑÉäÝ¥±°ÕÍ”¥ÑÌ‘•‘¥…Ñ•Ñ•…´Í½É”…¹Í•±•Ñ•µ‘É¥Ù•Ì…É¥¸Ñ¡”¹•áÐÍÑ…”¸ˆ¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€½¹ÍÐÍ•±•Ñ•‘…ä€ô5…Ñ ¹µ…à (€€€€€€€€Ä°(€€€€€€€5…Ñ ¹µ¥¸¡ÍÑ½É”¹•Ù•¹Ðü¹‘…åÌñð€Ä°€­‘…äñð€Ä¤°(€€€€€€¤°(€€€€€Õ¹ÍÕÁÁ½ÉÑ•€ôl(€€€€€l‰ÍÉ…Ñ ˆ°€‰MÉ…Ñ ‰t°(€€€€€l‰•±•Ñ¥Œˆ°€‰±•Ñ¥Œ‰t°(€€€t¹™¥±Ñ•È ¡m­•åt¤€ôøµ…¹Õ…±M•±•Ñ•‘½µÁ•Ñ¥Ñ¥½¹Ì¡Í•±•Ñ•‘…ä¤¹¡…Ì¡­•ä¤¤ì(€€€¥˜€¡Õ¹ÍÕÁÁ½ÉÑ•¹±•¹Ñ ¤ì(€€€€€…±•ÉÐ (€€€€€€€I•½É±°M½É•Ì‘½•Ì¹½Ðå•ÐÍÕÁÁ½ÉÐ€‘íÕ¹ÍÕÁÁ½ÉÑ•¹µ…À ¡l°±…‰•±t¤€ôø±…‰•°¤¹©½¥¸ ˆ°€ˆ¥ô½¸…ä€‘íÍ•±•Ñ•‘…åô¸-••ÀÕÍ¥¹œÁ¡½¹”Í½É¥¹œ™½ÈÑ¡…Ð‘…ä°½ÈÉ•µ½Ù”Ñ¡…Ð½µÁ•Ñ¥Ñ¥½¸‰•™½É”•¹Ñ•É¥¹œÁ…Á•È…É‘Ì¹€°(€€€€€€¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€É•¹‘•É5…¹Õ…±M½É•Í…Í¡‰½…É¡Í•±•Ñ•‘…ä¤ì(€ô((€™Õ¹Ñ¥½¸É•¹‘•É1¥Ù•Ù•¹Ñ½¹ÑÉ½° ¤ì(€€€½¹ÍÐ¡½ÍÐ€ô€ ˆ±¥Ù•Ù•¹Ñ½¹ÑÉ½°ˆ¤°(€€€€€‰…Í¥Œ€ô€ ˆ‰…Í¥Ù•¹ÑAÉ½É•ÍÌˆ¤ì(€€€¥˜€ …¡½ÍÐñð€…‰…Í¥Œ¤É•ÑÕÉ¸ì(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ðü¹ÍÑ…ÑÕÌ€ôôô€‰…¹•±±•ˆ¤ì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ˆˆì(€€€€€‰…Í¥Œ¹ÍÑå±”¹‘¥ÍÁ±…ä€ô€‰¹½¹”ˆì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ðü¹±½­•ñð¥ÍA±…å•É•Ù¥” ¤ñð¥ÍMÁ•Ñ…Ñ½É•Ù¥” ¤¤ì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ˆˆì(€€€€€‰…Í¥Œ¹ÍÑå±”¹‘¥ÍÁ±…ä€ô€ˆˆì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€‰…Í¥Œ¹ÍÑå±”¹‘¥ÍÁ±…ä€ô€‰¹½¹”ˆì(€€€½¹ÍÐ‘…åÌ€ôÍÑ½É”¹•Ù•¹Ð¹‘…åÌñð€Ä°(€€€€€‘…ä€ô5…Ñ ¹µ¥¸ (€€€€€€€‘…åÌ°(€€€€€€€€¬¡ÍÑ½É”¹•Ù•¹Ð¹±¥Ù•½¹ÑÉ½±…äñðÍÑ½É”¹•Ù•¹Ð¹…Ñ¥Ù•É½ÕÁ…äñð€Ä¤°(€€€€€€¤°(€€€€€¥‘Ì€ô‘…å¥•±‘%‘Ì¡‘…ä¤(€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤°(€€€€€É½ÝÌ€ô¥‘Ì(€€€€€€€€¹µ…À ¡¥¤€ôø±¥Ù•A±…å•ÉMÑ…ÑÕÌ¡‘…ä°¥¤¤(€€€€€€€€¹Í½ÉÐ (€€€€€€€€€€¡„°ˆ¤€ôø(€€€€€€€€€€€„¹É½ÕÀ€´ˆ¹É½ÕÀñð(€€€€€€€€€€€€¡•Ù•¹ÑA±…å•È¡„¹Á±…å•É%°‘…ä¤ü¹¹…µ”ñð€ˆˆ¤¹±½…±•½µÁ…É” (€€€€€€€€€€€€€•Ù•¹ÑA±…å•È¡ˆ¹Á±…å•É%°‘…ä¤ü¹¹…µ”ñð€ˆˆ°(€€€€€€€€€€€€¤°(€€€€€€€€¤°(€€€€€©½¥¹•€ôÉ½ÝÌ¹™¥±Ñ•È ¡à¤€ôøà¹©½¥¹•¤¹±•¹Ñ °(€€€€€Á±…å¥¹œ€ôÉ½ÝÌ¹™¥±Ñ•È (€€€€€€€€¡à¤€ôøà¹ÍÑ…Ñ”€ôôô€‰Á±…å¥¹œˆñðà¹ÍÑ…Ñ”€ôôô€‰É•…‘äˆ°(€€€€€€¤¹±•¹Ñ °(€€€€€…ÑÑ•¹Ñ¥½¸€ôÉ½ÝÌ¹™¥±Ñ•È ¡à¤€ôøà¹ÍÑ…Ñ”€ôôô€‰…ÑÑ•¹Ñ¥½¸ˆ¤¹±•¹Ñ °(€€€€€™¥¹…±¥Í•€ôÉ½ÝÌ¹™¥±Ñ•È ¡à¤€ôøà¹™¥¹…±¥Í•¤¹±•¹Ñ °(€€€€€…±±¥¹…°€ô	½½±•…¸¡É½ÝÌ¹±•¹Ñ €˜˜™¥¹…±¥Í•€ôôôÉ½ÝÌ¹±•¹Ñ ¤°(€€€€€Í½É¥¹=Á•¸€ôÍ½É¥¹%Í=Á•¸¡‘…ä¤ì(€€€Í¡•‘Õ±•M½É¥¹=Á•¹¥¹œ¡‘…ä¤ì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñÍ•Ñ¥½¸±…ÍÌô‰±¥Ù•½¹ÑÉ½±…Éˆøñ‘¥Ø±…ÍÌô‰±¥Ù•½¹ÑÉ½±!•…ˆøñ‘¥ØøñÍµ…±°ø‘íÍÑ½É”¹•Ù•¹Ð¹É¥‘•Q•ÍÑ5½‘”€ü€‰I%€ÄØµA1eHQMPˆ€èÍÑ½É”¹•Ù•¹Ð¹Ñ•ÍÑ5½‘”€ü€‰=Q19LQMPY9Pˆ€è€‰=I9%MHL1%YY9P=9QI=0‰ôð½Íµ…±°øñ Èø‘í‘…åÌ€ôôô€Ä€ü€‰I½Õ¹AÉ½É•ÍÌˆ€è…ä€‘í‘…åôI½Õ¹AÉ½É•ÍÍôð½ ÈøñÀùM•”Ý¡¼¥Ì½¹¹•Ñ•°Á±…å¥¹œ°Ý…¥Ñ¥¹œ™½È„Í½É”¡•¬½È™¥¹¥Í¡•¸ð½Àøð½‘¥Øøñ‘¥Ø±…ÍÌô‰±¥Ù•½¹ÑÉ½±Ñ¥½¹Ìˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰±¥Ù•=É…¹¥Í•É%¹ÍÑÉÕÑ¥½¹Ìˆù=É…¹¥Í•È%¹ÍÑÉÕÑ¥½¹Ìð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰µ…¹Õ…±M½É•Í	Ñ¸ˆ¥ô‰É•½É‘±±M½É•ÌˆùI•½É±°M½É•Ìð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰•µ•É•¹åI•½Ù•Éå	Ñ¸ˆ¥ô‰É•Á±…•I•…±A±…å•Èˆø‘íÍÑ½É”¹•Ù•¹Ð¹É•…±A±…å•ÉMÕ‰ÍÑ¥ÑÕÑ¥½¹A•¹‘¥¹œ€ü€‰I•ÑÉäMÕ‰ÍÑ¥ÑÕÑ”UÁ‘…Ñ”ˆ€è€‰I•Á±…”A±…å•È‰ôð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰•µ•É•¹åI•½Ù•Éå	Ñ¸ˆ¥ô‰µ¥ÍÍ¥¹A±…å•ÉI•Á±…•µ•¹Ðˆù5¥ÍÍ¥¹œA±…å•Èð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰•µ•É•¹åI•½Ù•Éå	Ñ¸ˆ¥ô‰•µ•É•¹åI•½Ù•Éäˆùµ•É•¹äM½É”I•½Ù•Éäð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰É•™É•Í¡1¥Ù•½¹ÑÉ½°ˆùI•™É•Í ð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øø‘í‘…åQ…‰Ì ‰±¥Ù•‘…äˆ°‘…ä¥ôñ‘¥Ø±…ÍÌô‰±¥Ù•½Õ¹Ñ•ÉÌˆøñ‘¥ØøñÍµ…±°ù)=%9ð½Íµ…±°øñˆø‘í©½¥¹•‘ôñ•´ø¼‘íÉ½ÝÌ¹±•¹Ñ¡ôð½•´øð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ùA1e%9ð½Íµ…±°øñˆø‘íÁ±…å¥¹ôð½ˆøð½‘¥Øøñ‘¥Ø±…ÍÌôˆ‘í…ÑÑ•¹Ñ¥½¸€ü€‰Ý…É¸ˆ€è€ˆ‰ôˆøñÍµ…±°ùQQ9Q%=8ð½Íµ…±°øñˆø‘í…ÑÑ•¹Ñ¥½¹ôð½ˆøð½‘¥Øøñ‘¥Ø±…ÍÌôˆ‘í…±±¥¹…°€ü€‰‘½¹”ˆ€è€ˆ‰ôˆøñÍµ…±°ù=5A1Qð½Íµ…±°øñˆø‘í™¥¹…±¥Í•‘ôñ•´ø¼‘íÉ½ÝÌ¹±•¹Ñ¡ôð½•´øð½ˆøð½‘¥Øøð½‘¥Øø‘í…±±¥¹…°€ü€ñ‘¥Ø±…ÍÌô‰ÁÉ¥é•I•…‘äˆøñ‘¥ØøñˆûŠrLAÉ¥é”¥Ù¥¹œI•…‘äð½ˆøñÍÁ…¸ø‘í‘…åÌ€ôôô€Ä€ü€‰Ù•ÉäÍ½É•…Éˆ€èÙ•Éä…ä€‘í‘…åôÍ½É•…É‘ô¥Ì½µÁ±•Ñ”¸ð½ÍÁ…¸øð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰½Á•¹AÉ¥é•MÕµµ…Éäˆù=Á•¸I•ÍÕ±ÑÌMÕµµ…Éäð½‰ÕÑÑ½¸øð½‘¥Øù€€è€ñ‘¥Ø±…ÍÌô‰É•ÍÕ±ÑÍ]…¥Ñ¥¹œˆøñˆùI•ÍÕ±ÑÌÉ•µ…¥¸%¸AÉ½É•ÍÌð½ˆøñÍÁ…¸ø‘íÉ½ÝÌ¹±•¹Ñ €´™¥¹…±¥Í•‘ôÁ±…å•È‘íÉ½ÝÌ¹±•¹Ñ €´™¥¹…±¥Í•€ôôô€Ä€ü€ˆˆ€è€‰Ì‰ôÍÑ¥±°Ñ¼½µÁ±•Ñ”‘í‘…åÌ€ôôô€Ä€ü€ˆ¸ˆ€è€…ä€‘í‘…åô¹ôð½ÍÁ…¸øð½‘¥Øùôñ‘¥Ø±…ÍÌô‰±¥Ù•A±…å•É1¥ÍÐˆø‘íÉ½ÝÌ¹µ…À ¡È¤€ôø€ñ‘¥Ø±…ÍÌô‰±¥Ù•A±…å•ÉI½Ü€‘íÈ¹ÍÑ…Ñ•ôˆøñ‘¥Ø±…ÍÌô‰±¥Ù•A±…å•É9…µ”ˆøñ¤±…ÍÌôˆ‘íÈ¹©½¥¹•€ü€‰½¹¹•Ñ•ˆ€è€ˆ‰ôˆøð½¤øñÍÁ…¸øñˆø‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡È¹Á±…å•É%°‘…ä¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½ˆøñÍµ…±°ùÉ½ÕÀ€‘íÈ¹É½ÕÁôƒ
Ü€‘íÈ¹©½¥¹•€ü€‰A¡½¹”©½¥¹•ˆ€è€‰9½Ð©½¥¹•‰ôð½Íµ…±°øð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰±¥Ù•AÉ½É•ÍÌˆøñÍÁ…¸øñ¤ÍÑå±”ô‰Ý¥‘Ñ è‘í5…Ñ ¹É½Õ¹ ¡È¹•¹Ñ•É•€¼€Äà¤€¨€ÄÀÀ¥ô”ˆøð½¤øð½ÍÁ…¸øñÍµ…±°ø‘íÈ¹•¹Ñ•É•‘ô¼Äàð½Íµ…±°øð½‘¥Øøñ‘¥Ø±…ÍÌô‰±¥Ù•A±…å•ÉMÑ…Ñ”ˆøñˆø‘í•ÍŒ¡È¹±…‰•°¥ôð½ˆøñÍµ…±°ø‘í•ÍŒ¡È¹‘•Ñ…¥°¥ôð½Íµ…±°øð½‘¥Øøð½‘¥Øù€¤¹©½¥¸ ˆˆ¤ñð€œñÀ±…ÍÌô‰±•…‘•ÉµÁÑäˆù9¼Á±…å•ÉÌ…É”…ÍÍ¥¹•™½ÈÑ¡¥Ì‘…ä¸ð½Àøôð½‘¥ØøñÀ±…ÍÌô‰±¥Ù•½¹ÑÉ½±9½Ñ”ˆùAÉ½É•ÍÌ™½±±½ÝÌ•… Á±…å•ÈÌ½™™¥¥…°µ…É­•È…É¸ÑÑ•¹Ñ¥½¸µ•…¹Ì„½µÁ±•Ñ”½™™¥¥…°…ÉÍÑ¥±°¡…Ì„Á±…å•È½µ…É­•È‘¥ÍÉ•Á…¹äÉ•ÅÕ¥É¥¹œÉ•Ù¥•Ü¸€ñ‰ÕÑÑ½¸±…ÍÌô‰Ñ•ÍÑQ½½±Í1¥¹¬ˆ¥ô‰Ñ•ÍÑÙ•¹ÑQ½½±ÌˆùQ•ÍÑ¥¹œQ½½±Ìð½‰ÕÑÑ½¸øð½Àøð½Í•Ñ¥½¸ù€ì(€€€¥˜€ …Í½É¥¹=Á•¸¤ì(€€€€€½¹ÍÐ…Ñ¥½¹Ì€ô¡½ÍÐ¹ÅÕ•ÉåM•±•Ñ½È ˆ¹±¥Ù•½¹ÑÉ½±Ñ¥½¹Ìˆ¤ì(€€€€€…Ñ¥½¹Ìü¹¥¹Í•ÉÑ‘©…•¹Ñ!Q50 ‰…™Ñ•É‰•¥¸ˆ°€œñ‰ÕÑÑ½¸±…ÍÌô‰•µ•É•¹åI•½Ù•Éå	Ñ¸ˆ¥ô‰½Á•¹M½É¥¹9½Üˆù=Á•¸M½É¥¹œ9½Üð½‰ÕÑÑ½¸øœ¤ì(€€€€€¡½ÍÐ¹ÅÕ•ÉåM•±•Ñ½È ˆ¹±¥Ù•½¹ÑÉ½±!•…Àˆ¤¹Ñ•áÑ½¹Ñ•¹Ð€ôM½É¥¹œ½Á•¹Ì…Ð€‘íÍ½É¥¹=Á•¹¥¹1…‰•°¡‘…ä¥ô°€ÄÔµ¥¹ÕÑ•Ì‰•™½É”Ñ¡”™¥ÉÍÐÑ•”Ñ¥µ”¹€ì(€€€ô(€€€€ ‰m‘…Ñ„µ±¥Ù•‘…åtˆ¤¹™½É…  (€€€€€€¡ˆ¤€ôø(€€€€€€€€¡ˆ¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±¥Ù•½¹ÑÉ½±…ä€ô€­ˆ¹‘…Ñ…Í•Ð¹±¥Ù•‘…äì(€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€É•¹‘•É1¥Ù•Ù•¹Ñ½¹ÑÉ½° ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ˆÉ•™É•Í¡1¥Ù•½¹ÑÉ½°ˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€…Ý…¥ÐÍå¹±½Õ‘9½Ü ¤ì(€€€€€É•¹‘•É1¥Ù•Ù•¹Ñ½¹ÑÉ½° ¤ì(€€€ôì(€€€€ ˆ•µ•É•¹åI•½Ù•Éäˆ¤¹½¹±¥¬€ô½Á•¹µ•É•¹åI•½Ù•Éäì(€€€€ ˆÉ•½É‘±±M½É•Ìˆ¤¹½¹±¥¬€ô€ ¤€ôø½Á•¹5…¹Õ…±M½É•Ì¡‘…ä¤ì(€€€€ ˆµ¥ÍÍ¥¹A±…å•ÉI•Á±…•µ•¹Ðˆ¤¹½¹±¥¬€ô€ ¤€ôø½Á•¹5¥ÍÍ¥¹A±…å•ÉI•Á±…•µ•¹Ð¡‘…ä¤ì(€€€€ ˆÉ•Á±…•I•…±A±…å•Èˆ¤¹½¹±¥¬€ô€ ¤€ôø½Á•¹A±…å•ÉMÕ‰ÍÑ¥ÑÕÑ¥½¸¡‘…ä¤ì(€€€€ ˆ±¥Ù•=É…¹¥Í•É%¹ÍÑÉÕÑ¥½¹Ìˆ¤¹½¹±¥¬€ô½Á•¹=É…¹¥Í•É%¹ÍÑÉÕÑ¥½¹Ìì(€€€¥˜€  ˆ½Á•¹M½É¥¹9½Üˆ¤¤(€€€€€€ ˆ½Á•¹M½É¥¹9½Üˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€€€¥˜€ …½¹™¥É´¡=Á•¸…±°…ä€‘í‘…åôÍ½É•…É‘Ì¹½Üý€¤¤É•ÑÕÉ¸ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹=Á•¹•‘…É±ä€ôÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹=Á•¹•‘…É±äñðíôì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹=Á•¹•‘…É±ål‰‘…äˆ€¬‘…åt€ôÑÉÕ”ì(€€€€€€€Á•ÉÍ¥ÍÑMÑ½É” ¤ì(€€€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤(€€€€€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€€€É•¹‘•É1¥Ù•Ù•¹Ñ½¹ÑÉ½° ¤ì(€€€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€ôì(€€€¥˜€  ˆ½Á•¹AÉ¥é•MÕµµ…Éäˆ¤¤(€€€€€€ ˆ½Á•¹AÉ¥é•MÕµµ…Éäˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Y¥•Ü€ô€‰ÍÕµµ…Éäˆì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€¹…Ø ‰±•…‘•É‰½…É‘A…”ˆ¤ì(€€€€€ôì(€ô((€™Õ¹Ñ¥½¸±½Í•±½Õ‘½¹¹•Ñ¥½¸ ¤ì(€€€±½Õ‘	ÕÍä€ô™…±Í”ì(€€€±•…ÉQ¥µ•½ÕÐ¡±½Õ‘I•±½…‘Q¥µ•È¤ì(€€€±½Õ‘I•±½…‘Q¥µ•È€ô¹Õ±°ì(€€€™½È€¡½¹ÍÐÑ¥µ•È½˜±½Õ‘I½Õ¹‘Q¥µ•ÉÌ¹Ù…±Õ•Ì ¤¤±•…ÉQ¥µ•½ÕÐ¡Ñ¥µ•È¤ì(€€€±½Õ‘I½Õ¹‘Q¥µ•ÉÌ¹±•…È ¤ì(€€€±½Õ‘I½Õ¹‘¡…¥¹Ì¹±•…È ¤ì(€€€±…ÍÑ±½Õ‘	Õ¹‘±•M¥¹…ÑÕÉ”€ô€ˆˆì(€€€¥˜€¡±½Õ‘¡…¹¹•°€˜˜Ý…å±½Õü¹±¥•¹Ðü¹É•µ½Ù•¡…¹¹•°¤(€€€€€Ý…å±½Õ¹±¥•¹Ð¹É•µ½Ù•¡…¹¹•°¡±½Õ‘¡…¹¹•°¤ì(€€€±½Õ‘¡…¹¹•°€ô¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸½Á•¹Ù•¹Ñ=ÁÑ¥½¹Ì ¤ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ð¤É•ÑÕÉ¸ì(€€€¥˜€¡¥ÍÕ•ÍÑ=É…¹¥Í•È ¤¤ì(€€€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹¥¹¹•É!Q50€ô€ñ ÈùÙ•¹Ð=ÁÑ¥½¹Ìð½ ÈøñÀøñˆø‘í•ÍŒ¡ÍÑ½É”¹•Ù•¹Ð¹¹…µ”¥ôð½ˆøð½ÀøñÀùe½ÕÈÕ•ÍÐ=É…¹¥Í•È…•ÍÌ¥Ì±¥µ¥Ñ•Ñ¼Á±…¹¹¥¹œ…¹½Á•É…Ñ¥¹œÑ¡¥Ì•Ù•¹Ð¸ð½Àøñ‘¥Ø±…ÍÌô‰•Ù•¹Ñ=ÁÑ¥½¹Ñ¥½¹Ìˆøñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰½¹Ñ¥¹Õ•Ù•¹ÑM•ÑÕÀˆù½¹Ñ¥¹Õ”Ù•¹ÐM•ÑÕÀð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰±½Í•Ù•¹Ñ=ÁÑ¥½¹Ìˆù±½Í”ð½‰ÕÑÑ½¸øð½‘¥Øù€ì(€€€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹…‘ ‰½Á•¸ˆ¤ì(€€€€€€ ˆ½¹Ñ¥¹Õ•Ù•¹ÑM•ÑÕÀˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€€€€€€€É•½Á•¹Ù•¹ÑA±…¸ ¤ì(€€€€€ôì(€€€€€€ ˆ±½Í•Ù•¹Ñ=ÁÑ¥½¹Ìˆ¤¹½¹±¥¬€ô€ ¤€ôø€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹Ñ•ÍÑ5½‘”¤ì(€€€€€…±•ÉÐ ‰UÍ”Q•ÍÑ¥¹œQ½½±ÌÑ¼¡…¹”½È™¥¹¥Í Ñ¡”ÁÉ½Ñ•Ñ•Ñ•ÍÐ•Ù•¹Ð¸ˆ¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€½¹ÍÐ…¹•±±•€ôÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÑÕÌ€ôôô€‰…¹•±±•ˆì(€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹¥¹¹•É!Q50€ô(€€€€€€ñ ÈùÙ•¹Ð=ÁÑ¥½¹Ìð½ ÈøñÀøñˆø‘í•ÍŒ¡ÍÑ½É”¹•Ù•¹Ð¹¹…µ”¥ôð½ˆøð½ÀøñÀø‘í…¹•±±•€ü€‰Q¡¥Ì•Ù•¹Ð¥Ì…±É•…‘ä…¹•±±•¸e½Ôµ…äÉ•Ñ…¥¸¥Ð™½ÈÉ•™•É•¹”½È‘•±•Ñ”¥Ð™É½´Ñ¡¥Ì‘•Ù¥”¸ˆ€è€‰½¹Ñ¥¹Õ”Á±…¹¹¥¹œ°…¹•°…¸•Ù•¹ÐÑ¡…ÐÝ¥±°¹½ÐÁÉ½••°½ÈÁ•Éµ…¹•¹Ñ±ä‘•±•Ñ”…¸Õ¹Ý…¹Ñ•‘•Í¥¸½‘É…™Ð•Ù•¹Ð¸‰ôð½Àøñ‘¥Ø±…ÍÌô‰•Ù•¹Ñ=ÁÑ¥½¹Ñ¥½¹Ìˆø‘í…¹•±±•€ü€ˆˆ€è€œñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰½¹Ñ¥¹Õ•Ù•¹ÑM•ÑÕÀˆù½¹Ñ¥¹Õ”Ù•¹ÐM•ÑÕÀð½‰ÕÑÑ½¸øô‘ì……¹•±±•˜™ÍÑ½É”¹•Ù•¹Ð¹±½­•˜˜­ÍÑ½É”¹•Ù•¹Ð¹‘…åÌøÄüœñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰µ½‘¥™åÕÑÕÉ•I½Õ¹‘Ìˆù5½‘¥™äÕÑÕÉ”I½Õ¹‘Ìð½‰ÕÑÑ½¸øœèˆ‰ô‘í…¹•±±•€ü€ˆˆ€è€ñ‰ÕÑÑ½¸±…ÍÌô‰‘…¹•Èˆ¥ô‰…¹•±ÕÉÉ•¹ÑÙ•¹Ðˆù…¹•°Ù•¹Ðð½‰ÕÑÑ½¸ùôñ‰ÕÑÑ½¸±…ÍÌô‰‘…¹•Èˆ¥ô‰‘•±•Ñ•ÕÉÉ•¹ÑÙ•¹Ðˆù•±•Ñ”Ù•¹Ð™É½´Q¡¥Ì•Ù¥”ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰‘…¹•È±•…ÉQ•ÍÑÍ	Ñ¸ˆ¥ô‰±•…ÉAÉ•Ù¥½ÕÍQ•ÍÑÌˆù±•…È±°AÉ•Ù¥½ÕÌQ•ÍÐÙ•¹ÑÌð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰ÁÉ•Á…É•A±…å•É•Ù¥”ˆùAÉ•Á…É”Q¡¥Ì•Ù¥”™½ÈA±…å•ÈUÍ”ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰±½Í•Ù•¹Ñ=ÁÑ¥½¹Ìˆù-••ÀÙ•¹Ð…¹±½Í”ð½‰ÕÑÑ½¸øð½‘¥ØøñÀ±…ÍÌô‰‰…­ÕÁM…™•Ñå9½Ñ”ˆøñˆù•Ù¥”µ½¹±ä±•…¹ÕÀèð½ˆøAÉ•Á…É¥¹œÑ¡¥Ì‘•Ù¥”™½ÈÁ±…å•ÈÕÍ”É•µ½Ù•Ì¥ÑÌ±½…°½É…¹¥Í•Èµ•Ù•¹Ð±¥ÍÐ½¹±ä¸%Ð…¹¹½Ð…±Ñ•ÈMÕÁ…‰…Í”°…¹½Ñ¡•ÈÁ¡½¹”½ÈÑ…‰±•Ð°½ÈÑ¡”½É…¹¥Í•ÈA¸ð½Àù€ì(€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹…‘ ‰½Á•¸ˆ¤ì(€€€¥˜€  ˆ…¹•±ÕÉÉ•¹ÑÙ•¹Ðˆ¤¤(€€€€€€ ˆ…¹•±ÕÉÉ•¹ÑÙ•¹Ðˆ¤¹½¹±¥¬€ô…¹•±ÕÉÉ•¹ÑÙ•¹Ðì(€€€¥˜€  ˆ½¹Ñ¥¹Õ•Ù•¹ÑM•ÑÕÀˆ¤¤(€€€€€€ ˆ½¹Ñ¥¹Õ•Ù•¹ÑM•ÑÕÀˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€€€€€€€É•½Á•¹Ù•¹ÑA±…¸ ¤ì(€€€€€ôì(€€€¥˜€  ˆµ½‘¥™åÕÑÕÉ•I½Õ¹‘Ìˆ¤¤€ ˆµ½‘¥™åÕÑÕÉ•I½Õ¹‘Ìˆ¤¹½¹±¥¬€ô½Á•¹ÕÑÕÉ•I½Õ¹‘‘¥Ñ½Èì(€€€€ ˆ‘•±•Ñ•ÕÉÉ•¹ÑÙ•¹Ðˆ¤¹½¹±¥¬€ô‘•±•Ñ•ÕÉÉ•¹ÑÙ•¹Ðì(€€€€ ˆ±•…ÉAÉ•Ù¥½ÕÍQ•ÍÑÌˆ¤¹½¹±¥¬€ô±•…ÉAÉ•Ù¥½ÕÍQ•ÍÑÙ•¹ÑÌì(€€€€ ˆÁÉ•Á…É•A±…å•É•Ù¥”ˆ¤¹½¹±¥¬€ôÁÉ•Á…É••Ù¥•½ÉA±…å•ÉUÍ”ì(€€€€ ˆ±½Í•Ù•¹Ñ=ÁÑ¥½¹Ìˆ¤¹½¹±¥¬€ô€ ¤€ôø(€€€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€ô(€™Õ¹Ñ¥½¸•Ù•¹Ñ…åMÑ…ÉÑ•¡‘…ä¤ì(€€€¥˜€¡•Ù•¹Ñ…å½µÁ±•Ñ”¡‘…ä¤ñðµ…¹Õ…±…åMÑ½É”¡‘…ä±™…±Í”¤ü¹ÍÑ…ÑÕÌ¤É•ÑÕÉ¸ÑÉÕ”ì(€€€¥˜€¡=‰©•Ð¹Ù…±Õ•Ì¡ÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹œü¹l‰‘…äˆ­‘…åuññíô¤¹Í½µ”¡É½Õ¹ôù=‰©•Ð¹­•åÌ¡É½Õ¹‘ññíô¤¹Í½µ”¡­•äôø½x¡lÄ´åuðÅlÀ´át¤¼¹Ñ•ÍÐ¡­•ä¤¤¤¤É•ÑÕÉ¸ÑÉÕ”ì(€€€É•ÑÕÉ¸=‰©•Ð¹­•åÌ¡ÍÑ½É”¹•Ù•¹Ð¹™¥¹…±M½É•Ìü¹l‰‘…äˆ­‘…åuññíô¤¹±•¹Ñ øÀì(€ô(€™Õ¹Ñ¥½¸½Á•¹ÕÑÕÉ•I½Õ¹‘‘¥Ñ½È ¤ì(€€€½¹ÍÐ•‘¥Ñ…‰±”õ•Ù•¹Ñ…åÌ ¤¹™¥±Ñ•È¡‘…äôø…•Ù•¹Ñ…åMÑ…ÉÑ•¡‘…ä¤¤ì(€€€¥˜ …•‘¥Ñ…‰±”¹±•¹Ñ ¥É•ÑÕÉ¸…±•ÉÐ ‰Ù•ÉäÁ±…å¥¹œ‘…ä¡…ÌÍÑ…ÉÑ•½È™¥¹¥Í¡•¸½µÁ±•Ñ•Í½É¥¹œ…¹¹½Ð‰”¡…¹•¸ˆ¤ì(€€€½¹ÍÐ¥‘Ìõ=‰©•Ð¹­•åÌ¡½µÁ•Ñ¥Ñ¥½¹9…µ•Ì¤¹™¥±Ñ•È¡¥ôù¥„ôô‰•±•Ñ¥Œ‰ññ•±•Ñ¥½ÕÉÍ•É½ÕÁÌ¡ÍÑ½É”¹•Ù•¹Ð¤¹±•¹Ñ øÀ¤ì(€€€€ ˆµ½‘…±½¹Ñ•¹Ðˆ¤¹¥¹¹•É!Q50õ€ñ Èù5½‘¥™äÕÑÕÉ”I½Õ¹‘Ìð½ ÈøñÀù=¹±äÕ¹ÍÑ…ÉÑ•‘…åÌ…¸¡…¹”¸½µÁ±•Ñ•…¹ÍÑ…ÉÑ•É½Õ¹‘ÌÉ•µ…¥¸±½­•¸ð½Àøñ‘¥Ø±…ÍÌô‰™ÕÑÕÉ•I½Õ¹‘‘¥Ñ½Èˆø‘í•Ù•¹Ñ…åÌ ¤¹µ…À¡‘…äôùí½¹ÍÐ±½­•ô…•‘¥Ñ…‰±”¹¥¹±Õ‘•Ì¡‘…ä¤íÉ•ÑÕÉ¸€ñÍ•Ñ¥½¸±…ÍÌôˆ‘í±½­•ü‰±½­•ˆèˆ‰ôˆøñ Ìù…ä€‘í‘…åô€‘í±½­•ü‹ŠP1½­•ˆèˆ‰ôð½ Ìøñ±…‰•°ùM½É”•¹ÑÉäµ•Ñ¡½ñÍ•±•Ð‘…Ñ„µ™ÕÑÕÉ•µ•Ñ¡½ôˆ‘í‘…åôˆ€‘í±½­•ü‰‘¥Í…‰±•ˆèˆ‰ôø‘í=‰©•Ð¹•¹ÑÉ¥•Ì¡M=I%9}5Q!=L¤¹µ…À ¡mÙ…±Õ”±±…‰•±t¤ôù€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘íÙ…±Õ•ôˆ€‘í‘…åM½É¥¹5•Ñ¡½¡‘…ä¤ôôõÙ…±Õ”ü‰Í•±•Ñ•ˆèˆ‰ôø‘í±…‰•±ôð½½ÁÑ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½Í•±•Ðøð½±…‰•°øñ‘¥Ø±…ÍÌô‰™ÕÑÕÉ•½µÁ•Ñ¥Ñ¥½¹Ìˆø‘í¥‘Ì¹µ…À¡¥ôù€ñ±…‰•°øñ¥¹ÁÕÐÑåÁ”ô‰¡•­‰½àˆ‘…Ñ„µ™ÕÑÕÉ•½µÀôˆ‘í‘…åõð‘í¥‘ôˆ€‘í½µÁ•Ñ¥Ñ¥½¹%Í=¸¡¥±‘…ä¤ü‰¡•­•ˆèˆ‰ô€‘í±½­•ü‰‘¥Í…‰±•ˆèˆ‰ôø€‘í•ÍŒ¡½µÁ•Ñ¥Ñ¥½¹9…µ•Ím¥‘uññ¥¥ôð½±…‰•°ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½Í•Ñ¥½¸ùô¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰Í…Ù•ÕÑÕÉ•I½Õ¹‘ÌˆùAÕ‰±¥Í ÕÑÕÉ”µI½Õ¹UÁ‘…Ñ”ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰…¹•±ÕÑÕÉ•I½Õ¹‘Ìˆù…¹•°ð½‰ÕÑÑ½¸ù€ì(€€€€ ˆ…¹•±ÕÑÕÉ•I½Õ¹‘Ìˆ¤¹½¹±¥¬ô ¤ôù½Á•¹Ù•¹Ñ=ÁÑ¥½¹Ì ¤ì(€€€€ ˆÍ…Ù•ÕÑÕÉ•I½Õ¹‘Ìˆ¤¹½¹±¥¬õ…Íå¹Œ ¤ôùì(€€€€€½¹ÍÐ¹•áÑ5•Ñ¡½‘Ìõì¸¸¸¡ÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹5•Ñ¡½‘Íññíô¥ô°¹•áÑ…åÌõ)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡ÍÑ½É”¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÍññíô¤¤ì(€€€€€•‘¥Ñ…‰±”¹™½É… ¡‘…äôùí¹•áÑ5•Ñ¡½‘Íl‰‘…äˆ­‘…åtô¡m‘…Ñ„µ™ÕÑÕÉ•µ•Ñ¡½ôˆ‘í‘…åô‰u€¤¹Ù…±Õ”í¥‘Ì¹™½É… ¡¥ôùí½¹ÍÐ…±°õ¹•ÜM•Ð¡½µÁ•Ñ¥Ñ¥½¹…åÌ¡¥¤¤ì¡m‘…Ñ„µ™ÕÑÕÉ•½µÀôˆ‘í‘…åõð‘í¥‘ô‰u€¤¹¡•­•ý…±°¹…‘¡‘…ä¤é…±°¹‘•±•Ñ”¡‘…ä¤í¹•áÑ…åÍm¥‘tõl¸¸¹…±±t¹Í½ÉÐ ¡„±ˆ¤ôù„µˆ¤íô¤íô¤ì(€€€€€™½È¡½¹ÍÐ‘…ä½˜•‘¥Ñ…‰±”¥í½¹ÍÐ…Ñ¥Ù”ô¡ÍÑ½É”¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹Íññmt¤¹™¥±Ñ•È¡¥ôø¡¹•áÑ…åÍm¥‘uññ½µÁ•Ñ¥Ñ¥½¹…åÌ¡¥¤¤¹¥¹±Õ‘•Ì¡‘…ä¤¤í¥˜ ……Ñ¥Ù”¹±•¹Ñ ¥É•ÑÕÉ¸…±•ÉÐ¡…ä€‘í‘…åô¹••‘Ì…Ð±•…ÍÐ½¹”½µÁ•Ñ¥Ñ¥½¸¹€¤í½¹ÍÐ½¹™±¥ÑÌõ…Ñ¥Ù”¹™¥±Ñ•È¡¥ôø…™¥¹…±M½É•½µÁ•Ñ¥Ñ¥½¹±±½Ý•¡¥±¹•áÑ5•Ñ¡½‘Íl‰‘…äˆ­‘…åt¤¤í¥˜¡½¹™±¥ÑÌ¹±•¹Ñ ¥É•ÑÕÉ¸…±•ÉÐ¡…ä€‘í‘…åô…¹¹½ÐÕÍ”€‘í½¹™±¥ÑÌ¹µ…À¡¥ôù½µÁ•Ñ¥Ñ¥½¹9…µ•Ím¥‘uññ¥¤¹©½¥¸ ˆ°€ˆ¥ôÝ¥Ñ €‘íM=I%9}5Q!=Mm¹•áÑ5•Ñ¡½‘Íl‰‘…äˆ­‘…åuuô¹€¤íô(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Í½É¥¹5•Ñ¡½‘Ìõ¹•áÑ5•Ñ¡½‘ÌíÍÑ½É”¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹…åÌõ¹•áÑ…åÌíÍÑ½É”¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹Ìõ¥‘Ì¹™¥±Ñ•È¡¥ôø¡¹•áÑ…åÍm¥‘uññmt¤¹±•¹Ñ¡ñð ¡ÍÑ½É”¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹Íññmt¤¹¥¹±Õ‘•Ì¡¥¤˜™•Ù•¹Ñ…åÌ ¤¹Í½µ”¡‘…äôø…•‘¥Ñ…‰±”¹¥¹±Õ‘•Ì¡‘…ä¤˜™½µÁ•Ñ¥Ñ¥½¹%Í=¸¡¥±‘…ä¤¤¤¤íÍÑ½É”¹•Ù•¹Ð¹™ÕÑÕÉ•I½Õ¹‘I•Ù¥Í¥½¸ô ­ÍÑ½É”¹•Ù•¹Ð¹™ÕÑÕÉ•I½Õ¹‘I•Ù¥Í¥½¹ñðÀ¤¬ÄíÍÑ½É”¹•Ù•¹Ð¹™¥¹…±UÁ‘…Ñ•Ðõ¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤íÍ…Ù” ¤ì(€€€€€¥˜¡ÍÑ½É”¹±½Õü¹É½±”ôôô‰½É…¹¥Í•Èˆ˜™ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¥…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€…±•ÉÐ ‰ÕÑÕÉ”µÉ½Õ¹ÕÁ‘…Ñ”ÁÕ‰±¥Í¡•¸A±…å•ÈÁ¡½¹•ÌÝ¥±°É••¥Ù”Ñ¡”É•Ù¥Í•½µÁ•Ñ¥Ñ¥½¹Ì…¹Í½É¥¹œµ•Ñ¡½¸ˆ¤ì ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤íÉ•¹‘•É!½µ” ¤ì(€€€ôì(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸ÁÉ•Á…É••Ù¥•½ÉA±…å•ÉUÍ” ¤ì(€€€¥˜€ …½¹™¥É´ ‰AÉ•Á…É”Q!%L‘•Ù¥”™½ÈÁ±…å•ÈÕÍ”ýq¹q¹±°½É…¹¥Í•È•Ù•¹ÑÌÍ…Ù•½¸Ñ¡¥Ì‘•Ù¥”Ý¥±°‰”É•µ½Ù•¸A±…å•ÉÌ…¹½ÕÉÍ•ÌÝ¥±°É•µ…¥¸¸MÕÁ…‰…Í”°Ñ¡”½É…¹¥Í•ÈA…¹•Ù•Éä½Ñ¡•È‘•Ù¥”Ý¥±°‰”Õ¹¡…¹•¸ˆ¤¤É•ÑÕÉ¸ì(€€€¥˜€ …½¹™¥É´ ‰¥¹…°¡•¬èÉ•µ½Ù”Ñ¡¥Ì‘•Ù¥”Ì½É…¹¥Í•Èµ•Ù•¹Ð±¥ÍÐ¹½Üüˆ¤¤É•ÑÕÉ¸ì(€€€ÑÉäì(€€€€€±½…±MÑ½É…”¹Í•Ñ%Ñ•´ (€€€€€€€AI}Y%}1I}	-UA}-d°(€€€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡•áÁ¥É¥¹M…™•Ñå	…­ÕÀ¡½É…¹¥Í•É	…­ÕÁA…å±½… ¤¤¤°(€€€€€€¤ì(€€€€€±½Í•±½Õ‘½¹¹•Ñ¥½¸ ¤ì(€€€€€…Ý…¥ÐÉ•±•…Í•I½Õ¹‘]…­•1½¬ ¤ì(€€€€€Ý½É­ÍÁ…•M¡É¥¹­ÕÑ¡½É¥Í•€ôÑÉÕ”ì(€€€€€ÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…”€ômtì(€€€€€ÍÑ½É”¹…Ñ¥Ù•Ù•¹Ñ%€ô¹Õ±°ì(€€€€€ÍÑ½É”¹•Ù•¹Ð€ô¹Õ±°ì(€€€€€‘•±•Ñ”ÍÑ½É”¹±½Õì(€€€€€ÍÑ½É”¹±½Õ‘A±…å•ÉÌ€ômtì(€€€€€™½É•Ñ=É…¹¥Í•ÉÙ•¹Ð ¤ì(€€€€€±½…±MÑ½É…”¹É•µ½Ù•%Ñ•´¡I9Q}AU	1%M!}-d¤ì(€€€€€±½…±MÑ½É…”¹É•µ½Ù•%Ñ•´ ‰…Ý…å½±™Q•ÍÑ	…­ÕÁXÄˆ¤ì(€€€€€±½…±MÑ½É…”¹É•µ½Ù•%Ñ•´ ‰…Ý…å½±™I¥‘•Q•ÍÑ	…­ÕÁXÄˆ¤ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€€€€€…ÁÁ±å•Ù¥•I½±” ¤ì(€€€€€É•¹‘•É!½µ” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€¹…Ø ‰¡½µ”ˆ¤ì(€€€€€ÕÁ‘…Ñ••Ù¥•±•…ÉI•½Ù•Éå	ÕÑÑ½¸ ¤ì(€€€€€…±•ÉÐ ‰Q¡¥Ì‘•Ù¥”¥ÌÉ•…‘ä™½ÈÁ±…å•ÈÕÍ”¸%ÑÌ½É…¹¥Í•È•Ù•¹ÑÌÝ•É”±•…É•±½…±±äìMÕÁ…‰…Í”…¹…±°½Ñ¡•È‘•Ù¥•ÌÝ•É”Õ¹¡…¹•¸¹Ñ•ÈÑ¡”¹•Ü•Ù•¹Ð½‘”Ý¡•¸¥Ð¥ÌÍÕÁÁ±¥•¸ˆ¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€…±•ÉÐ ‰Q¡¥Ì‘•Ù¥”Ý…Ì¹½Ð±•…É•¸€ˆ€¬€¡•ÉÉ½È¹µ•ÍÍ…”ñð•ÉÉ½È¤¤ì(€€€ô(€ô(€™Õ¹Ñ¥½¸ÕÁ‘…Ñ••Ù¥•±•…ÉI•½Ù•Éå	ÕÑÑ½¸ ¤ì(€€€½¹ÍÐ‰ÕÑÑ½¸€ô€ ˆÉ•ÍÑ½É•±•…É•‘=É…¹¥Í•ÉÙ•¹ÑÌˆ¤ì(€€€¥˜€¡‰ÕÑÑ½¸¤(€€€€€‰ÕÑÑ½¸¹¡¥‘‘•¸€ô€…±½…±MÑ½É…”¹•Ñ%Ñ•´¡AI}Y%}1I}	-UA}-d¤ì(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸É•ÍÑ½É•±•…É•‘=É…¹¥Í•ÉÙ•¹ÑÌ ¤ì(€€€±•ÐÍ…™•Ñä€ô¹Õ±°ì(€€€ÑÉäì(€€€€€Í…™•Ñä€ô)M=8¹Á…ÉÍ” (€€€€€€€±½…±MÑ½É…”¹•Ñ%Ñ•´¡AI}Y%}1I}	-UA}-d¤ñð€‰¹Õ±°ˆ°(€€€€€€¤ì(€€€ô…Ñ €¡|¤íô(€€€¥˜€ …Í…™•Ñä¤É•ÑÕÉ¸ÕÁ‘…Ñ••Ù¥•±•…ÉI•½Ù•Éå	ÕÑÑ½¸ ¤ì(€€€¥˜€ …½¹™¥É´ ‰I•ÍÑ½É”Ñ¡”½É…¹¥Í•È•Ù•¹ÑÌÑ¡…ÐÝ•É”±•…É•™É½´Ñ¡¥Ì‘•Ù¥”ýq¹q¹Q¡¥ÌÉ•ÍÑ½É•Ì½¹±äÑ¡”±½…°‰…­ÕÀ…¹‘½•Ì¹½ÐÁÕ‰±¥Í …¹åÑ¡¥¹œ¸ˆ¤¤É•ÑÕÉ¸ì(€€€ÑÉäì(€€€€€…Ý…¥Ð…ÁÁ±å=É…¹¥Í•É	…­ÕÀ¡Í…™•Ñä°™…±Í”¤ì(€€€€€±½…±MÑ½É…”¹É•µ½Ù•%Ñ•´¡AI}Y%}1I}	-UA}-d¤ì(€€€€€ÕÁ‘…Ñ••Ù¥•±•…ÉI•½Ù•Éå	ÕÑÑ½¸ ¤ì(€€€€€…±•ÉÐ ‰Q¡”½É…¹¥Í•È•Ù•¹ÑÌ½¸Ñ¡¥Ì‘•Ù¥”¡…Ù”‰••¸É•ÍÑ½É•¸ˆ¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€…±•ÉÐ ‰Q¡”½É…¹¥Í•È•Ù•¹ÑÌ½Õ±¹½Ð‰”É•ÍÑ½É•¸€ˆ€¬€¡•ÉÉ½È¹µ•ÍÍ…”ñð•ÉÉ½È¤¤ì(€€€ô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸±•…ÉAÉ•Ù¥½ÕÍQ•ÍÑÙ•¹ÑÌ ¤ì(€€€¥˜€ (€€€€€€…½¹™¥É´ (€€€€€€€€‰±•…È10ÁÉ•Ù¥½ÕÌÑ•ÍÐ•Ù•¹ÑÌýq¹q¹=¹±äÁÕ‰±¥Í¡••Ù•¹ÑÌÝ¥Ñ QMP¥¸Ñ¡•¥È•Ù•¹Ð¹…µ”Ý¥±°‰”…É¡¥Ù•¸•¹Õ¥¹”•Ù•¹ÑÌÝ¥±°É•µ…¥¸Õ¹Ñ½Õ¡•¸½¹¹•Ñ•Ñ•ÍÐÁ¡½¹•Ì…¹Ñ…‰±•ÑÌÝ¥±°‰”‘¥Í½¹¹•Ñ•…¹±½…°Ñ•ÍÐÍ½É•ÌÝ¥±°‰”É•µ½Ù•¸A±…å•ÉÌ°½ÕÉÍ•Ì…¹Í½É•…É‘ÌÝ¥±°É•µ…¥¸¸ˆ°(€€€€€€¤(€€€€¤(€€€€€É•ÑÕÉ¸ì(€€€¥˜€ …½¹™¥É´ ‰¥¹…°¡•¬è±•…È…±°ÁÉ•Ù¥½ÕÌÑ•ÍÐ•Ù•¹ÑÌ¹½Üüˆ¤¤É•ÑÕÉ¸ì(€€€½¹ÍÐ‰ÕÑÑ½¸€ô€ ˆ±•…ÉAÉ•Ù¥½ÕÍQ•ÍÑÌˆ¤ì(€€€¥˜€¡‰ÕÑÑ½¸¤‰ÕÑÑ½¸¹‘¥Í…‰±•€ôÑÉÕ”ì(€€€ÑÉäì(€€€€€½¹ÍÐ…É¡¥Ù•€ô…Ý…¥ÐÝ…å±½Õ¹…É¡¥Ù•±±=Ý¹•‘Ù•¹ÑÌ ¤ì(€€€€€ÑÉäì(€€€€€€€…Ý…¥ÐÝ…å±½Õ¹Í…Ù•]½É­ÍÁ…”¡ì…Ñ¥Ù•AÕ‰±¥Í¡•‘Ù•¹Ðè¹Õ±°ô¤ì(€€€€€ô…Ñ €¡|¤íô(€€€€€±½Í•±½Õ‘½¹¹•Ñ¥½¸ ¤ì(€€€€€Ý½É­ÍÁ…•M¡É¥¹­ÕÑ¡½É¥Í•€ôÑÉÕ”ì(€€€€€ÍÑ½É”¹•Ù•¹Ð€ô¹Õ±°ì(€€€€€‘•±•Ñ”ÍÑ½É”¹±½Õì(€€€€€ÍÑ½É”¹±½Õ‘A±…å•ÉÌ€ômtì(€€€€€™½É•Ñ=É…¹¥Í•ÉÙ•¹Ð ¤ì(€€€€€±½…±MÑ½É…”¹É•µ½Ù•%Ñ•´ ‰…Ý…å½±™Q•ÍÑ	…­ÕÁXÄˆ¤ì(€€€€€±½…±MÑ½É…”¹É•µ½Ù•%Ñ•´ ‰…Ý…å½±™I¥‘•Q•ÍÑ	…­ÕÁXÄˆ¤ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€€€€€…ÁÁ±å•Ù¥•I½±” ¤ì(€€€€€É•¹‘•É!½µ” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€¹…Ø ‰¡½µ”ˆ¤ì(€€€€€…±•ÉÐ (€€€€€€€€‘í…É¡¥Ù•¹±•¹Ñ¡ôÁÕ‰±¥Í¡•Ñ•ÍÐ•Ù•¹Ð‘í…É¡¥Ù•¹±•¹Ñ €ôôô€Ä€ü€ˆÝ…Ìˆ€è€‰ÌÝ•É”‰ô±•…É•¸Ý…ä½±˜¥ÌÉ•…‘äÑ¼É•…Ñ”Ñ¡”™¥•±µÑ•ÍÐ•Ù•¹Ð¹€°(€€€€€€¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€¥˜€¡‰ÕÑÑ½¸¤‰ÕÑÑ½¸¹‘¥Í…‰±•€ô™…±Í”ì(€€€€€…±•ÉÐ (€€€€€€€€‰Q¡”Ñ•ÍÐ•Ù•¹ÑÌÝ•É”¹½Ð±•…É•‰•…ÕÍ”Ñ¡”±½Õ±•…¹ÕÀ‘¥¹½Ð½µÁ±•Ñ”¸€ˆ€¬(€€€€€€€€€€¡•ÉÉ½È¹µ•ÍÍ…”ñð•ÉÉ½È¤°(€€€€€€¤ì(€€€ô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸…¹•±ÕÉÉ•¹ÑÙ•¹Ð ¤ì(€€€¥˜€ (€€€€€€…½¹™¥É´ (€€€€€€€…¹•°€‘íÍÑ½É”¹•Ù•¹Ðü¹¹…µ”ñð€‰Ñ¡¥Ì•Ù•¹Ð‰ôýq¹q¹A±…å•ÉÌÝ¥±°¹¼±½¹•È‰”…‰±”Ñ¼©½¥¸½ÈÍ½É”¸Q¡”•Ù•¹ÐÝ¥±°É•µ…¥¸½¸Ñ¡¥Ì‘•Ù¥”…Ì„…¹•±±•É•½É¹€°(€€€€€€¤(€€€€¤(€€€€€É•ÑÕÉ¸ì(€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÑÕÌì(€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÑÕÌ€ô€‰…¹•±±•ˆì(€€€ÍÑ½É”¹•Ù•¹Ð¹…¹•±±•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤ì(€€€€€ÑÉäì(€€€€€€€…Ý…¥ÐÝ…å±½Õ¹ÕÁ‘…Ñ•Ù•¹Ð (€€€€€€€€€ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%°(€€€€€€€€€±½Õ‘A…å±½… ¤°(€€€€€€€€€€‰…É¡¥Ù•ˆ°(€€€€€€€€¤ì(€€€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÑÕÌ€ôÁÉ•Ù¥½ÕÌì(€€€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹…¹•±±•‘Ðì(€€€€€€€É•ÑÕÉ¸…±•ÉÐ (€€€€€€€€€€‰Q¡”•Ù•¹ÐÝ…Ì¹½Ð…¹•±±•‰•…ÕÍ”Ñ¡”Á±…å•È½¹¹•Ñ¥½¸½Õ±¹½Ð‰”±½Í•¸€ˆ€¬(€€€€€€€€€€€€¡•ÉÉ½È¹µ•ÍÍ…”ñð•ÉÉ½È¤°(€€€€€€€€¤ì(€€€€€ô(€€€€€ÑÉäì…Ý…¥ÐÝ…å±½Õ¹Í…Ù•]½É­ÍÁ…”¡ì…Ñ¥Ù•AÕ‰±¥Í¡•‘Ù•¹Ðè¹Õ±°ô¤ìô…Ñ €¡|¤íô(€€€ô(€€€±½Í•±½Õ‘½¹¹•Ñ¥½¸ ¤ì(€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€€€É•¹‘•É!½µ” ¤ì(€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€…±•ÉÐ (€€€€€€‰Ù•¹Ð…¹•±±•¸%ÐÉ•µ…¥¹Ì…Ù…¥±…‰±”…Ì„É•½ÉÕ¹Ñ¥°å½Ô¡½½Í”Ñ¼‘•±•Ñ”¥Ð¸ˆ°(€€€€¤ì(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸‘•±•Ñ•ÕÉÉ•¹ÑÙ•¹Ð ¤ì(€€€¥˜€ (€€€€€€…½¹™¥É´ (€€€€€€€A•Éµ…¹•¹Ñ±ä‘•±•Ñ”€‘íÍÑ½É”¹•Ù•¹Ðü¹¹…µ”ñð€‰Ñ¡¥Ì•Ù•¹Ð‰ô™É½´Ñ¡¥Ì‘•Ù¥”ýq¹q¹A±…å•ÉÌ…¹½ÕÉÍ•ÌÝ¥±°É•µ…¥¸¸Q¡¥Ì•Ù•¹ÐÍ•ÑÕÀ…¹¥ÑÌ±½…±±äÍÑ½É•Í½É•ÌÝ¥±°‰”É•µ½Ù•¹€°(€€€€€€¤(€€€€¤(€€€€€É•ÑÕÉ¸ì(€€€¥˜€ …½¹™¥É´ ‰¥¹…°¡•¬è‘•±•Ñ”Ñ¡¥Ì•Ù•¹Ð¹½Üüˆ¤¤É•ÑÕÉ¸ì(€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤ì(€€€€€ÑÉäì(€€€€€€€…Ý…¥ÐÝ…å±½Õ¹ÕÁ‘…Ñ•Ù•¹Ð (€€€€€€€€€ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%°(€€€€€€€€€±½Õ‘A…å±½… ¤°(€€€€€€€€€€‰…É¡¥Ù•ˆ°(€€€€€€€€¤ì(€€€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€€€É•ÑÕÉ¸…±•ÉÐ (€€€€€€€€€€‰Q¡”•Ù•¹ÐÝ…Ì¹½Ð‘•±•Ñ•‰•…ÕÍ”¥ÑÌÁ±…å•È½¹¹•Ñ¥½¸½Õ±¹½Ð‰”±½Í•¸€ˆ€¬(€€€€€€€€€€€€¡•ÉÉ½È¹µ•ÍÍ…”ñð•ÉÉ½È¤°(€€€€€€€€¤ì(€€€€€ô(€€€€€ÑÉäì…Ý…¥ÐÝ…å±½Õ¹Í…Ù•]½É­ÍÁ…”¡ì…Ñ¥Ù•AÕ‰±¥Í¡•‘Ù•¹Ðè¹Õ±°ô¤ìô…Ñ €¡|¤íô(€€€ô(€€€±½Í•±½Õ‘½¹¹•Ñ¥½¸ ¤ì(€€€½¹ÍÐ‘•±•Ñ•‘]½É­ÍÁ…•%€ôMÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ðü¹Ý½É­ÍÁ…•%ñðÍÑ½É”¹…Ñ¥Ù•Ù•¹Ñ%ñð€ˆˆ¤ì(€€€Ý½É­ÍÁ…•M¡É¥¹­ÕÑ¡½É¥Í•€ôÑÉÕ”ì(€€€ÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…”€ô€¡ÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…”ñðmt¤¹™¥±Ñ•È (€€€€€€¡¥Ñ•´¤€ôøMÑÉ¥¹œ¡¥Ñ•´¹¥¤€„ôô‘•±•Ñ•‘]½É­ÍÁ…•%°(€€€€¤ì(€€€½¹ÍÐ¹•áÑ]½É­ÍÁ…•Ù•¹Ð€ôl¸¸¹ÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…•t¹Í½ÉÐ ¡„°ˆ¤€ôø(€€€€€•Ù•¹Ñ]½É­ÍÁ…•…Ñ”¡ˆ¤¹±½…±•½µÁ…É”¡•Ù•¹Ñ]½É­ÍÁ…•…Ñ”¡„¤¤°(€€€€¥lÁtì(€€€ÍÑ½É”¹•Ù•¹Ð€ô¹•áÑ]½É­ÍÁ…•Ù•¹Ðü¹•Ù•¹Ð(€€€€€€ü)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡¹•áÑ]½É­ÍÁ…•Ù•¹Ð¹•Ù•¹Ð¤¤(€€€€€€è¹Õ±°ì(€€€ÍÑ½É”¹…Ñ¥Ù•Ù•¹Ñ%€ô¹•áÑ]½É­ÍÁ…•Ù•¹Ðü¹¥ñð¹Õ±°ì(€€€‘•±•Ñ”ÍÑ½É”¹±½Õì(€€€ÍÑ½É”¹±½Õ‘A±…å•ÉÌ€ômtì(€€€™½É•Ñ=É…¹¥Í•ÉÙ•¹Ð ¤ì(€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰½Á•¸ˆ¤ì(€€€É•¹‘•É!½µ” ¤ì(€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€¹…Ø ‰¡½µ”ˆ¤ì(€€€•¹‘M½É•…É‘UÁ‘…Ñ•AÉ½Ñ•Ñ¥½¸ ¤ì(€€€…±•ÉÐ¡¹•áÑ]½É­ÍÁ…•Ù•¹Ð€ü€‰Ù•¹Ð‘•±•Ñ•¸e½ÕÈ¹•áÐ•Ù•¹Ð¥Ì¹½ÜÕÉÉ•¹Ð¸ˆ€è€‰Ù•¹Ð‘•±•Ñ•¸Ý…ä½±˜¥ÌÉ•…‘ä™½È„¹•Ü•Ù•¹Ð¸ˆ¤ì(€ô(€€ ˆ•Ù•¹Ñ=ÁÑ¥½¹Ìˆ¤¹½¹±¥¬€ô½Á•¹Ù•¹Ñ=ÁÑ¥½¹Ìì(€€ ˆµåÙ•¹ÑÌˆ¤¹½¹±¥¬€ô½Á•¹5åÙ•¹ÑÌì(€€ ˆÁÕ‰±¥Í¡•‘Ù•¹ÑÌˆ¤¹½¹±¥¬€ô½Á•¹AÕ‰±¥Í¡•‘Ù•¹ÑÌì(€€ ˆÁ…ÍÑÙ•¹ÑÌˆ¤¹½¹±¥¬€ô½Á•¹A…ÍÑÙ•¹ÑÌì(€€ ˆ½É…¹¥Í•É	…­ÕÀˆ¤¹½¹±¥¬€ô½Á•¹=É…¹¥Í•É	…­ÕÀì(€€ ˆ½Ý¹•É½Õ¹Ðˆ¤¹½¹±¥¬€ô½Á•¹=Ý¹•É½Õ¹Ðì(€€ ˆÕ•ÍÑ=É…¹¥Í•É•ÍÌˆ¤¹½¹±¥¬€ô½Á•¹Õ•ÍÑ=É…¹¥Í•É•ÍÌì((€±•Ð‘•Ù•±½Áµ•¹ÑQ•ÍÑQ½½±ÍAÉ½µ¥Í”€ô¹Õ±°ì(€…Íå¹Œ™Õ¹Ñ¥½¸½Á•¹Q•ÍÑÙ•¹ÑQ½½±Ì ¤ì(€€€ÑÉäì(€€€€€¥˜€ …‘•Ù•±½Áµ•¹ÑQ•ÍÑQ½½±ÍAÉ½µ¥Í”¤ì(€€€€€€€‘•Ù•±½Áµ•¹ÑQ•ÍÑQ½½±ÍAÉ½µ¥Í”€ô¹•ÜAÉ½µ¥Í” ¡É•Í½±Ù”°É•©•Ð¤€ôøì(€€€€€€€€€½¹ÍÐÍÉ¥ÁÐ€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ‰ÍÉ¥ÁÐˆ¤ì(€€€€€€€€€ÍÉ¥ÁÐ¹ÍÉŒ€ô€‰‘•Ù•±½Áµ•¹ÐµÑ•ÍÑÌ¹©ÌýØôÄÔ¸äØ¸Øäˆì(€€€€€€€€€ÍÉ¥ÁÐ¹…Íå¹Œ€ôÑÉÕ”ì(€€€€€€€€€ÍÉ¥ÁÐ¹½¹±½…€ô€ ¤€ôøì(€€€€€€€€€€€ÑÉäì(€€€€€€€€€€€€€¥˜€ …Ý¥¹‘½Ü¹Ý…å½±™•Ù•±½Áµ•¹ÑQ•ÍÑÌü¹É•…Ñ”¤(€€€€€€€€€€€€€€€Ñ¡É½Ü¹•ÜÉÉ½È ‰•Ù•±½Áµ•¹ÐÑ•ÍÐÑ½½±Ì‘¥¹½Ð¥¹¥Ñ¥…±¥Í”¸ˆ¤ì(€€€€€€€€€€€€€É•Í½±Ù”¡Ý¥¹‘½Ü¹Ý…å½±™•Ù•±½Áµ•¹ÑQ•ÍÑÌ¤ì(€€€€€€€€€€€ô…Ñ €¡•ÉÉ½È¤ìÉ•©•Ð¡•ÉÉ½È¤ìô(€€€€€€€€€ôì(€€€€€€€€€ÍÉ¥ÁÐ¹½¹•ÉÉ½È€ô€ ¤€ôøÉ•©•Ð¡¹•ÜÉÉ½È ‰•Ù•±½Áµ•¹ÐÑ•ÍÐÑ½½±Ì½Õ±¹½Ð‰”‘½Ý¹±½…‘•¸ˆ¤¤ì(€€€€€€€€€‘½Õµ•¹Ð¹¡•…¹…ÁÁ•¹‘¡¥±¡ÍÉ¥ÁÐ¤ì(€€€€€€€ô¤ì(€€€€€ô(€€€€€½¹ÍÐ™…Ñ½Éä€ô…Ý…¥Ð‘•Ù•±½Áµ•¹ÑQ•ÍÑQ½½±ÍAÉ½µ¥Í”ì(€€€€€€¼¼	Õ¥±„™É•Í …‘…ÁÑ•È•… Ñ¥µ”Í¼„‰…­ÕÀ½¥µÁ½ÉÐÑ¡…ÐÉ•Á±…•Ñ¡”(€€€€€€¼¼¥¸µµ•µ½ÉäÍÑ½É”…¹¹½Ð±•…Ù”‘•Ù•±½Áµ•¹ÐÑ½½±Ì¡½±‘¥¹œ…¸½±‘•ÈÍÑ½É”¸(€€€€€™…Ñ½Éä¹É•…Ñ”¡ì(€€€€€€€ÍÑ½É”°€°€°9=}AIQ9I}%°Ù•ÉÍ¥½¸°ÍÑ…‰±•™½É‘A½¥¹ÑÌ°Á±…å•È°(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É”°É•¹‘•É!½µ”°¹…Ø°±½Í•±½Õ‘½¹¹•Ñ¥½¸°(€€€€€€€É•¹‘•É½ÕÉÍ•Í‘µ¥¸°Ý…Ñ¡±½Õ‘Ù•¹Ð°Íå¹±½Õ‘9½Ü°½ÕÉÍ”°(€€€€€€€‘…å¥•±‘%‘Ì°Á±…å•É…¥±å!…¹‘¥…À°ÍÑ…‰±•™½É‘MÑÉ½­•½Õ¹Ð°(€€€€€€€É•¹‘•É1•…‘•É‰½…É°É•¹‘•ÉA±…å•ÉáÁ•É¥•¹”°(€€€€€ô¤¹½Á•¸ ¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€‘•Ù•±½Áµ•¹ÑQ•ÍÑQ½½±ÍAÉ½µ¥Í”€ô¹Õ±°ì(€€€€€…±•ÉÐ ‰Q•ÍÑ¥¹œQ½½±Ì½Õ±¹½Ð½Á•¸¸€ˆ€¬€¡•ÉÉ½È¹µ•ÍÍ…”ñð•ÉÉ½È¤¤ì(€€€ô(€ô(€‘½Õµ•¹Ð¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ°€¡”¤€ôøì(€€€¥˜€¡”¹Ñ…É•Ð¹¥€ôôô€‰Ñ•ÍÑÙ•¹ÑQ½½±Ìˆ¤½Á•¹Q•ÍÑÙ•¹ÑQ½½±Ì ¤ì(€ô¤ì(€™Õ¹Ñ¥½¸µ…É­•ÉQ…É•Ñ½È¡Á¥°‘…ä¤ì(€€€½¹ÍÐÑà€ôÁ±…å•ÉÉ½ÕÁ½¹Ñ•áÐ¡Á¥°‘…ä¤ì(€€€¥˜€ …Ñà¤É•ÑÕÉ¸¹Õ±°ì(€€€½¹ÍÐœ€ôÑà¹É½ÕÀ¹™¥±Ñ•È ¡à¤€ôøMÑÉ¥¹œ¡à¤€„ôô9=}AIQ9I}%¤°(€€€€€µ”€ôMÑÉ¥¹œ¡Á¥¤°(€€€€€Á½Ì€ôœ¹¥¹‘•á=˜¡µ”¤ì(€€€¥˜€¡Á½Ì€ð€À¤É•ÑÕÉ¸¹Õ±°ì(€€€€¼¼•¹Õ¥¹”±…Ñ”Ý¥Ñ¡‘É…Ý…°±•…Ù•ÌÑ¡É•”½±™•ÉÌ¸Q¡•äµ…É¬¥¸½¹”±½Í•(€€€€¼¼±½½ÀÍ¼•Ù•ÉäÙ¥Í¥‰±”A±…å•È…¹5…É­•È¥Ì„É•…°½±™•È¥¸Ñ¡…ÐÉ½ÕÀ¸(€€€¥˜€¡œ¹±•¹Ñ €ôôô€Ì¤(€€€€€É•ÑÕÉ¸MÑÉ¥¹œ¡l¡Á½Ì€¬€Ä¤€”€Ít¤ì(€€€€¼¼AÉ•™•ÈÑ¡”€Ñ		Á…ÉÑ¹•È‰•…ÕÍ”Ñ¡”ÑÝ¼½±™•ÉÌ¹…ÑÕÉ…±±äµ…É¬½Ù•É¥™ä•… ½Ñ¡•È¸(€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰™½ÕÉ‰…±°ˆ°‘…ä¤¤ì(€€€€€½¹ÍÐÁ…¥ÉMÑ…ÉÐ€ôÑà¹Á±…å•É%¹‘•à€ð€È€ü€À€è€Èì(€€€€€½¹ÍÐ½Ñ¡•È€ôÑà¹É½ÕÀ(€€€€€€€€¹Í±¥”¡Á…¥ÉMÑ…ÉÐ°Á…¥ÉMÑ…ÉÐ€¬€È¤(€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤(€€€€€€€€¹™¥¹ ¡à¤€ôøà€„ôôµ”€˜˜à€„ôô9=}AIQ9I}%¤ì(€€€€€¥˜€¡½Ñ¡•È¤É•ÑÕÉ¸½Ñ¡•Èì(€€€ô(€€€É•ÑÕÉ¸MÑÉ¥¹œ¡l¡Á½Ì€¬€Ä¤€”œ¹±•¹Ñ¡tñð€ˆˆ¤ì(€ô(€™Õ¹Ñ¥½¸¹ÑÁ!½±•Í½È¡‘…ä¤ì(€€€É•ÑÕÉ¸½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰¹ÑÀˆ±‘…ä¤€ü€¡ÍÑ½É”¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ìü¹l‰‘…äˆ€¬‘…åtñðmt¤¹µ…À¡9Õµ‰•È¤€èmtì(€ô(€™Õ¹Ñ¥½¸¹ÑÁ!½±•Í%¹A±…å¥¹=É‘•È¡‘…ä¤ì(€€€½¹ÍÐ¡½±•Ì€ô¹ÑÁ!½±•Í½È¡‘…ä¤ì(€€€¥˜€¡ÍÑ…ÉÑ5•Ñ¡½‘½È¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤€„ôô€‰Í¥¹±”ˆ¤É•ÑÕÉ¸¡½±•Ìì(€€€½¹ÍÐÍ•ÅÕ•¹”€ôÍ½É•M•ÅÕ•¹”¡ÍÑ…ÉÑ!½±•Í½È¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¥lÁtñð€Ä¤ì(€€€É•ÑÕÉ¸¡½±•Ì¹Í½ÉÐ ¡„°ˆ¤€ôøÍ•ÅÕ•¹”¹¥¹‘•á=˜¡„¤€´Í•ÅÕ•¹”¹¥¹‘•á=˜¡ˆ¤¤ì(€ô(€™Õ¹Ñ¥½¸¹ÑÁM½É•MÕÁÁ½ÉÑÍ±…¥´¡‘…ä°É•½É¤ì(€€€¥˜€ …½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤¤É•ÑÕÉ¸ÑÉÕ”ì(€€€½¹ÍÐÉ½ÍÌ€ôÉ•½Éü¹½™™¥¥…°ü¹É½ÍÌ°(€€€€€ÁÕÑÑÌ€ôÉ•½Éü¹½™™¥¥…°ü¹ÁÕÑÑÌì(€€€É•ÑÕÉ¸	½½±•…¸ (€€€€€Í½É•¹Ñ•É•¡É½ÍÌ¤€˜˜(€€€€€€€MÑÉ¥¹œ¡É½ÍÌ¤¹Ñ½UÁÁ•É…Í” ¤€„ôô€‰@ˆ€˜˜(€€€€€€€Í½É•¹Ñ•É•¡ÁÕÑÑÌ¤€˜˜(€€€€€€€9Õµ‰•È¡É½ÍÌ¤€ôôô9Õµ‰•È¡ÁÕÑÑÌ¤€¬€Ä°(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸¹ÑÁ!¥ÍÑ½Éä¡‘…ä°¡½±”¤ì(€€€½¹ÍÐ•¹ÑÉ¥•Ì€ômtì(€€€=‰©•Ð¹•¹ÑÉ¥•Ì¡Í½É¥¹…åMÑ½É”¡‘…ä¤¤¹™½É…  ¡mÍ½É•É%°¡½±•Ít¤€ôøì(€€€€€½¹ÍÐ¸€ô¡½±•Ìü¹mMÑÉ¥¹œ¡¡½±”¥tü¹¹ÑÀì(€€€€€¥˜€ …¸ü¹½¹™¥Éµ•‘Ðñð€…¹ÑÁM½É•MÕÁÁ½ÉÑÍ±…¥´¡‘…ä°¡½±•Ìü¹mMÑÉ¥¹œ¡¡½±”¥t¤¤É•ÑÕÉ¸ì(€€€€€•¹ÑÉ¥•Ì¹ÁÕÍ ¡ì(€€€€€€€¥èMÑÉ¥¹œ¡¸¹•¹ÑÉ…¹Ñ%ñðÍ½É•É%¤°(€€€€€€€Í½É•É%èMÑÉ¥¹œ¡Í½É•É%¤°(€€€€€€€…Ðè¸¹½¹™¥Éµ•‘Ð°(€€€€€€€Ðè…Ñ”¹Á…ÉÍ”¡¸¹½¹™¥Éµ•‘Ð¤ñð€À°(€€€€€ô¤ì(€€€ô¤ì(€€€É•ÑÕÉ¸•¹ÑÉ¥•Ì¹Í½ÉÐ ¡„°ˆ¤€ôø„¹Ð€´ˆ¹Ðñð„¹¥¹±½…±•½µÁ…É”¡ˆ¹¥¤¤ì(€ô(€™Õ¹Ñ¥½¸ÕÉÉ•¹Ñ9ÑÁ!½±‘•È¡‘…ä°¡½±”¤ì(€€€½¹ÍÐµ…¹Õ…±…ä€ôµ…¹Õ…±…åMÑ½É”¡‘…ä°™…±Í”¤°(€€€€€µ…¹Õ…±I•ÍÕ±Ð€ôµ…¹Õ…±…äü¹¹ÑÁ¥¹…±¥Í•(€€€€€€€€üµ…¹Õ…±…ä¹¹ÑÀü¹mMÑÉ¥¹œ¡¡½±”¥t(€€€€€€€€è¹Õ±°ì(€€€¥˜€¡µ…¹Õ…±I•ÍÕ±Ð¤(€€€€€É•ÑÕÉ¸µ…¹Õ…±I•ÍÕ±Ð€ôôô€‰9=9ˆ(€€€€€€€€ü¹Õ±°(€€€€€€€€èì¥èMÑÉ¥¹œ¡µ…¹Õ…±I•ÍÕ±Ð¤°µ…¹Õ…°èÑÉÕ”°…Ðèµ…¹Õ…±…ä¹½µÁ±•Ñ•‘Ðôì(€€€½¹ÍÐ¡¥ÍÑ½Éä€ô¹ÑÁ!¥ÍÑ½Éä¡‘…ä°¡½±”¤ì(€€€É•ÑÕÉ¸¡¥ÍÑ½Éåm¡¥ÍÑ½Éä¹±•¹Ñ €´€Åtñð¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸¹ÑÁÙ•¹ÑM±½ÑÌ ¤ì(€€€½¹ÍÐÍ±½ÑÌ€ômtì(€€€™½È€¡±•Ð‘…ä€ô€Äì‘…ä€ðô€¡ÍÑ½É”¹•Ù•¹Ðü¹‘…åÌñð€Ä¤ì‘…ä¬¬¤(€€€€€¹ÑÁ!½±•Í%¹A±…å¥¹=É‘•È¡‘…ä¤¹™½É…  ¡¡½±”¤€ôøÍ±½ÑÌ¹ÁÕÍ ¡ì‘…ä°¡½±”ô¤¤ì(€€€É•ÑÕÉ¸Í±½ÑÌì(€ô(€™Õ¹Ñ¥½¸Í…µ•9ÑÁM±½Ð¡„°ˆ¤ì(€€€É•ÑÕÉ¸	½½±•…¸¡„€˜˜ˆ€˜˜„¹‘…ä€ôôôˆ¹‘…ä€˜˜„¹¡½±”€ôôôˆ¹¡½±”¤ì(€ô(€™Õ¹Ñ¥½¸¹ÑÁ	…Í•	…±±Ì ¤ì(€€€½¹ÍÐ‰…±±Ì€ô€¬¡ÍÑ½É”¹•Ù•¹Ðü¹‰•¹•™¥ÑÌü¹¹ÑÀü¹‰…±±Ìñð€À¤ì(€€€É•ÑÕÉ¸9Õµ‰•È¹¥Í¥¹¥Ñ”¡‰…±±Ì¤€ü‰…±±Ì€è€Àì(€ô(€™Õ¹Ñ¥½¸¹ÑÁ)…­Á½ÑMÑ…Ñ”¡‘…ä°¡½±”¤ì(€€€½¹ÍÐ‰…Í”€ô¹ÑÁ	…Í•	…±±Ì ¤°(€€€€€Í±½ÑÌ€ô¹ÑÁÙ•¹ÑM±½ÑÌ ¤°(€€€€€Ñ…É•Ñ%¹‘•à€ôÍ±½ÑÌ¹™¥¹‘%¹‘•à (€€€€€€€€¡Í±½Ð¤€ôø€­Í±½Ð¹‘…ä€ôôô€­‘…ä€˜˜€­Í±½Ð¹¡½±”€ôôô€­¡½±”°(€€€€€€¤°(€€€€€©…­Á½Ñ=¸€ô	½½±•…¸¡ÍÑ½É”¹•Ù•¹Ðü¹¹ÑÁ)…­Á½Ð¤°(€€€€€µ½‘”€ôÍÑ½É”¹•Ù•¹Ðü¹¹ÑÁ)…­Á½Ñ5½‘”€ôôô€‰É½±±¥¹œˆ€ü€‰É½±±¥¹œˆ€è€‰™¥¹…°ˆ°(€€€€€™¥¹…±%¹‘•à€ôÍ±½ÑÌ¹±•¹Ñ €´€Äì(€€€±•Ð…ÉÉ¥•€ô€Àì(€€€¥˜€ …‰…Í”ñðÑ…É•Ñ%¹‘•à€ð€Àñð€…©…­Á½Ñ=¸¤(€€€€€É•ÑÕÉ¸ì‰…Í”°…ÉÉ¥•è€À°ÁÉ¥é”è‰…Í”°É•Í½±Ù•è™…±Í”°µ½‘”ôì(€€€™½È€¡±•Ð¥¹‘•à€ô€Àì¥¹‘•à€ðÑ…É•Ñ%¹‘•àì¥¹‘•à¬¬¤ì(€€€€€½¹ÍÐÍ±½Ð€ôÍ±½ÑÍm¥¹‘•át°(€€€€€€€¡½±‘•È€ôÕÉÉ•¹Ñ9ÑÁ!½±‘•È¡Í±½Ð¹‘…ä°Í±½Ð¹¡½±”¤°(€€€€€€€É•Í½±Ù•€ô•Ù•¹Ñ…å½µÁ±•Ñ”¡Í±½Ð¹‘…ä¤ì(€€€€€¥˜€¡¡½±‘•È¤ì(€€€€€€€¥˜€¡µ½‘”€ôôô€‰É½±±¥¹œˆ¤…ÉÉ¥•€ô€Àì(€€€€€€€½¹Ñ¥¹Õ”ì(€€€€€ô(€€€€€¥˜€¡É•Í½±Ù•¤…ÉÉ¥•€¬ô‰…Í”ì(€€€ô(€€€¥˜€¡µ½‘”€ôôô€‰™¥¹…°ˆ€˜˜Ñ…É•Ñ%¹‘•à€„ôô™¥¹…±%¹‘•à¤…ÉÉ¥•€ô€Àì(€€€É•ÑÕÉ¸ì(€€€€€‰…Í”°(€€€€€…ÉÉ¥•°(€€€€€ÁÉ¥é”è‰…Í”€¬…ÉÉ¥•°(€€€€€É•Í½±Ù•è•Ù•¹Ñ…å½µÁ±•Ñ”¡‘…ä¤°(€€€€€µ½‘”°(€€€ôì(€ô(€™Õ¹Ñ¥½¸¹ÑÁAÉ¥é•	…±±Ì¡‘…ä°¡½±”¤ì(€€€É•ÑÕÉ¸¹ÑÁ)…­Á½ÑMÑ…Ñ”¡‘…ä°¡½±”¤¹ÁÉ¥é”ì(€ô(€™Õ¹Ñ¥½¸¹ÑÁAÉ¥é•Q•áÐ¡‘…ä°¡½±”¤ì(€€€½¹ÍÐ‰…±±Ì€ô¹ÑÁAÉ¥é•	…±±Ì¡‘…ä°¡½±”¤ì(€€€É•ÑÕÉ¸‰…±±Ì€ü€‘í‰…±±Íô	…±°‘í‰…±±Ì€ôôô€Ä€ü€ˆˆ€è€‰Ì‰õ€€è€ˆˆì(€ô(€™Õ¹Ñ¥½¸¹ÑÁMÕµµ…Éå1¥¹”¡‘…ä°¡½±”°½µÁ±•Ñ”¤ì(€€€½¹ÍÐ¡½±‘•È€ôÕÉÉ•¹Ñ9ÑÁ!½±‘•È¡‘…ä°¡½±”¤°(€€€€€ÍÑ…Ñ”€ô¹ÑÁ)…­Á½ÑMÑ…Ñ”¡‘…ä°¡½±”¤°(€€€€€ÁÉ¥é”€ô¹ÑÁAÉ¥é•Q•áÐ¡‘…ä°¡½±”¤°(€€€€€…ÉÉåQ•áÐ€ôÍÑ…Ñ”¹…ÉÉ¥•(€€€€€€€€ü€€ ‘íÍÑ…Ñ”¹‰…Í•ô€¬€‘íÍÑ…Ñ”¹…ÉÉ¥•‘ô©…­Á½Ð¥€(€€€€€€€€è€ˆˆì(€€€¥˜€¡¡½±‘•È¤(€€€€€É•ÑÕÉ¸!½±”€‘í¡½±•ôè€‘í½µÁ±•Ñ”€ü€‰]¥¹¹•Èˆ€è€‰ÕÉÉ•¹Ð¡½±‘•È‰ôƒŠP€‘í•Ù•¹ÑA±…å•È¡¡½±‘•È¹¥°‘…ä¤ü¹¹…µ”ñð€‰A±…å•È‰ô‘íÁÉ¥é”€ü€ƒŠP€‘íÁÉ¥é•ô‘í…ÉÉåQ•áÑõ€€è€ˆ‰õ€ì(€€€¥˜€ …½µÁ±•Ñ”¤(€€€€€É•ÑÕÉ¸!½±”€‘í¡½±•ôèA•¹‘¥¹œ‘íÁÉ¥é”€ü€ƒŠP€‘íÁÉ¥é•ô‘í…ÉÉåQ•áÑô…Ù…¥±…‰±•€€è€ˆ‰õ€ì(€€€½¹ÍÐÍ±½ÑÌ€ô¹ÑÁÙ•¹ÑM±½ÑÌ ¤°(€€€€€Í±½Ð€ôì‘…ä°¡½±”ô°(€€€€€Í±½Ñ%¹‘•à€ôÍ±½ÑÌ¹™¥¹‘%¹‘•à ¡¥Ñ•´¤€ôøÍ…µ•9ÑÁM±½Ð¡¥Ñ•´°Í±½Ð¤¤°(€€€€€¹•áÑM±½Ð€ôÍ±½ÑÍmÍ±½Ñ%¹‘•à€¬€Åtì(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ðü¹¹ÑÁ)…­Á½Ð€˜˜¹•áÑM±½Ð¤ì(€€€€€½¹ÍÐ‘•ÍÑ¥¹…Ñ¥½¸€ô(€€€€€€€ÍÑ…Ñ”¹µ½‘”€ôôô€‰É½±±¥¹œˆ€ü¹•áÑM±½Ð€èÍ±½ÑÍmÍ±½ÑÌ¹±•¹Ñ €´€Åtì(€€€€€É•ÑÕÉ¸!½±”€‘í¡½±•ôè9¼]¥¹¹•ÈƒŠP€‘íÁÉ¥é”ñð€‰AÉ¥é”‰ô…ÉÉ¥•ÌÑ¼!½±”€‘í‘•ÍÑ¥¹…Ñ¥½¸¹¡½±•ô‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ø€Ä€ü€…ä€‘í‘•ÍÑ¥¹…Ñ¥½¸¹‘…åõ€€è€ˆ‰õ€ì(€€€ô(€€€É•ÑÕÉ¸!½±”€‘í¡½±•ôè9¼]¥¹¹•È‘íÁÉ¥é”€ü€ƒŠP€‘íÁÉ¥é•õ€€è€‰AÉ¥é”‰ô¹½Ð…Ý…É‘•‘€ì(€ô(€™Õ¹Ñ¥½¸Ñ•…µÍ¥¹…±¡•­!Ñµ° ¤ì(€€€½¹ÍÐ•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ðì(€€€¥˜€ …•Ù•¹Ð¤É•ÑÕÉ¸€ˆˆì(€€€½¹ÍÐ‘¥ÍÁ±…å…Ñ”€ô€¡¥Í¼¤€ôøì(€€€€€€€½¹ÍÐµ…Ñ €ôMÑÉ¥¹œ¡¥Í¼ñð€ˆˆ¤¹µ…Ñ  ½x¡q‘ìÑô¤´¡q‘ìÉô¤´¡q‘ìÉô¤¼¤ì(€€€€€€€É•ÑÕÉ¸µ…Ñ €ü€‘íµ…Ñ¡lÍuô¼‘íµ…Ñ¡lÉuô¼‘íµ…Ñ¡lÅuõ€€è¥Í¼ñð€‰9½Ð•¹Ñ•É•ˆì(€€€€€ô°(€€€€€Ñ•…µQ•áÐ€ô€¡¥‘Ì¤€ôø(€€€€€€€¥‘Ì¹±•¹Ñ €˜˜¥‘Ì¹±•¹Ñ €”€Ð€ôôô€À(€€€€€€€€€€ü€‘í¥‘Ì¹±•¹Ñ €¼€ÑôÑ•…´‘í¥‘Ì¹±•¹Ñ €ôôô€Ð€ü€ˆˆ€è€‰Ì‰ô½˜€Ñ€(€€€€€€€€€€è€‘í¥‘Ì¹±•¹Ñ¡ôÁ±…å¥¹œÁ½Í¥Ñ¥½¹Í€°(€€€€€©½¥¹!½±•Ì€ô€¡¡½±•Ì¤€ôøì(€€€€€€€½¹ÍÐ±…‰•±Ì€ô€¡¡½±•Ìñðmt¤¹µ…À ¡¡½±”¤€ôø!½±”€‘í¡½±•õ€¤ì(€€€€€€€É•ÑÕÉ¸±…‰•±Ì¹±•¹Ñ €ð€È(€€€€€€€€€€ü±…‰•±ÍlÁtñð€‰9½ÐÍ•±•Ñ•ˆ(€€€€€€€€€€è€‘í±…‰•±Ì¹Í±¥” À°€´Ä¤¹©½¥¸ ˆ°€ˆ¥ô…¹€‘í±…‰•±Ì¹…Ð ´Ä¥õ€ì(€€€€€ô°(€€€€€½¹™¥Éµ•€ô€¡•Ù•¹Ð¹½¹™¥Éµ•ñðmt¤¹™¥±Ñ•È (€€€€€€€€¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%°(€€€€€€¤°(€€€€€¥¹Ù¥Ñ•€ô=‰©•Ð¹•¹ÑÉ¥•Ì¡•Ù•¹Ð¹¥¹Ù¥Ñ…Ñ¥½¹MÑ…ÑÕÌñðíô¤¹™¥±Ñ•È (€€€€€€€€¡m¥°ÍÑ…ÑÕÍt¤€ôø(€€€€€€€€€MÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%€˜˜(€€€€€€€€€l‰…•ÁÑ•ˆ°€‰…Ý…¥Ñ¥¹œ‰t¹¥¹±Õ‘•Ì¡ÍÑ…ÑÕÌ¤°(€€€€€€¤¹±•¹Ñ °(€€€€€…É‘Ì€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è•Ù•¹Ð¹‘…åÌñð€Äô°€¡|°¥¹‘•à¤€ôøì(€€€€€€€½¹ÍÐ‘…ä€ô¥¹‘•à€¬€Ä°(€€€€€€€€€¥Ñ•´€ô½ÕÉÍ”¡•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤ì(€€€€€€€É•ÑÕÉ¸¥Ñ•´€üì¥Ñ•´°Ñ•”èÍ•±•Ñ•‘Ù•¹ÑQ•”¡‘…ä°•Ù•¹Ð¤ô€è¹Õ±°ì(€€€€€ô¤¹™¥±Ñ•È¡	½½±•…¸¤°(€€€€€…É‘Í¡•­•€ô(€€€€€€€	½½±•…¸¡•Ù•¹Ð¹Í½É•…É‘Í¡•­•¤€˜˜(€€€€€€€…É‘Ì¹±•¹Ñ €ø€À€˜˜(€€€€€€€•Ù•¹Ñ…åÌ¡•Ù•¹Ð¤¹•Ù•Éä¡‘…äôù•Ù•¹Ñ…É‘¡•­Ì¡‘…ä±•Ù•¹Ð¤¹•Ù•Éä¡¡•¬ôù¡•¬¹½¬¤¤°(€€€€€™¥ÉÍÑQ••Q•áÐ€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è•Ù•¹Ð¹‘…åÌñð€Äô°€¡|°¥¹‘•à¤€ôøì(€€€€€€€½¹ÍÐ‘…ä€ô¥¹‘•à€¬€Ä°(€€€€€€€€€¡½±”€ô€¬¡ÍÑ…ÉÑ!½±•Í½È¡•Ù•¹Ð°‘…ä¥lÁtñð€Ä¤°(€€€€€€€€€ÍÕ™™¥à€ôlÄÄ°€ÄÈ°€ÄÍt¹¥¹±Õ‘•Ì¡¡½±”€”€ÄÀÀ¤(€€€€€€€€€€€€ü€‰Ñ ˆ(€€€€€€€€€€€€è¡½±”€”€ÄÀ€ôôô€Ä(€€€€€€€€€€€€€€ü€‰ÍÐˆ(€€€€€€€€€€€€€€è¡½±”€”€ÄÀ€ôôô€È(€€€€€€€€€€€€€€€€ü€‰¹ˆ(€€€€€€€€€€€€€€€€è¡½±”€”€ÄÀ€ôôô€Ì(€€€€€€€€€€€€€€€€€€ü€‰Éˆ(€€€€€€€€€€€€€€€€€€è€‰Ñ ˆì(€€€€€€€É•ÑÕÉ¸€‘í•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€ˆˆ€è…ä€‘í‘…åôèô‘í¡½±•ô‘íÍÕ™™¥áõ€ì(€€€€€ô¤¹©½¥¸ ˆƒ
Ü€ˆ¤°(€€€€€¡•­Ì€ôl(€€€€€€€ì½¬è	½½±•…¸¡•Ù•¹Ð¹¹…µ”¤°±…‰•°èÙ•¹Ð9…µ”è€‘í•Ù•¹Ð¹¹…µ•õ€ô°(€€€€€€€ì½¬è	½½±•…¸¡•Ù•¹Ð¹‘…Ñ”¤°±…‰•°èMÑ…ÉÐ…Ñ”è€‘í‘¥ÍÁ±…å…Ñ”¡•Ù•¹Ð¹‘…Ñ”¥õ€ô°(€€€€€€€€¸¸¹ÉÉ…ä¹™É½´¡ì±•¹Ñ è•Ù•¹Ð¹‘…åÌñð€Äô°€¡|°¥¹‘•à¤€ôøì(€€€€€€€€€½¹ÍÐ‘…ä€ô¥¹‘•à€¬€Ä°(€€€€€€€€€€€•Ù•¹Ñ½ÕÉÍ”€ô½ÕÉÍ”¡•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤°(€€€€€€€€€€€Ñ¥µ•1…‰•°€ôÍÑ…ÉÑ5•Ñ¡½‘½È¡•Ù•¹Ð°‘…ä¤€ôôô€‰Í¡½ÑÕ¸ˆ€ü€‰M¡½ÑÕ¸Q¥µ”ˆ€è€‰¥ÉÍÐQ•”Q¥µ”ˆì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€€€½¬è	½½±•…¸¡•Ù•¹Ñ½ÕÉÍ”¤°(€€€€€€€€€€€±…‰•°è€‘í•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰½ÕÉÍ”ˆ€è…ä€‘í‘…åõôè€‘í•Ù•¹Ñ½ÕÉÍ”ü¹¹…µ”ñð€‰9½ÐÍ•±•Ñ•‰ôƒ
Ü€‘íÑ¥µ•1…‰•±ôè€‘íÍÑ…ÉÑQ¥µ•Í½È¡•Ù•¹Ð°‘…ä¥lÁuõ€°(€€€€€€€€€ôì(€€€€€€€ô¤°(€€€€€€€ì½¬è	½½±•…¸¡™¥ÉÍÑQ••Q•áÐ¤°±…‰•°è¥ÉÍÐQ•”è€‘í™¥ÉÍÑQ••Q•áÑõ€ô°(€€€€€€€ì(€€€€€€€€€½¬è…É‘Í¡•­•°(€€€€€€€€€±…‰•°è€‰½ÕÉÍ”M½É•…É¡•­•…¥¹ÍÐ=™™¥¥…°…Éè½¹™¥Éµ•ˆ°(€€€€€€€ô°(€€€€€€€ì(€€€€€€€€€½¬è½¹™¥Éµ•¹±•¹Ñ €ø€À°(€€€€€€€€€±…‰•°èA±…å•ÉÌ%¹Ù¥Ñ•è€‘í¥¹Ù¥Ñ•ñð½¹™¥Éµ•¹±•¹Ñ¡ôƒ
Ü½¹™¥Éµ•è€‘í½¹™¥Éµ•¹±•¹Ñ¡õ€°(€€€€€€€ô°(€€€€€€€€¸¸¹ÉÉ…ä¹™É½´¡ì±•¹Ñ è•Ù•¹Ð¹‘…åÌñð€Äô°€¡|°¥¹‘•à¤€ôøì(€€€€€€€€€½¹ÍÐ‘…ä€ô¥¹‘•à€¬€Ä°(€€€€€€€€€€€Ñ••Ì€ô•¹…‰±•‘Ù•¹ÑQ••Ì¡•Ù•¹Ð°‘…ä¤°(€€€€€€€€€€€½µÁ±•Ñ”€ôÑ••Ì¹•Ù•Éä ¡Ñ•”¤€ôøÑ••!…¹‘¥…ÁÍ½µÁ±•Ñ”¡‘…ä°Ñ•”°•Ù•¹Ð¤¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€€€½¬è½µÁ±•Ñ”°(€€€€€€€€€€€±…‰•°è€‘í•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€ˆˆ€è…ä€‘í‘…åôô‘íÑ••Ì¹µ…À ¡Ñ•”¤€ôøY9Q}Q}1	1MmÑ••t¤¹©½¥¸ ˆ°€ˆ¥ôQ•”!…¹‘¥…ÁÌè½µÁ±•Ñ•€°(€€€€€€€€€ôì(€€€€€€€ô¤°(€€€€€€€ì(€€€€€€€€€½¬èÉÉ…ä¹™É½´¡ì±•¹Ñ è•Ù•¹Ð¹‘…åÌñð€Äô°€¡|°¥¹‘•à¤€ôø(€€€€€€€€€€€‘…å¥•±‘%‘Ì¡¥¹‘•à€¬€Ä¤¹±•¹Ñ €ø€À°(€€€€€€€€€€¤¹•Ù•Éä¡	½½±•…¸¤°(€€€€€€€€€±…‰•°è(€€€€€€€€€€€•Ù•¹Ð¹‘…åÌ€ôôô€Ä(€€€€€€€€€€€€€€ü…¥±ä¥•±M•±•Ñ•è€‘íÑ•…µQ•áÐ¡‘…å¥•±‘%‘Ì Ä¤¥õ€(€€€€€€€€€€€€€€è…¥±ä¥•±‘ÌM•±•Ñ•è€‘í•Ù•¹Ñ…åÌ¡•Ù•¹Ð¤¹µ…À¡‘…äôù…ä€‘í‘…åôƒŠP€‘íÑ•…µQ•áÐ¡‘…å¥•±‘%‘Ì¡‘…ä¤¥õ€¤¹©½¥¸ ˆì€ˆ¥õ€°(€€€€€€€ô°(€€€€€€€€¸¸¹‘…¥±å½µÁ•Ñ¥Ñ¥½¹¡•­Ì¡•Ù•¹Ð¤°(€€€€€€€€¸¸¸ ¡•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹Ìñðmt¤¹¥¹±Õ‘•Ì ‰¹ÑÀˆ¤(€€€€€€€€€€ümì(€€€€€€€€€€€€€½¬è½µÁ•Ñ¥Ñ¥½¹…åÌ ‰¹ÑÀˆ±•Ù•¹Ð¤¹•Ù•Éä¡‘…äôø¡•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ìü¹l‰‘…äˆ­‘…åuññmt¤¹±•¹Ñ øÀ¤°(€€€€€€€€€€€€€±…‰•°è(€€€€€€€€€€€€€€€•Ù•¹Ð¹‘…åÌ€ôôô€Ä(€€€€€€€€€€€€€€€€€€ü9Q@!½±•ÌM•±•Ñ•è€‘í©½¥¹!½±•Ì¡•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ìü¹‘…äÄ¥õ€(€€€€€€€€€€€€€€€€€€è9Q@!½±•ÌM•±•Ñ•è€‘í½µÁ•Ñ¥Ñ¥½¹…åÌ ‰¹ÑÀˆ±•Ù•¹Ð¤¹µ…À¡‘…äôù…ä€‘í‘…åôƒŠP€‘í©½¥¹!½±•Ì¡•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ìü¹l‰‘…äˆ­‘…åt¥õ€¤¹©½¥¸ ˆì€ˆ¥õ€°(€€€€€€€€€€€õt(€€€€€€€€€€èmt¤°(€€€€€t¹™¥±Ñ•È ¡¡•¬¤€ôø¡•¬¹½¬¤ì(€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰™¥¹…±¡•¬Ñ•…µÍ¥¹…±¡•¬ˆøñ Ðù¥¹…°¡•¬ƒŠPÙ•¹ÐM•ÑÕÀI•½Éð½ Ðøñ‘¥Ø±…ÍÌô‰¡•­1¥ÍÐˆø‘í¡•­Ì¹µ…À ¡¡•¬¤€ôø€ñ‘¥Ø±…ÍÌô‰½¬ˆøñÍÁ…¸ûŠrLð½ÍÁ…¸ø‘í•ÍŒ¡¡•¬¹±…‰•°¥ôð½‘¥Øù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½‘¥Øù€ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉQ•…µÍA…” ¤ì(€€€½¹ÍÐ¡½ÍÐ€ô€ ˆÑ•…µÍ‘µ¥¸ˆ¤ì(€€€¥˜€ …¡½ÍÐ¤É•ÑÕÉ¸ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ð¤ì(€€€€€¥˜€  ˆÑ•…µÍA…•!•…‘¥¹œˆ¤¤€ ˆÑ•…µÍA…•!•…‘¥¹œˆ¤¹Ñ•áÑ½¹Ñ•¹Ð€ô€‰É½ÕÁÌ…¹Q•…µÌˆì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰…Éˆøñ Ìù9¼•Ù•¹ÐÁ±…¸¥ÌÉ•…‘äå•Ð¸ð½ ÌøñÀùÉ•…Ñ”…¹Í…Ù”…¸•Ù•¹ÐÁ±…¸™¥ÉÍÐ¸ð½Àøñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰Ñ•…µÍ9•ÝÙ•¹ÐˆùÉ•…Ñ”9•ÜÙ•¹Ðð½‰ÕÑÑ½¸øð½‘¥Øù€ì(€€€€€¥˜€  ˆÑ•…µÍ9•ÝÙ•¹Ðˆ¤¤€ ˆÑ•…µÍ9•ÝÙ•¹Ðˆ¤¹½¹±¥¬€ô½Á•¹]¥é…Éì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€¥¹¥Ñ¥…±¥Í•É½ÕÁÌ ¤ì(€€€½¹ÍÐ±½­•€ô	½½±•…¸¡ÍÑ½É”¹•Ù•¹Ð¹±½­•¤ì(€€€½¹ÍÐ‘…ä€ô5…Ñ ¹µ¥¸ (€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹…Ñ¥Ù•É½ÕÁ…äñð€Ä°(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹‘…åÌñð€Ä°(€€€€€€¤°(€€€€€­•ä€ô€‰‘…äˆ€¬‘…ä°(€€€€€Í•ÑÕÀ€ôÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÁm­•åt°(€€€€€É½ÕÁÌ€ôÍ•ÑÕÀ¹É½ÕÁÌì(€€€½¹ÍÐÑ•…µÍM…Ù•€ô	½½±•…¸¡Í•ÑÕÀ¹Í…Ù•¤ì(€€€½¹ÍÐ¹…µ”€ô(€€€€€½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤ü¹¹…µ”ñð(€€€€€€‰½ÕÉÍ”ˆì(€€€½¹ÍÐµ•Ñ¡½€ôÍÑ…ÉÑ5•Ñ¡½‘½È¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤°(€€€€€¥‘Ì€ô‘…å¥•±‘%‘Ì¡‘…ä¤°(€€€€€Ñà€ô…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤(€€€€€€€€ü…µ‰É½Í•Q¡É••A±…å•É½¹Ñ•áÐ¡É½ÕÁÌ¤(€€€€€€€€è¹½A…ÉÑ¹•É½¹Ñ•áÐ¡É½ÕÁÌ°‘…ä¤ì(€€€½¹ÍÐÙÀ€ôÍ•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È€üÁ±…å•È¡Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È¤€è¹Õ±°ì(€€€½¹ÍÐ•áÑÉ„€ôÍ•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•È€üÁ±…å•È¡Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•È¤€è¹Õ±°ì(€€€½¹ÍÐ…µ‰É½Í•áÑÉ…ÑÑ•µÁÑÌ€ô=‰©•Ð¹•¹ÑÉ¥•Ì¡Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌñðíô¤(€€€€€€¹µ…À ¡m¡½±”°¥‘t¤€ôø€¡ì¡½±”è€­¡½±”°¹…µ”è•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€‰A±…å•Èˆô¤¤(€€€€€€¹Í½ÉÐ ¡„°ˆ¤€ôø„¹¡½±”€´ˆ¹¡½±”¤ì(€€€½¹ÍÐÍÑ…ÉÑ½¹ÑÉ½°€ô€¡¤¤€ôøì(€€€€€¥˜€¡µ•Ñ¡½€ôôô€‰Í¡½ÑÕ¸ˆ¤(€€€€€€€É•ÑÕÉ¸€ñ±…‰•°±…ÍÌô‰ÍÑ…ÉÑA½ÌˆùMÑ…ÉÑ¥¹œ!½±”ñÍ•±•Ð‘…Ñ„µÉ½ÕÁÍÑ…ÉÐôˆ‘í¥ôˆ€‘í±½­•ñðÑ•…µÍM…Ù•€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôø‘íÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôø€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í¤€¬€Åôˆ€‘ì­Í•ÑÕÀ¹ÍÑ…ÉÑÍm¥t€ôôô¤€¬€Ä€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôù!½±”€‘í¤€¬€Åôð½½ÁÑ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½Í•±•Ðøð½±…‰•°ù€ì(€€€€€¥˜€¡µ•Ñ¡½€ôôô€‰ÑÝ¼ˆ¤ì(€€€€€€€½¹ÍÐÑ••Ì€ôÍÑ½É”¹•Ù•¹Ð¹ÑÝ½Q••MÑ…ÉÑÌü¹l‰‘…äˆ€¬‘…åtñðlÄ°€ÄÁtì(€€€€€€€É•ÑÕÉ¸€ñ±…‰•°±…ÍÌô‰ÍÑ…ÉÑA½ÌˆùMÑ…ÉÑ¥¹œ!½±”ñÍ•±•Ð‘…Ñ„µÉ½ÕÁÍÑ…ÉÐôˆ‘í¥ôˆ€‘í±½­•ñðÑ•…µÍM…Ù•€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôø‘íÑ••Ì¹µ…À ¡ ¤€ôø€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í¡ôˆ€‘ì­Í•ÑÕÀ¹ÍÑ…ÉÑÍm¥t€ôôô€­ €ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôù!½±”€‘í¡ôð½½ÁÑ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½Í•±•Ðøð½±…‰•°ù€ì(€€€€€ô(€€€€€¥˜€¡µ•Ñ¡½€ôôô€‰Í¥¹±”ˆ¤(€€€€€€€É•ÑÕÉ¸€ñÍÁ…¸±…ÍÌô‰ÍÑ…ÉÑ=É‘•ÈˆùMÑ…ÉÑ¥¹œ!½±”€‘íÍÑ…ÉÑ!½±•Í½È¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¥lÁuôð½ÍÁ…¸ù€ì(€€€€€É•ÑÕÉ¸€ñÍÁ…¸±…ÍÌô‰ÍÑ…ÉÑ=É‘•ÈˆùQ•”½É‘•È€‘í¤€¬€Åôð½ÍÁ…¸ù€ì(€€€ôì(€€€½¹ÍÐÁ±…å•ÉI½Ü€ô€¡Á¥°¤°Á¤¤€ôøì(€€€€€±•ÐÀ€ôÁ±…å•È¡Á¥¤°(€€€€€€€Í•±•Ñ•€ôMÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•Èñð€ˆˆ¤€ôôôMÑÉ¥¹œ¡Á¥¤°(€€€€€€€¹À€ôMÑÉ¥¹œ¡Á¥¤€ôôô9=}AIQ9I}%°(€€€€€€€…Ý…¥Ñ¥¹œ€ôÍÑ½É”¹•Ù•¹Ð¹¥¹Ù¥Ñ…Ñ¥½¹MÑ…ÑÕÌü¹mMÑÉ¥¹œ¡Á¥¥t€ôôô€‰…Ý…¥Ñ¥¹œˆì(€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰É½ÕÁA±…å•È€‘íÍ•±•Ñ•€ü€‰ÍÝ…ÁM•±•Ñ•ˆ€è€ˆ‰ô€‘í¹À€ü€‰¹½A…ÉÑ¹•ÉÉ½ÕÁA±…å•Èˆ€è€ˆ‰ô€‘í…Ý…¥Ñ¥¹œ€ü€‰…Ý…¥Ñ¥¹A±…å•Èˆ€è€ˆ‰ôˆø(€€€€€ñ‘¥Ø±…ÍÌô‰Í±½Ñ9¼ˆø‘íÁ¤€¬€Åôð½‘¥Øø(€€€€€ñ‘¥Ø±…ÍÌô‰É½ÕÁA±…å•É9…µ”ˆøñˆø‘í•ÍŒ¡Àü¹¹…µ”ñð€‰U¹­¹½Ý¸ˆ¥ô‘í…Ý…¥Ñ¥¹œ€ü€ˆ€ñ•´ûŠ^<Ý…¥Ñ¥¹œÉ•Á±äð½•´øˆ€è€ˆ‰ôð½ˆøñÍµ…±°ø‘í¹À€ü€‰5¥ÍÍ¥¹œÁ±…å•ÈÁ½Í¥Ñ¥½¸ˆ€è•ÍŒ¡Àü¹¹½=™™¥¥…±!…¹‘¥…À€ü€‰9¼=™™¥¥…°!…¹‘¥…Àˆ€èÀü¹½±™1¥¹¬ñð€ˆˆ¥ôð½Íµ…±°øð½‘¥Øø(€€€€€‘í±½­•ñðÑ•…µÍM…Ù•ñð¹À€ü€ˆˆ€è€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌôˆ‘íÍ•±•Ñ•€ü€‰ÁÉ¥µ…Éäˆ€è€‰Í½™Ð‰ôÍÝ…Á	Ñ¸€‘íÍÑ½É”¹•Ù•¹Ð¹µ…¹Õ…±5½‘”€ü€ˆˆ€è€‰µ…¹Õ…±=™˜‰ôˆ‘…Ñ„µÍÝ…ÁÁ±…å•Èôˆ‘íÁ¥‘ôˆø‘íÍ•±•Ñ•€ü€‰M•±•Ñ•ˆ€è€‰MÝ…À‰ôð½‰ÕÑÑ½¸ùô(€€€ð½‘¥Øù€ì(€€€ôì(€€€½¹ÍÐÁ…¥É9…µ”€ô€¡¥°¤¤€ôøì(€€€€€¥˜€¡MÑÉ¥¹œ¡¥¤€ôôô9=}AIQ9I}%¤(€€€€€€€É•ÑÕÉ¸€ñÍÁ…¸±…ÍÌô‰ÙÁ9…µ”ˆø‘í•ÍŒ¡Á±…å•È¡Í•ÑÕÁ½ÉQ•…´¡Í•ÑÕÀ±¤¤¹Ù¥ÉÑÕ…±A±…å•È¤ü¹¹…µ”ñð€‰Y¥ÉÑÕ…°A±…å•Èˆ¥ô€¡Y@¤ð½ÍÁ…¸ù€ì(€€€€€É•ÑÕÉ¸•ÍŒ¡•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€ˆˆ¤ì(€€€ôì(€€€½¹ÍÐÁ…¥É	±½¬€ô€¡œ°¤¤€ôøì(€€€€€¥˜€ …½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰™½ÕÉ‰…±°ˆ°‘…ä¤¤É•ÑÕÉ¸€ˆˆì(€€€€€½¹ÍÐ½¹”€ôœ¹Í±¥” À°€È¤¹µ…À¡¥ôùÁ…¥É9…µ”¡¥±¤¤¤¹©½¥¸ ˆ€˜€ˆ¤°(€€€€€€€ÑÝ¼€ôœ¹Í±¥” È°€Ð¤¹µ…À¡¥ôùÁ…¥É9…µ”¡¥±¤¤¤¹©½¥¸ ˆ€˜€ˆ¤ì(€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰Á…ÉÑ¹•É	±½¬ˆøñ‘¥Ø±…ÍÌô‰Á…ÉÑ¹•É!•…‘¥¹œˆùA…ÉÑ¹•ÉÌ¥¸€Ñ		ð½‘¥Øøñ‘¥Ø±…ÍÌô‰Á…¥ÉMÕµµ…ÉäˆøñÍÁ…¸ø‘í½¹”ñð€‹ŠP‰ôð½ÍÁ…¸øñÍÁ…¸ø‘íÑÝ¼ñð€‹ŠP‰ôð½ÍÁ…¸øð½‘¥Øøð½‘¥Øù€ì(€€€ôì(€€€½¹ÍÐ…µ‰É½Í•I½±•	±½¬€ô€¡œ°¤¤€ôøì(€€€€€¥˜€ ……µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤¤É•ÑÕÉ¸€ˆˆì(€€€€€½¹ÍÐÑ•…´€ôœ¹µ…À¡MÑÉ¥¹œ¤¹™¥±Ñ•È ¡¥¤€ôø¥€˜˜¥€„ôô9=}AIQ9I}%¤°(€€€€€€€É½±•Ì€ô…µ‰É½Í•I½±•Ì¡‘…ä°¤¤°(€€€€€€€ÍÑ…ÉÑ•€ô…µ‰É½Í•Q•…µ!…Í¹ÑÉ¥•Ì¡‘…ä°¤¤°(€€€€€€€½ÁÑ¥½¹Ì€ô€¡Í•±•Ñ•‘%°•á±Õ‘•%€ô€ˆˆ¤€ôøÑ•…´(€€€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôø¥€„ôô•á±Õ‘•%¤(€€€€€€€€€€¹µ…À ¡¥¤€ôø€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í¥‘ôˆ€‘í¥€ôôôÍ•±•Ñ•‘%€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôø‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½½ÁÑ¥½¸ù€¤(€€€€€€€€€€¹©½¥¸ ˆˆ¤ì(€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰…µ‰É½Í•Q•…µI½±•Ì€‘íÍÑ½É”¹•Ù•¹Ð¹…µ‰É½Í•M½É¥¹5½‘”€ôôô€‰Í½É•É=¹±äˆ€ü€‰Í½É•É=¹±äˆ€è€ˆ‰ôˆøñ±…‰•°ùM½É•ÈñÍ•±•Ð‘…Ñ„µ…µ‰É½Í•Í½É•Èôˆ‘í¥ôˆ€‘íÍÑ…ÉÑ•€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôø‘í½ÁÑ¥½¹Ì¡É½±•Ì¹Í½É•É%¥ôð½Í•±•Ðøð½±…‰•°ø‘íÍÑ½É”¹•Ù•¹Ð¹…µ‰É½Í•M½É¥¹5½‘”€ôôô€‰Í½É•É=¹±äˆ€ü€ˆˆ€è€ñ±…‰•°ù5…É­•ÈñÍ•±•Ð‘…Ñ„µ…µ‰É½Í•µ…É­•Èôˆ‘í¥ôˆ€‘íÍÑ…ÉÑ•€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôø‘í½ÁÑ¥½¹Ì¡É½±•Ì¹µ…É­•É%°É½±•Ì¹Í½É•É%¥ôð½Í•±•Ðøð½±…‰•°ùôð½‘¥Øù€ì(€€€ôì(€€€½¹ÍÐ…±±M…Ù•€ôÉÉ…ä¹™É½´ (€€€€€ì±•¹Ñ èÍÑ½É”¹•Ù•¹Ð¹‘…åÌô°(€€€€€€¡|°¤¤€ôøÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÁl‰‘…äˆ€¬€¡¤€¬€Ä¥tü¹Í…Ù•°(€€€€¤¹•Ù•Éä¡	½½±•…¸¤ì(€€€½¹ÍÐ¡…¹‘¥…ÁÍ½µÁ±•Ñ”€ôÉÉ…ä¹™É½´ (€€€€€ì±•¹Ñ èÍÑ½É”¹•Ù•¹Ð¹‘…åÌô°(€€€€€€¡|°¤¤€ôø•Ù•¹ÑA±…å•É…Ñ•½É¥•Ì¡¤¬Ä±ÍÑ½É”¹•Ù•¹Ð¤¹•Ù•Éä¡…Ñ•½Éäôù•¹…‰±•‘Ù•¹ÑQ••Í½É…Ñ•½Éä¡ÍÑ½É”¹•Ù•¹Ð±¤¬Ä±…Ñ•½Éä¤¹•Ù•Éä¡Ñ•”ôùÑ••!…¹‘¥…ÁÍ½µÁ±•Ñ”¡¤¬Ä±Ñ•”±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¤¤¤°(€€€€¤¹•Ù•Éä¡	½½±•…¸¤ì(€€€½¹ÍÐ±½­I•…‘ä€ô…±±M…Ù•€˜˜¡…¹‘¥…ÁÍ½µÁ±•Ñ”ì(€€€½¹ÍÐ…Ý…¥Ñ¥¹%‘Ì€ô¥‘Ì¹™¥±Ñ•È (€€€€€€¡¥¤€ôøÍÑ½É”¹•Ù•¹Ð¹¥¹Ù¥Ñ…Ñ¥½¹MÑ…ÑÕÌü¹mMÑÉ¥¹œ¡¥¥t€ôôô€‰…Ý…¥Ñ¥¹œˆ°(€€€€¤ì(€€€•¹ÍÕÉ•Ù•¹ÑQ••A±…¹¹¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¤ì(€€€½¹ÍÐÑ••…Ñ•½É¥•Ìõ•Ù•¹ÑA±…å•É…Ñ•½É¥•Ì¡‘…ä±ÍÑ½É”¹•Ù•¹Ð¤°(€€€€€Ñ••¥¹…°€ôÑ••M•±•Ñ¥½¹%Í¥¹…°¡‘…ä¤°(€€€€€Í½É•¹ÑÉä€ô™¥ÉÍÑ…åM½É•¹ÑÉä¡‘…ä¤°(€€€€€Ñ••M½É¥¹MÑ…ÉÑ•€ô	½½±•…¸¡Í½É•¹ÑÉä¤°(€€€€€Í•±•Ñ•‘Q••½µÁ±•Ñ”€ôÑ••…Ñ•½É¥•Ì¹•Ù•Éä¡…Ñ•½ÉäôùÑ••!…¹‘¥…ÁÍ½µÁ±•Ñ”¡‘…ä±Í•±•Ñ•‘Ù•¹ÑQ•”¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¤±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¤¤°(€€€€€•Ù•¹Ñ½ÕÉÍ”€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤°(€€€€€•Ù•¹ÑM½É¥¹MÑ…ÉÑ•€ôÉÉ…ä¹™É½´¡ì±•¹Ñ èÍÑ½É”¹•Ù•¹Ð¹‘…åÌñð€Äô°€¡|°¥¹‘•à¤€ôø™¥ÉÍÑ…åM½É•¹ÑÉä¡¥¹‘•à€¬€Ä¤¤¹Í½µ”¡	½½±•…¸¤°(€€€€€µ…É­•É%¹±Õ‘•€ôÍÑ½É”¹•Ù•¹Ð¹…µ‰É½Í•M½É¥¹5½‘”€„ôô€‰Í½É•É=¹±äˆ°(€€€€€µ…É­•É¡½¥”€ô…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤€ü€ñ‘¥Ø±…ÍÌô‰…µ‰É½Í•5…É­•É¡½¥”ˆøñˆùM½É”5…É­•Èð½ˆøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ¥ô‰Ñ½±•µ‰É½Í•5…É­•Èˆ±…ÍÌôˆ‘íµ…É­•É%¹±Õ‘•€ü€‰¥¹±Õ‘•ˆ€è€ˆ‰ôˆ€‘í•Ù•¹ÑM½É¥¹MÑ…ÉÑ•€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôø‘íµ…É­•É%¹±Õ‘•€ü€‹ŠrL5…É­•È%¹±Õ‘•ˆ€è€‰±¥¬Ñ¼¥¹±Õ‘”„M½É”5…É­•È‰ôð½‰ÕÑÑ½¸øñÍµ…±°ø‘í•Ù•¹ÑM½É¥¹MÑ…ÉÑ•€ü€‰M½É¥¹œ¡…ÌÍÑ…ÉÑ•ƒŠPÍ•ÑÑ¥¹œ±½­•¸ˆ€è€‰ÁÁ±¥•ÌÑ¼•Ù•ÉäÑ•…´¥¸Ñ¡¥Ì•Ù•¹Ð¸‰ôð½Íµ…±°øð½‘¥Øù€€è€ˆˆ°(€€€€€Ñ••¡…¹•½¹ÑÉ½°€ô±½­•€˜˜Ñ••¥¹…°€˜˜€…Ñ••M½É¥¹MÑ…ÉÑ•€ü€œñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Í½™ÐÉ•½Á•¹Q••	Ñ¸ˆ¥ô‰É•½Á•¹Ù•¹ÑQ•”ˆù¡…¹”Q•”	•™½É”M½É¥¹œð½‰ÕÑÑ½¸øœ€è€ˆˆ°(€€€€€Ñ••A…¹•°€ô€ñ‘¥Ø±…ÍÌô‰•Ù•¹ÑQ••A…¹•°€‘í…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤€ü€‰…µ‰É½Í•Q••A…¹•°ˆ€è€ˆ‰ô€‘íÑ••¥¹…°€ü€‰™¥¹…°ˆ€è€ˆ‰ôˆøñ‘¥ØøñÍµ…±°ø‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰A1e%9Qˆ€èd€‘í‘…åôA1e%9Qôð½Íµ…±°øñ Ìø‘íÑ••¥¹…°€ü€‹ŠrL€ˆ€è€ˆ‰ô‘íÑ••…Ñ•½É¥•Ì¹µ…À¡…Ñ•½Éäôù€‘í…Ñ•½Éäôôô‰Ý½µ•¸ˆü‰]½µ•¸ˆè‰5•¸‰ôè€‘í•Ù•¹ÑQ••5…É­•É½±½ÕÈ¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¥õ€¤¹©½¥¸ ˆƒ
Ü€ˆ¥ôð½ ÌøñÀø‘íÑ••¥¹…°€ü€‰¥¹…±¥Í•™½ÈÍ½É¥¹œ¸ˆ€è±½­•€ü€‰¡½½Í”Ñ¡”Ñ•”™½È•… …Ñ•½Éä°Ñ¡•¸™¥¹…±¥Í”‰•™½É”…¹å½¹”ÍÑ…ÉÑÌÍ½É¥¹œ¸ˆ€è€‰AÉ½Ù¥Í¥½¹…°Í•±•Ñ¥½¹Ì¸±°…±Õ±…Ñ•¡…¹‘¥…ÀÍ•ÑÌÉ•µ…¥¸ÍÑ½É•¸‰ôð½Àøð½‘¥Øøñ‘¥Ø±…ÍÌô‰•Ù•¹ÑQ••…Ñ•½ÉåÉ¥ˆø‘íÑ••…Ñ•½É¥•Ì¹µ…À¡…Ñ•½Éäôù€ñÍ•Ñ¥½¸±…ÍÌô‰…Ñ•½ÉåA±…å¥¹Q•”ˆøñˆø‘í…Ñ•½Éäôôô‰Ý½µ•¸ˆü‰]½µ•¸Ìˆè‰5•¸Ì‰ôÑ•”ð½ˆøñ‘¥Ø±…ÍÌô‰•Ù•¹ÑQ••	ÕÑÑ½¹Ìˆø‘í•¹…‰±•‘Ù•¹ÑQ••Í½É…Ñ•½Éä¡ÍÑ½É”¹•Ù•¹Ð±‘…ä±…Ñ•½Éä¤¹µ…À¡Ñ•”ôù€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µ•Ù•¹ÑÑ•”ôˆ‘í…Ñ•½Éåõð‘íÑ••ôˆ±…ÍÌôˆ‘íÍ•±•Ñ•‘Ù•¹ÑQ•”¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¤ôôõÑ•”ü‰…Ñ¥Ù”ˆèˆ‰ôˆ€‘íÑ••¥¹…±ññÑ••M½É¥¹MÑ…ÉÑ•ü‰‘¥Í…‰±•ˆèˆ‰ôø‘í•ÍŒ¡•Ù•¹ÑQ••¥ÍÁ±…å9…µ”¡‘…ä±Ñ•”±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä±•Ù•¹Ñ½ÕÉÍ”¤¥ôñÍµ…±°ø‘íÑ••!…¹‘¥…ÁÍ½µÁ±•Ñ”¡‘…ä±Ñ•”±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¤ü‰I•…‘äˆè‰%¹½µÁ±•Ñ”‰ôð½Íµ…±°øð½‰ÕÑÑ½¸ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½Í•Ñ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øø‘íÑ••¡…¹•½¹ÑÉ½±ô‘íµ…É­•É¡½¥•ô‘í±½­•€˜˜€…Ñ••¥¹…°€ü€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰ÁÉ¥µ…Éä™¥¹…±¥Í•Q••	Ñ¸ˆ¥ô‰™¥¹…±¥Í•Ù•¹ÑQ•”ˆ€‘íÍ•±•Ñ•‘Q••½µÁ±•Ñ”€˜˜€…Ñ••M½É¥¹MÑ…ÉÑ•€ü€ˆˆ€è€‰‘¥Í…‰±•‰ôù%91%MQM1Q%=8ð½‰ÕÑÑ½¸ù€€è€ˆ‰ô‘íÑ••M½É¥¹MÑ…ÉÑ•€˜˜€…Ñ••¥¹…°€ü€œñÍÑÉ½¹œ±…ÍÌô‰Ñ••M•±•Ñ¥½¹]…É¹¥¹œˆùM½É¥¹œ¡…Ì‰•Õ¸¸Q•”Í•±•Ñ¥½¸…¹¹½Ð‰”¡…¹•¸ð½ÍÑÉ½¹œøœ€è€ˆ‰ôð½‘¥Øù€°(€€€€€ÍÑ…ÉÑ¥¹!½±”€ô€¬¡ÍÑ…ÉÑ!½±•Í½È¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¥lÁtñð€Ä¤°(€€€€€Í½É¥¹	±½­•È€ôÍ½É•¹ÑÉä(€€€€€€€€ü€‘í•Ù•¹ÑA±…å•È¡Í½É•¹ÑÉä¹Í½É•É%°‘…ä¤ü¹¹…µ”ñð€‰Á±…å•È‰ô¡…Ì…¸•¹ÑÉäÉ•½É‘•½¸!½±”€‘íÍ½É•¹ÑÉä¹¡½±•ô¹€(€€€€€€€€è€ˆˆ°(€€€€€ÍÑ…ÉÑ¥¹!½±•A…¹•°€ô(€€€€€€€±½­•€˜˜µ•Ñ¡½€ôôô€‰Í¥¹±”ˆ(€€€€€€€€€€ü€ñ‘¥Ø±…ÍÌô‰•Ù•¹ÑQ••A…¹•°ÍÑ…ÉÑ¥¹!½±•A…¹•°€‘íÑ••M½É¥¹MÑ…ÉÑ•€ü€‰±½­•ˆ€è€ˆ‰ôˆøñ‘¥ØøñÍµ…±°ø‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰MQIQ%9!=1ˆ€èd€‘í‘…åôMQIQ%9!=1ôð½Íµ…±°øñ Ìù!½±”€‘íÍÑ…ÉÑ¥¹!½±•ôð½ ÌøñÀø‘íÑ••M½É¥¹MÑ…ÉÑ•€üMÑ…ÉÑ¥¹œ¡½±”…¹¹½Ð‰”¡…¹•¸€‘í•ÍŒ¡Í½É¥¹	±½­•È¥õ€€è€‰%˜Ñ¡”±Õˆ¡…¹•ÌÑ¡”ÍÑ…ÉÑ¥¹œ¡½±”°ÕÁ‘…Ñ”¥Ð¡•É”‰•™½É”…¹å½¹”‰•¥¹ÌÍ½É¥¹œ¸‰ôð½Àøð½‘¥Øøñ‘¥Ø±…ÍÌô‰ÍÑ…ÉÑ¥¹!½±•¡…¹”ˆøñ±…‰•°ù9•ÜMÑ…ÉÑ¥¹œ!½±”ñÍ•±•Ð¥ô‰±½­•‘MÑ…ÉÑ!½±”ˆ€‘íÑ••M½É¥¹MÑ…ÉÑ•€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôø‘íÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôø€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í¤€¬€Åôˆ€‘í¤€¬€Ä€ôôôÍÑ…ÉÑ¥¹!½±”€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôù!½±”€‘í¤€¬€Åôð½½ÁÑ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½Í•±•Ðøð½±…‰•°øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰…ÁÁ±åMÑ…ÉÑ¥¹!½±”ˆ€‘íÑ••M½É¥¹MÑ…ÉÑ•€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôùAA1dMQIQ%9!=1ð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øù€(€€€€€€€€€€è€ˆˆì(€€€½¹ÍÐ…™™•Ñ•€ôÑàü¹…™™•Ñ•€üÁ±…å•È¡Ñà¹…™™•Ñ•¤€è¹Õ±°ì(€€€½¹ÍÐÍ¡½ÉÑ9½Ñ¥”€ôÑà(€€€€€€ü…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤(€€€€€€€€ü€ñ‘¥Ø±…ÍÌô‰Ù¥ÉÑÕ…±9½Ñ¥”ˆøñ Ðø‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰Q¡É•”µA±…å•Èµ‰É½Í”Q•…´ˆ€èQ¡É•”µA±…å•Èµ‰É½Í”Q•…´ƒŠP…ä€‘í‘…åõôð½ ÐøñÀùQ¡¥ÌÑ•…´Á±…åÌÝ¥Ñ ¥ÑÌÑ¡É•”…ÑÕ…°½±™•ÉÌ¸9¼Y¥ÉÑÕ…°A±…å•ÈÍ½É”¥ÌÕÍ•¸ð½Àø‘í…µ‰É½Í•áÑÉ…ÑÑ•µÁÑÌ¹±•¹Ñ €ü€ñÀøñˆù9Q@áÑÉ„M¡½ÑÌèð½ˆø€‘í…µ‰É½Í•áÑÉ…ÑÑ•µÁÑÌ¹µ…À ¡…ÑÑ•µÁÐ¤€ôø!½±”€‘í…ÑÑ•µÁÐ¹¡½±•ôƒŠP€‘í•ÍŒ¡…ÑÑ•µÁÐ¹¹…µ”¥õ€¤¹©½¥¸ ˆì€ˆ¥ô¸Q¡”•áÑÉ„…ÑÑ•µÁÐÉ½Ñ…Ñ•ÌÑ¼„‘¥™™•É•¹Ð½±™•ÈÝ¡•¸ÑÝ¼9Q@¡½±•Ì…É”Í•±•Ñ•ì•¥Ñ¡•ÈÑ•”Í¡½Ðµ…äÅÕ…±¥™ä¸ð½Àù€€è€ˆ‰ôð½‘¥Øù€(€€€€€€€€è€ñ‘¥Ø±…ÍÌô‰Ù¥ÉÑÕ…±9½Ñ¥”ˆø(€€€ñ Ðø‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰M¡½ÉÐQ•…´ÉÉ…¹•µ•¹Ðˆ€èM¡½ÉÐQ•…´ÉÉ…¹•µ•¹ÐƒŠP…ä€‘í‘…åõôð½ Ðø(€€€ñÀùÕ”Ñ¼™•Ý•ÈÑ¡…¸Ñ¡”Á±…¹¹•¹Õµ‰•È½˜Á±…å•ÉÌ‰•¥¹œ…Ù…¥±…‰±”™½ÈÑ¡¥Ì•Ù•¹Ð°€ñˆø‘í•ÍŒ¡…™™•Ñ•ü¹¹…µ”ñð€‰Ñ¡”Á±…å•Èˆ¥ôð½ˆø¡…Ì‰••¸Á±…•¥¸„Ñ•…´Ý¥Ñ 9¼A…ÉÑ¹•È¸€ñÍÁ…¸±…ÍÌô‰ÙÁ9…µ”ˆøñˆø‘í•ÍŒ¡ÙÀü¹¹…µ”ñð€‰Y¥ÉÑÕ…°A±…å•Èˆ¥ô€¡Y@¤ð½ˆøð½ÍÁ…¸ø¡…Ì‰••¸É…¹‘½µ±äÍ•±•Ñ•…ÌÑ¡”Y¥ÉÑÕ…°A±…å•È¸ð½Àø(€€€ñÀù]¡•É”„Á…ÉÑ¹•È½È™½ÕÉÑ Ñ•…´µ•µ‰•ÈÌÍ½É”¥ÌÉ•ÅÕ¥É•°Ñ¡”Y¥ÉÑÕ…°A±…å•ÈÌÍ½É”Ý¥±°‰”ÕÍ•¸Q¡”Y¥ÉÑÕ…°A±…å•ÈÉ•µ…¥¹Ì¥¸Ñ¡•¥È½Ý¸Á±…å¥¹œÉ½ÕÀ…¹¥Ì¹½Ð•¹Ñ¥Ñ±•Ñ¼…¹ä…‘‘¥Ñ¥½¹…°ÁÉ¥é”½ÈÉ•ÅÕ¥É•Ñ¼µ…­”…¹ä…‘‘¥Ñ¥½¹…°	•ÍÐ€Ì½˜€Ð1½ÑÑ•Éä½¹ÑÉ¥‰ÕÑ¥½¸‰•…ÕÍ”Ñ¡•¥ÈÍ½É”¥Ì…±Í¼‰•¥¹œÕÍ•Ù¥ÉÑÕ…±±ä¸ð½Àø(€€€‘í•áÑÉ„€ü€ñÀøñˆù9Q@áÑÉ„M¡½Ðèð½ˆø€‘í•ÍŒ¡•áÑÉ„¹¹…µ”¥ô¡…Ì‰••¸É…¹‘½µ±äÍ•±•Ñ•™É½´Ñ¡”Ñ¡É•”½±™•ÉÌ¥¸Ñ¡”Í¡½ÉÐÑ•…´¸=¸•… 9Q@¡½±”Ñ¡…Ð‘…ä°€‘í•ÍŒ¡•áÑÉ„¹¹…µ”¥ôµ…äÁ±…äÑÝ¼Ñ•”Í¡½ÑÌì•¥Ñ¡•ÈÍ¡½Ðµ…äÅÕ…±¥™ä™½ÈÑ¡”9Q@¸ð½Àù€€è€ˆ‰ô(€ð½‘¥Øù€(€€€€€€è€ˆˆì(€€€¥˜€  ˆÑ•…µÍA…•!•…‘¥¹œˆ¤¤€ ˆÑ•…µÍA…•!•…‘¥¹œˆ¤¹Ñ•áÑ½¹Ñ•¹Ð€ôÉ½ÕÁÌ…¹Q•…µÌ…ä€‘í‘…åô€‘í¹…µ•ôƒ
Ü€‘í¥‘Ì¹±•¹Ñ¡ôÁ½Í¥Ñ¥½¹Ìƒ
Ü€‘íµ•Ñ¡½€ôôô€‰Í¡½ÑÕ¸ˆ€ü€‰M¡½ÑÕ¸ˆ€èµ•Ñ¡½€ôôô€‰ÑÝ¼ˆ€ü€‰QÝ¼Q••Ìˆ€è€‰M¥¹±”Q•”‰ô‘í±½­•€ü€ˆƒ
ÜY9P1=-ˆ€è€ˆ‰õ€ì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰Ñ•…µÍQ½Àˆø(€€€ñ‘¥Øøñ Ìø‘í•ÍŒ¡ÍÑ½É”¹•Ù•¹Ð¹¹…µ”¥ôð½ Ìøð½‘¥Øø(€€€ñ‘¥Ø±…ÍÌô‰Ñ•…µÍQ½ÁÑ¥½¹Ìˆø‘í‘…åQ…‰Ì ‰É½ÕÁ‘…äˆ°‘…ä¥ô‘í±½­•€ü€ˆˆ€è€ñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ð‰…­Q½A±…¸ˆ¥ô‰‰…­Q½Ù•¹ÑM•ÑÕÀˆûŠ@	…¬Ñ¼Ù•¹ÐM•ÑÕÀð½‰ÕÑÑ½¸ùôð½‘¥Øø(€ð½‘¥Øø(€€€‘ì¡ÍÑ½É”¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹Ìñðmt¤¹¥¹±Õ‘•Ì ‰…ÁQ•…µÌˆ¤€ü…ÁQ•…µÍ!Ñµ°¡ÍÑ½É”¹•Ù•¹Ð°…ÁI½ÍÑ•È ¤°…ÁQ•…µÍ1½­• ¤¤€è€ˆ‰ô(€‘í±½­•€ü€ñ‘¥Ø±…ÍÌô‰±½­•‘	…¹¹•ÈˆûÂ~RHÙ•¹Ð1½­•ƒŠPÁ±…å•ÉÌ°½µÁ•Ñ¥Ñ¥½¹Ì…¹Ñ•…µÌ…É”™¥á•¸Q¡”Á±…å¥¹œÑ•”…¹Í¥¹±”µÑ•”ÍÑ…ÉÑ¥¹œ¡½±”É•µ…¥¸¡…¹•…‰±”Õ¹Ñ¥°Í½É¥¹œ‰•¥¹Ì¸ð½‘¥Øù€€èÑ•…µÍM…Ù•€ü€ñ‘¥Ø±…ÍÌô‰±½­•‘	…¹¹•ÈÑ•…µÍM…Ù•‘	…¹¹•ÈˆûÂ~RH€‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰Q•…µÌ…É”ˆ€è…ä€‘í‘…åôÑ•…µÌ…É•ô±½­•¸Q¡•äÝ¥±°É•µ…¥¸Õ¹¡…¹•Ý¡¥±”å½Ôµ½Ù”Ñ¡É½Õ Ù•¹ÐM•ÑÕÀ¸ð½‘¥Øù€€è€ñ‘¥Ø±…ÍÌô‰Ñ•…µÍQ½½±‰…Èˆøñ‘¥Ø±…ÍÌô‰‘É…Ý5•Ñ¡½‘Ìˆøñ‰ÕÑÑ½¸±…ÍÌôˆ‘íÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ôôô€‰¡¥ÍÑ½Éäˆ€ü€‰ÁÉ¥µ…Éäˆ€è€‰Í½™Ð‰ôˆ¥ô‰¡¥ÍÑ½Éå	…±…¹•ˆù!¥ÍÑ½Éä	…±…¹•ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌôˆ‘íÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ôôô€‰É…¹‘½´ˆ€ü€‰ÁÉ¥µ…Éäˆ€è€‰Í½™Ð‰ôˆ¥ô‰É…¹‘½µ¥Í•É½ÕÁÌˆùI…¹‘½´ð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌôˆ‘íÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ôôô€‰µ…¹Õ…°ˆ€ü€‰ÁÉ¥µ…Éäˆ€è€‰Í½™Ð‰ôˆ¥ô‰µ…¹Õ…±5½‘”ˆù5…¹Õ…°ð½‰ÕÑÑ½¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰Ñ•…µÍMÑ…ÑÕÌˆø‘íÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ü€‰¥ÉÍÐÁ±…å•ÈÍ•±•Ñ•ƒŠP¹½Ü±¥¬MÝ…À‰•Í¥‘”Ñ¡”Á±…å•ÈÑ¼•á¡…¹”Ý¥Ñ ¸ˆ€èÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ôôô€‰µ…¹Õ…°ˆ€ü€‰5…¹Õ…°µ½‘”…Ñ¥Ù”ƒŠP±¥¬MÝ…À‰•Í¥‘”…¹äÁ±…å•ÈÑ¼‰•¥¸¸ˆ€èÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ôôô€‰É…¹‘½´ˆ€ü€‰I…¹‘½´‘É…ÜÍ•±•Ñ•¸ˆ€èÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ôôô€‰µ¥á¥¹œˆ€ü€‰5…á¥µÕ´A±…å•È5¥á¥¹œÁ±…¹ÌÑ¡”Ý¡½±”•Ù•¹ÐÑ½•Ñ¡•È¸ˆ€èÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰!¥ÍÑ½Éä	…±…¹•ÕÍ•ÌÁÉ•Ù¥½ÕÌÁ±…å¥¹œ¡¥ÍÑ½ÉäÑ¼Ù…ÉäÑ¡”É½ÕÁÌ…¹Á…ÉÑ¹•ÉÍ¡¥ÁÌ¸ˆ€è€‰!¥ÍÑ½Éä	…±…¹•ÕÍ•ÌÁÉ•Ù¥½ÕÌÁ±…å¥¹œ¡¥ÍÑ½Éä…¹•…É±¥•È‘…åÌ½˜Ñ¡¥Ì•Ù•¹ÐÑ¼É•‘Õ”É•Á•…Ñ•É½ÕÁÌ…¹Á…ÉÑ¹•ÉÌ¸‰ôð½‘¥Øøð½‘¥Øùô(€‘ì…±½­•€ü€ñ‘¥Ø±…ÍÌô‰¹ÑÁ	½àµ¥á¥¹¡½¥”ˆøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌôˆ‘íÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ôôô€‰µ¥á¥¹œˆ€ü€‰ÁÉ¥µ…Éäˆ€è€‰Í½™Ð‰ôˆ¥ô‰µ…á¥µÕµA±…å•É5¥á¥¹œˆ€‘í•Ù•¹Ñ…åÌ ¤¹Í½µ”¡ôù™¥ÉÍÑ…åM½É•¹ÑÉä¡¤ñð=‰©•Ð¹­•åÌ¡ÍÑ½É”¹•Ù•¹Ð¹µ…¹Õ…±M½É•…É‘Ìü¹l‰‘…äˆ­‘tü¹É½ÕÁÌñðíô¤¹±•¹Ñ ¤ü‰‘¥Í…‰±•ˆèˆ‰ôù5…á¥µÕ´A±…å•È5¥á¥¹œð½‰ÕÑÑ½¸ø€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰±½­±±Ù•¹ÑQ•…µÌˆ€‘í•Ù•¹Ñ…åÌ ¤¹•Ù•Éä¡ôùÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ­‘tü¹Í…Ù•¤ü‰‘¥Í…‰±•ˆèˆ‰ôù1½¬±°Q•…µÌ±°…åÌð½‰ÕÑÑ½¸ø‘í•Ù•¹Ñ…åÌ ¤¹•Ù•Éä¡ôùÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ­‘tü¹Í…Ù•¤üœñÀøñˆù±°‘…åÏŠdÑ•…µÌ…É”Í…Ù•…¹±½­•¸ð½ˆøð½ÀøœèœôñÀùÉ…Ü…±°‘…åÌÑ½•Ñ¡•ÈÑ¼µ…á¥µ¥Í”‘¥™™•É•¹ÐÉ½ÕÁµ…Ñ•Ì…¹…Ù½¥É•Á•…Ñ•€Ñ		Á…ÉÑ¹•ÉÌ¸á¥ÍÑ¥¹œÍ…Ù•‘…åÌ…É”É•Á±…•½¹±ä…™Ñ•È½¹™¥Éµ…Ñ¥½¸¸ð½Àøð½‘¥Øù€€è€ˆ‰ô(€‘íµ¥á¥¹MÕµµ…Éå!Ñµ° ¥ô(€‘í‘…ä€ø€Ä€˜˜€…±½­•€˜˜€…Ñ•…µÍM…Ù•€ü€ñ‘¥Ø±…ÍÌô‰‘…äÉ!¥ÍÑ½Éå9½Ñ”ˆøñˆù…ä€‘í‘…åô‰…±…¹¥¹œèð½ˆøÑ½‘…äÌ‘É…ÜÑÉ•…ÑÌ•…É±¥•ÈÉ½ÕÁÌ…¹€Ñ		Á…ÉÑ¹•ÉÍ¡¥ÁÌ…Ì™É•Í ¡¥ÍÑ½Éä…¹¥Ù•ÌÑ¡•´ÍÑÉ½¹œÉ•Á•…ÐÁ•¹…±Ñ¥•Ì¸ð½‘¥Øù€€è€ˆ‰ô(€‘í…Ý…¥Ñ¥¹%‘Ì¹±•¹Ñ €ü€ñ‘¥Ø±…ÍÌô‰Á±…¹¹¥¹Ý…¥Ñ¥¹9½Ñ¥”ˆøñˆø‘í…Ý…¥Ñ¥¹%‘Ì¹±•¹Ñ¡ôÁ±…å•È‘í…Ý…¥Ñ¥¹%‘Ì¹±•¹Ñ €ôôô€Ä€ü€ˆ¥Ìˆ€è€‰Ì…É”‰ôÍÑ¥±°…Ý…¥Ñ¥¹œ„É•Á±ä¸ð½ˆøñÍÁ…¸ùQ¡•äÉ•µ…¥¸…µ‰•È¥¸Ñ¡¥ÌÁÉ½Ù¥Í¥½¹…°Á±…¸¸I•ÑÕÉ¸Ñ¼Ù•¹ÐM•ÑÕÀÑ¼µ…É¬•… …•ÁÑ…¹”É••¸‰•™½É”±½­¥¹œ¸ð½ÍÁ…¸øð½‘¥Øù€€è€ˆ‰ô(€‘íÑ••A…¹•±ô(€‘íÍÑ…ÉÑ¥¹!½±•A…¹•±ô(€‘ì…±½­•€˜˜€…Ñ•…µÍM…Ù•€ü€ñÀÉ½±”ô‰ÍÑ…ÑÕÌˆø‘íÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àü¹‘…ä€ôôô‘…ä€üQ•…´€‘íÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…À¹¥¹‘•à€¬€ÅôÍ•±•Ñ•ƒŠP±¥¬MÝ…À½¸Ñ¡”Ñ•…´Ñ¼•á¡…¹”Ñ•”Í±½ÑÌÝ¥Ñ °½È±¥¬Ñ¡”Í•±•Ñ•‰ÕÑÑ½¸Ñ¼…¹•°¹€€è€‰Q¼¡…¹”Ñ¡”½É‘•È½˜Á±…ä°±¥¬MÝ…À‰•Í¥‘”Ñ¡”ÍÑ…ÉÑ¥¹œ¡½±”½¸ÑÝ¼Ñ•…µÌ¸A±…å•ÉÌ…¹Á…ÉÑ¹•ÉÍ¡¥ÁÌÍÑ…äÑ½•Ñ¡•ÈìÑ¡”Ñ•…µÌ•á¡…¹”¹Õµ‰•ÉÌ…¹Ñ•”Í±½ÑÌ¸‰ôð½Àù€€è€ˆ‰ô(€ñ‘¥Ø±…ÍÌô‰É½ÕÁÉ¥ˆø‘íÉ½ÕÁÌ(€€€¹µ…À (€€€€€¡œ°¤¤€ôø€ñ‘¥Ø±…ÍÌô‰Á±…å¥¹É½ÕÀˆø(€€€ñ‘¥Ø±…ÍÌô‰É½ÕÁ!•…ˆøñ‘¥Øøñ ÐùÉ½ÕÀ€‘í¤€¬€Åôð½ ÐøñÍµ…±°ø‘íœ¹™¥±Ñ•È ¡à¤€ôøMÑÉ¥¹œ¡à¤€„ôô9=}AIQ9I}%¤¹±•¹Ñ¡ô…ÑÕ…°Á±…å•È‘íœ¹™¥±Ñ•È ¡à¤€ôøMÑÉ¥¹œ¡à¤€„ôô9=}AIQ9I}%¤¹±•¹Ñ €ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô‘íœ¹Í½µ” ¡à¤€ôøMÑÉ¥¹œ¡à¤€ôôô9=}AIQ9I}%¤€ü€ˆ€¬9¼A…ÉÑ¹•Èˆ€è€ˆ‰ôƒ
ÜQ•”Ñ¥µ”€‘íÉ½ÕÁQ••Q¥µ”¡‘…ä°¤¥ôð½Íµ…±°øð½‘¥Øø‘íÍÑ…ÉÑ½¹ÑÉ½°¡¤¥ôñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌôˆ‘íÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àü¹‘…ä€ôôô‘…ä€˜˜ÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…À¹¥¹‘•à€ôôô¤€ü€‰ÁÉ¥µ…Éäˆ€è€‰Í½™Ð‰ôˆ‘…Ñ„µÍÝ…ÁÑ•…´ôˆ‘í¥ôˆ…É¥„µ±…‰•°ô‰MÝ…ÀÝ¡½±”Ñ•…´€‘í¤€¬€Åôˆ€‘í±½­•ñðÑ•…µÍM…Ù•ñðÑ••M½É¥¹MÑ…ÉÑ•€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôø‘íÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àü¹‘…ä€ôôô‘…ä€˜˜ÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…À¹¥¹‘•à€ôôô¤€ü€‰M•±•Ñ•ƒ
Ü…¹•°ˆ€è€‰MÝ…À‰ôð½‰ÕÑÑ½¸øð½‘¥Øø(€€€ñ‘¥Ø±…ÍÌô‰É½ÕÁA±…å•ÉÌˆø‘íœ¹µ…À ¡Á¥°Á¤¤€ôøÁ±…å•ÉI½Ü¡Á¥°¤°Á¤¤¤¹©½¥¸ ˆˆ¥ôð½‘¥Øø(€€€‘í…µ‰É½Í•I½±•	±½¬¡œ°¤¥ô(€€€‘íÍ•ÑÕÀ¹Í¡½ÉÑQ•…µÌü¹mMÑÉ¥¹œ¡¤¥t€ü€  ¤ôùí½¹ÍÐ„õÍ•ÑÕÀ¹Í¡½ÉÑQ•…µÍmMÑÉ¥¹œ¡¤¥tíÉ•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰ÙÁÍÍ¥¹µ•¹Ðˆøñˆø‘í…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤üQ¡É•”µÁ±…å•Èµ‰É½Í”Ñ•…´œèY¥ÉÑÕ…°A±…å•Èè€œ­•ÍŒ¡•Ù•¹ÑA±…å•È¡„¹Ù¥ÉÑÕ…±A±…å•È°‘…ä¤ü¹¹…µ•ñð9½ÐÍ•±•Ñ•œ¤¬œ€¡Y@¤ôð½ˆø‘í=‰©•Ð¹•¹ÑÉ¥•Ì¡„¹¹ÑÁáÑÉ…A±…å•ÉÍññíô¤¹µ…À ¡m¡½±”±¥‘t¤ôù€ñÍÁ…¸±…ÍÌô‰¹ÑÁáÑÉ„ˆøñˆù!½±”€‘í¡½±•ô9Q@áÑÉ„M¡½Ðèð½ˆø€‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ•ñðA±…å•Èœ¥ôƒŠPÑÝ¼Í¡½ÑÌð½ÍÁ…¸ù€¤¹©½¥¸ œœ¥ô‘í„¹¹ÑÁáÑÉ…A±…å•Èý€ñÍÁ…¸±…ÍÌô‰¹ÑÁáÑÉ„ˆù9Q@áÑÉ„M¡½Ðè€‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡„¹¹ÑÁáÑÉ…A±…å•È°‘…ä¤ü¹¹…µ•ñðA±…å•Èœ¥ôƒŠPÑÝ¼Í¡½ÑÌ½¸•… 9Q@¡½±”ð½ÍÁ…¸ù€èœôð½‘¥Øù€íô¤ ¤èœô(€€€‘ì(€€€€€…±½­•€˜˜€…Ñ•…µÍM…Ù•€˜˜(€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€˜˜(€€€€œ¹Í½µ” ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€ôôôMÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È¤¤(€€€€€€€ü€ñ‘¥Ø±…ÍÌô‰µ…¹Õ…±!¥ÍÑ½Éäˆø‘ì(€€€€€€€€€€Á±…å•É!¥ÍÑ½Éå…¥¹ÍÑÉ½ÕÀ¡ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È°œ¤(€€€€€€€€€€€€€¹µ…À (€€€€€€€€€€€€€€€¡ ¤€ôø(€€€€€€€€€€€€€€€€€ñ‘¥Øøñˆø‘í•ÍŒ¡ ¹¹…µ”¥ôð½ˆøñÍÁ…¸ùA±…å•Ñ½•Ñ¡•È€‘í ¹Á±…å•‘ôÑ¥µ”‘í ¹Á±…å•€ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô‘í ¹Á…ÉÑ¹•ÉÌ€ü€ƒ
Ü€Ñ		Á…ÉÑ¹•ÉÌ€‘í ¹Á…ÉÑ¹•ÉÍôÑ¥µ”‘í ¹Á…ÉÑ¹•ÉÌ€ôôô€Ä€ü€ˆˆ€è€‰Ì‰õ€€è€ˆ‰ôð½ÍÁ…¸øð½‘¥Øù€°(€€€€€€€€€€€€€¤(€€€€€€€€€€€€€¹©½¥¸ ˆˆ¤ñð€ˆñÍÁ…¸ù9¼ÁÉ•Ù¥½ÕÌÁ…¥É¥¹Ì¥¸Ñ¡¥ÌÉ½ÕÀ¸ð½ÍÁ…¸øˆ(€€€€€€€€ôð½‘¥Øù€(€€€€€€€è€ˆˆ(€€ô(€€€‘íÁ…¥É	±½¬¡œ±¤¥ô(€ð½‘¥Øù€°(€€€¤(€€€¹©½¥¸ ˆˆ¥ôð½‘¥Øø(€‘ì(€€€…±½­•(€€€€€ü€ñ‘¥Ø±…ÍÌô‰‘…¥±å!…¹‘¥…ÁA…¹•°ˆøñ‘¥Ø±…ÍÌô‰‘…¥±å!…¹‘¥…Á!•…ˆøñ‘¥Øøñˆø‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰…¥±ä!…¹‘¥…ÁÌˆ€è…¥±ä!…¹‘¥…ÁÌƒŠP…ä€‘í‘…åõôð½ˆøñÍÁ…¸ù¹Ñ•ÈÑ¡”Á±…å¥¹œ¡…¹‘¥…ÀÕÍ•™½È€‘í…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤€ü€‰Ñ¡”µ‰É½Í”Ñ•…´¡…¹‘¥…Àˆ€è€‰MÑ…‰±•™½É‰ô¸Q¥¬A±ÕÌ™½È„Á±ÕÌµ¡…¹‘¥…ÀÁ±…å•È¸ð½ÍÁ…¸øð½‘¥ØøñÍÁ…¸ø‘í¥‘Ì¹™¥±Ñ•È ¡à¤€ôøMÑÉ¥¹œ¡à¤€„ôô9=}AIQ9I}%€˜˜Á±…å•É…¥±å!…¹‘¥…À¡à°‘…ä¤€ôô¹Õ±°¤¹±•¹Ñ €ü€‰½µÁ±•Ñ”‰•™½É”1½¬Ù•¹Ðˆ€è€‹ŠrL½µÁ±•Ñ”‰ôð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰‘…¥±å!…¹‘¥…ÁÉ¥ˆø‘í¥‘Ì(€€€€€€€€€¹™¥±Ñ•È ¡à¤€ôøMÑÉ¥¹œ¡à¤€„ôô9=}AIQ9I}%¤(€€€€€€€€€¹µ…À ¡¥¤€ôøì(€€€€€€€€€€½¹ÍÐ €ôÁ±…å•É…¥±å!…¹‘¥…À¡¥°‘…ä¤°(€€€€€€€€€€€€Á±ÕÌ€ô9Õµ‰•È¡ ¤€ð€Àì(€€€€€€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰‘…¥±å!ÁI½ÜˆøñÍÁ…¸ø‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€ˆˆ¥ôð½ÍÁ…¸øñ‘¥Ø±…ÍÌô‰Ñ•…µ!Á½¹ÑÉ½±Ìˆøñ‘¥Ø±…ÍÌô‰Í¥¹•‘!Á%¹ÁÕÐ€‘íÁ±ÕÌ€ü€‰Á±ÕÌˆ€è€ˆ‰ôˆ‘…Ñ„µÑ•…µÍ¥¹•ôˆ‘í¥‘ôˆøñ¥¹ÁÕÐÑåÁ”ô‰¹Õµ‰•Èˆ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥Œˆµ¥¸ôˆÀˆµ…àôˆÔÐˆÍÑ•ÀôˆÄˆ‘…Ñ„µ‘…¥±å¡Àôˆ‘í¥‘ôˆÙ…±Õ”ôˆ‘í•ÍŒ¡¡…¹‘¥…Á5…¹¥ÑÕ‘”¡ ¤¥ôˆÁ±…•¡½±‘•Èô‰!Àˆøð½‘¥Øøñ±…‰•°±…ÍÌô‰Ñ•…µA±ÕÍ¡•¬ˆøñ¥¹ÁÕÐÑåÁ”ô‰¡•­‰½àˆ‘…Ñ„µ‘…¥±åÁ±ÕÌôˆ‘í¥‘ôˆ€‘íÁ±ÕÌ€ü€‰¡•­•ˆ€è€ˆ‰ôøA±ÕÌð½±…‰•°øð½‘¥Øøð½‘¥Øù€ì(€€€€€€€€ô¤(€€€€€€€€€¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½‘¥Øù€(€€€€€è€ˆˆ(ô(€‘íÍ¡½ÉÑQ•…µIÕ±•1¥¹•Ì¡ÍÑ½É”¹•Ù•¹Ð±‘…ä¤¹±•¹Ñ ý€ñ‘¥Ø±…ÍÌô‰Ù¥ÉÑÕ…±9½Ñ¥”ˆøñ ÐùM¡½ÉÐQ•…´ÉÉ…¹•µ•¹ÑÌð½ Ðø‘íÍ¡½ÉÑQ•…µIÕ±•1¥¹•Ì¡ÍÑ½É”¹•Ù•¹Ð±‘…ä¤¹µ…À¡±¥¹”ôù€ñÀø‘í•ÍŒ¡±¥¹”¥ôð½Àù€¤¹©½¥¸ œœ¥ôñÀùY¥ÉÑÕ…°Í½É•Ì‘¼¹½ÐÉ•…Ñ”•áÑÉ„¥¹‘¥Ù¥‘Õ…°É•ÍÕ±ÑÌ½È•áÑÉ„±½ÑÑ•Éä½¹ÑÉ¥‰ÕÑ¥½¹Ì¸e•±±½Ü	…±°É½Ñ…Ñ•ÌÑ¡É½Õ Ñ¡”É•…°½±™•ÉÌ½¹±ä¸ð½Àøð½‘¥Øù€éÍ¡½ÉÑ9½Ñ¥•ô(€‘ì(€€€…±½­•€˜˜€…Ñ•…µÍM…Ù•€˜˜ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È(€€€€€ü€ñ‘¥Ø±…ÍÌô‰ÍÝ…Á‘Ù¥”ˆøñˆù5…¹Õ…°Á±…•µ•¹Ð¡¥ÍÑ½ÉäƒŠP€‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È°‘…ä¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½ˆøñ‘¥Ø±…ÍÌô‰ÍÝ…Á‘Ù¥•É¥ˆø‘íÉ½ÕÁÌ(€€€€€€€€€¹µ…À ¡œ°¤¤€ôøì(€€€€€€€€€€±•ÐÉ½ÝÌ€ôÁ±…å•É!¥ÍÑ½Éå…¥¹ÍÑÉ½ÕÀ (€€€€€€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È°(€€€€€€€€€€€€€€œ¹™¥±Ñ•È ¡à¤€ôøMÑÉ¥¹œ¡à¤€„ôô9=}AIQ9I}%¤°(€€€€€€€€€€€€€¤°(€€€€€€€€€€€€Ñ½Ð€ôÉ½ÝÌ¹É•‘Õ” ¡¸°È¤€ôø¸€¬È¹Á±…å•°€À¤°(€€€€€€€€€€€€ÁÐ€ôÉ½ÝÌ¹É•‘Õ” ¡¸°È¤€ôø¸€¬È¹Á…ÉÑ¹•ÉÌ°€À¤ì(€€€€€€€€€€É•ÑÕÉ¸€ñ‘¥ØøñÍÑÉ½¹œùÉ½ÕÀ€‘í¤€¬€Åôð½ÍÑÉ½¹œøñÍÁ…¸ùA±…å•Ý¥Ñ Ñ¡•Í”Á±…å•ÉÌ€‘íÑ½ÑôÑ¥µ”‘íÑ½Ð€ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô‘íÁÐ€ü€ƒ
Ü€Ñ		Á…ÉÑ¹•É•€‘íÁÑôÑ¥µ”‘íÁÐ€ôôô€Ä€ü€ˆˆ€è€‰Ì‰õ€€è€ˆ‰ôð½ÍÁ…¸øð½‘¥Øù€ì(€€€€€€€€ô¤(€€€€€€€€€¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½‘¥Øù€(€€€€€è€ˆˆ(ô(€ñ‘¥Ø±…ÍÌô‰É½ÕÁÍ½½Ðˆø(€€€ñ‘¥Ø±…ÍÌô‰É½ÕÁM…Ù•MÑ…Ñ”ˆø‘íÑ•…µÍM…Ù•€ü€¡ÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‹Â~RHQ•…µÌ±½­•ˆ€è€‹Â~RH…ä€ˆ€¬‘…ä€¬€ˆÑ•…µÌ±½­•ˆ¤€èÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰Q•…µÌ¹½Ðå•ÐÍ…Ù•ˆ€è€‰…ä€ˆ€¬‘…ä€¬€ˆÑ•…µÌ¹½Ðå•ÐÍ…Ù•‰ôð½‘¥Øø(€€€‘í±½­•€ü€ˆˆ€èÑ•…µÍM…Ù•€ü€ñ‰ÕÑÑ½¸±…ÍÌô‰Í½™ÐÕ¹±½­É½ÕÁÌˆ¥ô‰Õ¹±½­É½ÕÁÌˆø‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰U¹±½¬Q•…µÌˆ€èU¹±½¬…ä€‘í‘…åôQ•…µÍôð½‰ÕÑÑ½¸ù€€è€ñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…ÉäÍ…Ù•É½ÕÁÌˆ¥ô‰Í…Ù•É½ÕÁÌˆø‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰M…Ù”Q•…µÌˆ€èM…Ù”…ä€‘í‘…åôQ•…µÍôð½‰ÕÑÑ½¸ùô(€ð½‘¥Øø(€‘íÑ•…µÍ¥¹…±¡•­!Ñµ° ¥ô(€‘í±½­•€ü€ˆˆ€è€ñ‘¥Ø±…ÍÌô‰±½­Ù•¹ÑA…¹•°ˆøñ‘¥Øøñˆù¥¹…°•Ù•¹Ð½¹ÑÉ½°ð½ˆøñÍÁ…¸ùM•¹Ñ¡”½¹™¥Éµ•É½ÕÁÌ°Ñ•”Ñ¥µ•Ì°Ñ•”…¹¡…¹‘¥…ÁÌ…ÌÑ¡”™¥¹…°ÕÁ‘…Ñ”¸ð½ÍÁ…¸øð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÌô‰±½­Ù•¹Ñ	Ñ¸ˆ¥ô‰±½­Ù•¹Ðˆ€‘í±½­I•…‘ä€ü€ˆˆ€è€‰‘¥Í…‰±•‰ôù10MPƒŠP%90UAQð½‰ÕÑÑ½¸øð½‘¥Øùõ€ì((€€€€ ‰m‘…Ñ„µÉ½ÕÁ‘…åtˆ¤¹™½É…  (€€€€€€¡ˆ¤€ôø(€€€€€€€€¡ˆ¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹…Ñ¥Ù•É½ÕÁ…ä€ô€­ˆ¹‘…Ñ…Í•Ð¹É½ÕÁ‘…äì(€€€€€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ‰m‘…Ñ„µ•Ù•¹ÑÑ••tˆ¤¹™½É…  (€€€€€€¡‰ÕÑÑ½¸¤€ôø(€€€€€€€€¡‰ÕÑÑ½¸¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€¥˜€¡Ñ••M•±•Ñ¥½¹%Í¥¹…°¡‘…ä¤ñð‘…å!…ÍM½É•¹ÑÉ¥•Ì¡‘…ä¤¤É•ÑÕÉ¸ì(€€€€€€€€€½¹ÍÐm…Ñ•½Éä±Ñ••tõ‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹•Ù•¹ÑÑ•”¹ÍÁ±¥Ð ‰ðˆ¤ì(€€€€€€€€€Í•±•ÑÙ•¹ÑQ•”¡‘…ä°Ñ•”°ÍÑ½É”¹•Ù•¹Ð°…Ñ•½Éä¤ì(€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€¥˜€  ˆ™¥¹…±¥Í•Ù•¹ÑQ•”ˆ¤¤(€€€€€€ ˆ™¥¹…±¥Í•Ù•¹ÑQ•”ˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€€€¥˜€¡‘…å!…ÍM½É•¹ÑÉ¥•Ì¡‘…ä¤¤(€€€€€€€€€É•ÑÕÉ¸…±•ÉÐ ‰Q¡”Ñ•”…¹¹½Ð‰”¡…¹•‰•…ÕÍ”Í½É¥¹œ¡…Ì‰•Õ¸¸ˆ¤ì(€€€€€€€¥˜€ …Í•±•Ñ•‘Q••½µÁ±•Ñ”¤(€€€€€€€€€É•ÑÕÉ¸…±•ÉÐ (€€€€€€€€€€€€‰½µÁ±•Ñ”•Ù•ÉäÍ•±•Ñ•5•¸Ì…¹]½µ•¸ÌÑ•”¡…¹‘¥…À‰•™½É”™¥¹…±¥Í¥¹œ¸ˆ°(€€€€€€€€€€¤ì(€€€€€€€¥˜€ (€€€€€€€€€€…½¹™¥É´ (€€€€€€€€€€€¥¹…±¥Í”Ñ¡”Í•±•Ñ•€‘íÑ••…Ñ•½É¥•Ì¹µ…À¡…Ñ•½Éäôù€‘í…Ñ•½Éäôôô‰Ý½µ•¸ˆü‰]½µ•¸Ìˆè‰5•¸Ì‰ô€‘í•Ù•¹ÑQ••5…É­•É½±½ÕÈ¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¥õ€¤¹©½¥¸ ˆ…¹€ˆ¥ôÑ•”‘íÑ••…Ñ•½É¥•Ì¹±•¹Ñ øÄü‰Ìˆèˆ‰ô™½È€‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰Ñ¡¥Ì•Ù•¹Ðˆ€è…ä€‘í‘…åõôýq¹q¹… Á±…å•ÈÝ¥±°ÕÍ”Ñ¡”¡…¹‘¥…À…¹Í½É•…É™½ÈÑ¡•¥È…Ñ•½Éä¹€°(€€€€€€€€€€¤(€€€€€€€€¤(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Ñ••M•±•Ñ¥½¹¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åt€ôÑÉÕ”ì(€€€€€€€Ñ••…Ñ•½É¥•Ì¹™½É… ¡…Ñ•½ÉäôùÍ•±•ÑÙ•¹ÑQ•”¡‘…ä±Í•±•Ñ•‘Ù•¹ÑQ•”¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¤±ÍÑ½É”¹•Ù•¹Ð±…Ñ•½Éä¤¤ì(€€€€€€€É•½É‘Ù•¹Ñ!…¹‘¥…Á!¥ÍÑ½Éä¡‘…ä¤ì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤(€€€€€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€ôì(€€€¥˜€  ˆÉ•½Á•¹Ù•¹ÑQ•”ˆ¤¤(€€€€€€ ˆÉ•½Á•¹Ù•¹ÑQ•”ˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€€€¥˜€¡‘…å!…ÍM½É•¹ÑÉ¥•Ì¡‘…ä¤¤(€€€€€€€€€É•ÑÕÉ¸…±•ÉÐ ‰Q¡”Ñ•”…¹¹½Ð‰”¡…¹•‰•…ÕÍ”Í½É¥¹œ¡…Ì‰•Õ¸¸ˆ¤ì(€€€€€€€¥˜€ …½¹™¥É´ ‰I•½Á•¸Ñ¡”Á±…å¥¹œÑ•”Í•±•Ñ¥½¸‰•™½É”Í½É¥¹œüA±…å•ÉÌÝ¥±°‰”¡•±…ÐÑ¡”ÍÑ…ÉÐÍÉ••¸Õ¹Ñ¥°å½Ô™¥¹…±¥Í”¥Ð……¥¸¸ˆ¤¤É•ÑÕÉ¸ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Ñ••M•±•Ñ¥½¹¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åt€ô™…±Í”ì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤(€€€€€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€ôì(€€€¥˜€  ˆ…ÁÁ±åMÑ…ÉÑ¥¹!½±”ˆ¤¤(€€€€€€ ˆ…ÁÁ±åMÑ…ÉÑ¥¹!½±”ˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€€€½¹ÍÐ‰±½­•È€ô™¥ÉÍÑ…åM½É•¹ÑÉä¡‘…ä¤ì(€€€€€€€¥˜€¡‰±½­•È¤(€€€€€€€€€É•ÑÕÉ¸…±•ÉÐ (€€€€€€€€€€€Q¡”ÍÑ…ÉÑ¥¹œ¡½±”…¹¹½Ð‰”¡…¹•¸€‘í•Ù•¹ÑA±…å•È¡‰±½­•È¹Í½É•É%°‘…ä¤ü¹¹…µ”ñð€‰Á±…å•È‰ô¡…Ì…¸•¹ÑÉäÉ•½É‘•½¸!½±”€‘í‰±½­•È¹¡½±•ô¹€°(€€€€€€€€€€¤ì(€€€€€€€½¹ÍÐ¹•áÑ!½±”€ô€¬ ˆ±½­•‘MÑ…ÉÑ!½±”ˆ¤¹Ù…±Õ”ì(€€€€€€€¥˜€¡¹•áÑ!½±”€ôôôÍÑ…ÉÑ¥¹!½±”¤É•ÑÕÉ¸ì(€€€€€€€¥˜€ (€€€€€€€€€€…½¹™¥É´ (€€€€€€€€€€€¡…¹”€‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰Ñ¡”•Ù•¹Ðˆ€è…ä€‘í‘…åõôÍÑ…ÉÑ¥¹œ¡½±”™É½´!½±”€‘íÍÑ…ÉÑ¥¹!½±•ôÑ¼!½±”€‘í¹•áÑ!½±•ôýq¹q¹Ù•Éä½¹¹•Ñ•Í½É•…ÉÝ¥±°½Á•¸…Ð!½±”€‘í¹•áÑ!½±•ô¹€°(€€€€€€€€€€¤(€€€€€€€€¤(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÉÑ!½±•Ì€ôÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÉÑ!½±•Ìñðíôì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÉÑ!½±•Ím­•åt€ôm¹•áÑ!½±•tì(€€€€€€€Í•ÑÕÀ¹ÍÑ…ÉÑÌ€ôÍ•ÑÕÀ¹É½ÕÁÌ¹µ…À  ¤€ôø¹•áÑ!½±”¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÉÑ¥¹!½±•UÁ‘…Ñ”€ôì(€€€€€€€€€‘…ä°(€€€€€€€€€™É½´èÍÑ…ÉÑ¥¹!½±”°(€€€€€€€€€¡½±”è¹•áÑ!½±”°(€€€€€€€€€¡…¹•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€€€ôì(€€€€€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ìü¹m­•åt¤(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹¹ÑÁM•±•Ñ¥½¹Ím­•åt€ô¹ÑÁ!½±•Í%¹A±…å¥¹=É‘•È¡‘…ä¤ì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤(€€€€€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€€€É•¹‘•É!½µ” ¤ì(€€€€€ôì(€€€½¹ÍÐÍ…Ù•µ‰É½Í•I½±”€ô…Íå¹Œ€¡É½ÕÁ%¹‘•à°™¥•±°Á±…å•É%¤€ôøì(€€€€€¥˜€¡…µ‰É½Í•Q•…µ!…Í¹ÑÉ¥•Ì¡‘…ä°É½ÕÁ%¹‘•à¤¤(€€€€€€€É•ÑÕÉ¸…±•ÉÐ ‰Q¡•Í”…ÁÁ½¥¹Ñµ•¹ÑÌ…¹¹½Ð‰”¡…¹•‰•…ÕÍ”Ñ¡¥ÌÑ•…´¡…ÌÍÑ…ÉÑ•Í½É¥¹œ¸ˆ¤ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹…µ‰É½Í•I½±•ÍÍ¥¹µ•¹ÑÌñðôíôì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹…µ‰É½Í•I½±•ÍÍ¥¹µ•¹ÑÍm­•åtñðôíôì(€€€€€½¹ÍÐ…ÍÍ¥¹µ•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¹…µ‰É½Í•I½±•ÍÍ¥¹µ•¹ÑÍm­•åumÉ½ÕÁ%¹‘•átñðôíôì(€€€€€…ÍÍ¥¹µ•¹Ñm™¥•±‘t€ôMÑÉ¥¹œ¡Á±…å•É%¤ì(€€€€€½¹ÍÐÑ•…´€ô…µ‰É½Í•Q•…´¡‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€€€É½±•Ì€ô…µ‰É½Í•I½±•Ì¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€€€¥˜€¡™¥•±€ôôô€‰Í½É•É%ˆ€˜˜…ÍÍ¥¹µ•¹Ð¹µ…É­•É%€ôôô…ÍÍ¥¹µ•¹Ð¹Í½É•É%¤(€€€€€€€…ÍÍ¥¹µ•¹Ð¹µ…É­•É%€ôÑ•…´¹™¥¹ ¡¥¤€ôø¥€„ôô…ÍÍ¥¹µ•¹Ð¹Í½É•É%¤ñð€ˆˆì(€€€€€¥˜€¡™¥•±€ôôô€‰µ…É­•É%ˆ€˜˜…ÍÍ¥¹µ•¹Ð¹µ…É­•É%€ôôôÉ½±•Ì¹Í½É•É%¤(€€€€€€€…ÍÍ¥¹µ•¹Ð¹µ…É­•É%€ôÑ•…´¹™¥¹ ¡¥¤€ôø¥€„ôôÉ½±•Ì¹Í½É•É%¤ñð€ˆˆì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤(€€€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€ôì(€€€€ m‘…Ñ„µ…µ‰É½Í•Í½É•Étœ¤¹™½É…  ¡Í•±•Ð¤€ôøÍ•±•Ð¹½¹¡…¹”€ô€ ¤€ôø(€€€€€Í…Ù•µ‰É½Í•I½±” ­Í•±•Ð¹‘…Ñ…Í•Ð¹…µ‰É½Í•Í½É•È°€‰Í½É•É%ˆ°Í•±•Ð¹Ù…±Õ”¤¤ì(€€€€ m‘…Ñ„µ…µ‰É½Í•µ…É­•Étœ¤¹™½É…  ¡Í•±•Ð¤€ôøÍ•±•Ð¹½¹¡…¹”€ô€ ¤€ôø(€€€€€Í…Ù•µ‰É½Í•I½±” ­Í•±•Ð¹‘…Ñ…Í•Ð¹…µ‰É½Í•µ…É­•È°€‰µ…É­•É%ˆ°Í•±•Ð¹Ù…±Õ”¤¤ì(€€€¥˜€  ˆÑ½±•µ‰É½Í•5…É­•Èˆ¤¤(€€€€€€ ˆÑ½±•µ‰É½Í•5…É­•Èˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€€€¥˜€¡•Ù•¹ÑM½É¥¹MÑ…ÉÑ•¤(€€€€€€€€€É•ÑÕÉ¸…±•ÉÐ ‰Q¡”Í½É”µµ…É­•ÈÍ•ÑÑ¥¹œ…¹¹½Ð‰”¡…¹•‰•…ÕÍ”Í½É¥¹œ¡…Ì‰•Õ¸¸ˆ¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹…µ‰É½Í•M½É¥¹5½‘”€ôµ…É­•É%¹±Õ‘•(€€€€€€€€€€ü€‰Í½É•É=¹±äˆ(€€€€€€€€€€è€‰Í½É•É5…É­•Èˆì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤(€€€€€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€ôì(€€€¥˜€¡±½­•¤É•ÑÕÉ¸ì(€€€€ ˆ‰…­Q½Ù•¹ÑM•ÑÕÀˆ¤¹½¹±¥¬€ôÉ•½Á•¹Ù•¹ÑA±…¸ì(€€€¥˜€  ˆÕ¹±½­É½ÕÁÌˆ¤¤(€€€€€€ ˆÕ¹±½­É½ÕÁÌˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€¥˜€ (€€€€€€€€€€…½¹™¥É´ (€€€€€€€€€€€U¹±½¬€‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€‰Ñ¡•Í”Ñ•…µÌˆ€è…ä€‘í‘…åôÑ•…µÍô™½È•‘¥Ñ¥¹œýq¹q¹Q¡•äÝ¥±°ÍÑ…ä¥¸Ñ¡•¥ÈÕÉÉ•¹ÐÁ½Í¥Ñ¥½¹ÌÕ¹Ñ¥°å½Ôµ…­”„¡…¹”¹€°(€€€€€€€€€€¤(€€€€€€€€¤(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€Í•ÑÕÀ¹Í…Ù•€ô™…±Í”ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€€€€€€€Í…Ù” ¤ì(€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€ôì(€€€¥˜€  ˆ±½­±±Ù•¹ÑQ•…µÌˆ¤¤€ ˆ±½­±±Ù•¹ÑQ•…µÌˆ¤¹½¹±¥¬€ô±½­±±Ù•¹ÑQ•…µÌì(€€€¥˜€  ˆµ…á¥µÕµA±…å•É5¥á¥¹œˆ¤¤€ ˆµ…á¥µÕµA±…å•É5¥á¥¹œˆ¤¹½¹±¥¬€ô…ÁÁ±å5…á¥µÕµA±…å•É5¥á¥¹œì(€€€¥˜€  ˆ¡¥ÍÑ½Éå	…±…¹•ˆ¤¤€ ˆ¡¥ÍÑ½Éå	…±…¹•ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ô€‰¡¥ÍÑ½Éäˆì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹µ…¹Õ…±5½‘”€ô™…±Í”ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€€€€€Í•ÑÕÀ¹É½ÕÁÌ€ô¡¥ÍÑ½Éå	…±…¹•‘É½ÕÁÌ¡¥‘Ì°‘…ä¤ì(€€€€€Í•ÑÕÀ¹ÍÑ…ÉÑÌ€ô‘•™…Õ±ÑMÑ…ÉÑÌ¡Í•ÑÕÀ¹É½ÕÁÌ°µ•Ñ¡½°‘…ä¤ì(€€€€€Í•ÑÕÀ¹Í…Ù•€ô™…±Í”ì(€€€€€•¹ÍÕÉ•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡Í•ÑÕÀ°‘…ä¤ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€ôì(€€€¥˜€  ˆÉ…¹‘½µ¥Í•É½ÕÁÌˆ¤¤€ ˆÉ…¹‘½µ¥Í•É½ÕÁÌˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ô€‰É…¹‘½´ˆì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹µ…¹Õ…±5½‘”€ô™…±Í”ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€€€€€Í•ÑÕÀ¹É½ÕÁÌ€ôµ…­•É½ÕÁÌ¡Í¡Õ™™±•½Áä¡¥‘Ì¤°‘…ä¤ì(€€€€€Í•ÑÕÀ¹ÍÑ…ÉÑÌ€ô‘•™…Õ±ÑMÑ…ÉÑÌ¡Í•ÑÕÀ¹É½ÕÁÌ°µ•Ñ¡½°‘…ä¤ì(€€€€€Í•ÑÕÀ¹Í…Ù•€ô™…±Í”ì(€€€€€•¹ÍÕÉ•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡Í•ÑÕÀ°‘…ä¤ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€ôì(€€€¥˜€  ˆµ…¹Õ…±5½‘”ˆ¤¤€ ˆµ…¹Õ…±5½‘”ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ô€‰µ…¹Õ…°ˆì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹µ…¹Õ…±5½‘”€ôÑÉÕ”ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€ôì(€€€€ m‘…Ñ„µÍÝ…ÁÑ•…µtœ¤¹™½É… ¡‰ÕÑÑ½¸€ôø‰ÕÑÑ½¸¹½¹±¥¬€ô€ ¤€ôøì(€€€€€¥˜€¡±½­•ñðÑ•…µÍM…Ù•ñð™¥ÉÍÑ…åM½É•¹ÑÉä¡‘…ä¤¤É•ÑÕÉ¸ì(€€€€€½¹ÍÐ¡½Í•¸€ô€­‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹ÍÝ…ÁÑ•…´ì(€€€€€½¹ÍÐÁ•¹‘¥¹œ€ôÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€€€€€¥˜€ …Á•¹‘¥¹œñðÁ•¹‘¥¹œ¹‘…ä€„ôô‘…ä¤ÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…À€ôí‘…ä°¥¹‘•àè¡½Í•¹ôì(€€€€€•±Í”ì(€€€€€€€ÍÝ…Á]¡½±•Q•…µÌ¡ÍÑ½É”¹•Ù•¹Ð°‘…ä°Á•¹‘¥¹œ¹¥¹‘•à°¡½Í•¸¤ì(€€€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€€€ô(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€ô¤ì(€€€€ ‰m‘…Ñ„µÍÝ…ÁÁ±…å•Étˆ¤¹™½É…  (€€€€€€¡‰Ñ¸¤€ôø(€€€€€€€€¡‰Ñ¸¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹‘É…Ý5½‘”€ô€‰µ…¹Õ…°ˆì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹µ…¹Õ…±5½‘”€ôÑÉÕ”ì(€€€€€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€€€€€€€½¹ÍÐ¥€ôMÑÉ¥¹œ¡‰Ñ¸¹‘…Ñ…Í•Ð¹ÍÝ…ÁÁ±…å•È¤ì(€€€€€€€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È¤ì(€€€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¥ì(€€€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€ô(€€€€€€€€€¥˜€¡MÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È¤€ôôô¥¤ì(€€€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€€€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€ô(€€€€€€€€€½¹ÍÐ™¥ÉÍÐ€ôMÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È¤ì(€€€€€€€€€±•Ð„€ô¹Õ±°°(€€€€€€€€€€€ˆ€ô¹Õ±°ì(€€€€€€€€€™½È€¡±•Ð¤€ô€Àì¤€ðÉ½ÕÁÌ¹±•¹Ñ ì¤¬¬¤(€€€€€€€€€€€™½È€¡±•ÐÁ¤€ô€ÀìÁ¤€ðÉ½ÕÁÍm¥t¹±•¹Ñ ìÁ¤¬¬¤ì(€€€€€€€€€€€€€½¹ÍÐÁ¥€ôMÑÉ¥¹œ¡É½ÕÁÍm¥umÁ¥t¤ì(€€€€€€€€€€€€€¥˜€¡Á¥€ôôô™¥ÉÍÐ¤„€ôì¤°Á¤ôì(€€€€€€€€€€€€€¥˜€¡Á¥€ôôô¥¤ˆ€ôì¤°Á¤ôì(€€€€€€€€€€€ô(€€€€€€€€€¥˜€¡„€˜˜ˆ¤ì(€€€€€€€€€€€½¹ÍÐÑµÀ€ôÉ½ÕÁÍm„¹¥um„¹Á¥tì(€€€€€€€€€€€É½ÕÁÍm„¹¥um„¹Á¥t€ôÉ½ÕÁÍmˆ¹¥umˆ¹Á¥tì(€€€€€€€€€€€É½ÕÁÍmˆ¹¥umˆ¹Á¥t€ôÑµÀì(€€€€€€€€€€€Í•ÑÕÀ¹Í…Ù•€ô™…±Í”ì(€€€€€€€€€€€•¹ÍÕÉ•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡Í•ÑÕÀ°‘…ä¤ì(€€€€€€€€€ô(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ‰m‘…Ñ„µÉ½ÕÁÍÑ…ÉÑtˆ¤¹™½É…  (€€€€€€¡Ì¤€ôø(€€€€€€€€¡Ì¹½¹¡…¹”€ô€ ¤€ôøì(€€€€€€€€€¥˜€¡Ñ•…µÍM…Ù•¤É•ÑÕÉ¸ì(€€€€€€€€€Í•ÑÕÀ¹ÍÑ…ÉÑÍl­Ì¹‘…Ñ…Í•Ð¹É½ÕÁÍÑ…ÉÑt€ô€­Ì¹Ù…±Õ”ì(€€€€€€€€€Í•ÑÕÀ¹Í…Ù•€ô™…±Í”ì(€€€€€€€€€Í…Ù” ¤ì(€€€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ‰m‘…Ñ„µ‘…¥±å¡Átˆ¤¹™½É…  (€€€€€€¡¥¹À¤€ôø(€€€€€€€€¡¥¹À¹½¹¡…¹”€ô€ ¤€ôøì(€€€€€€€€€½¹ÍÐ¥€ôMÑÉ¥¹œ¡¥¹À¹‘…Ñ…Í•Ð¹‘…¥±å¡À¤°(€€€€€€€€€€€ €ô•Ù•¹Ñ…å!…¹‘¥…ÁÌ¡‘…ä¤°(€€€€€€€€€€€Á±ÕÌ€ô€¡m‘…Ñ„µ‘…¥±åÁ±ÕÌôˆ‘í¥‘ô‰u€¤ü¹¡•­•°(€€€€€€€€€€€É…Ü€ô(€€€€€€€€€€€€€¥¹À¹Ù…±Õ”€ôôô€ˆˆ(€€€€€€€€€€€€€€€€ü¹Õ±°(€€€€€€€€€€€€€€€€è5…Ñ ¹µ…à À°5…Ñ ¹µ¥¸ ÔÐ°€­¥¹À¹Ù…±Õ”ñð€À¤¤°(€€€€€€€€€€€Ù…°€ôÉ…Ü€ôô¹Õ±°€ü¹Õ±°€èÁ±ÕÌ€ü€µÉ…Ü€èÉ…Üì(€€€€€€€€€¥˜€¡Ù…°€ôô¹Õ±°¤ì(€€€€€€€€€€€¡m¥‘t€ô€ˆˆì(€€€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€ô(€€€€€€€€€¡m¥‘t€ôÙ…°ì(€€€€€€€€€¥˜€¡‘…ä€ôôô€Ä€˜˜ÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€È€˜˜MÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¹½ÕÉÍ”Ä¤€ôôôMÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¹½ÕÉÍ”È¤¤ì(€€€€€€€€€€€½¹ÍÐÈ€ô•Ù•¹Ñ…å!…¹‘¥…ÁÌ È¤ì(€€€€€€€€€€€¥˜€¡Ém¥‘t€ôôô€ˆˆñðÉm¥‘t€ôô¹Õ±°¤Ém¥‘t€ôÙ…°ì(€€€€€€€€€ô(€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ‰m‘…Ñ„µ‘…¥±åÁ±ÕÍtˆ¤¹™½É…  (€€€€€€¡ˆ¤€ôø(€€€€€€€€¡ˆ¹½¹¡…¹”€ô€ ¤€ôøì(€€€€€€€€€½¹ÍÐ¥¹À€ô€¡m‘…Ñ„µ‘…¥±å¡Àôˆ‘íˆ¹‘…Ñ…Í•Ð¹‘…¥±åÁ±ÕÍô‰u€¤ì(€€€€€€€€€¥˜€¡¥¹À¤¥¹À¹½¹¡…¹” ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€¥˜€  ˆÍ…Ù•É½ÕÁÌˆ¤¤€ ˆÍ…Ù•É½ÕÁÌˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹Ñ•…µ=É‘•ÉMÝ…Àì(€€€€€Í•ÑÕÀ¹Í…Ù•€ôÑÉÕ”ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÝ…ÁA±…å•È€ô¹Õ±°ì(€€€€€•¹ÍÕÉ•M¡½ÉÑQ•…µM•±•Ñ¥½¹Ì¡Í•ÑÕÀ°‘…ä¤ì(€€€€€Í…Ù” ¤ì(€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€ôì(€€€€ ˆ±½­Ù•¹Ðˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€¥˜€ …±½­I•…‘ä¤É•ÑÕÉ¸ì(€€€€€¥˜€¡…Ý…¥Ñ¥¹%‘Ì¹±•¹Ñ ¤ì(€€€€€€€…±•ÉÐ (€€€€€€€€€Q¡”•Ù•¹Ð…¹¹½Ð‰”±½­•å•Ð¸€‘í…Ý…¥Ñ¥¹%‘Ì¹±•¹Ñ¡ôÁ±…å•È‘í…Ý…¥Ñ¥¹%‘Ì¹±•¹Ñ €ôôô€Ä€ü€ˆ¥Ìˆ€è€‰Ì…É”‰ôÍÑ¥±°…Ý…¥Ñ¥¹œ„É•Á±ä¸I•ÑÕÉ¸Ñ¼Ù•¹ÐM•ÑÕÀ…¹µ…É¬•… ½¹™¥Éµ•Á±…å•ÈÉ••¸¹€°(€€€€€€€€¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€¥˜€ (€€€€€€€½¹™¥É´ (€€€€€€€€€€‰1½¬…¹Í•¹Ñ¡”™¥¹…°•Ù•¹ÐÍ•ÑÕÀýq¹q¹9½Éµ…°Á±…¹¹¥¹œ‘•Ñ…¥±Ì…¹¹½Ð‰”¡…¹•…™Ñ•ÈÑ¡¥Ì¹q¹	•™½É”Í½É¥¹œÍÑ…ÉÑÌ°å½Ô…¸ÍÑ¥±°µ½‘¥™ä¡…¹‘¥…ÁÌ°¡…¹”Ñ¡”Í•±•Ñ•Ñ••Ì…¹…‘…¸•µ•É•¹äÉ•Á±…•µ•¹Ð¥˜Í½µ•½¹”‘½•Ì¹½ÐÑÕÉ¸ÕÀ¹q¹™Ñ•ÈÍ½É¥¹œÍÑ…ÉÑÌ°µ•É•¹äM½É”I•½Ù•ÉäÉ•µ…¥¹Ì…Ù…¥±…‰±”¥˜„Á±…å•ÈÌÁ¡½¹”™…¥±Ì‘ÕÉ¥¹œÁ±…ä¸ˆ°(€€€€€€€€¤(€€€€€€¤ì(€€€€€€€•¹ÍÕÉ•Ù•¹ÑQ••A±…¹¹¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¤ì(€€€€€€€•Ù•¹Ñ…åÌ¡ÍÑ½É”¹•Ù•¹Ð¤¹™½É… ¡•Ù•¹Ñ…ä€ôøl‰µ•¸ˆ°€‰Ý½µ•¸‰t¹™½É… ¡…Ñ•½Éä€ôø(€€€€€€€€€…ÁÑÕÉ•Ù•¹ÑQ••9…µ•Ì¡ÍÑ½É”¹•Ù•¹Ð°•Ù•¹Ñ…ä°…Ñ•½Éä°…ÕÑ¡½É¥Ñ…Ñ¥Ù•5…ÍÑ•É½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬•Ù•¹Ñ…åt¤°ÑÉÕ”¤°(€€€€€€€€¤¤ì(€€€€€€€É•™É•Í¡Ù•¹Ñ½ÕÉÍ•M¹…ÁÍ¡½Ð¡ÍÑ½É”¹•Ù•¹Ð¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±½­•€ôÑÉÕ”ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÑÕÌ€ô€‰±½­•ˆì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Í•ÑÕÁMÑ…”€ô€‰™¥¹…°ˆì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±½­•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹™¥¹…±UÁ‘…Ñ•Ð€ôÍÑ½É”¹•Ù•¹Ð¹±½­•‘Ðì(€€€€€€€™½È€¡±•Ð•Ù•¹Ñ…ä€ô€Äì•Ù•¹Ñ…ä€ðôÍÑ½É”¹•Ù•¹Ð¹‘…åÌì•Ù•¹Ñ…ä¬¬¤ì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Ñ••M•±•Ñ¥½¹¥¹…±¥Í•‘l‰‘…äˆ€¬•Ù•¹Ñ…åt€ôÑÉÕ”ì(€€€€€€€€€É•½É‘Ù•¹Ñ!…¹‘¥…Á!¥ÍÑ½Éä¡•Ù•¹Ñ…ä¤ì(€€€€€€€ô(€€€€€€€Í…Ù” ¤ì(€€€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õ¹•Ù•¹Ñ%¤…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€€€É•¹‘•ÉQ•…µÍA…” ¤ì(€€€€€ô(€€€ôì(€€€¥˜€ ¡ÍÑ½É”¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹Ìñðmt¤¹¥¹±Õ‘•Ì ‰…ÁQ•…µÌˆ¤¤‰¥¹‘…ÁQ•…µÌ¡ÍÑ½É”¹•Ù•¹Ð°…ÁI½ÍÑ•È ¤°É•¹‘•ÉQ•…µÍA…”¤ì(€ô((€™Õ¹Ñ¥½¸™½Éµ…ÑÙ•¹Ñ…Ñ”¡¥Í¼°‘…ä€ô€Ä¤ì(€€€¥˜€ …¥Í¼¤É•ÑÕÉ¸€ˆˆì(€€€±•Ð€ô¹•Ü…Ñ” ¡¥Í¼€ôôôÍÑ½É”¹•Ù•¹Ðü¹‘…Ñ”€ü•Ù•¹Ñ…Ñ”¡‘…ä¤€è¥Í¼¤€¬€‰PÄÈèÀÀèÀÀˆ¤ì(€€€¥˜€¡¥Í¼€„ôôÍÑ½É”¹•Ù•¹Ðü¹‘…Ñ”¤¹Í•Ñ…Ñ”¡¹•Ñ…Ñ” ¤€¬‘…ä€´€Ä¤ì(€€€É•ÑÕÉ¸¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ ‰•¸µTˆ°ì(€€€€€Ý••­‘…äè€‰±½¹œˆ°(€€€€€‘…äè€‰¹Õµ•É¥Œˆ°(€€€€€µ½¹Ñ è€‰±½¹œˆ°(€€€€€å•…Èè€‰¹Õµ•É¥Œˆ°(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸¡½µ•Ù•¹Ñ…Ñ”¡•Ù•¹Ð¤ì(€€€¥˜€ …•Ù•¹Ðü¹‘…Ñ”¤É•ÑÕÉ¸€‰9½ÐÍ•Ðˆì(€€€½¹ÍÐÍÑ…ÉÐ€ô¹•Ü…Ñ”¡•Ù•¹Ð¹‘…Ñ”€¬€‰PÄÈèÀÀèÀÀˆ¤°(€€€€€‘…åÌ€ô5…Ñ ¹µ…à Ä°€­•Ù•¹Ð¹‘…åÌñð€Ä¤°(€€€€€Í¡½ÉÑA…ÉÐ€ô€¡‘…Ñ”¤€ôø(€€€€€€€‘…Ñ”¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ ‰•¸µTˆ°ì(€€€€€€€€€Ý••­‘…äè€‰Í¡½ÉÐˆ°(€€€€€€€€€‘…äè€‰¹Õµ•É¥Œˆ°(€€€€€€€ô¤ì(€€€¥˜€¡‘…åÌ€ôôô€Ä¤(€€€€€É•ÑÕÉ¸ÍÑ…ÉÐ¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ ‰•¸µTˆ°ì(€€€€€€€Ý••­‘…äè€‰Í¡½ÉÐˆ°(€€€€€€€‘…äè€‰¹Õµ•É¥Œˆ°(€€€€€€€µ½¹Ñ è€‰Í¡½ÉÐˆ°(€€€€€€€å•…Èè€‰¹Õµ•É¥Œˆ°(€€€€€ô¤ì(€€€½¹ÍÐ•¹€ô¹•Ü…Ñ”¡•Ù•¹Ñ…Ñ”¡‘…åÌ°•Ù•¹Ð¤€¬€‰PÄÈèÀÀèÀÀˆ¤ì(€€€É•ÑÕÉ¸€‘íÍ¡½ÉÑA…ÉÐ¡ÍÑ…ÉÐ¥ôƒŠL€‘í•¹¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ ‰•¸µTˆ°ì(€€€€€Ý••­‘…äè€‰Í¡½ÉÐˆ°(€€€€€‘…äè€‰¹Õµ•É¥Œˆ°(€€€€€µ½¹Ñ è€‰Í¡½ÉÐˆ°(€€€€€å•…Èè€‰¹Õµ•É¥Œˆ°(€€€ô¥õ€ì(€ô(€™Õ¹Ñ¥½¸Á±…å•ÉÉ½ÕÁ½¹Ñ•áÐ¡Á¥°‘…ä¤ì(€€€½¹ÍÐÍ•ÑÕÀ€ôÍÑ½É”¹•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬‘…åtì(€€€¥˜€ …Í•ÑÕÀ¤É•ÑÕÉ¸¹Õ±°ì(€€€™½È€¡±•Ð¤€ô€Àì¤€ðÍ•ÑÕÀ¹É½ÕÁÌ¹±•¹Ñ ì¤¬¬¤ì(€€€€€½¹ÍÐœ€ôÍ•ÑÕÀ¹É½ÕÁÍm¥t¹µ…À¡MÑÉ¥¹œ¤°(€€€€€€€Á¤€ôœ¹¥¹‘•á=˜¡MÑÉ¥¹œ¡Á¥¤¤ì(€€€€€¥˜€¡Á¤€øô€À¤É•ÑÕÉ¸ìÍ•ÑÕÀéÍ•ÑÕÁ½ÉQ•…´¡Í•ÑÕÀ±¤¤°É½ÕÀèœ°É½ÕÁ%¹‘•àè¤°Á±…å•É%¹‘•àèÁ¤ôì(€€€ô(€€€É•ÑÕÉ¸¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸…µ‰É½Í•%Í=¸¡•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð°‘…ä€ô•Ù•¹Ðü¹…Ñ¥Ù•É½ÕÁ…äñð€Ä¤ì(€€€É•ÑÕÉ¸½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰…µ‰É½Í”ˆ°‘…ä°•Ù•¹Ð¤ì(€ô(€™Õ¹Ñ¥½¸…µ‰É½Í•Q•…´¡‘…ä°É½ÕÁ%¹‘•à°•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¤ì(€€€É•ÑÕÉ¸€¡•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬‘…åtü¹É½ÕÁÌü¹mÉ½ÕÁ%¹‘•átñðmt¤(€€€€€€¹µ…À¡MÑÉ¥¹œ¤(€€€€€€¹™¥±Ñ•È ¡¥¤€ôø¥€˜˜¥€„ôô9=}AIQ9I}%¤ì(€ô(€™Õ¹Ñ¥½¸…µ‰É½Í•I½±•Ì¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€½¹ÍÐÑ•…´€ô…µ‰É½Í•Q•…´¡‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€…ÍÍ¥¹•€ôÍÑ½É”¹•Ù•¹Ðü¹…µ‰É½Í•I½±•ÍÍ¥¹µ•¹ÑÌü¹l‰‘…äˆ€¬‘…åtü¹mÉ½ÕÁ%¹‘•átñðíô°(€€€€€…ÍÍ¥¹•‘M½É•È€ôMÑÉ¥¹œ¡…ÍÍ¥¹•¹Í½É•É%ñð€ˆˆ¤°(€€€€€Í½É•É%€ôÑ•…´¹¥¹±Õ‘•Ì¡…ÍÍ¥¹•‘M½É•È¤€ü…ÍÍ¥¹•‘M½É•È€èÑ•…µlÁtñð€ˆˆ°(€€€€€…ÍÍ¥¹•‘5…É­•È€ôMÑÉ¥¹œ¡…ÍÍ¥¹•¹µ…É­•É%ñð€ˆˆ¤°(€€€€€‘•™…Õ±Ñ5…É­•È€ôÑ•…´¹™¥¹ ¡¥¤€ôø¥€„ôôÍ½É•É%¤ñð€ˆˆì(€€€É•ÑÕÉ¸ì(€€€€€Í½É•É%°(€€€€€µ…É­•É%è(€€€€€€€ÍÑ½É”¹•Ù•¹Ðü¹…µ‰É½Í•M½É¥¹5½‘”€ôôô€‰Í½É•É=¹±äˆ(€€€€€€€€€€ü€ˆˆ(€€€€€€€€€€èÑ•…´¹¥¹±Õ‘•Ì¡…ÍÍ¥¹•‘5…É­•È¤€˜˜…ÍÍ¥¹•‘5…É­•È€„ôôÍ½É•É%(€€€€€€€€€€€€ü…ÍÍ¥¹•‘5…É­•È(€€€€€€€€€€€€è‘•™…Õ±Ñ5…É­•È°(€€€€€Ñ•…´°(€€€ôì(€ô(€™Õ¹Ñ¥½¸…µ‰É½Í•Q•…µ!…Í¹ÑÉ¥•Ì¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€É•ÑÕÉ¸…µ‰É½Í•Q•…´¡‘…ä°É½ÕÁ%¹‘•à¤¹Í½µ” ¡Á±…å•É%¤€ôø(€€€€€ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôø¥¹‘•à€¬€Ä¤¹Í½µ” ¡¡½±”¤€ôøì(€€€€€€€½¹ÍÐÉ•½É€ôÍ½É•ÉMÑ½É”¡‘…ä°Á±…å•É%¤ü¹mMÑÉ¥¹œ¡¡½±”¥tì(€€€€€€€É•ÑÕÉ¸Í½É•¹Ñ•É•¡É•½Éü¹Í•±˜ü¹É½ÍÌ¤ñð	½½±•…¸¡É•½Éü¹…µ‰É½Í”ü¹‘É¥Ù•A±…å•É%¤ì(€€€€€ô¤°(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸…µ‰É½Í•¹ÑÉä¡‘…ä°Í½É•É%°¡½±”¤ì(€€€½¹ÍÐÉ•Œ€ôÍ½É•I•½É¡‘…ä°Í½É•É%°¡½±”¤ì(€€€É•Œ¹…µ‰É½Í”€ôÉ•Œ¹…µ‰É½Í”ñðì‘É¥Ù•A±…å•É%è€ˆˆôì(€€€É•ÑÕÉ¸É•Œì(€ô(€™Õ¹Ñ¥½¸…µ‰É½Í•Q•…µ!…¹‘¥…À¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€½¹ÍÐÑ•…´€ô…µ‰É½Í•Q•…´¡‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€Ù…±Õ•Ì€ôÑ•…´¹µ…À ¡¥¤€ôøÁ±…å•É…¥±å!…¹‘¥…À¡¥°‘…ä¤¤ì(€€€¥˜€ …Ñ•…´¹±•¹Ñ ñðÙ…±Õ•Ì¹Í½µ” ¡Ù…±Õ”¤€ôøÙ…±Õ”€ôô¹Õ±°¤¤É•ÑÕÉ¸¹Õ±°ì(€€€É•ÑÕÉ¸Ù…±Õ•Ì¹É•‘Õ” ¡ÍÕ´°Ù…±Õ”¤€ôøÍÕ´€¬€­Ù…±Õ”°€À¤€¼€¡Ñ•…´¹±•¹Ñ €¨€È¤ì(€ô(€™Õ¹Ñ¥½¸…µ‰É½Í•!½±•É••µ•¹Ð¡‘…ä°É½ÕÁ%¹‘•à°¡½±”¤ì(€€€½¹ÍÐÉ½±•Ì€ô…µ‰É½Í•I½±•Ì¡‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€Í½É•È€ô…µ‰É½Í•¹ÑÉä¡‘…ä°É½±•Ì¹Í½É•É%°¡½±”¤°(€€€€€µ…É­•È€ôÉ½±•Ì¹µ…É­•É%(€€€€€€€€ü…µ‰É½Í•¹ÑÉä¡‘…ä°É½±•Ì¹µ…É­•É%°¡½±”¤(€€€€€€€€è¹Õ±°°(€€€€€Í½É•É½¹”€ô(€€€€€€€Í½É•¹Ñ•É•¡Í½É•È¹Í•±˜ü¹É½ÍÌ¤€˜˜(€€€€€€€	½½±•…¸¡Í½É•È¹…µ‰É½Í”ü¹‘É¥Ù•A±…å•É%¤°(€€€€€µ…É­•É½¹”€ô(€€€€€€€€…µ…É­•Èñð(€€€€€€€€¡Í½É•¹Ñ•É•¡µ…É­•È¹Í•±˜ü¹É½ÍÌ¤€˜˜(€€€€€€€€€	½½±•…¸¡µ…É­•È¹…µ‰É½Í”ü¹‘É¥Ù•A±…å•É%¤¤ì(€€€É•ÑÕÉ¸ì(€€€€€Í½É•È°(€€€€€µ…É­•È°(€€€€€Í½É•É½¹”°(€€€€€µ…É­•É½¹”°(€€€€€½µÁ±•Ñ”è	½½±•…¸ (€€€€€€€Í½É•É½¹”€˜˜(€€€€€€€€€µ…É­•É½¹”€˜˜(€€€€€€€€€€ …µ…É­•Èñð(€€€€€€€€€€€€ ­Í½É•È¹Í•±˜¹É½ÍÌ€ôôô€­µ…É­•È¹Í•±˜¹É½ÍÌ€˜˜(€€€€€€€€€€€€€MÑÉ¥¹œ¡Í½É•È¹…µ‰É½Í”¹‘É¥Ù•A±…å•É%¤€ôôô(€€€€€€€€€€€€€€€MÑÉ¥¹œ¡µ…É­•È¹…µ‰É½Í”¹‘É¥Ù•A±…å•É%¤¤¤°(€€€€€€¤°(€€€€€µ¥Íµ…Ñ è	½½±•…¸ (€€€€€€€µ…É­•È€˜˜(€€€€€€€€€Í½É•É½¹”€˜˜(€€€€€€€€€µ…É­•É½¹”€˜˜(€€€€€€€€€€ ­Í½É•È¹Í•±˜¹É½ÍÌ€„ôô€­µ…É­•È¹Í•±˜¹É½ÍÌñð(€€€€€€€€€€€MÑÉ¥¹œ¡Í½É•È¹…µ‰É½Í”¹‘É¥Ù•A±…å•É%¤€„ôô(€€€€€€€€€€€€€MÑÉ¥¹œ¡µ…É­•È¹…µ‰É½Í”¹‘É¥Ù•A±…å•É%¤¤°(€€€€€€¤°(€€€ôì(€ô(€™Õ¹Ñ¥½¸…µ‰É½Í•Q•…µ½µÁ±•Ñ”¡‘…ä°É½ÕÁ%¹‘•à¤ì(€€€É•ÑÕÉ¸ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôø¥¹‘•à€¬€Ä¤¹•Ù•Éä (€€€€€€¡¡½±”¤€ôø…µ‰É½Í•!½±•É••µ•¹Ð¡‘…ä°É½ÕÁ%¹‘•à°¡½±”¤¹½µÁ±•Ñ”°(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸…µ‰É½Í•É¥Ù•½Õ¹ÑÌ¡‘…ä°É½ÕÁ%¹‘•à°Í½É•É%¤ì(€€€½¹ÍÐ½Õ¹ÑÌ€ô=‰©•Ð¹™É½µ¹ÑÉ¥•Ì (€€€€€…µ‰É½Í•Q•…´¡‘…ä°É½ÕÁ%¹‘•à¤¹µ…À ¡¥¤€ôøm¥°€Át¤°(€€€€¤ì(€€€™½È€¡±•Ð¡½±”€ô€Äì¡½±”€ðô€Äàì¡½±”¬¬¤ì(€€€€€½¹ÍÐ¥€ôÍ½É•ÉMÑ½É”¡‘…ä°Í½É•É%¤ü¹mMÑÉ¥¹œ¡¡½±”¥tü¹…µ‰É½Í”(€€€€€€€€ü¹‘É¥Ù•A±…å•É%ì(€€€€€¥˜€¡¥€˜˜½Õ¹ÑÍm¥‘t€„ô¹Õ±°¤½Õ¹ÑÍm¥‘t¬¬ì(€€€ô(€€€É•ÑÕÉ¸½Õ¹ÑÌì(€ô(€™Õ¹Ñ¥½¸å•±±½Ý	…±±%Í=¸¡‘…ä°•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¤ì(€€€¥˜€ „¡•Ù•¹Ðü¹½µÁ•Ñ¥Ñ¥½¹Ìñðmt¤¹¥¹±Õ‘•Ì ‰å•±±½Ý	…±°ˆ¤¤É•ÑÕÉ¸™…±Í”ì(€€€¥˜€ ¡•Ù•¹Ð¹‘…åÌñð€Ä¤€ôôô€Ä¤É•ÑÕÉ¸€­‘…ä€ôôô€Äì(€€€É•ÑÕÉ¸½µÁ•Ñ¥Ñ¥½¹…åÌ ‰å•±±½Ý	…±°ˆ°•Ù•¹Ð¤¹¥¹±Õ‘•Ì ­‘…ä¤ì(€ô(€™Õ¹Ñ¥½¸å•±±½Ý	…±±Q•…´¡‘…ä°É½ÕÁ%¹‘•à°•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¤ì(€€€½¹ÍÐÍ•ÑÕÀ€ô•Ù•¹Ðü¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬‘…åt°(€€€€€É½ÕÀ€ôÍ•ÑÕÀü¹É½ÕÁÌü¹mÉ½ÕÁ%¹‘•átñðmtì(€€€É•ÑÕÉ¸É½ÕÀ(€€€€€€¹µ…À¡MÑÉ¥¹œ¤(€€€€€€¹™¥±Ñ•È ¡¥¤€ôø¥€˜˜¥€„ôô9=}AIQ9I}%¤ì(€ô(€™Õ¹Ñ¥½¸å•±±½Ý	…±±A±…å•É½É!½±”¡‘…ä°É½ÕÁ%¹‘•à°¡½±”°•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¤ì(€€€½¹ÍÐÑ•…´€ôå•±±½Ý	…±±Q•…´¡‘…ä°É½ÕÁ%¹‘•à°•Ù•¹Ð¤ì(€€€¥˜€ …Ñ•…´¹±•¹Ñ ¤É•ÑÕÉ¸€ˆˆì(€€€½¹ÍÐÍÑ…ÉÐ€ôÉ½ÕÁMÑ…ÉÑ¥¹!½±”¡•Ù•¹Ð°‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€Á½Í¥Ñ¥½¸€ôÍ½É•M•ÅÕ•¹”¡ÍÑ…ÉÐ¤¹¥¹‘•á=˜ ­¡½±”¤ì(€€€É•ÑÕÉ¸Á½Í¥Ñ¥½¸€ð€À€ü€ˆˆ€èÑ•…µmÁ½Í¥Ñ¥½¸€”Ñ•…´¹±•¹Ñ¡tì(€ô(€™Õ¹Ñ¥½¸å•±±½Ý	…±±1½ÍÌ¡‘…ä°É½ÕÁ%¹‘•à°•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¤ì(€€€½¹ÍÐÁ…Á•È€ô•Ù•¹Ðü¹µ…¹Õ…±M½É•…É‘Ìü¹l‘…äœ€¬‘…åtü¹É½ÕÁÌü¹mMÑÉ¥¹œ¡É½ÕÁ%¹‘•à¥tì(€€€¥˜€¡Á…Á•Èü¹ÍÑ…ÑÕÌ€ôôô€‰ÍÕ‰µ¥ÑÑ•ˆ€˜˜Á…Á•È¹Ñ•…´ü¹å•±±½Ý	…±°ü¹±½ÍÍ!½±”¤ì(€€€€€½¹ÍÐÉ•ÍÕ±Ð€ôÁ…Á•È¹Ñ•…´¹å•±±½Ý	…±°ì(€€€€€¥˜€¡É•ÍÕ±Ð¹±½ÍÍ!½±”€ôôô€‰9=9ˆ¤É•ÑÕÉ¸¹Õ±°ì(€€€€€½¹ÍÐ¡½±”€ô€­É•ÍÕ±Ð¹±½ÍÍ!½±”°Á½Í¥Ñ¥½¸€ôÍ½É•M•ÅÕ•¹”¡É½ÕÁMÑ…ÉÑ¥¹!½±”¡•Ù•¹Ð°‘…ä°É½ÕÁ%¹‘•à¤¤¹¥¹‘•á=˜¡¡½±”¤ì(€€€€€É•ÑÕÉ¸Á½Í¥Ñ¥½¸€ð€À€ü¹Õ±°€èí¡½±”°Á½Í¥Ñ¥½¸°Á±…å•É%èå•±±½Ý	…±±A±…å•É½É!½±”¡‘…ä°É½ÕÁ%¹‘•à°¡½±”°•Ù•¹Ð¤°Í½ÕÉ”è€‰Á…Á•ÈµÑ•…´µ…É‰ôì(€€€ô(€€€½¹ÍÐÑ•…´€ôå•±±½Ý	…±±Q•…´¡‘…ä°É½ÕÁ%¹‘•à°•Ù•¹Ð¤°(€€€€€ÍÑ…ÉÐ€ôÉ½ÕÁMÑ…ÉÑ¥¹!½±”¡•Ù•¹Ð°‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€Í•ÅÕ•¹”€ôÍ½É•M•ÅÕ•¹”¡ÍÑ…ÉÐ¤°(€€€€€É½Õ¹‘Ì€ô•Ù•¹Ðü¹Í½É¥¹œü¹l‰‘…äˆ€¬‘…åtñðíôì(€€€±•Ð±½ÍÌ€ô¹Õ±°ì(€€€™½È€¡½¹ÍÐmÍ½É•É%°É½Õ¹‘t½˜=‰©•Ð¹•¹ÑÉ¥•Ì¡É½Õ¹‘Ì¤¤ì(€€€€€¥˜€ …Ñ•…´¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡Í½É•É%¤¤¤½¹Ñ¥¹Õ”ì(€€€€€™½È€¡½¹ÍÐm¡½±•Q•áÐ°É•½É‘t½˜=‰©•Ð¹•¹ÑÉ¥•Ì¡É½Õ¹ñðíô¤¤ì(€€€€€€€½¹ÍÐ¡½±”€ô€­¡½±•Q•áÐ°(€€€€€€€€€Á½Í¥Ñ¥½¸€ôÍ•ÅÕ•¹”¹¥¹‘•á=˜¡¡½±”¤ì(€€€€€€€¥˜€ (€€€€€€€€€Á½Í¥Ñ¥½¸€ð€Àñð(€€€€€€€€€€…É•½Éü¹å•±±½Ý	…±°ü¹±½ÍÐñð(€€€€€€€€€MÑÉ¥¹œ¡É•½É¹å•±±½Ý	…±°¹Á±…å•É%ñð€ˆˆ¤€„ôô(€€€€€€€€€€€å•±±½Ý	…±±A±…å•É½É!½±”¡‘…ä°É½ÕÁ%¹‘•à°¡½±”°•Ù•¹Ð¤(€€€€€€€€¤(€€€€€€€€€½¹Ñ¥¹Õ”ì(€€€€€€€¥˜€ …±½ÍÌñðÁ½Í¥Ñ¥½¸€ð±½ÍÌ¹Á½Í¥Ñ¥½¸¤(€€€€€€€€€±½ÍÌ€ôì(€€€€€€€€€€€¡½±”°(€€€€€€€€€€€Á½Í¥Ñ¥½¸°(€€€€€€€€€€€Á±…å•É%èMÑÉ¥¹œ¡É•½É¹å•±±½Ý	…±°¹Á±…å•É%¤°(€€€€€€€€€€€Í½É•É%èMÑÉ¥¹œ¡Í½É•É%¤°(€€€€€€€€€ôì(€€€€€ô(€€€ô(€€€É•ÑÕÉ¸±½ÍÌì(€ô(€™Õ¹Ñ¥½¸å•±±½Ý	…±±!½±•MÑ…Ñ”¡‘…ä°É½ÕÁ%¹‘•à°¡½±”°É•½É°•Ù•¹Ð€ôÍÑ½É”¹•Ù•¹Ð¤ì(€€€½¹ÍÐÁ±…å•É%€ôå•±±½Ý	…±±%Í=¸¡‘…ä°•Ù•¹Ð¤€üå•±±½Ý	…±±A±…å•É½É!½±”¡‘…ä°É½ÕÁ%¹‘•à°¡½±”°•Ù•¹Ð¤€è€ˆˆì(€€€½¹ÍÐÁ½Í¥Ñ¥½¸€ôÍ½É•M•ÅÕ•¹”¡É½ÕÁMÑ…ÉÑ¥¹!½±”¡•Ù•¹Ð°‘…ä°É½ÕÁ%¹‘•à¤¤¹¥¹‘•á=˜ ­¡½±”¤ì(€€€½¹ÍÐ±½ÍÌ€ôÁ±…å•É%€üå•±±½Ý	…±±1½ÍÌ¡‘…ä°É½ÕÁ%¹‘•à°•Ù•¹Ð¤€è¹Õ±°ì(€€€É•ÑÕÉ¸ì(€€€€€Á±…å•É%°(€€€€€…Ñ¥Ù”è	½½±•…¸¡Á±…å•É%€˜˜Á½Í¥Ñ¥½¸€øô€À€˜˜€ …±½ÍÌñðÁ½Í¥Ñ¥½¸€ð±½ÍÌ¹Á½Í¥Ñ¥½¸¤¤°(€€€€€…¹I•½Éè	½½±•…¸¡Á±…å•É%€˜˜Á½Í¥Ñ¥½¸€øô€À€˜˜€ …±½ÍÌñðÁ½Í¥Ñ¥½¸€ðô±½ÍÌ¹Á½Í¥Ñ¥½¸¤¤°(€€€€€±½ÍÑ!•É”è	½½±•…¸¡É•½Éü¹å•±±½Ý	…±°ü¹±½ÍÐ€˜˜MÑÉ¥¹œ¡É•½É¹å•±±½Ý	…±°¹Á±…å•É%ñð€ˆˆ¤€ôôôMÑÉ¥¹œ¡Á±…å•É%¤¤°(€€€ôì(€ô(€™Õ¹Ñ¥½¸™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Á±…å•É%°¡½±”¤ì(€€€½¹ÍÐ½ÉÉ•Ñ¥½¸€ô½É…¹¥Í•É½ÉÉ•Ñ¥½¹½È¡‘…ä°Á±…å•É%°¡½±”¤ì(€€€¥˜€¡½ÉÉ•Ñ¥½¸¤É•ÑÕÉ¸ì€¸¸¹½ÉÉ•Ñ¥½¸°…ÕÑ¡½É¥Ñ…Ñ¥Ù”èÑÉÕ”ôì(€€€½¹ÍÐ€ôÍ½É¥¹…åMÑ½É”¡‘…ä¤°(€€€€€Á¥€ôMÑÉ¥¹œ¡Á±…å•É%¤ì(€€€™½È€¡½¹ÍÐmÍ½É•É%°¡½±•Ít½˜=‰©•Ð¹•¹ÑÉ¥•Ì¡¤¤ì(€€€€€½¹ÍÐÈ€ô¡½±•Ìü¹mMÑÉ¥¹œ¡¡½±”¥tì(€€€€€¥˜€ (€€€€€€€MÑÉ¥¹œ¡Èü¹½™™¥¥…°ü¹Á±…å•É%ñð€ˆˆ¤€ôôôÁ¥€˜˜(€€€€€€€È¹½™™¥¥…°¹É½ÍÌ€„ôô€ˆˆ€˜˜(€€€€€€€È¹½™™¥¥…°¹É½ÍÌ€„ô¹Õ±°(€€€€€€¤(€€€€€€€É•ÑÕÉ¸ì€¸¸¹È¹½™™¥¥…°°Í½É•É%ôì(€€€ô(€€€É•ÑÕÉ¸¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸Á±…å•É!½±•¹ÑÉä¡‘…ä°Á±…å•É%°¡½±”¤ì(€€€½¹ÍÐ½Ý¸€ôÍ½É¥¹…åMÑ½É”¡‘…ä¤ü¹mMÑÉ¥¹œ¡Á±…å•É%¥tü¹mMÑÉ¥¹œ¡¡½±”¥tü¹Í•±˜ì(€€€¥˜€ (€€€€€½Ý¸€˜˜(€€€€€€ ¡½Ý¸¹É½ÍÌ€„ôô€ˆˆ€˜˜½Ý¸¹É½ÍÌ€„ô¹Õ±°¤ñð(€€€€€€€€¡½Ý¸¹ÁÕÑÑÌ€„ôô€ˆˆ€˜˜½Ý¸¹ÁÕÑÑÌ€„ô¹Õ±°¤¤(€€€€¤(€€€€€É•ÑÕÉ¸½Ý¸ì(€€€É•ÑÕÉ¸™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Á±…å•É%°¡½±”¤ì(€ô(€™Õ¹Ñ¥½¸Á±…å•ÉMÕÉ¹…µ”¡¥¤ì(€€€½¹ÍÐ¸€ôMÑÉ¥¹œ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¤(€€€€€€¹ÑÉ¥´ ¤(€€€€€€¹ÍÁ±¥Ð ½qÌ¬¼¤ì(€€€É•ÑÕÉ¸¹m¸¹±•¹Ñ €´€Åtñð€‰A±…å•Èˆì(€ô(€™Õ¹Ñ¥½¸Á±…å•É¥ÉÍÑ9…µ”¡¥¤ì(€€€É•ÑÕÉ¸€ (€€€€€MÑÉ¥¹œ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¤(€€€€€€€€¹ÑÉ¥´ ¤(€€€€€€€€¹ÍÁ±¥Ð ½qÌ¬¼¥lÁtñð€‰A±…å•Èˆ(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸Ý•±½µ•-•ä¡Á±…å•É%¤ì(€€€É•ÑÕÉ¸…Ý…å½±™]•±½µ•XÄè‘íÍÑ½É”¹±½Õü¹•Ù•¹Ñ%ñðÍÑ½É”¹•Ù•¹Ðü¹¹…µ”ñð€‰•Ù•¹Ð‰ôè‘íÁ±…å•É%‘õ€ì(€ô(€™Õ¹Ñ¥½¸Á±…å•É!…ÍM••¹]•±½µ”¡Á±…å•É%¤ì(€€€É•ÑÕÉ¸±½…±MÑ½É…”¹•Ñ%Ñ•´¡Ý•±½µ•-•ä¡Á±…å•É%¤¤€ôôô€‰å•Ìˆì(€ô(€™Õ¹Ñ¥½¸É•µ•µ‰•ÉA±…å•É]•±½µ”¡Á±…å•É%¤ì(€€€±½…±MÑ½É…”¹Í•Ñ%Ñ•´¡Ý•±½µ•-•ä¡Á±…å•É%¤°€‰å•Ìˆ¤ì(€ô(€™Õ¹Ñ¥½¸½Á•¹A±…å•ÉIÕ±•ÍÉ½µ]•±½µ”¡Á±…å•É%¤ì(€€€€¼¼Q¡”Ý•±½µ”ÍÉ••¸¥Ì±½…°Ñ¼„Á±…å•ÈÌÁ¡½¹”¸¼¹½ÐÕÍ”Ñ¡”‰É½…(€€€€¼¼Í…Ù” ¤Á…Ñ ¡•É”èÑ¡…Ð…±Í¼É•¹‘•ÉÌ½É…¹¥Í•ÈÁ…•Ì…¹…¸¥¹Ñ•ÉÉÕÁÐ(€€€€¼¼Ñ¡”™¥ÉÍÐÁ±…å•Èµ½¹±ä¹…Ù¥…Ñ¥½¸½¸„©½¥¹•‘•Ù¥”¸(€€€É•µ•µ‰•ÉA±…å•É]•±½µ”¡Á±…å•É%¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉIÕ±•Í=Á•¸€ôÑÉÕ”ì(€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•Üˆì(€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É½µÁ±•Ñ•‘M½É•…É¡Í•±•Ñ•°‘…ä¤ì(€€€½¹ÍÐ¡½ÍÐ€ô€ ˆÁ±…å•ÉáÁ•É¥•¹”ˆ¤ì(€€€¥˜€ …É½Õ¹‘¥¹…±¥Í•‘½È¡‘…ä°Í•±•Ñ•¤¤ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•Üˆì(€€€€€Í…Ù” ¤ì(€€€€€É•ÑÕÉ¸É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€ô(€€€½¹ÍÐ¹•áÑ…ä€ô•Ù•¹Ñ…åÌ ¤¹™¥¹¡¹•áÐ€ôø¹•áÐ€ø‘…ä€˜˜‘…å¥•±‘%‘Ì¡¹•áÐ¤¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡Í•±•Ñ•¤¤€˜˜€…•Ù•¹Ñ…å½µÁ±•Ñ”¡¹•áÐ¤¤ì(€€€½¹ÍÐÀ€ô•Ù•¹ÑA±…å•È¡Í•±•Ñ•±‘…ä¤°(€€€€€Œ€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤°(€€€€€Ø€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Í•±•Ñ•¤°(€€€€€¡À€ôÁ±…å•É…¥±å!…¹‘¥…À¡Í•±•Ñ•°‘…ä¤°(€€€€€Ñà€ôÁ±…å•ÉÉ½ÕÁ½¹Ñ•áÐ¡Í•±•Ñ•°‘…ä¤°(€€€€€ÍÑ…ÉÐ€ôÑàü¹Í•ÑÕÀü¹ÍÑ…ÉÑÌü¹mÑà¹É½ÕÁ%¹‘•átñð€Ä°(€€€€€Í•Ä€ôÍ½É•M•ÅÕ•¹”¡ÍÑ…ÉÐ¤ì(€€€½¹ÍÐÉ½ÝÌ€ôÍ•Ä¹µ…À ¡ ¤€ôøì(€€€€€½¹ÍÐ¤€ô €´€Ä°(€€€€€€€”€ôÁ±…å•É!½±•¹ÑÉä¡‘…ä°Í•±•Ñ•° ¤ñðíô°(€€€€€€€É½ÍÌ€ô”¹É½ÍÌ€üü€ˆˆ°(€€€€€€€ÁÕÑÑÌ€ô”¹ÁÕÑÑÌ€üü€ˆˆ°(€€€€€€€Á…È€ô€¬¡Ø¹Á…Èü¹m¥tñð€À¤°(€€€€€€€¥¹‘•áY…°€ôØ¹¥¹‘•àü¹m¥t€üü€ˆˆ°(€€€€€€€…‘©ÕÍÑµ•¹Ð€ôÍÑ…‰±•™½É‘MÑÉ½­•½Õ¹Ð¡¥¹‘•áY…°°¡À¤°(€€€€€€€Á½¥¹ÑÌ€ôÍÑ…‰±•™½É‘A½¥¹ÑÌ¡É½ÍÌ°Á…È°¥¹‘•áY…°°¡À¤ì(€€€€€É•ÑÕÉ¸ì °Á…È°¥¹‘•áY…°°É½ÍÌ°ÁÕÑÑÌ°…‘©ÕÍÑµ•¹Ð°Á½¥¹ÑÌôì(€€€ô¤ì(€€€½¹ÍÐÑ½Ñ…±Ì€ô€¡±¥ÍÐ¤€ôø(€€€€€±¥ÍÐ¹É•‘Õ” (€€€€€€€€¡Ð°È¤€ôøì(€€€€€€€€€¥˜€¡MÑÉ¥¹œ¡È¹É½ÍÌ¤¹Ñ½UÁÁ•É…Í” ¤€ôôô€‰@ˆ¤(€€€€€€€€€€€Ð¹É½ÍÌ€¬ôÈ¹Á…È€¬€È€¬È¹…‘©ÕÍÑµ•¹Ðì(€€€€€€€€€•±Í”¥˜€¡Í½É•¹Ñ•É•¡È¹É½ÍÌ¤¤Ð¹É½ÍÌ€¬ô€­È¹É½ÍÌñð€Àì(€€€€€€€€€¥˜€¡Í½É•¹Ñ•É•¡È¹ÁÕÑÑÌ¤¤Ð¹ÁÕÑÑÌ€¬ô€­È¹ÁÕÑÑÌñð€Àì(€€€€€€€€€¥˜€¡È¹Á½¥¹ÑÌ€„ô¹Õ±°¤Ð¹Á½¥¹ÑÌ€¬ôÈ¹Á½¥¹ÑÌì(€€€€€€€€€É•ÑÕÉ¸Ðì(€€€€€€€ô°(€€€€€€€ìÉ½ÍÌè€À°ÁÕÑÑÌè€À°Á½¥¹ÑÌè€Àô°(€€€€€€¤ì(€€€½¹ÍÐ™É½¹Ð€ôÑ½Ñ…±Ì¡É½ÝÌ¹™¥±Ñ•È ¡È¤€ôøÈ¹ €ðô€ä¤¤°(€€€€€‰…¬€ôÑ½Ñ…±Ì¡É½ÝÌ¹™¥±Ñ•È ¡È¤€ôøÈ¹ €øô€ÄÀ¤¤°(€€€€€…±°€ôÑ½Ñ…±Ì¡É½ÝÌ¤°(€€€€€Í¥¹•€ô€¡¸¤€ôø€¡¸€ø€À€ü€¬‘í¹õ€€è¸€ð€À€üƒŠ"H‘í5…Ñ ¹…‰Ì¡¸¥õ€€è€‹ŠPˆ¤ì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰½µÁ±•Ñ•‘…É‘A…”ˆøñ‘¥Ø±…ÍÌô‰É½Õ¹‘Q½Àˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰‰…­É½µ½µÁ±•Ñ•‘…ÉˆûŠ@	…¬Ñ¼A±…å•ÈY¥•Üð½‰ÕÑÑ½¸øñ‘¥Øøñ Èù½µÁ±•Ñ•M½É•…Éð½ ÈøñÀø‘í•ÍŒ¡Àü¹¹…µ”ñð€‰A±…å•Èˆ¥ô‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€ˆˆ€è€ƒ
Ü…ä€‘í‘…åõôƒ
Ü€‘í•ÍŒ¡Œü¹¹…µ”ñð€‰½ÕÉÍ”ˆ¥ôð½Àøð½‘¥Øøñ¥µœ±…ÍÌô‰½µÁ±•Ñ•‘5…Í½ÐˆÍÉŒô‰…Ý…äµ½±˜µµ…Í½Ðµµ¥¹¤¹Á¹œˆ…±Ðô‰Ý…ä½±˜½±™•Èˆøð½‘¥Øø((€ñ‘¥Ø±…ÍÌô‰½µÁ±•Ñ•‘…É‘	…¹¹•Èˆøñ‘¥ØøñÍµ…±°ù%1d!9%@ð½Íµ…±°øñˆø‘í•ÍŒ¡™½Éµ…ÑA±…å¥¹!…¹‘¥…À¡¡À¤¥ôð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ùMQIQ%9Qð½Íµ…±°øñˆù!½±”€‘íÍÑ…ÉÑôð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ùMQQULð½Íµ…±°øñˆûŠrL¥¹…±¥Í•ð½ˆøð½‘¥Øøð½‘¥Øø(€‘íÉ•½Ù•É•‘I½Õ¹‘•ÁÑ•¡‘…ä°Í•±•Ñ•¤€ü€œñÀ±…ÍÌô‰½µÁ±•Ñ•‘…É‘!•±Àˆùe½ÕÈ½É…¹¥Í•È…•ÁÑ•Ñ¡¥ÌÉ½Õ¹…™Ñ•È•µ•É•¹äÉ•½Ù•Éä¸e½ÕÈÍ½É•…É¥Ì½µÁ±•Ñ”¸ð½Àøœ€è€ˆ‰ôñ‘•Ñ…¥±Ì±…ÍÌô‰½µÁ±•Ñ•‘…É‘!•±ÀˆøñÍÕµµ…Éäù‰½ÕÐÑ¡¥ÌÍ½É•…Éð½ÍÕµµ…ÉäøñÀùI•…µ½¹±ä…É¸€ñˆù!À€¬¼´ð½ˆøÍ¡½ÝÌÑ¡”¡…¹‘¥…À…‘©ÕÍÑµ•¹Ð½¸•… ¡½±”¸µ¥¹ÕÌµ•…¹Ì„Á±ÕÌµ¡…¹‘¥…À½±™•È¥Ù•Ì„ÍÑÉ½­”‰…¬¸ð½Àøð½‘•Ñ…¥±Ìø(€ñ‘¥Ø±…ÍÌô‰½µÁ±•Ñ•‘M½É•Q…‰±”ˆøñ‘¥Ø±…ÍÌô‰½µÁ±•Ñ•‘M½É•!•…ˆøñÍÁ…¸ù!½±”ð½ÍÁ…¸øñÍÁ…¸ùA…Èð½ÍÁ…¸øñÍÁ…¸ù%¹‘•àð½ÍÁ…¸øñÍÁ…¸ùM½É”ð½ÍÁ…¸øñÍÁ…¸ù!À€¬¼´ð½ÍÁ…¸øñÍÁ…¸ùA½¥¹ÑÌð½ÍÁ…¸øñÍÁ…¸ùAÕÑÑÌð½ÍÁ…¸øð½‘¥Øø‘íÉ½ÝÌ¹µ…À ¡È¤€ôø€ñ‘¥Ø±…ÍÌô‰½µÁ±•Ñ•‘M½É•I½Ü€‘íÈ¹…‘©ÕÍÑµ•¹Ð€ð€À€ü€‰¥Ù•ÍMÑÉ½­”ˆ€è€ˆ‰ôˆøñˆø‘íÈ¹¡ôð½ˆøñÍÁ…¸ø‘íÈ¹Á…Èñð€‹ŠP‰ôð½ÍÁ…¸øñÍÁ…¸ø‘í•ÍŒ¡È¹¥¹‘•áY…°ñð€‹ŠPˆ¥ôð½ÍÁ…¸øñÍÁ…¸ø‘íÈ¹É½ÍÌ€ôôô€ˆˆ€ü€‹ŠPˆ€è•ÍŒ¡È¹É½ÍÌ¥ôð½ÍÁ…¸øñÍÑÉ½¹œø‘íÍ¥¹•¡È¹…‘©ÕÍÑµ•¹Ð¥ôð½ÍÑÉ½¹œøñÍÁ…¸ø‘íÈ¹Á½¥¹ÑÌ€ôô¹Õ±°€ü€‹ŠPˆ€èÈ¹Á½¥¹ÑÍôð½ÍÁ…¸øñÍÁ…¸ø‘íÈ¹ÁÕÑÑÌ€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹ÁÕÑÑÍôð½ÍÁ…¸øð½‘¥Øù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰½µÁ±•Ñ•‘Q½Ñ…±Ìˆøñ‘¥ØøñÍµ…±°ùI=9P€äð½Íµ…±°øñˆø‘í™É½¹Ð¹É½ÍÍôÍÑÉ½­•Ìƒ
Ü€‘í™É½¹Ð¹Á½¥¹ÑÍôÁÑÌƒ
Ü€‘í™É½¹Ð¹ÁÕÑÑÍôÁÕÑÑÌð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ù	,€äð½Íµ…±°øñˆø‘í‰…¬¹É½ÍÍôÍÑÉ½­•Ìƒ
Ü€‘í‰…¬¹Á½¥¹ÑÍôÁÑÌƒ
Ü€‘í‰…¬¹ÁÕÑÑÍôÁÕÑÑÌð½ˆøð½‘¥Øøñ‘¥Ø±…ÍÌô‰É…¹ˆøñÍµ…±°øÄàµ!=1Q=Q0ð½Íµ…±°øñˆø‘í…±°¹É½ÍÍôÍÑÉ½­•Ìƒ
Ü€‘í…±°¹Á½¥¹ÑÍôÁÑÌƒ
Ü€‘í…±°¹ÁÕÑÑÍôÁÕÑÑÌð½ˆøð½‘¥Øøð½‘¥Øø(€‘í¹•áÑ…ä€ü€ñ‰ÕÑÑ½¸±…ÍÌô‰ÍÑ…ÉÑI½Õ¹‘	Ñ¸ˆ¥ô‰¹•áÑÉ½µ½µÁ±•Ñ•‘…ÉˆùY%\d€‘í¹•áÑ…åôð½‰ÕÑÑ½¸ù€€è€ˆ‰ôñ‰ÕÑÑ½¸±…ÍÌô‰ÍÑ…ÉÑI½Õ¹‘	Ñ¸ˆ¥ô‰‰…­É½µ½µÁ±•Ñ•‘…É‘	½ÑÑ½´ˆù	,Q<A1eHY%\ð½‰ÕÑÑ½¸øð½‘¥Øù€ì(€€€½¹ÍÐ½	…¬€ô€ ¤€ôøì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•Üˆì(€€€€€Í…Ù” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€ôì(€€€€ ˆ‰…­É½µ½µÁ±•Ñ•‘…Éˆ¤¹½¹±¥¬€ô½	…¬ì(€€€€ ˆ‰…­É½µ½µÁ±•Ñ•‘…É‘	½ÑÑ½´ˆ¤¹½¹±¥¬€ô½	…¬ì(€€€¥˜€¡¹•áÑ…ä¤€ ˆ¹•áÑÉ½µ½µÁ±•Ñ•‘…Éˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý…ä€ô¹•áÑ…äì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•Üˆì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ô€Àì(€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€ôì(€ô(€™Õ¹Ñ¥½¸Í½É•…É‘Y•É¥™¥…Ñ¥½¹I½ÝÌ¡‘…ä°Á±…å•É%¤ì(€€€½¹ÍÐŒ€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤°(€€€€€Ø€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Á±…å•É%¤°(€€€€€µ¥¹”€ôÍ½É•ÉMÑ½É”¡‘…ä°Á±…å•É%¤°(€€€€€ÁÕÑÑÍI•ÅÕ¥É•€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤°(€€€€€¡À€ôÁ±…å•É…¥±å!…¹‘¥…À¡Á±…å•É%°‘…ä¤ì(€€€É•ÑÕÉ¸ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôø¤€¬€Ä¤¹µ…À ¡ ¤€ôøì(€€€€€½¹ÍÐÍ•±˜€ôµ¥¹•mMÑÉ¥¹œ¡ ¥tü¹Í•±˜ñðíô°(€€€€€€€½™˜€ô™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Á±…å•É%° ¤°(€€€€€€€Í•±™É½ÍÌ€ôÍ•±˜¹É½ÍÌ€üü€ˆˆ°(€€€€€€€½™™É½ÍÌ€ô½™˜ü¹É½ÍÌ€üü€ˆˆ°(€€€€€€€Í•±™AÕÑÑÌ€ôÍ•±˜¹ÁÕÑÑÌ€üü€ˆˆ°(€€€€€€€½™™AÕÑÑÌ€ô½™˜ü¹ÁÕÑÑÌ€üü€ˆˆ°(€€€€€€€‰½Ñ¡¹Ñ•É•€ôÍ½É•¹Ñ•É•¡Í•±™É½ÍÌ¤€˜˜Í½É•¹Ñ•É•¡½™™É½ÍÌ¤°(€€€€€€€Í½É•5…Ñ €ô‰½Ñ¡¹Ñ•É•€˜˜É½ÍÍM½É•ÍÉ•”¡‘…ä°Á±…å•É%° °½™™É½ÍÌ°Í•±™É½ÍÌ¤°(€€€€€€€ÁÕÑÑÍ5…Ñ €ô(€€€€€€€€€€…ÁÕÑÑÍI•ÅÕ¥É•ñð(€€€€€€€€€€¡Í½É•¹Ñ•É•¡½™™AÕÑÑÌ¤€˜˜(€€€€€€€€€€€Í½É•¹Ñ•É•¡Í•±™AÕÑÑÌ¤€˜˜(€€€€€€€€€€€€­½™™AÕÑÑÌ€ôôô€­Í•±™AÕÑÑÌ¤ì(€€€€€É•ÑÕÉ¸ì(€€€€€€€ °(€€€€€€€Í•±˜èÍ•±™É½ÍÌ°(€€€€€€€½™˜è½™™É½ÍÌ°(€€€€€€€Í•±™AÕÑÑÌ°(€€€€€€€½™™AÕÑÑÌ°(€€€€€€€Í•±™AÑÌè‰½Ñ¡¹Ñ•É•(€€€€€€€€€€üÍÑ…‰±•™½É‘A½¥¹ÑÌ¡Í•±™É½ÍÌ°€¬¡Ø¹Á…Èü¹m €´€Åtñð€À¤°Ø¹¥¹‘•àü¹m €´€Åt€üü€ˆˆ°¡À¤(€€€€€€€€€€è¹Õ±°°(€€€€€€€½™™AÑÌè‰½Ñ¡¹Ñ•É•(€€€€€€€€€€üÍÑ…‰±•™½É‘A½¥¹ÑÌ¡½™™É½ÍÌ°€¬¡Ø¹Á…Èü¹m €´€Åtñð€À¤°Ø¹¥¹‘•àü¹m €´€Åt€üü€ˆˆ°¡À¤(€€€€€€€€€€è¹Õ±°°(€€€€€€€Í½É•5…Ñ °(€€€€€€€ÁÕÑÑÍ5…Ñ °(€€€€€€€µ…Ñ èÍ½É•5…Ñ €˜˜ÁÕÑÑÍ5…Ñ °(€€€€€ôì(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸µ…É­•‘M½É•…É‘Y•É¥™¥…Ñ¥½¸¡‘…ä°Í½É•É%¤ì(€€€½¹ÍÐÑ…É•Ñ%€ôµ…É­•ÉQ…É•Ñ½È¡Í½É•É%°‘…ä¤°(€€€€€µ…É­•ÉI½Õ¹€ôÍ½É•ÉMÑ½É”¡‘…ä°Í½É•É%¤°(€€€€€Á±…å•ÉI½Õ¹€ôÑ…É•Ñ%€üÍ½É•ÉMÑ½É”¡‘…ä°Ñ…É•Ñ%¤€èíô°(€€€€€ÁÕÑÑÍI•ÅÕ¥É•€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤ì(€€€½¹ÍÐÉ½ÝÌ€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôø¤€¬€Ä¤¹µ…À ¡ ¤€ôøì(€€€€€½¹ÍÐµ…É­•€ôµ…É­•ÉI½Õ¹‘mMÑÉ¥¹œ¡ ¥tü¹½™™¥¥…°ñðíô°(€€€€€€€¡•­•€ôÁ±…å•ÉI½Õ¹‘mMÑÉ¥¹œ¡ ¥tü¹Í•±˜ñðíô°(€€€€€€€µ…É­•‘É½ÍÌ€ôµ…É­•¹É½ÍÌ€üü€ˆˆ°(€€€€€€€¡•­•‘É½ÍÌ€ô¡•­•¹É½ÍÌ€üü€ˆˆ°(€€€€€€€µ…É­•‘AÕÑÑÌ€ôµ…É­•¹ÁÕÑÑÌ€üü€ˆˆ°(€€€€€€€¡•­•‘AÕÑÑÌ€ô¡•­•¹ÁÕÑÑÌ€üü€ˆˆ°(€€€€€€€Í½É•5…Ñ €ôÍ½É•¹Ñ•É•¡µ…É­•‘É½ÍÌ¤€˜˜(€€€€€€€€€Í½É•¹Ñ•É•¡¡•­•‘É½ÍÌ¤€˜˜(€€€€€€€€€É½ÍÍM½É•ÍÉ•”¡‘…ä°Ñ…É•Ñ%° °µ…É­•‘É½ÍÌ°¡•­•‘É½ÍÌ¤°(€€€€€€€ÁÕÑÑÍ5…Ñ €ô(€€€€€€€€€€…ÁÕÑÑÍI•ÅÕ¥É•ñð(€€€€€€€€€€¡Í½É•¹Ñ•É•¡µ…É­•‘AÕÑÑÌ¤€˜˜(€€€€€€€€€€€Í½É•¹Ñ•É•¡¡•­•‘AÕÑÑÌ¤€˜˜(€€€€€€€€€€€€­µ…É­•‘AÕÑÑÌ€ôôô€­¡•­•‘AÕÑÑÌ¤ì(€€€€€É•ÑÕÉ¸ì(€€€€€€€ °(€€€€€€€µ…É­•èµ…É­•‘É½ÍÌ°(€€€€€€€¡•­•è¡•­•‘É½ÍÌ°(€€€€€€€µ…É­•‘AÕÑÑÌ°(€€€€€€€¡•­•‘AÕÑÑÌ°(€€€€€€€Í½É•5…Ñ °(€€€€€€€ÁÕÑÑÍ5…Ñ °(€€€€€€€µ…Ñ èÍ½É•5…Ñ €˜˜ÁÕÑÑÍ5…Ñ °(€€€€€ôì(€€€ô¤ì(€€€É•ÑÕÉ¸ìÑ…É•Ñ%°É½ÝÌ°µ¥Íµ…Ñ¡•ÌèÉ½ÝÌ¹™¥±Ñ•È ¡È¤€ôø€…È¹µ…Ñ ¤ôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉI½Õ¹‘Y•É¥™¥…Ñ¥½¸¡Í•±•Ñ•°‘…ä¤ì(€€€É•ÅÕ•ÍÑI½Õ¹‘]…­•1½¬ ¤ì(€€€½¹ÍÐ¡½ÍÐ€ô€ ˆÁ±…å•ÉáÁ•É¥•¹”ˆ¤°(€€€€€Ñà€ôÁ±…å•ÉÉ½ÕÁ½¹Ñ•áÐ¡Í•±•Ñ•°‘…ä¤°(€€€€€Í•ÑÕÀ€ôÑàü¹Í•ÑÕÀ°(€€€€€Œ€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤ì(€€€¥˜€ …Ñà¤É•ÑÕÉ¸É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€½¹ÍÐÍÑ…ÉÐ€ôÉ½ÕÁMÑ…ÉÑ¥¹!½±”¡ÍÑ½É”¹•Ù•¹Ð°‘…ä°Ñà¹É½ÕÁ%¹‘•à¤°(€€€€€Í•Ä€ôÍ½É•M•ÅÕ•¹”¡ÍÑ…ÉÐ¤°(€€€€€ÁÕÑÑÍI•ÅÕ¥É•€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤°(€€€€€½Ý¹I½ÝÌ€ôÍ½É•…É‘Y•É¥™¥…Ñ¥½¹I½ÝÌ¡‘…ä°Í•±•Ñ•¤°(€€€€€½Ý¹5¥Íµ…Ñ¡•Ì€ô½Ý¹I½ÝÌ¹™¥±Ñ•È ¡È¤€ôø€…È¹µ…Ñ ¤°(€€€€€ÍÑ…”€ô½Ý¹5¥Íµ…Ñ¡•Ì¹±•¹Ñ (€€€€€€€€ü€‰µ¥¹”ˆ(€€€€€€€€èÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”€ôôô€‰µ…É­•ˆ(€€€€€€€€€€ü€‰µ…É­•ˆ(€€€€€€€€€€è€‰µ¥¹”ˆ°(€€€€€µ…É­•€ôµ…É­•‘M½É•…É‘Y•É¥™¥…Ñ¥½¸¡‘…ä°Í•±•Ñ•¤°(€€€€€Ñ…É•Ñ9…µ”€ô•Ù•¹ÑA±…å•È¡µ…É­•¹Ñ…É•Ñ%°‘…ä¤ü¹¹…µ”ñð€‰Ñ¡”Á±…å•Èå½Ôµ…É­•ˆì(€€€½¹ÍÐ…±±…É‘ÍÉ•”€ô(€€€€€½Ý¹5¥Íµ…Ñ¡•Ì¹±•¹Ñ €ôôô€À€˜˜(€€€€€µ…É­•¹µ¥Íµ…Ñ¡•Ì¹±•¹Ñ €ôôô€À€˜˜(€€€€€½™™¥¥…±…É‘AÉ½É•ÍÌ¡‘…ä°Í•±•Ñ•¤¹½µÁ±•Ñ”ì(€€€½¹ÍÐÍ…Ù•MÑ…Ñ”€ôÝ…å±½Õ¹É½Õ¹‘M…Ù•MÑ…Ñ”ü¸ (€€€€€ÍÑ½É”¹±½Õü¹•Ù•¹Ñ%°(€€€€€‘…ä°(€€€€€Í•±•Ñ•°(€€€€¤ñðíôì(€€€¥˜€¡É•½Ù•É•‘I½Õ¹‘•ÁÑ•¡‘…ä°Í•±•Ñ•¤ñð€ (€€€€€…±±…É‘ÍÉ•”€˜˜(€€€€€Í½É•ÉMÑ½É”¡‘…ä°Í•±•Ñ•¤ü¹}µ•Ñ„ü¹™¥¹…±¥Í•‘Ð€˜˜(€€€€€Í…Ù•MÑ…Ñ”¹…­¹½Ý±•‘•€˜˜(€€€€€€…Í…Ù•MÑ…Ñ”¹Á•¹‘¥¹œ€˜˜(€€€€€€…Í…Ù•MÑ…Ñ”¹½¹™±¥Ð€˜˜(€€€€€€…Í…Ù•MÑ…Ñ”¹‰±½­•(€€€€¤¤ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”€ô€‰µ¥¹”ˆì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ô™…±Í”ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰½µÁ±•Ñ•ˆì(€€€€€½¹ÍÐ…•ÁÑ•õÍ½É•ÉMÑ½É”¡‘…ä±Í•±•Ñ•¤ì(€€€€€¥˜ ……•ÁÑ•¹}µ•Ñ„ü¹™¥¹…±¥Í•‘Ð¤ì(€€€€€€€…•ÁÑ•¹}µ•Ñ„õì¸¸¸¡…•ÁÑ•¹}µ•Ñ…ññíô¤±™¥¹…±¥Í•‘Ðé¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¥ôì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤íÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä±Í•±•Ñ•¤ì(€€€€€ô(€€€€€É•±•…Í•I½Õ¹‘]…­•1½¬ ¤ì(€€€€€Í…Ù” ¤ì(€€€€€É•ÑÕÉ¸É•¹‘•É½µÁ±•Ñ•‘M½É•…É¡Í•±•Ñ•°‘…ä¤ì(€€€ô(€€€¥˜€¡…±±…É‘ÍÉ•”¤ì(€€€€€½¹ÍÐÝ…¥Ñ¥¹œ€ô	½½±•…¸¡Í½É•ÉMÑ½É”¡‘…ä°Í•±•Ñ•¤ü¹}µ•Ñ„ü¹™¥¹…±¥Í•‘Ð¤ì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰É½Õ¹‘Q½Àˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰‰…­Q½É••‘I½Õ¹ˆûŠ@	…¬Ñ¼I½Õ¹ð½‰ÕÑÑ½¸øñ‘¥Øøñ Èù…É‘ÌÉ•”ð½ ÈøñÀø‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡Í•±•Ñ•°‘…ä¤ü¹¹…µ”ñð€ˆˆ¥ô‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€ˆˆ€è€ƒ
Ü…ä€‘í‘…åõôƒ
Ü€‘í•ÍŒ¡Œü¹¹…µ”ñð€‰½ÕÉÍ”ˆ¥ôð½Àøð½‘¥Øøð½‘¥Øøñ‘¥Ø±…ÍÌô‰Ù•É¥™å…Éˆøñ ÌûŠrL	½Ñ €Äàµ¡½±”…É‘Ì…É•”ð½ ÌøñÀø‘íÝ…¥Ñ¥¹œ€ü€‰e½ÕÈ½µÁ±•Ñ”…É••…É¥ÌÍÑ¥±°ÁÉ½Ñ•Ñ•½¸Ñ¡¥ÌÁ¡½¹”…¹¥ÌÝ…¥Ñ¥¹œÑ¼‰”…•ÁÑ•½¹±¥¹”¸ˆ€è€‰Q¡”…ÉÝ¥±°±½Í”½¹±ä…™Ñ•ÈÑ¡¥Ì½µÁ±•Ñ”…É••½Áä¡…Ì‰••¸…•ÁÑ•½¹±¥¹”¸‰ôð½Àø‘íÍ…Ù•MÑ…Ñ”¹½¹™±¥ÐñðÍ…Ù•MÑ…Ñ”¹‰±½­•€ü€œñÀ±…ÍÌô‰Ù•É¥™¥…Ñ¥½¹‘Ù¥”ˆøñˆù=É…¹¥Í•ÈÉ•Ù¥•ÜÉ•ÅÕ¥É•¸ð½ˆøÍ¬Ñ¡”½É…¹¥Í•ÈÑ¼½Á•¸I•Ù¥•ÜM…Ù•½Á¥•Ì¸Q¡¥ÌÍ½É•…ÉÉ•µ…¥¹Ì…•ÍÍ¥‰±”¸ð½Àøœ€è€ˆ‰ôñ‰ÕÑÑ½¸±…ÍÌô‰ÍÑ…ÉÑI½Õ¹‘	Ñ¸ˆ¥ô‰™¥¹…±¥Í•É••‘I½Õ¹ˆø‘íÝ…¥Ñ¥¹œ€ü€‰IQId%90UA1=ˆ€è€‰MY9%91%MIIL‰ôð½‰ÕÑÑ½¸øð½‘¥Øù€ì(€€€€€€ ˆ‰…­Q½É••‘I½Õ¹ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰Í½É¥¹œˆì(€€€€€€€Í…Ù” ¤ì(€€€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€ôì(€€€€€€ ˆ™¥¹…±¥Í•É••‘I½Õ¹ˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€€€½¹ÍÐ‰ÕÑÑ½¸€ô€ ˆ™¥¹…±¥Í•É••‘I½Õ¹ˆ¤ì(€€€€€€€‰ÕÑÑ½¸¹‘¥Í…‰±•€ôÑÉÕ”ì(€€€€€€€‰ÕÑÑ½¸¹Ñ•áÑ½¹Ñ•¹Ð€ô€‰MY%9=5A1QIŠ˜ˆì(€€€€€€€½¹ÍÐ…•ÁÑ•€ôÍ½É•ÉMÑ½É”¡‘…ä°Í•±•Ñ•¤ì(€€€€€€€…•ÁÑ•¹}µ•Ñ„€ôì(€€€€€€€€€€¸¸¸¡…•ÁÑ•¹}µ•Ñ„ñðíô¤°(€€€€€€€€€™¥¹…±¥Í•‘Ðè…•ÁÑ•¹}µ•Ñ„ü¹™¥¹…±¥Í•‘Ðñð¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€€€ôì(€€€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€€€‘•±•Ñ”…•ÁÑ•¹}µ•Ñ„¹™¥¹…±¥Í•‘Ðì(€€€€€€€€€…±•ÉÐ ‰Q¡¥ÌÁ¡½¹”½Õ±¹½ÐÁÉ½Ñ•ÐÑ¡”½µÁ±•Ñ”…É¸-••ÀÑ¡”ÁÀ½Á•¸…¹™É•”ÁÀMÑ½É…”‰•™½É”ÑÉå¥¹œ……¥¸¸ˆ¤ì(€€€€€€€€€É•ÑÕÉ¸É•¹‘•ÉI½Õ¹‘Y•É¥™¥…Ñ¥½¸¡Í•±•Ñ•°‘…ä¤ì(€€€€€€€ô(€€€€€€€½¹ÍÐÕÁ±½…‘•€ô…Ý…¥Ð™±ÕÍ¡±½Õ‘I½Õ¹¡‘…ä°Í•±•Ñ•¤ì(€€€€€€€½¹ÍÐÕÉÉ•¹Ð€ôÝ…å±½Õ¹É½Õ¹‘M…Ù•MÑ…Ñ”ü¸¡ÍÑ½É”¹±½Õü¹•Ù•¹Ñ%°‘…ä°Í•±•Ñ•¤ñðíôì(€€€€€€€¥˜€¡ÕÁ±½…‘•€˜˜ÕÉÉ•¹Ð¹…­¹½Ý±•‘•€˜˜€…ÕÉÉ•¹Ð¹Á•¹‘¥¹œ€˜˜€…ÕÉÉ•¹Ð¹½¹™±¥Ð€˜˜€…ÕÉÉ•¹Ð¹‰±½­•¤ì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰½µÁ±•Ñ•ˆì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”€ô€‰µ¥¹”ˆì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ô™…±Í”ì(€€€€€€€€€É•±•…Í•I½Õ¹‘]…­•1½¬ ¤ì(€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€É•ÑÕÉ¸É•¹‘•É½µÁ±•Ñ•‘M½É•…É¡Í•±•Ñ•°‘…ä¤ì(€€€€€€€ô(€€€€€€€É•¹‘•ÉI½Õ¹‘Y•É¥™¥…Ñ¥½¸¡Í•±•Ñ•°‘…ä¤ì(€€€€€ôì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€½¹ÍÐ½Ý¹…É€ô€ñ‘¥Ø±…ÍÌô‰Ù•É¥™å…Éˆøñ Ìø‘í½Ý¹5¥Íµ…Ñ¡•Ì¹±•¹Ñ €ü€‘í½Ý¹5¥Íµ…Ñ¡•Ì¹±•¹Ñ¡ô¡½±”‘í½Ý¹5¥Íµ…Ñ¡•Ì¹±•¹Ñ €ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô¹••…ÑÑ•¹Ñ¥½¹€€èÁÕÑÑÍI•ÅÕ¥É•€ü€‹ŠrLe½ÕÈ…Éè…±°€ÄàÍ½É•Ì…¹ÁÕÑÑÌ…É•”ˆ€è€‹ŠrLe½ÕÈ…Éè…±°€ÄàÍ½É•Ì…É•”‰ôð½ ÌøñÀùe½ÕÈ€‘íÁÕÑÑÍI•ÅÕ¥É•€ü€‰Í½É•Ì…¹ÁÕÑÑÌ…É”ˆ€è€‰Í½É•Ì…É”‰ô½µÁ…É•Ý¥Ñ Ñ¡”½™™¥¥…°•¹ÑÉ¥•Ìµ…‘”‰äå½ÕÈµ…É­•È¸ð½Àøñ‘¥Ø±…ÍÌô‰Ù•É¥™åI½ÝÌˆø‘í½Ý¹I½ÝÌ¹µ…À ¡È¤€ôø€ñ‘¥Ø±…ÍÌô‰Ù•É¥™åI½Ü€‘íÈ¹µ…Ñ €ü€‰µ…Ñ ˆ€è€‰µ¥Íµ…Ñ ‰ôˆøñˆù!½±”€‘íÈ¹¡ôð½ˆøñÍÁ…¸ù5…É­•Èè€‘íÈ¹½™˜€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹½™™ô‘íÈ¹½™™AÑÌ€„ô¹Õ±°€ü€€ ‘íÈ¹½™™AÑÍôÁÐ‘íÈ¹½™™AÑÌ€ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô¥€€è€ˆ‰ô‘íÁÕÑÑÍI•ÅÕ¥É•€ü€ñÍµ…±°ùAÕÑÑÌè€‘íÈ¹½™™AÕÑÑÌ€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹½™™AÕÑÑÍôð½Íµ…±°ù€€è€ˆ‰ôð½ÍÁ…¸øñÍÁ…¸ùe½Ôè€‘íÈ¹Í•±˜€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹Í•±™ô‘íÈ¹Í•±™AÑÌ€„ô¹Õ±°€ü€€ ‘íÈ¹Í•±™AÑÍôÁÐ‘íÈ¹Í•±™AÑÌ€ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô¥€€è€ˆ‰ô‘íÁÕÑÑÍI•ÅÕ¥É•€ü€ñÍµ…±°ùAÕÑÑÌè€‘íÈ¹Í•±™AÕÑÑÌ€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹Í•±™AÕÑÑÍôð½Íµ…±°ù€€è€ˆ‰ôð½ÍÁ…¸øñÍÑÉ½¹œø‘íÈ¹µ…Ñ €ü€‹ŠrLˆ€è€ˆ„‰ôð½ÍÑÉ½¹œø‘ì…È¹Í½É•5…Ñ €ü€ñ•´±…ÍÌô‰Ù•É¥™å%ÍÍÕ”ˆùM½É”µ¥Íµ…Ñ ƒŠP5…É­•È€‘íÈ¹½™˜€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹½™™ô°e½Ô€‘íÈ¹Í•±˜€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹Í•±™ôð½•´ù€€è€ˆ‰ô‘íÁÕÑÑÍI•ÅÕ¥É•€˜˜€…È¹ÁÕÑÑÍ5…Ñ €ü€ñ•´±…ÍÌô‰Ù•É¥™å%ÍÍÕ”ˆùAÕÑÑÌµ¥Íµ…Ñ ƒŠP5…É­•È€‘íÈ¹½™™AÕÑÑÌ€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹½™™AÕÑÑÍô°e½Ô€‘íÈ¹Í•±™AÕÑÑÌ€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹Í•±™AÕÑÑÍôð½•´ù€€è€ˆ‰ôð½‘¥Øù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½‘¥Øù€ì(€€€½¹ÍÐµ…É­•‘…É€ô€ñ‘¥Ø±…ÍÌô‰Ù•É¥™å…Éµ…É­•‘Y•É¥™å…Éˆøñ Ìø‘íµ…É­•¹µ¥Íµ…Ñ¡•Ì¹±•¹Ñ €ü…Éµ…É­•™½È€‘í•ÍŒ¡Ñ…É•Ñ9…µ”¥ôƒŠP€‘íµ…É­•¹µ¥Íµ…Ñ¡•Ì¹±•¹Ñ¡ô¡½±”‘íµ…É­•¹µ¥Íµ…Ñ¡•Ì¹±•¹Ñ €ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô¹••…ÑÑ•¹Ñ¥½¹€€èƒŠrL…Éµ…É­•™½È€‘í•ÍŒ¡Ñ…É•Ñ9…µ”¥ôè…±°€Äà…É••ôð½ ÌøñÀùe½ÕÈµ…É­•È•¹ÑÉ¥•Ì…É”½µÁ…É•Ý¥Ñ €‘í•ÍŒ¡Á±…å•É¥ÉÍÑ9…µ”¡µ…É­•¹Ñ…É•Ñ%¤¥÷ŠeÌ¡•­¥¹œ•¹ÑÉ¥•Ì¸ð½Àøñ‘¥Ø±…ÍÌô‰Ù•É¥™åI½ÝÌˆø‘íµ…É­•¹É½ÝÌ¹µ…À ¡È¤€ôø€ñ‘¥Ø±…ÍÌô‰Ù•É¥™åI½Ü€‘íÈ¹µ…Ñ €ü€‰µ…Ñ ˆ€è€‰µ¥Íµ…Ñ ‰ôˆ€‘íÈ¹µ…Ñ €ü€ˆˆ€è‘…Ñ„µ™¥áµ…É­•ôˆ‘íÈ¹¡ôˆÉ½±”ô‰‰ÕÑÑ½¸ˆÑ…‰¥¹‘•àôˆÀ‰ôøñˆù!½±”€‘íÈ¹¡ôð½ˆøñÍÁ…¸ùe½Ôè€‘íÈ¹µ…É­•€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹µ…É­•‘ô‘íÁÕÑÑÍI•ÅÕ¥É•€ü€ñÍµ…±°ùAÕÑÑÌè€‘íÈ¹µ…É­•‘AÕÑÑÌ€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹µ…É­•‘AÕÑÑÍôð½Íµ…±°ù€€è€ˆ‰ôð½ÍÁ…¸øñÍÁ…¸ø‘í•ÍŒ¡Á±…å•É¥ÉÍÑ9…µ”¡µ…É­•¹Ñ…É•Ñ%¤¥ôè€‘íÈ¹¡•­•€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹¡•­•‘ô‘íÁÕÑÑÍI•ÅÕ¥É•€ü€ñÍµ…±°ùAÕÑÑÌè€‘íÈ¹¡•­•‘AÕÑÑÌ€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹¡•­•‘AÕÑÑÍôð½Íµ…±°ù€€è€ˆ‰ôð½ÍÁ…¸øñÍÑÉ½¹œø‘íÈ¹µ…Ñ €ü€‹ŠrLˆ€è€ˆ„‰ôð½ÍÑÉ½¹œø‘ì…È¹Í½É•5…Ñ €ü€ñ•´±…ÍÌô‰Ù•É¥™å%ÍÍÕ”ˆùM½É”µ¥Íµ…Ñ ƒŠPe½Ô€‘íÈ¹µ…É­•€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹µ…É­•‘ô°€‘í•ÍŒ¡Á±…å•É¥ÉÍÑ9…µ”¡µ…É­•¹Ñ…É•Ñ%¤¥ô€‘íÈ¹¡•­•€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹¡•­•‘ôð½•´ù€€è€ˆ‰ô‘íÁÕÑÑÍI•ÅÕ¥É•€˜˜€…È¹ÁÕÑÑÍ5…Ñ €ü€ñ•´±…ÍÌô‰Ù•É¥™å%ÍÍÕ”ˆùAÕÑÑÌµ¥Íµ…Ñ ƒŠPe½Ô€‘íÈ¹µ…É­•‘AÕÑÑÌ€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹µ…É­•‘AÕÑÑÍô°€‘í•ÍŒ¡Á±…å•É¥ÉÍÑ9…µ”¡µ…É­•¹Ñ…É•Ñ%¤¥ô€‘íÈ¹¡•­•‘AÕÑÑÌ€ôôô€ˆˆ€ü€‹ŠPˆ€èÈ¹¡•­•‘AÕÑÑÍôð½•´ù€€è€ˆ‰ôð½‘¥Øù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½‘¥Øù€ì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰É½Õ¹‘Q½Àˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰‰…­Q½I½Õ¹ˆûŠ@	…¬Ñ¼I½Õ¹ð½‰ÕÑÑ½¸øñ‘¥Øøñ ÈùI½Õ¹Y•É¥™¥…Ñ¥½¸ð½ ÈøñÀø‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡Í•±•Ñ•°‘…ä¤ü¹¹…µ”ñð€ˆˆ¥ô‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€ˆˆ€è€ƒ
Ü…ä€‘í‘…åõôƒ
Ü€‘í•ÍŒ¡Œü¹¹…µ”ñð€‰½ÕÉÍ”ˆ¥ôð½Àøð½‘¥Øøð½‘¥Øø‘íÍÑ…”€ôôô€‰µ¥¹”ˆ€ü½Ý¹…É€èµ…É­•‘…É‘ô(€‘íÍÑ…”€ôôô€‰µ¥¹”ˆ€˜˜½Ý¹5¥Íµ…Ñ¡•Ì¹±•¹Ñ €ü€ñ‘¥Ø±…ÍÌô‰Ù•É¥™¥…Ñ¥½¹‘Ù¥”ˆùI•ÑÕÉ¸Ñ¼Ñ¡”É•±•Ù…¹Ð¡½±”½È…Í¬å½ÕÈµ…É­•ÈÑ¼½ÉÉ•ÐÑ¡”½™™¥¥…°•¹ÑÉä¸±°€Äà¡½±•ÌµÕÍÐ…É•”‰•™½É”½¹Ñ¥¹Õ¥¹œ¸ð½‘¥Øù€€èÍÑ…”€ôôô€‰µ¥¹”ˆ€ü€ñ‰ÕÑÑ½¸±…ÍÌô‰ÍÑ…ÉÑI½Õ¹‘	Ñ¸ˆ¥ô‰½¹Ñ¥¹Õ•Q½5…É­•‘…Éˆù=9Q%9UƒŠP!,I$5I-ð½‰ÕÑÑ½¸ù€€è€ñ‘¥Ø±…ÍÌô‰Ù•É¥™¥…Ñ¥½¹‘Ù¥”ˆøñˆùQ…À„É•¡½±”ð½ˆøÑ¼¡•¬Ñ¡”Í½É”å½Ô•¹Ñ•É•¸%˜å½ÕÈ•¹ÑÉä¥Ì½ÉÉ•Ð°Ý…¥Ð™½È€‘í•ÍŒ¡Á±…å•É¥ÉÍÑ9…µ”¡µ…É­•¹Ñ…É•Ñ%¤¥ôÑ¼½ÉÉ•ÐÑ¡•¥È¡•­¥¹œÍ½É”°Ñ¡•¸ÁÉ•ÍÌI•™É•Í ¸ð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™ÐÙ•É¥™åI•™É•Í ˆ¥ô‰É•™É•Í¡5…É­•‘…ÉˆùI•™É•Í ð½‰ÕÑÑ½¸ùõ€ì(€€€€ ˆ‰…­Q½I½Õ¹ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”€ô€‰µ¥¹”ˆì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰Í½É¥¹œˆì(€€€€€Í…Ù” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€ôì(€€€¥˜€  ˆ½¹Ñ¥¹Õ•Q½5…É­•‘…Éˆ¤¤(€€€€€€ ˆ½¹Ñ¥¹Õ•Q½5…É­•‘…Éˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”€ô€‰µ…É­•ˆì(€€€€€€€Í…Ù” ¤ì(€€€€€€€É•¹‘•ÉI½Õ¹‘Y•É¥™¥…Ñ¥½¸¡Í•±•Ñ•°‘…ä¤ì(€€€€€ôì(€€€€ m‘…Ñ„µ™¥áµ…É­•‘tœ¤¹™½É…  ¡É½Ü¤€ôøì(€€€€€½¹ÍÐ½Á•¹!½±”€ô€ ¤€ôøì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÍ•Ä¹¥¹‘•á=˜ ­É½Ü¹‘…Ñ…Í•Ð¹™¥áµ…É­•¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ôÑÉÕ”ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰Í½É¥¹œˆì(€€€€€€€Í…Ù” ¤ì(€€€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€ôì(€€€€€É½Ü¹½¹±¥¬€ô½Á•¹!½±”ì(€€€€€É½Ü¹½¹­•å‘½Ý¸€ô€¡•Ù•¹Ð¤€ôøì(€€€€€€€¥˜€¡•Ù•¹Ð¹­•ä€ôôô€‰¹Ñ•Èˆñð•Ù•¹Ð¹­•ä€ôôô€ˆ€ˆ¤ì(€€€€€€€€€•Ù•¹Ð¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì(€€€€€€€€€½Á•¹!½±” ¤ì(€€€€€€€ô(€€€€€ôì(€€€ô¤ì(€€€¥˜€  ˆÉ•™É•Í¡5…É­•‘…Éˆ¤¤(€€€€€€ ˆÉ•™É•Í¡5…É­•‘…Éˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€€€…Ý…¥ÐÍå¹±½Õ‘9½Ü ¤ì(€€€€€€€É•¹‘•ÉI½Õ¹‘Y•É¥™¥…Ñ¥½¸¡Í•±•Ñ•°‘…ä¤ì(€€€€€ôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•Éµ‰É½Í•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€É•ÅÕ•ÍÑI½Õ¹‘]…­•1½¬ ¤ì(€€€½¹ÍÐ¡½ÍÐ€ô€ ˆÁ±…å•ÉáÁ•É¥•¹”ˆ¤°(€€€€€Ñà€ôÁ±…å•ÉÉ½ÕÁ½¹Ñ•áÐ¡Í•±•Ñ•°‘…ä¤ì(€€€¥˜€ …Ñà¤É•ÑÕÉ¸É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€½¹ÍÐÉ½±•Ì€ô…µ‰É½Í•I½±•Ì¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤°(€€€€€•‘¥Ñ…‰±”€ômÉ½±•Ì¹Í½É•É%°É½±•Ì¹µ…É­•É%‘t¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡Í•±•Ñ•¤¤°(€€€€€•¹ÑÉåM½É•É%€ô•‘¥Ñ…‰±”€üMÑÉ¥¹œ¡Í•±•Ñ•¤€èÉ½±•Ì¹Í½É•É%°(€€€€€¥ÍAÉ¥µ…Éä€ôMÑÉ¥¹œ¡Í•±•Ñ•¤€ôôôÉ½±•Ì¹Í½É•É%°(€€€€€Œ€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤°(€€€€€Ø€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä¤°(€€€€€ÍÑ…ÉÐ€ôÉ½ÕÁMÑ…ÉÑ¥¹!½±”¡ÍÑ½É”¹•Ù•¹Ð°‘…ä°Ñà¹É½ÕÁ%¹‘•à¤°(€€€€€Í•ÅÕ•¹”€ôÍ½É•M•ÅÕ•¹”¡ÍÑ…ÉÐ¤°(€€€€€Á½Í¥Ñ¥½¸€ô5…Ñ ¹µ…à À°5…Ñ ¹µ¥¸ ÄÜ°€¬¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ìñð€À¤¤¤°(€€€€€¡½±”€ôÍ•ÅÕ•¹•mÁ½Í¥Ñ¥½¹t°(€€€€€¥¹‘•à€ô¡½±”€´€Ä°(€€€€€Á…È€ô€¬¡Ø¹Á…Èü¹m¥¹‘•átñð€Ð¤°(€€€€€µ•ÑÉ•Ì€ô½ÕÉÍ•!½±•¥ÍÑ…¹”¡Ø°¥¹‘•à¤ñð€‹ŠPˆ°(€€€€€…É••µ•¹Ð€ô…µ‰É½Í•!½±•É••µ•¹Ð¡‘…ä°Ñà¹É½ÕÁ%¹‘•à°¡½±”¤°(€€€€€É•½É€ô…µ‰É½Í•¹ÑÉä¡‘…ä°•¹ÑÉåM½É•É%°¡½±”¤°(€€€€€É½ÍÌ€ôÉ•½É¹Í•±˜ü¹É½ÍÌ°(€€€€€‘É¥Ù•%€ôMÑÉ¥¹œ¡É•½É¹…µ‰É½Í”ü¹‘É¥Ù•A±…å•É%ñð€ˆˆ¤°(€€€€€¹ÑÀ€ô¹ÑÁ!½±•Í½È¡‘…ä¤¹¥¹±Õ‘•Ì¡¡½±”¤°(€€€€€¡½±‘•È€ô¹ÑÀ€üÕÉÉ•¹Ñ9ÑÁ!½±‘•È¡‘…ä°¡½±”¤€è¹Õ±°°(€€€€€•áÑÉ…9ÑÁA±…å•É%€ôÉ½±•Ì¹Ñ•…´¹±•¹Ñ €ôôô€Ì(€€€€€€€€üMÑÉ¥¹œ (€€€€€€€€€€€Ñà¹Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌü¹mMÑÉ¥¹œ¡¡½±”¥tñð(€€€€€€€€€€€€€Ñà¹Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•Èñð(€€€€€€€€€€€€€€ˆˆ°(€€€€€€€€€€¤(€€€€€€€€è€ˆˆ°(€€€€€¡…¹‘¥…À€ô…µ‰É½Í•Q•…µ!…¹‘¥…À¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤°(€€€€€½Õ¹ÑÌ€ô…µ‰É½Í•É¥Ù•½Õ¹ÑÌ¡‘…ä°Ñà¹É½ÕÁ%¹‘•à°É½±•Ì¹Í½É•É%¤°(€€€€€µ¥¹¥µÕ´€ô€­ÍÑ½É”¹•Ù•¹Ð¹…µ‰É½Í•5¥¹¥µÕµÉ¥Ù•Ìñð€À°(€€€€€½µÁ±•Ñ•½Õ¹Ð€ôÍ•ÅÕ•¹”¹™¥±Ñ•È ¡ ¤€ôø(€€€€€€€…µ‰É½Í•!½±•É••µ•¹Ð¡‘…ä°Ñà¹É½ÕÁ%¹‘•à° ¤¹½µÁ±•Ñ”°(€€€€€€¤¹±•¹Ñ ì(€€€½¹ÍÐÍÑ…ÑÕÍ½È€ô€¡ ¤€ôøì(€€€€€½¹ÍÐ¡•¬€ô…µ‰É½Í•!½±•É••µ•¹Ð¡‘…ä°Ñà¹É½ÕÁ%¹‘•à° ¤ì(€€€€€É•ÑÕÉ¸ €ôôô¡½±”(€€€€€€€€ü€‰ÕÉÉ•¹Ðˆ(€€€€€€€€è¡•¬¹µ¥Íµ…Ñ (€€€€€€€€€€ü€‰µ¥Íµ…Ñ ˆ(€€€€€€€€€€è¡•¬¹½µÁ±•Ñ”(€€€€€€€€€€€€ü€‰½µÁ±•Ñ”ˆ(€€€€€€€€€€€€è€‰ÕÁ½µ¥¹œˆì(€€€ôì(€€€½¹ÍÐÑ•…µÉ½ÍÌ€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôøì(€€€€€½¹ÍÐÙ…±Õ”€ôÍ½É•ÉMÑ½É”¡‘…ä°É½±•Ì¹Í½É•É%¤ü¹mMÑÉ¥¹œ¡¤€¬€Ä¥tü¹Í•±˜ü¹É½ÍÌì(€€€€€É•ÑÕÉ¸Í½É•¹Ñ•É•¡Ù…±Õ”¤€ü€­Ù…±Õ”€è¹Õ±°ì(€€€ô¤ì(€€€½¹ÍÐÉ½ÍÍQ½Ñ…°€ôÑ•…µÉ½ÍÌ¹É•‘Õ” (€€€€€€¡ÍÕ´°Ù…±Õ”¤€ôøÍÕ´€¬€¡Ù…±Õ”€ôô¹Õ±°€ü€À€èÙ…±Õ”¤°(€€€€€€À°(€€€€¤ì(€€€½¹ÍÐÉ½±•1…‰•°€ô€…•‘¥Ñ…‰±”(€€€€€€üY¥•Ý¥¹œ€‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡É½±•Ì¹Í½É•É%°‘…ä¤ü¹¹…µ”ñð€‰Ñ¡”Í½É•Èˆ¥ôÌÑ•…´…É‘€(€€€€€€è¥ÍAÉ¥µ…Éä(€€€€€€€€ü€‰Q4M=IHˆ(€€€€€€€€è€‰Q45I-HƒŠP!-%9Iˆì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰Í½É¥¹A¡½¹”…µ‰É½Í•A¡½¹”ˆø(€€€€€€ñ‘¥Ø±…ÍÌô‰…µ‰É½Í•I½±”ˆøñ‘¥ØøñÍµ…±°ù5	I=Mƒ
ÜQ4€‘íÑà¹É½ÕÁ%¹‘•à€¬€Åôð½Íµ…±°øñ Èø‘íÉ½±•1…‰•±ôð½ Èøð½‘¥ØøñÍÁ…¸ø‘í½µÁ±•Ñ•½Õ¹Ñô¼Äà…É••ð½ÍÁ…¸øð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰¡½±•QÉ…­•Èˆ…É¥„µ±…‰•°ô‰µ‰É½Í”¡½±”ÍÑ…ÑÕÌˆøñ‘¥Ø±…ÍÌô‰¡½±•QÉ…­•É-•äˆøñÍÁ…¸øñ¤±…ÍÌô‰½µÁ±•Ñ”ˆûŠrLð½¤øÉ••ð½ÍÁ…¸øñÍÁ…¸øñ¤±…ÍÌô‰µ¥Íµ…Ñ ˆø„ð½¤ø¡•¬ð½ÍÁ…¸øñÍÁ…¸øñ¤±…ÍÌô‰ÕÉÉ•¹Ðˆøð½¤øÕÉÉ•¹Ðð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰¡½±•QÉ…­•ÉÉ¥ˆø‘íÍ•ÅÕ•¹”¹µ…À ¡ °¤¤€ôøì½¹ÍÐÍÑ…Ñ”€ôÍÑ…ÑÕÍ½È¡ ¤ìÉ•ÑÕÉ¸€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰¡½±•QÉ…¬€‘íÍÑ…Ñ•ôˆ‘…Ñ„µ…µ‰É½Í•¡½±”ôˆ‘í¥ôˆøñˆø‘í¡ôð½ˆø‘íÍÑ…Ñ”€ôôô€‰½µÁ±•Ñ”ˆ€ü€ˆñÍµ…±°ûŠrLð½Íµ…±°øˆ€èÍÑ…Ñ”€ôôô€‰µ¥Íµ…Ñ ˆ€ü€ˆñÍµ…±°ø„ð½Íµ…±°øˆ€è€ˆ‰ôð½‰ÕÑÑ½¸ù€ìô¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½‘¥Øø(€€€€€€‘í…É••µ•¹Ð¹µ¥Íµ…Ñ €ü€œñ‘¥Ø±…ÍÌô‰µ¥Íµ…Ñ¡!½±•±•ÉÐˆøñ‘¥ØøñÍÑÉ½¹œùM½É”½ÈÍ•±•Ñ•‘É¥Ù”‘½•Ì¹½Ð…É•”ð½ÍÑÉ½¹œøñÍÁ…¸ùQ¡”Í½É•È…¹µ…É­•ÈÍ¡½Õ±¡•¬Ñ¡¥Ì¡½±”¸ð½ÍÁ…¸øð½‘¥Øøð½‘¥Øøœ€è€ˆ‰ô(€€€€€€ñ‘¥Ø±…ÍÌô‰¡½±•!•É¼€‘í¹ÑÀ€ü€‰¥Í9ÑÀˆ€è€ˆ‰ôˆøñ‘¥ØøñÍµ…±°ù!=1ð½Íµ…±°øñÍÑÉ½¹œø‘í¡½±•ôð½ÍÑÉ½¹œøð½‘¥Øøñ‘¥ØøñÍµ…±°ùAHð½Íµ…±°øñˆø‘íÁ…Éôð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ù%9`ð½Íµ…±°øñˆø‘í•ÍŒ¡Ø¹¥¹‘•àü¹m¥¹‘•átñð€‹ŠPˆ¥ôð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ø‘í½ÕÉÍ•¥ÍÑ…¹•U¹¥Ð¡Ø¤¹Ñ½UÁÁ•É…Í” ¥ôð½Íµ…±°øñˆø‘íµ•ÑÉ•Íôð½ˆøð½‘¥Øøð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰Í½É•¹ÑÉå…É…µ‰É½Í•M½É•…Éˆøñ‘¥Ø±…ÍÌô‰Í½É•¹ÑÉå!•…ˆøñ‘¥ØøñÍµ…±°ùQ4M=Ið½Íµ…±°øñ Ìø‘í•‘¥Ñ…‰±”€ü•ÍŒ¡•Ù•¹ÑA±…å•È¡Í•±•Ñ•°‘…ä¤ü¹¹…µ”ñð€‰A±…å•Èˆ¤€è€‰I•…½¹±ä‰ôð½ Ìøð½‘¥Øøñ‘¥Ø±…ÍÌô‰Í½É•MÕµµ…Éäˆøñ‘¥Ø±…ÍÌô‰ÉÕ¹¹¥¹M½É”ˆøñÍÁ…¸øñ•´ùÉ½ÍÌð½•´øñˆø‘íÉ½ÍÍQ½Ñ…°ñð€‹ŠP‰ôð½ˆøð½ÍÁ…¸øñÍÁ…¸øñ•´ù!Àð½•´øñˆø‘í¡…¹‘¥…À€ôô¹Õ±°€ü€‹ŠPˆ€è¡…¹‘¥…À¹Ñ½¥á• Ä¥ôð½ˆøð½ÍÁ…¸øñÍÁ…¸Ñ¥Ñ±”ô‰¥¹…°¹•Ð…ÁÁ•…ÉÌ…™Ñ•È…±°€Äà¡½±•Ìˆøñ•´ù¥¹…°9•Ðð½•´øñˆø‘íÑ•…µÉ½ÍÌ¹™¥±Ñ•È ¡à¤€ôøà€„ô¹Õ±°¤¹±•¹Ñ €ôôô€Äà€˜˜¡…¹‘¥…À€„ô¹Õ±°€ü€¡É½ÍÍQ½Ñ…°€´¡…¹‘¥…À¤¹Ñ½¥á• Ä¤€è€‹ŠP‰ôð½ˆøð½ÍÁ…¸øð½‘¥Øøð½‘¥Øøð½‘¥Øø(€€€€€€€€ñ‘¥Ø±…ÍÌô‰…µ‰É½Í•É½ÍÌˆøñÍµ…±°ùMÑÉ½­•ÌÑ…­•¸½¸!½±”€‘í¡½±•ôð½Íµ…±°øñ‘¥Ø±…ÍÌô‰Í½É•MÑ•ÁÁ•È€‘íÍ½É•¹Ñ•É•¡É½ÍÌ¤€ü€‰Í•Ðˆ€è€‰Õ¹Í•Ð‰ôˆøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ¥ô‰…µ‰É½Í•5¥¹ÕÌˆ€‘í•‘¥Ñ…‰±”€ü€ˆˆ€è€‰‘¥Í…‰±•‰ôûŠ"Hð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰ÍÑ•ÁY…±Õ”ˆ¥ô‰…µ‰É½Í•É½ÍÌˆ€‘í•‘¥Ñ…‰±”€ü€ˆˆ€è€‰‘¥Í…‰±•‰ôø‘íÍ½É•¹Ñ•É•¡É½ÍÌ¤€üÉ½ÍÌ€èÁ…Éôð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ¥ô‰…µ‰É½Í•A±ÕÌˆ€‘í•‘¥Ñ…‰±”€ü€ˆˆ€è€‰‘¥Í…‰±•‰ôø¬ð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øø(€€€€€€€€ñ‘¥Ø±…ÍÌô‰…µ‰É½Í•É¥Ù”ˆøñ‘¥Ø±…ÍÌô‰…µ‰É½Í•É¥Ù•!•…‘¥¹œˆøñˆùÉ¥Ù”Ñ…­•¸üð½ˆøñÍµ…±°ùQ…À½ÉÉ•ÐÁ±…å•ÈÑ¼½ÉÉ•Ð…¸•ÉÉ½È¸ð½Íµ…±°øð½‘¥Øøñ‘¥Ø±…ÍÌô‰…µ‰É½Í•É¥Ù•¡½¥•Ìˆø‘íÉ½±•Ì¹Ñ•…´¹µ…À ¡¥¤€ôø€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µ…µ‰É½Í•‘É¥Ù”ôˆ‘í¥‘ôˆ±…ÍÌôˆ‘í‘É¥Ù•%€ôôô¥€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôˆ€‘í•‘¥Ñ…‰±”€ü€ˆˆ€è€‰‘¥Í…‰±•‰ôøñÍÁ…¸ø‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½ÍÁ…¸øñÍµ…±°øñˆø¬ð½ˆøñÍÑÉ½¹œø‘í½Õ¹ÑÍm¥‘tñð€Áôð½ÍÑÉ½¹œøñ•´ù½˜ð½•´øñÍÑÉ½¹œø‘íµ¥¹¥µÕµôð½ÍÑÉ½¹œøð½Íµ…±°øð½‰ÕÑÑ½¸ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½‘¥Øø(€€€€€€ð½‘¥Øø(€€€€€€‘í¹ÑÀ€ü€ñ‘¥Ø±…ÍÌô‰¹ÑÁA±…å…É…µ‰É½Í•9ÑÀˆøñ‘¥Øøñˆù9•…É•ÍÐÑ¡”A¥¸ƒŠP!½±”€‘í¡½±•ôð½ˆø‘í•áÑÉ…9ÑÁA±…å•É%€ü€ñÍÑÉ½¹œ±…ÍÌô‰…µ‰É½Í•áÑÉ…M¡½ÐˆùQ]<M!=QLè€‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡•áÑÉ…9ÑÁA±…å•É%°‘…ä¤ü¹¹…µ”ñð€‰=¹”Á±…å•Èˆ¥ôð½ÍÑÉ½¹œù€€è€ˆ‰ôñÍÁ…¸ø‘í¡½±‘•È€üÕÉÉ•¹Ð¡½±‘•Èè€‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡¡½±‘•È¹¥°‘…ä¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥õ€€è€‰9¼¹…µ”É•½É‘•å•Ð‰ôð½ÍÁ…¸øñÍÑÉ½¹œù]¡¼Í¥¹•Ñ¡”9Q@…Éüð½ÍÑÉ½¹œøð½‘¥Øø‘í¥ÍAÉ¥µ…Éä€ü€ñ‘¥Ø±…ÍÌô‰…µ‰É½Í•9ÑÁ9…µ•Ìˆø‘íÉ½±•Ì¹Ñ•…´¹µ…À ¡¥¤€ôø€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µ…µ‰É½Í•¹ÑÀôˆ‘í¥‘ôˆ±…ÍÌôˆ‘íMÑÉ¥¹œ¡É•½É¹¹ÑÀü¹•¹ÑÉ…¹Ñ%ñð€ˆˆ¤€ôôô¥€˜˜É•½É¹¹ÑÀü¹½¹™¥Éµ•‘Ð€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôˆø‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½‰ÕÑÑ½¸ù€¤¹©½¥¸ ˆˆ¥ô‘íÉ•½É¹¹ÑÀü¹½¹™¥Éµ•‘Ð€ü€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Í½™Ðˆ¥ô‰Õ¹‘½µ‰É½Í•9ÑÀˆùU¹‘¼ð½‰ÕÑÑ½¸øñÍµ…±°ùI•½É‘•€‘í¹•Ü…Ñ”¡É•½É¹¹ÑÀ¹½¹™¥Éµ•‘Ð¤¹Ñ½1½…±•Q¥µ•MÑÉ¥¹œ ‰•¸µTˆ°ì¡½ÕÈè€‰¹Õµ•É¥Œˆ°µ¥¹ÕÑ”è€ˆÈµ‘¥¥Ðˆô¥ôð½Íµ…±°ù€€è€ˆ‰ôð½‘¥Øù€€è€ˆñÍµ…±°ùQ¡”Ñ•…´Í½É•ÈÉ•½É‘ÌÑ¡”9Q@…É•¹ÑÉä¸ð½Íµ…±°ø‰ôð½‘¥Øù€€è€ˆ‰ô(€€€€€€ñ‘¥Ø±…ÍÌô‰¡½±•9…Øˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰ÁÉ•Ù!½±”ˆ€‘íÁ½Í¥Ñ¥½¸€ôôô€À€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôûŠ@AÉ•Ù¥½ÕÌð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰¹•áÑ!½±”ˆø‘íÁ½Í¥Ñ¥½¸€ôôô€ÄÜ€ü€‰%9%M Q4Iˆ€è€‰9•áÐ!½±”ƒŠH‰ôð½‰ÕÑÑ½¸øð½‘¥Øø(€€€€ð½‘¥Øù€ì(€€€½¹ÍÐÍ¡½Ýµ‰É½Í•M…Ù•…¥±ÕÉ”€ô€ ¤€ôøì(€€€€€Í•Ñ±½Õ‘5•ÍÍ…” ‰M½É”¹½ÐÍ…Ù•ƒŠPÁ±•…Í”ÑÉä……¥¸¸ˆ¤ì(€€€€€½¹ÍÐ‰ÕÑÑ½¸€ô€ ˆ¹•áÑ!½±”ˆ¤ì(€€€€€¥˜€¡‰ÕÑÑ½¸¤‰ÕÑÑ½¸¹‘¥Í…‰±•€ô™…±Í”ì(€€€ôì(€€€½¹ÍÐÉ•ÍÑ½É•I•½É€ô€¡Í¹…ÁÍ¡½Ð¤€ôøì(€€€€€=‰©•Ð¹­•åÌ¡É•½É¤¹™½É…  ¡­•ä¤€ôø‘•±•Ñ”É•½É‘m­•åt¤ì(€€€€€=‰©•Ð¹…ÍÍ¥¸¡É•½É°Í¹…ÁÍ¡½Ð¤ì(€€€ôì(€€€½¹ÍÐÕÁ‘…Ñ”€ô€¡¹•áÑÉ½ÍÌ€ôÉ½ÍÌ°¹•áÑÉ¥Ù”€ô‘É¥Ù•%¤€ôøì(€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ô)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡É•½É¤¤°(€€€€€€€ÁÉ•Ù¥½ÕÍ5•Ñ„€ô)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡Í½É•ÉMÑ½É”¡‘…ä°•¹ÑÉåM½É•É%¤¹}µ•Ñ„ñðíô¤¤ì(€€€€€É•½É¹Í•±˜€ôÉ•½É¹Í•±˜ñðíôì(€€€€€É•½É¹Í•±˜¹Á±…å•É%€ô•¹ÑÉåM½É•É%ì(€€€€€É•½É¹Í•±˜¹É½ÍÌ€ô¹•áÑÉ½ÍÌì(€€€€€É•½É¹…µ‰É½Í”¹‘É¥Ù•A±…å•É%€ô¹•áÑÉ¥Ù”ì(€€€€€½¹ÍÐ•¹ÑÉåI½Õ¹€ôÍ½É•ÉMÑ½É”¡‘…ä°•¹ÑÉåM½É•É%¤ì(€€€€€¥˜€¡•¹ÑÉåI½Õ¹¹}µ•Ñ„ü¹™¥¹…±¥Í•‘Ð¤‘•±•Ñ”•¹ÑÉåI½Õ¹¹}µ•Ñ„¹™¥¹…±¥Í•‘Ðì(€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€É•ÍÑ½É•I•½É¡ÁÉ•Ù¥½ÕÌ¤ì(€€€€€€€•¹ÑÉåI½Õ¹¹}µ•Ñ„€ôÁÉ•Ù¥½ÕÍ5•Ñ„ì(€€€€€€€Í¡½Ýµ‰É½Í•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€É•ÑÕÉ¸™…±Í”ì(€€€€€ô(€€€€€ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°•¹ÑÉåM½É•É%¤ì(€€€€€É•¹‘•Éµ‰É½Í•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€€€É•ÑÕÉ¸ÑÉÕ”ì(€€€ôì(€€€¥˜€  ˆ…µ‰É½Í•5¥¹ÕÌˆ¤¤€ ˆ…µ‰É½Í•5¥¹ÕÌˆ¤¹½¹±¥¬€ô€ ¤€ôøÕÁ‘…Ñ”¡5…Ñ ¹µ…à Ä°€¡Í½É•¹Ñ•É•¡É½ÍÌ¤€ü€­É½ÍÌ€èÁ…È¤€´€Ä¤¤ì(€€€¥˜€  ˆ…µ‰É½Í•A±ÕÌˆ¤¤€ ˆ…µ‰É½Í•A±ÕÌˆ¤¹½¹±¥¬€ô€ ¤€ôøÕÁ‘…Ñ”¡5…Ñ ¹µ¥¸ ÌÀ°€¡Í½É•¹Ñ•É•¡É½ÍÌ¤€ü€­É½ÍÌ€èÁ…È¤€¬€Ä¤¤ì(€€€¥˜€  ˆ…µ‰É½Í•É½ÍÌˆ¤¤€ ˆ…µ‰É½Í•É½ÍÌˆ¤¹½¹±¥¬€ô€ ¤€ôøì¥˜€ …Í½É•¹Ñ•É•¡É½ÍÌ¤¤ÕÁ‘…Ñ”¡Á…È¤ìôì(€€€€ m‘…Ñ„µ…µ‰É½Í•‘É¥Ù•tœ¤¹™½É…  ¡‰ÕÑÑ½¸¤€ôø‰ÕÑÑ½¸¹½¹±¥¬€ô€ ¤€ôøÕÁ‘…Ñ”¡É½ÍÌ°‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹…µ‰É½Í•‘É¥Ù”¤¤ì(€€€½¹ÍÐÕÉÉ•¹Ñ¹ÑÉå½µÁ±•Ñ”€ô€ ¤€ôø(€€€€€€…•‘¥Ñ…‰±”ñð€¡Í½É•¹Ñ•É•¡É•½É¹Í•±˜ü¹É½ÍÌ¤€˜˜	½½±•…¸¡É•½É¹…µ‰É½Í”ü¹‘É¥Ù•A±…å•É%¤¤ì(€€€½¹ÍÐÝ…É¹%¹½µÁ±•Ñ•¹ÑÉä€ô€ ¤€ôøì(€€€€€¥˜€¡ÕÉÉ•¹Ñ¹ÑÉå½µÁ±•Ñ” ¤¤É•ÑÕÉ¸™…±Í”ì(€€€€€½¹ÍÐµ¥ÍÍ¥¹œ€ôl(€€€€€€€€…Í½É•¹Ñ•É•¡É•½É¹Í•±˜ü¹É½ÍÌ¤€ü€‰Ñ¡”Ñ•…´Í½É”ˆ€è€ˆˆ°(€€€€€€€€…É•½É¹…µ‰É½Í”ü¹‘É¥Ù•A±…å•É%€ü€‰Ý¡½Í”‘É¥Ù”Ý…ÌÍ•±•Ñ•ˆ€è€ˆˆ°(€€€€€t¹™¥±Ñ•È¡	½½±•…¸¤¹©½¥¸ ˆ…¹€ˆ¤ì(€€€€€…±•ÉÐ¡!½±”€‘í¡½±•ô¥Ì¥¹½µÁ±•Ñ”¸A±•…Í”•¹Ñ•È€‘íµ¥ÍÍ¥¹ô‰•™½É”µ½Ù¥¹œ½¸¹€¤ì(€€€€€É•ÑÕÉ¸ÑÉÕ”ì(€€€ôì(€€€€ m‘…Ñ„µ…µ‰É½Í•¡½±•tœ¤¹™½É…  ¡‰ÕÑÑ½¸¤€ôø‰ÕÑÑ½¸¹½¹±¥¬€ô€ ¤€ôøì(€€€€€½¹ÍÐÑ…É•ÑA½Í¥Ñ¥½¸€ô€­‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹…µ‰É½Í•¡½±”ì(€€€€€¥˜€¡Ñ…É•ÑA½Í¥Ñ¥½¸€øÁ½Í¥Ñ¥½¸€˜˜Ý…É¹%¹½µÁ±•Ñ•¹ÑÉä ¤¤É•ÑÕÉ¸ì(€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ìì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÑ…É•ÑA½Í¥Ñ¥½¸ì(€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÁÉ•Ù¥½ÕÌì(€€€€€€€Í¡½Ýµ‰É½Í•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€É•¹‘•Éµ‰É½Í•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€ô¤ì(€€€€ m‘…Ñ„µ…µ‰É½Í•¹ÑÁtœ¤¹™½É…  ¡‰ÕÑÑ½¸¤€ôø‰ÕÑÑ½¸¹½¹±¥¬€ô€ ¤€ôøì(€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ô)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡É•½É¹¹ÑÀñðíô¤¤ì(€€€€€É•½É¹¹ÑÀ€ôì•¹ÑÉ…¹Ñ%è‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹…µ‰É½Í•¹ÑÀ°½¹™¥Éµ•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°±½­•è™…±Í”ôì(€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ìÉ•½É¹¹ÑÀ€ôÁÉ•Ù¥½ÕÌìÍ¡½Ýµ‰É½Í•M…Ù•…¥±ÕÉ” ¤ìÉ•ÑÕÉ¸ìô(€€€€€ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°É½±•Ì¹Í½É•É%¤ìÉ•¹‘•Éµ‰É½Í•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€ô¤ì(€€€¥˜€  ˆÕ¹‘½µ‰É½Í•9ÑÀˆ¤¤€ ˆÕ¹‘½µ‰É½Í•9ÑÀˆ¤¹½¹±¥¬€ô€ ¤€ôøì½¹ÍÐÁÉ•Ù¥½ÕÌ€ô)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡É•½É¹¹ÑÀñðíô¤¤ìÉ•½É¹¹ÑÀ€ôíôì¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ìÉ•½É¹¹ÑÀ€ôÁÉ•Ù¥½ÕÌìÍ¡½Ýµ‰É½Í•M…Ù•…¥±ÕÉ” ¤ìÉ•ÑÕÉ¸ìôÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°É½±•Ì¹Í½É•É%¤ìÉ•¹‘•Éµ‰É½Í•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ìôì(€€€€ ˆÁÉ•Ù!½±”ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ìì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ô5…Ñ ¹µ…à À°Á½Í¥Ñ¥½¸€´€Ä¤ì(€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ìÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÁÉ•Ù¥½ÕÌìÍ¡½Ýµ‰É½Í•M…Ù•…¥±ÕÉ” ¤ìÉ•ÑÕÉ¸ìô(€€€€€É•¹‘•Éµ‰É½Í•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€ôì(€€€€ ˆ¹•áÑ!½±”ˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€¥˜€¡Ý…É¹%¹½µÁ±•Ñ•¹ÑÉä ¤¤É•ÑÕÉ¸ì(€€€€€¥˜€¡Á½Í¥Ñ¥½¸€ð€ÄÜ¤ì(€€€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ìì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÁ½Í¥Ñ¥½¸€¬€Äì(€€€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ìÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÁÉ•Ù¥½ÕÌìÍ¡½Ýµ‰É½Í•M…Ù•…¥±ÕÉ” ¤ìÉ•ÑÕÉ¸ìô(€€€€€€€¥˜€¡•‘¥Ñ…‰±”¤ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°•¹ÑÉåM½É•É%¤ì(€€€€€€€É•ÑÕÉ¸É•¹‘•Éµ‰É½Í•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€€€ô(€€€€€¥˜€ …•‘¥Ñ…‰±”¤É•ÑÕÉ¸…±•ÉÐ ‰=¹±äÑ¡”Ñ•…´Í½É•È½È¡•­¥¹œµ…É­•È…¸½µÁ±•Ñ”Ñ¡”µ‰É½Í”Ñ•…´…É¸ˆ¤ì(€€€€€¥˜€ ……µ‰É½Í•Q•…µ½µÁ±•Ñ”¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤¤É•ÑÕÉ¸…±•ÉÐ ‰Q¡”Ñ•…´…É…¹¹½Ð‰”½µÁ±•Ñ•å•Ð¸Ù•Éä¡½±”¹••‘Ì„Ñ•…´Í½É”…¹Í•±•Ñ•‘É¥Ù”ˆ€¬€¡É½±•Ì¹µ…É­•É%€ü€ˆ°…¹‰½Ñ …É‘ÌµÕÍÐ…É•”¸ˆ€è€ˆ¸ˆ¤¤ì(€€€€€½¹ÍÐÍ¡½ÉÐ€ô=‰©•Ð¹•¹ÑÉ¥•Ì¡½Õ¹ÑÌ¤¹™¥±Ñ•È ¡l°½Õ¹Ñt¤€ôø½Õ¹Ð€ðµ¥¹¥µÕ´¤ì(€€€€€¥˜€¡Í¡½ÉÐ¹±•¹Ñ €˜˜€…½¹™¥É´¡IEU%II%YL9=PI=Iq¹q¸‘íÍ¡½ÉÐ¹µ…À ¡m¥°½Õ¹Ñt¤€ôø€‘í•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€‰A±…å•È‰ôè€‘í½Õ¹Ñô½˜€‘íµ¥¹¥µÕµô‘É¥Ù•Í€¤¹©½¥¸ ‰q¸ˆ¥õq¹q¹MÕ‰µ¥ÐÑ¡¥Ì…É…Ì¹½¸µ½µÁ±¥…¹Ð…¹•á±Õ‘”Ñ¡”Ñ•…´™É½´Ñ¡”µ‰É½Í”É•ÍÕ±Ðý€¤¤É•ÑÕÉ¸ì(€€€€€½¹ÍÐ…Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€½¹ÍÐÁÉ•Ù¥½ÕÍ¥¹…±¥Í•€ô)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•ñðíô¤¤°(€€€€€€€ÁÉ•Ù¥½ÕÍ5½‘”€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”°(€€€€€€€…™™•Ñ•‘I½Õ¹‘Ì€ômÉ½±•Ì¹Í½É•É%°É½±•Ì¹µ…É­•É%‘t¹™¥±Ñ•È¡	½½±•…¸¤¹µ…À ¡¥¤€ôø€¡ì(€€€€€€€€€¥°(€€€€€€€€€µ•Ñ„è)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡Í½É•ÉMÑ½É”¡‘…ä°¥¤¹}µ•Ñ„ñðíô¤¤°(€€€€€€€ô¤¤ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•€ôÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•ñðíôì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åtñðôíôì(€€€€€É½±•Ì¹Ñ•…´¹™½É…  ¡¥¤€ôøÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åum¥‘t€ô…Ð¤ì(€€€€€mÉ½±•Ì¹Í½É•É%°É½±•Ì¹µ…É­•É%‘t¹™¥±Ñ•È¡	½½±•…¸¤¹™½É…  ¡¥¤€ôøì½¹ÍÐÉ½Õ¹€ôÍ½É•ÉMÑ½É”¡‘…ä°¥¤ìÉ½Õ¹¹}µ•Ñ„€ôì€¸¸¸¡É½Õ¹¹}µ•Ñ„ñðíô¤°™¥¹…±¥Í•‘Ðè…Ð°…µ‰É½Í•Q•…´èÑà¹É½ÕÁ%¹‘•à°…µ‰É½Í•É¥Ù•½µÁ±¥…¹Ðè€…Í¡½ÉÐ¹±•¹Ñ ôìô¤ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰½µÁ±•Ñ•ˆì(€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•€ôÁÉ•Ù¥½ÕÍ¥¹…±¥Í•ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôÁÉ•Ù¥½ÕÍ5½‘”ì(€€€€€€€…™™•Ñ•‘I½Õ¹‘Ì¹™½É…  ¡ì¥°µ•Ñ„ô¤€ôøìÍ½É•ÉMÑ½É”¡‘…ä°¥¤¹}µ•Ñ„€ôµ•Ñ„ìô¤ì(€€€€€€€Í¡½Ýµ‰É½Í•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€mÉ½±•Ì¹Í½É•É%°É½±•Ì¹µ…É­•É%‘t¹™¥±Ñ•È¡	½½±•…¸¤¹™½É…  ¡¥¤€ôøÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°¥¤¤ì(€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õü¹•Ù•¹Ñ%¤…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ìÉ•¹‘•É!½µ” ¤ì(€€€ôì(€€€•¹…‰±•!½±•MÝ¥Á”  ˆ¹Í½É¥¹A¡½¹”ˆ¤¤ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•Éµ‰É½Í•½µÁ±•Ñ•¡Í•±•Ñ•°‘…ä¤ì(€€€½¹ÍÐ¡½ÍÐ€ô€ ˆÁ±…å•ÉáÁ•É¥•¹”ˆ¤°(€€€€€Ñà€ôÁ±…å•ÉÉ½ÕÁ½¹Ñ•áÐ¡Í•±•Ñ•°‘…ä¤ì(€€€¥˜€ …Ñà¤É•ÑÕÉ¸É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€½¹ÍÐÉ½±•Ì€ô…µ‰É½Í•I½±•Ì¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤°(€€€€€¡…¹‘¥…À€ô…µ‰É½Í•Q•…µ!…¹‘¥…À¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤°(€€€€€¡½±•Ì€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôøì(€€€€€€€½¹ÍÐÙ…±Õ”€ôÍ½É•ÉMÑ½É”¡‘…ä°É½±•Ì¹Í½É•É%¤ü¹mMÑÉ¥¹œ¡¥¹‘•à€¬€Ä¥tü¹Í•±˜ü¹É½ÍÌì(€€€€€€€É•ÑÕÉ¸Í½É•¹Ñ•É•¡Ù…±Õ”¤€ü€­Ù…±Õ”€è¹Õ±°ì(€€€€€ô¤°(€€€€€É½ÍÌ€ô±•…‘•ÉMÕ´¡¡½±•Ì¤°(€€€€€½Õ¹ÑÌ€ô…µ‰É½Í•É¥Ù•½Õ¹ÑÌ¡‘…ä°Ñà¹É½ÕÁ%¹‘•à°É½±•Ì¹Í½É•É%¤°(€€€€€µ¥¹¥µÕ´€ô€­ÍÑ½É”¹•Ù•¹Ð¹…µ‰É½Í•5¥¹¥µÕµÉ¥Ù•Ìñð€À°(€€€€€½µÁ±¥…¹Ð€ôÉ½±•Ì¹Ñ•…´¹•Ù•Éä ¡¥¤€ôø€¡½Õ¹ÑÍm¥‘tñð€À¤€øôµ¥¹¥µÕ´¤ì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰½µÁ±•Ñ•‘…É…µ‰É½Í•½µÁ±•Ñ•€‘í½µÁ±¥…¹Ð€ü€ˆˆ€è€‰…µ‰É½Í•9½¹½µÁ±¥…¹Ð‰ôˆøñ‘¥Ø±…ÍÌô‰É½Õ¹‘Q½Àˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰‰…­É½µµ‰É½Í•½µÁ±•Ñ”ˆûŠ@	…¬ð½‰ÕÑÑ½¸øñ‘¥Øøñ Èùµ‰É½Í”Q•…´…ÉMÕ‰µ¥ÑÑ•ð½ ÈøñÀùQ•…´€‘íÑà¹É½ÕÁ%¹‘•à€¬€Åô‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä€ü€ˆˆ€è€ƒ
Ü…ä€‘í‘…åõôð½Àøð½‘¥Øøð½‘¥Øø‘í½µÁ±¥…¹Ð€ü€ˆˆ€è€œñ‘¥Ø±…ÍÌô‰…µ‰É½Í•½µÁ±¥…¹•MÑ…µÀˆùIEU%II%YL9=PI=Ið½‘¥Øøôñ‘¥Ø±…ÍÌô‰…µ‰É½Í•¥¹…±M½É”ˆøñÍÁ…¸øñÍµ…±°ùI=MLð½Íµ…±°øñÍÑÉ½¹œø‘íÉ½ÍÍôð½ÍÑÉ½¹œøð½ÍÁ…¸øñÍÁ…¸øñÍµ…±°ù!9%@ð½Íµ…±°øñÍÑÉ½¹œø‘í¡…¹‘¥…À€ôô¹Õ±°€ü€‹ŠPˆ€è¡…¹‘¥…À¹Ñ½¥á• Ä¥ôð½ÍÑÉ½¹œøð½ÍÁ…¸øñÍÁ…¸øñÍµ…±°ù9Pð½Íµ…±°øñÍÑÉ½¹œø‘í¡…¹‘¥…À€ôô¹Õ±°€ü€‹ŠPˆ€è€¡É½ÍÌ€´¡…¹‘¥…À¤¹Ñ½¥á• Ä¥ôð½ÍÑÉ½¹œøð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰…µ‰É½Í•É¥Ù•MÕµµ…Éäˆøñˆù•ÁÑ•‘É¥Ù•ÌƒŠP€‘í½µÁ±¥…¹Ð€ü€‰µ¥¹¥µÕ´Í…Ñ¥Í™¥•ƒŠrLˆ€è€‰µ¥¹¥µÕ´¹½ÐÍ…Ñ¥Í™¥•‰ôð½ˆø‘íÉ½±•Ì¹Ñ•…´¹µ…À ¡¥¤€ôø€ñÍÁ…¸±…ÍÌôˆ‘ì¡½Õ¹ÑÍm¥‘tñð€À¤€øôµ¥¹¥µÕ´€ü€‰É•…‘äˆ€è€‰Í¡½ÉÐ‰ôˆøñ•´ø‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôèð½•´øñÍÑÉ½¹œø‘í½Õ¹ÑÍm¥‘tñð€Áô€ñÍµ…±°ù½˜€‘íµ¥¹¥µÕµôð½Íµ…±°øð½ÍÑÉ½¹œøð½ÍÁ…¸ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøñ‘¥Ø±…ÍÌô‰…ÉˆøñÀùQ¡”Ñ•…´Í½É”…¹Í•±•Ñ•‘É¥Ù•Ì¡…Ù”‰••¸ÍÕ‰µ¥ÑÑ•‘íÉ½±•Ì¹µ…É­•É%€ü€ˆ…¹Ñ¡”Í½É•È…¹µ…É­•È…É‘Ì…É•”ˆ€è€ˆ‰ô¸€‘í½µÁ±¥…¹Ð€ü€‰Q¡”Ñ•…´¥Ì•±¥¥‰±”™½ÈÑ¡”µ‰É½Í”É•ÍÕ±Ð¸ˆ€è€‰Q¡”½É…¹¥Í•È¡…ÌÉ••¥Ù•Ñ¡”…É°‰ÕÐÑ¡”Ñ•…´¥Ì•á±Õ‘•™É½´Ñ¡”µ‰É½Í”É•ÍÕ±Ð¸‰ôð½Àøð½‘¥Øøð½‘¥Øù€ì(€€€€ ˆ‰…­É½µµ‰É½Í•½µÁ±•Ñ”ˆ¤¹½¹±¥¬€ô€ ¤€ôøìÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•ÜˆìÍ…Ù” ¤ìÉ•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ìôì(€ô(€™Õ¹Ñ¥½¸Í½É•¹ÑÉå½¹ÑÉ½±Ì¡ÁÕÑÑ¥¹=¸°Í•Ñ¥½¸°•¹ÑÉä°Á…È°ÍÑ•ÁÁ•È°Á¥­ÕÀ¤ì(€€€½¹ÍÐÉ½ÍÌ€ôÍÑ•ÁÁ•È¡Í•Ñ¥½¸€¬€‰É½ÍÌˆ°€‰M½É”ˆ°•¹ÑÉä¹É½ÍÌ°Á…Èñð€Ð°€Ä°€ÈÀ¤ì(€€€¥˜€¡ÁÕÑÑ¥¹=¸¤(€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰Í½É•MÑ•ÁÁ•ÉÌˆø‘íÉ½ÍÍô‘íÍÑ•ÁÁ•È¡Í•Ñ¥½¸€¬€‰AÕÑÑÌˆ°€‰AÕÑÑÌˆ°•¹ÑÉä¹ÁÕÑÑÌ°€È°€À°€ä¥ôð½‘¥Øø‘íÁ¥­ÕÀ¡Í•Ñ¥½¸€¬€‰É½ÍÌˆ°•¹ÑÉä¹É½ÍÌ¥õ€ì(€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰Í½É•MÑ•ÁÁ•ÉÌ¹½AÕÑÑ¥¹œˆø‘íÉ½ÍÍôñ‘¥Ø±…ÍÌô‰Í½É•MÑ•ÁÁ•É]É…ÀÁ¥­ÕÁ½¹ÑÉ½°ˆøñÍµ…±°ùA¥¬µÕÀð½Íµ…±°ø‘íÁ¥­ÕÀ¡Í•Ñ¥½¸€¬€‰É½ÍÌˆ°•¹ÑÉä¹É½ÍÌ°ÑÉÕ”¥ôð½‘¥Øøð½‘¥Øù€ì(€ô(€™Õ¹Ñ¥½¸Í½É•¹ÑÉ¥•Í5¥Íµ…Ñ ¡‘…ä°Á±…å•É%°¡½±”°±•™Ð°É¥¡Ð°ÁÕÑÑÍI•ÅÕ¥É•¤ì(€€€¥˜€ …Í½É•¹Ñ•É•¡±•™Ðü¹É½ÍÌ¤ñð€…Í½É•¹Ñ•É•¡É¥¡Ðü¹É½ÍÌ¤¤É•ÑÕÉ¸™…±Í”ì(€€€¥˜€¡ÁÕÑÑÍI•ÅÕ¥É•€˜˜€ …Í½É•¹Ñ•É•¡±•™Ðü¹ÁÕÑÑÌ¤ñð€…Í½É•¹Ñ•É•¡É¥¡Ðü¹ÁÕÑÑÌ¤¤¤É•ÑÕÉ¸™…±Í”ì(€€€É•ÑÕÉ¸€…É½ÍÍM½É•ÍÉ•”¡‘…ä°Á±…å•É%°¡½±”°±•™Ð¹É½ÍÌ°É¥¡Ð¹É½ÍÌ¤ñð(€€€€€€¡ÁÕÑÑÍI•ÅÕ¥É•€˜˜9Õµ‰•È¡±•™Ð¹ÁÕÑÑÌ¤€„ôô9Õµ‰•È¡É¥¡Ð¹ÁÕÑÑÌ¤¤ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€É•ÅÕ•ÍÑI½Õ¹‘]…­•1½¬ ¤ì(€€€½¹ÍÐ¡½ÍÐ€ô€ ˆÁ±…å•ÉáÁ•É¥•¹”ˆ¤°(€€€€€À€ô•Ù•¹ÑA±…å•È¡Í•±•Ñ•±‘…ä¤°(€€€€€Ñà€ôÁ±…å•ÉÉ½ÕÁ½¹Ñ•áÐ¡Í•±•Ñ•°‘…ä¤ì(€€€¥˜€ …Àñð€…Ñà¤É•ÑÕÉ¸É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€½¹ÍÐÍ•ÑÕÀ€ôÑà¹Í•ÑÕÀ°(€€€€€Œ€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤°(€€€€€Ø€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Í•±•Ñ•¤°(€€€€€ÍÑ…ÉÐ€ôÉ½ÕÁMÑ…ÉÑ¥¹!½±”¡ÍÑ½É”¹•Ù•¹Ð°‘…ä°Ñà¹É½ÕÁ%¹‘•à¤°(€€€€€Í•Ä€ôÍ½É•M•ÅÕ•¹”¡ÍÑ…ÉÐ¤ì(€€€±•ÐÁ½Ì€ô5…Ñ ¹µ…à À°5…Ñ ¹µ¥¸ ÄÜ°ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ìñð€À¤¤°(€€€€€¡½±”€ôÍ•ÅmÁ½Ít°(€€€€€¥‘à€ô¡½±”€´€Ä°(€€€€€É•Œ€ôÍ½É•I•½É¡‘…ä°Í•±•Ñ•°¡½±”¤°(€€€€€Ñ…É•Ñ%€ôµ…É­•ÉQ…É•Ñ½È¡Í•±•Ñ•°‘…ä¤°(€€€€€Ñ…É•Ñ…É€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Ñ…É•Ñ%¤°(€€€€€Ñ…É•Ð€ô•Ù•¹ÑA±…å•È¡Ñ…É•Ñ%±‘…ä¤°(€€€€€¡ÁM•±˜€ôÁ±…å•É…¥±å!…¹‘¥…À¡Í•±•Ñ•°‘…ä¤°(€€€€€¡ÁQ…É•Ð€ôÁ±…å•É…¥±å!…¹‘¥…À¡Ñ…É•Ñ%°‘…ä¤ì(€€€É•Œ¹½™™¥¥…°¹Á±…å•É%€ôÑ…É•Ñ%ì(€€€É•Œ¹Í•±˜¹Á±…å•É%€ôÍ•±•Ñ•ì(€€€½¹ÍÐÁ…È€ô€­Ø¹Á…Èü¹m¥‘átñð€ˆˆ°(€€€€€¥¹‘•áY…°€ôØ¹¥¹‘•àü¹m¥‘át€üü€ˆˆ°(€€€€€µ•ÑÉ•Ì€ô½ÕÉÍ•!½±•¥ÍÑ…¹”¡Ø°¥‘à¤ñð€ˆˆì(€€€½¹ÍÐ¹ÑÀ€ô¹ÑÁ!½±•Í½È¡‘…ä¤¹¥¹±Õ‘•Ì¡¡½±”¤°(€€€€€¡½±‘•È€ôÕÉÉ•¹Ñ9ÑÁ!½±‘•È¡‘…ä°¡½±”¤°(€€€€€¡½±‘•É9…µ”€ô¡½±‘•È€ü•Ù•¹ÑA±…å•È¡¡½±‘•È¹¥°‘…ä¤ü¹¹…µ”€è€ˆˆ°(€€€€€¹ÑÁMÑ…Ñ”€ô¹ÑÀ€ü¹ÑÁ)…­Á½ÑMÑ…Ñ”¡‘…ä°¡½±”¤€è¹Õ±°°(€€€€€¹ÑÁAÉ¥é”€ô¹ÑÀ€ü¹ÑÁAÉ¥é•Q•áÐ¡‘…ä°¡½±”¤€è€ˆˆ°(€€€€€¹ÑÁAÉ¥é•MÑ…ÑÕÌ€ô¹ÑÁAÉ¥é”(€€€€€€€€ü€‘í¹ÑÁAÉ¥é•ô‘í¹ÑÁMÑ…Ñ”ü¹…ÉÉ¥•€ü€€ ‘í¹ÑÁMÑ…Ñ”¹‰…Í•ô€¬€‘í¹ÑÁMÑ…Ñ”¹…ÉÉ¥•‘ô©…­Á½Ð¥€€è€ˆ‰õ€(€€€€€€€€è€ˆˆì(€€€½¹ÍÐÑ…É•Ñ!½±•%¹™¼õ•Ù•¹Ñ½ÕÉÍ•…Ñ•½Éä¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Í•±•Ñ•¤„ôõ•Ù•¹Ñ½ÕÉÍ•…Ñ•½Éä¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Ñ…É•Ñ%¤ý€ñÀ±…ÍÌô‰Í½É¥¹…Ñ•½Éå%¹™¼ˆø‘í•ÍŒ¡Ñ…É•Ðü¹¹…µ•ñð‰5…É­•Á±…å•Èˆ¥ôƒ
Ü€‘í•Ù•¹Ñ½ÕÉÍ•…Ñ•½Éä¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Ñ…É•Ñ%¤ôôô‰Ý½µ•¸ˆü‰]½µ•¸ˆè‰5•¸‰ôƒ
ÜA…È€‘íÑ…É•Ñ…É¹Á…Èü¹m¥‘áuñð‹ŠP‰ôƒ
Ü%¹‘•à€‘í•ÍŒ¡Ñ…É•Ñ…É¹¥¹‘•àü¹m¥‘áuñð‹ŠPˆ¥ôƒ
Ü€‘í½ÕÉÍ•!½±•¥ÍÑ…¹”¡Ñ…É•Ñ…É±¥‘à¥ñð‹ŠP‰ô€‘í½ÕÉÍ•¥ÍÑ…¹•‰‰É•Ø¡Ñ…É•Ñ…É¥ôð½Àù€èˆˆì(€€€½¹ÍÐÍ™=™˜€ôÍÑ…‰±•™½É‘A½¥¹ÑÌ (€€€€€€€É•Œ¹½™™¥¥…°¹É½ÍÌ°(€€€€€€€€­Ñ…É•Ñ…É¹Á…Èü¹m¥‘áuñðÀ°(€€€€€€€Ñ…É•Ñ…É¹¥¹‘•àü¹m¥‘átüüˆˆ°(€€€€€€€¡ÁQ…É•Ð°(€€€€€€¤°(€€€€€Í™M•±˜€ôÍÑ…‰±•™½É‘A½¥¹ÑÌ¡É•Œ¹Í•±˜¹É½ÍÌ°Á…È°¥¹‘•áY…°°¡ÁM•±˜¤ì(€€€½¹ÍÐÁ±…å•‘!½±•Ì€ôÍ•Ä¹Í±¥” À°Á½Ì€¬€Ä¤°(€€€€€É½Õ¹€ôÍ½É•ÉMÑ½É”¡‘…ä°Í•±•Ñ•¤ì(€€€½¹ÍÐÉÕ¹¹¥¹œ€ô€¡Í•Ñ¥½¸°¡À°Á±…å•É%¤€ôø(€€€€€Á±…å•‘!½±•Ì¹É•‘Õ” (€€€€€€€€¡Ñ½Ñ…°° ¤€ôøì(€€€€€€€€€½¹ÍÐ¥Ñ•´€ôÉ½Õ¹‘mMÑÉ¥¹œ¡ ¥tü¹mÍ•Ñ¥½¹tñðíôì(€€€€€€€€€¥˜€ (€€€€€€€€€€€Í•Ñ¥½¸€ôôô€‰½™™¥¥…°ˆ€˜˜(€€€€€€€€€€€MÑÉ¥¹œ¡¥Ñ•´¹Á±…å•É%ñð€ˆˆ¤€„ôôMÑÉ¥¹œ¡Á±…å•É%ñð€ˆˆ¤(€€€€€€€€€€¤(€€€€€€€€€€€É•ÑÕÉ¸Ñ½Ñ…°ì(€€€€€€€€€½¹ÍÐ¤€ô €´€Ä±…Éõ•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Á±…å•É%¤°(€€€€€€€€€€€ÁÑÌ€ôÍÑ…‰±•™½É‘A½¥¹ÑÌ (€€€€€€€€€€€€€¥Ñ•´¹É½ÍÌ°(€€€€€€€€€€€€€€¬¡…É¹Á…Èü¹m¥tñð€À¤°(€€€€€€€€€€€€€…É¹¥¹‘•àü¹m¥t€üü€ˆˆ°(€€€€€€€€€€€€€¡À°(€€€€€€€€€€€€¤°(€€€€€€€€€€€ÁÕÑÑÌ€ô(€€€€€€€€€€€€€¥Ñ•´¹ÁÕÑÑÌ€ôôô€ˆˆñð¥Ñ•´¹ÁÕÑÑÌ€ôô¹Õ±°€ü€À€è€­¥Ñ•´¹ÁÕÑÑÌñð€Àì(€€€€€€€€€Ñ½Ñ…°¹Á½¥¹ÑÌ€¬ôÁÑÌ€ôô¹Õ±°€ü€À€èÁÑÌì(€€€€€€€€€Ñ½Ñ…°¹ÁÕÑÑÌ€¬ôÁÕÑÑÌì(€€€€€€€€€É•ÑÕÉ¸Ñ½Ñ…°ì(€€€€€€€ô°(€€€€€€€ìÁ½¥¹ÑÌè€À°ÁÕÑÑÌè€Àô°(€€€€€€¤ì(€€€½¹ÍÐÑ½Ñ…±=™˜€ôÉÕ¹¹¥¹œ ‰½™™¥¥…°ˆ°¡ÁQ…É•Ð°Ñ…É•Ñ%¤°(€€€€€Ñ½Ñ…±M•±˜€ôÉÕ¹¹¥¹œ ‰Í•±˜ˆ°¡ÁM•±˜°Í•±•Ñ•¤ì(€€€½¹ÍÐ•±•Ñ¥É½ÕÀ€ô€¡ÍÑ½É”¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹Ìñðmt¤¹¥¹±Õ‘•Ì ‰•±•Ñ¥Œˆ¤(€€€€€€üÍ•±•Ñ•‘±•Ñ¥É½ÕÁÌ¡ÍÑ½É”¹•Ù•¹Ð¤¹™¥¹ ¡É½ÕÀ¤€ôøÉ½ÕÀ¹‘…åÌ¹¥¹±Õ‘•Ì¡‘…ä¤€˜˜‘…ä€„ôôÉ½ÕÀ¹‘…åÍlÁt¤(€€€€€€è¹Õ±°°(€€€€€•±•Ñ¥=¸€ô	½½±•…¸¡•±•Ñ¥É½ÕÀ¤ì(€€€½¹ÍÐ•±•Ñ¥…Ñ„€ô€¡Á±…å•É%¤€ôøì(€€€€€¥˜€ …•±•Ñ¥=¸¤É•ÑÕÉ¸¹Õ±°ì(€€€€€½¹ÍÐ‰…Í•…ä€ô•±•Ñ¥É½ÕÀ¹‘…åÍlÁt°½µÁ±•Ñ•‘…åÌ€ô•±•Ñ¥É½ÕÀ¹‘…åÌ¹™¥±Ñ•È ¡É½Õ¹‘…ä¤€ôøÉ½Õ¹‘…ä€ðô‘…ä¤°(€€€€€€€‰…Í•Y•ÉÍ¥½¸€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‰…Í•…ä±ÍÑ½É”¹•Ù•¹Ð±Á±…å•É%¤°‰…Í•!À€ôÁ±…å•É…¥±å!…¹‘¥…À¡Á±…å•É%°‰…Í•…ä¤ì(€€€€€½¹ÍÐ‰…Í•A½¥¹ÑÌ€ô€¡ ¤€ôøì(€€€€€€€½¹ÍÐ”€ôÁ±…å•É!½±•¹ÑÉä¡‰…Í•…ä°Á±…å•É%° ¤°(€€€€€€€€€¤€ô €´€Äì(€€€€€€€É•ÑÕÉ¸ÍÑ…‰±•™½É‘A½¥¹ÑÌ (€€€€€€€€€”ü¹É½ÍÌ°(€€€€€€€€€€¬¡‰…Í•Y•ÉÍ¥½¸¹Á…Èü¹m¥tñð€À¤°(€€€€€€€€€‰…Í•Y•ÉÍ¥½¸¹¥¹‘•àü¹m¥t€üü€ˆˆ°(€€€€€€€€€‰…Í•!À°(€€€€€€€€¤ì(€€€€€ôì(€€€€€½¹ÍÐ‰…Í•!½±”€ô‰…Í•A½¥¹ÑÌ¡¡½±”¤°(€€€€€€€Ù…±Õ•Ì€ôÁ±…å•‘!½±•Ì¹µ…À ¡ ¤€ôøì(€€€€€€€€€½¹ÍÐÉ½Õ¹‘Y…±Õ•Ì€ô½µÁ±•Ñ•‘…åÌ¹µ…À ¡É½Õ¹‘…ä¤€ôøì(€€€€€€€€€€€½¹ÍÐ•¹ÑÉä€ôÁ±…å•É!½±•¹ÑÉä¡É½Õ¹‘…ä°Á±…å•É%° ¤°…É€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡É½Õ¹‘…ä±ÍÑ½É”¹•Ù•¹Ð±Á±…å•É%¤°¤€ô €´€Äì(€€€€€€€€€€€É•ÑÕÉ¸ÍÑ…‰±•™½É‘A½¥¹ÑÌ¡•¹ÑÉäü¹É½ÍÌ°€¬¡…É¹Á…Èü¹m¥tñð€À¤°…É¹¥¹‘•àü¹m¥t€üü€ˆˆ°Á±…å•É…¥±å!…¹‘¥…À¡Á±…å•É%°É½Õ¹‘…ä¤¤ì(€€€€€€€€€ô¤¹™¥±Ñ•È ¡Ù…±Õ”¤€ôøÙ…±Õ”€„ô¹Õ±°¤ì(€€€€€€€€€É•ÑÕÉ¸É½Õ¹‘Y…±Õ•Ì¹±•¹Ñ €ü5…Ñ ¹µ…à ¸¸¹É½Õ¹‘Y…±Õ•Ì¤€è¹Õ±°ì(€€€€€€€ô¤ì(€€€€€É•ÑÕÉ¸ì(€€€€€€€‰…Í•…ä°(€€€€€€€‰…Í•!½±”°(€€€€€€€Ñ½Ñ…°èÙ…±Õ•Ì¹•Ù•Éä ¡à¤€ôøà€„ô¹Õ±°¤(€€€€€€€€€€üÙ…±Õ•Ì¹É•‘Õ” ¡„°ˆ¤€ôø„€¬ˆ°€À¤(€€€€€€€€€€è¹Õ±°°(€€€€€ôì(€€€ôì(€€€½¹ÍÐÍ½É•MÕµµ…Éä€ô€¡Í•Ñ¥½¸°ÕÉÉ•¹Ð°Ñ½Ñ…°°Á±…å•É%°¡½±•%¹‘•à¤€ôøì(€€€€€½¹ÍÐ•Œ€ô•±•Ñ¥…Ñ„¡Á±…å•É%¤°(€€€€€€€Í¡½ÑÌ€ôÍÑ…‰±•™½É‘MÑÉ½­•½Õ¹Ð (€€€€€€€€€¡½±•%¹‘•à°(€€€€€€€€€Á±…å•É…¥±å!…¹‘¥…À¡Á±…å•É%°‘…ä¤°(€€€€€€€€¤ì(€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰Í½É•MÕµµ…Éä€‘í•Œ€ü€‰¡…Í±•Ñ¥Œˆ€è€ˆ‰ôˆ‘…Ñ„µÍ½É”µÍÕµµ…Éäôˆ‘íÍ•Ñ¥½¹ôˆøñ‘¥Ø±…ÍÌô‰ÉÕ¹¹¥¹M½É”ˆøñÍÁ…¸øñ•´ùM¡½ÑÌð½•´øñˆø‘íÍ¡½ÑÍôð½ˆøð½ÍÁ…¸øñÍÁ…¸øñ•´ùM½É”ð½•´øñˆø‘íÕÉÉ•¹Ð€ôô¹Õ±°€ü€‹ŠPˆ€èÕÉÉ•¹Ñôð½ˆøð½ÍÁ…¸øñÍÁ…¸øñ•´ùQ½Ñ…°ð½•´øñˆø‘íÑ½Ñ…±ôð½ˆøð½ÍÁ…¸ø‘í•Œ€ü€ñÍÁ…¸øñ•´ù…ä€‘í•Œ¹‰…Í•…åôð½•´øñˆø‘í•Œ¹‰…Í•!½±”€ôô¹Õ±°€ü€‹ŠPˆ€è•Œ¹‰…Í•!½±•ôð½ˆøð½ÍÁ…¸øñÍÁ…¸øñ•´ù±•Ñ¥Œð½•´øñˆø‘í•Œ¹Ñ½Ñ…°€ôô¹Õ±°€ü€‹ŠPˆ€è•Œ¹Ñ½Ñ…±ôð½ˆøð½ÍÁ…¸ù€€è€ˆ‰ôð½‘¥Øøð½‘¥Øù€ì(€€€ôì(€€€½¹ÍÐÁ…¥ÉMÑ…ÉÐ€ôÑà¹Á±…å•É%¹‘•à€ð€È€ü€À€è€È°(€€€€€Á…¥É%‘Ì€ôÑà¹É½ÕÀ(€€€€€€€€¹Í±¥”¡Á…¥ÉMÑ…ÉÐ°Á…¥ÉMÑ…ÉÐ€¬€È¤(€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤(€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôø¥€„ôô9=}AIQ9I}%¤°(€€€€€Ñ•…µ%‘Ì€ôÑà¹É½ÕÀ¹µ…À¡MÑÉ¥¹œ¤¹™¥±Ñ•È ¡¥¤€ôø¥€„ôô9=}AIQ9I}%¤ì(€€€¥˜€ (€€€€€Á…¥É%‘Ì¹±•¹Ñ €ð€È€˜˜(€€€€€Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È€˜˜(€€€€€€…Á…¥É%‘Ì¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È¤¤(€€€€¤(€€€€€Á…¥É%‘Ì¹ÁÕÍ ¡MÑÉ¥¹œ¡Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È¤¤ì(€€€¥˜€ (€€€€€Ñ•…µ%‘Ì¹±•¹Ñ €ð€Ð€˜˜(€€€€€Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È€˜˜(€€€€€€…Ñ•…µ%‘Ì¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È¤¤(€€€€¤(€€€€€Ñ•…µ%‘Ì¹ÁÕÍ ¡MÑÉ¥¹œ¡Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È¤¤ì(€€€½¹ÍÐÁÕÑÑÍQ¡É½Õ €ô€¡Á¥¤€ôøì(€€€€€±•ÐÍÕ´€ô€Àì(€€€€€™½È€¡½¹ÍÐ ½˜Á±…å•‘!½±•Ì¤ì(€€€€€€€½¹ÍÐ”€ôÁ±…å•É!½±•¹ÑÉä¡‘…ä°Á¥° ¤±…Éõ•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Á¥¤ì(€€€€€€€¥˜€¡”ü¹ÁÕÑÑÌ€ôôô€ˆˆñð”ü¹ÁÕÑÑÌ€ôô¹Õ±°¤É•ÑÕÉ¸¹Õ±°ì(€€€€€€€ÍÕ´€¬ô€­”¹ÁÕÑÑÌñð€Àì(€€€€€ô(€€€€€É•ÑÕÉ¸ÍÕ´ì(€€€ôì(€€€½¹ÍÐÁ…¥É¥ÍÁ±…ä€ômMÑÉ¥¹œ¡Ñ…É•Ñ%¤°MÑÉ¥¹œ¡Í•±•Ñ•¥t¹™¥±Ñ•È (€€€€€€€€¡¥°¤°„¤€ôø¥€˜˜„¹¥¹‘•á=˜¡¥¤€ôôô¤°(€€€€€€¤°(€€€€€¥¹‘¥Ù¥‘Õ…±AÕÑÑÌ€ôÁ…¥É¥ÍÁ±…ä¹µ…À ¡¥¤€ôø€¡ì(€€€€€€€¥°(€€€€€€€Ñ½Ñ…°èÁÕÑÑÍQ¡É½Õ ¡¥¤°(€€€€€ô¤¤ì(€€€½¹ÍÐÁÕÑÑ¥¹=¸€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤°(€€€€€ÁÕÑÑ¥¹½Éµ…Ð€ôÍÑ½É”¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€ôôô€‰Á…¥ÉÌˆ€ü€‰Á…¥ÉÌˆ€è€‰Ñ•…´ˆ°(€€€€€ÁÕÑÑ¥¹%‘Ì€ôÁÕÑÑ¥¹½Éµ…Ð€ôôô€‰Á…¥ÉÌˆ€üÁ…¥É%‘Ì€èÑ•…µ%‘Ì°(€€€€€ÁÕÑÑ¥¹Y…±Õ•Ì€ôÁÕÑÑ¥¹%‘Ì¹µ…À¡ÁÕÑÑÍQ¡É½Õ ¤°(€€€€€ÁÕÑÑ¥¹Q½Ñ…°€ôÁÕÑÑ¥¹Y…±Õ•Ì¹•Ù•Éä ¡à¤€ôøà€„ô¹Õ±°¤(€€€€€€€€üÁÕÑÑ¥¹Y…±Õ•Ì¹É•‘Õ” ¡„°ˆ¤€ôø„€¬ˆ°€À¤(€€€€€€€€è¹Õ±°ì(€€€½¹ÍÐÁÕÑÑÍ1¥¹”€ô€ñˆùAÕÑÑÌèð½ˆø€‘í¥¹‘¥Ù¥‘Õ…±AÕÑÑÌ¹µ…À ¡à¤€ôø€ñÍÁ…¸ø‘í•ÍŒ¡Á±…å•ÉMÕÉ¹…µ”¡à¹¥¤¥ô€ñÍÑÉ½¹œø‘íà¹Ñ½Ñ…°€ôô¹Õ±°€ü€‹ŠPˆ€èà¹Ñ½Ñ…±ôð½ÍÑÉ½¹œøð½ÍÁ…¸ù€¤¹©½¥¸ ˆ€ˆ¥ô‘íÁÕÑÑ¥¹=¸€ü€ñÍÁ…¸±…ÍÌô‰ÁÕÑÑ¥¹É•…Ñ”ˆø‘íÁÕÑÑ¥¹½Éµ…Ð€ôôô€‰Á…¥ÉÌˆ€ü€‰A…¥ÉÌˆ€è€‰Q•…´‰ôQ½Ñ…°€ñÍÑÉ½¹œø‘íÁÕÑÑ¥¹Q½Ñ…°€ôô¹Õ±°€ü€‹ŠPˆ€èÁÕÑÑ¥¹Q½Ñ…±ôð½ÍÑÉ½¹œøð½ÍÁ…¸ù€€è€ˆ‰ô‘í¹ÑÀ€ü€ˆñ•´ù9Q@ð½•´øˆ€è€ˆ‰õ€ì(€€€½¹ÍÐ‰•ÍÐÍ!½±”€ô€¡ ¤€ôøì(€€€€€½¹ÍÐ¤€ô €´€Ä°(€€€€€€€Ù…±Õ•Ì€ôÑ•…µ%‘Ì(€€€€€€€€€€¹µ…À ¡Á¥¤€ôøì(€€€€€€€€€€€½¹ÍÐ”€ôÁ±…å•É!½±•¹ÑÉä¡‘…ä°Á¥° ¤±…Éõ•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Á¥¤ì(€€€€€€€€€€€É•ÑÕÉ¸ÍÑ…‰±•™½É‘A½¥¹ÑÌ (€€€€€€€€€€€€€”ü¹É½ÍÌ°(€€€€€€€€€€€€€€¬¡…É¹Á…Èü¹m¥tñð€À¤°(€€€€€€€€€€€€€…É¹¥¹‘•àü¹m¥t€üü€ˆˆ°(€€€€€€€€€€€€€Á±…å•É…¥±å!…¹‘¥…À¡Á¥°‘…ä¤°(€€€€€€€€€€€€¤ì(€€€€€€€€€ô¤(€€€€€€€€€€¹™¥±Ñ•È ¡à¤€ôøà€„ô¹Õ±°¤(€€€€€€€€€€¹Í½ÉÐ ¡„°ˆ¤€ôøˆ€´„¤ì(€€€€€É•ÑÕÉ¸Ù…±Õ•Ì¹±•¹Ñ €øô€Ì(€€€€€€€€üÙ…±Õ•Ì¹Í±¥” À°€Ì¤¹É•‘Õ” ¡„°ˆ¤€ôø„€¬ˆ°€À¤(€€€€€€€€è¹Õ±°ì(€€€ôì(€€€½¹ÍÐ‰•ÍÐÍÕÉÉ•¹Ð€ô‰•ÍÐÍ!½±”¡¡½±”¤°(€€€€€‰•ÍÐÍY…±Õ•Ì€ôÁ±…å•‘!½±•Ì¹µ…À¡‰•ÍÐÍ!½±”¤°(€€€€€‰•ÍÐÍQ½Ñ…°€ô‰•ÍÐÍY…±Õ•Ì¹•Ù•Éä ¡à¤€ôøà€„ô¹Õ±°¤(€€€€€€€€ü‰•ÍÐÍY…±Õ•Ì¹É•‘Õ” ¡„°ˆ¤€ôø„€¬ˆ°€À¤(€€€€€€€€è¹Õ±°°(€€€€€‰•ÍÐÍ=¸€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰‰•ÍÐÍ½˜Ðˆ°‘…ä¤°(€€€€€å•±±½Ý	…±±MÑ…Ñ”€ôå•±±½Ý	…±±!½±•MÑ…Ñ”¡‘…ä°Ñà¹É½ÕÁ%¹‘•à°¡½±”°É•Œ¤°(€€€€€å•±±½Ý	…±±A±…å•É%€ôå•±±½Ý	…±±MÑ…Ñ”¹Á±…å•É%°(€€€€€å•±±½Ý	…±±Ñ¥Ù”€ôå•±±½Ý	…±±MÑ…Ñ”¹…Ñ¥Ù”°(€€€€€å•±±½Ý	…±±1½ÍÑ!•É”€ôå•±±½Ý	…±±MÑ…Ñ”¹±½ÍÑ!•É”°(€€€€€å•±±½Ý	…±±	ÕÑÑ½¸€ô€¡Á±…å•É%¤€ôøå•±±½Ý	…±±MÑ…Ñ”¹…¹I•½É€˜˜MÑÉ¥¹œ¡Á±…å•É%¤€ôôôMÑÉ¥¹œ¡å•±±½Ý	…±±A±…å•É%¤(€€€€€€€€ü€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰å•±±½Ý	…±±1½ÍÑ	Ñ¸€‘íå•±±½Ý	…±±1½ÍÑ!•É”€ü€‰±½ÍÐˆ€è€ˆ‰ôˆ¥ô‰å•±±½Ý	…±±1½ÍÐˆø‘íå•±±½Ý	…±±1½ÍÑ!•É”€ü€‰U9<	101=MPˆ€è€‰	101=MP‰ôð½‰ÕÑÑ½¸ù€€è€ˆˆ°(€€€€€å•±±½Ý	…±±±…ÍÌ€ô€¡Á±…å•É%¤€ôø(€€€€€€€å•±±½Ý	…±±Ñ¥Ù”€˜˜MÑÉ¥¹œ¡Á±…å•É%¤€ôôôMÑÉ¥¹œ¡å•±±½Ý	…±±A±…å•É%¤(€€€€€€€€€€ü€‰å•±±½Ý	…±±QÕÉ¸ˆ(€€€€€€€€€€è€ˆˆì(€€€½¹ÍÐ¥ÍáÑÉ„€ôMÑÉ¥¹œ¡Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌü¹mMÑÉ¥¹œ¡¡½±”¥tñðÍ•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•Èñð€ˆˆ¤€ôôôMÑÉ¥¹œ¡Í•±•Ñ•¤ì(€€€½¹ÍÐÍÑ•ÁÁ•È€ô€¡¥°±…‰•°°Ù…±Õ”°‰…Í”°µ¥¸°µ…à¤€ôøì(€€€€€½¹ÍÐ¡…Ì€ôÙ…±Õ”€„ôô€ˆˆ€˜˜Ù…±Õ”€„ô¹Õ±°°(€€€€€€€¥ÍÉ½ÍÌ€ô¥¹•¹‘Í]¥Ñ  ‰É½ÍÌˆ¤°(€€€€€€€Á¥­•€ô¥ÍÉ½ÍÌ€˜˜MÑÉ¥¹œ¡Ù…±Õ”¤¹Ñ½UÁÁ•É…Í” ¤€ôôô€‰@ˆ°(€€€€€€€Ù…°€ôÁ¥­•€ü€‰@ˆ€è¡…Ì€ü€­Ù…±Õ”€è€­‰…Í”ì(€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰Í½É•MÑ•ÁÁ•É]É…À€‘í¥ÍÉ½ÍÌ€ü€‰É½ÍÍ½¹ÑÉ½°ˆ€è€‰ÁÕÑÑÍ½¹ÑÉ½°‰ôˆøñÍµ…±°ø‘í±…‰•±ôð½Íµ…±°øñ‘¥Ø±…ÍÌô‰Í½É•MÑ•ÁÁ•È€‘í¡…Ì€ü€‰Í•Ðˆ€è€‰Õ¹Í•Ð‰ôˆøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÍÑ•Àôˆ‘í¥‘ôˆ‘…Ñ„µ‘•±Ñ„ôˆ´ÄˆûŠ"Hð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰ÍÑ•ÁY…±Õ”ˆ‘…Ñ„µ½¹™¥É´ôˆ‘í¥‘ôˆ‘…Ñ„µ‰…Í”ôˆ‘í‰…Í•ôˆø‘íÙ…±ôð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ‘…Ñ„µÍÑ•Àôˆ‘í¥‘ôˆ‘…Ñ„µ‘•±Ñ„ôˆÄˆø¬ð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øù€ì(€€€ôì(€€€½¹ÍÐÁ¥­ÕÀ€ô€¡¥°Ù…±Õ”°½µÁ…Ð€ô™…±Í”¤€ôøì(€€€€€½¹ÍÐÁ¥­•€ôMÑÉ¥¹œ¡Ù…±Õ”¤¹Ñ½UÁÁ•É…Í” ¤€ôôô€‰@ˆì(€€€€€É•ÑÕÉ¸€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Á¥­ÕÁI½Ü€‘íÁ¥­•€ü€‰Á¥­•ˆ€è€ˆ‰ôˆ‘…Ñ„µÁ¥­ÕÀôˆ‘í¥‘ôˆø‘íÁ¥­•€ü½µÁ…Ð€ü€‹ŠrLA%,µU@€¡@¤ˆ€è€‹ŠrLA%,µU@I=I€¡@¤ˆ€è€‰@ƒŠPA%,µU@‰ôð½‰ÕÑÑ½¸ù€ì(€€€ôì(€€€½¹ÍÐÑ¥µ•Q•áÐ€ôÉ•Œ¹¹ÑÀü¹½¹™¥Éµ•‘Ð(€€€€€€ü¹•Ü…Ñ”¡É•Œ¹¹ÑÀ¹½¹™¥Éµ•‘Ð¤¹Ñ½1½…±•Q¥µ•MÑÉ¥¹œ ‰•¸µTˆ°ì(€€€€€€€€€¡½ÕÈè€‰¹Õµ•É¥Œˆ°(€€€€€€€€€µ¥¹ÕÑ”è€ˆÈµ‘¥¥Ðˆ°(€€€€€€€ô¤(€€€€€€è€ˆˆì(€€€½¹ÍÐÑ…É•ÑA½ÍÍ•ÍÍ¥Ù”€ô•Ù•¹Ñ……Ñ•½Éä¡Ñ…É•Ñ%°ÍÑ½É”¹•Ù•¹Ð¤€ôôô€‰Ý½µ•¸ˆ€ü€‰¡•Èˆ€è€‰¡¥Ìˆì(€€€½¹ÍÐ¹ÑÁ­¹½Ý±•‘•µ•¹Ð€ô¹ÑÀ(€€€€€€ü€ñ‘¥Ø±…ÍÌô‰¹ÑÁA±…å…É¹ÑÁA±…å…É‘Q½Àˆøñ‘¥Øøñˆù9Q@ƒŠP¥€‘í•ÍŒ¡Ñ…É•Ðü¹¹…µ”ñð€‰å½ÕÈµ…É­•ÈÁ…ÉÑ¹•Èˆ¥ôÉ•½É€‘íÑ…É•ÑA½ÍÍ•ÍÍ¥Ù•ô¹…µ”½¸Ñ¡”9Q@µ…É­•Èüð½ˆø‘í¥ÍáÑÉ„€ü€ˆñÍÁ…¸ùe½Ô¡…Ù”Ñ¡”9Q@•áÑÉ„Í¡½ÐÑ½‘…ä¸ð½ÍÁ…¸øˆ€è€ˆ‰ôð½‘¥Øø‘íÉ•Œ¹¹ÑÀü¹±½­•€ü€ñ‰ÕÑÑ½¸‘¥Í…‰±•ù¹ÑÉä±½­•ð½‰ÕÑÑ½¸ù€€èÉ•Œ¹¹ÑÀü¹½¹™¥Éµ•‘Ð€ü€ñ‘¥Ø±…ÍÌô‰¹ÑÁ½¹™¥Éµ•ˆøñÍÁ…¸±…ÍÌô‰¹ÑÁQ¥µ”ˆûÂ~RH€‘í•ÍŒ¡Ñ¥µ•Q•áÐ¥ôð½ÍÁ…¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰Õ¹‘½9ÑÀˆùU¹‘¼ð½‰ÕÑÑ½¸øð½‘¥Øù€€è€ñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éä€‘íÉ•Œ¹¹ÑÀü¹Á•¹‘¥¹œ€ü€‰½¹™¥Éµ¥¹œˆ€è€ˆ‰ôˆ¥ô‰å•Í9ÑÀˆø‘íÉ•Œ¹¹ÑÀü¹Á•¹‘¥¹œ€ü€‰=9%I4eLˆ€è€‰eL‰ôð½‰ÕÑÑ½¸ùôð½‘¥Øù€(€€€€€€è€ˆˆì(€€€½¹ÍÐ¡½±•½µÁ±•Ñ”€ô€¡ ¤€ôøì(€€€€€½¹ÍÐÈ€ôÉ½Õ¹‘mMÑÉ¥¹œ¡ ¥tñðíô°(€€€€€€€É½ÍÍ½¹”€ô(€€€€€€€€€Í½É•¹Ñ•É•¡È¹½™™¥¥…°ü¹É½ÍÌ¤€˜˜Í½É•¹Ñ•É•¡È¹Í•±˜ü¹É½ÍÌ¤ì(€€€€€½¹ÍÐÁÕÑÑÍI•ÅÕ¥É•€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤ì(€€€€€É•ÑÕÉ¸€ (€€€€€€€É½ÍÍ½¹”€˜˜(€€€€€€€€ …ÁÕÑÑÍI•ÅÕ¥É•ñð(€€€€€€€€€€¡Í½É•¹Ñ•É•¡È¹½™™¥¥…°ü¹ÁÕÑÑÌ¤€˜˜Í½É•¹Ñ•É•¡È¹Í•±˜ü¹ÁÕÑÑÌ¤¤¤(€€€€€€¤ì(€€€ôì(€€€½¹ÍÐ±¥Ù•5¥Íµ…Ñ €ô€¡ ¤€ôøì(€€€€€½¹ÍÐ½Ý¸€ôÉ½Õ¹‘mMÑÉ¥¹œ¡ ¥tü¹Í•±˜ñðíô°(€€€€€€€½Ý¹=™™¥¥…°€ô™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Í•±•Ñ•° ¤°(€€€€€€€µ…É­•€ôÉ½Õ¹‘mMÑÉ¥¹œ¡ ¥tü¹½™™¥¥…°ñðíô°(€€€€€€€µ…É­•‘A±…å•È€ôMÑÉ¥¹œ¡µ…É­•¹Á±…å•É%ñðÑ…É•Ñ%ñð€ˆˆ¤°(€€€€€€€µ…É­•‘¡•¬€ôÍ½É¥¹…åMÑ½É”¡‘…ä¤ü¹mµ…É­•‘A±…å•Étü¹mMÑÉ¥¹œ¡ ¥tü¹Í•±˜ñðíô°(€€€€€€€ÁÕÑÑÍI•ÅÕ¥É•€ôÁÕÑÑ¥¹=¸ì(€€€€€É•ÑÕÉ¸Í½É•¹ÑÉ¥•Í5¥Íµ…Ñ ¡‘…ä°Í•±•Ñ•° °½Ý¸°½Ý¹=™™¥¥…°°ÁÕÑÑÍI•ÅÕ¥É•¤ñð(€€€€€€€	½½±•…¸¡µ…É­•‘A±…å•È€˜˜Í½É•¹ÑÉ¥•Í5¥Íµ…Ñ ¡‘…ä°µ…É­•‘A±…å•È° °µ…É­•°µ…É­•‘¡•¬°ÁÕÑÑÍI•ÅÕ¥É•¤¤ì(€€€ôì(€€€É½Õ¹¹}µ•Ñ„€ôÉ½Õ¹¹}µ•Ñ„ñðíôì(€€€½¹ÍÐ™ÕÉÑ¡•ÍÑA½Ì€ô5…Ñ ¹µ…à¡Á½Ì°€­É½Õ¹¹}µ•Ñ„¹™ÕÉÑ¡•ÍÑA½Ìñð€À¤ì(€€€É½Õ¹¹}µ•Ñ„¹™ÕÉÑ¡•ÍÑA½Ì€ô™ÕÉÑ¡•ÍÑA½Ìì(€€€½¹ÍÐµ¥ÍÍ¥¹!½±•Ì€ôÍ•Ä(€€€€€€¹Í±¥” À°™ÕÉÑ¡•ÍÑA½Ì¤(€€€€€€¹™¥±Ñ•È ¡ ¤€ôø€…¡½±•½µÁ±•Ñ”¡ ¤¤ì(€€€½¹ÍÐµ¥Íµ…Ñ¡!½±•Ì€ôÍ•Ä¹™¥±Ñ•È ¡ ¤€ôø±¥Ù•5¥Íµ…Ñ ¡ ¤¤ì(€€€½¹ÍÐ¡½±•MÑ…ÑÕÌ€ô€¡ ¤€ôø(€€€€€ €ôôô¡½±”(€€€€€€€€ü€‰ÕÉÉ•¹Ðˆ(€€€€€€€€è±¥Ù•5¥Íµ…Ñ ¡ ¤(€€€€€€€€€€ü€‰µ¥Íµ…Ñ ˆ(€€€€€€€€€€è¡½±•½µÁ±•Ñ”¡ ¤(€€€€€€€€€€ü€‰½µÁ±•Ñ”ˆ(€€€€€€€€€€èÍ•Ä¹¥¹‘•á=˜¡ ¤€ð™ÕÉÑ¡•ÍÑA½Ì(€€€€€€€€€€€€ü€‰µ¥ÍÍ¥¹œˆ(€€€€€€€€€€€€è€‰ÕÁ½µ¥¹œˆì(€€€½¹ÍÐ¡½±•QÉ…­•È€ô€ñ‘¥Ø±…ÍÌô‰¡½±•QÉ…­•Èˆ…É¥„µ±…‰•°ô‰I½Õ¹¡½±”ÍÑ…ÑÕÌˆøñ‘¥Ø±…ÍÌô‰¡½±•QÉ…­•É-•äˆøñÍÁ…¸øñ¤±…ÍÌô‰½µÁ±•Ñ”ˆûŠrLð½¤øÉ••ð½ÍÁ…¸øñÍÁ…¸øñ¤±…ÍÌô‰µ¥Íµ…Ñ ˆø„ð½¤ø¡•¬ð½ÍÁ…¸øñÍÁ…¸øñ¤±…ÍÌô‰µ¥ÍÍ¥¹œˆø„ð½¤ø5¥ÍÍ¥¹œð½ÍÁ…¸øñÍÁ…¸øñ¤±…ÍÌô‰ÕÉÉ•¹Ðˆøð½¤øÕÉÉ•¹Ðð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰¡½±•QÉ…­•ÉÉ¥ˆø‘íÍ•Ä(€€€€€€¹µ…À ¡ °¤¤€ôøì(€€€€€€€½¹ÍÐÍÑ…Ñ”€ô¡½±•MÑ…ÑÕÌ¡ ¤ì(€€€€€€€É•ÑÕÉ¸€ñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰¡½±•QÉ…¬€‘íÍÑ…Ñ•ôˆ‘…Ñ„µ½Ñ½¡½±”ôˆ‘í¥ôˆ…É¥„µ±…‰•°ô‰!½±”€‘í¡ô°€‘íÍÑ…Ñ•ôˆøñˆø‘í¡ôð½ˆø‘íÍÑ…Ñ”€ôôô€‰½µÁ±•Ñ”ˆ€ü€ˆñÍµ…±°ûŠrLð½Íµ…±°øˆ€èl‰µ¥ÍÍ¥¹œˆ°€‰µ¥Íµ…Ñ ‰t¹¥¹±Õ‘•Ì¡ÍÑ…Ñ”¤€ü€ˆñÍµ…±°ø„ð½Íµ…±°øˆ€è€ˆ‰ôð½‰ÕÑÑ½¸ù€ì(€€€€€ô¤(€€€€€€¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½‘¥Øù€ì(€€€½¹ÍÐµ¥ÍÍ¥¹±•ÉÐ€ôµ¥ÍÍ¥¹!½±•Ì¹±•¹Ñ (€€€€€€ü€ñ‘¥Ø±…ÍÌô‰µ¥ÍÍ¥¹!½±•±•ÉÐˆøñ‘¥ØøñÍÑÉ½¹œø‘íµ¥ÍÍ¥¹!½±•Ì¹±•¹Ñ¡ôµ¥ÍÍ¥¹œ¡½±”‘íµ¥ÍÍ¥¹!½±•Ì¹±•¹Ñ €ôôô€Ä€ü€ˆˆ€è€‰Ì‰ôè€‘íµ¥ÍÍ¥¹!½±•Ì¹©½¥¸ ˆ°€ˆ¥ôð½ÍÑÉ½¹œøñÍÁ…¸ùQ¡•Í”¡½±•Ì¡…Ù”‰••¸Á…ÍÍ•Ý¥Ñ¡½ÕÐ½µÁ±•Ñ”Í½É•Ì¸ð½ÍÁ…¸øð½‘¥Øøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ¥ô‰™¥ÉÍÑ5¥ÍÍ¥¹!½±”ˆù¼Ñ¼™¥ÉÍÐµ¥ÍÍ¥¹œ¡½±”ð½‰ÕÑÑ½¸øð½‘¥Øù€(€€€€€€è€ˆˆì(€€€½¹ÍÐµ¥Íµ…Ñ¡±•ÉÐ€ôµ¥Íµ…Ñ¡!½±•Ì¹±•¹Ñ (€€€€€€ü€ñ‘¥Ø±…ÍÌô‰µ¥Íµ…Ñ¡!½±•±•ÉÐˆøñ‘¥ØøñÍÑÉ½¹œù!½±”‘íµ¥Íµ…Ñ¡!½±•Ì¹±•¹Ñ €ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô€‘íµ¥Íµ…Ñ¡!½±•Ì¹©½¥¸ ˆ°€ˆ¥ô¹••‘íµ¥Íµ…Ñ¡!½±•Ì¹±•¹Ñ €ôôô€Ä€ü€‰Ìˆ€è€ˆ‰ô¡•­¥¹œð½ÍÑÉ½¹œøñÍÁ…¸ùe½ÕÈ€‘íÁÕÑÑ¥¹=¸€ü€‰Í½É”½ÈÁÕÑÑÌ‘½•Ìˆ€è€‰Í½É”‘½•Ì‰ô¹½Ð…É•”Ý¥Ñ Ñ¡”½Ñ¡•È…É¸A±•…Í”¡•¬¥Ð¹½Ü¸ð½ÍÁ…¸øð½‘¥Øøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ¥ô‰™¥ÉÍÑ5¥Íµ…Ñ¡!½±”ˆù¡•¬¹½Üð½‰ÕÑÑ½¸øð½‘¥Øù€(€€€€€€è€ˆˆì(€€€½¹ÍÐ•µ•É•¹ä€ôÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌü¹l‰‘…äˆ€¬‘…åt°(€€€€€Í¡½ÝY¥ÉÑÕ…±±…¹”€ô•µ•É•¹ä€˜˜€­•µ•É•¹ä¹É½ÕÁ%¹‘•à€ôôô€­Ñà¹É½ÕÁ%¹‘•à°(€€€€€Ù¥ÉÑÕ…±¹ÑÉä€ôÍ¡½ÝY¥ÉÑÕ…±±…¹”€üÁ±…å•É!½±•¹ÑÉä¡‘…ä°•µ•É•¹ä¹Ù¥ÉÑÕ…±A±…å•É%°¡½±”¤€è¹Õ±°°(€€€€€Ù¥ÉÑÕ…±A½¥¹ÑÌ€ôÍ¡½ÝY¥ÉÑÕ…±±…¹”(€€€€€€€€üÍÑ…‰±•™½É‘A½¥¹ÑÌ¡Ù¥ÉÑÕ…±¹ÑÉäü¹É½ÍÌ°Á…È°¥¹‘•áY…°°Á±…å•É…¥±å!…¹‘¥…À¡•µ•É•¹ä¹Ù¥ÉÑÕ…±A±…å•É%°‘…ä¤¤(€€€€€€€€è¹Õ±°°(€€€€€Ù¥ÉÑÕ…±±…¹”€ôÍ¡½ÝY¥ÉÑÕ…±±…¹”(€€€€€€€€ü€ñ‘•Ñ…¥±Ì±…ÍÌô‰Ù¥ÉÑÕ…±±…¹”ˆøñÍÕµµ…Éäø‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡•µ•É•¹ä¹Ù¥ÉÑÕ…±A±…å•É%°‘…ä¤ü¹¹…µ”ñð€‰Y¥ÉÑÕ…°A±…å•Èˆ¥ôƒŠPY¥ÉÑÕ…°A±…å•È™½È€‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡•µ•É•¹ä¹µ¥ÍÍ¥¹A±…å•É%°‘…ä¤ü¹¹…µ”ñð€‰µ¥ÍÍ¥¹œÁ±…å•Èˆ¥ôð½ÍÕµµ…Éäøñ‘¥Øø‘íÙ¥ÉÑÕ…±¹ÑÉä€˜˜Í½É•¹Ñ•É•¡Ù¥ÉÑÕ…±¹ÑÉä¹É½ÍÌ¤€ü€ñˆù!½±”€‘í¡½±•ôÙ•É¥™¥•è€‘íÙ¥ÉÑÕ…±A½¥¹ÑÌ€üü€‹ŠP‰ôÁ½¥¹Ð‘íÙ¥ÉÑÕ…±A½¥¹ÑÌ€ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô‘íÙ¥ÉÑÕ…±¹ÑÉä¹ÁÕÑÑÌ€ôô¹Õ±°ñðÙ¥ÉÑÕ…±¹ÑÉä¹ÁÕÑÑÌ€ôôô€ˆˆ€ü€ˆˆ€è€ƒ
Ü€‘íÙ¥ÉÑÕ…±¹ÑÉä¹ÁÕÑÑÍôÁÕÑÑÍôð½ˆøñÍÁ…¸ùQ¡¥Ì‰½ÉÉ½Ý•Í½É”¥Ì¹½Ü¥¹±Õ‘•…ÕÑ½µ…Ñ¥…±±ä¥¸Ñ¡”…™™•Ñ•Á…¥È…¹Ñ•…´Ñ½Ñ…±Ì¸ð½ÍÁ…¸ù€€è€ñˆù]…¥Ñ¥¹œ™½È€‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡•µ•É•¹ä¹Ù¥ÉÑÕ…±A±…å•É%°‘…ä¤ü¹¹…µ”ñð€‰Ñ¡”Ù¥ÉÑÕ…°Á±…å•Èˆ¥ôÌÙ•É¥™¥•Í½É”½¸!½±”€‘í¡½±•ôð½ˆøñÍÁ…¸ùQ¡”…™™•Ñ•Á…¥È…¹Ñ•…´Ñ½Ñ…±ÌÝ¥±°ÕÁ‘…Ñ”Ý¡•¸Ñ¡…ÐÍ½É”…ÉÉ¥Ù•Ì¸ð½ÍÁ…¸ùôð½‘¥Øøð½‘•Ñ…¥±Ìù€(€€€€€€€€è€ˆˆì(€€€½¹ÍÐÍÑ…ÉÑ¥¹!½±•9½Ñ¥”€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉMÑ…ÉÑ¥¹!½±•9½Ñ¥”°(€€€€€Í¡½ÝMÑ…ÉÑ¥¹!½±•9½Ñ¥”€ô(€€€€€€€€­ÍÑ…ÉÑ¥¹!½±•9½Ñ¥”ü¹‘…ä€ôôô€­‘…ä€˜˜(€€€€€€€€­ÍÑ…ÉÑ¥¹!½±•9½Ñ¥”ü¹¡½±”€ôôô€­ÍÑ…ÉÐì(€€€½¹ÍÐÍÑ…ÉÑ¥¹!½±•±•ÉÐ€ôÍ¡½ÝMÑ…ÉÑ¥¹!½±•9½Ñ¥”(€€€€€€ü€ñ‘¥Ø±…ÍÌô‰ÍÑ…ÉÑ¥¹!½±•±•ÉÐˆøñ‘¥ØøñÍÑÉ½¹œùMÑ…ÉÑ¥¹œ¡½±”¡…¹•Ñ¼!½±”€‘íÍÑ…ÉÑôð½ÍÑÉ½¹œøñÍÁ…¸ùQ¡”½É…¹¥Í•È¡…ÌÕÁ‘…Ñ•Ñ¡¥ÌÍ½É•…É¸	•¥¸å½ÕÈÉ½Õ¹¡•É”¸ð½ÍÁ…¸øð½‘¥Øøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ¥ô‰‘¥Íµ¥ÍÍMÑ…ÉÑ¥¹!½±•±•ÉÐˆù½Ð¥Ðð½‰ÕÑÑ½¸øð½‘¥Øù€(€€€€€€è€ˆˆì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€‘íÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ü€œñ‘¥Ø±…ÍÌô‰É•ÑÕÉ¹M•ÑÕÁ	…ÈÙ•É¥™¥…Ñ¥½¹I•ÑÕÉ¹	…Èˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸ˆûŠ@I•ÑÕÉ¸Ñ¼¡•­¥¹œð½‰ÕÑÑ½¸øð½‘¥Øøœ€è€ˆ‰ôñ‘¥Ø±…ÍÌô‰Í½É•…É‘á¥Ñ	…Èˆøñ‰ÕÑÑ½¸ÑåÁ”ô‰‰ÕÑÑ½¸ˆ±…ÍÌô‰Í½™Ðˆ¥ô‰•á¥ÑM½É•…ÉˆûŠ@á¥Ðð½‰ÕÑÑ½¸øñÍÁ…¸ùM½É•ÌÉ•µ…¥¸Í…Ù•¸ð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰Í½É¥¹A¡½¹”ˆø‘íÍÑ…ÉÑ¥¹!½±•±•ÉÑô‘í¡½±•QÉ…­•Éô‘íµ¥Íµ…Ñ¡±•ÉÑô‘íµ¥ÍÍ¥¹±•ÉÑô(€‘íÑ…É•Ñ!½±•%¹™½ôñ‘¥Ø±…ÍÌô‰¡½±•!•É¼€‘í¹ÑÀ€ü€‰¥Í9ÑÀˆ€è€ˆ‰ôˆøñ‘¥ØøñÍµ…±°ù!=1ð½Íµ…±°øñÍÑÉ½¹œø‘í¡½±•ôð½ÍÑÉ½¹œøð½‘¥Øøñ‘¥Ø±…ÍÌôˆ‘í¹ÑÀ€ü€‰¹ÑÁA…É•±°ˆ€è€ˆ‰ôˆøñÍµ…±°ø‘í¹ÑÀ€ü€‰AHƒ
Ü9Q@ˆ€è€‰AH‰ôð½Íµ…±°øñˆø‘íÁ…Èñð€‹ŠP‰ôð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ù%9`ð½Íµ…±°øñˆø‘í•ÍŒ¡¥¹‘•áY…°ñð€‹ŠPˆ¥ôð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ø‘í½ÕÉÍ•¥ÍÑ…¹•U¹¥Ð¡Ø¤¹Ñ½UÁÁ•É…Í” ¥ôð½Íµ…±°øñˆø‘íµ•ÑÉ•Ìñð€‹ŠP‰ôð½ˆøð½‘¥Øøð½‘¥Øø(€‘í¹ÑÁ­¹½Ý±•‘•µ•¹Ñô(€ñ‘¥Ø±…ÍÌô‰Í½É•¹ÑÉå…É½™™¥¥…°ˆøñ‘¥Ø±…ÍÌô‰Í½É•¹ÑÉå!•…ˆøñ‘¥ØøñÍµ…±°ùA1eHð½Íµ…±°øñ‘¥Ø±…ÍÌô‰å•±±½Ý	…±±9…µ•1¥¹”ˆøñ Ì±…ÍÌôˆ‘íå•±±½Ý	…±±±…ÍÌ¡Ñ…É•Ñ%¥ôˆø‘í•ÍŒ¡Ñ…É•Ðü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½ Ìø‘íå•±±½Ý	…±±	ÕÑÑ½¸¡Ñ…É•Ñ%¥ôñÍÁ…¸±…ÍÌô‰Á±…å•É!½±•!…¹‘¥…Àˆù!À€‘í•ÍŒ¡™½Éµ…ÑA±…å¥¹!…¹‘¥…À¡Á±…å•É…¥±å!…¹‘¥…À¡Ñ…É•Ñ%°‘…ä¤¤¥ôð½ÍÁ…¸øð½‘¥Øøð½‘¥Øø‘íÍ½É•MÕµµ…Éä ‰½™™¥¥…°ˆ°Í™=™˜°Ñ½Ñ…±=™˜¹Á½¥¹ÑÌ°Ñ…É•Ñ%°Ñ…É•Ñ…É¹¥¹‘•àü¹m¥‘át€üü€ˆˆ¥ôð½‘¥Øø‘íÍ½É•¹ÑÉå½¹ÑÉ½±Ì¡ÁÕÑÑ¥¹=¸°€‰½™™¥¥…°ˆ°É•Œ¹½™™¥¥…°°€­Ñ…É•Ñ…É¹Á…Èü¹m¥‘áuññÁ…È°ÍÑ•ÁÁ•È°Á¥­ÕÀ¥ôð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰Í½É•¹ÑÉå…ÉÍ•±˜ˆøñ‘¥Ø±…ÍÌô‰Í½É•¹ÑÉå!•…ˆøñ‘¥ØøñÍµ…±°ù5I-Hð½Íµ…±°øñ‘¥Ø±…ÍÌô‰å•±±½Ý	…±±9…µ•1¥¹”ˆøñ Ì±…ÍÌôˆ‘íå•±±½Ý	…±±±…ÍÌ¡Í•±•Ñ•¥ôˆø‘í•ÍŒ¡À¹¹…µ”¥ôð½ Ìø‘íå•±±½Ý	…±±	ÕÑÑ½¸¡Í•±•Ñ•¥ôñÍÁ…¸±…ÍÌô‰Á±…å•É!½±•!…¹‘¥…Àˆù!À€‘í•ÍŒ¡™½Éµ…ÑA±…å¥¹!…¹‘¥…À¡Á±…å•É…¥±å!…¹‘¥…À¡Í•±•Ñ•°‘…ä¤¤¥ôð½ÍÁ…¸øð½‘¥Øøð½‘¥Øø‘íÍ½É•MÕµµ…Éä ‰Í•±˜ˆ°Í™M•±˜°Ñ½Ñ…±M•±˜¹Á½¥¹ÑÌ°Í•±•Ñ•°¥¹‘•áY…°¥ôð½‘¥Øø‘íÍ½É•¹ÑÉå½¹ÑÉ½±Ì¡ÁÕÑÑ¥¹=¸°€‰Í•±˜ˆ°É•Œ¹Í•±˜°Á…È°ÍÑ•ÁÁ•È°Á¥­ÕÀ¥ôð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰¡½±•9…Øˆøñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰ÁÉ•Ù!½±”ˆ€‘íÁ½Ì€ôôô€À€ü€‰‘¥Í…‰±•ˆ€è€ˆ‰ôûŠ@AÉ•Ù¥½ÕÌð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥µ…Éäˆ¥ô‰¹•áÑ!½±”ˆø‘íÁ½Ì€ôôô€ÄÜ€ü€‰%9%M I=U9ˆ€è€‰9•áÐ!½±”ƒŠH‰ôð½‰ÕÑÑ½¸øð½‘¥Øø‘íÙ¥ÉÑÕ…±±…¹•ôð½‘¥Øù€ì(€€€€ ˆ•á¥ÑM½É•…Éˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€½¹ÍÐÁÉ•Ù¥½ÕÍ5½‘”€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”°(€€€€€€€ÁÉ•Ù¥½ÕÍI•ÑÕÉ¸€ôÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•Üˆì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ô™…±Í”ì(€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôÁÉ•Ù¥½ÕÍ5½‘”ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ôÁÉ•Ù¥½ÕÍI•ÑÕÉ¸ì(€€€€€€€Í•Ñ±½Õ‘5•ÍÍ…” ‰M½É•…ÉÉ•µ…¥¹Ì½Á•¸ƒŠPÁ±•…Í”ÑÉä……¥¸¸ˆ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€É•±•…Í•I½Õ¹‘]…­•1½¬ ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€•¹‘M½É•…É‘UÁ‘…Ñ•AÉ½Ñ•Ñ¥½¸ ¤ì(€€€ôì(€€€Ý¥¹‘½Ü¹½±™M…™•±½Õü¹É•Á½ÉÑMÑ…ÑÕÌ¡±½Õ‘5•ÍÍ…”°ÍÑ½É”¹±½Õü¹•Ù•¹Ñ%¤ì(€€€¥˜€  ˆ™¥ÉÍÑ5¥Íµ…Ñ¡!½±”ˆ¤¤(€€€€€€ ˆ™¥ÉÍÑ5¥Íµ…Ñ¡!½±”ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ìì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÍ•Ä¹¥¹‘•á=˜¡µ¥Íµ…Ñ¡!½±•ÍlÁt¤ì(€€€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÁÉ•Ù¥½ÕÌì(€€€€€€€€€Í•Ñ±½Õ‘5•ÍÍ…” ‰M½É•…ÉÉ•µ…¥¹Ì½¸Ñ¡¥Ì¡½±”ƒŠPÁ±•…Í”ÑÉä……¥¸¸ˆ¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ô(€€€€€€€É•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€€€ôì(€€€¥˜€  ˆ‘¥Íµ¥ÍÍMÑ…ÉÑ¥¹!½±•±•ÉÐˆ¤¤(€€€€€€ ˆ‘¥Íµ¥ÍÍMÑ…ÉÑ¥¹!½±•±•ÉÐˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉMÑ…ÉÑ¥¹!½±•9½Ñ¥”ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉMÑ…ÉÑ¥¹!½±•9½Ñ¥”€ô¹Õ±°ì(€€€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉMÑ…ÉÑ¥¹!½±•9½Ñ¥”€ôÁÉ•Ù¥½ÕÌì(€€€€€€€€€Í•Ñ±½Õ‘5•ÍÍ…” ‰¡…¹”¹½ÐÍ…Ù•ƒŠPÁ±•…Í”ÑÉä……¥¸¸ˆ¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ô(€€€€€€€É•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€€€ôì(€€€½¹ÍÐÕÁ‘…Ñ•M½É•½¹ÑÉ½°€ô€¡¥°Ù…°¤€ôøì(€€€€€½¹ÍÐÙ…±Õ•	ÕÑÑ½¸€ô‘½Õµ•¹Ð¹ÅÕ•ÉåM•±•Ñ½È¡m‘…Ñ„µ½¹™¥É´ôˆ‘í¥‘ô‰u€¤°(€€€€€€€ÍÑ•ÁÁ•É½¹ÑÉ½°€ôÙ…±Õ•	ÕÑÑ½¸ü¹±½Í•ÍÐ ˆ¹Í½É•MÑ•ÁÁ•Èˆ¤°(€€€€€€€Á¥­ÕÁ	ÕÑÑ½¸€ô‘½Õµ•¹Ð¹ÅÕ•ÉåM•±•Ñ½È¡m‘…Ñ„µÁ¥­ÕÀôˆ‘í¥‘ô‰u€¤°(€€€€€€€Á¥­•€ôMÑÉ¥¹œ¡Ù…°¤¹Ñ½UÁÁ•É…Í” ¤€ôôô€‰@ˆì(€€€€€¥˜€¡Ù…±Õ•	ÕÑÑ½¸¤Ù…±Õ•	ÕÑÑ½¸¹Ñ•áÑ½¹Ñ•¹Ð€ôÁ¥­•€ü€‰@ˆ€èMÑÉ¥¹œ¡Ù…°¤ì(€€€€€¥˜€¡ÍÑ•ÁÁ•É½¹ÑÉ½°¤ì(€€€€€€€ÍÑ•ÁÁ•É½¹ÑÉ½°¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ‰Õ¹Í•Ðˆ¤ì(€€€€€€€ÍÑ•ÁÁ•É½¹ÑÉ½°¹±…ÍÍ1¥ÍÐ¹…‘ ‰Í•Ðˆ¤ì(€€€€€ô(€€€€€¥˜€¡Á¥­ÕÁ	ÕÑÑ½¸¤ì(€€€€€€€Á¥­ÕÁ	ÕÑÑ½¸¹±…ÍÍ1¥ÍÐ¹Ñ½±” ‰Á¥­•ˆ°Á¥­•¤ì(€€€€€€€Á¥­ÕÁ	ÕÑÑ½¸¹Ñ•áÑ½¹Ñ•¹Ð€ôÁ¥­•(€€€€€€€€€€üÁ¥­ÕÁ	ÕÑÑ½¸¹±½Í•ÍÐ ˆ¹Á¥­ÕÁ½¹ÑÉ½°ˆ¤(€€€€€€€€€€€€ü€‹ŠrLA%,µU@€¡@¤ˆ(€€€€€€€€€€€€è€‹ŠrLA%,µU@I=I€¡@¤ˆ(€€€€€€€€€€è€‰@ƒŠPA%,µU@ˆì(€€€€€ô(€€€ôì(€€€½¹ÍÐÕÁ‘…Ñ•M½É•MÕµµ…Éä€ô€¡Í•Ñ¥½¸¤€ôøì(€€€€€½¹ÍÐÁ±…å•É%€ôÍ•Ñ¥½¸€ôôô€‰½™™¥¥…°ˆ€üÑ…É•Ñ%€èÍ•±•Ñ•°(€€€€€€€…É€ôÍ•Ñ¥½¸€ôôô€‰½™™¥¥…°ˆ€üÑ…É•Ñ…É€èØ°(€€€€€€€¡…¹‘¥…À€ôÍ•Ñ¥½¸€ôôô€‰½™™¥¥…°ˆ€ü¡ÁQ…É•Ð€è¡ÁM•±˜°(€€€€€€€ÕÉÉ•¹Ð€ôÍÑ…‰±•™½É‘A½¥¹ÑÌ (€€€€€€€€€É•mÍ•Ñ¥½¹t¹É½ÍÌ°(€€€€€€€€€€¬¡…É¹Á…Èü¹m¥‘átñð€À¤°(€€€€€€€€€…É¹¥¹‘•àü¹m¥‘át€üü€ˆˆ°(€€€€€€€€€¡…¹‘¥…À°(€€€€€€€€¤°(€€€€€€€Ñ½Ñ…°€ôÉÕ¹¹¥¹œ¡Í•Ñ¥½¸°¡…¹‘¥…À°Á±…å•É%¤¹Á½¥¹ÑÌ°(€€€€€€€ÍÕµµ…Éä€ô‘½Õµ•¹Ð¹ÅÕ•ÉåM•±•Ñ½È¡m‘…Ñ„µÍ½É”µÍÕµµ…Éäôˆ‘íÍ•Ñ¥½¹ô‰u€¤ì(€€€€€¥˜€¡ÍÕµµ…Éä¤(€€€€€€€ÍÕµµ…Éä¹½ÕÑ•É!Q50€ôÍ½É•MÕµµ…Éä (€€€€€€€€€Í•Ñ¥½¸°(€€€€€€€€€ÕÉÉ•¹Ð°(€€€€€€€€€Ñ½Ñ…°°(€€€€€€€€€Á±…å•É%°(€€€€€€€€€…É¹¥¹‘•àü¹m¥‘át€üü€ˆˆ°(€€€€€€€€¤ì(€€€ôì(€€€½¹ÍÐÍ¡½ÝM½É•M…Ù•…¥±ÕÉ”€ô€ ¤€ôøì(€€€€€Í•Ñ±½Õ‘5•ÍÍ…” ‰M½É”¹½ÐÍ…Ù•ƒŠPÁ±•…Í”ÑÉä……¥¸¸ˆ¤ì(€€€€€½¹ÍÐ‰ÕÑÑ½¸€ô€ ˆ¹•áÑ!½±”ˆ¤ì(€€€€€¥˜€¡‰ÕÑÑ½¸¤‰ÕÑÑ½¸¹‘¥Í…‰±•€ô™…±Í”ì(€€€ôì(€€€½¹ÍÐÍ•Ñ¥•±€ô€¡¥°Ù…°¤€ôøì(€€€€€½¹ÍÐmÍ•Ñ¥½¸°­•åt€ô¥¹ÍÑ…ÉÑÍ]¥Ñ  ‰½™™¥¥…°ˆ¤(€€€€€€€€ül‰½™™¥¥…°ˆ°¥€ôôô€‰½™™¥¥…±É½ÍÌˆ€ü€‰É½ÍÌˆ€è€‰ÁÕÑÑÌ‰t(€€€€€€€€èl‰Í•±˜ˆ°¥€ôôô€‰Í•±™É½ÍÌˆ€ü€‰É½ÍÌˆ€è€‰ÁÕÑÑÌ‰tì(€€€€€½¹ÍÐÁÉ•Ù¥½ÕÍY…±Õ”€ôÉ•mÍ•Ñ¥½¹um­•åt°(€€€€€€€ÁÉ•Ù¥½ÕÍ5•Ñ„€ô)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡Í½É•ÉMÑ½É”¡‘…ä°Í•±•Ñ•¤¹}µ•Ñ„ñðíô¤¤°(€€€€€€€ÁÉ•Ù¥½ÕÍ¥¹…±¥Í•€ôÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•ü¹l‰‘…äˆ€¬‘…åtü¹mÍ•±•Ñ•‘tì(€€€€€É•mÍ•Ñ¥½¹um­•åt€ôÙ…°ì(€€€€€½¹ÍÐÉ½Õ¹€ôÍ½É•ÉMÑ½É”¡‘…ä°Í•±•Ñ•¤ì(€€€€€¥˜€¡É½Õ¹¹}µ•Ñ„ü¹™¥¹…±¥Í•‘Ð¤‘•±•Ñ”É½Õ¹¹}µ•Ñ„¹™¥¹…±¥Í•‘Ðì(€€€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•ü¹l‰‘…äˆ€¬‘…åt¤(€€€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åumÍ•±•Ñ•‘tì(€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€É•mÍ•Ñ¥½¹um­•åt€ôÁÉ•Ù¥½ÕÍY…±Õ”ì(€€€€€€€É½Õ¹¹}µ•Ñ„€ôÁÉ•Ù¥½ÕÍ5•Ñ„ì(€€€€€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•ü¹l‰‘…äˆ€¬‘…åt¤ì(€€€€€€€€€¥˜€¡ÁÉ•Ù¥½ÕÍ¥¹…±¥Í•€ôôôÕ¹‘•™¥¹•¤(€€€€€€€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åumÍ•±•Ñ•‘tì(€€€€€€€€€•±Í”(€€€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘l‰‘…äˆ€¬‘…åumÍ•±•Ñ•‘t€ôÁÉ•Ù¥½ÕÍ¥¹…±¥Í•ì(€€€€€€€ô(€€€€€€€Í¡½ÝM½É•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€É•ÑÕÉ¸™…±Í”ì(€€€€€ô(€€€€€ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°Í•±•Ñ•¤ì(€€€€€€¼¼-••ÀÑ¡”…ÑÕ…°Í½É”‰ÕÑÑ½¹Ì¥¸Á±…”Õ¹Ñ¥°Ñ¡”Á±…å•È¡½½Í•ÌÑ¡”(€€€€€€¼¼¹•áÐ¡½±”¸I•Á±…¥¹œÑ¡”Ý¡½±”Í½É¥¹œ=4…™Ñ•È•Ù•ÉäÙ…±Õ”…¸É•µ½Ù”(€€€€€€¼¼Ñ¡”¹•áÐ‰ÕÑÑ½¸‰•ÑÝ••¸Ñ½Õ µ‘½Ý¸…¹±¥¬½¸„™…ÍÐÁ¡½¹”•¹ÑÉä¸(€€€€€ÕÁ‘…Ñ•M½É•½¹ÑÉ½°¡¥°Ù…°¤ì(€€€€€ÕÁ‘…Ñ•M½É•MÕµµ…Éä¡Í•Ñ¥½¸¤ì(€€€€€É•ÑÕÉ¸ÑÉÕ”ì(€€€ôì(€€€€ ‰m‘…Ñ„µÍÑ•Átˆ¤¹™½É…  (€€€€€€¡‰Ñ¸¤€ôø(€€€€€€€€¡‰Ñ¸¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€½¹ÍÐ¥€ô‰Ñ¸¹‘…Ñ…Í•Ð¹ÍÑ•À°(€€€€€€€€€€€Í•Ñ¥½¸€ô¥¹ÍÑ…ÉÑÍ]¥Ñ  ‰½™™¥¥…°ˆ¤€ü€‰½™™¥¥…°ˆ€è€‰Í•±˜ˆ°(€€€€€€€€€€€­•ä€ô¥¹•¹‘Í]¥Ñ  ‰É½ÍÌˆ¤€ü€‰É½ÍÌˆ€è€‰ÁÕÑÑÌˆ°(€€€€€€€€€€€‰…Í”€ô­•ä€ôôô€‰É½ÍÌˆ€üÁ…Èñð€Ð€è€È°(€€€€€€€€€€€µ¥¸€ô­•ä€ôôô€‰É½ÍÌˆ€ü€Ä€è€À°(€€€€€€€€€€€µ…à€ô­•ä€ôôô€‰É½ÍÌˆ€ü€ÈÀ€è€ä°(€€€€€€€€€€€ÕÉÉ•¹Ð€ô(€€€€€€€€€€€€€É•mÍ•Ñ¥½¹um­•åt€ôôô€ˆˆñð(€€€€€€€€€€€€€É•mÍ•Ñ¥½¹um­•åt€ôô¹Õ±°ñð(€€€€€€€€€€€€€MÑÉ¥¹œ¡É•mÍ•Ñ¥½¹um­•åt¤¹Ñ½UÁÁ•É…Í” ¤€ôôô€‰@ˆ(€€€€€€€€€€€€€€€€ü‰…Í”(€€€€€€€€€€€€€€€€è€­É•mÍ•Ñ¥½¹um­•åtì(€€€€€€€€€Í•Ñ¥•± (€€€€€€€€€€€¥°(€€€€€€€€€€€5…Ñ ¹µ…à¡µ¥¸°5…Ñ ¹µ¥¸¡µ…à°ÕÉÉ•¹Ð€¬€­‰Ñ¸¹‘…Ñ…Í•Ð¹‘•±Ñ„¤¤°(€€€€€€€€€€¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ‰m‘…Ñ„µÁ¥­ÕÁtˆ¤¹™½É…  (€€€€€€¡‰Ñ¸¤€ôø(€€€€€€€€¡‰Ñ¸¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€Í•Ñ¥•±¡‰Ñ¸¹‘…Ñ…Í•Ð¹Á¥­ÕÀ°€‰@ˆ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ‰m‘…Ñ„µ½¹™¥Éµtˆ¤¹™½É…  (€€€€€€¡‰Ñ¸¤€ôø(€€€€€€€€¡‰Ñ¸¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€½¹ÍÐ¥€ô‰Ñ¸¹‘…Ñ…Í•Ð¹½¹™¥É´°(€€€€€€€€€€€Í•Ñ¥½¸€ô¥¹ÍÑ…ÉÑÍ]¥Ñ  ‰½™™¥¥…°ˆ¤€ü€‰½™™¥¥…°ˆ€è€‰Í•±˜ˆ°(€€€€€€€€€€€­•ä€ô¥¹•¹‘Í]¥Ñ  ‰É½ÍÌˆ¤€ü€‰É½ÍÌˆ€è€‰ÁÕÑÑÌˆì(€€€€€€€€€¥˜€¡É•mÍ•Ñ¥½¹um­•åt€ôôô€ˆˆñðÉ•mÍ•Ñ¥½¹um­•åt€ôô¹Õ±°¤(€€€€€€€€€€€Í•Ñ¥•±¡¥°€­‰Ñ¸¹‘…Ñ…Í•Ð¹‰…Í”¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€¥˜€  ˆå•Í9ÑÀˆ¤¤(€€€€€€ ˆå•Í9ÑÀˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€¥˜€ …¹ÑÁM½É•MÕÁÁ½ÉÑÍ±…¥´¡‘…ä°É•Œ¤¤ì(€€€€€€€€€…±•ÉÐ (€€€€€€€€€€€9Q@…¹¹½Ð‰”É•½É‘•™½È€‘íÑ…É•Ðü¹¹…µ”ñð€‰Ñ¡¥ÌÁ±…å•È‰ô¸Q¡”Í½É”µÕÍÐÍ¡½ÜÑ¡…ÐÑ¡”Ñ•”Í¡½ÐÉ•…¡•Ñ¡”É••¸èÁÕÑÑÌµÕÍÐ•ÅÕ…°Ñ½Ñ…°ÍÑÉ½­•Ìµ¥¹ÕÌ½¹”€¡™½È•á…µÁ±”€ÈÍÑÉ½­•Ì…¹€ÄÁÕÑÐ°½È€ÐÍÑÉ½­•Ì…¹€ÌÁÕÑÑÌ¤¹€°(€€€€€€€€€€¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ô(€€€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ô)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡É•Œ¹¹ÑÀñðíô¤¤ì(€€€€€€€¥˜€ …É•Œ¹¹ÑÀ¹Á•¹‘¥¹œ¤ì(€€€€€€€€€É•Œ¹¹ÑÀ¹Á•¹‘¥¹œ€ôÑÉÕ”ì(€€€€€€€ô•±Í”ì(€€€€€€€€€É•Œ¹¹ÑÀ¹Á•¹‘¥¹œ€ô™…±Í”ì(€€€€€€€€€É•Œ¹¹ÑÀ¹•¹ÑÉ…¹Ñ%€ôÑ…É•Ñ%ì(€€€€€€€€€É•Œ¹¹ÑÀ¹½¹™¥Éµ•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€€€ô(€€€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€€€É•Œ¹¹ÑÀ€ôÁÉ•Ù¥½ÕÌì(€€€€€€€€€Í¡½ÝM½É•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ô(€€€€€€€ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°Í•±•Ñ•¤ì(€€€€€€€É•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€€€ôì(€€€¥˜€  ˆÕ¹‘½9ÑÀˆ¤¤(€€€€€€ ˆÕ¹‘½9ÑÀˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ô)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡É•Œ¹¹ÑÀñðíô¤¤ì(€€€€€€€É•Œ¹¹ÑÀ¹½¹™¥Éµ•‘Ð€ô¹Õ±°ì(€€€€€€€É•Œ¹¹ÑÀ¹•¹ÑÉ…¹Ñ%€ô¹Õ±°ì(€€€€€€€É•Œ¹¹ÑÀ¹Á•¹‘¥¹œ€ô™…±Í”ì(€€€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€€€É•Œ¹¹ÑÀ€ôÁÉ•Ù¥½ÕÌì(€€€€€€€€€Í¡½ÝM½É•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ô(€€€€€€€ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°Í•±•Ñ•¤ì(€€€€€€€É•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€€€ôì(€€€¥˜€  ˆå•±±½Ý	…±±1½ÍÐˆ¤¤(€€€€€€ ˆå•±±½Ý	…±±1½ÍÐˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÉ•Œ¹å•±±½Ý	…±°(€€€€€€€€€€ü)M=8¹Á…ÉÍ”¡)M=8¹ÍÑÉ¥¹¥™ä¡É•Œ¹å•±±½Ý	…±°¤¤(€€€€€€€€€€èÕ¹‘•™¥¹•ì(€€€€€€€¥˜€¡å•±±½Ý	…±±1½ÍÑ!•É”¤ì(€€€€€€€€€‘•±•Ñ”É•Œ¹å•±±½Ý	…±°ì(€€€€€€€ô•±Í”ì(€€€€€€€€€¥˜€ (€€€€€€€€€€€€…½¹™¥É´ (€€€€€€€€€€€€€½¹™¥É´Ñ¡…Ð€‘í•Ù•¹ÑA±…å•È¡å•±±½Ý	…±±A±…å•É%°‘…ä¤ü¹¹…µ”ñð€‰Ñ¡”¹½µ¥¹…Ñ•Á±…å•È‰ô±½ÍÐÑ¡”e•±±½Ü	…±°½¸!½±”€‘í¡½±•ôüe•±±½Ü	…±°Í½É¥¹œ™½ÈÑ¡¥ÌÑ•…´Ý¥±°ÍÑ½À‰•™½É”Ñ¡¥Ì¡½±”¹€°(€€€€€€€€€€€€¤(€€€€€€€€€€¤(€€€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€É•Œ¹å•±±½Ý	…±°€ôì(€€€€€€€€€€€±½ÍÐèÑÉÕ”°(€€€€€€€€€€€Á±…å•É%èMÑÉ¥¹œ¡å•±±½Ý	…±±A±…å•É%¤°(€€€€€€€€€€€…Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€€€€€ôì(€€€€€€€ô(€€€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€€€¥˜€¡ÁÉ•Ù¥½ÕÌ€ôôôÕ¹‘•™¥¹•¤‘•±•Ñ”É•Œ¹å•±±½Ý	…±°ì(€€€€€€€€€•±Í”É•Œ¹å•±±½Ý	…±°€ôÁÉ•Ù¥½ÕÌì(€€€€€€€€€Í¡½ÝM½É•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ô(€€€€€€€ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°Í•±•Ñ•¤ì(€€€€€€€É•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€€€ôì(€€€€ ‰m‘…Ñ„µ½Ñ½¡½±•tˆ¤¹™½É…  (€€€€€€¡‰Ñ¸¤€ôø(€€€€€€€€¡‰Ñ¸¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ìì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ô€­‰Ñ¸¹‘…Ñ…Í•Ð¹½Ñ½¡½±”ì(€€€€€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÁÉ•Ù¥½ÕÌì(€€€€€€€€€€€Í¡½ÝM½É•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€ô(€€€€€€€€€É•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€¥˜€  ˆ™¥ÉÍÑ5¥ÍÍ¥¹!½±”ˆ¤¤(€€€€€€ ˆ™¥ÉÍÑ5¥ÍÍ¥¹!½±”ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ìì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÍ•Ä¹¥¹‘•á=˜¡µ¥ÍÍ¥¹!½±•ÍlÁt¤ì(€€€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÁÉ•Ù¥½ÕÌì(€€€€€€€€€Í¡½ÝM½É•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ô(€€€€€€€É•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€€€ôì(€€€¥˜€  ˆÉ•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸ˆ¤¤(€€€€€€ ˆÉ•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôì(€€€€€€€€€É•ÑÕÉ¹Q½5…É­•èÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸°(€€€€€€€€€ÍÑ…”èÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”°(€€€€€€€€€µ½‘”èÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”°(€€€€€€€ôì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ô™…±Í”ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”€ô€‰µ…É­•ˆì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰Ù•É¥™äˆì(€€€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ôÁÉ•Ù¥½ÕÌ¹É•ÑÕÉ¹Q½5…É­•ì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”€ôÁÉ•Ù¥½ÕÌ¹ÍÑ…”ì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôÁÉ•Ù¥½ÕÌ¹µ½‘”ì(€€€€€€€€€Í¡½ÝM½É•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€ô(€€€€€€€É•¹‘•ÉI½Õ¹‘Y•É¥™¥…Ñ¥½¸¡Í•±•Ñ•°‘…ä¤ì(€€€€€ôì(€€€€ ˆÁÉ•Ù!½±”ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ìì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ô5…Ñ ¹µ…à À°Á½Ì€´€Ä¤ì(€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÁÉ•Ù¥½ÕÌì(€€€€€€€Í¡½ÝM½É•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€É•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€ôì(€€€€ ˆ¹•áÑ!½±”ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€ ˆ¹•áÑ!½±”ˆ¤¹‘¥Í…‰±•€ôÑÉÕ”ì(€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôì(€€€€€€€Á½ÌèÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì°(€€€€€€€¹ÑÁ1½­•èÉ•Œ¹¹ÑÀü¹±½­•°(€€€€€€€ÍÑ…”èÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”°(€€€€€€€É•ÑÕÉ¹Q½5…É­•èÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸°(€€€€€€€µ½‘”èÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”°(€€€€€€€™ÕÉÑ¡•ÍÑA½ÌèÉ½Õ¹¹}µ•Ñ„ü¹™ÕÉÑ¡•ÍÑA½Ì°(€€€€€ôì(€€€€€¥˜€¡¹ÑÀ€˜˜É•Œ¹¹ÑÀ¹½¹™¥Éµ•‘Ð¤É•Œ¹¹ÑÀ¹±½­•€ôÑÉÕ”ì(€€€€€¥˜€¡Á½Ì€ôôô€ÄÜ¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”€ô€‰µ¥¹”ˆì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ô™…±Í”ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰Ù•É¥™äˆì(€€€€€ô•±Í”ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÁ½Ì€¬€Äì(€€€€€€€É½Õ¹¹}µ•Ñ„€ôÉ½Õ¹¹}µ•Ñ„ñðíôì(€€€€€€€É½Õ¹¹}µ•Ñ„¹™ÕÉÑ¡•ÍÑA½Ì€ô5…Ñ ¹µ…à (€€€€€€€€€€­É½Õ¹¹}µ•Ñ„¹™ÕÉÑ¡•ÍÑA½Ìñð€À°(€€€€€€€€€Á½Ì€¬€Ä°(€€€€€€€€¤ì(€€€€€ô(€€€€€¥˜€¡ÝÉ¥Ñ•1½…±MÑ½É” ¤€ôôô™…±Í”¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ôÁÉ•Ù¥½ÕÌ¹Á½Ìì(€€€€€€€É•Œ¹¹ÑÀ¹±½­•€ôÁÉ•Ù¥½ÕÌ¹¹ÑÁ1½­•ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉY•É¥™¥…Ñ¥½¹MÑ…”€ôÁÉ•Ù¥½ÕÌ¹ÍÑ…”ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É•ÑÕÉ¹Q½5…É­•‘Y•É¥™¥…Ñ¥½¸€ôÁÉ•Ù¥½ÕÌ¹É•ÑÕÉ¹Q½5…É­•ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôÁÉ•Ù¥½ÕÌ¹µ½‘”ì(€€€€€€€¥˜€¡ÁÉ•Ù¥½ÕÌ¹™ÕÉÑ¡•ÍÑA½Ì€ôôôÕ¹‘•™¥¹•¤‘•±•Ñ”É½Õ¹¹}µ•Ñ„¹™ÕÉÑ¡•ÍÑA½Ìì(€€€€€€€•±Í”É½Õ¹¹}µ•Ñ„¹™ÕÉÑ¡•ÍÑA½Ì€ôÁÉ•Ù¥½ÕÌ¹™ÕÉÑ¡•ÍÑA½Ìì(€€€€€€€Í¡½ÝM½É•M…Ù•…¥±ÕÉ” ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°Í•±•Ñ•¤ì(€€€€€¥˜€¡Á½Ì€ôôô€ÄÜ¤É•¹‘•ÉI½Õ¹‘Y•É¥™¥…Ñ¥½¸¡Í•±•Ñ•°‘…ä¤ì(€€€€€•±Í”É•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€ôì(€€€•¹…‰±•!½±•MÝ¥Á”  ˆ¹Í½É¥¹A¡½¹”ˆ¤¤ì(€ô(€™Õ¹Ñ¥½¸•¹…‰±•!½±•MÝ¥Á”¡¡½ÍÐ¤ì(€€€¥˜€ …¡½ÍÐ¤É•ÑÕÉ¸ì(€€€±•ÐÍÑ…ÉÑ`€ô€À°ÍÑ…ÉÑd€ô€À°ÍÑ…ÉÑ•‘=¹½¹ÑÉ½°€ô™…±Í”ì(€€€¡½ÍÐ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Ñ½Õ¡ÍÑ…ÉÐˆ°€¡•Ù•¹Ð¤€ôøì(€€€€€¥˜€¡•Ù•¹Ð¹Ñ½Õ¡•Ì¹±•¹Ñ €„ôô€Ä¤É•ÑÕÉ¸ì(€€€€€½¹ÍÐÑ…É•Ð€ô•Ù•¹Ð¹Ñ…É•Ðì(€€€€€ÍÑ…ÉÑ•‘=¹½¹ÑÉ½°€ô	½½±•…¸¡Ñ…É•Ð¹±½Í•ÍÐ ‰‰ÕÑÑ½¸°¥¹ÁÕÐ°Í•±•Ð°Ñ•áÑ…É•„°„°m½¹Ñ•¹Ñ•‘¥Ñ…‰±•t°‘•Ñ…¥±Ì°ÍÕµµ…Éäˆ¤¤ì(€€€€€ÍÑ…ÉÑ`€ô•Ù•¹Ð¹Ñ½Õ¡•ÍlÁt¹±¥•¹Ñ`ì(€€€€€ÍÑ…ÉÑd€ô•Ù•¹Ð¹Ñ½Õ¡•ÍlÁt¹±¥•¹Ñdì(€€€ô°ìÁ…ÍÍ¥Ù”èÑÉÕ”ô¤ì(€€€¡½ÍÐ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Ñ½Õ¡•¹ˆ°€¡•Ù•¹Ð¤€ôøì(€€€€€¥˜€¡ÍÑ…ÉÑ•‘=¹½¹ÑÉ½°ñð€…•Ù•¹Ð¹¡…¹•‘Q½Õ¡•Ì¹±•¹Ñ ¤É•ÑÕÉ¸ì(€€€€€½¹ÍÐ‘à€ô•Ù•¹Ð¹¡…¹•‘Q½Õ¡•ÍlÁt¹±¥•¹Ñ`€´ÍÑ…ÉÑ`°(€€€€€€€‘ä€ô•Ù•¹Ð¹¡…¹•‘Q½Õ¡•ÍlÁt¹±¥•¹Ñd€´ÍÑ…ÉÑdì(€€€€€¥˜€¡5…Ñ ¹…‰Ì¡‘à¤€ð€ØÀñð5…Ñ ¹…‰Ì¡‘à¤€ð5…Ñ ¹…‰Ì¡‘ä¤€¨€Ä¸Ð¤É•ÑÕÉ¸ì(€€€€€¥˜€¡‘à€ð€À¤€ ˆ¹•áÑ!½±”ˆ¤ü¹±¥¬ ¤ì(€€€€€•±Í”€ ˆÁÉ•Ù!½±”ˆ¤ü¹±¥¬ ¤ì(€€€ô°ìÁ…ÍÍ¥Ù”èÑÉÕ”ô¤ì(€ô(€™Õ¹Ñ¥½¸±•…‘•É‰½…É‘A±…å•ÉA½¥¹ÑÌ¡‘…ä°Á¥¤ì(€€€½¹ÍÐØ€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Á¥¤°(€€€€€¡À€ôÁ±…å•É…¥±å!…¹‘¥…À¡Á¥°‘…ä¤ì(€€€É•ÑÕÉ¸ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôøì(€€€€€½¹ÍÐ”€ô™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Á¥°¤€¬€Ä¤ì(€€€€€É•ÑÕÉ¸ÍÑ…‰±•™½É‘A½¥¹ÑÌ (€€€€€€€”ü¹É½ÍÌ°(€€€€€€€€¬¡Ø¹Á…Èü¹m¥tñð€À¤°(€€€€€€€Ø¹¥¹‘•àü¹m¥t€üü€ˆˆ°(€€€€€€€¡À°(€€€€€€¤ì(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸±•…‘•É‰½…É‘A±…å•ÉÉ½ÍÌ¡‘…ä°Á¥¤ì(€€€É•ÑÕÉ¸ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôøì(€€€€€½¹ÍÐœ€ô™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘…ä°Á¥°¤€¬€Ä¤ü¹É½ÍÌì(€€€€€É•ÑÕÉ¸MÑÉ¥¹œ¡œ¤¹Ñ½UÁÁ•É…Í” ¤€ôôô€‰@ˆñðœ€ôôô€ˆˆñðœ€ôô¹Õ±°(€€€€€€€€ü¹Õ±°(€€€€€€€€è€­œì(€€€ô¤ì(€ô(€™Õ¹Ñ¥½¸±•…‘•É‰½…É‘U¹¥ÑÌ¡‘…ä°ÑåÁ”°…É•…Ñ”€ô™…±Í”¤ì(€€€½¹ÍÐÍ•ÑÕÀ€ôÍÑ½É”¹•Ù•¹Ð¹É½ÕÁM•ÑÕÀü¹l‰‘…äˆ€¬‘…åt°(€€€€€½ÕÐ€ômtì(€€€¥˜€ …Í•ÑÕÀ¤É•ÑÕÉ¸½ÕÐì(€€€€¡Í•ÑÕÀ¹É½ÕÁÌñðmt¤¹™½É…  ¡É…Ü°¤¤€ôøì(€€€€€½¹ÍÐÉ½ÕÀ€ôÉ…Ü¹µ…À¡¥ôù…É•…Ñ”€üÍ¡…É•‘A½Í¥Ñ¥½¹%¡¥¤€èMÑÉ¥¹œ¡¥¤¤°(€€€€€€€É•Á±…•µ•¹Ñ9…µ”€ô€¡¥°½É¥¥¹…±%¤€ôø(€€€€€€€€€½É¥¥¹…±%€ôôô9=}AIQ9I}%(€€€€€€€€€€€€ü€‘í•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€‰Y¥ÉÑÕ…°A±…å•È‰ô€¡Y@™½È€‘í•Ù•¹ÑA±…å•È¡Í•ÑÕÀ¹µ¥ÍÍ¥¹A±…å•É%°‘…ä¤ü¹¹…µ”ñð€‰µ¥ÍÍ¥¹œÁ±…å•È‰ô¥€(€€€€€€€€€€€€è•Ù•¹ÑA±…å•É9…µ”¡¥°…É•…Ñ”€ü¹Õ±°€è‘…ä¤°(€€€€€€€™¥±±•€ô…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤(€€€€€€€€€€üÉ½ÕÀ¹™¥±Ñ•È ¡¥¤€ôø¥€„ôô9=}AIQ9I}%¤(€€€€€€€€€€èÉ½ÕÀ(€€€€€€€€€€€€€€¹µ…À ¡¥¤€ôø(€€€€€€€€€€€€€€€¥€ôôô9=}AIQ9I}%€üMÑÉ¥¹œ¡Í•ÑÕÁ½ÉQ•…´¡Í•ÑÕÀ±¤¤¹Ù¥ÉÑÕ…±A±…å•Èñð€ˆˆ¤€è¥°(€€€€€€€€€€€€€€¤(€€€€€€€€€€€€€€¹™¥±Ñ•È¡	½½±•…¸¤ì(€€€€€¥˜€¡ÑåÁ”€ôôô€‰Ñ•…´ˆ¤(€€€€€€€½ÕÐ¹ÁÕÍ ¡ì(€€€€€€€€€¥è‘í‘…åõœ‘í¥õ€°(€€€€€€€€€¥‘Ìèl¸¸¹¹•ÜM•Ð¡™¥±±•¥t°(€€€€€€€€€¹…µ”èÉ½ÕÀ€‘í¤€¬€Åõ€°(€€€€€€€€€‘•Ñ…¥°è™¥±±•(€€€€€€€€€€€€¹µ…À ¡¥°¥¹‘•à¤€ôøÉ•Á±…•µ•¹Ñ9…µ”¡¥°É½ÕÁm¥¹‘•át¤¤(€€€€€€€€€€€€¹©½¥¸ ˆ°€ˆ¤°(€€€€€€€ô¤ì(€€€€€•±Í”(€€€€€€€™½È€¡±•Ð¸€ô€Àì¸€ð€Ðì¸€¬ô€È¤ì(€€€€€€€€€½¹ÍÐ¥‘Ì€ôÉ½ÕÀ(€€€€€€€€€€€€¹Í±¥”¡¸°¸€¬€È¤(€€€€€€€€€€€€¹µ…À ¡¥¤€ôø(€€€€€€€€€€€€€¥€ôôô9=}AIQ9I}%€üMÑÉ¥¹œ¡Í•ÑÕÁ½ÉQ•…´¡Í•ÑÕÀ±¤¤¹Ù¥ÉÑÕ…±A±…å•Èñð€ˆˆ¤€è¥°(€€€€€€€€€€€€¤(€€€€€€€€€€€€¹™¥±Ñ•È¡	½½±•…¸¤ì(€€€€€€€€€¥˜€¡¥‘Ì¹±•¹Ñ ¤(€€€€€€€€€€€½ÕÐ¹ÁÕÍ ¡ì(€€€€€€€€€€€€€¥è‘í‘…åõœ‘í¥õÀ‘í¸€¼€Éõ€°(€€€€€€€€€€€€€¥‘Ìèl¸¸¹¹•ÜM•Ð¡¥‘Ì¥t°(€€€€€€€€€€€€€¹…µ”è¥‘Ì(€€€€€€€€€€€€€€€€¹µ…À ¡¥°¥¹‘•à¤€ôø(€€€€€€€€€€€€€€€€€É•Á±…•µ•¹Ñ9…µ”¡¥°É½ÕÀ¹Í±¥”¡¸°¸€¬€È¥m¥¹‘•át¤°(€€€€€€€€€€€€€€€€¤(€€€€€€€€€€€€€€€€¹©½¥¸ ˆ€˜€ˆ¤°(€€€€€€€€€€€€€‘•Ñ…¥°è(€€€€€€€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ôôô€Ä(€€€€€€€€€€€€€€€€€€üÉ½ÕÀ€‘í¤€¬€Åõ€(€€€€€€€€€€€€€€€€€€è…ä€‘í‘…åôƒ
ÜÉ½ÕÀ€‘í¤€¬€Åõ€°(€€€€€€€€€€€ô¤ì(€€€€€€€ô(€€€ô¤ì(€€€É•ÑÕÉ¸½ÕÐì(€ô(€½¹ÍÐ±•…‘•ÉMÕ´€ô€¡Ù…±Õ•Ì¤€ôø(€€€Ù…±Õ•Ì¹É•‘Õ” ¡¸°à¤€ôø¸€¬€¡à€ôô¹Õ±°€ü€À€è€­àñð€À¤°€À¤ì(€™Õ¹Ñ¥½¸±•…‘•ÉI½Ü¡¥°¹…µ”°‘•Ñ…¥°°¡½±•Ì°Ñ…É•Ð€ô€Äà¤ì(€€€É•ÑÕÉ¸ì(€€€€€¥°(€€€€€¹…µ”°(€€€€€‘•Ñ…¥°°(€€€€€¡½±•Ì°(€€€€€Ñ½Ñ…°è±•…‘•ÉMÕ´¡¡½±•Ì¤°(€€€€€Ñ¡ÉÔè¡½±•Ì¹™¥±Ñ•È ¡à¤€ôøà€„ô¹Õ±°¤¹±•¹Ñ °(€€€€€Ñ…É•Ð°(€€€€€‰!½±•Ìè¡½±•Ì°(€€€ôì(€ô(€™Õ¹Ñ¥½¸µ…¹Õ…±1•…‘•ÉI½Ü¡¥°¹…µ”°‘•Ñ…¥°°ÍÕµµ…Éä°Ñ…É•Ð€ô€Äà¤ì(€€€¥˜€ …ÍÕµµ…ÉäñðÍÕµµ…Éä¹Ñ½Ñ…°€ôôô€ˆˆñðÍÕµµ…Éä¹Ñ½Ñ…°€ôô¹Õ±°¤É•ÑÕÉ¸¹Õ±°ì(€€€½¹ÍÐÉ½Ü€ôì(€€€€€¥°(€€€€€¹…µ”°(€€€€€‘•Ñ…¥°°(€€€€€¡½±•Ìèmt°(€€€€€Ñ½Ñ…°è€­ÍÕµµ…Éä¹Ñ½Ñ…°°(€€€€€Ñ¡ÉÔèÑ…É•Ð°(€€€€€Ñ…É•Ð°(€€€€€‰!½±•Ìèmt°(€€€€€µ…¹Õ…°èÑÉÕ”°(€€€ôì(€€€¥˜€¡mÍÕµµ…Éä¹‰…¬ä°ÍÕµµ…Éä¹±…ÍÐØ°ÍÕµµ…Éä¹±…ÍÐÍt¹Í½µ” ¡Ù…±Õ”¤€ôøÙ…±Õ”€„ôô€ˆˆ€˜˜Ù…±Õ”€„ô¹Õ±°¤¤(€€€€€É½Ü¹‰Q½Ñ…±Ì€ôì(€€€€€€€‰…¬äè€¬¡ÍÕµµ…Éä¹‰…¬äñð€À¤°(€€€€€€€±…ÍÐØè€¬¡ÍÕµµ…Éä¹±…ÍÐØñð€À¤°(€€€€€€€±…ÍÐÌè€¬¡ÍÕµµ…Éä¹±…ÍÐÌñð€À¤°(€€€€€ôì(€€€É•ÑÕÉ¸É½Üì(€ô(€™Õ¹Ñ¥½¸™¥¹…±¹ÑÉå1•…‘•ÉI½Ü¡‘…ä°¥°­¥¹¤ì(€€€½¹ÍÐ•¹ÑÉä€ô™¥¹…±M½É•¹ÑÉä¡‘…ä°¥¤ì(€€€¥˜€ …•¹ÑÉäñð•¹ÑÉä¹­¥¹€„ôô­¥¹ñð€…9Õµ‰•È¹¥Í¥¹¥Ñ” ­•¹ÑÉä¹Ñ½Ñ…°¤ñð€…•¹ÑÉä¹½¹™¥Éµ•‘Ð¤É•ÑÕÉ¸¹Õ±°ì(€€€É•ÑÕÉ¸í¥éMÑÉ¥¹œ¡¥¤°¹…µ”é•Ù•¹ÑA±…å•É9…µ”¡¥±‘…ä¤°‘•Ñ…¥°è‰¥¹…°Í½É”•¹Ñ•É•ˆ°¡½±•Ìémt°Ñ½Ñ…°è­•¹ÑÉä¹Ñ½Ñ…°°Ñ¡ÉÔèÄà°Ñ…É•ÐèÄà°‰!½±•Ìémt°™¥¹…±¹ÑÉäéÑÉÕ•ôì(€ô(€™Õ¹Ñ¥½¸ÍÑÉ½­•!½±•M½É•Ì¡‘…ä°¥¤ì(€€€½¹ÍÐÉ…Ü€ô±•…‘•É‰½…É‘A±…å•ÉÉ½ÍÌ¡‘…ä±¥¤°…É€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±¥¤°µ½‘”€ôÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•M½É¥¹5½‘”ñð€‰…±±MÑÉ½­•Ìˆì(€€€¥˜€¡µ½‘”€ôôô€‰…±±MÑÉ½­•Ìˆ¤É•ÑÕÉ¸É…Üì(€€€½¹ÍÐ•áÑÉ„€ôµ½‘”€ôôô€‰µ…áQÉ¥Á±•	½•äˆ€ü€Ì€è€Èì(€€€É•ÑÕÉ¸É…Ü¹µ…À ¡É½ÍÌ±¥¹‘•à¤€ôøÉ½ÍÌ€ôô¹Õ±°€ü¹Õ±°€è5…Ñ ¹µ¥¸¡É½ÍÌ° ­…É¹Á…Èü¹m¥¹‘•áuñðÀ¤­•áÑÉ„¤¤ì(€ô(€™Õ¹Ñ¥½¸±•…‘•É½Õ¹Ñ‰…¬¡„°ˆ°¡¥¡•È€ôÑÉÕ”¤ì(€€€¥˜€¡„¹ÑÉ¥Á½Õ¹Ñ‰…¬€˜˜ˆ¹ÑÉ¥Á½Õ¹Ñ‰…¬¤ì(€€€€€™½È€¡±•Ð¥¹‘•àôÀí¥¹‘•àñ5…Ñ ¹µ¥¸¡„¹ÑÉ¥Á½Õ¹Ñ‰…¬¹±•¹Ñ ±ˆ¹ÑÉ¥Á½Õ¹Ñ‰…¬¹±•¹Ñ ¤í¥¹‘•à¬¬¤ì(€€€€€€€½¹ÍÐ‘¥™˜õˆ¹ÑÉ¥Á½Õ¹Ñ‰…­m¥¹‘•átµ„¹ÑÉ¥Á½Õ¹Ñ‰…­m¥¹‘•átì¥˜¡‘¥™˜¤É•ÑÕÉ¸‘¥™˜ì(€€€€€ô(€€€€€É•ÑÕÉ¸€Àì(€€€ô(€€€¥˜€ ¡„¹µ…¹Õ…°€˜˜€…„¹‰Q½Ñ…±Ì¤ñð€¡ˆ¹µ…¹Õ…°€˜˜€…ˆ¹‰Q½Ñ…±Ì¤¤É•ÑÕÉ¸€Àì(€€€¥˜€¡„¹‰Q½Ñ…±Ìñðˆ¹‰Q½Ñ…±Ì¤ì(€€€€€½¹ÍÐÑ½Ñ…±Ì€ô€¡É½Ü¤€ôøì(€€€€€€€€€¥˜€¡É½Ü¹‰Q½Ñ…±Ì¤É•ÑÕÉ¸É½Ü¹‰Q½Ñ…±Ìì(€€€€€€€€€½¹ÍÐÙ…±Õ•Ì€ôÉ½Ü¹‰!½±•ÌñðÉ½Ü¹¡½±•Ìñðmtì(€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€€€‰…¬äè±•…‘•ÉMÕ´¡Ù…±Õ•Ì¹Í±¥” ä°€Äà¤¤°(€€€€€€€€€€€±…ÍÐØè±•…‘•ÉMÕ´¡Ù…±Õ•Ì¹Í±¥” ÄÈ°€Äà¤¤°(€€€€€€€€€€€±…ÍÐÌè±•…‘•ÉMÕ´¡Ù…±Õ•Ì¹Í±¥” ÄÔ°€Äà¤¤°(€€€€€€€€€ôì(€€€€€€€ô°(€€€€€€€…Ð€ôÑ½Ñ…±Ì¡„¤°(€€€€€€€‰Ð€ôÑ½Ñ…±Ì¡ˆ¤°(€€€€€€€µÀ€ô€¡à°ä¤€ôø€¡¡¥¡•È€üä€´à€èà€´ä¤ì(€€€€€™½È€¡½¹ÍÐ­•ä½˜l‰‰…¬äˆ°€‰±…ÍÐØˆ°€‰±…ÍÐÌ‰t¤ì(€€€€€€€½¹ÍÐŒ€ôµÀ ¬¡…Ñm­•åtñð€À¤°€¬¡‰Ñm­•åtñð€À¤¤ì(€€€€€€€¥˜€¡Œ¤É•ÑÕÉ¸Œì(€€€€€ô(€€€€€É•ÑÕÉ¸€Àì(€€€ô(€€€½¹ÍÐ…Ø€ô„¹‰!½±•Ìñð„¹¡½±•Ì°(€€€€€‰Ø€ôˆ¹‰!½±•Ìñðˆ¹¡½±•Ì°(€€€€€µÀ€ô€¡à°ä¤€ôø€¡¡¥¡•È€üä€´à€èà€´ä¤ì(€€€™½È€¡½¹ÍÐmÌ°•t½˜l(€€€€€lä°€Äát°(€€€€€lÄÈ°€Äát°(€€€€€lÄÔ°€Äát°(€€€t¤ì(€€€€€½¹ÍÐŒ€ôµÀ¡±•…‘•ÉMÕ´¡…Ø¹Í±¥”¡Ì°”¤¤°±•…‘•ÉMÕ´¡‰Ø¹Í±¥”¡Ì°”¤¤¤ì(€€€€€¥˜€¡Œ¤É•ÑÕÉ¸Œì(€€€ô(€€€™½È€¡±•Ð¤€ô€ÄÜì¤€øô€Àì¤´´¤ì(€€€€€½¹ÍÐŒ€ôµÀ¡…Ùm¥t€üü€À°‰Ùm¥t€üü€À¤ì(€€€€€¥˜€¡Œ¤É•ÑÕÉ¸Œì(€€€ô(€€€É•ÑÕÉ¸€Àì(€ô(€™Õ¹Ñ¥½¸É…¹­1•…‘•ÉI½ÝÌ¡É½ÝÌ°¡¥¡•È€ôÑÉÕ”°ÕÍ•½Õ¹Ñ‰…¬€ô™…±Í”¤ì(€€€É½ÝÌ¹Í½ÉÐ ¡„°ˆ¤€ôøì(€€€€€½¹ÍÐÍÑ…ÉÑ•€ô€¡ˆ¹Ñ¡ÉÔ€ø€À¤€´€¡„¹Ñ¡ÉÔ€ø€À¤ì(€€€€€¥˜€¡ÍÑ…ÉÑ•¤É•ÑÕÉ¸ÍÑ…ÉÑ•ì(€€€€€½¹ÍÐŒ€ô¡¥¡•È€üˆ¹Ñ½Ñ…°€´„¹Ñ½Ñ…°€è„¹Ñ½Ñ…°€´ˆ¹Ñ½Ñ…°ì(€€€€€É•ÑÕÉ¸€ (€€€€€€€Œñð(€€€€€€€€¡ÕÍ•½Õ¹Ñ‰…¬€ü±•…‘•É½Õ¹Ñ‰…¬¡„°ˆ°¡¥¡•È¤€è€À¤ñð(€€€€€€€„¹¹…µ”¹±½…±•½µÁ…É”¡ˆ¹¹…µ”¤(€€€€€€¤ì(€€€ô¤ì(€€€É½ÝÌ¹™½É…  ¡È°¤¤€ôøì(€€€€€½¹ÍÐÁÉ•Ø€ôÉ½ÝÍm¤€´€Åt°(€€€€€€€¹•áÐ€ôÉ½ÝÍm¤€¬€Åt°(€€€€€€€Í…µ”€ô(€€€€€€€€€ÁÉ•Ø€˜˜(€€€€€€€€€	½½±•…¸¡ÁÉ•Ø¹Ñ¡ÉÔ¤€ôôô	½½±•…¸¡È¹Ñ¡ÉÔ¤€˜˜(€€€€€€€€€ÁÉ•Ø¹Ñ½Ñ…°€ôôôÈ¹Ñ½Ñ…°€˜˜(€€€€€€€€€€ …ÕÍ•½Õ¹Ñ‰…¬ñð±•…‘•É½Õ¹Ñ‰…¬¡ÁÉ•Ø°È°¡¥¡•È¤€ôôô€À¤ì(€€€€€È¹É…¹¬€ôÍ…µ”€üÁÉ•Ø¹É…¹¬€è¤€¬€Äì(€€€€€È¹Ñ¥•€ô	½½±•…¸ (€€€€€€€Í…µ”ñð(€€€€€€€€€€¡¹•áÐ€˜˜(€€€€€€€€€€€	½½±•…¸¡¹•áÐ¹Ñ¡ÉÔ¤€ôôô	½½±•…¸¡È¹Ñ¡ÉÔ¤€˜˜(€€€€€€€€€€€¹•áÐ¹Ñ½Ñ…°€ôôôÈ¹Ñ½Ñ…°€˜˜(€€€€€€€€€€€€ …ÕÍ•½Õ¹Ñ‰…¬ñð±•…‘•É½Õ¹Ñ‰…¬¡È°¹•áÐ°¡¥¡•È¤€ôôô€À¤¤°(€€€€€€¤ì(€€€€€È¹ˆ€ô	½½±•…¸ (€€€€€€€ÕÍ•½Õ¹Ñ‰…¬€˜˜(€€€€€€€€€È¹Ñ¡ÉÔ€˜˜(€€€€€€€€€¤€ôôô€À€˜˜(€€€€€€€€€É½ÝÍlÅtü¹Ñ¡ÉÔ€˜˜(€€€€€€€€€É½ÝÍlÅt¹Ñ½Ñ…°€ôôôÈ¹Ñ½Ñ…°€˜˜(€€€€€€€€€±•…‘•É½Õ¹Ñ‰…¬¡È°É½ÝÍlÅt°¡¥¡•È¤€„ôô€À°(€€€€€€¤ì(€€€ô¤ì(€€€É•ÑÕÉ¸É½ÝÌì(€ô(€™Õ¹Ñ¥½¸±•…‘•É‰½…É‘•™¥¹¥Ñ¥½¹Ì ¤ì(€€€½¹ÍÐÍ•±•Ñ•€ô¹•ÜM•Ð¡ÍÑ½É”¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹Ìñðmt¤°(€€€€€‘…åÌ€ôÍÑ½É”¹•Ù•¹Ð¹‘…åÌñð€Ä°(€€€€€‘•™Ì€ômt°(€€€€€…‘€ô€¡¥°±…‰•°°ÑåÁ”°‘…ä€ô€À°½ÁÑÌ€ôíô¤€ôø(€€€€€€€‘•™Ì¹ÁÕÍ ¡ì¥°±…‰•°°ÑåÁ”°‘…ä°Í½Á”è‘…äñð€‰½Ù•É…±°ˆ°€¸¸¹½ÁÑÌô¤ì(€€€¥˜€ (€€€€€‘…åÌ€ôôô€Ä€˜˜(€€€€€€¡Í•±•Ñ•¹¡…Ì ‰Í¥¹±”ˆ¤ñðÍ•±•Ñ•¹¡…Ì ‰½µ‰¥¹•ˆ¤¤(€€€€¤(€€€€€…‘ ‰Í¥¹±”µÄˆ°€‰M¥¹±”MÑ…‰±•™½Éˆ°€‰Í¥¹±”ˆ°€Ä°ì½Õ¹Ñ‰…¬èÑÉÕ”ô¤ì(€€€¥˜€¡‘…åÌ€ø€Ä€˜˜€¡Í•±•Ñ•¹¡…Ì ‰½µ‰¥¹•ˆ¤ñðÍ•±•Ñ•¹¡…Ì ‰Í¥¹±”ˆ¤¤¤ì(€€€€€½¹ÍÐ¥€ôÍ•±•Ñ•¹¡…Ì ‰½µ‰¥¹•ˆ¤€ü€‰½µ‰¥¹•ˆ€è€‰Í¥¹±”ˆ°(€€€€€€€™½Éµ…Ð€ô¥€ôôô€‰½µ‰¥¹•ˆ€üÍÑ½É”¹•Ù•¹Ð¹Í¥¹±•MÑ…‰±•™½É‘½Éµ…Ðñð€‰…É•…Ñ”ˆ€è€‰‘…¥±äˆ°(€€€€€€€Í•±•Ñ•‘…åÌ€ô½µÁ•Ñ¥Ñ¥½¹…åÌ¡¥¤°…É•…Ñ•=¹±ä€ô™½Éµ…Ð€ôôô€‰…É•…Ñ”ˆì(€€€€€™½È€¡½¹ÍÐ‘…ä½˜Í•±•Ñ•‘…åÌ¤…‘¡½µ‰¥¹•µ±•œµ‘í‘…åõ€°M¥¹±”MÑ…‰±•™½ÉƒŠP…ä€‘í‘…åõ€°€‰Í¥¹±”ˆ°‘…ä°ì(€€€€€€€½Õ¹Ñ‰…¬èÑÉÕ”°…Ý…É‘…‰±”è€……É•…Ñ•=¹±ä°…É•…Ñ•1•œè…É•…Ñ•=¹±ä°(€€€€€ô¤ì(€€€€€¥˜€¡™½Éµ…Ð€„ôô€‰‘…¥±äˆ¤…‘ ‰½µ‰¥¹•ˆ°M¥¹±”MÑ…‰±•™½ÉƒŠP	•ÍÐ€‘í½Õ¹Ñ¥¹I½Õ¹‘Ì ¥ô½˜€‘íÍ•±•Ñ•‘…åÌ¹±•¹Ñ¡õ€°€‰½µ‰¥¹•ˆ°€À°ì(€€€€€€€½Õ¹Ñ‰…¬èÑÉÕ”°…É•…Ñ•I•ÍÕ±ÐèÑÉÕ”°‘…åÌèÍ•±•Ñ•‘…åÌ°(€€€€€ô¤ì(€€€ô(€€€™½È€¡±•Ð‘…ä€ô€Äì‘…ä€ðô‘…åÌì‘…ä¬¬¤ì(€€€€€½¹ÍÐÍÕ™™¥à€ô‘…åÌ€ôôô€Ä€ü€ˆˆ€è€ƒŠP…ä€‘í‘…åõ€ì(€€€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰ÍÑÉ½­”ˆ°‘…ä¤€˜˜€¡ÑåÁ•½˜ÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•…¥±åI•ÍÕ±ÑÌ€ôôô€‰‰½½±•…¸ˆ€üÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•…¥±åI•ÍÕ±ÑÌ€è€¡ÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•½Õ¹Ñ¥¹5½‘”ñð€‰‘…¥±äˆ¤€ôôô€‰‘…¥±äˆ¤¤ì(€€€€€€€½¹ÍÐ™¥¹…±=¹±ä€ô‘…åM½É¥¹5•Ñ¡½¡‘…ä¤€ôôô€‰™¥¹…±É½ÍÌˆì(€€€€€€€…‘¡ÍÑÉ½­”µ¹•Ðµ‘í‘…åõ€°MÑÉ½­”9•Ð‘íÍÕ™™¥áõ€°€‰ÍÑÉ½­•9•Ðˆ°‘…ä°í±½Ý•ÈéÑÉÕ”±½Õ¹Ñ‰…¬è…™¥¹…±=¹±åô¤ì(€€€€€ô(€€€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰…µ‰É½Í”ˆ°‘…ä¤¤(€€€€€€€…‘¡…µ‰É½Í”µ‘í‘…åõ€°µ‰É½Í”‘íÍÕ™™¥áõ€°€‰…µ‰É½Í”ˆ°‘…ä°ì(€€€€€€€€€±½Ý•ÈèÑÉÕ”°(€€€€€€€€€½Õ¹Ñ‰…¬èÑÉÕ”°(€€€€€€€ô¤ì(€€€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰™½ÕÉ‰…±°ˆ°‘…ä¤¤(€€€€€€€…‘¡™½ÕÉ‰…±°µ‘í‘…åõ€°€Ñ		‘íÍÕ™™¥áõ€°€‰™½ÕÉ‰…±°ˆ°‘…ä°ì(€€€€€€€€€½Õ¹Ñ‰…¬èÑÉÕ”°(€€€€€€€ô¤ì(€€€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤¤(€€€€€€€…‘ (€€€€€€€€€ÁÕÑÑÌµ‘í‘…åõ€°(€€€€€€€€€€‘íÍÑ½É”¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€ôôô€‰Á…¥ÉÌˆ€ü€‰A…¥ÉÌˆ€è€‰Q•…´‰ôAÕÑÑ¥¹œ‘íÍÕ™™¥áõ€°(€€€€€€€€€€‰ÁÕÑÑÌˆ°(€€€€€€€€€‘…ä°(€€€€€€€€€ì±½Ý•ÈèÑÉÕ”°½Õ¹Ñ‰…¬èÑÉÕ”ô°(€€€€€€€€¤ì(€€€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰‰•ÍÐÍ½˜Ðˆ°‘…ä¤¤(€€€€€€€…‘¡‰•ÍÐÌµ‘í‘…åõ€°	•ÍÐ€Ì½˜€Ð‘íÍÕ™™¥áõ€°€‰‰•ÍÐÌˆ°‘…ä°ì½Õ¹Ñ‰…¬èÑÉÕ”ô¤ì(€€€€€¥˜€¡Í•±•Ñ•¹¡…Ì ‰å•±±½Ý	…±°ˆ¤€˜˜å•±±½Ý	…±±%Í=¸¡‘…ä¤¤(€€€€€€€…‘¡å•±±½Üµ‰…±°µ‘í‘…åõ€°e•±±½Ü	…±°‘íÍÕ™™¥áõ€°€‰å•±±½Ý	…±°ˆ°‘…ä¤ì(€€€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰ÍÉ…Ñ ˆ°‘…ä¤€˜˜€…l‰…É•…Ñ”ˆ°€‰‰•ÍÑÉ•…Ñ”‰t¹¥¹±Õ‘•Ì¡ÍÑ½É”¹•Ù•¹Ð¹ÍÉ…Ñ¡½Éµ…Ð¤¤(€€€€€€€…‘¡ÍÉ…Ñ µ‘í‘…åõ€°MÉ…Ñ ‘íÍÕ™™¥áõ€°€‰ÍÉ…Ñ ˆ°‘…ä°ì(€€€€€€€€€±½Ý•ÈèÑÉÕ”°(€€€€€€€€€½Õ¹Ñ‰…¬èÑÉÕ”°(€€€€€€€ô¤ì(€€€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰¹ÑÀˆ°‘…ä¤¤(€€€€€€€…‘¡¹ÑÀµ‘í‘…åõ€°9•…É•ÍÐÑ¡”A¥¸‘íÍÕ™™¥áõ€°€‰¹ÑÀˆ°‘…ä¤ì(€€€ô(€€€¥˜€¡Í•±•Ñ•¹¡…Ì ‰ÍÑÉ½­”ˆ¤€˜˜€¡ÑåÁ•½˜ÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•¹…‰±•€ôôô€‰‰½½±•…¸ˆ€üÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•¹…‰±•€è€¡ÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•½Õ¹Ñ¥¹5½‘”ñð€‰‘…¥±äˆ¤€„ôô€‰‘…¥±äˆ¤¤ì(€€€€€½¹ÍÐÍÑÉ½­•…åÌ€ô½µÁ•Ñ¥Ñ¥½¹…åÌ ‰ÍÑÉ½­”ˆ¤°‰•ÍÐ€ô€¡ÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•É•…Ñ•5½‘”ñðÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•½Õ¹Ñ¥¹5½‘”¤€ôôô€‰‰•ÍÑÉ•…Ñ”ˆ°(€€€€€€€½Õ¹Ð€ô‰•ÍÐ€ü5…Ñ ¹µ…à Ä°ÍÑÉ½­•…åÌ¹±•¹Ñ €´€Ä¤€èÍÑÉ½­•…åÌ¹±•¹Ñ °(€€€€€€€±…‰•°€ô‰•ÍÐ€ü	•ÍÐ€‘í½Õ¹Ñô½˜€‘íÍÑÉ½­•…åÌ¹±•¹Ñ¡õ€€è±°€‘íÍÑÉ½­•…åÌ¹±•¹Ñ¡ôÉ½Õ¹‘Í€ì(€€€€€…‘ ‰ÍÑÉ½­”µ¹•Ðµ…œˆ°MÑÉ½­”9•ÐƒŠP€‘í±…‰•±õ€°€‰ÍÑÉ½­•É•…Ñ•9•Ðˆ°€À°ì±½Ý•ÈèÑÉÕ”°½Õ¹Ñ‰…¬èÑÉÕ”°‘…åÌèÍÑÉ½­•…åÌ°½Õ¹Ðô¤ì(€€€ô(€€€¥˜€¡Í•±•Ñ•¹¡…Ì ‰ÍÉ…Ñ ˆ¤€˜˜l‰…É•…Ñ”ˆ°€‰‰•ÍÑÉ•…Ñ”‰t¹¥¹±Õ‘•Ì¡ÍÑ½É”¹•Ù•¹Ð¹ÍÉ…Ñ¡½Éµ…Ð¤¤…‘ ‰ÍÉ…Ñ µ…œˆ°ÍÑ½É”¹•Ù•¹Ð¹ÍÉ…Ñ¡½Éµ…Ð€ôôô€‰‰•ÍÑÉ•…Ñ”ˆ€üMÉ…Ñ ƒŠP	•ÍÐ€‘í5…Ñ ¹µ…à Ä°‘…åÌ€´€Ä¥ô½˜€‘í‘…åÍôÉ½Õ¹‘Í€€è€‰MÉ…Ñ ƒŠPÉ•…Ñ”½Ù•È…±°‘…åÌˆ°€‰ÍÉ…Ñ¡…É•…Ñ”ˆ°€À°í±½Ý•ÈéÑÉÕ”°½Õ¹Ñ‰…¬éÑÉÕ”°‘…åÌé•Ù•¹Ñ…åÌ ¥ô¤ì(€€€¥˜€¡Í•±•Ñ•¹¡…Ì ‰…ÁQ•…µÌˆ¤¤…‘ ‰…ÀµÑ•…µÌˆ°€‰	±…¬…ÀƒŠL]¡¥Ñ”…Àˆ°€‰…ÁQ•…µÌˆ°€À°í‘…åÌé•Ù•¹Ñ…åÌ ¥ô¤ì(€€€¥˜€¡Í•±•Ñ•¹¡…Ì ‰Á…ÈÌˆ¤¤ì(€€€€€½¹ÍÐµ½‘”€ôÁ…ÈÍ5½‘” ¤ì(€€€€€¥˜€¡l‰½Ù•É…±±A±…å•ÉÌˆ°€‰½Ù•É…±±A…¥ÉÌ‰t¹¥¹±Õ‘•Ì¡µ½‘”¤¤…‘ ‰Á…ÈÌµ…œˆ°µ½‘”€ôôô€‰½Ù•É…±±A…¥ÉÌˆ€üA…È€ÌA…¥ÉÌƒŠP€‘í‘…åÍô…åÌ€¡…ä€‘í‘…åÍôÁ…ÉÑ¹•ÉÌ¥€€èA…È€Ì%¹‘¥Ù¥‘Õ…°ƒŠP€‘í‘…åÍô…åÍ€°µ½‘”€ôôô€‰½Ù•É…±±A…¥ÉÌˆ€ü€‰Á…ÈÍ…É•…Ñ”ˆ€è€‰Á…ÈÍ¥¹‘¥Ù¥‘Õ…±…É•…Ñ”ˆ°€À°í½Õ¹Ñ‰…¬éÑÉÕ”°‘…åÌé•Ù•¹Ñ…åÌ ¥ô¤ì(€€€€€•±Í”™½È€¡½¹ÍÐ‘…ä½˜½µÁ•Ñ¥Ñ¥½¹…åÌ ‰Á…ÈÌˆ¤¤…‘¡Á…ÈÌµ‘í‘…åõ€°A…È€Ì€‘íµ½‘”€ôôô€‰‘…¥±åQ•…µÌˆ€ü€‰Q•…µÌˆ€è€‰A…¥ÉÌ‰ô‘í‘…åÌ€ôôô€Ä€ü€ˆˆ€è€ƒŠP…ä€‘í‘…åõõ€°µ½‘”€ôôô€‰‘…¥±åQ•…µÌˆ€ü€‰Á…ÈÍÑ•…´ˆ€è€‰Á…ÈÌˆ°‘…ä°í½Õ¹Ñ‰…¬éÑÉÕ•ô¤ì(€€€ô(€€€¥˜€¡Í•±•Ñ•¹¡…Ì ‰•±•Ñ¥Œˆ¤¤(€€€€€Í•±•Ñ•‘±•Ñ¥É½ÕÁÌ¡ÍÑ½É”¹•Ù•¹Ð¤¹™½É…  ¡É½ÕÀ¤€ôø(€€€€€€€…‘¡•±•Ñ¥Œ´‘íÉ½ÕÀ¹­•ä¹É•Á±…” ½my„µèÀ´åt¬½¤°€ˆ´ˆ¥õ€°±•Ñ¥ŒƒŠP€‘íÉ½ÕÀ¹½ÕÉÍ•9…µ•ôƒ
Ü…åÌ€‘íÉ½ÕÀ¹‘…åÌ¹©½¥¸ ˆ…¹€ˆ¥õ€°€‰•±•Ñ¥Œˆ°€À°ì½Õ¹Ñ‰…¬èÑÉÕ”°‘…åÌèÉ½ÕÀ¹‘…åÌ°½ÕÉÍ•-•äèÉ½ÕÀ¹­•äô¤°(€€€€€€¤ì(€€€É•ÑÕÉ¸‘•™Ìì(€ô(€™Õ¹Ñ¥½¸…±Õ±…Ñ•1•…‘•É‰½…É¡‘•˜¤ì(€€€½¹ÍÐ™¥•±€ô€¡‘…ä¤€ôø(€€€€€€€‘…å¥•±‘%‘Ì¡‘…ä¤(€€€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€€€€€¹µ…À¡¥ôù‘•˜¹‘…ä€üMÑÉ¥¹œ¡¥¤€èÍ¡…É•‘A½Í¥Ñ¥½¹%¡¥¤¤°(€€€€€Á½¥¹ÑÌ€ô€¡‘…ä°¥¤€ôø±•…‘•É‰½…É‘A±…å•ÉA½¥¹ÑÌ¡‘…ä°Í¡…É•‘ÑÕ…±%¡¥±‘…ä¤¤°(€€€€€É½ÍÌ€ô€¡‘…ä°¥¤€ôø±•…‘•É‰½…É‘A±…å•ÉÉ½ÍÌ¡‘…ä°Í¡…É•‘ÑÕ…±%¡¥±‘…ä¤¤°™¥¹…±¹ÑÉä€ô€¡‘…ä±¥¤€ôøÍÑ½É”¹•Ù•¹Ðü¹™¥¹…±M½É•Ìü¹l‰‘…äˆ­‘…åtü¹mMÑÉ¥¹œ¡¥¥tñðÍÑ½É”¹•Ù•¹Ðü¹Í½É¥¹œü¹l‰‘…äˆ­‘…åtü¹mMÑÉ¥¹œ¡¥¥tü¹}™¥¹…±M½É”ñð¹Õ±°ì(€€€±•ÐÉ½ÝÌ€ômtì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰Í¥¹±”ˆ¤(€€€€€É½ÝÌ€ô™¥•±¡‘•˜¹‘…ä¤¹µ…À ¡¥¤€ôøì(€€€€€€€½¹ÍÐÍ…Ù•õ™¥¹…±¹ÑÉä¡‘•˜¹‘…ä±¥¤í¥˜¡Í…Ù•ü¹­¥¹ôôô‰ÍÑ…‰±•™½Éˆ˜™Í…Ù•¹½¹™¥Éµ•‘Ð˜™9Õµ‰•È¹¥Í¥¹¥Ñ” ­Í…Ù•¹Ñ½Ñ…°¤¥É•ÑÕÉ¸í¥éMÑÉ¥¹œ¡¥¤±¹…µ”é•Ù•¹ÑA±…å•É9…µ”¡¥±‘•˜¹‘…ä¤±‘•Ñ…¥°è‰¥¹…°Í½É”•¹Ñ•É•ˆ±¡½±•Ìémt±Ñ½Ñ…°è­Í…Ù•¹Ñ½Ñ…°±Ñ¡ÉÔèÄà±Ñ…É•ÐèÄà±‰!½±•Ìémt±™¥¹…±¹ÑÉäéÑÉÕ•ôì(€€€€€€€½¹ÍÐµ…¹Õ…°€ôµ…¹Õ…±A±…å•ÉMÕµµ…Éä¡‘•˜¹‘…ä°¥°€‰Í¥¹±”ˆ¤ì(€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€µ…¹Õ…±1•…‘•ÉI½Ü¡¥°•Ù•¹ÑA±…å•É9…µ”¡¥°‘•˜¹‘…äñð¹Õ±°¤°€ˆˆ°µ…¹Õ…°¤ñð(€€€€€€€€€±•…‘•ÉI½Ü¡¥°•Ù•¹ÑA±…å•É9…µ”¡¥°‘•˜¹‘…äñð¹Õ±°¤°€ˆˆ°Á½¥¹ÑÌ¡‘•˜¹‘…ä°¥¤¤(€€€€€€€€¤ì(€€€€€ô¤ì(€€€¥˜€¡l‰ÍÑÉ½­•É½ÍÌˆ°‰ÍÑÉ½­•9•Ð‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤¤(€€€€€É½ÝÌ€ô™¥•±¡‘•˜¹‘…ä¤¹µ…À¡¥€ôøì(€€€€€€€½¹ÍÐÍ…Ù•õ™¥¹…±¹ÑÉä¡‘•˜¹‘…ä±¥¤í±•ÐÉ½Üì(€€€€€€€¥˜€¡Í…Ù•ü¹­¥¹ôôô‰É½ÍÌˆ˜™Í…Ù•¹½¹™¥Éµ•‘Ð˜™9Õµ‰•È¹¥Í¥¹¥Ñ” ­Í…Ù•¹Ñ½Ñ…°¤¤É½Üõí¥éMÑÉ¥¹œ¡¥¤±¹…µ”é•Ù•¹ÑA±…å•É9…µ”¡¥±‘•˜¹‘…ä¤±‘•Ñ…¥°è‰¥¹…°Í½É”•¹Ñ•É•ˆ±¡½±•Ìémt±Ñ½Ñ…°è­Í…Ù•¹Ñ½Ñ…°±Ñ¡ÉÔèÄà±Ñ…É•ÐèÄà±‰!½±•Ìémt±™¥¹…±¹ÑÉäéÑÉÕ•ôì(€€€€€€€•±Í”É½Ü€ô±•…‘•ÉI½Ü¡¥±•Ù•¹ÑA±…å•É9…µ”¡¥±‘•˜¹‘…ä¤°ˆˆ±ÍÑÉ½­•!½±•M½É•Ì¡‘•˜¹‘…ä±Í¡…É•‘ÑÕ…±%¡¥±‘•˜¹‘…ä¤¤¤ì(€€€€€€€É½Ü¹É½ÍÍQ½Ñ…°€ôÉ½Ü¹Ñ½Ñ…°ì(€€€€€€€É½Ü¹¡…¹‘¥…À€ôÁ±…å•É…¥±å!…¹‘¥…À¡Í¡…É•‘ÑÕ…±%¡¥±‘•˜¹‘…ä¤±‘•˜¹‘…ä¤ñð€Àì(€€€€€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰ÍÑÉ½­•9•Ðˆ¤É½Ü¹Ñ½Ñ…°€ôÉ½Ü¹É½ÍÍQ½Ñ…°€´É½Ü¹¡…¹‘¥…Àì(€€€€€€€É½Ü¹‘•Ñ…¥°€ô€‘í‘•˜¹ÑåÁ”€ôôô€‰ÍÑÉ½­•9•Ðˆ€üÉ½ÍÌ€‘íÉ½Ü¹É½ÍÍQ½Ñ…±ôƒ
Ü!À€‘í™½Éµ…ÑA±…å¥¹!…¹‘¥…À¡É½Ü¹¡…¹‘¥…À¥õ€€è€‰É½ÍÌÍÑÉ½­•Ì‰ô‘íÉ½Ü¹™¥¹…±¹ÑÉä€ü€ˆƒ
Ü™¥¹…°Í½É”•¹ÑÉäˆ€è€ˆ‰õ€ì(€€€€€€€É•ÑÕÉ¸É½Üì(€€€€€ô¤ì(€€€¥˜€¡l‰ÍÑÉ½­•É•…Ñ•É½ÍÌˆ°€‰ÍÑÉ½­•É•…Ñ•9•Ð‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤¤ì(€€€€€½¹ÍÐÍ•±•Ñ•‘…åÌ€ô‘•˜¹‘…åÌñð½µÁ•Ñ¥Ñ¥½¹…åÌ ‰ÍÑÉ½­”ˆ¤°½Õ¹Ð€ô‘•˜¹½Õ¹ÐñðÍ•±•Ñ•‘…åÌ¹±•¹Ñ °(€€€€€€€¹•Ð€ô‘•˜¹ÑåÁ”€ôôô€‰ÍÑÉ½­•É•…Ñ•9•Ðˆ°™¥¹¥Í¡•€ôÍ•±•Ñ•‘…åÌ¹•Ù•Éä¡•Ù•¹Ñ…å½µÁ±•Ñ”¤ì(€€€€€É½ÝÌ€ôl¸¸¹¹•ÜM•Ð¡Í•±•Ñ•‘…åÌ¹™±…Ñ5…À¡™¥•±¤¥t¹µ…À ¡¥¤€ôøì(€€€€€€€½¹ÍÐÉ½Õ¹‘Ì€ôÍ•±•Ñ•‘…åÌ¹™¥±Ñ•È ¡‘…ä¤€ôø™¥•±¡‘…ä¤¹¥¹±Õ‘•Ì¡¥¤¤¹µ…À ¡‘…ä¤€ôøì(€€€€€€€€€½¹ÍÐ…ÑÕ…°€ôÍ¡…É•‘ÑÕ…±%¡¥°‘…ä¤°Í…Ù•€ô™¥¹…±¹ÑÉä¡‘…ä°…ÑÕ…°¤°™¥¹…±É½ÍÌ€ôÍ…Ù•ü¹­¥¹€ôôô€‰É½ÍÌˆ€˜˜Í…Ù•¹½¹™¥Éµ•‘Ð€˜˜9Õµ‰•È¹¥Í¥¹¥Ñ” ­Í…Ù•¹Ñ½Ñ…°¤°(€€€€€€€€€€€¡½±•Ì€ô™¥¹…±É½ÍÌ€ümt€èÍÑÉ½­•!½±•M½É•Ì¡‘…ä°…ÑÕ…°¤°É½ÍÍQ½Ñ…°€ô™¥¹…±É½ÍÌ€ü€­Í…Ù•¹Ñ½Ñ…°€è±•…‘•ÉMÕ´¡¡½±•Ì¤°(€€€€€€€€€€€¡…¹‘¥…À€ôÁ±…å•É…¥±å!…¹‘¥…À¡…ÑÕ…°°‘…ä¤ñð€À°½µÁ±•Ñ”€ô™¥¹…±É½ÍÌñð¡½±•Ì¹•Ù•Éä ¡Ù…±Õ”¤€ôøÙ…±Õ”€„ô¹Õ±°¤°(€€€€€€€€€€€Ñ½Ñ…°€ôÉ½ÍÍQ½Ñ…°€´€¡¹•Ð€ü¡…¹‘¥…À€è€À¤ì(€€€€€€€€€É•ÑÕÉ¸ì‘…ä°¡½±•Ì°É½ÍÍQ½Ñ…°°¡…¹‘¥…À°Ñ½Ñ…°°½µÁ±•Ñ”°Ñ¡ÉÔè™¥¹…±É½ÍÌ€ü€Äà€è¡½±•Ì¹™¥±Ñ•È ¡Ù…±Õ”¤€ôøÙ…±Õ”€„ô¹Õ±°¤¹±•¹Ñ °™¥¹…±É½ÍÌôì(€€€€€€€ô¤°É…¹­•€ôl¸¸¹É½Õ¹‘Ít¹Í½ÉÐ ¡„°ˆ¤€ôø9Õµ‰•È¡ˆ¹½µÁ±•Ñ”¤€´9Õµ‰•È¡„¹½µÁ±•Ñ”¤ñð„¹Ñ½Ñ…°€´ˆ¹Ñ½Ñ…°ñðˆ¹‘…ä€´„¹‘…ä¤°(€€€€€€€€€½Õ¹Ñ•€ôÉ…¹­•¹™¥±Ñ•È ¡É½Õ¹¤€ôøÉ½Õ¹¹½µÁ±•Ñ”ñðÉ½Õ¹¹Ñ¡ÉÔ€ø€À¤¹Í±¥” À°½Õ¹Ð¤°½µÁ±•Ñ•€ôÉ½Õ¹‘Ì¹™¥±Ñ•È ¡É½Õ¹¤€ôøÉ½Õ¹¹½µÁ±•Ñ”¤¹±•¹Ñ °(€€€€€€€€€±…Ñ•ÍÐ€ôl¸¸¹½Õ¹Ñ•‘t¹Í½ÉÐ ¡„°ˆ¤€ôøˆ¹‘…ä€´„¹‘…ä¥lÁt°(€€€€€€€€€É½Ü€ô±•…‘•ÉI½Ü¡¥°•Ù•¹ÑA±…å•É9…µ”¡¥¤°€‘í½Õ¹Ð€ôôôÍ•±•Ñ•‘…åÌ¹±•¹Ñ €ü€‰±°É½Õ¹‘Ìˆ€è	•ÍÐ€‘í½Õ¹Ñô½˜€‘íÍ•±•Ñ•‘…åÌ¹±•¹Ñ¡õôƒ
Ü€‘í½µÁ±•Ñ•‘ô½µÁ±•Ñ”ƒ
Ü½Õ¹Ñ¥¹œ‘…åÌ€‘í½Õ¹Ñ•¹µ…À ¡É½Õ¹¤€ôøÉ½Õ¹¹‘…ä¤¹Í½ÉÐ ¡„°ˆ¤€ôø„€´ˆ¤¹©½¥¸ ˆ°€ˆ¤ñð€‹ŠP‰õ€°mt°½Õ¹Ð€¨€Äà¤ì(€€€€€€€É½Ü¹Ñ½Ñ…°€ô±•…‘•ÉMÕ´¡½Õ¹Ñ•¹µ…À ¡É½Õ¹¤€ôøÉ½Õ¹¹Ñ½Ñ…°¤¤ì(€€€€€€€É½Ü¹É½ÍÍQ½Ñ…°€ô±•…‘•ÉMÕ´¡½Õ¹Ñ•¹µ…À ¡É½Õ¹¤€ôøÉ½Õ¹¹É½ÍÍQ½Ñ…°¤¤ì(€€€€€€€É½Ü¹¡…¹‘¥…À€ô±•…‘•ÉMÕ´¡½Õ¹Ñ•¹µ…À ¡É½Õ¹¤€ôøÉ½Õ¹¹¡…¹‘¥…À¤¤ì(€€€€€€€É½Ü¹Ñ¡ÉÔ€ô±•…‘•ÉMÕ´¡½Õ¹Ñ•¹µ…À ¡É½Õ¹¤€ôøÉ½Õ¹¹Ñ¡ÉÔ¤¤ì(€€€€€€€É½Ü¹‰!½±•Ì€ô±…Ñ•ÍÐü¹¡½±•Ìñðmtì(€€€€€€€É½Ü¹µ…¹Õ…°€ô½Õ¹Ñ•¹Í½µ” ¡É½Õ¹¤€ôøÉ½Õ¹¹™¥¹…±É½ÍÌ¤ì(€€€€€€€É½Ü¹¥¹ÍÕ™™¥¥•¹ÑI½Õ¹‘Ì€ô½µÁ±•Ñ•€ð½Õ¹Ðì(€€€€€€€¥˜€¡™¥¹¥Í¡•€˜˜½µÁ±•Ñ•€ð½Õ¹Ð¤ì(€€€€€€€€€É½Ü¹‘¥ÍÅÕ…±¥™¥•€ôÑÉÕ”ì(€€€€€€€€€É½Ü¹‘¥ÍÅÕ…±¥™¥…Ñ¥½¹I•…Í½¸€ô€‘í½µÁ±•Ñ•‘ô½µÁ±•Ñ•É½Õ¹‘Ìì€‘í½Õ¹ÑôÉ•ÅÕ¥É•‘€ì(€€€€€€€ô(€€€€€€€É•ÑÕÉ¸É½Üì(€€€€€ô¤ì(€€€ô(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰½µ‰¥¹•ˆ¤ì(€€€€€½¹ÍÐÍ•±•Ñ•‘…åÌ€ô‘•˜¹‘…åÌñð½µÁ•Ñ¥Ñ¥½¹…åÌ ‰½µ‰¥¹•ˆ¤°½Õ¹Ð€ô½Õ¹Ñ¥¹I½Õ¹‘Ì ¤ì(€€€€€É½ÝÌ€ôl¸¸¹¹•ÜM•Ð¡Í•±•Ñ•‘…åÌ¹™±…Ñ5…À¡™¥•±¤¥t¹µ…À¡¥€ôøì(€€€€€€€½¹ÍÐÉ½Õ¹‘Ì€ôÍ•±•Ñ•‘…åÌ¹™¥±Ñ•È¡‘…ä€ôø™¥•±¡‘…ä¤¹¥¹±Õ‘•Ì¡¥¤¤¹µ…À¡‘…ä€ôøì(€€€€€€€€€½¹ÍÐ…ÑÕ…°õÍ¡…É•‘ÑÕ…±%¡¥±‘…ä¤°™¥¹…°õ™¥¹…±¹ÑÉä¡‘…ä±…ÑÕ…°¤°µ…¹Õ…°€ôµ…¹Õ…±A±…å•ÉMÕµµ…Éä¡‘…ä°…ÑÕ…°°€‰Í¥¹±”ˆ¤°¡½±•Ì€ôÁ½¥¹ÑÌ¡‘…ä°¥¤°™¥¹…±MÑ…‰±•™½Éõ™¥¹…°ü¹­¥¹ôôô‰ÍÑ…‰±•™½Éˆ˜™™¥¹…°¹½¹™¥Éµ•‘Ðì(€€€€€€€€€É•ÑÕÉ¸í‘…ä°µ…¹Õ…°°™¥¹…°é™¥¹…±MÑ…‰±•™½É°¡½±•Ì°Ñ½Ñ…°è™¥¹…±MÑ…‰±•™½É€ü€­™¥¹…°¹Ñ½Ñ…°€èµ…¹Õ…°€ü€­µ…¹Õ…°¹Ñ½Ñ…°€è±•…‘•ÉMÕ´¡¡½±•Ì¤°(€€€€€€€€€€€½µÁ±•Ñ”è	½½±•…¸¡™¥¹…±MÑ…‰±•™½É‘ññµ…¹Õ…°¤ñð¡½±•Ì¹•Ù•Éä¡Ù…±Õ”€ôøÙ…±Õ”€„ô¹Õ±°¤°(€€€€€€€€€€€Ñ¡ÉÔè™¥¹…±MÑ…‰±•™½É‘ññµ…¹Õ…°€ü€Äà€è¡½±•Ì¹™¥±Ñ•È¡Ù…±Õ”€ôøÙ…±Õ”€„ô¹Õ±°¤¹±•¹Ñ¡ôì(€€€€€€€ô¤ì(€€€€€€€½¹ÍÐÉ…¹­•€ôl¸¸¹É½Õ¹‘Ít¹Í½ÉÐ ¡„±ˆ¤€ôø9Õµ‰•È¡ˆ¹½µÁ±•Ñ”¤µ9Õµ‰•È¡„¹½µÁ±•Ñ”¤ñðˆ¹Ñ½Ñ…°µ„¹Ñ½Ñ…°ñðˆ¹‘…äµ„¹‘…ä¤°(€€€€€€€€€½Õ¹Ñ•€ôÉ…¹­•¹™¥±Ñ•È¡É½Õ¹€ôøÉ½Õ¹¹½µÁ±•Ñ”ñðÉ½Õ¹¹Ñ¡ÉÔ€ø€À¤¹Í±¥” À±½Õ¹Ð¤°½µÁ±•Ñ•€ôÉ½Õ¹‘Ì¹™¥±Ñ•È¡É½Õ¹€ôøÉ½Õ¹¹½µÁ±•Ñ”¤¹±•¹Ñ °(€€€€€€€€€±…ÍÐ€ôl¸¸¹½Õ¹Ñ•‘t¹Í½ÉÐ ¡„±ˆ¤€ôøˆ¹‘…äµ„¹‘…ä¥lÁt°(€€€€€€€€€É½Ü€ô±•…‘•ÉI½Ü¡¥°•Ù•¹ÑA±…å•É9…µ”¡¥°‘•˜¹‘…äñð¹Õ±°¤°	•ÍÐ€‘í½Õ¹Ñô½˜€‘íÍ•±•Ñ•‘…åÌ¹±•¹Ñ¡ôƒ
Ü€‘í½µÁ±•Ñ•‘ô½µÁ±•Ñ”ƒ
Ü½Õ¹Ñ¥¹œ‘…åÌ€‘í½Õ¹Ñ•¹µ…À¡ÈôùÈ¹‘…ä¤¹Í½ÉÐ ¡„±ˆ¤ôù„µˆ¤¹©½¥¸ ˆ°€ˆ¤ñð€‹ŠP‰õ€°mt°½Õ¹Ð¨Äà¤ì(€€€€€€€É½Ü¹Ñ½Ñ…°€ô½Õ¹Ñ•¹É•‘Õ” ¡Ñ½Ñ…°±É½Õ¹¤€ôøÑ½Ñ…°­É½Õ¹¹Ñ½Ñ…°°À¤ì(€€€€€€€É½Ü¹Ñ¡ÉÔ€ô½Õ¹Ñ•¹É•‘Õ” ¡Ñ½Ñ…°±É½Õ¹¤€ôøÑ½Ñ…°­É½Õ¹¹Ñ¡ÉÔ°À¤ì(€€€€€€€É½Ü¹‰!½±•Ì€ô±…ÍÐü¹¡½±•Ìñðmtì(€€€€€€€¥˜€¡±…ÍÐü¹µ…¹Õ…°¤É½Ü¹‰Q½Ñ…±Ì€ôí‰…¬äè­±…ÍÐ¹µ…¹Õ…°¹‰…¬åñðÀ±±…ÍÐØè­±…ÍÐ¹µ…¹Õ…°¹±…ÍÐÙñðÀ±±…ÍÐÌè­±…ÍÐ¹µ…¹Õ…°¹±…ÍÐÍñðÁôì(€€€€€€€¥˜€¡•Ù•¹Ñ…åÌ ¤¹±•¹Ñ €ø€È¤É½Ü¹ÑÉ¥Á½Õ¹Ñ‰…¬€ô½Õ¹Ñ•¹™¥±Ñ•È¡É½Õ¹ôùÉ½Õ¹¹½µÁ±•Ñ”¤¹µ…À¡É½Õ¹ôùÉ½Õ¹¹Ñ½Ñ…°¤¹Í½ÉÐ ¡„±ˆ¤ôù„µˆ¤ì(€€€€€€€É½Ü¹µ…¹Õ…°€ô½Õ¹Ñ•¹Í½µ”¡É½Õ¹ôùÉ½Õ¹¹µ…¹Õ…±ññÉ½Õ¹¹™¥¹…°¤ì(€€€€€€€É½Ü¹¥¹ÍÕ™™¥¥•¹ÑI½Õ¹‘Ì€ô½µÁ±•Ñ•€ð½Õ¹Ðì(€€€€€€€€¼¼½±™•ÈÝ¡¼Í…Ð½ÕÐÑ½¼µ…¹ä‘…åÌÉ•µ…¥¹ÌÙ¥Í¥‰±”°‰ÕÐ¥Ì¥¹•±¥¥‰±”™½ÈÑ¡”½Ù•É…±°ÁÉ¥é”¸(€€€€€€€¥˜€¡Í•±•Ñ•‘…åÌ¹•Ù•Éä¡•Ù•¹Ñ…å½µÁ±•Ñ”¤€˜˜½µÁ±•Ñ•€ð½Õ¹Ð¤ì(€€€€€€€€€É½Ü¹‘¥ÍÅÕ…±¥™¥•€ôÑÉÕ”ìÉ½Ü¹‘¥ÍÅÕ…±¥™¥…Ñ¥½¹I•…Í½¸€ô€‘í½µÁ±•Ñ•‘ô½µÁ±•Ñ•É½Õ¹‘Ìì€‘í½Õ¹ÑôÉ•ÅÕ¥É•‘€ì(€€€€€€€ô(€€€€€€€É•ÑÕÉ¸É½Üì(€€€€€ô¤ì(€€€ô(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰…µ‰É½Í”ˆ¤(€€€€€É½ÝÌ€ô±•…‘•É‰½…É‘U¹¥ÑÌ¡‘•˜¹‘…ä°€‰Ñ•…´ˆ¤¹µ…À ¡Õ¹¥Ð¤€ôøì(€€€€€€€½¹ÍÐÉ½ÕÁ%¹‘•à€ô€­MÑÉ¥¹œ¡Õ¹¥Ð¹¥¤¹É•Á±…” ½y‘q­œ¼°€ˆˆ¤°(€€€€€€€€€É½±•Ì€ô…µ‰É½Í•I½±•Ì¡‘•˜¹‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€€€€€¡½±•Ì€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôøì(€€€€€€€€€€€½¹ÍÐÙ…±Õ”€ôÍ½É•ÉMÑ½É”¡‘•˜¹‘…ä°É½±•Ì¹Í½É•É%¤ü¹l(€€€€€€€€€€€€€MÑÉ¥¹œ¡¥¹‘•à€¬€Ä¤(€€€€€€€€€€€tü¹Í•±˜ü¹É½ÍÌì(€€€€€€€€€€€É•ÑÕÉ¸Í½É•¹Ñ•É•¡Ù…±Õ”¤€ü€­Ù…±Õ”€è¹Õ±°ì(€€€€€€€€€ô¤°(€€€€€€€€€É½Ü€ô±•…‘•ÉI½Ü¡Õ¹¥Ð¹¥°Õ¹¥Ð¹¹…µ”°Õ¹¥Ð¹‘•Ñ…¥°°¡½±•Ì¤°(€€€€€€€€€¡…¹‘¥…À€ô…µ‰É½Í•Q•…µ!…¹‘¥…À¡‘•˜¹‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€€€€€µ¥¹¥µÕ´€ô€­ÍÑ½É”¹•Ù•¹Ð¹…µ‰É½Í•5¥¹¥µÕµÉ¥Ù•Ìñð€À°(€€€€€€€€€‘É¥Ù•½Õ¹ÑÌ€ô…µ‰É½Í•É¥Ù•½Õ¹ÑÌ¡‘•˜¹‘…ä°É½ÕÁ%¹‘•à°É½±•Ì¹Í½É•É%¤°(€€€€€€€€€Í¡½ÉÑÉ¥Ù•Ì€ôÉ½±•Ì¹Ñ•…´¹™¥±Ñ•È ¡¥¤€ôø€¡‘É¥Ù•½Õ¹ÑÍm¥‘tñð€À¤€ðµ¥¹¥µÕ´¤ì(€€€€€€€É½Ü¹É½ÍÍQ½Ñ…°€ôÉ½Ü¹Ñ½Ñ…°ì(€€€€€€€É½Ü¹¡…¹‘¥…À€ô¡…¹‘¥…Àì(€€€€€€€É½Ü¹‘¥ÍÅÕ…±¥™¥•€ôÉ½Ü¹Ñ¡ÉÔ€ôôô€Äà€˜˜Í¡½ÉÑÉ¥Ù•Ì¹±•¹Ñ €ø€Àì(€€€€€€€É½Ü¹‘¥ÍÅÕ…±¥™¥…Ñ¥½¹I•…Í½¸€ôÍ¡½ÉÑÉ¥Ù•Ì(€€€€€€€€€€¹µ…À ¡¥¤€ôø€‘í•Ù•¹ÑA±…å•É9…µ”¡¥°‘•˜¹‘…äñð¹Õ±°¥ô€‘í‘É¥Ù•½Õ¹ÑÍm¥‘tñð€Áô¼‘íµ¥¹¥µÕµõ€¤(€€€€€€€€€€¹©½¥¸ ˆƒ
Ü€ˆ¤ì(€€€€€€€É½Ü¹Ñ½Ñ…°€ô(€€€€€€€€€É½Ü¹Ñ¡ÉÔ€ôôô€Äà€˜˜¡…¹‘¥…À€„ô¹Õ±°(€€€€€€€€€€€€üÉ½Ü¹É½ÍÍQ½Ñ…°€´¡…¹‘¥…À(€€€€€€€€€€€€èÉ½Ü¹É½ÍÍQ½Ñ…°ì(€€€€€€€É•ÑÕÉ¸É½Üì(€€€€€ô¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰…ÁQ•…µÌˆ¤É½ÝÌ€ô…ÁQ•…µI½ÝÌ ¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰ÍÉ…Ñ¡…É•…Ñ”ˆ¤ì(€€€€€½¹ÍÐ‘…åÌ€ô‘•˜¹‘…åÌñð•Ù•¹Ñ…åÌ ¤°µ…à€ôÍÉ…Ñ¡!…¹‘¥…Á1¥µ¥Ð ¤°(€€€€€€€‰•ÍÐ€ôÍÑ½É”¹•Ù•¹Ð¹ÍÉ…Ñ¡½Éµ…Ð€ôôô€‰‰•ÍÑÉ•…Ñ”ˆ°(€€€€€€€½Õ¹Ð€ô‰•ÍÐ€ü5…Ñ ¹µ…à Ä°‘…åÌ¹±•¹Ñ €´€Ä¤€è‘…åÌ¹±•¹Ñ °(€€€€€€€™¥¹¥Í¡•€ô‘…åÌ¹•Ù•Éä¡•Ù•¹Ñ…å½µÁ±•Ñ”¤ì(€€€€€É½ÝÌ€ôl¸¸¹¹•ÜM•Ð¡‘…åÌ¹™±…Ñ5…À¡™¥•±¤¥t¹™¥±Ñ•È¡¥€ôø‘…åÌ¹Í½µ”¡‘…ä€ôøì(€€€€€€€½¹ÍÐ¡À€ôÁ±…å•É…¥±å!…¹‘¥…À¡Í¡…É•‘ÑÕ…±%¡¥±‘…ä¤°‘…ä¤ì(€€€€€€€É•ÑÕÉ¸™¥•±¡‘…ä¤¹¥¹±Õ‘•Ì¡¥¤€˜˜€¡µ…à€ôô¹Õ±°ñð€¡¡À€„ô¹Õ±°€˜˜¡À€ðôµ…à¤¤ì(€€€€€ô¤¤¹µ…À¡¥€ôøì(€€€€€€€½¹ÍÐÉ½Õ¹‘Ì€ô‘…åÌ¹µ…À¡‘…ä€ôøì(€€€€€€€€€½¹ÍÐ…É€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±¥¤°¡À€ôÁ±…å•É…¥±å!…¹‘¥…À¡Í¡…É•‘ÑÕ…±%¡¥±‘…ä¤°‘…ä¤°(€€€€€€€€€€€•±¥¥‰±”€ô™¥•±¡‘…ä¤¹¥¹±Õ‘•Ì¡¥¤€˜˜€¡µ…à€ôô¹Õ±°ñð€¡¡À€„ô¹Õ±°€˜˜¡À€ðôµ…à¤¤°(€€€€€€€€€€€Á¥­ÕÀ€ôÍÑ½É”¹•Ù•¹Ð¹ÍÉ…Ñ¡M½É¥¹5½‘”€ôôô€‰µ…á½Õ‰±•	½•äˆ€ü¹Õ±°€èÍÉ…Ñ¡A¥­ÕÁ!½±”¡‘…ä°Í¡…É•‘ÑÕ…±%¡¥±‘…ä¤¤°(€€€€€€€€€€€¡½±•Ì€ô•±¥¥‰±”€˜˜€…Á¥­ÕÀ€üÍÉ…Ñ¡É½ÍÍM½É•Ì¡‘…ä°Í¡…É•‘ÑÕ…±%¡¥±‘…ä¤°…É¤€èÉÉ…ä Äà¤¹™¥±°¡¹Õ±°¤°(€€€€€€€€€€€Ñ½A…É!½±•Ì€ô¡½±•Ì¹µ…À ¡É½ÍÌ°¤¤€ôøÉ½ÍÌ€ôô¹Õ±°€ü¹Õ±°€èÉ½ÍÌ€´€ ­…É¹Á…Èü¹m¥tñð€À¤¤ì(€€€€€€€€€É•ÑÕÉ¸ì‘…ä°•±¥¥‰±”°Á¥­ÕÀ°¡½±•Ì°Ñ½A…É!½±•Ì°(€€€€€€€€€€€½µÁ±•Ñ”è¡½±•Ì¹•Ù•Éä¡É½ÍÌ€ôøÉ½ÍÌ€„ô¹Õ±°¤°(€€€€€€€€€€€Ñ¡ÉÔè¡½±•Ì¹™¥±Ñ•È¡É½ÍÌ€ôøÉ½ÍÌ€„ô¹Õ±°¤¹±•¹Ñ °(€€€€€€€€€€€É½ÍÌè±•…‘•ÉMÕ´¡¡½±•Ì¤°Ñ½Ñ…°è±•…‘•ÉMÕ´¡Ñ½A…É!½±•Ì¤ôì(€€€€€€€ô¤ì(€€€€€€€½¹ÍÐ…Ù…¥±…‰±”€ôÉ½Õ¹‘Ì¹™¥±Ñ•È¡É½Õ¹€ôøÉ½Õ¹¹•±¥¥‰±”€˜˜€…É½Õ¹¹Á¥­ÕÀ¤°(€€€€€€€€€½µÁ±•Ñ•€ô…Ù…¥±…‰±”¹™¥±Ñ•È¡É½Õ¹€ôøÉ½Õ¹¹½µÁ±•Ñ”¤¹±•¹Ñ °(€€€€€€€€€É…¹­•€ô‰•ÍÐ€ül¸¸¹…Ù…¥±…‰±•t¹Í½ÉÐ ¡„±ˆ¤€ôø9Õµ‰•È¡ˆ¹½µÁ±•Ñ”¤€´9Õµ‰•È¡„¹½µÁ±•Ñ”¤ñð„¹Ñ½Ñ…°€´ˆ¹Ñ½Ñ…°ñðˆ¹‘…ä€´„¹‘…ä¤€è…Ù…¥±…‰±”°(€€€€€€€€€½Õ¹Ñ•€ôÉ…¹­•¹™¥±Ñ•È¡É½Õ¹€ôøÉ½Õ¹¹Ñ¡ÉÔ€ø€À¤¹Í±¥” À°½Õ¹Ð¤¹Í½ÉÐ ¡„±ˆ¤€ôø„¹‘…ä€´ˆ¹‘…ä¤°(€€€€€€€€€É½Ü€ô±•…‘•ÉI½Ü¡¥°•Ù•¹ÑA±…å•É9…µ”¡¥°‘•˜¹‘…äñð¹Õ±°¤°‰•ÍÐ(€€€€€€€€€€€€ü	•ÍÐ€‘í½Õ¹Ñô½˜€‘í‘…åÌ¹±•¹Ñ¡ôƒ
Ü€‘í½µÁ±•Ñ•‘ô½µÁ±•Ñ”ƒ
Ü½Õ¹Ñ¥¹œ‘…åÌ€‘í½Õ¹Ñ•¹µ…À¡É½Õ¹€ôøÉ½Õ¹¹‘…ä¤¹©½¥¸ ˆ°€ˆ¤ñð€‹ŠP‰õ€(€€€€€€€€€€€€è€‰±°‘…åÌƒ
Ü•Ù•ÉäÉ½Õ¹É•ÅÕ¥É•ˆ°½Õ¹Ñ•¹™±…Ñ5…À¡É½Õ¹€ôøÉ½Õ¹¹¡½±•Ì¤°½Õ¹Ð€¨€Äà¤ì(€€€€€€€É½Ü¹É½ÍÍQ½Ñ…°€ô±•…‘•ÉMÕ´¡½Õ¹Ñ•¹µ…À¡É½Õ¹€ôøÉ½Õ¹¹É½ÍÌ¤¤ì(€€€€€€€É½Ü¹Ñ½Ñ…°€ô±•…‘•ÉMÕ´¡½Õ¹Ñ•¹µ…À¡É½Õ¹€ôøÉ½Õ¹¹Ñ½Ñ…°¤¤ì(€€€€€€€É½Ü¹ÍÉ…Ñ¡Q½A…È€ôÉ½Ü¹Ñ½Ñ…°ì(€€€€€€€É½Ü¹¥¹ÍÕ™™¥¥•¹ÑI½Õ¹‘Ì€ô½µÁ±•Ñ•€ð½Õ¹Ðì(€€€€€€€€¼¼½Õ¹Ð‰…¬½¸Ñ¡”±…Ñ•ÍÐ½Õ¹Ñ¥¹œÉ½Õ¹°ÕÍ¥¹œÍ½É•ÌÉ•±…Ñ¥Ù”Ñ¼Á…È(€€€€€€€€¼¼Í¼‘¥™™•É•¹Ð½ÕÉÍ”Á…ÉÌ‘¼¹½Ð¡…¹”Ñ¡”Ñ¥”µ‰É•…¬½µÁ…É¥Í½¸¸(€€€€€€€¥˜€¡‰•ÍÐñð€…É•Ñ…¥¹•‘1•…åM½É¥¹IÕ±•Ì ¤¤É½Ü¹‰!½±•Ì€ô½Õ¹Ñ•¹…Ð ´Ä¤ü¹Ñ½A…É!½±•Ìñðmtì(€€€€€€€½¹ÍÐÁ½Ñ•¹Ñ¥…°€ô…Ù…¥±…‰±”¹™¥±Ñ•È¡É½Õ¹€ôøÉ½Õ¹¹½µÁ±•Ñ”ñð€…•Ù•¹Ñ…å½µÁ±•Ñ”¡É½Õ¹¹‘…ä¤¤¹±•¹Ñ °(€€€€€€€€€™…¥±•€ô‰•ÍÐ€üÁ½Ñ•¹Ñ¥…°€ð½Õ¹Ðñð€¡™¥¹¥Í¡•€˜˜½µÁ±•Ñ•€ð½Õ¹Ð¤€è…Ù…¥±…‰±”¹±•¹Ñ €ð½Õ¹Ðì(€€€€€€€¥˜€¡™…¥±•¤ì(€€€€€€€€€½¹ÍÐÁ¥­ÕÁI½Õ¹€ôÉ½Õ¹‘Ì¹™¥¹¡É½Õ¹€ôøÉ½Õ¹¹Á¥­ÕÀ¤ì(€€€€€€€€€É½Ü¹‘¥ÍÅÕ…±¥™¥•€ôÑÉÕ”ì(€€€€€€€€€É½Ü¹Á¥­ÕÁ!½±”€ôÁ¥­ÕÁI½Õ¹ü¹Á¥­ÕÀñð¹Õ±°ì(€€€€€€€€€É½Ü¹‘¥ÍÅÕ…±¥™¥…Ñ¥½¹I•…Í½¸€ô‰•ÍÐ(€€€€€€€€€€€€ü€‘í½µÁ±•Ñ•‘ôÅÕ…±¥™å¥¹œ½µÁ±•Ñ•É½Õ¹‘Ìì€‘í½Õ¹ÑôÉ•ÅÕ¥É•‘€(€€€€€€€€€€€€èÁ¥­ÕÁI½Õ¹€üA¥¬µÕÀ½¸…ä€‘íÁ¥­ÕÁI½Õ¹¹‘…åô°!½±”€‘íÁ¥­ÕÁI½Õ¹¹Á¥­ÕÁõ€€è€‰ÅÕ…±¥™å¥¹œMÉ…Ñ É½Õ¹¥ÌÉ•ÅÕ¥É•½¸•Ù•Éä‘…äˆì(€€€€€€€ô(€€€€€€€É•ÑÕÉ¸É½Üì(€€€€€ô¤ì(€€€ô(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰ÍÉ…Ñ ˆ¤ì(€€€€€½¹ÍÐØ€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘•˜¹‘…ä¤°(€€€€€€€µ…à€ôÍÉ…Ñ¡!…¹‘¥…Á1¥µ¥Ð ¤ì(€€€€€É½ÝÌ€ô™¥•±¡‘•˜¹‘…ä¤(€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôøì(€€€€€€€€€½¹ÍÐ¡À€ôÁ±…å•É…¥±å!…¹‘¥…À¡¥°‘•˜¹‘…ä¤ì(€€€€€€€€€É•ÑÕÉ¸µ…à€ôô¹Õ±°ñð€¡¡À€„ô¹Õ±°€˜˜¡À€ðôµ…à¤ì(€€€€€€€ô¤(€€€€€€€€¹µ…À ¡¥¤€ôøì(€€€€€€€€€½¹ÍÐ…Éõ•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘•˜¹‘…ä±ÍÑ½É”¹•Ù•¹Ð±¥¤±Í½É•Ì€ôÍÉ…Ñ¡É½ÍÍM½É•Ì¡‘•˜¹‘…ä°¥°…É¤°(€€€€€€€€€€€È€ô±•…‘•ÉI½Ü¡¥°•Ù•¹ÑA±…å•É9…µ”¡¥°‘•˜¹‘…äñð¹Õ±°¤°€ˆˆ°Í½É•Ì¤°(€€€€€€€€€€€Á¥­ÕÀ€ô(€€€€€€€€€€€€€ÍÑ½É”¹•Ù•¹Ðü¹ÍÉ…Ñ¡M½É¥¹5½‘”€ôôô€‰µ…á½Õ‰±•	½•äˆ(€€€€€€€€€€€€€€€€ü¹Õ±°(€€€€€€€€€€€€€€€€èÍÉ…Ñ¡A¥­ÕÁ!½±”¡‘•˜¹‘…ä°¥¤ì(€€€€€€€€€È¹É½ÍÍQ½Ñ…°€ôÈ¹Ñ½Ñ…°ì(€€€€€€€€€È¹Ñ½Ñ…°€ôÍ½É•Ì¹É•‘Õ” (€€€€€€€€€€€€¡¸°œ°¤¤€ôø¸€¬€¡œ€ôô¹Õ±°€ü€À€èœ€´€ ­…É¹Á…Èü¹m¥tñð€À¤¤°(€€€€€€€€€€€€À°(€€€€€€€€€€¤ì(€€€€€€€€€È¹ÍÉ…Ñ¡Q½A…È€ôÈ¹Ñ½Ñ…°ì(€€€€€€€€€¥˜€¡Á¥­ÕÀ¤ì(€€€€€€€€€€€È¹‘¥ÍÅÕ…±¥™¥•€ôÑÉÕ”ì(€€€€€€€€€€€È¹Á¥­ÕÁ!½±”€ôÁ¥­ÕÀì(€€€€€€€€€ô(€€€€€€€€€É•ÑÕÉ¸Èì(€€€€€€€ô¤ì(€€€ô(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰™½ÕÉ‰…±°ˆ¤(€€€€€É½ÝÌ€ô±•…‘•É‰½…É‘U¹¥ÑÌ¡‘•˜¹‘…ä°€‰Á…¥Èˆ¤¹µ…À ¡Ô¤€ôøì(€€€€€€€½¹ÍÐµ…¹Õ…°€ôµ…¹Õ…±A…¥ÉMÕµµ…Éä¡‘•˜¹‘…ä°Ô¹¥°€‰™½ÕÉ‰…±°ˆ¤ì(€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€µ…¹Õ…±1•…‘•ÉI½Ü¡Ô¹¥°Ô¹¹…µ”°Ô¹‘•Ñ…¥°°µ…¹Õ…°¤ñð(€€€€€€€€€±•…‘•ÉI½Ü (€€€€€€€€€€€Ô¹¥°(€€€€€€€€€€€Ô¹¹…µ”°(€€€€€€€€€€€Ô¹‘•Ñ…¥°°(€€€€€€€€€€€ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôøì(€€€€€€€€€€€€€½¹ÍÐÙ…±Ì€ôÔ¹¥‘Ì(€€€€€€€€€€€€€€€€¹µ…À ¡¥¤€ôøÁ½¥¹ÑÌ¡‘•˜¹‘…ä°¥¥m¥t¤(€€€€€€€€€€€€€€€€¹™¥±Ñ•È ¡à¤€ôøà€„ô¹Õ±°¤ì(€€€€€€€€€€€€€É•ÑÕÉ¸Ù…±Ì¹±•¹Ñ €ü5…Ñ ¹µ…à ¸¸¹Ù…±Ì¤€è¹Õ±°ì(€€€€€€€€€€€ô¤°(€€€€€€€€€€¤(€€€€€€€€¤ì(€€€€€ô¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰ÁÕÑÑÌˆ¤ì(€€€€€½¹ÍÐ­¥¹€ôÍÑ½É”¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€ôôô€‰Á…¥ÉÌˆ€ü€‰Á…¥Èˆ€è€‰Ñ•…´ˆì(€€€€€É½ÝÌ€ô±•…‘•É‰½…É‘U¹¥ÑÌ¡‘•˜¹‘…ä°­¥¹¤¹µ…À ¡Ô¤€ôøì(€€€€€€€±•Ðµ…¹Õ…°€ô¹Õ±°ì(€€€€€€€½¹ÍÐ™¥¹…±AÕÑÑÌõÔ¹¥‘Ì¹µ…À¡¥ôù™¥¹…±M½É•¹ÑÉä¡‘•˜¹‘…ä±¥¤ü¹ÁÕÑÑÌ¤ì(€€€€€€€¥˜¡™¥¹…±AÕÑÑÌ¹±•¹Ñ ˜™™¥¹…±AÕÑÑÌ¹•Ù•Éä¡Ù…±Õ”ôùÙ…±Õ”„ôôˆˆ˜™Ù…±Õ”„õ¹Õ±°˜™9Õµ‰•È¹¥Í¥¹¥Ñ” ­Ù…±Õ”¤¤¤µ…¹Õ…°õíÑ½Ñ…°é±•…‘•ÉMÕ´¡™¥¹…±AÕÑÑÌ¥ôì(€€€€€€€¥˜€¡­¥¹€ôôô€‰Ñ•…´ˆ¤(€€€€€€€€€µ…¹Õ…°€ôµ…¹Õ…°ñðµ…¹Õ…±Q•…µMÕµµ…Éä¡‘•˜¹‘…ä°Ô¹¥°€‰ÁÕÑÑÌˆ¤ì(€€€€€€€•±Í”ì(€€€€€€€€€½¹ÍÐÍÕµµ…É¥•Ì€ôÔ¹¥‘Ì¹µ…À ¡¥¤€ôø(€€€€€€€€€€€µ…¹Õ…±A±…å•ÉMÕµµ…Éä¡‘•˜¹‘…ä°¥°€‰ÁÕÑÑÌˆ¤°(€€€€€€€€€€¤ì(€€€€€€€€€¥˜€ …µ…¹Õ…°€˜˜ÍÕµµ…É¥•Ì¹•Ù•Éä¡	½½±•…¸¤¤(€€€€€€€€€€€µ…¹Õ…°€ôì(€€€€€€€€€€€€€Ñ½Ñ…°è±•…‘•ÉMÕ´¡ÍÕµµ…É¥•Ì¹µ…À ¡à¤€ôø€­à¹Ñ½Ñ…°¤¤°(€€€€€€€€€€€€€‰…¬äè±•…‘•ÉMÕ´¡ÍÕµµ…É¥•Ì¹µ…À ¡à¤€ôø€­à¹‰…¬ä¤¤°(€€€€€€€€€€€€€±…ÍÐØè±•…‘•ÉMÕ´¡ÍÕµµ…É¥•Ì¹µ…À ¡à¤€ôø€­à¹±…ÍÐØ¤¤°(€€€€€€€€€€€€€±…ÍÐÌè±•…‘•ÉMÕ´¡ÍÕµµ…É¥•Ì¹µ…À ¡à¤€ôø€­à¹±…ÍÐÌ¤¤°(€€€€€€€€€€€ôì(€€€€€€€ô(€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€µ…¹Õ…±1•…‘•ÉI½Ü¡Ô¹¥°Ô¹¹…µ”°Ô¹‘•Ñ…¥°°µ…¹Õ…°¤ñð(€€€€€€€€€±•…‘•ÉI½Ü (€€€€€€€€€€€Ô¹¥°(€€€€€€€€€€€Ô¹¹…µ”°(€€€€€€€€€€€Ô¹‘•Ñ…¥°°(€€€€€€€€€€€ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôøì(€€€€€€€€€€€€€½¹ÍÐÙ…±Ì€ôÔ¹¥‘Ì(€€€€€€€€€€€€€€€€¹µ…À ¡¥¤€ôø™¥¹‘=™™¥¥…±½ÉA±…å•È¡‘•˜¹‘…ä°¥°¤€¬€Ä¤ü¹ÁÕÑÑÌ¤(€€€€€€€€€€€€€€€€¹µ…À ¡à¤€ôø€¡à€ôôô€ˆˆñðà€ôô¹Õ±°€ü¹Õ±°€è€­à¤¤ì(€€€€€€€€€€€€€É•ÑÕÉ¸Ù…±Ì¹•Ù•Éä ¡à¤€ôøà€„ô¹Õ±°¤€ü±•…‘•ÉMÕ´¡Ù…±Ì¤€è¹Õ±°ì(€€€€€€€€€€€ô¤°(€€€€€€€€€€¤(€€€€€€€€¤ì(€€€€€ô¤ì(€€€ô(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰‰•ÍÐÌˆ¤(€€€€€É½ÝÌ€ô±•…‘•É‰½…É‘U¹¥ÑÌ¡‘•˜¹‘…ä°€‰Ñ•…´ˆ¤¹µ…À ¡Ô¤€ôøì(€€€€€€€½¹ÍÐµ…¹Õ…°€ôµ…¹Õ…±Q•…µMÕµµ…Éä¡‘•˜¹‘…ä°Ô¹¥°€‰‰•ÍÐÌˆ¤ì(€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€µ…¹Õ…±1•…‘•ÉI½Ü¡Ô¹¥°Ô¹¹…µ”°Ô¹‘•Ñ…¥°°µ…¹Õ…°¤ñð(€€€€€€€€€±•…‘•ÉI½Ü (€€€€€€€€€€€Ô¹¥°(€€€€€€€€€€€Ô¹¹…µ”°(€€€€€€€€€€€Ô¹‘•Ñ…¥°°(€€€€€€€€€€€ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôøì(€€€€€€€€€€€€€½¹ÍÐÙ…±Ì€ôÔ¹¥‘Ì(€€€€€€€€€€€€€€€€¹µ…À ¡¥¤€ôøÁ½¥¹ÑÌ¡‘•˜¹‘…ä°¥¥m¥t¤(€€€€€€€€€€€€€€€€¹™¥±Ñ•È ¡à¤€ôøà€„ô¹Õ±°¤(€€€€€€€€€€€€€€€€¹Í½ÉÐ ¡„°ˆ¤€ôøˆ€´„¤ì(€€€€€€€€€€€€€É•ÑÕÉ¸Ù…±Ì¹±•¹Ñ €øô€Ì€ü±•…‘•ÉMÕ´¡Ù…±Ì¹Í±¥” À°€Ì¤¤€è¹Õ±°ì(€€€€€€€€€€€ô¤°(€€€€€€€€€€¤(€€€€€€€€¤ì(€€€€€ô¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆ¤ì(€€€€€É½ÝÌ€ô±•…‘•É‰½…É‘U¹¥ÑÌ¡‘•˜¹‘…ä°€‰Ñ•…´ˆ¤¹µ…À ¡Ô°É½ÕÁ%¹‘•à¤€ôøì(€€€€€€€½¹ÍÐÑ•…´€ôå•±±½Ý	…±±Q•…´¡‘•˜¹‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€€€€€ÍÑ…ÉÐ€ôÉ½ÕÁMÑ…ÉÑ¥¹!½±”¡ÍÑ½É”¹•Ù•¹Ð°‘•˜¹‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€€€€€Í•ÅÕ•¹”€ôÍ½É•M•ÅÕ•¹”¡ÍÑ…ÉÐ¤°(€€€€€€€€€±½ÍÌ€ôå•±±½Ý	…±±1½ÍÌ¡‘•˜¹‘…ä°É½ÕÁ%¹‘•à¤°(€€€€€€€€€¡½±•Ì€ôÍ•ÅÕ•¹”¹µ…À ¡¡½±”°Á½Í¥Ñ¥½¸¤€ôøì(€€€€€€€€€€€¥˜€¡±½ÍÌ€˜˜Á½Í¥Ñ¥½¸€øô±½ÍÌ¹Á½Í¥Ñ¥½¸¤É•ÑÕÉ¸¹Õ±°ì(€€€€€€€€€€€½¹ÍÐ¹½µ¥¹…Ñ•€ôå•±±½Ý	…±±A±…å•É½É!½±” (€€€€€€€€€€€€€‘•˜¹‘…ä°(€€€€€€€€€€€€€É½ÕÁ%¹‘•à°(€€€€€€€€€€€€€¡½±”°(€€€€€€€€€€€€¤ì(€€€€€€€€€€€É•ÑÕÉ¸±•…‘•É‰½…É‘A±…å•ÉA½¥¹ÑÌ¡‘•˜¹‘…ä°¹½µ¥¹…Ñ•¥m¡½±”€´€Åtì(€€€€€€€€€ô¤°(€€€€€€€€€É½Ü€ô±•…‘•ÉI½Ü (€€€€€€€€€€€Ô¹¥°(€€€€€€€€€€€Q•…´€‘íÉ½ÕÁ%¹‘•à€¬€Åõ€°(€€€€€€€€€€€Ñ•…´¹µ…À ¡¥¤€ôø•Ù•¹ÑA±…å•É9…µ”¡¥°‘•˜¹‘…ä¤¤¹©½¥¸ ˆ°€ˆ¤°(€€€€€€€€€€€¡½±•Ì°(€€€€€€€€€€¤ì(€€€€€€€½¹ÍÐµ…¹Õ…°€ôÍÕ‰µ¥ÑÑ•‘5…¹Õ…±…É¡‘•˜¹‘…ä°É½ÕÁ%¹‘•à¤ü¹Ñ•…´ü¹å•±±½Ý	…±°ì(€€€€€€€¥˜€¡µ…¹Õ…°ü¹±½ÍÍ!½±”€˜˜µ…¹Õ…°¹Ñ½Ñ…°€„ôô€ˆˆ€˜˜µ…¹Õ…°¹Ñ½Ñ…°€„ô¹Õ±°¤ì(€€€€€€€€€É½Ü¹Ñ½Ñ…°€ô€­µ…¹Õ…°¹Ñ½Ñ…°ì(€€€€€€€€€É½Ü¹Ñ¡ÉÔ€ô±½ÍÌ€ü±½ÍÌ¹Á½Í¥Ñ¥½¸€è€Äàì(€€€€€€€€€É½Ü¹Á•¹‘¥¹œ€ô€Àì(€€€€€€€€€É½Ü¹µ…¹Õ…°€ôÑÉÕ”ì(€€€€€€€ô(€€€€€€€É½Ü¹±½ÍÌ€ô±½ÍÌì(€€€€€€€É½Ü¹ÍÕÉÙ¥Ù•€ô±½ÍÌ€ü±½ÍÌ¹Á½Í¥Ñ¥½¸€èÉ½Ü¹Ñ¡ÉÔì(€€€€€€€É•ÑÕÉ¸É½Üì(€€€€€ô¤ì(€€€€€É½ÝÌ¹Í½ÉÐ (€€€€€€€€¡„°ˆ¤€ôø(€€€€€€€€€ˆ¹ÍÕÉÙ¥Ù•€´„¹ÍÕÉÙ¥Ù•ñð(€€€€€€€€€ˆ¹Ñ½Ñ…°€´„¹Ñ½Ñ…°ñð(€€€€€€€€€„¹¹…µ”¹±½…±•½µÁ…É”¡ˆ¹¹…µ”¤°(€€€€€€¤ì(€€€€€É½ÝÌ¹™½É…  ¡É½Ü°¥¹‘•à¤€ôøì(€€€€€€€½¹ÍÐÁÉ•Ù¥½ÕÌ€ôÉ½ÝÍm¥¹‘•à€´€Åt°(€€€€€€€€€¹•áÐ€ôÉ½ÝÍm¥¹‘•à€¬€Åt°(€€€€€€€€€Í…µ”€ô(€€€€€€€€€€€ÁÉ•Ù¥½ÕÌ€˜˜(€€€€€€€€€€€ÁÉ•Ù¥½ÕÌ¹ÍÕÉÙ¥Ù•€ôôôÉ½Ü¹ÍÕÉÙ¥Ù•€˜˜(€€€€€€€€€€€ÁÉ•Ù¥½ÕÌ¹Ñ½Ñ…°€ôôôÉ½Ü¹Ñ½Ñ…°ì(€€€€€€€É½Ü¹É…¹¬€ôÍ…µ”€üÁÉ•Ù¥½ÕÌ¹É…¹¬€è¥¹‘•à€¬€Äì(€€€€€€€É½Ü¹Ñ¥•€ô	½½±•…¸ (€€€€€€€€€Í…µ”ñð(€€€€€€€€€€€€¡¹•áÐ€˜˜(€€€€€€€€€€€€€¹•áÐ¹ÍÕÉÙ¥Ù•€ôôôÉ½Ü¹ÍÕÉÙ¥Ù•€˜˜(€€€€€€€€€€€€€¹•áÐ¹Ñ½Ñ…°€ôôôÉ½Ü¹Ñ½Ñ…°¤°(€€€€€€€€¤ì(€€€€€ô¤ì(€€€€€É•ÑÕÉ¸É½ÝÌì(€€€ô(€€€¥˜€¡l‰Á…ÈÌˆ°€‰Á…ÈÍÑ•…´‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤¤ì(€€€€€½¹ÍÐ¥àõµ…¹Õ…±A…ÈÍ!½±•Ì¡‘•˜¹‘…ä¤¹µ…À¡ ôù ´Ä¤ì(€€€€€É½ÝÌ€ô±•…‘•É‰½…É‘U¹¥ÑÌ¡‘•˜¹‘…ä°‘•˜¹ÑåÁ”€ôôô€‰Á…ÈÍÑ•…´ˆ€ü€‰Ñ•…´ˆ€è€‰Á…¥Èˆ¤¹µ…À ¡Ô¤€ôø(€€€€€€€±•…‘•ÉI½Ü (€€€€€€€€€Ô¹¥°(€€€€€€€€€Ô¹¹…µ”°(€€€€€€€€€Ô¹‘•Ñ…¥°°(€€€€€€€€€¥à¹µ…À ¡¤¤€ôøì(€€€€€€€€€€€½¹ÍÐÙ…±Ì€ôÔ¹¥‘Ì¹µ…À ¡¥¤€ôøì(€€€€€€€€€€€€€¥˜ ­•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘•˜¹‘…ä±ÍÑ½É”¹•Ù•¹Ð±¥¤¹Á…Èü¹m¥t„ôôÌ¥É•ÑÕÉ¸€Àì(€€€€€€€€€€€€€½¹ÍÐµ…¹Õ…°€ôµ…¹Õ…±A…ÈÍA½¥¹Ð¡‘•˜¹‘…ä°¥°¤€¬€Ä¤ì(€€€€€€€€€€€€€É•ÑÕÉ¸µ…¹Õ…°€ôô¹Õ±°€üÁ½¥¹ÑÌ¡‘•˜¹‘…ä°¥¥m¥t€èµ…¹Õ…°ì(€€€€€€€€€€€ô¤ì(€€€€€€€€€€€É•ÑÕÉ¸Ù…±Ì¹•Ù•Éä ¡à¤€ôøà€„ô¹Õ±°¤€ü±•…‘•ÉMÕ´¡Ù…±Ì¤€è¹Õ±°ì(€€€€€€€€€ô¤°(€€€€€€€€€¥à¹±•¹Ñ °(€€€€€€€€¤°(€€€€€€¤ì(€€€ô(€€€¥˜€¡l‰Á…ÈÍ…É•…Ñ”ˆ°€‰Á…ÈÍ¥¹‘¥Ù¥‘Õ…±…É•…Ñ”‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤¤ì(€€€€€½¹ÍÐ•™™•Ñ¥Ù•A±…å•È€ô€¡‘…ä°¥¤€ôøì(€€€€€€€¥õÍ¡…É•‘ÑÕ…±%¡¥±‘…ä¤ì(€€€€€€€½¹ÍÐ•µ•É•¹ä€ôÍÑ½É”¹•Ù•¹Ð¹•µ•É•¹åI•Á±…•µ•¹ÑÌü¹l‰‘…äˆ€¬‘…åtì(€€€€€€€É•ÑÕÉ¸•µ•É•¹ä€˜˜MÑÉ¥¹œ¡•µ•É•¹ä¹µ¥ÍÍ¥¹A±…å•É%¤€ôôôMÑÉ¥¹œ¡¥¤(€€€€€€€€€€üMÑÉ¥¹œ¡•µ•É•¹ä¹Ù¥ÉÑÕ…±A±…å•É%ñð¥¤(€€€€€€€€€€èMÑÉ¥¹œ¡¥¤ì(€€€€€ôì(€€€€€½¹ÍÐ¥à€ô€¡¤€ôøì(€€€€€€€É•ÑÕÉ¸µ…¹Õ…±A…ÈÍ!½±•Ì¡¤¹µ…À¡ ôù ´Ä¤ì(€€€€€ôì(€€€€€½¹ÍÐÕ¹¥ÑÌ€ô‘•˜¹ÑåÁ”€ôôô€‰Á…ÈÍ…É•…Ñ”ˆ€ü±•…‘•É‰½…É‘U¹¥ÑÌ¡ÍÑ½É”¹•Ù•¹Ð¹‘…åÌ°€‰Á…¥Èˆ°ÑÉÕ”¤€èl¸¸¹¹•ÜM•Ð¡•Ù•¹Ñ…åÌ ¤¹™±…Ñ5…À¡™¥•±¤¥t¹µ…À¡¥€ôø€¡í¥°¹…µ”é•Ù•¹ÑA±…å•É9…µ”¡¥°‘•˜¹‘…äñð¹Õ±°¤°¥‘Ìém¥‘uô¤¤ì(€€€€€É½ÝÌ€ôÕ¹¥ÑÌ¹µ…À ¡Ô¤€ôøì(€€€€€€€½¹ÍÐ¡½±•Ì€ômtì(€€€€€€€™½È€¡½¹ÍÐ½˜•Ù•¹Ñ…åÌ ¤¤ì(€€€€€€€€€½¹ÍÐ•™™•Ñ¥Ù•%‘Ì€ôÔ¹¥‘Ì¹µ…À ¡¥¤€ôø•™™•Ñ¥Ù•A±…å•È¡°¥¤¤°(€€€€€€€€€€€½¹™±¥Ñ¥¹Y¥ÉÑÕ…±A…¥È€ô(€€€€€€€€€€€€€¹•ÜM•Ð¡•™™•Ñ¥Ù•%‘Ì¤¹Í¥é”€„ôô•™™•Ñ¥Ù•%‘Ì¹±•¹Ñ ì(€€€€€€€€€¥à¡¤¹™½É…  ¡¤¤€ôøì(€€€€€€€€€€€¥˜€¡½¹™±¥Ñ¥¹Y¥ÉÑÕ…±A…¥È¤ì(€€€€€€€€€€€€€¡½±•Ì¹ÁÕÍ ¡¹Õ±°¤ì(€€€€€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€€€ô(€€€€€€€€€€€½¹ÍÐÙ…±Ì€ô•™™•Ñ¥Ù•%‘Ì¹µ…À ¡•™™•Ñ¥Ù•%¤€ôøì(€€€€€€€€€€€€€¥˜ ­•Ù•¹Ñ½ÕÉÍ•M½É•…É¡±ÍÑ½É”¹•Ù•¹Ð±•™™•Ñ¥Ù•%¤¹Á…Èü¹m¥t„ôôÌ¥É•ÑÕÉ¸€Àì(€€€€€€€€€€€€€¥˜€ …™¥•±¡¤¹¥¹±Õ‘•Ì¡Í¡…É•‘A½Í¥Ñ¥½¹%¡•™™•Ñ¥Ù•%¤¤¤É•ÑÕÉ¸€Àì€¼¼Í¡•‘Õ±•É•ÍÐ‘…ä¡…Ì¹¼Í½É”ìÁ•¹‘¥¹œÁ±…å¥¹œµ‘…äÍ½É•ÌÉ•µ…¥¸¹Õ±°¸(€€€€€€€€€€€€€½¹ÍÐµ…¹Õ…°€ôµ…¹Õ…±A…ÈÍA½¥¹Ð¡°•™™•Ñ¥Ù•%°¤€¬€Ä¤ì(€€€€€€€€€€€€€É•ÑÕÉ¸µ…¹Õ…°€ôô¹Õ±°€üÁ½¥¹ÑÌ¡°•™™•Ñ¥Ù•%¥m¥t€èµ…¹Õ…°ì(€€€€€€€€€€€ô¤ì(€€€€€€€€€€€¡½±•Ì¹ÁÕÍ ¡Ù…±Ì¹•Ù•Éä ¡à¤€ôøà€„ô¹Õ±°¤€ü±•…‘•ÉMÕ´¡Ù…±Ì¤€è¹Õ±°¤ì(€€€€€€€€€ô¤ì(€€€€€€€ô(€€€€€€€É•ÑÕÉ¸±•…‘•ÉI½Ü (€€€€€€€€€Ô¹¥°(€€€€€€€€€Ô¹¹…µ”°(€€€€€€€€€‘•˜¹ÑåÁ”€ôôô€‰Á…ÈÍ…É•…Ñ”ˆ€ü…ä€‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÍôÁ…ÉÑ¹•ÉÍ¡¥Àƒ
Ü…±°É½Õ¹‘Í€€è€‰%¹‘¥Ù¥‘Õ…°ƒ
Ü…±°É½Õ¹‘Ìˆ°(€€€€€€€€€¡½±•Ì°(€€€€€€€€€¡½±•Ì¹±•¹Ñ °(€€€€€€€€¤ì(€€€€€ô¤ì(€€€ô(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰•±•Ñ¥Œˆ¤ì(€€€€€½¹ÍÐ•±•Ñ¥…åÌ€ô‘•˜¹‘…åÌñðlÄ°€Ét°™¥ÉÍÑ…ä€ô•±•Ñ¥…åÍlÁt°±…ÍÑ…ä€ô•±•Ñ¥…åÌ¹…Ð ´Ä¤ì(€€€€€É½ÝÌ€ô™¥•±¡™¥ÉÍÑ…ä¤(€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôø•±•Ñ¥…åÌ¹•Ù•Éä ¡‘…ä¤€ôø™¥•±¡‘…ä¤¹¥¹±Õ‘•Ì¡¥¤¤¤(€€€€€€€€¹µ…À ¡¥¤€ôøì(€€€€€€€€€½¹ÍÐÉ½Õ¹‘Ì€ô•±•Ñ¥…åÌ¹µ…À ¡‘…ä¤€ôøÁ½¥¹ÑÌ¡‘…ä°¥¤¤°‰…Í•±¥¹”€ôÉ½Õ¹‘ÍlÁt°±…Ñ•ÍÐ€ôÉ½Õ¹‘Ì¹…Ð ´Ä¤°(€€€€€€€€€€€È€ô±•…‘•ÉI½Ü (€€€€€€€€€€€¥°(€€€€€€€€€€€•Ù•¹ÑA±…å•É9…µ”¡¥°‘•˜¹‘…äñð¹Õ±°¤°(€€€€€€€€€€€€‘í‘•˜¹‘…åÌü¹±•¹Ñ ñð€ÉôÉ½Õ¹‘Ìƒ
Ü…åÌ€‘í•±•Ñ¥…åÌ¹©½¥¸ ˆ…¹€ˆ¥õ€°(€€€€€€€€€€€ÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¤¤€ôøì(€€€€€€€€€€€€€½¹ÍÐÙ…±Ì€ôÉ½Õ¹‘Ì¹µ…À ¡É½Õ¹¤€ôøÉ½Õ¹‘m¥t¤¹™¥±Ñ•È ¡à¤€ôøà€„ô¹Õ±°¤ì(€€€€€€€€€€€€€É•ÑÕÉ¸Ù…±Ì¹±•¹Ñ €ü5…Ñ ¹µ…à ¸¸¹Ù…±Ì¤€è¹Õ±°ì(€€€€€€€€€€€ô¤°(€€€€€€€€€€¤ì(€€€€€€€€€È¹Á½¥¹ÑÍ…¥¹•€ôÈ¹¡½±•Ì¹É•‘Õ” (€€€€€€€€€€€€¡Ñ½Ñ…°°Ù…±Õ”°¤¤€ôø(€€€€€€€€€€€€€Ñ½Ñ…°€¬(€€€€€€€€€€€€€€¡Ù…±Õ”€ôô¹Õ±°ñð‰…Í•±¥¹•m¥t€ôô¹Õ±°(€€€€€€€€€€€€€€€€ü€À(€€€€€€€€€€€€€€€€è5…Ñ ¹µ…à À°Ù…±Õ”€´‰…Í•±¥¹•m¥t¤¤°(€€€€€€€€€€€€À°(€€€€€€€€€€¤ì(€€€€€€€€€È¹Ñ¡ÉÔ€ô±…Ñ•ÍÐ¹™¥±Ñ•È ¡Ù…±Õ”¤€ôøÙ…±Õ”€„ô¹Õ±°¤¹±•¹Ñ ì(€€€€€€€€€È¹±…ÍÑ…ä€ô±…ÍÑ…äì(€€€€€€€€€É•ÑÕÉ¸Èì(€€€€€€€ô¤ì(€€€ô(€€€¥˜€¡l‰ÍÉ…Ñ ˆ°€‰ÍÉ…Ñ¡…É•…Ñ”ˆ°€‰…µ‰É½Í”ˆ°€‰½µ‰¥¹•ˆ°€‰ÍÑÉ½­•É•…Ñ•É½ÍÌˆ°€‰ÍÑÉ½­•É•…Ñ•9•Ð‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤¤ì(€€€€€½¹ÍÐ…Ñ¥Ù”€ôÉ…¹­1•…‘•ÉI½ÝÌ (€€€€€€€É½ÝÌ¹™¥±Ñ•È ¡È¤€ôø€…È¹‘¥ÍÅÕ…±¥™¥•¤°(€€€€€€€€…‘•˜¹±½Ý•È°(€€€€€€€	½½±•…¸¡‘•˜¹½Õ¹Ñ‰…¬¤°(€€€€€€¤ì(€€€€€½¹ÍÐ‘¥ÍÅÕ…±¥™¥•€ôÉ½ÝÌ(€€€€€€€€¹™¥±Ñ•È ¡È¤€ôøÈ¹‘¥ÍÅÕ…±¥™¥•¤(€€€€€€€€¹Í½ÉÐ (€€€€€€€€€€¡„°ˆ¤€ôøl‰ÍÉ…Ñ ˆ°€‰ÍÉ…Ñ¡…É•…Ñ”‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤(€€€€€€€€€€€€ü„¹Á¥­ÕÁ!½±”€´ˆ¹Á¥­ÕÁ!½±”ñð„¹¹…µ”¹±½…±•½µÁ…É”¡ˆ¹¹…µ”¤(€€€€€€€€€€€€è„¹¹…µ”¹±½…±•½µÁ…É”¡ˆ¹¹…µ”¤°(€€€€€€€€¤ì(€€€€€‘¥ÍÅÕ…±¥™¥•¹™½É…  ¡È¤€ôøì(€€€€€€€È¹É…¹¬€ô€ˆˆì(€€€€€€€È¹Ñ¥•€ô™…±Í”ì(€€€€€ô¤ì(€€€€€É•ÑÕÉ¸l¸¸¹…Ñ¥Ù”°€¸¸¹‘¥ÍÅÕ…±¥™¥•‘tì(€€€ô(€€€É•ÑÕÉ¸É…¹­1•…‘•ÉI½ÝÌ¡É½ÝÌ°€…‘•˜¹±½Ý•È°	½½±•…¸¡‘•˜¹½Õ¹Ñ‰…¬¤¤ì(€ô(€™Õ¹Ñ¥½¸•Ù•¹Ñ…å½µÁ±•Ñ”¡‘…ä¤ì(€€€¥˜€¡µ…¹Õ…±…å¥¹…±¥Í•¡‘…ä¤¤É•ÑÕÉ¸ÑÉÕ”ì(€€€½¹ÍÐ™¥•±€ô‘…å¥•±‘%‘Ì¡‘…ä¤¹™¥±Ñ•È (€€€€€€¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%°(€€€€¤ì(€€€¥˜€¡‘…åM½É¥¹5•Ñ¡½¡‘…ä¤€ôôô€‰™Õ±±…É‘A±…å•Èˆ¤(€€€€€É•ÑÕÉ¸	½½±•…¸ (€€€€€€€™¥•±¹±•¹Ñ €˜˜™¥•±¹•Ù•Éä ¡¥¤€ôøÉ½Õ¹‘¥¹…±¥Í•‘½È¡‘…ä°¥¤¤°(€€€€€€¤ì(€€€¥˜€¡‘…åM½É¥¹5•Ñ¡½¡‘…ä¤€„ôô€‰¡½±•	å!½±”ˆ¤(€€€€€É•ÑÕÉ¸	½½±•…¸¡™¥•±¹±•¹Ñ €˜˜™¥•±¹•Ù•Éä¡¥ôù™¥¹…±M½É•½µÁ±•Ñ”¡‘…ä±¥¤¤¤ì(€€€É•ÑÕÉ¸	½½±•…¸ (€€€€€™¥•±¹±•¹Ñ €˜˜™¥•±¹•Ù•Éä ¡¥¤€ôø±¥Ù•A±…å•ÉMÑ…ÑÕÌ¡‘…ä°¥¤¹™¥¹…±¥Í•¤°(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸å•±±½Ý	…±±I•ÍÕ±ÑÍI•…‘ä¡‘…ä¤ì(€€€¥˜€¡•Ù•¹Ñ…å½µÁ±•Ñ”¡‘…ä¤¤É•ÑÕÉ¸ÑÉÕ”ì(€€€¥˜€¡‘…åM½É¥¹5•Ñ¡½¡‘…ä¤€„ôô€‰¡½±•	å!½±”ˆ¤É•ÑÕÉ¸™…±Í”ì(€€€½¹ÍÐ™¥•±€ô‘…å¥•±‘%‘Ì¡‘…ä¤¹™¥±Ñ•È (€€€€€€¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%°(€€€€¤ì(€€€É•ÑÕÉ¸	½½±•…¸ (€€€€€™¥•±¹±•¹Ñ €˜˜(€€€€€€€™¥•±¹•Ù•Éä (€€€€€€€€€€¡¥¤€ôø(€€€€€€€€€€€½™™¥¥…±…É‘AÉ½É•ÍÌ¡‘…ä°¥¤¹½µÁ±•Ñ”€˜˜(€€€€€€€€€€€Ù•É¥™¥…Ñ¥½¹%ÍÍÕ•!½±•Ì¡‘…ä°¥¤¹±•¹Ñ €ôôô€À°(€€€€€€€€¤°(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸±•…‘•É‰½…É‘½µÁ±•Ñ”¡‘•˜°É½ÝÌ¤ì(€€€½¹ÍÐ™¥¹…±¥Í•€ô‘•˜¹‘…ä(€€€€€€ü•Ù•¹Ñ…å½µÁ±•Ñ”¡‘•˜¹‘…ä¤(€€€€€€è€¡‘•˜¹‘…åÌñð•Ù•¹Ñ…åÌ ¤¤¹•Ù•Éä¡•Ù•¹Ñ…å½µÁ±•Ñ”¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰¹ÑÀˆ¤(€€€€€É•ÑÕÉ¸€ (€€€€€€€™¥¹…±¥Í•€˜˜(€€€€€€€€¡µ…¹Õ…±…åMÑ½É”¡‘•˜¹‘…ä°™…±Í”¤ü¹¹ÑÁ¥¹…±¥Í•ñð(€€€€€€€€€‘…å¥•±‘%‘Ì¡‘•˜¹‘…ä¤(€€€€€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€€€€€€€¹•Ù•Éä ¡¥¤€ôø(€€€€€€€€€€€€€±•…‘•É‰½…É‘A±…å•ÉA½¥¹ÑÌ¡‘•˜¹‘…ä°¥¤¹•Ù•Éä ¡à¤€ôøà€„ô¹Õ±°¤°(€€€€€€€€€€€€¤¤(€€€€€€¤ì(€€€¥˜€¡l‰ÍÉ…Ñ ˆ°€‰ÍÉ…Ñ¡…É•…Ñ”‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤¤ì(€€€€€½¹ÍÐ…Ñ¥Ù”€ôÉ½ÝÌ¹™¥±Ñ•È ¡È¤€ôø€…È¹‘¥ÍÅÕ…±¥™¥•¤ì(€€€€€É•ÑÕÉ¸	½½±•…¸ (€€€€€€€™¥¹…±¥Í•€˜˜…Ñ¥Ù”¹±•¹Ñ €˜˜…Ñ¥Ù”¹•Ù•Éä ¡È¤€ôøÈ¹Ñ¡ÉÔ€ôôôÈ¹Ñ…É•Ð¤°(€€€€€€¤ì(€€€ô(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆ¤(€€€€€É•ÑÕÉ¸	½½±•…¸¡å•±±½Ý	…±±I•ÍÕ±ÑÍI•…‘ä¡‘•˜¹‘…ä¤€˜˜É½ÝÌ¹±•¹Ñ ¤ì(€€€½¹ÍÐ•±¥¥‰±”€ôÉ½ÝÌ¹™¥±Ñ•È¡É½Ü€ôø€…É½Ü¹‘¥ÍÅÕ…±¥™¥•¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰½µ‰¥¹•ˆ€˜˜™¥¹…±¥Í•€˜˜É½ÝÌ¹±•¹Ñ €˜˜€…•±¥¥‰±”¹±•¹Ñ ¤É•ÑÕÉ¸ÑÉÕ”ì(€€€É•ÑÕÉ¸	½½±•…¸¡™¥¹…±¥Í•€˜˜•±¥¥‰±”¹±•¹Ñ €˜˜•±¥¥‰±”¹•Ù•Éä¡É½Ü€ôøÉ½Ü¹Ñ¡ÉÔ€ôôôÉ½Ü¹Ñ…É•Ð¤¤ì(€ô(€™Õ¹Ñ¥½¸ÍÕµµ…Éå½µÁ•Ñ¥Ñ¥½¹I•ÍÕ±Ð¡‘•˜¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰¹ÑÀˆ¤ì(€€€€€½¹ÍÐ¡½±‘•ÉÌ€ô¹ÑÁ!½±•Í%¹A±…å¥¹=É‘•È¡‘•˜¹‘…ä¤¹µ…À ¡ ¤€ôø€¡ì(€€€€€€€€€¡½±”è °(€€€€€€€€€¡½±‘•ÈèÕÉÉ•¹Ñ9ÑÁ!½±‘•È¡‘•˜¹‘…ä° ¤°(€€€€€€€ô¤¤°(€€€€€€€½µÁ±•Ñ”€ô±•…‘•É‰½…É‘½µÁ±•Ñ”¡‘•˜°mt¤°(€€€€€€€¡…Í]¥¹¹•È€ô¡½±‘•ÉÌ¹Í½µ” ¡à¤€ôø	½½±•…¸¡à¹¡½±‘•È¤¤ì(€€€€€É•ÑÕÉ¸ì(€€€€€€€½µÁ±•Ñ”°(€€€€€€€ÍÑ…ÑÕÌè½µÁ±•Ñ”€ü€‰½µÁ±•Ñ•ˆ€è€‰%¸AÉ½É•ÍÌˆ°(€€€€€€€Ñ•áÐè¡½±‘•ÉÌ¹±•¹Ñ (€€€€€€€€€€ü¡½±‘•ÉÌ¹µ…À ¡à¤€ôø¹ÑÁMÕµµ…Éå1¥¹”¡‘•˜¹‘…ä°à¹¡½±”°½µÁ±•Ñ”¤¤¹©½¥¸ ˆƒ
Ü€ˆ¤(€€€€€€€€€€è€‰A•¹‘¥¹œˆ°(€€€€€€€…Ý…É‘…‰±”è¡…Í]¥¹¹•È°(€€€€€ôì(€€€ô(€€€½¹ÍÐÉ½ÝÌ€ô…±Õ±…Ñ•1•…‘•É‰½…É¡‘•˜¤°(€€€€€Ñ½À€ôÉ½ÝÌ¹™¥¹ ¡È¤€ôø€…È¹‘¥ÍÅÕ…±¥™¥•¤°(€€€€€½µÁ±•Ñ”€ô±•…‘•É‰½…É‘½µÁ±•Ñ”¡‘•˜°É½ÝÌ¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆ€˜˜€…½µÁ±•Ñ”¤(€€€€€É•ÑÕÉ¸ì(€€€€€€€½µÁ±•Ñ”è™…±Í”°(€€€€€€€ÍÑ…ÑÕÌè€‰%¸AÉ½É•ÍÌˆ°(€€€€€€€Ñ•áÐè€‰I•ÍÕ±Ð…¹¹½Õ¹•…ÐÑ¡”•¹½˜Á±…äˆ°(€€€€€€€…Ý…É‘…‰±”è‘•˜¹…Ý…É‘…‰±”€„ôô™…±Í”°(€€€€€ôì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰½µ‰¥¹•ˆ€˜˜½µÁ±•Ñ”€˜˜€…Ñ½À¤É•ÑÕÉ¸í½µÁ±•Ñ”éÑÉÕ”±ÍÑ…ÑÕÌè‰½µÁ±•Ñ•ˆ±Ñ•áÐè‰9¼½±™•È½µÁ±•Ñ•Ñ¡”É•ÅÕ¥É•¹Õµ‰•È½˜É½Õ¹‘Ìˆ±…Ý…É‘…‰±”é™…±Í•ôì(€€€¥˜€ …Ñ½Àñð€ …Ñ½À¹Ñ¡ÉÔ€˜˜‘•˜¹ÑåÁ”€„ôô€‰å•±±½Ý	…±°ˆ¤¤(€€€€€É•ÑÕÉ¸ì(€€€€€€€½µÁ±•Ñ”è™…±Í”°(€€€€€€€ÍÑ…ÑÕÌè€‰9½ÐMÑ…ÉÑ•ˆ°(€€€€€€€Ñ•áÐè(€€€€€€€€€‘•˜¹ÑåÁ”€ôôô€‰ÍÉ…Ñ ˆ€˜˜É½ÝÌ¹Í½µ” ¡È¤€ôøÈ¹‘¥ÍÅÕ…±¥™¥•¤(€€€€€€€€€€€€ü€‰9¼•±¥¥‰±”½µÁ•Ñ¥Ñ½ÈÉ•µ…¥¹Ìˆ(€€€€€€€€€€€€è€‰9½ÐÍÑ…ÉÑ•ˆ°(€€€€€€€…Ý…É‘…‰±”è‘•˜¹…Ý…É‘…‰±”€„ôô™…±Í”°(€€€€€ôì(€€€½¹ÍÐÑ•…µ5•µ‰•ÉÌ€ô(€€€€€€¡‘•˜¹ÑåÁ”€ôôô€‰‰•ÍÐÌˆñð(€€€€€€€‘•˜¹ÑåÁ”€ôôô€‰…µ‰É½Í”ˆñð(€€€€€€€‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆñð(€€€€€€€€¡‘•˜¹ÑåÁ”€ôôô€‰ÁÕÑÑÌˆ€˜˜ÍÑ½É”¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€„ôô€‰Á…¥ÉÌˆ¤¤€˜˜(€€€€€Ñ½À¹‘•Ñ…¥°(€€€€€€€€ü€€ ‘íÑ½À¹‘•Ñ…¥±ô¥€(€€€€€€€€è€ˆˆì(€€€½¹ÍÐÍÉ…Ñ¡M½É”€ô(€€€€€Ñ½À¹ÍÉ…Ñ¡Q½A…È€ôôô€À(€€€€€€€€ü€‰ˆ(€€€€€€€€èÑ½À¹ÍÉ…Ñ¡Q½A…È€ø€À(€€€€€€€€€€ü€¬‘íÑ½À¹ÍÉ…Ñ¡Q½A…Éõ€(€€€€€€€€€€èƒŠ"H‘í5…Ñ ¹…‰Ì¡Ñ½À¹ÍÉ…Ñ¡Q½A…È¥õ€ì(€€€½¹ÍÐÉ•ÍÕ±Ð€ô(€€€€€l‰ÍÉ…Ñ ˆ°€‰ÍÉ…Ñ¡…É•…Ñ”‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤(€€€€€€€€ü½µÁ±•Ñ”(€€€€€€€€€€ü€‘íÑ½À¹É½ÍÍQ½Ñ…±ôÍÑÉ½­•Ì€ ‘íÍÉ…Ñ¡M½É•ô¥€(€€€€€€€€€€è€‘íÍÉ…Ñ¡M½É•ôƒ
ÜQ¡ÉÔ€‘íÑ½À¹Ñ¡ÉÕõ€(€€€€€€€€è‘•˜¹ÑåÁ”€ôôô€‰…µ‰É½Í”ˆ(€€€€€€€€€€üÑ½À¹Ñ¡ÉÔ€ôôôÑ½À¹Ñ…É•Ð€˜˜Ñ½À¹¡…¹‘¥…À€„ô¹Õ±°(€€€€€€€€€€€€ü€‘í½µÁ±•Ñ”€ü€ˆˆ€è€‰AÉ½Ù¥Í¥½¹…°±•…‘•ÈƒŠP€‰ô‘íÑ½À¹É½ÍÍQ½Ñ…±ôÉ½ÍÌƒ
Ü€‘íÑ½À¹¡…¹‘¥…À¹Ñ½¥á• Ä¥ô¡Àƒ
Ü€‘íÑ½À¹Ñ½Ñ…°¹Ñ½¥á• Ä¥ô¹•Ñ€(€€€€€€€€€€€€è€‘íÑ½À¹É½ÍÍQ½Ñ…±ôÉ½ÍÌƒ
ÜQ¡ÉÔ€‘íÑ½À¹Ñ¡ÉÕõ€(€€€€€€€€è‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆ(€€€€€€€€€€üÑ½À¹±½ÍÌ(€€€€€€€€€€€€ü€‘íÑ½À¹Ñ½Ñ…±ôÁÑÌƒ
Ü‰…±°±½ÍÐ½¸!½±”€‘íÑ½À¹±½ÍÌ¹¡½±•õ€(€€€€€€€€€€€€è€‘íÑ½À¹Ñ½Ñ…±ôÁÑÌƒ
Ü…±°€Äà¡½±•Ì½µÁ±•Ñ•‘€(€€€€€€€€€€è€‘íÑ½À¹Ñ½Ñ…±ô€‘í‘•˜¹ÑåÁ”€ôôô€‰ÁÕÑÑÌˆ€ü€‰ÁÕÑÑÌˆ€èl‰ÍÑÉ½­•É½ÍÌˆ°‰ÍÑÉ½­•9•Ð‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤€ü€‰ÍÑÉ½­•Ìˆ€è€‰ÁÑÌ‰õ€ì(€€€½¹ÍÐÉ•ÍÕ±ÑQ•áÐ€ô‘•˜¹…É•…Ñ•1•œ(€€€€€€ü€‘íÑ½À¹¹…µ•ô±•…ä€‘í‘•˜¹‘…åô½˜Ñ¡”Ù•¹ÐƒŠP€‘íÉ•ÍÕ±Ñô‘íÑ½À¹ˆ€ü€ˆˆ€è€ˆ‰õ€(€€€€€€è‘•˜¹…É•…Ñ•I•ÍÕ±Ð(€€€€€€€€ü€‘íÑ½À¹¹…µ•ôƒŠPÉ•…Ñ”€‘íÉ•ÍÕ±Ñô‘íÑ½À¹ˆ€ü€ˆˆ€è€ˆ‰õ€(€€€€€€€€è€‘íÑ½À¹¹…µ•ô‘íÑ•…µ5•µ‰•ÉÍôƒŠP€‘íÉ•ÍÕ±Ñô‘íÑ½À¹ˆ€ü€ˆˆ€è€ˆ‰õ€ì(€€€É•ÑÕÉ¸ì(€€€€€½µÁ±•Ñ”°(€€€€€ÍÑ…ÑÕÌè½µÁ±•Ñ”€ü€‰½µÁ±•Ñ•ˆ€è€‰%¸AÉ½É•ÍÌˆ°(€€€€€Ñ•áÐèÉ•ÍÕ±ÑQ•áÐ°(€€€€€…Ý…É‘…‰±”è‘•˜¹…Ý…É‘…‰±”€„ôô™…±Í”°(€€€ôì(€ô(€™Õ¹Ñ¥½¸½µÁ•Ñ¥Ñ¥½¹]¥¹¹•É%‘Ì¡‘•˜¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰¹ÑÀˆ¤(€€€€€É•ÑÕÉ¸l(€€€€€€€€¸¸¹¹•ÜM•Ð (€€€€€€€€€¹ÑÁ!½±•Í½È¡‘•˜¹‘…ä¤(€€€€€€€€€€€€¹µ…À ¡¡½±”¤€ôøÕÉÉ•¹Ñ9ÑÁ!½±‘•È¡‘•˜¹‘…ä°¡½±”¤ü¹¥¤(€€€€€€€€€€€€¹™¥±Ñ•È¡	½½±•…¸¤(€€€€€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤°(€€€€€€€€¤°(€€€€€tì(€€€½¹ÍÐÉ½ÝÌ€ô…±Õ±…Ñ•1•…‘•É‰½…É¡‘•˜¤¹™¥±Ñ•È ¡É½Ü¤€ôø€…É½Ü¹‘¥ÍÅÕ…±¥™¥•¤ì(€€€¥˜€ …±•…‘•É‰½…É‘½µÁ±•Ñ”¡‘•˜°É½ÝÌ¤ñð€…É½ÝÌ¹±•¹Ñ ¤É•ÑÕÉ¸mtì(€€€½¹ÍÐÝ¥¹¹•ÉÌ€ôÉ½ÝÌ¹™¥±Ñ•È ¡É½Ü¤€ôøÉ½Ü¹É…¹¬€ôôô€Ä¤ì(€€€¥˜€¡l‰Í¥¹±”ˆ°€‰½µ‰¥¹•ˆ°€‰ÍÉ…Ñ ˆ°€‰ÍÉ…Ñ¡…É•…Ñ”ˆ°€‰Á…ÈÍ¥¹‘¥Ù¥‘Õ…±…É•…Ñ”ˆ°€‰•±•Ñ¥Œ‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤¤(€€€€€É•ÑÕÉ¸Ý¥¹¹•ÉÌ¹™±…Ñ5…À¡É½Üôø…‘•˜¹‘…ä€˜˜½±™M¡…É•‘A½Í¥Ñ¥½¹Ì¹µ•µ‰•ÉÌ¡ÍÑ½É”¹•Ù•¹Ð±Í¡…É•‘A½Í¥Ñ¥½¹%¡É½Ü¹¥¤¤¹±•¹Ñ €ü½±™M¡…É•‘A½Í¥Ñ¥½¹Ì¹µ•µ‰•ÉÌ¡ÍÑ½É”¹•Ù•¹Ð±Í¡…É•‘A½Í¥Ñ¥½¹%¡É½Ü¹¥¤¤€èmMÑÉ¥¹œ¡É½Ü¹¥¥t¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰…ÁQ•…µÌˆ¤É•ÑÕÉ¸Ý¥¹¹•ÉÌ¹™±…Ñ5…À¡É½Ü€ôø€¡ÍÑ½É”¹•Ù•¹Ð¹…ÁQ•…µÌü¹mÉ½Ü¹¥‘tñðmt¤¹™±…Ñ5…À¡¥ôù½±™M¡…É•‘A½Í¥Ñ¥½¹Ì¹µ•µ‰•ÉÌ¡ÍÑ½É”¹•Ù•¹Ð±Í¡…É•‘A½Í¥Ñ¥½¹%¡¥¤¤¹±•¹Ñ €ü½±™M¡…É•‘A½Í¥Ñ¥½¹Ì¹µ•µ‰•ÉÌ¡ÍÑ½É”¹•Ù•¹Ð±Í¡…É•‘A½Í¥Ñ¥½¹%¡¥¤¤€èm¥‘t¤¤¹µ…À¡MÑÉ¥¹œ¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆ¤(€€€€€É•ÑÕÉ¸l(€€€€€€€€¸¸¹¹•ÜM•Ð (€€€€€€€€€Ý¥¹¹•ÉÌ¹™±…Ñ5…À ¡É½Ü¤€ôøì(€€€€€€€€€€€½¹ÍÐÉ½ÕÁ%¹‘•à€ô€­MÑÉ¥¹œ¡É½Ü¹¥¤¹É•Á±…” ½y‘q­œ¼°€ˆˆ¤ì(€€€€€€€€€€€É•ÑÕÉ¸å•±±½Ý	…±±Q•…´¡‘•˜¹‘…ä°É½ÕÁ%¹‘•à¤ì(€€€€€€€€€ô¤°(€€€€€€€€¤°(€€€€€t¹µ…À¡MÑÉ¥¹œ¤ì(€€€½¹ÍÐ­¥¹€ô(€€€€€‘•˜¹ÑåÁ”€ôôô€‰‰•ÍÐÌˆñð‘•˜¹ÑåÁ”€ôôô€‰Á…ÈÍÑ•…´ˆñð(€€€€€‘•˜¹ÑåÁ”€ôôô€‰…µ‰É½Í”ˆñð(€€€€€‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆñð(€€€€€€¡‘•˜¹ÑåÁ”€ôôô€‰ÁÕÑÑÌˆ€˜˜ÍÑ½É”¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€„ôô€‰Á…¥ÉÌˆ¤(€€€€€€€€ü€‰Ñ•…´ˆ(€€€€€€€€è€‰Á…¥Èˆì(€€€½¹ÍÐ‘…ä€ô‘•˜¹‘…äñð€¡‘•˜¹ÑåÁ”€ôôô€‰Á…ÈÍ…É•…Ñ”ˆ€üÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€è€Ä¤ì(€€€½¹ÍÐÕ¹¥ÑÌ€ô±•…‘•É‰½…É‘U¹¥ÑÌ¡‘…ä°­¥¹°€…‘•˜¹‘…ä¤ì(€€€É•ÑÕÉ¸l(€€€€€€¸¸¹¹•ÜM•Ð (€€€€€€€Ý¥¹¹•ÉÌ¹™±…Ñ5…À (€€€€€€€€€€¡É½Ü¤€ôøÕ¹¥ÑÌ¹™¥¹ ¡Õ¹¥Ð¤€ôøÕ¹¥Ð¹¥€ôôôÉ½Ü¹¥¤ü¹¥‘Ìñðmt°(€€€€€€€€¤°(€€€€€€¤°(€€€t¹™±…Ñ5…À¡¥ôø…‘•˜¹‘…ä€˜˜½±™M¡…É•‘A½Í¥Ñ¥½¹Ì¹µ•µ‰•ÉÌ¡ÍÑ½É”¹•Ù•¹Ð±Í¡…É•‘A½Í¥Ñ¥½¹%¡¥¤¤¹±•¹Ñ €ü½±™M¡…É•‘A½Í¥Ñ¥½¹Ì¹µ•µ‰•ÉÌ¡ÍÑ½É”¹•Ù•¹Ð±Í¡…É•‘A½Í¥Ñ¥½¹%¡¥¤¤€èmMÑÉ¥¹œ¡¥¥t¤ì(€ô(€™Õ¹Ñ¥½¸‰Õ¥±‘¥¹…±A±…å•É5•ÍÍ…•Ì¡‘•™Ì¤ì(€€€½¹ÍÐ½ÕÑ½µ•Ì€ôíôì(€€€l¸¸¹¹•ÜM•Ð¡•Ù•¹Ñ…åÌ ¤¹™±…Ñ5…À¡‘…å¥•±‘%‘Ì¤¥t(€€€€€€¹™¥±Ñ•È¡¥ôùMÑÉ¥¹œ¡¥¤„ôõ9=}AIQ9I}%¤¹™½É… ¡¥ôù½ÕÑ½µ•ÍmMÑÉ¥¹œ¡¥¥tõmt¤ì(€€€‘•™Ì¹™½É…  ¡‘•˜¤€ôø(€€€€€½µÁ•Ñ¥Ñ¥½¹]¥¹¹•É%‘Ì¡‘•˜¤¹™½É…  ¡¥¤€ôøì(€€€€€€€¥˜€¡½ÕÑ½µ•Ím¥‘t€˜˜€…½ÕÑ½µ•Ím¥‘t¹¥¹±Õ‘•Ì¡‘•˜¹±…‰•°¤¤(€€€€€€€€€½ÕÑ½µ•Ím¥‘t¹ÁÕÍ ¡‘•˜¹±…‰•°¤ì(€€€€€ô¤°(€€€€¤ì(€€€É•ÑÕÉ¸½ÕÑ½µ•Ìì(€ô(€™Õ¹Ñ¥½¸™¥¹…±5•ÍÍ…•½ÉA±…å•È¡¥¤ì(€€€½¹ÍÐ™¥ÉÍÐ€ôÁ±…å•É¥ÉÍÑ9…µ”¡¥¤ì(€€€É•ÑÕÉ¸ì(€€€€€¡•…‘¥¹œèQ¡…¹­Ì™½È©½¥¹¥¹œÑ¡¥Ì½±˜Ù•¹Ð°€‘í™¥ÉÍÑô¸%Ð¥Ì¡½Á•å½Ô…¸©½¥¸½Ñ¡•È•Ù•¹ÑÌ¥¸Ñ¡”™ÕÑÕÉ”¹€°(€€€€€µ•ÍÍ…”è€ˆˆ°(€€€€€Í½É¥¹É•‘¥Ðè€‰M½É¥¹œÉÕ¸½¸Ý…ä½±˜M½É•Èˆ°(€€€ôì(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸½¹™¥ÉµI•ÍÕ±ÑÍ¹‘±½Í•Ù•¹Ð ¤ì(€€€½¹ÍÐÕ•ÍÑ±½Í¥¹Ù•¹Ð€ô¥ÍÕ•ÍÑ=É…¹¥Í•È ¤ì(€€€¥˜€¡ÍÑ½É”¹±½Õü¹•Ù•¹Ñ%¤ì(€€€€€½¹ÍÐÉ•™É•Í¡•€ô…Ý…¥ÐÍå¹±½Õ‘9½Ü ¤ì(€€€€€¥˜€ …É•™É•Í¡•¤ì(€€€€€€€…±•ÉÐ ‰Q¡”•Ù•¹Ð…¹¹½Ð‰”±½Í•Õ¹Ñ¥°Ñ¡”±…Ñ•ÍÐ½¹±¥¹”Í½É•…É‘Ì¡…Ù”‰••¸É•±½…‘•ÍÕ•ÍÍ™Õ±±ä¸ˆ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€ô(€€€½¹ÍÐÉ•ÅÕ¥É•‘…åÌ€ôÉÉ…ä¹™É½´ (€€€€€ì±•¹Ñ èÍÑ½É”¹•Ù•¹Ð¹‘…åÌñð€Äô°(€€€€€€¡|°¥¹‘•à¤€ôø¥¹‘•à€¬€Ä°(€€€€¤ì(€€€½¹ÍÐÕ¹™¥¹¥Í¡•‘…åÌ€ôÉ•ÅÕ¥É•‘…åÌ¹™¥±Ñ•È (€€€€€€¡‘…ä¤€ôø€…•Ù•¹Ñ…å½µÁ±•Ñ”¡‘…ä¤°(€€€€¤ì(€€€¥˜€¡Õ¹™¥¹¥Í¡•‘…åÌ¹±•¹Ñ ¤ì(€€€€€…±•ÉÐ (€€€€€€€Q¡”•Ù•¹Ð…¹¹½Ð‰”±½Í•å•Ð¸€‘íÕ¹™¥¹¥Í¡•‘…åÌ¹µ…À ¡‘…ä¤€ôø…ä€‘í‘…åõ€¤¹©½¥¸ ˆ…¹€ˆ¥ôÍ½É¥¹œ¥ÌÍÑ¥±°¥¹½µÁ±•Ñ”¹€°(€€€€€€¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€½¹ÍÐ‘•™Ì€ô±•…‘•É‰½…É‘•™¥¹¥Ñ¥½¹Ì ¤°(€€€€€¥¹½µÁ±•Ñ”€ô‘•™Ì¹™¥±Ñ•È (€€€€€€€€¡‘•˜¤€ôø€…ÍÕµµ…Éå½µÁ•Ñ¥Ñ¥½¹I•ÍÕ±Ð¡‘•˜¤¹½µÁ±•Ñ”°(€€€€€€¤ì(€€€¥˜€¡¥¹½µÁ±•Ñ”¹±•¹Ñ ¤ì(€€€€€…±•ÉÐ (€€€€€€€I•ÍÕ±ÑÌ…¹¹½Ð‰”½¹™¥Éµ•å•Ð¸MÑ¥±°¥¸ÁÉ½É•ÍÌè€‘í¥¹½µÁ±•Ñ”¹µ…À ¡¤€ôø¹±…‰•°¤¹©½¥¸ ˆ°€ˆ¥ô¹€°(€€€€€€¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€¥˜€ (€€€€€€…½¹™¥É´ (€€€€€€€€‰½¹™¥É´…±°É•ÍÕ±ÑÌ…¹±½Í”Ñ¡¥Ì•Ù•¹ÐüA•ÉÍ½¹…°™¥¹¥Í¡¥¹œµ•ÍÍ…•ÌÝ¥±°Ñ¡•¸…ÁÁ•…È½¸Á±…å•ÉÌœÁ¡½¹•Ì¸ˆ°(€€€€€€¤(€€€€¤(€€€€€É•ÑÕÉ¸ì(€€€ÍÑ½É”¹•Ù•¹Ð¹™¥¹…±I•ÍÕ±ÑÌ€ôì(€€€€€Í½É¥¹IÕ±•ÍY•ÉÍ¥½¸è€È°(€€€€€½¹™¥Éµ•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€½ÕÑ½µ•Ìè‰Õ¥±‘¥¹…±A±…å•É5•ÍÍ…•Ì¡‘•™Ì¤°(€€€ôì(€€€ÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÑÕÌ€ô€‰½µÁ±•Ñ”ˆì(€€€É•½É‘½µÁ±•Ñ•‘Ù•¹Ñ!¥ÍÑ½Éä¡ÍÑ½É”¹•Ù•¹Ð¤ì(€€€Á•ÉÍ¥ÍÑMÑ½É” ¤ì(€€€½¹ÍÐ±½Í•‘=¹±¥¹”€ô…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€¥˜€¡Õ•ÍÑ±½Í¥¹Ù•¹Ð€˜˜±½Í•‘=¹±¥¹”¤ì(€€€€€•¹‘Õ•ÍÑ=É…¹¥Í•ÉM•ÍÍ¥½¸ (€€€€€€€€‰Q¡”•Ù•¹Ð¡…Ì‰••¸±½Í•ÍÕ•ÍÍ™Õ±±ä¸e½ÕÈÍ¥¹±”µ•Ù•¹ÐÕ•ÍÐ=É…¹¥Í•È…•ÍÌ¡…Ì¹½Ü•¹‘•¸ˆ°(€€€€€€¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€É•¹‘•É!½µ” ¤ì(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸…É¡¥Ù•½µÁ±•Ñ•‘Ù•¹Ð ¤ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ðü¹™¥¹…±I•ÍÕ±ÑÌü¹½¹™¥Éµ•‘Ð¤É•ÑÕÉ¸…±•ÉÐ ‰½¹™¥É´Ñ¡”™¥¹…°É•ÍÕ±ÑÌ‰•™½É”…É¡¥Ù¥¹œÑ¡¥Ì•Ù•¹Ð¸ˆ¤ì(€€€½¹ÍÐ•Ù•¹Ñ9…µ”õÍÑ½É”¹•Ù•¹Ð¹¹…µ•ñð‰Ñ¡¥Ì½µÁ±•Ñ••Ù•¹Ðˆ±±½Õ‘Ù•¹Ñ%õMÑÉ¥¹œ¡ÍÑ½É”¹±½Õü¹•Ù•¹Ñ%‘ñðˆˆ¤ì(€€€¥˜ …½¹™¥É´¡±½Í”…¹…É¡¥Ù”€‘í•Ù•¹Ñ9…µ•ôýq¹q¹¥¹…°É•ÍÕ±ÑÌÝ¥±°É•µ…¥¸¥¸A…ÍÐÙ•¹ÑÌ¸Q¡”ÁÕ‰±¥Í¡••Ù•¹ÐÝ¥±°±½Í”…¹½¹¹•Ñ•Á±…å•ÈÁ¡½¹•ÌÝ¥±°‰”É•±•…Í•™½ÈÑ¡•¥È¹•áÐ•Ù•¹Ð¹€¤¥É•ÑÕÉ¸ì(€€€½¹ÍÐ‰ÕÑÑ½¸ô ˆ…É¡¥Ù•½µÁ±•Ñ•‘Ù•¹Ðˆ¤ì(€€€¥˜¡‰ÕÑÑ½¸¥í‰ÕÑÑ½¸¹‘¥Í…‰±•õÑÉÕ”í‰ÕÑÑ½¸¹Ñ•áÑ½¹Ñ•¹Ðô‰I!%Y%9Š˜ˆíô(€€€ÑÉäì(€€€€€¥˜¡±½Õ‘Ù•¹Ñ%¥ì(€€€€€€€½¹ÍÐ±…Ñ•ÍÐõ…Ý…¥Ð±½Õ‘Q¥µ•½ÕÐ¡Ý…å±½Õ¹±½…‘Ù•¹Ð¡±½Õ‘Ù•¹Ñ%¤¤ì(€€€€€€€½¹ÍÐ±½Õ‘I•ÍÕ±ÑÍ½¹™¥Éµ•õ	½½±•…¸¡±…Ñ•ÍÐü¹•Ù•¹Ðü¹•Ù•¹Ñ}‘…Ñ„ü¹•Ù•¹Ðü¹™¥¹…±I•ÍÕ±ÑÌü¹½¹™¥Éµ•‘Ð¤ì(€€€€€€€¥˜ …±½Õ‘I•ÍÕ±ÑÍ½¹™¥Éµ•¥ì(€€€€€€€€€½¹ÍÐÍ…Ù•õ…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€€€€€¥˜ …Í…Ù•¥Ñ¡É½Ü¹•ÜÉÉ½È ‰Q¡”™¥¹…°É•ÍÕ±ÑÌ½Õ±¹½Ð‰”½¹™¥Éµ•½¹±¥¹”¸UÍ”I•ÑÉäMå¹Œ…¹ÑÉä……¥¸¸ˆ¤ì(€€€€€€€ô(€€€€€€€…Ý…¥ÐÝ…å±½Õ¹…É¡¥Ù•Ù•¹Ð¡±½Õ‘Ù•¹Ñ%¤ì(€€€€€€€…Ý…¥ÐÝ…å±½Õ¹Í…Ù•]½É­ÍÁ…”¡í…Ñ¥Ù•AÕ‰±¥Í¡•‘Ù•¹Ðé¹Õ±±ô¤ì(€€€€€€€™½É•ÑAÕ‰±¥Í¡•‘Ù•¹Ð¡±½Õ‘Ù•¹Ñ%¤ì(€€€€€€€ÑÉäì(€€€€€€€€€½±™M…™•±½Õ¹‘¥Í…É‘Ù•¹Ñ½Á¥•Ì¡±½Õ‘Ù•¹Ñ%¤ì(€€€€€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€€€€€€¼¼±½Õ±½ÍÕÉ”¡…Ì…±É•…‘äÍÕ••‘•¸1½…°±•…¹ÕÀ¥Ì¡•±Á™Õ°‰ÕÐ(€€€€€€€€€€¼¼µÕÍÐ¹•Ù•Èµ…­”„ÍÕ•ÍÍ™Õ±±ä…É¡¥Ù••Ù•¹Ð…ÁÁ•…ÈÑ¼¡…Ù”(€€€€€€€€€€¼¼™…¥±•½È¥¹Ù¥Ñ”„Í•½¹…É¡¥Ù”…ÑÑ•µÁÐ¸(€€€€€€€€€½¹Í½±”¹Ý…É¸ ‰É¡¥Ù•µ•Ù•¹ÐÉ•½Ù•Éä½Á¥•Ì½Õ±¹½Ð‰”É•µ½Ù•ˆ°•ÉÉ½È¤ì(€€€€€€€ô(€€€€€ô(€€€€€ÍÑ½É”¹•Ù•¹Ð¹…É¡¥Ù•‘Ðõ¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€…ÁÑÕÉ•ÕÉÉ•¹ÑÙ•¹Ð ¤ì(€€€€€½¹ÍÐÝ½É­ÍÁ…•%õMÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¹Ý½É­ÍÁ…•%‘ññÍÑ½É”¹…Ñ¥Ù•Ù•¹Ñ%‘ñðˆˆ¤ì(€€€€€½¹ÍÐÉ•½ÉõÍÑ½É”¹•Ù•¹Ñ]½É­ÍÁ…”ü¹™¥¹¡¥Ñ•´ôùMÑÉ¥¹œ¡¥Ñ•´¹¥¤ôôõÝ½É­ÍÁ…•%¤ì(€€€€€¥˜¡É•½É¥íÉ•½É¹…É¡¥Ù•õÑÉÕ”íÉ•½É¹ÕÁ‘…Ñ•‘Ðõ¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤íô(€€€€€±½Í•±½Õ‘½¹¹•Ñ¥½¸ ¤ì(€€€€€™½É•Ñ=É…¹¥Í•ÉÙ•¹Ð ¤ì(€€€€€Ý½É­ÍÁ…•M¡É¥¹­ÕÑ¡½É¥Í•õÑÉÕ”ì(€€€€€ÍÑ½É”¹•Ù•¹Ðõ¹Õ±°ì(€€€€€ÍÑ½É”¹…Ñ¥Ù•Ù•¹Ñ%õ¹Õ±°ì(€€€€€‘•±•Ñ”ÍÑ½É”¹±½Õì(€€€€€ÍÑ½É”¹±½Õ‘A±…å•ÉÌõmtì(€€€€€Á•ÉÍ¥ÍÑMÑ½É” ¤ì(€€€€€…ÁÁ±å•Ù¥•I½±” ¤ì(€€€€€É•¹‘•É!½µ” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€¹…Ø ‰¡½µ”ˆ¤ì(€€€€€Í•Ñ±½Õ‘5•ÍÍ…” ‰½µÁ±•Ñ••Ù•¹Ð…É¡¥Ù•ƒ
ÜÉ•ÍÕ±ÑÌÉ•Ñ…¥¹•¥¸A…ÍÐÙ•¹ÑÌˆ¤ì(€€€€€•¹‘M½É•…É‘UÁ‘…Ñ•AÉ½Ñ•Ñ¥½¸ ¤ì(€€€€€…±•ÉÐ¡€‘í•Ù•¹Ñ9…µ•ô¥Ì¹½Ü…É¡¥Ù•¸¥¹…°É•ÍÕ±ÑÌÉ•µ…¥¸…Ù…¥±…‰±”¥¸A…ÍÐÙ•¹ÑÌ…¹½¹¹•Ñ•Á¡½¹•ÌÝ¥±°É•ÑÕÉ¸Ñ¼Á±…å•È•¹ÑÉä¹€¤ì(€€€ô…Ñ ¡•ÉÉ½È¤ì(€€€€€¥˜¡‰ÕÑÑ½¸¥í‰ÕÑÑ½¸¹‘¥Í…‰±•õ™…±Í”í‰ÕÑÑ½¸¹Ñ•áÑ½¹Ñ•¹Ðô‰Y9P=5A1QƒŠPI1MA!=9L€˜I!%Yˆíô(€€€€€…±•ÉÐ ‰Q¡”•Ù•¹ÐÝ…Ì¹½Ð…É¡¥Ù•¸€ˆ¬¡•ÉÉ½È¹µ•ÍÍ…•ññ•ÉÉ½È¤¤ì(€€€ô(€ô(€™Õ¹Ñ¥½¸±•…‘•É‰½…É‘	•¹•™¥Ñ%¡‘•˜¤ì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰Í¥¹±”ˆ¤É•ÑÕÉ¸€‰‘…¥±åMÑ…‰±•™½Éˆì(€€€É•ÑÕÉ¸€ (€€€€€ì(€€€€€€€½µ‰¥¹•è€‰½Ù•É…±±MÑ…‰±•™½Éˆ°(€€€€€€€™½ÕÉ‰…±°è€‰™½ÕÉ‰…±°ˆ°(€€€€€€€ÁÕÑÑÌè€‰Ñ•…µAÕÑÑÌˆ°(€€€€€€€‰•ÍÐÌè€‰‰•ÍÐÍ½˜Ðˆ°(€€€€€€€…µ‰É½Í”è€‰…µ‰É½Í”ˆ°(€€€€€€€å•±±½Ý	…±°è€‰å•±±½Ý	…±°ˆ°(€€€€€€€ÍÉ…Ñ è€‰ÍÉ…Ñ ˆ°(€€€€€€€¹ÑÀè€‰¹ÑÀˆ°(€€€€€€€Á…ÈÌè€‰Á…ÈÌˆ°(€€€€€€€Á…ÈÍ…É•…Ñ”è€‰Á…ÈÌˆ°(€€€€€€€Á…ÈÍ¥¹‘¥Ù¥‘Õ…±…É•…Ñ”è€‰Á…ÈÌˆ°(€€€€€€€Á…ÈÍÑ•…´è€‰Á…ÈÌˆ°(€€€€€€€ÍÉ…Ñ¡…É•…Ñ”è€‰ÍÉ…Ñ ˆ°(€€€€€€€…ÁQ•…µÌè€‰…ÁQ•…µÌˆ°(€€€€€€€•±•Ñ¥Œè€‰•±•Ñ¥Œˆ°(€€€€€õm‘•˜¹ÑåÁ•tñð‘•˜¹ÑåÁ”(€€€€¤ì(€ô(€™Õ¹Ñ¥½¸ÍÕµµ…ÉåAÉ¥é••Ñ…¥±Ì¡‘•˜¤ì(€€€¥˜€¡‘•˜¹…Ý…É‘…‰±”€ôôô™…±Í”¤É•ÑÕÉ¸í¥é±•…‘•É‰½…É‘	•¹•™¥Ñ%¡‘•˜¤±Ñ•áÐè‰9½ÐÁÁ±¥…‰±”ˆ±½¹™¥ÕÉ•é™…±Í”±…Ý…É‘•é™…±Í•ôì(€€€½¹ÍÐ¥€ô±•…‘•É‰½…É‘	•¹•™¥Ñ%¡‘•˜¤°(€€€€€Ñ•áÐ€ô½µÁ•Ñ¥Ñ¥½¹	•¹•™¥ÑQ•áÐ¡¥°ÍÑ½É”¹•Ù•¹Ð¹‰•¹•™¥ÑÌ¤°(€€€€€½¹™¥ÕÉ•€ôÑ•áÐ€„ôô€‰AÉ¥é”¹½ÐÍ•Ðˆ°(€€€€€‘¥ÍÁ±…åQ•áÐ€ô(€€€€€€€‘•˜¹ÑåÁ”€ôôô€‰¹ÑÀˆ€˜˜ÍÑ½É”¹•Ù•¹Ðü¹¹ÑÁ)…­Á½Ð€˜˜½¹™¥ÕÉ•(€€€€€€€€€€ü€‰M¡½Ý¸‰ä9Q@¡½±”…‰½Ù”ˆ(€€€€€€€€€€èÑ•áÐì(€€€É•ÑÕÉ¸ì(€€€€€¥°(€€€€€Ñ•áÐè‘¥ÍÁ±…åQ•áÐ°(€€€€€½¹™¥ÕÉ•°(€€€€€…Ý…É‘•è	½½±•…¸¡ÍÑ½É”¹•Ù•¹Ð¹ÁÉ¥é•ÍÝ…É‘•ü¹m‘•˜¹¥‘t¤°(€€€ôì(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸Í•ÑAÉ¥é•Ý…É‘•¡‘•™%°…Ý…É‘•¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹ÁÉ¥é•ÍÝ…É‘•€ôÍÑ½É”¹•Ù•¹Ð¹ÁÉ¥é•ÍÝ…É‘•ñðíôì(€€€¥˜€¡…Ý…É‘•¤(€€€€€ÍÑ½É”¹•Ù•¹Ð¹ÁÉ¥é•ÍÝ…É‘•‘m‘•™%‘t€ôì(€€€€€€€…Ý…É‘•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€ôì(€€€•±Í”‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹ÁÉ¥é•ÍÝ…É‘•‘m‘•™%‘tì(€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ€˜˜ÍÑ½É”¹±½Õü¹•Ù•¹Ñ%¤(€€€€€…Ý…¥ÐÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É1•…‘•É‰½…É‘MÕµµ…Éä¡¡½ÍÐ°‘•™Ì°Ù¥•ÝQ…‰Ì¤ì(€€€½¹ÍÐÉ½ÕÁÌ€ôl(€€€€€€¸¸¹•Ù•¹Ñ…åÌ ¤¹µ…À¡‘…ä€ôø€¡íÑ¥Ñ±”è€‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌôôôÄü‰Ù•¹ÐI•ÍÕ±ÑÌˆé…ä€‘í‘…åôI•ÍÕ±ÑÍô‘í½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ­‘…åt¤ü¹¹…µ”€ü€ƒŠP€‘í½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ­‘…åt¤¹¹…µ•õ€€è€ˆ‰õ€°‘•™Ìé‘•™Ì¹™¥±Ñ•È¡ôù¹Í½Á”ôôõ‘…ä¥ô¤¤°(€€€€€íÑ¥Ñ±”è‰=Ù•É…±°Ù•¹ÐI•ÍÕ±ÑÌˆ±‘•™Ìé‘•™Ì¹™¥±Ñ•È¡ôù¹Í½Á”ôôô‰½Ù•É…±°ˆ¥ô°(€€€t¹™¥±Ñ•È¡É½ÕÀôùÉ½ÕÀ¹‘•™Ì¹±•¹Ñ ¤ì(€€€½¹ÍÐ½É…¹¥Í•È€ô€…ÍÑ½É”¹•Ù•¹Ð¹Á…ÍÑÙ•¹ÑI•…‘=¹±ä€˜˜€…l‰Á±…å•Èˆ°‰ÍÁ•Ñ…Ñ½È‰t¹¥¹±Õ‘•Ì¡ÍÑ½É”¹±½Õü¹É½±”¤°(€€€€€•Ù•¹Ñ½µÁ±•Ñ”€ô•Ù•¹Ñ…åÌ ¤¹•Ù•Éä¡•Ù•¹Ñ…å½µÁ±•Ñ”¤°(€€€€€•Ù•¹Ñ±½Í•€ô	½½±•…¸¡ÍÑ½É”¹•Ù•¹Ð¹™¥¹…±I•ÍÕ±ÑÌü¹½¹™¥Éµ•‘Ð¤ì(€€€±•Ð•Ù•¹Ñ½¹ÑÉ½°€ô€ˆˆì(€€€¥˜€¡½É…¹¥Í•È€˜˜•Ù•¹Ñ±½Í•¤ì(€€€€€•Ù•¹Ñ½¹ÑÉ½°€ô€ñÍ•Ñ¥½¸±…ÍÌô‰™¥¹¥Í¡½¹ÑÉ½°ˆøñ ÌùÙ•¹Ð±½Í•ƒŠP5•ÍÍ…•ÌI•…‘äð½ ÌøñÀùQ¡”½¹™¥Éµ•É•ÍÕ±ÑÌ…¹Á•ÉÍ½¹…°™¥¹¥Í¡¥¹œµ•ÍÍ…•Ì…É”¹½Ü…Ù…¥±…‰±”½¸•Ù•Éä½¹¹•Ñ•Á±…å•ÈÁ¡½¹”¸ð½Àøñ‘¥Ø±…ÍÌô‰™¥¹¥Í¡5•ÍÍ…•AÉ•Ù¥•Üˆø‘í‘…å¥•±‘%‘Ì Ä¤(€€€€€€€€¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤(€€€€€€€€¹µ…À ¡¥¤€ôøì(€€€€€€€€€½¹ÍÐ´€ô™¥¹…±5•ÍÍ…•½ÉA±…å•È¡¥¤ì(€€€€€€€€€É•ÑÕÉ¸€ñ‘¥Øøñˆø‘í•ÍŒ¡Á±…å•È¡¥¤ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½ˆøñÍÁ…¸ø‘í•ÍŒ¡´¹¡•…‘¥¹œ¥ô‘í´¹µ•ÍÍ…”€ü€€‘í•ÍŒ¡´¹µ•ÍÍ…”¥õ€€è€ˆ‰ôñÍµ…±°±…ÍÌô‰Í½É¥¹É•‘¥Ðˆø‘í•ÍŒ¡´¹Í½É¥¹É•‘¥Ð¥ôð½Íµ…±°øð½ÍÁ…¸øð½‘¥Øù€ì(€€€€€€€ô¤(€€€€€€€€¹©½¥¸ ˆˆ¥ôð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÌô‰™¥¹¥Í¡Ù•¹Ñ	Ñ¸ˆ¥ô‰…É¡¥Ù•½µÁ±•Ñ•‘Ù•¹ÐˆùY9P=5A1QƒŠPI1MA!=9L€™…µÀìI!%Yð½‰ÕÑÑ½¸øñÀù¥¹…°É•ÍÕ±ÑÌÉ•µ…¥¸…Ù…¥±…‰±”¥¸A…ÍÐÙ•¹ÑÌ¸½¹¹•Ñ•Á¡½¹•Ì…É”É•±•…Í•…¹½‰Í½±•Ñ”ÁÉ½Ñ•Ñ•Ý½É­¥¹œ½Á¥•Ì…É”É•µ½Ù•™É½´•… ‘•Ù¥”¸ð½Àøð½Í•Ñ¥½¸ù€ì(€€€ô•±Í”¥˜€¡½É…¹¥Í•È€˜˜€…•Ù•¹Ñ½µÁ±•Ñ”€˜˜•Ù•¹Ñ…åÌ ¤¹Í½µ”¡•Ù•¹Ñ…å½µÁ±•Ñ”¤¤ì(€€€€€½¹ÍÐ¹•áÐ€ô•Ù•¹Ñ…åÌ ¤¹™¥¹¡‘…äôø…•Ù•¹Ñ…å½µÁ±•Ñ”¡‘…ä¤¤ì(€€€€€•Ù•¹Ñ½¹ÑÉ½°€ô€ñÍ•Ñ¥½¸±…ÍÌô‰™¥¹¥Í¡½¹ÑÉ½°‘…å½µÁ±•Ñ•½¹ÑÉ½°ˆøñ Ìù½µÁ±•Ñ•‘…åÌ…¸‰”…Ý…É‘•ƒŠPÙ•¹ÐI•µ…¥¹Ì=Á•¸ð½ ÌøñÀù½µÁ±•Ñ”Ñ¡”É•µ…¥¹¥¹œ‘…åÌ‰•™½É”±½Í¥¹œÑ¡”ÑÉ¥À¸ð½Àøñ‰ÕÑÑ½¸±…ÍÌô‰™¥¹¥Í¡Ù•¹Ñ	Ñ¸ˆ¥ô‰½Á•¹9•áÑ…å	Ñ¸ˆ‘…Ñ„µ¹•áÑ‘…äôˆ‘í¹•áÑôˆù=A8d€‘í¹•áÑôð½‰ÕÑÑ½¸øð½Í•Ñ¥½¸ù€ì(€€€ô•±Í”¥˜€¡½É…¹¥Í•È€˜˜€…•Ù•¹Ñ½µÁ±•Ñ”¤ì(€€€€€•Ù•¹Ñ½¹ÑÉ½°€ô€ñÍ•Ñ¥½¸±…ÍÌô‰™¥¹¥Í¡½¹ÑÉ½°•Ù•¹Ñ%¹AÉ½É•ÍÌˆøñ ÌùÙ•¹Ð%¸AÉ½É•ÍÌð½ ÌøñÀù½µÁ±•Ñ”Ñ¡”É•µ…¥¹¥¹œÍ½É¥¹œ‰•™½É”±½Í¥¹œÑ¡”•Ù•¹Ð¸AÉ¥é•Ì™½È„½µÁ±•Ñ•‘…ä…¸ÍÑ¥±°‰”…Ý…É‘•…‰½Ù”¸ð½Àøð½Í•Ñ¥½¸ù€ì(€€€ô•±Í”¥˜€¡½É…¹¥Í•È¤ì(€€€€€•Ù•¹Ñ½¹ÑÉ½°€ô€ñÍ•Ñ¥½¸±…ÍÌô‰™¥¹¥Í¡½¹ÑÉ½°ˆøñ Ìù¥¹¥Í Ñ¡”Ù•¹Ðð½ ÌøñÀùI•Ù¥•ÜÑ¡”É•ÍÕ±ÑÌ°É•½ÉÑ¡”ÁÉ¥é•Ì°Ñ¡•¸½¹™¥É´Ñ¡”É•ÍÕ±ÑÌ…¹±½Í”Ñ¡”•Ù•¹Ð¸ð½Àøñ‰ÕÑÑ½¸±…ÍÌô‰™¥¹¥Í¡Ù•¹Ñ	Ñ¸ˆ¥ô‰™¥¹¥Í¡Ù•¹Ñ	Ñ¸ˆù=9%I4IMU1QL€™…µÀì1=MY9Pð½‰ÕÑÑ½¸øð½Í•Ñ¥½¸ù€ì(€€€ô(€€€½¹ÍÐÁ…ÍÑÙ•¹Ñ9½Ñ¥”€ôÍÑ½É”¹•Ù•¹Ð¹Á…ÍÑÙ•¹ÑI•…‘=¹±ä(€€€€€€ü€œñ‘¥Ø±…ÍÌô‰±½Õ‘9½Ñ”ˆøñˆùA…ÍÐÙ•¹ÐI•ÍÕ±ÑÌð½ˆøñÍÁ…¸ùQ¡¥Ì¥Ì„‘¥Í½¹¹•Ñ•Í…Ù•½Áä¸%ÑÌ½±Á±…å•È©½¥¸½‘”É•µ…¥¹Ì¥¹…Ñ¥Ù”¸ð½ÍÁ…¸øð½‘¥Øøœ(€€€€€€è€ˆˆì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€‘íÁ…ÍÑÙ•¹Ñ9½Ñ¥•ôñ‘¥Ø±…ÍÌô‰±•…‘•É!•…ˆøñ‘¥Øøñ ÈùI•ÍÕ±ÑÌMÕµµ…Éäð½ ÈøñÀø‘í•ÍŒ¡ÍÑ½É”¹•Ù•¹Ð¹¹…µ”¥ôƒ
Ü€‘íÍÑ½É”¹•Ù•¹Ð¹Á…ÍÑÙ•¹ÑI•…‘=¹±ä€ü€‰É•Ñ…¥¹•™¥¹…°É•ÍÕ±ÑÌˆ€è€‰Ý¥¹¹•ÉÌ…¹ÁÉ¥é”¥Ù¥¹œ‰ôð½Àøð½‘¥Øø‘íÍÑ½É”¹•Ù•¹Ð¹Á…ÍÑÙ•¹ÑI•…‘=¹±ä€ü€ˆˆ€è€œñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ð±•…‘•ÉI•™É•Í ˆ¥ô‰±•…‘•ÉI•™É•Í ˆùI•™É•Í ð½‰ÕÑÑ½¸øôð½‘¥Øø‘íÙ¥•ÝQ…‰Íôñ‘¥Ø±…ÍÌô‰ÍÕµµ…ÉåÉ½ÕÁÌˆø‘íÉ½ÕÁÌ(€€€€€€¹µ…À (€€€€€€€€¡œ¤€ôø(€€€€€€€€€€ñÍ•Ñ¥½¸±…ÍÌô‰ÍÕµµ…Éå…Éˆøñ Ìø‘íœ¹Ñ¥Ñ±•ôð½ Ìø‘íœ¹‘•™Ì(€€€€€€€€€€€€¹µ…À ¡¤€ôøì(€€€€€€€€€€€€€½¹ÍÐÈ€ôÍÕµµ…Éå½µÁ•Ñ¥Ñ¥½¹I•ÍÕ±Ð¡¤°(€€€€€€€€€€€€€€€À€ôÍÕµµ…ÉåAÉ¥é••Ñ…¥±Ì¡¤°(€€€€€€€€€€€€€€€…Ý…É‘…‰±”€ôÈ¹…Ý…É‘…‰±”€„ôô™…±Í”ì(€€€€€€€€€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰ÍÕµµ…ÉåI•ÍÕ±Ð€‘í…Ý…É‘…‰±”€˜˜À¹…Ý…É‘•€ü€‰…Ý…É‘•ˆ€è€ˆ‰ôˆ‘…Ñ„µÍÕµµ…Éå½Á•¸ôˆ‘í¹¥‘ôˆÉ½±”ô‰‰ÕÑÑ½¸ˆÑ…‰¥¹‘•àôˆÀˆøñÍÁ…¸±…ÍÌô‰ÍÕµµ…ÉåÙ•¹Ðˆøñˆø‘í•ÍŒ¡¹±…‰•°¥ôð½ˆøñÍµ…±°ø‘í•ÍŒ¡È¹ÍÑ…ÑÕÌñð€¡È¹½µÁ±•Ñ”€ü€‰½µÁ±•Ñ•ˆ€è€‰%¸AÉ½É•ÍÌˆ¤¥ôð½Íµ…±°øð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰ÍÕµµ…Éå=ÕÑ½µ”ˆøñÍÑÉ½¹œø‘íl‰ÍÉ…Ñ ˆ°€‰ÍÉ…Ñ¡…É•…Ñ”‰t¹¥¹±Õ‘•Ì¡¹ÑåÁ”¤€ü•ÍŒ¡È¹Ñ•áÐ¤¹É•Á±…” ¿Š"H üõq¤½œ°€œñÍÁ…¸±…ÍÌô‰ÍÉ…Ñ¡5¥¹ÕÌˆûŠ"Hð½ÍÁ…¸øœ¤€è•ÍŒ¡È¹Ñ•áÐ¥ôð½ÍÑÉ½¹œø‘í…Ý…É‘…‰±”€ü€ñÍµ…±°±…ÍÌô‰ÍÕµµ…ÉåAÉ¥é”€‘íÀ¹½¹™¥ÕÉ•€ü€ˆˆ€è€‰¹½ÑM•Ð‰ôˆùAÉ¥é”è€‘í•ÍŒ¡À¹Ñ•áÐ¥ôð½Íµ…±°ù€€è€ˆ‰ôð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰ÍÕµµ…ÉåÑ¥½¹Ìˆø‘í…Ý…É‘…‰±”€˜˜À¹…Ý…É‘•€ü€ñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥é•Ý…É‘•ˆ‘…Ñ„µÁÉ¥é•…Ý…Éôˆ‘í¹¥‘ôˆ‘…Ñ„µ…Ý…É‘•ôˆÄˆûŠrLÝ…É‘•ð½‰ÕÑÑ½¸ù€€è½É…¹¥Í•È€˜˜…Ý…É‘…‰±”€˜˜È¹½µÁ±•Ñ”€˜˜À¹½¹™¥ÕÉ•€ü€ñ‰ÕÑÑ½¸±…ÍÌô‰ÁÉ¥é•Ý…Éˆ‘…Ñ„µÁÉ¥é•…Ý…Éôˆ‘í¹¥‘ôˆûŠrLÝ…ÉAÉ¥é”ð½‰ÕÑÑ½¸ù€€è€ˆ‰ôñ•´ûŠèð½•´øð½ÍÁ…¸øð½‘¥Øù€ì(€€€€€€€€€€€ô¤(€€€€€€€€€€€€¹©½¥¸ ˆˆ¥ôð½Í•Ñ¥½¸ù€°(€€€€€€¤(€€€€€€¹©½¥¸ ˆˆ¥ôð½‘¥Øø‘í•Ù•¹Ñ½¹ÑÉ½±ôñÀ±…ÍÌô‰±•…‘•É9½Ñ”ˆùQ…À„É•ÍÕ±ÐÑ¼½Á•¸¥ÑÌ™Õ±°ÍÑ…¹‘¥¹Ì¸Ý…É‘•ÁÉ¥é•ÌÉ•µ…¥¸É•½É‘•¡•É”…¹…É”Í¡…É•Ý¥Ñ ½¹¹•Ñ•Á¡½¹•Ì¸ð½Àù€ì(€€€€ ‰m‘…Ñ„µÍÕµµ…Éå½Á•¹tˆ¤¹™½É…  ¡ˆ¤€ôøì(€€€€€½¹ÍÐ½Á•¸€ô€ ¤€ôøì(€€€€€€€½¹ÍÐ€ô‘•™Ì¹™¥¹ ¡à¤€ôøà¹¥€ôôôˆ¹‘…Ñ…Í•Ð¹ÍÕµµ…Éå½Á•¸¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Y¥•Ü€ô(€€€€€€€€€ü¹Í½Á”€ôôô€‰½Ù•É…±°ˆ(€€€€€€€€€€€€ü•Ù•¹Ñ…åÌ ¤¹±•¹Ñ (€€€€€€€€€€€€èü¹Í½Á”ñð€Äì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Q…ˆ€ôˆ¹‘…Ñ…Í•Ð¹ÍÕµµ…Éå½Á•¸ì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€ôì(€€€€€ˆ¹½¹±¥¬€ô€¡”¤€ôøì(€€€€€€€¥˜€ …”¹Ñ…É•Ð¹±½Í•ÍÐ ‰m‘…Ñ„µÁÉ¥é•…Ý…É‘tˆ¤¤½Á•¸ ¤ì(€€€€€ôì(€€€€€ˆ¹½¹­•å‘½Ý¸€ô€¡”¤€ôøì(€€€€€€€¥˜€ (€€€€€€€€€€¡”¹­•ä€ôôô€‰¹Ñ•Èˆñð”¹­•ä€ôôô€ˆ€ˆ¤€˜˜(€€€€€€€€€€…”¹Ñ…É•Ð¹±½Í•ÍÐ ‰m‘…Ñ„µÁÉ¥é•…Ý…É‘tˆ¤(€€€€€€€€¤ì(€€€€€€€€€”¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì(€€€€€€€€€½Á•¸ ¤ì(€€€€€€€ô(€€€€€ôì(€€€ô¤ì(€€€€ ‰m‘…Ñ„µÁÉ¥é•…Ý…É‘tˆ¤¹™½É…  (€€€€€€¡ˆ¤€ôø(€€€€€€€€¡ˆ¹½¹±¥¬€ô…Íå¹Œ€¡”¤€ôøì(€€€€€€€€€”¹ÍÑ½ÁAÉ½Á……Ñ¥½¸ ¤ì(€€€€€€€€€½¹ÍÐÝ…ÍÝ…É‘•€ôˆ¹‘…Ñ…Í•Ð¹…Ý…É‘•€ôôô€ˆÄˆì(€€€€€€€€€¥˜€ (€€€€€€€€€€€Ý…ÍÝ…É‘•€˜˜(€€€€€€€€€€€€…½¹™¥É´ ‰¡…¹”Ñ¡¥ÌÁÉ¥é”‰…¬Ñ¼¹½Ðå•Ð…Ý…É‘•üˆ¤(€€€€€€€€€€¤(€€€€€€€€€€€É•ÑÕÉ¸ì(€€€€€€€€€…Ý…¥ÐÍ•ÑAÉ¥é•Ý…É‘•¡ˆ¹‘…Ñ…Í•Ð¹ÁÉ¥é•…Ý…É°€…Ý…ÍÝ…É‘•¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€¥˜€  ˆ±•…‘•ÉI•™É•Í ˆ¤¤(€€€€€€ ˆ±•…‘•ÉI•™É•Í ˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€€€…Ý…¥ÐÍå¹±½Õ‘9½Ü ¤ì(€€€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€ôì(€€€¥˜€  ˆ™¥¹¥Í¡Ù•¹Ñ	Ñ¸ˆ¤¤(€€€€€€ ˆ™¥¹¥Í¡Ù•¹Ñ	Ñ¸ˆ¤¹½¹±¥¬€ô½¹™¥ÉµI•ÍÕ±ÑÍ¹‘±½Í•Ù•¹Ðì(€€€¥˜€  ˆ…É¡¥Ù•½µÁ±•Ñ•‘Ù•¹Ðˆ¤¤(€€€€€€ ˆ…É¡¥Ù•½µÁ±•Ñ•‘Ù•¹Ðˆ¤¹½¹±¥¬€ô…É¡¥Ù•½µÁ±•Ñ•‘Ù•¹Ðì(€€€¥˜€  ˆ½Á•¹9•áÑ…å	Ñ¸ˆ¤¤(€€€€€€ ˆ½Á•¹9•áÑ…å	Ñ¸ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Y¥•Ü€ô€¬ ˆ½Á•¹9•áÑ…å	Ñ¸ˆ¤¹‘…Ñ…Í•Ð¹¹•áÑ‘…äì(€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€ôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É1•…‘•É‰½…É ¤ì(€€€½¹ÍÐ¡½ÍÐ€ô€ ˆ±•…‘•É‰½…É‘áÁ•É¥•¹”ˆ¤ì(€€€½¹ÍÐÁÉ•Ù¥½ÕÍQ…‰MÉ½±°€ô¡½ÍÐü¹ÅÕ•ÉåM•±•Ñ½È ˆ¹±•…‘•ÉQ…‰Ìˆ¤ü¹ÍÉ½±±1•™Ð€üü€¬¡ÍÑ½É”¹•Ù•¹Ðü¹±•…‘•É‰½…É‘MÉ½±±1•™Ðñð€À¤ì(€€€¥˜€ …¡½ÍÐ¤É•ÑÕÉ¸ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ð¤ì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô(€€€€€€€€œñ‘¥Ø±…ÍÌô‰…Éˆøñ Èù1•…‘•É‰½…Éð½ ÈøñÀùÉ•…Ñ”…¸•Ù•¹Ð™¥ÉÍÐ¸ð½Àøð½‘¥Øøœì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€½¹ÍÐ‘•™Ì€ô±•…‘•É‰½…É‘•™¥¹¥Ñ¥½¹Ì ¤ì(€€€¥˜€ …‘•™Ì¹±•¹Ñ ¤ì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô(€€€€€€€€œñ‘¥Ø±…ÍÌô‰…Éˆøñ Èù1•…‘•É‰½…Éð½ ÈøñÀù9¼Í½É•½µÁ•Ñ¥Ñ¥½¹ÌÝ•É”Í•±•Ñ•™½ÈÑ¡¥Ì•Ù•¹Ð¸ð½Àøð½‘¥Øøœì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€½¹ÍÐ‘…åÌ€ôÍÑ½É”¹•Ù•¹Ð¹‘…åÌñð€Äì(€€€±•ÐÙ¥•Ü€ô(€€€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Y¥•Üñð(€€€€€5…Ñ ¹µ¥¸ (€€€€€€€‘…åÌ°(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý…äñðÍÑ½É”¹•Ù•¹Ð¹…Ñ¥Ù•É½ÕÁ…äñð€Ä°(€€€€€€¤ì(€€€¥˜€¡‘…åÌ€ôôô€Ä€˜˜Ù¥•Ü€„ôô€‰ÍÕµµ…Éäˆ¤Ù¥•Ü€ô€Äì(€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Y¥•Ü€ôÙ¥•Üì(€€€½¹ÍÐÙ¥•ÝQ…‰Ì€ô€ñ‘¥Ø±…ÍÌô‰±•…‘•ÉY¥•ÝQ…‰ÌµÕ±Ñ¥…åQ…‰Ìˆø‘í•Ù•¹Ñ…åÌ ¤¹µ…À¡‘…äôù€ñ‰ÕÑÑ½¸‘…Ñ„µ±•…‘•ÉÙ¥•Üôˆ‘í‘…åôˆ±…ÍÌôˆ‘ì­Ù¥•Üôôõ‘…äü‰…Ñ¥Ù”ˆèˆ‰ôˆø‘í‘…åÌôôôÄü‰Q½‘…äˆé…ä€‘í‘…åõôð½‰ÕÑÑ½¸ù€¤¹©½¥¸ ˆˆ¥ôñ‰ÕÑÑ½¸‘…Ñ„µ±•…‘•ÉÙ¥•Üô‰ÍÕµµ…Éäˆ±…ÍÌôˆ‘íÙ¥•Üôôô‰ÍÕµµ…Éäˆü‰…Ñ¥Ù”ˆèˆ‰ôˆùMÕµµ…Éäð½‰ÕÑÑ½¸øð½‘¥Øù€ì(€€€¥˜€¡Ù¥•Ü€ôôô€‰ÍÕµµ…Éäˆ¤ì(€€€€€É•¹‘•É1•…‘•É‰½…É‘MÕµµ…Éä¡¡½ÍÐ°‘•™Ì°Ù¥•ÝQ…‰Ì¤ì(€€€€€€ ‰m‘…Ñ„µ±•…‘•ÉÙ¥•Ýtˆ¤¹™½É…  (€€€€€€€€¡ˆ¤€ôø(€€€€€€€€€€¡ˆ¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Y¥•Ü€ô(€€€€€€€€€€€€€ˆ¹‘…Ñ…Í•Ð¹±•…‘•ÉÙ¥•Ü€ôôô€‰ÍÕµµ…Éäˆ(€€€€€€€€€€€€€€€€ü€‰ÍÕµµ…Éäˆ(€€€€€€€€€€€€€€€€è€­ˆ¹‘…Ñ…Í•Ð¹±•…‘•ÉÙ¥•Üì(€€€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€€€€€ô¤°(€€€€€€¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€½¹ÍÐÙ¥Í¥‰±”€ô‘•™Ì¹™¥±Ñ•È (€€€€€€¡¤€ôø(€€€€€€€¹Í½Á”€ôôô€­Ù¥•Üñð(€€€€€€€€¡¹Í½Á”€ôôô€‰½Ù•É…±°ˆ¤°(€€€€¤ì(€€€±•Ð…Ñ¥Ù”€ôÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Q…ˆñðÙ¥Í¥‰±•lÁtü¹¥ì(€€€¥˜€ …Ù¥Í¥‰±”¹Í½µ” ¡¤€ôø¹¥€ôôô…Ñ¥Ù”¤¤…Ñ¥Ù”€ôÙ¥Í¥‰±•lÁtü¹¥ì(€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Q…ˆ€ô…Ñ¥Ù”ì(€€€½¹ÍÐ‘•˜€ôÙ¥Í¥‰±”¹™¥¹ ¡¤€ôø¹¥€ôôô…Ñ¥Ù”¤ì(€€€½¹ÍÐÑ…‰Ì€ô€ñ‘¥Ø±…ÍÌô‰±•…‘•ÉQ…‰Ìˆø‘íÙ¥Í¥‰±”¹µ…À ¡¤€ôø€ñ‰ÕÑÑ½¸‘…Ñ„µ±•…‘•ÉÑ…ˆôˆ‘í¹¥‘ôˆ±…ÍÌôˆ‘í¹¥€ôôô…Ñ¥Ù”€ü€‰…Ñ¥Ù”ˆ€è€ˆ‰ôˆø‘í•ÍŒ¡¹±…‰•°¥ôð½‰ÕÑÑ½¸ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øù€ì(€€€±•Ð‰½‘ä€ô€ˆˆì(€€€¥˜€¡‘•˜¹ÑåÁ”€ôôô€‰¹ÑÀˆ¤ì(€€€€€½¹ÍÐ¹ÑÁ½µÁ±•Ñ”€ô±•…‘•É‰½…É‘½µÁ±•Ñ”¡‘•˜°mt¤ì(€€€€€‰½‘ä€ô(€€€€€€€¹ÑÁ!½±•Í%¹A±…å¥¹=É‘•È¡‘•˜¹‘…ä¤(€€€€€€€€€€¹µ…À ¡ ¤€ôøì(€€€€€€€€€€€½¹ÍÐ¡¥ÍÑ½Éä€ô¹ÑÁ!¥ÍÑ½Éä¡‘•˜¹‘…ä° ¤ì(€€€€€€€€€€€É•ÑÕÉ¸€ñÍ•Ñ¥½¸±…ÍÌô‰¹ÑÁ!¥ÍÑ½Éå	±½¬ˆøñ Ðù!½±”€‘í¡ôð½ Ðø‘ì(€€€€€€€€€€€€€¡¥ÍÑ½Éä¹±•¹Ñ (€€€€€€€€€€€€€€€€ü¡¥ÍÑ½Éä(€€€€€€€€€€€€€€€€€€€€¹µ…À ¡•¹ÑÉä°¤¤€ôøì(€€€€€€€€€€€€€€€€€€€€€½¹ÍÐÝ¥¹¹•È€ô¤€ôôô¡¥ÍÑ½Éä¹±•¹Ñ €´€Ä°(€€€€€€€€€€€€€€€€€€€€€€€Ñ¥µ”€ô¹•Ü…Ñ”¡•¹ÑÉä¹…Ð¤¹Ñ½1½…±•Q¥µ•MÑÉ¥¹œ ‰•¸µTˆ°ì(€€€€€€€€€€€€€€€€€€€€€€€€€¡½ÕÈè€‰¹Õµ•É¥Œˆ°(€€€€€€€€€€€€€€€€€€€€€€€€€µ¥¹ÕÑ”è€ˆÈµ‘¥¥Ðˆ°(€€€€€€€€€€€€€€€€€€€€€€€ô¤ì(€€€€€€€€€€€€€€€€€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰¹ÑÁ!¥ÍÑ½Éå¹ÑÉä€‘íÝ¥¹¹•È€ü€‰Ý¥¹¹•Èˆ€è€ˆ‰ôˆøñÍÁ…¸ø‘íÝ¥¹¹•È€ü€ˆñˆù]¥¹¹•Èèð½ˆø€ˆ€è€ˆ‰ô‘í•ÍŒ¡•Ù•¹ÑA±…å•É9…µ”¡•¹ÑÉä¹¥±‘•˜¹‘…ä¤¥ôð½ÍÁ…¸øñÑ¥µ”ø‘í•ÍŒ¡Ñ¥µ”¥ôð½Ñ¥µ”øð½‘¥Øù€ì(€€€€€€€€€€€€€€€€€€€ô¤(€€€€€€€€€€€€€€€€€€€€¹©½¥¸ ˆˆ¤(€€€€€€€€€€€€€€€€èµ…¹Õ…±…åMÑ½É”¡‘•˜¹‘…ä°™…±Í”¤ü¹¹ÑÀü¹mMÑÉ¥¹œ¡ ¥t(€€€€€€€€€€€€€€€€€€ü€ˆñÀù]¥¹¹•È¥¹ÁÕÐµ…¹Õ…±±äð½Àøˆ(€€€€€€€€€€€€€€€€€€è€ˆñÀù9¼½¹™¥Éµ•¡½±‘•Èå•Ðð½Àøˆ(€€€€€€€€€€€ôñÀ±…ÍÌô‰¹ÑÁAÉ¥é•I•ÍÕ±Ðˆø‘í•ÍŒ¡¹ÑÁMÕµµ…Éå1¥¹”¡‘•˜¹‘…ä° °¹ÑÁ½µÁ±•Ñ”¤¥ôð½Àøð½Í•Ñ¥½¸ù€ì(€€€€€€€€€ô¤(€€€€€€€€€€¹©½¥¸ ˆˆ¤ñð€œñ‘¥Ø±…ÍÌô‰±•…‘•ÉµÁÑäˆù9¼9Q@¡½±•ÌÍ•±•Ñ•¸ð½‘¥Øøœì(€€€ô•±Í”ì(€€€€€½¹ÍÐÉ½ÝÌ€ô…±Õ±…Ñ•1•…‘•É‰½…É¡‘•˜¤°(€€€€€€€½µÁ•Ñ¥Ñ¥½¹½µÁ±•Ñ”€ô±•…‘•É‰½…É‘½µÁ±•Ñ”¡‘•˜°É½ÝÌ¤°(€€€€€€€Õ¹¥Ð€ô‘•˜¹ÑåÁ”€ôôô€‰ÁÕÑÑÌˆ€ü€‰ÁÕÑÑÌˆ€èl‰ÍÑÉ½­•É½ÍÌˆ°‰ÍÑÉ½­•9•Ð‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤€ü€‰ÍÑÉ½­•Ìˆ€è‘•˜¹ÑåÁ”€ôôô€‰…µ‰É½Í”ˆ€ü€‰¹•Ðˆ€è€‰ÁÑÌˆ°(€€€€€€€Ñ½A…È€ô€¡¸¤€ôø€¡¸€ôôô€À€ü€‰ˆ€è¸€ø€À€ü€¬‘í¹õ€€è€ñÍÁ…¸±…ÍÌô‰ÍÉ…Ñ¡5¥¹ÕÌˆûŠ"Hð½ÍÁ…¸ø‘í5…Ñ ¹…‰Ì¡¸¥õ€¤ì(€€€€€‰½‘ä€ô(€€€€€€€‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆ€˜˜€…½µÁ•Ñ¥Ñ¥½¹½µÁ±•Ñ”(€€€€€€€€€€ü€œñ‘¥Ø±…ÍÌô‰±•…‘•ÉµÁÑäå•±±½Ý	…±±!¥‘‘•¸ˆøñˆùI•ÍÕ±Ð…¹¹½Õ¹•…ÐÑ¡”•¹½˜Á±…äð½ˆøñÍÁ…¸ùe•±±½Ü	…±°ÍÑ…¹‘¥¹ÌÉ•µ…¥¸¡¥‘‘•¸Õ¹Ñ¥°•Ù•ÉäÍ½É•…É™½ÈÑ¡”‘…ä¥Ì½µÁ±•Ñ”…¹…É••¸ð½ÍÁ…¸øð½‘¥Øøœ(€€€€€€€€€€èÉ½ÝÌ(€€€€€€€€€€¹µ…À ¡È°¤¤€ôøì(€€€€€€€€€€€½¹ÍÐÝ…¥Ñ¥¹œ€ô(€€€€€€€€€€€€€€€€¡‘•˜¹ÑåÁ”€ôôô€‰ÁÕÑÑÌˆñð‘•˜¹ÑåÁ”€ôôô€‰‰•ÍÐÌˆ¤€˜˜€…È¹Ñ¡ÉÔ°(€€€€€€€€€€€€€É½Ý½µÁ±•Ñ”€ôÈ¹Ñ¡ÉÔ€ôôôÈ¹Ñ…É•Ð°(€€€€€€€€€€€€€¥Í¥¹…°€ô(€€€€€€€€€€€€€€€½µÁ•Ñ¥Ñ¥½¹½µÁ±•Ñ”€˜˜(€€€€€€€€€€€€€€€€¡‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆñðÉ½Ý½µÁ±•Ñ”¤°(€€€€€€€€€€€€€Í½É”€ô(€€€€€€€€€€€€€€€l‰ÍÉ…Ñ ˆ°€‰ÍÉ…Ñ¡…É•…Ñ”‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤(€€€€€€€€€€€€€€€€€€ü¥Í¥¹…°(€€€€€€€€€€€€€€€€€€€€ü€‘íÈ¹É½ÍÍQ½Ñ…±ô€ñÍµ…±°ùÍÑÉ½­•Ì€ ‘íÑ½A…È¡È¹ÍÉ…Ñ¡Q½A…È¥ô¤ð½Íµ…±°ù€(€€€€€€€€€€€€€€€€€€€€èÑ½A…È¡È¹ÍÉ…Ñ¡Q½A…È¤(€€€€€€€€€€€€€€€€€€è‘•˜¹ÑåÁ”€ôôô€‰…µ‰É½Í”ˆ(€€€€€€€€€€€€€€€€€€€€üÉ½Ý½µÁ±•Ñ”€˜˜È¹¡…¹‘¥…À€„ô¹Õ±°(€€€€€€€€€€€€€€€€€€€€€€ü€‘íÈ¹Ñ½Ñ…°¹Ñ½¥á• Ä¥ô€ñÍµ…±°ù¹•Ðð½Íµ…±°ù€(€€€€€€€€€€€€€€€€€€€€€€è€‘íÈ¹É½ÍÍQ½Ñ…±ô€ñÍµ…±°ùÉ½ÍÌð½Íµ…±°ù€(€€€€€€€€€€€€€€€€€€€€è€‘íÈ¹Ñ½Ñ…±ô€ñÍµ…±°ø‘íÕ¹¥Ñôð½Íµ…±°ù€ì(€€€€€€€€€€€¥˜€¡È¹‘¥ÍÅÕ…±¥™¥•¤(€€€€€€€€€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰±•…‘•ÉI½ÜÍÉ…Ñ¡¥ÍÅÕ…±¥™¥•ˆøñÍÁ…¸±…ÍÌô‰±•…‘•ÉI…¹¬ˆûŠPð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰±•…‘•É9…µ”ˆø‘í•ÍŒ¡È¹¹…µ”¥ôñÍµ…±°ø‘í‘•˜¹ÑåÁ”€ôôô€‰½µ‰¥¹•ˆ€ü€‰9½Ð•±¥¥‰±”™½È½Ù•É…±°ÁÉ¥é”ˆ€è‘•˜¹ÑåÁ”€ôôô€‰…µ‰É½Í”ˆ€ü€‰I•ÅÕ¥É•É¥Ù•Ì9½ÐI•½É‘•ˆ€è€‰]¥Ñ¡‘É…Ý¸™É½´Ñ¡¥Ì½µÁ•Ñ¥Ñ¥½¸‰ôð½Íµ…±°øð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰±•…‘•ÉM½É”ˆûŠPð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰±•…‘•ÉQ¡ÉÔˆø‘íl‰…µ‰É½Í”ˆ°‰½µ‰¥¹•ˆ°‰ÍÉ…Ñ¡…É•…Ñ”‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤€ü•ÍŒ¡È¹‘¥ÍÅÕ…±¥™¥…Ñ¥½¹I•…Í½¸ñð€‰I•ÅÕ¥É•µ•¹ÑÌ¹½ÐÍ…Ñ¥Í™¥•ˆ¤€èA¥¬µÕÀ½¸!½±”€‘íÈ¹Á¥­ÕÁ!½±•õôð½ÍÁ…¸øð½‘¥Øù€ì(€€€€€€€€€€€½¹ÍÐÁÉ½É•ÍÌ€ô(€€€€€€€€€€€€€‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆ(€€€€€€€€€€€€€€€€üÈ¹±½ÍÌ(€€€€€€€€€€€€€€€€€€ü	…±°±½ÍÐƒ
Ü!½±”€‘íÈ¹±½ÍÌ¹¡½±•ôƒ
Ü€‘íÈ¹ÍÕÉÙ¥Ù•‘ôÍÕÉÙ¥Ù•‘€(€€€€€€€€€€€€€€€€€€è¥Í¥¹…°(€€€€€€€€€€€€€€€€€€€€ü€‰¥¹…°ƒ
Ü	…±°½µÁ±•Ñ•€Äà¡½±•Ìˆ(€€€€€€€€€€€€€€€€€€€€è	…±°…±¥Ù”ƒ
ÜQ¡ÉÔ€‘íÈ¹Ñ¡ÉÕõ€(€€€€€€€€€€€€€€€€è‘•˜¹ÑåÁ”€ôôô€‰…µ‰É½Í”ˆ€˜˜É½Ý½µÁ±•Ñ”€˜˜€…½µÁ•Ñ¥Ñ¥½¹½µÁ±•Ñ”(€€€€€€€€€€€€€€€€€€ü€‘íÈ¹É½ÍÍQ½Ñ…±ôÉ½ÍÌƒ
Ü€‘íÈ¹¡…¹‘¥…À€ôô¹Õ±°€ü€‰¹¼¡…¹‘¥…Àˆ€è€‘íÈ¹¡…¹‘¥…À¹Ñ½¥á• Ä¥ô¡Áôƒ
ÜAÉ½Ù¥Í¥½¹…±€(€€€€€€€€€€€€€€€€è¥Í¥¹…°(€€€€€€€€€€€€€€€€€€ü€‰¥¹…°ˆ(€€€€€€€€€€€€€€€€€€èQ¡ÉÔ€‘íÈ¹Ñ¡ÉÕõ€ì(€€€€€€€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰±•…‘•ÉI½Ü€‘í‘•˜¹ÑåÁ”€ôôô€‰•±•Ñ¥Œˆ€ü€‰•±•Ñ¥…¥¹I½Üˆ€è€ˆ‰ô€‘í¤€ôôô€À€˜˜½µÁ•Ñ¥Ñ¥½¹½µÁ±•Ñ”€˜˜€¡È¹Ñ¡ÉÔñð‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆ¤€ü€‰Ý¥¹¹•Èˆ€è€ˆ‰ô€‘íÝ…¥Ñ¥¹œ€ü€‰Ý…¥Ñ¥¹5…É­•Èˆ€è€ˆ‰ôˆøñÍÁ…¸±…ÍÌô‰±•…‘•ÉI…¹¬ˆø‘íÈ¹Ñ¥•€ü€‰Pˆ€è€ˆ‰ô‘íÈ¹É…¹­ôð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰±•…‘•É9…µ”ˆø‘í•ÍŒ¡È¹¹…µ”¥ô‘í‘•˜¹ÑåÁ”€ôôô€‰•±•Ñ¥Œˆ€ü€ñÍµ…±°øñˆùA½¥¹ÑÌ…¥¹•ð½ˆø€‘íÈ¹Á½¥¹ÑÍ…¥¹•‘ôÁÑÌð½Íµ…±°ù€€èÈ¹‘•Ñ…¥°€ü€ñÍµ…±°ø‘í•ÍŒ¡È¹‘•Ñ…¥°¥ôð½Íµ…±°ù€€è€ˆ‰ôð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰±•…‘•ÉM½É”ˆø‘íÝ…¥Ñ¥¹œ€ü€‹ŠPˆ€è€‘íÍ½É•ô‘íÈ¹ˆ€ü€ˆ€ñÍµ…±°ùð½Íµ…±°øˆ€è€ˆ‰õôð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰±•…‘•ÉQ¡ÉÔˆø‘íÝ…¥Ñ¥¹œ€ü€‰]…¥Ñ¥¹œ™½È5…É­•ÈÑ¼M½É”ˆ€èÁÉ½É•ÍÍôð½ÍÁ…¸øð½‘¥Øù€ì(€€€€€€€€€ô¤(€€€€€€€€€€¹©½¥¸ ˆˆ¤ñð(€€€€€€€€œñ‘¥Ø±…ÍÌô‰±•…‘•ÉµÁÑäˆù9¼•±¥¥‰±”MÉ…Ñ Á±…å•ÉÌ…É”…Ù…¥±…‰±”¸ð½‘¥Øøœì(€€€ô(€€€½¹ÍÐÁ…ÈÍ…ä€ô5…Ñ ¹µ¥¸¡•Ù•¹Ñ…åÌ ¤¹±•¹Ñ °5…Ñ ¹µ…à Ä°€­Ù¥•Üñð€Ä¤¤°(€€€€€Á…ÈÍY•ÉÍ¥½¸€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡Á…ÈÍ…ä¤°(€€€€€Á…ÈÍ½Õ¹Ð€ô€¡Á…ÈÍY•ÉÍ¥½¸¹Á…Èñðmt¤¹™¥±Ñ•È ¡Á…È¤€ôø€­Á…È€ôôô€Ì¤¹±•¹Ñ °(€€€€€Á…ÈÍQ½Ñ…°€ôl‰Á…ÈÌˆ°€‰Á…ÈÍÑ•…´ˆ°€‰Á…ÈÍ…É•…Ñ”ˆ°€‰Á…ÈÍ¥¹‘¥Ù¥‘Õ…±…É•…Ñ”‰t¹¥¹±Õ‘•Ì¡‘•˜¹ÑåÁ”¤(€€€€€€€€ü€ñÍÁ…¸±…ÍÌô‰Á…ÈÍQ½Ñ…°ˆùQ½Ñ…°A…È€Ì!½±•Ì€ñˆø‘í‘•˜¹‘…ä€üÁ…ÈÍ½Õ¹Ð€è•Ù•¹Ñ…åÌ ¤¹É•‘Õ” ¡¸±‘…ä¤€ôø¸€¬€¡•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä¤¹Á…Èñðmt¤¹™¥±Ñ•È¡À€ôø€­À€ôôô€Ì¤¹±•¹Ñ °À¥ôð½ˆøð½ÍÁ…¸ù€(€€€€€€€€è€ˆˆì(€€€½¹ÍÐÁ…ÍÑÙ•¹Ñ9½Ñ¥”€ôÍÑ½É”¹•Ù•¹Ð¹Á…ÍÑÙ•¹ÑI•…‘=¹±ä(€€€€€€ü€œñ‘¥Ø±…ÍÌô‰±½Õ‘9½Ñ”ˆøñˆùA…ÍÐÙ•¹ÐI•ÍÕ±ÑÌð½ˆøñÍÁ…¸ùQ¡¥Ì¥Ì„‘¥Í½¹¹•Ñ•Í…Ù•½Áä¸%ÑÌ½±Á±…å•È©½¥¸½‘”É•µ…¥¹Ì¥¹…Ñ¥Ù”¸ð½ÍÁ…¸øð½‘¥Øøœ(€€€€€€è€ˆˆì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€‘íÁ…ÍÑÙ•¹Ñ9½Ñ¥•ôñ‘¥Ø±…ÍÌô‰±•…‘•É!•…ˆøñ‘¥Øøñ Èø‘íÍÑ½É”¹•Ù•¹Ð¹Á…ÍÑÙ•¹ÑI•…‘=¹±ä€ü€‰¥¹…°I•ÍÕ±ÑÌˆ€è€‰1¥Ù”1•…‘•É‰½…É‰ôð½ ÈøñÀø‘í•ÍŒ¡ÍÑ½É”¹•Ù•¹Ð¹¹…µ”¥ô‘íÍÑ½É”¹•Ù•¹Ð¹Á…ÍÑÙ•¹ÑI•…‘=¹±ä€ü€ˆƒ
ÜÉ•Ñ…¥¹••Ù•¹ÐÉ•½Éˆ€è€ˆƒ
Ü½™™¥¥…°µ…É­•ÈÍ½É•ÌÕÁ‘…Ñ”…ÌÑ¡•ä…ÉÉ¥Ù”‰ôð½Àøð½‘¥Øø‘íÍÑ½É”¹•Ù•¹Ð¹Á…ÍÑÙ•¹ÑI•…‘=¹±ä€ü€ˆˆ€è€œñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ð±•…‘•ÉI•™É•Í ˆ¥ô‰±•…‘•ÉI•™É•Í ˆùI•™É•Í ð½‰ÕÑÑ½¸øôð½‘¥Øø‘íÙ¥•ÝQ…‰Íô‘íÑ…‰Íôñ‘¥Ø±…ÍÌô‰±•…‘•É…É€‘í‘•˜¹ÑåÁ”€ôôô€‰å•±±½Ý	…±°ˆ€ü€‰å•±±½Ý	…±±1•…‘•É‰½…Éˆ€è€ˆ‰ôˆøñ‘¥Ø±…ÍÌô‰±•…‘•ÉQ¥Ñ±”ˆøñ‘¥Øøñ Ìø‘í•ÍŒ¡‘•˜¹±…‰•°¥ô‘í‘•˜¹‘…ä€˜˜½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ­‘•˜¹‘…åt¤ü¹¹…µ”€ü€ƒŠP€‘í•ÍŒ¡½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ­‘•˜¹‘…åt¤¹¹…µ”¥õ€€è€ˆ‰ôð½ ÌøñÍÁ…¸ø‘í‘•˜¹½Õ¹Ñ‰…¬€ü€‰ÕÑ½µ…Ñ¥Œ½Õ¹Ñ‰…¬ˆ€è€‰1¥Ù”ÍÑ…¹‘¥¹Ì‰ôð½ÍÁ…¸øð½‘¥Øø‘íÁ…ÈÍQ½Ñ…±ôð½‘¥Øø‘í‰½‘åôð½‘¥ØøñÀ±…ÍÌô‰±•…‘•É9½Ñ”ˆù1¥Ù”Á½Í¥Ñ¥½¹Ì…É”ÁÉ½Ù¥Í¥½¹…°¸€ñˆûŠqQ¡É×Štð½ˆø¥ÌÑ¡”¹Õµ‰•È½˜¡½±•ÌÝ¥Ñ ½™™¥¥…°µ…É­•ÈÍ½É•Ì°É•…É‘±•ÍÌ½˜Ñ¡”ÍÑ…ÉÑ¥¹œ¡½±”¸A•¹‘¥¹œ¡½±•Ì…É”¹•Ù•È½Õ¹Ñ•…Ìé•É¼¸MÉ…Ñ ¥ÌÍ¡½Ý¸……¥¹ÍÐÁ…È‘ÕÉ¥¹œÁ±…ä…¹…ÌÉ½ÍÌÍÑÉ½­•ÌÝ¡•¸™¥¹…°¸¥¹…±¥Í…Ñ¥½¸…±Í¼É•ÅÕ¥É•ÌÑ¡”Á±…å•ËŠeÌ¡•­¥¹œÍ½É•ÌÑ¼…É•”¸µ•…¹Ì½Õ¹Ñ‰…¬¸ð½Àù€ì(€€€½¹ÍÐÑ…‰MÑÉ¥À€ô¡½ÍÐ¹ÅÕ•ÉåM•±•Ñ½È ˆ¹±•…‘•ÉQ…‰Ìˆ¤ì(€€€¥˜€¡Ñ…‰MÑÉ¥À¤Ñ…‰MÑÉ¥À¹ÍÉ½±±1•™Ð€ôÁÉ•Ù¥½ÕÍQ…‰MÉ½±°ì(€€€€ ‰m‘…Ñ„µ±•…‘•ÉÙ¥•Ýtˆ¤¹™½É…  (€€€€€€¡ˆ¤€ôø(€€€€€€€€¡ˆ¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Y¥•Ü€ô(€€€€€€€€€€€ˆ¹‘…Ñ…Í•Ð¹±•…‘•ÉÙ¥•Ü€ôôô€‰ÍÕµµ…Éäˆ(€€€€€€€€€€€€€€ü€‰ÍÕµµ…Éäˆ(€€€€€€€€€€€€€€è€­ˆ¹‘…Ñ…Í•Ð¹±•…‘•ÉÙ¥•Üì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Q…ˆ€ô€ˆˆì(€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ‰m‘…Ñ„µ±•…‘•ÉÑ…‰tˆ¤¹™½É…  (€€€€€€¡ˆ¤€ôø(€€€€€€€€¡ˆ¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘MÉ½±±1•™Ð€ôˆ¹Á…É•¹Ñ±•µ•¹Ðü¹ÍÉ½±±1•™Ðñð€Àì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±•…‘•É‰½…É‘Q…ˆ€ôˆ¹‘…Ñ…Í•Ð¹±•…‘•ÉÑ…ˆì(€€€€€€€€€ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€¥˜€  ˆ±•…‘•ÉI•™É•Í ˆ¤¤(€€€€€€ ˆ±•…‘•ÉI•™É•Í ˆ¤¹½¹±¥¬€ô…Íå¹Œ€ ¤€ôøì(€€€€€€€…Ý…¥ÐÍå¹±½Õ‘9½Ü ¤ì(€€€€€€€É•¹‘•É1•…‘•É‰½…É ¤ì(€€€€€ôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉÕ±±…É‘A±…å•É¹ÑÉä¡Í•±•Ñ•°‘…ä¤ì(€€€½¹ÍÐ¡½ÍÐ€ô€ ˆÁ±…å•ÉáÁ•É¥•¹”ˆ¤°(€€€€€Á•ÉÍ½¸€ô•Ù•¹ÑA±…å•È¡Í•±•Ñ•°‘…ä¤°(€€€€€Œ€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤°(€€€€€…É€ô•Ù•¹Ñ½ÕÉÍ•M½É•…É¡‘…ä°ÍÑ½É”¹•Ù•¹Ð°Í•±•Ñ•¤°(€€€€€ÁÕÑÑÍI•ÅÕ¥É•€ô½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ°‘…ä¤°(€€€€€‘…å-•ä€ô€‰‘…äˆ€¬‘…ä°(€€€€€Á±…å•É-•ä€ôMÑÉ¥¹œ¡Í•±•Ñ•¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹™Õ±±…É‘É…™ÑÌ€ôÍÑ½É”¹•Ù•¹Ð¹™Õ±±…É‘É…™ÑÌñðíôì(€€€ÍÑ½É”¹•Ù•¹Ð¹™Õ±±…É‘É…™ÑÍm‘…å-•åt€ô(€€€€€ÍÑ½É”¹•Ù•¹Ð¹™Õ±±…É‘É…™ÑÍm‘…å-•åtñðíôì(€€€½¹ÍÐ‘É…™Ð€ô€¡ÍÑ½É”¹•Ù•¹Ð¹™Õ±±…É‘É…™ÑÍm‘…å-•åumÁ±…å•É-•åt€ô(€€€€€ÍÑ½É”¹•Ù•¹Ð¹™Õ±±…É‘É…™ÑÍm‘…å-•åumÁ±…å•É-•åtñðì¡½±•Ìèíôô¤ì(€€€½¹ÍÐÉ½ÝÌ€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôøì(€€€€€½¹ÍÐ¡½±”€ô¥¹‘•à€¬€Ä°(€€€€€€€Í…Ù•€ô‘É…™Ð¹¡½±•Ím¡½±•tñðíôì(€€€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰™Õ±±…É‘¹ÑÉåI½Üˆøñˆø‘í¡½±•ôð½ˆøñÍÁ…¸ø‘í•ÍŒ¡…É¹Á…Èü¹m¥¹‘•átñð€‹ŠPˆ¥ôð½ÍÁ…¸øñÍÁ…¸ø‘í•ÍŒ¡…É¹¥¹‘•àü¹m¥¹‘•átñð€‹ŠPˆ¥ôð½ÍÁ…¸øñ¥¹ÁÕÐ‘…Ñ„µ™Õ±±É½ÍÌôˆ‘í¡½±•ôˆ¥¹ÁÕÑµ½‘”ô‰Ñ•áÐˆµ…á±•¹Ñ ôˆÈˆÙ…±Õ”ôˆ‘í•ÍŒ¡Í…Ù•¹É½ÍÌ€üü€ˆˆ¥ôˆÁ±…•¡½±‘•Èô‹ŠLˆ…É¥„µ±…‰•°ô‰!½±”€‘í¡½±•ôÉ½ÍÌÍÑÉ½­•Ìˆø‘íÁÕÑÑÍI•ÅÕ¥É•€ü€ñ¥¹ÁÕÐ‘…Ñ„µ™Õ±±ÁÕÑÑÌôˆ‘í¡½±•ôˆ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥Œˆµ…á±•¹Ñ ôˆÄˆÙ…±Õ”ôˆ‘í•ÍŒ¡Í…Ù•¹ÁÕÑÑÌ€üü€ˆˆ¥ôˆÁ±…•¡½±‘•Èô‹ŠLˆ…É¥„µ±…‰•°ô‰!½±”€‘í¡½±•ôÁÕÑÑÌˆù€€è€ˆ‰ôð½‘¥Øù€ì(€€€ô¤¹©½¥¸ ˆˆ¤ì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰™Õ±±…É‘A±…å•É¹ÑÉäˆøñ‘¥Ø±…ÍÌô‰Á±…å•ÉÙ•¹Ñ!•É¼ˆøñÍÁ…¸ùQHµI=U9M=IIð½ÍÁ…¸øñ Äø‘í•ÍŒ¡ÍÑ½É”¹•Ù•¹Ð¹¹…µ”¥ôð½ Äø‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌ€ø€Ä€ü€ñ Ìùd€‘í‘…åôð½ Ìù€€è€ˆ‰ôñÀø‘í•ÍŒ¡Œü¹¹…µ”ñð€‰½ÕÉÍ”ˆ¥ôð½Àøð½‘¥Øøñ‘¥Ø±…ÍÌô‰Á±…å•É…Éˆøñ‘¥Ø±…ÍÌô‰Á±…å•É…É‘Q¥Ñ±”ˆùU10I9QIdð½‘¥Øøñ Èø‘í•ÍŒ¡Á•ÉÍ½¸ü¹¹…µ”ñð€‰A±…å•Èˆ¥ôð½ ÈøñÀù™Ñ•È½µÁ±•Ñ¥¹œÑ¡”É½Õ¹°½ÁäÑ¡”É½ÍÌÍ½É”™É½´å½ÕÈÍ•Á…É…Ñ”Í½É”…É™½È•Ù•Éä¡½±”¸¹Ñ•È€ñˆù@ð½ˆø½È€ñˆûŠLð½ˆø™½È„Á¥­ÕÀ¸‘íÁÕÑÑÍI•ÅÕ¥É•€ü€ˆAÕÑÑÌ…É”É•ÅÕ¥É•™½ÈÑ½‘…çŠeÌAÕÑÑ¥¹œ½µÁ•Ñ¥Ñ¥½¸¸ˆ€è€ˆ‰ôð½Àøñ‘¥Ø±…ÍÌô‰™Õ±±…É‘¹ÑÉåÉ¥€‘íÁÕÑÑÍI•ÅÕ¥É•€ü€‰Ý¥Ñ¡AÕÑÑÌˆ€è€ˆ‰ôˆøñ‘¥Ø±…ÍÌô‰™Õ±±…É‘¹ÑÉå!•…ˆøñÍÁ…¸ù!½±”ð½ÍÁ…¸øñÍÁ…¸ùA…Èð½ÍÁ…¸øñÍÁ…¸ù%¹‘•àð½ÍÁ…¸øñÍÁ…¸ùÉ½ÍÌð½ÍÁ…¸ø‘íÁÕÑÑÍI•ÅÕ¥É•€ü€ˆñÍÁ…¸ùAÕÑÑÌð½ÍÁ…¸øˆ€è€ˆ‰ôð½‘¥Øø‘íÉ½ÝÍôð½‘¥ØøñÀ±…ÍÌô‰™Õ±±…É‘É…™Ñ9½Ñ”ˆù¹ÑÉ¥•Ì…É”Í…Ù•½¸Ñ¡¥Ì‘•Ù¥”Ý¡¥±”å½ÔÝ½É¬¸I•ÍÕ±ÑÌ…ÁÁ•…È…™Ñ•Èå½Ô½¹™¥É´Ñ¡”½µÁ±•Ñ•…É¸ð½Àøñ‰ÕÑÑ½¸±…ÍÌô‰ÍÑ…ÉÑI½Õ¹‘	Ñ¸ˆ¥ô‰½¹™¥ÉµÕ±±A±…å•É…Éˆù=9%I4=5A1QM=IIð½‰ÕÑÑ½¸øñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰‰…­É½µÕ±±A±…å•É…Éˆù	…¬Ñ¼I½Õ¹ð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øù€ì(€€€½¹ÍÐ¹½Éµ…±¥Í•É½ÍÌ€ô€¡Ù…±Õ”¤€ôøì(€€€€€½¹ÍÐÑ•áÐ€ôMÑÉ¥¹œ¡Ù…±Õ”€üü€ˆˆ¤¹ÑÉ¥´ ¤¹Ñ½UÁÁ•É…Í” ¤ì(€€€€€É•ÑÕÉ¸Ñ•áÐ€ôôô€ˆ´ˆñðÑ•áÐ€ôôô€‹ŠLˆ€ü€‰@ˆ€èÑ•áÐì(€€€ôì(€€€½¹ÍÐ™¥•±‘Ì€ô€ m‘…Ñ„µ™Õ±±É½ÍÍt°m‘…Ñ„µ™Õ±±ÁÕÑÑÍtœ¤ì(€€€™¥•±‘Ì¹™½É…  ¡¥¹ÁÕÐ°¥¹‘•à¤€ôøì(€€€€€¥¹ÁÕÐ¹½¹¥¹ÁÕÐ€ô€ ¤€ôøì(€€€€€€€½¹ÍÐ¡½±”€ô€¬¡¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹™Õ±±É½ÍÌñð¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹™Õ±±ÁÕÑÑÌ¤°(€€€€€€€€€É½Ü€ô€¡‘É…™Ð¹¡½±•Ím¡½±•t€ô‘É…™Ð¹¡½±•Ím¡½±•tñðíô¤ì(€€€€€€€¥˜€¡¥¹ÁÕÐ¹‘…Ñ…Í•Ð¹™Õ±±É½ÍÌ¤(€€€€€€€€€É½Ü¹É½ÍÌ€ô¹½Éµ…±¥Í•É½ÍÌ¡¥¹ÁÕÐ¹Ù…±Õ”¤ì(€€€€€€€•±Í”É½Ü¹ÁÕÑÑÌ€ô¥¹ÁÕÐ¹Ù…±Õ”¹ÑÉ¥´ ¤ì(€€€€€€€Á•ÉÍ¥ÍÑMÑ½É” ¤ì(€€€€€ôì(€€€€€¥¹ÁÕÐ¹½¹­•å‘½Ý¸€ô€¡•Ù•¹Ð¤€ôøì(€€€€€€€¥˜€¡•Ù•¹Ð¹­•ä€„ôô€‰¹Ñ•Èˆ¤É•ÑÕÉ¸ì(€€€€€€€•Ù•¹Ð¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì(€€€€€€€™¥•±‘Ím¥¹‘•à€¬€Åtü¹™½ÕÌ ¤ì(€€€€€€€™¥•±‘Ím¥¹‘•à€¬€Åtü¹Í•±•Ð ¤ì(€€€€€ôì(€€€ô¤ì(€€€€ ˆ‰…­É½µÕ±±A±…å•É…Éˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•Üˆì(€€€€€Í…Ù” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€•¹‘M½É•…É‘UÁ‘…Ñ•AÉ½Ñ•Ñ¥½¸ ¤ì(€€€ôì(€€€€ ˆ½¹™¥ÉµÕ±±A±…å•É…Éˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€½¹ÍÐ¥¹Ù…±¥€ômtì(€€€€€™½È€¡±•Ð¡½±”€ô€Äì¡½±”€ðô€Äàì¡½±”¬¬¤ì(€€€€€€€½¹ÍÐÉ½Ü€ô‘É…™Ð¹¡½±•Ím¡½±•tñðíô°(€€€€€€€€€É½ÍÌ€ô¹½Éµ…±¥Í•É½ÍÌ¡É½Ü¹É½ÍÌ¤°(€€€€€€€€€ÁÕÑÑÌ€ôMÑÉ¥¹œ¡É½Ü¹ÁÕÑÑÌ€üü€ˆˆ¤¹ÑÉ¥´ ¤°(€€€€€€€€€Ù…±¥‘É½ÍÌ€ô(€€€€€€€€€€€É½ÍÌ€ôôô€‰@ˆñð(€€€€€€€€€€€€¡9Õµ‰•È¹¥Í%¹Ñ••È ­É½ÍÌ¤€˜˜€­É½ÍÌ€øô€Ä€˜˜€­É½ÍÌ€ðô€ÈÀ¤°(€€€€€€€€€Ù…±¥‘AÕÑÑÌ€ô(€€€€€€€€€€€€…ÁÕÑÑÍI•ÅÕ¥É•ñð(€€€€€€€€€€€€¡ÁÕÑÑÌ€„ôô€ˆˆ€˜˜(€€€€€€€€€€€€€9Õµ‰•È¹¥Í%¹Ñ••È ­ÁÕÑÑÌ¤€˜˜(€€€€€€€€€€€€€€­ÁÕÑÑÌ€øô€À€˜˜(€€€€€€€€€€€€€€­ÁÕÑÑÌ€ðô€ä€˜˜(€€€€€€€€€€€€€€¡É½ÍÌ€ôôô€‰@ˆñð€­ÁÕÑÑÌ€ðô€­É½ÍÌ¤¤ì(€€€€€€€¥˜€ …Ù…±¥‘É½ÍÌñð€…Ù…±¥‘AÕÑÑÌ¤¥¹Ù…±¥¹ÁÕÍ ¡¡½±”¤ì(€€€€€ô(€€€€€¥˜€¡¥¹Ù…±¥¹±•¹Ñ ¤(€€€€€€€É•ÑÕÉ¸…±•ÉÐ (€€€€€€€€€½µÁ±•Ñ”…¹¡•¬!½±”‘í¥¹Ù…±¥¹±•¹Ñ €ôôô€Ä€ü€ˆˆ€è€‰Ì‰ô€‘í¥¹Ù…±¥¹©½¥¸ ˆ°€ˆ¥ô‰•™½É”½¹™¥Éµ¥¹œÑ¡”…É¹€°(€€€€€€€€¤ì(€€€€€½¹ÍÐÉ½ÍÍQ½Ñ…°€ôÉÉ…ä¹™É½´¡ì±•¹Ñ è€Äàô°€¡|°¥¹‘•à¤€ôøì(€€€€€€€½¹ÍÐÉ½ÍÌ€ô¹½Éµ…±¥Í•É½ÍÌ¡‘É…™Ð¹¡½±•Ím¥¹‘•à€¬€Åt¹É½ÍÌ¤ì(€€€€€€€É•ÑÕÉ¸É½ÍÌ€ôôô€‰@ˆ€ü€¬¡…É¹Á…Èü¹m¥¹‘•átñð€À¤€¬€È€è€­É½ÍÌì(€€€€€ô¤¹É•‘Õ” ¡Ñ½Ñ…°°Ù…±Õ”¤€ôøÑ½Ñ…°€¬Ù…±Õ”°€À¤ì(€€€€€¥˜€ (€€€€€€€€…½¹™¥É´ (€€€€€€€€€½¹™¥É´Ñ¡”½µÁ±•Ñ”€Äàµ¡½±”…É™½È€‘íÁ•ÉÍ½¸ü¹¹…µ”ñð€‰Ñ¡¥ÌÁ±…å•È‰ôýq¹q¹É½ÍÌÑ½Ñ…°è€‘íÉ½ÍÍQ½Ñ…±õq¹q¹Q¡”…ÉÝ¥±°‰”Í•¹ÐÑ¼Ñ¡”±•…‘•É‰½…É…¹…¹¹½Ð‰”•‘¥Ñ•‰äÑ¡”Á±…å•È…™Ñ•È½¹™¥Éµ…Ñ¥½¸¹€°(€€€€€€€€¤(€€€€€€¤(€€€€€€€É•ÑÕÉ¸ì(€€€€€½¹ÍÐ½¹™¥Éµ•‘Ð€ô¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€€€™½È€¡±•Ð¡½±”€ô€Äì¡½±”€ðô€Äàì¡½±”¬¬¤ì(€€€€€€€½¹ÍÐÍ…Ù•€ô‘É…™Ð¹¡½±•Ím¡½±•t°(€€€€€€€€€É½ÍÌ€ô¹½Éµ…±¥Í•É½ÍÌ¡Í…Ù•¹É½ÍÌ¤°(€€€€€€€€€ÁÕÑÑÌ€ôÁÕÑÑÍI•ÅÕ¥É•€ü€­Í…Ù•¹ÁÕÑÑÌ€è€ˆˆ°(€€€€€€€€€É•½É€ôÍ½É•I•½É¡‘…ä°Í•±•Ñ•°¡½±”¤ì(€€€€€€€É•½É¹Í•±˜€ôìÁ±…å•É%èÁ±…å•É-•ä°É½ÍÌ°ÁÕÑÑÌôì(€€€€€€€É•½É¹½™™¥¥…°€ôìÁ±…å•É%èÁ±…å•É-•ä°É½ÍÌ°ÁÕÑÑÌôì(€€€€€ô(€€€€€½¹ÍÐÉ½Õ¹€ôÍ½É•ÉMÑ½É”¡‘…ä°Í•±•Ñ•¤ì(€€€€€É½Õ¹¹}µ•Ñ„€ôì(€€€€€€€€¸¸¸¡É½Õ¹¹}µ•Ñ„ñðíô¤°(€€€€€€€™¥¹…±¥Í•‘Ðè½¹™¥Éµ•‘Ð°(€€€€€€€™Õ±±…É‘¹Ñ•É•‘	åA±…å•ÈèÑÉÕ”°(€€€€€ôì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•€ôÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•ñðíôì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘m‘…å-•åt€ô(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘m‘…å-•åtñðíôì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹É½Õ¹‘¥¹…±¥Í•‘m‘…å-•åumÁ±…å•É-•åt€ô½¹™¥Éµ•‘Ðì(€€€€€‘•±•Ñ”ÍÑ½É”¹•Ù•¹Ð¹™Õ±±…É‘É…™ÑÍm‘…å-•åumÁ±…å•É-•åtì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰½µÁ±•Ñ•ˆì(€€€€€ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä°Í•±•Ñ•¤ì(€€€€€Á•ÉÍ¥ÍÑMÑ½É” ¤ì(€€€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰½É…¹¥Í•Èˆ¤Ù½¥ÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€ôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É¥¹…±M½É•¹ÑÉä¡Í•±•Ñ•°‘…ä¤ì(€€€½¹ÍÐ¡½ÍÐô ˆÁ±…å•ÉáÁ•É¥•¹”ˆ¤°µ•Ñ¡½õ‘…åM½É¥¹5•Ñ¡½¡‘…ä¤°­¥¹õµ•Ñ¡½ôôô‰™¥¹…±MÑ…‰±•™½Éˆü‰ÍÑ…‰±•™½Éˆè‰É½ÍÌˆ°(€€€€€•¹ÑÉäõ™¥¹…±M½É•¹ÑÉä¡‘…ä±Í•±•Ñ•¥ññíô°Œõ½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ­‘…åt¤°½µÁ±•Ñ”õ™¥¹…±M½É•½µÁ±•Ñ”¡‘…ä±Í•±•Ñ•¤°(€€€€€ÉÕ±”õ­¥¹ôôô‰É½ÍÌˆ€ü€¡í…±±MÑÉ½­•Ìè‰±°MÑÉ½­•Ì½Õ¹Ðˆ±µ…á½Õ‰±•	½•äè‰5…á¥µÕ´½Õ‰±”	½•äˆ±µ…áQÉ¥Á±•	½•äè‰5…á¥µÕ´QÉ¥Á±”	½•ä‰õmÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•M½É¥¹5½‘•ñð‰…±±MÑÉ½­•Ì‰t¤€è€‰MÑ…‰±•™½ÉÁ½¥¹ÑÌˆì(€€€¡½ÍÐ¹¥¹¹•É!Q50õ€ñ‘¥Ø±…ÍÌô‰™¥¹…±M½É•¹ÑÉäˆøñ‘¥Ø±…ÍÌô‰Á±…å•ÉÙ•¹Ñ!•É¼ˆøñÍÁ…¸ù%90M=Ið½ÍÁ…¸øñ Äø‘í•ÍŒ¡ÍÑ½É”¹•Ù•¹Ð¹¹…µ”¥ôð½ Äø‘íÍÑ½É”¹•Ù•¹Ð¹‘…åÌøÄý€ñ Ìùd€‘í‘…åôð½ Ìù€èˆ‰ôñÀø‘í•ÍŒ¡Œü¹¹…µ•ñð‰½ÕÉÍ”ˆ¥ôð½Àøð½‘¥Øøñ‘¥Ø±…ÍÌô‰Á±…å•É…Éˆøñ‘¥Ø±…ÍÌô‰Á±…å•É…É‘Q¥Ñ±”ˆù%90M=I9QIdð½‘¥Øøñ Èø‘í•ÍŒ¡•Ù•¹ÑA±…å•É9…µ”¡Í•±•Ñ•±‘…ä¤¥ôð½ ÈøñÀù½±˜M½É•È¥Ì¹½Ð¥¸ÕÍ”™½È¡½±”µ‰äµ¡½±”Í½É¥¹œÑ½‘…ä¸¹Ñ•ÈÑ¡”™¥¹…°Í½É”ÍÕÁÁ±¥•‰äÑ¡”…‘‘¥”½È½™™¥¥…°…É…™Ñ•È½µÁ±•Ñ¥¹œÑ¡”É½Õ¹¸ð½Àøñ‘¥Ø±…ÍÌô‰™¥¹…±M½É•IÕ±”ˆøñˆø‘í­¥¹ôôô‰ÍÑ…‰±•™½Éˆü‰MÑ…‰±•™½ÉA½¥¹ÑÌˆè‰É½ÍÌMÑÉ½­”Q½Ñ…°‰ôð½ˆøñÍÁ…¸ø‘í•ÍŒ¡ÉÕ±”¥ôð½ÍÁ…¸øð½‘¥Øøñ±…‰•°ø‘í­¥¹ôôô‰ÍÑ…‰±•™½Éˆü‰¥¹…°MÑ…‰±•™½ÉÁ½¥¹ÑÌˆè‰¥¹…°É½ÍÌÍÑÉ½­•Ì‰ôñ¥¹ÁÕÐ¥ô‰™¥¹…±M½É•Q½Ñ…°ˆ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥ŒˆÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸ôˆÀˆµ…àôˆÐÀÀˆÙ…±Õ”ôˆ‘í•¹ÑÉä¹Ñ½Ñ…°üüˆ‰ôˆ€‘í½µÁ±•Ñ”ü‰‘¥Í…‰±•ˆèˆ‰ôøð½±…‰•°ø‘í½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰Ñ•…µAÕÑÑÌˆ±‘…ä¤ý€ñ±…‰•°ùQ½Ñ…°ÁÕÑÑÌ€¡½ÁÑ¥½¹…°¤ñ¥¹ÁÕÐ¥ô‰™¥¹…±M½É•AÕÑÑÌˆ¥¹ÁÕÑµ½‘”ô‰¹Õµ•É¥ŒˆÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸ôˆÀˆµ…àôˆÄÀÀˆÙ…±Õ”ôˆ‘í•¹ÑÉä¹ÁÕÑÑÌüüˆ‰ôˆ€‘í½µÁ±•Ñ”ü‰‘¥Í…‰±•ˆèˆ‰ôøð½±…‰•°ù€èˆ‰ô‘í½µÁ±•Ñ”ý€ñ‘¥Ø±…ÍÌô‰™¥¹…±M½É•M…Ù•ˆøñˆûŠrL¥¹…°Í½É”Í…Ù•ð½ˆøñÍÁ…¸ø‘í•¹ÑÉä¹Ñ½Ñ…±ô€‘í­¥¹ôôô‰ÍÑ…‰±•™½Éˆü‰Á½¥¹ÑÌˆè‰ÍÑÉ½­•Ì‰ô‘í•¹ÑÉä¹ÁÕÑÑÌ„ôôˆˆ˜™•¹ÑÉä¹ÁÕÑÑÌ„õ¹Õ±°ý€ƒ
Ü€‘í•¹ÑÉä¹ÁÕÑÑÍôÁÕÑÑÍ€èˆ‰ôð½ÍÁ…¸øð½‘¥Øù€é€ñ‰ÕÑÑ½¸±…ÍÌô‰ÍÑ…ÉÑI½Õ¹‘	Ñ¸ˆ¥ô‰Í…Ù•¥¹…±M½É”ˆù=9%I4%90M=Ið½‰ÕÑÑ½¸ùôñ‰ÕÑÑ½¸±…ÍÌô‰Í½™Ðˆ¥ô‰‰…­É½µ¥¹…±M½É”ˆù	…¬Ñ¼I½Õ¹ð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øù€ì(€€€€ ˆ‰…­É½µ¥¹…±M½É”ˆ¤¹½¹±¥¬ô ¤ôùíÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”ô‰ÁÉ•Ù¥•ÜˆíÍ…Ù” ¤íÉ•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤í•¹‘M½É•…É‘UÁ‘…Ñ•AÉ½Ñ•Ñ¥½¸ ¤íôì(€€€¥˜  ˆÍ…Ù•¥¹…±M½É”ˆ¤¤€ ˆÍ…Ù•¥¹…±M½É”ˆ¤¹½¹±¥¬ô ¤ôùì(€€€€€½¹ÍÐÑ½Ñ…°õ9Õµ‰•È  ˆ™¥¹…±M½É•Q½Ñ…°ˆ¤¹Ù…±Õ”¤°ÁÕÑÑÌô ˆ™¥¹…±M½É•AÕÑÑÌˆ¤ü¹Ù…±Õ”üüˆˆì(€€€€€¥˜ …9Õµ‰•È¹¥Í¥¹¥Ñ”¡Ñ½Ñ…°¥ññÑ½Ñ…°ðÀ¥É•ÑÕÉ¸…±•ÉÐ ‰¹Ñ•ÈÑ¡”™¥¹…°Í½É”™É½´Ñ¡”…‘‘¥”½È½™™¥¥…°…É¸ˆ¤ì(€€€€€¥˜ …½¹™¥É´¡½¹™¥É´€‘íÑ½Ñ…±ô€‘í­¥¹ôôô‰ÍÑ…‰±•™½Éˆü‰MÑ…‰±•™½ÉÁ½¥¹ÑÌˆè‰É½ÍÌÍÑÉ½­•Ì‰ôüQ¡¥Ì™¥¹…°É•ÍÕ±Ð¡…Ì¹¼¡½±”µ‰äµ¡½±”½Õ¹Ñ‰…¬¹€¤¥É•ÑÕÉ¸ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹™¥¹…±M½É•ÍñðõíôíÍÑ½É”¹•Ù•¹Ð¹™¥¹…±M½É•Íl‰‘…äˆ­‘…åuñðõíôì(€€€€€½¹ÍÐÍ…Ù•õí­¥¹±Ñ½Ñ…°±ÁÕÑÑÌéÁÕÑÑÌôôôˆˆüˆˆè­ÁÕÑÑÌ±ÉÕ±”éÍÑ½É”¹•Ù•¹Ð¹ÍÑÉ½­•M½É¥¹5½‘•ñð‰…±±MÑÉ½­•Ìˆ±½¹™¥Éµ•‘Ðé¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¥ôì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹™¥¹…±M½É•Íl‰‘…äˆ­‘…åumMÑÉ¥¹œ¡Í•±•Ñ•¥tõÍ…Ù•íÍ½É•ÉMÑ½É”¡‘…ä±Í•±•Ñ•¤¹}™¥¹…±M½É”õÍ…Ù•ì(€€€€€Á•ÉÍ¥ÍÑMÑ½É” ¤ì¥˜¡ÍÑ½É”¹±½Õü¹•Ù•¹Ñ%¤ÅÕ•Õ•±½Õ‘I½Õ¹¡‘…ä±Í•±•Ñ•¤ì¥˜¡ÍÑ½É”¹±½Õü¹É½±”ôôô‰½É…¹¥Í•Èˆ¤Ù½¥ÕÁ‘…Ñ•±½Õ‘Ù•¹Ð ¤ì(€€€€€É•¹‘•É¥¹…±M½É•¹ÑÉä¡Í•±•Ñ•±‘…ä¤ì(€€€ôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€½¹ÍÐ¡½ÍÐ€ô€ ˆÁ±…å•ÉáÁ•É¥•¹”ˆ¤ì(€€€¥˜€ …¡½ÍÐ¤É•ÑÕÉ¸ì(€€€¥˜€ …ÍÑ½É”¹•Ù•¹Ð¤ì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô(€€€€€€€€œñ‘¥Ø±…ÍÌô‰…Éˆøñ ÈùA±…å•ÈY¥•Üð½ ÈøñÀùÉ•…Ñ”…¸•Ù•¹ÐÁ±…¸™¥ÉÍÐ¸ð½Àøð½‘¥Øøœì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹ÍÑ…ÑÕÌ€ôôô€‰…¹•±±•ˆ¤ì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰…É…¹•±±•‘Ù•¹Ñ…Éˆøñ ÈùÙ•¹Ð…¹•±±•ð½ ÈøñÀøñˆø‘í•ÍŒ¡ÍÑ½É”¹•Ù•¹Ð¹¹…µ”ñð€‰Q¡¥Ì•Ù•¹Ðˆ¥ôð½ˆø¡…Ì‰••¸…¹•±±•‰äÑ¡”½É…¹¥Í•È¸M½É¥¹œ¥Ì±½Í•¸ð½Àøð½‘¥Øù€ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€¥¹¥Ñ¥…±¥Í•É½ÕÁÌ ¤ì(€€€½¹ÍÐ‘…åÌ€ôÍÑ½É”¹•Ù•¹Ð¹‘…åÌñð€Äì(€€€±•Ð‘…ä€ô5…Ñ ¹µ¥¸¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý…äñð€Ä°‘…åÌ¤ì(€€€¥˜¡¥ÍA±…å•É•Ù¥” ¤€˜˜=‰©•Ð¹­•åÌ¡ÍÑ½É”¹•Ù•¹Ð¹Í¡…É•‘A½Í¥Ñ¥½¹Ìñðíô¤¹±•¹Ñ €˜˜€…‘…å¥•±‘%‘Ì¡‘…ä¤¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡ÍÑ½É”¹±½Õü¹Á±…å•É%¤¤¤ì(€€€€€‘…äõ•Ù•¹Ñ…åÌ ¤¹™¥¹¡ôù‘…å¥•±‘%‘Ì¡¤¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡ÍÑ½É”¹±½Õ¹Á±…å•É%¤¤¤ñð‘…äì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”ô‰ÁÉ•Ù¥•ÜˆíÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½ÌôÀì(€€€ô(€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰Á±…å•Èˆ€˜˜µ…¹Õ…±…å¥¹…±¥Í•¡‘…ä¤¤ì(€€€€€½¹ÍÐ¹•áÐ€ô•Ù•¹Ñ…åÌ ¤¹™¥¹¡¹•áÐ€ôø¹•áÐ€ø‘…ä€˜˜‘…å¥•±‘%‘Ì¡¹•áÐ¤¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡ÍÑ½É”¹±½Õ¹Á±…å•É%¤¤€˜˜€…•Ù•¹Ñ…å½µÁ±•Ñ”¡¹•áÐ¤¤ì(€€€€€¥˜€¡¹•áÐ¤ì(€€€€€€€‘…ä€ô¹•áÐìÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý…ä€ô¹•áÐì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•ÜˆìÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ô€ÀìÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€€€€€ô(€€€ô(€€€±•Ð™¥•±€ô‘…å¥•±‘%‘Ì¡‘…ä¤¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€„ôô9=}AIQ9I}%¤ì(€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰Á±…å•Èˆ¤(€€€€€™¥•±€ô™¥•±¹™¥±Ñ•È ¡¥¤€ôøMÑÉ¥¹œ¡¥¤€ôôôMÑÉ¥¹œ¡ÍÑ½É”¹±½Õ¹Á±…å•É%¤¤ì(€€€±•ÐÍ•±•Ñ•€ôMÑÉ¥¹œ¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý%ñð™¥•±‘lÁtñð€ˆˆ¤ì(€€€¥˜€ …™¥•±¹¥¹±Õ‘•Ì¡Í•±•Ñ•¤¤Í•±•Ñ•€ôMÑÉ¥¹œ¡™¥•±‘lÁtñð€ˆˆ¤ì(€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý…ä€ô‘…äì(€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý%€ôÍ•±•Ñ•ì(€€€¥˜€¡ÍÑ½É”¹±½Õü¹É½±”€ôôô€‰Á±…å•Èˆ¤Íå¹I•½Ù•É•‘A±…å•ÉI½Õ¹¡‘…ä°Í•±•Ñ•¤ì(€€€Í¡•‘Õ±•M½É¥¹=Á•¹¥¹œ¡‘…ä¤ì(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôôô€‰Í½É¥¹œˆ€˜˜€…Í½É¥¹%Í=Á•¸¡‘…ä¤¤ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•Üˆì(€€€€€Á•ÉÍ¥ÍÑMÑ½É” ¤ì(€€€ô(€€€¥˜€¡¥ÍA±…å•É•Ù¥” ¤€˜˜ÍÑ½É”¹•Ù•¹Ð¹™¥¹…±I•ÍÕ±ÑÌü¹½¹™¥Éµ•‘Ð¤ì(€€€€€½¹ÍÐµ•ÍÍ…”€ô™¥¹…±5•ÍÍ…•½ÉA±…å•È¡Í•±•Ñ•¤ì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰Á±…å•É¥¹¥Í ˆøñ¥µœÍÉŒô‰…ÍÍ•ÑÌ½…Ý…äµ½±˜µµ…Í½Ðµ™¥¹¥Í ¹Á¹œˆ…±Ðô‰Ý…ä½±˜½±™•Èˆøñ‘¥Øøñ Äø‘í•ÍŒ¡µ•ÍÍ…”¹¡•…‘¥¹œ¥ôð½ Äø‘íµ•ÍÍ…”¹µ•ÍÍ…”€ü€ñ Èø‘í•ÍŒ¡µ•ÍÍ…”¹µ•ÍÍ…”¥ôð½ Èù€€è€ˆ‰ôñÀ±…ÍÌô‰Í½É¥¹É•‘¥Ðˆø‘í•ÍŒ¡µ•ÍÍ…”¹Í½É¥¹É•‘¥Ð¥ôð½Àøð½‘¥Øøð½‘¥Øù€ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôôô€‰™¥¹…±¹ÑÉäˆ¤(€€€€€É•ÑÕÉ¸É•¹‘•É¥¹…±M½É•¹ÑÉä¡Í•±•Ñ•°‘…ä¤ì(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôôô€‰™Õ±±…É‘¹ÑÉäˆ¤(€€€€€É•ÑÕÉ¸É•¹‘•ÉÕ±±…É‘A±…å•É¹ÑÉä¡Í•±•Ñ•°‘…ä¤ì(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôôô€‰Í½É¥¹œˆ¤(€€€€€É•ÑÕÉ¸…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤(€€€€€€€€üÉ•¹‘•Éµ‰É½Í•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤(€€€€€€€€èÉ•¹‘•É!½±•M½É¥¹œ¡Í•±•Ñ•°‘…ä¤ì(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôôô€‰Ù•É¥™äˆ¤(€€€€€É•ÑÕÉ¸É•¹‘•ÉI½Õ¹‘Y•É¥™¥…Ñ¥½¸¡Í•±•Ñ•°‘…ä¤ì(€€€¥˜€¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôôô€‰½µÁ±•Ñ•ˆ¤(€€€€€É•ÑÕÉ¸…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤(€€€€€€€€üÉ•¹‘•Éµ‰É½Í•½µÁ±•Ñ•¡Í•±•Ñ•°‘…ä¤(€€€€€€€€èÉ•¹‘•É½µÁ±•Ñ•‘M½É•…É¡Í•±•Ñ•°‘…ä¤ì(€€€½¹ÍÐÀ€ô•Ù•¹ÑA±…å•È¡Í•±•Ñ•±‘…ä¤°(€€€€€Ñà€ôÁ±…å•ÉÉ½ÕÁ½¹Ñ•áÐ¡Í•±•Ñ•°‘…ä¤ì(€€€¥˜€ …Àñð€…Ñà¤ì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€‘í‘…åQ…‰Ì ‰ÁÉ•Ù¥•Ý‘…äˆ±‘…ä¥ôñ‘¥Ø±…ÍÌô‰…Éˆøñ Èù…ä€‘í‘…åôð½ ÈøñÀùe½Ô…É”¹½ÐÁ±…å¥¹œ½¸Ñ¡¥Ì‘…ä¸M•±•Ð…¹½Ñ¡•È‘…äÑ¼Ù¥•Üå½ÕÈÉ½Õ¹¸ð½Àøð½‘¥Øù€ì(€€€€€€ ‰m‘…Ñ„µÁÉ•Ù¥•Ý‘…åtˆ¤¹™½É… ¡‰ÕÑÑ½¸ôù‰ÕÑÑ½¸¹½¹±¥¬ô ¤ôùíÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý…äô­‰ÕÑÑ½¸¹‘…Ñ…Í•Ð¹ÁÉ•Ù¥•Ý‘…äíÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”ô‰ÁÉ•Ù¥•ÜˆíÍ…Ù” ¤íÉ•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤íô¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€¥˜€¡¥ÍA±…å•É•Ù¥” ¤€˜˜€…Á±…å•É!…ÍM••¹]•±½µ”¡Í•±•Ñ•¤¤ì(€€€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰Á±…å•É]•±½µ”ˆøñ‘¥Ø±…ÍÌô‰Ý•±½µ•5…Í½Ñ]É…Àˆøñ¥µœÍÉŒô‰…Ý…äµ½±˜µµ…Í½Ðµµ¥¹¤¹Á¹œˆ…±Ðô‰Ý…ä½±˜½±™•Èˆøð½‘¥Øøñ‘¥Ø±…ÍÌô‰Ý•±½µ•]½É‘ÌˆøñÍµ…±°ù]d=1ð½Íµ…±°øñ Äù]•±½µ”°€‘í•ÍŒ¡Á±…å•É¥ÉÍÑ9…µ”¡Í•±•Ñ•¤¥ô¸ð½ Äøñ Èù±…å½Ô½Õ±©½¥¸ÕÌ„ð½ ÈøñÀùe½×ŠeÉ”Á±…å¥¹œ¥¸€ñˆø‘í•ÍŒ¡ÍÑ½É”¹•Ù•¹Ð¹¹…µ”ñð€‰Ñ½‘…çŠeÌÝ…ä½±˜•Ù•¹Ðˆ¥ôð½ˆø¸ð½Àøñ‰ÕÑÑ½¸±…ÍÌô‰ÍÑ…ÉÑI½Õ¹‘	Ñ¸ˆ¥ô‰½¹Ñ¥¹Õ•É½µ]•±½µ”ˆùY%\Q=gŠeLIU1Lð½‰ÕÑÑ½¸øð½‘¥Øøð½‘¥Øù€ì(€€€€€€ ˆ½¹Ñ¥¹Õ•É½µ]•±½µ”ˆ¤¹½¹±¥¬€ô€ ¤€ôø(€€€€€€€½Á•¹A±…å•ÉIÕ±•ÍÉ½µ]•±½µ”¡Í•±•Ñ•¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€½¹ÍÐœ€ôÑà¹É½ÕÀ°(€€€€€Í•ÑÕÀ€ôÑà¹Í•ÑÕÀ°(€€€€€Œ€ô½ÕÉÍ”¡ÍÑ½É”¹•Ù•¹Ñl‰½ÕÉÍ”ˆ€¬‘…åt¤°(€€€€€ÍÑ…ÉÐ€ôÉ½ÕÁMÑ…ÉÑ¥¹!½±”¡ÍÑ½É”¹•Ù•¹Ð°‘…ä°Ñà¹É½ÕÁ%¹‘•à¤°(€€€€€ÍÑ…ÉÑQ•áÐ€ô!½±”€‘íÍÑ…ÉÑõ€°(€€€€€Ñ••Q¥µ”€ôÉ½ÕÁQ••Q¥µ”¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤°(€€€€€ÁÉ•Ù¥•ÝMÑ…”€ô€…ÍÑ½É”¹•Ù•¹Ð¹±½­•ì(€€€±•ÐÁ…ÉÑ¹•È€ô¹Õ±°ì(€€€¥˜€¡½µÁ•Ñ¥Ñ¥½¹%Í=¸ ‰™½ÕÉ‰…±°ˆ°‘…ä¤¤ì(€€€€€½¹ÍÐÁ…¥ÉMÑ…ÉÐ€ôÑà¹Á±…å•É%¹‘•à€ð€È€ü€À€è€Èì(€€€€€±•Ð½Ñ¡•È€ôœ(€€€€€€€€¹Í±¥”¡Á…¥ÉMÑ…ÉÐ°Á…¥ÉMÑ…ÉÐ€¬€È¤(€€€€€€€€¹™¥¹ ¡¥¤€ôø¥€„ôôÍ•±•Ñ•¤ì(€€€€€¥˜€¡½Ñ¡•È€ôôô9=}AIQ9I}%€˜˜Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È¤(€€€€€€€Á…ÉÑ¹•È€ô•Ù•¹ÑA±…å•È¡Í•ÑÕÀ¹Ù¥ÉÑÕ…±A±…å•È±‘…ä¤ì(€€€€€•±Í”Á…ÉÑ¹•È€ô•Ù•¹ÑA±…å•È¡½Ñ¡•È±‘…ä¤ì(€€€ô(€€€½¹ÍÐ¥Í™™•Ñ•€ô€  ¤€ôøì(€€€€€½¹ÍÐ¹À€ô¹½A…ÉÑ¹•É½¹Ñ•áÐ¡Í•ÑÕÀ¹É½ÕÁÌ°‘…ä°Ñà¹É½ÕÁ%¹‘•à¤ì(€€€€€É•ÑÕÉ¸¹À€˜˜MÑÉ¥¹œ¡¹À¹…™™•Ñ•¤€ôôôÍ•±•Ñ•€ü¹À€è¹Õ±°ì(€€€ô¤ ¤ì(€€€½¹ÍÐ•áÑÉ…9ÑÁ!½±•Ì€ô=‰©•Ð¹•¹ÑÉ¥•Ì¡Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•ÉÌñðíô¤(€€€€€€€€¹™¥±Ñ•È ¡l°¥‘t¤€ôøMÑÉ¥¹œ¡¥¤€ôôôÍ•±•Ñ•¤(€€€€€€€€¹µ…À ¡m¡½±•t¤€ôø¡½±”¤°(€€€€€¥ÍáÑÉ„€ô•áÑÉ…9ÑÁ!½±•Ì¹±•¹Ñ €ø€ÀñðMÑÉ¥¹œ¡Í•ÑÕÀ¹¹ÑÁáÑÉ…A±…å•Èñð€ˆˆ¤€ôôôÍ•±•Ñ•°(€€€€€ÉÕ±•M•Ñ¥½¹Ì€ô•Ù•¹ÑIÕ±•M•Ñ¥½¹Ì¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤°(€€€€€å•±±½Ý	…±±=¸€ôå•±±½Ý	…±±%Í=¸¡‘…ä¤°(€€€€€½Á•¹¥¹e•±±½Ý	…±±A±…å•È€ôå•±±½Ý	…±±=¸(€€€€€€€€üå•±±½Ý	…±±A±…å•É½É!½±”¡‘…ä°Ñà¹É½ÕÁ%¹‘•à°ÍÑ…ÉÐ¤(€€€€€€€€è€ˆˆì(€€€½¹ÍÐÍ•±•Ñ•‘A…¥ÉMÑ…ÉÐ€ôÑà¹Á±…å•É%¹‘•à€ð€È€ü€À€è€È°(€€€€€Í•±•Ñ•‘A…¥È€ôœ(€€€€€€€€¹Í±¥”¡Í•±•Ñ•‘A…¥ÉMÑ…ÉÐ°Í•±•Ñ•‘A…¥ÉMÑ…ÉÐ€¬€È¤(€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤°(€€€€€½Ñ¡•ÉA…¥È€ôœ(€€€€€€€€¹™¥±Ñ•È ¡|°¥¹‘•à¤€ôø¥¹‘•à€ðÍ•±•Ñ•‘A…¥ÉMÑ…ÉÐñð¥¹‘•à€øôÍ•±•Ñ•‘A…¥ÉMÑ…ÉÐ€¬€È¤(€€€€€€€€¹µ…À¡MÑÉ¥¹œ¤ì(€€€±•Ð‘¥ÍÁ±…å%‘Ì€ômÍ•±•Ñ•°€¸¸¹Í•±•Ñ•‘A…¥È¹™¥±Ñ•È ¡¥¤€ôø¥€„ôôÍ•±•Ñ•¥tì(€€€½Ñ¡•ÉA…¥È¹™½É…  ¡¥¤€ôøì(€€€€€¥˜€ …‘¥ÍÁ±…å%‘Ì¹¥¹±Õ‘•Ì¡¥¤¤‘¥ÍÁ±…å%‘Ì¹ÁÕÍ ¡¥¤ì(€€€ô¤ì(€€€‘¥ÍÁ±…å%‘Ì€ô‘¥ÍÁ±…å%‘Ì¹Í±¥” À°€Ð¤ì(€€€½¹ÍÐÉ½ÕÁ9…µ•Ì€ô‘¥ÍÁ±…å%‘Ì¹µ…À ¡¥¤€ôø€¡ì(€€€€€¥°(€€€€€¹…µ”è¥€ôôô9=}AIQ9I}%€ü€‰9¼A…ÉÑ¹•Èˆ€è•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€‰U¹­¹½Ý¸ˆ°(€€€ô¤¤°(€€€€€½µÁ±•Ñ•É…Ü€ô€ñ‘•Ñ…¥±Ì±…ÍÌô‰½µÁ±•Ñ•É…ÜˆøñÍÕµµ…ÉäùY¥•Ü½µÁ±•Ñ”É…Üð½ÍÕµµ…Éäøñ‘¥ØøñÍÑÉ½¹œø‘í‘…åÌ€ôôô€Ä€ü€‰Ù•¹ÐQ•…µÌˆ€è…ä€‘í‘…åôQ•…µÍôð½ÍÑÉ½¹œø‘ì¡Í•ÑÕÀ¹É½ÕÁÌñðmt¤¹µ…À ¡Ñ•…´°¥¹‘•à¤€ôø€ñÍ•Ñ¥½¸øñˆùQ•…´€‘í¥¹‘•à€¬€Åôð½ˆøñÍÁ…¸ø‘í•ÍŒ¡Ñ•…´¹µ…À ¡¥¤€ôø¥€ôôô9=}AIQ9I}%€ü€‰9¼A…ÉÑ¹•Èˆ€è•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€‰U¹­¹½Ý¸ˆ¤¹©½¥¸ ˆƒ
Ü€ˆ¤¥ôð½ÍÁ…¸øð½Í•Ñ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øøð½‘•Ñ…¥±Ìù€ì(€€€½¹ÍÐ…¬€ô	½½±•…¸¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý¬ü¹m‘…åtü¹mÍ•±•Ñ•‘t¤°(€€€€€¡À€ôÁ±…å•É…¥±å!…¹‘¥…À¡Í•±•Ñ•°‘…ä¤°(€€€€€™¥¹…±¥Í•€ô‘…åM½É¥¹5•Ñ¡½¡‘…ä¤€ôôô€‰™Õ±±…É‘A±…å•Èˆ(€€€€€€€€üÉ½Õ¹‘¥¹…±¥Í•‘½È¡‘…ä°Í•±•Ñ•¤(€€€€€€€€è‘…åM½É¥¹5•Ñ¡½¡‘…ä¤€„ôô€‰¡½±•	å!½±”ˆ(€€€€€€€€€€ü™¥¹…±M½É•½µÁ±•Ñ”¡‘…ä±Í•±•Ñ•¤(€€€€€€€€€€è…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤(€€€€€€€€ü…µ‰É½Í•Q•…µ½µÁ±•Ñ”¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤(€€€€€€€€èÉ½Õ¹‘¥¹…±¥Í•‘½È¡‘…ä°Í•±•Ñ•¤°(€€€€€Í½É¥¹=Á•¸€ôÍ½É¥¹%Í=Á•¸¡‘…ä¤°(€€€€€…¹MÑ…ÉÐ€ô	½½±•…¸ (€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹±½­•€˜˜Ñ••M•±•Ñ¥½¹%Í¥¹…°¡‘…ä¤€˜˜…¬€˜˜¡À€„ô¹Õ±°€˜˜Í½É¥¹=Á•¸°(€€€€€€¤°(€€€€€ÉÕ±•Í=Á•¸€ô	½½±•…¸¡ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉIÕ±•Í=Á•¸¤ì(€€€¡½ÍÐ¹¥¹¹•É!Q50€ô€ñ‘¥Ø±…ÍÌô‰Á±…å•ÉAÉ•Ù¥•ÝQ½Àˆøñ‘¥Øøñ ÈùA±…å•ÈY¥•Üð½ ÈøñÀùA¡½¹”ÁÉ•Ù¥•ÜƒŠPÍ•±•Ð„½±™•ÈÑ¼Í•”•á…Ñ±äÝ¡…ÐÑ¡…ÐÁ±…å•ÈÝ¥±°Í•”¸ð½Àøð½‘¥Øøñ‘¥Ø±…ÍÌô‰Á±…å•ÉAÉ•Ù¥•Ý½¹ÑÉ½±ÌˆøñÍ•±•Ð¥ô‰ÁÉ•Ù¥•ÝA±…å•Èˆø‘í™¥•±¹µ…À ¡¥¤€ôø€ñ½ÁÑ¥½¸Ù…±Õ”ôˆ‘í¥‘ôˆ€‘í¥€ôôôÍ•±•Ñ•€ü€‰Í•±•Ñ•ˆ€è€ˆ‰ôø‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡¥°‘…ä¤ü¹¹…µ”ñð€ˆˆ¥ôð½½ÁÑ¥½¸ù€¤¹©½¥¸ ˆˆ¥ôð½Í•±•Ðø‘í‘…åQ…‰Ì ‰ÁÉ•Ù¥•Ý‘…äˆ°‘…ä¥ôð½‘¥Øøð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰Á¡½¹•M¡•±°ˆøñ‘¥Ø±…ÍÌô‰Á¡½¹•MÉ••¸ˆøñ‘¥Ø±…ÍÌô‰Á±…å•ÉÙ•¹Ñ!•É¼ˆøñÍÁ…¸ù]d=1ð½ÍÁ…¸øñ Äø‘í•ÍŒ¡ÍÑ½É”¹•Ù•¹Ð¹¹…µ”¥ôð½ Äø‘í‘…åÌ€ø€Ä€ü€ñ Ìùd€‘í‘…åôð½ Ìù€€è€ˆ‰ôñÀø‘í•ÍŒ¡Œü¹¹…µ”ñð€‰½ÕÉÍ”ˆ¥ôð½ÀøñÍµ…±°ø‘í•ÍŒ¡™½Éµ…ÑÙ•¹Ñ…Ñ”¡ÍÑ½É”¹•Ù•¹Ð¹‘…Ñ”°‘…ä¤¥ôð½Íµ…±°øð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰•Ù•¹ÑUÁ‘…Ñ•	…¹¹•È€‘íÁÉ•Ù¥•ÝMÑ…”€ü€‰ÁÉ•Ù¥•Üˆ€è€‰™¥¹…°‰ôˆøñˆø‘íÁÉ•Ù¥•ÝMÑ…”€ü€‰Ù•¹ÐAÉ•Ù¥•ÜƒŠP‘•Ñ…¥±Ìµ…ä¡…¹”¸ˆ€è™¥¹…±¥Í•€ü€‰±°M•ÐƒŠrLƒŠPå½ÕÈÍ½É•Ì…É”É•½É‘•¸Q¥µ”Ñ¼Á±…äÑ¡”€ÄåÑ ¸ˆ€è€‰±°M•ÐƒŠrLƒŠP¥¹…°•Ù•¹Ð‘•Ñ…¥±ÌÉ••¥Ù•‰ôð½ˆøñÍÁ…¸ø‘íÁÉ•Ù¥•ÝMÑ…”€ü€‰A±•…Í”¡•¬™½È…¹‘½Ý¹±½…Ñ¡”™¥¹…°•Ù•¹ÐÕÁ‘…Ñ”Ñ¡”‘…ä‰•™½É”Á±…ä¸ˆ€èUÁ‘…Ñ•€‘í•ÍŒ¡¹•Ü…Ñ”¡ÍÑ½É”¹•Ù•¹Ð¹™¥¹…±UÁ‘…Ñ•ÐñðÍÑ½É”¹•Ù•¹Ð¹±½­•‘Ðñð…Ñ”¹¹½Ü ¤¤¹Ñ½1½…±•MÑÉ¥¹œ ‰•¸µTˆ¤¥õôð½ÍÁ…¸øð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰Á±…å•É…Éˆøñ‘¥Ø±…ÍÌô‰Á±…å•É…É‘Q¥Ñ±”ˆùe=UH=1ð½‘¥Øøñ‘¥Ø±…ÍÌô‰Á±…å•É…ÑÌÍ¡•‘Õ±•…ÑÌˆøñ‘¥ØøñÍµ…±°ùA±…å¥¹œQ•”ð½Íµ…±°øñˆø‘íÁÉ•Ù¥•ÝMÑ…”€ü•ÍŒ¡•Ù•¹ÑQ••5…É­•É½±½ÕÈ¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±•Ù•¹Ñ½ÕÉÍ•…Ñ•½Éä¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Í•±•Ñ•¤¤¤€èÑ••M•±•Ñ¥½¹%Í¥¹…°¡‘…ä¤€ü•ÍŒ¡•Ù•¹ÑQ••5…É­•É½±½ÕÈ¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±•Ù•¹Ñ½ÕÉÍ•…Ñ•½Éä¡‘…ä±ÍÑ½É”¹•Ù•¹Ð±Í•±•Ñ•¤¤¤€è€‰Ý…¥Ñ¥¹œ‰ôð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ù…¥±ä!…¹‘¥…Àð½Íµ…±°øñˆø‘í¡À€„ô¹Õ±°€ü•ÍŒ¡™½Éµ…ÑA±…å¥¹!…¹‘¥…À¡¡À¤¤€è€‹ŠP‰ôð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ùMÑ…ÉÑ¥¹œ!½±”ð½Íµ…±°øñˆø‘í•ÍŒ¡ÍÑ…ÉÑQ•áÐ¥ôð½ˆøð½‘¥Øøñ‘¥ØøñÍµ…±°ùQ•”Q¥µ”ð½Íµ…±°øñˆø‘í•ÍŒ¡Ñ••Q¥µ”¥ôð½ˆøð½‘¥Øøð½‘¥Øøð½‘¥Øø(€ñ‘¥Ø±…ÍÌô‰Á±…å•É…Éˆøñ‘¥Ø±…ÍÌô‰Á±…å•É…É‘Q¥Ñ±”ˆøñÍÑÉ½¹œø‘í•ÍŒ¡À¹¹…µ”¥ôð½ÍÑÉ½¹œøƒŠPI=U@€‘íÑà¹É½ÕÁ%¹‘•à€¬€Åôð½‘¥Øøñ‘¥Ø±…ÍÌô‰Á¡½¹•É½ÕÀˆø‘íÉ½ÕÁ9…µ•Ì¹µ…À ¡¸¤€ôø€ñ‘¥Ø±…ÍÌôˆ‘í¸¹¹…µ”€ôôô€‰9¼A…ÉÑ¹•Èˆ€ü€‰¹Àˆ€è€ˆ‰ô€‘íMÑÉ¥¹œ¡¸¹¥¤€ôôôÍ•±•Ñ•€ü€‰å½Ôˆ€è€ˆ‰ô€‘íå•±±½Ý	…±±=¸€˜˜MÑÉ¥¹œ¡¸¹¥¤€ôôôMÑÉ¥¹œ¡½Á•¹¥¹e•±±½Ý	…±±A±…å•È¤€ü€‰å•±±½Ý	…±±QÕÉ¸ˆ€è€ˆ‰ôˆø‘í•ÍŒ¡¸¹¹…µ”¥ôð½‘¥Øù€¤¹©½¥¸ ˆˆ¥ôð½‘¥Øø‘íÁ…ÉÑ¹•È€ü€ñ‘¥Ø±…ÍÌô‰Á¡½¹•A…ÉÑ¹•ÈˆøñÍµ…±°ùe=UH€Ñ		AIQ9Hð½Íµ…±°øñˆ±…ÍÌôˆ‘í¥Í™™•Ñ•€ü€‰ÙÁ9…µ”ˆ€è€ˆ‰ôˆø‘í•ÍŒ¡Á…ÉÑ¹•È¹¹…µ”¥ô‘í¥Í™™•Ñ•€ü€ˆ€¡Y@¤ˆ€è€ˆ‰ôð½ˆøð½‘¥Øù€€è€ˆ‰ôð½‘¥Øø(€‘í½µÁ±•Ñ•É…Ýô(€‘í¥Í™™•Ñ•ñð¥ÍáÑÉ„ñðå•±±½Ý	…±±=¸ñð…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤€ü€ñ‘¥Ø±…ÍÌô‰ÍÁ•¥…±%¹ÍÑÉÕÑ¥½¸ˆøñÍÑÉ½¹œùQ=dLMA%0%9MQIUQ%=9Lð½ÍÑÉ½¹œø‘í…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤€ü€  ¤€ôøì½¹ÍÐÉ½±•Ì€ô…µ‰É½Í•I½±•Ì¡‘…ä°Ñà¹É½ÕÁ%¹‘•à¤°Í½É•É9…µ”€ô•Ù•¹ÑA±…å•È¡É½±•Ì¹Í½É•É%°‘…ä¤ü¹¹…µ”ñð€‰Ñ¡”™¥ÉÍÐ±¥ÍÑ•Á±…å•Èˆ°µ…É­•É9…µ”€ô•Ù•¹ÑA±…å•È¡É½±•Ì¹µ…É­•É%°‘…ä¤ü¹¹…µ”ñð€ˆˆ°É½±”€ôÍ•±•Ñ•€ôôôÉ½±•Ì¹Í½É•É%€üÉ½±•Ì¹µ…É­•É%€üe½Ô…É”Ñ¡”Q•…´M½É•ÈÉ•½É‘¥¹œÑ¡”ÍÑÉ½­•Ì…¹Ý¡½Í”‘É¥Ù”Ý…ÌÑ…­•¸½¸•… ¡½±”¸€‘íµ…É­•É9…µ•ô¥Ìå½ÕÈµ…É­•È¹€€è€‰e½Ô…É”Ñ¡”Q•…´M½É•ÈÉ•½É‘¥¹œÑ¡”ÍÑÉ½­•Ì…¹Ý¡½Í”‘É¥Ù”Ý…ÌÑ…­•¸½¸•… ¡½±”¸9½Ñ”°Ñ¡•É”¥Ì¹¼¡•¬µ…É­•È¥¸Ñ¡¥ÌÙ•¹Ð¸ˆ€èÍ•±•Ñ•€ôôôÉ½±•Ì¹µ…É­•É%€üe½Ô…É”Ñ¡”¡•­¥¹œµ…É­•È¸€‘íÍ½É•É9…µ•ô¥Ìå½ÕÈÍ½É•È¹€€èQ¡”Ñ•…´Í½É•È¥Ì€‘íÍ½É•É9…µ•ô¸‘íÉ½±•Ì¹µ…É­•É%€ü€€‘íµ…É­•É9…µ•ô¥ÌÑ¡”µ…É­•È¹€€è€ˆQ¡•É”¥Ì¹¼¡•¬µ…É­•È¥¸Ñ¡¥ÌÙ•¹Ð¸‰õ€ìÉ•ÑÕÉ¸€ñÀøñˆùµ‰É½Í”èð½ˆø€‘í•ÍŒ¡É½±”¥ô‘íÉ½±•Ì¹µ…É­•É%€˜˜Í•±•Ñ•€„ôôÉ½±•Ì¹Í½É•É%€ü€ˆI•½É½¹”Ñ•…´ÍÑÉ½­”Í½É”…¹Ñ¡”Í•±•Ñ•‘É¥Ù”½¸•Ù•Éä¡½±”ìÑ¡”Í½É•È…¹µ…É­•È…É‘ÌµÕÍÐ…É•”¸ˆ€è€ˆ‰ôð½Àù€ìô¤ ¤€è€ˆ‰ô‘íå•±±½Ý	…±±=¸€ü€ñÀøñˆùe•±±½Ü	…±°èð½ˆø€‘í•ÍŒ¡•Ù•¹ÑA±…å•È¡½Á•¹¥¹e•±±½Ý	…±±A±…å•È°‘…ä¤ü¹¹…µ”ñð€‰Q¡”™¥ÉÍÐÁ±…å•Èˆ¥ôÕÍ•Ì¥Ð½¸!½±”€‘íÍÑ…ÉÑô°Ñ¡•¸¥ÐÉ½Ñ…Ñ•ÌÑ¡É½Õ Ñ¡”Ñ•…´¥¸Ñ¡”½É‘•ÈÍ¡½Ý¸¸Q¡”Á±…å•ÈÝ¡½Í”ÑÕÉ¸¥Ð¥ÌÝ¥±°¡…Ù”Ñ¡•¥È¹…µ”¡¥¡±¥¡Ñ•‰É¥¡Ðå•±±½Ü½¸Ñ¡”Í½É¥¹œÍÉ••¸¸ð½Àù€€è€ˆ‰ô‘í¥Í™™•Ñ•€ü€ñÀø‘í…µ‰É½Í•%Í=¸¡ÍÑ½É”¹•Ù•¹Ð°‘…ä¤€ü€‰Q¡¥Ì¥Ì„Ñ¡É•”µÁ±…å•Èµ‰É½Í”Ñ•…´ì¹¼Ù¥ÉÑÕ…°Í½É”¥ÌÕÍ•¸ˆ€è€‰e½Ô¡…Ù”€ñˆù9¼A…ÉÑ¹•Èð½ˆøÑ½‘…ä°Í¼Ñ¡”Ù¥ÉÑÕ…°Á…ÉÑ¹•È±¥ÍÑ•Ý¥±°ÍÕÁÁ±äÑ¡”µ¥ÍÍ¥¹œÍ½É•Ì¥¸µÕ±Ñ¥Á±…å•È½µÁ•Ñ¥Ñ¥½¹Ì¸‰ôð½Àù€€è€ˆ‰ô‘í¥ÍáÑÉ„€ü€ñÀøñˆù9Q@áÑÉ„M¡½Ðèð½ˆøe½Ôµ…äÁ±…ä€ñˆùÑÝ¼Ñ•”Í¡½ÑÌð½ˆø‘í•áÑÉ…9ÑÁ!½±•Ì¹±•¹Ñ €ü€½¸!½±”€‘í•áÑÉ…9ÑÁ!½±•Ì¹©½¥¸ ˆ…¹!½±”€ˆ¥õ€€è€ˆ½¸•… 9Q@¡½±”Ñ½‘…ä‰ô¸¥Ñ¡•ÈÍ¡½Ðµ…äÅÕ…±¥™ä¸ð½Àù€€è€ˆ‰ôð½‘¥Øù€€è€ˆ‰ô(€ñ‰ÕÑÑ½¸±…ÍÌô‰Á±…å•ÉIÕ±•Í	Ñ¸ˆ¥ô‰Á±…å•ÉIÕ±•Í	Ñ¸ˆù½µÁ•Ñ¥Ñ¥½¹Ì€™…µÀìIÕ±•Ì€ñÍÁ…¸ø‘íÉÕ±•Í=Á•¸€ü€‹Š2ˆ€è€‹Šè‰ôð½ÍÁ…¸øð½‰ÕÑÑ½¸ø‘ì(€€ÉÕ±•Í=Á•¸(€€€€€ü€ñ‘¥Ø±…ÍÌô‰Á±…å•ÉIÕ±•ÍA…¹•°ˆøñ Ðù½µÁ•Ñ¥Ñ¥½¹Ì€ñÍµ…±°ø¡9½Ñ”è±°ÁÉ¥é•Ì…É”ÅÕ½Ñ•Á•ÈÁ±…å•È¤ð½Íµ…±°øð½ Ðøñ‘¥Ø±…ÍÌô‰Á±…å•É½µÁ•Ñ¥Ñ¥½¹1¥ÍÐˆø‘ì (€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹½µÁ•Ñ¥Ñ¥½¹Ìñðmt(€€€€€€€¤(€€€€€€€€€¹™¥±Ñ•È¡¥€ôø½µÁ•Ñ¥Ñ¥½¹%Í=¸¡¥±‘…ä¤¤(€€€€€€€€€¹µ…À ¡¥¤€ôøì(€€€€€€€€€€¥˜€¡l‰Í¥¹±”ˆ°‰½µ‰¥¹•‰t¹¥¹±Õ‘•Ì¡¥¤¤É•ÑÕÉ¸ÍÑ…‰±•™½É‘A±…å•ÉAÉ¥é•Í!Ñµ°¡ÍÑ½É”¹•Ù•¹Ð¤ì(€€€€€€€€€€½¹ÍÐÍ¥¹±•½Éµ…Ð€ô(€€€€€€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Í¥¹±•MÑ…‰±•™½É‘½Éµ…Ðñð(€€€€€€€€€€€€€€€¡ÍÑ½É”¹•Ù•¹Ð¹Ñ•ÍÑ5½‘”€ü€‰…É•…Ñ”ˆ€è€‰‰½Ñ ˆ¤°(€€€€€€€€€€€€±…‰•°€ô(€€€€€€€€€€€€€€¥€ôôô€‰½µ‰¥¹•ˆ(€€€€€€€€€€€€€€€€€üM¥¹±”MÑ…‰±•™½É€ ‘íÍ¥¹±•½Éµ…Ð€ôôô€‰‘…¥±äˆ€ü€‰… …äˆ€èÍ¥¹±•½Éµ…Ð€ôôô€‰‰½Ñ ˆ€ü€‰…¥±ä€¬Ù•¹ÐQ½Ñ…°ˆ€è	•ÍÐ€‘í½Õ¹Ñ¥¹I½Õ¹‘Ì ¥ôÙ•¹ÐQ½Ñ…±ô¥€(€€€€€€€€€€€€€€€€€è¥€ôôô€‰Ñ•…µAÕÑÑÌˆ(€€€€€€€€€€€€€€€€€€€üAÕÑÑ¥¹œ½µÁ•Ñ¥Ñ¥½¸€ ‘íÍÑ½É”¹•Ù•¹Ð¹ÁÕÑÑ¥¹½Éµ…Ð€ôôô€‰Á…¥ÉÌˆ€ü€ˆÈA±…å•Èˆ€è€ˆÐA±…å•È‰ô¥€(€€€€€€€€€€€€€€€€€€€è½µÁ•Ñ¥Ñ¥½¹9…µ•Ím¥‘tñð¥ì(€€€€€€€€€€É•ÑÕÉ¸€ñ‘¥Ø‘…Ñ„µ½µÁ•Ñ¥Ñ¥½¸ôˆ‘í¥‘ôˆøñÍÁ…¸ø‘í•ÍŒ¡±…‰•°¥ôð½ÍÁ…¸øñˆø‘í•ÍŒ¡½µÁ•Ñ¥Ñ¥½¹	•¹•™¥ÑQ•áÐ¡¥°ÍÑ½É”¹•Ù•¹Ð¹‰•¹•™¥ÑÌ¤¥ôð½ˆøð½‘¥Øù€ì(€€€€€€€€ô¤(€€€€€€€€€¹©½¥¸ (€€€€€€€€€€€ˆˆ°(€€€€€€€€€¥ôð½‘¥Øøñ Ðù=Á•É…Ñ¥½¸ð½ Ðøñ‘¥Ø±…ÍÌô‰Á±…å•ÉIÕ±•M•Ñ¥½¸ˆøñÀùe½ÕÈÁ¡½¹”Ý¥±°É•Ñ…¥¸•Ù•ÉäÍ½É”å½Ô•¹Ñ•È‰ÕÐÑÉ…¹Íµ¥ÍÍ¥½¸½˜Ñ¡½Í”Í½É•ÌÑ¼Ñ¡”±•…‘•É‰½…Éµ…ä‰”‘•±…å•¸%˜å½ÕÈÍ½É”¥Ì¹½ÐÉ•™±•Ñ•½¸Ñ¡”±•…‘•É‰½…É°­••ÀÁ±…å¥¹œ°­••ÀÍ½É¥¹œ…¹•¹©½äå½ÕÈÉ½Õ¹¸Q¡”±•…‘•É‰½…ÉÝ¥±°ÕÁ‘…Ñ”¸ð½ÀøñÀøñˆùMÝ¥Á”±•™Ð™½ÈÑ¡”¹•áÐ¡½±”…¹É¥¡Ð™½ÈÑ¡”ÁÉ•Ù¥½ÕÌ¡½±”¸ð½ˆøð½Àøð½‘¥Øøñ ÐùIÕ±•Ìð½ Ðø‘íÉÕ±•M•Ñ¥½¹Ì¹±•¹Ñ €üÉÕ±•M•Ñ¥½¹Ì¹µ…À ¡Í•Ñ¥½¸¤€ôø€ñ‘¥Ø±…ÍÌô‰Á±…å•ÉIÕ±•M•Ñ¥½¸ˆøñˆø‘í•ÍŒ¡Í•Ñ¥½¸¹Ñ¥Ñ±”¥ôð½ˆø‘í•Ù•¹ÑIÕ±•	½‘å!Ñµ°¡Í•Ñ¥½¸¥ôð½‘¥Øù€¤¹©½¥¸ ˆˆ¤€è€ˆñÀù9¼…‘‘¥Ñ¥½¹…°ÉÕ±•Ì…ÁÁ±äÑ¼Ñ¡¥Ì•Ù•¹Ð¸ð½Àø‰ôð½‘¥Øù€(€€€€€è€ˆˆ(ôñ‘¥Ø±…ÍÌô‰Á±…å•É¬ˆøñ‘¥ØøñˆùIÕ±•Ì…­¹½Ý±•‘•µ•¹Ðð½ˆøñÍµ…±°ùI•…Ñ½‘…äÌÉÕ±•Ì‰•™½É”ÍÑ…ÉÑ¥¹œ¸ð½Íµ…±°øð½‘¥Øøñ‰ÕÑÑ½¸¥ô‰Á±…å•É½Ñ%Ðˆ±…ÍÌôˆ‘í…¬€ü€‰‘½¹”ˆ€è€ˆ‰ôˆø‘í…¬€ü€‹ŠrLIÕ±•Ì…­¹½Ý±•‘•ˆ€è€‰=P%P‰ôð½‰ÕÑÑ½¸øð½‘¥Øø(€ñ‰ÕÑÑ½¸±…ÍÌô‰ÍÑ…ÉÑI½Õ¹‘	Ñ¸€‘í™¥¹…±¥Í•€ü€‰½µÁ±•Ñ•‘…É‘	Ñ¸ˆ€è€ˆ‰ôˆ¥ô‰ÍÑ…ÉÑI½Õ¹‘AÉ•Ù¥•Üˆ€‘í™¥¹…±¥Í•ñð…¹MÑ…ÉÐ€ü€ˆˆ€è€‰‘¥Í…‰±•‰ôø‘í™¥¹…±¥Í•€ü€¡l‰¡½±•	å!½±”ˆ°‰™Õ±±…É‘A±…å•È‰t¹¥¹±Õ‘•Ì¡‘…åM½É¥¹5•Ñ¡½¡‘…ä¤¤ü‰Y%\=5A1QM=IIˆè‰Y%\%90M=Iˆ¤€è€…ÍÑ½É”¹•Ù•¹Ð¹±½­•€ü€‰Y9P9=PeP1=-ˆ€è€…Ñ••M•±•Ñ¥½¹%Í¥¹…°¡‘…ä¤€ü€‰]%Q%9=H=I9%MHQ<%91%MQˆ€è¡À€ôô¹Õ±°€ü€‰%1d!9%@9=PMPˆ€è€……¬€ü€‰Q@=P%PQ<=A8Q!M=IIˆ€è€…Í½É¥¹=Á•¸€ü€‰M=I%9=A9L€ÄÔ5%9UQL	=IQ!%IMPQQ%5ˆ€è‘…åM½É¥¹5•Ñ¡½¡‘…ä¤ôôô‰¡½±•	å!½±”ˆ€ü€‰=A8M=IIˆ€è‘…åM½É¥¹5•Ñ¡½¡‘…ä¤ôôô‰™Õ±±…É‘A±…å•Èˆ€ü€‰9QHU10M=IIˆ€è€‰9QH%90M=I‰ôð½‰ÕÑÑ½¸ø‘ì…™¥¹…±¥Í•€˜˜€……¹MÑ…ÉÐ€ü€ñÀ±…ÍÌô‰±½­!¥¹Ðˆø‘ì…Í½É¥¹=Á•¸€˜˜ÍÑ½É”¹•Ù•¹Ð¹±½­•€˜˜Ñ••M•±•Ñ¥½¹%Í¥¹…°¡‘…ä¤€˜˜¡À€„ô¹Õ±°€˜˜…¬€üM½É¥¹œ½Á•¹Ì…Ð€‘í•ÍŒ¡Í½É¥¹=Á•¹¥¹1…‰•°¡‘…ä¤¥ôƒŠP€ÄÔµ¥¹ÕÑ•Ì‰•™½É”Ñ¡”™¥ÉÍÐÑ•”Ñ¥µ”¹€€è€‰Q¡”É½Õ¹½Á•¹ÌÝ¡•¸Ñ¡”•Ù•¹Ð¥Ì±½­•°Ñ¡”Á±…å¥¹œÑ•”¥Ì™¥¹…±¥Í•°å½ÕÈ…¥±ä!…¹‘¥…À¥ÌÍ•Ð…¹å½Ô¡…Ù”…­¹½Ý±•‘•Ñ¡”ÉÕ±•Ì¸‰ôð½Àù€€è€ˆ‰ôð½‘¥Øøð½‘¥Øù€ì(€€€€ ˆÁÉ•Ù¥•ÝA±…å•Èˆ¤¹½¹¡…¹”€ô€¡”¤€ôøì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý%€ô”¹Ñ…É•Ð¹Ù…±Õ”ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•Üˆì(€€€€€Í…Ù” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€ôì(€€€€ ‰m‘…Ñ„µÁÉ•Ù¥•Ý‘…åtˆ¤¹™½É…  (€€€€€€¡ˆ¤€ôø(€€€€€€€€¡ˆ¹½¹±¥¬€ô€ ¤€ôøì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý…ä€ô€­ˆ¹‘…Ñ…Í•Ð¹ÁÉ•Ù¥•Ý‘…äì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý%€ô¹Õ±°ì(€€€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô€‰ÁÉ•Ù¥•Üˆì(€€€€€€€€€Í…Ù” ¤ì(€€€€€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€€€ô¤°(€€€€¤ì(€€€€ ˆÁ±…å•ÉIÕ±•Í	Ñ¸ˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€½¹ÍÐ½±‘Q½À€ô€ ˆÁ±…å•ÉIÕ±•Í	Ñ¸ˆ¤¹•Ñ	½Õ¹‘¥¹±¥•¹ÑI•Ð ¤¹Ñ½Àì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉIÕ±•Í=Á•¸€ô€…ÉÕ±•Í=Á•¸ì(€€€€€Í…Ù” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€½¹ÍÐ¹•Ý	ÕÑÑ½¸€ô€ ˆÁ±…å•ÉIÕ±•Í	Ñ¸ˆ¤ì(€€€€€¥˜€¡¹•Ý	ÕÑÑ½¸¤(€€€€€€€Ý¥¹‘½Ü¹ÍÉ½±±	ä À°¹•Ý	ÕÑÑ½¸¹•Ñ	½Õ¹‘¥¹±¥•¹ÑI•Ð ¤¹Ñ½À€´½±‘Q½À¤ì(€€€ôì(€€€€ ˆÁ±…å•É½Ñ%Ðˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý¬€ôÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý¬ñðíôì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý­m‘…åt€ô(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý­m‘…åtñðíôì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉAÉ•Ù¥•Ý­m‘…åumÍ•±•Ñ•‘t€ôÑÉÕ”ì(€€€€€Í…Ù” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€ôì(€€€€ ˆÍÑ…ÉÑI½Õ¹‘AÉ•Ù¥•Üˆ¤¹½¹±¥¬€ô€ ¤€ôøì(€€€€€¥˜€¡™¥¹…±¥Í•¤ì(€€€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ôl‰¡½±•	å!½±”ˆ°€‰™Õ±±…É‘A±…å•È‰t¹¥¹±Õ‘•Ì¡‘…åM½É¥¹5•Ñ¡½¡‘…ä¤¤€ü€‰½µÁ±•Ñ•ˆ€è€‰™¥¹…±¹ÑÉäˆì(€€€€€€€Í…Ù” ¤ì(€€€€€€€É•ÑÕÉ¸É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€€€ô(€€€€€¥˜€ ……¹MÑ…ÉÐ¤É•ÑÕÉ¸ì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•ÉI½Õ¹‘5½‘”€ô‘…åM½É¥¹5•Ñ¡½¡‘…ä¤€ôôô€‰¡½±•	å!½±”ˆ€ü€‰Í½É¥¹œˆ€è‘…åM½É¥¹5•Ñ¡½¡‘…ä¤€ôôô€‰™Õ±±…É‘A±…å•Èˆ€ü€‰™Õ±±…É‘¹ÑÉäˆ€è€‰™¥¹…±¹ÑÉäˆì(€€€€€ÍÑ½É”¹•Ù•¹Ð¹Á±…å•É!½±•A½Ì€ô€Àì(€€€€€‰•¥¹M½É•…É‘UÁ‘…Ñ•AÉ½Ñ•Ñ¥½¸ ¤ì(€€€€€É•ÅÕ•ÍÑI½Õ¹‘]…­•1½¬ ¤ì(€€€€€Í…Ù” ¤ì(€€€€€É•¹‘•ÉA±…å•ÉáÁ•É¥•¹” ¤ì(€€€ôì(€ô(€¥˜€¡¥¹ÍÑ…±±•‘•É…±I¥‘•!¥ÍÑ½Éå	…Í•±¥¹” ¤¤ÝÉ¥Ñ•1½…±MÑ½É” ¤ì(€É•µ½Ù•I•½É‘•‘Q•ÍÑÙ•¹Ñ!¥ÍÑ½Éä ¤ì(€‰…­™¥±±½µÁ±•Ñ•‘Ù•¹Ñ!¥ÍÑ½Éä ¤ì(€…ÁÁ±å•Ù¥•I½±” ¤ì(€É•¹‘•É!½µ” ¤ì(€É•¹‘•ÉA±…å•ÉÍ‘µ¥¸ ¤ì(€É•¹‘•É½ÕÉÍ•Í‘µ¥¸ ¤ì(€¥¹¥Ñ¥…±¥Í•±½Õ ¤ì(€¥˜€ (€€€€…¥ÍA±…å•É•Ù¥” ¤€˜˜(€€€€…¥ÍÉ•Í¡5½‰¥±••Ù¥” ¤€˜˜(€€€€…Í•ÍÍ¥½¹MÑ½É…”¹•Ñ%Ñ•´ ‰…Ý…å½±™5åÙ•¹ÑÍM¡½Ý¸ÄÔØÈˆ¤(€€¤ì(€€€Í•ÍÍ¥½¹MÑ½É…”¹Í•Ñ%Ñ•´ ‰…Ý…å½±™5åÙ•¹ÑÍM¡½Ý¸ÄÔØÈˆ°€ˆÄˆ¤ì(€€€Í•ÑQ¥µ•½ÕÐ¡½Á•¹5åÙ•¹ÑÌ°€ÄÈÀ¤ì(€ô(€¥˜€  ˆÅÕ¥­)½¥¹Ù•¹Ðˆ¤¤(€€€€ ˆÅÕ¥­)½¥¹Ù•¹Ðˆ¤¹½¹±¥¬€ô€ ¤€ôø(€€€€€±½½­ÕÁ±½Õ‘Ù•¹Ð  ˆÅÕ¥­)½¥¹½‘”ˆ¤ü¹Ù…±Õ”ñð€ˆˆ¤ì(€ÕÁ‘…Ñ••Ù¥•±•…ÉI•½Ù•Éå	ÕÑÑ½¸ ¤ì(€¥˜€  ˆÉ•ÍÑ½É•±•…É•‘=É…¹¥Í•ÉÙ•¹ÑÌˆ¤¤(€€€€ ˆÉ•ÍÑ½É•±•…É•‘=É…¹¥Í•ÉÙ•¹ÑÌˆ¤¹½¹±¥¬€ôÉ•ÍÑ½É•±•…É•‘=É…¹¥Í•ÉÙ•¹ÑÌì(€¥˜€  ˆÅÕ¥­)½¥¹½‘”ˆ¤¤ì(€€€€ ˆÅÕ¥­)½¥¹½‘”ˆ¤¹½¹¥¹ÁÕÐ€ô€¡”¤€ôøì(€€€€€”¹Ñ…É•Ð¹Ù…±Õ”€ô”¹Ñ…É•Ð¹Ù…±Õ”¹É•Á±…” ½my„µèÀ´åt½¤°€ˆˆ¤¹Ñ½UÁÁ•É…Í” ¤ì(€€€€€Í•ÑEÕ¥­)½¥¹MÑ…ÑÕÌ (€€€€€€€”¹Ñ…É•Ð¹Ù…±Õ”¹±•¹Ñ €ôôô€Ø(€€€€€€€€€€ü€‰I•…‘äÑ¼™¥¹å½ÕÈ•Ù•¹Ð¸ˆ(€€€€€€€€€€è€‰¹Ñ•ÈÑ¡”Í¥àµ¡…É…Ñ•È•Ù•¹Ð½‘”¸ˆ°(€€€€€€¤ì(€€€ôì(€€€€ ˆÅÕ¥­)½¥¹½‘”ˆ¤¹½¹­•å‘½Ý¸€ô€¡”¤€ôøì(€€€€€¥˜€¡”¹­•ä€ôôô€‰¹Ñ•Èˆ¤ì(€€€€€€€”¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì(€€€€€€€±½½­ÕÁ±½Õ‘Ù•¹Ð  ˆÅÕ¥­)½¥¹½‘”ˆ¤ü¹Ù…±Õ”ñð€ˆˆ¤ì(€€€€€ô(€€€ôì(€ô(€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰½¹±¥¹”ˆ°€ ¤€ôøì¥˜€ „ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì ‰½Á•¸ˆ¤¤Ù½¥Íå¹5…ÍÑ•É½ÕÉÍ•Ì ¤ìô¤ì(€‘½Õµ•¹Ð¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Ù¥Í¥‰¥±¥Ñå¡…¹”ˆ°€ ¤€ôøì¥˜€ …‘½Õµ•¹Ð¹¡¥‘‘•¸€˜˜€„ ˆµ½‘…±M¡…‘”ˆ¤¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì ‰½Á•¸ˆ¤¤Ù½¥Íå¹5…ÍÑ•É½ÕÉÍ•Ì ¤ìô¤ì(€¥˜€ ‰Í•ÉÙ¥•]½É­•Èˆ¥¸¹…Ù¥…Ñ½È¤ì(€€€¹…Ù¥…Ñ½È¹Í•ÉÙ¥•]½É­•È¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰½¹ÑÉ½±±•É¡…¹”ˆ°€ ¤€ôøì(€€€€€¥˜€¡É•±½…‘¥¹½ÉÁÁUÁ‘…Ñ”ñð€…¹…Ù¥…Ñ½È¹Í•ÉÙ¥•]½É­•È¹½¹ÑÉ½±±•È¤É•ÑÕÉ¸ì(€€€€€¥˜€¡…Ñ¥Ù•M½É•…É‘M•ÍÍ¥½¸ ¤¤ì(€€€€€€€½¹ÑÉ½±±•É¡…¹•‘ÕÉ¥¹M½É•…É€ôÑÉÕ”ì(€€€€€€€Í¡½ÝA•¹‘¥¹ÁÁUÁ‘…Ñ” ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€É•±½…‘¥¹½ÉÁÁUÁ‘…Ñ”€ôÑÉÕ”ì(€€€€€±½…Ñ¥½¸¹É•±½… ¤ì(€€€ô¤ì(€€€¹…Ù¥…Ñ½È¹Í•ÉÙ¥•]½É­•È(€€€€€€¹É•¥ÍÑ•È ‰ÍÜ¹©Ìˆ¤(€€€€€€¹Ñ¡•¸ ¡É•¥ÍÑÉ…Ñ¥½¸¤€ôøì(€€€€€€€Ý…Ñ¡½ÉÁÁUÁ‘…Ñ”¡É•¥ÍÑÉ…Ñ¥½¸¤ì(€€€€€€€É•ÑÕÉ¸É•¥ÍÑÉ…Ñ¥½¸¹ÕÁ‘…Ñ” ¤ì(€€€€€ô¤(€€€€€€¹…Ñ   ¤€ôøíô¤ì(€ô)ô¤ ¤ì