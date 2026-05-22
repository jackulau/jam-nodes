import { z } from 'zod';

// ----- Shared sub-schemas -----

export const YelpCoordinatesSchema = z.object({
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

export const YelpLocationSchema = z
  .object({
    address1: z.string().nullable().optional(),
    address2: z.string().nullable().optional(),
    address3: z.string().nullable().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip_code: z.string().optional(),
    country: z.string().optional(),
    display_address: z.array(z.string()).optional(),
  })
  .passthrough();

export const YelpCategorySchema = z.object({
  alias: z.string(),
  title: z.string(),
});

export const YelpBusinessSchema = z
  .object({
    id: z.string(),
    alias: z.string().optional(),
    name: z.string(),
    image_url: z.string().optional(),
    is_closed: z.boolean().optional(),
    url: z.string().optional(),
    review_count: z.number().optional(),
    categories: z.array(YelpCategorySchema).optional(),
    rating: z.number().optional(),
    coordinates: YelpCoordinatesSchema.optional(),
    transactions: z.array(z.string()).optional(),
    price: z.string().optional(),
    location: YelpLocationSchema.optional(),
    phone: z.string().optional(),
    display_phone: z.string().optional(),
    distance: z.number().optional(),
  })
  .passthrough();

export const YelpReviewSchema = z
  .object({
    id: z.string(),
    url: z.string().optional(),
    text: z.string().optional(),
    rating: z.number().optional(),
    time_created: z.string().optional(),
    user: z
      .object({
        id: z.string().optional(),
        profile_url: z.string().optional(),
        image_url: z.string().nullable().optional(),
        name: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

// ----- yelpSearchBusinesses -----

export const YelpSearchBusinessesInputSchema = z
  .object({
    term: z.string().optional(),
    location: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    radius: z.number().int().min(0).max(40000).optional(),
    categories: z.string().optional(),
    locale: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).default(0),
    sortBy: z.enum(['best_match', 'rating', 'review_count', 'distance']).default('best_match'),
    price: z.string().optional(),
    openNow: z.boolean().optional(),
    openAt: z.number().int().optional(),
    attributes: z.string().optional(),
  })
  .refine(
    (v) => Boolean(v.location) || (typeof v.latitude === 'number' && typeof v.longitude === 'number'),
    { message: 'Either location or (latitude AND longitude) must be provided' }
  );

export const YelpSearchBusinessesOutputSchema = z.object({
  ok: z.boolean(),
  total: z.number(),
  businesses: z.array(YelpBusinessSchema),
});

// ----- yelpGetBusinessDetails -----

export const YelpGetBusinessDetailsInputSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  locale: z.string().optional(),
});

export const YelpGetBusinessDetailsOutputSchema = z.object({
  ok: z.boolean(),
  business: YelpBusinessSchema,
});

// ----- yelpGetBusinessReviews -----

export const YelpGetBusinessReviewsInputSchema = z.object({
  businessId: z.string().min(1, 'businessId is required'),
  locale: z.string().optional(),
});

export const YelpGetBusinessReviewsOutputSchema = z.object({
  ok: z.boolean(),
  total: z.number(),
  reviews: z.array(YelpReviewSchema),
});

// ----- Inferred types -----

export type YelpCoordinates = z.infer<typeof YelpCoordinatesSchema>;
export type YelpLocation = z.infer<typeof YelpLocationSchema>;
export type YelpCategory = z.infer<typeof YelpCategorySchema>;
export type YelpBusiness = z.infer<typeof YelpBusinessSchema>;
export type YelpReview = z.infer<typeof YelpReviewSchema>;

export type YelpSearchBusinessesInput = z.infer<typeof YelpSearchBusinessesInputSchema>;
export type YelpSearchBusinessesOutput = z.infer<typeof YelpSearchBusinessesOutputSchema>;

export type YelpGetBusinessDetailsInput = z.infer<typeof YelpGetBusinessDetailsInputSchema>;
export type YelpGetBusinessDetailsOutput = z.infer<typeof YelpGetBusinessDetailsOutputSchema>;

export type YelpGetBusinessReviewsInput = z.infer<typeof YelpGetBusinessReviewsInputSchema>;
export type YelpGetBusinessReviewsOutput = z.infer<typeof YelpGetBusinessReviewsOutputSchema>;
