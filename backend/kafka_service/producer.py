
import os
import json
import logging
from pathlib import Path
from threading import Lock

from dotenv import load_dotenv
from kafka import KafkaProducer

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

CA_VALUE = os.getenv("KAFKA_CA_LOCATION", "certs/ca.pem")
CA_PATH = Path(CA_VALUE)

if not CA_PATH.is_absolute():
    CA_PATH = BASE_DIR / CA_PATH

producer = None
producer_lock = Lock()


def get_producer():
    global producer

    if producer is None:
        with producer_lock:
            if producer is None:
                bootstrap_servers = os.getenv(
                    "KAFKA_BOOTSTRAP_SERVERS"
                )

                if not bootstrap_servers:
                    raise ValueError(
                        "KAFKA_BOOTSTRAP_SERVERS is missing"
                    )

                if not CA_PATH.is_file():
                    raise FileNotFoundError(
                        f"Kafka CA certificate not found: {CA_PATH}"
                    )

                producer = KafkaProducer(
                    bootstrap_servers=bootstrap_servers,
                    security_protocol="SASL_SSL",
                    sasl_mechanism="SCRAM-SHA-256",
                    sasl_plain_username=os.getenv("KAFKA_USERNAME"),
                    sasl_plain_password=os.getenv("KAFKA_PASSWORD"),
                    ssl_cafile=str(CA_PATH),
                    value_serializer=lambda value: json.dumps(
                        value
                    ).encode("utf-8"),
                    request_timeout_ms=10000,
                    max_block_ms=3000,
                    api_version_auto_timeout_ms=5000
                )

    return producer


def send_order_event(event):
    try:
        kafka_producer = get_producer()

        kafka_producer.send(
            os.getenv("KAFKA_TOPIC", "order-events"),
            value=event
        )

        logger.info("Order event queued for Kafka")

    except Exception:
        logger.exception("Failed to queue Kafka order event")
        raise
