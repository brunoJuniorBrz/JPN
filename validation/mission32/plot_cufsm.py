"""Standalone scientific figure from the published raw executable comparison."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
raw=json.loads(args.input.read_text());assert raw['cases']==594 and not raw['failures']
fig,axes=plt.subplots(3,2,figsize=(12,10),layout='constrained')
colors=['#2878b5','#d97924','#3b9461']
for gi in range(3):
    geometry=raw['results'][gi*198]['geometry']
    for mi,(arc,flat) in enumerate([(2,6),(4,8),(8,12)]):
        rows=raw['results'][gi*198+mi*66:gi*198+mi*66+64]
        rows=sorted(rows,key=lambda r:r['wavelength_mm'])
        x=[r['wavelength_mm'] for r in rows]
        for family,style in [('local','--'),('distortional','-')]:
            y=[r['families'][family]['jpn_stress_mpa'] for r in rows]
            native=[r['families'][family]['cufsm_stress_mpa'] for r in rows]
            label=f'{family}, {arc}/{flat}'
            axes[gi,0].plot(x,y,style,color=colors[mi],label=label,linewidth=1.2)
            axes[gi,0].plot(x,native,'o',color=colors[mi],markersize=2,fillstyle='none')
            axes[gi,1].plot(x,[1e6*r['families'][family]['relative_difference'] for r in rows],
                            style,color=colors[mi],label=label,linewidth=1.2)
    title=f"Ue {geometry['height']} x {geometry['width']} x {geometry['lip']}; t={geometry['wallThickness']}, ri={geometry['insideRadius']} mm"
    axes[gi,0].set_title(title,fontsize=10)
    axes[gi,1].set_title('JPN / original CUFSM: relative difference',fontsize=10)
    for ax in axes[gi]:
        ax.set_xscale('log');ax.grid(True,alpha=.22);ax.set_xlabel('Admissible half-wavelength L/m (mm), m=1...64')
    axes[gi,0].set_yscale('log');axes[gi,0].set_ylabel('Critical stress (MPa)')
    axes[gi,1].set_ylabel('Relative difference (ppm)')
axes[0,0].legend(fontsize=7,ncol=2)
fig.suptitle('M32: finite member spectrum / mesh study\nLines: JPN; open circles: original CUFSM in Octave. Research only; no normative approval.',fontsize=12)
args.output.parent.mkdir(parents=True,exist_ok=True)
fig.savefig(args.output,dpi=180);fig.savefig(args.output.with_suffix('.svg'));plt.close(fig)
print(args.output)
