def sb_single(query_builder):
    """Execute a query and return the first row or None.
    Safe replacement for maybe_single().execute() which can return None in
    supabase-py v2 when no rows are found, causing AttributeError on .data access.
    """
    resp = query_builder.limit(1).execute()
    if resp and resp.data:
        return resp.data[0]
    return None
