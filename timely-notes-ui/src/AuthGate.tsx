import App from './App'
import SignInScreen from './components/SignInScreen'
import { useAuth } from './auth/useAuth'

/** The app only mounts signed in, so nothing in it fetches without a session. */
function AuthGate() {
  const { status, signIn, signUp } = useAuth()

  // Brief: the stored session, or the provider's callback, is being read.
  if (status === 'loading') {
    return null
  }

  if (status === 'signedOut') {
    return <SignInScreen onSignIn={() => void signIn()} onSignUp={() => void signUp()} />
  }

  return <App />
}

export default AuthGate
