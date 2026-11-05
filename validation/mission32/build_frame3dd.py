"""Build the pinned real Frame3DD sources with MinGW on Windows.

HPGnumlib's unused POSIX ownership helper is disabled for Windows only;
no element, matrix, solver or output calculation is modified.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

p=argparse.ArgumentParser()
p.add_argument('--source',type=Path,required=True)
p.add_argument('--numlib',type=Path,required=True)
p.add_argument('--gcc',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--metadata',type=Path,required=True)
args=p.parse_args()
source,numlib=args.source.resolve(),args.numlib.resolve()
original=(numlib/'HPGutil.c').read_text()
# Stop at the complete function, including its nested blocks, not the first if.
begin=original.index('void chOwnGrpMod (')
brace=original.index('{',begin); depth=1; end=brace+1
while depth:
    depth += (original[end]=='{')-(original[end]=='}');end+=1
portable=original[:begin]+'void chOwnGrpMod (const char *file_path, int mode) { (void)file_path; (void)mode; }'+original[end:]
portable=portable.replace('#include <pwd.h>','').replace('#include <grp.h>','')
args.output.parent.mkdir(parents=True,exist_ok=True)
utility=args.output.parent/'HPGutil-windows.c'; utility.write_text(portable)
sources=[source/'src'/name for name in ['main.c','frame3dd.c','frame3dd_io.c','coordtrans.c']]
sources += [numlib/name for name in ['HPGmatrix.c','NRutil.c','HPGeig.c']]+[utility]
command=[str(args.gcc.resolve()),'-O2','-I'+str(numlib),*[str(x) for x in sources],'-lm','-o',str(args.output.resolve())]
result=subprocess.run(command,capture_output=True,text=True)
args.metadata.parent.mkdir(parents=True,exist_ok=True)
args.metadata.with_suffix('.log').write_text(result.stdout+result.stderr,encoding='utf8')
metadata=dict(command=command,exit_code=result.returncode,original_utility_sha256=hashlib.sha256(original.encode()).hexdigest(),
    patched_utility_sha256=hashlib.sha256(portable.encode()).hexdigest(),
    numerical_sources_modified=False,portability_change='Unused POSIX chOwnGrpMod replaced by no-op; pwd/grp headers removed')
args.metadata.write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf8')
print(json.dumps(metadata));raise SystemExit(result.returncode)
