"""Small dense second-order forward differentiation for one 12-DOF element.

No numerical finite difference is used in the solver. The independent tests
differentiate this exact-energy gradient/Hessian by central differences.
"""
import math
import numpy as np


class Jet:
    __slots__ = ("v", "g", "h")
    __array_priority__ = 1000

    def __init__(self, value, gradient, hessian):
        self.v, self.g, self.h = float(value), gradient, hessian

    def __add__(self, other):
        if isinstance(other, Jet):
            return Jet(self.v+other.v, self.g+other.g, self.h+other.h)
        return Jet(self.v+other, self.g, self.h)

    __radd__ = __add__

    def __neg__(self):
        return Jet(-self.v, -self.g, -self.h)

    def __sub__(self, other):
        return self+-other

    def __rsub__(self, other):
        return -self+other

    def __mul__(self, other):
        if isinstance(other, Jet):
            return Jet(self.v*other.v, self.g*other.v+other.g*self.v,
                       self.h*other.v+other.h*self.v+np.outer(self.g, other.g)+np.outer(other.g, self.g))
        return Jet(self.v*other, self.g*other, self.h*other)

    __rmul__ = __mul__

    def __truediv__(self, other):
        return self*(other**-1) if isinstance(other, Jet) else self*(1/other)

    def __rtruediv__(self, other):
        return self**-1*other

    def __pow__(self, exponent):
        if exponent == 0:
            return Jet(1., np.zeros_like(self.g), np.zeros_like(self.h))
        value = self.v**exponent
        first = exponent*self.v**(exponent-1)
        second = exponent*(exponent-1)*self.v**(exponent-2) if exponent != 1 else 0.
        return Jet(value, first*self.g, first*self.h+second*np.outer(self.g, self.g))


def value(x):
    return x.v if isinstance(x, Jet) else float(x)


def variables(q):
    eye = np.eye(len(q))
    return [Jet(v, eye[i], np.zeros((len(q), len(q)))) for i, v in enumerate(q)]


def sin(x):
    if not isinstance(x, Jet): return math.sin(x)
    return Jet(math.sin(x.v), math.cos(x.v)*x.g, math.cos(x.v)*x.h-math.sin(x.v)*np.outer(x.g, x.g))


def cos(x):
    if not isinstance(x, Jet): return math.cos(x)
    return Jet(math.cos(x.v), -math.sin(x.v)*x.g, -math.sin(x.v)*x.h-math.cos(x.v)*np.outer(x.g, x.g))


def atan2(y, x):
    if not isinstance(y, Jet) and not isinstance(x, Jet): return math.atan2(y, x)
    template = y if isinstance(y, Jet) else x
    if not isinstance(y, Jet): y = Jet(y, np.zeros_like(template.g), np.zeros_like(template.h))
    if not isinstance(x, Jet): x = Jet(x, np.zeros_like(template.g), np.zeros_like(template.h))
    r2 = x.v*x.v+y.v*y.v
    fy, fx = x.v/r2, -y.v/r2
    fyy, fxx, fyx = -2*x.v*y.v/r2**2, 2*x.v*y.v/r2**2, (y.v*y.v-x.v*x.v)/r2**2
    return Jet(math.atan2(y.v, x.v), fy*y.g+fx*x.g,
               fy*y.h+fx*x.h+fyy*np.outer(y.g, y.g)+fxx*np.outer(x.g, x.g)+
               fyx*(np.outer(y.g, x.g)+np.outer(x.g, y.g)))
