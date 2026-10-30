"""Experimental analysis only. No resistance, buckling or code approval."""

__version__ = "0.1.0"

from .model import AnalysisError, parse_request
from .solver import analyze

__all__ = ["AnalysisError", "parse_request", "analyze"]
