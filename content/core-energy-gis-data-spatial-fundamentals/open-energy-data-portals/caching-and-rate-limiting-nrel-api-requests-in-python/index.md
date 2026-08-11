---
title: Caching and Rate Limiting NREL API Requests in Python
description: Stay inside an NREL API quota while keeping a pipeline fast — a content-addressed cache, a token-bucket limiter shared across workers, conditional requests, and the accounting that shows where the quota actually went.
slug: caching-and-rate-limiting-nrel-api-requests-in-python
type: article
breadcrumb: Caching & Rate Limiting NREL Requests
datePublished: 2026-08-11
dateModified: 2026-08-11
---

# Caching and Rate Limiting NREL API Requests in Python

The scenario: a nightly resource refresh starts failing at 03:40 with `429 Too Many Requests`, and
the cause turns out to be an analyst exploring the same API interactively that afternoon on the same
key. The quota is per key, the pipeline had no idea the budget was already spent, and every retry
made it worse. This page builds the client that shares a budget and stops asking for things it
already has, and it extends
[open energy data portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/).

## Root-cause analysis

Three properties of energy-portal APIs make naive clients fail predictably.

1. **Quotas are per key, not per process.** NREL enforces an hourly and a daily cap against the API
   key, so any limiter scoped to one process is blind to every other consumer of that key —
   including a notebook and a colleague.
2. **The same request is made repeatedly.** Resource data for a fixed point and year does not change
   between runs, yet a pipeline without a cache re-fetches it on every execution, spending quota on
   bytes it already has on disk.
3. **Retries amplify.** A 429 answered by an immediate retry consumes another unit of quota and
   arrives sooner than the window resets, so a naive retry loop turns a brief throttle into a
   sustained one.

<svg viewBox="0 0 940 400" role="img" aria-label="Where an hourly API quota actually goes. Of a 1,000-request hourly allowance, a nightly resource refresh spends 340, an interactive session spends 180, a failed run retried 220 requests it had already made, and 210 were cache hits that never left the machine. The retries and the uncached repeats together are more than half the spend, and both are recoverable." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>An hourly quota, accounted by consumer</title>
  <desc>A stacked bar of a 1,000-request hourly quota divided by consumer: the nightly refresh at 340 requests, an interactive analyst session at 180, retries after a failure at 220, and a reserve of 50 held back. A separate bar shows 210 requests served from the local cache that never consumed quota at all. Annotations mark the retries as recoverable through a limiter that respects the rate-limit headers, and the reserve as what keeps an interactive user from being locked out by a batch job.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="400"/>
  <defs><marker id="nr1-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">1 000 requests an hour, per key — not per process</text>
  <rect x="40" y="76" width="292.12" height="62" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="186.06" y="114" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">340</text>
  <rect x="335.12" y="76" width="153.24" height="62" rx="5" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.3"/>
  <text x="411.74" y="114" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">180</text>
  <rect x="491.36" y="76" width="187.96" height="62" rx="5" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.3"/>
  <text x="585.34" y="114" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">220</text>
  <rect x="682.32" y="76" width="179.28" height="62" rx="5" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.3"/>
  <text x="771.96" y="114" text-anchor="middle" font-size="13" fill="currentColor" font-weight="700">210</text>
  <rect x="864.6" y="76" width="40.4" height="62" rx="5" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.3"/>
  <rect x="40" y="168" width="16" height="16" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="66" y="181" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">nightly refresh — 340 requests</text>
  <rect x="40" y="194" width="16" height="16" rx="3" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.2"/>
  <text x="66" y="207" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">interactive session — 180 requests</text>
  <rect x="40" y="220" width="16" height="16" rx="3" fill="#F6DCDC" stroke="#C85B5B" stroke-width="1.2"/>
  <text x="66" y="233" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">retries after a failure — 220 requests</text>
  <rect x="40" y="246" width="16" height="16" rx="3" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.2"/>
  <text x="66" y="259" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">unused — 210 requests</text>
  <rect x="40" y="272" width="16" height="16" rx="3" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.2"/>
  <text x="66" y="285" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.9">reserve held back — 50 requests</text>
  <rect x="470" y="168" width="438" height="73" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="689.0" y="190" text-anchor="middle" font-size="11.5" fill="currentColor">210 further requests were answered</text>
  <text x="689.0" y="209" text-anchor="middle" font-size="11.5" fill="currentColor">from the local cache and never</text>
  <text x="689.0" y="228" text-anchor="middle" font-size="11.5" fill="currentColor">touched the quota at all</text>
  <rect x="470" y="262" width="438" height="73" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="689.0" y="284" text-anchor="middle" font-size="11.5" fill="currentColor">The 220 retries are recoverable:</text>
  <text x="689.0" y="303" text-anchor="middle" font-size="11.5" fill="currentColor">back off on the rate-limit header,</text>
  <text x="689.0" y="322" text-anchor="middle" font-size="11.5" fill="currentColor">not on a guess</text>
  <rect x="40" y="322" width="408" height="54" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="244.0" y="344" text-anchor="middle" font-size="11.5" fill="currentColor">The reserve is what stops a batch job</text>
  <text x="244.0" y="363" text-anchor="middle" font-size="11.5" fill="currentColor">locking an analyst out of a single lookup</text>
