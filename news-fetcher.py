#!/usr/bin/env python3
"""
News Fetcher - Get latest headlines using NewsAPI
Free tier: 100 requests/day
"""

import json
import requests
import sys
from datetime import datetime

# Load API key
CREDS_FILE = '/Users/obiwon/.openclaw/credentials/newsapi.json'

def load_api_key():
    try:
        with open(CREDS_FILE) as f:
            creds = json.load(f)
            return creds.get('news_api_key')
    except:
        return None

def get_headlines(category='general', country='us', count=5):
    """Get top headlines"""
    api_key = load_api_key()
    if not api_key:
        return {"error": "NewsAPI key not configured"}
    
    url = 'https://newsapi.org/v2/top-headlines'
    params = {
        'apiKey': api_key,
        'category': category,
        'country': country,
        'pageSize': count
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if data.get('status') != 'ok':
            return {"error": data.get('message', 'Unknown error')}
        
        articles = data.get('articles', [])
        headlines = []
        
        for article in articles[:count]:
            headlines.append({
                'title': article.get('title', ''),
                'source': article.get('source', {}).get('name', ''),
                'url': article.get('url', ''),
                'published': article.get('publishedAt', '')
            })
        
        return {"headlines": headlines}
        
    except Exception as e:
        return {"error": str(e)}

def search_news(query, count=5):
    """Search for specific news"""
    api_key = load_api_key()
    if not api_key:
        return {"error": "NewsAPI key not configured"}
    
    url = 'https://newsapi.org/v2/everything'
    params = {
        'apiKey': api_key,
        'q': query,
        'sortBy': 'publishedAt',
        'pageSize': count,
        'language': 'en'
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if data.get('status') != 'ok':
            return {"error": data.get('message', 'Unknown error')}
        
        articles = data.get('articles', [])
        results = []
        
        for article in articles[:count]:
            results.append({
                'title': article.get('title', ''),
                'source': article.get('source', {}).get('name', ''),
                'url': article.get('url', ''),
                'published': article.get('publishedAt', '')
            })
        
        return {"articles": results}
        
    except Exception as e:
        return {"error": str(e)}

def format_news(news_data, topic=""):
    """Format news for display"""
    if "error" in news_data:
        return f"❌ News Error: {news_data['error']}"
    
    lines = []
    
    if "headlines" in news_data:
        lines.append(f"📰 Top Headlines{' - ' + topic if topic else ''}:")
        for i, article in enumerate(news_data['headlines'], 1):
            lines.append(f"{i}. {article['title']}")
            lines.append(f"   Source: {article['source']}")
    
    elif "articles" in news_data:
        lines.append(f"📰 News Results{' - ' + topic if topic else ''}:")
        for i, article in enumerate(news_data['articles'], 1):
            lines.append(f"{i}. {article['title']}")
            lines.append(f"   Source: {article['source']}")
    
    return "\n".join(lines)

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='News Fetcher')
    parser.add_argument('--headlines', action='store_true', help='Get top headlines')
    parser.add_argument('--search', type=str, help='Search for specific news')
    parser.add_argument('--category', type=str, default='general', help='Category (business, tech, etc.)')
    parser.add_argument('--count', type=int, default=5, help='Number of articles')
    
    args = parser.parse_args()
    
    if args.search:
        news = search_news(args.search, args.count)
        print(format_news(news, args.search))
    elif args.headlines:
        news = get_headlines(args.category, count=args.count)
        print(format_news(news, args.category))
    else:
        # Default: get general headlines
        news = get_headlines(count=5)
        print(format_news(news))

if __name__ == "__main__":
    main()
