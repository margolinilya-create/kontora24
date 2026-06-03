import { describe, it, expect } from 'vitest'
import {
  BUCKETS, STAGE_TO_BUCKET, VISIBLE_BUCKETS, BUCKET_STAGES,
  getBucketForStage, isPlannableBucket,
} from './buckets'
import { ORDER_STATUSES } from '@/shared/constants'

describe('buckets', () => {
  it('STAGE_TO_BUCKET покрывает все ORDER_STATUSES', () => {
    for (const status of Object.keys(ORDER_STATUSES)) {
      expect(STAGE_TO_BUCKET[status]).toBeDefined()
    }
  })

  it('видимых бакетов ровно 6 (5 рабочих + passive)', () => {
    expect(VISIBLE_BUCKETS).toEqual([
      'design', 'prepress', 'oprl_print', 'oprl_cut', 'post_print', 'passive',
    ])
  })

  it('drying — passive, milestone-вехи — milestone', () => {
    expect(STAGE_TO_BUCKET.drying).toBe(BUCKETS.passive)
    expect(STAGE_TO_BUCKET.new).toBe(BUCKETS.milestone)
    expect(STAGE_TO_BUCKET.color_approval).toBe(BUCKETS.milestone)
    expect(STAGE_TO_BUCKET.done).toBe(BUCKETS.milestone)
    expect(STAGE_TO_BUCKET.cancelled).toBe(BUCKETS.milestone)
  })

  it('post_print объединяет 3DО + ОСК (решение пользователя)', () => {
    // По умолчанию ТЗ разделяет, но у нас бригада — одна
    expect(STAGE_TO_BUCKET.pouring).toBe(BUCKETS.post_print)
    expect(STAGE_TO_BUCKET.selection_pouring).toBe(BUCKETS.post_print)
    expect(STAGE_TO_BUCKET.selection).toBe(BUCKETS.post_print)
    expect(STAGE_TO_BUCKET.assembly_3d).toBe(BUCKETS.post_print)
    expect(STAGE_TO_BUCKET.packaging).toBe(BUCKETS.post_print)
    expect(STAGE_TO_BUCKET.otk).toBe(BUCKETS.post_print)
  })

  it('печатник делит print + lamination + sample_print', () => {
    expect(STAGE_TO_BUCKET.print).toBe(BUCKETS.oprl_print)
    expect(STAGE_TO_BUCKET.lamination).toBe(BUCKETS.oprl_print)
    expect(STAGE_TO_BUCKET.sample_print).toBe(BUCKETS.oprl_print)
  })

  it('verstka (sample_layout + batch_layout) живёт в prepress', () => {
    expect(STAGE_TO_BUCKET.sample_layout).toBe(BUCKETS.prepress)
    expect(STAGE_TO_BUCKET.batch_layout).toBe(BUCKETS.prepress)
    expect(STAGE_TO_BUCKET.prepress).toBe(BUCKETS.prepress)
  })

  it('BUCKET_STAGES — обратный индекс', () => {
    expect(BUCKET_STAGES.design).toContain('design')
    expect(BUCKET_STAGES.oprl_cut).toEqual(['cutting'])
    expect(BUCKET_STAGES.post_print.length).toBeGreaterThanOrEqual(6)
  })

  it('getBucketForStage возвращает milestone для неизвестного этапа', () => {
    expect(getBucketForStage('unknown_stage')).toBe(BUCKETS.milestone)
  })

  it('isPlannableBucket: только видимые рабочие бакеты планируются', () => {
    expect(isPlannableBucket(BUCKETS.design)).toBe(true)
    expect(isPlannableBucket(BUCKETS.oprl_print)).toBe(true)
    expect(isPlannableBucket(BUCKETS.passive)).toBe(false)
    expect(isPlannableBucket(BUCKETS.milestone)).toBe(false)
  })
})
