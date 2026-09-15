# Single-server deployment

This guide uses an Ubuntu/Debian server, including an Alibaba Cloud ECS instance. Nginx serves the frontend, PM2 runs the Node.js backend, and PostgreSQL runs on the same machine. A managed PostgreSQL service can be used by changing `DATABASE_URL`.

## 1. Network access

Allow SSH on port `22` from your administration IP, HTTP on `80`, and HTTPS on `443`. Keep PostgreSQL and the backend port `4000` private. Use HTTPS for a deployment that handles real credentials and company data.

## 2. Install the runtime

Install Node.js 22 or later and npm using your server's supported installation method. Install the other services:

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-contrib
sudo npm install -g pm2
```

Package installation commands differ on other Linux distributions.

## 3. Create a database

Open a PostgreSQL administration session:

```bash
sudo -u postgres psql
```

Replace the example password before running this SQL:

```sql
CREATE USER order_user WITH PASSWORD 'replace_with_a_strong_password';
CREATE DATABASE order_system OWNER order_user;
GRANT ALL PRIVILEGES ON DATABASE order_system TO order_user;
\q
```

## 4. Upload the application

Use `/var/www/order-system` as the application directory, or update the supplied Nginx paths to match your location. Run this example from the English project's root directory, replacing the destination user and host:

```bash
rsync -av \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude .env --exclude '.env.*' --include .env.example \
  --exclude uploads --exclude '*.log' \
  ./ deploy@example.com:/var/www/order-system/
```

Create the destination directory with appropriate ownership before uploading. Alternatively, clone your GitHub repository into that directory. Do not upload local credentials or business documents with the source code.

## 5. Configure the environment

On the server:

```bash
cd /var/www/order-system
cp deploy/frontend.env.production.example frontend/.env.production
cp deploy/backend.env.production.example backend/.env
```

Edit `backend/.env`:

- `HOST=127.0.0.1` keeps the backend behind Nginx.
- Set `CORS_ORIGIN` to your frontend origin, such as `https://orders.example.com`.
- Set `DATABASE_URL` to your actual database credentials.
- Replace `JWT_SECRET` with a long random secret.
- Set `FILE_BASE_URL` to your public upload URL, such as `https://orders.example.com/uploads`.
- Configure `DASHSCOPE_API_KEY` only if you intend to use the AI assistant.

Keep `VITE_API_BASE_URL=/api` for a same-origin deployment.

## 6. Install, initialize, and build

```bash
cd /var/www/order-system
npm ci
npm run prisma:generate
```

For a **new, empty database only**, create the schema:

```bash
npm exec --workspace backend -- prisma db push
```

There is no complete Prisma migration history in this repository. The files in `backend/prisma/manual-migrations/` are targeted updates for older installations. Review and test database changes against a backup before upgrading an existing installation; do not apply schema synchronization as an unattended production update.

Then build and create runtime directories:

```bash
npm run build
mkdir -p backend/uploads backend/logs
```

Provision your first account using the [First login instructions](../README.md#first-login). No default account or password is included.

## 7. Start the backend

```bash
cd /var/www/order-system
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run the system-specific command printed by `pm2 startup` to enable startup after reboot.

Check the process:

```bash
curl http://127.0.0.1:4000/health
```

The expected response is `{"status":"ok"}`. This endpoint confirms that the HTTP server responds; it does not check database connectivity or AI provider access.

## 8. Configure Nginx and HTTPS

```bash
sudo cp /var/www/order-system/deploy/nginx-order-system.conf /etc/nginx/sites-available/order-system
sudo ln -s /etc/nginx/sites-available/order-system /etc/nginx/sites-enabled/order-system
```

In the copied configuration, replace `server_name example.com;` with your domain and verify the frontend root path. The supplied file is an HTTP example. Add the TLS certificate and HTTPS listener using your hosting environment's certificate tooling before entering real credentials.

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Open your configured site URL. The application currently serves `/uploads` as static files; an individual file URL does not require a login. Review this behavior against your company's document access requirements before public exposure.

## 9. Update an existing deployment

Back up the database and uploaded files. Deploy the reviewed source changes and any separately reviewed database updates, then:

```bash
cd /var/www/order-system
npm ci
npm run prisma:generate
npm run build
pm2 restart order-system-backend
```

Reload Nginx only if its configuration changed. Keep the runtime `.env` file and uploaded business files outside source control.

## 10. Troubleshooting

```bash
pm2 status
pm2 logs order-system-backend
curl http://127.0.0.1:4000/health
sudo nginx -t
sudo tail -n 100 /var/log/nginx/error.log
```

If login fails on a new installation, confirm that the database has an active user with a bcrypt password hash. If browser requests fail, check `CORS_ORIGIN`, the frontend API base URL, and the Nginx proxy paths.
