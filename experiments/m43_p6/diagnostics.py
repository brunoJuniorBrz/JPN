"""Label governing components without changing recovery or acceptance."""
import numpy as np

def refinement_components(result):
    out=[]
    coarse,fine=result['coarse'],result['candidate']
    for cid in fine['combinations']:
        for parent in sorted({m['parent_member'] for m in fine['numerical_member_mapping']}):
            values=[]
            for mesh in (coarse,fine):
                children=[m for m in mesh['numerical_member_mapping'] if m['parent_member']==parent]
                rows=mesh['combinations'][cid]['members']
                values.append(np.array(rows[children[0]['id']]['end_actions_global'][:6]+rows[children[-1]['id']]['end_actions_global'][6:]))
            for i,(a,b) in enumerate(zip(*values)):
                out.append(dict(combination=cid,member=parent,end='start' if i<6 else 'end',component=('Fx','Fy','Fz','Mx','My','Mz')[i%6],coarse=float(a),fine=float(b),absolute_change=float(abs(b-a)),historical_normalized_change=float(abs(b-a)/max(1.,abs(b)))))
    return sorted(out,key=lambda r:r['historical_normalized_change'],reverse=True)[:8]
