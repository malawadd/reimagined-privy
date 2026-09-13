"""Small synchronous Ratib v1 client generated from ratib-v1.openapi.yaml."""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode_b64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


@dataclass
class RatibApiError(Exception):
    status: int
    code: str
    request_id: str
    message: str

    def __str__(self) -> str:
        return f"{self.code}: {self.message} ({self.request_id})"


class RatibClient:
    def __init__(self, base_url: str, key_id: str, private_jwk: dict[str, Any]):
        self.base_url = base_url.rstrip("/")
        self.key_id = key_id
        if private_jwk.get("kty") != "EC" or private_jwk.get("crv") != "P-256":
            raise ValueError("A P-256 private JWK is required")
        private_value = int.from_bytes(_decode_b64url(private_jwk["d"]), "big")
        self.private_key = ec.derive_private_key(private_value, ec.SECP256R1())

    def organization(self) -> Any:
        return self._request("/organization")

    def wallets(self) -> Any:
        return self._request("/wallets")

    def operations(self) -> Any:
        return self._request("/operations")

    def operation(self, operation_id: str) -> Any:
        return self._request(f"/operations/{urllib.parse.quote(operation_id, safe='')}")

    def invoices(self) -> Any:
        return self._request("/invoices")

    def batches(self) -> Any:
        return self._request("/batches")

    def payroll(self) -> Any:
        return self._request("/payroll")

    def payouts(self) -> Any:
        return self._request("/payouts")

    def finance_report(self) -> Any:
        return self._request("/reports/finance")

    def audit_events(self) -> Any:
        return self._request("/audit-events")

    def webhook_endpoints(self) -> Any:
        return self._request("/webhook-endpoints")

    def webhook_deliveries(self) -> Any:
        return self._request("/webhook-deliveries")

    def create_payment(self, payment: dict[str, Any], idempotency_key: str) -> Any:
        return self._request("/payments", "POST", payment, idempotency_key)

    def create_webhook_endpoint(
        self, endpoint: dict[str, Any], idempotency_key: str
    ) -> Any:
        return self._request("/webhook-endpoints", "POST", endpoint, idempotency_key)

    def replay_webhook_delivery(self, delivery_id: str, idempotency_key: str) -> Any:
        encoded = urllib.parse.quote(delivery_id, safe="")
        return self._request(
            f"/webhook-deliveries/{encoded}/replay", "POST", {}, idempotency_key
        )

    def _request(
        self,
        path: str,
        method: str = "GET",
        payload: Any | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        body = b"" if payload is None else json.dumps(payload, separators=(",", ":")).encode()
        timestamp = str(int(time.time() * 1000))
        nonce = _b64url(secrets.token_bytes(18))
        digest = _b64url(hashlib.sha256(body).digest())
        target = f"/v1{path}"
        canonical = "\n".join(
            (
                f"method:{method}",
                f"target:{target}",
                f"content-digest:{digest}",
                f"timestamp:{timestamp}",
                f"nonce:{nonce}",
                f"credential:{self.key_id}",
                f"idempotency-key:{idempotency_key or ''}",
            )
        ).encode()
        der_signature = self.private_key.sign(canonical, ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(der_signature)
        signature = _b64url(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
        headers = {
            "X-Ratib-Key-Id": self.key_id,
            "X-Ratib-Timestamp": timestamp,
            "X-Ratib-Nonce": nonce,
            "X-Ratib-Content-SHA256": digest,
            "X-Ratib-Signature": signature,
        }
        if body:
            headers["Content-Type"] = "application/json"
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        request = urllib.request.Request(
            f"{self.base_url}{target}", data=body or None, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.loads(response.read())
        except urllib.error.HTTPError as error:
            problem = json.loads(error.read())
            raise RatibApiError(
                error.code,
                problem.get("code", "request_failed"),
                problem.get("requestId", error.headers.get("X-Request-Id", "")),
                problem.get("message", "Ratib API request failed."),
            ) from error
        return result.get("data", result)
