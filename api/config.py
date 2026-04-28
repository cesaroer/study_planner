import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_JWKS_URL = os.environ.get(
    "SUPABASE_JWKS_URL",
    f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json",
)
SUPABASE_JWT_ISSUER = os.environ.get(
    "SUPABASE_JWT_ISSUER",
    f"{SUPABASE_URL}/auth/v1",
)
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
