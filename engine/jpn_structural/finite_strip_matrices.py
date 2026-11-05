"""Pinned real element kernels, with DOUBLE precision global rotations.

pyCUFSM 0.2.0 narrows alpha to C float in its compiled global transform.
Call its original compiled kernels on a 2-node LOCAL strip (alpha=0 exactly),
then use the real Python double transform and scatter unchanged element DOFs.
This preserves its element equations and avoids the slower Python kernels.
"""
import numpy as np


class FiniteStripMatrices:
    def __init__(self,nodes,edges,props,el_props):
        from pycufsm.solve.analysis import analysis
        from pycufsm.solve.analysis_p import trans
        self.kernel=analysis;self.props=props;self.size=4*len(nodes);self.strips=[]
        for edge,el in zip(edges,el_props):
            i,j=map(int,edge[1:3]);width,alpha=el[1:3]
            local_nodes=np.array([[0,0,0,1,1,1,1,nodes[i,7]],
                                  [1,width,0,1,1,1,1,nodes[j,7]]],float)
            local_edge=np.array([[0,0,1,edge[3],edge[4]]],float)
            local_props=np.array([[0,width,0]],float)
            dofs=np.array([2*i,2*i+1,2*j,2*j+1,2*len(nodes)+2*i,2*len(nodes)+2*i+1,
                           2*len(nodes)+2*j,2*len(nodes)+2*j+1])
            self.strips.append((local_nodes,local_edge,local_props,trans(float(alpha),1),dofs))

    def assemble(self,length,*,transverse_needed=True):
        k=np.zeros((self.size,self.size));g=k.copy();transverse=k.copy()
        identical={}
        for nodes,edges,el,gamma,dofs in self.strips:
            key=(nodes.tobytes(),edges.tobytes(),el.tobytes())
            if key not in identical:
                local_k,local_g=self.kernel.k_kg_global(nodes=nodes,elements=edges,el_props=el,
                    props=self.props,length=length,B_C='S-S',m_a=np.ones(1))
                local_t=self.kernel.kglobal_transv(nodes=nodes,elements=edges,el_props=el,
                    props=self.props,length=length,B_C='S-S',m_i=1.) if transverse_needed else None
                identical[key]=(local_k,local_g,local_t)
            local_k,local_g,local_t=identical[key]
            index=np.ix_(dofs,dofs)
            k[index]+=gamma@local_k@gamma.T;g[index]+=gamma@local_g@gamma.T
            if transverse_needed:
                transverse[index]+=gamma@local_t@gamma.T
        return k,g,transverse
