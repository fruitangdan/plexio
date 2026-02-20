import os
import re
from datetime import datetime
from enum import Enum
from urllib.parse import quote, urlencode

from pydantic import BaseModel, ConfigDict, Field
from yarl import URL

from plexio.models.utils import get_flag_emoji, guid_to_plexio_id, to_camel


class Resolution(str, Enum):
    R480 = '480p'
    R720 = '720p'
    R1080 = '1080p'


RESOLUTION_QUALITY_PARAMS = {
    Resolution.R1080: {
        'name': '1080p',
        'min_width': 1920,
        'plex_args': {
            'videoQuality': 100,
            'maxVideoBitrate': 10,
            'videoResolution': '1920x1080',
        },
    },
    Resolution.R720: {
        'name': '720p',
        'min_width': 1280,
        'plex_args': {
            'videoQuality': 100,
            'maxVideoBitrate': 6.5,
            'videoResolution': '1280x720',
        },
    },
    Resolution.R480: {
        'name': '480p',
        'min_width': 640,
        'plex_args': {
            'videoQuality': 100,
            'maxVideoBitrate': 3.5,
            'videoResolution': '640×480',
        },
    },
}


class PlexMediaType(str, Enum):
    show = 'show'
    movie = 'movie'
    episode = 'episode'


class PlexLibrarySection(BaseModel):
    key: str
    title: str
    type: PlexMediaType


