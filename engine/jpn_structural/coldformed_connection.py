"""Check the actual persisted connection inventory; never infer absent cuts."""
from .frame3d_model import obj,number,text,input_hash,fail


def audit_member_connection(raw,piece_id,tension):
    ids=[];holes=0
    if raw is not None:
        obj(raw,'piece_id joints','member connection context')
        if raw['piece_id']!=piece_id:fail('PHYSICAL_CONNECTION_MISMATCH','Connection context belongs to another member.')
        joints=raw['joints']
        if type(joints)is not list or len(joints)>30:fail('INPUT_LIMIT','At most 30 joints per member.')
        for j in joints:
            obj(j,'id node_id source revision fixing has_bolts holes welds','member joint')
            for k in ('id','node_id','source','revision'):text(j[k],k)
            if j['id'] in ids:fail('DUPLICATE_ID','Repeated member joint.')
            ids.append(j['id'])
            if j['fixing'] not in ('pending','bolted','welded','combined') or type(j['has_bolts'])is not bool:fail('INVALID_INPUT','Explicit fixing and bolt inventory required.')
            if type(j['holes'])is not list or len(j['holes'])>500 or type(j['welds'])is not list or len(j['welds'])>100:fail('INPUT_LIMIT','Joint geometry limit.')
            for h in j['holes']:
                obj(h,'id component_id diameter_mm y_mm z_mm','member-associated hole')
                for k in ('id','component_id'):text(h[k],k)
                for k in ('diameter_mm','y_mm','z_mm'):
                    if h[k]is not None:number(h[k],0 if k=='diameter_mm' else -1e6,1e6,k)
            holes+=len(j['holes'])
            for w in j['welds']:
                obj(w,'id type size_mm length_mm','weld inventory');text(w['id'],'weld id')
                if w['type']is not None:text(w['type'],'weld type')
                for k in ('size_mm','length_mm'):
                    if w[k]is not None:number(w[k],1e-12,1e6,k)
            if tension and tension['basis']=='full-section-all-elements-welded' and (j['has_bolts'] or j['fixing']in ('bolted','combined') or j['holes']):
                fail('PHYSICAL_CONNECTION_MISMATCH','Full-section welded hypothesis contradicts the member-associated hole/bolt inventory; plate/member hole distinction and connected section need physical review.')
    return dict(status='conditional-unverified',input_sha256=input_hash(raw) if raw is not None else None,connection_ids=ids,hole_count=holes,
      warning='Known contradictions checked; this inventory does not prove absence of cutouts, weld coverage of every section element or governing net paths/Ct. Tension stays conditional.')
