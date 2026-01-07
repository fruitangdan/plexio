import axios from 'axios';

export const isServerAliveLocal = async (serverUrl: string, token: string) => {
  try {
    const response = await axios.get(serverUrl, {
      timeout: 25000,
      params: {
        'X-Plex-Token': token,
      },
    });
    return response.status === 200;
  } catch (error) {
    console.error('Error while ping PMS:', error);
    return false;
  }
};

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

export const getSections = async (
  serverUrl: string,
  token: string,
): Promise<any[]> => {
  try {
    // Convert plex.direct URLs to direct IP URLs before calling the API
    // The backend (in Docker) can't access plex.direct domains
    const convertedUrl = convertPlexDirectUrl(serverUrl);
    if (convertedUrl !== serverUrl) {
      console.log('Converted plex.direct URL:', serverUrl, '->', convertedUrl);
    }
    
    // Use the backend API instead of connecting directly to Plex
    // This avoids CORS issues and network access problems
    // Use port 80 (nginx proxy) instead of the Vite dev server port
    const apiOrigin = window.location.origin.replace(/:\d+$/, '');
    const apiUrl = `${apiOrigin}/api/v1/sections`;
    console.log('Fetching sections from:', apiUrl, 'with URL:', convertedUrl);
    
    const response = await axios.get(
      apiUrl,
      {
        timeout: 30000,
      params: {
          url: convertedUrl,
          token: token,
        },
      },
    );

    const sections = response.data?.sections;

    if (!Array.isArray(sections)) {
      console.error('Invalid response structure:', response.data);
      throw new Error('Invalid response from server');
    }

    // Check if there's an error message from the backend
    if (response.data?.error) {
      console.error('Backend error:', response.data.error);
      throw new Error(`Failed to fetch sections: ${response.data.error}`);
    }

    return sections;
  } catch (error) {
    console.error('Error fetching Plex sections:', error);
    throw error;
  }
};
