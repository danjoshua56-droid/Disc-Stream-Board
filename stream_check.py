"""
stream_check.py
---------------
Runs on GitHub Actions cron schedule.
1. Reads channels.json (source of truth for tracked channels)
2. Calls Twitch API for live status, viewer counts, thumbnails
3. Writes data.json which the React board reads
4. Posts rich per-streamer embeds to Discord webhook
"""

import json
import os
import sys
import requests
from datetime import datetime, timezone

TWITCH_CLIENT_ID     = os.environ["TWITCH_CLIENT_ID"]
TWITCH_CLIENT_SECRET = os.environ["TWITCH_CLIENT_SECRET"]
DISCORD_WEBHOOK_URL  = os.environ.get("DISCORD_WEBHOOK_URL", "")

CHANNELS_FILE = "channels.json"
DATA_FILE     = "data.json"

# ── Twitch helpers ───────────────────────────────────────────────────────────

def get_token():
    r = requests.post(
        "https://id.twitch.tv/oauth2/token",
        params={
            "client_id":     TWITCH_CLIENT_ID,
            "client_secret": TWITCH_CLIENT_SECRET,
            "grant_type":    "client_credentials",
        },
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def twitch_get(url, token, params):
    headers = {
        "Client-ID":     TWITCH_CLIENT_ID,
        "Authorization": f"Bearer {token}",
    }
    r = requests.get(url, headers=headers, params=params, timeout=10)
    r.raise_for_status()
    return r.json().get("data", [])


def fetch_twitch_data(channel_names, token):
    if not channel_names:
        return {}

    chunks  = [channel_names[i:i+100] for i in range(0, len(channel_names), 100)]
    users, streams = [], []

    for chunk in chunks:
        users   += twitch_get("https://api.twitch.tv/helix/users",   token, [("login", n) for n in chunk])
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


# ── Discord helpers ───────────────────────────────────────────────────────────

def format_viewers(n):
    if n >= 1000:
        return f"{n/1000:.1f}K"
    return str(n)


def time_ago(iso_str):
    if not iso_str:
        return "Never"
    diff  = datetime.now(timezone.utc) - datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    mins  = int(diff.total_seconds() / 60)
    if mins < 1:   return "Just now"
    if mins < 60:  return f"{mins}m ago"
    hrs = mins // 60
    if hrs  < 24:  return f"{hrs}h ago"
    return f"{hrs // 24}d ago"


def build_discord_embeds(channels, updated_at):
    """
    Build rich Discord embeds:
    - One embed per LIVE channel with thumbnail, game, title, viewer count
    - One combined embed for all offline channels
    - A footer embed with timestamp and board link
    """
    embeds = []
    live    = [c for c in channels if c.get("isLive")]
    offline = [c for c in channels if not c.get("isLive")]

    # ── Live channel embeds ──────────────────────────────────────────────────
    for ch in live:
        twitch_url = f"https://twitch.tv/{ch['name']}"
        viewers    = format_viewers(ch.get("viewers", 0))

        # Build description lines
        desc_lines = []
        if ch.get("game"):
            desc_lines.append(f"🎮  **{ch['game']}**")
        if ch.get("title"):
            desc_lines.append(f"_{ch['title']}_")
        desc_lines.append(f"")
        desc_lines.append(f"[**Watch Now →**]({twitch_url})")

        embed = {
            "color": 0xEB0400,  # live red
            "author": {
                "name":     f"● LIVE  •  {ch.get('displayName', ch['name'])}  •  {viewers} viewers",
                "url":      twitch_url,
                "icon_url": ch.get("profileImage") or "",
            },
            "description": "\n".join(desc_lines),
            "url": twitch_url,
        }

        # Attach stream thumbnail if available
        if ch.get("thumbnailUrl"):
            embed["image"] = {"url": ch["thumbnailUrl"]}

        embeds.append(embed)

    # ── Offline summary embed ────────────────────────────────────────────────
    if offline:
        offline_lines = []
        for ch in offline:
            last = time_ago(ch.get("lastSeen"))
            offline_lines.append(
                f"⚫  **{ch.get('displayName', ch['name'])}**  —  last seen {last}  •  "
                f"[twitch.tv/{ch['name']}](https://twitch.tv/{ch['name']})"
            )

        embeds.append({
            "color":       0x4E5058,  # discord grey
            "title":       "Offline",
            "description": "\n".join(offline_lines),
        })

    # ── Footer / summary embed ───────────────────────────────────────────────
    live_count = len(live)
    total      = len(channels)
    now_str    = datetime.now(timezone.utc).strftime("%I:%M %p UTC")

    embeds.append({
        "color":       0x9147FF,  # twitch purple
        "description": (
            f"**{live_count}/{total}** channels live right now\n"
            f"Updated {now_str}  •  [View full board](https://danjoshua56-droid.github.io/Disc-Stream-Board/)"
        ),
    })

    return embeds


def post_discord(channels, updated_at):
    if not DISCORD_WEBHOOK_URL:
        print("  ⚠ DISCORD_WEBHOOK_URL not set — skipping Discord post")
        return

    live_count = sum(1 for c in channels if c.get("isLive"))

    # Only post if there's something worth reporting
    if not channels:
        print("  No channels to report — skipping Discord post")
        return

    embeds  = build_discord_embeds(channels, updated_at)
    payload = {
        "username":   "Stream Board",
        "avatar_url": "https://brand.twitch.tv/assets/images/black_glitch_wordmark.png",
        "content":    f"📡  **Stream update** — {live_count} live right now" if live_count > 0 else "📡  **Stream update** — nobody live right now",
        "embeds":     embeds[:10],  # Discord max 10 per message
    }

    r = requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
    if r.status_code in (200, 204):
        print(f"  ✓ Discord posted — {live_count} live")
    else:
        print(f"  ✗ Discord failed: {r.status_code} {r.text}", file=sys.stderr)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("── stream_check.py ──")

    channels_data = read_json(CHANNELS_FILE, {"channels": [], "pending": []})
    channels      = channels_data.get("channels", [])
    pending       = channels_data.get("pending",  [])

    if not channels:
        print("  No channels to check. Add channels via the board UI.")
        write_json(DATA_FILE, {
            "channels":  [],
            "pending":   pending,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })
        return

    print(f"  Fetching Twitch token…")
    token = get_token()

    names = [c["name"].lower() for c in channels]
    print(f"  Checking {len(names)} channel(s): {', '.join(names)}")
    twitch = fetch_twitch_data(names, token)

    now = datetime.now(timezone.utc).isoformat()
    updated_channels = []

    for ch in channels:
        login  = ch["name"].lower()
        td     = twitch.get(login, {})
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
            "lastSeen":     now if td.get("isLive") else ch.get("lastSeen"),
        }
        updated_channels.append(merged)
        status = "🔴 LIVE" if merged["isLive"] else "⚫ offline"
        viewers_str = f" ({format_viewers(merged['viewers'])} viewers)" if merged["isLive"] else ""
        print(f"    {merged['displayName']}: {status}{viewers_str}")

    write_json(DATA_FILE, {
        "channels":  updated_channels,
        "pending":   pending,
        "updatedAt": now,
    })

    write_json(CHANNELS_FILE, {"channels": updated_channels, "pending": pending})

    post_discord(updated_channels, now)

    live_count = sum(1 for c in updated_channels if c.get("isLive"))
    print(f"  Done — {live_count}/{len(updated_channels)} live")


if __name__ == "__main__":
    main()
