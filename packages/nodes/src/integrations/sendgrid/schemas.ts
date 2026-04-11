import { z } from 'zod';

// ----- Shared sub-schemas -----

export const SendgridContentSchema = z.object({
  type: z.enum(['text/plain', 'text/html']),
  value: z.string().min(1, 'Content value is required'),
});

export const SendgridAttachmentSchema = z.object({
  content: z.string().min(1, 'Attachment content (base64) is required'),
  filename: z.string().min(1, 'Attachment filename is required'),
  type: z.string().min(1, 'Attachment MIME type is required'),
  disposition: z.enum(['attachment', 'inline']).optional(),
  contentId: z.string().optional(),
});

// ----- sendgridSendEmail -----

const trimmedEmail = z.string().trim().email();

export const SendgridSendEmailInputSchema = z
  .object({
    to: z.union([trimmedEmail, z.array(trimmedEmail).min(1, 'At least one recipient is required')]),
    from: trimmedEmail,
    subject: z
      .string()
      .min(1, 'Subject is required')
      .regex(/^[^\r\n]*$/, 'Subject must not contain CR or LF characters'),
    content: SendgridContentSchema,
    cc: z.array(trimmedEmail).optional(),
    bcc: z.array(trimmedEmail).optional(),
    replyTo: trimmedEmail.optional(),
    templateId: z.string().optional(),
    dynamicTemplateData: z.record(z.string(), z.unknown()).optional(),
    sendAt: z.number().int().positive().optional(),
    attachments: z.array(SendgridAttachmentSchema).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.dynamicTemplateData !== undefined && value.templateId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dynamicTemplateData'],
        message: 'dynamicTemplateData requires templateId to be set',
      });
    }
  });

export const SendgridSendEmailOutputSchema = z.object({
  messageId: z.string(),
  status: z.enum(['sent', 'scheduled']),
});

// ----- sendgridCreateContact -----

export const SendgridCreateContactInputSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  listIds: z.array(z.string()).optional(),
});

export const SendgridCreateContactOutputSchema = z.object({
  contactJobId: z.string(),
  email: z.string(),
  status: z.literal('queued'),
});

// ----- sendgridGetContacts -----

export const SendgridGetContactsInputSchema = z.object({
  listId: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

export const SendgridContactSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  listIds: z.array(z.string()),
});

export const SendgridGetContactsOutputSchema = z.object({
  contacts: z.array(SendgridContactSchema),
  total: z.number().int().min(0),
});

// ----- Inferred types -----

export type SendgridContent = z.infer<typeof SendgridContentSchema>;
export type SendgridAttachment = z.infer<typeof SendgridAttachmentSchema>;
export type SendgridContact = z.infer<typeof SendgridContactSchema>;

export type SendgridSendEmailInput = z.infer<typeof SendgridSendEmailInputSchema>;
export type SendgridSendEmailOutput = z.infer<typeof SendgridSendEmailOutputSchema>;

export type SendgridCreateContactInput = z.infer<typeof SendgridCreateContactInputSchema>;
export type SendgridCreateContactOutput = z.infer<typeof SendgridCreateContactOutputSchema>;

export type SendgridGetContactsInput = z.infer<typeof SendgridGetContactsInputSchema>;
export type SendgridGetContactsOutput = z.infer<typeof SendgridGetContactsOutputSchema>;
