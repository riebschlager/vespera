/**
 * CPU mirror of the ocean vertex shader's swell (calculateSwell + distance attenuation).
 * Keep the two in sync so CPU-side effects meet the rendered surface exactly.
 */
export const swellHeightAt = (
  x: number,
  z: number,
  waveTime: number,
  waveDistortion: number,
  driftOffset: number
): number => {
  const pz = z - driftOffset;
  let h = Math.sin(x * 0.045 + waveTime * 0.75) * Math.cos(pz * 0.035 + waveTime * 0.55) * 0.28;
  h += Math.sin(x * 0.07 - pz * 0.05 + waveTime * 1.05) * 0.14;
  h += Math.cos(pz * 0.11 - waveTime * 0.9) * 0.07;
  return h * (0.45 + 0.55 * waveDistortion) * Math.exp(-Math.hypot(x, z) * 0.0025);
};
