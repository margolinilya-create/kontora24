import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SampleProof } from '../components/SampleProof'
import { renderCanvas } from '@/shared/lib/html-export'

// R27.0 (ТЗ №2): dev-only стенд образца для e2e (e2e/sample-proof.spec.js).
// Регистрируется в routes.jsx только при import.meta.env.DEV — в прод-бандл
// не попадает. Без логина и Supabase: заказ собирается из query-параметров.
//   /dev/sample-proof?number=302            → order.number
//   /dev/sample-proof?custom=ABC-12345678   → order.custom_number
// window.__sampleProof.render() снимает образец через тот же renderCanvas,
// что PNG/PDF/печать в PrintPreviewModal, и отдаёт PNG + прямоугольники
// капсул (CSS px относительно корня образца).
export default function SampleProofStand() {
  const [params] = useSearchParams()
  const ref = useRef(null)

  const order = {
    number: Number(params.get('number')) || 1042,
    custom_number: params.get('custom') || null,
    order_type: 'stickerpack3D',
    created_at: '2026-07-15T09:30:00Z',
    film_type: 'G',
    film_material: { name: 'Duckson G глянцевая' },
    width_mm: 74,
    height_mm: 105,
    qty: 500,
    client: { name: 'ООО Ромашка' },
    assignee: { display_name: 'Иван Петров' },
    attachments: [],
  }

  useEffect(() => {
    window.__sampleProof = {
      async render({ scale = 2 } = {}) {
        const root = ref.current
        const rootRect = root.getBoundingClientRect()
        const rel = (sel) => {
          const el = root.querySelector(sel)
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: r.left - rootRect.left, y: r.top - rootRect.top, width: r.width, height: r.height }
        }
        const canvas = await renderCanvas(root, { scale, pixelWidth: 874, pixelHeight: 1240 })
        return {
          scale,
          png: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height,
          numberCapsule: rel('[data-testid="sample-number-capsule"]'),
          dateCapsule: rel('[data-testid="sample-date-capsule"]'),
        }
      },
    }
    return () => { delete window.__sampleProof }
  }, [])

  return (
    <div style={{ padding: 16, background: '#ddd', minHeight: '100vh' }}>
      <div style={{ width: 'fit-content' }}>
        <SampleProof ref={ref} order={order} />
      </div>
    </div>
  )
}
