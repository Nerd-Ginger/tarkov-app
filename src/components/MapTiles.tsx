import { useMemo } from 'react'
import type { MapArt } from '../data/mapArt'

/**
 * Raster tile pyramid, placed by tarkov.dev's published world→pixel transform.
 *
 * This replaced SVG rendering on the 9 maps that publish tiles, because SVG
 * placement had to be *inferred* — stretch the artwork across the map's world
 * bounds and hope its content lines up. It didn't, differently, on three maps:
 * Reserve needed a separate svgBounds, Interchange's mall was a hidden layer,
 * and Factory's aspect is off on both axes. Every fix was per-map guesswork.
 *
 * `transform` removes the guessing: `pixel = world * scale + offset` at zoom 0,
 * doubling per zoom level. It's the same mapping tarkov.dev's own map uses, so
 * alignment is theirs rather than mine.
 *
 * Tiles also carry a pyramid per floor, which is what makes Reserve's ground
 * view actually exclude the bunker interiors — those are drawn inside the SVG's
 * ground group, so no amount of layer toggling could hide them.
 */

interface Props {
  art: MapArt
  /** Tile pyramid to draw — a floor's own, or the map's default. */
  url: string
  /** World rectangle currently visible, so we only mount tiles you can see. */
  view: { x: number; z: number; w: number; h: number }
  /** Screen pixels per world unit, for picking a pyramid level. */
  scale: number
}

export function MapTiles({ art, url, view, scale }: Props) {
  const tiles = useMemo(() => {
    const t = art.transform
    if (!t) return []
    const [sx, ox, sz, oz] = t
    const size = art.tileSize
    const [minZ, maxZ] = art.tileZoom

    /**
     * Pick the pyramid level whose resolution matches the screen.
     *
     * At level z one world unit is `sx * 2^z` tile pixels. We want that close to
     * the pixels-per-world-unit we're actually drawing at, so the image is
     * neither upscaled nor needlessly heavy.
     */
    const ideal = Math.log2(Math.max(scale, 1e-6) / sx)
    const z = Math.max(minZ, Math.min(maxZ, Math.ceil(ideal)))
    const f = 2 ** z

    // world → pixel at this level
    const px = (wx: number) => (wx * sx + ox) * f
    const pz = (wz: number) => (wz * sz + oz) * f
    // and back, to place each tile in world space
    const wx = (p: number) => (p / f - ox) / sx
    const wz = (p: number) => (p / f - oz) / sz

    const x0 = Math.floor(px(view.x) / size)
    const x1 = Math.floor(px(view.x + view.w) / size)
    const z0 = Math.floor(pz(view.z) / size)
    const z1 = Math.floor(pz(view.z + view.h) / size)

    const out: { key: string; href: string; x: number; y: number; w: number; h: number }[] = []
    // a guard so a bad transform can't try to mount thousands of images
    const budget = 400
    for (let i = Math.min(x0, x1); i <= Math.max(x0, x1) && out.length < budget; i++) {
      for (let j = Math.min(z0, z1); j <= Math.max(z0, z1) && out.length < budget; j++) {
        // No 2^z upper bound: this is a CRS.Simple-style pyramid, so tile
        // indices are just pixel/size and legitimately run past 2^z. Clamping
        // to 2^z dropped the right-hand third of Customs, whose tiles span
        // 2..10 at level 3.
        if (i < 0 || j < 0) continue
        const left = wx(i * size)
        const right = wx((i + 1) * size)
        const top = wz(j * size)
        const bottom = wz((j + 1) * size)
        out.push({
          key: `${z}/${i}/${j}`,
          href: url.replace('{z}', String(z)).replace('{x}', String(i)).replace('{y}', String(j)),
          x: Math.min(left, right),
          y: Math.min(top, bottom),
          w: Math.abs(right - left),
          h: Math.abs(bottom - top),
        })
      }
    }
    return out
  }, [art.transform, art.tileSize, art.tileZoom, url, view.x, view.z, view.w, view.h, scale])

  return (
    <g className="map-tiles">
      {tiles.map((t) => (
        <image
          key={t.key}
          href={t.href}
          x={t.x}
          y={t.y}
          width={t.w}
          height={t.h}
          preserveAspectRatio="none"
        />
      ))}
    </g>
  )
}
