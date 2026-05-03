import { forwardRef } from 'react'
import { Sticker } from './Sticker'

export const DeliverySticker = forwardRef(function DeliverySticker({ order }, ref) {
  return <Sticker ref={ref} order={order} type="delivery" />
})
