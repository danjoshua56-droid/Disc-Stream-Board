"""
stream_check.py
---------------
Runs on GitHub Actions cron schedule.
1. Reads channels.json (the source of truth for which channels to track)
2. Calls Twitch API for live status, viewer counts, thumbnails
3. Writes data.json which the React board reads
4. Optionally posts an update embed to a Discord webhook
"""

import json
import os
import sys
import requests
from datetime import datetime, timezone

# ── Config (all set as GitHub Actions secrets) ──────────────────────────────
TWITCH_CLIENT_ID     = os.environ["TWITCH_CLIENT_ID"]
TWITCH_CLIENT_SECRET = os.environ["TWITCH_CLIENT_SECRET"]
DISCORD_WEBHOOK_URL  = os.environ.get("DISCORD_WEBHOOK_URL", "")  # optional

CHANNELS_FILE = "channels.json"   # source of truth — list of channels to track
DATA_FILE     = "data.json"       # output read by the React board
PENDING_FILE  = "pending.json"    # submitted channels awaiting approval

# ── Twitch helpers ───────────────────────────────────────────────────────────

def get_token():
    r = requests.post(
        "https://id.twitch.tv/oauth2/token",
        params={
            "client_id": TWITCH_CLIENT_ID,
            "client_secret": TWITCH_CLIENT_SECRET,
            "grant_type": "client_credentials",
        },
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def twitch_get(url, token, params):
    headers = {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": f"Bearer {token}",
    }
    r = requests.get(url, headers=headers, params=params, timeout=10)
    r.raise_for_status()
    return r.json().get("data", [])


def fetch_twitch_data(channel_names, token):
    if not channel_names:
        return {}

    # Twitch API supports up to 100 logins per request
    chunks = [channel_names[i:i+100] for i in range(0, len(channel_names), 100)]
    users, streams = [], []

    for chunk in chunks:
        users  += twitch_get("https://api.twitch.tv/helix/users",   token, [("login", n) for n in chunk])
        streams += twitch_get("https://api.twitch.tv/helix/streams", token, [("user_login", n) for n in chunk])

    stream_map = {s["user_login"].lower(): s for s in streams}
    result = {}

    for user in users:
        login  = user["login"].lower()
        stream = stream_map.get(login)
        result[login] = {
            "displayName":  user["display_name"],
            "profileImage": user["profile_image_url"],
            "isLive":       bool(stream),
            "title":        stream["title"]        if stream else "",
            "game":         stream["game_name"]    if stream else "",
            "viewers":      stream["viewer_count"] if stream else 0,
            "thumbnailUrl": (
                stream["thumbnail_url"]
                .replace("{width}", "440")
                .replace("{height}", "248")
            ) if stream else None,
            "startedAt":    stream["started_at"]   if stream else None,
        }

    return result


# ── File helpers ─────────────────────────────────────────────────────────────

def read_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  ✓ wrote {path}")


# ── Discord webhook ──────────────────────────────────────────────────────────

def post_discord(channels, updated_at):
    if not DISCORD_WEBHOOK_URL:
        return

    live    = [c for c in channels if c.get("isLive")]
    offline = [c for c in channels if not c.get("isLive")]

    embeds = []

    for ch in live:
        embeds.append({
            "color": 0xEB0400,
            "author": {"name": f"● LIVE — {ch['displayName']}"},
            "title": ch.get("title", ""),
            "description": f"🎮 {ch.get('game', '')}" if ch.get("game") else "",
            "url": f"https://twitch.tv/{ch['name']}",
            "thumbnail": {"url": ch["thumbnailUrl"]} if ch.get("thumbnailUrl") else None,
            "footer": {"text": f"👁 {ch.get('viewers', 0):,} viewers"},
        })

    if offline:
        offline_lines = "\n".join(
            f"`{c['displayName']}` — offline" for c in offline
        )
        embeds.append({
            "color": 0x4E5058,
            "title": "Offline",
            "description": offline_lines,
            "footer": {
                "text": f"Updated {updated_at} · stream-board"
            },
        })

    if not embeds:
        return

    payload = {
        "username": "Stream Board",
        "embeds": embeds[:10],  # Discord max 10 embeds per message
    }

    r = requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
    if r.status_code in (200, 204):
        print("  ✓ Discord webhook posted")
    else:
        print(f"  ✗ Discord webhook failed: {r.status_code} {r.text}", file=sys.stderr)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("── stream_check.py ──")

    # Load channels list
    channels_data = read_json(CHANNELS_FILE, {"channels": [], "pending": []})
    channels      = channels_data.get("channels", [])
    pending       = channels_data.get("pending",  [])

    if not channels:
        print("  No channels to check. Add channels via the board UI.")
        # Still write an empty data.json so the board doesn't 404
        write_json(DATA_FILE, {
            "channels":  [],
            "pending":   pending,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        return

    # Get Twitch token
    print(f"  Fetching token…")
    token = get_token()

    # Fetch live data
    names = [c["name"].lower() for c in channels]
    print(f"  Checking {len(names)} channel(s): {', '.join(names)}")
    twitch = fetch_twitch_data(names, token)

    # Merge Twitch data into channel records
    now = datetime.now(timezone.utc).isoformat()
    updated_channels = []

    for ch in channels:
        login = ch["name"].lower()
        td    = twitch.get(login, {})
        merged = {
            **ch,
            "displayName":  td.get("displayName",  ch.get("displayName", ch["name"])),
            "profileImage": td.get("profileImage",  ch.get("profileImage")),
            "isLive":       td.get("isLive",        False),
            "title":        td.get("title",         ""),
            "game":         td.get("game",          ""),
            "viewers":      td.get("viewers",       0),
            "thumbnailUrl": td.get("thumbnailUrl"),
            "startedAt":    td.get("startedAt"),
            # update lastSeen when live
            "lastSeen": now if td.get("isLive") else ch.get("lastSeen"),
        }
        updated_channels.append(merged)
        status = "🔴 LIVE" if merged["isLive"] else "⚫ offline"
        print(f"    {merged['displayName']}: {status}")

    # Write data.json
    output = {
        "channels":  updated_channels,
        "pending":   pending,
        "updatedAt": now,
    }
    write_json(DATA_FILE, output)

    # Also keep channels.json updated with latest metadata
    write_json(CHANNELS_FILE, {"channels": updated_channels, "pending": pending})

    # Post to Discord
    post_discord(updated_channels, now)

    live_count = sum(1 for c in updated_channels if c.get("isLive"))
    print(f"  Done — {live_count}/{len(updated_channels)} live")


if __name__ == "__main__":
    main()
