#!/usr/bin/env python3
"""
Calendar Check - Get today's events from ALL calendars including OMNES
Used by morning brief to get complete schedule
"""

import pickle
from googleapiclient.discovery import build
from datetime import datetime, timedelta
import json

TOKEN_FILE = '/Users/obiwon/.openclaw/credentials/google-tasks-token.pickle'

def get_all_calendars():
    """Get list of all available calendars"""
    with open(TOKEN_FILE, 'rb') as f:
        creds = pickle.load(f)
    
    service = build('calendar', 'v3', credentials=creds)
    calendars = service.calendarList().list().execute().get('items', [])
    
    return [(cal['id'], cal['summary']) for cal in calendars]

def get_today_events():
    """Get events from ALL calendars for today"""
    with open(TOKEN_FILE, 'rb') as f:
        creds = pickle.load(f)
    
    service = build('calendar', 'v3', credentials=creds)
    
    # Today
    now = datetime.utcnow()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat() + 'Z'
    end = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat() + 'Z'
    
    all_events = []
    calendars = get_all_calendars()
    
    for cal_id, cal_name in calendars:
        try:
            events_result = service.events().list(
                calendarId=cal_id,
                timeMin=start,
                timeMax=end,
                maxResults=20,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            for event in events:
                start_time = event['start'].get('dateTime', event['start'].get('date'))
                if 'T' in start_time:
                    time_str = start_time[11:16]
                else:
                    time_str = 'All day'
                
                all_events.append({
                    'time': time_str,
                    'summary': event.get('summary', 'No title'),
                    'calendar': cal_name,
                    'location': event.get('location', '')
                })
        except:
            continue
    
    # Sort by time
    all_events.sort(key=lambda x: x['time'] if x['time'] != 'All day' else '00:00')
    return all_events

def format_schedule(events):
    """Format events for display"""
    if not events:
        return "✨ No events today. You're free!"
    
    lines = [f"📅 Found {len(events)} event(s):\n"]
    
    for event in events:
        cal_short = event['calendar'].replace('HYP - KIM WON - du 04 août 2025 au 01 août 2026', 'OMNES')
        cal_short = cal_short.replace('HYP - KIM Won - du 25 août 2025 au 29 août 2026', 'OMNES')
        
        lines.append(f"   {event['time']} - {event['summary']}")
        lines.append(f"   📁 {cal_short}")
        if event['location']:
            lines.append(f"   📍 {event['location']}")
        lines.append("")
    
    return "\n".join(lines)

if __name__ == "__main__":
    events = get_today_events()
    print(format_schedule(events))
