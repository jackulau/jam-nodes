import { z } from 'zod';

// ----- Shared sub-schemas -----

export const GooglePlaceLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export const GooglePlaceDisplayNameSchema = z.object({
  text: z.string(),
  languageCode: z.string().optional(),
});

export const GooglePlaceSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    displayName: GooglePlaceDisplayNameSchema.optional(),
    formattedAddress: z.string().optional(),
    shortFormattedAddress: z.string().optional(),
    location: GooglePlaceLocationSchema.optional(),
    rating: z.number().optional(),
    userRatingCount: z.number().optional(),
    priceLevel: z.string().optional(),
    types: z.array(z.string()).optional(),
    primaryType: z.string().optional(),
    primaryTypeDisplayName: GooglePlaceDisplayNameSchema.optional(),
    nationalPhoneNumber: z.string().optional(),
    internationalPhoneNumber: z.string().optional(),
    websiteUri: z.string().optional(),
    googleMapsUri: z.string().optional(),
    businessStatus: z.string().optional(),
    regularOpeningHours: z.record(z.unknown()).optional(),
    currentOpeningHours: z.record(z.unknown()).optional(),
  })
  .passthrough();

const DEFAULT_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.primaryType,places.businessStatus,places.websiteUri,places.googleMapsUri,places.nationalPhoneNumber';

const DEFAULT_DETAILS_FIELD_MASK =
  'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,types,primaryType,businessStatus,websiteUri,googleMapsUri,nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours,currentOpeningHours';

// ----- googlePlacesSearchText -----

export const GooglePlacesSearchTextInputSchema = z.object({
  textQuery: z.string().min(1, 'textQuery is required'),
  languageCode: z.string().optional(),
  regionCode: z.string().optional(),
  includedType: z.string().optional(),
  openNow: z.boolean().optional(),
  minRating: z.number().min(0).max(5).optional(),
  maxResultCount: z.number().int().min(1).max(20).optional().default(10),
  pageToken: z.string().optional(),
  fieldMask: z.string().optional().default(DEFAULT_FIELD_MASK),
});

export const GooglePlacesSearchTextOutputSchema = z.object({
  ok: z.boolean(),
  places: z.array(GooglePlaceSchema),
  nextPageToken: z.string().nullable(),
});

// ----- googlePlacesGetDetails -----

export const GooglePlacesGetDetailsInputSchema = z.object({
  placeId: z.string().min(1, 'placeId is required'),
  languageCode: z.string().optional(),
  regionCode: z.string().optional(),
  fieldMask: z.string().optional().default(DEFAULT_DETAILS_FIELD_MASK),
});

export const GooglePlacesGetDetailsOutputSchema = z.object({
  ok: z.boolean(),
  place: GooglePlaceSchema,
});

// ----- googlePlacesSearchNearby -----

export const GooglePlacesSearchNearbyInputSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(0).max(50000).default(1000),
  includedTypes: z.array(z.string()).optional(),
  excludedTypes: z.array(z.string()).optional(),
  maxResultCount: z.number().int().min(1).max(20).optional().default(10),
  languageCode: z.string().optional(),
  regionCode: z.string().optional(),
  rankPreference: z.enum(['DISTANCE', 'POPULARITY']).optional(),
  fieldMask: z.string().optional().default(DEFAULT_FIELD_MASK),
});

export const GooglePlacesSearchNearbyOutputSchema = z.object({
  ok: z.boolean(),
  places: z.array(GooglePlaceSchema),
});

// ----- Inferred types -----

export type GooglePlaceLocation = z.infer<typeof GooglePlaceLocationSchema>;
export type GooglePlaceDisplayName = z.infer<typeof GooglePlaceDisplayNameSchema>;
export type GooglePlace = z.infer<typeof GooglePlaceSchema>;

export type GooglePlacesSearchTextInput = z.infer<typeof GooglePlacesSearchTextInputSchema>;
export type GooglePlacesSearchTextOutput = z.infer<typeof GooglePlacesSearchTextOutputSchema>;

export type GooglePlacesGetDetailsInput = z.infer<typeof GooglePlacesGetDetailsInputSchema>;
export type GooglePlacesGetDetailsOutput = z.infer<typeof GooglePlacesGetDetailsOutputSchema>;

export type GooglePlacesSearchNearbyInput = z.infer<typeof GooglePlacesSearchNearbyInputSchema>;
export type GooglePlacesSearchNearbyOutput = z.infer<typeof GooglePlacesSearchNearbyOutputSchema>;
