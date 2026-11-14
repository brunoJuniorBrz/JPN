"""Opt-in Kirchhoff director field along the chord-Hermite centreline.

R = Swing(e1 -> tangent) Rx(phi). Material curvature is vee(R.T R')/L0.
The geometric spin connection is retained; a difference of rotation-vector
components is NOT the twist of this field. No benchmark acceptance implied.
"""
from .arc import POINTS,WEIGHTS
REUSE_RECIPROCALS=True

def energy(length0,li,lj,eiy,eiz,gj,rotate,exponential,atan2,sin,cos,*,with_twist=False,quaternions=None):
    qi,qj=quaternions if quaternions is not None else (exponential(li),exponential(lj))
    di,dj=rotate(qi,[1.,0.,0.]),rotate(qj,[1.,0.,0.])
    si=[di[k]/di[0] for k in (1,2)];sj=[dj[k]/dj[0] for k in (1,2)]
    # Swing quaternion has zero x component: endpoint residual roll is
    # 2 atan2(qx,qw), independent of transverse swing.
    pi,pj=2*atan2(qi[1],qi[0]),2*atan2(qj[1],qj[0])
    total=0.;twist=0.
    for p,w in zip(POINTS,WEIGHTS):
        u=(float(p)+1)/2
        v=[(1-4*u+3*u*u)*a+(-2*u+3*u*u)*b for a,b in zip(si,sj)]
        dv=[(-4+6*u)*a+(-2+6*u)*b for a,b in zip(si,sj)]
        a,b=v;da,db=dv
        speed=(1+a*a+b*b)**.5
        den=speed*(speed+1)
        # Profiling identified repeated Jet arithmetic in this quadrature.
        # Hoist identical inverse jets; retain the original evaluation option
        # for paired energy/gradient/Hessian and runtime measurements.
        inverse_den=den**-1 if REUSE_RECIPROCALS else None
        inverse_speed=speed**-1 if REUSE_RECIPROCALS else None
        ab=a*b*inverse_den if REUSE_RECIPROCALS else a*b/den
        # Algebraically simplified vee(R.T R'): eliminate terms proportional
        # to t because transverse frame columns are orthogonal to t.
        bb=b*b*inverse_den if REUSE_RECIPROCALS else b*b/den
        aa=a*a*inverse_den if REUSE_RECIPROCALS else a*a/den
        ky=(ab*da-(1-bb)*db)*inverse_speed if REUSE_RECIPROCALS else (ab*da-(1-bb)*db)/speed
        kz=((1-aa)*da-ab*db)*inverse_speed if REUSE_RECIPROCALS else ((1-aa)*da-ab*db)/speed
        phi=(1-u)*pi+u*pj;c,s=cos(phi),sin(phi)
        connection=(b*da-a*db)*inverse_den if REUSE_RECIPROCALS else (b*da-a*db)/den
        k1=pj-pi+connection
        k2=c*ky+s*kz;k3=c*kz-s*ky
        total+=float(w)/2*(gj*k1*k1+eiy*k2*k2+eiz*k3*k3)/(2*length0)
        twist+=float(w)/2*k1
    return (total,twist) if with_twist else total