</svg>

## Pre-flight validation

Before any request, know what the budget is and how much of it is left. NREL returns the remaining
allowance in response headers, so the client can carry an accurate picture rather than a guess.

```python
from dataclasses import dataclass


@dataclass
class QuotaState:
    limit_hour: int
    remaining_hour: int
    limit_day: int
    remaining_day: int

    @classmethod
    def from_headers(cls, headers) -> "QuotaState":
        """NREL publishes the remaining allowance on every response."""
        return cls(
            limit_hour=int(headers.get("X-RateLimit-Limit", 0) or 0),
            remaining_hour=int(headers.get("X-RateLimit-Remaining", 0) or 0),
            limit_day=int(headers.get("X-RateLimit-Limit-Day", 0) or 0),
            remaining_day=int(headers.get("X-RateLimit-Remaining-Day", 0) or 0),
        )

    def can_spend(self, n: int, *, reserve: int = 50) -> bool:
        """Keep a reserve so an interactive user is never locked out by a batch job."""
        return self.remaining_hour - n >= reserve and self.remaining_day - n >= reserve
```

The reserve is the part worth arguing for: a batch job that spends the last request of the hour
leaves an analyst unable to check a single site, and the resulting workaround is usually a second key
that nobody tracks.

## Fix implementation

The client below is content-addressed, so an identical request is answered from disk, and rate
limited through a shared token bucket, so every process on the key draws from one budget.

```python
import hashlib
import json
import os
import time
from pathlib import Path

import requests


class SharedTokenBucket:
    """A token bucket held in a file, so several processes share one budget."""

    def __init__(self, path: str, *, rate_per_sec: float, capacity: int):
        self.path = Path(path)
        self.rate = rate_per_sec
        self.capacity = capacity
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def acquire(self, *, timeout_s: float = 120.0) -> None:
        deadline = time.monotonic() + timeout_s
        while True:
            state = self._read()
            now = time.time()
            tokens = min(
                self.capacity,
                state["tokens"] + (now - state["updated"]) * self.rate,
            )
            if tokens >= 1.0:
                self._write({"tokens": tokens - 1.0, "updated": now})
                return
            if time.monotonic() > deadline:
                raise TimeoutError("rate limiter: no token available within the timeout")
            time.sleep(max(0.05, (1.0 - tokens) / self.rate))

    def _read(self) -> dict:
        try:
            return json.loads(self.path.read_text())
        except (OSError, json.JSONDecodeError):
            return {"tokens": float(self.capacity), "updated": time.time()}

    def _write(self, state: dict) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state))
        os.replace(tmp, self.path)          # atomic, so a crash cannot corrupt the budget


def cached_get(
    url: str,
    params: dict,
    *,
    cache_dir: str,
    bucket: SharedTokenBucket,
    session: requests.Session | None = None,
    ttl_s: float | None = None,
) -> tuple[dict, dict]:
    """Content-addressed GET: identical parameters are answered from disk."""
    key_material = json.dumps({"url": url, "params": _without_key(params)}, sort_keys=True)
    key = hashlib.sha256(key_material.encode()).hexdigest()[:32]
    blob = Path(cache_dir) / key[:2] / f"{key}.json"

    if blob.exists() and (ttl_s is None or time.time() - blob.stat().st_mtime < ttl_s):
        return json.loads(blob.read_text()), {"cache": "hit", "key": key}

    bucket.acquire()
    sess = session or requests.Session()
    response = sess.get(url, params=params, timeout=60)
    response.raise_for_status()
    payload = response.json()

    blob.parent.mkdir(parents=True, exist_ok=True)
    blob.write_text(json.dumps(payload))
    quota = QuotaState.from_headers(response.headers)
    return payload, {"cache": "miss", "key": key, "quota": quota.__dict__}


def _without_key(params: dict) -> dict:
    """The API key must never enter the cache key — it is a credential, not a parameter."""
    return {k: v for k, v in params.items() if k.lower() not in {"api_key", "apikey"}}
```

