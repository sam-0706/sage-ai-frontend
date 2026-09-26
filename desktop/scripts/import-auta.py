"""Import the user's AutA records locally without overwriting SAGE settings/secrets.
SQLite backup handles a live source WAL. Reruns do not duplicate records.
"""
import sqlite3, pathlib, shutil, json, datetime, os
root = pathlib.Path.home() / 'Library/Application Support'
src, dst = root / 'auta', root / 'sage-ai-desktop'
dst.mkdir(parents=True, exist_ok=True)
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
backup = dst / ('import-backup-' + stamp)
backup.mkdir(mode=0o700)
s = sqlite3.connect(f'file:{src / "auta.db"}?mode=ro', uri=True)
d = sqlite3.connect(dst / 'auta.db')
d.backup(sqlite3.connect(backup / 'sage-before.db'))
s.backup(sqlite3.connect(backup / 'auta-source.db'))
counts = {}
with d:
 for table in ['jobs', 'applications', 'answers', 'application_events', 'site_credentials']:
  cols = [r[1] for r in d.execute(f'pragma table_info({table})')]
  source_cols = {r[1] for r in s.execute(f'pragma table_info({table})')}
  cols = [c for c in cols if c in source_cols]
  records = s.execute(f'SELECT {",".join(cols)} FROM {table}').fetchall()
  d.executemany(f'INSERT OR IGNORE INTO {table} ({",".join(cols)}) VALUES ({",".join("?" for _ in cols)})', records)
  counts[table] = len(records)
 for key in ['profile','resumePath']:
  record = s.execute('SELECT key,value FROM kv WHERE key=?',(key,)).fetchone()
  if record: d.execute('INSERT OR IGNORE INTO kv VALUES (?,?)', record)
 # Preserve the imported history; interrupted runs cannot be resumed after migration.
 d.execute("UPDATE applications SET status='failed', error='Imported from AutA; previous run interrupted' WHERE status IN ('running','queued','paused_checkpoint')")
 for key in ['resumePath']:
  row = d.execute('SELECT value FROM kv WHERE key=?',(key,)).fetchone()
  if row and pathlib.Path(row[0]).exists():
   target = dst / 'resumes' / pathlib.Path(row[0]).name
   target.parent.mkdir(exist_ok=True)
   shutil.copy2(row[0],target)
   d.execute('UPDATE kv SET value=? WHERE key=?',(str(target),key))
 for folder in ['screenshots','resumes']:
  if (src/folder).exists(): shutil.copytree(src/folder,dst/folder,dirs_exist_ok=True)
 d.execute('UPDATE applications SET screenshot_path=replace(screenshot_path,?,?)',(str(src),str(dst)))
profile = src / 'browser-profile'
# Never copy a profile being written by a browser.
locked = (profile/'SingletonLock').is_symlink() or (profile/'SingletonLock').exists()
browser = 'not copied: browser is open' if locked else 'not found'
if profile.exists() and not locked:
 target = dst/'browser-profile'
 if target.exists(): shutil.copytree(target, backup/'browser-before',ignore=shutil.ignore_patterns('Singleton*'))
 if not target.exists() or not any(target.iterdir()):
  shutil.copytree(profile,target,dirs_exist_ok=True,ignore=shutil.ignore_patterns('Singleton*','Cache','Code Cache','GPUCache'))
  browser = 'profile copied; site sessions need validation'
 else: browser = 'existing SAGE profile preserved'
report = {'imported_at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source_project':'/Applications/Projects/AutA', 'source_data':str(src), 'counts':counts, 'browser':browser,'secrets':'AutA encrypted secrets stay in AutA; SAGE credentials preserved', 'backup':str(backup)}
(dst/'auta-import.json').write_text(json.dumps(report,indent=2))
os.chmod(dst/'auta-import.json',0o600)
print(json.dumps(report,indent=2))
