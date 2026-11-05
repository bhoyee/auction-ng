import { expect, it } from 'vitest';
import { ApiError } from '../packages/api-client/src/auth';
import { readErrorMessage } from '../apps/mobile/lib/read-errors';

it.each([
  [new ApiError(429), 'Too many updates'],
  [new ApiError(401), 'sign-in session'],
  [new ApiError(403), 'not available for this account'],
  [new ApiError(404), 'could not be found'],
  [new ApiError(400), 'request could not be accepted'],
  [new ApiError(503), 'server could not load'],
  [new ApiError(422), 'could not be completed'],
  [new SyntaxError('private malformed response'), 'unexpected response'],
  [
    Object.assign(new Error('private detail'), { name: 'ZodError' }),
    'unexpected response',
  ],
  [
    Object.assign(new Error('private detail'), { name: 'TimeoutError' }),
    'too long',
  ],
  [new TypeError('private connection detail'), 'connection'],
])('gives a safe, accurate read error for %s', (error, expected) => {
  const message = readErrorMessage(error);
  expect(message).toContain(expected);
  expect(message).not.toContain('private');
});
