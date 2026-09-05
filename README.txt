4Gamerz Club — Admin Ready (Cloudflare Worker + D1 + R2)

المشروع ده يحول الموقع إلى نسخة فيها لوحة تحكم حقيقية.

مهم: لازم تنشئ D1 Database وR2 Bucket على Cloudflare مرة واحدة، ثم تنشر Worker.

1) ثبّت Wrangler:
   npm i -g wrangler
   wrangler login

2) من داخل فولدر المشروع:
   wrangler d1 create 4gamerz-club
   wrangler r2 bucket create 4gamerz-images

3) انسخ database_id الذي أعطاك Cloudflare وضعه مكان REPLACE_WITH_YOUR_D1_DATABASE_ID في wrangler.toml.

4) أنشئ الجداول:
   wrangler d1 migrations apply 4gamerz-club --remote

5) باسورد لوحة التحكم الذي اخترته: ahmedgamer123123
   ضعه كـ Secret على Cloudflare بالأمر:
   wrangler secret put ADMIN_PASSWORD
   ثم اكتب: ahmedgamer123123
   وبعدها:
   wrangler secret put SESSION_SECRET
   SESSION_SECRET يكون نص عشوائي طويل (مثلاً 40+ حرف).

6) انشر:
   wrangler deploy

بعد النشر:
   https://YOUR-WORKER.workers.dev/admin

الموقع العام سيستخدم /api/config لجلب الأسعار والعنوان والرقم والصور.

ملاحظة: زر Admin صغير في أسفل اليمين. الحماية الحقيقية تتم في Worker، وليس JavaScript في المتصفح.
