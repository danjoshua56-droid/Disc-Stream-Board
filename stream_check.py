"""
stream_check.py
---------------
Runs on GitHub Actions cron schedule.
1. Reads channels.json (source of truth for tracked channels)
2. Calls Twitch API for live status, viewer counts, thumbnails
3. Writes data.json which the React board reads
4. Posts rich embeds to Discord — edits the same message each run (no spam)
"""

import json
import os
import sys
import requests
from datetime import datetime, timezone

TWITCH_CLIENT_ID     = os.environ["TWITCH_CLIENT_ID"]
TWITCH_CLIENT_SECRET = os.environ["TWITCH_CLIENT_SECRET"]
DISCORD_WEBHOOK_URL  = os.environ.get("DISCORD_WEBHOOK_URL", "")

CHANNELS_FILE  = "channels.json"
DATA_FILE      = "data.json"
MESSAGE_ID_FILE = "discord_message_id.txt"

# ── Twitch helpers ────────────────────────────────────────────────────────────

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

    chunks = [channel_names[i:i+100] for i in range(0, len(channel_names), 100)]
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


# ── File helpers ──────────────────────────────────────────────────────────────

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


def read_message_id():
    try:
        with open(MESSAGE_ID_FILE, "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return None


def write_message_id(message_id):
    with open(MESSAGE_ID_FILE, "w") as f:
        f.write(str(message_id))
    print(f"  ✓ saved message ID: {message_id}")


# ── Discord helpers ───────────────────────────────────────────────────────────

def format_viewers(n):
    if n >= 1000:
        return f"{n/1000:.1f}K"
    return str(n)


def time_ago(iso_str):
    if not iso_str:
        return "Never"
    diff = datetime.now(timezone.utc) - datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    mins = int(diff.total_seconds() / 60)
    if mins < 1:  return "Just now"
    if mins < 60: return f"{mins}m ago"
    hrs = mins // 60
    if hrs < 24:  return f"{hrs}h ago"
    return f"{hrs // 24}d ago"


def build_embeds(channels):
    """
    One embed per channel — live and offline.
    Live:    red left bar, stream thumbnail as image, pfp as thumbnail
    Offline: grey left bar, pfp as thumbnail
    Footer:  purple summary bar with live count and timestamp
    """
    embeds = []
    live    = [c for c in channels if c.get("isLive")]
    offline = [c for c in channels if not c.get("isLive")]

    # ── Live channel embeds ───────────────────────────────────────────────────
    for ch in live:
        twitch_url = f"https://twitch.tv/{ch['name']}"
        viewers    = format_viewers(ch.get("viewers", 0))

        desc_lines = []
        if ch.get("game"):
            desc_lines.append(f"🎮  **{ch['game']}**")
        if ch.get("title"):
            desc_lines.append(f"_{ch['title']}_")
        desc_lines.append("")
        desc_lines.append(f"[**Watch Now →**]({twitch_url})")

        embed = {
            "color":  0xEB0400,
            "author": {
                "name":     f"● LIVE  •  {ch.get('displayName', ch['name'])}  •  {viewers} viewers",
                "url":      twitch_url,
                "icon_url": ch.get("profileImage") or "",
            },
            "description": "\n".join(desc_lines),
            "url": twitch_url,
        }

        # Profile picture as right-side thumbnail
        if ch.get("profileImage"):
            embed["thumbnail"] = {"url": ch["profileImage"]}

        # Stream thumbnail as full-width image
        if ch.get("thumbnailUrl"):
            embed["image"] = {"url": ch["thumbnailUrl"]}

        embeds.append(embed)

    # ── Offline channel embeds — one per channel with pfp ────────────────────
    for ch in offline:
        twitch_url = f"https://twitch.tv/{ch['name']}"
        last       = time_ago(ch.get("lastSeen"))

        embed = {
            "color": 0x4E5058,
            "author": {
                "name":     f"⚫  {ch.get('displayName', ch['name'])}  —  Offline",
                "url":      twitch_url,
                "icon_url": ch.get("profileImage") or "",
            },
            "description": f"Last seen {last}  •  [twitch.tv/{ch['name']}]({twitch_url})",
        }

        # Profile picture as right-side thumbnail for offline too
        if ch.get("profileImage"):
            embed["thumbnail"] = {"url": ch["profileImage"]}

        embeds.append(embed)

    # ── Summary footer embed ──────────────────────────────────────────────────
    live_count = len(live)
    total      = len(channels)
    now_str    = datetime.now(timezone.utc).strftime("%I:%M %p UTC")

    embeds.append({
        "color":       0x9147FF,
        "description": f"**{live_count}/{total}** channels live  •  Updated {now_str}",
    })

    return embeds


def get_webhook_id_token():
    """Extract webhook ID and token from the webhook URL."""
    # URL format: https://discord.com/api/webhooks/{id}/{token}
    parts = DISCORD_WEBHOOK_URL.rstrip("/").split("/")
    return parts[-2], parts[-1]


def post_or_edit_discord(channels):
    if not DISCORD_WEBHOOK_URL:
        print("  ⚠ DISCORD_WEBHOOK_URL not set — skipping")
        return

    live_count = sum(1 for c in channels if c.get("isLive"))
    embeds     = build_embeds(channels)
    content    = (
        f"📡  **Stream update** — {live_count} live right now"
        if live_count > 0
        else "📡  **Stream update** — nobody live right now"
    )

    payload = {
        "username": "Stream Board",
        "content":  content,
        "embeds":   embeds[:10],
    }

    existing_id = read_message_id()
    wh_id, wh_token = get_webhook_id_token()

    if existing_id:
        # Try to edit the existing message
        edit_url = f"https://discord.com/api/webhooks/{wh_id}/{wh_token}/messages/{existing_id}"
        r = requests.patch(edit_url, json=payload, timeout=10)

        if r.status_code == 200:
            print(f"  ✓ Discord message edited — {live_count} live")
            return
        else:
            # Message was deleted or expired — fall through to post new
            print(f"  ⚠ Edit failed ({r.status_code}) — posting new message")

    # Post a new message and save its ID
    r = requests.post(
        f"{DISCORD_WEBHOOK_URL}?wait=true",
        json=payload,
        timeout=10,
    )

    if r.status_code in (200, 204):
        msg_id = r.json().get("id")
        if msg_id:
            write_message_id(msg_id)
        print(f"  ✓ Discord message posted — {live_count} live")
    else:
        print(f"  ✗ Discord post failed: {r.status_code} {r.text}", file=sys.stderr)


# ── Main ──────────────────────────────────────────────────────────────────────

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

    print("  Fetching Twitch token…")
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
        status      = "🔴 LIVE" if merged["isLive"] else "⚫ offline"
        viewer_str  = f" ({format_viewers(merged['viewers'])} viewers)" if merged["isLive"] else ""
        print(f"    {merged['displayName']}: {status}{viewer_str}")

    write_json(DATA_FILE, {"channels": updated_channels, "pending": pending, "updatedAt": now})
    write_json(CHANNELS_FILE, {"channels": updated_channels, "pending": pending})

    post_or_edit_discord(updated_channels)

    live_count = sum(1 for c in updated_channels if c.get("isLive"))
    print(f"  Done — {live_count}/{len(updated_channels)} live")


if __name__ == "__main__":
    main()
