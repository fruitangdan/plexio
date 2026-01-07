import { z } from 'zod';

export const formSchema = z.object({
  serverName: z.string(),
  discoveryUrl: z.string(),
  streamingUrl: z.string(),
  sections: z
    .array(
      z.object({
        key: z.string(),
        title: z.string(),
        type: z.string(),
      }),
    ),
  includeTranscodeOriginal: z.boolean(),
  includeTranscodeDown: z.boolean(),
  transcodeDownQualities: z.array(z.string()).optional(),
  includePlexTv: z.boolean(),
  customName: z.string().optional(),
  streamName: z.string().optional(),
  showLibraryName: z.boolean(),
  catalogNameMovies: z.string().optional(),
  catalogNameTvShows: z.string().optional(),
});

export type ConfigurationFormType = z.infer<typeof formSchema>;
