import { FC, useEffect } from 'react';
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

const STORAGE_KEY = 'plexio_config_form_values';

// Load form values from localStorage
const loadFormValues = (): Partial<ConfigurationFormType> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load form values from localStorage:', e);
  }
  return {};
};

// Save form values to localStorage
const saveFormValues = (values: Partial<ConfigurationFormType>) => {
  try {
    // Save section keys for restoration (sections are server-specific but we can restore by key)
    const sectionKeys = values.sections?.map((s: any) => s.key) || [];
    
    const valuesToSave: Partial<ConfigurationFormType> & { savedSectionKeys?: string[] } = {
      serverName: values.serverName,
      discoveryUrl: values.discoveryUrl,
      streamingUrl: values.streamingUrl,
      includeTranscodeOriginal: values.includeTranscodeOriginal,
      includeTranscodeDown: values.includeTranscodeDown,
      transcodeDownQualities: values.transcodeDownQualities,
      includePlexTv: values.includePlexTv,
      customName: values.customName,
      streamName: values.streamName,
      showLibraryName: values.showLibraryName,
      catalogNameMovies: values.catalogNameMovies,
      catalogNameTvShows: values.catalogNameTvShows,
      savedSectionKeys: sectionKeys,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(valuesToSave));
  } catch (e) {
    console.warn('Failed to save form values to localStorage:', e);
  }
};