class PlexMediaMeta(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel)

    guid: str
    type: PlexMediaType
    title: str
    added_at: int = 0

    rating_key: str | None = None
    key: str | None = None
    studio: str | None = None
    title_sort: str | None = None
    library_section_title: str | None = None
    library_sectionID: str | None = None
    library_section_key: str | None = None
    content_rating: str | None = None
    summary: str = ''
    rating: float | None = None
    audience_rating: float | None = None
    year: int | None = None
    tagline: str | None = None
    thumb: str | None = None
    art: str | None = None
    duration: int | None = None
    originally_available_at: str | None = None
    updated_at: int | None = None
    audience_rating_image: str | None = None
    has_premium_primary_extra: str | None = None
    rating_image: str | None = None
    media: list = Field(alias='Media', default_factory=list)
    genre: list = Field(alias='Genre', default_factory=list)
    country: list = Field(alias='Country', default_factory=list)
    guids: list = Field(alias='Guid', default_factory=list)
    ratings: list = Field(alias='Ratings', default_factory=list)
    director: list = Field(alias='Director', default_factory=list)
    writer: list = Field(alias='Writer', default_factory=list)
    role: list = Field(alias='Role', default_factory=list)
    producer: list = Field(alias='Producer', default_factory=list)
    # Episode-specific fields
    grandparent_title: str | None = None
    parent_title: str | None = None
    index: int | None = None
    parent_index: int | None = None

    def get_year(self):
        if self.year:
            return str(self.year)
        return datetime.fromtimestamp(self.added_at).strftime('%Y')

    def to_stremio_meta(self, configuration):
        from plexio.models import PLEX_TO_STREMIO_MEDIA_TYPE
        from plexio.models.stremio import StremioMeta

        return StremioMeta(
            id=guid_to_plexio_id(self.guid),
            type=PLEX_TO_STREMIO_MEDIA_TYPE[self.type],
            name=self.title,
            releaseInfo=self.get_year(),
            imdbRating=self.audience_rating,
            description=self.summary,
            poster=str(
                configuration.streaming_url
                / self.thumb[1:]
                % {'X-Plex-Token': configuration.access_token},
            )
            if self.thumb
            else None,
            background=str(
                configuration.streaming_url
                / (self.art or self.thumb)[1:]
                % {'X-Plex-Token': configuration.access_token},
            )
            if (self.art or self.thumb)
            else None,
            genres=[g['tag'] for g in self.genre],
        )

    def to_stremio_meta_review(self, configuration):
        from plexio.models import PLEX_TO_STREMIO_MEDIA_TYPE
        from plexio.models.stremio import StremioMetaPreview

        stremio_id = None
        guids = self.guids
        for guid in guids:
            if guid['id'].startswith('imdb://'):
                stremio_id = guid['id'][7:]

        if not stremio_id:
            if '://' in self.guid:
                stremio_id = guid_to_plexio_id(self.guid)
            else:
                stremio_id = self.guid

        return StremioMetaPreview(
            id=stremio_id,
            name=self.title,
            releaseInfo=str(self.year),
            poster=str(
                configuration.streaming_url
                / self.thumb[1:]
                % {'X-Plex-Token': configuration.access_token},
            )
            if self.thumb
            else None,
            type=PLEX_TO_STREMIO_MEDIA_TYPE[self.type],
            imdbRating=self.audience_rating,
            description=self.summary,
            genres=[g['tag'] for g in self.genre],
        )

    def get_stremio_streams(
        self,
        configuration,
        public_base_url: str | None = None,
        proxy_prefix: str = '',
    ):
        from plexio.models.stremio import StremioStream

        def _stream_url(plex_url: URL) -> str:
            """Return public proxy URL or direct Plex URL."""
            if not public_base_url or not proxy_prefix:
                return str(plex_url)
            qdict = dict(plex_url.query)
            qdict.pop('X-Plex-Token', None)
            relative = plex_url.path + ('?' + urlencode(qdict) if qdict else '')
            return public_base_url + proxy_prefix + '?q=' + quote(relative)

        streams = []
        for i, media in enumerate(self.media):
            # Extract resolution and format as "1080p"
            video_resolution = media.get("videoResolution", "")
            resolution_display = ""
            if video_resolution:
                # videoResolution might be "1080", "1920x1080", or similar
                # Extract the height (last number)
                numbers = re.findall(r'\d+', video_resolution)
                if numbers:
                    height = numbers[-1]  # Get the last number (height)
                    resolution_display = f"{height}p"
            
            # Determine stream name based on configuration
            if configuration.stream_name:
                if configuration.show_library_name:
                    # Show library name on a new line below stream name with parentheses
                    if resolution_display:
                        name = f'{configuration.stream_name}\n({self.library_section_title})\n{resolution_display}'
                    else:
                        name = f'{configuration.stream_name}\n({self.library_section_title})'
                else:
                    # Just use the custom stream name with resolution
                    if resolution_display:
                        name = f'{configuration.stream_name}\n{resolution_display}'
                    else:
                        name = configuration.stream_name
            else:
                # Default: use server name and library section title with resolution
                if resolution_display:
                    name = f'{configuration.server_name} {self.library_section_title}\n{resolution_display}'
                else:
                    name = f'{configuration.server_name} {self.library_section_title}'
            
            filename = os.path.basename(media['Part'][0]['file'])
            file_size_bytes = media['Part'][0].get('size')

            # Format file size to human-readable format
            def format_file_size(size_bytes):
                """Convert bytes to human-readable format"""
                if not size_bytes:
                    return None
                size = float(size_bytes)
                for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
                    if size < 1024.0:
                        if unit == 'B':
                            return f"{int(size)} {unit}"
                        return f"{size:.0f} {unit}"
                    size /= 1024.0
                return f"{size:.0f} PB"
            
            file_size_display = format_file_size(file_size_bytes)

            audio_languages = set()
            subtitles_languages = set()
            external_subtitles = []
            for part_stream in media['Part'][0].get('Stream', []):
                if part_stream['streamType'] == 2:
                    audio_languages.add(
                        get_flag_emoji(part_stream.get('languageTag', 'Unknown')),
                    )
                elif part_stream['streamType'] == 3:
                    subtitles_languages.add(
                        get_flag_emoji(part_stream.get('languageTag', 'Unknown')),
                    )
                    if 'key' in part_stream:
                        sub_url = (
                            configuration.streaming_url
                            / part_stream['key'][1:]
                            % {'X-Plex-Token': configuration.access_token}
                        )
                        external_subtitles.append(
                            {
                                'id': str(part_stream['id']),
                                'lang': part_stream['displayTitle'],
                                'url': _stream_url(sub_url),
                            }
                        )

            # Format description based on media type
            # Filter out 'Unknown' from subtitles languages
            filtered_subtitles = {lang for lang in subtitles_languages if lang != 'Unknown'}
            
            # Format languages on one line with emojis and bullet separator
            # For subtitles: only show English if available, otherwise show nothing
            languages_parts = []
            if audio_languages:
                languages_parts.append(f'🎧 {" ".join(sorted(audio_languages))}')
            # Check if English (🇬🇧) is in subtitles
            if '🇬🇧' in filtered_subtitles:
                languages_parts.append('💬 🇬🇧')
            languages = '  ∙  '.join(languages_parts) if languages_parts else ''
            
            if self.type == PlexMediaType.episode and self.grandparent_title:
                # For episodes: "Series Name\nEpisode Title\n💾 200 MB\n[languages]"
                description = f'{self.grandparent_title}\n{self.title}'
                if file_size_display:
                    description += f'\n💾 {file_size_display}'
                if languages:
                    description += f'\n{languages}'
            elif self.type == PlexMediaType.movie:
                # For movies: "Movie Title\n💾 200 MB\n[languages]"
                description = self.title
                if file_size_display:
                    description += f'\n💾 {file_size_display}'
                if languages:
                    description += f'\n{languages}'
            else:
                # Fallback: show filename, file size, and languages
                description = filename
                if file_size_display:
                    description += f'\n💾 {file_size_display}'
                if languages:
                    description += f'\n{languages}'

            quality_description = f'Direct Play {media.get("videoResolution", "")}'
            direct_url = (
                configuration.streaming_url
                / media['Part'][0]['key'][1:]
                % {'X-Plex-Token': configuration.access_token}
            )
            streams.append(
                StremioStream(
                    name=name,
                    description=description,
                    url=_stream_url(direct_url),
                    subtitles=external_subtitles,
                    behaviorHints={'bingeGroup': quality_description},
                ),
            )

            transcode_url = (
                configuration.streaming_url
                / 'video/:/transcode/universal/start.m3u8'
                % {
                    'path': self.key,
                    'mediaIndex': i,
                    'protocol': 'hls',
                    'fastSeek': 1,
                    'copyts': 1,
                    'autoAdjustQuality': 0,
                    'X-Plex-Platform': 'Chrome',
                    'X-Plex-Token': configuration.access_token,
                }
            )
            if configuration.include_transcode_original:
                quality_description = (
                    f'Transcode {media.get("videoResolution", "")} (original)'
                )
                streams.append(
                    StremioStream(
                        name=name,
                        description=description,
                        url=_stream_url(transcode_url % {'videoQuality': 100}),
                        subtitles=external_subtitles,
                        behaviorHints={'bingeGroup': quality_description},
                    ),
                )

            if configuration.include_transcode_down:
                for quality in configuration.transcode_down_qualities:
                    quality_params = RESOLUTION_QUALITY_PARAMS[quality]
                    if media['width'] <= quality_params['min_width']:
                        continue
                    quality_description = f'Transcode {quality_params["name"]}'
                    streams.append(
                        StremioStream(
                            name=name,
                            description=description,
                            url=_stream_url(transcode_url % quality_params['plex_args']),
                            subtitles=external_subtitles,
                            behaviorHints={'bingeGroup': quality_description},
                        ),
                    )

            if configuration.include_plex_tv and self.guid.startswith('plex:'):
                streams.append(
                    StremioStream(
                        name=name,
                        description='Open on plex.tv (external)',
                        externalUrl=f'https://app.plex.tv/#!/provider/tv.plex.provider.metadata/details?key=/library/metadata/{self.guid.split("/")[-1]}',
                    ),
                )

        return streams


