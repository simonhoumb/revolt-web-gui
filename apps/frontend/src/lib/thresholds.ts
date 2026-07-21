// Hardware calibration thresholds — tune after sea trials on physical hardware.

export const ON_CURRENT_THRESHOLD_A = 0.5; // minimum amperes to consider a thruster "on"

// Placeholder ceiling for mapping current draw onto the 0-100% thrust scale the obc-thruster/
// obc-azimuth-thruster instruments expect. No documented max current exists yet for this
// vessel's thrusters; confirm against real hardware and update once known.
export const THRUSTER_MAX_AMPERES = 5.0;
