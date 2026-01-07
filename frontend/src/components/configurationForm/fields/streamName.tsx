import { FC } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { ConfigurationFormType } from '@/components/configurationForm/formSchema.tsx';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form.tsx';

interface Props {
  form: UseFormReturn<ConfigurationFormType>;
}

export const StreamNameField: FC<Props> = ({ form }) => {
  return (
    <FormField
      control={form.control}
      name="streamName"
      render={({ field }) => (
        <FormItem className="rounded-lg border p-2">
          <FormLabel className="text-base">Stream Name (Optional)</FormLabel>
          <FormControl>
            <input
              {...field}
              type="text"
              placeholder="Leave empty to use default name"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </FormControl>
          <FormDescription>
            Customize the stream name shown on each stream. If empty, will use "Server Name Library Name".
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