const ConfigurationForm: FC<Props> = ({ servers }) => {
  const savedValues = loadFormValues();
  
  const form = useForm<ConfigurationFormType>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      includeTranscodeOriginal: savedValues.includeTranscodeOriginal ?? false,
      includeTranscodeDown: savedValues.includeTranscodeDown ?? false,
      includePlexTv: savedValues.includePlexTv ?? false,
      sections: [],
      customName: savedValues.customName ?? '',
      streamName: savedValues.streamName ?? '',
      showLibraryName: savedValues.showLibraryName ?? false,
      catalogNameMovies: savedValues.catalogNameMovies ?? '',
      catalogNameTvShows: savedValues.catalogNameTvShows ?? '',
      serverName: savedValues.serverName ?? '',
      discoveryUrl: savedValues.discoveryUrl ?? '',
      streamingUrl: savedValues.streamingUrl ?? '',
      transcodeDownQualities: savedValues.transcodeDownQualities ?? [],
    },
  });

  // Save form values to localStorage whenever they change
  useEffect(() => {
    const subscription = form.watch((values) => {
      // Filter out undefined sections and ensure all required properties exist
      const validSections = values.sections?.filter(
        (s): s is { title: string; key: string; type: string } =>
          s !== undefined && 
          s.title !== undefined && 
          s.key !== undefined && 
          s.type !== undefined
      ) || [];
      
      // Filter out undefined items from transcodeDownQualities
      const validQualities = values.transcodeDownQualities?.filter(
        (q): q is string => q !== undefined
      ) || [];
      
      saveFormValues({
        ...values,
        sections: validSections,
        transcodeDownQualities: validQualities,
      });
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const serverName = form.watch('serverName');
  const server = servers.find((s) => s.name == serverName);

  const discoveryUrl = form.watch('discoveryUrl');
  const { sections, error: sectionsError, loading: sectionsLoading } = usePMSSections(discoveryUrl, server?.accessToken || null);

  // Restore section selections when sections are loaded
  useEffect(() => {
    const savedSectionKeys = (savedValues as any).savedSectionKeys as string[] | undefined;
    if (savedSectionKeys && savedSectionKeys.length > 0 && sections.length > 0) {
      // Check if we haven't already restored sections (avoid infinite loop)
      const currentSections = form.getValues('sections') || [];
      const currentSectionKeys = currentSections.map((s: any) => s.key);
      
      // Only restore if sections haven't been set yet or if they don't match saved keys
      if (currentSectionKeys.length === 0 || 
          !savedSectionKeys.every(key => currentSectionKeys.includes(key))) {
        // Find sections that match saved keys
        const sectionsToRestore = sections
          .filter((section: any) => savedSectionKeys.includes(section.key))
          .map((section: any) => ({
            key: section.key,
            title: section.title,
            type: section.type,
          }));
        
        if (sectionsToRestore.length > 0) {
          form.setValue('sections', sectionsToRestore, { shouldDirty: false });
        }
      }
    }
  }, [sections, form, savedValues]);

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
    
    // Check if we're in Electron
    const isElectron = (window as any).__ELECTRON__ === true;
    const backendPort = isElectron ? 8000 : 80; // Electron uses 8000, Docker uses 80 (nginx)
    
    // Use the Mac's IP address for the addon URL so FireTV and other devices can access it
    // Priority: discoveryUrl > streamingUrl > server connections > current host
    let addonOrigin = '';
    let detectedIp = '';
    
    try {
      // Method 1: Extract IP from discovery URL (highest priority - most reliable)
      if (configuration.discoveryUrl) {
        try {
          const discoveryUrlObj = new URL(configuration.discoveryUrl);
          const discoveryHost = discoveryUrlObj.hostname;
          // Check if it's a direct IP address
          if (discoveryHost.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            detectedIp = discoveryHost;
            addonOrigin = `http://${discoveryHost}:${backendPort}`;
            console.log('Using IP from discovery URL:', addonOrigin);
          }
        } catch (e) {
          console.warn('Failed to parse discovery URL:', e);
        }
      }
      
      // Method 2: Extract IP from streaming URL (fallback)
      if (!detectedIp && configuration.streamingUrl) {
        try {
          const streamingUrlObj = new URL(configuration.streamingUrl);
          const streamingHost = streamingUrlObj.hostname;
          if (streamingHost.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            detectedIp = streamingHost;
            addonOrigin = `http://${streamingHost}:${backendPort}`;
            console.log('Using IP from streaming URL:', addonOrigin);
          }
        } catch (e) {
          console.warn('Failed to parse streaming URL:', e);
        }
      }
      
      // Method 3: Extract from server connections (if available)
      if (!detectedIp && server?.connections) {
        // Find a local connection with an IP address
        const localConnection = server.connections.find(
          (conn: any) => conn.local && conn.address && conn.address.match(/^\d+\.\d+\.\d+\.\d+$/)
        );
        if (localConnection) {
          detectedIp = localConnection.address;
          addonOrigin = `http://${localConnection.address}:${backendPort}`;
          console.log('Using IP from server connections:', addonOrigin);
        }
      }
      
      // Method 4: Check if current host is already an IP
      if (!detectedIp) {
        const currentHost = window.location.hostname;
        if (currentHost.match(/^\d+\.\d+\.\d+\.\d+$/)) {
          detectedIp = currentHost;
          addonOrigin = `http://${currentHost}:${backendPort}`;
          console.log('Using IP from current host:', addonOrigin);
        }
      }
      
      // Fallback: If we still couldn't determine the IP, use localhost (won't work from FireTV)
      if (!detectedIp) {
        addonOrigin = `http://localhost:${backendPort}`;
        console.error(
          '⚠️ WARNING: Could not automatically detect network IP address. ' +
          `The addon URL will use localhost:${backendPort}, which WILL NOT work from FireTV or other devices. ` +
          'Please check your discovery URL contains a valid IP address (e.g., http://192.168.x.x:32400)'
        );
      }
    } catch (e) {
      console.error('Failed to determine network IP:', e);
      addonOrigin = `http://localhost:${backendPort}`;
    }
    
    const addonUrl = `${addonOrigin}/${uuidv4()}/${encodedConfiguration}/manifest.json`;
    console.log('Generated addon URL:', addonUrl);

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
          <SectionsField form={form} sections={sections} error={sectionsError} loading={sectionsLoading}></SectionsField>
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
