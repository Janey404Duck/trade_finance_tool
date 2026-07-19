import { ZodError } from 'zod';

export function apiError(error: unknown): Response {
  if (error instanceof ZodError) {
    return Response.json({ error: 'Invalid request.', issues: error.flatten() }, { status: 422 });
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  return Response.json({ error: message }, { status: 500 });
}
