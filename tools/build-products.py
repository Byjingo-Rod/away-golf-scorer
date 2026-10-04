"""Build both products from the current, single Away Golf source tree.

Generated files are disposable; upgrades belong in the source, never dist/.
Golf Event Scorer uses an isolated account and live scoring adapter.
"""
import hashlib
import json
import re
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
FILES = ["index.html", "app.js", "cloud.js", "data.js", "styles.css",
         "supabase.js", "sw.js", "manifest.webmanifest",
         "away-golf-mascot-mini.png"]


def build():
    config = json.loads((ROOT / "products/golf-event-scorer.json").read_text())
    if config["cloudEnabled"] and "rlkyibpyezzoadowcdre.supabase.co" not in (ROOT / "products/golf-event-scorer-assets/account-config.js").read_text():
        raise ValueError("Golf Event Scorer must use its own approved backend.")
    revision = "92257d6e31898926ff0c051838348f8fc56c3c7e"  # Imported GitHub source revision
    shared_version = re.search(r'Version ([0-9.]+)', (ROOT / "index.html").read_text()).group(1)
    for product in ["away-golf-scorer", "golf-event-scorer"]:
        target = DIST / product
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)
        for name in FILES:
            shutil.copy2(ROOT / name, target / name)
        for name in ["icons", "assets"]:
            shutil.copytree(ROOT / name, target / name)
        if product == "golf-event-scorer":
            for name in ["index.html", "app.js"]:
                source = (target / name).read_text()
                source = source.replace("Away Golf Scorer", config["name"]).replace("Away Golf", config["name"])
                source = source.replace("awayGolf", config["storagePrefix"])
                if name == "index.html":
                    source = source.replace("Golf Event Scorer • Version " + shared_version, "Golf Event Scorer • " + config["version"])
                    source = source.replace("<main id=\"app\">", '<aside role="status" style="padding:12px;background:#fff1c2">Development — event planning, publishing and player scoring.</aside><main id="app">')
                    source = source.replace('</head>', '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/icon-192.png"><link rel="stylesheet" href="blue-theme.css"></head>')
                    source = source.replace('<main id="app">', '<a class="productGroupsLink" href="groups.html">Groups & Organiser Accounts</a><a class="productGroupsLink" href="roster.html">Group Players · Online</a><main id="app">')
                    source = source.replace('content="#18543a"', 'content="#164c83"')
                if name == "index.html":
                    source = source.replace('<script src="cloud.js', '<script src="account-config.js"></script><script src="cloud.js')
                    source = source.replace('placeholder="Search players or GolfLink"', 'placeholder="Search saved players by name or Golf Registration number" aria-describedby="gesPlayerSearchHelp"')
                    source = source.replace('<input id="playerSearchMain"', '<div class="gesPlayerGuidance"><p id="gesPlayerInstructions">Record the names and Golf Registration numbers (where applicable) of each golfer in your group here.</p><p id="gesPlayerSearchHelp">Search only checks players already saved in this app. It does not look up Golf Registration numbers or handicaps on external websites.</p></div><input id="playerSearchMain"')
                    source = source.replace("Today's Special Rules", "Golf Event Rules")
                    source = source.replace('</body>', '<script src="account-config.js"></script><script type="module" src="player-guidance.mjs"></script></body>')
                if name == "app.js":
                    source = source.replace('  function renderCoursesAdmin() {', '  function renderCoursesAdmin() { gesRenderLinkedList("courses");return;')
                    source = source.replace('  function renderPlayersAdmin() {', '  function renderPlayersAdmin() { gesRenderLinkedList("players");return;')
                    source = source.replace('  function renderPlayerExperience() {', (ROOT / "products/golf-event-scorer-linked-lists.js").read_text() + '\n  function renderPlayerExperience() {')
                    source = re.sub(r'<div class="completedGreeting">.*?</div>', '', source)
                    source = source.replace('  function renderPlayerExperience() {', (ROOT / "products/golf-event-scorer-preview-selector.js").read_text() + '\n  function gesRenderPlayerExperience() {')
                    source = source.replace('<p class="completedCardHelp">Read-only card. <b>Hcp +/-</b> shows the handicap adjustment used on each hole. A minus adjustment confirms that a plus-handicap player gives a stroke back on that hole.</p>', '<details class="completedCardHelp"><summary>About this scorecard</summary><p>Read-only card. <b>Hcp +/-</b> shows the handicap adjustment on each hole. A minus means a plus-handicap golfer gives a stroke back.</p></details>')
                    # Preserve unsent phone scores before the leave flow clears the event.
                    source = source.replace('    closeCloudConnection();\n    store.event = null;\n    delete store.cloud;', '    try {\n      if(store.event){localStorage.setItem("gesBeforeLeavingPlayerEvent",JSON.stringify({savedAt:new Date().toISOString(),event:store.event,cloud:store.cloud,players:store.players,courses:store.courses}));captureCurrentEvent();writeLocalStore();}\n    }catch(error){alert("Could not back up your phone scores. Stay in this event and download a backup before leaving.");return;}\n    closeCloudConnection();\n    store.event = null;\n    delete store.cloud;')
                    source = source.replace('Any scores already sent remain safe online.', 'Scores already sent remain safe online. Unsent scores will not automatically appear when you rejoin. A local safety copy will be kept on this device; download an Organiser Backup first if scores have not synced.')
                    # Legacy player-page navigation must never edit device-only master cards.
                    source = source.replace('  function courseDetail(id, requestedCardTee = "") {', '  function courseDetail(id, requestedCardTee = "") {\n    if(!window.GES_PLANNER_CONTEXT){location.href="courses.html";return;}\n')
                    source += "\n" + (ROOT / "products/golf-event-scorer-accepted-card.js").read_text()
                    # Replace prompt-based player entry only in this product.
                    start = source.index('  function addPlayer() {')
                    end = source.index('  function courseDetail(', start)
                    source = source[:start] + (ROOT / "products/golf-event-scorer-player-details.js").read_text() + "\n" + source[end:]
                    start = source.index('  function editPlayerProfile(')
                    end = source.index('  function renderPlayersAdmin()', start)
                    source = source[:start] + '  function editPlayerProfile(id, status = "") { gesPlayerDetails(id, status); }\n' + source[start:end].replace('function editPlayerProfile(', 'function gesHandicapProfile(', 1) + source[end:]
                    source = source.replace('let id = addPlayer();\n        if (id) {\n          q = "";\n          draw();\n        }', 'addPlayer(() => { q = ""; draw(); });')
                    source = source.replace('(p.name + " " + p.golfLink)', '(p.name + " " + p.golfLink + " " + (p.nickname || ""))')
                    source = source.replace('<small>AWAY GOLF EVENT RULES</small>', '')
                    source = source.replace('<h3>Today’s Rules</h3>', '')
                    source = source.replace('Golf ID / GolfLink number', 'Golf Registration No').replace('GOLF ID / GOLFLINK NUMBER', 'GOLF REGISTRATION NO').replace('GolfLink number', 'Golf Registration number')
                    source = source.replace('AWAY GOLF EVENT RULES', 'GOLF EVENT RULES')
                    source = source.replace('<span>AWAY GOLF</span>', '<span>GOLF EVENT SCORER</span>')
                    source = source.replace('esc(store.event?.name || "Today\'s Rules")', 'esc(store.event?.name ? store.event.name + " Golf Event Rules" : "Golf Event Rules")')
                    source = source.replace('<h3>Today’s Rules</h3>', '<h3>Golf Event Rules</h3>')
                    source = source.replace('  if (installFederalRidgeHistoryBaseline())', (ROOT / "products/golf-event-scorer-course-import.js").read_text() + '\n  if (installFederalRidgeHistoryBaseline())')
                if name == "app.js":
                    # Group-bound planner uses the same wizard, with online roster and approved cards.
                    source = source.replace('  function renderCoursesAdmin() {', '  function renderCoursesAdmin() {\n    if(window.GES_PLANNER_CONTEXT){$("#coursesPage").innerHTML=`<h2>Approved Golf Courses</h2><p>Courses are checked and maintained by the owner.</p><a href="groups.html?group=${window.GES_PLANNER_CONTEXT.group.id}#setup">Add Golf Courses — request owner approval</a><ul>${window.GES_PLANNER_CONTEXT.courses.map(c=>`<li>${esc(c.name)}</li>`).join("")}</ul>`;return;}\n')
                    source = source.replace('  function courseDetail(id, requestedCardTee = "") {', '  function courseDetail(id, requestedCardTee = "") {\n    if(window.GES_PLANNER_CONTEXT){gesShowAcceptedCard(course(id));return;}\n')
                    source = source.replace('  function addCourse(returnId) {', '  function addCourse(returnId) {\n    if(window.GES_PLANNER_CONTEXT){location.href="groups.html?group="+window.GES_PLANNER_CONTEXT.group.id+"#setup";return;}\n')
                    source = source.replace('  function renderPlayersAdmin() {', '  function renderPlayersAdmin() {\n    if(window.GES_PLANNER_CONTEXT){$("#playersPage").innerHTML=`<h2>Group Players</h2><a href="roster.html?group=${window.GES_PLANNER_CONTEXT.group.id}">Open Group Players</a><p>Return to your group to reopen saved event drafts.</p>`;return;}\n')
                    source = source.replace('  if (installFederalRidgeHistoryBaseline())', (ROOT / "products/golf-event-scorer-planner-hooks.js").read_text() + '\n  if (false && installFederalRidgeHistoryBaseline())')
                    source = source.replace('$("#wizardManagePlayers").onclick = () => {', '$("#wizardManagePlayers").onclick = () => {\n      if(window.GES_PLANNER_CONTEXT){if(W.step===1)syncEventFields();if(!W.event.name)return alert("Enter an event name and save your draft before opening Group Players.");saveWizardDraft();window.GES_PLANNER_CONTEXT.save(structuredClone(store.event)).then(()=>location.href="roster.html?group="+window.GES_PLANNER_CONTEXT.group.id).catch(e=>alert(e.message));return;}')
                    source = source.replace('$("#wizardAddPlayer").onclick = () => {', '$("#wizardAddPlayer").onclick = () => {\n      if(window.GES_PLANNER_CONTEXT){if(!W.event.name)return alert("Enter an event name and save your draft before opening Group Players.");saveWizardDraft();window.GES_PLANNER_CONTEXT.save(structuredClone(store.event)).then(()=>location.href="roster.html?group="+window.GES_PLANNER_CONTEXT.group.id).catch(e=>alert(e.message));return;}')
                    source = source.replace('    !store.event &&', '    !window.GES_PLANNER_CONTEXT && !store.event &&')
                    source = source.replace('    !isPlayerDevice() &&', '    !window.GES_PLANNER_CONTEXT && !isPlayerDevice() &&')
                    source = source.replace('  function enforceAuthoritativeOatlandsCard() {', '  function enforceAuthoritativeOatlandsCard() { return false;')
                    source = source.replace('  function repairIncompleteOatlandsCard() {', '  function repairIncompleteOatlandsCard() { return false;')
                    source = source.replace('Math.min(60, (+input.value || 8) + delta)', 'Math.min(window.GES_PLANNER_CONTEXT?.group.golfer_count || 60, 60, (+input.value || 8) + delta)')
                    source = source.replace('max="60" value="${W.event.fieldSize}"', 'max="${Math.min(window.GES_PLANNER_CONTEXT?.group.golfer_count || 60,60)}" value="${W.event.fieldSize}"')
                    source = source.replace('    W.event.fieldSize = +$("#weField").value || 8;', '    W.event.fieldSize = Math.min(window.GES_PLANNER_CONTEXT?.group.golfer_count || 60,60,Math.max(1,+$("#weField").value || 8));')
                    source = source.replace('    nav("teamsPage");\n  }\n\n  function pairKey', '    nav("teamsPage");\n    if(window.GES_PLANNER_CONTEXT)window.GES_PLANNER_CONTEXT.save(structuredClone(store.event)).catch(e=>alert("Online save did not complete: "+e.message));\n  }\n\n  function pairKey')
                    source = source.replace('      fieldSize: 8,', '      fieldSize: Math.min(8,window.GES_PLANNER_CONTEXT?.group.golfer_count || 8),')
                    source = source.replace('  async function publishCloudEvent() {', '  async function publishCloudEvent() {\n    if(!window.GES_PLANNER_CONTEXT)return alert("Open your approved group planner to publish.");')
                    source = source.replace('      return;\n    }\n    const retryNeeded =', '      return;\n    }\n    const retryNeeded =')
                    source = source.replace('    persistStore();\n    renderHome();\n    renderPlayersAdmin();', '    persistStore();\n    if(window.GES_PLANNER_CONTEXT && store.event)window.GES_PLANNER_CONTEXT.autoSave?.(store.event);\n    renderHome();\n    renderPlayersAdmin();')
                    source = source.replace('    if (!store.cloud?.eventId || cloudChannel || isSpectatorDevice()) return;', '    if (!store.cloud?.eventId || cloudChannel) return;')
                    source = source.replace('      $("#updateCloudEvent").onclick = updateCloudEvent;', '      const link=document.createElement("a");link.href="player.html?join="+encodeURIComponent(store.cloud.joinCode);link.textContent="Open Player Joining Page";link.className="productGroupsLink";host.append(link);\n      $("#updateCloudEvent").onclick = updateCloudEvent;')
                    source = source.replace('data-wpinactive="${p.id}"', '${window.GES_PLANNER_CONTEXT ? "hidden" : ""} data-wpinactive="${p.id}"')
                    source = source.replace('  function editPlayerProfile(id, status = "") { gesPlayerDetails(id, status); }', '  function editPlayerProfile(id, status = "") { if(window.GES_PLANNER_CONTEXT){location.href="roster.html?group="+window.GES_PLANNER_CONTEXT.group.id;return;}gesPlayerDetails(id, status); }')
                    source = source.replace('data-wpreactivate="${p.id}"', '${window.GES_PLANNER_CONTEXT ? "hidden" : ""} data-wpreactivate="${p.id}"')
                    source = source.replace('return [...ids].filter((id) => player(id));', 'return [...ids].filter((id) => player(id) && String(id)!==NO_PARTNER_ID);')
                    # Isolate all existing storage keys between group workspaces.
                    source = re.sub(r'([\"\'])(golfEventScorer[A-Za-z0-9_]+)\1', lambda m: '('+repr(m.group(2))+' + (window.GES_PLANNER_CONTEXT ? ":"+window.GES_PLANNER_CONTEXT.group.id : ""))', source)
                (target / name).write_text(source)
            seed = (ROOT / "data.js").read_text()
            seed = json.loads(seed.removeprefix("window.AWAY_SEED=").rstrip(";\n"))
            seed["players"] = []
            (target / "data.js").write_text("window.AWAY_SEED=" + json.dumps(seed) + ";\n")
            # Dedicated Golf Event Scorer adapter preserves the proven scoring API.
            (target / "cloud.js").write_text((ROOT / "products/golf-event-scorer-assets/live-cloud.js").read_text())
            manifest = json.loads((target / "manifest.webmanifest").read_text())
            manifest.update(name=config["name"], short_name=config["shortName"], id="./", start_url="./groups.html", theme_color="#164c83", background_color="#edf4fc")
            (target / "manifest.webmanifest").write_text(json.dumps(manifest))
            sw = re.sub(r'const CACHE = "[^"]+";', 'const CACHE = "golf-event-scorer-' + config["version"] + '-' + revision[:12] + '";', (target / "sw.js").read_text())
            sw = sw.replace('x !== CACHE', 'x.startsWith("golf-event-scorer-") && x !== CACHE')
            # Account/API responses must never enter the shared static asset cache.
            sw = sw.split('self.addEventListener("fetch"')[0] + '''self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request)));
});
'''
            (target / "sw.js").write_text(sw)
            branding = ROOT / "products/golf-event-scorer-assets"
            if branding.exists():
                for path in branding.rglob("*"):
                    if path.is_file():
                        destination = target / path.relative_to(branding)
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(path, destination)
        if product == "golf-event-scorer":
            planner = (target / "index.html").read_text()
            planner = re.sub(r'<script src="app.js[^\"]*"></script>', '<script type="module" src="planner.mjs"></script>', planner)
            planner = planner.replace('<aside role="status"', '<aside id="plannerAccount" role="status"')
            planner = planner.replace('Development — event planning, publishing and player scoring.', 'Loading your approved group…')
            planner = planner.replace('style="padding:12px;background:#fff1c2"', 'style="padding:12px;background:#dceaf8;color:#0b2e59"')
            planner = planner.replace('<a class="productGroupsLink" href="groups.html">', '<a class="productGroupsLink planner-back" href="groups.html">Back to Event Planning · ')
            (target / "planner.html").write_text(planner)
            player = (target / "index.html").read_text()
            player = re.sub(r'<script src="app.js[^\"]*"></script>', '<script type="module" src="player-entry.mjs"></script>', player)
            player = player.replace('Development — event planning, publishing and player scoring.', 'Join your Golf Event Scorer event using the code supplied by your organiser.')
            (target / "player.html").write_text(player)
            entry = re.sub(r'<script src="app.js[^\"]*"></script>', '<script type="module" src="entry.mjs"></script>', (target / "index.html").read_text())
            (target / "index.html").write_text(entry)

        provenance = {"product": product, "sourceCommit": revision,
                      "sourceHashes": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in FILES}}
        (target / "build-info.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print("Built dist/away-golf-scorer and dist/golf-event-scorer")


if __name__ == "__main__":
    build()
