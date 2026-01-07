import { FC } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { encode as base64_encode } from 'js-base64';
import { useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import {
  DiscoveryUrlField,
  IncludeTranscodeOriginalField,
  SectionsField,
  ServerNameField,
  StreamingUrlField,
  IncludeTranscodeDownFields,
  IncludePlexTvField,
  CustomNameField,
  StreamNameField,
  ShowLibraryNameField,
  CatalogNameMoviesField,
  CatalogNameTvShowsField,
} from '@/components/configurationForm/fields';
import {
  formSchema,
  ConfigurationFormType,
} from '@/components/configurationForm/formSchema.tsx';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button.tsx';
import { Form } from '@/components/ui/form';
import usePMSSections from '@/hooks/usePMSSections.tsx';

interface Props {
  servers: PlexServer[];
}

const ConfigurationForm: FC<Props> = ({ servers }) => {
  const form = useForm<ConfigurationFormType>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      includeTranscodeOriginal: false,
      includeTranscodeDown: false,
      includePlexTv: false,
      sections: [],
      customName: '',
      streamName: '',
      showLibraryName: false,
      catalogNameMovies: '',
      catalogNameTvShows: '',
    },
  });

  const serverName = form.watch('serverName');
  const server = servers.find((s) => s.name == serverName);

  const discoveryUrl = form.watch('discoveryUrl');
  const sections = usePMSSections(discoveryUrl, server?.accessToken || null);

  function onSubmit(configuration: any, event: any) {
    configuration.version = __APP_VERSION__;
    configuration.accessToken = server?.accessToken;
    configuration.sections = configuration.sections.filter((item: any) =>
      sections.find((s) => s.key === item.key),
    );

    // Helper function to convert plex.direct URLs to direct IP URLs
    const convertPlexDirectUrl = (url: string): string => {
      if (!url || !url.includes('.plex.direct')) {
        return url;
      }
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const ipMatch = hostname.match(/^(\d+-\d+-\d+-\d+)/);
        if (ipMatch) {
          const ip = ipMatch[1].replace(/-/g, '.');
          const port = urlObj.port || '32400';
          // Use HTTP for local connections instead of HTTPS
          return `http://${ip}:${port}`;
        }
      } catch (e) {
        console.warn('Failed to convert plex.direct URL:', e);
      }
      return url;
    };

    // Convert local plex.direct URLs to direct IP URLs for better compatibility
    // Plex.direct URLs may not resolve properly in Stremio or from Docker containers
    configuration.streamingUrl = convertPlexDirectUrl(configuration.streamingUrl);
    configuration.discoveryUrl = convertPlexDirectUrl(configuration.discoveryUrl);

    // Handle custom name - remove if empty, otherwise trim whitespace
    if (configuration.customName && configuration.customName.trim()) {
      configuration.customName = configuration.customName.trim();
    } else {
      delete configuration.customName; // Remove if empty
    }

    // Handle stream name - remove if empty, otherwise trim whitespace
    if (configuration.streamName && configuration.streamName.trim()) {
      configuration.streamName = configuration.streamName.trim();
    } else {
      delete configuration.streamName; // Remove if empty
      // If stream name is empty, also disable showLibraryName
      if (configuration.showLibraryName) {
        configuration.showLibraryName = false;
      }
    }

    // If stream name is not provided, remove showLibraryName
    if (!configuration.streamName && configuration.showLibraryName) {
      delete configuration.showLibraryName;
    }

    // Handle catalog names - remove if empty, otherwise trim whitespace
    if (configuration.catalogNameMovies && configuration.catalogNameMovies.trim()) {
      configuration.catalogNameMovies = configuration.catalogNameMovies.trim();
    } else {
      delete configuration.catalogNameMovies;
    }

    if (configuration.catalogNameTvShows && configuration.catalogNameTvShows.trim()) {
      configuration.catalogNameTvShows = configuration.catalogNameTvShows.trim();
    } else {
      delete configuration.catalogNameTvShows;
    }

    const encodedConfiguration = base64_encode(JSON.stringify(configuration));
    
    // Use the Mac's IP address for the addon URL so FireTV and other devices can access it
    // Try multiple methods to detect the local network IP
    let addonOrigin = window.location.origin.replace(/:\d+$/, '');
    
    try {
      const currentHost = window.location.hostname;
      
      // Method 1: If already using an IP address, use it
      if (currentHost.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        addonOrigin = `http://${currentHost}`;
      } else if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
        // Method 2: Extract IP from streaming URL (most reliable for local connections)
        try {
          const streamingUrlObj = new URL(configuration.streamingUrl);
          const streamingHost = streamingUrlObj.hostname;
          if (streamingHost.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            addonOrigin = `http://${streamingHost}`;
          }
        } catch (e) {
          // streamingUrl might not be set yet, try discovery URL
        }
        
        // Method 3: If streaming URL didn't work, try discovery URL
        if (addonOrigin.includes('localhost') && configuration.discoveryUrl) {
          try {
            const discoveryUrlObj = new URL(configuration.discoveryUrl);
            const discoveryHost = discoveryUrlObj.hostname;
            if (discoveryHost.match(/^\d+\.\d+\.\d+\.\d+$/)) {
              addonOrigin = `http://${discoveryHost}`;
            }
          } catch (e) {
            // discoveryUrl might not be a valid URL
          }
        }
        
        // Method 4: If still on localhost, try to extract from server connections
        if (addonOrigin.includes('localhost') && server?.connections) {
          // Find a local connection with an IP address
          const localConnection = server.connections.find(
            (conn: any) => conn.local && conn.address && conn.address.match(/^\d+\.\d+\.\d+\.\d+$/)
          );
          if (localConnection) {
            addonOrigin = `http://${localConnection.address}`;
          }
        }
        
        // If we still couldn't determine the IP, keep localhost and log a warning
        if (addonOrigin.includes('localhost')) {
          console.warn(
            'Could not automatically detect network IP address. ' +
            'The addon URL will use localhost, which may not work from other devices. ' +
            'You may need to manually edit the URL to use your Mac\'s IP address (e.g., http://192.168.x.x)'
          );
        }
      }
    } catch (e) {
      console.warn('Failed to determine network IP, using current origin:', e);
    }
    
    const addonUrl = `${addonOrigin}/${uuidv4()}/${encodedConfiguration}/manifest.json`;

    if (event.nativeEvent.submitter.name === 'clipboard') {
      navigator.clipboard.writeText(addonUrl);
    } else {
      window.location.href = addonUrl.replace(/https?:\/\//, 'stremio://');
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-2 p-2 rounded-lg border"
      >
        <ServerNameField form={form} servers={servers} />
        {server && (
          <>
            <DiscoveryUrlField form={form} server={server} />
            <StreamingUrlField form={form} server={server} />
          </>
        )}
        {discoveryUrl && (
          <SectionsField form={form} sections={sections}></SectionsField>
        )}
        <CustomNameField form={form} />
        <StreamNameField form={form} />
        <ShowLibraryNameField form={form} />
        <CatalogNameMoviesField form={form} />
        <CatalogNameTvShowsField form={form} />
        <IncludeTranscodeOriginalField form={form} />
        <IncludeTranscodeDownFields form={form} />
        <IncludePlexTvField form={form} />

        <div className="flex items-center space-x-1 justify-center p-3">
          <Button className="h-11 w-10 p-2" type="submit" name="clipboard">
            <Icons.clipboard />
          </Button>
          <Button
            className="h-11 rounded-md px-8 text-xl"
            type="submit"
            name="install"
          >
            Install
          </Button>
        </div>
      </form>
    </Form>
  );
};

export default ConfigurationForm;
