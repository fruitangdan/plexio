import { useEffect, useState } from 'react';
import { PlexToken } from '@/hooks/usePlexToken.tsx';
import { getSections } from '@/services/PMSService.tsx';

interface UsePMSSectionsResult {
  sections: any[];
  error: string | null;
  loading: boolean;
}

const usePMSSections = (serverUrl: string, plexToken: PlexToken): UsePMSSectionsResult => {
  const [sections, setSections] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setSections([]);
    setError(null);
    setLoading(false);
    
    if (!plexToken || !serverUrl) {
      return;
    }

    const fetchSections = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const sectionsData = await getSections(serverUrl, plexToken);
        setSections(sectionsData);
        setError(null);
      } catch (err: any) {
        console.error('Failed to fetch sections:', err);
        const errorMessage = err?.message || 'Failed to fetch sections from Plex server';
        setError(errorMessage);
        setSections([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchSections();
  }, [serverUrl, plexToken]);

  return { sections, error, loading };
};

export default usePMSSections;
