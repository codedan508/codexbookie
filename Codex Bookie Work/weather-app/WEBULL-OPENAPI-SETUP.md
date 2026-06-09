# Webull OpenAPI Setup

Webull's official flow is not just "paste a key". It requires their approved OpenAPI account flow.

1. Log in to Webull's official website.
2. Apply for API access under API Management / My Application.
3. Wait for Webull approval. Their docs say this can take 1-2 business days.
4. After approval, register an application under API Management / Application Management.
5. Click Generate Key.
6. Complete Webull's SMS verification and trading-password/MFA step.
7. Paste the generated values into:

`credentials/WEBULL_OPENAPI.env`

Required values:

```env
WEBULL_APP_KEY=
WEBULL_APP_SECRET=
WEBULL_REGION_ID=us
WEBULL_API_ENDPOINT=
```

Then run:

```bash
.venv/bin/python tools/webull_openapi_check.py
```

If it returns the account list with HTTP status 200, Webull OpenAPI access is working.

Webull says App Secret validity defaults to 1 day and can be extended only up to the limit they allow in the key screen.
