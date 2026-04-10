import { z } from 'zod';
import { defineNode } from '@jam-nodes/core';
import type { NodeExecutionContext } from '@jam-nodes/core';
import { fetchWithRetry } from '../../utils/http.js';

export const LinkedInCreatePostInputSchema = z.object({
  text: z.string().min(1).max(3000),
  visibility: z.enum(['PUBLIC', 'CONNECTIONS']),
  postAs: z.enum(['person', 'organization']),
  organizationId: z.string().optional(),
  mediaCategory: z.enum(['NONE', 'IMAGE', 'ARTICLE']).optional().default('NONE'),
  imageUrl: z.string().optional(),
  articleUrl: z.string().optional(),
  articleTitle: z.string().optional(),
  articleDescription: z.string().optional(),
});

export type LinkedInCreatePostInput = z.infer<typeof LinkedInCreatePostInputSchema>;

export const LinkedInCreatePostOutputSchema = z.object({
  postId: z.string(),
  author: z.string(),
});

export type LinkedInCreatePostOutput = z.infer<typeof LinkedInCreatePostOutputSchema>;

const LINKEDIN_API_BASE_URL = 'https://api.linkedin.com';
const URN_PREFIX = 'urn:li:digitalmediaasset:';

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

interface ShareMedia {
  status: 'READY';
  originalUrl?: string;
  media?: string;
  title?: { text: string };
  description?: { text: string };
}

interface UgcPostBody {
  author: string;
  lifecycleState: 'PUBLISHED';
  specificContent: {
    'com.linkedin.ugc.ShareContent': {
      shareCommentary: { text: string };
      shareMediaCategory: 'NONE' | 'IMAGE' | 'ARTICLE';
      media?: ShareMedia[];
    };
  };
  visibility: {
    'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' | 'CONNECTIONS';
  };
}

function getLinkedInAccessToken(context: NodeExecutionContext): string | null {
  return context.credentials?.linkedin?.accessToken ?? null;
}

function getLinkedInAuthHeaders(context: NodeExecutionContext): Record<string, string> {
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

async function linkedInRequest<T>(
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

async function getAuthenticatedLinkedInPersonUrn(
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

async function registerLinkedInUpload(
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

async function uploadLinkedInBinary(
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

export const linkedinCreatePostNode = defineNode({
  type: 'linkedin_create_post',
  name: 'LinkedIn Create Post',
  description:
    'Create a new post on LinkedIn as a person or organization, with optional article or image media.',
  category: 'integration',
  inputSchema: LinkedInCreatePostInputSchema,
  outputSchema: LinkedInCreatePostOutputSchema,
  estimatedDuration: 10,
  capabilities: {
    supportsRerun: true,
  },
  executor: async (input, context) => {
    try {
      const accessToken = getLinkedInAccessToken(context);
      if (!accessToken) {
        return {
          success: false,
          error:
            'LinkedIn access token not configured. Please provide context.credentials.linkedin.accessToken.',
        };
      }

      let authorUrn: string;
      if (input.postAs === 'organization') {
        if (!input.organizationId) {
          return {
            success: false,
            error: 'organizationId is required when postAs is "organization".',
          };
        }
        authorUrn = `urn:li:organization:${input.organizationId}`;
      } else {
        authorUrn = await getAuthenticatedLinkedInPersonUrn(context);
      }

      const mediaCategory = input.mediaCategory ?? 'NONE';

      const shareContent: UgcPostBody['specificContent']['com.linkedin.ugc.ShareContent'] = {
        shareCommentary: { text: input.text },
        shareMediaCategory: mediaCategory,
      };

      if (mediaCategory === 'ARTICLE') {
        if (!input.articleUrl) {
          return {
            success: false,
            error: 'articleUrl is required when mediaCategory is "ARTICLE".',
          };
        }
        const mediaEntry: ShareMedia = {
          status: 'READY',
          originalUrl: input.articleUrl,
        };
        if (input.articleTitle) {
          mediaEntry.title = { text: input.articleTitle };
        }
        if (input.articleDescription) {
          mediaEntry.description = { text: input.articleDescription };
        }
        shareContent.media = [mediaEntry];
      } else if (mediaCategory === 'IMAGE') {
        if (!input.imageUrl) {
          return {
            success: false,
            error: 'imageUrl is required when mediaCategory is "IMAGE".',
          };
        }

        const normalized = input.imageUrl.trim();
        const isUrn = normalized.toLowerCase().startsWith(URN_PREFIX);

        let assetUrn: string;
        if (isUrn) {
          assetUrn = normalized;
        } else {
          const imgResponse = await fetch(normalized);
          if (!imgResponse.ok) {
            return {
              success: false,
              error: `Failed to download image from imageUrl: ${imgResponse.status} ${imgResponse.statusText}`,
            };
          }
          const binary = await imgResponse.arrayBuffer();

          const registered = await registerLinkedInUpload(context, authorUrn);
          await uploadLinkedInBinary(registered.uploadUrl, accessToken, binary);
          assetUrn = registered.assetUrn;
        }

        shareContent.media = [
          {
            status: 'READY',
            media: assetUrn,
          },
        ];
      }

      const body: UgcPostBody = {
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': shareContent,
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': input.visibility,
        },
      };

      const { headers } = await linkedInRequest(context, '/v2/ugcPosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const postId = headers.get('x-restli-id');
      if (!postId || postId.length === 0) {
        return {
          success: false,
          error: 'LinkedIn did not return X-RestLi-Id header on /v2/ugcPosts response.',
        };
      }

      return {
        success: true,
        output: {
          postId,
          author: authorUrn,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create LinkedIn post',
      };
    }
  },
});
