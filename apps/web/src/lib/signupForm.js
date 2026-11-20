// Pure validation for the register form. Supabase validates again; this gives quick feedback.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * @param {{email?: string, password?: string, confirm?: string}} input
 * @returns {{valid: boolean, errors: Record<string, string>, value: {email: string, password: string}}}
 */
export function validateSignupForm(input) {
  const errors = {};
  const email = String(input?.email ?? '').trim();
  const password = String(input?.password ?? '');
  const confirm = String(input?.confirm ?? '');
  if (!email) errors.email = 'Enter your email.';
  else if (!EMAIL.test(email)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Choose a password.';
  else if (password.length < MIN_PASSWORD_LENGTH)
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password && confirm !== password) errors.confirm = 'The passwords do not match.';
  return { valid: Object.keys(errors).length === 0, errors, value: { email, password } };
}

/**
 * Turns a Supabase sign-up error into plain language.
 * @param {{message?: string, code?: string}|null|undefined} error
 * @returns {string}
 */
export function describeSignupError(error) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (!text.trim()) return 'Could not create the account. Try again.';
  if (text.includes('already') || text.includes('registered'))
    return 'An account with this email already exists. Try logging in.';
  if (text.includes('password')) return 'That password was not accepted. Try a longer one.';
  if (text.includes('rate') || text.includes('too many'))
    return 'Too many attempts. Wait a minute and try again.';
  if (text.includes('signup') && text.includes('disabled'))
    return 'Sign-ups are turned off for this project.';
  return error?.message || 'Could not create the account. Try again.';
}
