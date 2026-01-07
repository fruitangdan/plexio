import { useEffect, useState } from 'react';
import { PlexToken } from '@/hooks/usePlexToken.tsx';
import { getSections } from '@/services/PMSService.tsx';

const usePMSSections = (serverUrl: string, plexToken: PlexToken) => {
  const [sections, setSections] = useState<any[]>([]);

  useEffect(() => {
    setSections([]);
    if (!plexToken || !serverUrl) {
      return;
    }

    const fetchSections = async (): Promise<void> => {
      try {
      const sectionsData = await getSections(serverUrl, plexToken);
      setSections(sectionsData);
      } catch (error) {
        console.error('Failed to fetch sections:', error);
        setSections([]); // Set empty array on error to stop the spinner
      }
    };

    void fetchSections();
  }, [serverUrl, plexToken]);

  return sections;
};

export default usePMSSections;
