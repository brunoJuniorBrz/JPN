/** Independent first-order energy audit. Never solves an FE system.
 * Python uses second-order jets; this verifier differentiates only the
 * adopted scalar energy and converts conjugate moments analytically. */
type D={v:number;g:number[]};
const count=12;
const c=(v:number):D=>({v,g:Array(count).fill(0)});
const add=(a:D,b:D):D=>({v:a.v+b.v,g:a.g.map((v,i)=>v+b.g[i])});
const neg=(a:D):D=>({v:-a.v,g:a.g.map(v=>-v)});
const sub=(a:D,b:D)=>add(a,neg(b));
const mul=(a:D,b:D):D=>({v:a.v*b.v,g:a.g.map((v,i)=>v*b.v+b.g[i]*a.v)});
const scale=(a:D,b:number):D=>({v:a.v*b,g:a.g.map(v=>v*b)});
const pow=(a:D,p:number):D=>({v:a.v**p,g:a.g.map(v=>p*a.v**(p-1)*v)});
const div=(a:D,b:D)=>mul(a,pow(b,-1));
const sum=(a:D[])=>a.reduce(add,c(0));
const dot=(a:D[],b:D[])=>sum(a.map((v,i)=>mul(v,b[i])));
const cross=(a:D[],b:D[])=>[sub(mul(a[1],b[2]),mul(a[2],b[1])),sub(mul(a[2],b[0]),mul(a[0],b[2])),sub(mul(a[0],b[1]),mul(a[1],b[0]))];
const unit=(a:D[])=>{const n=pow(dot(a,a),.5);if(n.v<1e-8)throw Error("P4_AUDIT_ROTATION_SINGULAR");return a.map(v=>div(v,n));};
const sin=(a:D):D=>({v:Math.sin(a.v),g:a.g.map(v=>Math.cos(a.v)*v)});
const cos=(a:D):D=>({v:Math.cos(a.v),g:a.g.map(v=>-Math.sin(a.v)*v)});
const atan2=(y:D,x:D):D=>({v:Math.atan2(y.v,x.v),g:y.g.map((v,i)=>(x.v*v-y.v*x.g[i])/(x.v*x.v+y.v*y.v))});
const product=(a:D[],b:D[])=>{const v=cross(a.slice(1),b.slice(1));return [sub(mul(a[0],b[0]),dot(a.slice(1),b.slice(1))),
  ...v.map((x,i)=>sum([x,mul(a[0],b[i+1]),mul(b[0],a[i+1])]))];};
