/**
 * Measured world rectangles for map artwork, where the published `bounds` are
 * not what the SVG actually covers.
 *
 * Not derived, measured. Probes were placed at known positions in a map's own
 * SVG coordinate space and the landmark under each was identified by eye, giving
 * world→artwork correspondences that a least-squares fit turns into the rectangle
 * below. That removed the guesswork that had the map wrong all day: inferring
 * placement from `bounds` was out by 20–30 world units, and no amount of
 * reasoning about what `coordinateRotation` meant was going to find that.
 *
 * The same fit also settled the orientation question — Customs came out as
 * worldX = -1.03·svgX + 730 (X inverted) and worldZ = +1.01·svgY - 280 (Z not),
 * which is a mirror, not a 180° rotation.
 *
 * Format matches MapArt.bounds: [[maxX, minZ], [minX, maxZ]].
 *
 * To calibrate another map: open /calib.html?map=<Name>, name the landmark under
 * each probe, and fit. Uncalibrated maps fall back to `svgBounds ?? bounds`,
 * which is the previous behaviour.
 */
export const CALIBRATED_ART_BOUNDS: Record<string, [[number, number], [number, number]]> = {
  // fitted from Warehouse 7, Big Red and Dorms; residuals 10–20 units
  customs: [
    [729.6, -280.4],
    [-369.9, 257.8],
  ],
}
