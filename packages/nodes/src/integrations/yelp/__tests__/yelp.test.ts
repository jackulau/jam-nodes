import { describe, it, expect, vi, beforeEach } from 'vitest';
import { yelpSearchBusinessesNode } from '../yelpSearchBusinesses.js';
import { yelpGetBusinessDetailsNode } from '../yelpGetBusinessDetails.js';
import { yelpGetBusinessReviewsNode } from '../yelpGetBusinessReviews.js';

const mockCredentials = {
  yelp: {
    apiKey: 'test-api-key',
  },
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('yelpSearchBusinessesNode', () => {
  it('returns failure when credentials are missing', async () => {
    const result = await yelpSearchBusinessesNode.executor(
      { location: 'NYC', limit: 20, offset: 0, sortBy: 'best_match' },
      { credentials: {} } as any
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('apiKey');
  });

  it('searches with location string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        total: 2,
        businesses: [
          { id: 'biz-1', name: 'Joe Pizza', rating: 4.5 },
          { id: 'biz-2', name: 'Best Pizza', rating: 4.2 },
        ],
      }),
    });

    const result = await yelpSearchBusinessesNode.executor(
      { term: 'pizza', location: 'New York, NY', limit: 20, offset: 0, sortBy: 'rating' },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.total).toBe(2);
    expect(result.output?.businesses).toHaveLength(2);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('term=pizza');
    expect(url).toContain('location=New+York%2C+NY');
    expect(url).toContain('sort_by=rating');
    expect(init.headers.Authorization).toBe('Bearer test-api-key');
  });

  it('searches with lat/lng instead of location', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ total: 0, businesses: [] }),
    });

    await yelpSearchBusinessesNode.executor(
      {
        term: 'sushi',
        latitude: 40.758,
        longitude: -73.9855,
        radius: 1000,
        limit: 10,
        offset: 0,
        sortBy: 'distance',
      },
      { credentials: mockCredentials } as any
    );

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('latitude=40.758');
    expect(url).toContain('longitude=-73.9855');
    expect(url).toContain('radius=1000');
  });

  it('returns error from Yelp API error envelope', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', description: 'Bad location' } }),
    });

    const result = await yelpSearchBusinessesNode.executor(
      { location: 'X', limit: 20, offset: 0, sortBy: 'best_match' },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Bad location');
  });
});

describe('yelpGetBusinessDetailsNode', () => {
  it('returns failure when credentials are missing', async () => {
    const result = await yelpGetBusinessDetailsNode.executor(
      { businessId: 'biz-1' },
      { credentials: {} } as any
    );
    expect(result.success).toBe(false);
  });

  it('fetches business details by id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'biz-1',
        name: "Joe's Pizza",
        rating: 4.5,
        review_count: 1234,
      }),
    });

    const result = await yelpGetBusinessDetailsNode.executor(
      { businessId: 'biz-1' },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.business.id).toBe('biz-1');
    expect(result.output?.business.review_count).toBe(1234);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/v3/businesses/biz-1');
  });

  it('url-encodes business id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'biz/1', name: 'X' }),
    });

    await yelpGetBusinessDetailsNode.executor(
      { businessId: 'biz/1' },
      { credentials: mockCredentials } as any
    );

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/v3/businesses/biz%2F1');
  });
});

describe('yelpGetBusinessReviewsNode', () => {
  it('returns failure when credentials are missing', async () => {
    const result = await yelpGetBusinessReviewsNode.executor(
      { businessId: 'biz-1' },
      { credentials: {} } as any
    );
    expect(result.success).toBe(false);
  });

  it('returns reviews list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        total: 3,
        reviews: [
          { id: 'r1', rating: 5, text: 'great' },
          { id: 'r2', rating: 4, text: 'good' },
          { id: 'r3', rating: 3, text: 'ok' },
        ],
      }),
    });

    const result = await yelpGetBusinessReviewsNode.executor(
      { businessId: 'biz-1' },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.reviews).toHaveLength(3);
    expect(result.output?.total).toBe(3);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/v3/businesses/biz-1/reviews');
  });
});
