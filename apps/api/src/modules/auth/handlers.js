import { AppError } from '../../middleware/errorHandler.js';

/**
 * GET /api/auth/me: who am I?
 *
 * Reads the caller's profile through req.db, the client that acts as the caller. Row Level Security
 * would stop it returning anyone else's row even if this code asked for it. The handler also only
 * ever asks for `req.auth.userId`, never an id from the request.
 *
 * It returns exactly three fields. Nothing from the token or the database row is passed through.
 */
export async function getMe(req, res) {
  const { userId, email } = req.auth;
  const { data, error } = await req.db
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new AppError(500, 'PROFILE_LOOKUP_FAILED', 'Could not load your profile');

  res.json({ data: { id: userId, email, displayName: data?.display_name ?? null } });
}
