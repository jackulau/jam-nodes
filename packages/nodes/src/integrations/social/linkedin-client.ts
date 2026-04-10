import type { NodeExecutionContext } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';

export const LINKEDIN_API_BASE_URL = 'https://api.linkedin.com';

interface LinkedInMeResponse {
  id?: string;
}

interface LinkedInRegisterUploadResponse {
  value?: {
    asset?: string;
    uploadMechanism?: {
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: {
        uploadUrl?: string;
      };
    };
  };
}

export function getLinkedInAccessToken(context: NodeExecutionContext): string | null {
  return context.credentials?.linkedin?.accessToken ?? null;
}

export function getLinkedInAuthHeaders(context: NodeExecutionContext): Record<string, string> {
  const accessToken = getLinkedInAccessToken(context);
  if (!accessToken) {
    throw new Error(
      'LinkedIn access token not configured. Please provide context.credentials.linkedin.accessToken.'
    );
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

export async function linkedInRequest<T>(
  context: NodeExecutionContext,
  path: string,
  init: RequestInit = {}
): Promise<{ data: T; headers: Headers }> {
  const authHeaders = getLinkedInAuthHeaders(context);
  const fullUrl = `${LINKEDIN_API_BASE_URL}${path}`;

  const response = await fetchWithRetry(
    fullUrl,
    {
      ...init,
      headers: {
        ...authHeaders,
        ...(init.headers ?? {}),
      },
    },
    { maxRetries: 3, backoffMs: 1000, timeoutMs: 30000 }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn API error: ${response.status} - ${errorText}`);
  }

  if (response.status === 204) {
    return { data: undefined as T, headers: response.headers };
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength === '0') {
    return { data: undefined as T, headers: response.headers };
  }

  const text = await response.text();
  if (text.length === 0) {
    return { data: undefined as T, headers: response.headers };
  }
  return { data: JSON.parse(text) as T, headers: response.headers };
}

export async function getAuthenticatedLinkedInPersonUrn(
  context: NodeExecutionContext
): Promise<string> {
  const { data } = await linkedInRequest<LinkedInMeResponse>(context, '/v2/me', {
    method: 'GET',
  });
  const id = data?.id;
  if (!id) {
    throw new Error('LinkedIn API error: failed to resolve authenticated person id from /v2/me.');
  }
  return `urn:li:person:${id}`;
}

export async function registerLinkedInUpload(
  context: NodeExecutionContext,
  ownerUrn: string
): Promise<{ assetUrn: string; uploadUrl: string }> {
  const body = {
    registerUploadRequest: {
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      owner: ownerUrn,
      serviceRelationships: [
        {
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        },
      ],
    },
  };

  const { data } = await linkedInRequest<LinkedInRegisterUploadResponse>(
    context,
    '/v2/assets?action=registerUpload',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const assetUrn = data?.value?.asset;
  const uploadUrl =
    data?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']
      ?.uploadUrl;

  if (!assetUrn) {
    throw new Error('LinkedIn registerUpload response missing value.asset (asset URN).');
  }
  if (!uploadUrl) {
    throw new Error(
      'LinkedIn registerUpload response missing value.uploadMechanism uploadUrl.'
    );
  }

  return { assetUrn, uploadUrl };
}

export async function uploadLinkedInBinary(
  uploadUrl: string,
  accessToken: string,
  binary: ArrayBuffer
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: binary,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn image upload failed: ${response.status} - ${errorText}`);
  }
}
