import { z } from 'zod';

// ----- Shared sub-schemas -----

export const FoursquareGeocodesSchema = z
  .object({
    main: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
      })
      .optional(),
    roof: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
      })
      .optional(),
  })
  .passthrough();

export const FoursquareLocationSchema = z
  .object({
    address: z.string().optional(),
    address_extended: z.string().optional(),
    locality: z.string().optional(),
    region: z.string().optional(),
    postcode: z.string().optional(),
    country: z.string().optional(),
    formatted_address: z.string().optional(),
    cross_street: z.string().optional(),
    neighborhood: z.array(z.string()).optional(),
  })
  .passthrough();

export const FoursquareCategorySchema = z
  .object({
    id: z.number(),
    name: z.string(),
    short_name: z.string().optional(),
    plural_name: z.string().optional(),
    icon: z
      .object({
        prefix: z.string(),
        suffix: z.string(),
      })
      .optional(),
  })
  .passthrough();

export const FoursquarePlaceSchema = z
  .object({
    fsq_id: z.string(),
    name: z.string(),
    categories: z.array(FoursquareCategorySchema).optional(),
    chains: z.array(z.record(z.unknown())).optional(),
    closed_bucket: z.string().optional(),
    distance: z.number().optional(),
    geocodes: FoursquareGeocodesSchema.optional(),
    link: z.string().optional(),
    location: FoursquareLocationSchema.optional(),
    related_places: z.record(z.unknown()).optional(),
    timezone: z.string().optional(),
    rating: z.number().optional(),
    price: z.number().optional(),
    popularity: z.number().optional(),
    tel: z.string().optional(),
    website: z.string().optional(),
    verified: z.boolean().optional(),
    hours: z.record(z.unknown()).optional(),
    stats: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const FoursquareTipSchema = z
  .object({
    id: z.string(),
    created_at: z.string().optional(),
    text: z.string().optional(),
    lang: z.string().optional(),
    agree_count: z.number().optional(),
    disagree_count: z.number().optional(),
    user_id: z.number().optional(),
  })
  .passthrough();

// ----- foursquareSearchPlaces -----

export const FoursquareSearchPlacesInputSchema = z
  .object({
    query: z.string().optional(),
    ll: z.string().optional(),
    near: z.string().optional(),
    radius: z.number().int().min(0).max(100000).optional(),
    categories: z.string().optional(),
    chains: z.string().optional(),
    excludeChains: z.string().optional(),
    excludeAllChains: z.boolean().optional(),
    fields: z.string().optional(),
    minPrice: z.number().int().min(1).max(4).optional(),
    maxPrice: z.number().int().min(1).max(4).optional(),
    openNow: z.boolean().optional(),
    openAt: z.string().optional(),
    nePoint: z.string().optional(),
    swPoint: z.string().optional(),
    sort: z.enum(['RELEVANCE', 'RATING', 'DISTANCE', 'POPULARITY']).default('RELEVANCE'),
    limit: z.number().int().min(1).max(50).default(10),
    cursor: z.string().optional(),
  })
  .refine((v) => Boolean(v.ll) || Boolean(v.near) || (Boolean(v.nePoint) && Boolean(v.swPoint)), {
    message: 'Provide ll (lat,lng), near (place name), or nePoint+swPoint (bounding box)',
  });

export const FoursquareSearchPlacesOutputSchema = z.object({
  ok: z.boolean(),
  results: z.array(FoursquarePlaceSchema),
  nextCursor: z.string().nullable(),
});

// ----- foursquareGetPlaceDetails -----

export const FoursquareGetPlaceDetailsInputSchema = z.object({
  fsqId: z.string().min(1, 'fsqId is required'),
  fields: z.string().optional(),
});

export const FoursquareGetPlaceDetailsOutputSchema = z.object({
  ok: z.boolean(),
  place: FoursquarePlaceSchema,
});

// ----- foursquareGetPlaceTips -----

export const FoursquareGetPlaceTipsInputSchema = z.object({
  fsqId: z.string().min(1, 'fsqId is required'),
  fields: z.string().optional(),
  sort: z.enum(['NEWEST', 'POPULAR']).default('POPULAR'),
  limit: z.number().int().min(1).max(50).default(10),
});

export const FoursquareGetPlaceTipsOutputSchema = z.object({
  ok: z.boolean(),
  tips: z.array(FoursquareTipSchema),
});

// ----- Inferred types -----

export type FoursquareGeocodes = z.infer<typeof FoursquareGeocodesSchema>;
export type FoursquareLocation = z.infer<typeof FoursquareLocationSchema>;
export type FoursquareCategory = z.infer<typeof FoursquareCategorySchema>;
export type FoursquarePlace = z.infer<typeof FoursquarePlaceSchema>;
export type FoursquareTip = z.infer<typeof FoursquareTipSchema>;

export type FoursquareSearchPlacesInput = z.infer<typeof FoursquareSearchPlacesInputSchema>;
export type FoursquareSearchPlacesOutput = z.infer<typeof FoursquareSearchPlacesOutputSchema>;

export type FoursquareGetPlaceDetailsInput = z.infer<typeof FoursquareGetPlaceDetailsInputSchema>;
export type FoursquareGetPlaceDetailsOutput = z.infer<typeof FoursquareGetPlaceDetailsOutputSchema>;

export type FoursquareGetPlaceTipsInput = z.infer<typeof FoursquareGetPlaceTipsInputSchema>;
export type FoursquareGetPlaceTipsOutput = z.infer<typeof FoursquareGetPlaceTipsOutputSchema>;
