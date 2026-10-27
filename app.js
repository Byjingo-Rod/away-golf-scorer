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
        ? "Screen awake ✓"
        : "Keeping screen awake…";
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
    capTeams: "Black Cap – White Cap",
  };
  const SCORING_METHODS = {
    holeByHole: "On course by players and confirmed by Markers hole-by-hole",
    fullCardPlayer: "Strokes/hole entered by Player",
    finalStableford: "Insert Final Score — Stableford",
    finalGross: "Insert Final Score — Gross Strokes",
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
    // individual/event totals and the Black Cap – White Cap team aggregate.
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
    if (!teams) return `<div class="ntpBox"><b>Black Cap – White Cap</b><p>${locked ? "Cap-team setup is incomplete. Review it before starting a new event; existing scored cap teams cannot be changed." : "Enter a current GA handicap for every selected golfer to balance the cap teams."}</p></div>`;
    const virtual = capVirtualInfo(teams), options = side => teams[side].filter(id => !virtual || String(id) !== virtual.id).map(id => `<option value="${esc(id)}">${esc(player(id)?.name || "Player")}</option>`).join("");
    return `<div class="ntpBox capTeamsEditor"><b>Black Cap – White Cap · all ${event.days || 1} ${(event.days || 1) === 1 ? "day" : "days"}</b><p>${esc(capRulesText(event))}</p>${virtual ? `<p class="capVirtualNote"><b>Fixed Virtual Player: ${esc(player(virtual.id)?.name || "Player")}</b> · ${virtual.side === "black" ? "Black" : "White"} Cap. Their daily Stableford score is copied from the other cap team. A rest day contributes zero. This golfer stays in the other team and cannot be swapped into the short team.</p>` : ""}<div class="capTeamColumns">${["black", "white"].map(side => { const hasVirtual = virtual?.side === side, members = [...teams[side], ...(hasVirtual ? [virtual.id] : [])]; return `<div><h4>${side === "black" ? "Black" : "White"} Cap · ${members.length} players${hasVirtual ? " (including VP)" : ""}</h4><b>GA total: ${members.reduce((n,id) => n + (+eventGaHandicap(id,event) || 0),0).toFixed(1)}</b><ul>${teams[side].map(id => `<li>${esc(player(id)?.name || "Player")} · GA ${esc(eventGaHandicap(id,event))}</li>`).join("")}${hasVirtual ? `<li><b>VP: ${esc(player(virtual.id)?.name || "Player")}</b> · GA ${esc(eventGaHandicap(virtual.id,event))}</li>` : ""}</ul>${!locked ? `<label>Choose golfer to swap<select id="cap-${side}">${options(side)}</select></label>` : ""}</div>`; }).join("")}</div>${locked ? '<small>Cap teams and the virtual player are fixed once the event is locked or scoring has started.</small>' : '<button type="button" class="soft" id="swapCapPlayers">Swap selected golfers</button> <button type="button" class="soft" id="rebalanceCapTeams">Balance GA totals again</button>'}</div>`;
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
      const detail = daily.map(d => `Day ${d.day}: ${d.total == null ? "pending" : d.total + " pts"} (best ${d.count} of ${d.size}${d.playing < d.size ? ` · ${d.size - d.playing} resting` : ""})`).join(" · ") + (virtual?.side === side ? ` · Fixed VP: ${player(virtual.id)?.name || "Player"}` : "");
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
        if (format !== "daily") items.push({id:"stableford-aggregate", name:"Overall Stableford — aggregate round", aggregate:true});
        continue;
      }
      const aggregate = multi && (id === "capTeams" || id === "eclectic" ||
        (id === "par3" && ["overallPlayers", "overallPairs"].includes(par3Mode(event))) ||
        (id === "scratch" && ["aggregate", "bestAggregate"].includes(event.scratchFormat)));
      items.push({id, name:competitionNames[id] + (aggregate ? " — aggregate round" : ""), aggregate});
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
              : item.name.replace(" — aggregate round", ""),
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
      teeColour: `${category === "women" ? "Women" : "Men"} · ${teeMarkerColour(tee, c, category)}`,
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
          if(!rating.valid){issues.push(`${rating.courseName} — ${rating.teeColour}: enter Slope, Scratch Rating and Par in Course Details.`);continue;}
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
  let store;

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
    const missing = (saved.eventWorkspace || []).filter(record => !ids.has(String(record.id)));
    if (!missing.length) return false;
    // Restore missing identities without replacing newer plans or the active draft.
    store.eventWorkspace = current.concat(JSON.parse(JSON.stringify(missing)));

    return true;
  }

  function writeWorkspaceJournal() {
    GolfSafeCloud.storageWrite(
      AWAY_GOLF_WORKSPACE_JOURNAL_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        data: {
          event: store.event ? JSON.parse(JSON.stringify(store.event)) : null,
          eventWorkspace: JSON.parse(
            JSON.stringify(store.eventWorkspace || []),
          ),
          activeEventId: store.activeEventId || null,
          cloud: store.cloud ? JSON.parse(JSON.stringify(store.cloud)) : null,
          cloudPlayers: JSON.parse(JSON.stringify(store.cloudPlayers || [])),
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
      cloudHeader.textContent = "Older tab — close this copy";
      cloudHeader.classList.add("offline");
    }
  }

  function writeLocalStore() {
    if (localStorage.getItem(AWAY_GOLF_WRITER_LEASE_KEY) !== appTabId) {
      markSupersededTab();
      return false;
    }
    restoreWorkspaceFromJournalIfShrunk();
    try {
      GolfSafeCloud.storageWrite("awayGolf13", JSON.stringify(store));
      writeWorkspaceJournal();
    } catch (_) { return false; }
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
        status.textContent=`Estimated GA ${ga<0 ? "+" : ""}${Math.abs(ga).toFixed(1)} calculated from Day ${d} · ${rating.courseName} · ${rating.teeColour} tee · playing handicap ${handicap<0 ? "+" : ""}${Math.abs(handicap)}. This is an event estimate, not an official GA.`;
      }catch(error){$("#subGa").value="";$("#subGaPlus").checked=false;status.textContent=error.message || String(error);}
    }
    function updateTees(){const d=+$("#subEstimateDay").value;$("#subEstimateTee").innerHTML=enabledEventTees(store.event,d).map(tee=>`<option value="${tee}">${EVENT_TEE_LABELS[tee]} — ${esc(teeMarkerColour(tee,course(store.event['course'+d])))}</option>`).join("");$("#subEstimateTee").value=selectedEventTee(d);if($("#subEstimate").value!=="")calculateEstimate();}
    $("#subProfile").onchange=()=>{
      const p=store.players.find(p=>String(p.id)===$("#subProfile").value),input=$("#subName");
      input.value="";input.disabled=Boolean(p);input.placeholder=p ? "Clear the saved-player selection above to enter a new player" : "Enter a new player’s name";
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
    $("#modalContent").innerHTML=`<div class="substituteForm"><h2>Replace Player — Day ${day} onward</h2><p>The substitute takes the same groups, partnerships, tees and starting positions. Earlier cards stay unchanged. Both golfers’ scores count together for aggregate competitions.</p><label class="substituteField"><strong>Player being replaced</strong><select id="subSlot">${ids.map(id=>`<option value="${esc(id)}">${esc(eventPlayerName(id,day))}</option>`).join("")}</select></label><label class="substituteField"><strong>Substitute from the existing Player List</strong><small>Open this list to choose a saved player. Leave it blank to add a new player below.</small><select id="subProfile"><option value="">Choose a player from this list - or insert the name of new player in the cell below</option>${eligible.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label><label class="substituteField"><strong>Name of a New Player</strong><input id="subName" autocomplete="name" placeholder="Enter a new player’s name"></label><fieldset class="substituteSection"><legend><strong>Golf ID / GolfLink Number</strong></legend><div class="substituteColumns"><label class="substituteField"><strong>Insert GolfLink / ID No</strong><input id="subGolfId" inputmode="numeric" aria-label="Golf ID or GolfLink number"></label><label class="substituteChoice"><input type="checkbox" id="subNoOfficial"><span><strong>Or click here if the replacement player doesn’t have a GolfLink / ID No</strong><small>No Golf ID / GolfLink Number — recorded as No Official Handicap.</small></span></label></div></fieldset><label class="substituteField"><strong>Handicap category</strong><select id="subCategory"><option value="men">Men</option><option value="women">Women</option></select></label><div class="substituteColumns substituteHandicaps"><section class="substituteSection"><div class="substituteField"><label for="subGa"><strong>GA Handicap</strong></label><div class="substituteSigned"><input id="subGa" type="number" inputmode="decimal" min="0" max="54" step="0.1" placeholder="GA"><label class="substitutePlus"><input type="checkbox" id="subGaPlus"> Plus</label></div></div><small>Enter the number normally. Tick Plus for a plus handicap.</small></section><section class="substituteSection"><div class="substituteField"><label for="subEstimate"><strong>Insert Substitute Player’s Estimated Handicap</strong></label><div class="substituteSigned"><input id="subEstimate" type="number" inputmode="numeric" min="0" max="54" step="1" placeholder="Playing handicap"><label class="substitutePlus"><input type="checkbox" id="subEstimatePlus"> Plus</label></div></div><label class="substituteField"><strong>Estimate for this course</strong><select id="subEstimateDay">${eventDays().filter(d=>d>=day).map(d=>`<option value="${d}">Day ${d} — ${esc(course(store.event['course'+d])?.name || "Course")}</option>`).join("")}</select></label><label class="substituteField"><strong>Tee used for the estimate</strong><select id="subEstimateTee"></select></label></section></div><p id="subEstimateStatus" class="substituteEstimateStatus" role="status"></p><p id="subPreview" role="status"></p><div class="substituteActions"><button class="primary" id="applyRealSubstitute">Review and Send Substitution</button><button class="soft" id="cancelRealSubstitute">Close</button></div></div>`;
    $("#modalShade").classList.add("open");
    const form=bindSubstituteForm(day);
    $("#cancelRealSubstitute").onclick=()=>$("#modalShade").classList.remove("open");
    $("#applyRealSubstitute").onclick=async()=>{
      const button=$("#applyRealSubstitute");button.disabled=true;
      try {
        const slot=$("#subSlot").value, {replacement,existing}=form.read();
        const next=GolfPlayerSubstitution.prepare(store.event,slot,replacement,day,substitutionOptions(day,slot)),
          preview=eventDays(next).filter(d=>d>=day).map(d=>`Day ${d}: ${Object.entries(next.teeHandicaps['day'+d]).filter(([tee])=>enabledEventTees(next,d).includes(tee)).map(([tee,map])=>tee+" "+map[slot]).join(" · ")}`).join("\n");
        $("#subPreview").textContent=preview;
        if (!confirm(`Replace ${eventPlayerName(slot,day)} with ${replacement.name} from Day ${day}?\nGA ${replacement.ga}\n${preview}\n\nEarlier scores are retained and count with the substitute’s scores for aggregates. The previous phone connection will be released.`)) return;
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
        issues.push(`Hole ${i + 1}: handicap index must begin with 1–18.`);
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
        issues.push(`Hole ${i + 1}: secondary handicap index must be 19–36 after the primary index.`);
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
  // missing index 10 so the women's card remains a valid 1–18 sequence.
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
    cloudMessage = "Connecting securely…",
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
      store.cloud?.role === "player" &&
      store.event?.playerRoundMode === "scoring"
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
      const label=path=>path.map((key,i)=>i===0&&/^([1-9]|1[0-8])$/.test(key)?"Hole "+key:key).join(" · ");
      const value=v=>v===undefined?"Removed":JSON.stringify(v);
      $("#modalContent").innerHTML=`<h2>Review Saved Copies</h2><p>${row.kind==="score"?esc(player(row.player_id)?.name||row.player_id)+" · Day "+row.day:"Event plan"} · ${rows.length} review${rows.length===1?"":"s"} outstanding</p><p>Independent changes are combined. Choose the correct value for each difference. Both original copies are retained.</p><div class="rowBtns"><button class="primary" id="keepIncomingSafeReviews">Keep Incoming Device Copy for All ${rows.length===1?"Differences":"Reviews"}</button><button class="soft" id="keepOnlineSafeReviews">Keep Online Copy for All ${rows.length===1?"Differences":"Reviews"}</button></div><p class="hint"><b>Incoming device</b> is the copy retained on the phone or tablet that made the unsent changes. <b>Online copy</b> is the version already visible to the organiser.</p><div style="overflow:auto;max-height:45vh"><table><thead><tr><th>Field</th><th>Incoming device</th><th>Online copy</th><th>Keep</th></tr></thead><tbody>${comparison.conflicts.map((field,i)=>`<tr><td>${esc(label(field.path))}</td><td>${esc(value(field.local))}</td><td>${esc(value(field.remote))}</td><td><select data-safechoice="${i}"><option value="">Choose…</option><option value="local">Incoming device</option><option value="remote">Online copy</option></select></td></tr>`).join("")}</tbody></table></div><p id="safeReviewStatus" role="status"></p><button class="primary" id="saveSafeReview">Save Reviewed Copy</button><button class="soft" id="closeSafeReview">Close</button>`;
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
              playerPreviewAck: store.event?.playerPreviewAck || {},
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
      if (!ownActiveRound || AwayCloud.reconcile)
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
    setCloudMessage("Releasing player connection…", true);
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
    setCloudMessage("Releasing all phone connections…", true);
    try {
      for (const row of joined)
        await AwayCloud.releasePlayer(store.cloud.eventId, row.playerId);
      cloudBusy = false;
      await syncCloudNow();
      setCloudMessage("All phones released · ready to join");
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
        `Leave ${eventName} on this device and enter a different event code?\n\nScores already sent remain safe online. Unsent scores will not automatically appear when you rejoin. A local safety copy will be kept on this device; download an Organiser Backup first if scores have not synced.`,
      )
    )
      return;
    try {
      if (store.event) {
        localStorage.setItem("awayGolfBeforeLeavingPlayerEvent", JSON.stringify({savedAt:new Date().toISOString(),event:store.event,cloud:store.cloud,players:store.players,courses:store.courses}));
        captureCurrentEvent();
        if (writeLocalStore() === false) throw new Error("Another app tab controls this device's saved data.");
      }
    } catch (error) {
      alert("Could not back up your phone scores. Stay in this event and download a backup before leaving.");
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
    setCloudMessage("Previous event left · enter the new code");
    const quickCode = $("#quickJoinCode");
    if (quickCode) quickCode.value = "";
    setQuickJoinStatus("Enter the six-character event code.");
    requestAnimationFrame(() => quickCode?.focus());
  }
  async function syncCloudNow() {
    if (!store.cloud?.eventId || cloudBusy) return false;
    const connection = store.cloud;
    setCloudMessage("Synchronising…", true);
    try {
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
        `Live · updated ${new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`,
      );
      return bundle;
    } catch (error) {
      if (store.cloud !== connection) return false;
      if (isGuestOrganiser() && !(await verifyGuestOrganiserAccess())) return false;
      setCloudMessage(
        navigator.onLine
          ? "Sync delayed — use Retry Sync"
          : "Offline — scores remain saved on this phone",
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
    closeCloudConnection();
    store.event = null;
    delete store.cloud;
    store.cloudPlayers = [];
    writeLocalStore();
    applyDeviceRole();
    renderHome();
    renderPlayerExperience();
    renderLeaderboard();
    nav("home");
    setCloudMessage("Completed event archived · ready for the next event");
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
    setCloudMessage("Publishing event…", true);
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
      setCloudMessage(store.event.locked ? "All Set · final event published" : "Event Preview published");
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
    setCloudMessage("Updating event…", true);
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
        setCloudMessage("Newer final update received — review before sending");
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
      setCloudMessage(store.event.locked ? "All Set · final update shared" : "Preview changes shared");
      return true;
    } catch (error) {
      setCloudMessage("Update delayed — use Retry Sync");
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
    setQuickJoinStatus("Finding your event…");
    const quickButton = $("#quickJoinEvent");
    if (quickButton) quickButton.disabled = true;
    setCloudMessage("Finding event…", true);
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
        `<h2>Join ${esc(rows[0].event_name)}</h2><p>Select your own name to score, or watch the event without making any changes.</p><label>Your name<select id="cloudJoinPlayer"><option value="" selected>Select your name here</option>${rows.map((r) => `<option value="${esc(r.player_id)}">${esc(r.display_name)}${r.already_joined ? " — previously connected" : " — available"}</option>`).join("")}</select></label><div class="rowBtns" style="margin-top:14px"><button class="primary" id="confirmCloudJoin" disabled>Join or Reconnect</button><button class="soft" id="watchCloudEvent">Watch as Spectator</button><button class="soft" id="cancelCloudJoin">Cancel</button></div>`;
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
          setCloudMessage("Watching live · read only");
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
            setCloudMessage("Joined · live scoring connected");
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
    setCloudMessage("Recovering published event…", true);
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
    setCloudMessage("Opening published event…", true);
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
      '<h2>Published Events</h2><p class="publishedEventsHelp">Loading your five most recent published events…</p>';
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
        `<h2>Published Events</h2><p class="publishedEventsHelp">These details have been checked against the actual event stored online.</p>${events.length ? `<div class="publishedEventList">${events.map((x) => `<div class="publishedEventChoice ${x.mismatch ? "mismatch" : ""} ${x.readable ? "" : "unreadable"}"><button data-openpublishedevent="${esc(x.id)}" data-joincode="${esc(x.join_code || "")}" data-eventname="${esc(x.name || "Away Golf Event")}" ${x.readable ? "" : "disabled"}><span><b>${esc(x.name || "Away Golf Event")}</b><small>${x.join_code ? `Join code ${esc(x.join_code)} · ` : ""}${x.event_date ? `${esc(formatEventDate(x.event_date))} · ` : ""}${x.field_size ? `${esc(x.field_size)} players` : x.updated_at ? `Updated ${new Date(x.updated_at).toLocaleDateString("en-AU")}` : "Published event"}</small>${x.mismatch ? `<em>Warning: old cloud label “${esc(x.cloud_name)}” did not match the actual event contents.</em>` : ""}${x.readable ? "" : "<em>The stored event contents could not be read.</em>"}</span><strong>Open →</strong></button><button class="archivePublishedEvent" data-archivepublishedevent="${esc(x.id)}" data-archivename="${esc(x.name || "Away Golf Event")}">Archive</button></div>`).join("")}</div>` : '<p class="publishedEventsError">No published events were found for this organiser copy.</p>'}<section class="organiserTabletConnect"><h3>Connect this tablet as an organiser</h3><p>Use the two codes shown by the organiser PC. This is separate from joining as a player.</p><div><input id="tabletEventCode" maxlength="6" placeholder="Player event code"><input id="tabletOrganiserCode" maxlength="8" placeholder="Organiser access code"><button class="primary" id="claimOrganiserTablet">Connect Tablet</button></div></section><button class="soft" id="closePublishedEvents">Close</button>`;
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
            button.textContent = "Archiving…";
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
    setCloudMessage("Opening past results…", true);
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
      '<h2>Past Events</h2><p class="publishedEventsHelp">Loading retained past events…</p>';
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
        `<h2>Past Events</h2><p class="publishedEventsHelp">Open a retained event to review its saved final results. Events whose actual stored name begins with TEST are excluded.</p>${events.length ? `<div class="publishedEventList">${events.map((x) => `<div class="publishedEventChoice"><button data-openpastevent="${esc(x.id)}" data-eventname="${esc(x.name)}"><span><b>${esc(x.name)}</b><small>${x.event_date ? `${esc(formatEventDate(x.event_date))} · ` : ""}${x.field_size ? `${esc(x.field_size)} players` : "Past event"}</small></span><strong>Open Results →</strong></button></div>`).join("")}</div>` : '<p class="publishedEventsError">No retained non-TEST past events were found.</p>'}<button class="soft" id="closePastEvents">Close</button>`;
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
    event.name = `${event.name || "Away Golf Event"} — Copy`;
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
      return `<article class="myEventCard ${current ? "current" : ""} ${record.archived ? "archived" : ""}"><div class="myEventSummary"><small>${current ? "CURRENT EVENT" : record.archived ? "ARCHIVED" : eventWorkspaceStatus(event)}</small><h3>${esc(event.name || "Untitled Away Golf Event")}</h3><p>${event.date ? esc(formatEventDate(event.date)) : "Date not set"} · ${players} player${players === 1 ? "" : "s"} · ${esc(eventWorkspaceStatus(event))}</p></div><div class="myEventActions"><button class="primary" data-continueevent="${esc(record.id)}">${eventWorkspaceStatus(event) === "Draft" ? "Continue Setup" : "Open Event"}</button><button class="soft" data-duplicateevent="${esc(record.id)}">Duplicate</button><button class="soft" data-archiveevent="${esc(record.id)}">${record.archived ? "Restore" : "Archive"}</button><button class="danger" data-deleteevent="${esc(record.id)}">Delete</button></div></article>`;
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
    if (preserveCurrent) localStorage.setItem(PRE_IMPORT_BACKUP_KEY, JSON.stringify(organiserBackupPayload()));
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
      ? "Owner Signed In ✓"
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
    $("#modalContent").innerHTML = '<div class="ownerAccountLoading"><b>Checking Owner Organiser sign-in…</b></div>';
    $("#modalShade").classList.add("open");
    const account = await refreshOwnerAccount();
    if (!account) {
      $("#modalContent").innerHTML = '<div class="ownerAccountHead"><small>OWNER ORGANISER</small><h2>Owner Sign-In</h2><p>The secure account service could not be reached. Check the internet connection and try again.</p></div><div class="ownerAccountActions"><button class="soft" id="ownerAccountDone">Close</button></div>';
      $("#ownerAccountDone").onclick = () => $("#modalShade").classList.remove("open");
      return;
    }
    if (account.permanent) {
      $("#modalContent").innerHTML = `<div class="ownerAccountHead"><small>OWNER ORGANISER</small><h2>Owner Signed In ✓</h2><p>This organiser is permanently protected.</p></div><div class="ownerIdentityCard"><span>OWNER EMAIL</span><b>${esc(account.email)}</b><p>Published events can be recovered after signing in on a replacement computer. Draft planning remains on this PC unless you make an Organiser Backup.</p></div><div class="ownerAccountActions"><button class="primary" id="ownerPublishedEvents">Open Published Events</button><button class="soft" id="ownerAccountDone">Close</button></div>`;
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
        resend.textContent = "Sending…";
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
      send.textContent = "Sending…";
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
        button.textContent = "Sending…";
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
    $("#modalContent").innerHTML = `<h2>Organiser Backup</h2><p>Move your complete planning setup between the Windows folder, desktop app and tablet—or keep an emergency copy.</p><div class="backupSummary"><div><small>PLAYERS</small><b>${activeCount}</b></div><div><small>COURSES</small><b>${courseCount}</b></div><div><small>CURRENT EVENT</small><b>${esc(store.event?.name || "None")}</b></div></div><div class="backupActions"><button class="primary" id="exportOrganiserBackup">Download Backup File</button><label class="backupImportLabel">Import Backup File<input type="file" id="importOrganiserBackup" accept="application/json,.json"></label>${safety ? '<button class="soft" id="undoOrganiserImport">Undo Last Import</button>' : ""}<button class="soft" id="closeOrganiserBackup">Close</button></div><p class="backupSafetyNote"><b>Safe import:</b> Away Golf automatically keeps a copy of the setup currently on this device before replacing it. Online published events and join codes are deliberately not transferred.</p>`;
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
      setCloudMessage("Creating organiser access…", true);
      const code = await AwayCloud.createOrganiserKey(store.cloud.eventId);
      cloudBusy = false;
      setCloudMessage("Live · organiser access ready");
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
      $("#claimOrganiserTablet").textContent = "Connecting…";
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
    button.textContent = "Opening…";
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
      button.textContent = "Creating…";
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
    $("#modalContent").innerHTML = `<div class="ownerAccountHead"><small>SINGLE-EVENT DELEGATION</small><h2>Guest Organiser</h2><p>Give another person the normal Away Golf setup and operation pages for <b>${esc(store.event?.name || "this event")}</b>—and no other event.</p></div><div class="ownerAccountNotice"><b>You remain the Owner Organiser.</b><span>The guest cannot create a different event, access your other events, create organiser-tablet codes, or use your Owner account. Closing the event automatically ends their access.</span></div><div class="ownerAccountActions"><button class="primary" id="createGuestOrganiserInvitation">Create Guest Invitation</button><button class="danger" id="revokeGuestOrganiser">Revoke Existing Guest Access</button><button class="soft" id="closeGuestOrganiser">Cancel</button></div>`;
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
        ? "Saved on phone · syncing online…"
        : "Score saved on phone · offline",
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
          return AwayCloud.saveRound(eventId,+day,String(playerId),snapshot,{correction:connection.role==="organiser",reason:"Organiser score entry or Emergency Recovery"});
        });
    cloudRoundChains.set(key, saving);
    try {
      const result = await saving;
      if (store.cloud !== connection || result === false) return false;
      if (cloudRoundChains.get(key) === saving) cloudRoundChains.delete(key);
      if(result?.saved_data) {
        const latest=scorerStore(day,playerId);
        scoringDayStore(day)[String(playerId)]=GolfSafeCloud.merge(snapshot,latest,result.saved_data).data;
        writeLocalStore();
      }
      setCloudMessage("Hole saved online ✓");
      return true;
    } catch (error) {
      if (store.cloud !== connection) return false;
      if (cloudRoundChains.get(key) === saving) cloudRoundChains.delete(key);
      if(error.code==="GOLF_CONFLICT" || /GOLF_CLOSED/.test(error.message||"")) {
        setCloudMessage(error.code==="GOLF_CONFLICT"?"Saved copies need organiser review":"Card accepted · local copy retained");
        return false;
      }
      if (error.code === "AWAY_AUTH_EXPIRED")
        setCloudMessage("Scores safe on phone · secure connection retrying");
      else
        setCloudMessage("Saved on phone · online sync will retry");
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
      : "Connecting…";
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
      host.innerHTML = `<div class="organiserModeBanner"><b>${guest ? "Guest Organiser — this event only" : "This device is in Organiser Mode"}</b><button class="soft" id="leaveOrganiserMode">${guest ? "Leave Guest Event" : "Leave Organiser Mode and Join as a Player"}</button></div><div class="cloudPanelHead"><div><small>${store.event?.locked ? "ALL SET — FINAL EVENT" : "EVENT PREVIEW"}</small><h3>${esc(store.event?.name || "Away Golf Event")}</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div><div class="joinCodeDisplay"><span>PLAYER JOIN CODE</span><b>${esc(store.cloud.joinCode || "——")}</b></div><div class="cloudActions"><button class="${finalUpdateSent ? "finalUpdateSent" : "primary"}" id="updateCloudEvent" ${cloudBusy ? "disabled" : ""}>${finalUpdateSent ? "Final Update Sent ✓" : store.event?.locked ? "Send All Set — Final Update" : "Share Preview Changes"}</button><button class="soft" id="updateGaHandicaps" ${cloudBusy || scoringStarted ? "disabled" : ""}>${scoringStarted ? "GA Handicaps Locked — Scoring Started" : "Update GA Handicaps"}</button><button class="soft" id="retryCloud" ${cloudBusy ? "disabled" : ""}>${retryNeeded ? "Retry Sync" : "Refresh Scores"}</button>${guest ? "" : `<button class="soft" id="guestOrganiserInvite" ${cloudBusy ? "disabled" : ""}>Delegate This Event</button><button class="soft" id="organiserTabletCode" ${cloudBusy ? "disabled" : ""}>Connect Organiser Tablet</button>`}<button class="soft" id="reviewSafeCopies">Review Saved Copies</button><button class="soft" id="resetCloudPlayers" ${cloudBusy || !connections.length ? "disabled" : ""}>Release All Phones</button></div><div class="connectedPlayers"><div><b>Connected Players</b><span>${connections.length} of ${(store.cloudPlayers || []).length} joined</span></div>${connections.map((x) => `<div class="connectedPlayer"><span><i></i>${esc(x.name)}</span><button class="soft" data-releaseplayer="${esc(x.playerId)}" ${cloudBusy ? "disabled" : ""}>Release Phone</button></div>`).join("") || '<p class="hint">No players have joined yet.</p>'}</div><div class="connectedSpectators"><b>Spectators watching this event</b><span>${+(store.cloudSpectatorCount || 0)}</span></div>`;
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
      host.innerHTML = `<div class="cloudPanelHead"><div><small>JOINED AS</small><h3>${esc(player(store.cloud.playerId)?.name || "Player")}</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div><p>Your phone is connected to <b>${esc(store.event?.name || "the Away Golf event")}</b>. Scores are saved locally first and shared automatically.</p><div class="cloudActions"><button class="primary" id="openMyCard">Open Scoring Card</button>${retryButton}<button class="soft leavePlayerEvent" id="leavePlayerEvent">Leave This Event and Join Another</button></div>`;
      $("#openMyCard").onclick = () => nav("scorePage");
      if ($("#retryCloud")) $("#retryCloud").onclick = syncCloudNow;
      $("#leavePlayerEvent").onclick = leavePlayerEvent;
      return;
    }
    if (store.cloud?.role === "spectator" && store.cloud.eventId) {
      host.innerHTML = `<div class="cloudPanelHead"><div><small>SPECTATOR VIEW</small><h3>${esc(store.event?.name || "Away Golf Event")}</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div><p>You are watching this event live. Spectator View is read only and cannot alter scores, players, prizes or event settings.</p><div class="cloudActions"><button class="primary" id="openSpectatorLeaderboard">View Live Leaderboard</button><button class="soft" id="refreshSpectator">Refresh</button><button class="soft leavePlayerEvent" id="leaveSpectatorEvent">Leave This Event</button></div>`;
      $("#openSpectatorLeaderboard").onclick = () => nav("leaderboardPage");
      $("#refreshSpectator").onclick = syncCloudNow;
      $("#leaveSpectatorEvent").onclick = leavePlayerEvent;
      return;
    }
    host.innerHTML = `<div class="cloudPanelHead"><div><small>SHARED EVENT</small><h3>Connect players' phones</h3></div><span class="cloudState">${esc(cloudMessage)}</span></div><div class="cloudActions">${store.event ? `<button class="primary" id="publishCloudEvent">${store.event.locked ? "Publish Final Event" : "Publish Event Preview"}</button><p class="hint">${store.event.locked ? "Publish the final locked details for scoring." : "Players can join now to see the provisional arrangements. Use the same code for the final update."}</p>` : ""}${retryButton}</div>${!store.event ? `<div class="organiserCopyNotice"><b>Looking for an event you already published?</b><span>Reopen the same Away Golf browser tab or app copy that was used to create the event. Your organiser event will reopen automatically there.</span><span>The player joining code is for players only and cannot recover organiser control in a different browser or app copy.</span></div>` : ""}<form class="joinEventRow" id="joinEventForm"><input id="joinCode" maxlength="6" autocapitalize="characters" inputmode="text" enterkeyhint="go" placeholder="6-character event code"><button type="submit" class="primary" id="lookupCloudEvent" ${cloudBusy ? "disabled" : ""}>${cloudBusy ? "Finding Event…" : "Join as a Player"}</button></form><p class="panelJoinStatus ${/could not|too long|offline/i.test(cloudMessage) ? "error" : ""}" aria-live="polite">${esc(cloudBusy ? "Contacting Away Golf — please wait…" : /could not|too long/i.test(cloudMessage) ? cloudMessage + ". Check the code and internet connection, then try again." : "Enter the six-character code supplied by your organiser.")}</p>`;
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
      setCloudMessage("Offline — local scoring available");
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
    try { expireRetainedTestData(); }
    catch (error) { console.warn("Old TEST-event storage could not be expired", error); }
    const limited=isPlayerDevice() || isSpectatorDevice();
    const rows=GolfSafeCloud.storageRecords(),panel=$("#modalContent"),retainedTest=retainedTestEvent();
    const activeStorageEventId=String(store.cloud?.eventId||"");
    const retiredTestEventIds=[...new Set(rows.filter(row=>String(row.eventId)!==activeStorageEventId&&isTestEventName({name:row.name||""})).map(row=>String(row.eventId)).filter(Boolean))];
    const retiredTestRows=rows.filter(row=>retiredTestEventIds.includes(String(row.eventId)));
    const inventory=[];let total=0,exported=false;
    const hasProtectedWork=rows.some(row=>row.pending || row.status.includes("review"));
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i),value=localStorage.getItem(key)||"",bytes=2*(key.length+value.length);total+=bytes;
      let label=key==="golfSafeSaves.v1"?"Saved online copies and pending uploads":/PreImportBackup|PreDeviceClearBackup|BeforeLeavingPlayerEvent|TestBackup|RidgeTestBackup/.test(key)?"Retained safety backup":/13$/.test(key)?"Players, courses and event workspace":/course/i.test(key)?"Course data":/auth|token|Connections/i.test(key)?"Sign-in and event connections":"App settings and saved information";
      if(label==="Retained safety backup"){
        const kind=/PreImport/.test(key)?"Before import":/PreDeviceClear/.test(key)?"Before device cleanup":/BeforeLeaving/.test(key)?"Before leaving event":/Ridge/.test(key)?"Ridge test":"Earlier test";
        try{const snapshot=JSON.parse(value);label+=" — "+kind+(snapshot.event?.name?" · "+snapshot.event.name:"")+(snapshot.savedAt?" · "+new Date(snapshot.savedAt).toLocaleDateString("en-AU"):"");}catch{label+=" — "+kind+" (unreadable; protected)";}
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
    const label=row=>`${row.eventId===store.cloud?.eventId?store.event?.name||row.name:row.name}${row.kind==="score"?" · Day "+row.day+" · "+(player(row.playerId)?.name||row.playerId):" · Event plan"}`;
    const currentIsTest=Boolean(store.event&&(store.event.testMode||store.event.ridgeTestMode||isTestEventName(store.event)));
    const mayDiscard=row=>Boolean(row.pending&&row.status==="Waiting to upload"&&(row.eventId!==store.cloud?.eventId||currentIsTest));
    panel.innerHTML=`<section class="appStoragePage"><h2>App Storage</h2><p>This browser’s local app data: <b>${size(total)}</b>. This is separate from the tablet’s total storage. The warning starts at 4 MB; it is an estimate, not a measured storage limit.</p><p>${limited?"This player-phone view safely identifies work waiting to upload. Old work and explicitly named TEST-event copies may be deliberately discarded.":"Cleanup removes local copies only. Your current genuine event, players, courses and cloud events are protected."}</p>${retainedTest?`<div class="storageTestCleanup"><b>${esc(retainedTest.name)}</b><p>This abandoned TEST-event copy is not required online. TEST data expires automatically 24 hours after leaving the event.</p><button class="danger" id="deleteRetainedTestData">Delete Test Data Now</button></div>`:""}${retiredTestRows.length?`<div class="storageTestCleanup"><b>Retired TEST-event data</b><p>${retiredTestRows.length} protected ${retiredTestRows.length===1?"copy belongs":"copies belong"} to a TEST event that is no longer open. Genuine events are not included.</p><button class="danger" id="deleteRetiredTestRecords">Remove Retired Test Data</button></div>`:""}<div class="rowBtns">${isSpectatorDevice()?"":'<button class="primary" id="storageExport">Download App Storage Backup</button>'}<button class="soft" id="storageRefresh">Refresh Storage</button><button class="soft" id="storageClose">Close</button></div><p id="storageMessage" role="status"></p><h3>Stored information</h3><table><thead><tr><th>Information</th><th>Space used</th><th>Action</th></tr></thead><tbody>${inventory.sort((a,b)=>b.bytes-a.bytes).map((r,index)=>`<tr><td>${esc(r.label)}</td><td>${size(r.bytes)}</td><td>${!limited&&r.removable?`<button class="soft" data-storagebackup="${index}" ${r.testBackup?"": "disabled"}>${r.testBackup?"Remove Test Backup":"Remove Backup Copy"}</button>`:"Protected"}</td></tr>`).join("")}</tbody></table><h3>Saved cards and plans</h3><p>Waiting to upload means a local change has not yet been confirmed online. Genuine current-event cards remain protected.</p>${rows.map((row,index)=>`<article class="storageRecord"><b>${esc(label(row))}</b><p>${esc(row.status)} · ${size(row.bytes)}</p>${row.pending && row.status==="Waiting to upload"?`<button class="primary" data-storageretry="${index}" ${row.eventId!==store.cloud?.eventId?"disabled":""}>Retry Upload</button>${mayDiscard(row)?`<button class="danger" data-storagediscard="${index}">Discard This Unsent Copy</button>`:""}`:""}${!limited&&row.removable?`<button class="danger" data-storageremove="${index}">Remove Local Copy</button>`:`<span>Protected</span>`}</article>`).join("")||"<p>No saved card or plan copies.</p>"}<p>${limited?"Current genuine-event work cannot be deleted. TEST-event data requires two confirmations before it is discarded.":"Retained safety backups are included in the download above. Confirmed online copies expire after 30 days; abandoned TEST-event data expires after 24 hours."}</p></section>`;
    $("#modalShade").classList.add("open");
    $("#storageClose").onclick=()=>$("#modalShade").classList.remove("open");
    $("#storageRefresh").onclick=openAppStorage;
    if($("#deleteRetainedTestData"))$("#deleteRetainedTestData").onclick=()=>{if(!confirm(`Delete the abandoned local data for ${retainedTest.name}?\n\nIt will not be uploaded. Genuine events, players, courses and cloud results are unchanged.`))return;try{removeRetainedTestData(retainedTest);openAppStorage();$("#storageMessage").textContent="Test data removed. The Jerry upload warning is cleared.";}catch(error){$("#storageMessage").textContent="Test data was not removed: "+error.message;}};
    if($("#deleteRetiredTestRecords"))$("#deleteRetiredTestRecords").onclick=()=>{if(!confirm(`Remove ${retiredTestRows.length} protected local ${retiredTestRows.length===1?"copy":"copies"} from retired TEST events?\n\nNo genuine event, player, course or cloud result will be changed.`))return;if(!confirm("Final check: permanently remove this retired TEST-event recovery data from this device?"))return;try{let removed=0;retiredTestEventIds.forEach(id=>{removed+=GolfSafeCloud.discardTestEvent(id);});openAppStorage();$("#storageMessage").textContent=`${removed} retired TEST-event ${removed===1?"copy":"copies"} removed.`;}catch(error){$("#storageMessage").textContent="Retired TEST data was not removed: "+error.message;}};
    $$('[data-storagediscard]').forEach(button=>button.onclick=()=>{const row=rows[+button.dataset.storagediscard];if(!confirm(`Discard this unsent local copy?\n\n${label(row)}\n\nIt will NOT be uploaded and cannot be recovered from this phone. No player list, course or cloud result will be changed.`))return;if(!confirm("Final check: permanently discard this TEST/old unsent copy?"))return;try{GolfSafeCloud.discardAbandonedRecord(row.record,currentIsTest);openAppStorage();$("#storageMessage").textContent="Unsent copy discarded. The upload warning is cleared.";}catch(error){$("#storageMessage").textContent="The copy was not discarded: "+error.message;}});
    if($("#storageExport"))$("#storageExport").onclick=()=>{const data={...organiserBackupPayload(),appStorage:{savedAt:new Date().toISOString(),localData:{}}};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(/auth|token|Connections|Writer|Lease/i.test(key))continue;data.appStorage.localData[key]=localStorage.getItem(key);}downloadOrganiserBackup(data);exported=true;$("#storageMessage").textContent="Backup downloaded. Confirm it is saved before removing any backup copy.";$$('[data-storagebackup]').forEach(button=>button.disabled=false);};
    $$('[data-storagebackup]').forEach(button=>button.onclick=()=>{const row=inventory[+button.dataset.storagebackup];if((!exported&&!row.testBackup)||!row.removable)return;if(GolfSafeCloud.storageRecords().some(r=>r.pending||r.status.includes("review"))||[store.cloud?.eventId,store.event?.id].filter(Boolean).some(id=>row.value.includes(id))){$("#storageMessage").textContent="New or active work is protected. Refresh Storage.";return;}if(localStorage.getItem(row.key)!==row.value){$("#storageMessage").textContent="This backup changed. Refresh Storage before removing it.";return;}const question=row.testBackup?"Remove this local TEST-event backup now? It is not required online.":"Confirm the downloaded App Storage backup is saved, then remove this older local backup copy?";if(!confirm(question))return;localStorage.removeItem(row.key);openAppStorage();});
    $$('[data-storageremove]').forEach(button=>button.onclick=()=>{const row=rows[+button.dataset.storageremove];if(!confirm(`Remove the local saved copy of ${label(row)}? Its confirmed online copy remains.`))return;try{GolfSafeCloud.removeStorageRecord(row.record);openAppStorage();}catch(error){$("#storageMessage").textContent=error.message;}});
    $$('[data-storageretry]').forEach(button=>button.onclick=async()=>{button.disabled=true;$("#storageMessage").textContent="Retrying upload…";try{await GolfSafeCloud.retryStorageRecord(rows[+button.dataset.storageretry].record);openAppStorage();$("#storageMessage").textContent="Upload confirmed online.";}catch(error){$("#storageMessage").textContent="Upload not completed: "+error.message;button.disabled=false;}});
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
2. All balls must be putted into the hole — NO GIMMIES.
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
      .map((line) => line.trim().replace(/^(?:[•*-]|\d+[.)])\s*/, ""))
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
      ? `Preferred Lies — ${setting.area === "fairway" ? "Closely Mown Areas Only" : "General Area"}`
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
              ? `Day ${day} — Preferred Lies`
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
    if ((event.competitions || []).includes("capTeams")) sections.push({title:"Black Cap – White Cap", text:capRulesText(event)});
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
          : '<section><h3>Today’s Rules</h3><p>No additional rules apply to this event.</p></section>'
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
              `${esc(x.courseName || "Course")} — Handicap ${esc(formatPlayingHandicap(x.handicap))}`,
          )
          .join("<br>")
      : "—";
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
              `${esc(entry.dateLabel || entry.date || "Date not set")} — ${esc(entry.courses || "Course not set")}`,
          )
          .join("<br>")
      : "—";
  }
  function playerInfo(id, status = "") {
    let p = store.players.find(p=>String(p.id)===String(id));
    if (!p) return;
    const eventRows = profileCourseHandicaps(p);
    showSide(
      `<h2>${esc(p.name)}</h2><p><small>GOLF ID / GOLFLINK NUMBER</small><br><b>${esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink || "—")}</b></p><p><small>CURRENT GA HANDICAP</small><br><b>${p.noOfficialHandicap ? "No Official Handicap — event estimate only" : p.gaUpdatedAt ? esc(formatGaHandicap(p.ga)) : "Not yet entered"}</b>${p.gaUpdatedAt ? `<br><small>${p.gaCategory === "women" ? "Women" : "Men"} factor · updated ${esc(new Date(p.gaUpdatedAt).toLocaleDateString("en-AU"))}</small>` : ""}</p><p><small>NICK NAME</small><br>${esc(p.nickname || "—")}</p><p><small>CELL PHONE</small><br>${esc(p.cellPhone || "—")}</p><p><small>ADDRESS</small><br>${esc(p.address || "—").replace(/\n/g,"<br>")}</p><p><small>HOME CLUB</small><br><b>${esc(p.homeClub || "—")}</b></p><p><small>AWAY GOLF EVENTS PLAYED</small><br><b>${awayGolfEventsPlayedText(p)}</b></p><p><small>COURSES PLAYED — HANDICAP WHEN LAST PLAYED</small><br><b>${profileHistoryText(p)}</b></p>${eventRows.map((x) => `<p><small>HANDICAP FOR ${esc(x.name).toUpperCase()}</small><br><b>${x.value === "" ? "Not yet entered" : esc(formatPlayingHandicap(x.value))}</b></p>`).join("")}<p><small>NOTES</small><br>${esc(p.notes || "—")}</p><p><small>STATUS</small><br><b>${p.rosterActive === false ? "Inactive" : "Active"}${status ? " • " + esc(status) : ""}</b></p><button class="primary profileEditBtn" id="editPlayerProfile">Edit Player Profile</button>`,
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
    const contactFields=`<label><span>Nick Name</span><input id="epNickname" maxlength="80" value="${esc(p.nickname||'')}"></label><label><span>Cell Phone No</span><input id="epPhone" type="tel" maxlength="80" value="${esc(p.cellPhone||'')}"></label><fieldset class="playerContactAddress"><legend>Address</legend>${[['houseNo','House/Apt No'],['streetName','Street Name']].map(([k,label])=>`<label><span>${label}</span><input data-playeraddress="${k}" maxlength="160" value="${esc(address[k]||'')}"></label>`).join('')}<label><span>Street Type</span><select id="epStreetType"><option value="">Choose</option>${['Street','Rd','Close','Pde','Hwy','Other'].map(t=>`<option ${address.streetType===t?'selected':''}>${t}</option>`).join('')}</select></label><label id="epOtherStreetLabel"><span>Other — please insert</span><input data-playeraddress="otherStreetType" maxlength="80" value="${esc(address.otherStreetType||'')}"></label><label><span>Suburb</span><input data-playeraddress="suburb" maxlength="160" value="${esc(address.suburb||'')}"></label><label><span>State</span><select data-playeraddress="state"><option value="">Choose</option>${stateChoices.map(([c,n])=>`<option value="${c}" ${address.state===c||address.state===n?'selected':''}>${c} — ${n}</option>`).join('')}${address.state&&!stateChoices.some(([c,n])=>address.state===c||address.state===n)?`<option selected value="${esc(address.state)}">${esc(address.state)}</option>`:''}</select></label><label><span>Post Code</span><input data-playeraddress="postCode" maxlength="20" value="${esc(address.postCode||'')}"></label><label><span>Previously saved address</span><textarea data-playeraddress="legacyAddress" maxlength="1000">${esc(address.legacyAddress||(!p.addressDetails?p.address:'')||'')}</textarea></label></fieldset>`;
    $("#sideContent").innerHTML =
      `<h2>Edit Player Profile</h2><div class="profileEditForm"><label><span>First Name (required)</span><input id="epFirst" maxlength="80" value="${esc(first)}"></label><label><span>Last Name (required)</span><input id="epLast" maxlength="80" value="${esc(last)}"></label><label><span>Golf ID / GolfLink Number (required)</span><select id="epHandicapStatus"><option value="">Choose</option><option value="insert" ${p.golfLink?"selected":""}>Insert</option><option value="none" ${p.noOfficialHandicap?"selected":""}>No Official Handicap</option></select><input id="epGolfLink" inputmode="numeric" maxlength="80" value="${esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink || "")}"></label>${contactFields}<label><span>Home club</span><input id="epHomeClub" value="${esc(p.homeClub || "")}"></label><label><span>GA Handicap</span><input id="epGa" type="number" inputmode="decimal" min="0" max="54" step="0.1" value="${p.gaUpdatedAt ? esc(Math.abs(+p.ga).toFixed(1)) : ""}" placeholder="e.g. 18.4"></label><label class="plusCheck"><input type="checkbox" id="epGaPlus" ${p.gaUpdatedAt && +p.ga < 0 ? "checked" : ""}> Plus GA Handicap</label><label><span>Handicap category</span><select id="epGaCategory"><option value="men" ${p.gaCategory !== "women" ? "selected" : ""}>Men</option><option value="women" ${p.gaCategory === "women" ? "selected" : ""}>Women</option></select></label></div><div class="profileReadOnly"><p><small>AWAY GOLF EVENTS PLAYED</small><br><b>${awayGolfEventsPlayedText(p)}</b></p><p><small>COURSES PLAYED — HANDICAP WHEN LAST PLAYED</small><br><b>${profileHistoryText(p)}</b></p></div>${eventRows.map((x) => `<div class="profileHcpEdit"><label><span>Handicap for ${esc(x.name)}</span><input type="text" inputmode="numeric" data-profilehcp="${x.courseId}" data-profileday="${x.day}" value="${esc(handicapMagnitude(x.value))}" ${handicapsLocked ? "disabled" : ""}></label><label class="plusCheck"><input type="checkbox" data-profileplus="${x.courseId}|${x.day}" ${Number(x.value) < 0 ? "checked" : ""} ${handicapsLocked ? "disabled" : ""}> Plus handicap</label></div>`).join("")}${handicapsLocked ? '<p class="hint">Event handicaps are fixed because this event is locked.</p>' : ""}<div class="profileEditForm"><label><span>Notes</span><textarea id="epNotes" rows="4">${esc(p.notes || "")}</textarea></label><label><span>Status</span><select id="epStatus"><option value="active" ${p.rosterActive !== false ? "selected" : ""}>Active</option><option value="inactive" ${p.rosterActive === false ? "selected" : ""}>Inactive</option></select></label></div><div class="rowBtns profileEditActions"><button class="primary" id="savePlayerProfile">Save Profile</button><button class="soft" id="cancelPlayerProfile">Cancel</button></div>`;
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
        ? `<div class="returnSetupBar"><button class="soft" id="returnToWizardPlayers">← Return to Setup</button></div>`
        : "";
    $("#playerAdminList").innerHTML =
      ret +
      act
        .map(
          (p) =>
            `<div class="playerRow"><div><b>${esc(p.name)}</b><small>${esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink)}</small></div><div class="rowBtns"><button class="info" data-pinfo="${p.id}">i</button><button class="danger" data-pinactive="${p.id}">−</button></div></div>`,
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
    if(library.allowed&&AwayCloud.loadCourseLocations)try{const rows=await AwayCloud.loadCourseLocations();store.courseRegions ||= {};for(const row of rows){addCourseCountry(row.country);store.courseRegions[row.country]=GolfCourseLocations.unique([...(store.courseRegions[row.country]||[]),row.region]);}writeLocalStore();}catch(error){console.warn('Shared locations unavailable',error);}
    renderCoursesAdmin();
  }
  const PRE_COURSE_LIST_IMPORT_KEY = "awayGolfPreCourseListImportV1";
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
    if (preserveCurrent) localStorage.setItem(PRE_COURSE_LIST_IMPORT_KEY, JSON.stringify(previous));
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
    panel.innerHTML=`<b>Cloud Master Course List</b><p role="status">${esc(library.message)}</p><small>${pending ? pending+" course save(s) pending. " : ""}Changes download when you open Courses or refresh this list. Favourites stay personal to this device.</small><div class="rowBtns"><button class="primary" id="syncMasterCourseList" ${library.busy?'disabled':''}>${library.busy?'Synchronising…':'Refresh / Sync Courses'}</button>${!library.allowed?'<button class="soft" id="courseOwnerSignIn">Owner Sign-In</button>':''}${conflicts.length?'<button class="soft" id="reviewMasterCourses">Review Different Copies ('+conflicts.length+')</button>':''}</div><div class="rowBtns courseTransferActions"><button class="soft" id="exportCourseList">Download Course List</button><label class="backupImportLabel">Replace Course List from File<input type="file" id="importCourseList" accept="application/json,.json"></label>${courseUndo?'<button class="soft" id="undoCourseListImport">Undo Last Course Import</button>':''}</div><small>Course transfer changes only this device’s planning course list. Players, events, scores and personal favourites remain on this device.</small>`;
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
    return `<h3>${esc(data.name)}</h3><p>${esc([data.country||"Australia",data.state,data.region].filter(Boolean).join(" · "))}</p><p>${esc(data.address||"")}</p><p>${esc(data.notes||"")}</p>${EVENT_TEES.map(tee=>{
      const card=courseScorecard(data,tee);if(!card)return "";
      return `<details><summary>${esc(teeMarkerColour(tee,data))} tee — Slope ${esc(data.teeDetails?.[tee]?.slope||card.slope||"—")} · Scratch ${esc(data.teeDetails?.[tee]?.scratch||card.scratch||"—")}</summary><table><thead><tr><th>Hole</th><th>Par</th><th>Index</th><th>${courseDistanceUnit(card)==='yards'?'Yards':'Metres'}</th></tr></thead><tbody>${Array.from({length:18},(_,i)=>`<tr><td>${i+1}</td><td>${esc(card.par?.[i]??"")}</td><td>${esc(card.index?.[i]??"")}</td><td>${esc(courseHoleDistance(card,i))}</td></tr>`).join("")}</tbody></table></details>`;
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
    $("#modalContent").innerHTML=`<h2>Choose Course Details</h2><div id="courseCardComparison"></div><p>Choosing this device submits its details as the proposed replacement. The copy not chosen is removed.</p><div class="rowBtns"><button class="primary" id="chooseCloudCourse">Use Cloud Copy</button><button class="soft" id="chooseDeviceCourse">Submit This Device’s Copy</button><button class="soft" id="backCourseConflicts">Back</button></div>`;
    GolfCatalogueReview.renderComparison($("#courseCardComparison"),course(id,true),remote.data,"On this device",`Master revision ${remote.revision}`);
    $("#chooseCloudCourse").onclick=()=>{if(!discardCourseDraftBeforeCloud(id))return;library.resolve(id,'cloud');$("#modalShade").classList.remove("open");void syncMasterCourses();};
    $("#chooseDeviceCourse").onclick=()=>{if(!confirm('Save this device’s details as the next cloud revision?'))return;library.resolve(id,'local');$("#modalShade").classList.remove("open");void syncMasterCourses();};
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
    return `<select id="mcregion"><option value="">Choose</option>${courseRegionList(country,value).map(name=>`<option value="${esc(name)}" ${name===value?"selected":""}>${esc(name)}</option>`).join("")}<option value="__add_region__">Add a new area…</option></select>`;
  }
  function bindCourseRegion(country) {
    $("#mcregion").onchange=e=>{if(e.target.value!=="__add_region__")return;const value=GolfCourseLocations.area(prompt("New Region / Area"));if(value){void AwayCloud.addCourseLocation?.(country,value).catch(error=>console.warn(error));store.courseRegions ||= {};store.courseRegions[country]=GolfCourseLocations.unique([...(store.courseRegions[country]||[]),value]);writeLocalStore();}const label=e.target.parentElement;label.innerHTML="Region / Area"+courseRegionField(country,value);bindCourseRegion(country);};
  }
  function courseLocationFields(c) {
    const country = canonicalCourseCountry(c.country || "Australia");
    return `<label>Country<select id="mccountry">${courseCountryList(country).map(name => `<option value="${esc(name)}" ${name === country ? "selected" : ""}>${esc(name)}</option>`).join("")}<option value="__add_country__">Add a country…</option></select></label><label><span id="mcstateLabel">${country === "Australia" ? "State / Territory" : "State / Province (optional)"}</span><span id="mcstateField">${courseStateField(country, c.state)}</span></label><label>Region / Area${courseRegionField(country,c.region||"")}</label>`;
  }
  function courseStateField(country, state = "") {
    const values = GolfCourseLocations.provinces(country,store.courses,[...(store.courseProvinces?.[country]||[]),state]);
    return `<select id="mcstate"><option value="">Choose</option>${values.map(name=>`<option value="${esc(name)}" ${name===state?"selected":""}>${esc(name)}</option>`).join("")}${country === "Australia" ? "" : '<option value="__add_state__">Add a state / province…</option>'}</select>`;
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
      return `<tr><td><b>${label}</b></td><td><select class="teeDetailEntry teeColourSelect" id="${key}Colour" data-saved-colour="${esc(selectedColour)}">${colourOptions}${customOption}<option value="__other__">Other — specify</option></select></td><td><input class="teeDetailEntry" id="${key}Slope" value="${esc(t[key]?.slope || "")}"></td><td><input class="teeDetailEntry" id="${key}Scratch" value="${esc(t[key]?.scratch || "")}"></td><td><input class="teeDetailEntry" id="${key}Par" value="${esc(t[key]?.par || "")}"></td><td><span class="teeLengthValue"><input class="teeDetailEntry" id="${key}Length" value="${esc(courseDistanceTotal(courseScorecard(c, key, false, category) || {}) || t[key]?.length || "")}" readonly><small>${courseDistanceAbbrev(courseScorecard(c, key, false, category) || {})}</small></span></td></tr>`;
    };
    const cardOptions = cardTees.map((tee) => {
      const exists = Boolean(courseScorecard(c, tee, false, category));
      return `<option value="${tee}" ${tee === activeCardTee ? "selected" : ""}>${esc(teeMarkerColour(tee, c, category))}${exists ? "" : " — New card"}</option>`;
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
      `<div class="courseDetailTop"><h2>Course Details — ${esc(c.name)}</h2><label class="favDetailToggle"><input type="checkbox" id="courseFavourite" ${isFavourite ? "checked" : ""}> Favourite course</label></div><div class="modalGrid courseContactGrid"><label>Name<input id="mcname" value="${esc(c.name)}"></label>${courseLocationFields(c)}<label>Club phone<input id="mcClubPhone" inputmode="tel" value="${esc(c.clubPhone || "")}"></label><label>Pro Shop phone<input id="mcProPhone" inputmode="tel" value="${esc(c.proPhone || "")}"></label><label>Club email<input id="mcClubEmail" inputmode="email" value="${esc(c.clubEmail || "")}"></label><label>Pro Shop email<input id="mcProEmail" inputmode="email" value="${esc(c.proEmail || "")}"></label><label>Golf professional’s name<input id="mcProName" value="${esc(c.proName || "")}"></label><label>Address / location<input id="mcaddress" value="${esc(c.address || "")}"></label><label>Google Maps link<input id="mcmap" value="${esc(c.mapLink || "")}"></label><label>Website<input id="mcweb" value="${esc(c.website || "")}"></label></div><label class="courseNotesLabel">Notes<textarea id="mcnotes" rows="4" placeholder="Course condition, greens cored, booking or clubhouse notes...">${esc(c.notes || "")}</textarea></label><div class="courseCategoryControls"><label class="courseCategorySelect"><b>Select Tee Data — Men/Women</b><select id="courseDataCategory"><option value="men" ${category==="men"?"selected":""}>Men</option><option value="women" ${category==="women"?"selected":""}>Women</option></select></label><label>Tee Positions<select id="courseTeePositionCount">${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===cardTees.length?"selected":""}>${n}</option>`).join("")}</select></label></div><small>Extra saved tees are retained when you reduce the number of positions.</small>${category==="women"?`<div class="scorecardCopyRow"><label>Copy from<select id="copyMenSource">${GolfCourseCategories.positions(c).map(tee=>`<option value="${tee}" ${tee==="middle"?"selected":""}>Men’s ${GolfCourseCategories.positionLabel(c,tee)}${c.teeDetails?.[tee]?.colour?" · "+esc(c.teeDetails[tee].colour):""}</option>`).join("")}</select></label><label>Copy to<select id="copyWomenDestination">${cardTees.map(tee=>`<option value="${tee}" ${tee===activeCardTee?"selected":""}>Women’s ${GolfCourseCategories.positionLabel(categoryData,tee)}${categoryData.teeDetails?.[tee]?.colour?" · "+esc(categoryData.teeDetails[tee].colour):""}</option>`).join("")}</select></label><button type="button" class="soft" id="copyMenToWomen">Copy selected tee card</button></div><label class="cardCheckedConfirm"><input type="checkbox" id="womenDataChecked" ${categoryData.needsReview?"":"checked"}> Women’s ratings, pars, indexes and lengths checked against the official card</label>`:""}<h3>${category==="women"?"Women’s":"Men’s"} Tee Details</h3><p class="scorecardHelp">Choose the course marker colour, then enter each value. Press Enter to move to the next field.</p><table class="teeTable"><thead><tr><th>Tee</th><th>Colour</th><th>Slope</th><th>Scratch</th><th>Par</th><th>Length</th></tr></thead><tbody>${cardTees.map(tee=>teeRow(tee,GolfCourseCategories.positionLabel(categoryData,tee))).join("")}</tbody></table><div class="scorecardTeeHeading"><h3>Scorecard — Active Tee <span>${esc(teeMarkerColour(activeCardTee, c, category))}</span></h3><label>Scorecard tee<select id="scorecardTeeSelect">${cardOptions}</select></label></div><p class="scorecardHelp">Choose the tee card above. A new card copies the saved pars; enter its own indexes and lengths.</p><div class="courseDistanceControls"><label>Enter hole lengths in<select id="courseDistanceInput"><option value="metres" ${distanceInputUnit === "metres" ? "selected" : ""}>Metres</option><option value="yards" ${distanceInputUnit === "yards" ? "selected" : ""}>Yards</option></select></label><label>Save and display lengths as<select id="courseDistanceSave"><option value="metres" ${distanceSavedUnit === "metres" ? "selected" : ""}>${distanceInputUnit === "yards" ? "Convert to metres" : "Metres"}</option><option value="yards" ${distanceSavedUnit === "yards" ? "selected" : ""} ${distanceInputUnit === "yards" ? "" : "disabled"}>Keep yards as entered</option></select></label><small>1 yard = 0.9144 metres. Converted metres are rounded to whole metres for each hole. Totals add the saved hole lengths.</small></div><div class="scoreMini"><div class="scoreNineWrap">${scoreTable(1, 9, "Front Nine")}${scoreTable(10, 18, "Back Nine")}</div></div><div class="rowBtns" style="margin-top:12px"><button class="soft" id="saveCourseDraft">Save Draft</button><button class="primary" id="saveCourseModal">Save Completed Course</button>${c.mapLink ? `<button class="soft" id="openMapLink">Open Map</button>` : ""}<button class="soft" id="closeModal">Close</button></div>`;
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
        e.target.innerHTML = courseCountryList(next).map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("") + '<option value="__add_country__">Add a country…</option>';
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
      if(!confirm(`Copy Men’s ${source} tee ratings and all 18 holes to Women’s ${destination}? This replaces only that Women’s tee card. Check its ratings, pars, indexes and lengths before saving.`))return;
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
      const cardCheck = {ok:cardChecks.every(check => check.ok), issues:cardChecks.flatMap(check => check.issues.map(issue => check.category + " · " + teeMarkerColour(check.tee,c,check.category) + ": " + issue))};
      if (!cardCheck.ok) {
        alert(
          "The scorecard cannot be saved yet:\n\n" +
            cardCheck.issues.slice(0, 8).join("\n") +
            (cardCheck.issues.length > 8
              ? `\n…and ${cardCheck.issues.length - 8} more item(s).`
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
      try { localStorage.removeItem(draftKey); } catch {}
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
          ? '<span class="courseFavouriteStar" title="Favourite course">★</span>'
          : "";
      return `<div class="courseRow ${c.available === false ? "inactive" : ""}"><div><b>${star}${esc(c.name)}</b><small>Middle / ${esc(teeMarkerColour("middle", c))} — Slope ${esc(t.slope || v.slope || "—")} • Par ${esc(t.par || "—")} • Length ${courseDistanceTotal(courseScorecard(c, "middle") || {}) ? courseDistanceTotal(courseScorecard(c, "middle")) + " " + courseDistanceAbbrev(courseScorecard(c, "middle")) : t.length ? esc(t.length) + " m" : "—"}</small><small>Cards Stored Men ${GolfCourseCategories.storedCount(c,"men")} Women ${GolfCourseCategories.storedCount(c,"women")}</small><small>${esc([c.country || "Australia", c.state, c.region].filter(Boolean).join(" · "))} • ${c.address ? esc(c.address) : "Location not yet entered"}${c.proPhone ? " • Pro Shop " + esc(c.proPhone) : ""}</small><span class="courseStatus">${status}</span><small>${esc(getMasterCourseLibrary()?.status(String(c.id)) || "On this device")}</small>${c.notes ? `<small>${esc(c.notes)}</small>` : ""}</div><div class="rowBtns"><button class="soft" data-cinfo="${c.id}">Course Details</button>${c.available === false ? `<button class="soft" data-creactivate="${c.id}">Reactivate</button>` : `<button class="danger" data-cinactive="${c.id}">−</button>`}</div></div>`;
    };
    let ret = wizardReturnStep
      ? `<div class="returnSetupBar"><button class="soft" id="returnToWizardCourses">← Return to Setup</button></div>`
      : "";
    $("#courseAdminList").innerHTML =
      ret +
      (fav.length
        ? `<div class="courseSectionTitle">★ Favourite Courses</div>${fav.map(row).join("")}<div class="courseSectionTitle">All Other Courses</div>`
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
    if (!store.event || !$("#wizardShade")?.classList.contains("open")) return;
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
        if (!ensureCapTeams(W.event,ids)) return alert("Enter a GA handicap for each golfer before balancing the Black Cap – White Cap teams.");
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
      `Step ${W.step} of 6 — ${stepNames[W.step - 1]}`;
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
    return `<div class="courseChoiceControl"><select id="weC${day}" class="courseNativeSelect" aria-hidden="true" tabindex="-1">${courseOptions(W.event["course" + day])}</select><button type="button" class="courseChoiceBtn" id="chooseCourse${day}"><span><small>SELECTED COURSE</small><b>${esc(selected?.name || "Choose a course")}</b>${selected?.region ? `<em>${esc(selected.region)}</em>` : ""}</span><strong>Choose Course ›</strong></button></div>`;
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
        `<div class="coursePickerHead"><div><h2>${W.event.days === 1 ? "Choose Course" : `Choose Day ${day} Course`}</h2><p>${day === 2 && source ? `Day 1 is ${esc(source.name)}${source.region ? ` in ${esc(source.region)}` : ""}.` : "Choose with the mouse from All Courses or your Favourites."}</p></div><button type="button" class="close" id="closeCoursePicker">×</button></div><div class="coursePickerGrid"><section class="courseAll"><label>Search all courses<input id="coursePickerSearch" value="${esc(query)}" placeholder="Course or golf region"></label><div class="coursePickerList">${all.map((c) => `<div class="coursePickerRow"><button type="button" class="courseNamePick" data-pickcourse="${c.id}"><b>${esc(c.name)}</b>${c.region ? `<small>${esc(c.region)}</small>` : ""}</button><button type="button" class="courseFavToggle ${favIds.has(String(c.id)) ? "on" : ""}" data-favcourse="${c.id}" title="${favIds.has(String(c.id)) ? "Remove from Favourites" : "Add to Favourites"}">${favIds.has(String(c.id)) ? "✓" : "＋"}</button></div>`).join("") || '<p class="hint">No courses match that search.</p>'}</div></section><aside class="courseQuick"><div class="quickSection"><h3>Favourites</h3><p>Your regular courses</p>${favourites.map((c) => quick(c)).join("") || '<div class="quickEmpty">Use the + beside any course to build this list.</div>'}</div>${day === 2 && source?.region ? `<div class="quickSection nearby"><h3>Nearby Courses</h3><p>${esc(source.region)}</p>${nearby.map((c) => quick(c, "Same golf region")).join("") || '<div class="quickEmpty">No other course is assigned to this region yet.</div>'}</div>` : ""}</aside></div>`;
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
      <label>Size of Field<div class="fieldSizeStepper"><button type="button" id="weFieldMinus">−</button><input id="weField" type="number" min="3" max="60" value="${W.event.fieldSize}"><button type="button" id="weFieldPlus">+</button></div></label></div>
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
    $("#modalContent").innerHTML=`<h2>Shared Player Position</h2><p>Choose one position and assign its golfer for each day. Each golfer has a separate scorecard and handicap. Their aggregate scores and aggregate prize are shared.</p><label>Selected position<select id="sharedPrimary">${selected.map(id=>`<option value="${esc(id)}">${esc(name(id))}</option>`).join("")}</select></label><label>Primary golfer’s GA<input id="sharedPrimaryGa" type="number" min="-10" max="54" step="0.1"></label><label>Other golfer<select id="sharedOther"><option value="">Add a new golfer for this shared position</option>${profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.rosterActive===false ? " (saved reserve player)" : ""}</option>`).join("")}</select></label><div id="sharedNewDetails"><label>First name<input id="sharedFirst" maxlength="80"></label><label>Last name<input id="sharedLast" maxlength="80"></label><label>Golf ID / GolfLink Number<select id="sharedIdChoice"><option value="insert">Insert</option><option value="none">No Official Handicap</option></select><input id="sharedRegistration" inputmode="numeric" maxlength="80"></label></div><label>Other golfer’s GA<input id="sharedOtherGa" type="number" min="-10" max="54" step="0.1"></label><label>Other golfer’s handicap category<select id="sharedCategory"><option value="men">Men</option><option value="women">Women</option></select></label><p>Use a negative GA for a plus handicap. Review GA & Tee Hcps after assigning the days.</p><div id="sharedDays"></div><button class="primary" id="saveSharedPosition">Save Shared Position</button> <button class="soft" id="removeSharedPosition">Remove Shared Arrangement</button> <button class="soft" id="closeSharedPosition">Close</button>`;
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
        if($("#sharedPrimaryGa").value==="" || $("#sharedOtherGa").value==="" || ![primaryGa,otherGa].every(ga=>Number.isFinite(ga)&&ga>=-10&&ga<=54))throw Error("Enter both golfers’ GA Handicaps from plus 10 to 54.");
        if(!existing){if(!newPlayer.firstName || !newPlayer.lastName)throw Error("Enter the other golfer’s first and last names.");if(!newPlayer.noOfficialHandicap && !/^[0-9]+$/.test(newPlayer.golfLink))throw Error("Enter a Golf ID / GolfLink Number or choose No Official Handicap.");newPlayer.name=newPlayer.firstName+" "+newPlayer.lastName;newPlayer.ga=otherGa;newPlayer.gaCategory=$("#sharedCategory").value;newPlayer.gaUpdatedAt=new Date().toISOString();}
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
      const status = `${complete ? "✓ Trip field selected" : `${planning.length}/${need} trip players selected`} — ${eventDays(W.event).map(day => `Day ${day}: ${wizardPlanningPlayers(day).length} playing`).join(" · ")}. Untick a day when a golfer is resting.`;
      $("#wizardBody").innerHTML =
        `<div class="pageHead"><div><h3>Choose players</h3><p class="hint">Invite golfers, record their response and build the confirmed field.</p></div><div class="card targetCard"><b>${W.event.fieldSize}</b><small>TARGET FIELD</small></div></div>
  <div class="playerTools"><input id="wpSearch" placeholder="Search by name or GolfLink number"><div class="rowBtns"><button class="soft" id="wizardManagePlayers">Manage Player List</button><button class="soft" data-setcoursehcp="1">Set GA & Tee Hcps</button>${eventDays(W.event).filter(day => day>1).map(day => `<button class="soft" data-setcoursehcp="${day}">Review Day ${day} Calculations</button>`).join("")}<button class="primary" id="wizardAddPlayer">+ Add Player</button>${W.event.days>1 ? `<button class="soft" id="planSharedPosition">Share this position across days</button>` : ""}</div></div>
  <div class="savedPlayerListTools"><label>Available Player Lists<select id="availablePlayerList"><option value="">Choose a named list</option>${[...store.playerLists].sort((a, b) => String(a.name).localeCompare(String(b.name))).map((list) => `<option value="${esc(list.id)}">${esc(list.name)} (${(list.playerIds || []).filter((id) => player(id)).length})</option>`).join("")}</select></label><button class="primary" id="loadPlayerList" ${store.playerLists.length ? "" : "disabled"}>Load List into Invited</button><button class="soft" id="manageNamedPlayerLists">Create / Manage Player Lists</button></div>
  <div class="trafficLegend"><span><i class="legendDot accept"></i>Accepted</span><span><i class="legendDot wait"></i>Awaiting reply</span><span><i class="legendDot decline"></i>Declined</span>${W.event.days > 1 ? `<span class="availabilityLegend">For accepted players, tick the day(s) they are playing.</span>` : ""}</div>
  <div class="threeCols"><div class="col"><h3>Available Players <span>${available.length}</span></h3><div id="av"></div></div><div class="col"><h3 class="inviteHeading">Invited <span>${invited.length}</span>${invited.some((p) => W.invites.get(String(p.id)) === "awaiting") ? '<button type="button" class="allGreenBtn" id="wizardAllGreen">✓ All Green</button>' : ""}</h3><div id="inv"></div></div><div class="col"><h3>Confirmed Field <span>${confirmed.length}</span></h3><div id="conf"></div></div></div><div class="status">${status}</div>`;
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
              : `<div class="playerRow"><div><b>${esc(p.name)}</b><small>${esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink)}</small></div><div class="rowBtns"><button class="info" data-wpinfo="${p.id}">i</button><button class="invite" data-winvite="${p.id}">Invite</button><button class="danger miniMinus" title="Make inactive" data-wpinactive="${p.id}">−</button></div></div>`,
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
            return `<div class="playerRow ${p.system ? "noPartnerRow" : ""}"><div><b>${esc(GolfSharedPositions.label(W.event,p.id,id=>store.players.find(p=>String(p.id)===String(id))?.name || "Player"))}</b><small>${p.system ? "System position" : esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink)}</small></div>${p.system ? '<span class="noPartnerConfirmed">✓ Confirmed position</span>' : `<div class="rowBtns traffic"><button class="dotBtn wait ${st === "awaiting" ? "active" : ""}" title="Awaiting reply" data-wstatus="${p.id}|awaiting"></button><button class="dotBtn accept ${st === "accepted" ? "active" : ""}" title="Accepted" data-wstatus="${p.id}|accepted"></button><button class="dotBtn decline ${st === "declined" ? "active" : ""}" title="Declined" data-wstatus="${p.id}|declined"></button><button class="info" data-wpinfo="${p.id}">i</button></div>`}</div>`;
          })
          .join("") ||
        '<p class="hint" style="padding:10px">No invitations yet.</p>';
      $("#conf").innerHTML =
        confirmed
          .map((p) => {
            const id = String(p.id),
              a = W.event.dayAvailability[id] || { 1: true, 2: true };
            return `<div class="playerRow confirmedAvailability ${p.system ? "noPartnerRow" : ""}"><div><b>${esc(GolfSharedPositions.label(W.event,p.id,id=>store.players.find(p=>String(p.id)===String(id))?.name || "Player"))}</b><small>${p.system ? "Missing player position" : esc(p?.noOfficialHandicap ? "No Official Handicap" : p.golfLink)}</small></div>${W.event.days > 1 ? `<div class="dayAvailability">${eventDays(W.event).map(day => `<label><input type="checkbox" data-wday="${id}|${day}" ${a[day] !== false ? "checked" : ""}> D${day}${W.event.sharedPositions?.[id] ? " · "+esc(player(sharedActualId(id,day,W.event))?.name || "Player") : ""}</label>`).join("")}</div>` : "<span>✓</span>"}</div>`;
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
      `<div class="handicapEntryHead"><div><h2>${title} — ${esc(c?.name || "Day " + day + " Course")}</h2><p>${help}</p></div></div><div class="quickHandicapColumns"><span>Player</span><span>Handicap</span><span>Plus</span></div><div class="quickHandicapList">${
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
 if(!Number.isInteger(handicap)||handicap < -10||handicap > 54)throw new Error('Enter a whole-number proposed handicap from −10 to 54. Use a negative number for a plus handicap.');
 const factor=.93*(category==='women'?1.0483:.9986);
 const raw=(handicap/factor-(rating.scratch-rating.par))*113/rating.slope;
 const candidates=Array.from({length:21},(_,i)=>Math.round((raw+(i-10)/10)*10)/10).filter(v=>v>=-10&&v<=54&&calculate(v,rating,category)===handicap);
 candidates.sort((a,b)=>Math.abs(a-raw)-Math.abs(b-raw));
 if(!candidates.length)throw new Error('This proposed handicap cannot be represented by a GA estimate from −10 to 54 for this tee. Check the proposed handicap and tee ratings.');
 return Object.is(candidates[0],-0)?0:candidates[0];
}
  function gesProposedHandicapRow(id,day) {
    if(!player(id)?.noOfficialHandicap)return '';
    const anchor=W.event.proposedHandicaps?.[id],same=anchor?.day===day&&String(anchor.courseId)===String(W.event['course'+day]);
    return `<div class="gesProposedHandicap"><small>No Official Handicap · event estimate only</small><div><label>Set Handicap for this tee<select data-proposedtee="${esc(id)}">${enabledEventTees(W.event,day).map(tee=>`<option value="${tee}" ${same&&anchor.tee===tee?'selected':''}>${EVENT_TEE_LABELS[tee]} — ${esc(teeMarkerColour(tee,course(W.event['course'+day])))}</option>`).join('')}</select></label><label>Proposed handicap<input type="number" min="-10" max="54" step="1" data-proposedhcp="${esc(id)}" value="${same?esc(anchor.handicap):''}" placeholder="e.g. 19"></label><button type="button" class="soft" data-estimatega="${esc(id)}">Set estimated GA</button></div><small data-estimatestatus="${esc(id)}" role="status">${same?`Day ${day}: ${esc(teeMarkerColour(anchor.tee,course(anchor.courseId)))} tee · ${esc(anchor.handicap)} hcp · estimated GA ${esc(anchor.ga)}`:'Choose a tee and proposed handicap, then set the estimated GA.'}</small></div>`;
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
        status.textContent=`Day ${day}: ${rating.teeColour} tee · ${handicap} hcp · estimated GA ${ga.toFixed(1)}. Calculate Event Handicaps applies this across the event.`;
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
    const refreshLabel = () => {
      button.textContent = categories.length && categories.every(control => control.value === "women")
        ? "Change All Women to Men" : "Change All Men to Women";
    };
    categories.forEach(control => {
      const existing = control.onchange;
      control.onchange = () => { existing?.call(control); refreshLabel(); };
    });
    button.onclick = () => {
      const target = categories.length && categories.every(control => control.value === "women") ? "men" : "women";
      categories.forEach(control => {
        if (control.value === target) return;
        control.value = target;
        control.onchange?.();
      });
      refreshLabel();
      afterBulkChange?.(target);
    };
    refreshLabel();
  }

  function openWizardHandicapEntry(day) {
    const ids = wizardPlanningPlayers(day).filter((id) => id !== NO_PARTNER_ID),
      c = course(W.event["course" + day], Boolean(W.event.locked)),
      key = "day" + day;
    ensureEventTeePlanning(W.event);
    ensureEventGaHandicaps(W.event);
    const activeCategory = W.handicapCategory === "women" ? "women" : "men";
    captureEventTeeNames(W.event, day, activeCategory, c, Boolean(W.event.locked));
    const tees = enabledEventTeesForCategory(W.event, day, activeCategory);
    const initialDay1 = JSON.parse(
      JSON.stringify(W.event.teeHandicaps.day1 || {}),
    );
    if (day > 1 && String(W.event["course"+day]) === String(W.event.course1))
      tees.forEach((tee) =>
        ids.forEach((id) => {
          const d1 = teeHandicapsFor(1, tee, W.event),
            d2 = teeHandicapsFor(day, tee, W.event);
          if ((d2[id] === "" || d2[id] == null) && d1[id] != null)
            d2[id] = d1[id];
        }),
      );
    const allIds = [...new Set(
      Array.from({ length: W.event.days || 1 }, (_, index) =>
        wizardPlanningPlayers(index + 1),
      ).flat().filter((id) => id !== NO_PARTNER_ID),
    )];
    const categoryIds = ids.filter(id => eventGaCategory(id,W.event) === activeCategory);
    const teeHead = tees.map(
      (tee) => `<span>${esc(eventTeeDisplayName(day,tee,W.event,activeCategory,c))}</span><span>Plus</span>`,
    ).join("");
    const gaRows = allIds
      .filter((id) => eventGaCategory(id, W.event) === activeCategory)
      .map((id, index) => {
      const value = eventGaHandicap(id, W.event),
        plus = Number(value) < 0,
        category = eventGaCategory(id, W.event);
      return `<div class="eventGaRow"><span><b>${esc(player(id)?.name || "")}</b></span><div class="signedHcpInput ${plus ? "plus" : ""}" data-gasigned="${id}"><input type="number" inputmode="decimal" min="0" max="54" step="0.1" ${player(id)?.noOfficialHandicap ? "readonly" : ""} data-eventga="${id}" data-gaindex="${index}" value="${value === "" || value == null ? "" : esc(Math.abs(+value).toFixed(1))}" placeholder="GA"></div><label class="quickPlusCheck"><input type="checkbox" data-eventgaplus="${id}" ${plus ? "checked" : ""}><span>Plus</span></label><select data-eventgacategory="${id}" aria-label="Handicap category for ${esc(player(id)?.name || "player")}"><option value="men" ${category !== "women" ? "selected" : ""}>Men</option><option value="women" ${category === "women" ? "selected" : ""}>Women</option></select></div>${gesProposedHandicapRow(id,day)}`;
      }).join("");
    const rows = categoryIds
      .map((id) => {
        const cells = tees.map((tee) => {
          const value = teeHandicapsFor(day, tee, W.event)[id],
            plus = Number(value) < 0,
            source = W.event.teeHandicapSources?.[key]?.[tee]?.[id] || (value === "" || value == null ? "" : "manual");
          if (source && !W.event.teeHandicapSources[key][tee][id])
            W.event.teeHandicapSources[key][tee][id] = source;
          return `<div class="teeHcpValue"><div class="signedHcpInput ${plus ? "plus" : ""}" data-teesigned="${tee}|${id}"><input type="number" inputmode="numeric" min="0" max="54" step="1" data-teequickhcp="${tee}|${id}" value="${esc(handicapMagnitude(value))}" placeholder="Hcp"></div><small data-hcpsource="${tee}|${id}" class="hcpSource ${source}">${source === "calculated" ? "Calculated" : source === "manual" ? "Manual" : "Not set"}</small></div><label class="quickPlusCheck"><input type="checkbox" data-teequickplus="${tee}|${id}" ${plus ? "checked" : ""}><span>+</span></label>`;
        }).join("");
        return `<div class="multiTeeHcpRow ${W.invites.get(String(id)) === "awaiting" ? "awaitingPlayer" : ""}"><span><b>${esc(player(id)?.name || "")}</b>${W.invites.get(String(id)) === "awaiting" ? "<small>Awaiting reply</small>" : ""}</span>${cells}</div>`;
      })
      .join("");
    const availableTees=courseEventTees(day,W.event,activeCategory,c);
    const teeChoices=availableTees.map(tee=>`<label class="eventTeeChoice"><input type="checkbox" data-categorytee="${tee}" ${tees.includes(tee)?"checked":""}><span>${esc(eventTeeDisplayName(day,tee,W.event,activeCategory,c))}</span></label>`).join("");
    $("#modalContent").innerHTML = `<div class="handicapEntryHead"><div><h2>${day > 1 ? `Review Day ${day}` : "Set"} Event Handicaps — ${esc(c?.name || "Course")}</h2><p>Enter each player's GA Handicap and category. Calculate and save the selected Men's and Women's tee handicaps separately.</p></div><div class="handicapCategorySwitch"><b>Calculate Hcps</b><button type="button" class="${activeCategory==="men"?"primary":"soft"}" data-hcpcategory="men">Men</button><button type="button" class="${activeCategory==="women"?"primary":"soft"}" data-hcpcategory="women">Women</button></div></div><section class="eventGaEntry"><div class="eventGaHeading"><div><h3>GA Handicaps — fixed for this event</h3><small>${W.event.gaHandicapSetAt ? `Last calculated ${esc(new Date(W.event.gaHandicapSetAt).toLocaleDateString("en-AU"))}` : "Enter GA figures, including one decimal place."}</small></div></div><div class="eventGaActions"><button type="button" class="soft" id="changeAllGaCategories">Change All Men to Women</button></div><div class="eventGaColumns"><span>Player</span><span>GA Handicap</span><span>Plus</span><span>Category</span></div><div class="eventGaList">${gaRows || "<p>No selected players yet.</p>"}</div></section><section class="categoryTeePlanner"><div><h3>${activeCategory==="women"?"Women's":"Men's"} tee positions</h3><p>Choose ${activeCategory==="women"?"Women's":"Men's"} tee positions (Max 3)</p></div><div class="categoryTeeChoices">${teeChoices||"<span>No completed tee cards are available for this category.</span>"}</div></section><h3 class="dailyHcpHeading">Day ${day} Handicaps — ${esc(c?.name || "Course")} · ${activeCategory==="women"?"Women":"Men"}</h3><div class="multiTeeHcpWrap"><div class="multiTeeHcpColumns"><span>Player</span>${teeHead}</div><div class="quickHandicapList">${rows || `<p>No ${activeCategory==="women"?"women":"men"} are currently selected for this event.</p>`}</div></div><div class="rowBtns handicapEntryActions"><button type="button" class="primary" id="calculateEventHandicaps">Calculate ${activeCategory==="women"?"Women's":"Men's"} Hcps</button><button class="primary" id="saveQuickHandicaps">Save ${activeCategory==="women"?"Women's":"Men's"} Hcps</button><button class="soft" id="closeQuickHandicaps">Cancel</button></div>`;
    const bulkCategoryButton = $("#changeAllGaCategories");
    if (bulkCategoryButton)
      bulkCategoryButton.textContent = activeCategory === "women"
        ? "Change All Women to Men"
        : "Change All Men to Women";
    $$("#modalContent p").forEach((paragraph) => {
      paragraph.textContent = paragraph.textContent
        .replace("No women are currently selected for this event.", "No women are currently participating in this event.")
        .replace("No men are currently selected for this event.", "No men are currently participating in this event.");
    });
    $("#modalShade").classList.add("open");
    const inputs = tees.flatMap((tee) => categoryIds.map((id) => $(`[data-teequickhcp="${tee}|${id}"]`))).filter(Boolean);
    const gaInputs = $$('[data-eventga]');
    const storeGaValue = (inp) => {
      const id = String(inp.dataset.eventga),
        plus = $(`[data-eventgaplus="${id}"]`)?.checked,
        raw = Number(inp.value);
      if (inp.value === "" || !Number.isFinite(raw))
        delete W.event.gaHandicaps[id];
      else W.event.gaHandicaps[id] = plus ? -Math.abs(raw) : Math.abs(raw);
      W.event.gaCategories[id] = $(`[data-eventgacategory="${id}"]`)?.value || "men";
      $(`[data-gasigned="${id}"]`)?.classList.toggle("plus", Boolean(plus));
    };
    const storeValue = (inp, markManual = true) => {
      const [tee, id] = inp.dataset.teequickhcp.split("|"),
        map = teeHandicapsFor(day, tee, W.event);
      if (inp.value === "") map[id] = "";
      else {
        const raw = Math.max(0, Math.min(54, +inp.value || 0)),
          plus = $(`[data-teequickplus="${tee}|${id}"]`)?.checked;
        map[id] = plus ? -raw : raw;
        if (markManual) {
          W.event.teeHandicapSources[key][tee][id] = "manual";
          const source = $(`[data-hcpsource="${tee}|${id}"]`);
          if (source) {
            source.textContent = "Manual";
            source.className = "hcpSource manual";
          }
        }
        $(`[data-teesigned="${tee}|${id}"]`)?.classList.toggle(
          "plus",
          Boolean(plus),
        );
      }
    };
    inputs.forEach((inp, i) => {
      inp.oninput = () => storeValue(inp);
      inp.onkeydown = (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        storeValue(inp);
        if (inputs[i + 1]) {
          inputs[i + 1].focus();
          inputs[i + 1].select();
        } else $("#saveQuickHandicaps").focus();
      };
    });
    $$('[data-eventgaplus], [data-eventgacategory]').forEach(
      (control) =>
        (control.onchange = () => {
          const id = control.dataset.eventgaplus || control.dataset.eventgacategory;
          const inp = $(`[data-eventga="${id}"]`);
          if (inp) storeGaValue(inp);
        }),
    );
    gesBindProposedHandicaps(day);
    bindEventGaControls(gaInputs, storeGaValue, (target) => {
      W.handicapCategory = target;
      openWizardHandicapEntry(day);
    });
    $$('[data-hcpcategory]').forEach(button=>button.onclick=()=>{gaInputs.forEach(storeGaValue);W.handicapCategory=button.dataset.hcpcategory;openWizardHandicapEntry(day);});
    $$('[data-categorytee]').forEach(box=>box.onchange=()=>{
      const selected=$$('[data-categorytee]:checked').map(input=>input.dataset.categorytee);
      if(selected.length>3){box.checked=false;return alert("Choose no more than three tee positions.");}
      if(!selected.length){box.checked=true;return alert("Choose at least one tee position.");}
      const key="day"+day;W.event.enabledTeesByDayCategory[key][activeCategory]=selected;
      if(!selected.includes(selectedEventTee(day,W.event,activeCategory)))W.event.teeSelectionByCategory[key][activeCategory]=selected[0];
      openWizardHandicapEntry(day);
    });
    $("#calculateEventHandicaps").onclick = () => {
      if(!gesCheckEstimates(categoryIds))return;
      gaInputs.forEach(storeGaValue);
      const missingGa = categoryIds.filter((id) => eventGaHandicap(id, W.event) === "");
      if (missingGa.length)
        return alert(`Enter a GA Handicap for: ${missingGa.map((id) => player(id)?.name || "Player").join(", ")}.`);
      const ratingIssues = [];
      for(let d=1;d<=(W.event.days||1);d++)for(const tee of enabledEventTeesForCategory(W.event,d,activeCategory)){
        const rating=teeRatingForDailyHandicap(d,tee,W.event,activeCategory);if(!rating.valid)ratingIssues.push(`${rating.courseName} — ${rating.teeColour}`);
      }
      if (ratingIssues.length)
        return alert(`Daily Handicaps cannot be calculated yet. Enter Slope, Scratch Rating and Par in Course Details for:\n\n${ratingIssues.join("\n")}`);
      if (!confirm(`Calculate every ${activeCategory === "women" ? "woman's" : "man's"} Daily Handicap for the selected tees on all event days? Existing calculated values for this category will be replaced.`)) return;
      const issues = applyCalculatedEventHandicaps(W.event,activeCategory);
      W.event.gaHandicapSetAt = new Date().toISOString();
      saveEventGaToPlayerProfiles(allIds, W.event);
      writeLocalStore();
      if (issues.length) alert(issues.join("\n"));
      openWizardHandicapEntry(day);
    };
    $$('[data-teequickplus]').forEach(
      (cb) =>
        (cb.onchange = () => {
          const inp = $(`[data-teequickhcp="${cb.dataset.teequickplus}"]`);
          if (inp) storeValue(inp);
        }),
    );
    $("#closeQuickHandicaps").onclick = () =>
      $("#modalShade").classList.remove("open");
    $("#saveQuickHandicaps").onclick = () => {
      gaInputs.forEach(storeGaValue);
      inputs.forEach((inp) => storeValue(inp, false));
      saveEventGaToPlayerProfiles(allIds, W.event);
      if (day === 1 && W.event.days === 2 && !W.event.gaHandicapSetAt && String(W.event.course1) === String(W.event.course2))
        EVENT_TEES.forEach((tee) => {
          const d1 = teeHandicapsFor(1, tee, W.event),
            d2 = teeHandicapsFor(2, tee, W.event),
            initial = initialDay1[tee] || {};
          wizardPlanningPlayers(2)
            .filter((id) => id !== NO_PARTNER_ID)
            .forEach((id) => {
              if (
                d1[id] != null &&
                d1[id] !== "" &&
                (d2[id] == null || d2[id] === "" || d2[id] === initial[id])
              )
                d2[id] = d1[id];
            });
        });
      eventPlayerCategories(day,W.event).forEach(category=>selectEventTee(day,selectedEventTee(day,W.event,category),W.event,category));
      if (W.gaUpdateOnly) {
        store.event = JSON.parse(JSON.stringify(W.event));
        store.event.handicapUpdatePendingAt = new Date().toISOString();
        delete store.event.finalUpdateCloudSentAt;
        save();
        $("#modalShade").classList.remove("open");
        renderHome();
        alert(
          "Updated GA Handicaps have been saved. Press Send All Set — Final Update to send them to the players' phones.",
        );
        return;
      }
      writeLocalStore();
      $("#modalShade").classList.remove("open");
      renderStep2();
    };
    if (inputs[0]) inputs[0].focus();
  }
  function openPublishedGaHandicapUpdate() {
    if (!store.event) return;
    const scoreEntry = Array.from(
      { length: store.event.days || 1 },
      (_, index) => firstDayScoreEntry(index + 1),
    ).find(Boolean);
    if (scoreEntry)
      return alert(
        `GA Handicaps cannot be changed because scoring has begun. ${player(scoreEntry.scorerId)?.name || "A player"} has an entry on Hole ${scoreEntry.hole}.`,
      );
    const event = JSON.parse(JSON.stringify(store.event));
    refreshEventCourseSnapshot(event);
    eventDays(event).forEach(day => ["men", "women"].forEach(category =>
      captureEventTeeNames(event, day, category, authoritativeMasterCourse(event["course" + day]), true),
    ));
    W = {
      step: 2,
      newEvent: false,
      gaUpdateOnly: true,
      event,
      invites: new Map(),
      competitions: new Set(event.competitions || []),
      benefits: JSON.parse(JSON.stringify(event.benefits || {})),
      benefitOpen: new Set(),
    };
    Object.entries(event.invitationStatus || {}).forEach(([id, status]) =>
      sharedPositionId(id,W.event)===String(id) && W.invites.set(String(id), status),
    );
    if (!W.invites.size)
      (event.confirmed || []).forEach((id) =>
        sharedPositionId(id,W.event)===String(id) && W.invites.set(String(id), "accepted"),
      );
    openWizardHandicapEntry(1);
  }
  document.addEventListener("click", (e) => {
    let t = e.target;
    if (t.dataset.winvite) {
      const id = String(t.dataset.winvite);
      W.invites.set(id, id === NO_PARTNER_ID ? "accepted" : "awaiting");
      renderStep2();
    }
    if (t.dataset.wstatus) {
      let [id, s] = t.dataset.wstatus.split("|");
      if(s==="declined" && W.event.sharedPositions)delete W.event.sharedPositions[String(id)];
      W.invites.set(String(id), s);
      if (s === "accepted") {
        W.event.dayAvailability = W.event.dayAvailability || {};
        W.event.dayAvailability[String(id)] = W.event.dayAvailability[
          String(id)
        ] || { 1: true, 2: true };
      }
      renderStep2();
    }
    if (t.dataset.wpinfo)
      playerInfo(t.dataset.wpinfo, W.invites.get(t.dataset.wpinfo) || "");
    if (t.dataset.wpinactive) {
      let p = player(t.dataset.wpinactive);
      if (
        p &&
        confirm(
          `Make ${p.name} inactive?\n\nThe player remains in Away Golf history.`,
        )
      ) {
        p.rosterActive = false;
        if(W.event.sharedPositions)delete W.event.sharedPositions[String(p.id)];
        W.invites.delete(p.id);
        save();
        renderStep2();
      }
    }
    if (t.dataset.wpreactivate) {
      let p = player(t.dataset.wpreactivate);
      if (p) {
        p.rosterActive = true;
        save();
        renderStep2();
      }
    }
  });
  function eclecticCourseGroups(event = W.event) {
    const groups = new Map();
    eventDays(event).forEach((day) => {
      const courseId = event["course" + day],
        courseName = (course(courseId)?.name || "").trim(),
        key = courseId ? `id:${courseId}` : `name:${courseName.toLowerCase()}`;
      if (!courseId && !courseName) return;
      if (!groups.has(key))
        groups.set(key, { key, courseId: String(courseId || ""), courseName: courseName || `Day ${day} course`, days: [] });
      groups.get(key).days.push(day);
    });
    return [...groups.values()].filter((group) => group.days.length >= 2);
  }
  function selectedEclecticGroups(event = W.event) {
    const eligible = eclecticCourseGroups(event), selected = event.eclecticCourseIds;
    if (!Array.isArray(selected) || !selected.length) return eligible;
    return eligible.filter((group) => selected.includes(group.key));
  }
  function syncEclecticCompetitionDays(event = W.event) {
    event.competitionDays ||= {};
    event.competitionDays.eclectic = [...new Set(selectedEclecticGroups(event).flatMap((group) => group.days))].sort((a, b) => a - b);
  }
  function eclecticCourseChoiceHtml(event = W.event) {
    const groups = eclecticCourseGroups(event), selected = new Set(selectedEclecticGroups(event).map((group) => group.key));
    return `<div class="ntpBox eclecticCourseChoices"><b>Select the repeated course Eclectic competition(s)</b>${groups.map((group) => `<label><input style="width:auto" type="checkbox" data-eclecticcourse="${esc(group.key)}" ${selected.has(group.key) ? "checked" : ""}> ${esc(group.courseName)} — Days ${group.days.join(" and ")}</label>`).join("")}<small>Each selected course has its own Eclectic leaderboard using only the rounds played on that course.</small></div>`;
  }
  function compDefinitions() {
    let d = W.event.days,
      eclecticGroups = (() => {
        const groups = new Map();
        eventDays(W.event).forEach((day) => {
          const courseId = W.event["course" + day], courseName = (course(courseId)?.name || "").trim(),
            key = courseId ? `id:${courseId}` : `name:${courseName.toLowerCase()}`;
          if (!courseId && !courseName) return;
          if (!groups.has(key)) groups.set(key, { key, days: [] });
          groups.get(key).days.push(day);
        });
        return [...groups.values()].filter((group) => group.days.length >= 2);
      })(),
      defs = [
        {
          id: d == 1 ? "single" : "combined",
          name: "Single Stableford",
          desc:
            d == 1
              ? "Highest Stableford score over the round."
              : "Choose daily winners, the overall Event winner or both.",
          tag: d == 1 ? "INDIVIDUAL" : "FORMAT CHOICE",
        },
        {
          id: "stroke",
          name: "Stroke",
          desc: "Lowest gross or net stroke total. Choose whether every stroke counts or each hole has a maximum score.",
          tag: "INDIVIDUAL STROKE",
        },
        {
          id: "fourball",
          name: "4BBB Stableford",
          desc:
            d == 1
              ? "Played by each 4BBB pair."
              : "Separate 4BBB Stableford on the selected days.",
          tag: "2-PLAYER PAIRS",
        },
        {
          id: "teamPutts",
          name: "Putting Competition",
          desc: "Choose a 4BBB pairs event or a four-player team event.",
          tag: "PAIRS OR TEAM",
        },
        {
          id: "best3of4",
          name: "Best 3 of 4 Stableford",
          desc:
            d == 1
              ? "Best three Stableford scores from the four-person team on every hole."
              : "Separate Best 3 of 4 event on each day.",
          tag: "4-PERSON TEAM",
        },
        {
          id: "ambrose",
          name: "Ambrose",
          desc: "One team stroke score per hole. Record the selected drive and optionally use a second card to check it.",
          tag: "TEAM STROKE",
        },
        {
          id: "yellowBall",
          name: "Yellow Ball",
          desc:
            d == 1
              ? "The team ball rotates through the playing group. Its Stableford score is recorded until it is lost or the round is complete."
              : "Choose the playing days for the rotating team ball event.",
          tag: "TEAM ROTATION",
        },
        {
          id: "par3",
          name: "Par 3 Competition",
          desc: "Choose daily or multi-day format",
          tag: "PAR 3",
        },
        {
          id: "ntp",
          name: "Nearest the Pin",
          desc:
            d == 1
              ? "Choose one or two NTPs."
              : "Tick the days you want to run NTP. You can also choose two NTP holes for the final day. The app will suggest suitable holes during setup.",
          tag: "NTP",
        },
        {
          id: "capTeams",
          name: "Black Cap – White Cap",
          desc: "Balanced GA teams across all days; daily best all-but-one Stableford scores.",
          tag: "TRIP TEAMS",
        },
        {
          id: "scratch",
          name: "Scratch",
          desc: "Optional event for low-handicap players and professionals.",
          tag: "OPTIONAL",
        },
      ];
    if (d > 1)
      defs.push({
        id: "eclectic",
        name: "Eclectic",
        desc: eclecticGroups.length
          ? "Best Stableford score on each hole over repeated rounds at the same course."
          : "Available when the same course is played on two or more playing days.",
        tag: eclecticGroups.length
          ? `${eclecticGroups.length} REPEATED COURSE${eclecticGroups.length === 1 ? "" : "S"}`
          : "NO REPEATED COURSE",
        unavailable: !eclecticGroups.length,
      });
    return defs;
  }
  function benefitSummary(id) {
    let b = id === "capTeams" ? capRewardBenefit(W.benefits[id]) : W.benefits[id] || {};
    if (["best3of4", "yellowBall"].includes(id)) {
      const mode =
        b.mode ||
        (id === "yellowBall" && (b.balls || b.plus || b.extra)
          ? "prize"
          : "");
      if (mode === "lottery" && b.contribution)
        return `Currently Set at Lottery Pool — $${b.contribution} per team member`;
      if (mode === "prize") {
        let p = [];
        if (b.balls) p.push(`${b.balls} Ball${+b.balls === 1 ? "" : "s"}`);
        if (b.plus) p.push(id === "capTeams" && !b.balls ? "Prize" : "+ Prize");
        if (b.extra) p.push(`(${b.extra})`);
        return p.length ? `Currently Set at ${p.join(" ")}` : "Not Yet Set";
      }
      return "Not Yet Set";
    }
    let p = [];
    if (b.balls) p.push(`${b.balls} Ball${+b.balls === 1 ? "" : "s"}`);
    if (b.plus) p.push(id === "capTeams" && !b.balls ? "Prize" : "+ Prize");
    if (b.extra) p.push(`(${b.extra})`);
    return p.length ? `Currently Set at ${p.join(" ")}` : "Not Yet Set";
  }
  function benefitHtml(id) {
    if (["single","combined"].includes(id)) return stablefordBenefitsHtml();
    let b = W.benefits[id] || {},
      open = W.benefitOpen.has(id);
    const supportsLottery = ["best3of4", "yellowBall"].includes(id);
    const benefitMode =
      b.mode ||
      (id === "yellowBall" && (b.balls || b.plus || b.extra)
        ? "prize"
        : "");
    const contributionChoices =
      id === "yellowBall" ? [5, 10, 15, 20] : [10, 20, 30, 40, 50];
    const prizeModeLabel = id === "yellowBall" ? "Balls / Prize" : "Prize";
    const ambroseDrives =
      id === "ambrose"
        ? `<label class="ambroseMinimumInline"><span>Required drives per player</span><select id="ambroseMinimumDrives">${[2, 3, 4].map((n) => `<option value="${n}" ${+W.event.ambroseMinimumDrives === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`
        : "";
    let body =
      supportsLottery
        ? `<div class="benefit ${open ? "open" : ""}"><div class="benefitGrid"><label>Win Benefit<select data-bmode="${id}"><option value="" ${!benefitMode ? "selected" : ""}>Not Yet Set</option><option value="lottery" ${benefitMode === "lottery" ? "selected" : ""}>Lottery Pool</option><option value="prize" ${benefitMode === "prize" ? "selected" : ""}>${prizeModeLabel}</option></select></label>${benefitMode === "lottery" ? `<label>Losing Team(s) Contribution<div class="benefitSuffix"><select data-bcontrib="${id}"><option value="">Not Yet Set</option>${contributionChoices.map((x) => `<option value="${x}" ${b.contribution == x ? "selected" : ""}>$${x}</option>`).join("")}</select><span>per team member</span></div></label>` : ""}${benefitMode === "prize" ? prizeFields(id, b) : ""}</div></div>`
        : `<div class="benefit ${open ? "open" : ""}"><div class="benefitGrid">${prizeFields(id, b)}</div></div>`;
    return `<div class="benefitControlRow ${id === "ambrose" ? "ambroseBenefitRow" : ""}"><button class="soft benefitBtn" data-benefit="${id}">Set/Change Win Benefit</button><div class="benefitCurrent ${benefitSummary(id) === "Not Yet Set" ? "notSet" : ""}">${benefitSummary(id)}</div>${ambroseDrives}</div>${body}`;
  }
  function prizeFields(id, b, ballsOnly = false) {
    if (id === "capTeams" && !ballsOnly) return capRewardFields(b);
    const ballChoices = id === "yellowBall" ? [1, 2, 3] : [1, 2, 3, 4, 6, 8, 12];
    const balls = `<label>Balls per Winner<select data-bballs="${id}"><option value="">Not Yet Set</option>${ballChoices.map((x) => `<option value="${x}" ${+b.balls === x ? "selected" : ""}>${x} Ball${x === 1 ? "" : "s"}</option>`).join("")}</select></label>`;
    return balls + (id === "dailyStableford" || ballsOnly ? "" : `<label>Additional reward<span style="display:block;margin-top:9px"><input style="width:auto" type="checkbox" data-bplus="${id}" ${b.plus ? "checked" : ""}> + Prize</span></label><label class="prizeLabel"><span>Specify Prize</span><input data-bextra="${id}" value="${esc(b.extra || "")}" placeholder="Optional"></label>`);
  }
  function competitionScheduleHtml(id) {
    const days = competitionDays(id, W.event), all = eventDays(W.event),
      compatible = competitionCompatibleDays(id, W.event), compatibleSet = new Set(compatible),
      hasRestrictedDays = compatible.length !== all.length;
    if (id === "capTeams" || (id === "scratch" && ["aggregate", "bestAggregate"].includes(W.event.scratchFormat)) || (id === "par3" && ["overallPlayers","overallPairs"].includes(par3Mode(W.event)))) return `<p class="hint">Covers all ${all.length} event day(s).</p>`;
    return `${all.length > 1 ? `<div class="competitionDayChoices"><b>Playing days</b><label class="${hasRestrictedDays ? "scoreMethodUnavailable" : ""}"><input type="checkbox" data-compalldays="${id}" ${days.length===all.length?"checked":""} ${hasRestrictedDays?"disabled":""}> All Days</label>${all.map(day=>`<label class="${compatibleSet.has(day)?"":"scoreMethodUnavailable"}"><input type="checkbox" data-compday="${id}|${day}" ${days.includes(day)?"checked":""} ${compatibleSet.has(day)?"":"disabled"}> Day ${day}</label>`).join("")}${hasRestrictedDays ? `<small class="competitionMethodNote">Grey days use a final-score method that cannot calculate this competition.</small>` : ""}</div>` : ""}${id==="combined" && days.length ? `<label class="countingRounds">Overall Event Stableford: counting rounds<select id="stablefordCountingRounds">${Array.from({length:days.length},(_,i)=>`<option value="${i+1}" ${(+(W.event.stablefordCountingRounds||days.length))===i+1?"selected":""}>Best ${i+1} of ${days.length}</option>`).join("")}</select><small>A golfer needs this many completed rounds to qualify for the overall prize. A missed day does not count as a round.</small></label>`:""}`;
  }
  function par3FormatHtml(event) {
    const mode = par3Mode(event), choice = (value, label) => `<label class="par3FormatChoice"><input type="radio" name="p3Mode" value="${value}" ${mode === value ? "checked" : ""}><span>${label}</span></label>`;
    return `<div class="ntpBox par3FormatBox"><b>Select Format</b><div class="par3FormatSection"><h5>Daily</h5>${choice("dailyPairs", "a) Aggregate Stableford points on the Par 3s for each 4BBB team")}${choice("dailyTeams", "b) Aggregate Stableford points on the Par 3s for each four-person team")}</div>${+event.days > 1 ? `<div class="par3FormatSection"><h5>Multi-day</h5>${choice("overallPlayers", "a) Aggregate Stableford points on the Par 3s for each player over the event")}${choice("overallPairs", `b) Aggregate Stableford points on the Par 3s for each 4BBB team — partners are the Day ${event.days} 4BBB partners`)}</div>` : ""}</div>`;
  }
  function lastDayNtpHtml(event) {
    const day = eventDays(event).length, enabled = competitionDays("ntp",event).includes(day);
    return `<div class="ntpBox lastDayNtpBox"><fieldset class="lastDayNtpChoices ${enabled ? "" : "inactive"}" ${enabled ? "" : "disabled"}><legend>NTPs on the last day (Day ${day})</legend>${[1,2].map(n => `<label><input style="width:auto" type="radio" name="lastDayNtpCount" value="${n}" ${enabled && ntpCount(day,event) === n ? "checked" : ""}> ${n === 1 ? "One" : "Two"}</label>`).join(" ")}</fieldset><small class="lastDayNtpHelp">${enabled ? "Choose one or two NTP holes for the final day. The app will suggest suitable holes on the NTP setup page." : `<strong>Tick Day ${day} in Playing days above to choose one or two NTP holes for the final day.</strong>`}</small></div>`;
  }
  function renderStep3() {
    normaliseStablefordBenefits(W.benefits);
    const setupMethods={holeByHole:"On course by players and confirmed by Markers hole-by-hole",fullCardPlayer:"After round — strokes entered hole-by-hole by a Player",finalGross:"After round — final Gross Strokes only",finalStableford:"After round — final Stableford points only"},setupMethodFor=day=>W.event.scoringMethods?.["day"+day]||"holeByHole",setupConflicts=day=>[...W.competitions].filter(id=>competitionDays(id,W.event).includes(+day)&&!finalScoreCompetitionAllowed(id,setupMethodFor(day)));
    const stablefordId = W.event.days === 1 ? "single" : "combined",
      previousId = W.event.days === 1 ? "combined" : "single";
    if (W.competitions.has(previousId)) {
      W.competitions.delete(previousId);
      W.competitions.add(stablefordId);
      if (W.event.competitionDays?.[previousId]) {
        W.event.competitionDays[stablefordId] = W.event.competitionDays[previousId];
        delete W.event.competitionDays[previousId];
      }
    }
    let defs = compDefinitions(),
      ec = defs.find((x) => x.id === "eclectic");
    const ambroseOn = W.competitions.has("ambrose");
    if (ambroseOn && W.event.days === 1)
      [...W.competitions].forEach((id) => {
        if (!["ambrose", "ntp"].includes(id)) W.competitions.delete(id);
      });
    if (ec?.unavailable) W.competitions.delete("eclectic");
    let templateText = store.template
      ? "Your previous event choices are loaded as the starting point. Change only what is different this time."
      : "Set up your first event. These choices will be retained as the starting point for your next event.";
    W.event.scratchMaxHcp = Number.isFinite(+W.event.scratchMaxHcp)
      ? +W.event.scratchMaxHcp
      : 10;
    W.event.scratchScoringMode =
      W.event.scratchScoringMode === "maxDoubleBogey"
        ? "maxDoubleBogey"
        : "stroke";
    W.event.scoringMethods ||= {};
    eventDays(W.event).forEach(day => W.event.scoringMethods["day" + day] ||= "holeByHole");
    if (eventDays(W.event).some(day => setupMethodFor(day) !== "holeByHole"))
      W.event.planAlternativeScoring = true;
    [...W.competitions].forEach(id => {
      const selectedDays = competitionDays(id,W.event),
        validDays = selectedDays.filter(day => finalScoreCompetitionAllowed(id,setupMethodFor(day)));
      if (validDays.length === selectedDays.length) return;
      if (competitionNeedsEverySelectedDay(id,W.event) || !validDays.length) {
        W.competitions.delete(id);
        return;
      }
      W.event.competitionDays ||= {};
      W.event.competitionDays[id] = validDays;
    });
    // Stroke is a net competition. Gross scoring belongs under Scratch,
    // where the organiser can apply the event's handicap eligibility limit.
    W.event.strokeResult = "net";
    W.event.strokeScoringMode ||= "allStrokes";
    W.event.strokeCountingMode ||= "daily";
    if (typeof W.event.strokeDailyResults !== "boolean") W.event.strokeDailyResults = W.event.strokeCountingMode === "daily";
    if (typeof W.event.strokeAggregateEnabled !== "boolean") W.event.strokeAggregateEnabled = W.event.strokeCountingMode !== "daily";
    W.event.strokeAggregateMode ||= W.event.strokeCountingMode === "bestAggregate" ? "bestAggregate" : "aggregate";
    if (W.competitions.has("eclectic")) syncEclecticCompetitionDays(W.event);
    const scoringMethodSetup = `<div class="scoringUseSetup"><div class="scoringUseQuestion"><b>Scoring to be completed using the App while playing</b><div class="scoringUseChoices"><label><input type="radio" name="planAlternativeScoring" value="no" ${W.event.planAlternativeScoring?"":"checked"}> Yes</label><label><input type="radio" name="planAlternativeScoring" value="yes" ${W.event.planAlternativeScoring?"checked":""}> No</label></div></div>${W.event.planAlternativeScoring ? `<div class="scoringMethodSetup"><h4>If the App is not being used for any round in the event, use this section to plan the scoring process.</h4><p class="hint">Choose one method for each playing day. Any competition that cannot be calculated from the selected score information will be greyed out.</p>${eventDays(W.event).map(day => `<div class="scoringMethodDay"><b>${W.event.days > 1 ? `Day ${day}` : "Playing Day"}</b><div class="scoringMethodChoices">${Object.entries(setupMethods).map(([value,label]) => `<label class="scoringMethodChoice ${setupMethodFor(day)===value?"selected":""}"><span>${label}</span><input type="checkbox" data-scoringmethod="${day}" value="${value}" ${setupMethodFor(day)===value?"checked":""}></label>`).join("")}</div>${setupConflicts(day).length ? `<small class="methodConflict">Incompatible competitions have been removed from this day.</small>` : ""}</div>`).join("")}</div>` : ""}</div>`;
    $("#wizardBody").innerHTML =
      `<h3>Competition Setup</h3><div class="templateNote">${templateText}</div>${scoringMethodSetup}${defs
        .map((c) => {
          let on = W.competitions.has(c.id),
            compatibleDays = competitionCompatibleDays(c.id, W.event),
            methodUnavailable = !compatibleDays.length || (competitionNeedsEverySelectedDay(c.id,W.event) && compatibleDays.length !== eventDays(W.event).length),
            disabled = c.unavailable || methodUnavailable || (ambroseOn && W.event.days === 1 && !["ambrose", "ntp"].includes(c.id)),
            methodReason = methodUnavailable ? `<div class="methodUnavailableReason">Unavailable with the selected final-score method${W.event.days > 1 ? "s" : ""}.</div>` : "";
          return `<div class="comp ${disabled ? "unavailable" : ""}"><div class="compTop"><input type="checkbox" data-comp="${c.id}" ${on ? "checked" : ""} ${disabled ? "disabled" : ""}><div><h4>${c.name}</h4><div class="hint">${c.desc}</div>${methodReason}${c.id === "combined" && on && !disabled ? `<div class="ntpBox starCompetitionBox"><b>Event Single Stableford Format</b><label><input style="width:auto" type="radio" name="singleFormat" value="daily" ${W.event.singleStablefordFormat === "daily" ? "checked" : ""}> Each selected day — a separate Single Stableford winner</label><label><input style="width:auto" type="radio" name="singleFormat" value="aggregate" ${!W.event.singleStablefordFormat || W.event.singleStablefordFormat === "aggregate" ? "checked" : ""}> Overall Event total — one overall winner only</label><label><input style="width:auto" type="radio" name="singleFormat" value="both" ${W.event.singleStablefordFormat === "both" ? "checked" : ""}> Both — daily winners plus the overall Event winner</label></div>` : ""}${on && !disabled ? (c.id === "eclectic" ? eclecticCourseChoiceHtml(W.event) : competitionScheduleHtml(c.id)) + benefitHtml(c.id) : ""}${c.id === "teamPutts" && on && !disabled ? `<div class="ntpBox puttingFormatBox"><b>Putting Competition Format</b><label><input style="width:auto" type="radio" name="puttingFormat" value="pairs" ${W.event.puttingFormat === "pairs" ? "checked" : ""}> 4BBB Pairs — the two partners' putts are added together</label><label><input style="width:auto" type="radio" name="puttingFormat" value="team" ${W.event.puttingFormat !== "pairs" ? "checked" : ""}> Four-Player Team — all four group members' putts are added together</label></div>` : ""}${c.id === "par3" && on && !disabled ? par3FormatHtml(W.event) : ""}${c.id === "ntp" && on && !disabled && W.event.days > 1 ? `<div class="ntpBox"><b>NTP Prizes</b><label><input style="width:auto" type="checkbox" id="ntpJackpot" ${W.event.ntpJackpot ? "checked" : ""}> NTP Holes Jackpot</label>${W.event.ntpJackpot ? `<div class="jackpotMode"><b>Jackpot destination</b><label><input style="width:auto" type="radio" name="ntpJackpotMode" value="final" ${W.event.ntpJackpotMode !== "rolling" ? "checked" : ""}> Final NTP — all unclaimed prizes build the event-ending jackpot</label><label><input style="width:auto" type="radio" name="ntpJackpotMode" value="rolling" ${W.event.ntpJackpotMode === "rolling" ? "checked" : ""}> Rolling — carry to the next NTP and reset when won</label></div>` : ""}<small class="ntpJackpotHelp">Choose a big final-hole jackpot or a rolling jackpot through the event.</small></div>` : ""}</div><span class="tag">${c.tag}</span></div></div>`;
        })
        .join("")}`;
    $$("[data-comp]").forEach(
      (x) =>
        (x.onchange = () => {
          x.checked
            ? W.competitions.add(x.dataset.comp)
            : W.competitions.delete(x.dataset.comp);
          if (x.checked && !competitionNeedsEverySelectedDay(x.dataset.comp,W.event)) {
            W.event.competitionDays ||= {};
            W.event.competitionDays[x.dataset.comp] = competitionCompatibleDays(x.dataset.comp,W.event);
          }
          if (x.checked && x.dataset.comp === "yellowBall")
            W.event.yellowBallDays = eventDays(W.event);
          if (x.checked && x.dataset.comp === "eclectic") {
            W.event.eclecticCourseIds = eclecticCourseGroups(W.event).map((group) => group.key);
            syncEclecticCompetitionDays(W.event);
          }
          if (x.checked && x.dataset.comp === "ambrose") {
            if (W.event.days === 1) W.competitions = new Set(["ambrose"]);
            W.event.ambroseScoringMode = W.event.ambroseScoringMode || "scorerOnly";
            W.event.ambroseMinimumDrives = +W.event.ambroseMinimumDrives || 3;
            W.event.ntpDay1Count = 0;
            W.event.ntpDay2Count = 0;
          }
          renderStep3();
        }),
    );
    $$('[data-scoringmethod]').forEach(choice => choice.onchange = () => {
      if (!choice.checked) return renderStep3();
      W.event.scoringMethods["day" + choice.dataset.scoringmethod] = choice.value;
      const day = +choice.dataset.scoringmethod;
      [...W.competitions].forEach(id => {
        if (!competitionDays(id,W.event).includes(day) || finalScoreCompetitionAllowed(id,choice.value)) return;
        if (competitionNeedsEverySelectedDay(id,W.event)) {
          W.competitions.delete(id);
          return;
        }
        W.event.competitionDays ||= {};
        W.event.competitionDays[id] = competitionDays(id,W.event).filter(selectedDay => selectedDay !== day);
        if (!W.event.competitionDays[id].length) W.competitions.delete(id);
      });
      renderStep3();
    });
    $$('[name="planAlternativeScoring"]').forEach(choice => choice.onchange = () => {
      W.event.planAlternativeScoring = choice.value === "yes";
      if (!W.event.planAlternativeScoring)
        eventDays(W.event).forEach(day => W.event.scoringMethods["day" + day] = "holeByHole");
      renderStep3();
    });
    $$("[data-benefit]").forEach(
      (x) =>
        (x.onclick = () => {
          W.benefitOpen.has(x.dataset.benefit)
            ? W.benefitOpen.delete(x.dataset.benefit)
            : W.benefitOpen.add(x.dataset.benefit);
          renderStep3();
        }),
    );
    const ambroseComp = $('[data-comp="ambrose"]')?.closest(".comp");
    if (ambroseComp && W.competitions.has("ambrose"))
      ambroseComp.insertAdjacentHTML(
        "beforeend",
        `<div class="ntpBox ambroseSetup"><b>Ambrose Scoring</b><small>Every team has one scorer. Choose whether every team also has a checking marker on the Groups &amp; Teams page.</small><div class="ambroseNtpChoice"><b>Nearest the Pin holes</b><label><input style="width:auto" type="radio" name="ambroseNtpCount" value="0" ${!W.competitions.has("ntp") ? "checked" : ""}> None</label><label><input style="width:auto" type="radio" name="ambroseNtpCount" value="1" ${W.competitions.has("ntp") && +W.event.ntpDay1Count === 1 ? "checked" : ""}> One</label><label><input style="width:auto" type="radio" name="ambroseNtpCount" value="2" ${W.competitions.has("ntp") && +W.event.ntpDay1Count === 2 ? "checked" : ""}> Two</label><small>The app selects suitable Par 3 holes automatically. You can change them on the NTP page.</small></div></div>`,
      );
    const scratchComp = $('[data-comp="scratch"]')?.closest(".comp");
    const strokeComp = $('[data-comp="stroke"]')?.closest(".comp");
    if (strokeComp && W.competitions.has("stroke")) {
      const strokeDays = competitionDays("stroke", W.event), total = strokeDays.length, best = Math.max(1, total - 1);
      strokeComp.insertAdjacentHTML("beforeend", `<div class="ntpBox strokeSetupBox"><section><b>Stroke Result</b><strong>Net only</strong><small>Gross scoring is available as a separate Scratch competition.</small></section><section><b>Maximum score on a hole</b><label><input style="width:auto" type="radio" name="strokeScoringMode" value="allStrokes" ${W.event.strokeScoringMode==="allStrokes"?"checked":""}> All Strokes Count</label><label><input style="width:auto" type="radio" name="strokeScoringMode" value="maxDoubleBogey" ${W.event.strokeScoringMode==="maxDoubleBogey"?"checked":""}> Maximum Double Bogey</label><label><input style="width:auto" type="radio" name="strokeScoringMode" value="maxTripleBogey" ${W.event.strokeScoringMode==="maxTripleBogey"?"checked":""}> Maximum Triple Bogey</label></section><section><b>Counting Scores</b><label><input style="width:auto" type="checkbox" name="strokeDailyResults" ${W.event.strokeDailyResults?"checked":""}> Daily prize — each selected day</label>${total > 1 ? `<label><input style="width:auto" type="checkbox" name="strokeAggregateEnabled" ${W.event.strokeAggregateEnabled?"checked":""}> Overall event prize</label><div class="strokeAggregateChoices ${W.event.strokeAggregateEnabled?"":"inactive"}"><label><input style="width:auto" type="radio" name="strokeAggregateMode" value="aggregate" ${W.event.strokeAggregateMode!=="bestAggregate"?"checked":""} ${W.event.strokeAggregateEnabled?"":"disabled"}> All ${total} rounds count</label><label><input style="width:auto" type="radio" name="strokeAggregateMode" value="bestAggregate" ${W.event.strokeAggregateMode==="bestAggregate"?"checked":""} ${W.event.strokeAggregateEnabled?"":"disabled"}> Best ${best} of ${total} rounds</label></div>` : ""}</section><small>Daily and overall Stroke prizes can run together. With Final-score entry, the caddie or official card must supply the already-capped competition total.</small></div>`);
    }
    if (scratchComp && W.competitions.has("scratch"))
      scratchComp.insertAdjacentHTML(
        "beforeend",
        `<div class="ntpBox scratchLimitBox"><label><b>Set Max Scratch Hcp</b><input id="scratchMaxHcp" type="number" step="1" value="${W.event.scratchMaxHcp}"></label><small>Players with a daily handicap of ${W.event.scratchMaxHcp} or less are included automatically. Players above ${W.event.scratchMaxHcp} are not included.</small><div class="scratchScoringMode"><b>Scratch Scoring</b><label><input style="width:auto" type="radio" name="scratchScoringMode" value="stroke" ${W.event.scratchScoringMode !== "maxDoubleBogey" ? "checked" : ""}> Pure Stroke — every stroke counts; a P withdraws the player from Scratch</label><label><input style="width:auto" type="radio" name="scratchScoringMode" value="maxDoubleBogey" ${W.event.scratchScoringMode === "maxDoubleBogey" ? "checked" : ""}> Maximum Double Bogey — the highest score is 2 over par; a P records 2 over par</label></div></div>`,
      );
    const ntpComp = $('[data-comp="ntp"]')?.closest(".comp");
    if (ntpComp && W.competitions.has("ntp") && W.event.days === 1)
      ntpComp.insertAdjacentHTML(
        "beforeend",
        `<div class="ntpBox"><b>Number of NTPs</b><label><input style="width:auto" type="radio" name="n1" value="1" ${W.event.ntpDay1Count != 2 ? "checked" : ""}> One</label><label><input style="width:auto" type="radio" name="n1" value="2" ${W.event.ntpDay1Count == 2 ? "checked" : ""}> Two</label></div>`,
      );
    if (W.competitions.has("capTeams")) {
      const ids = [...new Set(eventDays(W.event).flatMap(wizardPlanningPlayers))].filter(id => id !== NO_PARTNER_ID);
      $('[data-comp="capTeams"]')?.closest(".comp")?.insertAdjacentHTML("beforeend", capTeamsHtml(W.event, ids));
      bindCapTeams(W.event, ids, renderStep3);
    }
    if (scratchComp && W.competitions.has("scratch")) scratchComp.insertAdjacentHTML("beforeend", `<div class="ntpBox"><b>Scratch Format</b><label><input style="width:auto" type="radio" name="scratchFormat" value="daily" ${!["aggregate", "bestAggregate"].includes(W.event.scratchFormat) ? "checked" : ""}> Daily</label>${W.event.days > 1 ? `<label><input style="width:auto" type="radio" name="scratchFormat" value="aggregate" ${W.event.scratchFormat === "aggregate" ? "checked" : ""}> Score over full event — all ${W.event.days} rounds</label><label><input style="width:auto" type="radio" name="scratchFormat" value="bestAggregate" ${W.event.scratchFormat === "bestAggregate" ? "checked" : ""}> Score best ${Math.max(1, W.event.days - 1)} of ${W.event.days} rounds</label><p class="hint">Best rounds drops one round. A missed round or pick-up can be dropped; the required number of qualifying completed rounds must still be played.</p>` : ""}</div>`);
    if (ntpComp && W.competitions.has("ntp") && W.event.days > 1) ntpComp.insertAdjacentHTML("beforeend", lastDayNtpHtml(W.event));
    $("#wizardBody").onchange = (e) => {
      let t = e.target,
        id =
          t.dataset.breward ||
          t.dataset.bmode ||
          t.dataset.bballs ||
          t.dataset.bcontrib ||
          t.dataset.bplus ||
          t.dataset.bextra;
      if (t.dataset.compday || t.dataset.compalldays) {
        const [id, rawDay] = (t.dataset.compday || t.dataset.compalldays).split("|");
        W.event.competitionDays ||= {};
        const selected = new Set(competitionDays(id, W.event));
        if (t.dataset.compalldays) {
          if (!t.checked) { t.checked = true; return; }
          W.event.competitionDays[id] = eventDays(W.event);
        } else {
          t.checked ? selected.add(+rawDay) : selected.delete(+rawDay);
          if (!selected.size) { t.checked=true; return alert("Select at least one playing day, or untick the competition above."); }
          W.event.competitionDays[id] = [...selected].sort((a,b)=>a-b);
        }
        if (id === "yellowBall") W.event.yellowBallDays = [...W.event.competitionDays[id]];
        if (id === "combined") W.event.stablefordCountingRounds = Math.min(+W.event.stablefordCountingRounds || selected.size, W.event.competitionDays[id].length);
        renderStep3(); return;
      }
      if (t.id === "stablefordCountingRounds") W.event.stablefordCountingRounds = +t.value;
      if (t.name === "singleFormat") { W.event.singleStablefordFormat = t.value; renderStep3(); return; }
      if (t.name === "puttingFormat") W.event.puttingFormat = t.value;
      if (t.name === "scratchScoringMode")
        W.event.scratchScoringMode = t.value;
      if (t.name === "strokeScoringMode") { W.event.strokeScoringMode = t.value; renderStep3(); return; }
      if (t.name === "strokeDailyResults") {
        if (!t.checked && !W.event.strokeAggregateEnabled) { t.checked = true; return alert("Keep at least one Stroke prize selected."); }
        W.event.strokeDailyResults = t.checked; renderStep3(); return;
      }
      if (t.name === "strokeAggregateEnabled") {
        if (!t.checked && !W.event.strokeDailyResults) { t.checked = true; return alert("Keep at least one Stroke prize selected."); }
        W.event.strokeAggregateEnabled = t.checked; renderStep3(); return;
      }
      if (t.name === "strokeAggregateMode") { W.event.strokeAggregateMode = t.value; renderStep3(); return; }
      if (t.dataset.eclecticcourse) {
        const selected = new Set(selectedEclecticGroups(W.event).map((group) => group.key));
        t.checked ? selected.add(t.dataset.eclecticcourse) : selected.delete(t.dataset.eclecticcourse);
        if (!selected.size) {
          selected.add(t.dataset.eclecticcourse);
          t.checked = true;
          return alert("Select at least one repeated course for Eclectic, or untick Eclectic above.");
        }
        W.event.eclecticCourseIds = [...selected];
        syncEclecticCompetitionDays(W.event);
        renderStep3();
        return;
      }
      if (t.name === "ambroseScoringMode") W.event.ambroseScoringMode = t.value;
      if (t.id === "ambroseMinimumDrives")
        W.event.ambroseMinimumDrives = +t.value;
      if (t.name === "ambroseNtpCount") {
        const count = +t.value;
        if (count) W.competitions.add("ntp");
        else W.competitions.delete("ntp");
        W.event.ntpDay1Count = count;
        W.event.ntpDay2Count = count;
        renderStep3();
      }
      if (t.name === "p3Mode") { W.event.par3Mode = t.value; W.event.par3Format = t.value === "overallPairs" ? "aggregate" : "daily"; renderStep3(); }
      if (t.name === "scratchFormat") { W.event.scratchFormat = t.value; renderStep3(); }
      if (t.name === "lastDayNtpCount") { if (!competitionDays("ntp",W.event).includes(+W.event.days) || ![1,2].includes(+t.value)) return; W.event.ntpCounts ||= {}; W.event.ntpCounts["day" + W.event.days] = +t.value; if (W.event.days <= 2) W.event["ntpDay" + W.event.days + "Count"] = +t.value; }
      if (t.dataset.yellowballday) {
        const day = +t.dataset.yellowballday,
          selectedDays = new Set(
            (W.event.yellowBallDays || [1, 2]).map(Number),
          );
        t.checked ? selectedDays.add(day) : selectedDays.delete(day);
        if (!selectedDays.size) {
          selectedDays.add(day);
          t.checked = true;
          alert("Yellow Ball must be played on at least one day.");
        }
        W.event.yellowBallDays = [...selectedDays].sort();
      }
      if (t.name === "n1") W.event.ntpDay1Count = +t.value;
      if (t.name === "n2") W.event.ntpDay2Count = +t.value;
      if (t.id === "ntpJackpot") {
        W.event.ntpJackpot = t.checked;
        renderStep3();
      }
      if (t.name === "ntpJackpotMode") W.event.ntpJackpotMode = t.value;
      if (t.id === "scratchMaxHcp") {
        W.event.scratchMaxHcp = Number.isFinite(+t.value) ? +t.value : 10;
        renderStep3();
      }
      if (id) {
        W.benefits[id] = W.benefits[id] || {};
        if (t.dataset.breward) W.benefits[id].rewardChoice = t.value;
        if (t.dataset.bmode) W.benefits[id].mode = t.value;
        if (t.dataset.bballs) W.benefits[id].balls = +t.value || "";
        if (t.dataset.bcontrib) W.benefits[id].contribution = +t.value || "";
        if (t.dataset.bplus) W.benefits[id].plus = t.checked;
        if (t.dataset.bextra) W.benefits[id].extra = t.value;
        W.benefitOpen.add(id);
        renderStep3();
      }
    };
  }
  function renderStep4() {
    W.event.preferredLiesByDay = W.event.preferredLiesByDay || {
      day1: Boolean(W.event.preferredLies),
      day2: Boolean(W.event.preferredLies),
    };
    W.event.preferredLiesAreaByDay = W.event.preferredLiesAreaByDay || {
      day1: W.event.preferredLiesArea || "general",
      day2: W.event.preferredLiesArea || "general",
    };
    const putting = W.competitions.has("teamPutts"),
      defaultRules = puttingRulesText(W.event);
    const txt = W.event.puttingRulesCustom || defaultRules,
      editing = Boolean(W.editPuttingRules);
    const preferredCard = (day) => {
      const key = `day${day}`,
        pref = Boolean(W.event.preferredLiesByDay[key]),
        courseName = course(W.event["course" + day])?.name;
      return `<div class="ruleCard preferredCard"><h4>${W.event.days > 1 ? `Day ${day} — ${esc(courseName || "Course")}` : "Preferred Lies"}</h4><div class="preferredLine"><div class="preferredStatus ${pref ? "yes" : ""}">${pref ? "Yes" : "No"}</div><div class="preferredDefault">${pref ? `Preferred lies are in use ${W.event.days > 1 ? `on Day ${day}` : "for this event"}.` : "Play the ball as it lies."}</div><button type="button" class="soft" data-change-preferred="${day}">Change</button></div>${pref ? `<div class="prefArea"><label>Preferred Lies Apply<select data-pref-area="${day}"><option value="general" ${W.event.preferredLiesAreaByDay[key] === "general" ? "selected" : ""}>In the General Area</option><option value="fairway" ${W.event.preferredLiesAreaByDay[key] === "fairway" ? "selected" : ""}>On the closely mown part of the course</option></select></label></div>` : ""}</div>`;
    };
    $("#wizardBody").innerHTML =
      `<div class="rulesHead"><div><h3>Rules</h3><p class="hint">Set any conditions that differ from normal play.</p></div><span class="rulesBadge">EVENT RULES</span></div>
 <div class="preferredDayGrid ${W.event.days > 1 ? "twoDays" : ""}">${eventDays(W.event).map(preferredCard).join("")}</div>
 ${putting ? `<div class="ruleCard puttingRules"><div class="autoRuleHead"><div><h4>Putting Competition Rules</h4><p class="hint">Included automatically because Putting Competition is selected.</p></div><div class="ruleHeadBtns"><span class="autoTag">AUTOMATIC</span><button type="button" class="soft miniRuleBtn" id="editPutting">${editing ? "Done" : "Edit"}</button></div></div>${editing ? `<textarea id="puttingRulesEdit" rows="13">${esc(txt)}</textarea>` : `<div class="puttingRuleText">${esc(txt)}</div>`}</div>` : ""}
 ${W.competitions.has("scratch") ? `<div class="ruleCard scratchRules"><div class="autoRuleHead"><div><h4>Scratch Competition Rules</h4><p class="hint">Included automatically because Scratch is selected.</p></div><span class="autoTag">AUTOMATIC</span></div><div class="puttingRuleText">${esc(scratchRulesText(W.event))}</div></div>` : ""}
 ${W.competitions.has("ambrose") ? `<div class="ruleCard ambroseRules"><div class="autoRuleHead"><div><h4>Ambrose Rules</h4><p class="hint">Included automatically because Ambrose is selected.</p></div><span class="autoTag">AUTOMATIC</span></div><div class="puttingRuleText">${esc(ambroseRulesText(W.event))}</div></div>` : ""}
 <div class="ruleCard"><div class="ruleSectionHead"><div><h4>Special Rules</h4><p class="hint">Add each separate instruction as a bullet point. Press Enter for the next bullet.</p></div><button type="button" class="soft miniRuleBtn" id="clearSpecial">Clear</button></div><ul id="specialRules" class="specialRulesEditor" contenteditable="true" role="textbox" aria-label="Special Rules">${specialRulesEditorHtml(W.event.specialRules)}</ul></div>
 <div class="rulesPreview ${W.rulesPreviewAck ? "acknowledged" : ""}"><div><b>Player acknowledgement</b><span>${W.rulesPreviewAck ? "Acknowledgement recorded for this preview." : "Players see the event rules before scoring begins."}</span></div><button type="button" class="gotItPreview" id="gotItPreview">${W.rulesPreviewAck ? "✓ Got It" : "Got It"}</button></div>`;
    $$('[data-change-preferred]').forEach((button) => {
      button.onclick = () => {
        const day = +button.dataset.changePreferred,
          key = `day${day}`;
        W.event.preferredLiesByDay[key] =
          !W.event.preferredLiesByDay[key];
        if (!W.event.preferredLiesByDay[key])
          W.event.preferredLiesAreaByDay[key] = "general";
        W.event.preferredLies = W.event.preferredLiesByDay.day1;
        W.event.preferredLiesArea = W.event.preferredLiesAreaByDay.day1;
        renderStep4();
      };
    });
    $$('[data-pref-area]').forEach((select) => {
      select.onchange = () => {
        const key = `day${select.dataset.prefArea}`;
        W.event.preferredLiesAreaByDay[key] = select.value;
        if (key === "day1") W.event.preferredLiesArea = select.value;
      };
    });
    if ($("#editPutting"))
      $("#editPutting").onclick = () => {
        W.editPuttingRules = !W.editPuttingRules;
        renderStep4();
      };
    if ($("#puttingRulesEdit"))
      $("#puttingRulesEdit").oninput = (e) =>
        (W.event.puttingRulesCustom = e.target.value);
    const specialRulesEditor = $("#specialRules");
    specialRulesEditor.oninput = (e) =>
      (W.event.specialRules = specialRuleLines(e.target.innerText).join("\n"));
    $("#clearSpecial").onclick = () => {
      W.event.specialRules = "";
      renderStep4();
    };
    $("#gotItPreview").onclick = () => {
      W.rulesPreviewAck = !W.rulesPreviewAck;
      renderStep4();
    };
  }
  function renderStep5() {
    const ntpOn = W.competitions.has("ntp");
    if (!ntpOn) {
      $("#wizardBody").innerHTML =
        `<div class="ntpHead"><div><h3>Nearest the Pin</h3><p class="hint">NTP hole selection</p></div><span class="rulesBadge">NTP</span></div><div class="ruleCard"><h4>Nearest the Pin is not included in this event.</h4><p class="hint">There is nothing to set up on this page.</p></div>`;
      return;
    }
    W.event.ntpSelections = W.event.ntpSelections || {};
    W.event.ntpSelectionSources = W.event.ntpSelectionSources || {};
    const par3s = (id, day) => {
      let v = eventCourseScorecard(day, W.event),
        r = [];
      for (let i = 0; i < 18; i++)
        if (+v.par?.[i] === 3)
          r.push({
            hole: i + 1,
            index: String(v.index?.[i] ?? ""),
            metres: courseHoleDistance(v, i),
            distanceUnit: courseDistanceAbbrev(v),
          });
      let rank = (x) => {
        let n = parseInt(x.index.split("/")[0], 10);
        return Number.isFinite(n) ? n : -1;
      };
      return r.sort((x, y) => rank(y) - rank(x) || x.hole - y.hole);
    };
    const ensure = (key, id, count) => {
      let ch = par3s(id, +key.replace("day", "")),
        v = Array.isArray(W.event.ntpSelections[key])
          ? W.event.ntpSelections[key].map(Number)
          : [];
      const day = +key.replace("day", ""),
        source = `${String(id || "")}|${selectedEventTee(day, W.event)}`;
      if (W.event.ntpSelectionSources[key] !== source) v = [];
      v = v
        .filter((h, i) => ch.some((x) => x.hole === h) && v.indexOf(h) === i)
        .slice(0, count);
      for (let x of ch) {
        if (v.length >= count) break;
        if (!v.includes(x.hole)) v.push(x.hole);
      }
      W.event.ntpSelections[key] = v;
      W.event.ntpSelectionSources[key] = source;
      return ch;
    };
    const startLabel = (day) => {
      const method = startMethodFor(W.event, day),
        holes = startHolesFor(W.event, day);
      if (method === "shotgun") return "Today is a Shotgun start";
      if (method === "two")
        return `Starting tees today are Holes ${holes[0]} and ${holes[1]}`;
      return `Starting tee today is Hole ${holes[0]}`;
    };
    const row = (day, key, slot, ch, cid) => {
      let sel = W.event.ntpSelections[key][slot],
        open = W.ntpChange === `${key}:${slot}`,
        used = W.event.ntpSelections[key].filter((_, i) => i !== slot),
        x = ch.find((q) => q.hole === sel);
      return `<div class="ntpSelectCard"><div class="ntpDay"><b>${day}${W.event.ntpSelections[key].length > 1 ? ` — NTP ${slot + 1}` : ""}</b><span>${esc(course(cid)?.name || "Course")}</span></div><div class="ntpSelected"><div><small>SELECTED</small><strong>Hole ${sel || "—"}</strong><span>${x ? `Par 3${x.metres ? ` · ${x.metres} ${x.distanceUnit}` : ""}${x.index ? ` · Index ${esc(x.index)}` : ""}` : ""}</span></div><button type="button" class="soft" data-ntpchange="${key}:${slot}">${open ? "Close" : "Change"}</button></div>${open ? `<div class="ntpChoices"><b>Choose another Par 3</b>${ch.map((q) => `<button type="button" class="ntpChoice ${q.hole === sel ? "selected" : ""} ${used.includes(q.hole) ? "used" : ""}" ${used.includes(q.hole) ? "disabled" : ""} data-ntppick="${key}:${slot}:${q.hole}"><span>Hole ${q.hole}</span><small>${q.metres ? q.metres + " " + q.distanceUnit + " · " : ""}${q.index ? "Index " + esc(q.index) : ""}${q.hole === sel ? " · Selected" : ""}</small></button>`).join("")}</div>` : ""}</div>`;
    };
    const dayHead = (day, key) =>
      `<div class="ntpDayHeading"><h4>${W.event.days === 1 ? "NTP Hole" : `Day ${day}`}</h4><strong>${esc(startLabel(day))}</strong>${W.event.ntpSelections[key].length === 2 ? `<button type="button" class="soft" data-ntpswap="${key}">⇄ Swap NTP Order</button>` : ""}</div>`;
    const printableNtpCards = competitionDays("ntp", W.event).flatMap((day) => {
      const cid = W.event["course" + day];
      return (W.event.ntpSelections?.["day" + day] || []).map((hole) => ({
        courseName: course(cid)?.name || "Course",
        hole: +hole,
      }));
    });
    const ntpPrintHtml = printableNtpCards.length
      ? `<section class="ntpPrintSection"><div class="ntpPrintHeading"><div><h4>Printable NTP Cards</h4><p>Print, cut out and place the matching card with the on-green NTP marker.</p></div><button type="button" class="soft" id="printNtpCards">Print NTP Cards</button></div><div class="ntpPrintCards">${printableNtpCards.map((card) => `<article class="ntpPrintCard"><header><div><small>AWAY GOLF SCORER</small><strong>NTP</strong></div><img src="away-golf-mascot-mini.png" alt=""></header><h5>${esc(card.courseName)}</h5><h6>Hole ${card.hole || "—"}</h6><div class="ntpPrintLines"><span></span><span></span><span></span><span></span></div></article>`).join("")}</div></section>`
      : "";
    $("#wizardBody").innerHTML =
      `<div class="ntpHead"><div><h3>Nearest the Pin</h3><p class="hint">The easiest-rated Par 3 holes have been selected automatically. Use Change only if you want a different hole.</p></div><span class="rulesBadge">NTP</span></div>${competitionDays("ntp", W.event).map(day=>{
        const key="day"+day, cid=W.event["course"+day], count=ntpCount(day,W.event), choices=ensure(key,cid,count);
        return `<div class="ntpDayGroup">${dayHead(day,key)}<label>Number of NTP holes<select data-ntpcount="${day}"><option value="1" ${count===1?"selected":""}>One</option><option value="2" ${count===2?"selected":""}>Two</option></select></label>${Array.from({length:count},(_,i)=>row(`Day ${day}`,key,i,choices,cid)).join("")}</div>`;
      }).join("")}${ntpPrintHtml}<div class="ntpInfo"><b>During play</b><span>On each NTP hole, players can confirm that they put their name on the NTP marker. The latest confirmed entry on each hole becomes the current NTP holder.</span></div>`;
    if ($("#printNtpCards")) $("#printNtpCards").onclick = () => window.print();
    $$("[data-ntpcount]").forEach(input=>input.onchange=()=>{
      W.event.ntpCounts ||= {}; W.event.ntpCounts["day"+input.dataset.ntpcount]=+input.value; renderStep5();
    });
    $$("[data-ntpchange]").forEach(
      (b) =>
        (b.onclick = () => {
          W.ntpChange =
            W.ntpChange === b.dataset.ntpchange ? "" : b.dataset.ntpchange;
          renderStep5();
        }),
    );
    $$("[data-ntppick]").forEach(
      (b) =>
        (b.onclick = () => {
          let [k, s, h] = b.dataset.ntppick.split(":");
          W.event.ntpSelections[k][+s] = +h;
          W.ntpChange = "";
          renderStep5();
        }),
    );
    $$("[data-ntpswap]").forEach(
      (b) =>
        (b.onclick = () => {
          const k = b.dataset.ntpswap,
            v = W.event.ntpSelections[k];
          if (v?.length === 2) {
            [v[0], v[1]] = [v[1], v[0]];
            W.ntpChange = "";
            renderStep5();
          }
        }),
    );
  }
  function renderStep6() {
    ensureEventTeePlanning(W.event);
    const days = eventDays(W.event), selected = compDefinitions().filter(comp=>W.competitions.has(comp.id)&&!comp.unavailable),
      summaryEvent = {...W.event, competitions:selected.map(comp=>comp.id)},
      multiDayCompetitions = multiDayCompetitionSummary(summaryEvent),
      cardResults = days.flatMap(day=>eventCardChecks(day,W.event)),
      cardsValid = cardResults.every(result=>result?.ok),
      checks = [
        {ok:Boolean(W.event.name?.trim()),label:`Event Name: ${W.event.name||"Not entered"}`},
        {ok:Boolean(W.event.date),label:`Start Date: ${W.event.date?australianDate(W.event.date):"Not entered"}`},
        ...days.map(day=>({ok:Boolean(course(W.event["course"+day])),label:`Day ${day}: ${course(W.event["course"+day])?.name||"Not selected"} · ${australianDate(eventDate(day,W.event))} · First Tee Time: ${firstEventTeeTime(day,W.event)}`})),
        {ok:cardsValid&&Boolean(W.event.scorecardsChecked),label:`Official Course Scorecards: ${cardsValid?(W.event.scorecardsChecked?"Confirmed":"Confirmation required"):"Course data needs correction"}`},
        ...days.map(day=>({ok:wizardPlanningPlayers(day).length>=4&&wizardPlanningPlayers(day).length!==5,label:`Day ${day} Field: ${wizardPlanningPlayers(day).length} playing positions`})),
        ...days.map(day=>{const categories=eventPlayerCategories(day,W.event),complete=categories.every(category=>enabledEventTeesForCategory(W.event,day,category).every(tee=>teeHandicapsComplete(day,tee,W.event,category)));return {ok:complete,label:`Day ${day} Tee Handicaps: ${complete?"Complete":"Incomplete"}`};}),
        ...dailyCompetitionChecks(summaryEvent),
        ...(multiDayCompetitions.length?[{ok:true,label:`Multi-day Competitions: ${multiDayCompetitions.length}`}]:[]),
        ...(W.competitions.has("ntp")?competitionDays("ntp",W.event).map(day=>({ok:(W.event.ntpSelections?.["day"+day]||[]).length===ntpCount(day,W.event),label:`Day ${day} NTP: ${(W.event.ntpSelections?.["day"+day]||[]).map(h=>"Hole "+h).join(", ")||"Not selected"}`})):[]),
      ], allReady=checks.every(check=>check.ok);
    $("#wizardBody").innerHTML = `<div class="startHead"><div><h3>Event Plan Ready</h3><p>Review all ${days.length} playing day${days.length>1?"s":""} before proceeding to scoring setup.</p></div><span class="startBadge ${allReady?"ready":"check"}">${allReady?"READY":"CHECK"}</span></div>
      <div class="startSummaryGrid"><div class="startCard"><h4>Event</h4><b>${esc(W.event.name)}</b><p>${days.length} playing day${days.length>1?"s":""} · Trip field: ${W.event.fieldSize}</p><p>Start: ${esc(australianDate(eventDate(days[0],W.event)))} · Finish: ${esc(australianDate(eventDate(days[days.length-1],W.event)))}</p></div>
      ${days.map(day=>{const daily=dailyCompetitionSummary(day,summaryEvent).filter(comp=>!comp.aggregate);return `<div class="startCard"><h4>Day ${day}</h4><p>${esc(course(W.event["course"+day])?.name||"No course")} · ${wizardPlanningPlayers(day).length} players · ${firstEventTeeTime(day,W.event)}</p><p><b>Daily Competitions</b><br>${daily.length?daily.map(comp=>esc(comp.name)).join(" · "):"None"}</p></div>`;}).join("")}
      ${days.length>1?`<div class="startCard"><h4>Multi-day Competitions</h4>${multiDayCompetitions.length?multiDayCompetitions.map(comp=>`<p><b>${esc(comp.name)}</b>${comp.detail?`<br>${esc(comp.detail)}`:""}</p>`).join(""):"<p>None</p>"}</div>`:""}</div>
      <div class="finalCheck"><h4>Final Check</h4><div class="checkList">${checks.map(check=>`<div class="${check.ok?"ok":"warn"}"><span>${check.ok?"✓":"!"}</span>${esc(check.label)}</div>`).join("")}</div></div>
      <label class="cardCheckedConfirm"><input type="checkbox" id="scorecardsChecked" ${W.event.scorecardsChecked?"checked":""} ${cardsValid?"":"disabled"}><span><b>Card checked</b> — I have checked every course scorecard against the official card.</span></label>
      <div class="planTeeSelection"><b>Provisional Playing Tees</b>${days.map(day=>eventPlayerCategories(day,W.event).map(category=>`<div class="planTeeDay"><strong>Day ${day} · ${category==="women"?"Women":"Men"}</strong>${enabledEventTeesForCategory(W.event,day,category).map(tee=>`<button type="button" data-wizardplayingtee="${day}|${category}|${tee}" class="${selectedEventTee(day,W.event,category)===tee?"active":""}">${esc(eventTeeDisplayName(day,tee,W.event,category))}</button>`).join("")}</div>`).join("")).join("")}</div>
      <button class="soft" id="changeStartingTee">Change Course / Starting Arrangement</button><button class="startEventBig" id="startEventBig" ${allReady?"":"disabled"}>SAVE EVENT PLAN – PROCEED TO SET UP SCORING</button>`;
    $("#scorecardsChecked").onchange=e=>{W.event.scorecardsChecked=e.target.checked;renderStep6();};
    $("#changeStartingTee").onclick=()=>{W.step=1;renderWizard();};
    $$("[data-wizardplayingtee]").forEach(button=>button.onclick=()=>{const [day,category,tee]=button.dataset.wizardplayingtee.split("|");selectEventTee(+day,tee,W.event,category);renderStep6();});
    $("#startEventBig").onclick=()=>{if(allReady)finishEvent();};
  }
  function finishEvent() {
    if (W.newEvent) captureCurrentEvent();
    let confirmed = [...W.invites]
      .filter((x) => x[1] === "accepted")
      .map((x) => String(x[0]));
    let invitationStatus = Object.fromEntries(
      [...W.invites].map(([id, status]) => [String(id), status]),
    );
    Object.entries(W.event.sharedPositions || {}).forEach(([slot,days])=>Object.values(days).forEach(id=>invitationStatus[String(id)]=invitationStatus[slot]));
    let dayAvailability = JSON.parse(
      JSON.stringify(W.event.dayAvailability || {}),
    );
    const dayFields = {};
    eventDays(W.event).forEach(day => dayFields["day" + day] = wizardPlanningPlayers(day));
    const oldGroups = W.newEvent ? null : store.event?.groupSetup;
    if (W.newEvent) {
      closeCloudConnection();
      delete store.cloud;
      store.cloudPlayers = [];
      forgetOrganiserEvent();
    }
    store.event = {
      ...W.event,
      workspaceId: W.event.workspaceId || uid(),
      confirmed,
      invitationStatus,
      dayAvailability,
      dayFields,
      competitions: [...W.competitions],
      benefits: W.benefits,
      status: "planned",
      locked: false,
      groupSetup: oldGroups || {},
      setupStage: "planned",
    };
    delete store.event.draftStep;
    if (W.newEvent) resetDuplicatedEventRuntime(store.event);
    normaliseTwoDaySingleStableford(store.event);
    store.template = {
      competitions: [...W.competitions].filter((x) => x !== "eclectic"),
      benefits: W.benefits,
      puttingFormat: W.event.puttingFormat || "team",
      singleStablefordFormat: W.event.singleStablefordFormat || "aggregate",
      scratchMaxHcp: Number.isFinite(+W.event.scratchMaxHcp)
        ? +W.event.scratchMaxHcp
        : 10,
      scratchScoringMode:
        W.event.scratchScoringMode === "maxDoubleBogey"
          ? "maxDoubleBogey"
          : "stroke",
      ambroseScoringMode:
        W.event.ambroseScoringMode === "scorerOnly"
          ? "scorerOnly"
          : "scorerMarker",
      ambroseMinimumDrives: [2, 3, 4].includes(+W.event.ambroseMinimumDrives)
        ? +W.event.ambroseMinimumDrives
        : 3,
      par3Format: W.event.par3Format || "daily",
      par3Mode: par3Mode(W.event),
      scratchFormat: W.event.scratchFormat || "daily",
      ntpDay1Count: W.event.ntpDay1Count || 1,
      ntpDay2Count: ntpCount(2, W.event),
      ntpCounts: JSON.parse(JSON.stringify(W.event.ntpCounts || {})),
      ntpJackpot: Boolean(W.event.ntpJackpot),
      ntpJackpotMode: W.event.ntpJackpotMode === "rolling" ? "rolling" : "final",
    };
    localStorage.setItem(
      "awayGolfOrganiserTemplateV1",
      JSON.stringify(store.template),
    );
    // Preserve saved group arrangements. initialiseGroups only rebuilds a day
    // when that day's actual player membership has changed.
    initialiseGroups();
    save();
    $("#wizardShade").classList.remove("open");
    nav("teamsPage");
  }

  function pairKey(a, b) {
    return [String(a), String(b)].sort().join("|");
  }
  function isTestEvent(event) {
    return /^TEST\b/i.test(String(event?.name || "").trim());
  }
  function playedTogetherCount(a, b) {
    if (String(a) === NO_PARTNER_ID || String(b) === NO_PARTNER_ID) return 0;
    return +(store.pairHistory?.[pairKey(a, b)] || 0);
  }
  function partneredCount(a, b) {
    if (String(a) === NO_PARTNER_ID || String(b) === NO_PARTNER_ID) return 0;
    return +(store.partnerHistory?.[pairKey(a, b)] || 0);
  }
  function groupRepeatScore(g, day) {
    let score = 0;
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        score += playedTogetherCount(g[i], g[j]);
        // Strongly discourage repeating Day 1 group-mates on Day 2.
        if (day > 1) {
          const d1 = eventDays().filter(previous=>previous<day).flatMap(previous=>store.event?.groupSetup?.["day"+previous]?.groups||[]);
          if (
            d1.some(
              (old) =>
                old.some((x) => String(x) === String(g[i])) &&
                old.some((x) => String(x) === String(g[j])),
            )
          )
            score += 12;
        }
      }
    // Repeated 4BBB partnerships are more important than simply sharing the four.
    if (g.length >= 2) {
      score += 2 * partneredCount(g[0], g[1]);
      if (day > 1) {
        const d1 = eventDays().filter(previous=>previous<day).flatMap(previous=>store.event?.groupSetup?.["day"+previous]?.groups||[]);
        if (
          d1.some(
            (old) =>
              old.length >= 2 &&
              pairKey(old[0], old[1]) === pairKey(g[0], g[1]),
          )
        )
          score += 25;
        if (
          d1.some(
            (old) =>
              old.length >= 4 &&
              pairKey(old[2], old[3]) === pairKey(g[0], g[1]),
          )
        )
          score += 25;
      }
    }
    if (g.length >= 4) {
      score += 2 * partneredCount(g[2], g[3]);
      if (day > 1) {
        const d1 = eventDays().filter(previous=>previous<day).flatMap(previous=>store.event?.groupSetup?.["day"+previous]?.groups||[]);
        if (
          d1.some(
            (old) =>
              old.length >= 2 &&
              pairKey(old[0], old[1]) === pairKey(g[2], g[3]),
          )
        )
          score += 25;
        if (
          d1.some(
            (old) =>
              old.length >= 4 &&
              pairKey(old[2], old[3]) === pairKey(g[2], g[3]),
          )
        )
          score += 25;
      }
    }
    return score;
  }
  function drawRepeatScore(groups, day) {
    return groups.reduce((n, g) => n + groupRepeatScore(g, day), 0);
  }
  function fourballDrawSignature(groups) {
    return groups
      .map((g) => {
        const pairs = [];
        for (let i = 0; i < g.length; i += 2)
          pairs.push(
            g
              .slice(i, i + 2)
              .map(String)
              .sort()
              .join(","),
          );
        return pairs.sort().join("/");
      })
      .sort()
      .join("|");
  }
  function repeatsDay1Fourball(groups, day = 2) {
    const oldPairs = new Set(
      eventDays().filter(previous=>previous<day).flatMap(previous=>store.event?.groupSetup?.["day"+previous]?.groups||[])
        .flatMap((g) => [g.slice(0, 2), g.slice(2, 4)])
        .filter(
          (p) => p.length === 2 && !p.some((x) => String(x) === NO_PARTNER_ID),
        )
        .map((p) => pairKey(p[0], p[1])),
    );
    return groups.some((g) =>
      [g.slice(0, 2), g.slice(2, 4)].some(
        (p) =>
          p.length === 2 &&
          !p.some((x) => String(x) === NO_PARTNER_ID) &&
          oldPairs.has(pairKey(p[0], p[1])),
      ),
    );
  }
  function historyBalancedGroups(ids, day) {
    const seen = new Set(),
      candidates = [];
    for (let n = 0; n < 1800; n++) {
      const cand = makeGroups(shuffleCopy(ids), day);
      const signature = fourballDrawSignature(cand);
      if (seen.has(signature)) continue;
      seen.add(signature);
      candidates.push({
        groups: cand,
        score: drawRepeatScore(cand, day),
        repeatsPartner: day > 1 && repeatsDay1Fourball(cand, day),
      });
    }
    if (!candidates.length) return makeGroups(ids, day);
    const eligible =
      day > 1 && candidates.some((x) => !x.repeatsPartner)
        ? candidates.filter((x) => !x.repeatsPartner)
        : candidates;
    eligible.sort((a, b) => a.score - b.score);
    const best = eligible[0].score;
    // Allow a few near-equal good solutions so repeated clicks can show another sensible draw.
    const shortlist = eligible.filter((x) => x.score <= best + 2).slice(0, 12);
    return shortlist[Math.floor(Math.random() * shortlist.length)].groups;
  }
  function drawMixingStats(draw) {
    const groups = new Map(), partners = new Map(), mates = new Map();
    for (const [day, teams] of Object.entries(draw)) for (const team of teams) {
      const real = team.filter(id => String(id) !== NO_PARTNER_ID).map(String);
      for (const id of real) if (!mates.has(id)) mates.set(id, new Set());
      for (let i=0;i<real.length;i++) for (let j=i+1;j<real.length;j++) {
        const key=pairKey(real[i],real[j]);
        groups.set(key,[...(groups.get(key)||[]),+day]);
        mates.get(real[i]).add(real[j]);mates.get(real[j]).add(real[i]);
      }
      for (const pair of [team.slice(0,2),team.slice(2,4)]) {
        if (pair.length!==2 || pair.some(id=>String(id)===NO_PARTNER_ID)) continue;
        const key=pairKey(...pair);partners.set(key,[...(partners.get(key)||[]),+day]);
      }
    }
    const repeated = map => [...map].filter(([,days])=>days.length>1).map(([key,days])=>({ids:key.split('|'),days}));
    return {groupRepeats:repeated(groups),partnerRepeats:repeated(partners),
      groupRepeatEncounters:[...groups.values()].reduce((n,ds)=>n+Math.max(0,ds.length-1),0),
      partnerRepeatEncounters:[...partners.values()].reduce((n,ds)=>n+Math.max(0,ds.length-1),0),
      distinctMates:Object.fromEntries([...mates].map(([id,seen])=>[id,seen.size]))};
  }
  function maximumMixingDraw(fields) {
    const days=Object.keys(fields).map(Number).sort((a,b)=>a-b), first=fields[days[0]] || [];
    const exact=first.length===16 && days.length<=5 && days.every(day=>
      fields[day].length===16 && [...fields[day]].map(String).sort().join('|')===[...first].map(String).sort().join('|'));
    if (exact) {
      // Lines of the affine plane over GF(4): five partitions of sixteen
      // points into fours. Every pair of points lies on exactly one line.
      const ids=shuffleCopy(first), slopes=shuffleCopy([0,1,2,3,4]);
      const multiply=(a,b)=>{let result=0;for(let i=0;i<2;i++){if(b&1)result^=a;b>>=1;a<<=1;if(a&4)a^=7;}return result;};
      return Object.fromEntries(days.map((day,index)=>{
        const slope=slopes[index], teams=[];
        for(let intercept=0;intercept<4;intercept++) {
          const group=[];
          for(let x=0;x<4;x++) {
            const y=slope===4?x:multiply(slope,x)^intercept;
            group.push(ids[slope===4?intercept*4+y:x*4+y]);
          }
          teams.push(shuffleCopy(group));
        }
        return [day,shuffleCopy(teams)];
      }));
    }
    // For other field sizes/attendance, search complete schedules rather
    // than committing one day at a time. Repeated partners take priority.
    let best=null,bestScore=Infinity;
    for(let attempt=0;attempt<30;attempt++) {
      const draw={},groupCounts=new Map(),partnerCounts=new Map();
      for(const day of days) {
        let chosen=null,chosenScore=Infinity;
        for(let trial=0;trial<45;trial++) {
          const teams=makeGroups(shuffleCopy(fields[day]),day);let score=0;
          for(const team of teams) {
            const real=team.filter(id=>String(id)!==NO_PARTNER_ID);
            for(let i=0;i<real.length;i++)for(let j=i+1;j<real.length;j++)score+=10*(groupCounts.get(pairKey(real[i],real[j]))||0);
            for(const pair of [team.slice(0,2),team.slice(2,4)])if(pair.length===2&&!pair.includes(NO_PARTNER_ID))score+=100*(partnerCounts.get(pairKey(...pair))||0);
          }
          if(score<chosenScore){chosen=teams;chosenScore=score;}
          if(score===0)break;
        }
        draw[day]=chosen;
        for(const team of chosen) {
          const real=team.filter(id=>String(id)!==NO_PARTNER_ID);
          for(let i=0;i<real.length;i++)for(let j=i+1;j<real.length;j++){const k=pairKey(real[i],real[j]);groupCounts.set(k,(groupCounts.get(k)||0)+1);}
          for(const pair of [team.slice(0,2),team.slice(2,4)])if(pair.length===2&&!pair.includes(NO_PARTNER_ID)){const k=pairKey(...pair);partnerCounts.set(k,(partnerCounts.get(k)||0)+1);}
        }
      }
      const stats=drawMixingStats(draw), counts=Object.values(stats.distinctMates);
      const score=10000*stats.partnerRepeatEncounters+100*stats.groupRepeatEncounters+(Math.max(...counts,0)-Math.min(...counts));
      if(score<bestScore){best=draw;bestScore=score;}
      if(score===0)break;
    }
    return best;
  }
  function mixingSummaryHtml(event=store.event) {
    const draw=Object.fromEntries(eventDays(event).map(day=>[day,event.groupSetup?.['day'+day]?.groups||[]]));
    const stats=drawMixingStats(draw), counts=Object.values(stats.distinctMates);
    if(!counts.length)return '';
    const repeats=(rows)=>rows.map(row=>`<li>${row.ids.map(id=>esc(player(id)?.name||'Player')).join(' &amp; ')} — Days ${row.days.join(', ')}</li>`).join('');
    const low=Math.min(...counts),high=Math.max(...counts);
    return `<section class="ntpBox mixingSummary"><b>Player Mixing — whole event</b><p>Repeated 4BBB partnerships: <strong>${stats.partnerRepeats.length}</strong> · Repeated groupmate combinations: <strong>${stats.groupRepeats.length}</strong>.</p><p>Different groupmates per golfer: <strong>${low===high?low:low+'–'+high}</strong>. Counts cover the current draw across all playing days, including saved teams.</p>${stats.partnerRepeats.length||stats.groupRepeats.length?`<details><summary>Review repeated combinations</summary><h4>Repeated 4BBB partners</h4>${stats.partnerRepeats.length?`<ul>${repeats(stats.partnerRepeats)}</ul>`:'<p>None.</p>'}<h4>Repeated groupmates (including partners)</h4><ul>${repeats(stats.groupRepeats)}</ul></details>`:''}</section>`;
  }
  function lockAllEventTeams() {
    const event=store.event;
    if(!event || event.locked || event.pastEventReadOnly)return;
    const days=eventDays(event);
    const incomplete=days.filter(day=>{
      const setup=event.groupSetup?.["day"+day],ids=dayFieldIds(day).map(String).sort();
      const drawn=(setup?.groups||[]).flat().map(String).filter(id=>id!==NO_PARTNER_ID).sort();
      return ids.length<4 || ids.join("|")!==drawn.join("|");
    });
    if(incomplete.length)return alert(`Review the player lists and teams for Day ${incomplete.join(", Day ")} before locking all teams.`);
    const previous=JSON.parse(JSON.stringify(event.groupSetup));
    const oldSwap=event.swapPlayer,oldOrder=event.teamOrderSwap;
    try {
      for(const day of days){const setup=event.groupSetup["day"+day];ensureShortTeamSelections(setup,day);setup.saved=true;}
      event.swapPlayer=null;delete event.teamOrderSwap;
      if(save()===false)throw new Error("Saving did not complete. Please try again.");
    } catch(error) {
      event.groupSetup=previous;event.swapPlayer=oldSwap;event.teamOrderSwap=oldOrder;
      alert("Teams could not be locked: "+error.message);
    }
    renderTeamsPage();
  }
  function applyMaximumPlayerMixing() {
    const event=store.event,days=eventDays(event);
    if(event.locked || event.pastEventReadOnly || days.some(day=>firstDayScoreEntry(day) || Object.keys(event.manualScorecards?.["day"+day]?.groups || {}).length))return alert('Maximum Player Mixing is available before the event is locked or scoring starts.');
    if(event.emergencyReplacements && Object.keys(event.emergencyReplacements).length)return alert('An emergency replacement is already assigned. Keep the existing teams or resolve the replacement before drawing the whole event again.');
    const fields=Object.fromEntries(days.map(day=>[day,dayFieldIds(day)]));
    if(days.some(day=>fields[day].length<4))return alert('Select at least four players on every playing day before drawing the whole event.');
    if(!confirm('Draw all playing days using Maximum Player Mixing? This replaces the current teams and 4BBB partnerships, including saved days. Check and save each day afterwards.'))return;
    const draw=maximumMixingDraw(fields);
    for(const day of days) {
      const key='day'+day,setup=event.groupSetup[key];
      setup.groups=draw[day];setup.starts=defaultStarts(setup.groups,startMethodFor(event,day),day);setup.saved=false;
      delete setup.shortTeams;delete setup.virtualPlayer;delete setup.ntpExtraPlayer;delete setup.ntpExtraPlayers;
      ensureShortTeamSelections(setup,day);
    }
    event.drawMode='mixing';event.manualMode=false;event.swapPlayer=null;delete event.teamOrderSwap;
    writeLocalStore();renderTeamsPage();
  }
  function playerHistoryAgainstGroup(pid, g) {
    return g
      .filter((x) => String(x) !== String(pid))
      .map((id) => ({
        id,
        name: player(id)?.name || "Unknown",
        played: playedTogetherCount(pid, id),
        partners: partneredCount(pid, id),
      }))
      .sort((a, b) => b.partners - a.partners || b.played - a.played);
  }
  function awayGolfEventCourseNames(event) {
    const snapshots = [
      ...(event?.courseSnapshot || []),
      ...(store.cloud?.courseCards || []),
      ...(store.courses || []),
    ];
    const names = [];
    for (let day = 1; day <= Math.max(1, +event?.days || 1); day++) {
      const selected = event?.["course" + day];
      const match = snapshots.find(
        (candidate) => String(candidate?.id) === String(selected),
      );
      const name = match?.name || "";
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  }
  function awayGolfEventPlayerIds(event) {
    const ids = new Set();
    for (let day = 1; day <= Math.max(1, +event?.days || 1); day++) {
      const key = "day" + day;
      let slots = (event?.groupSetup?.[key]?.groups || []).flat();
      if (!slots.length) slots = event?.dayFields?.[key] || event?.confirmed || [];
      for (const slot of slots) {
        if (slot == null || String(slot) === NO_PARTNER_ID) continue;
        const base = store.players.find(
          (person) => String(person.id) === String(slot),
        );
        const occupant = window.GolfPlayerSubstitution?.occupant(
          event,
          slot,
          base,
          day,
        );
        ids.add(String(occupant?.profileId || occupant?.id || slot));
      }
    }
    return [...ids];
  }
  function recordAwayGolfEventPlayed(event) {
    const eventName = String(event?.name || "").trim();
    if (!/^Away Golf\b/i.test(eventName) || isTestEvent(event)) return false;
    const courses = awayGolfEventCourseNames(event),
      date = String(event?.date || ""),
      dateLabel = date
        ? new Date(date + "T12:00:00").toLocaleDateString("en-AU")
        : "",
      key = String(
        event?.workspaceId ||
          event?.cloudEventId ||
          event?.id ||
          `${eventName}|${date}|${courses.join("|")}`,
      ),
      entry = {
        key,
        eventName,
        date,
        dateLabel,
        courses: courses.join(" · "),
        recordedAt: new Date().toISOString(),
      };
    let changed = false;
    for (const id of awayGolfEventPlayerIds(event)) {
      const person = store.players.find(
        (candidate) => String(candidate.id) === String(id),
      );
      if (!person) continue;
      person.awayGolfEventsPlayed = Array.isArray(person.awayGolfEventsPlayed)
        ? person.awayGolfEventsPlayed
        : [];
      if (person.awayGolfEventsPlayed.some((item) => item.key === key)) continue;
      person.awayGolfEventsPlayed.push({ ...entry });
      changed = true;
    }
    return changed;
  }
  function recordCompletedEventHistory(event = store.event) {
    const awayGolfHistoryChanged = recordAwayGolfEventPlayed(event);
    if (
      !event?.groupSetup ||
      event.historyRecordedAt ||
      isTestEvent(event)
    )
      return awayGolfHistoryChanged;
    for (let day = 1; day <= (event.days || 1); day++) {
      const gs = event.groupSetup["day" + day]?.groups || [];
      for (const g of gs) {
        const realPlayers = g.filter(
          (id) => id != null && String(id) !== NO_PARTNER_ID,
        );
        for (let i = 0; i < realPlayers.length; i++)
          for (let j = i + 1; j < realPlayers.length; j++) {
            let k = pairKey(realPlayers[i], realPlayers[j]);
            store.pairHistory[k] = (store.pairHistory[k] || 0) + 1;
          }
        const pairs = [g.slice(0, 2), g.slice(2, 4)];
        for (const pair of pairs) {
          if (
            pair.length !== 2 ||
            pair.some((id) => id == null || String(id) === NO_PARTNER_ID)
          )
            continue;
          let k = pairKey(pair[0], pair[1]);
          store.partnerHistory[k] = (store.partnerHistory[k] || 0) + 1;
        }
      }
    }
    event.historyRecordedAt = new Date().toISOString();
    return true;
  }
  function removeRecordedTestEventHistory() {
    let changed = false;
    const reduceCount = (history, key) => {
      const next = Math.max(0, +(history[key] || 0) - 1);
      if (next) history[key] = next;
      else delete history[key];
    };
    for (const record of store.eventWorkspace || []) {
      const event = record?.event;
      if (
        !event?.historyRecordedAt ||
        event.testHistoryExcludedAt ||
        !isTestEvent(event)
      )
        continue;
      for (let day = 1; day <= (event.days || 1); day++) {
        const groups = event.groupSetup?.[`day${day}`]?.groups || [];
        for (const group of groups) {
          const realPlayers = group.filter(
            (id) => id != null && String(id) !== NO_PARTNER_ID,
          );
          for (let i = 0; i < realPlayers.length; i++)
            for (let j = i + 1; j < realPlayers.length; j++)
              reduceCount(
                store.pairHistory,
                pairKey(realPlayers[i], realPlayers[j]),
              );
          for (const pair of [group.slice(0, 2), group.slice(2, 4)]) {
            if (
              pair.length === 2 &&
              !pair.some(
                (id) => id == null || String(id) === NO_PARTNER_ID,
              )
            )
              reduceCount(store.partnerHistory, pairKey(pair[0], pair[1]));
          }
        }
      }
      event.testHistoryExcludedAt = new Date().toISOString();
      changed = true;
    }
    for (const person of store.players || []) {
      if (Array.isArray(person.awayGolfEventsPlayed)) {
        const kept = person.awayGolfEventsPlayed.filter(
          (entry) => !isTestEvent({ name: entry?.eventName }),
        );
        if (kept.length !== person.awayGolfEventsPlayed.length) {
          person.awayGolfEventsPlayed = kept;
          changed = true;
        }
      }
      for (const [courseId, entry] of Object.entries(
        person.courseHandicaps || {},
      )) {
        if (!isTestEvent({ name: entry?.eventName })) continue;
        delete person.courseHandicaps[courseId];
        changed = true;
      }
    }
    const active = (store.eventWorkspace || []).find(
      (record) =>
        String(record.id) ===
        String(store.event?.workspaceId || store.activeEventId || ""),
    );
    if (active?.event?.testHistoryExcludedAt && store.event)
      store.event.testHistoryExcludedAt =
        active.event.testHistoryExcludedAt;
    if (changed) writeLocalStore();
    return changed;
  }
  function installFederalRidgeHistoryBaseline() {
    const baselineId = "federal-ridge-2026-v1";
    if (store.historyBaseline?.id === baselineId) return false;
    const ridgeGroups = [
        ["Jeremy Ward", "Graeme Hennessy", "Ben Mees", "Rod Ruston"],
        ["Sam Reece", "Jerry Maher", "Ian Priest", "Maurice Melan"],
        ["Grant Lomas", "Luke Bradshaw", "Bob Valk", "David Fairweather"],
        ["Christian Fong", "Peter Rolfe", "Rob Blain", "Ross Smith"],
      ],
      federalDay1Groups = [
        ["Rod Bowyer", "Jerry Maher", "Graeme Hennessy", "Ross Smith"],
        ["David Fairweather", "Rod Ruston", "David Gaffaney", "Ben Mees"],
      ],
      federalDay2Groups = [
        ["Rod Ruston", "Ben Mees", "Graeme Hennessy", "Jerry Maher"],
        ["Rod Bowyer", "Ross Smith", "David Gaffaney", "David Fairweather"],
      ],
      playerIdByName = new Map(
        (store.players || []).map((person) => [person.name, String(person.id)]),
      ),
      namedRounds = [ridgeGroups, federalDay1Groups, federalDay2Groups],
      rounds = namedRounds.map((round) =>
        round.map((names) => names.map((name) => playerIdByName.get(name))),
      );
    if (rounds.some((round) => round.some((group) => group.some((id) => !id))))
      return false;

    // Deliberately replace, rather than add to, the device's old counters.
    store.pairHistory = {};
    store.partnerHistory = {};
    for (const round of rounds) {
      for (const group of round) {
        for (let i = 0; i < group.length; i++)
          for (let j = i + 1; j < group.length; j++) {
            const key = pairKey(group[i], group[j]);
            store.pairHistory[key] = (store.pairHistory[key] || 0) + 1;
          }
        for (const pair of [group.slice(0, 2), group.slice(2, 4)]) {
          const key = pairKey(pair[0], pair[1]);
          store.partnerHistory[key] = (store.partnerHistory[key] || 0) + 1;
        }
      }
    }

    const installedAt = new Date().toISOString();
    store.historyBaseline = {
      id: baselineId,
      installedAt,
      events: [
        "Away Golf - The Ridge",
        "Away Golf - Federal GC Day 1",
        "Away Golf - Federal GC Day 2",
      ],
    };
    // Prevent old local event copies from being re-added by the legacy
    // completed-event backfill. Genuine events completed after this reset are
    // still recorded normally when they close.
    for (const record of store.eventWorkspace || []) {
      const event = record?.event;
      if (!event) continue;
      const hasPlayedScore = Object.values(event.scoring || {}).some(
        (roundData) =>
          Object.values(roundData || {}).some((round) =>
            Object.entries(round || {}).some(
              ([hole, entry]) =>
                /^\d+$/.test(hole) &&
                (scoreEntered(entry?.official?.gross) ||
                  scoreEntered(entry?.self?.gross)),
            ),
          ),
      );
      if (
        event.status === "complete" ||
        event.status === "completed" ||
        event.finalResults?.confirmedAt ||
        hasPlayedScore
      )
        event.historyRecordedAt = installedAt;
      if (isTestEvent(event)) event.testHistoryExcludedAt = installedAt;
    }
    const active = (store.eventWorkspace || []).find(
      (record) =>
        String(record.id) ===
        String(store.event?.workspaceId || store.activeEventId || ""),
    );
    if (active?.event?.historyRecordedAt && store.event)
      store.event.historyRecordedAt = active.event.historyRecordedAt;
    if (active?.event?.testHistoryExcludedAt && store.event)
      store.event.testHistoryExcludedAt = active.event.testHistoryExcludedAt;
    return true;
  }
  function backfillCompletedEventHistory() {
    let changed = false;
    for (const record of store.eventWorkspace || []) {
      const event = record?.event,
        hasPlayedScore = Object.values(event?.scoring || {}).some((rounds) =>
          Object.values(rounds || {}).some((round) =>
            Object.entries(round || {}).some(
              ([hole, entry]) =>
                /^\d+$/.test(hole) &&
                (scoreEntered(entry?.official?.gross) ||
                  scoreEntered(entry?.self?.gross)),
            ),
          ),
        );
      if (
        event &&
        (event.status === "complete" ||
          event.status === "completed" ||
          event.finalResults?.confirmedAt ||
          hasPlayedScore)
      )
        changed = recordCompletedEventHistory(event) || changed;
    }
    const active = (store.eventWorkspace || []).find(
      (record) =>
        String(record.id) ===
        String(store.event?.workspaceId || store.activeEventId || ""),
    );
    if (active?.event?.historyRecordedAt && store.event)
      store.event.historyRecordedAt = active.event.historyRecordedAt;
    if (changed) writeLocalStore();
  }
  function shuffleCopy(arr) {
    let a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function makeGroups(ids, day = store.event?.activeGroupDay || 1) {
    const real = ids.filter(id => String(id) !== NO_PARTNER_ID);
    if (real.length < 6) {
      const out = [];
      for (let i=0; i<ids.length; i+=4) out.push(ids.slice(i,i+4));
      return out;
    }
    const count = Math.ceil(real.length/4), base = Math.floor(real.length/count), extra = real.length%count;
    let offset=0;
    return Array.from({length:count},(_,index)=>{
      const size=base+(index<extra?1:0), group=real.slice(offset,offset+size);offset+=size;
      if(size===3&&!ambroseIsOn(store.event, day))group.push(NO_PARTNER_ID);
      return group;
    });
  }
  function defaultStarts(groups, method, day = 1) {
    method = method || startMethodFor(store.event, day);
    if (method === "shotgun") {
      const common = [1, 3, 5, 7, 9, 10, 12, 14, 16, 18];
      return groups.map((_, i) => common[i] || ((i * 2) % 18) + 1);
    }
    const holes = startHolesFor(store.event, day);
    if (method === "two") return groups.map((_, i) => +(holes[i % 2] || 1));
    if (method === "single") return groups.map(() => +(holes[0] || 1));
    return groups.map((_, i) => i + 1);
  }
  function dayFieldIds(day) {
    if (!store.event) return [];
    const key = "day" + day;
    const missing = String(store.event.emergencyReplacements?.[key]?.missingPlayerId || "");
    if (store.event.dayFields?.[key])
      return store.event.dayFields[key].map(String).filter((id) => id !== missing);
    const ids = (store.event.confirmed || []).map(String);
    if (store.event.days === 1) return ids.filter((id) => id !== missing);
    return ids.filter(
      (id) => store.event.dayAvailability?.[id]?.[day] !== false,
    ).filter((id) => id !== missing);
  }
  function aggregatePar3Partner(playerId, day = store.event.days) {
    if (
      par3Mode(store.event) !== "overallPairs" ||
      !(store.event?.competitions || []).includes("par3")
    )
      return "";
    const groups = store.event?.groupSetup?.["day" + store.event.days]?.groups || [],
      id = sharedActualId(playerId,store.event.days),
      group = groups.find((team) => team.map(String).includes(id));
    if (!group) return "";
    const index = group.map(String).indexOf(id),
      pairStart = index < 2 ? 0 : 2;
    return sharedActualId(String(
      group
        .slice(pairStart, pairStart + 2)
        .map(String)
        .find((candidate) => candidate !== id && candidate !== NO_PARTNER_ID) ||
        "",
    ),day);
  }
  function noPartnerContext(groups, day, groupIndex = null) {
    const all = dayFieldIds(day),
      shortIndex = groupIndex === null ? groups.findIndex((g) =>
        g.some((id) => String(id) === NO_PARTNER_ID),
      ) : groups[groupIndex]?.some(id => String(id) === NO_PARTNER_ID) ? groupIndex : -1;
    if (shortIndex < 0) return null;
    const g = groups[shortIndex],
      npIndex = g.findIndex((id) => String(id) === NO_PARTNER_ID);
    const pairStart = npIndex < 2 ? 0 : 2;
    const affected = g
      .slice(pairStart, pairStart + 2)
      .find((id) => String(id) !== NO_PARTNER_ID);
    const realInGroup = g.filter((id) => String(id) !== NO_PARTNER_ID);
    const inShortGroup = new Set(realInGroup.map(String));
    const candidates = all.filter(
      (id) => String(id) !== NO_PARTNER_ID && !inShortGroup.has(String(id)),
    );
    return {
      groupIndex: shortIndex,
      noPartnerIndex: npIndex,
      affected: String(affected || ""),
      realInGroup,
      candidates,
    };
  }
  function ambroseThreePlayerContext(groups, groupIndex = null) {
    const shortIndex = groupIndex === null ? groups.findIndex(
      (group) => group.filter((id) => String(id) !== NO_PARTNER_ID).length === 3,
    ) : groups[groupIndex]?.filter(id=>String(id)!==NO_PARTNER_ID).length===3 ? groupIndex : -1;
    if (shortIndex < 0) return null;
    return {
      groupIndex: shortIndex,
      noPartnerIndex: -1,
      affected: "",
      realInGroup: groups[shortIndex]
        .filter((id) => String(id) !== NO_PARTNER_ID)
        .map(String),
      candidates: [],
    };
  }
  function chooseRandom(arr, exclude = []) {
    const ex = new Set(exclude.map(String)),
      a = arr.filter((x) => !ex.has(String(x)));
    return a.length ? a[Math.floor(Math.random() * a.length)] : null;
  }
  function ensureOneShortTeamSelections(setup, day) {
    const ctx = ambroseIsOn(store.event, day)
      ? ambroseThreePlayerContext(setup.groups, setup.shortTeamIndex ?? null)
      : noPartnerContext(setup.groups, day, setup.shortTeamIndex ?? null);
    if (!ctx) {
      setup.virtualPlayer = null;
      setup.ntpExtraPlayer = null;
      setup.ntpExtraPlayers = {};
      return;
    }
    if (ambroseIsOn(store.event, day)) setup.virtualPlayer = null;
    else if (
      !setup.virtualPlayer ||
      !ctx.candidates.map(String).includes(String(setup.virtualPlayer))
    )
      setup.virtualPlayer = chooseRandom(ctx.candidates);
    const emergency = store.event.emergencyReplacements?.["day" + day];
    if (emergency && emergency.groupIndex === ctx.groupIndex) {
      setup.virtualPlayer = emergency.virtualPlayerId;
      setup.ntpExtraPlayers = emergency.ntpExtraPlayers || {};
      setup.ntpExtraPlayer = null;
    } else if (competitionIsOn("ntp", day)) {
      const eligible = ctx.realInGroup.map(String);
      // Preserve existing locked single-VP events; new draws rotate attempts by hole.
      if (setup.ntpExtraPlayer && (setup.saved || store.event.locked) && !Object.keys(setup.ntpExtraPlayers || {}).length) return;
      const order = (setup.ntpRotation || []).filter(id => eligible.includes(id));
      if (order.length !== eligible.length || new Set(order).size !== eligible.length) setup.ntpRotation = shuffleCopy(eligible);
      else setup.ntpRotation = order;
      setup.ntpExtraPlayers = Object.fromEntries(ntpHolesInPlayingOrder(day).map((hole,index)=>[String(hole),setup.ntpRotation[index%eligible.length]]));
      setup.ntpExtraPlayer = null;
    } else {
      setup.ntpExtraPlayer = null;
      setup.ntpExtraPlayers = {};
    }
  }
  function swapWholeTeams(event, day, first, second) {
    const setup = event?.groupSetup?.['day' + day];
    if (!setup || event.locked || setup.saved || firstDayScoreEntry(day) ||
        !Number.isInteger(first) || !Number.isInteger(second) || first === second ||
        first < 0 || second < 0 || !setup.groups[first] || !setup.groups[second]) return false;
    const exchange = (map) => {
      if (!map) return;
      const a = map[first], b = map[second];
      if (b === undefined) delete map[first]; else map[first] = b;
      if (a === undefined) delete map[second]; else map[second] = a;
    };
    exchange(setup.groups);
    exchange(setup.shortTeams);
    exchange(event.ambroseRoleAssignments?.['day' + day]);
    const emergency = event.emergencyReplacements?.['day' + day];
    if (emergency?.groupIndex === first) emergency.groupIndex = second;
    else if (emergency?.groupIndex === second) emergency.groupIndex = first;
    // Starting holes and tee times belong to the tee slots, not the golfers.
    const firstShort = setup.groups.findIndex(g => g.filter(id => String(id) !== NO_PARTNER_ID).length === 3);
    const assignment = setup.shortTeams?.[firstShort] || {};
    setup.virtualPlayer = assignment.virtualPlayer || null;
    setup.ntpExtraPlayer = assignment.ntpExtraPlayer || null;
    setup.ntpExtraPlayers = assignment.ntpExtraPlayers || {};
    setup.saved = false;
    event.swapPlayer = null;
    return true;
  }
  function setupForTeam(setup, groupIndex) {
    if (!setup) return setup;
    if (setup.shortTeams) return {...setup, virtualPlayer:null, ntpExtraPlayer:null, ntpExtraPlayers:{}, ...setup.shortTeams[String(groupIndex)], shortTeamIndex:groupIndex};
    const first = setup.groups.findIndex(g => g.some(id => String(id)===NO_PARTNER_ID) || (ambroseIsOn() && g.length===3));
    return {...setup, ...(first===groupIndex?{}:{virtualPlayer:null,ntpExtraPlayer:null,ntpExtraPlayers:{}}),shortTeamIndex:groupIndex};
  }
  function ensureShortTeamSelections(setup, day) {
    const previous=setup.shortTeams || {}, next={}, used=new Set();
    const emergency=store.event.emergencyReplacements?.['day'+day];
    if(emergency?.virtualPlayerId)used.add(String(emergency.virtualPlayerId));
    const shortIndexes=setup.groups.map((g,i)=>g.filter(id=>String(id)!==NO_PARTNER_ID).length===3?i:-1).filter(i=>i>=0);
    const legacyIndex=setup.groups.findIndex(g=>g.some(id=>String(id)===NO_PARTNER_ID) || (ambroseIsOn(store.event, day)&&g.length===3));
    for(const gi of shortIndexes){
      if(!ambroseIsOn(store.event, day)&&!setup.groups[gi].some(id=>String(id)===NO_PARTNER_ID))setup.groups[gi].push(NO_PARTNER_ID);
      const legacy=!setup.shortTeams&&gi===legacyIndex ? {virtualPlayer:setup.virtualPlayer,ntpExtraPlayer:setup.ntpExtraPlayer,ntpExtraPlayers:setup.ntpExtraPlayers} : {};
      const local={...setup,...legacy,...previous[String(gi)],shortTeamIndex:gi};
      if(!previous[String(gi)]&&!Object.keys(legacy).length){local.virtualPlayer=null;local.ntpExtraPlayer=null;local.ntpExtraPlayers={};local.ntpRotation=[];}
      ensureOneShortTeamSelections(local,day);
      if(!ambroseIsOn(store.event, day)){
        const ctx=noPartnerContext(setup.groups,day,gi);
        const reserved=emergency?.groupIndex===gi;
        if(!reserved && used.has(String(local.virtualPlayer))) local.virtualPlayer=chooseRandom(ctx.candidates,[...used]);
        if(!local.virtualPlayer)throw new Error('No distinct Virtual Player is available for Team '+(gi+1)+'. Review the draw.');
        used.add(String(local.virtualPlayer));
      }
      next[String(gi)]={virtualPlayer:local.virtualPlayer||null,ntpExtraPlayer:local.ntpExtraPlayer||null,ntpExtraPlayers:local.ntpExtraPlayers||{},ntpRotation:local.ntpRotation||[]};
    }
    setup.shortTeams=next;
    const first=next[String(shortIndexes[0])] || {};
    // Legacy fields remain readable by old backups. Current scoring uses the team map.
    setup.virtualPlayer=first.virtualPlayer||null;setup.ntpExtraPlayer=first.ntpExtraPlayer||null;setup.ntpExtraPlayers=first.ntpExtraPlayers||{};
  }
  function shortTeamRuleLines(event, day) {
    const setup=event.groupSetup?.['day'+day];if(!setup)return [];
    return Object.entries(setup.shortTeams||{}).flatMap(([gi,a])=>{
      const lines=[`Team ${+gi+1}: three real golfers${a.virtualPlayer?`; ${player(a.virtualPlayer)?.name || 'the assigned golfer'} supplies the Virtual Player score for multiplayer competitions`:'. No borrowed score is used for Ambrose'}.`];
      const attempts=Object.entries(a.ntpExtraPlayers||{}).map(([hole,id])=>`Hole ${hole}: ${player(id)?.name||'the assigned golfer'} takes two tee shots; either may win NTP`);
      if(a.ntpExtraPlayer)attempts.push(`${player(a.ntpExtraPlayer)?.name||'the assigned golfer'} takes two shots on each NTP hole`);
      if(attempts.length)lines.push(`Team ${+gi+1} NTP extra attempts — ${attempts.join('; ')}.`);
      return lines;
    });
  }
  function initialiseGroups() {
    if (!store.event) return;
    store.event.groupSetup = store.event.groupSetup || {};
    for (let day = 1; day <= store.event.days; day++) {
      const key = "day" + day,
        ids = dayFieldIds(day),
        emergency = store.event.emergencyReplacements?.[key],
        expectedIds = emergency ? [...ids, NO_PARTNER_ID] : ids;
      const current = store.event.groupSetup[key];
      const same =
        current &&
        current.groups &&
        current.groups.flat().map(String).filter(id=>id!==NO_PARTNER_ID).sort().join("|") ===
          expectedIds.map(String).filter(id=>id!==NO_PARTNER_ID).sort().join("|") &&
        current.groups.every(group=>ambroseIsOn(store.event,day) ? !group.includes(NO_PARTNER_ID) : group.filter(id=>id!==NO_PARTNER_ID).length!==3 || group.includes(NO_PARTNER_ID));
      if (!same) {
        // Build the first view with the same History Balanced logic the organiser gets by pressing the button.
        // Day 2 therefore sees the newly-created Day 1 and avoids unnecessary repeats immediately.
        let groups = historyBalancedGroups(ids, day);
        // Extra safeguard: if No Partner exists on both days, avoid allocating it to the same golfer where alternatives exist.
        if (
          day === 2 &&
          groups.some((g) => g.some((x) => String(x) === NO_PARTNER_ID))
        ) {
          const d1 = store.event.groupSetup.day1,
            ctx1 = d1 ? noPartnerContext(d1.groups, 1) : null;
          let ctx2 = noPartnerContext(groups, 2);
          if (ctx1 && ctx2 && String(ctx1.affected) === String(ctx2.affected)) {
            const npG = ctx2.groupIndex,
              npI = ctx2.noPartnerIndex;
            let swapped = false;
            for (let gi = 0; gi < groups.length && !swapped; gi++)
              for (let pi = 0; pi < groups[gi].length && !swapped; pi++) {
                const candidate = String(groups[gi][pi]);
                if (
                  candidate !== NO_PARTNER_ID &&
                  candidate !== String(ctx1.affected)
                ) {
                  const temp =
                    groups[npG][npI === 0 ? 1 : npI === 2 ? 3 : npI - 1];
                  const partnerIndex = npI === 0 ? 1 : npI === 2 ? 3 : npI - 1;
                  groups[npG][partnerIndex] = groups[gi][pi];
                  groups[gi][pi] = temp;
                  swapped = true;
                }
              }
          }
        }
        store.event.groupSetup[key] = {
          groups,
          starts: defaultStarts(groups, startMethodFor(store.event, day), day),
          saved: false,
          virtualPlayer: null,
          ntpExtraPlayer: null,
        };
      }
      ensureShortTeamSelections(store.event.groupSetup[key], day);
    }
    synchroniseSingleTeeGroupStarts(store.event);
    store.event.activeGroupDay = store.event.activeGroupDay || 1;
    store.event.drawMode = store.event.drawMode || "history";
    store.event.manualMode = store.event.drawMode === "manual";
    if (store.event.swapPlayer === undefined) store.event.swapPlayer = null;
  }
  function groupCompetitionText() {
    if (!store.event) return "";
    let c = manualSelectedCompetitions(store.event.activeGroupDay || 1),
      parts = [];
    if (c.has("fourball"))
      parts.push("4BBB partners are the two pairs shown in each group");
    if (c.has("teamPutts"))
      parts.push(
        store.event.puttingFormat === "pairs"
          ? "the two 4BBB partnerships are the Putting pairs"
          : "the full four-person group is the Putting team",
      );
    if (c.has("best3of4"))
      parts.push("the full four-person group is the Best 3 of 4 team");
    return parts.join(" · ");
  }
  function eventDayHandicaps(day) {
    ensureEventTeePlanning(store.event);
    store.event.dailyHandicaps = store.event.dailyHandicaps || {
      day1: {},
      day2: {},
    };
    const key = "day" + day,
      active = Object.fromEntries(dayFieldIds(day).filter(id=>String(id)!==NO_PARTNER_ID).map(id=>{
        const category=eventCourseCategory(day,store.event,id),tee=selectedEventTee(day,store.event,category);
        return [String(id),teeHandicapsFor(day,tee)[String(id)]];
      }));
    store.event.dailyHandicaps[key] = active;
    return active;
  }
  function playerDailyHandicap(id, day) {
    const category=eventCourseCategory(day,store.event,id);
    const v = teeHandicapsFor(
      day,
      selectedEventTee(day,store.event,category),
    )[String(id)];
    return v === "" || v == null ? null : +v;
  }
  function recordEventHandicapHistory(dayOnly = null) {
    if (!store.event || isTestEvent(store.event)) return;
    const firstDay = dayOnly || 1,
      lastDay = dayOnly || store.event.days;
    for (let day = firstDay; day <= lastDay; day++) {
      const c = course(store.event["course" + day]);
      dayFieldIds(day)
        .filter((id) => id !== NO_PARTNER_ID)
        .forEach((id) => {
          const h = playerDailyHandicap(id, day),
            identity = eventPlayer(id,day),
            p = store.players.find(p=>String(p.id)===String(identity?.profileId || id));
          if (h == null || !p || !c) return;
          p.courseHandicaps = p.courseHandicaps || {};
          p.courseHandicaps[String(c.id)] = {
            courseId: String(c.id),
            courseName: c.name,
            handicap: h,
            updatedAt: new Date().toISOString(),
            eventName: store.event.name || "",
          };
        });
    }
  }
  function retainedLegacyScoringRules() {
    return Boolean(store.event?.finalResults?.confirmedAt && store.event.finalResults.scoringRulesVersion !== 2);
  }
  function stablefordStrokeCount(indexValue, handicap) {
    handicap = +handicap || 0;
    const txt = String(indexValue ?? "").trim();
    if (handicap < 0) {
      const idx = +(txt.split("/")[0] || 0),
        plus = Math.abs(handicap);
      if (!idx) return 0;
      const base = Math.floor(plus / 18),
        rem = plus % 18;
      return -base - (rem && idx > 18 - rem ? 1 : 0);
    }
    if (handicap === 0) return 0;
    if (txt.includes("/")) {
      const indexes = txt.split("/").map((x) => +String(x).trim())
        .filter((x) => Number.isFinite(x) && x > 0);
      const listed = indexes.filter((x) => x <= handicap).length;
      // Preserve confirmed historical results. Above 36, repeat the primary
      // 1–18 index while retaining the course's separate second-stroke order.
      if (retainedLegacyScoringRules() || handicap <= 36) return listed;
      const primary = indexes[0];
      if (!primary || primary > 18) return listed;
      const extra = handicap - 36;
      return listed + Math.floor(extra / 18) + (primary <= extra % 18 ? 1 : 0);
    }
    const idx = +txt;
    if (!idx) return 0;
    const base = Math.floor(handicap / 18),
      rem = handicap % 18;
    return base + (rem && idx <= rem ? 1 : 0);
  }
  function stablefordPoints(gross, par, indexValue, handicap) {
    if (String(gross).toUpperCase() === "P") return 0;
    gross = +gross;
    par = +par;
    if (!gross || !par || handicap == null) return null;
    return Math.max(
      0,
      2 + par + stablefordStrokeCount(indexValue, handicap) - gross,
    );
  }
  function scoreSequence(start) {
    start = +start || 1;
    return Array.from({ length: 18 }, (_, i) => ((start - 1 + i) % 18) + 1);
  }
  function scoringDayStore(day) {
    store.event.scoring = store.event.scoring || { day1: {}, day2: {} };
    store.event.scoring["day" + day] = store.event.scoring["day" + day] || {};
    return store.event.scoring["day" + day];
  }
  function scorerStore(day, scorerId) {
    const d = scoringDayStore(day),
      id = String(scorerId);
    d[id] = d[id] || {};
    return d[id];
  }
  function scoreRecord(day, scorerId, hole) {
    const s = scorerStore(day, scorerId),
      k = String(hole);
    s[k] = s[k] || { official: {}, self: {}, ntp: {} };
    return s[k];
  }
  const scoreEntered = (value) => value !== "" && value != null;
  function firstDayScoreEntry(day) {
    const rounds = store.event?.scoring?.["day" + day] || {};
    for (const [scorerId, round] of Object.entries(rounds)) {
      for (const [hole, rec] of Object.entries(round || {})) {
        if (!/^([1-9]|1[0-8])$/.test(hole)) continue;
        if (
          [
            rec?.self?.gross,
            rec?.self?.putts,
            rec?.official?.gross,
            rec?.official?.putts,
          ].some(scoreEntered)
        )
          return { scorerId: String(scorerId), hole: +hole };
      }
    }
    return null;
  }
  function dayHasScoreEntries(day) {
    return Boolean(firstDayScoreEntry(day));
  }
  function groupHasScoreEntries(day, groupIndex) {
    const group = store.event?.groupSetup?.["day" + day]?.groups?.[groupIndex] || [],
      scorerIds = new Set(group.map(String).filter((id) => id !== NO_PARTNER_ID)),
      rounds = store.event?.scoring?.["day" + day] || {};
    for (const [scorerId, round] of Object.entries(rounds)) {
      if (!scorerIds.has(String(scorerId))) continue;
      for (const [hole, rec] of Object.entries(round || {})) {
        if (!/^([1-9]|1[0-8])$/.test(hole)) continue;
        if ([rec?.self?.gross, rec?.self?.putts, rec?.official?.gross, rec?.official?.putts].some(scoreEntered))
          return { scorerId: String(scorerId), hole: +hole };
      }
    }
    return null;
  }
  function teeHandicapsComplete(day, tee, event = store.event, category = null) {
    const map = teeHandicapsFor(day, tee, event),
      ids = event === store.event ? dayFieldIds(day) : wizardPlanningPlayers(day);
    return ids
      .filter((id) => String(id) !== NO_PARTNER_ID)
      .filter((id) => !category || eventGaCategory(id,event) === category)
      .every((id) => map[String(id)] !== "" && map[String(id)] != null);
  }
  function scratchHandicapLimit(event = store.event) {
    return event?.scratchMaxHcp == null
      ? null
      : Number.isFinite(+event.scratchMaxHcp)
        ? +event.scratchMaxHcp
        : 10;
  }
  function scratchRulesText(event = store.event) {
    const max = scratchHandicapLimit(event) ?? 10;
    const scoring =
      event?.scratchScoringMode === "maxDoubleBogey"
        ? "Scoring is capped at double bogey (2 over par) on each hole. A PICK-UP (P) records a score of 2 over par for that hole."
        : "Pure Stroke scoring applies: every stroke counts. Every hole must be played to completion and a PICK-UP (P) results in disqualification from the Scratch Competition.";
    return `This event includes a Scratch Competition. Any player with a daily handicap of ${max} or less is included in the Scratch Competition. Any player with a daily handicap greater than ${max} is not included. ${scoring}`;
  }
  function scratchPickupHole(day, playerId) {
    for (let h = 1; h <= 18; h++) {
      const gross = findOfficialForPlayer(day, playerId, h)?.gross;
      if (String(gross ?? "").toUpperCase() === "P") return h;
    }
    return null;
  }
  function scratchGrossScores(day, playerId, card) {
    const maximumDoubleBogey =
      store.event?.scratchScoringMode === "maxDoubleBogey";
    return Array.from({ length: 18 }, (_, i) => {
      const gross = findOfficialForPlayer(day, playerId, i + 1)?.gross;
      if (String(gross ?? "").toUpperCase() === "P")
        return maximumDoubleBogey ? +(card?.par?.[i] || 0) + 2 : null;
      if (gross === "" || gross == null) return null;
      return maximumDoubleBogey
        ? Math.min(+gross, +(card?.par?.[i] || 0) + 2)
        : +gross;
    });
  }
  function roundFinalisedFor(day, playerId) {
    const id = String(playerId);
    return Boolean(
      manualDayFinalised(day) ||
        store.event?.roundFinalised?.["day" + day]?.[id] ||
        scoringDayStore(day)?.[id]?._meta?.finalisedAt ||
        (officialCardProgress(day, id).complete &&
          verificationIssueCount(day, id) === 0 &&
          markedScorecardVerification(day, id).mismatches.length === 0),
    );
  }
  function mergeOrganiserCorrections(local = {}, remote = {}) {
    const merged = JSON.parse(JSON.stringify(local || {}));
    Object.entries(remote || {}).forEach(([dayKey, players]) => {
      merged[dayKey] = merged[dayKey] || {};
      Object.entries(players || {}).forEach(([playerId, holes]) => {
        merged[dayKey][playerId] = merged[dayKey][playerId] || {};
        Object.entries(holes || {}).forEach(([hole, correction]) => {
          const current = merged[dayKey][playerId][hole];
          if (
            !current ||
            (Date.parse(correction?.correctedAt || 0) || 0) >=
              (Date.parse(current?.correctedAt || 0) || 0)
          )
            merged[dayKey][playerId][hole] = JSON.parse(
              JSON.stringify(correction),
            );
        });
      });
    });
    return merged;
  }
  function organiserCorrectionFor(day, playerId, hole) {
    return store.event?.organiserCorrections?.["day" + day]?.[
      String(playerId)
    ]?.[String(hole)] || null;
  }
  function recordOrganiserCorrection(day, playerId, hole, values) {
    store.event.organiserCorrections =
      store.event.organiserCorrections || {};
    const correctionDay =
        (store.event.organiserCorrections["day" + day] ||= {}),
      correctionPlayer = (correctionDay[String(playerId)] ||= {});
    correctionPlayer[String(hole)] = {
      ...values,
      playerId: String(playerId),
      organiserCorrected: true,
      correctedAt: values.correctedAt || new Date().toISOString(),
    };
    return correctionPlayer[String(hole)];
  }
  function explicitlyRecoveredPlayer(day, playerId) {
    return (store.event.emergencyRecoveryLog || []).some((entry) => {
      if (+entry.day !== +day) return false;
      const id = String(playerId);
      if (entry.type === "self-score-copy")
        return String(entry.recoveredPlayerId) === id ||
          String(entry.recoveredFailedPlayerId || "") === id;
      if (entry.type === "virtual-player-marker-card")
        return [entry.scorerId, entry.markedPlayerId].map(String).includes(id);
      return false;
    });
  }
  function recoveredRoundAccepted(day, playerId) {
    return explicitlyRecoveredPlayer(day, playerId) &&
      roundFinalisedFor(day, playerId) && officialCardProgress(day, playerId).complete;
  }
  function syncRecoveredPlayerRound(day, playerId) {
    if (!["scoring", "verify"].includes(store.event.playerRoundMode) ||
        !recoveredRoundAccepted(day, playerId)) return false;
    store.event.playerRoundMode = "completed";
    store.event.playerVerificationStage = "mine";
    store.event.returnToMarkedVerification = false;
    releaseRoundWakeLock();
    writeLocalStore();
    return true;
  }
  function officialCardProgress(day, playerId) {
    const puttsRequired = competitionIsOn("teamPutts", day),
      records = Array.from({ length: 18 }, (_, i) =>
        findOfficialForPlayer(day, playerId, i + 1),
      ),
      entered = records.filter((record) =>
        scoreEntered(record?.gross),
      ).length,
      puttsEntered = records.filter((record) =>
        scoreEntered(record?.putts),
      ).length;
    return {
      entered,
      puttsEntered,
      complete: entered === 18 && (!puttsRequired || puttsEntered === 18),
    };
  }
  function verificationIssueCount(day, playerId) {
    const mine = scoringDayStore(day)?.[String(playerId)] || {},
      puttsRequired = competitionIsOn("teamPutts", day);
    return Array.from({ length: 18 }, (_, i) => i + 1).filter((h) => {
      const self = mine[String(h)]?.self || {},
        off = findOfficialForPlayer(day, playerId, h),
        selfGross = self.gross ?? "",
        offGross = off?.gross ?? "";
      if (!off || !scoreEntered(selfGross) || !scoreEntered(offGross))
        return true;
      const scoreMatch =
          String(offGross).toUpperCase() === String(selfGross).toUpperCase(),
        puttsMatch =
          !puttsRequired ||
          (scoreEntered(off.putts) &&
            scoreEntered(self.putts) &&
            +off.putts === +self.putts);
      return !(scoreMatch && puttsMatch);
    }).length;
  }
  function verificationIssueHoles(day, playerId) {
    const mine = scoringDayStore(day)?.[String(playerId)] || {},
      puttsRequired = competitionIsOn("teamPutts", day);
    return Array.from({ length: 18 }, (_, i) => i + 1).filter((h) => {
      const self = mine[String(h)]?.self || {},
        off = findOfficialForPlayer(day, playerId, h);
      if (!off || !scoreEntered(self.gross) || !scoreEntered(off.gross))
        return true;
      return !(
        String(off.gross).toUpperCase() === String(self.gross).toUpperCase() &&
        (!puttsRequired ||
          (scoreEntered(off.putts) &&
            scoreEntered(self.putts) &&
            +off.putts === +self.putts))
      );
    });
  }
  function livePlayerStatus(day, playerId) {
    const setup = store.event.groupSetup?.["day" + day],
      ctx = playerGroupContext(playerId, day),
      start = setup?.starts?.[ctx?.groupIndex] || 1,
      seq = scoreSequence(start),
      official = officialCardProgress(day, playerId),
      entered = official.entered,
      mine = scoringDayStore(day)?.[String(playerId)] || {},
      eventComplete = store.event.status === "complete",
      verificationIssues = official.complete
        ? verificationIssueCount(day, playerId)
        : 0,
      markedVerificationIssues = official.complete
        ? markedScorecardVerification(day, playerId).mismatches.length
        : 0,
      emergencyFinalised = explicitlyRecoveredPlayer(day, playerId),
      finalised =
        eventComplete ||
        (roundFinalisedFor(day, playerId) &&
          ((emergencyFinalised && official.complete) ||
            (verificationIssues === 0 && markedVerificationIssues === 0))),
      issues = official.complete && !finalised
        ? verificationIssues + markedVerificationIssues
        : 0,
      next = seq[Math.min(entered, 17)],
      joined = Boolean(
        (store.cloudPlayers || []).find(
          (x) => String(x.playerId) === String(playerId),
        )?.joined,
      );
    const manualCard = ctx
      ? submittedManualCard(day, ctx.groupIndex)
      : null;
    if (manualCard) {
      return {
        playerId: String(playerId),
        joined,
        entered: 18,
        finalised: true,
        issues: 0,
        state: "finalised",
        label: "Complete",
        detail: "Official paper team card submitted",
        group: ctx.groupIndex + 1,
      };
    }
    if (ambroseIsOn(store.event, day) && ctx) {
      const checks = Array.from({ length: 18 }, (_, index) =>
          ambroseHoleAgreement(day, ctx.groupIndex, index + 1),
        ),
        ambroseEntered = checks.filter((check) => check.scorerDone).length,
        ambroseIssues = checks.filter((check) => check.mismatch).length,
        ambroseFinalised =
          store.event.status === "complete" ||
          Boolean(store.event.roundFinalised?.["day" + day]?.[String(playerId)]) ||
          ambroseTeamComplete(day, ctx.groupIndex);
      let ambroseState = "notStarted",
        ambroseLabel = "Not started",
        ambroseDetail = joined ? "Connected · ready to start" : "Phone not joined";
      if (ambroseEntered) {
        ambroseState = "playing";
        ambroseLabel = "Playing";
        ambroseDetail = `${ambroseEntered} of 18 team scores entered`;
      }
      if (ambroseIssues) {
        ambroseState = "attention";
        ambroseLabel = "Attention";
        ambroseDetail = `${ambroseIssues} hole${ambroseIssues === 1 ? "" : "s"} need checking`;
      }
      if (ambroseTeamComplete(day, ctx.groupIndex) && !ambroseFinalised) {
        ambroseState = "ready";
        ambroseLabel = "Ready to finalise";
        ambroseDetail = "Team score and selected drives are complete";
      }
      if (ambroseFinalised) {
        ambroseState = "finalised";
        ambroseLabel = "Complete";
        ambroseDetail = "Ambrose team card complete";
      }
      return {
        playerId: String(playerId), joined, entered: ambroseEntered,
        finalised: ambroseFinalised, issues: ambroseIssues,
        state: ambroseState, label: ambroseLabel, detail: ambroseDetail,
        group: ctx.groupIndex + 1,
      };
    }
    let state = "notStarted",
      label = "Not started",
      detail = joined ? "Connected · ready to start" : "Phone not joined";
    if (entered > 0 && entered < 18) {
      state = "playing";
      label = "Playing";
      detail = `Hole ${next} next · ${entered} of 18 entered`;
    }
    if (entered === 18 && issues) {
      state = "attention";
      label = "Attention";
      detail = `${issues} hole${issues === 1 ? "" : "s"} need checking`;
    }
    if (entered === 18 && !issues) {
      state = "ready";
      label = "Ready to finalise";
      detail = competitionIsOn("teamPutts", day)
        ? "Both cards agree on all scores and putts"
        : "Both cards agree on all scores";
    }
    if (finalised) {
      state = "finalised";
      label = "Complete";
      detail = "Official card complete";
    }
    return {
      playerId: String(playerId),
      joined,
      entered,
      finalised,
      issues,
      state,
      label,
      detail,
      group: (ctx?.groupIndex ?? 0) + 1,
    };
  }
  function emergencyLog(entry) {
    store.event.emergencyRecoveryLog =
      store.event.emergencyRecoveryLog || [];
    store.event.emergencyRecoveryLog.push({
      ...entry,
      at: new Date().toISOString(),
      device: "organiser",
    });
  }
  function emergencyFinaliseIfVerified(
    day,
    playerId,
    organiserAccepted = false,
  ) {
    const id = String(playerId || "");
    if (
      !id ||
      (organiserAccepted
        ? !officialCardProgress(day, id).complete
        : verificationIssueCount(day, id) !== 0)
    )
      return false;
    const at = new Date().toISOString(),
      round = scorerStore(day, id);
    store.event.roundFinalised = store.event.roundFinalised || {};
    store.event.roundFinalised["day" + day] =
      store.event.roundFinalised["day" + day] || {};
    store.event.roundFinalised["day" + day][id] = at;
    round._meta = {
      ...(round._meta || {}),
      finalisedAt: at,
      emergencyFinalised: true,
    };
    queueCloudRound(day, id);
    return true;
  }
  function closeEmergencyRecovery() {
    $("#modalShade").classList.remove("open");
  }
  function emergencyPlayerOptions(day, selected = "") {
    return dayFieldIds(day)
      .filter((id) => String(id) !== NO_PARTNER_ID)
      .map(String)
      .map(
        (id) =>
          `<option value="${esc(id)}" ${id === String(selected) ? "selected" : ""}>${esc(player(id)?.name || "Player")}</option>`,
      )
      .join("");
  }
  function openEmergencyRecovery() {
    const day = Math.min(
      store.event.days || 1,
      +(store.event.liveControlDay || 1),
    );
    $("#modalContent").innerHTML = `<div class="emergencyHead"><small>ORGANISER ONLY</small><h2>Emergency Score Recovery</h2><p>Use this only when normal phone scoring cannot be completed.</p></div><div class="emergencyChoices"><button type="button" id="recoverSelfScores"><b>Phone Failed During Play</b><span>Copy a player's available self-check scores into the official card their failed marker could not finish.</span></button><button type="button" id="enterVirtualCard"><b>Enter Player–Marker Card</b><span>Enter all 18 holes from MiScore or a manually completed card.</span></button><button type="button" id="correctOfficialHole"><b>Correct One Official Hole</b><span>Fix an isolated accepted score or missing putts after checking the manual card.</span></button></div><button class="soft emergencyClose" id="closeEmergencyRecovery">Close</button>`;
    $("#modalShade").classList.add("open");
    $("#correctOfficialHole b").textContent = "Correct a Player’s Card";
    $("#correctOfficialHole span").textContent =
      "Select a player, work through every unconfirmed hole and save authoritative organiser corrections.";
    $("#closeEmergencyRecovery").onclick = closeEmergencyRecovery;
    $("#recoverSelfScores").onclick = () =>
      renderSelfScoreRecovery(day);
    $("#enterVirtualCard").onclick = () => renderVirtualCard(day);
    $("#correctOfficialHole").onclick = () => renderOfficialHoleCorrection(day);
  }
  function officialRecordLocation(day, playerId, hole) {
    const dayScores = scoringDayStore(day);
    for (const [scorerId, round] of Object.entries(dayScores)) {
      const record = round?.[String(hole)];
      if (
        String(record?.official?.playerId || "") === String(playerId) &&
        (scoreEntered(record.official.gross) || scoreEntered(record.official.putts))
      )
        return { scorerId, record };
    }
    return null;
  }
  function renderOfficialHoleCorrection(day, selectedPlayerId, selectedHole = 1) {
    const ids = dayFieldIds(day)
        .filter((id) => String(id) !== NO_PARTNER_ID)
        .map(String),
      playerId = String(selectedPlayerId || ids[0] || ""),
      hole = Math.max(1, Math.min(18, +selectedHole || 1)),
      location = officialRecordLocation(day, playerId, hole),
      correction = organiserCorrectionFor(day, playerId, hole),
      official = correction || location?.record?.official || {},
      unconfirmed = verificationIssueHoles(day, playerId);
    $("#modalContent").innerHTML = `<div class="emergencyHead"><small>ORGANISER CORRECTION · DAY ${day}</small><h2>Correct a Player’s Card</h2><p>Use the signed card to correct an official entry. Organiser corrections are kept separately so an older phone upload cannot replace them.</p></div><div class="correctionWorklist"><label class="correctionHolePick">Select Hole<select id="correctionHole">${Array.from({ length: 18 }, (_, i) => `<option value="${i + 1}" ${i + 1 === hole ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label><div class="unconfirmedHoles"><small>UNCONFIRMED HOLES</small><b>${unconfirmed.length ? unconfirmed.join(", ") : "None — all holes agree"}</b></div></div><div class="officialCorrectionGrid"><label>Player<select id="correctionPlayer">${ids.map((id) => `<option value="${esc(id)}" ${id === playerId ? "selected" : ""}>${esc(player(id)?.name || "Player")}</option>`).join("")}</select></label><label>Gross strokes<input id="correctionGross" inputmode="text" maxlength="2" value="${esc(official.gross ?? "")}" placeholder="1–20 or P"></label><label>Putts<input id="correctionPutts" inputmode="numeric" maxlength="1" value="${esc(official.putts ?? "")}" placeholder="0–9"></label></div>${correction ? '<p class="recoveryNotice"><b>Authoritative organiser correction saved for this hole.</b></p>' : location ? `<p class="recoveryNotice">Current official entry found. Marker device: ${esc(player(location.scorerId)?.name || "Organiser recovery")}</p>` : '<p class="emergencyWarning"><b>No official entry is currently stored for this hole.</b><span>Select the correct player and hole, then enter the signed-card values.</span></p>'}<div class="emergencyActions"><button class="soft" id="backEmergency">← Back</button><button class="primary" id="saveOfficialCorrection">Save Organiser Correction</button></div>`;
    $("#correctionPlayer").onchange = (event) =>
      renderOfficialHoleCorrection(day, event.target.value, hole);
    $("#correctionHole").onchange = (event) =>
      renderOfficialHoleCorrection(day, playerId, +event.target.value);
    $("#backEmergency").onclick = openEmergencyRecovery;
    $("#saveOfficialCorrection").onclick = async () => {
      let gross = $("#correctionGross").value.trim().toUpperCase(),
        putts = $("#correctionPutts").value.trim();
      if (gross === "-" || gross === "–") gross = "P";
      if (
        !scoreEntered(gross) ||
        !scoreEntered(putts) ||
        (gross !== "P" && (!Number.isInteger(+gross) || +gross < 1 || +gross > 20)) ||
        !Number.isInteger(+putts) ||
        +putts < 0 ||
        +putts > 9 ||
        (gross !== "P" && +putts > +gross)
      )
        return alert("Enter gross strokes from 1–20 (or P) and putts from 0–9.");
      if (
        !confirm(
          `Record ${player(playerId)?.name || "Player"} — Hole ${hole}: ${gross} strokes, ${putts} putts as the official organiser correction?`,
        )
      )
        return;
      const assignedScorer =
          ids.find(
            (id) => String(markerTargetFor(id, day)) === String(playerId),
          ) || playerId,
        target =
          location ||
          ({
            scorerId: assignedScorer,
            record: scoreRecord(day, assignedScorer, hole),
          });
      target.record.official = {
        ...(target.record.official || {}),
        playerId,
        gross,
        putts: +putts,
        organiserCorrected: true,
        correctedAt: new Date().toISOString(),
      };
      recordOrganiserCorrection(day, playerId, hole, {
        gross,
        putts: +putts,
        scorerId: String(target.scorerId),
        correctedAt: target.record.official.correctedAt,
      });
      if (store.event.roundFinalised?.["day" + day])
        delete store.event.roundFinalised["day" + day][playerId];
      const correctedPlayerRound = scorerStore(day, playerId);
      if (correctedPlayerRound._meta?.finalisedAt)
        delete correctedPlayerRound._meta.finalisedAt;
      emergencyLog({
        type: "organiser-hole-correction",
        day,
        playerId,
        scorerId: target.scorerId,
        hole,
        gross,
        putts: +putts,
      });
      writeLocalStore();
      await flushCloudRound(day, target.scorerId);
      await updateCloudEvent();
      if (
        verificationIssueCount(day, playerId) === 0 &&
        markedScorecardVerification(day, playerId).mismatches.length === 0
      )
        emergencyFinaliseIfVerified(day, playerId, false);
      renderHome();
      renderLeaderboard();
      alert("The official hole has been corrected and saved.");
      renderOfficialHoleCorrection(day, playerId, hole);
    };
  }
  function renderSelfScoreRecovery(day, failedScorerId) {
    const ids = dayFieldIds(day)
      .filter((id) => String(id) !== NO_PARTNER_ID)
      .map(String);
    const failed = String(failedScorerId || ids[0] || ""),
      puttsRequired = competitionIsOn("teamPutts", day),
      markedId = markerTargetFor(failed, day),
      marked = player(markedId),
      own = scoringDayStore(day)?.[String(markedId)] || {},
      missing = [];
    for (let h = 1; h <= 18; h++) {
      const self = own[String(h)]?.self || {},
        official = findOfficialForPlayer(day, markedId, h);
      if (!official && scoreEntered(self.gross))
        missing.push({ h, gross: self.gross, putts: self.putts });
    }
    const rows = missing.length
      ? missing
          .map(
            (r) =>
              `<tr><td>${r.h}</td><td><input class="recoveryEdit" data-recoverygross="${r.h}" inputmode="text" maxlength="2" value="${esc(r.gross)}" aria-label="Hole ${r.h} gross strokes"></td>${puttsRequired ? `<td><input class="recoveryEdit" data-recoveryputts="${r.h}" inputmode="numeric" maxlength="1" value="${scoreEntered(r.putts) ? esc(r.putts) : ""}" placeholder="Required" aria-label="Hole ${r.h} putts"></td>` : ""}<td>${scoreEntered(r.gross) && (!puttsRequired || scoreEntered(r.putts)) ? "Ready" : "Complete entry"}</td></tr>`,
          )
          .join("")
      : '<tr><td colspan="4">No recoverable missing scores were found.</td></tr>';
    const recoveryRowValid = (row) => {
        const gross = String(row.gross ?? "").toUpperCase(),
          putts = Number(row.putts);
        return (
          scoreEntered(gross) &&
          (gross === "P" ||
            (Number.isInteger(+gross) && +gross >= 1 && +gross <= 20)) &&
          (!puttsRequired || (scoreEntered(row.putts) &&
            Number.isInteger(putts) && putts >= 0 && putts <= 9 &&
            (gross === "P" || putts <= +gross)))
        );
      },
      recoveryReady = () =>
        missing.length > 0 && missing.every(recoveryRowValid);
    $("#modalContent").innerHTML = `<div class="emergencyHead"><small>PHONE FAILURE · DAY ${day}</small><h2>Recover from Self-Scores</h2><p>Select the player whose phone failed. The app will find the official card that phone was marking.</p></div><label class="emergencySelect">Phone that failed<select id="failedScorer">${emergencyPlayerOptions(day, failed)}</select></label><div class="recoveryRelationship"><span><small>FAILED PHONE</small><b>${esc(player(failed)?.name || "Player")}</b></span><strong>was marking →</strong><span><small>PLAYER TO RECOVER</small><b>${esc(marked?.name || "No marker partner found")}</b></span></div><p class="recoveryNotice">Compare every entry with the manually completed card. Fill any missing ${puttsRequired ? "score or putts" : "score"} before accepting. Existing official scores will not be changed.</p><div class="emergencyTableWrap"><table class="emergencyTable"><thead><tr><th>Hole</th><th>${esc(playerSurname(markedId))} self score</th>${puttsRequired ? "<th>Putts</th>" : ""}<th>Official entry</th></tr></thead><tbody>${rows}</tbody></table></div>${officialCardProgress(day, failed).complete ? `<label class="recoveryNotice"><input id="acceptFailedOfficial" type="checkbox" checked style="width:auto"> Also accept ${esc(player(failed)?.name || "the failed-phone player")}’s completed official card after checking it. Their failed phone cannot verify the remaining holes.</label>` : ""}<div class="emergencyActions"><button class="soft" id="backEmergency">← Back</button><button class="primary" id="acceptSelfRecovery" ${recoveryReady() ? "" : "disabled"}>Accept ${missing.length} Self-Score${missing.length === 1 ? "" : "s"} as Correct</button></div>`;
    $("#failedScorer").onchange = (e) =>
      renderSelfScoreRecovery(day, e.target.value);
    $("#backEmergency").onclick = openEmergencyRecovery;
    $$('[data-recoverygross], [data-recoveryputts]').forEach((input) => {
      input.oninput = () => {
        const h = +(input.dataset.recoverygross || input.dataset.recoveryputts),
          row = missing.find((item) => item.h === h);
        if (!row) return;
        if (input.dataset.recoverygross) {
          const value = input.value.trim().toUpperCase();
          row.gross = value === "-" || value === "–" ? "P" : value;
        } else row.putts = input.value.trim();
        $("#acceptSelfRecovery").disabled = !recoveryReady();
      };
    });
    if ($("#acceptSelfRecovery"))
      $("#acceptSelfRecovery").onclick = async () => {
        if (!recoveryReady()) return;
        const acceptFailedOfficial = Boolean($("#acceptFailedOfficial")?.checked && officialCardProgress(day, failed).complete);
        if (
          !confirm(
            `Copy ${missing.length} ${marked?.name || "player"} self-score entries into the missing official card?${acceptFailedOfficial ? ` Also accept ${player(failed)?.name || "the failed-phone player"}'s completed official card.` : ""}`,
          )
        )
          return;
        missing.forEach((r) => {
          const rec = scoreRecord(day, failed, r.h);
          if (!findOfficialForPlayer(day, markedId, r.h)) {
            rec.official = {
              playerId: String(markedId),
              gross: r.gross,
              ...(puttsRequired ? { putts: r.putts } : {}),
              emergencyRecovered: true,
              recoveredAt: new Date().toISOString(),
            };
            recordOrganiserCorrection(day, markedId, r.h, {
              gross: r.gross,
              ...(puttsRequired ? { putts: +r.putts } : {}),
              scorerId: String(failed),
              emergencyRecovered: true,
            });
          }
        });
        emergencyLog({
          type: "self-score-copy",
          day,
          failedScorerId: failed,
          recoveredPlayerId: String(markedId),
          recoveredFailedPlayerId: acceptFailedOfficial ? failed : null,
          failedSelfMissingHoles: acceptFailedOfficial ? Array.from({length:18}, (_,i) => i+1).filter(h => !scoreEntered(scorerStore(day, failed)[String(h)]?.self?.gross)) : [],
          holes: missing.map((x) => x.h),
        });
        emergencyFinaliseIfVerified(day, markedId, true);
        if (acceptFailedOfficial) emergencyFinaliseIfVerified(day, failed, true);
        writeLocalStore();
        if (store.cloud?.role === "organiser" && store.cloud?.eventId) {
          await flushCloudRound(day, failed);
          await flushCloudRound(day, markedId);
          await updateCloudEvent();
        }
        closeEmergencyRecovery();
        renderHome();
        renderLeaderboard();
        alert(`${marked?.name || "Player"}'s missing official scores have been recovered.`);
      };
  }
  function virtualCardWarnings(values) {
    const warnings = [];
    values.forEach((row) => {
      [
        ["Player", row.selfGross, row.selfPutts],
        ["Partner", row.officialGross, row.officialPutts],
      ].forEach(([label, gross, putts]) => {
        if (!scoreEntered(gross) || !scoreEntered(putts))
          warnings.push(`Hole ${row.h}: ${label} entry is incomplete.`);
        else if (
          String(gross).toUpperCase() !== "P" &&
          (+gross < 1 || +gross > 20)
        )
          warnings.push(`Hole ${row.h}: ${label} score must be 1–20 or P.`);
        else if (+putts < 0 || +putts > 9)
          warnings.push(`Hole ${row.h}: ${label} putts must be 0–9.`);
        else if (String(gross).toUpperCase() !== "P" && +putts > +gross)
          warnings.push(`Hole ${row.h}: ${label} putts exceed total strokes.`);
      });
    });
    return warnings;
  }
  function renderVirtualCard(day, scorerId) {
    const ids = dayFieldIds(day)
        .filter((id) => String(id) !== NO_PARTNER_ID)
        .map(String),
      scorer = String(scorerId || ids[0] || ""),
      targetId = markerTargetFor(scorer, day),
      c = course(store.event["course" + day]),
      v = eventCourseScorecard(day,store.event,scorer),
      existing = Object.keys(scoringDayStore(day)?.[scorer] || {}).filter(
        (x) => /^\d+$/.test(x),
      ).length;
    const rows = Array.from({ length: 18 }, (_, i) => {
      const h = i + 1;
      return `<tr><td><b>${h}</b><small>Par ${v.par?.[i] || "—"}</small></td><td><input aria-label="${esc(player(scorer)?.name || "Player")} Hole ${h} strokes" data-vcard="${h}|selfGross" inputmode="text" maxlength="2"></td><td><input aria-label="${esc(player(scorer)?.name || "Player")} Hole ${h} putts" data-vcard="${h}|selfPutts" inputmode="numeric" maxlength="1"></td><td><input aria-label="${esc(player(targetId)?.name || "Partner")} Hole ${h} strokes" data-vcard="${h}|officialGross" inputmode="text" maxlength="2"></td><td><input aria-label="${esc(player(targetId)?.name || "Partner")} Hole ${h} putts" data-vcard="${h}|officialPutts" inputmode="numeric" maxlength="1"></td></tr>`;
    }).join("");
    $("#modalContent").innerHTML = `<div class="emergencyHead"><small>COMPLETE CARD · DAY ${day}</small><h2>Enter Player–Marker Card</h2><div class="virtualCourseName"><small>COURSE SCORECARD</small><b>${esc(c?.name || "Course not selected")}</b></div><p>Enter <b>gross strokes taken</b> from MiScore or the manual card. Away Golf calculates Stableford points automatically.</p></div><label class="emergencySelect">Virtual player / scorer<select id="virtualScorer">${emergencyPlayerOptions(day, scorer)}</select></label><div class="virtualCardNames"><span><small>SELF-CHECK CARD</small><b>${esc(player(scorer)?.name || "Player")}</b></span><span><small>OFFICIAL CARD BEING MARKED</small><b>${esc(player(targetId)?.name || "Marker partner")}</b></span></div>${existing ? `<div class="emergencyWarning"><b>Card already contains ${existing} hole${existing === 1 ? "" : "s"}.</b><span>Complete-card entry is disabled so existing phone scores cannot be overwritten.</span></div>` : ""}<p class="fastEntryHelp">Enter gross strokes and press Return to move to the next box. Zero putts is valid. Enter <b>P</b> or <b>–</b> for a pickup.</p><div class="emergencyTableWrap virtualCardWrap"><table class="emergencyTable virtualCard"><thead><tr><th>Hole</th><th>${esc(playerSurname(scorer))}<br>Gross Strokes</th><th>${esc(playerSurname(scorer))}<br>Putts</th><th>${esc(playerSurname(targetId))}<br>Official Strokes</th><th>${esc(playerSurname(targetId))}<br>Putts</th></tr></thead><tbody>${rows}</tbody></table></div><div id="virtualCardCheck" class="virtualCardCheck">0 of 72 entries completed</div><div class="emergencyActions"><button class="soft" id="backEmergency">← Back</button><button class="primary" id="reviewVirtualCard" ${existing ? "disabled" : ""}>Review Card</button></div>`;
    $("#virtualScorer").onchange = (e) =>
      renderVirtualCard(day, e.target.value);
    $("#backEmergency").onclick = openEmergencyRecovery;
    const inputs = $$('[data-vcard]');
    const updateCount = () => {
      const n = inputs.filter((x) => x.value.trim() !== "").length;
      $("#virtualCardCheck").textContent = `${n} of 72 entries completed`;
    };
    inputs.forEach((input, i) => {
      input.oninput = () => {
        const scoreField = /Gross$/.test(input.dataset.vcard || "");
        input.value = scoreField
          ? input.value.toUpperCase().replace(/[–—-]/g, "P").replace(/[^0-9P]/g, "")
          : input.value.replace(/[^0-9]/g, "");
        if (scoreField && input.value.includes("P")) input.value = "P";
        updateCount();
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          inputs[i + 1]?.focus();
          inputs[i + 1]?.select();
        }
      };
    });
    $("#reviewVirtualCard").onclick = () => {
      const values = Array.from({ length: 18 }, (_, i) => {
        const h = i + 1,
          get = (key) =>
            $(`[data-vcard="${h}|${key}"]`).value.trim().toUpperCase();
        return {
          h,
          selfGross: get("selfGross"),
          selfPutts: get("selfPutts"),
          officialGross: get("officialGross"),
          officialPutts: get("officialPutts"),
        };
      });
      const warnings = virtualCardWarnings(values);
      if (warnings.length) {
        $("#virtualCardCheck").innerHTML = `<b>Check ${warnings.length} entr${warnings.length === 1 ? "y" : "ies"}</b><span>${warnings.slice(0, 6).map(esc).join("<br>")}${warnings.length > 6 ? `<br>…and ${warnings.length - 6} more` : ""}</span>`;
        $("#virtualCardCheck").classList.add("hasWarnings");
        return;
      }
      if (
        !confirm(
          `Accept the complete Player–Marker card for ${player(scorer)?.name || "this player"}?`,
        )
      )
        return;
      values.forEach((r) => {
        const rec = scoreRecord(day, scorer, r.h);
        rec.self = {
          playerId: scorer,
          gross: r.selfGross,
          putts: +r.selfPutts,
          emergencyEntered: true,
        };
        rec.official = {
          playerId: String(targetId),
          gross: r.officialGross,
          putts: +r.officialPutts,
          emergencyEntered: true,
        };
        recordOrganiserCorrection(day, targetId, r.h, {
          gross: r.officialGross,
          putts: +r.officialPutts,
          scorerId: String(scorer),
          emergencyEntered: true,
        });
      });
      emergencyLog({
        type: "virtual-player-marker-card",
        day,
        scorerId: scorer,
        markedPlayerId: String(targetId),
        holes: Array.from({ length: 18 }, (_, i) => i + 1),
      });
      emergencyFinaliseIfVerified(day, scorer, true);
      emergencyFinaliseIfVerified(day, targetId, true);
      writeLocalStore();
      queueCloudRound(day, scorer);
      closeEmergencyRecovery();
      renderHome();
      renderLeaderboard();
      alert("The complete Player–Marker card has been accepted.");
    };
    inputs[0]?.focus();
  }
  function emergencyRuleText(day, virtualId, affectedId, ntpExtraPlayers) {
    const prefix = store.event.days > 1 ? `Day ${day}: ` : "";
    const base = `${prefix}We are a player short for our Away Golf Event today. ${player(virtualId)?.name || "A player"} has been randomly selected to be the virtual player to partner ${player(affectedId)?.name || "the player with the missing partner"} in all multiplayer competitions.`;
    const shots = Object.entries(ntpExtraPlayers || {}).map(([hole, id]) => `${player(id)?.name || "A player"} has been randomly selected to have 2 shots on the NTP hole ${hole}.`);
    return [base, ...shots].join(" ");
  }
  function openMissingPlayerReplacement(day) {
    initialiseGroups();
    const key = "day" + day, setup = store.event.groupSetup?.[key];
    if (!setup || store.event.emergencyReplacements?.[key]) {
      alert(store.event.emergencyReplacements?.[key] ? "An emergency replacement has already been applied for this day." : "The groups for this day are not ready.");
      return;
    }
    const ids = dayFieldIds(day).filter((id) => String(id) !== NO_PARTNER_ID);
    $("#modalContent").innerHTML = `<div class="emergencyHead"><small>BEFORE PLAY · DAY ${day}</small><h2>Emergency Missing Player</h2><p>Select the player who has not arrived. The change remains available until that player's group records its first score.</p></div><label class="emergencySelect">Select Missing Player<select id="missingPlayerSelect"><option value="">Choose player…</option>${ids.map((id) => { const groupIndex = setup.groups.findIndex((g) => g.map(String).includes(String(id))), started = groupHasScoreEntries(day, groupIndex); return `<option value="${esc(id)}" ${started ? "disabled" : ""}>${esc(player(id)?.name || "Player")}${started ? " — group already scoring" : ""}</option>`; }).join("")}</select></label><div id="missingPlayerPreview"></div><div class="emergencyActions"><button class="soft" id="cancelMissingPlayer">Cancel</button><button class="primary" id="applyMissingPlayer" disabled>Apply Emergency Replacement</button></div>`;
    $("#modalShade").classList.add("open");
    let proposal = null;
    const propose = (missingId) => {
      const groupIndex = setup.groups.findIndex((g) => g.map(String).includes(String(missingId))), group = setup.groups[groupIndex]?.map(String) || [], missingIndex = group.indexOf(String(missingId)), pairStart = missingIndex < 2 ? 0 : 2, affectedId = group.slice(pairStart, pairStart + 2).find((id) => id !== String(missingId)), realInGroup = group.filter((id) => id !== String(missingId) && id !== NO_PARTNER_ID), aggregatePartner = aggregatePar3Partner(missingId,day), candidates = ids.filter((id) => !group.includes(String(id)) && String(id) !== String(missingId) && String(id) !== aggregatePartner && !Object.values(setup.shortTeams||{}).some(a=>String(a.virtualPlayer)===String(id))), virtualId = chooseRandom(candidates), ntpExtraPlayers = {};
      if (groupIndex < 0 || groupHasScoreEntries(day, groupIndex) || !affectedId || !virtualId || realInGroup.length !== 3) return null;
      const shuffled = shuffleCopy(realInGroup);
      ntpHolesInPlayingOrder(day).forEach((hole, i) => ntpExtraPlayers[String(hole)] = shuffled[i % shuffled.length]);
      return { missingId: String(missingId), groupIndex, missingIndex, affectedId: String(affectedId), virtualId: String(virtualId), ntpExtraPlayers };
    };
    $("#missingPlayerSelect").onchange = (e) => {
      proposal = propose(e.target.value); $("#applyMissingPlayer").disabled = !proposal;
      $("#missingPlayerPreview").innerHTML = proposal
        ? `<div class="emergencyWarning"><b>${esc(player(proposal.missingId)?.name)} will be removed from today’s draw.</b><span>${esc(player(proposal.virtualId)?.name)} will be the locked virtual player for ${esc(player(proposal.affectedId)?.name)}. The remaining three players will mark each other.</span>${Object.entries(proposal.ntpExtraPlayers).map(([hole, id]) => `<span>Hole ${hole} NTP extra attempt: ${esc(player(id)?.name)}</span>`).join("")}</div>`
        : e.target.value
          ? '<div class="emergencyWarning"><b>No emergency replacement is available.</b><span>An emergency replacement requires a four-player team that has not started scoring and an unused eligible Virtual Player outside that team.</span></div>'
          : "";
    };
    $("#cancelMissingPlayer").onclick = () => $("#modalShade").classList.remove("open");
    $("#applyMissingPlayer").onclick = async () => {
      if (!proposal || !confirm(`Apply the emergency replacement for ${player(proposal.missingId)?.name}?`)) return;
      if (groupHasScoreEntries(day, proposal.groupIndex)) {
        alert("This group has now begun scoring, so its player arrangement can no longer be changed.");
        return;
      }
      setup.groups[proposal.groupIndex][proposal.missingIndex] = NO_PARTNER_ID;
      Object.assign(setup, { missingPlayerId: proposal.missingId, virtualPlayer: proposal.virtualId, ntpExtraPlayers: proposal.ntpExtraPlayers });
      store.event.emergencyReplacements = store.event.emergencyReplacements || {};
      store.event.emergencyReplacements[key] = { missingPlayerId: proposal.missingId, virtualPlayerId: proposal.virtualId, affectedPlayerId: proposal.affectedId, groupIndex: proposal.groupIndex, ntpExtraPlayers: proposal.ntpExtraPlayers, appliedAt: new Date().toISOString(), ruleText: emergencyRuleText(day, proposal.virtualId, proposal.affectedId, proposal.ntpExtraPlayers) };
      ensureShortTeamSelections(setup,day);
      persistStore();
      if (store.cloud?.role === "organiser" && store.cloud.eventId) await updateCloudEvent();
      $("#modalShade").classList.remove("open"); renderHome(); renderTeamsPage(); renderPlayerExperience();
    };
  }
  function manualDayStore(day, create = true) {
    if (!store.event) return null;
    if (!store.event.manualScorecards && create)
      store.event.manualScorecards = {};
    const root = store.event.manualScorecards;
    if (!root) return null;
    const key = "day" + day;
    if (!root[key] && create)
      root[key] = { groups: {}, ntp: {}, status: "draft" };
    return root[key] || null;
  }
  function manualDayFinalised(day) {
    const dayStore = manualDayStore(day, false);
    return Boolean(dayStore?.status === "submitted" && dayStore?.completedAt);
  }
  function manualGroupCard(day, groupIndex, create = true) {
    const dayStore = manualDayStore(day, create);
    if (!dayStore) return null;
    dayStore.groups = dayStore.groups || {};
    const key = String(groupIndex);
    if (!dayStore.groups[key] && create) {
      const setup = store.event?.groupSetup?.["day" + day],
        ids = (setup?.groups?.[groupIndex] || [])
          .map((id) =>
            String(id) === NO_PARTNER_ID
              ? String(setupForTeam(setup,groupIndex)?.virtualPlayer || "")
              : String(id),
          )
          .filter(Boolean);
      dayStore.groups[key] = {
        status: "draft",
        source: "paper-team-card",
        playerIds: ids,
        players: {},
        pairs: {},
        team: {},
        updatedAt: new Date().toISOString(),
      };
    }
    return dayStore.groups[key] || null;
  }
  function submittedManualCard(day, groupIndex) {
    const card = manualGroupCard(day, groupIndex, false);
    return card?.status === "submitted" ? card : null;
  }
  function manualCardForPlayer(day, playerId) {
    const ctx = playerGroupContext(String(playerId), day);
    return ctx ? submittedManualCard(day, ctx.groupIndex) : null;
  }
  function manualValue(object, path, fallback = "") {
    let value = object;
    for (const key of path.split(".")) {
      if (value == null) return fallback;
      value = value[key];
    }
    return value == null ? fallback : value;
  }
  function setManualValue(object, path, value) {
    const keys = path.split(".");
    let target = object;
    keys.slice(0, -1).forEach((key) => {
      target[key] = target[key] || {};
      target = target[key];
    });
    target[keys[keys.length - 1]] = value;
  }
  function manualSummaryFields(prefix, values = {}, required = true) {
    const field = (key, label, css = "") =>
      `<label class="${css}"><span>${label}</span><input inputmode="numeric" pattern="[0-9]*" data-manual="${esc(prefix + "." + key)}" ${required && key === "total" ? "data-required" : ""} value="${esc(values[key] ?? "")}"></label>`;
    return `<div class="manualSummaryFields">${field("total", "Total", "manualTotal")}${field("back9", "Back 9")}${field("last6", "Last 6")}${field("last3", "Last 3")}</div>`;
  }
  function manualSelectedCompetitions(day = store.event?.liveControlDay || 1) {
    return new Set((store.event?.competitions || []).filter(id=>competitionIsOn(id,day)));
  }
  function manualPar3Holes(day, id = null) {
    const ids=id==null?dayFieldIds(day).filter(x=>String(x)!==NO_PARTNER_ID):[id];
    const cards=ids.length?ids.map(pid=>eventCourseScorecard(day,store.event,pid)):[eventCourseScorecard(day)];
    return Array.from({length:18},(_,i)=>i+1).filter(hole=>cards.some(v=>+v.par?.[hole-1]===3));
  }

  function manualPlayerSummary(day, playerId, type) {
    const card = manualCardForPlayer(day, playerId);
    return card?.players?.[String(playerId)]?.[type] || null;
  }
  function manualPar3Point(day, playerId, hole) {
    const gross = manualCardForPlayer(day, playerId)?.players?.[
        String(playerId)
      ]?.par3?.[String(hole)];
    if (gross === "" || gross == null) return null;
    const v = eventCourseScorecard(day,store.event,playerId);
    if(+v.par?.[hole-1]!==3)return 0;
    return stablefordPoints(
      gross,
      +(v.par?.[hole - 1] || 0),
      v.index?.[hole - 1] ?? "",
      playerDailyHandicap(playerId, day),
    );
  }
  function manualPairSummary(day, unitId, type = "fourball") {
    const match = String(unitId).match(/^d\d+g(\d+)p(\d+)$/);
    if (!match) return null;
    const card = submittedManualCard(day, +match[1]);
    return card?.pairs?.["p" + match[2]]?.[type] || null;
  }
  function manualTeamSummary(day, unitId, type) {
    const match = String(unitId).match(/^d\d+g(\d+)$/);
    if (!match) return null;
    return submittedManualCard(day, +match[1])?.team?.[type] || null;
  }
  function manualTeamHasPhoneScores(day, groupIndex) {
    return Boolean(groupHasScoreEntries(day, groupIndex));
  }
  function manualRequirements(day, groupIndex) {
    const comps = manualSelectedCompetitions(day),
      setup = store.event?.groupSetup?.["day" + day],
      raw = setup?.groups?.[groupIndex] || [],
      virtualId = raw.some((id) => String(id) === NO_PARTNER_ID)
        ? String(setupForTeam(setup,groupIndex)?.virtualPlayer || "")
        : "",
      ids = raw
        .map((id) =>
          String(id) === NO_PARTNER_ID ? virtualId : String(id),
        )
        .filter(Boolean);
    return {
      ids,
      virtualId,
      shortTeam: Boolean(virtualId),
      single: comps.has("single") || comps.has("combined") || comps.has("capTeams"),
      fourball: comps.has("fourball"),
      best3: comps.has("best3of4"),
      putting: comps.has("teamPutts"),
      puttingPairs: store.event.puttingFormat === "pairs",
      par3: comps.has("par3"),
      ntp: comps.has("ntp"),
      yellowBall: yellowBallIsOn(day),
    };
  }
  function manualCalculatedSummary(values) {
    const sum = (items) =>
      items.reduce((total, value) => total + (value == null ? 0 : +value || 0), 0);
    return {
      total: String(sum(values)),
      back9: String(sum(values.slice(9, 18))),
      last6: String(sum(values.slice(12, 18))),
      last3: String(sum(values.slice(15, 18))),
    };
  }
  function manualYellowBallLoss(day, groupIndex, result) {
    if (!result || !result.lossHole || result.lossHole === "NONE") return null;
    const hole = +result.lossHole;
    const position = scoreSequence(groupStartingHole(store.event, day, groupIndex)).indexOf(hole);
    return position < 0 ? null : {hole, position, playerId: yellowBallPlayerForHole(day, groupIndex, hole), source: "paper-team-card"};
  }
  function deriveManualYellowBall(day, groupIndex, card, points) {
    const result = card.team.yellowBall;
    if (!result?.lossHole) return;
    const sequence = scoreSequence(groupStartingHole(store.event, day, groupIndex));
    const loss = manualYellowBallLoss(day, groupIndex, result);
    const counting = sequence.slice(0, loss ? loss.position : sequence.length);
    const values = counting.map(hole => points[yellowBallPlayerForHole(day, groupIndex, hole)]?.[hole - 1]);
    result.total = values.every(value => value != null) ? String(values.reduce((sum, value) => sum + value, 0)) : "";
  }
  function deriveManualFullCards(day, groupIndex, card, req) {
    if (!card.fullCardsOpen) return;
    const points = {};
    req.ids.forEach((id) => {
      const gross = card.players?.[id]?.fullGross || {},v=eventCourseScorecard(day,store.event,id);
      points[id] = Array.from({ length: 18 }, (_, index) => {
        const value = gross[String(index + 1)];
        return value === "" || value == null
          ? null
          : stablefordPoints(
              value,
              +(v.par?.[index] || 0),
              v.index?.[index] ?? "",
              playerDailyHandicap(id, day),
            );
      });
      setManualValue(card, `players.${id}.single`, manualCalculatedSummary(points[id]));
      manualPar3Holes(day).forEach((hole) => {
        const value = gross[String(hole)];
        setManualValue(
          card,
          `players.${id}.par3.${hole}`,
          value === "" || value == null ? "" : value,
        );
      });
      const putts = card.players?.[id]?.fullPuttsTotal;
      if (putts !== "" && putts != null)
        setManualValue(card, `players.${id}.putts.total`, String(+putts || 0));
    });
    if (req.yellowBall) deriveManualYellowBall(day, groupIndex, card, points);
    [req.ids.slice(0, 2), req.ids.slice(2, 4)].forEach((ids, pairIndex) => {
      const pairPoints = Array.from({ length: 18 }, (_, index) => {
        const values = ids.map((id) => points[id]?.[index]);
        return values.every((value) => value != null)
          ? Math.max(...values)
          : null;
      });
      setManualValue(
        card,
        `pairs.p${pairIndex}.fourball`,
        manualCalculatedSummary(pairPoints),
      );
    });
    const best3 = Array.from({ length: 18 }, (_, index) => {
      const values = req.ids.map((id) => points[id]?.[index]);
      if (!values.every((value) => value != null)) return null;
      return values.sort((a, b) => b - a).slice(0, 3).reduce((n, value) => n + value, 0);
    });
    setManualValue(card, "team.best3", manualCalculatedSummary(best3));
    const puttValues = req.ids.map(
      (id) => card.players?.[id]?.fullPuttsTotal,
    );
    if (puttValues.some((value) => value !== "" && value != null)) {
      const total = puttValues.reduce(
        (sum, value) => sum + (value === "" || value == null ? 0 : +value || 0),
        0,
      );
      setManualValue(card, "team.putts.total", String(total));
    }
  }
  function syncManualCalculatedInputs(card) {
    $("#modalContent")
      .querySelectorAll("[data-manual]")
      .forEach((input) => {
        if (
          input.dataset.manual.includes(".fullGross.") ||
          input.dataset.manual.endsWith(".fullPuttsTotal")
        )
          return;
        const value = manualValue(card, input.dataset.manual, "");
        input.value = value;
      });
  }
  function validateManualCard(card, host) {
    const missing = [...host.querySelectorAll("[data-required]")].filter(
      (input) => String(input.value).trim() === "",
    );
    if (missing.length) {
      missing[0].focus();
      alert(`Complete the remaining ${missing.length} highlighted field${missing.length === 1 ? "" : "s"} before submitting this team card.`);
      missing.forEach((input) => input.classList.add("manualMissing"));
      return false;
    }
    const invalid = [...host.querySelectorAll("[data-manual]")].find((input) => {
      if (input.value === "") return false;
      const grossEntry =
        input.dataset.manual.includes(".fullGross.") ||
        input.dataset.manual.includes(".par3.");
      if (grossEntry && input.value.toUpperCase() === "P") return false;
      if (!Number.isInteger(+input.value)) return true;
      return grossEntry
        ? +input.value < 1 || +input.value > 20
        : +input.value < 0 || +input.value > 999;
    });
    if (invalid) {
      invalid.focus();
      alert("Enter whole numbers only, or P for a pickup on a gross-score card. Check the highlighted field.");
      invalid.classList.add("manualMissing");
      return false;
    }
    return Boolean(card);
  }
  function bindManualInputs(card, day, groupIndex, req) {
    const inputs = [...$("#modalContent").querySelectorAll("[data-manual]")];
    inputs.forEach((input, index) => {
      input.oninput = () => {
        input.classList.remove("manualMissing");
        if (input.dataset.manual.includes(".fullGross."))
          input.value = input.value
            .toUpperCase()
            .replace(/[–—-]/g, "P")
            .replace(/[^0-9P]/g, "")
            .slice(0, 2);
        setManualValue(card, input.dataset.manual, input.value.trim());
        deriveManualFullCards(day, groupIndex, card, req);
        syncManualCalculatedInputs(card);
        card.status = "draft";
        card.updatedAt = new Date().toISOString();
        writeLocalStore();
        const saved = $("#manualSavedState");
        if (saved) saved.textContent = "Saved on this device ✓";
      };
      input.onkeydown = (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        inputs[index + 1]?.focus();
        inputs[index + 1]?.select?.();
      };
    });
  }
  function renderManualTeamCard(day, groupIndex) {
    const req = manualRequirements(day, groupIndex),
      card = manualGroupCard(day, groupIndex),
      playingCourse = course(store.event["course" + day]),
      playingVersion = eventCourseScorecard(day),
      comps = [],
      summarySection = (title, body, note = "") =>
        `<section class="manualEntrySection"><h3>${title}</h3>${note ? `<p>${note}</p>` : ""}${body}</section>`;
    deriveManualFullCards(day, groupIndex, card, req);
    const playerLabel = (id) =>
        `${esc(player(id)?.name || "Player")}${id === req.virtualId ? " <small>(VIRTUAL PLAYER)</small>" : ""}`,
      pairLabel = (ids) =>
        ids
          .map(
            (id) =>
              `<span class="manualPairPlayer">${playerLabel(id)}</span>`,
          )
          .join('<span class="manualPairAnd"> &amp; </span>'),
      fullCardEntry = card.fullCardsOpen
          ? `<section class="manualEntrySection manualFullCards"><div class="manualFullCardTitle"><div><h3>Individual Score Cards</h3><p>${req.shortTeam ? "Enter gross strokes from the three signed cards and the selected virtual player's card." : "Enter gross strokes from each player's signed card."} Enter P for a pickup.</p></div><div class="manualFullCardControls"><span>Calculated automatically</span><button type="button" class="soft" id="closeManualFullCards">Close Score Cards</button></div></div><div class="manualFullCardGrid" style="--manual-player-count:${req.ids.length}"><span class="manualPar3Corner" style="grid-column:1;grid-row:1">Hole</span><span class="manualPar3Corner" style="grid-column:2;grid-row:1">Par</span>${req.ids.map((id, playerIndex) => `<strong class="manualPar3Player" style="grid-column:${playerIndex + 3};grid-row:1">${playerLabel(id)}</strong>`).join("")}${Array.from({ length: 18 }, (_, index) => `<b class="manualPar3Hole" style="grid-column:1;grid-row:${index + 2}">${index + 1}</b><b class="manualFullCardPar" style="grid-column:2;grid-row:${index + 2}">${esc(playingVersion.par?.[index] ?? "–")}</b>`).join("")}${req.ids.map((id, playerIndex) => Array.from({ length: 18 }, (_, index) => `<input style="grid-column:${playerIndex + 3};grid-row:${index + 2}" inputmode="text" maxlength="2" data-required data-manual="players.${id}.fullGross.${index + 1}" value="${esc(card.players?.[id]?.fullGross?.[index + 1] ?? "")}" aria-label="${esc(player(id)?.name || "Player")} Hole ${index + 1} gross score, par ${esc(playingVersion.par?.[index] ?? "unknown")}">`).join("")).join("")}</div><div class="manualFullPutting"><h3>Team Putting</h3><div class="manualFullPuttingGrid" style="--manual-putting-count:${req.ids.length + 1}">${req.ids.map((id) => `<label><span>${playerLabel(id)}</span><input inputmode="numeric" pattern="[0-9]*" data-required data-manual="players.${id}.fullPuttsTotal" value="${esc(card.players?.[id]?.fullPuttsTotal ?? "")}"></label>`).join("")}<label class="manualPuttingTotal"><span>Total</span><input readonly data-manual="team.putts.total" value="${esc(card.team?.putts?.total ?? "")}" aria-label="Team putting total"></label></div></div></section>`
          : `<button type="button" class="primary manualOpenFullCards" id="openManualFullCards">Open Individual Score Cards</button>`;
    if (req.single)
      comps.push(
        summarySection(
          "Single Stableford",
          req.ids
            .map(
              (id) =>
                `<div class="manualEntryRow"><b>${playerLabel(id)}</b>${manualSummaryFields(`players.${id}.single`, card.players?.[id]?.single)}</div>`,
            )
            .join(""),
          "Enter each player's signed-card total and countback figures.",
        ),
      );
    if (req.fourball) {
      const pairs = [req.ids.slice(0, 2), req.ids.slice(2, 4)].filter(
        (ids) => ids.length,
      );
      comps.push(
        summarySection(
          "4BBB Stableford",
          pairs
            .map(
              (ids, index) =>
                `<div class="manualEntryRow"><b class="manualPairLabel">${pairLabel(ids)}</b>${manualSummaryFields(`pairs.p${index}.fourball`, card.pairs?.["p" + index]?.fourball)}</div>`,
            )
            .join(""),
        ),
      );
    }
    if (req.best3)
      comps.push(
        summarySection(
          "Best 3 of 4 Stableford",
          `<div class="manualEntryRow"><b>Team ${groupIndex + 1}</b>${manualSummaryFields("team.best3", card.team?.best3)}</div>`,
        ),
      );
    if (req.putting) {
      if (req.puttingPairs)
        comps.push(
          summarySection(
            "Putting — individual totals",
            req.ids
              .map(
                (id) =>
                  `<div class="manualEntryRow"><b>${playerLabel(id)}</b>${manualSummaryFields(`players.${id}.putts`, card.players?.[id]?.putts)}</div>`,
              )
              .join(""),
            "The app will combine the configured putting partners automatically.",
          ),
        );
      else
        comps.push(
          summarySection(
            "Team Putting",
            `<div class="manualEntryRow"><b>Team ${groupIndex + 1}</b>${manualSummaryFields("team.putts", card.team?.putts)}</div>`,
            "Only the team totals are required for this event's putting format.",
          ),
        );
    }
    if (req.par3) {
      const holes = manualPar3Holes(day);
      comps.push(
        summarySection(
          "Par 3 Scores",
          `<div class="manualPar3Grid" style="--manual-player-count:${req.ids.length}"><span class="manualPar3Corner">Hole</span>${req.ids
            .map(
              (id, playerIndex) =>
                `<strong class="manualPar3Player" style="grid-column:${playerIndex + 2};grid-row:1">${playerLabel(id)}</strong>`,
            )
            .join("")}${holes
            .map(
              (hole, holeIndex) =>
                `<b class="manualPar3Hole" style="grid-column:1;grid-row:${holeIndex + 2}">Hole ${hole}</b>`,
            )
            .join("")}${req.ids
            .map((id, playerIndex) =>
              holes
                .map(
                  (hole, holeIndex) =>
                    `<input style="grid-column:${playerIndex + 2};grid-row:${holeIndex + 2}" inputmode="numeric" pattern="[0-9]*" data-required data-manual="players.${id}.par3.${hole}" value="${esc(card.players?.[id]?.par3?.[hole] ?? "")}" aria-label="${esc(player(id)?.name || "Player")} Hole ${hole} gross score">`,
                )
                .join(""),
            )
            .join("")}</div>`,
          "Enter gross strokes. The app applies each player's handicap.",
        ),
      );
    }
    if (req.yellowBall) {
      card.team.yellowBall ||= {total: "", lossHole: ""};
      const result = card.team.yellowBall;
      const sequence = scoreSequence(groupStartingHole(store.event, day, groupIndex));
      comps.push(summarySection("Yellow Ball", `<label>Ball result<select id="manualYellowBallLoss" data-required><option value="">Choose result</option><option value="NONE" ${result.lossHole === "NONE" ? "selected" : ""}>Completed — ball not lost</option>${sequence.map(hole => `<option value="${hole}" ${String(result.lossHole) === String(hole) ? "selected" : ""}>Lost on Hole ${hole} — ${esc(player(yellowBallPlayerForHole(day, groupIndex, hole))?.name || "Player")}</option>`).join("")}</select></label><div class="manualEntryRow"><b>Yellow Ball points</b><label><span>Total</span><input inputmode="numeric" data-required data-manual="team.yellowBall.total" value="${esc(result.total ?? "")}"></label></div>`, "Count the nominated real golfer's Stableford points on each hole before the ball was lost. The loss hole does not count. Full score cards calculate this total automatically. Virtual Players never enter the rotation."));
    }
    const phoneWarning = manualTeamHasPhoneScores(day, groupIndex)
      ? '<div class="manualConflict"><b>Phone scores already exist for this team.</b><span>Submitting this paper card makes its summary results authoritative. The underlying phone scores are retained.</span></div>'
      : "";
    $("#modalContent").innerHTML = `<div class="emergencyHead manualEntryHead"><small>RECORD ALL SCORES · DAY ${day}</small><h2>Team ${groupIndex + 1} Paper Card</h2><p>${req.ids.map(playerLabel).join(" · ")}</p></div>${phoneWarning}<p class="manualAdaptiveNote">Only fields required by this event's selected competitions are shown.</p>${fullCardEntry}<div class="manualEntryBody">${comps.join("")}</div><div class="manualStickyActions"><span id="manualSavedState">${card.updatedAt ? "Saved on this device ✓" : "Not yet saved"}</span><div><button class="soft" id="backManualDashboard">← Teams</button><button class="soft" id="saveManualDraft">Save Draft</button><button class="primary" id="submitManualCard">${card.status === "submitted" ? "Update Submitted Card" : "Submit Team Card"}</button></div></div>`;
    bindManualInputs(card, day, groupIndex, req);
    if ($("#manualYellowBallLoss")) $("#manualYellowBallLoss").onchange = e => {
      card.team.yellowBall.lossHole = e.target.value;
      card.status = "draft";
      deriveManualFullCards(day, groupIndex, card, req);
      syncManualCalculatedInputs(card);
      writeLocalStore();
    };
    if (card.fullCardsOpen)
      $("#modalContent")
        .querySelectorAll("[data-manual]")
        .forEach((input) => {
          if (
            !input.dataset.manual.includes(".fullGross.") &&
            !input.dataset.manual.endsWith(".fullPuttsTotal")
          ) {
            input.readOnly = true;
            input.classList.add("manualCalculated");
          }
        });
    if ($("#openManualFullCards"))
      $("#openManualFullCards").onclick = () => {
        card.fullCardsOpen = true;
        card.status = "draft";
        card.updatedAt = new Date().toISOString();
        writeLocalStore();
        renderManualTeamCard(day, groupIndex);
      };
    if ($("#closeManualFullCards"))
      $("#closeManualFullCards").onclick = () => {
        card.fullCardsOpen = false;
        card.status = "draft";
        card.updatedAt = new Date().toISOString();
        writeLocalStore();
        renderManualTeamCard(day, groupIndex);
      };
    $("#backManualDashboard").onclick = () => renderManualScoresDashboard(day);
    $("#saveManualDraft").onclick = () => {
      card.updatedAt = new Date().toISOString();
      writeLocalStore();
      $("#manualSavedState").textContent = "Saved on this device ✓";
    };
    $("#submitManualCard").onclick = async () => {
      if (!validateManualCard(card, $("#modalContent"))) return;
      if (
        !confirm(
          `Submit Team ${groupIndex + 1}'s paper card as the authoritative Day ${day} result?`,
        )
      )
        return;
      card.status = "submitted";
      card.submittedAt = new Date().toISOString();
      card.updatedAt = card.submittedAt;
      card.phoneScoresSuperseded = manualTeamHasPhoneScores(day, groupIndex);
      writeLocalStore();
      if (store.cloud?.role === "organiser" && store.cloud.eventId)
        await updateCloudEvent();
      renderHome();
      renderLeaderboard();
      renderManualScoresDashboard(day);
    };
  }
  function renderManualNtpEditor(day) {
    const dayStore = manualDayStore(day),
      holes = ntpHolesInPlayingOrder(day),
      ids = dayFieldIds(day)
        .filter((id) => String(id) !== NO_PARTNER_ID)
        .map(String);
    if (!holes.length) return "";
    return `<section class="manualNtpEditor"><h3>Nearest the Pin</h3><p>Select the paper-card winner or Not Won.</p>${holes
      .map(
        (hole) =>
          `<label><b>Hole ${hole}</b><select data-manual-ntp="${hole}"><option value="">Select result</option><option value="NONE" ${dayStore.ntp?.[hole] === "NONE" ? "selected" : ""}>Not Won</option>${ids.map((id) => `<option value="${esc(id)}" ${String(dayStore.ntp?.[hole] || "") === id ? "selected" : ""}>${esc(player(id)?.name || "Player")}</option>`).join("")}</select></label>`,
      )
      .join("")}</section>`;
  }
  function manualDayReady(day) {
    const setup = store.event?.groupSetup?.["day" + day],
      cardsReady = Boolean(
        setup?.groups?.length &&
          setup.groups.every((raw, index) => {
            if (submittedManualCard(day, index)) return true;
            const ids = raw
              .map(String)
              .filter((id) => id && id !== NO_PARTNER_ID);
            return Boolean(
              ids.length && ids.every((id) => livePlayerStatus(day, id).finalised),
            );
          }),
      ),
      comps = manualSelectedCompetitions(day),
      ntpReady =
        !comps.has("ntp") ||
        ntpHolesInPlayingOrder(day).every(
          (hole) => String(manualDayStore(day, false)?.ntp?.[hole] || "") !== "",
        );
    return cardsReady && ntpReady;
  }
  function renderManualScoresDashboard(day) {
    const days = store.event.days || 1,
      selectedDay = Math.max(1, Math.min(days, +day || 1)),
      setup = store.event?.groupSetup?.["day" + selectedDay],
      dayStore = manualDayStore(selectedDay),
      groups = setup?.groups || [];
    $("#modalContent").innerHTML = `<div class="emergencyHead manualEntryHead"><small>ORGANISER PAPER-CARD ENTRY</small><h2>Record All Scores</h2><p>Enter one signed team card at a time. Draft entries do not affect results.</p></div>${dayTabs("manualday", selectedDay, store.event, "manualDayTabs")}<div class="manualTeamDashboard">${groups
      .map((raw, index) => {
        const req = manualRequirements(selectedDay, index),
          ids = req.ids,
          card = manualGroupCard(selectedDay, index, false),
          status = card?.status === "submitted" ? "Submitted ✓" : card ? "Draft" : "Not started";
        return `<section class="manualTeamTile ${card?.status || "empty"}"><div><small>TEAM ${index + 1}</small><h3>${ids.map((id) => `${esc(player(id)?.name || "Player")}${id === req.virtualId ? ' <em class="manualVirtualLabel">(VIRTUAL PLAYER)</em>' : ""}`).join(" · ")}</h3><span>${status}</span></div><button class="${card?.status === "submitted" ? "soft" : "primary"}" data-openmanualteam="${index}">${card?.status === "submitted" ? "Review / Edit" : card ? "Continue" : "Open Team Card"}</button></section>`;
      })
      .join("") || '<p class="leaderEmpty">Save the teams for this day before recording paper cards.</p>'}</div>${manualSelectedCompetitions(selectedDay).has("ntp") ? renderManualNtpEditor(selectedDay) : ""}<div class="manualDayFinish"><div><b>${manualDayReady(selectedDay) ? `Day ${selectedDay} entry complete ✓` : `Day ${selectedDay} remains in progress`}</b><span>${manualDayReady(selectedDay) ? "All paper cards and NTP results are ready for the leaderboards." : "Submit every team card and complete the NTP result before finishing the day."}</span></div><button class="primary" id="completeManualDay" ${manualDayReady(selectedDay) ? "" : "disabled"}>Complete Day ${selectedDay} Results</button></div><button class="soft emergencyClose" id="closeManualScores">Close</button>`;
    $("#modalShade").classList.add("open");
    $$('[data-manualday]').forEach(
      (button) =>
        (button.onclick = () => openManualScores(+button.dataset.manualday)),
    );
    $$('[data-openmanualteam]').forEach(
      (button) =>
        (button.onclick = () =>
          renderManualTeamCard(selectedDay, +button.dataset.openmanualteam)),
    );
    $$('[data-manual-ntp]').forEach((select) => {
      select.onchange = () => {
        dayStore.ntp[select.dataset.manualNtp] = select.value;
        dayStore.ntpFinalised = false;
        writeLocalStore();
        renderManualScoresDashboard(selectedDay);
      };
    });
    $("#completeManualDay").onclick = async () => {
      if (!manualDayReady(selectedDay)) return;
      dayStore.status = "submitted";
      dayStore.ntpFinalised = true;
      dayStore.completedAt = new Date().toISOString();
      writeLocalStore();
      if (store.cloud?.role === "organiser" && store.cloud.eventId)
        await updateCloudEvent();
      renderHome();
      renderLeaderboard();
      renderManualScoresDashboard(selectedDay);
    };
    $("#closeManualScores").onclick = () =>
      $("#modalShade").classList.remove("open");
  }
  function openManualScores(day = 1) {
    if (ambroseIsOn(store.event, day)) {
      alert("Ambrose paper-card entry will use its dedicated team score and selected-drives card in the next stage.");
      return;
    }
    const selectedDay = Math.max(
        1,
        Math.min(store.event?.days || 1, +day || 1),
      ),
      unsupported = [
      ["scratch", "Scratch"],
      ["eclectic", "Eclectic"],
    ].filter(([key]) => manualSelectedCompetitions(selectedDay).has(key));
    if (unsupported.length) {
      alert(
        `Record All Scores does not yet support ${unsupported.map(([, label]) => label).join(", ")} on Day ${selectedDay}. Keep using phone scoring for that day, or remove that competition before entering paper cards.`,
      );
      return;
    }
    renderManualScoresDashboard(selectedDay);
  }

  function renderLiveEventControl() {
    const host = $("#liveEventControl"),
      basic = $("#basicEventProgress");
    if (!host || !basic) return;
    if (store.event?.status === "cancelled") {
      host.innerHTML = "";
      basic.style.display = "none";
      return;
    }
    if (!store.event?.locked || isPlayerDevice() || isSpectatorDevice()) {
      host.innerHTML = "";
      basic.style.display = "";
      return;
    }
    basic.style.display = "none";
    const days = store.event.days || 1,
      day = Math.min(
        days,
        +(store.event.liveControlDay || store.event.activeGroupDay || 1),
      ),
      ids = dayFieldIds(day)
        .filter((id) => String(id) !== NO_PARTNER_ID)
        .map(String),
      rows = ids
        .map((id) => livePlayerStatus(day, id))
        .sort(
          (a, b) =>
            a.group - b.group ||
            (eventPlayer(a.playerId, day)?.name || "").localeCompare(
              eventPlayer(b.playerId, day)?.name || "",
            ),
        ),
      joined = rows.filter((x) => x.joined).length,
      playing = rows.filter(
        (x) => x.state === "playing" || x.state === "ready",
      ).length,
      attention = rows.filter((x) => x.state === "attention").length,
      finalised = rows.filter((x) => x.finalised).length,
      allFinal = Boolean(rows.length && finalised === rows.length),
      scoringOpen = scoringIsOpen(day);
    scheduleScoringOpening(day);
    host.innerHTML = `<section class="liveControlCard"><div class="liveControlHead"><div><small>${store.event.ridgeTestMode ? "RIDGE 16-PLAYER TEST" : store.event.testMode ? "OATLANDS TEST EVENT" : "ORGANISER'S LIVE EVENT CONTROL"}</small><h2>${days === 1 ? "Round Progress" : `Day ${day} Round Progress`}</h2><p>See who is connected, playing, waiting for a score check or finished.</p></div><div class="liveControlActions"><button class="soft" id="liveOrganiserInstructions">Organiser Instructions</button><button class="manualScoresBtn" id="recordAllScores">Record All Scores</button><button class="emergencyRecoveryBtn" id="replaceRealPlayer">${store.event.realPlayerSubstitutionPending ? "Retry Substitute Update" : "Replace Player"}</button><button class="emergencyRecoveryBtn" id="missingPlayerReplacement">Missing Player</button><button class="emergencyRecoveryBtn" id="emergencyRecovery">Emergency Score Recovery</button><button class="soft" id="refreshLiveControl">Refresh</button></div></div>${dayTabs("liveday", day)}<div class="liveCounters"><div><small>JOINED</small><b>${joined}<em>/${rows.length}</em></b></div><div><small>PLAYING</small><b>${playing}</b></div><div class="${attention ? "warn" : ""}"><small>ATTENTION</small><b>${attention}</b></div><div class="${allFinal ? "done" : ""}"><small>COMPLETE</small><b>${finalised}<em>/${rows.length}</em></b></div></div>${allFinal ? `<div class="prizeReady"><div><b>✓ Prize Giving Ready</b><span>${days === 1 ? "Every scorecard" : `Every Day ${day} scorecard`} is complete.</span></div><button class="primary" id="openPrizeSummary">Open Results Summary</button></div>` : `<div class="resultsWaiting"><b>Results remain In Progress</b><span>${rows.length - finalised} player${rows.length - finalised === 1 ? "" : "s"} still to complete${days === 1 ? "." : ` Day ${day}.`}</span></div>`}<div class="livePlayerList">${rows.map((r) => `<div class="livePlayerRow ${r.state}"><div class="livePlayerName"><i class="${r.joined ? "connected" : ""}"></i><span><b>${esc(eventPlayer(r.playerId, day)?.name || "Player")}</b><small>Group ${r.group} · ${r.joined ? "Phone joined" : "Not joined"}</small></span></div><div class="liveProgress"><span><i style="width:${Math.round((r.entered / 18) * 100)}%"></i></span><small>${r.entered}/18</small></div><div class="livePlayerState"><b>${esc(r.label)}</b><small>${esc(r.detail)}</small></div></div>`).join("") || '<p class="leaderEmpty">No players are assigned for this day.</p>'}</div><p class="liveControlNote">Progress follows each player's official marker card. Attention means a complete official card still has a player/marker discrepancy requiring review. <button class="testToolsLink" id="testEventTools">Testing Tools</button></p></section>`;
    if (!scoringOpen) {
      const actions = host.querySelector(".liveControlActions");
      actions?.insertAdjacentHTML("afterbegin", '<button class="emergencyRecoveryBtn" id="openScoringNow">Open Scoring Now</button>');
      host.querySelector(".liveControlHead p").textContent = `Scoring opens at ${scoringOpeningLabel(day)}, 15 minutes before the first tee time.`;
    }
    $$("[data-liveday]").forEach(
      (b) =>
        (b.onclick = () => {
          store.event.liveControlDay = +b.dataset.liveday;
          writeLocalStore();
          renderLiveEventControl();
        }),
    );
    $("#refreshLiveControl").onclick = async () => {
      await syncCloudNow();
      renderLiveEventControl();
    };
    $("#emergencyRecovery").onclick = openEmergencyRecovery;
    $("#recordAllScores").onclick = () => openManualScores(day);
    $("#missingPlayerReplacement").onclick = () => openMissingPlayerReplacement(day);
    $("#replaceRealPlayer").onclick = () => openPlayerSubstitution(day);
    $("#liveOrganiserInstructions").onclick = openOrganiserInstructions;
    if ($("#openScoringNow"))
      $("#openScoringNow").onclick = async () => {
        if (!confirm(`Open all Day ${day} scorecards now?`)) return;
        store.event.scoringOpenedEarly = store.event.scoringOpenedEarly || {};
        store.event.scoringOpenedEarly["day" + day] = true;
        persistStore();
        if (store.cloud?.role === "organiser" && store.cloud.eventId)
          await updateCloudEvent();
        renderLiveEventControl();
        renderPlayerExperience();
      };
    if ($("#openPrizeSummary"))
      $("#openPrizeSummary").onclick = () => {
        store.event.leaderboardView = "summary";
        writeLocalStore();
        nav("leaderboardPage");
      };
  }

  function closeCloudConnection() {
    cloudBusy = false;
    clearTimeout(cloudReloadTimer);
    cloudReloadTimer = null;
    for (const timer of cloudRoundTimers.values()) clearTimeout(timer);
    cloudRoundTimers.clear();
    cloudRoundChains.clear();
    lastCloudBundleSignature = "";
    if (cloudChannel && AwayCloud?.client?.removeChannel)
      AwayCloud.client.removeChannel(cloudChannel);
    cloudChannel = null;
  }
  function openEventOptions() {
    if (!store.event) return;
    if (isGuestOrganiser()) {
      $("#modalContent").innerHTML = `<h2>Event Options</h2><p><b>${esc(store.event.name)}</b></p><p>Your Guest Organiser access is limited to planning and operating this event.</p><div class="eventOptionActions"><button class="primary" id="continueEventSetup">Continue Event Setup</button><button class="soft" id="closeEventOptions">Close</button></div>`;
      $("#modalShade").classList.add("open");
      $("#continueEventSetup").onclick = () => {
        $("#modalShade").classList.remove("open");
        reopenEventPlan();
      };
      $("#closeEventOptions").onclick = () => $("#modalShade").classList.remove("open");
      return;
    }
    if (store.event.testMode) {
      alert("Use Testing Tools to change or finish the protected test event.");
      return;
    }
    const cancelled = store.event.status === "cancelled";
    $("#modalContent").innerHTML =
      `<h2>Event Options</h2><p><b>${esc(store.event.name)}</b></p><p>${cancelled ? "This event is already cancelled. You may retain it for reference or delete it from this device." : "Continue planning, cancel an event that will not proceed, or permanently delete an unwanted design/draft event."}</p><div class="eventOptionActions">${cancelled ? "" : '<button class="primary" id="continueEventSetup">Continue Event Setup</button>'}${!cancelled&&store.event.locked&&+store.event.days>1?'<button class="primary" id="modifyFutureRounds">Modify Future Rounds</button>':""}${cancelled ? "" : `<button class="danger" id="cancelCurrentEvent">Cancel Event</button>`}<button class="danger" id="deleteCurrentEvent">Delete Event from This Device</button><button class="danger clearTestsBtn" id="clearPreviousTests">Clear All Previous Test Events</button><button class="soft" id="preparePlayerDevice">Prepare This Device for Player Use</button><button class="soft" id="closeEventOptions">Keep Event and Close</button></div><p class="backupSafetyNote"><b>Device-only cleanup:</b> Preparing this device for player use removes its local organiser-event list only. It cannot alter Supabase, another phone or tablet, or the organiser PC.</p>`;
    $("#modalShade").classList.add("open");
    if ($("#cancelCurrentEvent"))
      $("#cancelCurrentEvent").onclick = cancelCurrentEvent;
    if ($("#continueEventSetup"))
      $("#continueEventSetup").onclick = () => {
        $("#modalShade").classList.remove("open");
        reopenEventPlan();
      };
    if ($("#modifyFutureRounds")) $("#modifyFutureRounds").onclick = openFutureRoundEditor;
    $("#deleteCurrentEvent").onclick = deleteCurrentEvent;
    $("#clearPreviousTests").onclick = clearPreviousTestEvents;
    $("#preparePlayerDevice").onclick = prepareDeviceForPlayerUse;
    $("#closeEventOptions").onclick = () =>
      $("#modalShade").classList.remove("open");
  }
  function eventDayStarted(day) {
    if (eventDayComplete(day) || manualDayStore(day,false)?.status) return true;
    if (Object.values(store.event.scoring?.["day"+day]||{}).some(round=>Object.keys(round||{}).some(key=>/^([1-9]|1[0-8])$/.test(key)))) return true;
    return Object.keys(store.event.finalScores?.["day"+day]||{}).length>0;
  }
  function openFutureRoundEditor() {
    const editable=eventDays().filter(day=>!eventDayStarted(day));
    if(!editable.length)return alert("Every playing day has started or finished. Completed scoring cannot be changed.");
    const ids=Object.keys(competitionNames).filter(id=>id!=="eclectic"||eclecticCourseGroups(store.event).length>0);
    $("#modalContent").innerHTML=`<h2>Modify Future Rounds</h2><p>Only unstarted days can change. Completed and started rounds remain locked.</p><div class="futureRoundEditor">${eventDays().map(day=>{const locked=!editable.includes(day);return `<section class="${locked?"locked":""}"><h3>Day ${day} ${locked?"— Locked":""}</h3><label>Score entry method<select data-futuremethod="${day}" ${locked?"disabled":""}>${Object.entries(SCORING_METHODS).map(([value,label])=>`<option value="${value}" ${dayScoringMethod(day)===value?"selected":""}>${label}</option>`).join("")}</select></label><div class="futureCompetitions">${ids.map(id=>`<label><input type="checkbox" data-futurecomp="${day}|${id}" ${competitionIsOn(id,day)?"checked":""} ${locked?"disabled":""}> ${esc(competitionNames[id]||id)}</label>`).join("")}</div></section>`}).join("")}</div><button class="primary" id="saveFutureRounds">Publish Future-Round Update</button><button class="soft" id="cancelFutureRounds">Cancel</button>`;
    $("#cancelFutureRounds").onclick=()=>openEventOptions();
    $("#saveFutureRounds").onclick=async()=>{
      const nextMethods={...(store.event.scoringMethods||{})}, nextDays=JSON.parse(JSON.stringify(store.event.competitionDays||{}));
      editable.forEach(day=>{nextMethods["day"+day]=$(`[data-futuremethod="${day}"]`).value;ids.forEach(id=>{const all=new Set(competitionDays(id));$(`[data-futurecomp="${day}|${id}"]`).checked?all.add(day):all.delete(day);nextDays[id]=[...all].sort((a,b)=>a-b);});});
      for(const day of editable){const active=(store.event.competitions||[]).filter(id=>(nextDays[id]||competitionDays(id)).includes(day));if(!active.length)return alert(`Day ${day} needs at least one competition.`);const conflicts=active.filter(id=>!finalScoreCompetitionAllowed(id,nextMethods["day"+day]));if(conflicts.length)return alert(`Day ${day} cannot use ${conflicts.map(id=>competitionNames[id]||id).join(", ")} with ${SCORING_METHODS[nextMethods["day"+day]]}.`);}
      store.event.scoringMethods=nextMethods;store.event.competitionDays=nextDays;store.event.competitions=ids.filter(id=>(nextDays[id]||[]).length||((store.event.competitions||[]).includes(id)&&eventDays().some(day=>!editable.includes(day)&&competitionIsOn(id,day))));store.event.futureRoundRevision=(+store.event.futureRoundRevision||0)+1;store.event.finalUpdateAt=new Date().toISOString();save();
      if(store.cloud?.role==="organiser"&&store.cloud.eventId)await updateCloudEvent();
      alert("Future-round update published. Player phones will receive the revised competitions and scoring method.");$("#modalShade").classList.remove("open");renderHome();
    };
  }
  async function prepareDeviceForPlayerUse() {
    if (!confirm("Prepare THIS device for player use?\n\nAll organiser events saved on this device will be removed. Players and courses will remain. Supabase, the organiser PC and every other device will be unchanged.")) return;
    if (!confirm("Final check: remove this device's organiser-event list now?")) return;
    try {
      localStorage.setItem(
        PRE_DEVICE_CLEAR_BACKUP_KEY,
        JSON.stringify(organiserBackupPayload()),
      );
      closeCloudConnection();
      await releaseRoundWakeLock();
      workspaceShrinkAuthorised = true;
      store.eventWorkspace = [];
      store.activeEventId = null;
      store.event = null;
      delete store.cloud;
      store.cloudPlayers = [];
      forgetOrganiserEvent();
      localStorage.removeItem(RECENT_PUBLISHED_KEY);
      localStorage.removeItem("awayGolfTestBackupV1");
      localStorage.removeItem("awayGolfRidgeTestBackupV1");
      writeLocalStore();
      $("#modalShade").classList.remove("open");
      applyDeviceRole();
      renderHome();
      renderPlayerExperience();
      renderLeaderboard();
      nav("home");
      updateDeviceClearRecoveryButton();
      alert("This device is ready for player use. Its organiser events were cleared locally; Supabase and all other devices were unchanged. Enter the new event code when it is supplied.");
    } catch (error) {
      alert("This device was not cleared. " + (error.message || error));
    }
  }
  function updateDeviceClearRecoveryButton() {
    const button = $("#restoreClearedOrganiserEvents");
    if (button)
      button.hidden = !localStorage.getItem(PRE_DEVICE_CLEAR_BACKUP_KEY);
  }
  async function restoreClearedOrganiserEvents() {
    let safety = null;
    try {
      safety = JSON.parse(
        localStorage.getItem(PRE_DEVICE_CLEAR_BACKUP_KEY) || "null",
      );
    } catch (_) {}
    if (!safety) return updateDeviceClearRecoveryButton();
    if (!confirm("Restore the organiser events that were cleared from this device?\n\nThis restores only the local backup and does not publish anything.")) return;
    try {
      await applyOrganiserBackup(safety, false);
      localStorage.removeItem(PRE_DEVICE_CLEAR_BACKUP_KEY);
      updateDeviceClearRecoveryButton();
      alert("The organiser events on this device have been restored.");
    } catch (error) {
      alert("The organiser events could not be restored. " + (error.message || error));
    }
  }
  async function clearPreviousTestEvents() {
    if (
      !confirm(
        "Clear ALL previous test events?\n\nThis will archive every published event from this organiser, disconnect the current test on phones and tablets and remove local event scores. Players, courses and scorecards will remain.",
      )
    )
      return;
    if (!confirm("Final check: clear all previous test events now?")) return;
    const button = $("#clearPreviousTests");
    if (button) button.disabled = true;
    try {
      const archived = await AwayCloud.archiveAllOwnedEvents();
      try {
        await AwayCloud.saveWorkspace({ activePublishedEvent: null });
      } catch (_) {}
      closeCloudConnection();
      workspaceShrinkAuthorised = true;
      store.event = null;
      delete store.cloud;
      store.cloudPlayers = [];
      forgetOrganiserEvent();
      localStorage.removeItem("awayGolfTestBackupV1");
      localStorage.removeItem("awayGolfRidgeTestBackupV1");
      writeLocalStore();
      $("#modalShade").classList.remove("open");
      applyDeviceRole();
      renderHome();
      renderPlayerExperience();
      renderLeaderboard();
      nav("home");
      alert(
        `${archived.length} published test event${archived.length === 1 ? " was" : "s were"} cleared. Away Golf is ready to create the field-test event.`,
      );
    } catch (error) {
      if (button) button.disabled = false;
      alert(
        "The test events were not cleared because the cloud cleanup did not complete. " +
          (error.message || error),
      );
    }
  }
  async function cancelCurrentEvent() {
    if (
      !confirm(
        `Cancel ${store.event?.name || "this event"}?\n\nPlayers will no longer be able to join or score. The event will remain on this device as a cancelled record.`,
      )
    )
      return;
    const previous = store.event.status;
    store.event.status = "cancelled";
    store.event.cancelledAt = new Date().toISOString();
    if (store.cloud?.role === "organiser" && store.cloud.eventId) {
      try {
        await AwayCloud.updateEvent(
          store.cloud.eventId,
          cloudPayload(),
          "archived",
        );
      } catch (error) {
        store.event.status = previous;
        delete store.event.cancelledAt;
        return alert(
          "The event was not cancelled because the player connection could not be closed. " +
            (error.message || error),
        );
      }
      try { await AwayCloud.saveWorkspace({ activePublishedEvent: null }); } catch (_) {}
    }
    closeCloudConnection();
    writeLocalStore();
    $("#modalShade").classList.remove("open");
    renderHome();
    renderPlayerExperience();
    alert(
      "Event cancelled. It remains available as a record until you choose to delete it.",
    );
  }
  async function deleteCurrentEvent() {
    if (
      !confirm(
        `Permanently delete ${store.event?.name || "this event"} from this device?\n\nPlayers and courses will remain. This event setup and its locally stored scores will be removed.`,
      )
    )
      return;
    if (!confirm("Final check: delete this event now?")) return;
    if (store.cloud?.role === "organiser" && store.cloud.eventId) {
      try {
        await AwayCloud.updateEvent(
          store.cloud.eventId,
          cloudPayload(),
          "archived",
        );
      } catch (error) {
        return alert(
          "The event was not deleted because its player connection could not be closed. " +
            (error.message || error),
        );
      }
      try { await AwayCloud.saveWorkspace({ activePublishedEvent: null }); } catch (_) {}
    }
    closeCloudConnection();
    const deletedWorkspaceId = String(store.event?.workspaceId || store.activeEventId || "");
    workspaceShrinkAuthorised = true;
    store.eventWorkspace = (store.eventWorkspace || []).filter(
      (item) => String(item.id) !== deletedWorkspaceId,
    );
    const nextWorkspaceEvent = [...store.eventWorkspace].sort((a, b) =>
      eventWorkspaceDate(b).localeCompare(eventWorkspaceDate(a)),
    )[0];
    store.event = nextWorkspaceEvent?.event
      ? JSON.parse(JSON.stringify(nextWorkspaceEvent.event))
      : null;
    store.activeEventId = nextWorkspaceEvent?.id || null;
    delete store.cloud;
    store.cloudPlayers = [];
    forgetOrganiserEvent();
    writeLocalStore();
    $("#modalShade").classList.remove("open");
    renderHome();
    renderPlayerExperience();
    renderLeaderboard();
    nav("home");
    alert(nextWorkspaceEvent ? "Event deleted. Your next event is now current." : "Event deleted. Away Golf is ready for a new event.");
  }
  $("#eventOptions").onclick = openEventOptions;
  $("#myEvents").onclick = openMyEvents;
  $("#publishedEvents").onclick = openPublishedEvents;
  $("#pastEvents").onclick = openPastEvents;
  $("#organiserBackup").onclick = openOrganiserBackup;
  $("#ownerAccount").onclick = openOwnerAccount;
  $("#guestOrganiserAccess").onclick = openGuestOrganiserAccess;

  const OATLANDS_TEST_IDS = [
    "p42",
    "p11",
    "p27",
    "p6",
    "p2",
    "p17",
    "p49",
    "p1",
  ];
  const OATLANDS_SIXTEEN_IDS = [
    ...OATLANDS_TEST_IDS,
    "p3",
    "p4",
    "p5",
    "p7",
    "p8",
    "p9",
    "p12",
    "p13",
  ];
  const OATLANDS_TEST_GROSS = {
    day1: {
      p42: [6, 4, 5, 7, 4, 7, 4, 6, 7, 5, 6, 6, 4, 7, 6, 6, 6, 5],
      p11: [5, 5, 6, 7, 5, 5, 4, 7, 6, 5, 4, 4, 3, 6, 5, 6, 5, 6],
      p27: [6, 4, 6, 5, 5, 5, 3, 5, 7, 4, 6, 5, 4, 8, 4, 7, 7, 5],
      p6: [5, 4, 4, 5, 4, 5, 4, 5, 6, 6, 5, 7, 3, 8, 5, 5, 6, 6],
      p2: [6, 3, 5, 7, 6, 6, 3, 7, 8, 5, 5, 6, 4, 8, 6, 7, 5, 6],
      p17: [7, 4, 6, 6, 3, 7, 3, 5, 6, 4, 5, 5, 3, 8, 5, 6, 4, 6],
      p49: [4, 3, 5, 4, 4, 4, 3, 4, 6, 6, 4, 6, 3, 5, 4, 6, 5, 5],
      p1: [4, 3, 6, 6, 4, 4, 3, 4, 7, 3, 4, 5, 4, 4, 6, 5, 4, 4],
    },
    day2: {
      p42: [6, 5, 7, 6, 6, 6, 4, 5, 6, 4, 5, 7, 5, 6, 7, 6, 6, 6],
      p11: [5, 4, 6, 5, 4, 5, 4, 7, 5, 6, 5, 5, 4, 8, 6, 6, 7, 6],
      p27: [4, 4, 5, 4, 4, 6, 3, 4, 8, 4, 5, 6, 5, 5, 7, 6, 6, 7],
      p6: [7, 5, 5, 5, 5, 5, 4, 6, 6, 4, 5, 5, 4, 7, 7, 6, 5, 7],
      p2: [6, 4, 6, 5, 5, 6, 3, 5, 4, 3, 5, 6, 7, 6, 5, 6, 3, 5],
      p17: [4, 3, 6, 6, 4, 4, 3, 4, 7, 3, 4, 5, 4, 4, 6, 5, 4, 4],
      p49: [5, 4, 5, 4, 5, 6, 3, 4, 7, 4, 5, 6, 4, 6, 6, 5, 6, 6],
      p1: [6, 4, 5, 6, 4, 5, 4, 6, 7, 4, 6, 5, 4, 7, 5, 7, 6, 5],
    },
  };
  const OATLANDS_TEST_HCP = {
    day1: {
      p42: 28,
      p11: 19,
      p27: 26,
      p6: 17,
      p2: 22,
      p17: 17,
      p49: 5,
      p1: 10,
    },
    day2: {
      p42: 28,
      p11: 18,
      p27: 21,
      p6: 16,
      p2: 14,
      p17: 10,
      p49: 17,
      p1: 22,
    },
  };
  Object.assign(OATLANDS_TEST_HCP.day1, {
    p3: 15,
    p4: 12,
    p5: 23,
    p7: 18,
    p8: 20,
    p9: 11,
    p12: 16,
    p13: 25,
  });
  Object.assign(OATLANDS_TEST_HCP.day2, {
    p3: 15,
    p4: 12,
    p5: 23,
    p7: 18,
    p8: 20,
    p9: 11,
    p12: 16,
    p13: 25,
  });
  const OATLANDS_EXTRA_BASE = {
    p3: "p1",
    p4: "p49",
    p5: "p42",
    p7: "p11",
    p8: "p27",
    p9: "p6",
    p12: "p2",
    p13: "p17",
  };
  function testGross(day, id) {
    const key = "day" + day;
    if (OATLANDS_TEST_GROSS[key][id]) return OATLANDS_TEST_GROSS[key][id];
    const base = OATLANDS_TEST_GROSS[key][OATLANDS_EXTRA_BASE[id]],
      seed = OATLANDS_SIXTEEN_IDS.indexOf(id);
    return base.map((g, i) =>
      Math.max(
        2,
        g + ((i + seed * 2) % 7 === 0 ? 1 : (i + seed) % 11 === 0 ? -1 : 0),
      ),
    );
  }
  function testCourse() {
    return (
      store.courses.find((c) => c.id === "test-oatlands-full-rounds") ||
      store.courses.find((c) => /oatlands/i.test(c.name)) ||
      store.courses[0]
    );
  }
  function installTestCourse() {
    if (store.courses.some((c) => c.id === "test-oatlands-full-rounds")) return;
    const source = testCourse(),
      base = JSON.parse(JSON.stringify(source)),
      v = version(base) || {};
    base.id = "test-oatlands-full-rounds";
    base.name = "Oatlands GC — Test Card";
    base.available = true;
    base.versions = [
      {
        ...v,
        id: "test-oatlands-full-rounds-v1",
        par: [4, 3, 4, 4, 3, 4, 3, 4, 5, 3, 4, 4, 3, 5, 4, 5, 4, 4],
      },
    ];
    base.activeVersionId = "test-oatlands-full-rounds-v1";
    store.courses.push(base);
  }
  function testPutts(gross, par, points, hole, seed) {
    if (points >= 3 || gross <= par) return 1;
    if (points === 0 || gross >= par + 3) return 3;
    return gross >= par + 2 && (hole + seed) % 4 === 0 ? 3 : 2;
  }
  function makeTestDayScoring(day, groups) {
    const key = "day" + day,
      c = testCourse(),
      v = version(c) || {},
      scores = {},
      hcp = OATLANDS_TEST_HCP[key],
      ids = groups.flat().filter((id) => id !== NO_PARTNER_ID);
    ids.forEach((id) => (scores[id] = {}));
    const partner = {};
    groups.forEach((g) => {
      for (let i = 0; i < g.length; i += 2) {
        partner[g[i]] = g[i + 1];
        partner[g[i + 1]] = g[i];
      }
    });
    ids.forEach((id, seed) => {
      const gross = testGross(day, id);
      for (let h = 1; h <= 18; h++) {
        const g = gross[h - 1],
          par = +(
            v.par?.[h - 1] ||
            [4, 3, 4, 4, 3, 4, 3, 4, 5, 3, 4, 4, 3, 5, 4, 5, 4, 4][h - 1]
          ),
          pts = stablefordPoints(g, par, v.index?.[h - 1] ?? "", hcp[id]),
          putts = testPutts(g, par, pts, h, seed);
        scores[id][h] = {
          self: { playerId: id, gross: g, putts },
          official: {
            playerId: partner[id],
            gross: testGross(day, partner[id])[h - 1],
            putts: 0,
          },
          ntp: {},
        };
      }
      scores[id]._meta = {
        finalisedAt: `2026-08-${day === 1 ? "08" : "09"}T08:00:00.000Z`,
      };
    });
    // The marker's official putts must match the marked player's self putts.
    ids.forEach((id) => {
      for (let h = 1; h <= 18; h++)
        scores[id][h].official.putts = scores[partner[id]][h].self.putts;
    });
    const ntps =
      day === 1 && store.event?.ntpJackpot
        ? []
        : day === 1
        ? [
            {
              hole: 2,
              winner: "p42",
              scorer: "p11",
              at: "2026-08-08T09:24:00+10:00",
            },
            {
              hole: 2,
              winner: "p27",
              scorer: "p6",
              at: "2026-08-08T10:15:00+10:00",
            },
            {
              hole: 2,
              winner: "p2",
              scorer: "p17",
              at: "2026-08-08T11:02:00+10:00",
            },
          ]
        : [
            {
              hole: 5,
              winner: "p42",
              scorer: "p27",
              at: "2026-08-09T09:18:00+10:00",
            },
            {
              hole: 5,
              winner: "p27",
              scorer: "p2",
              at: "2026-08-09T10:41:00+10:00",
            },
            {
              hole: 10,
              winner: "p6",
              scorer: "p17",
              at: "2026-08-09T09:46:00+10:00",
            },
            {
              hole: 10,
              winner: "p11",
              scorer: "p1",
              at: "2026-08-09T11:07:00+10:00",
            },
          ];
    ntps.forEach((n) => {
      scores[n.scorer][n.hole].ntp = {
        entrantId: n.winner,
        confirmedAt: n.at,
        locked: true,
      };
    });
    return scores;
  }
  function buildOatlandsTestEvent() {
    const c = testCourse(),
      d1 = [
        ["p42", "p11", "p27", "p6"],
        ["p2", "p17", "p49", "p1"],
      ],
      d2 = [
        ["p42", "p27", "p2", "p49"],
        ["p11", "p6", "p17", "p1"],
      ];
    return {
      name: "TEST — Oatlands Two-Day Championship",
      date: "2026-08-08",
      days: 2,
      testMode: true,
      status: "locked",
      locked: true,
      lockedAt: new Date().toISOString(),
      startMethod: "single",
      startMethods: { day1: "single", day2: "single" },
      startHoles: { day1: [1], day2: [13] },
      course1: c.id,
      course2: c.id,
      fieldSize: 8,
      confirmed: [...OATLANDS_TEST_IDS],
      dayFields: { day1: [...OATLANDS_TEST_IDS], day2: [...OATLANDS_TEST_IDS] },
      dayAvailability: Object.fromEntries(
        OATLANDS_TEST_IDS.map((id) => [id, { 1: true, 2: true }]),
      ),
      competitions: [
        "combined",
        "fourball",
        "teamPutts",
        "best3of4",
        "par3",
        "ntp",
        "scratch",
        "eclectic",
      ],
      singleStablefordFormat: "aggregate",
      puttingFormat: "team",
      par3Format: "aggregate",
      ntpDay2Count: 2,
      ntpJackpot: true,
      ntpSelections: { day1: [2], day2: [5, 10] },
      benefits: {
        combined: { balls: 3, plus: true },
        fourball: { balls: 3 },
        teamPutts: { balls: 2 },
        best3of4: { mode: "lottery", contribution: 10 },
        par3: { balls: 2 },
        ntp: { balls: 4 },
        scratch: { balls: 3 },
        eclectic: { balls: 3 },
      },
      specialRules:
        "TEST EVENT — scores are based on genuine Oatlands rounds. Missing historical scores and putts have been completed with realistic test values.",
      dailyHandicaps: JSON.parse(JSON.stringify(OATLANDS_TEST_HCP)),
      groupSetup: {
        day1: { groups: d1, starts: [1, 1], saved: true },
        day2: { groups: d2, starts: [13, 13], saved: true },
      },
      roundFinalised: { day1: {}, day2: {} },
      scoring: { day1: {}, day2: {} },
      liveControlDay: 1,
      leaderboardView: "summary",
    };
  }
  function buildOatlandsOneDayTestEvent() {
    const e = buildOatlandsTestEvent();
    e.name = "TEST — Oatlands One-Day Championship";
    e.days = 1;
    e.testKind = "oneDay";
    e.competitions = [
      "single",
      "fourball",
      "teamPutts",
      "best3of4",
      "par3",
      "ntp",
      "scratch",
    ];
    e.benefits = {
      single: { balls: 3, plus: true },
      fourball: { balls: 3 },
      teamPutts: { balls: 2 },
      best3of4: { mode: "lottery", contribution: 10 },
      par3: { balls: 2 },
      ntp: { balls: 2 },
      scratch: { balls: 3 },
    };
    e.par3Format = "daily";
    e.ntpSelections = { day1: [2] };
    e.groupSetup = { day1: e.groupSetup.day1 };
    e.dayFields = { day1: [...OATLANDS_TEST_IDS] };
    e.scoring = { day1: {} };
    e.roundFinalised = { day1: {} };
    e.liveControlDay = 1;
    e.leaderboardView = "summary";
    delete e.course2;
    delete e.singleStablefordFormat;
    return e;
  }
  function buildOatlandsSixteenPlayerTestEvent() {
    const e = buildOatlandsOneDayTestEvent(),
      ids = [...OATLANDS_SIXTEEN_IDS],
      groups = [
        ids.slice(0, 4),
        ids.slice(4, 8),
        ids.slice(8, 12),
        ids.slice(12, 16),
      ];
    e.name = "TEST — Oatlands 16-Player Dress Rehearsal";
    e.testKind = "sixteen";
    e.fieldSize = 16;
    e.confirmed = ids;
    e.dayFields = { day1: ids };
    e.dayAvailability = Object.fromEntries(ids.map((id) => [id, { 1: true }]));
    e.dailyHandicaps = {
      day1: Object.fromEntries(
        ids.map((id) => [id, OATLANDS_TEST_HCP.day1[id]]),
      ),
    };
    e.groupSetup = { day1: { groups, starts: [1, 1, 1, 1], saved: true } };
    e.specialRules =
      "PROTECTED 16-PLAYER DRESS REHEARSAL — four groups, eight 4BBB pairs and every one-day competition. Test data is local and cannot be published.";
    return e;
  }
  function loadTestStage(stage) {
    const e = store.event;
    if (!e?.testMode) return;
    e.scoring = { day1: {}, day2: {} };
    e.roundFinalised = { day1: {}, day2: {} };
    e.prizesAwarded = {};
    const ids = e.dayFields?.day1 || e.confirmed || [];
    if (stage >= 1) {
      e.scoring.day1 = makeTestDayScoring(1, e.groupSetup.day1.groups);
      ids.forEach(
        (id) =>
          (e.roundFinalised.day1[id] = e.scoring.day1[id]._meta.finalisedAt),
      );
    }
    if (stage >= 2 && e.days === 2) {
      e.scoring.day2 = makeTestDayScoring(2, e.groupSetup.day2.groups);
      (e.dayFields?.day2 || ids).forEach(
        (id) =>
          (e.roundFinalised.day2[id] = e.scoring.day2[id]._meta.finalisedAt),
      );
    }
    store.cloudPlayers =
      e.testKind === "sixteen"
        ? ids.map((id, i) => ({
            playerId: id,
            name: player(id)?.name || id,
            joined: true,
            joinedAt: `2026-08-08T${String(7 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 7).padStart(2, "0")}:00.000Z`,
          }))
        : [];
    e.liveControlDay = stage >= 2 && e.days === 2 ? 2 : 1;
    e.leaderboardView = "summary";
    writeLocalStore();
    $("#modalShade").classList.remove("open");
    renderHome();
    nav("home");
  }
  function beginOatlandsTest(kind = "twoDay") {
    const label =
      kind === "sixteen"
        ? "16-player one-day dress rehearsal"
        : `eight-player ${kind === "oneDay" ? "one-day" : "two-day"} Oatlands test`;
    if (
      !confirm(
        `Load the protected ${label}? Your current event and cloud connection will be saved for restoration.`,
      )
    )
      return;
    if (!localStorage.getItem("awayGolfTestBackupV1"))
      localStorage.setItem(
        "awayGolfTestBackupV1",
        JSON.stringify({
          event: store.event || null,
          cloud: store.cloud || null,
          cloudPlayers: store.cloudPlayers || [],
          courses: store.courses,
        }),
      );
    closeCloudConnection();
    delete store.cloud;
    store.cloudPlayers = [];
    installTestCourse();
    store.event =
      kind === "sixteen"
        ? buildOatlandsSixteenPlayerTestEvent()
        : kind === "oneDay"
          ? buildOatlandsOneDayTestEvent()
          : buildOatlandsTestEvent();
    loadTestStage(1);
  }
  function switchOatlandsTest(kind) {
    const label =
      kind === "sixteen"
        ? "16-player one-day dress rehearsal"
        : `eight-player ${kind === "oneDay" ? "one-day" : "two-day"} test`;
    if (
      !confirm(
        `Switch to the protected ${label}? Current test scores and awarded test prizes will be replaced.`,
      )
    )
      return;
    installTestCourse();
    store.event =
      kind === "sixteen"
        ? buildOatlandsSixteenPlayerTestEvent()
        : kind === "oneDay"
          ? buildOatlandsOneDayTestEvent()
          : buildOatlandsTestEvent();
    loadTestStage(1);
  }
  function restoreBeforeTest() {
    let backup;
    try {
      backup = JSON.parse(
        localStorage.getItem("awayGolfTestBackupV1") || "null",
      );
    } catch (_) {
      backup = null;
    }
    if (!backup) return alert("No saved event was found.");
    if (!confirm("Restore the event that was open before the Oatlands test?"))
      return;
    store.event = backup.event;
    store.cloud = backup.cloud;
    store.cloudPlayers = backup.cloudPlayers || [];
    if (backup.courses) store.courses = backup.courses;
    else
      store.courses = store.courses.filter(
        (c) => c.id !== "test-oatlands-full-rounds",
      );
    localStorage.removeItem("awayGolfTestBackupV1");
    writeLocalStore();
    $("#modalShade").classList.remove("open");
    renderHome();
    renderCoursesAdmin();
    if (store.cloud?.eventId) {
      watchCloudEvent();
      syncCloudNow();
    }
    nav("home");
  }
  const RIDGE_TEST_TOTALS = {
    "sam reece": 40,
    "jeremy ward": 38,
    "grant lomas": 37,
    "christian fong": 36,
    "jerry maher": 36,
    "peter rolfe": 35,
    "rob blain": 35,
    "ross smith": 34,
    "ralph cadman": 34,
    "david fairweather": 34,
    "graeme hennessy": 33,
    "ben mees": 32,
    "ian priest": 31,
    "bob valk": 30,
    "luke bradshaw": 27,
    "rod ruston": 25,
  };
  const RIDGE_TEST_PUTTS = {
    "sam reece": 28,
    "jeremy ward": 31,
    "grant lomas": 30,
    "christian fong": 30,
    "jerry maher": 30,
    "peter rolfe": 32,
    "rob blain": 32,
    "ross smith": 32,
    "ralph cadman": 33,
    "david fairweather": 34,
    "graeme hennessy": 33,
    "ben mees": 31,
    "ian priest": 31,
    "bob valk": 35,
    "luke bradshaw": 35,
    "rod ruston": 37,
  };
  function ridgeTestEligible() {
    const e = store.event,
      c = course(e?.course1),
      ids = dayFieldIds(1).filter((id) => String(id) !== NO_PARTNER_ID);
    return Boolean(
      e?.locked &&
        e?.days === 1 &&
        ids.length === 16 &&
        /ridge/i.test(c?.name || ""),
    );
  }
  function ridgePointPattern(name, target, seed) {
    if (name.toLowerCase() === "rod ruston")
      return [1, 0, 2, 1, 2, 1, 2, 3, 2, 1, 2, 1, 0, 2, 2, 0, 2, 1];
    const out = Array(18).fill(2),
      order = Array.from(
        { length: 18 },
        (_, i) => (i * 7 + seed * 5) % 18,
      ).filter((x, i, a) => a.indexOf(x) === i);
    let delta = target - 36,
      n = 0;
    while (delta > 0) {
      const i = order[n++ % order.length];
      if (out[i] < 4) {
        out[i]++;
        delta--;
      }
    }
    while (delta < 0) {
      const i = order[n++ % order.length];
      if (out[i] > 0) {
        out[i]--;
        delta++;
      }
    }
    return out;
  }
  function ridgePuttPattern(name, target, points, seed) {
    const out = Array(18).fill(2),
      good = Array.from({ length: 18 }, (_, i) => i).sort(
        (a, b) =>
          points[b] - points[a] || ((a + seed) % 18) - ((b + seed) % 18),
      ),
      bad = [...good].reverse();
    let delta = target - 36,
      n = 0;
    while (delta < 0) {
      const i = good[n++ % 18];
      if (out[i] > 1) {
        out[i]--;
        delta++;
      }
    }
    n = 0;
    while (delta > 0) {
      const i = bad[n++ % 18];
      if (out[i] < 3) {
        out[i]++;
        delta--;
      }
    }
    return out;
  }
  function makeRidgeTestScoring() {
    const e = store.event,
      groups = e.groupSetup?.day1?.groups || [],
      ids = groups
        .flat()
        .map(String)
        .filter((id) => id !== NO_PARTNER_ID),
      c = course(e.course1),
      v = version(c) || {},
      scores = {},
      partner = {};
    groups.forEach((raw) => {
      const g = raw.map(String);
      for (let i = 0; i < g.length; i += 2) {
        if (g[i] && g[i + 1]) {
          partner[g[i]] = g[i + 1];
          partner[g[i + 1]] = g[i];
        }
      }
    });
    ids.forEach((id, seed) => {
      const name = (player(id)?.name || "").trim(),
        key = name.toLowerCase(),
        target = RIDGE_TEST_TOTALS[key] ?? 30 + ((seed * 7) % 9),
        points = ridgePointPattern(name, target, seed),
        putts = ridgePuttPattern(
          name,
          RIDGE_TEST_PUTTS[key] ?? 30 + ((seed * 5) % 7),
          points,
          seed,
        ),
        hcp = playerDailyHandicap(id, 1);
      scores[id] = {};
      for (let h = 1; h <= 18; h++) {
        const par = +(v.par?.[h - 1] || 4),
          index = v.index?.[h - 1] ?? "",
          stroke = stablefordStrokeCount(index, hcp),
          gross = Math.max(1, par + stroke + 2 - points[h - 1]);
        scores[id][h] = {
          self: { playerId: id, gross, putts: putts[h - 1] },
          official: { playerId: partner[id] || "", gross: "", putts: "" },
          ntp: {},
        };
      }
      scores[id]._meta = {
        finalisedAt: `2026-08-22T${String(8 + Math.floor(seed / 4)).padStart(2, "0")}:${String((seed % 4) * 7).padStart(2, "0")}:00+10:00`,
      };
    });
    ids.forEach((id) => {
      const marked = partner[id];
      for (let h = 1; h <= 18; h++) {
        scores[id][h].official.gross = scores[marked][h].self.gross;
        scores[id][h].official.putts = scores[marked][h].self.putts;
      }
    });
    const hole = +(e.ntpSelections?.day1?.[0] || 0),
      findId = (name) =>
        ids.find(
          (id) => (player(id)?.name || "").toLowerCase() === name.toLowerCase(),
        );
    if (hole) {
      const changes = [
        ["Rob Blain", "Jeremy Ward", "2026-08-22T09:24:00+10:00"],
        ["Jerry Maher", "Sam Reece", "2026-08-22T10:15:00+10:00"],
        ["Peter Rolfe", "Grant Lomas", "2026-08-22T11:02:00+10:00"],
      ];
      changes.forEach(([entrant, scorer, at], i) => {
        const entrantId =
            findId(entrant) || ids[Math.min(i * 5, ids.length - 1)],
          scorerId = findId(scorer) || ids[Math.min(i * 5 + 1, ids.length - 1)];
        scores[scorerId][hole].ntp = {
          entrantId,
          confirmedAt: at,
          locked: true,
        };
      });
    }
    return scores;
  }
  function loadRidgeEventTest() {
    if (!ridgeTestEligible())
      return alert(
        "The Ridge test requires a locked one-day event with exactly 16 players.",
      );
    if (
      !confirm(
        "Play and finalise all 16 Ridge test rounds now?\n\nYour complete locked event will be backed up. Test scores will remain local and can be removed afterwards.",
      )
    )
      return;
    if (!localStorage.getItem("awayGolfRidgeTestBackupV1"))
      localStorage.setItem(
        "awayGolfRidgeTestBackupV1",
        JSON.stringify({
          event: store.event,
          cloud: store.cloud || null,
          cloudPlayers: store.cloudPlayers || [],
        }),
      );
    closeCloudConnection();
    delete store.cloud;
    const e = store.event,
      ids = dayFieldIds(1)
        .filter((id) => String(id) !== NO_PARTNER_ID)
        .map(String),
      scores = makeRidgeTestScoring();
    e.scoring = { ...(e.scoring || {}), day1: scores };
    e.roundFinalised = { ...(e.roundFinalised || {}), day1: {} };
    ids.forEach(
      (id) => (e.roundFinalised.day1[id] = scores[id]._meta.finalisedAt),
    );
    e.prizesAwarded = {};
    e.ridgeTestMode = true;
    e.liveControlDay = 1;
    e.leaderboardView = "summary";
    store.cloudPlayers = ids.map((id, i) => ({
      playerId: id,
      name: player(id)?.name || id,
      joined: true,
      joinedAt: `2026-08-22T${String(7 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 6).padStart(2, "0")}:00+10:00`,
    }));
    writeLocalStore();
    $("#modalShade").classList.remove("open");
    renderHome();
    renderLeaderboard();
    nav("home");
  }
  function restoreRidgeEventAfterTest() {
    let backup;
    try {
      backup = JSON.parse(
        localStorage.getItem("awayGolfRidgeTestBackupV1") || "null",
      );
    } catch (_) {
      backup = null;
    }
    if (!backup) return alert("No Ridge event backup was found.");
    if (
      !confirm(
        "Remove every test score and restore the locked Ridge event exactly as it was before the test?",
      )
    )
      return;
    closeCloudConnection();
    store.event = backup.event;
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
    }
    store.cloud = backup.cloud || undefined;
    store.cloudPlayers = backup.cloudPlayers || [];
    localStorage.removeItem("awayGolfRidgeTestBackupV1");
    writeLocalStore();
    $("#modalShade").classList.remove("open");
    renderHome();
    renderLeaderboard();
    renderPlayerExperience();
    if (store.cloud?.eventId) {
      watchCloudEvent();
      syncCloudNow();
    }
    nav("home");
  }
  function openTestEventTools() {
    const ridgeActive = Boolean(store.event?.ridgeTestMode),
      ridgeReady = ridgeTestEligible(),
      ridgeBackup = Boolean(localStorage.getItem("awayGolfRidgeTestBackupV1")),
      active = Boolean(store.event?.testMode),
      oneDay = active && store.event.days === 1,
      sixteen = store.event?.testKind === "sixteen",
      backup = Boolean(localStorage.getItem("awayGolfTestBackupV1"));
    if (ridgeActive || ridgeReady || ridgeBackup) {
      $("#modalContent").innerHTML =
        `<h2>The Ridge — 16-Player Test</h2><p>Complete all 288 holes locally using the locked players, groups, handicaps and competitions. The original locked event is backed up before any scores are added.</p>${ridgeActive ? '<div class="testStageButtons"><button class="primary" id="openRidgeResults">Open Results Summary</button><button class="danger" id="restoreRidgeEvent">Remove Test Scores & Restore Event</button></div>' : '<div class="testStageButtons"><button class="primary" id="loadRidgeTest">Play All 16 Rounds</button></div>'}<button class="soft closeTestTools" id="closeTestTools">Close</button>`;
      $("#modalShade").classList.add("open");
      if ($("#loadRidgeTest")) $("#loadRidgeTest").onclick = loadRidgeEventTest;
      if ($("#restoreRidgeEvent"))
        $("#restoreRidgeEvent").onclick = restoreRidgeEventAfterTest;
      if ($("#openRidgeResults"))
        $("#openRidgeResults").onclick = () => {
          $("#modalShade").classList.remove("open");
          store.event.leaderboardView = "summary";
          nav("leaderboardPage");
        };
      $("#closeTestTools").onclick = () =>
        $("#modalShade").classList.remove("open");
      return;
    }
    $("#modalContent").innerHTML =
      `<h2>Oatlands Test Events</h2><p>Test complete events safely with genuine Oatlands scoring patterns. Test data remains local and cannot be published.</p>${active ? `<h3>${sixteen ? "One-Day 16-Player Dress Rehearsal" : `${oneDay ? "One-Day" : "Two-Day"} Eight-Player Test`}</h3><div class="testStageButtons"><button class="soft" id="testClearScores">Start with No Scores</button><button class="primary" id="testDay1Scores">${oneDay ? "Complete Round" : "Complete Day 1"}</button>${oneDay ? "" : `<button class="primary" id="testBothDays">Complete Both Days</button>`}</div><div class="testChoiceButtons"><button class="soft" data-switchtest="oneDay">8 Players · One Day</button><button class="soft" data-switchtest="twoDay">8 Players · Two Days</button><button class="primary" data-switchtest="sixteen">16 Players · One Day</button></div>${backup ? '<button class="danger restoreTestBtn" id="restoreTestEvent">Restore My Previous Event</button>' : ""}` : `<div class="testChoiceButtons"><button class="primary" id="beginOneDayTest">8 Players · One Day</button><button class="primary" id="beginTwoDayTest">8 Players · Two Days</button><button class="primary" id="beginSixteenTest">16 Players · One-Day Dress Rehearsal</button></div>`}<button class="soft closeTestTools" id="closeTestTools">Close</button>`;
    $("#modalShade").classList.add("open");
    if ($("#beginOneDayTest"))
      $("#beginOneDayTest").onclick = () => beginOatlandsTest("oneDay");
    if ($("#beginTwoDayTest"))
      $("#beginTwoDayTest").onclick = () => beginOatlandsTest("twoDay");
    if ($("#beginSixteenTest"))
      $("#beginSixteenTest").onclick = () => beginOatlandsTest("sixteen");
    $$("[data-switchtest]").forEach(
      (b) => (b.onclick = () => switchOatlandsTest(b.dataset.switchtest)),
    );
    if ($("#testClearScores"))
      $("#testClearScores").onclick = () => loadTestStage(0);
    if ($("#testDay1Scores"))
      $("#testDay1Scores").onclick = () => loadTestStage(1);
    if ($("#testBothDays")) $("#testBothDays").onclick = () => loadTestStage(2);
    if ($("#restoreTestEvent"))
      $("#restoreTestEvent").onclick = restoreBeforeTest;
    $("#closeTestTools").onclick = () =>
      $("#modalShade").classList.remove("open");
  }
  document.addEventListener("click", (e) => {
    if (e.target.id === "testEventTools") openTestEventTools();
  });
  function markerTargetFor(pid, day) {
    const ctx = playerGroupContext(pid, day);
    if (!ctx) return null;
    const g = ctx.group.filter((x) => String(x) !== NO_PARTNER_ID),
      me = String(pid),
      pos = g.indexOf(me);
    if (pos < 0) return null;
    // A genuine late withdrawal leaves three golfers. They mark in one closed
    // loop so every visible Player and Marker is a real golfer in that group.
    if (g.length === 3)
      return String(g[(pos + 1) % 3]);
    // Prefer the 4BBB partner because the two golfers naturally mark/verify each other.
    if (competitionIsOn("fourball", day)) {
      const pairStart = ctx.playerIndex < 2 ? 0 : 2;
      const other = ctx.group
        .slice(pairStart, pairStart + 2)
        .map(String)
        .find((x) => x !== me && x !== NO_PARTNER_ID);
      if (other) return other;
    }
    return String(g[(pos + 1) % g.length] || "");
  }
  function ntpHolesFor(day) {
    return competitionIsOn("ntp",day) ? (store.event.ntpSelections?.["day" + day] || []).map(Number) : [];
  }
  function ntpHolesInPlayingOrder(day) {
    const holes = ntpHolesFor(day);
    if (startMethodFor(store.event, day) !== "single") return holes;
    const sequence = scoreSequence(startHolesFor(store.event, day)[0] || 1);
    return holes.sort((a, b) => sequence.indexOf(a) - sequence.indexOf(b));
  }
  function ntpHistory(day, hole) {
    const entries = [];
    Object.entries(scoringDayStore(day)).forEach(([scorerId, holes]) => {
      const n = holes?.[String(hole)]?.ntp;
      if (!n?.confirmedAt) return;
      entries.push({
        id: String(n.entrantId || scorerId),
        scorerId: String(scorerId),
        at: n.confirmedAt,
        t: Date.parse(n.confirmedAt) || 0,
      });
    });
    return entries.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  }
  function currentNtpHolder(day, hole) {
    const manualDay = manualDayStore(day, false),
      manualResult = manualDay?.ntpFinalised
        ? manualDay.ntp?.[String(hole)]
        : null;
    if (manualResult)
      return manualResult === "NONE"
        ? null
        : { id: String(manualResult), manual: true, at: manualDay.completedAt };
    const history = ntpHistory(day, hole);
    return history[history.length - 1] || null;
  }
  function ntpEventSlots() {
    const slots = [];
    for (let day = 1; day <= (store.event?.days || 1); day++)
      ntpHolesInPlayingOrder(day).forEach((hole) => slots.push({ day, hole }));
    return slots;
  }
  function sameNtpSlot(a, b) {
    return Boolean(a && b && a.day === b.day && a.hole === b.hole);
  }
  function ntpBaseBalls() {
    const balls = +(store.event?.benefits?.ntp?.balls || 0);
    return Number.isFinite(balls) ? balls : 0;
  }
  function ntpJackpotState(day, hole) {
    const base = ntpBaseBalls(),
      slots = ntpEventSlots(),
      targetIndex = slots.findIndex(
        (slot) => +slot.day === +day && +slot.hole === +hole,
      ),
      jackpotOn = Boolean(store.event?.ntpJackpot),
      mode = store.event?.ntpJackpotMode === "rolling" ? "rolling" : "final",
      finalIndex = slots.length - 1;
    let carried = 0;
    if (!base || targetIndex < 0 || !jackpotOn)
      return { base, carried: 0, prize: base, resolved: false, mode };
    for (let index = 0; index < targetIndex; index++) {
      const slot = slots[index],
        holder = currentNtpHolder(slot.day, slot.hole),
        resolved = eventDayComplete(slot.day);
      if (holder) {
        if (mode === "rolling") carried = 0;
        continue;
      }
      if (resolved) carried += base;
    }
    if (mode === "final" && targetIndex !== finalIndex) carried = 0;
    return {
      base,
      carried,
      prize: base + carried,
      resolved: eventDayComplete(day),
      mode,
    };
  }
  function ntpPrizeBalls(day, hole) {
    return ntpJackpotState(day, hole).prize;
  }
  function ntpPrizeText(day, hole) {
    const balls = ntpPrizeBalls(day, hole);
    return balls ? `${balls} Ball${balls === 1 ? "" : "s"}` : "";
  }
  function ntpSummaryLine(day, hole, complete) {
    const holder = currentNtpHolder(day, hole),
      state = ntpJackpotState(day, hole),
      prize = ntpPrizeText(day, hole),
      carryText = state.carried
        ? ` (${state.base} + ${state.carried} jackpot)`
        : "";
    if (holder)
      return `Hole ${hole}: ${complete ? "Winner" : "Current holder"} — ${eventPlayer(holder.id, day)?.name || "Player"}${prize ? ` — ${prize}${carryText}` : ""}`;
    if (!complete)
      return `Hole ${hole}: Pending${prize ? ` — ${prize}${carryText} available` : ""}`;
    const slots = ntpEventSlots(),
      slot = { day, hole },
      slotIndex = slots.findIndex((item) => sameNtpSlot(item, slot)),
      nextSlot = slots[slotIndex + 1];
    if (store.event?.ntpJackpot && nextSlot) {
      const destination =
        state.mode === "rolling" ? nextSlot : slots[slots.length - 1];
      return `Hole ${hole}: No Winner — ${prize || "Prize"} carries to Hole ${destination.hole}${store.event.days > 1 ? ` Day ${destination.day}` : ""}`;
    }
    return `Hole ${hole}: No Winner${prize ? ` — ${prize}` : "Prize"} not awarded`;
  }
  function teamsFinalCheckHtml() {
    const event = store.event;
    if (!event) return "";
    const displayDate = (iso) => {
        const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? `${match[3]}/${match[2]}/${match[1]}` : iso || "Not entered";
      },
      teamText = (ids) =>
        ids.length && ids.length % 4 === 0
          ? `${ids.length / 4} team${ids.length === 4 ? "" : "s"} of 4`
          : `${ids.length} playing positions`,
      joinHoles = (holes) => {
        const labels = (holes || []).map((hole) => `Hole ${hole}`);
        return labels.length < 2
          ? labels[0] || "Not selected"
          : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
      },
      confirmed = (event.confirmed || []).filter(
        (id) => String(id) !== NO_PARTNER_ID,
      ),
      invited = Object.entries(event.invitationStatus || {}).filter(
        ([id, status]) =>
          String(id) !== NO_PARTNER_ID &&
          ["accepted", "awaiting"].includes(status),
      ).length,
      cards = Array.from({ length: event.days || 1 }, (_, index) => {
        const day = index + 1,
          item = course(event["course" + day]);
        return item ? { item, tee: selectedEventTee(day, event) } : null;
      }).filter(Boolean),
      cardsChecked =
        Boolean(event.scorecardsChecked) &&
        cards.length > 0 &&
        eventDays(event).every(day=>eventCardChecks(day,event).every(check=>check.ok)),
      firstTeeText = Array.from({ length: event.days || 1 }, (_, index) => {
        const day = index + 1,
          hole = +(startHolesFor(event, day)[0] || 1),
          suffix = [11, 12, 13].includes(hole % 100)
            ? "th"
            : hole % 10 === 1
              ? "st"
              : hole % 10 === 2
                ? "nd"
                : hole % 10 === 3
                  ? "rd"
                  : "th";
        return `${event.days === 1 ? "" : `Day ${day}: `}${hole}${suffix}`;
      }).join(" · "),
      checks = [
        { ok: Boolean(event.name), label: `Event Name: ${event.name}` },
        { ok: Boolean(event.date), label: `Start Date: ${displayDate(event.date)}` },
        ...Array.from({ length: event.days || 1 }, (_, index) => {
          const day = index + 1,
            eventCourse = course(event["course" + day]),
            timeLabel = startMethodFor(event, day) === "shotgun" ? "Shotgun Time" : "First Tee Time";
          return {
            ok: Boolean(eventCourse),
            label: `${event.days === 1 ? "Course" : `Day ${day}`}: ${eventCourse?.name || "Not selected"} · ${timeLabel}: ${startTimesFor(event, day)[0]}`,
          };
        }),
        { ok: Boolean(firstTeeText), label: `First Tee: ${firstTeeText}` },
        {
          ok: cardsChecked,
          label: "Course Scorecard Checked Against Official Card: Confirmed",
        },
        {
          ok: confirmed.length > 0,
          label: `Players Invited: ${invited || confirmed.length} · Confirmed: ${confirmed.length}`,
        },
        ...Array.from({ length: event.days || 1 }, (_, index) => {
          const day = index + 1,
            tees = enabledEventTees(event, day),
            complete = tees.every((tee) => teeHandicapsComplete(day, tee, event));
          return {
            ok: complete,
            label: `${event.days === 1 ? "" : `Day ${day} `}${tees.map((tee) => EVENT_TEE_LABELS[tee]).join(", ")} Tee Handicaps: Complete`,
          };
        }),
        {
          ok: Array.from({ length: event.days || 1 }, (_, index) =>
            dayFieldIds(index + 1).length > 0,
          ).every(Boolean),
          label:
            event.days === 1
              ? `Daily Field Selected: ${teamText(dayFieldIds(1))}`
              : `Daily Fields Selected: ${eventDays(event).map(day=>`Day ${day} — ${teamText(dayFieldIds(day))}`).join("; ")}`,
        },
        ...dailyCompetitionChecks(event),
        ...((event.competitions || []).includes("ntp")
          ? [{
              ok: competitionDays("ntp",event).every(day=>(event.ntpSelections?.["day"+day]||[]).length>0),
              label:
                event.days === 1
                  ? `NTP Holes Selected: ${joinHoles(event.ntpSelections?.day1)}`
                  : `NTP Holes Selected: ${competitionDays("ntp",event).map(day=>`Day ${day} — ${joinHoles(event.ntpSelections?.["day"+day])}`).join("; ")}`,
            }]
          : []),
      ].filter((check) => check.ok);
    return `<div class="finalCheck teamsFinalCheck"><h4>Final Check — Event Setup Record</h4><div class="checkList">${checks.map((check) => `<div class="ok"><span>✓</span>${esc(check.label)}</div>`).join("")}</div></div>`;
  }
  function renderTeamsPage() {
    const host = $("#teamsAdmin");
    if (!host) return;
    if (!store.event) {
      if ($("#teamsPageHeading")) $("#teamsPageHeading").textContent = "Groups and Teams";
      host.innerHTML = `<div class="card"><h3>No event plan is ready yet.</h3><p>Create and save an event plan first.</p><button class="primary" id="teamsNewEvent">Create New Event</button></div>`;
      if ($("#teamsNewEvent")) $("#teamsNewEvent").onclick = openWizard;
      return;
    }
    initialiseGroups();
    const locked = Boolean(store.event.locked);
    const day = Math.min(
        store.event.activeGroupDay || 1,
        store.event.days || 1,
      ),
      key = "day" + day,
      setup = store.event.groupSetup[key],
      groups = setup.groups;
    const teamsSaved = Boolean(setup.saved);
    const cname =
      course(store.event["course" + day])?.name ||
      "Course";
    const method = startMethodFor(store.event, day),
      ids = dayFieldIds(day),
      ctx = ambroseIsOn(store.event, day)
        ? ambroseThreePlayerContext(groups)
        : noPartnerContext(groups, day);
    const vp = setup.virtualPlayer ? player(setup.virtualPlayer) : null;
    const extra = setup.ntpExtraPlayer ? player(setup.ntpExtraPlayer) : null;
    const ambroseExtraAttempts = Object.entries(setup.ntpExtraPlayers || {})
      .map(([hole, id]) => ({ hole: +hole, name: eventPlayer(id, day)?.name || "Player" }))
      .sort((a, b) => a.hole - b.hole);
    const startControl = (gi) => {
      if (method === "shotgun")
        return `<label class="startPos">Starting Hole<select data-groupstart="${gi}" ${locked || teamsSaved ? "disabled" : ""}>${Array.from({ length: 18 }, (_, i) => `<option value="${i + 1}" ${+setup.starts[gi] === i + 1 ? "selected" : ""}>Hole ${i + 1}</option>`).join("")}</select></label>`;
      if (method === "two") {
        const tees = store.event.twoTeeStarts?.["day" + day] || [1, 10];
        return `<label class="startPos">Starting Hole<select data-groupstart="${gi}" ${locked || teamsSaved ? "disabled" : ""}>${tees.map((h) => `<option value="${h}" ${+setup.starts[gi] === +h ? "selected" : ""}>Hole ${h}</option>`).join("")}</select></label>`;
      }
      if (method === "single")
        return `<span class="startOrder">Starting Hole ${startHolesFor(store.event, day)[0]}</span>`;
      return `<span class="startOrder">Tee order ${gi + 1}</span>`;
    };
    const playerRow = (pid, gi, pi) => {
      let p = player(pid),
        selected = String(store.event.swapPlayer || "") === String(pid),
        np = String(pid) === NO_PARTNER_ID,
        awaiting = store.event.invitationStatus?.[String(pid)] === "awaiting";
      return `<div class="groupPlayer ${selected ? "swapSelected" : ""} ${np ? "noPartnerGroupPlayer" : ""} ${awaiting ? "awaitingPlayer" : ""}">
     <div class="slotNo">${pi + 1}</div>
     <div class="groupPlayerName"><b>${esc(p?.name || "Unknown")}${awaiting ? " <em>● Awaiting reply</em>" : ""}</b><small>${np ? "Missing player position" : esc(p?.noOfficialHandicap ? "No Official Handicap" : p?.golfLink || "")}</small></div>
     ${locked || teamsSaved || np ? "" : `<button type="button" class="${selected ? "primary" : "soft"} swapBtn ${store.event.manualMode ? "" : "manualOff"}" data-swapplayer="${pid}">${selected ? "Selected" : "Swap"}</button>`}
   </div>`;
    };
    const pairName = (id, gi) => {
      if (String(id) === NO_PARTNER_ID)
        return `<span class="vpName">${esc(player(setupForTeam(setup,gi).virtualPlayer)?.name || "Virtual Player")} (VP)</span>`;
      return esc(eventPlayer(id, day)?.name || "");
    };
    const pairBlock = (g, gi) => {
      if (!competitionIsOn("fourball", day)) return "";
      const one = g.slice(0, 2).map(id=>pairName(id,gi)).join(" & "),
        two = g.slice(2, 4).map(id=>pairName(id,gi)).join(" & ");
      return `<div class="partnerBlock"><div class="partnerHeading">Partners in 4BBB</div><div class="pairSummary"><span>${one || "—"}</span><span>${two || "—"}</span></div></div>`;
    };
    const ambroseRoleBlock = (g, gi) => {
      if (!ambroseIsOn(store.event, day)) return "";
      const team = g.map(String).filter((id) => id && id !== NO_PARTNER_ID),
        roles = ambroseRoles(day, gi),
        started = ambroseTeamHasEntries(day, gi),
        options = (selectedId, excludeId = "") => team
          .filter((id) => id !== excludeId)
          .map((id) => `<option value="${id}" ${id === selectedId ? "selected" : ""}>${esc(eventPlayer(id, day)?.name || "Player")}</option>`)
          .join("");
      return `<div class="ambroseTeamRoles ${store.event.ambroseScoringMode === "scorerOnly" ? "scorerOnly" : ""}"><label>Scorer<select data-ambrosescorer="${gi}" ${started ? "disabled" : ""}>${options(roles.scorerId)}</select></label>${store.event.ambroseScoringMode === "scorerOnly" ? "" : `<label>Marker<select data-ambrosemarker="${gi}" ${started ? "disabled" : ""}>${options(roles.markerId, roles.scorerId)}</select></label>`}</div>`;
    };
    const allSaved = Array.from(
      { length: store.event.days },
      (_, i) => store.event.groupSetup["day" + (i + 1)]?.saved,
    ).every(Boolean);
    const handicapsComplete = Array.from(
      { length: store.event.days },
      (_, i) => eventPlayerCategories(i+1,store.event).every(category=>enabledEventTeesForCategory(store.event,i+1,category).every(tee=>teeHandicapsComplete(i+1,tee,store.event,category))),
    ).every(Boolean);
    const lockReady = allSaved && handicapsComplete;
    const awaitingIds = ids.filter(
      (id) => store.event.invitationStatus?.[String(id)] === "awaiting",
    );
    ensureEventTeePlanning(store.event);
    const teeCategories=eventPlayerCategories(day,store.event),
      teeFinal = teeSelectionIsFinal(day),
      scoreEntry = firstDayScoreEntry(day),
      teeScoringStarted = Boolean(scoreEntry),
      selectedTeeComplete = teeCategories.every(category=>teeHandicapsComplete(day,selectedEventTee(day,store.event,category),store.event,category)),
      eventCourse = course(store.event["course" + day]),
      eventScoringStarted = Array.from({ length: store.event.days || 1 }, (_, index) => firstDayScoreEntry(index + 1)).some(Boolean),
      markerIncluded = store.event.ambroseScoringMode !== "scorerOnly",
      markerChoice = ambroseIsOn(store.event, day) ? `<div class="ambroseMarkerChoice"><b>Score Marker</b><button type="button" id="toggleAmbroseMarker" class="${markerIncluded ? "included" : ""}" ${eventScoringStarted ? "disabled" : ""}>${markerIncluded ? "✓ Marker Included" : "Click to include a Score Marker"}</button><small>${eventScoringStarted ? "Scoring has started — setting locked." : "Applies to every team in this event."}</small></div>` : "",
      teeChangeControl = locked && teeFinal && !teeScoringStarted ? '<button type="button" class="soft reopenTeeBtn" id="reopenEventTee">Change Tee Before Scoring</button>' : "",
      teePanel = `<div class="eventTeePanel ${ambroseIsOn(store.event, day) ? "ambroseTeePanel" : ""} ${teeFinal ? "final" : ""}"><div><small>${store.event.days === 1 ? "PLAYING TEE" : `DAY ${day} PLAYING TEE`}</small><h3>${teeFinal ? "✓ " : ""}${teeCategories.map(category=>`${category==="women"?"Women":"Men"}: ${eventTeeMarkerColour(day,store.event,category)}`).join(" · ")}</h3><p>${teeFinal ? "Finalised for scoring." : locked ? "Choose the tee for each category, then finalise before anyone starts scoring." : "Provisional selections. All calculated handicap sets remain stored."}</p></div><div class="eventTeeCategoryGrid">${teeCategories.map(category=>`<section class="categoryPlayingTee"><b>${category==="women"?"Women's":"Men's"} tee</b><div class="eventTeeButtons">${enabledEventTeesForCategory(store.event,day,category).map(tee=>`<button type="button" data-eventtee="${category}|${tee}" class="${selectedEventTee(day,store.event,category)===tee?"active":""}" ${teeFinal||teeScoringStarted?"disabled":""}>${esc(eventTeeDisplayName(day,tee,store.event,category,eventCourse))}<small>${teeHandicapsComplete(day,tee,store.event,category)?"Ready":"Incomplete"}</small></button>`).join("")}</div></section>`).join("")}</div>${teeChangeControl}${markerChoice}${locked && !teeFinal ? `<button type="button" class="primary finaliseTeeBtn" id="finaliseEventTee" ${selectedTeeComplete && !teeScoringStarted ? "" : "disabled"}>FINALISE TEE SELECTION</button>` : ""}${teeScoringStarted && !teeFinal ? '<strong class="teeSelectionWarning">Scoring has begun. Tee selection cannot be changed.</strong>' : ""}</div>`,
      startingHole = +(startHolesFor(store.event, day)[0] || 1),
      scoringBlocker = scoreEntry
        ? `${eventPlayer(scoreEntry.scorerId, day)?.name || "A player"} has an entry recorded on Hole ${scoreEntry.hole}.`
        : "",
      startingHolePanel =
        locked && method === "single"
          ? `<div class="eventTeePanel startingHolePanel ${teeScoringStarted ? "locked" : ""}"><div><small>${store.event.days === 1 ? "STARTING HOLE" : `DAY ${day} STARTING HOLE`}</small><h3>Hole ${startingHole}</h3><p>${teeScoringStarted ? `Starting hole cannot be changed. ${esc(scoringBlocker)}` : "If the club changes the starting hole, update it here before anyone begins scoring."}</p></div><div class="startingHoleChange"><label>New Starting Hole<select id="lockedStartHole" ${teeScoringStarted ? "disabled" : ""}>${Array.from({ length: 18 }, (_, i) => `<option value="${i + 1}" ${i + 1 === startingHole ? "selected" : ""}>Hole ${i + 1}</option>`).join("")}</select></label><button type="button" class="primary" id="applyStartingHole" ${teeScoringStarted ? "disabled" : ""}>APPLY STARTING HOLE</button></div></div>`
          : "";
    const affected = ctx?.affected ? player(ctx.affected) : null;
    const shortNotice = ctx
      ? ambroseIsOn(store.event, day)
        ? `<div class="virtualNotice"><h4>${store.event.days === 1 ? "Three-Player Ambrose Team" : `Three-Player Ambrose Team — Day ${day}`}</h4><p>This team plays with its three actual golfers. No Virtual Player score is used.</p>${ambroseExtraAttempts.length ? `<p><b>NTP Extra Shots:</b> ${ambroseExtraAttempts.map((attempt) => `Hole ${attempt.hole} — ${esc(attempt.name)}`).join("; ")}. The extra attempt rotates to a different golfer when two NTP holes are selected; either tee shot may qualify.</p>` : ""}</div>`
        : `<div class="virtualNotice">
   <h4>${store.event.days === 1 ? "Short Team Arrangement" : `Short Team Arrangement — Day ${day}`}</h4>
   <p>Due to fewer than the planned number of players being available for this event, <b>${esc(affected?.name || "the player")}</b> has been placed in a team with No Partner. <span class="vpName"><b>${esc(vp?.name || "Virtual Player")} (VP)</b></span> has been randomly selected as the Virtual Player.</p>
   <p>Where a partner or fourth team member's score is required, the Virtual Player's score will be used. The Virtual Player remains in their own playing group and is not entitled to any additional prize or required to make any additional Best 3 of 4 Lottery contribution because their score is also being used virtually.</p>
   ${extra ? `<p><b>NTP Extra Shot:</b> ${esc(extra.name)} has been randomly selected from the three golfers in the short team. On each NTP hole that day, ${esc(extra.name)} may play two tee shots; either shot may qualify for the NTP.</p>` : ""}
 </div>`
      : "";
    if ($("#teamsPageHeading")) $("#teamsPageHeading").textContent = `Groups and Teams Day ${day} ${cname} · ${ids.length} positions · ${method === "shotgun" ? "Shotgun" : method === "two" ? "Two Tees" : "Single Tee"}${locked ? " · EVENT LOCKED" : ""}`;
    host.innerHTML = `<div class="teamsTop">
   <div><h3>${esc(store.event.name)}</h3></div>
   <div class="teamsTopActions">${dayTabs("groupday", day)}${locked ? "" : `<button class="soft backToPlan" id="backToEventSetup">← Back to Event Setup</button>`}</div>
 </div>
   ${(store.event.competitions || []).includes("capTeams") ? capTeamsHtml(store.event, capRoster(), capTeamsLocked()) : ""}
 ${locked ? `<div class="lockedBanner">🔒 Event Locked — players, competitions and teams are fixed. The playing tee and single-tee starting hole remain changeable until scoring begins.</div>` : teamsSaved ? `<div class="lockedBanner teamsSavedBanner">🔒 ${store.event.days === 1 ? "Teams are" : `Day ${day} teams are`} locked. They will remain unchanged while you move through Event Setup.</div>` : `<div class="teamsToolbar"><div class="drawMethods"><button class="${store.event.drawMode === "history" ? "primary" : "soft"}" id="historyBalanced">History Balanced</button><button class="${store.event.drawMode === "random" ? "primary" : "soft"}" id="randomiseGroups">Random</button><button class="${store.event.drawMode === "manual" ? "primary" : "soft"}" id="manualMode">Manual</button></div><div class="teamsStatus">${store.event.swapPlayer ? "First player selected — now click Swap beside the player to exchange with." : store.event.drawMode === "manual" ? "Manual mode active — click Swap beside any player to begin." : store.event.drawMode === "random" ? "Random draw selected." : store.event.drawMode === "mixing" ? "Maximum Player Mixing plans the whole event together." : store.event.days === 1 ? "History Balanced uses previous playing history to vary the groups and partnerships." : "History Balanced uses previous playing history and earlier days of this event to reduce repeated groups and partners."}</div></div>`}
 ${!locked ? `<div class="ntpBox mixingChoice"><button type="button" class="${store.event.drawMode === "mixing" ? "primary" : "soft"}" id="maximumPlayerMixing" ${eventDays().some(d=>firstDayScoreEntry(d) || Object.keys(store.event.manualScorecards?.["day"+d]?.groups || {}).length)?"disabled":""}>Maximum Player Mixing</button> <button type="button" class="primary" id="lockAllEventTeams" ${eventDays().every(d=>store.event.groupSetup?.["day"+d]?.saved)?"disabled":""}>Lock All Teams All Days</button>${eventDays().every(d=>store.event.groupSetup?.["day"+d]?.saved)?'<p><b>All days’ teams are saved and locked.</b></p>':''}<p>Draw all days together to maximise different groupmates and avoid repeated 4BBB partners. Existing saved days are replaced only after confirmation.</p></div>` : ""}
 ${mixingSummaryHtml()}
 ${day > 1 && !locked && !teamsSaved ? `<div class="day2HistoryNote"><b>Day ${day} balancing:</b> today's draw treats earlier groups and 4BBB partnerships as fresh history and gives them strong repeat penalties.</div>` : ""}
 ${awaitingIds.length ? `<div class="planningAwaitingNotice"><b>${awaitingIds.length} player${awaitingIds.length === 1 ? " is" : "s are"} still awaiting a reply.</b><span>They remain amber in this provisional plan. Return to Event Setup to mark each acceptance green before locking.</span></div>` : ""}
 ${teePanel}
 ${startingHolePanel}
 ${!locked && !teamsSaved ? `<p role="status">${store.event.teamOrderSwap?.day === day ? `Team ${store.event.teamOrderSwap.index + 1} selected — click Swap on the team to exchange tee slots with, or click the selected button to cancel.` : "To change the order of play, click Swap beside the starting hole on two teams. Players and partnerships stay together; the teams exchange numbers and tee slots."}</p>` : ""}
 <div class="groupGrid">${groups
   .map(
     (g, gi) => `<div class="playingGroup">
   <div class="groupHead"><div><h4>Group ${gi + 1}</h4><small>${g.filter((x) => String(x) !== NO_PARTNER_ID).length} actual player${g.filter((x) => String(x) !== NO_PARTNER_ID).length === 1 ? "" : "s"}${g.some((x) => String(x) === NO_PARTNER_ID) ? " + No Partner" : ""} · Tee time ${groupTeeTime(day, gi)}</small></div>${startControl(gi)}<button type="button" class="${store.event.teamOrderSwap?.day === day && store.event.teamOrderSwap.index === gi ? "primary" : "soft"}" data-swapteam="${gi}" aria-label="Swap whole team ${gi + 1}" ${locked || teamsSaved || teeScoringStarted ? "disabled" : ""}>${store.event.teamOrderSwap?.day === day && store.event.teamOrderSwap.index === gi ? "Selected · Cancel" : "Swap"}</button></div>
   <div class="groupPlayers">${g.map((pid, pi) => playerRow(pid, gi, pi)).join("")}</div>
   ${ambroseRoleBlock(g, gi)}
   ${setup.shortTeams?.[String(gi)] ? (()=>{const a=setup.shortTeams[String(gi)];return `<div class="vpAssignment"><b>${ambroseIsOn(store.event, day)?'Three-player Ambrose team':'Virtual Player: '+esc(eventPlayer(a.virtualPlayer, day)?.name||'Not selected')+' (VP)'}</b>${Object.entries(a.ntpExtraPlayers||{}).map(([hole,id])=>`<span class="ntpExtra"><b>Hole ${hole} NTP Extra Shot:</b> ${esc(eventPlayer(id, day)?.name||'Player')} — two shots</span>`).join('')}${a.ntpExtraPlayer?`<span class="ntpExtra">NTP Extra Shot: ${esc(eventPlayer(a.ntpExtraPlayer, day)?.name||'Player')} — two shots on each NTP hole</span>`:''}</div>`;})():''}
   ${
     !locked && !teamsSaved &&
     store.event.swapPlayer &&
     g.some((id) => String(id) === String(store.event.swapPlayer))
       ? `<div class="manualHistory">${
           playerHistoryAgainstGroup(store.event.swapPlayer, g)
             .map(
               (h) =>
                 `<div><b>${esc(h.name)}</b><span>Played together ${h.played} time${h.played === 1 ? "" : "s"}${h.partners ? ` · 4BBB partners ${h.partners} time${h.partners === 1 ? "" : "s"}` : ""}</span></div>`,
             )
             .join("") || "<span>No previous pairings in this group.</span>"
         }</div>`
       : ""
   }
   ${pairBlock(g,gi)}
 </div>`,
   )
   .join("")}</div>
 ${
   !locked
     ? `<div class="dailyHandicapPanel"><div class="dailyHandicapHead"><div><b>${store.event.days === 1 ? "Daily Handicaps" : `Daily Handicaps — Day ${day}`}</b><span>Enter the playing handicap used for ${ambroseIsOn(store.event, day) ? "the Ambrose team handicap" : "Stableford"}. Tick Plus for a plus-handicap player.</span></div><span>${ids.filter((x) => String(x) !== NO_PARTNER_ID && playerDailyHandicap(x, day) == null).length ? "Complete before Lock Event" : "✓ Complete"}</span></div><div class="dailyHandicapGrid">${ids
         .filter((x) => String(x) !== NO_PARTNER_ID)
         .map((id) => {
           const h = playerDailyHandicap(id, day),
             plus = Number(h) < 0;
           return `<div class="dailyHcpRow"><span>${esc(eventPlayer(id, day)?.name || "")}</span><div class="teamHcpControls"><div class="signedHcpInput ${plus ? "plus" : ""}" data-teamsigned="${id}"><input type="number" inputmode="numeric" min="0" max="54" step="1" data-dailyhcp="${id}" value="${esc(handicapMagnitude(h))}" placeholder="Hcp"></div><label class="teamPlusCheck"><input type="checkbox" data-dailyplus="${id}" ${plus ? "checked" : ""}> Plus</label></div></div>`;
         })
         .join("")}</div></div>`
     : ""
 }
 ${shortTeamRuleLines(store.event,day).length?`<div class="virtualNotice"><h4>Short Team Arrangements</h4>${shortTeamRuleLines(store.event,day).map(line=>`<p>${esc(line)}</p>`).join('')}<p>Virtual scores do not create extra individual results or extra lottery contributions. Yellow Ball rotates through the real golfers only.</p></div>`:shortNotice}
 ${
   !locked && !teamsSaved && store.event.swapPlayer
     ? `<div class="swapAdvice"><b>Manual placement history — ${esc(eventPlayer(store.event.swapPlayer, day)?.name || "Player")}</b><div class="swapAdviceGrid">${groups
         .map((g, gi) => {
           let rows = playerHistoryAgainstGroup(
               store.event.swapPlayer,
               g.filter((x) => String(x) !== NO_PARTNER_ID),
             ),
             tot = rows.reduce((n, r) => n + r.played, 0),
             pt = rows.reduce((n, r) => n + r.partners, 0);
           return `<div><strong>Group ${gi + 1}</strong><span>Played with these players ${tot} time${tot === 1 ? "" : "s"}${pt ? ` · 4BBB partnered ${pt} time${pt === 1 ? "" : "s"}` : ""}</span></div>`;
         })
         .join("")}</div></div>`
     : ""
 }
 <div class="groupsFoot">
   <div class="groupSaveState">${teamsSaved ? (store.event.days === 1 ? "🔒 Teams locked" : "🔒 Day " + day + " teams locked") : store.event.days === 1 ? "Teams not yet saved" : "Day " + day + " teams not yet saved"}</div>
   ${locked ? "" : teamsSaved ? `<button class="soft unlockGroups" id="unlockGroups">${store.event.days === 1 ? "Unlock Teams" : `Unlock Day ${day} Teams`}</button>` : `<button class="primary saveGroups" id="saveGroups">${store.event.days === 1 ? "Save Teams" : `Save Day ${day} Teams`}</button>`}
 </div>
 ${teamsFinalCheckHtml()}
 ${locked ? "" : `<div class="lockEventPanel"><div><b>Final event control</b><span>Send the confirmed groups, tee times, tee and handicaps as the final update.</span></div><button class="lockEventBtn" id="lockEvent" ${lockReady ? "" : "disabled"}>ALL SET — FINAL UPDATE</button></div>`}`;

    $$("[data-groupday]").forEach(
      (b) =>
        (b.onclick = () => {
          store.event.activeGroupDay = +b.dataset.groupday;
          delete store.event.teamOrderSwap;
          store.event.swapPlayer = null;
          writeLocalStore();
          renderTeamsPage();
        }),
    );
    $$("[data-eventtee]").forEach(
      (button) =>
        (button.onclick = () => {
          if (teeSelectionIsFinal(day) || dayHasScoreEntries(day)) return;
          const [category,tee]=button.dataset.eventtee.split("|");
          selectEventTee(day, tee, store.event, category);
          writeLocalStore();
          renderTeamsPage();
        }),
    );
    if ($("#finaliseEventTee"))
      $("#finaliseEventTee").onclick = async () => {
        if (dayHasScoreEntries(day))
          return alert("The tee cannot be changed because scoring has begun.");
        if (!selectedTeeComplete)
          return alert(
            "Complete every selected Men's and Women's tee handicap before finalising.",
          );
        if (
          !confirm(
            `Finalise the selected ${teeCategories.map(category=>`${category==="women"?"Women's":"Men's"} ${eventTeeMarkerColour(day,store.event,category)}`).join(" and ")} tee${teeCategories.length>1?"s":""} for ${store.event.days === 1 ? "this event" : `Day ${day}`}?\n\nEach player will use the handicap and scorecard for their category.`,
          )
        )
          return;
        store.event.teeSelectionFinalised["day" + day] = true;
        teeCategories.forEach(category=>selectEventTee(day,selectedEventTee(day,store.event,category),store.event,category));
        recordEventHandicapHistory(day);
        writeLocalStore();
        if (store.cloud?.role === "organiser" && store.cloud.eventId)
          await updateCloudEvent();
        renderTeamsPage();
        renderPlayerExperience();
      };
    if ($("#reopenEventTee"))
      $("#reopenEventTee").onclick = async () => {
        if (dayHasScoreEntries(day))
          return alert("The tee cannot be changed because scoring has begun.");
        if (!confirm("Reopen the playing tee selection before scoring? Players will be held at the start screen until you finalise it again.")) return;
        store.event.teeSelectionFinalised["day" + day] = false;
        writeLocalStore();
        if (store.cloud?.role === "organiser" && store.cloud.eventId)
          await updateCloudEvent();
        renderTeamsPage();
        renderPlayerExperience();
      };
    if ($("#applyStartingHole"))
      $("#applyStartingHole").onclick = async () => {
        const blocker = firstDayScoreEntry(day);
        if (blocker)
          return alert(
            `The starting hole cannot be changed. ${eventPlayer(blocker.scorerId, day)?.name || "A player"} has an entry recorded on Hole ${blocker.hole}.`,
          );
        const nextHole = +$("#lockedStartHole").value;
        if (nextHole === startingHole) return;
        if (
          !confirm(
            `Change ${store.event.days === 1 ? "the event" : `Day ${day}`} starting hole from Hole ${startingHole} to Hole ${nextHole}?\n\nEvery connected scorecard will open at Hole ${nextHole}.`,
          )
        )
          return;
        store.event.startHoles = store.event.startHoles || {};
        store.event.startHoles[key] = [nextHole];
        setup.starts = setup.groups.map(() => nextHole);
        store.event.startingHoleUpdate = {
          day,
          from: startingHole,
          hole: nextHole,
          changedAt: new Date().toISOString(),
        };
        if (store.event.ntpSelections?.[key])
          store.event.ntpSelections[key] = ntpHolesInPlayingOrder(day);
        writeLocalStore();
        if (store.cloud?.role === "organiser" && store.cloud.eventId)
          await updateCloudEvent();
        renderTeamsPage();
        renderPlayerExperience();
        renderHome();
      };
    const saveAmbroseRole = async (groupIndex, field, playerId) => {
      if (ambroseTeamHasEntries(day, groupIndex))
        return alert("These appointments cannot be changed because this team has started scoring.");
      store.event.ambroseRoleAssignments ||= {};
      store.event.ambroseRoleAssignments[key] ||= {};
      const assignment = store.event.ambroseRoleAssignments[key][groupIndex] ||= {};
      assignment[field] = String(playerId);
      const team = ambroseTeam(day, groupIndex),
        roles = ambroseRoles(day, groupIndex);
      if (field === "scorerId" && assignment.markerId === assignment.scorerId)
        assignment.markerId = team.find((id) => id !== assignment.scorerId) || "";
      if (field === "markerId" && assignment.markerId === roles.scorerId)
        assignment.markerId = team.find((id) => id !== roles.scorerId) || "";
      writeLocalStore();
      if (store.cloud?.role === "organiser" && store.cloud.eventId)
        await updateCloudEvent();
      renderTeamsPage();
      renderPlayerExperience();
    };
    $$('[data-ambrosescorer]').forEach((select) => select.onchange = () =>
      saveAmbroseRole(+select.dataset.ambrosescorer, "scorerId", select.value));
    $$('[data-ambrosemarker]').forEach((select) => select.onchange = () =>
      saveAmbroseRole(+select.dataset.ambrosemarker, "markerId", select.value));
    if ($("#toggleAmbroseMarker"))
      $("#toggleAmbroseMarker").onclick = async () => {
        if (eventScoringStarted)
          return alert("The score-marker setting cannot be changed because scoring has begun.");
        store.event.ambroseScoringMode = markerIncluded
          ? "scorerOnly"
          : "scorerMarker";
        writeLocalStore();
        if (store.cloud?.role === "organiser" && store.cloud.eventId)
          await updateCloudEvent();
        renderTeamsPage();
        renderPlayerExperience();
      };
    if (locked) return;
    $("#backToEventSetup").onclick = reopenEventPlan;
    if ($("#unlockGroups"))
      $("#unlockGroups").onclick = () => {
        if (
          !confirm(
            `Unlock ${store.event.days === 1 ? "these teams" : `Day ${day} teams`} for editing?\n\nThey will stay in their current positions until you make a change.`,
          )
        )
          return;
        setup.saved = false;
        store.event.swapPlayer = null;
        save();
        renderTeamsPage();
      };
    if ($("#lockAllEventTeams")) $("#lockAllEventTeams").onclick = lockAllEventTeams;
    if ($("#maximumPlayerMixing")) $("#maximumPlayerMixing").onclick = applyMaximumPlayerMixing;
    if ($("#historyBalanced")) $("#historyBalanced").onclick = () => {
      delete store.event.teamOrderSwap;
      store.event.drawMode = "history";
      store.event.manualMode = false;
      store.event.swapPlayer = null;
      setup.groups = historyBalancedGroups(ids, day);
      setup.starts = defaultStarts(setup.groups, method, day);
      setup.saved = false;
      ensureShortTeamSelections(setup, day);
      writeLocalStore();
      renderTeamsPage();
    };
    if ($("#randomiseGroups")) $("#randomiseGroups").onclick = () => {
      delete store.event.teamOrderSwap;
      store.event.drawMode = "random";
      store.event.manualMode = false;
      store.event.swapPlayer = null;
      setup.groups = makeGroups(shuffleCopy(ids), day);
      setup.starts = defaultStarts(setup.groups, method, day);
      setup.saved = false;
      ensureShortTeamSelections(setup, day);
      writeLocalStore();
      renderTeamsPage();
    };
    if ($("#manualMode")) $("#manualMode").onclick = () => {
      delete store.event.teamOrderSwap;
      store.event.drawMode = "manual";
      store.event.manualMode = true;
      store.event.swapPlayer = null;
      writeLocalStore();
      renderTeamsPage();
    };
    $$('[data-swapteam]').forEach(button => button.onclick = () => {
      if (locked || teamsSaved || firstDayScoreEntry(day)) return;
      const chosen = +button.dataset.swapteam;
      const pending = store.event.teamOrderSwap;
      store.event.swapPlayer = null;
      if (!pending || pending.day !== day) store.event.teamOrderSwap = {day, index: chosen};
      else {
        swapWholeTeams(store.event, day, pending.index, chosen);
        delete store.event.teamOrderSwap;
      }
      writeLocalStore();
      renderTeamsPage();
    });
    $$("[data-swapplayer]").forEach(
      (btn) =>
        (btn.onclick = () => {
          store.event.drawMode = "manual";
          store.event.manualMode = true;
          delete store.event.teamOrderSwap;
          const id = String(btn.dataset.swapplayer);
          if (!store.event.swapPlayer) {
            store.event.swapPlayer = id;
            writeLocalStore();
            renderTeamsPage();
            return;
          }
          if (String(store.event.swapPlayer) === id) {
            store.event.swapPlayer = null;
            writeLocalStore();
            renderTeamsPage();
            return;
          }
          const first = String(store.event.swapPlayer);
          let a = null,
            b = null;
          for (let gi = 0; gi < groups.length; gi++)
            for (let pi = 0; pi < groups[gi].length; pi++) {
              const pid = String(groups[gi][pi]);
              if (pid === first) a = { gi, pi };
              if (pid === id) b = { gi, pi };
            }
          if (a && b) {
            const tmp = groups[a.gi][a.pi];
            groups[a.gi][a.pi] = groups[b.gi][b.pi];
            groups[b.gi][b.pi] = tmp;
            setup.saved = false;
            ensureShortTeamSelections(setup, day);
          }
          store.event.swapPlayer = null;
          writeLocalStore();
          renderTeamsPage();
        }),
    );
    $$("[data-groupstart]").forEach(
      (s) =>
        (s.onchange = () => {
          if (teamsSaved) return;
          setup.starts[+s.dataset.groupstart] = +s.value;
          setup.saved = false;
          save();
          renderTeamsPage();
        }),
    );
    $$("[data-dailyhcp]").forEach(
      (inp) =>
        (inp.onchange = () => {
          const id = String(inp.dataset.dailyhcp),
            h = eventDayHandicaps(day),
            plus = $(`[data-dailyplus="${id}"]`)?.checked,
            raw =
              inp.value === ""
                ? null
                : Math.max(0, Math.min(54, +inp.value || 0)),
            val = raw == null ? null : plus ? -raw : raw;
          if (val == null) {
            h[id] = "";
            writeLocalStore();
            renderTeamsPage();
            return;
          }
          h[id] = val;
          if (day === 1 && store.event.days === 2 && String(store.event.course1) === String(store.event.course2)) {
            const d2 = eventDayHandicaps(2);
            if (d2[id] === "" || d2[id] == null) d2[id] = val;
          }
          writeLocalStore();
          renderTeamsPage();
        }),
    );
    $$("[data-dailyplus]").forEach(
      (cb) =>
        (cb.onchange = () => {
          const inp = $(`[data-dailyhcp="${cb.dataset.dailyplus}"]`);
          if (inp) inp.onchange();
        }),
    );
    if ($("#saveGroups")) $("#saveGroups").onclick = () => {
      delete store.event.teamOrderSwap;
      setup.saved = true;
      store.event.swapPlayer = null;
      ensureShortTeamSelections(setup, day);
      save();
      renderTeamsPage();
    };
    $("#lockEvent").onclick = async () => {
      if (!lockReady) return;
      if (awaitingIds.length) {
        alert(
          `The event cannot be locked yet. ${awaitingIds.length} player${awaitingIds.length === 1 ? " is" : "s are"} still awaiting a reply. Return to Event Setup and mark each confirmed player green.`,
        );
        return;
      }
      if (
        confirm(
          "Lock and send the final event setup?\n\nNormal planning details cannot be changed after this.\nBefore scoring starts, you can still modify handicaps, change the selected tees and add an emergency replacement if someone does not turn up.\nAfter scoring starts, Emergency Score Recovery remains available if a player's phone fails during play.",
        )
      ) {
        ensureEventTeePlanning(store.event);
        eventDays(store.event).forEach(eventDay => ["men", "women"].forEach(category =>
          captureEventTeeNames(store.event, eventDay, category, authoritativeMasterCourse(store.event["course" + eventDay]), true),
        ));
        refreshEventCourseSnapshot(store.event);
        store.event.locked = true;
        store.event.status = "locked";
        store.event.setupStage = "final";
        store.event.lockedAt = new Date().toISOString();
        store.event.finalUpdateAt = store.event.lockedAt;
        for (let eventDay = 1; eventDay <= store.event.days; eventDay++) {
          store.event.teeSelectionFinalised["day" + eventDay] = true;
          recordEventHandicapHistory(eventDay);
        }
        save();
        if (store.cloud?.role === "organiser" && store.cloud.eventId) await updateCloudEvent();
        renderTeamsPage();
      }
    };
    if ((store.event.competitions || []).includes("capTeams")) bindCapTeams(store.event, capRoster(), renderTeamsPage);
  }

  function formatEventDate(iso, day = 1) {
    if (!iso) return "";
    let d = new Date((iso === store.event?.date ? eventDate(day) : iso) + "T12:00:00");
    if (iso !== store.event?.date) d.setDate(d.getDate() + day - 1);
    return d.toLocaleDateString("en-AU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
  function homeEventDate(event) {
    if (!event?.date) return "Not set";
    const start = new Date(event.date + "T12:00:00"),
      days = Math.max(1, +event.days || 1),
      shortPart = (date) =>
        date.toLocaleDateString("en-AU", {
          weekday: "short",
          day: "numeric",
        });
    if (days === 1)
      return start.toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    const end = new Date(eventDate(days, event) + "T12:00:00");
    return `${shortPart(start)} – ${end.toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }
  function playerGroupContext(pid, day) {
    const setup = store.event?.groupSetup?.["day" + day];
    if (!setup) return null;
    for (let gi = 0; gi < setup.groups.length; gi++) {
      const g = setup.groups[gi].map(String),
        pi = g.indexOf(String(pid));
      if (pi >= 0) return { setup:setupForTeam(setup,gi), group: g, groupIndex: gi, playerIndex: pi };
    }
    return null;
  }
  function ambroseIsOn(event = store.event, day = event?.activeGroupDay || 1) {
    return competitionIsOn("ambrose", day, event);
  }
  function ambroseTeam(day, groupIndex, event = store.event) {
    return (event?.groupSetup?.["day" + day]?.groups?.[groupIndex] || [])
      .map(String)
      .filter((id) => id && id !== NO_PARTNER_ID);
  }
  function ambroseRoles(day, groupIndex) {
    const team = ambroseTeam(day, groupIndex),
      assigned = store.event?.ambroseRoleAssignments?.["day" + day]?.[groupIndex] || {},
      assignedScorer = String(assigned.scorerId || ""),
      scorerId = team.includes(assignedScorer) ? assignedScorer : team[0] || "",
      assignedMarker = String(assigned.markerId || ""),
      defaultMarker = team.find((id) => id !== scorerId) || "";
    return {
      scorerId,
      markerId:
        store.event?.ambroseScoringMode === "scorerOnly"
          ? ""
          : team.includes(assignedMarker) && assignedMarker !== scorerId
            ? assignedMarker
            : defaultMarker,
      team,
    };
  }
  function ambroseTeamHasEntries(day, groupIndex) {
    return ambroseTeam(day, groupIndex).some((playerId) =>
      Array.from({ length: 18 }, (_, index) => index + 1).some((hole) => {
        const record = scorerStore(day, playerId)?.[String(hole)];
        return scoreEntered(record?.self?.gross) || Boolean(record?.ambrose?.drivePlayerId);
      }),
    );
  }
  function ambroseEntry(day, scorerId, hole) {
    const rec = scoreRecord(day, scorerId, hole);
    rec.ambrose = rec.ambrose || { drivePlayerId: "" };
    return rec;
  }
  function ambroseTeamHandicap(day, groupIndex) {
    const team = ambroseTeam(day, groupIndex),
      values = team.map((id) => playerDailyHandicap(id, day));
    if (!team.length || values.some((value) => value == null)) return null;
    return values.reduce((sum, value) => sum + +value, 0) / (team.length * 2);
  }
  function ambroseHoleAgreement(day, groupIndex, hole) {
    const roles = ambroseRoles(day, groupIndex),
      scorer = ambroseEntry(day, roles.scorerId, hole),
      marker = roles.markerId
        ? ambroseEntry(day, roles.markerId, hole)
        : null,
      scorerDone =
        scoreEntered(scorer.self?.gross) &&
        Boolean(scorer.ambrose?.drivePlayerId),
      markerDone =
        !marker ||
        (scoreEntered(marker.self?.gross) &&
          Boolean(marker.ambrose?.drivePlayerId));
    return {
      scorer,
      marker,
      scorerDone,
      markerDone,
      complete: Boolean(
        scorerDone &&
          markerDone &&
          (!marker ||
            (+scorer.self.gross === +marker.self.gross &&
              String(scorer.ambrose.drivePlayerId) ===
                String(marker.ambrose.drivePlayerId))),
      ),
      mismatch: Boolean(
        marker &&
          scorerDone &&
          markerDone &&
          (+scorer.self.gross !== +marker.self.gross ||
            String(scorer.ambrose.drivePlayerId) !==
              String(marker.ambrose.drivePlayerId)),
      ),
    };
  }
  function ambroseTeamComplete(day, groupIndex) {
    return Array.from({ length: 18 }, (_, index) => index + 1).every(
      (hole) => ambroseHoleAgreement(day, groupIndex, hole).complete,
    );
  }
  function ambroseDriveCounts(day, groupIndex, scorerId) {
    const counts = Object.fromEntries(
      ambroseTeam(day, groupIndex).map((id) => [id, 0]),
    );
    for (let hole = 1; hole <= 18; hole++) {
      const id = scorerStore(day, scorerId)?.[String(hole)]?.ambrose
        ?.drivePlayerId;
      if (id && counts[id] != null) counts[id]++;
    }
    return counts;
  }
  function yellowBallIsOn(day, event = store.event) {
    if (!(event?.competitions || []).includes("yellowBall")) return false;
    if ((event.days || 1) === 1) return +day === 1;
    return competitionDays("yellowBall", event).includes(+day);
  }
  function yellowBallTeam(day, groupIndex, event = store.event) {
    const setup = event?.groupSetup?.["day" + day],
      group = setup?.groups?.[groupIndex] || [];
    return group
      .map(String)
      .filter((id) => id && id !== NO_PARTNER_ID);
  }
  function yellowBallPlayerForHole(day, groupIndex, hole, event = store.event) {
    const team = yellowBallTeam(day, groupIndex, event);
    if (!team.length) return "";
    const start = groupStartingHole(event, day, groupIndex),
      position = scoreSequence(start).indexOf(+hole);
    return position < 0 ? "" : team[position % team.length];
  }
  function yellowBallLoss(day, groupIndex, event = store.event) {
    const paper = event?.manualScorecards?.['day' + day]?.groups?.[String(groupIndex)];
    if (paper?.status === "submitted" && paper.team?.yellowBall?.lossHole) {
      const result = paper.team.yellowBall;
      if (result.lossHole === "NONE") return null;
      const hole = +result.lossHole, position = scoreSequence(groupStartingHole(event, day, groupIndex)).indexOf(hole);
      return position < 0 ? null : {hole, position, playerId: yellowBallPlayerForHole(day, groupIndex, hole, event), source: "paper-team-card"};
    }
    const team = yellowBallTeam(day, groupIndex, event),
      start = groupStartingHole(event, day, groupIndex),
      sequence = scoreSequence(start),
      rounds = event?.scoring?.["day" + day] || {};
    let loss = null;
    for (const [scorerId, round] of Object.entries(rounds)) {
      if (!team.includes(String(scorerId))) continue;
      for (const [holeText, record] of Object.entries(round || {})) {
        const hole = +holeText,
          position = sequence.indexOf(hole);
        if (
          position < 0 ||
          !record?.yellowBall?.lost ||
          String(record.yellowBall.playerId || "") !==
            yellowBallPlayerForHole(day, groupIndex, hole, event)
        )
          continue;
        if (!loss || position < loss.position)
          loss = {
            hole,
            position,
            playerId: String(record.yellowBall.playerId),
            scorerId: String(scorerId),
          };
      }
    }
    return loss;
  }
  function yellowBallHoleState(day, groupIndex, hole, record, event = store.event) {
    const playerId = yellowBallIsOn(day, event) ? yellowBallPlayerForHole(day, groupIndex, hole, event) : "";
    const position = scoreSequence(groupStartingHole(event, day, groupIndex)).indexOf(+hole);
    const loss = playerId ? yellowBallLoss(day, groupIndex, event) : null;
    return {
      playerId,
      active: Boolean(playerId && position >= 0 && (!loss || position < loss.position)),
      canRecord: Boolean(playerId && position >= 0 && (!loss || position <= loss.position)),
      lostHere: Boolean(record?.yellowBall?.lost && String(record.yellowBall.playerId || "") === String(playerId)),
    };
  }
  function findOfficialForPlayer(day, playerId, hole) {
    const correction = organiserCorrectionFor(day, playerId, hole);
    if (correction) return { ...correction, authoritative: true };
    const d = scoringDayStore(day),
      pid = String(playerId);
    for (const [scorerId, holes] of Object.entries(d)) {
      const r = holes?.[String(hole)];
      if (
        String(r?.official?.playerId || "") === pid &&
        r.official.gross !== "" &&
        r.official.gross != null
      )
        return { ...r.official, scorerId };
    }
    return null;
  }
  function playerHoleEntry(day, playerId, hole) {
    const own = scoringDayStore(day)?.[String(playerId)]?.[String(hole)]?.self;
    if (
      own &&
      ((own.gross !== "" && own.gross != null) ||
        (own.putts !== "" && own.putts != null))
    )
      return own;
    return findOfficialForPlayer(day, playerId, hole);
  }
  function playerSurname(id) {
    const n = String(player(id)?.name || "Player")
      .trim()
      .split(/\s+/);
    return n[n.length - 1] || "Player";
  }
  function playerFirstName(id) {
    return (
      String(player(id)?.name || "Player")
        .trim()
        .split(/\s+/)[0] || "Player"
    );
  }
  function welcomeKey(playerId) {
    return `awayGolfWelcomeV1:${store.cloud?.eventId || store.event?.name || "event"}:${playerId}`;
  }
  function playerHasSeenWelcome(playerId) {
    return localStorage.getItem(welcomeKey(playerId)) === "yes";
  }
  function rememberPlayerWelcome(playerId) {
    localStorage.setItem(welcomeKey(playerId), "yes");
  }
  function openPlayerRulesFromWelcome(playerId) {
    // The welcome screen is local to a player's phone. Do not use the broad
    // save() path here: that also renders organiser pages and can interrupt
    // the first player-only navigation on a joined device.
    rememberPlayerWelcome(playerId);
    store.event.playerRulesOpen = true;
    store.event.playerRoundMode = "preview";
    writeLocalStore();
    renderPlayerExperience();
  }
  function renderCompletedScorecard(selected, day) {
    const host = $("#playerExperience");
    if (!roundFinalisedFor(day, selected)) {
      store.event.playerRoundMode = "preview";
      save();
      return renderPlayerExperience();
    }
    const nextDay = eventDays().find(next => next > day && dayFieldIds(next).includes(String(selected)) && !eventDayComplete(next));
    const p = eventPlayer(selected,day),
      c = course(store.event["course" + day]),
      v = eventCourseScorecard(day,store.event,selected),
      hcp = playerDailyHandicap(selected, day),
      ctx = playerGroupContext(selected, day),
      start = ctx?.setup?.starts?.[ctx.groupIndex] || 1,
      seq = scoreSequence(start);
    const rows = seq.map((h) => {
      const i = h - 1,
        e = playerHoleEntry(day, selected, h) || {},
        gross = e.gross ?? "",
        putts = e.putts ?? "",
        par = +(v.par?.[i] || 0),
        indexVal = v.index?.[i] ?? "",
        adjustment = stablefordStrokeCount(indexVal, hcp),
        points = stablefordPoints(gross, par, indexVal, hcp);
      return { h, par, indexVal, gross, putts, adjustment, points };
    });
    const totals = (list) =>
      list.reduce(
        (t, r) => {
          if (String(r.gross).toUpperCase() === "P")
            t.gross += r.par + 2 + r.adjustment;
          else if (scoreEntered(r.gross)) t.gross += +r.gross || 0;
          if (scoreEntered(r.putts)) t.putts += +r.putts || 0;
          if (r.points != null) t.points += r.points;
          return t;
        },
        { gross: 0, putts: 0, points: 0 },
      );
    const front = totals(rows.filter((r) => r.h <= 9)),
      back = totals(rows.filter((r) => r.h >= 10)),
      all = totals(rows),
      signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "—");
    host.innerHTML = `<div class="completedCardPage"><div class="roundTop"><button class="soft" id="backFromCompletedCard">← Back to Player View</button><div><h2>Completed Scorecard</h2><p>${esc(p?.name || "Player")}${store.event.days === 1 ? "" : ` · Day ${day}`} · ${esc(c?.name || "Course")}</p></div><img class="completedMascot" src="away-golf-mascot-mini.png" alt="Away Golf golfer"></div>

 <div class="completedCardBanner"><div><small>DAILY HANDICAP</small><b>${esc(formatPlayingHandicap(hcp))}</b></div><div><small>STARTING TEE</small><b>Hole ${start}</b></div><div><small>STATUS</small><b>✓ Finalised</b></div></div>
 ${recoveredRoundAccepted(day, selected) ? '<p class="completedCardHelp">Your organiser accepted this round after emergency recovery. Your scorecard is complete.</p>' : ""}<details class="completedCardHelp"><summary>About this scorecard</summary><p>Read-only card. <b>Hcp +/-</b> shows the handicap adjustment on each hole. A minus means a plus-handicap golfer gives a stroke back.</p></details>
 <div class="completedScoreTable"><div class="completedScoreHead"><span>Hole</span><span>Par</span><span>Index</span><span>Score</span><span>Hcp +/-</span><span>Points</span><span>Putts</span></div>${rows.map((r) => `<div class="completedScoreRow ${r.adjustment < 0 ? "givesStroke" : ""}"><b>${r.h}</b><span>${r.par || "—"}</span><span>${esc(r.indexVal || "—")}</span><span>${r.gross === "" ? "—" : esc(r.gross)}</span><strong>${signed(r.adjustment)}</strong><span>${r.points == null ? "—" : r.points}</span><span>${r.putts === "" ? "—" : r.putts}</span></div>`).join("")}</div>
 <div class="completedTotals"><div><small>FRONT 9</small><b>${front.gross} strokes · ${front.points} pts · ${front.putts} putts</b></div><div><small>BACK 9</small><b>${back.gross} strokes · ${back.points} pts · ${back.putts} putts</b></div><div class="grand"><small>18-HOLE TOTAL</small><b>${all.gross} strokes · ${all.points} pts · ${all.putts} putts</b></div></div>
 ${nextDay ? `<button class="startRoundBtn" id="nextFromCompletedCard">VIEW DAY ${nextDay}</button>` : ""}<button class="startRoundBtn" id="backFromCompletedCardBottom">BACK TO PLAYER VIEW</button></div>`;
    const goBack = () => {
      store.event.playerRoundMode = "preview";
      save();
      renderPlayerExperience();
    };
    $("#backFromCompletedCard").onclick = goBack;
    $("#backFromCompletedCardBottom").onclick = goBack;
    if (nextDay) $("#nextFromCompletedCard").onclick = () => {
      store.event.playerPreviewDay = nextDay;
      store.event.playerRoundMode = "preview";
      store.event.playerHolePos = 0;
      writeLocalStore();
      renderPlayerExperience();
    };
  }
  function scorecardVerificationRows(day, playerId) {
    const c = course(store.event["course" + day]),
      v = eventCourseScorecard(day,store.event,playerId),
      mine = scorerStore(day, playerId),
      puttsRequired = competitionIsOn("teamPutts", day),
      hcp = playerDailyHandicap(playerId, day);
    return Array.from({ length: 18 }, (_, i) => i + 1).map((h) => {
      const self = mine[String(h)]?.self || {},
        off = findOfficialForPlayer(day, playerId, h),
        selfGross = self.gross ?? "",
        offGross = off?.gross ?? "",
        selfPutts = self.putts ?? "",
        offPutts = off?.putts ?? "",
        bothEntered = scoreEntered(selfGross) && scoreEntered(offGross),
        scoreMatch =
          bothEntered &&
          String(offGross).toUpperCase() === String(selfGross).toUpperCase(),
        puttsMatch =
          !puttsRequired ||
          (scoreEntered(offPutts) &&
            scoreEntered(selfPutts) &&
            +offPutts === +selfPutts);
      return {
        h,
        self: selfGross,
        off: offGross,
        selfPutts,
        offPutts,
        selfPts: bothEntered
          ? stablefordPoints(selfGross, +(v.par?.[h - 1] || 0), v.index?.[h - 1] ?? "", hcp)
          : null,
        offPts: bothEntered
          ? stablefordPoints(offGross, +(v.par?.[h - 1] || 0), v.index?.[h - 1] ?? "", hcp)
          : null,
        scoreMatch,
        puttsMatch,
        match: scoreMatch && puttsMatch,
      };
    });
  }
  function markedScorecardVerification(day, scorerId) {
    const targetId = markerTargetFor(scorerId, day),
      markerRound = scorerStore(day, scorerId),
      playerRound = targetId ? scorerStore(day, targetId) : {},
      puttsRequired = competitionIsOn("teamPutts", day);
    const rows = Array.from({ length: 18 }, (_, i) => i + 1).map((h) => {
      const marked = markerRound[String(h)]?.official || {},
        checked = playerRound[String(h)]?.self || {},
        markedGross = marked.gross ?? "",
        checkedGross = checked.gross ?? "",
        markedPutts = marked.putts ?? "",
        checkedPutts = checked.putts ?? "",
        scoreMatch =
          scoreEntered(markedGross) &&
          scoreEntered(checkedGross) &&
          String(markedGross).toUpperCase() === String(checkedGross).toUpperCase(),
        puttsMatch =
          !puttsRequired ||
          (scoreEntered(markedPutts) &&
            scoreEntered(checkedPutts) &&
            +markedPutts === +checkedPutts);
      return {
        h,
        marked: markedGross,
        checked: checkedGross,
        markedPutts,
        checkedPutts,
        scoreMatch,
        puttsMatch,
        match: scoreMatch && puttsMatch,
      };
    });
    return { targetId, rows, mismatches: rows.filter((r) => !r.match) };
  }
  function renderRoundVerification(selected, day) {
    requestRoundWakeLock();
    const host = $("#playerExperience"),
      ctx = playerGroupContext(selected, day),
      setup = ctx?.setup,
      c = course(store.event["course" + day]);
    if (!ctx) return renderPlayerExperience();
    const start = groupStartingHole(store.event, day, ctx.groupIndex),
      seq = scoreSequence(start),
      puttsRequired = competitionIsOn("teamPutts", day),
      ownRows = scorecardVerificationRows(day, selected),
      ownMismatches = ownRows.filter((r) => !r.match),
      stage = ownMismatches.length
        ? "mine"
        : store.event.playerVerificationStage === "marked"
          ? "marked"
          : "mine",
      marked = markedScorecardVerification(day, selected),
      targetName = eventPlayer(marked.targetId, day)?.name || "the player you marked";
    if (recoveredRoundAccepted(day, selected) || (
      ownMismatches.length === 0 &&
      marked.mismatches.length === 0 &&
      officialCardProgress(day, selected).complete
    )) {
      store.event.playerVerificationStage = "mine";
      store.event.returnToMarkedVerification = false;
      store.event.playerRoundMode = "completed";
      const accepted=scorerStore(day,selected);
      if(!accepted._meta?.finalisedAt) {
        accepted._meta={...(accepted._meta||{}),finalisedAt:new Date().toISOString()};
        writeLocalStore();queueCloudRound(day,selected);
      }
      releaseRoundWakeLock();
      save();
      return renderCompletedScorecard(selected, day);
    }
    const ownCard = `<div class="verifyCard"><h3>${ownMismatches.length ? `${ownMismatches.length} hole${ownMismatches.length === 1 ? "" : "s"} need attention` : puttsRequired ? "✓ Your card: all 18 scores and putts agree" : "✓ Your card: all 18 scores agree"}</h3><p>Your ${puttsRequired ? "scores and putts are" : "scores are"} compared with the official entries made by your marker.</p><div class="verifyRows">${ownRows.map((r) => `<div class="verifyRow ${r.match ? "match" : "mismatch"}"><b>Hole ${r.h}</b><span>Marker: ${r.off === "" ? "—" : r.off}${r.offPts != null ? ` (${r.offPts} pt${r.offPts === 1 ? "" : "s"})` : ""}${puttsRequired ? `<small>Putts: ${r.offPutts === "" ? "—" : r.offPutts}</small>` : ""}</span><span>You: ${r.self === "" ? "—" : r.self}${r.selfPts != null ? ` (${r.selfPts} pt${r.selfPts === 1 ? "" : "s"})` : ""}${puttsRequired ? `<small>Putts: ${r.selfPutts === "" ? "—" : r.selfPutts}</small>` : ""}</span><strong>${r.match ? "✓" : "!"}</strong>${!r.scoreMatch ? `<em class="verifyIssue">Score mismatch — Marker ${r.off === "" ? "—" : r.off}, You ${r.self === "" ? "—" : r.self}</em>` : ""}${puttsRequired && !r.puttsMatch ? `<em class="verifyIssue">Putts mismatch — Marker ${r.offPutts === "" ? "—" : r.offPutts}, You ${r.selfPutts === "" ? "—" : r.selfPutts}</em>` : ""}</div>`).join("")}</div></div>`;
    const markedCard = `<div class="verifyCard markedVerifyCard"><h3>${marked.mismatches.length ? `Card marked for ${esc(targetName)} — ${marked.mismatches.length} hole${marked.mismatches.length === 1 ? "" : "s"} need attention` : `✓ Card marked for ${esc(targetName)}: all 18 agree`}</h3><p>Your marker entries are compared with ${esc(playerFirstName(marked.targetId))}’s checking entries.</p><div class="verifyRows">${marked.rows.map((r) => `<div class="verifyRow ${r.match ? "match" : "mismatch"}" ${r.match ? "" : `data-fixmarked="${r.h}" role="button" tabindex="0"`}><b>Hole ${r.h}</b><span>You: ${r.marked === "" ? "—" : r.marked}${puttsRequired ? `<small>Putts: ${r.markedPutts === "" ? "—" : r.markedPutts}</small>` : ""}</span><span>${esc(playerFirstName(marked.targetId))}: ${r.checked === "" ? "—" : r.checked}${puttsRequired ? `<small>Putts: ${r.checkedPutts === "" ? "—" : r.checkedPutts}</small>` : ""}</span><strong>${r.match ? "✓" : "!"}</strong>${!r.scoreMatch ? `<em class="verifyIssue">Score mismatch — You ${r.marked === "" ? "—" : r.marked}, ${esc(playerFirstName(marked.targetId))} ${r.checked === "" ? "—" : r.checked}</em>` : ""}${puttsRequired && !r.puttsMatch ? `<em class="verifyIssue">Putts mismatch — You ${r.markedPutts === "" ? "—" : r.markedPutts}, ${esc(playerFirstName(marked.targetId))} ${r.checkedPutts === "" ? "—" : r.checkedPutts}</em>` : ""}</div>`).join("")}</div></div>`;
    host.innerHTML = `<div class="roundTop"><button class="soft" id="backToRound">← Back to Round</button><div><h2>Round Verification</h2><p>${esc(eventPlayer(selected, day)?.name || "")}${store.event.days === 1 ? "" : ` · Day ${day}`} · ${esc(c?.name || "Course")}</p></div></div>${stage === "mine" ? ownCard : markedCard}
 ${stage === "mine" && ownMismatches.length ? `<div class="verificationAdvice">Return to the relevant hole or ask your marker to correct the official entry. All 18 holes must agree before continuing.</div>` : stage === "mine" ? `<button class="startRoundBtn" id="continueToMarkedCard">CONTINUE — CHECK CARD I MARKED</button>` : `<div class="verificationAdvice"><b>Tap a red hole</b> to check the score you entered. If your entry is correct, wait for ${esc(playerFirstName(marked.targetId))} to correct their checking score, then press Refresh.</div><button class="soft verifyRefresh" id="refreshMarkedCard">Refresh</button>`}`;
    $("#backToRound").onclick = () => {
      store.event.playerVerificationStage = "mine";
      store.event.playerRoundMode = "scoring";
      save();
      renderPlayerExperience();
    };
    if ($("#continueToMarkedCard"))
      $("#continueToMarkedCard").onclick = () => {
        store.event.playerVerificationStage = "marked";
        save();
        renderRoundVerification(selected, day);
      };
    $$('[data-fixmarked]').forEach((row) => {
      const openHole = () => {
        store.event.playerHolePos = seq.indexOf(+row.dataset.fixmarked);
        store.event.returnToMarkedVerification = true;
        store.event.playerRoundMode = "scoring";
        save();
        renderPlayerExperience();
      };
      row.onclick = openHole;
      row.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openHole();
        }
      };
    });
    if ($("#refreshMarkedCard"))
      $("#refreshMarkedCard").onclick = async () => {
        await syncCloudNow();
        renderRoundVerification(selected, day);
      };
  }
  function renderAmbroseScoring(selected, day) {
    requestRoundWakeLock();
    const host = $("#playerExperience"),
      ctx = playerGroupContext(selected, day);
    if (!ctx) return renderPlayerExperience();
    const roles = ambroseRoles(day, ctx.groupIndex),
      editable = [roles.scorerId, roles.markerId].includes(String(selected)),
      entryScorerId = editable ? String(selected) : roles.scorerId,
      isPrimary = String(selected) === roles.scorerId,
      c = course(store.event["course" + day]),
      v = eventCourseScorecard(day),
      start = groupStartingHole(store.event, day, ctx.groupIndex),
      sequence = scoreSequence(start),
      position = Math.max(0, Math.min(17, +(store.event.playerHolePos || 0))),
      hole = sequence[position],
      index = hole - 1,
      par = +(v.par?.[index] || 4),
      metres = courseHoleDistance(v, index) || "—",
      agreement = ambroseHoleAgreement(day, ctx.groupIndex, hole),
      record = ambroseEntry(day, entryScorerId, hole),
      gross = record.self?.gross,
      driveId = String(record.ambrose?.drivePlayerId || ""),
      ntp = ntpHolesFor(day).includes(hole),
      holder = ntp ? currentNtpHolder(day, hole) : null,
      extraNtpPlayerId = roles.team.length === 3
        ? String(
            ctx.setup.ntpExtraPlayers?.[String(hole)] ||
              ctx.setup.ntpExtraPlayer ||
              "",
          )
        : "",
      handicap = ambroseTeamHandicap(day, ctx.groupIndex),
      counts = ambroseDriveCounts(day, ctx.groupIndex, roles.scorerId),
      minimum = +store.event.ambroseMinimumDrives || 0,
      completeCount = sequence.filter((h) =>
        ambroseHoleAgreement(day, ctx.groupIndex, h).complete,
      ).length;
    const statusFor = (h) => {
      const check = ambroseHoleAgreement(day, ctx.groupIndex, h);
      return h === hole
        ? "current"
        : check.mismatch
          ? "mismatch"
          : check.complete
            ? "complete"
            : "upcoming";
    };
    const teamGross = Array.from({ length: 18 }, (_, i) => {
      const value = scorerStore(day, roles.scorerId)?.[String(i + 1)]?.self?.gross;
      return scoreEntered(value) ? +value : null;
    });
    const grossTotal = teamGross.reduce(
      (sum, value) => sum + (value == null ? 0 : value),
      0,
    );
    const roleLabel = !editable
      ? `Viewing ${esc(eventPlayer(roles.scorerId, day)?.name || "the scorer")}'s team card`
      : isPrimary
        ? "TEAM SCORER"
        : "TEAM MARKER — CHECKING CARD";
    host.innerHTML = `<div class="scoringPhone ambrosePhone">
      <div class="ambroseRole"><div><small>AMBROSE · TEAM ${ctx.groupIndex + 1}</small><h2>${roleLabel}</h2></div><span>${completeCount}/18 agreed</span></div>
      <div class="holeTracker" aria-label="Ambrose hole status"><div class="holeTrackerKey"><span><i class="complete">✓</i> Agreed</span><span><i class="mismatch">!</i> Check</span><span><i class="current"></i> Current</span></div><div class="holeTrackerGrid">${sequence.map((h, i) => { const state = statusFor(h); return `<button type="button" class="holeTrack ${state}" data-ambrosehole="${i}"><b>${h}</b>${state === "complete" ? "<small>✓</small>" : state === "mismatch" ? "<small>!</small>" : ""}</button>`; }).join("")}</div></div>
      ${agreement.mismatch ? '<div class="mismatchHoleAlert"><div><strong>Score or selected drive does not agree</strong><span>The scorer and marker should check this hole.</span></div></div>' : ""}
      <div class="holeHero ${ntp ? "isNtp" : ""}"><div><small>HOLE</small><strong>${hole}</strong></div><div><small>PAR</small><b>${par}</b></div><div><small>INDEX</small><b>${esc(v.index?.[index] || "—")}</b></div><div><small>${courseDistanceUnit(v).toUpperCase()}</small><b>${metres}</b></div></div>
      <div class="scoreEntryCard ambroseScoreCard"><div class="scoreEntryHead"><div><small>TEAM SCORE</small><h3>${editable ? esc(eventPlayer(selected, day)?.name || "Player") : "Read only"}</h3></div><div class="scoreSummary"><div class="runningScore"><span><em>Gross</em><b>${grossTotal || "—"}</b></span><span><em>Hcp</em><b>${handicap == null ? "—" : handicap.toFixed(1)}</b></span><span title="Final net appears after all 18 holes"><em>Final Net</em><b>${teamGross.filter((x) => x != null).length === 18 && handicap != null ? (grossTotal - handicap).toFixed(1) : "—"}</b></span></div></div></div>
        <div class="ambroseGross"><small>Strokes taken on Hole ${hole}</small><div class="scoreStepper ${scoreEntered(gross) ? "set" : "unset"}"><button type="button" id="ambroseMinus" ${editable ? "" : "disabled"}>−</button><button type="button" class="stepValue" id="ambroseGross" ${editable ? "" : "disabled"}>${scoreEntered(gross) ? gross : par}</button><button type="button" id="ambrosePlus" ${editable ? "" : "disabled"}>+</button></div></div>
        <div class="ambroseDrive"><div class="ambroseDriveHeading"><b>Drive taken?</b><small>Tap correct player to correct an error.</small></div><div class="ambroseDriveChoices">${roles.team.map((id) => `<button type="button" data-ambrosedrive="${id}" class="${driveId === id ? "selected" : ""}" ${editable ? "" : "disabled"}><span>${esc(eventPlayer(id, day)?.name || "Player")}</span><small><b>+</b><strong>${counts[id] || 0}</strong><em>of</em><strong>${minimum}</strong></small></button>`).join("")}</div></div>
      </div>
      ${ntp ? `<div class="ntpPlayCard ambroseNtp"><div><b>Nearest the Pin — Hole ${hole}</b>${extraNtpPlayerId ? `<strong class="ambroseExtraShot">TWO SHOTS: ${esc(eventPlayer(extraNtpPlayerId, day)?.name || "One player")}</strong>` : ""}<span>${holder ? `Current holder: ${esc(eventPlayer(holder.id, day)?.name || "Player")}` : "No name recorded yet"}</span><strong>Who signed the NTP card?</strong></div>${isPrimary ? `<div class="ambroseNtpNames">${roles.team.map((id) => `<button type="button" data-ambrosentp="${id}" class="${String(record.ntp?.entrantId || "") === id && record.ntp?.confirmedAt ? "selected" : ""}">${esc(eventPlayer(id, day)?.name || "Player")}</button>`).join("")}${record.ntp?.confirmedAt ? `<button type="button" class="soft" id="undoAmbroseNtp">Undo</button><small>Recorded ${new Date(record.ntp.confirmedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</small>` : ""}</div>` : "<small>The team scorer records the NTP card entry.</small>"}</div>` : ""}
      <div class="holeNav"><button class="soft" id="prevHole" ${position === 0 ? "disabled" : ""}>← Previous</button><button class="primary" id="nextHole">${position === 17 ? "FINISH TEAM CARD" : "Next Hole →"}</button></div>
    </div>`;
    const update = (nextGross = gross, nextDrive = driveId) => {
      record.self = record.self || {};
      record.self.playerId = entryScorerId;
      record.self.gross = nextGross;
      record.ambrose.drivePlayerId = nextDrive;
      const entryRound = scorerStore(day, entryScorerId);
      if (entryRound._meta?.finalisedAt) delete entryRound._meta.finalisedAt;
      writeLocalStore();
      queueCloudRound(day, entryScorerId);
      renderAmbroseScoring(selected, day);
    };
    if ($("#ambroseMinus")) $("#ambroseMinus").onclick = () => update(Math.max(1, (scoreEntered(gross) ? +gross : par) - 1));
    if ($("#ambrosePlus")) $("#ambrosePlus").onclick = () => update(Math.min(30, (scoreEntered(gross) ? +gross : par) + 1));
    if ($("#ambroseGross")) $("#ambroseGross").onclick = () => { if (!scoreEntered(gross)) update(par); };
    $$('[data-ambrosedrive]').forEach((button) => button.onclick = () => update(gross, button.dataset.ambrosedrive));
    const currentEntryComplete = () =>
      !editable || (scoreEntered(record.self?.gross) && Boolean(record.ambrose?.drivePlayerId));
    const warnIncompleteEntry = () => {
      if (currentEntryComplete()) return false;
      const missing = [
        !scoreEntered(record.self?.gross) ? "the team score" : "",
        !record.ambrose?.drivePlayerId ? "whose drive was selected" : "",
      ].filter(Boolean).join(" and ");
      alert(`Hole ${hole} is incomplete. Please enter ${missing} before moving on.`);
      return true;
    };
    $$('[data-ambrosehole]').forEach((button) => button.onclick = () => {
      const targetPosition = +button.dataset.ambrosehole;
      if (targetPosition > position && warnIncompleteEntry()) return;
      store.event.playerHolePos = targetPosition;
      save();
      renderAmbroseScoring(selected, day);
    });
    $$('[data-ambrosentp]').forEach((button) => button.onclick = () => {
      record.ntp = { entrantId: button.dataset.ambrosentp, confirmedAt: new Date().toISOString(), locked: false };
      writeLocalStore(); queueCloudRound(day, roles.scorerId); renderAmbroseScoring(selected, day);
    });
    if ($("#undoAmbroseNtp")) $("#undoAmbroseNtp").onclick = () => { record.ntp = {}; writeLocalStore(); queueCloudRound(day, roles.scorerId); renderAmbroseScoring(selected, day); };
    $("#prevHole").onclick = () => {
      store.event.playerHolePos = Math.max(0, position - 1);
      save();
      renderAmbroseScoring(selected, day);
    };
    $("#nextHole").onclick = async () => {
      if (warnIncompleteEntry()) return;
      if (editable) { writeLocalStore(); queueCloudRound(day, entryScorerId); }
      if (position < 17) { store.event.playerHolePos = position + 1; save(); return renderAmbroseScoring(selected, day); }
      if (!editable) return alert("Only the team scorer or checking marker can complete the Ambrose team card.");
      if (!ambroseTeamComplete(day, ctx.groupIndex)) return alert("The team card cannot be completed yet. Every hole needs a team score and selected drive" + (roles.markerId ? ", and both cards must agree." : "."));
      const short = Object.entries(counts).filter(([, count]) => count < minimum);
      if (short.length && !confirm(`REQUIRED DRIVES NOT RECORDED\n\n${short.map(([id, count]) => `${eventPlayer(id, day)?.name || "Player"}: ${count} of ${minimum} drives`).join("\n")}\n\nSubmit this card as non-compliant and exclude the team from the Ambrose result?`)) return;
      const at = new Date().toISOString();
      store.event.roundFinalised = store.event.roundFinalised || {};
      store.event.roundFinalised["day" + day] ||= {};
      roles.team.forEach((id) => store.event.roundFinalised["day" + day][id] = at);
      [roles.scorerId, roles.markerId].filter(Boolean).forEach((id) => { const round = scorerStore(day, id); round._meta = { ...(round._meta || {}), finalisedAt: at, ambroseTeam: ctx.groupIndex, ambroseDriveCompliant: !short.length }; queueCloudRound(day, id); });
      store.event.playerRoundMode = "completed";
      writeLocalStore();
      if (store.cloud?.role === "organiser" && store.cloud?.eventId) await updateCloudEvent();
      renderPlayerExperience(); renderHome();
    };
  }
  function renderAmbroseCompleted(selected, day) {
    const host = $("#playerExperience"),
      ctx = playerGroupContext(selected, day);
    if (!ctx) return renderPlayerExperience();
    const roles = ambroseRoles(day, ctx.groupIndex),
      handicap = ambroseTeamHandicap(day, ctx.groupIndex),
      holes = Array.from({ length: 18 }, (_, index) => {
        const value = scorerStore(day, roles.scorerId)?.[String(index + 1)]?.self?.gross;
        return scoreEntered(value) ? +value : null;
      }),
      gross = leaderSum(holes),
      counts = ambroseDriveCounts(day, ctx.groupIndex, roles.scorerId),
      minimum = +store.event.ambroseMinimumDrives || 0,
      compliant = roles.team.every((id) => (counts[id] || 0) >= minimum);
    host.innerHTML = `<div class="completedCard ambroseCompleted ${compliant ? "" : "ambroseNonCompliant"}"><div class="roundTop"><button class="soft" id="backFromAmbroseComplete">← Back</button><div><h2>Ambrose Team Card Submitted</h2><p>Team ${ctx.groupIndex + 1}${store.event.days === 1 ? "" : ` · Day ${day}`}</p></div></div>${compliant ? "" : '<div class="ambroseComplianceStamp">REQUIRED DRIVES NOT RECORDED</div>'}<div class="ambroseFinalScore"><span><small>GROSS</small><strong>${gross}</strong></span><span><small>HANDICAP</small><strong>${handicap == null ? "—" : handicap.toFixed(1)}</strong></span><span><small>NET</small><strong>${handicap == null ? "—" : (gross - handicap).toFixed(1)}</strong></span></div><div class="ambroseDriveSummary"><b>Accepted drives — ${compliant ? "minimum satisfied ✓" : "minimum not satisfied"}</b>${roles.team.map((id) => `<span class="${(counts[id] || 0) >= minimum ? "ready" : "short"}"><em>${esc(eventPlayer(id, day)?.name || "Player")}:</em><strong>${counts[id] || 0} <small>of ${minimum}</small></strong></span>`).join("")}</div><div class="card"><p>The team score and selected drives have been submitted${roles.markerId ? " and the scorer and marker cards agree" : ""}. ${compliant ? "The team is eligible for the Ambrose result." : "The organiser has received the card, but the team is excluded from the Ambrose result."}</p></div></div>`;
    $("#backFromAmbroseComplete").onclick = () => { store.event.playerRoundMode = "preview"; save(); renderPlayerExperience(); };
  }
  function scoreEntryControls(puttingOn, section, entry, par, stepper, pickup) {
    const gross = stepper(section + "Gross", "Score", entry.gross, par || 4, 1, 20);
    if (puttingOn)
      return `<div class="scoreSteppers">${gross}${stepper(section + "Putts", "Putts", entry.putts, 2, 0, 9)}</div>${pickup(section + "Gross", entry.gross)}`;
    return `<div class="scoreSteppers noPutting">${gross}<div class="scoreStepperWrap pickupControl"><small>Pick-up</small>${pickup(section + "Gross", entry.gross, true)}</div></div>`;
  }
  function scoreEntriesMismatch(left, right, puttsRequired) {
    if (!scoreEntered(left?.gross) || !scoreEntered(right?.gross)) return false;
    if (puttsRequired && (!scoreEntered(left?.putts) || !scoreEntered(right?.putts))) return false;
    return String(left.gross).toUpperCase() !== String(right.gross).toUpperCase() ||
      (puttsRequired && Number(left.putts) !== Number(right.putts));
  }
  function renderHoleScoring(selected, day) {
    requestRoundWakeLock();
    const host = $("#playerExperience"),
      p = eventPlayer(selected,day),
      ctx = playerGroupContext(selected, day);
    if (!p || !ctx) return renderPlayerExperience();
    const setup = ctx.setup,
      c = course(store.event["course" + day]),
      v = eventCourseScorecard(day,store.event,selected),
      start = groupStartingHole(store.event, day, ctx.groupIndex),
      seq = scoreSequence(start);
    let pos = Math.max(0, Math.min(17, store.event.playerHolePos || 0)),
      hole = seq[pos],
      idx = hole - 1,
      rec = scoreRecord(day, selected, hole),
      targetId = markerTargetFor(selected, day),
      targetCard = eventCourseScorecard(day,store.event,targetId),
      target = eventPlayer(targetId,day),
      hcpSelf = playerDailyHandicap(selected, day),
      hcpTarget = playerDailyHandicap(targetId, day);
    rec.official.playerId = targetId;
    rec.self.playerId = selected;
    const par = +v.par?.[idx] || "",
      indexVal = v.index?.[idx] ?? "",
      metres = courseHoleDistance(v, idx) || "";
    const ntp = ntpHolesFor(day).includes(hole),
      holder = currentNtpHolder(day, hole),
      holderName = holder ? eventPlayer(holder.id, day)?.name : "",
      ntpState = ntp ? ntpJackpotState(day, hole) : null,
      ntpPrize = ntp ? ntpPrizeText(day, hole) : "",
      ntpPrizeStatus = ntpPrize
        ? `${ntpPrize}${ntpState?.carried ? ` (${ntpState.base} + ${ntpState.carried} jackpot)` : ""}`
        : "";
    const targetHoleInfo=eventCourseCategory(day,store.event,selected)!==eventCourseCategory(day,store.event,targetId)?`<p class="scoringCategoryInfo">${esc(target?.name||"Marked player")} · ${eventCourseCategory(day,store.event,targetId)==="women"?"Women":"Men"} · Par ${targetCard.par?.[idx]||"—"} · Index ${esc(targetCard.index?.[idx]||"—")} · ${courseHoleDistance(targetCard,idx)||"—"} ${courseDistanceAbbrev(targetCard)}</p>`:"";
    const sfOff = stablefordPoints(
        rec.official.gross,
        +targetCard.par?.[idx]||0,
        targetCard.index?.[idx]??"",
        hcpTarget,
      ),
      sfSelf = stablefordPoints(rec.self.gross, par, indexVal, hcpSelf);
    const playedHoles = seq.slice(0, pos + 1),
      round = scorerStore(day, selected);
    const running = (section, hcp, playerId) =>
      playedHoles.reduce(
        (total, h) => {
          const item = round[String(h)]?.[section] || {};
          if (
            section === "official" &&
            String(item.playerId || "") !== String(playerId || "")
          )
            return total;
          const i = h - 1,card=eventCourseScorecard(day,store.event,playerId),
            pts = stablefordPoints(
              item.gross,
              +(card.par?.[i] || 0),
              card.index?.[i] ?? "",
              hcp,
            ),
            putts =
              item.putts === "" || item.putts == null ? 0 : +item.putts || 0;
          total.points += pts == null ? 0 : pts;
          total.putts += putts;
          return total;
        },
        { points: 0, putts: 0 },
      );
    const totalOff = running("official", hcpTarget, targetId),
      totalSelf = running("self", hcpSelf, selected);
    const eclecticGroup = (store.event.competitions || []).includes("eclectic")
      ? selectedEclecticGroups(store.event).find((group) => group.days.includes(day) && day !== group.days[0])
      : null,
      eclecticOn = Boolean(eclecticGroup);
    const eclecticData = (playerId) => {
      if (!eclecticOn) return null;
      const baseDay = eclecticGroup.days[0], completedDays = eclecticGroup.days.filter((roundDay) => roundDay <= day),
        baseVersion = eventCourseScorecard(baseDay,store.event,playerId), baseHcp = playerDailyHandicap(playerId, baseDay);
      const basePoints = (h) => {
        const e = playerHoleEntry(baseDay, playerId, h),
          i = h - 1;
        return stablefordPoints(
          e?.gross,
          +(baseVersion.par?.[i] || 0),
          baseVersion.index?.[i] ?? "",
          baseHcp,
        );
      };
      const baseHole = basePoints(hole),
        values = playedHoles.map((h) => {
          const roundValues = completedDays.map((roundDay) => {
            const entry = playerHoleEntry(roundDay, playerId, h), card = eventCourseScorecard(roundDay,store.event,playerId), i = h - 1;
            return stablefordPoints(entry?.gross, +(card.par?.[i] || 0), card.index?.[i] ?? "", playerDailyHandicap(playerId, roundDay));
          }).filter((value) => value != null);
          return roundValues.length ? Math.max(...roundValues) : null;
        });
      return {
        baseDay,
        baseHole,
        total: values.every((x) => x != null)
          ? values.reduce((a, b) => a + b, 0)
          : null,
      };
    };
    const scoreSummary = (current, total, playerId) => {
      const ec = eclecticData(playerId),
        shots = stablefordStrokeCount(
          indexVal,
          playerDailyHandicap(playerId, day),
        );
      return `<div class="scoreSummary ${ec ? "hasEclectic" : ""}"><div class="runningScore"><span><em>Shots</em><b>${shots}</b></span><span><em>Score</em><b>${current == null ? "—" : current}</b></span><span><em>Total</em><b>${total}</b></span>${ec ? `<span><em>Day ${ec.baseDay}</em><b>${ec.baseHole == null ? "—" : ec.baseHole}</b></span><span><em>Eclectic</em><b>${ec.total == null ? "—" : ec.total}</b></span>` : ""}</div></div>`;
    };
    const pairStart = ctx.playerIndex < 2 ? 0 : 2,
      pairIds = ctx.group
        .slice(pairStart, pairStart + 2)
        .map(String)
        .filter((id) => id !== NO_PARTNER_ID),
      teamIds = ctx.group.map(String).filter((id) => id !== NO_PARTNER_ID);
    if (
      pairIds.length < 2 &&
      setup.virtualPlayer &&
      !pairIds.includes(String(setup.virtualPlayer))
    )
      pairIds.push(String(setup.virtualPlayer));
    if (
      teamIds.length < 4 &&
      setup.virtualPlayer &&
      !teamIds.includes(String(setup.virtualPlayer))
    )
      teamIds.push(String(setup.virtualPlayer));
    const puttsThrough = (pid) => {
      let sum = 0;
      for (const h of playedHoles) {
        const e = playerHoleEntry(day, pid, h),card=eventCourseScorecard(day,store.event,pid);
        if (e?.putts === "" || e?.putts == null) return null;
        sum += +e.putts || 0;
      }
      return sum;
    };
    const pairDisplay = [String(targetId), String(selected)].filter(
        (id, i, a) => id && a.indexOf(id) === i,
      ),
      individualPutts = pairDisplay.map((id) => ({
        id,
        total: puttsThrough(id),
      }));
    const puttingOn = competitionIsOn("teamPutts", day),
      puttingFormat = store.event.puttingFormat === "pairs" ? "pairs" : "team",
      puttingIds = puttingFormat === "pairs" ? pairIds : teamIds,
      puttingValues = puttingIds.map(puttsThrough),
      puttingTotal = puttingValues.every((x) => x != null)
        ? puttingValues.reduce((a, b) => a + b, 0)
        : null;
    const puttsLine = `<b>Putts:</b> ${individualPutts.map((x) => `<span>${esc(playerSurname(x.id))} <strong>${x.total == null ? "—" : x.total}</strong></span>`).join(" ")}${puttingOn ? `<span class="puttingAggregate">${puttingFormat === "pairs" ? "Pairs" : "Team"} Total <strong>${puttingTotal == null ? "—" : puttingTotal}</strong></span>` : ""}${ntp ? "<em>NTP</em>" : ""}`;
    const best3Hole = (h) => {
      const i = h - 1,
        values = teamIds
          .map((pid) => {
            const e = playerHoleEntry(day, pid, h),card=eventCourseScorecard(day,store.event,pid);
            return stablefordPoints(
              e?.gross,
              +(card.par?.[i] || 0),
              card.index?.[i] ?? "",
              playerDailyHandicap(pid, day),
            );
          })
          .filter((x) => x != null)
          .sort((a, b) => b - a);
      return values.length >= 3
        ? values.slice(0, 3).reduce((a, b) => a + b, 0)
        : null;
    };
    const best3Current = best3Hole(hole),
      best3Values = playedHoles.map(best3Hole),
      best3Total = best3Values.every((x) => x != null)
        ? best3Values.reduce((a, b) => a + b, 0)
        : null,
      best3On = competitionIsOn("best3of4", day),
      yellowBallState = yellowBallHoleState(day, ctx.groupIndex, hole, rec),
      yellowBallPlayerId = yellowBallState.playerId,
      yellowBallActive = yellowBallState.active,
      yellowBallLostHere = yellowBallState.lostHere,
      yellowBallButton = (playerId) => yellowBallState.canRecord && String(playerId) === String(yellowBallPlayerId)
        ? `<button type="button" class="yellowBallLostBtn ${yellowBallLostHere ? "lost" : ""}" id="yellowBallLost">${yellowBallLostHere ? "UNDO BALL LOST" : "BALL LOST"}</button>` : "",
      yellowBallClass = (playerId) =>
        yellowBallActive && String(playerId) === String(yellowBallPlayerId)
          ? "yellowBallTurn"
          : "";
    const isExtra = String(setup.ntpExtraPlayers?.[String(hole)] || setup.ntpExtraPlayer || "") === String(selected);
    const stepper = (id, label, value, base, min, max) => {
      const has = value !== "" && value != null,
        isGross = id.endsWith("Gross"),
        picked = isGross && String(value).toUpperCase() === "P",
        val = picked ? "P" : has ? +value : +base;
      return `<div class="scoreStepperWrap ${isGross ? "grossControl" : "puttsControl"}"><small>${label}</small><div class="scoreStepper ${has ? "set" : "unset"}"><button type="button" data-step="${id}" data-delta="-1">−</button><button type="button" class="stepValue" data-confirm="${id}" data-base="${base}">${val}</button><button type="button" data-step="${id}" data-delta="1">+</button></div></div>`;
    };
    const pickup = (id, value, compact = false) => {
      const picked = String(value).toUpperCase() === "P";
      return `<button type="button" class="pickupRow ${picked ? "picked" : ""}" data-pickup="${id}">${picked ? compact ? "✓ PICK-UP (P)" : "✓ PICK-UP RECORDED (P)" : "P — PICK-UP"}</button>`;
    };
    const timeText = rec.ntp?.confirmedAt
      ? new Date(rec.ntp.confirmedAt).toLocaleTimeString("en-AU", {
          hour: "numeric",
          minute: "2-digit",
        })
      : "";
    const holeComplete = (h) => {
      const r = round[String(h)] || {},
        grossDone =
          scoreEntered(r.official?.gross) && scoreEntered(r.self?.gross);
      const puttsRequired = competitionIsOn("teamPutts", day);
      return (
        grossDone &&
        (!puttsRequired ||
          (scoreEntered(r.official?.putts) && scoreEntered(r.self?.putts)))
      );
    };
    const liveMismatch = (h) => {
      const own = round[String(h)]?.self || {},
        ownOfficial = findOfficialForPlayer(day, selected, h),
        marked = round[String(h)]?.official || {},
        markedPlayer = String(marked.playerId || targetId || ""),
        markedCheck = scoringDayStore(day)?.[markedPlayer]?.[String(h)]?.self || {},
        puttsRequired = puttingOn;
      return scoreEntriesMismatch(own, ownOfficial, puttsRequired) ||
        Boolean(markedPlayer && scoreEntriesMismatch(marked, markedCheck, puttsRequired));
    };
    round._meta = round._meta || {};
    const furthestPos = Math.max(pos, +round._meta.furthestPos || 0);
    round._meta.furthestPos = furthestPos;
    const missingHoles = seq
      .slice(0, furthestPos)
      .filter((h) => !holeComplete(h));
    const mismatchHoles = seq.filter((h) => liveMismatch(h));
    const holeStatus = (h) =>
      h === hole
        ? "current"
        : liveMismatch(h)
          ? "mismatch"
          : holeComplete(h)
          ? "complete"
          : seq.indexOf(h) < furthestPos
            ? "missing"
            : "upcoming";
    const holeTracker = `<div class="holeTracker" aria-label="Round hole status"><div class="holeTrackerKey"><span><i class="complete">✓</i> Agreed</span><span><i class="mismatch">!</i> Check</span><span><i class="missing">!</i> Missing</span><span><i class="current"></i> Current</span></div><div class="holeTrackerGrid">${seq
      .map((h, i) => {
        const state = holeStatus(h);
        return `<button type="button" class="holeTrack ${state}" data-gotohole="${i}" aria-label="Hole ${h}, ${state}"><b>${h}</b>${state === "complete" ? "<small>✓</small>" : ["missing", "mismatch"].includes(state) ? "<small>!</small>" : ""}</button>`;
      })
      .join("")}</div></div>`;
    const missingAlert = missingHoles.length
      ? `<div class="missingHoleAlert"><div><strong>${missingHoles.length} missing hole${missingHoles.length === 1 ? "" : "s"}: ${missingHoles.join(", ")}</strong><span>These holes have been passed without complete scores.</span></div><button type="button" id="firstMissingHole">Go to first missing hole</button></div>`
      : "";
    const mismatchAlert = mismatchHoles.length
      ? `<div class="mismatchHoleAlert"><div><strong>Hole${mismatchHoles.length === 1 ? "" : "s"} ${mismatchHoles.join(", ")} need${mismatchHoles.length === 1 ? "s" : ""} checking</strong><span>Your ${puttingOn ? "score or putts does" : "score does"} not agree with the other card. Please check it now.</span></div><button type="button" id="firstMismatchHole">Check now</button></div>`
      : "";
    const emergency = store.event.emergencyReplacements?.["day" + day],
      showVirtualGlance = emergency && +emergency.groupIndex === +ctx.groupIndex,
      virtualEntry = showVirtualGlance ? playerHoleEntry(day, emergency.virtualPlayerId, hole) : null,
      virtualPoints = showVirtualGlance
        ? stablefordPoints(virtualEntry?.gross, par, indexVal, playerDailyHandicap(emergency.virtualPlayerId, day))
        : null,
      virtualGlance = showVirtualGlance
        ? `<details class="virtualGlance"><summary>${esc(eventPlayer(emergency.virtualPlayerId, day)?.name || "Virtual Player")} — Virtual Player for ${esc(eventPlayer(emergency.missingPlayerId, day)?.name || "missing player")}</summary><div>${virtualEntry && scoreEntered(virtualEntry.gross) ? `<b>Hole ${hole} verified: ${virtualPoints ?? "—"} point${virtualPoints === 1 ? "" : "s"}${virtualEntry.putts == null || virtualEntry.putts === "" ? "" : ` · ${virtualEntry.putts} putts`}</b><span>This borrowed score is now included automatically in the affected pair and team totals.</span>` : `<b>Waiting for ${esc(eventPlayer(emergency.virtualPlayerId, day)?.name || "the virtual player")}'s verified score on Hole ${hole}</b><span>The affected pair and team totals will update when that score arrives.</span>`}</div></details>`
        : "";
    const startingHoleNotice = store.event.playerStartingHoleNotice,
      showStartingHoleNotice =
        +startingHoleNotice?.day === +day &&
        +startingHoleNotice?.hole === +start;
    const startingHoleAlert = showStartingHoleNotice
      ? `<div class="startingHoleAlert"><div><strong>Starting hole changed to Hole ${start}</strong><span>The organiser has updated this scorecard. Begin your round here.</span></div><button type="button" id="dismissStartingHoleAlert">Got it</button></div>`
      : "";
    host.innerHTML = `${store.event.returnToMarkedVerification ? '<div class="returnSetupBar verificationReturnBar"><button class="soft" id="returnToMarkedVerification">← Return to Checking</button></div>' : ""}<div class="scoringPhone">${startingHoleAlert}${holeTracker}${mismatchAlert}${missingAlert}
 ${targetHoleInfo}<div class="holeHero ${ntp ? "isNtp" : ""}"><div><small>HOLE</small><strong>${hole}</strong></div><div><small>PAR</small><b>${par || "—"}</b></div><div><small>INDEX</small><b>${esc(indexVal || "—")}</b></div><div><small>${courseDistanceUnit(v).toUpperCase()}</small><b>${metres || "—"}</b></div></div>
 <div class="scoreEntryCard official"><div class="scoreEntryHead"><div><small>PLAYER</small><div class="yellowBallNameLine"><h3 class="${yellowBallClass(targetId)}">${esc(target?.name || "Player")}</h3>${yellowBallButton(targetId)}</div></div>${scoreSummary(sfOff, totalOff.points, targetId)}</div>${scoreEntryControls(puttingOn, "official", rec.official, +targetCard.par?.[idx]||par, stepper, pickup)}</div>
 <div class="scoreEntryCard self"><div class="scoreEntryHead"><div><small>MARKER</small><div class="yellowBallNameLine"><h3 class="${yellowBallClass(selected)}">${esc(p.name)}</h3>${yellowBallButton(selected)}</div></div>${scoreSummary(sfSelf, totalSelf.points, selected)}</div>${scoreEntryControls(puttingOn, "self", rec.self, par, stepper, pickup)}</div>
 ${ntp ? `<div class="ntpPlayCard"><div><b>Nearest the Pin — Hole ${hole}</b><span>${holder ? `Current holder: ${esc(holderName || "Player")}` : "No name recorded yet"}${ntpPrizeStatus ? ` · Prize: ${esc(ntpPrizeStatus)}` : ""}${isExtra ? " · You have the NTP extra shot today." : ""}</span><strong>Did ${esc(target?.name || "your marker partner")} record their name on the NTP marker?</strong></div>${rec.ntp?.locked ? `<button disabled>Entry locked</button>` : rec.ntp?.confirmedAt ? `<div class="ntpConfirmed"><span class="ntpTime">🔒 ${esc(timeText)}</span><button class="soft" id="undoNtp">Undo</button></div>` : `<button class="primary ${rec.ntp?.pending ? "confirming" : ""}" id="yesNtp">${rec.ntp?.pending ? "CONFIRM YES" : "YES"}</button>`}</div>` : ""}
 <div class="holeNav"><button class="soft" id="prevHole" ${pos === 0 ? "disabled" : ""}>← Previous</button><button class="primary" id="nextHole">${pos === 17 ? "FINISH ROUND" : "Next Hole →"}</button></div>${virtualGlance}</div>`;
    if ($("#firstMismatchHole"))
      $("#firstMismatchHole").onclick = () => {
        store.event.playerHolePos = seq.indexOf(mismatchHoles[0]);
        save();
        renderHoleScoring(selected, day);
      };
    if ($("#dismissStartingHoleAlert"))
      $("#dismissStartingHoleAlert").onclick = () => {
        store.event.playerStartingHoleNotice = null;
        save();
        renderHoleScoring(selected, day);
      };
    const setField = (id, val) => {
      const [section, key] = id.startsWith("official")
        ? ["official", id === "officialGross" ? "gross" : "putts"]
        : ["self", id === "selfGross" ? "gross" : "putts"];
      rec[section][key] = val;
      const round = scorerStore(day, selected);
      if (round._meta?.finalisedAt) delete round._meta.finalisedAt;
      if (store.event.roundFinalised?.["day" + day])
        delete store.event.roundFinalised["day" + day][selected];
      writeLocalStore();
      queueCloudRound(day, selected);
      renderHoleScoring(selected, day);
    };
    $$("[data-step]").forEach(
      (btn) =>
        (btn.onclick = () => {
          const id = btn.dataset.step,
            section = id.startsWith("official") ? "official" : "self",
            key = id.endsWith("Gross") ? "gross" : "putts",
            base = key === "gross" ? par || 4 : 2,
            min = key === "gross" ? 1 : 0,
            max = key === "gross" ? 20 : 9,
            current =
              rec[section][key] === "" ||
              rec[section][key] == null ||
              String(rec[section][key]).toUpperCase() === "P"
                ? base
                : +rec[section][key];
          setField(
            id,
            Math.max(min, Math.min(max, current + +btn.dataset.delta)),
          );
        }),
    );
    $$("[data-pickup]").forEach(
      (btn) =>
        (btn.onclick = () => {
          setField(btn.dataset.pickup, "P");
        }),
    );
    $$("[data-confirm]").forEach(
      (btn) =>
        (btn.onclick = () => {
          const id = btn.dataset.confirm,
            section = id.startsWith("official") ? "official" : "self",
            key = id.endsWith("Gross") ? "gross" : "putts";
          if (rec[section][key] === "" || rec[section][key] == null)
            setField(id, +btn.dataset.base);
        }),
    );
    if ($("#yesNtp"))
      $("#yesNtp").onclick = () => {
        if (!rec.ntp.pending) {
          rec.ntp.pending = true;
        } else {
          rec.ntp.pending = false;
          rec.ntp.entrantId = targetId;
          rec.ntp.confirmedAt = new Date().toISOString();
        }
        save();
        queueCloudRound(day, selected);
        renderHoleScoring(selected, day);
      };
    if ($("#undoNtp"))
      $("#undoNtp").onclick = () => {
        rec.ntp.confirmedAt = null;
        rec.ntp.entrantId = null;
        rec.ntp.pending = false;
        save();
        queueCloudRound(day, selected);
        renderHoleScoring(selected, day);
      };
    if ($("#yellowBallLost"))
      $("#yellowBallLost").onclick = () => {
        if (yellowBallLostHere) {
          delete rec.yellowBall;
        } else {
          if (
            !confirm(
              `Confirm that ${eventPlayer(yellowBallPlayerId, day)?.name || "the nominated player"} lost the Yellow Ball on Hole ${hole}? Yellow Ball scoring for this team will stop before this hole.`,
            )
          )
            return;
          rec.yellowBall = {
            lost: true,
            playerId: String(yellowBallPlayerId),
            at: new Date().toISOString(),
          };
        }
        writeLocalStore();
        queueCloudRound(day, selected);
        renderHoleScoring(selected, day);
      };
    $$("[data-gotohole]").forEach(
      (btn) =>
        (btn.onclick = () => {
          store.event.playerHolePos = +btn.dataset.gotohole;
          save();
          renderHoleScoring(selected, day);
        }),
    );
    if ($("#firstMissingHole"))
      $("#firstMissingHole").onclick = () => {
        store.event.playerHolePos = seq.indexOf(missingHoles[0]);
        save();
        renderHoleScoring(selected, day);
      };
    if ($("#returnToMarkedVerification"))
      $("#returnToMarkedVerification").onclick = () => {
        store.event.returnToMarkedVerification = false;
        store.event.playerVerificationStage = "marked";
        store.event.playerRoundMode = "verify";
        save();
        renderRoundVerification(selected, day);
      };
    $("#prevHole").onclick = () => {
      store.event.playerHolePos = Math.max(0, pos - 1);
      save();
      renderHoleScoring(selected, day);
    };
    $("#nextHole").onclick = () => {
      $("#nextHole").disabled = true;
      if (ntp && rec.ntp.confirmedAt) rec.ntp.locked = true;
      writeLocalStore();
      queueCloudRound(day, selected);
      if (pos === 17) {
        store.event.playerVerificationStage = "mine";
        store.event.returnToMarkedVerification = false;
        store.event.playerRoundMode = "verify";
        save();
        renderRoundVerification(selected, day);
      } else {
        store.event.playerHolePos = pos + 1;
        round._meta = round._meta || {};
        round._meta.furthestPos = Math.max(
          +round._meta.furthestPos || 0,
          pos + 1,
        );
        save();
        renderHoleScoring(selected, day);
      }
    };
  }
  function leaderboardPlayerPoints(day, pid) {
    const v = eventCourseScorecard(day,store.event,pid),
      hcp = playerDailyHandicap(pid, day);
    return Array.from({ length: 18 }, (_, i) => {
      const e = findOfficialForPlayer(day, pid, i + 1);
      return stablefordPoints(
        e?.gross,
        +(v.par?.[i] || 0),
        v.index?.[i] ?? "",
        hcp,
      );
    });
  }
  function leaderboardPlayerGross(day, pid) {
    return Array.from({ length: 18 }, (_, i) => {
      const g = findOfficialForPlayer(day, pid, i + 1)?.gross;
      return String(g).toUpperCase() === "P" || g === "" || g == null
        ? null
        : +g;
    });
  }
  function leaderboardUnits(day, type, aggregate = false) {
    const setup = store.event.groupSetup?.["day" + day],
      out = [];
    if (!setup) return out;
    (setup.groups || []).forEach((raw, gi) => {
      const group = raw.map(id=>aggregate ? sharedPositionId(id) : String(id)),
        replacementName = (id, originalId) =>
          originalId === NO_PARTNER_ID
            ? `${eventPlayer(id, day)?.name || "Virtual Player"} (VP for ${eventPlayer(setup.missingPlayerId, day)?.name || "missing player"})`
            : eventPlayerName(id, aggregate ? null : day),
        filled = ambroseIsOn(store.event, day)
          ? group.filter((id) => id !== NO_PARTNER_ID)
          : group
              .map((id) =>
                id === NO_PARTNER_ID ? String(setupForTeam(setup,gi).virtualPlayer || "") : id,
              )
              .filter(Boolean);
      if (type === "team")
        out.push({
          id: `d${day}g${gi}`,
          ids: [...new Set(filled)],
          name: `Group ${gi + 1}`,
          detail: filled
            .map((id, index) => replacementName(id, group[index]))
            .join(", "),
        });
      else
        for (let n = 0; n < 4; n += 2) {
          const ids = group
            .slice(n, n + 2)
            .map((id) =>
              id === NO_PARTNER_ID ? String(setupForTeam(setup,gi).virtualPlayer || "") : id,
            )
            .filter(Boolean);
          if (ids.length)
            out.push({
              id: `d${day}g${gi}p${n / 2}`,
              ids: [...new Set(ids)],
              name: ids
                .map((id, index) =>
                  replacementName(id, group.slice(n, n + 2)[index]),
                )
                .join(" & "),
              detail:
                store.event.days === 1
                  ? `Group ${gi + 1}`
                  : `Day ${day} · Group ${gi + 1}`,
            });
        }
    });
    return out;
  }
  const leaderSum = (values) =>
    values.reduce((n, x) => n + (x == null ? 0 : +x || 0), 0);
  function leaderRow(id, name, detail, holes, target = 18) {
    return {
      id,
      name,
      detail,
      holes,
      total: leaderSum(holes),
      thru: holes.filter((x) => x != null).length,
      target,
      cbHoles: holes,
    };
  }
  function manualLeaderRow(id, name, detail, summary, target = 18) {
    if (!summary || summary.total === "" || summary.total == null) return null;
    const row = {
      id,
      name,
      detail,
      holes: [],
      total: +summary.total,
      thru: target,
      target,
      cbHoles: [],
      manual: true,
    };
    if ([summary.back9, summary.last6, summary.last3].some((value) => value !== "" && value != null))
      row.cbTotals = {
        back9: +(summary.back9 || 0),
        last6: +(summary.last6 || 0),
        last3: +(summary.last3 || 0),
      };
    return row;
  }
  function finalEntryLeaderRow(day, id, kind) {
    const entry = finalScoreEntry(day, id);
    if (!entry || entry.kind !== kind || !Number.isFinite(+entry.total) || !entry.confirmedAt) return null;
    return {id:String(id), name:eventPlayerName(id,day), detail:"Final score entered", holes:[], total:+entry.total, thru:18, target:18, cbHoles:[], finalEntry:true};
  }
  function strokeHoleScores(day, id) {
    const raw = leaderboardPlayerGross(day,id), card = eventCourseScorecard(day,store.event,id), mode = store.event.strokeScoringMode || "allStrokes";
    if (mode === "allStrokes") return raw;
    const extra = mode === "maxTripleBogey" ? 3 : 2;
    return raw.map((gross,index) => gross == null ? null : Math.min(gross,(+card.par?.[index]||0)+extra));
  }
  function leaderCountback(a, b, higher = true) {
    if (a.tripCountback && b.tripCountback) {
      for (let index=0;index<Math.min(a.tripCountback.length,b.tripCountback.length);index++) {
        const diff=b.tripCountback[index]-a.tripCountback[index]; if(diff) return diff;
      }
      return 0;
    }
    if ((a.manual && !a.cbTotals) || (b.manual && !b.cbTotals)) return 0;
    if (a.cbTotals || b.cbTotals) {
      const totals = (row) => {
          if (row.cbTotals) return row.cbTotals;
          const values = row.cbHoles || row.holes || [];
          return {
            back9: leaderSum(values.slice(9, 18)),
            last6: leaderSum(values.slice(12, 18)),
            last3: leaderSum(values.slice(15, 18)),
          };
        },
        at = totals(a),
        bt = totals(b),
        cmp = (x, y) => (higher ? y - x : x - y);
      for (const key of ["back9", "last6", "last3"]) {
        const c = cmp(+(at[key] || 0), +(bt[key] || 0));
        if (c) return c;
      }
      return 0;
    }
    const av = a.cbHoles || a.holes,
      bv = b.cbHoles || b.holes,
      cmp = (x, y) => (higher ? y - x : x - y);
    for (const [s, e] of [
      [9, 18],
      [12, 18],
      [15, 18],
    ]) {
      const c = cmp(leaderSum(av.slice(s, e)), leaderSum(bv.slice(s, e)));
      if (c) return c;
    }
    for (let i = 17; i >= 0; i--) {
      const c = cmp(av[i] ?? 0, bv[i] ?? 0);
      if (c) return c;
    }
    return 0;
  }
  function rankLeaderRows(rows, higher = true, useCountback = false) {
    rows.sort((a, b) => {
      const started = (b.thru > 0) - (a.thru > 0);
      if (started) return started;
      const c = higher ? b.total - a.total : a.total - b.total;
      return (
        c ||
        (useCountback ? leaderCountback(a, b, higher) : 0) ||
        a.name.localeCompare(b.name)
      );
    });
    rows.forEach((r, i) => {
      const prev = rows[i - 1],
        next = rows[i + 1],
        same =
          prev &&
          Boolean(prev.thru) === Boolean(r.thru) &&
          prev.total === r.total &&
          (!useCountback || leaderCountback(prev, r, higher) === 0);
      r.rank = same ? prev.rank : i + 1;
      r.tied = Boolean(
        same ||
          (next &&
            Boolean(next.thru) === Boolean(r.thru) &&
            next.total === r.total &&
            (!useCountback || leaderCountback(r, next, higher) === 0)),
      );
      r.cb = Boolean(
        useCountback &&
          r.thru &&
          i === 0 &&
          rows[1]?.thru &&
          rows[1].total === r.total &&
          leaderCountback(r, rows[1], higher) !== 0,
      );
    });
    return rows;
  }
  function leaderboardDefinitions() {
    const selected = new Set(store.event.competitions || []),
      days = store.event.days || 1,
      defs = [],
      add = (id, label, type, day = 0, opts = {}) =>
        defs.push({ id, label, type, day, scope: day || "overall", ...opts });
    if (
      days === 1 &&
      (selected.has("single") || selected.has("combined"))
    )
      add("single-d1", "Single Stableford", "single", 1, { countback: true });
    if (days > 1 && (selected.has("combined") || selected.has("single"))) {
      const id = selected.has("combined") ? "combined" : "single",
        format = id === "combined" ? store.event.singleStablefordFormat || "aggregate" : "daily",
        selectedDays = competitionDays(id), aggregateOnly = format === "aggregate";
      for (const day of selectedDays) add(`combined-leg-d${day}`, `Single Stableford — Day ${day}`, "single", day, {
        countback: true, awardable: !aggregateOnly, aggregateLeg: aggregateOnly,
      });
      if (format !== "daily") add("combined", `Single Stableford — Best ${countingRounds()} of ${selectedDays.length}`, "combined", 0, {
        countback: true, aggregateResult: true, days: selectedDays,
      });
    }
    for (let day = 1; day <= days; day++) {
      const suffix = days === 1 ? "" : ` — Day ${day}`;
      if (competitionIsOn("stroke", day) && (typeof store.event.strokeDailyResults === "boolean" ? store.event.strokeDailyResults : (store.event.strokeCountingMode || "daily") === "daily")) {
        const finalOnly = dayScoringMethod(day) === "finalGross";
        add(`stroke-net-d${day}`, `Stroke Net${suffix}`, "strokeNet", day, {lower:true,countback:!finalOnly});
      }
      if (competitionIsOn("ambrose", day))
        add(`ambrose-d${day}`, `Ambrose${suffix}`, "ambrose", day, {
          lower: true,
          countback: true,
        });
      if (competitionIsOn("fourball", day))
        add(`fourball-d${day}`, `4BBB${suffix}`, "fourball", day, {
          countback: true,
        });
      if (competitionIsOn("teamPutts", day))
        add(
          `putts-d${day}`,
          `${store.event.puttingFormat === "pairs" ? "Pairs" : "Team"} Putting${suffix}`,
          "putts",
          day,
          { lower: true, countback: true },
        );
      if (competitionIsOn("best3of4", day))
        add(`best3-d${day}`, `Best 3 of 4${suffix}`, "best3", day, { countback: true });
      if (selected.has("yellowBall") && yellowBallIsOn(day))
        add(`yellow-ball-d${day}`, `Yellow Ball${suffix}`, "yellowBall", day);
      if (competitionIsOn("scratch", day) && !["aggregate", "bestAggregate"].includes(store.event.scratchFormat))
        add(`scratch-d${day}`, `Scratch${suffix}`, "scratch", day, {
          lower: true,
          countback: true,
        });
      if (competitionIsOn("ntp", day))
        add(`ntp-d${day}`, `Nearest the Pin${suffix}`, "ntp", day);
    }
    if (selected.has("stroke") && (typeof store.event.strokeAggregateEnabled === "boolean" ? store.event.strokeAggregateEnabled : (store.event.strokeCountingMode || "daily") !== "daily")) {
      const strokeDays = competitionDays("stroke"), best = (store.event.strokeAggregateMode || store.event.strokeCountingMode) === "bestAggregate",
        count = best ? Math.max(1, strokeDays.length - 1) : strokeDays.length,
        label = best ? `Best ${count} of ${strokeDays.length}` : `All ${strokeDays.length} rounds`;
      add("stroke-net-agg", `Stroke Net — ${label}`, "strokeAggregateNet", 0, { lower: true, countback: true, days: strokeDays, count });
    }
    if (selected.has("scratch") && ["aggregate", "bestAggregate"].includes(store.event.scratchFormat)) add("scratch-agg", store.event.scratchFormat === "bestAggregate" ? `Scratch — Best ${Math.max(1, days - 1)} of ${days} rounds` : "Scratch — Aggregate over all days", "scratchaggregate", 0, {lower:true, countback:true, days:eventDays()});
    if (selected.has("capTeams")) add("cap-teams", "Black Cap – White Cap", "capTeams", 0, {days:eventDays()});
    if (selected.has("par3")) {
      const mode = par3Mode();
      if (["overallPlayers", "overallPairs"].includes(mode)) add("par3-agg", mode === "overallPairs" ? `Par 3 Pairs — ${days} Days (Day ${days} partners)` : `Par 3 Individual — ${days} Days`, mode === "overallPairs" ? "par3aggregate" : "par3individualaggregate", 0, {countback:true, days:eventDays()});
      else for (const day of competitionDays("par3")) add(`par3-d${day}`, `Par 3 ${mode === "dailyTeams" ? "Teams" : "Pairs"}${days === 1 ? "" : ` — Day ${day}`}`, mode === "dailyTeams" ? "par3team" : "par3", day, {countback:true});
    }
    if (selected.has("eclectic"))
      selectedEclecticGroups(store.event).forEach((group) =>
        add(`eclectic-${group.key.replace(/[^a-z0-9]+/gi, "-")}`, `Eclectic — ${group.courseName} · Days ${group.days.join(" and ")}`, "eclectic", 0, { countback: true, days: group.days, courseKey: group.key }),
      );
    return defs;
  }
  function calculateLeaderboard(def) {
    const field = (day) =>
        dayFieldIds(day)
          .filter((id) => String(id) !== NO_PARTNER_ID)
          .map(id=>def.day ? String(id) : sharedPositionId(id)),
      points = (day, id) => leaderboardPlayerPoints(day, sharedActualId(id,day)),
      gross = (day, id) => leaderboardPlayerGross(day, sharedActualId(id,day)), finalEntry = (day,id) => store.event?.finalScores?.["day"+day]?.[String(id)] || store.event?.scoring?.["day"+day]?.[String(id)]?._finalScore || null;
    let rows = [];
    if (def.type === "single")
      rows = field(def.day).map((id) => {
        const saved=finalEntry(def.day,id);if(saved?.kind==="stableford"&&saved.confirmedAt&&Number.isFinite(+saved.total))return {id:String(id),name:eventPlayerName(id,def.day),detail:"Final score entered",holes:[],total:+saved.total,thru:18,target:18,cbHoles:[],finalEntry:true};
        const manual = manualPlayerSummary(def.day, id, "single");
        return (
          manualLeaderRow(id, eventPlayerName(id, def.day || null), "", manual) ||
          leaderRow(id, eventPlayerName(id, def.day || null), "", points(def.day, id))
        );
      });
    if (["strokeGross","strokeNet"].includes(def.type))
      rows = field(def.day).map(id => {
        const saved=finalEntry(def.day,id);let row;
        if (saved?.kind==="gross"&&saved.confirmedAt&&Number.isFinite(+saved.total)) row={id:String(id),name:eventPlayerName(id,def.day),detail:"Final score entered",holes:[],total:+saved.total,thru:18,target:18,cbHoles:[],finalEntry:true};
        else row = leaderRow(id,eventPlayerName(id,def.day),"",strokeHoleScores(def.day,sharedActualId(id,def.day)));
        row.grossTotal = row.total;
        row.handicap = playerDailyHandicap(sharedActualId(id,def.day),def.day) || 0;
        if (def.type === "strokeNet") row.total = row.grossTotal - row.handicap;
        row.detail = `${def.type === "strokeNet" ? `Gross ${row.grossTotal} · Hcp ${formatPlayingHandicap(row.handicap)}` : "Gross strokes"}${row.finalEntry ? " · final score entry" : ""}`;
        return row;
      });
    if (["strokeAggregateGross", "strokeAggregateNet"].includes(def.type)) {
      const selectedDays = def.days || competitionDays("stroke"), count = def.count || selectedDays.length,
        net = def.type === "strokeAggregateNet", finished = selectedDays.every(eventDayComplete);
      rows = [...new Set(selectedDays.flatMap(field))].map((id) => {
        const rounds = selectedDays.filter((day) => field(day).includes(id)).map((day) => {
          const actual = sharedActualId(id, day), saved = finalEntry(day, actual), finalGross = saved?.kind === "gross" && saved.confirmedAt && Number.isFinite(+saved.total),
            holes = finalGross ? [] : strokeHoleScores(day, actual), grossTotal = finalGross ? +saved.total : leaderSum(holes),
            handicap = playerDailyHandicap(actual, day) || 0, complete = finalGross || holes.every((value) => value != null),
            total = grossTotal - (net ? handicap : 0);
          return { day, holes, grossTotal, handicap, total, complete, thru: finalGross ? 18 : holes.filter((value) => value != null).length, finalGross };
        }), ranked = [...rounds].sort((a, b) => Number(b.complete) - Number(a.complete) || a.total - b.total || b.day - a.day),
          counted = ranked.filter((round) => round.complete || round.thru > 0).slice(0, count), completed = rounds.filter((round) => round.complete).length,
          latest = [...counted].sort((a, b) => b.day - a.day)[0],
          row = leaderRow(id, eventPlayerName(id), `${count === selectedDays.length ? "All rounds" : `Best ${count} of ${selectedDays.length}`} · ${completed} complete · Counting days ${counted.map((round) => round.day).sort((a, b) => a - b).join(", ") || "—"}`, [], count * 18);
        row.total = leaderSum(counted.map((round) => round.total));
        row.grossTotal = leaderSum(counted.map((round) => round.grossTotal));
        row.handicap = leaderSum(counted.map((round) => round.handicap));
        row.thru = leaderSum(counted.map((round) => round.thru));
        row.cbHoles = latest?.holes || [];
        row.manual = counted.some((round) => round.finalGross);
        row.insufficientRounds = completed < count;
        if (finished && completed < count) {
          row.disqualified = true;
          row.disqualificationReason = `${completed} completed rounds; ${count} required`;
        }
        return row;
      });
    }
    if (def.type === "combined") {
      const selectedDays = def.days || competitionDays("combined"), count = countingRounds();
      rows = [...new Set(selectedDays.flatMap(field))].map(id => {
        const rounds = selectedDays.filter(day => field(day).includes(id)).map(day => {
          const actual=sharedActualId(id,day), final=finalEntry(day,actual), manual = manualPlayerSummary(day, actual, "single"), holes = points(day, id), finalStableford=final?.kind==="stableford"&&final.confirmedAt;
          return {day, manual, final:finalStableford, holes, total: finalStableford ? +final.total : manual ? +manual.total : leaderSum(holes),
            complete: Boolean(finalStableford||manual) || holes.every(value => value != null),
            thru: finalStableford||manual ? 18 : holes.filter(value => value != null).length};
        });
        const ranked = [...rounds].sort((a,b) => Number(b.complete)-Number(a.complete) || b.total-a.total || b.day-a.day),
          counted = ranked.filter(round => round.complete || round.thru > 0).slice(0,count), completed = rounds.filter(round => round.complete).length,
          last = [...counted].sort((a,b) => b.day-a.day)[0],
          row = leaderRow(id, eventPlayerName(id, def.day || null), `Best ${count} of ${selectedDays.length} · ${completed} complete · Counting days ${counted.map(r=>r.day).sort((a,b)=>a-b).join(", ") || "—"}`, [], count*18);
        row.total = counted.reduce((total,round) => total+round.total,0);
        row.thru = counted.reduce((total,round) => total+round.thru,0);
        row.cbHoles = last?.holes || [];
        if (last?.manual) row.cbTotals = {back9:+last.manual.back9||0,last6:+last.manual.last6||0,last3:+last.manual.last3||0};
        if (eventDays().length > 2) row.tripCountback = counted.filter(round=>round.complete).map(round=>round.total).sort((a,b)=>a-b);
        row.manual = counted.some(round=>round.manual||round.final);
        row.insufficientRounds = completed < count;
        // A golfer who sat out too many days remains visible, but is ineligible for the overall prize.
        if (selectedDays.every(eventDayComplete) && completed < count) {
          row.disqualified = true; row.disqualificationReason = `${completed} completed rounds; ${count} required`;
        }
        return row;
      });
    }
    if (def.type === "ambrose")
      rows = leaderboardUnits(def.day, "team").map((unit) => {
        const groupIndex = +String(unit.id).replace(/^d\d+g/, ""),
          roles = ambroseRoles(def.day, groupIndex),
          holes = Array.from({ length: 18 }, (_, index) => {
            const value = scorerStore(def.day, roles.scorerId)?.[
              String(index + 1)
            ]?.self?.gross;
            return scoreEntered(value) ? +value : null;
          }),
          row = leaderRow(unit.id, unit.name, unit.detail, holes),
          handicap = ambroseTeamHandicap(def.day, groupIndex),
          minimum = +store.event.ambroseMinimumDrives || 0,
          driveCounts = ambroseDriveCounts(def.day, groupIndex, roles.scorerId),
          shortDrives = roles.team.filter((id) => (driveCounts[id] || 0) < minimum);
        row.grossTotal = row.total;
        row.handicap = handicap;
        row.disqualified = row.thru === 18 && shortDrives.length > 0;
        row.disqualificationReason = shortDrives
          .map((id) => `${eventPlayerName(id, def.day || null)} ${driveCounts[id] || 0}/${minimum}`)
          .join(" · ");
        row.total =
          row.thru === 18 && handicap != null
            ? row.grossTotal - handicap
            : row.grossTotal;
        return row;
      });
    if (def.type === "capTeams") rows = capTeamRows();
    if (def.type === "scratchaggregate") {
      const days = def.days || eventDays(), max = scratchHandicapLimit(),
        best = store.event.scratchFormat === "bestAggregate",
        count = best ? Math.max(1, days.length - 1) : days.length,
        finished = days.every(eventDayComplete);
      rows = [...new Set(days.flatMap(field))].filter(id => days.some(day => {
        const hcp = playerDailyHandicap(sharedActualId(id,day), day);
        return field(day).includes(id) && (max == null || (hcp != null && hcp <= max));
      })).map(id => {
        const rounds = days.map(day => {
          const card = eventCourseScorecard(day,store.event,id), hcp = playerDailyHandicap(sharedActualId(id,day), day),
            eligible = field(day).includes(id) && (max == null || (hcp != null && hcp <= max)),
            pickup = store.event.scratchScoringMode === "maxDoubleBogey" ? null : scratchPickupHole(day, sharedActualId(id,day)),
            holes = eligible && !pickup ? scratchGrossScores(day, sharedActualId(id,day), card) : Array(18).fill(null),
            toParHoles = holes.map((gross, i) => gross == null ? null : gross - (+card.par?.[i] || 0));
          return { day, eligible, pickup, holes, toParHoles,
            complete: holes.every(gross => gross != null),
            thru: holes.filter(gross => gross != null).length,
            gross: leaderSum(holes), total: leaderSum(toParHoles) };
        });
        const available = rounds.filter(round => round.eligible && !round.pickup),
          completed = available.filter(round => round.complete).length,
          ranked = best ? [...available].sort((a,b) => Number(b.complete) - Number(a.complete) || a.total - b.total || b.day - a.day) : available,
          counted = ranked.filter(round => round.thru > 0).slice(0, count).sort((a,b) => a.day - b.day),
          row = leaderRow(id, eventPlayerName(id, def.day || null), best
            ? `Best ${count} of ${days.length} · ${completed} complete · Counting days ${counted.map(round => round.day).join(", ") || "—"}`
            : "All days · every round required", counted.flatMap(round => round.holes), count * 18);
        row.grossTotal = leaderSum(counted.map(round => round.gross));
        row.total = leaderSum(counted.map(round => round.total));
        row.scratchToPar = row.total;
        row.insufficientRounds = completed < count;
        // Count back on the latest counting round, using scores relative to par
        // so different course pars do not change the tie-break comparison.
        if (best || !retainedLegacyScoringRules()) row.cbHoles = counted.at(-1)?.toParHoles || [];
        const potential = available.filter(round => round.complete || !eventDayComplete(round.day)).length,
          failed = best ? potential < count || (finished && completed < count) : available.length < count;
        if (failed) {
          const pickupRound = rounds.find(round => round.pickup);
          row.disqualified = true;
          row.pickupHole = pickupRound?.pickup || null;
          row.disqualificationReason = best
            ? `${completed} qualifying completed rounds; ${count} required`
            : pickupRound ? `Pick-up on Day ${pickupRound.day}, Hole ${pickupRound.pickup}` : "A qualifying Scratch round is required on every day";
        }
        return row;
      });
    }
    if (def.type === "scratch") {
      const v = eventCourseScorecard(def.day),
        max = scratchHandicapLimit();
      rows = field(def.day)
        .filter((id) => {
          const hcp = playerDailyHandicap(id, def.day);
          return max == null || (hcp != null && hcp <= max);
        })
        .map((id) => {
          const card=eventCourseScorecard(def.day,store.event,id),scores = scratchGrossScores(def.day, id, card),
            r = leaderRow(id, eventPlayerName(id, def.day || null), "", scores),
            pickup =
              store.event?.scratchScoringMode === "maxDoubleBogey"
                ? null
                : scratchPickupHole(def.day, id);
          r.grossTotal = r.total;
          r.total = scores.reduce(
            (n, g, i) => n + (g == null ? 0 : g - (+card.par?.[i] || 0)),
            0,
          );
          r.scratchToPar = r.total;
          if (pickup) {
            r.disqualified = true;
            r.pickupHole = pickup;
          }
          return r;
        });
    }
    if (def.type === "fourball")
      rows = leaderboardUnits(def.day, "pair").map((u) => {
        const manual = manualPairSummary(def.day, u.id, "fourball");
        return (
          manualLeaderRow(u.id, u.name, u.detail, manual) ||
          leaderRow(
            u.id,
            u.name,
            u.detail,
            Array.from({ length: 18 }, (_, i) => {
              const vals = u.ids
                .map((id) => points(def.day, id)[i])
                .filter((x) => x != null);
              return vals.length ? Math.max(...vals) : null;
            }),
          )
        );
      });
    if (def.type === "putts") {
      const kind = store.event.puttingFormat === "pairs" ? "pair" : "team";
      rows = leaderboardUnits(def.day, kind).map((u) => {
        let manual = null;
        const finalPutts=u.ids.map(id=>finalScoreEntry(def.day,id)?.putts);
        if(finalPutts.length&&finalPutts.every(value=>value!==""&&value!=null&&Number.isFinite(+value))) manual={total:leaderSum(finalPutts)};
        if (kind === "team")
          manual = manual || manualTeamSummary(def.day, u.id, "putts");
        else {
          const summaries = u.ids.map((id) =>
            manualPlayerSummary(def.day, id, "putts"),
          );
          if (!manual && summaries.every(Boolean))
            manual = {
              total: leaderSum(summaries.map((x) => +x.total)),
              back9: leaderSum(summaries.map((x) => +x.back9)),
              last6: leaderSum(summaries.map((x) => +x.last6)),
              last3: leaderSum(summaries.map((x) => +x.last3)),
            };
        }
        return (
          manualLeaderRow(u.id, u.name, u.detail, manual) ||
          leaderRow(
            u.id,
            u.name,
            u.detail,
            Array.from({ length: 18 }, (_, i) => {
              const vals = u.ids
                .map((id) => findOfficialForPlayer(def.day, id, i + 1)?.putts)
                .map((x) => (x === "" || x == null ? null : +x));
              return vals.every((x) => x != null) ? leaderSum(vals) : null;
            }),
          )
        );
      });
    }
    if (def.type === "best3")
      rows = leaderboardUnits(def.day, "team").map((u) => {
        const manual = manualTeamSummary(def.day, u.id, "best3");
        return (
          manualLeaderRow(u.id, u.name, u.detail, manual) ||
          leaderRow(
            u.id,
            u.name,
            u.detail,
            Array.from({ length: 18 }, (_, i) => {
              const vals = u.ids
                .map((id) => points(def.day, id)[i])
                .filter((x) => x != null)
                .sort((a, b) => b - a);
              return vals.length >= 3 ? leaderSum(vals.slice(0, 3)) : null;
            }),
          )
        );
      });
    if (def.type === "yellowBall") {
      rows = leaderboardUnits(def.day, "team").map((u, groupIndex) => {
        const team = yellowBallTeam(def.day, groupIndex),
          start = groupStartingHole(store.event, def.day, groupIndex),
          sequence = scoreSequence(start),
          loss = yellowBallLoss(def.day, groupIndex),
          holes = sequence.map((hole, position) => {
            if (loss && position >= loss.position) return null;
            const nominated = yellowBallPlayerForHole(
              def.day,
              groupIndex,
              hole,
            );
            return leaderboardPlayerPoints(def.day, nominated)[hole - 1];
          }),
          row = leaderRow(
            u.id,
            `Team ${groupIndex + 1}`,
            team.map((id) => eventPlayerName(id, def.day)).join(", "),
            holes,
          );
        const manual = submittedManualCard(def.day, groupIndex)?.team?.yellowBall;
        if (manual?.lossHole && manual.total !== "" && manual.total != null) {
          row.total = +manual.total;
          row.thru = loss ? loss.position : 18;
          row.pending = 0;
          row.manual = true;
        }
        row.loss = loss;
        row.survived = loss ? loss.position : row.thru;
        return row;
      });
      rows.sort(
        (a, b) =>
          b.survived - a.survived ||
          b.total - a.total ||
          a.name.localeCompare(b.name),
      );
      rows.forEach((row, index) => {
        const previous = rows[index - 1],
          next = rows[index + 1],
          same =
            previous &&
            previous.survived === row.survived &&
            previous.total === row.total;
        row.rank = same ? previous.rank : index + 1;
        row.tied = Boolean(
          same ||
            (next &&
              next.survived === row.survived &&
              next.total === row.total),
        );
      });
      return rows;
    }
    if (["par3", "par3team"].includes(def.type)) {
      const ix=manualPar3Holes(def.day).map(h=>h-1);
      rows = leaderboardUnits(def.day, def.type === "par3team" ? "team" : "pair").map((u) =>
        leaderRow(
          u.id,
          u.name,
          u.detail,
          ix.map((i) => {
            const vals = u.ids.map((id) => {
              if(+eventCourseScorecard(def.day,store.event,id).par?.[i]!==3)return 0;
              const manual = manualPar3Point(def.day, id, i + 1);
              return manual == null ? points(def.day, id)[i] : manual;
            });
            return vals.every((x) => x != null) ? leaderSum(vals) : null;
          }),
          ix.length,
        ),
      );
    }
    if (["par3aggregate", "par3individualaggregate"].includes(def.type)) {
      const effectivePlayer = (day, id) => {
        id=sharedActualId(id,day);
        const emergency = store.event.emergencyReplacements?.["day" + day];
        return emergency && String(emergency.missingPlayerId) === String(id)
          ? String(emergency.virtualPlayerId || id)
          : String(id);
      };
      const ix = (d) => {
        return manualPar3Holes(d).map(h=>h-1);
      };
      const units = def.type === "par3aggregate" ? leaderboardUnits(store.event.days, "pair", true) : [...new Set(eventDays().flatMap(field))].map(id => ({id, name:eventPlayerName(id, def.day || null), ids:[id]}));
      rows = units.map((u) => {
        const holes = [];
        for (const d of eventDays()) {
          const effectiveIds = u.ids.map((id) => effectivePlayer(d, id)),
            conflictingVirtualPair =
              new Set(effectiveIds).size !== effectiveIds.length;
          ix(d).forEach((i) => {
            if (conflictingVirtualPair) {
              holes.push(null);
              return;
            }
            const vals = effectiveIds.map((effectiveId) => {
              if(+eventCourseScorecard(d,store.event,effectiveId).par?.[i]!==3)return 0;
              if (!field(d).includes(sharedPositionId(effectiveId))) return 0; // A scheduled rest day has no score; pending playing-day scores remain null.
              const manual = manualPar3Point(d, effectiveId, i + 1);
              return manual == null ? points(d, effectiveId)[i] : manual;
            });
            holes.push(vals.every((x) => x != null) ? leaderSum(vals) : null);
          });
        }
        return leaderRow(
          u.id,
          u.name,
          def.type === "par3aggregate" ? `Day ${store.event.days} partnership · all rounds` : "Individual · all rounds",
          holes,
          holes.length,
        );
      });
    }
    if (def.type === "eclectic") {
      const eclecticDays = def.days || [1, 2], firstDay = eclecticDays[0], lastDay = eclecticDays.at(-1);
      rows = field(firstDay)
        .filter((id) => eclecticDays.every((day) => field(day).includes(id)))
        .map((id) => {
          const rounds = eclecticDays.map((day) => points(day, id)), baseline = rounds[0], latest = rounds.at(-1),
            r = leaderRow(
            id,
            eventPlayerName(id, def.day || null),
            `${def.days?.length || 2} rounds · Days ${eclecticDays.join(" and ")}`,
            Array.from({ length: 18 }, (_, i) => {
              const vals = rounds.map((round) => round[i]).filter((x) => x != null);
              return vals.length ? Math.max(...vals) : null;
            }),
          );
          r.pointsGained = r.holes.reduce(
            (total, value, i) =>
              total +
              (value == null || baseline[i] == null
                ? 0
                : Math.max(0, value - baseline[i])),
            0,
          );
          r.thru = latest.filter((value) => value != null).length;
          r.lastDay = lastDay;
          return r;
        });
    }
    if (["scratch", "scratchaggregate", "ambrose", "combined", "strokeAggregateGross", "strokeAggregateNet"].includes(def.type)) {
      const active = rankLeaderRows(
        rows.filter((r) => !r.disqualified),
        !def.lower,
        Boolean(def.countback),
      );
      const disqualified = rows
        .filter((r) => r.disqualified)
        .sort(
          (a, b) => ["scratch", "scratchaggregate"].includes(def.type)
            ? a.pickupHole - b.pickupHole || a.name.localeCompare(b.name)
            : a.name.localeCompare(b.name),
        );
      disqualified.forEach((r) => {
        r.rank = "";
        r.tied = false;
      });
      return [...active, ...disqualified];
    }
    return rankLeaderRows(rows, !def.lower, Boolean(def.countback));
  }
  function eventDayComplete(day) {
    if (manualDayFinalised(day)) return true;
    const field = dayFieldIds(day).filter(
      (id) => String(id) !== NO_PARTNER_ID,
    );
    if (dayScoringMethod(day) === "fullCardPlayer")
      return Boolean(
        field.length && field.every((id) => roundFinalisedFor(day, id)),
      );
    if (dayScoringMethod(day) !== "holeByHole")
      return Boolean(field.length && field.every(id=>finalScoreComplete(day,id)));
    return Boolean(
      field.length && field.every((id) => livePlayerStatus(day, id).finalised),
    );
  }
  function yellowBallViewerGroupIndex(day) {
    if (store.cloud?.role !== "player" || !store.cloud?.playerId) return -1;
    return playerGroupContext(String(store.cloud.playerId), day)?.groupIndex ?? -1;
  }
  function leaderboardComplete(def, rows) {
    const finalised = def.day
      ? eventDayComplete(def.day)
      : (def.days || eventDays()).every(eventDayComplete);
    if (def.type === "ntp")
      return (
        finalised &&
        (manualDayStore(def.day, false)?.ntpFinalised ||
          dayFieldIds(def.day)
            .filter((id) => String(id) !== NO_PARTNER_ID)
            .every((id) =>
              leaderboardPlayerPoints(def.day, id).every((x) => x != null),
            ))
      );
    if (["scratch", "scratchaggregate"].includes(def.type)) {
      const active = rows.filter((r) => !r.disqualified);
      return Boolean(
        finalised && active.length && active.every((r) => r.thru === r.target),
      );
    }
    if (def.type === "yellowBall")
      return Boolean(finalised && rows.length);
    const eligible = rows.filter(row => !row.disqualified);
    if (def.type === "combined" && finalised && rows.length && !eligible.length) return true;
    return Boolean(finalised && eligible.length && eligible.every(row => row.thru === row.target));
  }
  function summaryCompetitionResult(def) {
    if (def.type === "ntp") {
      const holders = ntpHolesInPlayingOrder(def.day).map((h) => ({
          hole: h,
          holder: currentNtpHolder(def.day, h),
        })),
        complete = leaderboardComplete(def, []),
        hasWinner = holders.some((x) => Boolean(x.holder));
      return {
        complete,
        status: complete ? "Completed" : "In Progress",
        text: holders.length
          ? holders.map((x) => ntpSummaryLine(def.day, x.hole, complete)).join(" · ")
          : "Pending",
        awardable: hasWinner,
      };
    }
    const rows = calculateLeaderboard(def),
      top = rows.find((r) => !r.disqualified),
      complete = leaderboardComplete(def, rows);
    if (def.type === "yellowBall" && !complete)
      return {
        complete: false,
        status: "In Progress",
        text: "Result announced at the end of play",
        awardable: def.awardable !== false,
      };
    if (def.type === "combined" && complete && !top) return {complete:true,status:"Completed",text:"No golfer completed the required number of rounds",awardable:false};
    if (!top || (!top.thru && def.type !== "yellowBall"))
      return {
        complete: false,
        status: "Not Started",
        text:
          def.type === "scratch" && rows.some((r) => r.disqualified)
            ? "No eligible competitor remains"
            : "Not started",
        awardable: def.awardable !== false,
      };
    const teamMembers =
      (def.type === "best3" ||
        def.type === "ambrose" ||
        def.type === "yellowBall" ||
        (def.type === "putts" && store.event.puttingFormat !== "pairs")) &&
      top.detail
        ? ` (${top.detail})`
        : "";
    const scratchScore =
      top.scratchToPar === 0
        ? "E"
        : top.scratchToPar > 0
          ? `+${top.scratchToPar}`
          : `−${Math.abs(top.scratchToPar)}`;
    const result =
      ["scratch", "scratchaggregate"].includes(def.type)
        ? complete
          ? `${top.grossTotal} strokes (${scratchScore})`
          : `${scratchScore} · Thru ${top.thru}`
        : def.type === "ambrose"
          ? top.thru === top.target && top.handicap != null
            ? `${complete ? "" : "Provisional leader — "}${top.grossTotal} gross · ${top.handicap.toFixed(1)} hcp · ${top.total.toFixed(1)} net`
            : `${top.grossTotal} gross · Thru ${top.thru}`
        : def.type === "yellowBall"
          ? top.loss
            ? `${top.total} pts · ball lost on Hole ${top.loss.hole}`
            : `${top.total} pts · all 18 holes completed`
          : `${top.total} ${def.type === "putts" ? "putts" : ["strokeGross","strokeNet"].includes(def.type) ? "strokes" : "pts"}`;
    const resultText = def.aggregateLeg
      ? `${top.name} led Day ${def.day} of the Event — ${result}${top.cb ? " CB" : ""}`
      : def.aggregateResult
        ? `${top.name} — Aggregate ${result}${top.cb ? " CB" : ""}`
        : `${top.name}${teamMembers} — ${result}${top.cb ? " CB" : ""}`;
    return {
      complete,
      status: complete ? "Completed" : "In Progress",
      text: resultText,
      awardable: def.awardable !== false,
    };
  }
  function competitionWinnerIds(def) {
    if (def.type === "ntp")
      return [
        ...new Set(
          ntpHolesFor(def.day)
            .map((hole) => currentNtpHolder(def.day, hole)?.id)
            .filter(Boolean)
            .map(String),
        ),
      ];
    const rows = calculateLeaderboard(def).filter((row) => !row.disqualified);
    if (!leaderboardComplete(def, rows) || !rows.length) return [];
    const winners = rows.filter((row) => row.rank === 1);
    if (["single", "combined", "scratch", "scratchaggregate", "par3individualaggregate", "eclectic"].includes(def.type))
      return winners.flatMap(row=>!def.day && GolfSharedPositions.members(store.event,sharedPositionId(row.id)).length ? GolfSharedPositions.members(store.event,sharedPositionId(row.id)) : [String(row.id)]);
    if (def.type === "capTeams") return winners.flatMap(row => (store.event.capTeams?.[row.id] || []).flatMap(id=>GolfSharedPositions.members(store.event,sharedPositionId(id)).length ? GolfSharedPositions.members(store.event,sharedPositionId(id)) : [id])).map(String);
    if (def.type === "yellowBall")
      return [
        ...new Set(
          winners.flatMap((row) => {
            const groupIndex = +String(row.id).replace(/^d\d+g/, "");
            return yellowBallTeam(def.day, groupIndex);
          }),
        ),
      ].map(String);
    const kind =
      def.type === "best3" || def.type === "par3team" ||
      def.type === "ambrose" ||
      def.type === "yellowBall" ||
      (def.type === "putts" && store.event.puttingFormat !== "pairs")
        ? "team"
        : "pair";
    const day = def.day || (def.type === "par3aggregate" ? store.event.days : 1);
    const units = leaderboardUnits(day, kind, !def.day);
    return [
      ...new Set(
        winners.flatMap(
          (row) => units.find((unit) => unit.id === row.id)?.ids || [],
        ),
      ),
    ].flatMap(id=>!def.day && GolfSharedPositions.members(store.event,sharedPositionId(id)).length ? GolfSharedPositions.members(store.event,sharedPositionId(id)) : [String(id)]);
  }
  function buildFinalPlayerMessages(defs) {
    const outcomes = {};
    [...new Set(eventDays().flatMap(dayFieldIds))]
      .filter(id=>String(id)!==NO_PARTNER_ID).forEach(id=>outcomes[String(id)]=[]);
    defs.forEach((def) =>
      competitionWinnerIds(def).forEach((id) => {
        if (outcomes[id] && !outcomes[id].includes(def.label))
          outcomes[id].push(def.label);
      }),
    );
    return outcomes;
  }
  function finalMessageForPlayer(id) {
    const first = playerFirstName(id);
    return {
      heading: `Thanks for joining this Golf Event, ${first}. It is hoped you can join other events in the future.`,
      message: "",
      scoringCredit: "Scoring run on Away Golf Scorer",
    };
  }
  async function confirmResultsAndCloseEvent() {
    const guestClosingEvent = isGuestOrganiser();
    if (store.cloud?.eventId) {
      const refreshed = await syncCloudNow();
      if (!refreshed) {
        alert("The event cannot be closed until the latest online scorecards have been reloaded successfully.");
        return;
      }
    }
    const requiredDays = Array.from(
      { length: store.event.days || 1 },
      (_, index) => index + 1,
    );
    const unfinishedDays = requiredDays.filter(
      (day) => !eventDayComplete(day),
    );
    if (unfinishedDays.length) {
      alert(
        `The event cannot be closed yet. ${unfinishedDays.map((day) => `Day ${day}`).join(" and ")} scoring is still incomplete.`,
      );
      return;
    }
    const defs = leaderboardDefinitions(),
      incomplete = defs.filter(
        (def) => !summaryCompetitionResult(def).complete,
      );
    if (incomplete.length) {
      alert(
        `Results cannot be confirmed yet. Still in progress: ${incomplete.map((d) => d.label).join(", ")}.`,
      );
      return;
    }
    if (
      !confirm(
        "Confirm all results and close this event? Personal finishing messages will then appear on players' phones.",
      )
    )
      return;
    store.event.finalResults = {
      scoringRulesVersion: 2,
      confirmedAt: new Date().toISOString(),
      outcomes: buildFinalPlayerMessages(defs),
    };
    store.event.status = "complete";
    recordCompletedEventHistory(store.event);
    persistStore();
    const closedOnline = await updateCloudEvent();
    if (guestClosingEvent && closedOnline) {
      endGuestOrganiserSession(
        "The event has been closed successfully. Your single-event Guest Organiser access has now ended.",
      );
      return;
    }
    renderLeaderboard();
    renderHome();
  }
  async function archiveCompletedEvent() {
    if (!store.event?.finalResults?.confirmedAt) return alert("Confirm the final results before archiving this event.");
    const eventName=store.event.name||"this completed event",cloudEventId=String(store.cloud?.eventId||"");
    if(!confirm(`Close and archive ${eventName}?\n\nFinal results will remain in Past Events. The published event will close and connected player phones will be released for their next event.`))return;
    const button=$("#archiveCompletedEvent");
    if(button){button.disabled=true;button.textContent="ARCHIVING…";}
    try {
      if(cloudEventId){
        const latest=await cloudTimeout(AwayCloud.loadEvent(cloudEventId));
        const cloudResultsConfirmed=Boolean(latest?.event?.event_data?.event?.finalResults?.confirmedAt);
        if(!cloudResultsConfirmed){
          const saved=await updateCloudEvent();
          if(!saved)throw new Error("The final results could not be confirmed online. Use Retry Sync and try again.");
        }
        await AwayCloud.archiveEvent(cloudEventId);
        await AwayCloud.saveWorkspace({activePublishedEvent:null});
        forgetPublishedEvent(cloudEventId);
      }
      store.event.archivedAt=new Date().toISOString();
      captureCurrentEvent();
      const workspaceId=String(store.event.workspaceId||store.activeEventId||"");
      const record=store.eventWorkspace?.find(item=>String(item.id)===workspaceId);
      if(record){record.archived=true;record.updatedAt=new Date().toISOString();}
      closeCloudConnection();
      forgetOrganiserEvent();
      workspaceShrinkAuthorised=true;
      store.event=null;
      store.activeEventId=null;
      delete store.cloud;
      store.cloudPlayers=[];
      persistStore();
      applyDeviceRole();
      renderHome();
      renderPlayerExperience();
      renderLeaderboard();
      nav("home");
      setCloudMessage("Completed event archived · results retained in Past Events");
      alert(`${eventName} is now archived. Final results remain available in Past Events and connected phones will return to player entry.`);
    } catch(error) {
      if(button){button.disabled=false;button.textContent="CLOSE AND ARCHIVE COMPLETED EVENT";}
      alert("The event was not archived. "+(error.message||error));
    }
  }
  function leaderboardBenefitId(def) {
    if (def.type === "single") return "dailyStableford";
    return (
      {
        combined: "overallStableford",
        fourball: "fourball",
        putts: "teamPutts",
        best3: "best3of4",
        ambrose: "ambrose",
        yellowBall: "yellowBall",
        scratch: "scratch",
        ntp: "ntp",
        par3: "par3",
        par3aggregate: "par3",
        par3individualaggregate: "par3",
        par3team: "par3",
        scratchaggregate: "scratch",
        capTeams: "capTeams",
        eclectic: "eclectic",
      }[def.type] || def.type
    );
  }
  function summaryPrizeDetails(def) {
    if (def.awardable === false) return {id:leaderboardBenefitId(def),text:"Not Applicable",configured:false,awarded:false};
    const id = leaderboardBenefitId(def),
      text = competitionBenefitText(id, store.event.benefits),
      configured = text !== "Prize not set",
      displayText =
        def.type === "ntp" && store.event?.ntpJackpot && configured
          ? "Shown by NTP hole above"
          : text;
    return {
      id,
      text: displayText,
      configured,
      awarded: Boolean(store.event.prizesAwarded?.[def.id]),
    };
  }
  async function setPrizeAwarded(defId, awarded) {
    store.event.prizesAwarded = store.event.prizesAwarded || {};
    if (awarded)
      store.event.prizesAwarded[defId] = {
        awardedAt: new Date().toISOString(),
      };
    else delete store.event.prizesAwarded[defId];
    writeLocalStore();
    renderLeaderboard();
    if (store.cloud?.role === "organiser" && store.cloud?.eventId)
      await updateCloudEvent();
  }
  function renderLeaderboardSummary(host, defs, viewTabs) {
    const groups = [
      ...eventDays().map(day => ({title: `${store.event.days===1?"Event Results":`Day ${day} Results`}${course(store.event["course"+day])?.name ? ` — ${course(store.event["course"+day]).name}` : ""}`, defs:defs.filter(d=>d.scope===day)})),
      {title:"Overall Event Results",defs:defs.filter(d=>d.scope==="overall")},
    ].filter(group=>group.defs.length);
    const organiser = !store.event.pastEventReadOnly && !["player","spectator"].includes(store.cloud?.role),
      eventComplete = eventDays().every(eventDayComplete),
      eventClosed = Boolean(store.event.finalResults?.confirmedAt);
    let eventControl = "";
    if (organiser && eventClosed) {
      eventControl = `<section class="finishControl"><h3>Event Closed — Messages Ready</h3><p>The confirmed results and personal finishing messages are now available on every connected player phone.</p><div class="finishMessagePreview">${dayFieldIds(1)
        .filter((id) => String(id) !== NO_PARTNER_ID)
        .map((id) => {
          const m = finalMessageForPlayer(id);
          return `<div><b>${esc(player(id)?.name || "Player")}</b><span>${esc(m.heading)}${m.message ? ` ${esc(m.message)}` : ""}<small class="scoringCredit">${esc(m.scoringCredit)}</small></span></div>`;
        })
        .join("")}</div><button class="finishEventBtn" id="archiveCompletedEvent">CLOSE AND ARCHIVE COMPLETED EVENT</button><p>Final results remain available in Past Events. Connected phones are released for their next event.</p></section>`;
    } else if (organiser && !eventComplete && eventDays().some(eventDayComplete)) {
      const next = eventDays().find(day=>!eventDayComplete(day));
      eventControl = `<section class="finishControl dayCompleteControl"><h3>Completed days can be awarded — Event Remains Open</h3><p>Complete the remaining days before closing the trip.</p><button class="finishEventBtn" id="openNextDayBtn" data-nextday="${next}">OPEN DAY ${next}</button></section>`;
    } else if (organiser && !eventComplete) {
      eventControl = `<section class="finishControl eventInProgress"><h3>Event In Progress</h3><p>Complete the remaining scoring before closing the event. Prizes for a completed day can still be awarded above.</p></section>`;
    } else if (organiser) {
      eventControl = `<section class="finishControl"><h3>Finish the Event</h3><p>Review the results, record the prizes, then confirm the results and close the event.</p><button class="finishEventBtn" id="finishEventBtn">CONFIRM RESULTS &amp; CLOSE EVENT</button></section>`;
    }
    const pastEventNotice = store.event.pastEventReadOnly
      ? '<div class="cloudNote"><b>Past Event Results</b><span>This is a disconnected saved copy. Its old player join code remains inactive.</span></div>'
      : "";
    host.innerHTML = `${pastEventNotice}<div class="leaderHead"><div><h2>Results Summary</h2><p>${esc(store.event.name)} · ${store.event.pastEventReadOnly ? "retained final results" : "winners and prize giving"}</p></div>${store.event.pastEventReadOnly ? "" : '<button class="soft leaderRefresh" id="leaderRefresh">Refresh</button>'}</div>${viewTabs}<div class="summaryGroups">${groups
      .map(
        (g) =>
          `<section class="summaryCard"><h3>${g.title}</h3>${g.defs
            .map((d) => {
              const r = summaryCompetitionResult(d),
                p = summaryPrizeDetails(d),
                awardable = r.awardable !== false;
              return `<div class="summaryResult ${awardable && p.awarded ? "awarded" : ""}" data-summaryopen="${d.id}" role="button" tabindex="0"><span class="summaryEvent"><b>${esc(d.label)}</b><small>${esc(r.status || (r.complete ? "Completed" : "In Progress"))}</small></span><span class="summaryOutcome"><strong>${["scratch", "scratchaggregate"].includes(d.type) ? esc(r.text).replace(/−(?=\d)/g, '<span class="scratchMinus">−</span>') : esc(r.text)}</strong>${awardable ? `<small class="summaryPrize ${p.configured ? "" : "notSet"}">Prize: ${esc(p.text)}</small>` : ""}</span><span class="summaryActions">${awardable && p.awarded ? `<button class="prizeAwarded" data-prizeaward="${d.id}" data-awarded="1">✓ Awarded</button>` : organiser && awardable && r.complete && p.configured ? `<button class="prizeAward" data-prizeaward="${d.id}">✓ Award Prize</button>` : ""}<em>›</em></span></div>`;
            })
            .join("")}</section>`,
      )
      .join("")}</div>${eventControl}<p class="leaderNote">Tap a result to open its full standings. Awarded prizes remain recorded here and are shared with connected phones.</p>`;
    $$("[data-summaryopen]").forEach((b) => {
      const open = () => {
        const d = defs.find((x) => x.id === b.dataset.summaryopen);
        store.event.leaderboardView =
          d?.scope === "overall"
            ? eventDays().length
            : d?.scope || 1;
        store.event.leaderboardTab = b.dataset.summaryopen;
        writeLocalStore();
        renderLeaderboard();
      };
      b.onclick = (e) => {
        if (!e.target.closest("[data-prizeaward]")) open();
      };
      b.onkeydown = (e) => {
        if (
          (e.key === "Enter" || e.key === " ") &&
          !e.target.closest("[data-prizeaward]")
        ) {
          e.preventDefault();
          open();
        }
      };
    });
    $$("[data-prizeaward]").forEach(
      (b) =>
        (b.onclick = async (e) => {
          e.stopPropagation();
          const wasAwarded = b.dataset.awarded === "1";
          if (
            wasAwarded &&
            !confirm("Change this prize back to not yet awarded?")
          )
            return;
          await setPrizeAwarded(b.dataset.prizeaward, !wasAwarded);
        }),
    );
    if ($("#leaderRefresh"))
      $("#leaderRefresh").onclick = async () => {
        await syncCloudNow();
        renderLeaderboard();
      };
    if ($("#finishEventBtn"))
      $("#finishEventBtn").onclick = confirmResultsAndCloseEvent;
    if ($("#archiveCompletedEvent"))
      $("#archiveCompletedEvent").onclick = archiveCompletedEvent;
    if ($("#openNextDayBtn"))
      $("#openNextDayBtn").onclick = () => {
        store.event.leaderboardView = +$("#openNextDayBtn").dataset.nextday;
        writeLocalStore();
        renderLeaderboard();
      };
  }
  function renderLeaderboard() {
    const host = $("#leaderboardExperience");
    const previousTabScroll = host?.querySelector(".leaderTabs")?.scrollLeft ?? +(store.event?.leaderboardScrollLeft || 0);
    if (!host) return;
    if (!store.event) {
      host.innerHTML =
        '<div class="card"><h2>Leaderboard</h2><p>Create an event first.</p></div>';
      return;
    }
    const defs = leaderboardDefinitions();
    if (!defs.length) {
      host.innerHTML =
        '<div class="card"><h2>Leaderboard</h2><p>No scored competitions were selected for this event.</p></div>';
      return;
    }
    const days = store.event.days || 1;
    let view =
      store.event.leaderboardView ||
      Math.min(
        days,
        store.event.playerPreviewDay || store.event.activeGroupDay || 1,
      );
    if (days === 1 && view !== "summary") view = 1;
    store.event.leaderboardView = view;
    const viewTabs = `<div class="leaderViewTabs multiDayTabs">${eventDays().map(day=>`<button data-leaderview="${day}" class="${+view===day?"active":""}">${days===1?"Today":`Day ${day}`}</button>`).join("")}<button data-leaderview="summary" class="${view==="summary"?"active":""}">Summary</button></div>`;
    if (view === "summary") {
      renderLeaderboardSummary(host, defs, viewTabs);
      $$("[data-leaderview]").forEach(
        (b) =>
          (b.onclick = () => {
            store.event.leaderboardView =
              b.dataset.leaderview === "summary"
                ? "summary"
                : +b.dataset.leaderview;
            writeLocalStore();
            renderLeaderboard();
          }),
      );
      return;
    }
    const visible = defs.filter(
      (d) =>
        d.scope === +view ||
        (d.scope === "overall"),
    );
    let active = store.event.leaderboardTab || visible[0]?.id;
    if (!visible.some((d) => d.id === active)) active = visible[0]?.id;
    store.event.leaderboardTab = active;
    const def = visible.find((d) => d.id === active);
    const tabs = `<div class="leaderTabs">${visible.map((d) => `<button data-leadertab="${d.id}" class="${d.id === active ? "active" : ""}">${esc(d.label)}</button>`).join("")}</div>`;
    let body = "";
    if (def.type === "ntp") {
      const ntpComplete = leaderboardComplete(def, []);
      body =
        ntpHolesInPlayingOrder(def.day)
          .map((h) => {
            const history = ntpHistory(def.day, h);
            return `<section class="ntpHistoryBlock"><h4>Hole ${h}</h4>${
              history.length
                ? history
                    .map((entry, i) => {
                      const winner = i === history.length - 1,
                        time = new Date(entry.at).toLocaleTimeString("en-AU", {
                          hour: "numeric",
                          minute: "2-digit",
                        });
                      return `<div class="ntpHistoryEntry ${winner ? "winner" : ""}"><span>${winner ? "<b>Winner:</b> " : ""}${esc(eventPlayerName(entry.id,def.day))}</span><time>${esc(time)}</time></div>`;
                    })
                    .join("")
                : manualDayStore(def.day, false)?.ntp?.[String(h)]
                  ? "<p>Winner input manually</p>"
                  : "<p>No confirmed holder yet</p>"
            }<p class="ntpPrizeResult">${esc(ntpSummaryLine(def.day, h, ntpComplete))}</p></section>`;
          })
          .join("") || '<div class="leaderEmpty">No NTP holes selected.</div>';
    } else {
      const rows = calculateLeaderboard(def),
        competitionComplete = leaderboardComplete(def, rows),
        unit = def.type === "putts" ? "putts" : ["strokeGross","strokeNet"].includes(def.type) ? "strokes" : def.type === "ambrose" ? "net" : "pts",
        toPar = (n) => (n === 0 ? "E" : n > 0 ? `+${n}` : `<span class="scratchMinus">−</span>${Math.abs(n)}`);
      body =
        def.type === "yellowBall" && !competitionComplete
          ? (() => {
              const viewerGroup = yellowBallViewerGroupIndex(def.day);
              if (viewerGroup < 0)
                return '<div class="leaderEmpty yellowBallHidden"><b>Result announced at the end of play</b><span>Yellow Ball standings remain hidden until every scorecard for the day is complete.</span></div>';
              return [...rows]
                .sort(
                  (a, b) =>
                    +String(a.id).replace(/^d\d+g/, "") -
                    +String(b.id).replace(/^d\d+g/, ""),
                )
                .map((r) => {
                  const groupIndex = +String(r.id).replace(/^d\d+g/, ""),
                    ownTeam = groupIndex === viewerGroup,
                    ownStatus = r.loss
                      ? `Ball lost on Hole ${r.loss.hole} · ${r.survived} holes survived`
                      : `Ball alive · Thru ${r.thru}`;
                  return `<div class="leaderRow ${ownTeam ? "yellowBallOwnTeam" : "yellowBallOpponent"}"><span class="leaderRank">${ownTeam ? "YOU" : "—"}</span><span class="leaderName">${esc(r.name)}${r.detail ? `<small>${esc(r.detail)}</small>` : ""}</span><span class="leaderScore">${ownTeam ? `${r.total} <small>pts</small>` : "—"}</span><span class="leaderThru">${ownTeam ? ownStatus : "Score hidden until end of play"}</span></div>`;
                })
                .join("");
            })()
          : rows
          .map((r, i) => {
            const waiting =
                (def.type === "putts" || def.type === "best3") && !r.thru,
              rowComplete = r.thru === r.target,
              isFinal =
                competitionComplete &&
                (def.type === "yellowBall" || rowComplete),
              score =
                ["scratch", "scratchaggregate"].includes(def.type)
                  ? isFinal
                    ? `${r.grossTotal} <small>strokes (${toPar(r.scratchToPar)})</small>`
                    : toPar(r.scratchToPar)
                  : def.type === "ambrose"
                    ? rowComplete && r.handicap != null
                      ? `${r.total.toFixed(1)} <small>net</small>`
                      : `${r.grossTotal} <small>gross</small>`
                    : `${r.total} <small>${unit}</small>`;
            if (r.disqualified)
              return `<div class="leaderRow scratchDisqualified"><span class="leaderRank">—</span><span class="leaderName">${esc(r.name)}<small>${def.type === "combined" ? "Not eligible for overall prize" : def.type === "ambrose" ? "Required Drives Not Recorded" : "Withdrawn from this Competition"}</small></span><span class="leaderScore">—</span><span class="leaderThru">${["ambrose","combined","scratchaggregate"].includes(def.type) ? esc(r.disqualificationReason || "Requirements not satisfied") : `Pick-up on Hole ${r.pickupHole}`}</span></div>`;
            const progress =
              def.type === "yellowBall"
                ? r.loss
                  ? `Ball lost · Hole ${r.loss.hole} · ${r.survived} survived`
                  : isFinal
                    ? "Final · Ball completed 18 holes"
                    : `Ball alive · Thru ${r.thru}`
                : def.type === "ambrose" && rowComplete && !competitionComplete
                  ? `${r.grossTotal} gross · ${r.handicap == null ? "no handicap" : `${r.handicap.toFixed(1)} hcp`} · Provisional`
                : isFinal
                  ? "Final"
                  : `Thru ${r.thru}`;
            return `<div class="leaderRow ${def.type === "eclectic" ? "eclecticGainRow" : ""} ${i === 0 && competitionComplete && (r.thru || def.type === "yellowBall") ? "winner" : ""} ${waiting ? "waitingMarker" : ""}"><span class="leaderRank">${r.tied ? "T" : ""}${r.rank}</span><span class="leaderName">${esc(r.name)}${def.type === "eclectic" ? `<small><b>Points Gained</b> ${r.pointsGained} pts</small>` : r.detail ? `<small>${esc(r.detail)}</small>` : ""}</span><span class="leaderScore">${waiting ? "—" : `${score}${r.cb ? " <small>CB</small>" : ""}`}</span><span class="leaderThru">${waiting ? "Waiting for Marker to Score" : progress}</span></div>`;
          })
          .join("") ||
        '<div class="leaderEmpty">No eligible Scratch players are available.</div>';
    }
    const par3Day = Math.min(eventDays().length, Math.max(1, +view || 1)),
      par3Version = eventCourseScorecard(par3Day),
      par3Count = (par3Version.par || []).filter((par) => +par === 3).length,
      par3Total = ["par3", "par3team", "par3aggregate", "par3individualaggregate"].includes(def.type)
        ? `<span class="par3Total">Total Par 3 Holes <b>${def.day ? par3Count : eventDays().reduce((n,day) => n + (eventCourseScorecard(day).par || []).filter(p => +p === 3).length,0)}</b></span>`
        : "";
    const pastEventNotice = store.event.pastEventReadOnly
      ? '<div class="cloudNote"><b>Past Event Results</b><span>This is a disconnected saved copy. Its old player join code remains inactive.</span></div>'
      : "";
    host.innerHTML = `${pastEventNotice}<div class="leaderHead"><div><h2>${store.event.pastEventReadOnly ? "Final Results" : "Live Leaderboard"}</h2><p>${esc(store.event.name)}${store.event.pastEventReadOnly ? " · retained event record" : " · official marker scores update as they arrive"}</p></div>${store.event.pastEventReadOnly ? "" : '<button class="soft leaderRefresh" id="leaderRefresh">Refresh</button>'}</div>${viewTabs}${tabs}<div class="leaderCard ${def.type === "yellowBall" ? "yellowBallLeaderboard" : ""}"><div class="leaderTitle"><div><h3>${esc(def.label)}${def.day && course(store.event["course"+def.day])?.name ? ` — ${esc(course(store.event["course"+def.day]).name)}` : ""}</h3><span>${def.countback ? "Automatic countback" : "Live standings"}</span></div>${par3Total}</div>${body}</div><p class="leaderNote">Live positions are provisional. <b>“Thru”</b> is the number of holes with official marker scores, regardless of the starting hole. Pending holes are never counted as zero. Scratch is shown against par during play and as gross strokes when final. Finalisation also requires the player’s checking scores to agree. CB means countback.</p>`;
    const tabStrip = host.querySelector(".leaderTabs");
    if (tabStrip) tabStrip.scrollLeft = previousTabScroll;
    $$("[data-leaderview]").forEach(
      (b) =>
        (b.onclick = () => {
          store.event.leaderboardView =
            b.dataset.leaderview === "summary"
              ? "summary"
              : +b.dataset.leaderview;
          store.event.leaderboardTab = "";
          writeLocalStore();
          renderLeaderboard();
        }),
    );
    $$("[data-leadertab]").forEach(
      (b) =>
        (b.onclick = () => {
          store.event.leaderboardScrollLeft = b.parentElement?.scrollLeft || 0;
          store.event.leaderboardTab = b.dataset.leadertab;
          writeLocalStore();
          renderLeaderboard();
        }),
    );
    if ($("#leaderRefresh"))
      $("#leaderRefresh").onclick = async () => {
        await syncCloudNow();
        renderLeaderboard();
      };
  }
  function renderFullCardPlayerEntry(selected, day) {
    const host = $("#playerExperience"),
      person = eventPlayer(selected, day),
      c = course(store.event["course" + day]),
      card = eventCourseScorecard(day, store.event, selected),
      puttsRequired = competitionIsOn("teamPutts", day),
      dayKey = "day" + day,
      playerKey = String(selected);
    store.event.fullCardDrafts = store.event.fullCardDrafts || {};
    store.event.fullCardDrafts[dayKey] =
      store.event.fullCardDrafts[dayKey] || {};
    const draft = (store.event.fullCardDrafts[dayKey][playerKey] =
      store.event.fullCardDrafts[dayKey][playerKey] || { holes: {} });
    const rows = Array.from({ length: 18 }, (_, index) => {
      const hole = index + 1,
        saved = draft.holes[hole] || {};
      return `<div class="fullCardEntryRow"><b>${hole}</b><span>${esc(card.par?.[index] || "—")}</span><span>${esc(card.index?.[index] || "—")}</span><input data-fullgross="${hole}" inputmode="text" maxlength="2" value="${esc(saved.gross ?? "")}" placeholder="–" aria-label="Hole ${hole} gross strokes">${puttsRequired ? `<input data-fullputts="${hole}" inputmode="numeric" maxlength="1" value="${esc(saved.putts ?? "")}" placeholder="–" aria-label="Hole ${hole} putts">` : ""}</div>`;
    }).join("");
    host.innerHTML = `<div class="fullCardPlayerEntry"><div class="playerEventHero"><span>AFTER-ROUND SCORECARD</span><h1>${esc(store.event.name)}</h1>${store.event.days > 1 ? `<h3>DAY ${day}</h3>` : ""}<p>${esc(c?.name || "Course")}</p></div><div class="playerCard"><div class="playerCardTitle">FULL CARD ENTRY</div><h2>${esc(person?.name || "Player")}</h2><p>After completing the round, copy the gross score from your separate score card for every hole. Enter <b>P</b> or <b>–</b> for a pickup.${puttsRequired ? " Putts are required for today’s Putting Competition." : ""}</p><div class="fullCardEntryGrid ${puttsRequired ? "withPutts" : ""}"><div class="fullCardEntryHead"><span>Hole</span><span>Par</span><span>Index</span><span>Gross</span>${puttsRequired ? "<span>Putts</span>" : ""}</div>${rows}</div><p class="fullCardDraftNote">Entries are saved on this device while you work. Results appear after you confirm the completed card.</p><button class="startRoundBtn" id="confirmFullPlayerCard">CONFIRM COMPLETED SCORECARD</button><button class="soft" id="backFromFullPlayerCard">Back to Round</button></div></div>`;
    const normaliseGross = (value) => {
      const text = String(value ?? "").trim().toUpperCase();
      return text === "-" || text === "–" ? "P" : text;
    };
    const fields = $$('[data-fullgross], [data-fullputts]');
    fields.forEach((input, index) => {
      input.oninput = () => {
        const hole = +(input.dataset.fullgross || input.dataset.fullputts),
          row = (draft.holes[hole] = draft.holes[hole] || {});
        if (input.dataset.fullgross)
          row.gross = normaliseGross(input.value);
        else row.putts = input.value.trim();
        persistStore();
      };
      input.onkeydown = (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        fields[index + 1]?.focus();
        fields[index + 1]?.select();
      };
    });
    $("#backFromFullPlayerCard").onclick = () => {
      store.event.playerRoundMode = "preview";
      save();
      renderPlayerExperience();
    };
    $("#confirmFullPlayerCard").onclick = () => {
      const invalid = [];
      for (let hole = 1; hole <= 18; hole++) {
        const row = draft.holes[hole] || {},
          gross = normaliseGross(row.gross),
          putts = String(row.putts ?? "").trim(),
          validGross =
            gross === "P" ||
            (Number.isInteger(+gross) && +gross >= 1 && +gross <= 20),
          validPutts =
            !puttsRequired ||
            (putts !== "" &&
              Number.isInteger(+putts) &&
              +putts >= 0 &&
              +putts <= 9 &&
              (gross === "P" || +putts <= +gross));
        if (!validGross || !validPutts) invalid.push(hole);
      }
      if (invalid.length)
        return alert(
          `Complete and check Hole${invalid.length === 1 ? "" : "s"} ${invalid.join(", ")} before confirming the card.`,
        );
      const grossTotal = Array.from({ length: 18 }, (_, index) => {
        const gross = normaliseGross(draft.holes[index + 1].gross);
        return gross === "P" ? +(card.par?.[index] || 0) + 2 : +gross;
      }).reduce((total, value) => total + value, 0);
      if (
        !confirm(
          `Confirm the complete 18-hole card for ${person?.name || "this player"}?\n\nGross total: ${grossTotal}\n\nThe card will be sent to the leaderboard and cannot be edited by the player after confirmation.`,
        )
      )
        return;
      const confirmedAt = new Date().toISOString();
      for (let hole = 1; hole <= 18; hole++) {
        const saved = draft.holes[hole],
          gross = normaliseGross(saved.gross),
          putts = puttsRequired ? +saved.putts : "",
          record = scoreRecord(day, selected, hole);
        record.self = { playerId: playerKey, gross, putts };
        record.official = { playerId: playerKey, gross, putts };
      }
      const round = scorerStore(day, selected);
      round._meta = {
        ...(round._meta || {}),
        finalisedAt: confirmedAt,
        fullCardEnteredByPlayer: true,
      };
      store.event.roundFinalised = store.event.roundFinalised || {};
      store.event.roundFinalised[dayKey] =
        store.event.roundFinalised[dayKey] || {};
      store.event.roundFinalised[dayKey][playerKey] = confirmedAt;
      delete store.event.fullCardDrafts[dayKey][playerKey];
      store.event.playerRoundMode = "completed";
      queueCloudRound(day, selected);
      persistStore();
      if (store.cloud?.role === "organiser") void updateCloudEvent();
      renderPlayerExperience();
    };
  }
  function renderFinalScoreEntry(selected, day) {
    const host=$("#playerExperience"), method=dayScoringMethod(day), kind=method==="finalStableford"?"stableford":"gross",
      entry=finalScoreEntry(day,selected)||{}, c=course(store.event["course"+day]), complete=finalScoreComplete(day,selected),
      rule=kind==="gross" ? ({allStrokes:"All Strokes Count",maxDoubleBogey:"Maximum Double Bogey",maxTripleBogey:"Maximum Triple Bogey"}[store.event.strokeScoringMode||"allStrokes"]) : "Stableford points";
    host.innerHTML=`<div class="finalScoreEntry"><div class="playerEventHero"><span>FINAL SCORE</span><h1>${esc(store.event.name)}</h1>${store.event.days>1?`<h3>DAY ${day}</h3>`:""}<p>${esc(c?.name||"Course")}</p></div><div class="playerCard"><div class="playerCardTitle">FINAL SCORE ENTRY</div><h2>${esc(eventPlayerName(selected,day))}</h2><p>Golf Scorer is not in use for hole-by-hole scoring today. Enter the final score supplied by the caddie or official card after completing the round.</p><div class="finalScoreRule"><b>${kind==="stableford"?"Stableford Points":"Gross Stroke Total"}</b><span>${esc(rule)}</span></div><label>${kind==="stableford"?"Final Stableford points":"Final gross strokes"}<input id="finalScoreTotal" inputmode="numeric" type="number" min="0" max="400" value="${entry.total??""}" ${complete?"disabled":""}></label>${competitionIsOn("teamPutts",day)?`<label>Total putts (optional)<input id="finalScorePutts" inputmode="numeric" type="number" min="0" max="100" value="${entry.putts??""}" ${complete?"disabled":""}></label>`:""}${complete?`<div class="finalScoreSaved"><b>✓ Final score saved</b><span>${entry.total} ${kind==="stableford"?"points":"strokes"}${entry.putts!==""&&entry.putts!=null?` · ${entry.putts} putts`:""}</span></div>`:`<button class="startRoundBtn" id="saveFinalScore">CONFIRM FINAL SCORE</button>`}<button class="soft" id="backFromFinalScore">Back to Round</button></div></div>`;
    $("#backFromFinalScore").onclick=()=>{store.event.playerRoundMode="preview";save();renderPlayerExperience();};
    if($("#saveFinalScore")) $("#saveFinalScore").onclick=()=>{
      const total=Number($("#finalScoreTotal").value), putts=$("#finalScorePutts")?.value??"";
      if(!Number.isFinite(total)||total<0)return alert("Enter the final score from the caddie or official card.");
      if(!confirm(`Confirm ${total} ${kind==="stableford"?"Stableford points":"gross strokes"}? This final result has no hole-by-hole countback.`))return;
      store.event.finalScores||={};store.event.finalScores["day"+day]||={};
      const saved={kind,total,putts:putts===""?"":+putts,rule:store.event.strokeScoringMode||"allStrokes",confirmedAt:new Date().toISOString()};
      store.event.finalScores["day"+day][String(selected)]=saved;scorerStore(day,selected)._finalScore=saved;
      persistStore(); if(store.cloud?.eventId) queueCloudRound(day,selected); if(store.cloud?.role==="organiser") void updateCloudEvent();
      renderFinalScoreEntry(selected,day);
    };
  }
  function renderPlayerExperience() {
    const host = $("#playerExperience");
    if (!host) return;
    if (!store.event) {
      host.innerHTML =
        '<div class="card"><h2>Player View</h2><p>Create an event plan first.</p></div>';
      return;
    }
    if (store.event.status === "cancelled") {
      host.innerHTML = `<div class="card cancelledEventCard"><h2>Event Cancelled</h2><p><b>${esc(store.event.name || "This event")}</b> has been cancelled by the organiser. Scoring is closed.</p></div>`;
      return;
    }
    initialiseGroups();
    const days = store.event.days || 1;
    let day = Math.min(store.event.playerPreviewDay || 1, days);
    if(isPlayerDevice() && Object.keys(store.event.sharedPositions || {}).length && !dayFieldIds(day).includes(String(store.cloud?.playerId))) {
      day=eventDays().find(d=>dayFieldIds(d).includes(String(store.cloud.playerId))) || day;
      store.event.playerRoundMode="preview";store.event.playerHolePos=0;
    }
    if (store.cloud?.role === "player" && manualDayFinalised(day)) {
      const next = eventDays().find(next => next > day && dayFieldIds(next).includes(String(store.cloud.playerId)) && !eventDayComplete(next));
      if (next) {
        day = next; store.event.playerPreviewDay = next;
        store.event.playerRoundMode = "preview"; store.event.playerHolePos = 0; writeLocalStore();
      }
    }
    let field = dayFieldIds(day).filter((id) => String(id) !== NO_PARTNER_ID);
    if (store.cloud?.role === "player")
      field = field.filter((id) => String(id) === String(store.cloud.playerId));
    let selected = String(store.event.playerPreviewId || field[0] || "");
    if (!field.includes(selected)) selected = String(field[0] || "");
    store.event.playerPreviewDay = day;
    store.event.playerPreviewId = selected;
    if (store.cloud?.role === "player") syncRecoveredPlayerRound(day, selected);
    scheduleScoringOpening(day);
    if (store.event.playerRoundMode === "scoring" && !scoringIsOpen(day)) {
      store.event.playerRoundMode = "preview";
      persistStore();
    }
    if (isPlayerDevice() && store.event.finalResults?.confirmedAt) {
      const message = finalMessageForPlayer(selected);
      host.innerHTML = `<div class="playerFinish"><img src="assets/away-golf-mascot-finish.png" alt="Away Golf golfer"><div><h1>${esc(message.heading)}</h1>${message.message ? `<h2>${esc(message.message)}</h2>` : ""}<p class="scoringCredit">${esc(message.scoringCredit)}</p></div></div>`;
      return;
    }
    if (store.event.playerRoundMode === "finalEntry")
      return renderFinalScoreEntry(selected, day);
    if (store.event.playerRoundMode === "fullCardEntry")
      return renderFullCardPlayerEntry(selected, day);
    if (store.event.playerRoundMode === "scoring")
      return ambroseIsOn(store.event, day)
        ? renderAmbroseScoring(selected, day)
        : renderHoleScoring(selected, day);
    if (store.event.playerRoundMode === "verify")
      return renderRoundVerification(selected, day);
    if (store.event.playerRoundMode === "completed")
      return ambroseIsOn(store.event, day)
        ? renderAmbroseCompleted(selected, day)
        : renderCompletedScorecard(selected, day);
    const p = eventPlayer(selected,day),
      ctx = playerGroupContext(selected, day);
    if (!p || !ctx) {
      host.innerHTML = `${dayTabs("previewday",day)}<div class="card"><h2>Day ${day}</h2><p>You are not playing on this day. Select another day to view your round.</p></div>`;
      $$("[data-previewday]").forEach(button=>button.onclick=()=>{store.event.playerPreviewDay=+button.dataset.previewday;store.event.playerRoundMode="preview";save();renderPlayerExperience();});
      return;
    }
    if (isPlayerDevice() && !playerHasSeenWelcome(selected)) {
      host.innerHTML = `<div class="playerWelcome"><div class="welcomeMascotWrap"><img src="away-golf-mascot-mini.png" alt="Away Golf golfer"></div><div class="welcomeWords"><small>AWAY GOLF</small><h1>Welcome, ${esc(playerFirstName(selected))}.</h1><h2>Glad you could join us!</h2><p>You’re playing in <b>${esc(store.event.name || "today’s Away Golf event")}</b>.</p><button class="startRoundBtn" id="continueFromWelcome">VIEW TODAY’S RULES</button></div></div>`;
      $("#continueFromWelcome").onclick = () =>
        openPlayerRulesFromWelcome(selected);
      return;
    }
    const g = ctx.group,
      setup = ctx.setup,
      c = course(store.event["course" + day]),
      start = groupStartingHole(store.event, day, ctx.groupIndex),
      startText = `Hole ${start}`,
      teeTime = groupTeeTime(day, ctx.groupIndex),
      previewStage = !store.event.locked;
    let partner = null;
    if (competitionIsOn("fourball", day)) {
      const pairStart = ctx.playerIndex < 2 ? 0 : 2;
      let other = g
        .slice(pairStart, pairStart + 2)
        .find((id) => id !== selected);
      if (other === NO_PARTNER_ID && setup.virtualPlayer)
        partner = eventPlayer(setup.virtualPlayer,day);
      else partner = eventPlayer(other,day);
    }
    const isAffected = (() => {
      const np = noPartnerContext(setup.groups, day, ctx.groupIndex);
      return np && String(np.affected) === selected ? np : null;
    })();
    const extraNtpHoles = Object.entries(setup.ntpExtraPlayers || {})
        .filter(([, id]) => String(id) === selected)
        .map(([hole]) => hole),
      isExtra = extraNtpHoles.length > 0 || String(setup.ntpExtraPlayer || "") === selected,
      ruleSections = eventRuleSections(store.event, day),
      yellowBallOn = yellowBallIsOn(day),
      openingYellowBallPlayer = yellowBallOn
        ? yellowBallPlayerForHole(day, ctx.groupIndex, start)
        : "";
    const selectedPairStart = ctx.playerIndex < 2 ? 0 : 2,
      selectedPair = g
        .slice(selectedPairStart, selectedPairStart + 2)
        .map(String),
      otherPair = g
        .filter((_, index) => index < selectedPairStart || index >= selectedPairStart + 2)
        .map(String);
    let displayIds = [selected, ...selectedPair.filter((id) => id !== selected)];
    otherPair.forEach((id) => {
      if (!displayIds.includes(id)) displayIds.push(id);
    });
    displayIds = displayIds.slice(0, 4);
    const groupNames = displayIds.map((id) => ({
      id,
      name: id === NO_PARTNER_ID ? "No Partner" : eventPlayer(id, day)?.name || "Unknown",
    })),
      completeDraw = `<details class="completeDraw"><summary>View Complete Draw</summary><div><strong>${days === 1 ? "Event Teams" : `Day ${day} Teams`}</strong>${(setup.groups || []).map((team, index) => `<section><b>Team ${index + 1}</b><span>${esc(team.map((id) => id === NO_PARTNER_ID ? "No Partner" : eventPlayer(id, day)?.name || "Unknown").join(" · "))}</span></section>`).join("")}</div></details>`;
    const ack = Boolean(store.event.playerPreviewAck?.[day]?.[selected]),
      hcp = playerDailyHandicap(selected, day),
      finalised = dayScoringMethod(day) === "fullCardPlayer"
        ? roundFinalisedFor(day, selected)
        : dayScoringMethod(day) !== "holeByHole"
          ? finalScoreComplete(day,selected)
          : ambroseIsOn(store.event, day)
        ? ambroseTeamComplete(day, ctx.groupIndex)
        : roundFinalisedFor(day, selected),
      scoringOpen = scoringIsOpen(day),
      canStart = Boolean(
        store.event.locked && teeSelectionIsFinal(day) && ack && hcp != null && scoringOpen,
      ),
      rulesOpen = Boolean(store.event.playerRulesOpen);
    host.innerHTML = `<div class="playerPreviewTop"><div><h2>Player View</h2><p>Phone preview — select a golfer to see exactly what that player will see.</p></div><div class="playerPreviewControls"><select id="previewPlayer">${field.map((id) => `<option value="${id}" ${id === selected ? "selected" : ""}>${esc(eventPlayer(id, day)?.name || "")}</option>`).join("")}</select>${dayTabs("previewday", day)}</div></div>
 <div class="phoneShell"><div class="phoneScreen"><div class="playerEventHero"><span>AWAY GOLF</span><h1>${esc(store.event.name)}</h1>${days > 1 ? `<h3>DAY ${day}</h3>` : ""}<p>${esc(c?.name || "Course")}</p><small>${esc(formatEventDate(store.event.date, day))}</small></div>
 <div class="eventUpdateBanner ${previewStage ? "preview" : "final"}"><b>${previewStage ? "Event Preview — details may change." : finalised ? "All Set ✓ — your scores are recorded. Time to play the 19th." : "All Set ✓ — Final event details received"}</b><span>${previewStage ? "Please check for and download the final event update the day before play." : `Updated ${esc(new Date(store.event.finalUpdateAt || store.event.lockedAt || Date.now()).toLocaleString("en-AU"))}`}</span></div>
 <div class="playerCard"><div class="playerCardTitle">YOUR GOLF</div><div class="playerFacts scheduleFacts"><div><small>Playing Tee</small><b>${previewStage ? esc(eventTeeMarkerColour(day,store.event,eventCourseCategory(day,store.event,selected))) : teeSelectionIsFinal(day) ? esc(eventTeeMarkerColour(day,store.event,eventCourseCategory(day,store.event,selected))) : "Awaiting"}</b></div><div><small>Daily Handicap</small><b>${hcp != null ? esc(formatPlayingHandicap(hcp)) : "—"}</b></div><div><small>Starting Hole</small><b>${esc(startText)}</b></div><div><small>Tee Time</small><b>${esc(teeTime)}</b></div></div></div>
 <div class="playerCard"><div class="playerCardTitle"><strong>${esc(p.name)}</strong> — GROUP ${ctx.groupIndex + 1}</div><div class="phoneGroup">${groupNames.map((n) => `<div class="${n.name === "No Partner" ? "np" : ""} ${String(n.id) === selected ? "you" : ""} ${yellowBallOn && String(n.id) === String(openingYellowBallPlayer) ? "yellowBallTurn" : ""}">${esc(n.name)}</div>`).join("")}</div>${partner ? `<div class="phonePartner"><small>YOUR 4BBB PARTNER</small><b class="${isAffected ? "vpName" : ""}">${esc(partner.name)}${isAffected ? " (VP)" : ""}</b></div>` : ""}</div>
 ${completeDraw}
 ${isAffected || isExtra || yellowBallOn || ambroseIsOn(store.event, day) ? `<div class="specialInstruction"><strong>TODAY'S SPECIAL INSTRUCTIONS</strong>${ambroseIsOn(store.event, day) ? (() => { const roles = ambroseRoles(day, ctx.groupIndex), scorerName = eventPlayer(roles.scorerId, day)?.name || "the first listed player", markerName = eventPlayer(roles.markerId, day)?.name || "", role = selected === roles.scorerId ? roles.markerId ? `You are the Team Scorer recording the strokes and whose drive was taken on each hole. ${markerName} is your marker.` : "You are the Team Scorer recording the strokes and whose drive was taken on each hole. Note, there is no check marker in this Event." : selected === roles.markerId ? `You are the checking marker. ${scorerName} is your scorer.` : `The team scorer is ${scorerName}.${roles.markerId ? ` ${markerName} is the marker.` : " There is no check marker in this Event."}`; return `<p><b>Ambrose:</b> ${esc(role)}${roles.markerId && selected !== roles.scorerId ? " Record one team stroke score and the selected drive on every hole; the scorer and marker cards must agree." : ""}</p>`; })() : ""}${yellowBallOn ? `<p><b>Yellow Ball:</b> ${esc(eventPlayer(openingYellowBallPlayer, day)?.name || "The first player")} uses it on Hole ${start}, then it rotates through the team in the order shown. The player whose turn it is will have their name highlighted bright yellow on the scoring screen.</p>` : ""}${isAffected ? `<p>${ambroseIsOn(store.event, day) ? "This is a three-player Ambrose team; no virtual score is used." : "You have <b>No Partner</b> today, so the virtual partner listed will supply the missing scores in multiplayer competitions."}</p>` : ""}${isExtra ? `<p><b>NTP Extra Shot:</b> You may play <b>two tee shots</b>${extraNtpHoles.length ? ` on Hole ${extraNtpHoles.join(" and Hole ")}` : " on each NTP hole today"}. Either shot may qualify.</p>` : ""}</div>` : ""}
 <button class="playerRulesBtn" id="playerRulesBtn">Competitions &amp; Rules <span>${rulesOpen ? "⌃" : "›"}</span></button>${
   rulesOpen
     ? `<div class="playerRulesPanel"><h4>Competitions</h4><div class="playerCompetitionList">${(
         store.event.competitions || []
       )
         .filter(id => competitionIsOn(id,day))
         .map((id) => {
           if (["single","combined"].includes(id)) return stablefordPlayerPrizesHtml(store.event);
           const singleFormat =
               store.event.singleStablefordFormat ||
               (store.event.testMode ? "aggregate" : "both"),
             label =
               id === "combined"
                 ? `Single Stableford (${singleFormat === "daily" ? "Each Day" : singleFormat === "both" ? "Daily + Event Total" : `Best ${countingRounds()} Event Total`})`
                 : id === "teamPutts"
                   ? `Putting Competition (${store.event.puttingFormat === "pairs" ? "2 Player" : "4 Player"})`
                   : competitionNames[id] || id;
           return `<div data-competition="${id}"><span>${esc(label)}</span><b>${esc(competitionBenefitText(id, store.event.benefits))}</b></div>`;
         })
         .join(
           "",
         )}</div><h4>Event Rules</h4>${ruleSections.length ? ruleSections.map((section) => `<div class="playerRuleSection"><b>${esc(section.title)}</b>${eventRuleBodyHtml(section)}</div>`).join("") : "<p>No additional rules apply to this event.</p>"}</div>`
     : ""
 }<div class="playerAck"><div><b>Rules acknowledgement</b><small>Read today's rules before starting.</small></div><button id="playerGotIt" class="${ack ? "done" : ""}">${ack ? "✓ Rules acknowledged" : "GOT IT"}</button></div>
 <button class="startRoundBtn ${finalised ? "completedCardBtn" : ""}" id="startRoundPreview" ${finalised || canStart ? "" : "disabled"}>${finalised ? (["holeByHole","fullCardPlayer"].includes(dayScoringMethod(day))?"VIEW COMPLETED SCORECARD":"VIEW FINAL SCORE") : !store.event.locked ? "EVENT NOT YET LOCKED" : !teeSelectionIsFinal(day) ? "WAITING FOR ORGANISER TO FINALISE TEE" : hcp == null ? "DAILY HANDICAP NOT SET" : !ack ? "TAP GOT IT TO OPEN THE SCORECARD" : !scoringOpen ? "SCORING OPENS 15 MINUTES BEFORE THE FIRST TEE TIME" : dayScoringMethod(day)==="holeByHole" ? "OPEN SCORECARD" : dayScoringMethod(day)==="fullCardPlayer" ? "ENTER FULL SCORECARD" : "ENTER FINAL SCORE"}</button>${!finalised && !canStart ? `<p class="lockHint">${!scoringOpen && store.event.locked && teeSelectionIsFinal(day) && hcp != null && ack ? `Scoring opens at ${esc(scoringOpeningLabel(day))} — 15 minutes before the first tee time.` : "The round opens when the event is locked, the playing tee is finalised, your Daily Handicap is set and you have acknowledged the rules."}</p>` : ""}</div></div>`;
    $("#previewPlayer").onchange = (e) => {
      store.event.playerPreviewId = e.target.value;
      store.event.playerRoundMode = "preview";
      save();
      renderPlayerExperience();
    };
    $$("[data-previewday]").forEach(
      (b) =>
        (b.onclick = () => {
          store.event.playerPreviewDay = +b.dataset.previewday;
          store.event.playerPreviewId = null;
          store.event.playerRoundMode = "preview";
          save();
          renderPlayerExperience();
        }),
    );
    $("#playerRulesBtn").onclick = () => {
      const oldTop = $("#playerRulesBtn").getBoundingClientRect().top;
      store.event.playerRulesOpen = !rulesOpen;
      save();
      renderPlayerExperience();
      const newButton = $("#playerRulesBtn");
      if (newButton)
        window.scrollBy(0, newButton.getBoundingClientRect().top - oldTop);
    };
    $("#playerGotIt").onclick = () => {
      store.event.playerPreviewAck = store.event.playerPreviewAck || {};
      store.event.playerPreviewAck[day] =
        store.event.playerPreviewAck[day] || {};
      store.event.playerPreviewAck[day][selected] = true;
      save();
      renderPlayerExperience();
    };
    $("#startRoundPreview").onclick = () => {
      if (finalised) {
        store.event.playerRoundMode = ["holeByHole", "fullCardPlayer"].includes(dayScoringMethod(day)) ? "completed" : "finalEntry";
        save();
        return renderPlayerExperience();
      }
      if (!canStart) return;
      store.event.playerRoundMode = dayScoringMethod(day) === "holeByHole" ? "scoring" : dayScoringMethod(day) === "fullCardPlayer" ? "fullCardEntry" : "finalEntry";
      store.event.playerHolePos = 0;
      requestRoundWakeLock();
      save();
      renderPlayerExperience();
    };
  }
  if (installFederalRidgeHistoryBaseline()) writeLocalStore();
  removeRecordedTestEventHistory();
  backfillCompletedEventHistory();
  applyDeviceRole();
  renderHome();
  renderPlayersAdmin();
  renderCoursesAdmin();
  initialiseCloud();
  if (
    !isPlayerDevice() &&
    !isFreshMobileDevice() &&
    !sessionStorage.getItem("awayGolfMyEventsShown1562")
  ) {
    sessionStorage.setItem("awayGolfMyEventsShown1562", "1");
    setTimeout(openMyEvents, 120);
  }
  if ($("#quickJoinEvent"))
    $("#quickJoinEvent").onclick = () =>
      lookupCloudEvent($("#quickJoinCode")?.value || "");
  updateDeviceClearRecoveryButton();
  if ($("#restoreClearedOrganiserEvents"))
    $("#restoreClearedOrganiserEvents").onclick = restoreClearedOrganiserEvents;
  if ($("#quickJoinCode")) {
    $("#quickJoinCode").oninput = (e) => {
      e.target.value = e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase();
      setQuickJoinStatus(
        e.target.value.length === 6
          ? "Ready to find your event."
          : "Enter the six-character event code.",
      );
    };
    $("#quickJoinCode").onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        lookupCloudEvent($("#quickJoinCode")?.value || "");
      }
    };
  }
  window.addEventListener("online", () => { if (!$("#modalShade").classList.contains("open")) void syncMasterCourses(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#modalShade").classList.contains("open")) void syncMasterCourses(); });
  if ("serviceWorker" in navigator) {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForUpdate || !navigator.serviceWorker.controller) return;
      reloadingForUpdate = true;
      location.reload();
    });
    navigator.serviceWorker
      .register("sw.js")
      .then((registration) => registration.update())
      .catch(() => {});
  }
})();
