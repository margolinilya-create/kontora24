import { forwardRef } from 'react'
import { Sticker } from './Sticker'

export const ProductionSticker = forwardRef(function ProductionSticker({ order }, ref) {
  return <Sticker ref={ref} order={order} type="production" />
})
