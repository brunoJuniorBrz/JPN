"""First derivatives only for residual line search; never a tangent substitute."""
import math
import numpy as np

class Dual:
    __array_priority__ = 1000
    def __init__(self, v, g): self.v, self.g = float(v), g
    def __add__(self, b):
        return Dual(self.v+b.v, self.g+b.g) if isinstance(b,Dual) else Dual(self.v+b,self.g)
    __radd__=__add__
    def __neg__(self): return Dual(-self.v,-self.g)
    def __sub__(self,b): return self+-b
    def __rsub__(self,b): return -self+b
    def __mul__(self,b):
        return Dual(self.v*b.v,self.g*b.v+b.g*self.v) if isinstance(b,Dual) else Dual(self.v*b,self.g*b)
    __rmul__=__mul__
    def __pow__(self,p):
        return Dual(self.v**p, p*self.v**(p-1)*self.g) if p else Dual(1.,np.zeros_like(self.g))
    def __truediv__(self,b): return self*(b**-1) if isinstance(b,Dual) else self*(1/b)
    def __rtruediv__(self,b): return b*self**-1

def value(x): return x.v if isinstance(x,Dual) else float(x)
def variables(q): return [Dual(v,np.eye(len(q))[i]) for i,v in enumerate(q)]
def sin(x): return Dual(math.sin(x.v),math.cos(x.v)*x.g) if isinstance(x,Dual) else math.sin(x)
def cos(x): return Dual(math.cos(x.v),-math.sin(x.v)*x.g) if isinstance(x,Dual) else math.cos(x)
def atan2(y,x):
    if not isinstance(x,Dual) and not isinstance(y,Dual): return math.atan2(y,x)
    template=x if isinstance(x,Dual) else y
    if not isinstance(x,Dual): x=Dual(x,np.zeros_like(template.g))
    if not isinstance(y,Dual): y=Dual(y,np.zeros_like(template.g))
    return Dual(math.atan2(y.v,x.v),(x.v*y.g-y.v*x.g)/(x.v*x.v+y.v*y.v))
