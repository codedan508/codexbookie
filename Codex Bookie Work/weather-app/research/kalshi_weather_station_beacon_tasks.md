# Kalshi Weather Station Beacon Research Tasks

Goal: identify the exact official reporting station/beacon used for each Kalshi daily high temperature city, with coordinates, without assuming that a city or airport name is enough.

Certainty standard:

1. Kalshi series metadata or market rules must point to the NWS Daily Climatological Report URL.
2. The NWS CLI report must identify the climate site name used for settlement.
3. The site must be mapped to a station identifier and station coordinates from an official NWS/NOAA station metadata source.
4. If an airport has multiple sensors or nearby stations, do not mark the city as confirmed until the exact station identifier and coordinates are documented.

Notes:

- Kalshi itself says the official value is the highest temperature as reported by the relevant NWS Daily Climate Report linked in the rules.
- The `issuedby=` code in the NWS CLI URL is the climate product identifier, not by itself proof of the exact physical sensor.
- `K` + `issuedby` is usually the matching METAR/ASOS station ID for airport sites, but that still needs metadata confirmation.
- NYC is a special case: Kalshi rules say Central Park, New York, and the NWS CLI page says Central Park NY. The station ID to verify is `KNYC`.
- If official sources do not pin the exact beacon coordinates, search Kalshi contracts, fine print, NWS/NOAA pages, station lists, Weather.gov/tgftp current-condition pages, NCEI/GHCN station records, credible weather-market tools, and Reddit/forum discussions. Mark those as supporting evidence only unless they point back to an official NWS/NOAA record.
- Do not hide uncertainty. Use `Confirmed`, `Strong candidate`, `Supporting-only`, or `Unresolved`, and write why.

## City Tasks

| Status | Kalshi ticker | City / Kalshi title | Kalshi NWS CLI source | Candidate station ID | Candidate station name | Coordinate status |
| --- | --- | --- | --- | --- | --- | --- |
| In progress | KXHIGHAUS | Austin | https://forecast.weather.gov/product.php?site=EWX&product=CLI&issuedby=AUS | KAUS | Austin-Bergstrom International Airport | NWS station API returned coordinates -97.67987, 30.18304; still verify if this is the exact climate-report sensor/beacon and not only airport centroid. |
| Pending | KXHIGHCHI | Chicago | https://forecast.weather.gov/product.php?site=LOT&product=CLI&issuedby=MDW | KMDW | Chicago Midway Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHDEN | Denver | https://forecast.weather.gov/product.php?site=BOU&product=CLI&issuedby=DEN | KDEN | Denver International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHHOU / KXHIGHOU / KXHIGHTHOU | Houston | https://forecast.weather.gov/product.php?site=HGX&product=CLI&issuedby=HOU | KHOU | Houston Hobby Airport | Need NWS/NOAA station coordinate confirmation; also verify duplicate Kalshi series aliases all use same CLI source. |
| Pending | KXHIGHLAX | Los Angeles | https://forecast.weather.gov/product.php?site=LOX&product=CLI&issuedby=LAX | KLAX | Los Angeles International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHMIA | Miami | https://forecast.weather.gov/product.php?site=MFL&product=CLI&issuedby=MIA | KMIA | Miami International Airport | Need NWS/NOAA station coordinate confirmation. |
| Strong candidate | KXHIGHNY | NYC | https://forecast.weather.gov/product.php?site=OKX&product=CLI&issuedby=NYC | KNYC / GHCND:USW00094728 | Central Park Observatory / Central Park NY | Kalshi rules explicitly say Central Park, New York. NWS CLI page says `THE CENTRAL PARK NY CLIMATE SUMMARY`. NWS tgftp current conditions page for KNYC lists coordinates `40-47N 073-58W 48M`. Wethr lists `40.7790, -73.9692`; NCEI has GHCN station `USW00094728`. Need final official coordinate record before marking confirmed. |
| Pending | KXHIGHPHIL | Philadelphia | https://forecast.weather.gov/product.php?site=PHI&product=CLI&issuedby=PHL | KPHL | Philadelphia International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTATL | Atlanta | https://forecast.weather.gov/product.php?site=FFC&product=CLI&issuedby=ATL | KATL | Hartsfield-Jackson Atlanta International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTBOS | Boston | https://forecast.weather.gov/product.php?site=BOX&product=CLI&issuedby=BOS | KBOS | Boston Logan International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTDAL | Dallas | https://forecast.weather.gov/product.php?site=FWD&product=CLI&issuedby=DFW | KDFW | Dallas/Fort Worth International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTDC | Washington DC | https://forecast.weather.gov/product.php?site=LWX&product=CLI&issuedby=DCA | KDCA | Reagan National Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTLV | Las Vegas | https://forecast.weather.gov/product.php?site=VEF&product=CLI&issuedby=LAS | KLAS | Harry Reid / Las Vegas Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTMIN | Minneapolis | https://forecast.weather.gov/product.php?site=MPX&product=CLI&issuedby=MSP | KMSP | Minneapolis-St. Paul International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTNOLA | New Orleans | https://forecast.weather.gov/product.php?site=LIX&product=CLI&issuedby=MSY | KMSY | New Orleans International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTOKC | Oklahoma City | https://forecast.weather.gov/product.php?site=OUN&product=CLI&issuedby=OKC | KOKC | Will Rogers World Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTPHX | Phoenix | https://forecast.weather.gov/product.php?site=PSR&product=CLI&issuedby=PHX | KPHX | Phoenix Sky Harbor International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTSATX | San Antonio | https://forecast.weather.gov/product.php?site=EWX&product=CLI&issuedby=SAT | KSAT | San Antonio International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTSEA | Seattle | https://forecast.weather.gov/product.php?site=SEW&product=CLI&issuedby=SEA | KSEA | Seattle-Tacoma International Airport | Need NWS/NOAA station coordinate confirmation. |
| Pending | KXHIGHTSFO | San Francisco | https://forecast.weather.gov/product.php?site=MTR&product=CLI&issuedby=SFO | KSFO | San Francisco International Airport | Need NWS/NOAA station coordinate confirmation. |

