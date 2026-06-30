// Pages Function — same-origin proxy to the `mycouch` worker.
//
// Browser issues `https://roady.argw.com/__api__/<rest>`; this Function
// strips the `/__api__/` prefix and forwards `<rest>` (preserving method,
// query, headers, body, and the `Upgrade: websocket` header) to the
// `MYCOUCH` service binding declared in `wrangler.toml`. The bound worker
// sees the request path as `/<rest>`, so its MNA1 envelope verification
// (which signs against the relative path it observes) matches the URL the
// client signed against (also `/<rest>`).
//
// E.14 architecture: no CORS, no wildcard origin, no second worker — just
// service-to-service forwarding inside Cloudflare's edge.

export async function onRequest({ request, env }) {
    const inUrl = new URL(request.url);
    const stripped = inUrl.pathname.replace(/^\/__api__/, '') || '/';
    const targetUrl = stripped + inUrl.search;
    const target = new URL(targetUrl, inUrl.origin).toString();
    // `new Request(url, request)` preserves method, headers (including
    // Upgrade), and body. Service bindings honor WS upgrade end-to-end.
    const proxied = new Request(target, request);
    return env.MYCOUCH.fetch(proxied);
}
