import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import aiohttp
import sentry_sdk
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request as StarletteRequest

from plexio.cache import init_cache
from plexio.routers.addon import router as addon_router
from plexio.routers.configuration import router as configuration_router
from plexio.settings import settings


def before_send(event, hint):
    if 'exc_info' in hint:
        exc_type, exc_value, tb = hint['exc_info']
        if isinstance(exc_value, HTTPException) and exc_value.status_code in (502, 504):
            return None
    return event


sentry_sdk.init(before_send=before_send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    plex_client = aiohttp.ClientSession(
        headers={'accept': 'application/json'},
    )
    cache = init_cache(settings)

    yield {
        'plex_client': plex_client,
        'cache': cache,
    }

    await plex_client.close()
    await cache.close()


app = FastAPI(
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# Add logging middleware to debug routing
@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f'[REQUEST] {request.method} {request.url.path}')
    if request.url.query:
        print(f'[REQUEST] Query params: {request.url.query}')
    response = await call_next(request)
    print(f'[REQUEST] Response: {response.status_code}')
    return response

app.include_router(addon_router)
app.include_router(configuration_router)

# Serve static files in production (for Electron app)
if os.getenv('SERVE_STATIC', '').lower() == 'true':
    # In Electron, backend executable is at Resources/backend/backend
    # Frontend dist is at Resources/frontend/dist
    # Try multiple possible locations
    possible_paths = [
        # If running from PyInstaller bundle, backend is at Resources/backend/backend
        # So frontend is at Resources/frontend/dist (sibling directory)
        os.path.join(os.path.dirname(sys.executable), '..', 'frontend', 'dist'),
        # Alternative: if Resources path is passed via env var
        os.path.join(os.getenv('RESOURCES_PATH', ''), 'frontend', 'dist') if os.getenv('RESOURCES_PATH') else None,
        # If running from source
        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'dist'),
        # Alternative: relative to current working directory
        os.path.join(os.getcwd(), 'frontend', 'dist'),
    ]
    
    # Filter out None values
    possible_paths = [p for p in possible_paths if p is not None]
    
    frontend_dist = None
    for path in possible_paths:
        abs_path = os.path.abspath(path)
        print(f'Checking for frontend at: {abs_path}')
        if os.path.exists(abs_path):
            frontend_dist = abs_path
            print(f'Found frontend dist at: {frontend_dist}')
            break
    
    if frontend_dist:
        print(f'Serving static files from: {frontend_dist}')
        index_path = Path(frontend_dist) / 'index.html'
        
        # Mount static files for assets (JS, CSS, etc.)
        assets_path = Path(frontend_dist) / 'assets'
        if assets_path.exists():
            app.mount('/assets', StaticFiles(directory=str(assets_path)), name='assets')
        
        # Serve favicon
        @app.get('/favicon.ico')
        async def favicon():
            favicon_path = Path(frontend_dist) / 'favicon.ico'
            if favicon_path.exists():
                return FileResponse(str(favicon_path))
            raise HTTPException(status_code=404)
        
        # Serve root path
        @app.get('/')
        async def serve_root():
            if index_path.exists():
                return FileResponse(str(index_path))
            raise HTTPException(status_code=404, detail='index.html not found')
        
        # Catch-all for SPA routes - must be registered LAST
        # FastAPI checks routes in order, so API routes (registered above) will be checked first
        @app.get('/{full_path:path}')
        async def serve_spa(request: Request, full_path: str):
            print(f'[CATCH-ALL] Matched path: {full_path}')
            # FastAPI should have checked API routes first, but if we're here for an API route,
            # it means the route doesn't exist or parameters are invalid
            if full_path.startswith('api/'):
                print(f'[CATCH-ALL] Rejecting API route: {full_path}')
                raise HTTPException(status_code=404, detail='Not Found')
            
            # Check if it's a static file (has file extension)
            if full_path and '.' in full_path.split('/')[-1]:
                file_path = Path(frontend_dist) / full_path
                if file_path.exists() and file_path.is_file():
                    return FileResponse(str(file_path))
            
            # Serve index.html for all SPA routes
            if index_path.exists():
                return FileResponse(str(index_path))
            raise HTTPException(status_code=404, detail='index.html not found')
    else:
        print(f'ERROR: Frontend dist not found. Tried: {possible_paths}')
        print(f'Current working directory: {os.getcwd()}')
        print(f'sys.executable: {sys.executable}')
        print(f'__file__: {__file__}')

# Allow running with uvicorn directly when bundled
if __name__ == '__main__':
    import uvicorn
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', '8000'))
    uvicorn.run(app, host=host, port=port)