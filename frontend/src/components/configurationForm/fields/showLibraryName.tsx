import { FC } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { ConfigurationFormType } from '@/components/configurationForm/formSchema.tsx';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form.tsx';
import { Switch } from '@/components/ui/switch.tsx';

interface Props {
  form: UseFormReturn<ConfigurationFormType>;
}

export const ShowLibraryNameField: FC<Props> = ({ form }) => {
  const streamName = form.watch('streamName');
  const hasStreamName = streamName && streamName.trim().length > 0;

  return (
    <FormField
      control={form.control}
      name="showLibraryName"
      render={({ field }) => (
        <FormItem className="items-center justify-between flex flex-row rounded-lg border p-2">
          <div className="space-y-0.5">
            <FormLabel className="text-base">Show Library Name</FormLabel>
            <FormDescription>
              Show "Movies" or "TV Shows" under the stream name. Only applies when Stream Name is provided.
            </FormDescription>
          </div>
          <FormControl>
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={!hasStreamName}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
};
