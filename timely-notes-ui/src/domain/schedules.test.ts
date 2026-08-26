import { DEFAULT_SCHEDULE, SCHEDULES } from './schedules'

describe('SCHEDULES', () => {
  it('lists the three hardcoded schedules in span order', () => {
    expect(SCHEDULES.map((schedule) => schedule.shortName)).toEqual(['s1', 's3', 's6'])
  })

  it('pairs each short name with its span and picker label', () => {
    expect(SCHEDULES).toEqual([
      { shortName: 's1', spanHours: 1, label: '1h' },
      { shortName: 's3', spanHours: 3, label: '3h' },
      { shortName: 's6', spanHours: 6, label: '6h' },
    ])
  })
})

describe('DEFAULT_SCHEDULE', () => {
  it('is the 3-hourly schedule', () => {
    expect(DEFAULT_SCHEDULE.shortName).toBe('s3')
  })

  it('is one of SCHEDULES', () => {
    expect(SCHEDULES).toContain(DEFAULT_SCHEDULE)
  })
})
