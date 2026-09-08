#!/bin/bash

# Knotic Deployment Script for Ubuntu 24.04 LTS
# Usage: bash deploy.sh

set -e

echo "======================================"
echo "  Knotic Deployment Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Step 1: System Updates
echo ""
echo -e "${YELLOW}Step 1: System Updates${NC}"
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl wget git build-essential python3-full python3-pip python3-venv nodejs npm
print_status "System updated"

# Step 2: Install Node.js
echo ""
echo -e "${YELLOW}Step 2: Checking Node.js${NC}"
if ! command -v node &> /dev/null; then
    print_warning "Node.js not found, installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
print_status "Node.js $(node --version) installed"

# Step 3: Install Bun
echo ""
echo -e "${YELLOW}Step 3: Installing Bun${NC}"
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
    echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
fi
print_status "Bun installed"

# Step 4: Clone Repository
echo ""
echo -e "${YELLOW}Step 4: Cloning Repository${NC}"
cd ~
mkdir -p CoddyIO
cd CoddyIO

if [ ! -d "Knotic" ]; then
    print_warning "Cloning Knotic repository..."
    read -p "Enter GitHub token or press Enter for HTTPS: " GIT_TOKEN
    if [ -z "$GIT_TOKEN" ]; then
        git clone https://github.com/jatingarg850/Knotic.git
    else
        git clone https://$GIT_TOKEN@github.com/jatingarg850/Knotic.git
    fi
    print_status "Repository cloned"
else
    print_warning "Repository already exists, pulling latest changes..."
    cd Knotic
    git pull
    cd ..
fi

# Step 5: Setup Environment Variables
echo ""
echo -e "${YELLOW}Step 5: Environment Variables${NC}"
print_warning "Please configure the following environment files:"
echo ""

# Both templates are copied from the tracked .env.example files rather than
# hand-written here, so this script cannot drift out of sync with what the
# code actually reads (it previously listed ANTHROPIC_API_KEY,
# AGORA_CUSTOMER_ID/SECRET and REPLICATE_API_TOKEN — none of which
# server/src reads — while omitting GEMINI_API_KEY and MURF_API_KEY, which
# the interview panel and its voice cannot run without).

# Backend .env
if [ ! -f "Knotic/server/.env" ]; then
    print_warning "Creating server/.env from server/.env.example..."
    cp Knotic/server/.env.example Knotic/server/.env
    echo -e "${YELLOW}Edit ~/CoddyIO/Knotic/server/.env with your credentials${NC}"
else
    print_status "server/.env already exists"
fi

# Frontend .env
if [ ! -f "Knotic/web/.env" ]; then
    print_warning "Creating web/.env from web/.env.example..."
    cp Knotic/web/.env.example Knotic/web/.env
    # JWT_SECRET has no safe default (see web/src/lib/jwtSecret.ts) — generate
    # one so the file is not left with a placeholder that would crash every
    # authenticated request.
    JWT_SECRET_VALUE=$(openssl rand -base64 48)
    if grep -q '^JWT_SECRET=' Knotic/web/.env; then
        sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$JWT_SECRET_VALUE#" Knotic/web/.env
    else
        echo "JWT_SECRET=$JWT_SECRET_VALUE" >> Knotic/web/.env
    fi
    echo -e "${YELLOW}Edit ~/CoddyIO/Knotic/web/.env with your credentials${NC}"
else
    print_status "web/.env already exists"
fi

read -p "Press Enter after configuring .env files..."

# Step 6: Install Python Dependencies
echo ""
echo -e "${YELLOW}Step 6: Installing Python Dependencies${NC}"
cd ~/CoddyIO/Knotic/server

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
print_status "Python dependencies installed"

# Step 7: Install Node Dependencies
echo ""
echo -e "${YELLOW}Step 7: Installing Node Dependencies${NC}"
cd ~/CoddyIO/Knotic/web
bun install
print_status "Node dependencies installed"

# Step 8: Build Frontend
echo ""
echo -e "${YELLOW}Step 8: Building Frontend${NC}"
cd ~/CoddyIO/Knotic/web
bun run build
print_status "Frontend built"

# Step 9: Setup PM2
echo ""
echo -e "${YELLOW}Step 9: Setting up PM2${NC}"
sudo bun install -g pm2

cd ~/CoddyIO/Knotic

# Create ecosystem config
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'knotic-backend',
      script: './venv/bin/python',
      // No --reload: that flag is dev-only (file-watching adds overhead and
      // occasional flakiness under a process manager) and has no business in
      // a production ecosystem file. Restarting after a code change is what
      // `pm2 restart knotic-backend` (post-`git pull`) is for.
      args: '-m uvicorn src.server:app --host 0.0.0.0 --port 8000',
      cwd: '/root/CoddyIO/Knotic/server',
      env: {
        PYTHONUNBUFFERED: 1
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'knotic-frontend',
      script: 'bun',
      args: 'run start',
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

print_status "PM2 ecosystem configured"

# Step 10: Create logs directory
mkdir -p ~/CoddyIO/Knotic/logs
chmod 755 ~/CoddyIO/Knotic/logs
print_status "Logs directory created"

# Step 11: Start Services
echo ""
echo -e "${YELLOW}Step 11: Starting Services${NC}"
cd ~/CoddyIO/Knotic
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/local/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
print_status "Services started with PM2"

# Step 12: Display Status
echo ""
echo -e "${YELLOW}Step 12: Verifying Deployment${NC}"
pm2 status
print_status "Deployment Complete!"

echo ""
echo "======================================"
echo -e "${GREEN}Deployment Successful!${NC}"
echo "======================================"
echo ""
echo "Services are running:"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo ""
echo "Useful commands:"
echo "  pm2 status          - Check service status"
echo "  pm2 logs            - View logs"
echo "  pm2 restart all     - Restart services"
echo "  pm2 stop all        - Stop services"
echo ""
echo "Access your application at:"
echo "  http://$(hostname -I | awk '{print $1}'):3000"
echo ""
