from typing import Annotated

from aiohttp import ClientSession
from fastapi import APIRouter, Depends
from yarl import URL

from plexio.dependencies import get_http_client, get_public_base_url_dep
from plexio.plex.media_server_api import check_server_connection
from plexio.plex.utils import get_json

router = APIRouter(prefix='/api/v1')


@router.get('/public-base-url')
async def get_public_base_url(
    public_base_url: Annotated[str | None, Depends(get_public_base_url_dep)],
):
    """
    Return the public base URL when behind Cloudflare or PUBLIC_BASE_URL is set.
    Used by the config page so "Copy Manifest URL" uses the public domain.
    """
    return {'publicBaseUrl': public_base_url}


@router.get('/test-connection')
async def test_connection(
    http: Annotated[ClientSession, Depends(get_http_client)],
    url: str,
    token: str,
):
    success = await check_server_connection(
        client=http,
        url=URL(url),
        token=token,
    )
    return {'success': success}


@router.get('/sections')
async def get_sections(
    http: Annotated[ClientSession, Depends(get_http_client)],
    url: str,
    token: str,
):
    """Get Plex library sections (movies and TV shows)"""
    print(f'[API] /api/v1/sections called with url={url}, token={token[:10]}...')
    try:
        plex_url = URL(url) / 'library/sections'
        print(f'[API] Fetching from Plex: {plex_url}')
        json = await get_json(
            client=http,
            url=plex_url,
            params={'X-Plex-Token': token},
        )
        print(f'[API] Got response from Plex, parsing sections...')
        sections = json.get('MediaContainer', {}).get('Directory', [])
        print(f'[API] Found {len(sections)} total sections')
        # Filter to only show movies and TV shows
        filtered_sections = [
            section
            for section in sections
            if section.get('type') in ('movie', 'show')
        ]
        print(f'[API] Returning {len(filtered_sections)} filtered sections (movies/shows)')
        return {'sections': filtered_sections}
    except Exception as e:
        import traceback
        error_msg = str(e)
        print(f'[API] Error fetching sections: {error_msg}')
        print(f'[API] Traceback: {traceback.format_exc()}')
        return {'sections': [], 'error': error_msg}
