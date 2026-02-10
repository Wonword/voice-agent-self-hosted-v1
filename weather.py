#!/usr/bin/env python3
"""
Weather Fetcher - Get current weather for any city
Uses OpenWeatherMap API (free tier available)

Setup:
1. Get free API key from: https://openweathermap.org/api
2. Replace YOUR_API_KEY below with your actual key
3. Run: python3 weather.py "Paris"
"""

import sys
import requests
import json
from datetime import datetime

# CONFIGURATION
API_KEY = "YOUR_API_KEY_HERE"  # Replace with your OpenWeatherMap API key
BASE_URL = "https://api.openweathermap.org/data/2.5/weather"


def get_weather(city_name):
    """Fetch weather data for a given city"""
    
    # Check if API key is configured
    if API_KEY == "YOUR_API_KEY_HERE":
        print("❌ Error: Please configure your API key first!")
        print("   Get a free key at: https://openweathermap.org/api")
        print("   Then replace 'YOUR_API_KEY_HERE' in the script.")
        return None
    
    # Build API request
    params = {
        "q": city_name,
        "appid": API_KEY,
        "units": "metric"  # Use Celsius
    }
    
    try:
        # Make the API call
        response = requests.get(BASE_URL, params=params, timeout=10)
        
        # Check for HTTP errors
        if response.status_code == 401:
            print("❌ Error: Invalid API key. Please check your API key.")
            return None
        elif response.status_code == 404:
            print(f"❌ Error: City '{city_name}' not found. Please check the spelling.")
            return None
        elif response.status_code != 200:
            print(f"❌ Error: API request failed (Status {response.status_code})")
            return None
        
        # Parse the response
        data = response.json()
        
        # Extract weather information
        weather_info = {
            "city": data["name"],
            "country": data["sys"]["country"],
            "temperature": round(data["main"]["temp"]),
            "feels_like": round(data["main"]["feels_like"]),
            "humidity": data["main"]["humidity"],
            "description": data["weather"][0]["description"].capitalize(),
            "wind_speed": data["wind"]["speed"],
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M")
        }
        
        return weather_info
        
    except requests.exceptions.Timeout:
        print("❌ Error: Request timed out. Please try again.")
        return None
    except requests.exceptions.ConnectionError:
        print("❌ Error: No internet connection. Please check your network.")
        return None
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return None


def display_weather(weather):
    """Display weather information in a nice format"""
    if not weather:
        return
    
    print("\n" + "=" * 50)
    print(f"🌍 Weather in {weather['city']}, {weather['country']}")
    print("=" * 50)
    print(f"🌡️  Temperature: {weather['temperature']}°C")
    print(f"🤔 Feels like: {weather['feels_like']}°C")
    print(f"☁️  Conditions: {weather['description']}")
    print(f"💧 Humidity: {weather['humidity']}%")
    print(f"💨 Wind Speed: {weather['wind_speed']} m/s")
    print(f"🕐 Updated: {weather['timestamp']}")
    print("=" * 50 + "\n")


def main():
    """Main function - handle command line arguments"""
    
    # Check if city name is provided
    if len(sys.argv) < 2:
        print("Usage: python3 weather.py <city_name>")
        print("Example: python3 weather.py 'Paris'")
        print("         python3 weather.py 'New York'")
        sys.exit(1)
    
    # Get city name from arguments (handle multi-word cities)
    city = " ".join(sys.argv[1:])
    
    print(f"🔍 Fetching weather for '{city}'...")
    
    # Fetch and display weather
    weather = get_weather(city)
    display_weather(weather)


if __name__ == "__main__":
    main()
