
from kafka_service.producer import send_order_event
from kafka_service import producer

test_order = {
    "event": "order_created",
    "order_id": 1001,
    "user_id": 101,
    "total_amount": 1499.00,
    "status": "placed"
}

try:
    send_order_event(test_order)
    print("SUCCESS: Order event sent to Kafka!")

except Exception as e:
    print("FAILED:", str(e))

finally:
    producer.producer.close()
