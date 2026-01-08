import ssl
from http import HTTPStatus

import aiohttp
from aiohttp import ClientConnectorError, ClientSession
from yarl import URL

from plexio.models.plex import (
    PlexEpisodeMeta,
    PlexMediaMeta,
    PlexMediaType,
)
from plexio.plex.utils import get_json
from plexio.settings import settings

SORT_OPTIONS = {
    'Title': 'title',
    'Title (desc)': 'title:desc',
    'Year': 'year',
    'Year (desc)': 'year:desc',
    'Release Date': 'originallyAvailableAt',
    'Release Date (desc)': 'originallyAvailableAt:desc',
    'Critic Rating': 'rating',
    'Critic Rating (desc)': 'rating:desc',
    'Audience Rating': 'audienceRating',
    'Audience Rating (desc)': 'audienceRating:desc',
    'Rating': 'userRating',
    'Rating (desc)': 'userRating:desc',
    'Content Rating': 'contentRating',
    'Content Rating (desc)': 'contentRating:desc',
    'Duration': 'duration',
    'Duration (desc)': 'duration:desc',
    'Progress': 'viewOffset',
    'Progress (desc)': 'viewOffset:desc',
    'Plays': 'viewCount',
    'Plays (desc)': 'viewCount:desc',
    'Date Added': 'addedAt',
    'Date Added (desc)': 'addedAt:desc',
    'Date Viewed': 'lastViewedAt',
    'Date Viewed (desc)': 'lastViewedAt:desc',
    'ResolutionSelected': 'mediaHeight',
    'ResolutionSelected (desc)': 'mediaHeight:desc',
    'Bitrate': 'mediaBitrate',
    'Bitrate (desc)': 'mediaBitrate:desc',
    'Randomly': 'random',
}


async def check_server_connection(
    *,
    client: ClientSession,
    url: URL,
    token: str,
) -> bool:
    try:
        async with client.get(
            url,
            params={
                'X-Plex-Token': token,
            },
            timeout=settings.plex_requests_timeout,
        ) as response:
            if response.status != HTTPStatus.OK:
                return False
            return True
    except (TimeoutError, ClientConnectorError):
        return False


async def get_section_media(
    *,
    client: ClientSession,
    url: URL,
    token: str,
    section_id: str,
    skip: int,
    search: str,
    sort: str,
) -> list[PlexMediaMeta]:
    params = {
        'includeGuids': 1,
        'X-Plex-Container-Start': skip,
        'X-Plex-Container-Size': 100,
        'X-Plex-Token': token,
    }
    if search:
        params['title'] = search
    if sort:
        params['sort'] = SORT_OPTIONS[sort]
    json = await get_json(
        client=client,
        url=url / 'library/sections' / section_id / 'all',
        params=params,
    )
    metadata = json['MediaContainer'].get('Metadata', [])
    return [PlexMediaMeta(**meta) for meta in metadata]


async def get_media(
    *,
    client: ClientSession,
    url: URL,
    token: str,
    guid: str,
    get_only_first=False,
) -> list[PlexMediaMeta]:
    json = await get_json(
        client=client,
        url=url / 'library/all',
        params={
            'guid': guid,
            'X-Plex-Token': token,
        },
    )
    media_sections = json['MediaContainer'].get('Metadata', [])
    media_metas = []
    for section in media_sections:
        if section['type'] not in ('show', 'movie', 'episode'):
            continue
        json = await get_json(
            client=client,
            url=url / 'library/metadata' / section['ratingKey'],
            params={
                'X-Plex-Token': token,
                'includeElements': 'Stream',
            },
        )
        metadata = json['MediaContainer']['Metadata'][0]
        media_metas.append(PlexMediaMeta(**metadata))
        if get_only_first:
            break
    return media_metas


async def get_all_episodes(
    *,
    client: ClientSession,
    url: URL,
    token: str,
    key: str,
) -> list[PlexEpisodeMeta]:
    json = await get_json(
        client=client,
        url=str(url / key[1:]).replace('/children', '/allLeaves'),
        params={
            'X-Plex-Token': token,
        },
    )
    metadata = json['MediaContainer'].get('Metadata', [])
    episodes = []
    for i, meta in enumerate(metadata):
        meta.setdefault('index', i)
        episodes.append(PlexEpisodeMeta(**meta))
    return episodes


