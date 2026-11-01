/**
 * The 3D downtown builders: the city blocks, street lamps, the football pitch, traffic, traffic lights and
 * pedestrians. WorldScene loads this chunk with the downtown map data (after Maple Street is up), so none of it
 * is in the start-up download; the map, GPS and taxi only need the map data.
 */
export { buildCityScene } from './cityScene';
export { buildCityLights } from './cityLights';
export { buildFootballPitch } from './footballScene';
export { loadCityTraffic, type CityTraffic } from './cityTrafficScene';
