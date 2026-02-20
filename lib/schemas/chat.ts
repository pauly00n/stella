import { z } from "zod";

export const TaskTypeSchema = z.enum([
  "Auto",
  "Refine draft report",
  "Differential diagnostic",
]);

export const DefaultTaskSchema = z.enum(["auto", "refine", "diagnostic"]);
export const InternalTaskSchema = z.enum(["refine", "diagnostic", "none"]);

export const ImageMetaSchema = z
  .object({
    title: z.string().optional(),
    link: z.string().optional(),
    displayLink: z.string().optional(),
    snippet: z.string().optional(),
    contextLink: z.string().optional(),
    thumbnailLink: z.string().optional(),
    image: z
      .object({
        contextLink: z.string().optional(),
        thumbnailLink: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

export const MessageMetaSchema = z
  .object({
    status: z
      .enum(["analyzing_task", "refining", "generating", "complete"])
      .optional(),
    images: z.array(ImageMetaSchema).optional(),
    task: InternalTaskSchema.nullable().optional(),
    latencyMs: z.number().optional(),
    showImages: z.boolean().optional(),
    imageQuery: z.string().optional(),
  })
  .passthrough();

export const CreateChatBodySchema = z.object({
  messageContent: z.string().trim().min(1),
  task: TaskTypeSchema,
});

export const UpdateChatTitleBodySchema = z.object({
  title: z.string().trim().min(1),
});

export const GenerateOperationSchema = z.enum(["response", "images"]);

export const GenerateForChatBodySchema = z.object({
  chatId: z.string().trim().min(1),
  operation: GenerateOperationSchema.optional(),
  draft: z.string().optional(),
  mode: TaskTypeSchema.optional(),
  showImages: z.boolean().optional(),
  messageId: z.string().optional(),
});

export type TaskType = z.infer<typeof TaskTypeSchema>;
export type DefaultTask = z.infer<typeof DefaultTaskSchema>;
export type InternalTask = z.infer<typeof InternalTaskSchema>;
export type MessageMeta = z.infer<typeof MessageMetaSchema>;
export type CreateChatBody = z.infer<typeof CreateChatBodySchema>;
export type UpdateChatTitleBody = z.infer<typeof UpdateChatTitleBodySchema>;
export type GenerateForChatBody = z.infer<typeof GenerateForChatBodySchema>;
