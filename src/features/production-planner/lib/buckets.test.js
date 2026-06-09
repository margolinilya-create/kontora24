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

  it('видимых бакетов ровно 7 (6 рабочих + passive)', () => {
    // R17.3 (бриф 5.06): post_print разделён на 3DO (заливка/сушка) и
    // ОСК (выборка/сборка/упаковка/ОТК).
    expect(VISIBLE_BUCKETS).toEqual([
      'design', 'prepress', 'oprl_print', 'oprl_cut', '3do', 'osk', 'passive',
    ])
  })

  it('drying — passive, milestone-вехи — milestone', () => {
    expect(STAGE_TO_BUCKET.drying).toBe(BUCKETS.passive)
    expect(STAGE_TO_BUCKET.new).toBe(BUCKETS.milestone)
    expect(STAGE_TO_BUCKET.color_approval).toBe(BUCKETS.milestone)
    expect(STAGE_TO_BUCKET.done).toBe(BUCKETS.milestone)
    expect(STAGE_TO_BUCKET.cancelled).toBe(BUCKETS.milestone)
  })

  it('R17.3: 3DO держит заливку + selection_pouring, ОСК — выборку/сборку/упаковку/ОТК', () => {
    // Бриф 5.06: 3DO и ОСК — раздельные отделы.
    expect(STAGE_TO_BUCKET.pouring).toBe(BUCKETS.bucket_3do)
    expect(STAGE_TO_BUCKET.selection_pouring).toBe(BUCKETS.bucket_3do)
    expect(STAGE_TO_BUCKET.selection).toBe(BUCKETS.bucket_osk)
    expect(STAGE_TO_BUCKET.assembly_3d).toBe(BUCKETS.bucket_osk)
    expect(STAGE_TO_BUCKET.packaging).toBe(BUCKETS.bucket_osk)
    expect(STAGE_TO_BUCKET.otk).toBe(BUCKETS.bucket_osk)
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
    // R17.3: 3DO + ОСК вместо post_print.
    expect(BUCKET_STAGES['3do'].length).toBeGreaterThanOrEqual(2) // pouring + selection_pouring
    expect(BUCKET_STAGES.osk.length).toBeGreaterThanOrEqual(4)    // selection + assembly_3d + packaging + otk
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
