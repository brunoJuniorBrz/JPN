"""M43-P7 research: compiled kernel for the P6 spatial element. Not production.

Numba's on-disk cache is placed outside the checkout by default (Windows MAX_PATH
breaks cache writes inside long checkouts). Override with NUMBA_CACHE_DIR.
"""
import os
import tempfile

os.environ.setdefault("NUMBA_CACHE_DIR", os.path.join(tempfile.gettempdir(), "jpn-m43-p7-numba"))
