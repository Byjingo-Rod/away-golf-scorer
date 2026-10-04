import subprocess,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[1]
subprocess.run(['python3','tools/build-products.py'],cwd=root,check=True)
shutil.rmtree(root/'build',ignore_errors=True)
shutil.copytree(root/'dist/golf-event-scorer',root/'build')
