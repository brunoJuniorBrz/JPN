"""Reproduce the old fixed-length oracle using the consolidated independent helper."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from experiments.m43_p6.test_material_curvature_oracle import candidate,oracle,archived_oracle,ROTATIONS
li,lj=ROTATIONS['combined-small']
print('L0 candidate_J old_ratio corrected_ratio')
for length in (.5,1.,2.,6.,50.):
    c=candidate(length,li,lj,2e4,1e4,8e3)
    print(length,c,archived_oracle(li,lj,2e4,1e4,8e3)/c,oracle(length,li,lj,2e4,1e4,8e3)/c)
