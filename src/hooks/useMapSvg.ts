import { useEffect, useState } from 'react'

/**
 * Fetch a map SVG and hand back its inner markup plus its own viewBox.
 *
 * We inline the artwork rather than pointing an `<image href>` at it because
 * the SVGs stack every floor in one file — Factory has Basement, Ground_Floor,
 * Second_Floor and Third_Floor groups all present. Rendered as an image you get
 * all of them at once, which is why Factory looked like overlapping rectangles.
 * Inlining is the only way to hide the floors you're not on.
 *
 * Results are memoised for the session: the artwork never changes, and
 * re-fetching 200KB every time you flick between maps is wasteful.
 */
export interface MapSvg {
  inner: string
  viewBox: { x: number; y: number; w: number; h: number }
}

const cache = new Map<string, Promise<MapSvg>>()

/**
 * Strip anything executable before we inject remote markup into our own DOM.
 *
 * The asset host is one we already trust for images, but an `<image>` tag can't
 * run code and inlined markup can — scripts, and `on*` handlers on any element.
 * Removing both keeps a compromised asset host from becoming script execution
 * inside the app.
 */
function sanitize(svgEl: SVGSVGElement): void {
  for (const el of [...svgEl.querySelectorAll('script')]) el.remove()
  for (const el of [...svgEl.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase()
      if (n.startsWith('on') || (n === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))) {
        el.removeAttribute(attr.name)
      }
    }
  }
}

async function load(url: string): Promise<MapSvg> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  const text = await res.text()
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement as unknown as SVGSVGElement
  if (root.nodeName.toLowerCase() !== 'svg') throw new Error(`${url} is not an SVG`)
  sanitize(root)
  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) {
    throw new Error(`${url} has no usable viewBox`)
  }
  return { inner: root.innerHTML, viewBox: { x: vb[0], y: vb[1], w: vb[2], h: vb[3] } }
}

export function useMapSvg(url: string | null): {
  svg: MapSvg | null
  loading: boolean
  failed: boolean
} {
  const [state, setState] = useState<{ svg: MapSvg | null; loading: boolean; failed: boolean }>({
    svg: null,
    loading: !!url,
    failed: false,
  })

  useEffect(() => {
    if (!url) {
      setState({ svg: null, loading: false, failed: false })
      return
    }
    let live = true
    setState((s) => ({ svg: s.svg, loading: true, failed: false }))
    let p = cache.get(url)
    if (!p) {
      p = load(url)
      // a failed fetch shouldn't be remembered — drop it so the next visit retries
      p.catch(() => cache.delete(url))
      cache.set(url, p)
    }
    p.then(
      (svg) => live && setState({ svg, loading: false, failed: false }),
      () => live && setState({ svg: null, loading: false, failed: true }),
    )
    return () => {
      live = false
    }
  }, [url])

  return state
}
