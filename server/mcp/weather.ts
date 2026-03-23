// server/mcp/weather.tool.ts
// MCP Tool — Get current temperature for any city.
// Uses Open-Meteo API — completely free, no API key needed.

import type { McpTool } from '../../types/agent'

export const weatherTool: McpTool = {
  name: 'weather',
  description:
    'Get the current temperature for any city in the world. ' +
    'Input JSON: { "city": "city name" }',

  async run(input: string): Promise<string> {
    const { city } = JSON.parse(input)

    if (!city) throw new Error('weather tool requires { city }')

    // Step 1: Get coordinates for the city
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    )
    const geoData = await geoRes.json() as {
      results?: { name: string; country: string; latitude: number; longitude: number }[]
    }

    if (!geoData.results?.length) {
      throw new Error(`City not found: "${city}"`)
    }

    const { name, country, latitude, longitude } = geoData.results[0]

    // Step 2: Get current temperature using the coordinates
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`
    )
    const weatherData = await weatherRes.json() as {
      current: { temperature_2m: number }
    }

    const temp = weatherData.current.temperature_2m

    return `*** Temperature in ${name}, ${country}: ${temp}°C`
  },
}
