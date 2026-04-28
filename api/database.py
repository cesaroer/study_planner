from supabase import create_client, Client
from api.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

_supabase_client: Client | None = None


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_client


def get_supabase_anon() -> Client:
    from api.config import SUPABASE_ANON_KEY
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
