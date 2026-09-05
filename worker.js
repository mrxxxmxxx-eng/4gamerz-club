const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });

const b64u = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64u = (s) =>
  Uint8Array.from(
    atob(s.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - s.length % 4) % 4)),
    c => c.charCodeAt(0)
  );

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(text)
  );
}

async function makeSession(secret) {
  const body = `${Date.now()}:${crypto.randomUUID()}`;
  return `${b64u(new TextEncoder().encode(body))}.${b64u(
    await hmac(secret, body)
  )}`;
}

async function validSession(request, secret) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|; )session=([^;]+)/);

  if (!match) return false;

  const [payload, sig] = match[1].split(".");
  if (!payload || !sig) return false;

  try {
    const body = new TextDecoder().decode(fromB64u(payload));
    const [time] = body.split(":");

    if (!time || Date.now() - Number(time) > 1000 * 60 * 60 * 12)
      return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    return crypto.subtle.verify(
      "HMAC",
      key,
      fromB64u(sig),
      new TextEncoder().encode(body)
    );
  } catch {
    return false;
  }
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return false;
  return validSession(request, env.SESSION_SECRET);
}

async function getConfig(env) {
  const row = await env.DB
    .prepare("SELECT data FROM config WHERE id=1")
    .first();

  return row ? JSON.parse(row.data) : {};
}

async function getImages(env) {
  const { results } = await env.DB
    .prepare(
      "SELECT id, object_key, url, alt, created_at FROM images ORDER BY id DESC"
    )
    .all();

  return results || [];
}

function corsHeaders() {
  return {
    "cache-control": "no-store"
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length))
    );
  }

  return btoa(binary);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/config" && request.method === "GET") {
      return json(
        {
          config: await getConfig(env),
          images: await getImages(env)
        },
        200,
        corsHeaders()
      );
    }

    if (path === "/api/login" && request.method === "POST") {
      try {
        const { password } = await request.json();

        if (
          !env.ADMIN_PASSWORD ||
          password !== env.ADMIN_PASSWORD
        ) {
          return json(
            { ok: false, error: "الباسورد غير صحيح" },
            401
          );
        }

        const session = await makeSession(env.SESSION_SECRET);

        return json(
          { ok: true },
          200,
          {
            "set-cookie":
              `session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`
          }
        );
      } catch {
        return json(
          { ok: false, error: "طلب غير صالح" },
          400
        );
      }
    }

    if (path === "/api/logout" && request.method === "POST") {
      return json(
        { ok: true },
        200,
        {
          "set-cookie":
            "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
        }
      );
    }

    if (path === "/api/config" && request.method === "PUT") {
      if (!await requireAdmin(request, env)) {
        return json({ error: "غير مصرح" }, 401);
      }

      try {
        const data = await request.json();

        const prices = Array.isArray(data.prices)
          ? data.prices.map(p => ({
              name: String(p.name || ""),
              hours: String(p.hours || ""),
              price: Number(p.price || 0)
            }))
          : [];

        const clean = {
          siteName: String(
            data.siteName || "4Gamerz Club"
          ).slice(0, 100),

          phone: String(
            data.phone || ""
          ).slice(0, 40),

          whatsapp: String(
            data.whatsapp || ""
          ).replace(/\D/g, "").slice(0, 20),

          address: String(
            data.address || ""
          ).slice(0, 200),

          addressLine: String(
            data.addressLine || ""
          ).slice(0, 200),

          mapsQuery: String(
            data.mapsQuery || ""
          ).slice(0, 300),

          announcement: String(
            data.announcement || ""
          ).slice(0, 100),

          prices: prices.slice(0, 12)
        };

        await env.DB
          .prepare(
            "UPDATE config SET data=?, updated_at=CURRENT_TIMESTAMP WHERE id=1"
          )
          .bind(JSON.stringify(clean))
          .run();

        return json({
          ok: true,
          config: clean
        });
      } catch {
        return json(
          { error: "تعذر حفظ البيانات" },
          400
        );
      }
    }

    if (path === "/api/images" && request.method === "POST") {
      if (!await requireAdmin(request, env)) {
        return json({ error: "غير مصرح" }, 401);
      }

      const form = await request.formData();
      const file = form.get("file");

      if (!(file instanceof File)) {
        return json({ error: "اختار صورة" }, 400);
      }

      if (!file.type.startsWith("image/")) {
        return json(
          { error: "الملف لازم يكون صورة" },
          400
        );
      }

      if (file.size > 1024 * 1024) {
        return json(
          { error: "الحد الأقصى للصورة 1MB" },
          400
        );
      }

      const base64 = arrayBufferToBase64(
        await file.arrayBuffer()
      );

      const dataUrl =
        `data:${file.type};base64,${base64}`;

      const key =
        `gallery/${crypto.randomUUID()}`;

      await env.DB
        .prepare(
          "INSERT INTO images (object_key,url,alt) VALUES (?,?,?)"
        )
        .bind(
          key,
          dataUrl,
          String(
            form.get("alt") || "4Gamerz Club"
          )
        )
        .run();

      return json({
        ok: true,
        url: dataUrl
      });
    }

    const imageMatch =
      path.match(/^\/api\/images\/(\d+)$/);

    if (
      imageMatch &&
      request.method === "DELETE"
    ) {
      if (!await requireAdmin(request, env)) {
        return json(
          { error: "غير مصرح" },
          401
        );
      }

      const id = Number(imageMatch[1]);

      const row = await env.DB
        .prepare(
          "SELECT id FROM images WHERE id=?"
        )
        .bind(id)
        .first();

      if (!row) {
        return json(
          { error: "الصورة غير موجودة" },
          404
        );
      }

      await env.DB
        .prepare(
          "DELETE FROM images WHERE id=?"
        )
        .bind(id)
        .run();

      return json({ ok: true });
    }

    if (path === "/admin") {
      return env.ASSETS.fetch(
        new Request(
          new URL("/admin.html", request.url),
          request
        )
      );
    }

    return env.ASSETS.fetch(request);
  }
};