## Method Per City

For each city, do this in order:

1. Pull Kalshi series metadata from `https://external-api.kalshi.com/trade-api/v2/series/{ticker}`.
2. Pull one live event from `https://external-api.kalshi.com/trade-api/v2/events/{event_ticker}` and capture `rules_primary`.
3. Open the NWS CLI URL from Kalshi `settlement_sources`.
4. Capture the climate report site heading, for example `THE AUSTIN BERGSTROM CLIMATE SUMMARY`.
5. Query official station metadata for the candidate station identifier.
6. Record station identifier, station name, latitude, longitude, elevation, provider, and metadata URL.
7. If the coordinate source is only an airport centroid or third-party airport reference, keep status pending.
8. If official metadata cannot be found, document the failed search and any supporting public discussion separately. Do not upgrade the status based on forum posts alone.

## Sources Already Checked

- Kalshi series API for `KXHIGHNY` and `KXHIGHAUS`.
- Kalshi event API for `KXHIGHNY-26MAY30` and `KXHIGHAUS-26MAY30`.
- NWS CLI pages for NYC, Austin, and Chicago.
- NWS station API for `KAUS`, which returned `Austin-Bergstrom International Airport`, provider `ASOS-HFM`, coordinates `30.18304, -97.67987`.
- NWS tgftp current conditions page for `KNYC`, which identifies `NEW YORK CITY CENTRAL PARK, NY` and gives approximate coordinates `40-47N 073-58W 48M`.
- Wethr KNYC weather market guide, which lists KNYC and coordinates `40.7790, -73.9692`; useful supporting source, not official by itself.
- NCEI CDO station detail exists for `GHCND:USW00094728` / `NY CITY CENTRAL PARK, NY US`; need exact official coordinate capture.