Excluding the API key from the cache key matters twice over: it keeps a credential out of a filename,
and it means two keys share one cache instead of duplicating every payload.

<svg viewBox="0 0 940 392" role="img" aria-label="How a content-addressed cache key is built. The request URL and its parameters are normalised — coordinates rounded to the precision the API honours, keys sorted, and the API key removed because it identifies the caller rather than the request — then hashed. Two workers, two API keys and two runs all produce the same key for the same question, so they share one cached payload." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>From request to cache key, with the credential removed</title>
  <desc>A left-to-right flow. A request with a URL, latitude and longitude at full float precision, a year, and an API key enters a normalisation step that rounds the coordinates to four decimal places, sorts the parameter keys and removes the API key entirely. The normalised JSON is hashed with SHA-256 and truncated to 32 characters, producing a path of two hex characters as a directory and the full key as a filename. Two annotations record that removing the credential keeps it out of a filename and lets two API keys share one cache, and that a volatile parameter such as a timestamp is what usually destroys the hit rate.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="392"/>
  <defs><marker id="nr2-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">The cache key is the question, never the caller</text>
  <rect x="30" y="76" width="250" height="111" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="155.0" y="98" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">request</text>
  <text x="155.0" y="117" text-anchor="middle" font-size="11" fill="currentColor">lat=35.22201938</text>
  <text x="155.0" y="136" text-anchor="middle" font-size="11" fill="currentColor">lon=-101.83130221</text>
  <text x="155.0" y="155" text-anchor="middle" font-size="11" fill="currentColor">year=2020</text>
  <text x="155.0" y="174" text-anchor="middle" font-size="11" fill="currentColor">api_key=SECRET</text>
  <line x1="288" y1="140" x2="328" y2="140" stroke="currentColor" stroke-width="1.4" marker-end="url(#nr2-arr)"/>
  <rect x="336" y="76" width="262" height="92" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="467.0" y="98" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">normalise</text>
  <text x="467.0" y="117" text-anchor="middle" font-size="10.5" fill="currentColor">lat=35.2220 · lon=-101.8313</text>
  <text x="467.0" y="136" text-anchor="middle" font-size="11" fill="currentColor">keys sorted</text>
  <text x="467.0" y="155" text-anchor="middle" font-size="11" fill="currentColor" font-weight="700">api_key removed</text>
  <line x1="606" y1="140" x2="646" y2="140" stroke="currentColor" stroke-width="1.4" marker-end="url(#nr2-arr)"/>
  <rect x="654" y="76" width="254" height="54" rx="7" fill="#DDF0E2" stroke="#3D8B5F" stroke-width="1.5"/>
  <text x="781.0" y="98" text-anchor="middle" font-size="12" fill="currentColor" font-weight="700">sha256[:32]</text>
  <text x="781.0" y="117" text-anchor="middle" font-size="11" fill="currentColor">a3/a3f19c…d41.json</text>
  <rect x="30" y="236" width="434" height="54" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="247.0" y="258" text-anchor="middle" font-size="11.5" fill="currentColor">Removing the credential keeps it out of a</text>
  <text x="247.0" y="277" text-anchor="middle" font-size="11.5" fill="currentColor">filename and lets two keys share one cache</text>
  <rect x="488" y="236" width="420" height="54" rx="7" fill="#FFE3BE" stroke="#F4A261" stroke-width="1.5"/>
  <text x="698.0" y="258" text-anchor="middle" font-size="11.5" fill="currentColor">A volatile parameter — a timestamp, a</text>
  <text x="698.0" y="277" text-anchor="middle" font-size="11.5" fill="currentColor">request id — is what destroys the hit rate</text>
  <text x="30" y="344" text-anchor="start" font-size="11.5" fill="currentColor" opacity="0.85">Round coordinates to the precision the API actually honours: four decimal places is about 11 metres.</text>
</svg>

## Fallback routing and performance tuning

- **Give each job its own key.** Quotas are per key, so a dedicated pipeline key means an interactive
  session cannot exhaust the nightly budget, and the logs identify which consumer hit the limit.
- **Cache the raw payload, not the parsed frame.** The parse is cheap and the bytes are the evidence;
  a raw cache also survives a change to the parser.
- **Set a TTL by data type, not globally.** A historical NSRDB year never changes and deserves no TTL
  at all; a queue endpoint that updates monthly deserves a month.
