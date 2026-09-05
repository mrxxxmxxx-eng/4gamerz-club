const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json;charset=utf-8",
      ...headers
    }
  });

const b64u = (b) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function hmac(secret, text) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign", "verify"]
  );

  return crypto.subtle.sign(
    "HMAC",
    k,
    new TextEncoder().encode(text)
  );
}

async function session(secret) {
  const body = `${Date.now()}:${crypto.randomUUID()}`;

  return (
    b64u(new TextEncoder().encode(body)) +
    "." +
    b64u(await hmac(secret, body))
  );
}

async function admin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return false;
  }

  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|; )session=([^;]+)/);

  if (!match) {
    return false;
  }

  try {
    const [p, s] = match[1].split(".");

    if (!p || !s) {
      return false;
    }

    const pad = (x) =>
      "=".repeat((4 - (x.length % 4)) % 4);

    const raw = atob(
      p.replace(/-/g, "+").replace(/_/g, "/") + pad(p)
    );

    const body = new TextDecoder().decode(
      Uint8Array.from(raw, (c) => c.charCodeAt(0))
    );

    const time = Number(body.split(":")[0]);

    if (!time || Date.now() - time > 43200000) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.SESSION_SECRET),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

    const sig = atob(
      s.replace(/-/g, "+").replace(/_/g, "/") + pad(s)
    );

    return crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(sig, (c) => c.charCodeAt(0)),
      new TextEncoder().encode(body)
    );
  } catch {
    return false;
  }
}

function img64(buffer) {
  const a = new Uint8Array(buffer);
  let s = "";

  for (let i = 0; i < a.length; i += 32768) {
    s += String.fromCharCode(
      ...a.subarray(i, i + 32768)
    );
  }

  return btoa(s);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // LOGIN
    if (
      path === "/api/login" &&
      request.method === "POST"
    ) {
      try {
        if (!env.ADMIN_PASSWORD) {
          return json(
            { error: "ADMIN_PASSWORD غير موجود" },
            500
          );
        }

        if (!env.SESSION_SECRET) {
          return json(
            { error: "SESSION_SECRET غير موجود" },
            500
          );
        }

        const d = await request.json();

        if (d.password !== env.ADMIN_PASSWORD) {
          return json(
            { error: "الباسورد غير صحيح" },
            401
          );
        }

        const s = await session(env.SESSION_SECRET);

        return json(
          { ok: true },
          200,
          {
            "set-cookie":
              `session=${s}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`
          }
        );
      } catch (e) {
        return json(
          { error: "LOGIN ERROR: " + e.message },
          500
        );
      }
    }

    // LOGOUT
    if (
      path === "/api/logout" &&
      request.method === "POST"
    ) {
      return json(
        { ok: true },
        200,
        {
          "set-cookie":
            "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
        }
      );
    }

    // GET CONFIG
    if (
      path === "/api/config" &&
      request.method === "GET"
    ) {
      try {
        if (!env.DB) {
          return json(
            { error: "D1 binding DB غير موجود" },
            500
          );
        }

        const c = await env.DB
          .prepare(
            "SELECT data FROM config WHERE id=1"
          )
          .first();

        const r = await env.DB
          .prepare(
            "SELECT id,object_key,url,alt,created_at FROM images ORDER BY id DESC"
          )
          .all();

        return json(
          {
            config: c ? JSON.parse(c.data) : {},
            images: r.results || []
          },
          200,
          {
            "cache-control": "no-store"
          }
        );
      } catch (e) {
        return json(
          {
            error:
              "CONFIG ERROR: " + e.message
          },
          500
        );
      }
    }

    // UPDATE CONFIG
    if (
      path === "/api/config" &&
      request.method === "PUT"
    ) {
      if (!await admin(request, env)) {
        return json(
          { error: "غير مصرح" },
          401
        );
      }

      try {
        const d = await request.json();

        const prices = Array.isArray(d.prices)
          ? d.prices
              .slice(0, 12)
              .map((p) => ({
                name: String(p.name || ""),
                hours: String(p.hours || ""),
                price: Number(p.price || 0)
              }))
          : [];

        const clean = {
          siteName: String(
            d.siteName || "4Gamerz Club"
          ).slice(0, 100),

          phone: String(
            d.phone || ""
          ).slice(0, 40),

          whatsapp: String(
            d.whatsapp || ""
          )
            .replace(/\D/g, "")
            .slice(0, 20),

          announcement: String(
            d.announcement || ""
          ).slice(0, 100),

          address: String(
            d.address || ""
          ).slice(0, 200),

          addressLine: String(
            d.addressLine || ""
          ).slice(0, 200),

          mapsQuery: String(
            d.mapsQuery || ""
          ).slice(0, 300),

          prices
        };

        await env.DB
          .prepare(
            "UPDATE config SET data=?,updated_at=CURRENT_TIMESTAMP WHERE id=1"
          )
          .bind(JSON.stringify(clean))
          .run();

        return json({
          ok: true,
          config: clean
        });
      } catch (e) {
        return json(
          {
            error:
              "SAVE ERROR: " + e.message
          },
          500
        );
      }
    }

    // UPLOAD IMAGE
    if (
      path === "/api/images" &&
      request.method === "POST"
    ) {
      if (!await admin(request, env)) {
        return json(
          { error: "غير مصرح" },
          401
        );
      }

      try {
        const form = await request.formData();
        const f = form.get("file");

        if (!(f instanceof File)) {
          return json(
            { error: "اختار صورة" },
            400
          );
        }

        if (!f.type.startsWith("image/")) {
          return json(
            { error: "الملف لازم يكون صورة" },
            400
          );
        }

        if (f.size > 1048576) {
          return json(
            { error: "الحد الأقصى 1MB" },
            400
          );
        }

        const data =
          `data:${f.type};base64,${img64(await f.arrayBuffer())}`;

        await env.DB
          .prepare(
            "INSERT INTO images(object_key,url,alt) VALUES(?,?,?)"
          )
          .bind(
            "gallery/" + crypto.randomUUID(),
            data,
            String(
              form.get("alt") ||
              "4Gamerz Club"
            )
          )
          .run();

        return json({ ok: true });
      } catch (e) {
        return json(
          {
            error:
              "UPLOAD ERROR: " + e.message
          },
          500
        );
      }
    }

    // DELETE IMAGE
    const match = path.match(
      /^\/api\/images\/(\d+)$/
    );

    if (
      match &&
      request.method === "DELETE"
    ) {
      if (!await admin(request, env)) {
        return json(
          { error: "غير مصرح" },
          401
        );
      }

      try {
        await env.DB
          .prepare(
            "DELETE FROM images WHERE id=?"
          )
          .bind(Number(match[1]))
          .run();

        return json({ ok: true });
      } catch (e) {
        return json(
          {
            error:
              "DELETE ERROR: " + e.message
          },
          500
        );
      }
    }

    // ADMIN PAGE
    if (path === "/admin") {
      return env.ASSETS.fetch(
        new Request(
          new URL("/admin.html", request.url),
          {
            method: "GET"
          }
        )
      );
    }

    // EVERYTHING ELSE
    return env.ASSETS.fetch(request);
  }
};
