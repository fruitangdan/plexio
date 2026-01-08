import axios from 'axios';
import { getApiOrigin } from '@/lib/apiOrigin';

export const isServerAliveRemote = async (serverUrl: string, token: string) => {
  try {
    const apiOrigin = getApiOrigin();
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
