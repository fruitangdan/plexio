from typing import Annotated

from aiohttp import ClientSession
from fastapi import APIRouter, Depends
from yarl import URL

from plexio.dependencies import get_http_client
from plexio.plex.media_server_api import check_server_connection
from plexio.plex.utils import get_json

router = APIRouter(prefix='/api/v1')


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
    try:
        json = await get_json(
            client=http,
            url=URL(url) / 'library/sections',
            params={'X-Plex-Token': token},
        )
        sections = json.get('MediaContainer', {}).get('Directory', [])
        # Filter to only show movies and TV shows
        filtered_sections = [
            section
            for section in sections
            if section.get('type') in ('movie', 'show')
        ]
        return {'sections': filtered_sections}
    except Exception as e:
        return {'sections': [], 'error': str(e)}
