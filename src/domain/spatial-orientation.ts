/** Physical orientation comparison for experimental validation. Radians, SO(3).
 * Contains no stiffness, solver, production capability or approval decision. */
export type RotationMatrix = readonly (readonly number[])[];

function checked(matrix: RotationMatrix): RotationMatrix {
  if(matrix.length!==3||matrix.some(row=>row.length!==3||row.some(v=>!Number.isFinite(v))))throw new Error("INVALID_SO3_MATRIX");
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    const dot=matrix.reduce((sum,row)=>sum+row[i]*row[j],0);
    if(Math.abs(dot-Number(i===j))>2e-10)throw new Error("INVALID_SO3_MATRIX");
  }
  const [a,b,c]=matrix;
  const det=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
  if(Math.abs(det-1)>2e-10)throw new Error("INVALID_SO3_MATRIX");
  return matrix;
}

function angle(r: RotationMatrix) {
  const sine=Math.hypot(r[2][1]-r[1][2],r[0][2]-r[2][0],r[1][0]-r[0][1])/2;
  const cosine=Math.max(-1,Math.min(1,(r[0][0]+r[1][1]+r[2][2]-1)/2));
  return Math.atan2(sine,cosine);
}

export function quaternionOrientation(q: readonly number[]): RotationMatrix {
  if(q.length!==4||q.some(v=>!Number.isFinite(v))||Math.abs(q.reduce((s,x)=>s+x*x,0)-1)>2e-10)throw new Error("INVALID_SO3_QUATERNION");
  const [w,x,y,z]=q;
  return checked([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
    [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]);
}

export function comparePhysicalOrientations(candidate: RotationMatrix,reference: RotationMatrix,uncertaintyRad=0) {
  const a=checked(candidate),b=checked(reference);
  if(!Number.isFinite(uncertaintyRad)||uncertaintyRad<0)throw new Error("INVALID_SO3_UNCERTAINTY");
  const relative=a.map(row=>b.map(other=>row.reduce((s,x,k)=>s+x*other[k],0)));
  const error=angle(relative),allowed=1e-10+1e-7*Math.max(angle(a),angle(b));
  return {boundsMet:error+uncertaintyRad<=allowed,geodesicErrorRad:error,allowedErrorRad:allowed,
    boundUtilization:(error+uncertaintyRad)/allowed,
    directorError:[0,1,2].map(j=>Math.hypot(...a.map((row,i)=>row[j]-b[i][j])))};
}
