"""
Concurrency check for guest checkout against a running Cartix API.

1. Ten customers each add one unit of the same variant to their own cart, then all ten check out
   at the same moment. Only as many orders as there are units in stock may succeed.
2. One cart is submitted six times at the same moment with the same Idempotency-Key.
   Exactly one order must be created; every response must carry the same order number.

Use a test database, not production: this script places real orders.
The checkout rate limit must allow the burst, for example CARTIX_RATE_LIMIT_CHECKOUT=1000,
and the server must handle parallel requests (PHP_CLI_SERVER_WORKERS=8 php artisan serve).

Usage: python3 scripts/concurrency_check.py <race_variant_id> <duplicate_variant_id> [api_base]
  race_variant_id       a variant with fewer than 10 units in stock (part 1)
  duplicate_variant_id  another variant with at least 1 unit in stock (part 2)
"""
import json
import sys
import threading
import urllib.error
import urllib.request

RACE_VARIANT = int(sys.argv[1])
DUP_VARIANT = int(sys.argv[2])
BASE = sys.argv[3] if len(sys.argv) > 3 else "http://127.0.0.1:8000/api/v1"


def call(method, path, body=None, headers=None):
    h = {"Accept": "application/json", "Content-Type": "application/json", **(headers or {})}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def run_parallel(fn, n):
    results = [None] * n
    threads = [threading.Thread(target=lambda i=i: results.__setitem__(i, fn(i))) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


divisions = call("GET", "/locations/divisions")[1]["data"]
dhaka = next(d["id"] for v in divisions for d in v["districts"] if d["name"] == "Dhaka")


def body(i):
    return {"customer_name": f"Buyer {i}", "customer_phone": "0171234%04d" % i, "district_id": dhaka,
            "area_name": "Mirpur", "address_line": "House 1, Road 2", "payment_method": "cod", "accept_terms": True}


def add_one(variant):
    status, data = call("POST", "/cart/items", {"variant_id": variant, "quantity": 1})
    if status != 201:
        sys.exit(f"Could not add the variant to a cart: {status} {data.get('message')}")
    return data["cart_token"]


tokens = [add_one(RACE_VARIANT) for _ in range(10)]
results = run_parallel(lambda i: call("POST", "/checkout", body(i), {"X-Cart-Token": tokens[i], "Idempotency-Key": "race-key-%012d" % i}), 10)
codes = [r[0] for r in results]
print("10 parallel checkouts ->", {c: codes.count(c) for c in sorted(set(codes))})
print("refusal messages:", sorted({r[1].get("message", "") for r in results if r[0] != 201}))

token = add_one(DUP_VARIANT)
dup = run_parallel(lambda i: call("POST", "/checkout", body(99), {"X-Cart-Token": token, "Idempotency-Key": "double-click-key-0001"}), 6)
numbers = {r[1]["data"]["order_number"] for r in dup if "data" in r[1]}
print("6 identical submissions ->", [r[0] for r in dup], "distinct orders:", numbers)
