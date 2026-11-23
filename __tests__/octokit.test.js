import { jest } from '@jest/globals';

const log = {
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  error: jest.fn()
};
jest.unstable_mockModule('@actions/core', () => log);
const { createApiClient, runWithBufferedLogs } = await import('../src/index.js');

let clientId = 0;

function createTestClient(fetch) {
  return createApiClient({
    baseUrl: 'https://github.test/api/v3',
    request: { fetch },
    retry: { retryAfterBaseValue: 1 },
    throttle: {
      id: `retry-test-${clientId++}`,
      retryAfterBaseValue: 1
    }
  });
}

function response(status, message, headers = {}) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

describe('Production Octokit plugin composition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['GET', 4],
    ['POST', 1]
  ])('retries a server error on %s exactly %i times including the first attempt', async (method, attempts) => {
    const fetch = jest.fn(async () => response(500, 'temporary server failure'));
    const client = createTestClient(fetch);

    await expect(client.request(`${method} /test`)).rejects.toMatchObject({ status: 500 });
    expect(fetch).toHaveBeenCalledTimes(attempts);
  });

  const rateLimits = [
    {
      method: 'POST',
      status: 403,
      message: 'API rate limit exceeded',
      headers: () => ({
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000))
      })
    },
    {
      method: 'POST',
      status: 429,
      message: 'You have exceeded a secondary rate limit.',
      headers: () => ({ 'retry-after': '1' })
    },
    {
      method: 'GET',
      status: 429,
      message: 'You have exceeded a secondary rate limit.',
      headers: () => ({ 'retry-after': '1' })
    }
  ];

  test.each(rateLimits)('retries a rate-limited $method ($status) before succeeding', async limit => {
    const fetch = jest
      .fn()
      .mockImplementationOnce(async () => response(limit.status, limit.message, limit.headers()))
      .mockImplementation(async () => response(200, 'success'));
    const client = createTestClient(fetch);

    await expect(client.request(`${limit.method} /test`)).resolves.toMatchObject({ status: 200 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('attempt 1'));
  });

  test('attributes queued rate-limit warnings and response logs to the repositories that issued the requests', async () => {
    const attempted = new Set();
    const client = createTestClient(async url => {
      if (!attempted.has(url)) {
        attempted.add(url);
        return url.endsWith('/first')
          ? response(403, 'API rate limit exceeded', {
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(Math.floor(Date.now() / 1000))
            })
          : response(429, 'You have exceeded a secondary rate limit.', { 'retry-after': '1' });
      }
      return response(200, 'success');
    });
    const repos = ['first', 'second', 'third'];
    const logs = new Map();

    await Promise.all(
      repos.map(repo =>
        runWithBufferedLogs(
          () => client.request(`GET /repos/owner/${repo}`),
          entries => logs.set(repo, entries)
        )
      )
    );

    for (const repo of repos) {
      const entries = logs.get(repo);
      expect(entries.filter(({ method }) => method === 'warning').map(({ args }) => args[0])).toEqual([
        expect.stringContaining(`GET /repos/owner/${repo}; retrying`)
      ]);
      expect(entries.filter(({ method }) => method === 'info').map(({ args }) => args[0])).toEqual([
        expect.stringContaining(`GET /repos/owner/${repo} - 200`)
      ]);
    }
    expect(log.warning).not.toHaveBeenCalled();
  });

  test.each(rateLimits)('stops after three rate-limit retries on $method ($status)', async limit => {
    const fetch = jest.fn(async () => response(limit.status, limit.message, limit.headers()));
    const client = createTestClient(fetch);

    await expect(client.request(`${limit.method} /test`)).rejects.toMatchObject({ status: limit.status });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(log.warning).toHaveBeenCalledWith(expect.stringContaining('giving up after 3 retries'));
  });
});
