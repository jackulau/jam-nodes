import { describe, it, expect, vi, beforeEach } from 'vitest';
import { googlePlacesSearchTextNode } from '../googlePlacesSearchText.js';
import { googlePlacesGetDetailsNode } from '../googlePlacesGetDetails.js';
import { googlePlacesSearchNearbyNode } from '../googlePlacesSearchNearby.js';

const mockCredentials = {
  googlePlaces: {
    apiKey: 'test-api-key',
  },
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('googlePlacesSearchTextNode', () => {
  it('returns failure when credentials are missing', async () => {
    const result = await googlePlacesSearchTextNode.executor(
      { textQuery: 'pizza', maxResultCount: 10, fieldMask: 'places.id' },
      { credentials: {} } as any
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('apiKey');
  });

  it('searches places by text successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [
          { id: 'ChIJabc', displayName: { text: 'Joe Pizza' }, rating: 4.5 },
          { id: 'ChIJdef', displayName: { text: 'Best Pizza' }, rating: 4.2 },
        ],
        nextPageToken: 'token123',
      }),
    });

    const result = await googlePlacesSearchTextNode.executor(
      {
        textQuery: 'pizza near times square',
        maxResultCount: 10,
        fieldMask: 'places.id,places.displayName,places.rating',
      },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.places).toHaveLength(2);
    expect(result.output?.nextPageToken).toBe('token123');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['X-Goog-Api-Key']).toBe('test-api-key');
    expect(init.headers['X-Goog-FieldMask']).toBe('places.id,places.displayName,places.rating');
    expect(JSON.parse(init.body)).toMatchObject({ textQuery: 'pizza near times square' });
  });

  it('returns error from Google API error envelope', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { message: 'API key not valid', status: 'INVALID_ARGUMENT' } }),
    });

    const result = await googlePlacesSearchTextNode.executor(
      { textQuery: 'pizza', maxResultCount: 10, fieldMask: 'places.id' },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('API key not valid');
  });
});

describe('googlePlacesGetDetailsNode', () => {
  it('returns failure when credentials are missing', async () => {
    const result = await googlePlacesGetDetailsNode.executor(
      { placeId: 'ChIJabc', fieldMask: 'id,displayName' },
      { credentials: {} } as any
    );
    expect(result.success).toBe(false);
  });

  it('fetches place details by raw ID and prepends places/', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'ChIJabc',
        displayName: { text: "Joe's Pizza" },
        formattedAddress: '7 Carmine St, New York, NY 10014',
        rating: 4.5,
      }),
    });

    const result = await googlePlacesGetDetailsNode.executor(
      { placeId: 'ChIJabc', fieldMask: 'id,displayName,formattedAddress,rating' },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.place.id).toBe('ChIJabc');
    expect(result.output?.place.formattedAddress).toContain('Carmine');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/v1/places/ChIJabc');
  });

  it('accepts placeId already prefixed with places/', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'ChIJxyz' }),
    });

    await googlePlacesGetDetailsNode.executor(
      { placeId: 'places/ChIJxyz', fieldMask: 'id' },
      { credentials: mockCredentials } as any
    );

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/v1/places/ChIJxyz');
    expect(url).not.toContain('places/places/');
  });
});

describe('googlePlacesSearchNearbyNode', () => {
  it('returns failure when credentials are missing', async () => {
    const result = await googlePlacesSearchNearbyNode.executor(
      {
        latitude: 40.758,
        longitude: -73.9855,
        radiusMeters: 500,
        maxResultCount: 10,
        fieldMask: 'places.id',
      },
      { credentials: {} } as any
    );
    expect(result.success).toBe(false);
  });

  it('searches nearby places with location restriction circle', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        places: [{ id: 'ChIJrest1', primaryType: 'restaurant' }],
      }),
    });

    const result = await googlePlacesSearchNearbyNode.executor(
      {
        latitude: 40.758,
        longitude: -73.9855,
        radiusMeters: 500,
        includedTypes: ['restaurant'],
        maxResultCount: 10,
        fieldMask: 'places.id,places.primaryType',
      },
      { credentials: mockCredentials } as any
    );

    expect(result.success).toBe(true);
    expect(result.output?.places).toHaveLength(1);

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.locationRestriction.circle.center.latitude).toBe(40.758);
    expect(body.locationRestriction.circle.radius).toBe(500);
    expect(body.includedTypes).toEqual(['restaurant']);
  });
});
