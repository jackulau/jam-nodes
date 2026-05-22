import { describe, it, expect, vi, beforeEach } from 'vitest';
import { foursquareSearchPlacesNode } from '../foursquareSearchPlaces.js';
import { foursquareGetPlaceDetailsNode } from '../foursquareGetPlaceDetails.js';
import { foursquareGetPlaceTipsNode } from '../foursquareGetPlaceTips.js';

const mockCredentials = {
  foursquare: {
    apiKey: 'fsq3test-api-key',
  },
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('foursquareSearchPlacesNode', () => {
  it('returns failure when credentials are missing', async () => {
    const result = await foursquareSearchPlacesNode.executor(
      { ll: '40.758,-73.9855', sort: 'RELEVANCE', limit: 10 },
      { credentials: {} } as any
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('apiKey');
  });

  it('searches places by ll and returns nextCursor', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { fsq_id: 'fsq-1', name: 'Joe Pizza' },
          { fsq_id: 'fsq-2', name: 'Best Pizza' },
        ],
        context: { next_cursor: 'cur-abc' },
      }),
    });

    const result = await foursquareSearchPlacesNode.executor(
      {
        query: 'pizza',
        ll: '40.758,-73.9855',
        radius: 1000,
        sort: 'POPULARITY',
        limit: 10,
      },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.results).toHaveLength(2);
    expect(result.output?.nextCursor).toBe('cur-abc');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('query=pizza');
    expect(url).toContain('ll=40.758%2C-73.9855');
    expect(url).toContain('sort=POPULARITY');
    expect(init.headers.Authorization).toBe('fsq3test-api-key');
  });

  it('passes nePoint+swPoint bounding box', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [], context: {} }),
    });

    await foursquareSearchPlacesNode.executor(
      {
        query: 'cafe',
        nePoint: '40.78,-73.96',
        swPoint: '40.74,-74.00',
        sort: 'RELEVANCE',
        limit: 10,
      },
      { credentials: mockCredentials } as any
    );

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('ne=40.78%2C-73.96');
    expect(url).toContain('sw=40.74%2C-74.00');
  });

  it('returns error from Foursquare API error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'invalid_param: ll' }),
    });

    const result = await foursquareSearchPlacesNode.executor(
      { ll: 'bad', sort: 'RELEVANCE', limit: 10 },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid_param');
  });
});

describe('foursquareGetPlaceDetailsNode', () => {
  it('returns failure when credentials are missing', async () => {
    const result = await foursquareGetPlaceDetailsNode.executor(
      { fsqId: 'fsq-1' },
      { credentials: {} } as any
    );
    expect(result.success).toBe(false);
  });

  it('fetches place details by fsq_id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        fsq_id: 'fsq-1',
        name: "Joe's Pizza",
        rating: 8.4,
      }),
    });

    const result = await foursquareGetPlaceDetailsNode.executor(
      { fsqId: 'fsq-1', fields: 'fsq_id,name,rating' },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.place.fsq_id).toBe('fsq-1');
    expect(result.output?.place.rating).toBe(8.4);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/v3/places/fsq-1');
    expect(url).toContain('fields=fsq_id%2Cname%2Crating');
  });
});

describe('foursquareGetPlaceTipsNode', () => {
  it('returns failure when credentials are missing', async () => {
    const result = await foursquareGetPlaceTipsNode.executor(
      { fsqId: 'fsq-1', sort: 'POPULAR', limit: 10 },
      { credentials: {} } as any
    );
    expect(result.success).toBe(false);
  });

  it('returns tips list from bare array response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { id: 't1', text: 'great pies' },
        { id: 't2', text: 'long lines' },
      ],
    });

    const result = await foursquareGetPlaceTipsNode.executor(
      { fsqId: 'fsq-1', sort: 'POPULAR', limit: 10 },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.tips).toHaveLength(2);
    expect(result.output?.tips[0].text).toBe('great pies');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/v3/places/fsq-1/tips');
    expect(url).toContain('sort=POPULAR');
  });

  it('returns tips list from enveloped response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ tips: [{ id: 't1', text: 'good' }] }),
    });

    const result = await foursquareGetPlaceTipsNode.executor(
      { fsqId: 'fsq-1', sort: 'NEWEST', limit: 5 },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.tips).toHaveLength(1);
  });
});
