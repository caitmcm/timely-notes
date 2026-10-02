import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { StaticAuthProvider } from './StaticAuth'
import { useAuth } from './useAuth'

let seen: ReturnType<typeof useAuth> | null = null

function Probe() {
  const auth = useAuth()

  useEffect(() => {
    seen = auth
  })

  return <p>{auth.status}</p>
}

describe('StaticAuthProvider', () => {
  beforeEach(() => {
    seen = null
  })

  it('is signed in from the first render', () => {
    render(
      <StaticAuthProvider token="fixed-token">
        <Probe />
      </StaticAuthProvider>,
    )

    expect(screen.getByText('signedIn')).toBeInTheDocument()
  })

  it('yields the configured token, and the same one on renew', async () => {
    render(
      <StaticAuthProvider token="fixed-token">
        <Probe />
      </StaticAuthProvider>,
    )

    await expect(seen!.tokens.token()).resolves.toBe('fixed-token')
    await expect(seen!.tokens.renew()).resolves.toBe('fixed-token')
  })
})
