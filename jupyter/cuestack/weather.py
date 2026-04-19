"""
Weather utility — fetch weather data from Open-Meteo (free, no API key).

Usage:
    from cuestack.weather import fetch_weather

    # Get current + forecast for Bangkok
    df = fetch_weather(lat=13.75, lon=100.52, hours=48)
    print(df)  # timestamp, temperature, humidity, wind_speed, solar_radiation

    # Save to org table for EI widget
    from cuestack import connect
    client = connect()
    client.insert("weather_data", df.to_dict("records"))

Open-Meteo API: https://open-meteo.com/ — free, no registration, no key.
"""

import requests
import pandas as pd
from datetime import datetime, timezone


def fetch_weather(lat=13.75, lon=100.52, hours=48, timezone_str="Asia/Bangkok"):
    """
    Fetch weather data from Open-Meteo.

    Args:
        lat: Latitude (default: Bangkok)
        lon: Longitude (default: Bangkok)
        hours: Forecast hours (max 168 = 7 days)
        timezone_str: Timezone for timestamps

    Returns:
        DataFrame with columns: timestamp, temperature, humidity,
        wind_speed, solar_radiation, cloud_cover
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation,cloud_cover",
        "forecast_hours": min(hours, 168),
        "timezone": timezone_str,
    }

    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    hourly = data.get("hourly", {})
    df = pd.DataFrame({
        "timestamp": pd.to_datetime(hourly.get("time", [])),
        "temperature": hourly.get("temperature_2m", []),
        "humidity": hourly.get("relative_humidity_2m", []),
        "wind_speed": hourly.get("wind_speed_10m", []),
        "solar_radiation": hourly.get("shortwave_radiation", []),
        "cloud_cover": hourly.get("cloud_cover", []),
    })

    return df


def fetch_historical(lat=13.75, lon=100.52, start_date=None, end_date=None, timezone_str="Asia/Bangkok"):
    """
    Fetch historical weather data (past dates).

    Args:
        lat, lon: Coordinates
        start_date: "YYYY-MM-DD" (default: 7 days ago)
        end_date: "YYYY-MM-DD" (default: yesterday)

    Returns:
        DataFrame with same columns as fetch_weather
    """
    if not start_date:
        from datetime import timedelta
        start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    if not end_date:
        from datetime import timedelta
        end_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation,cloud_cover",
        "timezone": timezone_str,
    }

    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    hourly = data.get("hourly", {})
    df = pd.DataFrame({
        "timestamp": pd.to_datetime(hourly.get("time", [])),
        "temperature": hourly.get("temperature_2m", []),
        "humidity": hourly.get("relative_humidity_2m", []),
        "wind_speed": hourly.get("wind_speed_10m", []),
        "solar_radiation": hourly.get("shortwave_radiation", []),
        "cloud_cover": hourly.get("cloud_cover", []),
    })

    return df
