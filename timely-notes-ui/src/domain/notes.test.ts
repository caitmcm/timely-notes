import { noteExcerpt } from './notes'

describe('noteExcerpt', () => {
  it('uses the first non-empty line', () => {
    expect(noteExcerpt('\n\nMorning block: drafted the TDD plan.')).toBe(
      'Morning block: drafted the TDD plan.',
    )
  })

  it('strips markdown heading markers', () => {
    expect(noteExcerpt('# Stand-up\n\nBlocked on the notes endpoint.')).toBe('Stand-up')
  })

  it('strips list and quote markers', () => {
    expect(noteExcerpt('- Review the design doc')).toBe('Review the design doc')
    expect(noteExcerpt('> quoted')).toBe('quoted')
  })

  it('collapses runs of whitespace', () => {
    expect(noteExcerpt('two    spaces\there')).toBe('two spaces here')
  })

  it('truncates long content with an ellipsis', () => {
    expect(noteExcerpt('x'.repeat(60), 10)).toBe('xxxxxxxxxx…')
  })

  it('leaves content at the limit untruncated', () => {
    expect(noteExcerpt('x'.repeat(10), 10)).toBe('xxxxxxxxxx')
  })

  it('describes an empty note rather than returning nothing', () => {
    expect(noteExcerpt('   \n  ')).toBe('Empty note')
  })
})
