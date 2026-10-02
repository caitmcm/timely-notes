import '../App.css'

interface SignInScreenProps {
  onSignIn: () => void
  onSignUp: () => void
}

/** Shown instead of the app while signed out. Both buttons go to the provider's hosted page. */
function SignInScreen({ onSignIn, onSignUp }: SignInScreenProps) {
  const provider = import.meta.env.VITE_AUTH_PROVIDER_NAME

  return (
    <main className="sign-in">
      <h1 className="sign-in__title">Timely Notes</h1>

      <div className="sign-in__actions">
        <button type="button" className="sign-in__primary" onClick={onSignIn}>
          Sign in
        </button>
        <button type="button" onClick={onSignUp}>
          Create account
        </button>
      </div>

      <p className="sign-in__notice">
        Timely Notes keeps your notes and an anonymous account ID, never your name or email address.
        Signing in is handled by {provider}, which holds your email address so you can sign in.
      </p>
    </main>
  )
}

export default SignInScreen