const conjugate=(q:D[])=>[q[0],...q.slice(1).map(neg)];
const rotate=(q:D[],v:D[])=>product(product(q,[c(0),...v]),conjugate(q)).slice(1);
function exp(r:D[]){
  const t2=dot(r,r);let w:D,a:D;
  if(t2.v<1e-8){w=sum([c(1),scale(t2,-1/8),scale(mul(t2,t2),1/384),scale(pow(t2,3),-1/46080)]);
    a=sum([c(.5),scale(t2,-1/48),scale(mul(t2,t2),1/3840),scale(pow(t2,3),-1/645120)]);}
  else{const t=pow(t2,.5);w=cos(scale(t,.5));a=div(sin(scale(t,.5)),t);}
  return [w,...r.map(x=>mul(a,x))];
}
function log(q:D[]){
  if(q[0].v<=0)throw Error("P4_AUDIT_ROTATION_BRANCH");
  const t2=dot(q.slice(1),q.slice(1));let a:D;
  if(t2.v<1e-8)a=sum([div(c(2),q[0]),scale(div(t2,pow(q[0],3)),-2/3),scale(div(mul(t2,t2),pow(q[0],5)),2/5)]);
  else{const t=pow(t2,.5);a=scale(div(atan2(t,q[0]),t),2);}
  return q.slice(1).map(v=>mul(a,v));
}
/** A proper matrix -> quaternion conversion independent of scipy's routine. */
function quaternionFromBasis(rows:number[][]){
  const m=rows[0].map((_,i)=>rows.map(r=>r[i])),trace=m[0][0]+m[1][1]+m[2][2];let q:number[];
  if(trace>0){const s=2*Math.sqrt(trace+1);q=[s/4,(m[2][1]-m[1][2])/s,(m[0][2]-m[2][0])/s,(m[1][0]-m[0][1])/s];}
  else{const i=[0,1,2].reduce((a,b)=>m[a][a]>m[b][b]?a:b),j=(i+1)%3,k=(i+2)%3,s=2*Math.sqrt(1+m[i][i]-m[j][j]-m[k][k]);
    q=[(m[k][j]-m[j][k])/s,0,0,0];q[i+1]=s/4;q[j+1]=(m[j][i]+m[i][j])/s;q[k+1]=(m[k][i]+m[i][k])/s;}
  return q.map(c);
}
const square=(a:D)=>mul(a,a);
export function auditP4Element(x:number[][],q:number[],ea:number,eiy:number,eiz:number,gj:number,basis:number[][],dimension:2|3){
  const v=q.map((n,i)=>({v:n,g:Array.from({length:count},(_,j)=>i===j?1:0)}));
  const r0=x[1].map((n,i)=>n-x[0][i]),length0=Math.hypot(...r0),du=v.slice(6,9).map((n,i)=>sub(n,v[i]));
  const r=r0.map((n,i)=>add(c(n),du[i])),length=pow(dot(r,r),.5),n=r.map(v=>div(v,length));
  const delta=div(add(scale(dot(r0.map(c),du),2),dot(du,du)),add(length,c(length0)));
  let bi:D[],bj:D[],initial:D[],frame:D[];
  if(dimension===2){
    const alpha=atan2(sub(scale(r[2],r0[0]),scale(r[0],r0[2])),add(scale(r[0],r0[0]),scale(r[2],r0[2])));
    bi=[c(0),add(v[4],alpha),c(0)];bj=[c(0),add(v[10],alpha),c(0)];
    initial=quaternionFromBasis(basis);frame=initial;
  }else{
    const qi=exp(v.slice(3,6)),qj=exp(v.slice(9,12)),mean=unit(qi.map((a,i)=>add(a,qj[i])));
    initial=quaternionFromBasis(basis);const meanFrame=product(mean,initial),director=rotate(meanFrame,[c(1),c(0),c(0)]);
    const alignment=unit([add(c(1),dot(director,n)),...cross(director,n)]);frame=product(alignment,meanFrame);
    bi=log(product(conjugate(frame),product(qi,initial)));bj=log(product(conjugate(frame),product(qj,initial)));
  }
  const arc=scale(sum([1,2].map(k=>sum([scale(square(bi[k]),2),neg(mul(bi[k],bj[k])),scale(square(bj[k]),2)]))),length0/30);
  const extension=add(delta,arc),twist=sub(bj[0],bi[0]);
  let energy=add(scale(square(extension),ea/(2*length0)),scale(square(twist),gj/(2*length0)));
  for(const [k,ei]of [[1,eiy],[2,eiz]])energy=add(energy,scale(sum([square(bi[k]),mul(bi[k],bj[k]),square(bj[k])]),2*ei/length0));
  const physical=energy.g.slice();
  if(dimension===3)for(const start of [0,6]){
    const r=q.slice(start+3,start+6),a=Math.hypot(...r),skew=[[0,-r[2],r[1]],[r[2],0,-r[0]],[-r[1],r[0],0]];
    const coeff=a<1e-3?1/12+a*a/720+a**4/30240:(1-.5*a/Math.tan(.5*a))/(a*a);
    const g=energy.g.slice(start+3,start+6),sg=skew.map(row=>row.reduce((s,v,i)=>s+v*g[i],0)),ssg=skew.map(row=>row.reduce((s,v,i)=>s+v*sg[i],0));
    for(let i=0;i<3;i++)physical[start+3+i]=g[i]+.5*sg[i]+coeff*ssg[i];
  }
  const currentBasis=dimension===2?[[n[0].v,0,n[2].v],[0,1,0],[-n[2].v,0,n[0].v]]:
    [[1,0,0],[0,1,0],[0,0,1]].map(axis=>rotate(frame,axis.map(c)).map(v=>v.v));
  return {energy:energy.v,generalized:energy.g,physical,currentBasis,axial:ea/length0*extension.v,arc:arc.v,extension:extension.v,
    torsion:gj/length0*twist.v,betaI:bi.map(v=>v.v),betaJ:bj.map(v=>v.v),quaternions:[exp(v.slice(3,6)),exp(v.slice(9,12))].map(q=>q.map(a=>a.v))};
}
