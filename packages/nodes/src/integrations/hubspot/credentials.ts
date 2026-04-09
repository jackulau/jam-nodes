import { defineOAuth2Credential } from '@jam-nodes/core';
import { z } from 'zod';

export const hubspotCredential = defineOAuth2Credential({
  name: 'hubspot',
  displayName: 'HubSpot OAuth2',
  documentationUrl: 'https://developers.hubspot.com/docs/api/overview',
  config: {
    authorizationUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.companies.read',
      'crm.objects.companies.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'crm.schemas.contacts.read',
      'crm.objects.owners.read',
      'forms',
      'tickets',
    ],
  },
  schema: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.number().optional(),
  }),
});