- **Use conditional requests where the endpoint supports them.** An `If-None-Match` that returns 304
  costs a request against the quota but almost no bytes, which matters when the payload is large and
  the change is rare.
- **Back off on the header, not on a guess.** When `X-RateLimit-Remaining` reaches zero, sleep until
  the window resets rather than retrying with exponential backoff into a wall.

## Downstream validation

```python
def assert_quota_accounting(stats: dict, *, min_hit_rate: float = 0.6) -> None:
    """A pipeline that re-fetches what it already has is spending quota on nothing."""
    total = stats["hits"] + stats["misses"]
    assert total > 0, "no requests recorded — the accounting is not wired up"
    hit_rate = stats["hits"] / total
    assert hit_rate >= min_hit_rate, (
        f"cache hit rate {hit_rate:.0%} below {min_hit_rate:.0%} — "
        "check the cache key for a volatile parameter such as a timestamp"
    )
    assert stats["throttled"] == 0 or stats["throttled"] / total < 0.02, (
        f"{stats['throttled']} throttled responses — the limiter is set above the real quota"
    )
```

<svg viewBox="0 0 940 396" role="img" aria-label="Cache hit rate over a month of nightly runs. The first run is a cold cache and hits nothing; by the fourth night the rate is 71 percent and by the tenth it plateaus near 94, because only genuinely new sites and revised years miss. The step down on night 18 is a code change that added a timestamp to the cache key — the classic regression, visible immediately in the rate and invisible in every other metric." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;font-family:inherit">
  <title>Cache hit rate across a month, with one regression</title>
  <desc>A line chart of daily cache hit rate over 30 nightly runs. The rate starts at zero on the cold first night, climbs steeply through 71 percent on night four, and plateaus between 92 and 95 percent from night ten. On night 18 it drops abruptly to 6 percent and recovers over the following three nights, annotated as a code change that introduced a timestamp into the cache key. A dashed threshold marks the 60 percent floor below which the assertion fires.</desc>
  <rect class="svg-bg" x="0" y="0" width="940" height="396"/>
  <defs><marker id="nr3-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
  <text x="20" y="30" text-anchor="start" font-size="13" fill="currentColor" font-weight="700">Hit rate is the metric that notices a bad cache key</text>
  <line x1="110" y1="276" x2="880" y2="276" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="110" y1="70" x2="110" y2="276" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  <line x1="106" y1="276.0" x2="880" y2="276.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="280.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">0%</text>
  <line x1="106" y1="226.0" x2="880" y2="226.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="230.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">25%</text>
  <line x1="106" y1="176.0" x2="880" y2="176.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="180.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">50%</text>
  <line x1="106" y1="126.0" x2="880" y2="126.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="130.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">75%</text>
  <line x1="106" y1="76.0" x2="880" y2="76.0" stroke="currentColor" stroke-width="0.8" opacity="0.16"/>
  <text x="100" y="80.0" text-anchor="end" font-size="10.5" fill="currentColor" opacity="0.85">100%</text>
  <line x1="110.0" y1="276" x2="110.0" y2="281" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="110.0" y="296" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">night 1</text>
  <line x1="348.9655172413793" y1="276" x2="348.9655172413793" y2="281" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="348.9655172413793" y="296" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">night 10</text>
  <line x1="614.4827586206897" y1="276" x2="614.4827586206897" y2="281" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="614.4827586206897" y="296" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">night 20</text>
  <line x1="880.0" y1="276" x2="880.0" y2="281" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  <text x="880.0" y="296" text-anchor="middle" font-size="10.5" fill="currentColor" opacity="0.85">night 30</text>
  <path d="M110.0,276.0 L136.6,200.0 L163.1,160.0 L189.7,134.0 L216.2,116.0 L242.8,104.0 L269.3,98.0 L295.9,94.0 L322.4,90.0 L349.0,88.0 L375.5,88.0 L402.1,90.0 L428.6,86.0 L455.2,88.0 L481.7,88.0 L508.3,90.0 L534.8,86.0 L561.4,264.0 L587.9,188.0 L614.5,140.0 L641.0,100.0 L667.6,90.0 L694.1,88.0 L720.7,86.0 L747.2,88.0 L773.8,88.0 L800.3,86.0 L826.9,88.0 L853.4,90.0 L880.0,86.0" fill="none" stroke="#5BA8C8" stroke-width="2.6"/>
  <line x1="110" y1="156.0" x2="880" y2="156.0" stroke="#F4A261" stroke-width="1.4" stroke-dasharray="5 4"/>
  <text x="874" y="146.0" text-anchor="end" font-size="11" fill="#7A4A1A" font-weight="700">assertion floor 60%</text>
  <circle cx="561.3793103448276" cy="264.0" r="6" fill="#C85B5B" stroke="#C85B5B" stroke-width="1"/>
  <text x="573.3793103448276" y="252.0" text-anchor="start" font-size="11" fill="#7A4A1A" font-weight="700">timestamp added to the cache key</text>
  <rect x="110" y="316" width="770" height="40" rx="7" fill="#DCEEF6" stroke="#5BA8C8" stroke-width="1.5"/>
  <text x="495.0" y="335" text-anchor="middle" font-size="11" fill="currentColor">Nothing else moved: the run succeeded, the row counts were normal, and the only symptom was a quota</text>
  <text x="495.0" y="350" text-anchor="middle" font-size="11" fill="currentColor">spend that quietly went back to cold-cache levels.</text>
