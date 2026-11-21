import os
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
from opensearchpy import OpenSearch, helpers
from opensearchpy.exceptions import OpenSearchException

load_dotenv()

DEFAULT_INDEX = os.getenv("OPENSEARCH_INDEX", "lumio_products")

DEFAULT_INDEX_BODY: Dict[str, Any] = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
    },
    "mappings": {
        "properties": {
            "id": {"type": "integer"},
            "name": {"type": "text"},
            "description": {"type": "text"},
            "category": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword"}},
            },
            "brand": {
                "type": "text",
                "fields": {"keyword": {"type": "keyword"}},
            },
            "retailer_id": {"type": "integer"},
            "is_available": {"type": "boolean"},
            "price": {"type": "float"},
            "original_price": {"type": "float"},
            "stock_quantity": {"type": "integer"},
            "image_url": {"type": "keyword", "index": False},
            "created_at": {"type": "date"},
            "updated_at": {"type": "date"},
        }
    },
}


def _resolve_connection_params() -> Optional[Dict[str, Any]]:
    """
    Build connection parameters from OPENSEARCH_URL or
    OPENSEARCH_HOST + OPENSEARCH_PORT + credentials.
    Returns None if OpenSearch is not configured.
    """
    raw_url = (os.getenv("OPENSEARCH_URL") or "").strip()
    host = (os.getenv("OPENSEARCH_HOST") or "").strip()
    raw_port = (os.getenv("OPENSEARCH_PORT") or "").strip()
    user = (os.getenv("OPENSEARCH_USER") or "").strip()
    password = (os.getenv("OPENSEARCH_PASSWORD") or "").strip()

    use_ssl = True
    port: Optional[int] = None

    if raw_url:
        parsed = urlparse(raw_url if "://" in raw_url else f"https://{raw_url}")
        host = parsed.hostname or host
        use_ssl = parsed.scheme != "http"
        if parsed.port:
            port = parsed.port

    if not host:
        return None

    if port is None:
        if raw_port.isdigit():
            port = int(raw_port)
        else:
            port = 443 if use_ssl else 9200

    http_auth = (user, password) if (user and password) else None

    return {
        "hosts": [{"host": host, "port": port}],
        "http_auth": http_auth,
        "use_ssl": use_ssl,
        "verify_certs": use_ssl,
        "ssl_show_warn": False,
    }


@lru_cache(maxsize=1)
def get_opensearch_client() -> Optional[OpenSearch]:
    """Return a cached OpenSearch client, or None if env vars are not set."""
    params = _resolve_connection_params()
    if not params:
        return None
    return OpenSearch(**params)


def is_opensearch_healthy() -> bool:
    """Ping OpenSearch to verify connectivity without raising on failure."""
    client = get_opensearch_client()
    if not client:
        return False
    try:
        return bool(client.ping())
    except OpenSearchException:
        return False


def ensure_products_index(index: str = DEFAULT_INDEX) -> bool:
    """Create the OpenSearch index if it does not already exist."""
    client = get_opensearch_client()
    if not client:
        print("OpenSearch client is None (check OPENSEARCH_URL / OPENSEARCH_HOST in .env)")
        return False

    try:
        exists = client.indices.exists(index=index)
        if not exists:
            client.indices.create(index=index, body=DEFAULT_INDEX_BODY)
            print(f"Created OpenSearch index '{index}'")
        return True
    except OpenSearchException as exc:
        print(f"OpenSearch ensure index error for '{index}': {exc}")
        return False


def build_product_query(
    query: Optional[str] = None,
    category: Optional[str] = None,
    brand: Optional[str] = None,
    retailer_id: Optional[int] = None,
    is_available: Optional[bool] = None,
    size: int = 50,
) -> Dict[str, Any]:
    """Build an OpenSearch query matching your product filters."""
    must: List[Dict[str, Any]] = []
    filters: List[Dict[str, Any]] = []

    if query and query.strip():
        must.append(
            {
                "multi_match": {
                    "query": query.strip(),
                    "fields": ["name^3", "brand^2", "category^2", "description"],
                    "fuzziness": "AUTO",
                }
            }
        )
    else:
        must.append({"match_all": {}})

    if category:
        filters.append({"match": {"category": category}})

    if brand:
        filters.append({"match": {"brand": brand}})

    if retailer_id is not None:
        filters.append({"term": {"retailer_id": retailer_id}})

    if is_available is not None:
        filters.append({"term": {"is_available": is_available}})

    return {
        "size": size,
        "query": {
            "bool": {
                "must": must,
                "filter": filters,
            }
        },
    }


def search_products_opensearch(
    query: Optional[str] = None,
    category: Optional[str] = None,
    brand: Optional[str] = None,
    retailer_id: Optional[int] = None,
    is_available: Optional[bool] = None,
    size: int = 50,
    index: str = DEFAULT_INDEX,
) -> Optional[List[Dict[str, Any]]]:
    """
    Execute a product search against OpenSearch.
    Returns a list of product dicts on success, or None if unavailable/failed
    so callers can fall back cleanly to PostgreSQL.
    """
    client = get_opensearch_client()
    if not client:
        return None

    body = build_product_query(
        query=query,
        category=category,
        brand=brand,
        retailer_id=retailer_id,
        is_available=is_available,
        size=size,
    )

    try:
        response = client.search(index=index, body=body)
        hits = response.get("hits", {}).get("hits", [])
        results: List[Dict[str, Any]] = []
        for hit in hits:
            source = dict(hit.get("_source") or {})
            if "id" not in source and hit.get("_id") is not None:
                try:
                    source["id"] = int(hit["_id"])
                except ValueError:
                    source["id"] = hit["_id"]
            results.append(source)
        return results
    except OpenSearchException as exc:
        print(f"OpenSearch query error, falling back to DB: {exc}")
        return None


def index_product_document(product_data: Dict[str, Any], index: str = DEFAULT_INDEX) -> bool:
    """Index or update a single product document by ID."""
    client = get_opensearch_client()
    if not client:
        return False

    doc_id = product_data.get("id")
    if doc_id is None:
        return False

    try:
        ensure_products_index(index=index)
        client.index(index=index, id=str(doc_id), body=product_data, refresh=True)
        return True
    except OpenSearchException as exc:
        print(f"OpenSearch index error for product {doc_id}: {exc}")
        return False


def bulk_index_products(
    products_data: Iterable[Dict[str, Any]], index: str = DEFAULT_INDEX
) -> int:
    """Bulk index multiple product documents; returns count of indexed items."""
    client = get_opensearch_client()
    if not client:
        return 0

    docs = [dict(p) for p in products_data if p.get("id") is not None]
    if not docs:
        return 0

    try:
        if not ensure_products_index(index=index):
            return 0
        actions = [
            {
                "_index": index,
                "_id": str(doc["id"]),
                "_source": doc,
            }
            for doc in docs
        ]
        success_count, errors = helpers.bulk(
            client, actions, refresh=True, raise_on_error=False
        )
        if errors:
            print(f"OpenSearch bulk errors ({len(errors)}): {errors[:2]}")
        return int(success_count)
    except OpenSearchException as exc:
        print(f"OpenSearch bulk index error: {exc}")
        return 0


def delete_product_document(product_id: int, index: str = DEFAULT_INDEX) -> bool:
    """Delete a product document from OpenSearch by ID."""
    client = get_opensearch_client()
    if not client:
        return False

    try:
        if not client.indices.exists(index=index):
            return True
        client.delete(index=index, id=str(product_id), ignore=[404], refresh=True)
        return True
    except OpenSearchException as exc:
        print(f"OpenSearch delete error for product {product_id}: {exc}")
        return False