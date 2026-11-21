
import os
import json
from pathlib import Path

from dotenv import load_dotenv
from kafka import KafkaProducer

# Locate backend folder
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables
load_dotenv(BASE_DIR / ".env")

# Locate CA certificate
CA_PATH = BASE_DIR / os.getenv("KAFKA_CA_PATH", "certs/ca.pem")

# Create Kafka producer
producer = KafkaProducer(
    bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS"),
    security_protocol="SASL_SSL",

    # Confirm this mechanism in Aiven
    sasl_mechanism="SCRAM-SHA-256",

    sasl_plain_username=os.getenv("KAFKA_USERNAME"),
    sasl_plain_password=os.getenv("KAFKA_PASSWORD"),

    ssl_cafile=str(CA_PATH),

    value_serializer=lambda value: json.dumps(value).encode("utf-8")
)

def send_order_event(order_data):
    producer.send(
        os.getenv("KAFKA_TOPIC", "order-events"),
        value=order_data
    )
    producer.flush()
