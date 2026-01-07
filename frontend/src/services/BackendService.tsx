import axios from 'axios';

export const isServerAliveRemote = async (serverUrl: string, token: string) => {
  try {
    // Use port 80 (nginx proxy) instead of the Vite dev server port
    const apiOrigin = window.location.origin.replace(/:\d+$/, '');
    const response = await axios.get(
      `${apiOrigin}/api/v1/test-connection`,
      {
        timeout: 25000,
        params: {
          url: serverUrl,
          token: token,
        },
      },
    );
    return response.data?.success;
  } catch (error) {
    console.error('Error while ping PMS remote:', error);
    return false;
  }
};
