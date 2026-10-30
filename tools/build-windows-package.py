#!/usr/bin/env python3
"""Rebuild this Windows distribution, excluding dependencies and local runtime state."""
import argparse, hashlib, json, os, zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--output-dir',required=True,type=Path)
args=parser.parse_args()
version=json.loads((root/'package.json').read_text())['version']
assert json.loads((root/'package-lock.json').read_text())['version']==version
assert json.loads((root/'package-lock.json').read_text())['packages']['']['version']==version
assert (root/'VERSION.txt').read_text().strip()=='v'+version
assert f"const RELEASE_NAME = 'v{version}-production';" in (root/'server.js').read_text()
blocked_dirs={'.git','node_modules','dist','release','logs','backups','tmp','generated_images','__pycache__'}
blocked_files={'.git','.env','API-KEY.txt','DATABASE-CONNECTION.txt','LOCAL-SERVER.txt','SOURCE-SHA256.txt','SOURCE-MANIFEST-SHA256.txt','datacenter-radiology-config.json','datacenter-patient-package-config.json'}
files={}
for directory,dirs,names in os.walk(root):
    dirs[:]=sorted(d for d in dirs if d not in blocked_dirs)
    for name in sorted(names):
        path=Path(directory)/name
        if name in blocked_files or name.startswith('.env') or path.suffix.lower() in {'.log','.pyc'}:
            continue
        if path.parent==root and name.startswith('HealthCheck-') and name.endswith(('.zip','.sha256')):
            continue
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise RuntimeError('Unsupported symlink: '+str(path))
        files[path.relative_to(root).as_posix()]=path.read_bytes()
for name in ['INSTALL-REPAIR.bat','tools/start-production-installer.vbs','tools/production-installer-gui.ps1','tools/production-installer-worker.ps1','tools/deploy-environment.ps1','tools/install.ps1','tools/assert-no-downgrade.ps1','server.js','company-management.js','patient-demographic.js','datacenter/patient-demographic.html','assets/patient-demographic.js','assets/patient-demographic.css','security-policy.js','clinical-lifecycle.js','assets/auth-session.js','assets/app.js','assets/style.css','package-lock.json']:
    assert name in files,'Missing payload: '+name
release_files=(json.dumps(sorted(set(files)|{'RELEASE-FILES.json','SOURCE-MANIFEST-SHA256.txt','SOURCE-SHA256.txt'}),ensure_ascii=False,indent=2)+'\n').encode()
(root/'RELEASE-FILES.json').write_bytes(release_files)
files['RELEASE-FILES.json']=release_files
manifest=''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name,data in sorted(files.items())).encode()
for name in ['SOURCE-MANIFEST-SHA256.txt','SOURCE-SHA256.txt']:
    (root/name).write_bytes(manifest)
    files[name]=manifest
args.output_dir.mkdir(parents=True,exist_ok=True)
archive=args.output_dir/f'HealthCheck-v{version}-PRODUCTION-WINDOWS-INSTALLER.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as bundle:
    for name,data in sorted(files.items()):
        info=zipfile.ZipInfo(name,date_time=(2026,10,31,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
        bundle.writestr(info,data)
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    for line in manifest.decode().splitlines():
        digest,name=line.split('  ',1)
        assert hashlib.sha256(bundle.read(name)).hexdigest()==digest,name
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
(archive.parent/(archive.name+'.sha256')).write_text(f'{checksum}  {archive.name}\n')
print(json.dumps({'archive':str(archive),'files':len(files),'bytes':archive.stat().st_size,'sha256':checksum},indent=2))