</svg>


## What to cache, and for how long

Not every response deserves the same treatment, and a single global TTL is the usual reason a cache
is either stale or useless.

**Immutable by construction.** A historical NSRDB year for a fixed point will never change: the
source reprocesses whole archives on a multi-year cadence and publishes them under a new version.
These deserve no TTL at all, only a version in the cache key, and they are the bulk of a resource
pipeline's traffic.

**Slow-moving.** Dataset catalogues, station metadata and model coefficients change a few times a
year. A TTL measured in weeks is right, and the cost of being a week stale is nil.

**Revised on a schedule.** Monthly series that are back-revised — most EIA data — should carry a TTL
just shorter than the publication cadence, so the pipeline picks up a revision on the first run after
it lands rather than a month later.

**Genuinely live.** Real-time or day-ahead endpoints should not be cached beyond minutes, and
arguably should not be cached at all; a stale price or a stale outage is worse than a slow one.

Tagging each endpoint with its class at the client boundary — rather than deciding per call site —
keeps the policy in one place and makes the cache's behaviour explainable. The accounting then splits
cleanly: hits against immutable data are pure saving, and a low hit rate on live endpoints is
expected rather than a defect.

## Frequently asked questions

### Why does the cache hit rate fall to almost zero after a code change?

Almost always because a volatile value entered the cache key — a timestamp, a request identifier, a
float formatted with full precision. The fix is to normalise the parameters before hashing: round
coordinates to the precision the API actually honours, sort the keys, and exclude anything that
identifies the caller rather than the request.

### Should the cache live on disk or in object storage?

Disk for a single machine, object storage for a fleet — and the same content-addressed key works for
both. The property that matters is that the key is derived from the request, so two workers computing
the same key find the same object without coordinating.

### Is a token bucket better than a simple sleep between requests?

Yes, because it allows bursts up to the capacity while holding the average rate, which matches how
quotas are actually enforced. A fixed sleep either wastes the burst allowance or exceeds the
sustained rate, and it cannot be shared between processes.

### What happens if two workers write the limiter file at once?

The atomic replace means neither sees a corrupt file, and the worst case is that one worker's token
accounting is briefly stale — it spends a token the other also spent. With a reserve in place that is
harmless. If the fleet is large enough for that to matter, the same interface backs onto Redis with a
Lua script and no other change.

### Should the pipeline stop when the quota is nearly gone?

It should stop cleanly rather than fail messily. Reaching the reserve is a legitimate outcome: write
what has been fetched, record which partitions are outstanding, and exit with a status that the
scheduler can retry after the window resets. Burning through the reserve and then failing mid-write
is worse in every respect.

### How do I know how much quota a run will need?

Count the cache misses in a dry run. Because the cache key is deterministic, a pass that only checks
for the presence of each key gives an exact miss count without spending a single request — which is
enough to decide whether tonight's run fits in the remaining budget.

## Related

- [Open Energy Data Portals](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/) — the parent workflow and its portal comparison
- [Downloading EIA & OpenEI Datasets with Python Requests](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/downloading-eia-and-openei-datasets-with-python-requests/) — the response taxonomy this client sits behind
- [Validating NREL Solar Datasets with Python](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/open-energy-data-portals/validating-nrel-solar-datasets-with-python/) — validating what the cache returns
- [Spatial Pipeline Orchestration & Deployment](https://www.renewable-energy-grid-gis.org/core-energy-gis-data-spatial-fundamentals/spatial-pipeline-orchestration-and-deployment/) — the shared concurrency limits this cooperates with
