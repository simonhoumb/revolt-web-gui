// Hardware calibration thresholds; tune after sea trials on physical hardware.

export const ON_CURRENT_THRESHOLD_A = 0.5; // minimum amperes to consider a thruster "on"

// Placeholder ceiling for mapping current draw onto the 0-100% thrust scale the obc-thruster/
// obc-azimuth-thruster instruments expect. No documented max current exists yet for this
// vessel's thrusters; confirm against real hardware and update once known.
export const THRUSTER_MAX_AMPERES = 30.0;

// No update from a sensor topic in this long: treat its last-known reading as stale rather than
// live (still shown, per maritime convention, just visually marked -- see lib/staleness.ts). A
// single shared placeholder across all sensor topics, not tuned per-topic; most physical topics
// publish at least once a second, so 5s is a comfortable multiple without hiding a real problem
// for long. Much shorter than AIS's own multi-minute staleness window (useAisTargets.ts), which
// reflects real AIS reporting intervals rather than a continuous telemetry topic going quiet.
export const SENSOR_STALE_MS = 5_000;

// DHT22 (enclosure temperature/humidity) is a documented outlier: both firmware boards only
// publish it every 10s (SENSOR_HUMIDITY_INTERVAL/SENSOR_TEMPERATURE_INTERVAL in
// Hardware/actuators/firmware/{stern,bow}/src/main.cpp), well past the 5s default tuned for
// sub-second topics -- readings were flipping to stale for roughly half of every publish cycle.
export const DHT22_STALE_MS = 25_000;