async def imdb_to_plex_id(
    *,
    client: ClientSession,
    imdb_id: str,
    media_type: PlexMediaType,
    token: str,
    url: URL | None = None,
) -> str | None:
    # Try metadata provider first (use matching token if available, otherwise use access token)
    matching_token = settings.plex_matching_token or token
    if matching_token:
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        connector = aiohttp.TCPConnector(ssl=ssl_context)
        try:
            async with aiohttp.ClientSession(connector=connector) as temp_client:
                json_data = await get_json(
                    client=temp_client,
                    url='https://metadata.provider.plex.tv/library/metadata/matches',
                    params={
                        'X-Plex-Token': matching_token,
                        'type': 1 if media_type is PlexMediaType.movie else 2,
                        'title': f'imdb-{imdb_id}',
                        'guid': f'com.plexapp.agents.imdb://{imdb_id}?lang=en',
                    },
                )
            media_container = json_data.get('MediaContainer', {})
            if media_container.get('totalSize', 0) > 0:
                found_guid = media_container['Metadata'][0]['guid']
                print(f"Found IMDB ID {imdb_id} via metadata provider: {found_guid}")
                return found_guid
        except Exception as e:
            print(f"Error looking up IMDB ID {imdb_id} via Plex metadata provider: {e}")
    
    # Fallback: Search local Plex server directly by checking all sections
    if url:
        try:
            # First try the full GUID format
            imdb_guid_formats = [
                f'com.plexapp.agents.imdb://{imdb_id}?lang=en',
                f'imdb://{imdb_id}',
                f'imdb-{imdb_id}',
            ]
            
            for imdb_guid in imdb_guid_formats:
                print(f"Searching local Plex server for IMDB GUID: {imdb_guid}")
                try:
                    media = await get_media(
                        client=client,
                        url=url,
                        token=token,
                        guid=imdb_guid,
                        get_only_first=True,
                    )
                    if media:
                        print(f"Found media in local server: {media[0].guid}")
                        return media[0].guid
                except Exception:
                    continue
            
            # If direct GUID search fails, search through all sections
            # Get all sections first
            sections_json = await get_json(
                client=client,
                url=url / 'library/sections',
                params={'X-Plex-Token': token},
            )
            sections = sections_json.get('MediaContainer', {}).get('Directory', [])
            
            # Filter to only movie/show sections
            relevant_sections = [
                s for s in sections 
                if s.get('type') in ('movie', 'show') and 
                   (media_type == PlexMediaType.movie and s.get('type') == 'movie' or
                    media_type == PlexMediaType.show and s.get('type') == 'show')
            ]
            
            # Search each section (with pagination to get all items)
            for section in relevant_sections:
                section_id = section['key']
                start = 0
                size = 100  # Request 100 items at a time
                
                while True:
                    section_json = await get_json(
                        client=client,
                        url=url / 'library/sections' / section_id / 'all',
                        params={
                            'X-Plex-Token': token,
                            'includeGuids': 1,
                            'X-Plex-Container-Start': start,
                            'X-Plex-Container-Size': size,
                        },
                    )
                    metadata_list = section_json.get('MediaContainer', {}).get('Metadata', [])
                    
                    if not metadata_list:
                        break  # No more items
                    
                    # Check each item's guids for IMDB match
                    for item in metadata_list:
                        guids = item.get('Guid', [])
                        for guid_obj in guids:
                            guid_id = guid_obj.get('id', '')
                            # Check if this GUID matches our IMDB ID
                            # Plex stores IMDB as: imdb://tt1234567
                            if guid_id == f'imdb://{imdb_id}':
                                # Found it! Return the primary GUID
                                found_guid = item.get('guid', item.get('key', ''))
                                print(f"Found media by searching sections: {found_guid} (matched GUID: {guid_id})")
                                return found_guid
                    
                    # Check if there are more items
                    total_size = section_json.get('MediaContainer', {}).get('totalSize', 0)
                    if start + len(metadata_list) >= total_size:
                        break  # Reached the end
                    start += size
        except Exception as e:
            print(f"Error searching local Plex server for IMDB ID {imdb_id}: {e}")
            import traceback
            traceback.print_exc()
    
    return None


async def get_episode_guid(
    *,
    client: ClientSession,
    url: URL,
    token: str,
    show_guid: str,
    season: str,
    episode: str,
) -> str:
    all_episodes = await get_all_episodes(
        client=client,
        url=url,
        token=token,
        key=show_guid,
    )
    for metadata in all_episodes:
        if str(metadata.parent_index) == season and str(metadata.index) == episode:
            return metadata.guid


async def stremio_to_plex_id(
    *,
    client: ClientSession,
    url: URL,
    token: str,
    cache,
    stremio_id: str,
    media_type: PlexMediaType,
) -> str | None:
    if cached_plex_id := await cache.get(stremio_id):
        return cached_plex_id

    if media_type == PlexMediaType.show:
        id_season_episode = stremio_id.split(':')
        if len(id_season_episode) != 3:
            return None
        imdb_id, season, episode = id_season_episode
    else:
        imdb_id = stremio_id

    plex_id = await imdb_to_plex_id(
        client=client,
        imdb_id=imdb_id,
        media_type=media_type,
        token=token,
        url=url,  # Pass URL for local server fallback
    )
    if not plex_id:
        print(f"Could not find Plex ID for IMDB ID: {imdb_id}")
        return None

    if media_type == PlexMediaType.show:
        media = await get_media(
            client=client,
            url=url,
            token=token,
            guid=plex_id,
        )
        for meta in media:
            plex_id = await get_episode_guid(
                client=client,
                url=url,
                token=token,
                show_guid=meta.key,
                season=season,
                episode=episode,
            )
            if plex_id:
                break
        else:
            return None

    if plex_id:
        await cache.set(stremio_id, plex_id)
    return plex_id