class PlexEpisodeMeta(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel)

    guid: str
    title: str
    index: int
    parent_index: int = 0
    added_at: int = 0

    type: str | None = None
    rating_key: str | None = None
    key: str | None = None
    parent_rating_key: str | None = None
    grandparent_rating_key: str | None = None
    studio: str | None = None
    grandparent_key: str | None = None
    parent_key: str | None = None
    grandparent_title: str | None = None
    parent_title: str | None = None
    content_rating: str | None = None
    summary: str = ''
    year: int | None = None
    thumb: str | None = None
    art: str | None = None
    parent_thumb: str | None = None
    grandparent_thumb: str | None = None
    grandparent_art: str | None = None
    grandparent_theme: str | None = None
    duration: int | None = None
    originally_available_at: str | None = None
    updated_at: int | None = None
    media: list = Field(default_factory=list)

    def to_stremio_video_meta(self, configuration):
        from plexio.models.stremio import StremioVideoMeta

        if self.originally_available_at:
            released = f'{self.originally_available_at}T00:00:00.000Z'
        else:
            released = datetime.fromtimestamp(self.added_at).strftime(
                '%Y-%m-%dT%H:%M:%S.%fZ',
            )

        return StremioVideoMeta(
            id=guid_to_plexio_id(self.guid),
            title=self.title,
            released=released,
            thumbnail=str(
                configuration.streaming_url
                / self.thumb[1:]
                % {'X-Plex-Token': configuration.access_token},
            )
            if self.thumb
            else None,
            episode=self.index,
            season=self.parent_index,
            overview=self.summary,
        )
