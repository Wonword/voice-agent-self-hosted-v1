---
name: calendar-check
description: Check ALL Google Calendars including OMNES schedule. Use this for morning brief to get complete agenda - not just primary calendar.
---

# Calendar Check Skill

## IMPORTANT FOR LLAMA 3.2

**When generating a morning brief, ALWAYS use this command:**

```bash
python3 /Users/obiwon/.openclaw/workspace/scripts/calendar-check.py
```

**Do NOT use google-calendar.py --today** — it only checks the primary calendar!

## Why This Matters

- **Primary calendar** (wonword@gmail.com) = personal events only
- **OMNES calendars** (HYP - KIM WON) = teaching schedule, classes
- The user teaches at OMNES and needs to see those events!

## What It Does

Checks ALL calendars:
1. wonword@gmail.com (primary)
2. won@pasdedieux.com
3. HYP - KIM WON calendars (OMNES teaching schedule)
4. Family calendar
5. Any other subscribed calendars

## Output Format

```
📅 Found X event(s):

   HH:MM - Event Title
   📁 Calendar Name
   📍 Location (if any)
```

## Example Output

```
📅 Found 3 event(s):

   13:00 - Management de Projet - M2 Conseil
   📁 OMNES
   📍 Salle P346 - EIFFEL 2

   14:15 - Innovation 5.0 - ESCE MSc
   📁 OMNES
   📍 Salle CD-3.23
```

## For Morning Brief

**Always include this command:**
```bash
echo "📅 TODAY'S SCHEDULE:" && python3 /Users/obiwon/.openclaw/workspace/scripts/calendar-check.py
```

This ensures Won sees his complete teaching schedule from OMNES!
