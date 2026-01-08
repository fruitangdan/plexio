from itertools import chain
from typing import Annotated

from aiohttp import ClientSession
from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio.client import Redis

from plexio import __version__
from plexio.dependencies import (
    get_addon_configuration,
    get_cache,
    get_http_client,
    set_sentry_user,
)
from plexio.models import PLEX_TO_STREMIO_MEDIA_TYPE, STREMIO_TO_PLEX_MEDIA_TYPE
from plexio.models.addon import AddonConfiguration
from plexio.models.plex import PlexMediaType
from plexio.models.stremio import (
    StremioCatalog,
    StremioCatalogManifest,
    StremioManifest,
    StremioMediaType,
    StremioMetaResponse,
    StremioStreamsResponse,
)
from plexio.models.utils import plexio_id_to_guid
from plexio.plex.media_server_api import (
    SORT_OPTIONS,
    get_all_episodes,
    get_media,
    get_section_media,
    stremio_to_plex_id,
)

router = APIRouter()
router.dependencies.append(Depends(set_sentry_user))


@router.get('/manifest.json', response_model_exclude_none=True)
@router.get(
    '/{installation_id}/{base64_cfg}/manifest.json', response_model_exclude_none=True
)
async def get_manifest(
    configuration: Annotated[
        AddonConfiguration | None,
        Depends(get_addon_configuration),
    ],
    installation_id: str | None = None,
) -> StremioManifest:
    catalogs = []
    description = 'Play movies and series from plex.tv.'
    
    # Use custom name if provided, otherwise use default
    if configuration is not None:
        if configuration.custom_name:
            name = configuration.custom_name
        else:
            name = f'Plexio ({configuration.server_name})'
    else:
        name = "Plexio"

    if configuration is not None:
        for section in configuration.sections:
            # Use custom catalog name if provided, otherwise use default format
            if section.type == PlexMediaType.movie and configuration.catalog_name_movies:
                catalog_name = configuration.catalog_name_movies
            elif section.type == PlexMediaType.show and configuration.catalog_name_tv_shows:
                catalog_name = configuration.catalog_name_tv_shows
            else:
                catalog_name = f'{section.title} | {configuration.server_name}'
            
            catalogs.append(
                StremioCatalogManifest(
                    id=section.key,
                    type=PLEX_TO_STREMIO_MEDIA_TYPE[section.type],
                    name=catalog_name,
                    extra=[
                        {'name': 'skip', 'isRequired': False},
                        {'name': 'search', 'isRequired': False},
                        {'name': 'sort', 'options': list(SORT_OPTIONS.keys())},
                    ],
                ),
            )

        description += f' Your installation ID: {installation_id}'

    return StremioManifest(
        id='com.stremio.plexio',
        version=__version__,
        description=description,
        name=name,
        resources=[
            'stream',
            'catalog',
            {
                'name': 'meta',
                'types': ['movie', 'series'],
                'idPrefixes': ['plexio'],
            },
        ],
        types=[StremioMediaType.movie, StremioMediaType.series],
        catalogs=catalogs,
        idPrefixes=['tt', 'plexio'],
        behaviorHints={
            'configurable': True,
            'configurationRequired': configuration is None,
        },
        contactEmail='support@plexio.stream',
    )


@router.get(
    '/{installation_id}/{base64_cfg}/catalog/{stremio_type}/{catalog_id}.json',
    response_model_exclude_none=True,
)
@router.get(
    '/{installation_id}/{base64_cfg}/catalog/{stremio_type}/{catalog_id}/{extra}.json',
    response_model_exclude_none=True,
)
async def get_catalog(
    http: Annotated[ClientSession, Depends(get_http_client)],
    configuration: Annotated[AddonConfiguration, Depends(get_addon_configuration)],
    stremio_type: StremioMediaType,
    catalog_id: str,
    extra: str = '',
) -> StremioCatalog:
    extras = dict(e.split('=') for e in extra.split('&') if e)
    media = await get_section_media(
        client=http,
        url=configuration.discovery_url,
        token=configuration.access_token,
        section_id=catalog_id,
        search=extras.get('search', ''),
        skip=extras.get('skip', 0),
        sort=extras.get('sort', 'Title'),
    )
    return StremioCatalog(
        metas=[m.to_stremio_meta_review(configuration) for m in media],
    )


@router.get(
    '/{installation_id}/{base64_cfg}/meta/{stremio_type}/{plex_id:path}.json',
    response_model_exclude_none=True,
)
async def get_meta(
    http: Annotated[ClientSession, Depends(get_http_client)],
    configuration: Annotated[AddonConfiguration, Depends(get_addon_configuration)],
    stremio_type: StremioMediaType,
    plex_id: str,
) -> StremioMetaResponse:
    if not plex_id.startswith('plexio:'):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    guid = plexio_id_to_guid(plex_id)
    media = await get_media(
        client=http,
        url=configuration.discovery_url,
        token=configuration.access_token,
        guid=guid,
        get_only_first=True,
    )
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    media = media[0]

    meta = media.to_stremio_meta(configuration)

    if stremio_type == StremioMediaType.series:
        episodes = await get_all_episodes(
            client=http,
            url=configuration.discovery_url,
            token=configuration.access_token,
            key=media.key,
        )
        meta.videos = [e.to_stremio_video_meta(configuration) for e in episodes]
    return StremioMetaResponse(meta=meta)


@router.get(
    '/{installation_id}/{base64_cfg}/stream/{stremio_type}/{media_id:path}.json',
    response_model_exclude_none=True,
)
async def get_stream(
    http: Annotated[ClientSession, Depends(get_http_client)],
    cache: Annotated[Redis, Depends(get_cache)],
    configuration: Annotated[AddonConfiguration, Depends(get_addon_configuration)],
    stremio_type: StremioMediaType,
    media_id: str,
) -> StremioStreamsResponse:
    try:
        if media_id.startswith('tt'):
            plex_id = await stremio_to_plex_id(
                client=http,
                url=configuration.discovery_url,
                token=configuration.access_token,
                cache=cache,
                stremio_id=media_id,
                media_type=STREMIO_TO_PLEX_MEDIA_TYPE[stremio_type],
            )
            if not plex_id:
                print(f"Could not find Plex ID for IMDB ID: {media_id}")
                return StremioStreamsResponse()
        elif media_id.startswith('plexio:'):
            plex_id = plexio_id_to_guid(media_id)
        else:
            plex_id = media_id

        print(f"Fetching media for Plex ID: {plex_id}, type: {stremio_type}")
        media = await get_media(
            client=http,
            url=configuration.discovery_url,
            token=configuration.access_token,
            guid=plex_id,
        )
        
        if not media:
            print(f"No media found for Plex ID: {plex_id}")
            return StremioStreamsResponse()
        
        print(f"Found {len(media)} media items, generating streams")
        streams = list(chain.from_iterable(
            meta.get_stremio_streams(configuration) for meta in media
        ))
        print(f"Generated {len(streams)} streams")
        return StremioStreamsResponse(streams=streams)
    except HTTPException:
        # Re-raise HTTP exceptions (they already have proper status codes)
        raise
    except Exception as e:
        print(f"Error in get_stream for {media_id}: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail=f'Error fetching streams: {str(e)}',
        ) from e
