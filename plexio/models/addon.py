from pydantic import BaseModel, ConfigDict, Field, field_validator
from yarl import URL

from plexio.models.plex import PlexLibrarySection, Resolution
from plexio.models.utils import to_camel


class AddonConfiguration(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        arbitrary_types_allowed=True,
    )

    access_token: str
    discovery_url: URL
    streaming_url: URL
    server_name: str
    version: str = '0.0.1'
    sections: list[PlexLibrarySection] = Field(default_factory=list)
    include_transcode_original: bool = False
    include_transcode_down: bool = False
    transcode_down_qualities: list[Resolution] = Field(default_factory=list)
    include_plex_tv: bool = False
    custom_name: str | None = None
    stream_name: str | None = None
    show_library_name: bool = False
    catalog_name_movies: str | None = None
    catalog_name_tv_shows: str | None = None

    _extract_discovery_url = field_validator('discovery_url', mode='before')(URL)
    _extract_streaming_url = field_validator('streaming_url', mode='before')(URL)
