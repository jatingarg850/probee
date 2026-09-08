# Knotic Deployment Guide - Ubuntu 24.04 LTS

This guide covers deploying Knotic to an Ubuntu server (tested on 200.97.169.116).

## Prerequisites

The server should have:
- Ubuntu 24.04 LTS
- SSH access
- `sudo` privileges

## Step 1: System Updates

```bash
ssh root@200.97.169.116
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl wget git build-essential python3-full python3-pip python3-venv nodejs npm
```

## Step 2: Install Node.js and npm (if not already installed)

```bash
# Using NodeSource repository for latest Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

## Step 3: Install Bun (for package management)

```bash
curl -fsSL https://bun.sh/install | bash
# Add bun to PATH
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
bun --version
```

Or add to `~/.bashrc`:
```bash
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

## Step 4: Clone the Repository

```bash
cd ~
mkdir -p CoddyIO
cd CoddyIO

# Using SSH key (recommended - set up SSH key first)
git clone git@github.com:jatingarg850/Knotic.git

# Or using HTTPS with token
git clone https://<YOUR_GITHUB_TOKEN>@github.com/jatingarg850/Knotic.git
```

## Step 5: Setup Environment Variables

### Backend (.env)

```bash
cd ~/CoddyIO/Knotic/server
nano .env
```

Start from the tracked template rather than typing these by hand — it is the
single source of truth for what `server/src` actually reads, and it will not
silently drift out of date the way a copy-pasted list in this doc would:
```bash
cp .env.example .env
nano .env
```
See `server/.env.example` for the full, commented list (Agora, Gemini, Murf,
CORS, and the optional panel-timing knobs). At minimum you need
`AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `GEMINI_API_KEY`, `MURF_API_KEY`, and
`CORS_ALLOWED_ORIGINS` set to your real frontend origin.

Save and exit (Ctrl+X, Y, Enter in nano)

### Frontend (.env)

```bash
cd ~/CoddyIO/Knotic/web
cp .env.example .env
nano .env
```

Same reasoning — `web/.env.example` is the tracked, commented template, and
this guide does not duplicate its contents. Generate `JWT_SECRET` and
`NEXTAUTH_SECRET` (both required, neither has a safe default):
```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # NEXTAUTH_SECRET
```
Set `NEXTAUTH_URL` to this server's real public URL (not localhost) and
`NEXT_PUBLIC_APP_URL`/`AGENT_BACKEND_URL` to match your actual deployment —
see `web/src/lib/backendUrl.ts` for how the backend URL is resolved.

Save and exit

## Step 6: Install Python Dependencies (Backend)

```bash
cd ~/CoddyIO/Knotic/server

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install requirements
pip install -r requirements.txt

# Verify installation
python --version
```

## Step 7: Install Node Dependencies (Frontend)

```bash
cd ~/CoddyIO/Knotic/web
bun install
```

Bun, not npm — see `CLAUDE.md`: mixing package managers here produces a
`package-lock.json` alongside the tracked `bun.lock`, which is how the two
end up resolving different dependency versions.

## Step 8: Build Frontend

```bash
cd ~/CoddyIO/Knotic/web
bun run build
```

## Step 9: Setup PM2 for Process Management

```bash
sudo bun install -g pm2

# Create PM2 ecosystem file
cd ~/CoddyIO/Knotic
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'knotic-backend',
      script: 'server/src/server.py',
      interpreter: 'python3',
      interpreter_args: '-m uvicorn src.server:app --host 0.0.0.0 --port 8000',
      cwd: '/root/CoddyIO/Knotic/server',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'knotic-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: '/root/CoddyIO/Knotic/web',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
EOF
```

## Step 10: Create Logs Directory

```bash
mkdir -p ~/CoddyIO/Knotic/logs
chmod 755 ~/CoddyIO/Knotic/logs
```

## Step 11: Start Services with PM2

```bash
cd ~/CoddyIO/Knotic

# Start all services
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs

# Save PM2 config to auto-restart on reboot
pm2 startup
pm2 save
```

## Step 12: Setup Nginx Reverse Proxy (Optional but Recommended)

```bash
sudo apt install -y nginx

# Backup original config
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak

# Create new config
sudo nano /etc/nginx/sites-available/default
```

Replace with:
```nginx
upstream backend {
    server 127.0.0.1:8000;
}

upstream frontend {
    server 127.0.0.1:3000;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    server_name 200.97.169.116;
    
    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and test:
```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl start nginx
```

## Step 13: Setup HTTPS with Let's Encrypt (Optional)

```bash
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d 200.97.169.116

# Auto-renew
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## Step 14: Verify Deployment

```bash
# Check PM2 services
pm2 status

# Check Nginx
sudo systemctl status nginx

# Test endpoints
curl http://200.97.169.116:8000/health
curl http://200.97.169.116:3000/

# View logs
pm2 logs knotic-backend
pm2 logs knotic-frontend
```

## Useful Commands

```bash
# Check service status
pm2 status

# View real-time logs
pm2 logs

# Stop all services
pm2 stop all

# Restart all services
pm2 restart all

# Stop PM2 daemon
pm2 kill

# Reload Nginx
sudo systemctl reload nginx

# SSH into server and check processes
ps aux | grep node
ps aux | grep python
```

## Troubleshooting

### Port already in use
```bash
# Find process using port
sudo lsof -i :8000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

### Python virtual environment issues
```bash
cd ~/CoddyIO/Knotic/server
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Node modules issues
```bash
cd ~/CoddyIO/Knotic/web
rm -rf node_modules
bun install
```

### Check system resources
```bash
top
df -h
free -h
```

## Environment Variables Reference

The full, accurate, commented lists live in `server/.env.example` and
`web/.env.example` — they are what `server/src` and `web/src`/`web/app`
actually read, checked against the source directly. This section is a
pointer to those, not a second copy, so it cannot go stale the way the
previous version of this list did (it named `ANTHROPIC_API_KEY`,
`AGORA_CUSTOMER_ID`/`AGORA_CUSTOMER_SECRET` and `REPLICATE_API_TOKEN`, none
of which any code in this repo reads, while omitting `GEMINI_API_KEY` and
`MURF_API_KEY`, without which the interview panel cannot start at all — and
MongoDB is only used by the Next.js app, never by the Python backend, so
`MONGODB_URI` belongs in `web/.env`, not `server/.env`).

The only backend variable worth calling out specifically here:
`CORS_ALLOWED_ORIGINS` — set it to this deployment's real frontend origin(s),
comma-separated. Left unset, the backend only accepts `NEXT_PUBLIC_APP_URL`
or falls back to `http://localhost:3000`, which is correct for local dev but
means no other origin can call it directly in production.

## Post-Deployment

1. **Backup database regularly**
   ```bash
   # Add to cron
   0 2 * * * mongodump --uri="mongodb://..." --out=/backup/mongodb-$(date +\%Y\%m\%d)
   ```

2. **Monitor logs**
   ```bash
   pm2 logs --lines 100
   ```

3. **Setup automatic updates**
   ```bash
   sudo apt install -y unattended-upgrades
   sudo dpkg-reconfigure unattended-upgrades
   ```

4. **Setup firewall**
   ```bash
   sudo ufw enable
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw status
   ```

## Support

For issues, check:
1. PM2 logs: `pm2 logs`
2. Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. System logs: `sudo journalctl -xe`
