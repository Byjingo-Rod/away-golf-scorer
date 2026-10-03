"""Build both products from the current, single Away Golf source tree.

Generated files are disposable; upgrades belong in the source, never dist/.
Golf Event Scorer deliberately has no live cloud connection at this stage.
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
    if config["cloudEnabled"]:
        raise ValueError("Group authorisation and a separate backend must be implemented before enabling cloud.")
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
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
                    source = source.replace("<main id=\"app\">", '<aside role="status" style="padding:12px;background:#fff1c2">Development preview — local planning only. Online event sharing is not enabled.</aside><main id="app">')
                    source = source.replace('</head>', '<link rel="stylesheet" href="blue-theme.css"></head>')
                    source = source.replace('<main id="app">', '<a class="productGroupsLink" href="groups.html">Groups & organiser accounts</a><main id="app">')
                    source = source.replace('content="#18543a"', 'content="#164c83"')
                if name == "app.js":
                    source = source.replace('  function renderCloudPanel() {', '  function renderCloudPanel() {\n    const developmentHost = $("#cloudPanel"), developmentHead = $("#cloudHeader");\n    if (developmentHost && developmentHead) {\n      developmentHead.textContent = "Development · local planning";\n      developmentHost.innerHTML = `<div class="cloudPanelHead"><div><small>EVENT SHARING</small><h3>Online publishing is being developed</h3></div><span class="cloudState">Local planning available</span></div><p>You can plan on this device. Publishing events, joining phones and score synchronisation are not enabled yet.</p><a href="groups.html">Open Groups &amp; organiser accounts</a>`;\n      return;\n    }\n')
                    source = source.replace('  if (installFederalRidgeHistoryBaseline())', (ROOT / "products/golf-event-scorer-course-import.js").read_text() + '\n  if (installFederalRidgeHistoryBaseline())')
                (target / name).write_text(source)
            seed = (ROOT / "data.js").read_text()
            seed = json.loads(seed.removeprefix("window.AWAY_SEED=").rstrip(";\n"))
            seed["players"] = []
            (target / "data.js").write_text("window.AWAY_SEED=" + json.dumps(seed) + ";\n")
            # Keep the cloud API shape, but fail every operation before any request.
            (target / "cloud.js").write_text('''window.AwayCloud = new Proxy({}, {
  get: () => async () => { throw new Error("Golf Event Scorer cloud access is not enabled in this development build."); }
});
''')
            manifest = json.loads((target / "manifest.webmanifest").read_text())
            manifest.update(name=config["name"], short_name=config["shortName"], id="./", theme_color="#164c83", background_color="#edf4fc")
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
        provenance = {"product": product, "sourceCommit": revision,
                      "sourceHashes": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in FILES}}
        (target / "build-info.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print("Built dist/away-golf-scorer and dist/golf-event-scorer")


if __name__ == "__main__":
    build()
