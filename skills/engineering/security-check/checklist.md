# Security checklist

Where vulnerabilities hide, ordered by severity. For each one: what to look for, a grep to find the candidates, and the harmless test that verifies it. A grep hit is a candidate, not a finding: follow the data from the untrusted input to the sink before reporting it.

Untrusted input is anything an attacker can influence: request parameters, body, headers and cookies, uploaded files and their names, webhook payloads, data from third-party APIs, and data that other users stored in the database.

## Critical: injection

| Vulnerability | What to look for | Grep | Harmless test |
|---|---|---|---|
| Command injection (CWE-78) | Untrusted input in a shell command, especially through string building or `shell=True` | `exec\|spawn\|system\|popen\|shell=True\|subprocess\|child_process\|Runtime.getRuntime\|backtick` | Input with `;`, `$( )` or a backtick runs nothing extra: the argument reaches the command as one literal value |
| Code injection (CWE-94) | Untrusted input in `eval`, `Function()`, `exec()`, `instance_eval`, `send`/`public_send` with a user-chosen method | `eval(\|new Function\|exec(\|instance_eval\|class_eval\|public_send\|\.send(` | A user-chosen method or expression name is rejected, not executed |
| SQL injection (CWE-89) | Queries built with concatenation or interpolation; raw query APIs; user-chosen column names in `ORDER BY` | `query(.*\+\|execute(.*f"\|execute(.*%\|raw(\|\.where(".*#{\|whereRaw\|sequelize.query\|\$queryRawUnsafe\|order(.*params` | A quote in the input doesn't break the query; an unknown sort column is rejected |
| NoSQL injection (CWE-943) | Request objects passed straight into query filters (`{ $ne: null }`, `$where`) | `find(req\.\|findOne(req\.\|\$where` | An object where a string is expected is rejected or cast, and doesn't match every record |
| Path traversal (CWE-22) | Untrusted input joined into a file path for read, write, delete or upload | `readFile\|writeFile\|createReadStream\|sendFile\|open(\|path.join\|os.path.join\|File.read\|send_file\|unlink` | A `../` path or an absolute path is rejected; the resolved path stays inside the base directory |
| Template injection (CWE-1336) | Untrusted input used as a template rather than as data passed to it | `render_template_string\|Template(\|compile(\|ERB.new\|Handlebars.compile\|ejs.render` | Template syntax in the input comes back as text, not evaluated |
| Unsafe deserialization (CWE-502) | Untrusted bytes into `pickle`, `yaml.load`, `Marshal.load`, `unserialize`, Java serialization | `pickle.load\|yaml.load(\|Marshal.load\|unserialize(\|ObjectInputStream` | The safe loader is used: an untrusted payload with a type tag is rejected |
| SSRF (CWE-918) | The server fetches a URL or host the user controls (webhooks, image import, link previews) | `fetch(\|axios\|requests.get\|urlopen\|Net::HTTP\|http.Get\|curl` | An internal address (`127.0.0.1`, `169.254.169.254`, `localhost`, private ranges) is rejected before the request |
| XXE (CWE-611) | XML parsed with external entities enabled | `DocumentBuilder\|XMLReader\|etree.parse\|libxml\|Nokogiri::XML\|DOMParser` | A document declaring an external entity is rejected or the entity isn't expanded |

## High: authentication and authorization

