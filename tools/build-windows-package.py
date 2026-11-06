#!/usr/bin/env python3
"""Rebuild this Windows distribution, excluding dependencies and local runtime state."""
import argparse, hashlib, json, os, zipfile, subprocess
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
        if path.parent==root and name.startswith('Push-HealthCheck-') and name.endswith('.ps1'):
            continue
        if path.parent==root and name.startswith('HealthCheck-') and name.endswith(('.zip','.sha256')):
            continue
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise RuntimeError('Unsupported symlink: '+str(path))
        files[path.relative_to(root).as_posix()]=path.read_bytes()
for name in ['assets/hr-backup-frame.html','assets/hr-backup-frame.js','templates/hr-share-base.xlsx','assets/hr-template-workbook.js','migrations/0223_hr_password_login.up.sql','tools/installer-completion.ps1','tools/source-backup.ps1','INSTALLER-SECURITY-NOTICE.md','server-origin.js','migrations/0222_hr_direct_access.up.sql','hr-connect.js','hr-connect.html','assets/hr-connect.css','assets/hr-connect-client.js','assets/hr-connect-model.js','assets/hr-connect-staff.css','assets/hr-connect-staff.js','migrations/0221_hr_connect.up.sql','HR-CONNECT-DEPLOYMENT.md','tools/invoke-installer-launcher.ps1','assets/customer-offline-form.html','assets/customer-offline-export.js','assets/customer-offline-client.js','assets/customer-return-model.js','templates/customer-share-base.xlsx','assets/customer-template.js','assets/customer-template-model.js','assets/customer-template.css','assets/nav/customer-template.svg','tools/assert-deployed-payload.ps1','assets/datacenter-tools.css','consult-location.js','assets/consult-location.js','templates/customer-multi-import-blank-template.xlsx','INSTALL-REPAIR.bat','tools/start-production-installer.ps1','REPAIR-UPDATE-CENTER.bat','tools/production-installer-gui.ps1','tools/production-installer-worker.ps1','tools/deploy-environment.ps1','tools/install.ps1','tools/assert-no-downgrade.ps1','server.js','performance-monitor.js','assets/performance-monitor.js','assets/performance-dashboard.js','assets/performance-dashboard.css','assets/customer-search-table.css','permission-coverage.test.js','company-management.js','patient-demographic.js','datacenter/patient-demographic.html','assets/patient-demographic.js','assets/patient-demographic.css','security-policy.js','clinical-lifecycle.js','assets/auth-session.js','assets/app.js','assets/style.css','package-lock.json','assets/company-year-fields.js','assets/company-year-fields.css','api-exchange-log.js','assets/api-exchange-log.js','assets/api-exchange-log.css','navigation-mapping.js','datacenter-openvisit.js','datacenter/openvisit.html','assets/datacenter-openvisit.js','assets/navigation-mapping.js','assets/navigation-mapping-model.js','assets/navigation-mapping.css','migrations/0220_navigation_sheet.up.sql','assets/navigation-print.js','navigation-sheet.js','assets/navigation-sheet-template.js','assets/navigation-sheet.js','assets/navigation-sheet.css','assets/clinical-ui-theme.css','assets/datacenter-theme-shell.css','patient-demographic-related.js','tools/check-pdf-runtime.js','migrations/0219_his_operation_attempts.up.sql','customer-search-settings.js','operations-records.js','assets/customer-search-preferences.js','customer-primary-selection.js','assets/customer-primary-selection.js']:
    assert name in files,'Missing payload: '+name
# Use the updater's actual preflight contract for every new HR-era migration.
# Existing historical migrations retain their original installer-specific format.
modern_migrations=sorted(name.split('/')[-1] for name in files if name.startswith('migrations/') and name.endswith('.up.sql') and name.split('/')[-1][:4].isdigit() and int(name.split('/')[-1][:4])>=221)
subprocess.run(['node','-e',"require('./tools/app-update-helper').validateMigrations(process.argv[1],JSON.parse(process.argv[2]))",str(root),json.dumps(modern_migrations)],cwd=root,check=True)
assert not any(name.lower().endswith('.vbs') for name in files),'VBScript launchers must not be included in the distribution'
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
