
import os
import json
from pathlib import Path

from dotenv import load_dotenv
from kafka import KafkaConsumer

# Locate backend folder
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables
load_dotenv(BASE_DIR / ".env")

# Locate CA certificate
CA_PATH = BASE_DIR / os.getenv("KAFKA_CA_PATH", "certs/ca.pem")

# Create Kafka consumer
consumer = KafkaConsumer(
    os.getenv("KAFKA_TOPIC", "order-events"),

    bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS"),

    security_protocol="SASL_SSL",
    sasl_mechanism="SCRAM-SHA-256",

    sasl_plain_username=os.getenv("KAFKA_USERNAME"),
    sasl_plain_password=os.getenv("KAFKA_PASSWORD"),

    ssl_cafile=str(CA_PATH),

    group_id="lumio-order-consumer",

    auto_offset_reset="earliest",

    value_deserializer=lambda value: json.loads(value.decode("utf-8"))
)


def consume_order_events():
    print("Lumio Kafka Consumer started!")
    print("Waiting for order events...")

    try:
        for message in consumer:
            order_data = message.value

            print("\nNew order event received!")
            print(order_data)

    except KeyboardInterrupt:
        print("\nConsumer stopped.")

    finally:
        consumer.close()


if __name__ == "__main__":
    consume_order_events()
