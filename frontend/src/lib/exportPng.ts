export async function exportSvgAsPng(svg: SVGSVGElement, filename: string, bg = '#ffffff'): Promise<void> {
  const rect = svg.getBoundingClientRect()
  const w = rect.width || svg.width.baseVal.value || svg.viewBox.baseVal.width
  const h = rect.height || svg.height.baseVal.value || svg.viewBox.baseVal.height
  const dpr = window.devicePixelRatio || 1

  const svgData = new XMLSerializer().serializeToString(svg)
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) { URL.revokeObjectURL(svgUrl); return }
  ctx.scale(dpr, dpr)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(svgUrl)
      resolve()
    }
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      reject(new Error('SVG render failed'))
    }
    img.src = svgUrl
  })

  canvas.toBlob((pngBlob) => {
    if (!pngBlob) return
    const url = URL.createObjectURL(pngBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
