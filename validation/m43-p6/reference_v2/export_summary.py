"""Compact review snapshot; full raw input/output stays in CI artifacts."""
import hashlib,json,sys
from pathlib import Path

def export(source,destination):
    source=Path(source);data=json.loads(source.read_text(encoding='utf-8'))
    output={k:v for k,v in data.items() if k!='results'}
    output['source_manifest_sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
    output['results']=[]
    for case in data['results']:
        row={k:v for k,v in case.items() if k not in ('network_runs','native_runs','candidate_runs')}
        for name in ('network_runs','native_runs','candidate_runs'):
            row[name]=[]
            for raw in case[name]:
                execution=raw['execution'];r=execution.get('result',execution.get('diagnostic',{}))
                row[name].append(dict(input_bytes_sha256=raw['input_bytes_sha256'],elapsed_seconds=raw['elapsed_seconds'],
                    status=execution['status'],execution=execution.get('execution'),
                    source_sha256_lf=execution.get('source_sha256_lf'),
                    input_controls={k:v for k,v in raw['input'].items() if k not in ('model','bases','binding','numerics')},
                    result={k:r[k] for k in ('schema_version','subdivisions','test_tolerance','requested_tolerance','mesh_points','iterations','maximum_collocation_residual','boundary_residual_max','physical_support_equilibrium','native_axes_maximum_error','trace_reconstruction_error','trace_sha256','corotational02_available','nonuniform_axial_strain_diagnostic') if k in r}))
        output['results'].append(row)
    Path(destination).write_text(json.dumps(output,separators=(',',':'),allow_nan=False,ensure_ascii=False)+'\n',encoding='utf-8')

if __name__=='__main__':export(sys.argv[1],sys.argv[2])
