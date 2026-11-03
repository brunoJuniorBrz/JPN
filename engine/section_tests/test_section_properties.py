import math
import pytest
from jpn_structural.section_analysis import analyze_section
from jpn_structural.model import AnalysisError


def request(geometry):
    return dict(schema_version='jpn.section-analysis/1',units='mm',geometry=geometry,poisson=.3,source='Independent geometric reference, not a steel specification',revision='1',responsible='Synthetic test',convergence=.001)


def test_rectangle_area_axes_inertias_and_independent_saint_venant_series():
    r=analyze_section(request(dict(shape='rectangle',height=40,width=20)));p=r['properties']
    assert math.isclose(p['areaMm2'],800,rel_tol=1e-10)
    assert math.isclose(p['iyMm4'],20*40**3/12,rel_tol=1e-10)
    assert math.isclose(p['izMm4'],40*20**3/12,rel_tol=1e-10)
    assert math.isclose(p['wyPositiveMm3'],p['iyMm4']/20,rel_tol=1e-10)
    series=sum(math.tanh(n*math.pi*40/(2*20))/n**5 for n in range(1,1000,2))
    exact=40*20**3/3*(1-192*20/(math.pi**5*40)*series)
    assert abs(p['jMm4']-exact)<=r['convergence']['target']*exact
    assert not r['normativeResistanceVerified']


def test_rounded_ue_area_matches_independent_flats_plus_four_annular_quarters():
    h,b,c,t,ri=100.,50.,17.,1.2,2.;ro=ri+t
    r=analyze_section(request(dict(shape='u-stiffened',height=h,width=b,lip=c,wallThickness=t,insideRadius=ri)))
    exact=t*(h-2*ro+2*(b-2*ro)+2*(c-ro))+math.pi*(ro*ro-ri*ri)
    n=r['convergence']['boundaryArcPoints'];polygon_deficit=(ro*ro-ri*ri)*(math.pi-2*(n-1)*math.sin(math.pi/(2*(n-1))))
    assert math.isclose(r['properties']['areaMm2'],exact-polygon_deficit,abs_tol=1e-7)
    assert r['properties']['warpingMm6']>0
    assert r['properties']['shearCenterYMm']<0
    assert len(r['refinements'])==3 and not r['effectivePropertiesComputed']


def test_i_section_gross_rectangles_and_scaling_dimensions():
    g=dict(shape='i',height=200,width=100,webThickness=6,flangeThickness=10,insideRadius=0)
    a=analyze_section(request(g));b=analyze_section(request({k:2*v if k!='shape' else v for k,v in g.items()}));p=a['properties']
    assert math.isclose(p['areaMm2'],2*100*10+180*6,rel_tol=1e-10)
    iy=2*(100*10**3/12+100*10*95**2)+6*180**3/12
    assert math.isclose(p['iyMm4'],iy,rel_tol=1e-10)
    for key,power in [('areaMm2',2),('iyMm4',4),('jMm4',4),('warpingMm6',6)]:assert math.isclose(b['properties'][key],p[key]*2**power,rel_tol=1e-6)


def test_no_visual_or_degenerate_dimensions_promoted():
    with pytest.raises(AnalysisError):analyze_section(request(dict(shape='u-stiffened',height=10,width=5,lip=4,wallThickness=3,insideRadius=3)))
