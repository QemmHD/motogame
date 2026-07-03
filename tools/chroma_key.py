#!/usr/bin/env python3
"""Chroma-key a sprite off a solid key color -> RGBA, despill, autocrop, downscale.

Usage: chroma_key.py in.png out.png KEYHEX [maxdim]
KEYHEX e.g. 00FF00 (green) or FF00FF (magenta).
Global distance keying (safe because sprite content avoids the key hue),
with a soft edge ramp, key-channel spill suppression, and bbox autocrop.
"""
import sys
import numpy as np
from PIL import Image

inp, out, keyhex = sys.argv[1], sys.argv[2], sys.argv[3]
maxdim = int(sys.argv[4]) if len(sys.argv) > 4 else 512
key = np.array([int(keyhex[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)

im = Image.open(inp).convert("RGB")
a = np.asarray(im).astype(np.float64)
# sample the ACTUAL background color from the four corners (robust to shaded
# key backgrounds) — fall back to the passed hex if corners disagree.
h, w = a.shape[:2]
patches = np.concatenate([
    a[:24, :24].reshape(-1, 3), a[:24, -24:].reshape(-1, 3),
    a[-24:, :24].reshape(-1, 3), a[-24:, -24:].reshape(-1, 3)])
corner = np.median(patches, axis=0)
# use the corner color if it's clearly the key hue, else the requested hex
key = corner if np.sqrt(((corner - key) ** 2).sum()) < 120 else key
dist = np.sqrt(((a - key) ** 2).sum(-1))          # distance to key color

# soft alpha ramp: <T_IN from key -> transparent, >T_OUT -> opaque
T_IN, T_OUT = 90.0, 165.0
alpha = np.clip((dist - T_IN) / (T_OUT - T_IN), 0, 1)

# spill suppression on the key's dominant channel(s)
rgb = a.copy()
if key[1] > 200 and key[0] < 80 and key[2] < 80:   # green key
    cap = np.maximum(rgb[..., 0], rgb[..., 2])
    rgb[..., 1] = np.minimum(rgb[..., 1], cap + 12)
elif key[0] > 200 and key[2] > 200 and key[1] < 80:  # magenta key
    cap = rgb[..., 1] + 12
    rgb[..., 0] = np.minimum(rgb[..., 0], np.maximum(rgb[..., 0], cap))
    # pull strong magenta fringe toward its green (neutral) level
    fringe = (rgb[..., 0] > cap) & (rgb[..., 2] > cap) & (alpha < 1)
    rgb[..., 0] = np.where(fringe, cap, rgb[..., 0])
    rgb[..., 2] = np.where(fringe, np.minimum(rgb[..., 2], cap), rgb[..., 2])

rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
img = Image.fromarray(rgba, "RGBA")

# autocrop to non-transparent content (alpha > 25), small margin
al = np.asarray(img)[..., 3]
ys, xs = np.where(al > 25)
if len(xs):
    m = 6
    x0, x1 = max(xs.min() - m, 0), min(xs.max() + m + 1, img.width)
    y0, y1 = max(ys.min() - m, 0), min(ys.max() + m + 1, img.height)
    img = img.crop((x0, y0, x1, y1))

# downscale to maxdim
if max(img.size) > maxdim:
    s = maxdim / max(img.size)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)

img.save(out)
print(f"{out}  {img.size}")
