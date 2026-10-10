#!/usr/bin/env python3
"""Regenerate a consistent, checksummed MedLog release. No third-party packages."""
from pathlib import Path
import sys, re, hashlib, json
from datetime import datetime, timezone

root = Path(__file__).resolve().parent
version = sys.argv[1] if len(sys.argv) > 1 else '1.1.1'
if not re.fullmatch(r'\d+\.\d+\.\d+', version):
    raise SystemExit('版本格式必須是 X.Y.Z，例如 1.0.1')
for name in ('model.js', 'sw.js'):
    path = root / name
    text = path.read_text(encoding='utf-8')
    text, count = re.subn(r"(const VERSION\s*=\s*')[^']+(')", lambda m: m[1] + version + m[2], text)
    if count != 1:
        raise SystemExit('找不到唯一版本欄位：' + name)
    path.write_text(text, encoding='utf-8')
path = root / 'index.html'
path.write_text(re.sub(r'(<span class="version">)[^<]+', lambda m: m[1] + version,
                       path.read_text(encoding='utf-8')), encoding='utf-8')
files = ['index.html','styles.css','app.js','model.js','storage.js','cloud.js','update.js','photos.js','viewport.js',
         'manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png','favicon.svg']
metadata = {
    'appId': 'medlog-gd', 'version': version, 'schemaVersion': 1,
    'releasedAt': datetime.now(timezone.utc).isoformat(),
    'files': {name: hashlib.sha256((root/name).read_bytes()).hexdigest() for name in files}
}
(root / 'version.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print('MedLog V'+version+'：已更新版本與 '+str(len(files))+' 個檔案校驗值。')
