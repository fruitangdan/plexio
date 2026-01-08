import asyncio
import json
from json import JSONDecodeError

import aiohttp
from aiohttp import ClientConnectorError, ServerDisconnectedError
from fastapi import HTTPException
from sentry_sdk import configure_scope

from plexio.settings import settings


class PlexUnauthorizedError(BaseException):
    pass


async def get_json(client, url, params=None):
    if params is None:
        params = {}
    try:
        async with client.get(
            url,
            params=params,
            timeout=aiohttp.ClientTimeout(total=settings.plex_requests_timeout),
        ) as response:
            # log unauthorized to sentry
            if response.status in (401, 403):
                raise PlexUnauthorizedError
            if response.status >= 400:
                error_text = await response.text()
                print(f"Plex server error: {response.status} for {url}, response: {error_text[:200]}")
                raise HTTPException(
                    status_code=502,
                    detail=f'Received error from plex server: {response.status}',
                )
            response_bytes = await response.read()
            response_text = response_bytes.decode(errors='ignore')
            if not response_text.strip():
                print(f"Empty response from {url}")
                raise HTTPException(
                    status_code=502,
                    detail='Empty response from plex server',
                )
            try:
                return json.loads(response_text)
            except JSONDecodeError as e:
                print(f"JSON decode error for {url}, response: {response_text[:500]}")
                with configure_scope() as scope:
                    scope.add_attachment(bytes=response_bytes, filename='attachment.txt')
                raise e
    except ClientConnectorError as e:
        print(f"Plex connection error for {url}: {e}")
        raise HTTPException(
            status_code=502,
            detail=f'Plex server connection error: {str(e)}',
        ) from e
    except ServerDisconnectedError as e:
        print(f"Plex server disconnected for {url}: {e}")
        raise HTTPException(
            status_code=502,
            detail=f'Plex server disconnected error: {str(e)}',
        ) from e
    except asyncio.TimeoutError as e:
        print(f"Plex server timeout for {url}: {e}")
        raise HTTPException(
            status_code=504,
            detail=f'Plex server timeout error: {str(e)}',
        ) from e
    except TimeoutError as e:
        print(f"Plex server timeout (TimeoutError) for {url}: {e}")
        raise HTTPException(
            status_code=504,
            detail=f'Plex server timeout error: {str(e)}',
        ) from e
