#!/usr/bin/env python3
"""Texture factory post-process: seamless tile + PBR maps (numpy+pillow only)."""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def periodic_component(img):
    img = img.astype(np.float64)
    h, w = img.shape[:2]
    out = np.empty_like(img)
    for c in range(img.shape[2]):
        u = img[..., c]
        v = np.zeros_like(u)
        v[0, :] += u[-1, :] - u[0, :]
        v[-1, :] += u[0, :] - u[-1, :]
        v[:, 0] += u[:, -1] - u[:, 0]
        v[:, -1] += u[:, 0] - u[:, -1]
        fy = np.cos(2 * np.pi * np.arange(h) / h)[:, None]
        fx = np.cos(2 * np.pi * np.arange(w) / w)[None, :]
        denom = 2 * fy + 2 * fx - 4
        denom[0, 0] = 1.0
        s = np.fft.fft2(v) / denom
        s[0, 0] = 0.0
        out[..., c] = u - np.real(np.fft.ifft2(s))
    return np.clip(out, 0, 255)


def offset_blend(img, overlap=0.25):
    img = img.astype(np.float64)

    def blend_seam(a, axis):
        size = a.shape[axis]
        rolled = np.roll(a, size // 2, axis=axis)
        k = max(int(size * overlap / 2), 1)
        c = size // 2
        idx = [slice(None)] * 3
        idx[axis] = slice(c - k, c + k)
        donor = np.take(a, range(c - k, c + k), axis=axis)
        w = 1 - np.abs(np.linspace(-1, 1, 2 * k))
        shape = [1, 1, 1]
        shape[axis] = 2 * k
        w = w.reshape(shape)
        rolled[tuple(idx)] = rolled[tuple(idx)] * (1 - w) + donor * w
        return np.roll(rolled, -(size // 2), axis=axis)

    return np.clip(blend_seam(blend_seam(img, 1), 0), 0, 255)


def flatten_luminance(img, sigma_frac=0.07):
    img = img.astype(np.float64)
    h, w = img.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    sigma = sigma_frac * min(h, w)
    k = np.exp(-2 * (np.pi * sigma) ** 2 * (fy ** 2 + fx ** 2))
    low = np.real(np.fft.ifft2(np.fft.fft2(img.mean(axis=2)) * k))
    return np.clip(img + (low.mean() - low)[..., None], 0, 255)


def _hcut_cyclic(D, tries=14):
    h, w = D.shape
    starts = np.argsort(D[:, 0] + D[:, -1])[:tries]
    best_cost, best_path = np.inf, None
    for s in starts:
        M = np.full((h, w), np.inf)
        M[s, 0] = D[s, 0]
        back = np.zeros((h, w), int)
        for j in range(1, w):
            prev = M[:, j - 1]
            up = np.concatenate(([np.inf], prev[:-1]))
            down = np.concatenate((prev[1:], [np.inf]))
            cand = np.stack([up, prev, down])
            M[:, j] = D[:, j] + cand.min(0)
            back[:, j] = cand.argmin(0) - 1
        if M[s, -1] >= best_cost:
            continue
        best_cost = M[s, -1]
        path = np.zeros(w, int)
        path[-1] = s
        for j in range(w - 1, 0, -1):
            path[j - 1] = path[j] + back[path[j], j]
        best_path = path
    return best_path


def _edge_energy(x):
    return (abs(np.diff(x, axis=1, prepend=x[:, :1]))
            + abs(np.diff(x, axis=0, prepend=x[:1])))


def _cut_axis(a, overlap, lam=0.6, stone_w=1.5, feather_px=3):
    n = a.shape[0]
    c = n // 2
    k = max(int(n * overlap / 2), 2)
    rolled = np.roll(a, c, axis=0)
    band = rolled[c - k:c + k].copy()
    cands = [int(n * f) for f in (0.25, 0.33, 0.5, 0.66, 0.75)]
    best, donor = np.inf, None
    for q in cands:
        if q - k < 0 or q + k > n:
            continue
        d = a[q - k:q + k]
        smooth = np.abs(d[k] - d[k - 1]).mean()
        fit = np.abs(band - d).mean()
        score = smooth * 3.0 + fit
        if score < best:
            best, donor = score, d
    D = np.abs(band - donor).mean(-1)
    cost = D + stone_w * (_edge_energy(band.mean(-1)) + _edge_energy(donor.mean(-1)))
    r = np.arange(k - 1)[:, None]
    up = _hcut_cyclic(cost[:k - 1] + lam * (k - 1 - r))
    lo = _hcut_cyclic(cost[k + 1:] + lam * r) + (k + 1)
    rows = np.arange(2 * k)[:, None]
    alpha = ((rows > up[None, :]) & (rows < lo[None, :])).astype(np.float64)
    if feather_px > 0:
        kern = np.ones(2 * feather_px + 1)
        kern /= kern.sum()
        alpha = np.apply_along_axis(
            lambda v: np.convolve(v, kern, mode="same"), 0, alpha)
        alpha[k - 1:k + 1] = 1.0
    rolled[c - k:c + k] = band * (1 - alpha[..., None]) + donor * alpha[..., None]
    return np.roll(rolled, -c, axis=0)


def make_seamless(img, overlap=0.25, flatten=True, blend="cut"):
    arr = np.asarray(img.convert("RGB")).astype(np.float64)
    if flatten:
        arr = flatten_luminance(arr)
    arr = periodic_component(arr)
    if blend == "cut":
        arr = _cut_axis(arr, overlap)
        arr = np.swapaxes(_cut_axis(np.swapaxes(arr, 0, 1), overlap), 0, 1)
        arr = np.clip(arr, 0, 255)
    else:
        arr = offset_blend(arr, overlap)
    return Image.fromarray(arr.astype(np.uint8))


def trim_border(img, frac):
    if frac <= 0:
        return img
    w, h = img.size
    k = int(min(w, h) * frac)
    return img.crop((k, k, w - k, h - k))


def match_colors(img, ref):
    a = np.asarray(img.convert("RGB")).astype(np.float64)
    r = np.asarray(ref.convert("RGB")).astype(np.float64)
    out = np.empty_like(a)
    bins = np.arange(257)
    for c in range(3):
        sh, _ = np.histogram(a[..., c], bins=bins, density=True)
        rh, _ = np.histogram(r[..., c], bins=bins, density=True)
        lut = np.interp(np.cumsum(sh) / sh.sum(),
                        np.cumsum(rh) / rh.sum(), np.arange(256))
        out[..., c] = lut[a[..., c].astype(np.uint8)]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def run(inp, prefix, ref=None, trim=0.04, overlap=0.25, seam=True, blend="cut"):
    out = Path(prefix)
    out.parent.mkdir(parents=True, exist_ok=True)
    img = trim_border(Image.open(inp), trim)
    if ref:
        img = match_colors(img, Image.open(ref))
    if seam:
        img = make_seamless(img, overlap, blend=blend)
    img.save(f"{prefix}_seamless.png")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("input")
    p.add_argument("-o", "--prefix", required=True)
    p.add_argument("--ref", default=None)
    p.add_argument("--trim", type=float, default=0.04)
    p.add_argument("--overlap", type=float, default=0.25)
    p.add_argument("--blend", choices=["cut", "feather"], default="cut")
    p.add_argument("--no-seam", action="store_true")
    a = p.parse_args()
    run(a.input, a.prefix, a.ref, a.trim, a.overlap, seam=not a.no_seam, blend=a.blend)
