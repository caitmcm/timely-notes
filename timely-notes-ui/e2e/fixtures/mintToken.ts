import { execFileSync } from 'node:child_process'

/**
 * A bearer token the API accepts in Development, from `dotnet user-jwts`. Its signing key lives in
 * the API's user secrets, so nothing here reaches Auth0. Same machine user, same `sub`, every run.
 */
export function mintApiToken(): string {
  const output = execFileSync(
    'dotnet',
    [
      'user-jwts',
      'create',
      '--project',
      '../TimelyNotes.Backend/TimelyNotes.API',
      '--audience',
      'https://api.timely-notes',
      '--output',
      'token',
    ],
    { encoding: 'utf8' },
  )

  return output.trim().split(/\r?\n/).at(-1)!.trim()
}