| Vulnerability | What to look for | Grep | Harmless test |
|---|---|---|---|
| Missing authentication (CWE-306) | Routes or handlers outside the auth middleware; new routes added after the middleware list | Route definitions, `skip_before_action\|AllowAnonymous\|permitAll\|public` | An unauthenticated request gets a 401 |
| IDOR / missing ownership check (CWE-639) | Records loaded by an id from the request without scoping to the current user or tenant | `findById(req\|find(params\[:id\]\|get_object_or_404\|findUnique({ where: { id` | User A requesting user B's record gets a 403 or 404 |
| Privilege escalation (CWE-269) | Role checks only in the UI; mass assignment of `role`, `isAdmin`, `ownerId`, `tenantId` | `permit(\|\.update(req.body\|Object.assign(.*req.body\|\*\*request` | A regular user setting `role: admin` in the body doesn't change their role |
| Weak session or token handling (CWE-384, CWE-613) | Session not rotated on login; tokens that never expire; JWT with `alg: none` accepted or unverified signature; reset tokens reusable | `jwt.decode\|verify: false\|algorithms\|expiresIn\|session` | An expired or reused token is rejected; a JWT with a wrong signature is rejected |
| Missing rate limiting (CWE-307) | Login, password reset, OTP and sign-up without attempt limits | Auth route handlers | The N+1th attempt in the window is refused |
| CSRF (CWE-352) | Cookie-authenticated state-changing endpoints without CSRF token or `SameSite` | `csrf\|SameSite\|protect_from_forgery\|csrf_exempt` | A state-changing request without the token is refused |

## High: secrets and crypto

| Vulnerability | What to look for | Grep | Harmless test |
|---|---|---|---|
| Hardcoded secrets (CWE-798) | API keys, passwords, private keys, signing secrets in code or committed config | `password\s*=\|secret\|api_key\|apikey\|token\s*=\|BEGIN.*PRIVATE KEY\|AKIA` | The value is read from configuration; no test needed, verify by reading |
| Weak password hashing (CWE-916) | Passwords hashed with MD5, SHA-1, SHA-256 without a slow KDF | `md5\|sha1\|sha256\|createHash` near `password` | Stored hashes use bcrypt, scrypt or argon2 |
| Insecure randomness (CWE-338) | `Math.random`, `rand`, `random.random` for tokens, ids or codes | `Math.random\|random.random\|rand(\|mt_rand` | Tokens come from the crypto RNG (`crypto.randomBytes`, `secrets`, `SecureRandom`) |
| Timing attacks (CWE-208) | Secrets or signatures compared with `==` | `== .*token\|=== .*signature\|== .*hmac` | Comparison uses a constant-time function |

## Medium: data exposure

| Vulnerability | What to look for | Grep | Harmless test |
|---|---|---|---|
| Sensitive data in logs (CWE-532) | Passwords, tokens, full request bodies or personal data logged | `console.log\|logger\.\|log.info\|print(` with `req.body`, `password`, `token` | Logging a login request doesn't contain the password |
| Error leakage (CWE-209) | Stack traces, SQL errors or internal paths returned to the client; debug mode on in production config | `stack\|DEBUG = True\|debug: true\|res.send(err` | A failing request returns a generic error, not the stack trace |
| Overly broad responses (CWE-213) | Whole records serialized to the client, including password hashes, tokens, other users' data | `res.json(user\|to_json\|serialize` | The user endpoint response has no `password` or token fields |
| Webhook without signature check (CWE-345) | Incoming webhooks processed without verifying the provider's signature | Webhook handlers | A webhook with a wrong signature is rejected |

## Medium: web

| Vulnerability | What to look for | Grep | Harmless test |
|---|---|---|---|
| XSS (CWE-79) | Untrusted input rendered without escaping | `innerHTML\|dangerouslySetInnerHTML\|v-html\|html_safe\|raw(\|\|safe\|{!! \|document.write` | `<b>` in the input comes back escaped |
| Open redirect (CWE-601) | Redirect targets taken from the request (`next`, `returnUrl`, `redirect`) | `redirect(req\|redirect_to params\|returnUrl\|next=` | An external URL as redirect target is refused or replaced with a local one |
| Permissive CORS (CWE-942) | `Access-Control-Allow-Origin: *` with credentials, or the request origin reflected as is | `Access-Control-Allow-Origin\|cors(\|origin: true` | A request from an unlisted origin gets no CORS allow header |
| Unbounded input (CWE-400, CWE-770) | Uploads, request bodies, pagination or regexes without limits | `limit\|maxFileSize\|per_page\|new RegExp(` | An oversized upload or page size is refused |
